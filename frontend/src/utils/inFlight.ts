type Entry = { promise: Promise<unknown>; controller: AbortController; users: number };
const inFlight = new Map<string, Entry>();

/**
 * Identical requests made while one is still running share that one network call.
 * A caller's abort only detaches that caller; the shared call is aborted once every
 * caller has aborted. Settled calls are forgotten, so nothing is cached.
 */
export function shareInFlight<T>(key: string, signal: AbortSignal | undefined, start: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { controller, users: 0, promise: Promise.resolve() };
    created.promise = start(controller.signal).finally(() => { if (inFlight.get(key) === created) inFlight.delete(key); });
    inFlight.set(key, created);
    entry = created;
  }
  const shared = entry;
  shared.users++;
  if (!signal) return shared.promise as Promise<T>;
  return new Promise<T>((resolve, reject) => {
    const detach = () => {
      reject(signal.reason);
      if (--shared.users > 0) return;
      if (inFlight.get(key) === shared) inFlight.delete(key);
      shared.controller.abort(signal.reason);
    };
    signal.addEventListener("abort", detach, { once: true });
    (shared.promise as Promise<T>).then(resolve, reject).finally(() => signal.removeEventListener("abort", detach));
  });
}
