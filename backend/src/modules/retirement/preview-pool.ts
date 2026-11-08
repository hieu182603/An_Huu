import path from "node:path";
import { Worker } from "node:worker_threads";
import { AppError } from "../../common/errors";
import { log } from "../../common/logger";
import type { PreviewOptions, PreviewResult, PreviewRunner, PreviewSnapshot } from "./service";
import type { RetirementPreview } from "./schema";

export type PreviewJob = { snapshot: PreviewSnapshot; input: RetirementPreview; options: PreviewOptions };
export type PreviewReply = { id: number; ready?: true; result?: unknown; error?: { status?: number; code?: string; message: string } };
type Task = { id: number; job: PreviewJob; resolve: (value: PreviewResult) => void; reject: (error: Error) => void };
type Slot = { worker: Worker; task?: Task; timer?: NodeJS.Timeout; ready: Promise<void> };

// Under ts-node (dev) and Vitest this file is .ts, so the worker registers ts-node
// itself; the compiled server (dist) loads the .js worker directly.
const entry = path.join(__dirname, `preview-worker${path.extname(__filename)}`);
const spawnWorker = () => entry.endsWith(".ts")
  ? new Worker(`require("ts-node").register({ transpileOnly: true }); require(${JSON.stringify(entry)});`, { eval: true })
  : new Worker(entry);

/**
 * A preview with its adjustment search is ~100 synchronous projections. On the
 * request thread that froze every other request and socket for minutes, so the
 * computation runs on a small fixed pool. Workers start lazily; a timed-out worker
 * is terminated (sync code cannot be interrupted otherwise) and replaced.
 */
export function createPreviewPool({ size, timeoutMs, maxQueue = 32 }: { size: number; timeoutMs: number; maxQueue?: number }) {
  const slots: Slot[] = [], queue: Task[] = [];
  let nextId = 0, closing = false;

  const settle = (slot: Slot, reply: PreviewReply) => {
    const task = slot.task;
    if (!task || task.id !== reply.id) return;
    clearTimeout(slot.timer); slot.task = undefined;
    if (reply.error) task.reject(reply.error.status && reply.error.code
      ? new AppError(reply.error.status, reply.error.code, reply.error.message) : new Error(reply.error.message));
    else task.resolve(reply.result as PreviewResult);
    dispatch();
  };
  const fail = (slot: Slot, error: Error) => {
    const task = slot.task;
    clearTimeout(slot.timer); slot.task = undefined;
    task?.reject(error);
  };
  const addSlot = () => {
    const worker = spawnWorker();
    let markReady!: () => void;
    const slot: Slot = { worker, ready: new Promise<void>(resolve => { markReady = resolve; }) };
    worker.once("exit", () => markReady());
    slot.worker.unref();
    slot.worker.on("message", (reply: PreviewReply) => reply.ready ? markReady() : settle(slot, reply));
    slot.worker.on("error", error => { log("error", "preview.worker_error", { cause: error.name }); fail(slot, error); });
    slot.worker.on("exit", () => {
      slots.splice(slots.indexOf(slot), 1);
      fail(slot, new AppError(503, "PREVIEW_UNAVAILABLE", "Bộ tính kế hoạch đang khởi động lại. Vui lòng thử lại."));
      if (!closing) dispatch();
    });
    slots.push(slot);
    return slot;
  };
  const start = (slot: Slot, task: Task) => {
    slot.task = task;
    slot.timer = setTimeout(() => {
      log("warn", "preview.worker_timeout", { durationMs: timeoutMs });
      fail(slot, new AppError(503, "PREVIEW_TIMEOUT", "Tính kế hoạch quá lâu. Vui lòng thử lại."));
      void slot.worker.terminate();
    }, timeoutMs);
    slot.worker.postMessage({ id: task.id, job: task.job });
  };
  function dispatch() {
    while (queue.length) {
      const slot = slots.find(s => !s.task) ?? (slots.length < size ? addSlot() : undefined);
      if (!slot) return;
      start(slot, queue.shift()!);
    }
  }
  const run: PreviewRunner = (snapshot, input, options) => new Promise((resolve, reject) => {
    if (closing) return reject(new AppError(503, "PREVIEW_UNAVAILABLE", "Máy chủ đang dừng."));
    if (queue.length >= maxQueue) return reject(new AppError(503, "PREVIEW_BUSY", "Đang có nhiều yêu cầu tính kế hoạch. Vui lòng thử lại sau ít phút."));
    const task = { id: nextId++, job: { snapshot, input, options }, resolve, reject };
    // A plain preview takes well under a second; the adjustment search can take many.
    // Plain previews therefore wait only behind other plain previews.
    const firstSearch = options.adjustments ? -1 : queue.findIndex(t => t.job.options.adjustments);
    if (firstSearch < 0) queue.push(task); else queue.splice(firstSearch, 0, task);
    dispatch();
  });
  /** Starts every worker ahead of the first request so no user pays for loading them.
   * Never throws: a worker that fails or exceeds the wait is simply started on demand later. */
  const warm = async (maxWaitMs = 30_000) => {
    while (!closing && slots.length < size) addSlot();
    let timer: NodeJS.Timeout | undefined;
    const startedAt = Date.now();
    await Promise.race([Promise.all(slots.map(s => s.ready)), new Promise<void>(resolve => { timer = setTimeout(resolve, maxWaitMs); })]);
    clearTimeout(timer);
    log("info", "preview.pool_warm", { batches: slots.length, durationMs: Date.now() - startedAt });
  };
  const close = async () => {
    closing = true;
    for (const task of queue.splice(0)) task.reject(new AppError(503, "PREVIEW_UNAVAILABLE", "Máy chủ đang dừng."));
    await Promise.all(slots.map(slot => slot.worker.terminate()));
  };
  return { run, warm, close };
}
export type PreviewPool = ReturnType<typeof createPreviewPool>;
