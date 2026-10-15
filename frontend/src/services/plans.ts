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
  readWarnings?: import("./planningAnalysis").ReadWarning[];
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
  readWarnings?: import("./planningAnalysis").ReadWarning[];
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
  readWarnings?: import("./planningAnalysis").ReadWarning[];
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
  readWarnings?: import("./planningAnalysis").ReadWarning[];
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

export async function exportPlanVersionCsv(
  planId: string,
  versionId: string,
  format: "technical" | "readable-vi" = "readable-vi"
): Promise<string> {
  const query = format ? `?format=${encodeURIComponent(format)}` : "";
  const { blob, filename } = await authenticatedBlobRequest(
    `/me/retirement/plans/${planId}/versions/${versionId}/export.csv${query}`
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

export interface LoanEvidence {
  reference: string;
  contentHash: string;
  confirmedOn: string;
}

export interface LoanComponents {
  principal: string;
  interest: string;
  prepaymentFee: string;
  otherFee: string;
}

export interface LoanAllocation {
  allocationId: string;
  eventId: string;
  actualRevision: number;
  bookedOn: string;
  scope: "FULL_CONTRACT" | "USER_SHARE";
  components: LoanComponents;
  contractComponents: LoanComponents;
  paymentStatus: "CURRENT" | "OVERDUE" | "MIXED";
  allocationBasis: "BANK_STATEMENT" | "AGREEMENT_COMPONENTS";
  evidence: LoanEvidence[];
}

export interface LoanBalanceChange {
  changeId: string;
  bookedOn: string;
  amount: string;
  kind: "CONFIRMED_PRINCIPAL_ADVANCE";
  evidence: LoanEvidence[];
}

export interface LoanResponsibilityAmendment {
  effectiveOn: string;
  openingUserPaid: string;
  confirm: true;
  evidence: LoanEvidence[];
}

export interface LoanOriginalTerms {
  signedOn: string;
  amendedOn: string | null;
  effectiveOn: string;
  balanceScope: "FULL_CONTRACT" | "USER_SHARE";
  paymentShare: string;
  responsibility:
    | { kind: "ALLOCATED_SHARE" }
    | { kind: "CAPPED"; capBasis: "TOTAL_USER_PAYMENTS"; limit: string; previouslyPaid: string; evidence: LoanEvidence[] };
  evidence: LoanEvidence[];
  confirm: true;
}

export interface LoanScopeChange {
  openingPrincipal: string;
  evidence: LoanEvidence[];
  confirm: true;
}

export interface LoanContractPeriod {
  accrualFrom: string;
  dueDate: string;
  rate: {
    kind: "FIXED_ANNUAL" | "FLOATING_ANNUAL" | "SIMPLE_ANNUAL_DAILY";
    annualRate: string;
    days?: number;
    marginRate?: string;
    indexRate?: string;
  };
  fee: string;
  carriedInterest: string;
  gracePrincipal: boolean;
  bankPayment: { principal: string; interest: string } | null;
}

export interface LoanContractV2 {
  contractVersion: 2;
  currency: "VND";
  signedOn: string;
  amendedOn: string | null;
  effectiveOn: string;
  knownOn: string;
  confirmation: "HYPOTHETICAL" | "BANK_CONFIRMED";
  evidence: LoanEvidence[];
  balanceAsOf: string;
  principalBalance: string;
  balanceScope: "FULL_CONTRACT" | "USER_SHARE";
  balanceNature?: "CONFIRMED_BALANCE" | "PROJECTED_DISBURSEMENT";
  paymentShare: string;
  userPaidToDate?: string;
  responsibility:
    | { kind: "ALLOCATED_SHARE" }
    | { kind: "CAPPED"; capBasis: "TOTAL_USER_PAYMENTS"; limit: string; previouslyPaid: string; evidence: LoanEvidence[] };
  interestBasis: "REDUCING_BALANCE";
  rounding: "EXACT" | "CENT_HALF_UP";
  mode: "REDUCE_PAYMENT_KEEP_TERM" | "REDUCE_TERM_KEEP_PAYMENT" | "BANK_SCHEDULE" | "RESTRUCTURED";
  fixedPayment: string | null;
  finalPayment: "ADJUST_FINAL_PAYMENT" | "BALLOON_CONFIRMED" | "NO_BALLOON";
  maturityDate: string;
  periods: LoanContractPeriod[];
}

export interface LoanLegacyOpening {
  signedOn: string;
  amendedOn: string | null;
  effectiveOn: string;
  knownOn: string;
  previouslyPaid: string;
  capBasis?: "TOTAL_USER_PAYMENTS";
  evidence: LoanEvidence[];
}

export interface LoanSourceRevisionCommand {
  commandId: string;
  sourceId: string;
  operation: "REVISE" | "END";
  expectedSourceRevision: number;
  expectedSourceHash: string;
  expectedContractHash: string;
  refinanceCommandId?: string;
  confirm: true;
  contract: LoanContractV2;
  legacyOpening?: LoanLegacyOpening;
  responsibilityAmendment?: LoanResponsibilityAmendment;
  allocations: LoanAllocation[];
  principalAdvances: LoanBalanceChange[];
}

export interface LoanCreation {
  commandId: string;
  sourceId: string;
  operation: "CREATE";
  expectedSourceRevision: 0;
  confirm: true;
  refinanceCommandId?: string;
  agreementReference: string;
  contract: LoanContractV2;
  funding:
    | { kind: "EXISTING_BALANCE"; notAlreadyInSources: true; evidence: LoanEvidence[] }
    | {
        kind: "DISBURSED_BALANCE";
        notAlreadyInSources: true;
        disbursedOn: string;
        grossPrincipal: string;
        openingUserPaid: string;
        evidence: LoanEvidence[];
        allocations: LoanAllocation[];
        principalAdvances: LoanBalanceChange[];
        originalTerms?: LoanOriginalTerms;
        scopeChange?: LoanScopeChange;
        responsibilityAmendment?: LoanResponsibilityAmendment;
      }
    | {
        kind: "PLANNED_DISBURSEMENT";
        grossPrincipal: string;
        withheldFees: string;
        netDisbursement: string;
        destination: "EXTERNAL_ACCOUNT";
        evidence: LoanEvidence[];
      };
}

export interface RefinanceProceedsUse {
  useId: string;
  bookedOn: string;
  amount: string;
  description: string;
  evidence: LoanEvidence[];
}

export interface RefinanceProceedsAtSettlement {
  availableAmount: string;
  confirm: true;
  usesBeforeSettlement: RefinanceProceedsUse[];
  evidence: LoanEvidence[];
}

export interface RefinanceCommand {
  commandId: string;
  closingCommandId: string;
  newLoanCommandId: string;
  settledOn: string;
  fundingScope: "FULL_CONTRACT" | "USER_SHARE";
  grossDisbursement: string;
  withheldFees: string;
  externalTopUp: string;
  unusedProceeds: string;
  confirm: true;
  evidence: LoanEvidence[];
  proceedsAtSettlement?: RefinanceProceedsAtSettlement;
}

export interface PlannedRefinancePayoffQuote {
  principal: string;
  interest: string;
  carriedInterest: string;
  prepaymentFee: string;
  otherFee: string;
  allRemainingChargesIncluded: true;
  valueKind: "HYPOTHETICAL_QUOTE";
  evidence: LoanEvidence[];
}

export interface PlannedRefinanceFunding {
  scope: "FULL_CONTRACT" | "USER_SHARE";
  externalTopUp: string;
  userTopUp: string;
  userFinancedAmount: string;
  unusedProceeds: string;
  unusedProceedsNotContributed: true;
  evidence: LoanEvidence[];
}

export interface PlannedRefinanceTerms {
  replacement: LoanCreation;
  settledOn: string;
  sameDayOrder: "BEFORE_SCHEDULED_PAYMENT" | "AFTER_SCHEDULED_PAYMENT";
  payoffQuote: PlannedRefinancePayoffQuote;
  funding: PlannedRefinanceFunding;
}

export interface PlannedPairTarget {
  sourceId: string;
  revision: number;
  sourceHash: string | null;
}

export type PlannedPairCommand =
  | {
      operation: "CREATE";
      commandId: string;
      replacementCommandId: string;
      pairId: string;
      oldSource: PlannedPairTarget;
      newSource: PlannedPairTarget;
      expectedContractHash: string;
      expectedPairHash: null;
      confirm: true;
      terms: PlannedRefinanceTerms;
    }
  | {
      operation: "REVISE";
      commandId: string;
      replacementCommandId: string;
      pairId: string;
      oldSource: PlannedPairTarget;
      newSource: PlannedPairTarget;
      expectedContractHash: string;
      expectedPairHash: string;
      confirm: true;
      terms: PlannedRefinanceTerms;
    }
  | {
      operation: "CANCEL";
      commandId: string;
      replacementCommandId: string;
      pairId: string;
      oldSource: PlannedPairTarget;
      newSource: PlannedPairTarget;
      expectedContractHash: string;
      expectedPairHash: string;
      reason: string;
      confirm: true;
    };

export interface AssetEvidence {
  reference: string;
  contentHash: string;
  confirmedOn: string;
}

export interface AssetAllocation {
  allocationId: string;
  eventId: string;
  actualRevision: number;
  bookedOn: string;
  amount: string;
}

export interface AssetRentalExit {
  rentEndsOn: string;
  finalMonthIncome: string;
  amountScope: "SOURCE_SHARE";
  confirm: true;
}

export interface AssetMissedContribution {
  scheduledMonth: string;
  actualRevision: number;
  amountNotContributed: string;
  confirmedOn: string;
  reason: string;
  confirmNotContributed: true;
}

export interface AssetAvailabilityRelease {
  releaseId: string;
  availableOn: string;
  amount: string;
  status: "CONFIRMED" | "EXPECTED";
  evidence: AssetEvidence[];
}

export interface AssetCapitalAvailability {
  amountScope: "NET_SOURCE_SHARE";
  releases: AssetAvailabilityRelease[];
}

export interface AssetPlannedContribution {
  installmentId: string;
  month: string;
  amount: string;
  timing: "END_OF_MONTH";
}

export interface AssetInstallmentReconciliation {
  scheduledMonth: string;
  actualRevision: number;
  receivedAllocationIds: string[];
  amountNotContributed: string;
  confirmedOn: string;
  reason: string;
  confirm: true;
}

export type AssetCapitalFunding =
  | {
      status: "PLANNED";
      liquidity: "AVAILABLE" | "PLANNED_RELEASE";
      notIncludedInFund: true;
      contributionMonth: string;
      contributionTiming: "END_OF_MONTH";
    }
  | {
      status: "REALIZED";
      allocations: AssetAllocation[];
    }
  | {
      status: "STAGED";
      liquidity: "AVAILABLE" | "PLANNED_RELEASE";
      plannedNotIncludedInFund: true;
      availability?: AssetCapitalAvailability;
      allocations: AssetAllocation[];
      plannedContributions: AssetPlannedContribution[];
      reconciliations: AssetInstallmentReconciliation[];
    };

export interface AssetCapital {
  reference: string;
  kind: "ASSET_SALE" | "LIQUID_CAPITAL";
  currency: "VND";
  priceBasis: "NOMINAL_AT_AVAILABILITY";
  amountScope: "WHOLE_ASSET" | "USER_SHARE";
  ownershipShare: string;
  retirementShare: string;
  grossAmount: string;
  fees: string;
  taxes: string;
  securedDebtSettlement: string;
  netAmount: string;
  availableOn: string;
  confirmedContributionAmount: string;
  funding: AssetCapitalFunding;
}

export type AssetSourceCommand =
  | {
      commandId: string;
      sourceId: string;
      operation: "CREATE";
      expectedSourceRevision: 0;
      expectedSourceHash: null;
      notAlreadyInSources: true;
      confirm: true;
      evidence: AssetEvidence[];
      capital: AssetCapital;
    }
  | {
      commandId: string;
      sourceId: string;
      operation: "REVISE";
      expectedSourceRevision: number;
      expectedSourceHash: string;
      confirm: true;
      evidence: AssetEvidence[];
      capital: AssetCapital;
      rentalExit?: AssetRentalExit;
      missedContribution?: AssetMissedContribution;
    }
  | {
      commandId: string;
      sourceId: string;
      operation: "END";
      expectedSourceRevision: number;
      expectedSourceHash: string;
      reason: string;
      confirm: true;
      evidence: AssetEvidence[];
    };

export interface SourceReforecastPreviewInput {
  versionId: string;
  expectedSnapshotHash: string;
  expectedRevision: number;
  expectedProfileRevision: number;
  throughMonth: string;
  sourceCommands?: FlowSourceCommand[];
  pensionSelections?: PensionSourceSelection[];
  loanRevisions?: LoanSourceRevisionCommand[];
  loanCreations?: LoanCreation[];
  refinances?: RefinanceCommand[];
  assetCommands?: AssetSourceCommand[];
  plannedRefinances?: PlannedPairCommand[];
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
    eligibleLoans: Array<{
      sourceId: string;
      sourceRevision: number;
      sourceHash: string;
      contractHash: string;
      balanceAsOf?: string;
      principalBalance?: string;
    }>;
    activePairs: Array<{
      pairId: string;
      pairHash: string;
      oldSource: { sourceId: string; revision: number; sourceHash: string };
      newSource: { sourceId: string; revision: number; sourceHash: string };
      contractHash: string;
      settledOn: string;
      reviseAllowed: boolean;
    }>;
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

export function generateContractPeriods(
  balanceAsOf: string,
  months: number,
  annualRatePercent: string = "0"
): LoanContractPeriod[] {
  let prev = balanceAsOf;
  const count = Math.max(1, Math.min(600, months));
  const rateVal = String(Number(annualRatePercent) || 0);
  const periods: LoanContractPeriod[] = [];
  const [startYear, startMonth] = balanceAsOf.slice(0, 7).split("-").map(Number);
  for (let i = 1; i <= count; i++) {
    const targetDate = new Date(Date.UTC(startYear, startMonth - 1 + i + 1, 0));
    const dueDate = targetDate.toISOString().slice(0, 10);
    const days = Math.max(1, Math.round((new Date(dueDate).getTime() - new Date(prev).getTime()) / 86400000));
    periods.push({
      accrualFrom: prev,
      dueDate,
      rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: rateVal, days, yearDays: 365 } as any,
      fee: "0",
      carriedInterest: "0",
      gracePrincipal: false,
      bankPayment: null,
    });
    prev = dueDate;
  }
  return periods;
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

