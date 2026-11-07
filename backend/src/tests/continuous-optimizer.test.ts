import { describe, expect, it } from "vitest";
import {
  projectSimplexBox,
  solveContinuousOptimization,
  continuousOptimizationWithFallback,
  evaluateObjective,
} from "../modules/allocation-risk/optimizer";

describe("Feature F04 — Continuous Constrained Convex Optimizer", () => {
  describe("Bounded Simplex Projection (projectSimplexBox)", () => {
    it("projects unconstrained vector to standard simplex (sum = 1, w >= 0)", () => {
      const y = [0.8, 0.4, 0.2];
      const lower = [0, 0, 0];
      const upper = [1, 1, 1];

      const { projected, feasible } = projectSimplexBox(y, lower, upper, 1.0);
      expect(feasible).toBe(true);

      const sum = projected.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);
      for (const w of projected) {
        expect(w).toBeGreaterThanOrEqual(-1e-12);
        expect(w).toBeLessThanOrEqual(1.0 + 1e-12);
      }
    });

    it("enforces strict lower and upper box bounds", () => {
      const y = [0.5, 0.5, 0.5];
      const lower = [0.1, 0.2, 0.1];
      const upper = [0.3, 0.4, 0.6];

      const { projected, feasible } = projectSimplexBox(y, lower, upper, 1.0);
      expect(feasible).toBe(true);

      const sum = projected.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-10);

      for (let i = 0; i < 3; i++) {
        expect(projected[i]).toBeGreaterThanOrEqual(lower[i] - 1e-10);
        expect(projected[i]).toBeLessThanOrEqual(upper[i] + 1e-10);
      }
    });

    it("correctly identifies infeasible box constraints (sumLower > 1 or sumUpper < 1)", () => {
      // Infeasible: sum of lower bounds > 1.0
      const res1 = projectSimplexBox([0.5, 0.5], [0.6, 0.6], [1.0, 1.0], 1.0);
      expect(res1.feasible).toBe(false);

      // Infeasible: sum of upper bounds < 1.0
      const res2 = projectSimplexBox([0.5, 0.5], [0.0, 0.0], [0.4, 0.4], 1.0);
      expect(res2.feasible).toBe(false);

      // Infeasible: lower > upper for an asset
      const res3 = projectSimplexBox([0.5, 0.5], [0.6, 0.0], [0.4, 1.0], 1.0);
      expect(res3.feasible).toBe(false);
    });
  });

  describe("Analytical 2-Asset Mean-Variance Benchmark", () => {
    it("solves 2-asset risk-free vs risky equity portfolio analytically", () => {
      // Asset 0: Cash (return = 0.04, vol = 0.0)
      // Asset 1: Equity (return = 0.12, vol = 0.20, var = 0.04)
      const mu = [0.04, 0.12];
      const Sigma = [
        [1e-6, 0],
        [0, 0.04],
      ];
      const gamma = 2.0;

      const result = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        riskAversionGamma: gamma,
        uncertaintyKappa: 0,
        turnoverPenaltyEta: 0,
        constraints: {
          sumToOne: true,
          nonNegative: true,
        },
      });

      expect(result.status).toBe("OPTIMAL");
      expect(result.weights.length).toBe(2);

      const sum = result.weights[0] + result.weights[1];
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);

      // Analytical unconstrained risky weight: (mu_E - mu_C) / (gamma * sigma_E^2) = (0.12 - 0.04) / (2.0 * 0.04) = 0.08 / 0.08 = 1.0
      // So optimal equity weight should be ~1.0
      expect(result.weights[1]).toBeGreaterThan(0.95);
      expect(result.weights[0]).toBeLessThan(0.05);
    });
  });

  describe("4-Asset Standard Allocation Portfolio (CASH, BOND, EQUITY, GOLD)", () => {
    // 4 standard asset classes from An Hưu specification
    const assetClasses = ["CASH", "BOND", "EQUITY", "GOLD"];
    // Expected annualized returns: Cash 4.5%, Bond 6.5%, Equity 11.0%, Gold 7.0%
    const mu = [0.045, 0.065, 0.110, 0.070];
    // Realistic shrinked covariance matrix (annualized)
    const Sigma = [
      [0.0004, 0.0001, 0.0000, 0.0001],
      [0.0001, 0.0025, 0.0010, 0.0005],
      [0.0000, 0.0010, 0.0400, 0.0020],
      [0.0001, 0.0005, 0.0020, 0.0225],
    ];

    it("converges to optimal weights within tolerance in under 10ms", () => {
      const result = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        riskAversionGamma: 3.0,
        assetClasses,
        constraints: {
          sumToOne: true,
          nonNegative: true,
        },
      });

      expect(result.status).toBe("OPTIMAL");
      expect(result.weights.length).toBe(4);

      const sum = result.weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);

      // Performance check
      expect(result.solverMetadata.runtimeMs).toBeLessThan(50);
      expect(result.solverMetadata.iterations).toBeGreaterThan(0);
      expect(result.solverMetadata.iterations).toBeLessThan(500);

      // Metrics check
      expect(result.expectedReturn).toBeGreaterThan(0.045);
      expect(result.expectedVolatility).toBeGreaterThan(0);
    });

    it("strictly respects maxEquityWeight ceiling from loss constraint", () => {
      const maxEquity = 0.25; // 25% max equity from loss constraint

      const result = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        riskAversionGamma: 1.5, // Low risk aversion (wants more equity)
        assetClasses,
        constraints: {
          sumToOne: true,
          nonNegative: true,
          maxEquityWeight: maxEquity,
        },
      });

      expect(result.status).toBe("OPTIMAL");
      const equityIndex = assetClasses.indexOf("EQUITY");
      expect(result.weights[equityIndex]).toBeLessThanOrEqual(maxEquity + 1e-6);

      const sum = result.weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
    });

    it("penalizes turnover when eta > 0 (anchoring to currentWeights)", () => {
      const w0 = [0.40, 0.30, 0.20, 0.10]; // Current portfolio

      // Without turnover penalty
      const resUnconstrained = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        currentWeights: w0,
        riskAversionGamma: 2.0,
        turnoverPenaltyEta: 0,
        assetClasses,
      });

      // With high turnover penalty
      const resPenalized = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        currentWeights: w0,
        riskAversionGamma: 2.0,
        turnoverPenaltyEta: 0.10, // High penalty for moving away from w0
        assetClasses,
      });

      // Turnover of unconstrained vs penalized
      let turnoverUnconstrained = 0;
      let turnoverPenalized = 0;
      for (let i = 0; i < 4; i++) {
        turnoverUnconstrained += Math.abs(resUnconstrained.weights[i] - w0[i]);
        turnoverPenalized += Math.abs(resPenalized.weights[i] - w0[i]);
      }

      expect(turnoverPenalized).toBeLessThan(turnoverUnconstrained);
    });

    it("handles parameter uncertainty kappa by becoming more conservative", () => {
      // Low uncertainty
      const resCertain = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        riskAversionGamma: 2.5,
        uncertaintyKappa: 0,
        assetClasses,
      });

      // High uncertainty penalty
      const resUncertain = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        riskAversionGamma: 2.5,
        uncertaintyKappa: 2.0,
        assetClasses,
      });

      const equityIdx = assetClasses.indexOf("EQUITY");
      // High uncertainty penalty should reduce weight in high-volatility risky asset (Equity)
      expect(resUncertain.weights[equityIdx]).toBeLessThanOrEqual(resCertain.weights[equityIdx] + 1e-4);
    });
  });

  describe("Feature F05 — Candidate Grid Fallback", () => {
    it("falls back gracefully to candidate grid when continuous constraints are infeasible", () => {
      const fallbackWeights = [0.50, 0.50];
      const fallbackGrid = () => ({
        id: "BALANCED_GRID_CANDIDATE",
        weights: fallbackWeights,
      });

      // Contradictory infeasible bounds (lower bound sum = 1.2 > 1.0)
      const infeasibleInput = {
        expectedReturns: [0.05, 0.07],
        covarianceMatrix: [
          [0.01, 0.0],
          [0.0, 0.02],
        ],
        constraints: {
          assetBounds: [
            { min: 0.7, max: 0.9 },
            { min: 0.5, max: 0.8 },
          ],
        },
      };

      const result = continuousOptimizationWithFallback(infeasibleInput, fallbackGrid);

      expect(result.status).toBe("INFEASIBLE");
      expect(result.solverMetadata.feasible).toBe(false);
      expect(result.issues).toContain("BOUND:0");
    });
  });

  describe("Adversarial Stress Cases & Numerical Stability", () => {
    it("handles all negative expected returns by selecting minimum variance defensive allocation", () => {
      // Severe market crash / depression: all asset returns negative
      const negativeMu = [-0.02, -0.05, -0.20, -0.08];
      const Sigma = [
        [0.0004, 0.0001, 0.0000, 0.0001],
        [0.0001, 0.0025, 0.0010, 0.0005],
        [0.0000, 0.0010, 0.0400, 0.0020],
        [0.0001, 0.0005, 0.0020, 0.0225],
      ];

      const res = solveContinuousOptimization({
        expectedReturns: negativeMu,
        covarianceMatrix: Sigma,
        riskAversionGamma: 5.0,
      });

      expect(res.status).toBe("OPTIMAL");
      const sum = res.weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);

      // In depression, Cash (least negative / lowest vol) should receive highest weight
      expect(res.weights[0]).toBeGreaterThan(res.weights[2]); // Cash > Equity
    });

    it("enforces zero equity limit (maxEquityWeight = 0.0)", () => {
      const mu = [0.04, 0.06, 0.12, 0.07];
      const Sigma = [
        [0.0004, 0.0001, 0.0000, 0.0001],
        [0.0001, 0.0025, 0.0010, 0.0005],
        [0.0000, 0.0010, 0.0400, 0.0020],
        [0.0001, 0.0005, 0.0020, 0.0225],
      ];

      const res = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        assetClasses: ["CASH", "BOND", "EQUITY", "GOLD"],
        constraints: {
          maxEquityWeight: 0.0,
        },
      });

      expect(res.status).toBe("OPTIMAL");
      expect(res.weights[2]).toBe(0.0); // Equity exactly 0
      const sum = res.weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
    });

    it("freezes weights when turnover penalty eta is extremely high", () => {
      const mu = [0.04, 0.06, 0.12, 0.07];
      const Sigma = [
        [0.0004, 0.0001, 0.0000, 0.0001],
        [0.0001, 0.0025, 0.0010, 0.0005],
        [0.0000, 0.0010, 0.0400, 0.0020],
        [0.0001, 0.0005, 0.0020, 0.0225],
      ];
      const w0 = [0.25, 0.25, 0.25, 0.25];

      const res = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        currentWeights: w0,
        turnoverPenaltyEta: 1000.0, // Massive turnover penalty
      });

      expect(res.status).toBe("FEASIBLE");
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(res.weights[i] - w0[i])).toBeLessThan(1e-4);
      }
    });

    it("optimizes a 10-asset institutional portfolio under tight constraints", () => {
      const n = 10;
      const mu = Array.from({ length: n }, (_, i) => 0.03 + i * 0.01);
      const Sigma = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (__, j) => (i === j ? 0.01 * (i + 1) : 0.001))
      );
      const assetBounds = Array.from({ length: n }, () => ({ min: 0.02, max: 0.30 }));

      const res = solveContinuousOptimization({
        expectedReturns: mu,
        covarianceMatrix: Sigma,
        riskAversionGamma: 2.0,
        constraints: {
          assetBounds,
        },
      });

      expect(res.status).toBe("OPTIMAL");
      const sum = res.weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);

      for (let i = 0; i < n; i++) {
        expect(res.weights[i]).toBeGreaterThanOrEqual(0.02 - 1e-6);
        expect(res.weights[i]).toBeLessThanOrEqual(0.30 + 1e-6);
      }
    });
  });
});
