import { Prisma, type PrismaClient, type PensionEstimate } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { audit } from "../../common/audit";
import { dateSchema } from "../../common/calendar";
import { idempotentCommand } from "../../common/idempotent-command";
import { InsuranceHistoryService } from "./history-service";
import { assessBenefit, benefitEngineSchema, benefitBranch } from "./benefit-engine";
import { insuranceHash, insuranceHistorySchema, legalRuleDraftSchema, pensionEstimateInputSchema, pensionEstimateSaveSchema } from "./insurance-schema";
import { validateLegalDocument } from "./legal-validation";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
const day = (d: Date) => d.toISOString().slice(0, 10);
const today = () => day(new Date(Date.now() + 7 * 3600000));
export const estimateCaptureSchema = z.object({ formatVersion: z.literal(1), engineCode: benefitEngineSchema, assessedOn: dateSchema,
  input: pensionEstimateInputSchema, history: z.object({ id: z.string().uuid(), revision: z.number().int().positive(), documentHash: insuranceHash, document: insuranceHistorySchema }).strict(),
  rule: z.object({ id: z.string().uuid(), version: z.number().int().positive(), documentHash: insuranceHash, knowledgeAsOf: z.string().datetime(),
    publishedAt: z.string().datetime(), validationHash: insuranceHash, reviewHash: insuranceHash, draft: legalRuleDraftSchema }).strict(),
}).strict();
export function replayPensionCapture(value: unknown) {
  const c = estimateCaptureSchema.parse(value);
  if (c.history.id !== c.input.historyVersionId || c.history.revision !== c.input.expectedHistoryRevision || c.rule.id !== c.input.legalRuleSetVersionId ||
    digest(c.history.document) !== c.history.documentHash || digest(c.rule.draft.document) !== c.rule.documentHash ||
    c.rule.draft.document.engineCode !== c.engineCode || c.input.intendedBenefitDate < c.rule.draft.effectiveFrom ||
    (c.rule.draft.effectiveTo && c.input.intendedBenefitDate >= c.rule.draft.effectiveTo)) throw integrityError();
  return { inputHash: digest(c), engineCode: c.engineCode, assessedOn: c.assessedOn, historyVersionId: c.history.id,
    historyRevision: c.history.revision, legalRuleSetVersionId: c.rule.id, legalRuleVersion: c.rule.version,
    assessment: assessBenefit(c.history.document, c.input, c.rule.draft.document, c.assessedOn) };
}
const integrityError = () => new AppError(409, "ESTIMATE_INTEGRITY_FAILED", "Kết quả BHXH không khớp dữ liệu đã lưu.");
function view(row: PensionEstimate) {
  const payload = { userId: row.userId, historyVersionId: row.historyVersionId, legalRuleSetVersionId: row.legalRuleSetVersionId,
    engineCode: row.engineCode, inputHash: row.inputHash, inputSnapshot: row.inputSnapshot, result: row.result };
  if (digest(payload) !== row.integrityHash) throw integrityError();
  let result: ReturnType<typeof replayPensionCapture>;
  try { result = replayPensionCapture(row.inputSnapshot); } catch { throw integrityError(); }
  if (digest(result) !== digest(row.result) || result.inputHash !== row.inputHash || result.engineCode !== row.engineCode ||
    result.historyVersionId !== row.historyVersionId || result.legalRuleSetVersionId !== row.legalRuleSetVersionId) throw integrityError();
  return { id: row.id, createdAt: row.createdAt.toISOString(), integrityHash: row.integrityHash, ...result };
}
export class PensionEstimateService {
  private histories: InsuranceHistoryService;
  constructor(private db: PrismaClient) { this.histories = new InsuranceHistoryService(db); }
  async publishedRules(benefitDate: string) {
    dateSchema.parse(benefitDate);
    const rows = await this.db.legalRuleSetVersion.findMany({ where: { status: "PUBLISHED", effectiveFrom: { lte: new Date(benefitDate + "T00:00:00Z") },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date(benefitDate + "T00:00:00Z") } }] }, orderBy: { version: "desc" } });
    const seen = new Set<string>();
    return { items: rows.flatMap(row => {
      const draft = legalRuleDraftSchema.parse({ code: row.code, effectiveFrom: day(row.effectiveFrom), effectiveTo: row.effectiveTo ? day(row.effectiveTo) : null, supersedesId: row.supersedesId, document: row.document });
      if (digest(draft.document) !== row.documentHash) throw integrityError();
      const branch = benefitBranch(draft.document.engineCode), key = row.code + ":" + branch;
      if (!benefitEngineSchema.safeParse(draft.document.engineCode).success || !draft.document.coverage.some(c => c.branch === branch) || seen.has(key)) return [];
      seen.add(key);
      return [{ id: row.id, code: row.code, version: row.version, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.effectiveTo,
        documentHash: row.documentHash, knowledgeAsOf: row.knowledgeAsOf.toISOString(), coverage: draft.document.coverage, citations: draft.document.citations }];
    }) };
  }
  private async capture(userId: string, input: z.infer<typeof pensionEstimateInputSchema>, tx: Prisma.TransactionClient) {
    const history = await this.histories.get(userId, input.historyVersionId, tx), latest = await this.histories.get(userId, undefined, tx);
    if (!history || history.revision !== input.expectedHistoryRevision || latest?.id !== history.id)
      throw new AppError(409, "HISTORY_REVISION_CONFLICT", "Lịch đóng đã đổi. Hãy xem trước lại.");
    const row = await tx.legalRuleSetVersion.findFirst({ where: { id: input.legalRuleSetVersionId, status: "PUBLISHED" } });
    if (!row) throw new AppError(404, "NOT_FOUND", "Không tìm thấy bộ quy định đã công bố.");
    const draft = legalRuleDraftSchema.parse({ code: row.code, effectiveFrom: day(row.effectiveFrom), effectiveTo: row.effectiveTo ? day(row.effectiveTo) : null, supersedesId: row.supersedesId, document: row.document });
    if (input.intendedBenefitDate < draft.effectiveFrom || (draft.effectiveTo && input.intendedBenefitDate >= draft.effectiveTo))
      throw new AppError(422, "RULE_OUTSIDE_EFFECTIVE_PERIOD", "Bộ quy định không áp dụng cho ngày hưởng đã chọn.");
    const validation = validateLegalDocument(draft.document), review = row.review as Record<string, unknown> | null;
    if (digest(draft.document) !== row.documentHash || !validation.valid || digest(validation) !== digest(row.validation) ||
      !review || review.draftHash !== digest(draft) || review.validationHash !== validation.validationHash || review.actor !== row.reviewedBy ||
      row.authorIds.includes(String(review.actor)) || !row.publishedAt || row.knowledgeAsOf > new Date() || row.publishedAt > new Date()) throw integrityError();
    const { reviewHash, ...reviewPayload } = review;
    if (digest(reviewPayload) !== reviewHash) throw integrityError();
    const newer = await tx.legalRuleSetVersion.findMany({ where: { code: row.code, status: "PUBLISHED", version: { gt: row.version } } });
    if (newer.some(r => day(r.effectiveFrom) <= input.intendedBenefitDate && (!r.effectiveTo || input.intendedBenefitDate < day(r.effectiveTo)) &&
      legalRuleDraftSchema.parse({ code: r.code, effectiveFrom: day(r.effectiveFrom), effectiveTo: r.effectiveTo ? day(r.effectiveTo) : null, supersedesId: r.supersedesId, document: r.document }).document.coverage.some(c => c.branch === benefitBranch(draft.document.engineCode))))
      throw new AppError(409, "RULE_VERSION_SUPERSEDED", "Đã có phiên bản quy định mới áp dụng. Hãy xem trước lại.");
    return estimateCaptureSchema.parse({ formatVersion: 1, engineCode: draft.document.engineCode, assessedOn: today(), input,
      history: { id: history.id, revision: history.revision, documentHash: history.documentHash, document: history.document },
      rule: { id: row.id, version: row.version, documentHash: row.documentHash, knowledgeAsOf: row.knowledgeAsOf.toISOString(),
        publishedAt: row.publishedAt.toISOString(), validationHash: validation.validationHash, reviewHash, draft } });
  }
  async preview(userId: string, command: z.infer<typeof pensionEstimateInputSchema>) {
    const input = pensionEstimateInputSchema.parse(command);
    return replayPensionCapture(await this.capture(userId, input, this.db));
  }
  async save(userId: string, command: z.infer<typeof pensionEstimateSaveSchema>, key: string) {
    const input = pensionEstimateSaveSchema.parse(command);
    return idempotentCommand(this.db, userId, "pension.estimate.save", key, input, async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const capture = await this.capture(userId, input.preview, tx), result = replayPensionCapture(capture);
      if (result.inputHash !== input.expectedInputHash) throw new AppError(409, "PREVIEW_CHANGED", "Dữ liệu hoặc ngày đánh giá đã đổi. Hãy xem trước lại.");
      const payload = { userId, historyVersionId: capture.history.id, legalRuleSetVersionId: capture.rule.id, engineCode: capture.engineCode,
        inputHash: result.inputHash, inputSnapshot: json(capture), result: json(result) };
      const row = await tx.pensionEstimate.create({ data: { ...payload, integrityHash: digest(payload) } });
      await audit(tx, userId, "PENSION_ESTIMATE_SAVED", "PENSION_ESTIMATE", row.id, { inputHash: result.inputHash, assessmentStatus: result.assessment.assessmentStatus });
      return view(row);
    });
  }
  async get(userId: string, id: string) {
    z.string().uuid().parse(id);
    const row = await this.db.pensionEstimate.findFirst({ where: { id, userId } });
    if (!row) throw new AppError(404, "NOT_FOUND", "Không tìm thấy kết quả BHXH.");
    return view(row);
  }
  /** Internal T16 boundary: call again inside the plan save transaction. Reading
   * an old estimate remains allowed, but selecting it into a new source requires
   * current history/rule lineage. No profile or plan writes occur here. */
  async captureForSource(userId: string, id: string, expectedIntegrityHash: string, tx: Prisma.TransactionClient = this.db) {
    z.string().uuid().parse(id); insuranceHash.parse(expectedIntegrityHash);
    const row = await tx.pensionEstimate.findFirst({ where: { id, userId } });
    if (!row) throw new AppError(404, "NOT_FOUND", "Không tìm thấy kết quả BHXH.");
    const saved = view(row);
    if (saved.integrityHash !== expectedIntegrityHash) throw new AppError(409, "PENSION_ESTIMATE_CHANGED", "Kết quả BHXH khác bản đã chọn.");
    const capture = estimateCaptureSchema.parse(row.inputSnapshot);
    await this.capture(userId, capture.input, tx);
    if (saved.assessment.assessmentStatus !== "ELIGIBLE" || saved.assessment.monthlyPension === null || saved.assessment.startMonth === null)
      throw new AppError(422, "PENSION_ESTIMATE_NOT_ELIGIBLE", "Cần kết quả BHXH đủ điều kiện và có mức hưởng trước khi chọn vào dự báo.");
    const payload = { estimateId: row.id, ownerId: userId, estimateIntegrityHash: saved.integrityHash, capture };
    return { ...payload, evidenceHash: digest(payload) };
  }
  async list(userId: string) {
    return { items: (await this.db.pensionEstimate.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 })).map(view) };
  }
}
