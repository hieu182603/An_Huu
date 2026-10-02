import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { enqueue } from "../../jobs/outbox";
import { publicUser } from "../auth/service";
import { profileSchema, partialProfileSchema, patchAccountSchema, type FinancialData, type ProfileChanges } from "./schema";

const conflict = () => new AppError(409, "REVISION_CONFLICT", "Dữ liệu đã thay đổi. Vui lòng tải lại trước khi lưu.");
function merge(base: ProfileChanges, changes: ProfileChanges) {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(changes) as Array<keyof ProfileChanges>) result[key] = { ...base[key], ...changes[key] };
  return result;
}
export function financialSummary(data: FinancialData) {
  const D = Prisma.Decimal;
  const income = new D(data.income.primaryIncome).plus(data.income.secondaryIncome);
  const expenses = new D(data.expenses.essentialExpense).plus(data.expenses.lifestyleExpense);
  const assets = Object.values(data.assets).reduce((total, v) => total.plus(v), new D(0));
  const debt = new D(data.debt.mortgageDebt).plus(data.debt.consumerDebt);
  return {
    monthlyIncome: income.toFixed(2), monthlyExpense: expenses.toFixed(2), totalAssets: assets.toFixed(2),
    totalDebt: debt.toFixed(2), netWorth: assets.minus(debt).toFixed(2),
    availableMonthlySurplus: income.minus(expenses).minus(data.debt.monthlyDebtService).toFixed(2), currency: "VND",
  };
}
export class ProfileService {
  constructor(private db: PrismaClient) {}
  async getAccount(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
    return publicUser(user);
  }
  async patchAccount(userId: string, input: z.infer<typeof patchAccountSchema>) {
    return transaction(this.db, async tx => {
      const updated = await tx.user.updateMany({ where: { id: userId, revision: input.expectedRevision }, data: {
        ...input.changes, revision: { increment: 1 },
      } });
      if (updated.count !== 1) throw conflict();
      await audit(tx, userId, "ACCOUNT_UPDATED", "USER", userId, { fields: Object.keys(input.changes) });
      return publicUser((await tx.user.findUniqueOrThrow({ where: { id: userId } })));
    });
  }
  async getProfile(userId: string) {
    const row = await this.db.financialProfile.findUnique({ where: { userId } });
    if (!row) return null;
    const data = profileSchema.parse(row.profileData);
    return { id: row.id, revision: row.revision, asOfDate: row.asOfDate, completedAt: row.completedAt, data, summary: financialSummary(data) };
  }
  async patchProfile(userId: string, expectedRevision: number, changes: ProfileChanges) {
    return transaction(this.db, async tx => {
      const row = await tx.financialProfile.findUnique({ where: { userId } });
      if (!row) throw new AppError(404, "NOT_FOUND", "Chưa có hồ sơ tài chính.");
      if (row.revision !== expectedRevision) throw conflict();
      const data = profileSchema.parse(merge(profileSchema.parse(row.profileData), changes));
      const summary = financialSummary(data);
      const updated = await tx.financialProfile.updateMany({ where: { userId, revision: expectedRevision }, data: {
        profileData: data, revision: { increment: 1 }, asOfDate: new Date(), netWorth: summary.netWorth,
      } });
      if (updated.count !== 1) throw conflict();
      await tx.retirementPlan.updateMany({ where: { userId }, data: { stale: true } });
      await audit(tx, userId, "PROFILE_UPDATED", "FINANCIAL_PROFILE", row.id, { revision: expectedRevision + 1 });
      await enqueue(tx, "profile.changed", userId, { userId, revision: expectedRevision + 1 });
      return { revision: expectedRevision + 1, data, summary };
    });
  }
  getDraft(userId: string) { return this.db.onboardingDraft.findUnique({ where: { userId }, select: { revision: true, step: true, data: true, updatedAt: true } }); }
  async saveDraft(userId: string, expectedRevision: number, step: string, changes: ProfileChanges) {
    return transaction(this.db, async tx => {
      const row = await tx.onboardingDraft.findUnique({ where: { userId } });
      if ((row?.revision ?? 0) !== expectedRevision) throw conflict();
      const data = partialProfileSchema.parse(merge(row ? partialProfileSchema.parse(row.data) : {}, changes));
      const draft = row
        ? await tx.onboardingDraft.update({ where: { userId }, data: { data, step, revision: { increment: 1 } } })
        : await tx.onboardingDraft.create({ data: { userId, data, step } });
      return { revision: draft.revision, step: draft.step, data: draft.data, updatedAt: draft.updatedAt };
    });
  }
  async complete(userId: string, input: { expectedDraftRevision: number; expectedProfileRevision: number }, key: string) {
    const scope = "onboarding.complete";
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return transaction(this.db, async tx => {
      const previous = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa yêu cầu đã được dùng cho dữ liệu khác.");
        return previous.response;
      }
      const draft = await tx.onboardingDraft.findUnique({ where: { userId } });
      if (!draft) throw new AppError(404, "DRAFT_NOT_FOUND", "Chưa có bản nháp.");
      if (draft.revision !== input.expectedDraftRevision) throw conflict();
      const existing = await tx.financialProfile.findUnique({ where: { userId } });
      if ((existing?.revision ?? 0) !== input.expectedProfileRevision) throw conflict();
      const data = profileSchema.parse(draft.data);
      const summary = financialSummary(data);
      const changes = { profileData: data, asOfDate: new Date(), completedAt: new Date(), netWorth: summary.netWorth, schemaVersion: 1 };
      const profile = existing
        ? await tx.financialProfile.update({ where: { userId }, data: { ...changes, revision: { increment: 1 } } })
        : await tx.financialProfile.create({ data: { userId, ...changes } });
      await tx.retirementPlan.updateMany({ where: { userId }, data: { stale: true } });
      await audit(tx, userId, "ONBOARDING_COMPLETED", "FINANCIAL_PROFILE", profile.id, { revision: profile.revision });
      await enqueue(tx, "profile.changed", userId, { userId, revision: profile.revision });
      await tx.onboardingDraft.delete({ where: { userId } });
      const response = { profileId: profile.id, revision: profile.revision, completed: true };
      await tx.idempotencyRecord.create({ data: { userId, scope, key, requestHash, response } });
      return response;
    });
  }
}
