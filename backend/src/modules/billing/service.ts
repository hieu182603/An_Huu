import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { audit } from "../../common/audit";
import { log } from "../../common/logger";
import { transaction } from "../../common/transaction";
import { addMonths } from "../../common/calendar";
import { computeFee } from "./fee-math";
import { feeBase, overrideFor, overrideTerms, scheduleFor } from "./terms";
import { nextPeriod, periodOf, periodStart } from "./periods";
import { applyProviderPayment, parseProviderTime, reconcileOrder, statementDue } from "./ledger";
import { issueStatementIn } from "./jobs";
import { verifyDataSignature, type PaymentGateway } from "./payos";

export type BillingOptions = {
  enabled: boolean;
  termsVersion: string;
  /** Frontend page payOS returns to after paying or cancelling. */
  returnUrl: string;
  checksumKey?: string;
  linkTtlMinutes?: number;
  now?: () => Date;
};
type Tx = Prisma.TransactionClient;
type ScheduleRow = NonNullable<Awaited<ReturnType<typeof scheduleFor>>>;
type OrderRow = Prisma.PaymentOrderGetPayload<object>;

const REUSE_MARGIN_MS = 2 * 60_000;
const revisionConflict = () => new AppError(409, "REVISION_CONFLICT", "Trạng thái dịch vụ đã thay đổi. Hãy tải lại.");
const notFound = () => new AppError(404, "NOT_FOUND", "Không tìm thấy dữ liệu phí dịch vụ.");

function scheduleView(s: ScheduleRow) {
  return { id: s.id, version: s.version, annualRatePercent: String(s.annualRatePercent), minMonthlyVnd: s.minMonthlyVnd,
    maxMonthlyVnd: s.maxMonthlyVnd, roundingStepVnd: s.roundingStepVnd, dueDay: s.dueDay, reminderDays: s.reminderDays,
    trialMonths: s.trialMonths, effectiveFromPeriod: s.effectiveFromPeriod };
}
function orderView(o: OrderRow) {
  return { id: o.id, orderCode: o.orderCode.toString(), statementId: o.statementId, amountVnd: o.amountVnd, status: o.status,
    checkoutUrl: o.checkoutUrl, qrCode: o.qrCode, expiredAt: o.expiredAt };
}
function accountView(a: Prisma.BillingAccountGetPayload<object>) {
  return { status: a.status, trialEndsAt: a.trialEndsAt, termsVersion: a.termsVersion, termsAcceptedAt: a.termsAcceptedAt,
    stoppedFromPeriod: a.stoppedFromPeriod, revision: a.revision };
}
async function statementView(tx: Tx, s: Prisma.FeeStatementGetPayload<object>) {
  return { id: s.id, period: s.period, status: s.status, baseAmountVnd: String(s.baseAmountVnd), rawFeeVnd: String(s.rawFeeVnd),
    scheduleFeeVnd: s.scheduleFeeVnd, amountVnd: s.amountVnd, amountDueVnd: Math.max(0, await statementDue(tx, s)),
    dueDate: s.dueDate, paidAt: s.paidAt, feeScheduleId: s.feeScheduleId, overrideId: s.overrideId, createdAt: s.createdAt };
}

export class BillingService {
  constructor(private readonly db: PrismaClient, private readonly gateway: PaymentGateway | null, private readonly options: BillingOptions) {}
  private now() { return this.options.now?.() ?? new Date(); }
  get enabled() { return this.options.enabled; }
  private ensureEnabled(needsGateway = false) {
    if (!this.options.enabled || (needsGateway && !this.gateway))
      throw new AppError(503, "BILLING_DISABLED", "Chức năng phí dịch vụ chưa được bật.");
  }
  private async schedule(tx: Tx, period: string) {
    const schedule = await scheduleFor(tx, period);
    if (!schedule) throw new AppError(409, "FEE_SCHEDULE_MISSING", "Chưa có biểu phí hiệu lực.");
    return schedule;
  }

  /** Public: schedule in force now and the next published one, if any. */
  async publicSchedule() {
    this.ensureEnabled();
    const period = periodOf(this.now()), current = await this.schedule(this.db, period);
    const upcoming = await this.db.feeSchedule.findFirst({ where: { status: "PUBLISHED", effectiveFromPeriod: { gt: period } }, orderBy: { effectiveFromPeriod: "asc" } });
    return { period, termsVersion: this.options.termsVersion, current: scheduleView(current), upcoming: upcoming ? scheduleView(upcoming) : null };
  }

  /** Fee the user would pay from next period for a given base (onboarding / asset edit preview). */
  async estimate(userId: string, baseAmountVnd: string) {
    this.ensureEnabled();
    const period = nextPeriod(periodOf(this.now()));
    const [schedule, override] = await Promise.all([this.schedule(this.db, period), overrideFor(this.db, userId, period)]);
    return { period, ...computeFee(baseAmountVnd, schedule, overrideTerms(override)), schedule: scheduleView(schedule) };
  }

  /** Records consent to the fee terms; the first acceptance opens a TRIAL account. Idempotent per version. */
  async acceptTerms(userId: string, termsVersion: string) {
    this.ensureEnabled();
    if (termsVersion !== this.options.termsVersion)
      throw new AppError(409, "TERMS_VERSION_MISMATCH", "Điều khoản phí đã được cập nhật. Vui lòng tải lại và đọc phiên bản mới.");
    const now = this.now(), period = periodOf(now);
    return transaction(this.db, async tx => {
      const existing = await tx.billingAccount.findUnique({ where: { userId } });
      if (existing?.termsVersion === termsVersion) return accountView(existing);
      if (existing) {
        const updated = await tx.billingAccount.update({ where: { userId }, data: { termsVersion, termsAcceptedAt: now, revision: { increment: 1 } } });
        await audit(tx, userId, "BILLING_TERMS_ACCEPTED", "BILLING_ACCOUNT", userId, { termsVersion, previousVersion: existing.termsVersion });
        return accountView(updated);
      }
      const schedule = await this.schedule(tx, period);
      // Trial runs to the start of the period `trialMonths` after the current one: the first
      // statement is issued on the 1st of that month (no pro-rata days).
      const trial = schedule.trialMonths > 0;
      const created = await tx.billingAccount.create({ data: { userId, status: trial ? "TRIAL" : "ACTIVE",
        trialEndsAt: trial ? periodStart(addMonths(period, schedule.trialMonths)) : null, termsVersion, termsAcceptedAt: now } });
      await audit(tx, userId, "BILLING_TERMS_ACCEPTED", "BILLING_ACCOUNT", userId, { termsVersion, trialMonths: schedule.trialMonths });
      return accountView(created);
    });
  }

  /** Account page: account state, the statement to act on, and next period's estimate from the current profile. */
  async overview(userId: string) {
    this.ensureEnabled();
    const db = this.db, period = nextPeriod(periodOf(this.now()));
    const account = await db.billingAccount.findUnique({ where: { userId } });
    const open = await db.feeStatement.findFirst({ where: { userId, status: { in: ["ISSUED", "OVERDUE"] } }, orderBy: { period: "asc" } })
      ?? await db.feeStatement.findFirst({ where: { userId }, orderBy: { period: "desc" } });
    const [schedule, override, base] = await Promise.all([scheduleFor(db, period), overrideFor(db, userId, period), feeBase(db, userId)]);
    return {
      termsVersion: this.options.termsVersion,
      account: account ? accountView(account) : null,
      termsRequired: !account || account.termsVersion !== this.options.termsVersion,
      currentStatement: open ? await statementView(db, open) : null,
      nextEstimate: schedule ? { period, ...computeFee(base.amount, schedule, overrideTerms(override)), baseSource: base.source } : null,
      override: override ? { id: override.id, kind: override.kind, value: override.value === null ? null : String(override.value), fromPeriod: override.fromPeriod, toPeriod: override.toPeriod } : null,
    };
  }

  async statements(userId: string, page: number, limit: number) {
    this.ensureEnabled();
    const where = { userId };
    const [total, rows] = await Promise.all([this.db.feeStatement.count({ where }),
      this.db.feeStatement.findMany({ where, orderBy: { period: "desc" }, skip: (page - 1) * limit, take: limit })]);
    return { page, limit, total, items: await Promise.all(rows.map(row => statementView(this.db, row))) };
  }

  async statement(userId: string, id: string) {
    this.ensureEnabled();
    const s = await this.db.feeStatement.findFirst({ where: { id, userId } });
    if (!s) throw notFound();
    const [schedule, adjustments, payments, orders] = await Promise.all([
      this.db.feeSchedule.findUnique({ where: { id: s.feeScheduleId } }),
      this.db.statementAdjustment.findMany({ where: { statementId: id }, orderBy: { createdAt: "asc" }, select: { id: true, amountVnd: true, reason: true, createdAt: true } }),
      this.db.payment.findMany({ where: { statementId: id }, orderBy: { receivedAt: "asc" }, select: { id: true, source: true, amountVnd: true, receivedAt: true, bankReference: true } }),
      this.db.paymentOrder.findMany({ where: { statementId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const refunds = payments.length ? await this.db.refund.findMany({ where: { paymentId: { in: payments.map(p => p.id) } }, select: { id: true, paymentId: true, amountVnd: true, createdAt: true } }) : [];
    return { ...(await statementView(this.db, s)), baseSource: s.baseSource, schedule: schedule ? scheduleView(schedule) : null,
      adjustments, payments, refunds, orders: orders.map(orderView) };
  }

  /**
   * Creates (or reuses) a payOS link for the statement's remaining amount. The DB transaction
   * only reserves the order; the provider call happens outside it so no transaction waits on payOS.
   */
  async pay(userId: string, statementId: string, key: string) {
    this.ensureEnabled(true);
    z.string().uuid().parse(key);
    const scope = "billing.pay", requestHash = digest({ statementId });
    const previous = await this.db.idempotencyRecord.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_CONFLICT", "Khóa yêu cầu đã dùng với nội dung khác.");
      return previous.response;
    }
    const now = this.now(), ttl = (this.options.linkTtlMinutes ?? 15) * 60_000;
    const prepared = await transaction(this.db, async tx => {
      const statement = await tx.feeStatement.findFirst({ where: { id: statementId, userId } });
      if (!statement) throw notFound();
      if (!["ISSUED", "OVERDUE"].includes(statement.status)) throw new AppError(409, "STATEMENT_SETTLED", "Kỳ phí này không còn khoản cần thanh toán.");
      const due = await statementDue(tx, statement);
      if (due <= 0) throw new AppError(409, "STATEMENT_SETTLED", "Kỳ phí này không còn khoản cần thanh toán.");
      const pending = await tx.paymentOrder.findMany({ where: { statementId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
      const reusable = pending.find(o => o.amountVnd === due && o.checkoutUrl && o.expiredAt.getTime() > now.getTime() + REUSE_MARGIN_MS);
      if (reusable) return { order: reusable, created: false, cancel: [] as bigint[] };
      const stale = pending.filter(o => o.id !== reusable);
      for (const order of stale) await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      const order = await tx.paymentOrder.create({ data: { statementId, userId, amountVnd: due, expiredAt: new Date(now.getTime() + ttl) } });
      return { order, created: true, cancel: stale.map(o => o.orderCode) };
    });
    for (const code of prepared.cancel) await this.cancelQuietly(code);
    let order = prepared.order;
    if (prepared.created) {
      const orderCode = Number(order.orderCode), back = (cancel: boolean) => `${this.options.returnUrl}${this.options.returnUrl.includes("?") ? "&" : "?"}orderId=${order.id}${cancel ? "&cancelled=1" : ""}`;
      try {
        const link = await this.gateway!.createLink({ orderCode, amount: order.amountVnd, description: `AH${orderCode}`.slice(0, 9),
          returnUrl: back(false), cancelUrl: back(true), expiredAt: Math.floor(order.expiredAt.getTime() / 1000) });
        order = await this.db.paymentOrder.update({ where: { id: order.id }, data: { payosPaymentLinkId: link.paymentLinkId, checkoutUrl: link.checkoutUrl, qrCode: link.qrCode } });
      } catch (error) {
        await this.db.paymentOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
        throw error;
      }
    }
    // JSON form so a replayed key returns exactly what the first call returned.
    const response = JSON.parse(JSON.stringify(orderView(order))) as Prisma.InputJsonObject;
    try { await this.db.idempotencyRecord.create({ data: { userId, scope, key, requestHash, response } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error; }
    return response;
  }

  private async cancelQuietly(orderCode: bigint) {
    try { await this.gateway?.cancelLink(Number(orderCode), "Đã tạo mã thanh toán mới"); }
    catch { log("warn", "billing.link_cancel_failed", { code: "CANCEL_FAILED" }); }
  }

  /** Result page polling. A still-pending order is reconciled with payOS, so a lost webhook never blocks the user. */
  async order(userId: string, orderId: string) {
    this.ensureEnabled();
    let order = await this.db.paymentOrder.findFirst({ where: { id: orderId, userId } });
    if (!order) throw notFound();
    if (order.status === "PENDING" && this.gateway) {
      await this.reconcileOrder(order).catch(() => undefined);
      order = (await this.db.paymentOrder.findFirst({ where: { id: orderId, userId } }))!;
    }
    const statement = await this.db.feeStatement.findUnique({ where: { id: order.statementId } });
    return { order: orderView(order), statement: statement ? { id: statement.id, period: statement.period, status: statement.status, amountDueVnd: Math.max(0, await statementDue(this.db, statement)) } : null };
  }

  /** Asks payOS for the order's state and applies it (shared with the expiry and reconcile jobs). */
  reconcileOrder(order: OrderRow) {
    return reconcileOrder(this.db, this.gateway!, order, this.now());
  }

  /** Account page: stop billing from the next period. The current period's statement stays payable. */
  async stop(userId: string, expectedRevision: number) {
    this.ensureEnabled();
    const next = nextPeriod(periodOf(this.now()));
    return transaction(this.db, async tx => {
      const account = await this.accountAt(tx, userId, expectedRevision);
      if (account.status === "STOPPED") return accountView(account);
      const moved = await tx.billingAccount.updateMany({ where: { userId, revision: expectedRevision }, data: { status: "STOPPED", stoppedFromPeriod: next, revision: { increment: 1 } } });
      if (moved.count === 0) throw revisionConflict();
      await audit(tx, userId, "BILLING_STOPPED", "BILLING_ACCOUNT", userId, { stoppedFromPeriod: next, previousStatus: account.status });
      return accountView((await tx.billingAccount.findUnique({ where: { userId } }))!);
    });
  }

  /** Resume billing. Back to OVERDUE if an unpaid overdue statement is still open, back to TRIAL if the trial has not ended; issues this month's statement at once when none exists. */
  async resume(userId: string, expectedRevision: number) {
    this.ensureEnabled();
    const now = this.now(), period = periodOf(now);
    return transaction(this.db, async tx => {
      const account = await this.accountAt(tx, userId, expectedRevision);
      if (account.status !== "STOPPED") throw new AppError(409, "BILLING_NOT_STOPPED", "Dịch vụ đang hoạt động, không cần dùng lại.");
      const overdue = await tx.feeStatement.count({ where: { userId, status: "OVERDUE" } });
      const moved = await tx.billingAccount.updateMany({ where: { userId, revision: expectedRevision, status: "STOPPED" },
        data: { status: overdue ? "OVERDUE" : account.trialEndsAt && account.trialEndsAt.getTime() > now.getTime() ? "TRIAL" : "ACTIVE", stoppedFromPeriod: null, revision: { increment: 1 } } });
      if (moved.count === 0) throw revisionConflict();
      await audit(tx, userId, "BILLING_RESUMED", "BILLING_ACCOUNT", userId, { overdue: overdue > 0 });
      const resumed = (await tx.billingAccount.findUnique({ where: { userId } }))!;
      await issueStatementIn(tx, resumed, period, now);
      return accountView((await tx.billingAccount.findUnique({ where: { userId } }))!);
    });
  }

  private async accountAt(tx: Tx, userId: string, expectedRevision: number) {
    const account = await tx.billingAccount.findUnique({ where: { userId } });
    if (!account) throw new AppError(409, "TERMS_REQUIRED", "Bạn cần đồng ý điều khoản phí dịch vụ trước.");
    if (account.revision !== expectedRevision) throw revisionConflict();
    return account;
  }

  /** What blocks the user when the account is OVERDUE (null otherwise). Used by the 402 gate. */
  async overdueNotice(userId: string) {
    if (!this.options.enabled) return null;
    // Keyed on the unpaid OVERDUE statement, not the account status: stopping the service while
    // overdue must not lift the gate (the debt stays until it is paid, adjusted or waived).
    const statements = await this.db.feeStatement.findMany({ where: { userId, status: "OVERDUE" }, orderBy: { period: "asc" } });
    for (const statement of statements) {
      const amountDueVnd = await statementDue(this.db, statement);
      if (amountDueVnd > 0) return { statementId: statement.id, amountDueVnd, dueDate: statement.dueDate };
    }
    return null;
  }

  /** payOS webhook. Signature over `data` is the only authentication; amounts come from the DB order. */
  async handleWebhook(body: unknown): Promise<{ outcome: string }> {
    this.ensureEnabled(true);
    const envelope = webhookSchema.safeParse(body);
    if (!envelope.success) throw new AppError(400, "INVALID_WEBHOOK", "Dữ liệu webhook không hợp lệ.");
    if (!this.options.checksumKey || !verifyDataSignature(this.options.checksumKey, envelope.data.data, envelope.data.signature)) {
      log("warn", "billing.webhook", { code: "BAD_SIGNATURE" });
      throw new AppError(400, "INVALID_SIGNATURE", "Chữ ký webhook không hợp lệ.");
    }
    const data = webhookDataSchema.safeParse(envelope.data.data);
    if (!data.success) throw new AppError(400, "INVALID_WEBHOOK", "Dữ liệu webhook không hợp lệ.");
    const orderCode = BigInt(data.data.orderCode), reference = data.data.reference, payload = maskPayload(envelope.data.data);
    const outcome = await transaction(this.db, async tx => {
      if (await tx.paymentWebhookEvent.findFirst({ where: { orderCode, reference } })) return "DUPLICATE";
      const order = await tx.paymentOrder.findUnique({ where: { orderCode } });
      let result: string;
      if (envelope.data.code !== "00" || !order) result = order ? "NOT_SUCCESS" : "UNKNOWN_ORDER";
      else result = await applyProviderPayment(tx, order, { amount: data.data.amount, reference, receivedAt: parseProviderTime(data.data.transactionDateTime, this.now()) });
      await tx.paymentWebhookEvent.create({ data: { orderCode, reference, signatureValid: true, outcome: result, payload } });
      return result;
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "DUPLICATE";
      throw error;
    });
    log("info", "billing.webhook", { code: outcome });
    return { outcome };
  }
}

const webhookSchema = z.object({ code: z.string(), desc: z.string().optional(), success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()), signature: z.string() }).passthrough();
const webhookDataSchema = z.object({ orderCode: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), amount: z.number().int(),
  reference: z.string().min(1).max(200), transactionDateTime: z.string().optional() }).passthrough();
/** Keeps the webhook for audit without storing counterparty account numbers or names. */
function maskPayload(data: Record<string, unknown>): Prisma.InputJsonObject {
  const masked: Record<string, unknown> = { ...data };
  for (const key of ["accountNumber", "counterAccountNumber", "virtualAccountNumber"])
    if (typeof masked[key] === "string" && masked[key]) masked[key] = "****" + (masked[key] as string).slice(-4);
  for (const key of ["counterAccountName", "virtualAccountName"]) if (masked[key]) masked[key] = "[masked]";
  return JSON.parse(JSON.stringify(masked));
}
