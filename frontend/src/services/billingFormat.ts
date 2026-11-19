// Pure display/decision helpers for the service-fee (phí dịch vụ) screens.
// No imports on purpose: scripts/billing-format.test.mjs loads this file directly.

export const BILLING_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const ORDER_POLL_INTERVAL_MS = 3000;
export const ORDER_POLL_MAX_ATTEMPTS = 20;

/** "2026-11" -> "11/2026". Anything else is returned unchanged. */
export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "";
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return match ? `${match[2]}/${match[1]}` : period;
}

/** Whole dong with dot separators, e.g. 1234567 -> "1.234.567 ₫". */
export function formatVnd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^-/, "").split(".");
  if (!/^\d+$/.test(whole)) return "—";
  // Round half up on the first decimal so a Decimal string never loses a dong silently.
  const rounded = BigInt(whole) + (fraction[0] >= "5" ? 1n : 0n);
  const digits = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative && rounded !== 0n ? "-" : ""}${digits} ₫`;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: BILLING_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: BILLING_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });

/** ISO instant -> dd/mm/yyyy in Vietnam time. */
export function formatVnDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

/** ISO instant -> "dd/mm/yyyy HH:mm" in Vietnam time. */
export function formatVnDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${dateFormatter.format(date)} ${timeFormatter.format(date)}`;
}

/** Seconds left until `expiredAt` (never negative). */
export function secondsLeft(expiredAt: string | null | undefined, nowMs: number): number {
  if (!expiredAt) return 0;
  const end = new Date(expiredAt).getTime();
  return Number.isNaN(end) ? 0 : Math.max(0, Math.ceil((end - nowMs) / 1000));
}

/** 125 -> "02:05". */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

const vnDay = (ms: number) => dateFormatter.format(new Date(ms)).split("/").reverse().join("-");

/** Calendar days from today to `iso`, both in Vietnam time. Negative when past. */
export function daysUntil(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((Date.parse(`${vnDay(target)}T00:00:00Z`) - Date.parse(`${vnDay(nowMs)}T00:00:00Z`)) / 86400000);
}

export type StatementLike = { status: string; amountDueVnd: number };

/** A statement can be paid while it is open and still has an amount due. */
export function canPayStatement(statement: StatementLike | null | undefined): boolean {
  return Boolean(statement && (statement.status === "ISSUED" || statement.status === "OVERDUE") && statement.amountDueVnd > 0);
}

/** baseSource.issues that mean the fee base is missing or uncertain. */
export function needsAssetDeclaration(issues: readonly string[] | null | undefined): boolean {
  return Boolean(issues?.some(issue => issue === "PROFILE_MISSING" || issue === "LEGACY_PROFILE" || issue === "ASSETS_UNKNOWN"));
}

/** Decimal string for the estimate API: whole non-negative VND. */
export function toBaseAmount(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(Math.floor(value)) : "") : String(value).split(".")[0];
  if (!/^\d{1,18}$/.test(text)) return null;
  return text.replace(/^0+(?=\d)/, "");
}

export type OrderView = "paid" | "underpaid" | "retry" | "waiting" | "late";

/**
 * What the result page shows for a polled order.
 * `attempt` counts finished polls (1-based). A PENDING order is "waiting" until
 * the last poll has been used, then "late" ("check again later").
 */
export function orderView(status: string | null | undefined, attempt: number, maxAttempts = ORDER_POLL_MAX_ATTEMPTS): OrderView {
  if (status === "PAID") return "paid";
  if (status === "UNDERPAID") return "underpaid";
  if (status === "EXPIRED" || status === "CANCELLED") return "retry";
  return attempt >= maxAttempts ? "late" : "waiting";
}

/** Month after the current Vietnam-time month, as "YYYY-MM". */
export function nextVnPeriod(nowMs: number): string {
  const [year, month] = vnDay(nowMs).split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}
