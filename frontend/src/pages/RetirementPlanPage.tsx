import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Icon, Modal, useNotification } from "../components/ui";
import { MonthlyRetirementChart } from "../components/charts";
import { MonthlyCashflowTable } from "../components/retirement/MonthlyCashflowTable";
import { PlanVersionDrawer } from "../components/retirement/PlanVersionDrawer";
import { SocialInsuranceModal } from "../components/SocialInsuranceModal";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import type { SavedPlanVersionResult } from "../context/RetirementPlanContext";
import {
  formatVNDCurrency,
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
    lastPreviewInput,
    loadingPlans,
    plansError,
    refreshPlans,
    runPreview,
    savePlanVersion,
    applyVersion,
    replayVersion,
  } = useRetirementPlan();

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState("");
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [savedPreview, setSavedPreview] = useState<{ key: string; version: SavedPlanVersionResult } | null>(null);
  const operation = useRef(false);
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
    setPolicyError("");
    setPolicyDetail(null);
    fetchUserPortfolioPolicies(1, 1)
      .then(async (res) => {
        if (!active) return;
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(res.items[0].id);
          if (active) setPolicyDetail(detail);
        }
      })
      .catch(error => { if (active) setPolicyError(error instanceof Error ? error.message : String(error)); })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, [policyAttempt]);

  const requestedEndMonth = useMemo(() => {
    const birth = v2Profile?.personal.birthMonth;
    if (birth?.status !== "KNOWN" || !profile.goal.lifeExpectancy) return null;
    return `${Number(birth.value.slice(0, 4)) + profile.goal.lifeExpectancy}-${birth.value.slice(5, 7)}`;
  }, [v2Profile?.personal.birthMonth, profile.goal.lifeExpectancy]);

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
    const maxScenarioYear = scenarioYears.length > 0 ? Math.max(...scenarioYears) : Number(rawEndMonth.slice(0, 4));
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
    const questions = policyDetail?.data.questions || [];
    if (questions.length === 0) return false;
    if (baselineAnswers?.length && questions.every(q => baselineAnswers.some(a => a.questionId === q.id && q.choices.some(c => c.id === a.choiceId)))) return false;
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

  const inputMatches = Boolean(previewPayload && lastPreviewInput && JSON.stringify(previewPayload) === JSON.stringify(lastPreviewInput));
  const canUsePreview = inputMatches && previewStatus === "ready" && !loadingPlans && !plansError;
  const previewKey = JSON.stringify([previewPayload, lastInputHash]);
  const savedForPreview = savedPreview?.key === previewKey ? savedPreview.version : null;

  useEffect(() => { if (!canUsePreview && !operation.current) setShowApplyConfirm(false); }, [canUsePreview]);

  const handleSaveVersion = async () => {
    if (operation.current || savedForPreview || !canUsePreview || !summary || !previewData || !lastInputHash || !previewPayload) {
      notify.error(
        language === "en" ? "Cannot Save" : "Chưa thể lưu",
        language === "en" ? "Need to complete forecast preview before saving version." : "Cần hoàn tất xem trước trước khi lưu phiên bản."
      );
      return;
    }
    operation.current = true; setIsSaving(true);
    try {
      const saved = await savePlanVersion(previewPayload, lastInputHash);
      if (saved) {
        setSavedPreview({ key: previewKey, version: saved });
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
      operation.current = false;
      setIsSaving(false);
    }
  };

  const handleApplyCurrent = async () => {
    if (operation.current || !canUsePreview || !summary || !previewPayload || !lastInputHash) return;
    operation.current = true; setIsApplying(true);
    try {
      // Apply exactly the preview shown in the confirmation, never the previous current version.
      const saved = savedForPreview ?? await savePlanVersion(previewPayload, lastInputHash);
      if (!saved) throw new Error(language === "en" ? "Could not save this preview." : "Chưa lưu được bản xem trước này.");
      setSavedPreview({ key: previewKey, version: saved });
      const applied = await applyVersion(saved.id, profileRevision, saved.planId, saved.planRevision);
      if (!applied) throw new Error(language === "en" ? "Version saved but not applied. Retry from version history." : "Đã lưu phiên bản nhưng chưa áp dụng được. Thử lại từ lịch sử phiên bản.");
      notify.success(language === "en" ? "Plan applied" : "Đã áp dụng kế hoạch", language === "en" ? `Version v${saved.version} is now official.` : `Phiên bản v${saved.version} đã trở thành kế hoạch chính thức.`);
      setShowApplyConfirm(false);
    } catch (e) {
      notify.error(language === "en" ? "Unable to apply" : "Chưa thể áp dụng", e instanceof Error ? e.message : String(e));
    } finally { operation.current = false; setIsApplying(false); }
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

  const calculation = canUsePreview ? previewData?.calculation : null;
  const summary = calculation?.summary;

  // The dial always measures progress to the required fund (100%). Only the
  // drawing is clamped; keep the API's actual coverage, including negative values.
  const coverageValue = summary?.atRetirement?.coveragePercent;
  const parsedCoverage = coverageValue == null || String(coverageValue).trim() === "" ? NaN : Number(coverageValue);
  const coveragePercentRaw = Number.isFinite(parsedCoverage) ? parsedCoverage : null;
  const locale = language === "en" ? "en-US" : "vi-VN";
  const unknown = language === "en" ? "Undetermined" : "Chưa xác định";
  const coverageFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const coverageText = coveragePercentRaw === null ? unknown
    : coveragePercentRaw > 99.99 && coveragePercentRaw < 100 ? "< 100"
    : coveragePercentRaw > 100 && coveragePercentRaw < 100.01 ? "> 100"
    : coveragePercentRaw > 0 && coveragePercentRaw < 0.01 ? `< ${coverageFormatter.format(0.01)}`
    : coveragePercentRaw < 0 && coveragePercentRaw > -0.01 ? `> ${coverageFormatter.format(-0.01)}`
    : coverageFormatter.format(coveragePercentRaw);
  const hasFundingShortfall = Boolean(summary && Number(summary.retirementFundingShortfall) > 0);
  const progressRatio = Math.min(1, Math.max(0, (coveragePercentRaw ?? 0) / 100));
  const arcOffset = 100 * (1 - progressRatio);

  const tipAngleDeg = 160 + 220 * progressRatio;
  const tipAngleRad = (tipAngleDeg * Math.PI) / 180;
  const tipX = 150 + 105 * Math.cos(tipAngleRad);
  const tipY = 130 + 105 * Math.sin(tipAngleRad);

  const isAppliedPlan = Boolean(canUsePreview && lastInputHash && activePlan?.currentVersionId === currentVersion?.id && currentVersion?.preview.inputHash === lastInputHash);

  return (
    <>
      <div className="retirement-page-header">
        <div className="retirement-header-main">
          <div className="header-status-badge is-synced">
            <Icon name="chart" size="small" />
            <span>
              {isAppliedPlan && currentVersion
                ? (language === "en" ? `Official Plan v${currentVersion.version} (Active)` : `Kế hoạch chính thức v${currentVersion.version} (Đang áp dụng)`)
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
                : (language === "en" ? "No projected shortfall" : "Chưa ghi nhận thiếu hụt trong dự phóng")}
            </span>
          </div>
        </div>
      </div>

      {loadingPolicy && <p role="status">{language === "en" ? "Loading projection inputs…" : "Đang tải đầu vào dự phóng…"}</p>}
      {loadingPlans && <p role="status">{language === "en" ? "Loading saved plans…" : "Đang tải kế hoạch đã lưu…"}</p>}
      {plansError && <Alert tone="warning" title={language === "en" ? "Could not load saved plans" : "Chưa tải được kế hoạch đã lưu"} action={<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button>}>{plansError}</Alert>}
      {policyError && <Alert tone="warning" title={language === "en" ? "Could not load portfolio policy" : "Chưa tải được chính sách danh mục"} action={<Button onClick={() => setPolicyAttempt(value => value + 1)}>{language === "en" ? "Retry policy" : "Tải lại chính sách"}</Button>}>{policyError}</Alert>}
      {!loadingPolicy && !policyError && !previewPayload && (
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
      {requestedEndMonth && defaultEndMonth && defaultEndMonth < requestedEndMonth && <Alert tone="warning" title={language === "en" ? "Projection covers a shorter period" : "Dự phóng chưa bao phủ hết tuổi thọ đã chọn"}>{language === "en" ? `Your goal ends in ${requestedEndMonth}, but the published policy supports projection only through ${defaultEndMonth}. These results do not cover the remaining period.` : `Mục tiêu kéo dài đến ${requestedEndMonth}, nhưng giới hạn chính sách chỉ cho dự phóng đến ${defaultEndMonth}. Kết quả chưa bao gồm khoảng thời gian còn lại.`}</Alert>}
      {previewStatus === "loading" && <p role="status">{language === "en" ? "Calculating the selected projection period…" : "Đang tính dự phóng cho khoảng thời gian được chọn…"}</p>}
      {previewStatus === "error" && <Alert tone="danger" title={language === "en" ? "Could not calculate" : "Chưa tính được dự phóng"} action={<Button onClick={() => previewPayload && runPreview(previewPayload)}>{language === "en" ? "Retry" : "Thử lại"}</Button>}>{previewError}</Alert>}
      {/* Informative notice if using standard balanced benchmark portfolio */}
      {isUsingBenchmarkPortfolio && previewStatus === "ready" && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="info"
            title={language === "en" ? "Illustrative portfolio answers" : "Đang dùng câu trả lời tham khảo cho danh mục"}
            action={
              <Link to="/user/risk-portfolio">
                <Icon name="sparkles" size="small" /> {language === "en" ? "Personalize Strategy" : "Cá nhân hóa chiến lược"}
              </Link>
            }
          >
            {language === "en"
              ? "Missing survey answers use illustrative choices. Complete the risk assessment before relying on a personalized portfolio."
              : "Những câu chưa trả lời đang dùng lựa chọn tham khảo. Hãy hoàn tất khảo sát rủi ro để xác định danh mục theo thông tin của bạn."}
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

      {inputMatches && previewStatus === "ready" && previewWarnings.length > 0 && (
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
              {language === "en" ? "CONTRIBUTION TIMING POLICY" : "CHÍNH SÁCH ĐÓNG GÓP ĐỊNH KỲ"}
            </span>
            <h3 style={{ margin: "2px 0 0", fontSize: "15px" }}>
              {language === "en" ? "Periodic Contribution Timing" : "Thời điểm tích lũy vào quỹ"}
            </h3>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button
              variant={contributionTiming === "END_OF_MONTH" ? "primary" : "secondary"}
              size="small"
              onClick={() => setContributionTiming("END_OF_MONTH")}
              disabled={isSaving || isApplying}
              aria-pressed={contributionTiming === "END_OF_MONTH"}
            >
              {language === "en" ? "End of Month (Default)" : "Cuối mỗi tháng (Mặc định)"}
            </Button>
            <Button
              variant={contributionTiming === "START_OF_MONTH" ? "primary" : "secondary"}
              size="small"
              onClick={() => setContributionTiming("START_OF_MONTH")}
              disabled={isSaving || isApplying}
              aria-pressed={contributionTiming === "START_OF_MONTH"}
            >
              {language === "en" ? "Start of Month" : "Đầu mỗi tháng"}
            </Button>
          </div>
        </div>

        {contributionTiming === "START_OF_MONTH" && (
          <div style={{ background: "var(--color-surface-subtle)", padding: "12px", borderRadius: "var(--radius-md)", display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div>
                <label htmlFor="plan-start-funding" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                  {language === "en" ? "Available Disposable Cash at Start (VND) *" : "Thu nhập khả dụng sẵn có đầu tháng để tích lũy (VND) *"}
                </label>
                <input
                  type="number"
                  id="plan-start-funding"
                  min="0"
                  disabled={isSaving || isApplying}
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
                    disabled={isSaving || isApplying}
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
            <Alert tone="warning" title={language === "en" ? "Early Funding Required" : "Yêu cầu nguồn vốn đầu kỳ"}>
              {language === "en"
                ? "Additional disposable funds are required before the eligible contribution window opens."
                : "Cần bổ sung nguồn vốn khả dụng trước khi kỳ đóng góp đủ điều kiện bắt đầu."}
            </Alert>
          </div>
        )}

        {summary?.savingsStatus === "NO_ELIGIBLE_CONTRIBUTION_PERIOD" && (
          <div style={{ marginTop: "8px" }}>
            <Alert tone="warning" title={language === "en" ? "No Eligible Contribution Period" : "Không có kỳ đóng góp đủ điều kiện"}>
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
                Projects living cash flow of <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "..."} / month</strong> (inflation adjusted) across {summary?.retirementMonths ?? "..."} retirement months until end of {summary?.endMonth || "..."}.
              </>
            ) : (
              <>
                Dự kiến dòng tiền sinh hoạt <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "..."} / tháng</strong> (đã điều chỉnh trượt giá lạm phát) suốt {summary?.retirementMonths ?? "..."} tháng hưu trí đến hết tháng {summary?.endMonth || "..."}.
              </>
            )}
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "16px" }}>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Initial fund capital (liquid):" : "Vốn quỹ ban đầu (thanh khoản):"}</span>
              <strong>{summary ? formatVNDCurrency(summary.initialRetirementCapital) : unknown}</strong>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Overall net worth:" : "Tài sản ròng tổng thể (net worth):"}</span>
              <strong>{calculation?.netWorth != null ? formatVNDCurrency(calculation.netWorth) : unknown}</strong>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "12px" }}>
              <span style={{ color: "var(--color-text-muted)", display: "block" }}>{language === "en" ? "Projected accumulated fund (A):" : "Quỹ dự kiến tích lũy (A):"}</span>
              <strong style={{ color: "var(--color-mist-300)" }}>{summary ? formatVNDCurrency(summary.atRetirement.projectedFund) : unknown}</strong>
            </div>
          </div>

          {savedForPreview && <p role="status">{language === "en" ? `This preview is saved as v${savedForPreview.version}.` : `Bản xem trước này đã lưu thành phiên bản v${savedForPreview.version}.`}</p>}
          <div className="plan-hero-actions" style={{ marginTop: "20px" }}>
            <Button
              variant="secondary"
              size="medium"
              disabled={isSaving || isApplying || !summary || !canUsePreview || Boolean(savedForPreview)}
              onClick={handleSaveVersion}
            >
              <Icon name="check" /> {isSaving ? (language === "en" ? "Saving..." : "Đang lưu…") : (language === "en" ? "Save this version" : "Lưu phiên bản này")}
            </Button>

            <Button
              variant="primary"
              size="medium"
              disabled={isApplying || isSaving || !summary || !canUsePreview || isAppliedPlan}
              onClick={() => setShowApplyConfirm(true)}
            >
              <Icon name="target" /> {language === "en" ? "Apply to official plan" : "Áp dụng vào kế hoạch chính thức"}
            </Button>

            <Button
              variant="ghost"
              size="medium"
              onClick={() => setIsVersionDrawerOpen(true)}
              disabled={isApplying || isSaving || loadingPlans || Boolean(plansError)}
            >
              <Icon name="file-text" /> {language === "en" ? `View history (${planVersions.length} versions)` : `Xem lịch sử (${planVersions.length} bản)`}
            </Button>

            <Button
              variant="secondary"
              size="medium"
              onClick={() => setShowInsuranceModal(true)}
              disabled={isApplying || isSaving}
            >
              <Icon name="sparkles" /> {language === "en" ? "Social Insurance (BHXH)" : "Thẩm định & Ước tính BHXH"}
            </Button>
          </div>
        </div>

        <div className={`plan-progress-panel ${coveragePercentRaw === null ? "is-unknown" : hasFundingShortfall ? "is-warning" : "is-safe"}`}>
          <div className="ring-ambient-glow" />

          {/* An open path prevents the dash from wrapping into the dial's gap. */}
          <div className="plan-progress-ring">
            <svg viewBox="0 0 300 230" className="progress-ring-svg" role="img" aria-label={language === "en" ? `Fund coverage: ${coverageText}${coveragePercentRaw === null ? "" : "%"}. Target: 100%.` : `Mức bao phủ quỹ: ${coverageText}${coveragePercentRaw === null ? "" : "%"}. Mục tiêu: 100%.`}>
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
              <path
                d="M 51.33 165.91 A 105 105 0 1 1 248.67 165.91"
                className="ring-base-track"
              />

              {/* Active Gradient Arc */}
              <path
                d="M 51.33 165.91 A 105 105 0 1 1 248.67 165.91"
                pathLength="100"
                className="ring-main-arc"
                stroke={progressRatio === 0 ? "transparent" : hasFundingShortfall ? "url(#gaugeWarnGradient)" : "url(#gaugeSafeGradient)"}
                strokeDasharray="100 100"
                style={{
                  strokeDashoffset: `${arcOffset}`,
                }}
                filter="url(#gaugeGlowFilter)"
              />

              {/* Glowing Tip Marker at Current Progress */}
              {progressRatio > 0 && (
                <g className="gauge-tip-marker">
                  <circle cx={tipX} cy={tipY} r="5.5" fill="#ffffff" filter="url(#gaugeGlowFilter)" />
                  <circle cx={tipX} cy={tipY} r="3" fill={summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "#f59e0b" : "#06b6d4"} />
                </g>
              )}

              {/* Milestone labels at ends of arch */}
              <text x="51" y="193" className="gauge-milestone-text">0%</text>
              <text x="249" y="193" className="gauge-milestone-text">100%</text>
            </svg>

            <div className="ring-center-content">
              <div className="ring-number-row">
                <span className="ring-number" style={coveragePercentRaw === null || coverageText.length > 10 ? { fontSize: "min(20px, 7cqw)" } : coverageText.length > 6 ? { fontSize: "min(30px, 10cqw)" } : undefined}>
                  {coverageText}
                </span>
                {coveragePercentRaw !== null && <span className="ring-unit">%</span>}
              </div>
              <div className="ring-status-pill">
                <span>{language === "en" ? "FUND COVERAGE" : "MỨC BAO PHỦ QUỸ"}</span>
              </div>
            </div>
          </div>
          <p className="gauge-explanation">
            {language === "en" ? "100% = the required fund at retirement." : "100% = đủ quỹ cần tại thời điểm nghỉ hưu."}
            {coveragePercentRaw !== null && coveragePercentRaw > 100 && (
              <span className="gauge-multiplier-tag">{language === "en"
                ? `About ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(coveragePercentRaw / 100)} times the required fund.`
                : `Gấp khoảng ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(coveragePercentRaw / 100)} lần quỹ cần.`}</span>
            )}
          </p>

          <div className="plan-status-card">
            <div className="status-card-header">
              <span className="status-badge-indicator">
                <span className="status-pulse-dot" />
                {!summary ? unknown : parseFloat(summary.retirementFundingShortfall) > 0
                  ? (language === "en" ? "Funding Shortfall" : "Còn thiếu hụt")
                  : (language === "en" ? "No projected shortfall" : "Không thiếu hụt trong dự phóng")}
              </span>
              <strong className="status-card-amount">
                {!summary ? "—" : parseFloat(summary.retirementFundingShortfall) > 0
                  ? `-${formatVNDCurrency(summary.retirementFundingShortfall)}`
                  : `${Number(summary.excessAtRetirement) > 0 ? "+" : ""}${formatVNDCurrency(summary.excessAtRetirement)}`}
              </strong>
            </div>
            <p className="status-card-desc">
              {!summary ? (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ") : parseFloat(summary.retirementFundingShortfall) > 0
                ? summary.firstShortfallMonth
                  ? (language === "en" ? `First cash shortfall month: ${summary.firstShortfallMonth}. Additional contribution required.` : `Tháng đầu tiên thiếu hụt dòng tiền: ${summary.firstShortfallMonth}. Cần bổ sung đóng góp.`)
                  : (language === "en" ? "Increase contributions or adjust retirement spending." : "Cần tăng cường đóng góp hoặc điều chỉnh mức chi tiêu.")
                : (language === "en" ? "Result depends on the selected assumptions and projection period." : "Kết quả phụ thuộc giả định và khoảng thời gian dự phóng đã chọn.")}
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
          <strong>{summary ? formatVNDCurrency(summary.atRetirement.projectedFund) : unknown}</strong>
          <small>{language === "en" ? "Includes initial liquid capital and invested future contributions" : "Gồm vốn ban đầu thanh khoản và các khoản đóng góp tương lai đã sinh lời"}</small>
        </Card>

        <Card className="plan-metric-card tone-warning">
          <div>
            <span>{language === "en" ? "Capital Funding Gap" : "Khoảng thiếu hụt vốn"}</span>
            <Icon name="alert" />
          </div>
          <strong style={{ color: summary && parseFloat(summary.retirementFundingShortfall) > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
            {!summary ? unknown : parseFloat(summary.retirementFundingShortfall) > 0
              ? formatVNDCurrency(summary.retirementFundingShortfall)
              : (language === "en" ? "Fully Met" : "Đã đạt trọn vẹn")}
          </strong>
          <small>
            {summary?.additionalMonthlyContribution != null
              ? (language === "en" ? `Additional contribution: ${formatVNDCurrency(summary.additionalMonthlyContribution)} per month` : `Đóng góp bổ sung: ${formatVNDCurrency(summary.additionalMonthlyContribution)} mỗi tháng`)
              : (language === "en" ? "Additional contribution is not determined." : "Chưa xác định được mức đóng góp bổ sung.")}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Required Contribution / Month" : "Mức góp cần thiết / tháng"}</span>
            <Icon name="target" />
          </div>
          <strong>
            {summary?.requiredConstantMonthlyContribution != null
              ? formatVNDCurrency(summary.requiredConstantMonthlyContribution)
              : unknown}
          </strong>
          <small>
            {language === "en"
              ? "Steady contribution estimated under the selected assumptions and projection period."
              : "Mức đóng góp đều đặn ước tính theo giả định và khoảng thời gian dự phóng đã chọn."}
          </small>
        </Card>

        <Card className="plan-metric-card">
          <div>
            <span>{language === "en" ? "Accumulation Duration" : "Thời gian tích lũy"}</span>
            <Icon name="compass" />
          </div>
          <strong>{summary ? `${summary.accumulationMonths} ${language === "en" ? "months" : "tháng"}` : unknown}</strong>
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
            key={lastInputHash}
            rows={calculation.rows}
            summary={summary}
            previewData={previewData}
            isApplied={isAppliedPlan}
            planId={isAppliedPlan ? activePlan?.id : undefined}
            versionId={isAppliedPlan ? activePlan?.currentVersionId ?? undefined : undefined}
          />
        </Card>
      )}

      {/* Plan Version Drawer */}
      <PlanVersionDrawer
        isOpen={isVersionDrawerOpen}
        onClose={() => { if (!isApplying) setIsVersionDrawerOpen(false); }}
        plan={activePlan}
        versions={planVersions}
        onApplyVersion={async (vId) => {
          if (operation.current || loadingPlans || plansError) return;
          operation.current = true;
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
            operation.current = false;
            setIsApplying(false);
          }
        }}
        onReplayVersion={(vId) => replayVersion(vId)}
        isApplying={isApplying}
      />

      {/* Apply Confirmation Modal */}
      <Modal open={showApplyConfirm} title={language === "en" ? "Confirm Retirement Plan Application" : "Xác nhận áp dụng kế hoạch hưu trí"} onClose={() => { if (!isApplying) setShowApplyConfirm(false); }}>
            {savedForPreview && <p role="status">{language === "en" ? `Preview saved as v${savedForPreview.version}. Confirming applies this saved version.` : `Bản xem trước đã lưu thành v${savedForPreview.version}. Xác nhận sẽ áp dụng chính phiên bản này.`}</p>}
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
                <strong style={{ color: coveragePercentRaw === null ? "var(--color-text-muted)" : hasFundingShortfall ? "var(--color-warning)" : "var(--color-success)" }}>{coveragePercentRaw === null ? unknown : `${coverageText}%`}</strong>
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
                disabled={isApplying || isSaving || !canUsePreview || !summary}
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
