import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type AssumptionSetVersion, type RetirementGoal, type OutboxEvent } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { enqueue } from "../../jobs/outbox";
import { handlePlanUpdateEvent } from "../plans/events";
import { profileSchema } from "../profiles/schema";
import { financialSummary } from "../profiles/service";
import { assumptionSchema, goalDataSchema, MODEL_CODE, type Assumptions, type Goal, calculateSchema, publicPreviewSchema, sourceSchema } from "./schema";
import { calculatePlan, resolveAssumptions, modelDefinition } from "./engine";

type Tx = Prisma.TransactionClient;
type Command = z.infer<typeof calculateSchema>;
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Dữ liệu đã thay đổi. Vui lòng tải lại trước khi tiếp tục.");
const unavailable = () => new AppError(503, "BENCHMARKS_UNAVAILABLE", "Chưa có mô hình và bộ giả định đã được duyệt để tính kế hoạch.");
const configuration = (row: AssumptionSetVersion): Assumptions => assumptionSchema.parse({
  modelCode: row.modelCode, values: row.values, policy: row.policy, source: row.source, reason: row.reason,
});
const goalData = (row: RetirementGoal): Goal => {
  const result = goalDataSchema.safeParse({ targetRetirementAge: row.targetRetirementAge, lifeExpectancy: row.lifeExpectancy,
    riskLevel: row.riskLevel, lifestyle: row.lifestyle, monthlyExpense: row.monthlyExpense.toFixed(2), monthlyContribution: row.monthlyContribution.toFixed(2) });
  if (!result.success) throw new AppError(409, "GOAL_INCOMPLETE", "Cần cập nhật đầy đủ mục tiêu hưu trí.");
  return result.data;
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
export class FinancialService {
  constructor(private db: PrismaClient) {}
  private active(tx: Tx, now = new Date()) {
    return tx.assumptionSetVersion.findFirst({ where: { status: "PUBLISHED", effectiveAt: { lte: now } }, orderBy: { version: "desc" } });
  }
  private async resolved(tx: Tx) {
    const row = await this.active(tx);
    if (!row || row.modelCode !== MODEL_CODE) throw unavailable();
    const model = await tx.financialModelVersion.findUnique({ where: { code: row.modelCode } });
    if (!model || model.status !== "PUBLISHED") throw unavailable();
    return { row, model, data: configuration(row) };
  }
  async models() {
    const approval = await this.db.financialModelVersion.findUnique({ where: { code: MODEL_CODE } });
    return [{ ...modelDefinition, status: approval?.status ?? "AWAITING_REVIEW", approval: approval?.source ?? null }];
  }
  async approveModel(actor: string, review: z.infer<typeof sourceSchema>) {
    return transaction(this.db, async tx => {
      const existing = await tx.financialModelVersion.findUnique({ where: { code: MODEL_CODE } });
      if (existing?.status === "PUBLISHED") throw new AppError(409, "MODEL_IMMUTABLE", "Phiên bản công thức đã duyệt không được sửa.");
      const data = { status: "PUBLISHED", description: modelDefinition.description, source: json({ review, conventions: modelDefinition.conventions, approvedBy: actor }) };
      const row = await tx.financialModelVersion.upsert({ where: { code: MODEL_CODE }, create: { code: MODEL_CODE, ...data }, update: data });
      await audit(tx, actor, "MODEL_APPROVED", "FINANCIAL_MODEL", row.id, { code: MODEL_CODE, review: review.url });
      return row;
    });
  }
  async benchmarks() {
    const resolved = await this.resolved(this.db);
    return { id: resolved.row.id, version: resolved.row.version, effectiveAt: resolved.row.effectiveAt,
      ...resolved.data, pension: { status: "NOT_ESTIMATED" } };
  }
  listVersions(page: number, limit: number) {
    return this.db.assumptionSetVersion.findMany({ orderBy: { version: "desc" }, skip: (page - 1) * limit, take: limit });
  }
  history(page: number, limit: number) {
    return this.db.auditLog.findMany({ where: { targetType: { in: ["FINANCIAL_CONFIG", "FINANCIAL_MODEL"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit });
  }
  createDraft(actor: string, input: Assumptions) {
    const data = assumptionSchema.parse(input);
    return transaction(this.db, async tx => {
      const latest = await tx.assumptionSetVersion.findFirst({ orderBy: { version: "desc" } });
      const row = await tx.assumptionSetVersion.create({ data: { ...data, source: json(data.source) as unknown as Prisma.InputJsonArray,
        version: (latest?.version ?? 0) + 1, createdBy: actor } });
      await audit(tx, actor, "BENCHMARK_DRAFT_CREATED", "FINANCIAL_CONFIG", row.id, { version: row.version });
      return row;
    });
  }
  patchDraft(actor: string, id: string, revision: number, input: Assumptions) {
    const data = assumptionSchema.parse(input);
    return transaction(this.db, async tx => {
      const updated = await tx.assumptionSetVersion.updateMany({ where: { id, revision, status: "DRAFT" },
        data: { ...data, revision: { increment: 1 } } });
      if (updated.count !== 1) throw conflict();
      await audit(tx, actor, "BENCHMARK_DRAFT_UPDATED", "FINANCIAL_CONFIG", id, { revision: revision + 1 });
      return tx.assumptionSetVersion.findUniqueOrThrow({ where: { id } });
    });
  }
  async previewImpact(id: string) {
    const proposed = await this.db.assumptionSetVersion.findUnique({ where: { id } });
    if (!proposed) throw new AppError(404, "NOT_FOUND", "Không tìm thấy bộ giả định.");
    const current = await this.active(this.db);
    return { draftRevision: proposed.revision, activeVersionId: current?.id ?? null,
      affectedPlans: await this.db.retirementPlan.count({ where: { currentVersionId: { not: null } } }),
      changes: { before: current ? configuration(current) : null, after: configuration(proposed) },
      scope: "CONFIGURATION_DIFF_AND_RECALCULATION_COUNT" };
  }
  publish(actor: string, id: string, revision: number, expectedActiveVersionId: string | null) {
    return transaction(this.db, async tx => {
      const row = await tx.assumptionSetVersion.findUnique({ where: { id } });
      if (!row || row.status !== "DRAFT" || row.revision !== revision) throw conflict();
      const current = await this.active(tx);
      if ((current?.id ?? null) !== expectedActiveVersionId) throw conflict();
      if (current && row.version <= current.version) throw new AppError(409, "OLDER_VERSION", "Hãy tạo bản nháp mới hơn phiên bản đang phát hành.");
      const data = configuration(row);
      const model = await tx.financialModelVersion.findUnique({ where: { code: data.modelCode } });
      if (!model || model.status !== "PUBLISHED") throw unavailable();
      const published = await tx.assumptionSetVersion.update({ where: { id }, data: {
        status: "PUBLISHED", effectiveAt: new Date(), publishedBy: actor, revision: { increment: 1 },
      } });
      await audit(tx, actor, "BENCHMARK_PUBLISHED", "FINANCIAL_CONFIG", id, json({
        previousVersionId: current?.id ?? null, before: current ? configuration(current) : null, after: data,
      }));
      await enqueue(tx, "financial.recalculate_batch", id, { assumptionId: id, cursor: null });
      return published;
    });
  }
  async getGoal(userId: string) {
    const row = await this.db.retirementGoal.findUnique({ where: { userId } });
    return row ? { id: row.id, revision: row.revision, data: goalData(row) } : null;
  }
  saveGoal(userId: string, revision: number, input: Goal) {
    const data = goalDataSchema.parse(input);
    return transaction(this.db, async tx => {
      const profile = await tx.financialProfile.findUnique({ where: { userId } });
      if (!profile) throw new AppError(409, "PROFILE_REQUIRED", "Hãy hoàn tất hồ sơ trước khi tạo mục tiêu.");
      if (data.targetRetirementAge < profileSchema.parse(profile.profileData).personal.age)
        throw new AppError(422, "INVALID_RETIREMENT_AGE", "Tuổi nghỉ hưu không được nhỏ hơn tuổi hiện tại.");
      const previous = await tx.retirementGoal.findUnique({ where: { userId } });
      if ((previous?.revision ?? 0) !== revision) throw conflict();
      const goal = previous
        ? await tx.retirementGoal.update({ where: { userId }, data: { ...data, revision: { increment: 1 } } })
        : await tx.retirementGoal.create({ data: { userId, ...data } });
      await tx.retirementPlan.updateMany({ where: { userId }, data: { stale: true } });
      await audit(tx, userId, "GOAL_UPDATED", "RETIREMENT_GOAL", goal.id, { revision: goal.revision });
      return { id: goal.id, revision: goal.revision, data: goalData(goal) };
    });
  }
  async preview(input: z.infer<typeof publicPreviewSchema>) {
    const checked = publicPreviewSchema.parse(input);
    const resolved = await this.resolved(this.db);
    const rates = resolveAssumptions(resolved.data, checked.currentAge, checked.goal.targetRetirementAge, checked.goal.riskLevel);
    return { ...calculatePlan(checked, rates), kind: "ILLUSTRATIVE_PREVIEW", assumptionVersionId: resolved.row.id,
      assumptionVersion: resolved.row.version, source: resolved.row.source,
      inputAssumptions: ["INITIAL_ASSETS_ARE_NET_OF_DEBT_AND_EXCLUDE_HOME", "NO_PERSONAL_PROFILE_SAVED"] };
  }
  private async calculateInTx(tx: Tx, userId: string, input: Command) {
    const [profile, goal] = await Promise.all([
      tx.financialProfile.findUnique({ where: { userId } }), tx.retirementGoal.findUnique({ where: { userId } }),
    ]);
    if (!profile || !goal) throw new AppError(409, "PLAN_INPUTS_REQUIRED", "Cần hồ sơ và mục tiêu đầy đủ.");
    if (profile.revision !== input.expectedProfileRevision || goal.revision !== input.expectedGoalRevision) throw conflict();
    const data = profileSchema.parse(profile.profileData), desired = goalData(goal);
    const resolved = await this.resolved(tx);
    const summary = financialSummary(data);
    const netLiquid = new Prisma.Decimal(summary.retirementLiquidAssets).minus(summary.totalDebt);
    // Do not silently turn unfunded debt into retirement capital or omit it.
    if (netLiquid.lt(0)) throw new AppError(422, "DEBT_STRATEGY_REQUIRED", "Nợ vượt tài sản thanh khoản. Cần phương án xử lý nợ trước khi dùng mô hình này.");
    const engineInput = { currentAge: data.personal.age, initialInvestableAssets: netLiquid.toFixed(2), goal: desired };
    const rates = resolveAssumptions(resolved.data, data.personal.age, desired.targetRetirementAge, desired.riskLevel);
    const result = calculatePlan(engineInput, rates);
    const resultSummary = { ...result.summary, availableMonthlySurplus: summary.availableMonthlySurplus,
      contributionExceedsSurplus: new Prisma.Decimal(desired.monthlyContribution).gt(summary.availableMonthlySurplus),
      limitations: result.limitations, conventions: modelDefinition.conventions };
    const existing = await tx.retirementPlan.findFirst({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const plan = existing ?? await tx.retirementPlan.create({ data: { userId } });
    const last = await tx.planVersion.findFirst({ where: { planId: plan.id }, orderBy: { version: "desc" } });
    const version = await tx.planVersion.create({ data: {
      planId: plan.id, version: (last?.version ?? 0) + 1, profileRevision: profile.revision, goalRevision: goal.revision,
      modelVersionId: resolved.model.id, assumptionVersionId: resolved.row.id, asOfDate: profile.asOfDate,
      inputSnapshot: json({ engineInput, profile: data, goal: desired, resolvedRates: rates, sources: resolved.row.source }),
      result: json(resultSummary), chartSeries: json(result.chartSeries) as unknown as Prisma.InputJsonArray,
    } });
    await tx.retirementPlan.update({ where: { id: plan.id }, data: { currentVersionId: version.id, stale: false } });
    await audit(tx, userId, "PLAN_CALCULATED", "RETIREMENT_PLAN", plan.id, { versionId: version.id });
    return { planId: plan.id, versionId: version.id, version: version.version };
  }
  calculate(userId: string, input: Command, key: string) {
    return transaction(this.db, async tx => {
      const scope = "plan.calculate", requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const previous = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã dùng cho yêu cầu khác.");
        return previous.response;
      }
      const response = await this.calculateInTx(tx, userId, input);
      await tx.idempotencyRecord.create({ data: { userId, scope, key, requestHash, response } });
      return response;
    });
  }
  async currentPlan(userId: string) {
    const plan = await this.db.retirementPlan.findFirst({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { currentVersion: true } });
    if (!plan?.currentVersion) return null;
    const [active, profile, goal] = await Promise.all([this.active(this.db),
      this.db.financialProfile.findUnique({ where: { userId } }), this.db.retirementGoal.findUnique({ where: { userId } })]);
    return { planId: plan.id, stale: plan.stale || plan.currentVersion.assumptionVersionId !== active?.id ||
      plan.currentVersion.profileRevision !== profile?.revision || plan.currentVersion.goalRevision !== goal?.revision,
      current: plan.currentVersion };
  }
  async versions(userId: string, planId: string, page: number, limit: number) {
    const plan = await this.db.retirementPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new AppError(404, "NOT_FOUND", "Không tìm thấy kế hoạch.");
    return this.db.planVersion.findMany({ where: { planId }, orderBy: { version: "desc" }, skip: (page - 1) * limit, take: limit });
  }
  async handleEvent(event: OutboxEvent) {
    return handlePlanUpdateEvent(this.db, event);
  }
}
