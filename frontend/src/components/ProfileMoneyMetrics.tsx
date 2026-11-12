import { formatMoneyDecimal } from "../utils/moneyDisplay";
import { useState } from "react";
import { Link } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import { financeHubSummary, financeMoney } from "../utils/financeHubSummary";
import { formatMonthVN } from "../utils/date";
import { Icon } from "./ui";
import MoneyExplanationDialog, { type MoneyExplanation } from "./MoneyExplanationDialog";
import "../pages/finance-hub.css";

type Metric = "income" | "expenses" | "debtPayment" | "surplus";

export default function ProfileMoneyMetrics() {
  const { profile, v2Profile, profileSummary, loading, loadError, hasProfile } = useFinancialProfile();
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [detail, setDetail] = useState<Metric | null>(null);
  const values = financeHubSummary(profileSummary, v2Profile, profile);
  const money = (v: string | null) => financeMoney(v, en);
  const fullMoney = (v: string | null) => formatMoneyDecimal(v, en);
  const negative = values.surplus?.startsWith("-") ?? false;
  const month = v2Profile?.valuationDate.slice(0, 7);
  const labels: Record<Metric, string> = { income: t("Thu nhập + lương hưu", "Income & pension"), expenses: t("Chi tiêu sinh hoạt", "Living expenses"), debtPayment: t("Trả nợ trong tháng", "Debt payments"), surplus: negative ? t("Ngân sách đang thiếu", "Budget shortfall") : t("Phần dư thu chi", "Monthly surplus") };
  const captions: Record<Metric, string> = { income: t("Theo lịch nguồn tiền trong hồ sơ", "From the profile's income schedule"), expenses: t("Chưa bao gồm tiền trả nợ", "Excludes debt payments"), debtPayment: t("Theo dư nợ và lịch đã khai", "From declared repayment schedules"), surplus: t("Trước tiền giữ lại và góp nghỉ hưu", "Before reserves and retirement contributions") };
  const descriptions: Record<Metric, string> = {
    income: t("Tổng các nguồn thu đến hạn trong tháng định giá hồ sơ, gồm lương hưu khi đã bắt đầu hưởng và có đủ dữ liệu. Nguồn thu ở tháng tương lai không được cộng sớm; nguồn lương hưu không cộng trùng với thu nhập.", "Total income due in the profile's valuation month, including pension once it starts and sufficient details are available. Future income is not counted early, and pension is not counted twice."),
    expenses: t("Tổng chi sinh hoạt có hiệu lực trong tháng định giá hồ sơ. Các khoản trả nợ được tách riêng; tiền để dành mỗi tháng cho việc khác và góp quỹ hưu cũng được đối chiếu riêng trong kế hoạch.", "Living expenses effective in the profile's valuation month. Debt payments, monthly reserves and retirement contributions are accounted for separately."),
    debtPayment: t("Tổng gốc và lãi cần thanh toán trong tháng, theo lịch vay và phần trách nhiệm đã khai. Đây là khoản trả trong kỳ, không phải toàn bộ dư nợ.", "Principal and interest due this month under the declared loan schedules and responsibilities. This is the period payment, not the entire outstanding debt."),
    surplus: t("Thu nhập và lương hưu trừ chi sinh hoạt và trả nợ, trước tiền dành cho việc khác và góp quỹ hưu. Số âm được giữ nguyên để thấy khoản ngân sách còn thiếu.", "Income and pension less living expenses and debt payments, before other reserves and retirement contributions. A negative value shows the budget shortfall."),
  };
  if (loading || loadError || !hasProfile) return null;
  const data: MoneyExplanation | null = detail ? {
    title: `${t("Giải thích", "Explanation")}: ${labels[detail]}`, label: labels[detail], value: fullMoney(values[detail]),
    subtitle: month ? `${t("Tháng hồ sơ", "Profile month")} ${formatMonthVN(month)}` : t("Theo hồ sơ đã khai", "As declared in your profile"),
    description: descriptions[detail], warning: detail === "surplus" && negative,
    steps: detail === "surplus" ? [
      { label: labels.income, value: `+ ${fullMoney(values.income)}` },
      { label: t("Trừ chi tiêu sinh hoạt", "Subtract living expenses"), value: `− ${fullMoney(values.expenses)}` },
      { label: t("Trừ trả nợ trong tháng", "Subtract monthly debt payments"), value: `− ${fullMoney(values.debtPayment)}` },
    ] : [
      ...(detail === "debtPayment" ? [{ label: t("Tổng dư nợ đang khai báo", "Declared outstanding debt"), value: fullMoney(values.debtBalance), description: t("Là số dư nợ, không trừ toàn bộ số này khỏi thu nhập tháng.", "This is the debt balance; it is not deducted in full from monthly income.") }] : []),
      { label: detail === "income" ? t("Cộng các nguồn thu có hiệu lực trong kỳ", "Add income effective in this period") : labels[detail], value: fullMoney(values[detail]), description: captions[detail] },
    ],
    result: detail === "surplus" ? `${fullMoney(values.income)} − ${fullMoney(values.expenses)} − ${fullMoney(values.debtPayment)} ≈ ${fullMoney(values.surplus)}` : `${labels[detail]} = ${fullMoney(values[detail])}${values[detail] === null ? "" : t("/tháng", "/month")}`,
    note: values[detail] === null ? t("Chưa đủ dữ liệu để xác định chỉ số này. Bổ sung thông tin còn thiếu; không coi khoản chưa rõ là 0.", "More details are needed. Complete missing information; an unknown amount is not zero.") : t("Số liệu tổng hợp từ cùng phiên bản hồ sơ; chỉ làm tròn khi hiển thị. Cửa sổ này chỉ giải thích, không cập nhật dữ liệu hoặc áp dụng kế hoạch.", "Totals come from the same profile revision; rounding is for display only. This dialog explains the data without changing it or applying a plan."),
  } : null;
  return <>
    <section className="finance-summary-metrics" aria-label={t("Dòng tiền theo hồ sơ", "Cash flow from your profile")}>{(["income", "expenses", "debtPayment", "surplus"] as const).map(key => <article key={key} className={`finance-summary-metric is-${key}${key === "surplus" && negative ? " is-negative" : ""}`} aria-label={labels[key]}>
      <div><span>{labels[key]}</span><button type="button" className="finance-summary-info" aria-label={`${t("Giải thích", "Explain")} ${labels[key]}`} aria-haspopup="dialog" onClick={() => setDetail(key)}><Icon name="info" /></button></div>
      <strong>{money(values[key])}</strong><small>{captions[key]}</small>
    </article>)}</section>
    {data && detail && <MoneyExplanationDialog data={data} onClose={() => setDetail(null)} action={<Link className="overview-button primary" to={detail === "debtPayment" ? "/user/debts" : "/user/profile?section=cashflow"} onClick={() => setDetail(null)}>{detail === "debtPayment" ? t("Xem chi tiết khoản nợ", "Review debt details") : t("Rà soát thu nhập và chi tiêu", "Review income and expenses")}</Link>} />}
  </>;
}
