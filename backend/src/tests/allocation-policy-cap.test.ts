import { describe, expect, it } from "vitest";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { riskRequestSchema } from "../modules/allocation-risk/schema";
import { LIMITS } from "../modules/allocation-risk/simulation";

describe("allocation-risk policy simulationPaths cap (A2)", () => {
  it("accepts simulationPaths up to LIMITS.maxPaths (1000) and rejects 1001", () => {
    expect(LIMITS.maxPaths).toBe(1000);
    expect(riskPolicySchema.safeParse({ evidence: "Policy cap test", simulationPaths: 1000 }).success).toBe(true);
    expect(riskPolicySchema.safeParse({ evidence: "Policy cap test", simulationPaths: 1001 }).success).toBe(false);
  });

  it("keeps riskRequestSchema paths aligned with LIMITS.maxPaths", () => {
    const plan = { kind: "SAVED_VERSION" as const, planId: "11111111-1111-4111-8111-111111111111", versionId: "22222222-2222-4222-8222-222222222222" };
    expect(riskRequestSchema.safeParse({ plan, paths: 1000 }).success).toBe(true);
    expect(riskRequestSchema.safeParse({ plan, paths: 1001 }).success).toBe(false);
    expect(riskRequestSchema.safeParse({ plan, essentialThreshold: "0.92" }).success).toBe(true);
    expect(riskRequestSchema.safeParse({ plan, essentialThreshold: "0" }).success).toBe(false);
    expect(riskRequestSchema.safeParse({ plan, essentialThreshold: "1.01" }).success).toBe(false);
  });

  it("validates optional B6-8 essentialThresholdRange and B7-2 rebalance policy blocks", () => {
    expect(riskPolicySchema.safeParse({
      evidence: "Range and rebalance schema test",
      essentialThresholdRange: { min: "0.90", max: "0.95" },
      rebalance: { evidence: "Law ref pending approval", saleTaxPercent: "0.1", transactionFeePercent: "0.15" },
    }).success).toBe(true);
    expect(riskPolicySchema.safeParse({
      evidence: "Invalid inverted range",
      essentialThresholdRange: { min: "0.96", max: "0.90" },
    }).success).toBe(false);
    expect(riskPolicySchema.safeParse({
      evidence: "Invalid negative tax",
      rebalance: { evidence: "Law ref pending approval", saleTaxPercent: "-0.1" },
    }).success).toBe(false);
    expect(riskPolicySchema.safeParse({
      evidence: "Short rebalance evidence",
      rebalance: { evidence: "abc", saleTaxPercent: "0.1" },
    }).success).toBe(false);
  });
});
