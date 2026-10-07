import { authenticatedRequest, authenticatedBlobRequest } from "./api.ts";
import type { RetirementPreviewInput, RetirementPreviewResult, RetirementSummary, RetirementRow } from "./retirement.ts";

export interface PlanHistoryItem {
  id: string;
  version: number;
  createdAt: string;
  profileRevision: number;
  snapshotHash: string;
  references: {
    profileHash: string;
    policyVersionId: string;
    policyVersion: number;
    policyHash: string;
    assumptionVersionId: string;
    assumptionVersion: number;
    assumptionHash: string;
  };
  summary: RetirementSummary;
}

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  createdAt: string;
  profileRevision: number;
  snapshotHash: string;
  preview: RetirementPreviewResult;
}

export interface RetirementPlan {
  id: string;
  userId: string;
  currentVersionId: string | null;
  baselineVersionId: string | null;
  revision: number;
  stale: boolean;
  createdAt: string;
}

export interface PlanUpdateInfo {
  id: string;
  version: number;
}

export interface PlanDetail {
  id: string;
  userId: string;
  currentVersionId: string | null;
  baselineVersionId: string | null;
  revision: number;
  stale: boolean;
  actualSourceChanged: boolean;
  createdAt: string;
  current: PlanVersion | null;
  profileChanged: boolean;
  updates: {
    assumptions: PlanUpdateInfo | null;
    policy: PlanUpdateInfo | null;
  };
  updatePolicy: string;
}

export interface CreatePlanInput {
  expectedRevision: number;
  expectedInputHash: string;
  preview: RetirementPreviewInput;
}

export interface ApplyPlanInput {
  versionId: string;
  expectedRevision: number;
  expectedProfileRevision: number;
  confirm: true;
}

export interface ReplayResult {
  id: string;
  planId: string;
  version: number;
  createdAt: string;
  profileRevision: number;
  snapshotHash: string;
  preview: RetirementPreviewResult;
  replay: {
    matched: boolean;
    modelVersion: string;
    summary: RetirementSummary;
    rows: RetirementRow[];
  };
}

export interface PlanGoal {
  retirementMonth: string;
  endMonth: string;
  monthlyExpenseToday: string;
  monthlyContribution: string;
  monthlyReserve: string;
  terminalBalance: string;
}

export interface PlanReport {
  planId: string;
  planRevision: number;
  currentVersionId: string | null;
  baselineVersionId: string | null;
  status: "AVAILABLE" | "NO_APPLIED_VERSION";
  valueKind: "FORECAST";
  version: PlanVersion | null;
  profileChanged: boolean;
  hypothetical: boolean;
  goal: PlanGoal | null;
}

export interface PlanComparisonDelta {
  projectedFundAtValuation: string | null;
  requiredFundAtValuation: string | null;
  fundingGapAtValuation: string | null;
  coveragePercentagePoints: string | null;
  requiredConstantMonthlyContribution: string | null;
  additionalMonthlyContribution: string | null;
  unfundedWithdrawals: string | null;
  terminalBalance: string | null;
}

export interface PlanComparisonResult {
  status: "COMPARABLE" | "NOT_COMPARABLE";
  reasons: string[];
  direction: "CANDIDATE_MINUS_BASELINE";
  basis: "VALUATION_DATE_EACH_VERSION_DISCOUNT_FACTORS";
  delta: PlanComparisonDelta | null;
  differences: {
    profile: boolean;
    policy: boolean;
    assumptions: boolean;
    retirementMonth: boolean;
    selectionFields: string[];
  };
  limitations: string[];
}

export interface ComparePlansResponse {
  baseline: PlanVersion;
  candidate: PlanVersion;
  comparison: PlanComparisonResult;
}

export interface SimulatePlanResponse {
  baseline: PlanVersion;
  candidate: RetirementPreviewResult;
  comparison: PlanComparisonResult;
  saved: false;
  applied: false;
}

export async function listRetirementPlans(page = 1, limit = 20): Promise<{
  page: number;
  limit: number;
  total: number;
  items: RetirementPlan[];
}> {
  return await authenticatedRequest<{
    page: number;
    limit: number;
    total: number;
    items: RetirementPlan[];
  }>(`/me/retirement/plans?page=${page}&limit=${limit}`);
}

export async function getPlanDetail(planId: string): Promise<PlanDetail> {
  return await authenticatedRequest<PlanDetail>(`/me/retirement/plans/${planId}`);
}

export async function listPlanVersions(planId: string, page = 1, limit = 20): Promise<{
  page: number;
  limit: number;
  total: number;
  items: PlanHistoryItem[];
}> {
  return await authenticatedRequest<{
    page: number;
    limit: number;
    total: number;
    items: PlanHistoryItem[];
  }>(`/me/retirement/plans/${planId}/versions?page=${page}&limit=${limit}`);
}

export async function getPlanVersionDetail(planId: string, versionId: string): Promise<PlanVersion> {
  return await authenticatedRequest<PlanVersion>(
    `/me/retirement/plans/${planId}/versions/${versionId}`
  );
}

export async function createRetirementPlan(
  input: CreatePlanInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<{
  planId: string;
  revision: number;
  currentVersionId: string | null;
  baselineVersionId: string | null;
  saved: PlanVersion;
}> {
  return await authenticatedRequest<{
    planId: string;
    revision: number;
    currentVersionId: string | null;
    baselineVersionId: string | null;
    saved: PlanVersion;
  }>(
    "/me/retirement/plans",
    input,
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}

export async function createPlanVersion(
  planId: string,
  input: CreatePlanInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<{
  planId: string;
  revision: number;
  currentVersionId: string | null;
  baselineVersionId: string | null;
  saved: PlanVersion;
}> {
  return await authenticatedRequest<{
    planId: string;
    revision: number;
    currentVersionId: string | null;
    baselineVersionId: string | null;
    saved: PlanVersion;
  }>(
    `/me/retirement/plans/${planId}/versions`,
    input,
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}

export async function applyPlanVersion(
  planId: string,
  input: ApplyPlanInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<{
  planId: string;
  revision: number;
  currentVersionId: string;
  baselineVersionId: string;
  alreadyCurrent: boolean;
}> {
  return await authenticatedRequest<{
    planId: string;
    revision: number;
    currentVersionId: string;
    baselineVersionId: string;
    alreadyCurrent: boolean;
  }>(
    `/me/retirement/plans/${planId}/apply`,
    input,
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}

export async function replayPlanVersion(planId: string, versionId: string): Promise<ReplayResult> {
  return await authenticatedRequest<ReplayResult>(
    `/me/retirement/plans/${planId}/versions/${versionId}/replay`,
    {},
    "POST"
  );
}

export async function getPlanReport(planId: string, versionId?: string): Promise<PlanReport> {
  const query = versionId ? `?versionId=${versionId}` : "";
  return await authenticatedRequest<PlanReport>(`/me/retirement/plans/${planId}/report${query}`);
}

export async function comparePlanVersions(
  planId: string,
  baselineVersionId: string,
  candidateVersionId: string
): Promise<ComparePlansResponse> {
  return await authenticatedRequest<ComparePlansResponse>(
    `/me/retirement/plans/${planId}/compare`,
    { baselineVersionId, candidateVersionId },
    "POST"
  );
}

export async function simulatePlanVersion(
  planId: string,
  versionId: string,
  previewInput: RetirementPreviewInput
): Promise<SimulatePlanResponse> {
  return await authenticatedRequest<SimulatePlanResponse>(
    `/me/retirement/plans/${planId}/versions/${versionId}/simulate`,
    { preview: previewInput },
    "POST"
  );
}

export async function exportPlanVersionCsv(planId: string, versionId: string): Promise<string> {
  const { blob, filename } = await authenticatedBlobRequest(
    `/me/retirement/plans/${planId}/versions/${versionId}/export.csv`
  );
  const downloadName = filename || `an-huu-plan-${planId}-v-${versionId}.csv`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  return downloadName;
}

export interface FlowSourceCommand {
  commandId: string;
  sourceId: string;
  expectedSourceRevision: number;
  effectiveFromMonth: string;
  effectiveToMonth: string;
  confirm: true;
  document: string;
  operation: "CREATE" | "REVISE" | "END";
  metric?: "income" | "livingExpense" | "additionalExpense" | "pension";
  frequency?: "ONCE" | "MONTHLY";
  amount?: string;
  currency?: "VND";
  confirmation?: "USER_CONFIRMED" | "HYPOTHETICAL";
}

export interface PensionSourceSelection {
  estimateId: string;
  expectedEstimateIntegrityHash: string;
  expectedRegistryHash: string;
  commandId: string;
  sourceId: string;
  operation: "CREATE" | "REVISE";
  expectedSourceRevision: number;
  effectiveFromMonth: string;
  effectiveToMonth: string;
  amountPolicy: "FIXED_NOMINAL";
  confirm: true;
}

export interface SourceReforecastPreviewInput {
  versionId: string;
  expectedSnapshotHash: string;
  expectedRevision: number;
  expectedProfileRevision: number;
  throughMonth: string;
  sourceCommands?: FlowSourceCommand[];
  pensionSelections?: PensionSourceSelection[];
  loanRevisions?: any[];
  loanCreations?: any[];
  refinances?: any[];
  assetCommands?: any[];
  plannedRefinances?: any[];
}

export interface SourceReforecastPreviewResponse {
  status: "READY" | "BLOCKED" | "HORIZON_COMPLETE";
  issues: any[];
  inputHash: string | null;
  candidate: any | null;
  loanRevisionOptions: Array<{
    sourceId: string;
    sourceRevision: number;
    sourceHash: string;
    contractHash: string;
    legacyOpeningRequired: boolean;
  }>;
  plannedRefinanceOptions: {
    eligibleLoans: any[];
    activePairs: any[];
  };
  assetRevisionOptions: Array<{
    sourceId: string;
    sourceRevision: number;
    sourceHash: string;
  }>;
  saved: false;
  applied: false;
}

export interface SaveSourceReforecastInput {
  preview: SourceReforecastPreviewInput;
  expectedInputHash: string;
  confirm: true;
}

export async function previewSourceReforecast(
  planId: string,
  input: SourceReforecastPreviewInput
): Promise<SourceReforecastPreviewResponse> {
  return await authenticatedRequest<SourceReforecastPreviewResponse>(
    `/me/retirement/plans/${planId}/source-reforecasts/preview`,
    input,
    "POST"
  );
}

export async function saveSourceReforecast(
  planId: string,
  input: SaveSourceReforecastInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<{
  planId: string;
  revision: number;
  currentVersionId: string | null;
  baselineVersionId: string | null;
  saved: PlanVersion;
}> {
  return await authenticatedRequest<{
    planId: string;
    revision: number;
    currentVersionId: string | null;
    baselineVersionId: string | null;
    saved: PlanVersion;
  }>(
    `/me/retirement/plans/${planId}/source-reforecasts`,
    input,
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}

