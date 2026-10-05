import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { AuthService } from "../modules/auth/service";
import { ProfileService } from "../modules/profiles/service";
import { OutboxProcessor } from "../jobs/processor";
import { enqueue, unseal } from "../jobs/outbox";
import { audit } from "../common/audit";
import { transaction } from "../common/transaction";
import { config } from "./helpers";
import { verifyAccessToken } from "../middlewares/authMiddleware";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) ||
    !/^\/anhuu_[a-z0-9_]+_test$/.test(new URL(url).pathname)) throw new Error("Isolated local TEST_DATABASE_URL required");
const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
afterAll(() => db.$disconnect());
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
const data = {
  personal: { age: 35, gender: "MALE" as const, maritalStatus: "SINGLE" as const, dependents: 0, city: "HCM" },
  income: { primaryIncome: "100.10", secondaryIncome: "0" },
  expenses: { essentialExpense: "200.20", lifestyleExpense: "0" },
  assets: { cashSavings: "9007199254740993.25", realEstateValue: "1000", liquidAssets: "0", stockFundValue: "0" },
  debt: { hasDebt: true, mortgageDebt: "500", consumerDebt: "0", monthlyDebtService: "5" },
  socialSecurity: { socialInsuranceYears: 10, socialInsuranceSalary: "100" },
};
async function account() {
  const auth = new AuthService(db, config);
  const input = { email: randomUUID() + "@example.test", password: "isolated-test-password-123", fullName: "Integration Fixture" };
  await auth.register(input);
  const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });
  const event = await db.outboxEvent.findFirstOrThrow({ where: { entityId: user.id, type: "auth.verify_email" } });
  const payload = unseal(event.payload, config) as { token: string };
  await auth.verifyEmail(input.email, payload.token);
  return { auth, input, user };
}
describe("B01-B03 PostgreSQL workflows", () => {
  it("migrates all account/profile/outbox models and records migration completion", async () => {
    const migrations = await db.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(migrations.map(m => m.migration_name)).toContain("202610020002_accounts_profiles_outbox");
    expect(await db.outboxEvent.count()).toBeGreaterThanOrEqual(0);
    expect(await db.onboardingDraft.count()).toBeGreaterThanOrEqual(0);
  });
  it("runs register/verify/login/refresh/logout with real persisted session checks", async () => {
    const { auth, input } = await account();
    const session = await auth.login({ ...input, remember: true });
    const claims = verifyAccessToken(session.accessToken, config);
    expect(await auth.validateSession(claims)).toMatchObject({ email: input.email });
    const rotated = await auth.refresh(session.refreshToken);
    await auth.logout(rotated.refreshToken);
    await expect(auth.validateSession(claims)).rejects.toMatchObject({ status: 401 });
  });
  it("serializes simultaneous refreshes and revokes a reused token family", async () => {
    const { auth, input, user } = await account();
    const session = await auth.login({ ...input, remember: false });
    const results = await Promise.allSettled([auth.refresh(session.refreshToken), auth.refresh(session.refreshToken)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await db.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });
  it("allows one competing draft write and preserves both existing fields", async () => {
    const { user } = await account(), profiles = new ProfileService(db);
    await profiles.saveDraft(user.id, 0, "income", { income: { primaryIncome: "100" } });
    const results = await Promise.allSettled([
      profiles.saveDraft(user.id, 1, "income", { income: { secondaryIncome: "10" } }),
      profiles.saveDraft(user.id, 1, "income", { income: { secondaryIncome: "20" } }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409 });
    expect(await profiles.getDraft(user.id)).toMatchObject({ revision: 2, data: { income: { primaryIncome: "100" } } });
  });
  it("persists exact decimals, atomic onboarding, replay and ownership", async () => {
    const { user } = await account(), profiles = new ProfileService(db);
    await profiles.saveDraft(user.id, 0, "summary", data);
    const command = { expectedDraftRevision: 1, expectedProfileRevision: 0 }, key = randomUUID();
    const response = await profiles.complete(user.id, command, key);
    expect(await profiles.complete(user.id, command, key)).toEqual(response);
    expect(await profiles.getDraft(user.id)).toBeNull();
    expect(await profiles.getProfile(user.id)).toMatchObject({ summary: { availableMonthlySurplus: "-105.10", netWorth: "9007199254741493.25" } });
    expect((await db.financialProfile.findUniqueOrThrow({ where: { userId: user.id } })).netWorth?.toFixed(2)).toBe("9007199254741493.25");
    expect(await profiles.getProfile(randomUUID())).toBeNull();
    await expect(profiles.patchProfile(randomUUID(), 1, {})).rejects.toMatchObject({ status: 404 });
  });
  it("rolls back data, audit and outbox together on transaction failure", async () => {
    const id = randomUUID();
    await expect(transaction(db, async tx => {
      await tx.user.create({ data: { id, email: id + "@example.test", passwordHash: "test", fullName: "Rollback" } });
      await audit(tx, id, "TEST", "USER", id);
      await enqueue(tx, "test.rollback", id, {});
      throw new Error("rollback fixture");
    })).rejects.toThrow("rollback fixture");
    expect(await db.user.count({ where: { id } })).toBe(0);
    expect(await db.auditLog.count({ where: { targetId: id } })).toBe(0);
    expect(await db.outboxEvent.count({ where: { entityId: id } })).toBe(0);
  });
  it("two workers claim one event, and an expired lease can be recovered", async () => {
    const event = await db.outboxEvent.create({ data: { type: "test.delivery", entityId: randomUUID(), payload: {} } });
    let calls = 0;
    const handler = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); };
    const a = new OutboxProcessor(db, handler), b = new OutboxProcessor(db, handler);
    await Promise.all([a.process(event.id), b.process(event.id)]);
    expect(calls).toBe(1);
    expect(await db.processedEvent.count({ where: { eventId: event.id } })).toBe(1);
    const stale = await db.outboxEvent.create({ data: { type: "test.delivery", entityId: randomUUID(), payload: {}, status: "PROCESSING", lockedUntil: new Date(0), leaseId: randomUUID() } });
    await b.process(stale.id);
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("COMPLETED");
  });
});
