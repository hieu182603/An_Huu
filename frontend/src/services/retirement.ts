import { authenticatedRequest } from "./api";
import { shareInFlight } from "../utils/inFlight";
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
  advisoryFee?: { annualPercent: string; paidFrom: "FUND" | "EXTERNAL" };
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
  contributionTiming?: "END_OF_MONTH" | "START_OF_MONTH";
  surplusPolicy?: "EXPLICIT_DEPOSITS_ONLY";
  startOfMonthFunding?: {
    confirmed: boolean;
    source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START";
    monthlyAvailable: string;
    schedule?: Array<{ month: string; amount: string }>;
  };
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
  essentialShortfall?: string | null;
  otherShortfall?: string | null;
  advisoryFeeAmount?: string;
  advisoryFeeAverageFund?: string;
  advisoryFeePaidFrom?: "FUND" | "EXTERNAL";
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
  essentialShortfall?: string | null;
  firstEssentialShortfallMonth?: string | null;
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
  savingsStatus:
    | "NO_ACCUMULATION_PERIOD"
    | "NO_ADDITIONAL_CONTRIBUTION"
    | "ADDITIONAL_CONTRIBUTION_REQUIRED"
    | "EARLY_FUNDING_REQUIRED"
    | "NO_ELIGIBLE_CONTRIBUTION_PERIOD"
    | string;
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
  contributionTiming: "END_OF_MONTH" | "START_OF_MONTH" | "START_OF_MONTH_RESEARCH" | string;
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
  capitalSeparation?: import("./planningAnalysis").CapitalSeparation;
  lossConstraint?: import("./planningAnalysis").LossConstraint;
  essentialCoverage?: import("./planningAnalysis").EssentialCoverage;
  adjustmentOptions?: import("./planningAnalysis").AdjustmentOptions;
  decisionExplanations?: Array<{ code: string; parameters: Record<string, string | number | boolean | null>; text: string }>;
  reforecast?: unknown;
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
  CONTRIBUTION_ESTIMATE_USES_CURRENT_FEE_SCHEDULE_REPREVIEW_REQUIRED: "Khoản góp cần dùng lịch phí hiện tại. Hãy xem trước lại khi đổi khoản góp để tính lại phí tư vấn.",
  PENSION_NOT_INCLUDED: "Kế hoạch chưa bao gồm lương hưu do bạn chưa khai báo mức ước tính cụ thể.",
  PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION: "Tháng đầu tiên được tính tròn một kỳ theo ngày định giá.",
  DEBT_PAYMENT_OUTSIDE_HORIZON: "Có khoản vay còn lịch trả vượt quá thời gian kế hoạch dự phóng.",
  ILLIQUID_ASSETS_EXCLUDED: "Tài sản chưa thể đổi thành tiền chưa được tính vào số tiền ban đầu của quỹ hưu trí.",
  HYPOTHETICAL_VALUES_PROFILE_UNCHANGED: "Kế hoạch đang sử dụng các giá trị giả định cá nhân (tháng nghỉ hưu hoặc giá trị tài sản mô phỏng), hồ sơ tài chính gốc không bị thay đổi.",
  LOAN_CONTRACT_ESTIMATED: "Khoản vay đang sử dụng mức trả định kỳ tự khai báo để ước tính dòng tiền.",
  HOUSING_NOT_RETIREMENT_CASH: "Bất động sản nhà ở phục vụ sinh hoạt không tính gộp vào vốn tiền mặt hưu trí.",
};

export const ISSUE_MESSAGES: Record<string, string> = {
  RETIREMENT_MONTH_REQUIRED: "Vui lòng chọn tháng bắt đầu nghỉ hưu mong muốn trong hồ sơ tài chính.",
  RETIREMENT_CAPITAL_INCOMPLETE: "Thông tin tài sản và vốn ban đầu chưa đầy đủ.",
  DEBT_SCHEDULE_REQUIRED: "Cần cập nhật lịch trả nợ chi tiết cho các khoản vay hiện có.",
  FULL_LIABILITY_CONFIRMATION_REQUIRED: "Cần xác nhận trách nhiệm nghĩa vụ đối với khoản vay chung.",
  HOUSING_AMOUNT_SCOPE_REQUIRED: "Vui lòng xác nhận phạm vi số tiền phương án nhà ở (Toàn tài sản hoặc Phần sở hữu).",
  HOUSING_AMOUNT_INCOMPLETE: "Số tiền phương án nhà ở chưa hoàn chỉnh.",
  INVALID_RETIREMENT_INCOME_REFERENCE: "Khoản thu sau khi nghỉ hưu đã thay đổi hoặc không còn trong hồ sơ. Hãy kiểm tra lại nguồn thu được chọn.",
  PUBLISHED_INFLATION_REQUIRED: "Hệ thống chưa có dữ liệu kinh tế để tính kế hoạch. Bạn không cần sửa hồ sơ; hãy thử lại sau hoặc liên hệ Hỗ trợ.",
  INFLATION_YEAR_MISSING: "Thiếu dữ liệu lạm phát cho một số năm trong thời gian dự phóng.",
  ANSWER_REQUIRED: "Hãy trả lời đủ câu hỏi ở trang Khảo sát rủi ro để tính kế hoạch theo lựa chọn của bạn.",
  POLICY_NOT_COVERED: "Chính sách đã ghim chưa bao phủ kế hoạch này. Cần quản trị viên kiểm tra cấu hình; không tự cắt ngắn thời hạn.",
  PROJECTION_NOT_COVERED: "Bộ giả định chưa phủ đủ thời gian kế hoạch. Cần bổ sung cấu hình đã duyệt, không giảm thời hạn để né lỗi.",
  ASSET_HORIZON_NOT_COVERED: "Giả định tài sản chưa phủ kỳ hạn yêu cầu. Cần kiểm tra bộ giả định đã ghim.",
  UNKNOWN_CHOICE: "Lựa chọn khảo sát không hợp lệ trong chính sách danh mục.",
  DUPLICATE_ANSWER: "Câu hỏi khảo sát bị trùng lặp câu trả lời.",
  UNKNOWN_QUESTION: "Câu hỏi khảo sát không tồn tại trong chính sách danh mục hiện hành.",
  RISK_BAND_NOT_COVERED: "Điểm khảo sát nằm ngoài các nhóm khẩu vị rủi ro đã công bố.",
  TEMPLATE_NOT_ELIGIBLE: "Danh mục được chọn không đáp ứng tiêu chuẩn với khẩu vị rủi ro.",
  PORTFOLIO_CHOICE_REQUIRED: "Vui lòng chọn một danh mục đầu tư chuẩn phù hợp.",
  START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED: "Cần xác nhận nguồn vốn đóng góp đầu tháng.",
  FUNDING_OUTSIDE_ACCUMULATION: "Lịch nộp vốn nằm ngoài thời gian tích lũy.",
  CONTRIBUTION_OUTSIDE_ACCUMULATION: "Lịch đóng góp định kỳ nằm ngoài thời gian tích lũy.",
  CONTRIBUTION_OUTSIDE_RETIREMENT: "Đóng góp bổ sung sau hưu nằm ngoài khoảng thời gian dự phóng.",
  LOAN_CONTRACT_REQUIRED: "Khoản vay cần cập nhật lịch trả nợ chi tiết theo hợp đồng.",
};

export const EN_ISSUE_MESSAGES: Record<string, string> = {
  RETIREMENT_MONTH_REQUIRED: "Please select your desired retirement month in your financial profile.",
  RETIREMENT_CAPITAL_INCOMPLETE: "Initial asset and capital information is incomplete.",
  DEBT_SCHEDULE_REQUIRED: "Detailed repayment schedules for existing loans are required.",
  FULL_LIABILITY_CONFIRMATION_REQUIRED: "Joint loan liability confirmation is required.",
  HOUSING_AMOUNT_SCOPE_REQUIRED: "Please confirm housing plan scope (Whole asset or Owner's share).",
  HOUSING_AMOUNT_INCOMPLETE: "Housing plan amount is incomplete.",
  INVALID_RETIREMENT_INCOME_REFERENCE: "Invalid post-retirement income reference.",
  PUBLISHED_INFLATION_REQUIRED: "Published macroeconomic assumption set is required.",
  INFLATION_YEAR_MISSING: "Inflation data missing for projection years.",
  ANSWER_REQUIRED: "Risk tolerance survey questions need to be answered to determine benchmark portfolio.",
  POLICY_NOT_COVERED: "The pinned policy does not cover this plan. Administrator review is needed; do not shorten the horizon automatically.",
  PROJECTION_NOT_COVERED: "The assumptions do not cover the full plan period. Approved configuration is required; do not shorten the plan to bypass this.",
  ASSET_HORIZON_NOT_COVERED: "Asset assumptions do not cover the required horizon. Review the pinned assumption set.",
  UNKNOWN_CHOICE: "Invalid choice in survey answers.",
  DUPLICATE_ANSWER: "Duplicate answer for survey question.",
  UNKNOWN_QUESTION: "Survey question not found in current policy.",
  RISK_BAND_NOT_COVERED: "Survey score does not match published risk bands.",
  TEMPLATE_NOT_ELIGIBLE: "Selected portfolio template is not eligible for your risk score.",
  PORTFOLIO_CHOICE_REQUIRED: "Please select an eligible standard portfolio template.",
  START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED: "Start-of-month funding source confirmation required.",
  FUNDING_OUTSIDE_ACCUMULATION: "Funding schedule is outside the accumulation period.",
  CONTRIBUTION_OUTSIDE_ACCUMULATION: "Contribution schedule is outside the accumulation period.",
  CONTRIBUTION_OUTSIDE_RETIREMENT: "Additional retirement contribution is outside the projection period.",
  LOAN_CONTRACT_REQUIRED: "Loan requires detailed repayment schedule from official contract.",
};

export const EN_WARNING_MESSAGES: Record<string, string> = {
  CONTRIBUTION_ESTIMATE_USES_CURRENT_FEE_SCHEDULE_REPREVIEW_REQUIRED: "The required contribution uses the current fee schedule. Preview again after changing contributions to recalculate advisory fees.",
  PENSION_NOT_INCLUDED: "Retirement plan currently excludes state pension because specific estimates are not declared.",
  PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION: "First month is treated as a full period based on valuation date.",
  DEBT_PAYMENT_OUTSIDE_HORIZON: "Some loan payments extend beyond the plan projection horizon.",
  ILLIQUID_ASSETS_EXCLUDED: "Illiquid assets have been excluded from initial retirement capital.",
  HYPOTHETICAL_VALUES_PROFILE_UNCHANGED: "Plan is using hypothetical simulation parameters; master financial profile remains unchanged.",
  LOAN_CONTRACT_ESTIMATED: "Loan uses self-reported periodic payment to estimate debt cash flow.",
  HOUSING_NOT_RETIREMENT_CASH: "Primary residential housing is not included in initial liquid retirement capital.",
};

export function translateIssueCode(code: string, language: "vi" | "en" = "vi"): string {
  if (language === "en") {
    return EN_ISSUE_MESSAGES[code] || `Additional data required: ${code}`;
  }
  return ISSUE_MESSAGES[code] || `Cần bổ sung thông tin để tính kế hoạch. Mã hỗ trợ: ${code}`;
}

export function translateWarningCode(code: string, language: "vi" | "en" = "vi"): string {
  if (language === "en") {
    return EN_WARNING_MESSAGES[code] || `Business notice: ${code}`;
  }
  return WARNING_MESSAGES[code] || `Điều cần biết về kết quả: ${code}`;
}

export interface PreviewMonthlyRetirementOptions {
  adjustments?: "include" | "skip";
}

// The adjustment search takes ~30–50 s on real profiles and the server stops it at
// 120 s (PREVIEW_TIMEOUT_MS), so the default 20 s client timeout would always
// abort it. Wait slightly longer than the server so its 503 reaches the user.
export const PREVIEW_ADJUSTMENTS_TIMEOUT_MS = 130_000;
export async function previewMonthlyRetirement(
  input: RetirementPreviewInput,
  signalOrOptions?: AbortSignal | PreviewMonthlyRetirementOptions,
  options?: PreviewMonthlyRetirementOptions
): Promise<RetirementPreviewResult> {
  const signal = signalOrOptions instanceof AbortSignal ? signalOrOptions : undefined;
  const opts = signalOrOptions instanceof AbortSignal ? options : (signalOrOptions || options);
  const adjustments = opts?.adjustments ?? "skip";
  const query = `?adjustments=${encodeURIComponent(adjustments)}`;
  // The plan page, its guided scenarios and the plan context ask for the same
  // preview at once; the server computes previews one at a time, so share it.
  return await shareInFlight(`${query}|${JSON.stringify(input)}`, signal, shared => authenticatedRequest<RetirementPreviewResult>(
    `/me/retirement/preview${query}`,
    input,
    "POST", undefined, { signal: shared, ...(adjustments === "include" ? { timeoutMs: PREVIEW_ADJUSTMENTS_TIMEOUT_MS } : {}) }
  ));
}

export function formatVNDCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "Chưa xác định";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) return "0 VND";
  const rounded = Math.round(num);
  const isNeg = rounded < 0;
  return `${isNeg ? "-" : ""}${Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
}

export function formatPercentNumber(rate: string | number | null | undefined): string {
  if (rate === null || rate === undefined) return "Không áp dụng";
  const num = typeof rate === "string" ? parseFloat(rate) : rate;
  if (!Number.isFinite(num)) return "0%";
  return num.toFixed(2) + "%";
}
