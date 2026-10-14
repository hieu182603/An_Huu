import { Prisma, type PrismaClient, type PlanVersion, type RetirementPlan } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { RetirementService, type RetirementResult } from "../retirement/service";
import { digest } from "../../common/digest";
import { actualSourceChanged, assertActualSource } from "../actuals/lineage";
import { saveReforecastSchema } from "../actuals/schema";
import { projectRetirement } from "../retirement/engine";
import { RETIREMENT_MODEL } from "../retirement/schema";
import { profileV2Schema } from "../profiles/schema-v2";
import { ASSUMPTION_SERIES_CODE } from "../assumptions/schema";
import { PORTFOLIO_POLICY_CODE } from "../portfolios/schema";
import { createPlanVersionSchema, applyPlanVersionSchema, planListSchema, planKeySchema, planReportQuerySchema, planCompareSchema, planSimulationSchema, SNAPSHOT_FORMAT } from "./schema";
import { comparePreviews, versionCsv, versionReadableCsv, hasFutureAssumptions } from "./presentation";
import { SOURCE_MODEL, SOURCE_SNAPSHOT_FORMAT } from "../retirement/engine-v4";
import { replayProjection } from "../retirement/replay";
import type { PlanPreview } from "../retirement/upgrade";
import { readSourceSnapshot, serializeSourceSnapshot, type SourceSnapshot } from "./source-snapshot";
import { sourceReforecastSchema, saveSourceReforecastSchema } from "./source-schema";
import { PensionEstimateService } from "../pensions/estimate-service";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
// PostgreSQL JSONB reorders object keys; integrity must not depend on that order.
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Kế hoạch hoặc hồ sơ đã thay đổi. Hãy tải lại trước khi tiếp tục.");
const missing = () => new AppError(404, "NOT_FOUND", "Không tìm thấy kế hoạch hoặc phiên bản.");
const planView = (p: RetirementPlan) => ({ id: p.id, userId: p.userId, revision: p.revision, currentVersionId: p.currentVersionId,
  baselineVersionId: p.baselineVersionId, stale: p.stale, createdAt: p.createdAt.toISOString() });
type Capture = Awaited<ReturnType<RetirementService["capture"]>>;
type Preview = PlanPreview;
type Snapshot = { format: typeof SNAPSHOT_FORMAT; capture: Capture; preview: Preview; integrityHash: string };
type VersionSummaryRow = { id: string; version: number; createdAt: Date; profileRevision: number; snapshotHash: string;
  references: Preview["references"]; summary: NonNullable<Preview["calculation"]>["summary"] };
const modelRelease = { code: RETIREMENT_MODEL, snapshotFormat: SNAPSHOT_FORMAT, arithmeticPrecision: 48,
  contributionTiming: ["END_OF_MONTH", "START_OF_MONTH"], surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
  withdrawalTiming: "END_OF_MONTH", businessParameters: "SEPARATELY_APPROVED_T03_T04" };
const sourceModelRelease = { ...modelRelease, code: SOURCE_MODEL, snapshotFormat: SOURCE_SNAPSHOT_FORMAT, sources: "PINNED_REGISTRY_V1", numericalKernel: RETIREMENT_MODEL };

export class PlansService {
  constructor(private db: PrismaClient) {}
  private async owned(tx: Prisma.TransactionClient, userId: string, id: string) {
    const plan = await tx.retirementPlan.findFirst({ where: { id, userId } });
    if (!plan) throw missing();
    return plan;
  }
  private snapshot(row: PlanVersion) {
    const stored = row.inputSnapshot as unknown as Snapshot | SourceSnapshot;
    if (stored?.format === SOURCE_SNAPSHOT_FORMAT) readSourceSnapshot(stored);
    else if (stored?.format !== SNAPSHOT_FORMAT || ![RETIREMENT_MODEL, "retirement-monthly-v2"].includes(stored.preview?.modelVersion))
      throw new AppError(409, "SNAPSHOT_MODEL_UNSUPPORTED", "Phiên bản dùng mô hình chưa được bộ đọc này hỗ trợ.");
    if ((stored.preview.replayInput?.modelVersion ?? "retirement-monthly-v2") !== stored.preview.modelVersion)
      throw new AppError(409, "SNAPSHOT_INTEGRITY_FAILED", "Mô hình tính lại không khớp phiên bản.");
    const { integrityHash, ...payload } = stored;
    if (digest(payload) !== integrityHash || stored.preview.status !== "READY" || !stored.preview.calculation || !stored.preview.replayInput ||
      digest(row.result) !== digest(stored.preview.calculation) || digest(row.chartSeries) !== digest(stored.preview.calculation.rows) ||
      row.profileRevision !== stored.preview.profileRevision || row.assumptionVersionId !== stored.preview.references.assumptionVersionId ||
      row.asOfDate.toISOString().slice(0, 10) !== stored.preview.valuationDate)
      throw new AppError(409, "SNAPSHOT_INTEGRITY_FAILED", "Dữ liệu phiên bản không còn khớp bản đã lưu.");
    return stored;
  }
  private view(row: PlanVersion) {
    const snapshot = this.snapshot(row);
    return { id: row.id, planId: row.planId, version: row.version, createdAt: row.createdAt.toISOString(),
      profileRevision: row.profileRevision, snapshotHash: snapshot.integrityHash, preview: snapshot.preview };
  }
  // Both commands persist the response in the same transaction as their writes.
  // Unique-key races retry so an identical concurrent request receives the first
  // committed response instead of creating another plan/version/application.
  private async command<T>(userId: string, scope: string, key: string, input: unknown, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    planKeySchema.parse(key); const requestHash = digest(input);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await transaction(this.db, async tx => {
          const previous = await tx.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
          if (previous) {
            if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa đã được dùng cho yêu cầu khác.");
            return previous.response as T;
          }
          const result = await work(tx);
          await tx.idempotencyRecord.create({ data: { userId, scope, key, requestHash, response: json(result) } });
          return result;
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        if (attempt === 2) throw conflict();
      }
    }
    throw conflict();
  }
  async createVersion(userId: string, planId: string | null, command: z.infer<typeof createPlanVersionSchema>, key: string) {
    const input = createPlanVersionSchema.parse(command);
    return this.command(userId, "retirement.version.create", key, { planId, ...input }, async tx => {
      const previous = planId ? await this.owned(tx, userId, planId) : null;
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw conflict();
      const retirement = new RetirementService(this.db), capture = await retirement.capture(tx, userId, input.preview);
      const preview = retirement.evaluate(capture, input.preview);
      if (preview.inputHash !== input.expectedInputHash) throw new AppError(409, "PREVIEW_CHANGED", "Dữ liệu khác lần xem trước. Hãy xem lại kết quả trước khi lưu.");
      if (preview.status !== "READY") throw new AppError(422, "PLAN_INPUTS_INCOMPLETE", "Cần bổ sung dữ liệu trước khi lưu phiên bản.");
      return this.persist(tx, userId, previous, capture, preview, input.expectedRevision);
    });
  }
  private async persist(tx: Prisma.TransactionClient, userId: string, previous: RetirementPlan | null, capture: Capture, preview: Preview, expectedRevision: number) {
      const release = preview.modelVersion === SOURCE_MODEL ? sourceModelRelease : modelRelease;
      let model = await tx.financialModelVersion.findUnique({ where: { code: release.code } });
      if (!model) model = await tx.financialModelVersion.create({ data: { code: release.code, status: "IMPLEMENTED",
        description: "Verified monthly retirement engine; business parameters require separate approval", source: json(release) } });
      if (digest(model.source) !== digest(release)) throw new AppError(409, "MODEL_RELEASE_MISMATCH", "Bản đăng ký mô hình cần được rà soát.");
      const plan = previous ?? await tx.retirementPlan.create({ data: { userId } });
      const last = await tx.planVersion.findFirst({ where: { planId: plan.id }, orderBy: { version: "desc" } });
      const payload = { format: SNAPSHOT_FORMAT, capture, preview } as const;
      const snapshot = preview.modelVersion === SOURCE_MODEL ? serializeSourceSnapshot(capture, preview) : { ...payload, integrityHash: digest(payload) };
      const version = await tx.planVersion.create({ data: { planId: plan.id, version: (last?.version ?? 0) + 1,
        profileRevision: preview.profileRevision, goalRevision: 0, modelVersionId: model.id, assumptionVersionId: preview.references.assumptionVersionId,
        inputSnapshot: json(snapshot), result: json(preview.calculation), chartSeries: json(preview.calculation!.rows),
        asOfDate: new Date(preview.valuationDate + "T00:00:00.000Z") } });
      const changed = await tx.retirementPlan.updateMany({ where: { id: plan.id, userId, revision: expectedRevision }, data: { revision: { increment: 1 } } });
      if (changed.count !== 1) throw conflict();
      await audit(tx, userId, "PLAN_VERSION_CREATED", "RETIREMENT_PLAN", plan.id, { versionId: version.id, snapshotHash: snapshot.integrityHash });
      return { planId: plan.id, revision: expectedRevision + 1, currentVersionId: plan.currentVersionId,
        baselineVersionId: plan.baselineVersionId, saved: this.view(version) };
  }
  async saveReforecast(userId: string, planId: string, command: z.infer<typeof saveReforecastSchema>, key: string) {
    const input = saveReforecastSchema.parse(command);
    if (input.preview.planId !== planId) throw new AppError(400, "PLAN_REFERENCE_MISMATCH", "Kế hoạch nguồn không khớp.");
    return this.command(userId, "retirement.reforecast.save", key, { planId, ...input }, async tx => {
      const plan = await this.owned(tx, userId, planId);
      if (plan.revision !== input.expectedRevision) throw conflict();
      const { ActualsService } = await import("../actuals/service");
      const result = await new ActualsService(this.db).previewUpdate(userId, input.preview, tx);
      if (result.inputHash !== input.expectedInputHash) throw new AppError(409, "PREVIEW_CHANGED", "Số thực tế hoặc đầu vào đã thay đổi. Hãy xem lại dự báo.");
      if (!result.candidate) throw new AppError(422, "REFORECAST_NOT_READY", "Chưa đủ tháng đã đối soát hoặc đã hết kỳ dự báo.");
      const source = await this.readVersion(tx, userId, planId, input.preview.versionId);
      return this.persist(tx, userId, plan, source.capture, result.candidate, input.expectedRevision);
    });
  }
  async apply(userId: string, planId: string, command: z.infer<typeof applyPlanVersionSchema>, key: string) {
    const input = applyPlanVersionSchema.parse(command);
    return this.command(userId, "retirement.version.apply", key, { planId, ...input }, async tx => {
      const plan = await this.owned(tx, userId, planId);
      if (plan.revision !== input.expectedRevision) throw conflict();
      const row = await tx.planVersion.findFirst({ where: { id: input.versionId, planId } });
      if (!row) throw missing();
      const snapshot = this.snapshot(row);
      await assertActualSource(tx, userId, snapshot.preview.reforecast);
      if (snapshot.preview.modelVersion === SOURCE_MODEL) {
        const active = new Set(snapshot.preview.calculation.attribution.map(c => c.sourceHash));
        for (const source of snapshot.preview.pensionSources ?? []) if (active.has(source.sourceHash))
          await new PensionEstimateService(this.db).captureForSource(userId, source.evidence.estimateId, source.evidence.estimateIntegrityHash, tx);
      }
      const profile = await tx.financialProfile.findUnique({ where: { userId } });
      if (!profile || profile.revision !== input.expectedProfileRevision || profile.revision !== row.profileRevision ||
        digest(profileV2Schema.parse(profile.profileData)) !== digest(snapshot.capture.profile))
        throw new AppError(409, "PROFILE_CHANGED_RECREATE_VERSION", "Hồ sơ khác phiên bản đã lưu. Hãy xem trước và tạo phiên bản mới.");
      const alreadyCurrent = plan.currentVersionId === row.id;
      if (!alreadyCurrent) {
        const changed = await tx.retirementPlan.updateMany({ where: { id: plan.id, userId, revision: input.expectedRevision }, data: {
          currentVersionId: row.id, baselineVersionId: plan.baselineVersionId ?? plan.currentVersionId ?? row.id, stale: false, revision: { increment: 1 },
        } });
        if (changed.count !== 1) throw conflict();
        await audit(tx, userId, "PLAN_VERSION_APPLIED", "RETIREMENT_PLAN", plan.id,
          { beforeVersionId: plan.currentVersionId, versionId: row.id, snapshotHash: snapshot.integrityHash });
      }
      return { planId, revision: plan.revision + (alreadyCurrent ? 0 : 1), currentVersionId: row.id,
        baselineVersionId: plan.baselineVersionId ?? plan.currentVersionId ?? row.id, alreadyCurrent };
    });
  }
  async list(userId: string, query: z.infer<typeof planListSchema>) {
    const q = planListSchema.parse(query);
    return { ...q, total: await this.db.retirementPlan.count({ where: { userId } }), items: (await this.db.retirementPlan.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit })).map(planView) };
  }
  // Read-only views below run outside SERIALIZABLE transactions: plan versions
  // are immutable and every snapshot is integrity-checked on read, so the only
  // cross-row skew possible is a hint (profileChanged/updates) one request stale.
  // Independent reads are issued in parallel on separate pool connections.
  async get(userId: string, planId: string) {
    const db = this.db;
    const latest = (modelCode: string) => db.assumptionSetVersion.findFirst({ where: { modelCode, status: "PUBLISHED", effectiveAt: { lte: new Date() } },
      orderBy: { version: "desc" }, select: { id: true, version: true } });
    const [plan, profile, assumptions, policy] = await Promise.all([this.owned(db, userId, planId),
      db.financialProfile.findUnique({ where: { userId }, select: { revision: true } }), latest(ASSUMPTION_SERIES_CODE), latest(PORTFOLIO_POLICY_CODE)]);
    const row = plan.currentVersionId ? await db.planVersion.findFirst({ where: { id: plan.currentVersionId, planId } }) : null;
    const current = row ? this.view(row) : null;
    const refs = current?.preview.references;
    return { ...planView(plan), current, profileChanged: !!row && profile?.revision !== row.profileRevision,
      actualSourceChanged: await actualSourceChanged(db, userId, current?.preview.reforecast),
      updates: { assumptions: refs && assumptions && assumptions.version > refs.assumptionVersion ? { id: assumptions.id, version: assumptions.version } : null,
        policy: refs && policy && policy.version > refs.policyVersion ? { id: policy.id, version: policy.version } : null },
      updatePolicy: "USER_EXPLICIT_CREATE_AND_APPLY" };
  }
  // The list only needs each version's summary, so it reads three JSON paths in
  // SQL instead of the multi-MB snapshot/result/chart columns. Full snapshot
  // integrity is still verified by detail/replay/export/compare/apply reads.
  async versions(userId: string, planId: string, query: z.infer<typeof planListSchema>) {
    const q = planListSchema.parse(query);
    const [, total, rows] = await Promise.all([this.owned(this.db, userId, planId), this.db.planVersion.count({ where: { planId } }),
      this.db.$queryRaw<VersionSummaryRow[]>`SELECT id, version, "createdAt", "profileRevision",
        "inputSnapshot"->>'integrityHash' AS "snapshotHash", "inputSnapshot"->'preview'->'references' AS "references", "result"->'summary' AS "summary"
        FROM plan_versions WHERE "planId" = ${planId} ORDER BY version DESC OFFSET ${(q.page - 1) * q.limit} LIMIT ${q.limit}`]);
    return { ...q, total, items: rows.map(row => ({ id: row.id, version: row.version, createdAt: row.createdAt.toISOString(),
      profileRevision: row.profileRevision, snapshotHash: row.snapshotHash, references: row.references, summary: row.summary })) };
  }
  private async ownedVersion(userId: string, planId: string, versionId: string) {
    const [plan, row] = await Promise.all([this.owned(this.db, userId, planId), this.db.planVersion.findFirst({ where: { id: versionId, planId } })]);
    if (!row) throw missing();
    return { plan, row };
  }
  async version(userId: string, planId: string, versionId: string, replay = false) {
    const v = this.view((await this.ownedVersion(userId, planId, versionId)).row);
    if (!replay) return v;
    // Dispatch by immutable model code. Future model changes need a new code
    // and must preserve this implementation for old snapshots.
    const result = replayProjection(v.preview.modelVersion === SOURCE_MODEL ? SOURCE_SNAPSHOT_FORMAT : SNAPSHOT_FORMAT, v.preview.modelVersion, v.preview.replayInput!);
    if (digest(result.rows) !== digest(v.preview.calculation!.rows) || digest(result.summary) !== digest(v.preview.calculation!.summary))
      throw new AppError(409, "SNAPSHOT_REPLAY_MISMATCH", "Bộ tính không tái lập được phiên bản đã lưu.");
    return { ...v, replay: { matched: true, modelVersion: result.modelVersion, summary: result.summary, rows: result.rows } };
  }
  async readVersion(tx: Prisma.TransactionClient, userId: string, planId: string, versionId: string) {
    const plan = await this.owned(tx, userId, planId);
    const row = await tx.planVersion.findFirst({ where: { id: versionId, planId } });
    if (!row) throw missing();
    return { plan: planView(plan), version: this.view(row), capture: this.snapshot(row).capture };
  }
  async report(userId: string, planId: string, query: z.infer<typeof planReportQuerySchema>) {
    const input = planReportQuerySchema.parse(query);
    const [plan, profile] = await Promise.all([this.owned(this.db, userId, planId), this.db.financialProfile.findUnique({ where: { userId }, select: { revision: true } })]);
    const selected = input.versionId ?? plan.currentVersionId;
    const row = selected ? await this.db.planVersion.findFirst({ where: { id: selected, planId } }) : null;
    if (selected && !row) throw missing();
    const version = row ? this.view(row) : null;
    return { planId, planRevision: plan.revision, currentVersionId: plan.currentVersionId, baselineVersionId: plan.baselineVersionId,
      status: version ? "AVAILABLE" : "NO_APPLIED_VERSION", valueKind: version?.preview.reforecast ? "REFORECAST" : "FORECAST", version,
      actualSourceChanged: await actualSourceChanged(this.db, userId, version?.preview.reforecast),
      profileChanged: !!row && row.profileRevision !== profile?.revision,
      hypothetical: version ? hasFutureAssumptions(version.preview) : false,
      goal: version ? { retirementMonth: version.preview.reforecast?.originalRetirementMonth ?? version.preview.calculation!.summary.retirementMonth,
        endMonth: version.preview.selection.endMonth, monthlyExpenseToday: version.preview.selection.monthlyExpenseToday,
        monthlyContribution: version.preview.selection.monthlyContribution, monthlyReserve: version.preview.selection.monthlyReserve,
        terminalBalance: version.preview.selection.terminalBalance } : null };
  }
  async compare(userId: string, planId: string, command: z.infer<typeof planCompareSchema>) {
    const input = planCompareSchema.parse(command);
    const [, baselineRow, candidateRow] = await Promise.all([this.owned(this.db, userId, planId),
      this.db.planVersion.findFirst({ where: { id: input.baselineVersionId, planId } }), this.db.planVersion.findFirst({ where: { id: input.candidateVersionId, planId } })]);
    if (!baselineRow || !candidateRow) throw missing();
    const baseline = this.view(baselineRow), candidate = this.view(candidateRow);
    return { baseline, candidate, comparison: comparePreviews(baseline.preview, candidate.preview) };
  }
  // What-if only: nothing is written, so no transaction. Capture starts in
  // parallel but its errors surface only after ownership/version checks.
  async simulate(userId: string, planId: string, baselineVersionId: string, command: z.infer<typeof planSimulationSchema>) {
    const input = planSimulationSchema.parse(command);
    const retirement = new RetirementService(this.db);
    const capturing = retirement.capture(this.db, userId, input.preview).then(value => ({ value }), (error: unknown) => ({ error }));
    const baseline = this.view((await this.ownedVersion(userId, planId, baselineVersionId)).row);
    if (baseline.preview.reforecast) throw new AppError(422, "REFORECAST_USE_ACTUAL_UPDATE", "Dùng xem trước cập nhật từ thực tế với phiên bản nguồn và mốc đối soát để giữ số dư thực tế.");
    const captured = await capturing;
    if ("error" in captured) throw captured.error;
    const candidate = retirement.evaluate(captured.value, input.preview);
    return { baseline, candidate, comparison: comparePreviews(baseline.preview, candidate),
      saved: false, applied: false };
  }
  async exportCsv(userId: string, planId: string, versionId: string, format: "technical" | "readable-vi" = "technical") {
    const version = await this.version(userId, planId, versionId);
    return { filename: `an-huu-${planId}-v${version.version}-${versionId}${format === "readable-vi" ? "-tieng-viet" : ""}.csv`,
      content: format === "readable-vi" ? versionReadableCsv(version) : versionCsv(version) };
  }
  async previewSources(userId: string, planId: string, command: z.infer<typeof sourceReforecastSchema>, client?: Prisma.TransactionClient) {
    const input = sourceReforecastSchema.parse(command);
    const { previewSourceReforecast } = await import("./source-reforecast");
    const read = (tx: Prisma.TransactionClient) => previewSourceReforecast(this.db, tx, userId, planId, input);
    return client ? read(client) : transaction(this.db, read);
  }
  async saveSources(userId: string, planId: string, command: z.infer<typeof saveSourceReforecastSchema>, key: string) {
    const input = saveSourceReforecastSchema.parse(command);
    return this.command(userId, "retirement.sources.save", key, { planId, ...input }, async tx => {
      const preview = await this.previewSources(userId, planId, input.preview, tx);
      if (!preview.candidate || !preview.inputHash) throw new AppError(422, "REFORECAST_NOT_READY", "Cần đối soát đủ tháng trước khi lưu nguồn.");
      if (preview.inputHash !== input.expectedInputHash) throw new AppError(409, "PREVIEW_CHANGED", "Nguồn hoặc số thực tế đã đổi. Hãy xem trước lại.");
      const source = await this.readVersion(tx, userId, planId, input.preview.versionId);
      const plan = await this.owned(tx, userId, planId);
      return this.persist(tx, userId, plan, source.capture, preview.candidate, input.preview.expectedRevision);
    });
  }
}
