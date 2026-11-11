import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { ProfileService } from "../modules/profiles/service";
import { AuthService } from "../modules/auth/service";
import { familyChanges, familyPatchSchema, familyReportSchema, profileFamilyReport } from "../modules/profiles/family";
import { profileV2Schema, type ExpenseEntry } from "../modules/profiles/schema-v2";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { prepareRetirement } from "../modules/retirement/prepare";
import { fixtureProfile, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
const input = { expectedRevision: 1, maritalStatus: "DIVORCED" as const, dependents: known(2) };
const expense = (changes: Partial<ExpenseEntry> = {}): ExpenseEntry => ({ id: "support", label: "Hỗ trợ bố mẹ", category: "DEPENDENT", amount: known("3000000"), currency: "VND", startMonth: "2026-01", endMonth: null, frequency: "MONTHLY", ...changes });
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
async function setup() {
  const f = memoryDb(), profiles = new ProfileService(f.db), auth = new AuthService(f.db, config);
  const user = await f.db.user.create({ data: { id: "test-user", role: "USER", status: "ACTIVE", email: "family@example.test", fullName: "Fixture", passwordHash: "unused" } });
  await profiles.saveDraft(user.id, 0, "summary", fixtureProfile()); await profiles.complete(user.id, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  vi.spyOn(auth, "validateSession").mockResolvedValue(user);
  return { ...f, profiles, app: createApp({ config, services: { profiles, auth } }) };
}
describe("family declarations and expense report", () => {
  it("accepts divorce and explicit withholding while retaining old optional data shapes", () => {
    const p = fixtureProfile(), before = structuredClone(p);
    const changed = familyChanges(p, input); expect(changed.personal).toMatchObject({ maritalStatus: "DIVORCED", dependents: known(2), birthMonth: p.personal.birthMonth, desiredRetirementMonth: p.personal.desiredRetirementMonth });
    expect(profileV2Schema.safeParse({ ...p, ...changed }).success).toBe(true);
    const withheld = familyChanges({ ...p, ...changed }, { ...input, maritalStatus: null, dependents: unknown });
    expect(profileV2Schema.parse({ ...p, ...withheld }).personal).toMatchObject({ maritalStatus: null, dependents: unknown });
    expect(profileV2Schema.parse(p).personal.maritalStatus).toBeUndefined(); expect(p).toEqual(before);
  });
  it.each([0, 1, 4, 7, 30])("preserves an exact count of %s without converting zero to unknown or capping at 4", value => {
    const p = fixtureProfile(), report = profileFamilyReport({ ...p, ...familyChanges(p, { ...input, dependents: known(value) }) }, 3);
    expect(report.dependents).toEqual(known(value)); expect(familyReportSchema.safeParse(report).success).toBe(true); expect(report.profileRevision).toBe(3);
  });
  it.each([-1, 31, 0.5, "2", null])("refuses invalid dependent values %j", value => {
    expect(familyPatchSchema.safeParse({ ...input, dependents: { status: "KNOWN", value } }).success).toBe(false);
  });
  it("requires explicit fields and rejects extra profile data or unknown marital strings", () => {
    expect(familyPatchSchema.safeParse({ ...input, income: empty() }).success).toBe(false);
    expect(familyPatchSchema.safeParse({ expectedRevision: 1, maritalStatus: null }).success).toBe(false);
    expect(familyPatchSchema.safeParse({ ...input, maritalStatus: "WIDOWED_UNSUPPORTED" }).success).toBe(false);
    expect(profileFamilyReport(fixtureProfile(), 1)).toMatchObject({ maritalStatus: null, dependents: unknown });
  });
  it("only sums explicitly categorized support in the valuation month", () => {
    const p = fixtureProfile({ expenses: { status: "KNOWN", entries: [expense(), expense({ id: "once", amount: known("2000000"), frequency: "ONCE", startMonth: "2026-10", endMonth: "2026-10" }), expense({ id: "future", startMonth: "2027-01" }), expense({ id: "expired", endMonth: "2026-09" }), expense({ id: "living", category: "ESSENTIAL", amount: known("16000000") })] } });
    const report = profileFamilyReport(p, 1);
    expect(report.monthlySupport).toBe("5000000"); expect(report.supportEntries).toHaveLength(4); expect(report.supportEntries.map(row => row.active)).toEqual([true, true, false, false]);
    expect(profileV2Summary(p).values.monthlyExpense).toBe("21000000");
  });
  it.each([[unknown, null], [empty(), "0"], [{ status: "NOT_APPLICABLE", reason: "None" }, "0"]] as const)("keeps expense group completeness %j distinct", (expenses, expected) => {
    expect(profileFamilyReport(fixtureProfile({ expenses }), 1).monthlySupport).toBe(expected);
  });
  it("keeps unknown, foreign and large support amounts precise without inventing conversion", () => {
    for (const row of [expense({ amount: unknown }), expense({ currency: "USD" })]) expect(profileFamilyReport(fixtureProfile({ expenses: { status: "KNOWN", entries: [row] } }), 1).monthlySupport).toBeNull();
    expect(profileFamilyReport(fixtureProfile({ expenses: { status: "KNOWN", entries: [expense({ amount: known("9007199254740993.25") })] } }), 1).monthlySupport).toBe("9007199254740993.25");
    expect(profileFamilyReport(fixtureProfile({ expenses: { status: "KNOWN", entries: [expense({ amount: unknown, startMonth: "2027-01" })] } }), 1).monthlySupport).toBe("0");
  });
  it("does not infer financial changes from headcount or marital status", () => {
    const p = retirementProfile(), before = structuredClone(p), { policy, assumptions } = retirementConfiguration();
    const next = { ...p, ...familyChanges(p, { ...input, dependents: known(30) }) };
    expect(next.income).toEqual(p.income); expect(next.expenses).toEqual(p.expenses); expect(next.goals).toEqual(p.goals); expect(next.assets).toEqual(p.assets);
    expect(profileV2Summary(next)).toEqual(profileV2Summary(p));
    expect(prepareRetirement(next, retirementCommand(), policy, assumptions)).toEqual(prepareRetirement(p, retirementCommand(), policy, assumptions)); expect(p).toEqual(before);
  });
});
describe("family workspace HTTP with memory database", () => {
  it("saves, reloads and explicitly clears with CAS, preserves other data and does not apply plans", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() }, before = await f.profiles.getProfile("test-user");
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } });
    expect((await request(f.app).patch("/api/v1/me/financial-profile/family").set(headers).send(input)).status).toBe(200);
    expect((await request(f.app).patch("/api/v1/me/financial-profile/family").set(headers).send(input)).status).toBe(409);
    let report = await request(f.app).get("/api/v1/me/financial-profile/family").set(headers);
    expect(report.body.data).toMatchObject({ profileRevision: 2, maritalStatus: "DIVORCED", dependents: known(2), monthlySupport: "0" });
    await f.profiles.patchFamily("test-user", { ...input, expectedRevision: 2, maritalStatus: null, dependents: unknown });
    report = await request(f.app).get("/api/v1/me/financial-profile/family").set(headers); expect(report.body.data).toMatchObject({ profileRevision: 3, maritalStatus: null, dependents: unknown });
    const after = await f.profiles.getProfile("test-user"), original = profileV2Schema.parse(before!.data), saved = profileV2Schema.parse(after!.data);
    expect(saved.income).toEqual(original.income); expect(saved.expenses).toEqual(original.expenses); expect(saved.debts).toEqual(original.debts);
    expect(f.rows("retirementPlan")[0]).toMatchObject({ stale: true, currentVersionId: "frozen" });
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as any, validate = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } }).compile(doc.components.schemas.FamilyReportEnvelope);
    expect(validate(report.body), JSON.stringify(validate.errors)).toBe(true);
  });
  it("enforces USER-only access, ownership and strict request validation", async () => {
    const f = await setup();
    expect((await request(f.app).get("/api/v1/me/financial-profile/family")).status).toBe(401);
    expect((await request(f.app).get("/api/v1/me/financial-profile/family").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    expect((await request(f.app).patch("/api/v1/me/financial-profile/family").set("Authorization", "Bearer " + token()).send({ ...input, dependents: known(31) })).status).toBe(400);
    await expect(f.profiles.getFamily("another-user")).rejects.toMatchObject({ status: 404 });
    await expect(f.profiles.patchFamily("another-user", input)).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back personal changes, audit and plan staleness when outbox fails", async () => {
    const f = await setup(), before = await f.profiles.getProfile("test-user");
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } }); f.failWrites("outboxEvent");
    await expect(f.profiles.patchFamily("test-user", input)).rejects.toThrow(); expect(await f.profiles.getProfile("test-user")).toEqual(before); expect(f.rows("retirementPlan")[0].stale).toBe(false);
  });
  it("requires explicit v2 upgrade for legacy family changes", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db); await profiles.saveDraft("test-user", 0, "summary", legacyProfileFixture); await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    await expect(profiles.getFamily("test-user")).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" }); await expect(profiles.patchFamily("test-user", input)).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
  });
});
