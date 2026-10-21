import { useEffect, useState, useRef, useId } from "react";
import MoneyTextBox from "./MoneyTextBox";
import { Alert, Badge, Button, Icon, IconButton, Modal, useNotification } from "./ui";
import "./retirement/plan-dialogs.css";
import { useAuth } from "../context/AuthContext";
import {
  getLatestInsuranceHistory,
  previewInsuranceHistoryImport,
  saveInsuranceHistory,
  getPublishedLegalRules,
  listPensionEstimates,
  previewPensionEstimate,
  savePensionEstimate,
  computeContentHash,
  type InsuranceHistoryRecord,
  type InsuranceContributionMonth,
  type InsuranceSpecialPeriod,
  type PublishedLegalRuleSet,
  type PensionEstimatePreviewResult,
  type PensionEstimateRecord,
  type InsuranceHistoryDocument,
  type HistoryPreviewResponse,
  type PensionEstimateInput,
} from "../services/insurance";

import { EvidenceEditor, emptyEvidence, submittedEvidence, type EvidenceDraft } from "./EvidenceEditor";
import { formatDateVN } from "../utils/date";

const formatVND = (num: number) => {
  const rounded = Math.round(num);
  const isNeg = rounded < 0;
  return `${isNeg ? "-" : ""}${Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
};

interface SocialInsuranceModalProps {
  open: boolean;
  onClose: () => void;
  language?: "vi" | "en";
  initialBenefitDate?: string;
}

export function SocialInsuranceModal({
  open,
  onClose,
  language = "vi",
  initialBenefitDate,
}: SocialInsuranceModalProps) {
  const formId = useId();
  const isVi = language === "vi";
  const { notify } = useNotification();
  const { user } = useAuth();

  // Active Tab: "history" (Lịch sử đóng BHXH) vs "estimate" (Ước tính lương hưu) vs "records" (Bản lưu)
  const [activeTab, setActiveTab] = useState<"history" | "estimate" | "records">("estimate");

  // ==========================================
  // TAB 2: HISTORY STATE
  // ==========================================
  const [historyRecord, setHistoryRecord] = useState<InsuranceHistoryRecord | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [historyMonths, setHistoryMonths] = useState<InsuranceContributionMonth[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<InsuranceSpecialPeriod[]>([]);
  const [savingHistory, setSavingHistory] = useState(false);
  const [previewingHistory, setPreviewingHistory] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<HistoryPreviewResponse | null>(null);
  const [previewedDoc, setPreviewedDoc] = useState<InsuranceHistoryDocument | null>(null);
  const [incompleteConfirmed, setIncompleteConfirmed] = useState(false);
  const [historySaveIdempotencyKey, setHistorySaveIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // Personal demographics in history document
  const [birthPrecision, setBirthPrecision] = useState<"DAY" | "MONTH" | "YEAR" | "UNKNOWN">("UNKNOWN");
  const [birthDeclaredValue, setBirthDeclaredValue] = useState<string>("");
  const [legalSex, setLegalSex] = useState<"MALE" | "FEMALE" | "UNKNOWN">("UNKNOWN");
  const [coverageFrom, setCoverageFrom] = useState<string>("");
  const [coverageThrough, setCoverageThrough] = useState<string>("");
  const [confirmedThroughMonth, setConfirmedThroughMonth] = useState<string>("");

  // New month item input
  const [newMonth, setNewMonth] = useState("");
  const [newScheme, setNewScheme] = useState<"COMPULSORY" | "VOLUNTARY" | "UNKNOWN">("COMPULSORY");
  const [newSalaryRegime, setNewSalaryRegime] = useState<"EMPLOYER" | "STATE" | "VOLUNTARY_INCOME" | "UNKNOWN">("EMPLOYER");
  const [newStatus, setNewStatus] = useState<"PAID" | "CREDITED" | "UNKNOWN" | "WITHDRAWN" | "NOT_CONTRIBUTED">("PAID");
  const [newParticipantCategory, setNewParticipantCategory] = useState<string>("");
  const [newCreditKind, setNewCreditKind] = useState<string>("");
  const [newBase, setNewBase] = useState("");
  const [newCoefficient, setNewCoefficient] = useState("");
  const [duplicateMonthWarning, setDuplicateMonthWarning] = useState<string | null>(null);

  // ==========================================
  // TAB 1: ESTIMATES STATE
  // ==========================================
  const [publishedRules, setPublishedRules] = useState<PublishedLegalRuleSet[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [intendedBenefitDate, setIntendedBenefitDate] = useState<string>(() => {
    if (initialBenefitDate && /^\d{4}-\d{2}-\d{2}$/.test(initialBenefitDate)) return initialBenefitDate;
    if (initialBenefitDate && /^\d{4}-\d{2}$/.test(initialBenefitDate)) return `${initialBenefitDate}-01`;
    return "";
  });
  const [employmentEndDate, setEmploymentEndDate] = useState<string>("");
  const [contributionStopMonth, setContributionStopMonth] = useState<string>("");
  const [estimateMode, setEstimateMode] = useState<"ordinary" | "state" | "voluntary" | "topUp" | "prepaid">("ordinary");

  // Mode inputs & Evidence
  const [ordinaryParticipation, setOrdinaryParticipation] = useState<"ACTIVE_COMPULSORY" | "PRESERVED">("ACTIVE_COMPULSORY");
  const [ordinaryStartKind, setOrdinaryStartKind] = useState<"PERSON_REQUEST" | "EMPLOYER_NOTICE" | "HYPOTHETICAL">("HYPOTHETICAL");

  // State salary inputs
  const [firstParticipationMonth, setFirstParticipationMonth] = useState<string>("");
  const [salaryTreatment, setSalaryTreatment] = useState<"ORDINARY" | "HAZARDOUS_TRANSFER" | "MILITARY_TRANSFER" | "SENIORITY_ALLOWANCE_TRANSFER" | "UNKNOWN">("ORDINARY");
  const [transferMonth, setTransferMonth] = useState<string>("");

  // Voluntary inputs
  const [voluntaryAgeRule, setVoluntaryAgeRule] = useState<"NORMAL" | "LAW_ART141_9">("NORMAL");
  const [voluntaryStartKind, setVoluntaryStartKind] = useState<"ELIGIBILITY" | "CONTINUED_CONTRIBUTIONS" | "TRANSITION_2025">("ELIGIBILITY");
  const [voluntaryConfirmation, setVoluntaryConfirmation] = useState<"DOCUMENTED" | "HYPOTHETICAL">("HYPOTHETICAL");

  // TopUp & Prepaid inputs
  const [topUpMonths, setTopUpMonths] = useState<number>(12);
  const [topUpIncome, setTopUpIncome] = useState<string>("");
  const [topUpConfirmation, setTopUpConfirmation] = useState<"DOCUMENTED_FULLY_PAID" | "HYPOTHETICAL">("HYPOTHETICAL");

  const [prepaidPeriodMonths, setPrepaidPeriodMonths] = useState<3 | 6 | 12 | 24 | 36 | 48 | 60>(12);
  const [prepaidIncome, setPrepaidIncome] = useState<string>("");
  const [prepaidConfirmation, setPrepaidConfirmation] = useState<"DOCUMENTED_FULLY_PAID" | "HYPOTHETICAL">("HYPOTHETICAL");

  const [benefitRequestDate, setBenefitRequestDate] = useState("");
  const [paymentOn, setPaymentOn] = useState("");
  const [registeredOn, setRegisteredOn] = useState("");
  const [periodStartMonth, setPeriodStartMonth] = useState("");
  const [requestConfirmation, setRequestConfirmation] = useState<"DOCUMENTED" | "HYPOTHETICAL">("HYPOTHETICAL");
  const [hazardousPeriods, setHazardousPeriods] = useState<Array<{ fromMonth: string; toMonth: string }>>([]);
  const [hazardousWindowFrom, setHazardousWindowFrom] = useState("");
  const [newPre2004Scale, setNewPre2004Scale] = useState<"" | "ND204_PUBLIC" | "ND204_ARMED_FORCES" | "ND205_ENTERPRISE">("");
  const [newSeniority, setNewSeniority] = useState<"" | "YES" | "NO">("");
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, EvidenceDraft>>({});
  const evidence = (key: string) => evidenceDrafts[key] ?? emptyEvidence();
  const editEvidence = (key: string, title: string) => <EvidenceEditor key={`${user?.id}:${key}`} title={title} isVi={isVi}
    value={evidence(key)} onChange={value => setEvidenceDrafts(previous => ({ ...previous, [key]: value }))} />;
  const [formError, setFormError] = useState("");
  const [saveError, setSaveError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (formError || saveError) errorRef.current?.focus(); }, [formError, saveError]);
  useEffect(() => { setSaveError(""); }, [open, user?.id]);

  // Estimate preview & results
  const [previewingEstimate, setPreviewingEstimate] = useState(false);
  const [estimateResult, setEstimateResult] = useState<PensionEstimatePreviewResult | null>(null);
  const estimateResultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!estimateResult) return;
    estimateResultRef.current?.scrollIntoView({ block: "start" });
    estimateResultRef.current?.focus({ preventScroll: true });
  }, [estimateResult]);
  const [lastPreviewInput, setLastPreviewInput] = useState<PensionEstimateInput | null>(null);
  const [estimateSaveIdempotencyKey, setEstimateSaveIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [savedEstimates, setSavedEstimates] = useState<PensionEstimateRecord[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [rulesAttempt, setRulesAttempt] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [recordsAttempt, setRecordsAttempt] = useState(0);
  const [savedEstimateHash, setSavedEstimateHash] = useState<string | null>(null);
  const saving = useRef(false);
  const unknown = isVi ? "Chưa xác định" : "Undetermined";

  const currentYearMonth = new Date().toISOString().slice(0, 7);
  const todayDate = new Date().toISOString().slice(0, 10);

  // Reset all state when user account changes to prevent state leakage
  useEffect(() => {
    setTopUpConfirmation("HYPOTHETICAL"); setPrepaidConfirmation("HYPOTHETICAL");
    setVoluntaryConfirmation("HYPOTHETICAL"); setRequestConfirmation("HYPOTHETICAL");
    setOrdinaryStartKind("HYPOTHETICAL"); setSalaryTreatment("ORDINARY");
    setEvidenceDrafts({}); setFormError(""); setFirstParticipationMonth("");
    setEmploymentEndDate(""); setContributionStopMonth(""); setBenefitRequestDate("");
    setPaymentOn(""); setRegisteredOn(""); setPeriodStartMonth(""); setTransferMonth("");
    setHazardousPeriods([]); setHazardousWindowFrom(""); setNewMonth(""); setNewBase("");
    setNewCoefficient(""); setNewPre2004Scale(""); setNewSeniority(""); setNewCreditKind("");
    setTopUpIncome(""); setPrepaidIncome(""); setSelectedRuleId(""); setPublishedRules([]);
    setHistoryRecord(null);
    setHistoryMonths([]);
    setSpecialPeriods([]);
    setBirthPrecision("UNKNOWN");
    setBirthDeclaredValue("");
    setLegalSex("UNKNOWN");
    setCoverageFrom("");
    setCoverageThrough("");
    setConfirmedThroughMonth("");
    setHistoryPreview(null);
    setPreviewedDoc(null);
    setIncompleteConfirmed(false);
    setEstimateResult(null);
    setLastPreviewInput(null);
    setSavedEstimates([]);
  }, [user?.id]);

  const historyFetchRequest = useRef(0);
  // Load history independently of intendedBenefitDate
  const fetchHistory = () => {
    if (!open) return;
    const request = ++historyFetchRequest.current;
    setLoadingHistory(true);
    setHistoryLoadError(null);
    getLatestInsuranceHistory()
      .then((rec) => {
        if (request !== historyFetchRequest.current) return;
        setHistoryRecord(rec);
        if (rec?.document) {
          setHistoryMonths(rec.document.months || []);
          setSpecialPeriods(rec.document.specialPeriods || []);
          setBirthPrecision(rec.document.birth.precision || "UNKNOWN");
          setBirthDeclaredValue(rec.document.birth.declaredValue || "");
          setLegalSex(rec.document.legalSex || "UNKNOWN");
          setCoverageFrom(rec.document.coverageFrom || "");
          setCoverageThrough(rec.document.coverageThrough || "");
          setConfirmedThroughMonth(rec.document.confirmedThroughMonth || "");
        } else {
          setHistoryMonths([]); setSpecialPeriods([]); setBirthPrecision("UNKNOWN");
          setBirthDeclaredValue(""); setLegalSex("UNKNOWN"); setCoverageFrom("");
          setCoverageThrough(""); setConfirmedThroughMonth("");
        }
      })
      .catch((err) => {
        if (request !== historyFetchRequest.current) return;
        const msg = err instanceof Error ? err.message : "Không thể tải lịch sử BHXH";
        setHistoryLoadError(msg);
      })
      .finally(() => {
        if (request === historyFetchRequest.current) setLoadingHistory(false);
      });
  };

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
    return () => { ++historyFetchRequest.current; };
  }, [open, user?.id]);

  // Load published rules when intendedBenefitDate changes
  useEffect(() => {
    if (!open || !intendedBenefitDate) {
      setLoadingRules(false); setRulesError("");
      setPublishedRules([]);
      setSelectedRuleId("");
      return;
    }

    let cancelled = false;
    setLoadingRules(true); setRulesError("");
    setPublishedRules([]); setSelectedRuleId("");
    getPublishedLegalRules(intendedBenefitDate)
      .then((res) => {
        if (cancelled) return;
        const rules = res?.items || [];
        setPublishedRules(rules);
        if (rules.length > 0) {
          setSelectedRuleId(rules[0].id);
        } else {
          setSelectedRuleId("");
        }
      })
      .catch(error => {
        if (cancelled) return;
        setRulesError(error instanceof Error ? error.message : String(error));
        setPublishedRules([]);
        setSelectedRuleId("");
      }).finally(() => { if (!cancelled) setLoadingRules(false); });
    return () => { cancelled = true; };
  }, [open, intendedBenefitDate, user?.id, rulesAttempt]);

  // Load saved estimate records
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRecords(true); setRecordsError("");
    setSavedEstimates([]);
    listPensionEstimates()
      .then((res) => {
        if (!cancelled) setSavedEstimates(res?.items || []);
      })
      .catch(error => { if (!cancelled) setRecordsError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setLoadingRecords(false); });
    return () => { cancelled = true; };
  }, [open, user?.id, recordsAttempt]);

  const estimateInputKey = JSON.stringify([open, user?.id, historyRecord?.id, historyRecord?.revision,
    intendedBenefitDate, selectedRuleId, estimateMode, employmentEndDate, contributionStopMonth,
    benefitRequestDate, ordinaryParticipation, ordinaryStartKind, salaryTreatment, firstParticipationMonth,
    transferMonth, hazardousPeriods, hazardousWindowFrom, voluntaryAgeRule, voluntaryStartKind, voluntaryConfirmation,
    topUpMonths, topUpIncome, topUpConfirmation, prepaidPeriodMonths, prepaidIncome, prepaidConfirmation,
    paymentOn, registeredOn, periodStartMonth, requestConfirmation, evidenceDrafts]);
  const latestEstimateInput = useRef(estimateInputKey);
  latestEstimateInput.current = estimateInputKey;
  const estimateRequest = useRef(0);
  useEffect(() => {
    ++estimateRequest.current;
    setPreviewingEstimate(false);
    setEstimateResult(null);
    setLastPreviewInput(null);
    setSavedEstimateHash(null);
    setEstimateSaveIdempotencyKey(crypto.randomUUID());
  }, [estimateInputKey]);

  const historyInputKey = JSON.stringify([open, user?.id, historyRecord?.revision, historyMonths, specialPeriods,
    birthPrecision, birthDeclaredValue, legalSex, coverageFrom, coverageThrough, confirmedThroughMonth]);
  const latestHistoryInput = useRef(historyInputKey);
  latestHistoryInput.current = historyInputKey;
  const historyPreviewRequest = useRef(0);
  // Ignore responses for an older draft, account or modal session.
  useEffect(() => {
    ++historyPreviewRequest.current;
    setPreviewingHistory(false);
    setHistoryPreview(null);
    setPreviewedDoc(null);
    setIncompleteConfirmed(false);
    setHistorySaveIdempotencyKey(crypto.randomUUID());
  }, [historyInputKey]);

  // Auto-suggest coverage range when months change if not set
  const updateCoverageSuggestions = (months: InsuranceContributionMonth[]) => {
    if (months.length === 0) return;
    const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
    const firstMonth = sorted[0].month;
    const lastMonth = sorted[sorted.length - 1].month;
    if (!coverageFrom) setCoverageFrom(firstMonth);
    if (!coverageThrough) setCoverageThrough(lastMonth);
    if (!confirmedThroughMonth) {
      setConfirmedThroughMonth(lastMonth > currentYearMonth ? currentYearMonth : lastMonth);
    }
  };

  const newMonthKey = JSON.stringify([user?.id, open, newMonth, newScheme, newSalaryRegime, newStatus, newBase,
    newCoefficient, newParticipantCategory, newCreditKind, newPre2004Scale, newSeniority, evidenceDrafts.history]);
  const latestNewMonth = useRef(newMonthKey); latestNewMonth.current = newMonthKey;
  useEffect(() => { setDuplicateMonthWarning(null); }, [newMonthKey]);
  // Handle Add Month to History
  const handleAddMonth = async (forceReplace: boolean = false) => {
    if (!newMonth || !/^\d{4}-\d{2}$/.test(newMonth)) {
      notify.error(isVi ? "Tháng không hợp lệ" : "Invalid Month", isVi ? "Vui lòng chọn định dạng YYYY-MM." : "Please select YYYY-MM format.");
      return;
    }

    if (!forceReplace && historyMonths.some((m) => m.month === newMonth)) {
      setDuplicateMonthWarning(newMonth);
      return;
    }

    setFormError("");
    try {
    const draft = evidence("history");
    const hasEvidence = Boolean(draft.reference || draft.content || draft.contentHash || draft.confirmedOn);
    const monthEvidence = hasEvidence ? await submittedEvidence(draft) : [];
    if (newBase.trim() && !/^\d+(\.\d{1,2})?$/.test(newBase.trim())) throw new Error("Căn cứ đóng cần là số không âm, tối đa 2 chữ số thập phân.");
    if (newStatus === "CREDITED" && !monthEvidence.length) throw new Error("Tháng được tính đóng cần căn cứ xác nhận.");
    const maternityKind = newMonth >= "2025-07" ? "MATERNITY_ART53_8" : newMonth >= "2016-01" ? "MATERNITY_LAW2014_ART39_2" : newMonth >= "2007-01" ? "MATERNITY_LAW2006_ART35_2" : null;
    if (newStatus === "CREDITED" && newCreditKind === "MATERNITY" && !maternityKind) throw new Error("Thai sản trước 2007 cần rà soát riêng.");
    let stateSalary: InsuranceContributionMonth["stateSalary"] = undefined;
    if (newSalaryRegime === "STATE" && newCoefficient.trim()) {
      if (!monthEvidence.length) throw new Error("Hệ số lương Nhà nước cần căn cứ xác nhận.");
      stateSalary = { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: newCoefficient.trim(), evidence: monthEvidence,
        ...(newPre2004Scale && newMonth < "2004-10" ? { pre2004Conversion: { scale: newPre2004Scale, evidence: monthEvidence } } : {}),
        ...(newSeniority ? { includesSeniorityAllowance: newSeniority === "YES" } : {}) };
    }

    const item: InsuranceContributionMonth = {
      month: newMonth,
      scheme: newScheme,
      salaryRegime: newSalaryRegime,
      status: newStatus,
      contributionBase: newStatus === "NOT_CONTRIBUTED" ? null : (newBase.trim() || null),
      participantCategory: (newParticipantCategory || undefined) as any,
      creditKind: newStatus === "CREDITED" ? (newCreditKind === "MATERNITY" ? maternityKind! : newCreditKind || undefined) : undefined,
      evidence: monthEvidence,
      stateSalary,
    };

    if (latestNewMonth.current !== newMonthKey) return;
    const nextMonths = [
      ...historyMonths.filter((m) => m.month !== item.month),
      item,
    ].sort((a, b) => a.month.localeCompare(b.month));

    setHistoryMonths(nextMonths);
    updateCoverageSuggestions(nextMonths);
    setDuplicateMonthWarning(null);
    setNewBase("");
    setNewCoefficient("");
    setNewCreditKind("");
    setNewPre2004Scale(""); setNewSeniority("");
    setEvidenceDrafts(previous => ({ ...previous, history: emptyEvidence() }));
    } catch (error) { setFormError(error instanceof Error ? error.message : "Không thể thêm tháng đóng."); }
  };

  const handleRemoveMonth = (monthStr: string) => {
    const nextMonths = historyMonths.filter((m) => m.month !== monthStr);
    setHistoryMonths(nextMonths);
  };

  // Build the complete document for preview and save
  const buildCurrentDocument = (): InsuranceHistoryDocument => {
    const sorted = [...historyMonths].sort((a, b) => a.month.localeCompare(b.month));
    const effectiveFrom = coverageFrom || (sorted.length > 0 ? sorted[0].month : currentYearMonth);
    const effectiveThrough = coverageThrough || (sorted.length > 0 ? sorted[sorted.length - 1].month : currentYearMonth);
    const effectiveConfirmed = confirmedThroughMonth || (effectiveThrough > currentYearMonth ? currentYearMonth : effectiveThrough);

    return {
      schemaVersion: 1,
      birth: {
        precision: birthPrecision,
        declaredValue: birthPrecision === "UNKNOWN" ? null : (birthDeclaredValue.trim() || null),
      },
      legalSex: legalSex,
      coverageFrom: effectiveFrom,
      coverageThrough: effectiveThrough,
      confirmedThroughMonth: effectiveConfirmed,
      months: sorted,
      specialPeriods: specialPeriods || [],
    };
  };

  // Step 1: Preview Insurance History Import
  const handlePreviewHistory = async () => {
    if (saving.current || loadingHistory || historyLoadError || previewingHistory) return;
    if (historyMonths.length === 0) {
      notify.error(isVi ? "Chưa có tháng đóng" : "No Months Added", isVi ? "Vui lòng thêm ít nhất một tháng đóng BHXH." : "Please add at least one contribution month.");
      return;
    }

    const doc = buildCurrentDocument();
    if (doc.confirmedThroughMonth > currentYearMonth) {
      notify.error(
        isVi ? "Mốc xác nhận trong tương lai" : "Future Confirmation",
        isVi ? `Mốc xác nhận (${doc.confirmedThroughMonth}) không được vượt quá tháng hiện tại (${currentYearMonth}).` : "Confirmed month cannot be in the future."
      );
      return;
    }

    const inputKey = historyInputKey, request = ++historyPreviewRequest.current;
    setPreviewingHistory(true);
    setHistoryPreview(null);
    try {
      const expectedRev = historyRecord ? historyRecord.revision : 0;
      const res = await previewInsuranceHistoryImport(expectedRev, doc);
      if (latestHistoryInput.current !== inputKey || request !== historyPreviewRequest.current) return;
      setHistoryPreview(res);
      setPreviewedDoc(doc);
      setIncompleteConfirmed(false);

      if (res.status === "READY") {
        notify.success(
          isVi ? "Hồ sơ hợp lệ" : "History Verified",
          isVi ? "Hồ sơ đầy đủ, sẵn sàng lưu vào hệ thống." : "History profile is complete and ready to save."
        );
      } else if (res.status === "INCOMPLETE") {
        notify.warning(
          isVi ? "Hồ sơ chưa hoàn thiện (INCOMPLETE)" : "Incomplete Profile",
          isVi ? `Có ${res.issues.length} cảnh báo/thông tin chưa đủ. Cần xác nhận để lưu.` : `Found ${res.issues.length} incomplete issues.`
        );
      } else {
        notify.error(
          isVi ? "Hồ sơ không hợp lệ (INVALID)" : "Invalid Profile",
          isVi ? "Vui lòng sửa các lỗi trùng tháng hoặc ngoài phạm vi." : "Please resolve duplicate or out-of-range months."
        );
      }
    } catch (e) {
      if (latestHistoryInput.current !== inputKey || request !== historyPreviewRequest.current) return;
      const msg = e instanceof Error ? e.message : "Lỗi kiểm tra lịch sử";
      notify.error(isVi ? "Lỗi kiểm tra" : "Preview Error", msg);
    } finally {
      if (request === historyPreviewRequest.current) setPreviewingHistory(false);
    }
  };

  // Step 2: Save Insurance History
  const handleSaveHistory = async () => {
    if (saving.current || loadingHistory || historyLoadError || previewingHistory) return;
    if (!historyPreview || !previewedDoc || !historyPreview.inputHash) {
      notify.error(isVi ? "Chưa kiểm tra hồ sơ" : "Preview Required", isVi ? "Vui lòng bấm 'Kiểm tra / Xem trước lịch sử' trước khi lưu." : "Please preview history first.");
      return;
    }

    if (historyPreview.status === "INVALID") {
      notify.error(isVi ? "Hồ sơ không hợp lệ" : "Invalid History", isVi ? "Không thể lưu hồ sơ ở trạng thái INVALID." : "Cannot save invalid history.");
      return;
    }

    if (historyPreview.status === "INCOMPLETE" && !incompleteConfirmed) {
      notify.error(
        isVi ? "Chưa xác nhận lưu thiếu" : "Confirmation Required",
        isVi ? "Vui lòng đánh dấu vào ô xác nhận đồng ý lưu hồ sơ chưa đầy đủ." : "Please check the confirmation box to proceed."
      );
      return;
    }

    saving.current = true; setSavingHistory(true); setSaveError("");
    try {
      const expectedRev = historyRecord ? historyRecord.revision : 0;
      const saved = await saveInsuranceHistory(
        { expectedHistoryRevision: expectedRev, document: previewedDoc },
        historyPreview.inputHash,
        historySaveIdempotencyKey
      );
      setHistoryRecord(saved);
      setHistoryPreview(null);
      setPreviewedDoc(null);
      setIncompleteConfirmed(false);
      setHistorySaveIdempotencyKey(crypto.randomUUID());
      notify.success(
        isVi ? "Đã lưu lịch sử BHXH" : "Insurance History Saved",
        isVi ? `Đã lưu phiên bản r${saved.revision} với ${saved.document.months.length} tháng.` : `Saved revision r${saved.revision} with ${saved.document.months.length} months.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error saving history";
      setSaveError(msg);
      notify.error(isVi ? "Lỗi lưu lịch sử" : "Save Error", msg);
      // Keep the user's draft on a failed save; never replace it with a silent reload.
    } finally {
      saving.current = false; setSavingHistory(false);
    }
  };

  // Handle Preview Estimate
  const handlePreviewEstimate = async () => {
    if (saving.current || loadingHistory || historyLoadError || loadingRules || rulesError || previewingEstimate) return;
    if (!historyRecord?.id) {
      notify.error(
        isVi ? "Chưa lưu lịch sử BHXH" : "No Saved History",
        isVi ? "Vui lòng hoàn tất và lưu hồ sơ quá trình đóng BHXH (Tab Quá trình đóng) trước khi tính lương hưu." : "Please save your contribution history first."
      );
      return;
    }
    if (!intendedBenefitDate) {
      notify.error(isVi ? "Thiếu ngày hưởng" : "Benefit Date Required", isVi ? "Vui lòng chọn ngày dự kiến hưởng lương hưu." : "Please select intended benefit date.");
      return;
    }
    if (!selectedRuleId) {
      notify.error(
        isVi ? "Chưa có bộ quy tắc" : "No Legal Rule Selected",
        isVi ? "Hệ thống chưa tìm thấy bộ quy tắc công bố phù hợp với ngày hưởng này. Vui lòng nhập hưu thủ công." : "No published legal rule found for this benefit date."
      );
      return;
    }

    const inputKey = estimateInputKey, request = ++estimateRequest.current;
    setFormError("");
    setPreviewingEstimate(true);
    setEstimateResult(null);
    try {
      const payload: PensionEstimateInput = {
        historyVersionId: historyRecord.id,
        expectedHistoryRevision: historyRecord.revision,
        legalRuleSetVersionId: selectedRuleId,
        intendedBenefitDate,
        employmentEndDate: employmentEndDate || null,
        contributionStopMonth: contributionStopMonth || null,
        benefitRequestDate: benefitRequestDate || null,
        futureContributions: [],
      };

      const benefitMonth = intendedBenefitDate.slice(0, 7);
      if (estimateMode === "ordinary" || estimateMode === "state") {
        payload.caseDetails = { kind: "NORMAL_EMPLOYEE", participationAtRetirement: ordinaryParticipation,
          benefitStart: { kind: ordinaryStartKind, month: benefitMonth, evidence: await submittedEvidence(evidence("ordinary")) } };
      }
      if (estimateMode === "state") {
        if (!firstParticipationMonth) throw new Error("Vui lòng nhập tháng bắt đầu tham gia.");
        payload.stateSalaryCase = { firstParticipationMonth, salaryTreatment,
          firstParticipationEvidence: await submittedEvidence(evidence("first")),
          treatmentEvidence: await submittedEvidence(evidence("state")),
          ...(salaryTreatment !== "ORDINARY" && transferMonth ? { transferMonth } : {}) };
        if (salaryTreatment === "HAZARDOUS_TRANSFER") {
          if (!hazardousPeriods.length || hazardousPeriods.some(p => !p.fromMonth || !p.toMonth || p.fromMonth > p.toMonth) || !hazardousWindowFrom) throw new Error("Vui lòng khai các giai đoạn nghề nặng nhọc và tháng bắt đầu cửa sổ lương.");
          const proof = await submittedEvidence(evidence("hazardous"));
          payload.stateSalaryCase.hazardousPeriods = hazardousPeriods.map(period => ({ ...period, evidence: proof }));
          payload.stateSalaryCase.hazardousWindowFrom = hazardousWindowFrom;
        }
      } else if (estimateMode === "voluntary") {
        payload.voluntaryCase = { kind: "NORMAL_VOLUNTARY", paymentMethod: "REGULAR_ONLY", ageRule: voluntaryAgeRule,
          benefitStart: { kind: voluntaryStartKind, month: benefitMonth, confirmation: voluntaryConfirmation,
            evidence: await submittedEvidence(evidence("voluntary")) } };
      } else if (estimateMode === "topUp") {
        if (!paymentOn || !topUpIncome) throw new Error("Vui lòng nhập ngày đóng bù và thu nhập làm căn cứ.");
        payload.voluntaryTopUp = { kind: "MISSING_YEARS_TOP_UP", ageRule: "NORMAL", historyTreatment: "REGULAR_ONLY",
          paymentOn, missingMonths: topUpMonths, monthlyIncome: topUpIncome, confirmation: topUpConfirmation,
          evidence: await submittedEvidence(evidence("topUp")) };
      } else if (estimateMode === "prepaid") {
        if (!paymentOn || !registeredOn || !periodStartMonth || !benefitRequestDate || !prepaidIncome) throw new Error("Vui lòng nhập đủ ngày đăng ký, ngày đóng, tháng đầu kỳ, ngày đề nghị hưởng và thu nhập.");
        if (periodStartMonth >= benefitMonth) throw new Error("Tháng đầu kỳ đã đóng phải trước tháng bắt đầu hưởng.");
        payload.voluntaryPrepaid = { kind: "PREPAID_REQUEST", ageRule: "NORMAL", historyTreatment: "NO_OTHER_ACTIVE_PREPAYMENT_OR_TOP_UP",
          periodStartMonth, periodMonths: prepaidPeriodMonths, registeredOn, paymentOn, monthlyIncome: prepaidIncome,
          confirmation: prepaidConfirmation, evidence: await submittedEvidence(evidence("prepaid")),
          benefitRequest: { confirmation: requestConfirmation, evidence: await submittedEvidence(evidence("request")) }, refundSupport: null };
      }
      if (latestEstimateInput.current !== inputKey || request !== estimateRequest.current) return;
      const res = await previewPensionEstimate(payload);
      if (latestEstimateInput.current !== inputKey || request !== estimateRequest.current) return;
      setEstimateResult(res);
      setLastPreviewInput(payload);

      if (res.assessment.assessmentStatus === "ELIGIBLE") {
        notify.success(
          isVi ? "Đủ điều kiện hưởng lương hưu" : "Pension Benefit Eligible",
          isVi ? "Hồ sơ đáp ứng điều kiện theo quy định pháp luật." : "Profile satisfies statutory pension criteria."
        );
      } else {
        notify.warning(
          isVi ? "Trạng thái thẩm định" : "Assessment Status",
          res.assessment.missingFields?.map((i) => i.code).join("; ") || res.assessment.assessmentStatus
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error previewing pension estimate";
      if (latestEstimateInput.current !== inputKey || request !== estimateRequest.current) return;
      setFormError(msg);
      notify.error(isVi ? "Lỗi tính toán" : "Estimate Error", msg);
    } finally {
      if (request === estimateRequest.current) setPreviewingEstimate(false);
    }
  };

  // Handle Save Estimate
  const handleSaveEstimate = async () => {
    if (saving.current || loadingRecords || !estimateResult?.inputHash || !lastPreviewInput || savedEstimateHash === estimateResult.inputHash) return;
    saving.current = true; setSavingEstimate(true); setSaveError("");
    try {
      const saved = await savePensionEstimate(
        lastPreviewInput,
        estimateResult.inputHash,
        estimateSaveIdempotencyKey
      );
      notify.success(
        isVi ? "Đã lưu kết quả ước tính" : "Estimate Saved",
        isVi ? "Kết quả đã được ghi nhận vào danh sách lưu trữ cá nhân." : "Estimate successfully recorded."
      );
      setSavedEstimates((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
      setSavedEstimateHash(estimateResult.inputHash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error saving estimate";
      setSaveError(msg);
      notify.error(isVi ? "Lỗi lưu ước tính" : "Save Error", msg);
    } finally {
      saving.current = false; setSavingEstimate(false);
    }
  };

  return (
    <Modal
      open={open}
      className="plan-wide-dialog insurance-dialog"
      onClose={() => { if (!saving.current) onClose(); }}
      title={isVi ? "Quản lý Bảo hiểm xã hội & Ước tính lương hưu" : "Social Insurance & Pension Estimates"}
    >
      <div className="social-insurance-form">
        {loadingHistory && <p role="status">{isVi ? "Đang tải lịch sử BHXH…" : "Loading contribution history…"}</p>}
        {historyLoadError && <Alert tone="danger" title={isVi ? "Lỗi tải lịch sử BHXH" : "Failed to load history"}>
          <p>{historyLoadError}</p><Button variant="secondary" onClick={fetchHistory} loading={loadingHistory}>{isVi ? "Thử lại" : "Retry"}</Button>
        </Alert>}
        {!loadingHistory && !historyLoadError && !historyRecord && activeTab === "estimate" && <p role="status">{isVi ? "Hãy nhập và lưu Quá trình đóng BHXH trước khi tính ước tính." : "Enter and save contribution history before calculating an estimate."}</p>}
        <fieldset disabled={savingHistory || savingEstimate} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {(saveError || formError) && <div ref={errorRef} tabIndex={-1} role="alert" style={{ marginBottom: "12px" }}><strong>{saveError ? (isVi ? "Chưa lưu được dữ liệu" : "Could not save") : (isVi ? "Cần bổ sung thông tin" : "Please check your input")}</strong><p>{saveError || formError}</p></div>}
        {/* Navigation Tabs */}
        <div
          className="insurance-tabs"
          style={{
            borderBottom: "1.5px solid var(--color-border)",
            paddingBottom: "12px",
            marginBottom: "16px",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("estimate")}
            aria-pressed={activeTab === "estimate"}
            style={{
              borderRadius: "var(--radius-md)",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "estimate" ? "var(--color-primary-700)" : "var(--color-surface-subtle)",
              color: activeTab === "estimate" ? "#ffffff" : "var(--color-text)",
            }}
          >
            <Icon name="sparkles" size="small" /> {isVi ? "Ước tính lương hưu" : "Pension Estimates"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            aria-pressed={activeTab === "history"}
            style={{
              borderRadius: "var(--radius-md)",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "history" ? "var(--color-primary-700)" : "var(--color-surface-subtle)",
              color: activeTab === "history" ? "#ffffff" : "var(--color-text)",
            }}
          >
            <Icon name="file-text" size="small" /> {isVi ? "Quá trình đóng BHXH" : "Contribution History"}{" "}
            {historyMonths.length > 0 ? `(${historyMonths.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("records")}
            aria-pressed={activeTab === "records"}
            style={{
              borderRadius: "var(--radius-md)",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
              background: activeTab === "records" ? "var(--color-primary-700)" : "var(--color-surface-subtle)",
              color: activeTab === "records" ? "#ffffff" : "var(--color-text)",
            }}
          >
            <Icon name="check" size="small" /> {isVi ? "Bản lưu ước tính" : "Saved Records"}{" "}
            {savedEstimates.length > 0 ? `(${savedEstimates.length})` : ""}
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: PENSION ESTIMATE CALCULATOR                        */}
        {/* ========================================================= */}
        {activeTab === "estimate" && (
          <div className="insurance-estimate-layout">
            {historyRecord && !loadingHistory && !historyLoadError && <p style={{ margin: 0, fontSize: "13px" }}>{isVi ? `Ước tính sử dụng lịch sử đã lưu r${historyRecord.revision}. Nếu vừa sửa Quá trình đóng BHXH, hãy kiểm tra và lưu lịch sử trước khi tính lại.` : `Estimates use saved history r${historyRecord.revision}. Verify and save history edits before recalculating.`}</p>}
            {/* Top Config Card */}
            <div className="insurance-estimate-config" style={{ background: "var(--color-surface-subtle)", padding: "16px", borderRadius: "var(--radius-md)" }}>
              <h3 className="insurance-section-title">{isVi ? "Thông tin tính lương hưu" : "Pension estimate details"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-1`}>
                    {isVi ? "Ngày dự kiến hưởng lương hưu *" : "Intended Benefit Date *"}
                  </label>
                  <input id={`${formId}-field-1`}
                    type="date"
                    className="input"
                    value={intendedBenefitDate}
                    onChange={(e) => setIntendedBenefitDate(e.target.value)}
                    style={{ width: "100%", height: "34px", fontSize: "12px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-2`}>
                    {isVi ? "Bộ luật & Căn cứ pháp lý *" : "Legal Rule Set *"}
                  </label>
                  <select id={`${formId}-field-2`}
                    disabled={loadingRules || Boolean(rulesError)}
                    className="input"
                    value={selectedRuleId}
                    onChange={(e) => setSelectedRuleId(e.target.value)}
                    style={{ width: "100%", height: "34px", fontSize: "12px" }}
                  >
                    {publishedRules.length > 0 ? (
                      publishedRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} (v{r.version})
                        </option>
                      ))
                    ) : (
                      <option value="">{loadingRules ? (isVi ? "Đang tải…" : "Loading…") : rulesError ? (isVi ? "Chưa tải được" : "Load failed") : (isVi ? "Chưa có quy định công bố" : "No published rules")}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-3`}>
                    {isVi ? "Chế độ tham gia & Nhánh tính *" : "Participation Scheme *"}
                  </label>
                  <select id={`${formId}-field-3`}
                    className="input"
                    value={estimateMode}
                    onChange={(e) => setEstimateMode(e.target.value as any)}
                    style={{ width: "100%", height: "34px", fontSize: "12px" }}
                  >
                    <option value="ordinary">{isVi ? "BHXH Bắt buộc (Doanh nghiệp)" : "Compulsory (Enterprise)"}</option>
                    <option value="state">{isVi ? "Hệ số lương Nhà nước" : "State Scale Coefficient"}</option>
                    <option value="voluntary">{isVi ? "BHXH Tự nguyện" : "Voluntary Insurance"}</option>
                    <option value="topUp">{isVi ? "Đóng bù năm thiếu (1-60 tháng)" : "Missing Years Top-up"}</option>
                    <option value="prepaid">{isVi ? "Đóng trước theo kỳ (3-60 tháng)" : "Prepaid Request"}</option>
                  </select>
                </div>
              </div>

              {/* Discovery alert if no rules available */}
              {loadingRules && <p role="status">{isVi ? "Đang tải bộ quy tắc…" : "Loading rules…"}</p>}
              {rulesError && <Alert tone="danger" title={isVi ? "Chưa tải được bộ quy tắc" : "Could not load rules"}>
                <p>{rulesError}</p><Button variant="secondary" onClick={() => setRulesAttempt(n => n + 1)}>{isVi ? "Tải lại bộ quy tắc" : "Retry rules"}</Button>
              </Alert>}
              {intendedBenefitDate && !loadingRules && !rulesError && publishedRules.length === 0 && (
                <div style={{ marginTop: "12px" }}>
                  <Alert tone="warning" title={isVi ? "Chưa có bộ quy tắc công bố" : "No Published Rules"}>
                    {isVi
                      ? "Ứng dụng chưa có bộ quy tắc công bố phù hợp với ngày hưởng này. Hãy kiểm tra ngày hưởng hoặc nhập lương hưu thủ công."
                      : "No statutory legal rules published for this benefit date."}
                  </Alert>
                </div>
              )}

              {/* Mode-specific configuration */}
              {(estimateMode === "ordinary" || estimateMode === "state") && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--color-border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-4`}>
                      {isVi ? "Trạng thái khi nghỉ hưu" : "Participation Status"}
                    </label>
                    <select id={`${formId}-field-4`}
                      className="input"
                      value={ordinaryParticipation}
                      onChange={(e) => setOrdinaryParticipation(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="ACTIVE_COMPULSORY">{isVi ? "Đang đóng bắt buộc" : "Active Compulsory"}</option>
                      <option value="PRESERVED">{isVi ? "Bảo lưu thời gian đóng" : "Preserved"}</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-5`}>
                      {isVi ? "Căn cứ thời điểm hưởng" : "Benefit Start Basis"}
                    </label>
                    <select id={`${formId}-field-5`}
                      className="input"
                      value={ordinaryStartKind}
                      onChange={(e) => setOrdinaryStartKind(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="PERSON_REQUEST">{isVi ? "Đơn đề nghị của cá nhân" : "Person Request"}</option>
                      <option value="EMPLOYER_NOTICE">{isVi ? "Thông báo của đơn vị" : "Employer Notice"}</option>
                      <option value="HYPOTHETICAL">{isVi ? "Kịch bản giả định" : "Hypothetical"}</option>
                    </select>
                  </div>
                </div>
              )}

              {estimateMode === "state" && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--color-border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-6`}>
                      {isVi ? "Tháng bắt đầu tham gia Nhà nước" : "First Participation Month"}
                    </label>
                    <input id={`${formId}-field-6`}
                      type="month"
                      className="input"
                      value={firstParticipationMonth}
                      onChange={(e) => setFirstParticipationMonth(e.target.value)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-7`}>
                      {isVi ? "Chế độ phân loại lương" : "Salary Treatment"}
                    </label>
                    <select id={`${formId}-field-7`}
                      className="input"
                      value={salaryTreatment}
                      onChange={(e) => setSalaryTreatment(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="ORDINARY">{isVi ? "Thông thường" : "Ordinary"}</option>
                      <option value="HAZARDOUS_TRANSFER">{isVi ? "Nghề nặng nhọc / độc hại" : "Hazardous Transfer"}</option>
                      <option value="MILITARY_TRANSFER">{isVi ? "Lực lượng vũ trang chuyển ngành" : "Military Transfer"}</option>
                      <option value="SENIORITY_ALLOWANCE_TRANSFER">{isVi ? "Phụ cấp thâm niên nghề" : "Seniority Allowance"}</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-8`}>
                      {isVi ? "Tháng chuyển ngành (nếu có)" : "Transfer Month (optional)"}
                    </label>
                    <input id={`${formId}-field-8`}
                      type="month"
                      className="input"
                      value={transferMonth}
                      onChange={(e) => setTransferMonth(e.target.value)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    />
                  </div>
                </div>
              )}

              {estimateMode === "voluntary" && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--color-border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-9`}>
                      {isVi ? "Quy định tuổi hưởng" : "Age Rule"}
                    </label>
                    <select id={`${formId}-field-9`}
                      className="input"
                      value={voluntaryAgeRule}
                      onChange={(e) => setVoluntaryAgeRule(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="NORMAL">{isVi ? "Độ tuổi quy định chung" : "Normal Age"}</option>
                      <option value="LAW_ART141_9">{isVi ? "Điều 141(9) (tham gia trước 2021)" : "Law Art 141(9)"}</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-10`}>
                      {isVi ? "Căn cứ bắt đầu hưởng" : "Benefit Start Basis"}
                    </label>
                    <select id={`${formId}-field-10`}
                      className="input"
                      value={voluntaryStartKind}
                      onChange={(e) => setVoluntaryStartKind(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="ELIGIBILITY">{isVi ? "Đủ điều kiện" : "Eligibility"}</option>
                      <option value="CONTINUED_CONTRIBUTIONS">{isVi ? "Đóng tiếp sau tuổi hưu" : "Continued Contributions"}</option>
                      <option value="TRANSITION_2025">{isVi ? "Chuyển tiếp 2025" : "Transition 2025"}</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-11`}>
                      {isVi ? "Xác nhận hồ sơ" : "Confirmation"}
                    </label>
                    <select id={`${formId}-field-11`}
                      className="input"
                      value={voluntaryConfirmation}
                      onChange={(e) => setVoluntaryConfirmation(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="DOCUMENTED">{isVi ? "Có chứng từ thực tế" : "Documented"}</option>
                      <option value="HYPOTHETICAL">{isVi ? "Giả định dự báo" : "Hypothetical"}</option>
                    </select>
                  </div>
                </div>
              )}

              {estimateMode === "topUp" && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--color-border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-12`}>
                      {isVi ? "Số tháng đóng bù (1 đến 60 tháng)" : "Missing Months (1-60)"}
                    </label>
                    <input id={`${formId}-field-12`}
                      type="number"
                      min={1}
                      max={60}
                      className="input"
                      value={topUpMonths}
                      onChange={(e) => setTopUpMonths(Number(e.target.value))}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-13`}>
                      {isVi ? "Thu nhập làm căn cứ đóng bù (VND)" : "Top-up Monthly Income (VND)"}
                    </label>
                    <MoneyTextBox id={`${formId}-field-13`}
                      className="input"
                      value={topUpIncome}
                      onChange={setTopUpIncome}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-14`}>
                      {isVi ? "Trạng thái nộp tiền" : "Payment Confirmation"}
                    </label>
                    <select id={`${formId}-field-14`}
                      className="input"
                      value={topUpConfirmation}
                      onChange={(e) => setTopUpConfirmation(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="DOCUMENTED_FULLY_PAID">{isVi ? "Đã nộp đủ (có biên lai)" : "Documented Fully Paid"}</option>
                      <option value="HYPOTHETICAL">{isVi ? "Kịch bản giả định" : "Hypothetical"}</option>
                    </select>
                  </div>
                </div>
              )}

              {estimateMode === "prepaid" && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--color-border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-15`}>
                      {isVi ? "Kỳ đóng trước" : "Prepaid Period"}
                    </label>
                    <select id={`${formId}-field-15`}
                      className="input"
                      value={prepaidPeriodMonths}
                      onChange={(e) => setPrepaidPeriodMonths(Number(e.target.value) as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value={3}>3 {isVi ? "tháng" : "months"}</option>
                      <option value={6}>6 {isVi ? "tháng" : "months"}</option>
                      <option value={12}>12 {isVi ? "tháng (1 năm)" : "months (1 yr)"}</option>
                      <option value={24}>24 {isVi ? "tháng (2 năm)" : "months (2 yrs)"}</option>
                      <option value={36}>36 {isVi ? "tháng (3 năm)" : "months (3 yrs)"}</option>
                      <option value={48}>48 {isVi ? "tháng (4 năm)" : "months (4 yrs)"}</option>
                      <option value={60}>60 {isVi ? "tháng (5 năm)" : "months (5 yrs)"}</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-16`}>
                      {isVi ? "Thu nhập căn cứ đóng trước (VND)" : "Prepaid Income (VND)"}
                    </label>
                    <MoneyTextBox id={`${formId}-field-16`}
                      className="input"
                      value={prepaidIncome}
                      onChange={setPrepaidIncome}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-17`}>
                      {isVi ? "Trạng thái nộp tiền" : "Payment Confirmation"}
                    </label>
                    <select id={`${formId}-field-17`}
                      className="input"
                      value={prepaidConfirmation}
                      onChange={(e) => setPrepaidConfirmation(e.target.value as any)}
                      style={{ width: "100%", height: "34px", fontSize: "12px" }}
                    >
                      <option value="DOCUMENTED_FULLY_PAID">{isVi ? "Đã nộp đủ (có biên lai)" : "Documented Fully Paid"}</option>
                      <option value="HYPOTHETICAL">{isVi ? "Kịch bản giả định" : "Hypothetical"}</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "12px", marginTop: "12px" }}>
                <label>{isVi ? "Ngày chấm dứt việc làm" : "Employment end date"}<input className="input" type="date" value={employmentEndDate} onChange={e => setEmploymentEndDate(e.target.value)} /></label>
                <label>{isVi ? "Tháng ngừng đóng" : "Contribution stop month"}<input className="input" type="month" value={contributionStopMonth} onChange={e => setContributionStopMonth(e.target.value)} /></label>
                <label>{isVi ? "Ngày đề nghị hưởng" : "Benefit request date"}<input className="input" type="date" value={benefitRequestDate} onChange={e => setBenefitRequestDate(e.target.value)} /></label>
                {(estimateMode === "topUp" || estimateMode === "prepaid") && <label>{isVi ? "Ngày nộp tiền" : "Payment date"}<input className="input" type="date" value={paymentOn} onChange={e => setPaymentOn(e.target.value)} /></label>}
                {estimateMode === "prepaid" && <>
                  <label>{isVi ? "Ngày đăng ký kỳ đóng" : "Registration date"}<input className="input" type="date" value={registeredOn} onChange={e => setRegisteredOn(e.target.value)} /></label>
                  <label>{isVi ? "Tháng đầu kỳ đã đóng" : "First prepaid month"}<input className="input" type="month" value={periodStartMonth} onChange={e => setPeriodStartMonth(e.target.value)} /></label>
                  <label>{isVi ? "Căn cứ đề nghị hưởng" : "Benefit request confirmation"}<select aria-label={isVi ? "Căn cứ đề nghị hưởng" : "Benefit request confirmation"} className="input" value={requestConfirmation} onChange={e => setRequestConfirmation(e.target.value as typeof requestConfirmation)}>
                    <option value="HYPOTHETICAL">{isVi ? "Kịch bản giả định" : "Hypothetical"}</option><option value="DOCUMENTED">{isVi ? "Có hồ sơ xác nhận" : "Documented"}</option>
                  </select></label>
                </>}
              </div>
              {(estimateMode === "ordinary" || estimateMode === "state") && editEvidence("ordinary", isVi ? "Căn cứ thời điểm hưởng" : "Benefit start evidence")}
              {estimateMode === "state" && <>
                {editEvidence("first", isVi ? "Căn cứ tháng tham gia đầu tiên" : "First participation evidence")}
                {editEvidence("state", isVi ? "Căn cứ chế độ lương / chuyển ngành" : "Salary treatment evidence")}
                {salaryTreatment === "HAZARDOUS_TRANSFER" && <fieldset style={{ minWidth: 0 }}>
                  <legend>{isVi ? "Giai đoạn nghề nặng nhọc được xác nhận" : "Confirmed hazardous employment periods"}</legend>
                  {hazardousPeriods.map((period, index) => <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                    <label>{isVi ? "Từ tháng" : "From month"}<input type="month" className="input" value={period.fromMonth} onChange={e => setHazardousPeriods(rows => rows.map((r, i) => i === index ? { ...r, fromMonth: e.target.value } : r))} /></label>
                    <label>{isVi ? "Đến tháng" : "To month"}<input type="month" className="input" value={period.toMonth} onChange={e => setHazardousPeriods(rows => rows.map((r, i) => i === index ? { ...r, toMonth: e.target.value } : r))} /></label>
                    <Button variant="secondary" onClick={() => setHazardousPeriods(rows => rows.filter((_, i) => i !== index))}>{isVi ? "Xóa giai đoạn" : "Remove period"}</Button>
                  </div>)}
                  <Button variant="secondary" onClick={() => setHazardousPeriods(rows => [...rows, { fromMonth: "", toMonth: "" }])}>{isVi ? "Thêm giai đoạn nghề" : "Add employment period"}</Button>
                  <label style={{ display: "block", marginTop: "12px" }}>{isVi ? "Tháng bắt đầu cửa sổ lương được xác nhận" : "Confirmed salary window start"}<input type="month" className="input" value={hazardousWindowFrom} onChange={e => setHazardousWindowFrom(e.target.value)} /></label>
                  {editEvidence("hazardous", isVi ? "Căn cứ các giai đoạn nghề" : "Hazardous periods evidence")}
                </fieldset>}
              </>}
              {estimateMode === "voluntary" && editEvidence("voluntary", isVi ? "Căn cứ hưởng BHXH tự nguyện" : "Voluntary benefit evidence")}
              {estimateMode === "topUp" && editEvidence("topUp", isVi ? "Căn cứ đóng bù" : "Top-up evidence")}
              {estimateMode === "prepaid" && <>{editEvidence("prepaid", isVi ? "Căn cứ đóng trước" : "Prepaid evidence")}{editEvidence("request", isVi ? "Căn cứ đề nghị hưởng" : "Benefit request evidence")}</>}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
                <Button
                  variant="primary"
                  onClick={handlePreviewEstimate}
                  loading={previewingEstimate}
                  disabled={!selectedRuleId || !historyRecord || loadingHistory || Boolean(historyLoadError) || loadingRules || Boolean(rulesError)}
                >
                  <Icon name="sparkles" size="small" /> {isVi ? "Tính toán ước tính lương hưu" : "Calculate Pension Estimate"}
                </Button>
              </div>
            </div>

            {/* Estimate Results Presentation */}
            {estimateResult && (
              <div ref={estimateResultRef} tabIndex={-1} aria-label={isVi ? "Kết quả ước tính lương hưu" : "Pension estimate result"} className="insurance-estimate-result" style={{ border: "1.5px solid var(--color-primary-200)", borderRadius: "var(--radius-lg)", padding: "16px", background: "var(--color-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge tone={estimateResult.assessment.assessmentStatus === "ELIGIBLE" ? "success" : "warning"}>
                        {estimateResult.assessment.assessmentStatus === "ELIGIBLE"
                          ? (isVi ? "ĐỦ ĐIỀU KIỆN HƯỞNG" : "ELIGIBLE")
                          : (isVi ? `CHƯA ĐỦ / CẦN RÀ SOÁT: ${estimateResult.assessment.assessmentStatus}` : estimateResult.assessment.assessmentStatus)}
                      </Badge>
                      <Badge tone="soft">
                        {estimateResult.assessment.estimateKind === "CURRENT_RULE_ESTIMATE"
                          ? (isVi ? "LUẬT HIỆN HÀNH" : "CURRENT RULE")
                          : (isVi ? "KỊCH BẢN DỰ PHÓNG" : "PROJECTED SCENARIO")}
                      </Badge>
                    </div>
                    <h3 style={{ margin: "4px 0 0", color: "var(--color-primary-900)" }}>
                      {isVi ? "Kết quả thẩm định quyền lợi hưu trí" : "Retirement Pension Benefit Assessment"}
                    </h3>
                  </div>
                  <Button variant="secondary" onClick={handleSaveEstimate} loading={savingEstimate} disabled={loadingRecords || savedEstimateHash === estimateResult.inputHash}>
                    <Icon name="check" size="small" /> {isVi ? "Lưu kết quả này" : "Save Estimate"}
                  </Button>
                </div>

                {/* Missing Fields Alert if any */}
                {savedEstimateHash === estimateResult.inputHash && <p role="status">{isVi ? "Đã lưu kết quả này vào Bản lưu ước tính." : "This estimate is saved in Saved Records."}</p>}
                {estimateResult.assessment.missingFields && estimateResult.assessment.missingFields.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <Alert tone="warning" title={isVi ? "Thông tin cần bổ sung / rà soát" : "Missing or Review Fields"}>
                      <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "12px" }}>
                        {estimateResult.assessment.missingFields.map((f, i) => (
                          <li key={i}>
                            <strong>{f.code}</strong> ({f.path})
                          </li>
                        ))}
                      </ul>
                    </Alert>
                  </div>
                )}

                {/* Primary Metric Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {isVi ? "LƯƠNG HƯU DỰ KIẾN HÀNG THÁNG" : "MONTHLY PENSION BENEFIT"}
                    </span>
                    <strong className="font-mono" style={{ display: "block", fontSize: "18px", marginTop: "4px", color: "var(--color-primary-700)" }}>
                      {estimateResult.assessment.monthlyPension
                        ? formatVND(Number(estimateResult.assessment.monthlyPension))
                        : (isVi ? "Chưa xác định" : "Pending")}
                    </strong>
                  </div>

                  <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {isVi ? "TỶ LỆ HƯỞNG LƯƠNG HƯU" : "PENSION BENEFIT RATE"}
                    </span>
                    <strong className="font-mono" style={{ display: "block", fontSize: "18px", marginTop: "4px" }}>
                      {estimateResult.assessment.breakdown.find(b => b.code.includes("RATE") || b.unit === "PERCENT")?.value
                        ? `${estimateResult.assessment.breakdown.find(b => b.code.includes("RATE") || b.unit === "PERCENT")!.value}%`
                        : unknown}
                    </strong>
                  </div>

                  <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {isVi ? "BÌNH QUÂN TIỀN LƯƠNG ĐÓNG" : "ADJUSTED AVERAGE WAGE"}
                    </span>
                    <strong className="font-mono" style={{ display: "block", fontSize: "18px", marginTop: "4px" }}>
                      {estimateResult.assessment.breakdown.find(b => b.code.includes("WAGE") || b.code.includes("AVERAGE"))?.value
                        ? formatVND(Number(estimateResult.assessment.breakdown.find(b => b.code.includes("WAGE") || b.code.includes("AVERAGE"))!.value))
                        : unknown}
                    </strong>
                  </div>

                  <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {isVi ? "TỔNG THÁNG ĐÓNG ĐƯỢC TÍNH" : "TOTAL COUNTED MONTHS"}
                    </span>
                    <strong className="font-mono" style={{ display: "block", fontSize: "18px", marginTop: "4px" }}>
                      {estimateResult.assessment.countedMonths ?? unknown} {estimateResult.assessment.countedMonths != null && (isVi ? "tháng" : "months")}{" "}
                      {estimateResult.assessment.countedMonths != null &&
                      <span style={{ fontSize: "12px", fontWeight: "normal", color: "var(--color-text-muted)" }}>
                        ({Math.floor((estimateResult.assessment.countedMonths || 0) / 12)} {isVi ? "năm" : "yrs"})
                      </span>}
                    </strong>
                  </div>
                </div>

                {/* Lump sum if present */}
                {estimateResult.assessment.lumpSum && Number(estimateResult.assessment.lumpSum) > 0 && (
                  <div style={{ padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-primary-800)" }}>
                      {isVi ? "TRỢ CẤP MỘT LẦN KHI NGHỈ HƯU (DO ĐÓNG VƯỢT TRẦN):" : "RETIREMENT LUMP-SUM BENEFIT:"}
                    </span>
                    <div className="font-mono" style={{ fontSize: "16px", marginTop: "4px", color: "var(--color-secondary-700)", fontWeight: 700 }}>
                      {formatVND(Number(estimateResult.assessment.lumpSum))}
                    </div>
                  </div>
                )}

                {/* Statutory Citations */}
                {estimateResult.assessment.citations && estimateResult.assessment.citations.length > 0 && (
                  <div style={{ fontSize: "11.5px", color: "var(--color-text-muted)", marginTop: "12px", borderTop: "1px dashed var(--color-border)", paddingTop: "8px" }}>
                    <strong>{isVi ? "Căn cứ pháp lý:" : "Statutory Citations:"}</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                      {estimateResult.assessment.citations.map((c) => (
                        <li key={c.id}>
                          {c.instrument} - {c.locator} (Hiệu lực: {c.effectiveFrom})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CONTRIBUTION HISTORY LEDGER                        */}
        {/* ========================================================= */}
        {activeTab === "history" && (
          <fieldset disabled={loadingHistory || Boolean(historyLoadError)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

            {/* Profile & Demographics Metadata Header */}
            <div style={{ background: "var(--color-surface-subtle)", padding: "14px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "13px", color: "var(--color-primary-900)" }}>
                {isVi ? "1. Thông tin nhân khẩu & Phạm vi lịch sử" : "1. Profile Demographics & Coverage"}
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-18`}>
                    {isVi ? "Độ chính xác ngày sinh *" : "Birth Precision *"}
                  </label>
                  <select id={`${formId}-field-18`}
                    className="input"
                    value={birthPrecision}
                    onChange={(e) => {
                      const prec = e.target.value as any;
                      setBirthPrecision(prec);
                      if (prec === "UNKNOWN") setBirthDeclaredValue("");
                    }}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  >
                    <option value="UNKNOWN">{isVi ? "Chưa rõ (UNKNOWN)" : "Unknown"}</option>
                    <option value="YEAR">{isVi ? "Chỉ biết năm (YEAR)" : "Year only"}</option>
                    <option value="MONTH">{isVi ? "Biết tháng năm (MONTH)" : "Month & Year"}</option>
                    <option value="DAY">{isVi ? "Biết ngày đủ (DAY)" : "Exact Day"}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={`${formId}-birth`} style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>
                    {isVi ? "Giá trị ngày sinh đã khai" : "Declared Birth"}
                  </label>
                  {birthPrecision === "DAY" && (
                    <input
                      id={`${formId}-birth`}
                      type="date"
                      className="input"
                      value={birthDeclaredValue}
                      onChange={(e) => setBirthDeclaredValue(e.target.value)}
                      style={{ width: "100%", height: "32px", fontSize: "12px" }}
                    />
                  )}
                  {birthPrecision === "MONTH" && (
                    <input
                      id={`${formId}-birth`}
                      type="month"
                      className="input"
                      value={birthDeclaredValue}
                      onChange={(e) => setBirthDeclaredValue(e.target.value)}
                      style={{ width: "100%", height: "32px", fontSize: "12px" }}
                    />
                  )}
                  {birthPrecision === "YEAR" && (
                    <input
                      id={`${formId}-birth`}
                      type="number"
                      placeholder="VD: 1985"
                      min={1920}
                      max={2040}
                      className="input"
                      value={birthDeclaredValue}
                      onChange={(e) => setBirthDeclaredValue(e.target.value)}
                      style={{ width: "100%", height: "32px", fontSize: "12px" }}
                    />
                  )}
                  {birthPrecision === "UNKNOWN" && (
                    <input
                      id={`${formId}-birth`}
                      type="text"
                      disabled
                      placeholder={isVi ? "Không khai báo ngày sinh" : "Not declared"}
                      className="input"
                      value=""
                      style={{ width: "100%", height: "32px", fontSize: "12px", background: "var(--color-surface)" }}
                    />
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-19`}>
                    {isVi ? "Giới tính pháp lý *" : "Legal Sex *"}
                  </label>
                  <select id={`${formId}-field-19`}
                    className="input"
                    value={legalSex}
                    onChange={(e) => setLegalSex(e.target.value as any)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  >
                    <option value="UNKNOWN">{isVi ? "Chưa chọn (UNKNOWN)" : "Unknown"}</option>
                    <option value="MALE">{isVi ? "Nam (MALE)" : "Male"}</option>
                    <option value="FEMALE">{isVi ? "Nữ (FEMALE)" : "Female"}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-20`}>
                    {isVi ? "Quá trình đóng BHXH bắt đầu từ tháng" : "Coverage Start Month"}
                  </label>
                  <input id={`${formId}-field-20`}
                    type="month"
                    className="input"
                    value={coverageFrom}
                    onChange={(e) => setCoverageFrom(e.target.value)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-21`}>
                    {isVi ? "Quá trình đóng BHXH đến tháng" : "Coverage End Month"}
                  </label>
                  <input id={`${formId}-field-21`}
                    type="month"
                    className="input"
                    value={coverageThrough}
                    onChange={(e) => setCoverageThrough(e.target.value)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-22`}>
                    {isVi ? "Xác nhận đến tháng (≤ hiện tại)" : "Confirmed Through"}
                  </label>
                  <input id={`${formId}-field-22`}
                    type="month"
                    max={currentYearMonth}
                    className="input"
                    value={confirmedThroughMonth}
                    onChange={(e) => setConfirmedThroughMonth(e.target.value)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  />
                </div>
              </div>
            </div>

            {/* Duplicate month alert / prompt */}
            {duplicateMonthWarning && (
              <div style={{ marginBottom: "14px" }}>
                <Alert tone="warning" title={isVi ? "Tháng đã tồn tại trong danh sách" : "Duplicate Month"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <span>
                      {isVi
                        ? `Tháng ${duplicateMonthWarning} đã có trong danh sách. Bạn có muốn cập nhật lại thông tin của tháng này không?`
                        : `Month ${duplicateMonthWarning} already exists in history. Update it?`}
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <Button variant="secondary" onClick={() => setDuplicateMonthWarning(null)}>
                        {isVi ? "Hủy" : "Cancel"}
                      </Button>
                      <Button variant="primary" onClick={() => handleAddMonth(true)}>
                        {isVi ? "Cập nhật tháng này" : "Replace Month"}
                      </Button>
                    </div>
                  </div>
                </Alert>
              </div>
            )}

            {/* Add contribution month form */}
            <div style={{ background: "var(--color-surface-subtle)", padding: "14px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "13px", color: "var(--color-primary-900)" }}>
                {isVi ? "2. Thêm / cập nhật tháng đóng BHXH" : "2. Add / Edit Contribution Month"}
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-23`}>
                    {isVi ? "Tháng đóng *" : "Month *"}
                  </label>
                  <input id={`${formId}-field-23`}
                    type="month"
                    className="input"
                    value={newMonth}
                    onChange={(e) => setNewMonth(e.target.value)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-24`}>
                    {isVi ? "Hình thức *" : "Scheme *"}
                  </label>
                  <select id={`${formId}-field-24`}
                    className="input"
                    value={newScheme}
                    onChange={(e) => {
                      const scheme = e.target.value as any;
                      setNewScheme(scheme);
                      if (scheme === "VOLUNTARY") setNewSalaryRegime("VOLUNTARY_INCOME");
                      else if (scheme === "COMPULSORY" && newSalaryRegime === "VOLUNTARY_INCOME") setNewSalaryRegime("EMPLOYER");
                    }}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  >
                    <option value="COMPULSORY">{isVi ? "Bắt buộc" : "Compulsory"}</option>
                    <option value="VOLUNTARY">{isVi ? "Tự nguyện" : "Voluntary"}</option>
                    <option value="UNKNOWN">{isVi ? "Chưa rõ (UNKNOWN)" : "Unknown"}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-25`}>
                    {isVi ? "Chế độ lương *" : "Regime *"}
                  </label>
                  <select id={`${formId}-field-25`}
                    className="input"
                    value={newSalaryRegime}
                    onChange={(e) => setNewSalaryRegime(e.target.value as any)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  >
                    {newScheme !== "VOLUNTARY" && <option value="EMPLOYER">{isVi ? "Doanh nghiệp" : "Employer"}</option>}
                    {newScheme !== "VOLUNTARY" && <option value="STATE">{isVi ? "Nhà nước" : "State Scale"}</option>}
                    {newScheme !== "COMPULSORY" && <option value="VOLUNTARY_INCOME">{isVi ? "Thu nhập tự nguyện" : "Voluntary"}</option>}
                    <option value="UNKNOWN">{isVi ? "Chưa rõ (UNKNOWN)" : "Unknown"}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-26`}>
                    {isVi ? "Trạng thái *" : "Status *"}
                  </label>
                  <select id={`${formId}-field-26`}
                    className="input"
                    value={newStatus}
                    onChange={(e) => {
                      const s = e.target.value as any;
                      setNewStatus(s);
                      if (s === "NOT_CONTRIBUTED") setNewBase("");
                    }}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  >
                    <option value="PAID">{isVi ? "Đã đóng (PAID)" : "Paid"}</option>
                    <option value="CREDITED">{isVi ? "Được tính đóng (CREDITED)" : "Credited"}</option>
                    <option value="NOT_CONTRIBUTED">{isVi ? "Không tham gia" : "Not Contributed"}</option>
                    <option value="WITHDRAWN">{isVi ? "Đã rút BHXH 1 lần" : "Withdrawn"}</option>
                    <option value="UNKNOWN">{isVi ? "Chưa rõ (UNKNOWN)" : "Unknown"}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-27`}>
                    {isVi ? "Nhóm tham gia (tuỳ chọn)" : "Category (optional)"}
                  </label>
                  <select id={`${formId}-field-27`}
                    className="input"
                    value={newParticipantCategory}
                    onChange={(e) => setNewParticipantCategory(e.target.value)}
                    style={{ width: "100%", height: "32px", fontSize: "12px" }}
                  >
                    <option value="">{isVi ? "Chưa phân nhóm" : "Unset"}</option>
                    <option value="ARTICLE_2_1_A">Điểm a (HĐLĐ xác định/không XĐTH)</option>
                    <option value="ARTICLE_2_1_B">Điểm b (Cán bộ, công chức, viên chức)</option>
                    <option value="ARTICLE_2_1_C">Điểm c (Quân đội, công an)</option>
                    <option value="ARTICLE_2_1_D">Điểm d (Sĩ quan, quân nhân chuyên nghiệp)</option>
                    <option value="ARTICLE_2_1_DD">Điểm đ (Công nhân, viên chức quốc phòng)</option>
                    <option value="ARTICLE_2_1_G">Điểm g (Người đi làm việc ở nước ngoài)</option>
                    <option value="ARTICLE_2_1_I">Điểm i (Người quản lý doanh nghiệp)</option>
                    <option value="OTHER">Nhóm khác (OTHER)</option>
                  </select>
                </div>

                {newStatus === "CREDITED" && (
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-28`}>
                      {isVi ? "Loại thời gian tính đóng *" : "Credit Kind *"}
                    </label>
                    <select id={`${formId}-field-28`} className="input" value={newCreditKind} onChange={e => setNewCreditKind(e.target.value)}>
                      <option value="">{isVi ? "Chọn loại thời gian" : "Select credited time"}</option>
                      <option value="MATERNITY">{isVi ? "Nghỉ thai sản (theo tháng đã chọn)" : "Maternity (based on selected month)"}</option>
                      <option value="PRE_1995_STATE_SECTOR">{isVi ? "Công tác Nhà nước trước 1995" : "State employment before 1995"}</option>
                      <option value="PRE_1995_ARMED_FORCES">{isVi ? "Lực lượng vũ trang trước 1995" : "Armed forces before 1995"}</option>
                    </select>
                  </div>
                )}

                {newStatus !== "NOT_CONTRIBUTED" && (
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-29`}>
                      {isVi ? "Tiền lương làm căn cứ đóng (VND)" : "Base Wage (VND)"}
                    </label>
                    <MoneyTextBox id={`${formId}-field-29`}
                      placeholder="VD: 8.000.000"
                      className="input"
                      value={newBase}
                      onChange={setNewBase}
                      style={{ width: "100%", height: "32px", fontSize: "12px" }}
                    />
                  </div>
                )}

                {newSalaryRegime === "STATE" && (
                  <div>
                    <label style={{ display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }} htmlFor={`${formId}-field-30`}>
                      {isVi ? "Tổng hệ số đóng (Hệ số)" : "Scale Coefficient"}
                    </label>
                    <input id={`${formId}-field-30`}
                      type="text"
                      placeholder="VD: 3.33"
                      className="input"
                      value={newCoefficient}
                      onChange={(e) => setNewCoefficient(e.target.value)}
                      style={{ width: "100%", height: "32px", fontSize: "12px" }}
                    />
                  </div>
                )}

              </div>
              {newSalaryRegime === "STATE" && <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px" }}>
                {newMonth < "2004-10" && <label>{isVi ? "Thang lương đã chuyển đổi (nếu được xác nhận)" : "Confirmed converted salary scale"}<select className="input" value={newPre2004Scale} onChange={e => setNewPre2004Scale(e.target.value as typeof newPre2004Scale)}>
                  <option value="">{isVi ? "Chưa có xác nhận" : "Not confirmed"}</option><option value="ND204_PUBLIC">NĐ 204 - Công chức</option><option value="ND204_ARMED_FORCES">NĐ 204 - Lực lượng vũ trang</option><option value="ND205_ENTERPRISE">NĐ 205 - Doanh nghiệp</option>
                </select></label>}
                <label>{isVi ? "Hệ số có phụ cấp thâm niên nghề" : "Coefficient includes seniority allowance"}<select className="input" value={newSeniority} onChange={e => setNewSeniority(e.target.value as typeof newSeniority)}>
                  <option value="">{isVi ? "Chưa xác định" : "Unknown"}</option><option value="YES">{isVi ? "Có, theo hồ sơ" : "Yes, documented"}</option><option value="NO">{isVi ? "Không, theo hồ sơ" : "No, documented"}</option>
                </select></label>
              </div>}
              {editEvidence("history", isVi ? "Căn cứ tháng đóng" : "Monthly contribution evidence")}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <Button variant="secondary" disabled={loadingHistory} onClick={() => handleAddMonth(false)}>
                  <Icon name="plus" size="small" /> {isVi ? "Thêm tháng này" : "Add Month"}
                </Button>
              </div>
            </div>

            {/* History Table */}
            <p style={{ fontSize: "12px" }}>{isVi ? "Cuộn ngang để xem đầy đủ các cột tháng đóng." : "Scroll horizontally to view all contribution columns."}</p>
            <div role="region" aria-label={isVi ? "Bảng tháng đóng BHXH" : "Contribution months table"} tabIndex={0} style={{ maxHeight: "300px", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", marginBottom: "14px" }}>
              <table style={{ width: "100%", minWidth: "640px", overflowWrap: "normal", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--color-border)", background: "var(--color-surface-subtle)", textAlign: "left", color: "var(--color-text-muted)" }}>
                    <th style={{ padding: "8px 10px" }}>{isVi ? "Tháng" : "Month"}</th>
                    <th style={{ padding: "8px 10px" }}>{isVi ? "Hình thức" : "Scheme"}</th>
                    <th style={{ padding: "8px 10px" }}>{isVi ? "Chế độ lương" : "Regime"}</th>
                    <th style={{ padding: "8px 10px" }}>{isVi ? "Trạng thái" : "Status"}</th>
                    <th style={{ padding: "8px 10px" }}>{isVi ? "Căn cứ đóng / Hệ số" : "Base / Coeff"}</th>
                    <th style={{ padding: "8px 10px" }}>{isVi ? "Chứng từ" : "Evidence"}</th>
                    <th style={{ padding: "8px 10px", width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {historyMonths.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>
                        {isVi ? "Chưa có dữ liệu tháng đóng nào. Hãy thêm các tháng ở trên." : "No contribution months recorded."}
                      </td>
                    </tr>
                  ) : (
                    historyMonths.map((m) => (
                      <tr key={m.month} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }} className="font-mono">{m.month}</td>
                        <td style={{ padding: "6px 10px" }}>{m.scheme}</td>
                        <td style={{ padding: "6px 10px" }}>{m.salaryRegime}</td>
                        <td style={{ padding: "6px 10px" }}><Badge tone="soft">{m.status}</Badge></td>
                        <td style={{ padding: "6px 10px" }} className="font-mono">
                          {m.stateSalary?.totalContributionCoefficient
                            ? `Hệ số ${m.stateSalary.totalContributionCoefficient}`
                            : m.contributionBase ? formatVND(Number(m.contributionBase)) : "null"}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          {m.evidence && m.evidence.length > 0 ? (
                            <span style={{ fontSize: "11px", color: "var(--color-primary-700)" }}>
                              {m.evidence.length} {isVi ? "chứng từ" : "evidence"}
                            </span>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                              {isVi ? "Chưa nộp" : "None"}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <IconButton icon="trash" label="Xóa" onClick={() => handleRemoveMonth(m.month)} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Preview Verification Section */}
            {historyPreview && (
              <div style={{ marginBottom: "14px", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Badge tone={historyPreview.status === "READY" ? "success" : historyPreview.status === "INCOMPLETE" ? "warning" : "danger"}>
                      {historyPreview.status}
                    </Badge>
                    <strong style={{ fontSize: "12.5px" }}>
                      {isVi ? "Kết quả kiểm tra cấu trúc hồ sơ" : "Import Preview Verification"}
                    </strong>
                  </div>
                  {historyPreview.inputHash && (
                    <span className="font-mono" style={{ fontSize: "10.5px", color: "var(--color-text-muted)" }}>
                      {isVi ? "Mã đối chiếu: " : "Check Code: "}{historyPreview.inputHash.slice(0, 16)}...
                    </span>
                  )}
                </div>

                {historyPreview.issues && historyPreview.issues.length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "12px" }}>
                      {historyPreview.issues.map((iss, i) => (
                        <li key={i} style={{ color: historyPreview.status === "INVALID" ? "var(--color-danger-700)" : "var(--color-warning-800)" }}>
                          <strong>{iss.code}</strong> {iss.path ? `(${iss.path})` : ""}: {iss.message || iss.code}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {historyPreview.status === "INCOMPLETE" && (
                  <div style={{ marginTop: "10px", padding: "8px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={incompleteConfirmed}
                        onChange={(e) => setIncompleteConfirmed(e.target.checked)}
                      />
                      {isVi
                        ? "Tôi xác nhận muốn lưu hồ sơ dù còn thông tin chưa đầy đủ (INCOMPLETE)."
                        : "I confirm and agree to save this incomplete profile."}
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions: Step 1 (Preview) -> Step 2 (Save) */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {historyRecord
                  ? (isVi ? `Bản ghi hiện tại: r${historyRecord.revision}` : `Current revision: r${historyRecord.revision}`)
                  : (isVi ? "Chưa có bản ghi lưu trên máy chủ" : "No saved server record")}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <Button
                  variant="secondary"
                  onClick={handlePreviewHistory}
                  loading={previewingHistory}
                  disabled={historyMonths.length === 0}
                >
                  <Icon name="sparkles" size="small" /> {isVi ? "1. Kiểm tra / Xem trước lịch sử" : "1. Preview & Verify"}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveHistory}
                  loading={savingHistory}
                  disabled={
                    previewingHistory || !historyPreview?.inputHash ||
                    !historyPreview ||
                    historyPreview.status === "INVALID" ||
                    (historyPreview.status === "INCOMPLETE" && !incompleteConfirmed)
                  }
                >
                  <Icon name="check" size="small" /> {isVi ? "2. Lưu sổ quá trình BHXH" : "2. Save History"}
                </Button>
              </div>
            </div>
          </fieldset>
        )}

        {/* ========================================================= */}
        {/* TAB 3: SAVED ESTIMATE RECORDS                             */}
        {/* ========================================================= */}
        {activeTab === "records" && (
          <div style={{ display: "grid", gap: "12px" }}>
            {loadingRecords ? <p role="status">{isVi ? "Đang tải bản lưu…" : "Loading saved estimates…"}</p> : recordsError ? <Alert tone="danger" title={isVi ? "Chưa tải được bản lưu" : "Could not load saved estimates"}>
              <p>{recordsError}</p><Button variant="secondary" onClick={() => setRecordsAttempt(n => n + 1)}>{isVi ? "Tải lại bản lưu" : "Retry saved estimates"}</Button>
            </Alert> : savedEstimates.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--color-text-muted)" }}>
                {isVi ? "Chưa có bản ghi ước tính nào được lưu." : "No saved pension estimate records found."}
              </div>
            ) : (
              savedEstimates.map((rec) => (
                <details
                  key={rec.id}
                  className="insurance-saved-record"
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px",
                    background: "var(--color-surface)",
                    cursor: "pointer",
                  }}
                >
                  <summary aria-label={isVi ? `Chi tiết bản lưu ngày ${rec.createdAt.slice(0, 10)}` : `Saved estimate details ${rec.createdAt.slice(0, 10)}`}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                      <Badge tone={rec.assessment.assessmentStatus === "ELIGIBLE" ? "success" : "warning"}>
                        {rec.assessment.assessmentStatus}
                      </Badge>
                      <strong className="font-mono" style={{ fontSize: "13px" }}>{rec.engineCode}</strong>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                        (Lịch r{rec.historyRevision})
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {formatDateVN(rec.createdAt)}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "8px", fontSize: "12.5px" }}>
                    <div>
                      {isVi ? "Lương hưu:" : "Monthly:"}{" "}
                      <strong className="font-mono" style={{ color: "var(--color-primary-700)" }}>
                        {rec.assessment.monthlyPension != null ? formatVND(Number(rec.assessment.monthlyPension)) : unknown}
                      </strong>
                    </div>
                    <div>
                      {isVi ? "Tỷ lệ hưởng:" : "Rate:"} <strong>
                        {rec.assessment.breakdown?.find(b => b.code.includes("RATE") || b.unit === "PERCENT")?.value != null ? `${rec.assessment.breakdown.find(b => b.code.includes("RATE") || b.unit === "PERCENT")!.value}%` : unknown}
                      </strong>
                    </div>
                    <div>
                      {isVi ? "Tổng tháng:" : "Months:"} <strong>{rec.assessment.countedMonths ?? unknown}</strong>
                    </div>
                  </div>
                  </summary>

                  {/* Expanded detail view directly from saved record (no recalculation) */}
                  {(
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed var(--color-border)", fontSize: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <span style={{ color: "var(--color-text-muted)" }}>{isVi ? "Ngày thẩm định:" : "Assessed On:"}</span>{" "}
                          <strong>{rec.assessedOn}</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--color-text-muted)" }}>{isVi ? "Mã đối chiếu bản lưu:" : "Verification Code:"}</span>{" "}
                          <span className="font-mono">{rec.integrityHash.slice(0, 16)}...</span>
                        </div>
                      </div>

                      {rec.assessment.breakdown && rec.assessment.breakdown.length > 0 && (
                        <div style={{ marginTop: "8px" }}>
                          <strong style={{ display: "block", marginBottom: "4px" }}>{isVi ? "Chi tiết các yếu tố tính toán:" : "Calculation Breakdown:"}</strong>
                          <div style={{ display: "grid", gap: "4px" }}>
                            {rec.assessment.breakdown.map((b, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-sm)" }}>
                                <span>{b.code}</span>
                                <strong className="font-mono">{b.unit === "VND" && b.value ? formatVND(Number(b.value)) : b.value} {b.unit !== "VND" ? b.unit : ""}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {rec.assessment.citations && rec.assessment.citations.length > 0 && (
                        <div style={{ marginTop: "8px" }}>
                          <strong style={{ display: "block", marginBottom: "4px" }}>{isVi ? "Căn cứ pháp lý ghi nhận:" : "Recorded Statutory Citations:"}</strong>
                          <ul style={{ margin: "2px 0 0", paddingLeft: "16px" }}>
                            {rec.assessment.citations.map((c) => (
                              <li key={c.id}>
                                {c.instrument} - {c.locator}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              ))
            )}
          </div>
        )}
        </fieldset>
      </div>
    </Modal>
  );
}
