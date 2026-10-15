import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { MarketDataService, documentHash } from "../modules/allocation-risk/market-service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { RetirementService } from "../modules/retirement/service";
import { PlansService } from "../modules/plans/service";
import { ActualsService } from "../modules/actuals/service";
import { sourceReforecastSchema } from "../modules/plans/source-schema";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { config, token } from "./helpers";
import { memoryDb } from "./memory-db";
import { plansFixture } from "./plans-fixtures";
import { marketFixture } from "./allocation-risk-fixtures";
import { retirementProfile, retirementCommand } from "./retirement-fixtures";
import { glidePortfolioFixture, portfolioAssumptionsFixture } from "./portfolio-fixtures";
import { known, empty, fixtureAsset } from "./profile-v2-fixtures";

async function publishMarket(service: MarketDataService, data = marketFixture()) {
  const d = await service.create("admin", data);
  await service.approve("admin", d.id, { expectedRevision: 1, reviewNote: "Fixture approval", confirm: true });
  return service.publish("admin", d.id, { expectedRevision: 2, confirm: true });
}
async function setupRisk(initial = "0", zeroLossTolerance = false) {
  const f = memoryDb(), assumptions = new AssumptionsService(f.db), portfolios = new PortfoliosService(f.db);
  const a = portfolioAssumptionsFixture();
  a.assetClasses.push({ code: "CASH", label: "Fixture deposit", horizons: [{ id: "ALL", minMonths: 1, maxMonths: 1200 }] });
  a.returns.push(...a.returns.filter(r => r.assetClass === "BOND").map(r => ({ ...r, assetClass: "CASH" })));
  const av = await assumptions.create("admin", a), impact = await assumptions.previewImpact("admin", av.id, { expectedRevision: 1 });
  await assumptions.approve("admin", av.id, { expectedRevision: 1, reviewNote: "Fixture only", impactToken: impact.impactToken });
  await assumptions.publish("admin", av.id, { expectedRevision: 2, confirm: true });
  const policy = glidePortfolioFixture(av.id);
  policy.scenarios.forEach(s => s.years.forEach(y => y.returns.push({ assetClass: "CASH", deltaPoints: "0" })));
  policy.allocationRisk = { evidence: "Test only policy", blockMonths: 12, cvarAlpha: "0.95", essentialThreshold: "0.90", equityShiftPoints: "10", rebalanceBandPoints: "5", stresses: { LONGEVITY: { extraYears: [5, 10] } } };
  policy.lossStress = { evidence: "Fixture shocks only", equityAssetClass: "STOCK", depositAssetClass: "BOND",
    shocks: [{ assetClass: "BOND", percent: "0" }, { assetClass: "STOCK", percent: "-35" }, { assetClass: "CASH", percent: "0" }] };
  const pv = await portfolios.create("admin", policy);
  await portfolios.approve("admin", pv.id, { expectedRevision: 1, reviewNote: "Fixture review", confirm: true });
  await portfolios.publish("admin", pv.id, { expectedRevision: 2, confirm: true });
  const profile = retirementProfile(); profile.incomeStability = known("STABLE"); profile.goals = empty();
  profile.lossTolerance = { percent: known("100"), amountVnd: known("100000000"), reaction: known("HOLD") };
  if (zeroLossTolerance) {
    profile.lossTolerance.percent = known("0"); profile.lossTolerance.amountVnd = known("0");
    profile.assets = { status: "KNOWN", entries: [fixtureAsset({ value: known("1000"), retirementShare: known("1"), emergencyShare: known("0"), otherGoalsShare: known("0") })] };
  }
  const profiles = new ProfileService(f.db);
  await profiles.saveDraft("test-user", 0, "summary", profile);
  await profiles.complete("test-user", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID());
  const data = marketFixture(); data.assets = data.assets.slice(0, 2).map((a, i) => ({ ...a, assetClass: i ? "STOCK" : "BOND" }));
  data.rows.forEach(r => { r.returns = { BOND: initial, STOCK: "0" }; r.cpi = "0"; });
  const market = new MarketDataService(f.db); await publishMarket(market, data);
  const risk = new AllocationRiskService(f.db), preview = retirementCommand(pv.id);
  return { ...f, risk, preview, market, profiles, policyId: pv.id };
}
describe("P2 market document workflow (memory DB only)", () => {
  it("enforces draft/revision/approval/publication and canonical hashes across JSONB key order", async () => {
    const f = memoryDb(), svc = new MarketDataService(f.db), data = marketFixture();
    const d = await svc.create("admin", data);
    expect(await svc.published()).toBeNull();
    await expect(svc.publish("admin", d.id, { expectedRevision: 1, confirm: true })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(svc.patch("admin", d.id, { expectedRevision: 2, data })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const changed = await svc.patch("admin", d.id, { expectedRevision: 1, data: { ...data, title: "Changed fixture title" } });
    expect(changed.revision).toBe(2);
    await svc.approve("admin", d.id, { expectedRevision: 2, reviewNote: "Fixture approved", confirm: true });
    expect(await svc.published()).toBeNull();
    await svc.publish("admin", d.id, { expectedRevision: 3, confirm: true });
    expect((await svc.published())?.id).toBe(d.id);
    await expect(svc.patch("admin", d.id, { expectedRevision: 4, data })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const raw = f.rows("assumptionSetVersion").find(r => r.id === d.id)!;
    const hash = (await svc.get(d.id)).documentHash;
    raw.values.rows[0].returns = Object.fromEntries(Object.entries(raw.values.rows[0].returns).reverse());
    expect((await svc.get(d.id)).documentHash).toBe(hash);
    raw.values.rows[0].returns.CASH = "0.01";
    await expect(svc.published()).rejects.toMatchObject({ code: "MARKET_DATA_REVIEW_REQUIRED" });
  });
  it("does not resolve future-effective, draft or approved data", async () => {
    const f = memoryDb(), svc = new MarketDataService(f.db, () => new Date("2026-01-01"));
    const published = await publishMarket(svc, { ...marketFixture(), effectiveFrom: "2027-01-01" });
    expect(await svc.published(published.id)).toBeNull();
    expect((await svc.list({ page: 1, limit: 20 })).total).toBe(1);
    expect(await svc.validate(published.id)).toMatchObject({ status: "VALID" });
  });
  it("isolates model codes from assumptions/portfolios", async () => {
    const f = await plansFixture(), svc = new MarketDataService(f.db);
    await expect(svc.get(f.policy.id)).rejects.toMatchObject({ status: 404 });
    expect(await svc.published()).toBeNull();
    const published = await publishMarket(svc);
    await expect(new AssumptionsService(f.db).get(published.id)).rejects.toMatchObject({ status: 404 });
    expect(documentHash(published.data)).toBe(published.documentHash);
  });
});
describe("P2 user read-only integration", () => {
  it("returns DATA_REQUIRED for preview and owned saved versions; rejects another owner", async () => {
    const f = await plansFixture(), risk = new AllocationRiskService(f.db), saved = await f.create();
    const before = JSON.stringify([f.rows("planVersion"), f.rows("retirementPlan"), f.rows("auditLog")]);
    const evaluate = vi.spyOn(RetirementService.prototype, "evaluate");
    expect(await risk.run(f.owner, { plan: { kind: "PREVIEW", preview: f.command.preview }, paths: 10 }, "simulation")).toMatchObject({ status: "DATA_REQUIRED" });
    expect(evaluate).not.toHaveBeenCalled();
    evaluate.mockRestore();
    const command = { plan: { kind: "SAVED_VERSION" as const, planId: saved.planId, versionId: saved.saved.id }, paths: 10 };
    expect(await risk.run(f.owner, command, "scenarios")).toMatchObject({ status: "DATA_REQUIRED" });
    await expect(risk.run("another-user", command, "simulation")).rejects.toMatchObject({ status: 404 });
    expect(JSON.stringify([f.rows("planVersion"), f.rows("retirementPlan"), f.rows("auditLog")])).toBe(before);
  });
  it("runs published fixture data for preview and saved version without changing hashes or replay", async () => {
    const f = await setupRisk(), retirement = new RetirementService(f.db), plans = new PlansService(f.db);
    const beforePreview = await retirement.preview("test-user", f.preview);
    const saved = await plans.createVersion("test-user", null, { expectedRevision: 0, expectedInputHash: beforePreview.inputHash, preview: f.preview }, randomUUID());
    const before = JSON.stringify([f.rows("planVersion"), f.rows("retirementPlan"), f.rows("auditLog")]);
    const a = await f.risk.run("test-user", { plan: { kind: "PREVIEW", preview: f.preview }, paths: 10 }, "simulation");
    const b = await f.risk.run("test-user", { plan: { kind: "SAVED_VERSION", planId: saved.planId, versionId: saved.saved.id }, paths: 10 }, "simulation");
    expect(a.status).toBe("READY"); expect(a).toEqual(b);
    expect(JSON.stringify([f.rows("planVersion"), f.rows("retirementPlan"), f.rows("auditLog")])).toBe(before);
    expect((await plans.version("test-user", saved.planId, saved.saved.id, true)).preview.inputHash).toBe(beforePreview.inputHash);
  });
  it("chooses a feasible candidate and returns INSUFFICIENT with P1-8 adjustments when none pass", async () => {
    const f = await setupRisk();
    const good = await f.risk.run("test-user", { plan: { kind: "PREVIEW", preview: { ...f.preview, monthlyExpenseToday: "0" } }, paths: 10 }, "selection");
    expect(good).toMatchObject({ status: "READY", selectedId: "BASE" });
    const bad = await f.risk.run("test-user", { plan: { kind: "PREVIEW", preview: { ...f.preview, monthlyExpenseToday: "100000" } }, paths: 10 }, "selection");
    expect(bad).toMatchObject({ status: "INSUFFICIENT", selectedId: null, adjustmentKinds: ["CONTRIBUTE_MORE", "RETIRE_LATER", "SPEND_LESS"] });
    expect(bad).toHaveProperty("adjustmentOptions");
  });
  it("reports missing stress parameters and unsupported extended assumption coverage", async () => {
    const f = await setupRisk();
    const r = await f.risk.run("test-user", { plan: { kind: "PREVIEW", preview: f.preview }, paths: 10 }, "scenarios");
    expect(r).toMatchObject({ status: "READY", longevity: { kind: "LONGEVITY", status: "REVIEW_REQUIRED" } });
    if ("scenarios" in r) expect(r.scenarios.every(s => s.status === "REVIEW_REQUIRED")).toBe(true);
  });
  it("rejects the equity variant against nonzero growth capital and the declared loss limit", async () => {
    const f = await setupRisk("0", true);
    const r = await f.risk.run("test-user", { plan: { kind: "PREVIEW", preview: { ...f.preview, monthlyExpenseToday: "0" } }, paths: 10 }, "selection");
    expect(r).toMatchObject({ status: "READY", selectedId: "BASE", rejected: expect.arrayContaining([
      { id: "HIGHER_EQUITY", issues: ["LOSS_CONSTRAINT_EXCEEDED"] }, { id: "LOWER_EQUITY", issues: ["INVALID_WEIGHTS"] },
    ]) });
  });
  it("uses pinned v4 source cashflows and preserves both v3 and v4 replay", async () => {
    const f = await setupRisk(), retirement = new RetirementService(f.db), plans = new PlansService(f.db);
    const preview = await retirement.preview("test-user", f.preview);
    const base = await plans.createVersion("test-user", null, { expectedRevision: 0, expectedInputHash: preview.inputHash, preview: f.preview }, randomUUID());
    const actuals = new ActualsService(f.db);
    await actuals.write("test-user", "2026-10", { expectedRevision: 0, data: { currency: "VND", openingBalance: "1000", closingBalance: "1000", entries: [], correctionReason: "Fixture statement" } }, randomUUID());
    const command = sourceReforecastSchema.parse({ versionId: base.saved.id, expectedSnapshotHash: base.saved.snapshotHash, expectedRevision: 1,
      expectedProfileRevision: 1, throughMonth: "2026-10", sourceCommands: [{ operation: "CREATE", commandId: randomUUID(), sourceId: "plan:fixture-rent", expectedSourceRevision: 0,
        effectiveFromMonth: "2026-11", effectiveToMonth: "2027-03", metric: "income", frequency: "MONTHLY", amount: "100", currency: "VND", confirmation: "HYPOTHETICAL", document: "Fixture rent", confirm: true }] });
    // PlansService uses wall clock for source commands; only Date is faked, never timers.
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-05T00:00:00Z"));
    try {
      const next = await plans.previewSources("test-user", base.planId, command);
      const saved = await plans.saveSources("test-user", base.planId, { preview: command, expectedInputHash: next.inputHash!, confirm: true }, randomUUID());
      const before = JSON.stringify(f.rows("planVersion"));
      const result = await f.risk.run("test-user", { plan: { kind: "SAVED_VERSION", planId: base.planId, versionId: saved.saved.id }, paths: 10 }, "simulation");
      expect(result.status).toBe("READY");
      expect((await plans.version("test-user", base.planId, saved.saved.id, true)).preview.modelVersion).toBe("retirement-monthly-v4");
      expect((await plans.version("test-user", base.planId, base.saved.id, true)).preview.modelVersion).toBe("retirement-monthly-v3");
      expect(JSON.stringify(f.rows("planVersion"))).toBe(before);
    } finally { vi.useRealTimers(); }
  });
  it("matches generated OpenAPI for READY, DATA_REQUIRED, selection and market version", async () => {
    const api = await SwaggerParser.validate("docs/openapi.yaml") as unknown as { paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: object }> }; responses: Record<string, { content: Record<string, { schema: object }> }> }>> };
    const ajv = new Ajv({ strict: false, validateFormats: false });
    const f = await setupRisk();
    for (const mode of ["simulation", "selection", "scenarios"] as const) {
      const result = await f.risk.run("test-user", { plan: { kind: "PREVIEW", preview: f.preview }, paths: 10 }, mode);
      const contract = api.paths["/api/v1/me/retirement/risk/" + mode].post.responses["200"].content["application/json"].schema;
      const validate = ajv.compile(contract);
      expect(validate({ data: result, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
      expect(validate({ data: { status: "DATA_REQUIRED", issues: ["DATA"] }, meta: { requestId: randomUUID() } })).toBe(true);
    }
    const version = await f.market.published();
    const validate = ajv.compile(api.paths["/api/v1/admin/market-data/{id}"].get.responses["200"].content["application/json"].schema);
    expect(validate({ data: version, meta: { requestId: randomUUID() } }), JSON.stringify(validate.errors)).toBe(true);
  });
  it("enforces auth roles and rejects client market series at HTTP boundary", async () => {
    const f = await plansFixture(), auth = new AuthService(f.db, config);
    vi.spyOn(auth, "validateSession").mockResolvedValue({ id: "test-user", role: "USER" } as never);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const app = createApp({ config, services: { auth, profiles: new ProfileService(f.db), marketData: new MarketDataService(f.db), allocationRisk: new AllocationRiskService(f.db) } });
    const url = "/api/v1/me/retirement/risk/simulation", body = { plan: { kind: "PREVIEW", preview: f.command.preview }, paths: 10 };
    expect((await request(app).post(url).send(body)).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/market-data").set("Authorization", "Bearer " + token()).send(marketFixture())).status).toBe(403);
    expect((await request(app).post(url).set("Authorization", "Bearer " + token("ADMIN")).send(body)).status).toBe(403);
    expect((await request(app).post(url).set("Authorization", "Bearer " + token()).send({ ...body, returns: [] })).status).toBe(400);
    const response = await request(app).post(url).set("Authorization", "Bearer " + token()).send(body);
    expect(response.status).toBe(200); expect(response.body.data.status).toBe("DATA_REQUIRED");
    expect((await request(app).post("/api/v1/admin/market-data").set("Authorization", "Bearer " + token("ADMIN")).send(marketFixture())).status).toBe(201);
  });
});
