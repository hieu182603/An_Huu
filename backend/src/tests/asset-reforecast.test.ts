import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { plansFixture } from "./plans-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import { assetSourceCommandSchema, type AssetSourceCommand } from "../modules/capital/source-candidate";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
import { digest } from "../common/digest";
import { AuthService } from "../modules/auth/service";
import { config, token } from "./helpers";
import { createApp } from "../app";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z")); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const evidence = [{ reference: "Ownership and net proceeds statement", contentHash: digest("fixture document"), confirmedOn: "2026-10-28" }];
function asset(): Extract<AssetSourceCommand, { operation: "CREATE" }> {
  return { commandId: randomUUID(), sourceId: `plan:${randomUUID()}`, operation: "CREATE", expectedSourceRevision: 0, expectedSourceHash: null, confirm: true, evidence, notAlreadyInSources: true,
    capital: { reference: randomUUID(), kind: "ASSET_SALE", currency: "VND", priceBasis: "NOMINAL_AT_AVAILABILITY", amountScope: "WHOLE_ASSET", ownershipShare: "0.5", retirementShare: "0.5",
      grossAmount: "1000", fees: "50", taxes: "50", securedDebtSettlement: "100", netAmount: "800", availableOn: "2026-11-30", confirmedContributionAmount: "200",
      funding: { status: "PLANNED", liquidity: "PLANNED_RELEASE", notIncludedInFund: true, contributionMonth: "2026-11", contributionTiming: "END_OF_MONTH" } } };
}
async function fixture(withReceipt = false, profile = retirementProfile()) {
  const f = await plansFixture(profile), saved = await f.create(), actuals = new ActualsService(f.db), eventId = randomUUID();
  const data = { currency: "VND" as const, openingBalance: "1000", closingBalance: withReceipt ? "1300" : "1000", correctionReason: "Verified statement",
    entries: withReceipt ? [{ eventId, date: "2026-10-28", kind: "CONTRIBUTION" as const, amount: "300" }] : [] };
  await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data }, randomUUID());
  const command = sourceReforecastSchema.parse({ versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 1,
    expectedProfileRevision: 1, throughMonth: "2026-10", sourceCommands: [], assetCommands: [asset()] });
  return { ...f, saved, actuals, command, eventId, data };
}
const save = async (f: Awaited<ReturnType<typeof fixture>>, command = f.command) => {
  const p = await f.plans.previewSources(f.owner, f.saved.planId, command);
  return f.plans.saveSources(f.owner, f.saved.planId, { preview: command, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
};

it("adds only the confirmed net-owned contribution once, preserves profile/anchor and supports immutable save/apply/replay/CSV", async () => {
  const f = await fixture(), before = JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")]);
  const p = await f.plans.previewSources(f.owner, f.saved.planId, f.command);
  expect(p.candidate!.calculation.rows[0]).toMatchObject({ openingBalance: "1000", capitalInjection: "200", income: "100", contribution: "100", closingBalance: "1300" });
  expect(p.candidate!.calculation.rows.slice(1).every(r => r.capitalInjection === "0")).toBe(true);
  expect(p.assetRevisionOptions).toContainEqual({ sourceId: f.command.assetCommands![0].sourceId, sourceRevision: 1, sourceHash: p.candidate!.assetSources![0].sourceHash });
  const body = { preview: f.command, expectedInputHash: p.inputHash!, confirm: true as const }, key = randomUUID();
  const saved = await f.plans.saveSources(f.owner, f.saved.planId, body, key);
  expect(await f.plans.saveSources(f.owner, f.saved.planId, body, key)).toEqual(saved);
  expect(saved.currentVersionId).toBeNull();
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(p.candidate);
  expect((await f.plans.version(f.owner, saved.planId, f.saved.saved.id, true)).preview.modelVersion).toBe("retirement-monthly-v3");
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect((await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id)).content).toContain(f.command.assetCommands![0].sourceId);
  expect(JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")])).toBe(before);
});

it("checks explicit zero, whole-asset versus user-share amounts, deductions, ownership and availability", async () => {
  const f = await fixture();
  for (const [change, code] of [
    [{ netAmount: "801" }, "ASSET_NET_CONTRIBUTION_MISMATCH"], [{ confirmedContributionAmount: "200.01" }, "ASSET_NET_CONTRIBUTION_MISMATCH"],
    [{ taxes: "1001" }, "ASSET_NET_CONTRIBUTION_MISMATCH"], [{ ownershipShare: "0" }, "ASSET_NET_CONTRIBUTION_MISMATCH"],
    [{ availableOn: "2026-12-01" }, "ASSET_CONTRIBUTION_NOT_AVAILABLE"],
  ] as const) {
    const command = structuredClone(f.command), a = command.assetCommands![0];
    if (a.operation !== "END") Object.assign(a.capital, change);
    await expect(f.plans.previewSources(f.owner, f.saved.planId, command)).rejects.toMatchObject({ code });
  }
  for (const [scope, amount] of [["WHOLE_ASSET", "0"], ["USER_SHARE", "400"]] as const) {
    const a = asset(); a.capital.amountScope = scope; a.capital.confirmedContributionAmount = amount;
    expect((await f.plans.previewSources(f.owner, f.saved.planId, { ...f.command, assetCommands: [a] })).candidate!.calculation.rows[0].capitalInjection).toBe(amount);
  }
  expect(assetSourceCommandSchema.safeParse({ ...asset(), actuals: [] }).success).toBe(false);
  const usd = asset(); (usd.capital as any).currency = "USD";
  expect(assetSourceCommandSchema.safeParse(usd).success).toBe(false);
});

it("revises and cancels a future capital source with CAS, without resurrecting its earlier one-off payment", async () => {
  const f = await fixture(), first = await save(f), a = asset();
  const original = f.command.assetCommands![0];
  if (original.operation === "END") throw new Error("fixture");
  a.capital.reference = original.capital.reference; a.capital.confirmedContributionAmount = "150";
  a.capital.funding = { status: "PLANNED", liquidity: "PLANNED_RELEASE", notIncludedInFund: true, contributionMonth: "2027-01", contributionTiming: "END_OF_MONTH" };
  const revision = assetSourceCommandSchema.parse({ commandId: a.commandId, sourceId: original.sourceId, operation: "REVISE", expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital: a.capital });
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, assetCommands: [revision] };
  const p = await f.plans.previewSources(f.owner, first.planId, command);
  expect(p.candidate!.calculation.rows.map(r => r.capitalInjection)).toEqual(["0", "0", "150", "0", "0"]);
  const second = await save(f, command);
  const end = assetSourceCommandSchema.parse({ commandId: randomUUID(), sourceId: original.sourceId, operation: "END", expectedSourceRevision: 2,
    expectedSourceHash: p.candidate!.assetSources!.at(-1)!.sourceHash, confirm: true, evidence, reason: "Cancelled planned sale" });
  const final = await f.plans.previewSources(f.owner, first.planId, { ...command, versionId: second.saved.id, expectedSnapshotHash: second.saved.snapshotHash, expectedRevision: 3, assetCommands: [end] });
  expect(final.candidate!.calculation.rows.every(r => r.capitalInjection === "0")).toBe(true);
  await expect(f.plans.previewSources(f.owner, first.planId, { ...command, expectedRevision: 3, assetCommands: [{ ...revision, expectedSourceHash: digest("wrong") }] })).rejects.toMatchObject({ code: "ASSET_SOURCE_REVISION_CONFLICT" });
});

it("pins realized contributions to owned actual events, shares allocation limits and never changes the actual anchor", async () => {
  const f = await fixture(true), a = asset(); a.capital.availableOn = "2026-10-25";
  a.capital.funding = { status: "REALIZED", allocations: [{ allocationId: randomUUID(), eventId: f.eventId, actualRevision: 1, bookedOn: "2026-10-28", amount: "200" }] };
  const command = { ...f.command, assetCommands: [a] }, saved = await save(f, command);
  expect(saved.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1300", capitalInjection: "0" });
  const b = structuredClone(a); b.commandId = randomUUID(); b.sourceId = `plan:${randomUUID()}`; b.capital.reference = randomUUID();
  if (b.capital.funding.status !== "REALIZED") throw new Error("fixture");
  b.capital.funding.allocations[0].allocationId = randomUUID();
  const next = { ...command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2, assetCommands: [b] };
  await expect(f.plans.previewSources(f.owner, saved.planId, next)).rejects.toMatchObject({ code: "ASSET_EVENT_OVERALLOCATED" });
  b.capital.confirmedContributionAmount = "100"; b.capital.funding.allocations[0].amount = "100";
  expect((await f.plans.previewSources(f.owner, saved.planId, next)).candidate!.calculation.rows[0].openingBalance).toBe("1300");
  b.capital.funding.allocations[0].actualRevision = 2;
  await expect(f.plans.previewSources(f.owner, saved.planId, next)).rejects.toMatchObject({ code: "ASSET_ACTUAL_STALE_OR_MISSING" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("blocks a repeated asset reference, repeat realization and missing proof even if the outer hash is recomputed", async () => {
  const f = await fixture(true), a = asset(); a.capital.availableOn = "2026-10-25";
  a.capital.funding = { status: "REALIZED", allocations: [{ allocationId: randomUUID(), eventId: f.eventId, actualRevision: 1, bookedOn: "2026-10-28", amount: "200" }] };
  const saved = await save(f, { ...f.command, assetCommands: [a] }), b = asset(); b.capital.reference = a.capital.reference.toUpperCase();
  const command = { ...f.command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2, assetCommands: [b] };
  await expect(f.plans.previewSources(f.owner, saved.planId, command)).rejects.toMatchObject({ code: "ASSET_REFERENCE_ALREADY_EXISTS" });
  const revision = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: a.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (saved.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital: b.capital });
  await expect(f.plans.previewSources(f.owner, saved.planId, { ...command, assetCommands: [revision] })).rejects.toMatchObject({ code: "ASSET_ALREADY_REALIZED" });
  const snapshot = structuredClone(f.rows("planVersion").find(r => r.id === saved.saved.id)!.inputSnapshot) as any;
  snapshot.preview.assetSources = []; const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
});

it("rejects unknown owner and stale actuals on apply, while replay retains the original evidence", async () => {
  const f = await fixture(true), saved = await save(f);
  await expect(f.plans.previewSources("other", saved.planId, f.command)).rejects.toMatchObject({ status: 404 });
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 1, data: { ...f.data, correctionReason: "Corrected statement" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("revises a pinned profile capital source but cannot create that asset again under another plan ID", async () => {
  const profile = retirementProfile(); profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), availableFromMonth: known("2027-01") })] };
  const f = await fixture(false, profile), baseline = await f.plans.previewSources(f.owner, f.saved.planId, { ...f.command, assetCommands: [] });
  const option = baseline.assetRevisionOptions.find(s => s.sourceId === "profile:asset:deposit-1")!;
  const a = asset(); a.capital.reference = "deposit-1";
  await expect(f.plans.previewSources(f.owner, f.saved.planId, { ...f.command, assetCommands: [a] })).rejects.toMatchObject({ code: "ASSET_REFERENCE_ALREADY_EXISTS" });
  const revision = assetSourceCommandSchema.parse({ commandId: a.commandId, sourceId: option.sourceId, operation: "REVISE", expectedSourceRevision: option.sourceRevision,
    expectedSourceHash: option.sourceHash, confirm: true, evidence, capital: a.capital });
  const saved = await save(f, { ...f.command, assetCommands: [revision] });
  expect(saved.saved.preview.calculation!.rows.map(r => r.capitalInjection)).toEqual(["200", "0", "0", "0", "0"]);
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("exposes the asset commands, preview evidence and saved replay through the production HTTP contract", async () => {
  const f = await fixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } }), root = "/api/v1/me/retirement/plans/" + f.saved.planId;
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const call = (path: string, body: object) => request(app).post(root + path).set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID()).send(body);
  const preview = await call("/source-reforecasts/preview", f.command);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const validate = ajv.compile(spec.components.schemas.PlanSourcePreviewEnvelope);
  expect(validate(preview.body), JSON.stringify(validate.errors)).toBe(true);
  const saved = await call("/source-reforecasts", { preview: f.command, expectedInputHash: preview.body.data.inputHash, confirm: true });
  expect(saved.status, JSON.stringify(saved.body)).toBe(201);
  const replay = await call("/versions/" + saved.body.data.saved.id + "/replay", {});
  expect(replay.status, JSON.stringify(replay.body)).toBe(200);
  expect(ajv.compile(spec.components.schemas.PlanReplayEnvelope)(replay.body)).toBe(true);
});

it("advances a planned source into realized actuals without depositing again, and refuses to re-date an elapsed injection", async () => {
  const f = await fixture(), first = await save(f), eventId = randomUUID();
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1000", closingBalance: "1200", correctionReason: "Sale contribution received",
    entries: [{ eventId, date: "2026-11-30", kind: "CONTRIBUTION", amount: "200" }] } }, randomUUID());
  const original = f.command.assetCommands![0]; if (original.operation === "END") throw new Error("fixture");
  const capital = structuredClone(original.capital);
  capital.funding = { status: "PLANNED", liquidity: "AVAILABLE", notIncludedInFund: true, contributionMonth: "2026-12", contributionTiming: "END_OF_MONTH" };
  const revision = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: original.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true, evidence, capital });
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11", assetCommands: [revision] };
  await expect(f.plans.previewSources(f.owner, first.planId, command)).rejects.toMatchObject({ code: "ASSET_PAST_CONTRIBUTION_REVIEW_REQUIRED" });
  if (revision.operation === "END") throw new Error("fixture");
  revision.capital.funding = { status: "REALIZED", allocations: [{ allocationId: randomUUID(), eventId, actualRevision: 1, bookedOn: "2026-11-30", amount: "200" }] };
  const realized = await save(f, command);
  expect(realized.saved.preview.calculation!.rows[0]).toMatchObject({ month: "2026-12", openingBalance: "1200", capitalInjection: "0" });
  expect((await f.plans.version(f.owner, first.planId, realized.saved.id, true)).preview).toEqual(realized.saved.preview);
});

async function missedFixture() {
  const f = await fixture(), first = await save(f);
  const november = { currency: "VND" as const, openingBalance: "1000", closingBalance: "1050", correctionReason: "Planned sale was postponed; unrelated contribution received",
    entries: [{ eventId: randomUUID(), date: "2026-11-30", kind: "CONTRIBUTION" as const, amount: "50" }] };
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: november }, randomUUID());
  const original = f.command.assetCommands![0]; if (original.operation !== "CREATE") throw new Error("fixture");
  const capital = structuredClone(original.capital);
  capital.funding = { status: "PLANNED", liquidity: "PLANNED_RELEASE", notIncludedInFund: true, contributionMonth: "2026-12", contributionTiming: "END_OF_MONTH" };
  const revision = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: original.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: (first.saved.preview as any).assetSources[0].sourceHash, confirm: true,
    evidence: [{ ...evidence[0], confirmedOn: "2026-12-01" }], capital,
    missedContribution: { scheduledMonth: "2026-11", actualRevision: 1, amountNotContributed: "200", confirmedOn: "2026-12-01", reason: "Sale delayed", confirmNotContributed: true } });
  if (revision.operation !== "REVISE") throw new Error("fixture");
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11", assetCommands: [revision] };
  return { ...f, first, november, revision, command };
}

it("postpones an explicitly missed contribution without changing actuals, preserves replay and allows later future edits", async () => {
  const f = await missedFixture(), before = JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")]);
  const saved = await save(f), p = saved.saved.preview;
  expect(p.calculation!.rows.map(r => r.capitalInjection)).toEqual(["200", "0", "0", "0"]);
  expect(p.calculation!.rows[0].openingBalance).toBe("1050");
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(p);
  expect((await f.plans.version(f.owner, saved.planId, f.first.saved.id, true)).preview).toEqual(f.first.saved.preview);
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect(JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")])).toBe(before);
  const revision = structuredClone(f.revision); delete revision.missedContribution;
  revision.commandId = randomUUID(); revision.expectedSourceRevision = 2; revision.expectedSourceHash = (p as any).assetSources.at(-1).sourceHash;
  if (revision.capital.funding.status !== "PLANNED") throw new Error("fixture");
  revision.capital.funding.contributionMonth = "2027-01";
  const next = { ...f.command, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 4, assetCommands: [revision] };
  const changed = await save(f, next);
  expect(changed.saved.preview.calculation!.rows.map(r => r.capitalInjection)).toEqual(["0", "200", "0", "0"]);
  expect((await f.plans.version(f.owner, saved.planId, changed.saved.id, true)).preview).toEqual(changed.saved.preview);
});

it("requires exact missed amount/month, closed actual revision and current confirmation, with no partial save", async () => {
  const f = await missedFixture(), count = f.rows("planVersion").length;
  for (const [change, code] of [
    [{ amountNotContributed: "199" }, "ASSET_MISSED_CONTRIBUTION_MISMATCH"],
    [{ scheduledMonth: "2026-10" }, "ASSET_MISSED_CONTRIBUTION_MISMATCH"],
    [{ actualRevision: 2 }, "ASSET_ACTUAL_STALE_OR_MISSING"],
    [{ confirmedOn: "2026-11-29" }, "ASSET_MISSED_CONTRIBUTION_MISMATCH"],
    [{ confirmedOn: "2026-12-06" }, "ASSET_MISSED_CONTRIBUTION_MISMATCH"],
  ] as const) {
    const command = structuredClone(f.command); Object.assign(command.assetCommands[0].missedContribution!, change);
    await expect(save(f, command)).rejects.toMatchObject({ code });
  }
  const noEvidence = structuredClone(f.command); noEvidence.assetCommands[0].evidence = evidence;
  await expect(save(f, noEvidence)).rejects.toMatchObject({ code: "ASSET_MISSED_CONTRIBUTION_MISMATCH" });
  expect(f.rows("planVersion").length).toBe(count);
  const saved = await save(f);
  const snapshot = structuredClone(f.rows("planVersion").find(r => r.id === saved.saved.id)!.inputSnapshot) as any;
  delete snapshot.preview.assetSources.at(-1).evidence.command.missedContribution;
  const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrow();
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 1, data: { ...f.november, correctionReason: "Corrected statement" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("requires a fresh declaration when a postponed contribution is missed again, then permits realization only once", async () => {
  const f = await missedFixture(), first = await save(f);
  vi.setSystemTime(new Date("2027-02-05T00:00:00Z"));
  await f.actuals.write(f.owner, "2026-12", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1050", closingBalance: "1050", entries: [], correctionReason: "Still not contributed" } }, randomUUID());
  const revision = structuredClone(f.revision); revision.commandId = randomUUID(); revision.expectedSourceRevision = 2;
  revision.expectedSourceHash = (first.saved.preview as any).assetSources.at(-1).sourceHash;
  revision.evidence = [{ ...evidence[0], confirmedOn: "2027-01-01" }];
  if (revision.capital.funding.status !== "PLANNED") throw new Error("fixture");
  revision.capital.funding.contributionMonth = "2027-01";
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 3, throughMonth: "2026-12", assetCommands: [revision] };
  await expect(save(f, command)).rejects.toMatchObject({ code: "ASSET_MISSED_CONTRIBUTION_MISMATCH" });
  revision.missedContribution = { ...revision.missedContribution!, scheduledMonth: "2026-12", confirmedOn: "2027-01-01" };
  const second = await save(f, command);
  expect(second.saved.preview.calculation!.rows.map(r => r.capitalInjection)).toEqual(["200", "0", "0"]);
  const eventId = randomUUID();
  await f.actuals.write(f.owner, "2027-01", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1050", closingBalance: "1250", correctionReason: "Finally contributed",
    entries: [{ eventId, date: "2027-01-31", kind: "CONTRIBUTION", amount: "200" }] } }, randomUUID());
  revision.commandId = randomUUID(); revision.expectedSourceRevision = 3; revision.expectedSourceHash = (second.saved.preview as any).assetSources.at(-1).sourceHash;
  delete revision.missedContribution;
  revision.capital.funding = { status: "REALIZED", allocations: [{ allocationId: randomUUID(), eventId, actualRevision: 1, bookedOn: "2027-01-31", amount: "200" }] };
  const realized = await save(f, { ...command, versionId: second.saved.id, expectedSnapshotHash: second.saved.snapshotHash, expectedRevision: 4, throughMonth: "2027-01" });
  expect(realized.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1250", capitalInjection: "0" });
  expect((await f.plans.version(f.owner, realized.planId, realized.saved.id, true)).preview).toEqual(realized.saved.preview);
});

it("can postpone a missed capital source imported from the profile using its pinned scheduled amount", async () => {
  const profile = retirementProfile(); profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), availableFromMonth: known("2026-11") })] };
  const f = await fixture(false, profile);
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1000", closingBalance: "1000", entries: [], correctionReason: "Asset contribution delayed" } }, randomUUID());
  const baseline = await f.plans.previewSources(f.owner, f.saved.planId, { ...f.command, throughMonth: "2026-11", assetCommands: [] });
  const option = baseline.assetRevisionOptions.find(s => s.sourceId === "profile:asset:deposit-1")!;
  const source = baseline.candidate!.replayInput.sourceRegistry.revisions.find(s => s.sourceHash === option.sourceHash)!;
  const amount = source.schedule.find(s => s.metric === "capitalInjection" && s.month === "2026-11")!.amount;
  const a = asset(); a.capital.reference = "deposit-1";
  if (a.capital.funding.status !== "PLANNED") throw new Error("fixture");
  a.capital.funding.contributionMonth = "2026-12";
  const revision = assetSourceCommandSchema.parse({ commandId: randomUUID(), operation: "REVISE", sourceId: option.sourceId,
    expectedSourceRevision: option.sourceRevision, expectedSourceHash: option.sourceHash,
    confirm: true, evidence: [{ ...evidence[0], confirmedOn: "2026-12-01" }], capital: a.capital,
    missedContribution: { scheduledMonth: "2026-11", actualRevision: 1, amountNotContributed: amount, confirmedOn: "2026-12-01", reason: "Not yet contributed", confirmNotContributed: true } });
  const saved = await save(f, { ...f.command, throughMonth: "2026-11", assetCommands: [revision] });
  expect(saved.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1000", capitalInjection: "200" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("accepts missed contributions through the public schema and rejects attaching that declaration to a new source or realized receipt", async () => {
  const f = await missedFixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } });
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const route = spec.paths["/api/v1/me/retirement/plans/{planId}/source-reforecasts/preview"].post;
  const validate = ajv.compile(route.requestBody.content["application/json"].schema);
  expect(validate(f.command), JSON.stringify(validate.errors)).toBe(true);
  const response = await request(app).post("/api/v1/me/retirement/plans/" + f.saved.planId + "/source-reforecasts/preview")
    .set("Authorization", "Bearer " + token()).send(f.command);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(ajv.compile(spec.components.schemas.PlanSourcePreviewEnvelope)(response.body)).toBe(true);
  expect(assetSourceCommandSchema.safeParse({ ...asset(), missedContribution: f.revision.missedContribution }).success).toBe(false);
  f.revision.capital.funding = { status: "REALIZED", allocations: [] };
  await expect(save(f)).rejects.toMatchObject({ code: "ASSET_MISSED_CONTRIBUTION_MISMATCH" });
});
