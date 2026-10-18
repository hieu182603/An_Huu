// Each provider owns one cache: memory only, never shared across accounts or
// persisted. Keys include the whole source/input, raw value, detail and locale.
export function explanationRequestKey(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

export function createExplanationCache<T>(limit = 40, ttlMs = 5 * 60_000) {
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const cached = entries.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.promise;
      if (cached) entries.delete(key);
      const entry = { promise: null as unknown as Promise<T>, expiresAt: Infinity };
      entry.promise = Promise.resolve().then(load).then(result => {
        entry.expiresAt = Date.now() + ttlMs;
        return result;
      }).catch(error => {
        // A failed/evicted older request must not remove a newer retry.
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      entries.set(key, entry);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
      return entry.promise;
    },
    delete(key: string) { entries.delete(key); },
  };
}
