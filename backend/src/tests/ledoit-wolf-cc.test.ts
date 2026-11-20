import { describe, expect, it } from "vitest";
import { ledoitWolf } from "../modules/allocation-risk/estimation";
import { riskPolicySchema } from "../modules/allocation-risk/policy";

describe("Ledoit-Wolf constant-correlation shrinkage target (B4-3)", () => {
  it("matches hand-calculated Ledoit-Wolf (2004) CONSTANT_CORRELATION values on a 3x3 matrix", () => {
    // 4 observations x 3 assets:
    // means = [1, 1, 2]
    // centered Y = [[1,0,-2], [-2,-1,1], [2,1,-1], [-1,0,2]]
    // sample covariance S (divisor n=4) = [[2.5, 1, -2], [1, 0.5, -0.5], [-2, -0.5, 2.5]]
    // correlations: r01 = 2/sqrt(5), r02 = -0.8, r12 = -1/sqrt(5)
    // r_bar = (1/sqrt(5) - 0.8) / 3 ≈ -0.11759546816668064
    // pi = 7.25, rho ≈ 4.565933977533373, gamma ≈ 8.65304424466646
    // delta = (pi - rho) / (gamma * 4) ≈ 0.07754687097899171
    const observations = [
      ["2", "1", "0"],
      ["-1", "0", "3"],
      ["3", "2", "1"],
      ["0", "1", "4"],
    ];
    const res = ledoitWolf(observations, "CONSTANT_CORRELATION");

    expect(res.mean).toEqual(["1", "1", "2"]);
    expect(Number(res.shrinkage)).toBeCloseTo(0.07754687097899171, 12);

    // Diagonals are preserved exactly (F_ii = S_ii)
    expect(Number(res.covariance[0][0])).toBeCloseTo(2.5, 12);
    expect(Number(res.covariance[1][1])).toBeCloseTo(0.5, 12);
    expect(Number(res.covariance[2][2])).toBeCloseTo(2.5, 12);

    // Off-diagonals match (1 - delta) * S_ij + delta * F_ij and remain symmetric
    expect(Number(res.covariance[0][1])).toBeCloseTo(0.9122575975239827, 12);
    expect(Number(res.covariance[1][0])).toBeCloseTo(0.9122575975239827, 12);
    expect(Number(res.covariance[0][2])).toBeCloseTo(-1.867704159536106, 12);
    expect(Number(res.covariance[2][0])).toBeCloseTo(-1.867704159536106, 12);
    expect(Number(res.covariance[1][2])).toBeCloseTo(-0.47142209600752966, 12);
    expect(Number(res.covariance[2][1])).toBeCloseTo(-0.47142209600752966, 12);
  });

  it("keeps SCALED_IDENTITY as default and handles degenerate/1D matrices safely", () => {
    const observations = [
      ["0.01", "0.02", "-0.01"],
      ["-0.02", "0.00", "0.03"],
      ["0.03", "0.01", "0.02"],
      ["0.00", "-0.01", "0.01"],
    ];
    expect(ledoitWolf(observations)).toEqual(ledoitWolf(observations, "SCALED_IDENTITY"));
    expect(ledoitWolf([["1"], ["3"]], "CONSTANT_CORRELATION")).toEqual({ shrinkage: "0", mean: ["2"], covariance: [["1"]] });
    // Constant column (zero variance) must not produce NaN
    const withZeroVar = ledoitWolf([["1", "0", "2"], ["3", "0", "-2"], ["5", "0", "4"]], "CONSTANT_CORRELATION");
    expect(withZeroVar.covariance.flat().every(v => Number.isFinite(Number(v)))).toBe(true);
    expect(withZeroVar.covariance[1]).toEqual(["0", "0", "0"]);
  });

  it("accepts optional estimation.target in riskPolicySchema", () => {
    const base = {
      evidence: "Optimizer target schema test",
      continuousOptimizer: {
        riskAversionGamma: 3,
        uncertaintyKappa: 0,
        turnoverPenaltyEta: 0,
        estimation: {
          evidence: "Monthly baseline test",
          historicalWeight: 0.5,
          monthlyBaselines: [{ assetClass: "CASH", returnRate: 0.003 }],
        },
        bounds: [{ assetClass: "CASH", min: 0, max: 1 }],
      },
    };
    expect(riskPolicySchema.safeParse(base).success).toBe(true);
    expect(riskPolicySchema.safeParse({
      ...base,
      continuousOptimizer: { ...base.continuousOptimizer, estimation: { ...base.continuousOptimizer.estimation, target: "SCALED_IDENTITY" } },
    }).success).toBe(true);
    expect(riskPolicySchema.safeParse({
      ...base,
      continuousOptimizer: { ...base.continuousOptimizer, estimation: { ...base.continuousOptimizer.estimation, target: "CONSTANT_CORRELATION" } },
    }).success).toBe(true);
    expect(riskPolicySchema.safeParse({
      ...base,
      continuousOptimizer: { ...base.continuousOptimizer, estimation: { ...base.continuousOptimizer.estimation, target: "UNKNOWN" } },
    }).success).toBe(false);
  });
});
