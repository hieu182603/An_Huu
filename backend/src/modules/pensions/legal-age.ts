import type { ProfileV2 } from "../profiles/schema-v2";
import { legalRetirementAge as ageReferenceV1 } from "./legal-age-v1";

// Annex I/II ages remain a reference. Decree 158/2025 Article 44 repealed
// Decree 135/2020 Article 3(2); receipt requires a separate benefit assessment.
export const RETIREMENT_AGE_RULE = {
  version: "VN-AGE-REFERENCE-2026-10-v2", verifiedOn: "2026-10-05",
  source: "https://datafiles.chinhphu.vn/cpp/files/vbpq/2020/11/135.signed.pdf",
  effectiveFrom: "2021-01-01", scope: "AGE_REFERENCE_ONLY" as const,
  relatedSources: [
    "https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-158-2025-nd-cp-quy-dinh-ve-bao-hiem-xa-hoi-bat-buoc-119250629171336803.htm",
    "https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-12-2025-tt-bnv-quy-dinh-chi-tiet-mot-so-dieu-cua-luat-bhxh-ve-bhxh-bat-buoc-11925070415595016.htm",
    "https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/11-bnv.pdf",
  ],
};

export function legalRetirementAge(personal: ProfileV2["personal"], asOfDate: string) {
  const reference = ageReferenceV1(personal, asOfDate);
  return {
    ...reference, rule: RETIREMENT_AGE_RULE,
    // This is only a calendar reference, never a confirmed receipt month.
    referenceFollowingMonth: reference.pensionStartMonth,
    pensionStartMonth: null,
    pensionStartStatus: "REQUIRES_BENEFIT_ASSESSMENT" as const,
  };
}
