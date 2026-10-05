import { randomUUID } from "node:crypto";
import { type OutboxEvent, type PrismaClient } from "@prisma/client";
import { transaction } from "../common/transaction";
import { MailDeliveryError } from "./mail";

export type EventHandler = (event: OutboxEvent) => Promise<void>;
export const eligible = (now: Date) => ({
  OR: [
    { status: "PENDING", availableAt: { lte: now } },
    { status: "PROCESSING", lockedUntil: { lt: now } },
  ],
});
export class OutboxProcessor {
  constructor(private db: PrismaClient, private handle: EventHandler) {}
  async process(id: string) {
    const now = new Date(), leaseId = randomUUID();
    const claim = await this.db.outboxEvent.updateMany({
      where: { id, ...eligible(now) },
      data: { status: "PROCESSING", leaseId, lockedUntil: new Date(now.getTime() + 90000), attempts: { increment: 1 } },
    });
    if (!claim.count) return;
    const event = await this.db.outboxEvent.findUniqueOrThrow({ where: { id } });
    // Renew the lease while SMTP is active; an idle socket timeout does not
    // bound the duration of every SMTP phase combined.
    let renewing = false;
    const renewal = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.db.outboxEvent.updateMany({ where: { id, leaseId, status: "PROCESSING" },
        data: { lockedUntil: new Date(Date.now() + 90000) } }).catch(() => {}).finally(() => { renewing = false; });
    }, 20000);
    renewal.unref();
    try {
      const previous = await this.db.processedEvent.findUnique({ where: { eventId: id } });
      if (!previous) await this.handle(event);
      await transaction(this.db, async tx => {
        const completed = await tx.outboxEvent.updateMany({
          where: { id, leaseId, status: "PROCESSING" },
          data: { status: "COMPLETED", completedAt: new Date(), leaseId: null, lockedUntil: null, lastErrorCode: null, payload: {} },
        });
        if (completed.count) await tx.processedEvent.upsert({ where: { eventId: id }, create: { eventId: id }, update: {} });
      });
    } catch (error) {
      // Store only a fixed code: provider exceptions can contain addresses or credentials.
      await this.db.outboxEvent.updateMany({
        where: { id, leaseId, status: "PROCESSING" },
        data: { status: event.attempts >= 5 ? "FAILED" : "PENDING", leaseId: null, lockedUntil: null,
          lastErrorCode: error instanceof MailDeliveryError ? error.code : "DELIVERY_FAILED", availableAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** event.attempts)) },
      });
    } finally { clearInterval(renewal); }
  }
  pending(limit = 25) {
    return this.db.outboxEvent.findMany({ where: eligible(new Date()), orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  }
}
