import type { PrismaClient, OutboxEvent } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { enqueue } from "../../jobs/outbox";

// Consume queued legacy jobs safely: a job can flag a possible update but never
// create/apply a version, even if it was queued by an older application release.
export async function handlePlanUpdateEvent(db: PrismaClient, event: OutboxEvent) {
  if (!["financial.recalculate_batch", "financial.recalculate_plan"].includes(event.type)) throw new Error("UNSUPPORTED_FINANCIAL_EVENT");
  const payload = z.object({ assumptionId: z.string().uuid(), cursor: z.string().uuid().nullable().optional(),
    userId: z.string().uuid().optional(), expectedCurrentVersionId: z.string().uuid().optional(),
    profileRevision: z.number().int().optional(), goalRevision: z.number().int().optional() }).strict().parse(event.payload);
  await transaction(db, async tx => {
    if (await tx.processedEvent.findUnique({ where: { eventId: event.id } })) return;
    const config = await tx.assumptionSetVersion.findUnique({ where: { id: payload.assumptionId } });
    if (config?.status === "PUBLISHED" && config.effectiveAt && config.effectiveAt <= new Date()) {
      if (event.type === "financial.recalculate_batch") {
        const plans = await tx.retirementPlan.findMany({ where: { currentVersionId: { not: null },
          ...(payload.cursor ? { id: { gt: payload.cursor } } : {}) }, orderBy: { id: "asc" }, take: 20 });
        for (const plan of plans) await tx.retirementPlan.updateMany({ where: { id: plan.id, currentVersionId: plan.currentVersionId }, data: { stale: true } });
        if (plans.length === 20) await enqueue(tx, event.type, config.id, { assumptionId: config.id, cursor: plans.at(-1)!.id });
      } else if (payload.userId && payload.expectedCurrentVersionId) {
        await tx.retirementPlan.updateMany({ where: { id: event.entityId, userId: payload.userId, currentVersionId: payload.expectedCurrentVersionId }, data: { stale: true } });
      }
    }
    await tx.processedEvent.create({ data: { eventId: event.id } });
  });
}
