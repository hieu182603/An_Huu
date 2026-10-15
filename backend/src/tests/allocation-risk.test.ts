import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { RetirementDecimal as D, projectRetirement } from "../modules/retirement/engine";
import { portfolioDocumentSchema } from "../modules/portfolios/schema";
import { marketDocumentSchema } from "../modules/allocation-risk/market-schema";
import { riskRequestSchema } from "../modules/allocation-risk/schema";
import { riskPolicySchema, stressKinds } from "../modules/allocation-risk/policy";
import { bootstrapIndices, randomGenerator, cvar, wilson, runPath, simulate, marketRows, portfolioFactors } from "../modules/allocation-risk/simulation";
import { sequenceOfReturns, deterministicStress } from "../modules/allocation-risk/stresses";
import { totalReturn, cagr, shrinkMean, ledoitWolf, realReturn, domesticReturn } from "../modules/allocation-risk/estimation";
import { allocationCandidates, selectCandidate } from "../modules/allocation-risk/selection";
import { proposeRebalance, rebalanceInputSchema } from "../modules/allocation-risk/rebalance";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";
const policy = riskPolicySchema.parse({ evidence: "Test-only policy", blockMonths: 12, cvarAlpha: "0.95", essentialThreshold: "0.90" });

describe("P2 licensed market data boundary", () => {
  it("rejects missing/extra columns, gaps, duplicate months, non-total-return units and missing license", () => {
    for (const mutate of [
      (d: ReturnType<typeof marketFixture>) => { delete d.rows[0].returns.EQUITY; },
      (d: ReturnType<typeof marketFixture>) => { d.rows[0].returns.EXTRA = "0"; },
      (d: ReturnType<typeof marketFixture>) => { d.rows[0].month = "2010-02"; },
      (d: ReturnType<typeof marketFixture>) => { d.rows[1].month = d.rows[0].month; },
      (d: ReturnType<typeof marketFixture>) => { d.sources[0].license = ""; },
      (d: ReturnType<typeof marketFixture>) => { d.rows[0].returns.EQUITY = "NaN"; },
      (d: ReturnType<typeof marketFixture>) => { d.rows[0].cpi = "-1"; },
    ]) { const fixture = marketFixture(); mutate(fixture); expect(marketDocumentSchema.safeParse(fixture).success).toBe(false); }
    expect(marketDocumentSchema.safeParse({ ...marketFixture(), unit: "PRICE_RETURN" }).success).toBe(false);
  });
  it("rejects client benchmarks and policy overrides, allows only references and personal preview", () => {
    const plan = { kind: "SAVED_VERSION", planId: "00000000-0000-4000-8000-000000000001", versionId: "00000000-0000-4000-8000-000000000002" };
    for (const extra of [{ returns: [] }, { cpi: [] }, { seed: 1 }, { blockMonths: 24 }, { alpha: .9 }, { policy: {} }])
      expect(riskRequestSchema.safeParse({ plan, ...extra }).success).toBe(false);
    expect(riskRequestSchema.safeParse({ plan, paths: 501 }).success).toBe(false);
    expect(riskRequestSchema.safeParse({ plan }).success).toBe(true);
  });
  it("keeps published policy bytes and old parsed hash; adds no absent optional fields", () => {
    const file = "seed-data/allocation-2026-10/published-policy-v2.json";
    const value = JSON.parse(readFileSync(file, "utf8")).values;
    const parsed = portfolioDocumentSchema.parse(value);
    expect(parsed).toEqual(value);
    // Existing approval hashes use schema field order, not exported JSONB order.
    expect(createHash("sha256").update(JSON.stringify(parsed)).digest("hex"))
      .toBe("f0ba2b90cf2ef46c7b32d20cf2588452502c073001a5bbc3697ac28eb7be52b4");
    expect(Object.hasOwn(parsed, "allocationRisk")).toBe(false);
  });
});
describe("P2-1 bootstrap, real essential losses, Wilson", () => {
  it("samples contiguous blocks with the same complete vector indices and is seed reproducible", () => {
    const a = bootstrapIndices(48, 47, 12, randomGenerator(123));
    expect(a).toEqual(bootstrapIndices(48, 47, 12, randomGenerator(123)));
    expect(a).not.toEqual(bootstrapIndices(48, 47, 12, randomGenerator(124)));
    a.forEach((v, i) => { if (i % 12) expect(v).toBe(a[i - 1] + 1); expect(v).toBeLessThan(48); });
    expect(() => bootstrapIndices(11, 24, 12, randomGenerator(1))).toThrow();
  });
  it("reproduces full results without modifying inputs", async () => {
    const c = riskContext(), data = marketFixture(), before = JSON.stringify([c, data]);
    const a = await simulate(c, data, policy, 20), b = await simulate(c, data, policy, 20);
    expect(a.status).toBe("READY"); expect(a).toEqual(b); expect(JSON.stringify([c, data])).toBe(before);
    if (a.status === "READY") { expect(a.paths).toBe(20); expect(a.disclosure.historyMonths).toBe(48); expect(a.pEssential).toBe(0); }
  });
  it("returns DATA_REQUIRED before any path and REVIEW_REQUIRED for policy gaps", async () => {
    expect(await simulate(riskContext(), null, undefined, 10)).toMatchObject({ status: "DATA_REQUIRED" });
    expect(await simulate(riskContext(), marketFixture(), undefined, 10)).toMatchObject({ status: "REVIEW_REQUIRED" });
    const data = marketFixture(); data.assets.pop();
    const c = riskContext(); c.targets[0].push({ assetClass: "GOLD", weightPercent: "0" });
    expect(await simulate(c, data, policy, 10)).toMatchObject({ status: "DATA_REQUIRED" });
  });
  it("enforces operation/deadline limits without returning a partial probability", async () => {
    expect(await simulate(riskContext(), marketFixture(), policy, 501)).toMatchObject({ status: "LIMIT_EXCEEDED" });
    expect(await simulate(riskContext(), marketFixture(), policy, 20, 0)).toMatchObject({ status: "LIMIT_EXCEEDED" });
    expect(await simulate(riskContext(1200), marketFixture(), policy, 500)).toMatchObject({ status: "LIMIT_EXCEEDED" });
  });
  it("matches empirical CVaR with ties, fractional tails, and no deficit", () => {
    expect(cvar(["0", "10", "20", "30"], "0.5")).toBe("25");
    expect(cvar(["0", "10", "20", "30"], "0.625")).toBe(new D(40).div(1.5).toFixed());
    expect(cvar(["0", "0", "100", "100"], "0.95")).toBe("100");
    expect(cvar(["0", "0"], "0.95")).toBe("0");
  });
  it("Wilson has nontrivial uncertainty at both endpoints", () => {
    expect(wilson(0, 100).upper).toBeCloseTo(.0369934982, 9);
    expect(wilson(100, 100).lower).toBeCloseTo(.9630065018, 9);
    expect(wilson(50, 100).lower).toBeCloseTo(.4038315304, 9);
  });
  it("does not earn on negative balances or erase an earlier shortfall after a later injection", () => {
    const c = riskContext(3); c.projection.initialCapital = "0"; c.projection.rows[2].capitalInjection = "10000";
    const r = runPath(c, Array.from({ length: 3 }, () => ({ cpi: "0", returns: { CASH: "0.1", EQUITY: "0.1" } })));
    expect(r.essentialLossToday).toBe("200"); expect(r.funded).toBe(false); expect(r.fundedTerminalBalance).toBe("9900");
  });
  it("indexes living expense and discounts each essential deficit by the same opening CPI index", () => {
    const c = riskContext(3); c.projection.initialCapital = "0";
    const r = runPath(c, Array.from({ length: 3 }, () => ({ cpi: "0.1", returns: { CASH: "0", EQUITY: "0" } })));
    expect(r.essentialLossToday).toBe("300"); expect(r.unfundedWithdrawals).toBe("331");
  });
  it("matches the existing funded monthly kernel on unchanged paths", () => {
    const c = riskContext(6), r = runPath(c, c.projection.rows.map(() => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0" } })));
    const original = projectRetirement(c.projection);
    expect(r.fundedTerminalBalance).toBe(original.summary.fundedTerminalBalance);
    expect(r.unfundedWithdrawals).toBe(original.summary.unfundedWithdrawals);
  });
  it("applies gross fees once and drifts holdings between rebalances", () => {
    const data = marketFixture(); data.assets[0].fees = { treatment: "GROSS", monthlyDrag: "0.001", evidence: "Fixture fee" };
    expect(marketRows(data)[0].returns.CASH).toBe("-0.001");
    const c = riskContext(2), factors = portfolioFactors(c, Array.from({ length: 2 }, () => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0.2" } })));
    expect(factors[0]).toBe("1.1"); expect(new D(factors[1]).gt("1.1")).toBe(true);
  });
  it("recomputes FUND/EXTERNAL advisory fees from each funded path", () => {
    const c = riskContext(1), market = [{ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }];
    c.selection.advisoryFee = { annualPercent: "12", paidFrom: "FUND" };
    // Opening 1000, closing before advisory fee 900: average 950, monthly fee 9.5.
    expect(runPath(c, market).fundedTerminalBalance).toBe("890.5");
    c.selection.advisoryFee.paidFrom = "EXTERNAL";
    expect(runPath(c, market).fundedTerminalBalance).toBe("890.5");
    c.projection.initialCapital = "0";
    expect(runPath(c, market).essentialLossToday).toBe("100");
  });
  it("does not count an optional-only deficit as essential failure, but keeps the cash deficit", () => {
    const c = riskContext(1); c.projection.retirementMonth = "2026-01"; c.projection.initialCapital = "50";
    c.projection.rows[0].livingExpense = "50"; c.projection.rows[0].additionalExpense = "50"; c.essentialExpenses[0] = "50";
    const r = runPath(c, [{ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }]);
    expect(r).toMatchObject({ funded: true, essentialLossToday: "0", unfundedWithdrawals: "50", fundedTerminalBalance: "0" });
  });
});
describe("P2-2 deterministic stresses", () => {
  it("reproduces 775 million versus 820 million with beginning-year withdrawals", () => {
    expect(sequenceOfReturns("1000000000", "100000000", ["-0.20", "0.25"]).fundedBalance).toBe("775000000");
    expect(sequenceOfReturns("1000000000", "100000000", ["0.25", "-0.20"]).fundedBalance).toBe("820000000");
  });
  it("has no hard-coded scenario parameters for all eight kinds", () => {
    const c = riskContext(), market = marketRows(marketFixture()).slice(0, 24);
    for (const kind of stressKinds) expect(deterministicStress(kind, c, market, undefined).status).toBe("REVIEW_REQUIRED");
  });
  it("executes approved inflation, equity, duration, credit, gold, income and property shocks", () => {
    const c = riskContext(12), market = c.projection.rows.map(() => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }));
    const configured = riskPolicySchema.parse({ evidence: "Fixture scenario policy", stresses: {
      HIGH_INFLATION: { offsetMonths: 0, durationMonths: 12, annualDeltaPoints: "12" },
      EQUITY_CRASH: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-20" },
      RATE_RISE: { offsetMonths: 0, assetClass: "EQUITY", durationYears: "5", yieldRisePoints: "2" },
      CREDIT: { offsetMonths: 0, assetClass: "EQUITY", defaultPercent: "20", recoveryPercent: "50" },
      GOLD: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-10", spreadPoints: "5" },
      INCOME_LOSS: { offsetMonths: 0, durationMonths: 12, lostPercent: "100" },
      PROPERTY_ILLIQUIDITY: { offsetMonths: 0, durationMonths: 12, delayMonths: 2, haircutPercent: "10" },
    } });
    c.projection.rows[0].capitalInjection = "200";
    for (const kind of stressKinds.filter(k => k !== "LONGEVITY"))
      expect(deterministicStress(kind, c, market, configured, [{ month: "2026-01", amount: "200" }]).status).toBe("READY");
    expect(deterministicStress("PROPERTY_ILLIQUIDITY", c, market, configured).status).toBe("REVIEW_REQUIRED");
  });
});
describe("P2-3 candidate rules", () => {
  it("generates bounded 100% variants and filters infeasible shifts", () => {
    const c = riskContext(1); c.targets[0] = [{ assetClass: "CASH", weightPercent: "5" }, { assetClass: "EQUITY", weightPercent: "95" }];
    expect(allocationCandidates(c.targets, "EQUITY", "CASH", "10").map(c => c.valid)).toEqual([true, true, false]);
  });
  it("uses essential threshold, CVaR then allocation change, never highest return/Sharpe", () => {
    const scores = [{ id: "FAIL", pEssential: .89, cvarEssentialShortfallToday: "0", changePoints: "0" },
      { id: "RISK", pEssential: 1, cvarEssentialShortfallToday: "20", changePoints: "0" },
      { id: "SHIFT", pEssential: .91, cvarEssentialShortfallToday: "10", changePoints: "10" },
      { id: "BASE", pEssential: .90, cvarEssentialShortfallToday: "10", changePoints: "0" }];
    expect(selectCandidate(scores, "0.90")?.id).toBe("BASE");
    expect(selectCandidate(scores.slice(0, 1), "0.90")).toBeNull();
  });
});
describe("P2-4 cash-first rebalance", () => {
  const input = () => rebalanceInputSchema.parse({ policyVersionId: "00000000-0000-4000-8000-000000000001", templateId: "TEST", month: "2026-01", retirementMonth: "2030-01",
    holdings: [{ assetClass: "CASH", value: "400", maturedAmount: "0" }, { assetClass: "EQUITY", value: "600", maturedAmount: "0" }], newContribution: "200" });
  const targets = [{ assetClass: "CASH", weightPercent: "50" }, { assetClass: "EQUITY", weightPercent: "50" }];
  it("uses contributions to avoid sales and costs", () => {
    const r = proposeRebalance(input(), targets, "5", "0.2");
    expect(r).toMatchObject({ status: "PROPOSED", cost: "0", cashUsedBeforeTrades: "200" });
    if (r.status === "PROPOSED") expect(r.trades.every(t => t.buy === "0" && t.sell === "0")).toBe(true);
  });
  it("does not add maturities twice, charges only remaining half-L1 trades and conserves value", () => {
    const c = input(); c.newContribution = "0"; c.holdings[1].maturedAmount = "100";
    const free = proposeRebalance(c, targets, "5", "0.2"); expect(free).toMatchObject({ status: "PROPOSED", cost: "0", netValue: "1000" });
    c.holdings[1].maturedAmount = "0";
    const trade = proposeRebalance(c, targets, "5", "0.2");
    if (trade.status !== "PROPOSED") throw Error("Expected trade");
    expect(new D(trade.cost).gt(0)).toBe(true);
    expect(new D(trade.netValue).plus(trade.cost).minus(1000).abs().lt("1e-30")).toBe(true);
  });
  it("requires drift strictly greater than band", () => {
    const c = input(); c.holdings[0].value = "450"; c.holdings[1].value = "550";
    expect(proposeRebalance(c, targets, "5", "0.2").status).toBe("WITHIN_BAND");
  });
});
describe("P2-5 pure estimators", () => {
  it("computes total returns, CAGR, mean shrinkage, exact real and domestic returns", () => {
    expect(totalReturn("100", "105", "2")).toBe("0.07");
    expect(new D(cagr(Array(12).fill("0.01"))).toNumber()).toBeCloseTo(1.01 ** 12 - 1, 12);
    expect(shrinkMean("0.10", "0.04", "0.5")).toBe("0.07");
    expect(realReturn("0.10", "0.05")).toBe(new D("1.1").div("1.05").minus(1).toFixed());
    expect(domesticReturn("0.10", "0.05")).toBe("0.155");
  });
  it("matches scikit-learn 1.8.0 ledoit_wolf reference on an explicit synthetic fixture", () => {
    // Generated offline via sklearn.covariance.ledoit_wolf, assume_centered=False.
    const rows = [[.01,.02,-.01],[.03,.04,.02],[-.02,-.03,.01],[.04,.06,-.02],[.01,.03,.01],[-.01,-.02,.03]];
    const expected = [[.00047367614654561003,.0004729959070311359,-.0001334091019831409],
      [.0004729959070311359,.000902202352915699,-.00022639120336533],[-.0001334091019831409,-.00022639120336533,.0003685659449831354]];
    const r = ledoitWolf(rows.map(r => r.map(String)));
    expect(Number(r.shrinkage)).toBeCloseTo(.2723139891828679, 14);
    r.covariance.forEach((row, i) => row.forEach((v, j) => expect(Number(v)).toBeCloseTo(expected[i][j], 14)));
  });
  it("handles constant/one-column series and rejects malformed input", () => {
    expect(ledoitWolf([["1", "2"], ["1", "2"]])).toMatchObject({ shrinkage: "0", covariance: [["0", "0"], ["0", "0"]] });
    expect(ledoitWolf([["1"], ["3"]]).covariance).toEqual([["1"]]);
    expect(() => ledoitWolf([["1"], ["2", "3"]])).toThrow();
    expect(() => shrinkMean("0", "0", "1.1")).toThrow();
    expect(() => cagr([])).toThrow(); expect(() => realReturn("0", "-1")).toThrow();
  });
});
