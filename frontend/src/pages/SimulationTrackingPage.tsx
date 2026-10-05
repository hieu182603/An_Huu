import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
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
} from "../services/plans";
import {
  listActualMonths,
  getActualMonth,
  writeActualMonth,
  reforecastPlan,
  calculateLocalReconciliation,
  ACTUAL_KIND_LABELS,
  getActualKindLabel,
  type ActualKind,
  type ActualPayload,
  type ActualEntry,
  type ActualMonthDetail,
  type ActualForecastResult,
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
  const [activeTab, setActiveTab] = useState<"what-if" | "actuals">("what-if");

  // ==========================================
  // TAB 1: WHAT-IF & COMPARE (FE-T08) STATE
  // ==========================================
  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [scenario, setScenario] = useState<"BASE" | "ADVERSE" | "FAVORABLE">("BASE");

  const [simRetireAge, setSimRetireAge] = useState(profile.goal.targetRetireAge || 60);
  const [simMonthlySave, setSimMonthlySave] = useState(profile.plan.monthlySavings || 5000000);
  const [simExpense, setSimExpense] = useState(
    profile.goal.monthlyExpenseInRetirement || profile.expenses.essentialExpense + profile.expenses.lifestyleExpense || 20000000
  );

  // Hypothetical asset overrides for what-if
  const [overrideCash, setOverrideCash] = useState<string>("");
  const [overrideRealEstate, setOverrideRealEstate] = useState<string>("");
  const [overrideStock, setOverrideStock] = useState<string>("");

  const [simResult, setSimResult] = useState<RetirementPreviewResult | null>(null);
  const [comparisonDelta, setComparisonDelta] = useState<SimulatePlanResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

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
    return `${birthYear + lifeExp}-12`;
  }, [birthYear, profile.goal.lifeExpectancy]);

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
        .catch(() => {
          // Fallback to standalone preview
          previewMonthlyRetirement(payload)
            .then((res) => {
              if (!active) return;
              setSimResult(res);
              setComparisonDelta(null);
            })
            .catch((err) => {
              if (!active) return;
              setSimError(err instanceof Error ? err.message : (language === "en" ? "Unable to run simulation." : "Không thể chạy mô phỏng."));
            });
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

  const simSummary = simResult?.calculation?.summary;
  const currentSummary = currentVersion?.preview.calculation?.summary;

  const simTargetFund = simSummary ? parseFloat(simSummary.atRetirement.requiredFund) : 0;
  const simProjectedFund = simSummary ? parseFloat(simSummary.atRetirement.projectedFund) : 0;
  const simGap = simSummary ? parseFloat(simSummary.retirementFundingShortfall) : 0;
  const simScore = simSummary?.atRetirement.coveragePercent
    ? Math.round(parseFloat(simSummary.atRetirement.coveragePercent))
    : 0;

  const resetToBaseline = () => {
    setSimRetireAge(profile.goal.targetRetireAge || 60);
    setSimMonthlySave(profile.plan.monthlySavings || 5000000);
    setSimExpense(profile.goal.monthlyExpenseInRetirement || profile.expenses.essentialExpense + profile.expenses.lifestyleExpense || 20000000);
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
    if (!simResult || !simResult.inputHash || !simResult.selection) {
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
                    <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Real Estate" : "Bất động sản"} ({language === "en" ? "original" : "gốc"}: {formatVND(profile.assets.realEstateValue)})
                    </label>
                    <input
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
                    <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      {language === "en" ? "Stocks & Investment Funds" : "Cổ phiếu & Quỹ"} ({language === "en" ? "original" : "gốc"}: {formatVND(profile.assets.stockFundValue)})
                    </label>
                    <input
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
                    <span>{isSimulating ? (language === "en" ? "Running T08 projection..." : "Đang chạy dự phóng T08...") : (language === "en" ? "Exact server-side projection" : "Dự phóng chuẩn xác từ server")}</span>
                  </div>
                  <h2>{language === "en" ? "Scenario Simulation Results" : "Kết quả mô phỏng kịch bản"}</h2>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {(overrideCash || overrideRealEstate || overrideStock || simRetireAge !== (profile.goal.targetRetireAge || 60)) && (
                    <Badge tone="soft">
                      {WARNING_MESSAGES.HYPOTHETICAL_VALUES_PROFILE_UNCHANGED}
                    </Badge>
                  )}
                  <Badge tone={simGap <= 0 ? "success" : "warning"}>
                    {simGap <= 0 ? (language === "en" ? "GOAL SURPLUS" : "DƯ THỪA MỤC TIÊU") : (language === "en" ? "FUNDING SHORTFALL" : "CÒN THIẾU HỤT")}
                  </Badge>
                </div>
              </header>

              {simError && (
                <div style={{ margin: "16px 0" }}>
                  <Alert tone="danger" title={language === "en" ? "Simulation Error" : "Lỗi chạy mô phỏng"}>
                    {simError}
                  </Alert>
                </div>
              )}

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
                  <h2>{language === "en" ? "Insights from T08 Retirement Engine" : "Nhận định từ động cơ tính toán hưu trí T08"}</h2>
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
                  disabled={isSimulating || !simResult}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <Card style={{ padding: "var(--space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)" }}>
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
              <strong className="font-mono" style={{ fontSize: "22px", display: "block", marginTop: "8px" }}>
                {formatVND(Number(localReconcile.householdSurplus))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Income" : "Thu nhập"} ({formatVND(Number(localReconcile.totals.INCOME))}) - {language === "en" ? "Expenses" : "Chi tiêu"} ({formatVND(Number(localReconcile.totals.EXPENSE))}) - {language === "en" ? "Debt" : "Trả nợ"} ({formatVND(Number(localReconcile.totals.DEBT_PAYMENT))})
              </p>
            </Card>

            <Card style={{ padding: "var(--space-4)" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                {language === "en" ? "ACTUAL RETIREMENT CONTRIBUTIONS" : "TỔNG ĐÓNG GÓP THỰC TẾ VÀO QUỸ HƯU"}
              </span>
              <strong className="font-mono" style={{ fontSize: "22px", display: "block", marginTop: "8px", color: "var(--color-primary-700)" }}>
                {formatVND(Number(localReconcile.actualContribution))}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "11.5px", color: "var(--color-text-muted)" }}>
                {language === "en" ? "Plan target" : "Mục tiêu kế hoạch"}: {formatVND(profile.plan.monthlySavings)}/{language === "en" ? "mo" : "tháng"} • {language === "en" ? "Variance" : "Chênh lệch"}:{" "}
                <span className="font-mono">
                  {formatVND(Number(localReconcile.actualContribution) - profile.plan.monthlySavings)}
                </span>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <Badge tone="soft">{language === "en" ? "T09 REFORECAST" : "T09 DỰ BÁO LẠI"}</Badge>
                <h2>{language === "en" ? "Reforecast from Anchored Actual Balance" : "Dự báo lại từ mốc thực tế đã chốt"}</h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: "12.5px" }}>
                  {language === "en"
                    ? `Anchor actual verified balance of ${selectedPeriod} to project future months.`
                    : `Lấy số dư thực tế cuối tháng ${selectedPeriod} làm mốc neo để chiếu lại các tháng tương lai.`}
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleRunReforecast}
                loading={reforecasting}
                disabled={!activePlan?.id || !currentVersion?.id}
              >
                <Icon name="sparkles" size="small" /> {language === "en" ? "Run Plan Reforecast" : "Chạy dự báo lại kế hoạch"}
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

                {/* 3-Layer Comparison Table: Forecast vs Actual vs Reforecast */}
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

                <div style={{ marginTop: "16px", padding: "12px", background: "var(--color-surface-subtle)", borderRadius: "var(--radius-md)" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>
                    {language === "en" ? "REFORECAST CONVENTIONS & LIMITATIONS:" : "QUY ƯỚC DỰ BÁO LẠI (T09 LIMITATIONS):"}
                  </span>
                  <ul style={{ margin: "4px 0 0", paddingLeft: "20px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                    <li>
                      {language === "en"
                        ? "Reforecast preserves the return rates and future cash flows of the selected plan version."
                        : "Dự báo lại giữ nguyên các tỷ suất sinh lời và dòng tiền tương lai của phiên bản kế hoạch được chọn."}
                    </li>
                    <li>
                      {language === "en"
                        ? "Past extraordinary one-off market fluctuations are not automatically projected into the future."
                        : "Các khoản biến động bất thường thực tế trong quá khứ không tự động lặp lại trong tương lai."}
                    </li>
                    <li>
                      {language === "en"
                        ? "Household surplus is not automatically deposited into retirement fund unless user explicitly contributes it."
                        : "Thặng dư thu chi gia đình không tự động nộp vào quỹ hưu trí trừ khi người dùng thực nộp."}
                    </li>
                    <li>
                      {language === "en"
                        ? "Reforecast is an on-the-fly advisory calculation, not automatically applied to the official plan."
                        : "Dự báo lại là kết quả tính toán tức thời để tham khảo, không tự động lưu hoặc áp dụng vào kế hoạch chính thức."}
                    </li>
                  </ul>
                </div>
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
    </>
  );
}
