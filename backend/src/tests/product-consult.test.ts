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

  it("creates a support ticket for a visible product only", async () => {
    const created: any[] = [];
    const tx: any = {
      supportTicket: { create: async ({ data }: any) => { created.push(data); return { id: "t1", ...data }; } },
      supportMessage: { create: async ({ data }: any) => { created.push(data); return data; } },
      auditLog: { create: async () => ({}) },
    };
    let product: any = { name: "Quỹ A", partner: { name: "VCBF" } };
    const db: any = { partnerProduct: { findFirst: async () => product }, $transaction: (fn: any) => fn(tx) };
    const service = new CommunityService(db);
    const ticket = await service.consultProduct("u1", "p1", { message: "Tôi muốn tìm hiểu", phone: "0901234567" });
    expect(ticket).toMatchObject({ subject: "Tư vấn: Quỹ A (VCBF)", category: "Tư vấn sản phẩm" });
    expect(created[1].body).toBe("Sản phẩm: Quỹ A\nĐối tác: VCBF\nSố điện thoại liên hệ: 0901234567\n\nTôi muốn tìm hiểu");
    product = null;
    await expect(service.consultProduct("u1", "p1", { message: "abc" })).rejects.toMatchObject({ status: 404 });
  });
});
