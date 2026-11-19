import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Badge, Button, Modal } from "../../../components/ui";
import {
  REASON_MAX, REASON_MIN, STATEMENT_STATUS_LABEL, ORDER_STATUS_LABEL, billingErrorMessage, billingFieldErrors, markBillingDisabled,
  newIdempotencyKey, orderTone, statementTone, useBillingAvailability, userLabel,
  type AdminUserRef, type BillingPermissions, type OrderStatus, type StatementStatus,
} from "../../../services/adminBilling";
import "../admin-management.css";
import "../admin-users.css";
import "../admin-gaps.css";
import "./admin-billing.css";

export function usePerms(): BillingPermissions {
  const { availability } = useBillingAvailability();
  return availability.status === "ready" ? availability.permissions : { canOperate: false, canManageSchedules: false };
}

export const StatementBadge = ({ status }: { status: StatementStatus }) => <Badge tone={statementTone(status)}>{STATEMENT_STATUS_LABEL[status]}</Badge>;
export const OrderBadge = ({ status }: { status: OrderStatus }) => <Badge tone={orderTone(status)}>{ORDER_STATUS_LABEL[status]}</Badge>;

export function UserCell({ user }: { user: AdminUserRef }) {
  return user
    ? <div className="ab-user"><strong>{user.fullName}</strong><small>{user.email}</small></div>
    : <div className="ab-user"><strong>—</strong><small>Tài khoản đã xóa</small></div>;
}

export const userText = userLabel;

/** Small line shown where a write button is hidden because the admin lacks the grant. */
export function PermissionHint({ need }: { need: "OPERATIONS" | "SYSTEM_ADMIN" }) {
  return <p className="ab-note">Cần quyền {need} — liên hệ quản trị hệ thống.</p>;
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" title="Không tải được dữ liệu"
      action={onRetry ? <Button size="small" variant="secondary" onClick={onRetry}>Thử lại</Button> : undefined}>
      {message}
    </Alert>
  );
}

export function PageHeader({ kicker = "THANH TOÁN", title, description, children }: { kicker?: string; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="admin-page-header">
      <div><span>{kicker}</span><h1>{title}</h1><p>{description}</p></div>
      {children}
    </div>
  );
}

export function FieldError({ text }: { text?: string }) {
  return text ? <p className="ab-field-error" role="alert">{text}</p> : null;
}

/** Required reason / note (>= 10 characters after trimming, counted live). */
export function ReasonField({ value, onChange, error, disabled, label = "Lý do (bắt buộc)", placeholder = "Vì sao cần thao tác này? Nội dung được lưu vào nhật ký." }: {
  value: string; onChange: (value: string) => void; error?: string; disabled?: boolean; label?: string; placeholder?: string;
}) {
  const length = value.trim().length;
  const bad = length > REASON_MAX || (value.length > 0 && length < REASON_MIN);
  return (
    <div className={`form-field ${error ? "has-error" : ""}`}>
      <label className="field-label" htmlFor="ab-reason">{label}</label>
      <textarea id="ab-reason" rows={3} value={value} disabled={disabled} placeholder={placeholder} maxLength={REASON_MAX + 50}
        aria-invalid={bad || Boolean(error)} onChange={(event) => onChange(event.target.value)} />
      <div className={`ab-counter ${bad ? "is-bad" : ""}`}>
        <span>Tối thiểu {REASON_MIN} ký tự, tối đa {REASON_MAX}.</span><span>{length}/{REASON_MAX}</span>
      </div>
      <FieldError text={error} />
    </div>
  );
}

export const reasonValid = (value: string) => { const length = value.trim().length; return length >= REASON_MIN && length <= REASON_MAX; };

type WriteDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Sentence that repeats the amount / target, e.g. "Ghi nhận 417.000đ cho kỳ 11/2026 của an@khach.test". */
  summary: ReactNode;
  summaryTone?: "default" | "danger";
  warning?: ReactNode;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
  reasonLabel?: string;
  reasonField?: "reason" | "note";
  /** Extra validity (amount, reference …) besides the reason. */
  extraValid?: boolean;
  /** Changes whenever the payload changes: the Idempotency-Key is renewed then. */
  signature?: string;
  wide?: boolean;
  errorContext?: "reconcile";
  children?: (fieldErrors: Record<string, string>, busy: boolean) => ReactNode;
  onSubmit: (ctx: { reason: string; key: string }) => Promise<void>;
};

/** Every admin write goes through this: reason, confirmation text, one in-flight request, mapped errors. */
export function WriteDialog(props: WriteDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={props.open} title={props.title} className={props.wide ? "ab-modal-wide" : "ab-modal"} onClose={() => { if (!busy) props.onClose(); }}>
      <WriteForm {...props} busy={busy} setBusy={setBusy} />
    </Modal>
  );
}

function WriteForm({ summary, summaryTone, warning, confirmLabel, confirmTone = "primary", reasonLabel, reasonField = "reason", extraValid = true, signature = "", errorContext, children, onSubmit, onClose, busy, setBusy }:
  WriteDialogProps & { busy: boolean; setBusy: (busy: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // New key per dialog opening; kept for a resend after a network failure; renewed when the content changes.
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const sig = `${signature}|${reason.trim()}`;
  if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey() };

  const valid = reasonValid(reason) && extraValid;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    setFieldErrors({});
    try {
      await onSubmit({ reason: reason.trim(), key: keyRef.current!.key });
    } catch (err) {
      if (markBillingDisabled(err)) { onClose(); return; }
      setError(billingErrorMessage(err, errorContext));
      setFieldErrors(billingFieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ab-form" onSubmit={submit} aria-busy={busy}>
      <div className={`ab-summary ${summaryTone === "danger" ? "is-danger" : ""}`} role="note">{summary}</div>
      {warning}
      {children?.(fieldErrors, busy)}
      <ReasonField value={reason} onChange={setReason} disabled={busy} label={reasonLabel} error={fieldErrors[reasonField]} />
      {error && <p className="ab-form-error" role="alert">{error}</p>}
      <div className="ab-footer">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy bỏ</Button>
        <Button type="submit" variant={confirmTone} loading={busy} disabled={!valid}>{confirmLabel}</Button>
      </div>
    </form>
  );
}

/** Calm state for 503 BILLING_DISABLED. */
export function BillingDisabledState() {
  return (
    <div className="admin-page ab-page">
      <div className="card ab-state" role="status">
        <h2>Chức năng phí dịch vụ chưa được bật</h2>
        <p>Hệ thống đang tắt tính năng thu phí dịch vụ (BILLING_ENABLED). Khi được bật, các trang trong nhóm Thanh toán sẽ hoạt động trở lại; không có dữ liệu nào bị mất.</p>
      </div>
    </div>
  );
}
