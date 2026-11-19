import { ApiError, authenticatedRequest } from "./api";
import * as demoData from "./billingDemo";

// Typed client for the user side of the service fee (phí dịch vụ). Contract:
// backend/docs/openapi.yaml (/billing/*, /me/billing/*) + billing.openapi.yaml.
// Money is an integer VND number; baseAmountVnd / rawFeeVnd are Decimal strings.

export type BillingStatus = "TRIAL" | "ACTIVE" | "OVERDUE" | "STOPPED";
export type StatementStatus = "ISSUED" | "PAID" | "OVERDUE" | "WAIVED" | "VOID";
export type OrderStatus = "PENDING" | "PAID" | "UNDERPAID" | "EXPIRED" | "CANCELLED";

export type FeeSchedule = {
  id: string; version: number; annualRatePercent: string; minMonthlyVnd: number; maxMonthlyVnd: number | null;
  roundingStepVnd: number; dueDay: number; reminderDays: number[]; trialMonths: number; effectiveFromPeriod: string | null;
};
export type FeeScheduleInfo = { period: string; termsVersion: string; current: FeeSchedule; upcoming: FeeSchedule | null };
export type FeeComputation = {
  baseAmountVnd: string; rawFeeVnd: string; scheduleFeeVnd: number; amountVnd: number;
  applied: { minimum: boolean; maximum: boolean; override: "DISCOUNT_PERCENT" | "FIXED_AMOUNT" | "WAIVE" | null };
};
export type FeeEstimate = FeeComputation & { period: string; schedule: FeeSchedule };
export type BillingAccount = {
  status: BillingStatus; trialEndsAt: string | null; termsVersion: string; termsAcceptedAt: string;
  stoppedFromPeriod: string | null; revision: number;
};
export type FeeStatement = {
  id: string; period: string; status: StatementStatus; baseAmountVnd: string; rawFeeVnd: string; scheduleFeeVnd: number;
  amountVnd: number; amountDueVnd: number; dueDate: string; paidAt: string | null; feeScheduleId: string; overrideId: string | null; createdAt: string;
};
export type BaseSource = { metric?: "retirementLiquidAssets"; profileRevision?: number | null; valuationDate?: string | null; issues?: string[] };
export type BillingOverview = {
  termsVersion: string; account: BillingAccount | null; termsRequired: boolean; currentStatement: FeeStatement | null;
  nextEstimate: (FeeComputation & { period: string; baseSource: BaseSource }) | null;
  override: { id: string; kind: "DISCOUNT_PERCENT" | "FIXED_AMOUNT" | "WAIVE"; value: string | null; fromPeriod: string; toPeriod: string | null } | null;
};
export type StatementList = { page: number; limit: number; total: number; items: FeeStatement[] };
export type PaymentOrder = {
  id: string; orderCode: string; statementId: string; amountVnd: number; status: OrderStatus;
  checkoutUrl: string | null; qrCode: string | null; expiredAt: string;
};
export type StatementAdjustment = { id: string; amountVnd: number; reason: string | null; createdAt: string };
export type StatementPayment = { id: string; source: string; amountVnd: number; receivedAt: string; bankReference?: string | null };
export type StatementRefund = { id: string; paymentId: string; amountVnd: number; createdAt: string };
export type StatementDetail = FeeStatement & {
  baseSource: BaseSource & Record<string, unknown>; schedule: FeeSchedule | null;
  adjustments: StatementAdjustment[]; payments: StatementPayment[]; refunds: StatementRefund[]; orders: PaymentOrder[];
};
export type OrderStatusResult = { order: PaymentOrder; statement: { id: string; period: string; status: StatementStatus; amountDueVnd: number } | null };
export type BillingOverdueDetails = { statementId: string; amountDueVnd: number; dueDate: string };

export const BILLING_OVERDUE_EVENT = "anhuu:billing-overdue";

/** 503 BILLING_DISABLED: the whole feature is off, so billing UI must disappear silently. */
export function isBillingDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === "BILLING_DISABLED";
}

/** Runs a read; resolves to null (instead of throwing) when billing is switched off. */
export async function orNullWhenDisabled<T>(run: () => Promise<T>): Promise<T | null> {
  try { return await run(); }
  catch (error) { if (isBillingDisabled(error)) return null; throw error; }
}

// DEV-only demo mode (?billingDemo=issued|overdue|trial|paid); dead code in production builds.
const demo = () => import.meta.env.DEV ? demoData.demoScenario() : null;

export const getFeeSchedule = () => demo() ? Promise.resolve(demoData.demoFeeSchedule()) : authenticatedRequest<FeeScheduleInfo>("/billing/fee-schedule");
export const getBillingOverview = (): Promise<BillingOverview> => { const d = demo(); return d ? Promise.resolve(demoData.demoOverview(d)) : getRealOverview(); };
const getRealOverview = () => authenticatedRequest<BillingOverview>("/me/billing", undefined, "GET", undefined, { skipCache: true });
export const estimateFee = (baseAmountVnd: string, signal?: AbortSignal): Promise<FeeEstimate> =>
  demo() ? Promise.resolve(demoData.demoEstimate(baseAmountVnd)) : authenticatedRequest<FeeEstimate>("/me/billing/estimate", { baseAmountVnd }, "POST", undefined, { signal });
export const acceptTerms = (termsVersion: string) => authenticatedRequest<BillingAccount>("/me/billing/terms", { termsVersion }, "POST");
export const listStatements = (page = 1, limit = 12): Promise<StatementList> => { const d = demo(); return d ? Promise.resolve(demoData.demoStatements(d, page, limit)) : realListStatements(page, limit); };
const realListStatements = (page: number, limit: number) =>
  authenticatedRequest<StatementList>(`/me/billing/statements?page=${page}&limit=${limit}`, undefined, "GET", undefined, { skipCache: true });
export const getStatement = (id: string): Promise<StatementDetail> => { const d = demo(); return d ? Promise.resolve(demoData.demoStatementDetail(d, id)) : realGetStatement(id); };
const realGetStatement = (id: string) =>
  authenticatedRequest<StatementDetail>(`/me/billing/statements/${encodeURIComponent(id)}`, undefined, "GET", undefined, { skipCache: true });
/** A fresh Idempotency-Key per click: the same key would replay the first (possibly expired) response. */
export const payStatement = (id: string): Promise<PaymentOrder> => demo() ? Promise.resolve(demoData.demoOrder(id)) : realPayStatement(id);
const realPayStatement = (id: string) =>
  authenticatedRequest<PaymentOrder>(`/me/billing/statements/${encodeURIComponent(id)}/pay`, {}, "POST", { "Idempotency-Key": crypto.randomUUID() });
export const getOrderStatus = (orderId: string): Promise<OrderStatusResult> => demo() ? Promise.resolve(demoData.demoOrderStatus(orderId)) : realGetOrderStatus(orderId);
const realGetOrderStatus = (orderId: string) =>
  authenticatedRequest<OrderStatusResult>(`/me/billing/orders/${encodeURIComponent(orderId)}`, undefined, "GET", undefined, { skipCache: true });
export const stopBilling = (expectedRevision: number) => authenticatedRequest<BillingAccount>("/me/billing/stop", { expectedRevision }, "POST");
export const resumeBilling = (expectedRevision: number) => authenticatedRequest<BillingAccount>("/me/billing/resume", { expectedRevision }, "POST");

export function parseOverdueDetails(detail: unknown): BillingOverdueDetails | null {
  const row = detail as Partial<BillingOverdueDetails> | null;
  return row && typeof row.statementId === "string" ? { statementId: row.statementId, amountDueVnd: Number(row.amountDueVnd) || 0, dueDate: String(row.dueDate ?? "") } : null;
}
