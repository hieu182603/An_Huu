import type { Prisma } from "@prisma/client";
export function audit(tx: Prisma.TransactionClient, actorId: string, action: string, targetType: string, targetId: string,
  details?: Prisma.InputJsonObject) {
  return tx.auditLog.create({ data: {
    action, targetType, targetId, performerId: actorId, performerName: "Account",
    ...(details ? { details } : {}),
  } });
}
