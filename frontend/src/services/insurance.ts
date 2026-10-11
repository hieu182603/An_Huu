import { authenticatedRequest } from "./api.ts";

export interface InsuranceEvidence {
  reference: string;
  contentHash: string;
  confirmedOn: string; // YYYY-MM-DD
}

export interface InsuranceContributionMonth {
  month: string; // YYYY-MM
  scheme: "COMPULSORY" | "VOLUNTARY" | "UNKNOWN";
  salaryRegime: "EMPLOYER" | "STATE" | "VOLUNTARY_INCOME" | "UNKNOWN";
  status: "PAID" | "CREDITED" | "UNKNOWN" | "WITHDRAWN" | "NOT_CONTRIBUTED";
  contributionBase: string | null;
  participantCategory?: "ARTICLE_2_1_A" | "ARTICLE_2_1_B" | "ARTICLE_2_1_C" | "ARTICLE_2_1_D" | "ARTICLE_2_1_DD" | "ARTICLE_2_1_G" | "ARTICLE_2_1_I" | "OTHER" | "UNKNOWN";
  stateSalary?: {
    kind: "CURRENT_SCALE_COEFFICIENT";
    totalContributionCoefficient: string;
    evidence: InsuranceEvidence[];
    pre2004Conversion?: {
      scale: "ND204_PUBLIC" | "ND204_ARMED_FORCES" | "ND205_ENTERPRISE";
      evidence: InsuranceEvidence[];
    };
    includesSeniorityAllowance?: boolean;
  };
  creditKind?: string;
  evidence: InsuranceEvidence[];
}

export interface InsuranceSpecialPeriod {
  kind: string;
  startMonth: string;
  endMonth: string;
  evidence: InsuranceEvidence[];
}

export interface InsuranceHistoryDocument {
  schemaVersion: 1;
  birth: {
    precision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
    declaredValue: string | null;
  };
  legalSex: "MALE" | "FEMALE" | "UNKNOWN";
  coverageFrom: string; // YYYY-MM
  coverageThrough: string; // YYYY-MM
  confirmedThroughMonth: string; // YYYY-MM
  months: InsuranceContributionMonth[];
  specialPeriods: InsuranceSpecialPeriod[];
}

export interface InsuranceHistoryRecord {
  id: string;
  userId: string;
  revision: number;
  documentHash: string;
  document: InsuranceHistoryDocument;
  createdAt: string;
}

export interface HistoryPreviewResponse {
  status: "READY" | "INCOMPLETE" | "INVALID";
  issues: Array<{ path: string; code: string; message?: string }>;
  normalized?: InsuranceHistoryDocument;
  inputHash: string | null;
}

export async function computeContentHash(content: string | ArrayBuffer): Promise<string> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  throw new Error("Không thể kiểm tra nội dung tài liệu. Vui lòng mở ứng dụng qua HTTPS hoặc localhost.");
}

export interface LegalRuleCitation {
  id: string;
  instrument: string;
  locator: string;
  url: string;
  contentHash?: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface PublishedLegalRuleSet {
  id: string;
  code: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  documentHash: string;
  knowledgeAsOf: string;
  coverage: Array<{
    branch: string;
    strategyCode: string;
    citationIds: string[];
    requiredTableKeys?: string[];
  }>;
  citations: LegalRuleCitation[];
}

export interface LegalRuleListResponse {
  items: PublishedLegalRuleSet[];
}

export interface VoluntaryCaseInput {
  kind: "NORMAL_VOLUNTARY";
  paymentMethod: "REGULAR_ONLY";
  ageRule: "NORMAL" | "LAW_ART141_9";
  benefitStart: {
    kind: "ELIGIBILITY" | "CONTINUED_CONTRIBUTIONS" | "TRANSITION_2025";
    month: string;
    confirmation: "DOCUMENTED" | "HYPOTHETICAL";
    evidence: InsuranceEvidence[];
  };
}

export interface VoluntaryTopUpInput {
  kind: "MISSING_YEARS_TOP_UP";
  ageRule: "NORMAL";
  historyTreatment: "REGULAR_ONLY";
  paymentOn: string;
  missingMonths: number;
  monthlyIncome: string;
  confirmation: "DOCUMENTED_FULLY_PAID" | "HYPOTHETICAL";
  evidence: InsuranceEvidence[];
}

export interface VoluntaryPrepaidInput {
  kind: "PREPAID_REQUEST";
  ageRule: "NORMAL";
  historyTreatment: "NO_OTHER_ACTIVE_PREPAYMENT_OR_TOP_UP";
  periodStartMonth: string;
  periodMonths: 3 | 6 | 12 | 24 | 36 | 48 | 60;
  registeredOn: string;
  paymentOn: string;
  monthlyIncome: string;
  confirmation: "DOCUMENTED_FULLY_PAID" | "HYPOTHETICAL";
  evidence: InsuranceEvidence[];
  benefitRequest: {
    confirmation: "DOCUMENTED" | "HYPOTHETICAL";
    evidence: InsuranceEvidence[];
  };
  refundSupport: {
    stateSupportToExclude: string;
    evidence: InsuranceEvidence[];
  } | null;
}

export interface CaseDetailsInput {
  kind: "NORMAL_EMPLOYEE";
  participationAtRetirement: "ACTIVE_COMPULSORY" | "PRESERVED";
  benefitStart: {
    kind: "EMPLOYER_NOTICE" | "PERSON_REQUEST" | "HYPOTHETICAL";
    month: string;
    evidence: InsuranceEvidence[];
  };
}

export interface StateSalaryCaseInput {
  firstParticipationMonth: string;
  firstParticipationEvidence: InsuranceEvidence[];
  salaryTreatment: "ORDINARY" | "HAZARDOUS_TRANSFER" | "MILITARY_TRANSFER" | "SENIORITY_ALLOWANCE_TRANSFER" | "UNKNOWN";
  treatmentEvidence: InsuranceEvidence[];
  transferMonth?: string;
  hazardousPeriods?: Array<{
    fromMonth: string;
    toMonth: string;
    evidence: InsuranceEvidence[];
  }>;
  hazardousWindowFrom?: string;
}

export interface PensionEstimateInput {
  historyVersionId: string;
  expectedHistoryRevision: number;
  legalRuleSetVersionId: string;
  intendedBenefitDate: string; // YYYY-MM-DD
  employmentEndDate: string | null; // YYYY-MM-DD
  contributionStopMonth: string | null; // YYYY-MM
  benefitRequestDate: string | null; // YYYY-MM-DD
  futureContributions: InsuranceContributionMonth[];
  voluntaryCase?: VoluntaryCaseInput;
  voluntaryTopUp?: VoluntaryTopUpInput;
  voluntaryPrepaid?: VoluntaryPrepaidInput;
  caseDetails?: CaseDetailsInput;
  stateSalaryCase?: StateSalaryCaseInput;
}

export interface BenefitAssessmentBreakdown {
  code: string;
  value: string | null;
  unit: "VND" | "MONTHS" | "YEARS" | "PERCENT" | "DATE" | "CODE";
  citationIds: string[];
}

export interface BenefitAssessment {
  assessmentStatus: "ELIGIBLE" | "NOT_YET_ELIGIBLE" | "INSUFFICIENT_DATA" | "REVIEW_REQUIRED";
  estimateKind: "CURRENT_RULE_ESTIMATE" | "PROJECTED_SCENARIO";
  inputHash: string;
  historyHash: string;
  ruleHash: string;
  countedMonths: number | null;
  monthlyPension: string | null;
  startMonth: string | null;
  lumpSum: string | null;
  missingFields: Array<{ path: string; code: string }>;
  breakdown: BenefitAssessmentBreakdown[];
  citations: LegalRuleCitation[];
}

export interface PensionEstimatePreviewResult {
  inputHash: string;
  engineCode: string;
  assessedOn: string;
  historyVersionId: string;
  historyRevision: number;
  legalRuleSetVersionId: string;
  legalRuleVersion: number;
  assessment: BenefitAssessment;
}

export interface PensionEstimateRecord {
  id: string;
  createdAt: string;
  integrityHash: string;
  inputHash: string;
  engineCode: string;
  assessedOn: string;
  historyVersionId: string;
  historyRevision: number;
  legalRuleSetVersionId: string;
  legalRuleVersion: number;
  assessment: BenefitAssessment;
}

export interface PensionEstimateListResponse {
  items: PensionEstimateRecord[];
}

// ==========================================
// API CLIENT FUNCTIONS
// ==========================================

export async function getLatestInsuranceHistory(): Promise<InsuranceHistoryRecord | null> {
  return await authenticatedRequest<InsuranceHistoryRecord | null>("/me/pension/history");
}

export async function getInsuranceHistoryById(id: string): Promise<InsuranceHistoryRecord> {
  return await authenticatedRequest<InsuranceHistoryRecord>(`/me/pension/history/${id}`);
}

export async function previewInsuranceHistoryImport(
  expectedHistoryRevision: number,
  document: InsuranceHistoryDocument
): Promise<HistoryPreviewResponse> {
  return await authenticatedRequest<HistoryPreviewResponse>(
    "/me/pension/history/import-preview",
    { expectedHistoryRevision, document },
    "POST"
  );
}

export async function saveInsuranceHistory(
  preview: { expectedHistoryRevision: number; document: InsuranceHistoryDocument },
  expectedInputHash: string,
  idempotencyKey: string = crypto.randomUUID()
): Promise<InsuranceHistoryRecord> {
  return await authenticatedRequest<InsuranceHistoryRecord>(
    "/me/pension/history",
    { preview, expectedInputHash, confirm: true },
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}

export async function getPublishedLegalRules(benefitDate: string): Promise<LegalRuleListResponse> {
  return await authenticatedRequest<LegalRuleListResponse>(
    `/me/pension/legal-rules?benefitDate=${encodeURIComponent(benefitDate)}`
  );
}

export async function listPensionEstimates(skipCache = false): Promise<PensionEstimateListResponse> {
  return await authenticatedRequest<PensionEstimateListResponse>("/me/pension/estimates", undefined, "GET", undefined, { skipCache });
}

export async function getPensionEstimate(id: string): Promise<PensionEstimateRecord> {
  return await authenticatedRequest<PensionEstimateRecord>(`/me/pension/estimates/${id}`);
}

export async function previewPensionEstimate(
  input: PensionEstimateInput
): Promise<PensionEstimatePreviewResult> {
  return await authenticatedRequest<PensionEstimatePreviewResult>(
    "/me/pension/estimates/preview",
    input,
    "POST"
  );
}

export async function savePensionEstimate(
  preview: PensionEstimateInput,
  expectedInputHash: string,
  idempotencyKey: string = crypto.randomUUID()
): Promise<PensionEstimateRecord> {
  return await authenticatedRequest<PensionEstimateRecord>(
    "/me/pension/estimates",
    { preview, expectedInputHash },
    "POST",
    { "Idempotency-Key": idempotencyKey }
  );
}
