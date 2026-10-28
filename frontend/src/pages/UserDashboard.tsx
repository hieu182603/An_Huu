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

  const stepsRemaining = onboardingDraft?.step === "quick-risk" ? 1 : onboardingDraft?.step === "quick-money" ? 2 : 3;

  return (
    <div className="yoga-dashboard-layout">
      <div className="yoga-dashboard-content">
        <header className="dashboard-summary-header">
          <div>
            <h1 className="user-hero-title">{language === "en" ? "Overview" : "Tổng quan"}</h1>
            <p>{t("dashboard.hero.welcome", { name: user?.name || (language === "vi" ? "bạn" : "there") })}</p>
          </div>

        </header>

        {/* Onboarding in-progress prompt or Accuracy Checklist */}
        {!hasProfile ? (
          <Card className="onboarding-incomplete-card onboarding-resume-banner" style={{ padding: "18px 20px", marginBottom: "20px", border: "1px solid var(--color-primary-200, #bbf7d0)", background: "var(--color-surface, #fff)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>
                  {language === "en" ? "First plan in progress" : "Bản kế hoạch đầu tiên"}
                </h3>
                <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "14px" }}>
                  {language === "en"
                    ? `${stepsRemaining} steps remaining to see your plan. Your answered questions are saved.`
                    : `Còn ${stepsRemaining} bước nữa là thấy kế hoạch của bạn. Các câu đã trả lời được giữ lại.`}
                </p>
              </div>
              <Link to="/onboarding" className="button button-primary">
                <span>{language === "en" ? "Continue" : "Tiếp tục"}</span>
                <Icon name="arrow-right" size="small" />
              </Link>
            </div>
          </Card>
        ) : (
          <div style={{ marginBottom: "20px" }}>
            <AccuracyChecklist />
          </div>
        )}

        {/* 2. Retirement plan summary */}
        {loadingPlans && !planSummary ? (
          <Card style={{ padding: "var(--space-6)", textAlign: "center", border: "1px solid var(--color-border)" }}>
            <p role="status" style={{ color: "var(--color-text-muted)", margin: 0 }}>
              {language === "en" ? "Loading your retirement plan…" : "Đang tải dữ liệu kế hoạch hưu trí của bạn…"}
            </p>
          </Card>
        ) : plansError && !planSummary ? (
          <Alert
            tone="danger"
            title={language === "en" ? "Could not load plan" : "Chưa tải được kế hoạch"}
            action={<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry" : "Thử lại"}</Button>}
          >
            {plansError}
          </Alert>
        ) : (
          <motion.section
            className="user-cockpit-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            aria-label={t("dashboard.plan.title")}
          >
            {planSummary ? (
              <>
                <div className="user-plan-header">
                  <div className="user-plan-title-wrap">
                    <div className="user-plan-icon">
                      <Icon name="target" />
                    </div>
                    <div>
                      <h2 className="user-plan-title">
                        {synchronization.changed ? (language === "en" ? "Retirement plan from current profile" : "Kế hoạch theo hồ sơ hiện tại") : (language === "en" ? "Current retirement plan" : "Kế hoạch hưu trí đang dùng")} (v{activePlan?.current?.version ?? currentVersion?.version})
                      </h2>
                      <p className="user-plan-subtitle">{t("dashboard.plan.forecast_note")}</p>
                    </div>
                  </div>
                  <div className="user-plan-badges">
                    <Badge tone="success">{synchronization.changed ? (language === "en" ? "Updated preview" : "Đã cập nhật số liệu") : t("dashboard.plan.active")}</Badge>
                    <Link className="button button-primary button-small" to="/user/plan">
                      <span>{t("dashboard.plan.view_detail")}</span>
                      <Icon name="arrow-right" size="small" />
                    </Link>
                  </div>
                </div>

                <div className="user-plan-grid">
                  <div className="user-plan-metric">
                    <span className="metric-label">{t("dashboard.plan.projected_fund")}</span>
                    <strong className="metric-value font-mono">
                      {explanationSource ? <Explain metric="summary.atRetirement.projectedFund" source={explanationSource} value={String(planSummary.atRetirement.projectedFund)}>{formatCurrency(planSummary.atRetirement.projectedFund)}</Explain> : formatCurrency(planSummary.atRetirement.projectedFund)}
                    </strong>
                    <small className="metric-helper">
                      {language === "en" ? "Required target: " : "Mục tiêu cần: "}
                      {explanationSource ? <Explain metric="summary.atRetirement.requiredFund" source={explanationSource} value={String(planSummary.atRetirement.requiredFund)}>{formatCurrency(planSummary.atRetirement.requiredFund)}</Explain> : formatCurrency(planSummary.atRetirement.requiredFund)}
                    </small>
                  </div>

                  <div className="user-plan-metric">
                    <span className="metric-label"><Explain term="fundCoverage">{t("dashboard.plan.coverage_percent")}</Explain></span>
                    <strong className="metric-value metric-coverage font-mono">
                      {planSummary.atRetirement.coveragePercent == null ? (language === "en" ? "Undetermined" : "Chưa xác định") : explanationSource ? <Explain metric="summary.atRetirement.coveragePercent" source={explanationSource} value={String(planSummary.atRetirement.coveragePercent)}>{formatPercent(planSummary.atRetirement.coveragePercent)}</Explain> : formatPercent(planSummary.atRetirement.coveragePercent)}
                    </strong>
                    {planSummary.atRetirement.coveragePercent != null && <div className="coverage-bar-track">
                      <div
                        className="coverage-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, coveragePercentNum))}%`,
                        }}
                      />
                    </div>}
                    <small className="metric-helper">
                      {t("dashboard.plan.target_date", { date: formatMonthVN(planSummary.retirementMonth) })}
                    </small>
                  </div>

                  <div className="user-plan-metric">
                    <span className="metric-label">{t("dashboard.plan.monthly_contribution")}</span>
                    <strong className="metric-value font-mono">
                      {planSummary.requiredConstantMonthlyContribution != null
                        ? <>{explanationSource ? <Explain metric="summary.requiredConstantMonthlyContribution" source={explanationSource} value={String(planSummary.requiredConstantMonthlyContribution)}>{formatCurrency(planSummary.requiredConstantMonthlyContribution)}</Explain> : formatCurrency(planSummary.requiredConstantMonthlyContribution)} {t("dashboard.plan.per_month")}</>
                        : (language === "en" ? "Undetermined" : "Chưa xác định")}
                    </strong>
                    <small className="metric-helper">
                      {language === "en" ? "Future monthly expense: " : "Chi phí sinh hoạt tương lai mỗi tháng: "}
                      {explanationSource ? <Explain metric="summary.futureMonthlyExpense" source={explanationSource} value={String(planSummary.futureMonthlyExpense)}>{formatCurrency(planSummary.futureMonthlyExpense)}</Explain> : formatCurrency(planSummary.futureMonthlyExpense)}
                    </small>
                  </div>
                </div>

                <PlanSyncStatus />
              </>
            ) : (
              currentVersion ? <div className="user-plan-pending"><h2>{language === "en" ? "Your retirement plan" : "Kế hoạch nghỉ hưu của bạn"}</h2><PlanSyncStatus /><Link to="/user/plan">{language === "en" ? "Open plan" : "Mở kế hoạch"}</Link></div> : <div className="user-invite-block">
                <div className="user-invite-main">
                  <div className="user-invite-icon">
                    <Icon name="target" />
                  </div>
                  <div className="user-invite-text">
                    <span className="invite-tag">{language === "en" ? "INDEPENDENT RETIREMENT" : "LỘ TRÌNH HƯU TRÍ ĐỘC LẬP"}</span>
                    <h2>{t("dashboard.invite.title")}</h2>
                    <p>{t("dashboard.invite.subtitle")}</p>
                    <div className="invite-perks">
                      <span><Icon name="check" size="small" /> {t("dashboard.invite.benefit1")}</span>
                      <span><Icon name="check" size="small" /> {t("dashboard.invite.benefit2")}</span>
                      <span><Icon name="check" size="small" /> {t("dashboard.invite.benefit3")}</span>
                    </div>
                  </div>
                </div>
                <div className="user-invite-action">
                  <Link className="button button-primary" to="/user/goal">
                    <span>{t("dashboard.invite.cta")}</span>
                    <Icon name="arrow-right" size="small" />
                  </Link>
                </div>
              </div>
            )}

          </motion.section>
        )}

        {/* 3. Declared Monthly Cashflow (Thu chi da khai bao) */}
        <section className="user-cashflow-section" aria-label={t("dashboard.cashflow.title")}>
          <div className="section-header-compact">
            <h2>{t("dashboard.cashflow.title")}</h2>
            <span className="section-note">{t("dashboard.cashflow.subtitle")}</span>
          </div>

          <div className="user-cashflow-grid">
            <div className="user-cashflow-card theme-income">
              <div className="cashflow-card-head">
                <span className="cashflow-label"><Explain term="monthlyIncome">{t("dashboard.cashflow.income")}</Explain></span>
                <div className="cashflow-icon-wrap">
                  <Icon name="wallet" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{incomeKnown ? formatCurrency(income) : undetermined}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.income_sub")}</span>
            </div>

            <div className="user-cashflow-card theme-expense">
              <div className="cashflow-card-head">
                <span className="cashflow-label"><Explain term="monthlyExpenses">{t("dashboard.cashflow.expense")}</Explain></span>
                <div className="cashflow-icon-wrap">
                  <Icon name="file-text" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{expenseKnown ? formatCurrency(expense) : undetermined}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.expense_sub")}</span>
            </div>

            <div className="user-cashflow-card theme-debt">
              <div className="cashflow-card-head">
                <span className="cashflow-label"><Explain term="monthlyDebtPayment">{t("dashboard.cashflow.debt")}</Explain></span>
                <div className="cashflow-icon-wrap">
                  <Icon name="shield" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{debtServiceKnown ? formatCurrency(debtService) : undetermined}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.debt_sub")}</span>
            </div>

            <div className={`user-cashflow-card ${!surplusKnown ? "theme-unknown" : surplus >= 0 ? "theme-surplus" : "theme-deficit"}`}>
              <div className="cashflow-card-head">
                <span className="cashflow-label"><Explain term="monthlySurplus">{t("dashboard.cashflow.surplus")}</Explain></span>
                <div className="cashflow-icon-wrap">
                  <Icon name={!surplusKnown ? "info" : surplus >= 0 ? "sparkles" : "alert"} />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{surplusKnown ? formatCurrency(surplus) : undetermined}</strong>
              <span className="cashflow-sub">
                {!surplusKnown ? (language === "en" ? "Complete income, expenses and debt payments first." : "Cần đủ thu nhập, chi tiêu và khoản trả nợ.") : surplus >= 0 ? t("dashboard.cashflow.surplus_sub") : t("dashboard.cashflow.deficit_sub")}
              </span>
            </div>
          </div>

          {!surplusKnown && <Link className="button button-soft" to="/user/account">{language === "en" ? "Complete cashflow information" : "Bổ sung thông tin thu chi"}</Link>}
          {surplusKnown && surplus < 0 && <details className="cashflow-review-details"><summary>{language === "en" ? "Review the monthly shortfall" : "Xem chi tiết khoản thiếu mỗi tháng"}</summary><p>{t("dashboard.cashflow.negative_alert")}</p><Link to="/user/account">{t("dashboard.cashflow.review_profile")}</Link></details>}

        </section>

        {synchronization.preview?.calculation && planSummary && <section className="user-trajectory-wrap" aria-label={language === "en" ? "Current plan forecast" : "Số tiền dự kiến theo kế hoạch đang dùng"}>
          <h2>{language === "en" ? "Your retirement fund over time" : "Quỹ hưu trí thay đổi theo thời gian"}</h2>
          <p>{language === "en" ? "Uses the same figures as the Plan page." : "Dùng cùng số liệu với trang Kế hoạch chi tiết."}</p>
          <MonthlyRetirementChart rows={synchronization.preview.calculation.rows} summary={planSummary} />
          <Link to="/user/simulation?tab=actuals">{language === "en" ? "Record actual contributions" : "Ghi lại tiền góp và số dư thực tế"}</Link>
        </section>}

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
                    <span className="debt-ratio-badge font-mono">
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
              <Icon name="chart" />
            </div>
            <div className="tool-content">
              <h3>{t("dashboard.tools.simulation_title")}</h3>
              <p>{t("dashboard.tools.simulation_desc")}</p>
            </div>
            <Link className="button button-secondary button-small tool-button" to="/user/simulation">
              <span>{t("dashboard.tools.simulation_btn")}</span>
              <Icon name="arrow-right" size="small" />
            </Link>
          </div>

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
