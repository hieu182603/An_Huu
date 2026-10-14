import { performance } from "node:perf_hooks";
import type { RequestHandler } from "express";
import { log } from "./logger";

// Server-Timing + a structured log line for hot read paths, so latency can be
// compared before/after changes without a tracing backend. The route label is a
// fixed name (never the URL), keeping ids and query strings out of logs.
export function serverTiming(route: string): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    const writeHead = res.writeHead;
    res.writeHead = function (this: typeof res, ...args: Parameters<typeof res.writeHead>) {
      if (!res.headersSent) res.setHeader("Server-Timing", `total;dur=${(performance.now() - start).toFixed(1)}`);
      return writeHead.apply(this, args);
    } as typeof res.writeHead;
    res.on("finish", () => {
      // Express route templates (":id") only; never the concrete path.
      const template = typeof req.route?.path === "string" ? req.route.path : "";
      const name = template.startsWith(route) ? template : route + (template === "/" ? "" : template);
      log("info", "http.timing", { requestId: res.locals.requestId, method: req.method, route: name,
        statusCode: res.statusCode, durationMs: Math.round(performance.now() - start) });
    });
    next();
  };
}
