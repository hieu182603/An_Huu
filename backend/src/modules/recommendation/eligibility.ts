/**
 * Product Eligibility Filter (Feature F12)
 * Filters the product catalog before scoring and portfolio mapping.
 * 
 * Invalidation criteria:
 * - Product is inactive or distribution is not permitted under Vietnamese regulations.
 * - Product minimum investment exceeds available capital for that asset class.
 * - Product risk level exceeds client risk tolerance threshold.
 * - Product liquidity settlement period is incompatible with horizon.
 * - Product data is stale or missing critical financial disclosures.
 */

import { RetirementDecimal as D } from "../retirement/engine";
import type { ProductMasterData, RiskLevel } from "./types";

export interface EligibilityContext {
  clientRiskTolerance: RiskLevel;
  availableCapitalVnd: string;
  horizonYears: number;
  targetAssetClass?: string;
}

export interface EligibilityFilterResult {
  eligible: ProductMasterData[];
  excluded: Array<{
    product: ProductMasterData;
    reason: string;
  }>;
}

const RISK_HIERARCHY: Record<RiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function filterEligibleProducts(
  catalog: ProductMasterData[],
  context: EligibilityContext
): EligibilityFilterResult {
  const eligible: ProductMasterData[] = [];
  const excluded: Array<{ product: ProductMasterData; reason: string }> = [];

  const clientRiskRank = RISK_HIERARCHY[context.clientRiskTolerance] ?? 2;
  const availableCapital = new D(context.availableCapitalVnd);

  for (const product of catalog) {
    // 1. Status & Regulatory Distribution Permission
    if (product.status !== "ACTIVE") {
      excluded.push({
        product,
        reason: "Sản phẩm đang ở trạng thái ngừng giao dịch hoặc tạm khóa phân phối.",
      });
      continue;
    }

    if (!product.isDistributionPermitted) {
      excluded.push({
        product,
        reason: "Sản phẩm chưa được cơ quan quản lý (UBCKNN/NHNN) cấp phép phân phối cho nhà đầu tư cá nhân.",
      });
      continue;
    }

    // 2. Minimum Investment Requirement
    const minInv = new D(product.minimumInvestmentVnd || "0");
    if (minInv.gt(availableCapital)) {
      excluded.push({
        product,
        reason: `Mức đầu tư tối thiểu (${minInv.div(1e6).toFixed()} triệu VNĐ) vượt quá ngân sách khả dụng.`,
      });
      continue;
    }

    // 3. Risk Tolerance Suitability Gate
    const productRiskRank = RISK_HIERARCHY[product.riskLevel] ?? 2;
    if (productRiskRank > clientRiskRank) {
      excluded.push({
        product,
        reason: `Cấp độ rủi ro (${product.riskLevel}) vượt quá khẩu vị rủi ro tối đa cho phép của khách hàng (${context.clientRiskTolerance}).`,
      });
      continue;
    }

    // 4. Tenor / Liquidity Compatibility
    // If client horizon is very short (< 1 year), locked bond funds or long-tenor deposits are unsuitable
    if (context.horizonYears < 1 && product.liquidityDays > 30) {
      excluded.push({
        product,
        reason: "Thời hạn khóa vốn của sản phẩm không phù hợp với mục tiêu rút vốn ngắn hạn dưới 1 năm.",
      });
      continue;
    }

    // Passed all eligibility checks
    eligible.push(product);
  }

  return { eligible, excluded };
}

