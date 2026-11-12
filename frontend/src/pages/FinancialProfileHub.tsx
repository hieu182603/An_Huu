import { useState } from "react";
import NetWorthExplanation from "../components/NetWorthExplanation";
import { Icon } from "../components/ui";
import { Link } from "react-router";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import ProfileMoneyMetrics from "../components/ProfileMoneyMetrics";
import { financeAmount, financeHubSummary, financeMoney } from "../utils/financeHubSummary";
import { formatMonthVN } from "../utils/date";
import "../components/user-workspace-dialogs.css";
import "./finance-hub.css";

type Metric = "income" | "expenses" | "debtPayment" | "surplus";
type Status = "done" | "partial" | "missing";
type Topic = { key: string; title: string; status: Status; rows: Array<[string, string]>; note: string; action: string; to: string };

export default function FinancialProfileHub() {
  const { profile, v2Profile: v2, profileSummary, hasProfile, loadError } = useFinancialProfile();
  const [netWorthOpen, setNetWorthOpen] = useState(false);
  const { language } = useI18n(), en = language === "en";
  const t = (vi: string, english: string) => en ? english : vi;
  const money = (amount: string | null) => financeMoney(amount, en);
  const monthly = (amount: string | null) => `${money(amount)}${amount === null ? "" : t("/tháng", "/month")}`;
  const values = financeHubSummary(profileSummary, v2, profile);
  const month = v2?.valuationDate?.slice(0, 7);
  const monthText = month ? formatMonthVN(month) : t("theo hồ sơ đã khai", "as declared in your profile");
  const periodLabel = month ? `${t("Tháng", "Month")} ${monthText}` : t("Theo hồ sơ đã khai", "As declared in your profile");
  const unknown = t("Chưa xác nhận", "Not confirmed");
  const status = (declared: boolean, complete: boolean): Status => complete ? "done" : declared ? "partial" : "missing";
  const declared = (group: { status: string } | undefined) => group?.status === "KNOWN" || group?.status === "NOT_APPLICABLE";
  const negative = values.surplus?.startsWith("-") ?? false;
  const labels: Record<Metric, string> = {
    income: t("Thu nhập + lương hưu", "Income & pension"), expenses: t("Chi tiêu sinh hoạt", "Living expenses"),
    debtPayment: t("Trả nợ trong tháng", "Debt payments"), surplus: negative ? t("Ngân sách đang thiếu", "Budget shortfall") : t("Phần dư thu chi", "Monthly surplus"),
  };
  const pension = v2?.pension;
  const pensionAmount = pension?.status === "KNOWN" ? financeAmount(pension.monthlyAmount) : null;
  const pensionStart = v2?.personal.pensionStartMonth;
  const marital = v2 ? v2.personal.maritalStatus : profile.personal.maritalStatus;
  const maritalText = ({ SINGLE: t("Độc thân", "Single"), MARRIED: t("Đã kết hôn", "Married"), DIVORCED: t("Đã ly hôn", "Divorced"), OTHER: t("Khác", "Other"), "Đã ly hôn": t("Đã ly hôn", "Divorced"), "Độc thân": t("Độc thân", "Single"), "Đã kết hôn": t("Đã kết hôn", "Married"), "Khác": t("Khác", "Other") } as Record<string, string>)[marital ?? ""] ?? t("Chưa cung cấp", "Not provided");
  const dependents = v2 ? v2.personal.dependents?.status === "KNOWN" ? v2.personal.dependents.value : null : profile.personal.dependents;
  const topics: Topic[] = [
    { key: "cashflow", title: t("Thu nhập & chi tiêu", "Income & expenses"), status: status(!v2 || declared(v2.income) || declared(v2.expenses), values.income !== null && values.expenses !== null && values.debtPayment !== null && values.surplus !== null),
      rows: [[`${labels.income}:`, monthly(values.income)], [`${labels.expenses}:`, monthly(values.expenses)], [`${labels.surplus}:`, monthly(values.surplus)]],
      note: `${periodLabel} · ${t("Sau sinh hoạt và trả nợ, trước tiền giữ lại và góp nghỉ hưu.", "After living expenses and debt payments, before reserves and retirement contributions.")}`,
      action: t("Xem & cập nhật thu chi", "Review income & expenses"), to: "/user/profile?section=cashflow" },
    { key: "assets", title: t("Tài sản & dự phòng", "Assets & reserves"), status: status(!v2 || declared(v2.assets), values.retirementAssets !== null && values.reserve !== null),
      rows: [[t("Dành cho hưu trí:", "For retirement:"), money(values.retirementAssets)], [t("Quỹ dự phòng:", "Emergency reserve:"), money(values.reserve)], [t("Tài sản ròng:", "Net worth:"), money(financeAmount(profileSummary?.netWorth))]],
      note: t("Tách riêng tiền hưu trí khỏi nhà ở, tiền kinh doanh và dự phòng khẩn cấp.", "Separate retirement money from housing, business funds and emergency reserves."), action: t("Xem & phân loại tài sản", "Review & classify assets"), to: "/user/profile?section=assets" },
    { key: "debts", title: t("Khoản nợ & trả nợ", "Debts & repayments"), status: status(!v2 || declared(v2.debts), values.debtBalance !== null && values.debtPayment !== null),
      rows: [[t("Tổng dư nợ:", "Outstanding debt:"), money(values.debtBalance)], [month ? t(`Trả nợ tháng ${monthText}:`, `Payments for ${monthText}:`) : t("Trả nợ trong tháng:", "Monthly payments:"), money(values.debtPayment)]],
      note: t("Lãi suất, lịch trả nợ và ảnh hưởng của việc trả nợ đến ngân sách tích lũy.", "Interest rates, repayment schedules and their effect on your saving budget."), action: t("Xem chi tiết khoản nợ", "Review debt details"), to: "/user/debts" },
    { key: "pension", title: t("Lương hưu BHXH", "Social insurance pension"), status: status(declared(pension), pension?.status === "NOT_APPLICABLE" && Boolean(pension.reason.trim()) || pensionAmount !== null && pensionStart?.status === "KNOWN"),
      rows: [[t("Lương hưu:", "Pension:"), pension?.status === "NOT_APPLICABLE" ? t("Không có lương hưu", "No pension declared") : pensionAmount !== null ? monthly(pensionAmount) : unknown], [t("Bắt đầu từ:", "Starting from:"), pension?.status === "NOT_APPLICABLE" ? t("Không áp dụng", "Not applicable") : pensionStart?.status === "KNOWN" ? formatMonthVN(pensionStart.value) : unknown]],
      note: pension?.status === "KNOWN" ? t(`Mức tự khai theo ${pension.priceBasis === "TODAY" ? "giá tại" : "giá danh nghĩa khi bắt đầu"} ${formatMonthVN(pension.basisMonth)}; chưa phải kết quả xác minh quyền lợi BHXH.`, `Self-declared amount in ${pension.priceBasis === "TODAY" ? "prices at" : "nominal prices at the start"} ${formatMonthVN(pension.basisMonth)}; pension entitlement has not been verified.`) : t("Lịch sử tham gia BHXH và mức lương hưu dự kiến đưa vào kế hoạch.", "Contribution history and estimated pension used in your plan."),
      action: t("Xem & cập nhật lương hưu", "Review & update pension"), to: "/user/profile?section=insurance" },
    { key: "family", title: t("Gia đình & người phụ thuộc", "Family & dependents"), status: status(Boolean(marital) || dependents !== null, Boolean(marital) && dependents !== null),
      rows: [[t("Hôn nhân:", "Marital status:"), maritalText], [t("Người phụ thuộc:", "Dependents:"), dependents === null ? t("Chưa cung cấp", "Not provided") : `${dependents} ${t("người", "people")}`]],
      note: t("Tình trạng hôn nhân và số người cần chăm sóc tài chính.", "Marital status and people who depend on your financial support."), action: t("Xem & cập nhật gia đình", "Review & update family"), to: "/user/profile?section=family" },
  ];

  return <div className="finance-summary-page">
    <header className="finance-summary-heading"><h1>{t("Tài chính của bạn", "Your finances")}</h1><p>{t("Nắm rõ toàn bộ thu chi, tài sản, nợ và nghĩa vụ gia đình trước khi lập kế hoạch.", "Get a clear view of income, spending, assets, debts and family duties before planning.")}</p></header>
    {loadError ? <p className="finance-summary-unavailable" role="status">{t("Số liệu tạm ẩn cho đến khi tải lại hồ sơ thành công.", "Figures are hidden until your profile reloads successfully.")}</p> : !hasProfile ? <section className="finance-summary-empty"><h2>{t("Bạn chưa có hồ sơ tài chính", "Start your financial profile")}</h2><p>{t("Khai báo thông tin ban đầu để theo dõi và cập nhật hồ sơ tại đây.", "Enter your initial information to review and update it here.")}</p><Link className="overview-button" to="/onboarding" state={{ from: "/user/profile" }}>{t("Khai báo hồ sơ", "Create profile")}</Link></section> : <>
      <ProfileMoneyMetrics />
      <section className="finance-summary-grid" aria-label={t("Các mục hồ sơ tài chính", "Financial profile topics")}>
        {topics.map(topic => <article className={`finance-summary-card${topic.key === "cashflow" && negative ? " is-negative" : ""}`} key={topic.key} aria-labelledby={`finance-topic-${topic.key}`}>
          <header><h2 id={`finance-topic-${topic.key}`}>{topic.title}</h2><span className={`finance-summary-badge is-${topic.status}`}>{topic.status === "done" ? t("Đã khai", "Declared") : topic.status === "partial" ? t("Cần bổ sung", "Needs details") : t("Chưa khai", "Not declared")}</span></header>
          <dl>{topic.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{topic.key === "assets" && <button type="button" className="overview-button secondary" aria-haspopup="dialog" aria-label={t("Giải thích tài sản ròng", "Explain net worth")} onClick={()=>setNetWorthOpen(true)}><Icon name="info" /> {t("Cách tính tài sản ròng", "How net worth is calculated")}</button>}<p>{topic.note}</p><Link to={topic.to} className="overview-button secondary">{topic.action} <span aria-hidden="true">→</span></Link>
        </article>)}
      </section>
    </>}

    {netWorthOpen && !loadError && hasProfile && <NetWorthExplanation assets={financeAmount(profileSummary?.totalAssets)} debt={values.debtBalance} netWorth={financeAmount(profileSummary?.netWorth)} valuationDate={v2?.valuationDate} onClose={()=>setNetWorthOpen(false)} />}
  </div>;
}
