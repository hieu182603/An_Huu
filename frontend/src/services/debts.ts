import { authenticatedRequest } from "./api";

export interface DebtStressScenario {
  loanId: string;
  startMonth: string;
  endMonth: string;
  totalPaymentShare: string;
}

export interface DebtPreviewInput {
  expectedProfileRevision: number;
  horizonMonths: number;
  reserveMonthly: string | null;
  extraMonthlyBudget: string | null;
  payoffLoanId?: string;
  stress?: DebtStressScenario[];
}

export interface DebtScheduleRow {
  month: string;
  debtPayment: string;
  remainingPrincipal: string;
  cashflowStatus: "DEFICIT" | "BALANCED" | "SURPLUS" | "UNKNOWN";
  remainingCash: string | null;
  ratioPercent: string | null;
  income: string | null;
  nonDebtExpense: string | null;
}

export interface DebtSimulationResult {
  status: "CALCULATED" | "INCOMPLETE";
  totals: {
    principal: string;
    interest: string;
    fees: string;
    interestAndFees: string;
    extraPrincipal: string;
  };
  rows: DebtScheduleRow[];
  debtFreeDate: string | null;
  firstShortfallMonth: string | null;
}

export interface DebtAlternativeStrategy {
  strategy: "AVALANCHE" | "SNOWBALL" | "SELECTED_PAYOFF";
  status: "CALCULATED" | "INCOMPLETE";
  comparisonScope: "FULL_TERM" | "SAME_HORIZON_ONLY" | "UNAVAILABLE";
  result: DebtSimulationResult | null;
  interestAndFeesSaved: string | null;
  retirementCashflowDelta: Array<{ month: string; value: string }>;
  issues: Array<{ loanId: string | null; code: string }>;
}

export interface DebtIssue {
  loanId: string | null;
  code: string;
}

export interface DebtPreviewResponse {
  profileRevision: number;
  status: "READY" | "INCOMPLETE";
  modelVersion: string;
  valuationDate: string;
  currency: string;
  baseline: DebtSimulationResult | null;
  alternatives: DebtAlternativeStrategy[];
  stress: any | null;
  capital: {
    netWorth: string | null;
    retirementLiquidAssets: string | null;
  };
  issues: DebtIssue[];
  warnings: DebtIssue[];
  limitations: string[];
}

export async function previewDebts(input: DebtPreviewInput): Promise<DebtPreviewResponse> {
  return authenticatedRequest<DebtPreviewResponse>("/me/debts/preview", input, "POST");
}
