import { authenticatedRequest } from "./api";
import type { RetirementPreviewInput, RetirementIssue } from "./retirement";
export type Amount = string | null;
export type Allocation = { assetClass: string; weightPercent: string };
export type CapitalSeparation = {
  status: string; informationalOnly: true; currency: string; valuationMonth: string; assumptionBasis: string;
  essentialMonthlyExpense: Amount; reserveMonths: number | null; reserveMonthsBasis?: "CUSTOMER" | "INCOME_STABILITY" | "DEFAULT"; requiredEmergencyReserve: Amount;
  declaredEmergencyReserve: Amount; emergencyShortfall: Amount; retirementLiquidAssets: Amount;
  nearTermGoalsPresentValue: Amount; growthCapital: Amount; investableLiquidAssets: Amount; declaredOtherGoalsCapital: Amount;
  goals: Array<{ id: string; label: string; dueMonth: string; monthsUntilDue: number; treatment: string; futureAmount: Amount; presentValue: Amount; inflationBasis: string; inflationSourceIds: string[]; depositSourceIds: string[] }>;
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
export type SimulationProgress = { pathsCompleted: number; pathsRequested: number };
export type SimulationResult = {thresholdUndecided?:boolean;pEssential?:number;pAll?:number|null;allGoalsStatus?:string;allGoalsIssue?:string|null; status: string; issues?: string[]; modelCode?: string; paths?: number; seed?: number; blockMonths?: number;
  cvarAlpha?: string; display?: { pEssentialPercent: number; wilsonLowerPercent: number; wilsonUpperPercent: number; cvarVnd: string };
  bands?: Array<{ month: string; p10: string; p50: string; p90: string }>;
  disclosure?: { period: { from: string; to: string }; sources: Source[]; historyMonths: number; limitations: string[]; bandBasis: string; moneyRounding: string; probabilityRounding: string } };
export type ScenarioOutcome = { essentialLossToday: string; funded: boolean; balances?: string[]; unfundedWithdrawals: string; fundedTerminalBalance: string; firstShortfallMonth?: string | null;
  lossFirstTerminalBalance?: string; gainFirstTerminalBalance?: string; balanceDifference?: string };
export type ScenarioResult = { kind?: string; extraYears?: number; level?: string; severity?: string; windowAdjusted?: boolean; firstShortfallMonth?: string | null; status: string; issues?: string[]; endMonth?: string;
  parameters?: Record<string, unknown>; assumptions?: string[]; offsets?: Array<{ offsetMonths: number; status: string; firstShortfallMonth?: string | null; issues?: string[]; result?: ScenarioOutcome }>;
  result?: ScenarioOutcome };
export type RiskResult = SimulationResult & { progress?: SimulationProgress; pathMilestones?: number[]; preliminary?: boolean; marketVersionId?: string; marketVersion?: number; marketHash?: string; inputHash?: string; policyHash?: string;
  scenarios?: ScenarioResult[]; longevity?: { status: string; results: ScenarioResult[] }; sources?: Array<{ id: string; title?: string; name?: string; url?: string }>;
  optimization?: { status: string; method?: string; feasible?: boolean; issues?: string[] }; explanation?: Array<{ code: string; parameters?: Record<string, unknown>; text: string }>;
  shortfallAmount?: string | null; adjustmentsOmitted?: boolean; adjustmentKinds?: string[] | null;
  turnoverBasis?:"CURRENT_HOLDINGS"|"TEMPLATE_FALLBACK";referenceId?:string|null;allThreshold?:string|null;referenceKind?:ReferenceKind|null;lossFeasibility?:LossFeasibility|null;deterministic?:DeterministicSelection;selectedId?: string | null; threshold?: string; rule?: string; candidates?: Array<SimulationResult & { id: string; changePoints: string; turnoverFromCurrentPoints?: string | null; targets: Allocation[][];loss?:LossConstraint;selection?:{templateId:string;customAllocation?:import("./portfolios").CustomAllocation}|null;withinLossLimit?:boolean;applicable?:boolean;applyIssues?:string[] }>;
  rejected?: Array<{ id: string; issues: string[] }>; adjustmentOptions?: AdjustmentOptions; limitations?: string[] };
/** QUALIFIED: meets the essential threshold. LOSS_REDUCED_WITHIN_LIMIT: the template with stock moved to deposits to fit the
 * declared loss limit. LEAST_LOSS_OVER_LIMIT: nothing fits; shown for reference only. TEMPLATE_UNSIMULATED: no published market data. */
export type ReferenceKind = "QUALIFIED" | "BEST_WITHIN_LOSS_LIMIT" | "LOSS_REDUCED_WITHIN_LIMIT" | "LEAST_LOSS_OVER_LIMIT" | "TEMPLATE_UNSIMULATED";
export type LossFeasibility = { minimumLossAmount: string; allowedLossAmount: string; requiredToleranceAmountVnd: string; requiredTolerancePercentOfGrowth: string };
export type PinnedCandidate = { id: string; changePoints: string; targets: Allocation[][]; loss: LossConstraint; withinLossLimit: boolean; essentialLossToday: string; funded: boolean; fundedTerminalBalance: string };
export type DeterministicSelection = { basis: "PINNED_DETERMINISTIC_ASSUMPTIONS"; referenceId: string | null; referenceKind: ReferenceKind | null; candidates: PinnedCandidate[];
  rejected: Array<{ id: string; issues: string[] }>; lossFeasibility: LossFeasibility | null; applicable: false; applyIssues: string[]; limitations: string[] };
export const analyzeRisk = (mode: "simulation" | "scenarios" | "selection", plan: RiskPlan, paths: number, marketVersionId?: string, signal?: AbortSignal, trialAllocation?: import("./portfolios").CustomAllocation, detail?:"ALLOCATION_V2", timeoutMs = 45000, continuation?: boolean, essentialThreshold?: string) =>
  authenticatedRequest<RiskResult>(`/me/retirement/risk/${mode}`, { plan, paths, ...(marketVersionId ? { marketVersionId } : {}),...(trialAllocation?{trialAllocation}:{}),...(detail?{detail}:{}),...(continuation?{continuation:true}:{}),...(essentialThreshold?{essentialThreshold}:{}) }, "POST", undefined, { signal, timeoutMs });
/** Spec §7.4 step 4: behavioural adjustments searched on the simulation (same seed, paths and allocation as the selection). */
export type AdjustmentLever = { status: "FOUND" | "NOT_FEASIBLE" | "NOT_APPLICABLE" | "REVIEW_REQUIRED"; issues: string[]; evaluations: number; pEssential: number | null };
export type SimulatedAdjustments = { progress?: SimulationProgress; status: "READY" | "NOT_FEASIBLE" | "REVIEW_REQUIRED" | "NOT_NEEDED" | string; issues?: string[];
  threshold?: string; paths?: number; baselinePEssential?: number; evaluations?: number;
  contribution?: AdjustmentLever & { requiredMonthlyContribution: Amount; additionalMonthlyContribution: Amount; withinCapacityEveryMonth: boolean | null };
  retirement?: AdjustmentLever & { retirementMonth: Amount; delayMonths: number | null };
  optionalSpending?: AdjustmentLever & { cutPercent: number | null; keepPercent: number | null; monthlyOptionalToday: Amount; monthlyCutToday: Amount }; deferFlexibleGoals?: AdjustmentLever & { deferMonths: number | null; deferredGoalIds: string[]; shiftedGoals: Array<{ id: string; fromMonth: string; toMonth: string }> };
  steps?: { contributionVnd: string; retirementMonths: number; optionalCutPercent: number; goalDeferMonths?: number }; limitations?: string[] };
/** Runs up to 60 s on the server (its own budget), so the browser waits longer than for a selection. */
export const analyzeAdjustments = (plan: RiskPlan, paths: number, signal?: AbortSignal, continuation?: boolean, essentialThreshold?: string) =>
  authenticatedRequest<SimulatedAdjustments>("/me/retirement/risk/adjustments", { plan, paths, detail: "ALLOCATION_V2", ...(continuation ? { continuation: true } : {}), ...(essentialThreshold ? { essentialThreshold } : {}) }, "POST", undefined, { signal, timeoutMs: 90000 });
export type RebalanceInput = { policyVersionId: string; templateId: string; month: string; retirementMonth: string;
  holdings: Array<{ assetClass: string; value: string; maturedAmount: string }>; newContribution: string; record?: boolean; compareProbabilities?: boolean; planId?: string; planVersionId?: string };
export type RebalanceDecision = { id: string; createdAt: string; decision: "PROPOSED" | "ACCEPTED" | "DISMISSED"; note: string | null; costEstimate: string; trigger: string; probabilityBefore: number | null; probabilityAfter: number | null };
export type RebalanceResult = { status: string; issues?: string[]; persisted?: boolean; decisionId?: string; decision?: RebalanceDecision["decision"]; oldWeights?: Allocation[]; targetWeights?: Allocation[]; newWeights?: Allocation[];
  probabilityComparison?: { status: string; paths?: number; before?: number | null; after?: number | null; issues?: string[] };
  reason?: string; trigger?: "BELOW_BAND" | "AT_OR_ABOVE_BAND" | "SPENDING_FLOOR_BREACHED"; bandPoints?: string; costPercent?: string; cost?: string; netValue?: string; unallocatedNewContribution?: string; assumptions?: string[];
  trades?: Array<{ assetClass: string; oldValue: string; maturedAmount: string; cashAllocated: string; buy: string; sell: string; newValue: string }> };
export const proposeRebalance = (input: RebalanceInput) => authenticatedRequest<RebalanceResult>("/me/retirement/risk/rebalance", input, "POST");
export const rebalanceHistory = (signal?: AbortSignal) => authenticatedRequest<{items:RebalanceDecision[]}>("/me/retirement/risk/rebalance/history", undefined, "GET", undefined, {skipCache:true,signal});
export const decideRebalance = (id: string, decision: "ACCEPTED" | "DISMISSED", note?: string) => authenticatedRequest<RebalanceDecision>(`/me/retirement/risk/rebalance/${id}/decision`, {decision,...(note!==undefined?{note}:{})}, "POST");
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
