import type { ApiUser } from "../../services/api";

export type Page<T> = { items: T[]; total: number };
export type RecentUser = ApiUser & { createdAt: string; name?: string };
export type Audit = { id: string; action: string; targetType: string; createdAt: string };
export type OperationsOverview = {
  uptimeSeconds: number;
  mailJobs: Record<string, number>;
  configuration: { email: boolean; encryption: boolean; google: boolean; media: boolean };
  database?: string;
  api?: string;
};

export const metricRoutes = [
  "/admin/users?limit=1",
  "/admin/users?limit=1&status=ACTIVE",
  "/admin/users?limit=1&status=PENDING_VERIFICATION",
  "/admin/users?limit=1&status=SUSPENDED",
  "/admin/support?limit=1&status=OPEN",
  "/admin/support?limit=1&status=IN_PROGRESS",
  "/admin/content?limit=1&kind=ARTICLE&status=PUBLISHED",
] as const;

export type Snapshot = {
  counts: number[];
  users: RecentUser[];
  audit: Audit[];
  uptimeSeconds: number;
  outboxJobs: Record<string, number>;
  configuration: { email: boolean; encryption: boolean; google: boolean; media: boolean } | null;
  fetchedAt: string;
};

// In-memory cache to prevent 429 Rate Limiting on repeated navigations
export let cachedSnapshot: Snapshot | null = null;
export let lastFetchTimestamp = 0;
export const CACHE_TTL_MS = 30000; // 30s cache

export function updateSnapshotCache(snapshot: Snapshot) {
  cachedSnapshot = snapshot;
  lastFetchTimestamp = Date.now();
}

export function getActionLabel(action: string, isEn: boolean): { title: string; icon: "users" | "settings" | "file-text" | "life-buoy" | "shield" } {
  switch (action) {
    case "AUTH_LOGIN":
    case "AUTH_LOGIN_GOOGLE":
      return { title: isEn ? "User Logged In" : "Đăng nhập hệ thống", icon: "users" };
    case "AUTH_REGISTER":
    case "AUTH_REGISTER_GOOGLE":
      return { title: isEn ? "New Account Registered" : "Đăng ký tài khoản mới", icon: "users" };
    case "AUTH_VERIFY_EMAIL":
      return { title: isEn ? "Email Verified" : "Xác minh email thành công", icon: "shield" };
    case "ACCOUNT_UPDATED":
    case "ACCOUNT_AVATAR_UPDATED":
      return { title: isEn ? "Account Profile Updated" : "Cập nhật hồ sơ tài khoản", icon: "settings" };
    case "PROFILE_UPDATED":
    case "ONBOARDING_COMPLETED":
      return { title: isEn ? "Financial Profile Updated" : "Cập nhật hồ sơ tài chính", icon: "settings" };
    case "CONTENT_CREATED":
    case "CONTENT_UPDATED":
      return { title: isEn ? "Article Published / Edited" : "Xuất bản bài viết kiến thức", icon: "file-text" };
    case "SUPPORT_CREATED":
    case "SUPPORT_REPLIED":
      return { title: isEn ? "Support Ticket Activity" : "Xử lý yêu cầu hỗ trợ", icon: "life-buoy" };
    case "ADMIN_USER_STATUS":
      return { title: isEn ? "User Status Changed" : "Điều chỉnh trạng thái tài khoản", icon: "shield" };
    default:
      return { title: action, icon: "shield" };
  }
}
