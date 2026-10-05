import { Prisma, type PrismaClient, type LegalRuleSetVersion } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { audit } from "../../common/audit";
import { idempotentCommand } from "../../common/idempotent-command";
import { legalRuleDocumentSchema, legalRuleDraftSchema, legalRulePatchSchema, legalRuleTransitionSchema } from "./insurance-schema";
import { validateLegalDocument, legalStrategies, type LegalStrategy } from "./legal-validation";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
const conflict = () => new AppError(409, "RULE_REVISION_CONFLICT", "Bộ luật đã đổi. Hãy kiểm tra và duyệt lại.");
const date = (v: string) => new Date(v + "T00:00:00.000Z");
const dateText = (v: Date | null) => v?.toISOString().slice(0, 10) ?? null;
function ruleView(row: LegalRuleSetVersion) {
  const document = legalRuleDocumentSchema.parse(row.document);
  if (digest(document) !== row.documentHash) throw new AppError(409, "RULE_INTEGRITY_FAILED", "Nội dung luật không khớp hash đã lưu.");
  return { id: row.id, revision: row.revision, version: row.version, status: row.status, documentHash: row.documentHash,
    knowledgeAsOf: row.knowledgeAsOf.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null,
    draft: { code: row.code, effectiveFrom: dateText(row.effectiveFrom)!, effectiveTo: dateText(row.effectiveTo), supersedesId: row.supersedesId, document },
    validation: row.validation, review: row.review };
}
export class LegalRulesService {
  constructor(private db: PrismaClient, private strategies: readonly LegalStrategy[] = legalStrategies) {}
  private async admin(tx: Prisma.TransactionClient, actor: string) {
    if (!await tx.user.findFirst({ where: { id: actor, role: "ADMIN", status: "ACTIVE" } })) throw new AppError(403, "FORBIDDEN", "Chỉ quản trị viên được quản lý luật.");
  }
  private async row(tx: Prisma.TransactionClient, id: string) {
    z.string().uuid().parse(id);
    const row = await tx.legalRuleSetVersion.findUnique({ where: { id } });
    if (!row) throw new AppError(404, "NOT_FOUND", "Không tìm thấy bộ luật.");
    ruleView(row); return row;
  }
  async get(actor: string, id: string) { await this.admin(this.db, actor); return ruleView(await this.row(this.db, id)); }
  async list(actor: string) {
    await this.admin(this.db, actor);
    return { items: (await this.db.legalRuleSetVersion.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map(ruleView) };
  }
  async create(actor: string, command: z.infer<typeof legalRuleDraftSchema>, key: string) {
    const input = legalRuleDraftSchema.parse(command);
    return idempotentCommand(this.db, actor, "pension.legal.create", key, input, async tx => {
      await this.admin(tx, actor);
      const last = await tx.legalRuleSetVersion.findFirst({ where: { code: input.code }, orderBy: { version: "desc" } });
      await this.checkSupersedes(tx, input.code, input.supersedesId);
      const row = await tx.legalRuleSetVersion.create({ data: { code: input.code, version: (last?.version ?? 0) + 1, revision: 1, status: "DRAFT",
        effectiveFrom: date(input.effectiveFrom), effectiveTo: input.effectiveTo ? date(input.effectiveTo) : null, supersedesId: input.supersedesId,
        document: json(input.document), documentHash: digest(input.document), createdBy: actor, authorIds: [actor] } });
      await audit(tx, actor, "LEGAL_RULE_DRAFT_CREATED", "LEGAL_RULE", row.id, { version: row.version, documentHash: row.documentHash });
      return ruleView(row);
    });
  }
  async patch(actor: string, id: string, command: z.infer<typeof legalRulePatchSchema>, key: string) {
    const input = legalRulePatchSchema.parse(command);
    return idempotentCommand(this.db, actor, "pension.legal.patch", key, { id, ...input }, async tx => {
      await this.admin(tx, actor); const row = await this.row(tx, id), v = input.draft;
      if (row.status === "PUBLISHED" || row.revision !== input.expectedRevision) throw conflict();
      if (v.code !== row.code) throw new AppError(422, "RULE_CODE_IMMUTABLE", "Không đổi định danh chuỗi luật.");
      await this.checkSupersedes(tx, v.code, v.supersedesId);
      if ((await tx.legalRuleSetVersion.updateMany({ where: { id, revision: row.revision, status: row.status }, data: {
        revision: { increment: 1 }, status: "DRAFT", effectiveFrom: date(v.effectiveFrom), effectiveTo: v.effectiveTo ? date(v.effectiveTo) : null,
        supersedesId: v.supersedesId, document: json(v.document), documentHash: digest(v.document), authorIds: [...new Set([...row.authorIds, actor])],
        validation: Prisma.DbNull, review: Prisma.DbNull, reviewedBy: null, knowledgeAsOf: new Date(),
      } })).count !== 1) throw conflict();
      await audit(tx, actor, "LEGAL_RULE_DRAFT_CHANGED", "LEGAL_RULE", id, { revision: row.revision + 1 });
      return ruleView(await this.row(tx, id));
    });
  }
  private async checkSupersedes(tx: Prisma.TransactionClient, code: string, id: string | null) {
    if (!id) return;
    const target = await this.row(tx, id);
    if (target.code !== code || target.status !== "PUBLISHED") throw new AppError(422, "RULE_SUPERSEDES_INVALID", "Chỉ thay thế bản đã công bố cùng chuỗi luật.");
  }
  async transition(actor: string, id: string, command: z.infer<typeof legalRuleTransitionSchema>, key: string) {
    const input = legalRuleTransitionSchema.parse(command);
    return idempotentCommand(this.db, actor, "pension.legal.transition", key, { id, ...input }, async tx => {
      await this.admin(tx, actor); const row = await this.row(tx, id);
      if (row.revision !== input.expectedRevision || row.documentHash !== input.expectedDocumentHash || row.status === "PUBLISHED") throw conflict();
      const validation = validateLegalDocument(legalRuleDocumentSchema.parse(row.document), this.strategies);
      let changes: Prisma.LegalRuleSetVersionUpdateManyMutationInput;
      if (input.action === "VALIDATE") {
        changes = { status: validation.valid ? "VALIDATED" : "DRAFT", validation: json(validation), review: Prisma.DbNull, reviewedBy: null };
      } else {
        if (!validation.valid || digest(row.validation) !== digest(validation) || input.validationHash !== validation.validationHash)
          throw new AppError(422, "RULE_VALIDATION_REQUIRED", "Cần kiểm chứng đủ các nhánh và đúng nội dung luật trước khi duyệt.");
        if (input.action === "REVIEW") {
          if (row.status !== "VALIDATED" || row.authorIds.includes(actor) || !input.reviewNote)
            throw new AppError(422, "INDEPENDENT_RULE_REVIEW_REQUIRED", "Người duyệt phải độc lập với người soạn và ghi căn cứ duyệt.");
          const review = { actor, reviewedAt: new Date().toISOString(), reviewNote: input.reviewNote,
            validationHash: validation.validationHash, draftHash: digest(ruleView(row).draft) };
          changes = { status: "REVIEWED", reviewedBy: actor, review: json({ ...review, reviewHash: digest(review) }) };
        } else {
          const review = row.review as { actor?: string; validationHash?: string; draftHash?: string; reviewHash?: string } | null;
          if (row.status !== "REVIEWED" || !review || row.authorIds.includes(review.actor ?? "") || review.actor !== row.reviewedBy ||
            review.validationHash !== validation.validationHash || review.draftHash !== digest(ruleView(row).draft) || input.reviewHash !== review.reviewHash)
            throw new AppError(422, "RULE_REVIEW_REQUIRED", "Cần phê duyệt đúng bản luật trước khi công bố.");
          const { reviewHash, ...reviewPayload } = review;
          if (digest(reviewPayload) !== reviewHash) throw new AppError(409, "RULE_REVIEW_INTEGRITY_FAILED", "Biên bản duyệt không còn khớp.");
          await this.checkPublishWindow(tx, row);
          changes = { status: "PUBLISHED", publishedBy: actor, publishedAt: new Date() };
        }
      }
      if ((await tx.legalRuleSetVersion.updateMany({ where: { id, revision: row.revision, status: row.status }, data: { ...changes, revision: { increment: 1 } } })).count !== 1) throw conflict();
      await audit(tx, actor, `LEGAL_RULE_${input.action}`, "LEGAL_RULE", id, { revision: row.revision + 1, documentHash: row.documentHash });
      return ruleView(await this.row(tx, id));
    });
  }
  private async checkPublishWindow(tx: Prisma.TransactionClient, row: LegalRuleSetVersion) {
    const published = await tx.legalRuleSetVersion.findMany({ where: { code: row.code, status: "PUBLISHED" }, orderBy: { version: "desc" } });
    const ancestors = new Set<string>(); let parent = row.supersedesId;
    if (parent && parent !== published[0]?.id) throw new AppError(409, "RULE_SUPERSESSION_STALE", "Cần đối chiếu bản luật mới nhất trước khi thay thế.");
    while (parent) {
      if (ancestors.has(parent)) throw new AppError(409, "RULE_SUPERSESSION_INVALID", "Chuỗi thay thế luật không hợp lệ.");
      ancestors.add(parent); const previous = published.find(p => p.id === parent);
      if (!previous) throw new AppError(409, "RULE_SUPERSESSION_INVALID", "Không tìm được bản luật tiền nhiệm.");
      parent = previous.supersedesId;
    }
    const branches = legalRuleDocumentSchema.parse(row.document).coverage.map(c => c.branch);
    if (published.some(p => !ancestors.has(p.id) && (!p.effectiveTo || row.effectiveFrom < p.effectiveTo) && (!row.effectiveTo || p.effectiveFrom < row.effectiveTo) &&
      legalRuleDocumentSchema.parse(p.document).coverage.some(c => branches.includes(c.branch))))
      throw new AppError(409, "RULE_EFFECTIVE_OVERLAP", "Có nhánh luật chồng hiệu lực chưa được xác nhận thay thế.");
  }
}
