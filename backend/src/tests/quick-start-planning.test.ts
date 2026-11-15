import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../app";
import { config, token } from "./helpers";
import { allocationFixture } from "./allocation-workspace-fixtures";
import { RetirementService } from "../modules/retirement/service";
import { PlansService } from "../modules/plans/service";
import { prepareRetirement } from "../modules/retirement/prepare";
import { retirementPreviewSchema } from "../modules/retirement/schema";
import { assessPortfolio, validatePortfolioPolicy } from "../modules/portfolios/engine";
import { glidePortfolioFixture, portfolioAssumptionsFixture, portfolioCommand } from "./portfolio-fixtures";
import { retirementCommand, retirementProfile } from "./retirement-fixtures";
import { known } from "./profile-v2-fixtures";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });

function fixture() {
  const profile = retirementProfile(), assumptions = portfolioAssumptionsFixture(), policy = glidePortfolioFixture();
  // Explicit test-only published references, never production data or inferred answers.
  policy.quickStartTemplates = { evidence: "Synthetic mapping for isolated tests", SELL: policy.templates[0].id, HOLD: policy.templates[0].id, BUY_MORE: policy.templates[1].id };
  const input = { ...retirementCommand(), answers: [], planningReaction: "HOLD" as const };
  profile.lossTolerance = { reaction: known("HOLD") };
  return { profile, assumptions, policy, input };
}

describe("initial planning is separate from investment suitability", () => {
  it.each(["SELL", "HOLD", "BUY_MORE"] as const)("uses only the approved %s reference without answering any question", reaction => {
    const f = fixture(); f.profile.lossTolerance = { reaction: known(reaction) };
    const result = prepareRetirement(f.profile, { ...f.input, planningReaction: reaction }, f.policy, f.assumptions);
    expect(result.status).toBe("READY");
    expect(result.calculation).toMatchObject({ suitability: "NOT_ASSESSED", planningBasis: "PUBLISHED_REACTION_REFERENCE", assessment: {
      totalScore: null, riskBandId: null, answers: [], checks: [], selectedTemplateId: f.policy.quickStartTemplates![reaction],
    } });
    expect(result.warnings).toContainEqual({ path: "planningReaction", code: "PLANNING_REFERENCE_NOT_SUITABILITY" });
    expect(f.input.answers).toEqual([]);
    // The actual portfolio assessment remains strict with exactly the same policy.
    expect(assessPortfolio(f.policy, { ...portfolioCommand(), answers: [] }).issues.some(i => i.code === "ANSWER_REQUIRED")).toBe(true);
  });
  it("blocks missing configuration and invalid template references", () => {
    const f = fixture(); delete f.policy.quickStartTemplates;
    expect(prepareRetirement(f.profile, f.input, f.policy, f.assumptions)).toMatchObject({ status: "INCOMPLETE", issues: [{ path: "quickStartTemplates", code: "QUICK_START_POLICY_REQUIRED" }] });
    f.policy.quickStartTemplates = { evidence: "Synthetic invalid configuration", SELL: "MISSING", HOLD: "MISSING", BUY_MORE: "MISSING" };
    expect(validatePortfolioPolicy(f.policy, f.assumptions).issues).toContainEqual({ path: "quickStartTemplates.HOLD", code: "UNKNOWN_TEMPLATE" });
  });
  it("requires the customer's actual declared reaction and rejects mismatched choices", () => {
    const f = fixture();
    expect(prepareRetirement(f.profile, { ...f.input, planningReaction: "SELL" }, f.policy, f.assumptions)).toMatchObject({ status: "INCOMPLETE", issues: [{ path: "planningReaction", code: "DECLARED_REACTION_REQUIRED" }] });
    expect(prepareRetirement(f.profile, { ...f.input, templateId: f.policy.templates[1].id }, f.policy, f.assumptions)).toMatchObject({ status: "INCOMPLETE", issues: [{ path: "templateId", code: "PLANNING_TEMPLATE_MISMATCH" }] });
    expect(retirementPreviewSchema.safeParse({ ...f.input, answers: retirementCommand().answers }).success).toBe(false);
  });
  it("HTTP save, idempotent retry, apply and replay retain an unassessed reference without fabricating answers", async () => {
    const f = await allocationFixture();
    vi.spyOn(f.auth, "validateSession").mockResolvedValue(f.owner);
    const app = createApp({ config, services: { ...f.services, retirement: new RetirementService(f.db), plans: new PlansService(f.db) } });
    const input = { ...retirementCommand(f.policy.id), expectedProfileRevision: 2, answers: [], planningReaction: "HOLD" };
    const preview = await request(app).post("/api/v1/me/retirement/preview?adjustments=skip").set("Authorization", "Bearer " + token()).send(input);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ status: "READY", calculation: { suitability: "NOT_ASSESSED", assessment: { answers: [], totalScore: null, riskBandId: null } } });
    const body = { expectedRevision: 0, expectedInputHash: preview.body.data.inputHash, preview: input }, key = randomUUID();
    const save = () => request(app).post("/api/v1/me/retirement/plans").set("Authorization", "Bearer " + token()).set("Idempotency-Key", key).send(body);
    const first = await save(), retry = await save();
    expect(first.status).toBe(201); expect(retry.status).toBe(201); expect(retry.body.data).toEqual(first.body.data);
    expect(f.rows("planVersion")).toHaveLength(1);
    const saved = first.body.data;
    const applied = await request(app).post(`/api/v1/me/retirement/plans/${saved.planId}/apply`).set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID()).send({ expectedRevision: 1, expectedProfileRevision: 2, versionId: saved.saved.id, confirm: true });
    expect(applied.status).toBe(200);
    const replay = await request(app).post(`/api/v1/me/retirement/plans/${saved.planId}/versions/${saved.saved.id}/replay`).set("Authorization", "Bearer " + token()).send({});
    expect(replay.status).toBe(200); expect(replay.body.data.replay.matched).toBe(true);
    expect(replay.body.data.preview.selection.answers).toEqual([]);
    expect(replay.body.data.preview.calculation).toMatchObject({ suitability: "NOT_ASSESSED", assessment: { answers: [], checks: [], totalScore: null, riskBandId: null } });
    expect((await f.profiles.getProfile("test-user"))?.data).not.toHaveProperty("retirementSurvey");
    const missing = await request(app).post("/api/v1/me/retirement/preview?adjustments=skip").set("Authorization", "Bearer " + token()).send({ ...input, planningReaction: undefined });
    expect(missing.body.data.status).toBe("INCOMPLETE");
    expect(missing.body.data.issues.some((issue: {code:string}) => issue.code === "ANSWER_REQUIRED")).toBe(true);
    const mixed = await request(app).post("/api/v1/me/retirement/preview?adjustments=skip").set("Authorization", "Bearer " + token()).send({ ...input, answers: f.command.answers });
    expect(mixed.status).toBe(400);
    expect(f.rows("planVersion")).toHaveLength(1);
  });
});
