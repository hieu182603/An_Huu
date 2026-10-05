import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import request from "supertest";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
import { createApp } from "../app";
import { createServices } from "../modules/services";
import { CatalogService } from "../modules/catalog/service";
import { productInput, partnerInput, notificationSettingsInput } from "../modules/catalog/schema";
import { listQuery } from "../modules/community/service";
import { ContentService } from "../modules/content/service";
const partner = { name: "Fixture bank", type: "BANK" as const, logoUrl: null, website: null, contactEmail: null, isHighlight: false, isVisible: false };
const preference = { expectedRevision: 0, emailDigest: true, goalAlerts: true, partnerUpdates: false };
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
describe("T11 secondary modules", () => {
  it("isolates preferences by account, persists reloads and rejects stale revisions without promising delivery", async () => {
    const f = memoryDb(), s = new CatalogService(f.db);
    expect(await s.settings("one")).toMatchObject({ revision: 0, emailDigest: false, partnerUpdates: false });
    await s.saveSettings("one", preference);
    expect(await new CatalogService(f.db).settings("one")).toMatchObject({ revision: 1, emailDigest: true, deliveryAvailable: { emailDigest: false }, securityAndSupportRequired: true });
    expect(await s.settings("two")).toMatchObject({ revision: 0, emailDigest: false });
    await expect(s.saveSettings("one", preference)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(f.rows("outboxEvent")).toHaveLength(0);
    expect(notificationSettingsInput.safeParse({ ...preference, userId: "other" }).success).toBe(false);
  });
  it("rolls back preferences/catalog when audit fails", async () => {
    const f = memoryDb(), s = new CatalogService(f.db); f.failWrites("auditLog");
    await expect(s.saveSettings("one", preference)).rejects.toThrow();
    await expect(s.writePartner("admin", partner)).rejects.toThrow();
    expect(f.rows("notificationPreference")).toHaveLength(0); expect(f.rows("partner")).toHaveLength(0);
  });
  it("requires disclosure/fees/conditions and a visible parent before publication", async () => {
    const f = memoryDb(), s = new CatalogService(f.db), p = await s.writePartner("admin", partner);
    const product = { partnerId: p.id, name: "Fixture product", category: "Savings", expectedReturn: "Not guaranteed", riskLevel: "LOW" as const, description: null, annualFee: null, conditions: null, disclosure: null, isVisible: false };
    await s.writeProduct("admin", product);
    expect(productInput.safeParse({ ...product, isVisible: true }).success).toBe(false);
    const publish = { ...product, isVisible: true, annualFee: "Explicit fee", conditions: "Eligibility", disclosure: "Commercial relationship" };
    await expect(s.writeProduct("admin", publish)).rejects.toMatchObject({ code: "PARTNER_NOT_VISIBLE" });
    await s.writePartner("admin", { ...partner, isVisible: true }, p.id, 0);
    const result = await s.writeProduct("admin", publish);
    await expect(s.writeProduct("admin", publish, result.id, 9)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(s.writePartner("admin", partner, p.id, 0)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(partnerInput.safeParse({ ...partner, website: "javascript:alert(1)" }).success).toBe(false);
    expect(listQuery.safeParse({ status: "SCHEDULED" }).success).toBe(false);
  });
  it("reports duplicate content slugs as a conflict, not a generic server failure", async () => {
    const f = memoryDb(); vi.spyOn(f.db, "$transaction").mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5.22" }));
    await expect(new ContentService(f.db).write("admin", {} as never)).rejects.toMatchObject({ code: "SLUG_CONFLICT", status: 409 });
  });
  it("retires consultation routes for both roles and validates settings HTTP contracts/schema failures", async () => {
    const f = memoryDb(), s = createServices(f.db, config);
    vi.spyOn(s.auth, "validateSession").mockResolvedValue({ id: "owner" } as never);
    const app = createApp({ config, services: s });
    for (const [method, url, role] of [["get", "/me/consultations", "USER"], ["post", "/me/consultations", "USER"], ["get", "/admin/consultations", "ADMIN"], ["patch", "/admin/consultations/old-id", "ADMIN"]] as const) {
      const r = await request(app)[method]("/api/v1" + url).set("Authorization", "Bearer " + token(role)).send({});
      expect(r.status).toBe(410); expect(r.body.error.code).toBe("FEATURE_RETIRED");
    }
    expect(f.rows("consultation")).toHaveLength(0);
    expect((await request(app).get("/api/v1/admin/partners").set("Authorization", "Bearer " + token("USER"))).status).toBe(403);
    const response = await request(app).put("/api/v1/me/notification-settings").set("Authorization", "Bearer " + token("USER")).send(preference);
    expect(response.status).toBe(200);
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any;
    const validate = new Ajv({ strict: false, formats: { uuid: true } }).compile(spec.paths["/api/v1/me/notification-settings"].put.responses[200].content["application/json"].schema);
    expect(validate(response.body), JSON.stringify(validate.errors)).toBe(true);
    vi.spyOn(f.db.notificationPreference, "findUnique").mockRejectedValue(new Prisma.PrismaClientKnownRequestError("missing table", { code: "P2021", clientVersion: "5.22" }));
    const failed = await request(app).get("/api/v1/me/notification-settings").set("Authorization", "Bearer " + token("USER"));
    expect(failed.status).toBe(503); expect(failed.body.error.code).toBe("DATABASE_UPDATE_REQUIRED");
  });
});
