import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import jwt from "jsonwebtoken";
import { memoryDb } from "./memory-db";
import { config } from "./helpers";
import { createApp } from "../app";
import { createServices } from "../modules/services";
import { NotificationBroadcastService } from "../modules/community/broadcast";
import { SocketService } from "../services/socketService";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";

const bearer = (userId: string, role: "USER" | "ADMIN") => "Bearer " + jwt.sign({ userId, email: `${userId}@example.test`, role }, config.JWT_SECRET,
  { algorithm: "HS256", issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, expiresIn: 60 });
async function setup() {
  const f = memoryDb(), services = createServices(f.db, config);
  vi.spyOn(services.auth, "validateSession").mockResolvedValue({ id: "session-user" } as never);
  const user = (role: "USER" | "ADMIN", status = "ACTIVE") => f.db.user.create({ data: { email: `${randomUUID()}@example.test`, fullName: role, passwordHash: "x", role, status: status as never } });
  const manager = await user("ADMIN"), admin = await user("ADMIN"), customer = await user("USER");
  await f.db.investmentRoleGrant.create({ data: { userId: manager.id, role: "SYSTEM_ADMIN", grantedBy: "bootstrap" } });
  return { f, services, app: createApp({ config, services }), manager, admin, customer, user };
}
afterEach(() => vi.restoreAllMocks());

describe("admin investment role grants", () => {
  it("lets only an ACTIVE SYSTEM_ADMIN manage roles; USER accounts never receive them", async () => {
    const { f, app, manager, admin, customer } = await setup();
    const call = (method: "get" | "post", path: string, as: string, role: "USER" | "ADMIN" = "ADMIN", body?: object) =>
      request(app)[method]("/api/v1/admin/investment-roles" + path).set("Authorization", bearer(as, role)).send(body);
    expect((await call("get", "", customer.id, "USER")).status).toBe(403);
    const forbidden = await call("post", `/${admin.id}/grant`, admin.id, "ADMIN", { role: "DATA_ADMIN", reason: "Tự cấp quyền" });
    expect(forbidden.status).toBe(403); expect(forbidden.body.error.code).toBe("FORBIDDEN");
    expect(f.rows("investmentRoleGrant")).toHaveLength(1);

    const list = await call("get", "", manager.id);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((i: { userId: string }) => i.userId).sort()).toEqual([manager.id, admin.id].sort());
    expect(list.body.data.assignableRoles).toContain("SYSTEM_ADMIN");
    expect((await call("post", `/${customer.id}/grant`, manager.id, "ADMIN", { role: "ADVISOR", reason: "Thử cấp cho USER" })).body.error.code).toBe("INVESTMENT_ROLE_ADMIN_ONLY");
    expect((await call("post", `/${admin.id}/grant`, manager.id, "ADMIN", { role: "ADVISOR", reason: "ok", extra: 1 })).status).toBe(400);
    expect((await call("get", `/${randomUUID()}`, manager.id)).status).toBe(404);

    const granted = await call("post", `/${admin.id}/grant`, manager.id, "ADMIN", { role: "DATA_ADMIN", reason: "Phụ trách dữ liệu sản phẩm" });
    expect(granted.status).toBe(200);
    expect(granted.body.data).toMatchObject({ userId: admin.id, changed: true, roles: [{ role: "DATA_ADMIN", grantedBy: manager.id }] });
    const again = await call("post", `/${admin.id}/grant`, manager.id, "ADMIN", { role: "DATA_ADMIN", reason: "Bấm hai lần" });
    expect(again.status).toBe(200); expect(again.body.data.changed).toBe(false);
    expect(f.rows("investmentRoleGrant").filter(g => g.userId === admin.id)).toHaveLength(1);
    expect(f.rows("auditLog").filter(a => a.action === "INVESTMENT_ROLE_GRANTED")).toEqual([expect.objectContaining({ targetId: admin.id, performerId: manager.id, details: { role: "DATA_ADMIN", reason: "Phụ trách dữ liệu sản phẩm" } })]);
    // The granted admin now passes the investment permission gate.
    expect((await request(app).get("/api/v1/investments/permissions").set("Authorization", bearer(admin.id, "ADMIN"))).body.data.roles).toEqual(["DATA_ADMIN"]);

    const missing = await call("post", `/${admin.id}/revoke`, manager.id, "ADMIN", { role: "APPROVER", reason: "Không có" });
    expect(missing.status).toBe(404); expect(missing.body.error.code).toBe("ROLE_NOT_GRANTED");
    const revoked = await call("post", `/${admin.id}/revoke`, manager.id, "ADMIN", { role: "DATA_ADMIN", reason: "Đổi nhiệm vụ" });
    expect(revoked.status).toBe(200); expect(revoked.body.data.roles).toEqual([]);
    expect(f.rows("auditLog").filter(a => a.action === "INVESTMENT_ROLE_REVOKED")).toHaveLength(1);
  });

  it("blocks revoking the last ACTIVE SYSTEM_ADMIN, including oneself", async () => {
    const { f, app, manager, admin, user } = await setup();
    const revoke = (as: string, target: string) => request(app).post(`/api/v1/admin/investment-roles/${target}/revoke`).set("Authorization", bearer(as, "ADMIN")).send({ role: "SYSTEM_ADMIN", reason: "Rời vị trí" });
    // A suspended SYSTEM_ADMIN does not count as a remaining manager.
    const suspended = await user("ADMIN", "SUSPENDED");
    await f.db.investmentRoleGrant.create({ data: { userId: suspended.id, role: "SYSTEM_ADMIN", grantedBy: "bootstrap" } });
    const self = await revoke(manager.id, manager.id);
    expect(self.status).toBe(409); expect(self.body.error.code).toBe("LAST_ROLE_MANAGER");
    expect(f.rows("investmentRoleGrant").some(g => g.userId === manager.id && g.role === "SYSTEM_ADMIN")).toBe(true);
    expect(f.rows("auditLog").filter(a => a.action === "INVESTMENT_ROLE_REVOKED")).toHaveLength(0);

    await request(app).post(`/api/v1/admin/investment-roles/${admin.id}/grant`).set("Authorization", bearer(manager.id, "ADMIN")).send({ role: "SYSTEM_ADMIN", reason: "Bàn giao" });
    expect((await revoke(manager.id, manager.id)).status).toBe(200);
    const last = await revoke(admin.id, admin.id);
    expect(last.status).toBe(409); expect(last.body.error.code).toBe("LAST_ROLE_MANAGER");
    // The former manager lost access immediately.
    expect((await revoke(manager.id, admin.id)).status).toBe(403);
  });
});

describe("persistent admin broadcast", () => {
  it("stores one notification per ACTIVE USER in batches, audits it, then pushes the socket event once", async () => {
    const { f, manager, user, customer } = await setup();
    const active = [customer, await user("USER"), await user("USER"), await user("USER"), await user("USER")];
    await user("USER", "SUSPENDED"); await user("USER", "PENDING_VERIFICATION");
    const emit = vi.fn(), service = new NotificationBroadcastService(f.db, 2, emit), key = randomUUID();
    const createMany = vi.spyOn(f.db.notification, "createMany");
    const body = { title: "Bảo trì", message: "Hệ thống bảo trì 22:00." };
    const sent = await service.broadcast(manager.id, body, key);
    expect(sent).toMatchObject({ broadcasted: true, recipients: 5, replayed: false, title: "Bảo trì" });
    expect(createMany).toHaveBeenCalledTimes(3);
    expect(f.rows("notification").map(n => n.userId).sort()).toEqual(active.map(u => u.id).sort());
    expect(f.rows("notification")[0]).toMatchObject({ title: "Bảo trì", message: "Hệ thống bảo trì 22:00.", path: "/user/notifications" });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ broadcastId: sent.broadcastId, recipients: 5 }));
    expect(f.rows("auditLog").map(a => a.action)).toEqual(["ADMIN_NOTIFICATION_BROADCAST", "ADMIN_NOTIFICATION_BROADCAST_COMPLETED"]);

    const replay = await service.broadcast(manager.id, body, key);
    expect(replay).toMatchObject({ broadcastId: sent.broadcastId, recipients: 5, replayed: true });
    expect(f.rows("notification")).toHaveLength(5); expect(emit).toHaveBeenCalledTimes(1);
    await expect(service.broadcast(manager.id, { ...body, message: "Khác" }, key)).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.broadcast(manager.id, body, undefined)).rejects.toMatchObject({ status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
  });

  it("resumes an interrupted broadcast with the same key without duplicating notifications", async () => {
    const { f, manager, user } = await setup();
    for (let i = 0; i < 4; i++) await user("USER");
    const emit = vi.fn(), service = new NotificationBroadcastService(f.db, 2, emit), key = randomUUID(), body = { title: "T", message: "M" };
    const original = f.db.notification.createMany.bind(f.db.notification);
    let calls = 0;
    vi.spyOn(f.db.notification, "createMany").mockImplementation((async (args: never) => { if (++calls === 2) throw new Error("connection lost"); return original(args); }) as never);
    await expect(service.broadcast(manager.id, body, key)).rejects.toThrow("connection lost");
    expect(f.rows("notification")).toHaveLength(2); expect(emit).not.toHaveBeenCalled();
    const resumed = await service.broadcast(manager.id, body, key);
    expect(resumed.recipients).toBe(5);
    expect(new Set(f.rows("notification").map(n => n.userId)).size).toBe(5);
    expect(f.rows("notification")).toHaveLength(5); expect(emit).toHaveBeenCalledTimes(1);
  });

  it("HTTP: ADMIN only, requires Idempotency-Key, offline users find the notification later", async () => {
    const { f, app, manager, customer } = await setup();
    const push = vi.spyOn(SocketService, "broadcast").mockImplementation(() => {});
    const post = (role: "USER" | "ADMIN", key?: string, body: object = { title: "Tin mới", message: "Đã cập nhật lãi suất." }) => {
      const r = request(app).post("/api/v1/admin/notifications/broadcast").set("Authorization", bearer(role === "ADMIN" ? manager.id : customer.id, role));
      return (key ? r.set("Idempotency-Key", key) : r).send(body);
    };
    expect((await post("USER", randomUUID())).status).toBe(403);
    const noKey = await post("ADMIN"); expect(noKey.status).toBe(400); expect(noKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect((await post("ADMIN", randomUUID(), { title: "", message: "x" })).status).toBe(400);
    expect(f.rows("notification")).toHaveLength(0);
    const sent = await post("ADMIN", randomUUID());
    expect(sent.status).toBe(200); expect(sent.body.data).toMatchObject({ recipients: 1, replayed: false });
    expect(push).toHaveBeenCalledWith("notification:broadcast", expect.objectContaining({ persisted: true, broadcastId: sent.body.data.broadcastId }));
    // The customer had no socket connection; the stored row is in their list.
    const inbox = await request(app).get("/api/v1/me/notifications").set("Authorization", bearer(customer.id, "USER"));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.items).toEqual([expect.objectContaining({ title: "Tin mới", message: "Đã cập nhật lãi suất." })]);
  });
});

describe("admin gaps OpenAPI contract", () => {
  it("documents the role and broadcast responses actually returned", async () => {
    const { app, manager, admin } = await setup();
    vi.spyOn(SocketService, "broadcast").mockImplementation(() => {});
    const spec = await SwaggerParser.dereference("docs/openapi.yaml") as any, ajv = new Ajv({ strict: false, formats: { uuid: true, "date-time": true } });
    const check = (path: string, method: string, body: unknown) => {
      const validate = ajv.compile(spec.paths[path][method].responses[200].content["application/json"].schema);
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    };
    const auth = bearer(manager.id, "ADMIN");
    check("/api/v1/admin/investment-roles/{userId}/grant", "post", (await request(app).post(`/api/v1/admin/investment-roles/${admin.id}/grant`).set("Authorization", auth).send({ role: "ADVISOR", reason: "Lập đề xuất" })).body);
    check("/api/v1/admin/investment-roles", "get", (await request(app).get("/api/v1/admin/investment-roles").set("Authorization", auth)).body);
    check("/api/v1/admin/investment-roles/{userId}", "get", (await request(app).get(`/api/v1/admin/investment-roles/${admin.id}`).set("Authorization", auth)).body);
    check("/api/v1/admin/notifications/broadcast", "post", (await request(app).post("/api/v1/admin/notifications/broadcast").set("Authorization", auth).set("Idempotency-Key", randomUUID()).send({ title: "A", message: "B" })).body);
  });
});
