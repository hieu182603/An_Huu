import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { enqueue } from "../../jobs/outbox";
import { publicUser } from "../auth/service";
import { profileSchema, partialProfileSchema, patchAccountSchema, patchProfileSchema, draftSchema, type FinancialData, type ProfileChanges, type ProfileInputChanges } from "./schema";
import { isV2, profileV2Schema, partialProfileV2Schema, type ProfileV2, type ProfileV2Changes } from "./schema-v2";
import { profileV2Summary } from "./summary-v2";

const conflict = () => new AppError(409, "REVISION_CONFLICT", "Dữ liệu đã thay đổi. Vui lòng tải lại trước khi lưu.");
function merge(base: ProfileChanges, changes: ProfileChanges) {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(changes) as Array<keyof ProfileChanges>) result[key] = { ...base[key], ...changes[key] };
  return result;
}
function mergeV2(base: ProfileV2Changes, changes: ProfileV2Changes) {
  return { ...base, ...changes, ...(changes.personal ? { personal: { ...base.personal, ...changes.personal } } : {}) };
}
function storedProfile(value: unknown, schemaVersion: number) {
  if (schemaVersion !== 1 && schemaVersion !== 2)
    throw new AppError(409, "PROFILE_SCHEMA_UNSUPPORTED", "Phiên bản hồ sơ chưa được hỗ trợ.");
  const result = schemaVersion === 2 ? profileV2Schema.safeParse(value) : profileSchema.safeParse(value);
  if (!result.success) throw new AppError(409, "PROFILE_DATA_REVIEW_REQUIRED", "Dữ liệu hồ sơ đã lưu cần được rà soát.");
  return result.data;
}
function legacyReview(data: FinancialData) {
  const unconfirmedZeroFields: string[] = [];
  for (const [group, values] of Object.entries(data)) {
    for (const [field, value] of Object.entries(values)) {
      if ((typeof value === "string" && /^0(?:\.0+)?$/.test(value)) || value === 0)
        unconfirmedZeroFields.push(group + "." + field);
    }
  }
  return { status: "LEGACY_UNREVIEWED", unconfirmedZeroFields };
}
function describeProfile(data: FinancialData | ProfileV2) {
  return isV2(data)
    ? { schemaVersion: 2, data, summary: profileV2Summary(data), dataQuality: { status: "EXPLICIT_STATES", unconfirmedZeroFields: [] } }
    : { schemaVersion: 1, data, summary: financialSummary(data), dataQuality: legacyReview(data) };
}
function storedFields(data: FinancialData | ProfileV2) {
  return isV2(data)
    ? { profileData: data, schemaVersion: 2, asOfDate: new Date(data.valuationDate + "T00:00:00.000Z"), netWorth: null }
    : { profileData: data, schemaVersion: 1, asOfDate: new Date(), netWorth: financialSummary(data).netWorth };
}
function legacySnapshot(value: Prisma.JsonValue): Prisma.InputJsonValue {
  if (value === null) throw new AppError(409, "PROFILE_DATA_REVIEW_REQUIRED", "Dữ liệu hồ sơ đã lưu cần được rà soát.");
  return value;
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
    retirementLiquidAssets: new D(data.assets.cashSavings).plus(data.assets.liquidAssets).plus(data.assets.stockFundValue).toFixed(2),
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
      await enqueue(tx, "notification.account_updated", userId, {});
      return publicUser((await tx.user.findUniqueOrThrow({ where: { id: userId } })));
    });
  }
  async getProfile(userId: string) {
    const row = await this.db.financialProfile.findUnique({ where: { userId } });
    if (!row) return null;
    const data = storedProfile(row.profileData, row.schemaVersion);
    return { id: row.id, revision: row.revision, asOfDate: row.asOfDate, completedAt: row.completedAt, ...describeProfile(data) };
  }
  async updateAvatar(userId: string, expectedRevision: number, avatarUrl: string | null) {
    return transaction(this.db, async tx => {
      const changed = await tx.user.updateMany({ where: { id: userId, revision: expectedRevision }, data: { avatarUrl, revision: { increment: 1 } } });
      if (!changed.count) throw conflict();
      await audit(tx, userId, "ACCOUNT_AVATAR_UPDATED", "USER", userId);
      return publicUser(await tx.user.findUniqueOrThrow({ where: { id: userId } }));
    });
  }
  async patchProfile(userId: string, expectedRevision: number, changes: ProfileInputChanges) {
    const checked = patchProfileSchema.parse({ expectedRevision, changes }).changes;
    return transaction(this.db, async tx => {
      const row = await tx.financialProfile.findUnique({ where: { userId } });
      if (!row) throw new AppError(404, "NOT_FOUND", "Chưa có hồ sơ tài chính.");
      if (row.revision !== expectedRevision) throw conflict();
      const base = storedProfile(row.profileData, row.schemaVersion);
      if (isV2(base) && !isV2(checked))
        throw new AppError(409, "PROFILE_SCHEMA_MISMATCH", "Hồ sơ đã nâng cấp; vui lòng tải lại và gửi schemaVersion 2.");
      const data = isV2(checked)
        ? profileV2Schema.parse(isV2(base) ? mergeV2(base, checked) : checked)
        : profileSchema.parse(merge(profileSchema.parse(base), checked));
      const updated = await tx.financialProfile.updateMany({ where: { userId, revision: expectedRevision }, data: {
        ...storedFields(data), revision: { increment: 1 },
        ...(!isV2(base) && isV2(data) ? { legacyProfileData: legacySnapshot(row.profileData) } : {}),
      } });
      if (updated.count !== 1) throw conflict();
      await tx.retirementPlan.updateMany({ where: { userId }, data: { stale: true } });
      await audit(tx, userId, "PROFILE_UPDATED", "FINANCIAL_PROFILE", row.id, { revision: expectedRevision + 1 });
      await enqueue(tx, "profile.changed", userId, { userId, revision: expectedRevision + 1 });
      return { revision: expectedRevision + 1, ...describeProfile(data) };
    });
  }
  async getDraft(userId: string) {
    const row = await this.db.onboardingDraft.findUnique({ where: { userId }, select: { revision: true, step: true, data: true, updatedAt: true } });
    if (!row) return null;
    const checked = (isV2(row.data) ? partialProfileV2Schema : partialProfileSchema).safeParse(row.data);
    if (!checked.success) throw new AppError(409, "DRAFT_DATA_REVIEW_REQUIRED", "Bản nháp đã lưu cần được rà soát.");
    return { ...row, data: checked.data };
  }
  async saveDraft(userId: string, expectedRevision: number, step: string, changes: ProfileInputChanges) {
    const checked = draftSchema.parse({ expectedRevision, step, data: changes }).data;
    return transaction(this.db, async tx => {
      const row = await tx.onboardingDraft.findUnique({ where: { userId } });
      if ((row?.revision ?? 0) !== expectedRevision) throw conflict();
      if (row && isV2(row.data) !== isV2(checked))
        throw new AppError(409, "DRAFT_SCHEMA_MISMATCH", "Hãy hoàn tất bản nháp hiện có trước khi đổi phiên bản hồ sơ.");
      const data = isV2(checked)
        ? partialProfileV2Schema.parse(mergeV2(row ? partialProfileV2Schema.parse(row.data) : { schemaVersion: 2 }, checked))
        : partialProfileSchema.parse(merge(row ? partialProfileSchema.parse(row.data) : {}, checked));
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
      const data = isV2(draft.data) ? profileV2Schema.parse(draft.data) : profileSchema.parse(draft.data);
      if (existing?.schemaVersion === 2 && !isV2(data))
        throw new AppError(409, "PROFILE_SCHEMA_MISMATCH", "Không thể ghi đè hồ sơ mới bằng bản nháp phiên bản cũ.");
      if (existing && ![1, 2].includes(existing.schemaVersion))
        throw new AppError(409, "PROFILE_SCHEMA_UNSUPPORTED", "Phiên bản hồ sơ chưa được hỗ trợ.");
      const changes = { ...storedFields(data), completedAt: new Date(),
        ...(existing?.schemaVersion === 1 && isV2(data) ? { legacyProfileData: legacySnapshot(existing.profileData) } : {}) };
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
