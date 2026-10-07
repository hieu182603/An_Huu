import { authenticatedRequest } from "./api";

export type PensionPriceBasis = "TODAY" | "NOMINAL_AT_START";

export type PensionAdjustment =
  | { kind: "NONE" }
  | {
      kind: "EXPLICIT_SCHEDULE";
      entries: Array<{
        effectiveMonth: string;
        monthlyAmount: string;
        source: string;
      }>;
    };

export type PensionDeclaration =
  | { status: "UNKNOWN" }
  | { status: "NOT_APPLICABLE"; reason: string }
  | {
      status: "KNOWN";
      monthlyAmount: string;
      currency: "VND";
      priceBasis: PensionPriceBasis;
      basisMonth: string;
      source: string;
      estimatedOn: string;
      linkedIncomeId?: string;
      adjustment: PensionAdjustment;
    };

export type RetirementCondition =
  | { kind: "UNKNOWN" }
  | { kind: "NORMAL" }
  | {
      kind: "ARTICLE_5_DECLARED";
      basis: "HAZARDOUS_15_YEARS" | "DIFFICULT_REGION_15_YEARS" | "COMBINED_15_YEARS" | "WORK_CAPACITY_LOSS_61_PERCENT";
      evidence: string;
    }
  | { kind: "OTHER"; description: string };

export type LegalRetirementAgeResult = {
  rule: {
    version: string;
    verifiedOn: string;
    source: string;
    effectiveFrom: string;
    scope?: string;
  };
  eligibility: "NOT_ASSESSED";
  desiredRetirementMonth: string | null;
  status: "REFERENCE_ONLY" | "REVIEW_REQUIRED";
  issue: string | null;
  ageMonths: number | null;
  retirementMonth: string | null;
  referenceFollowingMonth?: string | null;
  pensionStartMonth: string | null;
  pensionStartStatus?: string | null;
  conditionBasis: string;
  relatedSources?: Array<{ title?: string; url?: string }>;
};

export type PensionPreviewRow = {
  month: string;
  amount: string | null;
};

export type PensionIssue = {
  path?: string;
  code: string;
  message?: string;
};

export type PensionPreviewResponse = {
  status: "READY" | "INCOMPLETE";
  profileRevision: number;
  valuationDate: string;
  currency: "VND";
  priceBasis: "NOMINAL";
  estimateBasis: "USER_DECLARED_NOT_VERIFIED";
  issues: PensionIssue[];
  rows: PensionPreviewRow[];
  assumptionVersionId: string | null;
  assumptionHash: string | null;
  declaration: PensionDeclaration;
  legalRetirementAge: LegalRetirementAgeResult;
  limitations: string[];
};

export type PensionPreviewCommand = {
  expectedProfileRevision: number;
  startMonth: string;
  months: number;
  assumptionVersionId?: string;
};

export type PublishedAssumptionItem = {
  id: string;
  version: number;
  revision: number;
  status: string;
  title: string;
  effectiveAt: string | null;
  projectionStartYear: number;
  projectionEndYear: number;
};

export type PublishedAssumptionsResponse = {
  status: "AVAILABLE" | "UNCONFIGURED";
  total: number;
  items: PublishedAssumptionItem[];
};

export async function fetchPublishedAssumptions(): Promise<PublishedAssumptionsResponse> {
  return authenticatedRequest<PublishedAssumptionsResponse>("/me/assumptions?page=1&limit=20");
}

export async function fetchPensionPreview(
  command: PensionPreviewCommand
): Promise<PensionPreviewResponse> {
  return authenticatedRequest<PensionPreviewResponse>("/me/pension/preview", command, "POST");
}
