import { profileV2Schema, type AssetEntry, type ProfileV2 } from "../modules/profiles/schema-v2";

export const known = <T extends string | number>(value: T) => ({ status: "KNOWN" as const, value });
export const unknown = { status: "UNKNOWN" as const };
export const empty = () => ({ status: "KNOWN" as const, entries: [] });
export const fixtureAsset = (changes: Partial<AssetEntry> = {}): AssetEntry => ({
  id: "deposit-1", label: "Tiền gửi", type: "DEPOSIT", value: known("100000000"), currency: "VND",
  valuedOn: known("2026-10-04"), ownershipShare: known("1"), retirementShare: known("0.6"),
  emergencyShare: known("0.3"), otherGoalsShare: known("0.1"), liquidity: known("LIQUID"),
  availableFromMonth: known("2026-10"), ...changes,
});
export const fixtureProfile = (changes: Partial<ProfileV2> = {}): ProfileV2 => profileV2Schema.parse({
  schemaVersion: 2, valuationDate: "2026-10-04", currency: "VND", periodUnit: "MONTH",
  personal: { birthMonth: known("1990-04"), desiredRetirementMonth: known("2050-05"), pensionStartMonth: unknown },
  income: { status: "KNOWN", entries: [{ id: "salary", label: "Thu khả dụng", kind: "FIXED", basis: "DISPOSABLE", amount: known("20000000"),
    currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] },
  expenses: { status: "KNOWN", entries: [{ id: "living", label: "Sinh hoạt", category: "ESSENTIAL", amount: known("16000000"),
    currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] },
  assets: { status: "KNOWN", entries: [fixtureAsset()] },
  debts: { status: "KNOWN", entries: [{ id: "loan", label: "Vay chung", sharedLoanId: "shared-loan", outstandingBalance: known("100000000"),
    balanceAsOf: known("2026-10-04"), currency: "VND", payment: known("10000000"), paymentShare: known("0.5"), balanceShare: known("0.5"),
    responsibility: unknown, frequency: "MONTHLY", startMonth: "2026-01", endMonth: "2030-12" }] },
  ...changes,
});
export const legacyProfileFixture = {
  personal: { age: 35, gender: "MALE" as const, maritalStatus: "SINGLE" as const, dependents: 0, city: "HCM" },
  income: { primaryIncome: "100", secondaryIncome: "0" }, expenses: { essentialExpense: "50", lifestyleExpense: "0" },
  assets: { cashSavings: "1000", realEstateValue: "0", liquidAssets: "0", stockFundValue: "0" },
  debt: { hasDebt: false, mortgageDebt: "0", consumerDebt: "0", monthlyDebtService: "0" },
  socialSecurity: { socialInsuranceYears: 0, socialInsuranceSalary: "0" },
};
