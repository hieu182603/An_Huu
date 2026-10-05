import { Prisma, type PrismaClient, type SocialInsuranceHistoryVersion } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { audit } from "../../common/audit";
import { idempotentCommand } from "../../common/idempotent-command";
import { historyPreviewSchema, historySaveSchema, insuranceHistorySchema } from "./insurance-schema";
import { previewInsuranceHistory } from "./history";

function historyView(row: SocialInsuranceHistoryVersion) {
  const document = insuranceHistorySchema.parse(row.document);
  if (digest(document) !== row.documentHash || row.schemaVersion !== document.schemaVersion)
    throw new AppError(409, "HISTORY_INTEGRITY_FAILED", "Lịch đóng không khớp bản đã lưu.");
  return { id: row.id, revision: row.revision, parentVersionId: row.parentVersionId, parentHash: row.parentHash,
    documentHash: row.documentHash, recordedAt: row.recordedAt.toISOString(), document };
}
export class InsuranceHistoryService {
  constructor(private db: PrismaClient) {}
  async get(userId: string, id?: string, tx: Prisma.TransactionClient = this.db) {
    if (id) z.string().uuid().parse(id);
    const row = await tx.socialInsuranceHistoryVersion.findFirst({ where: { userId, ...(id ? { id } : {}) }, orderBy: { revision: "desc" } });
    if (id && !row) throw new AppError(404, "NOT_FOUND", "Không tìm thấy lịch đóng.");
    return row ? historyView(row) : null;
  }
  async preview(userId: string, command: z.infer<typeof historyPreviewSchema>, tx: Prisma.TransactionClient = this.db) {
    const input = historyPreviewSchema.parse(command), latest = await this.get(userId, undefined, tx);
    if ((latest?.revision ?? 0) !== input.expectedHistoryRevision) throw new AppError(409, "HISTORY_REVISION_CONFLICT", "Lịch đóng đã đổi. Hãy tải lại.");
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    if (input.document.confirmedThroughMonth > today.slice(0, 7) || [...input.document.months, ...input.document.specialPeriods].some(r => r.evidence.some(e => e.confirmedOn > today)) ||
      input.document.months.some(r => r.stateSalary?.evidence.some(e => e.confirmedOn > today)))
      throw new AppError(422, "FUTURE_HISTORY_CONFIRMATION", "Không xác nhận lịch đóng hoặc chứng từ trong tương lai; dùng kịch bản dự kiến riêng.");
    return previewInsuranceHistory(input);
  }
  async save(userId: string, command: z.infer<typeof historySaveSchema>, key: string) {
    const input = historySaveSchema.parse(command);
    return idempotentCommand(this.db, userId, "pension.history.append", key, input, async tx => {
      const owner = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!owner.length) throw new AppError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
      const result = await this.preview(userId, input.preview, tx);
      if (result.inputHash !== input.expectedInputHash) throw new AppError(409, "PREVIEW_CHANGED", "Nội dung khác lần xem trước.");
      if (result.status === "INVALID") throw new AppError(422, "HISTORY_INVALID", "Cần sửa các tháng trùng hoặc nằm ngoài phạm vi.");
      const parent = await this.get(userId, undefined, tx), documentHash = digest(result.normalized);
      const row = await tx.socialInsuranceHistoryVersion.create({ data: { userId, revision: input.preview.expectedHistoryRevision + 1,
        parentVersionId: parent?.id ?? null, parentHash: parent?.documentHash ?? null, schemaVersion: 1,
        document: result.normalized as Prisma.InputJsonObject, documentHash } });
      await audit(tx, userId, "INSURANCE_HISTORY_APPENDED", "INSURANCE_HISTORY", row.id, { revision: row.revision, documentHash });
      return historyView(row);
    });
  }
}
