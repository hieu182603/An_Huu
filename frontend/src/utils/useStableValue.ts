import { useRef } from "react";

type AnyFn = (...args: never[]) => unknown;

/**
 * Context value helper: function fields get one stable wrapper that always calls
 * the latest implementation, and the object identity only changes when a data
 * field changes (Object.is). Consumers then re-render on data changes only.
 */
export function useStableValue<T extends Record<string, unknown>>(raw: T): T {
  const latest = useRef(raw);
  latest.current = raw;
  const wrappers = useRef(new Map<string, AnyFn>());
  const previous = useRef<T | null>(null);
  const next = {} as Record<string, unknown>;
  let changed = previous.current === null;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "function") {
      let wrapper = wrappers.current.get(key);
      if (!wrapper) {
        wrapper = ((...args: never[]) => (latest.current[key] as AnyFn)(...args)) as AnyFn;
        wrappers.current.set(key, wrapper);
      }
      next[key] = wrapper;
    } else {
      next[key] = value;
      if (!changed && !Object.is(previous.current![key], value)) changed = true;
    }
    if (!changed && !(key in previous.current!)) changed = true;
  }
  if (changed) previous.current = next as T;
  return previous.current!;
}
