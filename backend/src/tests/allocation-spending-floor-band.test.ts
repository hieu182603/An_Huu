import { describe, expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { portfolioFactors, runPath, simulate, type PathMarket, type RiskContext } from "../modules/allocation-risk/simulation";
import { riskContext, marketFixture } from "./allocation-risk-fixtures";

function context(months = 2, enabled = true): RiskContext {
  const result = riskContext(months);
  result.projection = { ...result.projection, modelVersion: "retirement-monthly-v5", valuationDate: "2026-12-01",
    retirementMonth: "2027-01", rows: result.projection.rows.map((row, i) => ({ ...row, month: addMonths("2026-12", i),
      livingExpense: "0", withdrawal: "0" })) };
  result.essentialExpenses = result.projection.rows.map(() => "0");
  result.targets = result.projection.rows.map((_, i) => [
    { assetClass: "CASH", weightPercent: i ? "53" : "50" },
    { assetClass: "EQUITY", weightPercent: i ? "47" : "50" },
  ]);
  // Ordinary calendar boundaries cannot override the approved band by themselves.
  result.rebalance = result.projection.rows.map(() => true);
  result.rebalanceBandPoints = "5";
  result.turnoverCostPercent = "0";
  if (enabled) result.spendingFloor = { safeAssets: ["CASH"], minSafeFraction: "0.53" };
  return result;
}
const market = (...equity: string[]): PathMarket[] => equity.map(value => ({ cpi: "0", returns: { CASH: "0", EQUITY: value } }));
const feePath = (input: RiskContext): RiskContext => ({ ...input,
  selection: { ...input.selection, advisoryFee: { annualPercent: "0", paidFrom: "FUND" } } });

describe("B7-6 spending floor overrides the tolerance band in simulated holdings", () => {
  it("enforces a three-point safe floor at the actual retirement month in both v5 paths", () => {
    const input = context(), returns = market("0", "1");
    const fast = runPath(input, returns), withFee = runPath(feePath(input), returns);
    expect(fast.balances).toEqual(["1000", "1470"]);
    expect(withFee).toEqual(fast);
    expect(runPath(context(2, false), returns).fundedTerminalBalance).toBe("1500");
  });

  it("restores a later floor breach even when the drift remains below five points", () => {
    const input = context(3), returns = market("0", "0.1", "0.1");
    const fast = runPath(input, returns);
    // Jan: 470 equity earns 10%, cash remains 530 => 1047. Feb: restore cash to
    // 53% (554.91), then equity 492.09 earns 10% => 1096.209.
    expect(fast.balances).toEqual(["1000", "1047", "1096.209"]);
    expect(runPath(feePath(input), returns)).toEqual(fast);
  });

  it("does not activate the floor before retirement or alter a frozen v3 path", () => {
    const input = context(3), returns = market("0.02", "0", "0");
    const baseline = context(3, false);
    expect(runPath(input, returns).balances[0]).toBe(runPath(baseline, returns).balances[0]);
    input.projection.modelVersion = baseline.projection.modelVersion = "retirement-monthly-v3";
    expect(runPath(input, returns)).toEqual(runPath(baseline, returns));
  });

  it("enforces the same floor in a v5 path that uses calendar factors without a band", () => {
    const input = context(3), returns = market("0", "0.1", "0.1");
    input.rebalanceBandPoints = null;
    input.rebalance = [true, true, false];
    expect(new D(portfolioFactors(input, returns)[2]).minus("1.047").abs().lt("1e-40")).toBe(true);
    expect(runPath(input, returns).fundedTerminalBalance).toBe("1096.209");
  });

  it("keeps floor-enforced and ordinary simulations in separate progressive cache entries", async () => {
    const enabled = context(3), disabled = context(3, false), data = marketFixture();
    // Fixed historical returns isolate the cash-floor effect across every sampled path.
    data.rows = data.rows.map(row => ({ ...row, cpi: "0", returns: { ...row.returns, CASH: "0", EQUITY: "0.02" } }));
    enabled.projection.rows[2].livingExpense = disabled.projection.rows[2].livingExpense = "1020";
    enabled.essentialExpenses[2] = disabled.essentialExpenses[2] = "1020";
    const policy = { evidence: "Synthetic floor-cache regression", blockMonths: 12, cvarAlpha: "0.95" };
    const off = await simulate(disabled, data, policy, 1);
    const on = await simulate(enabled, data, policy, 1);
    expect(off.status).toBe("READY"); expect(on.status).toBe("READY");
    if (off.status !== "READY" || on.status !== "READY") throw Error("Expected completed synthetic paths");
    // Before February's withdrawal, the ordinary path has 1020.2, while restoring
    // the safe floor in January left 1019.494. The same cash obligation separates them.
    expect(off.pEssential).toBe(1);
    expect(on.pEssential).toBe(0);
  });
});
