import type { PrismaClient } from "@prisma/client";
import { transaction } from "../../common/transaction";

export const expiredAiWhere = (cutoff: Date) => ({ OR: [{ expiresAt: null }, { expiresAt: { lte: cutoff } }] });
function positiveBound(value: number, max: number) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error("AI_RETENTION_CONFIG_INVALID");
}
// Also removes legacy conversations without expiry, matching the existing access policy.
export async function purgeExpiredAi(db: PrismaClient, limit = 100, cutoff = new Date()) {
  positiveBound(limit, 1000);
  if (!Number.isFinite(cutoff.getTime())) throw new Error("AI_RETENTION_CONFIG_INVALID");
  return transaction(db, async tx => {
    const rows = await tx.aiConversation.findMany({ where: expiredAiWhere(cutoff),
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: limit, select: { id: true } });
    const ids = rows.map(row => row.id);
    if (!ids.length) return 0;
    await tx.aiMessage.deleteMany({ where: { conversationId: { in: ids } } });
    return (await tx.aiConversation.deleteMany({ where: { id: { in: ids } } })).count;
  });
}
export async function runAiRetention(db: PrismaClient, options: {
  execute?: boolean; batchSize?: number; maxBatches?: number; cutoff?: Date; signal?: AbortSignal;
} = {}) {
  const { execute = false, batchSize = 100, maxBatches = 10, cutoff = new Date(), signal } = options;
  positiveBound(batchSize, 1000); positiveBound(maxBatches, 100);
  if (!Number.isFinite(cutoff.getTime())) throw new Error("AI_RETENTION_CONFIG_INVALID");
  const eligible = await db.aiConversation.count({ where: expiredAiWhere(cutoff) });
  let deleted = 0, batches = 0;
  if (execute) while (batches < maxBatches && !signal?.aborted) {
    const count = await purgeExpiredAi(db, batchSize, cutoff);
    batches++; deleted += count;
    if (count < batchSize) break;
  }
  const remaining = await db.aiConversation.count({ where: expiredAiWhere(cutoff) });
  return { mode: execute ? "EXECUTE" : "DRY_RUN", cutoff: cutoff.toISOString(), eligible, deleted, batches, remaining,
    cancelled: !!signal?.aborted, complete: execute && !signal?.aborted && remaining === 0 };
}
