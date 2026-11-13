import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** Day of the Vietnam calendar month from which the monthly check-in reminder is due. */
export const REMINDER_DAY = 25;
const BATCH = 500;
const VN_OFFSET_MS = 7 * 3600_000;

/** Stable UUID per user and month, so reruns and concurrent workers never duplicate a reminder. */
export function reminderId(userId: string, period: string) {
  const h = createHash("sha256").update(`monthly-checkin:${userId}:${period}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * In-app reminder to record the month's actual contribution. Only for active USER accounts that
 * opted in (goalAlerts), have a main plan applied and have not recorded the current month yet.
 * From the 25th to month end, so a worker outage on the 25th still catches up. No email is sent.
 */
export async function runMonthlyReminders(db: PrismaClient, now = new Date()) {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const period = `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
  if (vn.getUTCDate() < REMINDER_DAY) return { period, due: false, created: 0 };
  let created = 0, cursor: string | undefined;
  for (;;) {
    const prefs = await db.notificationPreference.findMany({
      where: { goalAlerts: true, user: { role: "USER", status: "ACTIVE" }, ...(cursor ? { userId: { gt: cursor } } : {}) },
      select: { userId: true }, orderBy: { userId: "asc" }, take: BATCH,
    });
    if (!prefs.length) break;
    cursor = prefs[prefs.length - 1].userId;
    const ids = prefs.map(row => row.userId);
    const [plans, recorded] = await Promise.all([
      db.retirementPlan.findMany({ where: { userId: { in: ids }, currentVersionId: { not: null } }, select: { userId: true } }),
      db.actualMonth.findMany({ where: { userId: { in: ids }, period }, select: { userId: true } }),
    ]);
    const done = new Set(recorded.map(row => row.userId));
    for (const userId of new Set(plans.map(row => row.userId))) {
      if (done.has(userId)) continue;
      const id = reminderId(userId, period);
      if (await db.notification.findUnique({ where: { id }, select: { id: true } })) continue;
      await db.notification.upsert({ where: { id }, update: {}, create: { id, userId,
        title: "Đến kỳ cập nhật tình hình tháng này",
        message: `Ghi nhận số tiền thực tế đã góp tháng ${period.slice(5)}/${period.slice(0, 4)} để kế hoạch theo sát tình hình của bạn.`,
        path: "/user/simulation" } });
      created++;
    }
    if (prefs.length < BATCH) break;
  }
  return { period, due: true, created };
}
