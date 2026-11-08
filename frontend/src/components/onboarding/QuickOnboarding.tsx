import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { Button, Card, Icon, Input, useNotification } from "../ui";
import { CurrencyInput } from "../CurrencyInput";
import { useFinancialProfile, type OnboardingDraftData } from "../../context/FinancialProfileContext";
import { useRetirementPlan } from "../../context/RetirementPlanContext";
import { useI18n } from "../../i18n";
import { createQuickStartProfileV2 } from "../../services/financialProfile";
import { readAndClearSimulatorPrefill, type SimulatorPrefillData } from "../../services/simulatorPrefill";
import {
  fetchUserPortfolioPolicies,
  fetchUserPortfolioPolicyDetail,
  type PortfolioPolicyDetail,
  type PortfolioAnswerItem,
} from "../../services/portfolios";
import { resumeDestination } from "../../services/navigation";
import "./quick-onboarding.css";

function reserveMonthsText(reserve: number, spending: number) {
  if (!reserve || !spending) return { text: "", warn: false };
  const months = reserve / spending;
  const warn = months > 24;
  const n = months >= 10 ? Math.round(months) : Math.round(months * 10) / 10;
  return {
    text: warn
      ? `≈ ${String(n).replace(".", ",")} tháng chi tiêu. Con số này lớn hơn nhiều mức thường gặp (3 đến 12 tháng), hãy kiểm tra lại số 0.`
      : `≈ ${String(n).replace(".", ",")} tháng chi tiêu hiện tại.`,
    warn,
  };
}

export function QuickOnboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();
  const { language } = useI18n();
  const isEn = language === "en";

  const { onboardingDraft, saveOnboardingDraft, completeOnboarding } = useFinancialProfile();
  const { updateDraft } = useRetirementPlan();

  const planningMonth = useMemo(() => {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  }, []);

  const currentYear = new Date().getFullYear();

  // 1. Check simulator prefill on initial mount
  const [simPrefill, setSimPrefill] = useState<SimulatorPrefillData | null>(() => {
    return readAndClearSimulatorPrefill();
  });

  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    if (["quick-money", "income"].includes(onboardingDraft?.step || "")) return 2;
    if (["quick-family", "personal"].includes(onboardingDraft?.step || "")) return 3;
    if (["quick-risk", "contribution"].includes(onboardingDraft?.step || "")) return 4;
    return 1;
  });

  // Step 1: Desire & Timeline
  const [birthMonth, setBirthMonth] = useState<string>(() => {
    return onboardingDraft?.birthMonth || "";
  });

  const [desiredRetirementMonth, setDesiredRetirementMonth] = useState<string>(() => {
    return onboardingDraft?.desiredRetirementMonth || "";
  });

  const [monthlyExpense, setMonthlyExpense] = useState<number>(() => {
    if (simPrefill?.monthlyExpenseToday) return simPrefill.monthlyExpenseToday;
    return onboardingDraft?.essentialExpense || 0;
  });

  // Suggested birth year from simulator
  const suggestedBirthYear = useMemo(() => {
    if (!simPrefill?.currentAge) return null;
    return currentYear - simPrefill.currentAge;
  }, [simPrefill, currentYear]);

  // Calculated age from birth month
  const calculatedAge = useMemo(() => {
    if (!birthMonth || birthMonth.length < 4) return 0;
    const bYear = parseInt(birthMonth.slice(0, 4), 10);
    if (isNaN(bYear)) return 0;
    return Math.max(0, currentYear - bYear);
  }, [birthMonth, currentYear]);

  const currentRetireAge = useMemo(() => {
    if (desiredRetirementMonth && birthMonth) {
      const bYear = parseInt(birthMonth.slice(0, 4), 10);
      const rYear = parseInt(desiredRetirementMonth.slice(0, 4), 10);
      if (!isNaN(bYear) && !isNaN(rYear)) return rYear - bYear;
    }
    return 60;
  }, [desiredRetirementMonth, birthMonth]);

  const handleRetireAgeChange = (ageVal: number) => {
    if (birthMonth) {
      const bYear = parseInt(birthMonth.slice(0, 4), 10);
      const bMonth = birthMonth.slice(5, 7) || "01";
      if (!isNaN(bYear)) {
        setDesiredRetirementMonth(`${bYear + ageVal}-${bMonth}`);
        return;
      }
    }
    const curYear = new Date().getFullYear();
    setDesiredRetirementMonth(`${curYear + Math.max(1, ageVal - 30)}-01`);
  };

  // Step 2: Current Finances
  const [hasNoSalary, setHasNoSalary] = useState(false);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(() => {
    return onboardingDraft?.primaryIncome || 0;
  });

  const [currentExpense, setCurrentExpense] = useState<number>(() => {
    return onboardingDraft?.essentialExpense || 0;
  });

  const [retirementSavings, setRetirementSavings] = useState<number>(() => {
    return onboardingDraft?.cashSavings || 0;
  });

  const [hasDebt, setHasDebt] = useState<boolean>(() => {
    return Boolean(onboardingDraft?.hasDebt && (onboardingDraft.consumerDebt > 0 || onboardingDraft.mortgageDebt > 0));
  });

  const [debtBalance, setDebtBalance] = useState<number>(() => {
    return (onboardingDraft?.mortgageDebt || 0) + (onboardingDraft?.consumerDebt || 0);
  });

  const [debtMonthlyPayment, setDebtMonthlyPayment] = useState<number>(() => {
    return onboardingDraft?.monthlyDebtService || 0;
  });

  const [emergencyAmount, setEmergencyAmount] = useState<number>(() => {
    return onboardingDraft?.cashSavings ? Math.round(onboardingDraft.cashSavings * 0.2) : 0;
  });

  const reserveInfo = useMemo(() => {
    return reserveMonthsText(emergencyAmount, currentExpense || monthlyExpense);
  }, [emergencyAmount, currentExpense, monthlyExpense]);

  // Step 3: Family (demo "Gia đình") & Obligations
  const [maritalStatus, setMaritalStatus] = useState<"" | "SINGLE" | "MARRIED" | "OTHER">(() => {
    // Server drafts come back with Vietnamese labels; accept both forms.
    const v = onboardingDraft?.quickProfile?.personal?.maritalStatus ?? onboardingDraft?.maritalStatus;
    const byLabel: Record<string, "SINGLE" | "MARRIED" | "OTHER"> = { "Độc thân": "SINGLE", "Đã kết hôn": "MARRIED", "Khác": "OTHER" };
    return v === "SINGLE" || v === "MARRIED" || v === "OTHER" ? v : (v && byLabel[v]) || "";
  });
  const [dependents, setDependents] = useState<string>(() => {
    const v = onboardingDraft?.dependents;
    return onboardingDraft?.step && ["quick-risk", "contribution"].includes(onboardingDraft.step) && Number.isInteger(v) ? String(v) : "";
  });
  const dependentsNumber = dependents.trim() === "" ? null : Number(dependents);
  const family = { maritalStatus: maritalStatus || undefined, dependents: dependentsNumber };

  // Obligations states
  const [childEnabled, setChildEnabled] = useState(false);
  const [childAmount, setChildAmount] = useState(5000000);
  const [childDuration, setChildDuration] = useState("unknown");
  const [childEnd, setChildEnd] = useState("");
  const [childIncluded, setChildIncluded] = useState<"yes" | "no">("yes");

  const [parentEnabled, setParentEnabled] = useState(false);
  const [parentAmount, setParentAmount] = useState(3000000);
  const [parentDuration, setParentDuration] = useState("unknown");
  const [parentEnd, setParentEnd] = useState("");
  const [parentIncluded, setParentIncluded] = useState<"yes" | "no">("yes");

  const [debtEnabled, setDebtEnabled] = useState(hasDebt);
  const [debtRate, setDebtRate] = useState(8.5);

  const [goalEnabled, setGoalEnabled] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState(200000000);
  const [goalMonth, setGoalMonth] = useState("");
  const [goalDeferrable, setGoalDeferrable] = useState<"no" | "yes">("no");

  const [pensionStatus, setPensionStatus] = useState<"unknown" | "none" | "known">("unknown");
  const [pension, setPension] = useState(5000000);
  const [pensionStart, setPensionStart] = useState("");

  // Step 4: Safety & Risk survey
  const [comfortReaction, setComfortReaction] = useState<"sell" | "hold" | "calm">("hold");
  const [stability, setStability] = useState("stable");
  const [priority, setPriority] = useState("balanced");
  const [lossStatus, setLossStatus] = useState<"unknown" | "known" | "percent">("unknown");
  const [lossAmount, setLossAmount] = useState(50000000);
  const [lossPercent, setLossPercent] = useState(15);

  // Step 4: Risk survey
  const [policyDetail, setPolicyDetail] = useState<PortfolioPolicyDetail | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load published policy questions for Step 3
  useEffect(() => {
    let active = true;
    setLoadingPolicy(true);
    fetchUserPortfolioPolicies(1, 50)
      .then(async (res) => {
        if (!active) return;
        if (res.status === "AVAILABLE" && res.items.length > 0) {
          const detail = await fetchUserPortfolioPolicyDetail(res.items[0].id);
          if (active) setPolicyDetail(detail);
        }
      })
      .catch(() => {
        // fallback
      })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Compute Q_HORIZON default choice
  const autoHorizonChoiceId = useMemo(() => {
    if (!desiredRetirementMonth || !policyDetail) return null;
    const [cy, cm] = planningMonth.split("-").map(Number);
    const [ry, rm] = desiredRetirementMonth.split("-").map(Number);
    const diffMonths = (ry - cy) * 12 + (rm - cm);
    const years = diffMonths / 12;

    let targetId = "HOR_SHORT";
    if (years >= 20) targetId = "HOR_VERY_LONG";
    else if (years >= 12) targetId = "HOR_LONG";
    else if (years >= 5) targetId = "HOR_MEDIUM";
    else targetId = "HOR_SHORT";

    // Only auto-select if choice exists in policy question
    const horizonQ = policyDetail?.data?.questions?.find((q) => q.id === "Q_HORIZON");
    if (horizonQ && horizonQ.choices?.some((c) => c.id === targetId)) {
      return targetId;
    }
    return null;
  }, [desiredRetirementMonth, planningMonth, policyDetail]);

  // Set Q_HORIZON automatically once policy is loaded
  useEffect(() => {
    if (autoHorizonChoiceId && !answers.Q_HORIZON) {
      setAnswers((prev) => ({ ...prev, Q_HORIZON: autoHorizonChoiceId }));
    }
  }, [autoHorizonChoiceId]);

  // Compute Q_FINANCIAL_CAPACITY suggestion
  const suggestedCapacityId = useMemo(() => {
    const actualIncome = hasNoSalary ? 0 : monthlyIncome;
    if (actualIncome <= 0) return null;
    const debtPay = hasDebt ? debtMonthlyPayment : 0;
    const surplus = actualIncome - currentExpense - debtPay;
    const ratio = surplus / actualIncome;

    // Below 10% -> CAP_TIGHT; 10% or more -> CAP_STABLE. NEVER CAP_STRONG!
    if (ratio < 0.1) return "CAP_TIGHT";
    return "CAP_STABLE";
  }, [hasNoSalary, monthlyIncome, currentExpense, hasDebt, debtMonthlyPayment]);

  const questions = policyDetail?.data.questions || [];
  const allAnswered = questions.length > 0 && questions.every((q) => Boolean(answers[q.id]));

  // Step 1 -> Step 2
  const handleNextStep1 = async () => {
    setValidationError(null);
    if (!birthMonth || birthMonth.length < 7) {
      setValidationError(isEn ? "Please enter your birth month." : "Vui lòng chọn tháng và năm sinh của bạn.");
      return;
    }
    if (!desiredRetirementMonth || desiredRetirementMonth.length < 7) {
      setValidationError(isEn ? "Please select your desired retirement month." : "Vui lòng chọn tháng bạn muốn nghỉ hưu.");
      return;
    }
    if (!monthlyExpense || monthlyExpense <= 0) {
      setValidationError(isEn ? "Please enter your desired monthly spending." : "Vui lòng nhập mức chi mong muốn mỗi tháng.");
      return;
    }

    setWorking(true);
    try {
      const partialProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome: 0,
        monthlyExpense,
        retirementSavings: 0,
        valuationDate: planningMonth + "-01",
      });
      const ok = await saveOnboardingDraft({
        birthMonth,
        desiredRetirementMonth,
        step: "quick-money",
        quickProfile: partialProfile,
      } as Partial<OnboardingDraftData>);
      if (!ok) {
        setValidationError(
          isEn
            ? "Could not save your draft. Please check your network connection and try again."
            : "Chưa thể lưu bản nháp. Vui lòng kiểm tra kết nối mạng và thử lại."
        );
        return;
      }
      setStep(2);
      window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
    } finally {
      setWorking(false);
    }
  };

  // Step 2 -> Step 3
  const handleNextStep2 = async () => {
    setValidationError(null);
    if (!hasNoSalary && monthlyIncome <= 0) {
      setValidationError(
        isEn
          ? "Please enter your monthly income or select 'No salary income'."
          : "Vui lòng nhập thu nhập mỗi tháng hoặc chọn 'Không còn thu nhập từ lương'."
      );
      return;
    }
    if (currentExpense <= 0) {
      setValidationError(isEn ? "Please enter your current monthly expenses." : "Vui lòng nhập chi tiêu hiện tại mỗi tháng.");
      return;
    }
    if (hasDebt && (debtBalance <= 0 || debtMonthlyPayment <= 0)) {
      setValidationError(
        isEn
          ? "Please enter your debt balance and monthly payment greater than 0, or select 'No'."
          : "Vui lòng nhập tổng dư nợ và số tiền trả nợ mỗi tháng lớn hơn 0, hoặc chọn 'Không' nếu không có nợ."
      );
      return;
    }

    setWorking(true);
    try {
      const partialProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome: hasNoSalary ? 0 : monthlyIncome,
        monthlyExpense: currentExpense,
        retirementSavings,
        hasDebt,
        debtBalance: hasDebt ? debtBalance : undefined,
        debtMonthlyPayment: hasDebt ? debtMonthlyPayment : undefined,
        valuationDate: planningMonth + "-01",
      });
      const ok = await saveOnboardingDraft({
        birthMonth,
        desiredRetirementMonth,
        step: "quick-family",
        quickProfile: partialProfile,
      } as Partial<OnboardingDraftData>);
      if (!ok) {
        setValidationError(
          isEn
            ? "Could not save your draft. Please check your network connection and try again."
            : "Chưa thể lưu bản nháp. Vui lòng kiểm tra kết nối mạng và thử lại."
        );
        return;
      }
      setStep(3);
      window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
    } finally {
      setWorking(false);
    }
  };

  // Step 3 (family) -> Step 4
  const handleNextStep3 = async () => {
    setValidationError(null);
    if (dependentsNumber !== null && (!Number.isInteger(dependentsNumber) || dependentsNumber < 0 || dependentsNumber > 30)) {
      setValidationError(isEn ? "Dependents must be a whole number from 0 to 30, or left blank." : "Số người phụ thuộc cần là số nguyên từ 0 đến 30, hoặc để trống.");
      return;
    }
    setWorking(true);
    try {
      const partialProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome: hasNoSalary ? 0 : monthlyIncome,
        monthlyExpense: currentExpense,
        retirementSavings,
        hasDebt,
        debtBalance: hasDebt ? debtBalance : undefined,
        debtMonthlyPayment: hasDebt ? debtMonthlyPayment : undefined,
        valuationDate: planningMonth + "-01",
        ...family,
      });
      const ok = await saveOnboardingDraft({
        birthMonth,
        desiredRetirementMonth,
        maritalStatus: maritalStatus || "",
        dependents: dependentsNumber ?? 0,
        step: "quick-risk",
        quickProfile: partialProfile,
      } as Partial<OnboardingDraftData>);
      if (!ok) {
        setValidationError(
          isEn
            ? "Could not save your draft. Please check your network connection and try again."
            : "Chưa thể lưu bản nháp. Vui lòng kiểm tra kết nối mạng và thử lại."
        );
        return;
      }
      setStep(4);
      window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
    } finally {
      setWorking(false);
    }
  };

  // Step 4 Completion
  const handleComplete = async () => {
    if (!allAnswered || working) return;
    setWorking(true);
    try {
      const finalQuickProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome: hasNoSalary ? 0 : monthlyIncome,
        monthlyExpense: currentExpense,
        retirementSavings,
        hasDebt,
        debtBalance: hasDebt ? debtBalance : undefined,
        debtMonthlyPayment: hasDebt ? debtMonthlyPayment : undefined,
        valuationDate: planningMonth + "-01",
        ...family,
      });

      const answerItems: PortfolioAnswerItem[] = Object.entries(answers).map(([questionId, choiceId]) => ({
        questionId,
        choiceId,
      }));

      // Update retirement plan draft answers and set contribution to 0 so required contribution is displayed
      updateDraft({
        policyVersionId: policyDetail?.id,
        answers: answerItems,
        monthlyContribution: "0",
        monthlyExpenseToday: String(monthlyExpense),
        whatIf: desiredRetirementMonth?.trim() ? { retirementMonth: desiredRetirementMonth } : undefined,
      });

      if (typeof window !== "undefined") {
        window.sessionStorage?.setItem("anhuu_just_onboarded", "1");
      }

      const ok = await completeOnboarding({
        ...onboardingDraft,
        birthMonth,
        desiredRetirementMonth,
        quickProfile: finalQuickProfile,
        step: "quick-risk",
        updatedAt: new Date().toISOString(),
      } as OnboardingDraftData);

      if (ok) {
        notify.success(
          isEn ? "Profile Initialized Successfully" : "Khởi tạo hồ sơ thành công",
          isEn ? "Your first retirement plan is ready." : "Bản kế hoạch hưu trí đầu tiên của bạn đã sẵn sàng."
        );
        navigate(resumeDestination(location.state?.from, "user", "/user/plan"), {
          replace: true,
          state: { fromOnboarding: true },
        });
      } else {
        notify.error(
          isEn ? "Could not complete profile" : "Chưa thể hoàn tất hồ sơ",
          isEn ? "Please retry." : "Vui lòng bấm Thử lại."
        );
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="quick-onboarding-container qo-shell setup-shell">
      {/* Demo layout: step rail on the left, one card per step on the right. */}
      <aside className="qo-aside setup-aside">
        <span className="qo-eyebrow">{isEn ? "A gentle start" : "Một khởi đầu nhẹ nhàng"}</span>
        <h2>{isEn ? <>Your plan,<br />one step at a time.</> : <>Kế hoạch của bạn,<br />từng bước một.</>}</h2>
        <p>{isEn ? "Approximate numbers are fine. You can adjust them later." : "Chỉ cần con số gần đúng. Bạn có thể điều chỉnh sau."}</p>
        <ol className="onboarding-stages qo-steps" aria-label={isEn ? "Setup stages" : "Các chặng khai báo"}>
          {[
            [isEn ? "Your wish" : "Mong muốn", isEn ? "How do you want to retire?" : "Bạn muốn nghỉ hưu thế nào?"],
            [isEn ? "Money today" : "Tiền hôm nay", isEn ? "What do you have now?" : "Bạn đang có những gì?"],
            [isEn ? "Family" : "Gia đình", isEn ? "Your financial responsibilities" : "Trách nhiệm tài chính của bạn"],
            [isEn ? "Risk tolerance" : "Khả năng chịu rủi ro", isEn ? "How much movement can you accept?" : "Hiểu khả năng chịu biến động"],
          ].map(([title, sub], i) => (
            <li key={title} aria-current={step === i + 1 ? "step" : undefined} className={step > i + 1 ? "is-done" : ""}>
              <span className="qo-step-number" aria-hidden="true">{step > i + 1 ? <Icon name="check" size="small" /> : i + 1}</span>
              <span className="qo-step-copy">{title}<small>{sub}</small></span>
            </li>
          ))}
        </ol>
        <p className="qo-privacy"><Icon name="shield" size="small" />{isEn ? "Saved to your profile. Edit any time." : "Lưu vào hồ sơ của bạn, sửa lại bất cứ lúc nào."}</p>
      </aside>

      <section className="qo-main">
      <div className="qo-card card setup-card">
      <div className="qo-caption setup-caption">
        <span>{isEn ? `STEP ${step}/4` : `BƯỚC ${step}/4`}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <Icon name="sparkles" size="small" />
          {step === 4 ? (isEn ? "Your result is next" : "Sắp có kết quả") : (isEn ? "At your own pace" : "Từng phần, theo nhịp của bạn")}
        </span>
      </div>

      {/* Simulator prefilled badge */}
      {simPrefill && (
        <div className="quick-sim-badge" data-testid="sim-prefilled-badge">
          <Icon name="sparkles" size="small" />
          <span>{isEn ? "Prefilled from your simulation" : "Đã điền từ bản mô phỏng của bạn"}</span>
        </div>
      )}

      {/* Validation alert */}
      {validationError && (
        <div role="alert" className="qo-error">
          {validationError}
        </div>
      )}

      {/* SCREEN 1: MONG MUỐN */}
      {step === 1 && (
        <section aria-labelledby="step1-title">
          <header className="quick-onboarding-header">
            <h1 id="step1-title">{isEn ? "What do you wish for?" : "Bạn mong muốn điều gì?"}</h1>
            <p>{isEn ? "Start with your age and the lifestyle you want." : "Hãy bắt đầu với độ tuổi và mức sống bạn muốn có."}</p>
          </header>

          <div className="quick-field-group">
            <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div className="quick-field">
                <Input
                  label={isEn ? "Date of birth" : "Ngày tháng năm sinh"}
                  type="date"
                  value={birthMonth.length === 7 ? `${birthMonth}-01` : birthMonth}
                  placeholder={isEn ? "DD/MM/YYYY" : "Ngày/tháng/năm"}
                  onChange={(val) => {
                    const ym = val.slice(0, 7);
                    setBirthMonth(ym);
                    if (ym && currentRetireAge) {
                      const bYear = parseInt(ym.slice(0, 4), 10);
                      const bMonth = ym.slice(5, 7) || "01";
                      if (!isNaN(bYear)) {
                        setDesiredRetirementMonth(`${bYear + currentRetireAge}-${bMonth}`);
                      }
                    }
                  }}
                />
              </div>

              <div className="quick-field">
                <Input
                  label={isEn ? "What age do you want to retire?" : "Bạn muốn nghỉ hưu năm bao nhiêu tuổi?"}
                  type="number"
                  min={calculatedAge > 0 ? calculatedAge : 18}
                  max={80}
                  suffix={isEn ? "years old" : "tuổi"}
                  value={String(currentRetireAge)}
                  onChange={(val) => handleRetireAgeChange(Number(val) || 60)}
                />
                {desiredRetirementMonth && (
                  <p className="retirement-estimate" style={{ marginTop: "4px", fontSize: "12px", color: "var(--color-primary-700, #334DAF)" }}>
                    {isEn
                      ? `Estimated retirement: month ${desiredRetirementMonth.slice(5)}/${desiredRetirementMonth.slice(0, 4)}`
                      : `Dự kiến nghỉ hưu: tháng ${desiredRetirementMonth.slice(5)}/${desiredRetirementMonth.slice(0, 4)}`}
                  </p>
                )}
              </div>
            </div>

            <div className="quick-field" style={{ marginTop: "16px" }}>
              <CurrencyInput
                label={isEn ? "Retirement monthly spending" : "Chi tiêu nghỉ hưu mỗi tháng"}
                value={monthlyExpense}
                onChange={(val) => setMonthlyExpense(val)}
                placeholder="0"
                suffix="VND"
              />
              <p className="quick-helper-text" style={{ fontSize: "12px", color: "var(--muted, #64748b)", marginTop: "4px" }}>
                {isEn ? "At today's prices; excluding debt payments and separate support schedules." : "Theo giá hôm nay; chưa gồm trả nợ và khoản hỗ trợ có lịch riêng."}
              </p>
            </div>
          </div>

          <div className="quick-actions form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
            <span className="small muted" style={{ fontSize: "13px", color: "var(--muted, #64748b)" }}>{isEn ? "Can be adjusted later" : "Có thể chỉnh sau"}</span>
            <Button variant="primary" disabled={working} onClick={handleNextStep1}>
              {isEn ? "Continue →" : "Tiếp tục →"}
            </Button>
          </div>
        </section>
      )}

      {/* SCREEN 2: TIỀN HÔM NAY */}
      {step === 2 && (
        <section aria-labelledby="step2-title">
          <header className="quick-onboarding-header">
            <h1 id="step2-title">{isEn ? "Your money today" : "Tiền của bạn hôm nay"}</h1>
            <p>{isEn ? "Approximate numbers are fine. No need to list every item." : "Nhập con số gần đúng cũng được. Chưa cần kê từng khoản."}</p>
          </header>

          <div className="quick-field-group">
            <div className="quick-field">
              <CurrencyInput
                label={isEn ? "Monthly income after tax" : "Thu nhập mỗi tháng (sau thuế)"}
                value={hasNoSalary ? 0 : monthlyIncome}
                onChange={(val) => setMonthlyIncome(val)}
                disabled={hasNoSalary}
              />
              <div className="quick-chips-row">
                <button
                  type="button"
                  className={`quick-chip ${hasNoSalary ? "is-active" : ""}`}
                  onClick={() => {
                    setHasNoSalary((prev) => {
                      if (!prev) setMonthlyIncome(0);
                      return !prev;
                    });
                  }}
                >
                  {isEn ? "No salary income" : "Không còn thu nhập từ lương"}
                </button>
              </div>
            </div>

            <div className="quick-field">
              <CurrencyInput
                label={isEn ? "Current monthly living expenses" : "Chi tiêu hiện tại mỗi tháng"}
                value={currentExpense}
                onChange={(val) => setCurrentExpense(val)}
              />
              <div className="quick-chips-row">
                <button
                  type="button"
                  className={`quick-chip ${currentExpense === monthlyExpense ? "is-active" : ""}`}
                  onClick={() => setCurrentExpense(monthlyExpense)}
                >
                  {isEn ? "Same as desired spending" : "Bằng mức chi mong muốn"}
                </button>
              </div>
            </div>

            <div className="quick-field">
              <CurrencyInput
                label={isEn ? "Money saved for retirement" : "Tiền bạn đã để dành cho hưu trí"}
                value={retirementSavings}
                onChange={(val) => setRetirementSavings(val)}
                helper={isEn
                  ? "Excluding your primary home. If unsure, enter an estimate; you can update it later."
                  : "Không tính nhà đang ở. Chưa chắc thì nhập số gần đúng, sửa sau được."}
              />
            </div>

            <div className="quick-field">
              <span className="quick-field-label">
                {isEn ? "Do you have loans or debts being repaid?" : "Bạn có khoản nợ đang trả không?"}
              </span>
              <div className="quick-chips-row" role="group" aria-label={isEn ? "Debt status" : "Tình trạng nợ"}>
                <button
                  type="button"
                  className={`quick-chip ${!hasDebt ? "is-active" : ""}`}
                  onClick={() => {
                    setHasDebt(false);
                    setDebtBalance(0);
                    setDebtMonthlyPayment(0);
                  }}
                >
                  {isEn ? "No" : "Không"}
                </button>
                <button
                  type="button"
                  className={`quick-chip ${hasDebt ? "is-active" : ""}`}
                  onClick={() => setHasDebt(true)}
                >
                  {isEn ? "Yes" : "Có"}
                </button>
              </div>

              {hasDebt && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
                  <div>
                    <CurrencyInput
                      label={isEn ? "Total balance" : "Tổng dư nợ"}
                      value={debtBalance}
                      onChange={(val) => setDebtBalance(val)}
                    />
                  </div>
                  <div>
                    <CurrencyInput
                      label={isEn ? "Monthly payment" : "Trả mỗi tháng"}
                      value={debtMonthlyPayment}
                      onChange={(val) => setDebtMonthlyPayment(val)}
                    />
                  </div>
                </div>
              )}
            </div>

            <details className="survey-extra">
              <summary>{isEn ? "Emergency reserve fund" : "Quỹ dự phòng đang có"}</summary>
              <div className="quick-field" style={{ marginTop: "12px" }}>
                <CurrencyInput
                  label={isEn ? "Emergency fund kept separate" : "Quỹ dự phòng để riêng"}
                  value={emergencyAmount}
                  onChange={(val) => setEmergencyAmount(val)}
                  placeholder="50.000.000"
                />
                <p className="quick-helper-text">
                  {isEn
                    ? "This fund is kept separate from money designated for retirement."
                    : "Khoản này được giữ riêng khỏi tiền dành cho nghỉ hưu."}
                </p>
                {reserveInfo.text && (
                  <p
                    className={`quick-helper-text reserve-months ${reserveInfo.warn ? "is-warning" : ""}`}
                    data-reserve-months
                    aria-live="polite"
                  >
                    {reserveInfo.text}
                  </p>
                )}
              </div>
            </details>
          </div>

          <div className="quick-actions">
            <Button variant="secondary" disabled={working} onClick={() => setStep(1)}>
              <Icon name="arrow-left" />
              {isEn ? "Back" : "Quay lại"}
            </Button>
            <Button variant="primary" disabled={working} onClick={handleNextStep2}>
              {isEn ? "Continue" : "Tiếp tục"}
              <Icon name="arrow-right" />
            </Button>
          </div>
        </section>
      )}

      {/* SCREEN 3: GIA ĐÌNH & NGHĨA VỤ */}
      {step === 3 && (
        <section aria-labelledby="step3-family-title">
          <header className="quick-onboarding-header">
            <h1 id="step3-family-title">{isEn ? "Your family" : "Gia đình của bạn"}</h1>
            <p>{isEn ? "A separate part to understand your responsibilities to loved ones. Both answers are optional." : "Một phần riêng để hiểu trách nhiệm với những người thân. Cả hai câu đều không bắt buộc."}</p>
          </header>

          <details className="survey-extra survey-family-details" open>
            <summary>
              <div className="survey-family-summary-header">
                <div className="survey-family-title-wrap">
                  <span className="survey-family-title">{isEn ? "Family & dependents info" : "Thông tin gia đình & người phụ thuộc"}</span>
                  <span className="survey-family-desc">{isEn ? "Automatically synced to your financial profile for cashflow calculations." : "Hệ thống sẽ tự động đồng bộ sang hồ sơ tài chính và tính toán dòng tiền."}</span>
                </div>
                <span className="survey-family-pill">{isEn ? "Optional" : "Tùy chọn"}</span>
              </div>
            </summary>

            <div className="survey-family two-col">
              <div className="family-col field">
                <label htmlFor="qo-marital">{isEn ? "Marital status" : "Tình trạng hôn nhân"}</label>
                <select id="qo-marital" value={maritalStatus} onChange={e => setMaritalStatus(e.target.value as typeof maritalStatus)}>
                  <option value="">{isEn ? "Prefer not to say" : "Chưa muốn cung cấp"}</option>
                  <option value="SINGLE">{isEn ? "Single" : "Độc thân"}</option>
                  <option value="MARRIED">{isEn ? "Married" : "Đã kết hôn"}</option>
                  <option value="OTHER">{isEn ? "Other" : "Khác"}</option>
                </select>
                <p className="family-field-note">{isEn ? "Used to understand shared financial protection in retirement." : "Cơ sở tính dòng tiền và bảo vệ tài chính chung khi về hưu."}</p>
              </div>

              <div className="family-col field dependents-field-wrap">
                <label htmlFor="qo-dependents">{isEn ? "People who depend on you financially" : "Số người phụ thuộc tài chính"}</label>
                <input id="qo-dependents" type="number" inputMode="numeric" min={0} max={30} step={1} placeholder="0" value={dependents} onChange={e => setDependents(e.target.value)} />
                <div className="dependents-presets" role="group" aria-label={isEn ? "Quick choices for dependents" : "Chọn nhanh số người phụ thuộc"}>
                  {[0, 1, 2, 3, 4].map(n => (
                    <button key={n} type="button" className={`preset-btn ${dependents !== "" && Number(dependents) === n ? "selected" : ""}`} aria-pressed={dependents !== "" && Number(dependents) === n} onClick={() => setDependents(String(n))}>
                      {n === 4 ? "4+" : n}
                    </button>
                  ))}
                </div>
                <p className="family-field-note">{isEn ? "Children or parents you support regularly." : "Con nhỏ hoặc bố mẹ già đang cần bạn chu cấp định kỳ."}</p>
              </div>
            </div>
          </details>

          {/* Obligations section */}
          <div className="survey-obligations">
            <div className="survey-obligations-head">
              <div>
                <h2 className="survey-section-subhead">{isEn ? "Dependents & recurring commitments" : "Người phụ thuộc & các khoản định kỳ"}</h2>
                <p className="survey-obligations-desc">{isEn ? "Check the expenses you are currently covering so the system can schedule cashflows. Leave blank if none." : "Đánh dấu khoản bạn đang chi trả để hệ thống tự động tách dòng tiền khi đến hạn. Bỏ trống nếu không có."}</p>
              </div>
              <span className="survey-family-pill">{isEn ? "Optional" : "Tùy chọn"}</span>
            </div>

            <div className="survey-obligations-list">
              {/* Child branch */}
              <section className="survey-branch">
                <label className="survey-toggle">
                  <input type="checkbox" checked={childEnabled} onChange={e => setChildEnabled(e.target.checked)} />
                  <span className="survey-branch-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
                  </span>
                  <span className="survey-branch-copy">
                    <strong>{isEn ? "I have young children / dependents to support" : "Tôi có con nhỏ / con cái cần chăm lo"}</strong>
                    <small>{isEn ? "Living, schooling and monthly upbringing costs." : "Sinh hoạt, học tập và các chi phí nuôi dạy hàng tháng."}</small>
                  </span>
                  <span className="survey-branch-status" aria-hidden="true">
                    <span className={childEnabled ? "status-on" : "status-off"}>{childEnabled ? "Đang khai báo" : "Chọn"}</span>
                  </span>
                </label>
                {childEnabled && (
                  <div className="survey-branch-body">
                    <div className="survey-branch-grid">
                      <CurrencyInput label={isEn ? "Monthly childcare expense" : "Chi phí chăm lo mỗi tháng"} value={childAmount} onChange={setChildAmount} placeholder="5.000.000" />
                      <div className="survey-duration-col">
                        <div className="field">
                          <label>{isEn ? "Expected support duration" : "Thời gian dự kiến chăm lo"}</label>
                          <select value={childDuration} onChange={e => setChildDuration(e.target.value)}>
                            <option value="unknown">{isEn ? "Undetermined" : "Chưa xác định"}</option>
                            <option value="1">{isEn ? "Around 1 year" : "Khoảng 1 năm"}</option>
                            <option value="3">{isEn ? "Around 3 years" : "Khoảng 3 năm"}</option>
                            <option value="5">{isEn ? "Around 5 years" : "Khoảng 5 năm"}</option>
                            <option value="10">{isEn ? "Around 10 years" : "Khoảng 10 năm"}</option>
                            <option value="retirement">{isEn ? "Until I retire" : "Đến khi tôi nghỉ hưu"}</option>
                            <option value="custom">{isEn ? "Pick end month" : "Tôi muốn chọn tháng kết thúc"}</option>
                          </select>
                        </div>
                      </div>
                      {childDuration === "custom" && (
                        <div className="survey-branch-full">
                          <Input label={isEn ? "End month" : "Tháng kết thúc chăm lo cho con"} type="month" value={childEnd} onChange={setChildEnd} />
                        </div>
                      )}
                      <div className="survey-branch-full survey-source-field">
                        <label>{isEn ? "Is this already included in previous living expenses?" : "Khoản này đã nằm trong tổng chi ở bước trước chưa?"}</label>
                        <select value={childIncluded} onChange={e => setChildIncluded(e.target.value as "yes" | "no")}>
                          <option value="yes">{isEn ? "Included - separate, do not add" : "Đã có - tách ra, không cộng thêm"}</option>
                          <option value="no">{isEn ? "Not included - add to expenses" : "Chưa có - cộng vào chi tiêu"}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Parent branch */}
              <section className="survey-branch">
                <label className="survey-toggle">
                  <input type="checkbox" checked={parentEnabled} onChange={e => setParentEnabled(e.target.checked)} />
                  <span className="survey-branch-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                  </span>
                  <span className="survey-branch-copy">
                    <strong>{isEn ? "I have elderly parents who depend on me" : "Tôi có bố mẹ già phụ thuộc vào tôi"}</strong>
                    <small>{isEn ? "Monthly eldercare and support according to your capacity." : "Khoản chăm lo, phụng dưỡng hàng tháng theo khả năng của bạn."}</small>
                  </span>
                  <span className="survey-branch-status" aria-hidden="true">
                    <span className={parentEnabled ? "status-on" : "status-off"}>{parentEnabled ? "Đang khai báo" : "Chọn"}</span>
                  </span>
                </label>
                {parentEnabled && (
                  <div className="survey-branch-body">
                    <div className="survey-branch-grid">
                      <CurrencyInput label={isEn ? "Monthly support expense" : "Chi phí phụng dưỡng mỗi tháng"} value={parentAmount} onChange={setParentAmount} placeholder="3.000.000" />
                      <div className="survey-duration-col">
                        <div className="field">
                          <label>{isEn ? "Expected support duration" : "Thời gian dự kiến phụng dưỡng"}</label>
                          <select value={parentDuration} onChange={e => setParentDuration(e.target.value)}>
                            <option value="unknown">{isEn ? "Undetermined" : "Chưa xác định"}</option>
                            <option value="1">{isEn ? "Around 1 year" : "Khoảng 1 năm"}</option>
                            <option value="3">{isEn ? "Around 3 years" : "Khoảng 3 năm"}</option>
                            <option value="5">{isEn ? "Around 5 years" : "Khoảng 5 năm"}</option>
                            <option value="10">{isEn ? "Around 10 years" : "Khoảng 10 năm"}</option>
                            <option value="retirement">{isEn ? "Until I retire" : "Đến khi tôi nghỉ hưu"}</option>
                            <option value="custom">{isEn ? "Pick end month" : "Tôi muốn chọn tháng kết thúc"}</option>
                          </select>
                        </div>
                      </div>
                      {parentDuration === "custom" && (
                        <div className="survey-branch-full">
                          <Input label={isEn ? "End month" : "Tháng kết thúc phụng dưỡng bố mẹ"} type="month" value={parentEnd} onChange={setParentEnd} />
                        </div>
                      )}
                      <div className="survey-branch-full survey-source-field">
                        <label>{isEn ? "Is this already included in previous living expenses?" : "Khoản này đã nằm trong tổng chi ở bước trước chưa?"}</label>
                        <select value={parentIncluded} onChange={e => setParentIncluded(e.target.value as "yes" | "no")}>
                          <option value="yes">{isEn ? "Included - separate, do not add" : "Đã có - tách ra, không cộng thêm"}</option>
                          <option value="no">{isEn ? "Not included - add to expenses" : "Chưa có - cộng vào chi tiêu"}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Debt branch */}
              <section className="survey-branch">
                <label className="survey-toggle">
                  <input type="checkbox" checked={debtEnabled} onChange={e => { setDebtEnabled(e.target.checked); if (!hasDebt && e.target.checked) setHasDebt(true); }} />
                  <span className="survey-branch-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  </span>
                  <span className="survey-branch-copy">
                    <strong>{isEn ? "I am repaying a loan or debt" : "Tôi đang trả một khoản vay"}</strong>
                    <small>{isEn ? "Compute loan amortization schedule, even past retirement." : "Tính lịch trả hết nợ, kể cả khi qua tuổi nghỉ hưu."}</small>
                  </span>
                  <span className="survey-branch-status" aria-hidden="true">
                    <span className={debtEnabled ? "status-on" : "status-off"}>{debtEnabled ? "Đang khai báo" : "Chọn"}</span>
                  </span>
                </label>
                {debtEnabled && (
                  <div className="survey-branch-body">
                    <div className="survey-branch-grid">
                      <CurrencyInput label={isEn ? "Current debt balance" : "Dư nợ hiện tại"} value={debtBalance} onChange={setDebtBalance} placeholder="300.000.000" />
                      <CurrencyInput label={isEn ? "Monthly payment" : "Trả nợ mỗi tháng"} value={debtMonthlyPayment} onChange={setDebtMonthlyPayment} placeholder="6.000.000" />
                      <div className="survey-branch-full field">
                        <label htmlFor="survey-debt-rate">{isEn ? "Interest rate (%/year)" : "Lãi suất khoản vay (%/năm)"}</label>
                        <input id="survey-debt-rate" type="number" step="0.1" min={0} max={100} value={debtRate} onChange={e => setDebtRate(Number(e.target.value))} />
                        <p className="quick-helper-text">{isEn ? "Enter 0 if interest-free. Monthly payments are separate from living expenses." : "Nhập 0 nếu không có lãi. Khoản trả chưa nằm trong chi sinh hoạt ở bước trước."}</p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Goal branch */}
              <section className="survey-branch">
                <label className="survey-toggle">
                  <input type="checkbox" checked={goalEnabled} onChange={e => setGoalEnabled(e.target.checked)} />
                  <span className="survey-branch-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>
                  </span>
                  <span className="survey-branch-copy">
                    <strong>{isEn ? "I have another major life goal" : "Tôi có một mục tiêu lớn khác"}</strong>
                    <small>{isEn ? "College tuition, home renovation or lump-sum expense." : "Học phí, sửa nhà hoặc khoản cần chi một lần."}</small>
                  </span>
                  <span className="survey-branch-status" aria-hidden="true">
                    <span className={goalEnabled ? "status-on" : "status-off"}>{goalEnabled ? "Đang khai báo" : "Chọn"}</span>
                  </span>
                </label>
                {goalEnabled && (
                  <div className="survey-branch-body">
                    <div className="survey-branch-grid">
                      <div className="field">
                        <label htmlFor="survey-goal-name">{isEn ? "What do you want to spend on?" : "Bạn muốn dùng tiền vào việc gì?"}</label>
                        <input id="survey-goal-name" type="text" placeholder={isEn ? "e.g., College tuition, home renovation..." : "Ví dụ: Học phí đại học, sửa nhà..."} value={goalName} onChange={e => setGoalName(e.target.value)} />
                      </div>
                      <CurrencyInput label={isEn ? "Target budget needed" : "Cần bao nhiêu tiền (theo giá hiện tại)?"} value={goalAmount} onChange={setGoalAmount} placeholder="200.000.000" />
                      <div className="field">
                        <Input label={isEn ? "When do you need this fund?" : "Khi nào bạn cần dùng số tiền này?"} type="month" value={goalMonth} onChange={setGoalMonth} />
                      </div>
                      <div className="field">
                        <label>{isEn ? "Can it be deferred if funds fall short?" : "Nếu chưa đủ tiền, có thể lùi lại không?"}</label>
                        <select value={goalDeferrable} onChange={e => setGoalDeferrable(e.target.value as "no" | "yes")}>
                          <option value="no">{isEn ? "No, needed on schedule" : "Không, tôi cần đúng thời điểm"}</option>
                          <option value="yes">{isEn ? "Yes, can defer up to 1 year" : "Có, tôi có thể lùi tối đa 1 năm"}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>

          {/* Pension block */}
          <div className="survey-pension">
            <div className="survey-pension-head">
              <h2>{isEn ? "Post-retirement income sources" : "Nguồn thu sau nghỉ việc"}</h2>
              <p className="survey-obligations-desc">{isEn ? "If you have an estimated pension, your plan will include this income from the start month." : "Nếu có lương hưu dự kiến, kế hoạch sẽ cộng thêm nguồn thu này từ tháng bắt đầu nhận."}</p>
            </div>
            <div className="field">
              <label htmlFor="survey-pension-status">{isEn ? "Do you have an estimated pension?" : "Bạn đã có ước tính lương hưu chưa?"}</label>
              <select id="survey-pension-status" value={pensionStatus} onChange={e => setPensionStatus(e.target.value as typeof pensionStatus)}>
                <option value="unknown">{isEn ? "Not sure - add later" : "Chưa biết - bổ sung sau"}</option>
                <option value="none">{isEn ? "No pension" : "Không có lương hưu"}</option>
                <option value="known">{isEn ? "Estimated amount available" : "Đã có mức ước tính"}</option>
              </select>
            </div>
            {pensionStatus === "known" && (
              <div className="survey-branch-grid survey-pension-fields">
                <CurrencyInput label={isEn ? "Estimated monthly pension" : "Lương hưu dự kiến mỗi tháng"} value={pension} onChange={setPension} placeholder="5.000.000" />
                <Input label={isEn ? "Start month to receive pension" : "Tháng bắt đầu nhận lương hưu"} type="month" value={pensionStart || desiredRetirementMonth} onChange={setPensionStart} />
              </div>
            )}
          </div>

          <div className="quick-actions">
            <Button variant="secondary" disabled={working} onClick={() => setStep(2)}>
              <Icon name="arrow-left" />
              {isEn ? "Back" : "Quay lại"}
            </Button>
            <Button variant="primary" disabled={working} onClick={handleNextStep3}>
              {isEn ? "Continue" : "Tiếp tục"}
              <Icon name="arrow-right" />
            </Button>
          </div>
        </section>
      )}

      {/* SCREEN 4: KHẢ NĂNG CHỊU RỦI RO */}
      {step === 4 && (
        <section aria-labelledby="step4-title">
          <header className="quick-onboarding-header">
            <h1 id="step4-title">{isEn ? "Risk tolerance" : "Khả năng chịu rủi ro"}</h1>
            <p>{isEn ? "Understand your risk tolerance to shape a suitable asset allocation for your retirement plan." : "Hiểu khả năng chịu biến động để xác định danh mục đầu tư phù hợp cho kế hoạch của bạn."}</p>
          </header>

          {/* 3 reaction radio cards */}
          <fieldset className="survey-reaction">
            <legend>{isEn ? "If a 100M VND investment drops to 80M VND, how would you feel?" : "Nếu 100 triệu đầu tư giảm còn 80 triệu, bạn sẽ thấy thế nào?"}</legend>
            <div className="choice-list">
              <label className="choice">
                <input type="radio" name="comfortReaction" value="sell" checked={comfortReaction === "sell"} onChange={() => setComfortReaction("sell")} />
                <span>
                  <strong>{isEn ? "I want to prioritize capital preservation" : "Tôi muốn ưu tiên giữ vốn"}</strong>
                  <small>{isEn ? "This drop might cause me to sell." : "Mức giảm này có thể khiến tôi phải bán."}</small>
                </span>
              </label>
              <label className="choice">
                <input type="radio" name="comfortReaction" value="hold" checked={comfortReaction === "hold"} onChange={() => setComfortReaction("hold")} />
                <span>
                  <strong>{isEn ? "I can hold and wait" : "Tôi có thể giữ và chờ"}</strong>
                  <small>{isEn ? "If near-term needs are protected." : "Nếu các khoản sắp cần đã được bảo vệ."}</small>
                </span>
              </label>
              <label className="choice">
                <input type="radio" name="comfortReaction" value="calm" checked={comfortReaction === "calm"} onChange={() => setComfortReaction("calm")} />
                <span>
                  <strong>{isEn ? "I could consider contributing more" : "Tôi có thể cân nhắc góp thêm"}</strong>
                  <small>{isEn ? "If reserves are intact and withdrawals aren't needed yet." : "Nếu vẫn có dự phòng và chưa cần rút tiền."}</small>
                </span>
              </label>
            </div>
          </fieldset>

          {/* Stability & Priority selects */}
          <div className="survey-safety-selects">
            <div className="field">
              <label>{isEn ? "How stable is your income?" : "Thu nhập của bạn thường thế nào?"}</label>
              <select value={stability} onChange={e => setStability(e.target.value)}>
                <option value="unknown">{isEn ? "Undetermined" : "Chưa xác định"}</option>
                <option value="stable">{isEn ? "Fairly stable" : "Khá ổn định"}</option>
                <option value="variable">{isEn ? "Variable" : "Có biến động"}</option>
                <option value="uncertain">{isEn ? "May be interrupted" : "Có thể gián đoạn"}</option>
              </select>
            </div>
            <div className="field">
              <label>{isEn ? "In retirement, what lifestyle do you desire?" : "Khi về hưu, bạn mong muốn mức sống như thế nào?"}</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="balanced">{isEn ? "Balanced, fits budget" : "Sinh hoạt cân đối, phù hợp ngân sách"}</option>
                <option value="health">{isEn ? "Prioritize healthcare" : "Ưu tiên sức khỏe và chăm sóc"}</option>
                <option value="housing">{isEn ? "Prioritize housing" : "Ưu tiên chỗ ở ổn định"}</option>
                <option value="travel">{isEn ? "Travel & experience" : "Có điều kiện du lịch và trải nghiệm"}</option>
              </select>
            </div>
          </div>

          {/* Loss limit accordion */}
          <details className="survey-extra" open={lossStatus === "known" || lossStatus === "percent"}>
            <summary>{isEn ? "Maximum loss limit you can tolerate" : "Mức lỗ tối đa bạn có thể chấp nhận"}</summary>
            <div className="field" style={{ marginTop: "12px" }}>
              <label>{isEn ? "Do you have a specific loss threshold?" : "Bạn đã có mức giới hạn lỗ cụ thể chưa?"}</label>
              <select value={lossStatus} onChange={e => setLossStatus(e.target.value as typeof lossStatus)}>
                <option value="unknown">{isEn ? "Not sure - let app suggest" : "Chưa rõ - Nhờ ứng dụng gợi ý trước"}</option>
                <option value="known">{isEn ? "Enter limit in amount" : "Tôi muốn khai giới hạn bằng tiền"}</option>
                <option value="percent">{isEn ? "Choose by percentage (%)" : "Tôi muốn chọn theo tỷ lệ phần trăm (%)"}</option>
              </select>
            </div>
            {lossStatus === "known" && (
              <div className="field" style={{ marginTop: "12px" }}>
                <CurrencyInput label={isEn ? "Maximum loss amount you can accept" : "Số tiền lỗ tối đa bạn có thể chấp nhận"} value={lossAmount} onChange={setLossAmount} placeholder="50.000.000" />
              </div>
            )}
            {lossStatus === "percent" && (
              <div className="field" style={{ marginTop: "12px" }}>
                <label>{isEn ? "Maximum loss rate on long-term capital (%)" : "Tỷ lệ lỗ tối đa trên vốn đầu tư dài hạn (%)"}</label>
                <input type="number" min={0} max={100} step="0.5" value={lossPercent} onChange={e => setLossPercent(Number(e.target.value))} />
              </div>
            )}
            <p className="quick-helper-text" style={{ marginTop: "12px" }}>
              {isEn ? "You can review and confirm in Portfolio Allocation. This limit filters options, not guaranteeing actual market returns." : "Bạn sẽ xem số tiền tương ứng và xác nhận ở Phân bổ tài sản. Đây là giới hạn để chọn phương án, không bảo đảm mức lỗ thực tế."}
            </p>
          </details>

          {loadingPolicy ? (
            <p role="status">{isEn ? "Loading policy questions…" : "Đang tải câu hỏi chính sách…"}</p>
          ) : questions.length > 0 ? (
            <div className="quick-field-group" style={{ marginTop: "24px" }}>
              <h2 className="survey-section-subhead">{isEn ? "Detailed Portfolio Policy Questionnaire" : "Khảo sát chính sách phân bổ danh mục"}</h2>
              {questions.map((question, qIdx) => {
                const isHorizon = question.id === "Q_HORIZON";
                const isCapacity = question.id === "Q_FINANCIAL_CAPACITY";
                const selectedChoiceId = answers[question.id];

                return (
                  <Card key={question.id} className="quick-question-card quick-risk-card">
                    <h2 className="quick-question-title">
                      {qIdx + 1}. {question.prompt}
                    </h2>

                    {isHorizon && autoHorizonChoiceId && (
                      <div className="quick-auto-selected-badge" style={{ marginBottom: "10px" }}>
                        <Icon name="compass" size="small" />
                        <span>
                          {isEn
                            ? "Auto-selected from your retirement timeline (you can change it)"
                            : "Đã tự động chọn theo tháng nghỉ hưu của bạn (bạn có thể đổi)"}
                        </span>
                      </div>
                    )}

                    <div
                      role="radiogroup"
                      aria-label={question.prompt}
                      className="quick-choice-list"
                    >
                      {question.choices.map((choice) => {
                        const isSelected = selectedChoiceId === choice.id;
                        const isSuggested = isCapacity && suggestedCapacityId === choice.id;

                        return (
                          <button
                            key={choice.id}
                            type="button"
                            role="radio"
                            data-choice-id={choice.id}
                            aria-checked={isSelected}
                            className={`quick-choice-btn quick-chip ${isSelected ? "is-active" : ""}`}
                            onClick={() => {
                              setAnswers((prev) => ({ ...prev, [question.id]: choice.id }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setAnswers((prev) => ({ ...prev, [question.id]: choice.id }));
                              }
                            }}
                          >
                            <span>{choice.label}</span>
                            {isSuggested && !isSelected && (
                              <span className="quick-chip-suggestion">
                                {isEn ? "Suggested" : "Gợi ý"}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : null}

          <div className="quick-actions">
            <Button variant="secondary" disabled={working} onClick={() => setStep(3)}>
              <Icon name="arrow-left" />
              {isEn ? "Back" : "Quay lại"}
            </Button>
            <Button
              variant="primary"
              disabled={working || !allAnswered}
              onClick={handleComplete}
            >
              {isEn ? "See your first plan" : "Xem kế hoạch đầu tiên của bạn"}
              <Icon name="arrow-right" />
            </Button>
          </div>
        </section>
      )}
      </div>
      <p className="qo-bottom"><Icon name="shield" size="small" /> {isEn ? "Your answers are kept if you leave and come back." : "Các câu đã trả lời được giữ lại nếu bạn rời đi rồi quay lại."}</p>
      </section>
    </div>
  );
}
export default QuickOnboarding;
