import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Icon } from "../components/ui";
import { useI18n } from "../i18n";
import { useRealtimeNotifications } from "../services/socket";
import { getNotificationMeta } from "../utils/notifications";

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
    <div className="notif-hub-container">
      {/* Hero Banner */}
      <div className="notif-hub-header-card">
        <div className="notif-hub-header-title-box">
          <h1>{isEn ? "Notification Center" : "Trung tâm thông báo"}</h1>
          <p>
            {isEn
              ? "Stay up-to-date with your retirement plan, financial alerts, and account security activities."
              : "Cập nhật liên tục tiến trình kế hoạch hưu trí, các biến động tài chính và an toàn tài khoản của bạn."}
          </p>
        </div>

        <div className="notif-hub-header-actions">
          {unreadCount > 0 && (
            <button
              type="button"
              className="button button-primary"
              onClick={handleMarkAllAsRead}
              disabled={busyAction}
            >
              <Icon name="check" size="small" />
              <span>{isEn ? "Mark all as read" : "Đánh dấu tất cả đã đọc"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="notif-hub-stat-row">
        <div className="notif-hub-stat-card">
          <div className="notif-stat-icon-wrap navy">
            <Icon name="bell" size="default" />
          </div>
          <div className="notif-stat-content">
            <h4>{isEn ? "Total Messages" : "Tổng thông báo"}</h4>
            <div className="stat-val">{notifications.length}</div>
          </div>
        </div>

        <div className="notif-hub-stat-card">
          <div className="notif-stat-icon-wrap sky">
            <Icon name="info" size="default" />
          </div>
          <div className="notif-stat-content">
            <h4>{isEn ? "Unread Messages" : "Chưa đọc"}</h4>
            <div className="stat-val" style={{ color: unreadCount > 0 ? "#0284c7" : "#021024" }}>
              {unreadCount}
            </div>
          </div>
        </div>

        <div className="notif-hub-stat-card">
          <div className="notif-stat-icon-wrap emerald">
            <Icon name="check" size="default" />
          </div>
          <div className="notif-stat-content">
            <h4>{isEn ? "Read Messages" : "Đã đọc"}</h4>
            <div className="stat-val" style={{ color: "#059669" }}>
              {Math.max(0, notifications.length - unreadCount)}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="notif-hub-toolbar">
        <div className="notif-hub-filter-tabs">
          <button
            type="button"
            className={`notif-hub-tab-btn ${activeFilter === "all" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            {isEn ? "All" : "Tất cả"} ({notifications.length})
          </button>
          <button
            type="button"
            className={`notif-hub-tab-btn ${activeFilter === "unread" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("unread")}
          >
            {isEn ? "Unread" : "Chưa đọc"} {unreadCount > 0 ? `(${unreadCount})` : ""}
          </button>
          <button
            type="button"
            className={`notif-hub-tab-btn ${activeFilter === "support" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("support")}
          >
            {isEn ? "Support & Tickets" : "Hỗ trợ & Yêu cầu"}
          </button>
          <button
            type="button"
            className={`notif-hub-tab-btn ${activeFilter === "security" ? "is-active" : ""}`}
            onClick={() => setActiveFilter("security")}
          >
            {isEn ? "Security & Account" : "Bảo mật"}
          </button>
        </div>

        <div className="notif-hub-search-box">
          <span className="search-icon">
            <Icon name="search" size="small" />
          </span>
          <input
            type="text"
            placeholder={isEn ? "Filter messages…" : "Lọc nội dung…"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Feed List */}
      <div className="notif-hub-feed-list">
        {loading && notifications.length === 0 && (
          <div className="notif-empty-state">
            <p className="notif-empty-title">{isEn ? "Loading notifications…" : "Đang tải thông báo…"}</p>
          </div>
        )}

        {!loading && filteredNotifications.length === 0 && (
          <div className="notif-empty-state" style={{ background: "#ffffff", borderRadius: "16px", padding: "48px 24px" }}>
            <div className="notif-empty-icon">
              <Icon name="bell" size="large" />
            </div>
            <p className="notif-empty-title">
              {activeFilter === "unread"
                ? (isEn ? "No unread notifications" : "Bạn không có thông báo chưa đọc nào")
                : (isEn ? "No notifications match your filter" : "Không có thông báo nào khớp bộ lọc")}
            </p>
            <span className="notif-empty-sub">
              {isEn
                ? "New updates from advisors and retirement calculators will appear here."
                : "Các thông báo và cập nhật mới sẽ xuất hiện tại đây khi có phát sinh."}
            </span>
          </div>
        )}

        {filteredNotifications.map((n) => {
          const isUnread = !n.readAt;
          const { tagEn, tagVi, icon, tone } = getNotificationMeta(n.title, n.message);

          return (
            <div
              key={n.id}
              className={`notif-hub-feed-card ${isUnread ? "is-unread" : "is-read"}`}
            >
              <div className={`notif-icon-bubble ${tone}`} style={{ width: "42px", height: "42px" }}>
                <Icon name={icon} size="default" />
              </div>

              <div className="notif-hub-feed-content">
                <div className="notif-hub-feed-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "#5483B3",
                        background: "rgba(193, 232, 255, 0.4)",
                        padding: "2px 8px",
                        borderRadius: "6px",
                      }}
                    >
                      {isEn ? tagEn : tagVi}
                    </span>
                    <h3 className="notif-hub-feed-title">{n.title}</h3>
                  </div>
                  <span className="notif-hub-feed-date">
                    {formatDate(n.createdAt, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="notif-hub-feed-body">{n.message}</p>

                <div className="notif-hub-feed-actions">
                  {n.path && n.path !== "#" && (
                    <Link to={n.path} className="notif-hub-view-btn">
                      <span>{isEn ? "Open Page" : "Xem chi tiết"}</span>
                      <Icon name="chevron-right" size="small" />
                    </Link>
                  )}

                  {isUnread && (
                    <button
                      type="button"
                      className="notif-hub-mark-btn"
                      onClick={() => void markAsRead(n.id)}
                    >
                      <Icon name="check" size="small" />
                      <span>{isEn ? "Mark read" : "Đánh dấu đã đọc"}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
