import type { IconName } from "../components/ui";

export function formatRelativeTime(dateString: string, isEn: boolean): string {
  try {
    const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diffSec < 45) return isEn ? "Just now" : "Vừa xong";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return isEn ? `${mins}m ago` : `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return isEn ? `${hours}h ago` : `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return isEn ? `${days}d ago` : `${days} ngày trước`;
    return new Date(dateString).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export interface NotificationMeta {
  icon: IconName;
  tone: string;
  tagEn: string;
  tagVi: string;
}

export function getNotificationMeta(title: string, message: string): NotificationMeta {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes("hỗ trợ") || text.includes("support") || text.includes("yêu cầu") || text.includes("ticket")) {
    return { icon: "life-buoy", tone: "accent-sky", tagEn: "Support & Community", tagVi: "Hỗ trợ & Cộng đồng" };
  }
  if (text.includes("bảo mật") || text.includes("mật khẩu") || text.includes("đăng nhập") || text.includes("security")) {
    return { icon: "shield", tone: "accent-emerald", tagEn: "Security & Account", tagVi: "Bảo mật & Tài khoản" };
  }
  if (text.includes("cảnh báo") || text.includes("khẩn") || text.includes("lỗi") || text.includes("alert")) {
    return { icon: "alert", tone: "accent-amber", tagEn: "System Alert", tagVi: "Cảnh báo hệ thống" };
  }
  if (text.includes("kế hoạch") || text.includes("hưu trí") || text.includes("báo cáo") || text.includes("plan") || text.includes("bhxh")) {
    return { icon: "file-text", tone: "accent-indigo", tagEn: "Retirement Plan", tagVi: "Kế hoạch hưu trí" };
  }
  if (text.includes("ai") || text.includes("tự động") || text.includes("gợi ý")) {
    return { icon: "sparkles", tone: "accent-purple", tagEn: "AI Advisor", tagVi: "Trợ lý AI" };
  }
  return { icon: "bell", tone: "accent-navy", tagEn: "Notification", tagVi: "Thông báo" };
}
