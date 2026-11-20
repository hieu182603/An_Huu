import { createHash } from "node:crypto";

/**
 * Progressive Monte Carlo cache (spec 7.1, N >= 1,000 paths).
 *
 * simulate() re-seeds the RNG per call and every path draws a fixed number of random numbers, so path k is
 * identical whatever the requested N. Per-path records are therefore reusable: a run for N paths after a run
 * for m < N paths only computes paths m+1..N, continuing from the saved RNG state, and the merged result is
 * exactly the one-shot result.
 *
 * Module level on purpose (single server process): bounded by CACHE_MAX_BYTES with LRU eviction and a TTL.
 * It stores derived simulation records only, never request payloads.
 */
export type PathRecord = {
  funded: boolean;
  /** Funded, no unfunded withdrawal and terminal balance reached (all-goals success). */
  allFunded: boolean;
  /** Exact decimal string: CVaR is computed from these, never from floats. */
  essentialLossToday: string;
  /** Funded balance in today's VND per month. Float32 is enough: bands are display-only and rounded to 1,000,000 VND. */
  balances: Float32Array;
};
export type CacheEntry = { key: string; records: PathRecord[]; rngState: number | null; bytes: number; touchedAt: number };

export const CACHE_DEFAULTS = { maxBytes: 64 * 1024 * 1024, ttlMs: 30 * 60 * 1000 } as const;
let maxBytes: number = CACHE_DEFAULTS.maxBytes, ttlMs: number = CACHE_DEFAULTS.ttlMs, clock: () => number = () => Date.now();
const entries = new Map<string, CacheEntry>();
let totalBytes = 0;

const recordBytes = (r: PathRecord) => r.balances.byteLength + r.essentialLossToday.length * 2 + 64;
const ENTRY_OVERHEAD = 256;

export function simulationCacheKey(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
function drop(entry: CacheEntry) {
  if (entries.get(entry.key) === entry) { entries.delete(entry.key); totalBytes -= entry.bytes; }
}
function purge() {
  const now = clock();
  for (const entry of [...entries.values()]) if (now - entry.touchedAt > ttlMs) drop(entry);
}
function evict(keep: CacheEntry) {
  // Map iteration order is insertion order; touch() re-inserts, so the first entries are least recently used.
  for (const entry of entries.values()) {
    if (totalBytes <= maxBytes) return;
    if (entry !== keep) drop(entry);
  }
  // A single entry above the cap cannot be kept: its work is lost rather than breaking the memory bound.
  if (totalBytes > maxBytes) drop(keep);
}
function touch(entry: CacheEntry) {
  entry.touchedAt = clock();
  if (entries.get(entry.key) === entry) { entries.delete(entry.key); entries.set(entry.key, entry); }
}
/** Entry for the key (created empty when absent or expired). Never throws. */
export function getCacheEntry(key: string): CacheEntry {
  purge();
  let entry = entries.get(key);
  if (!entry) {
    entry = { key, records: [], rngState: null, bytes: ENTRY_OVERHEAD, touchedAt: clock() };
    entries.set(key, entry); totalBytes += entry.bytes;
  } else touch(entry);
  return entry;
}
/**
 * Append the next path's record and the RNG state after it. Synchronous, so check-and-append is atomic even if
 * two concurrent runs share an entry: callers append only when records.length equals their path index.
 */
export function appendRecord(entry: CacheEntry, record: PathRecord, rngState: number) {
  entry.records.push(record); entry.rngState = rngState;
  const added = recordBytes(record);
  entry.bytes += added;
  if (entries.get(entry.key) === entry) totalBytes += added;
  else { entries.set(entry.key, entry); totalBytes += entry.bytes; }
  touch(entry); purge(); evict(entry);
}
/** Test helper and operations hook: forget everything and restore default limits. */
export function clearSimulationCache() {
  entries.clear(); totalBytes = 0;
  maxBytes = CACHE_DEFAULTS.maxBytes; ttlMs = CACHE_DEFAULTS.ttlMs; clock = () => Date.now();
}
/** Test helper: override the memory cap, TTL or clock. */
export function configureSimulationCache(options: { maxBytes?: number; ttlMs?: number; now?: () => number }) {
  if (options.maxBytes !== undefined) maxBytes = options.maxBytes;
  if (options.ttlMs !== undefined) ttlMs = options.ttlMs;
  if (options.now) clock = options.now;
}
export function simulationCacheStats() { return { entries: entries.size, bytes: totalBytes, maxBytes, ttlMs }; }
