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
  availableForRetirement: string | null;
  pressure: {
    ratioPercent: string | null;
    remainingCash: string | null;
    cashflowStatus: "DEFICIT" | "BALANCED" | "SURPLUS" | "UNKNOWN";
    status: string;
  };
  income: string | null;
  nonDebtExpense: string | null;
}

export interface DebtSimulationResult {
  status: "CALCULATED" | "HORIZON_LIMIT";
  totals: {
    principal: string;
    interest: string;
    fees: string;
    interestAndFees: string;
    extraPrincipal: string;
    debtFreeDate: string | null;
    firstShortfallMonth: string | null;
    closingLoanBalance: string;
  };
  rows: DebtScheduleRow[];
  cashflowAssessment: {
    status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
    evaluatedMonths: number;
    totalMonths: number;
    firstUnknownMonth: string | null;
    shortfallStatus: "DETECTED" | "UNKNOWN" | "NOT_DETECTED_IN_HORIZON";
    issues: string[];
  };
}

export interface DebtAlternativeStrategy {
  strategy: "AVALANCHE" | "SNOWBALL" | "SELECTED_PAYOFF";
  status: "CALCULATED" | "HORIZON_LIMIT" | "INCOMPLETE";
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
