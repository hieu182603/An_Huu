import { Prisma, type FeeStatementStatus, type InvestmentRole, type PrismaClient } from "@prisma/client";
import { audit } from "../../common/audit";
import { addMonths } from "../../common/calendar";
import { AppError } from "../../common/errors";
import { idempotentCommand } from "../../common/idempotent-command";
import { log } from "../../common/logger";
import { transaction } from "../../common/transaction";
import { enqueue } from "../../jobs/outbox";
import { csvCell } from "../plans/presentation";
import { requireInvestmentRole } from "../recommendation/service";
import type { AdjustInput, AlertsQuery, CreateOverrideInput, CreateScheduleInput, ManualPaymentInput, OrdersQuery, OverridesQuery,
  PatchScheduleInput, PublishScheduleInput, RefundInput, StatementsQuery } from "./admin-schema";
import { scheduleTerms } from "./admin-schema";
import { amountDue, computeFee } from "./fee-math";
import { stableId } from "./jobs";
import { reconcileOrder, statementDue } from "./ledger";
import type { PaymentGateway } from "./payos";
import { nextPeriod, periodOf } from "./periods";
import { feeBase, overrideFor, overrideTerms, scheduleFor } from "./terms";

/**
 * Admin side of service-fee billing (docs/KE_HOACH_TRIEN_KHAI_PHI_DICH_VU.md §3.2, §3.3).
 *
 * Reading needs ADMIN only (enforced by the router). Writes need an InvestmentRoleGrant, checked INSIDE the
 * serializable transaction like the recommendation module does: OPERATIONS for money movements, adjustments and
 * per-user overrides; SYSTEM_ADMIN for fee schedules. Every write stores its reason and an AuditLog row in the same
 * transaction. Statements stay immutable: all changes are ledger rows (payments, refunds, adjustments) plus the
 * statement status that the ledger implies.
 */
type Tx = Prisma.TransactionClient;
type StatementRow = Prisma.FeeStatementGetPayload<object>;
type PaymentRow = Prisma.PaymentGetPayload<object>;
type OrderRow = Prisma.PaymentOrderGetPayload<object>;
type ScheduleRow = Prisma.FeeScheduleGetPayload<object>;
type OverrideRow = Prisma.UserFeeOverrideGetPayload<object>;

export type BillingAdminOptions = { enabled: boolean; now?: () => Date };

const BATCH = 500;
const VN_OFFSET_MS = 7 * 3600_000, DAY_MS = 86_400_000;
const OPERATE: InvestmentRole[] = ["OPERATIONS"], MANAGE: InvestmentRole[] = ["SYSTEM_ADMIN"];
const OPEN: FeeStatementStatus[] = ["ISSUED", "OVERDUE"];
const ACTOR = "Quản trị viên";
const ALERT_WINDOW_DAYS = 180;
const BOM = String.fromCharCode(0xFEFF); // so Excel opens the CSV as UTF-8
const money = (value: number) => value.toLocaleString("vi-VN") + "đ";
const monthLabel = (period: string) => `${period.slice(5)}/${period.slice(0, 4)}`;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const notFound = (what: string) => new AppError(404, "NOT_FOUND", `Không tìm thấy ${what}.`);
const vnDate = (date: Date) => new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const statusLabel: Record<string, string> = { ISSUED: "Chờ thanh toán", PAID: "Đã thanh toán", OVERDUE: "Quá hạn", WAIVED: "Được miễn", VOID: "Đã hủy" };

async function need(tx: Tx, actorId: string, roles: InvestmentRole[], what: string) {
  try { await requireInvestmentRole(tx, actorId, roles); }
  catch (error) {
    if (error instanceof AppError && error.status === 403)
      throw new AppError(403, "FORBIDDEN", `Bạn cần được cấp quyền ${roles.join(" hoặc ")} để ${what}. Hãy liên hệ quản trị viên hệ thống.`);
    throw error;
  }
}
async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let index = 0; index < items.length; index += limit) out.push(...await Promise.all(items.slice(index, index + limit).map(work)));
  return out;
}

/** What the ledger holds for one statement. `dueVnd` < 0 means the user has paid too much. */
type Ledger = { adjustedVnd: number; paidVnd: number; refundedVnd: number; dueVnd: number;
  adjustments: Array<Prisma.StatementAdjustmentGetPayload<object>>; payments: PaymentRow[]; refunds: Array<Prisma.RefundGetPayload<object>> };
async function loadLedgers(tx: Tx, statements: Array<Pick<StatementRow, "id" | "amountVnd">>): Promise<Map<string, Ledger>> {
  const result = new Map<string, Ledger>();
  if (!statements.length) return result;
  const ids = statements.map(statement => statement.id);
  const [adjustments, payments] = await Promise.all([
    tx.statementAdjustment.findMany({ where: { statementId: { in: ids } }, orderBy: { createdAt: "asc" } }),
    tx.payment.findMany({ where: { statementId: { in: ids } }, orderBy: { receivedAt: "asc" } }),
  ]);
  const refunds = payments.length ? await tx.refund.findMany({ where: { paymentId: { in: payments.map(payment => payment.id) } }, orderBy: { createdAt: "asc" } }) : [];
  for (const statement of statements) {
    const mine = { adjustments: adjustments.filter(row => row.statementId === statement.id), payments: payments.filter(row => row.statementId === statement.id) };
    const paymentIds = new Set(mine.payments.map(payment => payment.id)), myRefunds = refunds.filter(row => paymentIds.has(row.paymentId));
    const adjustedVnd = mine.adjustments.reduce((sum, row) => sum + row.amountVnd, 0), paidVnd = mine.payments.reduce((sum, row) => sum + row.amountVnd, 0),
      refundedVnd = myRefunds.reduce((sum, row) => sum + row.amountVnd, 0);
    result.set(statement.id, { adjustedVnd, paidVnd, refundedVnd, adjustments: mine.adjustments, payments: mine.payments, refunds: myRefunds,
      dueVnd: amountDue({ amountVnd: statement.amountVnd, adjustments: [adjustedVnd], payments: [paidVnd], refunds: [refundedVnd] }) });
  }
  return result;
}
type UserBrief = { id: string; email: string; fullName: string };
async function loadUsers(tx: Tx, ids: string[]): Promise<Map<string, UserBrief>> {
  const unique = [...new Set(ids)];
  const rows = unique.length ? await tx.user.findMany({ where: { id: { in: unique } }, select: { id: true, email: true, fullName: true } }) : [];
  return new Map(rows.map(row => [row.id, { id: row.id, email: row.email, fullName: row.fullName }]));
}
const userView = (user: UserBrief | undefined) => user ? { email: user.email, fullName: user.fullName } : null;

function statementView(s: StatementRow, ledger: Ledger, user?: UserBrief) {
  return { id: s.id, userId: s.userId, user: userView(user), period: s.period, status: s.status, baseAmountVnd: String(s.baseAmountVnd), rawFeeVnd: String(s.rawFeeVnd),
    scheduleFeeVnd: s.scheduleFeeVnd, amountVnd: s.amountVnd, adjustedVnd: ledger.adjustedVnd, paidVnd: ledger.paidVnd, refundedVnd: ledger.refundedVnd,
    amountDueVnd: Math.max(0, ledger.dueVnd), overpaidVnd: Math.max(0, -ledger.dueVnd), dueDate: s.dueDate, paidAt: s.paidAt,
    feeScheduleId: s.feeScheduleId, overrideId: s.overrideId, createdAt: s.createdAt };
}
function orderView(o: OrderRow) {
  return { id: o.id, orderCode: o.orderCode.toString(), statementId: o.statementId, userId: o.userId, amountVnd: o.amountVnd, status: o.status,
    payosPaymentLinkId: o.payosPaymentLinkId, expiredAt: o.expiredAt, createdAt: o.createdAt, updatedAt: o.updatedAt };
}
function paymentView(p: PaymentRow) {
  return { id: p.id, statementId: p.statementId, userId: p.userId, source: p.source, amountVnd: p.amountVnd, orderId: p.orderId, bankReference: p.bankReference,
    receivedAt: p.receivedAt, recordedById: p.recordedById, note: p.note, createdAt: p.createdAt };
}
function scheduleView(s: ScheduleRow) {
  return { id: s.id, version: s.version, status: s.status, annualRatePercent: String(s.annualRatePercent), minMonthlyVnd: s.minMonthlyVnd, maxMonthlyVnd: s.maxMonthlyVnd,
    roundingStepVnd: s.roundingStepVnd, dueDay: s.dueDay, reminderDays: s.reminderDays, trialMonths: s.trialMonths, effectiveFromPeriod: s.effectiveFromPeriod,
    note: s.note, createdById: s.createdById, publishedById: s.publishedById, publishedAt: s.publishedAt, createdAt: s.createdAt, updatedAt: s.updatedAt };
}
function overrideView(o: OverrideRow, user?: UserBrief) {
  return { id: o.id, userId: o.userId, user: userView(user), kind: o.kind, value: o.value === null || o.value === undefined ? null : String(o.value),
    fromPeriod: o.fromPeriod, toPeriod: o.toPeriod, reason: o.reason, createdById: o.createdById, revokedAt: o.revokedAt, revokedById: o.revokedById, createdAt: o.createdAt };
}
/** Webhook payloads are stored masked; mask again on the way out so a row written by older code can never leak account numbers. */
function maskPayload(payload: unknown): Record<string, unknown> {
  const masked: Record<string, unknown> = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  for (const key of ["accountNumber", "counterAccountNumber", "virtualAccountNumber"])
    if (typeof masked[key] === "string" && masked[key] && !(masked[key] as string).startsWith("****")) masked[key] = "****" + (masked[key] as string).slice(-4);
  for (const key of ["counterAccountName", "virtualAccountName"]) if (masked[key]) masked[key] = "[masked]";
  return masked;
}

/** Customer-facing in-app notice (never contains the internal reason). */
const notify = (tx: Tx, userId: string, title: string, message: string, id?: string) =>
  tx.notification.create({ data: { ...(id ? { id } : {}), userId, title, message, path: "/user/account" } });

/** Account goes back to ACTIVE when its last overdue statement is cleared (same rule as a provider payment). */
async function reopenAccount(tx: Tx, userId: string, statementId: string) {
  const stillOverdue = await tx.feeStatement.count({ where: { userId, status: "OVERDUE", id: { not: statementId } } });
  if (!stillOverdue) await tx.billingAccount.updateMany({ where: { userId, status: "OVERDUE" }, data: { status: "ACTIVE", revision: { increment: 1 } } });
}

/**
 * After any ledger change, moves the statement to the state its ledger implies:
 * due ≤ 0 → PAID (WAIVED when no money was ever received) and the account is reopened if nothing else is overdue;
 * a PAID/WAIVED statement whose due is positive again (refund) → ISSUED, or OVERDUE when its due date has passed.
 * The account only follows when the statement becomes OVERDUE again, exactly like the markOverdue job does.
 */
async function resettle(tx: Tx, statementId: string, now: Date, paidAt?: Date) {
  const statement = await tx.feeStatement.findUnique({ where: { id: statementId } });
  if (!statement) throw notFound("kỳ phí");
  const dueVnd = await statementDue(tx, statement);
  let status = statement.status;
  if (status === "VOID") return { status, dueVnd };
  if (dueVnd <= 0 && OPEN.includes(status)) {
    // WAIVED when nothing was kept: no money received, or everything received was refunded.
    const payments = await tx.payment.findMany({ where: { statementId }, select: { id: true, amountVnd: true } });
    const refunds = payments.length ? await tx.refund.findMany({ where: { paymentId: { in: payments.map(p => p.id) } }, select: { amountVnd: true } }) : [];
    const kept = payments.reduce((sum, p) => sum + p.amountVnd, 0) - refunds.reduce((sum, r) => sum + r.amountVnd, 0);
    status = kept <= 0 ? "WAIVED" : "PAID";
    await tx.feeStatement.update({ where: { id: statementId }, data: { status, paidAt: status === "PAID" ? paidAt ?? now : null } });
    await reopenAccount(tx, statement.userId, statementId);
  } else if (dueVnd > 0 && (status === "PAID" || status === "WAIVED")) {
    status = statement.dueDate.getTime() < now.getTime() ? "OVERDUE" : "ISSUED";
    await tx.feeStatement.update({ where: { id: statementId }, data: { status, paidAt: null } });
    if (status === "OVERDUE") await tx.billingAccount.updateMany({ where: { userId: statement.userId, status: { in: ["ACTIVE", "TRIAL"] } }, data: { status: "OVERDUE", revision: { increment: 1 } } });
  }
  return { status, dueVnd };
}
async function cancelPendingOrders(tx: Tx, statementId: string): Promise<bigint[]> {
  const pending = await tx.paymentOrder.findMany({ where: { statementId, status: "PENDING" } });
  for (const order of pending) await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
  return pending.map(order => order.orderCode);
}

export type AlertType = "UNDERPAID" | "OVERPAID" | "EXTRA_TRANSFER";
type Alert = { key: string; type: AlertType; userId: string; user: { email: string; fullName: string } | null; statementId: string; period: string;
  orderId: string | null; amountVnd: number; message: string; occurredAt: Date; details: Record<string, unknown> };

export class BillingAdminService {
  constructor(private readonly db: PrismaClient, private readonly gateway: PaymentGateway | null, private readonly options: BillingAdminOptions) {}
  private now() { return this.options.now?.() ?? new Date(); }
  get enabled() { return this.options.enabled; }

  /** What the calling admin may do; the UI hides buttons accordingly. */
  async permissions(adminId: string) {
    const user = await this.db.user.findUnique({ where: { id: adminId }, select: { status: true, investmentRoles: true } });
    const roles = user && user.status === "ACTIVE" ? user.investmentRoles.map(grant => grant.role) : [];
    return { canOperate: roles.includes("OPERATIONS"), canManageSchedules: roles.includes("SYSTEM_ADMIN") };
  }

  // ───────────────────────── reading ─────────────────────────

  private async eachStatementBatch(where: Prisma.FeeStatementWhereInput, each: (rows: StatementRow[], ledgers: Map<string, Ledger>) => void | Promise<void>) {
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.db.feeStatement.findMany({ where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: BATCH });
      if (!rows.length) return;
      cursor = rows[rows.length - 1].id;
      await each(rows, await loadLedgers(this.db, rows));
      if (rows.length < BATCH) return;
    }
  }

  /** Totals for one period plus a 12-month series ending at it. Voided statements are left out of every money figure. */
  async overview(period?: string) {
    const selected = period ?? periodOf(this.now());
    const periods = Array.from({ length: 12 }, (_, index) => addMonths(selected, index - 11));
    const series = new Map(periods.map(p => [p, { period: p, statementCount: 0, dueTotalVnd: 0, collectedVnd: 0, remainingVnd: 0 }]));
    const counts: Record<string, number> = { ISSUED: 0, PAID: 0, OVERDUE: 0, WAIVED: 0, VOID: 0 };
    let overpaidVnd = 0;
    await this.eachStatementBatch({ period: { in: periods } }, (rows, ledgers) => {
      for (const row of rows) {
        const ledger = ledgers.get(row.id)!, entry = series.get(row.period)!;
        if (row.period === selected) counts[row.status]++;
        if (row.status === "VOID") continue;
        entry.statementCount++;
        entry.dueTotalVnd += row.amountVnd - ledger.adjustedVnd;
        entry.collectedVnd += ledger.paidVnd - ledger.refundedVnd;
        if (OPEN.includes(row.status)) entry.remainingVnd += Math.max(0, ledger.dueVnd);
        if (row.period === selected) overpaidVnd += Math.max(0, -ledger.dueVnd);
      }
    });
    const rate = (entry: { dueTotalVnd: number; collectedVnd: number }) => entry.dueTotalVnd > 0 ? Math.round(entry.collectedVnd / entry.dueTotalVnd * 10000) / 10000 : 0;
    const current = series.get(selected)!;
    const alerts = await this.deriveAlerts(this.db);
    return { period: selected, totals: { dueTotalVnd: current.dueTotalVnd, collectedVnd: current.collectedVnd, remainingVnd: current.remainingVnd, overpaidVnd,
      collectionRate: rate(current), statementCount: current.statementCount }, statusCounts: counts,
      series: periods.map(p => ({ ...series.get(p)!, collectionRate: rate(series.get(p)!) })), unresolvedAlertCount: alerts.filter(alert => !alert.resolved).length };
  }

  async statements(query: StatementsQuery) {
    const where: Prisma.FeeStatementWhereInput = {};
    if (query.period) where.period = query.period;
    if (query.status) where.status = query.status;
    if (query.overdueOnly) {
      if (query.status && query.status !== "OVERDUE") return { page: query.page, limit: query.limit, total: 0, items: [] };
      where.status = "OVERDUE";
    }
    if (query.q) {
      const needle = query.q;
      const users = await this.db.user.findMany({ where: { OR: [{ email: { contains: needle, mode: "insensitive" } }, { fullName: { contains: needle, mode: "insensitive" } }] }, select: { id: true }, take: 1000 });
      where.userId = { in: users.map(user => user.id) };
    }
    if (query.hasAlert !== undefined) {
      const ids = [...new Set((await this.deriveAlerts(this.db)).filter(alert => !alert.resolved).map(alert => alert.statementId))];
      where.id = query.hasAlert ? { in: ids } : { notIn: ids };
    }
    const [total, rows] = await Promise.all([this.db.feeStatement.count({ where }),
      this.db.feeStatement.findMany({ where, orderBy: [{ period: "desc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit })]);
    const [ledgers, users] = await Promise.all([loadLedgers(this.db, rows), loadUsers(this.db, rows.map(row => row.userId))]);
    return { page: query.page, limit: query.limit, total, items: rows.map(row => statementView(row, ledgers.get(row.id)!, users.get(row.userId))) };
  }

  async statement(id: string) {
    const db = this.db, s = await db.feeStatement.findUnique({ where: { id } });
    if (!s) throw notFound("kỳ phí");
    const [ledger, users, schedule, orders] = await Promise.all([
      loadLedgers(db, [s]).then(map => map.get(s.id)!), loadUsers(db, [s.userId]),
      db.feeSchedule.findUnique({ where: { id: s.feeScheduleId } }),
      db.paymentOrder.findMany({ where: { statementId: id }, orderBy: { createdAt: "desc" } }),
    ]);
    const [events, trail] = await Promise.all([
      orders.length ? db.paymentWebhookEvent.findMany({ where: { orderCode: { in: orders.map(order => order.orderCode) } }, orderBy: { receivedAt: "desc" }, take: 100 }) : [],
      db.auditLog.findMany({ where: { targetType: "FEE_STATEMENT", targetId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const refundedBy = new Map<string, number>();
    for (const refund of ledger.refunds) refundedBy.set(refund.paymentId, (refundedBy.get(refund.paymentId) ?? 0) + refund.amountVnd);
    const actors = await loadUsers(db, trail.filter(row => row.performerName === ACTOR && row.performerId).map(row => row.performerId!));
    return { ...statementView(s, ledger, users.get(s.userId)), baseSource: s.baseSource, schedule: schedule ? scheduleView(schedule) : null,
      adjustments: ledger.adjustments.map(row => ({ id: row.id, amountVnd: row.amountVnd, reason: row.reason, createdById: row.createdById, createdAt: row.createdAt })),
      payments: ledger.payments.map(payment => ({ ...paymentView(payment), refundedVnd: refundedBy.get(payment.id) ?? 0, refundableVnd: payment.amountVnd - (refundedBy.get(payment.id) ?? 0) })),
      refunds: ledger.refunds.map(row => ({ id: row.id, paymentId: row.paymentId, amountVnd: row.amountVnd, bankReference: row.bankReference, reason: row.reason, recordedById: row.recordedById, createdAt: row.createdAt })),
      orders: orders.map(orderView),
      webhookEvents: events.map(event => ({ id: event.id, orderCode: event.orderCode.toString(), reference: event.reference, signatureValid: event.signatureValid, outcome: event.outcome, payload: maskPayload(event.payload), receivedAt: event.receivedAt })),
      auditTrail: trail.map(row => ({ id: row.id, action: row.action, performerName: row.performerName, performer: userView(actors.get(row.performerId ?? "")), details: row.details, createdAt: row.createdAt })) };
  }

  async orders(query: OrdersQuery) {
    const where: Prisma.PaymentOrderWhereInput = {};
    if (query.status) where.status = query.status;
    const range: { gte?: Date; lt?: Date } = {};
    if (query.from) range.gte = new Date(`${query.from}T00:00:00.000+07:00`);
    if (query.to) range.lt = new Date(new Date(`${query.to}T00:00:00.000+07:00`).getTime() + DAY_MS);
    if (range.gte || range.lt) where.createdAt = range;
    const [total, rows] = await Promise.all([this.db.paymentOrder.count({ where }),
      this.db.paymentOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit })]);
    const [users, statements, payments] = await Promise.all([
      loadUsers(this.db, rows.map(row => row.userId)),
      rows.length ? this.db.feeStatement.findMany({ where: { id: { in: rows.map(row => row.statementId) } }, select: { id: true, period: true, status: true } }) : [],
      rows.length ? this.db.payment.findMany({ where: { orderId: { in: rows.map(row => row.id) } } }) : [],
    ]);
    return { page: query.page, limit: query.limit, total, items: rows.map(row => {
      const statement = statements.find(item => item.id === row.statementId), payment = payments.find(item => item.orderId === row.id);
      return { ...orderView(row), user: userView(users.get(row.userId)), period: statement?.period ?? null, statementStatus: statement?.status ?? null,
        receivedVnd: payment?.amountVnd ?? null, bankReference: payment?.bankReference ?? null, paidAt: payment?.receivedAt ?? null };
    }) };
  }

  /** Billing tab of the user detail page: account, statements, orders and overrides of one user. */
  async userBilling(userId: string) {
    const db = this.db, user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, fullName: true, status: true } });
    if (!user) throw notFound("tài khoản");
    const [account, statements, orders, overrides] = await Promise.all([
      db.billingAccount.findUnique({ where: { userId } }),
      db.feeStatement.findMany({ where: { userId }, orderBy: { period: "desc" }, take: 24 }),
      db.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
      db.userFeeOverride.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const ledgers = await loadLedgers(db, statements);
    return { user: { id: user.id, email: user.email, fullName: user.fullName, status: user.status },
      account: account ? { status: account.status, trialEndsAt: account.trialEndsAt, termsVersion: account.termsVersion, termsAcceptedAt: account.termsAcceptedAt,
        stoppedFromPeriod: account.stoppedFromPeriod, revision: account.revision } : null,
      statements: statements.map(row => statementView(row, ledgers.get(row.id)!)), orders: orders.map(orderView), overrides: overrides.map(row => overrideView(row)) };
  }

  // ───────────────────────── alerts (derived from data; "resolved" is an AuditLog row) ─────────────────────────

  /**
   * Alerts are never stored. They are recomputed from the ledger on every call, so they disappear by themselves once the
   * problem is fixed (e.g. an overpayment refunded). Resolving writes an AuditLog row keyed by the stable alert key.
   * Sources: UNDERPAID orders whose statement is still open; statements overpaid (due < 0) among payments recorded in the last
   * 180 days; EXTRA_TRANSFER webhook events (money that arrived for an already-paid order and is NOT in the ledger yet).
   */
  private async deriveAlerts(tx: Tx): Promise<Array<Alert & { resolved: null | { at: Date; note: string; byId: string | null } }>> {
    const found: Alert[] = [], since = new Date(this.now().getTime() - ALERT_WINDOW_DAYS * DAY_MS);
    const underpaid = await tx.paymentOrder.findMany({ where: { status: "UNDERPAID" }, orderBy: { updatedAt: "desc" }, take: BATCH });
    const recent = await tx.payment.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 2000 });
    const extra = await tx.paymentWebhookEvent.findMany({ where: { outcome: "EXTRA_TRANSFER", receivedAt: { gte: new Date(this.now().getTime() - 90 * DAY_MS) } }, orderBy: { receivedAt: "desc" }, take: 200 });
    const extraOrders = extra.length ? await tx.paymentOrder.findMany({ where: { orderCode: { in: extra.map(event => event.orderCode) } } }) : [];
    const statementIds = [...new Set([...underpaid.map(o => o.statementId), ...recent.map(p => p.statementId), ...extraOrders.map(o => o.statementId)])];
    const statements = statementIds.length ? await tx.feeStatement.findMany({ where: { id: { in: statementIds } } }) : [];
    const byId = new Map(statements.map(s => [s.id, s]));
    const ledgers = new Map<string, Ledger>();
    for (let index = 0; index < statements.length; index += BATCH) for (const [id, ledger] of await loadLedgers(tx, statements.slice(index, index + BATCH))) ledgers.set(id, ledger);
    const users = await loadUsers(tx, statements.map(s => s.userId));
    const base = (s: StatementRow) => ({ userId: s.userId, user: userView(users.get(s.userId)), statementId: s.id, period: s.period });

    for (const order of underpaid) {
      const s = byId.get(order.statementId);
      if (!s || !OPEN.includes(s.status)) continue;
      const ledger = ledgers.get(s.id)!, dueVnd = Math.max(0, ledger.dueVnd);
      if (dueVnd <= 0) continue;
      const received = ledger.payments.find(p => p.orderId === order.id)?.amountVnd ?? 0;
      found.push({ key: `UNDERPAID:${order.id}`, type: "UNDERPAID", ...base(s), orderId: order.id, amountVnd: dueVnd, occurredAt: order.updatedAt,
        message: `Khách chuyển thiếu: nhận ${money(received)} trên ${money(order.amountVnd)}, kỳ ${monthLabel(s.period)} còn thiếu ${money(dueVnd)}.`,
        details: { orderCode: order.orderCode.toString(), expectedVnd: order.amountVnd, receivedVnd: received } });
    }
    const seen = new Set<string>();
    for (const payment of recent) {
      if (seen.has(payment.statementId)) continue;
      seen.add(payment.statementId);
      const s = byId.get(payment.statementId), ledger = s ? ledgers.get(s.id) : undefined;
      if (!s || !ledger || s.status === "VOID" || ledger.dueVnd >= 0) continue;
      const excess = -ledger.dueVnd;
      found.push({ key: `OVERPAID:${s.id}:${excess}`, type: "OVERPAID", ...base(s), orderId: payment.orderId, amountVnd: excess, occurredAt: payment.createdAt,
        message: `Kỳ ${monthLabel(s.period)} đang thu thừa ${money(excess)}. Hãy kiểm tra và hoàn lại cho khách nếu đúng.`,
        details: { paymentCount: ledger.payments.length, paidVnd: ledger.paidVnd, dueVnd: s.amountVnd - ledger.adjustedVnd } });
    }
    for (const event of extra) {
      const order = extraOrders.find(o => o.orderCode === event.orderCode), s = order ? byId.get(order.statementId) : undefined;
      if (!order || !s) continue;
      const amount = Number((event.payload as Record<string, unknown> | null)?.amount ?? 0) || 0;
      found.push({ key: `EXTRA_TRANSFER:${event.id}`, type: "EXTRA_TRANSFER", ...base(s), orderId: order.id, amountVnd: amount, occurredAt: event.receivedAt,
        message: `Có thêm một khoản chuyển tiền cho đơn đã được thanh toán (mã tham chiếu ${event.reference}). Khoản này chưa nằm trong sổ: hãy ghi nhận thủ công hoặc hoàn lại cho khách.`,
        details: { orderCode: order.orderCode.toString(), reference: event.reference, amountVnd: amount } });
    }
    const resolvedRows = found.length ? await tx.auditLog.findMany({ where: { action: "BILLING_ALERT_RESOLVED", targetType: "BILLING_ALERT", targetId: { in: found.map(a => a.key) } }, orderBy: { createdAt: "desc" } }) : [];
    return found.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).map(alert => {
      const row = resolvedRows.find(item => item.targetId === alert.key);
      return { ...alert, resolved: row ? { at: row.createdAt, note: String((row.details as Record<string, unknown> | null)?.note ?? ""), byId: row.performerId } : null };
    });
  }

  async alerts(query: AlertsQuery) {
    const all = await this.deriveAlerts(this.db), list = query.includeResolved ? all : all.filter(alert => !alert.resolved);
    return { page: query.page, limit: query.limit, total: list.length, unresolvedCount: all.filter(alert => !alert.resolved).length,
      items: list.slice((query.page - 1) * query.limit, query.page * query.limit) };
  }

  async resolveAlert(adminId: string, input: { key: string; note: string }) {
    return transaction(this.db, async tx => {
      await need(tx, adminId, OPERATE, "đánh dấu đã xử lý cảnh báo");
      const alert = (await this.deriveAlerts(tx)).find(item => item.key === input.key);
      if (!alert) throw notFound("cảnh báo (có thể vấn đề đã được xử lý)");
      if (alert.resolved) throw new AppError(409, "ALERT_ALREADY_RESOLVED", "Cảnh báo này đã được đánh dấu đã xử lý.");
      await audit(tx, adminId, "BILLING_ALERT_RESOLVED", "BILLING_ALERT", input.key,
        { note: input.note, type: alert.type, statementId: alert.statementId, userId: alert.userId }, { performerName: ACTOR });
      return { key: input.key, type: alert.type, resolved: true, note: input.note, statementId: alert.statementId };
    });
  }

  // ───────────────────────── money movements (OPERATIONS) ─────────────────────────

  /** Customer paid by bank transfer outside payOS. Settles the statement exactly like a provider payment. */
  manualPayment(adminId: string, statementId: string, input: ManualPaymentInput, key: string) {
    return idempotentCommand(this.db, adminId, "billing.admin.manual-payment", key, { statementId, ...input }, async tx => {
      await need(tx, adminId, OPERATE, "ghi nhận chuyển khoản");
      const now = this.now(), receivedAt = new Date(input.receivedAt);
      if (receivedAt.getTime() > now.getTime() + 10 * 60_000) throw new AppError(422, "RECEIVED_AT_IN_FUTURE", "Ngày nhận tiền không được ở tương lai.");
      const statement = await tx.feeStatement.findUnique({ where: { id: statementId } });
      if (!statement) throw notFound("kỳ phí");
      if (statement.status === "VOID") throw new AppError(409, "STATEMENT_VOID", "Kỳ phí này đã bị hủy, không thể ghi nhận thanh toán.");
      if (await tx.payment.findFirst({ where: { source: "MANUAL_TRANSFER", bankReference: input.bankReference } }))
        throw new AppError(409, "DUPLICATE_BANK_REFERENCE", "Mã tham chiếu ngân hàng này đã được ghi nhận trước đó.");
      const payment = await tx.payment.create({ data: { statementId, userId: statement.userId, source: "MANUAL_TRANSFER", amountVnd: input.amountVnd,
        bankReference: input.bankReference, receivedAt, recordedById: adminId, note: input.reason } });
      const settled = await resettle(tx, statementId, now, receivedAt);
      await audit(tx, adminId, "BILLING_MANUAL_PAYMENT_RECORDED", "FEE_STATEMENT", statementId,
        { paymentId: payment.id, userId: statement.userId, amountVnd: input.amountVnd, bankReference: input.bankReference, receivedAt: receivedAt.toISOString(),
          reason: input.reason, statusAfter: settled.status, dueAfterVnd: settled.dueVnd }, { performerName: ACTOR });
      await notify(tx, statement.userId, "Đã ghi nhận chuyển khoản phí dịch vụ",
        `An Hưu đã ghi nhận ${money(input.amountVnd)} cho phí dịch vụ tháng ${monthLabel(statement.period)}${settled.dueVnd > 0 ? `, còn lại ${money(settled.dueVnd)}` : ""}. Cảm ơn bạn.`);
      await enqueue(tx, "billing.payment_received", payment.id, { paymentId: payment.id });
      return plain({ payment: paymentView(payment), statement: { id: statementId, period: statement.period, status: settled.status,
        amountDueVnd: Math.max(0, settled.dueVnd), overpaidVnd: Math.max(0, -settled.dueVnd) } });
    });
  }

  /** Records money handed back to the customer (the transfer itself happens in the bank). */
  refund(adminId: string, paymentId: string, input: RefundInput, key: string) {
    return idempotentCommand(this.db, adminId, "billing.admin.refund", key, { paymentId, ...input }, async tx => {
      await need(tx, adminId, OPERATE, "ghi nhận hoàn tiền");
      const now = this.now(), payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw notFound("khoản thanh toán");
      const previous = await tx.refund.findMany({ where: { paymentId }, select: { amountVnd: true } });
      const refundable = payment.amountVnd - previous.reduce((sum, row) => sum + row.amountVnd, 0);
      if (input.amountVnd > refundable)
        throw new AppError(409, "REFUND_EXCEEDS_PAYMENT", `Số tiền hoàn vượt quá số còn hoàn được (${money(refundable)}).`, undefined, { refundableVnd: refundable });
      if (await tx.refund.findFirst({ where: { bankReference: input.bankReference } }))
        throw new AppError(409, "DUPLICATE_BANK_REFERENCE", "Mã tham chiếu ngân hàng này đã được dùng cho một khoản hoàn khác.");
      const refund = await tx.refund.create({ data: { paymentId, amountVnd: input.amountVnd, bankReference: input.bankReference, reason: input.reason, recordedById: adminId } });
      const statement = await tx.feeStatement.findUnique({ where: { id: payment.statementId } });
      if (!statement) throw notFound("kỳ phí");
      let settled = await resettle(tx, statement.id, now);
      if (input.waiveRemaining && settled.dueVnd > 0) {
        await tx.statementAdjustment.create({ data: { statementId: statement.id, amountVnd: settled.dueVnd, reason: `Miễn phần còn lại khi hoàn tiền: ${input.reason}`, createdById: adminId } });
        settled = await resettle(tx, statement.id, now);
      }
      await audit(tx, adminId, "BILLING_REFUND_RECORDED", "FEE_STATEMENT", statement.id,
        { refundId: refund.id, paymentId, userId: statement.userId, amountVnd: input.amountVnd, bankReference: input.bankReference, reason: input.reason, waiveRemaining: input.waiveRemaining,
          statusBefore: statement.status, statusAfter: settled.status, dueAfterVnd: settled.dueVnd }, { performerName: ACTOR });
      await notify(tx, statement.userId, "Đã ghi nhận hoàn tiền phí dịch vụ",
        `An Hưu đã hoàn ${money(input.amountVnd)} cho phí dịch vụ tháng ${monthLabel(statement.period)}.` +
        (settled.dueVnd > 0 ? ` Kỳ phí này hiện còn ${money(settled.dueVnd)} cần thanh toán.` : ""));
      return plain({ refund: { id: refund.id, paymentId, amountVnd: refund.amountVnd, bankReference: refund.bankReference, reason: refund.reason, recordedById: adminId, createdAt: refund.createdAt },
        refundableVnd: refundable - input.amountVnd, statement: { id: statement.id, period: statement.period, status: settled.status,
          amountDueVnd: Math.max(0, settled.dueVnd), overpaidVnd: Math.max(0, -settled.dueVnd) } });
    });
  }

  /** Asks payOS about one order right now and applies what it reports (shared with the jobs and the result page). */
  async reconcileOrder(adminId: string, orderId: string, reason: string) {
    if (!this.gateway) throw new AppError(503, "BILLING_DISABLED", "Cổng thanh toán payOS chưa được cấu hình.");
    // The grant is checked in its own short transaction: reconcileOrder() applies the payment in a serializable transaction of its own.
    const order = await transaction(this.db, async tx => {
      await need(tx, adminId, OPERATE, "kiểm tra lại giao dịch với payOS");
      return tx.paymentOrder.findUnique({ where: { id: orderId } });
    });
    if (!order) throw notFound("giao dịch");
    const outcome = await reconcileOrder(this.db, this.gateway, order, this.now());
    const [fresh, statement] = await Promise.all([this.db.paymentOrder.findUnique({ where: { id: orderId } }), this.db.feeStatement.findUnique({ where: { id: order.statementId } })]);
    await transaction(this.db, tx => audit(tx, adminId, "BILLING_ORDER_RECONCILED", "PAYMENT_ORDER", orderId,
      { outcome, reason, orderCode: order.orderCode.toString(), statementId: order.statementId, userId: order.userId, orderStatusAfter: fresh?.status }, { performerName: ACTOR }));
    return { outcome, order: fresh ? orderView(fresh) : orderView(order),
      statement: statement ? { id: statement.id, period: statement.period, status: statement.status, amountDueVnd: Math.max(0, await statementDue(this.db, statement)) } : null };
  }

  private async cancelLinksQuietly(codes: bigint[], reason: string) {
    for (const code of codes) {
      try { await this.gateway?.cancelLink(Number(code), reason); }
      catch { log("warn", "billing.link_cancel_failed", { code: "CANCEL_FAILED" }); }
    }
  }

  /**
   * Reduces what the customer owes without touching the statement amount. Fully covered by adjustments alone → WAIVED;
   * covered together with payments → PAID. Open payOS links carry the old amount, so they are cancelled either way.
   */
  async adjust(adminId: string, statementId: string, input: AdjustInput) {
    const result = await transaction(this.db, async tx => {
      await need(tx, adminId, OPERATE, "giảm hoặc miễn kỳ phí");
      const now = this.now(), statement = await tx.feeStatement.findUnique({ where: { id: statementId } });
      if (!statement) throw notFound("kỳ phí");
      if (statement.status === "VOID") throw new AppError(409, "STATEMENT_VOID", "Kỳ phí này đã bị hủy.");
      if (!OPEN.includes(statement.status)) throw new AppError(409, "STATEMENT_SETTLED", "Kỳ phí này đã tất toán, không còn khoản để giảm.");
      const dueBefore = await statementDue(tx, statement);
      if (input.amountVnd > dueBefore)
        throw new AppError(409, "ADJUSTMENT_EXCEEDS_DUE", `Số tiền giảm vượt quá số còn phải thu (${money(Math.max(0, dueBefore))}).`, undefined, { amountDueVnd: Math.max(0, dueBefore) });
      const adjustment = await tx.statementAdjustment.create({ data: { statementId, amountVnd: input.amountVnd, reason: input.reason, createdById: adminId } });
      const settled = await resettle(tx, statementId, now);
      const cancelled = await cancelPendingOrders(tx, statementId);
      await audit(tx, adminId, "BILLING_STATEMENT_ADJUSTED", "FEE_STATEMENT", statementId,
        { adjustmentId: adjustment.id, userId: statement.userId, amountVnd: input.amountVnd, reason: input.reason, dueBeforeVnd: dueBefore, dueAfterVnd: settled.dueVnd,
          statusBefore: statement.status, statusAfter: settled.status, cancelledOrders: cancelled.length }, { performerName: ACTOR });
      await notify(tx, statement.userId, settled.dueVnd <= 0 ? "Phí dịch vụ tháng này đã được miễn" : "Phí dịch vụ tháng này được giảm",
        settled.dueVnd <= 0 ? `Phí dịch vụ tháng ${monthLabel(statement.period)} đã được điều chỉnh, bạn không còn khoản cần thanh toán.`
          : `Phí dịch vụ tháng ${monthLabel(statement.period)} được giảm ${money(input.amountVnd)}, còn lại ${money(settled.dueVnd)} cần thanh toán. Nếu bạn đã có mã thanh toán cũ, hãy tạo mã mới.`);
      return { cancelled, body: plain({ adjustment: { id: adjustment.id, statementId, amountVnd: adjustment.amountVnd, reason: adjustment.reason, createdById: adminId, createdAt: adjustment.createdAt },
        statement: { id: statementId, period: statement.period, status: settled.status, amountDueVnd: Math.max(0, settled.dueVnd) }, cancelledOrders: cancelled.length }) };
    });
    await this.cancelLinksQuietly(result.cancelled, "Kỳ phí đã được điều chỉnh");
    return result.body;
  }

  /** For a statement issued by mistake. Only possible while no money has been received for it. */
  async voidStatement(adminId: string, statementId: string, reason: string) {
    const result = await transaction(this.db, async tx => {
      await need(tx, adminId, OPERATE, "hủy kỳ phí");
      const statement = await tx.feeStatement.findUnique({ where: { id: statementId } });
      if (!statement) throw notFound("kỳ phí");
      if (statement.status === "VOID") throw new AppError(409, "STATEMENT_VOID", "Kỳ phí này đã bị hủy trước đó.");
      if (!OPEN.includes(statement.status)) throw new AppError(409, "STATEMENT_NOT_VOIDABLE", "Chỉ hủy được kỳ phí đang chờ thanh toán hoặc quá hạn.");
      if (await tx.payment.count({ where: { statementId } })) throw new AppError(409, "STATEMENT_HAS_PAYMENTS", "Kỳ phí đã có thanh toán nên không thể hủy. Hãy ghi nhận hoàn tiền hoặc điều chỉnh.");
      await tx.feeStatement.update({ where: { id: statementId }, data: { status: "VOID", paidAt: null } });
      const cancelled = await cancelPendingOrders(tx, statementId);
      await reopenAccount(tx, statement.userId, statementId);
      await audit(tx, adminId, "BILLING_STATEMENT_VOIDED", "FEE_STATEMENT", statementId,
        { userId: statement.userId, period: statement.period, amountVnd: statement.amountVnd, statusBefore: statement.status, reason, cancelledOrders: cancelled.length }, { performerName: ACTOR });
      await notify(tx, statement.userId, "Kỳ phí dịch vụ đã được hủy", `Kỳ phí dịch vụ tháng ${monthLabel(statement.period)} đã được hủy, bạn không cần thanh toán khoản này.`);
      return { cancelled, body: { id: statementId, period: statement.period, status: "VOID" as const, cancelledOrders: cancelled.length } };
    });
    await this.cancelLinksQuietly(result.cancelled, "Kỳ phí đã bị hủy");
    return result.body;
  }

  // ───────────────────────── fee schedules (SYSTEM_ADMIN) ─────────────────────────

  async schedules() {
    const rows = await this.db.feeSchedule.findMany({ orderBy: { version: "desc" }, take: 200 });
    return { items: rows.map(scheduleView) };
  }

  async createSchedule(adminId: string, input: CreateScheduleInput) {
    return transaction(this.db, async tx => {
      await need(tx, adminId, MANAGE, "tạo biểu phí");
      const last = await tx.feeSchedule.findFirst({ orderBy: { version: "desc" } });
      const { reason, note, ...terms } = input;
      const created = await tx.feeSchedule.create({ data: { ...terms, version: (last?.version ?? 0) + 1, status: "DRAFT", note: note ?? null,
        effectiveFromPeriod: null, publishedById: null, publishedAt: null, createdById: adminId } });
      await audit(tx, adminId, "BILLING_SCHEDULE_CREATED", "FEE_SCHEDULE", created.id, { version: created.version, terms, reason }, { performerName: ACTOR });
      return scheduleView(created);
    });
  }

  async patchSchedule(adminId: string, id: string, input: PatchScheduleInput) {
    return transaction(this.db, async tx => {
      await need(tx, adminId, MANAGE, "sửa biểu phí");
      const current = await tx.feeSchedule.findUnique({ where: { id } });
      if (!current) throw notFound("biểu phí");
      if (current.status !== "DRAFT") throw new AppError(409, "SCHEDULE_NOT_DRAFT", "Chỉ sửa được biểu phí ở trạng thái nháp.");
      if (current.updatedAt.toISOString() !== new Date(input.expectedUpdatedAt).toISOString())
        throw new AppError(409, "REVISION_CONFLICT", "Biểu phí vừa được người khác cập nhật. Hãy tải lại.");
      const { expectedUpdatedAt: _expected, reason, note, ...changes } = input;
      const merged = scheduleTerms.safeParse({ annualRatePercent: String(current.annualRatePercent), minMonthlyVnd: current.minMonthlyVnd, maxMonthlyVnd: current.maxMonthlyVnd,
        roundingStepVnd: current.roundingStepVnd, dueDay: current.dueDay, reminderDays: current.reminderDays, trialMonths: current.trialMonths,
        ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) });
      if (!merged.success) throw merged.error;
      const before = scheduleView(current);
      const updated = await tx.feeSchedule.update({ where: { id }, data: { ...merged.data, ...(note === undefined ? {} : { note }) } });
      await audit(tx, adminId, "BILLING_SCHEDULE_UPDATED", "FEE_SCHEDULE", id,
        { version: current.version, before: { annualRatePercent: before.annualRatePercent, minMonthlyVnd: before.minMonthlyVnd, maxMonthlyVnd: before.maxMonthlyVnd, roundingStepVnd: before.roundingStepVnd,
          dueDay: before.dueDay, reminderDays: before.reminderDays, trialMonths: before.trialMonths, note: before.note }, after: merged.data, reason }, { performerName: ACTOR });
      return scheduleView(updated);
    });
  }

  /**
   * What the draft would change: for every TRIAL/ACTIVE/OVERDUE account, next period's fee under the schedule in force
   * for that period versus under the draft, with the account's current fee base and any override. Read-only; pages of 500.
   */
  async previewSchedule(adminId: string, id: string) {
    await need(this.db, adminId, MANAGE, "xem trước tác động của biểu phí");
    const draft = await this.db.feeSchedule.findUnique({ where: { id } });
    if (!draft) throw notFound("biểu phí");
    const period = nextPeriod(periodOf(this.now())), current = await scheduleFor(this.db, period);
    if (!current) throw new AppError(409, "FEE_SCHEDULE_MISSING", "Chưa có biểu phí hiệu lực để so sánh.");
    const draftTerms = { annualRatePercent: String(draft.annualRatePercent), minMonthlyVnd: draft.minMonthlyVnd, maxMonthlyVnd: draft.maxMonthlyVnd, roundingStepVnd: draft.roundingStepVnd };
    const changes: Array<{ userId: string; baseAmountVnd: string; beforeVnd: number; afterVnd: number; deltaVnd: number }> = [];
    const totals = { accounts: 0, before: 0, after: 0, up: 0, down: 0, same: 0 };
    let cursor: string | undefined;
    for (;;) {
      const accounts = await this.db.billingAccount.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] }, ...(cursor ? { userId: { gt: cursor } } : {}) },
        select: { userId: true }, orderBy: { userId: "asc" }, take: BATCH });
      if (!accounts.length) break;
      cursor = accounts[accounts.length - 1].userId;
      const rows = await mapLimit(accounts, 25, async account => {
        const [base, override] = await Promise.all([feeBase(this.db, account.userId), overrideFor(this.db, account.userId, period)]);
        const terms = overrideTerms(override);
        const beforeVnd = computeFee(base.amount, current, terms).amountVnd, afterVnd = computeFee(base.amount, draftTerms, terms).amountVnd;
        return { userId: account.userId, baseAmountVnd: base.amount, beforeVnd, afterVnd, deltaVnd: afterVnd - beforeVnd };
      });
      for (const row of rows) {
        totals.accounts++; totals.before += row.beforeVnd; totals.after += row.afterVnd;
        if (row.deltaVnd > 0) totals.up++; else if (row.deltaVnd < 0) totals.down++; else totals.same++;
        if (row.deltaVnd !== 0) { changes.push(row); changes.sort((a, b) => Math.abs(b.deltaVnd) - Math.abs(a.deltaVnd) || (a.userId < b.userId ? -1 : 1)); if (changes.length > 20) changes.pop(); }
      }
      if (accounts.length < BATCH) break;
    }
    const users = await loadUsers(this.db, changes.map(row => row.userId));
    return { period, accountCount: totals.accounts, current: { id: current.id, version: current.version }, draft: { id: draft.id, version: draft.version, status: draft.status },
      totalBeforeVnd: totals.before, totalAfterVnd: totals.after, totalDeltaVnd: totals.after - totals.before,
      counts: { up: totals.up, down: totals.down, same: totals.same },
      topChanges: changes.map(row => ({ ...row, email: users.get(row.userId)?.email ?? null, fullName: users.get(row.userId)?.fullName ?? null })) };
  }

  async publishSchedule(adminId: string, id: string, input: PublishScheduleInput) {
    const outcome = await transaction(this.db, async tx => {
      await need(tx, adminId, MANAGE, "công bố biểu phí");
      const now = this.now(), currentPeriod = periodOf(now), schedule = await tx.feeSchedule.findUnique({ where: { id } });
      if (!schedule) throw notFound("biểu phí");
      if (schedule.status !== "DRAFT") throw new AppError(409, "SCHEDULE_NOT_DRAFT", "Chỉ công bố được biểu phí ở trạng thái nháp.");
      if (input.effectiveFromPeriod < nextPeriod(currentPeriod))
        throw new AppError(422, "EFFECTIVE_PERIOD_TOO_EARLY", `Biểu phí chỉ có thể áp dụng từ kỳ ${monthLabel(nextPeriod(currentPeriod))} trở đi.`);
      if (await tx.feeStatement.count({ where: { period: { gte: input.effectiveFromPeriod } } }))
        throw new AppError(409, "PERIOD_ALREADY_ISSUED", `Đã có kỳ phí được lập cho tháng ${monthLabel(input.effectiveFromPeriod)} trở đi nên không thể áp dụng biểu phí mới từ kỳ này.`);
      const upcoming = await tx.feeSchedule.findFirst({ where: { status: "PUBLISHED", effectiveFromPeriod: { gte: input.effectiveFromPeriod } } });
      if (upcoming && upcoming.effectiveFromPeriod! > currentPeriod)
        throw new AppError(409, "SCHEDULE_PERIOD_CONFLICT", `Đã có biểu phí phiên bản ${upcoming.version} công bố áp dụng từ tháng ${monthLabel(upcoming.effectiveFromPeriod!)}.`);
      const published = await tx.feeSchedule.update({ where: { id }, data: { status: "PUBLISHED", effectiveFromPeriod: input.effectiveFromPeriod, publishedById: adminId, publishedAt: now } });
      await audit(tx, adminId, "BILLING_SCHEDULE_PUBLISHED", "FEE_SCHEDULE", id,
        { version: published.version, effectiveFromPeriod: input.effectiveFromPeriod, reason: input.reason }, { performerName: ACTOR });
      return scheduleView(published);
    });
    // Announced after commit (it can be many rows). Ids are the same ones the 7-day rollover job uses, so nobody is told twice.
    const notified = await this.announceSchedule(outcome.id, input.effectiveFromPeriod);
    return { ...outcome, notified };
  }

  private async announceSchedule(scheduleId: string, effectiveFromPeriod: string) {
    let notified = 0, cursor: string | undefined;
    try {
      for (;;) {
        const accounts = await this.db.billingAccount.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] }, ...(cursor ? { userId: { gt: cursor } } : {}) },
          select: { userId: true }, orderBy: { userId: "asc" }, take: BATCH });
        if (!accounts.length) break;
        cursor = accounts[accounts.length - 1].userId;
        const ids = accounts.map(account => stableId(`billing-schedule:${scheduleId}:${account.userId}`));
        const existing = new Set((await this.db.notification.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(row => row.id));
        const data = accounts.map((account, index) => ({ id: ids[index], userId: account.userId, path: "/user/account", title: "Biểu phí dịch vụ sắp thay đổi",
          message: `Từ tháng ${monthLabel(effectiveFromPeriod)}, biểu phí dịch vụ có điều chỉnh. Bạn có thể xem chi tiết và ước tính phí trong mục Phí dịch vụ.` })).filter(row => !existing.has(row.id));
        if (data.length) notified += (await this.db.notification.createMany({ data, skipDuplicates: true })).count;
        if (accounts.length < BATCH) break;
      }
    } catch { log("warn", "billing.job_failed", { code: "ANNOUNCE_SCHEDULE" }); } // the rollover job announces again 7 days ahead with the same ids
    return notified;
  }

  // ───────────────────────── per-user overrides (OPERATIONS) ─────────────────────────

  /** Active = not revoked and not already finished before the current period. */
  async overrides(query: OverridesQuery) {
    const period = periodOf(this.now());
    const where: Prisma.UserFeeOverrideWhereInput = { revokedAt: null, OR: [{ toPeriod: null }, { toPeriod: { gte: period } }], ...(query.userId ? { userId: query.userId } : {}) };
    const [total, rows] = await Promise.all([this.db.userFeeOverride.count({ where }),
      this.db.userFeeOverride.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit })]);
    const users = await loadUsers(this.db, rows.map(row => row.userId));
    return { page: query.page, limit: query.limit, total, items: rows.map(row => overrideView(row, users.get(row.userId))) };
  }

  async createOverride(adminId: string, userId: string, input: CreateOverrideInput) {
    const value = this.overrideValue(input);
    return transaction(this.db, async tx => {
      await need(tx, adminId, OPERATE, "điều chỉnh phí theo người dùng");
      const period = periodOf(this.now()), user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true, fullName: true } });
      if (!user || user.role !== "USER") throw notFound("tài khoản người dùng");
      if (input.fromPeriod <= period) throw new AppError(422, "OVERRIDE_PERIOD_TOO_EARLY", `Ưu đãi chỉ áp dụng từ kỳ ${monthLabel(nextPeriod(period))} trở đi.`);
      if (input.toPeriod && input.toPeriod < input.fromPeriod) throw new AppError(422, "OVERRIDE_PERIOD_ORDER", "Kỳ kết thúc phải sau hoặc bằng kỳ bắt đầu.");
      const existing = await tx.userFeeOverride.findMany({ where: { userId, revokedAt: null } });
      const clash = existing.find(row => (row.toPeriod === null || row.toPeriod >= input.fromPeriod) && (!input.toPeriod || row.fromPeriod <= input.toPeriod));
      if (clash) throw new AppError(409, "OVERRIDE_OVERLAP", "Người dùng đã có ưu đãi phí trùng khoảng kỳ này. Hãy thu hồi ưu đãi cũ trước.", undefined, { overrideId: clash.id });
      const created = await tx.userFeeOverride.create({ data: { userId, kind: input.kind, value, fromPeriod: input.fromPeriod, toPeriod: input.toPeriod ?? null, reason: input.reason, createdById: adminId } });
      await audit(tx, adminId, "BILLING_OVERRIDE_CREATED", "USER_FEE_OVERRIDE", created.id,
        { userId, kind: input.kind, value, fromPeriod: input.fromPeriod, toPeriod: input.toPeriod ?? null, reason: input.reason }, { performerName: ACTOR });
      await notify(tx, userId, "Bạn được áp dụng ưu đãi phí dịch vụ",
        `Phí dịch vụ của bạn được điều chỉnh theo ưu đãi từ tháng ${monthLabel(input.fromPeriod)}${input.toPeriod ? ` đến tháng ${monthLabel(input.toPeriod)}` : ""}. Bạn có thể xem chi tiết trong mục Phí dịch vụ.`);
      return overrideView(created, { id: user.id, email: user.email, fullName: user.fullName });
    });
  }

  /** Same value rules as the table's CHECK constraints, with friendlier messages and a stricter lower bound for percent. */
  private overrideValue(input: CreateOverrideInput): string | null {
    const fail = (message: string) => new AppError(400, "VALIDATION_ERROR", message, { value: [message] });
    if (input.kind === "WAIVE") {
      if (input.value !== undefined && input.value !== null) throw fail("Miễn phí không có giá trị đi kèm.");
      return null;
    }
    if (input.value === undefined || input.value === null) throw fail("Cần nhập giá trị ưu đãi.");
    const value = String(input.value);
    if (input.kind === "DISCOUNT_PERCENT") {
      if (!/^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/.test(value) || Number(value) <= 0) throw fail("Phần trăm giảm phải lớn hơn 0 và không quá 100.");
      return value;
    }
    if (!/^\d{1,9}$/.test(value)) throw fail("Phí cố định phải là số nguyên VND không âm.");
    return String(Number(value));
  }

  /**
   * Takes effect from the next period, never retroactively: an override that already started keeps applying to the current
   * period (its statement may be issued already, or still to be issued) so it is closed with toPeriod = current period and
   * revokedAt stays empty — overrideFor() ignores revoked rows. One that has not started yet was never used, so it is revoked outright.
   */
  async revokeOverride(adminId: string, id: string, reason: string) {
    return transaction(this.db, async tx => {
      await need(tx, adminId, OPERATE, "thu hồi ưu đãi phí");
      const now = this.now(), period = periodOf(now), row = await tx.userFeeOverride.findUnique({ where: { id } });
      if (!row) throw notFound("ưu đãi phí");
      if (row.revokedAt) throw new AppError(409, "OVERRIDE_REVOKED", "Ưu đãi này đã được thu hồi.");
      if (row.toPeriod !== null && row.toPeriod <= period) throw new AppError(409, "OVERRIDE_ENDED", "Ưu đãi này đã hết hạn, không còn gì để thu hồi.");
      const started = row.fromPeriod <= period;
      const updated = await tx.userFeeOverride.update({ where: { id }, data: started ? { toPeriod: period } : { revokedAt: now, revokedById: adminId } });
      await audit(tx, adminId, "BILLING_OVERRIDE_REVOKED", "USER_FEE_OVERRIDE", id,
        { userId: row.userId, mode: started ? "END_AT_CURRENT_PERIOD" : "REVOKED_BEFORE_START", toPeriod: started ? period : row.toPeriod, reason }, { performerName: ACTOR });
      await notify(tx, row.userId, "Ưu đãi phí dịch vụ sẽ kết thúc",
        started ? `Ưu đãi phí dịch vụ của bạn kết thúc sau tháng ${monthLabel(period)}; từ tháng ${monthLabel(nextPeriod(period))} áp dụng biểu phí thông thường.`
          : "Ưu đãi phí dịch vụ đã được thông báo trước đó đã bị hủy; biểu phí thông thường sẽ được áp dụng.");
      return { ...overrideView(updated), effect: started ? "END_AT_CURRENT_PERIOD" : "REVOKED_BEFORE_START" };
    });
  }

  // ───────────────────────── accounting export ─────────────────────────

  async exportCsv(adminId: string, period?: string) {
    const selected = period ?? periodOf(this.now());
    const headers = ["Kỳ", "Email", "Họ tên", "Căn cứ phí (VND)", "Phí theo biểu (VND)", "Phí phải thu (VND)", "Điều chỉnh (VND)", "Đã thu (VND)", "Đã hoàn (VND)",
      "Còn phải thu (VND)", "Trạng thái", "Mã tham chiếu ngân hàng", "Ngày thu"];
    const lines: string[] = [headers.map(csvCell).join(",")];
    await this.eachStatementBatch({ period: selected }, async (rows, ledgers) => {
      const users = await loadUsers(this.db, rows.map(row => row.userId));
      for (const row of rows) {
        const ledger = ledgers.get(row.id)!, user = users.get(row.userId), last = ledger.payments[ledger.payments.length - 1];
        lines.push([row.period, user?.email ?? "", user?.fullName ?? "", String(row.baseAmountVnd).split(".")[0], String(row.scheduleFeeVnd), String(row.amountVnd),
          String(ledger.adjustedVnd), String(ledger.paidVnd), String(ledger.refundedVnd), String(Math.max(0, ledger.dueVnd)), statusLabel[row.status] ?? row.status,
          ledger.payments.map(payment => payment.bankReference).filter(Boolean).join("; "), last ? vnDate(last.receivedAt) : ""].map(csvCell).join(","));
      }
    });
    await transaction(this.db, tx => audit(tx, adminId, "BILLING_EXPORT_CSV", "FEE_STATEMENT_EXPORT", selected, { period: selected, rows: lines.length - 1 }, { performerName: ACTOR }));
    return { filename: `phi-dich-vu-${selected}.csv`, content: BOM + lines.join("\r\n") + "\r\n" };
  }
}
