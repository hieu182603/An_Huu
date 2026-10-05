import { describe, expect, it } from "vitest";
import { digest } from "../common/digest";
import { prepareRetirement } from "../modules/retirement/prepare";
import { profileSourceRegistry } from "../modules/retirement/source-profile";
import { importLegacySourceChanges } from "../modules/retirement/source-legacy";
import { composeSourceMonths, sealSourceRegistry, sealSourceRevision } from "../modules/retirement/sources";
import { projectSources, type SourceProjectionInput } from "../modules/retirement/engine-v4";
import { replayProjection } from "../modules/retirement/replay";
import { retirementCommand, retirementConfiguration, retirementProfile } from "./retirement-fixtures";
import { fixtureAsset, known } from "./profile-v2-fixtures";
import { debtFixture } from "./debt-fixtures";
import { declaredPension } from "./pension-fixtures";
import { plansFixture } from "./plans-fixtures";
import { upgradeSourcePreview } from "../modules/retirement/upgrade";
import { serializeSourceSnapshot, readSourceSnapshot } from "../modules/plans/source-snapshot";

function fixture(start = false) {
  const profile = retirementProfile(), selection = retirementCommand(), cfg = retirementConfiguration();
  profile.income = { status: "KNOWN", entries: [
    { id: "salary", label: "Same label", amount: known("4000.12"), kind: "FIXED", basis: "DISPOSABLE", currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null },
    { id: "rent-linked", label: "Same label", amount: known("999999"), kind: "FIXED", basis: "DISPOSABLE", currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null },
  ] };
  profile.expenses = { status: "KNOWN", entries: [{ id: "food", label: "Expense", category: "ESSENTIAL", amount: known("25.33"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-01", endMonth: null }] };
  profile.debts = { status: "KNOWN", entries: [debtFixture()] };
  profile.assets = { status: "KNOWN", entries: [
    fixtureAsset({ id: "initial", value: known("100") }),
    fixtureAsset({ id: "future", value: known("200"), availableFromMonth: known("2026-12") }),
    fixtureAsset({ id: "rent", type: "REAL_ESTATE", housingPlan: { status: "CONFIRMED", kind: "RENT", startMonth: "2026-11", netAmount: known("30.07") } }),
  ] };
  profile.pension = declaredPension(); profile.pension.monthlyAmount = "50.12"; profile.personal.pensionStartMonth = known("2027-01");
  selection.retirementIncomeIds = ["salary"]; selection.retirementAdditionalExpenseIds = ["food"];
  selection.housing = [{ assetId: "rent", amountScope: "WHOLE_ASSET", linkedIncomeId: "rent-linked" }];
  selection.debtStress = [{ loanId: "loan-a", startMonth: "2026-11", endMonth: "2026-11", totalPaymentShare: "1" }];
  selection.monthlyReserve = "7.15";
  if (start) { selection.contributionTiming = "START_OF_MONTH"; selection.startOfMonthFunding = {
    confirmed: true, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START", monthlyAvailable: "25", schedule: [] }; }
  const prepared = prepareRetirement(profile, selection, cfg.policy, cfg.assumptions);
  expect(prepared.status).toBe("READY");
  const registry = profileSourceRegistry(profile, selection, prepared.replayInput!.rows, digest(profile));
  const replay: SourceProjectionInput = { ...prepared.replayInput!, modelVersion: "retirement-monthly-v4", sourceRegistry: registry,
    sourceBudget: { originalRetirementMonth: prepared.replayInput!.retirementMonth, startFunding: selection.startOfMonthFunding ? {
      monthlyAvailable: selection.startOfMonthFunding.monthlyAvailable, schedule: selection.startOfMonthFunding.schedule } : null } };
  return { profile, selection, prepared, registry, replay };
}

describe("source registry and format/model replay", () => {
  it("serializes a new candidate without writing its parent/profile and replays independent of later inputs", async () => {
    const f = await plansFixture(), saved = await f.create();
    const source = await f.plans.readVersion(f.db, f.owner, saved.planId, saved.saved.id);
    const before = JSON.stringify({ profiles: f.rows("financialProfile"), versions: f.rows("planVersion") });
    const candidate = upgradeSourcePreview(source.capture, source.version.preview, source.version.snapshotHash, "2026-10-05");
    const snapshot = serializeSourceSnapshot(source.capture, candidate);
    expect(candidate.calculation.rows).toEqual(saved.saved.preview.calculation!.rows);
    expect(JSON.stringify({ profiles: f.rows("financialProfile"), versions: f.rows("planVersion") })).toBe(before);
    const persisted = JSON.parse(JSON.stringify(snapshot));
    source.capture.profile.valuationDate = "2027-01-01";
    expect(readSourceSnapshot(persisted)).toEqual(persisted);
    // JSONB can reorder every key; the digest and replay remain stable.
    const reorder = (v: any): any => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
    expect(readSourceSnapshot(reorder(persisted)).integrityHash).toBe(snapshot.integrityHash);
    persisted.preview.calculation.attribution[0].amount = "9";
    const { integrityHash: _, ...payload } = persisted; persisted.integrityHash = digest(payload);
    expect(() => readSourceSnapshot(persisted)).toThrowError(expect.objectContaining({ code: "SNAPSHOT_REPLAY_MISMATCH" }));
  });
  it.each([false, true])("reconciles all source categories and no-op v4 exactly (start=%s)", start => {
    const f = fixture(start), output = projectSources(f.replay);
    expect(output.rows).toEqual(f.prepared.calculation!.rows);
    expect(output.summary).toEqual(f.prepared.calculation!.summary);
    expect(f.registry.revisions.map(r => r.sourceId)).not.toContain("profile:income:rent-linked");
    expect(f.registry.revisions.map(r => r.sourceId)).not.toContain("profile:asset:initial");
    expect(output.attribution.filter(a => a.metric === "capitalInjection")).toEqual([expect.objectContaining({ sourceId: "profile:asset:future", month: "2026-12", amount: "120" })]);
    expect(replayProjection("retirement-plan-snapshot-v2", "retirement-monthly-v4", f.replay)).toEqual(output);
    expect(replayProjection("retirement-plan-snapshot-v1", "retirement-monthly-v3", f.prepared.replayInput!)).toMatchObject({ rows: output.rows, summary: output.summary });
  });
  it("rejects cross-format fallback and independent tampering of money/budget/hash", () => {
    const f = fixture();
    expect(() => replayProjection("retirement-plan-snapshot-v1", "retirement-monthly-v4", f.replay)).toThrow();
    expect(() => replayProjection("retirement-plan-snapshot-v2", "retirement-monthly-v3", f.prepared.replayInput!)).toThrow();
    const money = structuredClone(f.replay); money.rows[0].income = "1";
    expect(() => projectSources(money)).toThrowError(expect.objectContaining({ code: "SOURCE_TOTALS_MISMATCH" }));
    const budget = structuredClone(f.replay); budget.rows[0].contribution = "1";
    expect(() => projectSources(budget)).toThrowError(expect.objectContaining({ code: "SOURCE_BUDGET_MISMATCH" }));
    const hash = structuredClone(f.replay); hash.sourceRegistry.revisions[0].schedule[0].amount = "1";
    expect(() => projectSources(hash)).toThrowError(expect.objectContaining({ code: "SOURCE_REGISTRY_HASH_MISMATCH" }));
  });
  it("honors replacement and END boundaries without resurrecting the previous revision", () => {
    const f = fixture(), initial = f.registry.revisions.find(r => r.sourceId === "profile:income:salary")!;
    const { sourceHash: _, ...draft } = initial;
    const revised = sealSourceRevision({ ...draft, revision: 2, previousHash: initial.sourceHash, commandId: "rev-2", operation: "REVISE",
      effectiveFromMonth: "2026-11", effectiveToMonth: "2026-11", schedule: [{ month: "2026-11", metric: "income", amount: "10" }] });
    const registry = sealSourceRegistry({ ...f.registry, revisions: [...f.registry.revisions, revised] });
    const rows = composeSourceMonths(registry).rows;
    expect(rows[0].income).toBe("4000.12"); expect(rows[1].income).toBe("28.042"); expect(rows[2].income).toBe("18.042");
    const ended = sealSourceRevision({ ...draft, revision: 3, previousHash: revised.sourceHash, commandId: "end", operation: "END",
      effectiveFromMonth: "2026-12", schedule: [] });
    expect(composeSourceMonths(sealSourceRegistry({ ...f.registry, revisions: [...f.registry.revisions, revised, ended] })).rows).toEqual(rows);
  });
  it("rejects duplicate identities, broken chains, metric substitution and unknown fields", () => {
    const f = fixture(), source = f.registry.revisions[0], { sourceHash: _, ...draft } = source;
    expect(() => sealSourceRegistry({ ...f.registry, revisions: [...f.registry.revisions, source] })).toThrow();
    const invalid = sealSourceRevision({ ...draft, schedule: [{ month: "2026-10", metric: "capitalInjection", amount: "1" }] });
    expect(() => sealSourceRegistry({ ...f.registry, revisions: [invalid] })).toThrowError(expect.objectContaining({ code: "SOURCE_METRIC_MISMATCH" }));
    expect(() => sealSourceRevision({ ...draft, userId: "someone" } as any)).toThrow();
  });
  it("pins legacy overrides with attribution and rejects reconciliation drift", () => {
    const f = fixture(), remaining = f.prepared.replayInput!.rows.filter(r => r.month >= "2026-11").map(r => ({ ...r }));
    const flow = { id: "10000000-0000-4000-8000-000000000001", kind: "FLOW_REPLACE" as const, sourceType: "INCOME" as const,
      sourceId: "salary", startMonth: "2026-11", endMonth: "2026-11", monthlyAmount: "10", confirmed: true as const, document: "Reviewed" };
    remaining[0].income = "28.042";
    const total = { id: "10000000-0000-4000-8000-000000000002", field: "income" as const, operation: "REPLACE_MONTHLY_TOTAL" as const,
      startMonth: "2026-12", endMonth: "2026-12", amount: "999", reason: "Pinned prior version" };
    remaining[1].income = "999";
    const migrated = importLegacySourceChanges(f.registry, remaining, "2027-01", [flow], [total], digest("legacy"), "2026-11-01");
    const result = composeSourceMonths(migrated);
    expect(result.rows.map(r => r.income)).toEqual(remaining.map(r => r.income));
    expect(result.attribution.filter(a => a.month === "2026-12" && a.metric === "income")).toEqual([expect.objectContaining({ sourceId: `legacy:aggregate:${total.id}`, amount: "999" })]);
    remaining[0].income = "29";
    expect(() => importLegacySourceChanges(f.registry, remaining, "2027-01", [flow], [total], digest("legacy"), "2026-11-01")).toThrowError(expect.objectContaining({ code: "SOURCE_TOTALS_MISMATCH" }));
  });
});
