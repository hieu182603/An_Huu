import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "./memory-db";
import { createErrorHandler } from "../middlewares/errorHandler";
import { BillingAdminService } from "../modules/billing/admin-service";
import { billingAdminRouter } from "../modules/billing/admin-router";
import { adjustInput, createOverrideInput, createScheduleInput, manualPaymentInput, patchScheduleInput, resolveAlertInput } from "../modules/billing/admin-schema";
import { rolloverSchedules, stableId } from "../modules/billing/jobs";
import { dueDateOf } from "../modules/billing/periods";
import { overrideFor } from "../modules/billing/terms";
import type { PaymentGateway } from "../modules/billing/payos";

// The fee base normally comes from the financial profile; the preview tests pin it per user instead.
const bases = vi.hoisted(() => new Map<string, string>());
vi.mock("../modules/billing/terms", async importOriginal => ({
  ...(await importOriginal<typeof import("../modules/billing/terms")>()),
  feeBase: async (_tx: unknown, userId: string) => ({ amount: bases.get(userId) ?? "0", source: { metric: "retirementLiquidAssets", profileRevision: 1, valuationDate: null, issues: [] } }),
}));

const SCHEDULE = { annualRatePercent: "0.5000", minMonthlyVnd: 49000, maxMonthlyVnd: 2000000, roundingStepVnd: 1000 };
const NOW = new Date("2026-11-18T05:00:00.000Z"); // 18/11/2026 12:00 giờ VN, kỳ hiện tại 2026-11
const REASON = "Khách chuyển khoản trực tiếp, đã đối chiếu sao kê";
const ids = { plain: randomUUID(), ops: randomUUID(), sys: randomUUID(), u1: randomUUID(), u2: randomUUID(), u3: randomUUID() };

function fakeGateway() {
  const gateway = {
    createLink: vi.fn(async () => ({ paymentLinkId: "pl", checkoutUrl: "https://pay.payos.vn/x", qrCode: "qr", status: "PENDING" })),
    getLink: vi.fn(async (_code: number) => ({ status: "PENDING", amount: 0, amountPaid: 0, transactions: [] as Array<{ reference: string; amount: number; transactionDateTime: string }> })),
    cancelLink: vi.fn(async (_code: number, _reason?: string) => undefined),
  };
  return gateway as typeof gateway & PaymentGateway;
}
async function setup(options: { enabled?: boolean } = {}) {
  bases.clear();
  const f = memoryDb(), gateway = fakeGateway();
  const schedule = await f.db.feeSchedule.create({ data: { id: randomUUID(), version: 1, status: "PUBLISHED", ...SCHEDULE, dueDay: 10, reminderDays: [5, 8], trialMonths: 1,
    effectiveFromPeriod: "2026-11", note: null, createdById: "system", publishedById: "system", publishedAt: NOW } });
  const admin = (id: string, name: string, roles: string[]) => f.db.user.create({ data: { id, email: `${name}@anhuu.test`, fullName: `Quản trị ${name}`, passwordHash: "x", role: "ADMIN" } })
    .then(() => Promise.all(roles.map(role => f.db.investmentRoleGrant.create({ data: { userId: id, role: role as never, grantedBy: "seed" } }))));
  await admin(ids.plain, "plain", []); await admin(ids.ops, "ops", ["OPERATIONS"]); await admin(ids.sys, "sys", ["SYSTEM_ADMIN"]);
  for (const [id, name] of [[ids.u1, "an"], [ids.u2, "binh"], [ids.u3, "chi"]]) await f.db.user.create({ data: { id, email: `${name}@khach.test`, fullName: `Khách ${name}`, passwordHash: "x" } });
  const service = new BillingAdminService(f.db, gateway, { enabled: options.enabled ?? true, now: () => NOW });
  return { f, gateway, service, schedule };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
const account = (s: Fixture, userId: string, data: Record<string, unknown> = {}) =>
  s.f.db.billingAccount.create({ data: { userId, status: "ACTIVE", termsVersion: "terms-v1", termsAcceptedAt: NOW, ...data } });
const statement = (s: Fixture, userId: string, period: string, data: Record<string, unknown> = {}) =>
  s.f.db.feeStatement.create({ data: { userId, period, baseAmountVnd: "0", baseSource: { metric: "retirementLiquidAssets" }, feeScheduleId: s.schedule.id,
    rawFeeVnd: "0.00", scheduleFeeVnd: 417000, amountVnd: 417000, dueDate: dueDateOf(period, 10), ...data } });
const payment = (s: Fixture, statementId: string, userId: string, amountVnd: number, data: Record<string, unknown> = {}) =>
  s.f.db.payment.create({ data: { statementId, userId, source: "PAYOS", amountVnd, bankReference: `FT${randomUUID().slice(0, 8)}`, receivedAt: NOW, createdAt: NOW, ...data } });
const order = (s: Fixture, statementId: string, userId: string, data: Record<string, unknown> = {}) =>
  s.f.db.paymentOrder.create({ data: { statementId, userId, amountVnd: 417000, expiredAt: new Date(NOW.getTime() + 600_000), checkoutUrl: "https://pay.payos.vn/x", ...data } });
const audits = (s: Fixture, action: string) => s.f.rows("auditLog").filter(row => row.action === action);
const key = () => randomUUID();
const manual = (reference = "MB-001", amountVnd = 417000, receivedAt = "2026-11-17T03:00:00.000Z") => ({ amountVnd, bankReference: reference, receivedAt, reason: REASON });
const draftInput = { annualRatePercent: "1", minMonthlyVnd: 49000, maxMonthlyVnd: 1000000, roundingStepVnd: 1000, dueDay: 10, reminderDays: [5, 8], trialMonths: 1, reason: "Thử nghiệm biểu phí mới cho năm sau" };
const forbidden = { status: 403, code: "FORBIDDEN" };

describe("admin billing roles", () => {
  it("lets a plain ADMIN read but turns every write into a 403 without side effects", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-11"), pay = await payment(s, st.id, ids.u1, 417000), ord = await order(s, st.id, ids.u1);
    const draft = await s.service.createSchedule(ids.sys, draftInput), ov = await s.f.db.userFeeOverride.create({ data: { userId: ids.u1, kind: "WAIVE", fromPeriod: "2027-01", reason: "x", createdById: "a" } });
    const rowsBefore = JSON.stringify([s.f.rows("payment"), s.f.rows("refund"), s.f.rows("statementAdjustment"), s.f.rows("feeStatement"), s.f.rows("feeSchedule"), s.f.rows("userFeeOverride")]);
    const auditsBefore = s.f.rows("auditLog").length;
    await expect(s.service.overview()).resolves.toMatchObject({ period: "2026-11" });
    await expect(s.service.statements({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1 });
    await expect(s.service.statement(st.id)).resolves.toMatchObject({ id: st.id });
    await expect(s.service.orders({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1 });
    await expect(s.service.alerts({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 0 });
    await expect(s.service.schedules()).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(s.service.overrides({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 1 });
    await expect(s.service.exportCsv(ids.plain)).resolves.toMatchObject({ filename: "phi-dich-vu-2026-11.csv" });
    const writes = [
      () => s.service.manualPayment(ids.plain, st.id, manual("X1"), key()),
      () => s.service.refund(ids.plain, pay.id, { amountVnd: 1000, bankReference: "R1", reason: REASON }, key()),
      () => s.service.adjust(ids.plain, st.id, { amountVnd: 1000, reason: REASON }),
      () => s.service.voidStatement(ids.plain, st.id, REASON),
      () => s.service.reconcileOrder(ids.plain, ord.id, REASON),
      () => s.service.resolveAlert(ids.plain, { key: "UNDERPAID:" + ord.id, note: REASON }),
      () => s.service.createSchedule(ids.plain, draftInput),
      () => s.service.patchSchedule(ids.plain, draft.id, { expectedUpdatedAt: draft.updatedAt.toISOString(), reason: REASON, dueDay: 12 }),
      () => s.service.previewSchedule(ids.plain, draft.id),
      () => s.service.publishSchedule(ids.plain, draft.id, { effectiveFromPeriod: "2027-01", reason: REASON }),
      () => s.service.createOverride(ids.plain, ids.u2, { kind: "WAIVE", fromPeriod: "2027-01", reason: REASON }),
      () => s.service.revokeOverride(ids.plain, ov.id, REASON),
      // The grants are not interchangeable: OPERATIONS cannot manage schedules and SYSTEM_ADMIN cannot move money.
      () => s.service.createSchedule(ids.ops, draftInput),
      () => s.service.publishSchedule(ids.ops, draft.id, { effectiveFromPeriod: "2027-01", reason: REASON }),
      () => s.service.manualPayment(ids.sys, st.id, manual("X2"), key()),
      () => s.service.adjust(ids.sys, st.id, { amountVnd: 1000, reason: REASON }),
    ];
    for (const write of writes) await expect(write()).rejects.toMatchObject({ ...forbidden, message: expect.stringContaining("quyền") });
    expect(JSON.stringify([s.f.rows("payment"), s.f.rows("refund"), s.f.rows("statementAdjustment"), s.f.rows("feeStatement"), s.f.rows("feeSchedule"), s.f.rows("userFeeOverride")])).toBe(rowsBefore);
    expect(s.f.rows("auditLog").length).toBe(auditsBefore + 1); // only the CSV export audit (a read that exports personal data)
    expect(gatewayUntouched(s)).toBe(true);
  });
  const gatewayUntouched = (s: Fixture) => s.gateway.getLink.mock.calls.length === 0 && s.gateway.cancelLink.mock.calls.length === 0;

  it("reports which actions the admin may use", async () => {
    const s = await setup();
    await expect(s.service.permissions(ids.plain)).resolves.toEqual({ canOperate: false, canManageSchedules: false });
    await expect(s.service.permissions(ids.ops)).resolves.toEqual({ canOperate: true, canManageSchedules: false });
    await expect(s.service.permissions(ids.sys)).resolves.toEqual({ canOperate: false, canManageSchedules: true });
  });
});

describe("request validation", () => {
  it("requires a reason of at least 10 characters and rejects unknown fields on every write body", () => {
    expect(manualPaymentInput.safeParse({ ...manual(), reason: "ngắn" }).success).toBe(false);
    expect(manualPaymentInput.safeParse({ ...manual(), reason: "         ngắn         " }).success).toBe(false);
    expect(manualPaymentInput.safeParse({ ...manual(), extra: 1 }).success).toBe(false);
    expect(manualPaymentInput.safeParse({ ...manual(), amountVnd: 1.5 }).success).toBe(false);
    expect(manualPaymentInput.safeParse({ ...manual(), amountVnd: 0 }).success).toBe(false);
    expect(manualPaymentInput.safeParse(manual()).success).toBe(true);
    expect(adjustInput.safeParse({ amountVnd: 1000 }).success).toBe(false);
    expect(resolveAlertInput.safeParse({ key: "UNDERPAID:" + randomUUID(), note: "ngắn" }).success).toBe(false);
    expect(resolveAlertInput.safeParse({ key: "OVERPAID:" + randomUUID() + ":49000", note: REASON }).success).toBe(true);
    expect(resolveAlertInput.safeParse({ key: "OTHER:1", note: REASON }).success).toBe(false);
    expect(createOverrideInput.safeParse({ kind: "WAIVE", fromPeriod: "2027-01", reason: "ngắn" }).success).toBe(false);
    expect(createOverrideInput.safeParse({ kind: "WAIVE", fromPeriod: "2027-13", reason: REASON }).success).toBe(false);
  });

  it("enforces the fee schedule rules", () => {
    const ok = (patch: Record<string, unknown>) => createScheduleInput.safeParse({ ...draftInput, ...patch }).success;
    expect(ok({})).toBe(true);
    expect(ok({ annualRatePercent: 0.5 })).toBe(true);
    expect(ok({ annualRatePercent: "100" })).toBe(true);
    expect(ok({ annualRatePercent: "100.0001" })).toBe(false);
    expect(ok({ annualRatePercent: "-1" })).toBe(false);
    expect(ok({ annualRatePercent: "0.12345" })).toBe(false);
    expect(ok({ minMonthlyVnd: -1 })).toBe(false);
    expect(ok({ minMonthlyVnd: 2000000, maxMonthlyVnd: 1000000 })).toBe(false);
    expect(ok({ maxMonthlyVnd: null })).toBe(true);
    expect(ok({ roundingStepVnd: 0 })).toBe(false);
    expect(ok({ dueDay: 0 })).toBe(false);
    expect(ok({ dueDay: 29 })).toBe(false);
    expect(ok({ dueDay: 28 })).toBe(true);
    expect(ok({ reminderDays: [8, 5] })).toBe(false);
    expect(ok({ reminderDays: [5, 5] })).toBe(false);
    expect(ok({ reminderDays: [0, 5] })).toBe(false);
    expect(ok({ reminderDays: [5, 29] })).toBe(false);
    expect(ok({ reminderDays: [] })).toBe(true);
    expect(ok({ trialMonths: 13 })).toBe(false);
    expect(ok({ trialMonths: 0 })).toBe(true);
    expect(ok({ reason: "ngắn" })).toBe(false);
    expect(patchScheduleInput.safeParse({ expectedUpdatedAt: NOW.toISOString(), reason: REASON, dueDay: 12 }).success).toBe(true);
    expect(patchScheduleInput.safeParse({ reason: REASON, dueDay: 12 }).success).toBe(false);
    expect(patchScheduleInput.safeParse({ expectedUpdatedAt: NOW.toISOString(), reason: REASON, minMonthlyVnd: 5, maxMonthlyVnd: 1 }).success).toBe(false);
  });
});

describe("manual payment", () => {
  it("settles the statement, reopens an overdue account and records who did it and why", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-11", { status: "OVERDUE" });
    await account(s, ids.u1, { status: "OVERDUE" });
    const result = await s.service.manualPayment(ids.ops, st.id, manual(), key());
    expect(result).toMatchObject({ payment: { source: "MANUAL_TRANSFER", amountVnd: 417000, bankReference: "MB-001", recordedById: ids.ops, note: REASON }, statement: { status: "PAID", amountDueVnd: 0, overpaidVnd: 0 } });
    expect(s.f.rows("feeStatement")[0]).toMatchObject({ status: "PAID" });
    expect(s.f.rows("feeStatement")[0].paidAt.toISOString()).toBe("2026-11-17T03:00:00.000Z");
    expect(s.f.rows("billingAccount")[0]).toMatchObject({ status: "ACTIVE", revision: 1 });
    expect(audits(s, "BILLING_MANUAL_PAYMENT_RECORDED")).toHaveLength(1);
    expect(audits(s, "BILLING_MANUAL_PAYMENT_RECORDED")[0]).toMatchObject({ targetType: "FEE_STATEMENT", targetId: st.id, performerId: ids.ops, details: { reason: REASON, amountVnd: 417000, statusAfter: "PAID" } });
    expect(s.f.rows("notification")[0]).toMatchObject({ userId: ids.u1, title: "Đã ghi nhận chuyển khoản phí dịch vụ" });
    expect(s.f.rows("outboxEvent").map(event => event.type)).toEqual(["billing.payment_received"]);
    expect(s.gateway.cancelLink).not.toHaveBeenCalled(); // nothing else is invalidated
  });

  it("keeps a partly paid statement open and keeps the account gated while another statement is overdue", async () => {
    const s = await setup();
    const old = await statement(s, ids.u1, "2026-10", { status: "OVERDUE" }), st = await statement(s, ids.u1, "2026-11", { status: "OVERDUE" });
    await account(s, ids.u1, { status: "OVERDUE" });
    await expect(s.service.manualPayment(ids.ops, st.id, manual("MB-PART", 300000), key())).resolves.toMatchObject({ statement: { status: "OVERDUE", amountDueVnd: 117000 } });
    await expect(s.service.manualPayment(ids.ops, st.id, manual("MB-REST", 117000), key())).resolves.toMatchObject({ statement: { status: "PAID" } });
    expect(s.f.rows("billingAccount")[0].status).toBe("OVERDUE"); // 2026-10 is still unpaid
    await s.service.manualPayment(ids.ops, old.id, manual("MB-OLD", 417000), key());
    expect(s.f.rows("billingAccount")[0].status).toBe("ACTIVE");
  });

  it("is idempotent per key, conflicts on a changed body and rejects a reused bank reference with 409", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-11"), other = await statement(s, ids.u2, "2026-11");
    const k = key(), first = await s.service.manualPayment(ids.ops, st.id, manual(), k);
    await expect(s.service.manualPayment(ids.ops, st.id, manual(), k)).resolves.toEqual(first);
    expect(s.f.rows("payment")).toHaveLength(1);
    await expect(s.service.manualPayment(ids.ops, st.id, manual("MB-002"), k)).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    await expect(s.service.manualPayment(ids.ops, other.id, manual(), key())).rejects.toMatchObject({ status: 409, code: "DUPLICATE_BANK_REFERENCE" });
    await expect(s.service.manualPayment(ids.ops, st.id, manual(), "not-a-uuid")).rejects.toThrow();
    expect(s.f.rows("payment")).toHaveLength(1);
  });

  it("refuses voided statements, unknown statements and future dates, and flags overpayment instead of refusing it", async () => {
    const s = await setup();
    const voided = await statement(s, ids.u1, "2026-10", { status: "VOID" }), st = await statement(s, ids.u1, "2026-11");
    await expect(s.service.manualPayment(ids.ops, voided.id, manual(), key())).rejects.toMatchObject({ status: 409, code: "STATEMENT_VOID" });
    await expect(s.service.manualPayment(ids.ops, randomUUID(), manual(), key())).rejects.toMatchObject({ status: 404 });
    await expect(s.service.manualPayment(ids.ops, st.id, manual("MB-F", 1000, "2026-11-19T05:00:00.000Z"), key())).rejects.toMatchObject({ status: 422, code: "RECEIVED_AT_IN_FUTURE" });
    await expect(s.service.manualPayment(ids.ops, st.id, manual("MB-OVER", 500000), key())).resolves.toMatchObject({ statement: { status: "PAID", overpaidVnd: 83000 } });
  });
});

describe("refund", () => {
  async function paid(s: Fixture, period: string, userId = ids.u1) {
    const st = await statement(s, userId, period, { status: "PAID", paidAt: NOW });
    return { st, pay: await payment(s, st.id, userId, 417000, { source: "MANUAL_TRANSFER" }) };
  }
  const refund = (s: Fixture, paymentId: string, amountVnd: number, reference: string, k = key()) => s.service.refund(ids.ops, paymentId, { amountVnd, bankReference: reference, reason: REASON }, k);

  it("never refunds more than the payment minus earlier refunds", async () => {
    const s = await setup();
    const { pay } = await paid(s, "2026-12");
    await expect(refund(s, pay.id, 417001, "R0")).rejects.toMatchObject({ status: 409, code: "REFUND_EXCEEDS_PAYMENT", details: { refundableVnd: 417000 } });
    await expect(refund(s, pay.id, 100000, "R1")).resolves.toMatchObject({ refundableVnd: 317000 });
    await expect(refund(s, pay.id, 317001, "R2")).rejects.toMatchObject({ status: 409, code: "REFUND_EXCEEDS_PAYMENT" });
    await expect(refund(s, pay.id, 317000, "R3")).resolves.toMatchObject({ refundableVnd: 0 });
    await expect(refund(s, pay.id, 1, "R4")).rejects.toMatchObject({ status: 409 });
    await expect(refund(s, randomUUID(), 1, "R5")).rejects.toMatchObject({ status: 404 });
    expect(s.f.rows("refund")).toHaveLength(2);
  });

  it("sends a PAID statement back to ISSUED before its due date and to OVERDUE (gating the account) after it", async () => {
    const s = await setup();
    const future = await paid(s, "2026-12"), past = await paid(s, "2026-11", ids.u2);
    await account(s, ids.u1); await account(s, ids.u2);
    await expect(refund(s, future.pay.id, 417000, "RF1")).resolves.toMatchObject({ statement: { status: "ISSUED", amountDueVnd: 417000 } });
    await expect(refund(s, past.pay.id, 17000, "RF2")).resolves.toMatchObject({ statement: { status: "OVERDUE", amountDueVnd: 17000 } });
    const rows = s.f.rows("feeStatement");
    expect(rows.find(r => r.id === future.st.id)).toMatchObject({ status: "ISSUED", paidAt: null });
    expect(rows.find(r => r.id === past.st.id)).toMatchObject({ status: "OVERDUE", paidAt: null });
    expect(s.f.rows("billingAccount").find(a => a.userId === ids.u1)!.status).toBe("ACTIVE");
    expect(s.f.rows("billingAccount").find(a => a.userId === ids.u2)!.status).toBe("OVERDUE");
    expect(audits(s, "BILLING_REFUND_RECORDED")[1]).toMatchObject({ details: { statusBefore: "PAID", statusAfter: "OVERDUE", reason: REASON } });
    expect(s.f.rows("notification").filter(n => n.title === "Đã ghi nhận hoàn tiền phí dịch vụ")).toHaveLength(2);
  });

  it("keeps the statement PAID when only an overpayment is returned, and replays an idempotency key", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-12", { status: "PAID", paidAt: NOW }), p1 = await payment(s, st.id, ids.u1, 417000), p2 = await payment(s, st.id, ids.u1, 417000);
    const k = key(), first = await refund(s, p2.id, 417000, "RX1", k);
    expect(first).toMatchObject({ statement: { status: "PAID", amountDueVnd: 0, overpaidVnd: 0 } });
    await expect(refund(s, p2.id, 417000, "RX1", k)).resolves.toEqual(first);
    expect(s.f.rows("refund")).toHaveLength(1);
    await expect(refund(s, p1.id, 1000, "RX1")).rejects.toMatchObject({ status: 409, code: "DUPLICATE_BANK_REFERENCE" });
    await expect(refund(s, p1.id, 1000, "RX2", "bad" as never)).rejects.toThrow();
  });

  it("refund policy: waiveRemaining refunds and waives in one step, so the user is not billed or gated again", async () => {
    const s = await setup();
    const past = await paid(s, "2026-11"); await account(s, ids.u1);
    const result = await s.service.refund(ids.ops, past.pay.id, { amountVnd: 417000, bankReference: "RW1", reason: REASON, waiveRemaining: true }, key());
    expect(result).toMatchObject({ statement: { status: "WAIVED", amountDueVnd: 0 } });
    expect(s.f.rows("statementAdjustment")).toEqual([expect.objectContaining({ statementId: past.st.id, amountVnd: 417000 })]);
    expect(s.f.rows("billingAccount")[0].status).toBe("ACTIVE");
    expect(audits(s, "BILLING_REFUND_RECORDED")[0]).toMatchObject({ details: { waiveRemaining: true, statusAfter: "WAIVED" } });
  });
});

describe("adjust and void", () => {
  it("a partial adjustment keeps the statement open, cancels pending payOS orders and tells the user", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-12"), ord = await order(s, st.id, ids.u1), done = await order(s, st.id, ids.u1, { status: "EXPIRED" });
    const result = await s.service.adjust(ids.ops, st.id, { amountVnd: 17000, reason: REASON });
    expect(result).toMatchObject({ statement: { status: "ISSUED", amountDueVnd: 400000 }, adjustment: { amountVnd: 17000, createdById: ids.ops }, cancelledOrders: 1 });
    expect(s.f.rows("paymentOrder").find(o => o.id === ord.id)!.status).toBe("CANCELLED");
    expect(s.f.rows("paymentOrder").find(o => o.id === done.id)!.status).toBe("EXPIRED");
    expect(s.gateway.cancelLink).toHaveBeenCalledTimes(1);
    expect(s.gateway.cancelLink.mock.calls[0][0]).toBe(Number(ord.orderCode));
    expect(s.f.rows("feeStatement")[0].amountVnd).toBe(417000); // the statement itself is immutable
    expect(audits(s, "BILLING_STATEMENT_ADJUSTED")[0]).toMatchObject({ details: { reason: REASON, dueBeforeVnd: 417000, dueAfterVnd: 400000, cancelledOrders: 1 } });
    expect(s.f.rows("notification")[0]).toMatchObject({ userId: ids.u1, title: "Phí dịch vụ tháng này được giảm" });
    expect(JSON.stringify(s.f.rows("notification"))).not.toContain("Khách chuyển khoản"); // the internal reason is not shown to the user
  });

  it("covering the whole due with no payments waives the statement and clears an overdue account; with payments it becomes PAID", async () => {
    const s = await setup();
    const a = await statement(s, ids.u1, "2026-11", { status: "OVERDUE" }), b = await statement(s, ids.u2, "2026-11", { status: "OVERDUE" });
    await account(s, ids.u1, { status: "OVERDUE" });
    await expect(s.service.adjust(ids.ops, a.id, { amountVnd: 417001, reason: REASON })).rejects.toMatchObject({ status: 409, code: "ADJUSTMENT_EXCEEDS_DUE" });
    await expect(s.service.adjust(ids.ops, a.id, { amountVnd: 417000, reason: REASON })).resolves.toMatchObject({ statement: { status: "WAIVED", amountDueVnd: 0 } });
    expect(s.f.rows("feeStatement").find(r => r.id === a.id)).toMatchObject({ status: "WAIVED", paidAt: null });
    expect(s.f.rows("billingAccount")[0].status).toBe("ACTIVE");
    await payment(s, b.id, ids.u2, 300000);
    await expect(s.service.adjust(ids.ops, b.id, { amountVnd: 117000, reason: REASON })).resolves.toMatchObject({ statement: { status: "PAID", amountDueVnd: 0 } });
    expect(s.f.rows("feeStatement").find(r => r.id === b.id)!.status).toBe("PAID");
    await expect(s.service.adjust(ids.ops, b.id, { amountVnd: 1000, reason: REASON })).rejects.toMatchObject({ status: 409, code: "STATEMENT_SETTLED" });
    await expect(s.service.adjust(ids.ops, randomUUID(), { amountVnd: 1000, reason: REASON })).rejects.toMatchObject({ status: 404 });
  });

  it("a gateway failure while cancelling a link never fails the adjustment", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-12"); await order(s, st.id, ids.u1);
    s.gateway.cancelLink.mockRejectedValueOnce(new Error("payOS down"));
    await expect(s.service.adjust(ids.ops, st.id, { amountVnd: 1000, reason: REASON })).resolves.toMatchObject({ cancelledOrders: 1 });
  });

  it("voids a statement issued by mistake, cancels its orders and refuses once money was received", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-11", { status: "OVERDUE" }), ord = await order(s, st.id, ids.u1), paidSt = await statement(s, ids.u2, "2026-11", { status: "PAID" });
    await payment(s, paidSt.id, ids.u2, 417000);
    await account(s, ids.u1, { status: "OVERDUE" });
    await expect(s.service.voidStatement(ids.ops, paidSt.id, REASON)).rejects.toMatchObject({ status: 409, code: "STATEMENT_NOT_VOIDABLE" });
    const partial = await statement(s, ids.u3, "2026-11"); await payment(s, partial.id, ids.u3, 1000);
    await expect(s.service.voidStatement(ids.ops, partial.id, REASON)).rejects.toMatchObject({ status: 409, code: "STATEMENT_HAS_PAYMENTS" });
    await expect(s.service.voidStatement(ids.ops, st.id, REASON)).resolves.toMatchObject({ status: "VOID", cancelledOrders: 1 });
    expect(s.f.rows("feeStatement").find(r => r.id === st.id)!.status).toBe("VOID");
    expect(s.f.rows("paymentOrder").find(o => o.id === ord.id)!.status).toBe("CANCELLED");
    expect(s.f.rows("billingAccount")[0].status).toBe("ACTIVE");
    expect(s.gateway.cancelLink).toHaveBeenCalledTimes(1);
    expect(audits(s, "BILLING_STATEMENT_VOIDED")[0]).toMatchObject({ details: { reason: REASON, statusBefore: "OVERDUE" } });
    await expect(s.service.voidStatement(ids.ops, st.id, REASON)).rejects.toMatchObject({ status: 409, code: "STATEMENT_VOID" });
  });
});

describe("alerts and reconciliation", () => {
  async function fixture() {
    const s = await setup();
    // UNDERPAID: the customer sent 400.000 of 417.000.
    const under = await statement(s, ids.u1, "2026-11"), underOrder = await order(s, under.id, ids.u1, { status: "UNDERPAID" });
    await payment(s, under.id, ids.u1, 400000, { orderId: underOrder.id });
    // OVERPAID: two transfers for one 417.000 statement.
    const over = await statement(s, ids.u2, "2026-11", { status: "PAID" });
    await payment(s, over.id, ids.u2, 417000); await payment(s, over.id, ids.u2, 417000);
    // EXTRA_TRANSFER: payOS reported a second reference for an order that was already paid.
    const extra = await statement(s, ids.u3, "2026-11", { status: "PAID" }), extraOrder = await order(s, extra.id, ids.u3, { status: "PAID" });
    await payment(s, extra.id, ids.u3, 417000, { orderId: extraOrder.id });
    const event = await s.f.db.paymentWebhookEvent.create({ data: { orderCode: extraOrder.orderCode, reference: "FT-EXTRA", signatureValid: true, outcome: "EXTRA_TRANSFER", payload: { amount: 417000, reference: "FT-EXTRA" }, receivedAt: NOW } });
    // Noise that must not alert: duplicate webhook, unknown order, a settled statement with a historical UNDERPAID order.
    await s.f.db.paymentWebhookEvent.create({ data: { orderCode: BigInt(1), reference: "TEST", signatureValid: true, outcome: "UNKNOWN_ORDER", payload: {}, receivedAt: NOW } });
    await s.f.db.paymentWebhookEvent.create({ data: { orderCode: extraOrder.orderCode, reference: "FT-DUP", signatureValid: true, outcome: "DUPLICATE", payload: {}, receivedAt: NOW } });
    const settled = await statement(s, ids.u1, "2026-10", { status: "PAID" }); await order(s, settled.id, ids.u1, { status: "UNDERPAID" }); await payment(s, settled.id, ids.u1, 417000);
    return { s, under, underOrder, over, extra, event };
  }

  it("derives the alerts from the data, filters statements by them and counts them in the overview", async () => {
    const { s, under, underOrder, over, extra, event } = await fixture();
    const list = await s.service.alerts({ page: 1, limit: 20 });
    expect(list.items.map(a => a.key).sort()).toEqual([`EXTRA_TRANSFER:${event.id}`, `OVERPAID:${over.id}:417000`, `UNDERPAID:${underOrder.id}`].sort());
    expect(list.items.find(a => a.type === "UNDERPAID")).toMatchObject({ statementId: under.id, amountVnd: 17000, user: { email: "an@khach.test" }, details: { expectedVnd: 417000, receivedVnd: 400000 } });
    expect(list.items.find(a => a.type === "OVERPAID")).toMatchObject({ statementId: over.id, amountVnd: 417000 });
    expect(list.items.find(a => a.type === "EXTRA_TRANSFER")).toMatchObject({ statementId: extra.id, amountVnd: 417000 });
    expect(list).toMatchObject({ total: 3, unresolvedCount: 3 });
    const flagged = await s.service.statements({ page: 1, limit: 20, hasAlert: true });
    expect(flagged.items.map(i => i.id).sort()).toEqual([under.id, over.id, extra.id].sort());
    expect((await s.service.statements({ page: 1, limit: 20, hasAlert: false })).items.map(i => i.period)).toEqual(["2026-10"]);
    await expect(s.service.overview()).resolves.toMatchObject({ unresolvedAlertCount: 3 });
  });

  it("resolving hides an alert and leaves an audit row; an alert fixed in the ledger vanishes by itself", async () => {
    const { s, underOrder, over } = await fixture();
    await expect(s.service.resolveAlert(ids.ops, { key: `UNDERPAID:${underOrder.id}`, note: "Đã liên hệ khách, khách sẽ chuyển bù" })).resolves.toMatchObject({ resolved: true, type: "UNDERPAID" });
    expect(audits(s, "BILLING_ALERT_RESOLVED")[0]).toMatchObject({ targetType: "BILLING_ALERT", targetId: `UNDERPAID:${underOrder.id}`, performerId: ids.ops, details: { note: "Đã liên hệ khách, khách sẽ chuyển bù", type: "UNDERPAID" } });
    const open = await s.service.alerts({ page: 1, limit: 20 });
    expect(open.items.map(a => a.type).sort()).toEqual(["EXTRA_TRANSFER", "OVERPAID"]);
    expect(open.unresolvedCount).toBe(2);
    const all = await s.service.alerts({ page: 1, limit: 20, includeResolved: true });
    expect(all.total).toBe(3);
    expect(all.items.find(a => a.type === "UNDERPAID")).toMatchObject({ resolved: { note: "Đã liên hệ khách, khách sẽ chuyển bù", byId: ids.ops } });
    await expect(s.service.resolveAlert(ids.ops, { key: `UNDERPAID:${underOrder.id}`, note: REASON })).rejects.toMatchObject({ status: 409, code: "ALERT_ALREADY_RESOLVED" });
    await expect(s.service.resolveAlert(ids.ops, { key: `UNDERPAID:${randomUUID()}`, note: REASON })).rejects.toMatchObject({ status: 404 });
    // Refunding the extra money clears the OVERPAID alert without anyone resolving it.
    const second = s.f.rows("payment").filter(p => p.statementId === over.id)[1];
    await s.service.refund(ids.ops, second.id, { amountVnd: 417000, bankReference: "RF-OVER", reason: REASON }, key());
    expect((await s.service.alerts({ page: 1, limit: 20 })).items.map(a => a.type)).toEqual(["EXTRA_TRANSFER"]);
  });

  it("reconciles one order with payOS on demand and audits it", async () => {
    const s = await setup();
    const st = await statement(s, ids.u1, "2026-11", { status: "OVERDUE" }), ord = await order(s, st.id, ids.u1);
    await account(s, ids.u1, { status: "OVERDUE" });
    s.gateway.getLink.mockResolvedValueOnce({ status: "PAID", amount: 417000, amountPaid: 417000, transactions: [{ reference: "FT77", amount: 417000, transactionDateTime: "2026-11-18 11:00:00" }] });
    await expect(s.service.reconcileOrder(ids.ops, ord.id, REASON)).resolves.toMatchObject({ outcome: "APPLIED", order: { status: "PAID" }, statement: { status: "PAID", amountDueVnd: 0 } });
    await expect(s.service.reconcileOrder(ids.ops, ord.id, REASON)).resolves.toMatchObject({ outcome: "PENDING", order: { status: "PAID" } }); // payOS reports nothing new: no second payment
    expect(s.f.rows("payment")).toHaveLength(1);
    expect(s.f.rows("billingAccount")[0].status).toBe("ACTIVE");
    expect(audits(s, "BILLING_ORDER_RECONCILED")[0]).toMatchObject({ targetType: "PAYMENT_ORDER", targetId: ord.id, details: { outcome: "APPLIED", reason: REASON } });
    await expect(s.service.reconcileOrder(ids.ops, randomUUID(), REASON)).rejects.toMatchObject({ status: 404 });
    const withoutGateway = new BillingAdminService(s.f.db, null, { enabled: true, now: () => NOW });
    await expect(withoutGateway.reconcileOrder(ids.ops, ord.id, REASON)).rejects.toMatchObject({ status: 503 });
  });
});

describe("fee schedules", () => {
  it("creates drafts with the next version number and edits only drafts, guarded by updatedAt", async () => {
    const s = await setup();
    const draft = await s.service.createSchedule(ids.sys, { ...draftInput, annualRatePercent: "0.75", note: "Biểu phí 2027" });
    expect(draft).toMatchObject({ version: 2, status: "DRAFT", annualRatePercent: "0.75", maxMonthlyVnd: 1000000, note: "Biểu phí 2027", createdById: ids.sys, effectiveFromPeriod: null });
    await expect(s.service.createSchedule(ids.sys, draftInput)).resolves.toMatchObject({ version: 3 });
    expect(audits(s, "BILLING_SCHEDULE_CREATED")).toHaveLength(2);
    await new Promise(resolve => setTimeout(resolve, 5));
    const patched = await s.service.patchSchedule(ids.sys, draft.id, { expectedUpdatedAt: draft.updatedAt.toISOString(), reason: REASON, dueDay: 12, maxMonthlyVnd: null });
    expect(patched).toMatchObject({ dueDay: 12, maxMonthlyVnd: null, annualRatePercent: "0.75", minMonthlyVnd: 49000 });
    expect(audits(s, "BILLING_SCHEDULE_UPDATED")[0]).toMatchObject({ details: { reason: REASON, before: { dueDay: 10, maxMonthlyVnd: 1000000 }, after: { dueDay: 12, maxMonthlyVnd: null } } });
    await expect(s.service.patchSchedule(ids.sys, draft.id, { expectedUpdatedAt: draft.updatedAt.toISOString(), reason: REASON, dueDay: 14 })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
  });

  it("refuses to edit or publish anything but a draft and validates a patch against the merged terms", async () => {
    const s = await setup();
    const draft = await s.service.createSchedule(ids.sys, draftInput);
    await expect(s.service.patchSchedule(ids.sys, draft.id, { expectedUpdatedAt: draft.updatedAt.toISOString(), reason: REASON, minMonthlyVnd: 2000000 })).rejects.toThrow(); // above the draft's max of 1.000.000
    await expect(s.service.patchSchedule(ids.sys, s.schedule.id, { expectedUpdatedAt: s.schedule.updatedAt.toISOString(), reason: REASON, dueDay: 12 })).rejects.toMatchObject({ status: 409, code: "SCHEDULE_NOT_DRAFT" });
    await expect(s.service.publishSchedule(ids.sys, s.schedule.id, { effectiveFromPeriod: "2027-01", reason: REASON })).rejects.toMatchObject({ status: 409, code: "SCHEDULE_NOT_DRAFT" });
    await expect(s.service.patchSchedule(ids.sys, randomUUID(), { expectedUpdatedAt: NOW.toISOString(), reason: REASON, dueDay: 12 })).rejects.toMatchObject({ status: 404 });
  });

  it("previews the impact on every active account before publishing", async () => {
    const s = await setup();
    for (const [userId, status, base] of [["p1", "ACTIVE", "1000000000"], ["p2", "ACTIVE", "0"], ["p3", "OVERDUE", "10000000000"], ["p4", "ACTIVE", "1200000000"], ["p5", "ACTIVE", "100000000"], ["p6", "STOPPED", "5000000000"], ["p7", "TRIAL", "0"]])
      { await account(s, userId, { status }); bases.set(userId, base); await s.f.db.user.create({ data: { id: userId, email: `${userId}@khach.test`, fullName: `Khách ${userId}`, passwordHash: "x" } }); }
    await s.f.db.userFeeOverride.create({ data: { userId: "p4", kind: "WAIVE", fromPeriod: "2026-12", reason: "ưu đãi", createdById: "a" } });
    const draft = await s.service.createSchedule(ids.sys, draftInput); // 1%, max 1.000.000
    const preview = await s.service.previewSchedule(ids.sys, draft.id);
    expect(preview).toMatchObject({ period: "2026-12", accountCount: 6, current: { id: s.schedule.id, version: 1 }, draft: { id: draft.id, version: 2 },
      totalBeforeVnd: 417000 + 49000 + 2000000 + 0 + 49000 + 49000, totalAfterVnd: 834000 + 49000 + 1000000 + 0 + 84000 + 49000,
      counts: { up: 2, down: 1, same: 3 } });
    expect(preview.totalDeltaVnd).toBe(preview.totalAfterVnd - preview.totalBeforeVnd);
    expect(preview.topChanges.map(c => [c.userId, c.beforeVnd, c.afterVnd, c.deltaVnd, c.email])).toEqual([
      ["p3", 2000000, 1000000, -1000000, "p3@khach.test"], ["p1", 417000, 834000, 417000, "p1@khach.test"], ["p5", 49000, 84000, 35000, "p5@khach.test"]]);
    expect(s.f.rows("feeSchedule").find(r => r.id === draft.id)!.status).toBe("DRAFT"); // read only
    expect(s.f.rows("notification")).toHaveLength(0);
  });

  it("keeps only the 20 largest changes", async () => {
    const s = await setup();
    for (let i = 0; i < 25; i++) { const id = `bulk${i}`; await account(s, id); bases.set(id, String(100_000_000 + i * 50_000_000)); }
    const draft = await s.service.createSchedule(ids.sys, { ...draftInput, minMonthlyVnd: 0 });
    const preview = await s.service.previewSchedule(ids.sys, draft.id);
    expect(preview.accountCount).toBe(25);
    expect(preview.topChanges).toHaveLength(20);
    const deltas = preview.topChanges.map(c => Math.abs(c.deltaVnd));
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
  });

  it("publishes from a future period, notifies accounts once with the rollover job's ids and refuses periods already issued", async () => {
    const s = await setup();
    await account(s, "n1"); await account(s, "n2", { status: "TRIAL" }); await account(s, "n3", { status: "STOPPED" });
    const draft = await s.service.createSchedule(ids.sys, draftInput);
    await expect(s.service.publishSchedule(ids.sys, draft.id, { effectiveFromPeriod: "2026-11", reason: REASON })).rejects.toMatchObject({ status: 422, code: "EFFECTIVE_PERIOD_TOO_EARLY" });
    await statement(s, ids.u1, "2027-01");
    await expect(s.service.publishSchedule(ids.sys, draft.id, { effectiveFromPeriod: "2027-01", reason: REASON })).rejects.toMatchObject({ status: 409, code: "PERIOD_ALREADY_ISSUED" });
    await expect(s.service.publishSchedule(ids.sys, draft.id, { effectiveFromPeriod: "2026-12", reason: REASON })).rejects.toMatchObject({ status: 409, code: "PERIOD_ALREADY_ISSUED" }); // 2027-01 exists, so 2026-12 is not "clean" either
    s.f.rows("feeStatement").length = 0;
    const published = await s.service.publishSchedule(ids.sys, draft.id, { effectiveFromPeriod: "2027-01", reason: REASON });
    expect(published).toMatchObject({ status: "PUBLISHED", effectiveFromPeriod: "2027-01", publishedById: ids.sys, notified: 2 });
    expect(s.f.rows("feeSchedule").find(r => r.id === draft.id)).toMatchObject({ status: "PUBLISHED", effectiveFromPeriod: "2027-01", publishedById: ids.sys });
    expect(s.f.rows("feeSchedule").find(r => r.id === draft.id)!.publishedAt.toISOString()).toBe(NOW.toISOString());
    expect(s.f.rows("notification").map(n => n.id).sort()).toEqual([stableId(`billing-schedule:${draft.id}:n1`), stableId(`billing-schedule:${draft.id}:n2`)].sort());
    expect(audits(s, "BILLING_SCHEDULE_PUBLISHED")[0]).toMatchObject({ targetId: draft.id, details: { reason: REASON, effectiveFromPeriod: "2027-01", version: 2 } });
    // The 7-day rollover announcement finds the same ids and stays silent.
    await expect(rolloverSchedules(s.f.db, new Date("2026-12-26T05:00:00.000Z"))).resolves.toMatchObject({ notified: 0 });
    expect(s.f.rows("notification")).toHaveLength(2);
    // Publishing is one-way and a second upcoming schedule cannot start earlier than a published one.
    await expect(s.service.publishSchedule(ids.sys, draft.id, { effectiveFromPeriod: "2027-02", reason: REASON })).rejects.toMatchObject({ code: "SCHEDULE_NOT_DRAFT" });
    const later = await s.service.createSchedule(ids.sys, draftInput);
    await expect(s.service.publishSchedule(ids.sys, later.id, { effectiveFromPeriod: "2027-01", reason: REASON })).rejects.toMatchObject({ status: 409, code: "SCHEDULE_PERIOD_CONFLICT" });
    await expect(s.service.publishSchedule(ids.sys, later.id, { effectiveFromPeriod: "2027-03", reason: REASON })).resolves.toMatchObject({ status: "PUBLISHED" });
  });
});

describe("per-user overrides", () => {
  const create = (s: Fixture, input: Record<string, unknown>, userId = ids.u1) => s.service.createOverride(ids.ops, userId, { reason: REASON, ...input } as never);

  it("validates the value for each kind like the database constraints do", async () => {
    const s = await setup();
    await expect(create(s, { kind: "WAIVE", value: "10", fromPeriod: "2027-01" })).rejects.toMatchObject({ status: 400 });
    await expect(create(s, { kind: "DISCOUNT_PERCENT", fromPeriod: "2027-01" })).rejects.toMatchObject({ status: 400 });
    for (const value of ["0", "100.01", "-5", "abc", "12.12345"]) await expect(create(s, { kind: "DISCOUNT_PERCENT", value, fromPeriod: "2027-01" })).rejects.toMatchObject({ status: 400 });
    for (const value of ["-1", "1.5", "abc", "1000000000000"]) await expect(create(s, { kind: "FIXED_AMOUNT", value, fromPeriod: "2027-01" })).rejects.toMatchObject({ status: 400 });
    await expect(create(s, { kind: "FIXED_AMOUNT", fromPeriod: "2027-01" })).rejects.toMatchObject({ status: 400 });
    expect(s.f.rows("userFeeOverride")).toHaveLength(0);
    await expect(create(s, { kind: "DISCOUNT_PERCENT", value: 12.5, fromPeriod: "2027-01", toPeriod: "2027-03" })).resolves.toMatchObject({ kind: "DISCOUNT_PERCENT", value: "12.5", fromPeriod: "2027-01", toPeriod: "2027-03", user: { email: "an@khach.test" } });
    await expect(create(s, { kind: "FIXED_AMOUNT", value: "99000", fromPeriod: "2027-04" })).resolves.toMatchObject({ kind: "FIXED_AMOUNT", value: "99000" });
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2027-02" }, ids.u2)).resolves.toMatchObject({ kind: "WAIVE", value: null });
    expect(audits(s, "BILLING_OVERRIDE_CREATED")).toHaveLength(3);
    expect(audits(s, "BILLING_OVERRIDE_CREATED")[0]).toMatchObject({ targetType: "USER_FEE_OVERRIDE", details: { userId: ids.u1, reason: REASON } });
    expect(s.f.rows("notification").filter(n => n.title === "Bạn được áp dụng ưu đãi phí dịch vụ")).toHaveLength(3);
  });

  it("only starts from the next period and rejects overlapping active overrides for the same user", async () => {
    const s = await setup();
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2026-11" })).rejects.toMatchObject({ status: 422, code: "OVERRIDE_PERIOD_TOO_EARLY" });
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2026-10" })).rejects.toMatchObject({ status: 422 });
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2027-03", toPeriod: "2027-01" })).rejects.toMatchObject({ status: 422, code: "OVERRIDE_PERIOD_ORDER" });
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2026-12" }, randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2026-12" }, ids.plain)).rejects.toMatchObject({ status: 404 }); // admins are not billed
    const first = await create(s, { kind: "WAIVE", fromPeriod: "2027-01", toPeriod: "2027-03" });
    for (const [from, to] of [["2027-01", "2027-03"], ["2026-12", "2027-01"], ["2027-03", undefined], ["2027-02", "2027-02"], ["2026-12", undefined]])
      await expect(create(s, { kind: "WAIVE", fromPeriod: from, toPeriod: to })).rejects.toMatchObject({ status: 409, code: "OVERRIDE_OVERLAP", details: { overrideId: first.id } });
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2027-04" })).resolves.toMatchObject({ toPeriod: null }); // adjacent is fine
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2030-01" })).rejects.toMatchObject({ status: 409 }); // open-ended earlier override covers it
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2027-01", toPeriod: "2027-03" }, ids.u2)).resolves.toMatchObject({ userId: ids.u2 }); // other users unaffected
    expect(s.f.rows("userFeeOverride")).toHaveLength(3);
  });

  it("revokes from the next period: a started override ends with the current period, an unstarted one is withdrawn", async () => {
    const s = await setup();
    const started = await s.f.db.userFeeOverride.create({ data: { userId: ids.u1, kind: "DISCOUNT_PERCENT", value: "50", fromPeriod: "2026-10", reason: "cũ", createdById: "a" } });
    const future = await create(s, { kind: "WAIVE", fromPeriod: "2027-01" }, ids.u2);
    await expect(s.service.revokeOverride(ids.ops, started.id, REASON)).resolves.toMatchObject({ effect: "END_AT_CURRENT_PERIOD", toPeriod: "2026-11", revokedAt: null });
    await expect(s.service.revokeOverride(ids.ops, future.id, REASON)).resolves.toMatchObject({ effect: "REVOKED_BEFORE_START", revokedById: ids.ops });
    expect(s.f.rows("userFeeOverride").find(r => r.id === started.id)).toMatchObject({ toPeriod: "2026-11", revokedAt: null });
    expect(s.f.rows("userFeeOverride").find(r => r.id === future.id)!.revokedAt).toEqual(NOW);
    // The current period keeps the discount (its statement may not be issued yet); the next one does not get it.
    expect(await overrideFor(s.f.db, ids.u1, "2026-11")).toMatchObject({ id: started.id });
    expect(await overrideFor(s.f.db, ids.u1, "2026-12")).toBeNull();
    expect(await overrideFor(s.f.db, ids.u2, "2027-01")).toBeNull();
    await expect(s.service.revokeOverride(ids.ops, future.id, REASON)).rejects.toMatchObject({ status: 409, code: "OVERRIDE_REVOKED" });
    await expect(s.service.revokeOverride(ids.ops, started.id, REASON)).rejects.toMatchObject({ status: 409, code: "OVERRIDE_ENDED" });
    await expect(s.service.revokeOverride(ids.ops, randomUUID(), REASON)).rejects.toMatchObject({ status: 404 });
    expect(audits(s, "BILLING_OVERRIDE_REVOKED")).toHaveLength(2);
    expect(audits(s, "BILLING_OVERRIDE_REVOKED")[0]).toMatchObject({ details: { mode: "END_AT_CURRENT_PERIOD", toPeriod: "2026-11", reason: REASON } });
    // A revoked override frees the slot for a new one, and only unfinished overrides are listed.
    await expect(create(s, { kind: "WAIVE", fromPeriod: "2027-01" }, ids.u2)).resolves.toMatchObject({ fromPeriod: "2027-01" });
    const list = await s.service.overrides({ page: 1, limit: 20 });
    expect(list.items.map(i => `${i.userId === ids.u1 ? "u1" : "u2"}:${i.fromPeriod}`).sort()).toEqual(["u1:2026-10", "u2:2027-01"]);
    await s.f.db.userFeeOverride.update({ where: { id: started.id }, data: { toPeriod: "2026-10" } });
    expect((await s.service.overrides({ page: 1, limit: 20, userId: ids.u1 })).total).toBe(0);
  });
});

describe("reading", () => {
  async function ledgerFixture() {
    const s = await setup();
    const paid = await statement(s, ids.u1, "2026-11", { status: "PAID", paidAt: NOW }); await payment(s, paid.id, ids.u1, 417000, { bankReference: "FT-A", receivedAt: new Date("2026-11-05T05:00:00.000Z") });
    const open = await statement(s, ids.u2, "2026-11", { amountVnd: 49000, scheduleFeeVnd: 49000 });
    const overdue = await statement(s, ids.u3, "2026-11", { status: "OVERDUE", amountVnd: 100000, scheduleFeeVnd: 100000 });
    await payment(s, overdue.id, ids.u3, 60000, { bankReference: "FT-B" }); await s.f.db.statementAdjustment.create({ data: { statementId: overdue.id, amountVnd: 10000, reason: "Giảm", createdById: ids.ops } });
    const waived = await statement(s, ids.u1, "2026-09", { status: "WAIVED", amountVnd: 0, scheduleFeeVnd: 49000 });
    await statement(s, randomUUID(), "2026-11", { status: "VOID", amountVnd: 50000, scheduleFeeVnd: 50000 });
    const lastMonth = await statement(s, ids.u1, "2026-10", { status: "PAID", amountVnd: 100000, scheduleFeeVnd: 100000 });
    const lastPay = await payment(s, lastMonth.id, ids.u1, 100000); await s.f.db.refund.create({ data: { paymentId: lastPay.id, amountVnd: 20000, bankReference: "RF", reason: "x", recordedById: ids.ops } });
    return { s, paid, open, overdue, waived };
  }

  it("computes the overview totals, counts and a 12 month series", async () => {
    const { s } = await ledgerFixture();
    const overview = await s.service.overview();
    expect(overview).toMatchObject({ period: "2026-11",
      totals: { dueTotalVnd: 417000 + 49000 + 90000, collectedVnd: 417000 + 60000, remainingVnd: 49000 + 30000, overpaidVnd: 0, collectionRate: 0.8579 },
      statusCounts: { ISSUED: 1, PAID: 1, OVERDUE: 1, WAIVED: 0, VOID: 1 } });
    expect(overview.series).toHaveLength(12);
    expect(overview.series[0].period).toBe("2025-12");
    expect(overview.series[11].period).toBe("2026-11");
    expect(overview.series.find(p => p.period === "2026-10")).toMatchObject({ statementCount: 1, dueTotalVnd: 100000, collectedVnd: 80000, remainingVnd: 0, collectionRate: 0.8 });
    expect(overview.series.find(p => p.period === "2026-09")).toMatchObject({ statementCount: 1, dueTotalVnd: 0, collectedVnd: 0, collectionRate: 0 });
    await expect(s.service.overview("2026-10")).resolves.toMatchObject({ period: "2026-10", totals: { dueTotalVnd: 100000, collectedVnd: 80000 }, statusCounts: { PAID: 1 } });
    await expect(setup().then(x => x.service.overview())).resolves.toMatchObject({ totals: { dueTotalVnd: 0, collectionRate: 0 }, unresolvedAlertCount: 0 });
  });

  it("filters, searches and paginates statements", async () => {
    const { s, overdue } = await ledgerFixture();
    const list = (q: Record<string, unknown>) => s.service.statements({ page: 1, limit: 20, ...q } as never);
    await expect(list({ period: "2026-11" })).resolves.toMatchObject({ total: 4 });
    await expect(list({ status: "PAID" })).resolves.toMatchObject({ total: 2 });
    await expect(list({ overdueOnly: true })).resolves.toMatchObject({ total: 1, items: [{ id: overdue.id, amountDueVnd: 30000, adjustedVnd: 10000, paidVnd: 60000, user: { email: "chi@khach.test" } }] });
    await expect(list({ overdueOnly: true, status: "PAID" })).resolves.toMatchObject({ total: 0 });
    await expect(list({ q: "AN@KHACH" })).resolves.toMatchObject({ total: 3 }); // case-insensitive e-mail search: u1 has three statements
    await expect(list({ q: "khách binh" })).resolves.toMatchObject({ total: 1 });
    await expect(list({ q: "không có ai" })).resolves.toMatchObject({ total: 0, items: [] });
    const page2 = await list({ limit: 2, page: 2 });
    expect(page2).toMatchObject({ page: 2, limit: 2 });
    expect(page2.items).toHaveLength(2);
    expect((await list({})).items.map(i => i.period)).toEqual(["2026-11", "2026-11", "2026-11", "2026-11", "2026-10", "2026-09"]); // newest period first
  });

  it("shows a statement with everything behind it, webhook payloads masked and the audit trail", async () => {
    const { s, overdue } = await ledgerFixture();
    const ord = await order(s, overdue.id, ids.u3, { status: "UNDERPAID" });
    await s.f.db.paymentWebhookEvent.create({ data: { orderCode: ord.orderCode, reference: "FT-B", signatureValid: true, outcome: "UNDERPAID", receivedAt: NOW,
      payload: { amount: 60000, accountNumber: "0123456789", counterAccountNumber: "9876543210", counterAccountName: "NGUYEN VAN A", reference: "FT-B" } } });
    await s.service.adjust(ids.ops, overdue.id, { amountVnd: 5000, reason: REASON });
    const detail = await s.service.statement(overdue.id);
    expect(detail).toMatchObject({ id: overdue.id, user: { email: "chi@khach.test", fullName: "Khách chi" }, status: "OVERDUE", amountDueVnd: 25000, adjustedVnd: 15000,
      schedule: { version: 1 }, payments: [{ bankReference: "FT-B", amountVnd: 60000, refundedVnd: 0, refundableVnd: 60000 }],
      adjustments: [{ amountVnd: 10000 }, { amountVnd: 5000, createdById: ids.ops, reason: REASON }] });
    expect(detail.orders).toHaveLength(1);
    expect(detail.webhookEvents[0].payload).toMatchObject({ accountNumber: "****6789", counterAccountNumber: "****3210", counterAccountName: "[masked]", amount: 60000 });
    expect(JSON.stringify(detail)).not.toContain("0123456789");
    expect(detail.auditTrail[0]).toMatchObject({ action: "BILLING_STATEMENT_ADJUSTED", performerName: "Quản trị viên", performer: { email: "ops@anhuu.test" }, details: { reason: REASON } });
    await expect(s.service.statement(randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("lists orders by status and date range, and the billing tab of one user", async () => {
    const { s, open } = await ledgerFixture();
    const old = await order(s, open.id, ids.u2, { status: "EXPIRED", createdAt: new Date("2026-10-01T05:00:00.000Z") });
    const recent = await order(s, open.id, ids.u2, { createdAt: new Date("2026-11-18T01:00:00.000Z") });
    await payment(s, open.id, ids.u2, 49000, { orderId: recent.id, bankReference: "FT-ORD" });
    await expect(s.service.orders({ page: 1, limit: 20 })).resolves.toMatchObject({ total: 2 });
    await expect(s.service.orders({ page: 1, limit: 20, status: "EXPIRED" })).resolves.toMatchObject({ total: 1, items: [{ id: old.id, user: { email: "binh@khach.test" }, period: "2026-11" }] });
    const ranged = await s.service.orders({ page: 1, limit: 20, from: "2026-11-18", to: "2026-11-18" });
    expect(ranged).toMatchObject({ total: 1, items: [{ id: recent.id, bankReference: "FT-ORD", receivedVnd: 49000, statementStatus: "ISSUED" }] });
    await expect(s.service.orders({ page: 1, limit: 20, from: "2026-11-19" })).resolves.toMatchObject({ total: 0 });
    await account(s, ids.u1);
    await s.f.db.userFeeOverride.create({ data: { userId: ids.u1, kind: "WAIVE", fromPeriod: "2027-01", reason: "x", createdById: "a" } });
    const tab = await s.service.userBilling(ids.u1);
    expect(tab).toMatchObject({ user: { email: "an@khach.test" }, account: { status: "ACTIVE" }, overrides: [{ kind: "WAIVE" }] });
    expect(tab.statements.map(r => r.period)).toEqual(["2026-11", "2026-10", "2026-09"]);
    await expect(s.service.userBilling(randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(setup().then(x => x.service.userBilling(ids.u2))).resolves.toMatchObject({ account: null, statements: [], overrides: [] });
  });
});

describe("accounting CSV", () => {
  it("exports one UTF-8 row per statement with a BOM, neutralised formulas and ledger totals", async () => {
    const s = await setup();
    await s.f.db.user.update({ where: { id: ids.u2 }, data: { fullName: '=HYPERLINK("http://x","click")', email: "+evil@khach.test" } });
    const a = await statement(s, ids.u1, "2026-11", { status: "PAID", paidAt: NOW, baseAmountVnd: "1000000000", scheduleFeeVnd: 417000 });
    await payment(s, a.id, ids.u1, 200000, { bankReference: "FT-1", receivedAt: new Date("2026-11-05T05:00:00.000Z") });
    await payment(s, a.id, ids.u1, 217000, { source: "MANUAL_TRANSFER", bankReference: "MB,2", receivedAt: new Date("2026-11-30T17:30:00.000Z") });
    await statement(s, ids.u2, "2026-11", { amountVnd: 49000, scheduleFeeVnd: 49000 });
    await statement(s, ids.u3, "2026-10");
    const result = await s.service.exportCsv(ids.plain, "2026-11");
    expect(result.filename).toBe("phi-dich-vu-2026-11.csv");
    expect(result.content.charCodeAt(0)).toBe(0xfeff);
    const lines = result.content.slice(1).split("\r\n");
    expect(lines.pop()).toBe("");
    expect(lines[0]).toBe('"Kỳ","Email","Họ tên","Căn cứ phí (VND)","Phí theo biểu (VND)","Phí phải thu (VND)","Điều chỉnh (VND)","Đã thu (VND)","Đã hoàn (VND)","Còn phải thu (VND)","Trạng thái","Mã tham chiếu ngân hàng","Ngày thu"');
    expect(lines).toHaveLength(3);
    const rowOf = (email: string) => lines.find(line => line.includes(email))!;
    expect(rowOf("an@khach.test")).toBe('"2026-11","an@khach.test","Khách an","1000000000","417000","417000","0","417000","0","0","Đã thanh toán","FT-1; MB,2","2026-12-01"');
    expect(rowOf("evil@khach.test")).toBe(`"2026-11","'+evil@khach.test","'=HYPERLINK(""http://x"",""click"")","0","49000","49000","0","0","0","49000","Chờ thanh toán","",""`);
    expect(audits(s, "BILLING_EXPORT_CSV")[0]).toMatchObject({ performerId: ids.plain, details: { period: "2026-11", rows: 2 } });
    await expect(s.service.exportCsv(ids.plain)).resolves.toMatchObject({ filename: "phi-dich-vu-2026-11.csv" });
    expect((await s.service.exportCsv(ids.plain, "2030-01")).content).toBe(String.fromCharCode(0xfeff) + lines[0] + "\r\n");
  });
});

describe("admin billing HTTP", () => {
  function app(service: BillingAdminService) {
    const server = express();
    server.use(express.json());
    server.use((req, _res, next) => { (req as unknown as { user: { userId: string } }).user = { userId: String(req.get("x-admin")) }; next(); });
    server.use("/admin/billing", billingAdminRouter(service));
    server.use(createErrorHandler());
    return server;
  }
  it("maps validation, grants and idempotency to HTTP errors", async () => {
    const s = await setup(), http = app(s.service);
    const st = await statement(s, ids.u1, "2026-11");
    const url = `/admin/billing/statements/${st.id}/manual-payment`;
    const post = (admin: string, body: unknown, headers: Record<string, string> = { "Idempotency-Key": key() }) => request(http).post(url).set("x-admin", admin).set(headers).send(body as object);
    const noReason = await post(ids.ops, { ...manual(), reason: "ngắn" });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { reason: [expect.stringContaining("10 ký tự")] } });
    expect((await post(ids.ops, { ...manual(), extra: true })).status).toBe(400);
    const missingKey = await post(ids.ops, manual(), {});
    expect(missingKey.status).toBe(400);
    expect((await post(ids.ops, manual(), { "Idempotency-Key": "abc" })).status).toBe(400);
    const denied = await post(ids.plain, manual());
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toContain("OPERATIONS");
    const created = await post(ids.ops, manual());
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ payment: { amountVnd: 417000 }, statement: { status: "PAID" } });
    expect((await post(ids.ops, manual())).status).toBe(409); // same reference, new key
    const read = await request(http).get("/admin/billing/statements").query({ period: "2026-11", status: "PAID" }).set("x-admin", ids.plain);
    expect(read.status).toBe(200);
    expect(read.headers["cache-control"]).toBe("no-store");
    expect(read.body.data).toMatchObject({ total: 1, items: [{ id: st.id }] });
    expect((await request(http).get("/admin/billing/statements").query({ period: "2026-13" }).set("x-admin", ids.plain)).status).toBe(400);
    expect((await request(http).get("/admin/billing/statements").query({ hacker: "1" }).set("x-admin", ids.plain)).status).toBe(400);
    expect((await request(http).get("/admin/billing/statements/not-a-uuid").set("x-admin", ids.plain)).status).toBe(400);
    expect((await request(http).get("/admin/billing/permissions").set("x-admin", ids.ops)).body.data).toEqual({ canOperate: true, canManageSchedules: false });
    const csv = await request(http).get("/admin/billing/export.csv").query({ period: "2026-11" }).set("x-admin", ids.plain);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toBe('attachment; filename="phi-dich-vu-2026-11.csv"');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    const refundBody = { amountVnd: 1000, bankReference: "RF-HTTP", reason: REASON };
    const pay = s.f.rows("payment")[0];
    expect((await request(http).post(`/admin/billing/payments/${pay.id}/refund`).set("x-admin", ids.ops).send(refundBody)).status).toBe(400); // key required
    expect((await request(http).post(`/admin/billing/payments/${pay.id}/refund`).set("x-admin", ids.ops).set("Idempotency-Key", key()).send(refundBody)).status).toBe(201);
    expect((await request(http).post(`/admin/billing/fee-schedules`).set("x-admin", ids.ops).send(draftInput)).status).toBe(403);
    expect((await request(http).post(`/admin/billing/fee-schedules`).set("x-admin", ids.sys).send({ ...draftInput, dueDay: 31 })).status).toBe(400);
    expect((await request(http).post(`/admin/billing/fee-schedules`).set("x-admin", ids.sys).send(draftInput)).status).toBe(201);
  });
  it("answers 503 BILLING_DISABLED on every route while billing is off", async () => {
    const s = await setup({ enabled: false });
    const res = await request(app(s.service)).get("/admin/billing/overview").set("x-admin", ids.plain);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("BILLING_DISABLED");
    expect((await request(app(s.service)).get("/admin/billing/permissions").set("x-admin", ids.plain)).status).toBe(503);
  });
});

describe("admin billing OpenAPI contract", () => {
  it("matches real service responses and documents every endpoint", async () => {
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, uri: true } });
    const check = (path: string, method: string, data: unknown, status = "200") => {
      const operation = spec.paths[path]?.[method];
      expect(operation, `${method} ${path}`).toBeTruthy();
      const validate = ajv.compile(operation.responses[status].content["application/json"].schema);
      expect(validate({ data: JSON.parse(JSON.stringify(data)) }), `${method} ${path}: ${JSON.stringify(validate.errors)}`).toBe(true);
    };
    const s = await setup();
    // A little of everything so every response shape is populated.
    const st = await statement(s, ids.u1, "2026-11", { status: "OVERDUE" }), ord = await order(s, st.id, ids.u1, { status: "UNDERPAID" });
    await payment(s, st.id, ids.u1, 400000, { orderId: ord.id });
    await s.f.db.paymentWebhookEvent.create({ data: { orderCode: ord.orderCode, reference: "FT-1", signatureValid: true, outcome: "UNDERPAID", payload: { amount: 400000 }, receivedAt: NOW } });
    await account(s, ids.u1, { status: "OVERDUE" }); bases.set(ids.u1, "1000000000");
    const base = "/api/v1/admin/billing";
    check(`${base}/permissions`, "get", await s.service.permissions(ids.ops));
    check(`${base}/overview`, "get", await s.service.overview());
    check(`${base}/statements`, "get", await s.service.statements({ page: 1, limit: 20 }));
    check(`${base}/statements/{id}`, "get", await s.service.statement(st.id));
    check(`${base}/orders`, "get", await s.service.orders({ page: 1, limit: 20 }));
    const alerts = await s.service.alerts({ page: 1, limit: 20 });
    expect(alerts.items).toHaveLength(1);
    check(`${base}/alerts`, "get", alerts);
    check(`${base}/alerts/resolve`, "post", await s.service.resolveAlert(ids.ops, { key: alerts.items[0].key, note: REASON }));
    check(`${base}/statements/{id}/manual-payment`, "post", await s.service.manualPayment(ids.ops, st.id, manual("MB-C", 5000), key()), "201");
    const pay = s.f.rows("payment")[0];
    check(`${base}/payments/{id}/refund`, "post", await s.service.refund(ids.ops, pay.id, { amountVnd: 1000, bankReference: "RF-C", reason: REASON }, key()), "201");
    check(`${base}/statements/{id}/adjust`, "post", await s.service.adjust(ids.ops, st.id, { amountVnd: 1000, reason: REASON }), "201");
    s.gateway.getLink.mockResolvedValueOnce({ status: "PENDING", amount: 417000, amountPaid: 0, transactions: [] });
    const pending = await order(s, st.id, ids.u1);
    check(`${base}/orders/{id}/reconcile`, "post", await s.service.reconcileOrder(ids.ops, pending.id, REASON));
    const spare = await statement(s, ids.u2, "2026-11");
    check(`${base}/statements/{id}/void`, "post", await s.service.voidStatement(ids.ops, spare.id, REASON));
    const draft = await s.service.createSchedule(ids.sys, draftInput);
    check(`${base}/fee-schedules`, "get", await s.service.schedules());
    check(`${base}/fee-schedules`, "post", draft, "201");
    check(`${base}/fee-schedules/{id}`, "patch", await s.service.patchSchedule(ids.sys, draft.id, { expectedUpdatedAt: draft.updatedAt.toISOString(), reason: REASON, dueDay: 12 }));
    await account(s, ids.u3, { status: "ACTIVE" }); bases.set(ids.u3, "100000000");
    check(`${base}/fee-schedules/{id}/preview`, "post", await s.service.previewSchedule(ids.sys, draft.id));
    check(`${base}/fee-schedules/{id}/publish`, "post", await s.service.publishSchedule(ids.sys, draft.id, { effectiveFromPeriod: "2027-01", reason: REASON }));
    const override = await s.service.createOverride(ids.ops, ids.u1, { kind: "DISCOUNT_PERCENT", value: "10", fromPeriod: "2027-01", reason: REASON });
    check(`${base}/users/{userId}/overrides`, "post", override, "201");
    check(`${base}/overrides`, "get", await s.service.overrides({ page: 1, limit: 20 }));
    check(`${base}/overrides/{id}/revoke`, "post", await s.service.revokeOverride(ids.ops, override.id, REASON));
    check(`${base}/users/{userId}`, "get", await s.service.userBilling(ids.u1));
    check("/api/v1/admin/users/{id}/billing", "get", await s.service.userBilling(ids.u1));
    expect(spec.paths[`${base}/export.csv`].get.responses["200"].content["text/csv"]).toBeTruthy();
    for (const [path, method] of [[`${base}/statements/{id}/manual-payment`, "post"], [`${base}/payments/{id}/refund`, "post"]])
      expect(spec.paths[path][method].parameters.some((p: any) => p.name === "Idempotency-Key" && p.required), `${path} Idempotency-Key`).toBe(true);
    for (const [path, method] of [[`${base}/statements/{id}/manual-payment`, "post"], [`${base}/fee-schedules`, "post"], [`${base}/overrides/{id}/revoke`, "post"]]) {
      expect(spec.paths[path][method].responses["403"], `${path} 403`).toBeTruthy();
      expect(spec.paths[path][method].requestBody.content["application/json"].schema.additionalProperties).toBe(false);
    }
  });
});
