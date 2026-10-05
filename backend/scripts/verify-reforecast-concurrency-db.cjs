// Real independent connections need committed, private fixtures. Configuration
// fixtures are reverted to DRAFT BEFORE commit and never visible as published.
// Cleanup is restricted to generated IDs; no reset and no mail/auth events.
require("dotenv").config(); require("ts-node/register");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PlansService } = require("../src/modules/plans/service");
const { ActualsService } = require("../src/modules/actuals/service");
const { RetirementService } = require("../src/modules/retirement/service");
const { ProfileService } = require("../src/modules/profiles/service");
const { AssumptionsService } = require("../src/modules/assumptions/service");
const { PortfoliosService } = require("../src/modules/portfolios/service");
const { retirementProfile, retirementCommand, retirementConfiguration } = require("../src/tests/retirement-fixtures");
const db = new PrismaClient({ log: [] }), owner = randomUUID(), admin = randomUUID(), configIds = [];
let createdModelId = null, stage = "preflight", before, committed = false, checks = 0;
const fingerprint = async () => {
  const result = {};
  for (const table of ["financial_profiles", "retirement_plans", "plan_versions", "assumption_set_versions", "idempotency_records", "actual_months", "actual_month_revisions", "actual_event_identities"])
    result[table] = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(t::text, '|' ORDER BY id), '')) AS digest FROM ${table} t`);
  return result;
};
async function cleanup() {
  if (!committed) return;
  await db.$transaction(async tx => {
    const events = await tx.outboxEvent.findMany({ where: { entityId: { in: [owner, admin] } }, select: { id: true } });
    await tx.processedEvent.deleteMany({ where: { eventId: { in: events.map(e => e.id) } } });
    await tx.outboxEvent.deleteMany({ where: { entityId: { in: [owner, admin] } } });
    await tx.auditLog.deleteMany({ where: { performerId: { in: [owner, admin] } } });
    await tx.idempotencyRecord.deleteMany({ where: { userId: { in: [owner, admin] } } });
    await tx.user.deleteMany({ where: { id: { in: [owner, admin] } } });
    await tx.assumptionSetVersion.deleteMany({ where: { id: { in: configIds }, createdBy: admin, status: "DRAFT" } });
    if (createdModelId && !(await tx.planVersion.count({ where: { modelVersionId: createdModelId } })))
      await tx.financialModelVersion.delete({ where: { id: createdModelId } });
  }, { timeout: 30000 });
  committed = false;
}
(async () => {
  before = await fingerprint();
  const manifestPath = path.resolve(__dirname, "../.tmp/p13-p15-concurrency-" + owner + ".json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ owner, admin, startedAt: new Date().toISOString() }));
  stage = "private-fixture-setup";
  const fixture = await db.$transaction(async tx => {
    const scoped = new Proxy(db, { get(_target, key) { return key === "$transaction" ? work => work(tx) : Reflect.get(tx, key); } });
    for (const id of [owner, admin]) await tx.user.create({ data: { id, email: `p13-p15-concurrency-${id}@example.invalid`, fullName: "P13/P15 private concurrency fixture",
      passwordHash: "NO_LOGIN_FIXTURE", status: "SUSPENDED", role: id === admin ? "ADMIN" : "USER" } });
    const cfg = retirementConfiguration(), assumptions = new AssumptionsService(scoped), policies = new PortfoliosService(scoped);
    const a = await assumptions.create(admin, cfg.assumptions); configIds.push(a.id);
    const review = await assumptions.previewImpact(admin, a.id, { expectedRevision: 1 });
    await assumptions.approve(admin, a.id, { expectedRevision: 1, impactToken: review.impactToken, reviewNote: "Private fixture" });
    await assumptions.publish(admin, a.id, { expectedRevision: 2, confirm: true });
    const policy = await policies.create(admin, { ...cfg.policy, assumptionVersionId: a.id }); configIds.push(policy.id);
    await policies.approve(admin, policy.id, { expectedRevision: 1, reviewNote: "Private fixture", confirm: true });
    await policies.publish(admin, policy.id, { expectedRevision: 2, confirm: true });
    const profiles = new ProfileService(scoped);
    const profile = retirementProfile(); profile.valuationDate = "2026-08-01";
    await profiles.saveDraft(owner, 0, "summary", profile);
    await profiles.complete(owner, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    const input = retirementCommand(policy.id), preview = await new RetirementService(scoped).preview(owner, input);
    const plans = new PlansService(scoped), modelBefore = await tx.financialModelVersion.findUnique({ where: { code: preview.modelVersion } });
    const command = { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: input };
    const first = await plans.createVersion(owner, null, command, randomUUID());
    const second = await plans.createVersion(owner, first.planId, { ...command, expectedRevision: 1 }, randomUUID());
    if (!modelBefore) createdModelId = (await tx.financialModelVersion.findUnique({ where: { code: preview.modelVersion } })).id;
    // Only saved snapshots retain these fixture definitions. No other user's
    // policy/assumptions list can select either configuration after this commit.
    await tx.assumptionSetVersion.updateMany({ where: { id: { in: configIds }, createdBy: admin }, data: { status: "DRAFT" } });
    await tx.outboxEvent.updateMany({ where: { entityId: owner }, data: { status: "COMPLETED", completedAt: new Date() } });
    return { planId: first.planId, versions: [first.saved.id, second.saved.id] };
  }, { isolationLevel: "Serializable", timeout: 60000 });
  committed = true;
  const plans = new PlansService(db), actuals = new ActualsService(db);
  const data = balance => ({ currency: "VND", openingBalance: balance, closingBalance: balance, entries: [], correctionReason: "Private fixture" });
  await actuals.write(owner, "2026-08", { expectedRevision: 0, data: data("100") }, randomUUID());
  const input = { planId: fixture.planId, versionId: fixture.versions[0], throughMonth: "2026-08", expectedProfileRevision: 1, futureChanges: [] };
  const preview = await actuals.previewUpdate(owner, input);
  const command = { expectedRevision: 2, expectedInputHash: preview.inputHash, preview: input };
  stage = "save-same-key";
  const key = randomUUID();
  const repeated = await Promise.all([plans.saveReforecast(owner,fixture.planId,command,key),plans.saveReforecast(owner,fixture.planId,command,key)]);
  assert.deepEqual(repeated[0],repeated[1]);assert.equal(await db.planVersion.count({where:{planId:fixture.planId}}),3);checks++;
  stage = "save-same-revision";
  const raced = await Promise.allSettled([plans.saveReforecast(owner,fixture.planId,{...command,expectedRevision:3},randomUUID()),plans.saveReforecast(owner,fixture.planId,{...command,expectedRevision:3},randomUUID())]);
  assert.equal(raced.filter(r=>r.status==="fulfilled").length,1);assert.equal(raced.find(r=>r.status==="rejected").reason.status,409);
  assert.equal(await db.planVersion.count({where:{planId:fixture.planId}}),4);checks++;
  stage = "actual-edit-against-apply";
  const candidateId = repeated[0].saved.id;
  const apply = { versionId: candidateId, expectedRevision: 4, expectedProfileRevision: 1, confirm: true };
  const changed = await Promise.allSettled([plans.apply(owner,fixture.planId,apply,randomUUID()),actuals.write(owner,"2026-08",{expectedRevision:1,data:data("200")},randomUUID())]);
  assert.equal(changed[1].status,"fulfilled");
  if(changed[0].status==="rejected")assert.equal(changed[0].reason.status,409);
  const report = await plans.report(owner,fixture.planId,{versionId:candidateId});assert.equal(report.actualSourceChanged,true);
  const plan = await db.retirementPlan.findUnique({where:{id:fixture.planId}});
  await assert.rejects(plans.apply(owner,fixture.planId,{...apply,expectedRevision:plan.revision},randomUUID()),e=>e.code==="ACTUAL_SOURCE_CHANGED");
  assert.equal((await plans.version(owner,fixture.planId,candidateId,true)).replay.matched,true);checks++;
  stage = "scoped-cleanup"; await cleanup();
  assert.equal(await db.user.count({ where: { id: { in: [owner, admin] } } }), 0);
  assert.equal(await db.idempotencyRecord.count({ where: { userId: { in: [owner, admin] } } }), 0);
  assert.deepEqual(await fingerprint(), before);
  console.log(JSON.stringify({ independentConnectionRaceChecks: checks, fixturesRemoved: true, existingDataUnchanged: true,
    publishedFixtureConfigurationsExposed: false, emailsQueued: false }));
})().catch(error => { console.error(JSON.stringify({ stage, code: error.code ?? "PLAN_CONCURRENCY_FAILED", type: error.name })); process.exitCode = 1; })
  .finally(async () => { try { await cleanup(); } catch (error) { console.error(JSON.stringify({ stage: "CLEANUP_REQUIRED", code: error.code ?? "CLEANUP_FAILED", fixtureOwner: owner, fixtureAdmin: admin, fixtureConfigIds: configIds })); process.exitCode = 1; } await db.$disconnect(); });
