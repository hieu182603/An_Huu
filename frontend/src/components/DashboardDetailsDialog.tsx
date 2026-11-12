import PlanMoneyExplanation from "./retirement/PlanMoneyExplanation";
import MoneyExplanationDialog from "./MoneyExplanationDialog";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { financeAmount } from "../utils/financeHubSummary";
import { formatMoneyDecimal, formatCompactMoneyDecimal } from "../utils/moneyDisplay";
import { Decimal } from "../utils/decimal";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { WARNING_MESSAGES, type RetirementPreviewResult } from "../services/retirement";
import { formatDateVN } from "../utils/date";
import ResponsiveDialog from "./ResponsiveDialog";
import "./user-workspace-dialogs.css";

export const overviewNumber = (value: unknown): number | null => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
export function overviewMoney(value: string | null, en: boolean, compact = false) {
  if (!compact) return formatMoneyDecimal(value, en);
  const formatted = formatCompactMoneyDecimal(value, en);
  const suffix = en ? " billion ₫" : " tỷ ₫";
  if (!formatted.endsWith(suffix)) return formatted;
  const separator = en ? "." : ",";
  const [whole, fraction = ""] = formatted.slice(0, -suffix.length).split(separator);
  return `${whole}${separator}${fraction.padEnd(2, "0")}${suffix}`;
}
export type DashboardDetail = "projected" | "required" | "capacity" | "assumptions";

export default function DashboardDetailsDialog({ detail, preview, capacity, onClose }: { detail: DashboardDetail; preview: RetirementPreviewResult | null; capacity: string | null; onClose: () => void }) {
  const { profileSummary, loadError } = useFinancialProfile();
  const { language } = useI18n(), en = language === "en";
  const t = (vi: string, english: string) => en ? english : vi;
  const money = (value: unknown) => overviewMoney(financeAmount(value), en);
  const calculation = preview?.calculation;
  const titles = { projected: t("Quỹ dự kiến khi nghỉ hưu", "Projected fund at retirement"), required: t("Quỹ cần cho mục tiêu", "Required fund for your goal"), capacity: t("Có thể góp tháng đầu", "First-month contribution capacity"), assumptions: t("Giả định tính toán", "Calculation assumptions") };
  if (detail !== "assumptions" && preview?.calculation) return <PlanMoneyExplanation metric={detail} preview={preview} onClose={onClose} />;
  if (detail !== "assumptions") {
    const raw = !loadError ? financeAmount(capacity) : null;
    const amount = detail === "capacity" && raw !== null ? Decimal.max(0, raw).toString() : null;
    const full = (v: string | null | undefined) => formatMoneyDecimal(v, en);
    return <MoneyExplanationDialog onClose={onClose} data={{
      title: `${t("Giải thích", "Explanation")}: ${titles[detail]}`, label: titles[detail], value: full(amount),
      subtitle: t("Chưa có dự phóng kế hoạch hợp lệ", "No valid plan projection yet"),
      description: detail === "capacity" && amount !== null ? t("Tạm đối chiếu từ phần dư trong hồ sơ, tối thiểu bằng 0. Chưa trừ tiền dành riêng và chưa áp dụng các giới hạn của phương án nghỉ hưu.", "This provisional amount uses profile surplus, floored at zero. Plan reserves and retirement-option constraints have not yet been applied.") : t("Cần tính kế hoạch để xem đúng số tiền và phép tính. Không dùng số mẫu thay dữ liệu còn thiếu.", "Calculate a plan to see its amount and calculation. Sample values do not replace missing data."),
      steps: detail === "capacity" ? [
        { label: t("Thu nhập và lương hưu", "Income and pension"), value: full(financeAmount(profileSummary?.monthlyIncome)) },
        { label: t("Chi sinh hoạt", "Living expenses"), value: full(financeAmount(profileSummary?.monthlyExpense)) },
        { label: t("Trả nợ trong tháng", "Monthly debt payments"), value: full(financeAmount(profileSummary?.monthlyDebtService)) },
      ] : [{ label: t("Chưa có kết quả tính", "No calculation available"), value: full(null) }],
      result: full(amount), note: t("Mở Kế hoạch để bổ sung dữ liệu và xem đầy đủ ảnh hưởng của khoản dành riêng, thời điểm góp và lịch nguồn tiền.", "Open Plan to complete your details and include reserves, contribution timing and funding schedules."),
    }} action={<Link className="overview-button primary" to="/user/plan" onClick={onClose}>{t("Xem kế hoạch chi tiết", "View detailed plan")}</Link>} />;
  }
  const description = preview ? t("Đây là cơ sở dùng cho các số liệu đang hiển thị trên Tổng quan. Các tham số kinh tế được lấy từ phiên bản giả định và chính sách hệ thống.", "These are the settings behind the figures shown on Overview. Economic parameters come from the system's assumption and policy versions.") : t("Cần tính kế hoạch để xem đúng giả định của các số liệu.", "Calculate a plan to view the assumptions behind its figures.");
  const timing = calculation?.conventions?.contributionTiming;
  const values = preview ? [[t("Ngày định giá", "Data date"), formatDateVN(preview.valuationDate)], [t("Phiên bản giả định", "Assumption version"), String(preview.references?.assumptionVersion ?? "—")], [t("Kịch bản", "Scenario"), calculation?.scenario?.label || preview.selection.scenario || "—"], [t("Thời điểm góp", "Contribution timing"), timing === "START_OF_MONTH" ? t("Đầu tháng", "Start of month") : timing === "END_OF_MONTH" ? t("Cuối tháng", "End of month") : t("Xem kế hoạch chi tiết", "See detailed plan")], [t("Tiền dành riêng mỗi tháng", "Monthly reserve"), money(preview.selection.monthlyReserve)]] : [];
  return <ResponsiveDialog open title={titles.assumptions} onClose={onClose} className="user-workspace-dialog dashboard-detail-dialog">
    <p>{description}</p><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {calculation?.limitations?.length ? <ul>{calculation.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
    {preview?.warnings?.length ? <ul>{preview.warnings.map((warning, index) => <li key={index}>{en ? (warning.code === "PENSION_NOT_INCLUDED" ? "Declared pension is not included." : "Review this assumption in the detailed plan.") : WARNING_MESSAGES[warning.code] ?? "Xem lưu ý tính toán trong kế hoạch chi tiết."}</li>)}</ul> : null}
    <p className="dashboard-detail-note">{t("Các con số là dự phóng theo giả định, không phải cam kết kết quả.", "The figures are projections under assumptions, not guaranteed results.")}</p>
    <Link className="overview-button secondary" to="/user/plan" onClick={onClose}>{t("Xem kế hoạch chi tiết", "View detailed plan")}</Link>
  </ResponsiveDialog>;
}
