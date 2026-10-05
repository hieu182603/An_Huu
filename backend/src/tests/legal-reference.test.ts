import { describe, expect, it } from "vitest";
import { legalRetirementAge } from "../modules/pensions/legal-age";
import { legalRetirementAge as legacyAge } from "../modules/pensions/legal-age-v1";
import { prepareRetirement } from "../modules/retirement/prepare";
import { pensionProfile } from "./pension-fixtures";
import { known, unknown } from "./profile-v2-fixtures";
import { retirementCommand, retirementConfiguration, retirementProfile } from "./retirement-fixtures";

describe("T13 retirement age versus benefit start", () => {
  it("keeps the reference calendar separate from declared receipt, even when age has already been reached", () => {
    const personal = pensionProfile().personal;
    personal.gender = "MALE"; personal.birthMonth = known("1966-04");
    personal.pensionStartMonth = known("2030-06");
    const before = structuredClone(personal);
    for (const asOf of ["2025-06-30", "2025-07-01", "2026-10-05", "2029-01-01"]) {
      expect(legalRetirementAge(personal, asOf)).toMatchObject({
        rule: { scope: "AGE_REFERENCE_ONLY", version: "VN-AGE-REFERENCE-2026-10-v2" },
        ageMonths: 744, retirementMonth: "2028-04", referenceFollowingMonth: "2028-05",
        pensionStartMonth: null, pensionStartStatus: "REQUIRES_BENEFIT_ASSESSMENT", eligibility: "NOT_ASSESSED",
      });
    }
    expect(personal).toEqual(before);
  });

  it("does not manufacture either date when the birth month or special-case rules are missing", () => {
    const p = pensionProfile().personal;
    p.birthMonth = unknown;
    expect(legalRetirementAge(p, "2026-10-05")).toMatchObject({ status: "REVIEW_REQUIRED",
      referenceFollowingMonth: null, pensionStartMonth: null, issue: "BIRTH_MONTH_REQUIRED" });
    p.birthMonth = known("1970-01"); p.retirementCondition = { kind: "OTHER", description: "Preschool teacher" };
    expect(legalRetirementAge(p, "2026-10-05")).toMatchObject({ status: "REVIEW_REQUIRED",
      referenceFollowingMonth: null, pensionStartMonth: null, issue: "SPECIAL_RULE_REVIEW_REQUIRED" });
  });

  it("retains the complete pre-T13 reference payload used in v2/v3 snapshots", () => {
    const p = pensionProfile().personal;
    p.gender = "MALE"; p.birthMonth = known("1966-04"); p.desiredRetirementMonth = known("2030-01");
    expect(legacyAge(p, "2026-10-04")).toEqual({
      rule: { version: "VN-135-2020-ART3-5-7-ANNEX-I-II-v1", verifiedOn: "2026-10-04",
        source: "https://vbpl.vn/bokhoahoccongnghe/Pages/ivbpq-toanvan.aspx?ItemID=152734", effectiveFrom: "2021-01-01" },
      eligibility: "NOT_ASSESSED", desiredRetirementMonth: "2030-01", status: "REFERENCE_ONLY", issue: null,
      ageMonths: 744, retirementMonth: "2028-04", pensionStartMonth: "2028-05", conditionBasis: "NORMAL",
    });
  });

  it("keeps v3 preparation pinned to legacy metadata while the standalone pension reference advances", () => {
    const p = retirementProfile(), cfg = retirementConfiguration();
    p.personal.retirementCondition = { kind: "NORMAL" }; p.personal.gender = "MALE"; p.personal.birthMonth = known("1966-04");
    const prepared = prepareRetirement(p, retirementCommand(), cfg.policy, cfg.assumptions);
    expect(prepared.status).toBe("READY");
    expect(prepared.calculation!.legalRetirementAge).toMatchObject({
      rule: { version: "VN-135-2020-ART3-5-7-ANNEX-I-II-v1" }, pensionStartMonth: "2028-05",
    });
    expect(prepared.calculation!.legalRetirementAge).not.toHaveProperty("referenceFollowingMonth");
    expect(legalRetirementAge(p.personal, p.valuationDate).pensionStartMonth).toBeNull();
  });
});
