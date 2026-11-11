import { Link } from "react-router";
import { useI18n } from "../i18n";
import { WARNING_MESSAGES, type RetirementPreviewResult } from "../services/retirement";
import { formatDateVN, formatMonthVN } from "../utils/date";
import ResponsiveDialog from "./ResponsiveDialog";
import "./user-workspace-dialogs.css";

export const overviewNumber = (value: unknown): number | null => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
export function overviewMoney(value: number | null, en: boolean, compact = false) {
  if (value === null) return en ? "Undetermined" : "Chưa xác định";
  const unit = compact && Math.abs(value) >= 1e9 ? 1e9 : compact && Math.abs(value) >= 1e6 ? 1e6 : 1;
  return `${new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: unit === 1 ? 0 : unit === 1e9 ? 2 : 1, minimumFractionDigits: unit === 1e9 ? 2 : 0 }).format(value / unit)}${unit === 1e9 ? (en ? " billion" : " tỷ") : unit === 1e6 ? (en ? " million" : " triệu") : ""} ₫`;
}
export type DashboardDetail = "projected" | "required" | "capacity" | "assumptions";

export default function DashboardDetailsDialog({ detail, preview, capacity, onClose }: { detail: DashboardDetail; preview: RetirementPreviewResult | null; capacity: number | null; onClose: () => void }) {
  const { language } = useI18n(), en = language === "en";
  const t = (vi: string, english: string) => en ? english : vi;
  const money = (value: unknown) => overviewMoney(overviewNumber(value), en);
  const calculation = preview?.calculation, summary = calculation?.summary;
  const titles = { projected: t("Quỹ dự kiến khi nghỉ hưu", "Projected fund at retirement"), required: t("Quỹ cần cho mục tiêu", "Required fund for your goal"), capacity: t("Có thể góp tháng đầu", "First-month contribution capacity"), assumptions: t("Giả định tính toán", "Calculation assumptions") };
  let description: string;
  let values: Array<[string, string]>;
  if (detail === "projected") {
    description = t("Đây là số dư quỹ dự kiến tại thời điểm nghỉ hưu, từ dòng tiền từng tháng theo tài sản, tiền góp, khoản rút và giả định đầu tư đã chọn.", "This is the projected retirement fund from the monthly cash-flow model, using selected assets, contributions, withdrawals and investment assumptions.");
    values = [[t("Vốn hưu trí ban đầu", "Initial retirement capital"), money(summary?.initialRetirementCapital)], [t("Mức góp đang thử", "Monthly contribution being tried"), money(summary?.plannedMonthlyContribution)], [titles.projected, money(summary?.atRetirement?.projectedFund)]];
  } else if (detail === "required") {
    description = t("Mô hình ước tính quỹ cần có khi nghỉ hưu để đáp ứng chi tiêu dự phóng, sau khi tính nguồn thu và lương hưu đã chọn, đến cuối kế hoạch.", "The model estimates the fund needed at retirement to meet projected spending, after selected income and pension, through the end of the plan.");
    values = [[t("Chi tiêu mỗi tháng khi nghỉ hưu", "Monthly expense at retirement"), money(summary?.futureMonthlyExpense)], [t("Tính đến tháng", "Plan end"), summary?.endMonth ? formatMonthVN(summary.endMonth) : "—"], [titles.required, money(summary?.atRetirement?.requiredFund)]];
  } else if (detail === "capacity") {
    description = calculation ? t("Đây là khả năng góp của tháng đầu trong bảng dự phóng, đã xét thu nhập, chi tiêu, trả nợ cùng khoản dự phòng và ràng buộc được chọn trong kế hoạch.", "This is the first projected month's contribution capacity, after income, expenses, debts and the plan's reserves and constraints.") : t("Khi chưa có dự phóng, số này tạm lấy từ thặng dư hàng tháng trong hồ sơ. Chưa áp dụng khoản dành riêng và các ràng buộc của kế hoạch.", "Before a projection is available, this is the available monthly surplus from your profile. Plan reserves and other constraints have not yet been applied.");
    values = [[titles.capacity, money(capacity === null ? null : Math.max(0, capacity))]];
  } else {
    description = preview ? t("Đây là cơ sở dùng cho các số liệu đang hiển thị trên Tổng quan. Các tham số kinh tế được lấy từ phiên bản giả định và chính sách hệ thống.", "These are the settings behind the figures shown on Overview. Economic parameters come from the system's assumption and policy versions.") : t("Cần tính kế hoạch để xem đúng giả định của các số liệu.", "Calculate a plan to view the assumptions behind its figures.");
    const timing = calculation?.conventions?.contributionTiming;
    values = preview ? [[t("Ngày định giá", "Data date"), formatDateVN(preview.valuationDate)], [t("Phiên bản giả định", "Assumption version"), String(preview.references?.assumptionVersion ?? "—")], [t("Kịch bản", "Scenario"), calculation?.scenario?.label || preview.selection.scenario || "—"], [t("Thời điểm góp", "Contribution timing"), timing === "START_OF_MONTH" ? t("Đầu tháng", "Start of month") : timing === "END_OF_MONTH" ? t("Cuối tháng", "End of month") : t("Xem kế hoạch chi tiết", "See detailed plan")], [t("Tiền dành riêng mỗi tháng", "Monthly reserve"), money(preview.selection.monthlyReserve)]] : [];
  }
  return <ResponsiveDialog open title={titles[detail]} onClose={onClose} className="user-workspace-dialog dashboard-detail-dialog">
    <p>{description}</p><dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {detail === "required" && <p>{t("Tỷ lệ đáp ứng so sánh hai số tiền theo giả định, không phải xác suất kế hoạch thành công.", "Fund coverage compares two amounts under the assumptions; it is not a probability of success.")}</p>}
    {detail === "capacity" && capacity !== null && capacity < 0 && <p>{t("Chi và trả nợ đang vượt thu nhập. Hiện chưa có phần dư để góp quỹ.", "Expenses and debt payments exceed income. There is no available contribution capacity.")}</p>}
    {detail === "assumptions" && <>{calculation?.limitations?.length ? <ul>{calculation.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}{preview?.warnings?.length ? <ul>{preview.warnings.map((warning, index) => <li key={index}>{en ? (warning.code === "PENSION_NOT_INCLUDED" ? "Declared pension is not included." : "Review this assumption in the detailed plan.") : WARNING_MESSAGES[warning.code] ?? "Xem lưu ý tính toán trong kế hoạch chi tiết."}</li>)}</ul> : null}</>}
    <p className="dashboard-detail-note">{t("Các con số là dự phóng theo giả định, không phải cam kết kết quả.", "The figures are projections under assumptions, not guaranteed results.")}</p>
    <Link className="overview-button secondary" to={detail === "capacity" ? "/user/profile?section=cashflow" : "/user/plan"} onClick={onClose}>{detail === "capacity" ? t("Rà soát thu nhập và chi tiêu", "Review income and expenses") : t("Xem kế hoạch chi tiết", "View detailed plan")}</Link>
  </ResponsiveDialog>;
}
