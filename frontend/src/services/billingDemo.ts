import type {
  BillingOverview, FeeEstimate, FeeSchedule, FeeScheduleInfo, FeeStatement, OrderStatusResult, PaymentOrder, StatementDetail, StatementList, StatementStatus,
} from "./billing";

/**
 * DEV-ONLY demo data so the fee screens can be reviewed without a real billing account.
 * Enable with `?billingDemo=issued|overdue|trial|paid` on any page (kept in sessionStorage); `?billingDemo=off` clears it.
 * Every call site is guarded by `import.meta.env.DEV`, so production bundles never include this branch.
 */
const KEY = "anhuu:billing-demo";
export type DemoScenario = "issued" | "overdue" | "trial" | "paid";
const SCENARIOS: DemoScenario[] = ["issued", "overdue", "trial", "paid"];

export function demoScenario(): DemoScenario | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("billingDemo");
  if (param === "off") sessionStorage.removeItem(KEY);
  else if (param && (SCENARIOS as string[]).includes(param)) sessionStorage.setItem(KEY, param);
  const value = sessionStorage.getItem(KEY);
  return (SCENARIOS as string[]).includes(value ?? "") ? value as DemoScenario : null;
}

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const schedule: FeeSchedule = { id: "demo-schedule", version: 1, annualRatePercent: "0.5", minMonthlyVnd: 49_000, maxMonthlyVnd: 2_000_000, roundingStepVnd: 1000, dueDay: 10, reminderDays: [5, 8], trialMonths: 1, effectiveFromPeriod: "2026-11" };
const BASE = "200000000", FEE = 84_000;

const statement = (period: string, status: StatementStatus, dueOffset: number, paidOffset: number | null): FeeStatement => ({
  id: `demo-${period}`, period, status, baseAmountVnd: BASE, rawFeeVnd: "83333.33", scheduleFeeVnd: FEE, amountVnd: FEE,
  amountDueVnd: status === "PAID" || status === "WAIVED" ? 0 : FEE, dueDate: iso(dueOffset), paidAt: paidOffset === null ? null : iso(paidOffset),
  feeScheduleId: schedule.id, overrideId: null, createdAt: iso(dueOffset - 9),
});

function statements(scenario: DemoScenario): FeeStatement[] {
  const older = [statement("2026-09", "PAID", -50, -55), statement("2026-10", "PAID", -20, -24)];
  if (scenario === "issued") return [statement("2026-11", "ISSUED", 9, null), ...older.reverse()];
  if (scenario === "overdue") return [statement("2026-11", "OVERDUE", -3, null), ...older.reverse()];
  if (scenario === "paid") return [statement("2026-11", "PAID", 9, -1), ...older.reverse()];
  return [];
}

export function demoOverview(scenario: DemoScenario): BillingOverview {
  const rows = statements(scenario);
  const current = rows[0] ?? null;
  const status = scenario === "trial" ? "TRIAL" : scenario === "overdue" ? "OVERDUE" : "ACTIVE";
  return {
    termsVersion: "phi-dich-vu-2026-11-v1", termsRequired: false,
    account: { status, trialEndsAt: scenario === "trial" ? iso(11) : null, termsVersion: "phi-dich-vu-2026-11-v1", termsAcceptedAt: iso(-30), stoppedFromPeriod: null, revision: 1 },
    currentStatement: scenario === "trial" ? null : current,
    nextEstimate: { period: "2026-12", baseAmountVnd: BASE, rawFeeVnd: "83333.33", scheduleFeeVnd: FEE, amountVnd: FEE, applied: { minimum: false, maximum: false, override: null }, baseSource: { metric: "retirementLiquidAssets", issues: [] } },
    override: null,
  };
}
export const demoStatements = (scenario: DemoScenario, page: number, limit: number): StatementList => {
  const all = statements(scenario);
  return { page, limit, total: all.length, items: all.slice((page - 1) * limit, page * limit) };
};
export function demoStatementDetail(scenario: DemoScenario, id: string): StatementDetail {
  const row = statements(scenario).find(item => item.id === id) ?? statements(scenario)[0];
  const paid = row.status === "PAID";
  return {
    ...row, baseSource: {}, schedule, adjustments: [], refunds: [], orders: [],
    payments: paid && row.paidAt ? [{ id: `pay-${row.id}`, source: "PAYOS", amountVnd: FEE, receivedAt: row.paidAt }] : [],
  };
}
export const demoFeeSchedule = (): FeeScheduleInfo => ({ period: "2026-11", termsVersion: "phi-dich-vu-2026-11-v1", current: schedule, upcoming: null });
export const demoEstimate = (baseAmountVnd: string): FeeEstimate => {
  const raw = Number(baseAmountVnd) * 0.005 / 12, fee = Math.min(2_000_000, Math.max(49_000, Math.ceil(raw / 1000) * 1000));
  return { period: "2026-11", schedule, baseAmountVnd, rawFeeVnd: raw.toFixed(2), scheduleFeeVnd: fee, amountVnd: fee, applied: { minimum: fee === 49_000, maximum: fee === 2_000_000, override: null } };
};

const created = new Map<string, number>();
export function demoOrder(statementId: string): PaymentOrder {
  const id = `demo-order-${Date.now()}`;
  created.set(id, Date.now());
  return { id, orderCode: "100001", statementId, amountVnd: FEE, status: "PENDING", checkoutUrl: "https://pay.payos.vn/", qrCode: "00020101021238570010A000000727012700069704220113VQRQ0000000010208QRIBFTTA53037045405840005802VN62130809AN HUU DEMO6304ABCD", expiredAt: iso(10 / 1440) };
}
/** A demo order flips to PAID about 12 seconds after it was created, to show the success path. */
export function demoOrderStatus(orderId: string): OrderStatusResult {
  const paid = Date.now() - (created.get(orderId) ?? Date.now()) > 12_000;
  const order: PaymentOrder = { id: orderId, orderCode: "100001", statementId: "demo-2026-11", amountVnd: FEE, status: paid ? "PAID" : "PENDING", checkoutUrl: null, qrCode: null, expiredAt: iso(0.005) };
  return { order, statement: { id: "demo-2026-11", period: "2026-11", status: paid ? "PAID" : "ISSUED", amountDueVnd: paid ? 0 : FEE } };
}
