import type { FinancialProfile, OnboardingDraftData } from "../context/FinancialProfileContext";
import type { PensionDeclaration, RetirementCondition } from "./pensions";
export type { PensionDeclaration, RetirementCondition } from "./pensions";

export type KnownOrUnknown<T> =
  | { status: "KNOWN"; value: T }
  | { status: "UNKNOWN" };

export type OptionalMonth =
  | { status: "KNOWN"; value: string }
  | { status: "UNKNOWN" }
  | { status: "NOT_APPLICABLE"; reason: string };

export type ProfileCollection<T> =
  | { status: "KNOWN"; entries: T[] }
  | { status: "UNKNOWN" }
  | { status: "NOT_APPLICABLE"; reason: string };

export type IncomeEntry = {
  id: string;
  label: string;
  kind: "FIXED" | "BONUS" | "IRREGULAR";
  source?: "EMPLOYMENT" | "OTHER" | "PENSION";
  basis: "DISPOSABLE";
  amount: KnownOrUnknown<string>;
  currency: string;
  startMonth: string;
  endMonth: string | null;
  frequency: "MONTHLY" | "ONCE";
};

export type ExpenseEntry = {
  id: string;
  label: string;
  category: "ESSENTIAL" | "OPTIONAL" | "HEALTH" | "INSURANCE" | "DEPENDENT" | "DEBT_PAYMENT";
  amount: KnownOrUnknown<string>;
  currency: string;
  loanId?: string;
  startMonth: string;
  endMonth: string | null;
  frequency: "MONTHLY" | "ONCE";
};

export type AssetEntry = {
  id: string;
  label: string;
  type: "CASH" | "DEPOSIT" | "STOCK_FUND" | "GOLD" | "BOND" | "PRIMARY_HOME" | "REAL_ESTATE" | "OTHER";
  costBasis?: KnownOrUnknown<string>;
  value: KnownOrUnknown<string>;
  currency: string;
  valuedOn: KnownOrUnknown<string>;
  ownershipShare: KnownOrUnknown<string>;
  retirementShare: KnownOrUnknown<string>;
  emergencyShare: KnownOrUnknown<string>;
  otherGoalsShare: KnownOrUnknown<string>;
  liquidity: KnownOrUnknown<"LIQUID" | "ILLIQUID" | "LOCKED">;
  availableFromMonth: KnownOrUnknown<string>;
  housingPlan?:
    | { status: "UNCONFIRMED" }
    | { status: "CONFIRMED"; kind: "SALE" | "RENT"; startMonth: string; netAmount: KnownOrUnknown<string> };
};

export type DebtEntry = {
  id: string;
  label: string;
  sharedLoanId?: string;
  outstandingBalance: KnownOrUnknown<string>;
  balanceAsOf: KnownOrUnknown<string>;
  currency: string;
  payment: KnownOrUnknown<string>;
  paymentShare: KnownOrUnknown<string>;
  balanceShare: KnownOrUnknown<string>;
  contract?: { status: "UNKNOWN" } | { status: "KNOWN"; value: any };
  responsibility:
    | { status: "UNKNOWN" }
    | {
        status: "KNOWN";
        scope: "ALLOCATED_ONLY" | "FULL" | "CAPPED";
        confirmedDocument: string;
        limit: KnownOrUnknown<string>;
      };
  startMonth: string;
  endMonth: string | null;
  frequency: "MONTHLY" | "ONCE";
};

export type PersonalProfileV2 = {
  birthMonth: KnownOrUnknown<string>;
  desiredRetirementMonth: KnownOrUnknown<string>;
  pensionStartMonth: OptionalMonth;
  gender?: "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED";
  retirementCondition?: RetirementCondition;
  maritalStatus?: "SINGLE" | "MARRIED" | "OTHER";
  dependents?: KnownOrUnknown<number>;
  city?: string;
};

export type GoalEntry = {
  id: string; label: string; amountToday: KnownOrUnknown<string>; dueMonth: KnownOrUnknown<string>;
  inflation?: KnownOrUnknown<string>; priority: KnownOrUnknown<"ESSENTIAL" | "FLEXIBLE" | "LEGACY">;
  deferrable: KnownOrUnknown<boolean>;
};
export type PlanningConstraints = {
  lossTolerance?: { amountVnd?: KnownOrUnknown<string>; percent?: KnownOrUnknown<string>; reaction?: KnownOrUnknown<"SELL" | "HOLD" | "BUY_MORE"> };
  incomeStability?: KnownOrUnknown<"STABLE" | "VARIABLE" | "UNCERTAIN">;
  employerConcentration?: KnownOrUnknown<"LOW" | "MEDIUM" | "HIGH">;
  liquidityNeeds?: { y1?: KnownOrUnknown<string>; y3?: KnownOrUnknown<string>; y5?: KnownOrUnknown<string> };
  goals?: ProfileCollection<GoalEntry>;
};
export const planningConstraints = (profile: PlanningConstraints): PlanningConstraints => Object.fromEntries(
  ["lossTolerance", "incomeStability", "employerConcentration", "liquidityNeeds", "goals"].filter(key => key in profile).map(key => [key, profile[key as keyof PlanningConstraints]])
);

export type ProfileV2 = PlanningConstraints & {
  schemaVersion: 2;
  valuationDate: string;
  currency: "VND";
  periodUnit: "MONTH";
  personal: PersonalProfileV2;
  income: ProfileCollection<IncomeEntry>;
  expenses: ProfileCollection<ExpenseEntry>;
  assets: ProfileCollection<AssetEntry>;
  debts: ProfileCollection<DebtEntry>;
  pension?: PensionDeclaration;
};

export type FinancialData = {
  personal: { age: number; gender: string; maritalStatus: string; dependents: number; city: string };
  income: { primaryIncome: string; secondaryIncome: string };
  expenses: { essentialExpense: string; lifestyleExpense: string };
  assets: { cashSavings: string; realEstateValue: string; liquidAssets: string; stockFundValue: string };
  debt: { hasDebt: boolean; mortgageDebt: string; consumerDebt: string; monthlyDebtService: string };
  socialSecurity: { socialInsuranceYears: number; socialInsuranceSalary: string };
};

export type ProfileRecord = {
  id?: string;
  revision: number;
  schemaVersion?: number;
  data: FinancialData | ProfileV2;
  summary?: any;
  asOfDate?: string;
};

export type DraftRecord = { revision: number; step: string; data: { [K in keyof FinancialData]?: Partial<FinancialData[K]> }; updatedAt: string };

const genders: Record<string, string> = { Nam: "MALE", Nữ: "FEMALE", Khác: "OTHER", "Không tiết lộ": "UNDISCLOSED" };
const marriages: Record<string, string> = { "Độc thân": "SINGLE", "Đã kết hôn": "MARRIED", Khác: "OTHER" };
const label = (map: Record<string, string>, value?: string) => Object.keys(map).find(key => map[key] === value) || "";

export const isProfileV2 = (value: unknown): value is ProfileV2 =>
  typeof value === "object" && value !== null && "schemaVersion" in value && (value as { schemaVersion: unknown }).schemaVersion === 2;

const money = (value: number, original?: string) => {
  // Keep the server decimal string if this field was not edited.
  if (original !== undefined && Number(original) === value) return original;
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error("Số tiền không hợp lệ hoặc vượt giới hạn nhập liệu.");
  return value.toFixed(2);
};

export function financialData(profile: FinancialProfile, original?: FinancialData): FinancialData {
  const { personal: p, income: i, expenses: e, assets: a, debt: d, socialSecurity: s } = profile;
  return {
    personal: { age: p.age, gender: genders[p.gender] || "UNDISCLOSED", maritalStatus: marriages[p.maritalStatus] || "OTHER", dependents: p.dependents, city: p.city },
    income: { primaryIncome: money(i.primaryIncome, original?.income.primaryIncome), secondaryIncome: money(i.secondaryIncome, original?.income.secondaryIncome) },
    expenses: { essentialExpense: money(e.essentialExpense, original?.expenses.essentialExpense), lifestyleExpense: money(e.lifestyleExpense, original?.expenses.lifestyleExpense) },
    assets: { cashSavings: money(a.cashSavings, original?.assets.cashSavings), realEstateValue: money(a.realEstateValue, original?.assets.realEstateValue), liquidAssets: money(a.liquidAssets, original?.assets.liquidAssets), stockFundValue: money(a.stockFundValue, original?.assets.stockFundValue) },
    debt: { hasDebt: d.hasDebt, mortgageDebt: money(d.hasDebt ? d.mortgageDebt : 0, original?.debt.mortgageDebt), consumerDebt: money(d.hasDebt ? d.consumerDebt : 0, original?.debt.consumerDebt), monthlyDebtService: money(d.hasDebt ? d.monthlyDebtService : 0, original?.debt.monthlyDebtService) },
    socialSecurity: { socialInsuranceYears: s.socialInsuranceYears, socialInsuranceSalary: money(s.socialInsuranceSalary, original?.socialSecurity.socialInsuranceSalary) },
  };
}

export function profileFromData(base: FinancialProfile, data: DraftRecord["data"]): FinancialProfile {
  const numeric = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).map(([key, value]) => [key, Number(value)]));
  return {
    ...base,
    personal: { ...base.personal, ...data.personal, gender: data.personal?.gender ? label(genders, data.personal.gender) : base.personal.gender, maritalStatus: data.personal?.maritalStatus ? label(marriages, data.personal.maritalStatus) : base.personal.maritalStatus },
    income: { ...base.income, ...numeric(data.income || {}) },
    expenses: { ...base.expenses, ...numeric(data.expenses || {}) },
    assets: { ...base.assets, ...numeric(data.assets || {}) },
    debt: { ...base.debt, ...numeric(data.debt || {}), hasDebt: data.debt?.hasDebt ?? base.debt.hasDebt },
    socialSecurity: { ...base.socialSecurity, ...numeric(data.socialSecurity || {}) },
  };
}

export function profileFromV2(base: FinancialProfile, v2: ProfileV2): FinancialProfile {
  // Vietnam time (UTC+7)
  const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const currentYear = nowVN.getUTCFullYear();
  const currentMonthNum = nowVN.getUTCMonth() + 1; // 1-12
  const valuationMonth = v2.valuationDate ? v2.valuationDate.slice(0, 7) : `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;

  let age = base.personal.age;
  if (v2.personal?.birthMonth?.status === "KNOWN") {
    const birthYear = parseInt(v2.personal.birthMonth.value.slice(0, 4), 10);
    const birthMonthNum = parseInt(v2.personal.birthMonth.value.slice(5, 7), 10);
    if (!Number.isNaN(birthYear) && !Number.isNaN(birthMonthNum)) {
      let calculatedAge = currentYear - birthYear;
      if (currentMonthNum < birthMonthNum) {
        calculatedAge -= 1;
      }
      age = Math.max(18, calculatedAge);
    }
  }

  let targetRetireAge = base.goal.targetRetireAge;
  if (v2.personal?.desiredRetirementMonth?.status === "KNOWN" && v2.personal?.birthMonth?.status === "KNOWN") {
    const retireYear = parseInt(v2.personal.desiredRetirementMonth.value.slice(0, 4), 10);
    const retireMonthNum = parseInt(v2.personal.desiredRetirementMonth.value.slice(5, 7), 10);
    const birthYear = parseInt(v2.personal.birthMonth.value.slice(0, 4), 10);
    const birthMonthNum = parseInt(v2.personal.birthMonth.value.slice(5, 7), 10);
    if (!Number.isNaN(retireYear) && !Number.isNaN(birthYear) && !Number.isNaN(retireMonthNum) && !Number.isNaN(birthMonthNum)) {
      let calculatedRetireAge = retireYear - birthYear;
      if (retireMonthNum < birthMonthNum) {
        calculatedRetireAge -= 1;
      }
      targetRetireAge = Math.max(age, calculatedRetireAge);
    }
  }

  // Aggregate incomes: only monthly active at valuationMonth (startMonth <= month <= endMonth), exclude PENSION
  let primaryIncome = 0;
  let secondaryIncome = 0;
  if (v2.income?.status === "KNOWN") {
    v2.income.entries.forEach(entry => {
      if (entry.frequency !== "MONTHLY") return;
      if (entry.source === "PENSION") return;
      if (entry.startMonth > valuationMonth || (entry.endMonth !== null && entry.endMonth < valuationMonth)) return;
      const val = entry.amount?.status === "KNOWN" ? parseFloat(entry.amount.value) : 0;
      if (entry.kind === "FIXED") primaryIncome += val;
      else secondaryIncome += val;
    });
  }

  // Aggregate expenses: only monthly active at valuationMonth (startMonth <= month <= endMonth), exclude DEBT_PAYMENT
  let essentialExpense = 0;
  let lifestyleExpense = 0;
  if (v2.expenses?.status === "KNOWN") {
    v2.expenses.entries.forEach(entry => {
      if (entry.frequency !== "MONTHLY") return;
      if (entry.category === "DEBT_PAYMENT") return;
      if (entry.startMonth > valuationMonth || (entry.endMonth !== null && entry.endMonth < valuationMonth)) return;
      const val = entry.amount?.status === "KNOWN" ? parseFloat(entry.amount.value) : 0;
      if (entry.category === "ESSENTIAL" || entry.category === "HEALTH" || entry.category === "INSURANCE" || entry.category === "DEPENDENT") {
        essentialExpense += val;
      } else if (entry.category === "OPTIONAL") {
        lifestyleExpense += val;
      }
    });
  }

  // Aggregate assets: multiply by ownershipShare
  let cashSavings = 0;
  let realEstateValue = 0;
  let liquidAssets = 0;
  let stockFundValue = 0;
  if (v2.assets?.status === "KNOWN") {
    v2.assets.entries.forEach(entry => {
      const rawVal = entry.value?.status === "KNOWN" ? parseFloat(entry.value.value) : 0;
      const share = entry.ownershipShare?.status === "KNOWN" ? parseFloat(entry.ownershipShare.value) : 1;
      const val = rawVal * (Number.isFinite(share) ? share : 1);
      if (entry.type === "CASH" || entry.type === "DEPOSIT") cashSavings += val;
      else if (entry.type === "REAL_ESTATE" || entry.type === "PRIMARY_HOME") realEstateValue += val;
      else if (entry.type === "STOCK_FUND") stockFundValue += val;
      else liquidAssets += val;
    });
  }

  // Aggregate debts: multiply balance by balanceShare, payment by paymentShare
  let mortgageDebt = 0;
  let consumerDebt = 0;
  let monthlyDebtService = 0;
  const hasDebt = v2.debts?.status === "KNOWN" && v2.debts.entries.length > 0;
  if (hasDebt && v2.debts?.status === "KNOWN") {
    v2.debts.entries.forEach(entry => {
      const rawBalance = entry.outstandingBalance?.status === "KNOWN" ? parseFloat(entry.outstandingBalance.value) : 0;
      const rawPayment = entry.payment?.status === "KNOWN" ? parseFloat(entry.payment.value) : 0;
      const bShare = entry.balanceShare?.status === "KNOWN" ? parseFloat(entry.balanceShare.value) : 1;
      const pShare = entry.paymentShare?.status === "KNOWN" ? parseFloat(entry.paymentShare.value) : 1;
      const balance = rawBalance * (Number.isFinite(bShare) ? bShare : 1);
      const payment = rawPayment * (Number.isFinite(pShare) ? pShare : 1);
      if ((entry.label ?? "").toLowerCase().includes("nhà") || (entry.label ?? "").toLowerCase().includes("mortgage")) {
        mortgageDebt += balance;
      } else {
        consumerDebt += balance;
      }
      monthlyDebtService += payment;
    });
  }

  return {
    ...base,
    personal: {
      ...base.personal,
      age,
      gender: v2.personal?.gender ? label(genders, v2.personal?.gender) : base.personal.gender,
      maritalStatus: v2.personal?.maritalStatus ? label(marriages, v2.personal?.maritalStatus) : base.personal.maritalStatus,
      dependents: v2.personal?.dependents?.status === "KNOWN" ? v2.personal?.dependents.value : base.personal.dependents,
      city: v2.personal?.city || base.personal.city,
    },
    income: { primaryIncome, secondaryIncome },
    expenses: { essentialExpense, lifestyleExpense },
    assets: { cashSavings, realEstateValue, liquidAssets, stockFundValue },
    debt: { hasDebt, mortgageDebt, consumerDebt, monthlyDebtService },
    goal: { ...base.goal, targetRetireAge },
  };
}

// Converts the v1 survey totals into a v2 document. Only values the user actually
// declared become KNOWN; anything v1 never asked (birth/retirement month, asset
// allocation and ownership, loan responsibility, pension start) stays UNKNOWN so
// the v2 review asks for it instead of saving invented defaults.
export function createDefaultProfileV2(profile: FinancialProfile): ProfileV2 {
  const valuationDate = new Date().toISOString().slice(0, 10);
  const currentMonth = valuationDate.slice(0, 7);
  const unknown = { status: "UNKNOWN" } as const;
  const shares = { ownershipShare: unknown, retirementShare: unknown, emergencyShare: unknown, otherGoalsShare: unknown };
  // v1 has one total debt service figure; it belongs to a single loan only when there is one.
  const singleLoan = (profile.debt.mortgageDebt > 0) !== (profile.debt.consumerDebt > 0);
  const debtPayment = singleLoan && profile.debt.monthlyDebtService > 0
    ? { status: "KNOWN" as const, value: profile.debt.monthlyDebtService.toFixed(2) } : unknown;

  const incomeEntries: IncomeEntry[] = [];
  if (profile.income.primaryIncome > 0) {
    incomeEntries.push({
      id: "inc_salary",
      label: "Thu nhập chính",
      kind: "FIXED",
      basis: "DISPOSABLE",
      amount: { status: "KNOWN", value: profile.income.primaryIncome.toFixed(2) },
      currency: "VND",
      startMonth: currentMonth,
      endMonth: null,
      frequency: "MONTHLY",
    });
  }
  if (profile.income.secondaryIncome > 0) {
    incomeEntries.push({
      id: "inc_secondary",
      label: "Thu nhập khác",
      kind: "IRREGULAR",
      basis: "DISPOSABLE",
      amount: { status: "KNOWN", value: profile.income.secondaryIncome.toFixed(2) },
      currency: "VND",
      startMonth: currentMonth,
      endMonth: null,
      frequency: "MONTHLY",
    });
  }

  const expenseEntries: ExpenseEntry[] = [];
  if (profile.expenses.essentialExpense > 0) {
    expenseEntries.push({
      id: "exp_essential",
      label: "Chi tiêu thiết yếu",
      category: "ESSENTIAL",
      amount: { status: "KNOWN", value: profile.expenses.essentialExpense.toFixed(2) },
      currency: "VND",
      startMonth: currentMonth,
      endMonth: null,
      frequency: "MONTHLY",
    });
  }
  if (profile.expenses.lifestyleExpense > 0) {
    expenseEntries.push({
      id: "exp_lifestyle",
      label: "Chi tiêu linh hoạt",
      category: "OPTIONAL",
      amount: { status: "KNOWN", value: profile.expenses.lifestyleExpense.toFixed(2) },
      currency: "VND",
      startMonth: currentMonth,
      endMonth: null,
      frequency: "MONTHLY",
    });
  }

  const assetEntries: AssetEntry[] = [];
  if (profile.assets.cashSavings > 0) {
    assetEntries.push({
      id: "ast_cash",
      label: "Tiền mặt & Tiền gửi tiết kiệm",
      type: "CASH",
      value: { status: "KNOWN", value: profile.assets.cashSavings.toFixed(2) },
      currency: "VND",
      valuedOn: { status: "KNOWN", value: valuationDate },
      ...shares,
      liquidity: { status: "KNOWN", value: "LIQUID" },
      availableFromMonth: { status: "KNOWN", value: currentMonth },
    });
  }
  if (profile.assets.stockFundValue > 0) {
    assetEntries.push({
      id: "ast_stocks",
      label: "Cổ phiếu & Quỹ đầu tư",
      type: "STOCK_FUND",
      value: { status: "KNOWN", value: profile.assets.stockFundValue.toFixed(2) },
      currency: "VND",
      valuedOn: { status: "KNOWN", value: valuationDate },
      ...shares,
      liquidity: { status: "KNOWN", value: "LIQUID" },
      availableFromMonth: { status: "KNOWN", value: currentMonth },
    });
  }
  if (profile.assets.liquidAssets > 0) {
    assetEntries.push({
      id: "ast_liquid",
      label: "Tài sản thanh khoản khác",
      type: "DEPOSIT",
      value: { status: "KNOWN", value: profile.assets.liquidAssets.toFixed(2) },
      currency: "VND",
      valuedOn: { status: "KNOWN", value: valuationDate },
      ...shares,
      liquidity: { status: "KNOWN", value: "LIQUID" },
      availableFromMonth: { status: "KNOWN", value: currentMonth },
    });
  }
  if (profile.assets.realEstateValue > 0) {
    assetEntries.push({
      id: "ast_re",
      label: "Bất động sản",
      type: "REAL_ESTATE",
      value: { status: "KNOWN", value: profile.assets.realEstateValue.toFixed(2) },
      currency: "VND",
      valuedOn: { status: "KNOWN", value: valuationDate },
      ...shares,
      liquidity: { status: "KNOWN", value: "ILLIQUID" },
      availableFromMonth: unknown,
    });
  }

  const debtEntries: DebtEntry[] = [];
  if (profile.debt.hasDebt) {
    if (profile.debt.mortgageDebt > 0) {
      debtEntries.push({
        id: "dbt_mortgage",
        label: "Nợ mua nhà",
        outstandingBalance: { status: "KNOWN", value: profile.debt.mortgageDebt.toFixed(2) },
        balanceAsOf: { status: "KNOWN", value: valuationDate },
        currency: "VND",
        payment: debtPayment,
        paymentShare: { status: "KNOWN", value: "1" },
        balanceShare: { status: "KNOWN", value: "1" },
        contract: { status: "UNKNOWN" },
        responsibility: unknown,
        startMonth: currentMonth,
        endMonth: null,
        frequency: "MONTHLY",
      });
    }
    if (profile.debt.consumerDebt > 0) {
      debtEntries.push({
        id: "dbt_consumer",
        label: "Nợ tiêu dùng & Thẻ tín dụng",
        outstandingBalance: { status: "KNOWN", value: profile.debt.consumerDebt.toFixed(2) },
        balanceAsOf: { status: "KNOWN", value: valuationDate },
        currency: "VND",
        payment: debtPayment,
        paymentShare: { status: "KNOWN", value: "1" },
        balanceShare: { status: "KNOWN", value: "1" },
        contract: { status: "UNKNOWN" },
        responsibility: unknown,
        startMonth: currentMonth,
        endMonth: null,
        frequency: "MONTHLY",
      });
    }
  }

  return {
    schemaVersion: 2,
    valuationDate,
    currency: "VND",
    periodUnit: "MONTH",
    personal: {
      birthMonth: unknown,
      desiredRetirementMonth: unknown,
      pensionStartMonth: unknown,
      gender: genders[profile.personal.gender] as any,
      retirementCondition: { kind: "NORMAL" },
      maritalStatus: marriages[profile.personal.maritalStatus] as any,
      dependents: { status: "KNOWN", value: profile.personal.dependents },
      city: profile.personal.city,
    },
    income: { status: "KNOWN", entries: incomeEntries },
    expenses: { status: "KNOWN", entries: expenseEntries },
    assets: { status: "KNOWN", entries: assetEntries },
    debts: profile.debt.hasDebt ? { status: "KNOWN", entries: debtEntries } : { status: "NOT_APPLICABLE", reason: "Không có khoản nợ nào" },
    pension: { status: "UNKNOWN" },
  };
}

export function draftFromProfile(p: FinancialProfile, step = "welcome", updatedAt = ""): OnboardingDraftData {
  const { name: _name, email: _email, phone: _phone, ...personal } = p.personal;
  return { ...personal, ...p.income, ...p.expenses, ...p.assets, ...p.debt, ...p.socialSecurity, step, updatedAt };
}

export function profileFromDraft(base: FinancialProfile, d: OnboardingDraftData): FinancialProfile {
  return {
    ...base,
    personal: { ...base.personal, age: d.age, gender: d.gender, maritalStatus: d.maritalStatus, dependents: d.dependents, city: d.city },
    income: { primaryIncome: d.primaryIncome, secondaryIncome: d.secondaryIncome },
    expenses: { essentialExpense: d.essentialExpense, lifestyleExpense: d.lifestyleExpense },
    assets: { cashSavings: d.cashSavings, realEstateValue: d.realEstateValue, liquidAssets: d.liquidAssets, stockFundValue: d.stockFundValue },
    debt: { hasDebt: d.hasDebt, mortgageDebt: d.mortgageDebt, consumerDebt: d.consumerDebt, monthlyDebtService: d.monthlyDebtService },
    socialSecurity: { socialInsuranceYears: d.socialInsuranceYears, socialInsuranceSalary: d.socialInsuranceSalary },
  };
}

export const serverStep = (step: string) => step === "contribution" ? "investment" : step === "expense" ? "expenses" : step === "invest-social" ? "socialSecurity" : step;
export const clientStep = (step: string) => step === "expenses" ? "expense" : step === "investment" ? "contribution" : step === "socialSecurity" ? "invest-social" : step;

export interface QuickStartProfileInput {
  birthMonth: string;
  desiredRetirementMonth: string;
  monthlyIncome: number;
  monthlyExpense: number;
  retirementSavings: number;
  hasDebt?: boolean;
  debtBalance?: number;
  debtMonthlyPayment?: number;
  valuationDate?: string;
  retirementShare?: "1" | "UNKNOWN";
}

export function createQuickStartProfileV2(input: QuickStartProfileInput): ProfileV2 {
  const valuationDate = input.valuationDate || new Date().toISOString().slice(0, 10);
  const currentMonth = valuationDate.slice(0, 7);
  const unknown = { status: "UNKNOWN" } as const;
  const known = <T>(value: T) => ({ status: "KNOWN" as const, value });

  const [retireYear, retireMonth] = (input.desiredRetirementMonth || currentMonth).split("-").map(Number);
  const prevMonth = retireMonth === 1 ? `${retireYear - 1}-12` : `${retireYear}-${String(retireMonth - 1).padStart(2, "0")}`;

  const incomeEntries: IncomeEntry[] = [];
  if (input.monthlyIncome > 0 && prevMonth >= currentMonth) {
    incomeEntries.push({
      id: "inc_quick",
      label: "Thu nhập hằng tháng",
      kind: "FIXED",
      basis: "DISPOSABLE",
      source: "EMPLOYMENT",
      amount: known(input.monthlyIncome.toFixed(2)),
      currency: "VND",
      startMonth: currentMonth,
      endMonth: prevMonth,
      frequency: "MONTHLY",
    });
  }

  const expenseEntries: ExpenseEntry[] = [];
  if (input.monthlyExpense > 0) {
    expenseEntries.push({
      id: "exp_quick",
      label: "Chi tiêu hằng tháng",
      category: "ESSENTIAL",
      amount: known(input.monthlyExpense.toFixed(2)),
      currency: "VND",
      startMonth: currentMonth,
      endMonth: null,
      frequency: "MONTHLY",
    });
  }

  const isRetirementShareOne = input.retirementShare !== "UNKNOWN";
  const assetEntries: AssetEntry[] = [];
  if (input.retirementSavings > 0) {
    assetEntries.push({
      id: "ast_quick",
      label: "Tiền dành cho hưu trí",
      type: "DEPOSIT",
      value: known(input.retirementSavings.toFixed(2)),
      currency: "VND",
      valuedOn: known(valuationDate),
      ownershipShare: known("1"),
      ...(isRetirementShareOne
        ? { retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") }
        : { retirementShare: unknown, emergencyShare: unknown, otherGoalsShare: unknown }),
      liquidity: known("LIQUID"),
      availableFromMonth: known(currentMonth),
    });
  }

  let debts: ProfileV2["debts"];
  if (input.hasDebt === true) {
    debts = {
      status: "KNOWN",
      entries: [
        {
          id: "dbt_quick",
          label: "Khoản nợ",
          outstandingBalance: known((input.debtBalance ?? 0).toFixed(2)),
          balanceAsOf: known(valuationDate),
          currency: "VND",
          payment: known((input.debtMonthlyPayment ?? 0).toFixed(2)),
          paymentShare: known("1"),
          balanceShare: known("1"),
          contract: unknown,
          responsibility: unknown,
          startMonth: currentMonth,
          endMonth: null,
          frequency: "MONTHLY",
        },
      ],
    };
  } else if (input.hasDebt === false) {
    debts = {
      status: "NOT_APPLICABLE",
      reason: "Người dùng xác nhận không có nợ",
    };
  } else {
    debts = {
      status: "UNKNOWN",
    };
  }

  return {
    schemaVersion: 2,
    valuationDate,
    currency: "VND",
    periodUnit: "MONTH",
    personal: {
      birthMonth: known(input.birthMonth),
      desiredRetirementMonth: known(input.desiredRetirementMonth),
      pensionStartMonth: unknown,
    },
    income: { status: "KNOWN", entries: incomeEntries },
    expenses: { status: "KNOWN", entries: expenseEntries },
    assets: { status: "KNOWN", entries: assetEntries },
    debts,
    pension: { status: "UNKNOWN" },
  };
}

