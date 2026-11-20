import { describe, expect, it } from "vitest";
import { obligationSchedule } from "../modules/retirement/obligations";
import { RetirementDecimal as D, type MonthlyInput, type ProjectionInput } from "../modules/retirement/engine";
import { separateCapital } from "../modules/capital/separation";
import { assumptionFixture } from "./assumptions-fixtures";
import { empty, fixtureProfile, known, unknown } from "./profile-v2-fixtures";
import type { ProfileV2 } from "../modules/profiles/schema-v2";

const monthlyRow = (month: string, livingExpense = "0"): MonthlyInput => ({
  month, growthFactor: "1", inflationFactor: "1", income: "0", pension: "0", livingExpense,
  additionalExpense: "0", debtPayment: "0", plannedContribution: "0", contribution: "0", contributionCapacity: "0",
  withdrawal: livingExpense, uninvestedSurplus: "0", capitalInjection: "0",
});
const replay = (rows: MonthlyInput[]): ProjectionInput => ({
  modelVersion: "retirement-monthly-v5", valuationDate: "2026-10-04", retirementMonth: "2027-01",
  initialCapital: "1000000000", terminalBalance: "0", monthlyContribution: "0", contributionTiming: "END_OF_MONTH", rows,
});
const goal = (dueMonth: string) => ({ id: "future", label: "Future goal", amountToday: known("300000000"), dueMonth: known(dueMonth),
  priority: known("ESSENTIAL" as const), deferrable: { status: "KNOWN" as const, value: false } });

describe("B1 obligations use projected nominal amounts and bounded dates", () => {
  it("uses the long-term goal amount actually charged by the protected projection", () => {
    const profile = fixtureProfile({ debts: empty(), goals: { status: "KNOWN", entries: [goal("2036-10")] } });
    const capital = separateCapital(profile, assumptionFixture());
    expect(capital.goals[0]).toMatchObject({ treatment: "LONG_TERM", futureAmount: null });
    const input = replay([monthlyRow("2026-10"), monthlyRow("2036-10")]);
    const futureAmount = new D("300000000").mul(new D("1.05").pow(10)).toFixed();
    input.protection = { model: "protected-capital-v1", emergencyReserve: "0", depositAssetClass: "CASH", depositFactors: ["1", "1"], rawRows: input.rows,
      goals: [{ id: "future", month: "2036-10", amount: futureAmount, openingReserve: "0", essential: true }] };
    const row = obligationSchedule(profile, { capital, replayInput: input }).find(r => r.id === "future");
    expect(row?.totalNominal).toBe(futureAmount);
    expect(new D(row!.totalNominal!).gt("300000000")).toBe(true);
  });

  it("keeps a future nominal amount unknown until it has been projected", () => {
    const profile = fixtureProfile({ debts: empty(), goals: { status: "KNOWN", entries: [goal("2036-10")] } });
    const capital = separateCapital(profile, assumptionFixture());
    expect(obligationSchedule(profile, { capital }).find(r => r.id === "future")?.totalNominal).toBeNull();
    const current = fixtureProfile({ debts: empty(), goals: { status: "KNOWN", entries: [goal("2026-10")] } });
    expect(obligationSchedule(current).find(r => r.id === "future")?.totalNominal).toBe("300000000");
  });

  it("clips recurring expense and declared debt totals to the projection end and excludes later events", () => {
    const expense = { id: "monthly", label: "Monthly expense", category: "ESSENTIAL" as const, amount: known("100"), currency: "VND",
      frequency: "MONTHLY" as const, startMonth: "2026-01", endMonth: "2030-12" };
    const debt = { id: "debt", label: "Declared debt", outstandingBalance: known("10000"), balanceAsOf: known("2026-10-04"), currency: "VND",
      payment: known("40"), paymentShare: known("0.5"), balanceShare: known("0.5"), responsibility: unknown,
      frequency: "MONTHLY" as const, startMonth: "2026-01", endMonth: "2030-12" };
    const profile = fixtureProfile({ goals: empty(), expenses: { status: "KNOWN", entries: [expense,
      { ...expense, id: "later-expense", frequency: "ONCE", startMonth: "2027-05", endMonth: "2027-05" }] },
      debts: { status: "KNOWN", entries: [debt, { ...debt, id: "later-debt", frequency: "ONCE", startMonth: "2027-05", endMonth: "2027-05" }] } });
    const rows = obligationSchedule(profile, { endMonth: "2027-02" });
    expect(rows.find(r => r.id === "monthly")).toMatchObject({ firstMonth: "2026-10", lastMonth: "2027-02", totalNominal: "500" });
    expect(rows.find(r => r.id === "debt")).toMatchObject({ firstMonth: "2026-10", lastMonth: "2027-02", totalNominal: "100" });
    expect(rows.some(r => r.id.startsWith("later-"))).toBe(false);
  });

  it("leaves foreign or unknown expense and debt amounts unresolved", () => {
    const profile = fixtureProfile({ goals: empty() });
    if (profile.expenses.status !== "KNOWN" || profile.debts.status !== "KNOWN") throw Error("Expected fixture declarations");
    profile.expenses.entries[0].currency = "USD";
    profile.debts.entries[0].currency = "USD";
    let rows = obligationSchedule(profile, { endMonth: "2026-12" });
    expect(rows.find(r => r.id === "living")?.totalNominal).toBeNull();
    expect(rows.find(r => r.id === "loan")?.totalNominal).toBeNull();
    profile.expenses.entries[0].currency = "VND"; profile.expenses.entries[0].amount = unknown;
    profile.debts.entries[0].currency = "VND"; profile.debts.entries[0].payment = unknown;
    rows = obligationSchedule(profile, { endMonth: "2026-12" });
    expect(rows.find(r => r.id === "living")?.totalNominal).toBeNull();
    expect(rows.find(r => r.id === "loan")?.totalNominal).toBeNull();
  });

  it("does not list unselected current household expenses again after retirement", () => {
    const entry = { id: "living", label: "Current living", category: "ESSENTIAL" as const, amount: known("100"), currency: "VND",
      frequency: "MONTHLY" as const, startMonth: "2026-01", endMonth: null };
    const profile = fixtureProfile({ goals: empty(), debts: empty(), expenses: { status: "KNOWN", entries: [entry,
      { ...entry, id: "extra", label: "Retained essential extra", amount: known("50") }] } });
    const input = replay([monthlyRow("2026-10"), monthlyRow("2026-11"), monthlyRow("2026-12"), monthlyRow("2027-01", "200"), monthlyRow("2027-02", "210")]);
    const rows = obligationSchedule(profile, { replayInput: input, retirementAdditionalExpenseIds: ["extra"] });
    expect(rows.find(r => r.id === "living")).toMatchObject({ lastMonth: "2026-12", totalNominal: "300" });
    expect(rows.find(r => r.id === "extra")).toMatchObject({ lastMonth: "2027-02", totalNominal: "250" });
    expect(rows.find(r => r.id === "retirement-living")).toMatchObject({ totalNominal: "410" });
  });

  it("keeps the workspace retirement obligation dated without making up a total", () => {
    const profile: ProfileV2 = fixtureProfile({ goals: empty(), debts: empty() });
    expect(obligationSchedule(profile, { retirementMonth: "2027-01", endMonth: "2027-02" }).find(r => r.id === "retirement-living"))
      .toMatchObject({ firstMonth: "2027-01", lastMonth: "2027-02", totalNominal: null });
  });
});
