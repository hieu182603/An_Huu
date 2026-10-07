import { authenticatedRequest } from "./api.ts";
import type { RetirementCalculation } from "./retirement.ts";
import { Decimal } from "../utils/decimal.ts";

export type ActualKind =
  | "INCOME"
  | "EXPENSE"
  | "DEBT_PAYMENT"
  | "CONTRIBUTION"
  | "WITHDRAWAL"
  | "INVESTMENT_INCOME"
  | "FEE"
  | "MARKET_CHANGE"
  | "INTERNAL_TRANSFER"
  | "BALANCE_ADJUSTMENT";

export const ACTUAL_KIND_LABELS: Record<ActualKind, string> = {
  INCOME: "Thu nhập hàng tháng",
  EXPENSE: "Chi tiêu sinh hoạt",
  DEBT_PAYMENT: "Trả nợ gốc & lãi",
  CONTRIBUTION: "Tích lũy vào quỹ hưu",
  WITHDRAWAL: "Rút tiền từ quỹ hưu",
  INVESTMENT_INCOME: "Lợi tức đầu tư (cổ tức/lãi)",
  FEE: "Phí quản lý & giao dịch",
  MARKET_CHANGE: "Biến động thị trường (lãi/lỗ)",
  INTERNAL_TRANSFER: "Chuyển khoản nội bộ",
  BALANCE_ADJUSTMENT: "Điều chỉnh số dư kiểm toán",
};

export const ACTUAL_KIND_LABELS_EN: Record<ActualKind, string> = {
  INCOME: "Monthly Income",
  EXPENSE: "Living Expenses",
  DEBT_PAYMENT: "Debt Principal & Interest",
  CONTRIBUTION: "Retirement Contribution",
  WITHDRAWAL: "Retirement Withdrawal",
  INVESTMENT_INCOME: "Investment Yield (Dividends/Interest)",
  FEE: "Management & Transaction Fees",
  MARKET_CHANGE: "Market Fluctuation (Gain/Loss)",
  INTERNAL_TRANSFER: "Internal Transfer",
  BALANCE_ADJUSTMENT: "Audit Balance Adjustment",
};

export function getActualKindLabel(kind: ActualKind, language: "vi" | "en" = "vi"): string {
  return language === "en" ? ACTUAL_KIND_LABELS_EN[kind] || kind : ACTUAL_KIND_LABELS[kind] || kind;
}

export interface ActualEntry {
  eventId: string;
  date: string; // YYYY-MM-DD
  kind: ActualKind;
  amount: string;
  note?: string;
}

export interface ActualPayload {
  currency: "VND";
  openingBalance: string;
  closingBalance: string;
  entries: ActualEntry[];
  correctionReason: string;
}

export interface ActualMonthReconciliation {
  totals: Record<ActualKind, string>;
  householdSurplus: string;
  cashflowState: "SURPLUS" | "DEFICIT" | "BALANCED";
  actualContribution: string;
  confirmedContribution?: string;
  uninvestedSurplus?: string;
  budgetShortfall?: string;
  calculatedClosingBalance: string;
  discrepancy: string;
  reconciliation: "MATCHED" | "UNRECONCILED";
  hasAdjustments: boolean;
  conventions: string;
}

export interface ActualMonthItem extends ActualMonthReconciliation {
  id: string;
  period: string;
  revision: number;
  updatedAt: string;
  valueKind: "ACTUAL";
  data: ActualPayload;
}

export interface ActualMonthRevisionHistory {
  revision: number;
  createdAt: string;
  data: ActualPayload;
}

export interface ActualMonthDetail extends ActualMonthItem {
  history: ActualMonthRevisionHistory[];
}

export interface ActualListResponse {
  valueKind: "ACTUAL";
  items: ActualMonthItem[];
}

export interface ActualForecastIssue {
  month: string;
  code: "MONTH_NOT_CLOSED" | "MISSING_MONTH" | "UNRECONCILED_MONTH" | "OPENING_BALANCE_MISMATCH" | string;
}

export interface ActualForecastComparison {
  month: string;
  actualRevision: number;
  actualClosingBalance: string;
  forecastClosingBalance: string;
  closingBalanceDelta: string;
  actualContribution: string;
  forecastContribution: string;
}

export interface ActualForecastResult {
  status: "READY" | "BLOCKED" | "HORIZON_COMPLETE";
  valueKind: "REFORECAST";
  planId: string;
  versionId: string;
  snapshotHash: string;
  baselineVersionId: string | null;
  throughMonth: string;
  originalRetirementMonth: string;
  actuals: ActualMonthItem[];
  issues: ActualForecastIssue[];
  calculation: RetirementCalculation | null;
  anchor: {
    period: string;
    revision: number;
    closingBalance: string;
  } | null;
  comparison: ActualForecastComparison[];
  limitations: string[];
}

/**
 * Client-side reconciliation calculator for real-time form validation.
 */
export function calculateLocalReconciliation(payload: ActualPayload): ActualMonthReconciliation {
  const kinds: ActualKind[] = [
    "INCOME",
    "EXPENSE",
    "DEBT_PAYMENT",
    "CONTRIBUTION",
    "WITHDRAWAL",
    "INVESTMENT_INCOME",
    "FEE",
    "MARKET_CHANGE",
    "INTERNAL_TRANSFER",
    "BALANCE_ADJUSTMENT",
  ];

  const totals = kinds.reduce((acc, k) => {
    acc[k] = new Decimal(0);
    return acc;
  }, {} as Record<ActualKind, Decimal>);

  for (const entry of payload.entries) {
    if (totals[entry.kind]) {
      totals[entry.kind] = totals[entry.kind].plus(entry.amount || "0");
    }
  }

  const surplus = totals.INCOME.minus(totals.EXPENSE).minus(totals.DEBT_PAYMENT);
  const opening = new Decimal(payload.openingBalance || "0");
  const closing = new Decimal(payload.closingBalance || "0");

  const calculatedClosing = opening
    .plus(totals.CONTRIBUTION)
    .minus(totals.WITHDRAWAL)
    .plus(totals.INVESTMENT_INCOME)
    .plus(totals.MARKET_CHANGE)
    .minus(totals.FEE)
    .plus(totals.BALANCE_ADJUSTMENT);

  const discrepancy = closing.minus(calculatedClosing);

  const availableSurplus = surplus.gt(0) ? surplus : new Decimal(0);
  const uninvested = Decimal.max(0, availableSurplus.minus(totals.CONTRIBUTION));
  const shortfall = Decimal.max(0, totals.CONTRIBUTION.minus(availableSurplus));
  const confirmed = Decimal.min(totals.CONTRIBUTION, availableSurplus);

  const totalsFormatted = Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, v.toFixed()])
  ) as Record<ActualKind, string>;

  return {
    totals: totalsFormatted,
    householdSurplus: surplus.toFixed(),
    cashflowState: surplus.gt(0) ? "SURPLUS" : surplus.lt(0) ? "DEFICIT" : "BALANCED",
    actualContribution: totals.CONTRIBUTION.toFixed(),
    confirmedContribution: confirmed.toFixed(),
    uninvestedSurplus: uninvested.toFixed(),
    budgetShortfall: shortfall.toFixed(),
    calculatedClosingBalance: calculatedClosing.toFixed(),
    discrepancy: discrepancy.toFixed(),
    reconciliation: discrepancy.isZero() ? "MATCHED" : "UNRECONCILED",
    hasAdjustments: payload.entries.some((e) => e.kind === "BALANCE_ADJUSTMENT"),
    conventions: "ONE_CONSOLIDATED_RETIREMENT_FUND_EXTERNAL_FLOWS_ONLY",
  };
}

export async function listActualMonths(from: string, to: string): Promise<ActualListResponse> {
  return authenticatedRequest<ActualListResponse>(
    `/me/retirement/actuals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
}

export async function getActualMonth(period: string): Promise<ActualMonthDetail> {
  return authenticatedRequest<ActualMonthDetail>(`/me/retirement/actuals/${encodeURIComponent(period)}`);
}

export async function writeActualMonth(
  period: string,
  expectedRevision: number,
  data: ActualPayload,
  idempotencyKey?: string
): Promise<ActualMonthItem> {
  const key = idempotencyKey || crypto.randomUUID();
  return authenticatedRequest<ActualMonthItem>(
    `/me/retirement/actuals/${encodeURIComponent(period)}`,
    {
      expectedRevision,
      data,
    },
    "PUT",
    {
      "Idempotency-Key": key,
    }
  );
}

export async function reforecastPlan(
  planId: string,
  versionId: string,
  throughMonth: string
): Promise<ActualForecastResult> {
  return authenticatedRequest<ActualForecastResult>(
    "/me/retirement/actuals/reforecast",
    {
      planId,
      versionId,
      throughMonth,
    },
    "POST"
  );
}

export type FutureChangeField = "income" | "livingExpense" | "additionalExpense" | "plannedContribution";

export interface FutureChange {
  id: string;
  field: FutureChangeField;
  operation: "REPLACE_MONTHLY_TOTAL";
  amount: string;
  startMonth: string;
  endMonth: string;
  reason: string;
}

export type SourceChange =
  | {
      id: string;
      kind: "DEBT_SETTLED";
      sourceId: string;
      actual: { period: string; eventId: string };
      remainingObligation: "0";
      confirmed: true;
      document: string;
    }
  | {
      id: string;
      kind: "ASSET_REALIZED";
      sourceId: string;
      actual: { period: string; eventId: string };
      confirmed: true;
      document: string;
    }
  | {
      id: string;
      kind: "PENSION_REPLACE";
      sourceId: "pension";
      startMonth: string;
      endMonth: string;
      monthlyAmount: string;
      priceBasis: "NOMINAL_MONTHLY";
      confirmed: true;
      document: string;
    }
  | {
      id: string;
      kind: "FLOW_REPLACE";
      sourceType: "INCOME" | "EXPENSE";
      sourceId: string;
      startMonth: string;
      endMonth: string;
      monthlyAmount: string;
      confirmed: true;
      document: string;
    };

export interface ReforecastPreviewCommand {
  planId: string;
  versionId: string;
  throughMonth: string;
  expectedProfileRevision: number;
  futureChanges?: FutureChange[];
  sourceChanges?: SourceChange[];
}

export interface ReforecastPreviewResponse {
  status: "READY" | "BLOCKED" | "HORIZON_COMPLETE";
  issues: ActualForecastIssue[];
  inputHash: string | null;
  candidate: any | null;
  beforeChanges: RetirementCalculation | null;
  saved: boolean;
  applied: boolean;
}

export interface SaveReforecastCommand {
  expectedRevision: number;
  expectedInputHash: string;
  preview: ReforecastPreviewCommand;
}

export async function previewReforecast(
  command: ReforecastPreviewCommand
): Promise<ReforecastPreviewResponse> {
  return authenticatedRequest<ReforecastPreviewResponse>(
    "/me/retirement/actuals/reforecast/preview",
    command,
    "POST"
  );
}

export async function saveReforecast(
  planId: string,
  command: SaveReforecastCommand,
  idempotencyKey?: string
): Promise<{ planId: string; planRevision: number; version: number; versionId: string }> {
  const key = idempotencyKey || crypto.randomUUID();
  return authenticatedRequest<{ planId: string; planRevision: number; version: number; versionId: string }>(
    `/me/retirement/plans/${encodeURIComponent(planId)}/reforecasts`,
    command,
    "POST",
    { "Idempotency-Key": key }
  );
}

