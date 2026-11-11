import type { FinancialProfile } from "../context/FinancialProfileContext";
import type { ProfileV2 } from "../services/financialProfile";
import { hasMissingProfileValue } from "./profileCompletion";

// The sidebar and its dialog describe the same five groups as the demo.
// Keep UNKNOWN separate from an explicit zero or NOT_APPLICABLE declaration.
export function userProfileProgress(profile: FinancialProfile, v2: ProfileV2 | null, hasProfile: boolean, hasRiskAnswers: boolean) {
  const declared = (value: unknown) => value != null && !hasMissingProfileValue(value);
  return [
    { key: "goal", title: ["Mục tiêu nghỉ hưu", "Retirement goal"], description: ["Ngày tháng năm sinh, thời điểm nghỉ hưu và chi tiêu mong muốn", "Birth date, retirement timing and desired spending"], path: "/user/goal",
      done: hasProfile && (v2 ? declared(v2.personal.birthMonth) && declared(v2.personal.desiredRetirementMonth) : profile.personal.age > 0 && profile.goal.targetRetireAge > 0) && (v2?.retirementGoal ? /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(v2.retirementGoal.monthlyExpenseToday) : profile.goal.monthlyExpenseInRetirement > 0) },
    { key: "cashflow", title: ["Thu nhập và chi tiêu", "Income and expenses"], description: ["Thu nhập sau thuế và chi phí sinh hoạt hàng tháng", "After-tax income and monthly living expenses"], path: "/user/profile?section=cashflow",
      done: hasProfile && (!v2 || declared(v2.income) && declared(v2.expenses)) },
    { key: "assets", title: ["Tài sản & quỹ dự phòng", "Assets and emergency reserve"], description: ["Tài sản dành cho hưu trí và khoản dự phòng", "Retirement assets and emergency reserves"], path: "/user/profile?section=assets",
      done: hasProfile && (!v2 || declared(v2.assets)) },
    { key: "pension", title: ["Lương hưu BHXH", "Social insurance pension"], description: ["Lịch sử tham gia và ước tính lương hưu", "Contribution history and estimated pension"], path: "/user/profile?section=insurance",
      done: hasProfile && (v2 ? declared(v2.pension) : profile.socialSecurity.socialInsuranceYears > 0) },
    { key: "risk", title: ["Khả năng chịu rủi ro", "Risk tolerance"], description: ["Khả năng chịu rủi ro và phản ứng trước biến động thị trường", "Risk tolerance and response to market changes"], path: "/user/risk-portfolio",
      done: hasProfile && (hasRiskAnswers || Boolean(v2?.lossTolerance && declared(v2.lossTolerance.reaction) && (declared(v2.lossTolerance.amountVnd) || declared(v2.lossTolerance.percent)))) },
  ];
}
