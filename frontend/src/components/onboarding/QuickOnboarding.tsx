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

  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (onboardingDraft?.step === "quick-money") return 2;
    if (onboardingDraft?.step === "quick-risk") return 3;
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

  // Step 3: Risk survey
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
    const horizonQ = policyDetail.data.questions.find((q) => q.id === "Q_HORIZON");
    if (horizonQ && horizonQ.choices.some((c) => c.id === targetId)) {
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
      setStep(3);
      window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
    } finally {
      setWorking(false);
    }
  };

  // Step 3 Completion
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
    <div className="quick-onboarding-container">
      {/* 3-Stage Progress Indicator */}
      <ol className="onboarding-stages" aria-label={isEn ? "Setup stages" : "Các chặng khai báo"}>
        <li aria-current={step === 1 ? "step" : undefined}>
          <span aria-hidden="true">1</span>
          {isEn ? "Your wish" : "Mong muốn"}
        </li>
        <li aria-current={step === 2 ? "step" : undefined}>
          <span aria-hidden="true">2</span>
          {isEn ? "Current finances" : "Tiền hôm nay"}
        </li>
        <li aria-current={step === 3 ? "step" : undefined}>
          <span aria-hidden="true">3</span>
          {isEn ? "Investment risk" : "Khẩu vị đầu tư"}
        </li>
      </ol>

      {/* Simulator prefilled badge */}
      {simPrefill && (
        <div className="quick-sim-badge" data-testid="sim-prefilled-badge">
          <Icon name="sparkles" size="small" />
          <span>{isEn ? "Prefilled from your simulation" : "Đã điền từ bản mô phỏng của bạn"}</span>
        </div>
      )}

      {/* Validation alert */}
      {validationError && (
        <div role="alert" style={{ marginBottom: "16px", padding: "10px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "14px" }}>
          {validationError}
        </div>
      )}

      {/* SCREEN 1: MONG MUỐN */}
      {step === 1 && (
        <section aria-labelledby="step1-title">
          <header className="quick-onboarding-header">
            <h1 id="step1-title">{isEn ? "Your Retirement Wish" : "Mong muốn của bạn"}</h1>
            <p>{isEn ? "Define your timeline and monthly spending goal in retirement." : "Xác định thời gian và mức sống bạn mong muốn khi nghỉ hưu."}</p>
          </header>

          <div className="quick-field-group">
            <div className="quick-field">
              <Input
                label={isEn ? "Birth month (required)" : "Tháng/năm sinh (bắt buộc)"}
                type="month"
                value={birthMonth}
                onChange={(val) => setBirthMonth(val)}
              />
              {calculatedAge > 0 && (
                <p className="quick-helper-text">
                  {isEn ? `Age calculated from birth month: ${calculatedAge} years old` : `Tuổi tính từ tháng sinh: ${calculatedAge} tuổi`}
                </p>
              )}
              {suggestedBirthYear && !birthMonth && (
                <p className="quick-helper-text" style={{ color: "var(--color-primary-700)" }}>
                  {isEn
                    ? `Suggested birth year from simulation: ${suggestedBirthYear}. Please select your birth month.`
                    : `Gợi ý năm sinh từ bản mô phỏng: ${suggestedBirthYear}. Vui lòng chọn tháng và năm sinh của bạn.`}
                </p>
              )}
            </div>

            <div className="quick-field">
              <Input
                label={isEn ? "Desired retirement month (required)" : "Tháng bạn muốn nghỉ hưu (bắt buộc)"}
                type="month"
                value={desiredRetirementMonth}
                onChange={(val) => setDesiredRetirementMonth(val)}
              />
              <p className="quick-helper-text">
                {isEn ? "For retired individuals: you can choose the current or a past month." : "Người đã nghỉ hưu: có thể chọn tháng hiện tại hoặc tháng trong quá khứ."}
              </p>
            </div>

            <div className="quick-field">
              <CurrencyInput
                label={isEn ? "Desired monthly spending (at today's prices)" : "Mức chi mong muốn mỗi tháng (theo giá hôm nay)"}
                value={monthlyExpense}
                onChange={(val) => setMonthlyExpense(val)}
                placeholder="20.000.000"
              />
              <div className="quick-chips-row" role="group" aria-label={isEn ? "Spending quick choices" : "Gợi ý mức chi"}>
                {[15_000_000, 20_000_000, 30_000_000, 40_000_000].map((amt) => {
                  const label = isEn ? `${amt / 1_000_000} million` : `${amt / 1_000_000} triệu`;
                  return (
                    <button
                      key={amt}
                      type="button"
                      className={`quick-chip ${monthlyExpense === amt ? "is-active" : ""}`}
                      onClick={() => setMonthlyExpense(amt)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="quick-actions" style={{ justifyContent: "flex-end" }}>
            <Button variant="primary" disabled={working} onClick={handleNextStep1}>
              {isEn ? "Continue" : "Tiếp tục"}
              <Icon name="arrow-right" />
            </Button>
          </div>
        </section>
      )}

      {/* SCREEN 2: TIỀN HÔM NAY */}
      {step === 2 && (
        <section aria-labelledby="step2-title">
          <header className="quick-onboarding-header">
            <h1 id="step2-title">{isEn ? "Your Money Today" : "Tiền của bạn hôm nay"}</h1>
            <p>{isEn ? "A quick summary of income, spending, savings and debt." : "Bức tranh tài chính tóm tắt để bộ tính xác định dòng tiền chuẩn bị."}</p>
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

      {/* SCREEN 3: KHẨU VỊ ĐẦU TƯ */}
      {step === 3 && (
        <section aria-labelledby="step3-title">
          <header className="quick-onboarding-header">
            <h1 id="step3-title">{isEn ? "Your Investment Preferences" : "Khẩu vị đầu tư"}</h1>
            <p>{isEn ? "Select choices to determine your risk profile and recommended asset allocation." : "Chọn các lựa chọn dưới đây để xác định danh mục đầu tư phù hợp cho kế hoạch của bạn."}</p>
          </header>

          {loadingPolicy ? (
            <p role="status">{isEn ? "Loading policy questions…" : "Đang tải câu hỏi chính sách…"}</p>
          ) : (
            <div className="quick-field-group">
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
          )}

          <div className="quick-actions">
            <Button variant="secondary" disabled={working} onClick={() => setStep(2)}>
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
  );
}
export default QuickOnboarding;
