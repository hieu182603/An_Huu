import { describe, expect, it } from "vitest";
import { generatePortfolioRecommendation, RecommendationApprovalManager as M, recommendationContentHash, type PublicationEvidence } from "../modules/recommendation/engine";
import { VIETNAMESE_PRODUCT_CATALOG } from "../modules/recommendation/fixtures";
function pending() {
  const draft = generatePortfolioRecommendation({ userId: "customer", planId: "plan", growthCapitalVnd: "500000000", targetAssetWeights: { CASH: .25, BOND: .25, EQUITY: .25, GOLD: .25 }, clientRiskTolerance: "HIGH", horizonYears: 10 }, VIETNAMESE_PRODUCT_CATALOG, undefined, "author");
  return M.submitForApproval(M.markSuitabilityChecked(M.markDataValidated(draft)));
}
describe("Independent recommendation approval", () => {
  it.each(["author", "customer"])("denies self/interested approval by %s", id => expect(() => M.approve(pending(), id, "APPROVER")).toThrow(/Independent/));
  it.each(["USER", "ADVISOR", "ADMIN", "DATA_ADMIN"])("denies role %s", role => expect(() => M.approve(pending(), "second", role)).toThrow(/Access Denied/));
  it("denies expired approval", () => expect(() => M.approve({ ...pending(), expiresAt: "2020-01-01T00:00:00Z" }, "second", "APPROVER")).toThrow(/expired/));
  it("rejects forged approved status without persisted evidence", () => expect(() => M.publish({ ...pending(), lifecycleStatus: "APPROVED" })).toThrow(/persisted/));
  it.each(["legalGateEnabled", "referencesCurrent", "approverQualified"] as const)("requires %s", key => {
    const rec = M.approve(pending(), "second", "APPROVER");
    const evidence: PublicationEvidence = { legalGateEnabled: true, referencesCurrent: true, approverQualified: true, approval: { actorId: "second", revision: rec.revision, contentHash: recommendationContentHash(rec) } };
    evidence[key] = false;
    expect(() => M.publish(rec, evidence)).toThrow(/Publication/);
  });
  it("binds approval to exact content/revision and allows unchanged publication", () => {
    const rec = M.approve(pending(), "second", "APPROVER");
    const evidence = { legalGateEnabled: true, referencesCurrent: true, approverQualified: true, approval: { actorId: "second", revision: rec.revision, contentHash: recommendationContentHash(rec) } };
    expect(M.publish(rec, evidence).lifecycleStatus).toBe("PUBLISHED");
    expect(() => M.publish({ ...rec, growthCapitalVnd: "600000000" }, evidence)).toThrow();
    expect(() => M.publish({ ...rec, revision: 2 }, evidence)).toThrow();
    expect(() => M.publish({ ...rec, approvedBy: "forged" }, evidence)).toThrow();
  });
});
