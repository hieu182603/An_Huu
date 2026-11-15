import { Link } from "react-router";
import { useI18n } from "../../i18n";
import type { RetirementPreviewResult } from "../../services/retirement";
import { financeMoney } from "../../utils/financeHubSummary";
import { formatMonthVN } from "../../utils/date";


export default function PlanNarrative({ preview, birthMonth }: { preview: RetirementPreviewResult; birthMonth?: string }) {
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const calculation = preview.calculation;
  if (!calculation) return null;
  const { summary, rows } = calculation, first = rows[0];
  const money = (value: string | null | undefined) => financeMoney(value ?? null, en);
  const age = (month: string) => birthMonth ? Math.floor(((Number(month.slice(0,4)) - Number(birthMonth.slice(0,4))) * 12 + Number(month.slice(5,7)) - Number(birthMonth.slice(5,7))) / 12) : null;
  const annualRate = (factor: string | undefined) => factor && /^\d+(\.\d+)?$/.test(factor) ? new Intl.NumberFormat(en ? "en-GB" : "vi-VN", { maximumFractionDigits: 2 }).format((Math.pow(Number(factor),12)-1)*100) + "%" : "—";
  const lastIndex=Number(summary.endMonth.slice(0,4))*12+Number(summary.endMonth.slice(5,7));
  const preparedThrough=`${Math.floor(lastIndex/12)}-${String(lastIndex%12+1).padStart(2,"0")}`;
  return <div className="plan-narrative">
    <ol className="goal-sync-timeline life-timeline">{[[t("Bắt đầu tính", "Start"), preview.valuationDate.slice(0,7)], [t("Nghỉ hưu mong muốn", "Retirement"), summary.retirementMonth], [t("Chuẩn bị đến", "Prepare through"), preparedThrough]].map(([label, month]) => <li key={label}><span>{label}</span><strong>{formatMonthVN(month)}</strong>{age(month) !== null && <small>{age(month)} {t("tuổi", "years old")}</small>}</li>)}</ol>
    <p>{t("Dự tính chi tiêu đến hết tháng", "Spending is modeled through")} {formatMonthVN(summary.endMonth)}.</p>
    <section><h3>{t("Kế hoạch qua từng giai đoạn", "Your plan over time")}</h3><p>{t("Đến khi nghỉ hưu", "At retirement")}{age(summary.retirementMonth) !== null && <> ({age(summary.retirementMonth)} {t("tuổi", "years old")})</>}, {t("quỹ dự kiến", "the projected fund is")} <strong>{money(summary.atRetirement.projectedFund)}</strong>; {t("còn thiếu", "the funding gap is")} <strong>{money(summary.atRetirement.fundingGap?.startsWith("-") ? "0" : summary.atRetirement.fundingGap)}</strong>. {t("Thời gian còn để chuẩn bị", "Preparation time")}: {Math.floor(summary.accumulationMonths / 12)} {t("năm", "years")} {summary.accumulationMonths % 12} {t("tháng", "months")}.</p><p>{t("Số dự kiến đã gồm khoản góp và tăng trưởng giả định trong phiên bản này; chưa phải lợi nhuận được bảo đảm.", "The projection includes contributions and assumed growth in this version; returns are not guaranteed.")}</p></section>
    <section><h3>{t("Ngân sách tháng đầu có đủ không?", "Does the first month's budget cover contributions?")}</h3><p>{t("Muốn góp", "Planned contribution")}: <strong>{money(first?.plannedContribution ?? summary.plannedMonthlyContribution)}</strong> / {t("Khả năng góp", "Contribution capacity")}: <strong>{money(first?.contributionCapacity)}</strong>.</p>{first && <p>{Number(first.budgetShortfall) > 0 ? t("Ngân sách có khoảng thiếu cần xem lại trước khi chọn mức góp.", "Review the budget shortfall before choosing contributions.") : t("Đối chiếu lại thu nhập, chi tiêu và khoản nợ trước khi chốt mức góp.", "Review income, expenses and debt before confirming contributions.")}</p>}</section>
    <section><h3>{t("Việc nên làm tiếp theo", "Next steps")}</h3><p><Link to="/user/profile?section=cashflow">{t("Rà soát thu nhập và chi tiêu", "Review income and expenses")}</Link> · <Link to="/user/plan?view=compare">{t("Thử các phương án", "Compare options")}</Link> · <Link to="/user/simulation">{t("Cập nhật tình hình", "Update actuals")}</Link></p></section>
    <details><summary>{t("Cơ sở và phạm vi phép tính", "Calculation basis and scope")}</summary><p>{t("Tháng đầu", "First month")}: {t("lạm phát", "inflation")} {annualRate(first?.inflationFactor)} / {t("lợi suất danh mục trước phí tư vấn", "portfolio return before advisory fees")} {annualRate(first?.growthFactor)} {t("mỗi năm, quy đổi từ lãi suất tháng đang tính", "per year, converted from the modeled monthly rate")}.</p><p>{t("Dùng hồ sơ, chính sách và giả định đã ghim trong kết quả này. Không bao gồm khoản chưa kê khai; lương hưu chưa xác nhận không tự thay bằng 0.", "Uses the profile, policy and assumptions pinned to this result. Undeclared items are excluded; unconfirmed pension is not assumed to be zero.")}</p>{preview.sources?.length > 0 && <ul>{preview.sources.map(source => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</li>)}</ul>}</details>
  </div>;
}
