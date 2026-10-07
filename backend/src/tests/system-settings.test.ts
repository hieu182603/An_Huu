import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { memoryDb } from "./memory-db";
import { config, token } from "./helpers";
import { createApp } from "../app";
import { createServices } from "../modules/services";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("System Settings & Logs Module", () => {
  it("enforces authentication and ADMIN authorization on all settings endpoints", async () => {
    const f = memoryDb();
    const s = createServices(f.db, config);
    vi.spyOn(s.auth, "validateSession").mockResolvedValue({ id: "user-1", role: "USER" } as never);
    const app = createApp({ config, services: s });

    const endpoints = [
      ["get", "/api/v1/admin/settings/general"],
      ["put", "/api/v1/admin/settings/general"],
      ["get", "/api/v1/admin/settings/security"],
      ["put", "/api/v1/admin/settings/security"],
      ["get", "/api/v1/admin/settings/notifications"],
      ["put", "/api/v1/admin/settings/notifications"],
      ["get", "/api/v1/admin/settings/logs/audit"],
      ["get", "/api/v1/admin/settings/logs/login"],
      ["get", "/api/v1/admin/settings/logs/system"],
    ] as const;

    // 1. Unauthenticated -> 401
    for (const [method, url] of endpoints) {
      const res = await request(app)[method](url).send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }

    // 2. Authenticated as USER -> 403 FORBIDDEN
    for (const [method, url] of endpoints) {
      const res = await request(app)[method](url)
        .set("Authorization", "Bearer " + token("USER"))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("loads default general settings, validates input, persists updates, and creates audit log", async () => {
    const f = memoryDb();
    const s = createServices(f.db, config);
    vi.spyOn(s.auth, "validateSession").mockResolvedValue({ id: "admin-1", email: "admin@anhuu.vn", role: "ADMIN" } as never);
    const app = createApp({ config, services: s });

    // 1. GET initial settings
    const getRes = await request(app)
      .get("/api/v1/admin/settings/general")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.systemName).toBe("An Hưu");
    expect(getRes.body.data.maintenanceMode).toBe(false);

    // 2. Validation failure - invalid email
    const invalidRes = await request(app)
      .put("/api/v1/admin/settings/general")
      .set("Authorization", "Bearer " + token("ADMIN"))
      .send({
        systemName: "An Hưu New",
        defaultLanguage: "Tiếng Việt",
        operatingTimezone: "GMT+7 (Việt Nam)",
        supportEmail: "not-an-email",
        maintenanceMode: true,
      });
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.code).toBe("VALIDATION_ERROR");

    // 3. Valid update
    const validData = {
      systemName: "An Hưu Vận Hành",
      defaultLanguage: "English",
      operatingTimezone: "GMT+7 (Việt Nam)",
      supportEmail: "support@anhuu.vn",
      maintenanceMode: true,
    };
    const putRes = await request(app)
      .put("/api/v1/admin/settings/general")
      .set("Authorization", "Bearer " + token("ADMIN"))
      .send(validData);
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.systemName).toBe("An Hưu Vận Hành");
    expect(putRes.body.data.maintenanceMode).toBe(true);

    // 4. Reload GET returns updated data from DB
    const reloadRes = await request(app)
      .get("/api/v1/admin/settings/general")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(reloadRes.status).toBe(200);
    expect(reloadRes.body.data.systemName).toBe("An Hưu Vận Hành");
    expect(reloadRes.body.data.supportEmail).toBe("support@anhuu.vn");
    expect(reloadRes.body.data.maintenanceMode).toBe(true);

    // 5. Audit log was recorded
    const auditLogs = f.rows("auditLog");
    const updateLog = auditLogs.find((a) => a.action === "UPDATE_SYSTEM_SETTINGS");
    expect(updateLog).toBeDefined();
    if (!updateLog) throw new Error("Missing system settings update audit log");
    expect(updateLog.targetType).toBe("SYSTEM_SETTINGS");
    expect(updateLog.details.after.systemName).toBe("An Hưu Vận Hành");
  });

  it("loads and persists security settings, validating password policy and parameters", async () => {
    const f = memoryDb();
    const s = createServices(f.db, config);
    vi.spyOn(s.auth, "validateSession").mockResolvedValue({ id: "admin-1", email: "admin@anhuu.vn", role: "ADMIN" } as never);
    const app = createApp({ config, services: s });

    const getSec = await request(app)
      .get("/api/v1/admin/settings/security")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(getSec.status).toBe(200);
    expect(getSec.body.data.sessionTimeoutMinutes).toBe(60);
    expect(getSec.body.data.maxLoginAttempts).toBe(5);

    // Update with valid security parameters
    const secUpdate = {
      sessionTimeoutMinutes: 120,
      maxLoginAttempts: 3,
      accountLockMinutes: 30,
      passwordMinLength: 10,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumber: true,
      passwordRequireSpecial: false,
      admin2faRequired: false,
    };
    const putSec = await request(app)
      .put("/api/v1/admin/settings/security")
      .set("Authorization", "Bearer " + token("ADMIN"))
      .send(secUpdate);
    expect(putSec.status).toBe(200);
    expect(putSec.body.data.sessionTimeoutMinutes).toBe(120);
    expect(putSec.body.data.maxLoginAttempts).toBe(3);

    const reloaded = await request(app)
      .get("/api/v1/admin/settings/security")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(reloaded.body.data.sessionTimeoutMinutes).toBe(120);

    // Audit log check
    const auditLogs = f.rows("auditLog");
    const secAudit = auditLogs.find((a) => a.action === "UPDATE_SECURITY_SETTINGS");
    expect(secAudit).toBeDefined();
  });

  it("loads and persists notification preferences with audit trail", async () => {
    const f = memoryDb();
    const s = createServices(f.db, config);
    vi.spyOn(s.auth, "validateSession").mockResolvedValue({ id: "admin-1", email: "admin@anhuu.vn", role: "ADMIN" } as never);
    const app = createApp({ config, services: s });

    const notifData = {
      emailEnabled: true,
      inAppEnabled: true,
      smsEnabled: false,
      notifyAccount: true,
      notifySupport: false,
      notifyFinancial: true,
      notifySystem: true,
    };
    const putNotif = await request(app)
      .put("/api/v1/admin/settings/notifications")
      .set("Authorization", "Bearer " + token("ADMIN"))
      .send(notifData);
    expect(putNotif.status).toBe(200);
    expect(putNotif.body.data.notifySupport).toBe(false);

    const getNotif = await request(app)
      .get("/api/v1/admin/settings/notifications")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(getNotif.body.data.notifySupport).toBe(false);
  });

  it("queries audit logs, login logs, and system logs with pagination and filters", async () => {
    const f = memoryDb();
    const s = createServices(f.db, config);
    vi.spyOn(s.auth, "validateSession").mockResolvedValue({ id: "admin-1", email: "admin@anhuu.vn", role: "ADMIN" } as never);
    const app = createApp({ config, services: s });

    // Seed some test records in memoryDb
    await s.settings.recordLoginLog({
      identifier: "test@example.com",
      status: "SUCCESS",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0",
    });
    await s.settings.recordLoginLog({
      identifier: "attacker@bad.com",
      status: "FAILED",
      ipAddress: "192.168.1.1",
      failureReason: "Sai mật khẩu",
    });
    await s.settings.recordSystemLog({
      level: "ERROR",
      source: "API",
      message: "Test system error log",
      statusCode: 500,
    });

    // 1. Audit logs
    const auditRes = await request(app)
      .get("/api/v1/admin/settings/logs/audit?page=1&limit=20")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body.data.items)).toBe(true);
    expect(typeof auditRes.body.data.total).toBe("number");

    // 2. Login logs
    const loginRes = await request(app)
      .get("/api/v1/admin/settings/logs/login?page=1&limit=20")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.items.length).toBe(2);
    expect(loginRes.body.data.items[0].identifier).toBeDefined();

    // 3. Login logs filtered by status
    const failedLogins = await request(app)
      .get("/api/v1/admin/settings/logs/login?status=FAILED")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(failedLogins.status).toBe(200);
    expect(failedLogins.body.data.items.length).toBe(1);
    expect(failedLogins.body.data.items[0].status).toBe("FAILED");

    // 4. System logs
    const systemRes = await request(app)
      .get("/api/v1/admin/settings/logs/system?level=ERROR")
      .set("Authorization", "Bearer " + token("ADMIN"));
    expect(systemRes.status).toBe(200);
    expect(systemRes.body.data.items.length).toBe(1);
    expect(systemRes.body.data.items[0].level).toBe("ERROR");
  });
});
