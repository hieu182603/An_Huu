import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { plansFixture } from "./plans-fixtures";
import { retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { debtFixture } from "./debt-fixtures";
import { ActualsService } from "../modules/actuals/service";
import { reforecastPreviewSchema } from "../modules/actuals/schema";
import type { SourceChange } from "../modules/actuals/source-changes";
import { updateSourceRows } from "../modules/actuals/source-changes";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2027-05-01T00:00:00Z")); });
afterEach(() => vi.useRealTimers());
async function fixture() {
  const profile = retirementProfile();
  if (profile.income.status === "KNOWN") profile.income.entries[0].amount = known("1000");
  profile.debts = { status: "KNOWN", entries: [debtFixture(), debtFixture({ id: "loan-b" })] };
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("600"), availableFromMonth: known("2027-02"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
  profile.personal.pensionStartMonth = known("2027-01");
  profile.pension = { status: "KNOWN", monthlyAmount: "50", currency: "VND", priceBasis: "NOMINAL_AT_START", basisMonth: "2027-01", estimatedOn: "2026-10-04", source: "Pension notice", adjustment: { kind: "NONE" } };
  const f = await plansFixture(profile), plan = await f.create(), actuals = new ActualsService(f.db);
  const debtEvent = randomUUID(), assetEvent = randomUUID();
  const data = { currency: "VND" as const, openingBalance: "100", closingBalance: "700", correctionReason: "Reviewed statement", entries: [
    { eventId: debtEvent, date: "2026-10-28", kind: "DEBT_PAYMENT" as const, amount: "1000" },
    { eventId: assetEvent, date: "2026-10-28", kind: "CONTRIBUTION" as const, amount: "600" },
  ] };
  await actuals.write(f.owner, "2026-10", { expectedRevision: 0, data }, randomUUID());
  const review = { confirmed: true as const, document: "Confirmed source statement" };
  const changes: [Extract<SourceChange, { kind: "DEBT_SETTLED" }>, Extract<SourceChange, { kind: "ASSET_REALIZED" }>, Extract<SourceChange, { kind: "PENSION_REPLACE" }>] = [
    { ...review, id: randomUUID(), kind: "DEBT_SETTLED", sourceId: "loan-a", actual: { period: "2026-10", eventId: debtEvent }, remainingObligation: "0" },
    { ...review, id: randomUUID(), kind: "ASSET_REALIZED", sourceId: "deposit-1", actual: { period: "2026-10", eventId: assetEvent } },
    { ...review, id: randomUUID(), kind: "PENSION_REPLACE", sourceId: "pension", startMonth: "2027-01", endMonth: "2027-03", monthlyAmount: "70", priceBasis: "NOMINAL_MONTHLY" },
  ];
  const input = reforecastPreviewSchema.parse({ planId: plan.planId, versionId: plan.saved.id, throughMonth: "2026-10", expectedProfileRevision: 1, sourceChanges: changes });
  return { ...f, plan, actuals, input, changes, data };
}
it("removes only the settled loan and realized asset, replaces declared pension, and never repeats actual receipts", async () => {
  const f = await fixture(), result = await f.actuals.previewUpdate(f.owner, f.input);
  expect(result.status).toBe("READY");
  const before = result.beforeChanges!.rows, after = result.candidate!.calculation!.rows;
  expect(before[0].debtPayment).toBe("218"); expect(after[0].debtPayment).toBe("109");
  expect(after[0]).toMatchObject({ openingBalance: "700", closingBalance: "800" });
  expect(before.find(r => r.month === "2027-02")!.capitalInjection).toBe("600");
  expect(after.find(r => r.month === "2027-02")!.capitalInjection).toBe("0");
  expect(before.find(r => r.month === "2027-01")!.pension).toBe("50");
  expect(after.find(r => r.month === "2027-01")!.pension).toBe("70");
  expect(after[0].pension).toBe("0");
  const saved = await f.plans.saveReforecast(f.owner, f.plan.planId, { expectedRevision: 1, expectedInputHash: result.inputHash!, preview: f.input }, randomUUID());
  expect(saved.saved.preview.sourceChanges).toEqual(f.changes);
  expect(saved.currentVersionId).toBeNull();
  expect(await f.plans.version(f.owner, f.plan.planId, saved.saved.id, true)).toHaveProperty("replay.matched", true);
  expect(await f.plans.version(f.owner, f.plan.planId, f.plan.saved.id)).toEqual(f.plan.saved);
  expect((await f.profiles.getProfile(f.owner))!.revision).toBe(1);
});
it("requires owned existing sources, correctly typed actual references, and explicit confirmation", async () => {
  const f = await fixture();
  for (const change of [{ ...f.changes[0], sourceId: "missing" }, { ...f.changes[1], sourceId: "missing" }])
    await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [change] })).rejects.toMatchObject({ status: 422 });
  for (const actual of [{ period: "2026-10", eventId: randomUUID() }, { period: "2026-11", eventId: f.data.entries[0].eventId }, { period: "2026-10", eventId: f.data.entries[1].eventId }])
    await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [{ ...f.changes[0], actual } as SourceChange] })).rejects.toMatchObject({ code: "SOURCE_ACTUAL_REFERENCE_INVALID" });
  expect(reforecastPreviewSchema.safeParse({ ...f.input, sourceChanges: [{ ...f.changes[0], confirmed: false }] }).success).toBe(false);
  await expect(f.actuals.previewUpdate("other", f.input)).rejects.toMatchObject({ status: 404 });
});
it("rejects duplicate settlements, reused evidence and overlapping pension changes", async () => {
  const f = await fixture();
  for (const index of [0, 2]) await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [f.changes[index], { ...f.changes[index], id: randomUUID() }] })).rejects.toMatchObject({ status: 422 });
  await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [f.changes[0], { ...f.changes[0], id: randomUUID(), sourceId: "loan-b" }] })).rejects.toMatchObject({ code: "ACTUAL_EVENT_ALREADY_LINKED" });
  await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [{ ...f.changes[2], startMonth: "2026-10" } as SourceChange] })).rejects.toMatchObject({ code: "SOURCE_CHANGE_OUTSIDE_REMAINING_HORIZON" });
});
it("retains source changes across later forecasts and detects corrections to their actual evidence", async () => {
  const f = await fixture(), result = await f.actuals.previewUpdate(f.owner, f.input);
  const saved = await f.plans.saveReforecast(f.owner, f.plan.planId, { expectedRevision: 1, expectedInputHash: result.inputHash!, preview: f.input }, randomUUID());
  await f.actuals.write(f.owner, "2026-11", { expectedRevision: 0, data: { ...f.data, entries: [], openingBalance: "700", closingBalance: "700" } }, randomUUID());
  const next = { ...f.input, versionId: saved.saved.id, throughMonth: "2026-11", sourceChanges: [] };
  expect((await f.actuals.previewUpdate(f.owner, next)).candidate!.calculation!.rows[0].debtPayment).toBe("108");
  await expect(f.actuals.previewUpdate(f.owner, { ...next, sourceChanges: [{ ...f.changes[0], id: randomUUID() }] })).rejects.toMatchObject({ code: "SOURCE_ALREADY_REALIZED" });
  await f.actuals.write(f.owner, "2026-10", { expectedRevision: 1, data: { ...f.data, correctionReason: "Evidence corrected" } }, randomUUID());
  await expect(f.plans.apply(f.owner, f.plan.planId, { versionId: saved.saved.id, expectedRevision: 2, expectedProfileRevision: 1, confirm: true }, randomUUID())).rejects.toMatchObject({ code: "ACTUAL_SOURCE_CHANGED" });
  expect(await f.plans.version(f.owner, f.plan.planId, saved.saved.id, true)).toHaveProperty("replay.matched", true);
});
it("replaces one income source only, supports zero, and rejects ambiguous aggregate or retirement overrides", async () => {
  const f = await fixture();
  const flow: SourceChange = { id: randomUUID(), confirmed: true, document: "Salary amendment", kind: "FLOW_REPLACE", sourceType: "INCOME", sourceId: "salary", startMonth: "2026-11", endMonth: "2026-11", monthlyAmount: "0" };
  const result = await f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [flow] });
  expect(result.candidate!.calculation!.rows[0]).toMatchObject({ income: "0", contribution: "0", withdrawal: "218" });
  expect(result.candidate!.calculation!.rows[1].income).toBe("1000");
  await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [flow], futureChanges: [{ id: randomUUID(), field: "income", operation: "REPLACE_MONTHLY_TOTAL", amount: "200", startMonth: "2026-11", endMonth: "2026-11", reason: "Ambiguous" }] })).rejects.toMatchObject({ code: "SOURCE_CHANGE_CONFLICTS_WITH_TOTAL_OVERRIDE" });
  await expect(f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [{ ...flow, startMonth: "2027-01", endMonth: "2027-02" }] })).rejects.toMatchObject({ code: "FLOW_NOT_SELECTED_FOR_RETIREMENT" });
});
it("stops only the rent share when an income-producing property has been realized", async () => {
  const f = await fixture(), profile = retirementProfile(), candidate = (await f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [] })).candidate!;
  profile.assets = { status: "KNOWN", entries: [fixtureAsset({ id: "rental", type: "REAL_ESTATE", ownershipShare: known("0.5"), housingPlan: { status: "CONFIRMED", kind: "RENT", startMonth: "2026-10", netAmount: known("100") } })] };
  const selection = { ...candidate.selection, housing: [{ assetId: "rental", amountScope: "WHOLE_ASSET" as const }] };
  const rows = candidate.replayInput!.rows.map(r => ({ ...r, income: "50" }));
  const change: SourceChange = { ...f.changes[1], sourceId: "rental" };
  const result = updateSourceRows(rows, [change], [], profile, selection, [{ period: "2026-10", data: f.data }], []);
  expect(result.every(r => r.income === "20")).toBe(true);
  expect(result.map(r => r.capitalInjection)).toEqual(rows.map(r => r.capitalInjection));
  expect(() => updateSourceRows(rows, [change], [], profile, selection, [{ period: "2026-10", data: f.data }], [{ id: randomUUID(), field: "income", operation: "REPLACE_MONTHLY_TOTAL", amount: "500", startMonth: "2026-11", endMonth: "2026-12", reason: "Total override" }])).toThrowError(expect.objectContaining({ code: "SOURCE_CHANGE_CONFLICTS_WITH_TOTAL_OVERRIDE" }));
});
it("updates an expense source without treating debt-reference expenses as ordinary spending", async () => {
  const f = await fixture(), profile = retirementProfile(), candidate = (await f.actuals.previewUpdate(f.owner, { ...f.input, sourceChanges: [] })).candidate!;
  profile.expenses = { status: "KNOWN", entries: [{ id: "expense", label: "Expense", category: "ESSENTIAL", currency: "VND", amount: known("10"), frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] };
  const rows = candidate.replayInput!.rows.map(r => ({ ...r, livingExpense: "30", additionalExpense: "20" }));
  const selection = { ...candidate.selection, retirementAdditionalExpenseIds: ["expense"] };
  const change: SourceChange = { id: randomUUID(), confirmed: true, document: "Expense review", kind: "FLOW_REPLACE", sourceType: "EXPENSE", sourceId: "expense", startMonth: "2026-11", endMonth: "2027-03", monthlyAmount: "5" };
  const result = updateSourceRows(rows, [change], [], profile, selection, [], []);
  expect(result[0].livingExpense).toBe("25");
  expect(result.find(r => r.month === "2027-01")!.additionalExpense).toBe("15");
  profile.expenses.entries[0].category = "DEBT_PAYMENT";
  expect(() => updateSourceRows(rows, [change], [], profile, selection, [], [])).toThrowError(expect.objectContaining({ code: "FLOW_SOURCE_REVIEW_REQUIRED" }));
});
