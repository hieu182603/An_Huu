/**
 * Multi-Asset Product Scoring Engine (Feature F13)
 * Evaluates and scores financial products using asset-class specific multi-criteria models.
 * 
 * Mandatory Compliance Rules:
 * - REQ-02: Referral commissions MUST NEVER increase product score (0% commission weight).
 * - Domain-specific formulas for Cash/Deposits, Bond Funds, Equity ETFs, and Gold.
 * - Score range: 0.0 to 100.0 points.
 */

import { RetirementDecimal as D } from "../retirement/engine";
import type { ProductMasterData, RiskLevel } from "./types";

export interface ProductScoreBreakdown {
  productId: string;
  totalScore: number; // 0 to 100
  costScore: number;
  riskFitScore: number;
  liquidityScore: number;
  qualityScore: number; // Tracking error for ETFs, Credit/Duration for Bonds, Counterparty for Deposits
  rationale: string[];
}

/**
 * Score a term deposit / cash equivalent
 * Criteria:
 * - Return/Yield: 45% (higher is better)
 * - Credit/Stability: 35% (State-owned Big 4 or Tier 1 bank)
 * - Liquidity/Tenor: 20%
 */
export function scoreCashProduct(product: ProductMasterData, targetHorizonYears: number): ProductScoreBreakdown {
  const rationale: string[] = [];

  // Cost: deposits typically have 0% TER
  const ter = new D(product.annualExpenseRatioPercent || "0");
  const costScore = Math.max(0, 100 - ter.mul(100).toNumber() * 20);

  // Yield / Return proxy from NAV/rate
  const returnRate = new D(product.nav).gt(0) ? 80 : 70;

  // Liquidity (Days to withdraw)
  const liquidityScore = product.liquidityDays <= 1 ? 100 : product.liquidityDays <= 7 ? 85 : 70;
  if (product.liquidityDays <= 1) {
    rationale.push("Thanh khoản cao (T+0/T+1), dễ dàng rút vốn khi cần khẩn cấp.");
  }

  // Counterparty Safety / Credit Rating
  let qualityScore = 80;
  if (product.creditRating === "AAA" || product.partnerName.includes("Vietcombank") || product.partnerName.includes("BIDV")) {
    qualityScore = 95;
    rationale.push("Tổ chức phát hành thuộc nhóm ngân hàng thương mại quốc doanh uy tín hàng đầu.");
  } else if (product.creditRating?.startsWith("A")) {
    qualityScore = 85;
  }

  const riskFitScore = product.riskLevel === "LOW" ? 95 : 80;

  const totalScore = 0.30 * costScore + 0.30 * returnRate + 0.20 * liquidityScore + 0.20 * qualityScore;

  return {
    productId: product.id,
    totalScore: Math.round(totalScore * 10) / 10,
    costScore,
    riskFitScore,
    liquidityScore,
    qualityScore,
    rationale,
  };
}

/**
 * Score a Bond / Fixed Income Fund
 * Criteria:
 * - Duration match to remaining horizon: 30%
 * - Cost Efficiency (Low TER): 30%
 * - Credit Rating & Quality: 25%
 * - Liquidity: 15%
 */
export function scoreBondProduct(product: ProductMasterData, targetHorizonYears: number): ProductScoreBreakdown {
  const rationale: string[] = [];

  // Cost Efficiency: TER < 1.0% gets full marks
  const ter = new D(product.annualExpenseRatioPercent || "1.0").toNumber();
  const costScore = Math.max(0, Math.min(100, Math.round(100 - (ter - 0.5) * 50)));
  if (ter <= 0.8) {
    rationale.push(`Phí quản lý cạnh tranh (${ter}%/năm), tiết kiệm chi phí dài hạn.`);
  }

  // Duration match: closer duration to target horizon is preferred
  const dur = product.durationYears ? parseFloat(product.durationYears) : 3.0;
  const durationDiff = Math.abs(dur - Math.min(10, targetHorizonYears));
  const qualityScore = Math.max(40, Math.min(100, Math.round(100 - durationDiff * 10)));
  if (durationDiff <= 2.0) {
    rationale.push(`Thời lượng bình quân (Duration ${dur} năm) phù hợp với chu kỳ hưu trí.`);
  }

  // Credit Rating
  let creditScore = 80;
  if (product.creditRating === "AAA" || product.category === "GOVERNMENT_BOND") {
    creditScore = 100;
    rationale.push("Chất lượng tín dụng cao nhất (Trái phiếu Chính phủ / Hạng AAA).");
  } else if (product.creditRating === "AA") {
    creditScore = 90;
  }

  const liquidityScore = product.liquidityDays <= 3 ? 90 : 75;
  const riskFitScore = product.riskLevel === "LOW" ? 90 : product.riskLevel === "MEDIUM" ? 85 : 70;

  const totalScore = 0.30 * costScore + 0.25 * qualityScore + 0.25 * creditScore + 0.20 * liquidityScore;

  return {
    productId: product.id,
    totalScore: Math.round(totalScore * 10) / 10,
    costScore,
    riskFitScore,
    liquidityScore,
    qualityScore,
    rationale,
  };
}

/**
 * Score an Equity ETF / Mutual Fund
 * Criteria:
 * - Total Expense Ratio (TER): 35% (lower is better, ETF ~0.6% vs Fund ~1.8%)
 * - Tracking Error: 35% (for ETFs, tracking error < 0.8% is excellent)
 * - Liquidity & AUM / Spread: 30%
 */
export function scoreEquityProduct(product: ProductMasterData): ProductScoreBreakdown {
  const rationale: string[] = [];

  // Cost Score: ETFs with TER <= 0.7% score 95-100; Funds with TER > 2% score 50
  const ter = new D(product.annualExpenseRatioPercent || "1.5").toNumber();
  const costScore = Math.max(30, Math.min(100, Math.round(100 - (ter - 0.5) * 40)));
  if (ter <= 0.8) {
    rationale.push(`Chi phí hoạt động thấp vượt trội (${ter}%/năm), tối ưu hiệu ứng lãi kép dài hạn.`);
  }

  // Tracking Error / Benchmark Consistency
  let qualityScore = 80;
  if (product.category === "EQUITY_ETF") {
    const te = product.trackingErrorPercent ? parseFloat(product.trackingErrorPercent) : 0.8;
    qualityScore = Math.max(40, Math.min(100, Math.round(100 - te * 35)));
    if (te <= 0.8) {
      rationale.push(`Độ lệch bám sát chỉ số thấp (${te}%), mô phỏng chính xác tăng trưởng thị trường.`);
    }
  } else {
    // Active fund
    qualityScore = 75;
    rationale.push("Quỹ mở cổ phiếu chủ động, danh mục đa dạng hóa theo quy chế Ủy ban Chứng khoán.");
  }

  // Liquidity
  const liquidityScore = product.liquidityDays <= 2 ? 95 : 80;
  if (product.liquidityDays <= 2) {
    rationale.push("Khớp lệnh trên sàn giao dịch chứng khoán (T+2), tính thanh khoản vượt trội.");
  }

  const riskFitScore = product.riskLevel === "MEDIUM" ? 85 : 80;
  const totalScore = 0.35 * costScore + 0.35 * qualityScore + 0.30 * liquidityScore;

  return {
    productId: product.id,
    totalScore: Math.round(totalScore * 10) / 10,
    costScore,
    riskFitScore,
    liquidityScore,
    qualityScore,
    rationale,
  };
}

/**
 * Score Gold / Precious Metals Product
 * Criteria:
 * - Brand Certification & Purity (SJC/PNJ 99.99%): 50%
 * - Bid/Ask Spread & Liquidity: 50%
 */
export function scoreGoldProduct(product: ProductMasterData): ProductScoreBreakdown {
  const rationale: string[] = [];

  let qualityScore = 85;
  if (product.name.includes("SJC") || product.name.includes("PNJ")) {
    qualityScore = 98;
    rationale.push("Vàng miếng tiêu chuẩn quốc gia SJC 99.99%, đảm bảo tính thanh khoản tuyệt đối trên toàn quốc.");
  }

  const liquidityScore = 95; // Physical gold in VN is highly liquid
  rationale.push("Thanh khoản tức thì, công cụ phòng hộ lạm phát và rủi ro địa chính trị truyền thống.");

  const costScore = 80; // Gold has 0% management fee, only buy/sell spread
  const riskFitScore = 85;

  const totalScore = 0.50 * qualityScore + 0.30 * liquidityScore + 0.20 * costScore;

  return {
    productId: product.id,
    totalScore: Math.round(totalScore * 10) / 10,
    costScore,
    riskFitScore,
    liquidityScore,
    qualityScore,
    rationale,
  };
}

/**
 * Universal Multi-Asset Product Scorer
 */
export function scoreProduct(product: ProductMasterData, horizonYears = 15): ProductScoreBreakdown {
  switch (product.assetClass) {
    case "CASH":
      return scoreCashProduct(product, horizonYears);
    case "BOND":
      return scoreBondProduct(product, horizonYears);
    case "EQUITY":
      return scoreEquityProduct(product);
    case "GOLD":
      return scoreGoldProduct(product);
    default:
      return {
        productId: product.id,
        totalScore: 50,
        costScore: 50,
        riskFitScore: 50,
        liquidityScore: 50,
        qualityScore: 50,
        rationale: ["Sản phẩm đầu tư tiêu chuẩn."],
      };
  }
}

