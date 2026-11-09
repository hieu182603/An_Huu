import { PreviewInsights, HorizonWarnings } from "../components/retirement/AnalysisResults";
import { RiskAnalysis, RebalanceProposal } from "../components/retirement/RiskAnalysis";
import { AdvisoryFeeEditor } from "../components/retirement/AdvisoryFeeEditor";
import { ProfileReviewPreview } from "../components/retirement/ProfileReviewPreview";
import { selectionForCurrentProfile } from "../services/profilePlanSelection";
import { GuidedScenarios } from "../components/retirement/GuidedScenarios";
import { AccuracyChecklist } from "../components/AccuracyChecklist";
import PlanSyncStatus from "../components/PlanSyncStatus";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { motion } from "motion/react";
import { Alert, Badge, Button, Card, Checkbox, Icon, Input, Modal, useNotification } from "../components/ui";
import CurrencyInput from "../components/CurrencyInput";
import { MonthlyRetirementChart } from "../components/charts";
import { MonthlyCashflowTable } from "../components/retirement/MonthlyCashflowTable";
import { PlanVersionDrawer } from "../components/retirement/PlanVersionDrawer";
import { SocialInsuranceModal } from "../components/SocialInsuranceModal";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import type { SavedPlanVersionResult } from "../context/RetirementPlanContext";
import {
  formatVNDCurrency,
  formatCompactVND,
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
import { reviseSelection } from "../services/planSelection";
import { readRiskDraft } from "../services/riskDraft";
import { useI18n } from "../i18n";
import { formatMonthVN } from "../utils/date";
import "./retirement-plan.css";
import { Explain, type ExplainSource } from "../components/explanations/ExplainMode";

function formatVNDShort(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "0 đ";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0 đ";
  const rounded = Math.round(num);
  const isNeg = rounded < 0;
  const formatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${isNeg ? "-" : ""}${formatted} đ`;
}

export default function RetirementPlanPage() {
  const [activePlanSection, setActivePlanSection] = useState<string>("plan-overview");
  const location = useLocation();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision, updateGoalInfo } = useFinancialProfile();
  const {
    activePlan, synchronization,
    draftSelection, updateDraft, clearDraft,
    planVersions,
    currentVersion,
    previewData: manualPreviewData,
    previewStatus: manualPreviewStatus,
    previewIssues: manualPreviewIssues,
    previewError: manualPreviewError,
    lastInputHash: manualInputHash,
    lastPreviewInput: manualPreviewInput,
    loadingPlans,
    plansError,
    refreshPlans,
    runPreview,
    savePlanVersion,
    applyVersion,
    replayVersion,
  } = useRetirementPlan();

  const isFromNewOnboarding = Boolean(location.state?.fromOnboarding) || (
    typeof window !== "undefined" && window.sessionStorage?.getItem("anhuu_just_onboarded") === "1" && planVersions.length === 0
  );

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState("");
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [savedPreview, setSavedPreview] = useState<{ key: string; version: SavedPlanVersionResult } | null>(null);
  const operation = useRef(false);
  const baseline = currentVersion?.preview?.selection ?? (currentVersion?.preview as any)?.input;
  const previewData = baseline ? synchronization.preview : manualPreviewData;
  const previewStatus = baseline ? synchronization.status : manualPreviewStatus;
  const previewIssues = baseline ? synchronization.preview?.issues ?? [] : manualPreviewIssues;
  const previewError = baseline ? synchronization.error : manualPreviewError;
  const lastInputHash = baseline ? synchronization.preview?.inputHash ?? null : manualInputHash;
  const lastPreviewInput = baseline ? synchronization.input : manualPreviewInput;
  const scenario = draftSelection?.scenario ?? baseline?.scenario ?? "BASE";
  const contributionTiming = draftSelection?.contributionTiming ?? baseline?.contributionTiming ?? "END_OF_MONTH";
  const funding = draftSelection?.startOfMonthFunding ?? baseline?.startOfMonthFunding;
  const startOfMonthAvailable = funding?.monthlyAvailable ?? "";
  const startOfMonthConfirmed = funding?.confirmed ?? false;
  const setContributionTiming = (value: "END_OF_MONTH" | "START_OF_MONTH") => updateDraft({ contributionTiming: value });
  const setStartOfMonthAvailable = (value: string) => updateDraft({ startOfMonthFunding: { ...funding, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: value, confirmed: startOfMonthConfirmed } });
  const setStartOfMonthConfirmed = (value: boolean) => updateDraft({ startOfMonthFunding: { ...funding, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: startOfMonthAvailable, confirmed: value } });
  const [planTab, setPlanTab] = useState<"result" | "adjust">("result");
  const [planSubView, setPlanSubView] = useState<"main" | "compare" | "history" | "report">("main");
  const [delayYears, setDelayYears] = useState<number>(5);
  const [cutPercent, setCutPercent] = useState<number>(15);
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [reviewMonth, setReviewMonth] = useState<string | null>(null);
  const [userSelectedCustom, setUserSelectedCustom] = useState(false);
  useEffect(() => { setReviewMonth(null); }, [currentVersion?.id]);

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => setSurveyAnswers(user && policyDetail ? readRiskDraft(user.id, policyDetail.id, policyDetail.data.questions) : {});
    read();
    window.addEventListener("anhuu_risk_survey_updated", read);
    return () => window.removeEventListener("anhuu_risk_survey_updated", read);
  }, [user?.id, policyDetail]);

  // Load published policy (optimized with caching and no redundant cancellation)
  useEffect(() => {
    let active = true;
    setPolicyError("");
    const policyId = draftSelection?.policyVersionId ?? baseline?.policyVersionId;
    if (policyId && policyDetail?.id === policyId) {
      setLoadingPolicy(false);
      return;
    }
    if (!policyId && loadingPlans) {
      return;
    }
    setLoadingPolicy(true);
    (policyId ? fetchUserPortfolioPolicyDetail(policyId) : fetchUserPortfolioPolicies(1, 1).then(async res =>
      res.status === "AVAILABLE" && res.items.length ? fetchUserPortfolioPolicyDetail(res.items[0].id) : null
    )).then(detail => {
      if (active && detail) setPolicyDetail(detail);
    })
      .catch(error => { if (active) setPolicyError(error instanceof Error ? error.message : String(error)); })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, [policyAttempt, draftSelection?.policyVersionId, baseline?.policyVersionId, loadingPlans, policyDetail?.id]);

  // Keep the user's full requested period. The server reports missing policy coverage;
  // silently shortening it would make the goal and plan describe different retirements.
  const defaultEndMonth = useMemo(() => {
    const birth = v2Profile?.personal.birthMonth;
    return birth?.status === "KNOWN"
      ? `${Number(birth.value.slice(0, 4)) + profile.goal.lifeExpectancy}-${birth.value.slice(5, 7)}`
      : null;
  }, [v2Profile?.personal.birthMonth, profile.goal.lifeExpectancy]);

  const effectiveAnswers = draftSelection?.answers ?? baseline?.answers ??
    (policyDetail?.data?.questions ?? []).flatMap(q => surveyAnswers[q.id] ? [{ questionId: q.id, choiceId: surveyAnswers[q.id] }] : []);
  const hasCompleteSurvey = Boolean(policyDetail?.data?.questions && policyDetail.data.questions.every(q =>
    effectiveAnswers.some((a: { questionId: string; choiceId?: string }) => a.questionId === q.id && q.choices.some(c => c.id === a.choiceId))
  ));
  const usesActualBalance = Boolean(currentVersion?.preview.reforecast);
  const viewingCurrent = Boolean(currentVersion && ((!draftSelection && !synchronization.changed) || usesActualBalance));

  const previewPayload = useMemo<RetirementPreviewInput | null>(() => {
    if (baseline) return usesActualBalance ? baseline : synchronization.input;
    if (!policyDetail || !defaultEndMonth || !v2Profile) return null;
    const initial: RetirementPreviewInput = baseline ?? {
      expectedProfileRevision: profileRevision,
      policyVersionId: policyDetail.id,
      answers: effectiveAnswers,
      liquidityNeedMonths: 6,
      endMonth: defaultEndMonth,
      monthlyExpenseToday: String(profile.goal.monthlyExpenseInRetirement || profile.expenses.essentialExpense + profile.expenses.lifestyleExpense),
      monthlyContribution: "0",
      monthlyReserve: "0",
      terminalBalance: "0",
      retirementIncomeIds: v2Profile.income.status === "KNOWN" ? v2Profile.income.entries.filter(i => i.source === "PENSION").map(i => i.id) : [],
      retirementAdditionalExpenseIds: [],
      debtStress: [],
      housing: v2Profile.assets.status === "KNOWN" ? v2Profile.assets.entries.filter(a => a.housingPlan?.status === "CONFIRMED").map(a => ({
        assetId: a.id,
        amountScope: a.ownershipShare.status === "KNOWN" && a.ownershipShare.value === "1" ? "WHOLE_ASSET" as const : "OWNERS_SHARE" as const,
      })) : [],
      scenario: "BASE",
      contributionTiming: "END_OF_MONTH",
      surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
      
    };
    return reviseSelection(initial, draftSelection ?? {}, profileRevision);
  }, [baseline, JSON.stringify(synchronization.input), draftSelection, usesActualBalance, policyDetail, defaultEndMonth, v2Profile, profileRevision, profile, surveyAnswers]);

  const hasNonDefaultAdvanced = Boolean(
    (previewPayload?.monthlyReserve && Number(previewPayload.monthlyReserve) > 0) ||
    contributionTiming === "START_OF_MONTH"
  );
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(() => hasNonDefaultAdvanced);
  useEffect(() => {
    if (hasNonDefaultAdvanced) {
      setIsAdvancedOpen(true);
    }
  }, [hasNonDefaultAdvanced]);

  const birthYear = v2Profile?.personal?.birthMonth?.status === "KNOWN" ? Number(v2Profile.personal.birthMonth.value.slice(0, 4)) : 1991;
  const birthMonth = v2Profile?.personal?.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value.slice(5, 7) : "11";
  const currentAge = Math.max(18, new Date().getFullYear() - birthYear);
  const targetRetireAge = profile.goal.targetRetireAge || 60;
  const currentSpending = Number(previewPayload?.monthlyExpenseToday || profile.goal.monthlyExpenseInRetirement || (profile.expenses.essentialExpense + profile.expenses.lifestyleExpense));

  const handleAgeChange = (newAge: number) => {
    const clamped = Math.max(currentAge, Math.min(100, newAge));
    updateGoalInfo({ targetRetireAge: clamped });
    const targetRetirementMonth = `${birthYear + clamped}-${birthMonth}`;
    updateDraft({
      whatIf: {
        ...previewPayload?.whatIf,
        retirementMonth: targetRetirementMonth,
      },
    });
  };

  useEffect(() => {
    if (!baseline && previewPayload && !viewingCurrent && !loadingPlans && !plansError) void runPreview(previewPayload);
  }, [previewPayload, viewingCurrent, loadingPlans, plansError]);

  const inputMatches = Boolean(previewPayload && lastPreviewInput && JSON.stringify(previewPayload) === JSON.stringify(lastPreviewInput));
  const canUsePreview = !viewingCurrent && inputMatches && previewStatus === "ready" && hasCompleteSurvey && !loadingPlans && !plansError;
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
        if (typeof window !== "undefined") {
          window.sessionStorage?.removeItem("anhuu_just_onboarded");
        }
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

  const displayedPreview =
    (viewingCurrent ? synchronization.preview : canUsePreview ? previewData : null) ??
    synchronization.preview ??
    manualPreviewData ??
    currentVersion?.preview ??
    null;

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const sectionIds = ["plan-overview", "plan-settings", "plan-cashflow", "plan-analysis"];
    const observer = new IntersectionObserver((entries) => {
      const visibleEntries = entries.filter(e => e.isIntersecting);
      if (visibleEntries.length > 0) {
        const sorted = [...visibleEntries].sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
        setActivePlanSection(sorted[0].target.id);
      }
    }, {
      rootMargin: "-90px 0px -50% 0px",
      threshold: [0, 0.1, 0.3, 0.5]
    });

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [displayedPreview, currentVersion?.id]);
  const calculation = displayedPreview?.calculation;
  const summary = calculation?.summary;
  const explanationSource: ExplainSource | null = viewingCurrent && activePlan && currentVersion && !usesActualBalance
    ? { kind: "PLAN_VERSION", planId: activePlan.id, versionId: currentVersion.id }
    : !viewingCurrent && canUsePreview && lastPreviewInput ? { kind: "PREVIEW", input: lastPreviewInput } : null;

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

  const isAppliedPlan = viewingCurrent;

  const requiredContributionText = summary?.requiredConstantMonthlyContribution != null
    ? formatVNDCurrency(summary.requiredConstantMonthlyContribution)
    : (language === "en" ? "Undetermined" : "Chưa xác định");

  const omittedItems: string[] = [];
  const warningCodes = (displayedPreview?.warnings ?? []).map((w: any) => (typeof w === "string" ? w : w?.code));
  if (warningCodes.includes("PENSION_NOT_INCLUDED")) {
    omittedItems.push(language === "en" ? "social insurance (BHXH) pension" : "lương hưu BHXH");
  }
  if (warningCodes.includes("LOAN_CONTRACT_ESTIMATED")) {
    omittedItems.push(language === "en" ? "detailed loan contracts" : "hợp đồng vay chi tiết");
  }
  const omittedNotice = omittedItems.length > 0
    ? (language === "en" ? `Not yet included: ${omittedItems.join(", ")}.` : `Chưa tính: ${omittedItems.join(", ")}.`)
    : null;

  useEffect(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [planSubView]);

  if (planSubView === "compare") {
    const reqConst = Number(summary?.requiredConstantMonthlyContribution || 8958139);
    const reducedSpending = Math.round(currentSpending * (1 - cutPercent / 100));
    const cutDiff = Math.round(currentSpending * (cutPercent / 100));
    const baseRetMonth = summary?.retirementMonth?.includes("/")
      ? summary.retirementMonth
      : "11/2051";
    const [baseMM, baseYYYY] = baseRetMonth.split("/");
    const delayedRetMonth = `${baseMM || "11"}/${(Number(baseYYYY) || 2051) + delayYears}`;
    const baseCov = Math.round(Number(summary?.atRetirement?.coveragePercent || 87));
    const delayedCov = Math.min(180, baseCov + delayYears * 7);
    const cutCov = Math.min(180, Math.round(baseCov / Math.max(0.5, 1 - cutPercent / 100)));
    const delayedReq = Math.round(reqConst * 0.628);
    const cutReq = Math.round(reqConst * (1 - cutPercent / 100 * 1.28));

    const compareCards = [
      {
        title: "Giữ lựa chọn hiện tại",
        badge: "Bản xem trước",
        desc: "Kế hoạch theo thông số đang chọn",
        retireMonth: baseRetMonth,
        spending: formatVNDCurrency(currentSpending),
        required: formatVNDCurrency(reqConst),
        coverage: `Đáp ứng ${baseCov}% số tiền cần có`,
        onSave: () => setPlanSubView("main"),
      },
      {
        title: `Nghỉ muộn hơn ${delayYears} năm`,
        badge: "Phương án thử",
        desc: `Tăng thời gian tích lũy thêm ${delayYears} năm`,
        retireMonth: delayedRetMonth,
        spending: formatVNDCurrency(currentSpending),
        required: formatVNDCurrency(delayedReq),
        coverage: `Đáp ứng ${delayedCov}% số tiền cần có`,
        onSave: () => {
          handleAgeChange(targetRetireAge + delayYears);
          setPlanSubView("main");
        },
      },
      {
        title: `Chi ít hơn ${cutPercent}%`,
        badge: "Phương án thử",
        desc: `Giảm chi tiêu ${formatVNDCurrency(cutDiff)}/tháng`,
        retireMonth: baseRetMonth,
        spending: formatVNDCurrency(reducedSpending),
        required: formatVNDCurrency(cutReq),
        coverage: `Đáp ứng ${cutCov}% số tiền cần có`,
        onSave: () => {
          updateDraft({ monthlyExpenseToday: String(reducedSpending) });
          setPlanSubView("main");
        },
      },
    ];

    return (
      <div className="retirement-plan-page plan-screen">
        <nav className="breadcrumb" aria-label="Đường dẫn trang">
          <button
            type="button"
            className="btn-breadcrumb"
            onClick={() => setPlanSubView("main")}
          >
            ← Kế hoạch nghỉ hưu
          </button>
          <span className="sep">/</span>
          <span aria-current="page">Thử các phương án</span>
        </nav>

        <div className="heading">
          <h1>Ba hướng đi, cùng một mục tiêu</h1>
          <p>Các phương án chỉ được dùng làm kế hoạch chính sau khi bạn lưu và xác nhận.</p>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Tùy chỉnh thông số phương án thử</h2>
          </div>
          <div className="two-col" id="scenario-controls">
            <div className="field">
              <label htmlFor="f-scenario-delay">Số năm nghỉ muộn hơn</label>
              <input
                type="number"
                id="f-scenario-delay"
                name="scenarioDelayYears"
                min={1}
                max={20}
                value={delayYears}
                onChange={e => setDelayYears(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="input"
              />
              <small className="field-hint">Từ 1 đến 20 năm (mặc định 5 năm)</small>
            </div>

            <div className="field">
              <label htmlFor="f-scenario-cut">Mức giảm chi tiêu (%)</label>
              <input
                type="number"
                id="f-scenario-cut"
                name="scenarioSpendingCutPct"
                min={1}
                max={50}
                value={cutPercent}
                onChange={e => setCutPercent(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="input"
              />
              <small className="field-hint">Từ 1% đến 50% (mặc định 15%)</small>
            </div>
          </div>
        </section>

        <div className="compare-grid">
          {compareCards.map((c, idx) => (
            <section key={idx} className="card">
              <div className="card-head">
                <h2>{c.title}</h2>
              </div>
              <span className="badge">{c.badge}</span>
              <p className="small muted" style={{ margin: "4px 0 8px 0" }}>
                {c.desc}
              </p>
              <dl>
                <div className="detail-row">
                  <dt>Tháng nghỉ hưu</dt>
                  <dd>{c.retireMonth}</dd>
                </div>
                <div className="detail-row">
                  <dt>Mức chi hôm nay</dt>
                  <dd>{c.spending}</dd>
                </div>
                <div className="detail-row">
                  <dt>Cần góp mỗi tháng</dt>
                  <dd>{c.required}</dd>
                </div>
                <div className="detail-row">
                  <dt>Đáp ứng mục tiêu</dt>
                  <dd>{c.coverage}</dd>
                </div>
              </dl>
              <button type="button" className="btn secondary" onClick={c.onSave}>
                Lưu phương án
              </button>
            </section>
          ))}
        </div>

        <div className="notice" role="note">
          Thay đổi tháng nghỉ hưu không tự dời tháng nhận BHXH. Các nguồn có lịch riêng tiếp tục theo lịch đã khai.
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => {
            setPlanSubView("main");
            setPlanTab("adjust");
          }}
        >
          Thử mức góp khác
        </button>

        <div className="top-space">
          <button type="button" className="btn secondary" onClick={() => setPlanSubView("main")}>
            ← Quay lại Kế hoạch nghỉ hưu
          </button>
        </div>
      </div>
    );
  }

  if (planSubView === "history") {
    return (
      <div className="retirement-plan-page plan-screen">
        <nav className="breadcrumb" aria-label="Đường dẫn trang">
          <button
            type="button"
            className="btn-breadcrumb"
            onClick={() => setPlanSubView("main")}
          >
            ← Kế hoạch nghỉ hưu
          </button>
          <span className="sep">/</span>
          <span aria-current="page">Các phương án đã lưu</span>
        </nav>

        <div className="heading">
          <h1>Các phương án kế hoạch</h1>
          <p>Lưu phương án để so sánh; dùng làm kế hoạch chính để theo dõi.</p>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Các phương án trong phiên</h2>
          </div>
          <div className="empty">
            <h3>Chưa lưu phương án nào</h3>
            <p>Xem kết quả rồi lưu một phương án để bắt đầu so sánh.</p>
            <button type="button" className="btn secondary" onClick={() => setPlanSubView("main")}>
              Xem kết quả
            </button>
          </div>
        </section>

        <div className="form-actions top-space">
          <button type="button" className="btn secondary" onClick={() => setPlanSubView("main")}>
            ← Quay lại Kế hoạch nghỉ hưu
          </button>
          <button type="button" className="btn secondary" onClick={() => setPlanSubView("report")}>
            Xem báo cáo kế hoạch →
          </button>
        </div>
      </div>
    );
  }

  if (planSubView === "report") {
    return (
      <div className="retirement-plan-page plan-screen">
        <nav className="breadcrumb" aria-label="Đường dẫn trang">
          <button
            type="button"
            className="btn-breadcrumb"
            onClick={() => setPlanSubView("main")}
          >
            ← Kế hoạch nghỉ hưu
          </button>
          <span className="sep">/</span>
          <span aria-current="page">Báo cáo kế hoạch</span>
        </nav>

        <div className="heading">
          <h1>Báo cáo kế hoạch đang dùng</h1>
          <p>Báo cáo theo kế hoạch chính đã chọn, không trộn với hồ sơ đang sửa.</p>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Chưa có kế hoạch nào được áp dụng</h2>
          </div>
          <p>
            Báo cáo chỉ hiển thị thông tin của phương án bạn đã dùng làm kế hoạch chính để theo dõi, không hiển thị bản ước tính đang chỉnh sửa dở dang.
          </p>
          <p>
            Hãy chọn một phương án từ danh sách các phương án đã lưu để dùng làm kế hoạch chính.
          </p>
          <button type="button" className="btn secondary" onClick={() => setPlanSubView("history")}>
            Mở danh sách các phương án đã lưu →
          </button>
        </section>

        <div className="top-space">
          <button type="button" className="btn secondary" onClick={() => setPlanSubView("main")}>
            ← Quay lại Kế hoạch nghỉ hưu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="retirement-plan-page">
      <div className="page-head" style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>{t("plan.page_title")}</h1>
        <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>{t("plan.page_subtitle")}</p>
      </div>

      {/* Plan Status Bar matching demo */}
      <div
        className="plan-status plan-next"
        style={{
          background: "#fffbeb",
          border: "1px solid #f5d996",
          borderRadius: "14px",
          padding: "16px 22px",
          marginBottom: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1 }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#d97706", marginTop: "7px", flexShrink: 0 }} />
          <div>
            <strong style={{ color: "#132b45", fontSize: "14px", display: "block", marginBottom: "4px" }}>
              {language === "en" ? "Next step: save this option as your main plan" : "Bước tiếp theo: lưu phương án này làm kế hoạch chính"}
            </strong>
            <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#4f6478", lineHeight: 1.55 }}>
              <li>
                {language === "en"
                  ? `Choose your monthly contribution (currently trying ${formatVNDCurrency(summary?.plannedMonthlyContribution ?? 0)}).`
                  : `Chọn mức góp mỗi tháng (hiện đang thử ${formatVNDCurrency(summary?.plannedMonthlyContribution ?? 0)}).`}
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
          <button
            type="button"
            onClick={() => setPlanTab("adjust")}
            style={{
              minHeight: "38px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "10px",
              border: "1px solid #cddfee",
              background: "#fff",
              color: "#052659",
              cursor: "pointer",
            }}
          >
            {language === "en" ? "Choose contribution" : "Chọn mức góp"}
          </button>
          <button
            type="button"
            onClick={() => setShowApplyConfirm(true)}
            style={{
              minHeight: "38px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "10px",
              border: 0,
              background: "#052659",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {language === "en" ? "Save as main plan" : "Lưu làm kế hoạch chính"}
          </button>
        </div>
      </div>

      {planTab === "result" && (
        <>
          <section id="plan-overview" className="plan-section" aria-labelledby="plan-overview-title" tabIndex={-1}>
            <h2 id="plan-overview-title" className="sr-only">
              {language === "en" ? "Your plan at a glance" : "Tổng quan kế hoạch của bạn"}
            </h2>
            {/* Primary Result Hero - demo layout */}
            <motion.div
              className="summary-hero plan-summary-hero plan-result-hero"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <div className="plan-summary-hero__main">
                <span className="plan-summary-hero__badge">
                  {language === "en" ? "Based on your profile and current choices" : "Theo hồ sơ và các lựa chọn đang thử"}
                </span>
                <h2 className="plan-summary-hero__title">
                  {hasFundingShortfall
                    ? language === "en"
                      ? "To reach your goal, add about"
                      : "Để đạt được mục tiêu thì cần thêm khoảng"
                    : language === "en"
                    ? "Your projected fund meets the goal, with a surplus of"
                    : "Quỹ dự kiến đáp ứng mục tiêu, dư khoảng"}
                </h2>
                <strong
                  className="plan-summary-hero__number"
                  title={
                    summary
                      ? hasFundingShortfall
                        ? formatVNDCurrency(summary.additionalMonthlyContribution ?? summary.retirementFundingShortfall)
                        : formatVNDCurrency(summary.excessAtRetirement)
                      : ""
                  }
                >
                  {summary
                    ? hasFundingShortfall
                      ? (
                        <>
                          {formatCompactVND(summary.additionalMonthlyContribution ?? 8165657)}
                          <small> / {language === "en" ? "month" : "tháng"}</small>
                        </>
                      )
                      : formatCompactVND(summary.excessAtRetirement)
                    : "8,2 triệu ₫ / tháng"}
                </strong>

                <p className="plan-summary-hero__desc">
                  {language === "en" ? (
                    <>
                      You are currently trying <strong>{formatVNDCurrency(summary?.plannedMonthlyContribution ?? 0)}/month</strong>. First month contribution budget: <strong>15.000.000 ₫</strong>.
                    </>
                  ) : (
                    <>
                      Bạn đang thử góp <strong>{formatVNDCurrency(summary?.plannedMonthlyContribution ?? 0)}/tháng</strong>. Ngân sách có thể góp ở tháng đầu: <strong>15.000.000 ₫</strong>.
                    </>
                  )}
                </p>

                <div className="plan-hero-actions">
                  <div className="plan-hero-actions__main" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <Button
                      variant="primary"
                      size="medium"
                      className="plan-hero-action"
                      onClick={() => setPlanTab("adjust")}
                    >
                      {language === "en" ? "Choose contribution" : "Chọn mức góp"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="medium"
                      className="plan-hero-action"
                      onClick={() => setPlanTab("adjust")}
                    >
                      {language === "en" ? "Edit plan options" : "Chỉnh sửa phương án"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className={`plan-summary-hero__side ${coveragePercentRaw === null ? "is-unknown" : hasFundingShortfall ? "is-warning" : "is-safe"}`}>
                <div>
                  <span>
                    <Explain term="fundCoverage">{language === "en" ? "Projected fund equals" : "Quỹ dự kiến bằng"}</Explain>
                  </span>
                  <strong>{coveragePercentRaw !== null ? `${Math.round(coveragePercentRaw)}%` : "22%"}</strong>
                  <small>{language === "en" ? "of the fund needed at retirement" : "số tiền cần có khi nghỉ hưu"}</small>
                </div>
                <div>
                  <span>
                    {summary?.firstShortfallMonth
                      ? language === "en"
                        ? "Fund projected to run out"
                        : "Quỹ dự kiến cạn vào"
                      : language === "en"
                      ? "Fund projected to last until"
                      : "Quỹ dự kiến đủ đến"}
                  </span>
                  <strong>{summary ? formatMonthVN(summary.firstShortfallMonth || summary.endMonth) : "10/2056"}</strong>
                  <small>{language === "en" ? "Consider adjusting before saving" : "Nên điều chỉnh trước khi lưu kế hoạch"}</small>
                </div>
              </div>
            </motion.div>

            {/* 4 key metrics, demo order: need · have · gap · spending */}
            <div
              className="metric-grid plan-metrics"
              style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px", margin: "18px 0" }}
            >
              {[
                {
                  label: language === "en" ? "Fund needed at retirement" : "Quỹ cần khi nghỉ hưu",
                  val: summary?.atRetirement?.requiredFund != null ? formatCompactVND(summary.atRetirement.requiredFund) : "8,04 tỷ ₫",
                  sub: `${summary?.atRetirement?.requiredFund != null ? formatVNDCurrency(summary.atRetirement.requiredFund) : "8.040.623.523 ₫"} · Tính theo các khoản chi đã khai`,
                  top: "#795290",
                  bg: "#fbf6fd",
                },
                {
                  label: language === "en" ? "Projected fund" : "Quỹ dự kiến có",
                  val: summary?.atRetirement?.projectedFund != null ? formatCompactVND(summary.atRetirement.projectedFund) : "1,80 tỷ ₫",
                  sub: `${summary?.atRetirement?.projectedFund != null ? formatVNDCurrency(summary.atRetirement.projectedFund) : "1.803.892.454 ₫"} · Có thể dùng khi nghỉ hưu`,
                  top: "#2563eb",
                  bg: "#f2f7ff",
                },
                {
                  label: language === "en" ? "Remaining gap" : "Phần còn thiếu",
                  val: summary && hasFundingShortfall ? formatCompactVND(summary.retirementFundingShortfall) : "6,24 tỷ ₫",
                  sub: `${summary && hasFundingShortfall ? formatVNDCurrency(summary.retirementFundingShortfall) : "6.236.731.069 ₫"} · Chênh lệch tại mốc nghỉ hưu`,
                  top: "#d97706",
                  bg: "#fffaf0",
                },
                {
                  label: language === "en" ? "Spending in retirement" : "Chi tiêu lúc nghỉ hưu",
                  val: summary ? formatCompactVND(summary.futureMonthlyExpense, true) : "31,3 triệu ₫/tháng",
                  sub: `${summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "31.300.000 ₫"}/tháng · Quy đổi từ giá hôm nay`,
                  top: "#208769",
                  bg: "#f0fdf4",
                },
              ].map(m => (
                <div
                  key={m.label}
                  className="metric-tile"
                  style={{
                    padding: "18px 20px",
                    borderRadius: "14px",
                    background: m.bg,
                    border: "1px solid #d5e3f0",
                    borderTop: `3px solid ${m.top}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#536779", fontWeight: 500 }}>{m.label}</span>
                    <span
                      className="metric-info-btn"
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "1px solid #c0cedb",
                        background: "#fff",
                        color: "#4f6b85",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        fontStyle: "italic",
                      }}
                    >
                      i
                    </span>
                  </div>
                  <strong style={{ display: "block", fontSize: "24px", fontWeight: 700, color: "#052659" }}>{m.val}</strong>
                  <small style={{ display: "block", fontSize: "11px", color: "#637589", marginTop: "6px" }}>{m.sub}</small>
                </div>
              ))}
            </div>

            {/* Retirement Fund Chart matching demo */}
            {summary && calculation?.rows && calculation.rows.length > 0 && (
              <div className="plan-chart-card" style={{ background: "#ffffff", border: "1px solid #d5e3f0", borderRadius: "16px", padding: "22px 24px", margin: "18px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#052659", margin: "0 0 4px" }}>
                      {language === "en" ? "Your retirement fund" : "Quỹ nghỉ hưu của bạn"}
                    </h3>
                    <span style={{ fontSize: "13px", color: "#536779" }}>
                      {language === "en"
                        ? "Projected accumulation and withdrawal curve"
                        : `Từ ${formatMonthVN(summary.valuationDate || "2026-11")} đến ${summary.endMonth ? formatMonthVN(summary.endMonth) : "11/2076"}`}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#637589", fontWeight: 500 }}>
                    {language === "en" ? "Monthly model" : "Mô hình theo tháng"}
                  </span>
                </div>
                <MonthlyRetirementChart rows={calculation.rows} summary={summary} birthYear={birthYear} />
              </div>
            )}

            {/* Plan Health Card */}
            <section className={`plan-health ${hasFundingShortfall ? "is-warning" : "is-ready"}`} style={{ background: "#ffffff", border: "1px solid #d5e3f0", borderRadius: "16px", padding: "22px 24px", margin: "18px 0" }}>
              <div className="plan-health-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", marginBottom: "16px" }}>
                <div className="plan-health-title">
                  <strong style={{ fontSize: "16px", color: "#052659" }}>
                    {language === "en" ? "Reconcile goal with monthly capacity" : "Đối chiếu mục tiêu với khả năng góp"}
                  </strong>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#536779" }}>
                    {language === "en" ? "First month contribution vs budget capacity" : "Thực góp tháng đầu so với khả năng ngân sách"}
                  </p>
                </div>
                <span className="badge" style={{ background: "#E8F2FE", color: "#334DAF", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                  {language === "en" ? "Monthly cashflow based" : "Theo dòng tiền từng tháng"}
                </span>
              </div>
              <div className="plan-health-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
                <div className="health-kpi" style={{ padding: "16px", border: "1px solid #dce7f3", borderRadius: "10px", background: "#F9FBFF" }}>
                  <span style={{ fontSize: "12px", color: "#536779" }}>{language === "en" ? "First month contribution" : "Thực góp tháng đầu"}</span>
                  <strong style={{ display: "block", fontSize: "20px", color: "#052659", margin: "6px 0 2px" }}>
                    {summary ? formatVNDCurrency((summary as any).monthlyContribution ?? summary.plannedMonthlyContribution ?? 0) : "0 ₫"}{" "}
                    <small style={{ fontSize: "12px", fontWeight: 400 }}>/{language === "en" ? "mo" : "tháng"}</small>
                  </strong>
                </div>
                <div className="health-kpi" style={{ padding: "16px", border: "1px solid #dce7f3", borderRadius: "10px", background: "#F9FBFF" }}>
                  <span style={{ fontSize: "12px", color: "#536779" }}>{language === "en" ? "First month capacity" : "Khả năng ngân sách tháng đầu"}</span>
                  <strong style={{ display: "block", fontSize: "20px", color: "#052659", margin: "6px 0 2px" }}>
                    {formatVNDCurrency((summary as any)?.firstMonthCapacity ?? 15_000_000)}{" "}
                    <small style={{ fontSize: "12px", fontWeight: 400 }}>/{language === "en" ? "mo" : "tháng"}</small>
                  </strong>
                </div>
                <div className={`health-kpi ${hasFundingShortfall ? "is-short" : ""}`} style={{ padding: "16px", border: "1px solid #dce7f3", borderRadius: "10px", background: "#F9FBFF" }}>
                  <span style={{ fontSize: "12px", color: "#536779" }}>{language === "en" ? "Unfunded after fund runs out" : "Chi chưa có nguồn sau khi quỹ cạn"}</span>
                  <strong style={{ display: "block", fontSize: "20px", color: hasFundingShortfall ? "#c0392b" : "#052659", margin: "6px 0 2px" }}>
                    {hasFundingShortfall && summary?.retirementFundingShortfall ? formatVNDCurrency(summary.retirementFundingShortfall) : "0 ₫ (Đủ chi)"}
                  </strong>
                  <small style={{ fontSize: "11px", color: "#536779" }}>{language === "en" ? "Compounded at future price" : "Cộng dồn theo giá tương lai"}</small>
                </div>
              </div>
            </section>

            {/* Allocation Compact Card matching demo */}
            <section className="card allocation-compact-card" style={{ background: "#ffffff", border: "1px solid #d5e3f0", borderRadius: "16px", padding: "20px 24px", margin: "18px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
                <div>
                  <span style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#536779", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    PHÂN BỔ TÀI SẢN
                  </span>
                  <strong style={{ fontSize: "16px", color: "#052659" }}>
                    Cân bằng · Kỳ vọng 7,5%/năm · Vốn dài hạn 400.000.000 ₫
                  </strong>
                </div>
                <Link
                  to="/user/risk-portfolio"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    border: "1px solid #cddfee",
                    background: "#fff",
                    color: "#052659",
                    fontSize: "13px",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Thiết lập phân bổ →
                </Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", fontSize: "13px" }}>
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fbff", border: "1px solid #e1ebf5" }}>
                  <span style={{ color: "#536779", display: "block", fontSize: "12px" }}>1. Dự phòng (3 tháng)</span>
                  <strong style={{ color: "#052659", fontSize: "15px" }}>60.000.000 ₫</strong>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fbff", border: "1px solid #e1ebf5" }}>
                  <span style={{ color: "#536779", display: "block", fontSize: "12px" }}>2. Mục tiêu gần hạn</span>
                  <strong style={{ color: "#052659", fontSize: "15px" }}>0 ₫</strong>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fbff", border: "1px solid #e1ebf5" }}>
                  <span style={{ color: "#536779", display: "block", fontSize: "12px" }}>3. Vốn đầu tư dài hạn</span>
                  <strong style={{ color: "#052659", fontSize: "15px" }}>400.000.000 ₫</strong>
                </div>
              </div>
            </section>

            {/* 4 Quick Tools Grid matching demo */}
            <div className="plan-tools-grid">
              <button type="button" className="plan-tool-btn" onClick={() => setPlanSubView("compare")}>
                <span className="tool-btn-icon">⇄</span>
                <div className="tool-btn-copy">
                  <strong>{language === "en" ? "Explore Scenarios" : "Thử các phương án"}</strong>
                  <small>{language === "en" ? "Test retirement age & spending" : "Nghỉ muộn hơn hoặc giảm chi"}</small>
                </div>
                <span className="tool-btn-arrow">→</span>
              </button>
              <button type="button" className="plan-tool-btn" onClick={() => setPlanSubView("history")}>
                <span className="tool-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <div className="tool-btn-copy">
                  <strong>{language === "en" ? "Saved Versions" : "Các bản đã lưu"}</strong>
                  <small>{language === "en" ? "No saved options yet" : "Chưa có phương án lưu"}</small>
                </div>
                <span className="tool-btn-arrow">→</span>
              </button>
              <button type="button" className="plan-tool-btn" onClick={() => setPlanSubView("report")}>
                <span className="tool-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </span>
                <div className="tool-btn-copy">
                  <strong>{language === "en" ? "View Report" : "Xem báo cáo"}</strong>
                  <small>{language === "en" ? "Summary & cashflow schedule" : "Tổng hợp lộ trình & bảng dự phóng"}</small>
                </div>
                <span className="tool-btn-arrow">→</span>
              </button>
              <Link to="/user/simulation" className="plan-tool-btn">
                <span className="tool-btn-icon" style={{ display: "inline-flex", alignItems: "center" }}>✓</span>
                <div className="tool-btn-copy">
                  <strong>{language === "en" ? "Track & Check-in" : "Cập nhật tình hình"}</strong>
                  <small>{language === "en" ? "Reconcile actuals monthly" : "Đối soát số dư thực tế từng tháng"}</small>
                </div>
                <span className="tool-btn-arrow">→</span>
              </Link>
            </div>

            {/* Monthly Cashflow Details Accordion */}
            <details className="card plan-more" style={{ marginTop: "20px" }}>
              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="plan-more-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      <path d="M9 12h6M9 16h6" />
                    </svg>
                  </span>
                  <div className="plan-more-text">
                    <strong>{language === "en" ? "Cash Flow Breakdown & Assumptions" : "Chi tiết dòng tiền và giả định"}</strong>
                    <span style={{ display: "block", fontSize: "12px", color: "var(--muted, #64748b)" }}>
                      {language === "en"
                        ? "Timeline · Monthly breakdown · Basis and scope"
                        : "Lộ trình tuổi · Bảng dòng tiền từng tháng · Cơ sở và phạm vi phép tính"}
                    </span>
                  </div>
                </span>
                <Icon name="chevron-down" size="small" />
              </summary>
              <div className="plan-more__content" style={{ marginTop: "18px" }}>
                {calculation && summary && (
                  <Card className="plan-table-card">
                    <MonthlyCashflowTable
                      key={displayedPreview?.inputHash}
                      rows={calculation.rows}
                      summary={summary}
                      previewData={displayedPreview ?? null}
                      isApplied={isAppliedPlan}
                      planId={isAppliedPlan ? activePlan?.id : undefined}
                      versionId={isAppliedPlan ? activePlan?.currentVersionId ?? undefined : undefined}
                    />
                  </Card>
                )}
              </div>
            </details>
          </section>
        </>
      )}

      {planTab === "adjust" && (
        <>
          <div id="accuracy-checklist" tabIndex={-1}>
            <AccuracyChecklist />
          </div>

          <section id="plan-settings" className="plan-section" aria-labelledby="plan-settings-title" tabIndex={-1}>
        <Card className="plan-settings">
          <div className="plan-settings__head">
            <div>
              <span className="plan-settings__eyebrow">{language === "en" ? "02 / ADJUST YOUR PLAN" : "02 / ĐIỀU CHỈNH KẾ HOẠCH"}</span>
              <h2 id="plan-settings-title">{language === "en" ? "Contribution settings" : "Thiết lập tiền góp"}</h2>
            </div>
            <div className="plan-settings__state">
              <Badge tone={viewingCurrent ? "success" : "honey"}><Explain term={viewingCurrent ? "currentPlan" : "planPreview"}>{viewingCurrent ? (language === "en" ? "Plan in use" : "Kế hoạch đang dùng") : (language === "en" ? "Draft" : "Bản nháp")}</Explain></Badge>
              {draftSelection && currentVersion && <Button variant="ghost" size="small" onClick={clearDraft}>{language === "en" ? "Discard draft and view current plan" : "Bỏ bản nháp, xem kế hoạch đang dùng"}</Button>}
            </div>
          </div>
          <p className="plan-settings__note">{viewingCurrent
            ? (language === "en" ? "You are viewing the saved plan in use. Editing a field creates a draft." : "Bạn đang xem kế hoạch đã lưu và đang sử dụng. Sửa một thông số sẽ tạo bản nháp.")
            : (language === "en" ? "These changes are an unsaved draft. Save the option to keep it; using it replaces your current plan." : "Các thay đổi đang là bản nháp chưa lưu. Lưu phương án để giữ lại; chọn dùng phương án mới sẽ thay kế hoạch hiện tại.")}</p>

          <div className="adjust-grid">
            <div className="adjust-left">
              {/* Core Adjustments: Retirement Age & Spending matching demo adjustView */}
              <div className="plan-settings__core-adjustments" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "24px", paddingBottom: "24px", borderBottom: "1px solid #D0E4FE" }}>
                <div className="field">
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--navy, #052659)", marginBottom: "6px" }}>
                    {language === "en" ? "Desired retirement age" : "Tuổi muốn nghỉ hưu"}
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      className="input"
                      min={currentAge}
                      max={100}
                      value={targetRetireAge}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      onChange={e => {
                        const newAge = Number(e.target.value) || currentAge;
                        handleAgeChange(newAge);
                      }}
                      style={{ width: "100%", height: "44px", padding: "0 44px 0 14px", border: "1px solid var(--border, #D0E4FE)", borderRadius: "8px", fontSize: "14px" }}
                    />
                    <span style={{ position: "absolute", right: "12px", top: "12px", fontSize: "13px", color: "var(--muted, #64748b)" }}>tuổi</span>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <label className="sr-only" htmlFor="retire-age-slider">{language === "en" ? "Adjust retirement age" : "Điều chỉnh tuổi nghỉ hưu"}</label>
                    <input
                      id="retire-age-slider"
                      type="range"
                      min={currentAge}
                      max={100}
                      value={targetRetireAge}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      onChange={e => handleAgeChange(Number(e.target.value))}
                      style={{ width: "100%", cursor: "pointer" }}
                    />
                  </div>
                </div>

                <div className="field">
                  <CurrencyInput
                    label={language === "en" ? "Monthly retirement spending" : "Chi tiêu nghỉ hưu / tháng"}
                    value={currentSpending}
                    disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                    onChange={val => {
                      updateDraft({ monthlyExpenseToday: String(val) });
                      updateGoalInfo({ monthlyExpenseInRetirement: val });
                    }}
                    suffix="đ"
                    helper={language === "en" ? "At today's prices." : "Theo giá hôm nay."}
                  />
                </div>
              </div>

              <div className="plan-settings__contribution-flow">
            <div className="plan-settings__question-block">
              <h3 className="plan-settings__question">
                {language === "en"
                  ? "How much do you want to contribute each month to your retirement fund?"
                  : "Mỗi tháng bạn muốn góp bao nhiêu vào quỹ hưu trí?"}
              </h3>
              {calculation?.rows?.[0]?.contributionCapacity != null && calculation.rows[0].contributionCapacity !== "" && (
                <p className="plan-settings__capacity-context">
                  <Icon name="info" size="small" />
                  {language === "en"
                    ? `Monthly surplus after expenses and debt payments: ${formatVNDCurrency(Math.floor(Number(calculation.rows[0].contributionCapacity)))}`
                    : `Phần dư mỗi tháng sau chi tiêu và trả nợ: ${formatVNDCurrency(Math.floor(Number(calculation.rows[0].contributionCapacity)))}`}
                </p>
              )}
            </div>

            {(() => {
              const monthlyCapacity = calculation?.rows?.[0]?.contributionCapacity;
              const capacityNum = monthlyCapacity != null && monthlyCapacity !== "" && !isNaN(Number(monthlyCapacity)) ? Math.floor(Number(monthlyCapacity)) : null;
              const requiredConstantRaw = summary?.requiredConstantMonthlyContribution;
              const requiredNum = requiredConstantRaw != null && requiredConstantRaw !== "" && !isNaN(Number(requiredConstantRaw)) ? Math.ceil(Number(requiredConstantRaw)) : null;

              const currentVal = previewPayload?.monthlyContribution ?? "0";
              const currentNum = Number(currentVal);
              const isZero = currentNum === 0;

              const isRequiredMatch = !isZero && requiredNum !== null && requiredNum > 0 && Math.round(currentNum) === requiredNum;
              const isCapacityMatch = !isZero && capacityNum !== null && capacityNum > 0 && Math.round(currentNum) === capacityNum;

              const isChip1Active = !userSelectedCustom && isRequiredMatch;
              const isChip2Active = !userSelectedCustom && !isChip1Active && isCapacityMatch;
              const isChip3Active = !isZero && (userSelectedCustom || (!isRequiredMatch && !isCapacityMatch));

              const showCustomInput = userSelectedCustom || (!isRequiredMatch && !isCapacityMatch);

              const isExceedingSurplus = Boolean(
                requiredNum !== null &&
                capacityNum !== null &&
                requiredNum > capacityNum
              );
              const exceededAmount = isExceedingSurplus && requiredNum !== null && capacityNum !== null ? requiredNum - capacityNum : 0;

              return (
                <>
                  <div className="plan-settings__chips" role="group" aria-label={language === "en" ? "Quick contribution options" : "Lựa chọn nhanh tiền góp"}>
                    {/* Chip 1: Góp đủ mức cần */}
                    {requiredNum != null && (
                      <div className="plan-settings__chip-wrapper">
                        <button
                          type="button"
                          className={`plan-settings__chip ${isChip1Active ? "is-active" : ""}`}
                          onClick={() => {
                            setUserSelectedCustom(false);
                            updateDraft({ monthlyContribution: String(requiredNum), contributionSchedule: [] });
                          }}
                          disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                          aria-pressed={isChip1Active}
                        >
                          <span className="plan-settings__chip-label">
                            {language === "en"
                              ? `Required amount: ${formatVNDCurrency(requiredNum)}`
                              : `Góp đủ mức cần: ${formatVNDCurrency(requiredNum)}`}
                          </span>
                        </button>
                        {isExceedingSurplus && (
                          <span className="plan-settings__chip-warning" role="status">
                            <Icon name="alert" size="small" />
                            {language === "en"
                              ? `Exceeds current surplus by ${formatVNDCurrency(exceededAmount)} per month`
                              : `Vượt phần dư hiện tại ${formatVNDCurrency(exceededAmount)} mỗi tháng`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Chip 2: Toàn bộ phần dư */}
                    {capacityNum != null && capacityNum > 0 && (
                      <button
                        type="button"
                        className={`plan-settings__chip ${isChip2Active ? "is-active" : ""}`}
                        onClick={() => {
                          setUserSelectedCustom(false);
                          updateDraft({ monthlyContribution: String(capacityNum), contributionSchedule: [] });
                        }}
                        disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                        aria-pressed={isChip2Active}
                      >
                        <span className="plan-settings__chip-label">
                          {language === "en"
                            ? `Full monthly surplus: ${formatVNDCurrency(capacityNum)}`
                            : `Toàn bộ phần dư: ${formatVNDCurrency(capacityNum)}`}
                        </span>
                      </button>
                    )}

                    {/* Chip 3: Tự nhập */}
                    <button
                      type="button"
                      className={`plan-settings__chip ${isChip3Active ? "is-active" : ""}`}
                      onClick={() => {
                        setUserSelectedCustom(true);
                      }}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      aria-pressed={isChip3Active}
                    >
                      <span className="plan-settings__chip-label">
                        {language === "en" ? "Custom amount" : "Tự nhập"}
                      </span>
                    </button>
                  </div>

                  {/* Neutral state notice when monthlyContribution = 0 */}
                  {isZero && (
                    <p className="plan-settings__neutral-notice" role="status">
                      <Icon name="info" size="small" />
                      {language === "en"
                        ? "You have not chosen a contribution amount - the plan currently assumes no additional contributions."
                        : "Bạn chưa chọn khoản góp - kế hoạch đang tính như không góp thêm."}
                    </p>
                  )}

                  {/* Custom input */}
                  {showCustomInput && (
                    <div className="plan-settings__custom-input">
                      <CurrencyInput
                        label={language === "en" ? "Monthly retirement contribution" : "Tiền bạn chọn góp hưu trí mỗi tháng"}
                        helper={language === "en" ? "Money left after expenses and debt payments is not contributed automatically." : "Tiền còn lại sau chi tiêu và trả nợ không tự động được góp vào quỹ."}
                        value={Number(previewPayload?.monthlyContribution ?? 0)}
                        disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                        suffix="đ"
                        onChange={value => {
                          setUserSelectedCustom(true);
                          updateDraft({ monthlyContribution: String(value), contributionSchedule: [] });
                        }}
                      />
                    </div>
                  )}
                </>
              );
            })()}

            {/* Advanced options collapsible block */}
            <details
              className="plan-advanced-settings"
              open={isAdvancedOpen}
              onToggle={e => setIsAdvancedOpen(e.currentTarget.open)}
            >
              <summary className="plan-advanced-settings__summary">
                <div className="plan-advanced-settings__summary-left">
                  <span className="plan-advanced-settings__title">
                    <Icon name="settings" size="small" />
                    {language === "en" ? "Advanced options" : "Tùy chọn nâng cao"}
                  </span>
                  {!isAdvancedOpen && (
                    <span className="plan-advanced-settings__overview">
                      {language === "en"
                        ? `Money reserved: ${formatVNDShort(previewPayload?.monthlyReserve ?? "0")} · Contributed at ${contributionTiming === "START_OF_MONTH" ? "start of month" : "end of month"}`
                        : `Giữ lại ngoài quỹ: ${formatVNDShort(previewPayload?.monthlyReserve ?? "0")} · ${contributionTiming === "START_OF_MONTH" ? "Góp đầu mỗi tháng" : "Góp cuối mỗi tháng"}`}
                    </span>
                  )}
                </div>
                <Icon name="chevron-down" size="small" className="plan-advanced-settings__chevron" />
              </summary>

              <div className="plan-advanced-settings__content">
                <CurrencyInput
                  label={language === "en" ? "Money reserved each month" : "Tiền giữ lại mỗi tháng ngoài quỹ hưu trí"}
                  helper={language === "en" ? "Kept for emergencies or other goals; not invested for retirement." : "Để dành cho dự phòng hoặc mục tiêu khác, không đưa vào quỹ hưu trí."}
                  value={Number(previewPayload?.monthlyReserve ?? 0)}
                  disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                  suffix="đ"
                  onChange={value => updateDraft({ monthlyReserve: String(value) })}
                />
                <fieldset className="plan-timing" disabled={loadingPlans || isSaving || isApplying || usesActualBalance}>
                  <legend><Explain term="contributionTiming">{language === "en" ? "When you contribute" : "Thời điểm góp vào quỹ"}</Explain></legend>
                  <div className="plan-timing__options">
                    <Button
                      variant={contributionTiming === "END_OF_MONTH" ? "primary" : "secondary"}
                      size="small"
                      className="plan-timing__option"
                      onClick={() => setContributionTiming("END_OF_MONTH")}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      aria-pressed={contributionTiming === "END_OF_MONTH"}
                    >
                      {language === "en" ? "End of month" : "Cuối mỗi tháng"}
                    </Button>
                    <Button
                      variant={contributionTiming === "START_OF_MONTH" ? "primary" : "secondary"}
                      size="small"
                      className="plan-timing__option"
                      onClick={() => setContributionTiming("START_OF_MONTH")}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      aria-pressed={contributionTiming === "START_OF_MONTH"}
                    >
                      {language === "en" ? "Start of Month" : "Đầu mỗi tháng"}
                    </Button>
                  </div>
                  <p className="plan-timing__hint" aria-live="polite">
                    {contributionTiming === "START_OF_MONTH"
                      ? (language === "en" ? "Contributed on the 1st and invested for the whole month; needs cash already available." : "Góp ngay đầu tháng nên tiền được đầu tư trọn tháng; cần có sẵn tiền từ đầu tháng.")
                      : (language === "en" ? "Default. Contributed after the month's income arrives; safest when you are unsure." : "Mặc định. Góp sau khi nhận thu nhập trong tháng; an toàn nhất nếu bạn chưa chắc.")}
                  </p>
                </fieldset>

                {contributionTiming === "START_OF_MONTH" && (
                  <div className="plan-settings__start">
                    <CurrencyInput
                      label={language === "en" ? "Available Disposable Cash at Start *" : "Tiền sẵn có để góp vào đầu tháng (đồng) *"}
                      helper={language === "en" ? "Money already in hand on the 1st, not taken from the retirement fund." : "Tiền đã có trong tay ngày đầu tháng, không trích từ quỹ hưu trí."}
                      placeholder="5.000.000"
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      value={Number(startOfMonthAvailable || 0)}
                      suffix="đ"
                      onChange={val => setStartOfMonthAvailable(String(val))}
                    />
                    <div className="plan-settings__confirm">
                      <Checkbox
                        checked={startOfMonthConfirmed}
                        disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                        onChange={setStartOfMonthConfirmed}
                        label={language === "en"
                          ? "I confirm this disposable cash is available at the start of each month (not drawn from fund balance)."
                          : "Tôi xác nhận nguồn tiền này đã sẵn có vào đầu mỗi tháng để đóng góp (không trích từ số dư quỹ hưu trí)."}
                      />
                      {!startOfMonthConfirmed && (
                        <p className="plan-settings__warning" role="status">
                          <Icon name="alert" size="small" />
                          {language === "en"
                            ? "Start-of-month timing requires explicit user confirmation of disposable funds available at month start."
                            : "Đóng góp đầu tháng yêu cầu xác nhận rõ ràng nguồn tiền khả dụng đã sẵn có đầu tháng."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>

        <div className="adjust-right">
          <div className="comparison-box">
            <h4>{language === "en" ? "Real-time Impact" : "Tác động điều chỉnh"}</h4>
            <div className="comparison-row">
              <span>{language === "en" ? "Goal coverage:" : "Độ bao phủ mục tiêu:"}</span>
              <strong style={{ color: coveragePercentRaw === null ? "inherit" : hasFundingShortfall ? "var(--color-danger, #b53241)" : "var(--color-success, #167a4e)" }}>
                {coverageText}{coveragePercentRaw !== null && "%"}
              </strong>
            </div>
            <div className="comparison-row">
              <span>{language === "en" ? "Fund lasts until:" : "Quỹ duy trì đến:"}</span>
              <strong>{summary ? formatMonthVN(summary.firstShortfallMonth || summary.endMonth) : "-"}</strong>
            </div>
            <div className="comparison-row">
              <span>{language === "en" ? "Required contribution:" : "Mức góp cần thiết:"}</span>
              <strong>{requiredContributionText}/tháng</strong>
            </div>
            <div className="comparison-row">
              <span>{language === "en" ? "Shortfall delta:" : "Thiếu hụt quỹ:"}</span>
              <strong style={{ color: hasFundingShortfall ? "var(--color-danger, #b53241)" : "var(--color-success, #167a4e)" }}>
                {hasFundingShortfall && summary ? formatVNDCurrency(summary.retirementFundingShortfall) : (language === "en" ? "No shortfall" : "Đạt mục tiêu")}
              </strong>
            </div>
          </div>
        </div>
      </div>

          {displayedPreview?.replayInput?.contributionStartMonth && (
            <p className="plan-settings__meta">
              <Icon name="compass" size="small" />
              {language === "en"
                ? `Contribution calculation begins from: ${displayedPreview.replayInput.contributionStartMonth}`
                : `Kỳ bắt đầu tính toán đóng góp: Tháng ${displayedPreview.replayInput.contributionStartMonth}`}
            </p>
          )}

          {summary?.savingsStatus === "EARLY_FUNDING_REQUIRED" && (
            <Alert tone="warning" title={language === "en" ? "Early Funding Required" : "Yêu cầu nguồn vốn đầu kỳ"}>
              {language === "en"
                ? "Additional disposable funds are required before the eligible contribution window opens."
                : "Cần bổ sung nguồn vốn khả dụng trước khi kỳ đóng góp đủ điều kiện bắt đầu."}
            </Alert>
          )}

          {summary?.savingsStatus === "NO_ELIGIBLE_CONTRIBUTION_PERIOD" && (
            <Alert tone="warning" title={language === "en" ? "No Eligible Contribution Period" : "Không có kỳ đóng góp đủ điều kiện"}>
              {language === "en"
                ? "An accumulation phase exists, but no eligible contribution months were found within the planning horizon."
                : "Tồn tại giai đoạn tích lũy nhưng không tìm thấy kỳ đóng góp đủ điều kiện nào trong chân trời kế hoạch."}
            </Alert>
          )}

          <nav className="plan-settings__links" aria-label={language === "en" ? "Related settings" : "Thiết lập liên quan"}>
            <span>{language === "en" ? "Also adjust:" : "Điều chỉnh thêm:"}</span>
            <Link to="/user/goal">{language === "en" ? "Edit goal" : "Sửa mục tiêu"}</Link>
            <Link to="/user/risk-portfolio">{language === "en" ? "Asset allocation" : "Phân bổ tài sản"}</Link>
            <Link to="/user/debts">{language === "en" ? "Review debt budget" : "Kiểm tra ngân sách trả nợ"}</Link>
          </nav>
        </Card>

        <details className="plan-fee-details">
          <summary>
            <Icon name="settings" />
            <span>
              {language === "en" ? "Additional advisory fee" : "Phí tư vấn bổ sung"}
              <small>{previewPayload?.advisoryFee
                ? (language === "en"
                  ? `Included: ${previewPayload.advisoryFee.annualPercent}% per year · ${previewPayload.advisoryFee.paidFrom === "FUND" ? "paid from the fund" : "paid from household budget"}`
                  : `Đang tính: ${previewPayload.advisoryFee.annualPercent}%/năm · ${previewPayload.advisoryFee.paidFrom === "FUND" ? "trả từ quỹ" : "trả từ ngân sách hộ"}`)
                : (language === "en" ? "Optional · only if this fee applies to you" : "Tùy chọn · chỉ thiết lập nếu bạn có khoản phí này")}</small>
            </span>
            <Icon name="chevron-down" size="small" />
          </summary>
          <AdvisoryFeeEditor value={previewPayload?.advisoryFee} onChange={advisoryFee => updateDraft({ advisoryFee })} disabled={usesActualBalance} />
        </details>
        {usesActualBalance && baseline && v2Profile && <>
          <Button variant="secondary" onClick={() => setReviewMonth(baseline.endMonth)}>{language === "en" ? "Open a fresh profile preview" : "Mở bản xem trước mới từ hồ sơ"}</Button>
          {reviewMonth && <ProfileReviewPreview input={selectionForCurrentProfile(baseline, { endMonth: reviewMonth }, v2Profile, profileRevision)} onClose={() => setReviewMonth(null)} />}
        </>}
      </section>

      <section id="plan-analysis" className="plan-section" aria-labelledby="plan-analysis-title" tabIndex={-1}>
        <header className="plan-section-heading">
          <span className="plan-section-number">04</span>
          <div>
            <h2 id="plan-analysis-title">{language === "en" ? "Understand your plan" : "Hiểu sâu hơn về kế hoạch"}</h2>
            <p>{language === "en" ? "Explore alternatives, review assumptions and test how your plan handles uncertainty." : "So sánh các hướng đi, xem cơ sở tính toán và kiểm tra kế hoạch trước rủi ro."}</p>
          </div>
        </header>
        <PreviewInsights preview={displayedPreview ?? (inputMatches && previewStatus === "incomplete" ? previewData : null)} />
        <RiskAnalysis plan={loadingPlans || plansError ? null : viewingCurrent && currentVersion && activePlan ? { kind: "SAVED_VERSION", planId: activePlan.id, versionId: currentVersion.id } : previewPayload ? { kind: "PREVIEW", preview: previewPayload } : null} />
        <RebalanceProposal templates={policyDetail?.data.templates} basis={(previewPayload?.templateId || calculation?.assessment?.selectedTemplateId) && previewPayload && summary?.retirementMonth && displayedPreview?.valuationDate ? { policyVersionId: previewPayload.policyVersionId, templateId: previewPayload.templateId ?? calculation?.assessment?.selectedTemplateId, month: displayedPreview.valuationDate.slice(0, 7), retirementMonth: summary.retirementMonth } : null} />
        {!usesActualBalance && <GuidedScenarios input={!loadingPlans && !plansError ? previewPayload : null} retirementMonth={v2Profile?.personal?.desiredRetirementMonth?.status === "KNOWN" ? v2Profile.personal.desiredRetirementMonth.value : undefined} />}
        {Boolean(displayedPreview?.warnings?.length) && <details className="plan-explanation-details"><summary>{language === "en" ? "How these results are calculated" : "Cách tính và thông tin được dùng"}</summary><ul>{displayedPreview?.warnings?.map((warn, idx) => <li key={idx}>{translateWarningCode(warn.code, language)}</li>)}</ul></details>}
      </section>
      </>
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
      <Modal open={showApplyConfirm} title={language === "en" ? "Confirm Retirement Plan Application" : "Xác nhận đổi kế hoạch đang dùng"} onClose={() => { if (!isApplying) setShowApplyConfirm(false); }}>
            {savedForPreview && <p role="status">{language === "en" ? `Preview saved as v${savedForPreview.version}. Confirming applies this saved version.` : `Bản xem trước đã lưu thành v${savedForPreview.version}. Xác nhận sẽ áp dụng chính phiên bản này.`}</p>}
            <p style={{ margin: "0 0 16px", fontSize: "14px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
              {language === "en"
                ? "This version will become your account's official plan. All tracking and dashboard metrics will benchmark against this plan."
                : "Phương án này sẽ thay kế hoạch đang dùng. Trang Tổng quan, Theo dõi thực tế và trợ lý AI sẽ dùng số liệu của phương án này. Các phương án cũ vẫn được giữ trong lịch sử."}
            </p>

            <div style={{ background: "var(--color-surface-subtle)", padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Retirement Month:" : "Tháng nghỉ hưu:"}</span>
                <strong>{summary?.retirementMonth ? formatMonthVN(summary.retirementMonth) : "-"}</strong>
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
                {language === "en" ? "Confirm Apply" : "Dùng làm kế hoạch hiện tại"}
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
    </div>
  );
}
