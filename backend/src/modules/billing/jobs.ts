import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { audit } from "../../common/audit";
import { log } from "../../common/logger";
import { transaction } from "../../common/transaction";
import { enqueue } from "../../jobs/outbox";
import { computeFee } from "./fee-math";
import { dueDateOf, periodOf, periodStart, vnDayOfMonth } from "./periods";
import { reconcileOrder, statementDue } from "./ledger";
import type { PaymentGateway } from "./payos";
import { feeBase, overrideFor, overrideTerms, scheduleFor } from "./terms";

/**
 * Scheduled billing work (docs/KE_HOACH_TRIEN_KHAI_PHI_DICH_VU.md §5). Every job is idempotent and
 * safe with several workers: statements rely on @@unique([userId, period]) (a P2002 is a skip),
 * state changes are conditional updateMany calls, and notification ids are stable hashes so a
 * rerun can never notify twice. Logs carry counts and codes only — never user data or amounts.
 */
type Tx = Prisma.TransactionClient;
const BATCH = 500;
const DAY_MS = 86_400_000;
const money = (value: number) => value.toLocaleString("vi-VN") + "đ";
const monthLabel = (period: string) => `${period.slice(5)}/${period.slice(0, 4)}`;
const dayLabel = (date: Date) => date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Deterministic UUID (v5-shaped) for a notification key, so reruns and concurrent workers collide on the primary key. */
export function stableId(key: string) {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type Account = Prisma.BillingAccountGetPayload<object>;
export type IssueResult = "ISSUED" | "WAIVED" | "EXISTS" | "STACKED" | "NOT_ELIGIBLE" | "NO_SCHEDULE";

/** Whether the account may be billed for `period` right now (before looking at statements). */
export function billableForPeriod(account: Pick<Account, "status" | "trialEndsAt" | "stoppedFromPeriod">, period: string, now: Date) {
  if (account.status === "TRIAL") return account.trialEndsAt !== null && account.trialEndsAt.getTime() <= now.getTime();
  if (account.status === "STOPPED") return !account.stoppedFromPeriod || account.stoppedFromPeriod > period;
  return account.status === "ACTIVE" || account.status === "OVERDUE";
}

/**
 * Issues the statement for `period` inside the caller's transaction. Shared by the monthly job and
 * by "resume". A trial that has ended becomes ACTIVE in the same transaction. Statements are never
 * stacked: an unpaid statement from an earlier period blocks a new one.
 */
export async function issueStatementIn(tx: Tx, account: Account, period: string, now: Date): Promise<IssueResult> {
  if (!billableForPeriod(account, period, now)) return "NOT_ELIGIBLE";
  if (await tx.feeStatement.findFirst({ where: { userId: account.userId, period }, select: { id: true } })) return "EXISTS";
  if (await tx.feeStatement.findFirst({ where: { userId: account.userId, status: { in: ["ISSUED", "OVERDUE"] }, period: { lt: period } }, select: { id: true } })) return "STACKED";
  const schedule = await scheduleFor(tx, period);
  if (!schedule) return "NO_SCHEDULE";
  const [override, base] = await Promise.all([overrideFor(tx, account.userId, period), feeBase(tx, account.userId)]);
  const fee = computeFee(base.amount, schedule, overrideTerms(override));
  const waived = fee.amountVnd === 0;
  if (account.status === "TRIAL")
    await tx.billingAccount.updateMany({ where: { userId: account.userId, status: "TRIAL" }, data: { status: "ACTIVE", revision: { increment: 1 } } });
  const statement = await tx.feeStatement.create({ data: { userId: account.userId, period, baseAmountVnd: fee.baseAmountVnd,
    baseSource: JSON.parse(JSON.stringify(base.source)) as Prisma.InputJsonObject, feeScheduleId: schedule.id, overrideId: override?.id ?? null,
    rawFeeVnd: fee.rawFeeVnd, scheduleFeeVnd: fee.scheduleFeeVnd, amountVnd: fee.amountVnd, status: waived ? "WAIVED" : "ISSUED",
    dueDate: dueDateOf(period, schedule.dueDay) } });
  await audit(tx, account.userId, "BILLING_STATEMENT_ISSUED", "FEE_STATEMENT", statement.id,
    { period, scheduleVersion: schedule.version, waived, trialEnded: account.status === "TRIAL" }, { performerName: "system" });
  await tx.notification.create({ data: { id: stableId(`billing-issued:${statement.id}`), userId: account.userId, path: "/user/account",
    title: waived ? "Phí dịch vụ tháng này được miễn" : "Đã có kỳ phí dịch vụ mới",
    message: waived ? `Phí dịch vụ tháng ${monthLabel(period)} được miễn theo ưu đãi dành cho bạn.`
      : `Phí dịch vụ tháng ${monthLabel(period)} là ${money(fee.amountVnd)}, hạn thanh toán ${dayLabel(statement.dueDate)}.` } });
  if (!waived) await enqueue(tx, "billing.statement_issued", statement.id, { statementId: statement.id });
  return waived ? "WAIVED" : "ISSUED";
}

/** Day 1–3 (Vietnam time) of the month: bill every eligible account once for the current period. */
export async function issueStatements(db: PrismaClient, now: Date) {
  const result = { due: false, issued: 0, waived: 0, skipped: 0, failed: 0 };
  if (vnDayOfMonth(now) > 3) return result;
  result.due = true;
  const period = periodOf(now);
  let cursor: string | undefined;
  for (;;) {
    const accounts = await db.billingAccount.findMany({ where: { status: { in: ["ACTIVE", "OVERDUE", "TRIAL", "STOPPED"] }, ...(cursor ? { userId: { gt: cursor } } : {}) },
      orderBy: { userId: "asc" }, take: BATCH });
    if (!accounts.length) break;
    cursor = accounts[accounts.length - 1].userId;
    for (const account of accounts) {
      if (!billableForPeriod(account, period, now)) { result.skipped++; continue; }
      try {
        const outcome = await transaction(db, tx => issueStatementIn(tx, account, period, now));
        if (outcome === "ISSUED") result.issued++; else if (outcome === "WAIVED") result.waived++; else result.skipped++;
      } catch (error) {
        if (isUniqueViolation(error)) result.skipped++; // another worker issued it first
        else { result.failed++; log("error", "billing.job_failed", { code: "ISSUE_STATEMENT" }); }
      }
    }
    if (accounts.length < BATCH) break;
  }
  return result;
}

async function pagesOfStatements(db: PrismaClient, where: Prisma.FeeStatementWhereInput, each: (rows: Array<Prisma.FeeStatementGetPayload<object>>) => Promise<void>) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.feeStatement.findMany({ where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: BATCH });
    if (!rows.length) return;
    cursor = rows[rows.length - 1].id;
    await each(rows);
    if (rows.length < BATCH) return;
  }
}

/** On the reminder days pinned by the statement's own schedule, remind users whose statement is still open. */
export async function remindStatements(db: PrismaClient, now: Date) {
  const day = vnDayOfMonth(now), period = periodOf(now), result = { reminded: 0, skipped: 0, failed: 0 };
  await pagesOfStatements(db, { period, status: "ISSUED" }, async rows => {
    const schedules = await db.feeSchedule.findMany({ where: { id: { in: [...new Set(rows.map(row => row.feeScheduleId))] } }, select: { id: true, reminderDays: true } });
    const reminderDays = new Map(schedules.map(schedule => [schedule.id, schedule.reminderDays]));
    for (const statement of rows) {
      if (!reminderDays.get(statement.feeScheduleId)?.includes(day)) continue;
      try {
        const created = await transaction(db, async tx => {
          const id = stableId(`billing-reminder:${statement.id}:${day}`);
          if (await tx.notification.findUnique({ where: { id }, select: { id: true } })) return false;
          const due = await statementDue(tx, statement);
          if (due <= 0) return false;
          await tx.notification.create({ data: { id, userId: statement.userId, path: "/user/account", title: "Nhắc thanh toán phí dịch vụ",
            message: `Phí dịch vụ tháng ${monthLabel(statement.period)} (${money(due)}) có hạn thanh toán ${dayLabel(statement.dueDate)}. Bạn có thể thanh toán bất cứ lúc nào trong mục Phí dịch vụ.` } });
          await enqueue(tx, "billing.reminder", statement.id, { statementId: statement.id, day });
          return true;
        });
        if (created) result.reminded++; else result.skipped++;
      } catch (error) {
        if (isUniqueViolation(error)) result.skipped++;
        else { result.failed++; log("error", "billing.job_failed", { code: "REMIND_STATEMENT" }); }
      }
    }
  });
  return result;
}

/** Statements past their due date with money still owed become OVERDUE; the account follows (feature gating). */
export async function markOverdue(db: PrismaClient, now: Date) {
  const result = { overdue: 0, skipped: 0, failed: 0 };
  await pagesOfStatements(db, { status: "ISSUED", dueDate: { lt: now } }, async rows => {
    for (const statement of rows) {
      try {
        const changed = await transaction(db, async tx => {
          if ((await statementDue(tx, statement)) <= 0) return false;
          const moved = await tx.feeStatement.updateMany({ where: { id: statement.id, status: "ISSUED" }, data: { status: "OVERDUE" } });
          if (moved.count === 0) return false;
          // A stopped account keeps its STOPPED state; only accounts that are being billed are gated.
          await tx.billingAccount.updateMany({ where: { userId: statement.userId, status: { in: ["ACTIVE", "TRIAL"] } }, data: { status: "OVERDUE", revision: { increment: 1 } } });
          await audit(tx, statement.userId, "BILLING_STATEMENT_OVERDUE", "FEE_STATEMENT", statement.id, { period: statement.period }, { performerName: "system" });
          await tx.notification.create({ data: { id: stableId(`billing-overdue:${statement.id}`), userId: statement.userId, path: "/user/account",
            title: "Phí dịch vụ đã quá hạn thanh toán",
            message: `Phí dịch vụ tháng ${monthLabel(statement.period)} đã quá hạn. Dữ liệu của bạn vẫn được giữ nguyên; thanh toán để tiếp tục tạo mới hoặc tính toán lại kế hoạch.` } });
          return true;
        });
        if (changed) result.overdue++; else result.skipped++;
      } catch (error) {
        if (isUniqueViolation(error)) result.skipped++;
        else { result.failed++; log("error", "billing.job_failed", { code: "MARK_OVERDUE" }); }
      }
    }
  });
  return result;
}

async function pagesOfOrders(db: PrismaClient, where: Prisma.PaymentOrderWhereInput, each: (order: Prisma.PaymentOrderGetPayload<object>) => Promise<void>) {
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.paymentOrder.findMany({ where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 100 });
    if (!rows.length) return;
    cursor = rows[rows.length - 1].id;
    for (const order of rows) await each(order);
    if (rows.length < 100) return;
  }
}

/**
 * Orders past their link expiry. payOS is asked first so a payment that arrived late (lost webhook) is still
 * applied; only then is the order closed as EXPIRED and the link cancelled (best effort).
 */
export async function expireOrders(db: PrismaClient, gateway: PaymentGateway | null, now: Date) {
  const result = { expired: 0, paid: 0, failed: 0 };
  if (!gateway) return result;
  await pagesOfOrders(db, { status: "PENDING", expiredAt: { lt: now } }, async order => {
    try {
      const outcome = await reconcileOrder(db, gateway, order, now);
      if (outcome === "EXPIRED") {
        result.expired++;
        try { await gateway.cancelLink(Number(order.orderCode), "Mã thanh toán đã hết hạn"); }
        catch { log("warn", "billing.link_cancel_failed", { code: "CANCEL_FAILED" }); }
      } else if (outcome === "APPLIED" || outcome === "UNDERPAID") result.paid++;
    } catch { result.failed++; log("error", "billing.job_failed", { code: "EXPIRE_ORDER" }); }
  });
  return result;
}

/** Compares recent PENDING orders (last 48 hours) with payOS. One failing order never stops the batch. */
export async function reconcilePending(db: PrismaClient, gateway: PaymentGateway | null, now: Date) {
  const result = { checked: 0, paid: 0, failed: 0 };
  if (!gateway) return result;
  await pagesOfOrders(db, { status: "PENDING", createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) } }, async order => {
    try {
      const outcome = await reconcileOrder(db, gateway, order, now);
      result.checked++;
      if (outcome === "APPLIED" || outcome === "UNDERPAID") result.paid++;
    } catch { result.failed++; log("error", "billing.job_failed", { code: "RECONCILE_ORDER" }); }
  });
  return result;
}

/** Retires published schedules once a newer one is in force, and announces an upcoming one 7 days ahead. */
export async function rolloverSchedules(db: PrismaClient, now: Date) {
  const period = periodOf(now), result = { superseded: 0, notified: 0 };
  const inForce = await db.feeSchedule.findMany({ where: { status: "PUBLISHED", effectiveFromPeriod: { lte: period } }, orderBy: [{ effectiveFromPeriod: "desc" }, { version: "desc" }] });
  const older = inForce.slice(1).map(schedule => schedule.id);
  if (older.length) result.superseded = (await db.feeSchedule.updateMany({ where: { id: { in: older }, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } })).count;
  const upcoming = await db.feeSchedule.findMany({ where: { status: "PUBLISHED", effectiveFromPeriod: { gt: period } }, orderBy: { version: "asc" } });
  for (const schedule of upcoming) {
    if (!schedule.effectiveFromPeriod || periodStart(schedule.effectiveFromPeriod).getTime() - 7 * DAY_MS > now.getTime()) continue;
    let cursor: string | undefined;
    for (;;) {
      const accounts = await db.billingAccount.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] }, ...(cursor ? { userId: { gt: cursor } } : {}) },
        select: { userId: true }, orderBy: { userId: "asc" }, take: BATCH });
      if (!accounts.length) break;
      cursor = accounts[accounts.length - 1].userId;
      const ids = accounts.map(account => stableId(`billing-schedule:${schedule.id}:${account.userId}`));
      const existing = new Set((await db.notification.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(row => row.id));
      const data = accounts.map((account, index) => ({ id: ids[index], userId: account.userId, path: "/user/account",
        title: "Biểu phí dịch vụ sắp thay đổi",
        message: `Từ tháng ${monthLabel(schedule.effectiveFromPeriod!)}, biểu phí dịch vụ có điều chỉnh. Bạn có thể xem chi tiết và ước tính phí trong mục Phí dịch vụ.` }))
        .filter(row => !existing.has(row.id));
      if (data.length) result.notified += (await db.notification.createMany({ data, skipDuplicates: true })).count;
      if (accounts.length < BATCH) break;
    }
  }
  return result;
}

type Counts = Record<string, number | boolean>;
/** Job table for the worker: `frequent` every 5 minutes, `hourly` every hour. */
export function createBillingJobs(db: PrismaClient, gateway: PaymentGateway | null) {
  const job = (code: string, run: (now: Date) => Promise<Counts>) => ({ code, run });
  return {
    frequent: [job("EXPIRE_ORDERS", now => expireOrders(db, gateway, now))],
    hourly: [
      job("ISSUE_STATEMENTS", now => issueStatements(db, now)),
      job("REMIND_STATEMENTS", now => remindStatements(db, now)),
      job("MARK_OVERDUE", now => markOverdue(db, now)),
      job("RECONCILE_PENDING", now => reconcilePending(db, gateway, now)),
      job("ROLLOVER_SCHEDULES", now => rolloverSchedules(db, now)),
    ],
  };
}
