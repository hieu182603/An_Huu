// Group A fixes of the allocation algorithm against the spec (sites/an-huu-trai-nghiem/thuat-toan-phan-bo-tai-san.md):
// A3 §8.2 tolerance-band rebalancing in simulation, A1/A2 §7.4 step 4 behavioural adjustments (optional spending only).
// A4 (§7.4 step 1 weight bounds) is asserted on real documents in audit-allocation-personalization.test.ts (C01).
import { describe, expect, it } from "vitest";
import { bandTriggered, portfolioFactors, runPath, type RiskContext } from "../modules/allocation-risk/simulation";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { searchAdjustments, type Variant } from "../modules/allocation-risk/adjustments";
import { fixtureProfile, known } from "./profile-v2-fixtures";
import { riskContext } from "./allocation-risk-fixtures";

const split = [{ assetClass: "EQUITY", weightPercent: "50" }, { assetClass: "CASH", weightPercent: "50" }];
const context = (band: string | null, calendar: boolean): RiskContext => ({
  projection: {} as never, selection: {} as never, essentialExpenses: [], targets: [split, split],
  rebalance: [true, calendar], turnoverCostPercent: "1", rebalanceBandPoints: band,
});
const market = (equity: string) => [{ cpi: "0", returns: { EQUITY: equity, CASH: "0" } }, { cpi: "0", returns: { EQUITY: "0", CASH: "0" } }];

describe("A3: simulated rebalancing follows the approved tolerance band (spec §8.2)", () => {
  it("does not trade (no cost) while the drift stays inside the band, unlike the calendar", () => {
    // +20% equity: 60/110 = 54.5% equity, drift 4.5 points < 5.
    expect(portfolioFactors(context("5", true), market("0.2"))[1]).toBe("1");
    expect(new D(portfolioFactors(context(null, true), market("0.2"))[1]).lt(1)).toBe(true);
  });
  it("rebalances and pays the turnover cost once the drift is beyond the band", () => {
    // +30% equity: 65/115 = 56.5% equity, drift 6.5 points > 5.
    expect(new D(portfolioFactors(context("5", false), market("0.3"))[1]).lt(1)).toBe(true);
  });
  it("uses the same trigger as proposeRebalance: at or above the band (>=, spec §8.2)", () => {
    const at = (equity: string) => new Map([["EQUITY", new D(equity)], ["CASH", new D(1).minus(equity)]]);
    expect(bandTriggered(at("0.5499"), split, "5")).toBe(false);
    expect(bandTriggered(at("0.55"), split, "5")).toBe(true);
    expect(bandTriggered(at("0.5501"), split, "5")).toBe(true);
    // An asset held but absent from the targets counts as drift from 0% (exact 5% triggers).
    expect(bandTriggered(new Map([["EQUITY", new D("0.45")], ["CASH", new D("0.5")], ["GOLD", new D("0.05")]]), split, "5")).toBe(true);
    expect(bandTriggered(new Map([["EQUITY", new D("0.451")], ["CASH", new D("0.5")], ["GOLD", new D("0.049")]]), split, "5")).toBe(false);
  });
  it("rebalances on exact 5-point drift in both runPathV5Fast (screenBand) and runPathFrozen bit-identically", () => {
    // 50/50 split: EQUITY +10% -> 55, CASH -10% -> 45 => exact 55%/45% (exact 5.0000...pp drift).
    const exact5Market = [{ cpi: "0", returns: { EQUITY: "0.1", CASH: "-0.1" } }, { cpi: "0", returns: { EQUITY: "0", CASH: "0" } }];
    expect(new D(portfolioFactors(context("5", false), exact5Market)[1]).lt(1)).toBe(true);
    const fastCtx = riskContext(2);
    fastCtx.projection.modelVersion = "retirement-monthly-v5";
    fastCtx.projection.initialCapital = "1000";
    fastCtx.projection.rows = fastCtx.projection.rows.map(r => ({ ...r, livingExpense: "0", withdrawal: "0" }));
    fastCtx.essentialExpenses = ["0", "0"];
    fastCtx.targets = [split, split];
    fastCtx.rebalance = [true, false];
    fastCtx.turnoverCostPercent = "1";
    fastCtx.rebalanceBandPoints = "5";
    const frozenCtx: RiskContext = { ...fastCtx, selection: { ...fastCtx.selection, advisoryFee: { annualPercent: "0", paidFrom: "FUND" } } };
    const fast = runPath(fastCtx, exact5Market);
    const frozen = runPath(frozenCtx, exact5Market);
    // Rebalance triggered at month 1: turnover = 5% of 1000 = 50, cost = 50 * 1% = 0.5 -> balance 999.5.
    expect(fast.fundedTerminalBalance).toBe("999.5");
    expect(frozen).toEqual(fast);
  });
});

const profile = (optional: boolean) => fixtureProfile({
  expenses: { status: "KNOWN", entries: [
    { id: "living", label: "Thiết yếu", category: "ESSENTIAL", amount: known("10000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null },
    ...(optional ? [{ id: "travel", label: "Du lịch", category: "OPTIONAL", amount: known("4000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] : []),
  ] } as never,
} as never) as never;
const selection = { monthlyContribution: "1000000", contributionSchedule: [], endMonth: "2070-12" } as never;
const monthIndex = (m: string) => +m.slice(0, 4) * 12 + +m.slice(5, 7);
/** Fake simulation: each lever passes from a known value; the essential expense must never change. */
const fake = (calls: Variant[]) => async (variant: Variant) => {
  calls.push(variant);
  const expenses = (variant.profile ?? profile(true)) as any;
  expect(expenses.expenses.entries.find((e: any) => e.id === "living").amount.value).toBe("10000000");
  const contribution = Number(variant.selection.monthlyContribution);
  const retirement = variant.selection.whatIf?.retirementMonth;
  const travel = variant.profile ? Number(expenses.expenses.entries.find((e: any) => e.id === "travel")?.amount.value ?? 0) : 4000000;
  const ok = contribution >= 2600000 || (retirement && monthIndex(retirement) - monthIndex("2040-01") >= 30) || travel <= 1000000;
  return { pEssential: ok ? 0.92 : 0.6 };
};
const base = (optional: boolean, calls: Variant[], outOfTime = () => false) => ({ selection, profile: profile(optional), threshold: "0.90",
  retirementMonth: "2040-01", accumulationCapacity: ["5000000", "4500000"], evaluate: fake(calls), outOfTime });

describe("A1/A2: behavioural adjustments reach the threshold on the simulation (spec §7.4 step 4)", () => {
  it("finds the smallest contribution, retirement delay and OPTIONAL cut on the search grid", async () => {
    const calls: Variant[] = [];
    const r = await searchAdjustments(base(true, calls));
    expect(r.status).toBe("READY");
    // 1,000,000 + k x 500,000 >= 2,600,000 -> 3,000,000; above the 4,500,000 minimum capacity? no.
    expect(r.contribution).toMatchObject({ status: "FOUND", requiredMonthlyContribution: "3000000", additionalMonthlyContribution: "2000000", withinCapacityEveryMonth: true, pEssential: 0.92 });
    // 6-month steps: the first delay >= 30 months.
    expect(r.retirement).toMatchObject({ status: "FOUND", delayMonths: 30, retirementMonth: "2042-07" });
    // 5% steps: keep <= 1,000,000 of 4,000,000 -> cut 75%.
    expect(r.optionalSpending).toMatchObject({ status: "FOUND", cutPercent: 75, keepPercent: 25, monthlyOptionalToday: "4000000", monthlyCutToday: "3000000" });
    expect(r.evaluations).toBe(calls.length);
  });
  it("never offers a cut of essential spending when no optional spending is declared", async () => {
    const r = await searchAdjustments(base(false, []));
    expect(r.optionalSpending).toMatchObject({ status: "NOT_APPLICABLE", issues: ["NO_OPTIONAL_SPENDING_DECLARED"], evaluations: 0 });
  });
  it("reports NOT_FEASIBLE when even the largest step fails, after a single probe", async () => {
    const r = await searchAdjustments({ ...base(true, []), evaluate: async () => ({ pEssential: 0.5 }) });
    expect(r.status).toBe("NOT_FEASIBLE");
    expect(r.contribution).toMatchObject({ status: "NOT_FEASIBLE", evaluations: 1, issues: ["THRESHOLD_NOT_REACHED_WITHIN_CAPACITY"] });
    expect(r.optionalSpending).toMatchObject({ status: "NOT_FEASIBLE", evaluations: 1 });
  });
  it("marks levers unfinished when the run budget is spent, never guessing a value", async () => {
    let left = 2;
    const r = await searchAdjustments(base(true, [], () => left-- <= 0));
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.contribution.requiredMonthlyContribution).toBeNull();
    expect(r.retirement).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["ADJUSTMENT_RUNTIME_LIMIT"] });
  });
  it("B1-2: defers FLEXIBLE deferrable goals in 6-month steps up to 60 months, never shifting ESSENTIAL or non-deferrable goals", async () => {
    const baseProf = profile(false) as any;
    expect((await searchAdjustments(base(false, []))).deferFlexibleGoals).toMatchObject({ status: "NOT_APPLICABLE", issues: ["NO_DEFERRABLE_GOAL"], evaluations: 0 });
    const withGoals = {
      ...baseProf,
      goals: {
        status: "KNOWN",
        entries: [
          { id: "ess-goal", label: "Học phí", amountToday: known("100000000"), dueMonth: known("2028-10"), priority: known("ESSENTIAL"), deferrable: { status: "KNOWN", value: true } },
          { id: "flex-fixed", label: "Không lùi", amountToday: known("100000000"), dueMonth: known("2028-10"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: false } },
          { id: "flex-defer", label: "Mua xe", amountToday: known("300000000"), dueMonth: known("2029-10"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } },
        ],
      },
    };
    const r = await searchAdjustments({
      ...base(false, []),
      profile: withGoals,
      evaluate: async variant => {
        const g = (variant.profile ?? withGoals).goals.entries;
        expect(g.find((x: any) => x.id === "ess-goal").dueMonth.value).toBe("2028-10");
        expect(g.find((x: any) => x.id === "flex-fixed").dueMonth.value).toBe("2028-10");
        const shifted = g.find((x: any) => x.id === "flex-defer").dueMonth.value;
        return { pEssential: monthIndex(shifted) - monthIndex("2029-10") >= 30 ? 0.92 : 0.65 };
      },
    });
    expect(r.status).toBe("READY");
    expect(r.deferFlexibleGoals).toMatchObject({
      status: "FOUND", deferMonths: 30, pEssential: 0.92, deferredGoalIds: ["flex-defer"],
      shiftedGoals: [{ id: "flex-defer", fromMonth: "2029-10", toMonth: "2032-04" }],
    });
    const fail = await searchAdjustments({ ...base(false, []), profile: withGoals, evaluate: async () => ({ pEssential: 0.5 }) });
    expect(fail.deferFlexibleGoals).toMatchObject({ status: "NOT_FEASIBLE", issues: ["THRESHOLD_NOT_REACHED_WITHIN_GOAL_DEFER_LIMIT"] });
  });
});
