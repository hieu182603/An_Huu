import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { memoryDb } from "./memory-db";
import { config } from "./helpers";
import { unseal } from "../jobs/outbox";
import { verifyAccessToken } from "../middlewares/authMiddleware";
import { createApp } from "../app";
const input = { email: "account-extra@example.test", fullName: "Nguyễn An", password: "initial-password-123" };
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
async function fixture() {
  const f = memoryDb(), disconnect = vi.fn(), auth = new AuthService(f.db, config, disconnect), profiles = new ProfileService(f.db);
  await auth.register(input);
  await auth.verifyEmail(input.email, (unseal(f.rows("outboxEvent")[0].payload, config) as { token: string }).token);
  const session = await auth.login({ ...input, remember: true });
  return { ...f, auth, profiles, disconnect, session, app: createApp({ config, services: { auth, profiles } }) };
}
describe("account and security", () => {
  it("persists account changes and rejects stale writes without leaking credentials", async () => {
    const f = await fixture(), userId = f.session.user.id;
    const updated = await f.profiles.patchAccount(userId, { expectedRevision: 0, changes: { fullName: "Tên mới", city: "Hà Nội" } });
    expect(updated).toMatchObject({ fullName: "Tên mới", revision: 1, emailVerifiedAt: expect.any(Date) });
    expect(updated).not.toHaveProperty("passwordHash");
    await expect(f.profiles.patchAccount(userId, { expectedRevision: 0, changes: { fullName: "Stale" } })).rejects.toMatchObject({ status: 409 });
    expect((await f.profiles.getAccount(userId)).fullName).toBe("Tên mới");
  });
  it("avatar writes use account revision and keep other users unchanged", async () => {
    const f = await fixture(), id = f.session.user.id;
    await f.profiles.updateAvatar(id, 0, "https://res.cloudinary.com/example/image/upload/image.png");
    await expect(f.profiles.updateAvatar(id, 0, null)).rejects.toMatchObject({ status: 409 });
    await expect(f.profiles.updateAvatar("another-user", 1, null)).rejects.toMatchObject({ status: 409 });
    expect((await f.profiles.updateAvatar(id, 1, null)).avatarUrl).toBeNull();
  });
  it("wrong current password does not change password or revoke sessions", async () => {
    const f = await fixture();
    await expect(f.auth.changePassword(f.session.user.id, "wrong", "new-password-1234")).rejects.toMatchObject({ code: "INCORRECT_PASSWORD" });
    expect(await f.auth.validateSession(verifyAccessToken(f.session.accessToken, config))).toMatchObject({ email: input.email });
  });
  it("password change revokes every session and previous reset links", async () => {
    const f = await fixture();
    await f.auth.requestEmail(input.email, "PASSWORD_RESET");
    await f.auth.changePassword(f.session.user.id, input.password, "replacement-password-123");
    await expect(f.auth.validateSession(verifyAccessToken(f.session.accessToken, config))).rejects.toMatchObject({ status: 401 });
    await expect(f.auth.login({ ...input, remember: false })).rejects.toMatchObject({ status: 401 });
    expect((await f.auth.login({ ...input, password: "replacement-password-123", remember: false })).user.id).toBe(f.session.user.id);
    expect(f.rows("verificationToken").filter(t => t.type === "PASSWORD_RESET").every(t => t.consumedAt)).toBe(true);
    expect(f.disconnect).toHaveBeenCalledWith(f.session.user.id);
  });
  it("HTTP requires auth, rejects role/email edits, returns validation and clears the cookie after password change", async () => {
    const f = await fixture(), headers = { Authorization: "Bearer " + f.session.accessToken };
    expect((await request(f.app).post("/api/v1/auth/change-password").send({})).status).toBe(401);
    expect((await request(f.app).patch("/api/v1/me").set(headers).send({ expectedRevision: 0, changes: { email: "other@example.test" } })).status).toBe(400);
    expect((await request(f.app).post("/api/v1/auth/change-password").set(headers).send({ currentPassword: input.password, password: "short" })).status).toBe(400);
    const res = await request(f.app).post("/api/v1/auth/change-password").set(headers).send({ currentPassword: input.password, password: "replacement-password-123" });
    expect(res.status).toBe(200); expect(res.headers["set-cookie"][0]).toContain("Expires=Thu, 01 Jan 1970");
    expect((await request(f.app).get("/api/v1/me").set(headers)).status).toBe(401);
  });
});
