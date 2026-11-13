import { Prisma, type PrismaClient, type InvestmentRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../common/errors";
import { audit } from "../../common/audit";
import { digest } from "../../common/digest";
import { transaction } from "../../common/transaction";
import { RetirementDecimal as D } from "../retirement/engine";
import { PlansService } from "../plans/service";
import { separateCapital } from "../capital/separation";
import { assessLossConstraint } from "../capital/loss-constraint";
import { generatePortfolioRecommendation, RecommendationApprovalManager as Workflow, recommendationContentHash } from "./engine";
import { createRecommendation, productDocument, transitionRecommendation, writeProductData } from "./schema";
import type { AssetClass, ProductMasterData, RecommendationResponse } from "./types";
import { SsiFastConnectProvider, FiinGroupProvider } from "../market-data/provider";
import { allocationWorkspace,allocationWorkspaceInput } from "../portfolios/workspace";
import { ProfileService } from "../profiles/service";
import { PortfoliosService } from "../portfolios/service";
import { AssumptionsService } from "../assumptions/service";
import { buildAllocationPackages } from "./packages";

export const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject;
/** JSON form that survives a PostgreSQL JSONB round-trip unchanged: floats lose digits past ~15 significant
 * figures there, which broke the content hash. 12 significant digits is ample for portfolio weights. */
export const storable = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => typeof x === "number" && !Number.isInteger(x) ? Number(x.toPrecision(12)) : x)) as Prisma.InputJsonObject;
export const missing = () => new AppError(404, "NOT_FOUND", "Không tìm thấy dữ liệu.");
export const conflict = () => new AppError(409, "REVISION_CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại.");
export const review = (code: string) => new AppError(422, code, "Cần kiểm tra dữ liệu hoặc điều kiện nghiệp vụ trước khi tiếp tục.");
export async function requireInvestmentRole(tx: Prisma.TransactionClient, actor: string, roles: InvestmentRole[]) {
  const user = await tx.user.findUnique({ where: { id: actor }, select: { status: true, investmentRoles: true } });
  if (!user || user.status !== "ACTIVE" || !user.investmentRoles.some(r => roles.includes(r.role)))
    throw new AppError(403, "FORBIDDEN", "Tài khoản chưa được cấp quyền cho thao tác này.");
}
/** Client risk tolerance from the risk survey pinned in the plan version (no legacy retirement_goals row).
 * Band position on the pinned policy's scale: lower third LOW, middle MEDIUM, upper third HIGH. */
export function riskToleranceFromAssessment(policy: { riskBands?: Array<{ id: string; minScore: number }> } | undefined, riskBandId: string | null | undefined): "LOW" | "MEDIUM" | "HIGH" | null {
  const bands = [...(policy?.riskBands ?? [])].sort((a, b) => a.minScore - b.minScore);
  const index = bands.findIndex(b => b.id === riskBandId);
  if (index < 0) return null;
  const position = bands.length === 1 ? 0.5 : index / (bands.length - 1);
  return position < 1 / 3 ? "LOW" : position <= 2 / 3 ? "MEDIUM" : "HIGH";
}
/** Portfolio-policy asset classes → product asset classes. BALANCED follows the standard
 * balanced-fund strategy of 50% equity / 50% fixed income; unmapped classes (e.g. REAL_ESTATE)
 * still require review. */
export const POLICY_ASSET_MAPPING: Record<string, Partial<Record<AssetClass, number>>> = {
  CASH: { CASH: 1 }, BOND: { BOND: 1 }, GOV_BOND: { BOND: 1 }, EQUITY: { EQUITY: 1 }, STOCK: { EQUITY: 1 }, GOLD: { GOLD: 1 },
  BALANCED: { BOND: 0.5, EQUITY: 0.5 },
};
const staff: InvestmentRole[] = ["ADVISOR", "APPROVER", "OPERATIONS", "SYSTEM_ADMIN"];
type References = { holdingsHash: string; profileRevision: number; goalRevision: number; policyId: string; policyRevision: number; assumptionId: string; assumptionRevision: number; products: Array<{ id: string; hash: string; revision: number }> };
export class RecommendationService {
  constructor(private db: PrismaClient, private publicationEnabled = false, private legalAuthorizationReference = "") {}
  async allocationPackages(userId:string,raw:unknown){
    const input=allocationWorkspaceInput.parse(raw);
    const portfolios=new PortfoliosService(this.db);
    const workspace=await allocationWorkspace(new ProfileService(this.db),portfolios,new AssumptionsService(this.db),userId,input);
    if(workspace.capital.status!=="READY"||workspace.loss.status!=="WITHIN_LIMIT"||workspace.portfolio?.status!=="READY")throw review("ALLOCATION_REVIEW_REQUIRED");
    const policy=await portfolios.get(workspace.policyVersionId,true);
    const risk=riskToleranceFromAssessment(policy.data,workspace.portfolio.assessment.riskBandId);
    if(!risk)throw review("RISK_TOLERANCE_REQUIRED");
    const catalog=(await this.catalog()).filter(row=>!row.stale&&row.product.conditions&&row.product.disclosures).map(row=>row.product);
    return {...buildAllocationPackages(workspace.allocations,catalog,{clientRiskTolerance:risk,horizonYears:input.liquidityNeedMonths/12}),
      profileRevision:workspace.profileRevision,policyVersionId:workspace.policyVersionId,growthCapital:workspace.capital.growthCapital};
  }
  async permissions(actor: string) {
    const grants = await this.db.investmentRoleGrant.findMany({ where: { userId: actor } });
    return { roles: grants.map(g => g.role), publicationEnabled: this.publicationEnabled && !!this.legalAuthorizationReference };
  }
  async providerHealth(actor: string) {
    await requireInvestmentRole(this.db, actor, ["DATA_ADMIN", "OPERATIONS", "SYSTEM_ADMIN"]);
    return Promise.all([
      new SsiFastConnectProvider({ consumerId: process.env.SSI_CONSUMER_ID, consumerSecret: process.env.SSI_CONSUMER_SECRET }).healthCheck(),
      new FiinGroupProvider({ apiKey: process.env.FIIN_API_KEY }).healthCheck(),
    ]);
  }
  async unconfiguredProducts(actor: string) {
    await requireInvestmentRole(this.db, actor, ["DATA_ADMIN"]);
    return this.db.partnerProduct.findMany({ where: { investmentData: null }, select: { id: true, name: true, category: true }, take: 200 });
  }
  async catalog(tx: Prisma.TransactionClient = this.db) {
    const rows = await tx.investmentProductData.findMany({ include: { product: { include: { partner: true } } }, orderBy: { productId: "asc" }, take: 500 });
    return rows.map(row => {
      const data = productDocument.parse(row.document);
      if (digest(data) !== row.documentHash) throw review("PRODUCT_INTEGRITY_FAILED");
      const stale = data.validUntil < new Date().toISOString().slice(0, 10) || data.priceAsOf > new Date().toISOString().slice(0, 10);
      const product: ProductMasterData = { ...data, id: row.productId, partnerId: row.product.partnerId, name: row.product.name, partnerName: row.product.partner.name,
        conditions:row.product.conditions??undefined,disclosures:row.product.disclosure??undefined,
        riskLevel: row.product.riskLevel, isDistributionPermitted: data.isDistributionPermitted && row.product.isVisible && row.product.partner.isVisible,
        status: stale || (data.sourceKind === "TEST_FIXTURE" && process.env.NODE_ENV !== "test") ? "INACTIVE" : data.status };
      return { ...row, catalogRevision: row.product.revision, data, product, stale };
    });
  }
  async productList(actor: string) {
    await requireInvestmentRole(this.db, actor, ["DATA_ADMIN", ...staff]);
    return (await this.catalog()).map(r => ({ id: r.productId, name: r.product.name, revision: r.revision, data: r.data, stale: r.stale }));
  }
  async writeProduct(actor: string, productId: string, raw: z.infer<typeof writeProductData>) {
    const input = writeProductData.parse(raw);
    if (input.data.sourceKind === "TEST_FIXTURE" && process.env.NODE_ENV !== "test") throw review("TEST_FIXTURE_NOT_ALLOWED");
    return transaction(this.db, async tx => {
      await requireInvestmentRole(tx, actor, ["DATA_ADMIN"]);
      if (!await tx.partnerProduct.findUnique({ where: { id: productId } })) throw missing();
      const old = await tx.investmentProductData.findUnique({ where: { productId } });
      if ((old?.revision ?? 0) !== input.expectedRevision) throw conflict();
      const data = { document: json(input.data), documentHash: digest(input.data) };
      const row = old ? await tx.investmentProductData.update({ where: { productId, revision: old.revision }, data: { ...data, revision: { increment: 1 } } })
        : await tx.investmentProductData.create({ data: { productId, ...data } });
      await audit(tx, actor, "INVESTMENT_PRODUCT_UPDATED", "INVESTMENT_PRODUCT", productId, json({ before: old?.document ?? null, after: row.document, revision: row.revision }));
      return { productId, revision: row.revision };
    });
  }
  private async holdingsHash(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.investmentHolding.findMany({ where: { userId }, orderBy: { productId: "asc" }, select: { productId: true, quantity: true, unitCost: true, lockedUntil: true, revision: true } });
    return digest(json(rows));
  }
  private async referencesCurrent(tx: Prisma.TransactionClient, userId: string, versionId: string, refs: References) {
    const version = await tx.planVersion.findUnique({ where: { id: versionId }, include: { plan: true } });
    const profile = await tx.financialProfile.findUnique({ where: { userId }, select: { revision: true } });
    // Risk now comes from the pinned plan version; goalRevision stays in references for old rows only.
    if (!version || version.plan.userId !== userId || version.plan.stale || version.plan.currentVersionId !== versionId || profile?.revision !== refs.profileRevision) return false;
    for (const [id, revision] of [[refs.policyId, refs.policyRevision], [refs.assumptionId, refs.assumptionRevision]] as const) {
      const row = await tx.assumptionSetVersion.findUnique({ where: { id } });
      if (!row || row.status !== "PUBLISHED" || row.revision !== revision) return false;
    }
    if (!refs.holdingsHash || refs.holdingsHash !== await this.holdingsHash(tx, userId)) return false;
    const catalog = await this.catalog(tx);
    return refs.products.every(ref => catalog.some(p => p.productId === ref.id && p.documentHash === ref.hash && p.catalogRevision === ref.revision && !p.stale && p.product.status === "ACTIVE" && p.product.isDistributionPermitted));
  }
  async create(actor: string, raw: z.infer<typeof createRecommendation>) {
    const input = createRecommendation.parse(raw);
    return transaction(this.db, async tx => {
      await requireInvestmentRole(tx, actor, ["ADVISOR"]);
      const saved = await new PlansService(this.db).readVersion(tx, input.userId, input.planId, input.versionId);
      const { capture, version } = saved, preview = version.preview;
      const capital = separateCapital(capture.profile, capture.assumptions.data);
      const riskTolerance = riskToleranceFromAssessment(capture.policy.data as { riskBands?: Array<{ id: string; minScore: number }> },
        (preview.calculation as { assessment?: { riskBandId?: string | null } } | undefined)?.assessment?.riskBandId);
      if (!riskTolerance || capital.status !== "READY" || !capital.growthCapital || new D(capital.growthCapital).lte(0) || !preview.calculation || !preview.replayInput) throw review("COMPLETE_SUITABILITY_INPUTS_REQUIRED");
      // Personal what-if/reforecast capital needs its own reviewed product mapping.
      if (preview.reforecast || preview.selection.whatIf) throw review("REVISED_CAPITAL_MAPPING_REVIEW_REQUIRED");
      const weights: Record<AssetClass, number> = { CASH: 0, BOND: 0, EQUITY: 0, GOLD: 0 };
      const holdings = preview.calculation.marketRows[0]?.holdings ?? [];
      for (const h of holdings) {
        const split = POLICY_ASSET_MAPPING[h.assetClass];
        if (!split) throw review("PRODUCT_ASSET_MAPPING_REQUIRED");
        for (const [assetClass, share] of Object.entries(split) as Array<[AssetClass, number]>)
          weights[assetClass] += new D(h.startWeightPercent).div(100).mul(share).toNumber();
      }
      const loss = assessLossConstraint(capital, capture.profile, capture.policy.data, holdings);
      if (loss.status !== "WITHIN_LIMIT") throw review("LOSS_CONSTRAINT_NOT_SATISFIED");
      const catalog = await this.catalog(tx);
      const existing = await tx.investmentHolding.findMany({ where: { userId: input.userId } });
      if (existing.some(h => h.lockedUntil && h.lockedUntil > new Date())) throw review("LOCKED_HOLDINGS_REQUIRE_REVIEW");
      if (existing.some(h => !catalog.some(p => p.productId === h.productId && !p.stale && p.product.status === "ACTIVE"))) throw review("FRESH_HOLDING_PRICES_REQUIRED");
      const toIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
      const rec = generatePortfolioRecommendation({ recommendationId: randomUUID(), userId: input.userId, planId: input.planId,
        targetAssetWeights: weights, growthCapitalVnd: capital.growthCapital, clientRiskTolerance: riskTolerance,
        horizonYears: Math.max(0, (toIndex(preview.replayInput.retirementMonth) - toIndex(capture.profile.valuationDate)) / 12),
        existingHoldings: existing.map(h => ({ productId: h.productId, assetClass: catalog.find(p => p.productId === h.productId)?.data.assetClass ?? "CASH", quantity: h.quantity.toNumber(), costBasisVnd: h.unitCost.toFixed(), currentNav: catalog.find(p => p.productId === h.productId)?.data.nav ?? "0" })) }, catalog.map(p => p.product), undefined, actor);
      const selected = catalog.filter(p => rec.items.some(i => i.productId === p.productId) || existing.some(h => h.productId === p.productId));
      const refs: References = { holdingsHash: await this.holdingsHash(tx, input.userId), profileRevision: version.profileRevision, goalRevision: 0, policyId: capture.policy.id, policyRevision: capture.policy.revision,
        assumptionId: capture.assumptions.id, assumptionRevision: capture.assumptions.revision,
        products: selected.map(p => ({ id: p.productId, hash: p.documentHash, revision: p.catalogRevision })) };
      if (!await this.referencesCurrent(tx, input.userId, input.versionId, refs)) throw review("CURRENT_REFERENCES_REQUIRED");
      const row = await tx.investmentRecommendation.create({ data: { id: rec.recommendationId, userId: input.userId, createdBy: actor, planVersionId: input.versionId,
        // Hash exactly what JSONB keeps (12 significant digits for non-integers) so view() re-verifies the stored document.
        document: storable(rec), contentHash: recommendationContentHash(storable(rec) as unknown as RecommendationResponse), references: json(refs), expiresAt: new Date(rec.expiresAt),
        items: { create: rec.items.map(item => ({ productId: item.productId, document: storable(item) })) } } });
      await audit(tx, actor, "RECOMMENDATION_CREATED", "INVESTMENT_RECOMMENDATION", row.id, json({ snapshot: rec, references: refs, contentHash: row.contentHash }));
      return this.view(row);
    });
  }
  private view(row: { id: string; revision: number; status: string; document: Prisma.JsonValue; contentHash: string }) {
    const rec = row.document as unknown as RecommendationResponse;
    if (recommendationContentHash(rec) !== row.contentHash || rec.lifecycleStatus !== row.status) throw review("RECOMMENDATION_INTEGRITY_FAILED");
    return { id: row.id, revision: row.revision, status: row.status, recommendation: rec };
  }
  async list(actor: string, admin = false) {
    if (admin) await requireInvestmentRole(this.db, actor, staff);
    if (!admin && (!this.publicationEnabled || !this.legalAuthorizationReference)) return [];
    const rows = await this.db.investmentRecommendation.findMany({ where: admin ? {} : { userId: actor, status: "PUBLISHED", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 100 });
    if (admin) return rows.map(r => this.view(r));
    const visible = [];
    for (const r of rows) {
      const rec = this.view(r).recommendation;
      const approval = await this.db.investmentApproval.findFirst({ where: { recommendationId: r.id, decision: "approve", revision: rec.revision, contentHash: r.contentHash, actorId: rec.approvedBy } });
      if (!approval || approval.actorId === r.createdBy || approval.actorId === r.userId) continue;
      const approver = await this.db.user.findFirst({ where: { id: approval.actorId, status: "ACTIVE", investmentRoles: { some: { role: "APPROVER" } } } });
      if (approver && await this.referencesCurrent(this.db, actor, r.planVersionId, r.references as unknown as References)) visible.push(this.view(r));
    }
    return visible;
  }
  async history(actor: string, id: string) {
    await requireInvestmentRole(this.db, actor, staff);
    if (!await this.db.investmentRecommendation.findUnique({ where: { id } })) throw missing();
    return this.db.investmentApproval.findMany({ where: { recommendationId: id }, orderBy: { createdAt: "asc" } });
  }
  async transition(actor: string, id: string, action: "validate" | "suitability" | "submit" | "approve" | "reject" | "publish" | "expire" | "supersede", raw: z.infer<typeof transitionRecommendation>) {
    const input = transitionRecommendation.parse(raw);
    return transaction(this.db, async tx => {
      await requireInvestmentRole(tx, actor, action === "approve" || action === "reject" ? ["APPROVER"] : action === "publish" || action === "expire" ? ["OPERATIONS"] : ["ADVISOR"]);
      const row = await tx.investmentRecommendation.findUnique({ where: { id } });
      if (!row) throw missing();
      if (row.revision !== input.expectedRevision) throw conflict();
      const rec = this.view(row).recommendation;
      if (["REJECTED", "EXPIRED", "SUPERSEDED"].includes(row.status)) throw review("TERMINAL_RECOMMENDATION");
      if (["validate", "suitability", "submit", "supersede"].includes(action) && row.createdBy !== actor) throw new AppError(403, "FORBIDDEN", "Chỉ người tạo được sửa quy trình bản nháp.");
      const current = await this.referencesCurrent(tx, row.userId, row.planVersionId, row.references as unknown as References);
      if (!["expire", "supersede", "reject"].includes(action) && (!current || row.expiresAt <= new Date())) throw review("STALE_RECOMMENDATION");
      let next: RecommendationResponse;
      try {
        if (action === "validate") next = Workflow.markDataValidated(rec);
        else if (action === "suitability") next = Workflow.markSuitabilityChecked(rec);
        else if (action === "submit") next = Workflow.submitForApproval(rec);
        else if (action === "approve") next = Workflow.approve(rec, actor, "APPROVER");
        else if (action === "publish") {
          const approval = await tx.investmentApproval.findFirst({ where: { recommendationId: id, decision: "approve", contentHash: row.contentHash, revision: rec.revision } });
          if (!approval) throw review("PERSISTED_APPROVAL_REQUIRED");
          await requireInvestmentRole(tx, approval.actorId, ["APPROVER"]);
          next = Workflow.publish(rec, { legalGateEnabled: this.publicationEnabled && !!this.legalAuthorizationReference, referencesCurrent: current, approverQualified: true, approval });
        } else {
          if (action === "reject" && (row.status !== "PENDING_APPROVAL" || row.createdBy === actor || row.userId === actor)) throw review("INVALID_REJECTION");
          if (action === "expire" && row.expiresAt > new Date()) throw review("NOT_EXPIRED");
          next = { ...rec, lifecycleStatus: action === "reject" ? "REJECTED" : action === "expire" ? "EXPIRED" : "SUPERSEDED" };
        }
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(422, "WORKFLOW_REJECTED", error instanceof Error ? error.message : "Thao tác không hợp lệ.");
      }
      const updated = await tx.investmentRecommendation.updateMany({ where: { id, revision: input.expectedRevision, status: row.status }, data: { status: next.lifecycleStatus, revision: { increment: 1 }, document: storable(next) } });
      if (updated.count !== 1) throw conflict();
      await tx.investmentApproval.create({ data: { recommendationId: id, actorId: actor, revision: rec.revision, contentHash: row.contentHash, decision: action, reason: input.reason,
        snapshot: json({ before: rec, after: next, references: row.references, legalAuthorizationReference: action === "publish" ? this.legalAuthorizationReference : null }) } });
      await audit(tx, actor, "RECOMMENDATION_" + action.toUpperCase(), "INVESTMENT_RECOMMENDATION", id, json({ from: row.status, to: next.lifecycleStatus, revision: row.revision + 1, contentHash: row.contentHash, reason: input.reason }));
      return { id, revision: row.revision + 1, status: next.lifecycleStatus, recommendation: next };
    });
  }
}
