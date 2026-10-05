import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { AuthService } from "../modules/auth/service";
import { registerSchema } from "../modules/auth/schema";
import { memoryDb } from "./memory-db";
import { config } from "./helpers";

afterEach(() => vi.restoreAllMocks());
describe("registration and Google authentication", () => {
  it("normalizes optional Vietnamese phones and persists them for pending accounts", async () => {
    const input = registerSchema.parse({ email: " Example@anhuu.test ", fullName: " Nguyễn Minh Anh ", password: " twelve-chars-pass ", phone: "+84 912-345-678" });
    expect(input).toMatchObject({ email: "example@anhuu.test", fullName: "Nguyễn Minh Anh", phone: "+84912345678", password: " twelve-chars-pass " });
    const memory = memoryDb();
    await new AuthService(memory.db, config).register(input);
    expect(memory.rows("user")[0]).toMatchObject({ phone: "+84912345678", role: "USER", status: "PENDING_VERIFICATION" });
  });
  it("rejects invalid phone numbers, role injection and passwords beyond bcrypt's byte limit", () => {
    const input = { email: "a@anhuu.test", fullName: "An", password: "long-password-123" };
    expect(registerSchema.safeParse({ ...input, phone: "012345" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, password: "ệ".repeat(25) }).success).toBe(false);
  });
  it("does not accept a decoded but unverified Google token", async () => {
    const verify = vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockRejectedValue(new Error("Invalid signature"));
    const memory = memoryDb();
    const auth = new AuthService(memory.db, { ...config, GOOGLE_CLIENT_ID: "expected-client" });
    await expect(auth.googleLogin("forged.token.signature")).rejects.toMatchObject({ status: 401 });
    expect(verify).toHaveBeenCalledWith({ idToken: "forged.token.signature", audience: "expected-client" });
    expect(memory.rows("user")).toHaveLength(0);
    expect(memory.rows("refreshToken")).toHaveLength(0);
  });
  it("fails closed when Google login has no configured audience", async () => {
    await expect(new AuthService(memoryDb().db, config).googleLogin("any.token.signature")).rejects.toMatchObject({ code: "GOOGLE_NOT_CONFIGURED" });
  });
  for (const payload of [
    { sub: "google-sub", email: "a@gmail.com", email_verified: false },
    { sub: "google-sub", email: "a@third-party.test", email_verified: true },
  ]) it(`rejects an untrusted email claim for ${payload.email}`, async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({ getPayload: () => payload } as never);
    const memory = memoryDb();
    await expect(new AuthService(memory.db, { ...config, GOOGLE_CLIENT_ID: "client" }).googleLogin("token")).rejects.toBeInstanceOf(Error);
    expect(memory.rows("user")).toHaveLength(0);
  });
  it("creates a user session only from verified Google identity claims", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({ getPayload: () => ({ sub: "google-sub", email: "verified@gmail.com", email_verified: true, name: "Nguyễn Minh Anh" }) } as never);
    const memory = memoryDb();
    const result = await new AuthService(memory.db, { ...config, GOOGLE_CLIENT_ID: "client" }).googleLogin("verified-token");
    expect(result.user).toMatchObject({ role: "USER", status: "ACTIVE", fullName: "Nguyễn Minh Anh" });
    expect(result.accessToken).toBeTruthy();
    expect(memory.rows("refreshToken")).toHaveLength(1);
  });
  it("discards the unverified password when Google activates a pending account", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({ getPayload: () => ({ sub: "owner", email: "owner@gmail.com", email_verified: true }) } as never);
    const memory = memoryDb();
    const auth = new AuthService(memory.db, { ...config, GOOGLE_CLIENT_ID: "client" });
    await auth.register({ email: "owner@gmail.com", fullName: "Pending", password: "unverified-password-123" });
    const session = await auth.googleLogin("verified-token");
    expect(session.user.status).toBe("ACTIVE");
    await expect(auth.login({ email: "owner@gmail.com", password: "unverified-password-123", remember: false })).rejects.toMatchObject({ status: 401 });
  });
});
