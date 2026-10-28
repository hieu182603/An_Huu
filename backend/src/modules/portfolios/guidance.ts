import { addMonths } from "../../common/calendar";
import type { AssumptionDocument } from "../assumptions/schema";
import type { PortfolioDocument, PortfolioPreview } from "./schema";
import { assessPortfolio } from "./engine";

/** Response metadata only: never extend published rates or alter a saved calculation. */
export function previewGuidance(policy: PortfolioDocument, assumptions: AssumptionDocument,
  input: PortfolioPreview, issues: Array<{ path: string; code: string }>) {
  const endMonth = addMonths(input.startMonth, input.horizonMonths - 1);
  const messages: Record<string, { action: "REVIEW_CONFIGURATION" | "REVIEW_SELECTION"; message: string }> = {
    PROJECTION_NOT_COVERED: { action: "REVIEW_CONFIGURATION",
      message: `Dữ liệu dự báo hiện có từ năm ${assumptions.projectionStartYear} đến ${assumptions.projectionEndYear}, chưa đủ cho thời gian bạn chọn. Cần bổ sung dữ liệu dự báo trước khi tính tiếp.` },
    ASSET_HORIZON_NOT_COVERED: { action: "REVIEW_CONFIGURATION",
      message: "Dữ liệu lợi suất chưa hỗ trợ thời hạn của kế hoạch này. Cần bổ sung cấu hình dự báo; bạn không cần khai lại hồ sơ tài chính." },
    POLICY_NOT_COVERED: { action: "REVIEW_CONFIGURATION",
      message: "Chưa có cách phân bổ đầu tư phù hợp với câu trả lời và thời hạn bạn chọn trong bộ quy tắc hiện có. Cần rà soát cấu hình; không nên đổi câu trả lời chỉ để đi tiếp." },
    PORTFOLIO_CHOICE_REQUIRED: { action: "REVIEW_SELECTION",
      message: "Có nhiều cách phân bổ đầu tư phù hợp. Hãy chọn một phương án để xem kế hoạch." },
    RETIREMENT_MONTH_REQUIRED: { action: "REVIEW_SELECTION",
      message: "Cách phân bổ này giảm dần rủi ro theo số năm còn lại tới khi nghỉ hưu. Hãy cho biết tháng dự kiến nghỉ hưu để xem phân bổ." },
    TEMPLATE_NOT_ELIGIBLE: { action: "REVIEW_SELECTION",
      message: "Cách phân bổ đầu tư đang chọn không phù hợp với kết quả khảo sát hoặc thời hạn kế hoạch. Hãy xem các phương án phù hợp để chọn lại." },
  };
  // One entry for all survey-answer issues; assessPortfolio no longer reports a
  // coverage gap for them, so this is the only explanation the user needs.
  const answers = { action: "REVIEW_SELECTION" as const,
    message: "Chưa đánh giá được cách phân bổ đầu tư vì câu trả lời khảo sát còn thiếu hoặc chưa hợp lệ. Hãy kiểm tra các câu được đánh dấu." };
  const seen = new Set<string>();
  return {
    requestedPeriod: { startMonth: input.startMonth, endMonth, horizonMonths: input.horizonMonths },
    assumptionPeriod: { startYear: assumptions.projectionStartYear, endYear: assumptions.projectionEndYear },
    // Keep separate rule ranges: min/max across all rules could hide gaps or
    // suggest a range is eligible despite failing another condition.
    policyRules: policy.rules.map(rule => ({ ruleId: rule.id, templateId: rule.templateId,
      minMonths: rule.horizon.min, maxMonths: rule.horizon.max })),
    policyChecks: issues.some(issue => issue.code === "POLICY_NOT_COVERED") ? assessPortfolio(policy, input).checks : [],
    issues: issues.flatMap(issue => {
      if (issue.path.startsWith("answers")) {
        if (seen.has("answers")) return [];
        seen.add("answers");
        return [{ path: "answers", code: issue.code, ...answers }];
      }
      const message = messages[issue.code], key = `${issue.path}:${issue.code}`;
      if (!message || seen.has(key)) return [];
      seen.add(key);
      return [{ ...issue, ...message }];
    }),
  };
}
