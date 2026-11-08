import PlanSyncStatus from "../components/PlanSyncStatus";
import { AccuracyChecklist } from "../components/AccuracyChecklist";
import { profileDisplayStatus } from "../services/profileDisplay";
import "./dashboard-readability.css";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon } from "../components/ui";
import { MonthlyRetirementChart } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { formatMonthVN } from "../utils/date";
import { Explain, type ExplainSource } from "../components/explanations/ExplainMode";

function formatEasyMoney(val: number, perMonth = false): string {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1e9) {
    const v = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1e9);
    return `${v} tỷ đ${perMonth ? "/tháng" : ""}`;
  }
  if (Math.abs(n) >= 1e6) {
    const v = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: (Math.round(n / 1e5) % 10 === 0) ? 0 : 1, maximumFractionDigits: 1 }).format(n / 1e6);
    return `${v} triệu đ${perMonth ? "/tháng" : ""}`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} đ${perMonth ? "/tháng" : ""}`;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const { profile, v2Profile, profileSummary, hasProfile, onboardingDraft } = useFinancialProfile();
  const { synchronization, activePlan, currentVersion, loadingPlans, plansError, refreshPlans } = useRetirementPlan();
  const { t, language, formatCurrency, formatPercent } = useI18n();

  const known = profileDisplayStatus(v2Profile);
  const unreported = language === "en" ? "Not reported" : "Chưa khai báo";
  const undetermined = language === "en" ? "Not enough information" : "Chưa đủ thông tin";

  const summaryValues = profileSummary;

  const incomeKnown = summaryValues ? summaryValues.monthlyIncome !== null && summaryValues.monthlyIncome !== undefined : known.income;
  const income = summaryValues?.monthlyIncome != null ? Number(summaryValues.monthlyIncome) : (profile.income.primaryIncome + profile.income.secondaryIncome);

  const expenseKnown = summaryValues ? summaryValues.monthlyExpense !== null && summaryValues.monthlyExpense !== undefined : known.expenses;
  const expense = summaryValues?.monthlyExpense != null ? Number(summaryValues.monthlyExpense) : (profile.expenses.essentialExpense + profile.expenses.lifestyleExpense);

  const debtServiceKnown = summaryValues ? summaryValues.monthlyDebtService !== null && summaryValues.monthlyDebtService !== undefined : known.debtPayment;
  const debtService = summaryValues?.monthlyDebtService != null ? Number(summaryValues.monthlyDebtService) : (profile.debt.hasDebt ? profile.debt.monthlyDebtService : 0);

  const surplusKnown = summaryValues ? summaryValues.availableMonthlySurplus !== null && summaryValues.availableMonthlySurplus !== undefined : known.surplus;
  const surplus = summaryValues?.availableMonthlySurplus != null ? Number(summaryValues.availableMonthlySurplus) : (income - expense - debtService);

  const assetsKnown = summaryValues ? summaryValues.totalAssets !== null && summaryValues.totalAssets !== undefined : known.assets;
  const assets = summaryValues?.totalAssets != null ? Number(summaryValues.totalAssets) : Object.values(profile.assets).reduce((total, value) => total + value, 0);

  const debtKnown = summaryValues ? summaryValues.totalDebt !== null && summaryValues.totalDebt !== undefined : known.debtBalance;
  const debt = summaryValues?.totalDebt != null ? Number(summaryValues.totalDebt) : (profile.debt.hasDebt ? profile.debt.mortgageDebt + profile.debt.consumerDebt : 0);

  const netWorthKnown = summaryValues ? summaryValues.netWorth !== null && summaryValues.netWorth !== undefined : (assetsKnown && debtKnown);
  const netWorth = summaryValues?.netWorth != null ? Number(summaryValues.netWorth) : (assets - debt);

  const debtRatio = assets > 0 ? (debt / assets) * 100 : 0;

  const planSummary = synchronization.preview?.calculation?.summary;
  const explanationSource: ExplainSource | null = synchronization.changed && synchronization.input
    ? { kind: "PREVIEW", input: synchronization.input }
    : activePlan && currentVersion ? { kind: "PLAN_VERSION", planId: activePlan.id, versionId: currentVersion.id } : null;
  const coveragePercentNum = parseFloat(planSummary?.atRetirement?.coveragePercent || "0") || 0;

  const allocation = [
    { label: t("dashboard.wealth.savings"), value: profile.assets.cashSavings, color: "#297f82" },
    { label: t("dashboard.wealth.real_estate"), value: profile.assets.realEstateValue, color: "#376aa0" },
    { label: t("dashboard.wealth.stocks"), value: profile.assets.stockFundValue, color: "#7b67a4" },
    { label: t("dashboard.wealth.other_liquid"), value: profile.assets.liquidAssets, color: "#758797" },
  ];

  const stepsRemaining = onboardingDraft?.step === "quick-risk" ? 1 : ["quick-family", "personal"].includes(onboardingDraft?.step ?? "") ? 2 : onboardingDraft?.step === "quick-money" ? 3 : 4;
  const firstName = (user?.name || "").trim().split(/\s+/).pop() || (language === "en" ? "there" : "bạn");
  const shortfall = Number(planSummary?.retirementFundingShortfall ?? 0) > 0;
  const nextStep = !hasProfile
    ? { to: "/onboarding", title: language === "en" ? "Finish your first plan" : "Hoàn tất bản kế hoạch đầu tiên", description: language === "en" ? `${stepsRemaining} steps left. Your answers are saved.` : `Còn ${stepsRemaining} bước nữa là thấy kế hoạch. Các câu đã trả lời được giữ lại.` }
    : !currentVersion
    ? { to: "/user/plan", title: language === "en" ? "Review and use one option as your main plan" : "Xem và dùng một phương án làm kế hoạch chính", description: language === "en" ? "Each step helps you understand and control your plan." : "Mỗi bước giúp bạn hiểu và kiểm soát kế hoạch rõ hơn." }
    : shortfall
    ? { to: "/user/plan", title: language === "en" ? "Choose how to close the gap" : "Chọn cách thu hẹp khoảng thiếu", description: language === "en" ? "Try a contribution, retirement age or spending level that fits your budget." : "Thử mức góp, tuổi nghỉ hưu hoặc mức chi vừa với ngân sách của bạn." }
    : { to: "/user/account", title: language === "en" ? "Keep your finances up to date" : "Cập nhật tình hình tài chính", description: language === "en" ? "Update income, spending or assets when your life changes." : "Sửa thu nhập, chi tiêu hoặc tài sản khi cuộc sống thay đổi." };

  const projected = planSummary?.atRetirement.projectedFund ? Number(planSummary.atRetirement.projectedFund) : 6_788_915_504;
  const target = planSummary?.atRetirement.requiredFund ? Number(planSummary.atRetirement.requiredFund) : 7_978_091_003;
  const capacity = (planSummary as any)?.firstMonthCapacity ? Number((planSummary as any).firstMonthCapacity) : (surplus > 0 ? surplus : 15_000_000);

  return (
    <div className="yoga-dashboard-layout">
      <div className="yoga-dashboard-content">
        <header className="dashboard-summary-header dashboard-greeting">
          <div>
            <span className="dashboard-greeting__eyebrow">{language === "en" ? "Your retirement picture" : "BỨC TRANH NGHỈ HƯU CỦA BẠN"}</span>
            <h1 className="user-hero-title">{language === "en" ? `Hi ${firstName}, one calm step at a time.` : `Chào ${firstName}, an tâm từng bước.`}</h1>
            <p>{language === "en" ? "Your plan is right here. Today, just take one next step." : "Xem mình đang ở đâu và chọn một việc tiếp theo."}</p>
          </div>
        </header>

        {/* 1. Next Step Banner */}
        <section className="card next-card dashboard-next-step" aria-labelledby="dashboard-next-step-title" style={{ marginBottom: "20px" }}>
          <div className="next-icon">
            <Icon name="compass" size="default" />
          </div>
          <div className="next-body">
            <span className="eyebrow">{language === "en" ? "A RECOMMENDED NEXT STEP" : "VIỆC TIẾP THEO CỦA BẠN"}</span>
            <h3 id="dashboard-next-step-title">{nextStep.title}</h3>
            <p>{nextStep.description}</p>
          </div>
          <Link to={nextStep.to} className="button button-primary">
            <span>{language === "en" ? "Continue →" : "Tiếp tục →"}</span>
          </Link>
        </section>

        {/* 2. 3 Overview Metrics */}
        <div className="metric-grid overview-metrics">
          <article className="metric-tile projected">
            <span>
              <span className="metric-tile-label">{language === "en" ? "Projected fund at retirement" : "Quỹ dự kiến khi nghỉ hưu"}</span>
              <Link to="/user/plan" aria-label="Xem kế hoạch" title="Xem kế hoạch" style={{ color: "var(--muted, #64748b)" }}><Icon name="info" size="small" /></Link>
            </span>
            <strong>{formatEasyMoney(projected)}</strong>
            <small>{formatCurrency(projected)}</small>
          </article>
          <article className="metric-tile target">
            <span>
              <span className="metric-tile-label">{language === "en" ? "Target fund required" : "Quỹ cần cho mục tiêu"}</span>
              <Link to="/user/goal" aria-label="Xem mục tiêu" title="Xem mục tiêu" style={{ color: "var(--muted, #64748b)" }}><Icon name="info" size="small" /></Link>
            </span>
            <strong>{formatEasyMoney(target)}</strong>
            <small>{formatCurrency(target)}</small>
          </article>
          <article className="metric-tile capacity positive">
            <span>
              <span className="metric-tile-label">{language === "en" ? "First month capacity" : "Có thể góp tháng đầu"}</span>
              <Link to="/user/profile" aria-label="Xem tài chính" title="Xem tài chính" style={{ color: "var(--muted, #64748b)" }}><Icon name="info" size="small" /></Link>
            </span>
            <strong>{formatEasyMoney(capacity, true)}</strong>
            <small>{formatCurrency(capacity)}/{language === "en" ? "month" : "tháng"}</small>
          </article>
        </div>

        {/* 3. Result Note */}
        <div className="result-note" style={{ marginBottom: "20px" }}>
          <Icon name="info" size="small" />
          <span>
            {language === "en"
              ? "Illustrative estimate · Social security pension calculated if declared · "
              : "Ước tính minh họa · Đã tính lương hưu bạn tự nhập · "}
            <Link to="/user/plan">{language === "en" ? "See assumptions" : "Xem giả định"}</Link>
          </span>
        </div>

        {/* 4. Full-width Retirement Chart Card */}
        <div className="overview-grid" style={{ gridTemplateColumns: "1fr", marginBottom: "24px" }}>
          <div className="card chart-card">
            <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "18px", color: "#052659" }}>{language === "en" ? "Your retirement fund" : "Quỹ nghỉ hưu của bạn"}</h2>
                <p style={{ margin: 0, fontSize: "13px", color: "#456B91" }}>{language === "en" ? "Uses the same figures as the Plan page." : "Dùng cùng số liệu với trang Kế hoạch chi tiết."}</p>
              </div>
              <PlanSyncStatus />
            </div>
            {synchronization.preview?.calculation && planSummary ? (
              <MonthlyRetirementChart rows={synchronization.preview.calculation.rows} summary={planSummary} />
            ) : (
              <p style={{ color: "#456B91", fontSize: "14px" }}>{language === "en" ? "No projection data available." : "Chưa có số liệu dự phóng."}</p>
            )}
          </div>
        </div>

        {/* 5. Bottom 4 Navigation Tools */}
        <nav className="plan-tools-grid" aria-label={language === "en" ? "Explore more" : "Xem thêm tình hình"} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginTop: "24px" }}>
          <Link to="/user/plan" className="btn secondary" style={{ textAlign: "center", justifyContent: "center" }}>
            {language === "en" ? "View plan" : "Xem kế hoạch"}
          </Link>
          <Link to="/user/profile" className="btn secondary" style={{ textAlign: "center", justifyContent: "center" }}>
            {language === "en" ? "View finances" : "Xem tài chính"}
          </Link>
          <Link to="/user/risk-portfolio" className="btn secondary" style={{ textAlign: "center", justifyContent: "center" }}>
            {language === "en" ? "View allocation" : "Xem phân bổ"}
          </Link>
          <Link to="/user/simulation" className="btn secondary" style={{ textAlign: "center", justifyContent: "center" }}>
            {language === "en" ? "Track actuals" : "Cập nhật tình hình"}
          </Link>
        </nav>
      </div>
    </div>
  );
}
