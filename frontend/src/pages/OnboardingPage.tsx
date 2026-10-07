import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { Badge, BrandLogo, Button, Card, Checkbox, Icon, IconButton, Input, Select, useNotification } from "../components/ui";
import {
  useFinancialProfile,
  EMPTY_PROFILE,
  type OnboardingDraftData,
} from "../context/FinancialProfileContext";
import { resumeDestination } from "../services/navigation";
import { useI18n } from "../i18n";

type StepId =
  | "welcome"
  | "personal"
  | "income"
  | "expense"
  | "assets"
  | "debt"
  | "invest-social"
  | "summary";

const INITIAL_FORM_DATA = {
  age: EMPTY_PROFILE.personal.age,
  gender: EMPTY_PROFILE.personal.gender,
  maritalStatus: EMPTY_PROFILE.personal.maritalStatus,
  dependents: EMPTY_PROFILE.personal.dependents,
  city: EMPTY_PROFILE.personal.city,
  primaryIncome: EMPTY_PROFILE.income.primaryIncome,
  secondaryIncome: EMPTY_PROFILE.income.secondaryIncome,
  essentialExpense: EMPTY_PROFILE.expenses.essentialExpense,
  lifestyleExpense: EMPTY_PROFILE.expenses.lifestyleExpense,
  cashSavings: EMPTY_PROFILE.assets.cashSavings,
  realEstateValue: EMPTY_PROFILE.assets.realEstateValue,
  liquidAssets: EMPTY_PROFILE.assets.liquidAssets,
  hasDebt: EMPTY_PROFILE.debt.hasDebt,
  mortgageDebt: EMPTY_PROFILE.debt.mortgageDebt,
  consumerDebt: EMPTY_PROFILE.debt.consumerDebt,
  monthlyDebtService: EMPTY_PROFILE.debt.monthlyDebtService,
  stockFundValue: EMPTY_PROFILE.assets.stockFundValue,
  socialInsuranceYears: EMPTY_PROFILE.socialSecurity.socialInsuranceYears,
  socialInsuranceSalary: EMPTY_PROFILE.socialSecurity.socialInsuranceSalary,
} as const;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();
  const { language } = useI18n();
  const isEn = language === "en";

  const {
    onboardingDraft,
    draftSaveStatus,
    lastDraftSavedAt,
    saveOnboardingDraft,
    completeOnboarding,
    saveError: apiSaveError,
  } = useFinancialProfile();

  const [currentStep, setCurrentStep] = useState<StepId>(() => {
    if (onboardingDraft?.step && onboardingDraft.step !== "welcome") {
      return onboardingDraft.step as StepId;
    }
    return "welcome";
  });
  const [isCompleted, setIsCompleted] = useState(false);
  const [working, setWorking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, [currentStep]);

  const steps = useMemo(() => [
    { id: "welcome" as StepId, number: 0, title: isEn ? "Welcome" : "Khởi đầu", detail: isEn ? "Intro & preparation" : "Giới thiệu & chuẩn bị" },
    { id: "personal" as StepId, number: 1, title: isEn ? "Personal" : "Cá nhân", detail: isEn ? "Age & dependents" : "Tuổi & người phụ thuộc" },
    { id: "income" as StepId, number: 2, title: isEn ? "Income" : "Thu nhập", detail: isEn ? "Salary & other sources" : "Lương & nguồn thu khác" },
    { id: "expense" as StepId, number: 3, title: isEn ? "Expenses" : "Chi tiêu", detail: isEn ? "Monthly living costs" : "Chi phí sinh hoạt tháng" },
    { id: "assets" as StepId, number: 4, title: isEn ? "Assets" : "Tài sản", detail: isEn ? "Savings & real estate" : "Tiết kiệm & bất động sản" },
    { id: "debt" as StepId, number: 5, title: isEn ? "Debts" : "Khoản nợ", detail: isEn ? "Mortgage & consumer loans" : "Vay mua nhà & tiêu dùng" },
    { id: "invest-social" as StepId, number: 6, title: isEn ? "Invest & Pension" : "Đầu tư & BHXH", detail: isEn ? "Portfolio & insurance" : "Danh mục & bảo hiểm" },
    { id: "summary" as StepId, number: 7, title: isEn ? "Summary" : "Tổng kết", detail: isEn ? "Net worth overview" : "Bức tranh tài sản ròng" },
  ], [isEn]);

  const genderOptions = useMemo(() => [
    { value: "", label: isEn ? "Select gender" : "Chọn giới tính" },
    { value: "Nam", label: isEn ? "Male" : "Nam" },
    { value: "Nữ", label: isEn ? "Female" : "Nữ" },
    { value: "Khác", label: isEn ? "Other" : "Khác" },
    { value: "Không tiết lộ", label: isEn ? "Prefer not to say" : "Không tiết lộ" },
  ], [isEn]);

  const maritalOptions = useMemo(() => [
    { value: "", label: isEn ? "Select status" : "Chọn tình trạng" },
    { value: "Đã kết hôn", label: isEn ? "Married" : "Đã kết hôn" },
    { value: "Độc thân", label: isEn ? "Single" : "Độc thân" },
    { value: "Khác", label: isEn ? "Other" : "Khác" },
  ], [isEn]);

  const cityOptions = useMemo(() => [
    { value: "", label: isEn ? "Select location" : "Chọn địa điểm" },
    { value: "TP. Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
    { value: "Hà Nội", label: "Hà Nội" },
    { value: "Đà Nẵng", label: "Đà Nẵng" },
    { value: "Đô thị loại 1", label: isEn ? "Tier 1 Municipality" : "Đô thị loại 1" },
    { value: "Nông thôn / Ngoại ô", label: isEn ? "Rural / Suburb" : "Nông thôn / Ngoại ô" },
  ], [isEn]);

  // Khôi phục từ bản nháp trên máy chủ
  const initialFromDraft = useMemo(() => {
    const d = onboardingDraft;
    return {
      ...INITIAL_FORM_DATA,
      age: d.age ?? INITIAL_FORM_DATA.age,
      gender: d.gender ?? INITIAL_FORM_DATA.gender,
      maritalStatus: d.maritalStatus ?? INITIAL_FORM_DATA.maritalStatus,
      dependents: d.dependents ?? INITIAL_FORM_DATA.dependents,
      city: d.city ?? INITIAL_FORM_DATA.city,
      primaryIncome: d.primaryIncome ?? INITIAL_FORM_DATA.primaryIncome,
      secondaryIncome: d.secondaryIncome ?? INITIAL_FORM_DATA.secondaryIncome,
      essentialExpense: d.essentialExpense ?? INITIAL_FORM_DATA.essentialExpense,
      lifestyleExpense: d.lifestyleExpense ?? INITIAL_FORM_DATA.lifestyleExpense,
      cashSavings: d.cashSavings ?? INITIAL_FORM_DATA.cashSavings,
      realEstateValue: d.realEstateValue ?? INITIAL_FORM_DATA.realEstateValue,
      liquidAssets: d.liquidAssets ?? INITIAL_FORM_DATA.liquidAssets,
      hasDebt: d.hasDebt ?? INITIAL_FORM_DATA.hasDebt,
      mortgageDebt: d.mortgageDebt ?? INITIAL_FORM_DATA.mortgageDebt,
      consumerDebt: d.consumerDebt ?? INITIAL_FORM_DATA.consumerDebt,
      monthlyDebtService: d.monthlyDebtService ?? INITIAL_FORM_DATA.monthlyDebtService,
      stockFundValue: d.stockFundValue ?? INITIAL_FORM_DATA.stockFundValue,
      socialInsuranceYears: d.socialInsuranceYears ?? INITIAL_FORM_DATA.socialInsuranceYears,
      socialInsuranceSalary: d.socialInsuranceSalary ?? INITIAL_FORM_DATA.socialInsuranceSalary,
    };
  }, [onboardingDraft]);

  // Form states: khởi tạo từ bản nháp đã lưu
  const [formData, setFormData] = useState(initialFromDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (onboardingDraft && Object.keys(onboardingDraft).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...initialFromDraft,
      }));
      if (onboardingDraft.step && onboardingDraft.step !== "welcome") {
        setCurrentStep(onboardingDraft.step as StepId);
      }
    }
  }, [onboardingDraft, initialFromDraft]);

  const updateField = <K extends keyof typeof formData>(field: K, value: typeof formData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateCurrentStep = (step: StepId): boolean => {
    const errors: Record<string, string> = {};
    if (step === "personal") {
      if (formData.age !== 0 && (formData.age < 18 || formData.age > 74)) {
        errors.age = isEn ? "Current age must be between 18 and 74." : "Tuổi hiện tại phải từ 18 đến 74 tuổi.";
      }
      if (formData.dependents < 0 || formData.dependents > 30) {
        errors.dependents = isEn ? "Number of dependents must be between 0 and 30." : "Số người phụ thuộc phải từ 0 đến 30.";
      }
    } else if (step === "income") {
      if (formData.primaryIncome < 0) {
        errors.primaryIncome = isEn ? "Primary income cannot be negative." : "Thu nhập chính không được là số âm.";
      }
      if (formData.secondaryIncome < 0) {
        errors.secondaryIncome = isEn ? "Secondary income cannot be negative." : "Thu nhập phụ không được là số âm.";
      }
    } else if (step === "expense") {
      if (formData.essentialExpense < 0) {
        errors.essentialExpense = isEn ? "Essential expense cannot be negative." : "Chi tiêu thiết yếu không được là số âm.";
      }
      if (formData.lifestyleExpense < 0) {
        errors.lifestyleExpense = isEn ? "Lifestyle expense cannot be negative." : "Chi tiêu phong cách sống không được là số âm.";
      }
    } else if (step === "assets") {
      if (formData.cashSavings < 0) errors.cashSavings = isEn ? "Savings and cash cannot be negative." : "Tiền gửi và tiền mặt không được là số âm.";
      if (formData.realEstateValue < 0) errors.realEstateValue = isEn ? "Real estate value cannot be negative." : "Giá trị bất động sản không được là số âm.";
      if (formData.liquidAssets < 0) errors.liquidAssets = isEn ? "Liquid assets cannot be negative." : "Tài sản thanh khoản không được là số âm.";
    } else if (step === "debt") {
      if (formData.hasDebt) {
        if (formData.mortgageDebt < 0) errors.mortgageDebt = isEn ? "Mortgage debt cannot be negative." : "Dư nợ vay mua nhà không được là số âm.";
        if (formData.consumerDebt < 0) errors.consumerDebt = isEn ? "Consumer debt cannot be negative." : "Dư nợ vay tiêu dùng không được là số âm.";
        if (formData.monthlyDebtService < 0) errors.monthlyDebtService = isEn ? "Monthly debt service cannot be negative." : "Khoản trả nợ hàng tháng không được là số âm.";
      }
    } else if (step === "invest-social") {
      if (formData.stockFundValue < 0) errors.stockFundValue = isEn ? "Investment value cannot be negative." : "Giá trị đầu tư không được là số âm.";
      if (formData.socialInsuranceYears < 0) errors.socialInsuranceYears = isEn ? "Social insurance years cannot be negative." : "Số năm đóng BHXH không được là số âm.";
      if (formData.age > 0 && formData.socialInsuranceYears > formData.age) {
        errors.socialInsuranceYears = isEn
          ? `Social insurance years cannot exceed current age (${formData.age} yrs).`
          : `Số năm đóng BHXH không được vượt quá tuổi (${formData.age} tuổi).`;
      }
      if (formData.socialInsuranceSalary < 0) errors.socialInsuranceSalary = isEn ? "Social insurance base salary cannot be negative." : "Mức lương làm căn cứ đóng BHXH không được là số âm.";
    } else if (step === "summary") {
      if (!formData.age || formData.age < 18 || formData.age > 74) {
        errors.summary = isEn ? "Please enter a valid age (18 - 74) in the Personal step." : "Vui lòng nhập tuổi hiện tại hợp lệ (18 - 74 tuổi) ở bước Cá nhân.";
      } else if (formData.socialInsuranceYears > formData.age) {
        errors.summary = isEn ? "Social insurance years cannot exceed your current age." : "Số năm đóng BHXH không được lớn hơn tuổi hiện tại.";
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstMessage = Object.values(errors)[0];
      setSaveError(firstMessage);
      notify.error(isEn ? "Invalid Information" : "Thông tin chưa hợp lệ", firstMessage);
      return false;
    }
    return true;
  };

  const totalMonthlyIncome = formData.primaryIncome + formData.secondaryIncome;
  const totalMonthlyExpense = formData.essentialExpense + formData.lifestyleExpense;
  const totalMonthlySurplus = totalMonthlyIncome - totalMonthlyExpense - (formData.hasDebt ? formData.monthlyDebtService : 0);

  const totalAssets = formData.cashSavings + formData.realEstateValue + formData.liquidAssets + formData.stockFundValue;
  const totalDebt = formData.hasDebt ? formData.mortgageDebt + formData.consumerDebt : 0;
  const estimatedNetWorth = totalAssets - totalDebt;

  const [visitedSteps, setVisitedSteps] = useState<StepId[]>([]);
  useEffect(() => {
    setVisitedSteps((prev) => (prev.includes(currentStep) ? prev : [...prev, currentStep]));
  }, [currentStep]);

  const isStepFilled = (id: StepId): boolean => {
    switch (id) {
      case "personal": return formData.age > 0 && Boolean(formData.gender) && Boolean(formData.maritalStatus) && Boolean(formData.city);
      case "income": return formData.primaryIncome > 0 || formData.secondaryIncome > 0;
      case "expense": return formData.essentialExpense > 0 || formData.lifestyleExpense > 0;
      case "assets": return formData.cashSavings > 0 || formData.realEstateValue > 0 || formData.liquidAssets > 0;
      // "No debt" is a valid answer once the user has actually opened this step.
      case "debt": return formData.hasDebt ? formData.mortgageDebt + formData.consumerDebt > 0 : visitedSteps.includes("debt");
      case "invest-social": return formData.socialInsuranceYears > 0 || formData.socialInsuranceSalary > 0 || formData.stockFundValue > 0;
      default: return true;
    }
  };

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const progressPercent = Math.round((currentStepIndex / (steps.length - 1)) * 100);
  const skippedSteps = steps.filter((s, index) => index > 0 && index < steps.length - 1 && index < currentStepIndex && !isStepFilled(s.id));
  const stepLabel = currentStepIndex === 0
    ? (isEn ? "Not started" : "Chưa bắt đầu")
    : (isEn ? `Step ${currentStepIndex}/${steps.length - 1}` : `Bước ${currentStepIndex}/${steps.length - 1}`);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat("vi-VN").format(num) + " ₫";
  };

  const handleNext = async () => {
    if (working) return;
    if (!validateCurrentStep(currentStep)) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setWorking(true); setSaveError(null);
    try {
      if (currentStepIndex < steps.length - 1) {
        const next = steps[currentStepIndex + 1].id;
        const ok = await saveOnboardingDraft({ step: next, ...formData });
        if (ok) {
          setCurrentStep(next);
        } else {
          const msg = isEn
            ? "Could not save your survey progress due to a connection issue. Please retry."
            : "Chưa thể lưu tiến độ khảo sát do gián đoạn kết nối. Vui lòng bấm Thử lại.";
          setSaveError(msg);
          notify.error(isEn ? "Save Progress Error" : "Lỗi lưu tiến độ", msg);
        }
      } else {
        const ok = await completeOnboarding({ ...formData, step: currentStep, updatedAt: new Date().toISOString() } as OnboardingDraftData);
        if (ok) {
          setIsCompleted(true);
          notify.success(
            isEn ? "Profile Initialized Successfully" : "Khởi tạo hồ sơ thành công",
            isEn ? "Your financial baseline has been saved to your account." : "Thông tin đã được lưu vào tài khoản của bạn."
          );
        } else {
          const msg = isEn
            ? "Could not complete your profile. Please check your data and retry."
            : "Chưa thể hoàn tất hồ sơ tài chính. Vui lòng kiểm tra và bấm Thử lại.";
          setSaveError(msg);
          notify.error(isEn ? "Submission Failed" : "Chưa thể hoàn tất", msg);
        }
      }
    } finally { setWorking(false); }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1].id);
      window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    }
  };

  if (isCompleted) {
    return (
      <div className="profile-complete">
        <Card className="profile-complete-card">
          <div className="complete-icon">
            <Icon name="circle-check" size="large" />
          </div>
          <Badge tone="success">{isEn ? "FINANCIAL PROFILE COMPLETED" : "HỒ SƠ TÀI CHÍNH HOÀN TẤT"}</Badge>
          <h1>{isEn ? "Wonderful! Your financial foundation is ready" : "Đã lưu hồ sơ tài chính ban đầu"}</h1>
          <p>
            {isEn
              ? "An Huu has analyzed your assets, income, and cashflow. Your current estimated net worth:"
              : "An Hưu đã phân tích đầy đủ tài sản, thu nhập và dòng tiền của bạn. Tài sản ròng ước tính hiện tại:"}
          </p>
          <strong>{formatVND(estimatedNetWorth)}</strong>

          <div className="complete-actions">
            <Button variant="secondary" onClick={() => setIsCompleted(false)}>
              {isEn ? "Review Entered Steps" : "Xem lại các bước khai báo"}
            </Button>
            <Button
              variant="primary"
              size="large"
              onClick={() => navigate(resumeDestination(location.state?.from, "user", "/user/dashboard"), { replace: true })}
            >
              {isEn ? "Open Dashboard & Plan Retirement" : "Mở Dashboard & Lập kế hoạch hưu trí"} <Icon name="arrow-right" />
            </Button>
          </div>
          <small>{isEn ? "This data will serve as the automatic basis for the retirement simulation engine." : "Tiếp theo, bổ sung mốc thời gian và phân bổ tài sản trong hồ sơ chi tiết để tính kế hoạch hưu trí."}</small>
        </Card>
      </div>
    );
  }

  return (
    <div className="onboarding-app">

      {apiSaveError && <p role="alert">{apiSaveError}</p>}
      {/* Mobile progress tracker */}
      <div className="onboarding-progress-mobile">
        <div>
          <span>{stepLabel}</span>
          <strong>{steps[currentStepIndex].title}</strong>
          <small>{progressPercent}%</small>
        </div>
        <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ "--progress": `${progressPercent}%` } as React.CSSProperties} />
        </div>
      </div>

      <div className="onboarding-layout">
        {/* Step Sidebar */}
        <aside className="step-sidebar" aria-label={isEn ? "Setup progress" : "Tiến trình khai báo"}>
          <Link to="/" className="onboarding-brand" aria-label={isEn ? "An Huu Home" : "Trang chủ An Hưu"}>
            <BrandLogo height="28px" />
          </Link>
            <div
              className={`save-status onboarding-save-status save-status-${draftSaveStatus}`}
              role="status"
              aria-live="polite"
            >
              {draftSaveStatus === "saving" ? (
                <>
                  <span className="save-spinner" aria-hidden="true" />
                  <span>{isEn ? "Saving draft..." : "Đang lưu bản nháp..."}</span>
                </>
              ) : draftSaveStatus === "saved" ? (
                <>
                  <Icon name="circle-check" size="small" />
                  <span>{isEn ? `Draft saved${lastDraftSavedAt ? ` at ${lastDraftSavedAt}` : ""}` : `Đã lưu bản nháp${lastDraftSavedAt ? ` lúc ${lastDraftSavedAt}` : ""}`}</span>
                </>
              ) : draftSaveStatus === "error" ? (
                <>
                  <Icon name="alert" size="small" />
                  <span>{isEn ? "Error saving draft. Please try again." : "Lỗi lưu bản nháp. Hãy thử lại."}</span>
                </>
              ) : (
                <>
                  <Icon name="circle-check" size="small" />
                  <span>{isEn ? "Draft is saved to your account as you proceed" : "Bản nháp được lưu vào tài khoản khi bạn tiếp tục"}</span>
                </>
              )}
            </div>
          <div className="step-progress-summary">
            <span>{isEn ? "SETUP PROGRESS" : "TIẾN ĐỘ THIẾT LẬP"}</span>
            <div>
              <strong>{progressPercent}%</strong>
              <small>({stepLabel})</small>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ "--progress": `${progressPercent}%` } as React.CSSProperties} />
            </div>
          </div>

          <nav>
            {steps.map((s, index) => {
              const isActive = s.id === currentStep;
              const isLast = index === steps.length - 1;
              const filled = index > 0 && !isLast && isStepFilled(s.id);
              const isSkipped = !isActive && index > 0 && !isLast && index < currentStepIndex && !filled;
              const isDone = !isActive && !isSkipped && (index === 0 ? currentStepIndex > 0 : filled);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""} ${isSkipped ? "is-skipped" : ""}`}
                  onClick={() => setCurrentStep(s.id)}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span>{isDone ? <Icon name="check" size="small" /> : isSkipped ? <Icon name="x" size="small" /> : index}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{isSkipped ? (isEn ? "Not filled in yet" : "Chưa điền thông tin") : s.detail}</small>
                  </div>
                </button>
              );
            })}
          </nav>

        </aside>

        {/* Main Content Area */}
        <main className="onboarding-main" id="main-content">
          <div className="onboarding-content">
            {/* STEP 0: WELCOME - REDESIGNED PREMIUM FINTECH ONBOARDING */}
            {currentStep === "welcome" && (
              <div className="welcome-step-v3">
                <header className="welcome-v3-header">
                  <span className="welcome-badge-pill">
                    <span className="welcome-badge-dot" aria-hidden="true" />
                    {isEn ? `${steps.length - 1} steps · about 5 minutes` : `${steps.length - 1} bước · khoảng 5 phút`}
                  </span>
                  <h1 className="welcome-v3-title">
                    {isEn ? "Set up your financial profile" : "Thiết lập hồ sơ tài chính"}
                  </h1>
                  <p className="welcome-v3-lead">
                    {isEn
                      ? "An Huu uses these figures to project your retirement plan month by month. Rough estimates are fine and everything can be edited later."
                      : "An Hưu dùng các số liệu này để dự phóng kế hoạch hưu trí theo từng tháng. Số ước lượng là đủ, bạn có thể sửa lại bất cứ lúc nào."}
                  </p>
                </header>

                <div className="welcome-v3-grid">
                  <section className="welcome-v3-plan" aria-labelledby="welcome-plan-title">
                    <h2 id="welcome-plan-title">{isEn ? "What you will fill in" : "Bạn sẽ khai báo"}</h2>
                    <ol>
                      {steps.slice(1).map((s) => (
                        <li key={s.id}>
                          <span className="welcome-v3-step-no" aria-hidden="true">{s.number}</span>
                          <span className="welcome-v3-step-text">
                            <strong>{s.title}</strong>
                            <small>{s.detail}</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <aside className="welcome-v3-side">
                    <section className="welcome-v3-prep" aria-labelledby="welcome-prep-title">
                      <h2 id="welcome-prep-title">{isEn ? "Have these ready" : "Nên chuẩn bị sẵn"}</h2>
                      <ul>
                        <li><Icon name="wallet" size="small" />{isEn ? "Monthly income after tax" : "Thu nhập hàng tháng (sau thuế)"}</li>
                        <li><Icon name="chart" size="small" />{isEn ? "Average monthly spending" : "Chi tiêu trung bình mỗi tháng"}</li>
                        <li><Icon name="home" size="small" />{isEn ? "Savings, investments and property" : "Tiền tiết kiệm, đầu tư, bất động sản"}</li>
                        <li><Icon name="file-text" size="small" />{isEn ? "Loan balances and monthly payments" : "Dư nợ và số tiền trả nợ mỗi tháng"}</li>
                        <li><Icon name="shield" size="small" />{isEn ? "Years of social insurance (BHXH)" : "Số năm đã đóng BHXH"}</li>
                      </ul>
                    </section>

                    <ul className="welcome-v3-assurances">
                      <li>
                        <Icon name="circle-check" size="small" />
                        <span>{isEn ? "Estimates are enough, no need to be exact." : "Không cần chính xác từng đồng, ước lượng là đủ."}</span>
                      </li>
                      <li>
                        <Icon name="circle-check" size="small" />
                        <span>{isEn ? "Your draft is saved as you go." : "Bản nháp được lưu khi bạn chuyển bước."}</span>
                      </li>
                      <li>
                        <Icon name="circle-check" size="small" />
                        <span>{isEn ? "Used only for your projections, never sold or shared." : "Chỉ dùng để tính toán cho bạn, không bán hay chia sẻ."}</span>
                      </li>
                    </ul>
                  </aside>
                </div>
              </div>
            )}

            {/* STEP 1: PERSONAL INFO */}
            {currentStep === "personal" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="users" /></span>
                  <Badge tone="soft">{isEn ? "STEP 1/7" : "BƯỚC 1/7"}</Badge>
                  <h1>{isEn ? "Personal & Family Information" : "Thông tin cá nhân & Gia đình"}</h1>
                  <p>{isEn ? "Age milestones and dependents directly impact your accumulation horizon and retirement fund size." : "Các mốc tuổi và người phụ thuộc ảnh hưởng trực tiếp đến thời gian tích lũy và quy mô quỹ hưu trí."}</p>
                </div>

                <div className="form-grid">
                  <Input
                    label={isEn ? "Your Current Age" : "Tuổi hiện tại của bạn"}
                    type="number"
                    value={formData.age === 0 ? "" : String(formData.age)}
                    onChange={(v) => updateField("age", Number(v) || 0)}
                    error={fieldErrors.age}
                    suffix={isEn ? "yrs old" : "tuổi"}
                  />

                  <Select
                    label={isEn ? "Gender" : "Giới tính"}
                    options={genderOptions.map((o) => o.label)}
                    value={genderOptions.find((o) => o.value === formData.gender)?.label || genderOptions[0].label}
                    onChange={(v) => {
                      const found = genderOptions.find((o) => o.label === v);
                      updateField("gender", found ? found.value : "");
                    }}
                    error={fieldErrors.gender}
                    helper={isEn ? "Under Vietnamese labor law, retirement age schedules differ for men and women." : "Theo luật lao động Việt Nam, tuổi nghỉ hưu nam & nữ có lộ trình khác nhau."}
                  />

                  <Select
                    label={isEn ? "Marital Status" : "Tình trạng hôn nhân"}
                    options={maritalOptions.map((o) => o.label)}
                    value={maritalOptions.find((o) => o.value === formData.maritalStatus)?.label || maritalOptions[0].label}
                    onChange={(v) => {
                      const found = maritalOptions.find((o) => o.label === v);
                      updateField("maritalStatus", found ? found.value : "");
                    }}
                    error={fieldErrors.maritalStatus}
                  />

                  <Input
                    label={isEn ? "Number of Dependents (children, elderly parents)" : "Số người phụ thuộc (con cái, cha mẹ già)"}
                    type="number"
                    value={String(formData.dependents)}
                    onChange={(v) => updateField("dependents", Number(v) || 0)}
                    error={fieldErrors.dependents}
                    suffix={isEn ? "people" : "người"}
                  />

                  <Select
                    label={isEn ? "Expected Retirement Location" : "Nơi sinh sống dự kiến khi nghỉ hưu"}
                    options={cityOptions.map((o) => o.label)}
                    value={cityOptions.find((o) => o.value === formData.city)?.label || cityOptions[0].label}
                    onChange={(v) => {
                      const found = cityOptions.find((o) => o.label === v);
                      updateField("city", found ? found.value : "");
                    }}
                    error={fieldErrors.city}
                    helper={isEn ? "Cost of living in major cities is typically 30-40% higher than other regions." : "Mức chi phí sinh hoạt tại các thành phố lớn thường cao hơn 30-40% so với khu vực khác."}
                  />

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>{isEn ? "Plan Impact" : "Tác động đến kế hoạch"}</strong>
                      <p>
                        {isEn
                          ? `If you are ${formData.age} and plan to retire at 60, you have ${Math.max(0, 60 - formData.age)} golden years left to build your wealth.`
                          : `Nếu bạn ${formData.age} tuổi và dự kiến nghỉ hưu ở tuổi 60, bạn còn đúng ${Math.max(0, 60 - formData.age)} năm vàng để tạo lập tài sản.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: INCOME */}
            {currentStep === "income" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="wallet" /></span>
                  <Badge tone="soft">{isEn ? "STEP 2/7" : "BƯỚC 2/7"}</Badge>
                  <h1>{isEn ? "Monthly Income Sources" : "Nguồn thu nhập hàng tháng"}</h1>
                  <p>{isEn ? "Income is the crucial financial inflow determining your ability to accumulate consistently each month." : "Thu nhập là dòng chảy tài chính quan trọng quyết định khả năng tích lũy đều đặn mỗi tháng của bạn."}</p>
                </div>

                <div className="form-grid">
                  <Input
                    label={isEn ? "Primary Net Income (Salary / Compensation)" : "Thu nhập chính sau thuế (Lương / Thù lao)"}
                    type="number"
                    value={String(formData.primaryIncome)}
                    onChange={(v) => updateField("primaryIncome", Number(v) || 0)}
                    error={fieldErrors.primaryIncome}
                    suffix={isEn ? "₫/mo" : "đ/tháng"}
                    helper={isEn ? "Net amount received in your account monthly after taxes and mandatory insurance deductions." : "Số tiền thực nhận vào tài khoản hàng tháng sau khi đã trừ các khoản thuế và bảo hiểm."}
                  />

                  <Input
                    label={isEn ? "Secondary / Investment / Business Income" : "Thu nhập phụ / Đầu tư / Kinh doanh"}
                    type="number"
                    value={String(formData.secondaryIncome)}
                    onChange={(v) => updateField("secondaryIncome", Number(v) || 0)}
                    error={fieldErrors.secondaryIncome}
                    suffix={isEn ? "₫/mo" : "đ/tháng"}
                    helper={isEn ? "Rental income, dividends, freelancing (enter monthly average)." : "Thu nhập từ cho thuê nhà, cổ tức, làm tự do (lấy mức bình quân hàng tháng)."}
                  />

                  <Card className="inline-total-card">
                    <span>{isEn ? "Total Net Monthly Income:" : "Tổng thu nhập ròng mỗi tháng:"}</span>
                    <strong>{formatVND(totalMonthlyIncome)}</strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="sparkles" /></span>
                    <div>
                      <strong>{isEn ? "Expert Insight" : "Gợi ý từ chuyên gia"}</strong>
                      <p>{isEn ? "Individuals with stable monthly incomes over 30 million typically allocate 20% to 30% to retirement to achieve financial comfort." : "Người có nguồn thu nhập ổn định trên 30 triệu/tháng thường dành 20 - 30% cho quỹ hưu trí để đạt mức sống thoải mái."}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: EXPENSE */}
            {currentStep === "expense" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="chart" /></span>
                  <Badge tone="soft">{isEn ? "STEP 3/7" : "BƯỚC 3/7"}</Badge>
                  <h1>{isEn ? "Expenses & Living Standards" : "Chi tiêu & Mức sống sinh hoạt"}</h1>
                  <p>{isEn ? "Current spending is the baseline for projecting living expenses needed in retirement to maintain your lifestyle." : "Chi tiêu hiện tại là thước đo cơ bản để dự toán mức chi phí bạn cần có khi về già để giữ nguyên phong cách sống."}</p>
                </div>

                <div className="form-grid">
                  <Input
                    label={isEn ? "Monthly Essential Expenses" : "Chi tiêu thiết yếu hàng tháng"}
                    type="number"
                    value={String(formData.essentialExpense)}
                    onChange={(v) => updateField("essentialExpense", Number(v) || 0)}
                    error={fieldErrors.essentialExpense}
                    suffix={isEn ? "₫/mo" : "đ/tháng"}
                    helper={isEn ? "Includes: food, utilities, rent/HOA, medical care, children's tuition." : "Bao gồm: ăn uống, điện nước, tiền thuê nhà/quản lý, y tế, học phí của con."}
                  />

                  <Input
                    label={isEn ? "Lifestyle & Discretionary Expenses" : "Chi tiêu phong cách sống & Giải trí"}
                    type="number"
                    value={String(formData.lifestyleExpense)}
                    onChange={(v) => updateField("lifestyleExpense", Number(v) || 0)}
                    error={fieldErrors.lifestyleExpense}
                    suffix={isEn ? "₫/mo" : "đ/tháng"}
                    helper={isEn ? "Includes: shopping, travel, socializing, hobbies." : "Bao gồm: mua sắm, du lịch, giao lưu bạn bè, sở thích cá nhân."}
                  />

                  <Card className="inline-total-card">
                    <span>{isEn ? "Total Monthly Living Expenses:" : "Tổng chi tiêu sinh hoạt hàng tháng:"}</span>
                    <strong>{formatVND(totalMonthlyExpense)}</strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>{isEn ? "70% - 80% Retirement Rule" : "Quy luật hưu trí 70 - 80%"}</strong>
                      <p>{isEn ? "In retirement, work-related commute and child-rearing costs disappear; expenses typically equal 70% to 80% of pre-retirement spending." : "Khi nghỉ hưu, bạn không còn các chi phí liên quan công việc và nuôi con nhỏ, mức chi tiêu thường bằng 70 - 80% so với thời điểm đi làm."}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: ASSETS */}
            {currentStep === "assets" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="home" /></span>
                  <Badge tone="soft">{isEn ? "STEP 4/7" : "BƯỚC 4/7"}</Badge>
                  <h1>{isEn ? "Current Accumulated Assets" : "Tài sản tích lũy hiện có"}</h1>
                  <p>{isEn ? "Existing accumulated assets will compound and serve as the launchpad for your future retirement fund." : "Các tài sản tích lũy hiện thời sẽ tiếp tục sinh lời và tạo thành bệ phóng cho quỹ hưu trí tương lai."}</p>
                </div>

                <div className="form-grid">
                  <Input
                    label={isEn ? "Bank Deposits & Cash" : "Tiền gửi ngân hàng & Tiền mặt"}
                    type="number"
                    value={String(formData.cashSavings)}
                    onChange={(v) => updateField("cashSavings", Number(v) || 0)}
                    error={fieldErrors.cashSavings}
                    suffix="₫"
                    helper={isEn ? "Checking accounts, term savings deposits at banks." : "Tài khoản thanh toán, sổ tiết kiệm có kỳ hạn tại các ngân hàng."}
                  />

                  <Input
                    label={isEn ? "Real Estate Market Value" : "Giá trị Bất động sản đang sở hữu"}
                    type="number"
                    value={String(formData.realEstateValue)}
                    onChange={(v) => updateField("realEstateValue", Number(v) || 0)}
                    error={fieldErrors.realEstateValue}
                    suffix="₫"
                    helper={isEn ? "Estimated market value of owned houses, land, or condominiums." : "Giá thị trường ước tính của nhà ở, đất hoặc căn hộ."}
                  />

                  <Input
                    label={isEn ? "Gold / Other Liquid Assets" : "Vàng / Tài sản thanh khoản khác"}
                    type="number"
                    value={String(formData.liquidAssets)}
                    onChange={(v) => updateField("liquidAssets", Number(v) || 0)}
                    error={fieldErrors.liquidAssets}
                    suffix="₫"
                    helper={isEn ? "Gold bullion, certificates of deposit, vehicles, or convertible assets." : "Vàng miếng, chứng chỉ tiền gửi, xe cộ hoặc tài sản có giá trị chuyển đổi."}
                  />

                  <Card className="inline-total-card">
                    <span>{isEn ? "Initial Estimated Total Assets:" : "Tổng tài sản ước tính ban đầu:"}</span>
                    <strong>{formatVND(formData.cashSavings + formData.realEstateValue + formData.liquidAssets)}</strong>
                  </Card>
                </div>
              </div>
            )}

            {/* STEP 5: DEBT */}
            {currentStep === "debt" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="alert" /></span>
                  <Badge tone="soft">{isEn ? "STEP 5/7" : "BƯỚC 5/7"}</Badge>
                  <h1>{isEn ? "Debts & Financial Obligations" : "Các khoản nợ & Nghĩa vụ tài chính"}</h1>
                  <p>{isEn ? "Tracking debts ensures accurate calculation of your actual surplus cashflow available for accumulation." : "Nắm rõ các khoản nợ giúp tính toán chính xác dòng tiền thặng dư thực tế có thể dành cho tích lũy."}</p>
                </div>

                <div className="form-grid">
                  <Checkbox
                    checked={formData.hasDebt}
                    label={isEn ? "I currently have active debts to repay (mortgage, consumer loans, installments)" : "Tôi hiện đang có các khoản nợ cần trả (vay mua nhà, vay tiêu dùng, trả góp)"}
                    onChange={(v) => setFormData({ ...formData, hasDebt: v })}
                  />

                  {formData.hasDebt && (
                    <div className="debt-fields">
                      <Input
                        label={isEn ? "Mortgage / Real Estate Debt" : "Dư nợ vay mua nhà / Bất động sản"}
                        type="number"
                        value={String(formData.mortgageDebt)}
                        onChange={(v) => updateField("mortgageDebt", Number(v) || 0)}
                        error={fieldErrors.mortgageDebt}
                        suffix="₫"
                      />

                      <Input
                        label={isEn ? "Consumer Loan / Credit Card Debt" : "Dư nợ vay tiêu dùng / Thẻ tín dụng"}
                        type="number"
                        value={String(formData.consumerDebt)}
                        onChange={(v) => updateField("consumerDebt", Number(v) || 0)}
                        error={fieldErrors.consumerDebt}
                        suffix="₫"
                      />

                      <Input
                        label={isEn ? "Monthly Principal & Interest Payment" : "Số tiền trả nợ cả gốc lẫn lãi hàng tháng"}
                        type="number"
                        value={String(formData.monthlyDebtService)}
                        onChange={(v) => updateField("monthlyDebtService", Number(v) || 0)}
                        error={fieldErrors.monthlyDebtService}
                        suffix={isEn ? "₫/mo" : "đ/tháng"}
                        helper={isEn ? "Fixed recurring deduction from income paid to financial institutions." : "Khoản trích cố định từ thu nhập để trả cho các tổ chức tín dụng."}
                      />
                    </div>
                  )}

                  <Card className="inline-total-card">
                    <span>{isEn ? "Current Total Debt Balance:" : "Tổng dư nợ hiện tại:"}</span>
                    <strong style={{ color: "var(--color-danger)" }}>
                      {formatVND(formData.hasDebt ? formData.mortgageDebt + formData.consumerDebt : 0)}
                    </strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="circle-check" /></span>
                    <div>
                      <strong>{isEn ? "Goal Before Retirement" : "Mục tiêu trước khi nghỉ hưu"}</strong>
                      <p>{isEn ? "Golden rule of retirement finance: Eliminate all high-interest debt prior to retirement to protect passive income." : "Nguyên tắc vàng của tài chính hưu trí: Phải thanh toán toàn bộ nợ lãi suất cao trước khi bước vào tuổi nghỉ hưu để bảo toàn thu nhập thụ động."}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: INVEST & SOCIAL SECURITY */}
            {currentStep === "invest-social" && (
              <div>
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="sparkles" /></span>
                  <Badge tone="soft">{isEn ? "STEP 6/7" : "BƯỚC 6/7"}</Badge>
                  <h1>{isEn ? "Investments & Social Security (BHXH)" : "Đầu tư & Bảo hiểm Xã hội (BHXH)"}</h1>
                  <p>{isEn ? "State pension from BHXH and returns from your investment portfolio are the two core pillars supporting your retirement." : "Lương hưu từ BHXH và lợi nhuận từ danh mục đầu tư là hai trụ cột chính nuôi dưỡng quỹ hưu trí."}</p>
                </div>

                <div className="form-grid">
                  <Input
                    label={isEn ? "Investment Portfolio Value (Stocks, Mutual Funds, Bonds)" : "Giá trị danh mục đầu tư (Cổ phiếu, Quỹ mở, Trái phiếu)"}
                    type="number"
                    value={String(formData.stockFundValue)}
                    onChange={(v) => updateField("stockFundValue", Number(v) || 0)}
                    error={fieldErrors.stockFundValue}
                    suffix="₫"
                    helper={isEn ? "Current balance across brokerage accounts and investment platforms." : "Số dư hiện tại trong các tài khoản chứng khoán hoặc ứng dụng đầu tư."}
                  />

                  <Input
                    label={isEn ? "Years of Mandatory / Voluntary Social Insurance Contributions" : "Số năm đã tham gia BHXH bắt buộc / tự nguyện"}
                    type="number"
                    value={String(formData.socialInsuranceYears)}
                    onChange={(v) => updateField("socialInsuranceYears", Number(v) || 0)}
                    error={fieldErrors.socialInsuranceYears}
                    suffix={isEn ? "years" : "năm"}
                    helper={isEn ? "Minimum 15 to 20 contribution years required to qualify for a monthly pension." : "Tối thiểu 15 đến 20 năm đóng BHXH để đủ điều kiện hưởng lương hưu hàng tháng."}
                  />

                  <Input
                    label={isEn ? "Average Base Salary for Social Insurance Contributions" : "Mức lương làm căn cứ đóng BHXH bình quân"}
                    type="number"
                    value={String(formData.socialInsuranceSalary)}
                    onChange={(v) => updateField("socialInsuranceSalary", Number(v) || 0)}
                    error={fieldErrors.socialInsuranceSalary}
                    suffix={isEn ? "₫/mo" : "đ/tháng"}
                    helper={isEn ? "Contractual base salary for social insurance (often different from total take-home pay)." : "Mức lương ghi trên hợp đồng lao động đóng BHXH (thường khác với tổng thu nhập thực nhận)."}
                  />

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>{isEn ? "Social Insurance Reference" : "Tham chiếu mức đóng BHXH"}</strong>
                      <p>{isEn ? "Contribution years and salary serve as an initial benchmark. You can configure detailed estimated pensions and check legal retirement age per Decree 135/2020/ND-CP in Detailed Financial Profile (v2)." : "Thông tin năm đóng và mức lương đóng là cơ sở tham chiếu ban đầu. Bạn có thể khai báo mức lương hưu ước tính cụ thể và tra cứu tuổi nghỉ hưu pháp lý theo Nghị định 135/2020/NĐ-CP tại Hồ sơ tài chính chi tiết (v2)."}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7: SUMMARY */}
            {currentStep === "summary" && (
              <div className="summary-step">
                <div className="step-heading">
                  <span className="step-heading-icon"><Icon name="circle-check" /></span>
                  <Badge tone="success">{isEn ? "STEP 7/7 · SUMMARY" : "BƯỚC 7/7 · TỔNG KẾT"}</Badge>
                  <h1>{isEn ? "Your Comprehensive Financial Overview" : "Bức tranh tài chính tổng quan của bạn"}</h1>
                  <p>{isEn ? "Review all key financial metrics before completing your profile and receiving your customized retirement roadmap." : "Hãy xem lại toàn bộ các chỉ số tài chính quan trọng trước khi hoàn tất hồ sơ và tiến hành lập kế hoạch nghỉ hưu chi tiết."}</p>
                </div>

                {skippedSteps.length > 0 && (
                  <div className="onboarding-skipped-card" role="status">
                    <div>
                      <strong>{isEn ? `${skippedSteps.length} step(s) left empty` : `Còn ${skippedSteps.length} bước chưa điền`}</strong>
                      <p>{isEn ? "The plan will treat these as zero. Fill them in for a more accurate result." : "Kế hoạch sẽ tính các mục này bằng 0. Điền thêm để kết quả sát thực tế hơn."}</p>
                    </div>
                    <div className="onboarding-skipped-list">
                      {skippedSteps.map((s) => (
                        <button key={s.id} type="button" onClick={() => setCurrentStep(s.id)}>
                          <Icon name="x" size="small" /> {s.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Net Worth Card */}
                <div className="net-worth-card">
                  <div className="net-worth-copy">
                    <Badge tone="soft">{isEn ? "CURRENT NET WORTH" : "TÀI SẢN RÒNG HIỆN TẠI (NET WORTH)"}</Badge>
                    <strong>{formatVND(estimatedNetWorth)}</strong>
                    <p>
                      {isEn
                        ? `Total assets (${formatVND(totalAssets)}) minus total liabilities (${formatVND(totalDebt)})`
                        : `Tổng tài sản (${formatVND(totalAssets)}) trừ đi tổng nghĩa vụ nợ (${formatVND(totalDebt)})`}
                    </p>
                  </div>

                  <div className="net-worth-visual">
                    <div className="worth-bar">
                      <span
                        className="assets-part"
                        style={{ "--asset-share": `${totalAssets > 0 ? Math.round((estimatedNetWorth / totalAssets) * 100) : 100}%` } as React.CSSProperties}
                      />
                      <span className="debt-part" />
                    </div>
                    <div className="worth-legend">
                      <span>
                        <i className="legend-assets" />
                        <span>{isEn ? "Available Net Worth" : "Tài sản ròng khả dụng"}</span>
                        <strong>{formatVND(estimatedNetWorth)}</strong>
                      </span>
                      <span>
                        <i className="legend-debt" />
                        <span>{isEn ? "Debt Obligations" : "Nghĩa vụ nợ cần tất toán"}</span>
                        <strong>{formatVND(totalDebt)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary Metrics */}
                <div className="summary-metrics">
                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="wallet" /></span>
                    <div>
                      <small>{isEn ? "Monthly Income" : "Thu nhập hàng tháng"}</small>
                      <strong>{formatVND(totalMonthlyIncome)}</strong>
                    </div>
                    <Badge tone="success">{isEn ? "Positive" : "Dương"}</Badge>
                  </Card>

                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="chart" /></span>
                    <div>
                      <small>{isEn ? "Monthly Expenses" : "Chi tiêu hàng tháng"}</small>
                      <strong>{formatVND(totalMonthlyExpense)}</strong>
                    </div>
                    <Badge tone="neutral">{isEn ? "Living" : "Sinh hoạt"}</Badge>
                  </Card>

                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="alert" /></span>
                    <div>
                      <small>{isEn ? "Monthly Debt Payment" : "Trả nợ hàng tháng"}</small>
                      <strong>{formatVND(formData.hasDebt ? formData.monthlyDebtService : 0)}</strong>
                    </div>
                    <Badge tone={formData.hasDebt ? "warning" : "success"}>
                      {formData.hasDebt ? (isEn ? "Paying" : "Đang trả") : (isEn ? "Debt-free" : "Không có nợ")}
                    </Badge>
                  </Card>

                  <Card className="summary-metric-card">
                    <span className="summary-metric-icon"><Icon name="target" /></span>
                    <div>
                      <small>{isEn ? "Monthly Surplus for Accumulation" : "Dòng tiền thặng dư có thể tích lũy"}</small>
                      <strong style={{ color: totalMonthlySurplus < 0 ? "var(--color-danger)" : undefined }}>
                        {formatVND(totalMonthlySurplus)}
                      </strong>
                    </div>
                    {totalMonthlySurplus < 0 ? (
                      <Badge tone="danger">{isEn ? "Cashflow Deficit" : "Thiếu hụt dòng tiền"}</Badge>
                    ) : (
                      <Badge tone="honey">{isEn ? "Accumulation Surplus" : "Thặng dư tích lũy"}</Badge>
                    )}
                  </Card>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Onboarding Actions */}
          <div className="onboarding-actions">
            <div className="onboarding-actions-start">
              {currentStepIndex > 0 && (
                <Button variant="secondary" onClick={handlePrev}>
                  <Icon name="arrow-left" size="small" /> <span className="onboarding-back-label">{isEn ? "Back" : "Quay lại"}</span>
                </Button>
              )}
            </div>

            <div className="onboarding-actions-end">
              <Button
                variant="ghost"
                className="onboarding-exit-btn"
                disabled={working}
                onClick={async () => {
                  if (working) return;
                  setWorking(true);
                  try { if (await saveOnboardingDraft({ step: currentStep, ...formData })) navigate("/user/dashboard"); }
                  finally { setWorking(false); }
                }}
              >
                {isEn ? "Save & finish later" : "Lưu & làm sau"}
              </Button>
            <Button variant="primary" size="large" onClick={handleNext} loading={working}>
              {currentStepIndex === 0 ? (
                <>{isEn ? "Start" : "Bắt đầu khai báo"} <Icon name="arrow-right" /></>
              ) : currentStepIndex === steps.length - 1 ? (
                <>{isEn ? "Complete profile" : "Hoàn tất hồ sơ"} <Icon name="check" /></>
              ) : (
                <>{isEn ? "Continue" : "Tiếp tục"} <Icon name="arrow-right" /></>
              )}
            </Button>
            </div>
          </div>

          {saveError && (
            <div className="save-error-banner" role="alert">
              <Icon name="alert" />
              <span>{saveError}</span>
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
