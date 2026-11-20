import { parentPort } from "node:worker_threads";
import { computePathRecord, type PathMarket, type RiskContext } from "./simulation";
import type { WorkerRequest } from "./simulation-pool";

// Pure computation: the main thread draws the bootstrap indices and owns the cache; no database client is created here.
const jobs = new Map<number, { context: RiskContext; history: PathMarket[] }>();
// Loading the module graph is the slow part of a cold worker; tell the pool it is done.
parentPort!.postMessage({ t: "ready" });
parentPort!.on("message", (m: WorkerRequest<RiskContext, PathMarket[]>) => {
  if (m.t === "job") { jobs.set(m.job, { context: m.context, history: m.history }); return; }
  if (m.t === "release") { jobs.delete(m.job); return; }
  const job = jobs.get(m.job);
  try {
    if (!job) throw new Error("Unknown simulation job");
    const records = m.indices.map(indices => computePathRecord(job.context, indices.map(i => job.history[i])));
    parentPort!.postMessage({ t: "done", job: m.job, id: m.id, records }, records.map(r => r.balances.buffer as ArrayBuffer));
  } catch (error) {
    // The main thread recomputes the batch inline, which raises the same error as a purely inline run would.
    parentPort!.postMessage({ t: "fail", job: m.job, id: m.id, message: error instanceof Error ? error.message : String(error) });
  }
});
