import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, Modal, useNotification } from "../components/ui";
import { MonthlyRetirementChart } from "../components/charts";
import { MonthlyCashflowTable } from "../components/retirement/MonthlyCashflowTable";
import { PlanVersionDrawer } from "../components/retirement/PlanVersionDrawer";
import { SocialInsuranceModal } from "../components/SocialInsuranceModal";
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
import { useAuth } from "../context/AuthContext";
import { readRiskDraft } from "../services/riskDraft";
import { useI18n } from "../i18n";

export default function RetirementPlanPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [contributionTiming, setContributionTiming] = useState<"END_OF_MONTH" | "START_OF_MONTH">("END_OF_MONTH");
  const [startOfMonthAvailable, setStartOfMonthAvailable] = useState<string>("");
  const [startOfMonthConfirmed, setStartOfMonthConfirmed] = useState<boolean>(false);
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => setSurveyAnswers(user && policyDetail ? readRiskDraft(user.id, policyDetail.id, policyDetail.data.questions) : {});
    read();
    window.addEventListener("anhuu_risk_survey_updated", read);
    return () => window.removeEventListener("anhuu_risk_survey_updated", read);
  }, [user?.id, policyDetail]);

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

  // Compute endMonth from profile (life expectancy), capped by published macroeconomic assumptions & policy horizon
  const defaultEndMonth = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const birthMonthStr = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : null;
    const birthYear = birthMonthStr
      ? parseInt(birthMonthStr.slice(0, 4), 10)
      : (profile.personal.age > 0 ? currentYear - profile.personal.age : null);
    const lifeExpectancy = profile.goal.lifeExpectancy;
    if (!birthYear || !lifeExpectancy || lifeExpectancy <= 0) return null;
    const rawEndMonth = `${birthYear + lifeExpectancy}-${birthMonthStr?.slice(5, 7) || "12"}`;

    // Cap by published macroeconomic scenario years & policy horizon (standard 30-year published series, ending 2055)
    const scenarioYears = policyDetail?.data?.scenarios?.flatMap((s: any) => s.years?.map((y: any) => y.year) || []) || [];
    const maxScenarioYear = scenarioYears.length > 0 ? Math.max(...scenarioYears) : 2055;
    const capScenarioMonth = `${maxScenarioYear}-12`;

    const maxHorizon = Math.max(
      ...(policyDetail?.data?.rules?.map((r: any) => r.horizon?.max).filter(Boolean) || [360]),
      ...(policyDetail?.data?.templates?.map((t: any) => t.coverageMonths).filter(Boolean) || [360])
    );
    const valMonth = v2Profile?.valuationDate ? v2Profile.valuationDate.slice(0, 7) : `${currentYear}-01`;
    const [vy, vm] = valMonth.split("-").map(Number);
    const totalCapMonths = vy * 12 + (vm - 1) + (maxHorizon - 1);
    const capHorizonYear = Math.floor(totalCapMonths / 12);
    const capHorizonMonthNum = (totalCapMonths % 12) + 1;
    const capHorizonMonth = `${capHorizonYear}-${String(capHorizonMonthNum).padStart(2, "0")}`;

    const effectiveCap = capScenarioMonth < capHorizonMonth ? capScenarioMonth : capHorizonMonth;
    return rawEndMonth < effectiveCap ? rawEndMonth : effectiveCap;
  }, [v2Profile, profile, policyDetail]);

  // Determine balanced fallback choice if user has not yet taken personalized survey
  const getBalancedChoiceId = (question: any) => {
    const preferred = question.choices.find((c: any) =>
      c.id.includes("BALANCED") ||
      c.id.includes("MODERATE") ||
      c.id.includes("LONG") ||
      c.id.includes("HOLD") ||
      c.id.includes("STABLE")
    );
    if (preferred) return preferred.id;
    const sorted = [...question.choices].sort((a: any, b: any) => a.score - b.score);
    const midIndex = Math.floor(sorted.length / 2);
    return sorted[midIndex]?.id || question.choices[0]?.id;
  };

  const effectiveAnswers = useMemo(() => {
    const baselineAnswers = currentVersion?.preview.selection.answers;


    if (!policyDetail) return [];
    const questions = policyDetail.data.questions || [];
    if (questions.length === 0) return [];

    const hasAllSurvey = questions.every((q) => Boolean(surveyAnswers[q.id]));
    if (hasAllSurvey) {
      return questions.map((q) => ({ questionId: q.id, choiceId: surveyAnswers[q.id] }));
    }

    if (baselineAnswers?.length && questions.every(q => baselineAnswers.some(a => a.questionId === q.id && q.choices.some(c => c.id === a.choiceId)))) return baselineAnswers;

    // Explicitly labelled benchmark for an incomplete survey
    return questions.map((q) => ({
      questionId: q.id,
      choiceId: surveyAnswers[q.id] || getBalancedChoiceId(q),
    }));
  }, [currentVersion, policyDetail, surveyAnswers]);

  const isUsingBenchmarkPortfolio = useMemo(() => {
    const baselineAnswers = currentVersion?.preview.selection.answers;
    if (baselineAnswers && baselineAnswers.length > 0) return false;
    const questions = policyDetail?.data.questions || [];
    if (questions.length === 0) return false;
    return !questions.every((q) => Boolean(surveyAnswers[q.id]));
  }, [currentVersion, policyDetail, surveyAnswers]);

  // Construct standard input payload for T06 preview using confirmed profile inputs
  const previewPayload = useMemo<RetirementPreviewInput | null>(() => {
    if (!policyDetail || !defaultEndMonth || !v2Profile) return null;

    const answers = effectiveAnswers;
    if (answers.length === 0) return null;

    const monthlyExpenseToday =
      profile.goal.monthlyExpenseInRetirement > 0
        ? String(profile.goal.monthlyExpenseInRetirement)
        : (profile.expenses.essentialExpense + profile.expenses.lifestyleExpense > 0
            ? String(profile.expenses.essentialExpense + profile.expenses.lifestyleExpense)
            : "");

    const monthlyContribution =
      String(Math.max(0, profile.plan.monthlySavings));

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
      contributionTiming,
      surplusPolicy: "EXPLICIT_DEPOSITS_ONLY" as const,
      startOfMonthFunding: contributionTiming === "START_OF_MONTH" ? {
        confirmed: startOfMonthConfirmed,
        source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START" as const,
        monthlyAvailable: startOfMonthAvailable.trim() || "0",
      } : undefined,
      whatIf: retirementMonth ? { retirementMonth } : undefined,
    };
  }, [
    policyDetail,
    profile,
    v2Profile,
    profileRevision,
    defaultEndMonth,
    scenario,
    currentVersion,
    effectiveAnswers,
    contributionTiming,
    startOfMonthAvailable,
    startOfMonthConfirmed,
  ]);

  // Trigger calculation when payload is ready
  useEffect(() => {
    if (previewPayload) {
      runPreview(previewPayload);
    }
  }, [previewPayload]);

  const handleSaveVersion = async () => {
    if (isSaving || isApplying || previewStatus !== "ready" || !summary || !previewData || !lastInputHash || !previewPayload) {
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
    if (isApplying || isSaving || previewStatus !== "ready" || !summary || !previewPayload || !lastInputHash) return;
    setIsApplying(true);
    try {
      // Apply exactly the preview shown in the confirmation, never the previous current version.
      const saved = await savePlanVersion(previewPayload, lastInputHash);
      if (!saved) throw new Error(language === "en" ? "Could not save this preview." : "Chưa lưu được bản xem trước này.");
      const applied = await applyVersion(saved.id, profileRevision, saved.planId, saved.planRevision);
      if (!applied) throw new Error(language === "en" ? "Version saved but not applied. Retry from version history." : "Đã lưu phiên bản nhưng chưa áp dụng được. Thử lại từ lịch sử phiên bản.");
      notify.success(language === "en" ? "Plan applied" : "Đã áp dụng kế hoạch", language === "en" ? `Version v${saved.version} is now official.` : `Phiên bản v${saved.version} đã trở thành kế hoạch chính thức.`);
      setShowApplyConfirm(false);
    } catch (e) {
      notify.error(language === "en" ? "Unable to apply" : "Chưa thể áp dụng", e instanceof Error ? e.message : String(e));
    } finally { setIsApplying(false); }
  };

  const uniqueIssues = useMemo(() => {
    const seen = new Set<string>();
    return previewIssues.filter((iss) => {
      if (seen.has(iss.code)) return false;
      seen.add(iss.code);
      return true;
    });
  }, [previewIssues]);

  const hasRiskIssues = useMemo(
    () => uniqueIssues.some((i) => i.code === "ANSWER_REQUIRED" || i.code === "POLICY_NOT_COVERED" || i.code.includes("PORTFOLIO")),
    [uniqueIssues]
  );

  const hasProfileIssues = useMemo(
    () => uniqueIssues.some((i) => i.code !== "ANSWER_REQUIRED" && i.code !== "POLICY_NOT_COVERED" && !i.code.includes("PORTFOLIO")),
    [uniqueIssues]
  );

  const calculation = previewPayload && previewStatus === "ready" ? previewData?.calculation : null;
  const summary = calculation?.summary;

  // Dynamic adaptive scale & actual progress for coverage gauge
  const coveragePercentRaw = summary?.atRetirement?.coveragePercent
    ? parseFloat(summary.atRetirement.coveragePercent)
    : 0;
  const coveragePercentNum = Math.round(coveragePercentRaw);

  const maxScale = useMemo(() => {
    if (coveragePercentNum <= 100) return 100;
    if (coveragePercentNum <= 150) return 150;
    if (coveragePercentNum <= 200) return 200;
    if (coveragePercentNum <= 500) return Math.ceil(coveragePercentNum / 50) * 50;
    if (coveragePercentNum <= 1000) return Math.ceil(coveragePercentNum / 100) * 100;
    return Math.ceil(coveragePercentNum / 500) * 500;
  }, [coveragePercentNum]);

  const progressRatio = maxScale > 0 ? Math.min(1, Math.max(0, coveragePercentRaw / maxScale)) : 0;
  const arcLength = 403.17;
  const arcOffset = arcLength * (1 - progressRatio);

  const tipAngleDeg = 160 + 220 * progressRatio;
  const tipAngleRad = (tipAngleDeg * Math.PI) / 180;
  const tipX = 150 + 105 * Math.cos(tipAngleRad);
  const tipY = 130 + 105 * Math.sin(tipAngleRad);

  const targetRatio = maxScale > 100 ? 100 / maxScale : null;
  const targetAngleDeg = targetRatio !== null ? 160 + 220 * targetRatio : null;
  const targetX = targetAngleDeg !== null ? 150 + 105 * Math.cos((targetAngleDeg * Math.PI) / 180) : null;
  const targetY = targetAngleDeg !== null ? 130 + 105 * Math.sin((targetAngleDeg * Math.PI) / 180) : null;

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
              {!summary ? (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ") : parseFloat(summary.retirementFundingShortfall) > 0
                ? (language === "en" ? "Additional Capital Needed" : "Cần bổ sung vốn")
                : (language === "en" ? "Target Securely Met" : "Đạt mục tiêu vững vàng")}
            </span>
          </div>
        </div>
      </div>

      {loadingPolicy && <p role="status">{language === "en" ? "Loading projection inputs…" : "Đang tải đầu vào dự phóng…"}</p>}
      {!loadingPolicy && !previewPayload && (
        <Alert
          tone="warning"
          title={language === "en" ? "Complete projection inputs" : "Bổ sung đầu vào dự phóng"}
          action={
            <Link to="/user/account">
              {language === "en" ? "Review financial profile" : "Kiểm tra hồ sơ tài chính"}
            </Link>
          }
        >
          {language === "en"
            ? "A detailed financial profile, retirement dates, living expenses and a published policy are required. Results appear only when all inputs are available."
            : "Cần hồ sơ chi tiết, mốc nghỉ hưu, chi tiêu và chính sách đã công bố. Kết quả chỉ xuất hiện khi có đủ đầu vào."}
        </Alert>
      )}
      {previewStatus === "loading" && <p role="status">{language === "en" ? "Calculating your full retirement horizon…" : "Đang tính dự phóng cho toàn bộ thời gian hưu trí…"}</p>}
      {previewStatus === "error" && <Alert tone="danger" title={language === "en" ? "Could not calculate" : "Chưa tính được dự phóng"} action={<Button onClick={() => previewPayload && runPreview(previewPayload)}>{language === "en" ? "Retry" : "Thử lại"}</Button>}>{previewError}</Alert>}
      {/* Informative notice if using standard balanced benchmark portfolio */}
      {isUsingBenchmarkPortfolio && previewStatus === "ready" && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="info"
            title={language === "en" ? "Standard Balanced Portfolio Benchmark" : "Danh mục đầu tư chuẩn Cân bằng (Mặc định)"}
            action={
              <Link to="/user/risk-portfolio">
                <Icon name="sparkles" size="small" /> {language === "en" ? "Personalize Strategy" : "Cá nhân hóa chiến lược"}
              </Link>
            }
          >
            {language === "en"
              ? "Your retirement projection currently applies the Standard Balanced Portfolio (50% Equities / 50% Bonds). You can complete the 6-question risk assessment to tailor your expected return."
              : "Dự phóng hưu trí của bạn đang áp dụng Danh mục Cân bằng chuẩn (50% Cổ phiếu / 50% Trái phiếu). Bạn có thể làm khảo sát 6 câu hỏi để tối ưu hóa tỷ suất sinh lời theo đúng khẩu vị rủi ro cá nhân."}
          </Alert>
        </div>
      )}

      {/* Warnings & Issues notification banners */}
      {previewStatus === "incomplete" && uniqueIssues.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="warning"
            title={language === "en" ? "Incomplete Financial Data" : "Dữ liệu chưa hoàn tất"}
            action={
              <>
                {hasRiskIssues && (
                  <Link to="/user/risk-portfolio">
                    <Icon name="sparkles" size="small" />
                    {language === "en" ? "Complete Risk Assessment" : "Làm khảo sát rủi ro"}
                  </Link>
                )}
                {hasProfileIssues && (
                  <Link to="/user/account">
                    {language === "en" ? "Complete Financial Profile" : "Bổ sung hồ sơ tài chính"} <Icon name="arrow-right" size="small" />
                  </Link>
                )}
              </>
            }
          >
            <ul style={{ margin: "6px 0 0", paddingLeft: "20px", fontSize: "13px" }}>
              {uniqueIssues.map((iss, idx) => (
                <li key={idx}>{translateIssueCode(iss.code, language)}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {previewWarnings.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <Alert tone="info" title={language === "en" ? "Business Notices" : "Lưu ý nghiệp vụ"}>
            <ul style={{ margin: "6px 0 0", paddingLeft: "20px", fontSize: "13px" }}>
              {previewWarnings.map((warn, idx) => (
                <li key={idx}>{translateWarningCode(warn.code, language)}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {Boolean(activePlan?.actualSourceChanged) && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="danger"
            title={language === "en" ? "Actual Source Changed" : "Dữ liệu thực tế nguồn đã bị thay đổi"}
          >
            {language === "en"
              ? "Actual transactions linked to this plan version have been modified. Please reconcile actuals and run a reforecast."
              : "Bút toán thực tế liên kết với phiên bản kế hoạch này đã bị sửa đổi. Vui lòng đối soát lại sổ thực tế và lập dự báo mới."}
          </Alert>
        </div>
      )}

      {/* Contribution Timing Configuration Panel (P13/P15) */}
      <Card style={{ marginBottom: "20px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
          <div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-primary-700)", textTransform: "uppercase" }}>
              {language === "en" ? "CONTRIBUTION TIMING POLICY" : "CHÍNH SÁCH ĐÓNG GÓP ĐỊNH KỲ (P13/P15)"}
            </span>
            <h3 style={{ margin: "2px 0 0", fontSize: "15px" }}>
              {language === "en" ? "Periodic Contribution Timing" : "Thời điểm tích lũy vào quỹ"}
            </h3>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              variant={contributionTiming === "END_OF_MONTH" ? "primary" : "secondary"}
              size="small"
              onClick={() => setContributionTiming("END_OF_MONTH")}
            >
              {language === "en" ? "End of Month (Default)" : "Cuối mỗi tháng (Mặc định)"}
            </Button>
            <Button
              variant={contributionTiming === "START_OF_MONTH" ? "primary" : "secondary"}
              size="small"
              onClick={() => setContributionTiming("START_OF_MONTH")}
            >
              {language === "en" ? "Start of Month" : "Đầu mỗi tháng"}
            </Button>
          </div>
        </div>

        {contributionTiming === "START_OF_MONTH" && (
          <div style={{ background: "var(--color-surface-subtle)", padding: "12px", borderRadius: "var(--radius-md)", display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                  {language === "en" ? "Available Disposable Cash at Start (VND) *" : "Thu nhập khả dụng sẵn có đầu tháng để tích lũy (VND) *"}
                </label>
                <input
                  type="number"
                  placeholder="VD: 5000000"
                  className="input"
                  value={startOfMonthAvailable}
                  onChange={(e) => setStartOfMonthAvailable(e.target.value)}
                  style={{ width: "100%", height: "34px", fontSize: "12px" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={startOfMonthConfirmed}
                    onChange={(e) => setStartOfMonthConfirmed(e.target.checked)}
                  />
                  {language === "en"
                    ? "I confirm this disposable cash is available at the start of each month (not drawn from fund balance)."
                    : "Tôi xác nhận nguồn tiền này đã sẵn có vào đầu mỗi tháng để đóng góp (không trích từ số dư quỹ hưu trí)."}
                </label>
              </div>
            </div>
            {!startOfMonthConfirmed && (
              <span style={{ fontSize: "11.5px", color: "var(--color-warning-800)" }}>
                {language === "en"
                  ? "Start-of-month timing requires explicit user confirmation of disposable funds available at month start."
                  : "Đóng góp đầu tháng yêu cầu xác nhận rõ ràng nguồn tiền khả dụng đã sẵn có đầu tháng."}
              </span>
            )}
          </div>
        )}

        {previewData?.replayInput?.contributionStartMonth && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-muted)" }}>
            <Icon name="compass" size="small" />{" "}
            {language === "en"
              ? `Contribution calculation begins from: ${previewData.replayInput.contributionStartMonth}`
              : `Kỳ bắt đầu tính toán đóng góp: Tháng ${previewData.replayInput.contributionStartMonth}`}
          </div>
        )}

        {summary?.savingsStatus === "EARLY_FUNDING_REQUIRED" && (
          <div style={{ marginTop: "8px" }}>
            <Alert tone="warning" title={language === "en" ? "Early Funding Required" : "Yêu cầu nguồn vốn đầu kỳ (EARLY_FUNDING_REQUIRED)"}>
              {language === "en"
                ? "Additional disposable funds are required before the eligible contribution window opens."
                : "Cần bổ sung nguồn vốn khả dụng trước khi kỳ đóng góp đủ điều kiện bắt đầu."}
            </Alert>
          </div>
        )}

        {summary?.savingsStatus === "NO_ELIGIBLE_CONTRIBUTION_PERIOD" && (
          <div style={{ marginTop: "8px" }}>
            <Alert tone="warning" title={language === "en" ? "No Eligible Contribution Period" : "Không có kỳ đóng góp đủ điều kiện (NO_ELIGIBLE_CONTRIBUTION_PERIOD)"}>
              {language === "en"
                ? "An accumulation phase exists, but no eligible contribution months were found within the planning horizon."
                : "Tồn tại giai đoạn tích lũy nhưng không tìm thấy kỳ đóng góp đủ điều kiện nào trong chân trời kế hoạch."}
            </Alert>
          </div>
        )}
      </Card>

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
            {summary?.atRetirement?.requiredFund
              ? formatVNDCurrency(summary.atRetirement.requiredFund)
              : previewStatus === "loading"
              ? (language === "en" ? "Calculating..." : "Đang tính toán...")
              : previewStatus === "incomplete"
              ? (language === "en" ? "Awaiting Valid Inputs" : "Chờ dữ liệu hợp lệ")
              : (language === "en" ? "No Projection" : "Chưa có dự phóng")}
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
              disabled={isSaving || isApplying || !summary || previewStatus !== "ready"}
              onClick={handleSaveVersion}
            >
              <Icon name="check" /> {isSaving ? (language === "en" ? "Saving..." : "Đang lưu…") : (language === "en" ? "Save this version" : "Lưu phiên bản này")}
            </Button>

            <Button
              variant="primary"
              size="medium"
              disabled={isApplying || isSaving || !summary || previewStatus !== "ready"}
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

            <Button
              variant="secondary"
              size="medium"
              onClick={() => setShowInsuranceModal(true)}
            >
              <Icon name="sparkles" /> {language === "en" ? "Social Insurance (BHXH)" : "Thẩm định & Ước tính BHXH"}
            </Button>
          </div>
        </div>

        <div className={`plan-progress-panel ${summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "is-warning" : "is-safe"}`}>
          <div className="ring-ambient-glow" />

          {/* Premium 220° Arch Dial Gauge */}
          <div className="plan-progress-ring">
            <svg viewBox="0 0 300 230" className="progress-ring-svg">
              <defs>
                <linearGradient id="gaugeSafeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
                <linearGradient id="gaugeWarnGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
                <filter id="gaugeGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "rgba(245, 158, 11, 0.4)" : "rgba(16, 185, 129, 0.4)"} />
                </filter>
              </defs>

              {/* Background Arch Track */}
              <circle
                cx="150"
                cy="130"
                r="105"
                className="ring-base-track"
                strokeDasharray="403.17 256.56"
                strokeDashoffset="0"
                transform="rotate(160 150 130)"
              />

              {/* Active Gradient Arc */}
              <circle
                cx="150"
                cy="130"
                r="105"
                className="ring-main-arc"
                stroke={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "url(#gaugeWarnGradient)" : "url(#gaugeSafeGradient)"}
                strokeDasharray="403.17 256.56"
                style={{
                  strokeDashoffset: `${arcOffset}`,
                }}
                transform="rotate(160 150 130)"
                filter="url(#gaugeGlowFilter)"
              />

              {/* 100% Target Checkpoint Pin (when scale exceeds 100%) */}
              {targetX !== null && targetY !== null && (
                <g className="gauge-target-checkpoint">
                  <circle cx={targetX} cy={targetY} r="4" fill="#ffffff" stroke="#10b981" strokeWidth="2" filter="url(#gaugeGlowFilter)" />
                </g>
              )}

              {/* Glowing Tip Marker at Current Progress */}
              {progressRatio > 0.02 && (
                <g className="gauge-tip-marker">
                  <circle cx={tipX} cy={tipY} r="5.5" fill="#ffffff" filter="url(#gaugeGlowFilter)" />
                  <circle cx={tipX} cy={tipY} r="3" fill={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "#f59e0b" : "#06b6d4"} />
                </g>
              )}

              {/* Milestone labels at ends of arch */}
              <text x="44" y="190" className="gauge-milestone-text">0%</text>
              <text x="256" y="190" className="gauge-milestone-text">
                {new Intl.NumberFormat(language === "en" ? "en-US" : "vi-VN").format(maxScale)}%
              </text>
            </svg>

            <div className="ring-center-content">
              <div className="ring-number-row">
                <span className="ring-number">
                  {summary && summary.atRetirement.coveragePercent
                    ? new Intl.NumberFormat(language === "en" ? "en-US" : "vi-VN").format(coveragePercentNum)
                    : "0"}
                </span>
                <span className="ring-unit">%</span>
              </div>
              <div className="ring-status-pill">
                <Icon name={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "alert" : "sparkles"} size="small" />
                <span>{language === "en" ? "COVERAGE RATE" : "MỨC ĐỘ BAO PHỦ"}</span>
              </div>
              {coveragePercentNum > 100 && (
                <span className="gauge-multiplier-tag">
                  {language === "en"
                    ? `Exceeds target by ${(coveragePercentRaw / 100).toFixed(1)}x`
                    : `Vượt ${(coveragePercentRaw / 100).toFixed(1)}x mục tiêu`}
                </span>
              )}
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
              {!summary ? (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ") : parseFloat(summary.retirementFundingShortfall) > 0
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
      <Modal open={showApplyConfirm} title={language === "en" ? "Confirm Retirement Plan Application" : "Xác nhận áp dụng kế hoạch hưu trí"} onClose={() => { if (!isApplying) setShowApplyConfirm(false); }}>
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
                disabled={isApplying || isSaving || previewStatus !== "ready" || !summary}
              >
                {language === "en" ? "Confirm Apply" : "Xác nhận áp dụng"}
              </Button>
            </div>
      </Modal>

      <SocialInsuranceModal
        open={showInsuranceModal}
        onClose={() => setShowInsuranceModal(false)}
        language={language === "en" ? "en" : "vi"}
        initialBenefitDate={
          v2Profile?.personal?.pensionStartMonth?.status === "KNOWN" && v2Profile.personal.pensionStartMonth.value
            ? `${v2Profile.personal.pensionStartMonth.value}-01`
            : undefined
        }
      />
    </>
  );
}
