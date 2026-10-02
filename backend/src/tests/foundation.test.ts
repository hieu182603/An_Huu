import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import { loadEnv } from "../config/env";
import { AppError } from "../common/errors";
import { log } from "../common/logger";
import { asyncHandler, validate, sendData, paginationSchema, moneySchema } from "../common/http";
import { createAuthenticate, requireRole } from "../middlewares/authMiddleware";
import { createLimiter } from "../middlewares/rateLimiter";
import { config, testEnv, token } from "./helpers";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
const errorShape = z.object({
  error: z.object({ code: z.string(), message: z.string(), fieldErrors: z.record(z.array(z.string())).optional() }).strict(),
  requestId: z.string().uuid(),
}).strict();
function fixture() {
  const router = Router();
  router.post("/input", validate(z.object({ amount: moneySchema, nested: z.object({ name: z.string() }).strict() }).strict()),
    (req, res) => sendData(res, req.body));
  router.get("/list", validate(paginationSchema(["createdAt", "name"]), "query"), (req, res) => sendData(res, req.query));
  router.get("/failure", asyncHandler(async () => { throw new Error("password=do-not-leak"); }));
  router.get("/conflict", asyncHandler(async () => { throw new AppError(409, "CONFLICT", "Dữ liệu đã thay đổi."); }));
  router.get("/private", createAuthenticate(config), requireRole("USER"), (_req, res) => sendData(res, { ok: true }));
  router.get("/limited", createLimiter(60000, 1), (_req, res) => sendData(res, { ok: true }));
  return createApp({ config, databaseProbe: async () => {}, apiRouter: router });
}
describe("environment", () => {
  it("requires independent secrets without echoing supplied values", () => {
    expect(() => loadEnv({ ...testEnv, JWT_SECRET: "sensitive" })).toThrow("JWT_SECRET");
    expect(() => loadEnv({ ...testEnv, JWT_SECRET: "sensitive" })).not.toThrow("sensitive");
    expect(() => loadEnv({ ...testEnv, JWT_REFRESH_SECRET: testEnv.JWT_SECRET })).toThrow();
    expect(() => loadEnv({ ...testEnv, DATABASE_URL: "password-do-not-echo" })).not.toThrow("password-do-not-echo");
  });
  it("rejects missing/default secrets and non-HTTPS production origins", () => {
    const prod = { ...testEnv, NODE_ENV: "production", CLIENT_URL: "https://app.example.test" };
    expect(() => loadEnv({ ...prod, JWT_SECRET: undefined })).toThrow();
    expect(() => loadEnv({ ...prod, JWT_SECRET: "an_huu_production_secure_jwt_secret_key_2026_xyz" })).toThrow();
    expect(() => loadEnv({ ...prod, CLIENT_URL: undefined })).toThrow();
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: "http://preview.example.test" })).toThrow();
    expect(loadEnv(prod).origins).toEqual(["https://app.example.test"]);
  });
  it("rejects malformed origins, port and proxy hops", () => {
    for (const overrides of [{ CLIENT_URL: "https://a.test/path" }, { CORS_ORIGINS: "*" }, { PORT: "NaN" }, { TRUST_PROXY_HOPS: "-1" }])
      expect(() => loadEnv({ ...testEnv, ...overrides })).toThrow();
    expect(loadEnv(testEnv).TRUST_PROXY_HOPS).toBe(0);
  });
});
describe("HTTP foundation", () => {
  it("keeps health endpoints, request IDs and security headers", async () => {
    const app = fixture();
    for (const path of ["/health", "/api/health", "/health/live", "/health/ready"]) {
      const res = await request(app).get(path).set("X-Request-Id", "attacker-controlled");
      expect(res.status).toBe(200);
      expect(z.string().uuid().safeParse(res.headers["x-request-id"]).success).toBe(true);
      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    }
  });
  it("rejects unknown and nested computed fields while preserving decimal strings", async () => {
    const app = fixture();
    const ok = await request(app).post("/api/v1/input").send({ amount: "9007199254740993.25", nested: { name: "A" } });
    expect(ok.status).toBe(200); expect(ok.body.data.amount).toBe("9007199254740993.25");
    for (const body of [{ amount: -1, nested: { name: "A" } },
      { amount: "10", inflationRate: 4, nested: { name: "A" } },
      { amount: "10", nested: { name: "A", annualReturnRate: 10 } }]) {
      const res = await request(app).post("/api/v1/input").send(body);
      expect(res.status).toBe(400); expect(errorShape.safeParse(res.body).success).toBe(true);
    }
  });
  it("returns safe JSON errors for malformed JSON, oversized bodies and unknown routes", async () => {
    const app = fixture();
    const malformed = await request(app).post("/api/v1/input").set("Content-Type", "application/json").send('{"secret":');
    expect(malformed.status).toBe(400); expect(malformed.body.error.code).toBe("INVALID_JSON");
    const large = await request(app).post("/api/v1/input").send({ value: "x".repeat(2 * 1024 * 1024) });
    expect(large.status).toBe(413);
    const missing = await request(app).get("/does-not-exist");
    expect(missing.status).toBe(404);
    for (const response of [malformed, large, missing]) expect(errorShape.safeParse(response.body).success).toBe(true);
  });
  it("handles rejected async handlers without leaking error details", async () => {
    const res = await request(fixture()).get("/api/v1/failure?token=do-not-leak").set("Authorization", "Bearer secret");
    expect(res.status).toBe(500); expect(errorShape.safeParse(res.body).success).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("do-not-leak");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("do-not-leak");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("secret");
    expect((await request(fixture()).get("/api/v1/conflict")).status).toBe(409);
  });
  it("applies exact CORS allowlists in development too", async () => {
    const app = fixture();
    expect((await request(app).get("/health/live").set("Origin", config.CLIENT_URL)).headers["access-control-allow-origin"]).toBe(config.CLIENT_URL);
    const denied = await request(app).get("/health/live").set("Origin", "https://evil.test");
    expect(denied.status).toBe(403); expect(errorShape.safeParse(denied.body).success).toBe(true);
    const preflight = await request(app).options("/api/v1/input").set("Origin", config.CLIENT_URL).set("Access-Control-Request-Method", "POST");
    expect(preflight.status).toBe(204);
  });
  it("validates pagination and sort allowlists", async () => {
    const app = fixture();
    expect((await request(app).get("/api/v1/list")).body.data).toEqual({ page: 1, limit: 20, sortBy: "createdAt", order: "desc" });
    for (const query of ["limit=101", "page=-1", "sortBy=passwordHash", "order=drop", "page=1&page=2", "limit="])
      expect((await request(app).get("/api/v1/list?" + query)).status).toBe(400);
  });
  it("uses 401 for invalid tokens and explicit role policies for 403", async () => {
    const app = fixture();
    expect((await request(app).get("/api/v1/private")).status).toBe(401);
    expect((await request(app).get("/api/v1/private").auth(token("USER", -1), { type: "bearer" })).status).toBe(401);
    expect((await request(app).get("/api/v1/private").auth(token("ADMIN"), { type: "bearer" })).status).toBe(403);
    expect((await request(app).get("/api/v1/private").auth(token(), { type: "bearer" })).status).toBe(200);
    const invalidClaims = jwt.sign({ userId: "x", email: "x@example.test", role: "SUPER_ADMIN" }, config.JWT_SECRET,
      { issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn: 60 });
    expect((await request(app).get("/api/v1/private").auth(invalidClaims, { type: "bearer" })).status).toBe(401);
  });
  it("returns a structured 429 with Retry-After", async () => {
    const app = fixture();
    await request(app).get("/api/v1/limited");
    const res = await request(app).get("/api/v1/limited");
    expect(res.status).toBe(429); expect(res.headers["retry-after"]).toBeDefined();
    expect(errorShape.safeParse(res.body).success).toBe(true);
  });
  it("logs only allowlisted fields", () => {
    log("info", "http.request", { requestId: "id", password: "never-log", body: { income: 42 } } as never);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("never-log");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("income");
  });
});
describe("readiness", () => {
  it("returns 503 for a failing database while liveness remains 200", async () => {
    const app = createApp({ config, databaseProbe: async () => { throw new Error("db-password"); } });
    expect((await request(app).get("/health/ready")).status).toBe(503);
    expect((await request(app).get("/health/live")).status).toBe(200);
  });
  it("bounds hung probes and reuses in-flight checks", async () => {
    const probe = vi.fn(() => new Promise(() => {}));
    const app = createApp({ config, databaseProbe: probe });
    const results = await Promise.all([request(app).get("/health/ready"), request(app).get("/health/ready")]);
    expect(results.every(r => r.status === 503)).toBe(true); expect(probe).toHaveBeenCalledTimes(1);
  });
  it("fails readiness during drain without probing the database", async () => {
    const probe = vi.fn(async () => {});
    const app = createApp({ config, databaseProbe: probe }); app.locals.draining = true;
    expect((await request(app).get("/health/ready")).status).toBe(503); expect(probe).not.toHaveBeenCalled();
  });
});
