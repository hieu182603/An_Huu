import { PlanningQuestions } from "../components/PlanningQuestions";
import type { PlanningConstraints } from "../services/financialProfile";
import "./onboarding-readability.css";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { Badge, BrandLogo, Button, Card, Checkbox, Icon, IconButton, Input, Modal, Select, useNotification } from "../components/ui";
import { PurchasingPower } from "../components/PurchasingPower";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { CurrencyInput } from "../components/CurrencyInput";
import {
  useFinancialProfile,
  EMPTY_PROFILE,
  type OnboardingDraftData,
} from "../context/FinancialProfileContext";
import { resumeDestination } from "../services/navigation";
import { useI18n } from "../i18n";
import { useAuth } from "../context/AuthContext";

interface AssetCategoryMaster {
  id: string;
  name: string;
  defaultUnit: string;
  units: string[];
  placeholderName: string;
}

const ASSET_MASTER_DATA: AssetCategoryMaster[] = [
  {
    id: "gold",
    name: "Vàng & Kim loại quý",
    defaultUnit: "Chỉ",
    units: ["Chỉ", "Lượng (Cây)", "Gam", "VND"],
    placeholderName: "Ví dụ: Vàng miếng SJC, Nhẫn vàng 9999",
  },
  {
    id: "stock",
    name: "Cổ phiếu & Chứng khoán",
    defaultUnit: "Cổ phiếu",
    units: ["Cổ phiếu", "Tài khoản CK", "VND"],
    placeholderName: "Ví dụ: Cổ phiếu FPT, VNM, HPG",
  },
  {
    id: "fund",
    name: "Chứng chỉ quỹ (Quỹ mở, ETF)",
    defaultUnit: "CCQ",
    units: ["CCQ", "Tài khoản quỹ", "VND"],
    placeholderName: "Ví dụ: Quỹ DCDS, VEOF, Diamond ETF",
  },
  {
    id: "bond",
    name: "Trái phiếu (Doanh nghiệp, Chính phủ)",
    defaultUnit: "Trái phiếu",
    units: ["Trái phiếu", "Hợp đồng", "VND"],
    placeholderName: "Ví dụ: Trái phiếu Techcombank, Vingroup",
  },
  {
    id: "vehicle",
    name: "Phương tiện & Xe cộ có giá trị",
    defaultUnit: "Chiếc",
    units: ["Chiếc", "Xe", "VND"],
    placeholderName: "Ví dụ: Xe ô tô cá nhân",
  },
  {
    id: "currency",
    name: "Ngoại tệ dự trữ",
    defaultUnit: "USD",
    units: ["USD", "EUR", "JPY", "VND"],
    placeholderName: "Ví dụ: Tiền gửi USD",
  },
  {
    id: "other",
    name: "Tài sản khác có thể đổi thành tiền",
    defaultUnit: "VND",
    units: ["VND", "Hợp đồng", "Món", "Khác"],
    placeholderName: "Ví dụ: Sổ tiết kiệm khác, chứng chỉ tiền gửi",
  },
];

interface CustomAssetItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  unit: string;
  quantity?: number;
  valueVnd: number;
}

type StepId =
  | "welcome"
  | "contribution"
  | "personal"
  | "income"
  | "expense"
  | "assets"
  | "debt"
  | "invest-social"
  | "summary";

const INITIAL_FORM_DATA = {
  fullName: "",
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
  hasDebt: true,
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
  const { user } = useAuth();
  const { draftSelection, updateDraft } = useRetirementPlan();
  const planningMonth = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  const desiredExpense = Number(draftSelection?.monthlyExpenseToday ?? 0);
  const retirementMonth = draftSelection?.whatIf?.retirementMonth ?? "";
  const contribution = Number(draftSelection?.monthlyContribution ?? 0);
  const [showPower, setShowPower] = useState(false);
  useEffect(() => { if (showPower) { window.scrollTo(0, 0); document.getElementById("purchasing-power-title")?.focus({ preventScroll: true }); } }, [showPower]);


  const {
    onboardingDraft,
    hasOnboardingDraft,
    schemaVersion,
    draftSaveStatus,
    lastDraftSavedAt,
    legacyOnboardingDraft,
    onboardingConstraints,
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
  const [constraints, setConstraints] = useState<PlanningConstraints | undefined>(onboardingConstraints);
  useEffect(() => { setConstraints(onboardingConstraints); }, [onboardingConstraints]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isCompleted) {
      navigate(resumeDestination(location.state?.from, "user", "/user/goal"), { replace: true });
    }
  }, [isCompleted, navigate]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }, [currentStep]);

  const steps = useMemo(() => [
    { id: "welcome" as StepId, number: 0, title: isEn ? "Your wish" : "Mong muốn", detail: isEn ? "Spending at today’s prices" : "Mức chi theo giá hôm nay" },
    { id: "personal" as StepId, number: 1, title: isEn ? "Timeline" : "Thời gian", detail: isEn ? "Age & retirement month" : "Tuổi & tháng nghỉ hưu" },
    { id: "income" as StepId, number: 2, title: isEn ? "Income" : "Thu nhập", detail: isEn ? "Salary & other sources" : "Lương & nguồn thu khác" },
    { id: "expense" as StepId, number: 3, title: isEn ? "Expenses" : "Chi tiêu", detail: isEn ? "Monthly living costs" : "Chi phí sinh hoạt tháng" },
    { id: "assets" as StepId, number: 4, title: isEn ? "Assets" : "Tài sản", detail: isEn ? "Savings & real estate" : "Tiết kiệm & bất động sản" },
    { id: "contribution" as StepId, number: 5, title: isEn ? "Contribution" : "Khoản góp", detail: isEn ? "Within your budget" : "Vừa sức với phần dư" },
    { id: "debt" as StepId, number: 6, title: isEn ? "Debts" : "Khoản nợ", detail: isEn ? "Mortgage & consumer loans" : "Vay mua nhà & tiêu dùng" },
    { id: "invest-social" as StepId, number: 7, title: isEn ? "Social Security (BHXH)" : "Bảo hiểm Xã hội (BHXH)", detail: isEn ? "Contribution history" : "Lịch sử đóng BHXH" },
    { id: "summary" as StepId, number: 8, title: isEn ? "Summary" : "Tổng kết", detail: isEn ? "Net worth overview" : "Bức tranh tài sản ròng" },
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
    const hasExplicitNoDebt = hasOnboardingDraft && d.hasDebt === false;
    const hasAnyDebtValue = (d.mortgageDebt ?? 0) > 0 || (d.consumerDebt ?? 0) > 0 || (d.monthlyDebtService ?? 0) > 0;
    const resolvedHasDebt = hasAnyDebtValue ? true : (hasExplicitNoDebt ? false : true);
    const savedFullName = user?.name || "";

    return {
      ...INITIAL_FORM_DATA,
      birthMonth: d.birthMonth ?? "",
      fullName: (d as any).fullName || savedFullName || user?.name || EMPTY_PROFILE.personal.name || "",
      age: d.age ?? INITIAL_FORM_DATA.age,
      gender: d.gender || "Không tiết lộ",
      maritalStatus: d.maritalStatus || "Khác",
      dependents: d.dependents ?? INITIAL_FORM_DATA.dependents,
      city: d.city ?? INITIAL_FORM_DATA.city,
      primaryIncome: d.primaryIncome ?? INITIAL_FORM_DATA.primaryIncome,
      secondaryIncome: d.secondaryIncome ?? INITIAL_FORM_DATA.secondaryIncome,
      essentialExpense: d.essentialExpense ?? INITIAL_FORM_DATA.essentialExpense,
      lifestyleExpense: d.lifestyleExpense ?? INITIAL_FORM_DATA.lifestyleExpense,
      cashSavings: d.cashSavings ?? INITIAL_FORM_DATA.cashSavings,
      realEstateValue: d.realEstateValue ?? INITIAL_FORM_DATA.realEstateValue,
      liquidAssets: d.liquidAssets ?? INITIAL_FORM_DATA.liquidAssets,
      hasDebt: resolvedHasDebt,
      mortgageDebt: d.mortgageDebt ?? INITIAL_FORM_DATA.mortgageDebt,
      consumerDebt: d.consumerDebt ?? INITIAL_FORM_DATA.consumerDebt,
      monthlyDebtService: d.monthlyDebtService ?? INITIAL_FORM_DATA.monthlyDebtService,
      stockFundValue: d.stockFundValue ?? INITIAL_FORM_DATA.stockFundValue,
      socialInsuranceYears: d.socialInsuranceYears ?? INITIAL_FORM_DATA.socialInsuranceYears,
      socialInsuranceSalary: d.socialInsuranceSalary ?? INITIAL_FORM_DATA.socialInsuranceSalary,
    };
  }, [onboardingDraft, user?.name]);

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

  const [customAssets, setCustomAssets] = useState<CustomAssetItem[]>(() => {
    const total = initialFromDraft.liquidAssets;
    return total > 0 ? [{ id: "saved-total", categoryId: "other", categoryName: isEn ? "Other assets" : "Tài sản khác", name: isEn ? "Previously saved assets (total)" : "Tổng tài sản khác đã lưu", unit: "VND", valueVnd: total }] : [];
  });

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("gold");
  const [newAssetName, setNewAssetName] = useState<string>("");
  const [selectedUnit, setSelectedUnit] = useState<string>("Chỉ");
  const [newAssetQuantity, setNewAssetQuantity] = useState<number>(0);
  const [newAssetValue, setNewAssetValue] = useState<number>(0);
  const [assetModalError, setAssetModalError] = useState<string>("");

  useEffect(() => {
    if (schemaVersion === 2) return;
    const sum = customAssets.reduce((acc, it) => acc + (it.valueVnd || 0), 0);
    setFormData((prev) => ({ ...prev, liquidAssets: sum }));

  }, [customAssets, schemaVersion, user?.id]);

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    const cat = ASSET_MASTER_DATA.find((c) => c.id === catId);
    if (cat) setSelectedUnit(cat.defaultUnit);
  };

  const handleAddCustomAsset = () => {
    if (!newAssetName.trim()) {
      setAssetModalError(isEn ? "Please enter an asset name." : "Vui lòng nhập tên tài sản.");
      return;
    }
    if (!newAssetValue || newAssetValue <= 0) {
      setAssetModalError(isEn ? "Please enter a valid value in VND." : "Vui lòng nhập giá trị quy đổi sang VND lớn hơn 0.");
      return;
    }
    const cat = ASSET_MASTER_DATA.find((c) => c.id === selectedCategory) || ASSET_MASTER_DATA[0];
    const newItem: CustomAssetItem = {
      id: "ast_" + Date.now(),
      categoryId: cat.id,
      categoryName: isEn ? cat.id.toUpperCase() : cat.name,
      name: newAssetName.trim(),
      unit: selectedUnit,
      quantity: newAssetQuantity > 0 ? newAssetQuantity : undefined,
      valueVnd: newAssetValue,
    };
    setCustomAssets((prev) => [...prev, newItem]);
    setNewAssetName("");
    setNewAssetQuantity(0);
    setNewAssetValue(0);
    setAssetModalError("");
    setAssetModalOpen(false);
  };

  const handleRemoveAsset = (id: string) => {
    setCustomAssets((prev) => prev.filter((it) => it.id !== id));
  };

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

  const updateNumberField = <K extends keyof typeof formData>(field: K, value: string | number) => {
    const raw = typeof value === "number" ? value : Number(value) || 0;
    const nonNegative = Math.max(0, raw);
    updateField(field, nonNegative as typeof formData[K]);
  };

  const validateCurrentStep = (step: StepId): boolean => {
    const errors: Record<string, string> = {};
    if (step === "welcome" && (!Number.isSafeInteger(desiredExpense) || desiredExpense <= 0)) {
      errors.goal = isEn ? "Choose a positive monthly spending amount." : "Chọn mức chi mỗi tháng lớn hơn 0.";
    } else if (step === "contribution" && (!Number.isSafeInteger(contribution) || contribution < 0)) {
      errors.contribution = isEn ? "Enter a non-negative whole VND amount." : "Nhập số tiền nguyên từ 0 trở lên.";
    } else if (step === "personal") {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(retirementMonth) || retirementMonth < planningMonth) errors.retirementMonth = isEn ? "Choose a retirement month from this month onward." : "Chọn tháng nghỉ hưu từ tháng hiện tại trở đi.";

      if (!Number.isInteger(formData.age) || formData.age < 18 || formData.age > 74) {
        errors.age = isEn ? "Current age must be between 18 and 74." : "Tuổi hiện tại phải là số nguyên từ 18 đến 74.";
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
        errors.lifestyleExpense = isEn ? "Monthly estimated expense cannot be negative." : "Dự trù chi tiêu hàng tháng không được là số âm.";
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
      if (formData.socialInsuranceYears < 0) errors.socialInsuranceYears = isEn ? "Social insurance years cannot be negative." : "Số năm đóng BHXH không được là số âm.";
      if (formData.age > 0 && formData.socialInsuranceYears > formData.age) {
        errors.socialInsuranceYears = isEn
          ? `Social insurance years cannot exceed current age (${formData.age} yrs).`
          : `Số năm đóng BHXH không được vượt quá tuổi (${formData.age} tuổi).`;
      }
      if (formData.socialInsuranceSalary < 0) errors.socialInsuranceSalary = isEn ? "Social insurance base salary cannot be negative." : "Mức lương làm căn cứ đóng BHXH không được là số âm.";
    } else if (step === "summary") {
      if (legacyOnboardingDraft && (!formData.age || formData.age < 18 || formData.age > 74)) {
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
      case "personal": return formData.age > 0 && Boolean(retirementMonth);
      case "income": return formData.primaryIncome > 0 || formData.secondaryIncome > 0;
      case "expense": return formData.essentialExpense > 0 || formData.lifestyleExpense > 0;
      case "assets": return formData.cashSavings > 0 || formData.realEstateValue > 0 || formData.liquidAssets > 0 || customAssets.length > 0;
      // "No debt" is a valid answer once chosen or opened.
      case "debt": return !formData.hasDebt || (formData.mortgageDebt > 0 || formData.consumerDebt > 0 || formData.monthlyDebtService > 0) || visitedSteps.includes("debt");
      case "invest-social": return formData.socialInsuranceYears > 0 || formData.socialInsuranceSalary > 0;
      default: return true;
    }
  };

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const stageIndex = currentStepIndex <= 1 ? 0 : currentStepIndex <= 6 ? 1 : 2;
  const stageLabels = isEn ? ["Your wish & timeline", "Income & assets", "Pension & review"] : ["Mong muốn & thời gian", "Thu chi & tài sản", "Lương hưu & kiểm tra"];
  const stepPurpose: Record<StepId, string> = isEn ? {
    contribution: "Choose how much to contribute; the amount left over is not invested automatically.",
    welcome: "Start with the life you want. Suggested amounts are examples, not recommendations.",
    personal: "Your age and retirement date set the time available to prepare.",
    income: "Enter the income available for spending and saving, so the plan can distinguish incoming money from expenses.",
    expense: "Separate essential and flexible expenses to understand the amount left after spending.",
    assets: "Record what you currently own. These declarations are separate from the assets allocated to retirement in your detailed profile.",
    debt: "Record outstanding debt and regular repayments to avoid counting repayment money as savings.",
    "invest-social": "These figures describe your social insurance contribution history. Pension estimates still need the detailed contribution record.",
    summary: "Review your entries before saving the profile. Completing the profile does not mean the retirement plan is fully funded."
  } : {
    contribution: "Chọn khoản góp vừa sức; phần dư không tự động được đầu tư.",
    welcome: "Bắt đầu từ cuộc sống bạn mong muốn. Các mức gợi ý là ví dụ để chọn, không phải khuyến nghị.",
    personal: "Tuổi và tháng nghỉ hưu giúp xác định thời gian bạn còn để chuẩn bị.",
    income: "Khai báo khoản thu dành cho chi tiêu và tích lũy, để phân biệt tiền vào với các khoản phải chi.",
    expense: "Tách chi tiêu thiết yếu và linh hoạt để hiểu khoản còn lại sau chi tiêu.",
    assets: "Khai báo tài sản đang sở hữu. Phần dành cho hưu trí được xác nhận riêng trong hồ sơ chi tiết.",
    debt: "Khai báo dư nợ và số tiền trả định kỳ để không nhầm tiền trả nợ với tiền có thể tích lũy.",
    "invest-social": "Các số này mô tả lịch sử đóng bảo hiểm xã hội. Ước tính lương hưu vẫn cần quá trình đóng BHXH chi tiết.",
    summary: "Kiểm tra thông tin trước khi lưu hồ sơ. Hoàn tất hồ sơ không có nghĩa là đã đủ tiền nghỉ hưu."
  };
  const progressPercent = Math.round((currentStepIndex / (steps.length - 1)) * 100);
  const skippedSteps = steps.filter((s, index) => index > 0 && index < steps.length - 1 && index < currentStepIndex && !isStepFilled(s.id));
  const stepLabel = currentStepIndex === 0
    ? (isEn ? "Not started" : "Chưa bắt đầu")
    : (isEn ? `Step ${currentStepIndex}/${steps.length - 1}` : `Bước ${currentStepIndex}/${steps.length - 1}`);

  const formatVND = (num: number) => {
    const rounded = Math.floor(num || 0);
    return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
  };

  const handleNext = async () => {
    if (working) return;
    if (!validateCurrentStep(currentStep)) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (currentStep === "personal" && !showPower) { setShowPower(true); return; }
    setWorking(true); setSaveError(null);
    try {
      if (currentStepIndex < steps.length - 1) {
        const next = steps[currentStepIndex + 1].id;
        const ok = await saveOnboardingDraft({ step: next, ...formData, desiredRetirementMonth: retirementMonth }, constraints);
        if (ok) {
          setShowPower(false);
          setCurrentStep(next);
        } else {
          const msg = isEn
            ? "Your survey progress has not been saved. Please review the message below."
            : "Tiến độ khảo sát chưa được lưu. Vui lòng xem thông báo bên dưới.";
          setSaveError(msg);
        }
      } else {
        const ok = await completeOnboarding({ ...formData, desiredRetirementMonth: retirementMonth, step: currentStep, updatedAt: new Date().toISOString() } as OnboardingDraftData, constraints);
        if (ok) {
          // The survey saves quick totals (profile v1); plan previews need the
          // detailed profile with a real birth month, so review it next.
          notify.success(
            isEn ? "Profile Initialized Successfully" : "Khởi tạo hồ sơ thành công",
            isEn ? "Next, add your birth month and retirement month in the detailed profile so your plan can be calculated." : "Bước tiếp theo: bổ sung tháng sinh và tháng muốn nghỉ hưu trong hồ sơ chi tiết để tính kế hoạch."
          );
          navigate(resumeDestination(location.state?.from, "user", "/user/account?tab=profile"), { replace: true });
        } else {
          const msg = isEn
            ? "Could not complete your profile. Please check your data and retry."
            : "Chưa thể hoàn tất hồ sơ tài chính. Vui lòng kiểm tra và bấm Thử lại.";
          setSaveError(msg);
        }
      }
    } finally { setWorking(false); }
  };

  const handlePrev = () => {
    if (showPower) { setShowPower(false); return; }
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1].id);
      window.scrollTo({ left: 0, top: 0, behavior: "instant" as ScrollBehavior });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    }
  };

  if (schemaVersion === 2) {
    const d = onboardingDraft;
    const draftValues = [
      [isEn ? "Age" : "Tuổi", d.age],
      [isEn ? "Gender" : "Giới tính", d.gender],
      [isEn ? "Marital status" : "Tình trạng hôn nhân", d.maritalStatus],
      [isEn ? "Dependents" : "Người phụ thuộc", d.dependents],
      [isEn ? "City" : "Nơi sống", d.city],
      ...[
        [isEn ? "Main monthly income" : "Thu nhập chính mỗi tháng", d.primaryIncome],
        [isEn ? "Other monthly income" : "Thu nhập khác mỗi tháng", d.secondaryIncome],
        [isEn ? "Essential monthly expenses" : "Chi tiêu thiết yếu mỗi tháng", d.essentialExpense],
        [isEn ? "Other monthly expenses" : "Chi tiêu khác mỗi tháng", d.lifestyleExpense],
        [isEn ? "Cash and savings" : "Tiền mặt và tiết kiệm", d.cashSavings],
        [isEn ? "Real estate" : "Bất động sản", d.realEstateValue],
        [isEn ? "Other liquid assets" : "Tài sản dễ bán khác", d.liquidAssets],
        [isEn ? "Stocks and funds" : "Cổ phiếu và quỹ", d.stockFundValue],
        [isEn ? "Mortgage balance" : "Dư nợ vay mua nhà", d.mortgageDebt],
        [isEn ? "Consumer loan balance" : "Dư nợ vay tiêu dùng", d.consumerDebt],
        [isEn ? "Monthly loan payments" : "Trả nợ mỗi tháng", d.monthlyDebtService],
        [isEn ? "Social insurance salary" : "Lương đóng BHXH", d.socialInsuranceSalary],
      ].map(([label, value]) => [label, formatVND(Number(value))]),
      [isEn ? "Social insurance years" : "Số năm đóng BHXH", d.socialInsuranceYears],
    ];
    return <main className="profile-complete">
      <Card className="profile-complete-card">
        <h1>{isEn ? "Update your existing financial profile" : "Cập nhật hồ sơ tài chính đang có"}</h1>
        <p>{isEn
          ? "Your account already has a detailed financial profile. Update it directly to preserve individual assets, loans and dates. This initial survey cannot replace those details."
          : "Tài khoản đã có hồ sơ tài chính chi tiết. Hãy sửa trực tiếp tại đó để giữ từng tài sản, khoản vay và mốc thời gian. Khảo sát ban đầu này không thể thay thế các thông tin chi tiết đó."}</p>
        <Link className="button button-primary" to="/user/account?tab=profile">{isEn ? "Open financial profile" : "Mở Hồ sơ tài chính"}</Link>
        {hasOnboardingDraft && <details>
          <summary>{isEn ? "Review the saved survey draft" : "Xem lại bản nháp khảo sát đã lưu"}</summary>
          <p>{isEn ? "This draft is retained but has not been applied. Compare these values when editing your financial profile." : "Bản nháp vẫn được giữ lại, chưa được áp dụng vào hồ sơ. Bạn có thể đối chiếu các số liệu này khi sửa hồ sơ tài chính."}</p>
          <dl>{draftValues.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value === "" ? "—" : value}</dd></div>)}</dl>
          <Link to="/user/account?tab=profile" target="_blank" rel="noopener noreferrer">{isEn ? "Edit profile in a new tab to compare" : "Mở hồ sơ trong tab mới để đối chiếu"}</Link>
        </details>}
      </Card>
    </main>;
  }

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
              ? "An Huu has saved the asset, income, and cashflow details you reported. Your current estimated net worth:"
              : "An Hưu đã lưu thông tin tài sản, thu nhập và dòng tiền bạn vừa khai báo. Tài sản ròng ước tính hiện tại:"}
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

      {/* Mobile progress tracker */}
      <div className="onboarding-progress-mobile">
        <div>
          <span>{stepLabel}</span>
          <strong>{steps[currentStepIndex].title}</strong>
          <small>{progressPercent}%</small>
        </div>
        <div className="progress-track" role="progressbar" aria-label={isEn ? "Setup progress" : "Tiến trình khai báo"} aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
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
                  <span>{isEn ? "Draft is saved to your account as you proceed" : "Số liệu hồ sơ được lưu vào tài khoản khi tiếp tục"}</span>
                </>
              )}
            </div>
          <div className="step-progress-summary">
            <span>{isEn ? "SETUP PROGRESS" : "TIẾN ĐỘ THIẾT LẬP"}</span>
            <div>
              <strong>{progressPercent}%</strong>
              <small>({stepLabel})</small>
            </div>
            <div className="progress-track" role="progressbar" aria-label={isEn ? "Setup progress" : "Tiến trình khai báo"} aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
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
                  onClick={() => { setShowPower(false); setCurrentStep(s.id); }}
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
            <ol className="onboarding-stages" aria-label={isEn ? "Setup stages" : "Các chặng khai báo"}>
              {stageLabels.map((label, index) => <li key={label} aria-current={stageIndex === index ? "step" : undefined}>
                <span aria-hidden="true">{index + 1}</span>{label}
              </li>)}
            </ol>
            <div className="onboarding-step-guide">
              <p>{stepPurpose[currentStep]}</p>
              {currentStep !== "welcome" && currentStep !== "summary" && <p className="onboarding-unknown-help">{isEn ? "Not sure of a figure? Choose Save & finish later. Do not use zero to mean unknown." : "Chưa biết số liệu? Chọn “Lưu & làm sau”. Không nhập 0 để thay cho thông tin chưa biết."}</p>}
            </div>
            {/* STEP 0: WELCOME - REDESIGNED PREMIUM FINTECH ONBOARDING */}
            {currentStep === "welcome" && <section className="onboarding-question">
              <h1>{isEn ? "How much would you like to spend each month in retirement?" : "Bạn muốn chi bao nhiêu mỗi tháng khi nghỉ hưu?"}</h1>
              <p>{isEn ? "Use today's prices, for the lifestyle you want." : "Tính theo giá hôm nay, cho mức sống bạn mong muốn."}</p>
              <CurrencyInput label={isEn ? "Desired monthly spending at today's prices" : "Mức chi mong muốn mỗi tháng theo giá hôm nay"} value={desiredExpense} onChange={value => updateDraft({ monthlyExpenseToday: String(value) })} error={fieldErrors.goal} suffix={isEn ? "VND/month" : "đồng/tháng"} />
              <div className="onboarding-suggestions">{[15, 20, 30, 40].map(amount => <Button key={amount} variant={desiredExpense === amount * 1000000 ? "primary" : "secondary"} onClick={() => updateDraft({ monthlyExpenseToday: String(amount * 1000000) })}>{amount} {isEn ? "million" : "triệu"}</Button>)}</div>
            </section>}
            <p className="onboarding-draft-note">{isEn ? "Spending goals, retirement month and contributions stay in the existing session plan draft until you save a plan version. Profile figures are saved to your account when you continue." : "Mức chi mục tiêu, tháng nghỉ hưu và khoản góp được giữ trong nháp kế hoạch của phiên này đến khi bạn lưu phiên bản kế hoạch. Số liệu hồ sơ được lưu vào tài khoản khi tiếp tục."}</p>
            {currentStep === "personal" && showPower && <PurchasingPower expense={desiredExpense} startMonth={planningMonth} retirementMonth={retirementMonth} />}
            {currentStep === "personal" && !showPower && (
              <div>
                <div className="step-heading">
                  <Badge tone="soft">{stepLabel}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="users" /></span>
                    <h1>{isEn ? "When would you like to retire?" : "Bạn muốn bắt đầu cuộc sống ấy khi nào?"}</h1>
                  </div>
                  <p>{isEn ? "Your retirement date sets the time available to prepare." : "Mốc nghỉ hưu giúp xác định thời gian bạn còn để chuẩn bị."}</p>
                </div>

                <div className="form-grid">
                  <Input
                    label={isEn ? "Your Current Age (required to finish)" : "Tuổi hiện tại của bạn (cần để hoàn tất)"}
                    type="number"
                    min={0}
                    max={120}
                    value={formData.age === 0 ? "" : String(formData.age)}
                    onChange={(v) => updateNumberField("age", v)}
                    error={fieldErrors.age}
                    suffix={isEn ? "yrs old" : "tuổi"}
                  />

                  <Input type="month" label={isEn ? "Desired retirement month" : "Tháng bạn muốn nghỉ hưu"} value={retirementMonth} min={planningMonth} error={fieldErrors.retirementMonth} onChange={value => updateDraft({ whatIf: { ...draftSelection?.whatIf, retirementMonth: value } })} />
                  <p>{isEn ? "Choose the date you want. Your exact birth month can be added to the detailed profile later." : "Chọn mốc thời gian bạn mong muốn. Bạn sẽ bổ sung tháng sinh chính xác trong hồ sơ chi tiết."}</p>
                </div>
              </div>
            )}

            {/* STEP 2: INCOME */}
            {currentStep === "income" && (
              <div>
                <div className="step-heading">
                  <Badge tone="soft">{stepLabel}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="wallet" /></span>
                    <h1>{isEn ? "What is your monthly take-home income?" : "Mỗi tháng bạn thực nhận bao nhiêu?"}</h1>
                  </div>
                  <p>{isEn ? "Income is the crucial financial inflow determining your ability to accumulate consistently each month." : "Thu nhập là dòng chảy tài chính quan trọng quyết định khả năng tích lũy đều đặn mỗi tháng của bạn."}</p>
                </div>

                <div className="form-grid">
                  <CurrencyInput
                    label={isEn ? "Primary Net Income (Salary / Compensation)" : "Thu nhập chính sau thuế (Lương / Thù lao)"}
                    value={formData.primaryIncome}
                    onChange={(v) => updateNumberField("primaryIncome", v)}
                    error={fieldErrors.primaryIncome}
                    suffix={isEn ? "VND/mo" : "VND/tháng"}
                    helper={isEn ? "Net amount received in your account monthly after taxes and mandatory insurance deductions." : "Số tiền thực nhận vào tài khoản hàng tháng sau khi đã trừ các khoản thuế và bảo hiểm."}
                  />

                  <CurrencyInput
                    label={isEn ? "Secondary / Investment / Business Income" : "Thu nhập phụ / Đầu tư / Kinh doanh"}
                    value={formData.secondaryIncome}
                    onChange={(v) => updateNumberField("secondaryIncome", v)}
                    error={fieldErrors.secondaryIncome}
                    suffix={isEn ? "VND/mo" : "VND/tháng"}
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
                      <p>{isEn ? "After declaring expenses, you can choose a contribution that fits the amount left over." : "Sau khi khai chi tiêu, bạn có thể chọn khoản góp phù hợp với phần còn dư."}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: EXPENSE */}
            {currentStep === "expense" && (
              <div>
                <div className="step-heading">
                  <Badge tone="soft">{stepLabel}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="chart" /></span>
                    <h1>{isEn ? "How much do you spend each month?" : "Mỗi tháng bạn chi bao nhiêu?"}</h1>
                  </div>
                  <p>{isEn ? "Current spending is the baseline for projecting living expenses needed in retirement to maintain your lifestyle." : "Chi tiêu hiện tại là thước đo cơ bản để dự toán mức chi phí bạn cần có khi về già để giữ nguyên phong cách sống."}</p>
                </div>

                <div className="form-grid">
                  <CurrencyInput
                    label={isEn ? "Monthly Essential Expenses" : "Chi tiêu thiết yếu hàng tháng"}
                    value={formData.essentialExpense}
                    onChange={(v) => updateNumberField("essentialExpense", v)}
                    error={fieldErrors.essentialExpense}
                    suffix={isEn ? "VND/mo" : "VND/tháng"}
                    helper={isEn ? "Includes: food, utilities, rent/HOA, medical care, children's tuition." : "Bao gồm: ăn uống, điện nước, tiền thuê nhà/quản lý, y tế, học phí của con."}
                  />

                  <CurrencyInput
                    label={isEn ? "Estimated Monthly Discretionary Expenses" : "Dự trù chi tiêu hàng tháng"}
                    value={formData.lifestyleExpense}
                    onChange={(v) => updateNumberField("lifestyleExpense", v)}
                    error={fieldErrors.lifestyleExpense}
                    suffix={isEn ? "VND/mo" : "VND/tháng"}
                    helper={isEn ? "Includes: shopping, travel, socializing, hobbies. You can always adjust this later if your spending habits change." : "Bao gồm: mua sắm, du lịch, giao lưu bạn bè, sở thích cá nhân. Bạn vẫn có thể chỉnh sửa lại sau này khi có sự thay đổi trong chi tiêu."}
                  />

                  <Card className="inline-total-card">
                    <span>{isEn ? "Total Monthly Living Expenses:" : "Tổng chi tiêu sinh hoạt hàng tháng:"}</span>
                    <strong>{formatVND(totalMonthlyExpense)}</strong>
                  </Card>

                  <div className="context-note">
                    <span><Icon name="info" /></span>
                    <div>
                      <strong>{isEn ? "Your retirement spending goal" : "Mức chi hưu trí bạn đã chọn"}</strong>
                      <p>{isEn ? "Your desired retirement spending is separate from current expenses. Review both against the lifestyle you want." : "Mức chi mong muốn khi nghỉ hưu tách biệt với chi tiêu hiện tại. Hãy đối chiếu cả hai với cuộc sống bạn mong muốn."}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: ASSETS */}
            {currentStep === "assets" && (
              <div>
                <div className="step-heading">
                  <Badge tone="soft">{stepLabel}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="home" /></span>
                    <h1>{isEn ? "What assets do you have for the future?" : "Bạn đang có tài sản nào cho tương lai?"}</h1>
                  </div>
                  <p>{isEn ? "Current assets serve as a key launchpad for your retirement fund; asset values may fluctuate over time." : "Tài sản hiện có là bệ phóng quan trọng cho quỹ hưu trí; giá trị tài sản có thể biến động theo thời gian."}</p>
                </div>

                <div className="form-grid">
                  <CurrencyInput
                    label={isEn ? "Bank Deposits & Cash" : "Tiền gửi ngân hàng & Tiền mặt"}
                    value={formData.cashSavings}
                    onChange={(v) => updateNumberField("cashSavings", v)}
                    error={fieldErrors.cashSavings}
                    suffix="VND"
                    helper={isEn ? "Checking accounts, term savings deposits at banks." : "Tài khoản thanh toán, sổ tiết kiệm có kỳ hạn tại các ngân hàng."}
                  />

                  <CurrencyInput
                    label={isEn ? "Other real estate (exclude your home)" : "Bất động sản khác (không tính nhà đang ở)"}
                    value={formData.realEstateValue}
                    onChange={(v) => updateNumberField("realEstateValue", v)}
                    error={fieldErrors.realEstateValue}
                    suffix="VND"
                    helper={isEn ? "Exclude the home you live in. Other property is recorded separately; it is not cash available for retirement." : "Không tính nhà đang ở. Bất động sản khác được ghi riêng, chưa phải tiền có thể dùng ngay cho hưu trí."}
                  />

                  {/* Khu vực tạo thêm tài sản người dùng tự tạo bấm dấu cộng (+) */}
                  <div className="custom-assets-box">
                    <div className="custom-assets-top">
                      <div>
                        <h3 className="custom-assets-title">{isEn ? "Other Accumulated Assets" : "Tài sản tích lũy khác"}</h3>
                        <p className="custom-assets-desc">
                          {isEn
                            ? "Add gold, stocks, funds, bonds, vehicles, foreign currency, or other assets with master data units."
                            : "Thêm vàng, cổ phiếu, chứng chỉ quỹ, trái phiếu, xe cộ, ngoại tệ... theo các đơn vị định lượng."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setAssetModalError("");
                          setAssetModalOpen(true);
                        }}
                      >
                        <Icon name="plus" size="small" /> {isEn ? "Add asset" : "Thêm tài sản"}
                      </Button>
                    </div>

                    {customAssets.length > 0 && (
                      <div className="custom-assets-cards">
                        {customAssets.map((asset) => (
                          <div key={asset.id} className="custom-asset-card">
                            <div className="custom-asset-main">
                              <span className="asset-tag">{asset.categoryName}</span>
                              <span className="asset-name">{asset.name}</span>
                              {asset.quantity !== undefined && (
                                <span className="asset-unit-qty">
                                  {isEn ? "Quantity:" : "Số lượng:"} {new Intl.NumberFormat("vi-VN").format(asset.quantity)} {asset.unit}
                                </span>
                              )}
                            </div>
                            <div className="custom-asset-right">
                              <span className="asset-val">{formatVND(asset.valueVnd)}</span>
                              <button
                                type="button"
                                className="asset-delete-btn"
                                title={isEn ? "Delete asset" : "Xóa tài sản"}
                                onClick={() => handleRemoveAsset(asset.id)}
                              >
                                <Icon name="trash" size="small" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Card className="inline-total-card">
                    <span>{isEn ? "Initial Estimated Total Assets:" : "Tổng tài sản ước tính ban đầu:"}</span>
                    <strong>{formatVND(formData.cashSavings + formData.realEstateValue + formData.liquidAssets)}</strong>
                  </Card>
                </div>
              </div>
            )}

            {/* STEP 5: DEBT */}
            {currentStep === "contribution" && <section className="onboarding-question">
              <h1>{isEn ? "How much would you like to set aside each month?" : "Bạn muốn dành bao nhiêu mỗi tháng cho ngày mai?"}</h1>
              <p>{isEn ? "Surplus = income − living expenses" : "Phần còn dư = thu − chi sinh hoạt"}: <strong>{new Intl.NumberFormat(isEn ? "en-US" : "vi-VN").format(totalMonthlyIncome - totalMonthlyExpense)} {isEn ? "VND/month" : "đồng/tháng"}</strong></p>
              <p>{isEn ? "After declared debt payments" : "Sau khoản trả nợ đã khai"}: {new Intl.NumberFormat(isEn ? "en-US" : "vi-VN").format(totalMonthlySurplus)} {isEn ? "VND/month" : "đồng/tháng"}</p>
              <CurrencyInput label={isEn ? "Chosen monthly contribution" : "Khoản góp mỗi tháng bạn chọn"} value={contribution} onChange={value => updateDraft({ monthlyContribution: String(value), contributionSchedule: [] })} error={fieldErrors.contribution} />
              {contribution > Math.max(0, totalMonthlySurplus) && <p role="alert">{isEn ? "Your contribution exceeds the amount left over. Consider a lower amount or review income, expenses and debt." : "Khoản góp vượt phần còn dư. Cân nhắc giảm khoản góp hoặc kiểm tra lại thu nhập, chi tiêu và nợ."}</p>}
              <p>{isEn ? "Zero means you have not chosen to contribute yet. Debt declared next may reduce your available budget." : "Mức 0 nghĩa là bạn chưa chọn góp tiền. Khoản nợ ở bước sau có thể làm giảm ngân sách còn lại."}</p>
            </section>}
            {currentStep === "personal" && !showPower && !legacyOnboardingDraft && <section className="onboarding-question"><Input label={isEn ? "Birth month for the detailed profile (unknown allowed)" : "Tháng sinh cho hồ sơ chi tiết (có thể chưa biết)"} type="month" value={formData.birthMonth} onChange={birthMonth => setFormData(prev => ({ ...prev, birthMonth }))} /><p>{isEn ? "These answers use the detailed profile. Age alone does not identify your birth month; leave blank if unknown. Pension history totals require review in the detailed pension declaration." : "Các câu trả lời này dùng hồ sơ chi tiết. Tuổi không đủ để xác định tháng sinh; để trống nếu chưa biết. Tổng năm và lương đóng BHXH cần đối chiếu lại trong khai báo lương hưu chi tiết."}</p></section>}
            {currentStep === "contribution" && legacyOnboardingDraft && <p className="onboarding-question">{isEn ? "This saved survey uses the earlier format. Complete it first, then open Constraints and goals in your detailed profile to answer the four protection questions. Your existing draft is preserved." : "Bản khảo sát đã lưu dùng định dạng cũ. Hãy hoàn tất trước, rồi mở Ràng buộc và mục tiêu trong hồ sơ chi tiết để trả lời bốn câu hỏi bảo vệ vốn. Bản nháp hiện có được giữ nguyên."}</p>}
            {currentStep === "contribution" && !legacyOnboardingDraft && <PlanningQuestions data={constraints ?? {}} onChange={setConstraints} valuationMonth={planningMonth} />}
            {currentStep === "debt" && (
              <div>
                <div className="step-heading">
                  <Badge tone="soft">{stepLabel}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="alert" /></span>
                    <h1>{isEn ? "What debts do you need to repay?" : "Bạn còn những khoản nợ nào cần trả?"}</h1>
                  </div>
                  <p>{isEn ? "Tracking debts ensures accurate calculation of your actual surplus cashflow available for accumulation." : "Nắm rõ các khoản nợ giúp tính toán chính xác số tiền còn lại sau chi tiêu và trả nợ."}</p>
                </div>

                <div className="form-grid">
                  <div className="debt-status-selector" role="radiogroup" aria-label={isEn ? "Debt status selection" : "Lựa chọn tình trạng nợ"}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.hasDebt}
                      className={`debt-status-card ${formData.hasDebt ? "is-selected" : ""}`}
                      onClick={() => {
                        try {

                        } catch {}
                        setFormData((prev) => ({ ...prev, hasDebt: true }));
                      }}
                    >
                      <div className="debt-status-radio">
                        <span className="debt-radio-circle">
                          {formData.hasDebt && <span className="debt-radio-dot" />}
                        </span>
                      </div>
                      <div className="debt-status-content">
                        <div className="debt-status-title-row">
                          <Icon name="wallet" size="small" />
                          <strong>{isEn ? "Currently have active debts" : "Đang có các khoản nợ cần trả"}</strong>
                        </div>
                        <p>{isEn ? "Mortgage, car loan, consumer credit, cards, installments" : "Vay mua nhà, mua xe, tiêu dùng, thẻ tín dụng, trả góp..."}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={!formData.hasDebt}
                      className={`debt-status-card ${!formData.hasDebt ? "is-selected" : ""}`}
                      onClick={() => {
                        try {

                        } catch {}
                        setFormData((prev) => ({
                          ...prev,
                          hasDebt: false,
                          mortgageDebt: 0,
                          consumerDebt: 0,
                          monthlyDebtService: 0,
                        }));
                      }}
                    >
                      <div className="debt-status-radio">
                        <span className="debt-radio-circle">
                          {!formData.hasDebt && <span className="debt-radio-dot" />}
                        </span>
                      </div>
                      <div className="debt-status-content">
                        <div className="debt-status-title-row">
                          <Icon name="shield" size="small" />
                          <strong>{isEn ? "No debts (Debt-free)" : "Không có nợ"}</strong>
                        </div>
                        <p>{isEn ? "No mortgages, consumer loans or installment obligations" : "Tôi hiện tại không có bất kỳ khoản vay mượn hay trả góp nào"}</p>
                      </div>
                    </button>
                  </div>

                  {formData.hasDebt ? (
                    <div className="debt-fields">
                      <CurrencyInput
                        label={isEn ? "Mortgage / Real Estate Debt" : "Dư nợ vay mua nhà / Bất động sản"}
                        value={formData.mortgageDebt}
                        onChange={(v) => updateNumberField("mortgageDebt", v)}
                        error={fieldErrors.mortgageDebt}
                        suffix="VND"
                      />

                      <CurrencyInput
                        label={isEn ? "Consumer Loan / Credit Card Debt" : "Dư nợ vay tiêu dùng / Thẻ tín dụng"}
                        value={formData.consumerDebt}
                        onChange={(v) => updateNumberField("consumerDebt", v)}
                        error={fieldErrors.consumerDebt}
                        suffix="VND"
                      />

                      <CurrencyInput
                        label={isEn ? "Monthly Principal & Interest Payment" : "Số tiền trả nợ cả gốc lẫn lãi hàng tháng"}
                        value={formData.monthlyDebtService}
                        onChange={(v) => updateNumberField("monthlyDebtService", v)}
                        error={fieldErrors.monthlyDebtService}
                        suffix={isEn ? "VND/mo" : "VND/tháng"}
                        helper={isEn ? "Fixed recurring deduction from income paid to financial institutions." : "Khoản trích cố định từ thu nhập để trả cho các tổ chức tín dụng."}
                      />
                    </div>
                  ) : (
                    <div className="debt-no-debt-banner">
                      <span className="debt-no-debt-icon"><Icon name="circle-check" /></span>
                      <div className="debt-no-debt-body">
                        <strong>{isEn ? "Confirmed: No Active Debts" : "Đã xác nhận: Không có khoản nợ nào"}</strong>
                        <p>{isEn ? "Great! With no debt burdens, you can flexibly allocate your monthly surplus towards your retirement fund." : "Tuyệt vời! Không có gánh nặng nợ nần giúp bạn có thể chủ động chọn dành phần tiền dư mỗi tháng cho quỹ hưu trí."}</p>
                      </div>
                    </div>
                  )}

                  {formData.hasDebt && (
                    <Card className="inline-total-card">
                      <span>{isEn ? "Current Total Debt Balance:" : "Tổng dư nợ hiện tại:"}</span>
                      <strong style={{ color: formData.mortgageDebt + formData.consumerDebt > 0 ? "var(--color-danger)" : "inherit" }}>
                        {formatVND(formData.mortgageDebt + formData.consumerDebt)}
                      </strong>
                    </Card>
                  )}

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
                  <Badge tone="soft">{stepLabel}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="sparkles" /></span>
                    <h1>{isEn ? "Do you expect a pension after retirement?" : "Sau nghỉ việc, bạn dự kiến có lương hưu không?"}</h1>
                  </div>
                  <p>{isEn ? "State pension from BHXH is a core pillar supporting your retirement cash flow." : "Lương hưu từ BHXH là trụ cột chính nuôi dưỡng quỹ hưu trí."}</p>
                </div>

                <Button variant="secondary" onClick={handleNext} disabled={working}>{isEn ? "Not sure yet — add later" : "Chưa biết, bổ sung sau"}</Button>
                <p>{isEn ? "This step records contribution history only. No pension estimate is included until you declare it in the detailed profile." : "Bước này chỉ ghi lịch sử đóng. Chưa đưa lương hưu vào kế hoạch đến khi bạn khai báo trong hồ sơ chi tiết."}</p>
                <details><summary>{isEn ? "Personal details for social insurance" : "Thông tin cá nhân dùng cho BHXH"}</summary><div className="form-grid">
                  <Input
                    label={isEn ? "Full Name" : "Họ và tên"}
                    value={formData.fullName}
                    onChange={(v) => {
                      updateField("fullName", v);

                    }}
                    placeholder={isEn ? "e.g. Nguyen Van An" : "Ví dụ: Nguyễn Văn An"}
                    autoComplete="name"
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
                    min={0}
                    max={30}
                    value={String(formData.dependents)}
                    onChange={(v) => updateNumberField("dependents", v)}
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
                    helper={isEn ? "Location helps you consider your actual spending needs." : "Nơi sống giúp bạn cân nhắc nhu cầu chi tiêu thực tế."}
                  />

                </div></details>
                <div className="form-grid">
                  <Input
                    label={isEn ? "Years of Mandatory / Voluntary Social Insurance Contributions" : "Số năm đã tham gia BHXH bắt buộc / tự nguyện"}
                    type="number"
                    min={0}
                    value={String(formData.socialInsuranceYears)}
                    onChange={(v) => updateNumberField("socialInsuranceYears", v)}
                    error={fieldErrors.socialInsuranceYears}
                    suffix={isEn ? "years" : "năm"}
                    helper={isEn ? "Use your social insurance record; eligibility is checked in the detailed profile." : "Đối chiếu quá trình đóng BHXH; điều kiện hưởng được kiểm tra trong hồ sơ chi tiết."}
                  />

                  <CurrencyInput
                    label={isEn ? "Average Base Salary for Social Insurance Contributions" : "Mức lương làm căn cứ đóng BHXH bình quân"}
                    value={formData.socialInsuranceSalary}
                    onChange={(v) => updateNumberField("socialInsuranceSalary", v)}
                    error={fieldErrors.socialInsuranceSalary}
                    suffix={isEn ? "VND/mo" : "VND/tháng"}
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
                  <Badge tone="success">{isEn ? "STEP 7/7 · SUMMARY" : "BƯỚC 7/7 · TỔNG KẾT"}</Badge>
                  <div className="step-heading-title-row">
                    <span className="step-heading-icon"><Icon name="circle-check" /></span>
                    <h1>{isEn ? "Your Comprehensive Financial Overview" : "Bức tranh tài chính tổng quan của bạn"}</h1>
                  </div>
                  <p>{isEn ? "Review all key financial metrics before completing your profile and receiving your customized retirement roadmap." : "Hãy xem lại toàn bộ các chỉ số tài chính quan trọng trước khi hoàn tất hồ sơ và tiến hành lập kế hoạch nghỉ hưu chi tiết."}</p>
                </div>

                {contribution > Math.max(0, totalMonthlySurplus) && <p role="alert">{isEn ? "Your chosen contribution exceeds the amount left after expenses and declared debt payments. Review the contribution step." : "Khoản góp bạn chọn vượt phần dư sau chi tiêu và trả nợ đã khai. Hãy kiểm tra lại bước Khoản góp."}</p>}
                {skippedSteps.length > 0 && (
                  <div className="onboarding-skipped-card" role="status">
                    <div>
                      <strong>{isEn ? `${skippedSteps.length} step(s) left empty` : `Còn ${skippedSteps.length} bước chưa điền`}</strong>
                      <p>{isEn ? "The plan will treat these as zero. Fill them in for a more accurate result." : "Kế hoạch sẽ tính các mục này bằng 0. Điền thêm để kết quả sát thực tế hơn."}</p>
                    </div>
                    <div className="onboarding-skipped-list">
                      {skippedSteps.map((s) => (
                        <button key={s.id} type="button" onClick={() => { setShowPower(false); setCurrentStep(s.id); }}>
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
                      <small>{isEn ? "Monthly Surplus for Accumulation" : "Tiền còn lại sau chi tiêu và trả nợ"}</small>
                      <strong style={{ color: totalMonthlySurplus < 0 ? "var(--color-danger)" : undefined }}>
                        {formatVND(totalMonthlySurplus)}
                      </strong>
                    </div>
                    {totalMonthlySurplus < 0 ? (
                      <Badge tone="danger">{isEn ? "Cashflow Deficit" : "Thiếu hụt dòng tiền"}</Badge>
                    ) : (
                      <Badge tone="honey">{isEn ? "Accumulation Surplus" : "Tiền còn lại hàng tháng"}</Badge>
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
                <Button variant="secondary" onClick={handlePrev} aria-label={isEn ? "Back" : "Quay lại"}>
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
                  try { if (await saveOnboardingDraft({ step: currentStep, ...formData, desiredRetirementMonth: retirementMonth }, constraints)) navigate("/user/dashboard"); }
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

          {(apiSaveError || saveError) && (
            <div className="save-error-banner" role="alert">
              <Icon name="alert" />
              <span>{apiSaveError || saveError}</span>
              <Button variant="secondary" onClick={() => window.location.reload()}>{isEn ? "Reload saved draft to compare" : "Tải lại nháp đã lưu để đối chiếu"}</Button>
            </div>
          )}
        </main>
      </div>

      {/* Pop up thêm tài sản tích lũy với master data đơn vị */}
      <Modal
        open={assetModalOpen}
        title={isEn ? "Add Accumulated Asset" : "Thêm tài sản tích lũy"}
        onClose={() => {
          setAssetModalOpen(false);
          setAssetModalError("");
        }}
      >
        <div className="master-asset-modal-form">
          <Select
            label={isEn ? "Asset Category" : "Loại danh mục tài sản"}
            value={selectedCategory}
            onChange={(v) => handleCategoryChange(v)}
            options={ASSET_MASTER_DATA.map((cat) => ({
              value: cat.id,
              label: cat.name,
            }))}
          />

          <Input
            label={isEn ? "Asset Name / Code" : "Tên tài sản / Mã tài sản"}
            placeholder={
              ASSET_MASTER_DATA.find((c) => c.id === selectedCategory)?.placeholderName ||
              (isEn ? "Enter asset name" : "Nhập tên tài sản")
            }
            value={newAssetName}
            onChange={(v) => {
              setNewAssetName(v);
              if (assetModalError) setAssetModalError("");
            }}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Select
              label={isEn ? "Master Data Unit" : "Đơn vị tính (Master Data)"}
              value={selectedUnit}
              onChange={(v) => setSelectedUnit(v)}
              options={(
                ASSET_MASTER_DATA.find((c) => c.id === selectedCategory)?.units || ["Đơn vị"]
              ).map((u) => ({ value: u, label: u }))}
            />

            <Input
              label={isEn ? "Quantity (Optional)" : "Số lượng (Tùy chọn)"}
              type="number"
              min={0}
              placeholder="0"
              value={newAssetQuantity ? String(newAssetQuantity) : ""}
              onChange={(v) => setNewAssetQuantity(Math.max(0, Number(v) || 0))}
            />
          </div>

          <CurrencyInput
            label={isEn ? "Estimated Market Value (VND)" : "Giá trị thị trường ước tính (VND)"}
            value={newAssetValue}
            onChange={(v) => {
              setNewAssetValue(v);
              if (assetModalError) setAssetModalError("");
            }}
            suffix="VND"
            helper={isEn ? "Total converted value in VND" : "Tổng giá trị quy đổi sang VND để tính vào tổng tài sản tích lũy"}
          />

          {assetModalError && (
            <div style={{ color: "var(--color-danger, #b42318)", fontSize: "13px", fontWeight: 500 }}>
              {assetModalError}
            </div>
          )}

          <div className="master-asset-modal-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setAssetModalOpen(false);
                setAssetModalError("");
              }}
            >
              {isEn ? "Cancel" : "Hủy bỏ"}
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={handleAddCustomAsset}
            >
              <Icon name="plus" size="small" /> {isEn ? "Add Asset" : "Thêm vào danh mục"}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
