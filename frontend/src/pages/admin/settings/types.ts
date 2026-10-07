export type GeneralSettings = {
  systemName: string;
  defaultLanguage: "Tiếng Việt" | "English" | "vi" | "en";
  operatingTimezone: string;
  supportEmail: string;
  maintenanceMode: boolean;
};

export type SecuritySettings = {
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  accountLockMinutes: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSpecial: boolean;
  admin2faRequired: boolean;
};

export type NotificationSettings = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  smsEnabled: boolean;
  notifyAccount: boolean;
  notifySupport: boolean;
  notifyFinancial: boolean;
  notifySystem: boolean;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  performerId: string | null;
  performerName: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  performer?: { id: string; email: string; fullName: string; role: string } | null;
};

export type LoginLogEntry = {
  id: string;
  userId: string | null;
  identifier: string;
  status: "SUCCESS" | "FAILED" | "LOCKED";
  ipAddress: string | null;
  userAgent: string | null;
  failureReason: string | null;
  createdAt: string;
  user?: { id: string; email: string; fullName: string; role: string } | null;
};

export type SystemLogEntry = {
  id: string;
  level: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source: string;
  message: string;
  path: string | null;
  statusCode: number | null;
  traceId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export const formatDate = (isoString: string | null, isEn: boolean) => {
  if (!isoString) return isEn ? "Not recorded" : "Chưa ghi nhận";
  try {
    return new Date(isoString).toLocaleString(isEn ? "en-US" : "vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
};

export const actionLabelsVi: Record<string, string> = {
  UPDATE_SYSTEM_SETTINGS: "Cập nhật cài đặt chung",
  UPDATE_SECURITY_SETTINGS: "Cập nhật bảo mật & truy cập",
  UPDATE_NOTIFICATION_SETTINGS: "Cập nhật cấu hình thông báo",
  AUTH_LOGIN: "Đăng nhập",
  AUTH_LOGOUT: "Đăng xuất",
  AUTH_REGISTER: "Đăng ký tài khoản",
  AUTH_VERIFY_EMAIL: "Xác minh email",
  AUTH_RESET_PASSWORD: "Khôi phục mật khẩu",
  AUTH_CHANGE_PASSWORD: "Đổi mật khẩu",
  AUTH_LOGOUT_ALL: "Đăng xuất tất cả thiết bị",
  ADMIN_USER_STATUS: "Đổi trạng thái tài khoản",
  CONTENT_CREATED: "Tạo bài viết",
  CONTENT_UPDATED: "Sửa bài viết",
  SUPPORT_CREATED: "Tạo yêu cầu hỗ trợ",
  SUPPORT_REPLIED: "Phản hồi hỗ trợ",
  SUPPORT_STATUS: "Đổi trạng thái hỗ trợ",
  PARTNER_CREATED: "Thêm đối tác",
  PARTNER_UPDATED: "Sửa đối tác",
  PRODUCT_CREATED: "Thêm sản phẩm đối tác",
  PRODUCT_UPDATED: "Sửa sản phẩm đối tác",
};

export const actionLabelsEn: Record<string, string> = {
  UPDATE_SYSTEM_SETTINGS: "Update General Settings",
  UPDATE_SECURITY_SETTINGS: "Update Security Settings",
  UPDATE_NOTIFICATION_SETTINGS: "Update Notification Settings",
  AUTH_LOGIN: "User Log In",
  AUTH_LOGOUT: "User Log Out",
  AUTH_REGISTER: "User Registration",
  AUTH_VERIFY_EMAIL: "Email Verified",
  AUTH_RESET_PASSWORD: "Password Reset",
  AUTH_CHANGE_PASSWORD: "Password Changed",
  AUTH_LOGOUT_ALL: "Logged Out All Devices",
  ADMIN_USER_STATUS: "User Status Changed",
  CONTENT_CREATED: "Content Created",
  CONTENT_UPDATED: "Content Updated",
  SUPPORT_CREATED: "Support Ticket Created",
  SUPPORT_REPLIED: "Support Ticket Replied",
  SUPPORT_STATUS: "Support Status Changed",
  PARTNER_CREATED: "Partner Created",
  PARTNER_UPDATED: "Partner Updated",
  PRODUCT_CREATED: "Partner Product Created",
  PRODUCT_UPDATED: "Partner Product Updated",
};
