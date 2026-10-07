import type { PrismaClient, LoginStatus, SystemLogLevel } from "@prisma/client";
import type { z } from "zod";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";
import { AppError } from "../../common/errors";
import type {
  GeneralSettingsInput,
  SecuritySettingsInput,
  NotificationSettingsInput,
  auditLogQuery,
  loginLogQuery,
  systemLogQuery,
} from "./schema";

const DEFAULT_GENERAL_SETTINGS: GeneralSettingsInput = {
  systemName: "An Hưu",
  defaultLanguage: "Tiếng Việt",
  operatingTimezone: "GMT+7 (Việt Nam)",
  supportEmail: "hotro@anhuu.vn",
  maintenanceMode: false,
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettingsInput = {
  sessionTimeoutMinutes: 60,
  maxLoginAttempts: 5,
  accountLockMinutes: 15,
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireLowercase: true,
  passwordRequireNumber: true,
  passwordRequireSpecial: false,
  admin2faRequired: false,
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsInput = {
  emailEnabled: true,
  inAppEnabled: true,
  smsEnabled: false,
  notifyAccount: true,
  notifySupport: true,
  notifyFinancial: true,
  notifySystem: true,
};

function sanitizeSensitive(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSensitive);
  const sensitiveKeys = ["password", "passwordhash", "token", "refreshtoken", "secret", "otp", "credential", "authcookie"];
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      result[key] = "[PROTECTED]";
    } else if (val && typeof val === "object") {
      result[key] = sanitizeSensitive(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export class SystemSettingsService {
  constructor(private db: PrismaClient) {}

  // 1. General Settings
  async getGeneralSettings(): Promise<GeneralSettingsInput> {
    const record = await this.db.systemSetting.findUnique({ where: { key: "general" } });
    if (!record) {
      await this.db.systemSetting.create({
        data: {
          key: "general",
          value: DEFAULT_GENERAL_SETTINGS as unknown as object,
          category: "GENERAL",
        },
      });
      return DEFAULT_GENERAL_SETTINGS;
    }
    return { ...DEFAULT_GENERAL_SETTINGS, ...(record.value as object) } as GeneralSettingsInput;
  }

  async updateGeneralSettings(
    actorId: string,
    actorName: string,
    input: GeneralSettingsInput,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<GeneralSettingsInput> {
    return transaction(this.db, async (tx) => {
      const existing = await tx.systemSetting.findUnique({ where: { key: "general" } });
      const before = existing ? (existing.value as object) : DEFAULT_GENERAL_SETTINGS;

      await tx.systemSetting.upsert({
        where: { key: "general" },
        create: {
          key: "general",
          value: input as unknown as object,
          category: "GENERAL",
          updatedBy: actorId,
        },
        update: {
          value: input as unknown as object,
          category: "GENERAL",
          updatedBy: actorId,
        },
      });

      await audit(
        tx,
        actorId,
        "UPDATE_SYSTEM_SETTINGS",
        "SYSTEM_SETTINGS",
        "general",
        {
          before: sanitizeSensitive(before) as object,
          after: sanitizeSensitive(input) as object,
        },
        {
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          performerName: actorName,
        }
      );

      return input;
    });
  }

  // 2. Security Settings
  async getSecuritySettings(): Promise<SecuritySettingsInput> {
    const record = await this.db.systemSetting.findUnique({ where: { key: "security" } });
    if (!record) {
      await this.db.systemSetting.create({
        data: {
          key: "security",
          value: DEFAULT_SECURITY_SETTINGS as unknown as object,
          category: "SECURITY",
        },
      });
      return DEFAULT_SECURITY_SETTINGS;
    }
    return { ...DEFAULT_SECURITY_SETTINGS, ...(record.value as object) } as SecuritySettingsInput;
  }

  async updateSecuritySettings(
    actorId: string,
    actorName: string,
    input: SecuritySettingsInput,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<SecuritySettingsInput> {
    return transaction(this.db, async (tx) => {
      const existing = await tx.systemSetting.findUnique({ where: { key: "security" } });
      const before = existing ? (existing.value as object) : DEFAULT_SECURITY_SETTINGS;

      await tx.systemSetting.upsert({
        where: { key: "security" },
        create: {
          key: "security",
          value: input as unknown as object,
          category: "SECURITY",
          updatedBy: actorId,
        },
        update: {
          value: input as unknown as object,
          category: "SECURITY",
          updatedBy: actorId,
        },
      });

      await audit(
        tx,
        actorId,
        "UPDATE_SECURITY_SETTINGS",
        "SYSTEM_SETTINGS",
        "security",
        {
          before: sanitizeSensitive(before) as object,
          after: sanitizeSensitive(input) as object,
        },
        {
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          performerName: actorName,
        }
      );

      return input;
    });
  }

  // 3. Notification Settings
  async getNotificationSettings(): Promise<NotificationSettingsInput> {
    const record = await this.db.systemSetting.findUnique({ where: { key: "notifications" } });
    if (!record) {
      await this.db.systemSetting.create({
        data: {
          key: "notifications",
          value: DEFAULT_NOTIFICATION_SETTINGS as unknown as object,
          category: "NOTIFICATION",
        },
      });
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(record.value as object) } as NotificationSettingsInput;
  }

  async updateNotificationSettings(
    actorId: string,
    actorName: string,
    input: NotificationSettingsInput,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<NotificationSettingsInput> {
    return transaction(this.db, async (tx) => {
      const existing = await tx.systemSetting.findUnique({ where: { key: "notifications" } });
      const before = existing ? (existing.value as object) : DEFAULT_NOTIFICATION_SETTINGS;

      await tx.systemSetting.upsert({
        where: { key: "notifications" },
        create: {
          key: "notifications",
          value: input as unknown as object,
          category: "NOTIFICATION",
          updatedBy: actorId,
        },
        update: {
          value: input as unknown as object,
          category: "NOTIFICATION",
          updatedBy: actorId,
        },
      });

      await audit(
        tx,
        actorId,
        "UPDATE_NOTIFICATION_SETTINGS",
        "SYSTEM_SETTINGS",
        "notifications",
        {
          before: sanitizeSensitive(before) as object,
          after: sanitizeSensitive(input) as object,
        },
        {
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          performerName: actorName,
        }
      );

      return input;
    });
  }

  // 4. Audit Logs
  async listAuditLogs(query: z.infer<typeof auditLogQuery>) {
    const where: Record<string, unknown> = {};
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;
    if (query.performerId) where.performerId = query.performerId;

    if (query.fromDate || query.toDate) {
      const createdAt: Record<string, Date> = {};
      if (query.fromDate) createdAt.gte = new Date(query.fromDate);
      if (query.toDate) createdAt.lte = new Date(query.toDate.includes("T") ? query.toDate : query.toDate + "T23:59:59.999Z");
      where.createdAt = createdAt;
    }

    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: "insensitive" } },
        { targetType: { contains: query.search, mode: "insensitive" } },
        { targetId: { contains: query.search, mode: "insensitive" } },
        { performerName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: query.order }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          performerId: true,
          performerName: true,
          ipAddress: true,
          userAgent: true,
          details: true,
          createdAt: true,
        },
      }),
      this.db.auditLog.count({ where }),
    ]);

    const sanitizedItems = items.map((item) => ({
      ...item,
      details: sanitizeSensitive(item.details),
    }));

    return { items: sanitizedItems, total, page: query.page, limit: query.limit };
  }

  async getAuditLogDetail(id: string) {
    const log = await this.db.auditLog.findUnique({
      where: { id },
      include: {
        performer: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
    if (!log) throw new AppError(404, "LOG_NOT_FOUND", "Không tìm thấy bản ghi nhật ký.");
    return {
      ...log,
      details: sanitizeSensitive(log.details),
    };
  }

  // 5. Login Logs
  async listLoginLogs(query: z.infer<typeof loginLogQuery>) {
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== "ALL") {
      where.status = query.status as LoginStatus;
    }
    if (query.search) {
      where.OR = [
        { identifier: { contains: query.search, mode: "insensitive" } },
        { ipAddress: { contains: query.search, mode: "insensitive" } },
        { failureReason: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.fromDate || query.toDate) {
      const createdAt: Record<string, Date> = {};
      if (query.fromDate) createdAt.gte = new Date(query.fromDate);
      if (query.toDate) createdAt.lte = new Date(query.toDate.includes("T") ? query.toDate : query.toDate + "T23:59:59.999Z");
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      this.db.loginLog.findMany({
        where,
        orderBy: [{ createdAt: query.order }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          userId: true,
          identifier: true,
          status: true,
          ipAddress: true,
          userAgent: true,
          failureReason: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      this.db.loginLog.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async recordLoginLog(data: {
    userId?: string | null;
    identifier: string;
    status: LoginStatus;
    ipAddress?: string | null;
    userAgent?: string | null;
    failureReason?: string | null;
  }) {
    try {
      return await this.db.loginLog.create({
        data: {
          userId: data.userId || null,
          identifier: data.identifier,
          status: data.status,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          failureReason: data.failureReason || null,
        },
      });
    } catch {
      // Login logging failure must never crash authentication flow
      return null;
    }
  }

  // 6. System Logs (Application & Error Logs)
  async listSystemLogs(query: z.infer<typeof systemLogQuery>) {
    const where: Record<string, unknown> = {};
    if (query.level && query.level !== "ALL") {
      where.level = query.level as SystemLogLevel;
    }
    if (query.source) {
      where.source = { contains: query.source, mode: "insensitive" };
    }
    if (query.search) {
      where.OR = [
        { message: { contains: query.search, mode: "insensitive" } },
        { source: { contains: query.search, mode: "insensitive" } },
        { path: { contains: query.search, mode: "insensitive" } },
        { traceId: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.fromDate || query.toDate) {
      const createdAt: Record<string, Date> = {};
      if (query.fromDate) createdAt.gte = new Date(query.fromDate);
      if (query.toDate) createdAt.lte = new Date(query.toDate.includes("T") ? query.toDate : query.toDate + "T23:59:59.999Z");
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      this.db.systemLog.findMany({
        where,
        orderBy: [{ createdAt: query.order }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          level: true,
          source: true,
          message: true,
          path: true,
          statusCode: true,
          traceId: true,
          details: true,
          createdAt: true,
        },
      }),
      this.db.systemLog.count({ where }),
    ]);

    const sanitized = items.map((item) => ({
      ...item,
      details: sanitizeSensitive(item.details),
    }));

    return { items: sanitized, total, page: query.page, limit: query.limit };
  }

  async recordSystemLog(data: {
    level?: SystemLogLevel;
    source: string;
    message: string;
    path?: string | null;
    statusCode?: number | null;
    traceId?: string | null;
    details?: unknown;
  }) {
    try {
      return await this.db.systemLog.create({
        data: {
          level: data.level || "INFO",
          source: data.source,
          message: data.message,
          path: data.path || null,
          statusCode: data.statusCode || null,
          traceId: data.traceId || null,
          details: data.details ? (sanitizeSensitive(data.details) as object) : undefined,
        },
      });
    } catch {
      // Must not crash app
      return null;
    }
  }
}
