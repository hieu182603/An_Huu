// PUBLISHED policy/assumption versions are immutable through the API (only
// DRAFT -> APPROVED -> PUBLISHED transitions exist), so their parsed, hash-checked
// view can be reused per id instead of reloading and re-hashing the document on
// every preview. The TTL bounds staleness if a row is edited out of band (e.g.
// local verification scripts); tamper checks run again on the next miss.
// Callers receive a clone so a mutation can never poison the shared copy.
export class PublishedCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(private ttlMs = 10 * 60_000, private max = 64) {}
  get(id: string): T | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) { this.entries.delete(id); return undefined; }
    return structuredClone(entry.value);
  }
  set(id: string, value: T) {
    this.entries.delete(id);
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(id, { value: structuredClone(value), expires: Date.now() + this.ttlMs });
  }
  clear() { this.entries.clear(); }
}
