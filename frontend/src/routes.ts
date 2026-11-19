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

export const billingSubNavigation: NavigationItem[] = [
  { path: "/admin/billing", label: "Tổng quan", icon: "chart" },
  { path: "/admin/billing/statements", label: "Kỳ phí", icon: "file-text" },
  { path: "/admin/billing/transactions", label: "Giao dịch", icon: "wallet" },
  { path: "/admin/billing/alerts", label: "Cảnh báo & đối soát", icon: "alert" },
  { path: "/admin/billing/fee-schedules", label: "Biểu phí", icon: "settings" },
  { path: "/admin/billing/overrides", label: "Điều chỉnh theo người dùng", icon: "users" },
];

export const adminNavigation: NavigationItem[] = [
  { path: "/admin/dashboard", label: "Tổng quan", icon: "grid" },
  { path: "/admin/users", label: "Người dùng", icon: "users" },
  { path: "/admin/investment-roles", label: "Phân quyền đầu tư", icon: "key" },
  { path: "/admin/support", label: "Hỗ trợ & Ticket", icon: "life-buoy" },
  { path: "/admin/partners", label: "Đối tác & Sản phẩm", icon: "briefcase" },
  { path: "/admin/financial-config", label: "Cấu hình tài chính", icon: "target" },
  { path: "/admin/legal-rules", label: "Quản trị luật BHXH", icon: "shield" },
  { path: "/admin/content", label: "Quản lý nội dung", icon: "file-text" },
  { path: "/admin/ai", label: "Trợ lý AI & Tri thức", icon: "sparkles" },
  { path: "/admin/reports", label: "Báo cáo", icon: "chart" },
  { path: "/admin/billing", label: "Thanh toán", icon: "wallet", children: billingSubNavigation },
  { path: "/admin/broadcast", label: "Gửi thông báo", icon: "megaphone" },
  { path: "/admin/operations", label: "Tình trạng hệ thống", icon: "activity" },
  {
    path: "/admin/settings",
    label: "Cấu hình hệ thống",
    icon: "settings",
    children: settingsSubNavigation,
  },
];

// Deprecated alias for backward compatibility
export const settingsNavigation = settingsSubNavigation;
