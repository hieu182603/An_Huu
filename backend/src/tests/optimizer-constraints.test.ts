import { describe, expect, it } from "vitest";
import { checkPortfolioFeasibility, continuousOptimizationWithFallback, solveContinuousOptimization, type ContinuousOptimizationInput } from "../modules/allocation-risk/optimizer";
const base: ContinuousOptimizationInput = { expectedReturns: [.04, .12], covarianceMatrix: [[0, 0], [0, .04]], options: { maxIterations: 0 } };
describe("Optimizer hard constraints apply equally to solver and fallback", () => {
  it.each([
    ["lower", [0.5, 0.5], { assetBounds: [{ min: .7, max: 1 }, { min: 0, max: 1 }] }],
    ["upper", [0.5, 0.5], { assetBounds: [{ min: 0, max: .3 }, { min: 0, max: 1 }] }],
    ["sum", [.4, .4], {}], ["negative", [-.1, 1.1], {}], ["NaN", [NaN, 1], {}],
    ["loss", [.5, .5], { hardLimits: [{ id: "MAX_LOSS", coefficients: [0, .4], max: .1 }] }],
    ["liquidity", [.5, .5], { hardLimits: [{ id: "LIQUIDITY", coefficients: [1, 0], min: .8 }] }],
    ["issuer", [.5, .5], { hardLimits: [{ id: "ISSUER", coefficients: [0, 1], max: .25 }] }],
    ["protected", [.5, .5], { hardLimits: [{ id: "PROTECTED", coefficients: [1, 0], min: .9 }] }],
    ["lock", [.5, .5], { lockedWeights: [{ index: 0, weight: .6 }] }],
  ] as Array<[string, number[], ContinuousOptimizationInput["constraints"]]>) ("rejects invalid %s candidate", (_, weights, constraints) => {
    const input = { ...base, constraints };
    expect(checkPortfolioFeasibility(input, weights).feasible).toBe(false);
    const result = continuousOptimizationWithFallback(input, () => ({ weights, id: "invalid" }));
    if (result.solverMetadata.feasible) expect(checkPortfolioFeasibility(input, result.weights).feasible).toBe(true);
    expect(result.solverMetadata.method).not.toBe("GRID_FALLBACK");
  });
  it("accepts a valid fallback without claiming optimality", () => {
    const result = continuousOptimizationWithFallback(base, () => ({ weights: [.75, .25], id: "valid" }));
    expect(result.status).toBe("FEASIBLE");
    expect(result.solverMetadata.method).toBe("GRID_FALLBACK");
    expect(result.weights).toEqual([.75, .25]);
  });
  it("checks the single-asset shortcut against bounds", () => {
    const result = solveContinuousOptimization({ expectedReturns: [.1], covarianceMatrix: [[0]], constraints: { assetBounds: [{ min: 0, max: .8 }] } });
    expect(result.status).toBe("INFEASIBLE");
    expect(result.solverMetadata.feasible).toBe(false);
  });
  it("never widens tolerance from solver options", () => {
    const input = { ...base, options: { tolerance: .5 }, constraints: { assetBounds: [{ min: .7, max: 1 }, { min: 0, max: 1 }] } };
    expect(checkPortfolioFeasibility(input, [.7 - 1e-9, .3 + 1e-9]).feasible).toBe(true);
    expect(checkPortfolioFeasibility(input, [.69, .31]).feasible).toBe(false);
  });
  it("sums all equity products for the equity cap", () => {
    expect(checkPortfolioFeasibility({ ...base, assetClasses: ["EQUITY", "EQUITY"], constraints: { maxEquityWeight: .6 } }, [.5, .5]).feasible).toBe(false);
  });
  it.each([{ covarianceMatrix: [[NaN, 0], [0, 1]] }, { covarianceMatrix: [[1, 2], [2, 1]] }, { covarianceMatrix: [[1], [0, 1]] }])("fails closed for invalid covariance %j", ({ covarianceMatrix }) => {
    const result = continuousOptimizationWithFallback({ ...base, covarianceMatrix }, () => ({ weights: [.5, .5], id: "x" }));
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.solverMetadata.feasible).toBe(false);
  });
  it("accepts singular PSD without inversion and reports nonconvergence honestly", () => {
    const result = solveContinuousOptimization({ ...base, covarianceMatrix: [[0, 0], [0, 0]] });
    expect(result.status).toBe("FEASIBLE");
    expect(result.solverMetadata.feasible).toBe(true);
    expect(result.issues).toContain("OPTIMALITY_NOT_CERTIFIED");
  });
});
