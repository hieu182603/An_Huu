import { profileDisplayStatus } from "../services/profileDisplay";
import "./dashboard-readability.css";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon } from "../components/ui";
import { AssetDonutChart, ProjectionWealthChart, type ChartPeriod } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { getPlanReport, type PlanReport } from "../services/plans";
import { useEffect, useState } from "react";

export default function UserDashboard() {
  const { user } = useAuth();
  const { profile, v2Profile } = useFinancialProfile();
  const { activePlan, currentVersion, loadingPlans, plansError, refreshPlans } = useRetirementPlan();
  const { t, language, formatCurrency, formatDate: i18nFormatDate, formatPercent } = useI18n();

  const [report, setReport] = useState<PlanReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportAttempt, setReportAttempt] = useState(0);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("retire");

  useEffect(() => {
    setReport(null);
    setReportError("");
    if (!activePlan?.id) {
      setLoadingReport(false);
      return;
    }
    let active = true;
    setLoadingReport(true);
    getPlanReport(activePlan.id)
      .then((res) => {
        if (active) setReport(res);
      })
      .catch((error) => {
        if (active) setReportError(error instanceof Error ? error.message : "Không thể tải báo cáo.");
      })
      .finally(() => {
        if (active) setLoadingReport(false);
      });
    return () => {
      active = false;
    };
  }, [activePlan?.id, activePlan?.currentVersionId, reportAttempt]);

  const known = profileDisplayStatus(v2Profile);
  const unreported = language === "en" ? "Not reported" : "Chưa khai báo";
  const undetermined = language === "en" ? "Not enough information" : "Chưa đủ thông tin";
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

  const targetAmountDisplay = planSummary?.atRetirement?.requiredFund
    ? formatCurrency(parseFloat(planSummary.atRetirement.requiredFund))
    : profile.plan?.targetFund
    ? formatCurrency(profile.plan.targetFund)
    : profile.goal.monthlyExpenseInRetirement > 0
    ? `${formatCurrency(profile.goal.monthlyExpenseInRetirement)}/${language === "en" ? "mo" : "th"}`
    : null;

  return (
    <div className="yoga-dashboard-layout">
      <div className="yoga-dashboard-content">
        <header className="dashboard-summary-header">
          <div>
            <h1 className="user-hero-title">{language === "en" ? "Overview" : "Tổng quan"}</h1>
            <p>{t("dashboard.hero.welcome", { name: user?.name || (language === "vi" ? "bạn" : "there") })}</p>
          </div>
          <Link className="button button-soft" to="/user/account">
            {language === "en" ? "Financial profile" : "Hồ sơ tài chính"}
          </Link>
        </header>

        {/* 2. Retirement plan summary */}
        {reportError && (
          <Alert tone="warning" title={language === "en" ? "Could not load plan report" : "Chưa tải được báo cáo kế hoạch"}
            action={<Button onClick={() => setReportAttempt(value => value + 1)}>{language === "en" ? "Reload report" : "Tải lại báo cáo"}</Button>}>
            {reportError} {language === "en" ? "Profile-change and scenario warnings are unavailable." : "Chưa kiểm tra được cảnh báo hồ sơ thay đổi và kịch bản giả định."}
          </Alert>
        )}
        {loadingReport && planSummary && <p role="status">{language === "en" ? "Checking plan report…" : "Đang kiểm tra báo cáo kế hoạch…"}</p>}
        {(loadingPlans || loadingReport) && !planSummary ? (
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
                        {language === "en" ? "Current retirement plan" : "Kế hoạch hưu trí đang dùng"} (v{activePlan?.current?.version ?? currentVersion?.version})
                      </h2>
                      <p className="user-plan-subtitle">{t("dashboard.plan.forecast_note")}</p>
                    </div>
                  </div>
                  <div className="user-plan-badges">
                    {report?.hypothetical && (
                      <Badge tone="warning">{language === "en" ? "WhatIf Scenario" : "Giả định whatIf"}</Badge>
                    )}
                    <Badge tone="success">{t("dashboard.plan.active")}</Badge>
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
                      {planSummary.atRetirement.coveragePercent == null ? (language === "en" ? "Undetermined" : "Chưa xác định") : formatPercent(planSummary.atRetirement.coveragePercent)}
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
                      {t("dashboard.plan.target_date", { date: planSummary.retirementMonth })}
                    </small>
                  </div>

                  <div className="user-plan-metric">
                    <span className="metric-label">{t("dashboard.plan.monthly_contribution")}</span>
                    <strong className="metric-value font-mono">
                      {planSummary.requiredConstantMonthlyContribution != null
                        ? `${formatCurrency(planSummary.requiredConstantMonthlyContribution)} ${t("dashboard.plan.per_month")}`
                        : (language === "en" ? "Undetermined" : "Chưa xác định")}
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
              </>
            ) : (
              <div className="user-invite-block">
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
                <span className="cashflow-label">{t("dashboard.cashflow.income")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name="wallet" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{known.income ? formatCurrency(income) : unreported}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.income_sub")}</span>
            </div>

            <div className="user-cashflow-card theme-expense">
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.expense")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name="file-text" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{known.expenses ? formatCurrency(expense) : unreported}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.expense_sub")}</span>
            </div>

            <div className="user-cashflow-card theme-debt">
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.debt")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name="shield" />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{known.debtPayment ? formatCurrency(debtService) : unreported}</strong>
              <span className="cashflow-sub">{t("dashboard.cashflow.debt_sub")}</span>
            </div>

            <div className={`user-cashflow-card ${!known.surplus ? "theme-unknown" : surplus >= 0 ? "theme-surplus" : "theme-deficit"}`}>
              <div className="cashflow-card-head">
                <span className="cashflow-label">{t("dashboard.cashflow.surplus")}</span>
                <div className="cashflow-icon-wrap">
                  <Icon name={!known.surplus ? "info" : surplus >= 0 ? "sparkles" : "alert"} />
                </div>
              </div>
              <strong className="cashflow-value font-mono">{known.surplus ? formatCurrency(surplus) : undetermined}</strong>
              <span className="cashflow-sub">
                {!known.surplus ? (language === "en" ? "Complete income, expenses and debt payments first." : "Cần đủ thu nhập, chi tiêu và khoản trả nợ.") : surplus >= 0 ? t("dashboard.cashflow.surplus_sub") : t("dashboard.cashflow.deficit_sub")}
              </span>
            </div>
          </div>

          {!known.surplus && <Link className="button button-soft" to="/user/account">{language === "en" ? "Complete cashflow information" : "Bổ sung thông tin thu chi"}</Link>}
          {known.surplus && surplus < 0 && (
            <Alert
              tone="warning"
              title={t("dashboard.cashflow.negative_warning")}
              action={
                <Link className="button button-small" to="/user/account">
                  {t("dashboard.cashflow.review_profile")}
                </Link>
              }
            >
              {t("dashboard.cashflow.negative_alert")}
            </Alert>
          )}
        </section>

            <section className="user-trajectory-wrap" aria-label={language === "en" ? "Profile projection details" : "Chi tiết dự phóng từ hồ sơ"}>
              <div className="card-topline">
                <div>
                  <h3 className="card-title">
                    {language === "en" ? "Current profile estimate" : "Ước tính từ hồ sơ hiện tại"}
                  </h3>
                  <p className="card-desc">
                    {language === "en"
                      ? "Indicative estimate from your profile, separate from the saved plan version's projection."
                      : "Ước tính tham khảo từ hồ sơ, không phải đường dự phóng của phiên bản kế hoạch đã lưu."}
                  </p>
                </div>
                <div className="trajectory-top-meta">
                  {targetAmountDisplay && (
                    <span className="wealth-total-badge font-mono">
                      {language === "en" ? `Target: ${targetAmountDisplay}` : `Mục tiêu: ${targetAmountDisplay}`}
                    </span>
                  )}
                  <div className="chart-period">
                    {(["5y", "10y", "retire", "lifetime"] as ChartPeriod[]).map((period) => (
                      <button
                        key={period}
                        type="button"
                        className={chartPeriod === period ? "is-active" : ""}
                        aria-pressed={chartPeriod === period}
                        onClick={() => setChartPeriod(period)}
                      >
                        {period === "5y"
                          ? (language === "en" ? "5 Years" : "5 năm")
                          : period === "10y"
                          ? (language === "en" ? "10 Years" : "10 năm")
                          : period === "retire"
                          ? (language === "en" ? "To Retirement" : "Đến nghỉ hưu")
                          : (language === "en" ? "Lifetime" : "Trọn đời")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="projection-chart-area" tabIndex={0} style={{ width: "100%", minHeight: 320, overflowX: "auto" }}>
                {known.surplus && known.assets && known.debtBalance ? <ProjectionWealthChart period={chartPeriod} profile={profile} /> : <p>{language === "en" ? "Complete income, expenses, assets and debts to view this estimate." : "Bổ sung thu nhập, chi tiêu, tài sản và nợ để xem ước tính này."}</p>}
              </div>

              {planSummary && (
                <div className="user-plan-footer" style={{ marginTop: "14px" }}>
                  <span className="valuation-date">
                    {t("dashboard.plan.valuation_date", {
                      date: i18nFormatDate(planSummary.valuationDate),
                    })}
                  </span>
                </div>
              )}
            </section>

        {/* 4. Wealth Architecture & Foundation (Bento Grid) */}
        <div className="user-wealth-bento">
          {/* Left: Asset Portfolio Allocation */}
          <div className="user-wealth-card">
            <div className="card-topline">
              <div>
                <h2 className="card-title">{t("dashboard.wealth.title")}</h2>
                <p className="card-desc">{t("dashboard.wealth.subtitle")}</p>
              </div>
              <span className="wealth-total-badge font-mono">
                {t("dashboard.wealth.total_badge", { amount: known.assets ? formatCurrency(assets) : unreported })}
              </span>
            </div>

            {known.assets ? <div className="chart-and-table-wrap">
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
            </div> : <p>{unreported}</p>}
          </div>

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
                  <strong className="balance-val font-mono">{known.assets ? formatCurrency(assets) : unreported}</strong>
                </div>

                <div className="balance-row">
                  <span className="balance-label">
                    <span className="balance-sign is-negative">-</span> {t("dashboard.balance.current_debt")}
                  </span>
                  <strong className="balance-val font-mono">{known.debtBalance ? formatCurrency(debt) : unreported}</strong>
                </div>

                <div className="networth-highlight">
                  <div className="networth-copy">
                    <span className="networth-eyebrow">{t("dashboard.balance.net_worth")}</span>
                    <strong className="networth-number font-mono" style={{ color: netWorth < 0 ? "var(--color-danger)" : undefined }}>
                      {known.assets && known.debtBalance ? formatCurrency(netWorth) : undetermined}
                    </strong>
                  </div>
                  <div className="networth-badge-wrap">
                    <span className="debt-ratio-badge font-mono">
                      {!known.assets || !known.debtBalance ? undetermined : assets > 0 ? t("dashboard.balance.debt_ratio", { percent: `${debtRatio.toFixed(1)}%` }) : (language === "en" ? "Debt/assets: Undefined (no assets)" : "Nợ/tài sản: Không xác định (chưa có tài sản)")}
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
