import path from "node:path";
import { Worker } from "node:worker_threads";
import { AppError } from "../../common/errors";
import { log } from "../../common/logger";
import type { PreviewOptions, PreviewResult, PreviewRunner, PreviewSnapshot } from "./service";
import type { RetirementPreview } from "./schema";

export type PreviewJob = { snapshot: PreviewSnapshot; input: RetirementPreview; options: PreviewOptions };
export type PreviewReply = { id: number; ready?: true; result?: unknown; error?: { status?: number; code?: string; message: string } };
type Task = { id: number; job: PreviewJob; resolve: (value: PreviewResult) => void; reject: (error: Error) => void };
/** A 503 the client may retry; the error handler turns `retryAfterSeconds` into a Retry-After header. */
export class PreviewRetryableError extends AppError {
  constructor(code: string, message: string, public readonly retryAfterSeconds: number) { super(503, code, message); }
}
const restarting = () => new PreviewRetryableError("PREVIEW_UNAVAILABLE", "Bộ tính kế hoạch đang khởi động lại. Vui lòng thử lại.", 5);
const stopping = () => new PreviewRetryableError("PREVIEW_UNAVAILABLE", "Máy chủ đang dừng. Vui lòng thử lại sau giây lát.", 10);
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
  const idleWaiters: (() => void)[] = [];
  const notifyIdle = () => { if (!slots.some(s => s.task)) idleWaiters.splice(0).forEach(resolve => resolve()); };

  const settle = (slot: Slot, reply: PreviewReply) => {
    const task = slot.task;
    if (!task || task.id !== reply.id) return;
    clearTimeout(slot.timer); slot.task = undefined;
    if (reply.error) task.reject(reply.error.status && reply.error.code
      ? new AppError(reply.error.status, reply.error.code, reply.error.message) : new Error(reply.error.message));
    else task.resolve(reply.result as PreviewResult);
    dispatch();
    notifyIdle();
  };
  const fail = (slot: Slot, error: Error) => {
    const task = slot.task;
    clearTimeout(slot.timer); slot.task = undefined;
    task?.reject(error);
    notifyIdle();
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
      fail(slot, restarting());
      if (!closing) dispatch();
    });
    slots.push(slot);
    return slot;
  };
  const start = (slot: Slot, task: Task) => {
    slot.task = task;
    slot.timer = setTimeout(() => {
      log("warn", "preview.worker_timeout", { durationMs: timeoutMs });
      fail(slot, new PreviewRetryableError("PREVIEW_TIMEOUT", "Tính kế hoạch quá lâu. Vui lòng thử lại.", 5));
      void slot.worker.terminate();
    }, timeoutMs);
    slot.worker.postMessage({ id: task.id, job: task.job });
  };
  // Adjustment searches may occupy at most `size` workers. Plain previews may also use
  // one extra worker, started only when needed, so a 30-90 s search on a single worker
  // never makes a sub-second preview wait for it (they then share the CPU instead).
  const isSearch = (task: Task) => task.job.options.adjustments;
  function dispatch() {
    for (let i = 0; i < queue.length;) {
      const task = queue[i], search = isSearch(task);
      if (search && slots.filter(s => s.task && isSearch(s.task)).length >= size) { i++; continue; }
      const slot = slots.find(s => !s.task) ?? (slots.length < size + 1 ? addSlot() : undefined);
      if (!slot) return;
      queue.splice(i, 1);
      start(slot, task);
    }
  }
  const run: PreviewRunner = (snapshot, input, options) => new Promise((resolve, reject) => {
    if (closing) return reject(stopping());
    if (queue.length >= maxQueue) return reject(new PreviewRetryableError("PREVIEW_BUSY", "Đang có nhiều yêu cầu tính kế hoạch. Vui lòng thử lại sau ít phút.", 30));
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
  /** Stops accepting work, lets running previews finish for up to `graceMs` (a deploy
   * should not drop a computation that is nearly done), then terminates the workers.
   * Queued and new requests get a retryable 503. */
  const close = async (graceMs = 0) => {
    closing = true;
    for (const task of queue.splice(0)) task.reject(stopping());
    if (graceMs > 0 && slots.some(s => s.task)) {
      let timer: NodeJS.Timeout | undefined;
      const startedAt = Date.now();
      const drained = await Promise.race([
        new Promise<boolean>(resolve => idleWaiters.push(() => resolve(true))),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), graceMs); }),
      ]);
      clearTimeout(timer);
      log(drained ? "info" : "warn", "preview.pool_drain", { durationMs: Date.now() - startedAt });
    }
    for (const slot of slots) if (slot.task) fail(slot, stopping());
    await Promise.all(slots.map(slot => slot.worker.terminate()));
  };
  return { run, warm, close };
}
export type PreviewPool = ReturnType<typeof createPreviewPool>;
