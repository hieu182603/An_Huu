import React, { createContext, useContext, useState, useCallback, useId, type ReactNode } from "react";
import "./notification.css";

export type NotificationTone = "error" | "danger" | "warning" | "success" | "info";

export interface NotificationCardProps {
  tone?: NotificationTone;
  title: string;
  children?: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  action?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

// ============================================================================
// ICONS CHUẨN XÁC THEO MẪU HÌNH VẼ
// ============================================================================

export function NotificationIcon({ tone }: { tone: NotificationTone }) {
  switch (tone) {
    case "error":
    case "danger":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3.25L21.5 19.75H2.5L12 3.25Z"
            fill="#A14D47"
            stroke="#A14D47"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M12 8.5V13"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16.5" r="1.1" fill="#FFFFFF" />
        </svg>
      );

    case "warning":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#D9A85E" />
          <path
            d="M12 7.5V12.5"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="1.1" fill="#FFFFFF" />
        </svg>
      );

    case "success":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#486D53" />
          <path
            d="M8 12.2L10.7 14.8L16.2 9.2"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "info":
    default:
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#365D6C" />
          <circle cx="12" cy="8" r="1.1" fill="#FFFFFF" />
          <path
            d="M12 11.5V16"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

// ============================================================================
// COMPONENT THÔNG BÁO DÙNG CHUNG (NOTIFICATION CARD / ALERT)
// ============================================================================

export function NotificationCard({
  tone = "info",
  title,
  children,
  description,
  onClose,
  action,
  className = "",
  style,
  id,
}: NotificationCardProps) {
  const content = children || description;
  const normalizedTone = tone === "danger" ? "error" : tone;
  const isAriaAlert = normalizedTone === "error" || normalizedTone === "warning";

  return (
    <div
      id={id}
      className={`ah-notification-card ah-notification-card--${normalizedTone} ${className}`.trim()}
      role={isAriaAlert ? "alert" : "status"}
      aria-live={isAriaAlert ? "assertive" : "polite"}
      style={style}
    >
      {/* Vòng tròn Icon nổi bật có bóng đổ màu tương ứng */}
      <div className="ah-notification-icon-disc">
        <NotificationIcon tone={normalizedTone} />
      </div>

      {/* Nội dung thông báo */}
      <div className="ah-notification-body">
        <h4 className="ah-notification-title">{title}</h4>
        {content && <p className="ah-notification-description">{content}</p>}
        {action && <div className="ah-notification-action">{action}</div>}
      </div>

      {/* Nút đóng góc phải trên */}
      {onClose && (
        <button
          type="button"
          className="ah-notification-close"
          onClick={onClose}
          aria-label="Đóng thông báo"
          title="Đóng"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// HỆ THỐNG TOAST NOTIFICATION REAL-TIME (CONTEXT & HOOK)
// ============================================================================

interface ToastItem {
  id: string;
  tone: NotificationTone;
  title: string;
  description?: ReactNode;
  duration?: number;
}

interface NotificationContextValue {
  showToast: (props: { tone: NotificationTone; title: string; description?: ReactNode; duration?: number }) => void;
  removeToast: (id: string) => void;
  notify: {
    error: (title: string, description?: ReactNode, duration?: number) => void;
    warning: (title: string, description?: ReactNode, duration?: number) => void;
    success: (title: string, description?: ReactNode, duration?: number) => void;
    info: (title: string, description?: ReactNode, duration?: number) => void;
  };
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      tone,
      title,
      description,
      duration = 5000,
    }: {
      tone: NotificationTone;
      title: string;
      description?: ReactNode;
      duration?: number;
    }) => {
      const id = "toast-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);
      const newToast: ToastItem = { id, tone, title, description, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const notify = {
    error: (title: string, description?: ReactNode, duration?: number) =>
      showToast({ tone: "error", title, description, duration }),
    warning: (title: string, description?: ReactNode, duration?: number) =>
      showToast({ tone: "warning", title, description, duration }),
    success: (title: string, description?: ReactNode, duration?: number) =>
      showToast({ tone: "success", title, description, duration }),
    info: (title: string, description?: ReactNode, duration?: number) =>
      showToast({ tone: "info", title, description, duration }),
  };

  return (
    <NotificationContext.Provider value={{ showToast, removeToast, notify }}>
      {children}

      {/* Container hiển thị các Toast nổi ở góc phải trên màn hình */}
      {toasts.length > 0 && (
        <aside className="ah-toast-container" aria-label="Thông báo hệ thống">
          {toasts.map((toast) => (
            <NotificationCard
              key={toast.id}
              tone={toast.tone}
              title={toast.title}
              description={toast.description}
              onClose={() => removeToast(toast.id)}
              className="ah-toast-item"
            />
          ))}
        </aside>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification phải được sử dụng bên trong NotificationProvider.");
  }
  return context;
}

// ============================================================================
// SHOWCASE COMPONENT (MẪU CHÍNH XÁC NHƯ HÌNH VẼ CỦA KHÁCH HÀNG)
// ============================================================================

export function NotificationShowcase() {
  const sampleDescription =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

  return (
    <section className="ah-notification-showcase" aria-label="Bộ sưu tập thông báo mẫu">
      <NotificationCard
        tone="error"
        title="This is error message"
        description={sampleDescription}
        onClose={() => console.log("Close Error")}
      />

      <NotificationCard
        tone="warning"
        title="This is warning message"
        description={sampleDescription}
        onClose={() => console.log("Close Warning")}
      />

      <NotificationCard
        tone="success"
        title="This is success message"
        description={sampleDescription}
        onClose={() => console.log("Close Success")}
      />

      <NotificationCard
        tone="info"
        title="This is informative message"
        description={sampleDescription}
        onClose={() => console.log("Close Info")}
      />
    </section>
  );
}
