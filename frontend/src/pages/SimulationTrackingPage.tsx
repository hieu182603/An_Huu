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
import { formatNumberWithDots, numberToVietnameseWords } from "../utils/currency";
import "./simulation-audit.css";
import { formatVND, formatVNDText, getVietnamCurrentMonth } from "./simulation/format";
import { Explain, type ExplainSource } from "../components/explanations/ExplainMode";

export { formatVNDText };
// The actuals tab (ledger, reforecast, source changes) is most of this page's
// code; load it only when that tab is opened.
const ActualsTab = lazy(() => import("./simulation/ActualsTab"));
const WHAT_IF_DEBOUNCE_MS = 400;

interface SimulationTrackingPageProps {
  defaultTab?: "actuals" | "what-if";
}

export default function SimulationTrackingPage({ defaultTab = "actuals" }: SimulationTrackingPageProps = {}) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
  const { activePlan, currentVersion, savePlanVersion, applyVersion, loadingPlans, plansError, refreshPlans } = useRetirementPlan();

  // Top level active tab: T08 (What-If & Compare) vs T09 (Actual Ledger & Reforecast)
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const activeTab = tabParam === "what-if" ? "what-if" : tabParam === "actuals" ? "actuals" : defaultTab;
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

  const retirementMonthSuffix = currentVersion?.preview.calculation?.summary?.retirementMonth?.slice(5, 7) ?? (v2Profile?.personal.desiredRetirementMonth?.status === "KNOWN"
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

  const [futureFrom, setFutureFrom] = useState("2026-12");
  const [futureTo, setFutureTo] = useState("");
  const [futureContribution, setFutureContribution] = useState(
    String(Math.max(0, profile.plan.monthlySavings || 7500000))
  );
  const [futureSpending, setFutureSpending] = useState(
    String(
      profile.goal.monthlyExpenseInRetirement ||
        profile.expenses.essentialExpense + profile.expenses.lifestyleExpense ||
        15000000
    )
  );
  const [futureChanges, setFutureChanges] = useState<
    Array<{ from: string; to: string; contribution: number; spending: number }>
  >([]);

  return (
    <div className="plan-screen">
      {activeTab === "actuals" ? (
        <>
          <nav className="breadcrumb" aria-label={language === "en" ? "Breadcrumb" : "Đường dẫn trang"}>
            <Link to="/user/plan" className="btn-breadcrumb">
              ← {language === "en" ? "Retirement Plan" : "Kế hoạch nghỉ hưu"}
            </Link>
            <span className="sep">/</span>
            <span aria-current="page">
              {language === "en" ? "Track & Check-in" : "Cập nhật tình hình"}
            </span>
          </nav>

          <div className="heading">
            <h1>
              {language === "en" ? "Is your plan still on track?" : "Kế hoạch có còn phù hợp?"}
            </h1>
            <p>
              {language === "en"
                ? "Only update when your income, spending or goals change."
                : "Chỉ cần cập nhật khi thu nhập, chi tiêu hoặc mục tiêu thay đổi."}
            </p>
          </div>
        </>
      ) : (
        <div className="heading">
          <h1>
            {language === "en" ? "Adjust upcoming months" : "Điều chỉnh những tháng sắp tới"}
          </h1>
          <p>
            {language === "en"
              ? "Record expected changes without altering finalized actual records."
              : "Ghi nhận thay đổi dự kiến mà không sửa số thực tế đã chốt."}
          </p>
        </div>
      )}

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
      {/* TAB 1: ĐIỀU CHỈNH TƯƠNG LAI (27_dieu_chinh_tuong_lai.png) */}
      {/* ========================================================= */}
      {activeTab === "what-if" && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>{language === "en" ? "Create Change" : "Lập thay đổi"}</h2>
            </div>
            <form
              id="j-change"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                setFutureChanges((prev) => [
                  ...prev,
                  {
                    from: futureFrom || "2026-12",
                    to: futureTo,
                    contribution: Number(futureContribution.replace(/\D/g, "")) || 0,
                    spending: Number(futureSpending.replace(/\D/g, "")) || 0,
                  },
                ]);
              }}
            >
              <div className="two-col">
                <div className="field">
                  <label htmlFor="f-from">
                    {language === "en" ? "Effective from month" : "Có hiệu lực từ tháng"}
                  </label>
                  <input
                    id="f-from"
                    type="month"
                    value={futureFrom}
                    onChange={(e) => setFutureFrom(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-to">
                    {language === "en" ? "To month" : "Đến tháng"}{" "}
                    <span className="field-optional">
                      {language === "en" ? "(optional)" : "(không bắt buộc điền)"}
                    </span>
                  </label>
                  <input
                    id="f-to"
                    type="month"
                    value={futureTo}
                    onChange={(e) => setFutureTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="f-contribution">
                  {language === "en"
                    ? "Monthly contribution during period"
                    : "Khoản góp mỗi tháng trong giai đoạn"}
                </label>
                <div className="money">
                  <MoneyTextBox
                    id="f-contribution"
                    value={futureContribution}
                    maxDecimals={0}
                    showWords={false}
                    onChange={setFutureContribution}
                  />
                  <span>₫</span>
                </div>
                <small className="money-words" aria-live="polite">
                  {numberToVietnameseWords(Number(futureContribution.replace(/\D/g, "")) || 0)}
                </small>
              </div>

              <div className="field">
                <label htmlFor="f-spending">
                  {language === "en"
                    ? "Monthly retirement spending in today's value"
                    : "Chi hưu trí mỗi tháng theo giá hôm nay"}
                </label>
                <div className="money">
                  <MoneyTextBox
                    id="f-spending"
                    value={futureSpending}
                    maxDecimals={0}
                    showWords={false}
                    onChange={setFutureSpending}
                  />
                  <span>₫</span>
                </div>
                <small className="money-words" aria-live="polite">
                  {numberToVietnameseWords(Number(futureSpending.replace(/\D/g, "")) || 0)}
                </small>
              </div>

              <div className="notice" role="note">
                {language === "en"
                  ? "Applies to the relevant phase: contributions before retirement, spending after retirement. Does not alter loan contracts or social insurance schedules."
                  : "Áp dụng cho giai đoạn phù hợp: khoản góp trước nghỉ hưu, mức chi sau nghỉ hưu. Chưa thay đổi hợp đồng vay hay lịch quyền lợi BHXH."}
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setActiveTab("actuals")}
                >
                  {language === "en" ? "Cancel" : "Hủy"}
                </button>
                <button type="submit" className="btn">
                  {language === "en" ? "Add to test scenario" : "Thêm vào phương án thử"}
                </button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{language === "en" ? "Active Test Changes" : "Các thay đổi đang thử"}</h2>
            </div>
            {futureChanges.length > 0 ? (
              futureChanges.map((r, i) => (
                <div key={`${r.from}-${i}`} className="ledger-row">
                  <div>
                    <strong>
                      {r.from} → {r.to || "2076-04"}
                    </strong>
                    <p>
                      Góp {formatVNDCurrency(String(r.contribution))} · Chi hưu trí{" "}
                      {formatVNDCurrency(String(r.spending))}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      setFutureChanges((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    {language === "en" ? "Remove" : "Bỏ"}
                  </button>
                </div>
              ))
            ) : (
              <p>{language === "en" ? "No changes yet." : "Chưa có thay đổi."}</p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{language === "en" ? "Change by Source" : "Thay đổi từng nguồn"}</h2>
            </div>
            <p>
              {language === "en"
                ? "Update your profile to test other income sources, assets, loans, or pensions. Plans linked to actual balances require source review before applying."
                : "Cập nhật hồ sơ để thử nguồn thu, tài sản, khoản vay hoặc lương hưu khác. Kế hoạch gắn với số dư thực tế cần xem lại nguồn trước khi áp dụng."}
            </p>
            <div className="form-actions" style={{ justifyContent: "flex-start" }}>
              <Link to="/user/profile?section=cashflow" className="btn secondary">
                {language === "en" ? "Cashflow" : "Thu chi"}
              </Link>
              <Link to="/user/profile?section=assets" className="btn secondary">
                {language === "en" ? "Assets" : "Tài sản"}
              </Link>
              <Link to="/user/debts" className="btn secondary">
                {language === "en" ? "Loans" : "Khoản vay"}
              </Link>
              <Link to="/user/profile?section=insurance" className="btn secondary">
                {language === "en" ? "Pension" : "Lương hưu"}
              </Link>
            </div>
            <details className="top-space">
              <summary>
                {language === "en"
                  ? "Refinancing, asset sales, and special contracts"
                  : "Tái cấp vốn, bán tài sản và hợp đồng đặc thù"}
              </summary>
              <p>
                {language === "en"
                  ? "These transactions require full contract schedules and supporting evidence."
                  : "Các nghiệp vụ này cần lịch hợp đồng và căn cứ đầy đủ. Bản thử hiện cho khai hồ sơ và thử thay đổi mức góp/chi, chưa tính tiền giải ngân, tất toán hoặc quyền lợi pháp lý."}
              </p>
            </details>
          </section>

          <Link to="/user/plan" className="btn secondary">
            {language === "en" ? "View change results" : "Xem kết quả thay đổi"}
          </Link>
        </>
      )}

      {/* ========================================================= */}
      {/* TAB 1: ĐIỀU CHỈNH TƯƠNG LAI (27_dieu_chinh_tuong_lai.png) */}
      {/* ========================================================= */}
      {activeTab === "what-if" && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>{language === "en" ? "Create Change" : "Lập thay đổi"}</h2>
            </div>
            <form
              id="j-change"
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                setFutureChanges((prev) => [
                  ...prev,
                  {
                    from: futureFrom || "2026-12",
                    to: futureTo,
                    contribution: Number(futureContribution.replace(/\D/g, "")) || 0,
                    spending: Number(futureSpending.replace(/\D/g, "")) || 0,
                  },
                ]);
              }}
            >
              <div className="two-col">
                <div className="field">
                  <label htmlFor="f-from">
                    {language === "en" ? "Effective from month" : "Có hiệu lực từ tháng"}
                  </label>
                  <input
                    id="f-from"
                    type="month"
                    value={futureFrom}
                    onChange={(e) => setFutureFrom(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-to">
                    {language === "en" ? "To month" : "Đến tháng"}{" "}
                    <span className="field-optional">
                      {language === "en" ? "(optional)" : "(không bắt buộc điền)"}
                    </span>
                  </label>
                  <input
                    id="f-to"
                    type="month"
                    value={futureTo}
                    onChange={(e) => setFutureTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="f-contribution">
                  {language === "en"
                    ? "Monthly contribution during period"
                    : "Khoản góp mỗi tháng trong giai đoạn"}
                </label>
                <div className="money">
                  <MoneyTextBox
                    id="f-contribution"
                    value={futureContribution}
                    maxDecimals={0}
                    showWords={false}
                    onChange={setFutureContribution}
                  />
                  <span>₫</span>
                </div>
                <small className="money-words" aria-live="polite">
                  {numberToVietnameseWords(Number(futureContribution.replace(/\D/g, "")) || 0)}
                </small>
              </div>

              <div className="field">
                <label htmlFor="f-spending">
                  {language === "en"
                    ? "Monthly retirement spending in today's value"
                    : "Chi hưu trí mỗi tháng theo giá hôm nay"}
                </label>
                <div className="money">
                  <MoneyTextBox
                    id="f-spending"
                    value={futureSpending}
                    maxDecimals={0}
                    showWords={false}
                    onChange={setFutureSpending}
                  />
                  <span>₫</span>
                </div>
                <small className="money-words" aria-live="polite">
                  {numberToVietnameseWords(Number(futureSpending.replace(/\D/g, "")) || 0)}
                </small>
              </div>

              <div className="notice" role="note">
                {language === "en"
                  ? "Applies to the relevant phase: contributions before retirement, spending after retirement. Does not alter loan contracts or social insurance schedules."
                  : "Áp dụng cho giai đoạn phù hợp: khoản góp trước nghỉ hưu, mức chi sau nghỉ hưu. Chưa thay đổi hợp đồng vay hay lịch quyền lợi BHXH."}
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setActiveTab("actuals")}
                >
                  {language === "en" ? "Cancel" : "Hủy"}
                </button>
                <button type="submit" className="btn">
                  {language === "en" ? "Add to test scenario" : "Thêm vào phương án thử"}
                </button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{language === "en" ? "Active Test Changes" : "Các thay đổi đang thử"}</h2>
            </div>
            {futureChanges.length > 0 ? (
              futureChanges.map((r, i) => (
                <div key={`${r.from}-${i}`} className="ledger-row">
                  <div>
                    <strong>
                      {r.from} → {r.to || "2076-04"}
                    </strong>
                    <p>
                      Góp {formatVNDCurrency(String(r.contribution))} · Chi hưu trí{" "}
                      {formatVNDCurrency(String(r.spending))}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      setFutureChanges((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    {language === "en" ? "Remove" : "Bỏ"}
                  </button>
                </div>
              ))
            ) : (
              <p>{language === "en" ? "No changes yet." : "Chưa có thay đổi."}</p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{language === "en" ? "Change by Source" : "Thay đổi từng nguồn"}</h2>
            </div>
            <p>
              {language === "en"
                ? "Update your profile to test other income sources, assets, loans, or pensions. Plans linked to actual balances require source review before applying."
                : "Cập nhật hồ sơ để thử nguồn thu, tài sản, khoản vay hoặc lương hưu khác. Kế hoạch gắn với số dư thực tế cần xem lại nguồn trước khi áp dụng."}
            </p>
            <div className="form-actions" style={{ justifyContent: "flex-start" }}>
              <Link to="/user/profile?section=cashflow" className="btn secondary">
                {language === "en" ? "Cashflow" : "Thu chi"}
              </Link>
              <Link to="/user/profile?section=assets" className="btn secondary">
                {language === "en" ? "Assets" : "Tài sản"}
              </Link>
              <Link to="/user/debts" className="btn secondary">
                {language === "en" ? "Loans" : "Khoản vay"}
              </Link>
              <Link to="/user/profile?section=insurance" className="btn secondary">
                {language === "en" ? "Pension" : "Lương hưu"}
              </Link>
            </div>
            <details className="top-space">
              <summary>
                {language === "en"
                  ? "Refinancing, asset sales, and special contracts"
                  : "Tái cấp vốn, bán tài sản và hợp đồng đặc thù"}
              </summary>
              <p>
                {language === "en"
                  ? "These transactions require full contract schedules and supporting evidence."
                  : "Các nghiệp vụ này cần lịch hợp đồng và căn cứ đầy đủ. Bản thử hiện cho khai hồ sơ và thử thay đổi mức góp/chi, chưa tính tiền giải ngân, tất toán hoặc quyền lợi pháp lý."}
              </p>
            </details>
          </section>

          <Link to="/user/plan" className="btn secondary">
            {language === "en" ? "View change results" : "Xem kết quả thay đổi"}
          </Link>
        </>
      )}

      {/* TAB 2: SỔ THỰC TẾ & ĐỐI SOÁT (FE-T09)                     */}
      {/* ========================================================= */}
      {actualsOpened && (
        <div style={{ display: activeTab === "actuals" ? "contents" : "none" }}>
        <Suspense fallback={<p role="status" className="flow-note">{language === "en" ? "Loading actual tracking…" : "Đang tải sổ theo dõi thực tế…"}</p>}>
          <ActualsTab onBusyChange={setActualsBusy} />
        </Suspense>
        </div>
      )}
    </div>
  );
}
