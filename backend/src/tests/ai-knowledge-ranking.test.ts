import { describe, expect, it } from "vitest";
import { KnowledgeService, passagesOf } from "../modules/ai/knowledge";
import { memoryDb } from "./memory-db";

// Short excerpts of the loaded legal texts plus dense distractors that share many common words with the questions.
// Shared-token counting (LEXICAL_V1 ranking) put the distractors first for the pension, base-salary and elderly questions.
const texts = {
  nd162: { title:"Nghị định 162/2026/NĐ-CP điều chỉnh lương hưu, trợ cấp bảo hiểm xã hội và trợ cấp hằng tháng (từ 01/7/2026)", referenceCode:"162/2026/NĐ-CP",
    rawContent:"Điều 2. Mức điều chỉnh. Từ ngày 01 tháng 7 năm 2026, điều chỉnh tăng thêm 8% trên mức lương hưu, trợ cấp bảo hiểm xã hội và trợ cấp hằng tháng của tháng 6 năm 2026." },
  nd161: { title:"Nghị định 161/2026/NĐ-CP quy định mức lương cơ sở và chế độ tiền thưởng (từ 01/7/2026)", referenceCode:"161/2026/NĐ-CP",
    rawContent:"Điều 3. Mức lương cơ sở. Từ ngày 01 tháng 7 năm 2026, mức lương cơ sở là 2.530.000 đồng/tháng." },
  nct: { title:"Luật Người cao tuổi số 39/2009/QH12", referenceCode:"39/2009/QH12",
    rawContent:"Điều 3. Quyền và nghĩa vụ. Người cao tuổi được ưu tiên trong chăm sóc sức khỏe và được trợ giúp xã hội theo quy định của pháp luật." },
  bhxh: { title:"Luật Bảo hiểm xã hội", referenceCode:"41/2024/QH15",
    rawContent:"Người lao động đóng bảo hiểm xã hội bắt buộc được hưởng lương hưu khi đủ tuổi nghỉ hưu và có thời gian đóng từ đủ 15 năm trở lên. "
      + "Mức lương hưu hằng tháng được tính bằng phần trăm của mức bình quân tiền lương. Chính sách của Nhà nước hiện nay là hỗ trợ người lao động, người cao tuổi; "
      + "mức đóng tính trên cơ sở tiền lương tháng là bao nhiêu do Chính phủ quy định. Lương hưu được điều chỉnh trên cơ sở mức tăng của chỉ số giá tiêu dùng." },
  tctdGovernance: { title:"Luật Các tổ chức tín dụng — Phần 2/7", referenceCode:"158/VBHN-VPQH",
    rawContent:"Hội đồng quản trị có trách nhiệm trước Đại hội đồng cổ đông. Thành viên không được đồng thời là người điều hành và có thể bị miễn nhiệm khi không đủ điều kiện." },
  tctdLending: { title:"Luật Các tổ chức tín dụng — Phần 4/7", referenceCode:"158/VBHN-VPQH",
    rawContent:"Tổ chức tín dụng có quyền thu hồi nợ trước hạn khi khách hàng vi phạm hợp đồng. Khách hàng trả nợ trước hạn thì phải trả phí trả nợ trước hạn theo thỏa thuận." },
};
type Key = keyof typeof texts;
async function corpus(approved: Key[] = Object.keys(texts) as Key[]) {
  const f = memoryDb(), k = new KnowledgeService(f.db), ids = {} as Record<Key,string>;
  for (const key of Object.keys(texts) as Key[]) {
    const created = await k.create("admin", { ...texts[key], category:"LEGAL", version:"1", effectiveDate:"2026-01-01T00:00:00.000Z" });
    await k.index("admin", created.id, { expectedRevision:1 });
    if (approved.includes(key)) await k.approve("admin", created.id, { expectedRevision:2, approved:true, confirm:true, reviewNote:"Reviewed" });
    ids[key] = created.id;
  }
  return { f, k, ids, top: async (q: string) => (await k.retrieve(f.db, q)).map(r => r.sourceId) };
}

describe("AI knowledge ranking (BM25 over verified sources)", () => {
  it("puts the official text that answers the question first", async () => {
    const { ids, top } = await corpus();
    expect((await top("Lương hưu năm 2026 được tăng bao nhiêu phần trăm?"))[0]).toBe(ids.nd162);
    expect((await top("Mức lương cơ sở hiện nay là bao nhiêu?"))[0]).toBe(ids.nd161);
    expect((await top("Người cao tuổi được hưởng chính sách gì?"))[0]).toBe(ids.nct);
    expect((await top("Đóng BHXH bao nhiêu năm thì được hưởng lương hưu?"))[0]).toBe(ids.bhxh);
  });
  it("matches unaccented questions and drops weak matches far below the best chunk", async () => {
    const { ids, top } = await corpus();
    expect((await top("muc luong co so hien nay la bao nhieu"))[0]).toBe(ids.nd161);
    expect((await top("luong huu 2026 tang bao nhieu %"))[0]).toBe(ids.nd162);
    // Governance text shares only "trước"/stopwords with the question; it is not cited next to the lending article.
    expect(await top("Trả nợ trước hạn có bị phạt không?")).toEqual([ids.tctdLending]);
    expect(await top("Cách nấu phở bò ngon?")).toEqual([]);
  });
  it("keeps the governance contract: approved, current-hash, unmodified chunks only, at most 4, deterministic", async () => {
    const { f, ids, top } = await corpus(["bhxh", "nct", "tctdGovernance", "tctdLending"]);
    expect(await top("Mức lương cơ sở hiện nay là bao nhiêu?")).not.toContain(ids.nd161);
    expect(await top("Lương hưu năm 2026 được tăng bao nhiêu phần trăm?")).not.toContain(ids.nd162);
    const q = "Người cao tuổi được hưởng lương hưu và chính sách gì của tổ chức tín dụng?", first = await top(q);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(await top(q)).toEqual(first);
    const chunk = f.rows("knowledgeChunk").find((c: any) => c.sourceId === ids.nct)!, original = chunk.metadata;
    chunk.metadata = { ...original, method:"UNKNOWN" };
    expect(await top(q)).not.toContain(ids.nct);
    chunk.metadata = { ...original, sourceHash:"stale" };
    expect(await top(q)).not.toContain(ids.nct);
    chunk.metadata = original;
    expect(await top(q)).toContain(ids.nct);
  });
  it("breaks score ties by id and returns one bounded excerpt per block made only of source text", async () => {
    const f = memoryDb(), k = new KnowledgeService(f.db);
    const sentence = "Điều 1. Mức lương cơ sở dùng làm căn cứ tính mức lương trong các bảng lương. ", body = sentence.repeat(40);
    for (const title of ["Bản A", "Bản B"]) {
      const s = await k.create("admin", { title, category:"LEGAL", version:"1", rawContent:body, effectiveDate:"2026-01-01T00:00:00.000Z" });
      await k.index("admin", s.id, { expectedRevision:1 });
      await k.approve("admin", s.id, { expectedRevision:2, approved:true, confirm:true, reviewNote:"Reviewed" });
    }
    const rows = await k.retrieve(f.db, "mức lương cơ sở");
    // The repeated line is one block per source: its windows are merged, not cited four times.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(r => r.sourceId)).size).toBe(2);
    expect(rows.every(r => r.content.length <= 2400 && r.content.split("\n").every(line => body.includes(line)))).toBe(true);
    const tied = rows.filter(r => r.score === rows[0].score).map(r => r.id);
    expect(tied).toEqual([...tied].sort((a, b) => a.localeCompare(b)));
    expect((await k.retrieve(f.db, "mức lương cơ sở")).map(r => r.id)).toEqual(rows.map(r => r.id));
  });
});

describe("AI knowledge reading units (articles and guide blocks)", () => {
  const clause = (n: number, text: string) => `${n}. ${text} ` + "Quy định chi tiết do Chính phủ ban hành theo từng thời kỳ. ".repeat(12).trim();
  const law = ["LUẬT MẪU", "Căn cứ Hiến pháp;", "",
    "Điều 64. Điều kiện hưởng lương hưu", "Người lao động có thời gian đóng từ đủ 15 năm trở lên thì được hưởng lương hưu khi đủ tuổi nghỉ hưu.", "", "44", "",
    "Điều 66. Mức lương hưu hằng tháng", clause(1, "Lao động nữ bằng 45% mức bình quân tiền lương tương ứng 15 năm đóng."),
    clause(2, "Lao động nam bằng 45% mức bình quân tiền lương tương ứng 20 năm đóng."),
    clause(3, "Mỗi năm nghỉ hưu trước tuổi quy định thì giảm 2%."),
    "Điều 67. Điều chỉnh lương hưu", "Lương hưu được điều chỉnh trên cơ sở mức tăng của chỉ số giá tiêu dùng."].join("\n");
  const guide = ["CẨM NANG", "", "Quỹ dự phòng là gì?", "Quỹ dự phòng là khoản tiền dễ rút để chi trả biến cố như mất việc, ốm đau, thường bằng 3 đến 6 tháng chi tiêu thiết yếu.", "",
    "Quỹ mở là gì?", "Nhà đầu tư mua chứng chỉ quỹ; công ty quản lý quỹ chuyên nghiệp đầu tư tiền vào danh mục theo chiến lược đã công bố của quỹ."].join("\n");

  it("splits legal text by article, drops page numbers and repeats the heading on continuation windows", () => {
    const passages = passagesOf(law), article66 = passages.filter(p => p.heading.startsWith("Điều 66."));
    expect(passages.some(p => /^44$/m.test(p.body))).toBe(false);
    expect(passages.find(p => p.body.includes("đủ 15 năm trở lên"))!.heading).toBe("Điều 64. Điều kiện hưởng lương hưu");
    expect(article66.length).toBeGreaterThan(1);
    expect(article66.every(p => p.content.startsWith("Điều 66. Mức lương hưu hằng tháng") && p.body.length <= 1200)).toBe(true);
    expect(new Set(article66.map(p => p.section)).size).toBe(1);
  });
  it("splits guides at blank lines and keeps a bare title with the block after it", () => {
    const passages = passagesOf(guide);
    expect(passages).toHaveLength(2);
    expect(passages[0].content).toContain("CẨM NANG");
    expect(passages[0].content).toContain("3 đến 6 tháng");
    expect(passages[1].content.startsWith("Quỹ mở là gì?")).toBe(true);
  });
  it("cites the whole article around the matching clause and lets a guide appear next to the law", async () => {
    const f = memoryDb(), k = new KnowledgeService(f.db), ids: string[] = [];
    for (const [title, rawContent] of [["Luật Bảo hiểm xã hội", law], ["Cẩm nang An Hưu", guide]]) {
      const s = await k.create("admin", { title, category:"LEGAL", version:"1", rawContent, effectiveDate:"2026-01-01T00:00:00.000Z" });
      await k.index("admin", s.id, { expectedRevision:1 });
      await k.approve("admin", s.id, { expectedRevision:2, approved:true, confirm:true, reviewNote:"Reviewed" });
      ids.push(s.id);
    }
    const [top] = await k.retrieve(f.db, "Nghỉ hưu trước tuổi thì lương hưu giảm bao nhiêu?");
    expect(top.sourceId).toBe(ids[0]);
    expect(top.content.startsWith("Điều 66. Mức lương hưu hằng tháng")).toBe(true);
    expect(top.content).toContain("giảm 2%");
    expect(top.content).toContain("Lao động nam bằng 45%");
    expect(top.content).not.toContain("Điều 67.");
    const fund = await k.retrieve(f.db, "Quỹ dự phòng là gì?");
    expect(fund[0].sourceId).toBe(ids[1]);
    expect(fund[0].content).not.toContain("Quỹ mở là gì?");
    // A gap in the stored index (a deleted chunk) takes the whole source out of reading.
    const rows = f.rows("knowledgeChunk"), gone = rows.findIndex((c: any) => c.sourceId === ids[0]);
    rows.splice(gone, 1);
    expect((await k.retrieve(f.db, "Nghỉ hưu trước tuổi thì lương hưu giảm bao nhiêu?")).map(r => r.sourceId)).not.toContain(ids[0]);
  });
});
