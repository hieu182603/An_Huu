import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { AssumptionDecimal as D, validateConfiguration, resolveYearSeries, normalizedAnnualReturn } from "../modules/assumptions/series";
import { assumptionDocumentSchema } from "../modules/assumptions/schema";
import { AssumptionsService } from "../modules/assumptions/service";
import { assumptionFixture, seriesFixture } from "./assumptions-fixtures";
import { memoryDb } from "./memory-db";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { createApp } from "../app";
import { config, token } from "./helpers";

const now = () => new Date("2026-10-04T12:00:00Z");
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T03 annual series validation and normalization", () => {
  it("separates historical CPI, forecast and long-term years at the year boundary", () => {
    const result = resolveYearSeries(assumptionFixture(), seriesFixture);
    expect(result.status).toBe("READY");
    expect(result.months[0]).toMatchObject({ month: "2026-12", inflationAnnualPercent: "0", returnAnnualNetNominalPercent: "0" });
    expect(result.months[1]).toMatchObject({ month: "2027-01", inflationAnnualPercent: "4", returnAnnualNetNominalPercent: "10", inflationKind: "FORECAST" });
    expect(result.months[13]).toMatchObject({ month: "2028-01", inflationAnnualPercent: "3", inflationKind: "LONG_TERM", inflationSourceId: "LONG" });
    // Independent annual cash checks: all 12 month factors compound to 1.04/1.10, not CPI 90% history.
    const year = result.months.slice(1, 13);
    expect(year.reduce((v, r) => v.mul(r.inflationMonthlyFactor), new D(100)).toNumber()).toBeCloseTo(104, 12);
    expect(year.reduce((v, r) => v.mul(r.returnMonthlyFactor), new D(100)).toNumber()).toBeCloseTo(110, 12);
  });
  it("converts real to nominal once and applies only explicit fees/taxes", () => {
    const data = assumptionFixture(), row = data.returns[1]; row.priceBasis = "REAL";
    row.fees = { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "1", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Approved net asset fee drag" };
    row.taxes = { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "0.4", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Approved effective annual tax drag" };
    expect(normalizedAnnualReturn(row, "4")?.toFixed()).toBe("0.13"); // 1.10*1.04 - 1 - .01 - .004
    row.priceBasis = "NOMINAL";
    expect(normalizedAnnualReturn(row, "4")?.toFixed()).toBe("0.086");
  });
  it("honors nominal compounding frequency and negative effective annual rates", () => {
    const data = assumptionFixture(), row = data.returns[1];
    row.rate = { type: "NOMINAL_ANNUAL", percent: "12", compoundsPerYear: 12 };
    expect(normalizedAnnualReturn(row, "4")?.toNumber()).toBeCloseTo(0.1268250301319697, 14);
    row.rate = { type: "EFFECTIVE_ANNUAL", percent: "-20" };
    expect(resolveYearSeries(data, seriesFixture).months[1].returnAnnualNetNominalPercent).toBe("-20");
    expect(assumptionDocumentSchema.safeParse({ ...data, returns: [{ ...row, rate: { type: "EFFECTIVE_ANNUAL", percent: "-100" } }] }).success).toBe(false);
  });
  it("saves incomplete drafts but reports every missing projection year", () => {
    const data = assumptionFixture(); data.inflation.splice(1, 1); data.returns.pop();
    expect(assumptionDocumentSchema.safeParse(data).success).toBe(true);
    expect(validateConfiguration(data).issues).toEqual(expect.arrayContaining([
      { path: "inflation.2027", code: "YEAR_REQUIRED" }, { path: "returns.2028.BOND.ALL", code: "YEAR_REQUIRED" },
    ]));
    expect(resolveYearSeries(data, seriesFixture)).toMatchObject({ status: "INCOMPLETE", months: [] });
  });
  it("refuses duplicates, overlapping horizons and extrapolation beyond a source", () => {
    const data = assumptionFixture();
    data.inflation.push(data.inflation[0]); data.assetClasses[0].horizons.push({ id: "OVERLAP", minMonths: 10, maxMonths: 20 });
    data.sources[1].toYear = 2026;
    const codes = validateConfiguration(data).issues.map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(["DUPLICATE_ENTRY", "OVERLAPPING_HORIZONS", "OUTSIDE_SOURCE_COVERAGE"]));
  });
  it("never relabels history as forecasts or long term as external forecasts", () => {
    const data = assumptionFixture(); data.inflation[0].sourceId = "HISTORY"; data.inflation[2].sourceId = "FORECAST";
    expect(validateConfiguration(data).issues.filter(i => i.code === "SOURCE_KIND_MISMATCH")).toHaveLength(2);
    data.inflation[0].kind = "LONG_TERM";
    expect(validateConfiguration(data).issues).toContainEqual({ path: "inflation", code: "FORECAST_AFTER_LONG_TERM" });
  });
  it("does not substitute a rate or cost when configuration is unknown", () => {
    const data = assumptionFixture(); data.returns[0].fees = { treatment: "UNKNOWN" };
    expect(validateConfiguration(data).issues).toContainEqual({ path: "returns.0", code: "COST_TREATMENT_REQUIRED" });
    expect(resolveYearSeries(data, seriesFixture).months).toEqual([]);
    expect(resolveYearSeries(assumptionFixture(), { ...seriesFixture, endMonth: "2029-01" }).issues).toContainEqual({ path: "startMonth", code: "PROJECTION_NOT_COVERED" });
    expect(resolveYearSeries(assumptionFixture(), { ...seriesFixture, assetClass: "UNKNOWN" }).status).toBe("INCOMPLETE");
  });
  it("selects asset horizon explicitly without inventing an age/risk allocation", () => {
    const data = assumptionFixture(); data.assetClasses[0].horizons[0].maxMonths = 60;
    data.assetClasses[0].horizons.push({ id: "LONG", minMonths: 61, maxMonths: 1200 });
    data.returns.push(...data.returns.map(row => ({ ...row, horizonId: "LONG", rate: { type: "EFFECTIVE_ANNUAL" as const, percent: "7" } })));
    expect(resolveYearSeries(data, { ...seriesFixture, horizonMonths: 60 }).months[0].returnAnnualNetNominalPercent).toBe("0");
    expect(resolveYearSeries(data, { ...seriesFixture, horizonMonths: 61 }).months[0].returnAnnualNetNominalPercent).toBe("7");
  });
  it("rejects combined fee drag erasing more than all principal and source lookahead", () => {
    const data = assumptionFixture(); data.returns[0].rate.percent = "-99";
    data.returns[0].fees = { treatment: "EXPLICIT_ANNUAL_DRAG", percent: "2", convention: "PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION", evidence: "Fixture fee" };
    data.sources[0].retrievedOn = "2027-01-01";
    expect(validateConfiguration(data).issues.map(i => i.code)).toEqual(expect.arrayContaining(["NET_RETURN_OUT_OF_RANGE", "SOURCE_AFTER_EFFECTIVE_DATE"]));
  });
});

describe("T03 version lifecycle", () => {
  function fixture() { const f = memoryDb(); return { ...f, service: new AssumptionsService(f.db, now) }; }
  async function approve(service: AssumptionsService, id: string, revision = 1) {
    const impact = await service.previewImpact("admin", id, { expectedRevision: revision });
    return service.approve("admin", id, { expectedRevision: revision, impactToken: impact.impactToken, reviewNote: "Reviewed fixture sources and yearly scope" });
  }
  it("requires review then approval, freezes publication and never updates current plans", async () => {
    const f = fixture();
    await f.db.retirementPlan.create({ data: { id: "plan", userId: "user", currentVersionId: "unchanged", stale: false } });
    const before = JSON.stringify(f.rows("retirementPlan"));
    const draft = await f.service.create("admin", assumptionFixture());
    await expect(f.service.publish("admin", draft.id, { expectedRevision: 1, confirm: true })).rejects.toMatchObject({ status: 409 });
    await expect(f.service.approve("admin", draft.id, { expectedRevision: 1, impactToken: "a".repeat(64), reviewNote: "Unchecked fixture" })).rejects.toMatchObject({ code: "IMPACT_REVIEW_REQUIRED" });
    const approved = await approve(f.service, draft.id);
    expect(approved).toMatchObject({ status: "APPROVED", revision: 2, approval: { actor: "admin" } });
    const published = await f.service.publish("admin", draft.id, { expectedRevision: 2, confirm: true });
    expect(published).toMatchObject({ status: "PUBLISHED", revision: 3, publishedBy: "admin" });
    expect(await f.service.list({ page: 2, limit: 20 }, true)).toMatchObject({ status: "AVAILABLE", total: 1, items: [] });
    await expect(f.service.patch("admin", draft.id, { expectedRevision: 3, data: assumptionFixture() })).rejects.toMatchObject({ status: 409 });
    expect(JSON.stringify(f.rows("retirementPlan"))).toBe(before);
    expect(f.rows("outboxEvent")).toHaveLength(0);
    expect(f.rows("auditLog").map(r => r.action)).toContain("ASSUMPTIONS_PUBLISHED");
  });
  it("invalidates reviewed tokens after an edit and checks the reviewing actor", async () => {
    const f = fixture(), draft = await f.service.create("admin", assumptionFixture());
    const preview = await f.service.previewImpact("admin", draft.id, { expectedRevision: 1 });
    await expect(f.service.approve("other-admin", draft.id, { expectedRevision: 1, impactToken: preview.impactToken, reviewNote: "Not my review" })).rejects.toMatchObject({ code: "IMPACT_REVIEW_REQUIRED" });
    await f.service.patch("admin", draft.id, { expectedRevision: 1, data: assumptionFixture() });
    await expect(f.service.approve("admin", draft.id, { expectedRevision: 2, impactToken: preview.impactToken, reviewNote: "Old review" })).rejects.toMatchObject({ code: "IMPACT_REVIEW_REQUIRED" });
    await expect(f.service.patch("admin", draft.id, { expectedRevision: 1, data: assumptionFixture() })).rejects.toMatchObject({ status: 409 });
  });
  it("replays old published rates exactly after publishing a newer version", async () => {
    const f = fixture(), first = await f.service.create("admin", assumptionFixture());
    await approve(f.service, first.id); await f.service.publish("admin", first.id, { expectedRevision: 2, confirm: true });
    const before = await f.service.resolve({ ...seriesFixture, versionId: first.id });
    const data = assumptionFixture(); data.inflation[1].percent = "8";
    const second = await f.service.create("admin", data);
    const impact = await f.service.previewImpact("admin", second.id, { expectedRevision: 1 });
    expect(impact.changes.before?.inflation[1].percent).toBe("4");
    await approve(f.service, second.id); await f.service.publish("admin", second.id, { expectedRevision: 2, confirm: true });
    expect(await f.service.resolve({ ...seriesFixture, versionId: first.id })).toEqual(before);
    expect((await f.service.resolve({ ...seriesFixture, versionId: second.id })).months[1].inflationAnnualPercent).toBe("8");
  });
  it("blocks incomplete approval, rolls back failed audit, and isolates legacy sets", async () => {
    const f = fixture(), data = assumptionFixture(); data.inflation = [];
    const draft = await f.service.create("admin", data);
    await expect(approve(f.service, draft.id)).rejects.toMatchObject({ code: "ASSUMPTIONS_INCOMPLETE" });
    f.failWrites("auditLog");
    await expect(f.service.create("admin", assumptionFixture())).rejects.toThrow("Injected");
    expect(f.rows("assumptionSetVersion")).toHaveLength(1);
    f.failWrites();
    const legacy = await f.db.assumptionSetVersion.create({ data: { version: 100, modelCode: "legacy", values: {}, policy: {}, source: [], createdBy: "old", reason: "old" } });
    await expect(f.service.get(legacy.id)).rejects.toMatchObject({ status: 404 });
    expect((await f.service.create("admin", assumptionFixture())).version).toBe(101);
  });
  it("hides drafts/future publications and returns explicit unconfigured state", async () => {
    const f = fixture(); expect((await f.service.list({ page: 1, limit: 20 }, true)).status).toBe("UNCONFIGURED");
    const data = assumptionFixture(); data.effectiveFrom = "2027-01-01";
    const draft = await f.service.create("admin", data);
    await expect(f.service.resolve({ ...seriesFixture, versionId: draft.id })).rejects.toMatchObject({ status: 404 });
    await approve(f.service, draft.id); await f.service.publish("admin", draft.id, { expectedRevision: 2, confirm: true });
    expect((await f.service.list({ page: 1, limit: 20 }, true)).items).toHaveLength(0);
    await expect(f.service.get(draft.id, true)).rejects.toMatchObject({ status: 404 });
  });
  it("requires a fresh review when another version is published", async () => {
    const f = fixture(), a = await f.service.create("admin", assumptionFixture()), b = await f.service.create("admin", assumptionFixture());
    await approve(f.service, a.id); await approve(f.service, b.id);
    await f.service.publish("admin", a.id, { expectedRevision: 2, confirm: true });
    await expect(f.service.publish("admin", b.id, { expectedRevision: 2, confirm: true })).rejects.toMatchObject({ code: "IMPACT_BASELINE_CHANGED" });
  });
  it("never publishes a lower version number after a newer version", async () => {
    const f = fixture(), old = await f.service.create("admin", assumptionFixture()), newer = await f.service.create("admin", assumptionFixture());
    await approve(f.service, newer.id); await f.service.publish("admin", newer.id, { expectedRevision: 2, confirm: true });
    await approve(f.service, old.id);
    await expect(f.service.publish("admin", old.id, { expectedRevision: 2, confirm: true })).rejects.toMatchObject({ code: "OLDER_VERSION" });
  });
  it("rejects altered approved data even if database JSON was changed outside the API", async () => {
    const f = fixture(), draft = await f.service.create("admin", assumptionFixture()); await approve(f.service, draft.id);
    f.rows("assumptionSetVersion")[0].values.inflation[0].percent = "9";
    await expect(f.service.publish("admin", draft.id, { expectedRevision: 2, confirm: true })).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
  it("does not resolve a published document whose approval checksum no longer matches", async () => {
    const f = fixture(), draft = await f.service.create("admin", assumptionFixture()); await approve(f.service, draft.id);
    await f.service.publish("admin", draft.id, { expectedRevision: 2, confirm: true });
    f.rows("assumptionSetVersion")[0].values.inflation[0].percent = "9";
    await expect(f.service.resolve({ ...seriesFixture, versionId: draft.id })).rejects.toMatchObject({ code: "ASSUMPTIONS_DATA_REVIEW_REQUIRED" });
  });
});

describe("T03 HTTP permissions", () => {
  it("allows ADMIN lifecycle and USER published selection; rejects overrides and unauthenticated requests", async () => {
    const f = memoryDb(), auth = new AuthService(f.db, config), assumptions = new AssumptionsService(f.db, now);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: "test-user", role: "ADMIN" } as never);
    const app = createApp({ config, services: { auth, profiles: new ProfileService(f.db), assumptions } });
    const specification = await SwaggerParser.dereference("docs/openapi.yaml") as unknown as { components: { schemas: Record<string, object> } };
    const ajv = new Ajv({ strict: false, formats: { uuid: true, uri: true, "date-time": true } });
    const conforms = (name: string, body: unknown) => {
      const validate = ajv.compile(specification.components.schemas["Assumption" + name + "Envelope"]);
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    };
    const admin = token("ADMIN"), user = token();
    expect((await request(app).post("/api/v1/admin/assumptions").send(assumptionFixture())).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/assumptions").set("Authorization", "Bearer " + user).send(assumptionFixture())).status).toBe(403);
    const created = await request(app).post("/api/v1/admin/assumptions").set("Authorization", "Bearer " + admin).send(assumptionFixture());
    expect(created.status).toBe(201); const id = created.body.data.id;
    conforms("Version", created.body);
    expect((await request(app).get("/api/v1/me/assumptions/" + id).set("Authorization", "Bearer " + user)).status).toBe(404);
    const impact = await request(app).post(`/api/v1/admin/assumptions/${id}/impact`).set("Authorization", "Bearer " + admin).send({ expectedRevision: 1 });
    expect(impact.status).toBe(200);
    conforms("Impact", impact.body);
    expect((await request(app).post(`/api/v1/admin/assumptions/${id}/approve`).set("Authorization", "Bearer " + admin).send({ expectedRevision: 1, impactToken: impact.body.data.impactToken, reviewNote: "Reviewed fixture annual data" })).status).toBe(200);
    expect((await request(app).post(`/api/v1/admin/assumptions/${id}/publish`).set("Authorization", "Bearer " + admin).send({ expectedRevision: 2, confirm: true })).status).toBe(200);
    const resolve = await request(app).post("/api/v1/me/assumptions/resolve").set("Authorization", "Bearer " + user).send({ ...seriesFixture, versionId: id });
    expect(resolve.status).toBe(200); expect(resolve.body.data.status).toBe("READY");
    conforms("Resolution", resolve.body);
    conforms("List", (await request(app).get("/api/v1/me/assumptions").set("Authorization", "Bearer " + user)).body);
    conforms("Version", (await request(app).get("/api/v1/me/assumptions/" + id).set("Authorization", "Bearer " + user)).body);
    const missing = await request(app).post("/api/v1/me/assumptions/resolve").set("Authorization", "Bearer " + user).send({ ...seriesFixture, versionId: id, endMonth: "2029-01" });
    expect(missing.body.data.status).toBe("INCOMPLETE"); conforms("Resolution", missing.body);
    for (const changes of [{ annualReturnRate: "99" }, { userId: "other" }, { rates: { inflation: "0" } }])
      expect((await request(app).post("/api/v1/me/assumptions/resolve").set("Authorization", "Bearer " + user).send({ ...seriesFixture, versionId: id, ...changes })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/admin/assumptions/${id}`).set("Authorization", "Bearer " + user).send({ expectedRevision: 3, data: assumptionFixture() })).status).toBe(403);
  });
});
