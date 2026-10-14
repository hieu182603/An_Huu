import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../common/http";
import { smtpConfigured } from "../../config/smtp";
export const auditQuery = paginationSchema(["createdAt"]).extend({ action: z.string().trim().max(80).optional(), targetType: z.string().trim().min(1).max(80).optional() });
const DAY = 86400000, VN_OFFSET = 7 * 3600000;
const vnDate = (d: Date) => new Date(d.getTime() + VN_OFFSET).toISOString().slice(0, 10);
/** Counts per Vietnam calendar day for the last `days` days (oldest first, today last). */
export function dailyBuckets(dates: Date[], days: number, now = new Date()) {
  const counts = new Map(Array.from({ length: days }, (_, i) => [vnDate(new Date(now.getTime() - (days - 1 - i) * DAY)), 0]));
  for (const d of dates) { const k = vnDate(d); if (counts.has(k)) counts.set(k, counts.get(k)! + 1); }
  return [...counts].map(([date, count]) => ({ date, count }));
}
const byStatus = (rows: { status: string | boolean; _count: { _all: number } }[]) => Object.fromEntries(rows.map(r => [String(r.status), r._count._all]));
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
  /** Everything the admin overview page needs in one round trip. */
  async summary() {
    const now = new Date(), ago = (days: number) => new Date(now.getTime() - days * DAY), user = { role: "USER" as const };
    const db = this.db;
    // ponytail: signup trend loads 14 days of createdAt values; switch to a date_trunc GROUP BY if signups reach tens of thousands/day.
    const [users, new7, new30, signups, withProfile, withPlan, active7, logins24, failed24, tickets, oldestOpen, consultations, articles,
      knowledge, approved, conversations7, messages7, legal, assumptions, partners, products, errors24, recentUsers, recentAudit, system] = await Promise.all([
      db.user.groupBy({ by: ["status"], where: user, _count: { _all: true } }),
      db.user.count({ where: { ...user, createdAt: { gte: ago(7) } } }),
      db.user.count({ where: { ...user, createdAt: { gte: ago(30) } } }),
      db.user.findMany({ where: { ...user, createdAt: { gte: ago(14) } }, select: { createdAt: true } }),
      db.financialProfile.count({ where: { user } }),
      db.retirementPlan.groupBy({ by: ["userId"], where: { user } }).then(r => r.length),
      db.loginLog.groupBy({ by: ["userId"], where: { status: "SUCCESS", createdAt: { gte: ago(7) }, user } }).then(r => r.length),
      db.loginLog.count({ where: { status: "SUCCESS", createdAt: { gte: ago(1) } } }),
      db.loginLog.count({ where: { status: { in: ["FAILED", "LOCKED"] }, createdAt: { gte: ago(1) } } }),
      db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
      db.supportTicket.findFirst({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      db.consultation.groupBy({ by: ["status"], _count: { _all: true } }),
      db.article.groupBy({ by: ["status"], _count: { _all: true } }),
      db.knowledgeSource.groupBy({ by: ["status"], _count: { _all: true } }),
      db.knowledgeSource.count({ where: { isApproved: true } }),
      db.aiConversation.count({ where: { createdAt: { gte: ago(7) } } }),
      db.aiMessage.count({ where: { createdAt: { gte: ago(7) }, role: "user" } }),
      db.legalRuleSetVersion.groupBy({ by: ["status"], _count: { _all: true } }),
      db.assumptionSetVersion.groupBy({ by: ["status"], _count: { _all: true } }),
      db.partner.groupBy({ by: ["isVisible"], _count: { _all: true } }),
      db.partnerProduct.groupBy({ by: ["isVisible"], _count: { _all: true } }),
      db.systemLog.count({ where: { level: { in: ["ERROR", "CRITICAL"] }, createdAt: { gte: ago(1) } } }),
      db.user.findMany({ where: user, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, fullName: true, email: true, status: true, createdAt: true } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, targetType: true, performerName: true, createdAt: true } }),
      this.overview(),
    ]);
    const visible = (rows: { isVisible: boolean; _count: { _all: number } }[]) => ({ total: rows.reduce((n, r) => n + r._count._all, 0), visible: rows.find(r => r.isVisible)?._count._all ?? 0 });
    const userStatus = byStatus(users);
    return {
      asOf: now,
      users: { total: Object.values(userStatus).reduce((a, b) => a + b, 0), byStatus: userStatus, new7d: new7, new30d: new30,
        signups14d: dailyBuckets(signups.map(u => u.createdAt), 14, now), withProfile, withPlan, active7d: active7 },
      security: { logins24h: logins24, failedLogins24h: failed24, systemErrors24h: errors24 },
      support: { byStatus: byStatus(tickets), oldestOpenAt: oldestOpen?.createdAt ?? null },
      consultations: { byStatus: byStatus(consultations) },
      content: { byStatus: byStatus(articles) },
      ai: { knowledge: { byStatus: byStatus(knowledge), approved }, conversations7d: conversations7, questions7d: messages7, providerConfigured: process.env.AI_PROVIDER === "gemini" },
      governance: { legalRules: byStatus(legal), assumptions: byStatus(assumptions) },
      catalog: { partners: visible(partners), products: visible(products) },
      system: { uptimeSeconds: system.uptimeSeconds, configuration: system.configuration, mailJobs: system.mailJobs, lastJobCompletedAt: system.lastJobCompletedAt },
      recentUsers, recentAudit,
    };
  }
  /** Period report: current window vs the previous window of the same length, daily series, funnel. */
  async report(days: 7 | 30 | 90) {
    const now = new Date(), from = new Date(now.getTime() - days * DAY), prevFrom = new Date(now.getTime() - 2 * days * DAY), db = this.db;
    const cur = { gte: from }, prev = { gte: prevFrom, lt: from }, user = { role: "USER" as const };
    const pair = (count: (range: { gte: Date; lt?: Date }) => Promise<number>) => Promise.all([count(cur), count(prev)]).then(([current, previous]) => ({ current, previous }));
    // ponytail: daily series load createdAt values for the window (≤90 days); switch to date_trunc GROUP BY at high volume.
    const dates = (rows: Promise<{ createdAt: Date }[]>) => rows.then(r => dailyBuckets(r.map(x => x.createdAt), days, now));
    const [signups, activeUsers, aiQuestions, tickets, consults, published,
      signupSeries, loginSeries, aiSeries, ticketSeries,
      registered, verified, withProfile, withPlan, usedAi,
      ticketsByCategory, ticketsByStatus, logins, systemLogs, adminActions] = await Promise.all([
      pair(r => db.user.count({ where: { ...user, createdAt: r } })),
      pair(r => db.loginLog.groupBy({ by: ["userId"], where: { status: "SUCCESS", createdAt: r, user } }).then(x => x.length)),
      pair(r => db.aiMessage.count({ where: { role: "user", createdAt: r } })),
      pair(r => db.supportTicket.count({ where: { createdAt: r } })),
      pair(r => db.supportTicket.count({ where: { createdAt: r, category: "Tư vấn sản phẩm" } })),
      pair(r => db.article.count({ where: { status: "PUBLISHED", publishedAt: r } })),
      dates(db.user.findMany({ where: { ...user, createdAt: cur }, select: { createdAt: true } })),
      dates(db.loginLog.findMany({ where: { status: "SUCCESS", createdAt: cur }, select: { createdAt: true } })),
      dates(db.aiMessage.findMany({ where: { role: "user", createdAt: cur }, select: { createdAt: true } })),
      dates(db.supportTicket.findMany({ where: { createdAt: cur }, select: { createdAt: true } })),
      db.user.count({ where: user }),
      db.user.count({ where: { ...user, status: "ACTIVE" } }),
      db.financialProfile.count({ where: { user } }),
      db.retirementPlan.groupBy({ by: ["userId"], where: { user } }).then(r => r.length),
      db.aiConversation.groupBy({ by: ["userId"], where: { user } }).then(r => r.length),
      db.supportTicket.groupBy({ by: ["category"], where: { createdAt: cur }, _count: { _all: true } }),
      db.supportTicket.groupBy({ by: ["status"], where: { createdAt: cur }, _count: { _all: true } }),
      db.loginLog.groupBy({ by: ["status"], where: { createdAt: cur }, _count: { _all: true } }),
      db.systemLog.groupBy({ by: ["level"], where: { createdAt: cur }, _count: { _all: true } }),
      db.auditLog.groupBy({ by: ["action"], where: { createdAt: cur }, _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 8 }),
    ]);
    const counts = <K extends string>(rows: Array<Record<K, string> & { _count: { _all: number } }>, key: K) => Object.fromEntries(rows.map(r => [r[key], r._count._all]));
    return {
      days, from, to: now,
      kpis: { signups, activeUsers, aiQuestions, tickets, consults, published },
      series: dailyBuckets([], days, now).map((d, i) => ({ date: d.date, signups: signupSeries[i].count, logins: loginSeries[i].count, aiQuestions: aiSeries[i].count, tickets: ticketSeries[i].count })),
      funnel: { registered, verified, withProfile, withPlan, usedAi },
      support: { byCategory: counts(ticketsByCategory, "category"), byStatus: counts(ticketsByStatus, "status") },
      security: { logins: counts(logins, "status"), systemLogs: counts(systemLogs, "level") },
      adminActions: adminActions.map(a => ({ action: a.action, count: a._count._all })),
    };
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
