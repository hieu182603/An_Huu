import { authenticatedRequest } from "./api";
import type { SimulatePlanResponse } from "./plans";

export const AI_POLICY_VERSION = "ai-explanation-2026-10-v1";
export const AI_RETENTION_DAYS = 30;

export interface AiPrivacyResponse {
  revision: number;
  processing: boolean;
  saveHistory: boolean;
  policyVersion: string;
  acceptedPolicyVersion: string | null;
  retentionDays: number;
  purpose: string;
  providerData: string[];
  excludedData: string[];
  historyPolicy: string;
  providerConfigured: boolean;
}

export interface AiCitation {
  id: string;
  sourceId: string;
  title: string;
  version: string;
  url: string | null;
  contentHash: string;
  effectiveDate: string;
  excerpt: string;
}

export interface AiFact {
  key: string;
  text: string;
}

export interface AiProvenance {
  planId: string;
  versionId: string;
  snapshotHash: string;
  modelVersion: string;
  valuationDate: string;
  profileRevision: number;
  references: unknown;
  hypothetical: boolean;
  warningCodes: string[];
  sources: unknown;
  valueKind: "FORECAST" | "REFORECAST";
  actuals?: {
    throughMonth: string;
    status: string;
    anchor: { period: string; revision: number; closingBalance: string } | null;
    issues: Array<{ month: string; code: string }>;
    revisions: Array<{ month: string; revision: number }>;
  } | null;
}

export interface AiExplainCommand {
  question: string;
  planId?: string;
  versionId?: string;
  throughMonth?: string;
  conversationId?: string;
  expectedRevision?: number;
}

export interface AiExplainResponse {
  status: "AI_ASSISTED" | "PROVIDER_NOT_CONFIGURED" | "PROVIDER_UNAVAILABLE";
  answer: string;
  facts: AiFact[];
  citations: AiCitation[];
  provenance: AiProvenance | null;
  knowledgeStatus: "AVAILABLE" | "NO_APPROVED_MATCH";
  nextAction: string;
  applied: boolean;
  savedHistory: boolean;
  conversationId: string | null;
  revision: number | null;
  provider: string | null;
}

export interface AiSimulationCommand {
  planId: string;
  versionId: string;
  expectedProfileRevision: number;
  changes: {
    retirementMonth?: string;
    monthlyContribution?: string;
    monthlyExpenseToday?: string;
  };
}

export interface AiConversationItem {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  expiresAt: string;
}

export interface AiConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedSources?: AiCitation[];
  context?: unknown;
  createdAt: string;
}

export interface AiConversationDetail {
  id: string;
  title: string;
  revision: number;
  expiresAt: string;
  messages: AiConversationMessage[];
}

export interface AiConversationListResponse {
  page: number;
  limit: number;
  total: number;
  items: AiConversationItem[];
}

export async function getAiPrivacy(): Promise<AiPrivacyResponse> {
  return authenticatedRequest<AiPrivacyResponse>("/me/ai/privacy");
}

export async function updateAiPrivacy(command: {
  expectedRevision: number;
  policyVersion: string;
  processing: boolean;
  saveHistory: boolean;
}): Promise<AiPrivacyResponse> {
  return authenticatedRequest<AiPrivacyResponse>("/me/ai/privacy", command, "PUT");
}

export async function explainRetirementPlan(
  command: AiExplainCommand,
  idempotencyKey?: string
): Promise<AiExplainResponse> {
  const key = idempotencyKey || crypto.randomUUID();
  return authenticatedRequest<AiExplainResponse>(
    "/me/ai/explain",
    command,
    "POST",
    { "Idempotency-Key": key }
  );
}

export async function simulateViaAi(command: AiSimulationCommand): Promise<SimulatePlanResponse> {
  return authenticatedRequest<SimulatePlanResponse>("/me/ai/simulate", command, "POST");
}

export async function listAiConversations(page = 1, limit = 20): Promise<AiConversationListResponse> {
  return authenticatedRequest<AiConversationListResponse>(`/me/ai/conversations?page=${page}&limit=${limit}`);
}

export async function createAiConversation(): Promise<{ id: string; title: string; revision: number; expiresAt: string }> {
  return authenticatedRequest<{ id: string; title: string; revision: number; expiresAt: string }>("/me/ai/conversations", {}, "POST");
}

export async function getAiConversation(id: string): Promise<AiConversationDetail> {
  return authenticatedRequest<AiConversationDetail>(`/me/ai/conversations/${encodeURIComponent(id)}`);
}

export async function renameAiConversation(
  id: string,
  expectedRevision: number,
  title: string
): Promise<{ id: string; title: string; revision: number }> {
  return authenticatedRequest<{ id: string; title: string; revision: number }>(
    `/me/ai/conversations/${encodeURIComponent(id)}`,
    { expectedRevision, title },
    "PATCH"
  );
}

export async function editAiMessage(
  id: string,
  messageId: string,
  expectedRevision: number,
  content: string
): Promise<{ id: string; revision: number; answerRemoved: boolean }> {
  return authenticatedRequest<{ id: string; revision: number; answerRemoved: boolean }>(
    `/me/ai/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
    { expectedRevision, content },
    "PATCH"
  );
}

export async function deleteAiConversation(id: string): Promise<{ deleted: number }> {
  return authenticatedRequest<{ deleted: number }>(`/me/ai/conversations/${encodeURIComponent(id)}`, {}, "DELETE");
}

export async function clearAllAiConversations(): Promise<{ deleted: number }> {
  return authenticatedRequest<{ deleted: number }>("/me/ai/conversations", {}, "DELETE");
}

export async function exportAiConversation(id: string): Promise<AiConversationDetail> {
  const result = await authenticatedRequest<AiConversationDetail>(
    `/me/ai/conversations/${encodeURIComponent(id)}/export`
  );
  if (typeof window !== "undefined" && window.URL && document) {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" });
    const filename = `an-huu-ai-conversation-${id}.json`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
  return result;
}

