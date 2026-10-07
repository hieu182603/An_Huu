import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Icon, IconButton, Modal, useNotification } from "../components/ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import {
  previewMonthlyRetirement,
  formatVNDCurrency,
  formatPercentNumber,
  WARNING_MESSAGES,
  type RetirementPreviewInput,
  type RetirementPreviewResult,
} from "../services/retirement";
import {
  fetchUserPortfolioPolicies,
  fetchUserPortfolioPolicyDetail,
  type PortfolioPolicyDetail,
} from "../services/portfolios";
import {
  simulatePlanVersion,
  type SimulatePlanResponse,
  previewSourceReforecast,
  saveSourceReforecast,
  type FlowSourceCommand,
  type SourceReforecastPreviewResponse,
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
import { Decimal } from "../utils/decimal";
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
  type SourceChange,
  type ReforecastPreviewResponse,
} from "../services/actuals";
import { useI18n } from "../i18n";

const formatVND = (num: number) => new Intl.NumberFormat("vi-VN").format(num) + " ₫";

export function formatVNDText(amount: number, language: "vi" | "en" = "vi"): string {
  if (amount === 0) return "0 ₫";
  if (amount < 0) return `-${formatVNDText(-amount, language)}`;
  if (amount >= 1_000_000_000) {
    const ty = amount / 1_000_000_000;
    const formatted = ty % 1 === 0 ? ty.toString() : ty.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${formatted} ${language === "en" ? "billion" : "tỷ"} ₫`;
  }
  if (amount >= 1_000_000) {
    const trieu = amount / 1_000_000;
    const formatted = trieu % 1 === 0 ? trieu.toString() : trieu.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${formatted} ${language === "en" ? "million" : "triệu"} ₫`;
  }
  if (amount >= 1_000) {
    const nghin = amount / 1_000;
    const formatted = nghin % 1 === 0 ? nghin.toString() : nghin.toFixed(0);
    return `${formatted} ${language === "en" ? "thousand" : "nghìn"} ₫`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;
}

// Vietnam current month string YYYY-MM
const getVietnamCurrentMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);

export default function SimulationTrackingPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
  const { activePlan, currentVersion, savePlanVersion, applyVersion } = useRetirementPlan();

  // Top level active tab: T08 (What-If & Compare) vs T09 (Actual Ledger & Reforecast)
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") === "actuals" ? "actuals" : "what-if";
  const setActiveTab = (tab: "what-if" | "actuals") => setParams(prev => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; });

  // ==========================================
  // TAB 1: WHAT-IF & COMPARE (FE-T08) STATE
  // ==========================================
  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
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

  const [simResult, setSimResult] = useState<RetirementPreviewResult | null>(null);
  const [comparisonDelta, setComparisonDelta] = useState<SimulatePlanResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyNotice, setApplyNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  // Load published policy
  useEffect(() => {
    let active = true;
    fetchUserPortfolioPolicies(1, 1)
      .then(async (res) => {
        if (!active) return;
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(res.items[0].id);
          if (active) setPolicyDetail(detail);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const birthYear = useMemo(() => {
    const birthMonthStr = v2Profile?.personal.birthMonth?.status === "KNOWN" ? v2Profile.personal.birthMonth.value : null;
    if (birthMonthStr) {
      return parseInt(birthMonthStr.slice(0, 4), 10);
    }
    return new Date().getFullYear() - (profile.personal.age || 30);
  }, [v2Profile, profile]);

  const defaultEndMonth = useMemo(() => {
    const lifeExp = profile.goal.lifeExpectancy || 85;
    const birthMonth = v2Profile?.personal.birthMonth;
    const rawEnd = `${birthYear + lifeExp}-${birthMonth?.status === "KNOWN" ? birthMonth.value.slice(5, 7) : "12"}`;
    const scenarioYears = policyDetail?.data?.scenarios?.flatMap((s: any) => s.years?.map((y: any) => y.year) || []) || [];
    const maxScenarioYear = scenarioYears.length > 0 ? Math.max(...scenarioYears) : 2055;
    const capMonth = `${maxScenarioYear}-12`;
    return rawEnd < capMonth ? rawEnd : capMonth;
  }, [birthYear, profile.goal.lifeExpectancy, policyDetail, v2Profile]);

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

  // Run server preview simulation (What-If)
  useEffect(() => {
    if (!policyDetail) return;

    let active = true;
    setIsSimulating(true);
    setSimError(null);
    setSimResult(null);
    setComparisonDelta(null);

    // Reuse existing selection answers if version exists; do not auto-select choices[0]
    const baselineAnswers = currentVersion?.preview.selection.answers;
    const answers = baselineAnswers && baselineAnswers.length > 0 ? baselineAnswers : [];

    const simRetireMonth = `${birthYear + simRetireAge}-12`;

    // Map overrides to real asset IDs from profile v2; never use generic placeholder strings
    const entries = v2Profile?.assets.status === "KNOWN" ? v2Profile.assets.entries : [];
    const cashAsset = entries.find((a) => a.type === "CASH" || a.type === "DEPOSIT");
    const realEstateAsset = entries.find((a) => a.type === "REAL_ESTATE" || a.type === "PRIMARY_HOME");
    const stockAsset = entries.find((a) => a.type === "STOCK_FUND");

    const assetValuesList: Array<{ assetId: string; value: string }> = [];
    if (overrideCash && cashAsset) assetValuesList.push({ assetId: cashAsset.id, value: overrideCash });
    if (overrideRealEstate && realEstateAsset) assetValuesList.push({ assetId: realEstateAsset.id, value: overrideRealEstate });
    if (overrideStock && stockAsset) assetValuesList.push({ assetId: stockAsset.id, value: overrideStock });

    const whatIfInput = {
      retirementMonth: simRetireMonth,
      ...(assetValuesList.length > 0 ? { assetValues: assetValuesList } : {}),
    };

    const revision = profileRevision > 0 ? profileRevision : 1;

    const payload: RetirementPreviewInput = {
      expectedProfileRevision: revision,
      policyVersionId: policyDetail.id,
      scenario,
      answers,
      liquidityNeedMonths: 6,
      endMonth: defaultEndMonth,
      monthlyExpenseToday: String(simExpense),
      monthlyContribution: String(simMonthlySave),
      monthlyReserve: "0",
      terminalBalance: "0",
      retirementIncomeIds: [],
      retirementAdditionalExpenseIds: [],
      debtStress: [],
      housing: [],
      whatIf: whatIfInput,
    };

    // If active plan and current version exist, simulate against server version comparison
    if (activePlan?.id && currentVersion?.id) {
      simulatePlanVersion(activePlan.id, currentVersion.id, payload)
        .then((res) => {
          if (!active) return;
          setComparisonDelta(res);
          setSimResult(res.candidate);
        })
        .catch((err) => {
          if (active) setSimError(err instanceof Error ? err.message : "Không thể so sánh với kế hoạch hiện tại. Hãy thử lại.");
        })
        .finally(() => {
          if (active) setIsSimulating(false);
        });
    } else {
      previewMonthlyRetirement(payload)
        .then((res) => {
          if (!active) return;
          setSimResult(res);
          setComparisonDelta(null);
        })
        .catch((err) => {
          if (!active) return;
          setSimError(err instanceof Error ? err.message : (language === "en" ? "Unable to run simulation." : "Không thể chạy mô phỏng."));
        })
        .finally(() => {
          if (active) setIsSimulating(false);
        });
    }

    return () => {
      active = false;
    };
  }, [
    policyDetail,
    scenario,
    simRetireAge,
    simMonthlySave,
    simExpense,
    overrideCash,
    overrideRealEstate,
    overrideStock,
    profileRevision,
    birthYear,
    defaultEndMonth,
    activePlan?.id,
    currentVersion?.id,
    currentVersion?.preview.selection.answers,
    language,
  ]);

  const simSummary = !isSimulating && !simError && (simResult?.status === "READY" || (simResult as any)?.status === "CALCULATED" || Boolean(simResult?.calculation?.summary)) ? simResult?.calculation?.summary : null;
  const currentSummary = currentVersion?.preview.calculation?.summary;

  const simTargetFund = simSummary ? parseFloat(simSummary.atRetirement.requiredFund) : 0;
  const simProjectedFund = simSummary ? parseFloat(simSummary.atRetirement.projectedFund) : 0;
  const simGap = simSummary ? parseFloat(simSummary.retirementFundingShortfall) : 0;
  const simScore = simSummary?.atRetirement.coveragePercent
    ? Math.round(parseFloat(simSummary.atRetirement.coveragePercent))
    : 0;

  const resetToBaseline = () => {
    setSimRetireAge(profile.goal.targetRetireAge || 60);
    setSimMonthlySave(Math.max(0, profile.plan.monthlySavings));
    setSimExpense(profile.goal.monthlyExpenseInRetirement || profile.expenses.essentialExpense + profile.expenses.lifestyleExpense);
    setOverrideCash("");
    setOverrideRealEstate("");
    setOverrideStock("");
    setScenario("BASE");
    notify.info(
      language === "en" ? "Reset Parameters" : "Đặt lại thông số",
      language === "en" ? "Restored simulation parameters to current profile values." : "Đã khôi phục các chỉ số mô phỏng về giá trị hồ sơ hiện tại."
    );
  };

  const handleApplyScenario = async () => {
    if (applying || isSimulating || !simSummary || !simResult || !simResult.inputHash || !simResult.selection) {
      notify.error(
        language === "en" ? "Cannot Apply" : "Chưa thể áp dụng",
        language === "en" ? "Simulation data calculation not completed." : "Dữ liệu mô phỏng chưa hoàn tất tính toán."
      );
      return;
    }

    setApplying(true);
    setApplyNotice(null);

    try {
      const saved = await savePlanVersion(simResult.selection, simResult.inputHash);
      if (saved) {
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
      setApplying(false);
    }
  };

  // ==========================================
  // TAB 2: ACTUAL LEDGER & REFORECAST (FE-T09)
  // ==========================================
  const currentVnMonth = getVietnamCurrentMonth();
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentVnMonth);
  const [monthDetail, setMonthDetail] = useState<ActualMonthDetail | null>(null);
  const [openingBalance, setOpeningBalance] = useState<string>("0");
  const [closingBalance, setClosingBalance] = useState<string>("0");
  const [entries, setEntries] = useState<ActualEntry[]>([]);
  const [correctionReason, setCorrectionReason] = useState<string>(() => (language === "en" ? "Actual balance reconciliation" : "Đối soát số dư thực tế"));
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [savingActual, setSavingActual] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  // Idempotency state: { key, bodyStr }
  const [actualIdempotency, setActualIdempotency] = useState<{ key: string; bodyStr: string } | null>(null);

  // Reforecast state
  const [reforecastResult, setReforecastResult] = useState<ActualForecastResult | null>(null);
  const [reforecasting, setReforecasting] = useState<boolean>(false);
  const [reforecastError, setReforecastError] = useState<string | null>(null);

  // Load actual month detail when selected period changes
  const loadPeriodData = async (period: string) => {
    setLedgerLoading(true);
    setReforecastResult(null);
    setReforecastError(null);
    try {
      const detail = await getActualMonth(period);
      setMonthDetail(detail);
      setOpeningBalance(detail.data.openingBalance);
      setClosingBalance(detail.data.closingBalance);
      setEntries(detail.data.entries);
      setCorrectionReason(detail.data.correctionReason || (language === "en" ? "Actual balance reconciliation" : "Đối soát số dư thực tế"));
    } catch {
      // 404: Month has not been recorded yet. Initialize defaults
      setMonthDetail(null);
      setOpeningBalance(netWorth > 0 ? String(netWorth) : "0");
      setClosingBalance(netWorth > 0 ? String(netWorth) : "0");
      setEntries([]);
      setCorrectionReason(language === "en" ? "Initialize actual ledger month" : "Khởi tạo sổ thực tế tháng");
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "actuals") {
      loadPeriodData(selectedPeriod);
    }
  }, [activeTab, selectedPeriod]);

  // Client reconciliation preview
  const currentPayload: ActualPayload = useMemo(() => ({
    currency: "VND",
    openingBalance: openingBalance || "0",
    closingBalance: closingBalance || "0",
    entries,
    correctionReason,
  }), [openingBalance, closingBalance, entries, correctionReason]);

  const localReconcile = useMemo(() => {
    return calculateLocalReconciliation(currentPayload);
  }, [currentPayload]);

  const handleAddEntry = () => {
    const newEntry: ActualEntry = {
      eventId: crypto.randomUUID(),
      date: `${selectedPeriod}-01`,
      kind: "INCOME",
      amount: "0",
      note: "",
    };
    setEntries([...entries, newEntry]);
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(entries.filter((e) => e.eventId !== id));
  };

  const handleUpdateEntry = (id: string, updates: Partial<ActualEntry>) => {
    setEntries(entries.map((e) => (e.eventId === id ? { ...e, ...updates } : e)));
  };

  const handleSaveActualMonth = async () => {
    if (!correctionReason.trim()) {
      notify.error(
        language === "en" ? "Missing Reason" : "Thiếu lý do",
        language === "en" ? "Please enter a recording reason or reconciliation explanation." : "Vui lòng nhập lý do ghi nhận hoặc giải thích đối soát."
      );
      return;
    }

    // Validate balance adjustments have note
    const invalidAdj = entries.find((e) => e.kind === "BALANCE_ADJUSTMENT" && !e.note?.trim());
    if (invalidAdj) {
      notify.error(
        language === "en" ? "Missing Note" : "Thiếu ghi chú",
        language === "en" ? "Balance Adjustment transaction requires an explanatory note." : "Giao dịch Điều chỉnh số dư bắt buộc phải có ghi chú giải thích."
      );
      return;
    }

    setSavingActual(true);
    const expectedRevision = monthDetail ? monthDetail.revision : 0;
    const bodyStr = JSON.stringify({ expectedRevision, data: currentPayload });

    // Idempotent retry: reuse key if exact body matches, else generate new
    const key = actualIdempotency && actualIdempotency.bodyStr === bodyStr
      ? actualIdempotency.key
      : crypto.randomUUID();
    setActualIdempotency({ key, bodyStr });

    try {
      const saved = await writeActualMonth(selectedPeriod, expectedRevision, currentPayload, key);
      notify.success(
        language === "en" ? "Actual Ledger Saved" : "Đã lưu sổ thực tế",
        language === "en" ? `Saved month ${selectedPeriod} (revision r${saved.revision}).` : `Đã lưu tháng ${selectedPeriod} (phiên bản r${saved.revision}).`
      );
      await loadPeriodData(selectedPeriod);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (language === "en" ? "Unable to save actual ledger." : "Không thể lưu sổ thực tế.");
      notify.error(language === "en" ? "Save Ledger Error" : "Lỗi lưu sổ", msg);
    } finally {
      setSavingActual(false);
    }
  };

  const handleRunReforecast = async () => {
    if (!activePlan?.id || !currentVersion?.id) {
      notify.error(
        language === "en" ? "No Active Plan" : "Chưa có kế hoạch",
        language === "en" ? "An official plan version is required to run reforecast." : "Cần một phiên bản kế hoạch chính thức để chạy dự báo lại."
      );
      return;
    }

    setReforecasting(true);
    setReforecastError(null);
    try {
      const result = await reforecastPlan(activePlan.id, currentVersion.id, selectedPeriod);
      setReforecastResult(result);
      if (result.status === "READY") {
        notify.success(
          language === "en" ? "Reforecast Completed" : "Dự báo lại hoàn tất",
          language === "en" ? `Reforecasted based on balance anchored at ${selectedPeriod}.` : `Đã dự báo lại dựa trên số dư chốt tháng ${selectedPeriod}.`
        );
      } else if (result.status === "BLOCKED") {
        notify.warning(
          language === "en" ? "Reforecast Blocked" : "Dự báo bị chặn",
          language === "en" ? "Data integrity issue or missing month in reconciliation series." : "Có lỗi dữ liệu hoặc thiếu tháng trong chuỗi đối soát."
        );
      } else if (result.status === "HORIZON_COMPLETE") {
        notify.info(
          language === "en" ? "Horizon Completed" : "Hoàn thành chân trời",
          language === "en" ? "The full projection horizon of this version has passed." : "Toàn bộ chuỗi dự báo của phiên bản đã trôi qua."
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not run reforecast." : "Không thể chạy dự báo lại.");
      setReforecastError(msg);
      notify.error(language === "en" ? "Reforecast Error" : "Lỗi dự báo lại", msg);
    } finally {
      setReforecasting(false);
    }
  };

  // Future & Source Changes (P13/P15 & Q15-03)
  const [reforecastSubTab, setReforecastSubTab] = useState<"standard" | "future-changes" | "sources-v4">("standard");
  const [futureChanges, setFutureChanges] = useState<FutureChange[]>([]);
  const [sourceChanges, setSourceChanges] = useState<SourceChange[]>([]);
  const [reforecastCandidate, setReforecastCandidate] = useState<ReforecastPreviewResponse | null>(null);
  const [previewingCandidate, setPreviewingCandidate] = useState<boolean>(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [savingCandidate, setSavingCandidate] = useState<boolean>(false);
  const [applyingCandidate, setApplyingCandidate] = useState<boolean>(false);
  const [savedCandidateVersion, setSavedCandidateVersion] = useState<any | null>(null);

  // Future Change form inputs
  const [fcField, setFcField] = useState<FutureChangeField>("plannedContribution");
  const [fcAmount, setFcAmount] = useState<string>("");
  const [fcStartMonth, setFcStartMonth] = useState<string>("");
  const [fcEndMonth, setFcEndMonth] = useState<string>("");
  const [fcReason, setFcReason] = useState<string>("");

  // Source commands v4 state
  const [sourceCommands, setSourceCommands] = useState<FlowSourceCommand[]>([]);
  const [v4Candidate, setV4Candidate] = useState<SourceReforecastPreviewResponse | null>(null);
  const [previewingV4, setPreviewingV4] = useState<boolean>(false);
  const [savingV4, setSavingV4] = useState<boolean>(false);
  const [v4Error, setV4Error] = useState<string | null>(null);
  const [savedV4Version, setSavedV4Version] = useState<any | null>(null);
  const [savedV4PlanRevision, setSavedV4PlanRevision] = useState<number | null>(null);
  const [applyingV4, setApplyingV4] = useState<boolean>(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [v4Idempotency, setV4Idempotency] = useState<{ key: string; bodyStr: string } | null>(null);
  const [candidateIdempotency, setCandidateIdempotency] = useState<{ key: string; bodyStr: string } | null>(null);
  const [eligibleEstimates, setEligibleEstimates] = useState<PensionEstimateRecord[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [pensionSelections, setPensionSelections] = useState<PensionSourceSelection[]>([]);

  // V4 flow form inputs
  const [v4Operation, setV4Operation] = useState<"CREATE" | "REVISE" | "END">("CREATE");
  const [v4Metric, setV4Metric] = useState<"income" | "livingExpense" | "additionalExpense" | "pension">("income");
  const [v4Frequency, setV4Frequency] = useState<"MONTHLY" | "ONCE">("MONTHLY");
  const [v4Amount, setV4Amount] = useState<string>("");
  const [v4FromMonth, setV4FromMonth] = useState<string>("");
  const [v4ToMonth, setV4ToMonth] = useState<string>("");
  const [v4Document, setV4Document] = useState<string>("");

  // V4 Loan revisions & creations state (FE-07 & FE-08)
  const [loanRevisions, setLoanRevisions] = useState<LoanSourceRevisionCommand[]>([]);
  const [loanCreations, setLoanCreations] = useState<LoanCreation[]>([]);
  const [refinances, setRefinances] = useState<RefinanceCommand[]>([]);
  const [plannedRefinances, setPlannedRefinances] = useState<PlannedPairCommand[]>([]);
  const [loanTab, setLoanTab] = useState<"revise" | "create" | "refinance" | "plannedRefinance">("revise");

  // Form state for revising loan
  const [selectedLoanOptionSourceId, setSelectedLoanOptionSourceId] = useState<string>("");
  const [lrOperation, setLrOperation] = useState<"REVISE" | "END">("REVISE");
  const [lrPrincipal, setLrPrincipal] = useState<string>("");
  const [lrMaturityMonths, setLrMaturityMonths] = useState<number>(36);
  const [lrRatePercent, setLrRatePercent] = useState<string>("8.5");
  const [lrMode, setLrMode] = useState<"REDUCE_PAYMENT_KEEP_TERM" | "REDUCE_TERM_KEEP_PAYMENT" | "BANK_SCHEDULE" | "RESTRUCTURED">("REDUCE_PAYMENT_KEEP_TERM");
  const [lrFixedPayment, setLrFixedPayment] = useState<string>("");
  const [lrPaymentShare, setLrPaymentShare] = useState<string>("1");
  const [lrBalanceScope, setLrBalanceScope] = useState<"FULL_CONTRACT" | "USER_SHARE">("FULL_CONTRACT");
  const [lrResponsibilityKind, setLrResponsibilityKind] = useState<"ALLOCATED_SHARE" | "CAPPED">("ALLOCATED_SHARE");
  const [lrCapLimit, setLrCapLimit] = useState<string>("");
  const [lrCapPreviouslyPaid, setLrCapPreviouslyPaid] = useState<string>("");
  const [lrDocument, setLrDocument] = useState<string>("");
  // Legacy opening form
  const [lrLegacySignedOn, setLrLegacySignedOn] = useState<string>("2024-01-01");
  const [lrLegacyEffectiveOn, setLrLegacyEffectiveOn] = useState<string>("2024-01-01");
  const [lrLegacyPreviouslyPaid, setLrLegacyPreviouslyPaid] = useState<string>("0");
  const [lrLegacyDoc, setLrLegacyDoc] = useState<string>("");
  // Responsibility amendment
  const [lrHasAmendment, setLrHasAmendment] = useState<boolean>(false);
  const [lrAmendmentOpeningUserPaid, setLrAmendmentOpeningUserPaid] = useState<string>("0");

  // Form state for creating loan
  const [lcAgreementRef, setLcAgreementRef] = useState<string>("");
  const [lcFundingKind, setLcFundingKind] = useState<"EXISTING_BALANCE" | "PLANNED_DISBURSEMENT" | "DISBURSED_BALANCE">("PLANNED_DISBURSEMENT");
  const [lcPrincipal, setLcPrincipal] = useState<string>("");
  const [lcMaturityMonths, setLcMaturityMonths] = useState<number>(36);
  const [lcRatePercent, setLcRatePercent] = useState<string>("8.5");
  const [lcMode, setLcMode] = useState<"REDUCE_PAYMENT_KEEP_TERM" | "REDUCE_TERM_KEEP_PAYMENT" | "BANK_SCHEDULE" | "RESTRUCTURED">("REDUCE_PAYMENT_KEEP_TERM");
  const [lcFixedPayment, setLcFixedPayment] = useState<string>("");
  const [lcPaymentShare, setLcPaymentShare] = useState<string>("1");
  const [lcBalanceScope, setLcBalanceScope] = useState<"FULL_CONTRACT" | "USER_SHARE">("FULL_CONTRACT");
  const [lcResponsibilityKind, setLcResponsibilityKind] = useState<"ALLOCATED_SHARE" | "CAPPED">("ALLOCATED_SHARE");
  const [lcCapLimit, setLcCapLimit] = useState<string>("");
  const [lcCapPreviouslyPaid, setLcCapPreviouslyPaid] = useState<string>("");
  const [lcDocRef, setLcDocRef] = useState<string>("");
  const [lcWithheldFees, setLcWithheldFees] = useState<string>("0");
  const [lcDisbursedOn, setLcDisbursedOn] = useState<string>("");
  const [lcOpeningUserPaid, setLcOpeningUserPaid] = useState<string>("0");

  // Form state for actual refinance (FE-08)
  const [refiClosingSourceId, setRefiClosingSourceId] = useState<string>("");
  const [refiNewAgreementRef, setRefiNewAgreementRef] = useState<string>("");
  const [refiGrossDisbursement, setRefiGrossDisbursement] = useState<string>("500000000");
  const [refiWithheldFees, setRefiWithheldFees] = useState<string>("5000000");
  const [refiExternalTopUp, setRefiExternalTopUp] = useState<string>("0");
  const [refiUnusedProceeds, setRefiUnusedProceeds] = useState<string>("0");
  const [refiSettledOn, setRefiSettledOn] = useState<string>("");
  const [refiFundingScope, setRefiFundingScope] = useState<"FULL_CONTRACT" | "USER_SHARE">("USER_SHARE");
  const [refiRatePercent, setRefiRatePercent] = useState<string>("8.0");
  const [refiMaturityMonths, setRefiMaturityMonths] = useState<number>(60);
  const [refiHasProceedsEarly, setRefiHasProceedsEarly] = useState<boolean>(false);
  const [refiAvailableAmount, setRefiAvailableAmount] = useState<string>("495000000");
  const [refiUsedAmount, setRefiUsedAmount] = useState<string>("0");
  const [refiDisbursedOn, setRefiDisbursedOn] = useState<string>("");

  // Form state for planned refinance (FE-08)
  const [prOperation, setPrOperation] = useState<"CREATE" | "REVISE" | "CANCEL">("CREATE");
  const [prSelectedEligibleSourceId, setPrSelectedEligibleSourceId] = useState<string>("");
  const [prSelectedActivePairId, setPrSelectedActivePairId] = useState<string>("");
  const [prSettledOn, setPrSettledOn] = useState<string>("");
  const [prSameDayOrder, setPrSameDayOrder] = useState<"BEFORE_SCHEDULED_PAYMENT" | "AFTER_SCHEDULED_PAYMENT">("AFTER_SCHEDULED_PAYMENT");
  const [prQuotePrincipal, setPrQuotePrincipal] = useState<string>("300000000");
  const [prQuoteInterest, setPrQuoteInterest] = useState<string>("5000000");
  const [prQuoteCarriedInterest, setPrQuoteCarriedInterest] = useState<string>("0");
  const [prQuotePrepaymentFee, setPrQuotePrepaymentFee] = useState<string>("1000000");
  const [prQuoteOtherFee, setPrQuoteOtherFee] = useState<string>("0");
  const [prFundingScope, setPrFundingScope] = useState<"FULL_CONTRACT" | "USER_SHARE">("USER_SHARE");
  const [prExternalTopUp, setPrExternalTopUp] = useState<string>("6000000");
  const [prUserTopUp, setPrUserTopUp] = useState<string>("6000000");
  const [prUserFinancedAmount, setPrUserFinancedAmount] = useState<string>("300000000");
  const [prUnusedProceeds, setPrUnusedProceeds] = useState<string>("0");
  const [prNewAgreementRef, setPrNewAgreementRef] = useState<string>("");
  const [prNewGross, setPrNewGross] = useState<string>("300000000");
  const [prNewFees, setPrNewFees] = useState<string>("0");
  const [prNewRatePercent, setPrNewRatePercent] = useState<string>("7.5");
  const [prNewMonths, setPrNewMonths] = useState<number>(60);
  const [prCancelReason, setPrCancelReason] = useState<string>("Thay đổi kế hoạch tài chính");

  // V4 Asset commands state (FE-09 & FE-10)
  const [assetCommands, setAssetCommands] = useState<AssetSourceCommand[]>([]);
  const [assetTab, setAssetTab] = useState<"create" | "revise" | "end">("create");
  const [selectedAssetOptionSourceId, setSelectedAssetOptionSourceId] = useState<string>("");
  const [assetRef, setAssetRef] = useState<string>("");
  const [assetKind, setAssetKind] = useState<"ASSET_SALE" | "LIQUID_CAPITAL">("ASSET_SALE");
  const [assetAmountScope, setAssetAmountScope] = useState<"WHOLE_ASSET" | "USER_SHARE">("WHOLE_ASSET");
  const [assetOwnershipShare, setAssetOwnershipShare] = useState<string>("1");
  const [assetRetirementShare, setAssetRetirementShare] = useState<string>("1");
  const [assetGrossAmount, setAssetGrossAmount] = useState<string>("1000000000");
  const [assetFees, setAssetFees] = useState<string>("50000000");
  const [assetTaxes, setAssetTaxes] = useState<string>("50000000");
  const [assetSecuredDebt, setAssetSecuredDebt] = useState<string>("100000000");
  const [assetAvailableOn, setAssetAvailableOn] = useState<string>("");
  const [assetConfirmedContribution, setAssetConfirmedContribution] = useState<string>("150000000");
  const [assetFundingStatus, setAssetFundingStatus] = useState<"PLANNED" | "REALIZED" | "STAGED">("PLANNED");
  const [assetContributionMonth, setAssetContributionMonth] = useState<string>("");
  const [assetDocRef, setAssetDocRef] = useState<string>("");
  // Rental exit
  const [assetHasRentalExit, setAssetHasRentalExit] = useState<boolean>(false);
  const [assetRentEndsOn, setAssetRentEndsOn] = useState<string>("");
  const [assetFinalMonthIncome, setAssetFinalMonthIncome] = useState<string>("0");
  // Missed contribution
  const [assetHasMissedContribution, setAssetHasMissedContribution] = useState<boolean>(false);
  const [assetMissedScheduledMonth, setAssetMissedScheduledMonth] = useState<string>("");
  const [assetMissedAmount, setAssetMissedAmount] = useState<string>("");
  const [assetMissedReason, setAssetMissedReason] = useState<string>("");
  // End reason
  const [assetEndReason, setAssetEndReason] = useState<string>("");
  // Staged planning & availability (FE-10)
  const [stagedInstallmentMonth, setStagedInstallmentMonth] = useState<string>("");
  const [stagedInstallmentAmount, setStagedInstallmentAmount] = useState<string>("");
  const [stagedPlannedContributions, setStagedPlannedContributions] = useState<AssetPlannedContribution[]>([]);
  const [stagedReleaseDate, setStagedReleaseDate] = useState<string>("");
  const [stagedReleaseAmount, setStagedReleaseAmount] = useState<string>("");
  const [stagedReleaseStatus, setStagedReleaseStatus] = useState<"CONFIRMED" | "EXPECTED">("CONFIRMED");
  const [stagedReleases, setStagedReleases] = useState<AssetAvailabilityRelease[]>([]);

  useEffect(() => {
    if (selectedPeriod && /^\d{4}-\d{2}$/.test(selectedPeriod)) {
      const [y, m] = selectedPeriod.split("-").map(Number);
      const nextMonthDate = new Date(Date.UTC(y, m, 1));
      const endMonthDate = new Date(Date.UTC(y, m + 2, 1));
      const nextM = nextMonthDate.toISOString().slice(0, 7);
      const endM = endMonthDate.toISOString().slice(0, 7);
      if (!fcStartMonth) setFcStartMonth(nextM);
      if (!fcEndMonth) setFcEndMonth(endM);
      if (!v4FromMonth) setV4FromMonth(nextM);
      if (!v4ToMonth) setV4ToMonth(endM);
    }
  }, [selectedPeriod]);

  // Load eligible pension estimates (FE-05)
  useEffect(() => {
    let active = true;
    listPensionEstimates()
      .then((res) => {
        if (!active) return;
        const eligible = (res.items || []).filter(
          (item) => item.assessment?.assessmentStatus === "ELIGIBLE" && Boolean(item.assessment?.monthlyPension)
        );
        setEligibleEstimates(eligible);
        if (eligible.length > 0 && !selectedEstimateId) {
          setSelectedEstimateId(eligible[0].id);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Compute active sources from registry (FE-04)
  const activeSources = useMemo(() => {
    const revisions = ((v4Candidate?.candidate?.replayInput?.sourceRegistry?.revisions
      || (currentVersion?.preview as any)?.replayInput?.sourceRegistry?.revisions
      || []) as any[]);
    const map = new Map<string, {
      sourceId: string;
      revision: number;
      kind: string;
      operation: string;
      effectiveFromMonth: string;
      effectiveToMonth: string;
    }>();
    for (const r of revisions) {
      if (r?.sourceId) {
        map.set(r.sourceId, {
          sourceId: r.sourceId,
          revision: Number(r.revision) || 1,
          kind: r.kind || "FLOW",
          operation: r.operation || "CREATE",
          effectiveFromMonth: r.effectiveFromMonth || "",
          effectiveToMonth: r.effectiveToMonth || "",
        });
      }
    }
    return [...map.values()].filter((s) => s.operation !== "END");
  }, [v4Candidate, currentVersion]);

  useEffect(() => {
    if (activeSources.length > 0 && (!selectedSourceId || !activeSources.some((s) => s.sourceId === selectedSourceId))) {
      setSelectedSourceId(activeSources[0].sourceId);
    }
  }, [activeSources, selectedSourceId]);

  useEffect(() => {
    const opts = v4Candidate?.loanRevisionOptions || [];
    if (opts.length > 0 && (!selectedLoanOptionSourceId || !opts.some((o) => o.sourceId === selectedLoanOptionSourceId))) {
      setSelectedLoanOptionSourceId(opts[0].sourceId);
    }
  }, [v4Candidate?.loanRevisionOptions, selectedLoanOptionSourceId]);

  useEffect(() => {
    const opts = v4Candidate?.assetRevisionOptions || [];
    if (opts.length > 0 && (!selectedAssetOptionSourceId || !opts.some((o) => o.sourceId === selectedAssetOptionSourceId))) {
      setSelectedAssetOptionSourceId(opts[0].sourceId);
    }
  }, [v4Candidate?.assetRevisionOptions, selectedAssetOptionSourceId]);

  const handleAddFutureChange = () => {
    if (!fcAmount || isNaN(Number(fcAmount)) || Number(fcAmount) < 0) {
      notify.error(language === "en" ? "Invalid Amount" : "Số tiền không hợp lệ", language === "en" ? "Please enter a valid non-negative amount." : "Vui lòng nhập số tiền hợp lệ không âm.");
      return;
    }
    if (!fcStartMonth || !fcEndMonth || fcStartMonth > fcEndMonth) {
      notify.error(language === "en" ? "Invalid Period" : "Khoảng tháng không hợp lệ", language === "en" ? "Start month must be less than or equal to end month." : "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc.");
      return;
    }
    const change: FutureChange = {
      id: crypto.randomUUID(),
      field: fcField,
      operation: "REPLACE_MONTHLY_TOTAL",
      amount: new Decimal(fcAmount).toFixed(),
      startMonth: fcStartMonth,
      endMonth: fcEndMonth,
      reason: fcReason.trim() || (language === "en" ? "Monthly budget adjustment" : "Điều chỉnh ngân sách tháng"),
    };
    setFutureChanges(prev => [...prev, change]);
    setFcAmount("");
    setFcReason("");
  };

  const handleRemoveFutureChange = (id: string) => {
    setFutureChanges(prev => prev.filter(c => c.id !== id));
  };

  const handlePreviewCandidate = async () => {
    if (!activePlan?.id || !currentVersion?.id) {
      notify.error(language === "en" ? "No Active Plan" : "Chưa có kế hoạch", language === "en" ? "An active plan version is required." : "Cần một phiên bản kế hoạch chính thức.");
      return;
    }
    setPreviewingCandidate(true);
    setCandidateError(null);
    setSavedCandidateVersion(null);
    try {
      const res = await previewReforecast({
        planId: activePlan.id,
        versionId: currentVersion.id,
        throughMonth: selectedPeriod,
        expectedProfileRevision: profileRevision > 0 ? profileRevision : 1,
        futureChanges: futureChanges.length > 0 ? futureChanges : undefined,
        sourceChanges: sourceChanges.length > 0 ? sourceChanges : undefined,
      });
      setReforecastCandidate(res);
      if (res.status === "READY") {
        notify.success(
          language === "en" ? "Scenario Ready" : "Kịch bản sẵn sàng",
          language === "en" ? "Reforecast candidate successfully calculated." : "Kịch bản điều chỉnh đã được tính toán thành công."
        );
      } else {
        notify.warning(
          language === "en" ? "Calculation Blocked" : "Dự báo chưa hoàn tất",
          res.issues?.map(i => `${i.month}: ${i.code}`).join("; ") || (language === "en" ? "Issues encountered" : "Có vấn đề phát sinh")
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error previewing reforecast";
      setCandidateError(msg);
      notify.error(language === "en" ? "Preview Error" : "Lỗi xem trước", msg);
    } finally {
      setPreviewingCandidate(false);
    }
  };

  const handleSaveCandidate = async () => {
    if (!activePlan?.id || !currentVersion?.id || !reforecastCandidate?.inputHash || reforecastCandidate.status !== "READY") return;
    setSavingCandidate(true);
    try {
      const previewPayload = {
        planId: activePlan.id,
        versionId: currentVersion.id,
        throughMonth: selectedPeriod,
        expectedProfileRevision: profileRevision > 0 ? profileRevision : 1,
        futureChanges: futureChanges.length > 0 ? futureChanges : undefined,
        sourceChanges: sourceChanges.length > 0 ? sourceChanges : undefined,
      };
      const bodyStr = JSON.stringify({
        expectedRevision: activePlan.revision || 1,
        expectedInputHash: reforecastCandidate.inputHash,
        preview: previewPayload,
      });
      const key = candidateIdempotency && candidateIdempotency.bodyStr === bodyStr
        ? candidateIdempotency.key
        : crypto.randomUUID();
      setCandidateIdempotency({ key, bodyStr });

      const res = await saveReforecast(activePlan.id, {
        expectedRevision: activePlan.revision || 1,
        expectedInputHash: reforecastCandidate.inputHash,
        preview: previewPayload,
      }, key);
      setSavedCandidateVersion(res);
      notify.success(
        language === "en" ? "New Plan Version Saved" : "Đã lưu phiên bản mới",
        language === "en" ? `Saved plan version v${res.version}.` : `Đã lưu thành công phiên bản kế hoạch v${res.version}.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error saving candidate";
      notify.error(language === "en" ? "Save Error" : "Lỗi lưu phiên bản", msg);
    } finally {
      setSavingCandidate(false);
    }
  };

  const handleApplyCandidateVersion = async (v: any) => {
    const versionId = v?.versionId || v?.id;
    if (!activePlan?.id || !versionId) return;
    setApplyingCandidate(true);
    try {
      const rev = profileRevision > 0 ? profileRevision : 1;
      const success = await applyVersion(versionId, rev, v.planId || activePlan.id, v.planRevision || activePlan.revision);
      if (success === false) throw new Error(language === "en" ? "Failed to apply version" : "Áp dụng phiên bản thất bại");
      notify.success(
        language === "en" ? "Plan Version Applied" : "Đã áp dụng phiên bản",
        language === "en" ? `Version v${v.version} is now active.` : `Phiên bản v${v.version} đã trở thành kế hoạch chính thức.`
      );
      navigate("/user/plan");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error applying version";
      notify.error(language === "en" ? "Apply Error" : "Lỗi áp dụng", msg);
    } finally {
      setApplyingCandidate(false);
    }
  };

  const handleAddV4Command = () => {
    if (v4Operation !== "END" && (!v4Amount || isNaN(Number(v4Amount)) || Number(v4Amount) < 0)) {
      notify.error(language === "en" ? "Invalid Amount" : "Số tiền không hợp lệ", language === "en" ? "Please enter a valid amount." : "Vui lòng nhập số tiền hợp lệ.");
      return;
    }
    if (!v4FromMonth || !v4ToMonth || v4FromMonth > v4ToMonth) {
      notify.error(language === "en" ? "Invalid Period" : "Khoảng tháng không hợp lệ", language === "en" ? "Effective from must be before or equal to effective to." : "Tháng bắt đầu phải trước hoặc bằng tháng kết thúc.");
      return;
    }
    if (!v4Document.trim()) {
      notify.error(language === "en" ? "Missing Document" : "Thiếu chứng từ", language === "en" ? "Please enter a document verification note." : "Vui lòng nhập căn cứ/chứng từ xác nhận.");
      return;
    }

    if (v4Operation === "CREATE") {
      const cmd: FlowSourceCommand = {
        commandId: crypto.randomUUID(),
        sourceId: `plan:${crypto.randomUUID()}`,
        expectedSourceRevision: 0,
        effectiveFromMonth: v4FromMonth,
        effectiveToMonth: v4ToMonth,
        confirm: true,
        document: v4Document.trim(),
        operation: "CREATE",
        metric: v4Metric,
        frequency: v4Frequency,
        amount: new Decimal(v4Amount).toFixed(),
        currency: "VND",
        confirmation: "USER_CONFIRMED",
      };
      setSourceCommands(prev => [...prev, cmd]);
    } else {
      const source = activeSources.find(s => s.sourceId === selectedSourceId);
      if (!source) {
        notify.error(language === "en" ? "Source Required" : "Chưa chọn nguồn", language === "en" ? "Please select an existing source to revise or end." : "Vui lòng chọn nguồn hiện có để điều chỉnh hoặc kết thúc.");
        return;
      }
      if (v4Operation === "REVISE") {
        const cmd: FlowSourceCommand = {
          commandId: crypto.randomUUID(),
          sourceId: source.sourceId,
          expectedSourceRevision: source.revision,
          effectiveFromMonth: v4FromMonth,
          effectiveToMonth: v4ToMonth,
          confirm: true,
          document: v4Document.trim(),
          operation: "REVISE",
          metric: v4Metric,
          frequency: v4Frequency,
          amount: new Decimal(v4Amount).toFixed(),
          currency: "VND",
          confirmation: "USER_CONFIRMED",
        };
        setSourceCommands(prev => [...prev, cmd]);
      } else {
        // END operation - strict schema: only identity fields, no metric/amount/confirmation/frequency!
        const cmd: FlowSourceCommand = {
          commandId: crypto.randomUUID(),
          sourceId: source.sourceId,
          expectedSourceRevision: source.revision,
          effectiveFromMonth: v4FromMonth,
          effectiveToMonth: v4ToMonth,
          confirm: true,
          document: v4Document.trim(),
          operation: "END",
        };
        setSourceCommands(prev => [...prev, cmd]);
      }
    }
    setV4Amount("");
    setV4Document("");
  };

  const handleRemoveV4Command = (cmdId: string) => {
    setSourceCommands(prev => prev.filter(c => c.commandId !== cmdId));
  };

  const handleAddPensionSelection = () => {
    const est = eligibleEstimates.find(e => e.id === selectedEstimateId);
    if (!est) {
      notify.error(language === "en" ? "Select Estimate" : "Chọn ước tính", language === "en" ? "Please select an eligible estimate." : "Vui lòng chọn kết quả ước tính hợp lệ.");
      return;
    }
    const registryHash = v4Candidate?.candidate?.replayInput?.sourceRegistry?.registryHash
      || (currentVersion?.preview as any)?.replayInput?.sourceRegistry?.registryHash
      || "";
    if (!registryHash) {
      notify.error(language === "en" ? "Preview Required" : "Cần xem trước", language === "en" ? "Run preview first to establish source registry hash." : "Vui lòng bấm xem trước nguồn V4 để xác lập hash danh mục nguồn từ máy chủ.");
      return;
    }
    const existingPension = activeSources.find(s => s.kind === "PENSION");
    const startMonth = est.assessment.startMonth || v4FromMonth;
    const endMonth = currentVersion?.preview?.calculation?.summary?.endMonth || currentVersion?.preview?.calculation?.summary?.retirementMonth || v4ToMonth || "2060-12";
    const sel: PensionSourceSelection = {
      estimateId: est.id,
      expectedEstimateIntegrityHash: est.integrityHash,
      expectedRegistryHash: registryHash,
      commandId: crypto.randomUUID(),
      sourceId: existingPension ? existingPension.sourceId : `plan:${crypto.randomUUID()}`,
      operation: existingPension ? "REVISE" : "CREATE",
      expectedSourceRevision: existingPension ? existingPension.revision : 0,
      effectiveFromMonth: startMonth,
      effectiveToMonth: endMonth,
      amountPolicy: "FIXED_NOMINAL",
      confirm: true,
    };
    setPensionSelections([sel]);
    notify.success(
      language === "en" ? "Pension Attached" : "Đã gắn nguồn lương hưu",
      `${formatVND(Number(est.assessment.monthlyPension || 0))}/${language === "en" ? "mo from" : "tháng từ"} ${startMonth}`
    );
  };

  const handleRemovePensionSelection = () => {
    setPensionSelections([]);
  };

  const handleAddLoanRevision = () => {
    const option = (v4Candidate?.loanRevisionOptions || []).find(o => o.sourceId === selectedLoanOptionSourceId);
    if (!option) {
      notify.error(language === "en" ? "Select Loan" : "Chọn khoản vay", language === "en" ? "Please select a loan to revise from options." : "Vui lòng chọn một khoản vay từ danh sách.");
      return;
    }
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = todayStr < cutoffDate ? cutoffDate : todayStr;
    const evidenceHash = "a".repeat(64);
    const docRef = lrDocument.trim() || (language === "en" ? "Loan agreement verified" : "Chứng từ hợp đồng vay đã xác nhận");

    const periods = lrOperation === "END"
      ? []
      : generateContractPeriods(cutoffDate, lrMaturityMonths, lrRatePercent);
    const maturityDate = lrOperation === "END" ? cutoffDate : (periods.at(-1)?.dueDate || cutoffDate);

    const contract: LoanContractV2 = {
      contractVersion: 2,
      currency: "VND",
      signedOn: option.legacyOpeningRequired ? lrLegacySignedOn : (lrLegacySignedOn <= cutoffDate ? lrLegacySignedOn : cutoffDate),
      amendedOn: cutoffDate,
      effectiveOn: cutoffDate,
      knownOn,
      confirmation: "BANK_CONFIRMED",
      evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      balanceAsOf: cutoffDate,
      principalBalance: lrOperation === "END" ? "0" : (lrPrincipal ? lrPrincipal.trim() : "0"),
      balanceScope: lrBalanceScope,
      paymentShare: lrBalanceScope === "USER_SHARE" ? "1" : lrPaymentShare,
      responsibility: lrResponsibilityKind === "CAPPED"
        ? {
            kind: "CAPPED",
            capBasis: "TOTAL_USER_PAYMENTS",
            limit: lrCapLimit || "500000000",
            previouslyPaid: lrCapPreviouslyPaid || "0",
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          }
        : { kind: "ALLOCATED_SHARE" },
      interestBasis: "REDUCING_BALANCE",
      rounding: "CENT_HALF_UP",
      mode: lrOperation === "END" ? "BANK_SCHEDULE" : lrMode,
      fixedPayment: lrMode === "REDUCE_TERM_KEEP_PAYMENT" ? (lrFixedPayment || null) : null,
      finalPayment: lrMode === "REDUCE_PAYMENT_KEEP_TERM" ? "ADJUST_FINAL_PAYMENT" : "NO_BALLOON",
      maturityDate,
      periods,
    };

    const cmd: LoanSourceRevisionCommand = {
      commandId: crypto.randomUUID(),
      sourceId: option.sourceId,
      operation: lrOperation,
      expectedSourceRevision: option.sourceRevision,
      expectedSourceHash: option.sourceHash,
      expectedContractHash: option.contractHash,
      confirm: true,
      contract,
      allocations: [],
      principalAdvances: [],
    };

    if (option.legacyOpeningRequired) {
      cmd.legacyOpening = {
        signedOn: lrLegacySignedOn <= cutoffDate ? lrLegacySignedOn : cutoffDate,
        amendedOn: null,
        effectiveOn: lrLegacyEffectiveOn <= cutoffDate ? lrLegacyEffectiveOn : cutoffDate,
        knownOn,
        previouslyPaid: lrLegacyPreviouslyPaid.trim() || "0",
        ...(lrResponsibilityKind === "CAPPED" ? { capBasis: "TOTAL_USER_PAYMENTS" as const } : {}),
        evidence: [{ reference: lrLegacyDoc.trim() || docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      };
    }

    if (lrHasAmendment) {
      cmd.responsibilityAmendment = {
        effectiveOn: cutoffDate,
        openingUserPaid: lrAmendmentOpeningUserPaid.trim() || "0",
        confirm: true,
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      };
    }

    setLoanRevisions(prev => [...prev.filter(c => c.sourceId !== option.sourceId), cmd]);
    notify.success(
      language === "en" ? "Loan Revision Added" : "Đã thêm lệnh sửa khoản vay",
      `${option.sourceId} (${lrOperation})`
    );
  };

  const handleRemoveLoanRevision = (sourceId: string) => {
    setLoanRevisions(prev => prev.filter(c => c.sourceId !== sourceId));
  };

  const handleAddLoanCreation = () => {
    const agreementRef = lcAgreementRef.trim();
    if (!agreementRef) {
      notify.error(language === "en" ? "Agreement Reference" : "Mã hợp đồng", language === "en" ? "Please provide agreement reference." : "Vui lòng nhập mã hợp đồng vay.");
      return;
    }
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = todayStr < cutoffDate ? cutoffDate : todayStr;
    const evidenceHash = "b".repeat(64);
    const docRef = lcDocRef.trim() || (language === "en" ? "Verified loan contract document" : "Chứng từ hợp đồng vay mới");

    const isPlanned = lcFundingKind === "PLANNED_DISBURSEMENT";
    const balanceAsOf = isPlanned ? `${nextMonthStr}-01` : cutoffDate;
    const effectiveOn = isPlanned ? `${nextMonthStr}-01` : cutoffDate;
    const periods = generateContractPeriods(balanceAsOf, lcMaturityMonths, lcRatePercent);
    const maturityDate = periods.at(-1)?.dueDate || balanceAsOf;
    const principal = lcPrincipal.trim() || "100000000";

    const contract: LoanContractV2 = {
      contractVersion: 2,
      currency: "VND",
      signedOn: cutoffDate,
      amendedOn: null,
      effectiveOn,
      knownOn,
      confirmation: isPlanned ? "HYPOTHETICAL" : "BANK_CONFIRMED",
      evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      balanceAsOf,
      principalBalance: principal,
      balanceScope: lcBalanceScope,
      balanceNature: isPlanned ? "PROJECTED_DISBURSEMENT" : undefined,
      paymentShare: lcBalanceScope === "USER_SHARE" ? "1" : lcPaymentShare,
      responsibility: lcResponsibilityKind === "CAPPED"
        ? {
            kind: "CAPPED",
            capBasis: "TOTAL_USER_PAYMENTS",
            limit: lcCapLimit || "500000000",
            previouslyPaid: lcCapPreviouslyPaid || "0",
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          }
        : { kind: "ALLOCATED_SHARE" },
      interestBasis: "REDUCING_BALANCE",
      rounding: "CENT_HALF_UP",
      mode: lcMode,
      fixedPayment: lcMode === "REDUCE_TERM_KEEP_PAYMENT" ? (lcFixedPayment || null) : null,
      finalPayment: lcMode === "REDUCE_PAYMENT_KEEP_TERM" ? "ADJUST_FINAL_PAYMENT" : "NO_BALLOON",
      maturityDate,
      periods,
    };

    let funding: LoanCreation["funding"];
    if (lcFundingKind === "EXISTING_BALANCE") {
      funding = {
        kind: "EXISTING_BALANCE",
        notAlreadyInSources: true,
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      };
    } else if (lcFundingKind === "PLANNED_DISBURSEMENT") {
      const gross = principal;
      const fees = lcWithheldFees.trim() || "0";
      const net = Decimal.max("0", new Decimal(gross).minus(fees)).toString();
      funding = {
        kind: "PLANNED_DISBURSEMENT",
        grossPrincipal: gross,
        withheldFees: fees,
        netDisbursement: net,
        destination: "EXTERNAL_ACCOUNT",
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      };
    } else {
      funding = {
        kind: "DISBURSED_BALANCE",
        notAlreadyInSources: true,
        disbursedOn: lcDisbursedOn || cutoffDate,
        grossPrincipal: principal,
        openingUserPaid: lcOpeningUserPaid.trim() || "0",
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        allocations: [],
        principalAdvances: [],
      };
    }

    const creation: LoanCreation = {
      commandId: crypto.randomUUID(),
      sourceId: `plan:${crypto.randomUUID()}`,
      operation: "CREATE",
      expectedSourceRevision: 0,
      confirm: true,
      agreementReference: agreementRef,
      contract,
      funding,
    };

    setLoanCreations(prev => [...prev, creation]);
    setLcAgreementRef("");
    setLcPrincipal("");
    notify.success(
      language === "en" ? "New Loan Created" : "Đã tạo khoản vay mới",
      `${agreementRef} (${lcFundingKind})`
    );
  };

  const handleRemoveLoanCreation = (cmdId: string) => {
    setLoanCreations(prev => prev.filter(c => c.commandId !== cmdId));
  };

  const handleAddRefinance = () => {
    const closingOption = (v4Candidate?.loanRevisionOptions || []).find(o => o.sourceId === refiClosingSourceId);
    if (!closingOption) {
      notify.error(language === "en" ? "Select Closing Loan" : "Chọn khoản vay tất toán", language === "en" ? "Please select an existing loan to close." : "Vui lòng chọn khoản vay hiện hữu cần tất toán.");
      return;
    }
    const agreementRef = refiNewAgreementRef.trim();
    if (!agreementRef) {
      notify.error(language === "en" ? "Agreement Reference" : "Mã hợp đồng", language === "en" ? "Please enter new loan agreement reference." : "Vui lòng nhập mã hợp đồng vay mới.");
      return;
    }
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = todayStr < cutoffDate ? cutoffDate : todayStr;
    const settledOn = refiSettledOn || cutoffDate;
    const evidenceHash = "c".repeat(64);
    const docRef = language === "en" ? "Refinance verified document" : "Chứng từ tái cấp vốn đã xác nhận";

    const gross = refiGrossDisbursement.trim() || "500000000";
    const withheld = refiWithheldFees.trim() || "0";
    const net = Decimal.max("0", new Decimal(gross).minus(withheld)).toString();
    const available = refiHasProceedsEarly ? (refiAvailableAmount.trim() || net) : net;
    const externalTopUp = refiExternalTopUp.trim() || "0";
    const unused = refiUnusedProceeds.trim() || "0";

    const settlementAmount = Decimal.max("0", new Decimal(available).plus(externalTopUp).minus(unused)).toString();

    const refinanceCommandId = crypto.randomUUID();
    const closingCommandId = crypto.randomUUID();
    const newLoanCommandId = crypto.randomUUID();

    // 1. Linked Closing Loan Revision Command (END)
    const closingCmd: LoanSourceRevisionCommand = {
      commandId: closingCommandId,
      sourceId: closingOption.sourceId,
      operation: "END",
      expectedSourceRevision: closingOption.sourceRevision,
      expectedSourceHash: closingOption.sourceHash,
      expectedContractHash: closingOption.contractHash,
      refinanceCommandId,
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: cutoffDate,
        amendedOn: cutoffDate,
        effectiveOn: cutoffDate,
        knownOn,
        confirmation: "BANK_CONFIRMED",
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        balanceAsOf: cutoffDate,
        principalBalance: "0",
        balanceScope: refiFundingScope,
        paymentShare: refiFundingScope === "USER_SHARE" ? "1" : "0.5",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "CENT_HALF_UP",
        mode: "BANK_SCHEDULE",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: cutoffDate,
        periods: [],
      },
      allocations: [
        {
          allocationId: crypto.randomUUID(),
          eventId: crypto.randomUUID(),
          actualRevision: 1,
          bookedOn: settledOn,
          scope: refiFundingScope,
          components: {
            principal: settlementAmount,
            interest: "0",
            prepaymentFee: "0",
            otherFee: "0",
          },
          contractComponents: {
            principal: settlementAmount,
            interest: "0",
            prepaymentFee: "0",
            otherFee: "0",
          },
          paymentStatus: "CURRENT",
          allocationBasis: "BANK_STATEMENT",
          evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        },
      ],
      principalAdvances: [],
    };

    // 2. Linked New Loan Creation Command
    const newPeriods = generateContractPeriods(cutoffDate, refiMaturityMonths, refiRatePercent);
    const newLoanCmd: LoanCreation = {
      commandId: newLoanCommandId,
      sourceId: `plan:${crypto.randomUUID()}`,
      operation: "CREATE",
      expectedSourceRevision: 0,
      refinanceCommandId,
      agreementReference: agreementRef,
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: cutoffDate,
        amendedOn: null,
        effectiveOn: cutoffDate,
        knownOn,
        confirmation: "BANK_CONFIRMED",
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        balanceAsOf: cutoffDate,
        principalBalance: gross,
        balanceScope: refiFundingScope,
        paymentShare: refiFundingScope === "USER_SHARE" ? "1" : "0.5",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "CENT_HALF_UP",
        mode: "REDUCE_PAYMENT_KEEP_TERM",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: newPeriods.at(-1)?.dueDate || cutoffDate,
        periods: newPeriods,
      },
      funding: refiHasProceedsEarly
        ? {
            kind: "DISBURSED_BALANCE",
            notAlreadyInSources: true,
            disbursedOn: refiDisbursedOn || cutoffDate,
            grossPrincipal: gross,
            openingUserPaid: "0",
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
            allocations: [],
            principalAdvances: [],
          }
        : {
            kind: "EXISTING_BALANCE",
            notAlreadyInSources: true,
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          },
    };

    // 3. Refinance Command
    const refiCmd: RefinanceCommand = {
      commandId: refinanceCommandId,
      closingCommandId,
      newLoanCommandId,
      settledOn,
      fundingScope: refiFundingScope,
      grossDisbursement: gross,
      withheldFees: withheld,
      externalTopUp,
      unusedProceeds: unused,
      confirm: true,
      evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      ...(refiHasProceedsEarly
        ? {
            proceedsAtSettlement: {
              availableAmount: available,
              confirm: true,
              usesBeforeSettlement: refiUsedAmount && Number(refiUsedAmount) > 0
                ? [
                    {
                      useId: crypto.randomUUID(),
                      bookedOn: refiDisbursedOn || cutoffDate,
                      amount: refiUsedAmount,
                      description: language === "en" ? "Used before settlement" : "Đã dùng trước tất toán",
                      evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
                    },
                  ]
                : [],
              evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
            },
          }
        : {}),
    };

    setLoanRevisions(prev => [...prev.filter(c => c.sourceId !== closingOption.sourceId), closingCmd]);
    setLoanCreations(prev => [...prev, newLoanCmd]);
    setRefinances(prev => [...prev, refiCmd]);
    notify.success(
      language === "en" ? "Refinance Added" : "Đã thêm lệnh tái cấp vốn",
      `${closingOption.sourceId} ➔ ${agreementRef}`
    );
  };

  const handleRemoveRefinance = (refiCmdId: string) => {
    const refi = refinances.find(r => r.commandId === refiCmdId);
    if (refi) {
      setLoanRevisions(prev => prev.filter(c => c.commandId !== refi.closingCommandId));
      setLoanCreations(prev => prev.filter(c => c.commandId !== refi.newLoanCommandId));
    }
    setRefinances(prev => prev.filter(r => r.commandId !== refiCmdId));
  };

  const handleAddPlannedRefinance = () => {
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = todayStr < cutoffDate ? cutoffDate : todayStr;
    const evidenceHash = "d".repeat(64);
    const docRef = language === "en" ? "Planned refinance quote document" : "Chứng từ báo giá tái cấp vốn dự kiến";

    if (prOperation === "CANCEL") {
      const activePair = (v4Candidate?.plannedRefinanceOptions?.activePairs || []).find(p => p.pairId === prSelectedActivePairId);
      if (!activePair) {
        notify.error(language === "en" ? "Select Active Pair" : "Chọn cặp đang hoạt động", language === "en" ? "Please select an active pair to cancel." : "Vui lòng chọn cặp tái cấp vốn đang hoạt động cần hủy.");
        return;
      }
      const cancelCmd: PlannedPairCommand = {
        operation: "CANCEL",
        commandId: crypto.randomUUID(),
        replacementCommandId: crypto.randomUUID(),
        pairId: activePair.pairId,
        oldSource: { sourceId: activePair.oldSource.sourceId, revision: activePair.oldSource.revision, sourceHash: activePair.oldSource.sourceHash },
        newSource: { sourceId: activePair.newSource.sourceId, revision: activePair.newSource.revision, sourceHash: activePair.newSource.sourceHash },
        expectedContractHash: activePair.contractHash,
        expectedPairHash: activePair.pairHash,
        reason: prCancelReason.trim() || (language === "en" ? "User cancelled refinance" : "Người dùng hủy phương án tái cấp vốn"),
        confirm: true,
      };
      setPlannedRefinances(prev => [...prev.filter(p => p.pairId !== activePair.pairId), cancelCmd]);
      notify.success(language === "en" ? "Planned Refinance Cancelled" : "Đã thêm lệnh hủy cặp dự kiến", activePair.pairId);
      return;
    }

    if (prOperation === "CREATE") {
      const eligible = (v4Candidate?.plannedRefinanceOptions?.eligibleLoans || []).find(l => l.sourceId === prSelectedEligibleSourceId);
      if (!eligible) {
        notify.error(language === "en" ? "Select Eligible Loan" : "Chọn khoản vay hợp lệ", language === "en" ? "Please select an eligible loan from options." : "Vui lòng chọn khoản vay đủ điều kiện từ danh sách.");
        return;
      }
      const settledOn = prSettledOn || `${nextMonthStr}-15`;
      const gross = prNewGross.trim() || "300000000";
      const fees = prNewFees.trim() || "0";
      const net = Decimal.max("0", new Decimal(gross).minus(fees)).toString();
      const periods = generateContractPeriods(settledOn, prNewMonths, prNewRatePercent);
      const newSourceId = `plan:${crypto.randomUUID()}`;
      const newLoanCommandId = crypto.randomUUID();

      const replacementLoan: LoanCreation = {
        commandId: newLoanCommandId,
        sourceId: newSourceId,
        operation: "CREATE",
        expectedSourceRevision: 0,
        agreementReference: prNewAgreementRef.trim() || `PLANNED-REFI-${Date.now()}`,
        confirm: true,
        contract: {
          contractVersion: 2,
          currency: "VND",
          signedOn: cutoffDate,
          amendedOn: null,
          effectiveOn: settledOn,
          knownOn,
          confirmation: "HYPOTHETICAL",
          evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          balanceAsOf: settledOn,
          principalBalance: gross,
          balanceNature: "PROJECTED_DISBURSEMENT",
          balanceScope: prFundingScope,
          paymentShare: prFundingScope === "USER_SHARE" ? "1" : "0.5",
          responsibility: { kind: "ALLOCATED_SHARE" },
          interestBasis: "REDUCING_BALANCE",
          rounding: "CENT_HALF_UP",
          mode: "REDUCE_PAYMENT_KEEP_TERM",
          fixedPayment: null,
          finalPayment: "ADJUST_FINAL_PAYMENT",
          maturityDate: periods.at(-1)?.dueDate || settledOn,
          periods,
        },
        funding: {
          kind: "PLANNED_DISBURSEMENT",
          grossPrincipal: gross,
          withheldFees: fees,
          netDisbursement: net,
          destination: "EXTERNAL_ACCOUNT",
          evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        },
      };

      const plannedCmd: PlannedPairCommand = {
        operation: "CREATE",
        commandId: crypto.randomUUID(),
        replacementCommandId: newLoanCommandId,
        pairId: crypto.randomUUID(),
        oldSource: { sourceId: eligible.sourceId, revision: eligible.sourceRevision, sourceHash: eligible.sourceHash },
        newSource: { sourceId: newSourceId, revision: 0, sourceHash: null },
        expectedContractHash: eligible.contractHash,
        expectedPairHash: null,
        confirm: true,
        terms: {
          replacement: replacementLoan,
          settledOn,
          sameDayOrder: prSameDayOrder,
          payoffQuote: {
            principal: prQuotePrincipal.trim() || "300000000",
            interest: prQuoteInterest.trim() || "0",
            carriedInterest: prQuoteCarriedInterest.trim() || "0",
            prepaymentFee: prQuotePrepaymentFee.trim() || "0",
            otherFee: prQuoteOtherFee.trim() || "0",
            allRemainingChargesIncluded: true,
            valueKind: "HYPOTHETICAL_QUOTE",
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          },
          funding: {
            scope: prFundingScope,
            externalTopUp: prExternalTopUp.trim() || "0",
            userTopUp: prUserTopUp.trim() || "0",
            userFinancedAmount: prUserFinancedAmount.trim() || gross,
            unusedProceeds: prUnusedProceeds.trim() || "0",
            unusedProceedsNotContributed: true,
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          },
        },
      };

      setPlannedRefinances(prev => [...prev, plannedCmd]);
      notify.success(language === "en" ? "Planned Refinance Created" : "Đã tạo cặp tái cấp vốn dự kiến", eligible.sourceId);
    } else {
      // REVISE
      const activePair = (v4Candidate?.plannedRefinanceOptions?.activePairs || []).find(p => p.pairId === prSelectedActivePairId);
      if (!activePair || !activePair.reviseAllowed) {
        notify.error(language === "en" ? "Revise Not Allowed" : "Không thể sửa", language === "en" ? "Selected pair does not allow revision or is not found." : "Cặp được chọn không cho phép chỉnh sửa.");
        return;
      }
      const settledOn = prSettledOn || activePair.settledOn;
      const gross = prNewGross.trim() || "300000000";
      const fees = prNewFees.trim() || "0";
      const net = Decimal.max("0", new Decimal(gross).minus(fees)).toString();
      const periods = generateContractPeriods(settledOn, prNewMonths, prNewRatePercent);
      const newLoanCommandId = crypto.randomUUID();

      const replacementLoan: LoanCreation = {
        commandId: newLoanCommandId,
        sourceId: activePair.newSource.sourceId,
        operation: "CREATE",
        expectedSourceRevision: 0,
        agreementReference: prNewAgreementRef.trim() || `PLANNED-REFI-${activePair.pairId.slice(0, 8)}`,
        confirm: true,
        contract: {
          contractVersion: 2,
          currency: "VND",
          signedOn: cutoffDate,
          amendedOn: null,
          effectiveOn: settledOn,
          knownOn,
          confirmation: "HYPOTHETICAL",
          evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          balanceAsOf: settledOn,
          principalBalance: gross,
          balanceNature: "PROJECTED_DISBURSEMENT",
          balanceScope: prFundingScope,
          paymentShare: prFundingScope === "USER_SHARE" ? "1" : "0.5",
          responsibility: { kind: "ALLOCATED_SHARE" },
          interestBasis: "REDUCING_BALANCE",
          rounding: "CENT_HALF_UP",
          mode: "REDUCE_PAYMENT_KEEP_TERM",
          fixedPayment: null,
          finalPayment: "ADJUST_FINAL_PAYMENT",
          maturityDate: periods.at(-1)?.dueDate || settledOn,
          periods,
        },
        funding: {
          kind: "PLANNED_DISBURSEMENT",
          grossPrincipal: gross,
          withheldFees: fees,
          netDisbursement: net,
          destination: "EXTERNAL_ACCOUNT",
          evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        },
      };

      const plannedCmd: PlannedPairCommand = {
        operation: "REVISE",
        commandId: crypto.randomUUID(),
        replacementCommandId: newLoanCommandId,
        pairId: activePair.pairId,
        oldSource: { sourceId: activePair.oldSource.sourceId, revision: activePair.oldSource.revision, sourceHash: activePair.oldSource.sourceHash },
        newSource: { sourceId: activePair.newSource.sourceId, revision: activePair.newSource.revision, sourceHash: activePair.newSource.sourceHash },
        expectedContractHash: activePair.contractHash,
        expectedPairHash: activePair.pairHash,
        confirm: true,
        terms: {
          replacement: replacementLoan,
          settledOn,
          sameDayOrder: prSameDayOrder,
          payoffQuote: {
            principal: prQuotePrincipal.trim() || "300000000",
            interest: prQuoteInterest.trim() || "0",
            carriedInterest: prQuoteCarriedInterest.trim() || "0",
            prepaymentFee: prQuotePrepaymentFee.trim() || "0",
            otherFee: prQuoteOtherFee.trim() || "0",
            allRemainingChargesIncluded: true,
            valueKind: "HYPOTHETICAL_QUOTE",
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          },
          funding: {
            scope: prFundingScope,
            externalTopUp: prExternalTopUp.trim() || "0",
            userTopUp: prUserTopUp.trim() || "0",
            userFinancedAmount: prUserFinancedAmount.trim() || gross,
            unusedProceeds: prUnusedProceeds.trim() || "0",
            unusedProceedsNotContributed: true,
            evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
          },
        },
      };

      setPlannedRefinances(prev => [...prev.filter(p => p.pairId !== activePair.pairId), plannedCmd]);
      notify.success(language === "en" ? "Planned Refinance Revised" : "Đã sửa cặp tái cấp vốn dự kiến", activePair.pairId);
    }
  };

  const handleRemovePlannedRefinance = (pairId: string) => {
    setPlannedRefinances(prev => prev.filter(p => p.pairId !== pairId));
  };

  const handleAddStagedInstallment = () => {
    if (!stagedInstallmentMonth || !stagedInstallmentAmount || Number(stagedInstallmentAmount) <= 0) return;
    setStagedPlannedContributions(prev => [
      ...prev,
      {
        installmentId: crypto.randomUUID(),
        month: stagedInstallmentMonth,
        amount: stagedInstallmentAmount,
        timing: "END_OF_MONTH",
      },
    ]);
    setStagedInstallmentAmount("");
  };

  const handleRemoveStagedInstallment = (installmentId: string) => {
    setStagedPlannedContributions(prev => prev.filter(i => i.installmentId !== installmentId));
  };

  const handleAddStagedRelease = () => {
    if (!stagedReleaseDate || !stagedReleaseAmount || Number(stagedReleaseAmount) <= 0) return;
    setStagedReleases(prev => [
      ...prev,
      {
        releaseId: crypto.randomUUID(),
        availableOn: stagedReleaseDate,
        amount: stagedReleaseAmount,
        status: stagedReleaseStatus,
        evidence: [{ reference: assetDocRef || "Release evidence", contentHash: "e".repeat(64), confirmedOn: stagedReleaseDate }],
      },
    ]);
    setStagedReleaseAmount("");
  };

  const handleRemoveStagedRelease = (releaseId: string) => {
    setStagedReleases(prev => prev.filter(r => r.releaseId !== releaseId));
  };

  const handleAddAssetCommand = () => {
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = todayStr < cutoffDate ? cutoffDate : todayStr;
    const evidenceHash = "a".repeat(64);
    const docRef = assetDocRef.trim() || (language === "en" ? "Verified asset capital evidence" : "Chứng từ tài sản và vốn xác nhận");

    if (assetTab === "end") {
      const option = (v4Candidate?.assetRevisionOptions || []).find(o => o.sourceId === selectedAssetOptionSourceId);
      if (!option) {
        notify.error(language === "en" ? "Select Asset" : "Chọn tài sản", language === "en" ? "Please select an asset to end." : "Vui lòng chọn tài sản để dừng.");
        return;
      }
      const endCmd: AssetSourceCommand = {
        commandId: crypto.randomUUID(),
        sourceId: option.sourceId,
        operation: "END",
        expectedSourceRevision: option.sourceRevision,
        expectedSourceHash: option.sourceHash,
        reason: assetEndReason.trim() || (language === "en" ? "Terminated by user" : "Người dùng dừng nguồn vốn"),
        confirm: true,
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
      };
      setAssetCommands(prev => [...prev.filter(c => c.sourceId !== option.sourceId), endCmd]);
      notify.success(language === "en" ? "Asset Terminated" : "Đã thêm lệnh dừng tài sản", option.sourceId);
      return;
    }

    const gross = assetGrossAmount.trim() || "0";
    const fees = assetFees.trim() || "0";
    const taxes = assetTaxes.trim() || "0";
    const debt = assetSecuredDebt.trim() || "0";
    const net = Decimal.max("0", new Decimal(gross).minus(fees).minus(taxes).minus(debt)).toString();
    const availableOn = assetAvailableOn || cutoffDate;
    const confirmedContribution = assetConfirmedContribution.trim() || "0";

    let funding: AssetCapital["funding"];
    if (assetFundingStatus === "PLANNED") {
      funding = {
        status: "PLANNED",
        liquidity: "AVAILABLE",
        notIncludedInFund: true,
        contributionMonth: assetContributionMonth || nextMonthStr,
        contributionTiming: "END_OF_MONTH",
      };
    } else if (assetFundingStatus === "REALIZED") {
      funding = {
        status: "REALIZED",
        allocations: [],
      };
    } else {
      funding = {
        status: "STAGED",
        liquidity: stagedReleases.some(r => r.status === "EXPECTED") ? "PLANNED_RELEASE" : "AVAILABLE",
        plannedNotIncludedInFund: true,
        allocations: [],
        plannedContributions: stagedPlannedContributions,
        reconciliations: [],
        ...(stagedReleases.length > 0
          ? {
              availability: {
                amountScope: "NET_SOURCE_SHARE",
                releases: stagedReleases,
              },
            }
          : {}),
      };
    }

    const capital: AssetCapital = {
      reference: assetRef.trim() || `ASSET-${Date.now()}`,
      kind: assetKind,
      currency: "VND",
      priceBasis: "NOMINAL_AT_AVAILABILITY",
      amountScope: assetAmountScope,
      ownershipShare: assetAmountScope === "USER_SHARE" ? "1" : assetOwnershipShare,
      retirementShare: assetRetirementShare,
      grossAmount: gross,
      fees,
      taxes,
      securedDebtSettlement: debt,
      netAmount: net,
      availableOn,
      confirmedContributionAmount: confirmedContribution,
      funding,
    };

    if (assetTab === "create") {
      const createCmd: AssetSourceCommand = {
        commandId: crypto.randomUUID(),
        sourceId: `plan:${crypto.randomUUID()}`,
        operation: "CREATE",
        expectedSourceRevision: 0,
        expectedSourceHash: null,
        notAlreadyInSources: true,
        confirm: true,
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        capital,
      };
      setAssetCommands(prev => [...prev, createCmd]);
      notify.success(language === "en" ? "Asset Command Added" : "Đã tạo nguồn tài sản mới", capital.reference);
      setAssetRef("");
    } else {
      const option = (v4Candidate?.assetRevisionOptions || []).find(o => o.sourceId === selectedAssetOptionSourceId);
      if (!option) {
        notify.error(language === "en" ? "Select Asset" : "Chọn tài sản", language === "en" ? "Please select an asset to revise." : "Vui lòng chọn tài sản để điều chỉnh.");
        return;
      }
      const reviseCmd: AssetSourceCommand = {
        commandId: crypto.randomUUID(),
        sourceId: option.sourceId,
        operation: "REVISE",
        expectedSourceRevision: option.sourceRevision,
        expectedSourceHash: option.sourceHash,
        confirm: true,
        evidence: [{ reference: docRef, contentHash: evidenceHash, confirmedOn: knownOn }],
        capital,
        ...(assetHasRentalExit
          ? {
              rentalExit: {
                rentEndsOn: assetRentEndsOn || cutoffDate,
                finalMonthIncome: assetFinalMonthIncome.trim() || "0",
                amountScope: "SOURCE_SHARE",
                confirm: true,
              },
            }
          : {}),
        ...(assetHasMissedContribution
          ? {
              missedContribution: {
                scheduledMonth: assetMissedScheduledMonth || selectedPeriod,
                actualRevision: 1,
                amountNotContributed: assetMissedAmount.trim() || "0",
                confirmedOn: knownOn,
                reason: assetMissedReason.trim() || "Chưa nộp khoản dự kiến",
                confirmNotContributed: true,
              },
            }
          : {}),
      };
      setAssetCommands(prev => [...prev.filter(c => c.sourceId !== option.sourceId), reviseCmd]);
      notify.success(language === "en" ? "Asset Revised" : "Đã sửa nguồn tài sản", option.sourceId);
    }
  };

  const handleRemoveAssetCommand = (commandId: string) => {
    setAssetCommands(prev => prev.filter(c => c.commandId !== commandId));
  };

  const handlePreviewV4 = async () => {
    if (!activePlan?.id || !currentVersion?.id) return;
    setPreviewingV4(true);
    setV4Error(null);
    setSavedV4Version(null);
    try {
      const res = await previewSourceReforecast(activePlan.id, {
        versionId: currentVersion.id,
        expectedSnapshotHash: currentVersion.snapshotHash,
        expectedRevision: activePlan.revision || 1,
        expectedProfileRevision: profileRevision > 0 ? profileRevision : 1,
        throughMonth: selectedPeriod,
        sourceCommands: sourceCommands.length > 0 ? sourceCommands : [],
        pensionSelections: pensionSelections.length > 0 ? pensionSelections : [],
        loanRevisions: loanRevisions.length > 0 ? loanRevisions : [],
        loanCreations: loanCreations.length > 0 ? loanCreations : [],
        refinances: refinances.length > 0 ? refinances : [],
        assetCommands: assetCommands.length > 0 ? assetCommands : [],
        plannedRefinances: plannedRefinances.length > 0 ? plannedRefinances : [],
      });
      setV4Candidate(res);
      if (res.status === "READY") {
        notify.success(
          language === "en" ? "V4 Sources Ready" : "Nguồn v4 sẵn sàng",
          language === "en" ? "Source reforecast preview calculated." : "Đã tính toán xem trước điều chỉnh nguồn thành công."
        );
      } else {
        notify.warning(
          language === "en" ? "Incomplete" : "Chưa hoàn tất",
          res.issues?.map(i => i.message || i.code).join("; ") || (language === "en" ? "Issues found" : "Có vấn đề phát sinh")
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error previewing V4";
      setV4Error(msg);
      notify.error(language === "en" ? "V4 Error" : "Lỗi nguồn v4", msg);
    } finally {
      setPreviewingV4(false);
    }
  };

  const handleSaveV4 = async () => {
    if (!activePlan?.id || !currentVersion?.id || !v4Candidate?.inputHash || v4Candidate.status !== "READY") return;
    setSavingV4(true);
    try {
      const previewPayload = {
        versionId: currentVersion.id,
        expectedSnapshotHash: currentVersion.snapshotHash,
        expectedRevision: activePlan.revision || 1,
        expectedProfileRevision: profileRevision > 0 ? profileRevision : 1,
        throughMonth: selectedPeriod,
        sourceCommands: sourceCommands.length > 0 ? sourceCommands : [],
        pensionSelections: pensionSelections.length > 0 ? pensionSelections : [],
        loanRevisions: loanRevisions.length > 0 ? loanRevisions : [],
        loanCreations: loanCreations.length > 0 ? loanCreations : [],
        refinances: refinances.length > 0 ? refinances : [],
        assetCommands: assetCommands.length > 0 ? assetCommands : [],
        plannedRefinances: plannedRefinances.length > 0 ? plannedRefinances : [],
      };
      const bodyStr = JSON.stringify({
        expectedInputHash: v4Candidate.inputHash,
        confirm: true,
        preview: previewPayload,
      });
      const key = v4Idempotency && v4Idempotency.bodyStr === bodyStr
        ? v4Idempotency.key
        : crypto.randomUUID();
      setV4Idempotency({ key, bodyStr });

      const res = await saveSourceReforecast(activePlan.id, {
        expectedInputHash: v4Candidate.inputHash,
        confirm: true,
        preview: previewPayload,
      }, key);
      setSavedV4Version(res.saved);
      setSavedV4PlanRevision(res.revision);
      notify.success(
        language === "en" ? "V4 Version Saved" : "Đã lưu phiên bản nguồn v4",
        language === "en" ? `Saved plan version v${res.saved.version} (plan revision r${res.revision}).` : `Đã lưu phiên bản kế hoạch v${res.saved.version} (phiên bản r${res.revision}).`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error saving V4";
      notify.error(language === "en" ? "Save Error" : "Lỗi lưu phiên bản", msg);
    } finally {
      setSavingV4(false);
    }
  };

  const handleApplyV4Version = async () => {
    if (!activePlan?.id || !savedV4Version?.id) return;
    setApplyingV4(true);
    try {
      const rev = profileRevision > 0 ? profileRevision : 1;
      const planRev = savedV4PlanRevision ?? activePlan.revision;
      const success = await applyVersion(savedV4Version.id, rev, activePlan.id, planRev);
      if (success === false) throw new Error(language === "en" ? "Failed to apply version" : "Áp dụng phiên bản thất bại");
      notify.success(
        language === "en" ? "Plan Version Applied" : "Đã áp dụng phiên bản",
        language === "en" ? `Version v${savedV4Version.version} is now active.` : `Phiên bản v${savedV4Version.version} đã trở thành kế hoạch chính thức.`
      );
      navigate("/user/plan");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error applying version";
      notify.error(language === "en" ? "Apply Error" : "Lỗi áp dụng", msg);
    } finally {
      setApplyingV4(false);
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
            onClick={() => setActiveTab("what-if")}
          >
            <Icon name="sparkles" size="small" /> {language === "en" ? "Scenario Testing (What-if)" : "Thử nghiệm kịch bản (What-if)"}
          </button>
          <button
            type="button"
            className={activeTab === "actuals" ? "is-active" : ""}
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
            title={language === "en" ? "Actual Source Changed" : "Dữ liệu thực tế nguồn đã bị thay đổi"}
          >
            {language === "en"
              ? "Actual transactions linked to this plan version have been modified. Please reconcile actuals and run a reforecast."
              : "Bút toán thực tế liên kết với phiên bản kế hoạch này đã bị sửa đổi. Vui lòng đối soát lại sổ thực tế và lập dự báo mới."}
          </Alert>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: THỬ NGHIỆM KỊCH BẢN & SO SÁNH (FE-T08)             */}
      {/* ========================================================= */}
      {activeTab === "what-if" && (
        <div className="simulation-layout">
          {/* Left: Simulation Controls */}
          <Card className="simulation-controls">
            <header>
              <div>
                <Badge tone="soft">{language === "en" ? "ASSUMPTION PARAMETERS" : "THAM SỐ GIẢ ĐỊNH"}</Badge>
                <h2>{language === "en" ? "Scenario Testing Panel" : "Bảng thử nghiệm kịch bản"}</h2>
                <p>{language === "en" ? "Adjust parameters to observe real-time projected outcomes." : "Điều chỉnh các thông số để thấy ngay kết quả dự phóng thời gian thực."}</p>
              </div>
            </header>

            <div className="simulation-fields">
              {/* 1. Kịch bản kinh tế */}
              <div className="simulation-stepper-card">
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "1. Macroeconomic Scenario" : "1. Kịch bản kinh tế vĩ mô"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "8px" }}>
                  <button
                    type="button"
                    className={`button button-small ${scenario === "BASE" ? "button-primary" : "button-ghost"}`}
                    onClick={() => setScenario("BASE")}
                  >
                    {language === "en" ? "Baseline" : "Cơ sở"}
                  </button>
                  <button
                    type="button"
                    className={`button button-small ${scenario === "ADVERSE" ? "button-primary" : "button-ghost"}`}
                    onClick={() => setScenario("ADVERSE")}
                  >
                    {language === "en" ? "Adverse" : "Bất lợi"}
                  </button>
                  <button
                    type="button"
                    className={`button button-small ${scenario === "FAVORABLE" ? "button-primary" : "button-ghost"}`}
                    onClick={() => setScenario("FAVORABLE")}
                  >
                    {language === "en" ? "Favorable" : "Thuận lợi"}
                  </button>
                </div>
                <p className="stepper-baseline-info" style={{ marginTop: "8px" }}>
                  {scenario === "BASE"
                    ? (language === "en" ? "Standard baseline inflation and return assumptions" : "Giả định lạm phát và lợi suất theo kịch bản chuẩn mực")
                    : scenario === "ADVERSE"
                    ? (language === "en" ? "Higher inflation, constrained investment returns" : "Lạm phát cao hơn, lợi suất đầu tư chịu sức ép")
                    : (language === "en" ? "Positive macro environment, favorable asset growth" : "Môi trường vĩ mô tích cực, tăng trưởng tài sản thuận lợi")}
                </p>
              </div>

              {/* 2. Tuổi nghỉ hưu mong muốn */}
              <div className="simulation-stepper simulation-stepper-card">
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "2. Target Retirement Age (What-if)" : "2. Tuổi nghỉ hưu mong muốn (What-if)"}</span>
                </div>
                <div className="stepper-control-box">
                  <IconButton
                    icon="chevron-left"
                    label={language === "en" ? "Decrease 1 year" : "Giảm 1 tuổi"}
                    onClick={() => setSimRetireAge(Math.max((profile.personal.age || 30) + 1, simRetireAge - 1))}
                  />
                  <div className="stepper-center-cluster">
                    <div className="stepper-main-number-row">
                      <input
                        type="number"
                        min={(profile.personal.age || 30) + 1}
                        max={75}
                        value={simRetireAge}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) setSimRetireAge(Math.min(75, Math.max((profile.personal.age || 30) + 1, val)));
                        }}
                        className="stepper-input-number is-age font-mono"
                        aria-label={language === "en" ? "Target retirement age" : "Tuổi nghỉ hưu mong muốn"}
                      />
                      <span className="stepper-unit-label">{language === "en" ? "yrs" : "tuổi"}</span>
                    </div>
                    <div className="stepper-subtext-badge-row">
                      <span className="stepper-human-readable-subtext font-mono">
                        {language === "en" ? "Retire month" : "Tháng hưu"}: {birthYear + simRetireAge}-12
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
                  {language === "en" ? "Base plan" : "Kế hoạch gốc"}: {profile.goal.targetRetireAge || 60} {language === "en" ? "yrs" : "tuổi"}
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
                    label={language === "en" ? "Decrease 1M ₫" : "Giảm 1 triệu ₫"}
                    onClick={() => setSimMonthlySave(Math.max(0, simMonthlySave - 1000000))}
                  />
                  <div className="stepper-center-cluster">
                    <div className="stepper-main-number-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={new Intl.NumberFormat("vi-VN").format(simMonthlySave)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setSimMonthlySave(digits ? parseInt(digits, 10) : 0);
                        }}
                        className="stepper-input-number is-currency font-mono"
                        aria-label={language === "en" ? "Monthly contribution amount" : "Mức tích lũy mỗi tháng"}
                      />
                      <span className="stepper-unit-label">₫</span>
                    </div>
                    <div className="stepper-subtext-badge-row">
                      <span className="stepper-human-readable-subtext">
                        = {formatVNDText(simMonthlySave, language)} / {language === "en" ? "mo" : "tháng"}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    icon="chevron-right"
                    label={language === "en" ? "Increase 1M ₫" : "Tăng 1 triệu ₫"}
                    onClick={() => setSimMonthlySave(simMonthlySave + 1000000)}
                  />
                </div>
                <p className="stepper-baseline-info">
                  {language === "en" ? "Base plan" : "Kế hoạch gốc"}: {formatVND(profile.plan.monthlySavings)}/{language === "en" ? "mo" : "tháng"}
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
                    label={language === "en" ? "Decrease 1M ₫" : "Giảm 1 triệu ₫"}
                    onClick={() => setSimExpense(Math.max(0, simExpense - 1000000))}
                  />
                  <div className="stepper-center-cluster">
                    <div className="stepper-main-number-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={new Intl.NumberFormat("vi-VN").format(simExpense)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setSimExpense(digits ? parseInt(digits, 10) : 0);
                        }}
                        className="stepper-input-number is-currency font-mono"
                        aria-label={language === "en" ? "Retirement monthly expenses" : "Chi tiêu khi nghỉ hưu"}
                      />
                      <span className="stepper-unit-label">₫</span>
                    </div>
                    <div className="stepper-subtext-badge-row">
                      <span className="stepper-human-readable-subtext">
                        = {formatVNDText(simExpense, language)} / {language === "en" ? "mo" : "tháng"}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    icon="chevron-right"
                    label={language === "en" ? "Increase 1M ₫" : "Tăng 1 triệu ₫"}
                    onClick={() => setSimExpense(simExpense + 1000000)}
                  />
                </div>
                <p className="stepper-baseline-info">
                  {language === "en" ? "Base plan" : "Kế hoạch gốc"}: {formatVND(profile.goal.monthlyExpenseInRetirement || 20000000)}/{language === "en" ? "mo" : "tháng"}
                </p>
              </div>

              {/* 5. Giả định giá trị tài sản (whatIf.assetValues) */}
              <div className="simulation-stepper-card" style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "12px" }}>
                <div className="stepper-header">
                  <span className="stepper-title">{language === "en" ? "5. Hypothetical Asset Revaluation" : "5. Thử nghiệm định giá lại tài sản"}</span>
                  <Badge tone="soft">T08 What-if</Badge>
                </div>
                <p style={{ margin: "4px 0 8px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                  {language === "en"
                    ? "Try adjusting hypothetical asset values to see impacts on retirement fund. This does not alter your base profile."
                    : "Thử thay đổi giá trị tài sản giả định để xem tác động lên quỹ hưu. Giá trị này không thay đổi hồ sơ gốc."}
                </p>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div>
                    <label htmlFor="simulation-real-estate" style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Real Estate" : "Bất động sản"} ({language === "en" ? "original" : "gốc"}: {formatVND(profile.assets.realEstateValue)})
                    </label>
                    <input
                      id="simulation-real-estate"
                      type="text"
                      inputMode="numeric"
                      placeholder={language === "en" ? "Leave blank to keep original" : "Để trống nếu giữ nguyên"}
                      value={overrideRealEstate ? new Intl.NumberFormat("vi-VN").format(Number(overrideRealEstate)) : ""}
                      onChange={(e) => setOverrideRealEstate(e.target.value.replace(/\D/g, ""))}
                      className="input font-mono"
                      style={{ height: "34px", fontSize: "12px", width: "100%", marginTop: "2px" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="simulation-stock-fund" style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Stocks & Investment Funds" : "Cổ phiếu & Quỹ"} ({language === "en" ? "original" : "gốc"}: {formatVND(profile.assets.stockFundValue)})
                    </label>
                    <input
                      id="simulation-stock-fund"
                      type="text"
                      inputMode="numeric"
                      placeholder={language === "en" ? "Leave blank to keep original" : "Để trống nếu giữ nguyên"}
                      value={overrideStock ? new Intl.NumberFormat("vi-VN").format(Number(overrideStock)) : ""}
                      onChange={(e) => setOverrideStock(e.target.value.replace(/\D/g, ""))}
                      className="input font-mono"
                      style={{ height: "34px", fontSize: "12px", width: "100%", marginTop: "2px" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="simulation-guidance" style={{ marginTop: "16px" }}>
              <Icon name="info" />
              <p>
                {language === "en"
                  ? "Simulation runs official T08 calculation engine. Testing scenarios do not modify your official plan until you click 'Apply this scenario'."
                  : "Mô phỏng sử dụng engine T08 chính thức. Kịch bản thử nghiệm không làm thay đổi kế hoạch hiện hành cho đến khi bạn bấm \"Áp dụng kịch bản này\"."}
              </p>
            </div>

            <Button variant="ghost" onClick={resetToBaseline} style={{ marginTop: "12px" }}>
              <Icon name="trash" size="small" /> {language === "en" ? "Reset to base parameters" : "Đặt lại thông số ban đầu"}
            </Button>
          </Card>

          {/* Right: Simulation Results & Comparison */}
          <div className="simulation-results">
            <Card className="simulation-summary">
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
                    {simGap <= 0 ? (language === "en" ? "GOAL SURPLUS" : "DƯ THỪA MỤC TIÊU") : (language === "en" ? "FUNDING SHORTFALL" : "CÒN THIẾU HỤT")}
                  </Badge>}
                </div>
              </header>

              {simError && (
                <div style={{ margin: "16px 0" }}>
                  <Alert tone="danger" title={language === "en" ? "Simulation Error" : "Lỗi chạy mô phỏng"}>
                    {simError}
                  </Alert>
                </div>
              )}

              {!simSummary && !simError && (
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
                  <span>{language === "en" ? "PROJECTED RETIREMENT FUND (A)" : "QUỸ HƯU DỰ KIẾN TÍCH LŨY (A)"}</span>
                  <strong className="font-mono">{formatVND(simProjectedFund)}</strong>
                  <p>
                    {language === "en" ? "Versus required capital" : "So với vốn cần chuẩn bị"} (K = <span className="font-mono">{formatVND(simTargetFund)}</span>):{" "}
                    <b style={{ color: simGap <= 0 ? "var(--color-secondary-700)" : "var(--color-danger)" }} className="font-mono">
                      {simGap <= 0
                        ? `${language === "en" ? "Surplus" : "Vượt"} ${formatVND(Math.abs(simGap))}`
                        : `${language === "en" ? "Shortfall" : "Thiếu"} ${formatVND(simGap)}`}
                    </b>
                  </p>
                </div>

                <div className="simulation-score">
                  <strong className="font-mono">{simScore}%</strong>
                  <span>{language === "en" ? "Coverage Ratio" : "Tỷ lệ bao phủ"}</span>
                  <small className={simScore >= 100 ? "is-positive" : ""}>
                    {simScore >= 100
                      ? (language === "en" ? "Solid" : "Vững vàng")
                      : simScore >= 75
                      ? (language === "en" ? "Promising" : "Khả quan")
                      : (language === "en" ? "Needs Effort" : "Cần nỗ lực thêm")}
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
                  <strong style={{ textAlign: "right" }}>{language === "en" ? "Variance (Delta)" : "Chênh lệch (Delta)"}</strong>
                </div>

                <div>
                  <span>{language === "en" ? "Retirement Month" : "Tháng nghỉ hưu"}</span>
                  <strong className="font-mono">{currentSummary ? currentSummary.retirementMonth : `${birthYear + (profile.goal.targetRetireAge || 60)}-12`}</strong>
                  <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>{birthYear + simRetireAge}-12 ({simRetireAge} {language === "en" ? "yrs" : "tuổi"})</strong>
                  <strong style={{ textAlign: "right" }} className="font-mono">
                    {simRetireAge - (profile.goal.targetRetireAge || 60) > 0
                      ? `+${simRetireAge - (profile.goal.targetRetireAge || 60)} ${language === "en" ? "yrs" : "năm"}`
                      : simRetireAge - (profile.goal.targetRetireAge || 60) < 0
                      ? `${simRetireAge - (profile.goal.targetRetireAge || 60)} ${language === "en" ? "yrs" : "năm"}`
                      : "0"}
                  </strong>
                </div>

                <div>
                  <span>{language === "en" ? "Monthly Savings" : "Mức tích lũy / tháng"}</span>
                  <strong className="font-mono">{formatVND(profile.plan.monthlySavings)}</strong>
                  <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>{formatVND(simMonthlySave)}</strong>
                  <strong style={{ textAlign: "right" }} className="font-mono">
                    {simMonthlySave - profile.plan.monthlySavings >= 0 ? "+" : ""}
                    {formatVND(simMonthlySave - profile.plan.monthlySavings)}
                  </strong>
                </div>

                <div>
                  <span>{language === "en" ? "Retirement Spending" : "Chi tiêu tháng khi hưu"}</span>
                  <strong className="font-mono">{formatVND(profile.goal.monthlyExpenseInRetirement || 20000000)}</strong>
                  <strong className="font-mono">{formatVND(simExpense)}</strong>
                  <strong style={{ textAlign: "right" }} className="font-mono">
                    {simExpense - (profile.goal.monthlyExpenseInRetirement || 20000000) >= 0 ? "+" : ""}
                    {formatVND(simExpense - (profile.goal.monthlyExpenseInRetirement || 20000000))}
                  </strong>
                </div>

                <div>
                  <span>{language === "en" ? "Macro Scenario" : "Kịch bản kinh tế"}</span>
                  <strong>{language === "en" ? "Baseline (BASE)" : "Cơ sở (BASE)"}</strong>
                  <strong style={{ color: "var(--color-secondary-700)" }}>{scenario}</strong>
                  <strong style={{ textAlign: "right" }}>-</strong>
                </div>

                {(() => {
                  const delta = comparisonDelta?.comparison.delta;
                  const projDelta = delta?.projectedFundAtValuation ? parseFloat(delta.projectedFundAtValuation) : null;
                  const reqDelta = delta?.requiredFundAtValuation ? parseFloat(delta.requiredFundAtValuation) : null;
                  const gapDelta = delta?.fundingGapAtValuation ? parseFloat(delta.fundingGapAtValuation) : null;

                  return (
                    <>
                      <div>
                        <span>{language === "en" ? "Projected Fund (A)" : "Quỹ hưu dự kiến (A)"}</span>
                        <strong className="font-mono">{currentSummary ? formatVNDCurrency(currentSummary.atRetirement.projectedFund) : (language === "en" ? "No applied version" : "Chưa có bản áp dụng")}</strong>
                        <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>{formatVND(simProjectedFund)}</strong>
                        <strong style={{ textAlign: "right", color: projDelta !== null ? (projDelta >= 0 ? "var(--color-secondary-700)" : "var(--color-danger)") : undefined }} className="font-mono">
                          {projDelta !== null ? `${projDelta >= 0 ? "+" : ""}${formatVND(projDelta)}` : "-"}
                        </strong>
                      </div>

                      <div>
                        <span>{language === "en" ? "Required Capital (K)" : "Vốn cần chuẩn bị (K)"}</span>
                        <strong className="font-mono">{currentSummary ? formatVNDCurrency(currentSummary.atRetirement.requiredFund) : (language === "en" ? "No applied version" : "Chưa có bản áp dụng")}</strong>
                        <strong className="font-mono">{formatVND(simTargetFund)}</strong>
                        <strong style={{ textAlign: "right" }} className="font-mono">
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
                          ? `Retirement scenario at age ${simRetireAge} exceeds your goal by ${formatVND(Math.abs(simGap))}. You can comfortably maintain this contribution level or consider retiring earlier.`
                          : `Kịch bản nghỉ hưu ở tuổi ${simRetireAge} cho kết quả vượt mục tiêu ${formatVND(Math.abs(simGap))}. Bạn có thể an tâm duy trì mức đóng góp này hoặc nghỉ sớm hơn.`)
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
                  onClick={handleApplyScenario}
                  loading={applying}
                  disabled={applying || isSimulating || !simSummary}
                >
                  {language === "en" ? "Apply this scenario" : "Áp dụng kịch bản này"} <Icon name="check" />
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
      {activeTab === "actuals" && (
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          {/* Header Controls: Period Picker & Status */}
          <Card style={{ padding: "var(--space-5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                    {language === "en" ? "Reconciliation Period (Vietnam)" : "Kỳ đối soát tháng (Việt Nam)"}
                  </label>
                  <input
                    type="month"
                    max={currentVnMonth}
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="input font-mono"
                    style={{ height: "38px", fontSize: "14px", fontWeight: 600 }}
                  />
                </div>

                {selectedPeriod === currentVnMonth && (
                  <Badge tone="warning">
                    {language === "en" ? "Current Month (Unclosed)" : "Tháng hiện tại (chưa đóng sổ hoàn toàn)"}
                  </Badge>
                )}

                {monthDetail && (
                  <Badge tone="soft">
                    {language === "en"
                      ? `Saved r${monthDetail.revision} • Updated ${new Date(monthDetail.updatedAt).toLocaleDateString("en-US")}`
                      : `Đã lưu r${monthDetail.revision} • Cập nhật ${new Date(monthDetail.updatedAt).toLocaleDateString("vi-VN")}`}
                  </Badge>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                {monthDetail?.history && monthDetail.history.length > 0 && (
                  <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                    <Icon name="file-text" size="small" /> {language === "en" ? "Edit History" : "Lịch sử chỉnh sửa"} ({monthDetail.history.length})
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={handleSaveActualMonth}
                  loading={savingActual}
                  disabled={ledgerLoading}
                >
                  <Icon name="check" size="small" /> {language === "en" ? `Save Ledger ${selectedPeriod}` : `Lưu sổ tháng ${selectedPeriod}`}
                </Button>
              </div>
            </div>
          </Card>

          {/* Balances & Real-Time Reconciliation Dashboard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {language === "en" ? "OPENING BALANCE (REPORTED)" : "SỐ DƯ ĐẦU KỲ (THỰC KHAI)"}
              </span>
              <div style={{ marginTop: "6px" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={new Intl.NumberFormat("vi-VN").format(Number(openingBalance) || 0)}
                  onChange={(e) => setOpeningBalance(e.target.value.replace(/\D/g, ""))}
                  className="input font-mono"
                  style={{ fontSize: "18px", fontWeight: 700, width: "100%" }}
                />
              </div>
              <small style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                {language === "en" ? `Retirement asset balance at start of ${selectedPeriod}` : `Số dư tài sản hưu đầu tháng ${selectedPeriod}`}
              </small>
            </Card>

            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {language === "en" ? "CLOSING BALANCE (REPORTED)" : "SỐ DƯ CUỐI KỲ (THỰC KHAI)"}
              </span>
              <div style={{ marginTop: "6px" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={new Intl.NumberFormat("vi-VN").format(Number(closingBalance) || 0)}
                  onChange={(e) => setClosingBalance(e.target.value.replace(/\D/g, ""))}
                  className="input font-mono"
                  style={{ fontSize: "18px", fontWeight: 700, width: "100%" }}
                />
              </div>
              <small style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                {language === "en" ? "Actual balance verified from end-of-month statements" : "Số dư thực tế đối chiếu từ sao kê cuối tháng"}
              </small>
            </Card>

            <Card style={{ padding: "var(--space-4)", background: "var(--color-surface-subtle)" }}>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {language === "en" ? "CALCULATED CLOSING (SYSTEM)" : "SỐ DƯ CUỐI TÍNH TOÁN (HỆ THỐNG)"}
              </span>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "6px", color: "var(--color-primary-700)" }}>
                {formatVND(Number(localReconcile.calculatedClosingBalance))}
              </strong>
              <small style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                {language === "en" ? "Opening + Inflow - Outflow + Gain/Loss - Fee + Adjustment" : "Đầu kỳ + Nộp - Rút + Lãi + Biến động - Phí + Điều chỉnh"}
              </small>
            </Card>

            <Card style={{
              padding: "var(--space-4)",
              background: localReconcile.reconciliation === "MATCHED" ? "var(--color-success-soft)" : "rgba(var(--color-danger-rgb), 0.08)",
              border: `1.5px solid ${localReconcile.reconciliation === "MATCHED" ? "var(--color-secondary-500)" : "var(--color-danger)"}`
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: localReconcile.reconciliation === "MATCHED" ? "var(--color-secondary-700)" : "var(--color-danger)" }}>
                  {language === "en" ? "BALANCE RECONCILIATION" : "ĐỐI SOÁT SỐ DƯ"}
                </span>
                <Badge tone={localReconcile.reconciliation === "MATCHED" ? "success" : "danger"}>
                  {localReconcile.reconciliation === "MATCHED"
                    ? (language === "en" ? "FULLY MATCHED" : "KHỚP HOÀN TOÀN")
                    : (language === "en" ? "DISCREPANCY" : "LỆCH SỐ DƯ")}
                </Badge>
              </div>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "6px", color: localReconcile.reconciliation === "MATCHED" ? "var(--color-secondary-700)" : "var(--color-danger)" }}>
                {formatVND(Number(localReconcile.discrepancy))}
              </strong>
              <small style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px", display: "block" }}>
                {localReconcile.reconciliation === "MATCHED"
                  ? (language === "en" ? "Reported balance fully matches calculated transactions" : "Số dư thực tế khớp hoàn toàn với các dòng giao dịch")
                  : (language === "en" ? "Variance between reported and calculated balances" : "Chênh lệch giữa số dư thực khai và số dư tính toán")}
              </small>
            </Card>
          </div>

          {/* Household Flow & Contribution Insights */}
          {/* Household Flow & Contribution Insights (FE-03) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
            <Card style={{ padding: "var(--space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                  {language === "en" ? "HOUSEHOLD CASHFLOW SURPLUS" : "THẶNG DƯ THU CHI GIA ĐÌNH"}
                </span>
                <Badge tone={localReconcile.cashflowState === "SURPLUS" ? "success" : localReconcile.cashflowState === "DEFICIT" ? "danger" : "soft"}>
                  {localReconcile.cashflowState === "SURPLUS"
                    ? (language === "en" ? "SURPLUS" : "THẶNG DƯ")
                    : localReconcile.cashflowState === "DEFICIT"
                    ? (language === "en" ? "DEFICIT" : "THÂM HỤT")
                    : (language === "en" ? "BALANCED" : "CÂN BẰNG")}
                </Badge>
              </div>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "8px" }}>
                {formatVND(Number(localReconcile.householdSurplus))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Income - Living - Debt" : "Thu nhập - Chi tiêu - Trả nợ"}
              </p>
            </Card>

            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                {language === "en" ? "CONFIRMED FUND CONTRIBUTION" : "ĐÓNG GÓP ĐƯỢC XÁC NHẬN"}
              </span>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "8px", color: "var(--color-primary-700)" }}>
                {formatVND(Number(localReconcile.confirmedContribution))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Capped by household surplus" : "Tích lũy được đảm bảo bởi thặng dư"}
              </p>
            </Card>

            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                {language === "en" ? "UNINVESTED CASH SURPLUS" : "THẶNG DƯ CÒN NGOÀI QUỸ"}
              </span>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "8px", color: "var(--color-secondary-700)" }}>
                {formatVND(Number(localReconcile.uninvestedSurplus))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Surplus outside retirement fund" : "Thặng dư khả dụng chưa tích lũy"}
              </p>
            </Card>

            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                {language === "en" ? "BUDGET SHORTFALL / DEFICIT" : "THIẾU HỤT NGÂN SÁCH (NẾU CÓ)"}
              </span>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "8px", color: Number(localReconcile.budgetShortfall) > 0 ? "var(--color-danger)" : "var(--color-text-muted)" }}>
                {formatVND(Number(localReconcile.budgetShortfall))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Contribution exceeding available surplus" : "Góp vượt thặng dư (cần tài trợ ngoài)"}
              </p>
            </Card>

            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                {language === "en" ? "TOTAL ACTUAL CONTRIBUTION" : "TỔNG ĐÓNG GÓP THỰC TẾ"}
              </span>
              <strong className="font-mono" style={{ fontSize: "20px", display: "block", marginTop: "8px", color: "var(--color-primary-700)" }}>
                {formatVND(Number(localReconcile.actualContribution))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Plan target" : "Mục tiêu"}: {formatVND(profile.plan.monthlySavings)}/{language === "en" ? "mo" : "tháng"}
              </p>
            </Card>
          </div>

          {/* Entries Table */}
          <Card style={{ padding: "var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <div>
                <h2>{language === "en" ? `Monthly Transaction Ledger (${entries.length})` : `Chi tiết giao dịch trong tháng (${entries.length})`}</h2>
                <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "12px" }}>
                  {language === "en"
                    ? "Declare household cash flows and direct retirement fund transactions."
                    : "Khai báo các luồng thu chi gia đình và biến động trực tiếp của quỹ hưu trí."}
                </p>
              </div>
              <Button variant="secondary" onClick={handleAddEntry}>
                <Icon name="plus" size="small" /> {language === "en" ? "Add Transaction" : "Thêm giao dịch"}
              </Button>
            </div>

            {entries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "var(--space-8)", border: "1px dashed var(--color-border)", borderRadius: "var(--radius-md)" }}>
                <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
                  {language === "en" ? "No transaction records for this month yet." : "Chưa có dòng giao dịch nào trong tháng này."}
                </p>
                <Button variant="ghost" onClick={handleAddEntry} style={{ marginTop: "12px" }}>
                  {language === "en" ? "Add first transaction" : "Thêm giao dịch đầu tiên"}
                </Button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Date" : "Ngày"}</th>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Flow Type" : "Loại dòng tiền"}</th>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Amount (VND)" : "Số tiền (VND)"}</th>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Notes / Description" : "Ghi chú / Giải thích"}</th>
                      <th style={{ padding: "8px 12px", width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.eventId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="date"
                            value={entry.date}
                            min={`${selectedPeriod}-01`}
                            max={`${selectedPeriod}-31`}
                            onChange={(e) => handleUpdateEntry(entry.eventId, { date: e.target.value })}
                            className="input font-mono"
                            style={{ height: "32px", fontSize: "12px", width: "135px" }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <select
                            value={entry.kind}
                            onChange={(e) => handleUpdateEntry(entry.eventId, { kind: e.target.value as ActualKind })}
                            className="input"
                            style={{ height: "32px", fontSize: "12px", minWidth: "200px" }}
                          >
                            {(Object.keys(ACTUAL_KIND_LABELS) as ActualKind[]).map((k) => (
                              <option key={k} value={k}>
                                {getActualKindLabel(k, language)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={entry.amount}
                            onChange={(e) => {
                              // Allow minus sign for MARKET_CHANGE and BALANCE_ADJUSTMENT
                              const val = e.target.value;
                              if (["MARKET_CHANGE", "BALANCE_ADJUSTMENT"].includes(entry.kind)) {
                                if (/^-?\d*$/.test(val)) {
                                  handleUpdateEntry(entry.eventId, { amount: val });
                                }
                              } else {
                                const clean = val.replace(/\D/g, "");
                                handleUpdateEntry(entry.eventId, { amount: clean });
                              }
                            }}
                            className="input font-mono"
                            style={{ height: "32px", fontSize: "12px", width: "140px", textAlign: "right" }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="text"
                            placeholder={entry.kind === "BALANCE_ADJUSTMENT" ? (language === "en" ? "Required explanation for audit adjustment" : "Bắt buộc giải thích lý do điều chỉnh") : (language === "en" ? "Optional note" : "Ghi chú tuỳ chọn")}
                            value={entry.note || ""}
                            onChange={(e) => handleUpdateEntry(entry.eventId, { note: e.target.value })}
                            className="input"
                            style={{
                              height: "32px",
                              fontSize: "12px",
                              width: "100%",
                              borderColor: entry.kind === "BALANCE_ADJUSTMENT" && !entry.note?.trim() ? "var(--color-danger)" : undefined
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <IconButton
                            icon="trash"
                            label={language === "en" ? "Delete row" : "Xóa dòng"}
                            onClick={() => handleRemoveEntry(entry.eventId)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px dashed var(--color-border)" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-primary-700)", display: "block", marginBottom: "4px" }}>
                {language === "en" ? "Monthly Ledger Revision Reason / Notes *" : "Lý do cập nhật / Ghi chú sổ tháng *"}
              </label>
              <input
                type="text"
                placeholder={language === "en" ? "E.g. Reconciled bank and brokerage statements" : "VD: Cập nhật sao kê tài khoản ngân hàng và công ty chứng khoán"}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="input"
                style={{ width: "100%", height: "36px", fontSize: "12px" }}
              />
            </div>
          </Card>

          {/* Reforecast Section */}
          <Card style={{ padding: "var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
              <div>
                <Badge tone="soft">{language === "en" ? "REFORECAST & SOURCES" : "DỰ BÁO LẠI & ĐIỀU CHỈNH NGUỒN"}</Badge>
                <h2>{language === "en" ? "Reforecast from Anchored Balance & Planned Adjustments" : "Dự báo lại từ mốc thực tế và điều chỉnh tương lai"}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: "12.5px" }}>
                  {language === "en"
                    ? `Anchor verified balance of ${selectedPeriod} to project future months or test scenario adjustments.`
                    : `Lấy số dư thực tế tháng ${selectedPeriod} làm mốc neo để dự phóng lại hoặc thử nghiệm kịch bản điều chỉnh.`}
                </p>
              </div>

              {/* Sub-tab Switcher */}
              <div style={{ display: "flex", gap: "6px", background: "var(--color-surface-subtle)", padding: "4px", borderRadius: "var(--radius-lg)" }}>
                <button
                  type="button"
                  onClick={() => setReforecastSubTab("standard")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: reforecastSubTab === "standard" ? "var(--color-primary-700)" : "transparent",
                    color: reforecastSubTab === "standard" ? "#ffffff" : "var(--color-text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {language === "en" ? "Anchor Baseline" : "Neo số dư chuẩn"}
                </button>
                <button
                  type="button"
                  onClick={() => setReforecastSubTab("future-changes")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: reforecastSubTab === "future-changes" ? "var(--color-primary-700)" : "transparent",
                    color: reforecastSubTab === "future-changes" ? "#ffffff" : "var(--color-text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {language === "en" ? "Future Cash Flows" : "Dòng tiền tương lai"} {futureChanges.length > 0 ? `(${futureChanges.length})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setReforecastSubTab("sources-v4")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: reforecastSubTab === "sources-v4" ? "var(--color-primary-700)" : "transparent",
                    color: reforecastSubTab === "sources-v4" ? "#ffffff" : "var(--color-text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {language === "en" ? "Source Commands (V4)" : "Lệnh nguồn (V4)"} {sourceCommands.length > 0 ? `(${sourceCommands.length})` : ""}
                </button>
              </div>
            </div>

            {/* ========================================================= */}
            {/* SUBTAB 1: STANDARD ANCHOR REFORECAST                      */}
            {/* ========================================================= */}
            {reforecastSubTab === "standard" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                  <Button
                    variant="primary"
                    onClick={handleRunReforecast}
                    loading={reforecasting}
                    disabled={!activePlan?.id || !currentVersion?.id}
                  >
                    <Icon name="sparkles" size="small" /> {language === "en" ? "Run Standard Reforecast" : "Chạy dự báo neo số dư"}
                  </Button>
                </div>

                {reforecastError && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="danger" title={language === "en" ? "Reforecast Error" : "Lỗi dự báo lại"}>
                      {reforecastError}
                    </Alert>
                  </div>
                )}

                {reforecastResult?.status === "BLOCKED" && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="warning" title={language === "en" ? "Reforecast Blocked by Data Integrity" : "Dự báo bị chặn bởi tính toàn vẹn dữ liệu"}>
                      <p style={{ margin: "0 0 8px" }}>
                        {language === "en"
                          ? "To guarantee algorithm reliability, the system requires a continuous, fully reconciled series without discrepancies:"
                          : "Để đảm bảo độ tin cậy của thuật toán, hệ thống yêu cầu chuỗi đối soát liên tục và không có tháng lệch:"}
                      </p>
                      <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px" }}>
                        {reforecastResult.issues.map((iss, i) => (
                          <li key={i}>
                            {language === "en" ? "Month" : "Tháng"} <span className="font-mono">{iss.month}</span>:{" "}
                            {iss.code === "MISSING_MONTH" && (language === "en" ? "Unrecorded actual month" : "Chưa khai báo sổ thực tế")}
                            {iss.code === "UNRECONCILED_MONTH" && (language === "en" ? "Month has unreconciled discrepancy (UNRECONCILED)" : "Sổ thực tế chưa khớp số dư đối soát (UNRECONCILED)")}
                            {iss.code === "OPENING_BALANCE_MISMATCH" && (language === "en" ? "Opening balance does not match previous month's closing balance" : "Số dư đầu kỳ không khớp số dư cuối kỳ tháng trước")}
                            {iss.code === "MONTH_NOT_CLOSED" && (language === "en" ? "Current month cycle is still ongoing" : "Tháng hiện tại chưa kết thúc chu kỳ")}
                          </li>
                        ))}
                      </ul>
                    </Alert>
                  </div>
                )}

                {reforecastResult?.status === "HORIZON_COMPLETE" && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="info" title={language === "en" ? "Projection Horizon Completed" : "Hoàn thành chân trời dự phóng"}>
                      {language === "en"
                        ? "The entire projection horizon of this plan version has elapsed. Please create a new version for ongoing long-term planning."
                        : "Toàn bộ kỳ dự báo của phiên bản kế hoạch đã qua. Hãy tạo phiên bản mới nếu bạn muốn lập kế hoạch dài hạn tiếp theo."}
                    </Alert>
                  </div>
                )}

                {reforecastResult?.status === "READY" && reforecastResult.calculation && (
                  <div style={{ marginTop: "20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                      <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {language === "en" ? "ACTUAL ANCHOR" : "MỐC NEO THỰC TẾ (ANCHOR)"}
                        </span>
                        <strong className="font-mono" style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>
                          {reforecastResult.anchor?.period}: {formatVND(Number(reforecastResult.anchor?.closingBalance))}
                        </strong>
                      </div>
                      <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {language === "en" ? "PROJECTED RETIREMENT FUND (REFORECAST)" : "QUỸ DỰ KIẾN HƯU (REFORECAST)"}
                        </span>
                        <strong className="font-mono" style={{ display: "block", fontSize: "16px", marginTop: "4px", color: "var(--color-primary-700)" }}>
                          {formatVND(Number(reforecastResult.calculation.summary.atRetirement.projectedFund))}
                        </strong>
                      </div>
                      <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {language === "en" ? "REVISED COVERAGE RATIO" : "TỶ LỆ BAO PHỦ MỚI"}
                        </span>
                        <strong className="font-mono" style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>
                          {reforecastResult.calculation.summary.atRetirement.coveragePercent}%
                        </strong>
                      </div>
                    </div>

                    {/* 3-Layer Comparison Table */}
                    <h3>{language === "en" ? "3-Layer Comparison: Original Forecast / Actuals / Reforecast" : "Bảng đối chiếu 3 lớp: Dự báo gốc / Thực tế / Dự báo lại"}</h3>
                    <div style={{ overflowX: "auto", marginTop: "12px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                            <th style={{ padding: "8px 12px" }}>{language === "en" ? "Month" : "Tháng"}</th>
                            <th style={{ padding: "8px 12px" }}>{language === "en" ? "Actual Balance" : "Số thực tế (Actual)"}</th>
                            <th style={{ padding: "8px 12px" }}>{language === "en" ? "Original Forecast" : "Dự báo gốc (Forecast)"}</th>
                            <th style={{ padding: "8px 12px" }}>{language === "en" ? "Variance (Delta)" : "Chênh lệch (Delta)"}</th>
                            <th style={{ padding: "8px 12px" }}>{language === "en" ? "Actual Contribution" : "Tích lũy thực tế"}</th>
                            <th style={{ padding: "8px 12px" }}>{language === "en" ? "Forecast Contribution" : "Tích lũy dự báo"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reforecastResult.comparison.map((row) => (
                            <tr key={row.month} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "8px 12px", fontWeight: 600 }} className="font-mono">{row.month}</td>
                              <td style={{ padding: "8px 12px" }} className="font-mono">{formatVND(Number(row.actualClosingBalance))}</td>
                              <td style={{ padding: "8px 12px" }} className="font-mono">{formatVND(Number(row.forecastClosingBalance))}</td>
                              <td style={{ padding: "8px 12px", color: Number(row.closingBalanceDelta) >= 0 ? "var(--color-secondary-700)" : "var(--color-danger)" }} className="font-mono">
                                {Number(row.closingBalanceDelta) >= 0 ? "+" : ""}{formatVND(Number(row.closingBalanceDelta))}
                              </td>
                              <td style={{ padding: "8px 12px" }} className="font-mono">{formatVND(Number(row.actualContribution))}</td>
                              <td style={{ padding: "8px 12px" }} className="font-mono">{formatVND(Number(row.forecastContribution))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* SUBTAB 2: FUTURE CASH FLOW ADJUSTMENTS (P13/P15 & Q15-03)   */}
            {/* ========================================================= */}
            {reforecastSubTab === "future-changes" && (
              <div>
                <div style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "var(--color-primary-800)" }}>
                    {language === "en" ? "Configure Monthly Total Adjustments" : "Thiết lập điều chỉnh tổng dòng tiền theo tháng"}
                  </h4>
                  <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {language === "en"
                      ? "Directly replace monthly aggregate totals for future periods. Surplus policy strictly respects confirmed deposits only."
                      : "Thay thế trực tiếp tổng tháng cho thu nhập, sinh hoạt, chi bổ sung hoặc mức tích lũy trong các tháng tương lai. Chính sách quỹ chỉ nộp đúng số xác nhận."}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Field to Adjust" : "Hạng mục điều chỉnh"}
                      </label>
                      <select
                        className="input"
                        value={fcField}
                        onChange={(e) => setFcField(e.target.value as FutureChangeField)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      >
                        <option value="plannedContribution">{language === "en" ? "Planned Contribution (Savings)" : "Đóng góp tích lũy (Quỹ hưu)"}</option>
                        <option value="livingExpense">{language === "en" ? "Living Expense" : "Chi phí sinh hoạt"}</option>
                        <option value="income">{language === "en" ? "Total Income" : "Tổng thu nhập"}</option>
                        <option value="additionalExpense">{language === "en" ? "Additional Expense" : "Chi phí bổ sung"}</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Start Month" : "Tháng bắt đầu"}
                      </label>
                      <input
                        type="month"
                        className="input"
                        value={fcStartMonth}
                        onChange={(e) => setFcStartMonth(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "End Month" : "Tháng kết thúc"}
                      </label>
                      <input
                        type="month"
                        className="input"
                        value={fcEndMonth}
                        onChange={(e) => setFcEndMonth(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "New Monthly Amount (VND)" : "Số tiền thay thế mỗi tháng (VND)"}
                      </label>
                      <input
                        type="number"
                        placeholder="VD: 5000000"
                        className="input"
                        value={fcAmount}
                        onChange={(e) => setFcAmount(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Reason / Document Reference" : "Lý do / Tham chiếu chứng từ"}
                      </label>
                      <input
                        type="text"
                        placeholder={language === "en" ? "E.g. Salary review or adjusted savings schedule" : "VD: Tăng lương hoặc điều chỉnh kế hoạch tích lũy"}
                        className="input"
                        value={fcReason}
                        onChange={(e) => setFcReason(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>
                    <Button variant="secondary" onClick={handleAddFutureChange}>
                      <Icon name="plus" size="small" /> {language === "en" ? "Add Adjustment" : "Thêm điều chỉnh"}
                    </Button>
                  </div>
                </div>

                {/* List of active future changes */}
                {futureChanges.length > 0 && (
                  <div style={{ marginBottom: "16px", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Field" : "Hạng mục"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Period" : "Khoảng thời gian"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "New Amount" : "Số tiền thay thế"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Reason" : "Lý do"}</th>
                          <th style={{ padding: "6px 10px", width: "40px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {futureChanges.map((c) => (
                          <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>
                              {c.field === "plannedContribution" && (language === "en" ? "Savings" : "Đóng góp tích lũy")}
                              {c.field === "livingExpense" && (language === "en" ? "Living" : "Sinh hoạt")}
                              {c.field === "income" && (language === "en" ? "Income" : "Thu nhập")}
                              {c.field === "additionalExpense" && (language === "en" ? "Additional" : "Chi bổ sung")}
                            </td>
                            <td style={{ padding: "6px 10px" }} className="font-mono">{c.startMonth} → {c.endMonth}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-primary-700)" }} className="font-mono">{formatVND(Number(c.amount))}</td>
                            <td style={{ padding: "6px 10px", color: "var(--color-text-muted)" }}>{c.reason}</td>
                            <td style={{ padding: "6px 10px" }}>
                              <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveFutureChange(c.id)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <Button
                    variant="primary"
                    onClick={handlePreviewCandidate}
                    loading={previewingCandidate}
                    disabled={!activePlan?.id || !currentVersion?.id}
                  >
                    <Icon name="sparkles" size="small" /> {language === "en" ? "Preview Scenario Candidate" : "Xem trước kịch bản điều chỉnh"}
                  </Button>
                </div>

                {candidateError && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="danger" title={language === "en" ? "Preview Error" : "Lỗi xem trước"}>{candidateError}</Alert>
                  </div>
                )}

                {/* Non-READY candidate warning banner (FE-03) */}
                {reforecastCandidate && reforecastCandidate.status !== "READY" && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert
                      tone={reforecastCandidate.status === "BLOCKED" ? "danger" : "info"}
                      title={reforecastCandidate.status === "BLOCKED" ? (language === "en" ? "Reforecast Blocked" : "Dự báo bị chặn") : (language === "en" ? "Horizon Complete" : "Đã hoàn thành chân trời")}
                    >
                      <p style={{ margin: 0, fontSize: "12px" }}>
                        {reforecastCandidate.status === "BLOCKED"
                          ? (language === "en" ? "Calculation blocked due to data integrity or validation issues:" : "Dự báo bị chặn do vi phạm tính toàn vẹn hoặc đối soát dữ liệu:")
                          : (language === "en" ? "The full retirement projection horizon has already completed." : "Toàn bộ chân trời dự phóng đã hoàn thành.")}
                      </p>
                      {reforecastCandidate.issues && reforecastCandidate.issues.length > 0 && (
                        <ul style={{ margin: "6px 0 0", paddingLeft: "20px", fontSize: "12px" }}>
                          {reforecastCandidate.issues.map((iss: any, i: number) => (
                            <li key={i}>{iss.month ? `[${iss.month}] ` : ""}{iss.message || iss.code}</li>
                          ))}
                        </ul>
                      )}
                    </Alert>
                  </div>
                )}

                {/* Candidate Result Card */}
                {reforecastCandidate?.status === "READY" && reforecastCandidate.candidate && (
                  <div style={{ marginTop: "20px", border: "1.5px solid var(--color-primary-200)", borderRadius: "var(--radius-lg)", padding: "16px", background: "var(--color-surface)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <Badge tone="success">{language === "en" ? "CANDIDATE READY" : "KỊCH BẢN ĐÃ SẴN SÀNG"}</Badge>
                        <h3 style={{ margin: "4px 0 0" }}>{language === "en" ? "Scenario Preview Comparison" : "So sánh trước và sau điều chỉnh"}</h3>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <Button
                          variant="secondary"
                          onClick={handleSaveCandidate}
                          loading={savingCandidate}
                          disabled={!reforecastCandidate.inputHash}
                        >
                          <Icon name="check" size="small" /> {language === "en" ? "Save as New Version" : "Lưu thành phiên bản mới"}
                        </Button>
                        {savedCandidateVersion && (
                          <Button
                            variant="primary"
                            onClick={() => handleApplyCandidateVersion(savedCandidateVersion)}
                            loading={applyingCandidate}
                          >
                            <Icon name="compass" size="small" /> {language === "en" ? `Apply v${savedCandidateVersion.version}` : `Áp dụng bản v${savedCandidateVersion.version}`}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                      <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{language === "en" ? "BEFORE ADJUSTMENTS FUND" : "QUỸ TRƯỚC ĐIỀU CHỈNH"}</span>
                        <strong className="font-mono" style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>
                          {formatVND(Number(reforecastCandidate.beforeChanges?.summary.atRetirement.projectedFund || 0))}
                        </strong>
                      </div>
                      <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{language === "en" ? "AFTER ADJUSTMENTS FUND" : "QUỸ SAU ĐIỀU CHỈNH"}</span>
                        <strong className="font-mono" style={{ display: "block", fontSize: "16px", marginTop: "4px", color: "var(--color-primary-700)" }}>
                          {formatVND(Number(reforecastCandidate.candidate.calculation?.summary.atRetirement.projectedFund || 0))}
                        </strong>
                      </div>
                      <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{language === "en" ? "COVERAGE RATIO" : "TỶ LỆ BAO PHỦ MỚI"}</span>
                        <strong className="font-mono" style={{ display: "block", fontSize: "16px", marginTop: "4px" }}>
                          {reforecastCandidate.candidate.calculation?.summary.atRetirement.coveragePercent}%
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* SUBTAB 3: SOURCE COMMANDS V4 (FE-T16-SOURCE-V4)           */}
            {/* ========================================================= */}
            {reforecastSubTab === "sources-v4" && (
              <div>
                {/* 1. Gắn nguồn Lương hưu BHXH (FE-05) */}
                <div style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "16px", border: "1px solid var(--color-primary-200)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "13px", color: "var(--color-primary-800)" }}>
                      {language === "en" ? "Statutory Pension Source Selection (FE-05)" : "Gắn nguồn lương hưu từ kết quả BHXH đã lưu (FE-05)"}
                    </h4>
                    <Badge tone="soft">{language === "en" ? "FIXED NOMINAL" : "LƯƠNG HƯU DANH NGHĨA"}</Badge>
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {language === "en"
                      ? "Select an eligible saved pension estimate to incorporate into this reforecast plan version with cryptographic integrity verification."
                      : "Chọn kết quả ước tính hưu trí đủ điều kiện đã lưu để đưa vào phiên bản kế hoạch này với mã băm toàn vẹn (integrity hash)."}
                  </p>

                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Eligible Saved Estimates" : "Kết quả ước tính hợp lệ đã lưu"}
                      </label>
                      <select
                        className="input"
                        value={selectedEstimateId}
                        onChange={(e) => setSelectedEstimateId(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      >
                        {eligibleEstimates.length === 0 ? (
                          <option value="">{language === "en" ? "No eligible saved estimates found" : "Chưa có kết quả ước tính hưu trí hợp lệ đã lưu"}</option>
                        ) : (
                          eligibleEstimates.map((est) => (
                            <option key={est.id} value={est.id}>
                              {formatVND(Number(est.assessment.monthlyPension || 0))}/tháng (từ {est.assessment.startMonth || "N/A"}) • Lưu ngày {new Date(est.createdAt).toLocaleDateString()}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <Button
                      variant="secondary"
                      onClick={handleAddPensionSelection}
                      disabled={eligibleEstimates.length === 0}
                    >
                      <Icon name="plus" size="small" /> {language === "en" ? "Attach Pension to Plan" : "Gắn vào kế hoạch"}
                    </Button>
                  </div>

                  {pensionSelections.length > 0 && (
                    <div style={{ marginTop: "12px", padding: "10px", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Badge tone="success">PENSION ATTACHED</Badge>
                          <strong style={{ fontSize: "12px" }}>
                            {pensionSelections[0].operation} • {pensionSelections[0].effectiveFromMonth} → {pensionSelections[0].effectiveToMonth}
                          </strong>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }} className="font-mono">
                          Source ID: {pensionSelections[0].sourceId} • Estimate ID: {pensionSelections[0].estimateId.slice(0, 8)}...
                        </div>
                      </div>
                      <IconButton icon="trash" label="Bỏ gắn" onClick={handleRemovePensionSelection} />
                    </div>
                  )}
                </div>

                {/* 2. Quản lý lệnh nguồn danh nghĩa (V4) */}
                <div style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "var(--color-primary-800)" }}>
                    {language === "en" ? "Manage Nominal Source Commands (V4)" : "Quản lý lệnh nguồn danh nghĩa (V4)"}
                  </h4>
                  <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {language === "en"
                      ? "Create, revise, or end granular cash flow sources with explicit document verification."
                      : "Thêm mới (CREATE), cập nhật (REVISE) hoặc kết thúc (END) từng nguồn thu chi chi tiết có chứng từ rõ ràng."}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Operation" : "Thao tác"}
                      </label>
                      <select
                        className="input"
                        value={v4Operation}
                        onChange={(e) => setV4Operation(e.target.value as "CREATE" | "REVISE" | "END")}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      >
                        <option value="CREATE">CREATE (Tạo mới)</option>
                        <option value="REVISE">REVISE (Sửa đổi)</option>
                        <option value="END">END (Kết thúc)</option>
                      </select>
                    </div>

                    {v4Operation !== "CREATE" && (
                      <div style={{ gridColumn: "span 2" }}>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                          {language === "en" ? "Existing Source *" : "Nguồn hiện hữu trong danh mục *"}
                        </label>
                        <select
                          className="input"
                          value={selectedSourceId}
                          onChange={(e) => setSelectedSourceId(e.target.value)}
                          style={{ width: "100%", height: "34px", fontSize: "12px" }}
                        >
                          {activeSources.length === 0 ? (
                            <option value="">{language === "en" ? "No active sources found (run preview first)" : "Chưa có nguồn nào (vui lòng bấm xem trước)"}</option>
                          ) : (
                            activeSources.map((s) => (
                              <option key={s.sourceId} value={s.sourceId}>
                                [{s.kind}] {s.sourceId} (r{s.revision}, {s.effectiveFromMonth} → {s.effectiveToMonth})
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    )}

                    {v4Operation !== "END" && (
                      <>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Metric" : "Loại nguồn"}
                          </label>
                          <select
                            className="input"
                            value={v4Metric}
                            onChange={(e) => setV4Metric(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="income">{language === "en" ? "Income" : "Thu nhập"}</option>
                            <option value="livingExpense">{language === "en" ? "Living Expense" : "Chi sinh hoạt"}</option>
                            <option value="additionalExpense">{language === "en" ? "Additional Expense" : "Chi bổ sung"}</option>
                            <option value="pension">{language === "en" ? "Pension" : "Lương hưu"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Frequency" : "Tần suất"}
                          </label>
                          <select
                            className="input"
                            value={v4Frequency}
                            onChange={(e) => setV4Frequency(e.target.value as "MONTHLY" | "ONCE")}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="MONTHLY">{language === "en" ? "Monthly" : "Định kỳ tháng"}</option>
                            <option value="ONCE">{language === "en" ? "Once (One-off)" : "Một lần"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Amount (VND)" : "Số tiền (VND)"}
                          </label>
                          <input
                            type="number"
                            placeholder="VD: 10000000"
                            className="input"
                            value={v4Amount}
                            onChange={(e) => setV4Amount(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "From Month" : "Từ tháng"}
                      </label>
                      <input
                        type="month"
                        className="input"
                        value={v4FromMonth}
                        onChange={(e) => setV4FromMonth(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "To Month" : "Đến tháng"}
                      </label>
                      <input
                        type="month"
                        className="input"
                        value={v4ToMonth}
                        onChange={(e) => setV4ToMonth(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Document Verification Note *" : "Chứng từ xác nhận *"}
                      </label>
                      <input
                        type="text"
                        placeholder={language === "en" ? "E.g. Verified contract or salary amendment" : "VD: Hợp đồng lao động hoặc phụ lục nguồn thu"}
                        className="input"
                        value={v4Document}
                        onChange={(e) => setV4Document(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>
                    <Button variant="secondary" onClick={handleAddV4Command}>
                      <Icon name="plus" size="small" /> {language === "en" ? "Add Command" : "Thêm lệnh"}
                    </Button>
                  </div>
                </div>

                {sourceCommands.length > 0 && (
                  <div style={{ marginBottom: "16px", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Op" : "Thao tác"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Metric" : "Hạng mục"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Period" : "Khoảng thời gian"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Amount" : "Số tiền"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Document" : "Chứng từ"}</th>
                          <th style={{ padding: "6px 10px", width: "40px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceCommands.map((c) => (
                          <tr key={c.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "6px 10px" }}><Badge tone="soft">{c.operation}</Badge></td>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{c.metric}</td>
                            <td style={{ padding: "6px 10px" }} className="font-mono">{c.effectiveFromMonth} → {c.effectiveToMonth}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-primary-700)" }} className="font-mono">{formatVND(Number(c.amount || 0))}</td>
                            <td style={{ padding: "6px 10px", color: "var(--color-text-muted)" }}>{c.document}</td>
                            <td style={{ padding: "6px 10px" }}>
                              <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveV4Command(c.commandId)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. Quản lý điều chỉnh & tạo khoản vay V2 (FE-07) */}
                <div style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "16px", border: "1px solid var(--color-primary-200)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "13px", color: "var(--color-primary-800)" }}>
                        {language === "en" ? "Manage Loans & Debts V2 (FE-07)" : "Quản lý điều chỉnh & tạo khoản vay V2 (FE-07)"}
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {language === "en"
                          ? "Adjust loan terms, legacy opening basis, CAPPED liability, or register new loans."
                          : "Điều chỉnh nợ, xác nhận căn cứ mở đầu V1, trách nhiệm CAPPED hoặc tạo khoản vay mới."}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`button button-small ${loanTab === "revise" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setLoanTab("revise")}
                      >
                        {language === "en" ? "Revise Existing" : "Sửa khoản vay"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${loanTab === "create" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setLoanTab("create")}
                      >
                        {language === "en" ? "Create New" : "Tạo khoản vay"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${loanTab === "refinance" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setLoanTab("refinance")}
                      >
                        {language === "en" ? "Actual Refinance" : "Tái cấp vốn thực tế"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${loanTab === "plannedRefinance" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setLoanTab("plannedRefinance")}
                      >
                        {language === "en" ? "Planned Refinance" : "Tái cấp vốn dự kiến"}
                      </button>
                    </div>
                  </div>

                  {loanTab === "revise" ? (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Select Loan from Options *" : "Chọn khoản vay từ danh mục *"}
                          </label>
                          <select
                            className="input"
                            value={selectedLoanOptionSourceId}
                            onChange={(e) => setSelectedLoanOptionSourceId(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            {(v4Candidate?.loanRevisionOptions || []).length === 0 ? (
                              <option value="">{language === "en" ? "No loan options available (run preview first)" : "Chưa có danh mục khoản vay (vui lòng bấm xem trước)"}</option>
                            ) : (
                              (v4Candidate?.loanRevisionOptions || []).map((o) => (
                                <option key={o.sourceId} value={o.sourceId}>
                                  {o.sourceId} (r{o.sourceRevision}) {o.legacyOpeningRequired ? (language === "en" ? "• [Legacy V1 Opening Basis Required]" : "• [Cần căn cứ mở đầu V1]") : ""}
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Operation" : "Thao tác"}
                          </label>
                          <select
                            className="input"
                            value={lrOperation}
                            onChange={(e) => setLrOperation(e.target.value as "REVISE" | "END")}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="REVISE">{language === "en" ? "REVISE (Update Terms)" : "REVISE (Cập nhật điều khoản)"}</option>
                            <option value="END">{language === "en" ? "END (Close / Paid off)" : "END (Tất toán / Đóng)"}</option>
                          </select>
                        </div>

                        {lrOperation === "REVISE" && (
                          <>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Cutoff Balance (VND) *" : "Dư nợ gốc cuối kỳ đối soát (VND) *"}
                              </label>
                              <input
                                type="number"
                                placeholder="VD: 500000000"
                                className="input"
                                value={lrPrincipal}
                                onChange={(e) => setLrPrincipal(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Remaining Term (Months)" : "Thời hạn còn lại (tháng)"}
                              </label>
                              <input
                                type="number"
                                className="input"
                                value={lrMaturityMonths}
                                onChange={(e) => setLrMaturityMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Annual Rate (%/year)" : "Lãi suất (%/năm)"}
                              </label>
                              <input
                                type="text"
                                placeholder="8.5"
                                className="input"
                                value={lrRatePercent}
                                onChange={(e) => setLrRatePercent(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Amortization Mode" : "Phương thức trả nợ"}
                              </label>
                              <select
                                className="input"
                                value={lrMode}
                                onChange={(e) => setLrMode(e.target.value as any)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              >
                                <option value="REDUCE_PAYMENT_KEEP_TERM">{language === "en" ? "Keep Term (Reduce payment)" : "Giữ thời hạn (Giảm tiền góp)"}</option>
                                <option value="REDUCE_TERM_KEEP_PAYMENT">{language === "en" ? "Keep Payment (Reduce term)" : "Giữ mức góp (Rút ngắn hạn)"}</option>
                                <option value="BANK_SCHEDULE">{language === "en" ? "Bank Schedule" : "Lịch theo ngân hàng"}</option>
                                <option value="RESTRUCTURED">{language === "en" ? "Restructured" : "Cơ cấu lại nợ"}</option>
                              </select>
                            </div>

                            {lrMode === "REDUCE_TERM_KEEP_PAYMENT" && (
                              <div>
                                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                  {language === "en" ? "Fixed Payment (VND) *" : "Khoản trả cố định (VND) *"}
                                </label>
                                <input
                                  type="number"
                                  placeholder="VD: 15000000"
                                  className="input"
                                  value={lrFixedPayment}
                                  onChange={(e) => setLrFixedPayment(e.target.value)}
                                  style={{ width: "100%", height: "34px", fontSize: "12px" }}
                                />
                              </div>
                            )}

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Balance Scope" : "Phạm vi số dư"}
                              </label>
                              <select
                                className="input"
                                value={lrBalanceScope}
                                onChange={(e) => setLrBalanceScope(e.target.value as any)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              >
                                <option value="FULL_CONTRACT">{language === "en" ? "Full Contract" : "Toàn hợp đồng"}</option>
                                <option value="USER_SHARE">{language === "en" ? "User Share (100%)" : "Chỉ phần người dùng"}</option>
                              </select>
                            </div>

                            {lrBalanceScope === "FULL_CONTRACT" && (
                              <div>
                                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                  {language === "en" ? "Payment Share (0..1)" : "Tỷ lệ trả của bạn (0..1)"}
                                </label>
                                <input
                                  type="text"
                                  placeholder="1"
                                  className="input"
                                  value={lrPaymentShare}
                                  onChange={(e) => setLrPaymentShare(e.target.value)}
                                  style={{ width: "100%", height: "34px", fontSize: "12px" }}
                                />
                              </div>
                            )}

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Responsibility Kind" : "Trách nhiệm nghĩa vụ"}
                              </label>
                              <select
                                className="input"
                                value={lrResponsibilityKind}
                                onChange={(e) => setLrResponsibilityKind(e.target.value as any)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              >
                                <option value="ALLOCATED_SHARE">{language === "en" ? "Allocated Share" : "Theo tỷ lệ phân bổ"}</option>
                                <option value="CAPPED">{language === "en" ? "Capped (Limited liability)" : "Có trần giới hạn (CAPPED)"}</option>
                              </select>
                            </div>

                            {lrResponsibilityKind === "CAPPED" && (
                              <>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                    {language === "en" ? "Cap Limit (VND) *" : "Mức trần nghĩa vụ (VND) *"}
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="VD: 500000000"
                                    className="input"
                                    value={lrCapLimit}
                                    onChange={(e) => setLrCapLimit(e.target.value)}
                                    style={{ width: "100%", height: "34px", fontSize: "12px" }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                    {language === "en" ? "Previously Paid (VND)" : "Số đã trả theo trần (VND)"}
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="0"
                                    className="input"
                                    value={lrCapPreviouslyPaid}
                                    onChange={(e) => setLrCapPreviouslyPaid(e.target.value)}
                                    style={{ width: "100%", height: "34px", fontSize: "12px" }}
                                  />
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {/* Legacy Opening Basis fields if required */}
                      {Boolean((v4Candidate?.loanRevisionOptions || []).find(o => o.sourceId === selectedLoanOptionSourceId)?.legacyOpeningRequired) && (
                        <div style={{ marginTop: "12px", padding: "12px", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--color-warning-border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                            <Badge tone="warning">{language === "en" ? "LEGACY V1 OPENING BASIS REQUIRED" : "BẮT BUỘC KHAI BÁO CĂN CỨ MỞ ĐẦU V1"}</Badge>
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                              {language === "en" ? "Khoản vay kế thừa từ hồ sơ V1 cần xác nhận số dư ban đầu." : "Khoản vay kế thừa từ hồ sơ V1 cần xác nhận số dư ban đầu theo chứng từ."}
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Signed Date" : "Ngày ký hợp đồng"}
                              </label>
                              <input
                                type="date"
                                className="input"
                                value={lrLegacySignedOn}
                                onChange={(e) => setLrLegacySignedOn(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Effective Date" : "Ngày hiệu lực"}
                              </label>
                              <input
                                type="date"
                                className="input"
                                value={lrLegacyEffectiveOn}
                                onChange={(e) => setLrLegacyEffectiveOn(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Previously Paid (VND)" : "Đã thanh toán trước đó (VND)"}
                              </label>
                              <input
                                type="number"
                                className="input"
                                value={lrLegacyPreviouslyPaid}
                                onChange={(e) => setLrLegacyPreviouslyPaid(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Legacy Opening Evidence" : "Chứng từ căn cứ mở đầu"}
                              </label>
                              <input
                                type="text"
                                placeholder={language === "en" ? "Bank statement reference" : "Số sao kê ngân hàng xác nhận"}
                                className="input"
                                value={lrLegacyDoc}
                                onChange={(e) => setLrLegacyDoc(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Loan Revision Document / Verification Note *" : "Chứng từ sửa đổi hợp đồng vay *"}
                          </label>
                          <input
                            type="text"
                            placeholder={language === "en" ? "E.g. Bank loan statement or repayment receipt" : "VD: Sao kê số dư nợ ngân hàng hoặc biên nhận thanh toán"}
                            className="input"
                            value={lrDocument}
                            onChange={(e) => setLrDocument(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>
                        <Button variant="secondary" onClick={handleAddLoanRevision}>
                          <Icon name="plus" size="small" /> {language === "en" ? "Add Loan Revision" : "Thêm lệnh sửa khoản vay"}
                        </Button>
                      </div>
                    </div>
                  ) : loanTab === "create" ? (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Agreement Reference *" : "Mã hợp đồng vay duy nhất *"}
                          </label>
                          <input
                            type="text"
                            placeholder="VD: HDBANK-2026-09"
                            className="input"
                            value={lcAgreementRef}
                            onChange={(e) => setLcAgreementRef(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Funding Kind" : "Cơ sở nguồn vốn"}
                          </label>
                          <select
                            className="input"
                            value={lcFundingKind}
                            onChange={(e) => setLcFundingKind(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="PLANNED_DISBURSEMENT">{language === "en" ? "PLANNED (Future Disbursement)" : "Dự kiến giải ngân sau cutoff"}</option>
                            <option value="EXISTING_BALANCE">{language === "en" ? "EXISTING (Confirmed Balance)" : "Khoản vay hiện hữu chốt cuối kỳ"}</option>
                            <option value="DISBURSED_BALANCE">{language === "en" ? "DISBURSED (Paid Down Principal)" : "Đã giải ngân và trả bớt gốc"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Principal Amount (VND) *" : "Số tiền gốc vay (VND) *"}
                          </label>
                          <input
                            type="number"
                            placeholder="VD: 200000000"
                            className="input"
                            value={lcPrincipal}
                            onChange={(e) => setLcPrincipal(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Loan Term (Months)" : "Thời hạn vay (tháng)"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={lcMaturityMonths}
                            onChange={(e) => setLcMaturityMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Annual Rate (%/year)" : "Lãi suất (%/năm)"}
                          </label>
                          <input
                            type="text"
                            placeholder="8.5"
                            className="input"
                            value={lcRatePercent}
                            onChange={(e) => setLcRatePercent(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Amortization Mode" : "Phương thức trả nợ"}
                          </label>
                          <select
                            className="input"
                            value={lcMode}
                            onChange={(e) => setLcMode(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="REDUCE_PAYMENT_KEEP_TERM">{language === "en" ? "Keep Term (Reduce payment)" : "Giữ thời hạn (Giảm tiền góp)"}</option>
                            <option value="REDUCE_TERM_KEEP_PAYMENT">{language === "en" ? "Keep Payment (Reduce term)" : "Giữ mức góp (Rút ngắn hạn)"}</option>
                            <option value="BANK_SCHEDULE">{language === "en" ? "Bank Schedule" : "Lịch theo ngân hàng"}</option>
                          </select>
                        </div>

                        {lcFundingKind === "PLANNED_DISBURSEMENT" && (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Withheld Fees (VND)" : "Phí giữ lại khi giải ngân (VND)"}
                            </label>
                            <input
                              type="number"
                              placeholder="0"
                              className="input"
                              value={lcWithheldFees}
                              onChange={(e) => setLcWithheldFees(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            />
                          </div>
                        )}

                        {lcFundingKind === "DISBURSED_BALANCE" && (
                          <>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Disbursed Date" : "Ngày giải ngân"}
                              </label>
                              <input
                                type="date"
                                className="input"
                                value={lcDisbursedOn}
                                onChange={(e) => setLcDisbursedOn(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Opening User Paid (VND)" : "Số đã trả tại giải ngân (VND)"}
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                className="input"
                                value={lcOpeningUserPaid}
                                onChange={(e) => setLcOpeningUserPaid(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Document Verification Note *" : "Chứng từ hợp đồng vay mới *"}
                          </label>
                          <input
                            type="text"
                            placeholder={language === "en" ? "E.g. Bank credit contract or disbursement confirmation" : "VD: Hợp đồng tín dụng ngân hàng hoặc thông báo giải ngân"}
                            className="input"
                            value={lcDocRef}
                            onChange={(e) => setLcDocRef(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>
                        <Button variant="secondary" onClick={handleAddLoanCreation}>
                          <Icon name="plus" size="small" /> {language === "en" ? "Create Loan" : "Tạo khoản vay mới"}
                        </Button>
                      </div>
                    </div>
                  ) : loanTab === "refinance" ? (
                    <div>
                      {/* Actual Refinance Form */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Closing Existing Loan *" : "Khoản vay hiện hữu cần tất toán (END) *"}
                          </label>
                          <select
                            className="input"
                            value={refiClosingSourceId}
                            onChange={(e) => setRefiClosingSourceId(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="">{language === "en" ? "-- Select loan to pay off --" : "-- Chọn khoản vay cần tất toán --"}</option>
                            {(v4Candidate?.loanRevisionOptions || []).map((o) => (
                              <option key={o.sourceId} value={o.sourceId}>
                                {o.sourceId} (r{o.sourceRevision})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "New Loan Agreement Ref *" : "Mã hợp đồng khoản vay mới *"}
                          </label>
                          <input
                            type="text"
                            placeholder="VD: REFI-NEW-2026"
                            className="input"
                            value={refiNewAgreementRef}
                            onChange={(e) => setRefiNewAgreementRef(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Gross Disbursement (VND) *" : "Tổng tiền giải ngân mới (VND) *"}
                          </label>
                          <input
                            type="number"
                            placeholder="500000000"
                            className="input"
                            value={refiGrossDisbursement}
                            onChange={(e) => setRefiGrossDisbursement(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Withheld Fees (VND)" : "Phí giữ lại khi giải ngân (VND)"}
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            className="input"
                            value={refiWithheldFees}
                            onChange={(e) => setRefiWithheldFees(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "External Top-Up (VND)" : "Tiền tự bù thêm (VND)"}
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            className="input"
                            value={refiExternalTopUp}
                            onChange={(e) => setRefiExternalTopUp(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Unused Proceeds (VND)" : "Tiền giải ngân còn dư (VND)"}
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            className="input"
                            value={refiUnusedProceeds}
                            onChange={(e) => setRefiUnusedProceeds(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Settlement Date" : "Ngày tất toán"}
                          </label>
                          <input
                            type="date"
                            className="input"
                            value={refiSettledOn}
                            onChange={(e) => setRefiSettledOn(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Funding Scope" : "Phạm vi nguồn vốn"}
                          </label>
                          <select
                            className="input"
                            value={refiFundingScope}
                            onChange={(e) => setRefiFundingScope(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="USER_SHARE">{language === "en" ? "User Share (Phần người dùng)" : "Chỉ phần người dùng"}</option>
                            <option value="FULL_CONTRACT">{language === "en" ? "Full Contract (Toàn hợp đồng)" : "Toàn hợp đồng"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Annual Rate (%/year)" : "Lãi suất (%/năm)"}
                          </label>
                          <input
                            type="text"
                            placeholder="8.0"
                            className="input"
                            value={refiRatePercent}
                            onChange={(e) => setRefiRatePercent(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Maturity (Months)" : "Kỳ hạn vay (tháng)"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={refiMaturityMonths}
                            onChange={(e) => setRefiMaturityMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: "12px", padding: "10px", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={refiHasProceedsEarly}
                            onChange={(e) => setRefiHasProceedsEarly(e.target.checked)}
                          />
                          <span style={{ fontWeight: 600 }}>
                            {language === "en" ? "Disbursed before settlement day (Proceeds at Settlement)" : "Giải ngân trước ngày tất toán (Khai báo tiền khả dụng lúc tất toán)"}
                          </span>
                        </label>

                        {refiHasProceedsEarly && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginTop: "10px" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Disbursed Date" : "Ngày giải ngân"}
                              </label>
                              <input
                                type="date"
                                className="input"
                                value={refiDisbursedOn}
                                onChange={(e) => setRefiDisbursedOn(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Available Amount at Settlement (VND) *" : "Tiền còn sẵn có lúc tất toán (VND) *"}
                              </label>
                              <input
                                type="number"
                                placeholder="495000000"
                                className="input"
                                value={refiAvailableAmount}
                                onChange={(e) => setRefiAvailableAmount(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Used Before Settlement (VND)" : "Tiền đã sử dụng trước tất toán (VND)"}
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                className="input"
                                value={refiUsedAmount}
                                onChange={(e) => setRefiUsedAmount(e.target.value)}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                        <Button variant="secondary" onClick={handleAddRefinance}>
                          <Icon name="plus" size="small" /> {language === "en" ? "Add Refinance Batch" : "Thêm lệnh tái cấp vốn"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Planned Refinance Form */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Pair Operation" : "Thao tác cặp dự kiến"}
                          </label>
                          <select
                            className="input"
                            value={prOperation}
                            onChange={(e) => setPrOperation(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="CREATE">{language === "en" ? "CREATE (New Pair)" : "CREATE (Lập cặp mới)"}</option>
                            <option value="REVISE">{language === "en" ? "REVISE (Update Active Pair)" : "REVISE (Sửa cặp đang hoạt động)"}</option>
                            <option value="CANCEL">{language === "en" ? "CANCEL (Cancel Pair)" : "CANCEL (Hủy cặp dự kiến)"}</option>
                          </select>
                        </div>

                        {prOperation === "CREATE" ? (
                          <div style={{ gridColumn: "span 2" }}>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Select Eligible Loan *" : "Chọn khoản vay đủ điều kiện *"}
                            </label>
                            <select
                              className="input"
                              value={prSelectedEligibleSourceId}
                              onChange={(e) => setPrSelectedEligibleSourceId(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            >
                              <option value="">{language === "en" ? "-- Select eligible loan --" : "-- Chọn khoản vay từ danh mục đủ điều kiện --"}</option>
                              {(v4Candidate?.plannedRefinanceOptions?.eligibleLoans || []).map((l) => (
                                <option key={l.sourceId} value={l.sourceId}>
                                  {l.sourceId} (r{l.sourceRevision}) • Dư nợ: {formatVND(Number(l.principalBalance || 0))}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div style={{ gridColumn: "span 2" }}>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Select Active Pair *" : "Chọn cặp đang hoạt động *"}
                            </label>
                            <select
                              className="input"
                              value={prSelectedActivePairId}
                              onChange={(e) => setPrSelectedActivePairId(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            >
                              <option value="">{language === "en" ? "-- Select active pair --" : "-- Chọn cặp đang hoạt động --"}</option>
                              {(v4Candidate?.plannedRefinanceOptions?.activePairs || []).map((p) => (
                                <option key={p.pairId} value={p.pairId}>
                                  {p.pairId.slice(0, 8)}... ({p.oldSource.sourceId} ➔ {p.newSource.sourceId}) • {p.settledOn} {p.reviseAllowed ? "" : "[Khóa sửa]"}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {prOperation !== "CANCEL" ? (
                          <>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Settled On Date *" : "Ngày tất toán dự kiến *"}
                              </label>
                              <input
                                type="date"
                                className="input"
                                value={prSettledOn}
                                onChange={(e) => setPrSettledOn(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Same Day Payment Order" : "Thứ tự trả nợ cùng ngày"}
                              </label>
                              <select
                                className="input"
                                value={prSameDayOrder}
                                onChange={(e) => setPrSameDayOrder(e.target.value as any)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              >
                                <option value="AFTER_SCHEDULED_PAYMENT">{language === "en" ? "After Scheduled Payment" : "Sau kỳ trả cùng ngày"}</option>
                                <option value="BEFORE_SCHEDULED_PAYMENT">{language === "en" ? "Before Scheduled Payment" : "Trước kỳ trả cùng ngày"}</option>
                              </select>
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Payoff Principal Quote (VND) *" : "Báo giá dư gốc tất toán (VND) *"}
                              </label>
                              <input
                                type="number"
                                placeholder="300000000"
                                className="input"
                                value={prQuotePrincipal}
                                onChange={(e) => setPrQuotePrincipal(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Payoff Interest Quote (VND)" : "Báo giá lãi tất toán (VND)"}
                              </label>
                              <input
                                type="number"
                                placeholder="5000000"
                                className="input"
                                value={prQuoteInterest}
                                onChange={(e) => setPrQuoteInterest(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Prepayment Fee (VND)" : "Phí trả nợ trước hạn (VND)"}
                              </label>
                              <input
                                type="number"
                                placeholder="1000000"
                                className="input"
                                value={prQuotePrepaymentFee}
                                onChange={(e) => setPrQuotePrepaymentFee(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "New Loan Principal (VND) *" : "Dư nợ khoản vay mới (VND) *"}
                              </label>
                              <input
                                type="number"
                                placeholder="300000000"
                                className="input"
                                value={prNewGross}
                                onChange={(e) => setPrNewGross(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "User Top-Up Amount (VND)" : "Tiền người dùng tự bù (VND)"}
                              </label>
                              <input
                                type="number"
                                placeholder="6000000"
                                className="input"
                                value={prUserTopUp}
                                onChange={(e) => setPrUserTopUp(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "New Loan Rate (%/year)" : "Lãi suất vay mới (%/năm)"}
                              </label>
                              <input
                                type="text"
                                placeholder="7.5"
                                className="input"
                                value={prNewRatePercent}
                                onChange={(e) => setPrNewRatePercent(e.target.value)}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "New Loan Months" : "Thời hạn vay mới (tháng)"}
                              </label>
                              <input
                                type="number"
                                className="input"
                                value={prNewMonths}
                                onChange={(e) => setPrNewMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>
                          </>
                        ) : (
                          <div style={{ gridColumn: "span 2" }}>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Cancellation Reason *" : "Lý do hủy phương án dự kiến *"}
                            </label>
                            <input
                              type="text"
                              placeholder="VD: Đổi kế hoạch tài chính hoặc hủy vay"
                              className="input"
                              value={prCancelReason}
                              onChange={(e) => setPrCancelReason(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            />
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                        <Button variant="secondary" onClick={handleAddPlannedRefinance}>
                          <Icon name="plus" size="small" /> {language === "en" ? "Add Planned Command" : "Thêm lệnh cặp dự kiến"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Bảng danh sách các lệnh khoản vay đã thêm */}
                  {(loanRevisions.length > 0 || loanCreations.length > 0) && (
                    <div style={{ marginTop: "16px", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Type" : "Loại lệnh"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Reference / Source ID" : "Mã nguồn / Hợp đồng"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Mode" : "Chế độ"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Principal Balance" : "Dư nợ gốc"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Maturity" : "Đáo hạn"}</th>
                            <th style={{ padding: "6px 10px", width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {loanRevisions.map((lr) => (
                            <tr key={lr.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 10px" }}><Badge tone={lr.operation === "END" ? "danger" : "soft"}>{lr.operation}</Badge></td>
                              <td style={{ padding: "6px 10px", fontWeight: 600 }} className="font-mono">{lr.sourceId}</td>
                              <td style={{ padding: "6px 10px" }}>{lr.contract.mode}</td>
                              <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-danger-700)" }} className="font-mono">
                                {formatVND(Number(lr.contract.principalBalance || 0))}
                              </td>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{lr.contract.maturityDate}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveLoanRevision(lr.sourceId)} />
                              </td>
                            </tr>
                          ))}
                          {loanCreations.map((lc) => (
                            <tr key={lc.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 10px" }}><Badge tone="success">CREATE ({lc.funding.kind})</Badge></td>
                              <td style={{ padding: "6px 10px", fontWeight: 600 }}>{lc.agreementReference}</td>
                              <td style={{ padding: "6px 10px" }}>{lc.contract.mode}</td>
                              <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-danger-700)" }} className="font-mono">
                                {formatVND(Number(lc.contract.principalBalance || 0))}
                              </td>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{lc.contract.maturityDate}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveLoanCreation(lc.commandId)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Bảng danh sách các lệnh Tái cấp vốn thực tế */}
                  {refinances.length > 0 && (
                    <div style={{ marginTop: "16px", overflowX: "auto" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-primary-800)", marginBottom: "6px" }}>
                        {language === "en" ? "Actual Refinance Batches" : "Các gói tái cấp vốn thực tế"}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Settled On" : "Ngày tất toán"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Gross Disbursement" : "Giải ngân mới"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Top-Up" : "Tiền tự bù"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Unused" : "Tiền dư"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Early Disbursed" : "Giải ngân sớm"}</th>
                            <th style={{ padding: "6px 10px", width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {refinances.map((rf) => (
                            <tr key={rf.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{rf.settledOn}</td>
                              <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-primary-700)" }} className="font-mono">{formatVND(Number(rf.grossDisbursement || 0))}</td>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{formatVND(Number(rf.externalTopUp || 0))}</td>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{formatVND(Number(rf.unusedProceeds || 0))}</td>
                              <td style={{ padding: "6px 10px" }}>
                                {rf.proceedsAtSettlement ? <Badge tone="info">PROCEEDS</Badge> : <Badge tone="neutral">SAME_DAY</Badge>}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveRefinance(rf.commandId)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Bảng danh sách các cặp Tái cấp vốn dự kiến */}
                  {plannedRefinances.length > 0 && (
                    <div style={{ marginTop: "16px", overflowX: "auto" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-primary-800)", marginBottom: "6px" }}>
                        {language === "en" ? "Planned Refinance Pairs" : "Các cặp tái cấp vốn dự kiến"}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Op" : "Thao tác"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Old Source" : "Khoản vay cũ"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Settled On" : "Ngày dự kiến"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Quote / Reason" : "Báo giá / Lý do"}</th>
                            <th style={{ padding: "6px 10px", width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {plannedRefinances.map((pr) => (
                            <tr key={pr.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 10px" }}><Badge tone={pr.operation === "CANCEL" ? "danger" : pr.operation === "REVISE" ? "warning" : "info"}>{pr.operation}</Badge></td>
                              <td style={{ padding: "6px 10px", fontWeight: 600 }} className="font-mono">{pr.oldSource.sourceId}</td>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{pr.operation === "CANCEL" ? "N/A" : pr.terms.settledOn}</td>
                              <td style={{ padding: "6px 10px" }}>
                                {pr.operation === "CANCEL" ? (
                                  <span style={{ color: "var(--color-danger-700)" }}>{pr.reason}</span>
                                ) : (
                                  <span className="font-mono">{formatVND(Number(pr.terms.payoffQuote.principal || 0))}</span>
                                )}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <IconButton icon="trash" label="Xóa" onClick={() => handleRemovePlannedRefinance(pr.pairId)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 4. Quản lý tài sản và vốn một lần V4 (FE-09 & FE-10) */}
                <div style={{ marginTop: "20px", padding: "16px", background: "var(--color-surface-subtle)", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-text-main)" }}>
                        {language === "en" ? "4. Asset & Capital Management V4 (FE-09 & FE-10)" : "4. Quản lý tài sản và vốn một lần V4 (FE-09 & FE-10)"}
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {language === "en"
                          ? "Asset sale, liquid capital, single or staged contribution, rental-to-sale transition."
                          : "Bán tài sản, vốn thanh khoản, góp một lần hoặc nhiều đợt (STAGED), chuyển thuê sang bán (rentalExit)."}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`button button-small ${assetTab === "create" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setAssetTab("create")}
                      >
                        {language === "en" ? "Create Asset" : "Tạo nguồn tài sản"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${assetTab === "revise" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setAssetTab("revise")}
                      >
                        {language === "en" ? "Revise Asset" : "Sửa nguồn tài sản"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${assetTab === "end" ? "button-primary" : "button-ghost"}`}
                        onClick={() => setAssetTab("end")}
                      >
                        {language === "en" ? "Terminate Asset" : "Dừng nguồn tài sản"}
                      </button>
                    </div>
                  </div>

                  {assetTab === "end" ? (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Select Asset to Terminate *" : "Chọn tài sản cần dừng *"}
                          </label>
                          <select
                            className="input"
                            value={selectedAssetOptionSourceId}
                            onChange={(e) => setSelectedAssetOptionSourceId(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            {(v4Candidate?.assetRevisionOptions || []).map((opt) => (
                              <option key={opt.sourceId} value={opt.sourceId}>
                                {opt.sourceId} (rev {opt.sourceRevision})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Termination Reason *" : "Lý do dừng nguồn *"}
                          </label>
                          <input
                            type="text"
                            className="input"
                            value={assetEndReason}
                            onChange={(e) => setAssetEndReason(e.target.value)}
                            placeholder={language === "en" ? "Reason for termination" : "Lý do hủy nguồn vốn tương lai"}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                        <Button variant="danger" size="small" onClick={handleAddAssetCommand}>
                          <Icon name="trash" size="small" /> {language === "en" ? "Add End Command" : "Thêm lệnh dừng nguồn"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        {assetTab === "revise" ? (
                          <div style={{ gridColumn: "span 2" }}>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Select Asset from Options *" : "Chọn tài sản từ danh mục *"}
                            </label>
                            <select
                              className="input"
                              value={selectedAssetOptionSourceId}
                              onChange={(e) => setSelectedAssetOptionSourceId(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            >
                              {(v4Candidate?.assetRevisionOptions || []).map((opt) => (
                                <option key={opt.sourceId} value={opt.sourceId}>
                                  {opt.sourceId} (rev {opt.sourceRevision})
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Asset Reference *" : "Mã định danh tài sản *"}
                            </label>
                            <input
                              type="text"
                              className="input"
                              value={assetRef}
                              onChange={(e) => setAssetRef(e.target.value)}
                              placeholder="Vd: Bds-Nha-Pho-01"
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            />
                          </div>
                        )}

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Asset Kind" : "Loại tài sản"}
                          </label>
                          <select
                            className="input"
                            value={assetKind}
                            onChange={(e) => setAssetKind(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="ASSET_SALE">{language === "en" ? "Asset Sale" : "Bán tài sản (ASSET_SALE)"}</option>
                            <option value="LIQUID_CAPITAL">{language === "en" ? "Liquid Capital" : "Vốn thanh khoản (LIQUID_CAPITAL)"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Amount Scope" : "Phạm vi số tiền"}
                          </label>
                          <select
                            className="input"
                            value={assetAmountScope}
                            onChange={(e) => setAssetAmountScope(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="WHOLE_ASSET">{language === "en" ? "Whole Asset" : "Toàn bộ tài sản (WHOLE_ASSET)"}</option>
                            <option value="USER_SHARE">{language === "en" ? "User Share Only" : "Phần của người dùng (USER_SHARE)"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Gross Proceeds (VND)" : "Tổng tiền thu được (gross)"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={assetGrossAmount}
                            onChange={(e) => setAssetGrossAmount(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Fees (VND)" : "Phí chuyển nhượng"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={assetFees}
                            onChange={(e) => setAssetFees(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Taxes (VND)" : "Thuế phải nộp"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={assetTaxes}
                            onChange={(e) => setAssetTaxes(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Secured Debt Settlement" : "Tất toán nợ bảo đảm"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={assetSecuredDebt}
                            onChange={(e) => setAssetSecuredDebt(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        {assetAmountScope === "WHOLE_ASSET" && (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Ownership Share (0 - 1)" : "Tỷ lệ sở hữu (0 - 1)"}
                            </label>
                            <input
                              type="text"
                              className="input"
                              value={assetOwnershipShare}
                              onChange={(e) => setAssetOwnershipShare(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            />
                          </div>
                        )}

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Retirement Share (0 - 1)" : "Tỷ lệ dành cho hưu trí (0 - 1)"}
                          </label>
                          <input
                            type="text"
                            className="input"
                            value={assetRetirementShare}
                            onChange={(e) => setAssetRetirementShare(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Available On" : "Ngày tiền sẵn có"}
                          </label>
                          <input
                            type="date"
                            className="input"
                            value={assetAvailableOn}
                            onChange={(e) => setAssetAvailableOn(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Confirmed Contribution (VND)" : "Số tiền xác nhận góp vào quỹ"}
                          </label>
                          <input
                            type="number"
                            className="input"
                            value={assetConfirmedContribution}
                            onChange={(e) => setAssetConfirmedContribution(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Funding Status" : "Hình thức góp vốn"}
                          </label>
                          <select
                            className="input"
                            value={assetFundingStatus}
                            onChange={(e) => setAssetFundingStatus(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option value="PLANNED">{language === "en" ? "Planned (Future month)" : "Dự kiến góp (PLANNED)"}</option>
                            <option value="REALIZED">{language === "en" ? "Realized (Past cutoff)" : "Đã góp vào quỹ (REALIZED)"}</option>
                            <option value="STAGED">{language === "en" ? "Staged (Multi-installment)" : "Nhiều đợt (STAGED)"}</option>
                          </select>
                        </div>

                        {assetFundingStatus === "PLANNED" && (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Contribution Month" : "Tháng góp (sau cutoff)"}
                            </label>
                            <input
                              type="month"
                              className="input"
                              value={assetContributionMonth}
                              onChange={(e) => setAssetContributionMonth(e.target.value)}
                              style={{ width: "100%", height: "34px", fontSize: "12px" }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Calculated Equation Box */}
                      {(() => {
                        const netVal = Decimal.max("0", new Decimal(assetGrossAmount || "0").minus(assetFees || "0").minus(assetTaxes || "0").minus(assetSecuredDebt || "0")).toString();
                        const limitVal = (assetAmountScope === "WHOLE_ASSET"
                          ? new Decimal(netVal).mul(assetOwnershipShare || "1")
                          : new Decimal(netVal)).mul(assetRetirementShare || "1").toString();
                        return (
                          <div style={{ marginTop: "12px", padding: "10px", background: "var(--color-surface)", borderRadius: "6px", border: "1px solid var(--color-border)", fontSize: "11px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                              <span>{language === "en" ? "Net proceeds: " : "Tiền ròng sau khấu trừ: "} <strong>{formatVND(Number(netVal))}</strong></span>
                              <span>{language === "en" ? "Max contribution limit: " : "Hạn mức góp tối đa: "} <strong style={{ color: "var(--color-primary-600)" }}>{formatVND(Number(limitVal))}</strong></span>
                              <span>{language === "en" ? "Chosen contribution: " : "Số dự định góp: "} <strong>{formatVND(Number(assetConfirmedContribution || 0))}</strong></span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Staged Installments and Releases Planner (FE-10) */}
                      {assetFundingStatus === "STAGED" && (
                        <div style={{ marginTop: "14px", padding: "12px", background: "var(--color-surface)", borderRadius: "6px", border: "1px dashed var(--color-border)" }}>
                          <h5 style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600 }}>
                            {language === "en" ? "Staged Funding Planner (FE-10)" : "Kế hoạch góp nhiều đợt và giải ngân ngoài quỹ (FE-10)"}
                          </h5>

                          {/* Planned Contributions */}
                          <div style={{ marginBottom: "12px" }}>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Add Planned Contribution (Month & Amount)" : "Thêm đợt góp dự kiến (Tháng & Số tiền)"}
                            </label>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                type="month"
                                className="input"
                                value={stagedInstallmentMonth}
                                onChange={(e) => setStagedInstallmentMonth(e.target.value)}
                                style={{ width: "140px", height: "30px", fontSize: "11px" }}
                              />
                              <input
                                type="number"
                                className="input"
                                value={stagedInstallmentAmount}
                                onChange={(e) => setStagedInstallmentAmount(e.target.value)}
                                placeholder="Số tiền (VND)"
                                style={{ width: "160px", height: "30px", fontSize: "11px" }}
                              />
                              <Button variant="ghost" size="small" onClick={handleAddStagedInstallment}>
                                <Icon name="plus" size="small" /> {language === "en" ? "Add Installment" : "Thêm đợt góp"}
                              </Button>
                            </div>
                            {stagedPlannedContributions.length > 0 && (
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                                {stagedPlannedContributions.map((inst) => (
                                  <Badge key={inst.installmentId} tone="info">
                                    {inst.month}: {formatVND(Number(inst.amount))}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStagedInstallment(inst.installmentId)}
                                      style={{ marginLeft: "4px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                                    >
                                      ×
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Outside Fund Releases */}
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                              {language === "en" ? "Add Cash Availability Release (Outside Fund)" : "Đợt tiền sẵn có ngoài quỹ (availability.releases)"}
                            </label>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                type="date"
                                className="input"
                                value={stagedReleaseDate}
                                onChange={(e) => setStagedReleaseDate(e.target.value)}
                                style={{ width: "150px", height: "30px", fontSize: "11px" }}
                              />
                              <input
                                type="number"
                                className="input"
                                value={stagedReleaseAmount}
                                onChange={(e) => setStagedReleaseAmount(e.target.value)}
                                placeholder="Số tiền (VND)"
                                style={{ width: "160px", height: "30px", fontSize: "11px" }}
                              />
                              <select
                                className="input"
                                value={stagedReleaseStatus}
                                onChange={(e) => setStagedReleaseStatus(e.target.value as any)}
                                style={{ width: "140px", height: "30px", fontSize: "11px" }}
                              >
                                <option value="CONFIRMED">CONFIRMED (Đã có)</option>
                                <option value="EXPECTED">EXPECTED (Dự kiến)</option>
                              </select>
                              <Button variant="ghost" size="small" onClick={handleAddStagedRelease}>
                                <Icon name="plus" size="small" /> {language === "en" ? "Add Release" : "Thêm đợt giải ngân"}
                              </Button>
                            </div>
                            {stagedReleases.length > 0 && (
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                                {stagedReleases.map((rel) => (
                                  <Badge key={rel.releaseId} tone={rel.status === "CONFIRMED" ? "success" : "warning"}>
                                    {rel.availableOn} ({rel.status}): {formatVND(Number(rel.amount))}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStagedRelease(rel.releaseId)}
                                      style={{ marginLeft: "4px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                                    >
                                      ×
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Rental Exit Form (FE-09) */}
                      {assetTab === "revise" && (
                        <div style={{ marginTop: "12px", padding: "10px", background: "var(--color-surface)", borderRadius: "6px", border: "1px solid var(--color-border)" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={assetHasRentalExit}
                              onChange={(e) => setAssetHasRentalExit(e.target.checked)}
                            />
                            {language === "en"
                              ? "Transition from Rental to Sale (rentalExit)"
                              : "Chuyển từ tài sản đang cho thuê sang bán (rentalExit)"}
                          </label>
                          {assetHasRentalExit && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginTop: "8px" }}>
                              <div>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }}>
                                  {language === "en" ? "Rent Ends On *" : "Ngày kết thúc thuê *"}
                                </label>
                                <input
                                  type="date"
                                  className="input"
                                  value={assetRentEndsOn}
                                  onChange={(e) => setAssetRentEndsOn(e.target.value)}
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }}>
                                  {language === "en" ? "Final Month Net Rent (SOURCE_SHARE) *" : "Thu nhập thuê tháng cuối (phần nguồn) *"}
                                </label>
                                <input
                                  type="number"
                                  className="input"
                                  value={assetFinalMonthIncome}
                                  onChange={(e) => setAssetFinalMonthIncome(e.target.value)}
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Missed Contribution Form (FE-09) */}
                      {assetTab === "revise" && (
                        <div style={{ marginTop: "8px", padding: "10px", background: "var(--color-surface)", borderRadius: "6px", border: "1px solid var(--color-border)" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={assetHasMissedContribution}
                              onChange={(e) => setAssetHasMissedContribution(e.target.checked)}
                            />
                            {language === "en"
                              ? "Reconcile Delayed/Missed Past Planned Contribution"
                              : "Khai báo hoãn khoản góp dự kiến quá hạn (missedContribution)"}
                          </label>
                          {assetHasMissedContribution && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginTop: "8px" }}>
                              <div>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }}>
                                  {language === "en" ? "Scheduled Month *" : "Tháng đã lỡ hẹn *"}
                                </label>
                                <input
                                  type="month"
                                  className="input"
                                  value={assetMissedScheduledMonth}
                                  onChange={(e) => setAssetMissedScheduledMonth(e.target.value)}
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }}>
                                  {language === "en" ? "Amount Not Contributed *" : "Số tiền chưa góp *"}
                                </label>
                                <input
                                  type="number"
                                  className="input"
                                  value={assetMissedAmount}
                                  onChange={(e) => setAssetMissedAmount(e.target.value)}
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }}>
                                  {language === "en" ? "Reason *" : "Lý do chưa góp *"}
                                </label>
                                <input
                                  type="text"
                                  className="input"
                                  value={assetMissedReason}
                                  onChange={(e) => setAssetMissedReason(e.target.value)}
                                  placeholder="Vd: Giao dịch bán hoãn do chờ thủ tục"
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                        <Button variant="primary" size="small" onClick={handleAddAssetCommand}>
                          <Icon name="plus" size="small" /> {assetTab === "create" ? (language === "en" ? "Add Asset Creation" : "Thêm lệnh tạo tài sản") : (language === "en" ? "Add Asset Revision" : "Thêm lệnh sửa tài sản")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Summary Table of Asset Commands */}
                  {assetCommands.length > 0 && (
                    <div style={{ marginTop: "16px", borderTop: "1px solid var(--color-border)", paddingTop: "12px" }}>
                      <h5 style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 600 }}>
                        {language === "en" ? "Pending Asset Commands:" : "Các lệnh tài sản chờ xem trước / lưu:"}
                      </h5>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                        <thead>
                          <tr style={{ background: "var(--color-surface)", textAlign: "left" }}>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Op" : "Thao tác"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Source / Ref" : "Mã nguồn / Tham chiếu"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Status" : "Trạng thái"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Net / Contribution" : "Tiền ròng / Góp"}</th>
                            <th style={{ padding: "6px 10px", width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {assetCommands.map((ac) => (
                            <tr key={ac.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 10px" }}>
                                <Badge tone={ac.operation === "END" ? "danger" : ac.operation === "REVISE" ? "warning" : "success"}>
                                  {ac.operation}
                                </Badge>
                              </td>
                              <td style={{ padding: "6px 10px", fontWeight: 600 }} className="font-mono">
                                {ac.operation === "END" ? ac.sourceId : `${ac.capital.reference} (${ac.sourceId})`}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                {ac.operation === "END" ? (
                                  <span style={{ color: "var(--color-danger-700)" }}>{ac.reason}</span>
                                ) : (
                                  <Badge tone="info">{ac.capital.funding.status}</Badge>
                                )}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                {ac.operation === "END" ? "N/A" : (
                                  <span>{formatVND(Number(ac.capital.netAmount))} ➔ {formatVND(Number(ac.capital.confirmedContributionAmount))}</span>
                                )}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveAssetCommand(ac.commandId)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <Button
                    variant="primary"
                    onClick={handlePreviewV4}
                    loading={previewingV4}
                    disabled={!activePlan?.id || !currentVersion?.id}
                  >
                    <Icon name="sparkles" size="small" /> {language === "en" ? "Preview V4 Sources" : "Xem trước nguồn V4"}
                  </Button>
                  {v4Candidate?.status === "READY" && (
                    <Button
                      variant="secondary"
                      onClick={handleSaveV4}
                      loading={savingV4}
                      disabled={!v4Candidate.inputHash}
                    >
                      <Icon name="check" size="small" /> {language === "en" ? "Save V4 Version" : "Lưu phiên bản V4"}
                    </Button>
                  )}
                  {savedV4Version && (
                    <Button
                      variant="primary"
                      onClick={handleApplyV4Version}
                      loading={applyingV4}
                    >
                      <Icon name="compass" size="small" /> {language === "en" ? `Apply v${savedV4Version.version}` : `Áp dụng bản v${savedV4Version.version}`}
                    </Button>
                  )}
                </div>

                {v4Error && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="danger" title={language === "en" ? "V4 Error" : "Lỗi nguồn V4"}>{v4Error}</Alert>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* History Drawer Modal */}
          {historyOpen && monthDetail && (
            <Modal
              title={language === "en" ? `Revision History for ${selectedPeriod}` : `Lịch sử chỉnh sửa tháng ${selectedPeriod}`}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
            >
              <div style={{ display: "grid", gap: "12px", maxHeight: "400px", overflowY: "auto" }}>
                {monthDetail.history.map((rev) => (
                  <div key={rev.revision} style={{ padding: "12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong className="font-mono">{language === "en" ? `Version r${rev.revision}` : `Phiên bản r${rev.revision}`}</strong>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {new Date(rev.createdAt).toLocaleString(language === "en" ? "en-US" : "vi-VN")}
                      </span>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Reason" : "Lý do"}: <i>{rev.data.correctionReason}</i>
                    </p>
                    <div style={{ fontSize: "11.5px", marginTop: "4px" }} className="font-mono">
                      {language === "en" ? "Opening" : "Đầu kỳ"}: {formatVND(Number(rev.data.openingBalance))} • {language === "en" ? "Closing" : "Cuối kỳ"}: {formatVND(Number(rev.data.closingBalance))} • {language === "en" ? "Transactions" : "Số giao dịch"}: {rev.data.entries.length}
                    </div>
                  </div>
                ))}
              </div>
            </Modal>
          )}
        </div>
      )}
      <Modal open={confirmApply} title={language === "en" ? "Apply this scenario?" : "Áp dụng kịch bản này?"} onClose={() => { if (!applying) setConfirmApply(false); }}>
        <p>{language === "en" ? "This preview will be saved as a version and become the official baseline for your dashboard and tracking." : "Bản xem trước này sẽ được lưu thành phiên bản và trở thành mốc chính thức cho trang tổng quan và theo dõi."}</p>
        <div className="account-save-row"><Button variant="secondary" disabled={applying} onClick={() => setConfirmApply(false)}>{language === "en" ? "Cancel" : "Hủy"}</Button><Button loading={applying} disabled={applying || isSimulating || !simSummary} onClick={async () => { await handleApplyScenario(); setConfirmApply(false); }}>{language === "en" ? "Confirm application" : "Xác nhận áp dụng"}</Button></div>
      </Modal>
    </>
  );
}
