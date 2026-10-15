import { authenticatedRequest } from "./api";
import type { RetirementPreviewInput, RetirementIssue } from "./retirement";
export type Amount = string | null;
export type Allocation = { assetClass: string; weightPercent: string };
export type CapitalSeparation = {
  status: string; informationalOnly: true; currency: string; valuationMonth: string; assumptionBasis: string;
  essentialMonthlyExpense: Amount; reserveMonths: number | null; requiredEmergencyReserve: Amount;
  declaredEmergencyReserve: Amount; emergencyShortfall: Amount; retirementLiquidAssets: Amount;
  nearTermGoalsPresentValue: Amount; growthCapital: Amount; investableLiquidAssets: Amount; declaredOtherGoalsCapital: Amount;
  goals: Array<{ id: string; dueMonth: string; monthsUntilDue: number; treatment: string; futureAmount: Amount; presentValue: Amount; inflationBasis: string; inflationSourceIds: string[]; depositSourceIds: string[] }>;
  issues: RetirementIssue[]; warnings: RetirementIssue[];
};
export type LossConstraint = { status: string; informationalOnly: true; message: string; issues: string[];
  growthCapital: Amount; lossAmount: Amount; allowedLossAmount: Amount; lossPercentOfGrowth: Amount; lossPercentOfInvestableAssets: Amount;
  exceedsTolerance: boolean | null; maxEquityWeightPercent: Amount; proposedLossAmount: Amount; proposedAllocations: Allocation[] };
export type AdjustmentOptions = { status: string; requiredMonthlyContribution?: Amount; contributionWithinCapacity?: boolean | null;
  earliestFeasibleRetirementMonth?: Amount; feasibleRetirementCandidate?: Amount; retirementSearchStatus?: string;
  maximumFeasibleMonthlyExpenseToday?: Amount; expenseSearchStatus?: string; endMonth?: string; evaluations?: number; issues: string[] };
export type EssentialCoverage = { basis: string; essentialShortfall: Amount; firstEssentialShortfallMonth: Amount;
  rows: Array<{ month: string; essentialExpense: Amount; essentialShortfall: Amount; otherShortfall: Amount }> };
export type ReadWarning = { code: string; message: string; endMonth: string; expectedEndMonth: string; goalRevision: number };
export type RiskPlan = { kind: "PREVIEW"; preview: RetirementPreviewInput } | { kind: "SAVED_VERSION"; planId: string; versionId: string };
export type Source = { id: string; title: string; url: string; license: string; retrievedOn: string; usage: string; evidence: string };
export type SimulationResult = { status: string; issues?: string[]; modelCode?: string; paths?: number; seed?: number; blockMonths?: number;
  cvarAlpha?: string; display?: { pEssentialPercent: number; wilsonLowerPercent: number; wilsonUpperPercent: number; cvarVnd: string };
  bands?: Array<{ month: string; p10: string; p50: string; p90: string }>;
  disclosure?: { period: { from: string; to: string }; sources: Source[]; historyMonths: number; limitations: string[]; bandBasis: string; moneyRounding: string; probabilityRounding: string } };
export type ScenarioResult = { kind?: string; extraYears?: number; status: string; issues?: string[]; endMonth?: string; parameters?: Record<string, unknown>; assumptions?: string[];
  result?: { essentialLossToday: string; funded: boolean; balances: string[]; unfundedWithdrawals: string; fundedTerminalBalance: string } };
export type RiskResult = SimulationResult & { marketVersionId?: string; marketVersion?: number; marketHash?: string; inputHash?: string; policyHash?: string;
  scenarios?: ScenarioResult[]; longevity?: { status: string; results: ScenarioResult[] }; sources?: Array<{ id: string; title?: string; name?: string; url?: string }>;
  selectedId?: string | null; threshold?: string; rule?: string; candidates?: Array<SimulationResult & { id: string; changePoints: string; targets: Allocation[][] }>;
  rejected?: Array<{ id: string; issues: string[] }>; adjustmentOptions?: AdjustmentOptions; limitations?: string[] };
export const analyzeRisk = (mode: "simulation" | "scenarios" | "selection", plan: RiskPlan, paths: number, marketVersionId?: string, signal?: AbortSignal) =>
  authenticatedRequest<RiskResult>(`/me/retirement/risk/${mode}`, { plan, paths, ...(marketVersionId ? { marketVersionId } : {}) }, "POST", undefined, { signal });
export type RebalanceInput = { policyVersionId: string; templateId: string; month: string; retirementMonth: string;
  holdings: Array<{ assetClass: string; value: string; maturedAmount: string }>; newContribution: string };
export type RebalanceResult = { status: string; issues?: string[]; persisted?: false; oldWeights?: Allocation[]; targetWeights?: Allocation[]; newWeights?: Allocation[];
  reason?: string; bandPoints?: string; costPercent?: string; cost?: string; netValue?: string; unallocatedNewContribution?: string; assumptions?: string[];
  trades?: Array<{ assetClass: string; oldValue: string; maturedAmount: string; cashAllocated: string; buy: string; sell: string; newValue: string }> };
export const proposeRebalance = (input: RebalanceInput) => authenticatedRequest<RebalanceResult>("/me/retirement/risk/rebalance", input, "POST");
export type MarketDocument = { schemaVersion: 1; title: string; reason: string; effectiveFrom: string; currency: "VND"; unit: "DECIMAL_MONTHLY_TOTAL_RETURN";
  priceBasis: "NOMINAL"; cpiMeasure: "MONTH_ON_MONTH_CHANGE"; period: { from: string; to: string }; sources: Source[];
  assets: Array<{ assetClass: string; sourceId: string; totalReturnEvidence: string; fees: { treatment: "NET" | "GROSS"; evidence: string; monthlyDrag?: string }; taxTreatment: string }>;
  cpiSourceId: string; quality: { missingValues: "REJECT"; imputation: "NONE"; reviewNote: string }; rows: Array<{ month: string; returns: Record<string, string>; cpi: string }> };
export type MarketDetail = { id: string; version: number; revision: number; status: "DRAFT" | "APPROVED" | "PUBLISHED"; data: MarketDocument; documentHash: string;
  approval: { actor: string; approvedAt: string; documentHash: string; reviewNote: string } | null; effectiveAt: string | null };
export const marketApi = {
  list: (page = 1) => authenticatedRequest<{ items: Array<Pick<MarketDetail, "id" | "version" | "revision" | "status"> & { title: string; period: MarketDocument["period"] }>; total: number }>(`/admin/market-data?page=${page}&limit=20`, undefined, "GET", undefined, { skipCache: true }),
  get: (id: string) => authenticatedRequest<MarketDetail>(`/admin/market-data/${id}`, undefined, "GET", undefined, { skipCache: true }),
  create: (data: MarketDocument) => authenticatedRequest<MarketDetail>("/admin/market-data", data, "POST"),
  patch: (id: string, expectedRevision: number, data: MarketDocument) => authenticatedRequest<MarketDetail>(`/admin/market-data/${id}`, { expectedRevision, data }, "PATCH"),
  validate: (id: string) => authenticatedRequest<{ status: string; issues: Array<{ path: string; message: string }> }>(`/admin/market-data/${id}/validate`, {}, "POST"),
  approve: (id: string, expectedRevision: number, reviewNote: string) => authenticatedRequest<MarketDetail>(`/admin/market-data/${id}/approve`, { expectedRevision, confirm: true, reviewNote }, "POST"),
  publish: (id: string, expectedRevision: number) => authenticatedRequest<MarketDetail>(`/admin/market-data/${id}/publish`, { expectedRevision, confirm: true }, "POST"),
};
