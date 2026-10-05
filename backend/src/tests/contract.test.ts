import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { parse } from "yaml";
import request from "supertest";
import { createApp } from "../app";
import { config } from "./helpers";
import type { Services } from "../modules/router";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { memoryDb } from "./memory-db";
const path = "docs/openapi.yaml";
const spec = parse(readFileSync(path, "utf8"));
const ajv = new Ajv({ strict: false, formats: { uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "date-time": true } });
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("OpenAPI contract", () => {
  it("is a valid OpenAPI document", async () => { await SwaggerParser.validate(path); });
  it("validates current health responses against documented schemas", async () => {
    const app = createApp({ config, databaseProbe: async () => {} });
    for (const [route, schema] of Object.entries({
      "/health/live": "HealthEnvelope", "/health/ready": "HealthEnvelope",
      "/health": "LegacyHealth", "/api/health": "LegacyApiHealth",
    })) {
      const res = await request(app).get(route);
      const validate = ajv.compile(spec.components.schemas[schema]);
      expect(res.status).toBe(200);
      expect(validate(res.body), JSON.stringify(validate.errors)).toBe(true);
    }
  });
  it("validates errors and exact decimal serialization", async () => {
    const app = createApp({ config, databaseProbe: async () => { throw new Error("secret"); } });
    for (const route of ["/health/ready", "/missing"]) {
      const res = await request(app).get(route);
      expect(ajv.compile(spec.components.schemas.ErrorEnvelope)(res.body)).toBe(true);
    }
    const validateMoney = ajv.compile(spec.components.schemas.Money);
    expect(validateMoney("9007199254740993.25")).toBe(true);
    expect(validateMoney(1000)).toBe(false);
    expect(validateMoney("1e9")).toBe(false);
  });
  it("validates auth HTTP output and rejects undocumented sensitive fields", async () => {
    const document = await SwaggerParser.dereference(path) as unknown as { components: { schemas: Record<string, object> } };
    const publicUser = { id: "fixture-user", email: "contract@example.test", fullName: "Contract", role: "USER",
      status: "ACTIVE", phone: null, city: null, avatarUrl: null, revision: 0 };
    const services = { auth: { login: async () => ({ accessToken: "signed-access", refreshToken: "r".repeat(43),
      persistent: false, expiresAt: new Date(Date.now() + 60000), user: publicUser }) }, profiles: {} } as unknown as Services;
    const app = createApp({ config, services });
    const res = await request(app).post("/api/v1/auth/login").send({ email: publicUser.email, password: "a-long-password" });
    expect(res.status).toBe(200);
    const validate = ajv.compile(document.components.schemas.SessionEnvelope);
    expect(validate(res.body), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...res.body, data: { ...res.body.data, refreshToken: "secret" } })).toBe(false);
    expect(validate({ ...res.body, data: { ...res.body.data, user: { ...publicUser, passwordHash: "secret" } } })).toBe(false);
  });
  it("documents pending-email and invalid-password errors without issuing a session", async () => {
    const memory = memoryDb();
    const auth = new AuthService(memory.db, config);
    const input = { email: "pending@example.test", password: "a-long-password-123", fullName: "Pending" };
    await auth.register(input);
    const app = createApp({ config, services: { auth, profiles: new ProfileService(memory.db) } });
    const validate = ajv.compile(spec.components.schemas.ErrorEnvelope);
    for (const attempt of [
      { password: input.password, status: 403, code: "EMAIL_NOT_VERIFIED" },
      { password: "incorrect-password-123", status: 401, code: "UNAUTHENTICATED" },
    ]) {
      const res = await request(app).post("/api/v1/auth/login").send({ email: input.email, password: attempt.password });
      expect(res.status).toBe(attempt.status);
      expect(res.body.error.code).toBe(attempt.code);
      expect(validate(res.body), JSON.stringify(validate.errors)).toBe(true);
      expect(spec.paths["/api/v1/auth/login"].post.responses[String(attempt.status)]
        .content["application/json"].schema.$ref).toBe("#/components/schemas/ErrorEnvelope");
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(res.body.data).toBeUndefined();
      expect(memory.rows("refreshToken")).toHaveLength(0);
    }
  });
});
