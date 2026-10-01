import type { IconName } from "./components/ui";

type NavigationItem = { path: string; label: string; icon: IconName };

export const adminNavigation: NavigationItem[] = [
  { path: "/admin/dashboard", label: "Tổng quan", icon: "grid" },
  { path: "/admin/users", label: "Người dùng", icon: "users" },
  { path: "/admin/consultations", label: "Tư vấn & Lịch hẹn", icon: "message" },
  { path: "/admin/content", label: "Quản lý nội dung", icon: "file-text" },
  { path: "/admin/partners", label: "Đối tác & Sản phẩm", icon: "briefcase" },
  { path: "/admin/ai", label: "Trợ lý AI & Tri thức", icon: "sparkles" },
  { path: "/admin/financial-config", label: "Cấu hình tài chính", icon: "target" },
  { path: "/admin/support", label: "Hỗ trợ & Ticket", icon: "life-buoy" },
  { path: "/admin/reports", label: "Báo cáo", icon: "chart" },
  { path: "/admin/settings", label: "Cấu hình hệ thống", icon: "settings" },
];

export const settingsNavigation: NavigationItem[] = [
  { path: "/admin/settings/general", label: "Cài đặt chung", icon: "settings" },
  { path: "/admin/settings/integrations", label: "Tích hợp", icon: "briefcase" },
  { path: "/admin/settings/notifications", label: "Thông báo", icon: "bell" },
  { path: "/admin/settings/privacy", label: "Quyền riêng tư", icon: "info" },
  { path: "/admin/settings/audit-log", label: "Nhật ký kiểm toán", icon: "file-text" },
];
