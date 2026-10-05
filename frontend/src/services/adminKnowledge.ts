import { authenticatedRequest } from "./api";

export interface KnowledgeSourceItem {
  id: string;
  title: string;
  referenceCode: string | null;
  category: string;
  version: string;
  fileUrl: string | null;
  effectiveDate: string | null;
  validUntil: string | null;
  revision: number;
  status: "PENDING" | "INDEXED" | "FAILED" | string;
  isApproved: boolean;
  indexedHash: string | null;
  contentHash: string;
  indexMethod: "LEXICAL_V1" | null;
}

export interface KnowledgeSourceDetail extends KnowledgeSourceItem {
  rawContent: string;
}

export interface KnowledgeSourceInput {
  title: string;
  referenceCode?: string;
  category: string;
  version: string;
  rawContent: string;
  fileUrl?: string;
  effectiveDate: string;
  validUntil?: string | null;
}

export interface KnowledgeSourceListResponse {
  page: number;
  limit: number;
  total: number;
  items: KnowledgeSourceItem[];
}

export async function listKnowledgeSources(page = 1, limit = 20): Promise<KnowledgeSourceListResponse> {
  return authenticatedRequest<KnowledgeSourceListResponse>(`/admin/knowledge?page=${page}&limit=${limit}`);
}

export async function getKnowledgeSource(id: string): Promise<KnowledgeSourceDetail> {
  return authenticatedRequest<KnowledgeSourceDetail>(`/admin/knowledge/${encodeURIComponent(id)}`);
}

export async function createKnowledgeSource(command: KnowledgeSourceInput): Promise<KnowledgeSourceItem> {
  return authenticatedRequest<KnowledgeSourceItem>("/admin/knowledge", command, "POST");
}

export async function editKnowledgeSource(
  id: string,
  expectedRevision: number,
  data: KnowledgeSourceInput
): Promise<KnowledgeSourceItem> {
  return authenticatedRequest<KnowledgeSourceItem>(
    `/admin/knowledge/${encodeURIComponent(id)}`,
    { expectedRevision, data },
    "PUT"
  );
}

export async function indexKnowledgeSource(id: string, expectedRevision: number): Promise<KnowledgeSourceItem> {
  return authenticatedRequest<KnowledgeSourceItem>(
    `/admin/knowledge/${encodeURIComponent(id)}/index`,
    { expectedRevision },
    "POST"
  );
}

export async function approveKnowledgeSource(
  id: string,
  expectedRevision: number,
  approved: boolean,
  reviewNote: string
): Promise<KnowledgeSourceItem> {
  return authenticatedRequest<KnowledgeSourceItem>(
    `/admin/knowledge/${encodeURIComponent(id)}/approval`,
    { expectedRevision, approved, reviewNote, confirm: true },
    "POST"
  );
}
