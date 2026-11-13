import { initialPlanSelection } from "../services/initialPlanSelection";
import PlanEmptyResult from "../components/retirement/PlanEmptyResult";
import {PlanOptionsDialog, PlanContributionDialog, contributionInput} from "../components/retirement/PlanActionsDialog";
import PlanSavedViews from "./PlanSavedViews";
import PlanMoneyExplanation, { type PlanMoneyMetric } from "../components/retirement/PlanMoneyExplanation";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import {formatMoneyDecimal as financeMoney} from "../utils/moneyDisplay";
import ResponsiveDialog from "../components/ResponsiveDialog";
import "../components/user-workspace-dialogs.css";
import "./remaining-user-sync.css";
import { PreviewInsights, HorizonWarnings } from "../components/retirement/AnalysisResults";
import { RiskAnalysis, RebalanceProposal } from "../components/retirement/RiskAnalysis";
import { AdvisoryFeeEditor } from "../components/retirement/AdvisoryFeeEditor";
import { ProfileReviewPreview } from "../components/retirement/ProfileReviewPreview";
import { selectionForCurrentProfile } from "../services/profilePlanSelection";
import { GuidedScenarios } from "../components/retirement/GuidedScenarios";
import { AccuracyChecklist } from "../components/AccuracyChecklist";
import PlanSyncStatus from "../components/PlanSyncStatus";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation,useSearchParams } from "react-router";
import { m } from "motion/react";
import { Alert, Badge, Button, Card, Checkbox, Icon, Input, Modal, useNotification } from "../components/ui";
import CurrencyInput from "../components/CurrencyInput";
import { MonthlyRetirementChart } from "../components/charts";
import { MonthlyCashflowTable } from "../components/retirement/MonthlyCashflowTable";
import { SocialInsuranceModal } from "../components/SocialInsuranceModal";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import type { SavedPlanVersionResult } from "../context/RetirementPlanContext";
import {
  formatVNDCurrency,
  previewMonthlyRetirement,
  type RetirementPreviewResult,
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

function formatVNDShort(amount:string|number|null|undefined):string{return financeMoney(amount===null||amount===undefined?null:String(amount)).replace("₫","đ");}

export default function RetirementPlanPage() {
  const [activePlanSection, setActivePlanSection] = useState<string>("plan-overview");
  const location = useLocation();
  const { t, language } = useI18n();
  const formatVNDCurrency=(v:string|number|null|undefined)=>financeMoney(v===null||v===undefined?null:String(v),language==="en");
  const { user } = useAuth();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision, updateGoalInfo, loading:loadingProfile, loadError:profileError, reloadProfile } = useFinancialProfile();
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
  } = useRetirementPlan();

  const isFromNewOnboarding = Boolean(location.state?.fromOnboarding) || (
    typeof window !== "undefined" && window.sessionStorage?.getItem("anhuu_just_onboarded") === "1" && planVersions.length === 0
  );

  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState("");
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [previewAttempt,setPreviewAttempt]=useState(0);
  const [savedPreview, setSavedPreview] = useState<{ key: string; version: SavedPlanVersionResult } | null>(null);
  const operation = useRef(false);
  const requestedPreview=useRef("");
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
  const [planParams,setPlanParams]=useSearchParams();
  const planTab=planParams.get("tab")==="adjust"?"adjust":"result";
  const setPlanTab=(tab:"result"|"adjust")=>{const next=new URLSearchParams(planParams);next.set("tab",tab);next.delete("view");next.delete("dialog");setPlanParams(next);};
  const planSubView=(["compare","history","report"].includes(planParams.get("view")??"")?planParams.get("view"):"main") as "main"|"compare"|"history"|"report";
  const setPlanSubView=(view:string)=>{const next=new URLSearchParams(planParams);next.set("view",view);next.delete("dialog");setPlanParams(next);};
  const [delayYears, setDelayYears] = useState<number>(5);
  const [cutPercent, setCutPercent] = useState<number>(15);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyError,setApplyError]=useState("");
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [comparison,setComparison]=useState<{key:string;preview:RetirementPreviewResult|null;error:string}|null>(null);
  const [comparisonAttempt,setComparisonAttempt]=useState(0);
  const [planDialog,setPlanDialogState]=useState<"options"|"contribution"|null>(()=>planParams.get("dialog")==="contribution"?"contribution":planParams.get("dialog")==="options"?"options":null);
  const setPlanDialog=(value:"options"|"contribution"|null)=>{setPlanDialogState(value);if(planParams.has("dialog")){const next=new URLSearchParams(planParams);next.delete("dialog");setPlanParams(next,{replace:true});}};
  const [metricInfo,setMetricInfo]=useState<PlanMoneyMetric | null>(null);
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
    const policyId = draftSelection?.policyVersionId ?? baseline?.policyVersionId ?? v2Profile?.retirementSurvey?.policyVersionId;
    if (policyId && policyDetail?.id === policyId && policyAttempt===0) {
      setLoadingPolicy(false);
      return;
    }
    if (!policyId && loadingPlans) {
      return;
    }
    setLoadingPolicy(true);
    setPolicyDetail(null);
    (policyId ? fetchUserPortfolioPolicyDetail(policyId) : fetchUserPortfolioPolicies(1, 1).then(async res =>
      res.status === "AVAILABLE" && res.items.length ? fetchUserPortfolioPolicyDetail(res.items[0].id) : null
    )).then(detail => {
      if (active) setPolicyDetail(detail);
    })
      .catch(error => { if (active) setPolicyError(error instanceof Error ? error.message : String(error)); })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, [policyAttempt, draftSelection?.policyVersionId, baseline?.policyVersionId, v2Profile?.retirementSurvey?.policyVersionId, loadingPlans, user?.id]);

  // Keep the user's full requested period. The server reports missing policy coverage;
  // silently shortening it would make the goal and plan describe different retirements.
  const defaultEndMonth = draftSelection?.endMonth ?? v2Profile?.retirementGoal?.endMonth ?? null;

  const savedSurvey = v2Profile?.retirementSurvey;
  const initialExpense = draftSelection?.monthlyExpenseToday ?? v2Profile?.retirementGoal?.monthlyExpenseToday ?? savedSurvey?.monthlyExpenseToday;
  const effectiveAnswers = draftSelection?.answers ?? baseline?.answers ?? (savedSurvey&&savedSurvey.policyVersionId===policyDetail?.id?savedSurvey.answers:undefined) ??
    (policyDetail?.data?.questions ?? []).flatMap(q => surveyAnswers[q.id] ? [{ questionId: q.id, choiceId: surveyAnswers[q.id] }] : []);
  const hasCompleteSurvey = Boolean(policyDetail?.data?.questions && policyDetail.data.questions.every(q =>
    effectiveAnswers.some((a: { questionId: string; choiceId?: string }) => a.questionId === q.id && q.choices.some(c => c.id === a.choiceId))
  ));
  const usesActualBalance = Boolean(currentVersion?.preview.reforecast);
  const viewingCurrent = Boolean(currentVersion && ((!draftSelection && !synchronization.changed) || usesActualBalance));

  const previewPayload = useMemo<RetirementPreviewInput | null>(() => {
    if (baseline) return usesActualBalance ? baseline : synchronization.input;
    if (!policyDetail || !defaultEndMonth || !v2Profile || initialExpense===undefined) return null;
    const initial = initialPlanSelection(v2Profile, profileRevision, policyDetail.id, defaultEndMonth, initialExpense, effectiveAnswers);
    return reviseSelection(initial, draftSelection ?? {}, profileRevision);
  }, [baseline, JSON.stringify(synchronization.input), draftSelection, usesActualBalance, policyDetail, defaultEndMonth, v2Profile, profileRevision, profile, surveyAnswers, initialExpense]);

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

  const birthYear = v2Profile?.personal?.birthMonth?.status === "KNOWN" ? Number(v2Profile.personal.birthMonth.value.slice(0, 4)) : NaN;
  const birthMonth = v2Profile?.personal?.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value.slice(5, 7) : "";
  const currentAge = v2Profile&&Number.isFinite(birthYear)?Math.floor(((Number(v2Profile.valuationDate.slice(0,4))-birthYear)*12+Number(v2Profile.valuationDate.slice(5,7))-Number(birthMonth))/12):18;
  const selectedRetirementMonth=draftSelection?.whatIf?.retirementMonth??previewPayload?.whatIf?.retirementMonth??(v2Profile?.personal.desiredRetirementMonth.status==="KNOWN"?v2Profile.personal.desiredRetirementMonth.value:null);
  const targetRetireAge=selectedRetirementMonth&&Number.isFinite(birthYear)?Math.floor(((Number(selectedRetirementMonth.slice(0,4))-birthYear)*12+Number(selectedRetirementMonth.slice(5,7))-Number(birthMonth))/12):undefined;

  const handleAgeChange = (newAge: number) => {
    const clamped = Math.max(currentAge, Math.min(100, newAge));
    if(!Number.isFinite(birthYear)||!birthMonth)return;
    const targetRetirementMonth = `${birthYear + clamped}-${birthMonth}`;
    updateDraft({
      whatIf: {
        ...previewPayload?.whatIf,
        retirementMonth: targetRetirementMonth,
      },
    });
  };

  useEffect(() => {
    if (baseline || !previewPayload || !hasCompleteSurvey || viewingCurrent || loadingPlans || plansError || loadingPolicy || policyError || loadingProfile || profileError) return;
    const key=JSON.stringify([user?.id,previewPayload,previewAttempt]);
    // Refreshing the newly saved plan must not restart the same projection while
    // its confirmation is open. An explicit retry or changed input gets a new key.
    if(requestedPreview.current===key&&manualPreviewInput)return;
    requestedPreview.current=key;
    void runPreview(previewPayload);
  }, [previewPayload, viewingCurrent, loadingPlans, plansError,loadingPolicy,policyError,loadingProfile,profileError,previewAttempt,user?.id,manualPreviewInput,hasCompleteSurvey]);

  const inputMatches = Boolean(previewPayload && lastPreviewInput && JSON.stringify(previewPayload) === JSON.stringify(lastPreviewInput));
  const canUsePreview = !viewingCurrent && inputMatches && previewStatus === "ready" && hasCompleteSurvey && !loadingPlans && !plansError && !loadingPolicy && !policyError && !loadingProfile && !profileError;
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
    operation.current = true; setIsApplying(true);setApplyError("");
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
      setApplyError(e instanceof Error ? e.message : String(e));
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

  const displayedPreview = !loadingPlans&&!plansError&&!loadingProfile&&!profileError&&!loadingPolicy&&!policyError ? (viewingCurrent ? synchronization.status==="ready"?synchronization.preview:null : canUsePreview?previewData:null) : null;

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
  // Full amount that opens the server's step-by-step metric explanation while explain mode is on.
  const explainMoney = (metric: string, value: string | null | undefined) => value == null ? unknown
    : explanationSource ? <Explain metric={metric} source={explanationSource} value={String(value)}>{formatVNDCurrency(value)}</Explain>
    : formatVNDCurrency(value);

  // The dial always measures progress to the required fund (100%). Only the
  // drawing is clamped; keep the API's actual coverage, including negative values.
  const referenceContribution=contributionInput(summary?.requiredConstantMonthlyContribution,true);
  const comparisonInput=useMemo(()=>displayedPreview&&!usesActualBalance&&Number(displayedPreview.calculation?.summary.atRetirement.fundingGap)>0&&referenceContribution!==null&&referenceContribution!==displayedPreview.selection.monthlyContribution?{...displayedPreview.selection,expectedProfileRevision:profileRevision,monthlyContribution:referenceContribution}:null,[displayedPreview?.inputHash,referenceContribution,usesActualBalance,profileRevision]);
  const comparisonKey=comparisonInput?JSON.stringify([user?.id,displayedPreview?.inputHash,comparisonInput]):"";
  useEffect(()=>{
    if(!comparisonInput){setComparison(null);return;}
    const controller=new AbortController();let active=true;
    setComparison(null);
    void previewMonthlyRetirement(comparisonInput,controller.signal).then(preview=>{if(active)setComparison({key:comparisonKey,preview,error:preview.status==="READY"?"":language==="en"?"Reference option needs more information.":"Phương án tham chiếu cần bổ sung thông tin."});}).catch(error=>{if(active)setComparison({key:comparisonKey,preview:null,error:error instanceof Error?error.message:String(error)});});
    return()=>{active=false;controller.abort();};
  },[comparisonKey,comparisonAttempt]);
  const comparisonPreview=comparison?.key===comparisonKey?comparison.preview:null;
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

  const hasUnfundedWithdrawals=Number(summary?.unfundedWithdrawals)>0;
  const hasAccumulation=Number(summary?.accumulationMonths)>0;
  const needsUpfrontFunding=hasAccumulation&&hasFundingShortfall&&summary?.requiredConstantMonthlyContribution==null;
  const heroAmount=hasAccumulation?summary?.requiredConstantMonthlyContribution:summary?.atRetirement.fundingGap?.startsWith("-")?"0":summary?.atRetirement.fundingGap;
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
  }, [planSubView]);

  const planBusy=loadingProfile||loadingPlans||loadingPolicy||previewStatus==="loading";
  const planStateError=profileError||plansError||policyError||(previewPayload&&hasCompleteSurvey?previewError:null);
  const missingPlanDetails:Array<{label:string;to:string}>=[];
  if(!v2Profile)missingPlanDetails.push({label:language==="en"?"Review your financial profile":"Bổ sung hồ sơ tài chính",to:"/user/profile"});
  else {
    if(v2Profile.personal.birthMonth.status!=="KNOWN"||v2Profile.personal.desiredRetirementMonth.status!=="KNOWN")missingPlanDetails.push({label:language==="en"?"Confirm birth and retirement months":"Bổ sung mốc sinh và nghỉ hưu",to:"/user/goal"});
    if(!defaultEndMonth&&!baseline)missingPlanDetails.push({label:language==="en"?"Set the fund preparation horizon":"Bổ sung thời gian chuẩn bị quỹ",to:"/user/goal"});
    if(!baseline&&initialExpense===undefined)missingPlanDetails.push({label:language==="en"?"Set retirement spending":"Bổ sung chi tiêu nghỉ hưu",to:"/user/goal"});
  }
  if(!loadingPolicy&&!policyError&&!policyDetail)missingPlanDetails.push({label:language==="en"?"No published portfolio policy is available. Request support.":"Chưa có chính sách phân bổ đã công bố. Yêu cầu hỗ trợ.",to:"/user/support"});
  else if(policyDetail&&!hasCompleteSurvey)missingPlanDetails.push({label:language==="en"?"Review your saved risk survey results":"Kiểm tra kết quả khảo sát rủi ro đã lưu",to:"/user/risk-portfolio"});
  const retryPlan=()=>{
    if(planBusy)return;
    if(profileError){reloadProfile();return;}
    if(plansError){void refreshPlans();return;}
    if(policyError||!policyDetail){setPolicyAttempt(n=>n+1);return;}
    if(baseline)synchronization.retry();else setPreviewAttempt(n=>n+1);
  };

  if(planSubView!=="main")return <PlanSavedViews key={planSubView} view={planSubView} input={!loadingPlans&&!plansError?previewPayload:null} retirementMonth={previewPayload?.whatIf?.retirementMonth??(v2Profile?.personal.desiredRetirementMonth.status==="KNOWN"?v2Profile.personal.desiredRetirementMonth.value:undefined)} back={()=>setPlanSubView("main")} />;

  return (
    <div className="retirement-plan-page">
      <div className="page-head" style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#052659", margin: "0 0 8px" }}>{t("plan.page_title")}</h1>
        <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>{language==="en"?"Understand the amount to prepare, then choose a suitable next step.":"Hiểu số tiền cần chuẩn bị, rồi chọn một bước phù hợp với bạn."}</p>
      </div>

      {!displayedPreview&&<section className="plan-state-card plan-setup-notice" role={planStateError?"alert":"status"} aria-live="polite">
        {!planBusy && !planStateError && (
          <span className="plan-setup-badge">{language === "en" ? "Profile incomplete" : "Cần hoàn thiện hồ sơ"}</span>
        )}
        <h2>{planBusy?(language==="en"?"Updating plan…":"Đang cập nhật kế hoạch…"):planStateError?(language==="en"?"Could not load your plan":"Chưa tải được kế hoạch"):language==="en"?"Complete the information needed for your plan":"Hoàn thiện thông tin để tính kế hoạch"}</h2>
        {!planBusy&&<>
          {planStateError?<p className="plan-setup-desc">{planStateError}</p>:<><p className="plan-setup-desc">{language==="en"?"The projection will appear when the following information is available. Your existing entries are kept.":"Kết quả sẽ hiển thị khi có đủ các thông tin dưới đây. Những dữ liệu đã khai được giữ nguyên."}</p><ul className="plan-setup-steps">{missingPlanDetails.map(item=><li key={item.label} className="plan-setup-step-item"><Link to={item.to} className="plan-setup-step-link"><span className="step-bullet-icon" aria-hidden="true">→</span><span className="step-text">{item.label}</span></Link></li>)}{!missingPlanDetails.length&&uniqueIssues.map(issue=><li key={issue.code} className="plan-setup-step-item"><span className="step-text">{translateIssueCode(issue.code,language)}</span></li>)}</ul></>}
          <div className="plan-state-actions">
            {!planStateError&&<button type="button" className="overview-button primary" onClick={()=>setPlanDialog("options")}><Icon name="target" /><span>{language==="en"?"Set up your plan":"Thiết lập phương án"}</span></button>}
            {planStateError&&<button className="overview-button secondary" onClick={retryPlan}>{language==="en"?"Retry":"Thử lại"}</button>}
            {!missingPlanDetails.length&&!planStateError&&<><Link className="overview-button secondary" to="/user/profile">{language==="en"?"Review financial data":"Kiểm tra dữ liệu tài chính"}</Link><Link className="overview-button secondary" to="/user/risk-portfolio">{language==="en"?"Review allocation":"Kiểm tra phân bổ"}</Link></>}
            {!policyDetail&&!policyError&&<button className="overview-button secondary" onClick={retryPlan}>{language==="en"?"Reload portfolio policy":"Tải lại chính sách phân bổ"}</button>}
          </div>
        </>}
      </section>}
      {!displayedPreview&&!planBusy&&!planStateError&&planTab==="result"&&<PlanEmptyResult onSetup={()=>setPlanDialog("options")}/>}
      {/* Plan Status Bar matching demo */}
      {displayedPreview&&<div
        className={`plan-status plan-next${viewingCurrent?" is-current":""}`}
        style={{
          background: viewingCurrent?"#edf7f3":"#fffbeb",
          border: viewingCurrent?"1px solid #b8dcca":"1px solid #f5d996",
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
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: viewingCurrent?"#167a4e":"#d97706", marginTop: "7px", flexShrink: 0 }} />
          <div>
            <strong style={{ color: "#132b45", fontSize: "14px", display: "block", marginBottom: "4px" }}>
              {viewingCurrent?(language==="en"?"Current main plan":"Kế hoạch chính đang dùng"):baseline?(language==="en"?"Your inputs have changed. Save to use the new results?":"Bạn đã thay đổi hồ sơ. Lưu để dùng kết quả mới?"):(language === "en" ? "Next step: save this option as your main plan" : "Bước tiếp theo: lưu phương án này làm kế hoạch chính")}
            </strong>
            <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#4f6478", lineHeight: 1.55 }}>
              <li>
                {viewingCurrent?(language==="en"?`Saved version v${currentVersion?.version} · Contribution ${formatVNDCurrency(summary?.plannedMonthlyContribution??null)}/month.`:`Phiên bản v${currentVersion?.version} đã lưu · Mức góp ${formatVNDCurrency(summary?.plannedMonthlyContribution??null)}/tháng.`):language === "en"
                  ? `Choose your monthly contribution (currently trying ${formatVNDCurrency(summary?.plannedMonthlyContribution ?? null)}).`
                  : `Chọn mức góp mỗi tháng (hiện đang thử ${formatVNDCurrency(summary?.plannedMonthlyContribution ?? null)}).`}
              </li>
              <li>
                {viewingCurrent?(language==="en"?"Edit this plan to try a draft, or open the saved report.":"Chỉnh sửa để thử phương án mới hoặc mở báo cáo của kế hoạch đã lưu."):(language === "en"
                  ? "Save as main plan to track progress and view reports."
                  : "Lưu làm kế hoạch chính để theo dõi tiến độ và xem báo cáo.")}
              </li>
            </ol>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setPlanDialog(viewingCurrent?"options":"contribution")}
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
            {viewingCurrent?(language==="en"?"Edit plan":"Chỉnh sửa phương án"):(language === "en" ? "Choose contribution" : "Chọn mức góp")}
          </button>
          {viewingCurrent?<button type="button" className="overview-button primary" onClick={()=>setPlanSubView("report")}>{language==="en"?"View report":"Xem báo cáo"}</button>:<button
            type="button"
            disabled={!canUsePreview||isSaving||isApplying}
            onClick={() => {setApplyError("");setShowApplyConfirm(true);}}
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
          </button>}
        </div>
      </div>}

      {planTab === "result" && displayedPreview && (
        <>
          <section id="plan-overview" className="plan-section" aria-labelledby="plan-overview-title" tabIndex={-1}>
            <h2 id="plan-overview-title" className="sr-only">
              {language === "en" ? "Your plan at a glance" : "Tổng quan kế hoạch của bạn"}
            </h2>
            {/* Primary Result Hero - demo layout */}
            <m.div
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
                  {needsUpfrontFunding?(language==="en"?"Review upfront capital before contributing":"Cần bổ sung vốn trước khi góp"):hasAccumulation?(language==="en"?"To reach your goal, the reference monthly contribution is":"Để đạt được mục tiêu, mức góp cần khoảng"):(language==="en"?"Additional capital to prepare":"Phần vốn cần chuẩn bị thêm")}
                </h2>
                <strong
                  className="plan-summary-hero__number"
                  title={heroAmount!=null?formatVNDCurrency(heroAmount):""}
                >
                  {needsUpfrontFunding?(language==="en"?"Review required":"Cần rà soát"):heroAmount!=null?<>{formatCompactVND(heroAmount)}{hasAccumulation&&<small> / {language==="en"?"month":"tháng"}</small>}</>:unknown}
                </strong>

                {needsUpfrontFunding&&<p className="plan-summary-hero__desc">{language==="en"?"No monthly contribution solution is available for the current contribution periods. Review upfront capital, timing and spending.":"Chưa xác định được mức góp hàng tháng cho các kỳ góp hiện tại. Hãy rà soát vốn đầu kỳ, thời điểm nghỉ hưu và chi tiêu."}</p>}
                <p className="plan-summary-hero__desc">
                  {language === "en" ? (
                    <>
                      You are currently trying <strong>{formatVNDCurrency(summary?.plannedMonthlyContribution ?? null)}/month</strong>. First month contribution budget: <strong>{financeMoney(displayedPreview?.calculation?.rows?.[0]?.contributionCapacity??null,language==="en")}</strong>.
                    </>
                  ) : (
                    <>
                      Bạn đang thử góp <strong>{formatVNDCurrency(summary?.plannedMonthlyContribution ?? null)}/tháng</strong>. Ngân sách có thể góp ở tháng đầu: <strong>{financeMoney(displayedPreview?.calculation?.rows?.[0]?.contributionCapacity??null,false)}</strong>.
                    </>
                  )}
                </p>

                <div className="plan-hero-actions">
                  <div className="plan-hero-actions__main" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <Button
                      variant="primary"
                      size="medium"
                      className="plan-hero-action"
                      onClick={() => setPlanDialog("contribution")}
                    >
                      {language === "en" ? "Choose contribution" : "Chọn mức góp"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="medium"
                      className="plan-hero-action"
                      onClick={() => setPlanDialog("options")}
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
                  {/* coverageText never rounds a shortfall up to 100% (99.9999 → "< 100"). */}
                  <strong>{coveragePercentRaw !== null ? `${coverageText}%` : unknown}</strong>
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
                  <strong>{summary ? formatMonthVN(summary.firstShortfallMonth || summary.endMonth) : unknown}</strong>
                  <small>{language === "en" ? "Under the current assumptions" : "Theo giả định đang dùng"}</small>
                </div>
              </div>
            </m.div>

            {/* 4 key metrics, demo order: need · have · gap · spending */}
            <div
              className="metric-grid plan-metrics"
              style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px", margin: "18px 0" }}
            >
              {[
                {
                  key: "required" as const,
                  label: language === "en" ? "Fund needed at retirement" : "Quỹ cần khi nghỉ hưu",
                  val: summary?.atRetirement?.requiredFund != null ? formatCompactVND(summary.atRetirement.requiredFund) : unknown,
                  sub: <>{explainMoney("summary.atRetirement.requiredFund", summary?.atRetirement?.requiredFund)} · Tính theo các khoản chi đã khai</>,
                  top: "#795290",
                  bg: "#fbf6fd",
                },
                {
                  key: "projected" as const,
                  label: language === "en" ? "Projected fund" : "Quỹ dự kiến có",
                  val: summary?.atRetirement?.projectedFund != null ? formatCompactVND(summary.atRetirement.projectedFund) : unknown,
                  sub: <>{explainMoney("summary.atRetirement.projectedFund", summary?.atRetirement?.projectedFund)} · Có thể dùng khi nghỉ hưu</>,
                  top: "#2563eb",
                  bg: "#f2f7ff",
                },
                {
                  key: "gap" as const,
                  label: language === "en" ? "Remaining gap" : "Phần còn thiếu",
                  val: summary?formatCompactVND(summary.atRetirement.fundingGap?.startsWith("-")?"0":summary.atRetirement.fundingGap):unknown,
                  sub: `${summary?formatVNDCurrency(summary.atRetirement.fundingGap?.startsWith("-")?"0":summary.atRetirement.fundingGap):unknown} · Chênh lệch tại mốc nghỉ hưu`,
                  top: "#d97706",
                  bg: "#fffaf0",
                },
                {
                  key: "expense" as const,
                  label: language === "en" ? "Spending in retirement" : "Chi tiêu lúc nghỉ hưu",
                  val: summary ? formatCompactVND(summary.futureMonthlyExpense, true) : unknown,
                  sub: `${summary ? formatVNDCurrency(summary.futureMonthlyExpense) : unknown}/tháng · Quy đổi từ giá hôm nay`,
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
                    <button type="button" aria-label={`${language==="en"?"Explain":"Giải thích"}: ${m.label}`} aria-haspopup="dialog" onClick={()=>setMetricInfo(m.key)} className="money-info-trigger"><Icon name="info" /></button>
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
                        : `Từ ${summary.valuationDate?formatMonthVN(summary.valuationDate.slice(0,7)):unknown} đến ${summary.endMonth ? formatMonthVN(summary.endMonth) : unknown}`}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#637589", fontWeight: 500 }}>
                    {language === "en" ? "Monthly model" : "Mô hình theo tháng"}
                  </span>
                </div>
                <MonthlyRetirementChart responsive rows={calculation.rows} summary={summary} comparisonRows={comparisonPreview?.calculation?.rows} comparisonLabel={`${language==="en"?"If contributing":"Nếu chọn góp"} ${formatVNDCurrency(referenceContribution)}/${language==="en"?"month":"tháng"}`} birthYear={birthYear} birthMonth={v2Profile?.personal.birthMonth.status==="KNOWN"?v2Profile.personal.birthMonth.value:undefined} />
                {comparisonInput&&<div className="plan-comparison-note" aria-live="polite"><strong>{language==="en"?"A reference option to close the gap":"Phương án tham chiếu để thu hẹp khoảng thiếu"}</strong>{comparison?.key===comparisonKey&&comparison.error?<p>{comparison.error} <button type="button" className="overview-button secondary" onClick={()=>setComparisonAttempt(n=>n+1)}>{language==="en"?"Retry comparison":"Thử lại đối chiếu"}</button></p>:comparisonPreview?.calculation?<p>{language==="en"?"With a reference monthly contribution of":"Nếu chọn mức góp tham chiếu"} <strong>{formatVNDCurrency(referenceContribution)}</strong>, {language==="en"?"the projected fund at retirement is":"quỹ dự kiến tại mốc nghỉ hưu là"} <strong>{formatVNDCurrency(comparisonPreview.calculation.summary.atRetirement.projectedFund)}</strong>. {Number(comparisonPreview.calculation.summary.atRetirement.fundingGap)>0?(language==="en"?"Budget constraints still leave a funding gap. Review timing, capital or spending.":"Giới hạn ngân sách vẫn để lại khoảng thiếu. Cần rà soát thêm thời điểm, vốn hoặc chi tiêu."):(language==="en"?"The option reaches the retirement target under the current assumptions.":"Phương án đáp ứng mục tiêu tại mốc nghỉ hưu trong các giả định đang dùng.")}</p>:<p>{language==="en"?"Calculating the reference option…":"Đang tính phương án đối chiếu…"}</p>}<Link to="/user/risk-portfolio" className="overview-button secondary">{language==="en"?"Review asset allocation →":"Xem kế hoạch phân bổ để thu hẹp khoảng thiếu →"}</Link></div>}

              </div>
            )}

            {/* Plan Health Card */}
            <section className={`plan-health ${summary?.requiredContributionWithinCapacity===false ? "is-warning" : "is-ready"}`} style={{ background: "#ffffff", border: "1px solid #d5e3f0", borderRadius: "16px", padding: "22px 24px", margin: "18px 0" }}>
              <div className="plan-health-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", marginBottom: "16px" }}>
                <div className="plan-health-title">
                  <strong style={{ fontSize: "16px", color: "#052659" }}>
                    {summary?.requiredContributionWithinCapacity===false?(language==="en"?"The target contribution exceeds capacity in some months":"Mức cần góp đang vượt khả năng ở một số tháng"):(language === "en" ? "Reconcile goal with monthly capacity" : "Đối chiếu mục tiêu với khả năng góp")}
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
                    {summary ? financeMoney(displayedPreview?.calculation?.rows?.[0]?.contribution??null,language==="en") : unknown}{" "}
                    <small style={{ fontSize: "12px", fontWeight: 400 }}>/{language === "en" ? "mo" : "tháng"}</small>
                  </strong>
                </div>
                <div className="health-kpi" style={{ padding: "16px", border: "1px solid #dce7f3", borderRadius: "10px", background: "#F9FBFF" }}>
                  <span style={{ fontSize: "12px", color: "#536779" }}>{language === "en" ? "First month capacity" : "Khả năng ngân sách tháng đầu"}</span><button type="button" className="money-info-trigger" aria-haspopup="dialog" aria-label={language === "en" ? "Explain: Contribution capacity" : "Giải thích: Khả năng ngân sách"} onClick={()=>setMetricInfo("capacity")}><Icon name="info" /></button>
                  <strong style={{ display: "block", fontSize: "20px", color: "#052659", margin: "6px 0 2px" }}>
                    {financeMoney(displayedPreview?.calculation?.rows?.[0]?.contributionCapacity??null,language==="en")}{" "}
                    <small style={{ fontSize: "12px", fontWeight: 400 }}>/{language === "en" ? "mo" : "tháng"}</small>
                  </strong>
                </div>
                <div className={`health-kpi ${hasUnfundedWithdrawals ? "is-short" : ""}`} style={{ padding: "16px", border: "1px solid #dce7f3", borderRadius: "10px", background: "#F9FBFF" }}>
                  <span style={{ fontSize: "12px", color: "#536779" }}>{language === "en" ? "Unfunded after fund runs out" : "Chi chưa có nguồn sau khi quỹ cạn"}</span>
                  <strong style={{ display: "block", fontSize: "20px", color: hasUnfundedWithdrawals ? "#c0392b" : "#052659", margin: "6px 0 2px" }}>
                    {summary?financeMoney(summary.unfundedWithdrawals,language==="en"):unknown}
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
                    {language==="en"?"CAPITAL AND PORTFOLIO":"CẤU TRÚC VỐN & DANH MỤC"}
                  </span>
                  <strong style={{ fontSize: "16px", color: "#052659" }}>
                    {language==="en"?"Asset allocation":"Phân bổ tài sản"}
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
              {displayedPreview?.capitalSeparation?<div className="plan-capital-buckets" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", fontSize: "13px" }}>
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fbff", border: "1px solid #e1ebf5" }}>
                  <span style={{ color: "#536779", display: "block", fontSize: "12px" }}>1. Dự phòng ({displayedPreview?.capitalSeparation?.reserveMonths??"—"} tháng)</span>
                  <strong style={{ color: "#052659", fontSize: "15px" }}>{financeMoney(displayedPreview?.capitalSeparation?.requiredEmergencyReserve??null,language==="en")}</strong>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fbff", border: "1px solid #e1ebf5" }}>
                  <span style={{ color: "#536779", display: "block", fontSize: "12px" }}>2. Mục tiêu gần hạn</span>
                  <strong style={{ color: "#052659", fontSize: "15px" }}>{financeMoney(displayedPreview?.capitalSeparation?.nearTermGoalsPresentValue??null,language==="en")}</strong>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#f8fbff", border: "1px solid #e1ebf5" }}>
                  <span style={{ color: "#536779", display: "block", fontSize: "12px" }}>3. Vốn đầu tư dài hạn</span>
                  <strong style={{ color: "#052659", fontSize: "15px" }}>{financeMoney(displayedPreview?.capitalSeparation?.growthCapital??null,language==="en")}</strong>
                </div>
              </div>:<p>{language==="en"?"This saved version does not include a detailed capital split. Its starting fund is shown above; open Allocation to review the current profile split.":"Phiên bản đã lưu chưa có bảng tách vốn chi tiết. Số vốn bắt đầu được giữ theo phiên bản; mở Phân bổ để xem cách tách vốn của hồ sơ hiện tại."}</p>}
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
                  <small>{language === "en" ? "Review your saved versions" : "Xem lại các phiên bản đã lưu"}</small>
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
          <button type="button" className="overview-button secondary" onClick={()=>setPlanTab("result")}>{language==="en"?"← Back to results":"← Quay lại kết quả"}</button>
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
                      value={targetRetireAge??""}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance || !Number.isFinite(birthYear) || !birthMonth}
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
                      value={targetRetireAge??""}
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance || !Number.isFinite(birthYear) || !birthMonth}
                      onChange={e => handleAgeChange(Number(e.target.value))}
                      style={{ width: "100%", cursor: "pointer" }}
                    />
                  </div>
                </div>

                <div className="field">
                  <ProfileFormattedInput format="money"
                    label={language === "en" ? "Monthly retirement spending" : "Chi tiêu nghỉ hưu / tháng"}
                    value={previewPayload?.monthlyExpenseToday??draftSelection?.monthlyExpenseToday??v2Profile?.retirementGoal?.monthlyExpenseToday??savedSurvey?.monthlyExpenseToday??""}
                    disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                    onChange={val => {
                      updateDraft({ monthlyExpenseToday: String(val) });

                    }}

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
                    ? `Monthly surplus after expenses and debt payments: ${formatVNDCurrency(calculation.rows[0].contributionCapacity)}`
                    : `Phần dư mỗi tháng sau chi tiêu và trả nợ: ${formatVNDCurrency(calculation.rows[0].contributionCapacity)}`}
                </p>
              )}
            </div>

            {(() => {
              const monthlyCapacity = calculation?.rows?.[0]?.contributionCapacity;
              const capacityNum = monthlyCapacity != null && monthlyCapacity !== "" && !isNaN(Number(monthlyCapacity)) ? Math.floor(Number(monthlyCapacity)) : null;
              const requiredConstantRaw = summary?.requiredConstantMonthlyContribution;
              const requiredNum = requiredConstantRaw != null && requiredConstantRaw !== "" && !isNaN(Number(requiredConstantRaw)) ? Math.ceil(Number(requiredConstantRaw)) : null;

              const currentVal = previewPayload?.monthlyContribution ?? draftSelection?.monthlyContribution ?? "0";
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
                      <ProfileFormattedInput format="money"
                        label={language === "en" ? "Monthly retirement contribution" : "Tiền bạn chọn góp hưu trí mỗi tháng"}
                        helper={language === "en" ? "Money left after expenses and debt payments is not contributed automatically." : "Tiền còn lại sau chi tiêu và trả nợ không tự động được góp vào quỹ."}
                        value={previewPayload?.monthlyContribution??draftSelection?.monthlyContribution??""}
                        disabled={loadingPlans || isSaving || isApplying || usesActualBalance}

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
                <ProfileFormattedInput format="money"
                  label={language === "en" ? "Money reserved each month" : "Tiền giữ lại mỗi tháng ngoài quỹ hưu trí"}
                  helper={language === "en" ? "Kept for emergencies or other goals; not invested for retirement." : "Để dành cho dự phòng hoặc mục tiêu khác, không đưa vào quỹ hưu trí."}
                  value={previewPayload?.monthlyReserve??draftSelection?.monthlyReserve??""}
                  disabled={loadingPlans || isSaving || isApplying || usesActualBalance}

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
                    <ProfileFormattedInput format="money"
                      label={language === "en" ? "Available Disposable Cash at Start *" : "Tiền sẵn có để góp vào đầu tháng (đồng) *"}
                      helper={language === "en" ? "Money already in hand on the 1st, not taken from the retirement fund." : "Tiền đã có trong tay ngày đầu tháng, không trích từ quỹ hưu trí."}
                      placeholder="5.000.000"
                      disabled={loadingPlans || isSaving || isApplying || usesActualBalance}
                      value={startOfMonthAvailable}

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
                {!summary?unknown:hasFundingShortfall?formatVNDCurrency(summary.retirementFundingShortfall):(language === "en" ? "No shortfall" : "Đạt mục tiêu")}
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

      {metricInfo && displayedPreview && <PlanMoneyExplanation metric={metricInfo} preview={displayedPreview} onClose={()=>setMetricInfo(null)} onAdjust={()=>setPlanDialog(metricInfo==="required"||metricInfo==="expense"?"options":"contribution")} onHistory={()=>setPlanSubView("history")} />}
      {planDialog==="options"&&<PlanOptionsDialog isCurrent={viewingCurrent} onClose={()=>setPlanDialog(null)} onContribution={()=>setPlanDialog("contribution")} onAdvanced={()=>setPlanTab("adjust")} onHistory={()=>setPlanSubView("history")} />}
      {planDialog==="contribution"&&<PlanContributionDialog preview={displayedPreview??null} initial={draftSelection?.monthlyContribution??displayedPreview?.selection.monthlyContribution??""} readonly={usesActualBalance} onClose={()=>setPlanDialog(null)} onSave={value=>{updateDraft({monthlyContribution:value});setPlanTab("result");}} />}

      {/* Apply Confirmation Modal */}
      <ResponsiveDialog className="user-workspace-dialog" open={showApplyConfirm} title={language === "en" ? "Confirm Retirement Plan Application" : "Xác nhận đổi kế hoạch đang dùng"} onClose={() => { if (!isApplying) setShowApplyConfirm(false); }}>
            {applyError&&<p role="alert" className="remaining-error">{applyError}</p>}
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
      </ResponsiveDialog>

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
