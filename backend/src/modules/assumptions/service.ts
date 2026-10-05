import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type AssumptionSetVersion } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";
import { ASSUMPTION_SERIES_CODE, assumptionDocumentSchema, revisionSchema, approveAssumptionsSchema, publishAssumptionsSchema,
  writeAssumptionsSchema, assumptionsListSchema, seriesRequestSchema, type AssumptionDocument, type SeriesRequest } from "./schema";
import { validateConfiguration, resolveYearSeries } from "./series";

const conflict = () => new AppError(409, "REVISION_CONFLICT", "Bản giả định đã thay đổi. Hãy tải lại và xem tác động trước khi duyệt.");
const workflowSchema = z.object({
  preview: z.object({ actor: z.string(), revision: z.number().int(), token: z.string(), baselineId: z.string().nullable() }).nullable(),
  approval: z.object({ actor: z.string(), approvedAt: z.string(), reviewNote: z.string(), documentHash: z.string(), baselineId: z.string().nullable() }).nullable(),
}).strict();
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
function dataOf(row: AssumptionSetVersion) {
  const parsed = assumptionDocumentSchema.safeParse(row.values);
  if (!parsed.success) throw new AppError(409, "ASSUMPTIONS_DATA_REVIEW_REQUIRED", "Bộ giả định đã lưu cần rà soát.");
  return parsed.data;
}
function workflowOf(row: AssumptionSetVersion) {
  const parsed = workflowSchema.safeParse(row.policy);
  if (!parsed.success) throw new AppError(409, "ASSUMPTIONS_DATA_REVIEW_REQUIRED", "Thiếu thông tin phê duyệt bộ giả định.");
  return parsed.data;
}
function view(row: AssumptionSetVersion) {
  const workflow = workflowOf(row);
  return { id: row.id, version: row.version, revision: row.revision, status: row.status, data: dataOf(row),
    createdBy: row.createdBy, createdAt: row.createdAt.toISOString(), publishedBy: row.publishedBy,
    effectiveAt: row.effectiveAt?.toISOString() ?? null, approval: workflow.approval, documentHash: hash(dataOf(row)) };
}
type Tx = Prisma.TransactionClient;
export class AssumptionsService {
  constructor(private db: PrismaClient, private now: () => Date = () => new Date()) {}
  private async row(tx: Tx, id: string) {
    const row = await tx.assumptionSetVersion.findUnique({ where: { id } });
    if (!row || row.modelCode !== ASSUMPTION_SERIES_CODE) throw new AppError(404, "NOT_FOUND", "Không tìm thấy bộ giả định theo năm.");
    return row;
  }
  private latestPublished(tx: Tx) {
    return tx.assumptionSetVersion.findFirst({ where: { modelCode: ASSUMPTION_SERIES_CODE, status: "PUBLISHED" }, orderBy: { version: "desc" } });
  }
  async list(query: z.infer<typeof assumptionsListSchema>, publishedOnly = false) {
    const input = assumptionsListSchema.parse(query);
    const where = { modelCode: ASSUMPTION_SERIES_CODE, ...(publishedOnly ? { status: "PUBLISHED", effectiveAt: { lte: this.now() } } : {}) };
    const rows = await this.db.assumptionSetVersion.findMany({
      where,
      orderBy: { version: "desc" }, skip: (input.page - 1) * input.limit, take: input.limit,
    });
    const total = await this.db.assumptionSetVersion.count({ where });
    return { status: total ? "AVAILABLE" : "UNCONFIGURED", total, items: rows.map(row => ({ id: row.id, version: row.version, revision: row.revision,
      status: row.status, title: dataOf(row).title, effectiveAt: row.effectiveAt?.toISOString() ?? null,
      projectionStartYear: dataOf(row).projectionStartYear, projectionEndYear: dataOf(row).projectionEndYear })), page: input.page, limit: input.limit };
  }
  async get(id: string, publishedOnly = false) {
    const row = await this.row(this.db, id);
    if (publishedOnly && (row.status !== "PUBLISHED" || !row.effectiveAt || row.effectiveAt > this.now()))
      throw new AppError(404, "NOT_FOUND", "Bộ giả định chưa được công bố hoặc chưa có hiệu lực.");
    if (row.status === "PUBLISHED" && workflowOf(row).approval?.documentHash !== hash(dataOf(row)))
      throw new AppError(409, "ASSUMPTIONS_DATA_REVIEW_REQUIRED", "Nội dung không khớp bản đã được phê duyệt.");
    return view(row);
  }
  create(actor: string, input: AssumptionDocument) {
    const data = assumptionDocumentSchema.parse(input);
    return transaction(this.db, async tx => {
      const last = await tx.assumptionSetVersion.findFirst({ orderBy: { version: "desc" } });
      // Global unique version is shared with legacy sets, never overwrite them.
      let row: AssumptionSetVersion;
      try {
        row = await tx.assumptionSetVersion.create({ data: { version: (last?.version ?? 0) + 1, modelCode: ASSUMPTION_SERIES_CODE,
          values: json(data), source: json(data.sources), policy: { preview: null, approval: null }, reason: data.reason, createdBy: actor } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict();
        throw error;
      }
      await audit(tx, actor, "ASSUMPTIONS_DRAFT_CREATED", "ASSUMPTION_SERIES", row.id, { version: row.version });
      return view(row);
    });
  }
  patch(actor: string, id: string, command: z.infer<typeof writeAssumptionsSchema>) {
    const input = writeAssumptionsSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id);
      if (row.status !== "DRAFT" || row.revision !== input.expectedRevision) throw conflict();
      const changed = await tx.assumptionSetVersion.updateMany({ where: { id, status: "DRAFT", revision: input.expectedRevision }, data: {
        values: json(input.data), source: json(input.data.sources), reason: input.data.reason, policy: { preview: null, approval: null }, revision: { increment: 1 },
      } });
      if (changed.count !== 1) throw conflict();
      await audit(tx, actor, "ASSUMPTIONS_DRAFT_UPDATED", "ASSUMPTION_SERIES", id, { revision: input.expectedRevision + 1 });
      return view(await this.row(tx, id));
    });
  }
  async validate(id: string) { return validateConfiguration(dataOf(await this.row(this.db, id))); }
  previewImpact(actor: string, id: string, command: z.infer<typeof revisionSchema>) {
    const input = revisionSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id);
      if (row.status !== "DRAFT" || row.revision !== input.expectedRevision) throw conflict();
      const data = dataOf(row), validation = validateConfiguration(data);
      const baseline = await this.latestPublished(tx);
      const before = baseline ? dataOf(baseline) : null;
      const changes = { before, after: data };
      const token = hash({ id, revision: row.revision, actor, baselineId: baseline?.id ?? null, changes });
      await tx.assumptionSetVersion.update({ where: { id }, data: { policy: json({
        preview: { actor, revision: row.revision, token, baselineId: baseline?.id ?? null }, approval: null,
      }) } });
      await audit(tx, actor, "ASSUMPTIONS_IMPACT_REVIEWED", "ASSUMPTION_SERIES", id, { revision: row.revision, baselineId: baseline?.id ?? null });
      return { ...validation, draftRevision: row.revision, impactToken: token, baselineId: baseline?.id ?? null,
        scope: "CONFIGURATION_DIFF_ONLY", planProjectionStatus: "AWAITING_T06", currentPlansChanged: 0, changes };
    });
  }
  approve(actor: string, id: string, command: z.infer<typeof approveAssumptionsSchema>) {
    const input = approveAssumptionsSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id), data = dataOf(row), workflow = workflowOf(row);
      if (row.status !== "DRAFT" || row.revision !== input.expectedRevision) throw conflict();
      const validation = validateConfiguration(data);
      if (validation.status !== "VALID") throw new AppError(422, "ASSUMPTIONS_INCOMPLETE", "Bộ giả định thiếu kỳ, nguồn hoặc quy ước hợp lệ. Hãy kiểm tra cấu hình.");
      if (data.sources.some(source => source.retrievedOn > this.now().toISOString().slice(0, 10)))
        throw new AppError(422, "SOURCE_DATE_IN_FUTURE", "Ngày lấy nguồn không được ở tương lai.");
      const baseline = await this.latestPublished(tx);
      const preview = workflow.preview;
      if (!preview || preview.actor !== actor || preview.revision !== row.revision || preview.token !== input.impactToken || preview.baselineId !== (baseline?.id ?? null))
        throw new AppError(409, "IMPACT_REVIEW_REQUIRED", "Hãy xem lại tác động của đúng bản nháp trước khi duyệt.");
      const approval = { actor, approvedAt: this.now().toISOString(), reviewNote: input.reviewNote, documentHash: hash(data), baselineId: preview.baselineId };
      await tx.assumptionSetVersion.update({ where: { id }, data: { status: "APPROVED", revision: { increment: 1 }, policy: json({ preview: null, approval }) } });
      await audit(tx, actor, "ASSUMPTIONS_APPROVED", "ASSUMPTION_SERIES", id, { revision: row.revision + 1, documentHash: approval.documentHash });
      return view(await this.row(tx, id));
    });
  }
  publish(actor: string, id: string, command: z.infer<typeof publishAssumptionsSchema>) {
    const input = publishAssumptionsSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id), data = dataOf(row), workflow = workflowOf(row);
      if (row.status !== "APPROVED" || row.revision !== input.expectedRevision) throw conflict();
      if (!workflow.approval || workflow.approval.documentHash !== hash(data) || validateConfiguration(data).status !== "VALID")
        throw new AppError(409, "APPROVAL_REQUIRED", "Cần bản phê duyệt đúng nội dung trước khi công bố.");
      const latest = await this.latestPublished(tx);
      if ((latest?.id ?? null) !== workflow.approval.baselineId) throw new AppError(409, "IMPACT_BASELINE_CHANGED", "Đã có bộ mới được công bố. Hãy tạo bản nháp mới và xem lại tác động.");
      if (latest && row.version <= latest.version) throw new AppError(409, "OLDER_VERSION", "Hãy tạo bản nháp mới hơn phiên bản đã công bố.");
      await tx.assumptionSetVersion.update({ where: { id }, data: { status: "PUBLISHED", revision: { increment: 1 },
        publishedBy: actor, effectiveAt: new Date(data.effectiveFrom + "T00:00:00.000Z") } });
      await audit(tx, actor, "ASSUMPTIONS_PUBLISHED", "ASSUMPTION_SERIES", id, { revision: row.revision + 1, documentHash: hash(data) });
      // Publishing adds a selectable immutable version. No plan update or job.
      return view(await this.row(tx, id));
    });
  }
  async resolve(command: SeriesRequest) {
    const input = seriesRequestSchema.parse(command), version = await this.get(input.versionId, true);
    return { versionId: version.id, version: version.version, documentHash: version.documentHash,
      currency: "VND", priceBasis: "NOMINAL", costs: "ALREADY_APPLIED", sources: version.data.sources,
      ...resolveYearSeries(version.data, input) };
  }
}
