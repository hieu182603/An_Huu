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
const withLoanAssets = process.argv.includes("--loan-assets");
const withSources = withLoanAssets || process.argv.includes("--sources");
const debtEventId = randomUUID(), contributionEventId = randomUUID();
const mixedActual = {
  currency: "VND", openingBalance: "1000", closingBalance: "940", correctionReason: "Private loan and asset fixture",
  entries: [
    { eventId: debtEventId, date: "2026-08-28", kind: "DEBT_PAYMENT", amount: "120" },
    { eventId: randomUUID(), date: "2026-08-28", kind: "WITHDRAWAL", amount: "120" },
    { eventId: contributionEventId, date: "2026-08-28", kind: "CONTRIBUTION", amount: "60" },
  ],
};
const db = new PrismaClient({ log: [] }), owner = randomUUID(), admin = randomUUID(), configIds = [];
const clients = [new PrismaClient({ log: [] }), new PrismaClient({ log: [] })];
let barrier = null;
function synchronizeTransactions() {
  let release, reject;
  const promise = new Promise((resolve, fail) => { release = resolve; reject = fail; });
  // Prevent an unobserved rejection if a connection fails before reaching SQL.
  promise.catch(() => {});
  const round = { pids: new Map(), promise, timer: null };
  round.timer = setTimeout(() => reject(new Error("Independent transaction barrier timed out")), 8000);
  round.arrive = (slot, pid) => {
    if (round.pids.has(slot)) return;
    round.pids.set(slot, pid);
    if (round.pids.size === 2) {
      clearTimeout(round.timer);
      if (new Set(round.pids.values()).size !== 2) reject(new Error("Transactions must use distinct PostgreSQL backends"));
      else release();
    }
  };
  barrier = round;
}
const connections = clients.map((client, slot) => new Proxy(client, { get(target, key) {
  if (key === "$transaction") return (work, options) => target.$transaction(async tx => {
    const round = barrier;
    if (round && !round.pids.has(slot)) {
      const [row] = await tx.$queryRawUnsafe("SELECT pg_backend_pid() AS pid");
      round.arrive(slot, row.pid); await round.promise;
    }
    return work(tx);
  }, options);
  const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
} }));
const createdModelIds = [];
let stage = "preflight", before, committed = false, checks = 0;
const fingerprint = async () => {
  const result = {};
  const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    result[tablename] = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest FROM public.${quoted} t`);
  }
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
    for (const id of createdModelIds) if (!(await tx.planVersion.count({ where: { modelVersionId: id } })))
      await tx.financialModelVersion.delete({ where: { id } });
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
    if (withLoanAssets) {
      const { debtFixture, loanFixture } = require("../src/tests/debt-fixtures");
      const { addMonths } = require("../src/common/calendar");
      const contract = loanFixture();
      contract.balanceAsOf = "2026-08-01"; contract.confirmedOn = "2026-07-31"; contract.maturityDate = "2027-05-28";
      contract.periods.forEach((p, i) => { p.dueDate = addMonths("2026-08", i) + "-28"; });
      profile.debts = { status: "KNOWN", entries: [debtFixture({ balanceAsOf: { status: "KNOWN", value: "2026-08-01" } }, contract)] };
      profile.income.entries[0].amount = { status: "KNOWN", value: "10000" };
    }
    await profiles.saveDraft(owner, 0, "summary", profile);
    await profiles.complete(owner, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    const input = retirementCommand(policy.id), preview = await new RetirementService(scoped).preview(owner, input);
    const plans = new PlansService(scoped), modelBefore = await tx.financialModelVersion.findUnique({ where: { code: preview.modelVersion } });
    const command = { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: input };
    const first = await plans.createVersion(owner, null, command, randomUUID());
    const second = await plans.createVersion(owner, first.planId, { ...command, expectedRevision: 1 }, randomUUID());
    if (!modelBefore) createdModelIds.push((await tx.financialModelVersion.findUnique({ where: { code: preview.modelVersion } })).id);
    let sourceBase = null;
    if (withSources) {
      await new ActualsService(scoped).write(owner, "2026-08", { expectedRevision: 0, data: withLoanAssets ? mixedActual : { currency: "VND", openingBalance: "100", closingBalance: "100", entries: [], correctionReason: "Private fixture" } }, randomUUID());
      const sourceInput = { versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, expectedProfileRevision: 1, throughMonth: "2026-08", sourceCommands: [] };
      const sourcePreview = await plans.previewSources(owner, first.planId, sourceInput);
      const priorModel = await tx.financialModelVersion.findUnique({ where: { code: sourcePreview.candidate.modelVersion } });
      sourceBase = await plans.saveSources(owner, first.planId, { preview: sourceInput, expectedInputHash: sourcePreview.inputHash, confirm: true }, randomUUID());
      if (!priorModel) createdModelIds.push((await tx.financialModelVersion.findUnique({ where: { code: sourcePreview.candidate.modelVersion } })).id);
    }
    // Only saved snapshots retain these fixture definitions. No other user's
    // policy/assumptions list can select either configuration after this commit.
    await tx.assumptionSetVersion.updateMany({ where: { id: { in: configIds }, createdBy: admin }, data: { status: "DRAFT" } });
    await tx.outboxEvent.updateMany({ where: { entityId: owner }, data: { status: "COMPLETED", completedAt: new Date() } });
    return { planId: first.planId, versions: [first.saved.id, second.saved.id], sourceBase, baseCount: sourceBase ? 3 : 2 };
  }, { isolationLevel: "Serializable", timeout: 60000 });
  committed = true;
  const plans = new PlansService(db), actuals = new ActualsService(db);
  const data = balance => ({ currency: "VND", openingBalance: balance, closingBalance: balance, entries: [], correctionReason: "Private fixture" });
  if (!withSources) await actuals.write(owner, "2026-08", { expectedRevision: 0, data: data("100") }, randomUUID());
  const input = { planId: fixture.planId, versionId: fixture.versions[0], throughMonth: "2026-08", expectedProfileRevision: 1, futureChanges: [] };
  const preview = await actuals.previewUpdate(owner, input);
  let command = { expectedRevision: 2, expectedInputHash: preview.inputHash, preview: input };
  if (withSources) {
    const sourceInput = { versionId: fixture.sourceBase.saved.id, expectedSnapshotHash: fixture.sourceBase.saved.snapshotHash, expectedRevision: fixture.baseCount,
      expectedProfileRevision: 1, throughMonth: "2026-08", sourceCommands: [], assetCommands: [{ commandId: randomUUID(), sourceId: "plan:" + randomUUID(), operation: "CREATE", expectedSourceRevision: 0,
        expectedSourceHash: null, confirm: true, notAlreadyInSources: true, evidence: [{ reference: "Private capital fixture", contentHash: "a".repeat(64), confirmedOn: "2026-08-28" }],
        capital: { reference: "Private capital " + owner, kind: "LIQUID_CAPITAL", currency: "VND", priceBasis: "NOMINAL_AT_AVAILABILITY", amountScope: "USER_SHARE", ownershipShare: "1", retirementShare: "1",
          grossAmount: "100", fees: "0", taxes: "0", securedDebtSettlement: "0", netAmount: "100", availableOn: "2026-09-01", confirmedContributionAmount: "50",
          funding: { status: "PLANNED", liquidity: "PLANNED_RELEASE", notIncludedInFund: true, contributionMonth: "2026-09", contributionTiming: "END_OF_MONTH" } } }] };
    if (withLoanAssets) {
      const options = await plans.previewSources(owner, fixture.planId, { ...sourceInput, assetCommands: [] });
      const loan = options.loanRevisionOptions.find(s => s.sourceId === "profile:debt:loan-a"); assert.ok(loan);
      const { addMonths } = require("../src/common/calendar");
      const knownOn = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const evidence = [{ reference: "Private confirmed loan and capital", contentHash: "b".repeat(64), confirmedOn: knownOn }];
      let accrualFrom = "2026-08-31";
      const periods = Array.from({ length: 9 }, (_, i) => {
        const dueDate = new Date(Date.parse(addMonths("2026-09", i + 1) + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
        const p = { accrualFrom, dueDate, rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: (Date.parse(dueDate) - Date.parse(accrualFrom)) / 86400000, yearDays: 365 }, fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null };
        accrualFrom = dueDate; return p;
      });
      const components = { principal: "100", interest: "10", prepaymentFee: "10", otherFee: "0" };
      sourceInput.loanRevisions = [{ commandId: randomUUID(), sourceId: loan.sourceId, operation: "REVISE", expectedSourceRevision: loan.sourceRevision,
        expectedSourceHash: loan.sourceHash, expectedContractHash: loan.contractHash, confirm: true,
        legacyOpening: { signedOn: "2026-01-01", amendedOn: null, effectiveOn: "2026-01-01", knownOn, previouslyPaid: "0", evidence }, principalAdvances: [],
        allocations: [{ allocationId: randomUUID(), eventId: debtEventId, actualRevision: 1, bookedOn: "2026-08-28", scope: "FULL_CONTRACT", components, contractComponents: components, paymentStatus: "CURRENT", allocationBasis: "BANK_STATEMENT", evidence }],
        contract: { contractVersion: 2, currency: "VND", signedOn: "2026-01-01", amendedOn: "2026-08-31", effectiveOn: "2026-08-31", knownOn, confirmation: "BANK_CONFIRMED", evidence,
          balanceAsOf: "2026-08-31", principalBalance: "900", balanceScope: "FULL_CONTRACT", paymentShare: "1", responsibility: { kind: "ALLOCATED_SHARE" }, interestBasis: "REDUCING_BALANCE", rounding: "CENT_HALF_UP",
          mode: "REDUCE_PAYMENT_KEEP_TERM", fixedPayment: null, finalPayment: "ADJUST_FINAL_PAYMENT", maturityDate: periods.at(-1).dueDate, periods } }];
      const asset = sourceInput.assetCommands[0]; asset.evidence = evidence;
      Object.assign(asset.capital, { grossAmount: "200", netAmount: "200", availableOn: "2026-08-20", confirmedContributionAmount: "200",
        funding: { status: "STAGED", liquidity: "AVAILABLE", plannedNotIncludedInFund: true,
          allocations: [{ allocationId: randomUUID(), eventId: contributionEventId, actualRevision: 1, bookedOn: "2026-08-28", amount: "60" }],
          plannedContributions: [{ installmentId: randomUUID(), month: "2026-09", amount: "140", timing: "END_OF_MONTH" }], reconciliations: [],
          availability: { amountScope: "NET_SOURCE_SHARE", releases: [{ releaseId: randomUUID(), availableOn: "2026-08-20", amount: "200", status: "CONFIRMED", evidence }] } } });
    }
    const sourcePreview = await plans.previewSources(owner, fixture.planId, sourceInput);
    if (withLoanAssets) {
      assert.equal(sourcePreview.candidate.calculation.rows[0].openingBalance, "940");
      assert.equal(sourcePreview.candidate.calculation.rows[0].capitalInjection, "140");
      assert.equal(sourcePreview.candidate.loanSources.length, 1);
      assert.equal(sourcePreview.candidate.assetSources.length, 1);
    }
    command = { preview: sourceInput, expectedInputHash: sourcePreview.inputHash, confirm: true };
  }
  const concurrentPlans = connections.map(client => new PlansService(client));
  const save = (slot, body, key) => withSources ? concurrentPlans[slot].saveSources(owner, fixture.planId, body, key) : concurrentPlans[slot].saveReforecast(owner, fixture.planId, body, key);
  stage = "save-same-key";
  const key = randomUUID();
  synchronizeTransactions();
  const repeatedResults = await Promise.allSettled([save(0,command,key),save(1,command,key)]);
  barrier = null;
  for (const result of repeatedResults) if (result.status === "rejected") throw result.reason;
  const repeated = repeatedResults.map(r => r.value);
  assert.deepEqual(repeated[0],repeated[1]);assert.equal(await db.planVersion.count({where:{planId:fixture.planId}}),fixture.baseCount+1);checks++;
  if (withSources) {
    command.preview.expectedRevision = fixture.baseCount + 1;
    command.expectedInputHash = (await plans.previewSources(owner, fixture.planId, command.preview)).inputHash;
  } else command.expectedRevision = 3;
  stage = "save-same-revision";
  synchronizeTransactions();
  const raced = await Promise.allSettled([save(0,command,randomUUID()),save(1,command,randomUUID())]);
  barrier = null;
  assert.equal(raced.filter(r=>r.status==="fulfilled").length,1);assert.equal(raced.find(r=>r.status==="rejected").reason.status,409);
  assert.equal(await db.planVersion.count({where:{planId:fixture.planId}}),fixture.baseCount+2);checks++;
  if (withLoanAssets) {
    // Both racing saves must preserve the complete changeset; no loan-only or
    // asset-only version may survive the losing transaction.
    for (const saved of [repeated[0], raced.find(r => r.status === "fulfilled").value]) {
      const version = await plans.version(owner, fixture.planId, saved.saved.id, true);
      assert.equal(version.preview.loanSources.length, 1); assert.equal(version.preview.assetSources.length, 1);
      assert.equal(version.preview.calculation.rows[0].openingBalance, "940");
      assert.equal(version.preview.calculation.rows[0].capitalInjection, "140");
      assert.equal(version.replay.matched, true);
    }
  }
  stage = "actual-edit-against-apply";
  const candidateId = repeated[0].saved.id;
  const apply = { versionId: candidateId, expectedRevision: fixture.baseCount+2, expectedProfileRevision: 1, confirm: true };
  synchronizeTransactions();
  const corrected = withLoanAssets ? { ...mixedActual, correctionReason: "Corrected joint statement", closingBalance: "950",
    entries: mixedActual.entries.map(e => e.eventId === contributionEventId ? { ...e, amount: "70" } : e) } : data("200");
  const changed = await Promise.allSettled([concurrentPlans[0].apply(owner,fixture.planId,apply,randomUUID()),new ActualsService(connections[1]).write(owner,"2026-08",{expectedRevision:1,data:corrected},randomUUID())]);
  barrier = null;
  assert.equal(changed[1].status,"fulfilled");
  if(changed[0].status==="rejected")assert.equal(changed[0].reason.status,409);
  const report = await plans.report(owner,fixture.planId,{versionId:candidateId});assert.equal(report.actualSourceChanged,true);
  const plan = await db.retirementPlan.findUnique({where:{id:fixture.planId}});
  await assert.rejects(plans.apply(owner,fixture.planId,{...apply,expectedRevision:plan.revision},randomUUID()),e=>e.code==="ACTUAL_SOURCE_CHANGED");
  assert.equal((await plans.version(owner,fixture.planId,candidateId,true)).replay.matched,true);checks++;
  if (withLoanAssets) {
    for (const id of [...fixture.versions, fixture.sourceBase.saved.id])
      assert.equal((await plans.version(owner, fixture.planId, id, true)).replay.matched, true);
  }
  stage = "scoped-cleanup"; await cleanup();
  assert.equal(await db.user.count({ where: { id: { in: [owner, admin] } } }), 0);
  assert.equal(await db.idempotencyRecord.count({ where: { userId: { in: [owner, admin] } } }), 0);
  assert.deepEqual(await fingerprint(), before);
  console.log(JSON.stringify({ suite: withLoanAssets ? "LOAN_ASSET_V4_CONCURRENCY" : withSources ? "SOURCE_V4_CONCURRENCY" : "REFORCAST_V3_CONCURRENCY", independentConnectionRaceChecks: checks, fixturesRemoved: true, existingDataUnchanged: true,
    tablesPreserved: Object.keys(before).length, distinctPostgresBackendsVerified: true, publishedFixtureConfigurationsExposed: false, emailsQueued: false }));
})().catch(error => { console.error(JSON.stringify({ stage, code: error.code ?? "PLAN_CONCURRENCY_FAILED", type: error.name })); process.exitCode = 1; })
  .finally(async () => { if (barrier) clearTimeout(barrier.timer); try { await cleanup(); } catch (error) { console.error(JSON.stringify({ stage: "CLEANUP_REQUIRED", code: error.code ?? "CLEANUP_FAILED", fixtureOwner: owner, fixtureAdmin: admin, fixtureConfigIds: configIds })); process.exitCode = 1; } await Promise.all([...clients,db].map(client=>client.$disconnect())); });
