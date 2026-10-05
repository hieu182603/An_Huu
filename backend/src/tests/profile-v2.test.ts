import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { profileV2Schema, partialProfileV2Schema, dateSchema } from "../modules/profiles/schema-v2";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { ProfileService } from "../modules/profiles/service";
import { AuthService } from "../modules/auth/service";
import { createApp } from "../app";
import { config } from "./helpers";
import { memoryDb } from "./memory-db";
import { fixtureProfile, fixtureAsset, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T01 explicit financial data", () => {
  it("keeps missing inputs unknown and blocks only dependent metrics", () => {
    const data = fixtureProfile({ income: unknown });
    expect(profileV2Summary(data).values).toMatchObject({ monthlyIncome: null, availableMonthlySurplus: null, retirementLiquidAssets: "60000000", monthlyExpense: "16000000" });
    const zero = fixtureProfile({ income: empty(), debts: { status: "NOT_APPLICABLE", reason: "Đã xác nhận không có nợ" } });
    expect(profileV2Summary(zero).values).toMatchObject({ monthlyIncome: "0", monthlyDebtService: "0", availableMonthlySurplus: "-16000000" });
    expect(partialProfileV2Schema.parse({ schemaVersion: 2 })).toEqual({ schemaVersion: 2 });
  });
  it("distinguishes an explicitly entered zero from an unknown amount in the same row", () => {
    const data = fixtureProfile();
    if (data.income.status !== "KNOWN") throw new Error("fixture");
    data.income.entries[0].amount = known("0");
    expect(profileV2Summary(profileV2Schema.parse(data)).values.monthlyIncome).toBe("0");
    data.income.entries[0].amount = unknown;
    expect(profileV2Summary(profileV2Schema.parse(data)).values.monthlyIncome).toBeNull();
  });
  it("rejects inverted periods, multi-month one-off income and duplicated shared loans", () => {
    const data = fixtureProfile();
    if (data.income.status !== "KNOWN" || data.debts.status !== "KNOWN") throw new Error("fixture");
    const income = data.income.entries[0];
    income.endMonth = "2025-12";
    expect(profileV2Schema.safeParse(data).success).toBe(false);
    income.endMonth = "2026-12"; income.frequency = "ONCE";
    expect(profileV2Schema.safeParse(data).success).toBe(false);
    income.frequency = "MONTHLY";
    data.debts.entries.push({ ...data.debts.entries[0], id: "duplicate-loan" });
    expect(profileV2Schema.safeParse(data).success).toBe(false);
  });
  it("does not accept empty, numeric, negative or concealed unknown money", () => {
    for (const value of ["", 0, "-1", "1e8"]) expect(profileV2Schema.safeParse({ ...fixtureProfile(), assets: { status: "KNOWN", entries: [{ ...fixtureAsset(), value: known(value) }] } }).success).toBe(false);
    expect(profileV2Schema.safeParse({ ...fixtureProfile(), assets: { status: "UNKNOWN", entries: [] } }).success).toBe(false);
    expect(profileV2Schema.safeParse({ ...fixtureProfile(), inflationRate: 4 }).success).toBe(false);
    expect(profileV2Schema.safeParse({ ...fixtureProfile(), income: { status: "NOT_APPLICABLE" } }).success).toBe(false);
  });
  it("separates ownership, emergency savings and other goals from retirement money", () => {
    const data = fixtureProfile({ assets: { status: "KNOWN", entries: [fixtureAsset({ ownershipShare: known("0.5") })] } });
    expect(profileV2Summary(data).values).toMatchObject({ totalAssets: "50000000", totalDebt: "50000000", netWorth: "0", retirementLiquidAssets: "30000000", monthlyDebtService: "5000000", availableMonthlySurplus: "-1000000" });
  });
  it("keeps exact large fractional ownership without intermediate rounding", () => {
    const data = fixtureProfile({ assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("9007199254740993.25"), ownershipShare: known("0.12345678"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] }, debts: empty() });
    // Independent integer arithmetic: 900719925474099325 * 12345678 / 10^10.
    expect(profileV2Summary(data).values.retirementLiquidAssets).toBe("1111999816808722.760646735");
  });
  it("uses the actual month and does not perpetuate one-off cash flows", () => {
    const data = fixtureProfile();
    data.income = { status: "KNOWN", entries: [{ id: "bonus", label: "Thưởng", kind: "BONUS", basis: "DISPOSABLE", currency: "VND", amount: known("1000000"), frequency: "ONCE", startMonth: "2026-10", endMonth: "2026-10" }] };
    expect(profileV2Summary(data).values.monthlyIncome).toBe("1000000");
    expect(profileV2Summary({ ...data, valuationDate: "2026-11-01" }).values.monthlyIncome).toBe("0");
    expect(dateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(profileV2Schema.safeParse({ ...data, personal: { ...data.personal, birthMonth: known("2026-11") } }).success).toBe(false);
  });
  it("does not invent FX rates or mix valuation dates", () => {
    for (const asset of [fixtureAsset({ currency: "USD" }), fixtureAsset({ valuedOn: known("2026-10-03") }), fixtureAsset({ value: unknown })]) {
      const result = profileV2Summary(fixtureProfile({ assets: { status: "KNOWN", entries: [asset] } }));
      expect(result.values.totalAssets).toBeNull();
      expect(result.values.netWorth).toBeNull();
      expect(result.values.retirementLiquidAssets).toBeNull();
      expect(result.values.monthlyIncome).toBe("20000000");
    }
  });
  it("excludes homes and unavailable assets without inventing rental income", () => {
    for (const asset of [fixtureAsset({ type: "PRIMARY_HOME" }), fixtureAsset({ liquidity: known("LOCKED") }), fixtureAsset({ availableFromMonth: known("2026-11") })])
      expect(profileV2Summary(fixtureProfile({ assets: { status: "KNOWN", entries: [asset] } })).values.retirementLiquidAssets).toBe("0");
    const home = fixtureAsset({ type: "PRIMARY_HOME", housingPlan: { status: "CONFIRMED", kind: "RENT", startMonth: "2026-11", netAmount: known("5000000") } });
    expect(profileV2Summary(fixtureProfile({ assets: { status: "KNOWN", entries: [home] } })).values.monthlyIncome).toBe("20000000");
  });
  it("rejects duplicate assets and allocation over 100 percent", () => {
    expect(profileV2Schema.safeParse({ ...fixtureProfile(), assets: { status: "KNOWN", entries: [fixtureAsset(), fixtureAsset()] } }).success).toBe(false);
    expect(profileV2Schema.safeParse({ ...fixtureProfile(), assets: { status: "KNOWN", entries: [fixtureAsset({ retirementShare: known("0.8") })] } }).success).toBe(false);
  });
  it("links debt expense once and rejects inconsistent declarations", () => {
    const data = fixtureProfile();
    const linked = { id: "debt-expense", label: "Trả vay", category: "DEBT_PAYMENT" as const, currency: "VND", amount: known<string>("5000000"), loanId: "loan", frequency: "MONTHLY" as const, startMonth: "2026-01", endMonth: "2030-12" };
    if (data.expenses.status !== "KNOWN") throw new Error("fixture");
    data.expenses.entries.push(linked);
    expect(profileV2Summary(profileV2Schema.parse(data)).values.availableMonthlySurplus).toBe("-1000000");
    linked.amount = known("10000000");
    expect(profileV2Schema.safeParse(data).success).toBe(false);
    linked.amount = known("5000000"); linked.loanId = "missing";
    expect(profileV2Schema.safeParse(data).success).toBe(false);
  });
});

describe("T01 profile persistence and HTTP boundaries (offline database)", () => {
  async function completed() {
    const f = memoryDb(), service = new ProfileService(f.db);
    await service.saveDraft("owner", 0, "summary", fixtureProfile());
    await service.complete("owner", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    return { ...f, service };
  }
  it("saves incomplete drafts, merges personal fields and replaces explicit states", async () => {
    const f = memoryDb(), service = new ProfileService(f.db);
    await service.saveDraft("owner", 0, "personal", { schemaVersion: 2, personal: { birthMonth: known("1990-04") }, assets: { status: "KNOWN", entries: [{ id: "unfinished-asset" }] } });
    await service.saveDraft("owner", 1, "personal", { schemaVersion: 2, personal: { desiredRetirementMonth: unknown } });
    expect(await service.getDraft("owner")).toMatchObject({ revision: 2, data: { schemaVersion: 2, personal: { birthMonth: known("1990-04"), desiredRetirementMonth: unknown } } });
    expect(await service.getDraft("owner")).toMatchObject({ data: { assets: { status: "KNOWN", entries: [{ id: "unfinished-asset" }] } } });
    await expect(service.complete("owner", { expectedDraftRevision: 2, expectedProfileRevision: 0 }, randomUUID())).rejects.toThrow();
    expect(await service.getDraft("owner")).not.toBeNull();
    expect(await service.getDraft("other")).toBeNull();
    await expect(service.saveDraft("owner", 1, "personal", { schemaVersion: 2 })).rejects.toMatchObject({ status: 409 });
  });
  it("reloads explicit zero/unknown and preserves valuation date when patching", async () => {
    const f = await completed();
    await f.service.patchProfile("owner", 1, { schemaVersion: 2, income: unknown });
    const reloaded = await new ProfileService(f.db).getProfile("owner");
    expect(reloaded).toMatchObject({ schemaVersion: 2, revision: 2, data: { income: unknown }, summary: { values: { monthlyIncome: null, retirementLiquidAssets: "60000000" } }, asOfDate: new Date("2026-10-04T00:00:00Z") });
    expect(f.rows("financialProfile")[0].netWorth).toBeNull();
    await expect(f.service.patchProfile("owner", 1, { schemaVersion: 2, income: empty() })).rejects.toMatchObject({ status: 409 });
    await expect(f.service.patchProfile("other", 2, { schemaVersion: 2 })).rejects.toMatchObject({ status: 404 });
    await expect(f.service.patchProfile("owner", 2, {})).rejects.toMatchObject({ code: "PROFILE_SCHEMA_MISMATCH" });
  });
  it("archives legacy input only on explicit complete v2 replacement", async () => {
    const f = memoryDb(), service = new ProfileService(f.db);
    await service.saveDraft("owner", 0, "summary", legacyProfileFixture);
    await service.complete("owner", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    expect(await service.getProfile("owner")).toMatchObject({ schemaVersion: 1, dataQuality: { status: "LEGACY_UNREVIEWED", unconfirmedZeroFields: expect.arrayContaining(["income.secondaryIncome"]) } });
    await expect(service.patchProfile("owner", 1, { schemaVersion: 2, income: unknown })).rejects.toThrow();
    await service.patchProfile("owner", 1, fixtureProfile({ assets: unknown }));
    expect(f.rows("financialProfile")[0].legacyProfileData).toEqual(legacyProfileFixture);
    expect(await service.getProfile("owner")).toMatchObject({ schemaVersion: 2, summary: { values: { totalAssets: null } } });
    expect((await service.getProfile("owner"))).not.toHaveProperty("legacyProfileData");
  });
  it("keeps replay idempotent and rolls back profile/draft changes on event failure", async () => {
    const f = memoryDb(), service = new ProfileService(f.db);
    await service.saveDraft("owner", 0, "summary", fixtureProfile({ income: unknown }));
    const command = { expectedDraftRevision: 1, expectedProfileRevision: 0 }, key = randomUUID();
    f.failWrites("outboxEvent");
    await expect(service.complete("owner", command, key)).rejects.toThrow();
    expect(f.rows("financialProfile")).toHaveLength(0);
    expect(f.rows("onboardingDraft")).toHaveLength(1);
    f.failWrites("");
    const response = await service.complete("owner", command, key);
    expect(await service.complete("owner", command, key)).toEqual(response);
    expect(f.rows("financialProfile")).toHaveLength(1);
    expect(f.rows("outboxEvent")).toHaveLength(1);
  });
  it("validates v2 input over HTTP with ownership and USER-only permissions", async () => {
    const f = memoryDb(), auth = new AuthService(f.db, config), profiles = new ProfileService(f.db);
    const user = await f.db.user.create({ data: { email: "profile-v2@example.test", fullName: "Fixture", role: "USER", status: "ACTIVE", passwordHash: "unused" } });
    const validateSession = vi.spyOn(auth, "validateSession").mockResolvedValue(user);
    const app = createApp({ config, services: { auth, profiles } });
    const document = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, date: true } });
    const contract = (name: string, body: unknown) => {
      const validate = ajv.compile(document.components.schemas[name]);
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    };
    const { token } = await import("./helpers");
    const headers = { Authorization: "Bearer " + token() };
    contract("ProfileEnvelope", (await request(app).get("/api/v1/me/financial-profile").set(headers)).body);
    let result = await request(app).put("/api/v1/me/onboarding-draft").set(headers).send({ expectedRevision: 0, step: "summary", data: fixtureProfile() });
    expect(result.status).toBe(200);
    contract("DraftEnvelope", result.body);
    result = await request(app).post("/api/v1/me/onboarding/complete").set(headers).set("Idempotency-Key", randomUUID()).send({ expectedDraftRevision: 1, expectedProfileRevision: 0 });
    expect(result.status).toBe(200);
    contract("CompleteResultEnvelope", result.body);
    result = await request(app).get("/api/v1/me/financial-profile").set(headers);
    expect(result.body.data.schemaVersion).toBe(2);
    contract("ProfileEnvelope", result.body);
    result = await request(app).patch("/api/v1/me/financial-profile").set(headers).send({ expectedRevision: 1, changes: { schemaVersion: 2, income: unknown } });
    expect(result.status).toBe(200);
    contract("ProfilePatchResultEnvelope", result.body);
    expect(f.rows("financialProfile")[0].userId).toBe("test-user");
    expect((await request(app).patch("/api/v1/me/financial-profile").set(headers).send({ expectedRevision: 1, changes: { schemaVersion: 2, userId: "other" } })).status).toBe(400);
    expect((await request(app).get("/api/v1/me/financial-profile").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    expect(validateSession).toHaveBeenCalled();
  });
});
