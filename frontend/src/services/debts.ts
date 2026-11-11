import { authenticatedRequest } from "./api";

export type LoanRate = { kind: "EFFECTIVE_ANNUAL" | "NOMINAL_ANNUAL_MONTHLY" | "EFFECTIVE_MONTHLY"; percent: string } | { kind: "SIMPLE_ANNUAL_DAILY"; percent: string; days: number; yearDays: 360 | 365 | 366 };
export type LoanPrepayment = { status: "UNKNOWN" } | { status: "PROHIBITED"; reason: string } | { status: "ALLOWED"; mode: "PARTIAL_OR_FULL" | "FULL_ONLY"; minimumPrincipal: string; maximumPrincipal: string | null; fixedFee: string; feePercent: string; effect: "REDUCE_TERM_KEEP_SCHEDULE"; funding: "SOLE_BORROWER" | "PRO_RATA_CONFIRMED"; evidence: string };
export type LoanPeriod = { dueDate: string; rate: LoanRate; repayment: { kind: "TOTAL_PAYMENT" | "PRINCIPAL_PLUS_INTEREST"; amount: string } | { kind: "INTEREST_ONLY" }; minimumPayment: string; fee: string; prepayment: LoanPrepayment };
export type LoanContract = { contractVersion: 1; source: string; confirmedOn: string; balanceAsOf: string; interestBasis: "REDUCING_BALANCE"; periodConvention: "DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS"; maturityDate: string; settleRemainingAtMaturity: boolean; parties: Array<{ reference: string; role: "BORROWER" | "CO_OBLIGOR" }>; periods: LoanPeriod[] };
export type LoanScheduleRow = { dueDate: string; opening: string; principal: string; interest: string; fee: string; closing: string; userPayment: string; userPrincipal: string; userInterest: string; userFee: string };
export type LoanReport = { id: string; status: "CONTRACT" | "ILLUSTRATIVE" | "DECLARED" | "INCOMPLETE"; outstandingBalance: string | null; monthlyPayment: string | null; firstMonthInterest: string | null; payoffDate: string | null; scheduleStatus: "READY" | "INCOMPLETE" | "HORIZON_LIMIT" | "NOT_DECLARED"; rate: { kind: string; percent: string } | null; rows: LoanScheduleRow[]; issues: Array<{ loanId: string | null; code: string }> };
export type DebtReport = { profileRevision: number; valuationDate: string; currency: "VND"; debtState: "KNOWN" | "UNKNOWN" | "NOT_APPLICABLE"; totals: { outstandingBalance: string | null; monthlyPayment: string | null; firstMonthInterest: string | null; monthlyIncome: string | null; monthlyExpense: string | null; availableMonthlySurplus: string | null; debtToIncomePercent: string | null }; loans: LoanReport[]; issues: Array<{ loanId: string | null; code: string }> };

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
