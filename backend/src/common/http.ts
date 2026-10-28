import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { RequestHandler, Response } from "express";
import { z, type ZodTypeAny } from "zod";
import { AppError } from "./errors";
import { log } from "./logger";

export const SLOW_REQUEST_MS = 5000;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Path only: the query string is dropped and ids are masked, so logs carry no identifiers. */
export const routeOf = (url: string) => url.split("?")[0].replace(UUID, ":id");

// "close" (not "finish") so a request whose client gave up — the one that froze
// the event loop on 2026-10-28 — is still logged, with its route and duration.
export const requestContext: RequestHandler = (req, res, next) => {
  const start = performance.now(), route = routeOf(req.originalUrl);
  res.locals.requestId = randomUUID();
  res.setHeader("X-Request-Id", res.locals.requestId);
  res.on("close", () => {
    const durationMs = Math.round(performance.now() - start), aborted = !res.writableFinished;
    log(aborted || durationMs >= SLOW_REQUEST_MS ? "warn" : "info", aborted ? "http.aborted" : "http.request",
      { requestId: res.locals.requestId, method: req.method, route, statusCode: res.statusCode, durationMs });
  });
  next();
};
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
}
export function validate(schema: ZodTypeAny, target: "body" | "query" | "params" = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) return next(result.error);
    req[target] = result.data;
    next();
  };
}
export function sendData(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data, meta: { requestId: res.locals.requestId } });
}
export const notFound: RequestHandler = (_req, _res, next) =>
  next(new AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên."));
export function paginationSchema<T extends [string, ...string[]]>(sortFields: T) {
  const integer = (fallback: number, max: number) => z.preprocess(
    v => v === undefined ? fallback : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v,
    z.number().int().min(1).max(max));
  return z.object({
    page: integer(1, 100000), limit: integer(20, 100),
    sortBy: z.enum(sortFields).default(sortFields[0]), order: z.enum(["asc", "desc"]).default("desc"),
  }).strict();
}
// Decimal(18,2). HTTP money is a decimal string, never a floating point number.
export const moneySchema = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/, "Số tiền phải là chuỗi thập phân không âm, tối đa 16 chữ số nguyên và 2 chữ số thập phân.");
export const signedMoneySchema = z.string().regex(/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/);
export const roleSchema = z.enum(["USER", "ADMIN"]);
/** The object without its refinements (zod 3's `innerType()`): zod 4 keeps refinements
 * on the object itself and throws on `.pick()`/`.partial()` while they are present. */
export const unrefined = <T extends z.ZodObject>(schema: T): T => schema.clone({ ...schema.def, checks: [] }) as T;
/** `.partial()` that leaves absent keys absent, as in zod 3. zod 4 fills `.default()`
 * values inside optional fields, so a partial update would overwrite stored values. */
export function partialKeepAbsent<Shape extends z.ZodRawShape, Config extends z.core.$ZodObjectConfig>(schema: z.ZodObject<Shape, Config>) {
  const partial = schema.partial();
  const shape = Object.fromEntries(Object.entries(partial.shape).map(([key, field]) => {
    const inner = (field as z.ZodOptional).unwrap();
    return [key, inner instanceof z.ZodDefault ? z.optional(inner.unwrap()) : field];
  }));
  return partial.clone({ ...partial.def, shape } as typeof partial.def) as typeof partial;
}
