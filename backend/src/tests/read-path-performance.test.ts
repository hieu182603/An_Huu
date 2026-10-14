import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "../app";
import { sendData } from "../common/http";
import { createAuthenticate } from "../middlewares/authMiddleware";
import { createLimiter } from "../middlewares/rateLimiter";
import { AssumptionsService } from "../modules/assumptions/service";
import { PortfoliosService, publishedPolicies } from "../modules/portfolios/service";
import { plansFixture } from "./plans-fixtures";
import { config } from "./helpers";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
const signed = (userId: string, secret = config.JWT_SECRET) => jwt.sign({ userId, email: "rate@example.test", role: "USER" }, secret,
  { algorithm: "HS256", issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn: 60 });

describe("rate limit keys", () => {
  function app() {
    const router = Router();
    // Same shape as the app-level general limiter: mounted before authentication.
    router.get("/early", createLimiter(60000, 1, config), (_req, res) => sendData(res, { ok: true }));
    // Same shape as ai/upload/support limiters: mounted after authentication.
    router.get("/late", createAuthenticate(config), createLimiter(60000, 1), (_req, res) => sendData(res, { ok: true }));
    return createApp({ config, databaseProbe: async () => {}, apiRouter: router });
  }
  it("gives each verified user its own bucket even when every request shares one proxy IP", async () => {
    const a = app(), alice = signed("alice"), bob = signed("bob");
    for (const path of ["/api/v1/early", "/api/v1/late"]) {
      expect((await request(a).get(path).set("Authorization", `Bearer ${alice}`)).status).toBe(200);
      expect((await request(a).get(path).set("Authorization", `Bearer ${bob}`)).status).toBe(200);
      expect((await request(a).get(path).set("Authorization", `Bearer ${alice}`)).body.error.code).toBe("RATE_LIMITED");
    }
  });
  it("keeps anonymous and forged-token requests on the IP bucket", async () => {
    const a = app();
    expect((await request(a).get("/api/v1/early")).status).toBe(200);
    // A token signed with another secret must not mint a fresh bucket.
    const forged = await request(a).get("/api/v1/early").set("Authorization", `Bearer ${signed("mallory", "x".repeat(48))}`);
    expect(forged.body.error.code).toBe("RATE_LIMITED");
    expect((await request(a).get("/api/v1/early").set("Authorization", `Bearer ${signed("carol")}`)).status).toBe(200);
  });
});

describe("compression and Server-Timing", () => {
  function app() {
    const router = Router(), big = { rows: Array.from({ length: 400 }, (_, i) => ({ month: i, balance: "123456789.00" })) };
    router.get("/me/financial-profile", (_req, res) => sendData(res, big));
    router.get("/me/retirement/plans/:id", (_req, res) => sendData(res, big));
    router.get("/content", (_req, res) => sendData(res, big));
    return createApp({ config, databaseProbe: async () => {}, apiRouter: router });
  }
  it("gzips large JSON but never event streams", async () => {
    const a = app();
    const zipped = await request(a).get("/api/v1/content").set("Accept-Encoding", "gzip");
    expect(zipped.headers["content-encoding"]).toBe("gzip");
    expect(zipped.body.data.rows).toHaveLength(400);
    const stream = await request(a).get("/api/v1/content").set("Accept-Encoding", "gzip").set("Accept", "text/event-stream");
    expect(stream.headers["content-encoding"]).toBeUndefined();
  });
  it("adds Server-Timing and a route-template log only on measured paths", async () => {
    const a = app(), info = vi.spyOn(console, "info").mockImplementation(() => {});
    const id = randomUUID();
    const plan = await request(a).get(`/api/v1/me/retirement/plans/${id}`);
    expect(plan.headers["server-timing"]).toMatch(/^total;dur=\d+(\.\d)?$/);
    expect((await request(a).get("/api/v1/me/financial-profile")).headers["server-timing"]).toMatch(/^total;dur=/);
    expect((await request(a).get("/api/v1/content")).headers["server-timing"]).toBeUndefined();
    const timings = info.mock.calls.map(c => JSON.parse(String(c[0]))).filter(e => e.event === "http.timing");
    expect(timings.map(e => e.route)).toEqual(["/me/retirement/plans/:id", "/me/financial-profile"]);
    expect(JSON.stringify(timings)).not.toContain(id);
  });
});

describe("read-only plan and preview paths", () => {
  async function appliedPlan() {
    const f = await plansFixture(), saved = await f.create();
    await f.plans.apply(f.owner, saved.planId, { expectedRevision: 1, expectedProfileRevision: 1, versionId: saved.saved.id, confirm: true }, randomUUID());
    return { f, planId: saved.planId, versionId: saved.saved.id };
  }
  it("serves get/versions/version/report/compare/simulate/preview without SERIALIZABLE transactions", async () => {
    const { f, planId, versionId } = await appliedPlan(), tx = vi.spyOn(f.db, "$transaction");
    const latest = vi.spyOn(f.db.assumptionSetVersion, "findFirst");
    const plan = await f.plans.get(f.owner, planId);
    expect(plan).toMatchObject({ id: planId, currentVersionId: versionId, profileChanged: false, actualSourceChanged: false,
      updates: { assumptions: null, policy: null }, updatePolicy: "USER_EXPLICIT_CREATE_AND_APPLY" });
    expect(latest.mock.calls.map(c => c[0]?.select)).toEqual([{ id: true, version: true }, { id: true, version: true }]);
    await f.plans.versions(f.owner, planId, { page: 1, limit: 50 });
    await f.plans.version(f.owner, planId, versionId, true);
    await f.plans.report(f.owner, planId, {});
    await f.plans.compare(f.owner, planId, { baselineVersionId: versionId, candidateVersionId: versionId });
    await f.plans.simulate(f.owner, planId, versionId, { preview: f.command.preview });
    await f.retirement.preview(f.owner, f.command.preview);
    expect(tx).not.toHaveBeenCalled();
  });
  it("still hides another user's plan and keeps error precedence on parallel reads", async () => {
    const { f, planId, versionId } = await appliedPlan();
    for (const read of [() => f.plans.get("someone-else", planId), () => f.plans.versions("someone-else", planId, { page: 1, limit: 20 }),
      () => f.plans.version("someone-else", planId, versionId), () => f.plans.report("someone-else", planId, {}),
      () => f.plans.simulate("someone-else", planId, versionId, { preview: f.command.preview })])
      await expect(read()).rejects.toMatchObject({ status: 404 });
    // Ownership/version errors win over a stale profile revision in the parallel capture.
    await expect(f.plans.simulate(f.owner, planId, randomUUID(), { preview: { ...f.command.preview, expectedProfileRevision: 9 } })).rejects.toMatchObject({ status: 404 });
    await expect(f.plans.simulate(f.owner, planId, versionId, { preview: { ...f.command.preview, expectedProfileRevision: 9 } })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("lists version summaries from projected columns without loading or re-verifying full snapshots", async () => {
    const { f, planId, versionId } = await appliedPlan();
    const detail = await f.plans.version(f.owner, planId, versionId), full = vi.spyOn(f.db.planVersion, "findMany");
    const list = await f.plans.versions(f.owner, planId, { page: 1, limit: 50 });
    expect(full).not.toHaveBeenCalled();
    expect(list).toMatchObject({ total: 1, page: 1, limit: 50 });
    expect(list.items).toEqual([{ id: versionId, version: 1, createdAt: detail.createdAt, profileRevision: 1, snapshotHash: detail.snapshotHash,
      references: detail.preview.references, summary: detail.preview.calculation!.summary }]);
    // Tampering is still caught where the full snapshot is actually used.
    f.rows("planVersion")[0].inputSnapshot.capture.revision = 99;
    expect((await f.plans.versions(f.owner, planId, { page: 1, limit: 50 })).items).toHaveLength(1);
    for (const read of [() => f.plans.version(f.owner, planId, versionId), () => f.plans.version(f.owner, planId, versionId, true),
      () => f.plans.exportCsv(f.owner, planId, versionId), () => f.plans.get(f.owner, planId)])
      await expect(read()).rejects.toMatchObject({ code: "SNAPSHOT_INTEGRITY_FAILED" });
  });
});

describe("published policy/assumption cache", () => {
  it("reuses verified PUBLISHED documents across previews without reloading them", async () => {
    const f = await plansFixture(), reads = vi.spyOn(f.db.assumptionSetVersion, "findUnique");
    const first = await f.retirement.preview(f.owner, f.command.preview);
    const second = await f.retirement.preview(f.owner, f.command.preview);
    expect(second.inputHash).toBe(first.inputHash);
    expect(reads).not.toHaveBeenCalled(); // the fixture's first preview already warmed both entries
    publishedPolicies.clear();
    await f.retirement.preview(f.owner, f.command.preview);
    expect(reads).toHaveBeenCalledTimes(1); // policy reloaded; assumptions still cached
  });
  it("returns clones, keeps effective-date checks on hits and never caches drafts", async () => {
    const f = await plansFixture(), policies = new PortfoliosService(f.db);
    const policy = await policies.get(f.policy.id, true);
    policy.data.title = "mutated by a caller";
    expect((await policies.get(f.policy.id, true)).data.title).not.toBe("mutated by a caller");
    const past = () => new Date("2000-01-01T00:00:00.000Z");
    await expect(new PortfoliosService(f.db, past).get(f.policy.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(new AssumptionsService(f.db, past).get(policy.data.assumptionVersionId, true)).rejects.toMatchObject({ status: 404 });
    const draft = await new AssumptionsService(f.db).create("admin", (await new AssumptionsService(f.db).get(policy.data.assumptionVersionId)).data);
    await new AssumptionsService(f.db).get(draft.id);
    f.rows("assumptionSetVersion").find(r => r.id === draft.id)!.revision = 7;
    expect((await new AssumptionsService(f.db).get(draft.id)).revision).toBe(7);
  });
});
