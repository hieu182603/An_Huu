import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { memoryDb } from "./memory-db";
import { config } from "./helpers";
import { AuthService, tokenHash } from "../modules/auth/service";
import { ProfileService, financialSummary } from "../modules/profiles/service";
import { profileSchema, partialProfileSchema } from "../modules/profiles/schema";
import { registerSchema } from "../modules/auth/schema";
import { unseal } from "../jobs/outbox";
import { createApp } from "../app";
import { verifyAccessToken } from "../middlewares/authMiddleware";
import { transaction } from "../common/transaction";

export const financialData = {
  personal: { age: 35, gender: "MALE" as const, maritalStatus: "SINGLE" as const, dependents: 0, city: "HCM" },
  income: { primaryIncome: "100.10", secondaryIncome: "0" },
  expenses: { essentialExpense: "200.20", lifestyleExpense: "0" },
  assets: { cashSavings: "9007199254740993.25", realEstateValue: "1000", liquidAssets: "0", stockFundValue: "0" },
  debt: { hasDebt: true, mortgageDebt: "500", consumerDebt: "0", monthlyDebtService: "5" },
  socialSecurity: { socialInsuranceYears: 10, socialInsuranceSalary: "100" },
};
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
const input = { email: "account@example.test", password: "a-long-password-123", fullName: "Account" };
async function registered() {
  const memory = memoryDb(), disconnect = vi.fn();
  const auth = new AuthService(memory.db, config, disconnect);
  await auth.register(input);
  const payload = unseal(memory.rows("outboxEvent")[0].payload, config) as { token: string };
  return { ...memory, auth, disconnect, otp: payload.token };
}
async function active() {
  const f = await registered();
  await f.auth.verifyEmail(input.email, f.otp);
  return f;
}

describe("authentication service lifecycle (offline)", () => {
  it("registers only pending users, hashes credentials and encrypts queued OTP", async () => {
    const f = await registered(), user = f.rows("user")[0];
    expect(user).toMatchObject({ role: "USER", status: "PENDING_VERIFICATION" });
    expect(user.passwordHash).not.toBe(input.password);
    expect(f.rows("verificationToken")[0].tokenHash).not.toContain(f.otp);
    expect(JSON.stringify(f.rows("outboxEvent"))).not.toContain(input.email);
    await f.auth.register({ ...input, fullName: "replacement" });
    expect(f.rows("user")).toHaveLength(1);
    expect(f.rows("user")[0].fullName).toBe("Account");
    await expect(f.auth.login({ ...input, remember: false })).rejects.toMatchObject({ status: 403, code: "EMAIL_NOT_VERIFIED" });
    await expect(f.auth.login({ ...input, password: "incorrect-password-123", remember: false })).rejects.toMatchObject({ status: 401 });
    expect(f.rows("refreshToken")).toHaveLength(0);
  });
  it("limits OTP attempts and rejects expired and reused codes", async () => {
    const f = await registered();
    const wrong = f.otp === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(f.auth.verifyEmail(input.email, wrong)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect(f.rows("verificationToken")[0].attempts).toBe(5);
    await expect(f.auth.verifyEmail(input.email, f.otp)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    f.rows("verificationToken")[0].attempts = 0;
    f.rows("verificationToken")[0].expiresAt = new Date(0);
    await expect(f.auth.verifyEmail(input.email, f.otp)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    f.rows("verificationToken")[0].expiresAt = new Date(Date.now() + 60000);
    await f.auth.verifyEmail(input.email, f.otp);
    await expect(f.auth.verifyEmail(input.email, f.otp)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
  it("rotates hashed refresh tokens and commits family revocation on reuse", async () => {
    const f = await active();
    const session = await f.auth.login({ ...input, remember: true });
    const claims = verifyAccessToken(session.accessToken, config);
    expect(await f.auth.validateSession(claims)).toMatchObject({ email: input.email });
    expect(f.rows("refreshToken")[0].tokenHash).toBe(tokenHash(session.refreshToken));
    const next = await f.auth.refresh(session.refreshToken);
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect(next.persistent).toBe(true);
    expect(next.expiresAt).toEqual(session.expiresAt);
    await expect(f.auth.refresh(session.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(f.rows("refreshToken").every(r => r.revokedAt)).toBe(true);
    await expect(f.auth.refresh(next.refreshToken)).rejects.toMatchObject({ status: 401 });
    await expect(f.auth.validateSession(claims)).rejects.toMatchObject({ status: 401 });
    expect(f.disconnect).toHaveBeenCalled();
  });
  it("rejects suspended accounts and logout invalidates access/session immediately", async () => {
    const f = await active(), session = await f.auth.login({ ...input, remember: false });
    expect(session.persistent).toBe(false);
    const claims = verifyAccessToken(session.accessToken, config);
    f.rows("user")[0].status = "SUSPENDED";
    await expect(f.auth.validateSession(claims)).rejects.toMatchObject({ status: 401 });
    await expect(f.auth.refresh(session.refreshToken)).rejects.toMatchObject({ status: 401 });
    f.rows("user")[0].status = "ACTIVE";
    await f.auth.logout(session.refreshToken);
    await expect(f.auth.validateSession(claims)).rejects.toMatchObject({ status: 401 });
  });
  it("resets once, revokes sessions and rejects the old password", async () => {
    const f = await active(), session = await f.auth.login({ ...input, remember: false });
    await f.auth.requestEmail(input.email, "PASSWORD_RESET");
    const payload = unseal(f.rows("outboxEvent").find(r => r.type === "auth.reset_password")!.payload, config) as { token: string };
    const password = "new-long-password-456";
    await f.auth.resetPassword(payload.token, password);
    await expect(f.auth.resetPassword(payload.token, password)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(f.auth.login({ ...input, remember: false })).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(f.rows("refreshToken")).toHaveLength(1);
    expect(f.rows("refreshToken")[0].revokedAt).toBeInstanceOf(Date);
    await expect(f.auth.refresh(session.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await f.auth.login({ ...input, password, remember: false })).toHaveProperty("accessToken");
  });
  it("logout-all advances security version and invalidates every device", async () => {
    const f = await active();
    const sessions = [await f.auth.login({ ...input, remember: false }), await f.auth.login({ ...input, remember: true })];
    await f.auth.logoutAll(f.rows("user")[0].id);
    expect(f.rows("user")[0].securityVersion).toBe(1);
    for (const session of sessions) await expect(f.auth.validateSession(verifyAccessToken(session.accessToken, config))).rejects.toMatchObject({ status: 401 });
  });
  it("rolls back registration if the transactional outbox cannot persist", async () => {
    const f = memoryDb(); f.failWrites("outboxEvent");
    await expect(new AuthService(f.db, config).register(input)).rejects.toThrow();
    expect(f.rows("user")).toHaveLength(0);
    expect(f.rows("verificationToken")).toHaveLength(0);
    expect(f.rows("auditLog")).toHaveLength(0);
  });
});

describe("profile and onboarding services (offline)", () => {
  it("keeps exact decimal values, negative surplus and separates real estate", () => {
    expect(financialSummary(financialData)).toMatchObject({
      netWorth: "9007199254741493.25", retirementLiquidAssets: "9007199254740993.25", availableMonthlySurplus: "-105.10",
    });
    expect(profileSchema.safeParse({ ...financialData, assets: { ...financialData.assets, liquidAssets: "9007199254740993.25" } }).success).toBe(false);
  });
  it("rejects financial benchmark overrides, numeric money and inconsistent debt", () => {
    expect(partialProfileSchema.safeParse({ income: { primaryIncome: 100 } }).success).toBe(false);
    expect(partialProfileSchema.safeParse({ personal: { age: 35, inflationRate: 4 } }).success).toBe(false);
    expect(profileSchema.safeParse({ ...financialData, debt: { ...financialData.debt, hasDebt: false } }).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, password: "💡".repeat(19) }).success).toBe(false);
  });
  it("merges partial drafts, isolates owners and rejects stale revisions", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("a", 0, "income", { income: { primaryIncome: "100" } });
    await profiles.saveDraft("a", 1, "income", { income: { secondaryIncome: "20" } });
    expect(await profiles.getDraft("a")).toMatchObject({ revision: 2, data: { income: { primaryIncome: "100", secondaryIncome: "20" } } });
    expect(await profiles.getDraft("b")).toBeNull();
    await expect(profiles.saveDraft("a", 1, "income", {})).rejects.toMatchObject({ status: 409 });
    await expect(profiles.complete("a", { expectedDraftRevision: 2, expectedProfileRevision: 0 }, randomUUID())).rejects.toThrow();
    expect(f.rows("onboardingDraft")).toHaveLength(1);
    expect(f.rows("financialProfile")).toHaveLength(0);
  });
  it("completes atomically, replays an idempotent response and marks plans stale", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("a", 0, "summary", financialData);
    await f.db.retirementPlan.create({ data: { userId: "a" } });
    const key = randomUUID(), command = { expectedDraftRevision: 1, expectedProfileRevision: 0 };
    const result = await profiles.complete("a", command, key);
    expect(await profiles.complete("a", command, key)).toEqual(result);
    expect(f.rows("financialProfile")).toHaveLength(1);
    expect(f.rows("onboardingDraft")).toHaveLength(0);
    expect(f.rows("retirementPlan")[0].stale).toBe(true);
    await expect(profiles.complete("a", { ...command, expectedProfileRevision: 2 }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await profiles.patchProfile("a", 1, { expenses: { essentialExpense: "300" } });
    expect(await profiles.getProfile("a")).toMatchObject({ revision: 2, summary: { availableMonthlySurplus: "-204.90" } });
    await expect(profiles.patchProfile("a", 1, { income: { primaryIncome: "0" } })).rejects.toMatchObject({ status: 409 });
    await expect(profiles.patchProfile("b", 2, {})).rejects.toMatchObject({ status: 404 });
  });
  it("preserves the draft and rolls back the profile when audit/outbox writes fail", async () => {
    const f = memoryDb(), profiles = new ProfileService(f.db);
    await profiles.saveDraft("a", 0, "summary", financialData);
    f.failWrites("outboxEvent");
    await expect(profiles.complete("a", { expectedDraftRevision: 1, expectedProfileRevision: 0 }, randomUUID())).rejects.toThrow();
    expect(f.rows("onboardingDraft")).toHaveLength(1);
    expect(f.rows("financialProfile")).toHaveLength(0);
    expect(f.rows("auditLog")).toHaveLength(0);
  });
  it("retries serialization conflicts only and returns 409 after exhaustion", async () => {
    const f = memoryDb();
    const error = new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "5.22" });
    const tx = vi.spyOn(f.db, "$transaction").mockRejectedValue(error);
    await expect(transaction(f.db, async () => true)).rejects.toMatchObject({ status: 409 });
    expect(tx).toHaveBeenCalledTimes(3);
  });
});

describe("auth/profile HTTP boundary", () => {
  it("sets a private refresh cookie, enforces CSRF, rejects role overrides and uses JWT ownership", async () => {
    const f = await active();
    const app = createApp({ config, services: { auth: f.auth, profiles: new ProfileService(f.db) }, databaseProbe: async () => {} });
    expect((await request(app).post("/api/v1/auth/register").send({ ...input, role: "ADMIN" })).status).toBe(400);
    const login = await request(app).post("/api/v1/auth/login").send({ ...input, fullName: undefined, remember: false });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Expires");
    expect(login.body.data.refreshToken).toBeUndefined();
    const headers = { Authorization: "Bearer " + login.body.data.accessToken };
    expect((await request(app).get("/api/v1/me").set(headers)).body.data.email).toBe(input.email);
    expect((await request(app).patch("/api/v1/me").set(headers).send({ expectedRevision: 0, changes: { role: "ADMIN" } })).status).toBe(400);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie).send({})).status).toBe(403);
    const rotated = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie)
      .set("Origin", config.CLIENT_URL).set("X-CSRF-Protection", "1").send({});
    expect(rotated.status).toBe(200);
    expect((await request(app).get("/api/v1/me/financial-profile").set(headers)).body.data).toBeNull();
    const draft = await request(app).put("/api/v1/me/onboarding-draft").set(headers)
      .send({ expectedRevision: 0, step: "personal", data: { personal: { age: 35 } } });
    expect(draft.status).toBe(200);
    expect(f.rows("onboardingDraft")[0].userId).toBe(f.rows("user")[0].id);
    expect((await request(app).post("/api/v1/me/onboarding/complete").set(headers)
      .send({ expectedDraftRevision: 1, expectedProfileRevision: 0 })).status).toBe(400);
  });
  it("does not accept unsigned Google credentials when the provider is unconfigured", async () => {
    const f = await active();
    const app = createApp({ config, services: { auth: f.auth, profiles: new ProfileService(f.db) }, databaseProbe: async () => {} });
    const payload = { sub: "google-12345", email: "google-user@example.test", name: "Google User", picture: "https://example.test/avatar.jpg" };
    const fakeCredential = "header." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".sig";
    const res = await request(app).post("/api/v1/auth/google").send({ credential: fakeCredential });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("GOOGLE_NOT_CONFIGURED");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(f.rows("user")).toHaveLength(1);
  });
});
