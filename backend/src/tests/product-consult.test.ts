import { describe, expect, it } from "vitest";
import { productFactText, questionTopics, suitableRisks } from "../modules/ai/presentation";
import { CommunityService } from "../modules/community/service";

describe("product consultation", () => {
  it("filters risk by years to retirement", () => {
    expect(suitableRisks(3)).toEqual(["LOW"]);
    expect(suitableRisks(10)).toEqual(["LOW", "MEDIUM"]);
    expect(suitableRisks(20)).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(questionTopics("Tôi nên mua gói bảo hiểm hưu trí nào?").products).toBe(true);
    const text = productFactText([
      { name: "Quỹ trái phiếu A", partner: "VCBF", riskLevel: "LOW", annualFee: "0,8%" },
      { name: "Quỹ cổ phiếu B", partner: "VCBF", riskLevel: "HIGH", annualFee: null },
    ], 3);
    expect(text).toContain("Quỹ trái phiếu A");
    expect(text).not.toContain("Quỹ cổ phiếu B");
    expect(text).toContain("không phải khuyến nghị đầu tư");
  });

  const productRow = { name: "Quỹ A", category: "Quỹ trái phiếu", expectedReturn: "6-7%/năm", riskLevel: "LOW", annualFee: "0,8%", revision: 2, partner: { name: "VCBF" } };
  function fakeDb(state: { product: any; open?: any; status?: string }) {
    const created: any[] = [], audits: any[] = [], updates: any[] = [];
    const tx: any = {
      supportTicket: {
        findFirst: async ({ where }: any) => where.status?.in ? state.open ?? null : state.status ? { status: state.status } : null,
        create: async ({ data }: any) => { created.push(data); return { id: "t1", ...data }; },
        updateMany: async (args: any) => { updates.push(args); return { count: 1 }; },
      },
      supportMessage: { create: async ({ data }: any) => { created.push(data); return data; } },
      auditLog: { create: async ({ data }: any) => { audits.push(data); return {}; } },
    };
    const db: any = { partnerProduct: { findFirst: async () => state.product }, $transaction: (fn: any) => fn(tx) };
    return { db, created, audits, updates };
  }

  it("creates a consultation linked to the product with channel and frozen product terms", async () => {
    const { db, created, audits } = fakeDb({ product: productRow });
    const ticket = await new CommunityService(db).consultProduct("u1", "p1", { message: "Tôi muốn tìm hiểu", phone: "0901234567", channel: "EMAIL", consent: true });
    expect(ticket).toMatchObject({ subject: "Tư vấn: Quỹ A (VCBF)", category: "Tư vấn sản phẩm", productId: "p1" });
    expect(created[1].body).toBe([
      "Sản phẩm: Quỹ A", "Đối tác: VCBF", "Hình thức liên hệ: Email tài liệu", "Số điện thoại liên hệ: 0901234567",
      "Thông tin sản phẩm lúc gửi: Quỹ trái phiếu · lợi suất tham khảo 6-7%/năm · rủi ro LOW · phí 0,8%", "", "Tôi muốn tìm hiểu",
    ].join("\n"));
    expect(JSON.stringify(audits[0])).toContain('"channel":"EMAIL"');
    expect(JSON.stringify(audits[0])).toContain('"revision":2');
  });

  it("keeps the previous request shape working and allows an empty note", async () => {
    const { db, created } = fakeDb({ product: productRow });
    await new CommunityService(db).consultProduct("u1", "p1", { message: "abc" });
    expect(created[1].body).toContain("Hình thức liên hệ: Điện thoại tư vấn");
    const second = fakeDb({ product: productRow });
    await new CommunityService(second.db).consultProduct("u1", "p1", {});
    expect(second.created[1].body.endsWith("phí 0,8%")).toBe(true);
  });

  it("rejects hidden products, duplicate active requests and a false consent", async () => {
    await expect(new CommunityService(fakeDb({ product: null }).db).consultProduct("u1", "p1", { message: "abc" })).rejects.toMatchObject({ status: 404 });
    const dup = fakeDb({ product: productRow, open: { id: "t0" } });
    await expect(new CommunityService(dup.db).consultProduct("u1", "p1", {})).rejects.toMatchObject({ status: 409, code: "CONSULT_ALREADY_OPEN" });
    expect(dup.created).toHaveLength(0);
    await expect(new CommunityService(fakeDb({ product: productRow }).db).consultProduct("u1", "p1", { consent: false } as any)).rejects.toBeTruthy();
  });

  it("lets the requester cancel only an unfinished request", async () => {
    const open = fakeDb({ product: productRow, status: "IN_PROGRESS" });
    await expect(new CommunityService(open.db).cancelTicket("u1", "t1")).resolves.toEqual({ cancelled: true });
    expect(open.updates[0]).toMatchObject({ where: { id: "t1", userId: "u1", status: "IN_PROGRESS" }, data: { status: "CLOSED" } });
    await expect(new CommunityService(fakeDb({ product: productRow, status: "RESOLVED" }).db).cancelTicket("u1", "t1")).rejects.toMatchObject({ status: 409 });
    await expect(new CommunityService(fakeDb({ product: productRow }).db).cancelTicket("u1", "t1")).rejects.toMatchObject({ status: 404 });
  });

  it("saves products idempotently and refuses hidden ones", async () => {
    const rows = new Map<string, any>();
    const db: any = {
      partnerProduct: { findFirst: async ({ where }: any) => where.id === "p1" ? { id: "p1" } : null },
      savedProduct: {
        findUnique: async ({ where }: any) => rows.get(where.userId_productId.productId) ?? null,
        count: async () => rows.size,
        upsert: async ({ create }: any) => { rows.set(create.productId, create); return create; },
        deleteMany: async ({ where }: any) => { rows.delete(where.productId); return { count: 1 }; },
      },
    };
    const service = new CommunityService(db);
    await expect(service.saveProduct("u1", "p1", true)).resolves.toEqual({ saved: true });
    await expect(service.saveProduct("u1", "p1", true)).resolves.toEqual({ saved: true });
    expect(rows.size).toBe(1);
    await expect(service.saveProduct("u1", "p2", true)).rejects.toMatchObject({ status: 404 });
    await expect(service.saveProduct("u1", "p1", false)).resolves.toEqual({ saved: false });
    expect(rows.size).toBe(0);
  });
});
