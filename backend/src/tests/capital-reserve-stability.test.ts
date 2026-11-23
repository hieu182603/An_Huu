import { describe, expect, it, vi } from "vitest";
import { previewInputHash } from "../modules/retirement/service";
import { createHash } from "node:crypto";
import { derivedReserveMonths, separateCapital } from "../modules/capital/separation";
import { profileV2Schema, type ProfileV2 } from "../modules/profiles/schema-v2";
import { fixtureProfile, fixtureAsset, known, unknown, empty } from "./profile-v2-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { assumptionDocumentSchema, emergencyReserveMonthsSchema } from "../modules/assumptions/schema";
import { retirementCommand } from "./retirement-fixtures";
import { customFixture } from "./allocation-custom-fixtures";

function assumptions() {
  const a = assumptionFixture();
  a.projectionEndYear = 2032;
  a.assetClasses = [{ code: "CASH", label: "Tiền gửi", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] }];
  a.inflation = Array.from({ length: 7 }, (_, i) => ({ ...a.inflation[0], year: 2026 + i, percent: "4" }));
  a.returns = a.inflation.map(r => ({ ...a.returns[0], year: r.year, assetClass: "CASH", rate: { type: "EFFECTIVE_ANNUAL", percent: "4.5" } }));
  return a;
}
function profile(over: Partial<ProfileV2> = {}): ProfileV2 {
  const p = fixtureProfile({ debts: empty(), goals: empty(),
    assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("2000000000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] }, ...over });
  delete p.reserveMonths;
  if (over.reserveMonths !== undefined) p.reserveMonths = over.reserveMonths;
  if (p.expenses.status === "KNOWN") p.expenses.entries[0].amount = known("25000000");
  return p;
}

describe("emergency reserve months follow declared income stability (spec 3.2)", () => {
  it.each([["STABLE", 6], ["VARIABLE", 9], ["UNCERTAIN", 12]] as const)("%s income defaults to %i months when the customer set none", (stability, months) => {
    const p = profile({ incomeStability: known(stability) });
    const result = separateCapital(p, assumptions());
    expect(result).toMatchObject({ reserveMonths: months, reserveMonthsBasis: "INCOME_STABILITY", requiredEmergencyReserve: String(months * 25000000) });
    expect(derivedReserveMonths(p)).toEqual({ months, basis: "INCOME_STABILITY", source: "CODE_DEFAULT_PENDING_CONFIRMATION" });
  });
  it.each([["UNKNOWN", { status: "UNKNOWN" as const }], ["absent", undefined]])("%s stability falls back to six months", (_, stability) => {
    const p = profile(); if (stability) p.incomeStability = stability; else delete p.incomeStability;
    expect(separateCapital(p, assumptions())).toMatchObject({ reserveMonths: 6, reserveMonthsBasis: "DEFAULT", requiredEmergencyReserve: "150000000" });
  });
  it.each(["STABLE", "VARIABLE", "UNCERTAIN"] as const)("an explicit customer value always wins over %s stability", stability => {
    const result = separateCapital(profile({ incomeStability: known(stability), reserveMonths: 7 }), assumptions());
    expect(result).toMatchObject({ reserveMonths: 7, reserveMonthsBasis: "CUSTOMER", requiredEmergencyReserve: String(7 * 25000000) });
  });
  it("customer value equal to the derived default is still reported as CUSTOMER", () => {
    expect(separateCapital(profile({ incomeStability: known("VARIABLE"), reserveMonths: 9 }), assumptions()).reserveMonthsBasis).toBe("CUSTOMER");
  });
  it("keeps the old hash for the six-month case and changes it when the derived default changes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const results: Record<string, { inputHash: string; months: number | null | undefined; expectedMarker: number }> = {};
    for (const [name, stability, marker] of [["stable", known("STABLE" as const), 6], ["unknown", unknown, 6], ["variable", known("VARIABLE" as const), 9]] as const) {
      const f = await customFixture();
      await f.profiles.patchProfile("test-user", f.command.expectedProfileRevision, { schemaVersion: 2, incomeStability: stability });
      const input = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: f.command.expectedProfileRevision + 1, allocationFunding: "PROTECTED_CAPITAL_V1" as const };
      const preview = await f.services.retirement.preview("test-user", input, { adjustments: false });
      const snapshot = await f.services.retirement.capture(f.db, "test-user", preview.selection);
      const base = { profile: snapshot.profile, input: preview.selection, policyHash: snapshot.policy.documentHash, assumptionHash: snapshot.assumptions.documentHash };
      // B1: v5 previews also hash their model version; v3 hashes keep the exact legacy object.
      const model = preview.modelVersion === "retirement-monthly-v3" ? {} : { modelVersion: preview.modelVersion };
      const rate = preview.modelVersion === "retirement-monthly-v5" ? {retirementPlanningAnnualPercent: snapshot.assumptions.data.retirementPlanningAnnualPercent ?? "3.5"} : {};
      expect(preview.inputHash).toBe(hashOf({ ...base, ...rate, capitalReserveDefaultMonths: marker, ...model }));
      results[name] = { inputHash: preview.inputHash, months: preview.capitalSeparation?.reserveMonths, expectedMarker: marker };
      expect(preview.capitalSeparation?.reserveMonths).toBe(marker);
      if (marker === 6) expect(previewInputHash(snapshot, preview.selection, "retirement-monthly-v3")).toBe(hashOf({ ...base, capitalReserveDefaultMonths: 6 })); // exact legacy v3 object shape
    }
    expect(results.variable.inputHash).not.toBe(results.stable.inputHash);
  });
});

describe("emergency reserve months as an admin-approved assumptions block", () => {
  const block = (over: Record<string, unknown> = {}) => ({ evidence: "Nghiệp vụ xác nhận 7/10/12 tháng theo mức biến động thu nhập.",
    byIncomeStability: { STABLE: 7, VARIABLE: 10, UNCERTAIN: 12 }, default: 8, ...over });
  const approvedAssumptions = () => ({ ...assumptions(), emergencyReserveMonths: block() });
  it.each([["STABLE", 7], ["VARIABLE", 10], ["UNCERTAIN", 12]] as const)("approved block wins for %s income and is reported as APPROVED_DOCUMENT", (stability, months) => {
    const result = separateCapital(profile({ incomeStability: known(stability) }), approvedAssumptions());
    expect(result).toMatchObject({ reserveMonths: months, reserveMonthsBasis: "INCOME_STABILITY", reserveMonthsSource: "APPROVED_DOCUMENT", requiredEmergencyReserve: String(months * 25000000) });
  });
  it("approved default applies when stability is unknown", () => {
    expect(separateCapital(profile(), approvedAssumptions())).toMatchObject({ reserveMonths: 8, reserveMonthsBasis: "DEFAULT", reserveMonthsSource: "APPROVED_DOCUMENT" });
  });
  it("an explicit customer value still wins over the approved block and carries no source", () => {
    const result = separateCapital(profile({ incomeStability: known("UNCERTAIN"), reserveMonths: 8 }), approvedAssumptions());
    expect(result).toMatchObject({ reserveMonths: 8, reserveMonthsBasis: "CUSTOMER" });
    expect(result.reserveMonthsSource).toBeUndefined();
  });
  it.each(["STABLE", "VARIABLE", "UNCERTAIN"] as const)("absent block keeps the code default for %s and flags it as pending confirmation", stability => {
    const months = { STABLE: 6, VARIABLE: 9, UNCERTAIN: 12 }[stability];
    expect(separateCapital(profile({ incomeStability: known(stability) }), assumptions())).toMatchObject({ reserveMonths: months, reserveMonthsSource: "CODE_DEFAULT_PENDING_CONFIRMATION" });
    expect(separateCapital(profile(), assumptions())).toMatchObject({ reserveMonths: 6, reserveMonthsSource: "CODE_DEFAULT_PENDING_CONFIRMATION" });
  });
  it("accepts a valid block in [6, 12], keeps documents without it unchanged, and rejects bad blocks (incl. 5 and 13)", () => {
    expect(assumptionDocumentSchema.safeParse(approvedAssumptions()).success).toBe(true);
    expect(emergencyReserveMonthsSchema.safeParse(block({ byIncomeStability: { STABLE: 6, VARIABLE: 9, UNCERTAIN: 12 }, default: 6 })).success).toBe(true);
    expect(assumptionDocumentSchema.parse(assumptions())).not.toHaveProperty("emergencyReserveMonths");
    const bad: Record<string, unknown>[] = [
      block({ evidence: "" }), block({ evidence: undefined }),
      block({ byIncomeStability: { STABLE: 5, VARIABLE: 9, UNCERTAIN: 12 } }), block({ byIncomeStability: { STABLE: 6, VARIABLE: 9, UNCERTAIN: 13 } }),
      block({ byIncomeStability: { STABLE: 0, VARIABLE: 9, UNCERTAIN: 12 } }), block({ byIncomeStability: { STABLE: 6, VARIABLE: 9, UNCERTAIN: 25 } }),
      block({ byIncomeStability: { STABLE: 6, VARIABLE: 9.5, UNCERTAIN: 12 } }), block({ byIncomeStability: { STABLE: 10, VARIABLE: 9, UNCERTAIN: 12 } }),
      block({ byIncomeStability: { STABLE: 6, VARIABLE: 13, UNCERTAIN: 12 } }), block({ byIncomeStability: { STABLE: 6, VARIABLE: 9 } }),
      block({ default: 5 }), block({ default: 6 }), block({ default: 13 }), block({ extra: 1 }),
    ];
    for (const value of bad) expect(emergencyReserveMonthsSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    expect(assumptionDocumentSchema.safeParse({ ...assumptions(), emergencyReserveMonths: bad[6] }).success).toBe(false);
  });
  it("keeps profileV2Schema enforcing [6, 12] and warns RESERVE_MONTHS_OUTSIDE_METHOD_RANGE defensively when resolved months fall outside [6, 12]", () => {
    const base = profile();
    expect(profileV2Schema.safeParse({ ...base, reserveMonths: 3 }).success).toBe(false);
    expect(profileV2Schema.safeParse({ ...base, reserveMonths: 6 }).success).toBe(true);
    expect(profileV2Schema.safeParse({ ...base, reserveMonths: 12 }).success).toBe(true);
    expect(profileV2Schema.safeParse({ ...base, reserveMonths: 13 }).success).toBe(false);
    const inRange = separateCapital(profile({ incomeStability: known("STABLE") }), approvedAssumptions());
    expect(inRange.warnings.map(w => w.code)).not.toContain("RESERVE_MONTHS_OUTSIDE_METHOD_RANGE");
    const legacyOutOfRange = { ...assumptions(), emergencyReserveMonths: { evidence: "Legacy pre-A3 document", byIncomeStability: { STABLE: 3, VARIABLE: 9, UNCERTAIN: 14 }, default: 6 } };
    const low = separateCapital(profile({ incomeStability: known("STABLE") }), legacyOutOfRange);
    expect(low.reserveMonths).toBe(3);
    expect(low.warnings).toContainEqual({ path: "reserveMonths", code: "RESERVE_MONTHS_OUTSIDE_METHOD_RANGE" });
    const high = separateCapital(profile({ incomeStability: known("UNCERTAIN") }), legacyOutOfRange);
    expect(high.reserveMonths).toBe(14);
    expect(high.warnings).toContainEqual({ path: "reserveMonths", code: "RESERVE_MONTHS_OUTSIDE_METHOD_RANGE" });
  });
  it("the capital-reserve hash marker follows the approved value, not the code constant", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const f = await customFixture();
    await f.profiles.patchProfile("test-user", f.command.expectedProfileRevision, { schemaVersion: 2, incomeStability: known("VARIABLE" as const) });
    const input = { ...retirementCommand(f.policy.id), ...f.command, expectedProfileRevision: f.command.expectedProfileRevision + 1, allocationFunding: "PROTECTED_CAPITAL_V1" as const };
    const preview = await f.services.retirement.preview("test-user", input, { adjustments: false });
    const snapshot = await f.services.retirement.capture(f.db, "test-user", preview.selection);
    const approved = { ...snapshot, assumptions: { ...snapshot.assumptions, data: { ...snapshot.assumptions.data, emergencyReserveMonths: block() } } };
    const base = { profile: snapshot.profile, input: preview.selection, policyHash: snapshot.policy.documentHash, assumptionHash: snapshot.assumptions.documentHash };
    expect(previewInputHash(approved, preview.selection, "retirement-monthly-v3")).toBe(hashOf({ ...base, capitalReserveDefaultMonths: 10 }));
    expect(previewInputHash(snapshot, preview.selection, "retirement-monthly-v3")).toBe(hashOf({ ...base, capitalReserveDefaultMonths: 9 }));
    // A customer-set value adds no marker, whatever the approved block says.
    const custom = { ...approved, profile: { ...approved.profile, reserveMonths: 7 } };
    expect(previewInputHash(custom, preview.selection, "retirement-monthly-v3")).toBe(hashOf({ profile: custom.profile, input: preview.selection, policyHash: snapshot.policy.documentHash, assumptionHash: snapshot.assumptions.documentHash }));
  });
});
