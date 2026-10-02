type Event = "http.request" | "http.error" | "server.started" | "server.start_failed" | "server.stopping" | "server.stop_failed" | "socket.connected" | "socket.disconnected" | "socket.delivery_failed";
type Fields = { requestId?: string; method?: string; statusCode?: number; durationMs?: number; code?: string };
// Do not serialize requests/errors: tokens, query strings, database URLs and PII are excluded.
export function log(level: "info" | "error", event: Event, fields: Fields = {}): void {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key]) =>
    ["requestId", "method", "statusCode", "durationMs", "code"].includes(key)));
  console[level](JSON.stringify({ time: new Date().toISOString(), level, event, ...safe }));
}
