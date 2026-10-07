import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { Icon, type IconName } from "./ui";
import { useI18n } from "../i18n";
import { useRealtimeNotifications, type RealtimeNotification } from "../services/socket";

import { formatRelativeTime, getNotificationMeta } from "../utils/notifications";

interface NotificationDropdownProps {
  isAdmin?: boolean;
  align?: "left" | "right";
}

export function NotificationDropdown({ isAdmin = false, align = "right" }: NotificationDropdownProps) {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useRealtimeNotifications();

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const displayedNotifications = notifications.filter((n) =>
    activeTab === "unread" ? !n.readAt : true
  );

  const handleItemClick = async (notif: RealtimeNotification) => {
    if (!notif.readAt) {
      await markAsRead(notif.id);
    }
    setOpen(false);
    if (notif.path && notif.path !== "#") {
      navigate(notif.path);
    }
  };

  const allPageLink = isAdmin ? "/admin/settings/audit-log" : "/user/notifications";

  return (
    <div className="notif-dropdown-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`topbar-action-btn notif-bell-btn ${open ? "is-active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={language === "en" ? "Notifications" : "Thông báo"}
        aria-expanded={open}
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="notif-badge-pill" aria-label={`${unreadCount} unread`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`notif-dropdown-panel ${align === "left" ? "align-left" : "align-right"}`}
          role="region"
          aria-label={language === "en" ? "Notification Center" : "Trung tâm thông báo mini"}
        >
          {/* Header */}
          <div className="notif-panel-header">
            <div className="notif-panel-title-area">
              <h3 className="notif-panel-title">
                {language === "en" ? "Notification Center" : "Trung tâm thông báo"}
              </h3>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={() => void markAllAsRead()}
                title={language === "en" ? "Mark all as read" : "Đánh dấu tất cả đã đọc"}
              >
                <Icon name="check" size="small" />
                <span>{language === "en" ? "Mark all read" : "Đọc tất cả"}</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="notif-tabs-bar">
            <button
              type="button"
              className={`notif-tab-item ${activeTab === "all" ? "is-selected" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              <span>{language === "en" ? "All" : "Tất cả"}</span>
              <span className="notif-tab-counter">{notifications.length}</span>
            </button>
            <button
              type="button"
              className={`notif-tab-item ${activeTab === "unread" ? "is-selected" : ""}`}
              onClick={() => setActiveTab("unread")}
            >
              <span>{language === "en" ? "Unread" : "Chưa đọc"}</span>
              {unreadCount > 0 && <span className="notif-tab-badge">{unreadCount}</span>}
            </button>
          </div>

          {/* List Area */}
          <div className="notif-list-container">
            {displayedNotifications.length === 0 ? (
              <div className="notif-empty-state">
                <div className="notif-empty-icon">
                  <Icon name="bell" size="large" />
                </div>
                <p className="notif-empty-title">
                  {activeTab === "unread"
                    ? (language === "en" ? "No unread notifications" : "Bạn không có thông báo chưa đọc nào")
                    : (language === "en" ? "No notifications yet" : "Chưa có thông báo nào")}
                </p>
                <span className="notif-empty-sub">
                  {language === "en"
                    ? "System updates and security alerts will appear here in real-time."
                    : "Cập nhật hệ thống và phản hồi sẽ đồng bộ tức thời tại đây."}
                </span>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const isUnread = !item.readAt;
                const { icon, tone, tagEn, tagVi } = getNotificationMeta(item.title, item.message);

                return (
                  <div
                    key={item.id}
                    className={`notif-item-card ${isUnread ? "is-unread" : "is-read"} ${
                      item.isNew ? "is-fresh-pulse" : ""
                    }`}
                    onClick={() => void handleItemClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        void handleItemClick(item);
                      }
                    }}
                  >
                    <div className={`notif-icon-bubble ${tone}`}>
                      <Icon name={icon} size="small" />
                    </div>

                    <div className="notif-body-col">
                      <div className="notif-body-row-top">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                          <span className="notif-tag-chip">{language === "en" ? tagEn : tagVi}</span>
                          <span className="notif-item-title">{item.title}</span>
                        </div>
                        {isUnread && <span className="notif-unread-dot" />}
                      </div>
                      <p className="notif-item-msg">{item.message}</p>
                      <div className="notif-meta-bar">
                        <span className="notif-timestamp">
                          {formatRelativeTime(item.createdAt, language === "en")}
                        </span>
                        {isUnread && (
                          <button
                            type="button"
                            className="notif-quick-read-btn"
                            title={language === "en" ? "Mark as read" : "Đánh dấu đã đọc"}
                            onClick={(e) => {
                              e.stopPropagation();
                              void markAsRead(item.id);
                            }}
                          >
                            <Icon name="check" size="small" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          <div className="notif-panel-footer">
            <Link
              to={allPageLink}
              className="notif-view-all-link"
              onClick={() => setOpen(false)}
            >
              <span>{language === "en" ? "View full hub" : "Xem toàn bộ"}</span>
              <Icon name="chevron-right" size="small" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
