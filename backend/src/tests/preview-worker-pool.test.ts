import { afterAll, describe, expect, it } from "vitest";
import { plansFixture } from "./plans-fixtures";
import { createPreviewPool, type PreviewPool } from "../modules/retirement/preview-pool";
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

  it("bounds the waiting queue and rejects queued work on shutdown", async () => {
    const { capture, input } = await job(), workers = pool({ size: 1, timeoutMs: 60_000, maxQueue: 1 });
    const running = workers.run(capture, input, { adjustments: false });
    const queued = workers.run(capture, input, { adjustments: false });
    await expect(workers.run(capture, input, { adjustments: false })).rejects.toMatchObject({ status: 503, code: "PREVIEW_BUSY" });
    await expect(running).resolves.toMatchObject({ status: "READY" });
    await expect(queued).resolves.toMatchObject({ status: "READY" });
    const busy = workers.run(capture, input, { adjustments: false }), waiting = workers.run(capture, input, { adjustments: false });
    busy.catch(() => {}); // Terminated mid-flight by close; only the queued job's rejection is asserted.
    const waitingRejected = expect(waiting).rejects.toMatchObject({ status: 503, code: "PREVIEW_UNAVAILABLE" });
    await workers.close();
    await waitingRejected;
    await expect(workers.run(capture, input, { adjustments: false })).rejects.toMatchObject({ code: "PREVIEW_UNAVAILABLE" });
  }, 60_000);
});
