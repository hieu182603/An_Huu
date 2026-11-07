import { authenticatedRequest } from "./api";
export type Recommendation = { id: string; revision: number; status: string; recommendation: { userId: string; planId: string; createdBy: string; expiresAt: string; growthCapitalVnd: string; totalAllocatedVnd: string;
  items: Array<{ productId: string; productName: string; assetClass: string; recommendedAmountVnd: string; recommendedWeight: number; estimatedAnnualFeeVnd: string; action: string }>;
  explanation: { executiveSummary: string; suitabilityRationale: string[]; regulatoryDisclosures: string[] } } };
export type Holdings = { status: string; products: Array<{ id: string; name: string }>; holdings: Array<{ id: string; revision: number; productId: string; productName: string; quantity: string; costBasis: string; currentPrice: string | null; assetClass: string | null; priceAsOf: string | null; sourceKind: string | null; sourceReference: string | null; stale: boolean; lockedUntil: string | null }>;
  summary: { totalValue: string; totalCost: string; totalUnrealizedGainLoss: string; holdings: Array<{ productId: string; currentValue: string; unrealizedGainLoss: string; weightPercent: string }> } | null };
export type Rebalance = { status: string; issues?: string[]; cost?: string; informationalOnly: boolean; trades?: Array<{ assetClass: string; buy: string; sell: string; cashAllocated: string; newValue: string }> };
export type ProductData = { id: string; name: string; revision: number; stale: boolean; data: { code: string; assetClass: string; category: string; nav: string; annualExpenseRatioPercent: string; liquidityDays: number; lotSize: number; minimumInvestmentVnd: string; riskScore: number; isDistributionPermitted: boolean; status: string; sourceKind: string; sourceReference: string; currency: string; priceAsOf: string; validUntil: string; distributionEvidence: string } };
const read = <T>(path: string, signal?: AbortSignal) => authenticatedRequest<T>("/investments" + path, undefined, "GET", undefined, { skipCache: true, signal });
const write = <T>(path: string, body: unknown, method = "POST") => authenticatedRequest<T>("/investments" + path, body, method);
export const investmentApi = {
  permissions: () => read<{ roles: string[]; publicationEnabled: boolean }>("/permissions"),
  recommendations: (admin = false, signal?: AbortSignal) => read<Recommendation[]>(admin ? "/admin/recommendations" : "/recommendations", signal),
  holdings: (signal?: AbortSignal) => read<Holdings>("/holdings", signal),
  saveHolding: (body: unknown) => write("/holdings", body, "PUT"),
  rebalance: (body: unknown) => write<Rebalance>("/holdings/rebalance", body),
  create: (body: unknown) => write<Recommendation>("/admin/recommendations", body),
  transition: (rec: Recommendation, action: string, reason: string) => write<Recommendation>(`/admin/recommendations/${rec.id}/${action}`, { expectedRevision: rec.revision, reason }),
  history: (id: string) => read<Array<{ actorId: string; decision: string; reason: string; createdAt: string; contentHash: string }>>(`/admin/recommendations/${id}/history`),
  products: () => read<ProductData[]>("/admin/products"),
  unconfiguredProducts: () => read<Array<{ id: string; name: string; category: string }>>("/admin/unconfigured-products"),
  providers: () => read<Array<{ providerId: string; status: string; message?: string }>>("/admin/providers"),
  saveProduct: (p: ProductData) => write(`/admin/products/${p.id}`, { expectedRevision: p.revision, data: p.data }, "PUT"),
};
