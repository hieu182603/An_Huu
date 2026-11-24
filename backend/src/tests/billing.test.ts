import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memory-db";
import { amountDue, computeFee } from "../modules/billing/fee-math";
import { dueDateOf, periodOf, periodStart } from "../modules/billing/periods";
import { dataToSignString, PayosClient, signCreateLink, signData, verifyDataSignature, type PaymentGateway } from "../modules/billing/payos";
import { BillingService } from "../modules/billing/service";
import { feeBase } from "../modules/billing/terms";
import { AppError } from "../common/errors";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";

const SCHEDULE = { annualRatePercent: "0.5000", minMonthlyVnd: 49000, maxMonthlyVnd: 2000000, roundingStepVnd: 1000 };
const KEY = "checksum-key-for-tests";
const NOW = new Date("2026-11-18T05:00:00.000Z"); // 18/11/2026 12:00 giờ VN

describe("billing fee math", () => {
  it.each([
    ["50000000", "20833.33", 49000, true, false],
    ["500000000", "208333.33", 209000, false, false],
    ["1000000000", "416666.67", 417000, false, false],
    ["1200000000", "500000.00", 500000, false, false],
    ["3000000000", "1250000.00", 1250000, false, false],
    ["10000000000", "4166666.67", 2000000, false, true],
  ])("base %s → raw %s → %d", (base, raw, fee, minimum, maximum) => {
    const r = computeFee(base, SCHEDULE);
    expect(r).toMatchObject({ baseAmountVnd: base, rawFeeVnd: raw, scheduleFeeVnd: fee, amountVnd: fee, applied: { minimum, maximum, override: null } });
  });
  it("treats unknown, negative and fractional bases safely", () => {
    expect(computeFee(null, SCHEDULE)).toMatchObject({ baseAmountVnd: "0", amountVnd: 49000 });
    expect(computeFee("-5", SCHEDULE)).toMatchObject({ baseAmountVnd: "0", amountVnd: 49000 });
    expect(computeFee("1000000000.99", SCHEDULE).baseAmountVnd).toBe("1000000000");
    expect(computeFee("1000000000", { ...SCHEDULE, maxMonthlyVnd: null }).amountVnd).toBe(417000);
  });
  it("applies per-user overrides after the schedule", () => {
    expect(computeFee("1000000000", SCHEDULE, { kind: "WAIVE", value: null }).amountVnd).toBe(0);
    expect(computeFee("1000000000", SCHEDULE, { kind: "FIXED_AMOUNT", value: "99000" }).amountVnd).toBe(99000);
    expect(computeFee("1000000000", SCHEDULE, { kind: "DISCOUNT_PERCENT", value: "50" })).toMatchObject({ scheduleFeeVnd: 417000, amountVnd: 209000 });
    expect(computeFee("1000000000", SCHEDULE, { kind: "DISCOUNT_PERCENT", value: "100" }).amountVnd).toBe(0);
  });
  it("derives the remaining amount from the ledger", () => {
    expect(amountDue({ amountVnd: 417000, adjustments: [17000], payments: [400000], refunds: [] })).toBe(0);
    expect(amountDue({ amountVnd: 417000, adjustments: [], payments: [417000, 417000], refunds: [417000] })).toBe(0);
    expect(amountDue({ amountVnd: 417000, adjustments: [], payments: [300000], refunds: [] })).toBe(117000);
  });
  it("uses Vietnam calendar months", () => {
    expect(periodOf(new Date("2026-11-30T16:59:59.000Z"))).toBe("2026-11");
    expect(periodOf(new Date("2026-11-30T17:00:00.000Z"))).toBe("2026-12");
    expect(periodStart("2026-12").toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(dueDateOf("2026-12", 10).toISOString()).toBe("2026-12-10T16:59:59.999Z");
  });
});

describe("payOS signatures", () => {
  it("builds the data string with sorted keys and empty nulls", () => {
    expect(dataToSignString({ orderCode: 123, amount: 3000, desc: null, b: undefined, c: "null", list: [{ z: 1, a: 2 }] }))
      .toBe('amount=3000&b=&c=&desc=&list=[{"a":2,"z":1}]&orderCode=123');
  });
  it("signs create-link requests over the five fields in alphabetical order", () => {
    const input = { amount: 417000, cancelUrl: "https://x.test/c", description: "AH100000", orderCode: 100000, returnUrl: "https://x.test/r" };
    expect(signCreateLink(KEY, input)).toBe(createHmac("sha256", KEY)
      .update("amount=417000&cancelUrl=https://x.test/c&description=AH100000&orderCode=100000&returnUrl=https://x.test/r").digest("hex"));
  });
  it("verifies webhook data signatures in constant time and rejects tampering", () => {
    const data = { orderCode: 100000, amount: 417000, reference: "FT1" }, signature = signData(KEY, data);
    expect(verifyDataSignature(KEY, data, signature)).toBe(true);
    expect(verifyDataSignature(KEY, data, signature.toUpperCase())).toBe(true);
    expect(verifyDataSignature(KEY, { ...data, amount: 1 }, signature)).toBe(false);
    expect(verifyDataSignature("other-key", data, signature)).toBe(false);
    expect(verifyDataSignature(KEY, data, "not-hex")).toBe(false);
  });
  it("calls payOS with client headers and maps provider rejection to 502", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "00", data: { paymentLinkId: "pl1", checkoutUrl: "https://pay.payos.vn/web/pl1", qrCode: "000201", status: "PENDING" } })));
    const client = new PayosClient({ clientId: "cid", apiKey: "akey", checksumKey: KEY, baseUrl: "https://api.test/", timeoutMs: 1000 }, fetcher as unknown as typeof fetch);
    const input = { orderCode: 100000, amount: 417000, description: "AH100000", returnUrl: "https://x.test/r", cancelUrl: "https://x.test/c", expiredAt: 1 };
    await expect(client.createLink(input)).resolves.toMatchObject({ paymentLinkId: "pl1", qrCode: "000201" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/v2/payment-requests");
    expect(init.headers).toMatchObject({ "x-client-id": "cid", "x-api-key": "akey" });
    expect(JSON.parse(String(init.body))).toMatchObject({ ...input, signature: signCreateLink(KEY, input) });
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: "20", desc: "Invalid" })));
    await expect(client.createLink(input)).rejects.toMatchObject({ status: 502, code: "PAYMENT_PROVIDER_ERROR" });
  });
});

function fakeGateway() {
  let link = 0;
  const gateway = {
    createLink: vi.fn(async (input: { orderCode: number }) => ({ paymentLinkId: "pl-" + ++link, checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`, qrCode: "qr-" + input.orderCode, status: "PENDING" })),
    getLink: vi.fn(async () => ({ status: "PENDING", amount: 0, amountPaid: 0, transactions: [] as Array<{ reference: string; amount: number; transactionDateTime: string }> })),
    cancelLink: vi.fn(async () => undefined),
  };
  return gateway as typeof gateway & PaymentGateway;
}
async function setup(options: { enabled?: boolean } = {}) {
  const f = memoryDb(), gateway = fakeGateway();
  await f.db.feeSchedule.create({ data: { id: randomUUID(), version: 1, status: "PUBLISHED", ...SCHEDULE, dueDay: 10, reminderDays: [5, 8], trialMonths: 1,
    effectiveFromPeriod: "2026-11", createdById: "system", publishedById: "system", publishedAt: NOW } });
  const service = new BillingService(f.db, gateway, { enabled: options.enabled ?? true, termsVersion: "terms-v1", returnUrl: "https://app.test/user/billing/result", checksumKey: KEY, now: () => NOW });
  return { f, gateway, service };
}
async function statement(f: ReturnType<typeof memoryDb>, amountVnd = 417000) {
  const schedule = f.rows("feeSchedule")[0];
  return f.db.feeStatement.create({ data: { userId: "u1", period: "2026-11", baseAmountVnd: "1000000000", baseSource: { metric: "retirementLiquidAssets" },
    feeScheduleId: schedule.id, rawFeeVnd: "416666.67", scheduleFeeVnd: 417000, amountVnd, dueDate: dueDateOf("2026-11", 10) } });
}
const webhook = (data: Record<string, unknown>, code = "00") => ({ code, desc: "success", success: code === "00", data, signature: signData(KEY, data) });

describe("BillingService", () => {
  it("is fully off while BILLING_ENABLED is false", async () => {
    const { service } = await setup({ enabled: false });
    await expect(service.overview("u1")).rejects.toMatchObject({ status: 503, code: "BILLING_DISABLED" });
    await expect(service.handleWebhook({})).rejects.toMatchObject({ status: 503 });
  });

  it("opens a trial account on first acceptance, idempotently and only for the current terms", async () => {
    const { f, service } = await setup();
    await expect(service.acceptTerms("u1", "terms-v0")).rejects.toMatchObject({ status: 409, code: "TERMS_VERSION_MISMATCH" });
    const account = await service.acceptTerms("u1", "terms-v1");
    expect(account).toMatchObject({ status: "TRIAL", termsVersion: "terms-v1" });
    expect(account.trialEndsAt!.toISOString()).toBe(periodStart("2026-12").toISOString());
    await service.acceptTerms("u1", "terms-v1");
    expect(f.rows("billingAccount")).toHaveLength(1);
    expect(f.rows("auditLog").filter(a => a.action === "BILLING_TERMS_ACCEPTED")).toHaveLength(1);
  });

  it("estimates next period's fee and reports terms required without an account", async () => {
    const { service } = await setup();
    await expect(service.estimate("u1", "1000000000")).resolves.toMatchObject({ period: "2026-12", amountVnd: 417000, schedule: { version: 1 } });
    const overview = await service.overview("u1");
    expect(overview).toMatchObject({ termsRequired: true, account: null, currentStatement: null, nextEstimate: { amountVnd: 49000, baseSource: { issues: ["PROFILE_MISSING"] } } });
  });

  it("uses minimum-fee base with a recorded reason for legacy profiles", async () => {
    const { f } = await setup();
    await f.db.financialProfile.create({ data: { userId: "u1", profileData: {}, schemaVersion: 1 } });
    await expect(feeBase(f.db, "u1")).resolves.toMatchObject({ amount: "0", source: { issues: ["LEGACY_PROFILE"], profileRevision: 1 } });
  });

  it("creates one payOS link per remaining amount and replays the idempotency key", async () => {
    const { f, gateway, service } = await setup();
    const s = await statement(f), key = randomUUID();
    const first = await service.pay("u1", s.id, key) as Record<string, unknown>;
    expect(first).toMatchObject({ amountVnd: 417000, status: "PENDING", checkoutUrl: "https://pay.payos.vn/web/100000", orderCode: "100000" });
    expect(gateway.createLink).toHaveBeenCalledWith(expect.objectContaining({ orderCode: 100000, amount: 417000, description: "AH100000",
      returnUrl: `https://app.test/user/billing/result?orderId=${first.id}`, cancelUrl: `https://app.test/user/billing/result?orderId=${first.id}&cancelled=1` }));
    await expect(service.pay("u1", s.id, key)).resolves.toEqual(first);
    await expect(service.pay("u1", s.id, randomUUID())).resolves.toMatchObject({ id: first.id });
    expect(gateway.createLink).toHaveBeenCalledTimes(1);
    await expect(service.pay("other", s.id, randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it.each(["PENDING", "EXPIRED", "CANCELLED"] as const)("reissues a closed %s code after payOS confirms cancellation", async status => {
    const { f, gateway, service } = await setup();
    const s = await statement(f);
    const first = await service.pay("u1", s.id, randomUUID()) as { id: string };
    await f.db.paymentOrder.update({ where: { id: first.id }, data: { status, expiredAt: new Date(NOW.getTime() - 1000) } });
    gateway.getLink.mockResolvedValueOnce({ status: "PENDING", amount: 417000, amountPaid: 0, transactions: [] });
    gateway.getLink.mockResolvedValueOnce({ status: "PENDING", amount: 417000, amountPaid: 0, transactions: [] });
    gateway.getLink.mockResolvedValueOnce({ status: "CANCELLED", amount: 417000, amountPaid: 0, transactions: [] });
    await expect(service.pay("u1", s.id, randomUUID())).resolves.toMatchObject({ status: "PENDING", qrCode: expect.any(String) });
    expect(gateway.cancelLink).toHaveBeenCalledWith(100000, "Thay mã thanh toán đã hết hạn");
    expect(gateway.createLink).toHaveBeenCalledTimes(2);
  });

  it("keeps the old order when payOS has not confirmed cancellation", async () => {
    const { f, gateway, service } = await setup();
    const s = await statement(f);
    const first = await service.pay("u1", s.id, randomUUID()) as { id: string };
    await f.db.paymentOrder.update({ where: { id: first.id }, data: { expiredAt: new Date(NOW.getTime() - 1000) } });
    await expect(service.pay("u1", s.id, randomUUID())).rejects.toMatchObject({ code: "PAYMENT_CODE_UNAVAILABLE" });
    expect(gateway.createLink).toHaveBeenCalledTimes(1);
  });

  it("records a late payment before considering a replacement code", async () => {
    const { f, gateway, service } = await setup();
    const s = await statement(f);
    const first = await service.pay("u1", s.id, randomUUID()) as { id: string };
    await f.db.paymentOrder.update({ where: { id: first.id }, data: { expiredAt: new Date(NOW.getTime() - 1000) } });
    gateway.getLink.mockResolvedValueOnce({ status: "PAID", amount: 417000, amountPaid: 417000,
      transactions: [{ reference: "FT-LATE", amount: 417000, transactionDateTime: "2026-11-18 11:59:59" }] });
    await expect(service.pay("u1", s.id, randomUUID())).rejects.toMatchObject({ code: "STATEMENT_SETTLED" });
    expect(gateway.createLink).toHaveBeenCalledTimes(1);
    expect(f.rows("payment")).toHaveLength(1);
  });

  it("marks the order cancelled when payOS refuses the link", async () => {
    const { f, gateway, service } = await setup();
    const s = await statement(f);
    gateway.createLink.mockRejectedValueOnce(new AppError(502, "PAYMENT_PROVIDER_ERROR", "x"));
    await expect(service.pay("u1", s.id, randomUUID())).rejects.toMatchObject({ status: 502 });
    expect(f.rows("paymentOrder")[0].status).toBe("CANCELLED");
  });

  it("applies a signed webhook once, settles the statement and reopens an overdue account", async () => {
    const { f, service } = await setup();
    const s = await statement(f);
    await f.db.feeStatement.update({ where: { id: s.id }, data: { status: "OVERDUE" } });
    await f.db.billingAccount.create({ data: { userId: "u1", status: "OVERDUE", termsVersion: "terms-v1", termsAcceptedAt: NOW } });
    const order = await service.pay("u1", s.id, randomUUID()) as { orderCode: string };
    const data = { orderCode: Number(order.orderCode), amount: 417000, reference: "FT26112", transactionDateTime: "2026-11-18 12:05:00",
      accountNumber: "0123456789", counterAccountNumber: "9876543210", counterAccountName: "NGUYEN VAN A" };
    await expect(service.handleWebhook(webhook(data))).resolves.toEqual({ outcome: "APPLIED" });
    await expect(service.handleWebhook(webhook(data))).resolves.toEqual({ outcome: "DUPLICATE" });
    expect(f.rows("payment")).toHaveLength(1);
    expect(f.rows("payment")[0]).toMatchObject({ amountVnd: 417000, source: "PAYOS", bankReference: "FT26112" });
    expect(f.rows("payment")[0].receivedAt.toISOString()).toBe("2026-11-18T05:05:00.000Z");
    expect(f.rows("feeStatement")[0]).toMatchObject({ status: "PAID" });
    expect(f.rows("paymentOrder")[0].status).toBe("PAID");
    expect(f.rows("billingAccount")[0].status).toBe("ACTIVE");
    expect(f.rows("notification")[0].title).toBe("Thanh toán phí dịch vụ thành công");
    const stored = f.rows("paymentWebhookEvent")[0].payload;
    expect(stored).toMatchObject({ accountNumber: "****6789", counterAccountNumber: "****3210", counterAccountName: "[masked]" });
  });

  it("rejects bad signatures and accepts payOS test webhooks for unknown orders", async () => {
    const { f, service } = await setup();
    const data = { orderCode: 123, amount: 3000, reference: "TF230204212323" };
    await expect(service.handleWebhook({ ...webhook(data), signature: signData("wrong", data) })).rejects.toMatchObject({ status: 400, code: "INVALID_SIGNATURE" });
    await expect(service.handleWebhook({ ...webhook(data), data: { ...data, amount: 1 } })).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    await expect(service.handleWebhook(webhook(data))).resolves.toEqual({ outcome: "UNKNOWN_ORDER" });
    expect(f.rows("payment")).toHaveLength(0);
  });

  it("keeps an underpaid statement open and records only what arrived", async () => {
    const { f, service } = await setup();
    const s = await statement(f);
    const order = await service.pay("u1", s.id, randomUUID()) as { orderCode: string };
    await expect(service.handleWebhook(webhook({ orderCode: Number(order.orderCode), amount: 400000, reference: "FT1" }))).resolves.toEqual({ outcome: "UNDERPAID" });
    expect(f.rows("feeStatement")[0].status).toBe("ISSUED");
    expect(f.rows("paymentOrder")[0].status).toBe("UNDERPAID");
    await expect(service.statement("u1", s.id)).resolves.toMatchObject({ amountDueVnd: 17000, payments: [{ amountVnd: 400000 }] });
  });

  it("reconciles a pending order with payOS when the result page polls", async () => {
    const { f, gateway, service } = await setup();
    const s = await statement(f);
    const order = await service.pay("u1", s.id, randomUUID()) as { id: string };
    gateway.getLink.mockResolvedValueOnce({ status: "PAID", amount: 417000, amountPaid: 417000, transactions: [{ reference: "FT9", amount: 417000, transactionDateTime: "2026-11-18 12:10:00" }] });
    await expect(service.order("u1", order.id)).resolves.toMatchObject({ order: { status: "PAID" }, statement: { status: "PAID", amountDueVnd: 0 } });
    await expect(service.order("other", order.id)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to pay a settled statement", async () => {
    const { f, service } = await setup();
    const s = await statement(f);
    await f.db.statementAdjustment.create({ data: { statementId: s.id, amountVnd: 417000, reason: "Miễn phí", createdById: "admin" } });
    await expect(service.pay("u1", s.id, randomUUID())).rejects.toMatchObject({ status: 409, code: "STATEMENT_SETTLED" });
  });
});

describe("billing OpenAPI contract", () => {
  it("matches real service responses", async () => {
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, uri: true } });
    const schema = (path: string, method: string) => spec.paths[path][method].responses["200"].content["application/json"].schema;
    const check = (path: string, method: string, data: unknown) => {
      const validate = ajv.compile(schema(path, method));
      expect(validate({ data: JSON.parse(JSON.stringify(data)) }), JSON.stringify(validate.errors)).toBe(true);
    };
    const { f, service } = await setup();
    check("/api/v1/billing/fee-schedule", "get", await service.publicSchedule());
    check("/api/v1/me/billing/estimate", "post", await service.estimate("u1", "1000000000"));
    check("/api/v1/me/billing/terms", "post", await service.acceptTerms("u1", "terms-v1"));
    const s = await statement(f);
    const order = await service.pay("u1", s.id, randomUUID()) as { id: string };
    check("/api/v1/me/billing/statements/{id}/pay", "post", order);
    check("/api/v1/me/billing", "get", await service.overview("u1"));
    check("/api/v1/me/billing/statements", "get", await service.statements("u1", 1, 12));
    check("/api/v1/me/billing/statements/{id}", "get", await service.statement("u1", s.id));
    check("/api/v1/me/billing/orders/{id}", "get", await service.order("u1", order.id));
  });
});

import { isBillingGated as gatedCase } from "../modules/billing/entitlement";
import { billableForPeriod as billableTrialStop } from "../modules/billing/jobs";
import { it as itx, expect as expectx } from "vitest";
itx("gate matches paths case-insensitively", () => {
  expectx(gatedCase("POST", "/api/v1/me/Retirement/Plans")).toBe(true);
  expectx(gatedCase("POST", "/api/v1/ME/AI/explain")).toBe(true);
});
itx("stopped during trial is not billable until the trial ends", () => {
  const now = new Date("2026-12-10T00:00:00Z");
  expectx(billableTrialStop({ status: "STOPPED", trialEndsAt: new Date("2027-03-01T00:00:00Z"), stoppedFromPeriod: "2027-01" }, "2026-12", now)).toBe(false);
  expectx(billableTrialStop({ status: "STOPPED", trialEndsAt: new Date("2026-11-01T00:00:00Z"), stoppedFromPeriod: "2027-01" }, "2026-12", now)).toBe(true);
});
