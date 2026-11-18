import { afterAll, describe, expect, it } from "vitest";
import { plansFixture } from "./plans-fixtures";
import { createPreviewPool, PreviewRetryableError, type PreviewPool } from "../modules/retirement/preview-pool";
import { createErrorHandler } from "../middlewares/errorHandler";
import { RetirementService } from "../modules/retirement/service";

const pools: PreviewPool[] = [];
const pool = (options: Parameters<typeof createPreviewPool>[0]) => { const p = createPreviewPool(options); pools.push(p); return p; };
afterAll(() => Promise.all(pools.map(p => p.close())));
async function job() {
  const f = await plansFixture();
  return { capture: await f.retirement.capture(f.db, f.owner, f.command.preview), input: f.command.preview };
}

describe("retirement preview worker pool", () => {
  it("returns exactly the JSON the request thread produces, with and without the adjustment search", async () => {
    const { capture, input } = await job(), inline = new RetirementService(null as never), workers = pool({ size: 1, timeoutMs: 60_000 });
    for (const adjustments of [true, false]) {
      const expected = JSON.parse(JSON.stringify(inline.previewCaptured(capture, input, { adjustments })));
      expect(Object.hasOwn(expected, "adjustmentOptions")).toBe(adjustments);
      expect(await workers.run(capture, input, { adjustments })).toEqual(expected);
    }
  }, 60_000);

  it("terminates a worker that exceeds the time limit and reports a retryable error", async () => {
    const { capture, input } = await job();
    await expect(pool({ size: 1, timeoutMs: 1 }).run(capture, input, { adjustments: true }))
      .rejects.toMatchObject({ status: 503, code: "PREVIEW_TIMEOUT" });
  }, 60_000);

  it("bounds the waiting adjustment-search queue and rejects queued work on shutdown", async () => {
    const { capture, input } = await job(), workers = pool({ size: 1, timeoutMs: 60_000, maxQueue: 1 });
    const running = workers.run(capture, input, { adjustments: true });
    const queued = workers.run(capture, input, { adjustments: true });
    await expect(workers.run(capture, input, { adjustments: true })).rejects.toMatchObject({ status: 503, code: "PREVIEW_BUSY" });
    await expect(running).resolves.toMatchObject({ status: "READY" });
    await expect(queued).resolves.toMatchObject({ status: "READY" });
    const busy = workers.run(capture, input, { adjustments: true }), waiting = workers.run(capture, input, { adjustments: true });
    busy.catch(() => {}); // Terminated mid-flight by close; only the queued job's rejection is asserted.
    const waitingRejected = expect(waiting).rejects.toMatchObject({ status: 503, code: "PREVIEW_UNAVAILABLE" });
    await workers.close();
    await waitingRejected;
    await expect(workers.run(capture, input, { adjustments: true })).rejects.toMatchObject({ code: "PREVIEW_UNAVAILABLE" });
  }, 60_000);

  it("never makes a plain preview wait for a running adjustment search", async () => {
    const { capture, input } = await job(), workers = pool({ size: 1, timeoutMs: 60_000 });
    const search = { ...input, monthlyExpenseToday: String(Number(input.monthlyExpenseToday) * 50) };
    // Two concurrent plain previews start both the regular and the plain-only worker.
    await Promise.all([workers.run(capture, input, { adjustments: false }), workers.run(capture, input, { adjustments: false })]);
    const order: string[] = [];
    const track = (name: string, p: Promise<unknown>) => p.then(r => { order.push(name); return r; });
    const results = await Promise.all([
      track("searchA", workers.run(capture, search, { adjustments: true })),
      track("searchB", workers.run(capture, search, { adjustments: true })),
      track("plain", workers.run(capture, input, { adjustments: false })),
    ]);
    expect(results.every(r => (r as { status: string }).status === "READY")).toBe(true);
    // At most one search runs at a time on size 1, so B waits for A; the plain preview does not.
    expect(order.indexOf("plain")).toBeLessThan(order.indexOf("searchB"));
  }, 60_000);

  it("drains running previews on shutdown and turns away new ones with Retry-After", async () => {
    const { capture, input } = await job(), workers = pool({ size: 1, timeoutMs: 60_000 });
    await workers.warm();
    const running = workers.run(capture, input, { adjustments: false });
    const closed = workers.close(60_000);
    const rejected = await workers.run(capture, input, { adjustments: false }).catch((e: unknown) => e);
    expect(rejected).toBeInstanceOf(PreviewRetryableError);
    expect(rejected).toMatchObject({ status: 503, code: "PREVIEW_UNAVAILABLE", retryAfterSeconds: 10 });
    await expect(running).resolves.toMatchObject({ status: "READY" });
    await closed;
  }, 60_000);

  it("rejects a preview still running when the drain grace period ends", async () => {
    const { capture, input } = await job(), workers = pool({ size: 1, timeoutMs: 60_000 });
    const running = workers.run(capture, input, { adjustments: true });
    const rejected = expect(running).rejects.toMatchObject({ code: "PREVIEW_UNAVAILABLE", retryAfterSeconds: 10 });
    await workers.close(1);
    await rejected;
  }, 60_000);

  it("serializes retryable preview errors with a Retry-After header", () => {
    const headers: Record<string, string> = {};
    let status = 0, body: unknown;
    const res = { headersSent: false, locals: { requestId: "r1" }, set: (k: string, v: string) => { headers[k] = v; return res; },
      status: (s: number) => { status = s; return res; }, json: (b: unknown) => { body = b; return res; } };
    const handle = createErrorHandler();
    handle(new PreviewRetryableError("PREVIEW_BUSY", "busy", 30), { originalUrl: "/x", method: "POST" } as never, res as never, () => {});
    expect(status).toBe(503);
    expect(headers["Retry-After"]).toBe("30");
    expect(body).toMatchObject({ error: { code: "PREVIEW_BUSY" } });
  });
});
