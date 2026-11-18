import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";
import { enqueue } from "../../jobs/outbox";
import { amountDue } from "./fee-math";
import type { PaymentGateway } from "./payos";

type Tx = Prisma.TransactionClient;
const money = (value: number) => value.toLocaleString("vi-VN") + "đ";

/** Remaining amount of a statement from its ledger (adjustments, payments, refunds). */
export async function statementDue(tx: Tx, statement: { id: string; amountVnd: number }) {
  const [adjustments, payments] = await Promise.all([
    tx.statementAdjustment.findMany({ where: { statementId: statement.id }, select: { amountVnd: true } }),
    tx.payment.findMany({ where: { statementId: statement.id }, select: { id: true, amountVnd: true } }),
  ]);
  const refunds = payments.length
    ? await tx.refund.findMany({ where: { paymentId: { in: payments.map(p => p.id) } }, select: { amountVnd: true } }) : [];
  return amountDue({ amountVnd: statement.amountVnd, adjustments: adjustments.map(a => a.amountVnd),
    payments: payments.map(p => p.amountVnd), refunds: refunds.map(r => r.amountVnd) });
}

export type PaymentOutcome = "APPLIED" | "UNDERPAID" | "DUPLICATE" | "EXTRA_TRANSFER" | "IGNORED";
type OrderRow = { id: string; orderCode: bigint; statementId: string; userId: string; amountVnd: number };

/**
 * Records money received by payOS for an order, inside the caller's transaction.
 * Shared by the webhook and by active reconciliation, so whichever arrives first wins and
 * the other is a no-op. The amount recorded is what the provider reports, never the order amount.
 */
export async function applyProviderPayment(tx: Tx, order: OrderRow, input: { amount: number; reference: string; receivedAt: Date }): Promise<PaymentOutcome> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return "IGNORED";
  const existing = await tx.payment.findUnique({ where: { orderId: order.id } });
  if (existing) return existing.bankReference === input.reference ? "DUPLICATE" : "EXTRA_TRANSFER";
  if (await tx.payment.findFirst({ where: { source: "PAYOS", bankReference: input.reference } })) return "DUPLICATE";
  const payment = await tx.payment.create({ data: { statementId: order.statementId, userId: order.userId, source: "PAYOS", amountVnd: input.amount,
    orderId: order.id, bankReference: input.reference, receivedAt: input.receivedAt } });
  const underpaid = input.amount < order.amountVnd;
  await tx.paymentOrder.update({ where: { id: order.id }, data: { status: underpaid ? "UNDERPAID" : "PAID" } });
  const statement = await tx.feeStatement.findUnique({ where: { id: order.statementId } });
  if (!statement) throw new Error("BILLING_STATEMENT_MISSING");
  const due = await statementDue(tx, statement);
  if (due <= 0 && statement.status !== "PAID") {
    await tx.feeStatement.update({ where: { id: statement.id }, data: { status: "PAID", paidAt: input.receivedAt } });
    const stillOverdue = await tx.feeStatement.count({ where: { userId: order.userId, status: "OVERDUE", id: { not: statement.id } } });
    if (!stillOverdue) await tx.billingAccount.updateMany({ where: { userId: order.userId, status: "OVERDUE" }, data: { status: "ACTIVE", revision: { increment: 1 } } });
  }
  await audit(tx, order.userId, "BILLING_PAYMENT_RECEIVED", "FEE_STATEMENT", statement.id,
    { orderCode: order.orderCode.toString(), amountVnd: input.amount, underpaid, remainingVnd: Math.max(0, due) }, { performerName: "payOS" });
  await tx.notification.create({ data: underpaid
    ? { userId: order.userId, title: "Đã nhận một phần phí dịch vụ", message: `An Hưu đã nhận ${money(input.amount)} cho phí dịch vụ tháng ${statement.period}, còn thiếu ${money(Math.max(0, due))}. Bộ phận hỗ trợ sẽ liên hệ với bạn.`, path: "/user/account" }
    : { userId: order.userId, title: "Thanh toán phí dịch vụ thành công", message: `An Hưu đã nhận ${money(input.amount)} cho phí dịch vụ tháng ${statement.period}. Cảm ơn bạn.`, path: "/user/account" } });
  // The receipt email is sent by the worker from the payment id alone (billing/mail.ts).
  await enqueue(tx, "billing.payment_received", payment.id, { paymentId: payment.id });
  return underpaid ? "UNDERPAID" : "APPLIED";
}

type OrderFull = Prisma.PaymentOrderGetPayload<object>;
/**
 * Asks payOS for the order's state and applies it, so a payment is never missed when the webhook
 * is lost. Used by the result page, the expiry job and the reconcile job. Idempotent: an
 * already-applied payment is a DUPLICATE no-op and the PENDING → EXPIRED/CANCELLED step is conditional.
 */
export async function reconcileOrder(db: PrismaClient, gateway: PaymentGateway, order: OrderFull, now: Date): Promise<PaymentOutcome | "EXPIRED" | "CANCELLED" | "PENDING"> {
  const info = await gateway.getLink(Number(order.orderCode));
  if (info.amountPaid > 0) {
    const latest = info.transactions[info.transactions.length - 1];
    return transaction(db, async tx => {
      const fresh = await tx.paymentOrder.findUnique({ where: { id: order.id } });
      if (!fresh) return "IGNORED" as const;
      return applyProviderPayment(tx, fresh, { amount: info.amountPaid, reference: latest?.reference ?? `PAYOS-${order.orderCode}`,
        receivedAt: parseProviderTime(latest?.transactionDateTime, now) });
    });
  }
  if (["CANCELLED", "EXPIRED"].includes(info.status) || order.expiredAt.getTime() < now.getTime()) {
    const status = info.status === "CANCELLED" ? "CANCELLED" : "EXPIRED";
    await db.paymentOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status } });
    return status;
  }
  return "PENDING";
}

/** payOS transactionDateTime is Vietnam local time "YYYY-MM-DD HH:mm:ss". */
export function parseProviderTime(value: string | undefined, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) return fallback;
  const date = new Date(value.replace(" ", "T") + "+07:00");
  return Number.isNaN(date.getTime()) ? fallback : date;
}
