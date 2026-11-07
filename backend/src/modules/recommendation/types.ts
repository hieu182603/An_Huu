/**
 * Investment Product Recommendation Engine — Types & Domain Models (Features F10-F16, F21, F23)
 * Implements strict type definitions for product master data, multi-asset scoring,
 * portfolio-to-product mapping, and approval governance.
 */

export type AssetClass = "CASH" | "BOND" | "EQUITY" | "GOLD";

export type ProductCategory =
  | "TERM_DEPOSIT"
  | "GOVERNMENT_BOND"
  | "OPEN_BOND_FUND"
  | "EQUITY_ETF"
  | "ACTIVE_EQUITY_FUND"
  | "PHYSICAL_GOLD";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RecommendationLifecycleStatus =
  | "DRAFT"
  | "DATA_VALIDATED"
  | "SUITABILITY_CHECKED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "EXPIRED"
  | "SUPERSEDED";

export type RecommendationAction = "BUY" | "SELL" | "HOLD";

export interface ProductMasterData {
  id: string;
  code: string; // e.g. "VCB_12M", "E1VFVN30", "TCBF", "SJC_1L"
  name: string;
  partnerId: string;
  partnerName: string;
  assetClass: AssetClass;
  category: ProductCategory;
  nav: string; // VND per unit / lot
  annualExpenseRatioPercent: string; // Total Expense Ratio (TER), e.g. "0.75" = 0.75%
  liquidityDays: number; // T+N settlement / withdrawal days
  lotSize: number; // e.g. 100 for stocks/ETFs, 1 for funds/deposits
  minimumInvestmentVnd: string;
  riskLevel: RiskLevel;
  riskScore: number; // 1 (lowest) to 10 (highest)
  trackingErrorPercent?: string; // For index funds & ETFs
  durationYears?: string; // For bond funds & fixed income
  creditRating?: string; // e.g. "AAA", "AA", "A"
  isDistributionPermitted: boolean;
  status: "ACTIVE" | "INACTIVE";
  description?: string;
  conditions?: string;
  disclosures?: string;
}

export interface UserHoldingItem {
  productId: string;
  assetClass: AssetClass;
  quantity: number;
  costBasisVnd: string;
  currentNav: string;
}

export interface RecommendationRequest {
  recommendationId?: string;
  userId: string;
  planId: string;
  targetAssetWeights: Record<AssetClass, number>; // e.g. { CASH: 0.15, BOND: 0.30, EQUITY: 0.45, GOLD: 0.10 }
  growthCapitalVnd: string; // Total long-term investable capital after emergency & near-term goals
  clientRiskTolerance: RiskLevel; // Client risk profile
  maxLossPercent?: string; // Maximum tolerable loss %
  horizonYears: number; // Remaining investment horizon
  existingHoldings?: UserHoldingItem[];
}

export interface RecommendationItem {
  productId: string;
  productCode: string;
  productName: string;
  partnerName: string;
  assetClass: AssetClass;
  category: ProductCategory;
  recommendedWeight: number; // Target weight in growth capital (0.0 to 1.0)
  recommendedAmountVnd: string; // Allocated VND capital
  currentAmountVnd: string; // Current holding VND
  actionAmountVnd: string; // Net buy or sell VND amount
  recommendedUnits: number; // Calculated discrete units respecting lotSize
  action: RecommendationAction;
  rationale: string[];
  estimatedAnnualFeeVnd: string;
  riskScore: number;
  riskLevel: RiskLevel;
}

export interface RecommendationResponse {
  recommendationId: string;
  userId: string;
  planId: string;
  lifecycleStatus: RecommendationLifecycleStatus;
  createdAt: string;
  createdBy: string;
  revision: number;
  expiresAt: string;
  approvedAt?: string;
  approvedBy?: string;
  growthCapitalVnd: string;
  totalAllocatedVnd: string;
  targetAssetWeights: Record<AssetClass, number>;
  actualAllocatedWeights: Record<AssetClass, number>;
  items: RecommendationItem[];
  explanation: {
    executiveSummary: string;
    suitabilityRationale: string[];
    excludedProducts: Array<{ productId: string; productCode: string; reason: string }>;
    regulatoryDisclosures: string[];
  };
}

