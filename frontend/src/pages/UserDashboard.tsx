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

  return (
    <div className="yoga-dashboard-layout">
      <div className="yoga-dashboard-content">
        <header className="dashboard-summary-header dashboard-greeting">
          <div>
            <span className="dashboard-greeting__eyebrow">{language === "en" ? "Your retirement picture" : "BỨC TRANH NGHỈ HƯU CỦA BẠN"}</span>
            <h1 className="user-hero-title">{language === "en" ? `Hi ${firstName}, one calm step at a time.` : `Chào ${firstName}, an tâm từng bước.`}</h1>
            <p>{language === "en" ? "Your plan is right here. Today, just take one next step." : "Kế hoạch của bạn đã ở đây. Hôm nay chỉ cần tiến thêm một bước."}</p>
          </div>
        </header>

        {/* 1. Signature Hero Card in Deep Navy Gradient */}
        <section className="summary-hero dashboard-summary" aria-label="Tóm tắt kế hoạch">
          <div>
            <span className="badge">
              <Icon name="sparkles" size="small" />
              {language === "en" ? "ACTIVE PLAN IN SESSION" : "KẾ HOẠCH ĐANG DÙNG TRONG PHIÊN"}
            </span>
            <h2 className="hero-title">
              {shortfall
                ? (language === "en" ? "To reach your goal, you need approximately" : "Để đạt được mục tiêu thì cần thêm khoảng")
                : (language === "en" ? "Your current fund meets your goal" : "Quỹ hiện tại đáp ứng mục tiêu của bạn")}
            </h2>
            <strong className="hero-number font-mono">
              {planSummary?.requiredConstantMonthlyContribution != null && Number(planSummary.requiredConstantMonthlyContribution) > 0
                ? <>{formatCurrency(planSummary.requiredConstantMonthlyContribution)} <small>{language === "en" ? "VND / month" : "₫ / tháng"}</small></>
                : <>{formatCurrency(planSummary?.atRetirement.requiredFund ?? 0)} <small>₫</small></>}
            </strong>
            <p className="hero-desc">
              {language === "en"
                ? `Current surplus is ${formatCurrency(surplus)}/month. You can adjust your plan at any time.`
                : `Khoản dư hiện tại là ${formatCurrency(surplus)}/tháng. Bạn có thể thử điều chỉnh kế hoạch để vừa vặn hơn.`}
            </p>
            <Link to="/user/plan" className="btn-light">
              <Icon name="compass" size="small" />
              <span>{language === "en" ? "Adjust your plan" : "Thử điều chỉnh kế hoạch"}</span>
            </Link>
          </div>
          <div className="hero-metrics">
            <div>
              <span>{language === "en" ? "Goal coverage" : "Đáp ứng mục tiêu"}</span>
              <strong>{Math.round(coveragePercentNum)}%</strong>
              <div className="hero-progress" role="progressbar" aria-label="Coverage" aria-valuenow={Math.round(coveragePercentNum)}>
                <span style={{ width: `${Math.min(100, Math.max(0, coveragePercentNum))}%` }} />
              </div>
            </div>
            <div>
              <span>{language === "en" ? "With trial contribution" : "Với mức góp đang thử"}</span>
              <strong>
                {planSummary?.firstShortfallMonth
                  ? (language === "en" ? `Funded until ${planSummary.firstShortfallMonth}` : `Đủ đến tháng ${planSummary.firstShortfallMonth}`)
                  : (language === "en" ? "Funded to plan end" : "Đủ đến cuối kế hoạch")}
              </strong>
              <small>
                {planSummary?.firstShortfallMonth
                  ? (language === "en" ? "Shortfall projected after this point." : "Sau mốc này dự kiến bắt đầu thiếu quỹ.")
                  : (language === "en" ? "Throughout the simulation horizon." : "Trong toàn bộ thời gian lập kế hoạch.")}
              </small>
            </div>
          </div>
        </section>

        {/* 2. Result Note */}
        <div className="result-note">
          <Icon name="info" size="small" />
          <span>
            {language === "en"
              ? "Illustrative estimate · Social security pension calculated if declared · "
              : "Ước tính minh họa · Đã tính lương hưu bạn tự nhập · "}
            <Link to="/user/plan">{language === "en" ? "See assumptions" : "Xem giả định"}</Link>
          </span>
        </div>

        {/* 3. Overview Grid: Chart Card (Left) + Next Action Card (Right) */}
        <div className="overview-grid">
          <div className="card chart-card">
            <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "18px", color: "#052659" }}>{language === "en" ? "Retirement fund trajectory" : "Quỹ nghỉ hưu của bạn"}</h2>
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

          <section className="card next-card dashboard-next-step" aria-labelledby="dashboard-next-step-title">
            <div className="next-icon">
              <Icon name="compass" size="default" />
            </div>
            <div className="next-body">
              <span className="eyebrow">{language === "en" ? "A RECOMMENDED NEXT STEP" : "MỘT VIỆC NÊN LÀM TIẾP"}</span>
              <h3 id="dashboard-next-step-title">{nextStep.title}</h3>
              <p>{nextStep.description}</p>
            </div>
            <Link to={nextStep.to} className="button button-primary">
              <span>{language === "en" ? "Continue" : "Tiếp tục"}</span>
              <Icon name="arrow-right" size="small" />
            </Link>
          </section>
        </div>

        {hasProfile && (
          <details className="dashboard-prep-steps">
            <summary>{language === "en" ? "Plan preparation steps" : "Các bước chuẩn bị kế hoạch"}</summary>
            <div className="dashboard-checklist-wrapper">
              <AccuracyChecklist />
            </div>
          </details>
        )}

        {/* 4. Consolidated Cashflow Card (.card.budget) */}
        <section className="card budget user-cashflow-section" aria-label={t("dashboard.cashflow.title")}>
          <div className="budget-title">
            <h3>{t("dashboard.cashflow.title")}</h3>
            <span className="small muted">{t("dashboard.cashflow.subtitle")}</span>
          </div>

          <div className="budget-grid user-cashflow-grid">
            <div className="budget-item user-cashflow-card theme-income">
              <span><Explain term="monthlyIncome">{t("dashboard.cashflow.income")}</Explain></span>
              <strong className="font-mono">{incomeKnown ? formatCurrency(income) : undetermined}</strong>
            </div>

            <div className="budget-item user-cashflow-card theme-expense">
              <span><Explain term="monthlyExpenses">{t("dashboard.cashflow.expense")}</Explain></span>
              <strong className="font-mono">{expenseKnown ? formatCurrency(expense) : undetermined}</strong>
            </div>

            <div className="budget-item user-cashflow-card theme-debt">
              <span><Explain term="monthlyDebtPayment">{t("dashboard.cashflow.debt")}</Explain></span>
              <strong className="font-mono">{debtServiceKnown ? formatCurrency(debtService) : undetermined}</strong>
            </div>

            <div className={`budget-item user-cashflow-card ${!surplusKnown ? "theme-unknown" : surplus >= 0 ? "theme-surplus highlight" : "theme-deficit"}`}>
              <span><Explain term="monthlySurplus">{t("dashboard.cashflow.surplus")}</Explain></span>
              <strong className="font-mono">{surplusKnown ? formatCurrency(surplus) : undetermined}</strong>
            </div>
          </div>
        </section>

        <nav className="dashboard-quick-links" aria-label={language === "en" ? "Shortcuts" : "Lối tắt"}>
          <Link to="/user/plan" className="button button-secondary"><Icon name="compass" size="small" />{language === "en" ? "View plan" : "Xem kế hoạch"}</Link>
          <Link to="/user/account" className="button button-secondary"><Icon name="wallet" size="small" />{language === "en" ? "View finances" : "Xem tài chính"}</Link>
          <Link to="/user/risk-portfolio" className="button button-secondary"><Icon name="shield" size="small" />{language === "en" ? "View allocation" : "Xem phân bổ"}</Link>
        </nav>


        {/* 4. Wealth Architecture & Foundation (Bento Grid) */}
        <div className="user-wealth-bento">
          {/* Left: Asset Portfolio Allocation */}
          <section className="user-wealth-card asset-overview" aria-labelledby="asset-overview-title">
            <header>
              <h2 id="asset-overview-title" className="card-title">{language === "en" ? "Your assets" : "Tài sản của bạn"}</h2>
              <p className="card-desc">{language === "en" ? "See how much you have in each asset group." : "Bạn đang có bao nhiêu tiền ở từng nhóm tài sản?"}</p>
            </header>
            {assetsKnown ? <>
              <div className="asset-overview-total">
                <span>{language === "en" ? "Total declared value" : "Tổng giá trị đã khai"}</span>
                <strong>{formatCurrency(assets)}</strong>
                <small>{language === "en" ? "Before subtracting your debts" : "Chưa trừ các khoản nợ của bạn"}</small>
              </div>
              {assets > 0 ? <>
                <div className="asset-breakdown-heading"><h3>{language === "en" ? "Where your assets are" : "Tài sản đang nằm ở đâu?"}</h3><span>{language === "en" ? "Share of total" : "Tỷ lệ trong tổng tài sản"}</span></div>
                <ul className="asset-breakdown-list">
                  {[...allocation].sort((a, b) => b.value - a.value).map(item => {
                    const ratio = item.value / assets * 100;
                    const percent = ratio > 0 && ratio < 0.1 ? (language === "en" ? "<0.1" : "<0,1") : new Intl.NumberFormat(language === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: 1 }).format(ratio);
                    return <li key={item.label} className={item.value === 0 ? "is-empty" : ""}>
                      <div className="asset-breakdown-name"><span className="asset-breakdown-dot" style={{ background: item.color }} aria-hidden="true" /><span>{item.label}</span></div>
                      <strong className="asset-breakdown-value">{formatCurrency(item.value)}</strong>
                      {item.value > 0 ? <div className="asset-breakdown-share"><div className="asset-breakdown-track" aria-hidden="true"><span style={{ width: `${ratio}%`, background: item.color }} /></div><span>{percent}%</span></div> : <small className="asset-breakdown-empty">{language === "en" ? "No value recorded" : "Chưa có giá trị trong hồ sơ"}</small>}
                    </li>;
                  })}
                </ul>
              </> : <p className="asset-overview-empty">{language === "en" ? "Your profile currently records no assets." : "Hồ sơ hiện ghi nhận bạn chưa có tài sản."}</p>}
            </> : <div className="asset-overview-empty"><Icon name="info" /><p>{language === "en" ? "Complete your asset values to see the total and each group's share." : "Bạn cần bổ sung giá trị tài sản để xem tổng tiền và tỷ lệ từng nhóm."}</p><Link to="/user/account">{language === "en" ? "Complete asset information" : "Bổ sung thông tin tài sản"} <Icon name="arrow-right" size="small" /></Link></div>}
          </section>

          {/* Right Column: Balance Sheet Statement + Social Security Foundation */}
          <div className="user-foundation-col">
            {/* Balance Sheet Statement */}
            <div className="user-wealth-card">
              <div className="card-topline">
                <div>
                  <h2 className="card-title">{t("dashboard.balance.title")}</h2>
                  <p className="card-desc">{t("dashboard.balance.subtitle")}</p>
                </div>
                <Link className="button button-soft button-small" to="/user/account">
                  {t("dashboard.balance.update")}
                </Link>
              </div>

              <div className="networth-breakdown">
                <div className="balance-row">
                  <span className="balance-label">
                    <span className="balance-sign is-positive">+</span> {t("dashboard.balance.declared_assets")}
                  </span>
                  <strong className="balance-val font-mono">{assetsKnown ? formatCurrency(assets) : undetermined}</strong>
                </div>

                <div className="balance-row">
                  <span className="balance-label">
                    <span className="balance-sign is-negative">-</span> {t("dashboard.balance.current_debt")}
                  </span>
                  <strong className="balance-val font-mono">{debtKnown ? formatCurrency(debt) : undetermined}</strong>
                </div>

                <div className="networth-highlight">
                  <div className="networth-copy">
                    <span className="networth-eyebrow">{t("dashboard.balance.net_worth")}</span>
                    <strong className="networth-number font-mono" style={{ color: netWorth < 0 ? "var(--color-danger)" : undefined }}>
                      {netWorthKnown ? formatCurrency(netWorth) : undetermined}
                    </strong>
                  </div>
                  <div className="networth-badge-wrap">
                    <span className="debt-ratio-badge">
                      {!assetsKnown || !debtKnown || !netWorthKnown ? undetermined : assets > 0 ? t("dashboard.balance.debt_ratio", { percent: `${debtRatio.toFixed(1)}%` }) : (language === "en" ? "Debt/assets: Undefined (no assets)" : "Nợ/tài sản: Không xác định (chưa có tài sản)")}
                    </span>
                  </div>
                </div>
              </div>

              <p className="balance-footnote">
                {t("dashboard.balance.disclaimer")}
              </p>
            </div>

            {/* Social Security (BHXH Pension) Foundation */}
            <div className="user-pension-card">
              <div className="pension-header">
                <div className="pension-title-group">
                  <div className="pension-icon">
                    <Icon name="shield" />
                  </div>
                  <div>
                    <h2>{t("dashboard.pension.title")}</h2>
                    <p className="pension-sub">{t("dashboard.pension.subtitle")}</p>
                  </div>
                </div>
                <Badge tone={v2Profile?.pension?.status === "KNOWN" ? "success" : "soft"}>
                  {v2Profile?.pension?.status === "KNOWN"
                    ? t("dashboard.pension.status_known")
                    : v2Profile?.pension?.status === "NOT_APPLICABLE"
                    ? t("dashboard.pension.status_na")
                    : t("dashboard.pension.status_unreported")}
                </Badge>
              </div>

              {v2Profile?.pension?.status === "KNOWN" ? (
                <div className="pension-grid">
                  <div className="pension-cell">
                    <span className="cell-label">{t("dashboard.pension.monthly_est")}</span>
                    <strong className="cell-val font-mono">
                      {formatCurrency(parseFloat(v2Profile.pension.monthlyAmount))} {t("dashboard.plan.per_month")}
                    </strong>
                  </div>
                  <div className="pension-cell">
                    <span className="cell-label">{t("dashboard.pension.price_basis")}</span>
                    <strong className="cell-val">
                      {v2Profile.pension.priceBasis === "TODAY"
                        ? t("dashboard.pension.basis_today")
                        : t("dashboard.pension.basis_future")}
                    </strong>
                  </div>
                  <div className="pension-cell">
                    <span className="cell-label">{t("dashboard.pension.data_source")}</span>
                    <strong className="cell-val">{v2Profile.pension.source}</strong>
                  </div>
                  <div className="pension-cell">
                    <span className="cell-label">{t("dashboard.pension.start_month")}</span>
                    <strong className="cell-val font-mono">
                      {v2Profile.personal.pensionStartMonth?.status === "KNOWN"
                        ? formatMonthVN(v2Profile.personal.pensionStartMonth.value)
                        : t("dashboard.pension.undetermined")}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="pension-empty-note">
                  <p>
                    {v2Profile?.pension?.status === "NOT_APPLICABLE"
                      ? t("dashboard.pension.na_note")
                      : t("dashboard.pension.unfilled_notice")}
                  </p>
                </div>
              )}

              <div className="pension-footer">
                <Link to="/user/account" className="pension-link">
                  <span>{t("dashboard.pension.update_link")}</span>
                  <Icon name="arrow-right" size="small" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Strategic Levers (Simulation & Debt Management) */}
        <div className="user-tools-grid">
          <div className="user-tool-card">
            <div className="tool-icon-wrap">
              <Icon name="wallet" />
            </div>
            <div className="tool-content">
              <h3>{t("dashboard.tools.debt_title")}</h3>
              <p>{t("dashboard.tools.debt_desc")}</p>
            </div>
            <Link className="button button-secondary button-small tool-button" to="/user/debts">
              <span>{t("dashboard.tools.debt_btn")}</span>
              <Icon name="arrow-right" size="small" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
