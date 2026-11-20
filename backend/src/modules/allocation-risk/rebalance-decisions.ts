import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { audit } from "../../common/audit";
import { transaction } from "../../common/transaction";

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export const rebalanceDecisionUpdateSchema = z.object({
  decision: z.enum(["ACCEPTED", "DISMISSED"]),
  note: z.string().trim().max(1000).optional(),
}).strict();

export const rebalanceHistoryQuerySchema = z.object({
  limit: z.preprocess(
    v => v === undefined ? 50 : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v,
    z.number().int().min(1).max(200),
  ),
}).strict();

export type RecordProposalInput = {
  planVersionId?: string | null;
  source?: "PROPOSAL" | "MONITOR";
  oldWeights: unknown;
  targetWeights: unknown;
  newWeights: unknown;
  trigger: string;
  bandPoints: string;
  costEstimate: string;
  trades: unknown;
  probabilityBefore?: number | null;
  probabilityAfter?: number | null;
  note?: string | null;
};

type DecisionRow = {
  id: string;
  userId: string;
  planVersionId: string | null;
  createdAt: Date;
  source: string;
  oldWeights: unknown;
  targetWeights: unknown;
  newWeights: unknown;
  trigger: string;
  bandPoints: string;
  costEstimate: string;
  trades: unknown;
  probabilityBefore: number | null;
  probabilityAfter: number | null;
  decision: string;
  note: string | null;
};

const view = (row: DecisionRow) => ({
  id: row.id,
  userId: row.userId,
  planVersionId: row.planVersionId,
  createdAt: row.createdAt.toISOString(),
  source: row.source as "PROPOSAL" | "MONITOR",
  oldWeights: row.oldWeights,
  targetWeights: row.targetWeights,
  newWeights: row.newWeights,
  trigger: row.trigger,
  bandPoints: row.bandPoints,
  costEstimate: row.costEstimate,
  trades: row.trades,
  probabilityBefore: row.probabilityBefore,
  probabilityAfter: row.probabilityAfter,
  decision: row.decision as "PROPOSED" | "ACCEPTED" | "DISMISSED",
  note: row.note,
});

export class RebalanceDecisionService {
  constructor(private db: PrismaClient) {}

  async recordProposal(userId: string, input: RecordProposalInput) {
    return transaction(this.db, async tx => {
      if (input.planVersionId) {
        const version = await tx.planVersion.findUnique({where:{id:input.planVersionId}});
        const plan = version ? await tx.retirementPlan.findFirst({where:{id:version.planId,userId}}) : null;
        if (!plan) throw new AppError(404,"NOT_FOUND","Không tìm thấy phiên bản kế hoạch thuộc tài khoản.");
      }
      const row = await tx.rebalanceDecision.create({
        data: {
          userId,
          planVersionId: input.planVersionId ?? null,
          source: input.source ?? "PROPOSAL",
          oldWeights: json(input.oldWeights),
          targetWeights: json(input.targetWeights),
          newWeights: json(input.newWeights),
          trigger: input.trigger,
          bandPoints: input.bandPoints,
          costEstimate: input.costEstimate,
          trades: json(input.trades),
          probabilityBefore: input.probabilityBefore ?? null,
          probabilityAfter: input.probabilityAfter ?? null,
          decision: "PROPOSED",
          note: input.note ?? null,
        },
      });
      await audit(tx, userId, "REBALANCE_PROPOSAL_RECORDED", "REBALANCE_DECISION", row.id, {
        source: row.source,
        trigger: row.trigger,
        decision: row.decision,
      });
      return view(row);
    });
  }

  async updateDecision(userId: string, id: string, raw: z.infer<typeof rebalanceDecisionUpdateSchema>) {
    const input = rebalanceDecisionUpdateSchema.parse(raw);
    return transaction(this.db, async tx => {
      const existing = await tx.rebalanceDecision.findFirst({ where: { id, userId } });
      if (!existing) throw new AppError(404, "NOT_FOUND", "Không tìm thấy quyết định tái cân bằng.");
      const updated = await tx.rebalanceDecision.update({
        where: { id: existing.id },
        data: {
          decision: input.decision,
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
      await audit(tx, userId, "REBALANCE_DECISION_UPDATED", "REBALANCE_DECISION", updated.id, {
        from: existing.decision,
        to: updated.decision,
      });
      return view(updated);
    });
  }

  async listHistory(userId: string, raw: unknown = {}) {
    const query = rebalanceHistoryQuerySchema.parse(raw);
    const rows = await this.db.rebalanceDecision.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return { items: rows.map(view) };
  }
}
