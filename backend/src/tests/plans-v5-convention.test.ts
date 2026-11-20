import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { plansFixture } from "./plans-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { reforecastPreviewSchema, type ActualPayload } from "../modules/actuals/schema";
import { previewInputHash } from "../modules/retirement/service";
import { upgradeSourcePreview } from "../modules/retirement/upgrade";
import { RETIREMENT_MODEL_V3, RETIREMENT_MODEL_V5 } from "../modules/retirement/schema";
import { derivedReserveMonths } from "../modules/capital/separation";

// The current model is switchable so one file can save under v3 and then under v5.
const state = vi.hoisted(() => ({ model: "retirement-monthly-v3" }));
vi.mock("../modules/retirement/schema", async importOriginal => {
  const actual = await importOriginal<typeof import("../modules/retirement/schema")>();
  return Object.defineProperties({ ...actual }, { RETIREMENT_MODEL: { get: () => state.model, enumerable: true } });
});

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2027-05-01T00:00:00Z")); state.model = RETIREMENT_MODEL_V3; });
afterEach(() => vi.useRealTimers());
const data = (): ActualPayload => ({ currency: "VND", openingBalance: "1000", closingBalance: "1000", entries: [], correctionReason: "Reviewed statement" });
const oldHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const releases = (f: Awaited<ReturnType<typeof plansFixture>>) => f.rows("financialModelVersion") as Array<{ code: string; source: { withdrawalTiming: string; numericalKernel?: string } }>;

describe("B1 plans: v3 frozen, v5 start-of-month", () => {
  it("keeps a saved v3 plan byte-identical on replay and reforecasts it on v3 after the current model becomes v5", async () => {
    const f = await plansFixture(), plan = await f.create(), actuals = new ActualsService(f.db);
    expect(plan.saved.preview.modelVersion).toBe(RETIREMENT_MODEL_V3);
    expect(releases(f).map(r => [r.code, r.source.withdrawalTiming])).toEqual([[RETIREMENT_MODEL_V3, "END_OF_MONTH"]]);
    await f.plans.apply(f.owner, plan.planId, { versionId: plan.saved.id, expectedRevision: 1, expectedProfileRevision: 1, confirm: true }, randomUUID());
    await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data: data() }, randomUUID());
    expect(await f.plans.get(f.owner, plan.planId)).not.toHaveProperty("calculationNotice");

    state.model = RETIREMENT_MODEL_V5; // the flip
    const stored = JSON.stringify(f.rows("planVersion"));
    const replay = await f.plans.version(f.owner, plan.planId, plan.saved.id, true);
    expect("replay" in replay && replay.replay.matched).toBe(true);
    expect(JSON.stringify(f.rows("planVersion"))).toBe(stored);
    expect(replay.preview.calculation!.conventions.withdrawalTiming).toBe("END_OF_MONTH");
    const notice = { code: "CALCULATION_CONVENTION_UPDATED", suggestedAction: "PREVIEW_AGAIN", withdrawalTiming: "END_OF_MONTH" };
    expect(await f.plans.get(f.owner, plan.planId)).toMatchObject({ calculationNotice: notice });
    expect(await f.plans.version(f.owner, plan.planId, plan.saved.id)).toMatchObject({ calculationNotice: notice });
    expect(await f.plans.report(f.owner, plan.planId, {})).toMatchObject({ calculationNotice: notice });

    const input = reforecastPreviewSchema.parse({ planId: plan.planId, versionId: plan.saved.id, throughMonth: "2026-10", expectedProfileRevision: 1 });
    const preview = await actuals.previewUpdate(f.owner, input);
    expect(preview.candidate!.modelVersion).toBe(RETIREMENT_MODEL_V3);
    expect(preview.candidate!.replayInput!.modelVersion).toBe(RETIREMENT_MODEL_V3);
    expect(preview.candidate!.calculation!.conventions.withdrawalTiming).toBe("END_OF_MONTH");
    const saved = await f.plans.saveReforecast(f.owner, plan.planId, { expectedRevision: 2, expectedInputHash: preview.inputHash!, preview: input }, randomUUID());
    expect(saved.saved.preview.modelVersion).toBe(RETIREMENT_MODEL_V3);
    expect(releases(f).map(r => r.code)).toEqual([RETIREMENT_MODEL_V3]);
    expect(await f.plans.version(f.owner, plan.planId, saved.saved.id, true)).toHaveProperty("replay.matched", true);
  });

  it("records START_OF_MONTH for a v5 save and replays it; v5 CSV appends its extra columns last", async () => {
    state.model = RETIREMENT_MODEL_V5;
    const f = await plansFixture(), plan = await f.create();
    expect(plan.saved.preview.modelVersion).toBe(RETIREMENT_MODEL_V5);
    expect(releases(f)).toMatchObject([{ code: RETIREMENT_MODEL_V5, source: { withdrawalTiming: "START_OF_MONTH" } }]);
    expect(await f.plans.version(f.owner, plan.planId, plan.saved.id, true)).toHaveProperty("replay.matched", true);
    expect(await f.plans.get(f.owner, plan.planId)).not.toHaveProperty("calculationNotice");
    const header = (await f.plans.exportCsv(f.owner, plan.planId, plan.saved.id)).content.split("\r\n")[0];
    expect(header.endsWith('"fundedAvailableAtStart","tradingCost","cumulativeUnfunded"')).toBe(true);
    expect(header).toContain('"netWithdrawal","fundedAvailableAtStart"');
  });

  it("keeps the v3 input hash unchanged, makes the v5 hash differ, and refuses to save a v3 preview as v5", async () => {
    const f = await plansFixture(), preview = f.command.preview;
    const capture = await f.retirement.capture(f.db as never, f.owner, preview);
    const legacy = oldHash({ profile: capture.profile, input: preview, policyHash: capture.policy.documentHash, assumptionHash: capture.assumptions.documentHash,
      ...((preview.allocationFunding || preview.customAllocation) && capture.profile.reserveMonths === undefined ? { capitalReserveDefaultMonths: derivedReserveMonths(capture.profile, capture.assumptions.data).months } : {}) });
    expect(f.command.expectedInputHash).toBe(legacy);
    expect(previewInputHash(capture, preview, RETIREMENT_MODEL_V3)).toBe(legacy);
    expect(previewInputHash(capture, preview, RETIREMENT_MODEL_V5)).not.toBe(legacy);

    state.model = RETIREMENT_MODEL_V5;
    expect((await f.retirement.preview(f.owner, preview)).inputHash).not.toBe(legacy);
    await expect(f.plans.createVersion(f.owner, null, f.command, randomUUID())).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
  });

  it("flags comparisons across conventions and leaves same-convention comparisons untouched", async () => {
    const f = await plansFixture(), v3 = await f.create();
    state.model = RETIREMENT_MODEL_V5;
    const preview = await f.retirement.preview(f.owner, f.command.preview);
    const v5 = await f.plans.createVersion(f.owner, v3.planId, { preview: f.command.preview, expectedInputHash: preview.inputHash, expectedRevision: 1 }, randomUUID());
    const mixed = await f.plans.compare(f.owner, v3.planId, { baselineVersionId: v3.saved.id, candidateVersionId: v5.saved.id });
    expect(mixed.comparison).toMatchObject({ conventionsDiffer: true, conventions: { baseline: "END_OF_MONTH", candidate: "START_OF_MONTH" },
      conventionNote: "Hai phiên bản dùng quy ước tính khác nhau (rút đầu tháng / cuối tháng). Chênh lệch có thể đến từ quy ước, không chỉ từ dữ liệu." });
    expect(mixed.comparison.limitations).toContain("CALCULATION_CONVENTIONS_DIFFER");
    expect(mixed.comparison.status).toBe("COMPARABLE");
    const same = await f.plans.compare(f.owner, v3.planId, { baselineVersionId: v5.saved.id, candidateVersionId: v5.saved.id });
    expect(same.comparison).not.toHaveProperty("conventionsDiffer");
    expect(same.comparison).not.toHaveProperty("conventionNote");
  });

  it("upgrades a v5 preview to a v4 source with a v5 kernel and a v3 one without a kernelModel", async () => {
    const f3 = await plansFixture(), v3 = await f3.create();
    const source3 = await f3.plans.readVersion(f3.db, f3.owner, v3.planId, v3.saved.id);
    const up3 = upgradeSourcePreview(source3.capture, source3.version.preview, source3.version.snapshotHash, "2026-10-05");
    expect(up3.replayInput).not.toHaveProperty("kernelModel");
    expect(up3.calculation.conventions.withdrawalTiming).toBe("END_OF_MONTH");

    state.model = RETIREMENT_MODEL_V5;
    const f5 = await plansFixture(), v5 = await f5.create();
    const source5 = await f5.plans.readVersion(f5.db, f5.owner, v5.planId, v5.saved.id);
    const up5 = upgradeSourcePreview(source5.capture, source5.version.preview, source5.version.snapshotHash, "2026-10-05");
    expect(up5.replayInput.kernelModel).toBe(RETIREMENT_MODEL_V5);
    expect(up5.calculation.conventions.withdrawalTiming).toBe("START_OF_MONTH");
  });
});
