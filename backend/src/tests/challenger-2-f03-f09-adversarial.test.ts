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
  LIMITS,
  type RiskContext,
  type PathMarket,
} from "../modules/allocation-risk/simulation";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";

describe("Adversarial Challenger 2 — Extended Horizon Planning (F03) & 8/8 Stresses (F09)", () => {
  const policy = riskPolicySchema.parse({
    evidence: "Challenger 2 comprehensive stress policy",
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
    blockMonths: 12,
    cvarAlpha: "0.95",
    essentialThreshold: "0.90",
  });

  // =========================================================================
  // SECTION 1: Monte Carlo Bit-For-Bit Determinism with Seed 20261016
  // =========================================================================
  describe("Section 1: Adversarial Determinism with Seed 20261016", () => {
    it("guarantees 100% bit-for-bit identical outputs across 5 sequential simulations", async () => {
      const c = riskContext(24);
      const data = marketFixture();

      const runs: any[] = [];
      for (let i = 0; i < 5; i++) {
        const run = await simulate(c, data, policy, 20);
        expect(run.status).toBe("READY");
        runs.push(run);
      }

      const baselineJson = JSON.stringify(runs[0]);
      for (let i = 1; i < runs.length; i++) {
        expect(JSON.stringify(runs[i])).toBe(baselineJson);
        expect(runs[i].pEssential).toBe(runs[0].pEssential);
        expect(runs[i].cvarEssentialShortfallToday).toBe(runs[0].cvarEssentialShortfallToday);
        expect(runs[i].wilson).toEqual(runs[0].wilson);
        expect(runs[i].bands).toEqual(runs[0].bands);
      }
    });

    it("maintains PRNG isolation under concurrent execution (Promise.all)", async () => {
      const c1 = riskContext(24);
      const c2 = riskContext(36);
      const data = marketFixture();

      // Run sequentially first to get oracle baselines
      const seq1 = await simulate(c1, data, policy, 15);
      const seq2 = await simulate(c2, data, policy, 15);

      // Run concurrently
      const [par1, par2] = await Promise.all([
        simulate(c1, data, policy, 15),
        simulate(c2, data, policy, 15),
      ]);

      expect(JSON.stringify(par1)).toBe(JSON.stringify(seq1));
      expect(JSON.stringify(par2)).toBe(JSON.stringify(seq2));
    });

    it("leaves zero state residue when interleaved across different profiles", async () => {
      const c = riskContext(24);
      const richContext = riskContext(24);
      richContext.projection.initialCapital = "50000000";
      const data = marketFixture();

      const runA1 = await simulate(c, data, policy, 20);
      // Interleave with different profile
      const runInterleaved = await simulate(richContext, data, policy, 20);
      expect(runInterleaved.status).toBe("READY");
      // Re-run original profile
      const runA2 = await simulate(c, data, policy, 20);

      expect(JSON.stringify(runA2)).toBe(JSON.stringify(runA1));
    });
  });

  // =========================================================================
  // SECTION 2: Extended Horizon Planning (40y & 50y FIRE) & Limit Defenses
  // =========================================================================
  describe("Section 2: Extended Horizon Planning & Strict Limit Enforcement", () => {
    it("simulates 40-year horizon (480 months) cleanly without NaN, Infinity, or memory leaks", async () => {
      const c = riskContext(480);
      const data = marketFixture();

      // 480 * 20 = 9600 path-months <= 200,000
      const startTime = performance.now();
      const res = await simulate(c, data, policy, 20, performance.now() + 60000);
      const durationMs = performance.now() - startTime;

      expect(res.status).toBe("READY");
      if (res.status === "READY") {
        expect(res.bands.length).toBe(480);
        expect(res.paths).toBe(20);
        expect(Number.isFinite(res.pEssential)).toBe(true);
        expect(Number.isFinite(Number(res.cvarEssentialShortfallToday))).toBe(true);

        for (let i = 0; i < 480; i++) {
          const band = res.bands[i];
          expect(band.month).toBe(c.projection.rows[i].month);
          expect(band.p10).not.toBe("NaN");
          expect(band.p50).not.toBe("NaN");
          expect(band.p90).not.toBe("NaN");

          const p10 = Number(band.p10);
          const p50 = Number(band.p50);
          const p90 = Number(band.p90);
          expect(Number.isFinite(p10)).toBe(true);
          expect(Number.isFinite(p50)).toBe(true);
          expect(Number.isFinite(p90)).toBe(true);
          expect(p10).toBeGreaterThanOrEqual(0);
          expect(p10).toBeLessThanOrEqual(p50);
          expect(p50).toBeLessThanOrEqual(p90);
        }
      }
      expect(durationMs).toBeLessThan(30000);
    });

    it("enforces path-month upper bound rejection on 40-year horizon (480 * 417 > 200,000)", async () => {
      const c = riskContext(480);
      const data = marketFixture();

      // 480 * 417 = 200,160 > 200,000
      const overLimitRes = await simulate(c, data, policy, 417);
      expect(overLimitRes.status).toBe("LIMIT_EXCEEDED");
      if (overLimitRes.status === "LIMIT_EXCEEDED") {
        expect(overLimitRes.issues).toContain("PATH_MONTH_LIMIT");
      }

      // Negative and zero paths rejection
      expect((await simulate(c, data, policy, 0)).status).toBe("LIMIT_EXCEEDED");
      expect((await simulate(c, data, policy, -5)).status).toBe("LIMIT_EXCEEDED");
      expect((await simulate(c, data, policy, 501)).status).toBe("LIMIT_EXCEEDED");
    });

    it("successfully simulates 50-year FIRE case (600 months) with Monte Carlo bootstrap", async () => {
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
          income: isAccumulation ? "100" : "0",
          pension: hasPension ? "50" : "0",
          livingExpense: "50",
          additionalExpense: "10",
          debtPayment: "0",
          plannedContribution: isAccumulation ? "40" : "0",
          contribution: isAccumulation ? "40" : "0",
          contributionCapacity: isAccumulation ? "40" : "0",
          withdrawal: isAccumulation ? "0" : hasPension ? "10" : "60",
          uninvestedSurplus: isAccumulation ? "10" : "0",
          capitalInjection: "0",
        };
      });

      const fireContext: RiskContext = {
        selection: { ...riskContext().selection, endMonth: addMonths("2026-01", totalMonths - 1) },
        projection: {
          valuationDate: "2026-01-01",
          retirementMonth: addMonths("2026-01", retirementMonthIndex),
          initialCapital: "5000",
          terminalBalance: "0",
          monthlyContribution: "40",
          contributionTiming: "END_OF_MONTH",
          modelVersion: "retirement-monthly-v3",
          rows,
        },
        essentialExpenses: rows.map(() => "40"),
        targets: rows.map((_, i) => [
          { assetClass: "CASH", weightPercent: i < retirementMonthIndex ? "20" : "50" },
          { assetClass: "EQUITY", weightPercent: i < retirementMonthIndex ? "80" : "50" },
        ]),
        rebalance: rows.map((_, i) => i % 12 === 0),
        turnoverCostPercent: "0.1",
      };

      const data = marketFixture();

      // 600 * 15 = 9000 path-months <= 200,000
      const res = await simulate(fireContext, data, policy, 15, performance.now() + 60000);
      expect(res.status).toBe("READY");

      if (res.status === "READY") {
        expect(res.bands.length).toBe(600);
        expect(res.paths).toBe(15);
        expect(Number.isFinite(res.pEssential)).toBe(true);
        expect(res.pEssential).toBeGreaterThanOrEqual(0);
        expect(res.pEssential).toBeLessThanOrEqual(1);

        // Check Wilson confidence interval validity
        expect(res.wilson.lower).toBeGreaterThanOrEqual(0);
        expect(res.wilson.upper).toBeLessThanOrEqual(1);
        expect(res.wilson.lower).toBeLessThanOrEqual(res.wilson.upper);

        // Verify percentile ordering across all 600 months
        for (let m = 0; m < 600; m++) {
          const b = res.bands[m];
          const p10 = Number(b.p10);
          const p50 = Number(b.p50);
          const p90 = Number(b.p90);
          expect(Number.isFinite(p10)).toBe(true);
          expect(Number.isFinite(p50)).toBe(true);
          expect(Number.isFinite(p90)).toBe(true);
          expect(p10).toBeLessThanOrEqual(p50);
          expect(p50).toBeLessThanOrEqual(p90);
          expect(p10).toBeGreaterThanOrEqual(0);
        }
      }

      // Boundary rejection for 50-year plan: 600 * 334 = 200,400 > 200,000
      const overLimit50 = await simulate(fireContext, data, policy, 334);
      expect(overLimit50.status).toBe("LIMIT_EXCEEDED");
    });

    it("rejects immediately with RUNTIME_LIMIT_NO_PARTIAL_ESTIMATE on expired deadline", async () => {
      const c = riskContext(24);
      const data = marketFixture();
      const pastDeadline = performance.now() - 100;

      const res = await simulate(c, data, policy, 20, pastDeadline);
      expect(res.status).toBe("LIMIT_EXCEEDED");
      if (res.status === "LIMIT_EXCEEDED") {
        expect(res.issues).toContain("RUNTIME_LIMIT_NO_PARTIAL_ESTIMATE");
      }
    });
  });

  // =========================================================================
  // SECTION 3: 8/8 Stresses Suite — READY Status, Realistic & Non-negative Loss
  // =========================================================================
  describe("Section 3: 8/8 Stress Shocks Suite Adversarial Verification", () => {
    it("returns READY for all 8 stress kinds with non-negative, finite essential loss", () => {
      const c = riskContext(24);
      c.projection.rows[0].capitalInjection = "300";
      const market: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.003",
        returns: { CASH: "0.003", EQUITY: "0.006" },
      }));
      const propertyInjections = [{ month: "2026-01", amount: "300" }];

      for (const kind of stressKinds) {
        const stressRes = deterministicStress(kind, c, market, policy, propertyInjections);
        expect(stressRes.status).toBe("READY");
        expect(stressRes.kind).toBe(kind);

        if (stressRes.status === "READY") {
          const { result } = stressRes;

          // Essential loss must be finite and >= 0
          const loss = new D(result.essentialLossToday);
          expect(loss.isFinite()).toBe(true);
          expect(loss.gte(0)).toBe(true);

          // Unfunded withdrawals must be finite and >= 0
          const unfunded = new D(result.unfundedWithdrawals);
          expect(unfunded.isFinite()).toBe(true);
          expect(unfunded.gte(0)).toBe(true);

          // Terminal balance must be finite and >= 0
          const term = new D(result.fundedTerminalBalance);
          expect(term.isFinite()).toBe(true);
          expect(term.gte(0)).toBe(true);

          // Every monthly closing balance must be finite and >= 0 (Zero-Floor Liquidity)
          for (const bal of result.balances) {
            const b = new D(bal);
            expect(b.isFinite()).toBe(true);
            expect(b.gte(0)).toBe(true);
          }
        }
      }
    });

    it("verifies monotonic stress response under graduated EQUITY_CRASH shocks", () => {
      const c = riskContext(24);
      c.projection.initialCapital = "1800"; // Moderate capital
      const market: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.002",
        returns: { CASH: "0.002", EQUITY: "0.005" },
      }));

      const shocks = ["-10", "-25", "-50", "-75"];
      const losses: InstanceType<typeof D>[] = [];
      const terminals: InstanceType<typeof D>[] = [];

      for (const shockPercent of shocks) {
        const customPolicy = riskPolicySchema.parse({
          evidence: `Equity crash shock ${shockPercent}`,
          stresses: {
            ...policy.stresses,
            EQUITY_CRASH: { offsetMonths: 0, assetClass: "EQUITY", shockPercent },
          },
        });

        const res = deterministicStress("EQUITY_CRASH", c, market, customPolicy);
        expect(res.status).toBe("READY");
        if (res.status === "READY") {
          losses.push(new D(res.result.essentialLossToday));
          terminals.push(new D(res.result.fundedTerminalBalance));
        }
      }

      // As crash deepens, essential loss must be monotonically non-decreasing
      for (let i = 1; i < losses.length; i++) {
        expect(losses[i].gte(losses[i - 1])).toBe(true);
      }
      // And terminal balance must be monotonically non-increasing
      for (let i = 1; i < terminals.length; i++) {
        expect(terminals[i].lte(terminals[i - 1])).toBe(true);
      }
    });

    it("verifies monotonic stress response under graduated HIGH_INFLATION shocks", () => {
      const c = riskContext(24);
      c.projection.initialCapital = "2000";
      const market: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.002",
        returns: { CASH: "0.003", EQUITY: "0.005" },
      }));

      const deltas = ["5", "10", "20", "50"];
      const losses: InstanceType<typeof D>[] = [];

      for (const delta of deltas) {
        const customPolicy = riskPolicySchema.parse({
          evidence: `Inflation delta ${delta}`,
          stresses: {
            ...policy.stresses,
            HIGH_INFLATION: { offsetMonths: 0, durationMonths: 12, annualDeltaPoints: delta },
          },
        });

        const res = deterministicStress("HIGH_INFLATION", c, market, customPolicy);
        expect(res.status).toBe("READY");
        if (res.status === "READY") {
          losses.push(new D(res.result.essentialLossToday));
        }
      }

      // Essential loss under higher inflation must be non-decreasing
      for (let i = 1; i < losses.length; i++) {
        expect(losses[i].gte(losses[i - 1])).toBe(true);
      }
    });

    it("validates purchasing power discounting oracle for essentialLossToday", () => {
      // In zero-inflation environment (CPI = 0), essentialLossToday must match nominal shortfall
      const c = riskContext(12);
      c.projection.initialCapital = "0"; // All spending unfunded
      c.projection.rows.forEach(r => {
        r.livingExpense = "100";
        r.withdrawal = "100";
      });
      c.essentialExpenses = c.projection.rows.map(() => "100");

      const zeroInfMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0",
        returns: { CASH: "0", EQUITY: "0" },
      }));

      const resZero = runPath(c, zeroInfMarket);
      // 12 months * 100 = 1200 nominal unmet, exactly 1200 today
      expect(resZero.essentialLossToday).toBe("1200");

      // In positive-inflation environment (CPI > 0), essentialLossToday must be strictly less than nominal unmet
      const posInfMarket: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0.01", // 1% per month
        returns: { CASH: "0", EQUITY: "0" },
      }));

      const resPos = runPath(c, posInfMarket);
      expect(new D(resPos.essentialLossToday).lt(new D(resPos.unfundedWithdrawals))).toBe(true);
      expect(new D(resPos.essentialLossToday).gt(0)).toBe(true);
    });

    it("rejects gracefully when stress scenario parameters are missing or out of horizon", () => {
      const c = riskContext(12);
      const market: PathMarket[] = c.projection.rows.map(() => ({
        cpi: "0",
        returns: { CASH: "0", EQUITY: "0" },
      }));

      // Missing policy
      expect(deterministicStress("EQUITY_CRASH", c, market, undefined).status).toBe("REVIEW_REQUIRED");

      // Scenario outside horizon: offset 200 months for a 12-month plan
      const outOfBoundsPolicy = riskPolicySchema.parse({
        evidence: "Out of bounds policy",
        stresses: {
          EQUITY_CRASH: { offsetMonths: 200, assetClass: "EQUITY", shockPercent: "-20" },
        },
      });
      const resOut = deterministicStress("EQUITY_CRASH", c, market, outOfBoundsPolicy);
      expect(resOut.status).toBe("REVIEW_REQUIRED");
      if (resOut.status === "REVIEW_REQUIRED") {
        expect(resOut.issues).toContain("SCENARIO_OUTSIDE_PLAN_HORIZON");
      }
    });
  });
});
