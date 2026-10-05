import { authenticatedRequest } from "./api";
import type { ProfileV2 } from "./financialProfile";

export interface RetirementAnswerItem {
  questionId: string;
  choiceId: string;
}

export interface ContributionScheduleItem {
  month: string;
  amount: string;
}

export interface DebtStressItem {
  loanId: string;
  startMonth: string;
  endMonth: string;
  totalPaymentShare: string;
}

export interface HousingPlanItem {
  assetId: string;
  amountScope: "WHOLE_ASSET" | "OWNERS_SHARE";
  linkedIncomeId?: string;
}

export interface RetirementPreviewInput {
  expectedProfileRevision: number;
  policyVersionId: string;
  scenario: "BASE" | "ADVERSE" | "FAVORABLE";
  templateId?: string;
  answers: RetirementAnswerItem[];
  liquidityNeedMonths: number;
  endMonth: string;
  monthlyExpenseToday: string;
  monthlyContribution: string;
  monthlyReserve: string;
  terminalBalance?: string;
  contributionSchedule?: ContributionScheduleItem[];
  retirementContributionSchedule?: ContributionScheduleItem[];
  retirementIncomeIds: string[];
  retirementAdditionalExpenseIds?: string[];
  debtStress?: DebtStressItem[];
  housing?: HousingPlanItem[];
  whatIf?: {
    retirementMonth?: string;
    assetValues?: Array<{ assetId: string; value: string }>;
  };
}

export interface RetirementIssue {
  path: string;
  code: string;
}

export interface RetirementRow {
  month: string;
  growthFactor: string;
  inflationFactor: string;
  income: string;
  pension: string;
  livingExpense: string;
  additionalExpense: string;
  debtPayment: string;
  plannedContribution: string;
  contribution: string;
  contributionCapacity: string;
  withdrawal: string;
  uninvestedSurplus: string;
  capitalInjection: string;
  phase: "ACCUMULATION" | "RETIREMENT";
  openingBalance: string;
  investmentChange: string;
  closingBalance: string;
  fundedClosingBalance: string;
  unfundedWithdrawal: string;
  budgetShortfall: string;
  requiredOpeningBalance: string;
  requiredClosingBalance: string;
  netWithdrawal: string;
}

export interface RetirementComparison {
  projectedFund: string;
  requiredFund: string;
  fundingGap: string;
  coveragePercent: string | null;
}

export interface RetirementSummary {
  valuationDate: string;
  retirementMonth: string;
  endMonth: string;
  accumulationMonths: number;
  retirementMonths: number;
  initialRetirementCapital: string;
  atRetirement: RetirementComparison;
  atValuation: RetirementComparison;
  algebraicRequiredFund: string;
  liquidityReserveAboveAlgebraicPV: string;
  futureMonthlyExpense: string;
  plannedMonthlyContribution: string;
  requiredConstantMonthlyContribution: string | null;
  additionalMonthlyContribution: string | null;
  savingsStatus: "NO_ACCUMULATION_PERIOD" | "NO_ADDITIONAL_CONTRIBUTION" | "ADDITIONAL_CONTRIBUTION_REQUIRED";
  requiredContributionWithinCapacity: boolean | null;
  retirementFundingShortfall: string;
  excessAtRetirement: string;
  firstShortfallMonth: string | null;
  firstBudgetShortfallMonth: string | null;
  unfundedWithdrawals: string;
  terminalBalance: string;
  fundedTerminalBalance: string;
  terminalTarget: string;
  terminalTargetShortfall: string;
}

export interface RetirementConventions {
  contributionTiming: "END_OF_MONTH" | "START_OF_MONTH_RESEARCH";
  withdrawalTiming: "END_OF_MONTH";
  capitalReleaseTiming: "END_OF_MONTH";
  surplusPolicy: string;
  allocationCashflows: string;
  arithmeticPrecision: number;
  firstPeriod: string;
  rounding: string;
  negativeBalance: string;
  terminalBalanceBasis: string;
}

export interface RetirementCalculation {
  modelVersion: string;
  conventions: RetirementConventions;
  summary: RetirementSummary;
  rows: RetirementRow[];
  netWorth: string | null;
  assessment: any;
  marketRows: any[];
  scenario: {
    kind: "BASE" | "ADVERSE" | "FAVORABLE";
    label: string;
    evidence: string;
    changes: any;
  };
  legalRetirementAge: any;
  limitations: string[];
}

export interface RetirementPreviewResult {
  status: "READY" | "INCOMPLETE";
  issues: RetirementIssue[];
  warnings: RetirementIssue[];
  calculation: RetirementCalculation | null;
  replayInput: any | null;
  modelVersion: string;
  profileRevision: number;
  valuationDate: string;
  currency: "VND";
  references: {
    profileHash: string;
    policyVersionId: string;
    policyVersion: number;
    policyHash: string;
    assumptionVersionId: string;
    assumptionVersion: number;
    assumptionHash: string;
  };
  inputHash: string;
  sources: Array<{
    id: string;
    name: string;
    url?: string;
    release?: string;
    reviewedOn?: string;
  }>;
  selection: RetirementPreviewInput;
}

export interface RetirementPreviewEnvelope {
  data: RetirementPreviewResult;
  meta: {
    requestId: string;
  };
}

export const WARNING_MESSAGES: Record<string, string> = {
  PENSION_NOT_INCLUDED: "Kế hoạch chưa bao gồm lương hưu do bạn chưa khai báo mức ước tính cụ thể.",
  PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION: "Tháng đầu tiên được tính tròn một kỳ theo ngày định giá.",
  DEBT_PAYMENT_OUTSIDE_HORIZON: "Có khoản vay còn lịch trả vượt quá thời gian kế hoạch dự phóng.",
  ILLIQUID_ASSETS_EXCLUDED: "Các tài sản chưa đủ điều kiện thanh khoản đã được loại trừ khỏi vốn quỹ hưu trí ban đầu.",
  HYPOTHETICAL_VALUES_PROFILE_UNCHANGED: "Kế hoạch đang sử dụng các giá trị giả định cá nhân (tháng nghỉ hưu hoặc giá trị tài sản mô phỏng), hồ sơ tài chính gốc không bị thay đổi.",
};

export const ISSUE_MESSAGES: Record<string, string> = {
  RETIREMENT_MONTH_REQUIRED: "Vui lòng chọn tháng bắt đầu nghỉ hưu mong muốn trong hồ sơ.",
  RETIREMENT_CAPITAL_INCOMPLETE: "Thông tin tài sản và vốn ban đầu chưa đầy đủ.",
  DEBT_SCHEDULE_REQUIRED: "Cần cập nhật lịch trả nợ chi tiết cho các khoản vay hiện có.",
  FULL_LIABILITY_CONFIRMATION_REQUIRED: "Cần xác nhận trách nhiệm nghĩa vụ đối với khoản vay chung.",
  HOUSING_AMOUNT_SCOPE_REQUIRED: "Vui lòng xác nhận phạm vi số tiền phương án nhà ở (Toàn tài sản hoặc Phần sở hữu).",
  HOUSING_AMOUNT_INCOMPLETE: "Số tiền phương án nhà ở chưa hoàn chỉnh.",
  INVALID_RETIREMENT_INCOME_REFERENCE: "Tham chiếu khoản thu tiếp tục sau hưu không hợp lệ.",
  PUBLISHED_INFLATION_REQUIRED: "Cần có bộ giả định kinh tế vĩ mô đã được công bố.",
  INFLATION_YEAR_MISSING: "Thiếu dữ liệu lạm phát cho một số năm trong thời gian dự phóng.",
};

export function translateIssueCode(code: string): string {
  return ISSUE_MESSAGES[code] || `Yêu cầu bổ sung dữ liệu: ${code}`;
}

export function translateWarningCode(code: string): string {
  return WARNING_MESSAGES[code] || `Lưu ý nghiệp vụ: ${code}`;
}

export async function previewMonthlyRetirement(input: RetirementPreviewInput): Promise<RetirementPreviewResult> {
  return await authenticatedRequest<RetirementPreviewResult>(
    "/me/retirement/preview",
    input,
    "POST"
  );
}

export function formatVNDCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "Chưa xác định";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(Math.round(num)) + " ₫";
}

export function formatPercentNumber(rate: string | number | null | undefined): string {
  if (rate === null || rate === undefined) return "Không áp dụng";
  const num = typeof rate === "string" ? parseFloat(rate) : rate;
  if (!Number.isFinite(num)) return "0%";
  return num.toFixed(2) + "%";
}
