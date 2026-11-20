import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { transaction } from "../../common/transaction";
import { audit } from "../../common/audit";
import { RetirementDecimal as D } from "../retirement/engine";
import { actualPayloadSchema } from "../actuals/schema";
import { glideTargets, glideYears } from "../portfolios/engine";
import { customTargets } from "../portfolios/custom";
import type { PortfolioDocument } from "../portfolios/schema";
import { POLICY_ASSET_MAPPING, RecommendationService, conflict, json, review } from "../recommendation/service";
import { amount, writeHolding } from "../recommendation/schema";
import { HoldingsMonitoringService } from "./service";
import type { AssetClassType, TargetAllocationItem, UserHoldingItem } from "./types";
import { PlansService } from "../plans/service";
import { AllocationRiskService, contextOf } from "../allocation-risk/service";
import { policyCodeResolver } from "../allocation-risk/current-weights";

const MATURITY_CATEGORIES = new Set(["TERM_DEPOSIT", "GOVERNMENT_BOND"]);
const bandPercent = z.string().max(12).regex(/^(0|[1-9]\d?)(\.\d{1,4})?$/);
export const holdingsRebalanceInput = z.object({ planId: z.string().uuid(), versionId: z.string().uuid(), newContribution: amount }).strict();
export const holdingsDriftQuery = z.object({
  planId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
  newContribution: amount.default("0"),
  driftThresholdPercent: bandPercent.optional(),
}).strict().refine(v => Boolean(v.planId) === Boolean(v.versionId), "planId và versionId phải cùng có hoặc cùng bỏ trống.");
export const holdingsRebalanceOrdersInput = z.object({
  planId: z.string().uuid(),
  versionId: z.string().uuid(),
  newContribution: amount.default("0"),
  driftThresholdPercent: bandPercent.optional(),
}).strict();

function mappedTargetAllocations(
  policy: PortfolioDocument,
  templateId: string,
  month: string,
  firstMonth: string,
  retirementMonth: string,
  custom?: Parameters<typeof customTargets>[0],
  plannedTargets?: Array<{assetClass:string;weightPercent:string}>,
): { targets: TargetAllocationItem[]; bandPoints: string; costPercent: string } {
  const template = policy.templates.find(t => t.id === templateId);
  if (!template) throw review("VALID_PLAN_REQUIRED");
  let rawWeights: Array<{ assetClass: string; weightPercent: InstanceType<typeof D> }>;
  if (plannedTargets) rawWeights=plannedTargets.map(a=>({assetClass:a.assetClass,weightPercent:new D(a.weightPercent)}));
  else if ("glidePath" in template) {
    const codes = [...new Set(template.glidePath.points.flatMap(p => p.allocations.map(a => a.assetClass)))];
    const initial = glideTargets(template, glideYears(template, firstMonth, retirementMonth), codes);
    const current = glideTargets(template, glideYears(template, month, retirementMonth), codes);
    const resolved = custom ? customTargets(custom, initial, current) : current;
    rawWeights = [...resolved].map(([assetClass, w]) => ({ assetClass, weightPercent: w.mul(100) }));
  } else {
    const period = template.schedule[0];
    if (!period) throw review("VALID_PLAN_REQUIRED");
    rawWeights = period.allocations.map(a => ({ assetClass: a.assetClass, weightPercent: new D(a.weightPercent) }));
  }
  const byProductClass = new Map<AssetClassType, InstanceType<typeof D>>();
  for (const item of rawWeights) {
    if (item.weightPercent.lte(0)) continue;
    const mapping = POLICY_ASSET_MAPPING[item.assetClass];
    if (!mapping) throw review("UNMAPPED_POLICY_ASSET_CLASS");
    for (const [productClass, share] of Object.entries(mapping) as Array<[AssetClassType, number]>) {
      byProductClass.set(productClass, (byProductClass.get(productClass) ?? new D(0)).plus(item.weightPercent.mul(share)));
    }
  }
  const targets: TargetAllocationItem[] = [...byProductClass].map(([assetClass, w]) => ({ assetClass, weightPercent: w.toFixed() }));
  const bandPoints = policy.schemaVersion === 2 ? policy.allocationRisk?.rebalanceBandPoints ?? "5.0" : "5.0";
  return { targets, bandPoints, costPercent: template.rebalance.turnoverCostPercent };
}

export class HoldingsRepository {
  constructor(private db: PrismaClient) {}
  private async recordedDividends(userId: string, month: string): Promise<string> {
    const row = await this.db.actualMonth.findFirst({ where: { userId, period: month } });
    if (!row) return "0";
    const parsed = actualPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return "0";
    let total = new D(0);
    for (const entry of parsed.data.entries) {
      if (entry.kind === "INVESTMENT_INCOME") {
        const amt = new D(entry.amount);
        if (amt.gt(0)) total = total.plus(amt);
      }
    }
    return total.toFixed();
  }
  private async resolvePlanContext(userId: string, planId?: string, versionId?: string) {
    let resolvedPlanId = planId, resolvedVersionId = versionId;
    if (!resolvedPlanId || !resolvedVersionId) {
      const plan = await this.db.retirementPlan.findFirst({
        where: { userId, stale: false, currentVersionId: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      if (!plan?.currentVersionId) throw review("CURRENT_PLAN_REQUIRED");
      resolvedPlanId = plan.id;
      resolvedVersionId = plan.currentVersionId;
    }
    const saved = await new PlansService(this.db).readVersion(this.db, userId, resolvedPlanId, resolvedVersionId);
    const preview = saved.version.preview;
    const profile = await this.db.financialProfile.findUnique({ where: { userId }, select: { revision: true } });
    if (saved.plan.stale || saved.plan.currentVersionId !== resolvedVersionId || profile?.revision !== saved.version.profileRevision)
      throw review("CURRENT_PLAN_REQUIRED");
    const templateId = preview.calculation?.assessment.selectedTemplateId;
    if (!templateId || !preview.replayInput) throw review("VALID_PLAN_REQUIRED");
    return { planId: resolvedPlanId, versionId: resolvedVersionId, saved, preview, templateId };
  }
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
  async read(userId: string, asOfDate: string = new Date().toISOString().slice(0, 10)) {
    const asOfMonth = asOfDate.slice(0, 7);
    const rows = await this.db.investmentHolding.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    const catalog = await new RecommendationService(this.db).catalog();
    const dividends = await this.recordedDividends(userId, asOfMonth);
    const products = catalog.filter(c => c.product.isDistributionPermitted).map(c => ({ id: c.productId, name: c.product.name }));
    const holdings = rows.map(row => {
      const product = catalog.find(p => p.productId === row.productId);
      const quantity = new D(String(row.quantity)).toFixed(), costBasis = new D(String(row.unitCost)).toFixed();
      const currentPrice = product?.data.nav ?? null;
      const lockedUntil = row.lockedUntil ? new Date(row.lockedUntil).toISOString().slice(0, 10) : null;
      // B7-3: Fixed-maturity holdings (term deposits / government bonds) whose lock/maturity date has passed contribute matured cash.
      const matured = Boolean(product && MATURITY_CATEGORIES.has(product.data.category) && lockedUntil && lockedUntil.slice(0, 7) === asOfMonth && lockedUntil <= asOfDate && currentPrice !== null);
      const maturedAmount = matured ? new D(quantity).mul(currentPrice!).toFixed(0) : "0";
      return { id: row.id, revision: row.revision, userId, productId: row.productId, productName: product?.product.name ?? "Chưa có dữ liệu", productCode: product?.data.code ?? "",
        quantity, costBasis, currentPrice,
        assetClass: product?.data.assetClass ?? null, currency: "VND", maturedAmount, lockedUntil,
        priceAsOf: product?.data.priceAsOf ?? null, sourceKind: product?.data.sourceKind ?? null, sourceReference: product?.data.sourceReference ?? null,
        stale: !product || product.stale || product.data.status !== "ACTIVE" || (product.data.sourceKind === "TEST_FIXTURE" && process.env.NODE_ENV !== "test") };
    });
    const complete = holdings.every(h => !h.stale && h.currentPrice !== null && h.assetClass !== null);
    const summary = complete ? new HoldingsMonitoringService().calculateHoldingsValuation(holdings.map(h => ({ ...h, currentPrice: h.currentPrice!, assetClass: h.assetClass! })), asOfDate) : null;
    const hasMaturityOrDividend = holdings.some(h => new D(h.maturedAmount).gt(0)) || new D(dividends).gt(0);
    const notes = hasMaturityOrDividend ? [] : ["MATURITIES_NOT_RECORDED"];
    return { status: complete ? "READY" : "DATA_REQUIRED", products, holdings, summary: summary ? { ...summary, userId } : null, recordedDividends: dividends, notes, informationalOnly: true };
  }
  async rebalance(userId: string, raw: z.infer<typeof holdingsRebalanceInput>, asOfDate: string = new Date().toISOString().slice(0, 10)) {
    const input = holdingsRebalanceInput.parse(raw), valuation = await this.read(userId, asOfDate);
    if (!valuation.summary) throw review("FRESH_PRICE_DATA_REQUIRED");
    if (valuation.holdings.some(h => h.lockedUntil && h.lockedUntil >= asOfDate)) throw review("LOCKED_HOLDINGS_REQUIRE_REVIEW");
    const { saved, preview, templateId } = await this.resolvePlanContext(userId, input.planId, input.versionId);
    await this.planFloor(saved, asOfDate.slice(0, 7), valuation);
    const totalContribution = new D(input.newContribution).plus(valuation.recordedDividends).toFixed();
    const policy=saved.capture.policy.data, template=policy.templates.find(t=>t.id===templateId)!;
    const codes=[...new Set(("glidePath" in template ? template.glidePath.points.flatMap(p=>p.allocations) : template.schedule.flatMap(p=>p.allocations)).map(a=>a.assetClass))];
    const stress=policy.schemaVersion===2 ? policy.lossStress : undefined;
    const resolve=policyCodeResolver(codes,stress?.equityAssetClass??"EQUITY",stress?.depositAssetClass??"CASH");
    const amounts=new Map<string,{assetClass:string;value:string;maturedAmount:string}>();
    for(const item of valuation.summary.assetClasses){
      const code=resolve(item.assetClass);
      if(!code){if(new D(item.value).gt(0))throw review("UNMAPPED_POLICY_ASSET_CLASS");continue;}
      const previous=amounts.get(code);
      amounts.set(code,{assetClass:code,value:new D(previous?.value??0).plus(item.value).toFixed(),maturedAmount:new D(previous?.maturedAmount??0).plus(item.maturedAmount).toFixed()});
    }
    const proposal = await new AllocationRiskService(this.db).rebalance({ policyVersionId: saved.capture.policy.id, templateId, month: asOfDate.slice(0, 7),
      retirementMonth: preview.replayInput!.retirementMonth,
      holdings: [...amounts.values()],
      newContribution: totalContribution, planId: input.planId, planVersionId: input.versionId },userId);
    return { ...proposal, recordedDividends: valuation.recordedDividends, notes: valuation.notes };
  }
  private planTargets(saved: Awaited<ReturnType<PlansService["readVersion"]>>, templateId: string, month: string) {
    const context=contextOf(saved.capture,saved.version.preview);
    const index=context?.projection.rows.findIndex(r=>r.month===month)??-1;
    const template=saved.capture.policy.data.templates.find(t=>t.id===templateId);
    if(template && "glidePath" in template && template.glidePath.spendingFloorYears && (!context || index<0))
      throw review("SPENDING_FLOOR_PLAN_CONTEXT_REQUIRED");
    return context && index>=0 ? context.targets[index] : undefined;
  }
  private async planFloor(
    saved: Awaited<ReturnType<PlansService["readVersion"]>>,
    month: string,
    valuation: Awaited<ReturnType<HoldingsRepository["read"]>>,
    catalog?: Awaited<ReturnType<RecommendationService["catalog"]>>,
  ) {
    const context=contextOf(saved.capture,saved.version.preview), floor=context?.spendingFloor;
    if (!floor || context.projection.modelVersion!=="retirement-monthly-v5" || month<context.projection.retirementMonth)
      return { floor:undefined, governmentBondsOnly:false };
    const safeAssets=[...new Set(floor.safeAssets.flatMap(code=>{
      const mapping=POLICY_ASSET_MAPPING[code];
      if (!mapping || Object.keys(mapping).length!==1 || Object.values(mapping)[0]!==1) throw review("SPENDING_FLOOR_PRODUCT_MAPPING_REQUIRED");
      return Object.keys(mapping);
    }))];
    // A product class must not merge safe and risky policy assets: the aggregate
    // holding could otherwise satisfy the floor using the risky part alone.
    const codes=new Set(context.targets.flatMap(target=>target.map(t=>t.assetClass)));
    if ([...codes].some(code=>!floor.safeAssets.includes(code) && Object.entries(POLICY_ASSET_MAPPING[code]??{})
      .some(([productClass,share])=>safeAssets.includes(productClass) && (share??0)>0)))
      throw review("SPENDING_FLOOR_PRODUCT_MAPPING_REQUIRED");
    const governmentBondsOnly=safeAssets.includes("BOND");
    const bonds=valuation.holdings.filter(h=>h.assetClass==="BOND" && new D(h.quantity).mul(h.currentPrice??0).gt(0));
    if (governmentBondsOnly && bonds.length) {
      const products=catalog??await new RecommendationService(this.db).catalog();
      if (bonds.some(h=>products.find(p=>p.productId===h.productId)?.data.category!=="GOVERNMENT_BOND"))
        throw review("SPENDING_FLOOR_GOVERNMENT_BOND_DATA_REQUIRED");
    }
    return { floor:{...floor,safeAssets}, governmentBondsOnly };
  }
  async drift(userId: string, raw: z.input<typeof holdingsDriftQuery>, asOfDate: string = new Date().toISOString().slice(0, 10)) {
    const input = holdingsDriftQuery.parse(raw), valuation = await this.read(userId, asOfDate);
    if (!valuation.summary) throw review("FRESH_PRICE_DATA_REQUIRED");
    const { planId, versionId, saved, preview, templateId } = await this.resolvePlanContext(userId, input.planId, input.versionId);
    const month = asOfDate.slice(0, 7);
    const floorContext=await this.planFloor(saved,month,valuation);
    const firstMonth = preview.replayInput!.rows[0]?.month ?? month;
    const { targets, bandPoints, costPercent } = mappedTargetAllocations(saved.capture.policy.data, templateId, month, firstMonth, preview.replayInput!.retirementMonth, preview.selection.customAllocation, this.planTargets(saved, templateId, month));
    const items: UserHoldingItem[] = valuation.holdings.map(h => ({
      id: h.id, userId: h.userId, productId: h.productId, productCode: h.productCode || h.productId, productName: h.productName,
      assetClass: h.assetClass!, quantity: h.quantity, costBasis: h.costBasis, currentPrice: h.currentPrice!,
      maturedAmount: h.maturedAmount, currency: h.currency,
    }));
    const freeContribution = new D(input.newContribution).plus(valuation.recordedDividends).toFixed();
    const result = new HoldingsMonitoringService().monitorPortfolioDrift({
      userId, holdings: items, targets, driftThresholdPercent: input.driftThresholdPercent ?? bandPoints,
      newContribution: freeContribution, month, retirementMonth: preview.replayInput!.retirementMonth,
      policyVersionId: saved.capture.policy.id, templateId, costPercent,
      rebalancePolicy: saved.capture.policy.data.schemaVersion === 2 ? saved.capture.policy.data.allocationRisk?.rebalance : undefined,
      spendingFloor:floorContext.floor,
    });
    const notes = [...valuation.notes, ...(valuation.holdings.some(h => h.lockedUntil && h.lockedUntil >= asOfDate) ? ["LOCKED_HOLDINGS_PRESENT"] : [])];
    return {
      persisted: false as const,
      informationalOnly: true as const,
      planId, versionId, policyVersionId: saved.capture.policy.id, templateId, month,
      recordedDividends: valuation.recordedDividends,
      notes,
      ...result,
    };
  }
  async rebalanceOrders(userId: string, raw: z.input<typeof holdingsRebalanceOrdersInput>, asOfDate: string = new Date().toISOString().slice(0, 10)) {
    const input = holdingsRebalanceOrdersInput.parse(raw), valuation = await this.read(userId, asOfDate);
    if (!valuation.summary) throw review("FRESH_PRICE_DATA_REQUIRED");
    if (valuation.holdings.some(h => h.lockedUntil && h.lockedUntil >= asOfDate)) throw review("LOCKED_HOLDINGS_REQUIRE_REVIEW");
    const { planId, versionId, saved, preview, templateId } = await this.resolvePlanContext(userId, input.planId, input.versionId);
    const month = asOfDate.slice(0, 7);
    const catalog = await new RecommendationService(this.db).catalog();
    const floorContext=await this.planFloor(saved,month,valuation,catalog);
    const firstMonth = preview.replayInput!.rows[0]?.month ?? month;
    const { targets, bandPoints, costPercent } = mappedTargetAllocations(saved.capture.policy.data, templateId, month, firstMonth, preview.replayInput!.retirementMonth, preview.selection.customAllocation, this.planTargets(saved, templateId, month));
    const items: UserHoldingItem[] = valuation.holdings.map(h => ({
      id: h.id, userId: h.userId, productId: h.productId, productCode: h.productCode || h.productId, productName: h.productName,
      assetClass: h.assetClass!, quantity: h.quantity, costBasis: h.costBasis, currentPrice: h.currentPrice!,
      maturedAmount: h.maturedAmount, currency: h.currency,
    }));
    const freeContribution = new D(input.newContribution).plus(valuation.recordedDividends).toFixed();
    const monitor = new HoldingsMonitoringService();
    const drift = monitor.monitorPortfolioDrift({
      userId, holdings: items, targets, driftThresholdPercent: input.driftThresholdPercent ?? bandPoints,
      newContribution: freeContribution, month, retirementMonth: preview.replayInput!.retirementMonth,
      policyVersionId: saved.capture.policy.id, templateId, costPercent,
      rebalancePolicy: saved.capture.policy.data.schemaVersion === 2 ? saved.capture.policy.data.allocationRisk?.rebalance : undefined,
      spendingFloor:floorContext.floor,
    });
    const heldIds = new Set(items.map(h => h.productId));
    const targetProducts = catalog
      .filter(c => (!c.stale && c.data.status === "ACTIVE" && c.product.isDistributionPermitted) || heldIds.has(c.productId))
      .filter(c=>!floorContext.governmentBondsOnly || c.data.assetClass!=="BOND" || c.data.category==="GOVERNMENT_BOND")
      .map(c => ({
        productId: c.productId,
        productCode: c.data.code,
        productName: c.product.name,
        assetClass: c.data.assetClass,
        currentPrice: c.data.nav,
        lotSize: c.data.lotSize,
      }));
    const trades = drift.rebalanceRecommendation?.status === "PROPOSED" ? drift.rebalanceRecommendation.trades : [];
    const orderResult = monitor.generateProductLevelRebalanceOrders({ trades, holdings: items, targetProducts });
    return {
      persisted: false as const,
      informationalOnly: true as const,
      planId, versionId, policyVersionId: saved.capture.policy.id, templateId, month,
      recordedDividends: valuation.recordedDividends,
      notes: valuation.notes,
      drift: {
        isDrifted: drift.isDrifted,
        maxDriftPercent: drift.maxDriftPercent,
        driftThresholdPercent: drift.driftThresholdPercent,
        rebalanceRequired: drift.rebalanceRequired,
        rebalanceStatus: drift.rebalanceRecommendation?.status ?? null,
        costEstimated: drift.rebalanceRecommendation?.costEstimated ?? "0",
        cashUsedBeforeTrades: drift.rebalanceRecommendation?.cashUsedBeforeTrades ?? "0",
      },
      ...orderResult,
    };
  }
}
