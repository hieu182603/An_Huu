import { authenticatedRequest } from "./api";

export interface AssumptionSummary {
  id: string;
  version: number;
  revision: number;
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
  title: string;
  effectiveAt: string | null;
  projectionStartYear: number;
  projectionEndYear: number;
}

export interface AssumptionsListResponse {
  status: "UNCONFIGURED" | "AVAILABLE";
  total: number;
  items: AssumptionSummary[];
  page: number;
  limit: number;
}

export interface AssumptionSource {
  id: string;
  kind: "HISTORICAL_OFFICIAL" | "FORECAST" | "AN_HUU_LONG_TERM" | "ASSET_RESEARCH";
  title: string;
  publisher: string;
  url: string;
  release: string;
  publishedOn: string;
  retrievedOn: string;
  fromYear: number;
  toYear: number;
  note: string;
}

export interface InflationYear {
  year: number;
  percent: string;
  sourceId: string;
  kind: "FORECAST" | "LONG_TERM";
  rateType: "EFFECTIVE_ANNUAL";
  priceBasis: "NOMINAL";
  conversionNote: string;
}

export interface AssetClassItem {
  code: string;
  label: string;
  horizons: Array<{ id: string; minMonths: number; maxMonths: number }>;
}

export interface ReturnYear {
  year: number;
  assetClass: string;
  horizonId: string;
  sourceId: string;
  rate: { type: "EFFECTIVE_ANNUAL"; percent: string } | { type: "NOMINAL_ANNUAL"; percent: string; compoundsPerYear: number };
  priceBasis: "NOMINAL" | "REAL";
  fees: { treatment: "INCLUDED" | "EXPLICIT_ANNUAL_DRAG" | "UNKNOWN"; evidence?: string; percent?: string };
  taxes: { treatment: "INCLUDED" | "EXPLICIT_ANNUAL_DRAG" | "UNKNOWN"; evidence?: string; percent?: string };
}

export interface AssumptionDocument {
  schemaVersion: 2;
  title: string;
  currency: "VND";
  effectiveFrom: string;
  projectionStartYear: number;
  projectionEndYear: number;
  sources: AssumptionSource[];
  historicalCpi: Array<{ year: number; percent: string; sourceId: string; measure: "ANNUAL_AVERAGE_CHANGE" | "END_YEAR_CHANGE" }>;
  inflation: InflationYear[];
  assetClasses: AssetClassItem[];
  returns: ReturnYear[];
  reason: string;
}

export interface AssumptionDetail {
  id: string;
  version: number;
  revision: number;
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
  data: AssumptionDocument;
  createdBy: string;
  createdAt: string;
  publishedBy: string | null;
  effectiveAt: string | null;
  approval: {
    actor: string;
    approvedAt: string;
    reviewNote: string;
    documentHash: string;
    baselineId: string | null;
  } | null;
  documentHash: string;
}

export async function fetchAdminAssumptions(page = 1, limit = 20): Promise<AssumptionsListResponse> {
  return authenticatedRequest<AssumptionsListResponse>(`/admin/assumptions?page=${page}&limit=${limit}`);
}

export async function fetchAdminAssumptionDetail(id: string): Promise<AssumptionDetail> {
  return authenticatedRequest<AssumptionDetail>(`/admin/assumptions/${id}`);
}

export async function createAdminAssumptionDraft(data: AssumptionDocument): Promise<AssumptionDetail> {
  return authenticatedRequest<AssumptionDetail>("/admin/assumptions", data, "POST");
}

export async function updateAdminAssumptionDraft(id: string, expectedRevision: number, data: AssumptionDocument): Promise<AssumptionDetail> {
  return authenticatedRequest<AssumptionDetail>(`/admin/assumptions/${id}`, { expectedRevision, data }, "PATCH");
}

export async function validateAdminAssumption(id: string): Promise<{ valid: boolean; issues?: string[] }> {
  return authenticatedRequest<{ valid: boolean; issues?: string[] }>(`/admin/assumptions/${id}/validate`, {}, "POST");
}

export async function previewAssumptionImpact(id: string, expectedRevision: number): Promise<{ impactToken: string; affectedProfilesCount?: number }> {
  return authenticatedRequest<{ impactToken: string; affectedProfilesCount?: number }>(`/admin/assumptions/${id}/impact`, { expectedRevision }, "POST");
}

export async function approveAssumption(id: string, expectedRevision: number, impactToken: string, reviewNote: string): Promise<AssumptionDetail> {
  return authenticatedRequest<AssumptionDetail>(`/admin/assumptions/${id}/approve`, { expectedRevision, impactToken, reviewNote }, "POST");
}

export async function publishAssumption(id: string, expectedRevision: number): Promise<AssumptionDetail> {
  return authenticatedRequest<AssumptionDetail>(`/admin/assumptions/${id}/publish`, { expectedRevision, confirm: true }, "POST");
}

export async function fetchUserAssumptions(): Promise<AssumptionsListResponse> {
  return authenticatedRequest<AssumptionsListResponse>("/me/assumptions");
}
