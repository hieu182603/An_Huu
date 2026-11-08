import { afterAll, describe, expect, it, vi } from "vitest";
import { PreviewCache } from "../modules/retirement/preview-cache";
import { createPreviewPool, type PreviewPool } from "../modules/retirement/preview-pool";
import { RetirementService, type PreviewResult } from "../modules/retirement/service";
import { plansFixture } from "./plans-fixtures";

describe("preview cache", () => {
  it("reuses a finished result, shares a running one and does not keep failures", async () => {
    const cache = new PreviewCache<number>();
    let calls = 0;
    const slow = () => new Promise<number>(resolve => setTimeout(() => resolve(++calls), 20));
    const [a, b] = await Promise.all([cache.get("k", slow), cache.get("k", slow)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    expect(await cache.get("k", slow)).toBe(1);
    await expect(cache.get("bad", () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await cache.get("bad", async () => 7)).toBe(7);
  });

  it("evicts the least recently used entry and expires old ones", async () => {
    const cache = new PreviewCache<string>(2, 1000);
    await cache.get("a", async () => "a"); await cache.get("b", async () => "b");
    await cache.get("a", async () => "a2"); // touch a
    await cache.get("c", async () => "c");  // evicts b
    expect(await cache.get("b", async () => "b2")).toBe("b2");
    expect(cache.size).toBe(2);
    vi.useFakeTimers({ now: Date.now() });
    vi.advanceTimersByTime(1001);
    expect(await cache.get("c", async () => "c2")).toBe("c2");
    vi.useRealTimers();
  });

  it("keys on every input so a changed request, option or profile revision is recomputed", () => {
    const base = { userId: "u", revision: 1, input: { x: 1 }, options: { adjustments: false } };
    const key = PreviewCache.key(base);
    expect(PreviewCache.key({ ...base })).toBe(key);
    for (const changed of [{ ...base, revision: 2 }, { ...base, userId: "v" }, { ...base, input: { x: 2 } }, { ...base, options: { adjustments: true } }])
      expect(PreviewCache.key(changed)).not.toBe(key);
  });

  it("still captures and checks the profile revision on every call, computing only once", async () => {
    const f = await plansFixture();
    const runner = vi.fn(async (snapshot: any, input: any, options: any) => new RetirementService(null as never).previewCaptured(snapshot, input, options) as PreviewResult);
    const service = new RetirementService(f.db, runner, new PreviewCache());
    const first = await service.preview(f.owner, f.command.preview, { adjustments: false });
    const second = await service.preview(f.owner, f.command.preview, { adjustments: false });
    expect(second).toEqual(first);
    expect(runner).toHaveBeenCalledTimes(1);
    await service.preview(f.owner, f.command.preview, { adjustments: true });
    expect(runner).toHaveBeenCalledTimes(2);
    await expect(service.preview(f.owner, { ...f.command.preview, expectedProfileRevision: f.command.preview.expectedProfileRevision + 1 }, { adjustments: false }))
      .rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(runner).toHaveBeenCalledTimes(2);
  });
});

describe("preview pool warm-up", () => {
  const pools: PreviewPool[] = [];
  afterAll(() => Promise.all(pools.map(p => p.close())));
  it("starts the workers before the first request and still computes normally", async () => {
    const pool = createPreviewPool({ size: 1, timeoutMs: 60_000 }); pools.push(pool);
    await pool.warm(60_000);
    const f = await plansFixture(), capture = await f.retirement.capture(f.db, f.owner, f.command.preview);
    const started = Date.now();
    await expect(pool.run(capture, f.command.preview, { adjustments: false })).resolves.toMatchObject({ status: "READY" });
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 120_000);
  it("lets a plain preview overtake queued adjustment searches", async () => {
    const pool = createPreviewPool({ size: 1, timeoutMs: 60_000 }); pools.push(pool);
    const f = await plansFixture(), capture = await f.retirement.capture(f.db, f.owner, f.command.preview), input = f.command.preview;
    const order: string[] = [];
    const track = (name: string, p: Promise<unknown>) => p.then(() => { order.push(name); });
    const running = track("search-1", pool.run(capture, input, { adjustments: true }));
    const queuedSearch = track("search-2", pool.run(capture, input, { adjustments: true }));
    const plain = track("plain", pool.run(capture, input, { adjustments: false }));
    await Promise.all([running, queuedSearch, plain]);
    expect(order).toEqual(["search-1", "plain", "search-2"]);
  }, 120_000);
});
