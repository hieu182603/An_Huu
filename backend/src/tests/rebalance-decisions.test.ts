import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService } from "../modules/portfolios/service";
import { AllocationRiskService } from "../modules/allocation-risk/service";
import { RebalanceDecisionService } from "../modules/allocation-risk/rebalance-decisions";
import { config } from "./helpers";
import { memoryDb } from "./memory-db";
import { glidePortfolioFixture, portfolioAssumptionsFixture } from "./portfolio-fixtures";

const root = "/api/v1/me/retirement/risk";
const sign = (userId: string, role: "USER" | "ADMIN") =>
  "Bearer " + jwt.sign({ userId, email: `${userId}@example.test`, role }, config.JWT_SECRET, {
    algorithm: "HS256", issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn: 60,
  });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function setup() {
  const f = memoryDb();
  const userA = randomUUID(), userB = randomUUID(), adminId = randomUUID();
  await f.db.user.create({ data: { id: userA, email: "a@example.test", passwordHash: "h", fullName: "A", role: "USER", status: "ACTIVE" } });
  await f.db.user.create({ data: { id: userB, email: "b@example.test", passwordHash: "h", fullName: "B", role: "USER", status: "ACTIVE" } });
  await f.db.user.create({ data: { id: adminId, email: "admin@example.test", passwordHash: "h", fullName: "Admin", role: "ADMIN", status: "ACTIVE" } });

  const assumptions = new AssumptionsService(f.db), portfolios = new PortfoliosService(f.db);
  const a = portfolioAssumptionsFixture();
  const av = await assumptions.create("admin", a);
  const impact = await assumptions.previewImpact("admin", av.id, { expectedRevision: 1 });
  await assumptions.approve("admin", av.id, { expectedRevision: 1, reviewNote: "Fixture", impactToken: impact.impactToken });
  await assumptions.publish("admin", av.id, { expectedRevision: 2, confirm: true });

  const policy = glidePortfolioFixture(av.id);
  policy.allocationRisk = { evidence: "Test policy", rebalanceBandPoints: "5" };
  const pv = await portfolios.create("admin", policy);
  await portfolios.approve("admin", pv.id, { expectedRevision: 1, reviewNote: "Fixture", confirm: true });
  await portfolios.publish("admin", pv.id, { expectedRevision: 2, confirm: true });

  const auth = new AuthService(f.db, config);
  vi.spyOn(auth, "validateSession").mockImplementation(async payload => ({
    id: payload.userId,
    role: payload.role,
    status: "ACTIVE",
  }) as never);

  const app = createApp({
    config,
    services: {
      auth,
      profiles: new ProfileService(f.db),
      allocationRisk: new AllocationRiskService(f.db),
      rebalanceDecisions: new RebalanceDecisionService(f.db),
    },
  });

  // At 5 years before retirement (2026-01 vs 2031-01), glidePortfolioFixture GROWTH target is 50% BOND, 50% STOCK.
  // Holding 20% BOND / 80% STOCK triggers rebalance (30pp drift > 5pp).
  const rebalanceBody = {
    policyVersionId: pv.id,
    templateId: "GROWTH",
    month: "2026-01",
    retirementMonth: "2031-01",
    holdings: [
      { assetClass: "BOND", value: "200000000", maturedAmount: "0" },
      { assetClass: "STOCK", value: "800000000", maturedAmount: "0" },
    ],
    newContribution: "0",
  };

  return {
    ...f,
    app,
    userA,
    userB,
    authA: sign(userA, "USER"),
    authB: sign(userB, "USER"),
    authAdmin: sign(adminId, "ADMIN"),
    rebalanceBody,
  };
}

describe("B7-1: RebalanceDecision persistence, decision update, and owner-scoped history", () => {
  it("keeps persisted=false and writes nothing when record is omitted or false", async () => {
    const f = await setup();
    const res1 = await request(f.app).post(`${root}/rebalance`).set("Authorization", f.authA).send(f.rebalanceBody);
    expect(res1.status, JSON.stringify(res1.body)).toBe(200);
    expect(res1.body.data.persisted).toBe(false);
    expect(res1.body.data.status).toBe("PROPOSED");
    expect(f.rows("rebalanceDecision")).toHaveLength(0);

    const res2 = await request(f.app).post(`${root}/rebalance`).set("Authorization", f.authA).send({ ...f.rebalanceBody, record: false });
    expect(res2.status).toBe(200);
    expect(res2.body.data.persisted).toBe(false);
    expect(f.rows("rebalanceDecision")).toHaveLength(0);
  });

  it("persists PROPOSED when record=true, supports ACCEPTED/DISMISSED updates, and orders history newest-first", async () => {
    const f = await setup();
    const planVersionId = randomUUID();
    const plan = await f.db.retirementPlan.create({data:{userId:f.userA}});
    await f.db.planVersion.create({data:{id:planVersionId,planId:plan.id,version:1,profileRevision:1,goalRevision:1,modelVersionId:randomUUID(),assumptionVersionId:randomUUID(),inputSnapshot:{},result:{},chartSeries:[],asOfDate:new Date("2026-01-01")}});

    const first = await request(f.app)
      .post(`${root}/rebalance`)
      .set("Authorization", f.authA)
      .send({ ...f.rebalanceBody, record: true, planVersionId, source: "PROPOSAL" });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toMatchObject({ persisted: true, decision: "PROPOSED", status: "PROPOSED" });
    const firstId = first.body.data.decisionId as string;
    expect(firstId).toBeTruthy();

    // Ensure distinct createdAt timestamp for deterministic ordering.
    const storedFirst = f.rows("rebalanceDecision").find(r => r.id === firstId)!;
    storedFirst.createdAt = new Date("2026-11-20T00:00:00.000Z");

    const second = await request(f.app)
      .post(`${root}/rebalance`)
      .set("Authorization", f.authA)
      .send({ ...f.rebalanceBody, record: true, source: "MONITOR" });
    expect(second.status).toBe(200);
    const secondId = second.body.data.decisionId as string;
    const storedSecond = f.rows("rebalanceDecision").find(r => r.id === secondId)!;
    storedSecond.createdAt = new Date("2026-11-20T01:00:00.000Z");

    // Accept the first, dismiss the second.
    const accepted = await request(f.app)
      .post(`${root}/rebalance/${firstId}/decision`)
      .set("Authorization", f.authA)
      .send({ decision: "ACCEPTED", note: "Thực hiện bán ETF trong tuần này" });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.data).toMatchObject({
      id: firstId,
      planVersionId,
      source: "PROPOSAL",
      decision: "ACCEPTED",
      note: "Thực hiện bán ETF trong tuần này",
    });

    const dismissed = await request(f.app)
      .post(`${root}/rebalance/${secondId}/decision`)
      .set("Authorization", f.authA)
      .send({ decision: "DISMISSED", note: "Chờ kỳ góp tháng sau" });
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.data).toMatchObject({ id: secondId, source: "MONITOR", decision: "DISMISSED" });

    // History is newest-first and strictly owner-scoped.
    const histA = await request(f.app).get(`${root}/rebalance/history`).set("Authorization", f.authA);
    expect(histA.status, JSON.stringify(histA.body)).toBe(200);
    expect(histA.body.data.items.map((i: { id: string }) => i.id)).toEqual([secondId, firstId]);

    const histLimited = await request(f.app).get(`${root}/rebalance/history`).set("Authorization", f.authA).query({ limit: "1" });
    expect(histLimited.status).toBe(200);
    expect(histLimited.body.data.items.map((i: { id: string }) => i.id)).toEqual([secondId]);
  });

  it("enforces owner isolation (404 cross-user), auth (401/403), and strict Zod validation (400)", async () => {
    const f = await setup();
    const created = await request(f.app)
      .post(`${root}/rebalance`)
      .set("Authorization", f.authA)
      .send({ ...f.rebalanceBody, record: true });
    const decisionId = created.body.data.decisionId as string;

    // Cross-user decision update -> 404; cross-user history -> empty.
    const crossUpdate = await request(f.app)
      .post(`${root}/rebalance/${decisionId}/decision`)
      .set("Authorization", f.authB)
      .send({ decision: "ACCEPTED" });
    expect(crossUpdate.status).toBe(404);

    const histB = await request(f.app).get(`${root}/rebalance/history`).set("Authorization", f.authB);
    expect(histB.status).toBe(200);
    expect(histB.body.data.items).toEqual([]);

    // Unauthenticated -> 401; ADMIN -> 403.
    expect((await request(f.app).get(`${root}/rebalance/history`)).status).toBe(401);
    expect((await request(f.app).get(`${root}/rebalance/history`).set("Authorization", f.authAdmin)).status).toBe(403);
    expect((await request(f.app).post(`${root}/rebalance/${decisionId}/decision`).set("Authorization", f.authAdmin).send({ decision: "ACCEPTED" })).status).toBe(403);

    // Invalid decision enum / unknown field -> 400.
    expect((await request(f.app).post(`${root}/rebalance/${decisionId}/decision`).set("Authorization", f.authA).send({ decision: "PROPOSED" })).status).toBe(400);
    expect((await request(f.app).post(`${root}/rebalance/${decisionId}/decision`).set("Authorization", f.authA).send({ decision: "ACCEPTED", extra: 1 })).status).toBe(400);
  });
});
