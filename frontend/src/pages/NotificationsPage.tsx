import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Icon } from "../components/ui";
import { useI18n } from "../i18n";
import { useRealtimeNotifications } from "../services/socket";
import { getNotificationMeta } from "../utils/notifications";
import "./notifications.css";

export default function NotificationsPage() {
  const { language, formatDate } = useI18n();
  const isEn = language === "en";

  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  } = useRealtimeNotifications();

  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "support" | "security">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Filter tab
      if (activeFilter === "unread" && item.readAt) return false;
      const lower = `${item.title} ${item.message}`.toLowerCase();
      if (activeFilter === "support" && !lower.includes("hỗ trợ") && !lower.includes("support") && !lower.includes("ticket")) {
        return false;
      }
      if (activeFilter === "security" && !lower.includes("bảo mật") && !lower.includes("mật khẩu") && !lower.includes("đăng nhập")) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(query) || item.message.toLowerCase().includes(query);
      }
      return true;
    });
  }, [notifications, activeFilter, searchQuery]);

  const handleMarkAllAsRead = async () => {
    try {
      setBusyAction(true);
      await markAllAsRead();
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="notif-hub-container" style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* Page Heading matching Demo */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 8px" }}>
          {isEn ? "Scheduled Reminders" : "Nhắc việc định kỳ"}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--muted, #456B91)", margin: 0 }}>
          {isEn
            ? "Notifications and reminders to help you know what to do next."
            : "Các thông báo hỗ trợ giúp bạn biết việc gì cần làm tiếp."}
        </p>
      </div>

      {/* Main Card */}
      <section className="card" style={{ background: "#ffffff", border: "1px solid var(--border, #D0E4FE)", borderRadius: "16px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--navy, #052659)", margin: 0 }}>
            {isEn ? "Notifications Box" : "Hộp thông báo"}
          </h2>
          {unreadCount > 0 && (
            <span style={{ background: "#E8F2FE", color: "#334DAF", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600 }}>
              {unreadCount} {isEn ? "unread" : "chưa đọc"}
            </span>
          )}
        </div>

        <div style={{ marginBottom: "24px" }}>
          <button
            type="button"
            className="account-btn account-btn-secondary"
            onClick={handleMarkAllAsRead}
            disabled={busyAction || notifications.length === 0}
            style={{
              padding: "9px 16px",
              background: "#ffffff",
              border: "1px solid #CBD5E1",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--navy, #052659)",
              cursor: notifications.length === 0 ? "not-allowed" : "pointer",
              opacity: notifications.length === 0 ? 0.6 : 1
            }}
          >
            {isEn ? "Mark all as read" : "Đánh dấu tất cả đã đọc"}
          </button>
        </div>

        {/* Notifications list or empty state */}
        {notifications.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {notifications.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: "16px 20px",
                  background: item.readAt ? "#F8FAFC" : "#F0F7FF",
                  border: "1px solid",
                  borderColor: item.readAt ? "#E2E8F0" : "#BFDBFE",
                  borderRadius: "10px",
                  gap: "16px"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ color: item.readAt ? "#94A3B8" : "#2563EB", fontSize: "12px" }}>
                      {item.readAt ? "✓" : "●"}
                    </span>
                    <strong style={{ fontSize: "15px", color: "var(--navy, #052659)" }}>{item.title}</strong>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "13.5px", color: "#475569" }}>{item.message}</p>
                </div>
                {!item.readAt && (
                  <button
                    type="button"
                    onClick={() => markAsRead(item.id)}
                    style={{ background: "transparent", border: 0, color: "#334DAF", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {isEn ? "Read" : "Đã đọc"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy, #052659)", margin: "0 0 8px" }}>
              {isEn ? "No notifications" : "Chưa có thông báo"}
            </h3>
            <p style={{ fontSize: "14px", color: "var(--muted, #64748B)", margin: 0 }}>
              {isEn ? "Save or update a plan to see session reminders appear." : "Lưu hoặc cập nhật kế hoạch để thấy nhắc việc xuất hiện."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
