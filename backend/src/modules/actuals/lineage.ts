import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
export type ActualRevision = { period: string; revision: number; closingBalance: string };
export type ReforecastLineage = {
  kind: "ACTUAL_REFORECAST";
  sourceVersionId: string; sourceSnapshotHash: string;
  originalValuationDate: string; originalRetirementMonth: string;
  throughMonth: string; actualRevisions: ActualRevision[];
};
export async function actualSourceChanged(tx: Prisma.TransactionClient, userId: string, source?: ReforecastLineage) {
  if (!source) return false;
  const rows = await tx.actualMonth.findMany({ where: { userId, period: { in: source.actualRevisions.map(r => r.period) } } });
  return source.actualRevisions.some(ref => {
    const row = rows.find(r => r.period === ref.period);
    return !row || row.revision !== ref.revision || (row.payload as { closingBalance?: string }).closingBalance !== ref.closingBalance;
  });
}
export async function assertActualSource(tx: Prisma.TransactionClient, userId: string, source?: ReforecastLineage) {
  if (await actualSourceChanged(tx, userId, source))
    throw new AppError(409, "ACTUAL_SOURCE_CHANGED", "Số thực tế nguồn đã thay đổi. Hãy dự báo lại từ phiên bản gốc trước khi lưu hoặc áp dụng.");
}
