import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { customFixture } from "./allocation-custom-fixtures";
import { retirementCommand } from "./retirement-fixtures";
import { AllocationRiskService } from "../modules/allocation-risk/service";

describe("seven-step review regressions", () => {
  it("does not choose a portfolio when a declared liquidity need is explicitly unknown", async () => {
    const f = await customFixture();
    await f.profiles.patchProfile("test-user", 2, { schemaVersion: 2, liquidityNeeds: { y1: { status: "UNKNOWN" } } });
    const preview = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: 3, allocationFunding: "PROTECTED_CAPITAL_V1" };
    const result = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20 } as never, "selection");
    expect(result).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["LIQUIDITY_REQUIREMENTS_INCOMPLETE", "LIQUIDITY_NEED_UNKNOWN"] });
  });

  it("keeps the safe spending floor in shifted candidates and the saved plan's rebalance targets", async () => {
    const f = await customFixture();
    if (f.policy.data.schemaVersion !== 2) throw Error("Expected v2");
    const policy = await f.portfolios.create("test-admin", { ...f.policy.data,
      allocationRisk: { ...f.policy.data.allocationRisk!, rebalanceBandPoints: "5" },
      customization: { ...f.policy.data.customization!, bounds: [{ assetClass: "BOND", minPercent: "0", maxPercent: "90" }, { assetClass: "STOCK", minPercent: "0", maxPercent: "100" }] },
      templates: f.policy.data.templates.map(t => ({ ...t, glidePath: { ...t.glidePath, spendingFloorYears: 1,
        points: t.glidePath.points.map(p => ({ ...p, allocations: [{ assetClass: "BOND", weightPercent: "10" }, { assetClass: "STOCK", weightPercent: "90" }] })) } })) });
    await f.portfolios.approve("test-admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "Synthetic floor review" });
    await f.portfolios.publish("test-admin", policy.id, { expectedRevision: 2, confirm: true });
    await f.profiles.patchProfile("test-user", 2, { schemaVersion: 2, lossTolerance: { inputMode: "PERCENT", percent: { status: "KNOWN", value: "100" } } });
    const command = { ...retirementCommand(policy.id), ...f.command, policyVersionId: policy.id, expectedProfileRevision: 3,
      allocationFunding: "PROTECTED_CAPITAL_V1" as const, monthlyExpenseToday: "80000000", monthlyContribution: "0" };
    const risk = new AllocationRiskService(f.db);
    const result: any = await risk.run("test-user", { plan: { kind: "PREVIEW", preview: command }, paths: 20, detail: "ALLOCATION_V2" } as never, "selection");
    expect(result.rejected).toContainEqual({ id: "HIGHER_EQUITY", issues: ["SPENDING_FLOOR_CONSTRAINT"] });
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) for (const target of candidate.targets.slice(3))
      expect(Number(target.find((a: any) => a.assetClass === "BOND").weightPercent)).toBeGreaterThanOrEqual(90);
    const prepared = await f.services.retirement.preview("test-user", command, { adjustments: false });
    const saved = await f.services.plans.createVersion("test-user", null, { expectedRevision: 0, expectedInputHash: prepared.inputHash, preview: command }, randomUUID());
    const input = { policyVersionId: policy.id, templateId: "CAUTIOUS", month: "2027-01", retirementMonth: "2027-01",
      holdings: [{ assetClass: "BOND", value: "100", maturedAmount: "0" }, { assetClass: "STOCK", value: "900", maturedAmount: "0" }], newContribution: "0" };
    expect(await risk.rebalance(input)).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["SPENDING_FLOOR_PLAN_CONTEXT_REQUIRED"] });
    const proposal = await risk.rebalance({ ...input, planId: saved.planId, planVersionId: saved.saved.id }, "test-user");
    if (proposal.status !== "PROPOSED") throw Error(JSON.stringify(proposal));
    expect(Number(proposal.targetWeights.find(a => a.assetClass === "BOND")!.weightPercent)).toBe(90);
  });

  it("applies the approved occupational ceiling to later glide months as well as the first month", async () => {
    const f = await customFixture();
    if (f.policy.data.schemaVersion !== 2) throw Error("Expected v2");
    const policy = await f.portfolios.create("test-admin", { ...f.policy.data,
      occupationalRisk: { evidence: "Synthetic approved cap", incomeStability: { UNCERTAIN: { maxEquityPercent: "5" } } },
      templates: f.policy.data.templates.map(t => ({ ...t, glidePath: { ...t.glidePath, points: [
        { yearsToAnchor: 1, allocations: [{ assetClass: "BOND", weightPercent: "100" }, { assetClass: "STOCK", weightPercent: "0" }] },
        { yearsToAnchor: 0, allocations: [{ assetClass: "BOND", weightPercent: "20" }, { assetClass: "STOCK", weightPercent: "80" }] }] } })) });
    await f.portfolios.approve("test-admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "Synthetic occupational review" });
    await f.portfolios.publish("test-admin", policy.id, { expectedRevision: 2, confirm: true });
    await f.profiles.patchProfile("test-user", 2, { schemaVersion: 2, incomeStability: { status: "KNOWN", value: "UNCERTAIN" },
      personal: { desiredRetirementMonth: { status: "KNOWN", value: "2028-01" } } });
    const preview = { ...retirementCommand(policy.id), ...f.command, policyVersionId: policy.id, expectedProfileRevision: 3, endMonth: "2028-12", allocationFunding: "PROTECTED_CAPITAL_V1" };
    const result: any = await new AllocationRiskService(f.db).run("test-user", { plan: { kind: "PREVIEW", preview }, paths: 20 } as never, "selection");
    expect(result.rejected).toContainEqual({ id: "BASE", issues: ["OCCUPATIONAL_RISK_LIMIT"] });
  });
});
