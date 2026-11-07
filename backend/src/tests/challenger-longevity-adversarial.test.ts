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
  type RiskContext,
  type PathMarket,
} from "../modules/allocation-risk/simulation";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";

describe("Adversarial Challenger Suite — Longevity Stress & Zero-Floor Liquidity", () => {
  const policy = riskPolicySchema.parse({
    evidence: "Challenger adversarial test policy",
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

  // CHALLENGE 1: Extreme Inputs — Zero Initial Capital
  describe("Challenge 1.1: Extreme Input — Zero Initial Capital", () => {
    it("never produces negative balances when initial capital is 0 across 5-year extension", () => {
      const c = riskContext(12);
      c.projection.initialCapital = "0";
      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.005",
        returns: { CASH: "0.003", EQUITY: "0.008" },
      }));

      const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 5);
      const res = runPath(extendedContext, extendedMarket);

      expect(res.funded).toBe(false);
      expect(new D(res.unfundedWithdrawals).gt(0)).toBe(true);
      expect(new D(res.essentialLossToday).gt(0)).toBe(true);
      expect(res.fundedTerminalBalance).toBe("0");

      expect(res.balances.length).toBe(72);
      for (let i = 0; i < res.balances.length; i++) {
        const bal = new D(res.balances[i]);
        expect(bal.gte(0)).toBe(true);
        expect(bal.isFinite()).toBe(true);
        expect(res.balances[i]).toBe("0"); // With 0 initial capital and no surplus, balance stays 0
      }
    });

    it("deterministicStress('LONGEVITY') reports READY and zero balances with 0 initial capital", () => {
      const c = riskContext(12);
      c.projection.initialCapital = "0";
      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.004",
        returns: { CASH: "0.003", EQUITY: "0.005" },
      }));

      const stressRes = deterministicStress("LONGEVITY", c, baseMarket, policy, undefined, 10);
      expect(stressRes.status).toBe("READY");
      if (stressRes.status === "READY") {
        expect(stressRes.result.funded).toBe(false);
        expect(stressRes.result.fundedTerminalBalance).toBe("0");
        expect(stressRes.result.balances.length).toBe(132);
        for (const bal of stressRes.result.balances) {
          expect(new D(bal).gte(0)).toBe(true);
          expect(bal).toBe("0");
        }
      }
    });
  });

  // CHALLENGE 2: Extreme Inputs — Zero Pension & Zero Income
  describe("Challenge 1.2: Extreme Input — Zero Pension & Zero Non-Labor Income", () => {
    it("handles 100% self-funded retirement under longevity stress with exact depletion point", () => {
      const c = riskContext(12);
      c.projection.initialCapital = "600"; // Enough for 6 months at 100/mo
      c.projection.rows.forEach(r => {
        r.pension = "0";
        r.income = "0";
        r.livingExpense = "100";
        r.additionalExpense = "0";
        r.debtPayment = "0";
        r.withdrawal = "100";
      });
      c.essentialExpenses = c.projection.rows.map(() => "100");

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0",
        returns: { CASH: "0", EQUITY: "0" },
      }));

      const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 5);
      const res = runPath(extendedContext, extendedMarket);

      expect(res.balances.length).toBe(72);
      // Months 0 to 5: 500, 400, 300, 200, 100, 0
      expect(res.balances[0]).toBe("500");
      expect(res.balances[5]).toBe("0");
      // Months 6 to 71: balance strictly 0, never negative
      for (let i = 6; i < 72; i++) {
        expect(res.balances[i]).toBe("0");
        expect(new D(res.balances[i]).gte(0)).toBe(true);
      }
      expect(res.funded).toBe(false);
      expect(res.fundedTerminalBalance).toBe("0");
      // Unfunded withdrawals should be exactly (72 - 6) * 100 = 6600
      expect(res.unfundedWithdrawals).toBe("6600");
    });
  });

  // CHALLENGE 3: Extreme Inputs — Extreme CPI Inflation (Hyperinflation & Deflation)
  describe("Challenge 1.3: Extreme Input — Hyperinflation and Deflation", () => {
    it("compounds correctly under severe hyperinflation (10% monthly CPI / ~214% annual) without NaN/Infinity", () => {
      const c = riskContext(12);
      c.projection.initialCapital = "1000000000";
      const lastIndex = 11;
      c.projection.rows[lastIndex].livingExpense = "100";
      c.projection.rows[lastIndex].additionalExpense = "50";
      c.projection.rows[lastIndex].pension = "0";
      c.projection.rows[lastIndex].income = "0";

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.10", // 10% per month
        returns: { CASH: "0.08", EQUITY: "0.15" },
      }));

      const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 5);
      expect(extendedContext.projection.rows.length).toBe(72);

      // Verify living expense compounds by (1.10)^k
      const factor = new D("1.10");
      let expectedLiving = new D("100");
      let expectedAdditional = new D("50");

      for (let k = 1; k <= 60; k++) {
        const row = extendedContext.projection.rows[11 + k];
        expectedLiving = expectedLiving.mul(factor);
        expectedAdditional = expectedAdditional.mul(factor);

        expect(row.livingExpense).toBe(expectedLiving.toFixed());
        expect(row.additionalExpense).toBe(expectedAdditional.toFixed());
        expect(Number.isFinite(Number(row.livingExpense))).toBe(true);
        expect(row.livingExpense).not.toContain("NaN");
        expect(row.livingExpense).not.toContain("Infinity");
      }

      // Run path simulation under hyperinflation
      const res = runPath(extendedContext, extendedMarket);
      for (const bal of res.balances) {
        expect(Number.isFinite(Number(bal))).toBe(true);
        expect(bal).not.toContain("NaN");
        expect(bal).not.toContain("Infinity");
        expect(new D(bal).gte(0)).toBe(true);
      }
    });

    it("handles deflation (negative CPI: -1% monthly) gracefully with strictly positive expenses", () => {
      const c = riskContext(12);
      const lastIndex = 11;
      c.projection.rows[lastIndex].livingExpense = "100";
      c.projection.rows[lastIndex].additionalExpense = "20";

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "-0.01", // -1% monthly deflation
        returns: { CASH: "0.001", EQUITY: "0.002" },
      }));

      const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 5);
      const factor = new D("0.99");
      let expectedLiving = new D("100");

      for (let k = 1; k <= 60; k++) {
        const row = extendedContext.projection.rows[11 + k];
        expectedLiving = expectedLiving.mul(factor);
        expect(row.livingExpense).toBe(expectedLiving.toFixed());
        expect(new D(row.livingExpense).gt(0)).toBe(true);
      }

      const res = runPath(extendedContext, extendedMarket);
      for (const bal of res.balances) {
        expect(new D(bal).gte(0)).toBe(true);
      }
    });
  });

  // CHALLENGE 4: Expired Debts, Employment Salaries & Planned Contributions Cutoff
  describe("Challenge 2: Verification of Expired Debts, Salaries & Planned Contributions", () => {
    it("guarantees 100% cutoff: debts=0, plannedContribution=0, capitalInjection=0 across all 60 & 120 months", () => {
      const c = riskContext(24);
      const lastIdx = 23;
      // Set high active debt, active planned contribution, and capital injection in the last base month
      c.projection.rows[lastIdx].debtPayment = "50000000";
      c.projection.rows[lastIdx].plannedContribution = "25000000";
      c.projection.rows[lastIdx].contribution = "25000000";
      c.projection.rows[lastIdx].contributionCapacity = "30000000";
      c.projection.rows[lastIdx].capitalInjection = "200000000";
      c.projection.rows[lastIdx].pension = "12000000";
      c.projection.rows[lastIdx].income = "5000000"; // non-labor passive income

      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.003",
        returns: { CASH: "0.004", EQUITY: "0.007" },
      }));

      // Test 10 years (120 months) extension
      const { extendedContext } = extendLongevityContext(c, baseMarket, 10);
      expect(extendedContext.projection.rows.length).toBe(24 + 120);

      for (let k = 1; k <= 120; k++) {
        const row = extendedContext.projection.rows[23 + k];

        // Must be strictly zero
        expect(row.debtPayment).toBe("0");
        expect(row.plannedContribution).toBe("0");
        expect(row.contribution).toBe("0");
        expect(row.contributionCapacity).toBe("0");
        expect(row.capitalInjection).toBe("0");

        // Lifelong items are preserved
        expect(row.pension).toBe("12000000");
        expect(row.income).toBe("5000000");
      }
    });
  });

  // CHALLENGE 5: Exact CPI Inflation Compounding Oracle across 60 and 120 months
  describe("Challenge 3: Exact CPI Inflation Compounding Oracle", () => {
    it("matches mathematical power oracle L_0 * (1 + cpi)^k bit-for-bit across 60 and 120 months", () => {
      const c = riskContext(12);
      const lastIdx = 11;
      const initialLiving = "15000000";
      const initialAdditional = "3000000";
      const initialEssential = "15000000";
      c.projection.rows[lastIdx].livingExpense = initialLiving;
      c.projection.rows[lastIdx].additionalExpense = initialAdditional;
      c.essentialExpenses[lastIdx] = initialEssential;

      const monthlyCpiStr = "0.004123456789"; // Realistic non-trivial precision CPI
      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: monthlyCpiStr,
        returns: { CASH: "0.003", EQUITY: "0.006" },
      }));

      const factor = new D(monthlyCpiStr).plus(1);

      // Verify 10-year extension (120 months)
      const { extendedContext } = extendLongevityContext(c, baseMarket, 10);

      let runningLiving = new D(initialLiving);
      let runningAdditional = new D(initialAdditional);
      let runningEssential = new D(initialEssential);

      for (let k = 1; k <= 120; k++) {
        const row = extendedContext.projection.rows[11 + k];
        const essential = extendedContext.essentialExpenses[11 + k];

        runningLiving = runningLiving.mul(factor);
        runningAdditional = runningAdditional.mul(factor);
        runningEssential = runningEssential.mul(factor);

        // Verification: row values match exact Decimal recurrence
        expect(row.livingExpense).toBe(runningLiving.toFixed());
        expect(row.additionalExpense).toBe(runningAdditional.toFixed());
        expect(essential).toBe(runningEssential.toFixed());

        // Verify calendar sequence month format YYYY-MM
        expect(row.month).toBe(addMonths(c.projection.rows[lastIdx].month, k));
      }
    });
  });

  // CHALLENGE 6: Absolute Zero-Floor Liquidity Invariant
  describe("Challenge 4: Zero-Floor Liquidity Invariant Across Parameter Grid", () => {
    it("confirms fundedBalance >= 0 under multiple initial capital levels and market shocks", () => {
      const capitalLevels = ["0", "1", "100", "5000", "50000", "500000", "5000000"];

      for (const cap of capitalLevels) {
        const c = riskContext(24);
        c.projection.initialCapital = cap;
        c.projection.rows.forEach(r => {
          r.livingExpense = "1000";
          r.pension = "200";
          r.income = "0";
        });

        const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
          cpi: "0.005",
          // Extreme asset crash: -10% per month in equities
          returns: { CASH: "0.001", EQUITY: "-0.10" },
        }));

        const { extendedContext, extendedMarket } = extendLongevityContext(c, baseMarket, 5);
        const res = runPath(extendedContext, extendedMarket);

        expect(new D(res.fundedTerminalBalance).gte(0)).toBe(true);
        for (let m = 0; m < res.balances.length; m++) {
          const bal = new D(res.balances[m]);
          expect(bal.gte(0)).toBe(true);
          expect(bal.isFinite()).toBe(true);
          expect(res.balances[m]).not.toContain("-");
        }
      }
    });
  });

  // CHALLENGE 7: Parameter Validation & Bounds Enforcement
  describe("Challenge 5: Defensive Bounds Enforcement", () => {
    it("rejects invalid extraYears (non-integer, out of range [1, 30])", () => {
      const c = riskContext(12);
      const baseMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.003",
        returns: { CASH: "0.002", EQUITY: "0.005" },
      }));

      expect(() => extendLongevityContext(c, baseMarket, 0)).toThrow(RangeError);
      expect(() => extendLongevityContext(c, baseMarket, -1)).toThrow(RangeError);
      expect(() => extendLongevityContext(c, baseMarket, 31)).toThrow(RangeError);
      expect(() => extendLongevityContext(c, baseMarket, 1.5)).toThrow(RangeError);
      expect(() => extendLongevityContext(c, baseMarket, NaN)).toThrow(RangeError);
      expect(() => extendLongevityContext(c, baseMarket, Infinity)).toThrow(RangeError);
    });

    it("rejects empty projection context", () => {
      const c = riskContext(12);
      c.projection.rows = [];
      const baseMarket: PathMarket[] = [];
      expect(() => extendLongevityContext(c, baseMarket, 5)).toThrow(RangeError);
    });
  });
});
