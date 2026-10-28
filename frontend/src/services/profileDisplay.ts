import type { KnownOrUnknown, ProfileCollection, ProfileV2 } from "./financialProfile";

// Presentation guards: the legacy numeric projection loses UNKNOWN states.
// Leave calculation and persistence unchanged; only show complete totals.
function complete<T>(collection: ProfileCollection<T>, amount: (entry: T) => KnownOrUnknown<string>) {
  return collection.status === "NOT_APPLICABLE" || (collection.status === "KNOWN" && collection.entries.every(entry => {
    const field = amount(entry);
    return field?.status === "KNOWN" && typeof field.value === "string" && field.value.trim() !== "" && Number.isFinite(Number(field.value));
  }));
}

export function profileDisplayStatus(profile: ProfileV2 | null) {
  const income = !profile || complete(profile.income, entry => entry.amount);
  const expenses = !profile || complete(profile.expenses, entry => entry.amount);
  const debtPayment = !profile || complete(profile.debts, entry => entry.payment);
  const assets = !profile || complete(profile.assets, entry => entry.value);
  const debtBalance = !profile || complete(profile.debts, entry => entry.outstandingBalance);
  return { income, expenses, debtPayment, assets, debtBalance, surplus: income && expenses && debtPayment };
}
