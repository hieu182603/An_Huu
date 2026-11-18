import { addMonths } from "../../common/calendar";

/** Billing periods are calendar months in Vietnam time (UTC+7, no DST). */
const VN_OFFSET_MS = 7 * 3600_000;
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function periodOf(now: Date): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const nextPeriod = (period: string) => addMonths(period, 1);
/** 00:00 Vietnam time on the first day of the period. */
export function periodStart(period: string): Date {
  return new Date(`${period}-01T00:00:00.000+07:00`);
}
/** End of the due day (23:59:59.999 Vietnam time). dueDay is 1–28 by DB constraint. */
export function dueDateOf(period: string, dueDay: number): Date {
  return new Date(`${period}-${String(dueDay).padStart(2, "0")}T23:59:59.999+07:00`);
}
/** Vietnam calendar day of month for `now`. */
export function vnDayOfMonth(now: Date): number {
  return new Date(now.getTime() + VN_OFFSET_MS).getUTCDate();
}
