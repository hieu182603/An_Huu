import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { plansFixture } from "./plans-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { reforecastPreviewSchema } from "../modules/actuals/schema";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import { assetSourceCommandSchema } from "../modules/capital/source-candidate";
import { readSourceSnapshot } from "../modules/plans/source-snapshot";
import { digest } from "../common/digest";
import { AuthService } from "../modules/auth/service";
import { config, token } from "./helpers";
import { createApp } from "../app";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z")); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.useRealTimers());
const evidence = [{ reference: "Rental termination and net sale statement", contentHash: digest("rental sale fixture"), confirmedOn: "2026-12-01" }];

async function fixture() {
  const profile = retirementProfile();
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ id: "rental", type: "REAL_ESTATE", value: known("1000"), ownershipShare: known("0.5"),
    retirementShare: known("0.5"), emergencyShare: known("0.3"), otherGoalsShare: known("0.2"),
    housingPlan: { status: "CONFIRMED", kind: "RENT", startMonth: "2026-10", netAmount: known("80") } })] };
  if (profile.income.status !== "KNOWN") throw new Error("fixture");
  profile.income.entries.push({ ...profile.income.entries[0], id: "rental-income", label: "Same rental income", source: "OTHER", amount: known("80"), endMonth: null });
  const f = await plansFixture(profile), actuals = new ActualsService(f.db);
  const input = { ...f.command.preview, housing: [{ assetId: "rental", amountScope: "WHOLE_ASSET" as const, linkedIncomeId: "rental-income" }] };
  const p = await f.retirement.preview(f.owner, input);
  expect(p.status).toBe("READY");
  const original = await f.plans.createVersion(f.owner, null, { expectedRevision: 0, expectedInputHash: p.inputHash!, preview: input }, randomUUID());
  await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1000", closingBalance: "1000", entries: [], correctionReason: "Closed month" } }, randomUUID());
  const baseline = sourceReforecastSchema.parse({ versionId: original.saved.id, expectedSnapshotHash: original.saved.snapshotHash, expectedRevision: 1,
    expectedProfileRevision: 1, throughMonth: "2026-10", sourceCommands: [] });
  const ready = await f.plans.previewSources(f.owner, original.planId, baseline);
  const option = ready.assetRevisionOptions.find(s => s.sourceId === "profile:asset:rental")!;
  expect(option).toBeDefined();
  const sale = assetSourceCommandSchema.parse({ operation: "REVISE", commandId: randomUUID(), sourceId: option.sourceId, expectedSourceRevision: option.sourceRevision,
    expectedSourceHash: option.sourceHash, confirm: true, evidence,
    rentalExit: { rentEndsOn: "2026-12-15", finalMonthIncome: "7", amountScope: "SOURCE_SHARE", confirm: true },
    capital: { reference: "rental", kind: "ASSET_SALE", currency: "VND", priceBasis: "NOMINAL_AT_AVAILABILITY", amountScope: "WHOLE_ASSET",
      ownershipShare: "0.5", retirementShare: "0.5", grossAmount: "1000", fees: "50", taxes: "50", securedDebtSettlement: "100", netAmount: "800",
      availableOn: "2026-12-20", confirmedContributionAmount: "150",
      funding: { status: "PLANNED", liquidity: "PLANNED_RELEASE", notIncludedInFund: true, contributionMonth: "2027-01", contributionTiming: "END_OF_MONTH" } } });
  if (sale.operation !== "REVISE") throw new Error("fixture");
  const command = { ...baseline, assetCommands: [sale] };
  const save = async (value = command) => {
    const preview = await f.plans.previewSources(f.owner, original.planId, value);
    return f.plans.saveSources(f.owner, original.planId, { preview: value, expectedInputHash: preview.inputHash!, confirm: true }, randomUUID());
  };
  return { ...f, actuals, original, baseline, sale, command, save };
}

it("replaces rental income with explicit net sale contribution atomically, preserving profile, old replay and attribution", async () => {
  const f = await fixture(), before = JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")]), saved = await f.save();
  const p = saved.saved.preview;
  expect(p.calculation!.rows.map(r => r.income)).toEqual(["120", "107", "0", "0", "0"]);
  expect(p.calculation!.rows.map(r => r.capitalInjection)).toEqual(["0", "0", "150", "0", "0"]);
  expect((p as any).calculation.attribution.filter((a: any) => a.sourceId === "profile:income:rental-income")).toEqual([]);
  expect(p.calculation!.rows[0].openingBalance).toBe("1000");
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(p);
  expect((await f.plans.version(f.owner, saved.planId, f.original.saved.id, true)).preview).toEqual(f.original.saved.preview);
  await f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID());
  expect(JSON.stringify([f.rows("financialProfile"), f.rows("actualMonth")])).toBe(before);
  expect((await f.plans.exportCsv(f.owner, saved.planId, saved.saved.id)).content).toContain("profile:asset:rental");
});

it("requires termination details, correct identity, availability and evidence without partial versions", async () => {
  const f = await fixture(), count = f.rows("planVersion").length;
  for (const [change, code] of [
    [(s: typeof f.sale) => { delete s.rentalExit; }, "ASSET_RENTAL_REVIEW_REQUIRED"],
    [(s: typeof f.sale) => { s.capital.kind = "LIQUID_CAPITAL"; }, "ASSET_RENTAL_EXIT_MISMATCH"],
    [(s: typeof f.sale) => { s.capital.availableOn = "2026-12-14"; }, "ASSET_RENTAL_EXIT_MISMATCH"],
    [(s: typeof f.sale) => { s.rentalExit!.rentEndsOn = "2026-09-30"; }, "ASSET_RENTAL_EXIT_MISMATCH"],
    [(s: typeof f.sale) => { s.rentalExit!.rentEndsOn = "2026-11-30"; s.evidence = [{ ...evidence[0], confirmedOn: "2026-10-01" }]; }, "ASSET_RENTAL_EXIT_MISMATCH"],
    [(s: typeof f.sale) => { s.capital.reference = "different asset"; }, "ASSET_IDENTITY_CHANGED"],
  ] as const) {
    const command = structuredClone(f.command); change(command.assetCommands[0]);
    await expect(f.save(command)).rejects.toMatchObject({ code });
  }
  expect(f.rows("planVersion").length).toBe(count);
});

it("supports zero final rent, sale and contribution in the termination month, or ending rental without a sale", async () => {
  const f = await fixture(); f.sale.rentalExit!.finalMonthIncome = "0";
  f.sale.capital.availableOn = "2026-12-15";
  if (f.sale.capital.funding.status !== "PLANNED") throw new Error("fixture");
  f.sale.capital.funding.contributionMonth = "2026-12";
  const p = await f.plans.previewSources(f.owner, f.original.planId, f.command);
  expect(p.candidate!.calculation.rows.map(r => [r.income, r.capitalInjection])).toEqual([["120", "0"], ["100", "150"], ["0", "0"], ["0", "0"], ["0", "0"]]);
  const end = assetSourceCommandSchema.parse({ operation: "END", commandId: randomUUID(), sourceId: f.sale.sourceId, expectedSourceRevision: 1,
    expectedSourceHash: f.sale.expectedSourceHash, confirm: true, evidence, reason: "Rental cancelled; no sale or contribution" });
  const cancelled = await f.plans.previewSources(f.owner, f.original.planId, { ...f.baseline, assetCommands: [end] });
  expect(cancelled.candidate!.calculation.rows.map(r => r.income)).toEqual(["100", "100", "0", "0", "0"]);
  expect(cancelled.candidate!.calculation.rows.every(r => r.capitalInjection === "0")).toBe(true);
  const saved = await f.plans.saveSources(f.owner, f.original.planId, { preview: { ...f.baseline, assetCommands: [end] }, expectedInputHash: cancelled.inputHash!, confirm: true }, randomUUID());
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("rejects rental lifecycle changes hidden by a legacy aggregate income override", async () => {
  const f = await fixture();
  const input = reforecastPreviewSchema.parse({ planId: f.original.planId, versionId: f.original.saved.id, throughMonth: "2026-10", expectedProfileRevision: 1,
    futureChanges: [{ id: randomUUID(), field: "income", operation: "REPLACE_MONTHLY_TOTAL", amount: "500", startMonth: "2026-11", endMonth: "2027-03", reason: "Aggregate income scenario" }] });
  const preview = await f.actuals.previewUpdate(f.owner, input);
  const saved = await f.plans.saveReforecast(f.owner, f.original.planId, { expectedRevision: 1, expectedInputHash: preview.inputHash!, preview: input }, randomUUID());
  const baseline = { ...f.baseline, versionId: saved.saved.id, expectedSnapshotHash: saved.saved.snapshotHash, expectedRevision: 2 };
  const sourcePreview = await f.plans.previewSources(f.owner, saved.planId, baseline);
  const option = sourcePreview.assetRevisionOptions.find(s => s.sourceId === f.sale.sourceId)!;
  f.sale.expectedSourceHash = option.sourceHash; f.sale.expectedSourceRevision = option.sourceRevision;
  await expect(f.plans.previewSources(f.owner, saved.planId, { ...baseline, assetCommands: [f.sale] })).rejects.toMatchObject({ code: "SOURCE_AGGREGATE_OVERLAP" });
});

it("allows an explicit future rental extension, but never silently restores rent when sale funding is delayed", async () => {
  const f = await fixture(), first = await f.save();
  const revised = structuredClone(f.sale); revised.commandId = randomUUID(); revised.expectedSourceRevision = 2;
  revised.expectedSourceHash = (first.saved.preview as any).assetSources.at(-1).sourceHash;
  revised.capital.availableOn = "2027-02-15";
  if (revised.capital.funding.status !== "PLANNED") throw new Error("fixture");
  revised.capital.funding.contributionMonth = "2027-02";
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, assetCommands: [revised] };
  const noExtension = await f.plans.previewSources(f.owner, first.planId, command);
  expect(noExtension.candidate!.calculation.rows.map(r => r.income)).toEqual(["120", "107", "0", "0", "0"]);
  revised.rentalExit = { ...revised.rentalExit!, rentEndsOn: "2027-01-15", finalMonthIncome: "8" };
  const second = await f.save(command);
  expect(second.saved.preview.calculation!.rows.map(r => r.income)).toEqual(["120", "120", "8", "0", "0"]);
  expect((await f.plans.version(f.owner, first.planId, second.saved.id, true)).preview).toEqual(second.saved.preview);
});

it("keeps future rental income hypothetical even when a staged sale confirms zero deposits", async () => {
  const f = await fixture();
  f.sale.capital.confirmedContributionAmount = "0";
  f.sale.capital.funding = { status: "STAGED", liquidity: "PLANNED_RELEASE", plannedNotIncludedInFund: true, allocations: [], plannedContributions: [], reconciliations: [] };
  const saved = await f.save();
  expect(saved.saved.preview.calculation!.rows.map(r => r.income)).toEqual(["120", "107", "0", "0", "0"]);
  const source = (saved.saved.preview as any).replayInput.sourceRegistry.revisions.at(-1);
  expect(source.confirmation).toBe("HYPOTHETICAL");
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("pins realized sale receipts, freezes past termination and rejects stale actuals while old replay remains available", async () => {
  const f = await fixture();
  f.sale.rentalExit = { ...f.sale.rentalExit!, rentEndsOn: "2026-11-15", finalMonthIncome: "7" };
  f.sale.capital.availableOn = "2026-11-20";
  if (f.sale.capital.funding.status !== "PLANNED") throw new Error("fixture");
  f.sale.capital.funding.contributionMonth = "2026-12";
  const first = await f.save();
  const eventId = randomUUID(), actual = { currency: "VND" as const, openingBalance: "1000", closingBalance: "1150", correctionReason: "Sale contribution received",
    entries: [{ eventId, date: "2026-11-30", kind: "CONTRIBUTION" as const, amount: "150" }] };
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: actual }, randomUUID());
  const revised = structuredClone(f.sale); revised.commandId = randomUUID(); revised.expectedSourceRevision = 2;
  revised.expectedSourceHash = (first.saved.preview as any).assetSources.at(-1).sourceHash;
  revised.capital.funding = { status: "REALIZED", allocations: [{ allocationId: randomUUID(), eventId, actualRevision: 1, bookedOn: "2026-11-30", amount: "150" }] };
  const command = { ...f.command, versionId: first.saved.id, expectedSnapshotHash: first.saved.snapshotHash, expectedRevision: 2, throughMonth: "2026-11", assetCommands: [revised] };
  const wrong = structuredClone(command); wrong.assetCommands[0].rentalExit!.finalMonthIncome = "8";
  await expect(f.save(wrong)).rejects.toMatchObject({ code: "ASSET_RENTAL_HISTORY_IMMUTABLE" });
  const saved = await f.save(command);
  expect(saved.saved.preview.calculation!.rows[0]).toMatchObject({ openingBalance: "1150", income: "100", capitalInjection: "0" });
  expect(saved.saved.preview.calculation!.rows.every(r => r.capitalInjection === "0")).toBe(true);
  const snapshot = structuredClone(f.rows("planVersion").find(r => r.id === saved.saved.id)!.inputSnapshot) as any;
  delete snapshot.preview.assetSources.at(-1).evidence.command.rentalExit;
  const { integrityHash: _, ...payload } = snapshot; snapshot.integrityHash = digest(payload);
  expect(() => readSourceSnapshot(snapshot)).toThrow();
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 1, data: { ...actual, correctionReason: "Corrected reference" } }, randomUUID());
  await expect(f.plans.apply(f.owner, saved.planId, { versionId: saved.saved.id, expectedRevision: 3, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect((await f.plans.version(f.owner, saved.planId, saved.saved.id, true)).preview).toEqual(saved.saved.preview);
});

it("validates rental conversion request/response through production HTTP and OpenAPI", async () => {
  const f = await fixture(), auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockResolvedValue({ id: f.owner, role: "USER" } as never);
  const app = createApp({ config, services: { auth, profiles: f.profiles, plans: f.plans, actuals: f.actuals } });
  const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
  const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
  const validate = ajv.compile(spec.paths["/api/v1/me/retirement/plans/{planId}/source-reforecasts/preview"].post.requestBody.content["application/json"].schema);
  expect(validate(f.command), JSON.stringify(validate.errors)).toBe(true);
  const root = "/api/v1/me/retirement/plans/" + f.original.planId;
  const preview = await request(app).post(root + "/source-reforecasts/preview").set("Authorization", "Bearer " + token()).send(f.command);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  expect(ajv.compile(spec.components.schemas.PlanSourcePreviewEnvelope)(preview.body)).toBe(true);
  const saved = await request(app).post(root + "/source-reforecasts").set("Authorization", "Bearer " + token()).set("Idempotency-Key", randomUUID())
    .send({ preview: f.command, expectedInputHash: preview.body.data.inputHash, confirm: true });
  expect(saved.status, JSON.stringify(saved.body)).toBe(201);
  expect(ajv.compile(spec.paths["/api/v1/me/retirement/plans/{planId}/source-reforecasts"].post.responses["201"].content["application/json"].schema)(saved.body)).toBe(true);
});
