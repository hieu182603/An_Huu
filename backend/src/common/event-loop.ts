import { performance } from "node:perf_hooks";
import { log } from "./logger";

/**
 * Logs how long the event loop was stuck once it runs again. A blocked loop
 * cannot log while blocked; the request that caused it is identified by its own
 * slow http.request/http.aborted line, logged around the same time.
 */
export function watchEventLoop({ thresholdMs = 2000, intervalMs = 500 } = {}) {
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), lag = now - last - intervalMs;
    last = now;
    if (lag >= thresholdMs) log("warn", "eventloop.blocked", { durationMs: Math.round(lag) });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
