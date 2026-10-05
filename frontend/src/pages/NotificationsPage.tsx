import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card } from "../components/ui";
import { authenticatedRequest } from "../services/api";
import { useI18n } from "../i18n";

type Notification = {
  id: string;
  title: string;
  message: string;
  path: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const { language } = useI18n();
  const [data, setData] = useState<{ items: Notification[]; total: number; unread: number; limit: number } | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    authenticatedRequest<{ items: Notification[]; total: number; unread: number; limit: number }>(`/me/notifications?page=${page}&limit=20`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : (language === "en" ? "Failed to load notifications." : "Không thể tải thông báo."));
      });
    return () => {
      active = false;
    };
  }, [page, reload, language]);

  const read = async (id?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(id ? `/me/notifications/${id}/read` : "/me/notifications/read-all", {});
      setReload((v) => v + 1);
      window.dispatchEvent(new Event("anhuu:notifications-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : (language === "en" ? "Could not update notification." : "Không thể cập nhật thông báo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="phase-eight-page">
      <div className="admin-page-header">
        <div>
          <h1>{language === "en" ? "Notifications" : "Thông báo"}</h1>
          <p>
            {data
              ? (language === "en" ? `${data.unread} unread notifications` : `${data.unread} thông báo chưa đọc`)
              : (language === "en" ? "Updates on your account and service requests." : "Cập nhật về tài khoản và yêu cầu của bạn.")}
          </p>
        </div>
        <Button variant="primary" loading={busy} disabled={!data?.unread} onClick={() => void read()}>
          {language === "en" ? "Mark all as read" : "Đánh dấu tất cả đã đọc"}
        </Button>
      </div>

      {error && (
        <Alert
          tone="danger"
          title={language === "en" ? "Could not complete request" : "Chưa thể hoàn tất"}
        >
          {error}
          <Button onClick={() => setReload((v) => v + 1)}>{language === "en" ? "Retry" : "Thử lại"}</Button>
        </Alert>
      )}

      {!data && !error && <p role="status">{language === "en" ? "Loading notifications..." : "Đang tải thông báo…"}</p>}

      {data && (
        <>
          {data.items.map((n) => (
            <Card key={n.id}>
              <Badge tone={n.readAt ? "neutral" : "info"}>
                {n.readAt ? (language === "en" ? "Read" : "Đã đọc") : (language === "en" ? "Unread" : "Chưa đọc")}
              </Badge>
              <h2>{n.title}</h2>
              <p>{n.message}</p>
              <small>{new Date(n.createdAt).toLocaleString(language === "en" ? "en-US" : "vi-VN")}</small>
              <div className="account-save-row">
                {n.path.startsWith("/user/") && (
                  <Link to={n.path}>{language === "en" ? "View details" : "Xem chi tiết"}</Link>
                )}
                {!n.readAt && (
                  <Button disabled={busy} onClick={() => void read(n.id)}>
                    {language === "en" ? "Mark as read" : "Đánh dấu đã đọc"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {!data.items.length && <Card>{language === "en" ? "You have no notifications." : "Bạn chưa có thông báo."}</Card>}
          <div className="account-save-row">
            <Button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
              {language === "en" ? "Previous" : "Trang trước"}
            </Button>
            <span>{language === "en" ? `Page ${page}` : `Trang ${page}`}</span>
            <Button disabled={page * data.limit >= data.total} onClick={() => setPage((v) => v + 1)}>
              {language === "en" ? "Next" : "Trang sau"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
