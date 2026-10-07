import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { plansFixture } from "./plans-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { assetSourceCommandSchema } from "../modules/capital/source-candidate";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
import { digest } from "../common/digest";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { config, token } from "./helpers";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2027-01-05T00:00:00Z")); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const evidence = [{ reference: "Confirmed staged capital contributions", contentHash: digest("staged fixture"), confirmedOn: "2027-01-01" }];
const part = (month: string, amount: string) => ({ installmentId: randomUUID(), month, amount, timing: "END_OF_MONTH" as const });
async function fixture() {
  const f = await plansFixture(), original = await f.create(), actuals = new ActualsService(f.db);
  const eventId = randomUUID();
  await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1000", closingBalance: "1060", correctionReason: "First partial contribution",
    entries: [{ eventId, date: "2026-10-28", kind: "CONTRIBUTION", amount: "60" }] } }, randomUUID());
  const source = assetSourceCommandSchema.parse({ commandId: randomUUID(), sourceId: `plan:${randomUUID()}`, operation: "CREATE", expectedSourceRevision: 0, expectedSourceHash: null,
    confirm: true, evidence, notAlreadyInSources: true,
    capital: { reference: "sale-installments", kind: "ASSET_SALE", currency: "VND", priceBasis: "NOMINAL_AT_AVAILABILITY", amountScope: "WHOLE_ASSET",
      ownershipShare: "0.5", retirementShare: "0.5", grossAmount: "1000", fees: "50", taxes: "50", securedDebtSettlement: "100", netAmount: "800",
      availableOn: "2026-10-20", confirmedContributionAmount: "200", funding: { status: "STAGED", liquidity: "AVAILABLE", plannedNotIncludedInFund: true,
        allocations: [{ allocationId: randomUUID(), eventId, actualRevision: 1, bookedOn: "2026-10-28", amount: "60" }],
        plannedContributions: [part("2026-11", "40"), part("2026-11", "60"), part("2026-12", "40")], reconciliations: [] } } });
  if (source.operation !== "CREATE" || source.capital.funding.status !== "STAGED") throw new Error("fixture");
  const command = sourceReforecastSchema.parse({ versionId: original.saved.id, expectedSnapshotHash: original.saved.snapshotHash, expectedRevision: 1,
    expectedProfileRevision: 1, throughMonth: "2026-10", sourceCommands: [], assetCommands: [source] });
  const save = async (input = command) => {
    const p = await f.plans.previewSources(f.owner, original.planId, input);
    return f.plans.saveSources(f.owner, original.planId, { preview: input, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
  };
  return { ...f, original, actuals, command, source, save };
}
async function partialFixture() {
  const f = await fixture(), first = await f.save(), eventId = randomUUID();
  const november = { currency: "VND" as const, openingBalance: "1060", closingBalance: "1090", correctionReason: "Only 30 of planned 100 contributed",
    entries: [{ eventId, date: "2026-11-28", kind: "CONTRIBUTION" as const, amount: "30" }] };
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: november }, randomUUID());
  const capital = structuredClone(f.source.capital); if (capital.funding.status !== "STAGED") throw new Error("fixture");
  const allocationId = randomUUID();
  capital.funding.allocations = [{ allocationId, eventId, actualRevision: 1, bookedOn: "2026-11-28", amount: "30" }];
  capital.funding.plannedContributions = [part("2026-12", "70"), part("2026-12", "40")];
  capital.funding.reconciliations = [{ scheduledMonth: "2026-11", actualRevision: 1, receivedAllocationIds: [allocationId], amountNotContributed: "70", confirmedOn: "2026-12-01", reason: "Remaining contribution postponed", confirm: true }];
  const revision = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: f.source.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital });
  if (revision.operation !== "REVISE" || revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11", assetCommands: [revision] };
  return { ...f, first, november, revision, command };
}

it("aggregates monthly installments once and preserves the real anchor while carrying prior receipts through partial and final realization", async () => {
  const f = await partialFixture();
  expect(f.first.saved.preview.calculation!.rows.map(r => r.capitalInjection)).toEqual(["100", "40", "0", "0", "0"]);
  expect(f.first.saved.preview.calculation!.rows[0].openingBalance).toBe("1060");
  const second = await f.save(f.command);
  expect(second.saved.preview.calculation!.rows.map(r => r.capitalInjection)).toEqual(["110", "0", "0", "0"]);
  expect(second.saved.preview.calculation!.rows[0].openingBalance).toBe("1090");
  expect((second.saved.preview as any).assetSources.at(-1).evidence.priorRealized).toHaveLength(1);
  const eventId = randomUUID();
  await f.actuals.write(f.owner, "2026-12", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1090", closingBalance: "1200", correctionReason: "Final installment received",
    entries: [{ eventId, date: "2026-12-28", kind: "CONTRIBUTION", amount: "110" }] } }, randomUUID());
  const revision = structuredClone(f.revision); revision.commandId = randomUUID(); revision.expectedSourceRevision = 2;
  revision.expectedSourceHash = (second.saved.preview as any).assetSources.at(-1).sourceHash;
  if (revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const allocationId = randomUUID();
  revision.capital.funding.allocations = [{ allocationId, eventId, actualRevision: 1, bookedOn: "2026-12-28", amount: "110" }];
  revision.capital.funding.plannedContributions = [];
  revision.capital.funding.reconciliations = [{ scheduledMonth: "2026-12", actualRevision: 1, receivedAllocationIds: [allocationId], amountNotContributed: "0", confirmedOn: "2027-01-01", reason: "Fully received", confirm: true }];
  const final = await f.save({ ...f.command, versionId: second.saved.id, expectedSnapshotHash: second.saved.snapshotHash, expectedRevision: 3, throughMonth: "2026-12", assetCommands: [revision] });
  expect(final.saved.preview.calculation!.rows.every(r => r.capitalInjection === "0")).toBe(true);
  expect(final.saved.preview.calculation!.rows[0].openingBalance).toBe("1200");
  for (const saved of [f.first, second, final]) expect((await f.plans.version(f.owner, final.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
  const before = JSON.stringify([f.rows("actualMonth"), f.rows("financialProfile")]);
  await f.plans.apply(f.owner, final.planId, { versionId: final.saved.id, expectedRevision: 4, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect(JSON.stringify([f.rows("actualMonth"), f.rows("financialProfile")])).toBe(before);
});

it("checks cumulative net capacity, exact totals, unique installments and full reconciliation of each elapsed month", async () => {
  const f = await partialFixture(), count = f.rows("planVersion").length;
  for (const [change, code] of [
    [(c: typeof f.revision.capital) => { c.confirmedContributionAmount = "201"; }, "ASSET_NET_CONTRIBUTION_MISMATCH"],
    [(c: typeof f.revision.capital) => { c.confirmedContributionAmount = "140"; }, "ASSET_INSTALLMENT_TOTAL_MISMATCH"],
    [(c: typeof f.revision.capital) => { if (c.funding.status === "STAGED") c.funding.plannedContributions[1].installmentId = c.funding.plannedContributions[0].installmentId; }, "ASSET_INSTALLMENT_INVALID"],
    [(c: typeof f.revision.capital) => { if (c.funding.status === "STAGED") c.funding.reconciliations = []; }, "ASSET_INSTALLMENT_RECONCILIATION_REQUIRED"],
    [(c: typeof f.revision.capital) => { if (c.funding.status === "STAGED") c.funding.reconciliations[0].amountNotContributed = "69"; }, "ASSET_INSTALLMENT_RECONCILIATION_MISMATCH"],
    [(c: typeof f.revision.capital) => { if (c.funding.status === "STAGED") c.funding.reconciliations[0].actualRevision = 2; }, "ASSET_ACTUAL_STALE_OR_MISSING"],
    [(c: typeof f.revision.capital) => { if (c.funding.status === "STAGED") c.funding.reconciliations[0].confirmedOn = "2026-11-20"; }, "ASSET_INSTALLMENT_RECONCILIATION_MISMATCH"],
    [(c: typeof f.revision.capital) => { c.availableOn = "2026-11-01"; }, "ASSET_REALIZATION_MISMATCH"],
  ] as const) {
    const command = structuredClone(f.command); change(command.assetCommands[0].capital);
    await expect(f.save(command)).rejects.toMatchObject({ code });
  }
  expect(f.rows("planVersion").length).toBe(count);
});

it("rejects reusing past receipts, excess event allocations and erasing the staged history", async () => {
  const f = await partialFixture();
  if (f.source.capital.funding.status !== "STAGED" || f.revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const command = structuredClone(f.command), c = command.assetCommands[0].capital;
  if (c.funding.status !== "STAGED") throw new Error("fixture");
  c.funding.allocations = [...f.source.capital.funding.allocations];
  await expect(f.save(command)).rejects.toMatchObject({ code: "ASSET_ALLOCATION_REUSED" });
  c.funding.allocations[0].allocationId = randomUUID();
  await expect(f.save(command)).rejects.toMatchObject({ code: "ASSET_EVENT_OVERALLOCATED" });
  c.funding = { status: "REALIZED", allocations: f.revision.capital.funding.allocations };
  await expect(f.save(command)).rejects.toMatchObject({ code: "ASSET_STAGED_HISTORY_REQUIRED" });
  const saved = await f.save(f.command), snapshot = structuredClone(f.rows("planVersion").find(r => r.id === saved.saved.id)!.inputSnapshot) as any;
  snapshot.preview.assetSources.at(-1).evidence.priorRealized = [];
  const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrow();
  delete snapshot.preview.assetSources.at(-1).evidence.priorRealized;
  const { integrityHash: ignored, ...missing } = snapshot; snapshot.integrityHash = digest(missing);
  expect(() => readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
});

it("reconciles multiple elapsed months independently and cannot use one allocation to settle two scheduled months", async () => {
  const f = await partialFixture();
  const decemberEvent = randomUUID();
  await f.actuals.write(f.owner, "2026-12", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1090", closingBalance: "1200", correctionReason: "Late contribution and final installment combined",
    entries: [{ eventId: decemberEvent, date: "2026-12-28", kind: "CONTRIBUTION", amount: "110" }] } }, randomUUID());
  if (f.revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const fnd = f.revision.capital.funding, allocationId = randomUUID();
  fnd.allocations.push({ allocationId, eventId: decemberEvent, actualRevision: 1, bookedOn: "2026-12-28", amount: "110" });
  fnd.plannedContributions = [];
  fnd.reconciliations.push({ scheduledMonth: "2026-12", actualRevision: 1, receivedAllocationIds: [allocationId], amountNotContributed: "0", confirmedOn: "2027-01-01", reason: "Received more than monthly forecast including prior shortfall", confirm: true });
  const command = { ...f.command, throughMonth: "2026-12" }, saved = await f.save(command);
  expect(saved.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1200", capitalInjection: "0" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
  const invalid = structuredClone(command); const funding = invalid.assetCommands[0].capital.funding;
  if (funding.status !== "STAGED") throw new Error("fixture");
  funding.reconciliations[1].receivedAllocationIds = funding.reconciliations[0].receivedAllocationIds;
  // Use the saved branch's revision so the financial check runs before CAS save.
  invalid.expectedRevision = 3;
  await expect(f.plans.previewSources(f.owner, saved.planId, invalid)).rejects.toMatchObject({ code: "ASSET_INSTALLMENT_RECONCILIATION_MISMATCH" });
});

it("can add explicitly confirmed future deposits after a one-off realized contribution, counting the old receipt in the same cap", async () => {
  const f = await fixture();
  if (f.source.capital.funding.status !== "STAGED") throw new Error("fixture");
  const original = structuredClone(f.source); original.capital.confirmedContributionAmount = "60";
  original.capital.funding = { status: "REALIZED", allocations: f.source.capital.funding.allocations };
  const first = await f.save({ ...f.command, assetCommands: [original] });
  const capital = structuredClone(f.source.capital); if (capital.funding.status !== "STAGED") throw new Error("fixture");
  capital.funding.allocations = [];
  const revised = assetSourceCommandSchema.parse({ commandId: randomUUID(), operation: "REVISE", sourceId: original.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital });
  const second = await f.save({ ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, assetCommands: [revised] });
  expect(second.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1060", capitalInjection: "100" });
  expect((await f.plans.version(f.owner, first.planId, second.saved.id, true)).preview).toEqual(second.saved.preview);
});

it("allows cancelling remaining installments without undoing received money and blocks apply after actual correction", async () => {
  const f = await partialFixture(), saved = await f.save(f.command);
  const end = assetSourceCommandSchema.parse({ commandId: randomUUID(), operation: "END", sourceId: f.source.sourceId, expectedSourceRevision: 2,
    expectedSourceHash: (saved.saved.preview as any).assetSources.at(-1).sourceHash, confirm: true, evidence, reason: "Cancel remaining deposits" });
  const cancelled = await f.save({ ...f.command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 3, assetCommands: [end] });
  expect(cancelled.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1090", capitalInjection: "0" });
  expect((await f.plans.version(f.owner, saved.planId, cancelled.saved.id, true)).preview).toEqual(cancelled.saved.preview);
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 1, data: { ...f.november, correctionReason: "Corrected receipt" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: cancelled.saved.id, expectedRevision: 4, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("accepts staged requests through HTTP/OpenAPI and rejects client-injected prior receipts", async () => {
  const f = await fixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } });
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const validate = ajv.compile(spec.paths["/api/v1/me/retirement/plans/{planId}/source-reforecasts/preview"].post.requestBody.content["application/json"].schema);
  expect(validate(f.command), JSON.stringify(validate.errors)).toBe(true);
  const root = "/api/v1/me/retirement/plans/" + f.original.planId;
  const p = await request(app).post(root + "/source-reforecasts/preview").set("Authorization", "Bearer " + token()).send(f.command);
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  expect(ajv.compile(spec.components.schemas.PlanSourcePreviewEnvelope)(p.body)).toBe(true);
  const body = { preview: f.command, expectedInputHash: p.body.data.inputHash, confirm: true }, key = randomUUID();
  const call = () => request(app).post(root + "/source-reforecasts").set("Authorization", "Bearer " + token()).set("Idempotency-Key", key).send(body);
  const saved = await call(); expect(saved.status, JSON.stringify(saved.body)).toBe(201); expect((await call()).body.data).toEqual(saved.body.data);
  expect(assetSourceCommandSchema.safeParse({ ...f.source, priorRealized: [] }).success).toBe(false);
});

async function phasedFixture() {
  const f = await fixture(), source = f.command.assetCommands![0];
  if (source.operation === "END" || source.capital.funding.status !== "STAGED") throw new Error("fixture");
  const funding = source.capital.funding;
  funding.liquidity = "PLANNED_RELEASE";
  funding.availability = { amountScope: "NET_SOURCE_SHARE", releases: [
    { releaseId: randomUUID(), availableOn: "2026-10-20", amount: "80", status: "CONFIRMED", evidence },
    { releaseId: randomUUID(), availableOn: "2026-11-30", amount: "80", status: "EXPECTED", evidence },
    { releaseId: randomUUID(), availableOn: "2026-12-20", amount: "40", status: "EXPECTED", evidence },
  ] };
  return { ...f, funding };
}

it("funds month-end installments only from releases available by then, keeping released cash outside the fund until contributed", async () => {
  const f = await phasedFixture(), saved = await f.save();
  expect(saved.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1060", capitalInjection: "100" });
  expect(saved.saved.preview.calculation!.rows.map(r => r.capitalInjection)).toEqual(["100", "40", "0", "0", "0"]);
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
  const late = structuredClone(f.command), source = late.assetCommands![0];
  if (source.operation === "END" || source.capital.funding.status !== "STAGED") throw new Error("fixture");
  source.capital.funding.availability!.releases[1].availableOn = "2026-12-01";
  late.expectedRevision = 2;
  await expect(f.plans.previewSources(f.owner, saved.planId, late)).rejects.toMatchObject({ code: "ASSET_PLANNED_CONTRIBUTION_BEFORE_RELEASE" });
});

it("rejects actual deposits financed by expected or later confirmed releases, duplicate releases and cumulative overfunding", async () => {
  const f = await phasedFixture();
  for (const [change, code] of [
    [(s: typeof f.funding) => { s.availability!.releases[0].status = "EXPECTED"; }, "ASSET_RECEIPT_BEFORE_RELEASE"],
    [(s: typeof f.funding) => { s.availability!.releases[0].amount = "59"; }, "ASSET_RECEIPT_BEFORE_RELEASE"],
    [(s: typeof f.funding) => { s.availability!.releases[2].amount = "41"; }, "ASSET_RELEASE_LIMIT_EXCEEDED"],
    [(s: typeof f.funding) => { s.availability!.releases[1].releaseId = s.availability!.releases[0].releaseId; }, "ASSET_RELEASE_INVALID"],
    [(s: typeof f.funding) => { s.liquidity = "AVAILABLE"; }, "ASSET_RELEASE_AVAILABILITY_MISMATCH"],
    [(s: typeof f.funding) => { s.availability!.releases[0].evidence = [{ ...evidence[0], confirmedOn: "2026-10-19" }]; }, "ASSET_RELEASE_CONFIRMATION_INVALID"],
    [(s: typeof f.funding) => { s.availability!.releases[0].evidence = [{ ...evidence[0], confirmedOn: "2027-01-06" }]; }, "ASSET_RELEASE_INVALID"],
  ] as const) {
    const command = structuredClone(f.command), source = command.assetCommands![0];
    if (source.operation === "END" || source.capital.funding.status !== "STAGED") throw new Error("fixture");
    change(source.capital.funding);
    await expect(f.save(command)).rejects.toMatchObject({ code });
  }
  const late = structuredClone(f.command), source = late.assetCommands![0];
  if (source.operation === "END" || source.capital.funding.status !== "STAGED") throw new Error("fixture");
  source.capital.availableOn = "2026-10-29"; source.capital.funding.availability!.releases[0].availableOn = "2026-10-29";
  await expect(f.save(late)).rejects.toMatchObject({ code: "ASSET_REALIZATION_MISMATCH" });
});

it("confirms an expected release before allocating an actual payment and preserves previous confirmed tranches across revisions", async () => {
  const f = await phasedFixture(), first = await f.save(), eventId = randomUUID();
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1060", closingBalance: "1160", correctionReason: "Second release and contribution received",
    entries: [{ eventId, date: "2026-11-30", kind: "CONTRIBUTION", amount: "100" }] } }, randomUUID());
  const original = f.command.assetCommands![0]; if (original.operation === "END") throw new Error("fixture");
  const capital = structuredClone(original.capital); if (capital.funding.status !== "STAGED") throw new Error("fixture");
  const allocationId = randomUUID();
  capital.funding.allocations = [{ allocationId, eventId, actualRevision: 1, bookedOn: "2026-11-30", amount: "100" }];
  capital.funding.plannedContributions = [part("2026-12", "40")];
  capital.funding.reconciliations = [{ scheduledMonth: "2026-11", actualRevision: 1, receivedAllocationIds: [allocationId], amountNotContributed: "0", confirmedOn: "2026-12-01", reason: "Received in full", confirm: true }];
  const revision = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: original.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital });
  if (revision.operation !== "REVISE" || revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11", assetCommands: [revision] };
  await expect(f.save(command)).rejects.toMatchObject({ code: "ASSET_RECEIPT_BEFORE_RELEASE" });
  revision.capital.funding.availability!.releases[1].status = "CONFIRMED";
  const erased = structuredClone(command); if (erased.assetCommands[0].capital.funding.status !== "STAGED") throw new Error("fixture");
  delete erased.assetCommands[0].capital.funding.availability;
  await expect(f.save(erased)).rejects.toMatchObject({ code: "ASSET_AVAILABILITY_HISTORY_REQUIRED" });
  const altered = structuredClone(command); if (altered.assetCommands[0].capital.funding.status !== "STAGED") throw new Error("fixture");
  altered.assetCommands[0].capital.funding.availability!.releases[0].amount = "79";
  await expect(f.save(altered)).rejects.toMatchObject({ code: "ASSET_CONFIRMED_RELEASE_IMMUTABLE" });
  const second = await f.save(command);
  expect(second.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1160", capitalInjection: "40" });
  expect((await f.plans.version(f.owner, second.planId, second.saved.id, true)).preview).toEqual(second.saved.preview);
  expect((await f.plans.version(f.owner, second.planId, first.saved.id, true)).preview).toEqual(first.saved.preview);
});

it("validates phased-release request/response schemas through the production API", async () => {
  const f = await phasedFixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } });
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const validate = ajv.compile(spec.paths["/api/v1/me/retirement/plans/{planId}/source-reforecasts/preview"].post.requestBody.content["application/json"].schema);
  expect(validate(f.command), JSON.stringify(validate.errors)).toBe(true);
  const response = await request(app).post("/api/v1/me/retirement/plans/" + f.original.planId + "/source-reforecasts/preview")
    .set("Authorization", "Bearer " + token()).send(f.command);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(ajv.compile(spec.components.schemas.PlanSourcePreviewEnvelope)(response.body)).toBe(true);
});

it("requires rescheduling or confirming an overdue expected release before using it in a later forecast", async () => {
  const f = await phasedFixture(), first = await f.save();
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1060", closingBalance: "1060", entries: [], correctionReason: "Sale installment and planned contribution did not arrive" } }, randomUUID());
  const original = f.command.assetCommands![0]; if (original.operation === "END") throw new Error("fixture");
  const capital = structuredClone(original.capital); if (capital.funding.status !== "STAGED") throw new Error("fixture");
  capital.funding.allocations = []; capital.funding.plannedContributions = [part("2026-12", "140")];
  capital.funding.reconciliations = [{ scheduledMonth: "2026-11", actualRevision: 1, receivedAllocationIds: [], amountNotContributed: "100", confirmedOn: "2026-12-01", reason: "Awaiting buyer payment", confirm: true }];
  const revision = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: original.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital });
  if (revision.operation !== "REVISE" || revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11", assetCommands: [revision] };
  await expect(f.save(command)).rejects.toMatchObject({ code: "ASSET_RELEASE_RECONCILIATION_REQUIRED" });
  revision.capital.funding.availability!.releases[1].availableOn = "2026-12-10";
  const saved = await f.save(command);
  expect(saved.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1060", capitalInjection: "140" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});
