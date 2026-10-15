import { digest } from "../../common/digest";
import { Prisma, type PrismaClient, type AssumptionSetVersion } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";
import { assumptionsListSchema, publishAssumptionsSchema } from "../assumptions/schema";
import { MARKET_DATA_CODE, marketDocumentSchema, writeMarketSchema, approveMarketSchema, type MarketDocument } from "./market-schema";

export const documentHash = digest;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
const workflowSchema = z.object({ approval: z.object({ actor: z.string(), approvedAt: z.string(), documentHash: z.string(), reviewNote: z.string() }).nullable() }).strict();
const conflict = () => new AppError(409, "REVISION_CONFLICT", "Phiên bản hoặc trạng thái dữ liệu đã đổi.");
function view(row: AssumptionSetVersion) {
  const data = marketDocumentSchema.parse(row.values), workflow = workflowSchema.parse(row.policy);
  if (row.status !== "DRAFT" && workflow.approval?.documentHash !== documentHash(data))
    throw new AppError(409, "MARKET_DATA_REVIEW_REQUIRED", "Hash dữ liệu không khớp phê duyệt.");
  return { id: row.id, version: row.version, revision: row.revision, status: row.status, data,
    documentHash: documentHash(data), approval: workflow.approval, effectiveAt: row.effectiveAt?.toISOString() ?? null };
}
export class MarketDataService {
  constructor(private db: PrismaClient, private now: () => Date = () => new Date()) {}
  private async row(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.assumptionSetVersion.findUnique({ where: { id } });
    if (!row || row.modelCode !== MARKET_DATA_CODE) throw new AppError(404, "NOT_FOUND", "Không tìm thấy bộ dữ liệu thị trường.");
    return row;
  }
  async list(query: z.infer<typeof assumptionsListSchema>) {
    const q = assumptionsListSchema.parse(query), where = { modelCode: MARKET_DATA_CODE };
    const rows = await this.db.assumptionSetVersion.findMany({ where, orderBy: { version: "desc" }, skip: (q.page - 1) * q.limit, take: q.limit });
    return { ...q, total: await this.db.assumptionSetVersion.count({ where }), items: rows.map(r => {
      const v = view(r); return { id: v.id, version: v.version, revision: v.revision, status: v.status, title: v.data.title, period: v.data.period };
    }) };
  }
  async get(id: string) { return view(await this.row(this.db, id)); }
  async published(id?: string) {
    const row = await this.db.assumptionSetVersion.findFirst({ where: { modelCode: MARKET_DATA_CODE, status: "PUBLISHED",
      effectiveAt: { lte: this.now() }, ...(id ? { id } : {}) }, orderBy: { version: "desc" } });
    return row ? view(row) : null;
  }
  create(actor: string, command: MarketDocument) {
    const data = marketDocumentSchema.parse(command);
    return transaction(this.db, async tx => {
      const last = await tx.assumptionSetVersion.findFirst({ orderBy: { version: "desc" } });
      let row: AssumptionSetVersion;
      try { row = await tx.assumptionSetVersion.create({ data: { version: (last?.version ?? 0) + 1, modelCode: MARKET_DATA_CODE,
        values: json(data), source: json(data.sources), policy: { approval: null }, reason: data.reason, createdBy: actor } }); }
      catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict(); throw e; }
      await audit(tx, actor, "MARKET_DATA_CREATED", "MARKET_DATA", row.id, { documentHash: documentHash(data) });
      return view(row);
    });
  }
  patch(actor: string, id: string, command: z.infer<typeof writeMarketSchema>) {
    const input = writeMarketSchema.parse(command);
    return transaction(this.db, async tx => {
      await this.row(tx, id);
      const result = await tx.assumptionSetVersion.updateMany({ where: { id, modelCode: MARKET_DATA_CODE, status: "DRAFT", revision: input.expectedRevision },
        data: { values: json(input.data), source: json(input.data.sources), reason: input.data.reason, policy: { approval: null }, revision: { increment: 1 } } });
      if (result.count !== 1) throw conflict();
      await audit(tx, actor, "MARKET_DATA_EDITED", "MARKET_DATA", id, { revision: input.expectedRevision + 1 });
      return view(await this.row(tx, id));
    });
  }
  async validate(id: string) {
    const row = await this.row(this.db, id), parsed = marketDocumentSchema.safeParse(row.values);
    return { status: parsed.success ? "VALID" : "INVALID", issues: parsed.success ? [] : parsed.error.issues.map(i => ({ path: i.path.join("."), message: i.message })) };
  }
  approve(actor: string, id: string, command: z.infer<typeof approveMarketSchema>) {
    const input = approveMarketSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id), data = marketDocumentSchema.parse(row.values);
      if (data.sources.some(s => s.retrievedOn > this.now().toISOString().slice(0, 10)) || data.period.to >= this.now().toISOString().slice(0, 7))
        throw new AppError(422, "MARKET_PERIOD_INVALID", "Chỉ duyệt tháng lịch sử đã kết thúc và nguồn đã truy cập.");
      const approval = { actor, approvedAt: this.now().toISOString(), documentHash: documentHash(data), reviewNote: input.reviewNote };
      const result = await tx.assumptionSetVersion.updateMany({ where: { id, status: "DRAFT", revision: input.expectedRevision },
        data: { status: "APPROVED", revision: { increment: 1 }, policy: json({ approval }) } });
      if (result.count !== 1) throw conflict();
      await audit(tx, actor, "MARKET_DATA_APPROVED", "MARKET_DATA", id, { documentHash: approval.documentHash });
      return view(await this.row(tx, id));
    });
  }
  publish(actor: string, id: string, command: z.infer<typeof publishAssumptionsSchema>) {
    const input = publishAssumptionsSchema.parse(command);
    return transaction(this.db, async tx => {
      const row = await this.row(tx, id), v = view(row);
      if (!v.approval) throw conflict();
      const latest = await tx.assumptionSetVersion.findFirst({ where: { modelCode: MARKET_DATA_CODE, status: "PUBLISHED" }, orderBy: { version: "desc" } });
      if (latest && latest.version >= row.version) throw conflict();
      const result = await tx.assumptionSetVersion.updateMany({ where: { id, status: "APPROVED", revision: input.expectedRevision },
        data: { status: "PUBLISHED", revision: { increment: 1 }, publishedBy: actor, effectiveAt: new Date(v.data.effectiveFrom + "T00:00:00.000Z") } });
      if (result.count !== 1) throw conflict();
      await audit(tx, actor, "MARKET_DATA_PUBLISHED", "MARKET_DATA", id, { documentHash: v.documentHash });
      return view(await this.row(tx, id));
    });
  }
}
