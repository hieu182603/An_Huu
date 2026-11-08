import { createHash } from "node:crypto";

/**
 * Bounded memory cache for computed previews. The key covers the user, the captured
 * profile (with its revision), the pinned policy/assumption hashes, the request and the
 * options, so any change to an input produces a different key and a stale result is
 * never served. Identical requests that arrive while one is computing share it.
 */
export class PreviewCache<T> {
  private done = new Map<string, { value: T; expiresAt: number }>();
  private pending = new Map<string, Promise<T>>();
  constructor(private maxEntries = 32, private ttlMs = 15 * 60_000) {}

  static key(parts: unknown) {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  }

  async get(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.done.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      this.done.delete(key); this.done.set(key, hit); // most recently used last
      return hit.value;
    }
    if (hit) this.done.delete(key);
    const running = this.pending.get(key);
    if (running) return running;
    const promise = compute().then(value => {
      this.done.set(key, { value, expiresAt: Date.now() + this.ttlMs });
      while (this.done.size > this.maxEntries) this.done.delete(this.done.keys().next().value!);
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  get size() { return this.done.size; }
}
