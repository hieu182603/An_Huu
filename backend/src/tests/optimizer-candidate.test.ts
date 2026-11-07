import { describe, it, expect } from "vitest";
import { continuousCandidate } from "../modules/allocation-risk/optimizer-candidate";
import { marketFixture } from "./allocation-risk-fixtures";
import { ledoitWolf } from "../modules/allocation-risk/estimation";

describe("Runtime optimizer input and fail-closed coverage", () => {
  const base = [[{ assetClass: "CASH", weightPercent: "60" }, { assetClass: "EQUITY", weightPercent: "40" }]];
  const policy = { riskAversionGamma: 3, uncertaintyKappa: 0, turnoverPenaltyEta: 0, bounds: [{ assetClass: "CASH", min: 0, max: 1 }, { assetClass: "EQUITY", min: 0, max: 0.6 }],
    estimation: { evidence: "Synthetic baseline", historicalWeight: 0, monthlyBaselines: [{ assetClass: "CASH", returnRate: 0.002 }, { assetClass: "EQUITY", returnRate: 0.004 }] } };
  it("uses approved monthly mean shrinkage, Ledoit-Wolf covariance and sample-sized uncertainty", () => {
    const data = marketFixture(), result = continuousCandidate(base, data, policy);
    expect(result.input?.expectedReturns).toEqual([0.002, 0.004]);
    const observations = data.rows.map(r => ["CASH", "EQUITY"].map(c => r.returns[c]));
    expect(result.input?.covarianceMatrix).toEqual(ledoitWolf(observations).covariance.map(r => r.map(Number)));
    expect(result.input?.uncertaintyMatrix?.[0][0]).toBe(result.input!.covarianceMatrix[0][0] / observations.length);
  });
  it("does not construct a fallback constraint set if coverage or baseline is absent", () => {
    expect(continuousCandidate(base, marketFixture(), { ...policy, bounds: policy.bounds.slice(1) })).toEqual({ issue: "OPTIMIZER_BOUND_COVERAGE_REQUIRED" });
    expect(continuousCandidate(base, marketFixture(), { ...policy, estimation: undefined })).toEqual({ issue: "APPROVED_RETURN_ESTIMATION_REQUIRED" });
  });
});
