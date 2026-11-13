import { useState, type FormEvent } from "react";
import "./admin-management.css";
import "./admin-users.css";
import "./admin-gaps.css";
import { Alert, Badge, Button, Card, Icon, Input, Modal, Textarea } from "../../components/ui";
import { ApiError, authenticatedRequest } from "../../services/api";
import { useI18n } from "../../i18n";

const TITLE_MAX = 120;
const MESSAGE_MAX = 1000;
type BroadcastResult = { broadcasted: boolean; broadcastId: string; title: string; message: string; recipients: number; replayed: boolean };

/** RFC 4122 v4 UUID; crypto.randomUUID only exists in secure contexts. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function broadcastError(error: unknown, isEn: boolean): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : String(error);
  switch (error.code) {
    case "IDEMPOTENCY_CONFLICT": return isEn
      ? "This send key was already used for different content. Close the dialog and send again."
      : "Khóa gửi này đã dùng cho nội dung khác. Hãy đóng hộp thoại và gửi lại.";
    case "CONCURRENT_UPDATE": return isEn
      ? "The previous attempt is still being processed. Retry in a moment; no duplicate will be created."
      : "Lần gửi trước vẫn đang được xử lý. Hãy thử lại sau giây lát, hệ thống không tạo bản trùng.";
    case "FORBIDDEN": return isEn ? "Only administrators can send system notifications." : "Chỉ quản trị viên được gửi thông báo toàn hệ thống.";
    default: return error.message;
  }
}

export default function AdminBroadcastPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  // One key per send: kept across retries of the same content, replaced when the content changes or after success.
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const trimmedTitle = title.trim();
  const trimmedMessage = message.trim();
  const titleTooLong = trimmedTitle.length > TITLE_MAX;
  const messageTooLong = trimmedMessage.length > MESSAGE_MAX;
  const valid = trimmedTitle.length > 0 && trimmedMessage.length > 0 && !titleTooLong && !messageTooLong;

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setKey(null);
    setError("");
  };

  const openConfirm = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setResult(null);
    setKey((current) => current ?? newIdempotencyKey());
    setConfirming(true);
  };

  const send = async () => {
    if (busy || !valid) return;
    const sendKey = key ?? newIdempotencyKey();
    setKey(sendKey);
    setBusy(true);
    setError("");
    try {
      const data = await authenticatedRequest<BroadcastResult>("/admin/notifications/broadcast",
        { title: trimmedTitle, message: trimmedMessage }, "POST", { "Idempotency-Key": sendKey }, { timeoutMs: 60000 });
      setResult(data);
      setConfirming(false);
      setKey(null);
      setTitle("");
      setMessage("");
    } catch (err) {
      setError(broadcastError(err, isEn));
    } finally {
      setBusy(false);
    }
  };

  const preview = (
    <div className="ag-broadcast-preview" aria-label={isEn ? "Preview" : "Xem trước"}>
      <span className="ag-broadcast-preview-icon"><Icon name="bell" size="small" /></span>
      <div>
        <strong>{trimmedTitle || (isEn ? "Notification title" : "Tiêu đề thông báo")}</strong>
        <p>{trimmedMessage || (isEn ? "The message users will read." : "Nội dung người dùng sẽ đọc.")}</p>
        <small>{isEn ? "Just now · An Hưu" : "Vừa xong · An Hưu"}</small>
      </div>
    </div>
  );

  return (
    <div className="admin-page admin-management-page ag-broadcast-page">
      <div className="admin-page-header">
        <div>
          <span>{isEn ? "COMMUNICATION" : "TRUYỀN THÔNG"}</span>
          <h1>{isEn ? "System notification" : "Gửi thông báo toàn hệ thống"}</h1>
          <p>{isEn
            ? "The notification is saved for every active user, so people who are offline will see it next time they sign in."
            : "Thông báo được lưu cho mọi người dùng đang hoạt động, người đang offline sẽ thấy khi đăng nhập lại."}</p>
        </div>
      </div>

      {result && (
        <Alert tone={result.replayed ? "info" : "success"} onClose={() => setResult(null)}
          title={isEn ? `Sent to ${result.recipients} users` : `Đã gửi tới ${result.recipients} người dùng`}>
          {result.replayed
            ? (isEn ? "This send had already completed; the server returned the earlier result and did not send again." : "Lần gửi này đã hoàn tất trước đó; máy chủ trả lại kết quả cũ và không gửi thêm lần nữa.")
            : (isEn ? `“${result.title}” is now in each user's notification list.` : `“${result.title}” đã có trong danh sách thông báo của từng người dùng.`)}
        </Alert>
      )}

      <div className="ag-broadcast-layout">
        <Card className="ag-broadcast-form-card">
          <form className="ag-broadcast-form" onSubmit={openConfirm}>
            <div>
              <Input label={isEn ? "Title" : "Tiêu đề"} value={title} onChange={edit(setTitle)}
                placeholder={isEn ? "E.g.: Scheduled maintenance tonight" : "Ví dụ: Bảo trì hệ thống tối nay"}
                error={titleTooLong ? (isEn ? `At most ${TITLE_MAX} characters.` : `Tối đa ${TITLE_MAX} ký tự.`) : undefined} />
              <small className={`ag-counter ${titleTooLong ? "is-over" : ""}`} aria-live="polite">{trimmedTitle.length}/{TITLE_MAX}</small>
            </div>
            <div>
              <Textarea label={isEn ? "Message" : "Nội dung"} rows={6} value={message} onChange={edit(setMessage)}
                placeholder={isEn ? "What do users need to know?" : "Người dùng cần biết điều gì?"} />
              <small className={`ag-counter ${messageTooLong ? "is-over" : ""}`} aria-live="polite">{trimmedMessage.length}/{MESSAGE_MAX}</small>
            </div>
            <div className="ag-broadcast-actions">
              <Button type="submit" icon="megaphone" disabled={!valid}>{isEn ? "Review and send" : "Xem lại và gửi"}</Button>
            </div>
          </form>
        </Card>
        <Card className="ag-broadcast-preview-card">
          <h2>{isEn ? "Preview" : "Xem trước"}</h2>
          <p>{isEn ? "How the notification appears in the user's bell menu." : "Thông báo sẽ hiện như sau trong mục chuông của người dùng."}</p>
          {preview}
        </Card>
      </div>

      <Modal open={confirming} title={isEn ? "Send to all active users" : "Gửi tới tất cả người dùng đang hoạt động"}
        className="ag-confirm-modal" onClose={() => { if (!busy) setConfirming(false); }}>
        <div className="admin-user-status-form" aria-busy={busy}>
          <p>{isEn
            ? "Every ACTIVE user account will receive this notification. Administrators and locked or unverified accounts are not included. This cannot be undone."
            : "Mọi tài khoản người dùng đang hoạt động sẽ nhận thông báo này. Không gồm quản trị viên và tài khoản bị khóa hoặc chưa xác minh. Không thể hoàn tác."}</p>
          {preview}
          {busy && <p role="status">{isEn ? "Sending… this can take a few seconds with many users." : "Đang gửi… có thể mất vài giây khi có nhiều người dùng."}</p>}
          {error && (
            <p role="alert" className="admin-user-status-error">
              {error} {isEn ? "Retrying is safe: it reuses the same send key." : "Có thể thử lại an toàn: hệ thống dùng lại cùng khóa gửi."}
            </p>
          )}
          {key && <p className="ag-key-note"><Badge tone="neutral">Idempotency-Key</Badge> <code>{key}</code></p>}
          <div className="admin-user-status-footer">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>{isEn ? "Cancel" : "Hủy bỏ"}</Button>
            <Button icon="megaphone" loading={busy} onClick={send} disabled={!valid}>
              {error ? (isEn ? "Retry send" : "Thử gửi lại") : (isEn ? "Confirm send" : "Xác nhận gửi")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
