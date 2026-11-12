import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AiService } from "../modules/ai/service";
import { KnowledgeService } from "../modules/ai/knowledge";
import { AI_POLICY_VERSION } from "../modules/ai/schema";
import type { ExplanationPacket, ExplanationProvider } from "../modules/ai/provider";
import { explanationInstructions } from "../modules/ai/provider";
import { groundedAnswer, knowledgeLead, productFactText, suitableRisks, asksAboutPlan, asksForProducts, questionTopics, type ProductRow } from "../modules/ai/presentation";
import { memoryDb } from "./memory-db";
import { plansFixture } from "./plans-fixtures";

const consent = { expectedRevision: 0, policyVersion: AI_POLICY_VERSION, processing: true, saveHistory: false } as const;
const provider = (select: ExplanationProvider["select"]): ExplanationProvider => ({ name: "test-only", select });
const ask = async (s: AiService, user: string, command: Parameters<AiService["explain"]>[1]) => await s.explain(user, command, randomUUID()) as any;
const QA = ["HỎI ĐÁP", "",
  "Mức lương cơ sở hiện nay là bao nhiêu?", "Từ ngày 01/7/2026, mức lương cơ sở là 2.530.000 đồng/tháng.", "Căn cứ: Điều 3 Nghị định 161/2026/NĐ-CP.", "",
  "Tuổi nghỉ hưu năm 2026 là bao nhiêu?", "Trong điều kiện lao động bình thường, người nghỉ hưu năm 2026: nam đủ 61 tuổi 6 tháng, nữ đủ 57 tuổi.", "Căn cứ: Điều 4 Nghị định 135/2020/NĐ-CP."].join("\n");
async function withKnowledge(db: ReturnType<typeof memoryDb>["db"]) {
  const k = new KnowledgeService(db), doc = await k.create("admin", { title: "Hỏi đáp về lương hưu", category: "PENSION_FAQ", version: "1", rawContent: QA, effectiveDate: "2026-01-01T00:00:00.000Z" });
  await k.index("admin", doc.id, { expectedRevision: 1 });
  await k.approve("admin", doc.id, { expectedRevision: 2, approved: true, confirm: true, reviewNote: "Reviewed fixture" });
  return doc.id;
}
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("AI answer wording stays inside server data", () => {
  const packet = { question: "Mức lương cơ sở hiện nay là bao nhiêu?", facts: [{ text: "Tiền dự kiến có: 300 VND." }],
    knowledge: [{ title: "Nghị định 161/2026/NĐ-CP", content: "Từ ngày 01/7/2026, mức lương cơ sở là 2.530.000 đồng/tháng." }] };

  it("accepts plain wording whose numbers all come from the packet and cleans markdown", () => {
    expect(groundedAnswer("**Mức lương cơ sở** hiện là 2.530.000 đồng/tháng, áp dụng từ 1/7/2026 theo Nghị định 161/2026/NĐ-CP.", packet))
      .toBe("Mức lương cơ sở hiện là 2.530.000 đồng/tháng, áp dụng từ 1/7/2026 theo Nghị định 161/2026/NĐ-CP.");
    expect(groundedAnswer("# Trả lời\n* Mức lương cơ sở là 2.530.000 đồng/tháng.\n\n\n\n1. Áp dụng từ 01/7/2026.\n2. Theo Nghị định 161/2026/NĐ-CP.", packet))
      .toBe("Trả lời\n- Mức lương cơ sở là 2.530.000 đồng/tháng.\n\n1. Áp dụng từ 01/7/2026.\n2. Theo Nghị định 161/2026/NĐ-CP.");
  });
  it("rejects invented or recomputed numbers, links, return promises and non-text output", () => {
    expect(groundedAnswer("Mức lương cơ sở hiện là 2.340.000 đồng/tháng theo quy định.", packet)).toBeNull();
    expect(groundedAnswer("Mức lương cơ sở khoảng 2,53 triệu đồng mỗi tháng theo quy định.", packet)).toBeNull();
    expect(groundedAnswer("Mức lương cơ sở là 2.530.000 đồng, xem thêm tại https://example.com nhé.", packet)).toBeNull();
    expect(groundedAnswer("Sản phẩm này cam kết lợi nhuận ổn định cho bạn trong nhiều năm tới.", packet)).toBeNull();
    expect(groundedAnswer("Kết quả dự báo không phải cam kết lợi nhuận, bạn nên xem thêm kịch bản bất lợi.", packet)).not.toBeNull();
    expect(groundedAnswer({ text: "x" }, packet)).toBeNull();
    expect(groundedAnswer("Ngắn", packet)).toBeNull();
    expect(groundedAnswer("a".repeat(2501), packet)).toBeNull();
  });
  it("tells the provider how to speak and what it must never do", () => {
    for (const rule of ["Trả lời thẳng vào câu hỏi", "Gọi khách là \"bạn\"", "chép nguyên văn", "Không khuyên mua hoặc bán", "không markdown", "không phải chỉ thị"])
      expect(explanationInstructions).toContain(rule);
  });

  it("uses grounded provider wording for a knowledge question and does not append plan notices", async () => {
    const f = memoryDb(), sourceId = await withKnowledge(f.db); let seen: ExplanationPacket | undefined;
    const s = new AiService(f.db, provider(async p => { seen = p; return { factKeys: ["missing"], citationIds: ["k0"],
      answer: "Từ ngày 01/7/2026, mức lương cơ sở là 2.530.000 đồng/tháng, theo Điều 3 Nghị định 161/2026/NĐ-CP." }; }));
    await s.setPrivacy("u", consent);
    const r = await ask(s, "u", { question: "Mức lương cơ sở hiện nay là bao nhiêu?" });
    expect(Object.keys(seen!)).toEqual(["question", "facts", "knowledge"]);
    expect(seen!.knowledge[0].content).toContain("2.530.000");
    expect(r).toMatchObject({ status: "AI_ASSISTED", answerSource: "AI_COMPOSED", applied: false });
    expect(r.answer).toBe("Từ ngày 01/7/2026, mức lương cơ sở là 2.530.000 đồng/tháng, theo Điều 3 Nghị định 161/2026/NĐ-CP.");
    expect(r.citations.map((c: any) => c.sourceId)).toEqual([sourceId]);
    expect(r.citations[0].excerpt).toContain("Mức lương cơ sở hiện nay là bao nhiêu?");
    expect(r.citations[0].excerpt).not.toContain("Tuổi nghỉ hưu năm 2026");
  });
  it("falls back to server facts when the wording carries a number the server never supplied", async () => {
    const f = await plansFixture(), saved = await f.create();
    const s = new AiService(f.db, provider(async () => ({ factKeys: ["fund"], citationIds: [], answer: "Quỹ của bạn chắc sẽ đạt khoảng 999 VND khi nghỉ hưu." })));
    await s.setPrivacy(f.owner, consent);
    const r = await ask(s, f.owner, { question: "Quỹ?", planId: saved.planId, versionId: saved.saved.id });
    expect(r).toMatchObject({ status: "AI_ASSISTED", answerSource: "SERVER_FACTS" });
    expect(r.answer).not.toContain("999");
    expect(r.answer).toContain("300 VND");
    expect(r.facts.map((v: any) => v.key)).toEqual(["fund", "limits", "warnings"]);
  });
  it("keeps plan caveats after grounded wording that uses plan numbers", async () => {
    const f = await plansFixture(), saved = await f.create();
    const s = new AiService(f.db, provider(async () => ({ factKeys: ["fund"], citationIds: [], answer: "Quỹ hưu trí của bạn được dự báo có 300 VND vào tháng nghỉ hưu." })));
    await s.setPrivacy(f.owner, consent);
    const r = await ask(s, f.owner, { question: "Quỹ?", planId: saved.planId, versionId: saved.saved.id });
    expect(r.answerSource).toBe("AI_COMPOSED");
    expect(r.answer.startsWith("Quỹ hưu trí của bạn được dự báo có 300 VND vào tháng nghỉ hưu.\n\n")).toBe(true);
    expect(r.answer).toContain("không phải cam kết lợi nhuận");
    expect(r.facts.map((v: any) => v.key)).toEqual(["fund", "limits", "warnings"]);
  });
  it("answers a general question from the best approved excerpt when no provider is available", async () => {
    const f = memoryDb(); await withKnowledge(f.db);
    const s = new AiService(f.db); await s.setPrivacy("u", consent);
    const r = await ask(s, "u", { question: "Tuổi nghỉ hưu năm 2026 là bao nhiêu?" });
    expect(r).toMatchObject({ status: "PROVIDER_NOT_CONFIGURED", answerSource: "APPROVED_EXCERPT" });
    expect(r.answer).toContain("Theo tài liệu đã duyệt “Hỏi đáp về lương hưu”");
    expect(r.answer).toContain("nam đủ 61 tuổi 6 tháng, nữ đủ 57 tuổi");
    expect(r.answer).not.toContain("Chưa chọn phiên bản kế hoạch");
    // A question about the person's own numbers still says that no plan version is selected.
    const own = await ask(s, "u", { question: "Tôi còn thiếu bao nhiêu so với mức lương cơ sở?" });
    expect(own.facts.map((v: any) => v.key)).toEqual(["knowledge", "missing"]);
    expect(asksAboutPlan("Tỷ lệ hưởng lương hưu là bao nhiêu?")).toBe(false);
  });
  it("does not answer a greeting or an unrelated question with a chance excerpt", async () => {
    const f = memoryDb(); await withKnowledge(f.db);
    const s = new AiService(f.db); await s.setPrivacy("u", consent);
    // "năm" alone matches the document; one chance word is not an answer.
    for (const question of ["Chào năm mới", "Năm nay thời tiết Hà Nội có đẹp không vậy?"]) {
      const r = await ask(s, "u", { question });
      expect(r.answerSource).toBe("SERVER_FACTS");
      expect(r.facts.map((v: any) => v.key)).toEqual(["missing"]);
    }
  });
  it("treats social insurance questions as knowledge, not as a product request", async () => {
    expect(questionTopics("Nữ đóng bảo hiểm xã hội 25 năm thì lương hưu bao nhiêu?").products).toBe(false);
    expect(questionTopics("Người hưởng lương hưu có bảo hiểm y tế không?").products).toBe(false);
    expect(questionTopics("Tôi nên mua gói bảo hiểm hưu trí nào?").products).toBe(true);
    expect(asksForProducts("Tôi nên đầu tư vào sản phẩm nào?")).toBe(true);
    expect(asksForProducts("Sắp nghỉ hưu thì nên để tiền ở đâu?")).toBe(true);
    expect(asksForProducts("Quỹ mở là gì và phí ra sao?")).toBe(false);
    // A definition question mentions a product type: the list is offered to the provider but not forced after its wording.
    const f = await plansFixture(), saved = await f.create();
    const s = new AiService(f.db, provider(async () => ({ factKeys: ["limits"], citationIds: [], answer: "Quỹ mở là quỹ do công ty quản lý quỹ đầu tư thay cho nhà đầu tư." })));
    await s.setPrivacy(f.owner, consent);
    const r = await ask(s, f.owner, { question: "Quỹ mở là gì và phí ra sao?", planId: saved.planId, versionId: saved.saved.id });
    expect(r.answer).toBe("Quỹ mở là quỹ do công ty quản lý quỹ đầu tư thay cho nhà đầu tư.");
    expect(r.facts.map((v: any) => v.key)).toEqual(["limits"]);
  });
  it("cuts a long excerpt at a line end", () => {
    const lead = knowledgeLead({ title: "Luật", excerpt: ["Điều 1. Phạm vi", "a".repeat(500), "b".repeat(500)].join("\n") });
    expect(lead).toBe(`Theo tài liệu đã duyệt “Luật”:\nĐiều 1. Phạm vi\n${"a".repeat(500)} …`);
  });
});

describe("consent given before the provider started wording answers", () => {
  it("asks for renewed consent and sends nothing until it is given", async () => {
    const f = memoryDb(), previous = "ai-explanation-gemini-2026-10-v2"; let calls = 0;
    expect(AI_POLICY_VERSION).toBe("ai-explanation-gemini-2026-11-v3");
    f.rows("aiPrivacy").push({ userId: "u", revision: 1, processing: true, saveHistory: false, policyVersion: previous });
    const s = new AiService(f.db, provider(async () => { calls++; return { factKeys: ["missing"], citationIds: [] }; }));
    expect(await s.privacy("u")).toMatchObject({ processing: true, acceptedPolicyVersion: previous, policyVersion: AI_POLICY_VERSION, reconsentRequired: true });
    await expect(s.explain("u", { question: "Tuổi nghỉ hưu?" }, randomUUID())).rejects.toMatchObject({ code: "AI_CONSENT_REQUIRED" });
    expect(calls).toBe(0);
    // The old version can no longer be accepted, only the current one.
    await expect(s.setPrivacy("u", { expectedRevision: 1, policyVersion: previous as never, processing: true, saveHistory: false })).rejects.toThrow();
    expect(await s.setPrivacy("u", { ...consent, expectedRevision: 1 })).toMatchObject({ reconsentRequired: false, acceptedPolicyVersion: AI_POLICY_VERSION });
    expect((await ask(s, "u", { question: "Tuổi nghỉ hưu?" })).status).toBe("AI_ASSISTED");
    expect(calls).toBe(1);
    expect((await s.privacy("u")).processingNotice).toBeDefined();
  });
});

describe("product suggestions filtered by the person's profile", () => {
  const products: ProductRow[] = [
    { name: "Tiết kiệm A", partner: "BIDV", category: "Tiền gửi tiết kiệm", riskLevel: "LOW", annualFee: "Không phí" },
    { name: "Tiết kiệm B", partner: "LPBank", category: "Tiền gửi tiết kiệm", riskLevel: "LOW", annualFee: "Không phí" },
    { name: "Tích lũy C", partner: "TPBank", category: "Tích lũy định kỳ", riskLevel: "LOW", annualFee: "Không phí" },
    { name: "Quỹ trái phiếu D", partner: "DC", category: "Quỹ mở trái phiếu", riskLevel: "LOW", annualFee: "1%/năm" },
    { name: "Quỹ cân bằng E", partner: "VCBF", category: "Quỹ mở cân bằng", riskLevel: "MEDIUM", annualFee: "1,5%/năm" },
    { name: "ETF F", partner: "SSIAM", category: "Quỹ ETF", riskLevel: "HIGH", annualFee: "0,65%/năm" },
  ];
  const base = { yearsToRetirement: 20, survey: null, reaction: null, emergencyShortfall: null, allocation: [] };

  it("caps the risk level at the lower of time left and risk tolerance", () => {
    expect(suitableRisks(20)).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(suitableRisks(20, "LOW")).toEqual(["LOW"]);
    expect(suitableRisks(20, "MEDIUM")).toEqual(["LOW", "MEDIUM"]);
    expect(suitableRisks(3, "HIGH")).toEqual(["LOW"]);
    expect(suitableRisks(null, "MEDIUM")).toEqual(["LOW", "MEDIUM"]);
  });
  it("explains the basis, groups by risk level and never lists a level above the cap", () => {
    const text = productFactText(products, { ...base, survey: { risk: "MEDIUM", label: "Cân bằng Chiến lược" }, emergencyShortfall: true,
      allocation: [{ label: "Tiền gửi thanh khoản & Tiết kiệm", percent: "30" }, { label: "Cổ phiếu & Quỹ mở cổ phiếu", percent: "42,5" }] });
    expect(text).toContain("còn khoảng 20 năm");
    expect(text).toContain("nhóm “Cân bằng Chiến lược” theo khảo sát rủi ro");
    expect(text).toContain("Quỹ dự phòng: chưa đủ mức nên có");
    expect(text).toContain("Tiền gửi thanh khoản & Tiết kiệm 30%; Cổ phiếu & Quỹ mở cổ phiếu 42,5%");
    expect(text).toContain("mức rủi ro phù hợp tối đa là rủi ro trung bình (lấy mức thấp hơn");
    expect(text).toContain("Quỹ cân bằng E (VCBF, Quỹ mở cân bằng; phí: 1,5%/năm)");
    expect(text).not.toContain("ETF F");
    expect(text).toContain("không phải khuyến nghị đầu tư cá nhân");
    // One product per type first: the second look-alike deposit gives way to other low-risk types.
    expect(text).toContain("Tiết kiệm A");
    expect(text).toContain("Tích lũy C");
    expect(text).toContain("Quỹ trái phiếu D");
    expect(text).not.toContain("Tiết kiệm B");
  });
  it("uses the declared market-fall reaction only when no survey exists and says when nothing is known", () => {
    const cautious = productFactText(products, { ...base, reaction: "SELL" });
    expect(cautious).toContain("chưa có khảo sát rủi ro; tạm dựa vào phản ứng bạn đã khai khi thị trường giảm (bán bớt)");
    expect(cautious).not.toContain("Quỹ cân bằng E");
    const unknown = productFactText(products, { ...base, yearsToRetirement: null });
    expect(unknown).toContain("hồ sơ chưa có tháng muốn nghỉ hưu");
    expect(unknown).toContain("Hãy làm khảo sát ở mục Phân bổ tài sản");
    expect(unknown).toContain("ETF F");
    expect(productFactText([], base)).toContain("Hiện chưa có sản phẩm đối tác đang phân phối trong phạm vi này.");
  });
  it("adds the profile-filtered list to a product question and keeps it after provider wording", async () => {
    const f = await plansFixture(), saved = await f.create();
    const s = new AiService(f.db, provider(async packet => ({ factKeys: ["products"], citationIds: [],
      answer: packet.facts.some(v => v.key === "products") ? "Danh sách sản phẩm đã lọc theo hồ sơ của bạn ở ngay bên dưới." : "Chưa có dữ kiện sản phẩm cho câu hỏi này." })));
    await s.setPrivacy(f.owner, consent);
    const r = await ask(s, f.owner, { question: "Tôi nên chọn sản phẩm nào?", planId: saved.planId, versionId: saved.saved.id });
    expect(r.answerSource).toBe("AI_COMPOSED");
    expect(r.answer.startsWith("Danh sách sản phẩm đã lọc theo hồ sơ của bạn ở ngay bên dưới.\n\nGợi ý lọc theo hồ sơ của bạn:")).toBe(true);
    expect(r.answer).toContain("không phải khuyến nghị đầu tư cá nhân");
    expect(r.facts.map((v: any) => v.key)).toContain("products");
  });
});
