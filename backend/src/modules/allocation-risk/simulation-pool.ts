import path from "node:path";
import { availableParallelism } from "node:os";
import { setImmediate } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import { log } from "../../common/logger";
import type { PathRecord } from "./simulation-cache";

/**
 * Worker-thread pool for the Monte Carlo paths of one simulate() call.
 *
 * Only the expensive, pure part (runPath) moves to the workers. The bootstrap indices are still drawn on the main thread,
 * sequentially from the seeded generator, so path k is exactly what it is today; the per-path records come back in the same
 * shape the cache stores and are committed strictly in path order. Any worker problem falls back to inline computation.
 */
export type SimulationJob<C, H> = { context: C; history: H };
type WorkerMessage =
  | { t: "ready" }
  | { t: "done"; job: number; id: number; records: PathRecord[] }
  | { t: "fail"; job: number; id: number; message: string };
export type WorkerRequest<C = unknown, H = unknown> =
  | { t: "job"; job: number; context: C; history: H }
  | { t: "batch"; job: number; id: number; indices: number[][] }
  | { t: "release"; job: number };

/** Batches in flight per worker: two keeps a worker busy while the main thread yields between its own paths. */
const DEPTH = 2, MAX_CRASHES = 3, MAX_SIZE = 8;
/** SIM_WORKERS wins; else all cores but one (max 3) on a multi-core host; Vitest stays inline unless SIM_WORKERS is set. */
export function defaultSimulationWorkers(env: NodeJS.ProcessEnv = process.env, cpus = availableParallelism()) {
  const raw = env.SIM_WORKERS?.trim();
  if (raw) { const n = Number(raw); if (Number.isInteger(n) && n >= 0) return Math.min(n, MAX_SIZE); }
  if (env.NODE_ENV === "test") return 0;
  return cpus >= 2 ? Math.min(3, cpus - 1) : 0;
}

// Under ts-node (dev) and Vitest this file is .ts, so the worker registers ts-node itself; the compiled server loads the .js.
const entry = path.join(__dirname, `simulation-worker${path.extname(__filename)}`);
const spawnWorker = () => entry.endsWith(".ts")
  ? new Worker(`require("ts-node").register({ transpileOnly: true }); require(${JSON.stringify(entry)});`, { eval: true })
  : new Worker(entry);

type Pending = { session: Session; onDone: (records: PathRecord[]) => void; onFail: () => void };
type Slot = { worker: Worker; ready: boolean; dead: boolean; jobs: Set<number>; inflight: Map<number, Pending> };
const slots: Slot[] = [], sessions = new Set<Session>();
let configured: number | undefined, dispatched = 0, crashes = 0, disabled = false, nextJob = 0, nextBatch = 0, warned = false;

const warnOnce = (cause: string) => { if (!warned) { warned = true; log("warn", "worker.error", { cause }); } };
const poolSize = () => disabled ? 0 : configured ?? defaultSimulationWorkers();
const notify = () => { for (const s of [...sessions]) s.onChange?.(); };

function retire(slot: Slot) {
  if (slot.dead) return;
  slot.dead = true; slot.ready = false;
  const at = slots.indexOf(slot);
  if (at >= 0) slots.splice(at, 1);
  const lost = [...slot.inflight.values()];
  slot.inflight.clear();
  if (lost.length) { warnOnce("simulation_worker_lost"); crashes++; if (crashes >= MAX_CRASHES) disabled = true; }
  for (const p of lost) p.onFail();
  notify();
}
function addSlot() {
  const worker = spawnWorker();
  const slot: Slot = { worker, ready: false, dead: false, jobs: new Set(), inflight: new Map() };
  worker.unref();
  worker.on("message", (m: WorkerMessage) => {
    if (m.t === "ready") { slot.ready = true; notify(); return; }
    const pending = slot.inflight.get(m.id);
    if (!pending) return;
    slot.inflight.delete(m.id);
    if (m.t === "done") pending.onDone(m.records); else pending.onFail();
    notify();
  });
  worker.on("error", () => retire(slot));
  worker.on("exit", () => retire(slot));
  slots.push(slot);
}
function ensureSlots() {
  const size = poolSize();
  try { while (slots.length < size) addSlot(); }
  catch { warnOnce("simulation_worker_spawn_failed"); disabled = true; }
}

export class Session {
  onChange?: () => void;
  /** Batches dispatched to workers and not yet answered. */
  pending = 0;
  closed = false;
  broken = false;
  constructor(private readonly job: number, private readonly context: unknown, private readonly history: unknown) {}
  private pick() {
    let best: Slot | undefined;
    for (const s of slots) if (s.ready && !s.dead && s.inflight.size < DEPTH && (!best || s.inflight.size < best.inflight.size)) best = s;
    return best;
  }
  hasCapacity() { return !this.closed && !this.broken && this.pick() !== undefined; }
  /** Sends one batch of bootstrap index lists to an idle worker; false when none is available (caller computes inline). */
  dispatch(indices: number[][], onDone: (records: PathRecord[]) => void, onFail: () => void): boolean {
    const slot = this.closed || this.broken ? undefined : this.pick();
    if (!slot) return false;
    const id = nextBatch++;
    try {
      // Context and market travel once per worker and job; batches then carry only index lists.
      if (!slot.jobs.has(this.job)) { slot.worker.postMessage({ t: "job", job: this.job, context: this.context, history: this.history } satisfies WorkerRequest); slot.jobs.add(this.job); }
      slot.worker.postMessage({ t: "batch", job: this.job, id, indices } satisfies WorkerRequest);
    } catch {
      this.broken = true; warnOnce("simulation_worker_post_failed");
      return false;
    }
    this.pending++; dispatched++;
    let settled = false;
    const settle = (fn: () => void) => () => { if (settled) return; settled = true; this.pending--; if (!this.closed) fn(); };
    slot.inflight.set(id, { session: this, onDone: records => settle(() => onDone(records))(), onFail: settle(onFail) });
    return true;
  }
  close() {
    if (this.closed) return;
    this.closed = true; sessions.delete(this);
    for (const s of slots) if (s.jobs.delete(this.job) && !s.dead) { try { s.worker.postMessage({ t: "release", job: this.job } satisfies WorkerRequest); } catch { /* worker is going away */ } }
  }
}
/** A session for one simulate() call, or null when the pool is off (size 0, disabled or unusable): compute inline. */
export function openSimulationSession<C, H>(job: SimulationJob<C, H>): Session | null {
  if (poolSize() < 1) return null;
  ensureSlots();
  if (poolSize() < 1) return null;
  const session = new Session(++nextJob, job.context, job.history);
  sessions.add(session);
  return session;
}

export type ParallelOutcome = "DONE" | "DEADLINE" | "ABORTED";
type Item = { index: number; indices: number[]; state: number };
const BATCH = 2, POLL_MS = 250, HARD_GRACE_MS = 5000;
/**
 * Computes paths start..end-1: draws on this thread in path order, hands batches to workers and also computes paths itself
 * (yielding with setImmediate after each). `commit` is called strictly in path order. Stops dispatching at the deadline or on
 * abort; only the contiguous prefix is committed (records after a gap are dropped, the saved RNG state stays consistent).
 */
export async function runParallel(session: Session, o: {
  start: number; end: number; draw: () => { indices: number[]; state: number };
  compute: (indices: number[]) => PathRecord; commit: (index: number, record: PathRecord, state: number) => void;
  deadline: number; signal?: AbortSignal;
}): Promise<ParallelOutcome> {
  const results = new Map<number, { record: PathRecord; state: number }>(), retry: Item[] = [];
  let committed = o.start, nextDraw = o.start, stopped: ParallelOutcome | null = null, wake: (() => void) | undefined, fatal: unknown;
  const drawItem = (): Item => { const index = nextDraw++, d = o.draw(); return { index, indices: d.indices, state: d.state }; };
  const flush = () => {
    for (let r = results.get(committed); r; r = results.get(committed)) { results.delete(committed); o.commit(committed, r.record, r.state); committed++; }
  };
  const requeue = (items: Item[]) => { retry.push(...items); retry.sort((a, b) => a.index - b.index); };
  const pump = () => {
    while (!stopped && nextDraw < o.end && session.hasCapacity()) {
      const items: Item[] = [];
      for (let k = 0; k < BATCH && nextDraw < o.end; k++) items.push(drawItem());
      const ok = session.dispatch(items.map(i => i.indices),
        records => { if (records.length === items.length) items.forEach((item, k) => results.set(item.index, { record: records[k], state: item.state })); else requeue(items); },
        () => requeue(items));
      if (!ok) { requeue(items); return; }
    }
  };
  session.onChange = () => { try { pump(); } catch (error) { fatal = error; } wake?.(); };
  const hardLimit = o.deadline + HARD_GRACE_MS;
  try {
    for (;;) {
      if (fatal) throw fatal;
      flush();
      const remaining = nextDraw < o.end || retry.length > 0;
      if (remaining && !stopped) { if (o.signal?.aborted) stopped = "ABORTED"; else if (performance.now() >= o.deadline) stopped = "DEADLINE"; }
      if (stopped === "ABORTED") break;
      pump();
      const item = stopped ? undefined : retry.shift() ?? (nextDraw < o.end ? drawItem() : undefined);
      if (item) { results.set(item.index, { record: o.compute(item.indices), state: item.state }); await setImmediate(); continue; }
      if (session.pending === 0) break;
      if (stopped && performance.now() > hardLimit) break;
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, POLL_MS); wake = () => { clearTimeout(timer); resolve(); }; });
    }
    if (fatal) throw fatal;
    flush();
    return committed >= o.end ? "DONE" : stopped ?? "DEADLINE";
  } finally { session.onChange = undefined; session.close(); }
}

/** Starts the workers ahead of the first request. Never throws. */
export async function warmSimulationPool(maxWaitMs = 30_000) {
  ensureSlots();
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline && slots.some(s => !s.ready && !s.dead)) await new Promise<void>(resolve => setTimeout(resolve, 20));
}
/** Overrides SIM_WORKERS at runtime (tests, operations); resets crash accounting and stops the current workers. */
export async function configureSimulationPool(options: { size?: number }) {
  await shutdownSimulationPool();
  configured = options.size; crashes = 0; disabled = false; warned = false;
}
export async function shutdownSimulationPool() {
  for (const s of [...sessions]) s.close();
  await Promise.all(slots.splice(0).map(async s => { s.dead = true; const lost = [...s.inflight.values()]; s.inflight.clear(); await s.worker.terminate(); lost.forEach(p => p.onFail()); }));
}
export function simulationPoolStats() { return { size: poolSize(), dispatched, workers: slots.length, ready: slots.filter(s => s.ready).length, busy: slots.filter(s => s.inflight.size > 0).length, crashes, disabled }; }
/** Test hook: terminates every worker thread (simulates a crash). */
export async function terminateSimulationWorkersForTest() { await Promise.all(slots.map(s => s.worker.terminate())); }
