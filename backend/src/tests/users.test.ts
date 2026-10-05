import { describe, expect, it, vi } from "vitest";
import { UsersService, userListSchema } from "../modules/users/service";
import { memoryDb } from "./memory-db";
describe("admin user management", () => {
  it("filters and paginates users without exposing hashes or admin accounts", async () => {
    const f = memoryDb();
    await f.db.user.create({ data: { email: "user@example.test", fullName: "Nguyễn An", passwordHash: "private" } });
    await f.db.user.create({ data: { email: "admin@example.test", fullName: "Admin", role: "ADMIN", passwordHash: "private" } });
    const data = await new UsersService(f.db).list(userListSchema.parse({ search: "NGUYỄN", limit: "1" }));
    expect(data.total).toBe(1); expect(data.items).toHaveLength(1);
    expect(data.items[0]).not.toHaveProperty("passwordHash");
    expect((await new UsersService(f.db).list(userListSchema.parse({ page: "2", limit: "1" }))).items).toHaveLength(0);
  });
  it("suspension revokes sessions and restoration never verifies an email", async () => {
    const f = memoryDb(), disconnect = vi.fn(), service = new UsersService(f.db, disconnect);
    const user = await f.db.user.create({ data: { email: "pending@example.test", fullName: "Pending", passwordHash: "private", status: "PENDING_VERIFICATION" } });
    await f.db.refreshToken.create({ data: { userId: user.id, tokenHash: "private", expiresAt: new Date(), securityVersion: 0 } });
    expect(await service.status("admin", user.id, { expectedRevision: 0, action: "suspend", reason: "Kiểm tra" })).toMatchObject({ status: "SUSPENDED", revision: 1 });
    expect(f.rows("refreshToken")[0].revokedAt).toBeTruthy(); expect(disconnect).toHaveBeenCalledWith(user.id);
    await expect(service.status("admin", user.id, { expectedRevision: 0, action: "restore", reason: "Kiểm tra" })).rejects.toMatchObject({ status: 409 });
    expect(await service.status("admin", user.id, { expectedRevision: 1, action: "restore", reason: "Kiểm tra" })).toMatchObject({ status: "PENDING_VERIFICATION" });
    expect(f.rows("auditLog")).toHaveLength(2);
  });
  it("cannot change one's own status or lock another admin", async () => {
    const f = memoryDb(), service = new UsersService(f.db);
    const admin = await f.db.user.create({ data: { email: "admin@example.test", fullName: "Admin", passwordHash: "private", role: "ADMIN" } });
    const input = { expectedRevision: 0, action: "suspend" as const, reason: "Kiểm tra" };
    await expect(service.status(admin.id, admin.id, input)).rejects.toMatchObject({ status: 403 });
    await expect(service.status("other-admin", admin.id, input)).rejects.toMatchObject({ status: 404 });
    expect(f.rows("auditLog")).toHaveLength(0);
  });
});
