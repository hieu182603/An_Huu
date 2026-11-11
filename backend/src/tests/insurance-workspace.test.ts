import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { InsuranceHistoryService } from "../modules/pensions/history-service";
import { changeHistoryPeriod, historyPeriods, historyPeriodsReport, historyPeriodsReportSchema } from "../modules/pensions/periods";
import { pensionChanges, profilePensionReport, profilePensionReportSchema } from "../modules/profiles/pension-commands";
import { previewInsuranceHistory } from "../modules/pensions/history";
import { pensionAtMonth } from "../modules/pensions/engine";
import { profileV2Schema, type ProfileV2 } from "../modules/profiles/schema-v2";
import type { InsuranceHistory } from "../modules/pensions/insurance-schema";
import { digest } from "../common/digest";
import { memoryDb } from "./memory-db";
import { fixtureProfile, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";
import { config, token } from "./helpers";
import { pensionImpact, pensionImpactSchema } from "../modules/pensions/impact";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { plansFixture } from "./plans-fixtures";
const entry = { fromMonth: "2026-01", toMonth: "2026-03", scheme: "COMPULSORY" as const, salaryRegime: "EMPLOYER" as const, contributionBase: "10000000" };
const pension = { status: "KNOWN" as const, monthlyAmount: "5000000", currency: "VND" as const, priceBasis: "NOMINAL_AT_START" as const, basisMonth: "2050-05", source: "User declaration", estimatedOn: "2026-10-04", adjustment: { kind: "NONE" as const } };
const draft = () => changeHistoryPeriod(null, { kind: "ADD", entry }, "2026-11-10");
const normalize = (doc: InsuranceHistory) => previewInsuranceHistory({ expectedHistoryRevision: 0, document: doc }).normalized;
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(new Date("2026-11-10T08:00:00Z").getTime()); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
async function setup(data = fixtureProfile({ debts: empty() })) {
  const f = memoryDb(), profiles = new ProfileService(f.db), histories = new InsuranceHistoryService(f.db), auth = new AuthService(f.db, config);
  const user = await f.db.user.create({ data: { id: "test-user", role: "USER", status: "ACTIVE", email: "insurance@example.test", fullName: "Fixture", passwordHash: "unused" } });
  await profiles.saveDraft(user.id, 0, "summary", data); await profiles.complete(user.id, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  vi.spyOn(auth, "validateSession").mockResolvedValue(user);
  return { ...f, profiles, histories, app: createApp({ config, services: { auth, profiles, insuranceHistory: histories } }) };
}
describe("versioned participation periods", () => {
  it("groups exactly equal consecutive months and retains unknown gaps", () => {
    const first = normalize(draft()), next = normalize(changeHistoryPeriod(first, { kind: "ADD", entry: { ...entry, fromMonth: "2026-05", toMonth: "2026-06", scheme: "VOLUNTARY", salaryRegime: "VOLUNTARY_INCOME" } }, "2026-11-10"));
    expect(historyPeriods(next).map(period => [period.fromMonth, period.toMonth, period.months])).toEqual([["2026-01", "2026-03", 3], ["2026-05", "2026-06", 2]]);
    expect(next.months.find(row => row.month === "2026-04")).toMatchObject({ status: "UNKNOWN", contributionBase: null, evidence: [] });
    expect(next.months.filter(row => row.status === "PAID")).toHaveLength(5);
    expect(next.birth.precision).toBe("UNKNOWN"); expect(next.legalSex).toBe("UNKNOWN");
  });
  it("does not manufacture evidence or legal eligibility from self-declared paid months", () => {
    const document = normalize(draft());
    expect(document.months.every(row => row.evidence.length === 0)).toBe(true);
    const p = previewInsuranceHistory({ expectedHistoryRevision: 0, document });
    expect(p.status).toBe("INCOMPLETE"); expect(p.issues.some(issue => issue.code === "CONTRIBUTION_EVIDENCE_REQUIRED")).toBe(true);
  });
  it("keeps absent history distinct from a declared empty range", () => {
    expect(historyPeriodsReport(null)).toMatchObject({ state: "NOT_DECLARED", historyRevision: 0, declaredContributionMonths: null });
    const document = normalize(draft()), id = historyPeriods(document)[0].id;
    const removed = normalize(changeHistoryPeriod(document, { kind: "DELETE", id }, "2026-11-10"));
    const report = historyPeriodsReport({ id: randomUUID(), revision: 2, documentHash: digest(removed), recordedAt: "2026-11-10T00:00:00.000Z", document: removed });
    expect(historyPeriodsReportSchema.safeParse(report).success).toBe(true);
    expect(report).toMatchObject({ state: "DECLARED", declaredContributionMonths: 0, unknownMonths: 3, periods: [] });
    expect(document.months.every(row => row.status === "PAID")).toBe(true);
  });
  it("edits a period without counting the original or its gaps twice", () => {
    const doc = normalize(draft()), before = structuredClone(doc), id = historyPeriods(doc)[0].id;
    const result = normalize(changeHistoryPeriod(doc, { kind: "UPDATE", id, entry: { ...entry, fromMonth: "2026-02", toMonth: "2026-04", contributionBase: "0" } }, "2026-11-10"));
    expect(result.months.map(row => row.status)).toEqual(["UNKNOWN", "PAID", "PAID", "PAID"]); expect(historyPeriods(result)).toHaveLength(1); expect(historyPeriods(result)[0].details.contributionBase).toBe("0"); expect(doc).toEqual(before);
  });
  it.each([
    [{ ...entry, toMonth: "2025-12" }, "HISTORY_PERIOD_DATES"], [{ ...entry, toMonth: "2026-12" }, "HISTORY_PERIOD_DATES"],
    [{ ...entry, fromMonth: "1900-01", toMonth: "2026-01" }, "HISTORY_PERIOD_TOO_LONG"],
    [{ ...entry, scheme: "VOLUNTARY" as const }, "HISTORY_PERIOD_SCHEME"],
  ])("rejects unsupported dates and salary scheme %j", (value, code) => {
    expect(() => changeHistoryPeriod(null, { kind: "ADD", entry: value }, "2026-11-10")).toThrowError(expect.objectContaining({ code }));
  });
  it("rejects overlapping periods but allows explicitly filling a previously unknown gap", () => {
    const doc = normalize(draft());
    expect(() => changeHistoryPeriod(doc, { kind: "ADD", entry }, "2026-11-10")).toThrowError(expect.objectContaining({ code: "HISTORY_PERIOD_OVERLAP" }));
    const after = normalize(changeHistoryPeriod(doc, { kind: "ADD", entry: { ...entry, fromMonth: "2026-05", toMonth: "2026-05" } }, "2026-11-10"));
    const filled = normalize(changeHistoryPeriod(after, { kind: "ADD", entry: { ...entry, fromMonth: "2026-04", toMonth: "2026-04" } }, "2026-11-10")); expect(filled.months.every(row => row.status === "PAID")).toBe(true);
  });
  it("requires detailed history for evidence, state salary, credited months and special periods", () => {
    const evidence = { reference: "Evidence", contentHash: digest("evidence"), confirmedOn: "2026-10-01" };
    for (const kind of ["evidence", "state", "credit", "special"] as const) {
      const doc = draft();
      if (kind === "evidence") doc.months[0].evidence = [evidence];
      if (kind === "state") { doc.months[0].salaryRegime = "STATE"; doc.months[0].stateSalary = { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "3", evidence: [evidence] }; }
      if (kind === "credit") { doc.months[0].status = "CREDITED"; doc.months[0].creditKind = "MATERNITY_ART53_8"; doc.months[0].evidence = [evidence]; }
      if (kind === "special") doc.specialPeriods = [{ kind: "Special fixture", startMonth: "2026-01", endMonth: "2026-01", evidence: [evidence] }];
      const period = historyPeriods(doc)[0]; expect(period.advancedOnly).toBe(true);
      expect(() => changeHistoryPeriod(doc, { kind: "DELETE", id: period.id }, "2026-11-10")).toThrowError(expect.objectContaining({ code: "HISTORY_PERIOD_ADVANCED_REQUIRED" }));
    }
  });
  it("keeps precise large bases, nullable unknown amounts and zero separate", () => {
    for (const value of ["9007199254740993.25", "0", null]) {
      const result = normalize(changeHistoryPeriod(null, { kind: "ADD", entry: { ...entry, contributionBase: value } }, "2026-11-10")); expect(historyPeriods(result)[0].details.contributionBase).toBe(value);
    }
  });
});
describe("pension declaration commands", () => {
  it("reports unknown, no pension and explicit zero without assumed start age", () => {
    const unknownReport = profilePensionReport(fixtureProfile(), 3); expect(unknownReport).toMatchObject({ profileRevision: 3, declaration: { status: "UNKNOWN" }, ageAtStartMonths: null, currentMonthAmount: null, fundReduction: null, entitlement: "NOT_ASSESSED" });
    expect(profilePensionReportSchema.safeParse(unknownReport).success).toBe(true);
    const no = pensionChanges(fixtureProfile(), { expectedRevision: 1, pension: { status: "NOT_APPLICABLE", reason: "Confirmed none" }, pensionStartMonth: unknown });
    expect(no.personal.pensionStartMonth.status).toBe("NOT_APPLICABLE"); expect(profilePensionReport({ ...fixtureProfile(), ...no }, 1).currentMonthAmount).toBe("0");
    const zero = pensionChanges(fixtureProfile(), { expectedRevision: 1, pension: { ...pension, monthlyAmount: "0", priceBasis: "TODAY", basisMonth: "2026-10" }, pensionStartMonth: unknown }); expect(zero.pension?.status).toBe("KNOWN"); expect(pensionAtMonth({ ...fixtureProfile(), ...zero }, "2026-10").amount).toBe("0");
  });
  it("synchronizes and removes linked pension income without double counting or losing salary", () => {
    const p = fixtureProfile({ pension, personal: { ...fixtureProfile().personal, pensionStartMonth: known("2050-05") } });
    p.pension = { ...pension, linkedIncomeId: "pension-ref" };
    if (p.income.status !== "KNOWN") throw new Error();
    p.income.entries.push({ id: "pension-ref", label: "Linked pension", source: "PENSION", kind: "FIXED", basis: "DISPOSABLE", amount: unknown, currency: "VND", frequency: "MONTHLY", startMonth: "2050-05", endMonth: null });
    const valid = profileV2Schema.parse(p);
    const changed = pensionChanges(valid, { expectedRevision: 1, pension: { ...pension, basisMonth: "2051-01", linkedIncomeId: "pension-ref" }, pensionStartMonth: known("2051-01") });
    expect(changed.income).toMatchObject({ entries: [{ id: "salary" }, { id: "pension-ref", amount: unknown, startMonth: "2051-01" }] });
    const removed = pensionChanges({ ...valid, ...changed }, { expectedRevision: 2, pension: unknown, pensionStartMonth: unknown }); expect(removed.income).toMatchObject({ entries: [{ id: "salary" }] }); if (removed.income.status === "KNOWN") expect(removed.income.entries).toHaveLength(1);
  });
  it("requires a known month for nominal-at-start and rejects starts before birth", () => {
    expect(() => pensionChanges(fixtureProfile(), { expectedRevision: 1, pension, pensionStartMonth: unknown })).toThrowError(expect.objectContaining({ code: "PENSION_START_MONTH_REQUIRED" }));
    expect(() => pensionChanges(fixtureProfile(), { expectedRevision: 1, pension, pensionStartMonth: known("1980-01") })).toThrowError(expect.objectContaining({ code: "PENSION_START_BEFORE_BIRTH" }));
  });
  it("does not invent inflation or override explicit adjustment schedules", () => {
    const p = fixtureProfile({ pension: { ...pension, priceBasis: "TODAY", basisMonth: "2026-10", adjustment: { kind: "EXPLICIT_SCHEDULE", entries: [{ effectiveMonth: "2051-01", monthlyAmount: "6000000", source: "Future confirmed amount" }] } }, personal: { ...fixtureProfile().personal, pensionStartMonth: known("2050-05") } });
    expect(pensionAtMonth(p, "2050-05")).toMatchObject({ amount: null, issues: [{ code: "PUBLISHED_INFLATION_REQUIRED" }] }); expect(pensionAtMonth(p, "2051-01").amount).toBe("6000000");
    const change = pensionChanges(p, { expectedRevision: 1, pension: p.pension!, pensionStartMonth: p.personal.pensionStartMonth }); expect(change.pension).toEqual(p.pension);
  });
});
describe("insurance workspace HTTP with memory database", () => {
  it("appends, replays, rejects conflicts, edits and deletes without changing pension/profile or applied snapshots", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() }, key = randomUUID();
    const before = await f.profiles.getProfile("test-user");
    const write = (expectedHistoryRevision: number, command: object, idempotencyKey = randomUUID()) => request(f.app).patch("/api/v1/me/pension/history/periods").set(headers).set("Idempotency-Key", idempotencyKey).send({ expectedHistoryRevision, command });
    const first = await write(0, { kind: "ADD", entry }, key); expect(first.status).toBe(200); expect(first.body.data).toMatchObject({ historyRevision: 1, declaredContributionMonths: 3, missingEvidenceMonths: 3 });
    expect((await write(0, { kind: "ADD", entry }, key)).body.data).toEqual(first.body.data); expect(f.rows("socialInsuranceHistoryVersion")).toHaveLength(1);
    expect((await write(0, { kind: "ADD", entry })).status).toBe(409);
    expect((await write(1, { kind: "DELETE", id: first.body.data.periods[0].id }, key)).status).toBe(409);
    const updated = await write(1, { kind: "UPDATE", id: first.body.data.periods[0].id, entry: { ...entry, contributionBase: "0" } }); expect(updated.status).toBe(200);
    expect((await write(2, { kind: "DELETE", id: updated.body.data.periods[0].id })).status).toBe(200);
    const report = await request(f.app).get("/api/v1/me/pension/history/periods").set(headers); expect(report.body.data).toMatchObject({ historyRevision: 3, declaredContributionMonths: 0, unknownMonths: 3 });
    expect(f.rows("socialInsuranceHistoryVersion")).toHaveLength(3); expect(await f.profiles.getProfile("test-user")).toEqual(before);
    expect(await f.histories.periods("another-user")).toMatchObject({ state: "NOT_DECLARED", periods: [] });
    expect((await request(f.app).get("/api/v1/me/pension/history/periods").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    expect((await request(f.app).get("/api/v1/me/pension/history/periods")).status).toBe(401);
  });
  it("rolls back history and idempotency when audit fails", async () => {
    const f = await setup(), before = structuredClone(f.rows("idempotencyRecord")); f.failWrites("auditLog");
    await expect(f.histories.patchPeriods("test-user", { expectedHistoryRevision: 0, command: { kind: "ADD", entry } }, randomUUID())).rejects.toThrow();
    expect(f.rows("socialInsuranceHistoryVersion")).toHaveLength(0); expect(f.rows("idempotencyRecord")).toEqual(before);
  });
  it("saves complete pension contracts with revision checks and leaves plans unapplied", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() }, body = { expectedRevision: 1, pension, pensionStartMonth: known("2050-05") };
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } });
    const response = await request(f.app).patch("/api/v1/me/financial-profile/pension").set(headers).send(body); expect(response.status).toBe(200);
    expect((await request(f.app).patch("/api/v1/me/financial-profile/pension").set(headers).send(body)).status).toBe(409);
    const report = await request(f.app).get("/api/v1/me/financial-profile/pension").set(headers); expect(report.status).toBe(200); expect(report.body.data).toMatchObject({ profileRevision: 2, declaration: pension, pensionStartMonth: known("2050-05"), currentMonthAmount: "0", ageAtStartMonths: 721 });
    expect(f.rows("retirementPlan")[0]).toMatchObject({ stale: true, currentVersionId: "frozen" });
    await expect(f.profiles.getPension("another-user")).rejects.toMatchObject({ status: 404 });
    expect((await request(f.app).get("/api/v1/me/financial-profile/pension").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
  });
  it("rolls back pension changes and linked income on outbox failure", async () => {
    const f = await setup(), before = await f.profiles.getProfile("test-user"); f.failWrites("outboxEvent");
    await expect(f.profiles.patchPension("test-user", { expectedRevision: 1, pension, pensionStartMonth: known("2050-05") })).rejects.toThrow(); expect(await f.profiles.getProfile("test-user")).toEqual(before);
  });
  it("keeps legacy declaration upgrade explicit", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("test-user", 0, "summary", legacyProfileFixture); await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    await expect(profiles.getPension("test-user")).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
  });
  it("documents both new workspace report envelopes", async () => {
    const f = await setup(), doc = await SwaggerParser.dereference("docs/openapi.yaml") as any, ajv = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } });
    for (const [name, data] of [["InsurancePeriodsReportEnvelope", await f.histories.periods("test-user")], ["PensionWorkspaceReportEnvelope", await f.profiles.getPension("test-user")]] as const) {
      const validate = ajv.compile(doc.components.schemas[name]); expect(validate({ data, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});
describe("read-only pension capital comparison", () => {
  const withPension = () => {
    const p = retirementProfile(); p.personal.pensionStartMonth = known("2027-01"); p.pension = { ...pension, monthlyAmount: "60", basisMonth: "2027-01" }; return p;
  };
  it("uses two canonical projections with identical assumptions and dates", () => {
    const { policy, assumptions } = retirementConfiguration(), p = withPension(), before = structuredClone(p);
    const result = pensionImpact(p, retirementCommand(), policy, assumptions);
    expect(result).toMatchObject({ status: "READY", requiredFundWithPension: "120", requiredFundWithoutPension: "300", fundReduction: "180" }); expect(p).toEqual(before);
  });
  it("keeps missing declarations, dates and assumptions incomplete instead of pretending no pension", () => {
    const { policy, assumptions } = retirementConfiguration(), p = withPension(); p.pension = unknown;
    expect(pensionImpact(p, retirementCommand(), policy, assumptions)).toMatchObject({ status: "INCOMPLETE", fundReduction: null });
    p.pension = { ...pension, priceBasis: "TODAY", basisMonth: "2026-10" }; const missing = { ...assumptions, inflation: [] };
    expect(pensionImpact(p, retirementCommand(), policy, missing)).toMatchObject({ status: "INCOMPLETE", requiredFundWithPension: null, requiredFundWithoutPension: null, fundReduction: null });
  });
  it("returns real zero for known zero or pension starting beyond the unchanged horizon", () => {
    const { policy, assumptions } = retirementConfiguration(), p = withPension(); p.pension = { ...p.pension as typeof pension, monthlyAmount: "0" };
    expect(pensionImpact(p, retirementCommand(), policy, assumptions)).toMatchObject({ status: "READY", fundReduction: "0" });
    p.personal.pensionStartMonth = known("2028-01"); p.pension = { ...pension, monthlyAmount: "60", basisMonth: "2028-01" };
    expect(pensionImpact(p, retirementCommand(), policy, assumptions)).toMatchObject({ status: "READY", fundReduction: "0" });
  });
  it("removes only the linked pension reference while retaining other retirement income", () => {
    const { policy, assumptions } = retirementConfiguration(), p = withPension(); if (p.income.status !== "KNOWN") throw Error();
    p.pension = { ...p.pension as typeof pension, linkedIncomeId: "ref" };
    p.income.entries.push({ id: "ref", label: "Pension reference", source: "PENSION", kind: "FIXED", basis: "DISPOSABLE", amount: unknown, currency: "VND", frequency: "MONTHLY", startMonth: "2027-01", endMonth: null });
    const input = retirementCommand(); input.retirementIncomeIds = ["ref"];
    expect(pensionImpact(profileV2Schema.parse(p), input, policy, assumptions)).toMatchObject({ status: "READY", fundReduction: "180" });
  });
  it("captures the current owned profile and rejects stale revisions without any persistence", async () => {
    const f = await plansFixture(withPension()), before = structuredClone(f.rows("financialProfile"));
    const result = await f.retirement.pensionImpact(f.owner, f.command.preview);
    expect(pensionImpactSchema.safeParse(result).success).toBe(true); expect(result.status).toBe("READY"); expect(result.fundReduction).toBe("180"); expect(f.rows("financialProfile")).toEqual(before); expect(f.rows("retirementPlan")).toHaveLength(0);
    await expect(f.retirement.pensionImpact(f.owner, { ...f.command.preview, expectedProfileRevision: 2 })).rejects.toMatchObject({ status: 409 });
    await expect(f.retirement.pensionImpact("another-user", f.command.preview)).rejects.toMatchObject({ status: 404 });
  });
  it("serves a USER-only comparison envelope without saving or applying a plan", async () => {
    const f = await plansFixture(withPension()), auth = new AuthService(f.db, config);
    const user = await f.db.user.create({ data: { id: f.owner, role: "USER", status: "ACTIVE", email: "impact@example.test", fullName: "Fixture", passwordHash: "unused" } }); vi.spyOn(auth, "validateSession").mockResolvedValue(user);
    const app = createApp({ config, services: { profiles: f.profiles, auth, retirement: f.retirement } }), before = await f.profiles.getProfile(f.owner);
    const response = await request(app).post("/api/v1/me/retirement/pension-impact").set("Authorization", "Bearer " + token()).send(f.command.preview);
    expect(response.status).toBe(200); expect(response.body.data.fundReduction).toBe("180");
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as any, validate = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } }).compile(doc.components.schemas.PensionImpactEnvelope);
    expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    expect((await request(app).post("/api/v1/me/retirement/pension-impact").set("Authorization", "Bearer " + token("ADMIN")).send(f.command.preview)).status).toBe(403);
    expect(await f.profiles.getProfile(f.owner)).toEqual(before); expect(f.rows("retirementPlan")).toHaveLength(0);
  });
});
