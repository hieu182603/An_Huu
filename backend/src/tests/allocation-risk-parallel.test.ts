import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { riskPolicySchema } from "../modules/allocation-risk/policy";
import { simulate, type RiskContext } from "../modules/allocation-risk/simulation";
import { clearSimulationCache } from "../modules/allocation-risk/simulation-cache";
import { configureSimulationPool, defaultSimulationWorkers, shutdownSimulationPool, simulationPoolStats, terminateSimulationWorkersForTest, warmSimulationPool } from "../modules/allocation-risk/simulation-pool";
import { marketFixture, riskContext } from "./allocation-risk-fixtures";

const policy = riskPolicySchema.parse({ evidence: "Test-only policy", blockMonths: 12, cvarAlpha: "0.95", essentialThreshold: "0.90" });
const context = (): RiskContext => { const c = riskContext(24); c.projection.initialCapital = "2500"; return c; };
const ready = <T extends { status: string }>(r: T) => { expect(r.status).toBe("READY"); return r as Extract<T, { status: "READY" }>; };
const inline = async (c: RiskContext, paths: number, detail?: "ALLOCATION_V2") => {
  await configureSimulationPool({ size: 0 }); clearSimulationCache();
  const result = ready(await simulate(c, marketFixture(), policy, paths, undefined, detail));
  clearSimulationCache();
  return result;
};
const withWorkers = async (size = 2) => { await configureSimulationPool({ size }); await warmSimulationPool(60_000); clearSimulationCache(); };

beforeEach(() => clearSimulationCache());
afterEach(() => clearSimulationCache());
afterAll(async () => { await shutdownSimulationPool(); await configureSimulationPool({}); });

describe("pool size", () => {
  it("defaults: SIM_WORKERS wins, tests stay inline, multi-core hosts use all cores but one (max 3)", () => {
    expect(defaultSimulationWorkers({ SIM_WORKERS: "2" } as never, 1)).toBe(2);
    expect(defaultSimulationWorkers({ SIM_WORKERS: "0" } as never, 16)).toBe(0);
    expect(defaultSimulationWorkers({ NODE_ENV: "test" } as never, 16)).toBe(0);
    expect(defaultSimulationWorkers({} as never, 1)).toBe(0);
    expect(defaultSimulationWorkers({} as never, 2)).toBe(1);
    expect(defaultSimulationWorkers({} as never, 3)).toBe(2);
    expect(defaultSimulationWorkers({ NODE_ENV: "production" } as never, 16)).toBe(3);
    expect(defaultSimulationWorkers({ SIM_WORKERS: "abc" } as never, 4)).toBe(3);
  });
});

describe("simulate on worker threads is bit-identical to inline", () => {
  beforeAll(async () => { await withWorkers(2); }, 90_000);

  it("20 and 50 paths deep-equal the inline result and really use the workers", async () => {
    const c = context(), expected20 = await inline(c, 20), expected50 = await inline(c, 50, "ALLOCATION_V2");
    await withWorkers(2);
    const before = simulationPoolStats().dispatched;
    expect(ready(await simulate(c, marketFixture(), policy, 20))).toEqual(expected20);
    expect(simulationPoolStats().dispatched).toBeGreaterThan(before);
    clearSimulationCache();
    expect(ready(await simulate(c, marketFixture(), policy, 50, undefined, "ALLOCATION_V2"))).toEqual(expected50);
  }, 90_000);

  it("20 then 50 with workers equals a one-shot 50 and the result is identical", async () => {
    const c = context(), oneShot = await inline(c, 50);
    await withWorkers(2);
    ready(await simulate(c, marketFixture(), policy, 20));
    expect(ready(await simulate(c, marketFixture(), policy, 50))).toEqual(oneShot);
  }, 90_000);

  it("a deadline mid-run keeps a contiguous prefix and resuming finishes with the one-shot result", async () => {
    const c = context(), total = 120, oneShot = await inline(c, total);
    await withWorkers(2);
    let calls = 0, previous = 0, partials = 0, last: Awaited<ReturnType<typeof simulate>> | undefined;
    while (calls++ < 3000) {
      last = await simulate(c, marketFixture(), policy, total, performance.now() + 3);
      if (last.status === "READY") break;
      expect(last).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"] });
      const done = (last as { progress: { pathsCompleted: number } }).progress.pathsCompleted;
      expect(done).toBeGreaterThanOrEqual(previous); previous = done; partials++;
    }
    expect(partials).toBeGreaterThan(0);
    expect(last).toEqual(oneShot);
    // An already-expired deadline never dispatches anything and keeps what exists.
    expect(await simulate(c, marketFixture(), policy, total + 1, 0)).toMatchObject({ status: "LIMIT_EXCEEDED", progress: { pathsCompleted: total } });
  }, 90_000);

  it("abort stops without finishing; the saved prefix still resumes to the one-shot result", async () => {
    const c = context(), total = 300, oneShot = await inline(c, total);
    await withWorkers(2);
    const controller = new AbortController();
    expect(await simulate(c, marketFixture(), policy, total, undefined, undefined, AbortSignal.abort())).toMatchObject({ issues: ["SIMULATION_ABORTED"] });
    const run = simulate(c, marketFixture(), policy, total, undefined, undefined, controller.signal);
    setTimeout(() => controller.abort(), 15);
    const aborted = await run;
    expect(aborted).toMatchObject({ status: "LIMIT_EXCEEDED", issues: ["SIMULATION_ABORTED"] });
    expect(ready(await simulate(c, marketFixture(), policy, total))).toEqual(oneShot);
  }, 90_000);

  it("worker crash mid-run falls back to inline and returns the same result", async () => {
    const c = context(), total = 400, oneShot = await inline(c, total);
    await withWorkers(2);
    const run = simulate(c, marketFixture(), policy, total);
    for (let i = 0; i < 2000 && simulationPoolStats().busy === 0; i++) await new Promise(r => setTimeout(r, 1));
    await terminateSimulationWorkersForTest();
    expect(ready(await run)).toEqual(oneShot);
    expect(simulationPoolStats().crashes).toBeGreaterThan(0);
    // The pool recovers (fresh workers) or stays inline; either way the next run is still identical.
    clearSimulationCache();
    expect(ready(await simulate(c, marketFixture(), policy, total))).toEqual(oneShot);
  }, 90_000);

  it("repeated crashes disable the pool and everything keeps working inline", async () => {
    const c = context(), oneShot = await inline(c, 60);
    for (let round = 0; round < 3; round++) {
      await withWorkers(1);
      const run = simulate(c, marketFixture(), policy, 400);
      for (let i = 0; i < 2000 && simulationPoolStats().busy === 0; i++) await new Promise(r => setTimeout(r, 1));
      await terminateSimulationWorkersForTest(); await run;
      clearSimulationCache();
    }
    expect(ready(await simulate(c, marketFixture(), policy, 60))).toEqual(oneShot);
  }, 120_000);

  it("a path error is raised exactly like inline (workers do not swallow it)", async () => {
    const c = context(); c.targets = c.targets.map(() => [{ assetClass: "CASH", weightPercent: "50" }, { assetClass: "EQUITY", weightPercent: "40" }]);
    await configureSimulationPool({ size: 0 });
    const inlineError = await simulate(c, marketFixture(), policy, 10).then(() => null, e => (e as Error).message);
    expect(inlineError).toBeTruthy();
    await withWorkers(2);
    await expect(simulate(c, marketFixture(), policy, 10)).rejects.toThrow(inlineError!);
  }, 90_000);
});
