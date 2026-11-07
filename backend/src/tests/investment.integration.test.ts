import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../app";
import { createServices } from "../modules/services";
import { config } from "./helpers";
import { seedInvestmentFixture } from "./investment-fixture";
const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || !/^\/anhuu_[a-z0-9_]+_test$/.test(new URL(url).pathname)) throw new Error("Isolated local test database required");
const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
const openConfig = { ...config, DATABASE_URL: url, ENABLE_CONTINUOUS_OPTIMIZER: "true" as const, ENABLE_OPTIMIZER_FALLBACK: "true" as const, ENABLE_RECOMMENDATION_PUBLICATION: "true" as const, RECOMMENDATION_LEGAL_AUTHORIZATION_REFERENCE: "SYNTHETIC TEST AUTHORIZATION ONLY" };
const app = createApp({ config: openConfig, services: createServices(db, openConfig), databaseProbe: () => db.$queryRaw`SELECT 1` });
const closed = createApp({ config, services: createServices(db, config), databaseProbe: () => db.$queryRaw`SELECT 1` });
let fixture: Awaited<ReturnType<typeof seedInvestmentFixture>>;
const tokens = {} as Record<string, string>;
const root = "/api/v1/investments";
beforeAll(async () => {
  fixture = await seedInvestmentFixture(db);
  for (const [key, actor] of Object.entries(fixture.actors)) {
    const login = await request(app).post("/api/v1/auth/login").send({ email: actor.email, password: fixture.password, remember: false });
    expect(login.status, JSON.stringify(login.body)).toBe(200); tokens[key] = login.body.data.accessToken;
  }
}, 60000);
afterAll(() => db.$disconnect());
async function draft() {
  const response = await request(app).post(root + "/admin/recommendations").auth(tokens.advisor, { type: "bearer" }).send({ userId: fixture.actors.userA.id, planId: fixture.planId, versionId: fixture.versionId });
  expect(response.status, JSON.stringify(response.body)).toBe(201); return response.body.data as { id: string; revision: number };
}
async function transition(id: string, action: string, revision: number, actor = "advisor", server = app) {
  return request(server).post(`${root}/admin/recommendations/${id}/${action}`).auth(tokens[actor], { type: "bearer" }).send({ expectedRevision: revision, reason: "Isolated integration test decision" });
}
describe("Investment runtime: HTTP → authentication → Prisma → isolated PostgreSQL", () => {
  it("enforces four eyes, persisted approval, publication gate, immutable content and client visibility", async () => {
    const d = await draft();
    expect((await transition(d.id, "approve", 1, "approver")).status).toBe(422);
    for (const [action, revision] of [["validate", 1], ["suitability", 2], ["submit", 3]] as const) expect((await transition(d.id, action, revision)).status).toBe(200);
    expect((await transition(d.id, "approve", 4)).status).toBe(422);
    expect((await transition(d.id, "approve", 4, "userA")).status).toBe(403);
    const race = await Promise.all([transition(d.id, "approve", 4, "approver"), transition(d.id, "approve", 4, "approver")]);
    expect(race.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await request(app).get(root + "/recommendations").auth(tokens.userA, { type: "bearer" })).body.data).toHaveLength(0);
    expect((await transition(d.id, "publish", 5, "operations", closed)).status).toBe(422);
    expect((await transition(d.id, "publish", 5, "operations")).status).toBe(200);
    expect((await request(app).get(root + "/recommendations").auth(tokens.userA, { type: "bearer" })).body.data).toHaveLength(1);
    expect((await request(app).get(root + "/recommendations").auth(tokens.userB, { type: "bearer" })).body.data).toHaveLength(0);
    const history = await request(app).get(`${root}/admin/recommendations/${d.id}/history`).auth(tokens.approver, { type: "bearer" });
    expect(history.body.data.map((h: { decision: string }) => h.decision)).toEqual(["validate", "suitability", "submit", "approve", "publish"]);
    expect(history.body.data.every((h: { contentHash: string }) => h.contentHash === history.body.data[0].contentHash)).toBe(true);
  });
  it("rejects forged roles/status and cross-user plan creation", async () => {
    const payload = { userId: fixture.actors.userB.id, planId: fixture.planId, versionId: fixture.versionId };
    expect((await request(app).post(root + "/admin/recommendations").auth(tokens.advisor, { type: "bearer" }).send(payload)).status).toBe(404);
    expect((await request(app).post(root + "/admin/recommendations").auth(tokens.userA, { type: "bearer" }).send({ ...payload, role: "APPROVER", status: "APPROVED" })).status).toBe(400);
    expect((await request(app).get(root + "/admin/recommendations").auth(tokens.userA, { type: "bearer" })).status).toBe(403);
  });
  it("persists holdings, computes valuation, isolates owners and generates a cash-first proposal without orders", async () => {
    const input = { productId: fixture.productIds[0], quantity: "100", unitCost: "9000", expectedRevision: 0 };
    const saved = await request(app).put(root + "/holdings").auth(tokens.userA, { type: "bearer" }).send(input);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await request(app).get(root + "/recommendations").auth(tokens.userA, { type: "bearer" })).body.data).toHaveLength(0);
    expect((await request(app).put(root + "/holdings").auth(tokens.userA, { type: "bearer" }).send(input)).status).toBe(409);
    const read = await request(app).get(root + "/holdings").auth(tokens.userA, { type: "bearer" });
    expect(read.body.data.summary).toMatchObject({ totalValue: "1000000", totalCost: "900000", totalUnrealizedGainLoss: "100000" });
    expect((await request(app).get(root + "/holdings").auth(tokens.userB, { type: "bearer" })).body.data.holdings).toHaveLength(0);
    const rebalance = await request(app).post(root + "/holdings/rebalance").auth(tokens.userA, { type: "bearer" }).send({ planId: fixture.planId, versionId: fixture.versionId, newContribution: "100000" });
    expect(rebalance.status, JSON.stringify(rebalance.body)).toBe(200);
    expect(rebalance.body.data.informationalOnly).toBe(true);
    expect(await db.investmentHolding.count({ where: { userId: fixture.actors.userA.id } })).toBe(1);
  });
  it("executes continuous selection and longevity +60/+120 through the real risk API", async () => {
    const body = { plan: { kind: "SAVED_VERSION", planId: fixture.planId, versionId: fixture.versionId }, marketVersionId: fixture.marketVersionId, paths: 10 };
    const selection = await request(app).post("/api/v1/me/retirement/risk/selection").auth(tokens.userA, { type: "bearer" }).send(body);
    expect(selection.status, JSON.stringify(selection.body)).toBe(200);
    expect(selection.body.data.optimization.method).toBe("PROJECTED_PROXIMAL_GRADIENT");
    expect(selection.body.data.candidates.some((c: { id: string }) => c.id === "CONTINUOUS")).toBe(true);
    const scenarios = await request(app).post("/api/v1/me/retirement/risk/scenarios").auth(tokens.userA, { type: "bearer" }).send(body);
    expect(scenarios.status, JSON.stringify(scenarios.body)).toBe(200);
    expect(scenarios.body.data.longevity.status).toBe("READY");
    expect(scenarios.body.data.longevity.results.map((r: { endMonth: string }) => r.endMonth)).toEqual(["2032-03", "2037-03"]);
  });
  it("does not allow approval history to be rewritten in PostgreSQL", async () => {
    const rec = await db.investmentRecommendation.findFirstOrThrow({ where: { userId: fixture.actors.userA.id } });
    await expect(db.investmentApproval.updateMany({ where: { recommendationId: rec.id }, data: { reason: "forged" } })).rejects.toThrow();
  });
  it("hides stale published recommendations when customer inputs change", async () => {
    const d = await draft();
    for (const [action, revision, actor] of [["validate", 1, "advisor"], ["suitability", 2, "advisor"], ["submit", 3, "advisor"], ["approve", 4, "approver"], ["publish", 5, "operations"]] as const)
      expect((await transition(d.id, action, revision, actor)).status).toBe(200);
    expect((await request(app).get(root + "/recommendations").auth(tokens.userA, { type: "bearer" })).body.data).toHaveLength(1);
    await db.financialProfile.update({ where: { userId: fixture.actors.userA.id }, data: { revision: { increment: 1 } } });
    expect((await request(app).get(root + "/recommendations").auth(tokens.userA, { type: "bearer" })).body.data).toHaveLength(0);
  });
  it("restricts provider and product administration to granted roles and validates category mapping", async () => {
    expect((await request(app).get(root + "/admin/providers").auth(tokens.userA, { type: "bearer" })).status).toBe(403);
    const health = await request(app).get(root + "/admin/providers").auth(tokens.dataAdmin, { type: "bearer" });
    expect(health.status).toBe(200);
    expect(health.body.data.every((p: { status: string }) => ["CONFIGURED", "NOT_CONFIGURED"].includes(p.status))).toBe(true);
    const read = await request(app).get(root + "/admin/products").auth(tokens.dataAdmin, { type: "bearer" });
    const product = read.body.data.find((p: { id: string }) => p.id === fixture.productIds[0]);
    const input = { expectedRevision: product.revision, data: product.data };
    expect((await request(app).put(root + "/admin/products/" + product.id).auth(tokens.advisor, { type: "bearer" }).send(input)).status).toBe(403);
    expect((await request(app).put(root + "/admin/products/" + product.id).auth(tokens.dataAdmin, { type: "bearer" }).send({ ...input, data: { ...input.data, assetClass: "EQUITY" } })).status).toBe(400);
    expect((await request(app).get(root + "/admin/unconfigured-products").auth(tokens.dataAdmin, { type: "bearer" })).status).toBe(200);
  });
  it("withholds valuation and rebalance when a product price expires", async () => {
    const read = await request(app).get(root + "/admin/products").auth(tokens.dataAdmin, { type: "bearer" });
    const product = read.body.data.find((p: { id: string }) => p.id === fixture.productIds[0]);
    const update = await request(app).put(root + "/admin/products/" + product.id).auth(tokens.dataAdmin, { type: "bearer" }).send({ expectedRevision: product.revision, data: { ...product.data, priceAsOf: "2020-01-01", validUntil: "2020-01-02" } });
    expect(update.status).toBe(200);
    const held = await request(app).get(root + "/holdings").auth(tokens.userA, { type: "bearer" });
    expect(held.body.data.status).toBe("DATA_REQUIRED"); expect(held.body.data.summary).toBeNull();
    expect((await request(app).post(root + "/holdings/rebalance").auth(tokens.userA, { type: "bearer" }).send({ planId: fixture.planId, versionId: fixture.versionId, newContribution: "0" })).status).toBe(422);
  });
});
