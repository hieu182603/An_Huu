import type { OutboxEvent, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppConfig } from "../../config/env";
import type { MailSender } from "../../jobs/handlers";
import { renderBillingEmail } from "../../templates/billingEmail";
import { statementDue } from "./ledger";

const statementPayload = z.object({ statementId: z.string().uuid() }).strict();
const reminderPayload = z.object({ statementId: z.string().uuid(), day: z.number().int().min(1).max(31) }).strict();
const receiptPayload = z.object({ paymentId: z.string().uuid() }).strict();

/**
 * Outbox handler for `billing.*` events. Payloads hold ids only: the statement, the amounts and the
 * user's email are read at send time, so the mail always matches the ledger. Anything that no longer
 * applies (user not ACTIVE, statement settled before a reminder) is skipped silently.
 */
export async function handleBillingEvent(db: PrismaClient, config: AppConfig, send: MailSender, event: OutboxEvent) {
  const link = (path: string) => config.CLIENT_URL.replace(/\/$/, "") + path;
  const userOf = async (userId: string) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true, status: true } });
    return user && user.status === "ACTIVE" ? user : null;
  };
  if (event.type === "billing.statement_issued" || event.type === "billing.reminder") {
    const reminder = event.type === "billing.reminder";
    const { statementId } = (reminder ? reminderPayload : statementPayload).parse(event.payload);
    const statement = await db.feeStatement.findUnique({ where: { id: statementId } });
    if (!statement || !["ISSUED", "OVERDUE"].includes(statement.status)) return;
    const due = await statementDue(db, statement), user = await userOf(statement.userId);
    if (!user || due <= 0) return;
    await send({ to: user.email, ...renderBillingEmail({ kind: reminder ? "reminder" : "issued", name: user.fullName, period: statement.period,
      amountVnd: due, dueDate: statement.dueDate, link: link(`/user/billing/pay/${statement.id}`) }), idempotencyKey: event.id });
    return;
  }
  if (event.type === "billing.payment_received") {
    const { paymentId } = receiptPayload.parse(event.payload);
    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    const [statement, user] = await Promise.all([db.feeStatement.findUnique({ where: { id: payment.statementId } }), userOf(payment.userId)]);
    if (!statement || !user) return;
    await send({ to: user.email, ...renderBillingEmail({ kind: "receipt", name: user.fullName, period: statement.period, amountVnd: payment.amountVnd,
      receivedAt: payment.receivedAt, reference: payment.bankReference, remainingVnd: Math.max(0, await statementDue(db, statement)), link: link("/user/account") }), idempotencyKey: event.id });
    return;
  }
  throw new Error("UNSUPPORTED_EVENT");
}
