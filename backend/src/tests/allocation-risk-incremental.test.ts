import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { SEED, randomGenerator, simulate, type RiskContext } from "../modules/allocation-risk/simulation";
import { clearSimulationCache, configureSimulationCache, simulationCacheStats } from "../modules/allocation-risk/simulation-cache";
import { allocationRiskRouter } from "../modules/allocation-risk/router";
import { AppError } from "../common/errors";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";

const policy = riskPolicySchema.parse({ evidence: "Test-only policy", blockMonths: 12, cvarAlpha: "0.95", essentialThreshold: "0.90" });
// Enough capital that some paths are funded and some are not, so counts, Wilson and CVaR are not trivial.
const context = (months = 24, capital = "2500"): RiskContext => { const c = riskContext(months); c.projection.initialCapital = capital; return c; };
const ready = <T extends { status: string }>(r: T) => { expect(r.status).toBe("READY"); return r as Extract<T, { status: "READY" }>; };
/** True when the run needs no new path (a deadline already in the past still returns READY). */
const fullyCached = async (c: RiskContext, paths: number, data = marketFixture(), p = policy, detail?: "ALLOCATION_V2") =>
  (await simulate(c, data, p, paths, 0, detail)).status === "READY";

beforeEach(() => clearSimulationCache());
afterEach(() => clearSimulationCache());

describe("RNG state can be read and restored", () => {
  it("keeps the original sequence and continues exactly from a saved state", () => {
    const a = randomGenerator(SEED), seen = Array.from({ length: 5 }, () => a());
    const state = a.getState(), rest = Array.from({ length: 5 }, () => a());
    const b = randomGenerator(SEED); b.setState(state);
    expect(Array.from({ length: 5 }, () => b())).toEqual(rest);
    const c = randomGenerator(SEED);
    expect(Array.from({ length: 5 }, () => c())).toEqual(seen);
  });
});

describe("progressive simulation with exact reuse", () => {
  it("20 then 50 paths equals a one-shot 50, and the 50-run only computes the missing 30", async () => {
    const data = marketFixture(), c = context();
    const oneShot = ready(await simulate(c, data, policy, 50, undefined, "ALLOCATION_V2"));
    expect(oneShot.pEssential).toBeGreaterThan(0); expect(oneShot.pEssential).toBeLessThan(1);
    clearSimulationCache();
    const first = ready(await simulate(c, data, policy, 20, undefined, "ALLOCATION_V2"));
    expect(first.paths).toBe(20);
    expect(await fullyCached(c, 20, data, policy, "ALLOCATION_V2")).toBe(true);
    // 50 needs 30 more paths; with no time left only the 20 cached ones are available.
    expect(await simulate(c, data, policy, 50, 0, "ALLOCATION_V2")).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"], progress: { pathsCompleted: 20, pathsRequested: 50 } });
    const merged = ready(await simulate(c, data, policy, 50, undefined, "ALLOCATION_V2"));
    expect(merged).toEqual(oneShot);
    expect(merged.pAll).toBe(oneShot.pAll);
  });
  it("50 then 20 returns exactly the 20-path prefix result", async () => {
    const data = marketFixture(), c = context();
    const fresh20 = ready(await simulate(c, data, policy, 20)); clearSimulationCache();
    ready(await simulate(c, data, policy, 50));
    expect(ready(await simulate(c, data, policy, 20))).toEqual(fresh20);
  });
  it("a deadline mid-run keeps finished paths; repeating the request finishes with the one-shot result", async () => {
    const data = marketFixture(), c = context(), total = 120;
    const oneShot = ready(await simulate(c, data, policy, total)); clearSimulationCache();
    let calls = 0, previous = 0, partials = 0, last: Awaited<ReturnType<typeof simulate>> | undefined;
    while (calls++ < 3000) {
      last = await simulate(c, data, policy, total, performance.now() + 2);
      if (last.status === "READY") break;
      expect(last).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"] });
      const progress = (last as { progress: { pathsCompleted: number; pathsRequested: number } }).progress;
      expect(progress.pathsRequested).toBe(total); expect(progress.pathsCompleted).toBeGreaterThanOrEqual(previous); expect(progress).not.toHaveProperty("pEssential");
      previous = progress.pathsCompleted; partials++;
    }
    expect(partials).toBeGreaterThan(0);
    expect(last).toEqual(oneShot);
  });
  it("an aborted run keeps its finished paths", async () => {
    const data = marketFixture(), c = context(), controller = new AbortController();
    setTimeout(() => controller.abort(), 3);
    const aborted = await simulate(c, data, policy, 400, undefined, undefined, controller.signal);
    expect(aborted).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["SIMULATION_ABORTED"] });
    expect(simulationCacheStats().entries).toBe(1); expect(simulationCacheStats().bytes).toBeGreaterThan(0);
  });
  it("does not share records between different inputs", async () => {
    const data = marketFixture(), c = context();
    ready(await simulate(c, data, policy, 20));
    expect(await fullyCached(c, 20)).toBe(true);
    const targets = context(); targets.targets = targets.targets.map(() => [{ assetClass: "CASH", weightPercent: "40" }, { assetClass: "EQUITY", weightPercent: "60" }]);
    const market = marketFixture(); market.rows[3].returns.EQUITY = "-0.2";
    const blocks = riskPolicySchema.parse({ evidence: "Test-only policy", blockMonths: 24, cvarAlpha: "0.95", essentialThreshold: "0.90" });
    const alpha = riskPolicySchema.parse({ evidence: "Test-only policy", blockMonths: 12, cvarAlpha: "0.9", essentialThreshold: "0.90" });
    const rebalance = context(); rebalance.rebalance = rebalance.rebalance.map(() => false);
    const cost = context(); cost.turnoverCostPercent = "1";
    const horizon = context(); horizon.projection.initialCapital = "2600";
    const band = context(); band.rebalanceBandPoints = "5";
    expect(await fullyCached(targets, 20)).toBe(false);
    expect(await fullyCached(c, 20, market)).toBe(false);
    expect(await fullyCached(c, 20, marketFixture(), blocks)).toBe(false);
    expect(await fullyCached(c, 20, marketFixture(), alpha)).toBe(false);
    expect(await fullyCached(c, 20, marketFixture(), policy, "ALLOCATION_V2")).toBe(false);
    for (const other of [rebalance, cost, horizon, band]) expect(await fullyCached(other, 20)).toBe(false);
    // The untouched inputs are still cached afterwards, and mutating a copy never changed the original key.
    expect(await fullyCached(c, 20)).toBe(true);
    // Same inputs rebuilt from scratch (different object identity) share the cache.
    expect(await fullyCached(context(), 20, marketFixture())).toBe(true);
  });
  it("evicts least recently used entries under the memory cap and expires them after the TTL", async () => {
    const variants = [40, 50, 60, 70].map(w => { const c = context(); c.targets = c.targets.map(() => [{ assetClass: "CASH", weightPercent: String(100 - w) }, { assetClass: "EQUITY", weightPercent: String(w) }]); return c; });
    ready(await simulate(variants[0], marketFixture(), policy, 20));
    const oneEntry = simulationCacheStats().bytes;
    // Room for two entries (20 paths x 24 months each), not three.
    configureSimulationCache({ maxBytes: Math.floor(oneEntry * 2.5) });
    ready(await simulate(variants[1], marketFixture(), policy, 20));
    expect(await fullyCached(variants[0], 20)).toBe(true); // touch: variant 1 becomes least recently used
    ready(await simulate(variants[2], marketFixture(), policy, 20));
    ready(await simulate(variants[3], marketFixture(), policy, 20));
    const stats = simulationCacheStats();
    expect(stats.bytes).toBeLessThanOrEqual(stats.maxBytes); expect(stats.entries).toBeLessThanOrEqual(2);
    expect(await fullyCached(variants[1], 20)).toBe(false);
    expect(await fullyCached(variants[3], 20)).toBe(true);
    // TTL
    clearSimulationCache();
    let now = 1_000_000; configureSimulationCache({ now: () => now, ttlMs: 30 * 60 * 1000 });
    ready(await simulate(variants[0], marketFixture(), policy, 20));
    now += 29 * 60 * 1000; expect(await fullyCached(variants[0], 20)).toBe(true);
    now += 31 * 60 * 1000; expect(await fullyCached(variants[0], 20)).toBe(false);
  });
  it("keeps the 1,000 path request within the sanity cap and rejects above it", async () => {
    expect(await simulate(context(), marketFixture(), policy, 1001)).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["PATH_MONTH_LIMIT"] });
    expect(await simulate(context(1400), marketFixture(), policy, 1000)).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["PATH_MONTH_LIMIT"] });
    expect(simulationCacheStats().entries).toBe(0);
  });
});

describe("continuation rate limiter", () => {
  const plan = { kind: "SAVED_VERSION", planId: "00000000-0000-4000-8000-000000000001", versionId: "00000000-0000-4000-8000-000000000002" };
  const saved = { runs: process.env.RISK_RUNS_PER_MINUTE, continuations: process.env.RISK_CONTINUATIONS_PER_MINUTE };
  afterEach(() => {
    for (const [name, value] of [["RISK_RUNS_PER_MINUTE", saved.runs], ["RISK_CONTINUATIONS_PER_MINUTE", saved.continuations]] as const)
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
  });
  function app() {
    const server = express(); server.use(express.json());
    server.use((req, _res, next) => { (req as unknown as { user: { userId: string } }).user = { userId: String(req.headers["x-user"] ?? "u1") }; next(); });
    server.use("/risk", allocationRiskRouter({ run: async () => ({ status: "READY" }) } as never));
    server.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(error instanceof AppError ? error.status : (error as { name?: string }).name === "ZodError" ? 400 : 500).json({ error: { code: error instanceof AppError ? error.code : "ERR" } }));
    return server;
  }
  it("keeps the 3/min heavy limiter and gives continuations their own 20/min budget per account", async () => {
    delete process.env.RISK_RUNS_PER_MINUTE; delete process.env.RISK_CONTINUATIONS_PER_MINUTE;
    const server = app(), post = (body: object, user = "u1") => request(server).post("/risk/selection").set("x-user", user).send(body).then(r => r.status);
    expect([await post({ plan }), await post({ plan }), await post({ plan }), await post({ plan })]).toEqual([200, 200, 200, 429]);
    // Heavy budget exhausted, continuations are unaffected until their own budget is used.
    const continuations: number[] = []; for (let i = 0; i < 21; i++) continuations.push(await post({ plan, paths: 50, continuation: true }));
    expect(continuations.slice(0, 20).every(s => s === 200)).toBe(true); expect(continuations[20]).toBe(429);
    expect(await post({ plan, continuation: false })).toBe(429);
    // Other accounts have their own counters, and the continuation flag is part of the validated schema.
    expect(await post({ plan, paths: 50, continuation: true }, "u2")).toBe(200);
    expect(await post({ plan, continuation: "yes" }, "u3")).toBe(400);
  });
  it("RISK_CONTINUATIONS_PER_MINUTE tunes the continuation limit", async () => {
    process.env.RISK_CONTINUATIONS_PER_MINUTE = "2";
    const server = app(), post = () => request(server).post("/risk/simulation").send({ plan, continuation: true }).then(r => r.status);
    expect([await post(), await post(), await post()]).toEqual([200, 200, 429]);
  });
});
