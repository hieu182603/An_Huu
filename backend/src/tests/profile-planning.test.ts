import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { createApp } from "../app";
import { ProfileService } from "../modules/profiles/service";
import { AuthService } from "../modules/auth/service";
import { planningChanges, planningPatchSchema, planningReportSchema, profilePlanningReport } from "../modules/profiles/planning";
import { profileV2Schema } from "../modules/profiles/schema-v2";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { prepareRetirement } from "../modules/retirement/prepare";
import { separateCapital } from "../modules/capital/separation";
import { ratePercentSchema } from "../modules/assumptions/schema";
import { fixtureProfile, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";
import { assumptionFixture } from "./assumptions-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";

const goal = (id = "education") => ({ id, label: "Quỹ học vấn", amountToday: known("100000000.25"), dueMonth: known("2027-10"), inflation: known("4.25"), priority: known("FLEXIBLE" as const), deferrable: { status: "KNOWN" as const, value: true } });
const input = () => ({ expectedRevision: 1, careResponsibility: known("BOTH" as const), liquidityNeeds: { y1: known("50000000"), y3: known("100000000"), y5: known("150000000") }, goals: { status: "KNOWN" as const, entries: [goal(), { ...goal("legacy"), label: "Để lại tài sản", priority: known("LEGACY" as const), deferrable: unknown, dueMonth: known("2035-10"), inflation: unknown }] } });
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
async function setup() {
  const f = memoryDb(), profiles = new ProfileService(f.db), auth = new AuthService(f.db, config);
  const user = await f.db.user.create({ data: { id: "test-user", role: "USER", status: "ACTIVE", email: "planning@example.test", fullName: "Fixture", passwordHash: "unused" } });
  await profiles.saveDraft(user.id, 0, "summary", fixtureProfile()); await profiles.complete(user.id, { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  vi.spyOn(auth, "validateSession").mockResolvedValue(user);
  return { ...f, profiles, app: createApp({ config, services: { profiles, auth } }) };
}
describe("planning declarations", () => {
  it("keeps missing data unknown, preserves personal declarations and does not mutate inputs", () => {
    const p = fixtureProfile(), before = structuredClone(p), changes = planningChanges(p, input());
    expect(profilePlanningReport(p, 1)).toMatchObject({ profileRevision: 1, valuationDate: p.valuationDate, careResponsibility: unknown, liquidityNeeds: { y1: unknown, y3: unknown, y5: unknown }, goals: unknown });
    expect(changes.personal).toMatchObject({ ...p.personal, careResponsibility: known("BOTH") }); expect(p).toEqual(before);
    expect(planningReportSchema.safeParse(profilePlanningReport({ ...p, ...changes }, 2)).success).toBe(true);
    expect(profileV2Schema.safeParse(p).success).toBe(true);
  });
  it.each(["SELF", "CHILDREN", "PARENTS", "BOTH", "OTHER"])("accepts care responsibility %s without changing dependents or expenses", value => {
    const p = fixtureProfile({ personal: { ...fixtureProfile().personal, dependents: known(7), maritalStatus: "DIVORCED" } });
    const next = planningChanges(p, planningPatchSchema.parse({ ...input(), careResponsibility: known(value) }));
    expect(next.personal).toMatchObject({ dependents: known(7), maritalStatus: "DIVORCED", careResponsibility: known(value) }); expect("expenses" in next).toBe(false);
  });
  it.each([["20", "10", "30"], ["20", null, "10"], [null, "30", "20"]])("rejects decreasing known cumulative needs %j/%j/%j", (y1, y3, y5) => {
    const value = (v: string | null) => v === null ? unknown : known(v);
    expect(planningPatchSchema.safeParse({ ...input(), liquidityNeeds: { y1: value(y1), y3: value(y3), y5: value(y5) } }).success).toBe(false);
  });
  it("keeps blank, zero, sparse declarations and exact large decimals distinct", () => {
    const values = { y1: known("0"), y3: unknown, y5: known("9007199254740993.25") };
    const parsed = planningPatchSchema.parse({ ...input(), liquidityNeeds: values });
    expect(parsed.liquidityNeeds).toEqual(values);
    expect(profilePlanningReport({ ...fixtureProfile(), ...planningChanges(fixtureProfile(), { ...parsed, careResponsibility: unknown, goals: unknown }) }, 2)).toMatchObject({ careResponsibility: unknown, liquidityNeeds: values, goals: unknown });
  });
  it.each(["-1", "abc", "1.000.000", "1.234", "10000000000000000", "NaN"])("rejects malformed money %s without throwing a Decimal error", value => {
    expect(planningPatchSchema.safeParse({ ...input(), liquidityNeeds: { y1: known(value), y3: known("20"), y5: known("30") } }).success).toBe(false);
  });
  it.each(["not-a-rate", "-100", "100.1", "1e2"])("rejects invalid goal inflation %s as validation, not an exception", value => {
    expect(ratePercentSchema.safeParse(value).success).toBe(false);
    expect(planningPatchSchema.safeParse({ ...input(), goals: { status: "KNOWN", entries: [{ ...goal(), inflation: known(value) }] } }).success).toBe(false);
  });
  it("requires explicit fields and rejects profile, expense and financial benchmark overrides", () => {
    for (const extra of [{ expenses: empty() }, { monthlyReserve: "1" }, { expectedReturn: "10" }, { personal: { maritalStatus: "OTHER" } }]) expect(planningPatchSchema.safeParse({ ...input(), ...extra }).success).toBe(false);
    expect(planningPatchSchema.safeParse({ expectedRevision: 1, liquidityNeeds: input().liquidityNeeds }).success).toBe(false);
    expect(planningPatchSchema.safeParse({ ...input(), careResponsibility: known("unsupported") }).success).toBe(false);
  });
  it("uses goal capital once, never sums the three liquidity horizons or creates cash expenses", () => {
    const p = retirementProfile(), { policy, assumptions } = retirementConfiguration(), before = structuredClone(p);
    const baseline = { ...p, goals: empty(), incomeStability: known("STABLE" as const) };
    const command = { ...input(), goals: { status: "KNOWN" as const, entries: [{ ...goal(), amountToday: known("100"), dueMonth: known(p.valuationDate.slice(0, 7)) }] } };
    const next = { ...baseline, ...planningChanges(baseline, command) };
    expect(separateCapital(baseline, assumptionFixture()).nearTermGoalsPresentValue).toBe("0");
    const result = separateCapital(next, assumptionFixture()); expect(result.nearTermGoalsPresentValue).toBe("100");
    expect(result.warnings).toContainEqual({ path: "liquidityNeeds", code: "LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION" });
    expect(profileV2Summary(next)).toEqual(profileV2Summary(baseline)); expect(prepareRetirement(next, retirementCommand(), policy, assumptions)).toEqual(prepareRetirement(baseline, retirementCommand(), policy, assumptions)); expect(p).toEqual(before);
  });
});
describe("planning HTTP with memory database", () => {
  it("saves every goal and metadata, reloads, protects CAS and keeps the applied plan frozen", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() }, before = profileV2Schema.parse((await f.profiles.getProfile("test-user"))!.data);
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } });
    expect((await request(f.app).patch("/api/v1/me/financial-profile/planning").set(headers).send(input())).status).toBe(200);
    expect((await request(f.app).patch("/api/v1/me/financial-profile/planning").set(headers).send(input())).status).toBe(409);
    const report = await request(f.app).get("/api/v1/me/financial-profile/planning").set(headers);
    expect(report.body.data).toMatchObject({ profileRevision: 2, goals: input().goals, liquidityNeeds: input().liquidityNeeds, careResponsibility: known("BOTH") });
    const after = profileV2Schema.parse((await f.profiles.getProfile("test-user"))!.data);
    for (const key of ["income", "expenses", "assets", "debts", "pension", "lossTolerance", "incomeStability", "employerConcentration"] as const) expect(after[key]).toEqual(before[key]);
    expect(f.rows("retirementPlan")[0]).toMatchObject({ currentVersionId: "frozen", stale: true });
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as any, validate = new Ajv({ strict: false, formats: { uuid: true, date: true, "date-time": true } }).compile(doc.components.schemas.PlanningReportEnvelope);
    expect(validate(report.body), JSON.stringify(validate.errors)).toBe(true);
  });
  it("explicitly clears care/needs and distinguishes goal UNKNOWN, empty and confirmed none", async () => {
    const f = await setup(); await f.profiles.patchPlanning("test-user", input());
    let revision = 2;
    for (const goals of [unknown, empty(), { status: "NOT_APPLICABLE" as const, reason: "Không có mục tiêu khác" }]) {
      await f.profiles.patchPlanning("test-user", { expectedRevision: revision++, careResponsibility: unknown, liquidityNeeds: { y1: unknown, y3: unknown, y5: known("0") }, goals });
      expect(await f.profiles.getPlanning("test-user")).toMatchObject({ profileRevision: revision, careResponsibility: unknown, liquidityNeeds: { y1: unknown, y3: unknown, y5: known("0") }, goals });
    }
  });
  it("rejects duplicate goal IDs, past dates, malformed inflation and invalid cumulative inputs atomically", async () => {
    const f = await setup(), before = await f.profiles.getProfile("test-user"), headers = { Authorization: "Bearer " + token() };
    for (const changes of [
      { goals: { status: "KNOWN", entries: [goal(), goal()] } }, { goals: { status: "KNOWN", entries: [{ ...goal(), dueMonth: known("2026-09") }] } },
      { goals: { status: "KNOWN", entries: [{ ...goal(), inflation: known("abc") }] } }, { liquidityNeeds: { y1: known("30"), y3: unknown, y5: known("20") } },
    ]) expect((await request(f.app).patch("/api/v1/me/financial-profile/planning").set(headers).send({ ...input(), ...changes })).status).toBe(400);
    expect(await f.profiles.getProfile("test-user")).toEqual(before);
  });
  it("enforces USER access, ownership and a v2 upgrade without changing legacy data", async () => {
    const f = await setup();
    expect((await request(f.app).get("/api/v1/me/financial-profile/planning")).status).toBe(401);
    expect((await request(f.app).patch("/api/v1/me/financial-profile/planning").set("Authorization", "Bearer " + token("ADMIN")).send(input())).status).toBe(403);
    await expect(f.profiles.getPlanning("another-user")).rejects.toMatchObject({ status: 404 }); await expect(f.profiles.patchPlanning("another-user", input())).rejects.toMatchObject({ status: 404 });
    const legacy = memoryDb(), profiles = new ProfileService(legacy.db); await profiles.saveDraft("test-user", 0, "summary", legacyProfileFixture); await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    const before = await profiles.getProfile("test-user"); await expect(profiles.getPlanning("test-user")).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" }); await expect(profiles.patchPlanning("test-user", input())).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" }); expect(await profiles.getProfile("test-user")).toEqual(before);
  });
  it("rolls back profile and plan staleness when the outbox write fails", async () => {
    const f = await setup(), before = await f.profiles.getProfile("test-user"); await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } }); f.failWrites("outboxEvent");
    await expect(f.profiles.patchPlanning("test-user", input())).rejects.toThrow(); expect(await f.profiles.getProfile("test-user")).toEqual(before); expect(f.rows("retirementPlan")[0]).toMatchObject({ currentVersionId: "frozen", stale: false });
  });
});
