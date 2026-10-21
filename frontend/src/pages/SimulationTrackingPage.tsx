import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import MoneyTextBox from "../components/MoneyTextBox";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Icon, IconButton, Modal, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useAuth } from "../context/AuthContext";
import { reviseSelection } from "../services/planSelection";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { formatDateVN, formatMonthVN } from "../utils/date";
import { LoanRevisionEditor } from "../components/retirement/LoanRevisionEditor";
import { AnchorReforecastResult } from "../components/retirement/AnchorReforecastResult";
import {
  formatVNDCurrency,
  formatPercentNumber,
  WARNING_MESSAGES,
  type RetirementPreviewInput,
  type RetirementPreviewResult,
} from "../services/retirement";

import {
  simulatePlanVersion,
  type SimulatePlanResponse,
  previewSourceReforecast,
  saveSourceReforecast,
  type FlowSourceCommand,
  type SourceReforecastPreviewResponse,
  type SourceReforecastPreviewInput,
  type PensionSourceSelection,
  type LoanSourceRevisionCommand,
  type LoanCreation,
  type LoanContractV2,
  type RefinanceCommand,
  type PlannedPairCommand,
  type AssetSourceCommand,
  type AssetCapital,
  type AssetPlannedContribution,
  type AssetAvailabilityRelease,
  generateContractPeriods,
} from "../services/plans";
import { EvidenceEditor, emptyEvidence, submittedEvidence } from "../components/EvidenceEditor";
import { Decimal } from "../utils/decimal";
import { ApiError } from "../services/api";
import { listPensionEstimates, type PensionEstimateRecord } from "../services/insurance";
import {
  listActualMonths,
  getActualMonth,
  writeActualMonth,
  reforecastPlan,
  previewReforecast,
  saveReforecast,
  calculateLocalReconciliation,
  ACTUAL_KIND_LABELS,
  getActualKindLabel,
  type ActualKind,
  type ActualPayload,
  type ActualEntry,
  type ActualMonthDetail,
  type ActualForecastResult,
  type FutureChange,
  type FutureChangeField,
  type ReforecastPreviewResponse,
  type ReforecastPreviewCommand,
} from "../services/actuals";
import { useI18n } from "../i18n";
import { formatNumberWithDots } from "../utils/currency";
import "./simulation-audit.css";
import { formatVND, formatVNDText, getVietnamCurrentMonth } from "./simulation/format";
import { Explain, type ExplainSource } from "../components/explanations/ExplainMode";

export { formatVNDText };
// The actuals tab (ledger, reforecast, source changes) is most of this page's
// code; load it only when that tab is opened.
const ActualsTab = lazy(() => import("./simulation/ActualsTab"));
const WHAT_IF_DEBOUNCE_MS = 400;

export default function SimulationTrackingPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
  const { activePlan, currentVersion, savePlanVersion, applyVersion, loadingPlans, plansError, refreshPlans } = useRetirementPlan();

  // Top level active tab: T08 (What-If & Compare) vs T09 (Actual Ledger & Reforecast)
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") === "actuals" ? "actuals" : "what-if";
  // Set by the actuals tab while it is writing, so the tab switch cannot interrupt a save.
  const [actualsBusy, setActualsBusy] = useState(false);
  // Once opened, the actuals tab stays mounted (hidden) so unsaved ledger input
  // survives switching tabs, as before the split.
  const [actualsOpened, setActualsOpened] = useState(activeTab === "actuals");
  useEffect(() => { if (activeTab === "actuals") setActualsOpened(true); }, [activeTab]);
  const setActiveTab = (tab: "what-if" | "actuals") => setParams(prev => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; });

  // ==========================================
  // TAB 1: WHAT-IF & COMPARE (FE-T08) STATE
  // ==========================================
  const [simAttempt, setSimAttempt] = useState(0);
  const baselineSelection = currentVersion?.preview.selection;
  const [scenario, setScenario] = useState<"BASE" | "ADVERSE" | "FAVORABLE">("BASE");

  const [simRetireAge, setSimRetireAge] = useState(profile.goal.targetRetireAge || 60);
  const [simMonthlySave, setSimMonthlySave] = useState(Math.max(0, profile.plan.monthlySavings));
  const [simExpense, setSimExpense] = useState(
    profile.goal.monthlyExpenseInRetirement || profile.expenses.essentialExpense + profile.expenses.lifestyleExpense
  );

  // Hypothetical asset overrides for what-if
  const [overrideCash, setOverrideCash] = useState<string>("");
  const [overrideRealEstate, setOverrideRealEstate] = useState<string>("");
  const [overrideStock, setOverrideStock] = useState<string>("");

  const [initializedVersion, setInitializedVersion] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<RetirementPreviewResult | null>(null);
  const [simExplanationInput, setSimExplanationInput] = useState<RetirementPreviewInput | null>(null);
  const [comparisonDelta, setComparisonDelta] = useState<SimulatePlanResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyNotice, setApplyNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const scenarioSaving = useRef(false);
  const savedScenario = useRef<{ hash: string; saved: NonNullable<Awaited<ReturnType<typeof savePlanVersion>>> } | null>(null);

  const birthYear = useMemo(() => {
    const birthMonthStr = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : null;
    if (birthMonthStr) {
      return parseInt(birthMonthStr.slice(0, 4), 10);
    }
    return new Date().getFullYear() - (profile.personal.age || 30);
  }, [v2Profile, profile]);

  const netWorth = useMemo(() => {
    const totalAssets =
      profile.assets.cashSavings +
      profile.assets.realEstateValue +
      profile.assets.liquidAssets +
      profile.assets.stockFundValue;
    const totalDebt = profile.debt.hasDebt
      ? profile.debt.mortgageDebt + profile.debt.consumerDebt
      : 0;
    return totalAssets - totalDebt;
  }, [profile]);

  const retirementMonthSuffix = currentVersion?.preview.calculation?.summary.retirementMonth.slice(5, 7) ?? (v2Profile?.personal.desiredRetirementMonth?.status === "KNOWN"
    ? v2Profile.personal.desiredRetirementMonth.value.slice(5, 7)
    : v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value.slice(5, 7) : "12");
  const simRetirementMonth = `${birthYear + simRetireAge}-${retirementMonthSuffix}`;
  // Run server preview simulation (What-If)
  useEffect(() => {
    if (activeTab !== "what-if" || loadingPlans || plansError || initializedVersion !== currentVersion?.id) return;

    let active = true;
    let timer: number | undefined;
    // Keep the previous result on screen (marked as recalculating) instead of
    // blanking it on every keystroke; it is replaced or cleared on error.
    setIsSimulating(true);
    setSimError(null);
    const fail = (message: string) => { setSimResult(null); setSimExplanationInput(null); setComparisonDelta(null); setSimError(message); };

    const simRetireMonth = simRetirementMonth;

    // Map overrides to real asset IDs from profile v2; never use generic placeholder strings
    const entries = v2Profile?.assets.status === "KNOWN" ? v2Profile.assets.entries : [];
    const cashAsset = entries.find((a) => a.type === "CASH" || a.type === "DEPOSIT");
    const realEstateAsset = entries.find((a) => a.type === "REAL_ESTATE" || a.type === "PRIMARY_HOME");
    const stockAsset = entries.find((a) => a.type === "STOCK_FUND");
    const assetGroups = [
      [overrideCash, entries.filter(a => a.type === "CASH" || a.type === "DEPOSIT")],
      [overrideRealEstate, entries.filter(a => a.type === "REAL_ESTATE" || a.type === "PRIMARY_HOME")],
      [overrideStock, entries.filter(a => a.type === "STOCK_FUND")],
    ] as const;
    if (assetGroups.some(([value, assets]) => value && assets.length !== 1)) {
      fail(language === "en" ? "An asset override requires exactly one matching asset. Review your assets or clear the override." : "Giá trị tài sản giả định cần đúng một tài sản tương ứng trong hồ sơ. Hãy kiểm tra tài sản hoặc xóa giá trị ghi đè.");
      setIsSimulating(false); return;
    }

    const assetValuesList: Array<{ assetId: string; value: string }> = [...(baselineSelection?.whatIf?.assetValues ?? [])];
    if (overrideCash && cashAsset) assetValuesList.push({ assetId: cashAsset.id, value: overrideCash });
    if (overrideRealEstate && realEstateAsset) assetValuesList.push({ assetId: realEstateAsset.id, value: overrideRealEstate });
    if (overrideStock && stockAsset) assetValuesList.push({ assetId: stockAsset.id, value: overrideStock });

    const whatIfInput = {
      retirementMonth: simRetireMonth,
      ...(assetValuesList.length > 0 ? { assetValues: [...new Map(assetValuesList.map(a => [a.assetId, a])).values()] } : {}),
    };

    if (!baselineSelection || !currentVersion) {
      setIsSimulating(false);
      return;
    }
    const payload = reviseSelection(baselineSelection, {
      scenario,
      monthlyExpenseToday: String(simExpense),
      monthlyContribution: String(simMonthlySave),
      ...(String(simMonthlySave) !== baselineSelection.monthlyContribution ? { contributionSchedule: [] } : {}),
      whatIf: whatIfInput,
    }, profileRevision);
    // The profile's retirement month is not a hypothetical change.
    if (v2Profile?.personal.desiredRetirementMonth.status === "KNOWN"
      && payload.whatIf?.retirementMonth === v2Profile.personal.desiredRetirementMonth.value) {
      delete payload.whatIf.retirementMonth;
      if (!payload.whatIf.assetValues?.length) delete payload.whatIf;
    }
    const unchanged = scenario === baselineSelection.scenario
      && currentVersion.preview.profileRevision === profileRevision
      && simExpense === Number(baselineSelection.monthlyExpenseToday)
      && simMonthlySave === Number(baselineSelection.monthlyContribution)
      && simRetireMonth === currentVersion.preview.calculation?.summary.retirementMonth
      && !overrideCash && !overrideRealEstate && !overrideStock;
    if (unchanged) {
      setSimResult(currentVersion.preview);
      setSimExplanationInput(null);
      setComparisonDelta(null);
      setIsSimulating(false);
      return;
    }

    // If active plan and current version exist, simulate against server version comparison.
    // Debounced: typing in the amount fields sends one request after the user pauses.
    if (activePlan?.id && currentVersion?.id) {
      const planId = activePlan.id, versionId = currentVersion.id;
      timer = window.setTimeout(() => {
        simulatePlanVersion(planId, versionId, payload)
          .then((res) => {
            if (!active) return;
            setSimExplanationInput(payload);
            setComparisonDelta(res);
            setSimResult(res.candidate);
          })
          .catch((err) => {
            if (active) fail(err instanceof Error ? err.message : "Không thể so sánh với kế hoạch hiện tại. Hãy thử lại.");
          })
          .finally(() => {
            if (active) setIsSimulating(false);
          });
      }, WHAT_IF_DEBOUNCE_MS);
    } else {
      setIsSimulating(false);
    }

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    initializedVersion,
    activeTab, loadingPlans, plansError, simAttempt, simRetirementMonth,
    scenario,
    simRetireAge,
    simMonthlySave,
    simExpense,
    overrideCash,
    overrideRealEstate,
    overrideStock,
    profileRevision,
    birthYear,
    activePlan?.id,
    currentVersion?.id,
    baselineSelection,
    v2Profile?.assets,
    language,
  ]);

  // While recalculating, the previous READY result stays visible; save/apply stay disabled via isSimulating.
  const simSummary = !loadingPlans && !plansError && !simError && simResult?.status === "READY" ? simResult.calculation?.summary : null;
  const currentSummary = currentVersion?.preview.calculation?.summary;
  const simulationExplanationSource: ExplainSource | null = simResult === currentVersion?.preview && activePlan && currentVersion
    ? { kind: "PLAN_VERSION", planId: activePlan.id, versionId: currentVersion.id }
    : simExplanationInput && simResult ? { kind: "PREVIEW", input: simExplanationInput } : null;
  const noBaseline = language === "en" ? "No applied version" : "Chưa có bản áp dụng";
  const retirementMonthDelta = currentSummary?.retirementMonth ? (Number(simRetirementMonth.slice(0, 4)) - Number(currentSummary.retirementMonth.slice(0, 4))) * 12 + Number(simRetirementMonth.slice(5, 7)) - Number(currentSummary.retirementMonth.slice(5, 7)) : null;

  const simTargetFund = simSummary ? parseFloat(simSummary.atRetirement.requiredFund) : 0;
  const simProjectedFund = simSummary ? parseFloat(simSummary.atRetirement.projectedFund) : 0;
  const simGap = simSummary ? parseFloat(simSummary.retirementFundingShortfall) : 0;
  const simScore = simSummary?.atRetirement.coveragePercent
    ? Math.round(parseFloat(simSummary.atRetirement.coveragePercent))
    : 0;

  const resetToBaseline = () => {
    const summary = currentVersion?.preview.calculation?.summary;
    setInitializedVersion(currentVersion?.id ?? null);
    setSimRetireAge(summary ? Number(summary.retirementMonth.slice(0, 4)) - birthYear : profile.goal.targetRetireAge);
    setSimMonthlySave(Number(baselineSelection?.monthlyContribution ?? 0));
    setSimExpense(Number(baselineSelection?.monthlyExpenseToday ?? 0));
    setOverrideCash(""); setOverrideRealEstate(""); setOverrideStock("");
    setScenario(baselineSelection?.scenario ?? "BASE");
    setSimResult(null); setSimExplanationInput(null); setComparisonDelta(null);
  };
  useEffect(() => { resetToBaseline(); }, [currentVersion?.id, birthYear]);

  const handleApplyScenario = async () => {
    if (scenarioSaving.current || applying || isSimulating || !simSummary || !simResult || simResult === currentVersion?.preview || !simResult.inputHash || !simResult.selection) {
      notify.error(
        language === "en" ? "Cannot Apply" : "Chưa thể áp dụng",
        language === "en" ? "Simulation data calculation not completed." : "Dữ liệu mô phỏng chưa hoàn tất tính toán."
      );
      return;
    }

    scenarioSaving.current = true; setApplying(true);
    setApplyNotice(null);

    try {
      const saved = savedScenario.current?.hash === simResult.inputHash ? savedScenario.current.saved : await savePlanVersion(simResult.selection, simResult.inputHash);
      if (!saved) throw new Error(language === "en" ? "Could not save scenario." : "Chưa lưu được kịch bản.");
      if (saved) {
        savedScenario.current = { hash: simResult.inputHash, saved };
        const revision = profileRevision > 0 ? profileRevision : 1;
        const applied = await applyVersion(saved.id, revision, saved.planId, saved.planRevision);
        if (applied === false) {
          throw new Error(
            language === "en" ? "Server rejected plan version application." : "Máy chủ từ chối áp dụng phiên bản kế hoạch này."
          );
        }
        setApplyNotice({
          tone: "success",
          message: language === "en"
            ? `Scenario v${saved.version} applied as official retirement plan. Redirecting to Plan page...`
            : `Kịch bản v${saved.version} đã được áp dụng làm kế hoạch chính thức. Đang chuyển sang trang Kế hoạch...`,
        });
        notify.success(
          language === "en" ? "Scenario Applied Successfully" : "Áp dụng kịch bản thành công",
          language === "en" ? "New simulation scenario is now your official plan." : "Kịch bản mô phỏng mới đã trở thành kế hoạch chính thức."
        );
        setTimeout(() => navigate("/user/plan"), 400);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : (language === "en" ? "Unable to save or apply scenario." : "Không thể lưu hoặc áp dụng kịch bản.");
      setApplyNotice({ tone: "danger", message: err });
      notify.error(language === "en" ? "Application Error" : "Lỗi áp dụng", err);
    } finally {
      scenarioSaving.current = false;
      setApplying(false);
    }
  };

  return (
    <>
      <div className="phase-page-header">
        <div>
          <Badge tone="soft">{language === "en" ? "ADVANCED ANALYTICS" : "CÔNG CỤ NÂNG CAO"}</Badge>
          <h1>{t("simulation.page_title")}</h1>
          <p>{t("simulation.page_subtitle")}</p>
        </div>

        {/* Segmented View Switcher */}
        <div className="phase-view-switcher" aria-label={language === "en" ? "Switch view" : "Chuyển chế độ"}>
          <button
            type="button"
            className={activeTab === "what-if" ? "is-active" : ""}
            aria-pressed={activeTab === "what-if"}
            disabled={applying || actualsBusy}
            onClick={() => setActiveTab("what-if")}
          >
            <Icon name="sparkles" size="small" /> {language === "en" ? "Scenario Testing (What-if)" : "Thử thay đổi kế hoạch"}
          </button>
          <button
            type="button"
            className={activeTab === "actuals" ? "is-active" : ""}
            aria-pressed={activeTab === "actuals"}
            disabled={applying || actualsBusy}
            onClick={() => setActiveTab("actuals")}
          >
            <Icon name="chart" size="small" /> {language === "en" ? "Track progress" : "Theo dõi tiến độ"}
          </button>
        </div>
      </div>

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

      {/* ========================================================= */}
      {/* TAB 1: THỬ NGHIỆM KỊCH BẢN & SO SÁNH (FE-T08)             */}
      {/* ========================================================= */}
      {activeTab === "actuals" && <p className="flow-note">{language === "en" ? "Record contributions, withdrawals and investment gains or losses for the month, then check the closing balance. Recalculating uses these saved records to update the remaining plan." : "Ghi tiền góp, tiền rút và lãi hoặc lỗ đầu tư trong tháng, rồi kiểm tra số dư cuối tháng có khớp không. Sau khi lưu, bạn có thể tính lại phần kế hoạch còn lại từ số liệu này."} <Link to="/user/plan">{language === "en" ? "View current plan" : "Xem kế hoạch đang dùng"}</Link></p>}
      {activeTab === "what-if" && !currentVersion && !loadingPlans && <Alert tone="info" title={language === "en" ? "Choose a plan first" : "Cần có kế hoạch đang dùng để so sánh"}>
        {language === "en" ? "Set your goal and use a plan before trying changes." : "Hãy đặt mục tiêu và chọn dùng một kế hoạch trước khi thử thay đổi."} <Link to="/user/plan">{language === "en" ? "Open plan" : "Mở Kế hoạch"}</Link>
      </Alert>}
      {activeTab === "what-if" && currentVersion && (
        <div className="simulation-layout">
          <div style={{ gridColumn: "1 / -1" }}>
            <p>{language === "en" ? `Comparing with plan ${currentVersion.version}. Unchanged controls keep the saved result.` : `So sánh với kế hoạch số ${currentVersion.version}. Khi chưa sửa thông số, kết quả giữ nguyên như lúc lưu.`}</p>
            {(activePlan?.profileChanged || currentVersion.preview.profileRevision !== profileRevision) && <Alert tone="warning" title={language === "en" ? "Profile has changed since saving" : "Hồ sơ đã thay đổi sau khi lưu kế hoạch"}>{language === "en" ? "New calculations also use your updated profile, so differences may include those updates." : "Khi tính phương án mới, hệ thống cũng dùng hồ sơ mới nhất. Chênh lệch có thể bao gồm những thay đổi đó."}</Alert>}
            {Boolean(currentVersion.preview.reforecast) && <Alert tone="info" title={language === "en" ? "This plan uses recorded balances" : "Kế hoạch này dùng số dư thực tế đã ghi"}><Button onClick={() => setActiveTab("actuals")}>{language === "en" ? "Update from actual records" : "Mở Theo dõi thực tế để điều chỉnh"}</Button></Alert>}
          </div>
          {/* Left: Simulation Controls */}
          <Card className="simulation-controls">
            <header>
              <div>
                <Badge tone="soft">{language === "en" ? "ASSUMPTION PARAMETERS" : "CÁC ĐIỀU BẠN MUỐN THỬ"}</Badge>
                <h2>{language === "en" ? "Scenario Testing Panel" : "Bảng thử nghiệm kịch bản"}</h2>
                <p>{language === "en" ? "Adjust parameters to observe real-time projected outcomes." : "Thay một thông số để xem kết quả khác kế hoạch đang dùng như thế nào."}</p>
              </div>
            </header>

            <fieldset disabled={applying || Boolean(currentVersion?.preview.reforecast)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="simulation-fields">
              {/* 1. Kịch bản kinh tế */}
              <div className="simulation-stepper-card">
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "1. Macroeconomic Scenario" : "1. Tình hình kinh tế dự kiến"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "8px" }}>
                  <button
                    type="button"
                    className={`button button-small ${scenario === "BASE" ? "button-primary" : "button-ghost"}`}
                    aria-pressed={scenario === "BASE"}
                    onClick={() => setScenario("BASE")}
                  >
                    {language === "en" ? "Baseline" : "Cơ sở"}
                  </button>
                  <button
                    type="button"
                    className={`button button-small ${scenario === "ADVERSE" ? "button-primary" : "button-ghost"}`}
                    aria-pressed={scenario === "ADVERSE"}
                    onClick={() => setScenario("ADVERSE")}
                  >
                    {language === "en" ? "Adverse" : "Bất lợi"}
                  </button>
                  <button
                    type="button"
                    className={`button button-small ${scenario === "FAVORABLE" ? "button-primary" : "button-ghost"}`}
                    aria-pressed={scenario === "FAVORABLE"}
                    onClick={() => setScenario("FAVORABLE")}
                  >
                    {language === "en" ? "Favorable" : "Thuận lợi"}
                  </button>
                </div>
                <p className="stepper-baseline-info" style={{ marginTop: "8px" }}>
                  {scenario === "BASE"
                    ? (language === "en" ? "Standard baseline inflation and return assumptions" : "Mức tăng giá và lãi đầu tư dự kiến theo phương án cơ sở")
                    : scenario === "ADVERSE"
                    ? (language === "en" ? "Higher inflation, constrained investment returns" : "Lạm phát cao hơn, lợi suất đầu tư chịu sức ép")
                    : (language === "en" ? "Positive macro environment, favorable asset growth" : "Môi trường vĩ mô tích cực, tăng trưởng tài sản thuận lợi")}
                </p>
              </div>

              {/* 2. Tuổi nghỉ hưu mong muốn */}
              <div className="simulation-stepper simulation-stepper-card">
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "2. Target Retirement Age (What-if)" : "2. Tuổi nghỉ hưu bạn muốn thử"}</span>
                </div>
                <div className="stepper-control-box">
                  <IconButton
                    icon="chevron-left"
                    label={language === "en" ? "Decrease 1 year" : "Giảm 1 tuổi"}
                    onClick={() => setSimRetireAge(Math.max(profile.personal.age || 30, simRetireAge - 1))}
                  />
                  <div className="stepper-center-cluster">
                    <div className="stepper-main-number-row">
                      <input
                        type="number"
                        min={profile.personal.age || 30}
                        max={75}
                        value={simRetireAge}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setSimRetireAge(Math.min(75, Math.max(profile.personal.age || 30, val)));
                        }}
                        className="stepper-input-number is-age font-mono"
                        aria-label={language === "en" ? "Target retirement age" : "Tuổi nghỉ hưu mong muốn"}
                      />
                      <span className="stepper-unit-label">{language === "en" ? "yrs" : "tuổi"}</span>
                    </div>
                    <div className="stepper-subtext-badge-row">
                      <span className="stepper-human-readable-subtext font-mono">
                        {language === "en" ? "Retire month" : "Tháng hưu"}: {simRetirementMonth}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    icon="chevron-right"
                    label={language === "en" ? "Increase 1 year" : "Tăng 1 tuổi"}
                    onClick={() => setSimRetireAge(Math.min(75, simRetireAge + 1))}
                  />
                </div>
                <p className="stepper-baseline-info">
                  {language === "en" ? "Base plan" : "Kế hoạch gốc"}: {currentSummary ? Number(currentSummary.retirementMonth.slice(0, 4)) - birthYear : "—"} {language === "en" ? "yrs" : "tuổi"}
                </p>
              </div>

              {/* 3. Mức tích lũy mỗi tháng */}
              <div className="simulation-stepper simulation-stepper-card">
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "3. Monthly Contribution Amount" : "3. Mức tích lũy mỗi tháng"}</span>
                </div>
                <div className="stepper-control-box">
                  <IconButton
                    icon="chevron-left"
                    label={language === "en" ? "Decrease 1M VND" : "Giảm 1 triệu VND"}
                    onClick={() => setSimMonthlySave(Math.max(0, simMonthlySave - 1000000))}
                  />
                  <div className="stepper-center-cluster">
                    <div className="stepper-main-number-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberWithDots(simMonthlySave)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setSimMonthlySave(digits ? parseInt(digits, 10) : 0);
                        }}
                        className="stepper-input-number is-currency font-mono"
                        aria-label={language === "en" ? "Monthly contribution amount" : "Mức tích lũy mỗi tháng"}
                      />
                      <span className="stepper-unit-label">VND</span>
                    </div>
                    <div className="stepper-subtext-badge-row">
                      <span className="stepper-human-readable-subtext">
                        = {formatVNDText(simMonthlySave, language)} / {language === "en" ? "mo" : "tháng"}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    icon="chevron-right"
                    label={language === "en" ? "Increase 1M VND" : "Tăng 1 triệu VND"}
                    onClick={() => setSimMonthlySave(simMonthlySave + 1000000)}
                  />
                </div>
                <p className="stepper-baseline-info">
                  {language === "en" ? "Base plan" : "Kế hoạch gốc"}: {formatVND(Number(baselineSelection?.monthlyContribution ?? 0))}/{language === "en" ? "mo" : "tháng"}
                </p>
              </div>

              {/* 4. Chi tiêu khi nghỉ hưu */}
              <div className="simulation-stepper simulation-stepper-card">
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "4. Retirement Monthly Expenses (Today's Value)" : "4. Chi tiêu khi nghỉ hưu (giá trị hôm nay)"}</span>
                </div>
                <div className="stepper-control-box">
                  <IconButton
                    icon="chevron-left"
                    label={language === "en" ? "Decrease 1M VND" : "Giảm 1 triệu VND"}
                    onClick={() => setSimExpense(Math.max(0, simExpense - 1000000))}
                  />
                  <div className="stepper-center-cluster">
                    <div className="stepper-main-number-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberWithDots(simExpense)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setSimExpense(digits ? parseInt(digits, 10) : 0);
                        }}
                        className="stepper-input-number is-currency font-mono"
                        aria-label={language === "en" ? "Retirement monthly expenses" : "Chi tiêu khi nghỉ hưu"}
                      />
                      <span className="stepper-unit-label">VND</span>
                    </div>
                    <div className="stepper-subtext-badge-row">
                      <span className="stepper-human-readable-subtext">
                        = {formatVNDText(simExpense, language)} / {language === "en" ? "mo" : "tháng"}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    icon="chevron-right"
                    label={language === "en" ? "Increase 1M VND" : "Tăng 1 triệu VND"}
                    onClick={() => setSimExpense(simExpense + 1000000)}
                  />
                </div>
                <p className="stepper-baseline-info">
                  {language === "en" ? "Base plan" : "Kế hoạch gốc"}: {formatVND(Number(baselineSelection?.monthlyExpenseToday ?? 0))}/{language === "en" ? "mo" : "tháng"}
                </p>
              </div>

              {/* 5. Giả định giá trị tài sản (whatIf.assetValues) */}
              <div className="simulation-stepper-card simulation-asset-values" style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "12px" }}>
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "5. Hypothetical Asset Revaluation" : "5. Thử nghiệm định giá lại tài sản"}</span>
                  <Badge tone="soft">{language === "en" ? "What-if Scenario" : "Thử thay đổi kịch bản"}</Badge>
                </div>
                <p style={{ margin: "4px 0 8px", fontSize: "14px", color: "var(--color-text-muted)" }}>
                  {language === "en"
                    ? "Try adjusting hypothetical asset values to see impacts on retirement fund. This does not alter your base profile."
                    : "Thử thay đổi giá trị tài sản giả định để xem tác động lên quỹ hưu. Giá trị này không thay đổi hồ sơ gốc."}
                </p>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div>
                    <label htmlFor="simulation-real-estate" style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Real Estate" : "Bất động sản"} ({language === "en" ? "original" : "gốc"}: {formatVND(profile.assets.realEstateValue)})
                    </label>
                    <MoneyTextBox
                      id="simulation-real-estate"
                      placeholder={language === "en" ? "Leave blank to keep original" : "Để trống nếu giữ nguyên"}
                      value={overrideRealEstate}
                      maxDecimals={0}
                      onChange={setOverrideRealEstate}
                      className="input font-mono"
                      style={{ height: "48px", fontSize: "16px", width: "100%", marginTop: "2px" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="simulation-stock-fund" style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Stocks & Investment Funds" : "Cổ phiếu & Quỹ"} ({language === "en" ? "original" : "gốc"}: {formatVND(profile.assets.stockFundValue)})
                    </label>
                    <MoneyTextBox
                      id="simulation-stock-fund"
                      placeholder={language === "en" ? "Leave blank to keep original" : "Để trống nếu giữ nguyên"}
                      value={overrideStock}
                      maxDecimals={0}
                      onChange={setOverrideStock}
                      className="input font-mono"
                      style={{ height: "48px", fontSize: "16px", width: "100%", marginTop: "2px" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="simulation-guidance" style={{ marginTop: "16px" }}>
              <Icon name="info" />
              <p>
                {language === "en"
                  ? "Scenario tests change your official plan only after you confirm application."
                  : "Kịch bản thử nghiệm chỉ thay đổi kế hoạch hiện hành sau khi bạn xác nhận áp dụng."}
              </p>
            </div>

            <Button variant="ghost" onClick={resetToBaseline} style={{ marginTop: "12px" }}>
              <Icon name="trash" size="small" /> {language === "en" ? "Reset to base parameters" : "Đặt lại thông số ban đầu"}
            </Button>
            </fieldset>
          </Card>

          {/* Right: Simulation Results & Comparison */}
          <div className="simulation-results">
            <Card className={`simulation-summary${isSimulating && simSummary ? " is-recalculating" : ""}`}>
              <header>
                <div>
                  <div className="live-update">
                    <Icon name={isSimulating ? "sparkles" : "circle-check"} />
                    <span>{isSimulating ? (language === "en" ? "Calculating projection..." : "Đang tính dự phóng...") : (simSummary ? (language === "en" ? "Projection calculated" : "Đã tính dự phóng") : (language === "en" ? "Awaiting valid projection" : "Chờ dự phóng hợp lệ"))}</span>
                  </div>
                  <h2>{language === "en" ? "Scenario Simulation Results" : "Kết quả mô phỏng kịch bản"}</h2>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {(overrideCash || overrideRealEstate || overrideStock || simRetireAge !== (profile.goal.targetRetireAge || 60)) && (
                    <Badge tone="soft">
                      {WARNING_MESSAGES.HYPOTHETICAL_VALUES_PROFILE_UNCHANGED}
                    </Badge>
                  )}
                  {simSummary && <Badge tone={simGap <= 0 ? "success" : "warning"}>
                    {simGap <= 0 ? (language === "en" ? "NO PROJECTED SHORTFALL" : "KHÔNG THIẾU HỤT DỰ PHÓNG") : (language === "en" ? "FUNDING SHORTFALL" : "CÒN THIẾU HỤT")}
                  </Badge>}
                </div>
              </header>

              {plansError && <Alert tone="danger" title={language === "en" ? "Plan load failed" : "Chưa tải được kế hoạch gốc"}>{plansError}<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button></Alert>}
              {simError && (
                <div style={{ margin: "16px 0" }}>
                  <Alert tone="danger" title={language === "en" ? "Simulation Error" : "Lỗi chạy mô phỏng"}>
                    {simError}
                    <Button onClick={() => setSimAttempt(n => n + 1)}>{language === "en" ? "Retry simulation" : "Thử lại mô phỏng"}</Button>
                  </Alert>
                </div>
              )}

              {!simSummary && !simError && !plansError && (
                <Alert
                  tone="info"
                  title={language === "en" ? "Projection not ready" : "Chưa có dự phóng hợp lệ"}
                  action={
                    <Link to="/user/plan">
                      {language === "en" ? "Review plan inputs" : "Kiểm tra đầu vào kế hoạch"}
                    </Link>
                  }
                >
                  {isSimulating
                    ? (language === "en" ? "Calculating the scenario…" : "Đang tính kịch bản…")
                    : (language === "en" ? "Complete your profile and preview a plan first. Missing data cannot be treated as a zero balance." : "Hãy hoàn thiện hồ sơ và xem trước kế hoạch. Dữ liệu chưa đủ không được xem là số dư 0 hoặc đã đạt mục tiêu.")}
                </Alert>
              )}
              {simSummary && <>

              <div className="simulation-primary-result">
                <div>
                  <span>{language === "en" ? "PROJECTED RETIREMENT FUND" : "TIỀN DỰ KIẾN CÓ KHI NGHỈ HƯU"}</span>
                  <strong className="font-mono">{simulationExplanationSource ? <Explain metric="summary.atRetirement.projectedFund" source={simulationExplanationSource} value={String(simSummary.atRetirement.projectedFund)}>{formatVND(simProjectedFund)}</Explain> : formatVND(simProjectedFund)}</strong>
                  <p>
                    {language === "en" ? "Versus required capital" : "So với tiền cần có khi nghỉ hưu"} (<span className="font-mono">{simulationExplanationSource ? <Explain metric="summary.atRetirement.requiredFund" source={simulationExplanationSource} value={String(simSummary.atRetirement.requiredFund)}>{formatVND(simTargetFund)}</Explain> : formatVND(simTargetFund)}</span>):{" "}
                    <b style={{ color: simGap <= 0 ? "var(--color-secondary-700)" : "var(--color-danger)" }} className="font-mono">
                      {simGap <= 0
                        ? `${language === "en" ? "Surplus" : "Dư"} ${formatVNDCurrency(simSummary.excessAtRetirement)}`
                        : `${language === "en" ? "Shortfall" : "Thiếu"} ${formatVND(simGap)}`}
                    </b>
                  </p>
                </div>

                <div className="simulation-score">
                  <strong className="font-mono">{simSummary.atRetirement.coveragePercent == null ? (language === "en" ? "Undetermined" : "Chưa xác định") : simulationExplanationSource ? <Explain term="fundCoverage" metric="summary.atRetirement.coveragePercent" source={simulationExplanationSource} value={String(simSummary.atRetirement.coveragePercent)}>{`${simScore}%`}</Explain> : `${simScore}%`}</strong>
                  <span>{language === "en" ? "Coverage Ratio" : "Tỷ lệ bao phủ"}</span>
                  <small className={simScore >= 100 ? "is-positive" : ""}>
                    {simSummary.atRetirement.coveragePercent == null ? "—" : simScore >= 100
                      ? (language === "en" ? `Fully covered (${simScore}%)` : `Đạt mục tiêu (${simScore}%)`)
                      : simScore >= 75
                      ? (language === "en" ? `Partially covered (${simScore}%)` : `Đạt ${simScore}% mục tiêu`)
                      : (language === "en" ? `Shortfall (${simScore}%)` : `Đạt ${simScore}% mục tiêu (còn thiếu)`)}
                  </small>
                </div>
              </div>

              {/* Server Comparison Grid (FE-T08) */}
              <p className="horizontal-scroll-hint">
                {language === "en" ? "Scroll horizontally to view detailed comparison table." : "Cuộn ngang để xem bảng so sánh chi tiết."}
              </p>
              <div className="comparison-table" tabIndex={0} role="region" aria-label={language === "en" ? "Compare scenario with current plan" : "So sánh kịch bản với kế hoạch"}>
                <div className="comparison-header">
                  <span>{language === "en" ? "Key Metrics" : "Chỉ số quan trọng"}</span>
                  <strong>{language === "en" ? "Current Plan" : "Kế hoạch hiện tại"}</strong>
                  <strong style={{ color: "var(--color-secondary-700)" }}>{language === "en" ? "Simulated Scenario" : "Kịch bản mô phỏng"}</strong>
                  <strong style={{ textAlign: "right" }}>{language === "en" ? "Variance" : "Chênh lệch"}</strong>
                </div>

                <div>
                  <span>{language === "en" ? "Retirement Month" : "Tháng nghỉ hưu"}</span>
                  <strong className="font-mono">{currentSummary ? formatMonthVN(currentSummary.retirementMonth) : noBaseline}</strong>
                  <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>{formatMonthVN(simRetirementMonth)} ({simRetireAge} {language === "en" ? "yrs" : "tuổi"})</strong>
                  <strong style={{ textAlign: "right" }} className="font-mono">
                    {retirementMonthDelta == null ? "—" : `${retirementMonthDelta > 0 ? "+" : ""}${retirementMonthDelta} ${language === "en" ? "months" : "tháng"}`}
                  </strong>
                </div>

                <div>
                  <span>{language === "en" ? "Monthly Savings" : "Mức tích lũy / tháng"}</span>
                  <strong className="font-mono">{baselineSelection?.monthlyContribution != null ? formatVNDCurrency(baselineSelection.monthlyContribution) : noBaseline}</strong>
                  <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>{formatVND(simMonthlySave)}</strong>
                  <strong style={{ textAlign: "right" }} className="font-mono">
                    {baselineSelection?.monthlyContribution != null ? formatVNDCurrency(new Decimal(simMonthlySave).minus(baselineSelection.monthlyContribution).toString()) : "—"}
                  </strong>
                </div>

                <div>
                  <span>{language === "en" ? "Retirement Spending" : "Chi tiêu tháng khi hưu"}</span>
                  <strong className="font-mono">{baselineSelection?.monthlyExpenseToday != null ? formatVNDCurrency(baselineSelection.monthlyExpenseToday) : noBaseline}</strong>
                  <strong className="font-mono">{formatVND(simExpense)}</strong>
                  <strong style={{ textAlign: "right" }} className="font-mono">
                    {baselineSelection?.monthlyExpenseToday != null ? formatVNDCurrency(new Decimal(simExpense).minus(baselineSelection.monthlyExpenseToday).toString()) : "—"}
                  </strong>
                </div>

                <div>
                  <span>{language === "en" ? "Macro Scenario" : "Kịch bản kinh tế"}</span>
                  <strong>{baselineSelection?.scenario ?? noBaseline}</strong>
                  <strong style={{ color: "var(--color-secondary-700)" }}>{scenario}</strong>
                  <strong style={{ textAlign: "right" }}>-</strong>
                </div>

                {(() => {
                  const projDelta = currentSummary && simSummary
                    ? Number(new Decimal(simSummary.atRetirement.projectedFund).minus(currentSummary.atRetirement.projectedFund).toString())
                    : null;
                  const reqDelta = currentSummary && simSummary
                    ? Number(new Decimal(simSummary.atRetirement.requiredFund).minus(currentSummary.atRetirement.requiredFund).toString())
                    : null;
                  const gapDelta = currentSummary && simSummary
                    ? Number(new Decimal(simSummary.atRetirement.fundingGap).minus(currentSummary.atRetirement.fundingGap).toString())
                    : null;

                  return (
                    <>
                      <div>
                        <span>{language === "en" ? "Projected Fund at Retirement" : "Tiền dự kiến có khi nghỉ hưu"}</span>
                        <strong className="font-mono">{currentSummary ? (activePlan && currentVersion ? <Explain metric="summary.atRetirement.projectedFund" source={{ kind: "PLAN_VERSION", planId: activePlan.id, versionId: currentVersion.id }} value={String(currentSummary.atRetirement.projectedFund)}>{formatVNDCurrency(currentSummary.atRetirement.projectedFund)}</Explain> : formatVNDCurrency(currentSummary.atRetirement.projectedFund)) : (language === "en" ? "No applied version" : "Chưa có bản áp dụng")}</strong>
                        <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>{formatVND(simProjectedFund)}</strong>
                        <strong style={{ textAlign: "right", color: projDelta !== null ? (projDelta >= 0 ? "var(--color-secondary-700)" : "var(--color-danger)") : undefined }} className="font-mono">
                          {projDelta !== null ? `${projDelta >= 0 ? "+" : ""}${formatVND(projDelta)}` : "-"}
                        </strong>
                      </div>

                      <div>
                        <span>{language === "en" ? "Required Capital at Retirement" : "Tiền cần có khi nghỉ hưu"}</span>
                        <strong className="font-mono">{currentSummary ? (activePlan && currentVersion ? <Explain metric="summary.atRetirement.requiredFund" source={{ kind: "PLAN_VERSION", planId: activePlan.id, versionId: currentVersion.id }} value={String(currentSummary.atRetirement.requiredFund)}>{formatVNDCurrency(currentSummary.atRetirement.requiredFund)}</Explain> : formatVNDCurrency(currentSummary.atRetirement.requiredFund)) : (language === "en" ? "No applied version" : "Chưa có bản áp dụng")}</strong>
                        <strong className="font-mono">{formatVND(simTargetFund)}</strong>
                        <strong style={{ textAlign: "right", color: reqDelta !== null ? (reqDelta <= 0 ? "var(--color-secondary-700)" : "var(--color-danger)") : undefined }} className="font-mono">
                          {reqDelta !== null ? `${reqDelta >= 0 ? "+" : ""}${formatVND(reqDelta)}` : "-"}
                        </strong>
                      </div>

                      <div>
                        <span>{language === "en" ? "Funding Gap" : "Chênh lệch thiếu hụt"}</span>
                        <strong className="font-mono">{currentSummary ? formatVNDCurrency(currentSummary.atRetirement.fundingGap) : "-"}</strong>
                        <strong className="font-mono">{formatVND(simGap)}</strong>
                        <strong style={{ textAlign: "right", color: gapDelta !== null ? (gapDelta <= 0 ? "var(--color-secondary-700)" : "var(--color-danger)") : undefined }} className="font-mono">
                          {gapDelta !== null ? `${gapDelta >= 0 ? "+" : ""}${formatVND(gapDelta)}` : "-"}
                        </strong>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="simulation-insight" style={{ marginTop: "20px" }}>
                <span><Icon name="sparkles" size="large" /></span>
                <div>
                  <h2>{language === "en" ? "Scenario summary" : "Tóm tắt kịch bản"}</h2>
                  <p>
                    {simGap <= 0
                      ? (language === "en"
                          ? `No shortfall is projected under the selected assumptions and projection period.`
                          : `Chưa thấy thiếu hụt theo giả định và khoảng thời gian dự phóng đã chọn.`)
                      : (language === "en"
                          ? `Retirement scenario at age ${simRetireAge} still has a shortfall of ${formatVND(simGap)} compared to minimum goal. Consider increasing monthly savings or controlling living costs.`
                          : `Kịch bản nghỉ hưu ở tuổi ${simRetireAge} còn thiếu ${formatVND(simGap)} so với mục tiêu tối thiểu. Bạn nên tăng mức tiết kiệm hoặc kiểm soát chi phí sinh hoạt.`)}
                  </p>
                  <small>
                    {language === "en"
                      ? `Calculated based on initial liquid assets ${formatVNDCurrency(simSummary?.initialRetirementCapital || "0")} and net worth ${formatVND(netWorth)}.`
                      : `Tính toán dựa trên tài sản thanh khoản ban đầu ${formatVNDCurrency(simSummary?.initialRetirementCapital || "0")} và tài sản ròng ${formatVND(netWorth)}.`}
                  </small>
                </div>

                <Button
                  variant="primary"
                  onClick={() => setConfirmApply(true)}
                  loading={applying}
                  disabled={applying || isSimulating || !simSummary || simResult === currentVersion?.preview}
                >
                  {language === "en" ? "Apply this scenario" : "Dùng làm kế hoạch hiện tại"} <Icon name="check" />
                </Button>
              </div>

              {applyNotice && (
                <div style={{ marginTop: "16px" }}>
                  <Alert tone={applyNotice.tone} title={applyNotice.tone === "success" ? (language === "en" ? "Applied Successfully" : "Áp dụng thành công") : (language === "en" ? "Error" : "Lỗi")}>
                    {applyNotice.message}
                  </Alert>
                </div>
              )}
              </>}
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SỔ THỰC TẾ & ĐỐI SOÁT (FE-T09)                     */}
      {/* ========================================================= */}
      {actualsOpened && (
        <div style={{ display: activeTab === "actuals" ? "contents" : "none" }}>
        <Suspense fallback={<p role="status" className="flow-note">{language === "en" ? "Loading actual tracking…" : "Đang tải sổ theo dõi thực tế…"}</p>}>
          <ActualsTab onBusyChange={setActualsBusy} />
        </Suspense>
        </div>
      )}
      <Modal open={confirmApply} title={language === "en" ? "Apply this scenario?" : "Dùng làm kế hoạch hiện tại?"} onClose={() => { if (!applying) setConfirmApply(false); }}>
        <p>{language === "en" ? "This preview will be saved as a version and become the official baseline for your dashboard and tracking." : "Bản xem trước này sẽ được lưu thành phiên bản và trở thành mốc chính thức cho trang tổng quan và theo dõi."}</p>
        <div className="account-save-row"><Button variant="secondary" disabled={applying} onClick={() => setConfirmApply(false)}>{language === "en" ? "Cancel" : "Hủy"}</Button><Button loading={applying} disabled={applying || isSimulating || !simSummary || simResult === currentVersion?.preview} onClick={async () => { await handleApplyScenario(); setConfirmApply(false); }}>{language === "en" ? "Confirm application" : "Dùng làm kế hoạch hiện tại"}</Button></div>
      </Modal>
    </>
  );
}
