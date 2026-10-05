import { Link } from "react-router";
import { motion } from "motion/react";
import { Badge, Icon } from "../components/ui";
import { AssetDonutChart } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { getPlanReport, type PlanReport } from "../services/plans";
import { useEffect, useState } from "react";

export default function UserDashboard() {
  const { user } = useAuth();
  const { profile, v2Profile, completenessPercentage } = useFinancialProfile();
  const { activePlan, currentVersion } = useRetirementPlan();
  const { t, language, formatCurrency, formatDate: i18nFormatDate, formatPercent } = useI18n();

  const [report, setReport] = useState<PlanReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    if (!activePlan?.id) {
      setReport(null);
      return;
    }
    let active = true;
    setLoadingReport(true);
    getPlanReport(activePlan.id)
      .then((res) => {
        if (active) setReport(res);
      })
      .catch(() => {
        if (active) setReport(null);
      })
      .finally(() => {
        if (active) setLoadingReport(false);
      });
    return () => {
      active = false;
    };
  }, [activePlan?.id, activePlan?.currentVersionId]);

  const income = profile.income.primaryIncome + profile.income.secondaryIncome;
  const expense = profile.expenses.essentialExpense + profile.expenses.lifestyleExpense;
  const assets = Object.values(profile.assets).reduce((total, value) => total + value, 0);
  const debt = profile.debt.hasDebt ? profile.debt.mortgageDebt + profile.debt.consumerDebt : 0;
  const debtService = profile.debt.hasDebt ? profile.debt.monthlyDebtService : 0;
  const surplus = income - expense - debtService;
  const netWorth = assets - debt;
  const debtRatio = assets > 0 ? (debt / assets) * 100 : 0;

  const planSummary = currentVersion?.preview?.calculation?.summary;
  const coveragePercentNum = parseFloat(planSummary?.atRetirement?.coveragePercent || "0") || 0;

  const allocation = [
    { label: t("dashboard.wealth.savings"), value: profile.assets.cashSavings, color: "#5483B3" },
    { label: t("dashboard.wealth.real_estate"), value: profile.assets.realEstateValue, color: "#052659" },
    { label: t("dashboard.wealth.stocks"), value: profile.assets.stockFundValue, color: "#334DAF" },
    { label: t("dashboard.wealth.other_liquid"), value: profile.assets.liquidAssets, color: "#7DA0CA" },
  ];

  return (
    <div className="yoga-dashboard-layout">
      <div className="yoga-dashboard-content">
        {/* 1. Executive Welcome Hero */}
        <motion.div
          className="user-hero-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="user-hero-main">
            <div className="user-hero-eyebrow">
              <span className="user-eyebrow-tag">{t("dashboard.hero.tag")}</span>
              <span className="user-sync-pill">
                <span className="pulse-dot" /> {t("dashboard.hero.live_data")}
              </span>
            </div>
            <h1 className="user-hero-title">
              {t("dashboard.hero.welcome", { name: user?.name || (language === "vi" ? "bạn" : "there") })}
            </h1>
            <p className="user-hero-desc">{t("dashboard.hero.subtitle")}</p>
            <div className="user-hero-pills">
              <span className="user-stat-pill">
                <Icon name="circle-check" size="small" />
                {t("dashboard.hero.profile_badge")}
              </span>
              {currentVersion ? (
                <span className="user-stat-pill is-active">
                  <Icon name="target" size="small" />
                  {t("dashboard.hero.plan_badge")} v{currentVersion.version}
                </span>
              ) : (
                <span className="user-stat-pill is-subtle">
                  <Icon name="info" size="small" />
                  {t("dashboard.hero.no_plan_badge")}
                </span>
              )}
            </div>
          </div>
          <div className="user-hero-side">
            <div className="user-readiness-badge">
              <span className="readiness-label">{t("dashboard.hero.completion_title")}</span>
              <strong className="readiness-value font-mono">{completenessPercentage}%</strong>
              <div className="readiness-track">
                <div className="readiness-bar" style={{ width: `${completenessPercentage}%` }} />
              </div>
              <small className="readiness-sub">{t("dashboard.hero.completion_sub")}</small>
            </div>
          </div>
        </motion.div>

        {/* 2. Official Plan Snapshot OR Plan Invitation */}
        {planSummary ? (
          <motion.div
            className="user-plan-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <div className="user-plan-header">
              <div className="user-plan-title-wrap">
                <div className="user-plan-icon">
                  <Icon name="target" />
                </div>
                <div>
                  <h2 className="user-plan-title">
                    {t("dashboard.plan.title")} (v{activePlan?.current?.version ?? currentVersion?.version})
                  </h2>
                  <p className="user-plan-subtitle">{t("dashboard.plan.forecast_note")}</p>
                </div>
              </div>
              <div className="user-plan-badges">
                {report?.hypothetical && (
                  <Badge tone="warning">{language === "en" ? "WhatIf Scenario" : "Giả định whatIf"}</Badge>
                )}
                <Badge tone="success">{t("dashboard.plan.active")}</Badge>
              </div>
            </div>

            <div className="user-plan-grid">
              <div className="user-plan-metric">
                <span className="metric-label">{t("dashboard.plan.projected_fund")}</span>
                <strong className="metric-value font-mono">
                  {formatCurrency(planSummary.atRetirement.projectedFund)}
                </strong>
                <small className="metric-helper">
                  {t("dashboard.plan.required_fund", {
                    amount: formatCurrency(planSummary.atRetirement.requiredFund),
                  })}
                </small>
              </div>

              <div className="user-plan-metric">
                <span className="metric-label">{t("dashboard.plan.coverage_percent")}</span>
                <strong className="metric-value metric-coverage font-mono">
                  {formatPercent(planSummary.atRetirement.coveragePercent)}
                </strong>
                <div className="coverage-bar-track">
                  <div
                    className="coverage-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, coveragePercentNum))}%`,
                    }}
                  />
                </div>
                <small className="metric-helper">
                  {t("dashboard.plan.target_date", { date: planSummary.retirementMonth })}
                </small>
              </div>

              <div className="user-plan-metric">
                <span className="metric-label">{t("dashboard.plan.monthly_contribution")}</span>
                <strong className="metric-value font-mono">
                  {planSummary.requiredConstantMonthlyContribution
                    ? `${formatCurrency(planSummary.requiredConstantMonthlyContribution)} ${t("dashboard.plan.per_month")}`
                    : t("dashboard.plan.target_reached")}
                </strong>
                <small className="metric-helper">
                  {t("dashboard.plan.future_expense", {
                    amount: formatCurrency(planSummary.futureMonthlyExpense),
                  })}
                </small>
              </div>
            </div>

            {report?.profileChanged && (
              <div className="user-plan-alert">
                <Icon name="alert" size="small" />
                <span>{t("dashboard.plan.profile_changed_alert")}</span>
              </div>
            )}

            <div className="user-plan-footer">
              <span className="valuation-date">
                {t("dashboard.plan.valuation_date", {
                  date: i18nFormatDate(planSummary.valuationDate),
                })}
              </span>
              <Link className="button button-primary button-small" to="/user/plan">
                <span>{t("dashboard.plan.view_detail")}</span>
                <Icon name="arrow-right" size="small" />
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="user-invite-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
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
              <Link className="button button-primary" to="/user/plan">
                <span>{t("dashboard.invite.cta")}</span>
                <Icon name="arrow-right" size="small" />
              </Link>
            </div>
          </motion.div>
        )}

        {/* 3. Monthly Financial Vital Signs (4 Cashflow Pillars) */}
        <div className="user-cashflow-section">
          <div className="section-header-compact">
            <h2>{t("dashboard.cashflow.title")}</h2>
            <span className="section-note">{t("dashboard.cashflow.subtitle")}</span>
          </div>

          <div className="user-cashflow-grid">
            <div className="user-cashflow-card theme-income">
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.income")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name="wallet" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{formatCurrency(income)}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.income_sub")}</span>
            </div>

            <div className="user-cashflow-card theme-expense">
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.expense")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name="file-text" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{formatCurrency(expense)}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.expense_sub")}</span>
            </div>

            <div className="user-cashflow-card theme-debt">
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.debt")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name="shield" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{formatCurrency(debtService)}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.debt_sub")}</span>
            </div>

            <div className={`user-cashflow-card ${surplus >= 0 ? "theme-surplus" : "theme-deficit"}`}>
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.surplus")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name={surplus >= 0 ? "sparkles" : "alert"} />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{formatCurrency(surplus)}</strong>
              <span className="cashflow-sub">
                {surplus >= 0 ? t("dashboard.cashflow.surplus_sub") : t("dashboard.cashflow.deficit_sub")}
              </span>
            </div>
          </div>
        </div>

        {surplus < 0 && (
          <div className="user-alert-banner">
            <div className="alert-content">
              <Badge tone="warning">{t("dashboard.cashflow.negative_warning")}</Badge>
              <p>{t("dashboard.cashflow.negative_alert")}</p>
            </div>
            <Link className="button button-soft button-small" to="/user/account">
              {t("dashboard.cashflow.review_profile")}
            </Link>
          </div>
        )}

        {/* 4. Wealth Structure & Net Worth Bento (Middle Row) */}
        <div className="user-wealth-bento">
          {/* Left: Asset Structure */}
          <div className="user-wealth-card">
            <div className="card-topline">
              <div>
                <h2 className="card-title">{t("dashboard.wealth.title")}</h2>
                <p className="card-desc">{t("dashboard.wealth.subtitle")}</p>
              </div>
              <span className="wealth-total-badge font-mono">
                {t("dashboard.wealth.total_badge", { amount: formatCurrency(assets) })}
              </span>
            </div>

            <div className="chart-and-table-wrap">
              <div className="donut-wrap">
                <AssetDonutChart assets={profile.assets} />
              </div>
              <div className="allocation-list">
                {allocation.map((item) => {
                  const percent = assets > 0 ? Math.round((item.value / assets) * 100) : 0;
                  return (
                    <div className="allocation-row" key={item.label}>
                      <div className="allocation-info">
                        <span className="allocation-swatch" style={{ background: item.color }} />
                        <span className="allocation-name">{item.label}</span>
                      </div>
                      <div className="allocation-values">
                        <span className="allocation-amount font-mono">{formatCurrency(item.value)}</span>
                        <span className="allocation-pct font-mono">{percent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Net Worth Statement */}
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
                <strong className="balance-val font-mono">{formatCurrency(assets)}</strong>
              </div>

              <div className="balance-row">
                <span className="balance-label">
                  <span className="balance-sign is-negative">-</span> {t("dashboard.balance.current_debt")}
                </span>
                <strong className="balance-val font-mono">{formatCurrency(debt)}</strong>
              </div>

              <div className="networth-highlight">
                <div className="networth-copy">
                  <span className="networth-eyebrow">{t("dashboard.balance.net_worth")}</span>
                  <strong className="networth-number font-mono" style={{ color: netWorth < 0 ? "var(--color-danger)" : undefined }}>
                    {formatCurrency(netWorth)}
                  </strong>
                </div>
                <div className="networth-badge-wrap">
                  <span className="debt-ratio-badge font-mono">
                    {t("dashboard.balance.debt_ratio", { percent: `${debtRatio.toFixed(1)}%` })}
                  </span>
                </div>
              </div>
            </div>

            <p className="balance-footnote">
              {t("dashboard.balance.disclaimer")}
            </p>
          </div>
        </div>

        {/* Trajectory / Projection Chart Area */}
        <div className="user-wealth-card" style={{ marginTop: "24px" }}>
          <div className="card-topline">
            <div>
              <h2 className="card-title">{language === "en" ? "Retirement Capital Projection" : "Đường đi dự phóng quỹ hưu trí"}</h2>
              <p className="card-desc">{language === "en" ? "Trajectory benchmarked against target retirement fund" : "Lộ trình đối chiếu giữa mức tích lũy hiện tại và mục tiêu hưu trí"}</p>
            </div>
            <span className="wealth-total-badge font-mono">
              {language === "en" ? "Target: 8.5B ₫" : "Mục tiêu: 8.5 tỷ ₫"}
            </span>
          </div>
          <p className="horizontal-scroll-hint">{language === "en" ? "Scroll horizontally to view full chart." : "Vuốt ngang để xem đầy đủ số liệu."}</p>
          <div className="projection-chart-area" tabIndex={0} role="region" aria-label={language === "en" ? "Retirement wealth projection chart" : "Biểu đồ dự phóng tài sản"}>
            <div className="dashboard-chart-axis">
              <span>9 tỷ</span>
              <span>6.7 tỷ</span>
              <span>4.5 tỷ</span>
              <span>2.2 tỷ</span>
              <span>0 đ</span>
            </div>

            <svg viewBox="0 0 650 300" preserveAspectRatio="none">
              <defs>
                <linearGradient id="targetGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#334DAF" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#334DAF" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#052659" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#052659" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="50" x2="650" y2="50" className="dashboard-grid-lines" />
              <line x1="0" y1="110" x2="650" y2="110" className="dashboard-grid-lines" />
              <line x1="0" y1="170" x2="650" y2="170" className="dashboard-grid-lines" />
              <line x1="0" y1="230" x2="650" y2="230" className="dashboard-grid-lines" />

              <path d="M 30 260 C 180 240, 360 170, 620 40 L 620 260 Z" fill="url(#targetGradient)" />
              <path d="M 30 260 C 180 240, 360 170, 620 40" className="target-projection-line" />
              <path d="M 30 260 C 180 245, 380 190, 620 95 L 620 260 Z" fill="url(#projectedGradient)" />
              <path d="M 30 260 C 180 245, 380 190, 620 95" className="current-projection-line" />
              <line x1="620" y1="40" x2="620" y2="95" className="projection-gap" />
              <circle cx="30" cy="260" r="5" className="current-point" />
              <circle cx="620" cy="40" r="6" className="target-point" />
              <circle cx="620" cy="95" r="5" className="projected-point" />
            </svg>

            <div className="chart-end-label goal-label">
              <span>{language === "en" ? "Target:" : "Mục tiêu:"}</span>
              <strong>8.50 tỷ đ</strong>
            </div>

            <div className="chart-end-label projected-label">
              <span>{language === "en" ? "Projected:" : "Dự phóng:"}</span>
              <strong>6.12 tỷ đ</strong>
            </div>

            <div className="dashboard-chart-labels">
              <span>{language === "en" ? "Year 2026 (Current)" : "Năm 2026 (Hiện tại)"}</span>
              <span>{language === "en" ? "Year 2036" : "Năm 2036"}</span>
              <span>{language === "en" ? "Year 2046" : "Năm 2046"}</span>
              <span>{language === "en" ? "Retirement (60 yrs)" : "Nghỉ hưu (60 tuổi)"}</span>
            </div>
          </div>
        </div>


        {/* 5. Foundation of Social Security (BHXH Pension) */}
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
                    ? v2Profile.personal.pensionStartMonth.value
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

        {/* 6. Smart Action Bento (Simulation & Debts) */}
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

      {/* 7. Right Rail: Executive Profile & Utility Hub */}
      <aside className="yoga-right-rail">
        {/* Profile Card */}
        <div className="user-profile-widget">
          <div className="profile-widget-avatar-wrap">
            {user?.avatarUrl ? (
              <img className="profile-widget-avatar" src={user.avatarUrl} alt="" />
            ) : (
              <div className="profile-widget-fallback">{user?.initials || "U"}</div>
            )}
            <span className="profile-online-dot" />
          </div>
          <h2 className="profile-widget-name">{user?.name}</h2>
          <span className="profile-widget-role">{t("dashboard.rail.profile_title")}</span>

          <div className="profile-widget-meta">
            <span className="meta-tag">
              <Icon name="users" size="small" />
              {t("dashboard.rail.age", { age: profile.personal.age })}
            </span>
            <span className="meta-tag">
              <Icon name="compass" size="small" />
              {profile.personal.city || (language === "en" ? "Hanoi" : "Hà Nội")}
            </span>
            <span className="meta-tag">
              <Icon name="shield" size="small" />
              {t("dashboard.rail.dependents", { count: profile.personal.dependents })}
            </span>
          </div>

          <div className="profile-completeness-strip">
            <div className="completeness-row">
              <span>{t("dashboard.hero.completion_title")}</span>
              <strong>{completenessPercentage}%</strong>
            </div>
            <div className="completeness-track">
              <div className="completeness-fill" style={{ width: `${completenessPercentage}%` }} />
            </div>
          </div>

          <Link className="button button-secondary button-small profile-manage-btn" to="/user/account">
            <span>{t("dashboard.rail.manage_profile")}</span>
            <Icon name="arrow-right" size="small" />
          </Link>
        </div>

        {/* Account Utilities Card */}
        <div className="user-utilities-widget">
          <h3 className="utilities-title">{t("dashboard.rail.utilities_title")}</h3>
          <div className="utilities-list">
            <Link className="utility-item" to="/user/notifications">
              <div className="utility-icon icon-notif">
                <Icon name="bell" size="small" />
              </div>
              <div className="utility-text">
                <strong>{t("dashboard.rail.util_notifications")}</strong>
                <small>{t("dashboard.rail.util_notifications_sub")}</small>
              </div>
              <Icon name="chevron-right" size="small" className="utility-chevron" />
            </Link>

            <Link className="utility-item" to="/user/support">
              <div className="utility-icon icon-support">
                <Icon name="life-buoy" size="small" />
              </div>
              <div className="utility-text">
                <strong>{t("dashboard.rail.util_support")}</strong>
                <small>{t("dashboard.rail.util_support_sub")}</small>
              </div>
              <Icon name="chevron-right" size="small" className="utility-chevron" />
            </Link>

            <Link className="utility-item" to="/user/explore">
              <div className="utility-icon icon-explore">
                <Icon name="file-text" size="small" />
              </div>
              <div className="utility-text">
                <strong>{t("dashboard.rail.util_articles")}</strong>
                <small>{t("dashboard.rail.util_articles_sub")}</small>
              </div>
              <Icon name="chevron-right" size="small" className="utility-chevron" />
            </Link>

            <Link className="utility-item" to="/user/assistant">
              <div className="utility-icon icon-ai">
                <Icon name="sparkles" size="small" />
              </div>
              <div className="utility-text">
                <strong>{t("dashboard.rail.util_ai")}</strong>
                <small>{t("dashboard.rail.util_ai_sub")}</small>
              </div>
              <Icon name="chevron-right" size="small" className="utility-chevron" />
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
