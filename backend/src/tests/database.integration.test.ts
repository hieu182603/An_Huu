import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../app";
import { config } from "./helpers";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL must point to an isolated local test database.");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/anhuu_[a-z0-9_]+_test$/.test(parsed.pathname)) throw new Error("Unsafe integration database target.");
const db = new PrismaClient({ datasources: { db: { url } } });
afterAll(async () => { await db.$disconnect(); });
describe("PostgreSQL migrations and readiness", () => {
  it("has applied the baseline migration and created domain tables", async () => {
    const rows = await db.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(rows.some(r => r.migration_name === "202610020001_baseline")).toBe(true);
    expect(await db.user.count()).toBeGreaterThanOrEqual(0);
    expect(await db.financialProfile.count()).toBeGreaterThanOrEqual(0);
    expect(await db.consultation.count()).toBeGreaterThanOrEqual(0);
  });
  it("probes real PostgreSQL successfully", async () => {
    const app = createApp({ config: { ...config, HEALTH_TIMEOUT_MS: 1500 }, databaseProbe: () => db.$queryRaw`SELECT 1` });
    expect((await request(app).get("/health/ready")).status).toBe(200);
  });
  it("keeps liveness available when a real database connection fails", async () => {
    const badUrl = new URL(url!); badUrl.port = "1"; badUrl.searchParams.set("connect_timeout", "1");
    const unavailable = new PrismaClient({ datasources: { db: { url: badUrl.toString() } } });
    try {
      const app = createApp({ config, databaseProbe: () => unavailable.$queryRaw`SELECT 1` });
      expect((await request(app).get("/health/ready")).status).toBe(503);
      expect((await request(app).get("/health/live")).status).toBe(200);
    } finally {
      // Prisma may reject disconnect while the intentionally failing initialization
      // is still settling after the shorter readiness timeout.
      await unavailable.$disconnect().catch(error => {
        expect(error).toMatchObject({ name: "PrismaClientInitializationError" });
      });
    }
  });
});
