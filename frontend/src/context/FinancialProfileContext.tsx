import { profileCompletionItems } from "../utils/profileCompletion";
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { ApiError, authenticatedRequest } from "../services/api";
import {
  planningConstraints,
  type PlanningConstraints,
  financialData,
  profileFromData,
  profileFromDraft,
  draftFromProfile,
  serverStep,
  clientStep,
  isProfileV2,
  profileFromV2,
  createDefaultProfileV2,
  type ProfileRecord,
  type DraftRecord,
  type ProfileV2,
  type FinancialData,
} from "../services/financialProfile";
import { useAuth } from "./AuthContext";
import { calculateRetirement, inputFromProfile } from "../domain/retirementCalculator";
import { useStableValue } from "../utils/useStableValue";

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
  birthMonth?: string;
  desiredRetirementMonth?: string;
  quickProfile?: ProfileV2;
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

// Empty input values; no account, income or asset examples are injected.
export const EMPTY_PROFILE: FinancialProfile = {
  personal: { name: "", email: "", phone: "", city: "", age: 0, gender: "", maritalStatus: "", dependents: 0 },
  income: { primaryIncome: 0, secondaryIncome: 0 }, expenses: { essentialExpense: 0, lifestyleExpense: 0 },
  assets: { cashSavings: 0, realEstateValue: 0, liquidAssets: 0, stockFundValue: 0 },
  debt: { hasDebt: false, mortgageDebt: 0, consumerDebt: 0, monthlyDebtService: 0 },
  socialSecurity: { socialInsuranceYears: 0, socialInsuranceSalary: 0 },
  goal: { targetRetireAge: 60, lifeExpectancy: 85, lifestyle: "standard", monthlyExpenseInRetirement: 0, inflationRate: 0, investmentReturn: 0 },
  plan: { targetFund: 0, projectedFund: 0, monthlySavings: 0, readinessScore: 0, lastUpdated: "" },
};
export const DEFAULT_ONBOARDING_DRAFT = draftFromProfile(EMPTY_PROFILE);
function withCalculatedPlan(profile: FinancialProfile): FinancialProfile {
  const result = calculateRetirement(inputFromProfile(profile));
  return { ...profile, plan: { ...profile.plan, targetFund: result.targetFund, projectedFund: result.projectedFund, readinessScore: result.readinessScore } };
}
function loadedProfile(base: FinancialProfile, record: ProfileRecord): { profile: FinancialProfile; v2: ProfileV2 | null } {
  if (record.schemaVersion === 2 || isProfileV2(record.data)) {
    const v2 = record.data as ProfileV2;
    const p = profileFromV2(base, v2);
    const summary = record.summary?.values || record.summary;
    const surplusStr = summary?.availableMonthlySurplus ?? summary?.monthlyNetCashflow;
    const monthlySavings = surplusStr !== undefined && surplusStr !== null
      ? parseFloat(surplusStr)
      : (p.income.primaryIncome + p.income.secondaryIncome - p.expenses.essentialExpense - p.expenses.lifestyleExpense - p.debt.monthlyDebtService);
    return {
      profile: withCalculatedPlan({
        ...p,
        goal: { ...p.goal, monthlyExpenseInRetirement: p.expenses.essentialExpense + p.expenses.lifestyleExpense },
        plan: {
          ...p.plan,
          monthlySavings,
          lastUpdated: record.asOfDate ? new Date(record.asOfDate).toLocaleString("vi-VN") : "Vừa cập nhật",
        },
      }),
      v2,
    };
  }

  const p = profileFromData(base, record.data as FinancialData);
  const monthlySavings = p.income.primaryIncome + p.income.secondaryIncome - p.expenses.essentialExpense - p.expenses.lifestyleExpense - p.debt.monthlyDebtService;
  return {
    profile: withCalculatedPlan({
      ...p,
      goal: { ...p.goal, monthlyExpenseInRetirement: p.expenses.essentialExpense + p.expenses.lifestyleExpense },
      plan: {
        ...p.plan,
        monthlySavings,
        lastUpdated: record.asOfDate ? new Date(record.asOfDate).toLocaleString("vi-VN") : "Vừa cập nhật",
      },
    }),
    v2: null,
  };
}

export function calculateProfileCompleteness(v2: ProfileV2 | null, p?: FinancialProfile): number {
  if (v2) {
    const checks = profileCompletionItems(v2).map(item => item.complete);
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }
  if (p) {
    const checks = [
      p.personal.age > 0,
      Boolean(p.personal.name),
      p.income.primaryIncome > 0 || p.income.secondaryIncome > 0,
      p.expenses.essentialExpense > 0 || p.expenses.lifestyleExpense > 0,
      p.goal.targetRetireAge > 0,
      p.goal.monthlyExpenseInRetirement > 0,
    ];
    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }
  return 0;
}

const failure = (e: unknown) => e instanceof Error ? e.message : "Không thể kết nối máy chủ. Vui lòng thử lại.";
const FinancialProfileContext = createContext<ReturnType<typeof useProfileState> | null>(null);

function useProfileState() {
  const { user } = useAuth();
  const base: FinancialProfile = { ...EMPTY_PROFILE, personal: { ...EMPTY_PROFILE.personal, name: user?.name || "", email: user?.email || "", phone: user?.phone || "", city: user?.city || "" } };
  const [profile, setProfile] = useState(base);
  const [v2Profile, setV2Profile] = useState<ProfileV2 | null>(null);
  const [profileSummary, setProfileSummary] = useState<Record<string, string | null> | null>(null);
  const [schemaVersion, setSchemaVersion] = useState<number>(1);
  const [onboardingConstraints, setOnboardingConstraints] = useState<PlanningConstraints | undefined>();
  const [onboardingDraft, setOnboardingDraft] = useState(() => draftFromProfile(base));
  const isUserRole = user?.role?.toLowerCase() === "user";
  const [loading, setLoading] = useState(isUserRole);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [legacyOnboardingDraft, setLegacyOnboardingDraft] = useState(false);
  const [reload, setReload] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [draftSaveStatus, setDraftSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const recordRef = useRef<ProfileRecord | null>(null);
  const draftRef = useRef<DraftRecord | null>(null);
  const busy = useRef(false);
  const pendingCompletion = useRef<{ key: string; body: { expectedDraftRevision: number; expectedProfileRevision: number }; profile: FinancialProfile; data: FinancialData | ProfileV2 } | null>(null);
  const reloadProfile = useCallback(() => setReload(v => v + 1), []);

  useEffect(() => {
    if (user?.role?.toLowerCase() !== "user") return;
    let active = true;
    setLoading(true); setLoadError(null);
    Promise.all([authenticatedRequest<ProfileRecord | null>("/me/financial-profile"), authenticatedRequest<DraftRecord | null>("/me/onboarding-draft")])
      .then(([record, draft]) => {
        if (!active) return;
        recordRef.current = record; draftRef.current = draft;
        const { profile: next, v2 } = record ? loadedProfile(base, record) : { profile: base, v2: null };
        setProfile(next);
        setV2Profile(v2);
        setProfileSummary(record?.summary?.values || record?.summary || null);
        setSchemaVersion(record?.schemaVersion ?? (v2 ? 2 : 1));
        setHasProfile(!!record);
        setLegacyOnboardingDraft(Boolean(draft && !isProfileV2(draft.data)));
        setOnboardingConstraints(draft && isProfileV2(draft.data) ? planningConstraints(draft.data) : undefined);
        setOnboardingDraft({ ...draftFromProfile(draft ? (isProfileV2(draft.data) ? profileFromV2(base, draft.data) : profileFromData(base, draft.data)) : next, draft ? clientStep(draft.step) : "welcome", draft?.updatedAt),
          ...(draft && isProfileV2(draft.data) ? {
            birthMonth: draft.data.personal?.birthMonth?.status === "KNOWN" ? draft.data.personal.birthMonth.value : "",
            desiredRetirementMonth: draft.data.personal?.desiredRetirementMonth?.status === "KNOWN" ? draft.data.personal.desiredRetirementMonth.value : "",
          } : {}) });
        setLastSavedAt(record?.asOfDate ? new Date(record.asOfDate).toLocaleString("vi-VN") : null);
        setLastDraftSavedAt(draft ? new Date(draft.updatedAt).toLocaleString("vi-VN") : null);
        setHasUnsavedChanges(false); setSaveStatus("idle"); setSaveError(null);
      }).catch(e => { if (active) setLoadError(failure(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, user?.role, reload]);

  useEffect(() => {
    setProfile(p => ({ ...p, personal: { ...p.personal, name: user?.name || "", email: user?.email || "", phone: user?.phone || "" } }));
  }, [user?.name, user?.email, user?.phone]);

  const unsupported = async () => {
    setSaveStatus("error");
    setSaveError("Lưu mục tiêu và kịch bản hưu trí chưa được hỗ trợ. Bạn vẫn có thể thay đổi tham số để xem mô phỏng.");
    return false;
  };

  const persistProfile = async (next: FinancialProfile): Promise<boolean> => {
    if (busy.current || loading || loadError) return false;
    if (!recordRef.current) { setSaveError("Hãy hoàn tất khai báo hồ sơ trước khi cập nhật."); setSaveStatus("error"); return false; }
    busy.current = true; setSaveStatus("saving"); setSaveError(null);
    try {
      const isV2Server = recordRef.current.schemaVersion === 2 || isProfileV2(recordRef.current.data);
      // A v1-shaped update must never overwrite a detailed v2 profile with converted defaults.
      if (isV2Server) throw new Error("Hồ sơ chi tiết chỉ cập nhật được trong biểu mẫu hồ sơ tài chính.");
      const changes = financialData(next, recordRef.current.data as FinancialData);
      const record = await authenticatedRequest<ProfileRecord>("/me/financial-profile", { expectedRevision: recordRef.current.revision, changes }, "PATCH");
      recordRef.current = record;
      const { profile: nextProfile, v2 } = loadedProfile(base, record);
      setProfile(nextProfile);
      setV2Profile(v2);
      setProfileSummary(record.summary?.values || record.summary || null);
      setSchemaVersion(record.schemaVersion ?? (v2 ? 2 : 1));
      setHasUnsavedChanges(false); setSaveStatus("saved"); setLastSavedAt(new Date().toLocaleString("vi-VN"));
      return true;
    } catch (e) { setSaveStatus("error"); setSaveError(failure(e)); return false; }
    finally { busy.current = false; }
  };

  const updateProfileV2 = async (changes: Partial<ProfileV2>): Promise<boolean> => {
    if (busy.current || loading || loadError) return false;
    if (!recordRef.current) { setSaveError("Hãy hoàn tất khai báo hồ sơ trước khi cập nhật."); setSaveStatus("error"); return false; }
    busy.current = true; setSaveStatus("saving"); setSaveError(null);
    try {
      const payload = {
        expectedRevision: recordRef.current.revision,
        changes: {
          schemaVersion: 2,
          ...changes,
        },
      };
      const record = await authenticatedRequest<ProfileRecord>("/me/financial-profile", payload, "PATCH");
      recordRef.current = record;
      const { profile: nextProfile, v2 } = loadedProfile(base, record);
      setProfile(nextProfile);
      setV2Profile(v2);
      setProfileSummary(record.summary?.values || record.summary || null);
      setSchemaVersion(record.schemaVersion ?? 2);
      setHasUnsavedChanges(false); setSaveStatus("saved"); setLastSavedAt(new Date().toLocaleString("vi-VN"));
      return true;
    } catch (e) { setSaveStatus("error"); setSaveError(failure(e)); return false; }
    finally { busy.current = false; }
  };

  const upgradeToV2 = async (): Promise<boolean> => {
    const defaultV2 = createDefaultProfileV2(profile);
    return updateProfileV2(defaultV2);
  };

  const updateProfile = async (updates: Partial<FinancialProfile>) => {
    // These fields have no server contract yet; never report a local-only save as persisted.
    if (updates.goal || updates.plan) return unsupported();
    return persistProfile({ ...profile, ...updates });
  };
  const writeDraft = async (draft: OnboardingDraftData, constraints?: PlanningConstraints) => {
    // This wizard only collects legacy totals; converting them would discard V2 entries and contracts.
    if (recordRef.current?.schemaVersion === 2 || isProfileV2(recordRef.current?.data)) {
      throw new Error("Bạn đã có hồ sơ tài chính chi tiết. Hãy mở Hồ sơ tài chính để cập nhật; bản nháp khảo sát vẫn được giữ lại.");
    }
    const source = profileFromDraft(base, draft);
    const data = financialData(source) as DraftRecord["data"];
    if (!draft.age) delete data.personal!.age;
    if (!draft.gender) delete data.personal!.gender;
    if (!draft.maritalStatus) delete data.personal!.maritalStatus;
    const previous = isProfileV2(draftRef.current?.data) ? draftRef.current!.data as unknown as ProfileV2 : null;
    const legacyDraft = !!draftRef.current && !previous;
    const additions = constraints ?? onboardingConstraints;
    // The backend rejects changing an existing draft's schema. New wizards start
    // at v2; legacy drafts finish unchanged and add constraints in the profile.
    if (legacyDraft && additions !== undefined) throw new Error("Nháp cũ cần hoàn tất trước. Sau đó bổ sung ràng buộc và mục tiêu trong hồ sơ chi tiết.");
    const generated = draft.quickProfile ?? createDefaultProfileV2(source);
    const document = legacyDraft ? data : (draft.quickProfile ? { ...draft.quickProfile, ...additions } : { ...generated, ...previous, ...additions });
    if (isProfileV2(document) && !draft.quickProfile) {
      const before = profileFromDraft(base, onboardingDraft);
      // Keep detailed entries byte-for-byte unless the corresponding quick total
      // was explicitly edited. Never collapse gold, bonds or contracts into totals.
      for (const [group, legacyGroup] of [["income", "income"], ["expenses", "expenses"], ["assets", "assets"], ["debts", "debt"]] as const) {
        if (!previous || JSON.stringify(source[legacyGroup]) === JSON.stringify(before[legacyGroup])) continue;
        const old = previous[group];
        const generatedIds = new Set(["inc_salary", "inc_secondary", "exp_essential", "exp_lifestyle", "ast_cash", "ast_stocks", "ast_liquid", "ast_re", "dbt_mortgage", "dbt_consumer"]);
        if (old?.status === "KNOWN" && old.entries.some(entry => !generatedIds.has(entry.id) || ("type" in entry && ["GOLD", "BOND"].includes(entry.type)) || ("contract" in entry && entry.contract?.status === "KNOWN"))) {
          throw new Error("Nháp đã có tài sản hoặc dòng tiền chi tiết. Giữ các tổng hiện có để hoàn tất, rồi sửa từng khoản trong hồ sơ chi tiết; không gộp mất thông tin.");
        }
        Object.assign(document, { [group]: generated[group] });
      }
      document.personal = { ...generated.personal, ...previous?.personal,
        ...(draft.desiredRetirementMonth !== undefined ? { desiredRetirementMonth: draft.desiredRetirementMonth ? { status: "KNOWN" as const, value: draft.desiredRetirementMonth } : { status: "UNKNOWN" as const } } : {}),
        ...(draft.birthMonth !== undefined ? { birthMonth: draft.birthMonth ? { status: "KNOWN" as const, value: draft.birthMonth } : { status: "UNKNOWN" as const } } : {}) };
    }
    const put = () => authenticatedRequest<DraftRecord>("/me/onboarding-draft", { expectedRevision: draftRef.current?.revision || 0, step: serverStep(draft.step), data: document }, "PUT");
    let result: DraftRecord;
    try { result = await put(); }
    catch (e) {
      if (!(e instanceof ApiError) || e.code !== "REVISION_CONFLICT") throw e;
      // A save that timed out client-side may still have committed, leaving this tab one
      // revision behind forever. Adopt the server revisions and retry once with what the user sees.
      const [latestRecord, latestDraft] = await Promise.all([
        authenticatedRequest<ProfileRecord | null>("/me/financial-profile", undefined, undefined, undefined, { skipCache: true }),
        authenticatedRequest<DraftRecord | null>("/me/onboarding-draft", undefined, undefined, undefined, { skipCache: true }),
      ]);
      recordRef.current = latestRecord; draftRef.current = latestDraft;
      if (latestRecord?.schemaVersion === 2 || isProfileV2(latestRecord?.data)) {
        setHasProfile(true);
        throw new Error("Hồ sơ tài chính đã được lưu trước đó. Hãy tải lại trang và mở Hồ sơ tài chính để cập nhật.");
      }
      result = await put();
    }
    if (result) {
      draftRef.current = result;
      if (result.data) {
        setOnboardingConstraints(isProfileV2(result.data) ? planningConstraints(result.data) : undefined);
        setOnboardingDraft({ ...draftFromProfile(isProfileV2(result.data) ? profileFromV2(source, result.data) : profileFromData(base, result.data), clientStep(result.step), result.updatedAt), birthMonth: draft.birthMonth, desiredRetirementMonth: draft.desiredRetirementMonth });
      }
      if (result.updatedAt) {
        setLastDraftSavedAt(new Date(result.updatedAt).toLocaleString("vi-VN"));
      }
    }
    return source;
  };
  const saveOnboardingDraft = async (updates: Partial<OnboardingDraftData>, constraints?: PlanningConstraints) => {
    if (busy.current || loading || loadError) return false;
    if (pendingCompletion.current) { setSaveError("Yêu cầu hoàn tất trước chưa rõ kết quả. Nhấn Hoàn tất lần nữa để nhận lại kết quả."); return false; }
    busy.current = true; setDraftSaveStatus("saving"); setSaveError(null);
    try { await writeDraft({ ...onboardingDraft, ...updates }, constraints); setDraftSaveStatus("saved"); return true; }
    catch (e) { setDraftSaveStatus("error"); setSaveError(failure(e)); return false; }
    finally { busy.current = false; }
  };
  const completeOnboarding = async (data: OnboardingDraftData, constraints?: PlanningConstraints) => {
    if (busy.current || loading || loadError) return false;
    busy.current = true; setDraftSaveStatus("saving"); setSaveError(null);
    try {
      if (!pendingCompletion.current) {
        const next = await writeDraft(data, constraints);
        pendingCompletion.current = { key: crypto.randomUUID(), body: { expectedDraftRevision: draftRef.current!.revision, expectedProfileRevision: recordRef.current?.revision || 0 }, profile: next, data: draftRef.current!.data as FinancialData | ProfileV2 };
      }
      const pending = pendingCompletion.current;
      const response = await authenticatedRequest<{ revision: number }>("/me/onboarding/complete", pending.body, "POST", { "Idempotency-Key": pending.key });
      const record: ProfileRecord = { revision: response.revision, schemaVersion: isProfileV2(pending.data) ? 2 : 1, data: pending.data, asOfDate: new Date().toISOString() };
      recordRef.current = record; draftRef.current = null; pendingCompletion.current = null;
      const { profile: nextProfile, v2 } = loadedProfile(base, record);
      setProfile(nextProfile);
      setV2Profile(v2);
      setSchemaVersion(record.schemaVersion ?? (v2 ? 2 : 1));
      setHasProfile(true);
      setHasUnsavedChanges(false);
      setDraftSaveStatus("saved");
      setSaveStatus("saved");
      setOnboardingDraft(draftFromProfile(pending.profile)); setLastSavedAt(new Date().toLocaleString("vi-VN"));
      return true;
    } catch (e) {
      // Network errors may follow a successful commit: retain the same idempotency key.
      if (e instanceof Error && "status" in e && Number(e.status) >= 400 && Number(e.status) < 500) pendingCompletion.current = null;
      if (e instanceof ApiError && e.code === "PROFILE_SCHEMA_MISMATCH") {
        // Another tab may have upgraded the profile while this survey was open.
        // Refresh only the profile: the saved survey must remain available for review.
        try {
          const record = await authenticatedRequest<ProfileRecord>("/me/financial-profile", undefined, "GET", undefined, { skipCache: true });
          recordRef.current = record;
          const next = loadedProfile(base, record);
          setProfile(next.profile); setV2Profile(next.v2); setSchemaVersion(record.schemaVersion ?? (next.v2 ? 2 : 1)); setHasProfile(true);
        } catch { /* Keep the draft and report the original failure if the refresh fails. */ }
      }
      setDraftSaveStatus("error"); setSaveError(failure(e)); return false;
    } finally { busy.current = false; }
  };
  const completenessPercentage = useMemo(() => hasProfile ? calculateProfileCompleteness(v2Profile, profile) : 0, [hasProfile, v2Profile, profile]);
  return {
    profile,
    v2Profile,
    profileSummary,
    schemaVersion,
    completenessPercentage,
    profileRevision: recordRef.current?.revision ?? 0,
    onboardingDraft,
    hasOnboardingDraft: !!draftRef.current,
    loading,
    loadError,
    hasProfile,
    reloadProfile,
    saveStatus,
    saveError,
    lastSavedAt,
    draftSaveStatus,
    lastDraftSavedAt,
    hasUnsavedChanges,
    updateProfile,
    updateProfileV2,
    upgradeToV2,
    onboardingConstraints,
    legacyOnboardingDraft,
    saveOnboardingDraft,
    completeOnboarding,
    exportSnapshot: () => profile,
    importSnapshot: (snapshot: FinancialProfile) => persistProfile(snapshot),
    updatePersonalInfo: (personal: Partial<PersonalProfile>) => persistProfile({ ...profile, personal: { ...profile.personal, ...personal } }),
    updateGoalInfo: (goal: Partial<RetirementGoalProfile>) => {
      setProfile(p => withCalculatedPlan({ ...p, goal: { ...p.goal, ...goal } }));
      setHasUnsavedChanges(true);
      setSaveStatus("dirty");
      return true;
    },
    applySimulationScenario: async (scenario: { retireAge: number; monthlySave: number; expense: number; returnRate: number; targetFund: number; projectedFund: number; score: number }) => {
      setProfile(p => ({
        ...p,
        goal: {
          ...p.goal,
          targetRetireAge: scenario.retireAge,
          monthlyExpenseInRetirement: scenario.expense,
          investmentReturn: scenario.returnRate,
        },
        plan: {
          ...p.plan,
          monthlySavings: scenario.monthlySave,
          targetFund: scenario.targetFund,
          projectedFund: scenario.projectedFund,
          readinessScore: scenario.score,
        },
      }));
      setHasUnsavedChanges(true);
      setSaveStatus("dirty");
      return true;
    },
    updateProfileLocal: (updates: Partial<FinancialProfile>) => {
      setProfile(p => withCalculatedPlan({ ...p, ...updates }));
      setHasUnsavedChanges(true);
      setSaveStatus("dirty");
    },
    clearUnsavedChanges: () => {
      if (recordRef.current) {
        const { profile: next, v2 } = loadedProfile(base, recordRef.current);
        setProfile(next);
        setV2Profile(v2);
        setProfileSummary(recordRef.current.summary?.values || recordRef.current.summary || null);
        setSchemaVersion(recordRef.current.schemaVersion ?? (v2 ? 2 : 1));
      }
      setHasUnsavedChanges(false);
      setSaveStatus("idle");
    },
  };
}
export function FinancialProfileProvider({ children }: { children: ReactNode }) {
  // Stable identity unless profile data changes, so typing elsewhere does not re-render every consumer.
  const value = useStableValue(useProfileState());
  return <FinancialProfileContext.Provider value={value}>{children}</FinancialProfileContext.Provider>;
}
export function useFinancialProfile() {
  const context = useContext(FinancialProfileContext);
  if (!context) throw new Error("useFinancialProfile must be used within FinancialProfileProvider");
  return context;
}
