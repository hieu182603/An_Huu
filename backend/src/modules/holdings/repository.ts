import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { RecommendationService, conflict, json, review } from "../recommendation/service";
import { amount, writeHolding } from "../recommendation/schema";
import { HoldingsMonitoringService } from "./service";
import { PlansService } from "../plans/service";
import { AllocationRiskService } from "../allocation-risk/service";
export const holdingsRebalanceInput = z.object({ planId: z.string().uuid(), versionId: z.string().uuid(), newContribution: amount }).strict();
export class HoldingsRepository {
  constructor(private db: PrismaClient) {}
  async write(userId: string, raw: z.infer<typeof writeHolding>) {
    const input = writeHolding.parse(raw);
    return transaction(this.db, async tx => {
      const product = await tx.investmentProductData.findUnique({ where: { productId: input.productId } });
      if (!product) throw review("PRODUCT_DATA_REQUIRED");
      const where = { userId_productId: { userId, productId: input.productId } };
      const old = await tx.investmentHolding.findUnique({ where });
      if ((old?.revision ?? 0) !== input.expectedRevision) throw conflict();
      const data = { quantity: input.quantity, unitCost: input.unitCost, lockedUntil: input.lockedUntil ? new Date(input.lockedUntil + "T00:00:00Z") : null };
      const row = old ? await tx.investmentHolding.update({ where: { id: old.id, revision: input.expectedRevision }, data: { ...data, revision: { increment: 1 } } })
        : await tx.investmentHolding.create({ data: { userId, productId: input.productId, ...data } });
      await audit(tx, userId, "HOLDING_RECORDED", "INVESTMENT_HOLDING", row.id, json({ before: old, after: row, informationalOnly: true }));
      return { id: row.id, revision: row.revision };
    });
  }
  async read(userId: string) {
    const rows = await this.db.investmentHolding.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    const catalog = await new RecommendationService(this.db).catalog();
    const products = catalog.filter(c => c.product.isDistributionPermitted).map(c => ({ id: c.productId, name: c.product.name }));
    const holdings = rows.map(row => {
      const product = catalog.find(p => p.productId === row.productId);
      return { id: row.id, revision: row.revision, userId, productId: row.productId, productName: product?.product.name ?? "Chưa có dữ liệu", productCode: product?.data.code ?? "",
        quantity: row.quantity.toFixed(), costBasis: row.unitCost.toFixed(), currentPrice: product?.data.nav ?? null,
        assetClass: product?.data.assetClass ?? null, currency: "VND", maturedAmount: "0", lockedUntil: row.lockedUntil?.toISOString().slice(0, 10) ?? null,
        priceAsOf: product?.data.priceAsOf ?? null, sourceKind: product?.data.sourceKind ?? null, sourceReference: product?.data.sourceReference ?? null,
        stale: !product || product.stale || product.data.status !== "ACTIVE" || (product.data.sourceKind === "TEST_FIXTURE" && process.env.NODE_ENV !== "test") };
    });
    const complete = holdings.every(h => !h.stale && h.currentPrice !== null && h.assetClass !== null);
    const summary = complete ? new HoldingsMonitoringService().calculateHoldingsValuation(holdings.map(h => ({ ...h, currentPrice: h.currentPrice!, assetClass: h.assetClass! }))) : null;
    return { status: complete ? "READY" : "DATA_REQUIRED", products, holdings, summary: summary ? { ...summary, userId } : null, informationalOnly: true };
  }
  async rebalance(userId: string, raw: z.infer<typeof holdingsRebalanceInput>) {
    const input = holdingsRebalanceInput.parse(raw), valuation = await this.read(userId);
    if (!valuation.summary) throw review("FRESH_PRICE_DATA_REQUIRED");
    if (valuation.holdings.some(h => h.lockedUntil && h.lockedUntil >= new Date().toISOString().slice(0, 10))) throw review("LOCKED_HOLDINGS_REQUIRE_REVIEW");
    const saved = await new PlansService(this.db).readVersion(this.db, userId, input.planId, input.versionId);
    const preview = saved.version.preview;
    const profile = await this.db.financialProfile.findUnique({ where: { userId }, select: { revision: true } });
    if (saved.plan.stale || saved.plan.currentVersionId !== input.versionId || profile?.revision !== saved.version.profileRevision) throw review("CURRENT_PLAN_REQUIRED");
    const templateId = preview.calculation?.assessment.selectedTemplateId;
    if (!templateId || !preview.replayInput) throw review("VALID_PLAN_REQUIRED");
    return new AllocationRiskService(this.db).rebalance({ policyVersionId: saved.capture.policy.id, templateId, month: new Date().toISOString().slice(0, 7),
      retirementMonth: preview.replayInput.retirementMonth, holdings: valuation.summary.assetClasses.map(a => ({ assetClass: a.assetClass, value: a.value, maturedAmount: "0" })), newContribution: input.newContribution });
  }
}
