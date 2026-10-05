import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { profileV2Schema } from "../modules/profiles/schema-v2";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { pensionAtMonth } from "../modules/pensions/engine";
import { legalRetirementAge } from "../modules/pensions/legal-age";
import { PensionsService } from "../modules/pensions/service";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { AssumptionsService } from "../modules/assumptions/service";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
import { fixtureProfile, known, unknown } from "./profile-v2-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { declaredPension, pensionProfile } from "./pension-fixtures";
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T05 pension amounts and cashflows", () => {
  it("starts in the declared month and never automatically indexes receipt amounts", () => {
    const p = pensionProfile();
    expect(pensionAtMonth(p, "2026-12").amount).toBe("0");
    for (const m of ["2027-01", "2027-02", "2050-12"]) expect(pensionAtMonth(p, m).amount).toBe("5000000");
  });
  it("keeps missing, zero and not-applicable distinct", () => {
    const p = pensionProfile(); p.pension = unknown;
    expect(pensionAtMonth(p, "2027-01")).toMatchObject({ amount: null, issues: [{ code: "PENSION_NOT_INCLUDED" }] });
    p.pension = { ...declaredPension(), monthlyAmount: "0" }; p.personal.pensionStartMonth = unknown;
    expect(pensionAtMonth(p, "2027-01")).toEqual({ amount: "0", issues: [] });
    p.pension = { status: "NOT_APPLICABLE", reason: "User confirmed" };
    expect(pensionAtMonth(p, "2027-01").amount).toBe("0");
  });
  it("converts TODAY once across annual boundaries, excludes historical CPI and freezes nominal receipt", () => {
    const p = pensionProfile(), a = assumptionFixture();
    p.pension = { ...declaredPension(), priceBasis: "TODAY", basisMonth: "2026-10" };
    p.personal.pensionStartMonth = known("2028-01");
    expect(pensionAtMonth(p, "2028-01").amount).toBeNull();
    // Oct-Dec 2026: 0%; twelve months in 2027: 4%. Independent annual expectation.
    const amount = Number(pensionAtMonth(p, "2028-01", a).amount);
    expect(amount).toBeCloseTo(5200000, 6);
    expect(pensionAtMonth(p, "2040-01", a).amount).toBe(pensionAtMonth(p, "2028-01", a).amount);
    a.inflation = a.inflation.filter(r => r.year !== 2027);
    expect(pensionAtMonth(p, "2028-01", a)).toMatchObject({ amount: null, issues: [{ code: "INFLATION_YEAR_MISSING" }] });
  });
  it("applies an explicit nominal replacement on its month without compounding it", () => {
    const p = pensionProfile(); p.pension = { ...declaredPension(), adjustment: { kind: "EXPLICIT_SCHEDULE", entries: [
      { effectiveMonth: "2027-03", monthlyAmount: "4000000", source: "Declared revision" },
    ] } };
    expect(pensionAtMonth(p, "2027-02").amount).toBe("5000000");
    expect(pensionAtMonth(p, "2027-03").amount).toBe("4000000");
    expect(pensionAtMonth(p, "2040-03").amount).toBe("4000000");
  });
  it("retains decimal money and supports negative inflation without a zero floor", () => {
    const p = pensionProfile(), a = assumptionFixture();
    p.pension = { ...declaredPension(), monthlyAmount: "9007199254740993.25" };
    expect(pensionAtMonth(p, "2027-01").amount).toBe("9007199254740993.25");
    p.pension = { ...declaredPension(), priceBasis: "TODAY", basisMonth: "2026-10" };
    p.personal.pensionStartMonth = known("2028-01");
    a.inflation.find(r => r.year === 2027)!.percent = "-4";
    expect(Number(pensionAtMonth(p, "2028-01", a).amount)).toBeCloseTo(4800000, 6);
  });
  it("includes pension once and marks unresolved active nominal totals unknown", () => {
    const p = pensionProfile(); p.valuationDate = "2027-01-01";
    p.pension = { ...declaredPension(), linkedIncomeId: "pension-ref" };
    if (p.income.status !== "KNOWN") throw new Error("fixture");
    p.income.entries.push({ id: "pension-ref", label: "Pension reference", source: "PENSION", kind: "FIXED", basis: "DISPOSABLE",
      amount: known("5000000"), currency: "VND", frequency: "MONTHLY", startMonth: "2027-01", endMonth: null });
    expect(profileV2Summary(profileV2Schema.parse(p)).values.monthlyIncome).toBe("25000000");
    p.pension = { ...p.pension, priceBasis: "TODAY", basisMonth: "2027-02" };
    expect(profileV2Summary(p).values.monthlyIncome).toBeNull();
  });
  it("rejects inconsistent dates, duplicate adjustments and unlinked pension income", () => {
    const p = pensionProfile();
    for (const patch of [{ estimatedOn: "2027-01-01" }, { basisMonth: "2027-02" }, { monthlyAmount: "-1" }, { monthlyAmount: "" }, { linkedIncomeId: "missing" }])
      expect(profileV2Schema.safeParse({ ...p, pension: { ...declaredPension(), ...patch } }).success).toBe(false);
    const e = { effectiveMonth: "2027-03", monthlyAmount: "10", source: "user" };
    expect(profileV2Schema.safeParse({ ...p, pension: { ...declaredPension(), adjustment: { kind: "EXPLICIT_SCHEDULE", entries: [e, e] } } }).success).toBe(false);
    if (p.income.status === "KNOWN") p.income.entries[0].source = "PENSION";
    expect(profileV2Schema.safeParse(p).success).toBe(false);
  });
});
describe("T05 official retirement-age annex reference", () => {
  it("never defaults missing conditions/sex or extrapolates past the supported calendar", () => {
    const p = pensionProfile().personal;
    p.retirementCondition = { kind: "UNKNOWN" };
    expect(legalRetirementAge(p, "2026-10-04")).toMatchObject({ status: "REVIEW_REQUIRED", issue: "WORK_CONDITION_REQUIRED" });
    p.retirementCondition = { kind: "NORMAL" }; p.gender = "UNDISCLOSED";
    expect(legalRetirementAge(p, "2026-10-04").issue).toBe("LEGAL_SEX_REQUIRED");
    p.gender = "MALE"; p.birthMonth = known("2137-12");
    expect(legalRetirementAge(p, "2199-01-01").issue).toBe("OUTSIDE_SUPPORTED_CALENDAR");
    p.birthMonth = known("1960-11");
    expect(legalRetirementAge(p, "2026-10-04").issue).toBe("OUTSIDE_ANNEX_BIRTH_COHORTS");
  });
  it.each([
    ["MALE", "1960-12", 720, "2021-01"], ["MALE", "1961-01", 723, "2021-05"],
    ["MALE", "1961-09", 723, "2022-01"], ["MALE", "1961-10", 726, "2022-05"],
    ["MALE", "1966-03", 741, "2028-01"], ["MALE", "1966-04", 744, "2028-05"],
    ["FEMALE", "1965-12", 660, "2021-01"], ["FEMALE", "1966-08", 664, "2022-01"],
    ["FEMALE", "1966-09", 668, "2022-06"], ["FEMALE", "1975-04", 716, "2035-01"],
    ["FEMALE", "1975-05", 720, "2035-06"],
  ] as const)("matches annex I %s born %s", (gender, birth, age, receipt) => {
    const personal = { ...pensionProfile().personal, gender, birthMonth: known(birth) };
    expect(legalRetirementAge(personal, "2026-10-04")).toMatchObject({ status: "REFERENCE_ONLY", ageMonths: age,
      referenceFollowingMonth: receipt, pensionStartMonth: null, pensionStartStatus: "REQUIRES_BENEFIT_ASSESSMENT", eligibility: "NOT_ASSESSED" });
  });
  it("uses annex II only for declared article 5 conditions, not age minus five at normal retirement", () => {
    const p = pensionProfile().personal;
    p.gender = "MALE"; p.birthMonth = known("1969-10");
    p.retirementCondition = { kind: "ARTICLE_5_DECLARED", basis: "HAZARDOUS_15_YEARS", evidence: "Self declaration" };
    const result = legalRetirementAge(p, "2026-10-04");
    expect(result).toMatchObject({ ageMonths: 678, referenceFollowingMonth: "2026-05", pensionStartMonth: null, issue: "ARTICLE_5_CONDITIONS_NOT_VERIFIED" });
    p.desiredRetirementMonth = known("2040-01");
    expect(legalRetirementAge(p, "2026-10-04").retirementMonth).toBe(result.retirementMonth);
    p.retirementCondition = { kind: "OTHER", description: "Special occupation" };
    expect(legalRetirementAge(p, "2026-10-04").status).toBe("REVIEW_REQUIRED");
  });
});
describe("T05 API persistence and permissions", () => {
  it("persists declared pension, enforces ownership/revision and published assumptions, stays read-only", async () => {
    const f = memoryDb(), auth = new AuthService(f.db, config), profiles = new ProfileService(f.db), pensions = new PensionsService(f.db);
    const user = await f.db.user.create({ data: { id: "test-user", email: "pension@example.test", fullName: "Fixture", passwordHash: "unused", role: "USER", status: "ACTIVE" } });
    vi.spyOn(auth, "validateSession").mockResolvedValue(user);
    await profiles.saveDraft(user.id, 0, "socialSecurity", pensionProfile());
    await profiles.complete(user.id, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    const app = createApp({ config, services: { auth, profiles, pensions } });
    const input = { expectedProfileRevision: 1, startMonth: "2026-12", months: 3 };
    const call = (body: object, role: "USER" | "ADMIN" = "USER") => request(app).post("/api/v1/me/pension/preview").set("Authorization", "Bearer " + token(role)).send(body);
    const before = JSON.stringify([f.rows("financialProfile"), f.rows("outboxEvent"), f.rows("auditLog")]);
    const res = await call(input);
    expect(res.status).toBe(200); expect(res.body.data.rows.map((r: { amount: string }) => r.amount)).toEqual(["0", "5000000", "5000000"]);
    expect(JSON.stringify([f.rows("financialProfile"), f.rows("outboxEvent"), f.rows("auditLog")])).toBe(before);
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true, uri: true } });
    const validate = ajv.compile(doc.components.schemas.PensionPreviewEnvelope);
    expect(validate(res.body), JSON.stringify(validate.errors)).toBe(true);
    const profileResponse = await request(app).get("/api/v1/me/financial-profile").set("Authorization", "Bearer " + token());
    expect(ajv.compile(doc.components.schemas.ProfileEnvelope)(profileResponse.body)).toBe(true);
    for (const extra of [{ userId: "other" }, { inflationRate: "4" }, { monthlyAmount: "5" }]) expect((await call({ ...input, ...extra })).status).toBe(400);
    expect((await call(input, "ADMIN")).status).toBe(403);
    expect((await request(app).post("/api/v1/me/pension/preview").send(input)).status).toBe(401);
    expect((await call({ ...input, expectedProfileRevision: 2 })).status).toBe(409);
    await expect(pensions.preview("other", input)).rejects.toMatchObject({ status: 404 });
    const a = new AssumptionsService(f.db), draft = await a.create(user.id, assumptionFixture());
    expect((await call({ ...input, assumptionVersionId: draft.id })).status).toBe(404);
    const impact = await a.previewImpact(user.id, draft.id, { expectedRevision: draft.revision });
    const approved = await a.approve(user.id, draft.id, { expectedRevision: draft.revision, impactToken: impact.impactToken, reviewNote: "Test review" });
    await a.publish(user.id, draft.id, { expectedRevision: approved.revision, confirm: true });
    await profiles.patchProfile(user.id, 1, { schemaVersion: 2, pension: { ...declaredPension(), priceBasis: "TODAY", basisMonth: "2026-10" } });
    expect((await call({ ...input, expectedProfileRevision: 2 })).body.data.status).toBe("INCOMPLETE");
    const converted = await call({ ...input, expectedProfileRevision: 2, assumptionVersionId: draft.id });
    expect(converted.body.data.status).toBe("READY"); expect(validate(converted.body), JSON.stringify(validate.errors)).toBe(true);
  });
});
