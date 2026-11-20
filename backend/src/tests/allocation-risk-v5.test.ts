import { describe, expect, it } from "vitest";
import { RetirementDecimal as D, projectRetirement } from "../modules/retirement/engine";
import { runPath, portfolioFactors, portfolioCosts } from "../modules/allocation-risk/simulation";
import { riskContext } from "./allocation-risk-fixtures";

const v5 = (months: number) => { const c = riskContext(months); c.projection.modelVersion = "retirement-monthly-v5"; return c; };
const flat = (months: number, equity = "0", cpi = "0") => Array.from({ length: months }, () => ({ cpi, returns: { CASH: "0", EQUITY: equity } }));
const close = (a: string, b: string) => expect(new D(a).minus(b).abs().lt("1e-30")).toBe(true);

describe("allocation simulation follows the plan's retirement model (B1)", () => {
  it("v5 funded balances are lower or equal than v3 on the same positive market path", () => {
    const market = Array.from({ length: 12 }, () => ({ cpi: "0", returns: { CASH: "0.01", EQUITY: "0.03" } }));
    const c3 = riskContext(12), c5 = v5(12); c3.projection.initialCapital = c5.projection.initialCapital = "5000";
    const a = runPath(c3, market), b = runPath(c5, market);
    b.balances.forEach((v, i) => expect(new D(v).lte(a.balances[i])).toBe(true));
    expect(new D(b.fundedTerminalBalance).lt(a.fundedTerminalBalance)).toBe(true);
  });
  it("charges the trading cost after the withdrawal in v5 and keeps it inside growth in v3", () => {
    const market = flat(2, "0.2");
    const c3 = riskContext(2), c5 = v5(2);
    c3.turnoverCostPercent = c5.turnoverCostPercent = "1"; c3.rebalance = c5.rebalance = [true, true];
    const f3 = portfolioFactors(c3, market), f5 = portfolioFactors(c5, market), cost = portfolioCosts(c5, market);
    expect(cost[0]).toBe("0"); expect(new D(cost[1]).gt(0)).toBe(true);
    close(f3[1], new D(f5[1]).mul(new D(1).minus(cost[1])).toFixed());
    // Hand-computed: x0 = 1000-100, funded0 = x0*g0; x1 = funded0-100, K1 = x1*c1, funded1 = (x1-K1)*g1.
    const x1 = new D(900).mul(f5[0]).minus(100);
    const expected = x1.minus(x1.mul(cost[1])).mul(f5[1]);
    close(runPath(c5, market).fundedTerminalBalance, expected.toFixed());
    // v5 path equals the v5 kernel fed the same rows (cost passed as tradingCostRate, gross growth).
    const rows = c5.projection.rows.map((r, i) => ({ ...r, growthFactor: f5[i], tradingCostRate: cost[i] }));
    close(runPath(c5, market).fundedTerminalBalance, projectRetirement({ ...c5.projection, rows }).summary.fundedTerminalBalance);
  });
  it("computes the essential loss from the fund available at the start of the month in v5", () => {
    const c = v5(3); c.projection.initialCapital = "150"; c.essentialExpenses = ["60", "60", "60"];
    const r = runPath(c, flat(3));
    // Shortfall 50 (fund 50 vs 100) -> essential part 60-50 = 10; then 100 with an empty fund -> 60.
    expect(r.unfundedWithdrawals).toBe("150"); expect(r.essentialLossToday).toBe("70"); expect(r.funded).toBe(false);
    expect(r.balances).toEqual(["50", "0", "0"]);
  });
  it("leaves a v3 context unchanged: end-of-month withdrawal, cost folded into growth", () => {
    const c = riskContext(3); c.projection.initialCapital = "150"; c.essentialExpenses = ["60", "60", "60"];
    const r = runPath(c, flat(3)), kernel = projectRetirement(c.projection);
    expect(r.fundedTerminalBalance).toBe(kernel.summary.fundedTerminalBalance);
    expect(r.unfundedWithdrawals).toBe(kernel.summary.unfundedWithdrawals);
    expect(portfolioFactors(c, flat(2, "0.2"))[0]).toBe("1.1");
    expect(c.projection.rows.every(row => !("tradingCostRate" in row))).toBe(true);
  });
});
