type Event = "http.request" | "http.timing" | "http.error" | "server.started" | "server.start_failed" | "server.stopping" | "server.stop_failed" | "socket.connected" | "socket.disconnected" | "socket.delivery_failed" | "worker.started" | "worker.error" | "retention.completed" | "retention.failed";
type Fields = { requestId?: string; method?: string; route?: string; statusCode?: number; durationMs?: number; code?: string; cause?: string; eligible?: number; deleted?: number; remaining?: number; batches?: number };
// Do not serialize requests/errors: tokens, query strings, database URLs and PII are excluded.
export function log(level: "info" | "warn" | "error", event: Event | "preview.coverage_warning", fields: Fields = {}): void {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) =>
    ["requestId", "method", "route", "statusCode", "durationMs", "code", "cause", "eligible", "deleted", "remaining", "batches"].includes(key)));
  console[level](JSON.stringify({ time: new Date().toISOString(), level, event, ...safe }));
}

export function logPreviewCoverage(issues: Array<{ code: string }>, route: string): void {
  for (const code of new Set(issues.map(i => i.code)))
    if (["POLICY_NOT_COVERED", "PROJECTION_NOT_COVERED", "ASSET_HORIZON_NOT_COVERED"].includes(code))
      log("warn", "preview.coverage_warning", { route, code });
}
