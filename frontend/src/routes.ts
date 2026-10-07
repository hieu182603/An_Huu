import type { IconName } from "./components/ui";

export type NavigationItem = {
  path: string;
  label: string;
  icon: IconName;
  children?: NavigationItem[];
};

export const settingsSubNavigation: NavigationItem[] = [
  { path: "/admin/settings/general", label: "Cài đặt chung", icon: "settings" },
  { path: "/admin/settings/security", label: "Bảo mật & truy cập", icon: "shield" },
  { path: "/admin/settings/notifications", label: "Thông báo", icon: "bell" },
  { path: "/admin/settings/logs", label: "Nhật ký hệ thống", icon: "file-text" },
];

export const adminNavigation: NavigationItem[] = [
  { path: "/admin/dashboard", label: "Tổng quan", icon: "grid" },
  { path: "/admin/users", label: "Người dùng", icon: "users" },
  { path: "/admin/support", label: "Hỗ trợ & Ticket", icon: "life-buoy" },
  { path: "/admin/partners", label: "Đối tác & Sản phẩm", icon: "briefcase" },
  { path: "/admin/financial-config", label: "Cấu hình tài chính", icon: "target" },
  { path: "/admin/legal-rules", label: "Quản trị luật BHXH", icon: "shield" },
  { path: "/admin/content", label: "Quản lý nội dung", icon: "file-text" },
  { path: "/admin/ai", label: "Trợ lý AI & Tri thức", icon: "sparkles" },
  { path: "/admin/reports", label: "Báo cáo", icon: "chart" },
  {
    path: "/admin/settings",
    label: "Cấu hình hệ thống",
    icon: "settings",
    children: settingsSubNavigation,
  },
];

// Deprecated alias for backward compatibility
export const settingsNavigation = settingsSubNavigation;
