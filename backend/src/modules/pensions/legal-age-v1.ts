// Frozen metadata for retirement-monthly-v2/v3. Do not use for new benefit assessments.
import { addMonths, monthSchema } from "../../common/calendar";
import type { ProfileV2 } from "../profiles/schema-v2";

export const RETIREMENT_AGE_RULE = {
  version: "VN-135-2020-ART3-5-7-ANNEX-I-II-v1", verifiedOn: "2026-10-04",
  source: "https://vbpl.vn/bokhoahoccongnghe/Pages/ivbpq-toanvan.aspx?ItemID=152734",
  effectiveFrom: "2021-01-01",
};
const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;

// Birth cohorts transcribed from Annex I/II, not the target retirement year.
// Each male transition cohort covers 9 birth months, each female cohort 8.
export function legalRetirementAge(personal: ProfileV2["personal"], asOfDate: string) {
  const base = { rule: RETIREMENT_AGE_RULE, eligibility: "NOT_ASSESSED" as const,
    desiredRetirementMonth: personal.desiredRetirementMonth.status === "KNOWN" ? personal.desiredRetirementMonth.value : null };
  const incomplete = (code: string) => ({ ...base, status: "REVIEW_REQUIRED" as const, issue: code,
    ageMonths: null, retirementMonth: null, pensionStartMonth: null, conditionBasis: personal.retirementCondition?.kind ?? "UNKNOWN" });
  if (asOfDate < RETIREMENT_AGE_RULE.effectiveFrom) return incomplete("OUTSIDE_RULE_EFFECTIVE_PERIOD");
  if (personal.birthMonth.status !== "KNOWN") return incomplete("BIRTH_MONTH_REQUIRED");
  if (personal.birthMonth.value > asOfDate.slice(0, 7)) return incomplete("BIRTH_MONTH_IN_FUTURE");
  if (personal.gender !== "MALE" && personal.gender !== "FEMALE") return incomplete("LEGAL_SEX_REQUIRED");
  const condition = personal.retirementCondition;
  if (!condition || condition.kind === "UNKNOWN") return incomplete("WORK_CONDITION_REQUIRED");
  if (condition.kind === "OTHER") return incomplete("SPECIAL_RULE_REVIEW_REQUIRED");
  const male = personal.gender === "MALE", early = condition.kind === "ARTICLE_5_DECLARED";
  const firstBirth = male ? (early ? "1966-01" : "1961-01") : (early ? "1971-01" : "1966-01");
  const delta = index(personal.birthMonth.value) - index(firstBirth);
  let ageMonths: number;
  if (!early && delta === -1) ageMonths = male ? 720 : 660; // Article 7(2).
  else if (delta < 0) return incomplete("OUTSIDE_ANNEX_BIRTH_COHORTS");
  else ageMonths = (male ? 723 : 664) - (early ? 60 : 0)
    + (male ? 3 : 4) * Math.min(male ? 7 : 14, Math.floor(delta / (male ? 9 : 8)));
  const retirementMonth = addMonths(personal.birthMonth.value, ageMonths);
  if (!monthSchema.safeParse(addMonths(retirementMonth, 1)).success) return incomplete("OUTSIDE_SUPPORTED_CALENDAR");
  return { ...base, status: "REFERENCE_ONLY" as const, issue: early ? "ARTICLE_5_CONDITIONS_NOT_VERIFIED" : null,
    ageMonths, retirementMonth, pensionStartMonth: addMonths(retirementMonth, 1), conditionBasis: condition.kind };
}
