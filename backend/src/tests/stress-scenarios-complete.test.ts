import { describe, expect, it } from "vitest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { deterministicScenarios, deterministicStress, sequenceOfReturns } from "../modules/allocation-risk/stresses";
import { runPath } from "../modules/allocation-risk/simulation";
import { riskContext } from "./allocation-risk-fixtures";

function fixture(months = 72) {
  const context = riskContext(months);
  context.projection.initialCapital = "10000";
  context.projection.modelVersion = "retirement-monthly-v5";
  context.projection.retirementMonth = "2027-01";
  context.targets = context.targets.map(() => [{ assetClass: "EQUITY", weightPercent: "100" }]);
  const market = context.projection.rows.map(() => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }));
  return { context, market };
}
const policy = (stresses: unknown) => riskPolicySchema.parse({ evidence: "Synthetic test parameters only", stresses });

describe("B6-2 equity timing and worst household outcome", () => {
  it("accepts explicit unique timing arrays and keeps the legacy scalar policy intact", () => {
    const scalar = { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-35" };
    expect(policy({ EQUITY_CRASH: scalar }).stresses!.EQUITY_CRASH).toEqual(scalar);
    expect(policy({ EQUITY_CRASH: { offsetsMonths: [-12, 0, 12, 24], assetClass: "EQUITY", shockPercent: "-35" } }).stresses!.EQUITY_CRASH!.offsetMonths).toBeUndefined();
    expect(() => policy({ EQUITY_CRASH: { offsetsMonths: [0, 0], assetClass: "EQUITY", shockPercent: "-35" } })).toThrow();
    expect(() => policy({ EQUITY_CRASH: { assetClass: "EQUITY", shockPercent: "-35" } })).toThrow();
  });

  it("runs every configured offset, matches offset zero exactly, and selects the worst outcome", () => {
    const { context, market } = fixture();
    const before = JSON.stringify([context, market]);
    const scalar = policy({ EQUITY_CRASH: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-35" } });
    const configured = policy({ EQUITY_CRASH: { offsetsMonths: [-12, 0, 12, 24], assetClass: "EQUITY", shockPercent: "-35", severeShockPercent: "-50" } });
    const one = deterministicStress("EQUITY_CRASH", context, market, scalar);
    const rows = deterministicScenarios(context, market, configured).filter(r => r.kind === "EQUITY_CRASH");
    expect(rows).toHaveLength(2);
    const summary = rows[0];
    expect(summary.status).toBe("READY");
    expect(summary.offsets!.map(r => r.offsetMonths)).toEqual([-12, 0, 12, 24]);
    expect(summary.offsets!.find(r => r.offsetMonths === 0)!.result).toEqual(one.result);
    if (summary.status !== "READY") throw Error("Expected ready equity summary");
    for (const offset of summary.offsets!) if (offset.status === "READY") {
      expect(new D(summary.result.essentialLossToday).gte(offset.result.essentialLossToday)).toBe(true);
      expect(new D(summary.result.fundedTerminalBalance).lte(offset.result.fundedTerminalBalance)).toBe(true);
    }
    expect(rows[1].level).toBe("SEVERE");
    expect(rows[1].offsets).toHaveLength(4);
    expect(JSON.stringify([context, market])).toBe(before);
  });

  it("exposes out-of-horizon offsets instead of silently dropping them", () => {
    const { context, market } = fixture();
    const result = deterministicStress("EQUITY_CRASH", context, market,
      policy({ EQUITY_CRASH: { offsetsMonths: [-24, 0], assetClass: "EQUITY", shockPercent: "-35" } }));
    expect(result.status).toBe("READY");
    expect(result.offsets![0]).toMatchObject({ offsetMonths: -24, status: "REVIEW_REQUIRED", firstShortfallMonth: null });
    expect(result.issues).toContain("SOME_SCENARIO_OFFSETS_OUTSIDE_PLAN_HORIZON");
  });
});

describe("B6-3 same returns in two retirement sequences", () => {
  const configured = policy({ SEQUENCE_OF_RETURNS: { assetClass: "EQUITY", annualLossPercent: "-20", annualGainPercent: "25" } });
  it("is off without approved parameters and requires a complete five-year window", () => {
    const { context, market } = fixture(36);
    expect(deterministicStress("SEQUENCE_OF_RETURNS", context, market, undefined)).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["APPROVED_SCENARIO_PARAMETERS_REQUIRED"] });
    expect(deterministicStress("SEQUENCE_OF_RETURNS", context, market, configured)).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["SEQUENCE_WINDOW_REQUIRES_FIVE_YEARS"] });
  });
  it("compares two orders of the same annual blocks while leaving cashflows unchanged", () => {
    const { context, market } = fixture();
    const before = JSON.stringify([context, market]);
    const result = deterministicStress("SEQUENCE_OF_RETURNS", context, market, configured);
    if (result.status !== "READY") throw Error("Expected ready sequence");
    const [loss, gain] = result.orders!;
    expect([...loss.annualReturns].sort()).toEqual([...gain.annualReturns].sort());
    const factor = (returns: string[]) => returns.reduce((value, r) => value.mul(new D(1).plus(r)), new D(1));
    expect(factor(loss.annualReturns).minus(factor(gain.annualReturns)).abs().lt("1e-25")).toBe(true);
    expect(new D(result.result.balanceDifference!).gt(0)).toBe(true);
    expect(result.result.lossFirstTerminalBalance).toBe(loss.result.fundedTerminalBalance);
    expect(result.result.gainFirstTerminalBalance).toBe(gain.result.fundedTerminalBalance);
    expect(JSON.stringify([context, market])).toBe(before);
  });
  it("has no material sequence difference without withdrawals or contributions", () => {
    const { context, market } = fixture();
    context.projection.rows.forEach(r => { r.livingExpense = "0"; r.withdrawal = "0"; });
    context.essentialExpenses.fill("0");
    const result = deterministicStress("SEQUENCE_OF_RETURNS", context, market, configured);
    if (result.status !== "READY") throw Error("Expected ready sequence");
    expect(new D(result.result.balanceDifference!).abs().lt("1e-25")).toBe(true);
  });
  it("preserves the spec example of 775M versus 820M", () => {
    expect(sequenceOfReturns("1000000000", "100000000", ["-0.20", "0.25"]).fundedBalance).toBe("775000000");
    expect(sequenceOfReturns("1000000000", "100000000", ["0.25", "-0.20"]).fundedBalance).toBe("820000000");
  });
});

describe("B6-4 gold liquidation spread range", () => {
  it("runs both 5 and 10 points and preserves the old 5-point result", () => {
    const { context, market } = fixture();
    const gold = { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-10" };
    const old = deterministicStress("GOLD", context, market, policy({ GOLD: { ...gold, spreadPoints: "5" } }));
    const rows = deterministicScenarios(context, market, policy({ GOLD: { ...gold, spreadPoints: [5, 10] } })).filter(r => r.kind === "GOLD");
    expect(rows).toHaveLength(2);
    expect(rows[0].result).toEqual(old.result);
    expect(rows[0].level).toBeUndefined();
    expect(rows[1]).toMatchObject({ level: "SEVERE", parameters: { spreadPoints: 10 } });
    if (rows[0].status !== "READY" || rows[1].status !== "READY") throw Error("Expected gold ready");
    expect(new D(rows[1].result.fundedTerminalBalance).lt(rows[0].result.fundedTerminalBalance)).toBe(true);
    expect(() => policy({ GOLD: { ...gold, spreadPoints: [5, "5"] } })).toThrow();
  });
});

describe("B6-5 income loss during the remaining accumulation period", () => {
  it("moves a past start to valuation and clips the window at retirement", () => {
    const { context, market } = fixture(12);
    context.projection.retirementMonth = "2026-04";
    context.projection.rows.forEach(r => {
      r.income = r.month < "2026-04" ? "200" : "0";
      r.plannedContribution = r.month < "2026-04" ? "100" : "0";
    });
    const baseline = runPath(context, market);
    const result = deterministicStress("INCOME_LOSS", context, market,
      policy({ INCOME_LOSS: { offsetMonths: -12, durationMonths: 12, lostPercent: "50" } }));
    expect(result).toMatchObject({ status: "READY", windowAdjusted: true, window: { from: "2026-01", to: "2026-03" } });
    if (result.status !== "READY") throw Error("Expected ready income scenario");
    expect(new D(baseline.fundedTerminalBalance).minus(result.result.fundedTerminalBalance).toFixed()).toBe("300");
  });
  it("does not stress working income once no accumulation month remains", () => {
    const { context, market } = fixture(12);
    context.projection.retirementMonth = "2026-01";
    const result = deterministicStress("INCOME_LOSS", context, market,
      policy({ INCOME_LOSS: { offsetMonths: -24, durationMonths: 12, lostPercent: "50" } }));
    expect(result).toMatchObject({ status: "NOT_APPLICABLE", issues: ["NO_ACCUMULATION_MONTHS"], firstShortfallMonth: null });
  });
  it("keeps an existing in-horizon accumulation window unchanged", () => {
    const { context, market } = fixture(12);
    context.projection.retirementMonth = "2026-10";
    const result = deterministicStress("INCOME_LOSS", context, market,
      policy({ INCOME_LOSS: { offsetMonths: -8, durationMonths: 2, lostPercent: "50" } }));
    expect(result).toMatchObject({ status: "READY", window: { from: "2026-02", to: "2026-03" } });
    expect(result.windowAdjusted).toBeUndefined();
  });
});

describe("B6-6 essential healthcare shortfalls", () => {
  it("counts the configured medical inflation expense as an essential deficit", () => {
    const { context, market } = fixture(1);
    context.projection.retirementMonth = "2026-01";
    context.projection.initialCapital = "100";
    const result = deterministicStress("HIGH_INFLATION", context, market,
      policy({ HIGH_INFLATION: { offsetMonths: 0, durationMonths: 1, annualDeltaPoints: "6", healthDeltaPoints: "120" } }),
      undefined, undefined, undefined, undefined, { healthExpenses: ["100"] });
    if (result.status !== "READY") throw Error("Expected ready healthcare scenario");
    expect(result.result.unfundedWithdrawals).toBe("10");
    expect(result.result.essentialLossToday).toBe("10");
  });
  it("counts late-life care from age 75 as essential spending", () => {
    const { context, market } = fixture(1);
    context.projection.retirementMonth = "2026-01";
    context.projection.initialCapital = "100";
    const result = deterministicStress("LONGEVITY", context, market,
      policy({ LONGEVITY: { extraYears: [5], lateLifeCareMonthly: "50" } }),
      undefined, 5, undefined, undefined, { birthMonth: "1951-01" });
    if (result.status !== "READY") throw Error("Expected ready care scenario");
    // Every remaining essential withdrawal must be counted, including care in the first month.
    expect(result.result.unfundedWithdrawals).toBe("9050");
    expect(result.result.essentialLossToday).toBe("9050");
  });
});
