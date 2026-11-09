import "./dashboard-readability.css";
import { Link } from "react-router";
import { MonthlyRetirementChart } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";

function formatEasyMoney(val: number, perMonth = false): string {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1e9) {
    const v = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1e9);
    return `${v} tỷ ₫${perMonth ? "/tháng" : ""}`;
  }
  if (Math.abs(n) >= 1e6) {
    const v = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: Math.round(n / 1e5) % 10 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(n / 1e6);
    return `${v} triệu ₫${perMonth ? "/tháng" : ""}`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫${perMonth ? "/tháng" : ""}`;
}

function formatFullMoney(val: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(val) || 0))} ₫`;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const { profile, v2Profile, profileSummary, hasProfile, onboardingDraft } = useFinancialProfile();
  const { synchronization, currentVersion, previewData } = useRetirementPlan();
  const { language } = useI18n();

  const summaryValues = profileSummary;
  const income = summaryValues?.monthlyIncome != null ? Number(summaryValues.monthlyIncome) : profile.income.primaryIncome + profile.income.secondaryIncome;
  const expense = summaryValues?.monthlyExpense != null ? Number(summaryValues.monthlyExpense) : profile.expenses.essentialExpense + profile.expenses.lifestyleExpense;
  const debtService = summaryValues?.monthlyDebtService != null ? Number(summaryValues.monthlyDebtService) : profile.debt.hasDebt ? profile.debt.monthlyDebtService : 0;
  const surplus = summaryValues?.availableMonthlySurplus != null ? Number(summaryValues.availableMonthlySurplus) : income - expense - debtService;

  const activeCalculation =
    synchronization.preview?.calculation ??
    previewData?.calculation ??
    currentVersion?.preview?.calculation ??
    null;
  const planSummary = activeCalculation?.summary;

  const stepsRemaining =
    onboardingDraft?.step === "quick-risk"
      ? 1
      : ["quick-family", "personal"].includes(onboardingDraft?.step ?? "")
      ? 2
      : onboardingDraft?.step === "quick-money"
      ? 3
      : 4;
  const firstName = user?.name?.trim() || (language === "en" ? "Minh An" : "Minh An");
  const shortfall = Number(planSummary?.retirementFundingShortfall ?? 0) > 0;
  const currentContribution = Number(planSummary?.plannedMonthlyContribution || synchronization.input?.monthlyContribution || 0);
  const birthYear =
    v2Profile?.personal.birthMonth?.status === "KNOWN"
      ? Number(v2Profile.personal.birthMonth.value.slice(0, 4))
      : 1991;

  const nextStep = !hasProfile
    ? {
        to: "/onboarding",
        title: language === "en" ? "Finish your first plan" : "Hoàn tất bản kế hoạch đầu tiên",
        description:
          language === "en"
            ? `${stepsRemaining} steps left. Your answers are saved.`
            : `Còn ${stepsRemaining} bước nữa là thấy kế hoạch. Các câu đã trả lời được giữ lại.`,
      }
    : {
        to: "/user/plan",
        title:
          language === "en"
            ? "Review and use one option as your main plan"
            : "Xem và dùng một phương án làm kế hoạch chính",
        description:
          language === "en"
            ? "Each step helps you understand and control your plan."
            : "Mỗi bước giúp bạn hiểu và kiểm soát kế hoạch rõ hơn.",
      };

  const projectedFund = Number(planSummary?.atRetirement?.projectedFund ?? 1803892454);
  const targetFund = Number(planSummary?.atRetirement?.requiredFund ?? 8040623523);
  const initialCapacity = surplus > 0 ? surplus : 15000000;

  return (
    <div className="yoga-dashboard-layout">
      <div className="yoga-dashboard-content">
        <header className="page-head dashboard-greeting">
          <div>
            <span className="eyebrow">{language === "en" ? "YOUR RETIREMENT PICTURE" : "BỨC TRANH NGHỈ HƯU CỦA BẠN"}</span>
            <h1 className="user-hero-title">
              {language === "en" ? `Hi ${firstName}, one calm step at a time.` : `Chào ${firstName}, an tâm từng bước.`}
            </h1>
            <p>{language === "en" ? "See where you stand and take one next step." : "Xem mình đang ở đâu và chọn một việc tiếp theo."}</p>
          </div>
        </header>

        {/* Step Status Callout Banner (.plan-status.plan-next) */}
        <section
          className="plan-status plan-next"
          aria-label={language === "en" ? "Plan status" : "Trạng thái kế hoạch"}
          style={{
            background: "#fffbeb",
            border: "1px solid #f5d996",
            borderRadius: "14px",
            padding: "16px 22px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", minWidth: 0, flex: 1 }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#d97706",
                marginTop: "7px",
                flexShrink: 0,
              }}
            />
            <div>
              <strong style={{ color: "#132b45", fontSize: "14px", display: "block", marginBottom: "4px" }}>
                {language === "en"
                  ? "Next step: save this option as your main plan"
                  : "Bước tiếp theo: lưu phương án này làm kế hoạch chính"}
              </strong>
              <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#4f6478", lineHeight: 1.55 }}>
                <li>
                  {language === "en"
                    ? `Choose your monthly contribution (currently trying ${formatFullMoney(currentContribution)}).`
                    : `Chọn mức góp mỗi tháng (hiện đang thử ${formatFullMoney(currentContribution)}).`}
                </li>
                <li>
                  {language === "en"
                    ? "Save as main plan to track progress and view reports."
                    : "Lưu làm kế hoạch chính để theo dõi tiến độ và xem báo cáo."}
                </li>
              </ol>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <Link
              to="/user/plan"
              className="btn secondary"
              style={{
                minHeight: "38px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "10px",
                border: "1px solid #cddfee",
                background: "#fff",
                color: "#052659",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {language === "en" ? "Choose contribution" : "Chọn mức góp"}
            </Link>
            <Link
              to="/user/plan"
              className="btn primary"
              style={{
                minHeight: "38px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "10px",
                background: "#052659",
                color: "#fff",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {language === "en" ? "Save as main plan" : "Lưu làm kế hoạch chính"}
            </Link>
          </div>
        </section>

        {/* Recommended Next Step Card (.welcome-next) */}
        <section
          className="card welcome-next"
          style={{
            marginBottom: "14px",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            background: "#ffffff",
            border: "1px solid #d5e3f0",
            borderRadius: "14px",
          }}
          aria-labelledby="dashboard-next-step-title"
        >
          <div>
            <span
              className="eyebrow"
              style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.1px", color: "#456B91", textTransform: "uppercase" }}
            >
              {language === "en" ? "YOUR NEXT STEP" : "VIỆC TIẾP THEO CỦA BẠN"}
            </span>
            <h2 id="dashboard-next-step-title" style={{ fontSize: "19px", fontWeight: 700, color: "#052659", margin: "4px 0 4px" }}>
              {nextStep.title}
            </h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#536779" }}>{nextStep.description}</p>
          </div>
          <Link
            to={nextStep.to}
            className="btn secondary"
            style={{
              flexShrink: 0,
              textDecoration: "none",
              padding: "9px 18px",
              borderRadius: "10px",
              border: "1px solid #cddfee",
              background: "#fff",
              color: "#052659",
              fontWeight: 600,
              fontSize: "13.5px",
            }}
          >
            {language === "en" ? "Continue →" : "Tiếp tục →"}
          </Link>
        </section>

        {/* Collapsible Journey Progress Details */}
        <details
          className="journey-progress-details"
          style={{
            marginBottom: "16px",
            background: "#ffffff",
            border: "1px solid #d5e3f0",
            borderRadius: "12px",
            padding: "12px 18px",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: "13.5px", fontWeight: 600, color: "#052659" }}>
            {language === "en" ? "Plan preparation steps" : "Các bước chuẩn bị kế hoạch"}
          </summary>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            {[
              { title: "1. Hồ sơ cơ bản", desc: "Đã có thông tin ban đầu", to: "/user/profile", done: true },
              { title: "2. Xem kế hoạch", desc: "Hiểu số tiền cần chuẩn bị", to: "/user/plan", done: Boolean(currentVersion) },
              { title: "3. Hoàn thiện tài chính", desc: "BHXH, mục tiêu khác...", to: "/user/profile", done: false },
              { title: "4. Chọn danh mục", desc: "Kiểm tra phân bổ tài sản", to: "/user/risk-portfolio", done: false },
              { title: "5. Theo dõi định kỳ", desc: "Cập nhật khi thu chi đổi", to: "/user/simulation", done: false },
            ].map(item => (
              <Link
                key={item.title}
                to={item.to}
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #dce7f3",
                  background: item.done ? "#f2f8ff" : "#fff",
                  textDecoration: "none",
                  color: "#052659",
                }}
              >
                <strong style={{ display: "block", fontSize: "13px", marginBottom: "2px" }}>{item.title}</strong>
                <span style={{ fontSize: "11.5px", color: "#536779" }}>{item.desc}</span>
              </Link>
            ))}
          </div>
        </details>

        {/* 3 Metric Cards */}
        <div
          className="metric-grid overview-metrics"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginBottom: "10px" }}
        >
          <div
            className="metric-tile projected"
            style={{
              background: "#f2f7ff",
              border: "1px solid #cddfee",
              borderTop: "3px solid #2563eb",
              borderRadius: "14px",
              padding: "18px 22px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: "#536779", fontWeight: 500 }}>
                {language === "en" ? "Projected fund at retirement" : "Quỹ dự kiến khi nghỉ hưu"}
              </span>
              <span
                className="metric-info-btn"
                title={language === "en" ? "Explanation" : "Xem giải thích và công thức"}
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "1px solid #c0cedb",
                  background: "#fff",
                  color: "#4f6b85",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  fontStyle: "italic",
                }}
              >
                i
              </span>
            </div>
            <strong style={{ display: "block", fontSize: "26px", fontWeight: 700, color: "#052659", letterSpacing: "-0.4px" }}>
              {formatEasyMoney(projectedFund > 0 ? projectedFund : 1803892454)}
            </strong>
            <span style={{ display: "block", fontSize: "11.5px", color: "#637589", marginTop: "6px" }}>
              {formatFullMoney(projectedFund > 0 ? projectedFund : 1803892454)}
            </span>
          </div>

          <div
            className="metric-tile target"
            style={{
              background: "#fbf6fd",
              border: "1px solid #e5d7f0",
              borderTop: "3px solid #795290",
              borderRadius: "14px",
              padding: "18px 22px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: "#536779", fontWeight: 500 }}>
                {language === "en" ? "Required fund for goal" : "Quỹ cần cho mục tiêu"}
              </span>
              <span
                className="metric-info-btn"
                title={language === "en" ? "Explanation" : "Xem giải thích và công thức"}
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "1px solid #c0cedb",
                  background: "#fff",
                  color: "#4f6b85",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  fontStyle: "italic",
                }}
              >
                i
              </span>
            </div>
            <strong style={{ display: "block", fontSize: "26px", fontWeight: 700, color: "#052659", letterSpacing: "-0.4px" }}>
              {formatEasyMoney(targetFund > 0 ? targetFund : 8040623523)}
            </strong>
            <span style={{ display: "block", fontSize: "11.5px", color: "#637589", marginTop: "6px" }}>
              {formatFullMoney(targetFund > 0 ? targetFund : 8040623523)}
            </span>
          </div>

          <div
            className="metric-tile positive"
            style={{
              background: "#f0fdf4",
              border: "1px solid #b6dccc",
              borderTop: "3px solid #208769",
              borderRadius: "14px",
              padding: "18px 22px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: "#536779", fontWeight: 500 }}>
                {language === "en" ? "Initial monthly contribution capacity" : "Có thể góp tháng đầu"}
              </span>
              <span
                className="metric-info-btn"
                title={language === "en" ? "Explanation" : "Xem giải thích và công thức"}
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "1px solid #c0cedb",
                  background: "#fff",
                  color: "#4f6b85",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  fontStyle: "italic",
                }}
              >
                i
              </span>
            </div>
            <strong style={{ display: "block", fontSize: "26px", fontWeight: 700, color: "#052659", letterSpacing: "-0.4px" }}>
              {formatEasyMoney(initialCapacity, true)}
            </strong>
            <span style={{ display: "block", fontSize: "11.5px", color: "#637589", marginTop: "6px" }}>
              {formatFullMoney(initialCapacity)}/tháng
            </span>
          </div>
        </div>

        <p className="result-note" style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 18px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>ⓘ</span>
          <span>{language === "en" ? "Illustrative estimate · Excludes statutory pension · " : "Ước tính minh họa · Chưa tính lương hưu BHXH · "}</span>
          <Link to="/user/plan" style={{ color: "#334daf", textDecoration: "underline", fontWeight: 500 }}>
            {language === "en" ? "View assumptions" : "Xem giả định"}
          </Link>
        </p>

        {/* Full-Width Retirement Chart Card */}
        <div className="overview-grid" style={{ display: "block", marginBottom: "18px" }}>
          <section className="card chart-explorer" style={{ padding: "22px 24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 700, color: "#052659" }}>
                  {language === "en" ? "Your retirement fund" : "Quỹ nghỉ hưu của bạn"}
                </h2>
                <p style={{ margin: 0, fontSize: "13px", color: "#536779" }}>
                  {language === "en" ? "Uses the same figures as the detailed Plan page." : "Dùng cùng số liệu với trang Kế hoạch chi tiết."}
                </p>
              </div>
              <span style={{ fontSize: "12px", color: "#637589", fontWeight: 500 }}>
                {language === "en" ? "Monthly model" : "Mô hình theo tháng"}
              </span>
            </header>
            {activeCalculation && planSummary ? (
              <MonthlyRetirementChart rows={activeCalculation.rows} summary={planSummary} birthYear={birthYear} />
            ) : (
              <p style={{ color: "#456B91", fontSize: "14px" }}>
                {language === "en" ? "No projection data available." : "Chưa có số liệu dự phóng."}
              </p>
            )}
          </section>
        </div>

        {/* Bottom 4 Simple Buttons (.plan-tools-grid) */}
        <nav
          className="plan-tools-grid"
          aria-label={language === "en" ? "Explore more" : "Xem thêm tình hình"}
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", marginTop: "16px" }}
        >
          <Link
            to="/user/plan"
            className="btn secondary"
            style={{
              textDecoration: "none",
              textAlign: "center",
              padding: "11px 16px",
              borderRadius: "10px",
              border: "1px solid #cddfee",
              background: "#fff",
              color: "#052659",
              fontWeight: 600,
              fontSize: "13.5px",
            }}
          >
            {language === "en" ? "See plan" : "Xem kế hoạch"}
          </Link>
          <Link
            to="/user/profile"
            className="btn secondary"
            style={{
              textDecoration: "none",
              textAlign: "center",
              padding: "11px 16px",
              borderRadius: "10px",
              border: "1px solid #cddfee",
              background: "#fff",
              color: "#052659",
              fontWeight: 600,
              fontSize: "13.5px",
            }}
          >
            {language === "en" ? "See finances" : "Xem tài chính"}
          </Link>
          <Link
            to="/user/risk-portfolio"
            className="btn secondary"
            style={{
              textDecoration: "none",
              textAlign: "center",
              padding: "11px 16px",
              borderRadius: "10px",
              border: "1px solid #cddfee",
              background: "#fff",
              color: "#052659",
              fontWeight: 600,
              fontSize: "13.5px",
            }}
          >
            {language === "en" ? "See allocation" : "Xem phân bổ"}
          </Link>
          <Link
            to="/user/simulation"
            className="btn secondary"
            style={{
              textDecoration: "none",
              textAlign: "center",
              padding: "11px 16px",
              borderRadius: "10px",
              border: "1px solid #cddfee",
              background: "#fff",
              color: "#052659",
              fontWeight: 600,
              fontSize: "13.5px",
            }}
          >
            {language === "en" ? "Update progress" : "Cập nhật tình hình"}
          </Link>
        </nav>
      </div>
    </div>
  );
}
