import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { parse } from "yaml";
import request from "supertest";
import { createApp } from "../app";
import { config } from "./helpers";
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
});
