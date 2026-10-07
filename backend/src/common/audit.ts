import type { Prisma } from "@prisma/client";

export function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Prisma.InputJsonObject,
  options?: { ipAddress?: string | null; userAgent?: string | null; performerName?: string }
) {
  return tx.auditLog.create({
    data: {
      action,
      targetType,
      targetId,
      performerId: actorId,
      performerName: options?.performerName || "Account",
      ipAddress: options?.ipAddress || (typeof details?.ipAddress === "string" ? details.ipAddress : null),
      userAgent: options?.userAgent || (typeof details?.userAgent === "string" ? details.userAgent : null),
      ...(details ? { details } : {}),
    },
  });
}
