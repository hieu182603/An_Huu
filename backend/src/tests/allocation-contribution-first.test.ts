// Spec 8.2 in the Monte Carlo: step 1 direct deposits to underweight assets, step 2 trade (with cost) only if still outside the band.
import { describe, expect, it } from "vitest";
import { RetirementDecimal as D, projectRetirement } from "../modules/retirement/engine";
import { projectRetirementV5 } from "../modules/retirement/engine-v5";
import { contributionFirstHook, portfolioCosts, portfolioFactors, runPath, type RiskContext } from "../modules/allocation-risk/simulation";
import { proposeRebalance } from "../modules/allocation-risk/rebalance";
import { riskContext } from "./allocation-risk-fixtures";

const close = (a: unknown, b: unknown) => expect(new D(String(a)).minus(String(b)).abs().lt("1e-30")).toBe(true);
const pair = (c: string, e: string) => [{ assetClass: "CASH", weightPercent: c }, { assetClass: "EQUITY", weightPercent: e }];
const hookOf = (targets: ReturnType<typeof pair>[], band: string | null, cost = "1") => {
  const context = riskContext(targets.length);
  context.projection.modelVersion = "retirement-monthly-v5"; context.targets = targets; context.turnoverCostPercent = cost; context.rebalanceBandPoints = band;
  return { context, hook: contributionFirstHook(context, targets.map(() => ({ cpi: "0", returns: {} }))) };
};
const month = (index: number, p: { opening: string; start?: string; withdrawal?: string; end?: string }) => {
  const opening = new D(p.opening), start = new D(p.start ?? 0), withdrawal = new D(p.withdrawal ?? 0);
  return { index, opening, startDeposit: start, withdrawal, x: D.max(0, opening.plus(start).minus(withdrawal)), endDeposit: new D(p.end ?? 0), capitalInjection: new D(0) };
};
/** Two-asset path: month 0 at target, EQUITY returns `up`, then a deposit at month end, then month 1 decides trade or not. */
function twoMonths(band: string, deposit: string, up = "0.3") {
  const targets = [pair("50", "50"), pair("50", "50")], context = riskContext(2);
  context.projection.modelVersion = "retirement-monthly-v5"; context.targets = targets; context.turnoverCostPercent = "1"; context.rebalanceBandPoints = band;
  const market = [{ cpi: "0", returns: { CASH: "0", EQUITY: up } }, { cpi: "0", returns: { CASH: "0", EQUITY: "0" } }];
  const hook = contributionFirstHook(context, market);
  const m0 = hook(month(0, { opening: "1000", end: deposit })), opening1 = new D(1000).mul(m0.growthFactor).plus(deposit);
  const m1 = hook(month(1, { opening: opening1.toFixed() }));
  return { m0, m1, opening1 };
}

describe("contribution-first rebalancing in the simulation (spec 8.2)", () => {
  it("a deposit fills the underweight asset and avoids the trade when it brings drift inside the band", () => {
    // 500/650 (56.5% equity, drift 6.5 > 5). Without a deposit month 1 trades: half-L1 = 75, cost 1% = 0.75 of 1150.
    const none = twoMonths("5", "0");
    close(none.m1.tradingCostRate, new D("0.75").div(1150));
    // 100 to CASH: 600/650, drift 2 <= 5 -> no trade, no cost.
    const funded = twoMonths("5", "100");
    expect(funded.m1.tradingCostRate.toFixed()).toBe("0");
  });
  it("still trades when the deposit is not enough, only on what remains after the deposit", () => {
    // deposit 20 -> 520/650 of 1170: equity 55.56%, drift 5.56 > 5; target 585 each -> half-L1 = 65, cost 0.65.
    const r = twoMonths("5", "20");
    close(r.m1.tradingCostRate, new D("0.65").div(1170));
  });
  it("directs a start-of-month deposit to deficits before the month's return", () => {
    // Month 0: 500/500 at target. Month 1 targets 40/60: deposit 200 at start. total 1200 -> target CASH 480 / EQUITY 720;
    // deficits CASH 0 (500 >= 480), EQUITY 220 > 200 -> all 200 to EQUITY: 500/700. Pro-rata would give 600/600.
    const returnRow = { cpi: "0", returns: { CASH: "0", EQUITY: "0.1" } };
    const ctx = hookOf([pair("50", "50"), pair("40", "60")], "100").context;
    const h2 = contributionFirstHook(ctx, [{ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }, returnRow]);
    h2(month(0, { opening: "1000" }));
    const m = h2(month(1, { opening: "1000", start: "200" }));
    close(m.growthFactor, new D(500).plus(new D(700).mul("1.1")).div(1200));
  });
  it("takes withdrawals pro-rata to current holdings", () => {
    const ctx = hookOf([pair("60", "40"), pair("60", "40")], "100").context;
    const h = contributionFirstHook(ctx, [{ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }, { cpi: "0", returns: { CASH: "0", EQUITY: "0.1" } }]);
    h(month(0, { opening: "1000" }));
    // 600/400, withdraw 100 -> 540/360 (same weights), no trade; factor = (540 + 360*1.1)/900 = 1.04.
    const m = h(month(1, { opening: "1000", withdrawal: "100" }));
    close(m.growthFactor, "1.04"); expect(m.tradingCostRate.toFixed()).toBe("0");
  });
  it("matches the cash allocation of proposeRebalance on the same numbers", () => {
    const abc = (a: string, b: string, c: string) => [{ assetClass: "A", weightPercent: a }, { assetClass: "B", weightPercent: b }, { assetClass: "C", weightPercent: c }];
    const ctx = hookOf([abc("30", "40", "30"), abc("40", "30", "30")], "100", "0").context;
    const market = [{ cpi: "0", returns: { A: "0", B: "0", C: "0" } }, { cpi: "0", returns: { A: "0.1", B: "0", C: "0" } }];
    const h = contributionFirstHook(ctx, market);
    h(month(0, { opening: "1000" })); // holdings A 300 / B 400 / C 300
    const m = h(month(1, { opening: "1000", start: "200" }));
    const plan = proposeRebalance({ policyVersionId: "00000000-0000-4000-8000-000000000000", templateId: "t", month: "2026-02", retirementMonth: "2026-12",
      holdings: [{ assetClass: "A", value: "300", maturedAmount: "0" }, { assetClass: "B", value: "400", maturedAmount: "0" }, { assetClass: "C", value: "300", maturedAmount: "0" }],
      newContribution: "200" }, abc("40", "30", "30"), "0", "0");
    expect(plan.status).toBe("PROPOSED");
    const cash = Object.fromEntries((plan as { trades: { assetClass: string; cashAllocated: string }[] }).trades.map(t => [t.assetClass, new D(t.cashAllocated)]));
    close(cash.A, 150); close(cash.B, 0); close(cash.C, 50);
    // holdings after cash = [450, 400, 350]; A returns +10%.
    close(m.growthFactor, new D(450).mul("1.1").plus(400).plus(350).div(1200));
  });
  it("kernel without hook is unchanged, and a hook echoing the row values reproduces it", () => {
    const c = riskContext(6); c.projection.modelVersion = "retirement-monthly-v5";
    const rows = c.projection.rows.map((r, i) => ({ ...r, growthFactor: i % 2 ? "1.02" : "0.99", tradingCostRate: i % 3 ? "0.001" : "0", contribution: i < 3 ? "20" : "0" }));
    const input = { ...c.projection, retirementMonth: "2026-04", rows };
    const plain = projectRetirementV5(input as never);
    const echoed = projectRetirementV5(input as never, ({ index }) => ({ growthFactor: new D(rows[index].growthFactor), tradingCostRate: new D(rows[index].tradingCostRate) }));
    expect(JSON.stringify(echoed)).toBe(JSON.stringify(plain));
    expect(JSON.stringify(projectRetirement(input as never))).toBe(JSON.stringify(plain));
  });
  it("v3 and v5-without-band contexts keep their precomputed-factor paths", () => {
    const market = Array.from({ length: 6 }, (_, i) => ({ cpi: "0", returns: { CASH: "0", EQUITY: i % 2 ? "0.05" : "-0.04" } }));
    const c3 = riskContext(6); c3.rebalanceBandPoints = "5"; c3.turnoverCostPercent = "1";
    const kernel3 = projectRetirement({ ...c3.projection, rows: c3.projection.rows.map((r, i) => ({ ...r, growthFactor: portfolioFactors(c3, market)[i] })) });
    expect(runPath(c3, market).fundedTerminalBalance).toBe(kernel3.summary.fundedTerminalBalance);
    const c5 = riskContext(6); c5.projection.modelVersion = "retirement-monthly-v5"; c5.turnoverCostPercent = "1"; c5.rebalance = [true, true, true, true, true, true];
    const f = portfolioFactors(c5, market), k = portfolioCosts(c5, market);
    const kernel5 = projectRetirementV5({ ...c5.projection, rows: c5.projection.rows.map((r, i) => ({ ...r, growthFactor: f[i], tradingCostRate: k[i] })) } as never);
    expect(runPath(c5, market).fundedTerminalBalance).toBe(kernel5.summary.fundedTerminalBalance);
  });
  it("runPath with v5 and a band runs end to end through the hook, never losing money to a free rebalance", () => {
    const c: RiskContext = riskContext(6); c.projection.modelVersion = "retirement-monthly-v5"; c.rebalanceBandPoints = "5"; c.turnoverCostPercent = "1";
    c.projection.initialCapital = "5000";
    const market = Array.from({ length: 6 }, (_, i) => ({ cpi: "0", returns: { CASH: "0", EQUITY: i % 2 ? "0.05" : "-0.04" } }));
    const banded = runPath(c, market), calendar = runPath({ ...c, rebalanceBandPoints: null, rebalance: c.rebalance.map(() => true) }, market);
    expect(new D(banded.fundedTerminalBalance).gt(0)).toBe(true);
    expect(new D(calendar.fundedTerminalBalance).gt(0)).toBe(true);
  });
});
