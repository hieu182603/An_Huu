import { z } from "zod";

export const assetClassEnum = z.enum(["CASH", "BOND", "EQUITY", "GOLD"]);
export type AssetClassType = z.infer<typeof assetClassEnum>;

export const userHoldingItemSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  productId: z.string().min(1),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  assetClass: assetClassEnum,
  quantity: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Số lượng phải là số không âm"),
  costBasis: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Giá vốn phải là số không âm"),
  currentPrice: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Giá thị trường phải là số không âm"),
  maturedAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/).default("0"),
  currency: z.string().default("VND"),
  updatedAt: z.string().datetime().optional(),
}).strict();

export type UserHoldingItem = z.infer<typeof userHoldingItemSchema>;

export interface HoldingValuation {
  productId: string;
  productCode: string;
  productName: string;
  assetClass: AssetClassType;
  quantity: string;
  costBasis: string;
  currentPrice: string;
  currentValue: string;
  costTotal: string;
  unrealizedGainLoss: string;
  unrealizedGainLossPercent: string;
  weightPercent: string;
}

export interface AssetClassValuation {
  assetClass: AssetClassType;
  value: string;
  weightPercent: string;
  maturedAmount: string;
}

export interface PortfolioHoldingsSummary {
  userId: string;
  asOfDate: string;
  totalValue: string;
  totalCost: string;
  totalUnrealizedGainLoss: string;
  totalUnrealizedGainLossPercent: string;
  holdings: HoldingValuation[];
  assetClasses: AssetClassValuation[];
}

export interface TargetAllocationItem {
  assetClass: string;
  weightPercent: string;
}

export interface DriftItem {
  assetClass: string;
  currentWeightPercent: string;
  targetWeightPercent: string;
  driftPercent: string;
  status: "OVERWEIGHT" | "UNDERWEIGHT" | "IN_TOLERANCE";
}

export interface DriftMonitoringResult {
  userId: string;
  asOfDate: string;
  totalPortfolioValue: string;
  isDrifted: boolean;
  maxDriftPercent: string;
  driftThresholdPercent: string;
  drifts: DriftItem[];
  rebalanceRequired: boolean;
  rebalanceRecommendation: {
    status: "NO_ACTION" | "PROPOSED" | "REVIEW_REQUIRED";
    costEstimated: string;
    trades: Array<{
      assetClass: string;
      oldValue: string;
      maturedAmount: string;
      cashAllocated: string;
      buy: string;
      sell: string;
      newValue: string;
    }>;
    cashUsedBeforeTrades: string;
    unallocatedCash: string;
  } | null;
  regulatoryDisclaimer: string;
}

