import { describe, expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import {
  extendLongevityContext,
  deterministicStress,
} from "../modules/allocation-risk/stresses";
import {
  runPath,
  simulate,
  randomGenerator,
  LIMITS,
  type RiskContext,
  type PathMarket,
} from "../modules/allocation-risk/simulation";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";

describe("Empirical Challenger M1-IT2: Deep Adversarial Verification", () => {
  const policy = riskPolicySchema.parse({
    evidence: "Empirical Challenger Policy",
    stresses: {
      LONGEVITY: { extraYears: [5, 10] },
      HIGH_INFLATION: { offsetMonths: 0, durationMonths: 12, annualDeltaPoints: "10" },
      EQUITY_CRASH: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-30" },
      RATE_RISE: { offsetMonths: 0, assetClass: "EQUITY", durationYears: "5", yieldRisePoints: "2.5" },
      CREDIT: { offsetMonths: 0, assetClass: "EQUITY", defaultPercent: "15", recoveryPercent: "40" },
      GOLD: { offsetMonths: 0, assetClass: "EQUITY", shockPercent: "-15", spreadPoints: "4" },
      INCOME_LOSS: { offsetMonths: 0, durationMonths: 12, lostPercent: "80" },
      PROPERTY_ILLIQUIDITY: { offsetMonths: 0, durationMonths: 12, delayMonths: 3, haircutPercent: "15" },
    },
    blockMonths: 12,
    cvarAlpha: "0.95",
    essentialThreshold: "0.90",
  });

  // TEST 1: Compound Monthly CPI Inflation Formula Verification
  describe("Verification 1: CPI Inflation Compounding Dynamics", () => {
    it("strictly preserves monthly compounding inf_m = (1 + inf_annual)^(1/12) - 1 across 1, 5, and 10 years", () => {
      const c = riskContext(12);
      const lastIdx = 11;
      const initialLiving = "10000000"; // 10M VND
      const initialAdditional = "2000000"; // 2M VND
      c.projection.rows[lastIdx].livingExpense = initialLiving;
      c.projection.rows[lastIdx].additionalExpense = initialAdditional;
      c.essentialExpenses[lastIdx] = initialLiving;

      // Realistic annual inflation rate: 4.5% (inf_annual = 0.045)
      const infAnnual = new D("0.045");
      // Monthly equivalent: (1 + 0.045)^(1/12) - 1
      const monthlyCpi = infAnnual.plus(1).pow(new D(1).div(12)).minus(1);
      const monthlyCpiStr = monthlyCpi.toFixed();
      const inflationFactor = monthlyCpi.plus(1);

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: monthlyCpiStr,
        returns: { CASH: "0.003", EQUITY: "0.006" },
      }));

      // Extend by 10 years (120 months)
      const { extendedContext } = extendLongevityContext(c, baseMarket, 10);
      expect(extendedContext.projection.rows.length).toBe(12 + 120);

      // Verify Year 1 (month 12 of extension = index 23)
      const rowY1 = extendedContext.projection.rows[lastIdx + 12];
      const expectedY1Living = new D(initialLiving).mul(infAnnual.plus(1));
      // Difference between monthly compound and annual compound must be virtually 0 (within decimal precision)
      const diffY1 = new D(rowY1.livingExpense).minus(expectedY1Living).abs();
      expect(diffY1.toNumber()).toBeLessThan(0.0001);

      // Verify Year 5 (month 60 of extension = index 71)
      const rowY5 = extendedContext.projection.rows[lastIdx + 60];
      const expectedY5Living = new D(initialLiving).mul(infAnnual.plus(1).pow(5));
      const diffY5 = new D(rowY5.livingExpense).minus(expectedY5Living).abs();
      expect(diffY5.toNumber()).toBeLessThan(0.001);

      // Verify Year 10 (month 120 of extension = index 131)
      const rowY10 = extendedContext.projection.rows[lastIdx + 120];
      const expectedY10Living = new D(initialLiving).mul(infAnnual.plus(1).pow(10));
      const diffY10 = new D(rowY10.livingExpense).minus(expectedY10Living).abs();
      expect(diffY10.toNumber()).toBeLessThan(0.01);

      // Verify exact recurrence step-by-step
      let stepLiving = new D(initialLiving);
      for (let k = 1; k <= 120; k++) {
        stepLiving = stepLiving.mul(inflationFactor);
        const row = extendedContext.projection.rows[lastIdx + k];
        expect(row.livingExpense).toBe(stepLiving.toFixed());
      }
    });
  });

  // TEST 2: BHXH Statutory Pension Lifelong Preservation
  describe("Verification 2: Lifelong Statutory Pension (BHXH) Preservation", () => {
    it("strictly preserves nominal monthly pension payments across entire extended horizon", () => {
      const c = riskContext(24);
      const lastIdx = 23;
      const statutoryPension = "7500000"; // 7.5M VND monthly BHXH
      c.projection.rows[lastIdx].pension = statutoryPension;
      c.projection.rows[lastIdx].livingExpense = "10000000";

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.0035",
        returns: { CASH: "0.003", EQUITY: "0.006" },
      }));

      const { extendedContext } = extendLongevityContext(c, baseMarket, 10);

      // Check all 120 extended months
      for (let k = 1; k <= 120; k++) {
        const row = extendedContext.projection.rows[lastIdx + k];
        expect(row.pension).toBe(statutoryPension);
      }
    });

    it("demonstrates realistic erosion of real purchasing power and resulting withdrawal increase", () => {
      const c = riskContext(12);
      const lastIdx = 11;
      const statutoryPension = "5000000";
      const initialLiving = "6000000";
      c.projection.rows[lastIdx].pension = statutoryPension;
      c.projection.rows[lastIdx].livingExpense = initialLiving;
      c.projection.rows[lastIdx].income = "0";
      c.projection.rows[lastIdx].additionalExpense = "0";

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.004", // Positive inflation
        returns: { CASH: "0.003", EQUITY: "0.005" },
      }));

      const { extendedContext } = extendLongevityContext(c, baseMarket, 5);

      // Initial net withdrawal at month 1 of extension: living (inflated) - pension
      const firstExtRow = extendedContext.projection.rows[lastIdx + 1];
      const lastExtRow = extendedContext.projection.rows[lastIdx + 60];

      // Net withdrawal increases as living costs inflate while pension remains nominally flat
      expect(new D(lastExtRow.withdrawal).gt(new D(firstExtRow.withdrawal))).toBe(true);

      // Confirm net withdrawal matches exact formula: livingExpense - pension
      for (let k = 1; k <= 60; k++) {
        const r = extendedContext.projection.rows[lastIdx + k];
        const net = new D(r.livingExpense).minus(statutoryPension);
        expect(r.withdrawal).toBe(net.toFixed());
      }
    });
  });

  // TEST 3: Strict Zero-Floor Liquidity
  describe("Verification 3: Strict Zero-Floor Liquidity Verification", () => {
    it("strictly prevents negative balances under early capital exhaustion and continuous withdrawals", () => {
      const c = riskContext(12);
      c.projection.initialCapital = "10000000"; // 10M initial capital
      c.projection.rows.forEach(r => {
        r.livingExpense = "5000000"; // 5M/month -> runs out in month 2
        r.pension = "0";
        r.income = "0";
      });

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.005",
        returns: { CASH: "-0.01", EQUITY: "-0.05" }, // Negative returns accelerate ruin
      }));

      const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 10);
      const pathResult = runPath(extendedContext, extendedMarket);

      expect(pathResult.funded).toBe(false);
      expect(pathResult.fundedTerminalBalance).toBe("0");

      for (let i = 0; i < pathResult.balances.length; i++) {
        const bal = new D(pathResult.balances[i]);
        expect(bal.gte(0)).toBe(true);
        expect(bal.isFinite()).toBe(true);
        expect(pathResult.balances[i]).not.toContain("-");
      }
    });
  });

  // TEST 4: Extended 50-Year Horizon (600 Months) and Path-Month Limits
  describe("Verification 4: 50-Year Horizon (600 Months) Edge Cases", () => {
    it("extends a 40-year plan (480 months) by 10 years to reach 50 years (600 months) and executes deterministicStress successfully", () => {
      const c480 = riskContext(480);
      const market480: PathMarket[] = c480.projection.rows.map(() => ({
        cpi: "0.002",
        returns: { CASH: "0.003", EQUITY: "0.006" },
      }));

      // Longevity extension by 10 years (120 months) => 480 + 120 = 600 months
      const stressRes = deterministicStress("LONGEVITY", c480, market480, policy, undefined, 10);
      expect(stressRes.status).toBe("READY");
      if (stressRes.status === "READY") {
        expect(stressRes.result.balances.length).toBe(600);
        expect(Number.isFinite(Number(stressRes.result.essentialLossToday))).toBe(true);
        expect(Number.isFinite(Number(stressRes.result.unfundedWithdrawals))).toBe(true);
        for (const bal of stressRes.result.balances) {
          expect(new D(bal).gte(0)).toBe(true);
        }
      }
    });

    it("verifies Monte Carlo simulate with 600 months under path-months limits", async () => {
      const totalMonths = 600;
      const rows = Array.from({ length: totalMonths }, (_, i) => ({
        month: addMonths("2026-01", i),
        growthFactor: "1.004",
        inflationFactor: "1.002",
        income: i < 180 ? "80" : "0",
        pension: i >= 384 ? "50" : "0",
        livingExpense: "50",
        additionalExpense: "10",
        debtPayment: "0",
        plannedContribution: i < 180 ? "30" : "0",
        contribution: i < 180 ? "30" : "0",
        contributionCapacity: i < 180 ? "30" : "0",
        withdrawal: i < 180 ? "0" : i >= 384 ? "10" : "60",
        uninvestedSurplus: i < 180 ? "10" : "0",
        capitalInjection: "0",
      }));

      const context600: RiskContext = {
        selection: { ...riskContext().selection, endMonth: addMonths("2026-01", totalMonths - 1) },
        projection: {
          valuationDate: "2026-01-01",
          retirementMonth: addMonths("2026-01", 180),
          initialCapital: "5000",
          terminalBalance: "0",
          monthlyContribution: "30",
          contributionTiming: "END_OF_MONTH",
          modelVersion: "retirement-monthly-v3",
          rows,
        },
        essentialExpenses: rows.map(() => "40"),
        targets: rows.map(() => [
          { assetClass: "CASH", weightPercent: "40" },
          { assetClass: "EQUITY", weightPercent: "60" },
        ]),
        rebalance: rows.map((_, i) => i % 12 === 0),
        turnoverCostPercent: "0",
      };

      const data = marketFixture();

      // 1. Within limit: 600 months * 20 paths = 12,000 <= 200,000
      const resReady = await simulate(context600, data, policy, 20, performance.now() + 60000);
      expect(resReady.status).toBe("READY");
      if (resReady.status === "READY") {
        expect(resReady.bands.length).toBe(600);
        expect(resReady.paths).toBe(20);
      }

      // 2. Exact limit boundary: 600 * 333 = 199,800 <= 200,000
      expect(333 * 600).toBeLessThanOrEqual(LIMITS.maxPathMonths);

      // 3. Exceeded limit boundary: 600 * 334 = 200,400 > 200,000
      const resExceeded = await simulate(context600, data, policy, 334);
      expect(resExceeded.status).toBe("LIMIT_EXCEEDED");
      if (resExceeded.status === "LIMIT_EXCEEDED") {
        expect(resExceeded.issues).toContain("PATH_MONTH_LIMIT");
      }
    });
  });

  // TEST 5: Determinism Across Seeds and PRNG Properties
  describe("Verification 5: Determinism Across Seeds", () => {
    it("guarantees independent PRNG sequences for distinct seeds and 100% determinism for identical seeds", () => {
      const rng1A = randomGenerator(20261016);
      const rng1B = randomGenerator(20261016);
      const rng2 = randomGenerator(12345678);

      const seq1A = Array.from({ length: 100 }, () => rng1A());
      const seq1B = Array.from({ length: 100 }, () => rng1B());
      const seq2 = Array.from({ length: 100 }, () => rng2());

      // Same seed produces bit-for-bit identical sequence
      expect(seq1A).toEqual(seq1B);

      // Different seed produces completely different sequence
      expect(seq1A).not.toEqual(seq2);
    });
  });
});
