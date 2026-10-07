import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { plansFixture } from "./plans-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { reforecastPreviewSchema } from "../modules/actuals/schema";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import { assetSourceCommandSchema } from "../modules/capital/source-candidate";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
import { digest } from "../common/digest";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z")); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const evidence = [{ reference: "Remaining owned net capital after prior contribution", contentHash: digest("legacy bridge fixture"), confirmedOn: "2026-12-01" }];

async function fixture(rental = false) {
  const profile = retirementProfile();
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ id: "legacy-asset", value: known("800"), ownershipShare: known("0.5"), retirementShare: known("0.5"),
    emergencyShare: known("0.3"), otherGoalsShare: known("0.2"), availableFromMonth: known("2026-11"),
    ...(rental ? { type: "REAL_ESTATE", housingPlan: { status: "CONFIRMED", kind: "RENT", startMonth: "2026-10", netAmount: known("80") } } : {}) })] };
  const f = await plansFixture(profile), actuals = new ActualsService(f.db);
  const input = { ...f.command.preview, housing: rental ? [{ assetId: "legacy-asset", amountScope: "WHOLE_ASSET" as const }] : [] };
  const preview = await f.retirement.preview(f.owner, input);
  const original = await f.plans.createVersion(f.owner, null, { expectedRevision: 0, expectedInputHash: preview.inputHash!, preview: input }, randomUUID());
  const eventId = randomUUID(), data = { currency: "VND" as const, openingBalance: "1000", closingBalance: "1060", correctionReason: "Legacy source contribution",
    entries: [{ eventId, date: "2026-10-28", kind: "CONTRIBUTION" as const, amount: "60" }] };
  await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data }, randomUUID());
  const changeId = randomUUID();
  const legacyInput = reforecastPreviewSchema.parse({ planId: original.planId, versionId: original.saved.id, throughMonth: "2026-10", expectedProfileRevision: 1,
    sourceChanges: [{ id: changeId, kind: "ASSET_REALIZED", sourceId: "legacy-asset", actual: { period: "2026-10", eventId }, confirmed: true, document: "Legacy actual reference" }] });
  const legacyPreview = await actuals.previewUpdate(f.owner, legacyInput);
  const legacy = await f.plans.saveReforecast(f.owner, original.planId, { expectedRevision: 1, expectedInputHash: legacyPreview.inputHash!, preview: legacyInput }, randomUUID());
  const baseline = sourceReforecastSchema.parse({ versionId: legacy.saved.id, expectedSnapshotHash: legacy.saved.snapshotHash, expectedRevision: 2, expectedProfileRevision: 1,
    throughMonth: "2026-10", sourceCommands: [] });
  const ready = await f.plans.previewSources(f.owner, original.planId, baseline);
  const option = ready.assetRevisionOptions.find(s => s.sourceId === "profile:asset:legacy-asset")!;
  expect(option).toBeDefined();
  const revision = assetSourceCommandSchema.parse({ commandId: randomUUID(), sourceId: option.sourceId, operation: "REVISE", expectedSourceRevision: option.sourceRevision,
    expectedSourceHash: option.sourceHash, confirm: true, evidence,
    capital: { reference: "legacy-asset", kind: rental ? "ASSET_SALE" : "LIQUID_CAPITAL", currency: "VND", priceBasis: "NOMINAL_AT_AVAILABILITY", amountScope: "WHOLE_ASSET",
      ownershipShare: "0.5", retirementShare: "0.5", grossAmount: "1000", fees: "50", taxes: "50", securedDebtSettlement: "100", netAmount: "800",
      availableOn: "2026-10-20", confirmedContributionAmount: "200", funding: { status: "STAGED", liquidity: "AVAILABLE", plannedNotIncludedInFund: true,
        allocations: [], plannedContributions: [{ installmentId: randomUUID(), month: "2026-12", amount: "140", timing: "END_OF_MONTH" }], reconciliations: [] } } });
  if (revision.operation !== "REVISE" || revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  const command = { ...baseline, assetCommands: [revision] };
  const save = async (value = command) => {
    const p = await f.plans.previewSources(f.owner, original.planId, value);
    return f.plans.saveSources(f.owner, original.planId, { preview: value, expectedInputHash: p.inputHash!, confirm: true }, randomUUID());
  };
  return { ...f, original, actuals, data, eventId, changeId, legacy, baseline, revision, command, save };
}

it.each([false, true])("carries the whole legacy receipt into STAGED without adding it to the fund or restoring removed rent (rental=%s)", async rental => {
  const f = await fixture(rental), before = JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")]), saved = await f.save();
  const p = saved.saved.preview;
  expect(p.calculation!.rows[0].openingBalance).toBe("1060");
  expect(p.calculation!.rows.map(r => r.capitalInjection)).toEqual(["0", "140", "0", "0", "0"]);
  expect(p.calculation!.rows.map(r => r.income)).toEqual(["100", "100", "0", "0", "0"]);
  expect((p as any).assetSources[0].evidence.priorRealized).toEqual([{ allocationId: f.changeId, eventId: f.eventId, actualRevision: 1, bookedOn: "2026-10-28", amount: "60" }]);
  for (const version of [f.original, f.legacy, saved]) expect((await f.plans.version(f.owner, saved.planId, version.saved.id, true)).preview).toEqual(version.saved.preview);
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect(JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")])).toBe(before);
  expect((await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id)).content).toContain("profile:asset:legacy-asset");
});

it("rejects a total that omits legacy receipts, receipt reuse and one-off attempts to bypass the carried history", async () => {
  const f = await fixture(), count = f.rows("planVersion").length;
  const missing = structuredClone(f.command); missing.assetCommands[0].capital.confirmedContributionAmount = "140";
  await expect(f.save(missing)).rejects.toMatchObject({ code: "ASSET_INSTALLMENT_TOTAL_MISMATCH" });
  const reused = structuredClone(f.command), funding = reused.assetCommands[0].capital.funding;
  if (funding.status !== "STAGED") throw new Error("fixture");
  funding.allocations = [{ allocationId: randomUUID(), eventId: f.eventId, actualRevision: 1, bookedOn: "2026-10-28", amount: "1" }];
  await expect(f.save(reused)).rejects.toMatchObject({ code: "ASSET_EVENT_OVERALLOCATED" });
  const oneOff = structuredClone(f.command); oneOff.assetCommands[0].capital.funding = { status: "PLANNED", liquidity: "AVAILABLE", notIncludedInFund: true, contributionMonth: "2026-12", contributionTiming: "END_OF_MONTH" };
  await expect(f.save(oneOff)).rejects.toMatchObject({ code: "ASSET_ALREADY_REALIZED" });
  expect(f.rows("planVersion").length).toBe(count);
});

it("preserves the carried amount in subsequent revisions and can end future deposits without changing legacy actuals", async () => {
  const f = await fixture(), first = await f.save(), revision = structuredClone(f.revision);
  revision.commandId = randomUUID(); revision.expectedSourceRevision = 2; revision.expectedSourceHash = (first.saved.preview as any).assetSources[0].sourceHash;
  if (revision.capital.funding.status !== "STAGED") throw new Error("fixture");
  revision.capital.confirmedContributionAmount = "160"; revision.capital.funding.plannedContributions[0].amount = "100";
  const second = await f.save({ ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 3, assetCommands: [revision] });
  expect((second.saved.preview as any).assetSources.at(-1).evidence.priorRealized).toHaveLength(1);
  const end = assetSourceCommandSchema.parse({ operation: "END", commandId: randomUUID(), sourceId: revision.sourceId, expectedSourceRevision: 3,
    expectedSourceHash: (second.saved.preview as any).assetSources.at(-1).sourceHash, confirm: true, evidence, reason: "Cancel remaining deposits" });
  const p = await f.plans.previewSources(f.owner, first.planId, { ...f.baseline, versionId: second.saved.id, expectedSnapshotHash: second.saved.snapshotHash, expectedRevision: 4, assetCommands: [end] });
  expect(p.candidate!.calculation.rows[0]).toMatchObject({ openingBalance: "1060", capitalInjection: "0" });
  expect((await f.plans.version(f.owner, first.planId, second.saved.id, true)).preview).toEqual(second.saved.preview);
});

it("rejects stripped carried proof and stale legacy actuals but still replays saved v3/v4 snapshots", async () => {
  const f = await fixture(), saved = await f.save();
  const snapshot = structuredClone(f.rows("planVersion").find(r => r.id === saved.saved.id)!.inputSnapshot) as any;
  snapshot.preview.assetSources[0].evidence.priorRealized = [];
  const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrowError(expect.objectContaining({ code: "SOURCE_EVIDENCE_MISMATCH" }));
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 1, data: { ...f.data, correctionReason: "Corrected legacy receipt reference" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  for (const version of [f.legacy, saved]) expect((await f.plans.version(f.owner, saved.planId, version.saved.id, true)).preview).toEqual(version.saved.preview);
});
