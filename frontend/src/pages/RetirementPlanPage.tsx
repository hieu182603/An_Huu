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
import ProfileFormattedInput from "../components/ProfileFormattedInput";
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
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
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
  const baseline = currentVersion?.preview.selection;
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
    (policyDetail?.data.questions ?? []).flatMap(q => surveyAnswers[q.id] ? [{ questionId: q.id, choiceId: surveyAnswers[q.id] }] : []);
  const hasCompleteSurvey = Boolean(policyDetail && policyDetail.data.questions.every(q =>
    effectiveAnswers.some(a => a.questionId === q.id && q.choices.some(c => c.id === a.choiceId))
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

  const displayedPreview = viewingCurrent ? synchronization.preview : (canUsePreview ? previewData : null);

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

  return (
    <div className="retirement-plan-page">
      {/* Plan Status Bar matching demo */}
      <div className={`plan-status ${isAppliedPlan ? "is-applied" : "plan-next"}`} data-status={isAppliedPlan ? "applied" : "draft"}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span className="status-dot" />
          <div>
            <strong>
              {isAppliedPlan && currentVersion
                ? (language === "en" ? `Official Plan v${currentVersion.version} (Active)` : `Kế hoạch chính thức v${currentVersion.version} (Đang áp dụng)`)
                : (language === "en" ? "Next step: apply or save this version as your active plan" : "Bước tiếp theo: lưu phương án này làm kế hoạch chính")}
            </strong>
            <p>
              {isAppliedPlan
                ? (language === "en" ? "All dashboard and tracking metrics benchmark against this plan." : "Tổng quan và Theo dõi thực tế đang dùng số liệu của kế hoạch này.")
                : (language === "en" ? "You have unapplied modifications or preview changes." : "Bạn đang xem bản dự phóng nháp. Lưu hoặc áp dụng để dùng kết quả mới.")}
            </p>
          </div>
        </div>
        <div className="plan-next-actions">
          {!isAppliedPlan && (
            <Button
              variant="primary"
              size="small"
              disabled={isApplying || isSaving || !summary || !canUsePreview}
              onClick={() => setShowApplyConfirm(true)}
            >
              {language === "en" ? "Apply to official plan" : "Lưu làm kế hoạch chính"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="small"
            onClick={() => setIsVersionDrawerOpen(true)}
          >
            {language === "en" ? "View versions" : "Xem các phương án"}
          </Button>
        </div>
      </div>

      <div className="retirement-page-header">
        <div className="retirement-header-main">
          <div className={`header-status-badge ${isAppliedPlan ? "is-synced" : "is-preview"}`}>
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
              {formatMonthVN(
                summary?.retirementMonth ||
                  (v2Profile?.personal.desiredRetirementMonth?.status === "KNOWN"
                    ? v2Profile.personal.desiredRetirementMonth.value
                    : null)
              ) || (language === "en" ? "Undetermined" : "Chưa xác định")}
            </span>
          </div>
          <div className="header-quick-stat-item">
            <span className="stat-label">{language === "en" ? "Funding Status" : "Tình trạng quỹ"}</span>
            <span className={`stat-value ${!summary ? "" : hasFundingShortfall ? "is-warning" : "is-safe"}`}>
              {!summary ? (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ") : parseFloat(summary.retirementFundingShortfall) > 0
                ? (language === "en" ? "Additional Capital Needed" : "Cần bổ sung vốn")
                : (language === "en" ? "No projected shortfall" : "Chưa ghi nhận thiếu hụt trong dự phóng")}
            </span>
          </div>
        </div>
      </div>

      <nav className="plan-section-nav" aria-label={language === "en" ? "Plan sections" : "Các phần của kế hoạch"}>
        <a href="#plan-overview" className={activePlanSection === "plan-overview" ? "is-active" : ""} aria-current={activePlanSection === "plan-overview" ? "true" : undefined}><span>01</span>{language === "en" ? "Overview" : "Tổng quan"}</a>
        <a href="#plan-settings" className={activePlanSection === "plan-settings" ? "is-active" : ""} aria-current={activePlanSection === "plan-settings" ? "true" : undefined}><span>02</span>{language === "en" ? "Adjust plan" : "Điều chỉnh"}</a>
        <a href="#plan-cashflow" className={activePlanSection === "plan-cashflow" ? "is-active" : ""} aria-current={activePlanSection === "plan-cashflow" ? "true" : undefined}><span>03</span>{language === "en" ? "Cash flow" : "Dòng tiền"}</a>
        <a href="#plan-analysis" className={activePlanSection === "plan-analysis" ? "is-active" : ""} aria-current={activePlanSection === "plan-analysis" ? "true" : undefined}><span>04</span>{language === "en" ? "Analysis" : "Phân tích"}</a>
      </nav>

      {loadingPolicy && <p role="status">{language === "en" ? "Loading projection inputs…" : "Đang tải đầu vào dự phóng…"}</p>}
      {loadingPlans && <p role="status">{language === "en" ? "Loading saved plans…" : "Đang tải kế hoạch đã lưu…"}</p>}
      {plansError && <Alert tone="warning" title={language === "en" ? "Could not load saved plans" : "Chưa tải được kế hoạch đã lưu"} action={<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button>}>{plansError}</Alert>}
      {policyError && <Alert tone="warning" title={language === "en" ? "Could not load portfolio policy" : "Chưa tải được chính sách danh mục"} action={<Button onClick={() => setPolicyAttempt(value => value + 1)}>{language === "en" ? "Retry policy" : "Tải lại chính sách"}</Button>}>{policyError}</Alert>}
      {!viewingCurrent && !hasCompleteSurvey && !loadingPolicy && <Alert tone="warning" title={language === "en" ? "Choose your investment preferences" : "Cần hoàn tất lựa chọn đầu tư"}>
        <p style={{ margin: 0 }}>{language === "en" ? "Answer the questions before saving a personal plan." : "Trả lời khảo sát để kế hoạch dùng đúng lựa chọn của bạn."} <Link to="/user/risk-portfolio">{language === "en" ? "Complete survey" : "Làm khảo sát đầu tư"}</Link></p>
      </Alert>}
      {!baseline && previewStatus === "loading" && <p role="status">{language === "en" ? "Calculating…" : "Đang tính kết quả…"}</p>}
      {previewStatus === "error" && <Alert tone="danger" title={language === "en" ? "Could not calculate" : "Chưa tính được kết quả"} action={<Button onClick={() => (baseline ? synchronization.retry() : previewPayload && runPreview(previewPayload))}>{language === "en" ? "Retry" : "Thử lại"}</Button>}>{previewError}</Alert>}
      {/* Warnings & Issues notification banners */}
      {!viewingCurrent && previewStatus === "incomplete" && uniqueIssues.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="warning"
            title={language === "en" ? "Incomplete Financial Data" : "Dữ liệu chưa hoàn tất"}
            action={
              <>
                {hasRiskIssues && (
                  <Link to="/user/risk-portfolio">
                    <Icon name="sparkles" size="small" />
                    {language === "en" ? "Complete risk tolerance" : "Làm khảo sát khả năng chịu rủi ro"}
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

      <HorizonWarnings warnings={currentVersion?.readWarnings ?? activePlan?.readWarnings} onRecalculate={month => usesActualBalance ? setReviewMonth(month) : updateDraft({ endMonth: month })} />
      <PlanSyncStatus />
      {Boolean(activePlan?.actualSourceChanged) && (
        <div style={{ marginBottom: "20px" }}>
          <Alert
            tone="danger"
            title={language === "en" ? "Actual Source Changed" : "Số liệu thực tế đã thay đổi"}
          >
            {language === "en"
              ? "Actual transactions linked to this plan version have been modified. Please reconcile actuals and run a reforecast."
              : "Bạn đã sửa các khoản tiền vào hoặc ra dùng trong kế hoạch này. Hãy kiểm tra lại số dư tháng, rồi tính lại kế hoạch."}
          </Alert>
        </div>
      )}

      {usesActualBalance && <Alert tone="info" title={language === "en" ? "Keep your recorded balances" : "Giữ đúng số dư thực tế đã ghi"}>
        <p>{language === "en" ? "This plan already includes actual transactions. Use actual tracking to change contributions, income or expenses while keeping the recorded balance. Draft changes from other pages have not been applied." : "Kế hoạch này đã tính các giao dịch thực tế. Hãy sửa tiền góp, thu nhập hoặc chi tiêu tại Theo dõi thực tế để giữ đúng số dư đã ghi. Thay đổi nháp từ các trang khác chưa được áp dụng."}</p>
      </Alert>}
      <section id="plan-overview" className="plan-section" aria-labelledby="plan-overview-title" tabIndex={-1}>
        <h2 id="plan-overview-title" className="sr-only">{language === "en" ? "Your plan at a glance" : "Tổng quan kế hoạch của bạn"}</h2>
        {/* Primary Result Hero - demo layout: one headline answer + side metrics */}
        <motion.div
          className="summary-hero plan-summary-hero plan-result-hero"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="plan-summary-hero__main">
            <span className="plan-summary-hero__badge">
              {language === "en"
                ? `Based on your profile · ${scenario === "BASE" ? "Baseline" : scenario === "ADVERSE" ? "Adverse" : "Favorable"} scenario`
                : `Theo hồ sơ và lựa chọn hiện tại · Kịch bản ${scenario === "BASE" ? "cơ sở" : scenario === "ADVERSE" ? "bất lợi" : "thuận lợi"}`}
            </span>
            <h2 className="plan-summary-hero__title">
              {!summary
                ? (language === "en" ? "Your plan result" : "Kết quả kế hoạch của bạn")
                : hasFundingShortfall
                ? (language === "en" ? "To reach your goal, add about" : "Để đạt được mục tiêu thì cần thêm khoảng")
                : (language === "en" ? "Your projected fund meets the goal, with a surplus of" : "Quỹ dự kiến đáp ứng mục tiêu, dư khoảng")}
            </h2>
            <strong className="plan-summary-hero__number">
              {!summary
                ? (previewStatus === "loading"
                  ? (language === "en" ? "Calculating…" : "Đang tính toán…")
                  : previewStatus === "incomplete"
                  ? (language === "en" ? "Awaiting valid inputs" : "Chờ dữ liệu hợp lệ")
                  : (language === "en" ? "No projection" : "Chưa có dự phóng"))
                : hasFundingShortfall
                ? (summary.additionalMonthlyContribution != null
                  ? <>{explanationSource ? <Explain metric="summary.additionalMonthlyContribution" source={explanationSource} value={String(summary.additionalMonthlyContribution)}>{formatVNDCurrency(summary.additionalMonthlyContribution)}</Explain> : formatVNDCurrency(summary.additionalMonthlyContribution)}<small> / {language === "en" ? "month" : "tháng"}</small></>
                  : formatVNDCurrency(summary.retirementFundingShortfall))
                : formatVNDCurrency(summary.excessAtRetirement)}
            </strong>

            <p className="plan-summary-hero__desc">
              {language === "en" ? (
                <>Steady contribution needed: <strong>{requiredContributionText}/month</strong>. Retirement spending of <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "…"}/month</strong> (<Explain term="inflation">inflation adjusted</Explain>) for {summary?.retirementMonths ?? "…"} months until {summary?.endMonth ? formatMonthVN(summary.endMonth) : "…"}.</>
              ) : (
                <>Mức góp đều cần thiết: <strong><Explain term="requiredMonthlyContribution">{requiredContributionText}</Explain>/tháng</strong>. Chi tiêu khi nghỉ hưu <strong>{summary ? formatVNDCurrency(summary.futureMonthlyExpense) : "…"}/tháng</strong> (đã tính <Explain term="inflation">lạm phát</Explain>) trong {summary?.retirementMonths ?? "…"} tháng, đến {summary?.endMonth ? formatMonthVN(summary.endMonth) : "…"}.</>
              )}
            </p>

            {isFromNewOnboarding && omittedNotice && <p className="plan-summary-hero__notice">{omittedNotice}</p>}
            {savedForPreview && <p role="status" className="plan-summary-hero__notice">{language === "en" ? `This preview is saved as v${savedForPreview.version}.` : `Bản xem trước này đã lưu thành phiên bản v${savedForPreview.version}.`}</p>}

            <div className="plan-hero-actions">
              <div className="plan-hero-actions__main">
                {isFromNewOnboarding ? (
                  <>
                    <Button
                      variant="primary"
                      size="medium"
                      className={`plan-hero-action plan-hero-action--save${savedForPreview ? " is-done" : ""}`}
                      disabled={isSaving || isApplying || !summary || !canUsePreview || Boolean(savedForPreview)}
                      icon={savedForPreview ? "circle-check" : "check"}
                      onClick={handleSaveVersion}
                    >
                      {isSaving ? (language === "en" ? "Saving..." : "Đang lưu…") : savedForPreview ? (language === "en" ? `Saved as v${savedForPreview.version}` : `Đã lưu bản v${savedForPreview.version}`) : (language === "en" ? "Save this plan" : "Lưu kế hoạch này")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="medium"
                      className="plan-hero-action plan-hero-action--refine"
                      onClick={() => {
                        const el = document.getElementById("accuracy-checklist");
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "start" });
                          el.focus();
                        }
                      }}
                    >
                      {language === "en" ? "Make more accurate" : "Làm chính xác hơn"}
                    </Button>
                    {!isAppliedPlan && (
                      <Button
                        variant="ghost"
                        size="medium"
                        className="plan-hero-action plan-hero-action--apply"
                        disabled={isApplying || isSaving || !summary || !canUsePreview}
                        icon="target"
                        onClick={() => setShowApplyConfirm(true)}
                      >
                        {language === "en" ? "Apply to official plan" : "Dùng làm kế hoạch hiện tại"}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="medium"
                      className={`plan-hero-action plan-hero-action--apply${isAppliedPlan ? " is-done" : ""}`}
                      disabled={isApplying || isSaving || !summary || !canUsePreview || isAppliedPlan}
                      icon={isAppliedPlan ? "circle-check" : "target"}
                      onClick={() => setShowApplyConfirm(true)}
                    >
                      {isAppliedPlan ? (language === "en" ? "Current plan" : "Đang là kế hoạch hiện tại") : (language === "en" ? "Apply to official plan" : "Dùng làm kế hoạch hiện tại")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="medium"
                      className={`plan-hero-action plan-hero-action--save${savedForPreview ? " is-done" : ""}`}
                      disabled={isSaving || isApplying || !summary || !canUsePreview || Boolean(savedForPreview)}
                      icon={savedForPreview ? "circle-check" : "check"}
                      onClick={handleSaveVersion}
                    >
                      {isSaving ? (language === "en" ? "Saving..." : "Đang lưu…") : savedForPreview ? (language === "en" ? `Saved as v${savedForPreview.version}` : `Đã lưu bản v${savedForPreview.version}`) : (language === "en" ? "Save this version" : "Lưu phương án này")}
                    </Button>
                  </>
                )}
              </div>
              <div className="plan-hero-actions__tools" role="group" aria-label={language === "en" ? "More plan tools" : "Công cụ khác của kế hoạch"}>
                <Button
                  variant="ghost"
                  size="small"
                  className="plan-hero-tool"
                  aria-label={language === "en" ? `View history (${planVersions.length} versions)` : `Xem lịch sử (${planVersions.length} bản)`}
                  icon="file-text"
                  onClick={() => setIsVersionDrawerOpen(true)}
                  disabled={isApplying || isSaving || loadingPlans || Boolean(plansError)}
                >
                  {language === "en" ? "History" : "Lịch sử"}
                  <span className="plan-hero-tool__count" aria-hidden="true">{planVersions.length}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  className="plan-hero-tool"
                  aria-label={language === "en" ? "Social Insurance (BHXH)" : "Thẩm định & Ước tính BHXH"}
                  icon="sparkles"
                  onClick={() => setShowInsuranceModal(true)}
                  disabled={isApplying || isSaving}
                  title={language === "en" ? "Assess and estimate social insurance (BHXH) pension" : "Thẩm định và ước tính lương hưu BHXH"}
                >
                  {language === "en" ? "BHXH estimate" : "Ước tính BHXH"}
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  className="plan-hero-tool"
                  icon="download"
                  onClick={() => window.print()}
                  disabled={isApplying || isSaving || !summary}
                  title={language === "en" ? "Print or save this retirement plan as PDF" : "In hoặc lưu kế hoạch hưu trí này dưới dạng PDF"}
                >
                  {language === "en" ? "Print / PDF" : "In / PDF"}
                </Button>
              </div>
            </div>
          </div>

          <div className={`plan-summary-hero__side ${coveragePercentRaw === null ? "is-unknown" : hasFundingShortfall ? "is-warning" : "is-safe"}`}>
            <div>
              <span><Explain term="fundCoverage">{language === "en" ? "Projected fund equals" : "Quỹ dự kiến bằng"}</Explain></span>
              <strong>{coverageText}{coveragePercentRaw !== null && "%"}</strong>
              <small>{language === "en" ? "of the fund needed at retirement" : "số tiền cần có khi nghỉ hưu"}</small>
            </div>
            <div>
              <span>{summary?.firstShortfallMonth ? (language === "en" ? "Fund projected to run out" : "Quỹ dự kiến cạn vào") : (language === "en" ? "Fund projected to last until" : "Quỹ dự kiến đủ đến")}</span>
              <strong>{summary ? formatMonthVN(summary.firstShortfallMonth || summary.endMonth) : unknown}</strong>
              <small>{language === "en" ? "Under the current assumptions" : "Theo giả định hiện tại"}</small>
            </div>
          </div>
        </motion.div>

        {/* 4 key metrics, demo order: need · have · gap · spending */}
        <motion.div
          className="metric-grid plan-metrics"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
        >
          <Card className="plan-metric-card">
            <div><span>{language === "en" ? "Fund needed at retirement" : "Quỹ cần khi nghỉ hưu"}</span><Icon name="target" /></div>
            <strong>{summary?.atRetirement?.requiredFund != null ? (explanationSource ? <Explain metric="summary.atRetirement.requiredFund" source={explanationSource} value={String(summary.atRetirement.requiredFund)}>{formatVNDCurrency(summary.atRetirement.requiredFund)}</Explain> : formatVNDCurrency(summary.atRetirement.requiredFund)) : unknown}</strong>
            <small>{language === "en" ? "Based on your declared spending" : "Tính theo các khoản chi đã khai"} · {summary?.retirementMonth ? formatMonthVN(summary.retirementMonth) : "…"}</small>
          </Card>

          <Card className="plan-metric-card">
            <div><span><Explain term="projectedFund">{language === "en" ? "Projected fund" : "Quỹ dự kiến có"}</Explain></span><Icon name="wallet" /></div>
            <strong>{summary ? (explanationSource ? <Explain metric="summary.atRetirement.projectedFund" source={explanationSource} value={String(summary.atRetirement.projectedFund)}>{formatVNDCurrency(summary.atRetirement.projectedFund)}</Explain> : formatVNDCurrency(summary.atRetirement.projectedFund)) : unknown}</strong>
            <small>{language === "en" ? "Starting capital" : "Vốn ban đầu"} {summary ? (explanationSource ? <Explain metric="summary.initialRetirementCapital" source={explanationSource} value={String(summary.initialRetirementCapital)}>{formatVNDCurrency(summary.initialRetirementCapital)}</Explain> : formatVNDCurrency(summary.initialRetirementCapital)) : unknown}{summary ? ` · ${summary.accumulationMonths} ${language === "en" ? "months saving" : "tháng tích lũy"}` : ""}</small>
          </Card>

          <Card className={`plan-metric-card ${hasFundingShortfall ? "tone-warning" : ""}`}>
            <div><span>{language === "en" ? "Remaining gap" : "Phần còn thiếu"}</span><Icon name="alert" /></div>
            <strong className={hasFundingShortfall ? "is-danger" : "is-success"}>
              {!summary ? unknown : hasFundingShortfall ? formatVNDCurrency(summary.retirementFundingShortfall) : (language === "en" ? "None" : "Không thiếu")}
            </strong>
            <small>{language === "en" ? "Difference at retirement" : "Chênh lệch tại mốc nghỉ hưu"}</small>
          </Card>

          <Card className="plan-metric-card">
            <div><span>{language === "en" ? "Spending in retirement" : "Chi tiêu lúc nghỉ hưu"}</span><Icon name="compass" /></div>
            <strong>{summary ? <>{formatVNDCurrency(summary.futureMonthlyExpense)}<small>/{language === "en" ? "month" : "tháng"}</small></> : unknown}</strong>
            <small>{language === "en" ? "Converted from today's prices" : "Quy đổi từ giá hôm nay"}{calculation?.netWorth != null ? ` · ${language === "en" ? "Net worth" : "Tài sản ròng"} ${formatVNDCurrency(calculation.netWorth)}` : ""}</small>
          </Card>
        </motion.div>

        {/* Plan Health Card matching demo */}
        {summary && (
          <div className={`plan-health ${hasFundingShortfall ? "is-warning" : ""}`}>
            <div className="plan-health-top">
              <div className="plan-health-title">
                <strong>{language === "en" ? "Plan Health & Budget Alignment" : "Đối chiếu mục tiêu với khả năng góp"}</strong>
                <p>{hasFundingShortfall
                  ? (language === "en" ? "Required contribution may exceed surplus in some months." : "Mức cần góp đang vượt khả năng ở một số tháng theo dự phóng.")
                  : (language === "en" ? "Projected contributions are well within available household cashflow." : "Mức góp dự kiến nằm trong khả năng cân đối của dòng tiền.")}
                </p>
              </div>
              <Badge tone={hasFundingShortfall ? "warning" : "success"}>
                {language === "en" ? "Monthly Cashflow Check" : "Theo dòng tiền từng tháng"}
              </Badge>
            </div>
            <div className="plan-health-kpis">
              <div className="health-kpi">
                <span>{language === "en" ? "First Month Actual Contribution" : "Thực góp tháng đầu"}</span>
                <strong>{formatVNDCurrency(previewPayload?.monthlyContribution ?? "0")}</strong>
                <small>{language === "en" ? "Current plan setting" : "Mức bạn chọn góp"}</small>
              </div>
              <div className="health-kpi">
                <span>{language === "en" ? "First Month Budget Capacity" : "Khả năng ngân sách tháng đầu"}</span>
                <strong>
                  {calculation?.rows?.[0]?.contributionCapacity != null && calculation.rows[0].contributionCapacity !== ""
                    ? formatVNDCurrency(Math.floor(Number(calculation.rows[0].contributionCapacity)))
                    : (language === "en" ? "Undetermined" : "Chưa xác định")}
                </strong>
                <small>{language === "en" ? "Surplus after expenses & debt" : "Phần dư sau chi và nợ"}</small>
              </div>
              <div className="health-kpi">
                <span>{language === "en" ? "Unfunded Gap After Fund Depletion" : "Chi chưa có nguồn sau khi quỹ cạn"}</span>
                <strong style={{ color: hasFundingShortfall ? "var(--color-danger, #b53241)" : "inherit" }}>
                  {hasFundingShortfall && summary.retirementFundingShortfall
                    ? formatVNDCurrency(summary.retirementFundingShortfall)
                    : (language === "en" ? "None" : "Không thiếu")}
                </strong>
                <small>{language === "en" ? "Difference at horizon" : "Chênh lệch cuối kỳ"}</small>
              </div>
            </div>
          </div>
        )}

        {/* 4 Quick Tools Grid matching demo */}
        <div className="plan-tools-grid">
          <a href="#plan-settings" className="plan-tool-btn">
            <span className="tool-btn-icon">⇄</span>
            <div className="tool-btn-copy">
              <strong>{language === "en" ? "Explore Scenarios" : "Thử các phương án"}</strong>
              <small>{language === "en" ? "Test retirement age & spending" : "Nghỉ muộn hơn hoặc giảm chi"}</small>
            </div>
            <span className="tool-btn-arrow">→</span>
          </a>
          <button type="button" className="plan-tool-btn" onClick={() => setIsVersionDrawerOpen(true)}>
            <span className="tool-btn-icon">📁</span>
            <div className="tool-btn-copy">
              <strong>{language === "en" ? "Saved Versions" : "Các bản đã lưu"}</strong>
              <small>{language === "en" ? `${planVersions.length} versions in history` : `${planVersions.length} phiên bản đã lưu`}</small>
            </div>
            <span className="tool-btn-arrow">→</span>
          </button>
          <button type="button" className="plan-tool-btn" onClick={() => window.print()}>
            <span className="tool-btn-icon">📄</span>
            <div className="tool-btn-copy">
              <strong>{language === "en" ? "View Report / PDF" : "Xem báo cáo"}</strong>
              <small>{language === "en" ? "Print or save plan as PDF" : "Tổng hợp lộ trình & bảng dự phóng"}</small>
            </div>
            <span className="tool-btn-arrow">→</span>
          </button>
          <Link to="/user/simulation/tracking" className="plan-tool-btn">
            <span className="tool-btn-icon">✓</span>
            <div className="tool-btn-copy">
              <strong>{language === "en" ? "Track & Check-in" : "Cập nhật tình hình"}</strong>
              <small>{language === "en" ? "Reconcile actuals monthly" : "Đối soát số dư thực tế từng tháng"}</small>
            </div>
            <span className="tool-btn-arrow">→</span>
          </Link>
        </div>

      </section>

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
            : (language === "en" ? "These changes are a draft for this session. Save the option to keep it; using it replaces your current plan." : "Các thay đổi đang là bản nháp trong phiên này. Lưu phương án để giữ lại; chọn dùng phương án mới sẽ thay kế hoạch hiện tại.")}</p>

          <div className="adjust-grid">
            <div className="adjust-left">
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
                      <ProfileFormattedInput
                        format="money"
                        label={language === "en" ? "Monthly retirement contribution (VND)" : "Tiền bạn chọn góp hưu trí mỗi tháng (đồng)"}
                        helper={language === "en" ? "Money left after expenses and debt payments is not contributed automatically." : "Tiền còn lại sau chi tiêu và trả nợ không tự động được góp vào quỹ."}
                        value={previewPayload?.monthlyContribution ?? "0"}
                        disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                        onChange={value => {
                          setUserSelectedCustom(true);
                          updateDraft({ monthlyContribution: value, contributionSchedule: [] });
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
                <ProfileFormattedInput
                  format="money"
                  label={language === "en" ? "Money reserved each month (VND)" : "Tiền giữ lại mỗi tháng ngoài quỹ hưu trí (đồng)"}
                  helper={language === "en" ? "Kept for emergencies or other goals; not invested for retirement." : "Để dành cho dự phòng hoặc mục tiêu khác, không đưa vào quỹ hưu trí."}
                  value={previewPayload?.monthlyReserve ?? "0"}
                  disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                  onChange={value => updateDraft({ monthlyReserve: value })}
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
                    <ProfileFormattedInput
                      format="money"
                      label={language === "en" ? "Available Disposable Cash at Start (VND) *" : "Tiền sẵn có để góp vào đầu tháng (đồng) *"}
                      helper={language === "en" ? "Money already in hand on the 1st, not taken from the retirement fund." : "Tiền đã có trong tay ngày đầu tháng, không trích từ quỹ hưu trí."}
                      placeholder="VD: 5.000.000"
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      value={startOfMonthAvailable}
                      onChange={setStartOfMonthAvailable}
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

      <section id="plan-cashflow" className="plan-section" aria-labelledby="plan-cashflow-title" tabIndex={-1}>
        <details className="card plan-more" open>
          <summary>
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Icon name="file-text" size="small" />
              <strong>{language === "en" ? "Cash Flow Breakdown & Projections" : "Chi tiết dòng tiền và giả định"}</strong>
            </span>
            <Icon name="chevron-down" size="small" />
          </summary>
          <div className="plan-more__content" style={{ marginTop: "18px" }}>
            <header className="plan-section-heading">
              <span className="plan-section-number">03</span>
              <div>
                <h2 id="plan-cashflow-title">{language === "en" ? "Your cash flow over time" : "Dòng tiền qua từng giai đoạn"}</h2>
                <p>{language === "en" ? "Follow the fund's path, then explore individual months or export your figures." : "Theo dõi diễn biến quỹ, xem chi tiết từng tháng và xuất số liệu khi cần."}</p>
              </div>
            </header>
            {/* Monthly Retirement Cashflow Chart */}
            {calculation && summary && (
              <Card className="plan-chart-card">
                <ol className="plan-milestones" aria-label={language === "en" ? "Plan timeline" : "Các mốc của kế hoạch"}>
                  <li><span>{language === "en" ? "Start of plan" : "Bắt đầu kế hoạch"}</span><strong>{formatMonthVN(summary.valuationDate?.slice(0, 7)) || unknown}</strong></li>
                  <li><span>{language === "en" ? "Retirement" : "Nghỉ hưu"}</span><strong>{formatMonthVN(summary.retirementMonth) || unknown}</strong></li>
                  <li><span><Explain term="projectionEnd">{language === "en" ? "Projection ends" : "Kết thúc dự phóng"}</Explain></span><strong>{formatMonthVN(summary.endMonth) || unknown}</strong></li>
                </ol>
                <MonthlyRetirementChart rows={calculation.rows} summary={summary} />
              </Card>
            )}

            {/* Monthly Cashflow Table & CSV Export */}
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

            {(!calculation || !summary) && (
              <div className="plan-empty-state">
                <Icon name="chart" size="large" />
                <h3>{language === "en" ? "Your cash flow will appear here" : "Dòng tiền sẽ hiển thị tại đây"}</h3>
                <p>{language === "en" ? "Complete the missing inputs above to view the chart and monthly breakdown." : "Hoàn tất các thông tin còn thiếu ở trên để xem biểu đồ và bảng chi tiết theo tháng."}</p>
                <Link to="/user/account?tab=profile">{language === "en" ? "Review financial profile" : "Kiểm tra hồ sơ tài chính"}<Icon name="arrow-right" size="small" /></Link>
              </div>
            )}
          </div>
        </details>
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
