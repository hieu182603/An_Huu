import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { customFixture } from "./allocation-custom-fixtures";
import { retirementCommand } from "./retirement-fixtures";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { RebalanceDecisionService } from "../modules/allocation-risk/rebalance-decisions";

async function fixture() {
  const f = await customFixture();
  if (f.policy.data.schemaVersion !== 2) throw Error("Expected v2");
  const policy = await f.portfolios.create("test-admin", { ...f.policy.data,
    allocationRisk: { ...f.policy.data.allocationRisk!, rebalanceBandPoints: "5" } });
  await f.portfolios.approve("test-admin", policy.id, { expectedRevision: 1, confirm: true, reviewNote: "Synthetic comparison policy" });
  await f.portfolios.publish("test-admin", policy.id, { expectedRevision: 2, confirm: true });
  const command = { ...retirementCommand(policy.id), ...f.command, policyVersionId: policy.id, allocationFunding: "PROTECTED_CAPITAL_V1" as const };
  const preview = await f.services.retirement.preview("test-user", command, { adjustments: false });
  if (!preview.replayInput) throw Error(JSON.stringify(preview.issues));
  const saved = await f.services.plans.createVersion("test-user", null, { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: command }, randomUUID());
  const capital = Number(preview.replayInput.initialCapital);
  const input = { policyVersionId: policy.id, templateId: command.templateId, month: "2026-10", retirementMonth: "2027-01",
    holdings: [{ assetClass: "BOND", value: String(capital * .2), maturedAmount: "0" }, { assetClass: "STOCK", value: String(capital * .8), maturedAmount: "0" }],
    newContribution: "0", planId: saved.planId, planVersionId: saved.saved.id, compareProbabilities: true };
  return { ...f, saved, input, risk: new AllocationRiskService(f.db) };
}

describe("B7-1 optional probability comparison on the owner's pinned plan", () => {
  it("runs twenty common paths, persists both probabilities, and keeps the default comparison off", async () => {
    const f = await fixture();
    const res = await f.risk.rebalance(f.input, "test-user");
    expect(res.status).toBe("PROPOSED");
    if (!("probabilityComparison" in res) || res.probabilityComparison?.status !== "READY" || res.status !== "PROPOSED") throw Error(JSON.stringify(res));
    expect(res.probabilityComparison.paths).toBe(20);
    expect(res.probabilityComparison.before).toBeGreaterThanOrEqual(0);
    expect(res.probabilityComparison.after).toBeLessThanOrEqual(1);
    const decisions = new RebalanceDecisionService(f.db);
    const saved = await decisions.recordProposal("test-user", { planVersionId: f.saved.saved.id,
      oldWeights: res.oldWeights, targetWeights: res.targetWeights, newWeights: res.newWeights,
      trigger: res.trigger, bandPoints: res.bandPoints, costEstimate: res.cost, trades: res.trades,
      probabilityBefore: res.probabilityComparison.before, probabilityAfter: res.probabilityComparison.after });
    expect(saved.probabilityBefore).toBe(res.probabilityComparison.before);
    expect(saved.probabilityAfter).toBe(res.probabilityComparison.after);
    const off = await f.risk.rebalance({ ...f.input, compareProbabilities: false }, "test-user");
    expect("probabilityComparison" in off ? off.probabilityComparison : undefined).toBeUndefined();
  });

  it("requires owned plan context and refuses to infer protected capital or a different valuation month", async () => {
    const f = await fixture();
    await expect(f.risk.rebalance(f.input, "other-user")).rejects.toMatchObject({ status: 404 });
    const mismatch = await f.risk.rebalance({ ...f.input, month: "2026-11" }, "test-user");
    expect("probabilityComparison" in mismatch ? mismatch.probabilityComparison : undefined).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["REBALANCE_PLAN_CONTEXT_MISMATCH"] });
    const wealth = await f.risk.rebalance({ ...f.input, holdings: f.input.holdings.map(h => ({ ...h, value: String(Number(h.value) + 1) })) }, "test-user");
    expect("probabilityComparison" in wealth ? wealth.probabilityComparison : undefined).toMatchObject({ status: "REVIEW_REQUIRED", issues: ["REBALANCE_GROWTH_CAPITAL_MISMATCH"] });
    await expect(new RebalanceDecisionService(f.db).recordProposal("other-user", { planVersionId: f.saved.saved.id,
      oldWeights: [], targetWeights: [], newWeights: [], trigger: "BELOW_BAND", bandPoints: "5", costEstimate: "0", trades: [] })).rejects.toMatchObject({ status: 404 });
  });
});
