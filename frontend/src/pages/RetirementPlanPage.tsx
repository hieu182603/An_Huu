import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, useNotification } from "../components/ui";
import { MonthlyRetirementChart } from "../components/charts";
import { MonthlyCashflowTable } from "../components/retirement/MonthlyCashflowTable";
import { PlanVersionDrawer } from "../components/retirement/PlanVersionDrawer";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import {
  formatVNDCurrency,
  formatPercentNumber,
  translateIssueCode,
  translateWarningCode,
  type RetirementPreviewInput,
} from "../services/retirement";
import {
  fetchUserPortfolioPolicies,
  fetchUserPortfolioPolicyDetail,
  type PortfolioPolicyDetail,
} from "../services/portfolios";
import { useI18n } from "../i18n";

export default function RetirementPlanPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
  const {
    activePlan,
    planVersions,
    currentVersion,
    previewData,
    previewStatus,
    previewIssues,
    previewWarnings,
    previewError,
    lastInputHash,
    runPreview,
    savePlanVersion,
    applyVersion,
    replayVersion,
  } = useRetirementPlan();

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [scenario, setScenario] = useState<"BASE" | "ADVERSE" | "FAVORABLE">("BASE");
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);

  // Load published policy
  useEffect(() => {
    let active = true;
    setLoadingPolicy(true);
    fetchUserPortfolioPolicies(1, 1)
      .then(async (res) => {
        if (!active) return;
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(res.items[0].id);
          if (active) setPolicyDetail(detail);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Compute endMonth from profile (life expectancy)
  const defaultEndMonth = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const birthMonthStr = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : null;
    const birthYear = birthMonthStr
      ? parseInt(birthMonthStr.slice(0, 4), 10)
      : (profile.personal.age > 0 ? currentYear - profile.personal.age : null);
    const lifeExpectancy = profile.goal.lifeExpectancy;
    if (!birthYear || !lifeExpectancy || lifeExpectancy <= 0) return null;
    const endYear = birthYear + lifeExpectancy;
    return `${endYear}-12`;
  }, [v2Profile, profile]);

  // Construct standard input payload for T06 preview using confirmed profile inputs
  const previewPayload = useMemo<RetirementPreviewInput | null>(() => {
    if (!policyDetail || !defaultEndMonth) return null;

    // Use answers from active plan version if already completed; do not auto-select choices[0]
    const baselineAnswers = currentVersion?.preview.selection.answers;
    const answers = baselineAnswers && baselineAnswers.length > 0 ? baselineAnswers : [];

    const monthlyExpenseToday =
      profile.goal.monthlyExpenseInRetirement > 0
        ? String(profile.goal.monthlyExpenseInRetirement)
        : (profile.expenses.essentialExpense + profile.expenses.lifestyleExpense > 0
            ? String(profile.expenses.essentialExpense + profile.expenses.lifestyleExpense)
            : "");

    const monthlyContribution =
      profile.plan.monthlySavings > 0 ? String(profile.plan.monthlySavings) : "";

    // Require essential confirmed numbers before generating preview payload
    if (!monthlyExpenseToday || !monthlyContribution) return null;

    const retirementMonth =
      v2Profile?.personal.desiredRetirementMonth?.status === "KNOWN"
        ? v2Profile.personal.desiredRetirementMonth.value
        : undefined;

    const revision = profileRevision > 0 ? profileRevision : 1;

    // Map confirmed housing from profile assets
    const housing = v2Profile?.assets.status === "KNOWN"
      ? v2Profile.assets.entries
          .filter((a) => a.housingPlan?.status === "CONFIRMED")
          .map((a) => ({
            assetId: a.id,
            amountScope: (a.ownershipShare.status === "KNOWN" && a.ownershipShare.value === "1" ? "WHOLE_ASSET" : "OWNERS_SHARE") as "WHOLE_ASSET" | "OWNERS_SHARE",
          }))
      : [];

    // Map pension/retirement income IDs
    const retirementIncomeIds = v2Profile?.income.status === "KNOWN"
      ? v2Profile.income.entries.filter((i) => i.source === "PENSION").map((i) => i.id)
      : [];

    return {
      expectedProfileRevision: revision,
      policyVersionId: policyDetail.id,
      answers,
      liquidityNeedMonths: 6,
      endMonth: defaultEndMonth,
      monthlyExpenseToday,
      monthlyContribution,
      monthlyReserve: "0",
      terminalBalance: "0",
      retirementIncomeIds,
      retirementAdditionalExpenseIds: [],
      debtStress: [],
      housing,
      scenario,
      whatIf: retirementMonth ? { retirementMonth } : undefined,
    };
  }, [policyDetail, profile, v2Profile, profileRevision, defaultEndMonth, scenario, currentVersion]);

  // Trigger calculation when payload is ready
  useEffect(() => {
    if (previewPayload) {
      runPreview(previewPayload);
    }
  }, [previewPayload]);

  const handleSaveVersion = async () => {
    if (!previewData || !lastInputHash || !previewPayload) {
      notify.error(
        language === "en" ? "Cannot Save" : "Chưa thể lưu",
        language === "en" ? "Need to complete forecast preview before saving version." : "Cần hoàn tất xem trước trước khi lưu phiên bản."
      );
      return;
    }
    setIsSaving(true);
    try {
      const saved = await savePlanVersion(previewPayload, lastInputHash);
      if (saved) {
        notify.success(
          language === "en" ? "New Version Saved" : "Đã lưu phiên bản mới",
          language === "en" ? `Version v${saved.version} was saved successfully to history.` : `Phiên bản v${saved.version} đã được lưu thành công vào lịch sử.`
        );
      }
    } catch (e) {
      notify.error(
        language === "en" ? "Save Version Error" : "Lỗi lưu phiên bản",
        e instanceof Error ? e.message : (language === "en" ? "Could not save version." : "Không thể lưu phiên bản.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyCurrent = async () => {
    const revision = profileRevision > 0 ? profileRevision : 1;

    if (!activePlan || !activePlan.currentVersionId) {
      // If saving first time, save then apply with fresh plan metadata
      if (previewData && lastInputHash && previewPayload) {
        setIsApplying(true);
        try {
          const saved = await savePlanVersion(previewPayload, lastInputHash);
          if (saved) {
            const applied = await applyVersion(saved.id, revision, saved.planId, saved.planRevision);
            if (applied === false) {
              notify.error(
                language === "en" ? "Apply Plan Error" : "Lỗi áp dụng kế hoạch",
                language === "en" ? "Server rejected plan application." : "Máy chủ từ chối áp dụng phiên bản kế hoạch."
              );
              return;
            }
            notify.success(
              language === "en" ? "Plan Applied" : "Đã áp dụng kế hoạch",
              language === "en" ? `Version v${saved.version} has become your official plan.` : `Phiên bản v${saved.version} đã trở thành kế hoạch chính thức.`
            );
            setShowApplyConfirm(false);
          }
        } catch (e) {
          notify.error(
            language === "en" ? "Apply Plan Error" : "Lỗi áp dụng kế hoạch",
            e instanceof Error ? e.message : (language === "en" ? "Could not apply plan." : "Không thể áp dụng kế hoạch.")
          );
        } finally {
          setIsApplying(false);
        }
      }
      return;
    }

    setIsApplying(true);
    try {
      const applied = await applyVersion(activePlan.currentVersionId, revision, activePlan.id, activePlan.revision);
      if (applied === false) {
        notify.error(
          language === "en" ? "Apply Plan Error" : "Lỗi áp dụng kế hoạch",
          language === "en" ? "Could not apply plan." : "Không thể áp dụng kế hoạch."
        );
        return;
      }
      notify.success(
        language === "en" ? "Plan Applied" : "Đã áp dụng kế hoạch",
        language === "en" ? "Official plan applied successfully." : "Kế hoạch đã được áp dụng thành công."
      );
      setShowApplyConfirm(false);
    } catch (e) {
      notify.error(
        language === "en" ? "Apply Plan Error" : "Lỗi áp dụng kế hoạch",
        e instanceof Error ? e.message : (language === "en" ? "Could not apply plan." : "Không thể áp dụng kế hoạch.")
      );
    } finally {
      setIsApplying(false);
    }
  };

  const calculation = previewData?.calculation || currentVersion?.preview.calculation;
  const summary = calculation?.summary;

  const isAppliedPlan = Boolean(activePlan?.currentVersionId && previewData && currentVersion?.snapshotHash === previewData.references?.profileHash);

  return (
    <>
      <div className="retirement-page-header">
        <div className="retirement-header-main">
          <div className="header-status-badge is-synced">
            <Icon name="chart" size="small" />
            <span>
              {activePlan?.current
                ? (language === "en" ? `Official Plan v${activePlan.current.version} (Active)` : `Kế hoạch chính thức v${activePlan.current.version} (Đang áp dụng)`)
                : (language === "en" ? "Forecast Preview (Unapplied)" : "Bản dự phóng xem trước (Chưa áp dụng chính thức)")}
            </span>
          </div>
          <h1>{t("plan.page_title")}</h1>
          <p>{t("plan.page_subtitle")}</p>
        </div>

        <div className="header-quick-stats">
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Retirement Date" : "Thời điểm nghỉ hưu"}</span>
            <span className="stat-value">
              {summary?.retirementMonth ||
                (v2Profile?.personal.desiredRetirementMonth?.status === "KNOWN"
                  ? v2Profile.personal.desiredRetirementMonth.value
                  : (language === "en" ? "Undetermined" : "Chưa xác định"))}
            </span>
          </div>
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Funding Status" : "Tình trạng quỹ"}</span>
            <span className={`stat-value ${summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "is-warning" : "is-safe"}`}>
              {summary && parseFloat(summary.retirementFundingShortfall) > 0
                ? (language === "en" ? "Additional Capital Needed" : "Cần bổ sung vốn")
                : (language === "en" ? "Target Securely Met" : "Đạt mục tiêu vững vàng")}
            </span>
          </div>
        </div>
      </div>

      {/* Warnings & Issues notification banners */}
      {previewStatus === "incomplete" && previewIssues.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <Alert tone="warning" title={language === "en" ? "Incomplete Financial Data" : "Dữ liệu chưa hoàn tất"}>
            <ul style={{ margin: "6px 0 0", paddingLeft: "20px", fontSize: "13px" }}>
              {previewIssues.map((iss, idx) => (
                <li key={idx}>{translateIssueCode(iss.code)}</li>
              ))}
            </ul>
            <div style={{ marginTop: "10px" }}>
              <Link to="/user/account" className="button button-secondary button-small">
                {language === "en" ? "Complete Financial Profile" : "Bổ sung hồ sơ tài chính"} <Icon name="arrow-right" size="small" />
              </Link>
            </div>
          </Alert>
        </div>
      )}

      {previewWarnings.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          {previewWarnings.map((warn, idx) => (
            <Alert key={idx} tone="info" title={language === "en" ? "Business Notice" : "Lưu ý nghiệp vụ"}>
              {translateWarningCode(warn.code)}
            </Alert>
          ))}
        </div>
      )}

      {activePlan?.stale && (
        <div style={{ marginBottom: "20px" }}>
          <Alert tone="warning" title={language === "en" ? "Profile or assumptions updated" : "Hồ sơ hoặc giả định đã có cập nhật mới"}>
            {language === "en"
              ? "Your financial profile or portfolio policy recently changed. We recommend re-running projection and saving a new version."
              : "Hồ sơ tài chính của bạn hoặc chính sách danh mục vừa có cập nhật mới. Bạn nên chạy lại dự phóng và lưu phiên bản mới."}
          </Alert>
        </div>
      )}

      {/* Primary Result Hero */}
      <motion.div
        className="plan-result-hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="plan-result-copy">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            <Badge tone="soft">{language === "en" ? "MONTHLY PROJECTION" : "DỰ PHÓNG THEO THÁNG"}</Badge>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {language === "en"
                ? `Scenario: ${scenario === "BASE" ? "Baseline" : scenario === "ADVERSE" ? "Adverse" : "Favorable"}`
                : `Kịch bản: ${scenario === "BASE" ? "Cơ sở" : scenario === "ADVERSE" ? "Bất lợi" : "Thuận lợi"}`}
            </span>
          </div>

          <span className="result-kicker">
            {language === "en"
              ? `TOTAL RETIREMENT FUND NEEDED AT RETIREMENT MONTH (${summary?.retirementMonth || "..."})`
              : `TỔNG QUỸ HƯU TRÍ CẦN CÓ TẠI THÁNG NGHỈ HƯU (${summary?.retirementMonth || "..."})`}
          </span>
          <strong className="result-total">
            {summary?.atRetirement?.requiredFund ? formatVNDCurrency(summary.atRetirement.requiredFund) : (language === "en" ? "Calculating..." : "Đang tính toán...")}
          </strong>

          <p>
            {language === "en" ? (
              <>
                Ensures you have living cash flow <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "..."} / month</strong> (inflation adjusted) across {summary?.retirementMonths || 0} retirement months until end of {summary?.endMonth || "..."}.
              </>
            ) : (
              <>
                Đảm bảo bạn có dòng tiền sinh hoạt <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "..."} / tháng</strong> (đã điều chỉnh trượt giá lạm phát) suốt {summary?.retirementMonths || 0} tháng hưu trí đến hết tháng {summary?.endMonth || "..."}.
              </>
            )}
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Initial fund capital (liquid):" : "Vốn quỹ ban đầu (thanh khoản):"}</span>
              <strong>{summary ? formatVNDCurrency(summary.initialRetirementCapital) : "0 ₫"}</strong>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Overall net worth:" : "Tài sản ròng tổng thể (net worth):"}</span>
              <strong>{calculation ? formatVNDCurrency(calculation.netWorth) : "0 ₫"}</strong>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Projected accumulated fund (A):" : "Quỹ dự kiến tích lũy (A):"}</span>
              <strong style={{ color: "var(--color-mist-300)" }}>{summary ? formatVNDCurrency(summary.atRetirement.projectedFund) : "0 ₫"}</strong>
            </div>
          </div>

          <div className="plan-hero-actions" style={{ marginTop: "20px" }}>
            <Button
              variant="secondary"
              size="medium"
              disabled={isSaving || previewStatus !== "ready"}
              onClick={handleSaveVersion}
            >
              <Icon name="check" /> {isSaving ? (language === "en" ? "Saving..." : "Đang lưu…") : (language === "en" ? "Save this version" : "Lưu phiên bản này")}
            </Button>

            <Button
              variant="primary"
              size="medium"
              disabled={isApplying || previewStatus !== "ready"}
              onClick={() => setShowApplyConfirm(true)}
            >
              <Icon name="target" /> {language === "en" ? "Apply to official plan" : "Áp dụng vào kế hoạch chính thức"}
            </Button>

            <Button
              variant="ghost"
              size="medium"
              onClick={() => setIsVersionDrawerOpen(true)}
            >
              <Icon name="file-text" /> {language === "en" ? `View history (${planVersions.length} versions)` : `Xem lịch sử (${planVersions.length} bản)`}
            </Button>
          </div>
        </div>

        <div className={`plan-progress-panel ${summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "is-warning" : "is-safe"}`}>
          <div className="ring-ambient-glow" />

          {/* Readiness Score Progress Ring */}
          <div className="plan-progress-ring">
            <svg viewBox="0 0 220 220" className="progress-ring-svg">
              <circle cx="110" cy="110" r="86" className="ring-base-track" />
              <circle
                cx="110"
                cy="110"
                r="86"
                className="ring-main-arc"
                stroke={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "var(--color-accent-400)" : "var(--color-secondary-500)"}
                strokeDasharray="540.35 540.35"
                style={{
                  strokeDashoffset: `${
                    540.35 *
                    (1 -
                      Math.min(
                        100,
                        Math.max(
                          0,
                          summary && summary.atRetirement.coveragePercent
                            ? parseFloat(summary.atRetirement.coveragePercent)
                            : 0
                        )
                      ) /
                        100)
                  }`,
                }}
              />
            </svg>

            <div className="ring-center-content">
              <div className="ring-number-row">
                <span className="ring-number">
                  {summary && summary.atRetirement.coveragePercent
                    ? Math.round(parseFloat(summary.atRetirement.coveragePercent))
                    : "0"}
                </span>
                <span className="ring-unit">%</span>
              </div>
              <div className="ring-status-pill">
                <Icon name={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "alert" : "sparkles"} size="small" />
                <span>{language === "en" ? "COVERAGE RATE" : "MỨC ĐỘ BAO PHỦ"}</span>
              </div>
            </div>
          </div>

          <div className="plan-status-card">
            <div className="status-card-header">
              <span className="status-badge-indicator">
                <span className="status-pulse-dot" />
                {summary && parseFloat(summary.retirementFundingShortfall) > 0
                  ? (language === "en" ? "Funding Shortfall" : "Còn thiếu hụt")
                  : (language === "en" ? "Goal Exceeded" : "Vượt mục tiêu")}
              </span>
              <strong className="status-card-amount">
                {summary && parseFloat(summary.retirementFundingShortfall) > 0
                  ? `-${formatVNDCurrency(summary.retirementFundingShortfall)}`
                  : `+${formatVNDCurrency(summary?.excessAtRetirement || "0")}`}
              </strong>
            </div>
            <p className="status-card-desc">
              {summary && parseFloat(summary.retirementFundingShortfall) > 0
                ? summary.firstShortfallMonth
                  ? (language === "en" ? `First cash shortfall month: ${summary.firstShortfallMonth}. Additional contribution required.` : `Tháng đầu tiên thiếu hụt dòng tiền: ${summary.firstShortfallMonth}. Cần bổ sung đóng góp.`)
                  : (language === "en" ? "Increase contributions or adjust retirement spending." : "Cần tăng cường đóng góp hoặc điều chỉnh mức chi tiêu.")
                : (language === "en" ? "Plan is resilient. You have a comfortable financial cushion." : "Kế hoạch rất vững vàng. Bạn có vùng đệm an toàn tài chính thoải mái.")}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 4 Plan Key Metrics */}
      <motion.div
        className="plan-metrics"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
      >
        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Projected Accumulated Fund" : "Quỹ dự kiến tích lũy"}</span>
            <Icon name="wallet" />
          </div>
          <strong>{summary ? formatVNDCurrency(summary.atRetirement.projectedFund) : "0 ₫"}</strong>
          <small>{language === "en" ? "Includes initial liquid capital and invested future contributions" : "Gồm vốn ban đầu thanh khoản và các khoản đóng góp tương lai đã sinh lời"}</small>
        </Card>

        <Card className="plan-metric-card tone-warning">
          <div>
            <span>{language === "en" ? "Capital Funding Gap" : "Khoảng thiếu hụt vốn"}</span>
            <Icon name="alert" />
          </div>
          <strong style={{ color: summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
            {summary && parseFloat(summary.retirementFundingShortfall) > 0
              ? formatVNDCurrency(summary.retirementFundingShortfall)
              : (language === "en" ? "Fully Met" : "Đã đạt trọn vẹn")}
          </strong>
          <small>
            {summary && parseFloat(summary.retirementFundingShortfall) > 0
              ? (language === "en" ? `Need extra ${formatVNDCurrency(summary.additionalMonthlyContribution || "0")} per month` : `Cần bổ sung tăng đều ${formatVNDCurrency(summary.additionalMonthlyContribution || "0")} mỗi tháng`)
              : (language === "en" ? "Steadily accumulating above target threshold" : "Bạn đang tích lũy vững vàng vượt mốc mục tiêu")}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Required Contribution / Month" : "Mức góp cần thiết / tháng"}</span>
            <Icon name="target" />
          </div>
          <strong>
            {summary?.requiredConstantMonthlyContribution
              ? formatVNDCurrency(summary.requiredConstantMonthlyContribution)
              : (language === "en" ? "No addition needed" : "Không cần thêm")}
          </strong>
          <small>
            {language === "en"
              ? "Overall steady contribution required to guarantee full coverage without shortfall"
              : "Mức đóng góp đều đặn tổng thể cần có để đảm bảo an toàn tuyệt đối không thiếu hụt"}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Accumulation Duration" : "Thời gian tích lũy"}</span>
            <Icon name="compass" />
          </div>
          <strong>{summary?.accumulationMonths || 0} {language === "en" ? "months" : "tháng"}</strong>
          <small>{language === "en" ? "Until retirement start month:" : "Đến tháng bắt đầu nghỉ hưu:"} {summary?.retirementMonth || "..."}</small>
        </Card>
      </motion.div>

      {/* Monthly Retirement Cashflow Chart */}
      {calculation && summary && (
        <Card style={{ marginTop: "24px", padding: "24px", borderRadius: "12px" }}>
          <MonthlyRetirementChart rows={calculation.rows} summary={summary} />
        </Card>
      )}

      {/* Monthly Cashflow Table & CSV Export */}
      {calculation && summary && (
        <Card style={{ marginTop: "24px", padding: "24px", borderRadius: "12px" }}>
          <MonthlyCashflowTable
            rows={calculation.rows}
            summary={summary}
            previewData={previewData}
            isApplied={isAppliedPlan}
            planId={activePlan?.id}
            versionId={activePlan?.currentVersionId ?? currentVersion?.id}
          />
        </Card>
      )}

      {/* Plan Version Drawer */}
      <PlanVersionDrawer
        isOpen={isVersionDrawerOpen}
        onClose={() => setIsVersionDrawerOpen(false)}
        plan={activePlan}
        versions={planVersions}
        onApplyVersion={async (vId) => {
          setIsApplying(true);
          try {
            const revision = profileRevision > 0 ? profileRevision : 1;
            const applied = await applyVersion(vId, revision, activePlan?.id, activePlan?.revision);
            if (applied === false) {
              notify.error(
                language === "en" ? "Apply Error" : "Lỗi áp dụng phiên bản",
                language === "en" ? "Server rejected plan application." : "Máy chủ từ chối áp dụng phiên bản này."
              );
              return;
            }
            notify.success(
              language === "en" ? "Version Applied" : "Áp dụng phiên bản thành công",
              language === "en" ? "Version has become your official plan." : "Phiên bản đã được chuyển thành kế hoạch chính thức."
            );
            setIsVersionDrawerOpen(false);
          } catch (e) {
            notify.error(
              language === "en" ? "Apply Error" : "Lỗi áp dụng phiên bản",
              e instanceof Error ? e.message : (language === "en" ? "Could not apply version." : "Không thể áp dụng.")
            );
          } finally {
            setIsApplying(false);
          }
        }}
        onReplayVersion={(vId) => replayVersion(vId)}
        isApplying={isApplying}
      />

      {/* Apply Confirmation Modal */}
      {showApplyConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", color: "var(--color-text-main)" }}>
              {language === "en" ? "Confirm Retirement Plan Application" : "Xác nhận áp dụng kế hoạch hưu trí"}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "14px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
              {language === "en"
                ? "This version will become your account's official plan. All tracking and dashboard metrics will benchmark against this plan."
                : "Kế hoạch này sẽ trở thành kế hoạch chính thức của tài khoản bạn. Mọi bảng theo dõi tiến độ và tóm tắt trên Dashboard sẽ đối chiếu theo phiên bản này."}
            </p>

            <div style={{ background: "var(--color-surface-subtle)", padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Retirement Month:" : "Tháng nghỉ hưu:"}</span>
                <strong>{summary?.retirementMonth}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Required Fund at Retirement (K):" : "Quỹ cần tại tuổi hưu (K):"}</span>
                <strong>{summary?.atRetirement?.requiredFund ? formatVNDCurrency(summary.atRetirement.requiredFund) : "-"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Goal Coverage Rate:" : "Độ bao phủ mục tiêu:"}</span>
                <strong style={{ color: "var(--color-success)" }}>{summary?.atRetirement?.coveragePercent ? formatPercentNumber(summary.atRetirement.coveragePercent) : "-"}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Button
                variant="ghost"
                onClick={() => setShowApplyConfirm(false)}
                disabled={isApplying}
              >
                {language === "en" ? "Cancel" : "Hủy bỏ"}
              </Button>
              <Button
                variant="primary"
                onClick={handleApplyCurrent}
                loading={isApplying}
              >
                {language === "en" ? "Confirm Apply" : "Xác nhận áp dụng"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
