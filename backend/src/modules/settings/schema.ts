import { z } from "zod";
import { paginationSchema } from "../../common/http";

export const generalSettingsSchema = z.object({
  systemName: z.string().trim().min(2, "Tên hệ thống tối thiểu 2 ký tự.").max(100, "Tên hệ thống tối đa 100 ký tự."),
  defaultLanguage: z.enum(["Tiếng Việt", "English", "vi", "en"]),
  operatingTimezone: z.string().trim().min(2, "Múi giờ không được để trống.").max(100),
  supportEmail: z.string().trim().email("Email hỗ trợ không đúng định dạng.").max(254),
  maintenanceMode: z.boolean(),
}).strict();

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;

export const securitySettingsSchema = z.object({
  sessionTimeoutMinutes: z.number().int().min(5, "Thời gian phiên tối thiểu 5 phút.").max(1440, "Thời gian phiên tối đa 1440 phút."),
  maxLoginAttempts: z.number().int().min(3, "Số lần đăng nhập sai tối thiểu 3 lần.").max(20, "Số lần đăng nhập sai tối đa 20 lần."),
  accountLockMinutes: z.number().int().min(1, "Thời gian khóa tối thiểu 1 phút.").max(1440, "Thời gian khóa tối đa 1440 phút."),
  passwordMinLength: z.number().int().min(6, "Độ dài mật khẩu tối thiểu 6 ký tự.").max(32, "Độ dài mật khẩu tối đa 32 ký tự."),
  passwordRequireUppercase: z.boolean(),
  passwordRequireLowercase: z.boolean(),
  passwordRequireNumber: z.boolean(),
  passwordRequireSpecial: z.boolean(),
  admin2faRequired: z.boolean(),
}).strict();

export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;

export const notificationSettingsSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  notifyAccount: z.boolean(),
  notifySupport: z.boolean(),
  notifyFinancial: z.boolean(),
  notifySystem: z.boolean(),
}).strict();

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const auditLogQuery = paginationSchema(["createdAt"]).extend({
  action: z.string().trim().max(80).optional(),
  targetType: z.string().trim().min(1).max(80).optional(),
  search: z.string().trim().max(100).optional(),
  performerId: z.string().trim().max(128).optional(),
  fromDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export const loginLogQuery = paginationSchema(["createdAt"]).extend({
  status: z.enum(["ALL", "SUCCESS", "FAILED", "LOCKED"]).default("ALL"),
  search: z.string().trim().max(100).optional(),
  fromDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export const systemLogQuery = paginationSchema(["createdAt"]).extend({
  level: z.enum(["ALL", "INFO", "WARNING", "ERROR", "CRITICAL"]).default("ALL"),
  source: z.string().trim().max(80).optional(),
  search: z.string().trim().max(100).optional(),
  fromDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});
