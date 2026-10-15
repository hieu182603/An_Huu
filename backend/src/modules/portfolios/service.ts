import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type AssumptionSetVersion } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { PublishedCache } from "../../common/published-cache";
import { AssumptionsService } from "../assumptions/service";
import { assumptionsListSchema, publishAssumptionsSchema } from "../assumptions/schema";
import { portfolioDocumentSchema, writePortfolioSchema, approvePortfolioSchema, portfolioPreviewSchema, PORTFOLIO_POLICY_CODE, type PortfolioDocument, type PortfolioPreview } from "./schema";
import { validatePortfolioPolicy, previewPortfolio } from "./engine";
import { previewGuidance } from "./guidance";
import { logPreviewCoverage } from "../../common/logger";

const json = (data: unknown) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject;
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Bản chính sách đã thay đổi hoặc không còn là nháp.");
const approvalSchema = z.object({ actor: z.string(), approvedAt: z.string(), reviewNote: z.string(), documentHash: z.string(), assumptionHash: z.string() }).strict();
const workflowSchema = z.object({ approval: approvalSchema.nullable() }).strict();
function stored(row: AssumptionSetVersion) {
  const data = portfolioDocumentSchema.safeParse(row.values), workflow = workflowSchema.safeParse(row.policy);
  if (!data.success || !workflow.success) throw new AppError(409, "POLICY_REVIEW_REQUIRED", "Dữ liệu chính sách cần rà soát.");
  if (row.status !== "DRAFT" && workflow.data.approval?.documentHash !== hash(data.data)) throw new AppError(409, "POLICY_REVIEW_REQUIRED", "Nội dung chính sách không khớp bản đã duyệt.");
  return { id: row.id, version: row.version, revision: row.revision, status: row.status, data: data.data, documentHash: hash(data.data),
    approval: workflow.data.approval, createdBy: row.createdBy, publishedBy: row.publishedBy, createdAt: row.createdAt.toISOString(), effectiveAt: row.effectiveAt?.toISOString() ?? null };
}
export const publishedPolicies = new PublishedCache<ReturnType<typeof stored>>();
export class PortfoliosService {
  constructor(private db: PrismaClient, private now: () => Date = () => new Date()) {}
  private async row(client: Prisma.TransactionClient, id: string) {
    const row = await client.assumptionSetVersion.findUnique({ where: { id } });
    if (!row || row.modelCode !== PORTFOLIO_POLICY_CODE) throw new AppError(404, "NOT_FOUND", "Không tìm thấy chính sách danh mục.");
    return row;
  }
  async get(id: string, publishedOnly = false) {
    const cached = publishedPolicies.get(id);
    if (cached) {
      if (publishedOnly && (!cached.effectiveAt || new Date(cached.effectiveAt) > this.now())) throw new AppError(404, "NOT_FOUND", "Chính sách chưa công bố hoặc chưa có hiệu lực.");
      return cached;
    }
    const row = await this.row(this.db, id);
    if (publishedOnly && (row.status !== "PUBLISHED" || !row.effectiveAt || row.effectiveAt > this.now())) throw new AppError(404, "NOT_FOUND", "Chính sách chưa công bố hoặc chưa có hiệu lực.");
    const result = stored(row);
    if (row.status === "PUBLISHED") publishedPolicies.set(id, result);
    return result;
  }
  async list(command: z.infer<typeof assumptionsListSchema>, publishedOnly = false) {
    const query = assumptionsListSchema.parse(command), where = { modelCode: PORTFOLIO_POLICY_CODE,
      ...(publishedOnly ? { status: "PUBLISHED", effectiveAt: { lte: this.now() } } : {}) };
    const rows = await this.db.assumptionSetVersion.findMany({ where, orderBy: { version: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit });
    const total = await this.db.assumptionSetVersion.count({ where });
    return { status: total ? "AVAILABLE" : "UNCONFIGURED", total, page: query.page, limit: query.limit,
      items: rows.map(row => { const v = stored(row); return { id: v.id, version: v.version, revision: v.revision, status: v.status, title: v.data.title, effectiveAt: v.effectiveAt }; }) };
  }
  create(actor: string, input: PortfolioDocument) {
    const data = portfolioDocumentSchema.parse(input);
    return transaction(this.db, async tx => {
      const latest = await tx.assumptionSetVersion.findFirst({ orderBy: { version: "desc" } });
      let row: AssumptionSetVersion;
      try {
        row = await tx.assumptionSetVersion.create({ data: { version: (latest?.version ?? 0) + 1, modelCode: PORTFOLIO_POLICY_CODE, values: json(data),
          policy: { approval: null }, source: json(data.source), reason: data.reason, createdBy: actor } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict();
        throw error;
      }
      await audit(tx, actor, "PORTFOLIO_DRAFT_CREATED", "PORTFOLIO_POLICY", row.id, { version: row.version });
      return stored(row);
    });
  }
  patch(actor: string, id: string, command: z.infer<typeof writePortfolioSchema>) {
    const input = writePortfolioSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id);
      if (row.status !== "DRAFT" || row.revision !== input.expectedRevision) throw conflict();
      const changed = await tx.assumptionSetVersion.updateMany({ where: { id, status: "DRAFT", revision: input.expectedRevision }, data: {
        values: json(input.data), source: json(input.data.source), reason: input.data.reason, policy: { approval: null }, revision: { increment: 1 },
      } });
      if (changed.count !== 1) throw conflict();
      await audit(tx, actor, "PORTFOLIO_DRAFT_UPDATED", "PORTFOLIO_POLICY", id, { revision: input.expectedRevision + 1 });
      return stored(await this.row(tx, id));
    });
  }
  private async dependency(client: Prisma.TransactionClient, data: PortfolioDocument) {
    // Reading an immutable published dependency inside the same transaction does
    // not invoke nested service writes or change a user's selected version.
    return new AssumptionsService(client as PrismaClient, this.now).get(data.assumptionVersionId, true);
  }
  async validate(id: string) {
    const version = await this.get(id), assumptions = await this.dependency(this.db, version.data);
    return validatePortfolioPolicy(version.data, assumptions.data);
  }
  approve(actor: string, id: string, command: z.infer<typeof approvePortfolioSchema>) {
    const input = approvePortfolioSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id), version = stored(row);
      if (row.status !== "DRAFT" || row.revision !== input.expectedRevision) throw conflict();
      const assumptions = await this.dependency(tx, version.data);
      if (validatePortfolioPolicy(version.data, assumptions.data).status !== "VALID") throw new AppError(422, "POLICY_INCOMPLETE", "Chính sách thiếu câu hỏi, ngưỡng, lịch, tỷ trọng hoặc kịch bản hợp lệ.");
      if (version.data.source.reviewedOn > this.now().toISOString().slice(0, 10)) throw new AppError(422, "SOURCE_DATE_IN_FUTURE", "Ngày rà soát nguồn không được ở tương lai.");
      const approval = { actor, approvedAt: this.now().toISOString(), reviewNote: input.reviewNote, documentHash: version.documentHash, assumptionHash: assumptions.documentHash };
      await tx.assumptionSetVersion.update({ where: { id }, data: { status: "APPROVED", revision: { increment: 1 }, policy: json({ approval }) } });
      await audit(tx, actor, "PORTFOLIO_APPROVED", "PORTFOLIO_POLICY", id, { documentHash: version.documentHash, assumptionVersionId: assumptions.id });
      return stored(await this.row(tx, id));
    });
  }
  publish(actor: string, id: string, command: z.infer<typeof publishAssumptionsSchema>) {
    const input = publishAssumptionsSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id), version = stored(row);
      if (row.status !== "APPROVED" || row.revision !== input.expectedRevision) throw conflict();
      const assumptions = await this.dependency(tx, version.data);
      if (version.approval?.assumptionHash !== assumptions.documentHash) throw new AppError(409, "POLICY_REVIEW_REQUIRED", "Bộ giả định không khớp bản đã duyệt.");
      const latest = await tx.assumptionSetVersion.findFirst({ where: { modelCode: PORTFOLIO_POLICY_CODE, status: "PUBLISHED" }, orderBy: { version: "desc" } });
      if (latest && latest.version >= row.version) throw new AppError(409, "OLDER_VERSION", "Hãy tạo phiên bản mới hơn bản đã công bố.");
      await tx.assumptionSetVersion.update({ where: { id }, data: { status: "PUBLISHED", publishedBy: actor, revision: { increment: 1 }, effectiveAt: new Date(version.data.effectiveFrom + "T00:00:00.000Z") } });
      await audit(tx, actor, "PORTFOLIO_PUBLISHED", "PORTFOLIO_POLICY", id, { documentHash: version.documentHash });
      return stored(await this.row(tx, id));
    });
  }
  async preview(command: PortfolioPreview) {
    const input = portfolioPreviewSchema.parse(command), version = await this.get(input.policyVersionId, true);
    const assumptions = await this.dependency(this.db, version.data);
    if (version.approval?.assumptionHash !== assumptions.documentHash) throw new AppError(409, "POLICY_REVIEW_REQUIRED", "Bộ giả định không khớp bản đã duyệt.");
    const result = previewPortfolio(version.data, assumptions.data, input);
    logPreviewCoverage(result.issues, "/api/v1/me/portfolio-policies/preview");
    return { policyVersionId: version.id, policyVersion: version.version, policyHash: version.documentHash,
      assumptionVersionId: assumptions.id, assumptionHash: assumptions.documentHash, answerBasis: "USER_DECLARED_NOT_INDEPENDENTLY_VERIFIED",
      ...result, guidance: previewGuidance(version.data, assumptions.data, input, result.issues) };
  }
}
