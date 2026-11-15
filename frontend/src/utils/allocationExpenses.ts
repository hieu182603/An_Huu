import type { ExpenseEntry, ProfileV2 } from "../services/financialProfile";

/** Change the current essential budget, preserving every source and its schedule.
 * The user confirms proportional changes; debt, care and future-only entries stay intact. */
export function allocationExpenseChanges(profile: ProfileV2, target: string): ExpenseEntry[] | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(target) || profile.expenses.status !== "KNOWN") return null;
  const month = profile.valuationDate.slice(0, 7);
  const active = profile.expenses.entries.filter(e => e.category === "ESSENTIAL" && e.startMonth <= month && (e.endMonth === null || e.endMonth >= month));
  if (!active.length || active.some(e => e.currency !== "VND" || e.frequency !== "MONTHLY" || e.amount.status !== "KNOWN")) return null;
  const cents = (s: string) => { const [whole, fraction = ""] = s.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); };
  const values = active.map(e => cents(e.amount.status === "KNOWN" ? e.amount.value : "0"));
  const sum = values.reduce((a, b) => a + b, 0n), total = cents(target);
  let allocated = 0n;
  const changes = active.map((entry, i) => {
    const amount = i === active.length - 1 ? total - allocated : sum ? total * values[i] / sum : i === 0 ? total : 0n;
    allocated += amount;
    return { ...entry, amount: { status: "KNOWN", value: `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}` } };
  });
  return profile.expenses.entries.map(entry => changes.find(change => change.id === entry.id) ?? entry) as ExpenseEntry[];
}
