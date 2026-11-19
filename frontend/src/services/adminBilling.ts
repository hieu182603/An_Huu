import { useCallback, useEffect, useState } from "react";
import { ApiError, authenticatedBlobRequest, authenticatedRequest } from "./api";

/* ───────────────────────── Types (backend/docs/billing.openapi.yaml, "P3: admin API") ───────────────────────── */

export type StatementStatus = "ISSUED" | "PAID" | "OVERDUE" | "WAIVED" | "VOID";
export type OrderStatus = "PENDING" | "PAID" | "UNDERPAID" | "EXPIRED" | "CANCELLED";
export type ScheduleStatus = "DRAFT" | "PUBLISHED" | "SUPERSEDED";
export type OverrideKind = "DISCOUNT_PERCENT" | "FIXED_AMOUNT" | "WAIVE";
export type AlertType = "UNDERPAID" | "OVERPAID" | "EXTRA_TRANSFER";
export type AccountStatus = "TRIAL" | "ACTIVE" | "OVERDUE" | "STOPPED";

export type AdminUserRef = { email: string; fullName: string } | null;
export type Page<T> = { page: number; limit: number; total: number; items: T[] };

export type BillingPermissions = { canOperate: boolean; canManageSchedules: boolean };

export type AdminStatement = {
  id: string; userId: string; user: AdminUserRef; period: string; status: StatementStatus;
  baseAmountVnd: string; rawFeeVnd: string; scheduleFeeVnd: number;
  amountVnd: number; adjustedVnd: number; paidVnd: number; refundedVnd: number; amountDueVnd: number; overpaidVnd: number;
  dueDate: string; paidAt: string | null; feeScheduleId: string; overrideId: string | null; createdAt: string;
};
export type AdminPayment = {
  id: string; statementId: string; userId: string; source: "PAYOS" | "MANUAL_TRANSFER"; amountVnd: number;
  orderId: string | null; bankReference: string | null; receivedAt: string; recordedById: string | null; note: string | null; createdAt: string;
  refundedVnd: number; refundableVnd: number;
};
export type AdminOrder = {
  id: string; orderCode: string; statementId: string; userId: string; amountVnd: number; status: OrderStatus;
  payosPaymentLinkId: string | null; expiredAt: string; createdAt: string; updatedAt: string;
};
export type AdminOrderRow = AdminOrder & {
  user: AdminUserRef; period: string | null; statementStatus: StatementStatus | null;
  receivedVnd: number | null; bankReference: string | null; paidAt: string | null;
};
export type AdminFeeSchedule = {
  id: string; version: number; status: ScheduleStatus; annualRatePercent: string; minMonthlyVnd: number; maxMonthlyVnd: number | null;
  roundingStepVnd: number; dueDay: number; reminderDays: number[]; trialMonths: number; effectiveFromPeriod: string | null; note: string | null;
  createdById: string; publishedById: string | null; publishedAt: string | null; createdAt: string; updatedAt: string;
};
export type AdminStatementDetail = AdminStatement & {
  baseSource: { metric?: string; profileRevision?: number | null; valuationDate?: string | null; issues?: string[] } & Record<string, unknown>;
  schedule: AdminFeeSchedule | null;
  adjustments: { id: string; amountVnd: number; reason: string; createdById: string; createdAt: string }[];
  payments: AdminPayment[];
  refunds: { id: string; paymentId: string; amountVnd: number; bankReference: string; reason: string; recordedById: string; createdAt: string }[];
  orders: AdminOrder[];
  webhookEvents: { id: string; orderCode: string; reference: string; signatureValid: boolean; outcome: string; payload: Record<string, unknown>; receivedAt: string }[];
  auditTrail: { id: string; action: string; performerName: string; performer: AdminUserRef; details: Record<string, unknown> | null; createdAt: string }[];
};
export type AdminOverview = {
  period: string;
  totals: { dueTotalVnd: number; collectedVnd: number; remainingVnd: number; overpaidVnd: number; collectionRate: number; statementCount: number };
  statusCounts: Record<StatementStatus, number>;
  series: { period: string; statementCount: number; dueTotalVnd: number; collectedVnd: number; remainingVnd: number; collectionRate: number }[];
  unresolvedAlertCount: number;
};
export type AdminAlert = {
  key: string; type: AlertType; userId: string; user: AdminUserRef; statementId: string; period: string; orderId: string | null;
  amountVnd: number; message: string; occurredAt: string; details: Record<string, unknown>;
  resolved: { at: string; note: string; byId: string | null } | null;
};
export type AdminOverride = {
  id: string; userId: string; user: AdminUserRef; kind: OverrideKind; value: string | null; fromPeriod: string; toPeriod: string | null;
  reason: string; createdById: string; revokedAt: string | null; revokedById: string | null; createdAt: string;
};
export type StatementState = { id: string; period: string; status: StatementStatus; amountDueVnd: number; overpaidVnd?: number };
export type SchedulePreview = {
  period: string; accountCount: number; current: { id: string; version: number }; draft: { id: string; version: number; status: ScheduleStatus };
  totalBeforeVnd: number; totalAfterVnd: number; totalDeltaVnd: number; counts: { up: number; down: number; same: number };
  topChanges: { userId: string; email: string | null; fullName: string | null; baseAmountVnd: string; beforeVnd: number; afterVnd: number; deltaVnd: number }[];
};
export type ScheduleTerms = {
  annualRatePercent: string; minMonthlyVnd: number; maxMonthlyVnd: number | null; roundingStepVnd: number;
  dueDay: number; reminderDays: number[]; trialMonths: number;
};
export type AdminUserBilling = {
  user: { id: string; email: string; fullName: string; status: string };
  account: { status: AccountStatus; trialEndsAt: string | null; termsVersion: string; termsAcceptedAt: string; stoppedFromPeriod: string | null; revision: number } | null;
  statements: AdminStatement[]; orders: AdminOrder[]; overrides: AdminOverride[];
};
export type ReconcileOutcome = "APPLIED" | "UNDERPAID" | "DUPLICATE" | "EXTRA_TRANSFER" | "IGNORED" | "EXPIRED" | "CANCELLED" | "PENDING";

/* ───────────────────────── Requests ───────────────────────── */

const BASE = "/admin/billing";
const read = <T,>(path: string) => authenticatedRequest<T>(path, undefined, "GET", undefined, { skipCache: true });
const write = <T,>(path: string, body: unknown, key?: string) =>
  authenticatedRequest<T>(path, body, "POST", key ? { "Idempotency-Key": key } : undefined);

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(name, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const adminBilling = {
  permissions: () => read<BillingPermissions>(`${BASE}/permissions`),
  overview: (period?: string) => read<AdminOverview>(`${BASE}/overview${qs({ period })}`),
  statements: (p: { page?: number; limit?: number; period?: string; status?: string; q?: string; overdueOnly?: boolean; hasAlert?: boolean }) =>
    read<Page<AdminStatement>>(`${BASE}/statements${qs(p)}`),
  statement: (id: string) => read<AdminStatementDetail>(`${BASE}/statements/${id}`),
  manualPayment: (id: string, body: { amountVnd: number; bankReference: string; receivedAt: string; reason: string }, key: string) =>
    write<{ payment: AdminPayment; statement: StatementState }>(`${BASE}/statements/${id}/manual-payment`, body, key),
  adjust: (id: string, body: { amountVnd: number; reason: string }) =>
    write<{ statement: StatementState; cancelledOrders: number }>(`${BASE}/statements/${id}/adjust`, body),
  voidStatement: (id: string, body: { reason: string }) =>
    write<{ id: string; period: string; status: "VOID"; cancelledOrders: number }>(`${BASE}/statements/${id}/void`, body),
  orders: (p: { page?: number; limit?: number; status?: string; from?: string; to?: string }) =>
    read<Page<AdminOrderRow>>(`${BASE}/orders${qs(p)}`),
  reconcile: (id: string, body: { reason: string }) =>
    write<{ outcome: ReconcileOutcome; order: AdminOrder; statement: StatementState | null }>(`${BASE}/orders/${id}/reconcile`, body),
  refund: (id: string, body: { amountVnd: number; bankReference: string; reason: string; waiveRemaining?: boolean }, key: string) =>
    write<{ refund: { id: string; amountVnd: number }; refundableVnd: number; statement: StatementState }>(`${BASE}/payments/${id}/refund`, body, key),
  alerts: (p: { page?: number; limit?: number; includeResolved?: boolean }) =>
    read<Page<AdminAlert> & { unresolvedCount: number }>(`${BASE}/alerts${qs(p)}`),
  resolveAlert: (body: { key: string; note: string }) =>
    write<{ key: string; resolved: boolean; note: string; statementId: string }>(`${BASE}/alerts/resolve`, body),
  schedules: () => read<{ items: AdminFeeSchedule[] }>(`${BASE}/fee-schedules`),
  createSchedule: (body: ScheduleTerms & { note?: string | null; reason: string }) =>
    write<AdminFeeSchedule>(`${BASE}/fee-schedules`, body),
  patchSchedule: (id: string, body: Partial<ScheduleTerms> & { note?: string | null; expectedUpdatedAt: string; reason: string }) =>
    authenticatedRequest<AdminFeeSchedule>(`${BASE}/fee-schedules/${id}`, body, "PATCH"),
  previewSchedule: (id: string) => write<SchedulePreview>(`${BASE}/fee-schedules/${id}/preview`, {}),
  publishSchedule: (id: string, body: { effectiveFromPeriod: string; reason: string }) =>
    write<AdminFeeSchedule & { notified: number }>(`${BASE}/fee-schedules/${id}/publish`, body),
  overrides: (p: { page?: number; limit?: number; userId?: string }) => read<Page<AdminOverride>>(`${BASE}/overrides${qs(p)}`),
  createOverride: (userId: string, body: { kind: OverrideKind; value?: string; fromPeriod: string; toPeriod?: string; reason: string }) =>
    write<AdminOverride>(`${BASE}/users/${userId}/overrides`, body),
  revokeOverride: (id: string, body: { reason: string }) =>
    write<AdminOverride & { effect: "END_AT_CURRENT_PERIOD" | "REVOKED_BEFORE_START" }>(`${BASE}/overrides/${id}/revoke`, body),
  userBilling: (userId: string) => read<AdminUserBilling>(`/admin/users/${userId}/billing`),
};

/** Auth-aware CSV download (a plain <a href> would not carry the bearer token). */
export async function downloadBillingCsv(period: string): Promise<string> {
  const { blob, filename } = await authenticatedBlobRequest(`${BASE}/export.csv${qs({ period })}`);
  const name = filename || `phi-dich-vu-${period}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return name;
}

/* ───────────────────────── Permissions / availability ───────────────────────── */

export type BillingAvailability =
  | { status: "loading" }
  | { status: "ready"; permissions: BillingPermissions }
  | { status: "disabled" }
  | { status: "error"; message: string };

let availabilityCache: BillingAvailability = { status: "loading" };
let availabilityPromise: Promise<BillingAvailability> | null = null;
const listeners = new Set<(value: BillingAvailability) => void>();
const publish = (value: BillingAvailability) => { availabilityCache = value; listeners.forEach((listener) => listener(value)); };

function loadAvailability(force = false): Promise<BillingAvailability> {
  if (!force && availabilityCache.status === "ready") return Promise.resolve(availabilityCache);
  if (!availabilityPromise) {
    availabilityPromise = adminBilling.permissions()
      .then((permissions): BillingAvailability => ({ status: "ready", permissions }))
      .catch((error): BillingAvailability => error instanceof ApiError && error.code === "BILLING_DISABLED"
        ? { status: "disabled" }
        : { status: "error", message: billingErrorMessage(error) })
      .then((value) => { publish(value); return value; })
      .finally(() => { availabilityPromise = null; });
  }
  return availabilityPromise;
}

/** One permissions request per page load, shared by the menu and the billing pages. */
export function useBillingAvailability() {
  const [value, setValue] = useState<BillingAvailability>(availabilityCache);
  useEffect(() => {
    listeners.add(setValue);
    if (availabilityCache.status === "loading" || availabilityCache.status === "error") void loadAvailability(availabilityCache.status === "error");
    else setValue(availabilityCache);
    return () => { listeners.delete(setValue); };
  }, []);
  const reload = useCallback(() => { publish({ status: "loading" }); void loadAvailability(true); }, []);
  return { availability: value, reload };
}

/** A billing page may learn from any response that the feature is off. */
export function markBillingDisabled(error: unknown): boolean {
  if (error instanceof ApiError && error.code === "BILLING_DISABLED") { publish({ status: "disabled" }); return true; }
  return false;
}

/* ───────────────────────── Errors ───────────────────────── */

const ERROR_MESSAGES: Record<string, string> = {
  BILLING_DISABLED: "Chức năng phí dịch vụ chưa được bật.",
  DUPLICATE_BANK_REFERENCE: "Mã này đã được ghi nhận trước đó. Hãy kiểm tra lại mã tham chiếu ngân hàng.",
  STATEMENT_VOID: "Kỳ phí này đã bị hủy nên không thể thao tác thêm.",
  STATEMENT_SETTLED: "Kỳ phí đã được thanh toán đủ hoặc đã miễn, không còn số tiền để giảm.",
  STATEMENT_HAS_PAYMENTS: "Kỳ phí đã có thanh toán nên không thể hủy. Hãy dùng Hoàn tiền hoặc Giảm/Miễn kỳ này.",
  STATEMENT_NOT_VOIDABLE: "Chỉ hủy được kỳ phí đang ở trạng thái Chờ thanh toán hoặc Quá hạn.",
  RECEIVED_AT_IN_FUTURE: "Thời điểm nhận tiền không được ở tương lai.",
  REFUND_EXCEEDS_PAYMENT: "Số tiền hoàn lớn hơn phần còn có thể hoàn của khoản thanh toán này. Hãy tải lại kỳ phí để xem số mới nhất.",
  ADJUSTMENT_EXCEEDS_DUE: "Số tiền giảm lớn hơn số còn phải thu. Hãy tải lại kỳ phí để xem số mới nhất.",
  IDEMPOTENCY_CONFLICT: "Khóa chống gửi trùng đã được dùng cho nội dung khác. Hãy đóng hộp thoại và mở lại.",
  ALERT_ALREADY_RESOLVED: "Cảnh báo này đã được xử lý trước đó.",
  REVISION_CONFLICT: "Có người vừa sửa bản nháp này. Hãy tải lại rồi sửa lại.",
  SCHEDULE_NOT_DRAFT: "Chỉ sửa hoặc công bố được bản nháp. Bản này không còn là bản nháp, hãy tải lại danh sách.",
  EFFECTIVE_PERIOD_TOO_EARLY: "Tháng áp dụng phải từ kỳ kế tiếp trở đi.",
  PERIOD_ALREADY_ISSUED: "Đã có kỳ phí được lập cho tháng này, hãy chọn tháng sau.",
  SCHEDULE_PERIOD_CONFLICT: "Đã có biểu phí khác được công bố cho kỳ này hoặc các kỳ sau. Hãy chọn tháng sau biểu phí đó.",
  FEE_SCHEDULE_MISSING: "Chưa có biểu phí đang áp dụng để so sánh.",
  OVERRIDE_OVERLAP: "Người dùng đã có ưu đãi trùng khoảng kỳ này. Hãy thu hồi ưu đãi cũ trước.",
  OVERRIDE_PERIOD_TOO_EARLY: "Ưu đãi chỉ bắt đầu được từ tháng sau tháng hiện tại.",
  OVERRIDE_PERIOD_ORDER: "Kỳ kết thúc phải bằng hoặc sau kỳ bắt đầu.",
  OVERRIDE_REVOKED: "Ưu đãi này đã được thu hồi. Hãy tải lại danh sách.",
  OVERRIDE_ENDED: "Ưu đãi này đã kết thúc. Hãy tải lại danh sách.",
  NETWORK_ERROR: "Không thể kết nối máy chủ. Vui lòng thử lại.",
};

/** Vietnamese, action-oriented text for an API failure. FORBIDDEN keeps the server's own wording. */
export function billingErrorMessage(error: unknown, context?: "reconcile"): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : "Yêu cầu chưa thành công. Vui lòng thử lại.";
  if (error.code === "FORBIDDEN" || error.status === 403) return error.message;
  if (context === "reconcile") {
    if (error.status === 503 && error.code !== "BILLING_DISABLED") return "payOS chưa được cấu hình trên máy chủ nên chưa kiểm tra lại được.";
    if (error.status === 502) return "payOS không phản hồi. Hãy thử lại sau ít phút.";
  }
  if (error.code === "VALIDATION_ERROR") return "Một số thông tin chưa hợp lệ, hãy kiểm tra các ô được đánh dấu.";
  return ERROR_MESSAGES[error.code] ?? error.message;
}

/** `fieldErrors` keyed by the last path segment, first message only. */
export function billingFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.fieldErrors) return {};
  const out: Record<string, string> = {};
  for (const [path, messages] of Object.entries(error.fieldErrors)) {
    const name = path.split(".").pop() || path;
    const text = Array.isArray(messages) ? messages[0] : String(messages);
    if (text && !out[name]) out[name] = text;
  }
  return out;
}

/* ───────────────────────── Labels & formatting ───────────────────────── */

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  ISSUED: "Chờ thanh toán", PAID: "Đã thanh toán", OVERDUE: "Quá hạn", WAIVED: "Được miễn", VOID: "Đã hủy",
};
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Đang chờ", PAID: "Đã thanh toán", UNDERPAID: "Thiếu tiền", EXPIRED: "Hết hạn", CANCELLED: "Đã hủy",
};
export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  DRAFT: "Bản nháp", PUBLISHED: "Đã công bố", SUPERSEDED: "Đã thay thế",
};
export const OVERRIDE_KIND_LABEL: Record<OverrideKind, string> = {
  DISCOUNT_PERCENT: "Giảm %", FIXED_AMOUNT: "Phí cố định", WAIVE: "Miễn phí",
};
export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  TRIAL: "Dùng thử", ACTIVE: "Đang hoạt động", OVERDUE: "Quá hạn", STOPPED: "Đã ngừng",
};
export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  UNDERPAID: "Chuyển thiếu", OVERPAID: "Thu thừa", EXTRA_TRANSFER: "Nhận thêm khoản",
};
export const RECONCILE_OUTCOME_LABEL: Record<ReconcileOutcome, string> = {
  APPLIED: "Đã ghi nhận thanh toán", UNDERPAID: "Khách chuyển thiếu tiền", DUPLICATE: "Giao dịch đã được ghi nhận trước đó",
  EXTRA_TRANSFER: "Nhận thêm một khoản cho đơn đã trả (xem trang Cảnh báo)", IGNORED: "Không có thay đổi",
  EXPIRED: "Mã thanh toán đã hết hạn", CANCELLED: "Mã thanh toán đã bị hủy", PENDING: "payOS chưa nhận được tiền",
};
export const BASE_ISSUE_LABEL: Record<string, string> = {
  PROFILE_MISSING: "Chưa có hồ sơ tài chính → áp phí tối thiểu",
  LEGACY_PROFILE: "Hồ sơ tài chính ở định dạng cũ → áp phí tối thiểu",
  PROFILE_DATA_REVIEW_REQUIRED: "Dữ liệu hồ sơ cần được người dùng rà soát lại → áp phí tối thiểu",
  ASSETS_UNKNOWN: "Chưa xác định được tài sản dành cho hưu trí → áp phí tối thiểu",
};
export const WEBHOOK_OUTCOME_LABEL: Record<string, string> = {
  APPLIED: "Đã ghi nhận", DUPLICATE: "Trùng (đã xử lý)", UNKNOWN_ORDER: "Không tìm thấy đơn", NOT_SUCCESS: "Giao dịch không thành công",
  UNDERPAID: "Thiếu tiền", EXTRA_TRANSFER: "Khoản nhận thêm",
};
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  BILLING_MANUAL_PAYMENT: "Ghi nhận chuyển khoản", BILLING_REFUND: "Hoàn tiền", BILLING_ADJUST: "Giảm/Miễn kỳ phí", BILLING_VOID: "Hủy kỳ phí",
  BILLING_RECONCILE: "Kiểm tra lại payOS", BILLING_ALERT_RESOLVE: "Xử lý cảnh báo", BILLING_EXPORT: "Xuất CSV",
};

export const statementTone = (status: StatementStatus): "success" | "warning" | "danger" | "neutral" | "info" =>
  status === "PAID" ? "success" : status === "OVERDUE" ? "danger" : status === "ISSUED" ? "warning" : status === "WAIVED" ? "info" : "neutral";
export const orderTone = (status: OrderStatus): "success" | "warning" | "danger" | "neutral" | "info" =>
  status === "PAID" ? "success" : status === "PENDING" ? "info" : status === "UNDERPAID" ? "warning" : "neutral";

export const formatVnd = (value: number | null | undefined) =>
  `${(value ?? 0).toLocaleString("vi-VN")} ₫`;
export const formatVndText = (value: number) => `${value.toLocaleString("vi-VN")}đ`;
export const formatPeriod = (period: string | null | undefined) => (period && /^\d{4}-\d{2}$/.test(period) ? `${period.slice(5)}/${period.slice(0, 4)}` : period || "—");
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
export const formatRate = (rate: number) => `${(Math.round(rate * 1000) / 10).toLocaleString("vi-VN")}%`;
export const userLabel = (user: AdminUserRef) => (user ? `${user.fullName} · ${user.email}` : "Tài khoản đã xóa");

/** Current billing month in Vietnam time, as YYYY-MM. */
export function currentPeriod(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}
export function addMonths(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
export const isPeriod = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const newIdempotencyKey = () => crypto.randomUUID();
