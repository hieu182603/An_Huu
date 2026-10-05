import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../common/http";
import { smtpConfigured } from "../../config/smtp";
export const auditQuery = paginationSchema(["createdAt"]).extend({ action: z.string().trim().max(80).optional(), targetType: z.string().trim().min(1).max(80).optional() });
export class OperationsService {
  constructor(private db: PrismaClient) {}
  async overview() {
    const mailWhere = { type: { in: ["auth.verify_email", "auth.reset_password"] } };
    const [jobs, recentFailures, recentCompletion] = await Promise.all([
      this.db.outboxEvent.groupBy({ by: ["status"], where: mailWhere, _count: { _all: true } }),
      this.db.outboxEvent.findMany({ where: { ...mailWhere, status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, type: true, attempts: true, lastErrorCode: true, createdAt: true } }),
      this.db.outboxEvent.findFirst({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    ]);
    return { asOfDate: new Date(), api: "ready", database: "connected", uptimeSeconds: Math.floor(process.uptime()),
      configuration: { email: smtpConfigured(), encryption: Boolean(process.env.OUTBOX_ENCRYPTION_KEY), google: Boolean(process.env.GOOGLE_CLIENT_ID), media: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) },
      mailJobs: Object.fromEntries(jobs.map(g => [g.status, g._count._all])), mailDeliveryEvidence: "COMPLETED_IS_PROVIDER_ACCEPTED_NOT_DELIVERED", recentFailures, lastJobCompletedAt: recentCompletion?.completedAt || null };
  }
  async audit(query: z.infer<typeof auditQuery>) {
    const where = { ...(query.action ? { action: query.action } : {}), ...(query.targetType ? { targetType: query.targetType } : {}) };
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: [{ createdAt: query.order }, { id: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit,
        select: { id: true, action: true, targetType: true, targetId: true, performerId: true, createdAt: true } }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
}
