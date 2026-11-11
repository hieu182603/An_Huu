import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { Prisma } from "@prisma/client";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { assetChanges, assetPatchSchema } from "../modules/profiles/asset-commands";
import { profileAssetSummary, assetReportSchema } from "../modules/profiles/asset-summary";
import { profileV2Summary } from "../modules/profiles/summary-v2";
import { prepareRetirement } from "../modules/retirement/prepare";
import { fixtureProfile, fixtureAsset, known, unknown, empty, legacyProfileFixture } from "./profile-v2-fixtures";
import { retirementProfile, retirementCommand, retirementConfiguration } from "./retirement-fixtures";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
const D = Prisma.Decimal.clone({ precision: 48 });
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
const asset = () => fixtureAsset({ id: "new", label: "Tài sản mới", value: known("20000000") });
async function setup() {
  const f = memoryDb(), profiles = new ProfileService(f.db), auth = new AuthService(f.db, config);
  await profiles.saveDraft("test-user", 0, "summary", fixtureProfile({ debts: empty() }));
  await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  const user = await f.db.user.create({ data: { id: "test-user", role: "USER", status: "ACTIVE", email: "assets@example.test", fullName: "Fixture", passwordHash: "unused" } });
  vi.spyOn(auth, "validateSession").mockResolvedValue(user);
  return { ...f, profiles, app: createApp({ config, services: { profiles, auth } }) };
}
describe("owned assets report", () => {
  it("separates declared value, ownership and liquid purposes, including housing and unavailable capital", () => {
    const p = fixtureProfile({ assets: { status: "KNOWN", entries: [fixtureAsset({ ownershipShare: known("0.5") }), fixtureAsset({ id: "home", type: "PRIMARY_HOME", value: known("200000000") }), fixtureAsset({ id: "locked", liquidity: known("LOCKED"), value: known("50000000") })] }, debts: empty() });
    const report = profileAssetSummary(p, 7);
    expect(assetReportSchema.safeParse(report).success).toBe(true);
    expect(report.totals).toMatchObject({ declaredValue: "350000000", ownedValue: "300000000", retirementLiquidAssets: "30000000", emergencyReserve: "15000000", housingOwnedValue: "200000000", otherOwnedValue: "55000000", totalDebt: "0", netWorth: "300000000", reserveCoverageMonths: "0.9", debtToAssetsPercent: "0.0" });
    expect(report.entries[0].ownedValue).toBe("50000000");
    expect(report.entries[1].retirementLiquidAssets).toBe("0");
    expect(new D(report.totals.retirementLiquidAssets!).plus(report.totals.emergencyReserve!).plus(report.totals.housingOwnedValue!).plus(report.totals.otherOwnedValue!).toFixed()).toBe(report.totals.ownedValue);
    expect(report.profileRevision).toBe(7);
  });
  it.each([
    ["unknown", unknown, null], ["empty", empty(), "0"], ["none", { status: "NOT_APPLICABLE", reason: "Confirmed none" }, "0"],
  ] as const)("keeps %s assets distinct", (_name, assets, expected) => {
    const report = profileAssetSummary(fixtureProfile({ assets }), 1);
    expect(report.totals.ownedValue).toBe(expected); expect(report.totals.declaredValue).toBe(expected);
    expect(report.totals.emergencyReserve).toBe(expected);
  });
  it.each([
    ["partial ownership", fixtureAsset({ ownershipShare: unknown }), "100000000", null, null],
    ["locked", fixtureAsset({ liquidity: known("LOCKED") }), "100000000", "100000000", "0"],
    ["future", fixtureAsset({ availableFromMonth: known("2026-11") }), "100000000", "100000000", "0"],
    ["foreign", fixtureAsset({ currency: "USD" }), null, null, null],
    ["stale", fixtureAsset({ valuedOn: known("2026-10-03") }), null, null, null],
    ["unknown allocation", fixtureAsset({ emergencyShare: unknown }), "100000000", "100000000", null],
  ] as const)("does not invent %s values", (_name, entry, declared, owned, reserve) => {
    const report = profileAssetSummary(fixtureProfile({ assets: { status: "KNOWN", entries: [entry] } }), 1);
    expect(report.totals).toMatchObject({ declaredValue: declared, ownedValue: owned, emergencyReserve: reserve });
  });
  it("does not divide by zero expenses or zero assets and preserves negative net worth", () => {
    const zero = profileAssetSummary(fixtureProfile({ assets: empty(), expenses: empty() }), 1);
    expect(zero.coverageBasis).toBe("NO_EXPENSE"); expect(zero.totals.reserveCoverageMonths).toBeNull();
    expect(zero.totals.debtToAssetsPercent).toBeNull(); expect(zero.totals.netWorth).toBe("-50000000");
    expect(Object.values(zero.percentages)).toEqual(["0.0", "0.0", "0.0", "0.0"]);
    expect(profileAssetSummary(fixtureProfile({ expenses: unknown }), 1).coverageBasis).toBe("UNKNOWN");
  });
  it("does not alter existing retirement calculations, warnings or large decimal values", () => {
    const p = retirementProfile(), { policy, assumptions } = retirementConfiguration(), command = retirementCommand();
    const before = prepareRetirement(p, command, policy, assumptions), json = JSON.stringify(p);
    profileAssetSummary(p, 1);
    expect(JSON.stringify(p)).toBe(json); expect(prepareRetirement(p, command, policy, assumptions)).toEqual(before);
    const large = fixtureProfile({ assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("9007199254740993.25"), ownershipShare: known("0.12345678") })] } });
    expect(profileAssetSummary(large, 1).totals.ownedValue).toBe("1111999816808722.760646735");
  });
});
describe("asset mutations", () => {
  it("splits value without duplicating ownership, and may reallocate the new portion to reserves", () => {
    const p = fixtureProfile(), entry = fixtureAsset({ ...asset(), retirementShare: known("0"), emergencyShare: known("1"), otherGoalsShare: known("0") });
    const changed = { ...p, ...assetChanges(p, { kind: "SPLIT", sourceId: "deposit-1", entry }) };
    const before = profileAssetSummary(p, 1), after = profileAssetSummary(changed, 2);
    expect(after.totals.declaredValue).toBe(before.totals.declaredValue); expect(after.totals.ownedValue).toBe(before.totals.ownedValue);
    expect(after.totals.emergencyReserve).toBe("44000000"); expect(after.totals.retirementLiquidAssets).toBe("48000000");
  });
  it("allocates cost basis in cents and preserves the exact sum, including full splits", () => {
    const p = fixtureProfile({ assets: { status: "KNOWN", entries: [fixtureAsset({ value: known("3"), costBasis: known("1") })] } });
    const changed = assetChanges(p, { kind: "SPLIT", sourceId: "deposit-1", entry: fixtureAsset({ ...asset(), value: known("1"), costBasis: known("999") }) });
    if (changed.assets.status !== "KNOWN") throw Error("fixture");
    expect(changed.assets.entries.map(entry => entry.costBasis)).toEqual([known("0.67"), known("0.33")]);
    const full = assetChanges(p, { kind: "SPLIT", sourceId: "deposit-1", entry: fixtureAsset({ ...asset(), value: known("3") }) });
    if (full.assets.status !== "KNOWN") throw Error("fixture");
    expect(full.assets.entries).toHaveLength(1); expect(full.assets.entries[0].costBasis).toEqual(known("1"));
  });
  it("keeps unknown cost basis unknown and compares equivalent ownership fractions numerically", () => {
    const p = fixtureProfile({ assets: { status: "KNOWN", entries: [fixtureAsset({ costBasis: unknown })] } });
    const changed = assetChanges(p, { kind: "SPLIT", sourceId: "deposit-1", entry: fixtureAsset({ ...asset(), ownershipShare: known("1.0"), costBasis: known("999") }) });
    if (changed.assets.status !== "KNOWN") throw Error("fixture");
    expect(changed.assets.entries.map(entry => entry.costBasis)).toEqual([unknown, unknown]);
  });
  it("rejects zero-valued or missing split sources instead of inventing a residual", () => {
    for (const entry of [fixtureAsset({ ...asset(), value: known("0") }), fixtureAsset({ ...asset(), value: unknown })])
      expect(() => assetChanges(fixtureProfile(), { kind: "SPLIT", sourceId: "deposit-1", entry })).toThrow();
    expect(() => assetChanges(fixtureProfile(), { kind: "SPLIT", sourceId: "missing", entry: asset() })).toThrowError(expect.objectContaining({ code: "ASSET_SPLIT_SOURCE_REQUIRED" }));
  });
  it("rejects an overdrawn split", () => {
    expect(() => assetChanges(fixtureProfile(), { kind: "SPLIT", sourceId: "deposit-1", entry: fixtureAsset({ ...asset(), value: known("100000001") }) })).toThrowError(expect.objectContaining({ code: "ASSET_SPLIT_EXCEEDS_SOURCE" }));
  });
  it.each([
    fixtureAsset({ ...asset(), ownershipShare: known("0.5") }), fixtureAsset({ ...asset(), currency: "USD" }),
    fixtureAsset({ ...asset(), valuedOn: known("2026-10-03") }), fixtureAsset({ ...asset(), liquidity: known("LOCKED") }),
    fixtureAsset({ ...asset(), availableFromMonth: known("2026-11") }),
  ])("rejects splits with different valuation or availability basis", entry => {
    expect(() => assetChanges(fixtureProfile(), { kind: "SPLIT", sourceId: "deposit-1", entry })).toThrowError(expect.objectContaining({ code: "ASSET_SPLIT_BASIS_MISMATCH" }));
  });
  it("protects confirmed housing plans, preserves edit metadata and requires an explicit unknown-group confirmation", () => {
    const entry = fixtureAsset({ type: "REAL_ESTATE", costBasis: known("40000000"), housingPlan: { status: "CONFIRMED", kind: "SALE", startMonth: "2027-01", netAmount: known("90000000") } });
    const p = fixtureProfile({ assets: { status: "KNOWN", entries: [entry] } });
    expect(() => assetChanges(p, { kind: "SPLIT", sourceId: entry.id, entry: asset() })).toThrowError(expect.objectContaining({ code: "ASSET_SPLIT_HOUSING_PLAN" }));
    const updated = assetChanges(p, { kind: "UPDATE", entry: { ...entry, label: "Nhà cập nhật" } });
    expect(updated.assets.status === "KNOWN" && updated.assets.entries[0]).toMatchObject({ housingPlan: entry.housingPlan, costBasis: entry.costBasis });
    const missing = fixtureProfile({ assets: unknown });
    expect(() => assetChanges(missing, { kind: "ADD", entry: asset() })).toThrowError(expect.objectContaining({ code: "ASSET_COMPLETENESS_REQUIRED" }));
    expect(assetChanges(missing, { kind: "ADD", entry: asset(), confirmUnknownGroup: true }).assets.status).toBe("KNOWN");
  });
  it("rejects invalid allocation, malformed money, ID reuse and nonempty clear", () => {
    expect(assetPatchSchema.safeParse({ expectedRevision: 1, command: { kind: "ADD", entry: { ...asset(), value: known("-1") } } }).success).toBe(false);
    expect(assetPatchSchema.safeParse({ expectedRevision: 1, command: { kind: "ADD", entry: { ...asset(), retirementShare: known("0.8") } } }).success).toBe(false);
    expect(() => assetChanges(fixtureProfile(), { kind: "ADD", entry: fixtureAsset() })).toThrowError(expect.objectContaining({ code: "ASSET_DUPLICATE_ID" }));
    expect(() => assetChanges(fixtureProfile(), { kind: "CONFIRM_NONE", reason: "none" })).toThrowError(expect.objectContaining({ code: "ASSETS_NOT_EMPTY" }));
  });
});
describe("asset HTTP persistence with memory database", () => {
  it("requires explicit v2 upgrade for legacy asset reports and mutations", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("test-user", 0, "summary", legacyProfileFixture);
    await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
    await expect(profiles.getAssets("test-user")).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
    await expect(profiles.patchAssets("test-user", { expectedRevision: 1, command: { kind: "ADD", entry: asset() } })).rejects.toMatchObject({ code: "PROFILE_V2_REQUIRED" });
  });
  it("adds, edits, splits, deletes, reloads and validates the authoritative report without applying a plan", async () => {
    const f = await setup(), headers = { Authorization: "Bearer " + token() };
    const doc = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const validate = new Ajv({ strict: false, formats: { uuid: true, "date-time": true, date: true } }).compile(doc.components.schemas.AssetReportEnvelope);
    const write = (expectedRevision: number, command: unknown) => request(f.app).patch("/api/v1/me/financial-profile/assets").set(headers).send({ expectedRevision, command });
    await f.db.retirementPlan.create({ data: { id: "main", userId: "test-user", currentVersionId: "frozen", stale: false } });
    expect((await write(1, { kind: "ADD", entry: asset() })).status).toBe(200);
    expect((await write(1, { kind: "DELETE", id: "new" })).status).toBe(409);
    expect((await write(2, { kind: "UPDATE", entry: fixtureAsset({ ...asset(), value: known("30000000"), ownershipShare: known("0.5") }) })).status).toBe(200);
    expect((await write(3, { kind: "SPLIT", sourceId: "deposit-1", entry: fixtureAsset({ ...asset(), id: "split", value: known("10000000") }) })).status).toBe(200);
    expect((await write(4, { kind: "DELETE", id: "split" })).status).toBe(200);
    const response = await request(f.app).get("/api/v1/me/financial-profile/assets").set(headers);
    expect(response.status).toBe(200); expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    expect(response.body.data).toMatchObject({ profileRevision: 5, totals: { declaredValue: "120000000", ownedValue: "105000000", retirementLiquidAssets: "63000000", emergencyReserve: "31500000", netWorth: "105000000" } });
    expect(f.rows("retirementPlan")[0]).toMatchObject({ stale: true, currentVersionId: "frozen" });
    expect((await request(f.app).get("/api/v1/me/financial-profile/assets").set("Authorization", "Bearer " + token("ADMIN"))).status).toBe(403);
    await expect(f.profiles.getAssets("other-user")).rejects.toMatchObject({ status: 404 });
    await expect(f.profiles.patchAssets("other-user", { expectedRevision: 5, command: { kind: "DELETE", id: "new" } })).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back on an event failure and keeps deleting the last asset distinct from unknown", async () => {
    const f = await setup(), before = await f.profiles.getProfile("test-user");
    f.failWrites("outboxEvent");
    await expect(f.profiles.patchAssets("test-user", { expectedRevision: 1, command: { kind: "DELETE", id: "deposit-1" } })).rejects.toThrow();
    expect(await f.profiles.getProfile("test-user")).toEqual(before);
    f.failWrites(""); await f.profiles.patchAssets("test-user", { expectedRevision: 1, command: { kind: "DELETE", id: "deposit-1" } });
    expect(await f.profiles.getAssets("test-user")).toMatchObject({ assetState: "KNOWN", totals: { declaredValue: "0", ownedValue: "0", emergencyReserve: "0" } });
    expect(profileV2Summary(fixtureProfile({ assets: unknown })).values.totalAssets).toBeNull();
  });
});
