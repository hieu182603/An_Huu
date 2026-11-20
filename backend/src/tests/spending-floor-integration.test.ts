import { describe, expect, it } from "vitest";
import { prepareRetirement } from "../modules/retirement/prepare";
import { buildSpendingFloor } from "../modules/retirement/spending-floor";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { portfolioDocumentV2Schema } from "../modules/portfolios/schema";
import { glidePortfolioFixture } from "./portfolio-fixtures";
import { retirementConfiguration, retirementCommand, retirementProfile } from "./retirement-fixtures";
import { empty, fixtureAsset, known } from "./profile-v2-fixtures";

function fixture(years?: number) {
  const profile = retirementProfile(), { assumptions } = retirementConfiguration();
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("10000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
  profile.expenses = { status: "KNOWN", entries: [{ id: "essential", label: "Synthetic essential expense", category: "ESSENTIAL", amount: known("100"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] };
  profile.goals = empty();
  profile.lossTolerance = { inputMode: "PERCENT", percent: known("100"), reaction: known("HOLD") };
  assumptions.returns = assumptions.returns.map(row => ({ ...row, rate: { type: "EFFECTIVE_ANNUAL", percent: row.assetClass === "STOCK" ? "12" : "0" } }));
  const base = glidePortfolioFixture();
  const policy = portfolioDocumentV2Schema.parse({ ...base,
    templates: base.templates.map(t => ({ ...t, rebalance: { ...t.rebalance, everyMonths: 12 }, glidePath: { ...t.glidePath,
      ...(years === undefined ? {} : { spendingFloorYears: years }),
      points: t.glidePath.points.map(p => ({ ...p, allocations: [{ assetClass: "BOND", weightPercent: "10" }, { assetClass: "STOCK", weightPercent: "90" }] })) } })),
    lossStress: { evidence: "Synthetic test loss stress", equityAssetClass: "STOCK", depositAssetClass: "BOND", shocks: [{ assetClass: "STOCK", percent: "-20" }, { assetClass: "BOND", percent: "-2" }] },
    customization: { evidence: "Synthetic test-only bounds", path: "FOLLOW_TEMPLATE_SHIFTS", capitalBasis: "PROTECTED_CAPITAL_V1",
      bounds: [{ assetClass: "BOND", minPercent: "0", maxPercent: "80" }, { assetClass: "STOCK", minPercent: "20", maxPercent: "100" }] },
  });
  const command = { ...retirementCommand(), endMonth: "2028-12", monthlyExpenseToday: "500", monthlyContribution: "0", templateId: "CAUTIOUS" };
  return { profile, assumptions, policy, command };
}
const safeWeight = (row: { holdings: Array<{ assetClass: string; startWeightPercent: string }> }) => new D(row.holdings.find(h => h.assetClass === "BOND")!.startWeightPercent);

describe("B7-6 spending floor in real retirement preparation", () => {
  it("rebalances at the exact retirement month and changes the actual projected growth", () => {
    const off = fixture(), on = fixture(1);
    const before = prepareRetirement(off.profile, off.command, off.policy, off.assumptions);
    const result = prepareRetirement(on.profile, on.command, on.policy, on.assumptions);
    expect(before.status).toBe("READY"); expect(result.status).toBe("READY");
    if (!result.calculation || !before.calculation || !result.replayInput) throw Error("Expected ready preparation");
    const rows = result.calculation.marketRows;
    // The existing glide year was already zero in Oct 2026. The floor must wait until Jan 2027.
    expect(rows.slice(0, 3)).toEqual(before.calculation.marketRows.slice(0, 3));
    const retirement = rows.find(r => r.month === "2027-01")!;
    expect(retirement.rebalanced).toBe(true);
    expect(safeWeight(retirement).minus(new D(6000).div(9400).mul(100)).abs().lt("1e-40")).toBe(true);
    expect(new D(result.replayInput.rows[3].growthFactor).lt(before.replayInput!.rows[3].growthFactor)).toBe(true);
    expect(result.calculation.summary.unfundedWithdrawals).not.toBe(before.calculation.summary.unfundedWithdrawals);
  });

  it("applies after customer shifts and respects the policy's maximum safe weight", () => {
    const f = fixture(1);
    const command = { ...f.command, monthlyExpenseToday: "1000", allocationFunding: "PROTECTED_CAPITAL_V1" as const,
      customAllocation: { model: "custom-glide-v1" as const, weights: [{ assetClass: "BOND", weightPercent: "10" }, { assetClass: "STOCK", weightPercent: "90" }] } };
    const result = prepareRetirement(f.profile, command, f.policy, f.assumptions);
    expect(result.status).toBe("READY");
    if (!result.calculation) throw Error(JSON.stringify(result.issues));
    expect(safeWeight(result.calculation.marketRows.find(r => r.month === "2027-01")!).toFixed()).toBe("80");
    expect(result.calculation.marketRows.filter(r => r.month >= "2027-01").every(r => safeWeight(r).lte(80))).toBe(true);
  });

  it("discounts selected essential extras to valuation and excludes optional spending", () => {
    const f = fixture(1);
    f.profile.personal.desiredRetirementMonth = known("2027-10");
    f.assumptions.returns = f.assumptions.returns.map(row => ({ ...row, rate: { type: "EFFECTIVE_ANNUAL", percent: row.assetClass === "BOND" ? "12" : "0" } }));
    if (f.profile.expenses.status !== "KNOWN") throw Error("Expected expenses");
    f.profile.expenses.entries[0].amount = known("0");
    f.profile.expenses.entries.push({ id: "essential-once", label: "Essential due in one year", category: "ESSENTIAL", amount: known("112"), currency: "VND", frequency: "ONCE", startMonth: "2027-10", endMonth: "2027-10" },
      { id: "optional", label: "Optional spending", category: "OPTIONAL", amount: known("10000"), currency: "VND", frequency: "ONCE", startMonth: "2027-10", endMonth: "2027-10" });
    const command = { ...f.command, monthlyExpenseToday: "0", retirementAdditionalExpenseIds: ["essential-once", "optional"] };
    const prepared = prepareRetirement(f.profile, command, f.policy, f.assumptions);
    expect(prepared.status).toBe("READY");
    if (!prepared.replayInput) throw Error(JSON.stringify(prepared.issues));
    const floor = buildSpendingFloor(f.profile, command, f.policy, f.assumptions, prepared.replayInput, "CAUTIOUS");
    if (floor.status !== "READY") throw Error(JSON.stringify(floor));
    expect(new D(floor.input.essentialSpendingPV).minus(100).abs().lt("1e-40")).toBe(true);
    expect(floor.input.safeAssets).toEqual(["BOND"]);
    expect(floor.input.growthCapital).toBe("10000");
  });

  it("fails clearly when an enabled N-year reserve lacks cashflow coverage", () => {
    const f = fixture(2);
    const result = prepareRetirement(f.profile, { ...f.command, endMonth: "2027-12" }, f.policy, f.assumptions);
    expect(result).toMatchObject({ status: "INCOMPLETE", issues: [{ path: "glidePath.spendingFloorYears", code: "SPENDING_FLOOR_CASHFLOW_COVERAGE_REQUIRED" }] });
  });

  it("fails clearly without a policy-identified deposit's assumptions", () => {
    const f = fixture(1), prepared = prepareRetirement(f.profile, f.command, f.policy, f.assumptions);
    if (!prepared.replayInput) throw Error("Expected ready baseline");
    const policy = { ...f.policy, lossStress: undefined, customization: undefined };
    expect(buildSpendingFloor(f.profile, f.command, policy, f.assumptions, prepared.replayInput, "CAUTIOUS")).toMatchObject({ status: "INCOMPLETE", issues: [{ code: "SPENDING_FLOOR_DEPOSIT_ASSUMPTIONS_REQUIRED" }] });
  });

  it("is a complete no-op for frozen v3 preparation even when policy requests a floor", () => {
    const off = fixture(), on = fixture(1);
    const before = prepareRetirement(off.profile, off.command, off.policy, off.assumptions, undefined, "retirement-monthly-v3");
    const after = prepareRetirement(on.profile, on.command, on.policy, on.assumptions, undefined, "retirement-monthly-v3");
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});
