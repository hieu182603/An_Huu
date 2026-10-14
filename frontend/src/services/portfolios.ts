import { authenticatedRequest } from "./api";

export interface PortfolioChoice {
  id: string;
  label: string;
  score: number;
}

export interface PortfolioQuestion {
  id: string;
  dimension: "OBJECTIVE" | "HORIZON" | "LIQUIDITY" | "LOSS_TOLERANCE" | "EXPERIENCE" | "FINANCIAL_CAPACITY";
  prompt: string;
  choices: PortfolioChoice[];
}

export interface RiskBand {
  id: string;
  label: string;
  minScore: number;
  maxScore: number;
}

export interface TemplateAllocation {
  assetClass: string;
  weightPercent: string;
}

export interface TemplateSchedulePeriod {
  fromIndex: number;
  toIndex: number;
  allocations: TemplateAllocation[];
}

export interface PortfolioTemplate {
  id: string;
  label: string;
  coverageMonths: number;
  rebalance: {
    everyMonths: 1 | 3 | 6 | 12;
    timing: "START_OF_MONTH";
    turnoverCostPercent: string;
    costConvention: "HALF_L1_TURNOVER_TIMES_COST";
    evidence: string;
  };
  schedule: TemplateSchedulePeriod[];
}

export interface PortfolioRule {
  id: string;
  templateId: string;
  riskBandIds: string[];
  explanation: string;
  horizon: { min: number; max: number };
  liquidityNeed: { min: number; max: number };
  dimensions: Record<string, { min: number; max: number }>;
}

export interface PortfolioPolicyDocument {
  schemaVersion: 1;
  title: string;
  reason: string;
  effectiveFrom: string;
  assumptionVersionId: string;
  source: {
    title: string;
    url: string;
    release: string;
    reviewedOn: string;
  };
  questions: PortfolioQuestion[];
  riskBands: RiskBand[];
  templates: PortfolioTemplate[];
  rules: PortfolioRule[];
  scenarios: Array<{
    kind: "BASE" | "ADVERSE" | "FAVORABLE";
    label: string;
    evidence: string;
    convention: "DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES";
    years: Array<{
      year: number;
      inflationDeltaPoints: string;
      returns: Array<{ assetClass: string; deltaPoints: string }>;
    }>;
  }>;
}

export interface PortfolioPolicySummary {
  id: string;
  version: number;
  revision: number;
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
  title: string;
  effectiveAt: string | null;
}

export interface PortfolioPolicyListResponse {
  status: "UNCONFIGURED" | "AVAILABLE";
  total: number;
  page: number;
  limit: number;
  items: PortfolioPolicySummary[];
}

export interface PortfolioPolicyDetail {
  id: string;
  version: number;
  revision: number;
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
  data: PortfolioPolicyDocument;
  documentHash: string;
  createdBy: string;
  publishedBy: string | null;
  createdAt: string;
  effectiveAt: string | null;
}

export interface PortfolioAnswerItem {
  questionId: string;
  choiceId: string;
}

export interface PortfolioPreviewCommand {
  policyVersionId: string;
  startMonth: string;
  horizonMonths: number;
  liquidityNeedMonths: number;
  templateId?: string;
  answers: PortfolioAnswerItem[];
}

export interface PortfolioAssessmentResult {
  status: "MATCHED" | "INCOMPLETE";
  totalScore: number | null;
  dimensionScores: Record<string, number | null>;
  riskBandId: string | null;
  selectedTemplateId: string | null;
  eligibleTemplateIds: string[];
  answers: Array<{ questionId: string; dimension: string; choiceId: string; label: string; score: number }>;
  checks: Array<{ ruleId: string; templateId: string; matched: boolean; failed: string[]; explanation: string }>;
}

export interface PortfolioScenarioRow {
  month: string;
  unitValue: string;
  monthlyReturnPercent: string;
  monthlyInflationPercent: string;
  turnoverFeePercent: string;
  holdings: Array<{ assetClass: string; weightPercent: string; value: string }>;
}

export interface PortfolioScenarioResult {
  kind: "BASE" | "ADVERSE" | "FAVORABLE";
  label: string;
  rows: PortfolioScenarioRow[];
  finalUnitValue: string;
  annualizedReturnPercent: string;
}

export interface PortfolioPreviewResult {
  policyVersionId: string;
  policyVersion: number;
  policyHash: string;
  assumptionVersionId: string;
  assumptionHash: string;
  answerBasis: string;
  status: "MATCHED" | "INCOMPLETE";
  assessment: PortfolioAssessmentResult;
  limitations: string[];
  priceBasis: string;
  timing: string;
  scenarios: PortfolioScenarioResult[];
  issues?: Array<{ path: string; code: string }>;
}

const policyDetailCache = new Map<string, { data: PortfolioPolicyDetail; expiresAt: number }>();

// User endpoints
export async function fetchUserPortfolioPolicies(page = 1, limit = 10): Promise<PortfolioPolicyListResponse> {
  return authenticatedRequest<PortfolioPolicyListResponse>(`/me/portfolio-policies?page=${page}&limit=${limit}`, undefined, "GET", undefined, { ttlMs: 120000 });
}

export async function fetchUserPortfolioPolicyDetail(id: string): Promise<PortfolioPolicyDetail> {
  const cached = policyDetailCache.get(id);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  const res = await authenticatedRequest<PortfolioPolicyDetail>(`/me/portfolio-policies/${id}`, undefined, "GET", undefined, { ttlMs: 120000 });
  policyDetailCache.set(id, { data: res, expiresAt: Date.now() + 120000 });
  return res;
}

export async function previewUserPortfolio(command: PortfolioPreviewCommand): Promise<PortfolioPreviewResult> {
  return authenticatedRequest<PortfolioPreviewResult>("/me/portfolio-policies/preview", command, "POST");
}

// Admin endpoints
export async function fetchAdminPortfolioPolicies(page = 1, limit = 20): Promise<PortfolioPolicyListResponse> {
  return authenticatedRequest<PortfolioPolicyListResponse>(`/admin/portfolio-policies?page=${page}&limit=${limit}`);
}

export async function fetchAdminPortfolioPolicyDetail(id: string): Promise<PortfolioPolicyDetail> {
  return authenticatedRequest<PortfolioPolicyDetail>(`/admin/portfolio-policies/${id}`);
}

export async function createAdminPortfolioPolicy(data: PortfolioPolicyDocument): Promise<PortfolioPolicyDetail> {
  return authenticatedRequest<PortfolioPolicyDetail>("/admin/portfolio-policies", data, "POST");
}

export async function updateAdminPortfolioPolicy(id: string, expectedRevision: number, data: PortfolioPolicyDocument): Promise<PortfolioPolicyDetail> {
  return authenticatedRequest<PortfolioPolicyDetail>(`/admin/portfolio-policies/${id}`, { expectedRevision, data }, "PATCH");
}

export async function validateAdminPortfolioPolicy(id: string): Promise<{ status: "VALID" | "INCOMPLETE"; issues: any[] }> {
  return authenticatedRequest<{ status: "VALID" | "INCOMPLETE"; issues: any[] }>(`/admin/portfolio-policies/${id}/validate`, {}, "POST");
}

export async function approveAdminPortfolioPolicy(id: string, expectedRevision: number, reviewNote: string): Promise<PortfolioPolicyDetail> {
  return authenticatedRequest<PortfolioPolicyDetail>(`/admin/portfolio-policies/${id}/approve`, { expectedRevision, reviewNote, confirm: true }, "POST");
}

export async function publishAdminPortfolioPolicy(id: string, expectedRevision: number): Promise<PortfolioPolicyDetail> {
  return authenticatedRequest<PortfolioPolicyDetail>(`/admin/portfolio-policies/${id}/publish`, { expectedRevision, confirm: true }, "POST");
}
