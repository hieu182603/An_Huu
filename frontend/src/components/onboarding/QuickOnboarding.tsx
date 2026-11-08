import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { Button, Card, Icon, Input, useNotification } from "../ui";
import { CurrencyInput } from "../CurrencyInput";
import { DateInput } from "../DateInput";
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

function shiftMonth(ym: string, offset: number): string {
  if (!ym || ym.length < 7) return "";
  const parts = ym.split("-").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return "";
  const total = parts[0] * 12 + (parts[1] - 1) + offset;
  const nextY = Math.floor(total / 12);
  const nextM = (total % 12) + 1;
  return `${nextY}-${String(nextM).padStart(2, "0")}`;
}

function resolveSupportEnd(planEndMonth: string, duration: string, customEnd: string, retireMonth: string, valMonth: string): string {
  if (!duration || duration === "custom") return customEnd;
  const last = shiftMonth(planEndMonth, -1);
  if (duration === "unknown") return last;
  if (duration === "retirement") return shiftMonth(retireMonth, -1);
  if (["1", "3", "5", "10"].includes(duration)) {
    return shiftMonth(valMonth, Number(duration) * 12 - 1);
  }
  return "";
}

function getSupportNote(duration: string, customEnd: string, planEndMonth: string, retireMonth: string, valMonth: string, isEn: boolean): string {
  if (duration === "custom") return "";
  const end = resolveSupportEnd(planEndMonth, duration, customEnd, retireMonth, valMonth);
  if (!end || end.length < 7) return "";
  const displayEnd = `${end.slice(5)}/${end.slice(0, 4)}`;
  if (duration === "unknown") {
    return isEn
      ? `Estimated support until ${displayEnd} (end of plan). You can adjust when known.`
      : `Tạm tính khoản hỗ trợ đến hết ${displayEnd} (cuối kế hoạch). Bạn có thể điều chỉnh khi biết rõ hơn.`;
  }
  if (duration === "retirement") {
    return isEn
      ? `Support calculated until ${displayEnd} (until retirement).`
      : `Tính khoản hỗ trợ đến hết ${displayEnd} (thời điểm nghỉ hưu).`;
  }
  return isEn
    ? `Support calculated until ${displayEnd} within the plan duration.`
    : `Tính khoản hỗ trợ đến hết ${displayEnd} trong thời hạn kế hoạch.`;
}

const formatVND = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n || 0)) + " ₫";

export function QuickOnboarding({ onStepChange }: { onStepChange?: (step: 1 | 2 | 3 | 4) => void } = {}) {
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

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Step 1: Desire & Timeline
  const [birthMonth, setBirthMonth] = useState<string>(() => {
    return onboardingDraft?.birthMonth || "";
  });

  const [birthDate, setBirthDate] = useState<string>(() => {
    return (onboardingDraft as any)?.birthDate || (onboardingDraft?.birthMonth ? `${onboardingDraft.birthMonth}-01` : "");
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
    setDesiredRetirementMonth("");
  };

  // Step 2: Current Finances
  const [monthlyIncome, setMonthlyIncome] = useState<number>(() => {
    return onboardingDraft?.primaryIncome || 0;
  });

  const [currentExpense, setCurrentExpense] = useState<number>(() => {
    return onboardingDraft?.essentialExpense || 0;
  });

  const [retirementSavings, setRetirementSavings] = useState<number>(() => {
    return onboardingDraft?.cashSavings || 0;
  });

  const [contribution, setContribution] = useState<number>(0);

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

  const planEndMonth = useMemo(() => {
    if (!birthMonth || birthMonth.length < 4) return "2075-06";
    const bYear = parseInt(birthMonth.slice(0, 4), 10);
    const bMonth = birthMonth.slice(5, 7) || "06";
    return `${bYear + 85}-${bMonth}`;
  }, [birthMonth]);

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (fieldName: string) => {
    setFieldErrors((prev) => {
      if (!prev[fieldName]) return prev;
      const copy = { ...prev };
      delete copy[fieldName];
      return copy;
    });
  };

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
    const actualIncome = monthlyIncome;
    if (actualIncome <= 0) return null;
    const debtPay = hasDebt ? debtMonthlyPayment : 0;
    const surplus = actualIncome - currentExpense - debtPay;
    const ratio = surplus / actualIncome;

    // Below 10% -> CAP_TIGHT; 10% or more -> CAP_STABLE. NEVER CAP_STRONG!
    if (ratio < 0.1) return "CAP_TIGHT";
    return "CAP_STABLE";
  }, [monthlyIncome, currentExpense, hasDebt, debtMonthlyPayment]);

  const questions = policyDetail?.data.questions || [];
  const allAnswered = questions.length > 0 && questions.every((q) => Boolean(answers[q.id]));

  // Step 1 -> Step 2
  const handleNextStep1 = async () => {
    setValidationError(null);
    const errors: Record<string, string> = {};

    if (!birthMonth || birthMonth.length < 7) {
      errors.birthMonth = isEn ? "Please enter your date of birth." : "Vui lòng nhập hoặc chọn ngày tháng năm sinh.";
    }
    if (!currentRetireAge || currentRetireAge < 18 || currentRetireAge > 80) {
      errors.retireAge = isEn ? "Please enter a valid retirement age (18 - 80)." : "Vui lòng nhập tuổi nghỉ hưu hợp lệ từ 18 đến 80.";
    }
    if (!monthlyExpense || monthlyExpense <= 0) {
      errors.monthlyExpense = isEn ? "Please enter your desired monthly spending." : "Vui lòng nhập chi tiêu nghỉ hưu mỗi tháng lớn hơn 0.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    let effectiveRetirementMonth = desiredRetirementMonth;
    if (!effectiveRetirementMonth || effectiveRetirementMonth.length < 7) {
      const bYear = parseInt(birthMonth.slice(0, 4), 10);
      const bMonth = birthMonth.slice(5, 7) || "01";
      if (!isNaN(bYear)) {
        effectiveRetirementMonth = `${bYear + currentRetireAge}-${bMonth}`;
        setDesiredRetirementMonth(effectiveRetirementMonth);
      }
    }

    setWorking(true);
    try {
      const partialProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth: effectiveRetirementMonth,
        monthlyIncome: 0,
        monthlyExpense,
        retirementSavings: 0,
        valuationDate: planningMonth + "-01",
      });
      const ok = await saveOnboardingDraft({
        birthMonth,
        desiredRetirementMonth: effectiveRetirementMonth,
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
    const errors: Record<string, string> = {};

    if (!currentExpense || currentExpense <= 0) {
      errors.currentExpense = isEn ? "Please enter your monthly expenses." : "Vui lòng nhập mức chi tiêu mỗi tháng lớn hơn 0.";
    }
    if (contribution < 0) {
      errors.contribution = isEn ? "Contribution must be at least 0." : "Số tiền góp mỗi tháng cần lớn hơn hoặc bằng 0.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setWorking(true);
    try {
      const partialProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome,
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
    const errors: Record<string, string> = {};

    if (dependentsNumber !== null && (!Number.isInteger(dependentsNumber) || dependentsNumber < 0 || dependentsNumber > 30)) {
      errors.dependents = isEn ? "Dependents must be a whole number from 0 to 30, or left blank." : "Số người phụ thuộc cần là số nguyên từ 0 đến 30, hoặc để trống.";
    }
    if (childEnabled) {
      if (childAmount <= 0) errors.childAmount = isEn ? "Enter childcare amount greater than 0." : "Nhập chi phí chăm lo mỗi tháng lớn hơn 0.";
      if (childDuration === "custom" && !childEnd) errors.childEnd = isEn ? "Please pick an end month." : "Vui lòng chọn tháng kết thúc.";
    }
    if (parentEnabled) {
      if (parentAmount <= 0) errors.parentAmount = isEn ? "Enter support amount greater than 0." : "Nhập chi phí phụng dưỡng mỗi tháng lớn hơn 0.";
      if (parentDuration === "custom" && !parentEnd) errors.parentEnd = isEn ? "Please pick an end month." : "Vui lòng chọn tháng kết thúc.";
    }
    if (debtEnabled) {
      if (debtBalance <= 0) errors.debtBalance = isEn ? "Enter balance greater than 0." : "Nhập dư nợ lớn hơn 0.";
      if (debtMonthlyPayment <= 0) errors.debtMonthlyPayment = isEn ? "Enter monthly payment greater than 0." : "Nhập khoản trả lớn hơn 0.";
      if (debtRate < 0 || debtRate > 100) errors.debtRate = isEn ? "Interest rate must be between 0 and 100%." : "Lãi suất cần từ 0 đến 100%/năm.";
    }
    if (goalEnabled) {
      if (!goalName.trim()) errors.goalName = isEn ? "Please enter a name for your goal." : "Vui lòng đặt tên cho mục tiêu của bạn.";
      if (goalAmount <= 0) errors.goalAmount = isEn ? "Enter target budget greater than 0." : "Nhập ngân sách cần thiết lớn hơn 0.";
      if (!goalMonth) errors.goalMonth = isEn ? "Please select the needed month." : "Vui lòng chọn tháng cần dùng tiền.";
    }
    if (pensionStatus === "known") {
      if (pension <= 0) errors.pension = isEn ? "Enter estimated pension amount." : "Nhập mức lương hưu ước tính lớn hơn 0.";
      if (!pensionStart) errors.pensionStart = isEn ? "Please select the start month." : "Vui lòng chọn tháng bắt đầu nhận.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setWorking(true);
    try {
      const partialProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome,
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
    if (!comfortReaction || working) return;
    setWorking(true);
    try {
      const finalQuickProfile = createQuickStartProfileV2({
        birthMonth,
        desiredRetirementMonth,
        monthlyIncome,
        monthlyExpense: currentExpense,
        retirementSavings,
        hasDebt,
        debtBalance: hasDebt ? debtBalance : undefined,
        debtMonthlyPayment: hasDebt ? debtMonthlyPayment : undefined,
        valuationDate: planningMonth + "-01",
        ...family,
      });

      const defaultAnswers: Record<string, string> = { ...answers };
      questions.forEach((q) => {
        if (!defaultAnswers[q.id] && q.choices.length > 0) {
          if (q.id === "Q_HORIZON" && autoHorizonChoiceId) {
            defaultAnswers[q.id] = autoHorizonChoiceId;
          } else if (q.id === "Q_FINANCIAL_CAPACITY" && suggestedCapacityId) {
            defaultAnswers[q.id] = suggestedCapacityId;
          } else {
            const idx = comfortReaction === "sell" ? 0 : comfortReaction === "calm" ? Math.min(2, q.choices.length - 1) : 1;
            defaultAnswers[q.id] = q.choices[idx]?.id || q.choices[0].id;
          }
        }
      });

      const answerItems: PortfolioAnswerItem[] = Object.entries(defaultAnswers).map(([questionId, choiceId]) => ({
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
        <div className="qo-aside-header">
          <span className="qo-eyebrow">
            <Icon name="sparkles" size="small" />
            {isEn ? "A gentle start" : "Một khởi đầu nhẹ nhàng"}
          </span>
          <h2>{isEn ? <>Your plan,<br />one step at a time.</> : <>Kế hoạch của bạn,<br />từng bước một.</>}</h2>
          <p>{isEn ? "Approximate numbers are fine. You can adjust them later." : "Chỉ cần con số gần đúng. Bạn có thể điều chỉnh sau."}</p>
        </div>

        <ol className="setup-steps qo-steps" aria-label={isEn ? "Setup stages" : "Các chặng khai báo"}>
          {[
            [isEn ? "Your wish" : "Mong muốn", isEn ? "How do you want to retire?" : "Bạn muốn nghỉ hưu thế nào?"],
            [isEn ? "Money today" : "Tiền hôm nay", isEn ? "What do you have now?" : "Bạn đang có những gì?"],
            [isEn ? "Family" : "Gia đình", isEn ? "Your financial responsibilities" : "Trách nhiệm tài chính của bạn"],
            [isEn ? "Risk tolerance" : "Khả năng chịu rủi ro", isEn ? "How much movement can you accept?" : "Hiểu khả năng chịu biến động"],
          ].map(([title, sub], i) => (
            <li
              key={title}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`${step > i + 1 ? "is-done" : ""} ${step === i + 1 ? "is-active" : ""}`}
            >
              <span className="qo-step-number" aria-hidden="true">
                {step > i + 1 ? <Icon name="check" size="small" /> : i + 1}
              </span>
              <span className="qo-step-copy">
                <strong>{title}</strong>
                <small>{sub}</small>
              </span>
            </li>
          ))}
        </ol>

        {/* Dynamic Contextual Tip Card */}
        <div className="qo-aside-tip-card">
          <div className="qo-tip-head">
            <span className="qo-tip-icon-dot"></span>
            <strong>{isEn ? "Helpful Guidance" : "Gợi ý cho bước này"}</strong>
          </div>
          <p className="qo-tip-text">
            {step === 1 && (isEn
              ? "Estimate the monthly living cost you desire in retirement at today's prices. An Huu will automatically project inflation and compounding."
              : "Ước tính mức chi tiêu bạn mong muốn khi về hưu theo thời giá hiện tại. An Hưu sẽ tự động tính bù trừ trượt giá và lạm phát theo thời gian.")}
            {step === 2 && (isEn
              ? "Approximate figures are completely fine. Knowing your regular income and routine expenses helps determine your real savings potential."
              : "Chỉ cần con số ước lượng. Thu nhập thực nhận và chi tiêu sinh hoạt định kỳ giúp xác định chính xác năng lực tích lũy hàng tháng của bạn.")}
            {step === 3 && (isEn
              ? "Financial commitments like child education or parent support are scheduled separately to protect your long-term plan from cash flow gaps."
              : "Các khoản hỗ trợ con cái hay phụng dưỡng cha mẹ được tính riêng theo giai đoạn, giúp bức tranh dòng tiền không bị thâm hụt.")}
            {step === 4 && (isEn
              ? "Understanding how you feel about volatility helps select a sustainable asset allocation that you can stick with in all market cycles."
              : "Hiểu phản ứng của bạn trước biến động ngắn hạn giúp An Hưu xây dựng danh mục phù hợp, để bạn luôn an tâm theo đuổi mục tiêu dài hạn.")}
          </p>
        </div>

        {/* Reassurance & Autosave line */}
        <div className="qo-aside-trust">
          <div className="qo-trust-item">
            <Icon name="shield" size="small" />
            <span>{isEn ? "Draft autosaved to your profile" : "Bản nháp được tự động lưu vào hồ sơ"}</span>
          </div>
          <div className="qo-trust-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "14px", height: "14px", flexShrink: 0 }} aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{isEn ? "Takes ~2 mins to complete" : "Chỉ mất khoảng 2 phút hoàn thành"}</span>
          </div>
        </div>
      </aside>

      <section className="qo-main">
      <div className="qo-card card setup-card">
      <div className="qo-caption setup-caption">
        <span className="qo-step-badge">{isEn ? `BƯỚC ${step}/4` : `BƯỚC ${step}/4`}</span>
        <span className="qo-pace-note" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: "16px", height: "16px" }} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
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
                <DateInput
                  label={isEn ? "Date of birth" : "Ngày tháng năm sinh"}
                  mode="date"
                  value={birthDate || (birthMonth ? `${birthMonth}-01` : "")}
                  placeholder={isEn ? "DD/MM/YYYY" : "Ngày/tháng/năm"}
                  error={fieldErrors.birthMonth}
                  onChange={(ym, ymd) => {
                    clearFieldError("birthMonth");
                    setBirthMonth(ym);
                    if (ymd) setBirthDate(ymd);
                    if (ym && currentRetireAge) {
                      const bYear = parseInt(ym.slice(0, 4), 10);
                      const bMonth = ym.slice(5, 7) || "01";
                      if (!isNaN(bYear)) {
                        setDesiredRetirementMonth(`${bYear + currentRetireAge}-${bMonth}`);
                      }
                    } else if (!ym) {
                      setDesiredRetirementMonth("");
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
                  error={fieldErrors.retireAge}
                  onChange={(val) => {
                    clearFieldError("retireAge");
                    handleRetireAgeChange(Number(val) || 60);
                  }}
                />
                {birthMonth && desiredRetirementMonth && (
                  <p className="retirement-estimate" style={{ marginTop: "4px", fontSize: "12px", color: "var(--color-primary-700, #334DAF)" }}>
                    {isEn
                      ? `Estimated retirement: month ${desiredRetirementMonth.slice(5, 7)}/${desiredRetirementMonth.slice(0, 4)}`
                      : `Dự kiến nghỉ hưu: tháng ${desiredRetirementMonth.slice(5, 7)}/${desiredRetirementMonth.slice(0, 4)}`}
                  </p>
                )}
              </div>
            </div>

            <div className="quick-field" style={{ marginTop: "16px" }}>
              <CurrencyInput
                label={isEn ? "Retirement monthly spending" : "Chi tiêu nghỉ hưu mỗi tháng"}
                value={monthlyExpense}
                error={fieldErrors.monthlyExpense}
                onChange={(val) => {
                  clearFieldError("monthlyExpense");
                  setMonthlyExpense(val);
                }}
                placeholder="0"
                suffix="đ"
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
                label={isEn ? "How much is your actual average monthly income?" : "Thu nhập bình quân thực nhận mỗi tháng của bạn bao nhiêu?"}
                value={monthlyIncome}
                error={fieldErrors.monthlyIncome}
                onChange={(val) => {
                  clearFieldError("monthlyIncome");
                  setMonthlyIncome(val);
                }}
                placeholder="0"
                helper={isEn ? "After tax and all deductions." : "Sau thuế và các khoản đã khấu trừ."}
              />
            </div>

            <div className="quick-field" style={{ marginTop: "16px" }}>
              <CurrencyInput
                label={isEn ? "How much are you spending each month?" : "Bạn đang chi bao nhiêu mỗi tháng?"}
                value={currentExpense}
                error={fieldErrors.currentExpense}
                onChange={(val) => {
                  clearFieldError("currentExpense");
                  setCurrentExpense(val);
                }}
                placeholder="0"
                helper={isEn ? "Includes living costs and family support; excludes debt repayment and investing." : "Gồm sinh hoạt và hỗ trợ gia đình; chưa gồm trả nợ và đầu tư."}
              />
            </div>

            <div className="quick-field" style={{ marginTop: "16px" }}>
              <CurrencyInput
                label={isEn ? "How much have you accumulated for retirement?" : "Bạn đã tích lũy được bao nhiêu cho tuổi nghỉ hưu?"}
                value={retirementSavings}
                error={fieldErrors.retirementSavings}
                onChange={(val) => {
                  clearFieldError("retirementSavings");
                  setRetirementSavings(val);
                }}
                placeholder="0"
                helper={isEn
                  ? "Excluding primary residence and emergency fund."
                  : "Không gồm nhà đang ở và quỹ dự phòng."}
              />
            </div>

            <div className="quick-field" style={{ marginTop: "16px" }}>
              <CurrencyInput
                label={isEn ? "How much do you want to contribute to your retirement fund each month?" : "Bạn muốn góp vào quỹ hưu mỗi tháng bao nhiêu?"}
                value={contribution}
                error={fieldErrors.contribution}
                onChange={(val) => {
                  clearFieldError("contribution");
                  setContribution(val);
                }}
                placeholder="0"
                helper={isEn ? "Enter 0 if you want to decide after seeing results." : "Nhập 0 nếu muốn chọn sau khi xem kết quả."}
                showZeroWords={true}
              />
            </div>

            <details className="survey-extra" style={{ marginTop: "24px" }}>
              <summary>{isEn ? "Emergency reserve fund" : "Quỹ dự phòng đang có"}</summary>
              <div className="quick-field" style={{ marginTop: "12px" }}>
                <CurrencyInput
                  label={isEn ? "Emergency fund kept separate" : "Quỹ dự phòng để riêng"}
                  value={emergencyAmount}
                  onChange={(val) => setEmergencyAmount(val)}
                  placeholder="50.000.000"
                />
                <p className="quick-helper-text" style={{ fontSize: "12px", color: "var(--muted, #64748b)", marginTop: "4px" }}>
                  {isEn
                    ? "This fund is kept separate from money designated for retirement."
                    : "Khoản này được giữ riêng khỏi tiền dành cho nghỉ hưu."}
                </p>
                {reserveInfo.text && (
                  <p
                    className={`quick-helper-text reserve-months ${reserveInfo.warn ? "is-warning" : ""}`}
                    data-reserve-months
                    aria-live="polite"
                    style={{ fontSize: "12px", color: "var(--color-primary-700, #334DAF)", marginTop: "4px" }}
                  >
                    {reserveInfo.text}
                  </p>
                )}
              </div>
            </details>
          </div>

          <div className="quick-actions form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "28px" }}>
            <button type="button" className="btn ghost button-ghost" disabled={working} onClick={() => setStep(1)}>
              {isEn ? "← Your wish" : "← Mong muốn"}
            </button>
            <button type="button" className="btn btn-primary" disabled={working} onClick={handleNextStep2}>
              {isEn ? "Continue →" : "Tiếp tục →"}
            </button>
          </div>
        </section>
      )}

      {/* SCREEN 3: GIA ĐÌNH & NGHĨA VỤ */}
      {step === 3 && (
        <section aria-labelledby="step3-family-title">
          <header className="quick-onboarding-header">
            <h1 id="step3-family-title">{isEn ? "Which commitments do you need to take care of?" : "Bạn còn những khoản nào cần chăm lo?"}</h1>
            <p>{isEn ? "Choose what fits. We only ask more when you need it." : "Chọn điều phù hợp. Chúng tôi chỉ hỏi thêm khi bạn cần."}</p>
          </header>

          <details className="survey-extra survey-family-details" open>
            <summary>
              <div className="survey-family-summary-header">
                <div className="survey-family-title-wrap">
                  <span className="survey-family-title">{isEn ? "Family & dependents info" : "Thông tin gia đình & người phụ thuộc"}</span>
                  <span className="survey-family-desc">{isEn ? "Automatically synced to your profile so you do not need to re-enter." : "Hệ thống sẽ tự động đồng bộ sang hồ sơ để bạn không cần điền lại."}</span>
                </div>
                <span className="survey-family-pill">{isEn ? "Optional" : "Tùy chọn"}</span>
              </div>
            </summary>

            <div className="survey-family two-col">
              <div className="family-col field">
                <label htmlFor="qo-marital">{isEn ? "Marital status" : "Tình trạng hôn nhân"} <span className="field-optional">{isEn ? "(optional)" : "(không bắt buộc điền)"}</span></label>
                <select id="qo-marital" value={maritalStatus} onChange={e => setMaritalStatus(e.target.value as typeof maritalStatus)}>
                  <option value="">{isEn ? "Prefer not to say" : "Chưa muốn cung cấp"}</option>
                  <option value="SINGLE">{isEn ? "Single" : "Độc thân"}</option>
                  <option value="MARRIED">{isEn ? "Married" : "Đã kết hôn"}</option>
                  <option value="OTHER">{isEn ? "Other" : "Khác"}</option>
                </select>
                <p className="family-field-note">{isEn ? "Used to understand shared financial protection in retirement." : "Cơ sở tính dòng tiền và bảo vệ tài chính chung khi về hưu."}</p>
              </div>

              <div className={`family-col field dependents-field-wrap ${fieldErrors.dependents ? "has-error" : ""}`}>
                <label htmlFor="qo-dependents">{isEn ? "People who depend on you financially" : "Số người phụ thuộc tài chính"} <span className="field-optional">{isEn ? "(optional)" : "(không bắt buộc điền)"}</span></label>
                <input
                  id="qo-dependents"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={30}
                  step={1}
                  placeholder="0"
                  value={dependents}
                  aria-invalid={Boolean(fieldErrors.dependents)}
                  onChange={e => {
                    clearFieldError("dependents");
                    setDependents(e.target.value);
                  }}
                />
                <div className="dependents-presets" role="group" aria-label={isEn ? "Quick choices for dependents" : "Chọn nhanh số người phụ thuộc"}>
                  {[0, 1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`preset-btn ${dependents !== "" && Number(dependents) === n ? "selected" : ""}`}
                      aria-pressed={dependents !== "" && Number(dependents) === n}
                      onClick={() => {
                        clearFieldError("dependents");
                        setDependents(String(n));
                      }}
                    >
                      {n === 4 ? "4+" : n}
                    </button>
                  ))}
                </div>
                {fieldErrors.dependents ? (
                  <small className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
                    {fieldErrors.dependents}
                  </small>
                ) : (
                  <p className="family-field-note">{isEn ? "Children or parents you support regularly." : "Con nhỏ hoặc bố mẹ già đang cần bạn chu cấp định kỳ."}</p>
                )}
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
                      <CurrencyInput
                        label={isEn ? "Monthly childcare expense" : "Chi phí chăm lo mỗi tháng"}
                        value={childAmount}
                        error={fieldErrors.childAmount}
                        onChange={(val) => {
                          clearFieldError("childAmount");
                          setChildAmount(val);
                        }}
                        placeholder="5.000.000"
                      />
                      <div className="survey-duration-col">
                        <div className="field">
                          <label htmlFor="qo-child-duration">{isEn ? "Expected support duration" : "Thời gian dự kiến chăm lo"}</label>
                          <select id="qo-child-duration" value={childDuration} onChange={e => setChildDuration(e.target.value)}>
                            <option value="unknown">{isEn ? "Undetermined" : "Chưa xác định"}</option>
                            <option value="1">{isEn ? "Around 1 year" : "Khoảng 1 năm"}</option>
                            <option value="3">{isEn ? "Around 3 years" : "Khoảng 3 năm"}</option>
                            <option value="5">{isEn ? "Around 5 years" : "Khoảng 5 năm"}</option>
                            <option value="10">{isEn ? "Around 10 years" : "Khoảng 10 năm"}</option>
                            <option value="retirement">{isEn ? "Until I retire" : "Đến khi tôi nghỉ hưu"}</option>
                            <option value="custom">{isEn ? "Pick end month" : "Tôi muốn chọn tháng kết thúc"}</option>
                          </select>
                          <p className="help survey-support-note">{getSupportNote(childDuration, childEnd, planEndMonth, desiredRetirementMonth, planningMonth, isEn)}</p>
                        </div>
                      </div>
                      {childDuration === "custom" && (
                        <div className="survey-branch-full">
                          <DateInput
                            mode="month"
                            label={isEn ? "End month" : "Tháng kết thúc chăm lo cho con"}
                            value={childEnd}
                            error={fieldErrors.childEnd}
                            onChange={(ym) => {
                              clearFieldError("childEnd");
                              setChildEnd(ym);
                            }}
                          />
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
                      <CurrencyInput
                        label={isEn ? "Monthly support expense" : "Chi phí phụng dưỡng mỗi tháng"}
                        value={parentAmount}
                        error={fieldErrors.parentAmount}
                        onChange={(val) => {
                          clearFieldError("parentAmount");
                          setParentAmount(val);
                        }}
                        placeholder="3.000.000"
                      />
                      <div className="survey-duration-col">
                        <div className="field">
                          <label htmlFor="qo-parent-duration">{isEn ? "Expected support duration" : "Thời gian dự kiến phụng dưỡng"}</label>
                          <select id="qo-parent-duration" value={parentDuration} onChange={e => setParentDuration(e.target.value)}>
                            <option value="unknown">{isEn ? "Undetermined" : "Chưa xác định"}</option>
                            <option value="1">{isEn ? "Around 1 year" : "Khoảng 1 năm"}</option>
                            <option value="3">{isEn ? "Around 3 years" : "Khoảng 3 năm"}</option>
                            <option value="5">{isEn ? "Around 5 years" : "Khoảng 5 năm"}</option>
                            <option value="10">{isEn ? "Around 10 years" : "Khoảng 10 năm"}</option>
                            <option value="retirement">{isEn ? "Until I retire" : "Đến khi tôi nghỉ hưu"}</option>
                            <option value="custom">{isEn ? "Pick end month" : "Tôi muốn chọn tháng kết thúc"}</option>
                          </select>
                          <p className="help survey-support-note">{getSupportNote(parentDuration, parentEnd, planEndMonth, desiredRetirementMonth, planningMonth, isEn)}</p>
                        </div>
                      </div>
                      {parentDuration === "custom" && (
                        <div className="survey-branch-full">
                          <DateInput
                            mode="month"
                            label={isEn ? "End month" : "Tháng kết thúc phụng dưỡng bố mẹ"}
                            value={parentEnd}
                            error={fieldErrors.parentEnd}
                            onChange={(ym) => {
                              clearFieldError("parentEnd");
                              setParentEnd(ym);
                            }}
                          />
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
                      <CurrencyInput
                        label={isEn ? "Current debt balance" : "Dư nợ hiện tại"}
                        value={debtBalance}
                        error={fieldErrors.debtBalance}
                        onChange={(val) => {
                          clearFieldError("debtBalance");
                          setDebtBalance(val);
                        }}
                        placeholder="300.000.000"
                      />
                      <CurrencyInput
                        label={isEn ? "Monthly payment" : "Trả nợ mỗi tháng"}
                        value={debtMonthlyPayment}
                        error={fieldErrors.debtMonthlyPayment}
                        onChange={(val) => {
                          clearFieldError("debtMonthlyPayment");
                          setDebtMonthlyPayment(val);
                        }}
                        placeholder="6.000.000"
                      />
                      <div className={`survey-branch-full field ${fieldErrors.debtRate ? "has-error" : ""}`}>
                        <label htmlFor="survey-debt-rate">{isEn ? "Interest rate (%/year)" : "Lãi suất khoản vay (%/năm)"}</label>
                        <input
                          id="survey-debt-rate"
                          type="number"
                          step="0.1"
                          min={0}
                          max={100}
                          value={debtRate}
                          aria-invalid={Boolean(fieldErrors.debtRate)}
                          onChange={e => {
                            clearFieldError("debtRate");
                            setDebtRate(Number(e.target.value));
                          }}
                        />
                        {fieldErrors.debtRate ? (
                          <small className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
                            {fieldErrors.debtRate}
                          </small>
                        ) : (
                          <p className="quick-helper-text">{isEn ? "Enter 0 if interest-free. Monthly payments are separate from living expenses." : "Nhập 0 nếu không có lãi. Khoản trả chưa nằm trong chi sinh hoạt ở bước trước."}</p>
                        )}
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
                      <div className={`field ${fieldErrors.goalName ? "has-error" : ""}`}>
                        <label htmlFor="survey-goal-name">{isEn ? "What do you want to spend on?" : "Bạn muốn dùng tiền vào việc gì?"}</label>
                        <input
                          id="survey-goal-name"
                          type="text"
                          placeholder={isEn ? "e.g., College tuition, home renovation..." : "Ví dụ: Học phí đại học, sửa nhà..."}
                          value={goalName}
                          aria-invalid={Boolean(fieldErrors.goalName)}
                          onChange={e => {
                            clearFieldError("goalName");
                            setGoalName(e.target.value);
                          }}
                        />
                        {fieldErrors.goalName && (
                          <small className="field-error-text error-text" style={{ color: "#dc2626", display: "block", marginTop: "6px", fontSize: "12px", fontWeight: 500 }}>
                            {fieldErrors.goalName}
                          </small>
                        )}
                      </div>
                      <CurrencyInput
                        label={isEn ? "Target budget needed" : "Cần bao nhiêu tiền (theo giá hiện tại)?"}
                        value={goalAmount}
                        error={fieldErrors.goalAmount}
                        onChange={(val) => {
                          clearFieldError("goalAmount");
                          setGoalAmount(val);
                        }}
                        placeholder="200.000.000"
                      />
                      <div className="field">
                        <DateInput
                          mode="month"
                          label={isEn ? "When do you need this fund?" : "Khi nào bạn cần dùng số tiền này?"}
                          value={goalMonth}
                          error={fieldErrors.goalMonth}
                          onChange={(ym) => {
                            clearFieldError("goalMonth");
                            setGoalMonth(ym);
                          }}
                        />
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
                <CurrencyInput
                  label={isEn ? "Estimated monthly pension" : "Lương hưu dự kiến mỗi tháng"}
                  value={pension}
                  error={fieldErrors.pension}
                  onChange={(val) => {
                    clearFieldError("pension");
                    setPension(val);
                  }}
                  placeholder="5.000.000"
                />
                <DateInput
                  mode="month"
                  label={isEn ? "Start month to receive pension" : "Tháng bắt đầu nhận lương hưu"}
                  value={pensionStart || desiredRetirementMonth}
                  error={fieldErrors.pensionStart}
                  onChange={(ym) => {
                    clearFieldError("pensionStart");
                    setPensionStart(ym);
                  }}
                />
              </div>
            )}
          </div>

          <div className="quick-actions form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "28px" }}>
            <button type="button" className="btn ghost button-ghost" disabled={working} onClick={() => setStep(2)}>
              {isEn ? "← Money today" : "← Tiền hôm nay"}
            </button>
            <button type="button" className="btn btn-primary" disabled={working} onClick={handleNextStep3}>
              {isEn ? "Continue →" : "Tiếp tục →"}
            </button>
          </div>
        </section>
      )}

      {/* SCREEN 4: KHẢ NĂNG CHỊU RỦI RO */}
      {step === 4 && (
        <section aria-labelledby="step4-title">
          <header className="quick-onboarding-header">
            <h1 id="step4-title">{isEn ? "Risk tolerance that fits you" : "Khả năng chịu rủi ro phù hợp với bạn"}</h1>
            <p>{isEn ? "Understand feelings towards volatility and what needs protection." : "Hiểu cảm nhận trước biến động và những khoản cần bảo vệ."}</p>
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

          {/* Stability & Priority selects - Stacked vertically matching demo */}
          <div className="field" style={{ marginBottom: "16px" }}>
            <label htmlFor="qo-stability">{isEn ? "How stable is your income?" : "Thu nhập của bạn thường thế nào?"}</label>
            <select id="qo-stability" value={stability} onChange={e => setStability(e.target.value)}>
              <option value="unknown">{isEn ? "Undetermined" : "Chưa xác định"}</option>
              <option value="stable">{isEn ? "Fairly stable" : "Khá ổn định"}</option>
              <option value="variable">{isEn ? "Variable" : "Có biến động"}</option>
              <option value="uncertain">{isEn ? "May be interrupted" : "Có thể gián đoạn"}</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: "20px" }}>
            <label htmlFor="qo-priority">{isEn ? "In retirement, what lifestyle do you desire?" : "Khi về hưu, bạn mong muốn mức sống như thế nào?"}</label>
            <select id="qo-priority" value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="balanced">{isEn ? "Balanced, fits budget" : "Sinh hoạt cân đối, phù hợp ngân sách"}</option>
              <option value="health">{isEn ? "Prioritize healthcare" : "Ưu tiên sức khỏe và chăm sóc"}</option>
              <option value="housing">{isEn ? "Prioritize housing" : "Ưu tiên chỗ ở ổn định"}</option>
              <option value="travel">{isEn ? "Travel & experience" : "Có điều kiện du lịch và trải nghiệm"}</option>
            </select>
          </div>

          {/* Loss limit accordion */}
          <details className="survey-extra" open={lossStatus === "known" || lossStatus === "percent"}>
            <summary>{isEn ? "Maximum loss limit you can tolerate" : "Mức lỗ tối đa bạn có thể chấp nhận"}</summary>
            <div className="field" style={{ marginTop: "12px" }}>
              <label htmlFor="qo-loss-status">{isEn ? "Do you have a specific loss threshold?" : "Bạn đã có mức giới hạn lỗ cụ thể chưa?"}</label>
              <select id="qo-loss-status" value={lossStatus} onChange={e => setLossStatus(e.target.value as typeof lossStatus)}>
                <option value="unknown">{isEn ? "Not sure - let app suggest" : "Chưa rõ — Nhờ ứng dụng gợi ý trước"}</option>
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
            <p className="help" style={{ marginTop: "12px", color: "#475569", fontSize: "12px", lineHeight: "1.45" }}>
              {isEn ? "You can review and confirm in Portfolio Allocation. This limit filters options, not guaranteeing actual market returns." : "Bạn sẽ xem số tiền tương ứng và xác nhận ở Phân bổ tài sản. Đây là giới hạn để chọn phương án, không bảo đảm mức lỗ thực tế."}
            </p>
          </details>

          {/* Information used for first plan accordion */}
          <details className="survey-extra">
            <summary>{isEn ? "Information used for your first plan" : "Thông tin dùng cho kế hoạch đầu tiên"}</summary>
            <dl>
              <div className="detail-row">
                <dt>{isEn ? "Desired retirement" : "Nghỉ hưu mong muốn"}</dt>
                <dd>{currentRetireAge} {isEn ? "years old" : "tuổi"}</dd>
              </div>
              <div className="detail-row">
                <dt>{isEn ? "Plan until" : "Chuẩn bị đến"}</dt>
                <dd>85 {isEn ? "years old" : "tuổi"}</dd>
              </div>
              <div className="detail-row">
                <dt>{isEn ? "Retirement spending at today's value" : "Chi nghỉ hưu theo giá hôm nay"}</dt>
                <dd>{formatVND(monthlyExpense)}/tháng</dd>
              </div>
              <div className="detail-row">
                <dt>{isEn ? "Desired monthly contribution" : "Mức muốn góp"}</dt>
                <dd>{formatVND(contribution)}/tháng</dd>
              </div>
            </dl>
            <p className="help" style={{ marginTop: "10px", color: "#475569", fontSize: "12px", lineHeight: "1.45" }}>
              {isEn ? "First results use 4 / 6 / 8% return scenarios and 3.5% inflation. Major goals and family support are scheduled as declared. Assumptions and allocations can be adjusted later." : "Kết quả đầu tiên dùng lợi suất thử 4 / 6 / 8% và lạm phát 3,5%. Mục tiêu lớn và hỗ trợ gia đình được tính theo lịch đã khai. Có thể chỉnh các giả định và phân bổ sau."}
            </p>
          </details>

          <div className="quick-actions form-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "28px" }}>
            <button
              type="button"
              className="btn ghost button-ghost"
              disabled={working}
              onClick={() => setStep(3)}
            >
              {isEn ? "← Family" : "← Gia đình"}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={working || !comfortReaction}
              onClick={handleComplete}
            >
              {working
                ? (isEn ? "Creating plan…" : "Đang tạo kế hoạch…")
                : (isEn ? "See your first plan →" : "Xem kế hoạch đầu tiên →")}
            </button>
          </div>
        </section>
      )}
      </div>
      <p className="qo-bottom">
        <Icon name="shield" size="small" />
        <span>{isEn ? "Your answers are encrypted and autosaved. You can return or adjust any time." : "Dữ liệu được bảo mật và tự động lưu. Các câu đã trả lời được giữ lại nếu bạn rời đi rồi quay lại."}</span>
      </p>
      </section>
    </div>
  );
}
export default QuickOnboarding;
