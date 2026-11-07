/**
 * Investment Advisory & Recommendation Engine (Features F10, F14, F15, F16, F23)
 * Maps optimized target asset weights to specific investment products, calculates discrete execution
 * lots, compares against existing holdings, generates explainability narratives, and enforces
 * Vietnamese regulatory fences (Law on Securities No. 102/VBHN-VPQH).
 */

import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import { filterEligibleProducts } from "./eligibility";
import { scoreProduct } from "./scoring";
import type {
  AssetClass,
  ProductMasterData,
  RecommendationRequest,
  RecommendationResponse,
  RecommendationItem,
  RecommendationLifecycleStatus,
} from "./types";

export interface RecommendationPolicy {
  maxSingleProductWeight: number; // default 0.40 (40%)
  requireRegulatoryDisclaimers: boolean; // default true
}

const DEFAULT_POLICY: RecommendationPolicy = {
  maxSingleProductWeight: 0.40,
  requireRegulatoryDisclaimers: true,
};

export const MANDATORY_LEGAL_DISCLAIMERS = [
  "Khuyến nghị mang tính chất tư vấn tài chính hỗ trợ quyết định phân bổ tài sản hưu trí, không cấu thành cam kết lợi nhuận hoặc hợp đồng ủy thác đầu tư.",
  "Hệ thống An Hưu không nhận lưu ký tiền, không mở tài khoản chứng khoán và không trực tiếp thực hiện lệnh mua/bán thay cho nhà đầu tư.",
  "Nhà đầu tư chủ động thực hiện giao dịch qua các tổ chức phát hành, ngân hàng giám sát và công ty chứng khoán đối tác được Ủy ban Chứng khoán Nhà nước và Ngân hàng Nhà nước cấp phép.",
  "Lợi nhuận quá khứ của các quỹ mở, ETF và tài sản đầu tư không bảo đảm cho kết quả trong tương lai.",
];

/**
 * Main Recommendation Engine
 */
export function generatePortfolioRecommendation(
  request: RecommendationRequest,
  catalog: ProductMasterData[],
  policy = DEFAULT_POLICY,
  creatorId = request.userId
): RecommendationResponse {
  const growthCapital = new D(request.growthCapitalVnd);
  const requestedWeights = Object.values(request.targetAssetWeights);
  if (!growthCapital.isFinite() || growthCapital.lte(0) || requestedWeights.length !== 4
    || requestedWeights.some(w => !Number.isFinite(w) || w < 0 || w > 1)
    || Math.abs(requestedWeights.reduce((a, b) => a + b, 0) - 1) > 1e-8
    || !Number.isFinite(request.horizonYears) || request.horizonYears < 0
    || !Number.isFinite(policy.maxSingleProductWeight) || policy.maxSingleProductWeight <= 0 || policy.maxSingleProductWeight > 1)
    throw new RangeError("Invalid recommendation capital, weights or policy");
  const items: RecommendationItem[] = [];
  const allExcluded: Array<{ productId: string; productCode: string; reason: string }> = [];
  const suitabilityRationale: string[] = [];

  const assetClasses: AssetClass[] = ["CASH", "BOND", "EQUITY", "GOLD"];
  const actualAllocatedWeights: Record<AssetClass, number> = { CASH: 0, BOND: 0, EQUITY: 0, GOLD: 0 };
  let totalAllocatedVnd = new D(0);

  // Map existing holdings by productId
  const existingHoldingsMap = new Map<string, { quantity: number; currentNav: string }>();
  for (const h of request.existingHoldings ?? []) {
    existingHoldingsMap.set(h.productId, { quantity: h.quantity, currentNav: h.currentNav });
  }

  for (const assetClass of assetClasses) {
    const targetWeight = request.targetAssetWeights[assetClass] ?? 0;
    if (targetWeight <= 0) continue;

    const classCapitalVnd = growthCapital.mul(targetWeight);

    // 1. Filter catalog for products in this asset class
    const classProducts = catalog.filter(p => p.assetClass === assetClass);

    // 2. Run Eligibility Filter
    const { eligible, excluded } = filterEligibleProducts(classProducts, {
      clientRiskTolerance: request.clientRiskTolerance,
      availableCapitalVnd: classCapitalVnd.toFixed(),
      horizonYears: request.horizonYears,
      targetAssetClass: assetClass,
    });

    for (const exc of excluded) {
      allExcluded.push({
        productId: exc.product.id,
        productCode: exc.product.code,
        reason: exc.reason,
      });
    }

    if (eligible.length === 0) {
      suitabilityRationale.push(
        `Không tìm thấy sản phẩm hợp lệ cho nhóm ${assetClass} thỏa mãn khẩu vị rủi ro ${request.clientRiskTolerance}.`
      );
      continue;
    }

    // 3. Score eligible products
    const scored = eligible.map(p => ({
      product: p,
      score: scoreProduct(p, request.horizonYears),
    }));

    // Sort descending by totalScore
    scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // 4. Select top product(s)
    // If targetWeight > 35% and at least 2 products available, diversify into top 2
    const numToSelect = (targetWeight > 0.35 && scored.length >= 2) ? 2 : 1;
    const selectedList = scored.slice(0, numToSelect);

    const weightPerProduct = Math.min(targetWeight / numToSelect, policy.maxSingleProductWeight);
    const capitalPerProduct = growthCapital.mul(weightPerProduct);

    for (const { product, score } of selectedList) {
      const nav = new D(product.nav);
      const lotSize = product.lotSize > 0 ? product.lotSize : 1;

      if (!nav.isFinite() || nav.lte(0)) continue;

      // Compute discrete lot units
      // units = floor(capital / (nav * lotSize)) * lotSize
      const unitCost = nav.mul(lotSize);
      const lots = capitalPerProduct.div(unitCost).floor();
      const recommendedUnits = lots.mul(lotSize).toNumber();
      const recommendedAmount = new D(recommendedUnits).mul(nav);
      if (!recommendedUnits || recommendedAmount.lt(product.minimumInvestmentVnd)) continue;

      // Compare with current holding
      const holding = existingHoldingsMap.get(product.id);
      const currentUnits = holding?.quantity ?? 0;
      const currentAmount = new D(currentUnits).mul(nav);

      const deltaUnits = recommendedUnits - currentUnits;
      const deltaAmount = recommendedAmount.minus(currentAmount);

      let action: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (deltaUnits > 0) {
        action = "BUY";
      } else if (deltaUnits < 0) {
        action = "SELL";
      }

      // Annual fee calculation
      const terPercent = new D(product.annualExpenseRatioPercent || "0");
      const annualFeeVnd = recommendedAmount.mul(terPercent).div(100);

      totalAllocatedVnd = totalAllocatedVnd.plus(recommendedAmount);
      actualAllocatedWeights[assetClass] += recommendedAmount.div(growthCapital).toNumber();

      items.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        partnerName: product.partnerName,
        assetClass: product.assetClass,
        category: product.category,
        recommendedWeight: recommendedAmount.div(growthCapital).toNumber(),
        recommendedAmountVnd: recommendedAmount.toFixed(),
        currentAmountVnd: currentAmount.toFixed(),
        actionAmountVnd: deltaAmount.abs().toFixed(),
        recommendedUnits,
        action,
        rationale: score.rationale,
        estimatedAnnualFeeVnd: annualFeeVnd.toFixed(),
        riskScore: product.riskScore,
        riskLevel: product.riskLevel,
      });
    }
  }

  // Executive summary
  const executiveSummary =
    `Phương án phân bổ sản phẩm cụ thể đề xuất tổng cộng ${totalAllocatedVnd.div(1e6).toFixed(1)} triệu VNĐ ` +
    `từ nguồn vốn tăng trưởng dài hạn. Tỷ trọng mục tiêu tham chiếu là (${Math.round((request.targetAssetWeights.EQUITY ?? 0) * 100)}% Cổ phiếu, ` +
    `${Math.round((request.targetAssetWeights.BOND ?? 0) * 100)}% Trái phiếu, ${Math.round((request.targetAssetWeights.CASH ?? 0) * 100)}% Tiền gửi, ` +
    `${Math.round((request.targetAssetWeights.GOLD ?? 0) * 100)}% Vàng) và khẩu vị rủi ro ${request.clientRiskTolerance}. Phần chưa phân bổ ${growthCapital.minus(totalAllocatedVnd).toFixed()} VNĐ cần được xem xét riêng; hệ thống chưa thực hiện giao dịch.`;

  const response: RecommendationResponse = {
    recommendationId: request.recommendationId ?? `REC-${Date.now()}`,
    userId: request.userId,
    planId: request.planId,
    lifecycleStatus: "DRAFT",
    createdAt: new Date().toISOString(),
    createdBy: creatorId,
    revision: 1,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    growthCapitalVnd: request.growthCapitalVnd,
    totalAllocatedVnd: totalAllocatedVnd.toFixed(),
    targetAssetWeights: request.targetAssetWeights,
    actualAllocatedWeights,
    items,
    explanation: {
      executiveSummary,
      suitabilityRationale,
      excludedProducts: allExcluded,
      regulatoryDisclosures: MANDATORY_LEGAL_DISCLAIMERS,
    },
  };

  return response;
}

/**
 * Recommendation Approval Lifecycle State Machine (Feature F16 & F21)
 * Enforces strict role-based state transitions:
 * DRAFT -> SUITABILITY_CHECKED -> PENDING_APPROVAL -> APPROVED -> PUBLISHED
 */
export class RecommendationApprovalManager {
  /**
   * Suitability check: verifies all items match user constraints
   */
  static verifySuitability(rec: RecommendationResponse): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    if (rec.items.length === 0) {
      issues.push("Danh mục không có sản phẩm nào được khuyến nghị.");
    }
    const allocated = new D(rec.totalAllocatedVnd);
    const growth = new D(rec.growthCapitalVnd);
    if (!growth.isFinite() || growth.lte(0) || !allocated.isFinite() || allocated.lt(0) || allocated.gt(growth)) {
      issues.push("Tổng vốn phân bổ vượt quá nguồn vốn tăng trưởng khả dụng.");
    }
    let itemTotal = new D(0);
    for (const item of rec.items) {
      const value = new D(item.recommendedAmountVnd);
      if (!value.isFinite() || value.lte(0) || !Number.isFinite(item.recommendedUnits) || item.recommendedUnits <= 0 || !Number.isFinite(item.recommendedWeight) || item.recommendedWeight < 0 || item.recommendedWeight > 1) issues.push("INVALID_ITEM");
      itemTotal = itemTotal.plus(value);
    }
    if (!itemTotal.eq(allocated)) issues.push("ITEM_TOTAL_MISMATCH");
    return { valid: issues.length === 0, issues };
  }

  /**
   * Transition: DRAFT -> SUITABILITY_CHECKED
   */
  static markDataValidated(rec: RecommendationResponse): RecommendationResponse {
    if (rec.lifecycleStatus !== "DRAFT") throw new Error("Expected DRAFT");
    if (!rec.createdBy || !Number.isInteger(rec.revision) || rec.revision < 1) throw new Error("Invalid recommendation provenance");
    if (!this.verifySuitability(rec).valid) throw new Error("Invalid recommendation data");
    return { ...rec, lifecycleStatus: "DATA_VALIDATED" };
  }

  static markSuitabilityChecked(rec: RecommendationResponse): RecommendationResponse {
    if (rec.lifecycleStatus !== "DATA_VALIDATED") {
      throw new Error(`Invalid state transition from ${rec.lifecycleStatus} to SUITABILITY_CHECKED`);
    }
    const check = this.verifySuitability(rec);
    if (!check.valid) {
      throw new Error(`Suitability check failed: ${check.issues.join("; ")}`);
    }
    return { ...rec, lifecycleStatus: "SUITABILITY_CHECKED" };
  }

  /**
   * Transition: SUITABILITY_CHECKED -> PENDING_APPROVAL
   */
  static submitForApproval(rec: RecommendationResponse): RecommendationResponse {
    if (rec.lifecycleStatus !== "SUITABILITY_CHECKED") {
      throw new Error(`Invalid state transition from ${rec.lifecycleStatus} to PENDING_APPROVAL`);
    }
    return { ...rec, lifecycleStatus: "PENDING_APPROVAL" };
  }

  /**
   * Transition: PENDING_APPROVAL -> APPROVED
   * Only allowed by a separately granted APPROVER
   */
  static approve(
    rec: RecommendationResponse,
    approverId: string,
    approverRole: string
  ): RecommendationResponse {
    const allowedRoles = ["APPROVER"];
    if (!allowedRoles.includes(approverRole)) {
      throw new Error(`Access Denied: Role ${approverRole} is not authorized to approve investment recommendations.`);
    }
    if (!rec.createdBy || approverId === rec.createdBy || approverId === rec.userId) throw new Error("Access Denied: Independent approver required.");
    if (Date.parse(rec.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(rec.expiresAt))) throw new Error("Recommendation expired");
    if (rec.lifecycleStatus !== "PENDING_APPROVAL") {
      throw new Error(`Invalid state transition from ${rec.lifecycleStatus} to APPROVED`);
    }
    return {
      ...rec,
      lifecycleStatus: "APPROVED",
      approvedAt: new Date().toISOString(),
      approvedBy: approverId,
    };
  }

  /**
   * Transition: APPROVED -> PUBLISHED
   * Only published recommendations can be served to retail clients!
   */
  static publish(rec: RecommendationResponse, evidence?: PublicationEvidence): RecommendationResponse {
    if (rec.lifecycleStatus !== "APPROVED") {
      throw new Error(`Cannot publish recommendation with status ${rec.lifecycleStatus}. Must be APPROVED first.`);
    }
    if (!evidence || !evidence.legalGateEnabled || !evidence.referencesCurrent || !evidence.approverQualified
      || evidence.approval.revision !== rec.revision || evidence.approval.contentHash !== recommendationContentHash(rec)
      || evidence.approval.actorId !== rec.approvedBy || evidence.approval.actorId === rec.createdBy
      || evidence.approval.actorId === rec.userId || !rec.approvedAt
      || !Number.isFinite(Date.parse(rec.expiresAt)) || Date.parse(rec.expiresAt) <= Date.now()) {
      throw new Error("Publication requires current persisted independent approval and legal authorization");
    }
    return { ...rec, lifecycleStatus: "PUBLISHED" };
  }
}


// Evidence must be loaded by the service from its transaction, never request JSON.
export interface PublicationEvidence {
  legalGateEnabled: boolean;
  referencesCurrent: boolean;
  approverQualified: boolean;
  approval: { actorId: string; revision: number; contentHash: string };
}
export function recommendationContentHash(rec: RecommendationResponse): string {
  const { lifecycleStatus, approvedAt, approvedBy, ...content } = rec;
  return digest(content);
}
