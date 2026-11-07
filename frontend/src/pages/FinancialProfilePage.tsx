import { useRef, useState } from "react";
import { Link } from "react-router";
import FinancialProfileGate from "../components/FinancialProfileGate";
import FinancialProfilePanel, { type PanelTab } from "../components/FinancialProfilePanel";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { profileDisplayStatus } from "../services/profileDisplay";
import { useI18n } from "../i18n";
import "./financial-profile.css";

// "Tài chính của bạn" hub, following the demo: four cash-flow figures, then one
// card per topic that opens the matching section of the profile editor below.
export default function FinancialProfilePage() {
  const { hasProfile, completenessPercentage, profileSummary, v2Profile, profile } = useFinancialProfile();
  const { language, formatCurrency } = useI18n();
  const vi = language !== "en";
  const [section, setSection] = useState<PanelTab | undefined>(undefined);
  const [request, setRequest] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const known = profileDisplayStatus(v2Profile);
  const num = (key: string) => profileSummary?.[key] != null ? Number(profileSummary[key]) : null;
  const money = (value: number | null, ok = true) => value == null || !ok ? (vi ? "Chưa đủ thông tin" : "Not enough information") : formatCurrency(value);
  const income = num("monthlyIncome"), expense = num("monthlyExpense"), debtService = num("monthlyDebtService");
  const surplus = num("availableMonthlySurplus") ?? num("monthlyNetCashflow");
  const totalAssets = num("totalAssets"), totalDebt = num("totalDebt");
  const status = (collection?: { status?: string }) => collection?.status === "KNOWN" || collection?.status === "NOT_APPLICABLE";

  const open = (tab: PanelTab) => {
    setSection(tab);
    setRequest(value => value + 1);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const metrics = [
    { label: vi ? "Thu nhập + lương hưu" : "Income & pension", value: money(income, known.income), note: vi ? "Theo các nguồn thu đã khai" : "From declared income sources" },
    { label: vi ? "Chi tiêu sinh hoạt" : "Living expenses", value: money(expense, known.expenses), note: vi ? "Chưa bao gồm tiền trả nợ" : "Excluding debt payments" },
    { label: vi ? "Trả nợ trong tháng" : "Debt payments", value: money(debtService, known.debtPayment), note: vi ? "Theo dư nợ và lịch đã khai" : "From declared balances and schedules" },
    { label: vi ? "Phần dư thu chi" : "Monthly surplus", value: money(surplus, known.surplus), note: vi ? "Trước khoản góp nghỉ hưu" : "Before retirement contributions", tone: surplus != null && surplus < 0 ? "is-negative" : "" },
  ];

  const pensionStatus = v2Profile?.pension?.status;

  const rawMarital = v2Profile?.personal?.maritalStatus ?? (profile?.personal?.maritalStatus ? profile.personal.maritalStatus.toUpperCase() : null);
  const marital = rawMarital === "SINGLE" ? (vi ? "Độc thân" : "Single")
    : rawMarital === "MARRIED" ? (vi ? "Đã kết hôn" : "Married")
    : rawMarital === "OTHER" ? (vi ? "Khác" : "Other")
    : (vi ? "Chưa cung cấp" : "Not provided");

  const rawDependents = v2Profile?.personal?.dependents?.status === "KNOWN"
    ? v2Profile.personal.dependents.value
    : profile?.personal?.dependents != null ? profile.personal.dependents : null;
  const dependents = rawDependents != null
    ? `${rawDependents} ${vi ? "người" : "dependents"}`
    : (vi ? "Chưa cung cấp" : "Not provided");

  const familyDone = Boolean(rawMarital || rawDependents != null);

  const topics: { title: string; done: boolean; lines: string[]; note: string; action: string; tab?: PanelTab; to?: string }[] = [
    { title: vi ? "Thu nhập & chi tiêu" : "Income & expenses", done: status(v2Profile?.income) && status(v2Profile?.expenses),
      lines: [`${vi ? "Thu nhập" : "Income"}: ${money(income, known.income)}`, `${vi ? "Chi tiêu" : "Expenses"}: ${money(expense, known.expenses)}`],
      note: vi ? "Lương, nguồn thu khác và chi phí sinh hoạt hằng tháng." : "Salary, other income and monthly living costs.", action: vi ? "Xem & cập nhật thu chi" : "Review income & expenses", tab: "v2-cashflow" },
    { title: vi ? "Tài sản & dự phòng" : "Assets & reserves", done: status(v2Profile?.assets),
      lines: [`${vi ? "Tổng tài sản" : "Total assets"}: ${money(totalAssets, known.assets)}`],
      note: vi ? "Tách riêng tiền hưu trí khỏi nhà ở, tiền kinh doanh và dự phòng khẩn cấp." : "Separate retirement money from home, business and emergency funds.", action: vi ? "Xem & phân loại tài sản" : "Review assets", tab: "v2-assets" },
    { title: vi ? "Khoản nợ & trả nợ" : "Debts & repayments", done: status(v2Profile?.debts),
      lines: [`${vi ? "Tổng dư nợ" : "Total debt"}: ${money(totalDebt, known.debtBalance)}`, `${vi ? "Trả nợ mỗi tháng" : "Monthly payment"}: ${money(debtService, known.debtPayment)}`],
      note: vi ? "Lãi suất, lịch trả nợ và ảnh hưởng đến ngân sách tích lũy." : "Rates, schedules and their effect on your saving budget.", action: vi ? "Xem chi tiết khoản nợ" : "Review debts", to: "/user/debts" },
    { title: vi ? "Lương hưu BHXH" : "Social insurance pension", done: pensionStatus === "KNOWN" || pensionStatus === "NOT_APPLICABLE",
      lines: [`${vi ? "Lương hưu" : "Pension"}: ${pensionStatus === "KNOWN" ? (vi ? "Đã khai" : "Declared") : pensionStatus === "NOT_APPLICABLE" ? (vi ? "Không tham gia" : "Not applicable") : (vi ? "Chưa xác nhận" : "Not confirmed")}`],
      note: vi ? "Lịch sử đóng BHXH và mức lương hưu dự kiến đưa vào kế hoạch." : "Contribution history and the expected pension used in your plan.", action: vi ? "Xem & cập nhật lương hưu" : "Review pension", tab: "v2-pension" },
    { title: vi ? "Gia đình & người phụ thuộc" : "Family & dependents", done: familyDone,
      lines: [`${vi ? "Hôn nhân" : "Marital status"}: ${marital}`, `${vi ? "Người phụ thuộc" : "Dependents"}: ${dependents}`],
      note: vi ? "Khai đúng tình trạng hôn nhân và số người phụ thuộc để bảo vệ mục tiêu tích lũy." : "Declare marital status and dependents to protect saving goals.", action: vi ? "Xem & cập nhật gia đình" : "Review family", tab: "v2-timing" },
  ];

  return <div className="financial-profile-page finance-hub-page">
    <header className="financial-profile-header finance-hub-head">
      <div>
        <h1>{vi ? "Tài chính của bạn" : "Your finances"}</h1>
        <p>{vi ? "Nắm rõ toàn bộ thu chi, tài sản, nợ và nghĩa vụ gia đình trước khi lập kế hoạch." : "Get a clear view of income, spending, assets, debts and family duties before planning."}</p>
      </div>
      <div className="finance-hub-actions" style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div className="finance-hub-progress">
          <span>{vi ? "Hồ sơ đã hoàn thiện" : "Profile complete"}</span>
          <strong>{completenessPercentage}%</strong>
          <progress value={completenessPercentage} max={100} aria-label={vi ? "Độ hoàn thiện hồ sơ" : "Profile completion"} />
        </div>
        <Link to="/user/account?tab=settings" className="button button-secondary">
          {vi ? "Cài đặt tài khoản →" : "Account settings →"}
        </Link>
      </div>
    </header>
    <FinancialProfileGate inline>
      {hasProfile ? <>
        <section className="finance-hub-metrics" aria-label={vi ? "Dòng tiền hằng tháng" : "Monthly cash flow"}>
          {metrics.map(metric => <div key={metric.label} className={`finance-hub-metric ${metric.tone ?? ""}`}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></div>)}
        </section>
        <section className="finance-hub-grid" aria-label={vi ? "Các mục hồ sơ tài chính" : "Financial profile topics"}>
          {topics.map(topic => <article key={topic.title} className="finance-hub-card">
            <header><h2>{topic.title}</h2><span className={`finance-hub-badge ${topic.done ? "is-done" : "is-missing"}`}>{topic.done ? (vi ? "Đã khai" : "Declared") : (vi ? "Chưa khai" : "Missing")}</span></header>
            <ul>{topic.lines.map(line => <li key={line}>{line}</li>)}</ul>
            <p>{topic.note}</p>
            {topic.to
              ? <Link className="button button-secondary" to={topic.to}>{topic.action} →</Link>
              : <button type="button" className="button button-secondary" aria-pressed={section === topic.tab} onClick={() => topic.tab && open(topic.tab)}>{topic.action} →</button>}
          </article>)}
        </section>
        <div ref={editorRef} className="finance-hub-editor" tabIndex={-1}>
          <FinancialProfilePanel section={section} sectionRequest={request} />
        </div>
      </> : <section className="financial-profile-empty"><h2>{vi ? "Bạn chưa có hồ sơ tài chính" : "Start your financial profile"}</h2><p>{vi ? "Khai báo thông tin ban đầu để theo dõi và cập nhật hồ sơ tại đây." : "Enter your initial information to review and update it here."}</p><Link className="btn btn-primary" to="/onboarding">{vi ? "Khai báo hồ sơ" : "Create profile"}</Link></section>}
    </FinancialProfileGate>
  </div>;
}
