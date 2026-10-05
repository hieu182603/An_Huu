import { randomUUID } from "node:crypto";
import { memoryDb } from "./memory-db";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { ProfileService } from "../modules/profiles/service";
import { RetirementService } from "../modules/retirement/service";
import { PlansService } from "../modules/plans/service";
export async function plansFixture(profile = retirementProfile()) {
  const f = memoryDb(), owner = "test-user", admin = "admin";
  const assumptions = new AssumptionsService(f.db), policies = new PortfoliosService(f.db), profiles = new ProfileService(f.db);
  const retirement = new RetirementService(f.db), plans = new PlansService(f.db), cfg = retirementConfiguration();
  async function publish() {
    const a = await assumptions.create(admin, cfg.assumptions);
    const review = await assumptions.previewImpact(admin, a.id, { expectedRevision: 1 });
    await assumptions.approve(admin, a.id, { expectedRevision: 1, impactToken: review.impactToken, reviewNote: "Fixture review" });
    await assumptions.publish(admin, a.id, { expectedRevision: 2, confirm: true });
    const p = await policies.create(admin, { ...cfg.policy, assumptionVersionId: a.id });
    await policies.approve(admin, p.id, { expectedRevision: 1, reviewNote: "Fixture review", confirm: true });
    await policies.publish(admin, p.id, { expectedRevision: 2, confirm: true });
    return p;
  }
  const policy = await publish();
  await profiles.saveDraft(owner, 0, "summary", profile);
  await profiles.complete(owner, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  const preview = retirementCommand(policy.id), result = await retirement.preview(owner, preview);
  const command = { expectedRevision: 0, expectedInputHash: result.inputHash, preview };
  const create = () => plans.createVersion(owner, null, command, randomUUID());
  return { ...f, owner, profiles, retirement, plans, policy, publish, command, create };
}
