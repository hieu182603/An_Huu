import { authenticatedRequest } from "./api.ts";

export interface LegalCitation {
  id: string;
  instrument: string;
  locator: string;
  url: string;
  contentHash: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface LegalRuleCoverage {
  branch: string;
  strategyCode: string;
  citationIds: string[];
  requiredTableKeys: string[];
}

export interface LegalRuleTable {
  kind: "AGE_MONTHS" | "WAGE_FACTOR" | "INCOME_FACTOR" | "REFERENCE_AMOUNT" | "FUND_MONTHLY_RATE";
  key: string;
  value: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  citationId: string;
}

export interface LegalRuleDocument {
  schemaVersion: 1;
  engineCode: string;
  coverage: LegalRuleCoverage[];
  citations: LegalCitation[];
  tables: LegalRuleTable[];
}

export interface LegalRuleDraftInput {
  code: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesId: string | null;
  document: LegalRuleDocument;
}

export interface AdminLegalRuleItem {
  id: string;
  revision: number;
  version: number;
  status: "DRAFT" | "VALIDATED" | "REVIEWED" | "PUBLISHED";
  documentHash: string;
  knowledgeAsOf: string;
  publishedAt: string | null;
  draft: LegalRuleDraftInput;
  validation: {
    valid: boolean;
    validationHash: string;
    checkedAt: string;
    coverageErrors?: string[];
    tableErrors?: string[];
    strategyErrors?: string[];
  } | null;
  review: {
    actor: string;
    reviewedAt: string;
    reviewNote: string;
    validationHash: string;
    draftHash: string;
    reviewHash: string;
  } | null;
}

export interface AdminLegalRuleListResponse {
  items: AdminLegalRuleItem[];
}

export interface LegalRuleTransitionInput {
  action: "VALIDATE" | "REVIEW" | "PUBLISH";
  expectedRevision: number;
  expectedDocumentHash: string;
  validationHash?: string;
  reviewHash?: string;
  reviewNote?: string;
  confirm: true;
}

export async function listAdminLegalRules(): Promise<AdminLegalRuleListResponse> {
  return authenticatedRequest<AdminLegalRuleListResponse>("/admin/legal-rules");
}

export async function getAdminLegalRule(id: string): Promise<AdminLegalRuleItem> {
  return authenticatedRequest<AdminLegalRuleItem>(`/admin/legal-rules/${encodeURIComponent(id)}`);
}

export async function createAdminLegalRule(
  draft: LegalRuleDraftInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<AdminLegalRuleItem> {
  return authenticatedRequest<AdminLegalRuleItem>(
    "/admin/legal-rules",
    draft,
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}

export async function patchAdminLegalRule(
  id: string,
  expectedRevision: number,
  draft: LegalRuleDraftInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<AdminLegalRuleItem> {
  return authenticatedRequest<AdminLegalRuleItem>(
    `/admin/legal-rules/${encodeURIComponent(id)}`,
    { expectedRevision, draft },
    "PATCH",
    { "Idempotency-Key": idempotencyKey }
  );
}

export async function transitionAdminLegalRule(
  id: string,
  transition: LegalRuleTransitionInput,
  idempotencyKey: string = crypto.randomUUID()
): Promise<AdminLegalRuleItem> {
  return authenticatedRequest<AdminLegalRuleItem>(
    `/admin/legal-rules/${encodeURIComponent(id)}/transitions`,
    transition,
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}
