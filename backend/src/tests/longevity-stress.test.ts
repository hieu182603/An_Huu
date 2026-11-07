import { describe, expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { riskPolicySchema, stressKinds } from "../modules/allocation-risk/policy";
import {
  extendLongevityContext,
  deterministicStress,
} from "../modules/allocation-risk/stresses";
import {
  runPath,
  simulate,
  marketRows,
  type RiskContext,
  type PathMarket,
} from "../modules/allocation-risk/simulation";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";

describe("Feature F02 — Longevity Cashflow Extension & Dynamics", () => {
  it("extends context and market by 5 years (+60 months) with compounding CPI, lifelong pensions, and zero debts", () => {
    const baseMonths = 24;
    const c = riskContext(baseMonths);
    const lastBaseIndex = baseMonths - 1;
    c.projection.rows[lastBaseIndex].livingExpense = "100";
    c.projection.rows[lastBaseIndex].additionalExpense = "20";
    c.projection.rows[lastBaseIndex].pension = "40";
    c.projection.rows[lastBaseIndex].income = "10";
    c.projection.rows[lastBaseIndex].debtPayment = "15";
    c.projection.rows[lastBaseIndex].capitalInjection = "50";
    c.essentialExpenses[lastBaseIndex] = "100";

    const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
      cpi: "0.005",
      returns: { CASH: "0.004", EQUITY: "0.008" },
    }));

    const { extendedContext, extendedMarket, endMonth } = extendLongevityContext(c, baseMarket, 5);

    expect(extendedContext.projection.rows.length).toBe(baseMonths + 60);
    expect(extendedMarket.length).toBe(baseMonths + 60);
    expect(extendedContext.essentialExpenses.length).toBe(baseMonths + 60);
    expect(extendedContext.targets.length).toBe(baseMonths + 60);
    expect(extendedContext.rebalance.length).toBe(baseMonths + 60);
    expect(endMonth).toBe(addMonths(c.projection.rows[lastBaseIndex].month, 60));

    // Verify calendar continuity
    for (let i = 1; i < extendedContext.projection.rows.length; i++) {
      expect(extendedContext.projection.rows[i].month).toBe(
        addMonths(extendedContext.projection.rows[i - 1].month, 1)
      );
    }

    // Verify compounding of living and additional expenses
    let expectedLiving = new D("100");
    let expectedAdditional = new D("20");
    let expectedEssential = new D("100");
    const factor = new D("1.005");

    for (let k = 1; k <= 60; k++) {
      const row = extendedContext.projection.rows[baseMonths - 1 + k];
      expectedLiving = expectedLiving.mul(factor);
      expectedAdditional = expectedAdditional.mul(factor);
      expectedEssential = expectedEssential.mul(factor);

      expect(row.livingExpense).toBe(expectedLiving.toFixed());
      expect(row.additionalExpense).toBe(expectedAdditional.toFixed());
      expect(extendedContext.essentialExpenses[baseMonths - 1 + k]).toBe(expectedEssential.toFixed());

      // Pension and passive income are lifelong
      expect(row.pension).toBe("40");
      expect(row.income).toBe("10");

      // Terminated items: debts, planned contributions, capital injections
      expect(row.debtPayment).toBe("0");
      expect(row.plannedContribution).toBe("0");
      expect(row.contribution).toBe("0");
      expect(row.contributionCapacity).toBe("0");
      expect(row.capitalInjection).toBe("0");

      // Net spending calculation: living + additional + debt - income - pension
      const netSpending = new D(expectedLiving).plus(expectedAdditional).minus("10").minus("40");
      expect(row.withdrawal).toBe(D.max(0, netSpending).toFixed());
      expect(row.uninvestedSurplus).toBe(D.max(0, netSpending.neg()).toFixed());
    }
  });

  it("extends context and market by 10 years (+120 months) and validates parameter bounds", () => {
    const c = riskContext(12);
    const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
      cpi: "0.003",
      returns: { CASH: "0.002", EQUITY: "0.006" },
    }));

    const res10 = extendLongevityContext(c, baseMarket, 10);
    expect(res10.extendedContext.projection.rows.length).toBe(12 + 120);
    expect(res10.extendedMarket.length).toBe(12 + 120);

    // Invalid parameters throw RangeError
    expect(() => extendLongevityContext(c, baseMarket, 0)).toThrow(RangeError);
    expect(() => extendLongevityContext(c, baseMarket, -5)).toThrow(RangeError);
    expect(() => extendLongevityContext(c, baseMarket, 31)).toThrow(RangeError);
    expect(() => extendLongevityContext(c, baseMarket, 5.5)).toThrow(RangeError);

    const emptyContext: RiskContext = { ...c, projection: { ...c.projection, rows: [] } };
    expect(() => extendLongevityContext(emptyContext, baseMarket, 5)).toThrow(RangeError);
  });

  it("strictly obeys Zero-Floor Liquidity: no negative borrowing and accurate ruin detection", () => {
    const c = riskContext(12);
    // Low capital: 500 total, 100/month living expense => will run out in month 5
    c.projection.initialCapital = "500";
    const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
      cpi: "0",
      returns: { CASH: "0", EQUITY: "0" },
    }));

    const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 5);
    const pathResult = runPath(extendedContext, extendedMarket);

    // Fund must be exhausted
    expect(pathResult.funded).toBe(false);
    expect(new D(pathResult.unfundedWithdrawals).gt(0)).toBe(true);
    expect(new D(pathResult.essentialLossToday).gt(0)).toBe(true);
    expect(pathResult.fundedTerminalBalance).toBe("0");

    // All closing balances must strictly be >= 0 (Zero-Floor Liquidity)
    for (const balance of pathResult.balances) {
      expect(new D(balance).gte(0)).toBe(true);
    }

    // Ample capital case: 1,000,000 total => fully funded across longevity extension
    const richContext = riskContext(12);
    richContext.projection.initialCapital = "1000000";
    const { extendedContext: richExt, extendedMarket: richMkt } = extendLongevityContext(richContext, baseMarket, 5);
    const richResult = runPath(richExt, richMkt);

    expect(richResult.funded).toBe(true);
    expect(richResult.unfundedWithdrawals).toBe("0");
    expect(richResult.essentialLossToday).toBe("0");
    expect(new D(richResult.fundedTerminalBalance).gt(0)).toBe(true);
  });
});

describe("Feature F09 — 8/8 Deterministic Stress Shocks Suite Validation", () => {
  const configuredPolicy = riskPolicySchema.parse({
    evidence: "Comprehensive 8-shock policy",
    stresses: {
      HIGH_INFLATION: { offsetMonths: 0, durationMonths: 12, annualDeltaPoints: "10" },
      EQUITY_CRASH: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-30" },
      RATE_RISE: { offsetMonths: 0, assetClass: "EQUITY", durationYears: "5", yieldRisePoints: "2.5" },
      CREDIT: { offsetMonths: 0, assetClass: "EQUITY", defaultPercent: "15", recoveryPercent: "40" },
      GOLD: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-15", spreadPoints: "4" },
      INCOME_LOSS: { offsetMonths: 0, durationMonths: 12, lostPercent: "80" },
      PROPERTY_ILLIQUIDITY: { offsetMonths: 0, durationMonths: 12, delayMonths: 3, haircutPercent: "15" },
      LONGEVITY: { extraYears: [5, 10] },
    },
  });

  it("executes all 8/8 deterministic stress shocks with status READY", () => {
    const c = riskContext(24);
    c.projection.rows[0].capitalInjection = "500";
    const market = c.projection.rows.map(() => ({
      cpi: "0.002",
      returns: { CASH: "0.003", EQUITY: "0.007" },
    }));
    const propertyInjections = [{ month: "2026-01", amount: "500" }];

    for (const kind of stressKinds) {
      const stressRes = deterministicStress(kind, c, market, configuredPolicy, propertyInjections);
      expect(stressRes.status).toBe("READY");
      expect(stressRes.kind).toBe(kind);
      expect(stressRes).toHaveProperty("parameters");
      expect(stressRes).toHaveProperty("result");
      expect(stressRes).toHaveProperty("assumptions");

      if (stressRes.status === "READY") {
        expect(typeof stressRes.result.funded).toBe("boolean");
        expect(Number.isFinite(Number(stressRes.result.essentialLossToday))).toBe(true);
        expect(Number.isFinite(Number(stressRes.result.unfundedWithdrawals))).toBe(true);
        expect(Number.isFinite(Number(stressRes.result.fundedTerminalBalance))).toBe(true);
        expect(stressRes.result.balances.length).toBeGreaterThanOrEqual(24);
        for (const bal of stressRes.result.balances) {
          expect(Number.isFinite(Number(bal))).toBe(true);
          expect(Number(bal)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("LONGEVITY stress includes correct formal assumptions", () => {
    const c = riskContext(12);
    const market = c.projection.rows.map(() => ({ cpi: "0", returns: { CASH: "0", EQUITY: "0" } }));
    const res = deterministicStress("LONGEVITY", c, market, configuredPolicy);
    expect(res.status).toBe("READY");
    if (res.status === "READY") {
      expect(res.assumptions).toContain("SINGLE_SCENARIO_NOT_PROBABILITY");
      expect(res.assumptions).toContain("LIFELONG_PENSION_CONTINUATION");
      expect(res.assumptions).toContain("INFLATION_INDEXED_LIVING_EXPENSES");
      expect(res.assumptions).toContain("TERMINAL_ALLOCATION_HELD");
      expect(res.assumptions).toContain("ZERO_FLOOR_DEPLETION_NO_NEGATIVE_BORROWING");
    }
  });

  it("compares 5-year and 10-year longevity shocks properly", () => {
    const c = riskContext(24);
    c.projection.initialCapital = "2000";
    const market = c.projection.rows.map(() => ({
      cpi: "0.004",
      returns: { CASH: "0.003", EQUITY: "0.006" },
    }));

    const res5 = deterministicStress("LONGEVITY", c, market, configuredPolicy, undefined, 5);
    const res10 = deterministicStress("LONGEVITY", c, market, configuredPolicy, undefined, 10);

    expect(res5.status).toBe("READY");
    expect(res10.status).toBe("READY");

    if (res5.status === "READY" && res10.status === "READY") {
      // 10-year shock evaluates 60 additional months (120 vs 60)
      expect(res10.result.balances.length).toBe(res5.result.balances.length + 60);

      // Living longer means equal or greater unfunded withdrawals and essential loss
      expect(new D(res10.result.unfundedWithdrawals).gte(new D(res5.result.unfundedWithdrawals))).toBe(true);
      expect(new D(res10.result.essentialLossToday).gte(new D(res5.result.essentialLossToday))).toBe(true);
      expect(new D(res10.result.fundedTerminalBalance).lte(new D(res5.result.fundedTerminalBalance))).toBe(true);
    }
  });
});

describe("Feature F03 — Extended Horizon Planning (20, 30, 40+ Years & FIRE)", () => {
  const policy = riskPolicySchema.parse({
    evidence: "Extended horizon test policy",
    blockMonths: 12,
    cvarAlpha: "0.95",
    essentialThreshold: "0.90",
  });

  it("simulates a 20-year horizon plan (240 months) seamlessly", async () => {
    const c = riskContext(240);
    const data = marketFixture();

    const simResult = await simulate(c, data, policy, 20, performance.now() + 60000);
    expect(simResult.status).toBe("READY");
    if (simResult.status === "READY") {
      expect(simResult.bands.length).toBe(240);
      expect(simResult.paths).toBe(20);
      expect(Number.isFinite(simResult.pEssential)).toBe(true);
      expect(Number.isFinite(Number(simResult.cvarEssentialShortfallToday))).toBe(true);
      for (const band of simResult.bands) {
        expect(Number.isFinite(Number(band.p10))).toBe(true);
        expect(Number.isFinite(Number(band.p50))).toBe(true);
        expect(Number.isFinite(Number(band.p90))).toBe(true);
        expect(Number(band.p10)).toBeLessThanOrEqual(Number(band.p50));
        expect(Number(band.p50)).toBeLessThanOrEqual(Number(band.p90));
      }
    }
  });

  it("simulates a 30-year horizon plan (360 months) with consistent percentiles", async () => {
    const c = riskContext(360);
    const data = marketFixture();

    const simResult = await simulate(c, data, policy, 20, performance.now() + 60000);
    expect(simResult.status).toBe("READY");
    if (simResult.status === "READY") {
      expect(simResult.bands.length).toBe(360);
      expect(simResult.wilson.lower).toBeGreaterThanOrEqual(0);
      expect(simResult.wilson.upper).toBeLessThanOrEqual(1);
    }
  });

  it("simulates a 40-year extended horizon plan (480 months) safely under path-months limits", async () => {
    const c = riskContext(480);
    const data = marketFixture();

    // 480 months * 20 paths = 9,600 path-months <= 200,000 limit
    const simResult = await simulate(c, data, policy, 20, performance.now() + 60000);
    expect(simResult.status).toBe("READY");
    if (simResult.status === "READY") {
      expect(simResult.bands.length).toBe(480);
      expect(simResult.paths).toBe(20);
      expect(Number.isFinite(simResult.pEssential)).toBe(true);
      // Zero NaN across all 480 band percentiles
      for (let i = 0; i < 480; i++) {
        expect(simResult.bands[i].p10).not.toBe("NaN");
        expect(simResult.bands[i].p50).not.toBe("NaN");
        expect(simResult.bands[i].p90).not.toBe("NaN");
      }
    }
  });

  it("models an Early Retirement (FIRE) case across 50 years (600 months) with deferred statutory pension", () => {
    // 50-year plan (600 months): Age 30 -> 80
    // Accumulation: Months 0 to 179 (15 years, age 30 -> 45)
    // Early retirement gap: Months 180 to 383 (17 years, age 45 -> 62) with pension = 0
    // Statutory pension kicks in: Months 384 to 599 (18 years, age 62 -> 80) with pension = 50
    const totalMonths = 600;
    const retirementMonthIndex = 180;
    const pensionStartMonthIndex = 384;

    const rows = Array.from({ length: totalMonths }, (_, i) => {
      const month = addMonths("2026-01", i);
      const isAccumulation = i < retirementMonthIndex;
      const hasPension = i >= pensionStartMonthIndex;
      return {
        month,
        growthFactor: "1.004",
        inflationFactor: "1.002",
        income: isAccumulation ? "80" : "0",
        pension: hasPension ? "50" : "0",
        livingExpense: "60",
        additionalExpense: "10",
        debtPayment: "0",
        plannedContribution: isAccumulation ? "30" : "0",
        contribution: isAccumulation ? "30" : "0",
        contributionCapacity: isAccumulation ? "30" : "0",
        withdrawal: isAccumulation ? "0" : hasPension ? "20" : "70",
        uninvestedSurplus: isAccumulation ? "10" : "0",
        capitalInjection: "0",
      };
    });

    const fireContext: RiskContext = {
      selection: { ...riskContext().selection, endMonth: addMonths("2026-01", totalMonths - 1) },
      projection: {
        valuationDate: "2026-01-01",
        retirementMonth: addMonths("2026-01", retirementMonthIndex),
        initialCapital: "2000",
        terminalBalance: "0",
        monthlyContribution: "30",
        contributionTiming: "END_OF_MONTH",
        modelVersion: "retirement-monthly-v3",
        rows,
      },
      essentialExpenses: rows.map(() => "50"),
      targets: rows.map((_, i) => [
        { assetClass: "CASH", weightPercent: i < retirementMonthIndex ? "30" : "60" },
        { assetClass: "EQUITY", weightPercent: i < retirementMonthIndex ? "70" : "40" },
      ]),
      rebalance: rows.map((_, i) => i % 12 === 0),
      turnoverCostPercent: "0",
    };

    const market: PathMarket[] = rows.map(() => ({
      cpi: "0.002",
      returns: { CASH: "0.003", EQUITY: "0.006" },
    }));

    const result = runPath(fireContext, market);

    expect(result.balances.length).toBe(600);
    expect(Number.isFinite(Number(result.essentialLossToday))).toBe(true);
    expect(Number.isFinite(Number(result.unfundedWithdrawals))).toBe(true);

    // All balances are nonnegative
    for (const b of result.balances) {
      expect(Number(b)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Feature F09 — Numerical Stability & Deterministic Reproducibility", () => {
  const policy = riskPolicySchema.parse({
    evidence: "Numerical stability policy",
    blockMonths: 12,
    cvarAlpha: "0.95",
    essentialThreshold: "0.90",
  });

  it("guarantees 100% bit-for-bit deterministic reproducibility with seed 20261016", async () => {
    const c = riskContext(24);
    const data = marketFixture();

    const runA = await simulate(c, data, policy, 30);
    const runB = await simulate(c, data, policy, 30);

    expect(runA.status).toBe("READY");
    expect(runB.status).toBe("READY");
    expect(JSON.stringify(runA)).toBe(JSON.stringify(runB));

    if (runA.status === "READY" && runB.status === "READY") {
      expect(runA.pEssential).toBe(runB.pEssential);
      expect(runA.wilson).toEqual(runB.wilson);
      expect(runA.cvarEssentialShortfallToday).toBe(runB.cvarEssentialShortfallToday);
      expect(runA.bands).toEqual(runB.bands);
    }
  });

  it("maintains zero NaN and zero Infinity under boundary extremes", async () => {
    const data = marketFixture();

    // Extreme 1: 0% success (zero capital, huge spending)
    const zeroCapContext = riskContext(24);
    zeroCapContext.projection.initialCapital = "0";
    zeroCapContext.projection.rows.forEach(r => {
      r.livingExpense = "50000";
      r.withdrawal = "50000";
    });
    zeroCapContext.essentialExpenses = zeroCapContext.projection.rows.map(() => "50000");

    const zeroResult = await simulate(zeroCapContext, data, policy, 20);
    expect(zeroResult.status).toBe("READY");
    if (zeroResult.status === "READY") {
      expect(zeroResult.pEssential).toBe(0);
      expect(zeroResult.wilson.lower).toBe(0);
      expect(Number.isFinite(zeroResult.wilson.upper)).toBe(true);
      expect(zeroResult.wilson.upper).toBeGreaterThan(0);
      expect(Number.isFinite(Number(zeroResult.cvarEssentialShortfallToday))).toBe(true);
      expect(zeroResult.cvarEssentialShortfallToday).not.toContain("NaN");
      expect(zeroResult.cvarEssentialShortfallToday).not.toContain("Infinity");
    }

    // Extreme 2: 100% success (huge capital, zero spending)
    const fullCapContext = riskContext(24);
    fullCapContext.projection.initialCapital = "1000000000";
    fullCapContext.projection.rows.forEach(r => {
      r.livingExpense = "0";
      r.withdrawal = "0";
    });
    fullCapContext.essentialExpenses = fullCapContext.projection.rows.map(() => "0");

    const fullResult = await simulate(fullCapContext, data, policy, 20);
    expect(fullResult.status).toBe("READY");
    if (fullResult.status === "READY") {
      expect(fullResult.pEssential).toBe(1);
      expect(fullResult.wilson.upper).toBe(1);
      expect(fullResult.wilson.lower).toBeGreaterThan(0.8);
      expect(fullResult.cvarEssentialShortfallToday).toBe("0");
    }
  });
});
