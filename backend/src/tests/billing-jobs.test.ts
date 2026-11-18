import { randomUUID } from "node:crypto";
import { Prisma, type OutboxEvent } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { memoryDb } from "./memory-db";
import type { AppConfig } from "../config/env";
import { createEventHandler } from "../jobs/handlers";
import { createErrorHandler } from "../middlewares/errorHandler";
import { BillingService } from "../modules/billing/service";
import { billingGate, isBillingGated, requireBillingActive } from "../modules/billing/entitlement";
import { expireOrders, issueStatements, markOverdue, reconcilePending, remindStatements, rolloverSchedules, stableId } from "../modules/billing/jobs";
import { dueDateOf, periodStart } from "../modules/billing/periods";
import { signData, type PaymentGateway } from "../modules/billing/payos";
import { renderBillingEmail } from "../templates/billingEmail";

const KEY = "checksum-key-for-tests";
const SCHEDULE = { annualRatePercent: "0.5000", minMonthlyVnd: 49000, maxMonthlyVnd: 2000000, roundingStepVnd: 1000 };
const NOV18 = new Date("2026-11-18T05:00:00.000Z");
const DEC1_VN = new Date("2026-11-30T17:30:00.000Z"); // 01/12/2026 00:30 giờ VN, nhưng vẫn là 30/11 theo UTC
const DEC5 = new Date("2026-12-05T05:00:00.000Z");

function fakeGateway() {
  let link = 0;
  const gateway = {
    createLink: vi.fn(async (input: { orderCode: number }) => ({ paymentLinkId: "pl-" + ++link, checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`, qrCode: "qr", status: "PENDING" })),
    getLink: vi.fn(async (_code: number) => ({ status: "PENDING", amount: 0, amountPaid: 0, transactions: [] as Array<{ reference: string; amount: number; transactionDateTime: string }> })),
    cancelLink: vi.fn(async () => undefined),
  };
  return gateway as typeof gateway & PaymentGateway;
}
async function setup(now = NOV18, enabled = true) {
  const f = memoryDb(), gateway = fakeGateway();
  const schedule = await f.db.feeSchedule.create({ data: { id: randomUUID(), version: 1, status: "PUBLISHED", ...SCHEDULE, dueDay: 10, reminderDays: [5, 8], trialMonths: 1,
    effectiveFromPeriod: "2026-11", createdById: "system", publishedById: "system", publishedAt: now } });
  let clock = now;
  const service = new BillingService(f.db, gateway, { enabled, termsVersion: "terms-v1", returnUrl: "https://app.test/user/billing/result", checksumKey: KEY, now: () => clock });
  return { f, gateway, service, schedule, setNow: (value: Date) => { clock = value; } };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
const account = (s: Fixture, userId: string, data: Record<string, unknown> = {}) =>
  s.f.db.billingAccount.create({ data: { userId, status: "ACTIVE", termsVersion: "terms-v1", termsAcceptedAt: NOV18, ...data } });
const statement = (s: Fixture, userId: string, period: string, data: Record<string, unknown> = {}) =>
  s.f.db.feeStatement.create({ data: { userId, period, baseAmountVnd: "0", baseSource: { metric: "retirementLiquidAssets" }, feeScheduleId: s.schedule.id,
    rawFeeVnd: "0.00", scheduleFeeVnd: 49000, amountVnd: 49000, dueDate: dueDateOf(period, 10), ...data } });
const order = (s: Fixture, statementId: string, userId: string, data: Record<string, unknown> = {}) =>
  s.f.db.paymentOrder.create({ data: { statementId, userId, amountVnd: 49000, expiredAt: new Date(NOV18.getTime() - 60_000), checkoutUrl: "https://pay.payos.vn/x", ...data } });
const paid = (reference: string) => ({ status: "PAID", amount: 49000, amountPaid: 49000, transactions: [{ reference, amount: 49000, transactionDateTime: "2026-11-18 11:00:00" }] });
const events = (s: Fixture, type: string) => s.f.rows("outboxEvent").filter(e => e.type === type) as Array<OutboxEvent & Record<string, any>>;

describe("issueStatements", () => {
  it("issues on Vietnam day 1 even when UTC is still the previous month, and not on day 4", async () => {
    const s = await setup();
    await account(s, "u1");
    await expect(issueStatements(s.f.db, new Date("2026-11-30T16:59:00.000Z"))).resolves.toMatchObject({ due: false, issued: 0 }); // 23:59 ngày 30/11 giờ VN
    await expect(issueStatements(s.f.db, new Date("2026-12-04T05:00:00.000Z"))).resolves.toMatchObject({ due: false, issued: 0 });
    expect(s.f.rows("feeStatement")).toHaveLength(0);
    await expect(issueStatements(s.f.db, DEC1_VN)).resolves.toMatchObject({ due: true, issued: 1 });
    const [row] = s.f.rows("feeStatement");
    expect(row).toMatchObject({ userId: "u1", period: "2026-12", status: "ISSUED", amountVnd: 49000, scheduleFeeVnd: 49000, baseAmountVnd: "0", rawFeeVnd: "0.00", feeScheduleId: s.schedule.id });
    expect(row.baseSource).toMatchObject({ metric: "retirementLiquidAssets", issues: ["PROFILE_MISSING"] });
    expect(row.dueDate.toISOString()).toBe("2026-12-10T16:59:59.999Z");
    expect(s.f.rows("notification")).toHaveLength(1);
    expect(events(s, "billing.statement_issued")).toMatchObject([{ entityId: row.id, payload: { statementId: row.id } }]);
    expect(s.f.rows("auditLog").find(a => a.action === "BILLING_STATEMENT_ISSUED")).toMatchObject({ performerName: "system", targetId: row.id });
  });

  it("is idempotent across reruns and tolerates a concurrent worker winning the unique key", async () => {
    const s = await setup();
    await account(s, "u1"); await account(s, "u2");
    await issueStatements(s.f.db, DEC1_VN);
    await expect(issueStatements(s.f.db, DEC5.getTime() > 0 ? new Date("2026-12-02T05:00:00.000Z") : DEC5)).resolves.toMatchObject({ issued: 0, skipped: 2 });
    expect(s.f.rows("feeStatement")).toHaveLength(2);
    expect(s.f.rows("notification")).toHaveLength(2);
    expect(events(s, "billing.statement_issued")).toHaveLength(2);

    const other = await setup();
    await account(other, "u1");
    const duplicate = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" });
    vi.spyOn(other.f.db.feeStatement, "create").mockRejectedValueOnce(duplicate);
    await expect(issueStatements(other.f.db, DEC1_VN)).resolves.toMatchObject({ issued: 0, skipped: 1, failed: 0 });
  });

  it("turns an ended trial into ACTIVE with its first statement and leaves a running trial alone", async () => {
    const s = await setup();
    await account(s, "ended", { status: "TRIAL", trialEndsAt: periodStart("2026-12") });
    await account(s, "running", { status: "TRIAL", trialEndsAt: periodStart("2027-01") });
    await expect(issueStatements(s.f.db, DEC1_VN)).resolves.toMatchObject({ issued: 1, skipped: 1 });
    expect(s.f.rows("billingAccount").find(a => a.userId === "ended")).toMatchObject({ status: "ACTIVE", revision: 1 });
    expect(s.f.rows("billingAccount").find(a => a.userId === "running")).toMatchObject({ status: "TRIAL", revision: 0 });
    expect(s.f.rows("feeStatement").map(r => r.userId)).toEqual(["ended"]);
  });

  it("skips stopped accounts from their stop period but still bills the period before it", async () => {
    const s = await setup();
    await account(s, "gone", { status: "STOPPED", stoppedFromPeriod: "2026-12" });
    await account(s, "later", { status: "STOPPED", stoppedFromPeriod: "2027-01" });
    await issueStatements(s.f.db, DEC1_VN);
    expect(s.f.rows("feeStatement").map(r => r.userId)).toEqual(["later"]);
  });

  it("never stacks debt: an unpaid earlier statement blocks a new one, a paid one does not", async () => {
    const s = await setup();
    await account(s, "late", { status: "OVERDUE" }); await account(s, "open"); await account(s, "clear");
    await statement(s, "late", "2026-10", { status: "OVERDUE" });
    await statement(s, "open", "2026-11", { status: "ISSUED" });
    await statement(s, "clear", "2026-11", { status: "PAID" });
    await expect(issueStatements(s.f.db, DEC1_VN)).resolves.toMatchObject({ issued: 1, skipped: 2 });
    expect(s.f.rows("feeStatement").filter(r => r.period === "2026-12").map(r => r.userId)).toEqual(["clear"]);
  });

  it("creates a WAIVED statement without an email when an override waives the fee", async () => {
    const s = await setup();
    await account(s, "vip");
    await s.f.db.userFeeOverride.create({ data: { userId: "vip", kind: "WAIVE", fromPeriod: "2026-12", reason: "Ưu đãi", createdById: "admin" } });
    await expect(issueStatements(s.f.db, DEC1_VN)).resolves.toMatchObject({ issued: 0, waived: 1 });
    expect(s.f.rows("feeStatement")[0]).toMatchObject({ status: "WAIVED", amountVnd: 0, scheduleFeeVnd: 49000 });
    expect(s.f.rows("feeStatement")[0].overrideId).toBeTruthy();
    expect(events(s, "billing.statement_issued")).toHaveLength(0);
    expect(s.f.rows("notification")[0].title).toBe("Phí dịch vụ tháng này được miễn");
  });
});

describe("remindStatements / markOverdue", () => {
  it("reminds only on the schedule's reminder days, once per day, and not after payment", async () => {
    const s = await setup();
    await account(s, "u1"); await account(s, "u2");
    const open = await statement(s, "u1", "2026-12"), done = await statement(s, "u2", "2026-12");
    await s.f.db.statementAdjustment.create({ data: { statementId: done.id, amountVnd: 49000, reason: "Miễn", createdById: "admin" } });
    await expect(remindStatements(s.f.db, new Date("2026-12-04T05:00:00.000Z"))).resolves.toMatchObject({ reminded: 0 });
    await expect(remindStatements(s.f.db, DEC5)).resolves.toMatchObject({ reminded: 1 });
    await expect(remindStatements(s.f.db, new Date("2026-12-05T10:00:00.000Z"))).resolves.toMatchObject({ reminded: 0, skipped: 2 });
    await expect(remindStatements(s.f.db, new Date("2026-12-06T05:00:00.000Z"))).resolves.toMatchObject({ reminded: 0 });
    await expect(remindStatements(s.f.db, new Date("2026-12-08T05:00:00.000Z"))).resolves.toMatchObject({ reminded: 1 });
    expect(s.f.rows("notification").map(n => n.id)).toEqual([stableId(`billing-reminder:${open.id}:5`), stableId(`billing-reminder:${open.id}:8`)]);
    expect(events(s, "billing.reminder").map(e => e.payload)).toEqual([{ statementId: open.id, day: 5 }, { statementId: open.id, day: 8 }]);
  });

  it("moves unpaid statements past their due date to OVERDUE once and gates the account", async () => {
    const s = await setup();
    await account(s, "u1"); await account(s, "stopped", { status: "STOPPED", stoppedFromPeriod: "2026-12" }); await account(s, "u3");
    await statement(s, "u1", "2026-11"); await statement(s, "stopped", "2026-11");
    const settled = await statement(s, "u3", "2026-11");
    await s.f.db.statementAdjustment.create({ data: { statementId: settled.id, amountVnd: 49000, reason: "Miễn", createdById: "admin" } });
    await statement(s, "u1", "2026-12"); // chưa đến hạn
    const afterDue = new Date("2026-11-11T05:00:00.000Z");
    await expect(markOverdue(s.f.db, afterDue)).resolves.toMatchObject({ overdue: 2 });
    await expect(markOverdue(s.f.db, afterDue)).resolves.toMatchObject({ overdue: 0 });
    expect(s.f.rows("feeStatement").map(r => `${r.userId}:${r.period}:${r.status}`)).toEqual(["u1:2026-11:OVERDUE", "stopped:2026-11:OVERDUE", "u3:2026-11:ISSUED", "u1:2026-12:ISSUED"]);
    expect(s.f.rows("billingAccount").map(a => a.status)).toEqual(["OVERDUE", "STOPPED", "ACTIVE"]);
    expect(s.f.rows("notification")).toHaveLength(2);
  });
});

function call(handler: ReturnType<typeof requireBillingActive>, req: Record<string, unknown>) {
  return new Promise<unknown>(resolve => { void handler(req as never, {} as never, error => resolve(error)); });
}
const req = (method: string, path: string, userId = "u1") => ({ method, originalUrl: "/api/v1" + path, user: { userId } });

describe("402 BILLING_OVERDUE gate", () => {
  it("blocks only overdue accounts, with details and a calm message", async () => {
    const s = await setup();
    await account(s, "late", { status: "OVERDUE" }); await account(s, "trial", { status: "TRIAL" }); await account(s, "active"); await account(s, "stopped", { status: "STOPPED" });
    const overdue = await statement(s, "late", "2026-10", { status: "OVERDUE" });
    const gate = requireBillingActive(s.service);
    const blocked = await call(gate, req("POST", "/me/retirement/plans", "late")) as { status: number; code: string; details: Record<string, unknown>; message: string };
    expect(blocked).toMatchObject({ status: 402, code: "BILLING_OVERDUE", details: { statementId: overdue.id, amountDueVnd: 49000, dueDate: dueDateOf("2026-10", 10).toISOString() } });
    expect(blocked.message).not.toMatch(/nguy|khóa|phạt|bị chặn/i);
    for (const userId of ["trial", "active", "stopped", "nobody"]) expect(await call(gate, req("POST", "/me/retirement/plans", userId))).toBeUndefined();
  });

  it("keeps blocking a user who stops the service while an overdue statement is unpaid", async () => {
    const s = await setup();
    await account(s, "late", { status: "OVERDUE" });
    await statement(s, "late", "2026-10", { status: "OVERDUE" });
    await s.service.stop("late", 0);
    expect(s.f.rows("billingAccount")[0].status).toBe("STOPPED");
    expect(await call(requireBillingActive(s.service), req("POST", "/me/retirement/plans", "late"))).toMatchObject({ status: 402, code: "BILLING_OVERDUE" });
  });

  it("serializes details through the error handler without changing the usual shape", async () => {
    const s = await setup();
    await account(s, "late", { status: "OVERDUE" }); await statement(s, "late", "2026-10", { status: "OVERDUE" });
    const error = await call(requireBillingActive(s.service), req("POST", "/me/ai/explain", "late"));
    const out: { status?: number; body?: any } = {};
    const res = { headersSent: false, locals: { requestId: "r1" }, set: () => res, status: (code: number) => { out.status = code; return res; }, json: (body: unknown) => { out.body = body; return res; } };
    createErrorHandler()(error, {} as never, res as never, () => undefined);
    expect(out.status).toBe(402);
    expect(out.body.error).toMatchObject({ code: "BILLING_OVERDUE", details: { amountDueVnd: 49000 } });
    expect(out.body.error.fieldErrors).toBeUndefined();
    expect(out.body.requestId).toBe("r1");
  });

  it("gates write/compute routes only, never reads", async () => {
    const gated: Array<[string, string]> = [
      ["POST", "/me/retirement/plans"], ["POST", "/me/retirement/plans/p1/versions"], ["POST", "/me/retirement/plans/p1/apply"], ["POST", "/me/retirement/plans/p1/compare"],
      ["POST", "/me/retirement/plans/p1/reforecasts"], ["POST", "/me/retirement/plans/p1/source-reforecasts"], ["POST", "/me/retirement/plans/p1/source-reforecasts/preview"],
      ["POST", "/me/retirement/plans/p1/versions/v1/simulate"], ["POST", "/me/retirement/plans/p1/versions/v1/replay"],
      ["PUT", "/me/retirement/actuals/2026-10"], ["POST", "/me/retirement/actuals/reforecast"],
      ["POST", "/me/ai/explain"], ["POST", "/me/ai/simulate"], ["POST", "/me/ai/conversations"], ["POST", "/me/explanations/metric"],
      ["POST", "/me/portfolio-policies/workspace/preview"], ["POST", "/me/portfolio-policies/workspace/packages"], ["POST", "/me/retirement/risk/monte-carlo"],
      ["POST", "/me/retirement/preview?adjustments=skip"], ["POST", "/me/retirement/pension-impact"], ["POST", "/me/pension/preview"], ["POST", "/me/debts/preview"],
    ];
    for (const [method, path] of gated) expect(isBillingGated(method, "/api/v1" + path.split("?")[0]), `${method} ${path}`).toBe(true);
    const open: Array<[string, string]> = [
      ["GET", "/me/retirement/plans"], ["GET", "/me/retirement/plans/p1/report"], ["GET", "/me/retirement/plans/p1/versions/v1/export.csv"], ["GET", "/me/ai/conversations"],
      ["DELETE", "/me/ai/conversations"], ["PATCH", "/me/financial-profile/assets"], ["PATCH", "/me/financial-profile/loss-tolerance"], ["PATCH", "/me"],
      ["POST", "/me/support"], ["POST", "/me/notifications/read-all"], ["POST", "/me/billing/statements/s1/pay"], ["POST", "/me/billing/stop"], ["PUT", "/me/ai/privacy"],
      ["GET", "/me/retirement/actuals/2026-10"], ["POST", "/me/onboarding/complete"], ["POST", "/auth/login"],
    ];
    for (const [method, path] of open) expect(isBillingGated(method, "/api/v1" + path), `${method} ${path}`).toBe(false);

    const s = await setup();
    await account(s, "late", { status: "OVERDUE" }); await statement(s, "late", "2026-10", { status: "OVERDUE" });
    const gate = billingGate(s.service);
    expect(await call(gate, req("GET", "/me/retirement/plans", "late"))).toBeUndefined();
    expect(await call(gate, req("PATCH", "/me/financial-profile/assets", "late"))).toBeUndefined();
    expect(await call(gate, req("POST", "/me/retirement/plans", "late"))).toMatchObject({ status: 402 });
  });

  it("is a no-op when billing is disabled and caches the verdict briefly", async () => {
    const off = await setup(NOV18, false);
    await account(off, "late", { status: "OVERDUE" }); await statement(off, "late", "2026-10", { status: "OVERDUE" });
    expect(await call(requireBillingActive(off.service), req("POST", "/me/retirement/plans", "late"))).toBeUndefined();

    const s = await setup();
    await account(s, "late", { status: "OVERDUE" }); await statement(s, "late", "2026-10", { status: "OVERDUE" });
    let clock = 0;
    const gate = requireBillingActive(s.service, { now: () => clock });
    const spy = vi.spyOn(s.service, "overdueNotice");
    await call(gate, req("POST", "/me/retirement/plans", "late")); await call(gate, req("POST", "/me/retirement/plans", "late"));
    expect(spy).toHaveBeenCalledTimes(1);
    clock = 6_000; // chặn chỉ cache 5 giây để người vừa thanh toán không phải chờ
    await call(gate, req("POST", "/me/retirement/plans", "late"));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reopens the account when the overdue statement is paid, and queues the receipt", async () => {
    const s = await setup();
    await account(s, "late", { status: "OVERDUE" });
    const owed = await statement(s, "late", "2026-10", { status: "OVERDUE" });
    const created = await s.service.pay("late", owed.id, randomUUID()) as { orderCode: string };
    const data = { orderCode: Number(created.orderCode), amount: 49000, reference: "FT1", transactionDateTime: "2026-11-18 12:05:00" };
    await s.service.handleWebhook({ code: "00", desc: "success", success: true, data, signature: signData(KEY, data) });
    expect(s.f.rows("billingAccount")[0].status).toBe("ACTIVE");
    expect(await call(requireBillingActive(s.service), req("POST", "/me/retirement/plans", "late"))).toBeUndefined();
    expect(events(s, "billing.payment_received")).toMatchObject([{ entityId: s.f.rows("payment")[0].id, payload: { paymentId: s.f.rows("payment")[0].id } }]);
  });
});

describe("order jobs", () => {
  it("applies a late payment found at expiry, expires and cancels the rest, and keeps going after a failure", async () => {
    const s = await setup();
    await account(s, "u1"); await account(s, "u2"); await account(s, "u3");
    const [a, b, c] = await Promise.all([statement(s, "u1", "2026-11"), statement(s, "u2", "2026-11"), statement(s, "u3", "2026-11")]);
    const late = await order(s, a.id, "u1"), none = await order(s, b.id, "u2"), broken = await order(s, c.id, "u3");
    const fresh = await order(s, c.id, "u3", { expiredAt: new Date(NOV18.getTime() + 600_000) });
    s.gateway.getLink.mockImplementation(async (code: number) => {
      if (code === Number(late.orderCode)) return paid("FTLATE");
      if (code === Number(broken.orderCode)) throw new Error("boom");
      return { status: "PENDING", amount: 49000, amountPaid: 0, transactions: [] };
    });
    await expect(expireOrders(s.f.db, s.gateway, NOV18)).resolves.toEqual({ expired: 1, paid: 1, failed: 1 });
    const byId = (id: string) => s.f.rows("paymentOrder").find(o => o.id === id)!;
    expect([byId(late.id).status, byId(none.id).status, byId(broken.id).status, byId(fresh.id).status]).toEqual(["PAID", "EXPIRED", "PENDING", "PENDING"]);
    expect(s.f.rows("feeStatement").find(r => r.id === a.id)!.status).toBe("PAID");
    expect(s.f.rows("payment")).toHaveLength(1);
    expect(s.gateway.cancelLink).toHaveBeenCalledTimes(1);
    expect(s.gateway.cancelLink).toHaveBeenCalledWith(Number(none.orderCode), expect.any(String));
    await expect(expireOrders(s.f.db, s.gateway, NOV18)).resolves.toMatchObject({ expired: 0, paid: 0, failed: 1 });
    expect(s.f.rows("payment")).toHaveLength(1);
    await expect(expireOrders(s.f.db, null, NOV18)).resolves.toEqual({ expired: 0, paid: 0, failed: 0 });
  });

  it("reconciles only recent pending orders and counts failures", async () => {
    const s = await setup();
    await account(s, "u1"); await account(s, "u2");
    const [a, b] = await Promise.all([statement(s, "u1", "2026-11"), statement(s, "u2", "2026-11")]);
    const recent = await order(s, a.id, "u1", { expiredAt: new Date(NOV18.getTime() + 600_000) });
    const old = await order(s, b.id, "u2", { createdAt: new Date(NOV18.getTime() - 3 * 86_400_000) });
    const failing = await order(s, b.id, "u2", { expiredAt: new Date(NOV18.getTime() + 600_000) });
    s.gateway.getLink.mockImplementation(async (code: number) => {
      if (code === Number(recent.orderCode)) return paid("FTR");
      throw new Error("down");
    });
    await expect(reconcilePending(s.f.db, s.gateway, NOV18)).resolves.toEqual({ checked: 1, paid: 1, failed: 1 });
    expect(s.gateway.getLink).not.toHaveBeenCalledWith(Number(old.orderCode));
    expect(s.gateway.getLink).toHaveBeenCalledWith(Number(failing.orderCode));
    expect(s.f.rows("paymentOrder").find(o => o.id === recent.id)!.status).toBe("PAID");
  });
});

describe("stop and resume", () => {
  it("requires terms and the current revision", async () => {
    const s = await setup();
    await expect(s.service.stop("u1", 0)).rejects.toMatchObject({ status: 409, code: "TERMS_REQUIRED" });
    await expect(s.service.resume("u1", 0)).rejects.toMatchObject({ status: 409, code: "TERMS_REQUIRED" });
    await s.service.acceptTerms("u1", "terms-v1");
    await expect(s.service.stop("u1", 5)).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    await expect(s.service.resume("u1", 0)).rejects.toMatchObject({ status: 409, code: "BILLING_NOT_STOPPED" });
  });

  it("stops from the next period and resumes with an immediate statement", async () => {
    const s = await setup();
    await account(s, "u1");
    const stopped = await s.service.stop("u1", 0);
    expect(stopped).toMatchObject({ status: "STOPPED", stoppedFromPeriod: "2026-12", revision: 1 });
    expect(s.f.rows("auditLog").filter(a => a.action === "BILLING_STOPPED")).toHaveLength(1);
    await expect(s.service.stop("u1", 1)).resolves.toMatchObject({ status: "STOPPED", revision: 1 });
    await expect(s.service.resume("u1", 0)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const resumed = await s.service.resume("u1", 1);
    expect(resumed).toMatchObject({ status: "ACTIVE", stoppedFromPeriod: null, revision: 2 });
    expect(s.f.rows("feeStatement")).toMatchObject([{ userId: "u1", period: "2026-11", status: "ISSUED", amountVnd: 49000 }]);
    expect(events(s, "billing.statement_issued")).toHaveLength(1);
    s.setNow(new Date("2026-11-20T05:00:00.000Z"));
    await s.service.stop("u1", 2); await s.service.resume("u1", 3);
    expect(s.f.rows("feeStatement")).toHaveLength(1); // đã có kỳ phí tháng này, không lập thêm
  });

  it("resumes into OVERDUE while an overdue statement is still open, and does not bill a running trial", async () => {
    const s = await setup();
    await account(s, "late", { status: "STOPPED", stoppedFromPeriod: "2026-12", revision: 4 });
    await statement(s, "late", "2026-10", { status: "OVERDUE" });
    await expect(s.service.resume("late", 4)).resolves.toMatchObject({ status: "OVERDUE", stoppedFromPeriod: null });
    expect(s.f.rows("feeStatement")).toHaveLength(1); // kỳ cũ chưa trả: không dồn nợ

    await account(s, "trial", { status: "TRIAL", trialEndsAt: periodStart("2026-12") });
    await s.service.stop("trial", 0);
    await expect(s.service.resume("trial", 1)).resolves.toMatchObject({ status: "TRIAL" });
    expect(s.f.rows("feeStatement").filter(r => r.userId === "trial")).toHaveLength(0);
  });

  it("matches the OpenAPI contract", async () => {
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, uri: true } });
    const check = (path: string, data: unknown) => {
      const validate = ajv.compile(spec.paths[path].post.responses["200"].content["application/json"].schema);
      expect(validate({ data: JSON.parse(JSON.stringify(data)) }), JSON.stringify(validate.errors)).toBe(true);
    };
    const s = await setup();
    await account(s, "u1");
    check("/api/v1/me/billing/stop", await s.service.stop("u1", 0));
    check("/api/v1/me/billing/resume", await s.service.resume("u1", 1));
    expect(spec.paths["/api/v1/me/billing/stop"].post.responses["409"]).toBeTruthy();
  });
});

describe("rolloverSchedules", () => {
  it("announces an upcoming schedule 7 days ahead once, and retires the old one when the new one is in force", async () => {
    const s = await setup();
    const publish = (version: number, effectiveFromPeriod: string) => s.f.db.feeSchedule.create({ data: { id: randomUUID(), version, status: "PUBLISHED", ...SCHEDULE,
      dueDay: 10, reminderDays: [5, 8], trialMonths: 1, effectiveFromPeriod, createdById: "a", publishedById: "a", publishedAt: NOV18 } });
    const v2 = await publish(2, "2026-12"); await publish(3, "2027-03");
    await account(s, "u1"); await account(s, "u2", { status: "TRIAL" }); await account(s, "gone", { status: "STOPPED" });
    await expect(rolloverSchedules(s.f.db, new Date("2026-11-20T05:00:00.000Z"))).resolves.toEqual({ superseded: 0, notified: 0 }); // còn hơn 7 ngày
    await expect(rolloverSchedules(s.f.db, new Date("2026-11-25T05:00:00.000Z"))).resolves.toEqual({ superseded: 0, notified: 2 });
    await expect(rolloverSchedules(s.f.db, new Date("2026-11-26T05:00:00.000Z"))).resolves.toEqual({ superseded: 0, notified: 0 });
    expect(s.f.rows("notification").map(n => n.id)).toEqual([stableId(`billing-schedule:${v2.id}:u1`), stableId(`billing-schedule:${v2.id}:u2`)]);
    await expect(rolloverSchedules(s.f.db, new Date("2026-12-02T05:00:00.000Z"))).resolves.toEqual({ superseded: 1, notified: 0 });
    expect(s.f.rows("feeSchedule").map(r => `${r.version}:${r.status}`)).toEqual(["1:SUPERSEDED", "2:PUBLISHED", "3:PUBLISHED"]);
    await expect(rolloverSchedules(s.f.db, new Date("2026-12-03T05:00:00.000Z"))).resolves.toEqual({ superseded: 0, notified: 0 });
  });
});

describe("billing emails", () => {
  const config = { CLIENT_URL: "https://app.anhuu.test" } as AppConfig;
  async function mail(s: Fixture) {
    const send = vi.fn(async () => undefined);
    return { send, handle: createEventHandler(s.f.db, config, send) };
  }
  const user = (s: Fixture, id: string, status = "ACTIVE") => s.f.db.user.create({ data: { id, email: `${id}@anhuu.test`, fullName: "Nguyễn Văn A", passwordHash: "x", status: status as "ACTIVE" } });

  it("renders the issue and reminder emails from ids only, and skips users who are not ACTIVE", async () => {
    const s = await setup();
    await user(s, "u1"); await user(s, "u2", "SUSPENDED");
    await account(s, "u1"); await account(s, "u2");
    await issueStatements(s.f.db, DEC1_VN);
    const { send, handle } = await mail(s);
    for (const event of events(s, "billing.statement_issued")) expect(Object.keys(event.payload as object)).toEqual(["statementId"]);
    for (const event of events(s, "billing.statement_issued")) await handle(event);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string; html: string; idempotencyKey: string }];
    expect(sent[0]).toMatchObject({ to: "u1@anhuu.test", subject: "Phí dịch vụ An Hưu tháng 12/2026", idempotencyKey: events(s, "billing.statement_issued")[0].id });
    expect(sent[0].text).toContain("49.000đ");
    expect(sent[0].text).toContain("10/12/2026");
    expect(sent[0].text).toContain("https://app.anhuu.test/user/billing/pay/" + s.f.rows("feeStatement")[0].id);
    expect(sent[0].html).toContain("<a href=");

    await remindStatements(s.f.db, DEC5);
    const reminder = events(s, "billing.reminder").find(e => e.entityId === s.f.rows("feeStatement").find(r => r.userId === "u1")!.id)!;
    await handle(reminder);
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1] as unknown as [{ subject: string }])[0].subject).toContain("Nhắc nhẹ");
    // đã thanh toán trước khi email nhắc được gửi: bỏ qua im lặng
    await s.f.db.statementAdjustment.create({ data: { statementId: s.f.rows("feeStatement")[0].id, amountVnd: 49000, reason: "Miễn", createdById: "admin" } });
    await handle(reminder);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sends a receipt (never called an invoice) for a payOS payment", async () => {
    const s = await setup();
    await user(s, "u1"); await account(s, "u1");
    const owed = await statement(s, "u1", "2026-11");
    const created = await s.service.pay("u1", owed.id, randomUUID()) as { orderCode: string };
    const data = { orderCode: Number(created.orderCode), amount: 49000, reference: "FT26112", transactionDateTime: "2026-11-18 12:05:00" };
    await s.service.handleWebhook({ code: "00", desc: "success", success: true, data, signature: signData(KEY, data) });
    const { send, handle } = await mail(s);
    await handle(events(s, "billing.payment_received")[0]);
    const [sent] = send.mock.calls[0] as unknown as [{ subject: string; text: string; html: string }];
    expect(sent.subject).toBe("Biên nhận thanh toán phí dịch vụ An Hưu tháng 11/2026");
    expect(sent.text).toContain("49.000đ");
    expect(sent.text).toContain("FT26112");
    expect(sent.text).toContain("đã được thanh toán đủ");
    expect(`${sent.subject}${sent.text}${sent.html}`).not.toMatch(/hóa đơn/i);
    await s.f.db.user.update({ where: { id: "u1" }, data: { status: "SUSPENDED" } });
    await handle(events(s, "billing.payment_received")[0]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("escapes names, rejects unsafe links and refuses unknown billing events", async () => {
    const mailInput = { kind: "issued" as const, name: "<b>A</b>", period: "2026-12", amountVnd: 49000, dueDate: new Date("2026-12-10T10:00:00Z") };
    expect(renderBillingEmail({ ...mailInput, link: "https://x.test/p" }).html).toContain("&lt;b&gt;A&lt;/b&gt;");
    expect(() => renderBillingEmail({ ...mailInput, link: "javascript:alert(1)" })).toThrow("INVALID_MAIL_LINK");
    const s = await setup();
    const { handle } = await mail(s);
    await expect(handle({ id: randomUUID(), type: "billing.unknown", entityId: "x", payload: {} } as never)).rejects.toThrow("UNSUPPORTED_EVENT");
  });
});
