import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { calculateRetirement, inputFromProfile } from "../domain/retirementCalculator";

// Trạng thái lưu dữ liệu cho UI: idle = chưa có thay đổi; dirty = có thay đổi chưa lưu;
// saving = đang ghi; saved = vừa ghi thành công; error = lỗi lưu.
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface PersonalProfile {
  name: string;
  email: string;
  phone: string;
  city: string;
  age: number;
  gender: string;
  maritalStatus: string;
  dependents: number;
}

export interface IncomeProfile {
  primaryIncome: number;
  secondaryIncome: number;
}

export interface ExpenseProfile {
  essentialExpense: number;
  lifestyleExpense: number;
}

export interface AssetProfile {
  cashSavings: number;
  realEstateValue: number;
  liquidAssets: number;
  stockFundValue: number;
}

export interface DebtProfile {
  hasDebt: boolean;
  mortgageDebt: number;
  consumerDebt: number;
  monthlyDebtService: number;
}

export interface SocialSecurityProfile {
  socialInsuranceYears: number;
  socialInsuranceSalary: number;
}

export interface RetirementGoalProfile {
  targetRetireAge: number;
  lifeExpectancy: number;
  lifestyle: "standard" | "comfortable" | "affluent";
  monthlyExpenseInRetirement: number;
  inflationRate: number;
  investmentReturn: number;
}

export interface OfficialPlanProfile {
  targetFund: number;
  projectedFund: number;
  monthlySavings: number;
  readinessScore: number;
  lastUpdated: string;
}

export interface FinancialProfile {
  personal: PersonalProfile;
  income: IncomeProfile;
  expenses: ExpenseProfile;
  assets: AssetProfile;
  debt: DebtProfile;
  socialSecurity: SocialSecurityProfile;
  goal: RetirementGoalProfile;
  plan: OfficialPlanProfile;
}

export interface OnboardingDraftData {
  step: string;
  age: number;
  gender: string;
  maritalStatus: string;
  dependents: number;
  city: string;
  primaryIncome: number;
  secondaryIncome: number;
  essentialExpense: number;
  lifestyleExpense: number;
  cashSavings: number;
  realEstateValue: number;
  liquidAssets: number;
  hasDebt: boolean;
  mortgageDebt: number;
  consumerDebt: number;
  monthlyDebtService: number;
  stockFundValue: number;
  socialInsuranceYears: number;
  socialInsuranceSalary: number;
  updatedAt: string;
}

// Dữ liệu mẫu khởi tạo tách biệt (Default Sample Data)
export const DEFAULT_SAMPLE_PROFILE: FinancialProfile = {
  personal: {
    name: "Nguyễn Minh An",
    email: "minhan@example.com",
    phone: "0912 345 678",
    city: "TP. Hồ Chí Minh",
    age: 32,
    gender: "Nam",
    maritalStatus: "Đã kết hôn",
    dependents: 1,
  },
  income: {
    primaryIncome: 35000000,
    secondaryIncome: 8000000,
  },
  expenses: {
    essentialExpense: 18000000,
    lifestyleExpense: 7000000,
  },
  assets: {
    cashSavings: 450000000,
    realEstateValue: 2400000000,
    liquidAssets: 220000000,
    stockFundValue: 350000000,
  },
  debt: {
    hasDebt: true,
    mortgageDebt: 850000000,
    consumerDebt: 0,
    monthlyDebtService: 9500000,
  },
  socialSecurity: {
    socialInsuranceYears: 9,
    socialInsuranceSalary: 18000000,
  },
  goal: {
    targetRetireAge: 60,
    lifeExpectancy: 82,
    lifestyle: "comfortable",
    monthlyExpenseInRetirement: 22000000,
    inflationRate: 4.0,
    investmentReturn: 7.8,
  },
  plan: {
    targetFund: 8500000000,
    projectedFund: 6120000000,
    monthlySavings: 14200000,
    readinessScore: 72,
    lastUpdated: "Tháng 09/2026",
  },
};

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraftData = {
  step: "welcome",
  age: 32,
  gender: "Nam",
  maritalStatus: "Đã kết hôn",
  dependents: 1,
  city: "TP. Hồ Chí Minh",
  primaryIncome: 35000000,
  secondaryIncome: 8000000,
  essentialExpense: 18000000,
  lifestyleExpense: 7000000,
  cashSavings: 450000000,
  realEstateValue: 2400000000,
  liquidAssets: 220000000,
  hasDebt: true,
  mortgageDebt: 850000000,
  consumerDebt: 0,
  monthlyDebtService: 9500000,
  stockFundValue: 350000000,
  socialInsuranceYears: 9,
  socialInsuranceSalary: 18000000,
  updatedAt: new Date().toISOString(),
};

// Storage Keys
export const STORAGE_KEY_PROFILE = "anhuu_demo_financial_profile";
export const STORAGE_KEY_ONBOARDING_DRAFT = "anhuu_demo_onboarding_draft";

export const DEMO_STORAGE_DISCLAIMER =
  "Dữ liệu được lưu trữ trong bộ nhớ trình duyệt cục bộ (Local Demo Storage) phục vụ mục đích thử nghiệm giao diện. Đây chưa phải là hệ thống lưu trữ đám mây mã hóa phân tán trong môi trường sản phẩm thực tế.";

function withCalculatedPlan(profile: FinancialProfile, lastUpdated = profile.plan.lastUpdated): FinancialProfile {
  const result = calculateRetirement(inputFromProfile(profile));
  return {
    ...profile,
    plan: {
      ...profile.plan,
      targetFund: result.targetFund,
      projectedFund: result.projectedFund,
      readinessScore: result.readinessScore,
      lastUpdated,
    },
  };
}

interface FinancialProfileContextType {
  profile: FinancialProfile;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: string | null;
  onboardingDraft: OnboardingDraftData;
  draftSaveStatus: SaveStatus;
  lastDraftSavedAt: string | null;
  hasUnsavedChanges: boolean;
  // Snapshot toàn bộ hồ sơ để xuất/nhập hoặc kiểm thử
  exportSnapshot: () => FinancialProfile;
  importSnapshot: (snapshot: FinancialProfile) => Promise<boolean>;

  // Hành động lưu và đồng bộ
  updateProfile: (updates: Partial<FinancialProfile>) => Promise<boolean>;
  updateProfileLocal: (updates: Partial<FinancialProfile>) => void;
  updatePersonalInfo: (personal: Partial<PersonalProfile>) => Promise<boolean>;
  updateGoalInfo: (goal: Partial<RetirementGoalProfile>) => Promise<boolean>;
  saveOnboardingDraft: (draft: Partial<OnboardingDraftData>) => Promise<boolean>;
  completeOnboarding: (data: OnboardingDraftData) => Promise<boolean>;
  applySimulationScenario: (scenario: {
    retireAge: number;
    monthlySave: number;
    expense: number;
    returnRate: number;
    targetFund: number;
    projectedFund: number;
    score: number;
  }) => Promise<boolean>;
  resetToSampleData: () => void;
  clearUnsavedChanges: () => void;
}

const FinancialProfileContext = createContext<FinancialProfileContextType | null>(null);

function profileWithCurrentAdminDefaults(): FinancialProfile {
  try {
    const assumptions = JSON.parse(localStorage.getItem("anhuu_demo_financial_assumptions") || "[]") as Array<{ code: string; currentValue: number }>;
    const value = (code: string, fallback: number) => {
      const found = assumptions.find((item) => item.code === code)?.currentValue;
      return Number.isFinite(found) ? Number(found) : fallback;
    };
    const lifeCode = DEFAULT_SAMPLE_PROFILE.personal.gender === "Nữ" ? "LIFE_EXPECTANCY_FEMALE" : "LIFE_EXPECTANCY_MALE";
    return {
      ...DEFAULT_SAMPLE_PROFILE,
      goal: {
        ...DEFAULT_SAMPLE_PROFILE.goal,
        inflationRate: value("MACRO_INFLATION_RATE", DEFAULT_SAMPLE_PROFILE.goal.inflationRate),
        investmentReturn: value("BALANCED_PORTFOLIO_RETURN", DEFAULT_SAMPLE_PROFILE.goal.investmentReturn),
        lifeExpectancy: value(lifeCode, DEFAULT_SAMPLE_PROFILE.goal.lifeExpectancy),
      },
    };
  } catch {
    return DEFAULT_SAMPLE_PROFILE;
  }
}

export function FinancialProfileProvider({ children }: { children: ReactNode }) {
  // 1. Khởi tạo Profile từ localStorage hoặc dữ liệu mẫu
  const [profile, setProfile] = useState<FinancialProfile>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (stored) {
        const parsed = JSON.parse(stored);
        return withCalculatedPlan({
          ...DEFAULT_SAMPLE_PROFILE,
          ...parsed,
          personal: { ...DEFAULT_SAMPLE_PROFILE.personal, ...(parsed.personal || {}) },
          income: { ...DEFAULT_SAMPLE_PROFILE.income, ...(parsed.income || {}) },
          expenses: { ...DEFAULT_SAMPLE_PROFILE.expenses, ...(parsed.expenses || {}) },
          assets: { ...DEFAULT_SAMPLE_PROFILE.assets, ...(parsed.assets || {}) },
          debt: { ...DEFAULT_SAMPLE_PROFILE.debt, ...(parsed.debt || {}) },
          socialSecurity: { ...DEFAULT_SAMPLE_PROFILE.socialSecurity, ...(parsed.socialSecurity || {}) },
          goal: { ...DEFAULT_SAMPLE_PROFILE.goal, ...(parsed.goal || {}) },
          plan: { ...DEFAULT_SAMPLE_PROFILE.plan, ...(parsed.plan || {}) },
        });
      }
    } catch (e) {
      console.warn("Không thể đọc profile từ localStorage:", e);
    }
    return withCalculatedPlan(profileWithCurrentAdminDefaults());
  });

  // 2. Khởi tạo Onboarding Draft từ localStorage
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraftData>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ONBOARDING_DRAFT);
      if (stored) {
        return { ...DEFAULT_ONBOARDING_DRAFT, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("Không thể đọc onboarding draft từ localStorage:", e);
    }
    return DEFAULT_ONBOARDING_DRAFT;
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [draftSaveStatus, setDraftSaveStatus] = useState<SaveStatus>("idle");
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Cờ theo dõi thay đổi chưa lưu cho mỗi thực thể (dùng ref để tránh re-render).
  const profileDirtyRef = useRef(false);

  // Lắng nghe storage events từ tab khác để đồng bộ (chỉ đọc).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_PROFILE && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as FinancialProfile;
          setProfile(parsed);
          profileDirtyRef.current = false;
          setHasUnsavedChanges(false);
          setSaveStatus("saved");
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Helper lưu Profile bền vững
  const persistProfile = useCallback(async (newProfile: FinancialProfile): Promise<boolean> => {
    setSaveStatus("saving");
    setSaveError(null);
    try {
      // Mô phỏng độ trễ lưu trữ nhẹ (150ms) để hiển thị phản hồi UI chân thực
      await new Promise((r) => setTimeout(r, 150));
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(newProfile));
      setProfile(newProfile);
      profileDirtyRef.current = false;
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      setLastSavedAt(new Date().toLocaleTimeString("vi-VN"));
      setTimeout(() => {
        setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
      }, 3000);
      return true;
    } catch (err) {
      setSaveStatus("error");
      setSaveError("Lỗi lưu trữ dữ liệu vào trình duyệt.");
      return false;
    }
  }, []);

  // Cập nhật cục bộ (chưa lưu) - đánh dấu dirty để UI hiển thị "có thay đổi chưa lưu"
  const updateProfileLocal = useCallback((updates: Partial<FinancialProfile>) => {
    setProfile((prev) => ({
      ...prev,
      ...updates,
    }));
    profileDirtyRef.current = true;
    setHasUnsavedChanges(true);
    setSaveStatus("dirty");
  }, []);

  const clearUnsavedChanges = useCallback(() => {
    profileDirtyRef.current = false;
    setHasUnsavedChanges(false);
    setSaveStatus("idle");
  }, []);

  const exportSnapshot = useCallback((): FinancialProfile => profile, [profile]);

  const importSnapshot = useCallback(async (snapshot: FinancialProfile): Promise<boolean> => {
    return persistProfile(withCalculatedPlan(snapshot, "Vừa nhập dữ liệu"));
  }, [persistProfile]);

  // Cập nhật Profile tổng quát
  const updateProfile = useCallback(
    async (updates: Partial<FinancialProfile>): Promise<boolean> => {
      const merged: FinancialProfile = {
        ...profile,
        ...updates,
      };
      return persistProfile(withCalculatedPlan(merged, "Vừa cập nhật hồ sơ"));
    },
    [profile, persistProfile]
  );

  // Cập nhật thông tin cá nhân (Account / Onboarding)
  const updatePersonalInfo = useCallback(
    async (personalUpdates: Partial<PersonalProfile>): Promise<boolean> => {
      const updatedPersonal: PersonalProfile = {
        ...profile.personal,
        ...personalUpdates,
      };
      const merged: FinancialProfile = {
        ...profile,
        personal: updatedPersonal,
      };
      return persistProfile(withCalculatedPlan(merged, "Vừa cập nhật thông tin cá nhân"));
    },
    [profile, persistProfile]
  );

  // Cập nhật thông tin mục tiêu (Goal)
  const updateGoalInfo = useCallback(
    async (goalUpdates: Partial<RetirementGoalProfile>): Promise<boolean> => {
      const updatedGoal: RetirementGoalProfile = {
        ...profile.goal,
        ...goalUpdates,
      };
      const merged: FinancialProfile = {
        ...profile,
        goal: updatedGoal,
      };
      return persistProfile(withCalculatedPlan(merged, "Vừa cập nhật mục tiêu"));
    },
    [profile, persistProfile]
  );

  // Lưu nháp Onboarding
  const saveOnboardingDraft = useCallback(
    async (draftUpdates: Partial<OnboardingDraftData>): Promise<boolean> => {
      setDraftSaveStatus("saving");
      try {
        await new Promise((r) => setTimeout(r, 120));
        const updatedDraft: OnboardingDraftData = {
          ...onboardingDraft,
          ...draftUpdates,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEY_ONBOARDING_DRAFT, JSON.stringify(updatedDraft));
        setOnboardingDraft(updatedDraft);
        setDraftSaveStatus("saved");
        setLastDraftSavedAt(new Date().toLocaleTimeString("vi-VN"));
        setTimeout(() => {
          setDraftSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 3000);
        return true;
      } catch (e) {
        setDraftSaveStatus("error");
        return false;
      }
    },
    [onboardingDraft]
  );

  // Hoàn tất Onboarding -> chuyển dữ liệu nháp vào Profile chính thức
  const completeOnboarding = useCallback(
    async (data: OnboardingDraftData): Promise<boolean> => {
      const newPersonal: PersonalProfile = {
        ...profile.personal,
        age: data.age,
        gender: data.gender,
        maritalStatus: data.maritalStatus,
        dependents: data.dependents,
        city: data.city,
      };

      const newIncome: IncomeProfile = {
        primaryIncome: data.primaryIncome,
        secondaryIncome: data.secondaryIncome,
      };

      const newExpenses: ExpenseProfile = {
        essentialExpense: data.essentialExpense,
        lifestyleExpense: data.lifestyleExpense,
      };

      const newAssets: AssetProfile = {
        cashSavings: data.cashSavings,
        realEstateValue: data.realEstateValue,
        liquidAssets: data.liquidAssets,
        stockFundValue: data.stockFundValue,
      };

      const newDebt: DebtProfile = {
        hasDebt: data.hasDebt,
        mortgageDebt: data.mortgageDebt,
        consumerDebt: data.consumerDebt,
        monthlyDebtService: data.monthlyDebtService,
      };

      const newSocialSecurity: SocialSecurityProfile = {
        socialInsuranceYears: data.socialInsuranceYears,
        socialInsuranceSalary: data.socialInsuranceSalary,
      };

      // Tính toán lại mức tích lũy khuyến nghị từ thu nhập - chi phí
      const monthlySurplus = Math.max(
        0,
        data.primaryIncome + data.secondaryIncome - data.essentialExpense - data.lifestyleExpense - (data.hasDebt ? data.monthlyDebtService : 0)
      );

      const newPlan: OfficialPlanProfile = {
        ...profile.plan,
        monthlySavings: monthlySurplus > 0 ? monthlySurplus : profile.plan.monthlySavings,
        lastUpdated: "Vừa cập nhật sau khảo sát",
      };

      const completedProfile: FinancialProfile = {
        ...profile,
        personal: newPersonal,
        income: newIncome,
        expenses: newExpenses,
        assets: newAssets,
        debt: newDebt,
        socialSecurity: newSocialSecurity,
        plan: newPlan,
      };

      // Xóa nháp cũ sau khi đã lưu chính thức
      try {
        localStorage.removeItem(STORAGE_KEY_ONBOARDING_DRAFT);
      } catch {}

      return persistProfile(withCalculatedPlan(completedProfile, "Vừa cập nhật sau khảo sát"));
    },
    [profile, persistProfile]
  );

  // Áp dụng kịch bản mô phỏng sang Kế hoạch chính thức
  const applySimulationScenario = useCallback(
    async (scenario: {
      retireAge: number;
      monthlySave: number;
      expense: number;
      returnRate: number;
      targetFund: number;
      projectedFund: number;
      score: number;
    }): Promise<boolean> => {
      const updatedGoal: RetirementGoalProfile = {
        ...profile.goal,
        targetRetireAge: scenario.retireAge,
        monthlyExpenseInRetirement: scenario.expense,
        investmentReturn: scenario.returnRate,
      };

      const updatedPlan: OfficialPlanProfile = {
        targetFund: scenario.targetFund,
        projectedFund: scenario.projectedFund,
        monthlySavings: scenario.monthlySave,
        readinessScore: scenario.score,
        lastUpdated: `Áp dụng từ kịch bản tuổi ${scenario.retireAge}`,
      };

      const merged: FinancialProfile = {
        ...profile,
        goal: updatedGoal,
        plan: updatedPlan,
      };

      return persistProfile(withCalculatedPlan(merged, `Áp dụng từ kịch bản tuổi ${scenario.retireAge}`));
    },
    [profile, persistProfile]
  );

  // Khôi phục dữ liệu mẫu ban đầu
  const resetToSampleData = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_PROFILE);
      localStorage.removeItem(STORAGE_KEY_ONBOARDING_DRAFT);
    } catch {}
    setProfile(withCalculatedPlan(profileWithCurrentAdminDefaults()));
    setOnboardingDraft(DEFAULT_ONBOARDING_DRAFT);
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  return (
    <FinancialProfileContext.Provider
      value={{
        profile,
        saveStatus,
        saveError,
        lastSavedAt,
        onboardingDraft,
        draftSaveStatus,
        lastDraftSavedAt,
        hasUnsavedChanges,
        exportSnapshot,
        importSnapshot,
        updateProfile,
        updateProfileLocal,
        updatePersonalInfo,
        updateGoalInfo,
        saveOnboardingDraft,
        completeOnboarding,
        applySimulationScenario,
        resetToSampleData,
        clearUnsavedChanges,
      }}
    >
      {children}
    </FinancialProfileContext.Provider>
  );
}

export function useFinancialProfile() {
  const context = useContext(FinancialProfileContext);
  if (!context) {
    throw new Error("useFinancialProfile must be used within a FinancialProfileProvider");
  }
  return context;
}
