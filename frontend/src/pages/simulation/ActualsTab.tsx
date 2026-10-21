// T09 actual ledger, reforecast and source adjustments. Split out of
// SimulationTrackingPage and loaded only when the "actuals" tab is opened.
import MoneyTextBox from "../../components/MoneyTextBox";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Icon, IconButton, Modal, useNotification } from "../../components/ui";
import { useFinancialProfile } from "../../context/FinancialProfileContext";
import { useAuth } from "../../context/AuthContext";
import { reviseSelection } from "../../services/planSelection";
import { useRetirementPlan } from "../../context/RetirementPlanContext";
import { formatDateVN, formatMonthVN } from "../../utils/date";
import { LoanRevisionEditor } from "../../components/retirement/LoanRevisionEditor";
import { AnchorReforecastResult } from "../../components/retirement/AnchorReforecastResult";
import { Explain } from "../../components/explanations/ExplainMode";
import {
  formatVNDCurrency,
  formatPercentNumber,
  WARNING_MESSAGES,
  type RetirementPreviewInput,
  type RetirementPreviewResult,
} from "../../services/retirement";

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
} from "../../services/plans";
import { EvidenceEditor, emptyEvidence, submittedEvidence } from "../../components/EvidenceEditor";
import { Decimal } from "../../utils/decimal";
import { ApiError } from "../../services/api";
import { listPensionEstimates, type PensionEstimateRecord } from "../../services/insurance";
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
} from "../../services/actuals";
import { useI18n } from "../../i18n";
import { formatNumberWithDots } from "../../utils/currency";
import "../simulation-audit.css";
import { formatVND, formatVNDText, getVietnamCurrentMonth } from "./format";

export default function ActualsTab({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { profile, v2Profile, profileRevision } = useFinancialProfile();
  const { activePlan, currentVersion, savePlanVersion, applyVersion, loadingPlans, plansError, refreshPlans } = useRetirementPlan();

  // Top level active tab: T08 (What-If & Compare) vs T09 (Actual Ledger & Reforecast)
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") === "actuals" ? "actuals" : "what-if";
  const baselineSelection = currentVersion?.preview.selection;
  const setActiveTab = (tab: "what-if" | "actuals") => setParams(prev => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; });

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
  const [ledgerError, setLedgerError] = useState("");
  const [ledgerSaveError, setLedgerSaveError] = useState("");
  const [loadedPeriod, setLoadedPeriod] = useState("");
  const ledgerRequest = useRef(0);
  const actualSaving = useRef(false);
  const ledgerReady = loadedPeriod === selectedPeriod && !ledgerLoading && !ledgerError;
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
    const request = ++ledgerRequest.current;
    setLedgerLoading(true);
    setLoadedPeriod(""); setLedgerError(""); setLedgerSaveError("");
    setMonthDetail(null); setHistoryOpen(false);
    setReforecastResult(null);
    setReforecastError(null);
    try {
      const detail = await getActualMonth(period, true);
      if (request !== ledgerRequest.current) return;
      setMonthDetail(detail);
      setOpeningBalance(detail.data.openingBalance);
      setClosingBalance(detail.data.closingBalance);
      setEntries(detail.data.entries);
      setCorrectionReason(detail.data.correctionReason || (language === "en" ? "Actual balance reconciliation" : "Đối soát số dư thực tế"));
      setLoadedPeriod(period);
    } catch (error) {
      if (request !== ledgerRequest.current) return;
      setMonthDetail(null);
      setOpeningBalance("");
      setClosingBalance("");
      setEntries([]);
      setCorrectionReason(language === "en" ? "Initialize actual ledger month" : "Khởi tạo sổ thực tế tháng");
      if (error instanceof ApiError && error.status === 404) setLoadedPeriod(period);
      else setLedgerError(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === ledgerRequest.current) setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "actuals") {
      loadPeriodData(selectedPeriod);
    }
    return () => { ++ledgerRequest.current; };
  }, [activeTab, selectedPeriod, user?.id]);

  // Client reconciliation preview
  const currentPayload: ActualPayload = useMemo(() => ({
    currency: "VND",
    openingBalance: openingBalance || "0",
    closingBalance: closingBalance || "0",
    entries,
    correctionReason,
  }), [openingBalance, closingBalance, entries, correctionReason]);

  const validMoney = (value: string, signed = false) => (signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value);
  const lastPeriodDate = `${selectedPeriod}-${new Date(Number(selectedPeriod.slice(0, 4)), Number(selectedPeriod.slice(5, 7)), 0).getDate()}`;
  const amountsValid = validMoney(openingBalance) && validMoney(closingBalance) && entries.every(entry => validMoney(entry.amount, ["MARKET_CHANGE", "BALANCE_ADJUSTMENT"].includes(entry.kind)));
  const datesValid = entries.every(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.date >= `${selectedPeriod}-01` && entry.date <= lastPeriodDate);
  const localReconcile = useMemo(() => calculateLocalReconciliation({ ...currentPayload,
    openingBalance: validMoney(openingBalance) ? openingBalance : "0", closingBalance: validMoney(closingBalance) ? closingBalance : "0",
    entries: entries.map(entry => ({ ...entry, amount: validMoney(entry.amount, true) ? entry.amount : "0" }))
  }), [currentPayload]);
  const ledgerDirty = ledgerReady && (!monthDetail || JSON.stringify(currentPayload) !== JSON.stringify({
    currency: monthDetail.data.currency,
    openingBalance: monthDetail.data.openingBalance,
    closingBalance: monthDetail.data.closingBalance,
    entries: monthDetail.data.entries,
    correctionReason: monthDetail.data.correctionReason,
  }));
  const reforecastKey = JSON.stringify([user?.id, activeTab, selectedPeriod, currentPayload, openingBalance, closingBalance, ledgerReady, monthDetail?.revision, activePlan?.id, activePlan?.revision, currentVersion?.id, loadingPlans, plansError]);
  const latestReforecastKey = useRef(reforecastKey); latestReforecastKey.current = reforecastKey;
  const reforecastRequest = useRef(0);
  useEffect(() => {
    ++reforecastRequest.current;
    setReforecastResult(null); setReforecastError(null); setReforecasting(false);
    return () => { ++reforecastRequest.current; };
  }, [reforecastKey]);

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
    if (actualSaving.current || candidateWriting.current || !ledgerReady || !amountsValid || !datesValid) return;
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

    actualSaving.current = true; setSavingActual(true); setLedgerSaveError("");
    const expectedRevision = monthDetail ? monthDetail.revision : 0;
    const bodyStr = JSON.stringify({ userId: user?.id, period: selectedPeriod, expectedRevision, data: currentPayload });

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
      setLedgerSaveError(msg);
      notify.error(language === "en" ? "Save Ledger Error" : "Lỗi lưu sổ", msg);
    } finally {
      actualSaving.current = false; setSavingActual(false);
    }
  };

  const handleRunReforecast = async () => {
    if (!ledgerReady || ledgerDirty || savingActual || reforecasting || loadingPlans || plansError) return;
    if (!activePlan?.id || !currentVersion?.id) {
      notify.error(
        language === "en" ? "No Active Plan" : "Chưa có kế hoạch",
        language === "en" ? "An official plan version is required to run reforecast." : "Cần một phiên bản kế hoạch chính thức để chạy dự báo lại."
      );
      return;
    }

    const requestKey = reforecastKey;
    const requestId = ++reforecastRequest.current;
    const isCurrent = () => latestReforecastKey.current === requestKey && reforecastRequest.current === requestId;
    setReforecasting(true);
    setReforecastError(null);
    setReforecastResult(null);
    try {
      const result = await reforecastPlan(activePlan.id, currentVersion.id, selectedPeriod);
      if (!isCurrent()) return;
      setReforecastResult(result);
      if (result.status === "READY" && result.anchor && result.calculation) {
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
          language === "en" ? "Projection Horizon Completed" : "Đã hết kỳ dự báo",
          language === "en" ? "The full projection horizon of this version has passed." : "Toàn bộ chuỗi dự báo của phiên bản đã trôi qua."
        );
      }
    } catch (e) {
      if (!isCurrent()) return;
      const msg = e instanceof Error ? e.message : (language === "en" ? "Could not run reforecast." : "Không thể chạy dự báo lại.");
      setReforecastError(msg);
      notify.error(language === "en" ? "Reforecast Error" : "Lỗi dự báo lại", msg);
    } finally {
      if (isCurrent()) setReforecasting(false);
    }
  };

  // Future & Source Changes (P13/P15 & Q15-03)
  const [reforecastSubTab, setReforecastSubTab] = useState<"standard" | "future-changes" | "sources-v4">("standard");
  const [futureChanges, setFutureChanges] = useState<FutureChange[]>([]);
  const [reforecastCandidate, setReforecastCandidate] = useState<ReforecastPreviewResponse | null>(null);
  const [previewingCandidate, setPreviewingCandidate] = useState<boolean>(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [savingCandidate, setSavingCandidate] = useState<boolean>(false);
  const [applyingCandidate, setApplyingCandidate] = useState<boolean>(false);
  const [savedCandidateVersion, setSavedCandidateVersion] = useState<Awaited<ReturnType<typeof saveReforecast>> | null>(null);
  const [candidateSnapshot, setCandidateSnapshot] = useState<{ key: string; input: ReforecastPreviewCommand; revision: number } | null>(null);
  const [confirmCandidate, setConfirmCandidate] = useState(false);
  const [candidateConflict, setCandidateConflict] = useState(false);
  const candidateRequest = useRef(0);
  const candidateWriting = useRef(false);
  const candidateSavedRevision = useRef<{ planId: string; revision: number } | null>(null);

  // Future Change form inputs
  const [fcField, setFcField] = useState<FutureChangeField>("plannedContribution");
  const [fcAmount, setFcAmount] = useState<string>("");
  const [fcStartMonth, setFcStartMonth] = useState<string>("");
  const [fcEndMonth, setFcEndMonth] = useState<string>("");
  const [fcReason, setFcReason] = useState<string>("");
  const [fcEditingId, setFcEditingId] = useState<string | null>(null);
  const [fcError, setFcError] = useState("");
  const candidateBusy = savingCandidate || applyingCandidate;
  const candidateKey = JSON.stringify([user?.id, activePlan?.id, activePlan?.revision, currentVersion?.id, currentVersion?.snapshotHash, profileRevision, selectedPeriod, monthDetail?.revision, ledgerReady, ledgerDirty, currentPayload, activeTab, loadingPlans, plansError, futureChanges, fcField, fcAmount, fcStartMonth, fcEndMonth, fcReason, fcEditingId]);
  const latestCandidateKey = useRef(candidateKey); latestCandidateKey.current = candidateKey;
  const currentCandidate = candidateSnapshot?.key === candidateKey ? reforecastCandidate : null;
  const candidateComplete = currentCandidate?.status === "READY" && Boolean(currentCandidate.inputHash && currentCandidate.candidate?.calculation?.summary?.atRetirement);
  const candidateEndMonth = currentVersion?.preview?.calculation?.summary?.endMonth;
  const candidateUsesSources = currentVersion?.preview?.modelVersion === "retirement-monthly-v4";
  const candidateCanPreview = !candidateUsesSources && ledgerReady && !ledgerDirty && !savingActual && !loadingPlans && !plansError && Boolean(activePlan?.id && currentVersion?.id) && profileRevision > 0 && futureChanges.length > 0 && !fcAmount && !fcReason && !fcEditingId;
  useEffect(() => {
    ++candidateRequest.current;
    setReforecastCandidate(null); setCandidateSnapshot(null); setSavedCandidateVersion(null);
    setCandidateError(null); setPreviewingCandidate(false); setConfirmCandidate(false);
    return () => { ++candidateRequest.current; };
  }, [candidateKey]);
  useEffect(() => {
    setFutureChanges([]); setFcAmount(""); setFcReason(""); setFcEditingId(null); setFcError(""); setCandidateConflict(false);
    candidateSavedRevision.current = null;
  }, [user?.id, activePlan?.id, currentVersion?.id]);
  const futureFieldLabel = (field: FutureChangeField) => ({
    plannedContribution: language === "en" ? "Savings contribution" : "Đóng góp tích lũy",
    income: language === "en" ? "Income" : "Thu nhập",
    livingExpense: language === "en" ? "Living expenses" : "Sinh hoạt",
    additionalExpense: language === "en" ? "Additional expenses" : "Chi bổ sung",
  })[field];
  const futureMoney = (value: string | null | undefined) => {
    if (value == null || !/^-?\d+(\.\d+)?$/.test(value)) return language === "en" ? "Unknown" : "Chưa xác định";
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const decimals = fraction.replace(/0+$/, "");
    const formattedWhole = language === "en" ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${value.startsWith("-") ? "-" : ""}${formattedWhole}${decimals ? `${language === "en" ? "." : ","}${decimals}` : ""} VND`;
  };

  // Source commands v4 state
  const [sourceCommands, setSourceCommands] = useState<FlowSourceCommand[]>([]);
  const [v4Candidate, setV4Candidate] = useState<SourceReforecastPreviewResponse | null>(null);
  // Keep discovery options separate from the immutable input/result that may be saved.
  const [v4Preview, setV4Preview] = useState<{
    inputKey: string;
    planId: string;
    input: SourceReforecastPreviewInput;
    response: SourceReforecastPreviewResponse;
  } | null>(null);
  const v4Request = useRef(0);
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
  const [pensionLoading, setPensionLoading] = useState(true);
  const [pensionLoadError, setPensionLoadError] = useState(false);
  const [pensionReload, setPensionReload] = useState(0);
  const [pensionError, setPensionError] = useState("");
  const [pensionTargetId, setPensionTargetId] = useState("");
  const [pensionConfirmed, setPensionConfirmed] = useState(false);
  const pensionDraft = Boolean(selectedEstimateId && !pensionSelections.length);

  // V4 flow form inputs
  const [v4Operation, setV4Operation] = useState<"CREATE" | "REVISE" | "END">("CREATE");
  const [v4Metric, setV4Metric] = useState<"income" | "livingExpense" | "additionalExpense" | "pension">("income");
  const [v4Frequency, setV4Frequency] = useState<"MONTHLY" | "ONCE">("MONTHLY");
  const [v4Amount, setV4Amount] = useState<string>("");
  const [v4FromMonth, setV4FromMonth] = useState<string>("");
  const [v4ToMonth, setV4ToMonth] = useState<string>("");
  const [v4Document, setV4Document] = useState<string>("");
  const [v4Confirmation, setV4Confirmation] = useState<"HYPOTHETICAL" | "USER_CONFIRMED">("HYPOTHETICAL");
  const [v4FlowError, setV4FlowError] = useState("");
  const [v4DiscoveryRegistry, setV4DiscoveryRegistry] = useState<any>(null);
  const [confirmV4Apply, setConfirmV4Apply] = useState(false);
  const [v4Conflict, setV4Conflict] = useState(false);
  const v4Writing = useRef(false);
  const v4LastSavedRevision = useRef<{ planId: string; revision: number } | null>(null);
  const v4FlowDraft = Boolean(v4Amount || v4Document);

  // V4 Loan revisions & creations state (FE-07 & FE-08)
  const [loanRevisions, setLoanRevisions] = useState<LoanSourceRevisionCommand[]>([]);
  const [loanCreations, setLoanCreations] = useState<LoanCreation[]>([]);
  const [refinances, setRefinances] = useState<RefinanceCommand[]>([]);
  const [plannedRefinances, setPlannedRefinances] = useState<PlannedPairCommand[]>([]);
  const [loanTab, setLoanTab] = useState<"revise" | "create" | "refinance" | "plannedRefinance">("revise");

  const [loanRevisionDraft, setLoanRevisionDraft] = useState("");


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
  const [refiPaymentPeriod, setRefiPaymentPeriod] = useState("");
  const [refiPaymentEventId, setRefiPaymentEventId] = useState("");
  const [refiPaymentLedger, setRefiPaymentLedger] = useState<{ userId: string; detail: ActualMonthDetail } | null>(null);
  const [refiPaymentsLoading, setRefiPaymentsLoading] = useState(false);
  const [refiPaymentsError, setRefiPaymentsError] = useState<string | null>(null);
  const [refiPaymentReload, setRefiPaymentReload] = useState(0);
  const refiLedgerPeriod = refiPaymentPeriod || selectedPeriod;
  const refiLedger = refiPaymentLedger?.userId === user?.id
    && refiPaymentLedger?.detail.period === refiLedgerPeriod
    && refiLedgerPeriod <= selectedPeriod ? refiPaymentLedger.detail : null;
  const refiPaymentOptions = refiLedger?.reconciliation === "MATCHED"
    ? refiLedger.data.entries.filter(entry => entry.kind === "DEBT_PAYMENT" && new Decimal(entry.amount).gt(0))
    : [];
  const refiPayment = refiPaymentOptions.find(entry => entry.eventId === refiPaymentEventId);

  useEffect(() => {
    let cancelled = false;
    setRefiPaymentLedger(null);
    setRefiPaymentEventId("");
    setRefiPaymentsError(null);
    setRefiPaymentsLoading(false);
    if (loanTab !== "refinance" || !user?.id || refiLedgerPeriod > selectedPeriod) return;
    const userId = user.id;
    setRefiPaymentsLoading(true);
    getActualMonth(refiLedgerPeriod, true).then(detail => {
      if (!cancelled) setRefiPaymentLedger({ userId, detail });
    }).catch(error => {
      if (!cancelled) setRefiPaymentsError(error instanceof Error ? error.message : "Không tải được sổ giao dịch thực tế.");
    }).finally(() => {
      if (!cancelled) setRefiPaymentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [loanTab, user?.id, refiLedgerPeriod, selectedPeriod, refiPaymentReload, monthDetail?.revision]);
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
  // Rental exit
  const [assetHasRentalExit, setAssetHasRentalExit] = useState<boolean>(false);
  const [assetRentEndsOn, setAssetRentEndsOn] = useState<string>("");
  const [assetFinalMonthIncome, setAssetFinalMonthIncome] = useState<string>("0");
  // Missed contribution
  const [assetHasMissedContribution, setAssetHasMissedContribution] = useState<boolean>(false);
  const [assetMissedScheduledMonth, setAssetMissedScheduledMonth] = useState<string>("");
  const [assetMissedAmount, setAssetMissedAmount] = useState<string>("");
  const [assetMissedReason, setAssetMissedReason] = useState<string>("");
  const [assetActual, setAssetActual] = useState<{ userId: string; detail: ActualMonthDetail } | null>(null);
  const [assetActualLoading, setAssetActualLoading] = useState(false);
  const [assetActualError, setAssetActualError] = useState("");
  const [assetActualReload, setAssetActualReload] = useState(0);
  const assetActualPeriod = assetMissedScheduledMonth || selectedPeriod;
  const assetActualLedger = assetActual && assetActual.userId === user?.id && assetActual.detail.period === assetActualPeriod ? assetActual.detail : null;
  useEffect(() => {
    let cancelled = false;
    setAssetActual(null); setAssetActualError(""); setAssetActualLoading(false);
    if (!assetHasMissedContribution || !user?.id || assetActualPeriod > selectedPeriod) return;
    const owner = user.id;
    setAssetActualLoading(true);
    getActualMonth(assetActualPeriod, true).then(detail => { if (!cancelled) setAssetActual({ userId: owner, detail }); })
      .catch(error => { if (!cancelled) setAssetActualError(error instanceof Error ? error.message : "Không tải được sổ tháng."); })
      .finally(() => { if (!cancelled) setAssetActualLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, assetHasMissedContribution, assetActualPeriod, selectedPeriod, assetActualReload, monthDetail?.revision]);
  const [sourceEvidence, setSourceEvidence] = useState(emptyEvidence);
  useEffect(() => { setSourceEvidence(emptyEvidence()); }, [user?.id, activePlan?.id]);
  const sourceProofKey = JSON.stringify([user?.id, activePlan?.id, selectedPeriod, sourceEvidence, assetActualLedger?.revision, refiLedger?.revision]);
  const latestProofKey = useRef(sourceProofKey); latestProofKey.current = sourceProofKey;
  const getSourceProof = async () => {
    try {
      const proof = (await submittedEvidence(sourceEvidence))[0];
      return latestProofKey.current === sourceProofKey ? proof : null;
    } catch (error) {
      notify.error(language === "en" ? "Evidence required" : "Cần căn cứ cho lệnh", error instanceof Error ? error.message : "Vui lòng nhập căn cứ.");
      return null;
    }
  };
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

  const v4PayloadJson = JSON.stringify({
    versionId: currentVersion?.id,
    expectedSnapshotHash: currentVersion?.snapshotHash,
    expectedRevision: activePlan?.revision ?? 0,
    expectedProfileRevision: profileRevision > 0 ? profileRevision : 1,
    throughMonth: selectedPeriod,
    sourceCommands, pensionSelections, loanRevisions, loanCreations,
    refinances, assetCommands, plannedRefinances,
  } satisfies Partial<SourceReforecastPreviewInput>);
  const v4ContextKey = JSON.stringify([user?.id, activePlan?.id, currentVersion?.id, currentVersion?.snapshotHash,
    activePlan?.revision, profileRevision, selectedPeriod]);
  const v4InputKey = JSON.stringify([v4ContextKey, v4PayloadJson, monthDetail?.period, monthDetail?.revision, assetActualLedger?.revision, assetActualReload, refiLedger?.revision, refiPaymentReload, v4Operation, selectedSourceId, v4Metric, v4Frequency, v4Amount, v4FromMonth, v4ToMonth, v4Document, v4Confirmation, selectedEstimateId, pensionTargetId, pensionConfirmed, pensionReload, loanRevisionDraft]);
  const currentV4Preview = v4Preview?.inputKey === v4InputKey ? v4Preview : null;
  const v4Ready = currentV4Preview?.response.status === "READY" && Boolean(currentV4Preview.response.inputHash && currentV4Preview.response.candidate?.calculation?.summary?.atRetirement);

  useEffect(() => {
    ++v4Request.current;
    setV4Preview(null);
    setSavedV4Version(null);
    setSavedV4PlanRevision(null);
    setV4Idempotency(null);
    setV4Error(null);
    setPreviewingV4(false);
    setConfirmV4Apply(false);
    return () => { ++v4Request.current; };
  }, [v4InputKey]);

  useEffect(() => { setV4Candidate(null); setV4DiscoveryRegistry(null); }, [v4ContextKey]);

  useEffect(() => {
    setV4Amount(""); setV4Document(""); setV4FlowError(""); setSelectedSourceId("");
    setV4Conflict(false);
    v4LastSavedRevision.current = null;
    setSourceCommands([]);
    setPensionSelections([]);
    setSelectedEstimateId(""); setPensionTargetId(""); setPensionConfirmed(false); setPensionError("");
    setLoanRevisions([]);
    setLoanCreations([]);
    setRefinances([]);
    setAssetCommands([]);
    setPlannedRefinances([]);
  }, [user?.id, activePlan?.id, currentVersion?.id]);

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
    setEligibleEstimates([]); setSelectedEstimateId(""); setPensionSelections([]);
    setPensionLoading(true); setPensionLoadError(false); setPensionConfirmed(false); setPensionError("");
    listPensionEstimates(true)
      .then((res) => {
        if (!active) return;
        const eligible = (res.items || []).filter(
          (item) => item.assessment?.assessmentStatus === "ELIGIBLE"
            && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.assessment.startMonth ?? "")
            && /^(0|[1-9]\d*)(\.\d+)?$/.test(item.assessment.monthlyPension ?? "")
            && /[1-9]/.test(item.assessment.monthlyPension ?? "")
            && /^[a-f0-9]{64}$/i.test(item.integrityHash ?? "")
        );
        setEligibleEstimates(eligible);
      })
      .catch(() => { if (active) setPensionLoadError(true); })
      .finally(() => { if (active) setPensionLoading(false); });
    return () => {
      active = false;
    };
  }, [user?.id, pensionReload]);

  // Compute active sources from registry (FE-04)
  const activeSources = useMemo(() => {
    const revisions = (((currentVersion?.preview as any)?.replayInput?.sourceRegistry?.revisions
      || v4DiscoveryRegistry?.revisions
      || []) as any[]);
    const map = new Map<string, {
      sourceId: string;
      revision: number;
      kind: string;
      operation: string;
      effectiveFromMonth: string;
      effectiveToMonth: string;
      metric: string;
      amount: string;
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
          metric: r.schedule?.[0]?.metric ?? "",
          amount: r.schedule?.[0]?.amount ?? "",
        });
      }
    }
    return [...map.values()].filter((s) => s.operation !== "END");
  }, [v4DiscoveryRegistry, currentVersion]);
  const flowSources = activeSources.filter(source => ["INCOME", "EXPENSE", "PENSION"].includes(source.kind));
  const pensionSources = activeSources.filter(source => source.kind === "PENSION");
  const pensionRegistry = (currentVersion?.preview as any)?.replayInput?.sourceRegistry ?? v4DiscoveryRegistry;
  const selectedPensionEstimate = eligibleEstimates.find(estimate => estimate.id === selectedEstimateId);
  const pensionTarget = pensionSources.length === 1 ? pensionSources[0] : pensionSources.find(source => source.sourceId === pensionTargetId);
  const pensionRegistryReady = Boolean(pensionRegistry?.registryHash && pensionRegistry?.startMonth && pensionRegistry?.endMonth);
  const pensionNextMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedPeriod)
    ? new Date(Date.UTC(Number(selectedPeriod.slice(0, 4)), Number(selectedPeriod.slice(5, 7)), 1)).toISOString().slice(0, 7) : "";
  const pensionFrom = selectedPensionEstimate && pensionRegistryReady && pensionNextMonth
    ? [selectedPensionEstimate.assessment.startMonth!, pensionNextMonth, pensionRegistry.startMonth].sort().at(-1)! : "";
  const pensionTo = pensionRegistry?.endMonth ?? "";
  const pensionPeriodValid = Boolean(pensionFrom && pensionTo && pensionFrom <= pensionTo);
  useEffect(() => { setPensionConfirmed(false); setPensionError(""); }, [selectedPeriod, selectedEstimateId, pensionTargetId, pensionRegistry?.registryHash]);

  useEffect(() => {
    if (!flowSources.some((s) => s.sourceId === selectedSourceId)) {
      setSelectedSourceId(flowSources[0]?.sourceId ?? "");
    }
  }, [activeSources, selectedSourceId]);
  const selectedFlowSource = flowSources.find(source => source.sourceId === selectedSourceId);
  useEffect(() => {
    if (v4Operation === "CREATE" || !selectedFlowSource) return;
    const metric = selectedFlowSource.metric || (selectedFlowSource.kind === "INCOME" ? "income" : selectedFlowSource.kind === "PENSION" ? "pension" : "livingExpense");
    setV4Metric(metric as typeof v4Metric);
  }, [v4Operation, selectedSourceId, selectedFlowSource?.metric]);



  useEffect(() => {
    const opts = v4Candidate?.assetRevisionOptions || [];
    if (opts.length > 0 && (!selectedAssetOptionSourceId || !opts.some((o) => o.sourceId === selectedAssetOptionSourceId))) {
      setSelectedAssetOptionSourceId(opts[0].sourceId);
    }
  }, [v4Candidate?.assetRevisionOptions, selectedAssetOptionSourceId]);

  const validateFutureChange = (change: Pick<FutureChange, "amount" | "startMonth" | "endMonth" | "reason">) => {
    if (!/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(change.amount)) return language === "en" ? "Enter a non-negative decimal amount with up to 16 integer digits and 2 decimal places." : "Nhập số tiền không âm, tối đa 16 chữ số nguyên và 2 chữ số thập phân.";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(change.startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(change.endMonth) || change.startMonth > change.endMonth || change.startMonth <= selectedPeriod || (candidateEndMonth && change.endMonth > candidateEndMonth)) return language === "en" ? "Choose future months after the reconciliation month, within the plan horizon, with start no later than end." : "Chọn tháng sau kỳ đối soát, trong kỳ dự báo của kế hoạch; tháng bắt đầu không được sau tháng kết thúc.";
    if (!change.reason.trim() || change.reason.trim().length > 500) return language === "en" ? "Enter a reason (1–500 characters)." : "Nhập lý do từ 1 đến 500 ký tự.";
    return "";
  };
  const handleAddFutureChange = () => {
    if (candidateWriting.current) return;
    const error = validateFutureChange({ amount: fcAmount, startMonth: fcStartMonth, endMonth: fcEndMonth, reason: fcReason });
    if (error) { setFcError(error); return; }
    if (futureChanges.some(c => c.id !== fcEditingId && c.field === fcField && c.startMonth <= fcEndMonth && fcStartMonth <= c.endMonth)) {
      setFcError(language === "en" ? "This field already has an adjustment in that period. Edit the existing row or choose another period." : "Hạng mục này đã có điều chỉnh trong khoảng tháng đó. Hãy sửa dòng hiện có hoặc chọn khoảng khác."); return;
    }
    if (!fcEditingId && futureChanges.length >= 200) { setFcError(language === "en" ? "A maximum of 200 adjustments is allowed." : "Tối đa 200 điều chỉnh."); return; }
    const change: FutureChange = { id: fcEditingId ?? crypto.randomUUID(), field: fcField, operation: "REPLACE_MONTHLY_TOTAL", amount: fcAmount, startMonth: fcStartMonth, endMonth: fcEndMonth, reason: fcReason.trim() };
    setFutureChanges(prev => fcEditingId ? prev.map(c => c.id === fcEditingId ? change : c) : [...prev, change]);
    setFcAmount(""); setFcReason(""); setFcEditingId(null); setFcError("");
  };
  const handleEditFutureChange = (change: FutureChange) => {
    if (candidateWriting.current) return;
    setFcEditingId(change.id); setFcField(change.field); setFcAmount(change.amount); setFcStartMonth(change.startMonth); setFcEndMonth(change.endMonth); setFcReason(change.reason); setFcError("");
    document.getElementById("fc-amount")?.focus();
  };
  const handleRemoveFutureChange = (id: string) => {
    if (candidateWriting.current) return;
    setFutureChanges(prev => prev.filter(c => c.id !== id));
    if (fcEditingId === id) { setFcEditingId(null); setFcAmount(""); setFcReason(""); }
    setFcError("");
  };
  const handlePreviewCandidate = async () => {
    if (!candidateCanPreview || candidateWriting.current || previewingCandidate) return;
    const invalid = futureChanges.map(validateFutureChange).find(Boolean);
    if (invalid) { setCandidateError(invalid); return; }
    const request = ++candidateRequest.current;
    const key = candidateKey;
    const input: ReforecastPreviewCommand = { planId: activePlan!.id, versionId: currentVersion!.id, throughMonth: selectedPeriod, expectedProfileRevision: profileRevision, futureChanges: structuredClone(futureChanges) };
    const revision = Math.max(activePlan!.revision, candidateSavedRevision.current?.planId === input.planId ? candidateSavedRevision.current.revision : 0);
    setPreviewingCandidate(true); setCandidateError(null); setCandidateConflict(false); setReforecastCandidate(null); setCandidateSnapshot(null); setSavedCandidateVersion(null);
    try {
      const res = await previewReforecast(input);
      if (request !== candidateRequest.current || latestCandidateKey.current !== key) return;
      setReforecastCandidate(res); setCandidateSnapshot({ key, input, revision });
    } catch (e) {
      if (request !== candidateRequest.current || latestCandidateKey.current !== key) return;
      setCandidateError(e instanceof Error ? e.message : (language === "en" ? "Unable to preview." : "Không thể xem trước."));
    } finally {
      if (request === candidateRequest.current && latestCandidateKey.current === key) setPreviewingCandidate(false);
    }
  };
  const handleSaveCandidate = async () => {
    if (!candidateComplete || !candidateSnapshot || savedCandidateVersion || candidateWriting.current || previewingCandidate) return;
    const snapshot = candidateSnapshot;
    const request = candidateRequest.current;
    const body = { expectedRevision: snapshot.revision, expectedInputHash: currentCandidate!.inputHash!, preview: snapshot.input };
    const bodyStr = JSON.stringify([snapshot.input.planId, body]);
    const key = candidateIdempotency?.bodyStr === bodyStr ? candidateIdempotency.key : crypto.randomUUID();
    setCandidateIdempotency({ key, bodyStr }); candidateWriting.current = true; setSavingCandidate(true); setCandidateError(null);
    try {
      const res = await saveReforecast(snapshot.input.planId, body, key);
      if (request !== candidateRequest.current || latestCandidateKey.current !== snapshot.key) return;
      candidateSavedRevision.current = { planId: res.planId, revision: res.planRevision };
      setSavedCandidateVersion(res);
    } catch (e) {
      if (request !== candidateRequest.current || latestCandidateKey.current !== snapshot.key) return;
      setCandidateError(e instanceof Error ? e.message : (language === "en" ? "Unable to save." : "Không thể lưu phiên bản."));
      if (e instanceof ApiError && e.status === 409) { setCandidateConflict(true); setCandidateSnapshot(null); setReforecastCandidate(null); void refreshPlans(); }
    } finally { candidateWriting.current = false; setSavingCandidate(false); }
  };
  const handleApplyCandidateVersion = async () => {
    if (!savedCandidateVersion || !candidateSnapshot || !candidateComplete || candidateWriting.current) return;
    const saved = savedCandidateVersion;
    candidateWriting.current = true; setApplyingCandidate(true); setCandidateError(null);
    try {
      const success = await applyVersion(saved.versionId, candidateSnapshot.input.expectedProfileRevision, saved.planId, saved.planRevision);
      if (!success) throw new Error(language === "en" ? "Failed to apply version." : "Áp dụng phiên bản thất bại.");
      setConfirmCandidate(false); navigate("/user/plan");
    } catch (e) {
      setCandidateError(e instanceof Error ? e.message : (language === "en" ? "Unable to apply." : "Không thể áp dụng phiên bản."));
      setConfirmCandidate(false);
      if (e instanceof ApiError && e.status === 409) { setCandidateConflict(true); setCandidateSnapshot(null); setReforecastCandidate(null); setSavedCandidateVersion(null); void refreshPlans(); }
    } finally { candidateWriting.current = false; setApplyingCandidate(false); }
  };

  const flowEndMonth = (currentVersion?.preview as any)?.replayInput?.sourceRegistry?.endMonth ?? currentVersion?.preview?.calculation?.summary?.endMonth ?? v4DiscoveryRegistry?.endMonth;
  const validateFlowPeriod = (from: string, to: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(from) && /^\d{4}-(0[1-9]|1[0-2])$/.test(to) && from > selectedPeriod && from <= to && (!flowEndMonth || to <= flowEndMonth);
  const handleAddV4Command = () => {
    if (v4Writing.current) return;
    const fail = (vi: string, en: string) => setV4FlowError(language === "en" ? en : vi);
    if (v4Operation !== "END" && (!/^(0|[1-9]\d*)(\.\d+)?$/.test(v4Amount) || v4Amount.length > 160 || new Decimal(v4Amount).gt("1" + "0".repeat(100)))) {
      fail("Nhập số tiền thập phân không âm, không dùng ký pháp mũ.", "Enter a non-negative decimal amount without exponent notation."); return;
    }
    if (!validateFlowPeriod(v4FromMonth, v4ToMonth)) { fail("Chọn khoảng tháng sau kỳ đối soát và trong kỳ dự báo của kế hoạch.", "Choose months after reconciliation and within the plan horizon."); return; }
    if (v4Operation !== "END" && v4Frequency === "ONCE" && v4FromMonth !== v4ToMonth) { fail("Nguồn một lần phải có tháng bắt đầu và kết thúc giống nhau.", "A one-off source must start and end in the same month."); return; }
    if (!v4Document.trim() || v4Document.trim().length > 2000) { fail("Nhập căn cứ hoặc mô tả giả định từ 1 đến 2000 ký tự.", "Enter supporting information or assumptions (1–2000 characters)."); return; }
    const source = flowSources.find(s => s.sourceId === selectedSourceId);
    if (v4Operation !== "CREATE" && !source) { fail("Chọn nguồn thu/chi hiện có hoặc tải danh sách bằng nút xem trước.", "Select an existing cash flow source or load sources with Preview."); return; }
    if (sourceCommands.length >= 100) { fail("Tối đa 100 lệnh nguồn trong một lần xem trước.", "A preview supports at most 100 flow commands."); return; }
    if (v4Operation !== "CREATE" && [...sourceCommands, ...pensionSelections].some(c => c.sourceId === source!.sourceId)) { fail("Nguồn này đã có lệnh trong danh sách. Xóa lệnh cũ trước khi thêm lệnh thay thế.", "This source already has a command. Remove it before adding a replacement."); return; }
    if (pensionSelections.length && v4Operation !== "END" && v4Metric === "pension") { fail("Đã gắn kết quả BHXH. Bỏ gắn trước khi thêm dòng lương hưu khác.", "Remove the attached pension estimate before adding another pension flow."); return; }
    const identity = { commandId: crypto.randomUUID(), sourceId: v4Operation === "CREATE" ? `plan:${crypto.randomUUID()}` : source!.sourceId, expectedSourceRevision: v4Operation === "CREATE" ? 0 : source!.revision, effectiveFromMonth: v4FromMonth, effectiveToMonth: v4ToMonth, confirm: true as const, document: v4Document.trim() };
    const cmd: FlowSourceCommand = v4Operation === "END" ? { ...identity, operation: "END" } : { ...identity, operation: v4Operation, metric: v4Metric, frequency: v4Frequency, amount: v4Amount, currency: "VND", confirmation: v4Confirmation };
    setSourceCommands(prev => [...prev, cmd]); setV4Amount(""); setV4Document(""); setV4FlowError("");
  };
  const handleRemoveV4Command = (cmdId: string) => {
    if (v4Writing.current) return;
    setSourceCommands(prev => prev.filter(c => c.commandId !== cmdId));
  };

  const handleAddPensionSelection = () => {
    if (v4Writing.current || pensionLoading || pensionSelections.length) return;
    const est = eligibleEstimates.find(e => e.id === selectedEstimateId);
    if (!est || !pensionRegistryReady || !pensionPeriodValid || !pensionConfirmed || (pensionSources.length > 0 && !pensionTarget)) {
      setPensionError(language === "en" ? "Review the estimate, target source, remaining period and confirmation." : "Kiểm tra kết quả, nguồn thay thế, kỳ còn lại và ô xác nhận.");
      return;
    }
    if (sourceCommands.some(command => command.sourceId === pensionTarget?.sourceId || (command.operation !== "END" && command.metric === "pension"))) {
      setPensionError(language === "en" ? "Remove the conflicting pension flow command before attaching this estimate." : "Đã có lệnh thu/chi trùng nguồn hoặc tạo dòng lương hưu. Xóa lệnh đó trước khi gắn kết quả BHXH.");
      return;
    }
    const sel: PensionSourceSelection = {
      estimateId: est.id,
      expectedEstimateIntegrityHash: est.integrityHash,
      expectedRegistryHash: pensionRegistry.registryHash,
      commandId: crypto.randomUUID(),
      sourceId: pensionTarget ? pensionTarget.sourceId : `plan:${crypto.randomUUID()}`,
      operation: pensionTarget ? "REVISE" : "CREATE",
      expectedSourceRevision: pensionTarget ? pensionTarget.revision : 0,
      effectiveFromMonth: pensionFrom,
      effectiveToMonth: pensionTo,
      amountPolicy: "FIXED_NOMINAL",
      confirm: true,
    };
    setPensionSelections([sel]);
    setPensionError("");
  };

  const handleRemovePensionSelection = () => {
    if (v4Writing.current) return;
    setPensionSelections([]); setSelectedEstimateId(""); setPensionTargetId(""); setPensionConfirmed(false); setPensionError("");
  };

  const handleRemoveLoanRevision = (sourceId: string) => {
    if (v4Writing.current) return;
    setLoanRevisions(prev => prev.filter(c => c.sourceId !== sourceId));
  };

  const handleAddLoanCreation = async () => {
    const proof = await getSourceProof();
    if (!proof) return;
    const agreementRef = lcAgreementRef.trim();
    if (!agreementRef) {
      notify.error(language === "en" ? "Agreement Reference" : "Mã hợp đồng", language === "en" ? "Please provide agreement reference." : "Vui lòng nhập mã hợp đồng vay.");
      return;
    }
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = proof.confirmedOn;
    const evidenceHash = proof.contentHash;
    const docRef = proof.reference;

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

  const handleAddRefinance = async () => {
    const proof = await getSourceProof();
    if (!proof) return;
    if (refiPaymentsLoading || !refiLedger || !refiPayment || refiPaymentsError) {
      notify.error(language === "en" ? "Select a recorded payment" : "Chọn giao dịch đã ghi nhận",
        language === "en" ? "Select a debt payment from a saved, reconciled month." : "Chọn giao dịch trả nợ trong tháng đã lưu và đối soát khớp.");
      return;
    }
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
    const knownOn = proof.confirmedOn;
    const settledOn = refiPayment.date;
    const evidenceHash = proof.contentHash;
    const docRef = proof.reference;

    const gross = refiGrossDisbursement.trim() || "500000000";
    const withheld = refiWithheldFees.trim() || "0";
    const net = Decimal.max("0", new Decimal(gross).minus(withheld)).toString();
    const available = refiHasProceedsEarly ? (refiAvailableAmount.trim() || net) : net;
    const externalTopUp = refiExternalTopUp.trim() || "0";
    const unused = refiUnusedProceeds.trim() || "0";

    const settlementAmount = Decimal.max("0", new Decimal(available).plus(externalTopUp).minus(unused)).toString();

    const allocated = [...loanRevisions.flatMap(command => command.allocations),
      ...loanCreations.flatMap(command => command.funding.kind === "DISBURSED_BALANCE" ? command.funding.allocations : [])]
      .filter(allocation => allocation.eventId === refiPayment.eventId)
      .reduce((total, allocation) => total.plus(allocation.components.principal).plus(allocation.components.interest)
        .plus(allocation.components.prepaymentFee).plus(allocation.components.otherFee), new Decimal(0));
    if (!new Decimal(settlementAmount).gt(0) || allocated.plus(settlementAmount).gt(refiPayment.amount)) {
      notify.error(language === "en" ? "Payment amount exceeded" : "Số tiền phân bổ không hợp lệ",
        language === "en" ? "The settlement must be positive and fit within the recorded payment after existing draft allocations."
          : "Tiền tất toán phải lớn hơn 0 và không vượt số tiền giao dịch sau các phân bổ đang có trong bản nháp.");
      return;
    }

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
          eventId: refiPayment.eventId,
          actualRevision: refiLedger.revision,
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

  const handleAddPlannedRefinance = async () => {
    const proof = await getSourceProof();
    if (!proof) return;
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = proof.confirmedOn;
    const evidenceHash = proof.contentHash;
    const docRef = proof.reference;

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

  const handleAddStagedRelease = async () => {
    const proof = await getSourceProof();
    if (!proof) return;
    if (!stagedReleaseDate || !stagedReleaseAmount || Number(stagedReleaseAmount) <= 0) return;
    setStagedReleases(prev => [
      ...prev,
      {
        releaseId: crypto.randomUUID(),
        availableOn: stagedReleaseDate,
        amount: stagedReleaseAmount,
        status: stagedReleaseStatus,
        evidence: [proof],
      },
    ]);
    setStagedReleaseAmount("");
  };

  const handleRemoveStagedRelease = (releaseId: string) => {
    setStagedReleases(prev => prev.filter(r => r.releaseId !== releaseId));
  };

  const handleAddAssetCommand = async () => {
    const proof = await getSourceProof();
    if (!proof) return;
    if (assetHasMissedContribution && (assetActualLoading || assetActualError || !assetActualLedger || assetActualLedger.reconciliation !== "MATCHED" || assetActualPeriod > selectedPeriod)) {
      notify.error("Cần đối soát tháng", "Vui lòng tải sổ tháng đã lưu và đối soát khớp trước khi dời khoản góp.");
      return;
    }
    const [y, m] = selectedPeriod.split("-").map(Number);
    const nextMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const cutoffDate = new Date(Date.parse(`${nextMonthStr}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);
    const knownOn = proof.confirmedOn;
    const evidenceHash = proof.contentHash;
    const docRef = proof.reference;

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
                actualRevision: assetActualLedger!.revision,
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
    if (!activePlan?.id || !currentVersion?.id || v4Writing.current || previewingV4 || v4FlowDraft || pensionDraft || Boolean(loanRevisionDraft)) return;
    if (loanRevisions.some(c => c.contract.balanceAsOf.slice(0, 7) !== selectedPeriod)) { setV4Error("Kỳ đối soát đã đổi. Xóa và lập lại lệnh khoản vay theo kỳ mới."); return; }
    if ([...sourceCommands, ...pensionSelections].some(c => !validateFlowPeriod(c.effectiveFromMonth, c.effectiveToMonth))) { setV4Error(language === "en" ? "Review command dates after changing reconciliation month." : "Kiểm tra lại tháng hiệu lực của các lệnh sau khi đổi kỳ đối soát."); return; }
    const request = ++v4Request.current;
    const planId = activePlan.id;
    // Detach the request from editable command state before starting the network call.
    const input: SourceReforecastPreviewInput = JSON.parse(v4PayloadJson);
    input.expectedRevision = Math.max(input.expectedRevision, v4LastSavedRevision.current?.planId === planId ? v4LastSavedRevision.current.revision : 0);
    setPreviewingV4(true);
    setV4Conflict(false);
    setV4Error(null);
    setV4Preview(null);
    setSavedV4Version(null);
    setSavedV4PlanRevision(null);
    try {
      const res = await previewSourceReforecast(planId, input);
      if (request !== v4Request.current) return;
      setV4Candidate(res);
      if (!sourceCommands.length && !pensionSelections.length && !loanRevisions.length && !loanCreations.length && !refinances.length && !assetCommands.length && !plannedRefinances.length) setV4DiscoveryRegistry(res.candidate?.replayInput?.sourceRegistry ?? null);
      setV4Preview({ inputKey: v4InputKey, planId, input, response: res });

    } catch (e) {
      if (request !== v4Request.current) return;
      const msg = e instanceof Error ? e.message : "Error previewing V4";
      setV4Error(msg);
      notify.error(language === "en" ? "V4 Error" : "Chưa cập nhật được khoản thu hoặc chi", msg);
    } finally {
      if (request === v4Request.current) setPreviewingV4(false);
    }
  };

  const handleSaveV4 = async () => {
    if (!v4Ready || !currentV4Preview || v4Writing.current || previewingV4 || savedV4Version || v4FlowDraft || pensionDraft || Boolean(loanRevisionDraft)) return;
    const request = ++v4Request.current;
    const snapshot = currentV4Preview;
    const body = {
      expectedInputHash: snapshot.response.inputHash!,
      confirm: true as const,
      preview: snapshot.input,
    };
    setSavingV4(true);
    v4Writing.current = true;
    setV4Error(null);
    try {
      const bodyStr = JSON.stringify(body);
      const key = v4Idempotency && v4Idempotency.bodyStr === bodyStr
        ? v4Idempotency.key
        : crypto.randomUUID();
      setV4Idempotency({ key, bodyStr });

      const res = await saveSourceReforecast(snapshot.planId, body, key);
      if (request !== v4Request.current) return;
      setSavedV4Version(res.saved);
      setSavedV4PlanRevision(res.revision);
      v4LastSavedRevision.current = { planId: snapshot.planId, revision: res.revision };

    } catch (e) {
      if (request !== v4Request.current) return;
      const msg = e instanceof Error ? e.message : "Error saving V4";
      setV4Error(msg);
      if (e instanceof ApiError && e.status === 409) {
        setV4Conflict(true);
        setV4Preview(null);
        setSavedV4Version(null);
        setSavedV4PlanRevision(null);
        void refreshPlans();
      }
      notify.error(language === "en" ? "Save Error" : "Lỗi lưu phiên bản", msg);
    } finally {
      v4Writing.current = false; setSavingV4(false);
    }
  };

  const handleApplyV4Version = async () => {
    if (!activePlan?.id || !savedV4Version?.id || !currentV4Preview || !v4Ready || v4Writing.current || v4FlowDraft || pensionDraft || Boolean(loanRevisionDraft)) return;
    v4Writing.current = true;
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
      setConfirmV4Apply(false); navigate("/user/plan");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error applying version";
      setV4Error(msg); setConfirmV4Apply(false);
      if (e instanceof ApiError && e.status === 409) { setV4Conflict(true); setV4Preview(null); setSavedV4Version(null); setSavedV4PlanRevision(null); void refreshPlans(); }
      notify.error(language === "en" ? "Apply Error" : "Lỗi áp dụng", msg);
    } finally {
      v4Writing.current = false;
      setApplyingV4(false);
    }
  };

  const writing = savingActual || candidateBusy || savingV4 || applyingV4;
  useEffect(() => { onBusyChange?.(writing); }, [writing, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  return (
    <>
        <div className="simulation-actuals" style={{ display: "grid", gap: "var(--space-6)" }}>
          {/* Header Controls: Period Picker & Status */}
          <Card style={{ padding: "var(--space-5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                <div>
                  <label htmlFor="actual-period" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>
                    {language === "en" ? "Reconciliation Period (Vietnam)" : "Tháng cần kiểm tra số dư (giờ Việt Nam)"}
                  </label>
                  <input
                    id="actual-period"
                    disabled={savingActual || candidateBusy || savingV4 || applyingV4}
                    type="month"
                    max={currentVnMonth}
                    value={selectedPeriod}
                    onChange={(e) => { const value = e.target.value; if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= currentVnMonth) setSelectedPeriod(value); }}
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
                      ? `Saved r${monthDetail.revision} • Updated ${formatDateVN(monthDetail.updatedAt)}`
                      : `Đã lưu r${monthDetail.revision} • Cập nhật ${formatDateVN(monthDetail.updatedAt)}`}
                  </Badge>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {monthDetail?.history && monthDetail.history.length > 0 && (
                  <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                    <Icon name="file-text" size="small" /> {language === "en" ? "Edit History" : "Lịch sử chỉnh sửa"} ({monthDetail.history.length})
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={handleSaveActualMonth}
                  loading={savingActual}
                  disabled={!ledgerReady || !amountsValid || !datesValid || candidateBusy || savingV4 || applyingV4}
                >
                  <Icon name="check" size="small" /> {language === "en" ? `Save Ledger ${selectedPeriod}` : `Lưu sổ tháng ${selectedPeriod}`}
                </Button>
              </div>
            </div>
          </Card>

          {ledgerLoading && <p role="status">{language === "en" ? "Loading selected month…" : "Đang tải sổ tháng đã chọn…"}</p>}
          {ledgerError && <Alert tone="danger" title={language === "en" ? "Could not load ledger" : "Chưa tải được sổ tháng"}>
            <p>{ledgerError}</p><Button onClick={() => loadPeriodData(selectedPeriod)}>{language === "en" ? "Retry month" : "Tải lại sổ tháng"}</Button>
          </Alert>}
          {ledgerSaveError && <Alert tone="danger" title={language === "en" ? "Could not save ledger" : "Chưa lưu được sổ tháng"}>{ledgerSaveError}</Alert>}
          {ledgerReady && <fieldset disabled={savingActual || candidateBusy || savingV4 || applyingV4} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: "var(--space-6)" }}>
          {!monthDetail && <Alert tone="info" title={language === "en" ? "Month not recorded" : "Tháng chưa có bản ghi"}>{language === "en" ? "Enter actual opening and closing balances from your statements, including zero if confirmed." : "Nhập số dư đầu và cuối kỳ từ sao kê thực tế, kể cả số 0 nếu đã xác nhận. Tài sản ròng không được tự dùng làm số dư quỹ."}</Alert>}
          {ledgerDirty && <p role="status">{language === "en" ? "Unsaved ledger changes. Reforecast uses saved data." : "Sổ tháng có thay đổi chưa lưu. Dự báo lại sử dụng dữ liệu đã lưu."}</p>}
          {(!amountsValid || !datesValid) && <p role="alert">{language === "en" ? "Complete all amounts and dates within the selected month before saving." : "Nhập đủ số tiền hợp lệ và ngày thuộc tháng đang chọn trước khi lưu."}</p>}
          {/* Balances & Real-Time Reconciliation Dashboard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600 }}>
                {language === "en" ? "OPENING BALANCE (REPORTED)" : "SỐ DƯ ĐẦU KỲ (THỰC KHAI)"}
              </span>
              <div style={{ marginTop: "6px" }}>
                <MoneyTextBox
                  aria-label={language === "en" ? "Opening balance" : "Số dư đầu kỳ"}
                  value={openingBalance}
                  onChange={setOpeningBalance}
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
                <MoneyTextBox
                  aria-label={language === "en" ? "Closing balance" : "Số dư cuối kỳ"}
                  value={closingBalance}
                  onChange={setClosingBalance}
                  className="input font-mono"
                  style={{ fontSize: "18px", fontWeight: 700, width: "100%" }}
                />
              </div>
              <small style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                {language === "en" ? <><Explain term="actualBalance">Actual balance</Explain> verified from end-of-month statements</> : <><Explain term="actualBalance">Số dư thực tế</Explain> đối chiếu từ sao kê cuối tháng</>}
              </small>
            </Card>

            {amountsValid && <>
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
            </>}
          </div>

          {/* Household Flow & Contribution Insights */}
          {/* Household Flow & Contribution Insights (FE-03) */}
          {amountsValid &&
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
                {language === "en" ? "Plan target" : "Mục tiêu"}: {formatVND(Number(baselineSelection?.monthlyContribution ?? 0))}/{language === "en" ? "mo" : "tháng"}
              </p>
            </Card>
          </div>

          }
          {/* Entries Table */}
          <Card style={{ padding: "var(--space-6)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
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
              <div role="region" aria-label={language === "en" ? "Monthly transactions" : "Bảng giao dịch tháng"} tabIndex={0} style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Date" : "Ngày"}</th>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Flow Type" : "Loại dòng tiền"}</th>
                      <th style={{ padding: "8px 12px", textAlign: "right" }}>{language === "en" ? "Amount (VND)" : "Số tiền (VND)"}</th>
                      <th style={{ padding: "8px 12px" }}>{language === "en" ? "Notes / Description" : "Ghi chú / Giải thích"}</th>
                      <th style={{ padding: "8px 12px", width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => (
                      <tr key={entry.eventId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="date"
                            aria-label={`${language === "en" ? "Transaction date" : "Ngày giao dịch"} ${index + 1}`}
                            value={entry.date}
                            min={`${selectedPeriod}-01`}
                            max={lastPeriodDate}
                            onChange={(e) => handleUpdateEntry(entry.eventId, { date: e.target.value })}
                            className="input font-mono"
                            style={{ height: "32px", fontSize: "12px", width: "135px" }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <select
                            aria-label={`${language === "en" ? "Flow type" : "Loại dòng tiền"} ${index + 1}`}
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
                          <MoneyTextBox
                            aria-label={`${language === "en" ? "Amount" : "Số tiền"} ${index + 1}`}
                            value={entry.amount}
                            allowNegative={["MARKET_CHANGE", "BALANCE_ADJUSTMENT"].includes(entry.kind)}
                            showWords={false}
                            onChange={(val) => handleUpdateEntry(entry.eventId, { amount: val })}
                            className="input font-mono"
                            style={{ height: "32px", fontSize: "12px", width: "140px", textAlign: "right" }}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="text"
                            placeholder={entry.kind === "BALANCE_ADJUSTMENT" ? (language === "en" ? "Required explanation for audit adjustment" : "Bắt buộc giải thích lý do điều chỉnh") : (language === "en" ? "Optional note" : "Ghi chú tuỳ chọn")}
                            aria-label={`${language === "en" ? "Note" : "Ghi chú"} ${index + 1}`}
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
                            label={`${language === "en" ? "Delete row" : "Xóa dòng"} ${index + 1}`}
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
                aria-label={language === "en" ? "Ledger revision reason" : "Lý do cập nhật sổ tháng"}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="input"
                style={{ width: "100%", height: "36px", fontSize: "12px" }}
              />
            </div>
          </Card>

          {/* Reforecast Section */}
          </fieldset>}
          <fieldset disabled={savingActual || candidateBusy || savingV4 || applyingV4} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <Card style={{ padding: "var(--space-6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
              <div>
                <Badge tone="soft">{language === "en" ? "REFORECAST & SOURCES" : "DỰ BÁO LẠI & ĐIỀU CHỈNH NGUỒN"}</Badge>
                <h2>{language === "en" ? "Reforecast from Anchored Balance & Planned Adjustments" : "Cập nhật kế hoạch từ số dư thực tế"}</h2>
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
                  disabled={candidateBusy || savingV4 || applyingV4 || Boolean(loanRevisionDraft)}
                  aria-pressed={reforecastSubTab === "standard"}
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
                  disabled={candidateBusy || savingV4 || applyingV4 || Boolean(loanRevisionDraft)}
                  aria-pressed={reforecastSubTab === "future-changes"}
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
                  disabled={candidateBusy || savingV4 || applyingV4 || Boolean(loanRevisionDraft)}
                  aria-pressed={reforecastSubTab === "sources-v4"}
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
                  {language === "en" ? "Detailed Adjustments" : "Điều chỉnh thu chi & tài sản"} {sourceCommands.length > 0 ? `(${sourceCommands.length})` : ""}
                </button>
              </div>
            </div>

            {/* ========================================================= */}
            {/* SUBTAB 1: STANDARD ANCHOR REFORECAST                      */}
            {/* ========================================================= */}
            {reforecastSubTab === "standard" && (
              <div>
                {loadingPlans ? <p role="status">{language === "en" ? "Loading the official plan…" : "Đang tải kế hoạch chính thức…"}</p>
                  : plansError ? <Alert tone="danger" title={language === "en" ? "Plan load failed" : "Chưa tải được kế hoạch gốc"}>{plansError}<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button></Alert>
                  : (!activePlan?.id || !currentVersion?.id) && <p>{language === "en" ? "An official plan version is required. " : "Cần có phiên bản kế hoạch chính thức. "}<Link to="/user/plan">{language === "en" ? "Open retirement plan" : "Mở kế hoạch hưu trí"}</Link></p>}
                {ledgerDirty && <p>{language === "en" ? "Save the actual ledger before forecasting." : "Lưu sổ thực tế trước khi chạy dự báo."}</p>}

                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                  <Button
                    variant="primary"
                    onClick={handleRunReforecast}
                    loading={reforecasting}
                    disabled={!ledgerReady || ledgerDirty || savingActual || loadingPlans || Boolean(plansError) || !activePlan?.id || !currentVersion?.id}
                  >
                    <Icon name="sparkles" size="small" /> {language === "en" ? "Run Standard Reforecast" : "Tính lại từ số dư đã ghi"}
                  </Button>
                </div>

                {reforecastError && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="danger" title={language === "en" ? "Reforecast Error" : "Lỗi dự báo lại"}>
                      {reforecastError}
                    </Alert>
                  </div>
                )}

                {reforecastResult && <AnchorReforecastResult result={reforecastResult} language={language} onSelectMonth={month => {
                  setSelectedPeriod(month);
                  document.getElementById("actual-period")?.focus();
                }} />}
              </div>
            )}

            {/* ========================================================= */}
            {/* SUBTAB 2: FUTURE CASH FLOW ADJUSTMENTS (P13/P15 & Q15-03)   */}
            {/* ========================================================= */}
            {reforecastSubTab === "future-changes" && (
              <section className="future-cashflows" aria-label={language === "en" ? "Future cash flow adjustments" : "Điều chỉnh dòng tiền tương lai"}>
                <h3>{language === "en" ? "Adjust monthly totals" : "Điều chỉnh tổng tiền từng tháng"}</h3>
                {candidateUsesSources && <Alert tone="info" title={language === "en" ? "Adjust individual sources" : "Kế hoạch cần điều chỉnh theo từng nguồn"}><p>{language === "en" ? "This plan tracks individual sources. Use source adjustments to preserve their schedules and supporting records." : "Kế hoạch này quản lý từng nguồn riêng. Hãy điều chỉnh nguồn để giữ đúng lịch và căn cứ của từng khoản."}</p><Button onClick={() => setReforecastSubTab("sources-v4")}>{language === "en" ? "Open source adjustments" : "Mở điều chỉnh từng nguồn"}</Button></Alert>}
                <p>{language === "en" ? "Each row replaces the selected monthly total; it does not add to it. Add each draft row before previewing. Saving creates a version; applying makes it the official plan." : "Mỗi dòng thay thế tổng tiền của hạng mục trong khoảng tháng đã chọn, không cộng thêm vào số cũ. Thêm dòng vào danh sách trước khi xem trước. Lưu tạo phiên bản mới; áp dụng mới thay đổi kế hoạch chính thức."}</p>
                <fieldset disabled={candidateBusy || candidateUsesSources} className="future-form">
                  <legend>{fcEditingId ? (language === "en" ? "Edit adjustment" : "Sửa điều chỉnh") : (language === "en" ? "New adjustment" : "Điều chỉnh mới")}</legend>
                  <div className="future-grid">
                    <label htmlFor="fc-field">{language === "en" ? "Field to adjust" : "Hạng mục điều chỉnh"}<select id="fc-field" className="input" value={fcField} onChange={e => { setFcField(e.target.value as FutureChangeField); setFcError(""); }}>{(["plannedContribution", "livingExpense", "income", "additionalExpense"] as FutureChangeField[]).map(field => <option key={field} value={field}>{futureFieldLabel(field)}</option>)}</select></label>
                    <label htmlFor="fc-start">{language === "en" ? "Start month" : "Tháng bắt đầu"}<input id="fc-start" className="input" type="month" max={candidateEndMonth} value={fcStartMonth} onChange={e => { setFcStartMonth(e.target.value); setFcError(""); }} /></label>
                    <label htmlFor="fc-end">{language === "en" ? "End month" : "Tháng kết thúc"}<input id="fc-end" className="input" type="month" min={fcStartMonth || undefined} max={candidateEndMonth} value={fcEndMonth} onChange={e => { setFcEndMonth(e.target.value); setFcError(""); }} /></label>
                    <label htmlFor="fc-amount">{language === "en" ? "New monthly amount (VND)" : "Số tiền thay thế mỗi tháng (VND)"}<MoneyTextBox id="fc-amount" className="input" placeholder="5.000.000" value={fcAmount} onChange={v => { setFcAmount(v); setFcError(""); }} /></label>
                  </div>
                  <label htmlFor="fc-reason">{language === "en" ? "Reason (required)" : "Lý do điều chỉnh (bắt buộc)"}<input id="fc-reason" className="input" maxLength={500} value={fcReason} onChange={e => { setFcReason(e.target.value); setFcError(""); }} /></label>
                  <p>{language === "en" ? "Use months after " : "Chọn tháng sau "}{selectedPeriod}{candidateEndMonth ? (language === "en" ? " through " : " đến ") + candidateEndMonth : ""}. {language === "en" ? "Use a dot for decimals, for example 1000000.50; zero is allowed." : "Dùng dấu chấm cho phần lẻ, ví dụ 1000000.50; có thể nhập 0."}</p>
                  {fcError && <Alert tone="danger" title={language === "en" ? "Check adjustment" : "Kiểm tra điều chỉnh"}>{fcError}</Alert>}
                  <div className="future-actions">
                    <Button variant="secondary" onClick={handleAddFutureChange}>{fcEditingId ? (language === "en" ? "Update adjustment" : "Cập nhật điều chỉnh") : (language === "en" ? "Add adjustment" : "Thêm điều chỉnh")}</Button>
                    {(fcEditingId || fcAmount || fcReason) && <Button variant="ghost" onClick={() => { setFcEditingId(null); setFcAmount(""); setFcReason(""); setFcError(""); }}>{language === "en" ? "Discard draft" : "Bỏ nhập dở"}</Button>}
                  </div>
                </fieldset>
                {!futureChanges.length ? <p>{language === "en" ? "No adjustments yet. Add a row to preview." : "Chưa có điều chỉnh. Thêm một dòng để xem trước."}</p> : <div className="anchor-table" tabIndex={0} role="region" aria-label={language === "en" ? "Adjustment list" : "Danh sách điều chỉnh"}>
                  <table><thead><tr>{[language === "en" ? "Field" : "Hạng mục", language === "en" ? "Period" : "Khoảng tháng", language === "en" ? "Replacement amount" : "Số tiền thay thế", language === "en" ? "Reason" : "Lý do", language === "en" ? "Actions" : "Thao tác"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                    <tbody>{futureChanges.map(c => <tr key={c.id}><th scope="row">{futureFieldLabel(c.field)}</th><td>{c.startMonth} → {c.endMonth}</td><td>{futureMoney(c.amount)}</td><td className="future-reason">{c.reason}</td><td><div className="future-actions"><button type="button" className="button button-ghost button-medium" disabled={candidateBusy} aria-label={(language === "en" ? "Edit " : "Sửa ") + futureFieldLabel(c.field) + " " + c.startMonth + " " + c.endMonth} onClick={() => handleEditFutureChange(c)}>{language === "en" ? "Edit" : "Sửa"}</button><button type="button" className="button button-ghost button-medium" disabled={candidateBusy} aria-label={(language === "en" ? "Remove " : "Xóa ") + futureFieldLabel(c.field) + " " + c.startMonth + " " + c.endMonth} onClick={() => handleRemoveFutureChange(c.id)}>{language === "en" ? "Remove" : "Xóa"}</button></div></td></tr>)}</tbody></table>
                </div>}
                {loadingPlans ? <p role="status">{language === "en" ? "Loading plan…" : "Đang tải kế hoạch…"}</p> : plansError ? <Alert tone="danger" title={language === "en" ? "Plan load failed" : "Chưa tải được kế hoạch"}>{plansError}<Button onClick={() => void refreshPlans()}>{language === "en" ? "Retry plans" : "Tải lại kế hoạch"}</Button></Alert> : (!activePlan?.id || !currentVersion?.id) && <p><Link to="/user/plan">{language === "en" ? "Create an official plan before previewing." : "Tạo kế hoạch chính thức trước khi xem trước."}</Link></p>}
                {(!ledgerReady || ledgerDirty || savingActual) && <p>{language === "en" ? "Load and save the actual ledger before previewing." : "Tải và lưu sổ thực tế trước khi xem trước."}</p>}
                {(fcAmount || fcReason || fcEditingId) && <p role="status">{language === "en" ? "Add/update the draft row or discard it before previewing." : "Thêm/cập nhật dòng đang nhập hoặc bỏ nhập dở trước khi xem trước."}</p>}
                {profileRevision <= 0 && <p>{language === "en" ? "A saved financial profile is required." : "Cần có hồ sơ tài chính đã lưu."}</p>}
                <div className="future-actions"><Button variant="primary" onClick={handlePreviewCandidate} loading={previewingCandidate} disabled={!candidateCanPreview || candidateBusy}>{language === "en" ? "Preview adjusted scenario" : "Xem trước kịch bản điều chỉnh"}</Button></div>
                {candidateError && <Alert tone="danger" title={language === "en" ? "Unable to complete" : "Chưa hoàn tất thao tác"}>{candidateError}</Alert>}
                {candidateConflict && <Alert tone="warning" title={language === "en" ? "Data changed" : "Dữ liệu đã thay đổi"}>{language === "en" ? "Review the refreshed plan and preview the adjustments again before saving or applying." : "Kiểm tra kế hoạch vừa tải lại và xem trước lại các điều chỉnh trước khi lưu hoặc áp dụng."}</Alert>}
                {currentCandidate && currentCandidate.status !== "READY" && <Alert tone={currentCandidate.status === "BLOCKED" ? "warning" : "info"} title={currentCandidate.status === "BLOCKED" ? (language === "en" ? "Reforecast blocked" : "Dự báo bị chặn") : (language === "en" ? "Projection period ended" : "Đã hết kỳ dự báo")}>
                  <p>{currentCandidate.status === "BLOCKED" ? (language === "en" ? "Review the actual ledger and adjustment periods, then retry." : "Kiểm tra sổ thực tế và khoảng tháng điều chỉnh, rồi xem trước lại.") : (language === "en" ? "Create a new plan version to continue." : "Tạo phiên bản kế hoạch mới để tiếp tục.")}</p>
                  <ul>{currentCandidate.issues?.map((issue, index) => <li key={index}>{issue.month}: {({ MISSING_MONTH: language === "en" ? "Actual month not recorded" : "Chưa khai báo sổ thực tế", UNRECONCILED_MONTH: language === "en" ? "Unreconciled balance" : "Số dư chưa khớp các khoản tiền vào, ra", OPENING_BALANCE_MISMATCH: language === "en" ? "Opening balance mismatch" : "Số dư đầu kỳ không khớp tháng trước", MONTH_NOT_CLOSED: language === "en" ? "Month has not ended" : "Tháng chưa kết thúc" } as Record<string, string>)[issue.code] ?? ((language === "en" ? "Review month data: " : "Cần kiểm tra dữ liệu tháng: ") + issue.code)}</li>)}</ul>
                  {currentCandidate.status === "HORIZON_COMPLETE" && <Link to="/user/plan">{language === "en" ? "Open plan" : "Mở kế hoạch"}</Link>}
                </Alert>}
                {currentCandidate?.status === "READY" && !candidateComplete && <Alert tone="warning" title={language === "en" ? "Incomplete preview" : "Kết quả xem trước chưa đầy đủ"}>{language === "en" ? "Run preview again before saving." : "Hãy xem trước lại trước khi lưu phiên bản."}</Alert>}
                {candidateComplete && <div className="future-result">
                  <h3>{language === "en" ? "Before and after adjustments" : "So sánh trước và sau điều chỉnh"}</h3>
                  <p>{savedCandidateVersion ? (language === "en" ? "Saved version " : "Đã lưu phiên bản ") + "v" + savedCandidateVersion.version + (language === "en" ? "; not yet applied." : "; chưa áp dụng.") : (language === "en" ? "Preview only; not saved or applied." : "Chỉ là bản xem trước; chưa lưu hoặc áp dụng.")}</p>
                  <div className="future-grid"><div><span>{language === "en" ? "Fund before adjustments" : "Quỹ trước điều chỉnh"}</span><strong>{futureMoney(currentCandidate!.beforeChanges?.summary?.atRetirement?.projectedFund)}</strong></div><div><span>{language === "en" ? "Fund after adjustments" : "Quỹ sau điều chỉnh"}</span><strong>{futureMoney(currentCandidate!.candidate.calculation.summary.atRetirement.projectedFund)}</strong></div><div><span>{language === "en" ? "Revised coverage" : "Tỷ lệ bao phủ mới"}</span><strong>{currentCandidate!.candidate.calculation.summary.atRetirement.coveragePercent == null ? (language === "en" ? "Unknown" : "Chưa xác định") : currentCandidate!.candidate.calculation.summary.atRetirement.coveragePercent + "%"}</strong></div></div>
                  <div className="future-actions"><Button variant="secondary" onClick={handleSaveCandidate} loading={savingCandidate} disabled={candidateBusy || Boolean(savedCandidateVersion)}>{savedCandidateVersion ? (language === "en" ? "Version saved" : "Đã lưu phiên bản") : (language === "en" ? "Save as new version" : "Lưu thành phiên bản mới")}</Button>{savedCandidateVersion && <Button variant="primary" disabled={candidateBusy} onClick={() => setConfirmCandidate(true)}>{language === "en" ? "Apply version " : "Áp dụng bản "}v{savedCandidateVersion.version}</Button>}</div>
                </div>}
                <Modal open={confirmCandidate} title={language === "en" ? "Confirm scenario application" : "Dùng làm kế hoạch hiện tại điều chỉnh"} onClose={() => { if (!candidateWriting.current) setConfirmCandidate(false); }}>
                  <p>{language === "en" ? "This will make the saved version your official retirement plan. Your actual ledger stays unchanged." : "Phiên bản đã lưu sẽ trở thành kế hoạch hưu trí chính thức. Sổ thực tế giữ nguyên."}</p>
                  <p>{language === "en" ? "Version: " : "Phiên bản: "}v{savedCandidateVersion?.version} · {language === "en" ? "Through month: " : "Kỳ đối soát: "}{selectedPeriod}</p>
                  <div className="future-actions"><Button variant="secondary" disabled={applyingCandidate} onClick={() => setConfirmCandidate(false)}>{language === "en" ? "Cancel" : "Hủy"}</Button><Button variant="primary" loading={applyingCandidate} onClick={handleApplyCandidateVersion}>{language === "en" ? "Confirm application" : "Dùng làm kế hoạch hiện tại"}</Button></div>
                </Modal>
              </section>
            )}

            {/* ========================================================= */}
            {/* SUBTAB 3: SOURCE COMMANDS V4 (FE-T16-SOURCE-V4)           */}
            {/* ========================================================= */}
            {reforecastSubTab === "sources-v4" && (
              <div>
                <section className="pension-source" aria-labelledby="pension-source-title" aria-busy={pensionLoading}>
                  <h3 id="pension-source-title">{language === "en" ? "Attach a saved pension estimate" : "Gắn nguồn lương hưu từ kết quả BHXH đã lưu"}</h3>
                  <p>{language === "en" ? "This is a planning estimate. The monthly amount stays fixed; automatic increases and lump-sum benefits are excluded. Attach, preview, save, then apply in separate steps." : "Đây là khoản dự kiến để lập kế hoạch. Giữ nguyên mức hưởng mỗi tháng, không tự tăng theo năm và không cộng trợ cấp một lần vào quỹ. Gắn vào bản nháp, xem trước, lưu rồi áp dụng là các bước riêng."}</p>
                  {pensionLoading ? <p role="status">{language === "en" ? "Loading saved estimates…" : "Đang tải kết quả đã lưu…"}</p>
                    : pensionLoadError ? <Alert tone="danger" title={language === "en" ? "Unable to load estimates" : "Không tải được kết quả BHXH"}>{language === "en" ? "Try loading the list again." : "Thử tải lại danh sách. Chưa thể kết luận bạn không có kết quả đã lưu."}</Alert>
                    : !eligibleEstimates.length ? <p role="status">{language === "en" ? "No eligible saved estimate with a positive monthly pension and start month. Review and save an estimate in the plan's social insurance section, then reload here." : "Chưa có bản lưu đủ điều kiện với mức hưởng lớn hơn 0 và tháng bắt đầu. Mở phần BHXH trong Kế hoạch hưu trí để kiểm tra, lưu kết quả rồi tải lại tại đây."}</p> : null}
                  <Button variant="ghost" disabled={pensionLoading || Boolean(pensionSelections.length)} onClick={() => setPensionReload(value => value + 1)}>{language === "en" ? "Reload pension estimates" : "Tải lại kết quả BHXH"}</Button>
                  {!pensionRegistryReady && <p>{language === "en" ? "Preview once with no commands to load the plan's source list before choosing an estimate." : "Bấm Xem kết quả các thay đổi khi danh sách lệnh còn trống để tải danh mục nguồn của kế hoạch trước khi chọn kết quả."}</p>}
                  <fieldset disabled={pensionLoading || pensionLoadError || !pensionRegistryReady || Boolean(pensionSelections.length)}>
                    <label htmlFor="pension-estimate">{language === "en" ? "Saved pension estimate" : "Kết quả ước tính hợp lệ đã lưu"}</label>
                    <select id="pension-estimate" value={selectedEstimateId} onChange={event => setSelectedEstimateId(event.target.value)}>
                      <option value="">{language === "en" ? "Choose a saved estimate" : "Chọn kết quả đã lưu"}</option>
                      {eligibleEstimates.map(est => <option key={est.id} value={est.id}>{futureMoney(est.assessment.monthlyPension)} · {est.assessment.startMonth} · {est.createdAt.slice(0, 10)} · {est.id.slice(0, 8)}</option>)}
                    </select>
                    {pensionSources.length > 1 && <><label htmlFor="pension-target">{language === "en" ? "Pension source to replace" : "Nguồn lương hưu cần thay thế"}</label><select id="pension-target" value={pensionTargetId} onChange={event => setPensionTargetId(event.target.value)}><option value="">{language === "en" ? "Choose a source" : "Chọn nguồn"}</option>{pensionSources.map(source => <option key={source.sourceId} value={source.sourceId}>{source.sourceId} · r{source.revision}</option>)}</select></>}
                    {selectedPensionEstimate && <div className="pension-estimate-detail">
                      <p><strong>{futureMoney(selectedPensionEstimate.assessment.monthlyPension)}{language === "en" ? "/month" : "/tháng"}</strong> · {language === "en" ? "Benefit starts: " : "Bắt đầu hưởng: "}{selectedPensionEstimate.assessment.startMonth}</p>
                      <p>{language === "en" ? "Estimate: " : "Mã bản lưu: "}{selectedPensionEstimate.id}<br />{language === "en" ? "History revision: " : "Phiên bản lịch đóng: "}{selectedPensionEstimate.historyRevision} · {language === "en" ? "Rule version: " : "Phiên bản bộ luật: "}{selectedPensionEstimate.legalRuleVersion} · {language === "en" ? "Assessed on: " : "Ngày ước tính: "}{selectedPensionEstimate.assessedOn}</p>
                      <p>{pensionTarget ? (language === "en" ? "Replace existing source: " : "Thay thế nguồn đang có: ") + pensionTarget.sourceId + " · r" + pensionTarget.revision : pensionSources.length ? (language === "en" ? "Choose which source to replace." : "Chọn rõ nguồn cần thay thế.") : (language === "en" ? "Create a pension source." : "Tạo một nguồn lương hưu mới.")}</p>
                      <p>{language === "en" ? "Plan period: " : "Kỳ đưa vào kế hoạch: "}<strong>{pensionFrom} → {pensionTo}</strong>. {language === "en" ? "Only future months after reconciliation are included. Earlier actuals stay unchanged." : "Chỉ tính các tháng tương lai sau kỳ đối soát, giữ nguyên số thực tế đã ghi."}</p>
                      {!pensionPeriodValid && <p role="alert">{language === "en" ? "No pension months remain within this plan. Review the estimate or plan period." : "Không còn tháng hưởng lương hưu trong kỳ kế hoạch. Kiểm tra kết quả hoặc kỳ kế hoạch."}</p>}
                      <label className="pension-confirm"><input type="checkbox" checked={pensionConfirmed} onChange={event => setPensionConfirmed(event.target.checked)} />{language === "en" ? "I confirm this estimate, source and fixed monthly amount for the period shown." : "Tôi xác nhận bản ước tính, nguồn và mức hưởng cố định trong kỳ hiển thị."}</label>
                    </div>}
                    <Button variant="secondary" onClick={handleAddPensionSelection} disabled={!selectedPensionEstimate || !pensionConfirmed || !pensionPeriodValid || (pensionSources.length > 0 && !pensionTarget)}>{language === "en" ? "Attach to draft" : "Gắn vào bản nháp"}</Button>
                  </fieldset>
                  {pensionDraft && <div className="future-actions"><p>{language === "en" ? "Attach or discard this selection before previewing." : "Gắn hoặc bỏ lựa chọn đang chọn trước khi xem trước."}</p><Button variant="ghost" onClick={handleRemovePensionSelection}>{language === "en" ? "Discard pension selection" : "Bỏ lựa chọn BHXH"}</Button></div>}
                  {pensionError && <Alert tone="danger" title={language === "en" ? "Review pension source" : "Kiểm tra nguồn lương hưu"}>{pensionError}</Alert>}
                  {pensionSelections.map(selection => <div className="pension-attached" key={selection.commandId} role="status">
                    <p><strong>{language === "en" ? "Attached to draft" : "Đã gắn vào bản nháp"}</strong> · {selection.operation === "REVISE" ? (language === "en" ? "Replace source" : "Thay nguồn") : (language === "en" ? "New source" : "Nguồn mới")} · {selection.effectiveFromMonth} → {selection.effectiveToMonth}</p>
                    <p>{language === "en" ? "Source: " : "Nguồn: "}{selection.sourceId} · r{selection.expectedSourceRevision}</p>
                    <p>{language === "en" ? "To change the estimate, remove this draft attachment first. Removing it does not delete the saved estimate or the current plan's pension." : "Muốn đổi kết quả, bỏ gắn bản nháp trước. Bỏ gắn không xóa bản ước tính đã lưu hoặc lương hưu của kế hoạch hiện tại."}</p>
                    <Button variant="ghost" onClick={handleRemovePensionSelection}>{language === "en" ? "Remove pension attachment" : "Bỏ gắn lương hưu"}</Button>
                  </div>)}
                </section>

                {/* 2. Quản lý lệnh nguồn danh nghĩa (V4) */}
                <div className="source-flow-form" style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "var(--color-primary-800)" }}>
                    {language === "en" ? "Manage cash flow sources" : "Quản lý nguồn thu chi"}
                  </h4>
                  <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {language === "en"
                      ? "Create, revise, or end granular cash flow sources with explicit document verification."
                      : "Thêm, sửa hoặc kết thúc từng nguồn thu chi. Ghi rõ căn cứ hoặc giả định trước khi thêm vào kịch bản."}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
                    <div>
                      <label htmlFor="flow-operation" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Operation" : "Thao tác"}
                      </label>
                      <select id="flow-operation"
                        className="input"
                        value={v4Operation}
                        onChange={(e) => { setV4Operation(e.target.value as "CREATE" | "REVISE" | "END"); setV4Amount(""); setV4FlowError(""); }}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      >
                        <option value="CREATE">{language === "en" ? "Create" : "Tạo mới"}</option>
                        <option value="REVISE">{language === "en" ? "Revise" : "Sửa đổi"}</option>
                        <option value="END">{language === "en" ? "End" : "Kết thúc"}</option>
                      </select>
                    </div>

                    {v4Operation !== "CREATE" && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor="flow-source" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                          {language === "en" ? "Existing Source *" : "Nguồn hiện hữu trong danh mục *"}
                        </label>
                        <select id="flow-source"
                          className="input"
                          value={selectedSourceId}
                          onChange={(e) => setSelectedSourceId(e.target.value)}
                          style={{ width: "100%", height: "34px", fontSize: "12px" }}
                        >
                          {flowSources.length === 0 ? (
                            <option value="">{language === "en" ? "No active sources found (run preview first)" : "Chưa có nguồn nào (vui lòng bấm xem trước)"}</option>
                          ) : (
                            flowSources.map((s) => (
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
                          <label htmlFor="flow-metric" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Metric" : "Loại nguồn"}
                          </label>
                          <select id="flow-metric"
                            className="input"
                            disabled={v4Operation !== "CREATE" && selectedFlowSource?.kind !== "EXPENSE"}
                            value={v4Metric}
                            onChange={(e) => setV4Metric(e.target.value as any)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          >
                            <option disabled={v4Operation !== "CREATE" && selectedFlowSource?.kind !== "INCOME"} value="income">{language === "en" ? "Income" : "Thu nhập"}</option>
                            <option disabled={v4Operation !== "CREATE" && selectedFlowSource?.kind !== "EXPENSE"} value="livingExpense">{language === "en" ? "Living Expense" : "Chi sinh hoạt"}</option>
                            <option disabled={v4Operation !== "CREATE" && selectedFlowSource?.kind !== "EXPENSE"} value="additionalExpense">{language === "en" ? "Additional Expense" : "Chi bổ sung"}</option>
                            <option disabled={v4Operation !== "CREATE" && selectedFlowSource?.kind !== "PENSION"} value="pension">{language === "en" ? "Pension" : "Lương hưu"}</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="flow-frequency" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Frequency" : "Tần suất"}
                          </label>
                          <select id="flow-frequency"
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
                          <label htmlFor="flow-amount" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Amount (VND)" : "Số tiền (VND)"}
                          </label>
                          <MoneyTextBox id="flow-amount"
                            placeholder="VD: 10.000.000"
                            className="input"
                            value={v4Amount}
                            onChange={setV4Amount}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label htmlFor="flow-from" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "From Month" : "Từ tháng"}
                      </label>
                      <input id="flow-from"
                        type="month"
                        className="input"
                        max={flowEndMonth}
                        value={v4FromMonth}
                        onChange={(e) => setV4FromMonth(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>

                    <div>
                      <label htmlFor="flow-to" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "To Month" : "Đến tháng"}
                      </label>
                      <input id="flow-to"
                        type="month"
                        className="input"
                        min={v4FromMonth || undefined} max={flowEndMonth}
                        value={v4ToMonth}
                        onChange={(e) => setV4ToMonth(e.target.value)}
                        style={{ width: "100%", height: "34px", fontSize: "12px" }}
                      />
                    </div>
                  </div>

                {v4Operation !== "CREATE" && <p className="source-flow-note">{language === "en" ? "Revising replaces the future schedule from the start month. Ending stops the source from that month onward; the old schedule does not resume after the end month." : "Sửa đổi thay lịch nguồn từ tháng bắt đầu. Kết thúc dừng nguồn từ tháng đó về sau; lịch cũ không tự chạy lại sau tháng kết thúc."}</p>}
                {v4Operation !== "END" && <label className="source-flow-basis" htmlFor="flow-confirmation">{language === "en" ? "Basis of this amount" : "Cơ sở số tiền"}<select id="flow-confirmation" className="input" value={v4Confirmation} onChange={e => setV4Confirmation(e.target.value as typeof v4Confirmation)}><option value="HYPOTHETICAL">{language === "en" ? "Hypothetical scenario" : "Giả định để lập kịch bản"}</option><option value="USER_CONFIRMED">{language === "en" ? "Confirmed by me from supporting records" : "Tôi đã xác nhận từ hồ sơ"}</option></select></label>}
                  <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <label htmlFor="flow-document" style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                        {language === "en" ? "Supporting information / assumptions *" : "Căn cứ / mô tả giả định *"}
                      </label>
                      <input id="flow-document"
                        type="text"
                        placeholder={language === "en" ? "E.g. Verified contract or salary amendment" : "VD: Hợp đồng lao động hoặc phụ lục nguồn thu"}
                        className="input"
                        maxLength={2000}
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

                {v4FlowError && <Alert tone="danger" title={language === "en" ? "Check source command" : "Kiểm tra lệnh nguồn"}>{v4FlowError}</Alert>}
                {v4FlowDraft && <div className="future-actions"><p>{language === "en" ? "Add this draft command or discard it before previewing." : "Thêm lệnh đang nhập hoặc bỏ nhập dở trước khi xem trước."}</p><Button variant="ghost" onClick={() => { setV4Amount(""); setV4Document(""); setV4FlowError(""); }}>{language === "en" ? "Discard draft" : "Bỏ nhập dở lệnh nguồn"}</Button></div>}
                {sourceCommands.length > 0 && (
                  <div className="source-flow-table" role="region" aria-label={language === "en" ? "Flow command list" : "Danh sách lệnh thu chi"} tabIndex={0} style={{ marginBottom: "16px", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Op" : "Thao tác"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Metric" : "Hạng mục"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Period" : "Khoảng thời gian"}</th>
                          <th style={{ padding: "6px 10px", textAlign: "right" }}>{language === "en" ? "Amount" : "Số tiền"}</th>
                          <th style={{ padding: "6px 10px" }}>{language === "en" ? "Document" : "Chứng từ"}</th>
                          <th style={{ padding: "6px 10px", width: "40px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceCommands.map((c) => (
                          <tr key={c.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "6px 10px" }}><Badge tone="soft">{c.operation}</Badge></td>
                            <td style={{ padding: "6px 10px", fontWeight: 600 }}>{c.operation === "END" ? (language === "en" ? "Stop source" : "Dừng nguồn") : c.metric === "pension" ? (language === "en" ? "Pension" : "Lương hưu") : futureFieldLabel(c.metric as FutureChangeField)}<small style={{ display: "block", overflowWrap: "anywhere" }}>{c.sourceId} · r{c.expectedSourceRevision}</small></td>
                            <td style={{ padding: "6px 10px" }} className="font-mono">{c.effectiveFromMonth} → {c.effectiveToMonth}</td>
                            <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-primary-700)", textAlign: "right" }} className="font-mono">{c.operation === "END" ? (language === "en" ? "Not applicable" : "Không áp dụng") : futureMoney(c.amount)}</td>
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

                <EvidenceEditor key={user?.id} title={language === "en" ? "Evidence for the next loan / asset command" : "Căn cứ cho lệnh vay / tài sản tiếp theo"}
                  value={sourceEvidence} onChange={setSourceEvidence} isVi={language !== "en"} />
                {/* 3. Quản lý điều chỉnh & tạo khoản vay V2 (FE-07) */}
                <div style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "16px", border: "1px solid var(--color-primary-200)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "13px", color: "var(--color-primary-800)" }}>
                        {language === "en" ? "Manage Loans & Debts" : "Thêm hoặc sửa khoản vay"}
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {language === "en"
                          ? "Adjust loan terms, opening balance, liability limits, or register new loans."
                          : "Điều chỉnh nợ, xác nhận số dư ban đầu, giới hạn nghĩa vụ hoặc tạo khoản vay mới."}
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
                        disabled={Boolean(loanRevisionDraft)} onClick={() => setLoanTab("create")}
                      >
                        {language === "en" ? "Create New" : "Tạo khoản vay"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${loanTab === "refinance" ? "button-primary" : "button-ghost"}`}
                        disabled={Boolean(loanRevisionDraft)} onClick={() => setLoanTab("refinance")}
                      >
                        {language === "en" ? "Actual Refinance" : "Tái cấp vốn thực tế"}
                      </button>
                      <button
                        type="button"
                        className={`button button-small ${loanTab === "plannedRefinance" ? "button-primary" : "button-ghost"}`}
                        disabled={Boolean(loanRevisionDraft)} onClick={() => setLoanTab("plannedRefinance")}
                      >
                        {language === "en" ? "Planned Refinance" : "Tái cấp vốn dự kiến"}
                      </button>
                    </div>
                  </div>

                  {loanTab === "revise" ? (
                    <LoanRevisionEditor key={JSON.stringify([user?.id, activePlan?.id, currentVersion?.id, currentVersion?.snapshotHash, profileRevision, selectedPeriod])}
                      planId={activePlan?.id ?? ""}
                      input={{ ...JSON.parse(v4PayloadJson), expectedRevision: Math.max(activePlan?.revision ?? 0, v4LastSavedRevision.current?.planId === activePlan?.id ? v4LastSavedRevision.current?.revision ?? 0 : 0) }}
                      profileDebts={v2Profile?.debts} busy={savingV4 || applyingV4}
                      commands={loanRevisions} onDraftChange={setLoanRevisionDraft}
                      onAdd={command => { if (!v4Writing.current) setLoanRevisions(previous => [...previous, command]); }} />
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
                            <option value="PLANNED_DISBURSEMENT">{language === "en" ? "PLANNED (Future Disbursement)" : "Dự kiến nhận tiền vay sau ngày chốt số liệu"}</option>
                            <option value="EXISTING_BALANCE">{language === "en" ? "EXISTING (Confirmed Balance)" : "Khoản vay hiện hữu chốt cuối kỳ"}</option>
                            <option value="DISBURSED_BALANCE">{language === "en" ? "DISBURSED (Paid Down Principal)" : "Đã giải ngân và trả bớt gốc"}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Principal Amount (VND) *" : "Số tiền gốc vay (VND) *"}
                          </label>
                          <MoneyTextBox
                           
                            placeholder="VD: 200.000.000"
                            className="input"
                            value={lcPrincipal}
                            onChange={setLcPrincipal}
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
                            <MoneyTextBox
                             
                              placeholder="0"
                              className="input"
                              value={lcWithheldFees}
                              onChange={setLcWithheldFees}
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
                              <MoneyTextBox
                               
                                placeholder="0"
                                className="input"
                                value={lcOpeningUserPaid}
                                onChange={setLcOpeningUserPaid}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "flex-end" }}>

                        <Button variant="secondary" onClick={handleAddLoanCreation}>
                          <Icon name="plus" size="small" /> {language === "en" ? "Create Loan" : "Tạo khoản vay mới"}
                        </Button>
                      </div>
                    </div>
                  ) : loanTab === "refinance" ? (
                    <div>
                      {/* Actual Refinance Form */}
                      <div style={{ marginTop: "12px" }}>
                        <label htmlFor="refi-payment-period">{language === "en" ? "Recorded payment month" : "Tháng ghi nhận trả nợ"}</label>
                        <input id="refi-payment-period" type="month" className="input" value={refiLedgerPeriod} max={selectedPeriod}
                          onChange={event => { setRefiPaymentPeriod(event.target.value); setRefiPaymentEventId(""); }} />
                        <label htmlFor="refi-payment-event">{language === "en" ? "Recorded debt payment *" : "Giao dịch trả nợ đã ghi nhận *"}</label>
                        <select id="refi-payment-event" className="input" value={refiPaymentEventId}
                          disabled={refiPaymentsLoading || !refiPaymentOptions.length}
                          onChange={event => setRefiPaymentEventId(event.target.value)}>
                          <option value="">{language === "en" ? "Select a debt payment" : "Chọn giao dịch trả nợ"}</option>
                          {refiPaymentOptions.map(entry => <option key={entry.eventId} value={entry.eventId}>
                            {formatDateVN(entry.date)} · {formatNumberWithDots(Number(entry.amount))} VND{entry.note ? ` · ${entry.note}` : ""}
                          </option>)}
                        </select>
                        {refiPaymentsLoading && <p role="status">{language === "en" ? "Loading recorded payments…" : "Đang tải giao dịch đã ghi nhận…"}</p>}
                        {refiPaymentsError && <p role="alert">{refiPaymentsError}</p>}
                        {!refiPaymentsLoading && !refiPaymentsError && !refiPaymentOptions.length && <p role="status">
                          {language === "en" ? "No eligible debt payment. Record and reconcile the actual month, then reload."
                            : "Chưa có giao dịch trả nợ phù hợp. Hãy ghi nhận, đối soát khớp sổ thực tế rồi tải lại."}
                        </p>}
                        <Button variant="ghost" disabled={refiPaymentsLoading} onClick={() => setRefiPaymentReload(value => value + 1)}>
                          {language === "en" ? "Reload recorded payments" : "Tải lại giao dịch trả nợ"}
                        </Button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "12px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Closing Existing Loan *" : "Khoản vay hiện hữu cần tất toán (END) *"}
                          </label>
                          <select
                            className="input"
                            value={refiClosingSourceId}
                            aria-label={language === "en" ? "Closing loan" : "Khoản vay cần tất toán"}
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
                            aria-label={language === "en" ? "New loan agreement" : "Mã hợp đồng vay mới"}
                            value={refiNewAgreementRef}
                            onChange={(e) => setRefiNewAgreementRef(e.target.value)}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Gross Disbursement (VND) *" : "Tổng tiền giải ngân mới (VND) *"}
                          </label>
                          <MoneyTextBox
                           
                            placeholder="500.000.000"
                            className="input"
                            value={refiGrossDisbursement}
                            onChange={setRefiGrossDisbursement}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Withheld Fees (VND)" : "Phí giữ lại khi giải ngân (VND)"}
                          </label>
                          <MoneyTextBox
                           
                            placeholder="0"
                            className="input"
                            value={refiWithheldFees}
                            onChange={setRefiWithheldFees}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "External Top-Up (VND)" : "Tiền tự bù thêm (VND)"}
                          </label>
                          <MoneyTextBox
                           
                            placeholder="0"
                            className="input"
                            value={refiExternalTopUp}
                            onChange={setRefiExternalTopUp}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Unused Proceeds (VND)" : "Tiền giải ngân còn dư (VND)"}
                          </label>
                          <MoneyTextBox
                           
                            placeholder="0"
                            className="input"
                            value={refiUnusedProceeds}
                            onChange={setRefiUnusedProceeds}
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
                            aria-label={language === "en" ? "Settlement date from payment" : "Ngày tất toán theo giao dịch"}
                            value={refiPayment?.date || ""}
                            readOnly
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
                              <MoneyTextBox
                               
                                placeholder="495.000.000"
                                className="input"
                                value={refiAvailableAmount}
                                onChange={setRefiAvailableAmount}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Used Before Settlement (VND)" : "Tiền đã sử dụng trước tất toán (VND)"}
                              </label>
                              <MoneyTextBox
                               
                                placeholder="0"
                                className="input"
                                value={refiUsedAmount}
                                onChange={setRefiUsedAmount}
                                style={{ width: "100%", height: "32px", fontSize: "12px" }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                        <Button variant="secondary" onClick={handleAddRefinance} disabled={refiPaymentsLoading || !refiPayment || !!refiPaymentsError}>
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
                              <MoneyTextBox
                               
                                placeholder="300.000.000"
                                className="input"
                                value={prQuotePrincipal}
                                onChange={setPrQuotePrincipal}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Payoff Interest Quote (VND)" : "Báo giá lãi tất toán (VND)"}
                              </label>
                              <MoneyTextBox
                               
                                placeholder="5.000.000"
                                className="input"
                                value={prQuoteInterest}
                                onChange={setPrQuoteInterest}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "Prepayment Fee (VND)" : "Phí trả nợ trước hạn (VND)"}
                              </label>
                              <MoneyTextBox
                               
                                placeholder="1.000.000"
                                className="input"
                                value={prQuotePrepaymentFee}
                                onChange={setPrQuotePrepaymentFee}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "New Loan Principal (VND) *" : "Dư nợ khoản vay mới (VND) *"}
                              </label>
                              <MoneyTextBox
                               
                                placeholder="300.000.000"
                                className="input"
                                value={prNewGross}
                                onChange={setPrNewGross}
                                style={{ width: "100%", height: "34px", fontSize: "12px" }}
                              />
                            </div>

                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                                {language === "en" ? "User Top-Up Amount (VND)" : "Tiền người dùng tự bù (VND)"}
                              </label>
                              <MoneyTextBox
                               
                                placeholder="6.000.000"
                                className="input"
                                value={prUserTopUp}
                                onChange={setPrUserTopUp}
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
                    <div className="loan-command-table" role="region" aria-label="Danh sách lệnh khoản vay" tabIndex={0} style={{ marginTop: "16px", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1.5px solid var(--color-border)", textAlign: "left", color: "var(--color-text-muted)" }}>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Type" : "Loại lệnh"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Reference / Source ID" : "Mã nguồn / Hợp đồng"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Mode" : "Chế độ"}</th>
                            <th style={{ padding: "6px 10px", textAlign: "right" }}>{language === "en" ? "Principal Balance" : "Dư nợ gốc"}</th>
                            <th style={{ padding: "6px 10px" }}>{language === "en" ? "Maturity" : "Đáo hạn"}</th>
                            <th style={{ padding: "6px 10px", width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {loanRevisions.map((lr) => (
                            <tr key={lr.commandId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 10px" }}><Badge tone={lr.operation === "END" ? "danger" : "soft"}>{lr.operation === "END" ? "Kết thúc" : "Sửa đổi"}</Badge></td>
                              <td style={{ padding: "6px 10px", fontWeight: 600 }} className="font-mono">{lr.sourceId} · r{lr.expectedSourceRevision}<small style={{ display: "block" }}>{lr.allocations.length} phân bổ trả nợ · {lr.principalAdvances.length} khoản giải ngân bổ sung</small>{lr.responsibilityAmendment && <small style={{ display: "block", whiteSpace: "normal" }}>Thay trách nhiệm từ {lr.responsibilityAmendment.effectiveOn}: {lr.contract.responsibility.kind === "CAPPED" ? "trần " + futureMoney(lr.contract.responsibility.limit) : "theo tỷ lệ, không trần"}; tổng đã trả {futureMoney(lr.contract.userPaidToDate!)}</small>}</td>
                              <td style={{ padding: "6px 10px" }}>{({ REDUCE_PAYMENT_KEEP_TERM: "Giữ thời hạn", REDUCE_TERM_KEEP_PAYMENT: "Giữ tiền góp", BANK_SCHEDULE: "Lịch ngân hàng", RESTRUCTURED: "Cơ cấu lại" })[lr.contract.mode]}</td>
                              <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--color-danger-700)", textAlign: "right" }} className="font-mono">
                                {futureMoney(lr.contract.principalBalance)}
                              </td>
                              <td style={{ padding: "6px 10px" }} className="font-mono">{lr.contract.maturityDate}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <IconButton icon="trash" label={"Xóa lệnh khoản vay " + lr.sourceId} onClick={() => handleRemoveLoanRevision(lr.sourceId)} />
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
                        {language === "en" ? "Asset & Capital Management" : "Tiền từ tài sản đưa vào quỹ hưu trí"}
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {language === "en"
                          ? "Asset sale, liquid capital, single or staged contribution, rental exit."
                          : "Bán tài sản, vốn thanh khoản, góp một lần hoặc nhiều đợt, ngừng cho thuê để bán."}
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
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }} htmlFor="asset-source">
                            {language === "en" ? "Select Asset to Terminate *" : "Chọn tài sản cần dừng *"}
                          </label>
                          <select id="asset-source"
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
                            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }} htmlFor="asset-source">
                              {language === "en" ? "Select Asset from Options *" : "Chọn tài sản từ danh mục *"}
                            </label>
                            <select id="asset-source"
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
                          <MoneyTextBox
                           
                            className="input"
                            value={assetGrossAmount}
                            onChange={setAssetGrossAmount}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Fees (VND)" : "Phí chuyển nhượng"}
                          </label>
                          <MoneyTextBox
                           
                            className="input"
                            value={assetFees}
                            onChange={setAssetFees}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Taxes (VND)" : "Thuế phải nộp"}
                          </label>
                          <MoneyTextBox
                           
                            className="input"
                            value={assetTaxes}
                            onChange={setAssetTaxes}
                            style={{ width: "100%", height: "34px", fontSize: "12px" }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: 600, marginBottom: "4px" }}>
                            {language === "en" ? "Secured Debt Settlement" : "Tất toán nợ bảo đảm"}
                          </label>
                          <MoneyTextBox
                           
                            className="input"
                            value={assetSecuredDebt}
                            onChange={setAssetSecuredDebt}
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
                          <MoneyTextBox
                           
                            className="input"
                            value={assetConfirmedContribution}
                            onChange={setAssetConfirmedContribution}
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
                              <MoneyTextBox showWords={false}
                               
                                className="input"
                                value={stagedInstallmentAmount}
                                onChange={setStagedInstallmentAmount}
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
                              <MoneyTextBox showWords={false}
                               
                                className="input"
                                value={stagedReleaseAmount}
                                onChange={setStagedReleaseAmount}
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
                                <MoneyTextBox
                                 
                                  className="input"
                                  value={assetFinalMonthIncome}
                                  onChange={setAssetFinalMonthIncome}
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
                              <div role="status" style={{ gridColumn: "1 / -1" }}>
                                {assetActualLoading ? "Đang tải sổ tháng đã lưu…" : assetActualError || (assetActualLedger ? `Sổ ${assetActualLedger.period}, phiên bản ${assetActualLedger.revision}: ${assetActualLedger.reconciliation === "MATCHED" ? "đã đối soát" : "chưa đối soát khớp"}` : "Chưa có sổ tháng đã lưu.")}
                                <Button variant="secondary" size="small" onClick={() => setAssetActualReload(value => value + 1)}>Tải lại sổ tháng</Button>
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }} htmlFor="asset-missed-month">
                                  {language === "en" ? "Scheduled Month *" : "Tháng đã lỡ hẹn *"}
                                </label>
                                <input id="asset-missed-month"
                                  type="month"
                                  className="input"
                                  value={assetMissedScheduledMonth}
                                  onChange={(e) => setAssetMissedScheduledMonth(e.target.value)}
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }} htmlFor="asset-missed-amount">
                                  {language === "en" ? "Amount Not Contributed *" : "Số tiền chưa góp *"}
                                </label>
                                <MoneyTextBox id="asset-missed-amount"
                                  className="input"
                                  value={assetMissedAmount}
                                  onChange={setAssetMissedAmount}
                                  style={{ width: "100%", height: "30px", fontSize: "11px" }}
                                />
                              </div>
                              <div style={{ gridColumn: "span 2" }}>
                                <label style={{ display: "block", fontSize: "10px", fontWeight: 600, marginBottom: "2px" }} htmlFor="asset-missed-reason">
                                  {language === "en" ? "Reason *" : "Lý do chưa góp *"}
                                </label>
                                <input id="asset-missed-reason"
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

                {v4Candidate && !currentV4Preview && !previewingV4 && <p role="status">
                  {language === "en" ? "Preview again before saving this command list." : "Cần xem trước lại danh sách lệnh trước khi lưu."}
                </p>}
                {currentV4Preview && !v4Ready && <Alert tone="warning" title={language === "en" ? "Preview is not ready to save" : "Chưa đủ kết quả để lưu"}>{currentV4Preview.response.issues?.length ? <ul>{currentV4Preview.response.issues.map((issue, index) => <li key={index}>{issue.month} {issue.message || issue.code}</li>)}</ul> : (language === "en" ? "The forecast period ended or the calculation is incomplete. Review the plan and preview again." : "Kỳ dự báo đã hết hoặc kết quả tính chưa đầy đủ. Kiểm tra kế hoạch và xem trước lại.")}</Alert>}
                {v4Ready && <div className="source-preview-summary"><h3>{language === "en" ? "Source scenario result" : "Kết quả kịch bản nguồn"}</h3><p>{savedV4Version ? (language === "en" ? "Saved, not yet applied." : "Đã lưu, chưa áp dụng.") : (language === "en" ? "Preview only, not saved or applied." : "Bản xem trước, chưa lưu hoặc áp dụng.")}</p><p>{language === "en" ? "Projected retirement fund: " : "Quỹ dự kiến khi nghỉ hưu: "}<strong>{futureMoney(currentV4Preview!.response.candidate.calculation.summary.atRetirement.projectedFund)}</strong></p><p>{language === "en" ? "Coverage: " : "Tỷ lệ bao phủ: "}<strong>{currentV4Preview!.response.candidate.calculation.summary.atRetirement.coveragePercent == null ? (language === "en" ? "Unknown" : "Chưa xác định") : currentV4Preview!.response.candidate.calculation.summary.atRetirement.coveragePercent + "%"}</strong></p></div>}
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                  <Button
                    variant="primary"
                    onClick={handlePreviewV4}
                    loading={previewingV4}
                    disabled={!activePlan?.id || !currentVersion?.id || savingV4 || applyingV4 || v4FlowDraft || pensionDraft || Boolean(loanRevisionDraft)}
                  >
                    <Icon name="sparkles" size="small" /> {language === "en" ? "Preview Adjustments" : "Xem kết quả các thay đổi"}
                  </Button>
                  {v4Ready && currentV4Preview && (
                    <Button
                      variant="secondary"
                      onClick={handleSaveV4}
                      loading={savingV4}
                      disabled={!currentV4Preview.response.inputHash || previewingV4 || Boolean(savedV4Version) || applyingV4 || v4FlowDraft || pensionDraft || Boolean(loanRevisionDraft)}
                    >
                      <Icon name="check" size="small" /> {language === "en" ? "Save Plan Proposal" : "Lưu phương án này"}
                    </Button>
                  )}
                  {savedV4Version && currentV4Preview && (
                    <Button
                      variant="primary"
                      onClick={() => setConfirmV4Apply(true)}
                      loading={applyingV4}
                    >
                      <Icon name="compass" size="small" /> {language === "en" ? `Apply v${savedV4Version.version}` : `Áp dụng bản v${savedV4Version.version}`}
                    </Button>
                  )}
                </div>

                {v4Error && (
                  <div style={{ marginTop: "16px" }}>
                    <Alert tone="danger" title={language === "en" ? "Adjustment Error" : "Chưa cập nhật được khoản thu, chi hoặc tài sản"}>{v4Error}</Alert>
                  </div>
                )}
                {v4Conflict && <Alert tone="warning" title={language === "en" ? "Source data changed" : "Dữ liệu nguồn đã thay đổi"}>{language === "en" ? "Review the refreshed plan and preview again before saving or applying." : "Kiểm tra kế hoạch vừa tải lại và xem trước lại trước khi lưu hoặc áp dụng."}</Alert>}
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
          </fieldset>
        </div>
      <Modal open={confirmV4Apply} title={language === "en" ? "Apply saved source version?" : "Áp dụng phiên bản nguồn đã lưu?"} onClose={() => { if (!v4Writing.current) setConfirmV4Apply(false); }}>
        <p>{language === "en" ? "This saved version will become the official plan. Your actual ledger stays unchanged." : "Phiên bản đã lưu sẽ trở thành kế hoạch chính thức. Sổ thực tế giữ nguyên."}</p>
        <p>{language === "en" ? "Version " : "Phiên bản "}v{savedV4Version?.version} · {selectedPeriod}</p>
        <div className="future-actions"><Button variant="secondary" disabled={applyingV4} onClick={() => setConfirmV4Apply(false)}>{language === "en" ? "Cancel" : "Hủy"}</Button><Button loading={applyingV4} onClick={handleApplyV4Version}>{language === "en" ? "Confirm application" : "Dùng làm kế hoạch hiện tại nguồn"}</Button></div>
      </Modal>
    </>
  );
}
