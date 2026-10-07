import { z } from "zod";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import { insuranceHistorySchema, maternityCreditCitation, legalRuleDocumentSchema, pensionEstimateInputSchema, type LegalRuleDocument } from "./insurance-schema";
import { benefitYears, ordinaryPensionRate } from "./benefit-math";
import { hazardousTransferAverage, militaryTransferAverage, ordinaryStateMixedAverage, stateAveragingWindow } from "./state-wage";
import { retirementLumpSum } from "./benefit-assessment-v2";

export const STATE_BENEFIT_ENGINE = "vn-pension-state-v1";
export const STATE_BRANCH = "BH2_COMPULSORY_STATE_MIXED_NORMAL";
export const STATE_STRATEGY = "vn-bh2-state-mixed-2025-v1";
export const STATE_CITATIONS = ["LAW_ART5", "LAW_ART31", "LAW_ART64", "LAW_ART66", "LAW_ART68", "LAW_ART69", "LAW_ART72", "LAW_ART73", "ND135_ANNEX_I", "ND158_ART12", "ND158_ART13", "ND158_ART15", "TT12_ART14", "TT12_ART15_16"];
/** v2 adds BHXH-confirmed pre-1995 credited time (ND158 Art34), BHXH-converted
 * pre-Oct-2004 state salary (Art15(1)(a)), armed-forces transfer (Art15(2)(b)),
 * hazardous-occupation transfer (Art15(2)(a)) and seniority-allowance case (3)(b). */
export const STATE_BENEFIT_ENGINE_V2 = "vn-pension-state-v2";
export const STATE_STRATEGY_V2 = "vn-bh2-state-mixed-2025-v2";
export const STATE_CITATIONS_V2 = [...STATE_CITATIONS, "LAW_ART2", "ND158_ART34"];
const CIVIL = ["ARTICLE_2_1_A", "ARTICLE_2_1_B"];
const CHANGE_TREATMENTS = ["MILITARY_TRANSFER", "HAZARDOUS_TRANSFER", "SENIORITY_ALLOWANCE_TRANSFER"];
type Issue = { path: string; code: string };
type AssessmentInput = z.infer<typeof pensionEstimateInputSchema>;
type Breakdown = { code: string; value: string | null; unit: "VND" | "MONTHS" | "YEARS" | "PERCENT" | "DATE" | "CODE"; citationIds: string[] };
export type BenefitAssessment = { assessmentStatus: "ELIGIBLE" | "NOT_YET_ELIGIBLE" | "INSUFFICIENT_DATA" | "REVIEW_REQUIRED";
  estimateKind: "CURRENT_RULE_ESTIMATE" | "PROJECTED_SCENARIO"; inputHash: string; historyHash: string; ruleHash: string;
  countedMonths: number | null; monthlyPension: string | null; startMonth: string | null; lumpSum: string | null;
  missingFields: Issue[]; breakdown: Breakdown[]; citations: LegalRuleDocument["citations"] };

/** Calendar interpretation for post-2021 normal cohorts. This is deliberately
 * separate from frozen plan-v3 metadata. Historical earlier cohorts need their
 * applicable rules, rather than a guessed present-day age. */
export function normalCohortAge(sex: "MALE" | "FEMALE", birthMonth: string): number | null {
  monthSchema.parse(birthMonth);
  const index = (v: string) => Number(v.slice(0, 4)) * 12 + Number(v.slice(5)) - 1;
  const male = sex === "MALE", delta = index(birthMonth) - index(male ? "1961-01" : "1966-01");
  if (delta === -1) return male ? 720 : 660;
  if (delta < 0) return null;
  return male ? 723 + 3 * Math.min(7, Math.floor(delta / 9)) : 664 + 4 * Math.min(14, Math.floor(delta / 8));
}

/** Pure assessment of a pinned normal employee case, never a grant of benefits.
 * Service must authorize owner, verify publication/coverage/effective date and
 * pin the entire history/rule/input before calling this function or saving it. */
export function assessStateBenefit(historyValue: unknown, inputValue: AssessmentInput, rulesValue: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  return assess(historyValue, inputValue, rulesValue, assessedOn, false);
}
export function assessStateBenefitV2(historyValue: unknown, inputValue: AssessmentInput, rulesValue: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  return assess(historyValue, inputValue, rulesValue, assessedOn, true);
}
function assess(historyValue: unknown, inputValue: AssessmentInput, rulesValue: LegalRuleDocument, assessedOn: string, v2: boolean): BenefitAssessment {
  const engineCode = v2 ? STATE_BENEFIT_ENGINE_V2 : STATE_BENEFIT_ENGINE, strategyCode = v2 ? STATE_STRATEGY_V2 : STATE_STRATEGY;
  const history = insuranceHistorySchema.parse(historyValue), input = pensionEstimateInputSchema.parse(inputValue), rules = legalRuleDocumentSchema.parse(rulesValue);
  dateSchema.parse(assessedOn);
  const missing: Issue[] = [], review: Issue[] = [], breakdown: Breakdown[] = [];
  const historyHash = digest(history), ruleHash = digest(rules);
  const future = input.futureContributions, hypothetical = future.length > 0 || input.intendedBenefitDate > assessedOn || input.caseDetails?.benefitStart.kind === "HYPOTHETICAL";
  const base: BenefitAssessment = { assessmentStatus: "INSUFFICIENT_DATA", estimateKind: hypothetical ? "PROJECTED_SCENARIO" : "CURRENT_RULE_ESTIMATE",
    inputHash: digest({ historyHash, ruleHash, input, assessedOn, engineCode }), historyHash, ruleHash,
    countedMonths: null, monthlyPension: null, startMonth: null, lumpSum: null, missingFields: [], breakdown, citations: rules.citations };
  const finish = (status: BenefitAssessment["assessmentStatus"], fields: Partial<BenefitAssessment> = {}) => ({ ...base, ...fields, assessmentStatus: status, missingFields: [...missing, ...review], breakdown });
  const add = (path: string, code: string) => missing.push({ path, code });
  if (rules.engineCode !== engineCode || !rules.coverage.some(c => c.branch === STATE_BRANCH && c.strategyCode === strategyCode))
    review.push({ path: "legalRuleSetVersionId", code: "RULE_BRANCH_NOT_SUPPORTED" });
  const details = input.caseDetails;
  const stateCase = input.stateSalaryCase;
  const transfer = v2 && stateCase?.salaryTreatment === "MILITARY_TRANSFER" ? stateCase.transferMonth ?? null : null;
  const treatment = stateCase?.salaryTreatment, change = v2 && treatment && CHANGE_TREATMENTS.includes(treatment) ? stateCase!.transferMonth ?? null : null;
  if (!stateCase) add("stateSalaryCase", "STATE_SALARY_CASE_REQUIRED");
  else {
    const changes = CHANGE_TREATMENTS.includes(stateCase.salaryTreatment), hazardous = stateCase.salaryTreatment === "HAZARDOUS_TRANSFER";
    if (!(stateCase.salaryTreatment === "ORDINARY" || (v2 && changes)))
      review.push({ path: "stateSalaryCase.salaryTreatment", code: "SPECIAL_STATE_SALARY_ASSESSMENT_REQUIRED" });
    if (v2 && changes && !stateCase.transferMonth) add("stateSalaryCase.transferMonth", "TRANSFER_MONTH_REQUIRED");
    if (v2 && !changes && stateCase.transferMonth) add("stateSalaryCase.transferMonth", "TRANSFER_MONTH_NOT_APPLICABLE");
    if (v2 && !hazardous && (stateCase.hazardousPeriods || stateCase.hazardousWindowFrom)) add("stateSalaryCase.hazardousPeriods", "HAZARDOUS_FIELDS_NOT_APPLICABLE");
    if (v2 && hazardous && (!stateCase.hazardousPeriods?.length || !stateCase.hazardousWindowFrom)) add("stateSalaryCase.hazardousPeriods", "HAZARDOUS_PERIODS_REQUIRED");
    if (stateCase.hazardousPeriods?.some(p => p.evidence.some(e => e.confirmedOn > assessedOn))) add("stateSalaryCase.hazardousPeriods", "FUTURE_EVIDENCE_CONFIRMATION");
    if (stateCase.firstParticipationMonth < history.coverageFrom || stateCase.firstParticipationMonth > history.coverageThrough)
      add("stateSalaryCase.firstParticipationMonth", "FIRST_PARTICIPATION_OUTSIDE_HISTORY");
    if ([...stateCase.firstParticipationEvidence, ...stateCase.treatmentEvidence].some(e => e.confirmedOn > assessedOn)) add("stateSalaryCase", "FUTURE_EVIDENCE_CONFIRMATION");
  }
  if (!details) add("caseDetails", "NORMAL_EMPLOYEE_CASE_REQUIRED");
  if (history.specialPeriods.length) review.push({ path: "specialPeriods", code: "SPECIAL_CASE_ASSESSMENT_REQUIRED" });
  if (history.birth.precision === "UNKNOWN") add("birth", "BIRTH_REQUIRED");
  if (history.legalSex === "UNKNOWN") add("legalSex", "LEGAL_SEX_REQUIRED");
  if (!input.contributionStopMonth) add("contributionStopMonth", "CONTRIBUTION_STOP_REQUIRED");
  if (!input.employmentEndDate) add("employmentEndDate", "EMPLOYMENT_END_REQUIRED");
  if (history.confirmedThroughMonth > assessedOn.slice(0, 7)) add("confirmedThroughMonth", "FUTURE_HISTORY_CONFIRMATION");
  if ([...history.months, ...history.specialPeriods, ...future, ...(details ? [details.benefitStart] : [])].some(r => r.evidence.some(e => e.confirmedOn > assessedOn)))
    add("evidence.confirmedOn", "FUTURE_EVIDENCE_CONFIRMATION");
  if (review.length || missing.length) return finish(review.length ? "REVIEW_REQUIRED" : "INSUFFICIENT_DATA");
  const stop = input.contributionStopMonth!, benefitMonth = input.intendedBenefitDate.slice(0, 7), seen = new Set<string>();
  if (stop >= benefitMonth || input.employmentEndDate! >= input.intendedBenefitDate) add("contributionStopMonth", "EMPLOYMENT_OR_CONTRIBUTIONS_AFTER_BENEFIT_START");
  if (input.intendedBenefitDate < "2025-07-01" || !input.intendedBenefitDate.endsWith("-01")) review.push({ path: "intendedBenefitDate", code: "BENEFIT_DATE_OUTSIDE_SUPPORTED_RULE" });
  if (details!.benefitStart.month !== benefitMonth) add("caseDetails.benefitStart", "BENEFIT_DOCUMENT_MONTH_MISMATCH");
  if (details!.participationAtRetirement === "ACTIVE_COMPULSORY" && details!.benefitStart.kind === "PERSON_REQUEST") add("caseDetails.benefitStart", "EMPLOYER_NOTICE_REQUIRED");
  if (details!.participationAtRetirement === "PRESERVED") {
    if (!input.benefitRequestDate) add("benefitRequestDate", "BENEFIT_REQUEST_REQUIRED");
    if (details!.benefitStart.kind === "EMPLOYER_NOTICE") add("caseDetails.benefitStart", "PERSON_REQUEST_REQUIRED");
  }
  if (input.employmentEndDate!.slice(0, 7) < stop) add("employmentEndDate", "CONTRIBUTIONS_AFTER_EMPLOYMENT_END");
  for (const row of history.months) {
    if (seen.has(row.month)) add("months", "DUPLICATE_CONTRIBUTION_MONTH"); seen.add(row.month);
    if (row.month < history.coverageFrom || row.month > history.coverageThrough) add("months", "MONTH_OUTSIDE_COVERAGE");
    if (row.month > stop && ["PAID", "CREDITED"].includes(row.status)) add("contributionStopMonth", "PAID_MONTH_AFTER_DECLARED_STOP");
    if (row.month > history.confirmedThroughMonth && row.status !== "UNKNOWN") add("months", "FUTURE_HISTORY_MUST_BE_SEPARATE_SCENARIO");
  }
  const combined = new Map(history.months.filter(r => r.month <= history.confirmedThroughMonth).map(r => [r.month, r]));
  const futureSeen = new Set<string>();
  for (const row of future) {
    if (row.month <= history.confirmedThroughMonth || row.month > stop || futureSeen.has(row.month)) add("futureContributions", "FUTURE_CONTRIBUTION_INTERVAL_INVALID");
    futureSeen.add(row.month); combined.set(row.month, row);
  }
  if (stop < history.coverageFrom || addMonths(history.coverageFrom, 1199) < stop) add("contributionStopMonth", "ASSESSMENT_HORIZON_INVALID");
  if (missing.length || review.length) return finish(review.length ? "REVIEW_REQUIRED" : "INSUFFICIENT_DATA");
  const counted: typeof history.months = [];
  for (let month = history.coverageFrom; month <= stop; month = addMonths(month, 1)) {
    const row = combined.get(month), path = `months.${month}`;
    if (!row || row.status === "UNKNOWN") { add(path, "UNKNOWN_CONTRIBUTION_MONTH"); continue; }
    if (!row.evidence.length) add(path, "CONTRIBUTION_EVIDENCE_REQUIRED");
    if (["WITHDRAWN", "NOT_CONTRIBUTED"].includes(row.status)) continue;
    if (row.scheme !== "COMPULSORY" || !["EMPLOYER", "STATE"].includes(row.salaryRegime)) review.push({ path, code: "DIFFERENT_INSURANCE_BRANCH_REQUIRED" });
    const category = row.participantCategory ?? "UNKNOWN", credited = row.status === "CREDITED";
    // ND158 Art34: only BHXH-confirmed pre-1995 state-sector or officer/professional-soldier time,
    // carrying a converted salary coefficient. Conscript (Art2(1)(đ)) or other credit kinds stay in review.
    const creditAccepted = v2 && credited && row.month < "1995-01" && row.salaryRegime === "STATE" && !!row.stateSalary &&
      ((row.creditKind === "PRE_1995_STATE_SECTOR" && CIVIL.includes(category)) || (row.creditKind === "PRE_1995_ARMED_FORCES" && category === "ARTICLE_2_1_D"));
    const armedForces = v2 && category === "ARTICLE_2_1_D" && row.salaryRegime === "STATE" &&
      (credited ? creditAccepted : transfer !== null && row.month < transfer);
    if (category === "UNKNOWN") add(path, "PARTICIPANT_CATEGORY_REQUIRED");
    else if (!CIVIL.includes(category) && !armedForces) review.push({ path, code: "PARTICIPANT_BRANCH_REVIEW_REQUIRED" });
    // Law 2024 Art53(8) / Law 2014 Art39(2): maternity counts like a contributed month with its BHXH-recorded base (checked below).
    const maternityLaw = maternityCreditCitation(row);
    const maternity = v2 && maternityLaw !== null && CIVIL.includes(category) && rules.citations.some(c => c.id === maternityLaw);
    if (credited && !creditAccepted && !maternity) review.push({ path, code: "CREDITED_MONTH_ASSESSMENT_REQUIRED" });
    // Credited time had no contribution; its salary comes from the converted coefficient.
    if (!creditAccepted && (row.contributionBase === null || new D(row.contributionBase).lte(0))) add(path, "POSITIVE_CONTRIBUTION_BASE_REQUIRED");
    counted.push(row);
  }
  if (!counted.some(r => r.salaryRegime === "STATE")) add("months", "STATE_SALARY_MONTH_REQUIRED");
  if (v2) {
    // Retiring while still in the armed forces follows separate age rules (BH4).
    if (counted.length && !CIVIL.includes(counted.at(-1)!.participantCategory ?? "")) review.push({ path: "months", code: "ARMED_FORCES_RETIREMENT_BRANCH_REQUIRED" });
    if (transfer !== null) {
      if (!counted.some(r => r.participantCategory === "ARTICLE_2_1_D" && r.status === "PAID" && r.month < transfer) || !counted.some(r => r.month >= transfer))
        add("stateSalaryCase.transferMonth", "TRANSFER_MONTH_INCONSISTENT");
      if (counted.some(r => r.salaryRegime === "EMPLOYER")) review.push({ path: "stateSalaryCase", code: "MILITARY_TRANSFER_MIXED_REVIEW_REQUIRED" });
      if (stateCase!.treatmentEvidence.some(e => e.confirmedOn < transfer)) add("stateSalaryCase.treatmentEvidence", "TRANSFER_EVIDENCE_BEFORE_TRANSFER");
    }
    if (change !== null && treatment !== "MILITARY_TRANSFER") {
      if (!counted.some(r => r.month < change) || !counted.some(r => r.month >= change)) add("stateSalaryCase.transferMonth", "TRANSFER_MONTH_INCONSISTENT");
      if (counted.some(r => r.salaryRegime === "EMPLOYER"))
        review.push({ path: "stateSalaryCase", code: treatment === "HAZARDOUS_TRANSFER" ? "HAZARDOUS_TRANSFER_MIXED_REVIEW_REQUIRED" : "SENIORITY_TRANSFER_MIXED_REVIEW_REQUIRED" });
      if (stateCase!.treatmentEvidence.some(e => e.confirmedOn < change)) add("stateSalaryCase.treatmentEvidence", "TRANSFER_EVIDENCE_BEFORE_TRANSFER");
    }
    const window = stateCase ? stateAveragingWindow(stateCase.firstParticipationMonth) : null, state = counted.filter(r => r.salaryRegime === "STATE");
    if (treatment === "HAZARDOUS_TRANSFER" && change !== null && stateCase!.hazardousPeriods?.length && stateCase!.hazardousWindowFrom) {
      // Art15(2)(a): >=15 years at hazardous salary levels (BHXH-confirmed periods), then lower-paid other work.
      const periods = [...stateCase!.hazardousPeriods].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)), byMonth = new Map(state.map(r => [r.month, r]));
      let total = 0, ordered = true;
      periods.forEach((p, i) => {
        if (p.fromMonth > p.toMonth || p.toMonth >= change || (i && periods[i - 1].toMonth >= p.fromMonth)) ordered = false;
        for (let m = p.fromMonth; m <= p.toMonth && ordered; m = addMonths(m, 1)) { if (byMonth.has(m)) total++; else ordered = false; }
      });
      if (!ordered) add("stateSalaryCase.hazardousPeriods", "HAZARDOUS_PERIODS_INVALID");
      else if (total < 180) add("stateSalaryCase.hazardousPeriods", "HAZARDOUS_FIFTEEN_YEARS_REQUIRED");
      const from = stateCase!.hazardousWindowFrom!;
      if (window === null) review.push({ path: "stateSalaryCase.hazardousWindowFrom", code: "HAZARDOUS_WINDOW_REVIEW_REQUIRED" });
      else if (!periods.some(p => p.fromMonth <= from && addMonths(from, window - 1) <= p.toMonth)) add("stateSalaryCase.hazardousWindowFrom", "HAZARDOUS_WINDOW_INVALID");
    }
    if (treatment === "SENIORITY_ALLOWANCE_TRANSFER" && change !== null) {
      // Art15(3): only (b) - every month of the final window includes the allowance - is unambiguous.
      const last = window === null ? state : state.slice(-window);
      if (!state.some(r => r.month < change && r.stateSalary?.includesSeniorityAllowance === true)) add("months", "SENIORITY_HISTORY_REQUIRED");
      if (last.some(r => r.stateSalary?.includesSeniorityAllowance === undefined)) add("months", "SENIORITY_FLAG_REQUIRED");
      else if (last.every(r => !r.stateSalary!.includesSeniorityAllowance)) review.push({ path: "months", code: "SENIORITY_ALLOWANCE_ADDITION_REVIEW_REQUIRED" });
      else if (last.some(r => !r.stateSalary!.includesSeniorityAllowance)) review.push({ path: "months", code: "SENIORITY_MIXED_WINDOW_REVIEW_REQUIRED" });
    }
  }
  if (stateCase && counted.some(r => r.month < stateCase.firstParticipationMonth)) add("stateSalaryCase.firstParticipationMonth", "CONTRIBUTION_BEFORE_DECLARED_FIRST_PARTICIPATION");
  if (stateCase && !history.months.some(r => r.month === stateCase.firstParticipationMonth && ["PAID", "CREDITED", "WITHDRAWN"].includes(r.status)))
    add("stateSalaryCase.firstParticipationMonth", "FIRST_PARTICIPATION_EVIDENCE_MONTH_REQUIRED");
  if (stateCase && history.months.some(r => r.month < stateCase.firstParticipationMonth && ["PAID", "CREDITED", "WITHDRAWN"].includes(r.status)))
    add("stateSalaryCase.firstParticipationMonth", "EARLIER_PARTICIPATION_IN_HISTORY");
  if (missing.length || review.length) return finish(review.length ? "REVIEW_REQUIRED" : "INSUFFICIENT_DATA");
  base.countedMonths = counted.length;
  breakdown.push({ code: "COUNTED_MONTHS", value: String(counted.length), unit: "MONTHS", citationIds: ["LAW_ART5", "LAW_ART64"] });
  const rate = ordinaryPensionRate(history.legalSex as "MALE" | "FEMALE", counted.length);
  if (rate === null) { add("months", "MINIMUM_180_MONTHS_NOT_MET"); return finish("NOT_YET_ELIGIBLE"); }
  const birthMonth = history.birth.precision === "YEAR" ? history.birth.declaredValue! + "-01" : history.birth.declaredValue!.slice(0, 7);
  const expectedAge = normalCohortAge(history.legalSex as "MALE" | "FEMALE", birthMonth);
  if (expectedAge === null) { review.push({ path: "birth", code: "HISTORICAL_BIRTH_COHORT_REVIEW_REQUIRED" }); return finish("REVIEW_REQUIRED"); }
  const resolve = (kind: LegalRuleDocument["tables"][number]["kind"], key: string) => {
    const found = rules.tables.filter(t => t.kind === kind && t.key === key && t.effectiveFrom <= input.intendedBenefitDate && (!t.effectiveTo || input.intendedBenefitDate < t.effectiveTo));
    if (found.length !== 1) { add(`tables.${kind}.${key}`, found.length ? "RULE_TABLE_AMBIGUOUS" : "RULE_TABLE_REQUIRED"); return null; }
    return found[0];
  };
  const age = resolve("AGE_MONTHS", `NORMAL:${history.legalSex}:${birthMonth}`);
  if (!age) return finish("INSUFFICIENT_DATA");
  if (!new D(age.value).eq(expectedAge)) { review.push({ path: "tables.AGE_MONTHS", code: "AGE_TABLE_REVIEW_REQUIRED" }); return finish("REVIEW_REQUIRED"); }
  const retirementMonth = addMonths(birthMonth, expectedAge), firstAgeMonth = addMonths(retirementMonth, 1);
  if (benefitMonth < firstAgeMonth) { add("intendedBenefitDate", "NORMAL_RETIREMENT_AGE_NOT_MET"); return finish("NOT_YET_ELIGIBLE"); }
  const earliest = [firstAgeMonth, addMonths(stop, 1), addMonths(input.employmentEndDate!.slice(0, 7), 1)].sort().at(-1)!;
  if (benefitMonth < earliest) { add("intendedBenefitDate", "BENEFIT_START_BEFORE_ELIGIBILITY"); return finish("NOT_YET_ELIGIBLE"); }
  const wageRows: Array<{ month: string; salaryRegime: "STATE" | "EMPLOYER"; adjustedBase: string }> = [];
  let converted = 0;
  for (const row of counted) {
    if (row.salaryRegime === "STATE" && row.month < "2004-10") {
      const conversion = v2 ? row.stateSalary?.pre2004Conversion : undefined;
      if (!conversion) { review.push({ path: `months.${row.month}`, code: "PRE_2004_STATE_SALARY_CONVERSION_REQUIRED" }); continue; }
      const armed = row.participantCategory === "ARTICLE_2_1_D";
      if (armed !== (conversion.scale === "ND204_ARMED_FORCES")) { review.push({ path: `months.${row.month}.stateSalary`, code: "PRE_2004_CONVERSION_SCALE_MISMATCH" }); continue; }
      if (conversion.evidence.some(e => e.confirmedOn > assessedOn)) { add(`months.${row.month}.stateSalary`, "FUTURE_EVIDENCE_CONFIRMATION"); continue; }
      converted++;
    }
    if (row.salaryRegime === "STATE" && stateCase!.firstParticipationMonth < "2016-01") {
      if (!row.stateSalary) { add(`months.${row.month}.stateSalary`, "CONTRIBUTION_COEFFICIENT_REQUIRED"); continue; }
      if (row.stateSalary.evidence.some(e => e.confirmedOn > assessedOn)) { add(`months.${row.month}.stateSalary`, "FUTURE_EVIDENCE_CONFIRMATION"); continue; }
      const coefficient = new D(row.stateSalary.totalContributionCoefficient), reference = resolve("REFERENCE_AMOUNT", "GENERAL");
      if (coefficient.lte(0)) { add(`months.${row.month}.stateSalary`, "POSITIVE_CONTRIBUTION_COEFFICIENT_REQUIRED"); continue; }
      if (coefficient.gt(20)) { review.push({ path: `months.${row.month}.stateSalary`, code: "CONTRIBUTION_CEILING_REVIEW_REQUIRED" }); continue; }
      if (reference) wageRows.push({ month: row.month, salaryRegime: "STATE", adjustedBase: coefficient.mul(reference.value).toFixed() });
    } else {
      const year = Number(row.month.slice(0, 4)), factor = resolve("WAGE_FACTOR", `${input.intendedBenefitDate.slice(0, 4)}:${year < 1995 ? "PRE_1995" : year}`);
      if (factor) wageRows.push({ month: row.month, salaryRegime: row.salaryRegime as "STATE" | "EMPLOYER", adjustedBase: new D(row.contributionBase!).mul(factor.value).toFixed() });
    }
  }
  if (missing.length || review.length) return finish(review.length ? "REVIEW_REQUIRED" : "INSUFFICIENT_DATA");
  const wage = ordinaryStateMixedAverage(stateCase!.firstParticipationMonth, wageRows);
  let average = wage.average;
  const hazardousCase = v2 && treatment === "HAZARDOUS_TRANSFER";
  const alternative = transfer !== null ? militaryTransferAverage(stateCase!.firstParticipationMonth, transfer, wageRows)
    : hazardousCase ? hazardousTransferAverage(stateCase!.firstParticipationMonth, stateCase!.hazardousWindowFrom!, wageRows) : undefined;
  if (alternative === null) { review.push({ path: "stateSalaryCase.transferMonth", code: "TRANSFER_WINDOW_INCOMPLETE" }); return finish("REVIEW_REQUIRED"); }
  if (alternative) {
    average = alternative.average;
    const label = hazardousCase ? "HAZARDOUS_WINDOW" : "BEFORE_TRANSFER";
    breakdown.push({ code: "FINAL_WINDOW_AVERAGE", value: alternative.finalAverage, unit: "VND", citationIds: ["LAW_ART72", "ND158_ART15"] },
      { code: label + "_AVERAGE", value: alternative.beforeTransferAverage, unit: "VND", citationIds: ["ND158_ART15"] },
      { code: "USED_" + label + "_AVERAGE", value: String(alternative.usedBeforeTransfer), unit: "CODE", citationIds: ["ND158_ART15"] });
  }
  if (v2) breakdown.push({ code: "CREDITED_MONTHS", value: String(counted.filter(r => r.status === "CREDITED").length), unit: "MONTHS", citationIds: ["ND158_ART34"] },
    { code: "PRE_2004_CONVERTED_MONTHS", value: String(converted), unit: "MONTHS", citationIds: ["ND158_ART15"] });
  const raw = new D(average).mul(rate).div(100);
  if (alternative === undefined) breakdown.push({ code: "STATE_WAGE_WINDOW_MONTHS", value: wage.prescribedWindowMonths === null ? null : String(wage.prescribedWindowMonths), unit: "MONTHS", citationIds: ["LAW_ART72"] },
    { code: "STATE_ADJUSTMENT_METHOD", value: stateCase!.firstParticipationMonth < "2016-01" ? "REFERENCE_COEFFICIENT" : "BENEFIT_YEAR_CPI", unit: "CODE", citationIds: ["LAW_ART73"] },
    { code: "STATE_CONTRIBUTION_MONTHS", value: String(wage.stateMonths), unit: "MONTHS", citationIds: ["TT12_ART15_16"] },
    { code: "STATE_ADJUSTED_AVERAGE", value: wage.stateAverage, unit: "VND", citationIds: ["ND158_ART15", "LAW_ART73"] },
    { code: "EMPLOYER_ADJUSTED_TOTAL", value: wage.employerAdjustedTotal, unit: "VND", citationIds: ["LAW_ART73"] },
    { code: "STATE_USED_ALL_TIME_AVERAGE", value: String(wage.usedAllStateAverage), unit: "CODE", citationIds: ["ND158_ART15"] });
  let pension = raw;
  if (counted.length >= 240 && counted.some(r => r.month < "2025-07")) {
    const floor = resolve("REFERENCE_AMOUNT", "GENERAL");
    if (!floor) return finish("INSUFFICIENT_DATA");
    pension = D.max(pension, floor.value);
    breakdown.push({ code: "TRANSITIONAL_FLOOR", value: floor.value, unit: "VND", citationIds: ["ND158_ART13", floor.citationId] });
  }
  breakdown.push({ code: "BIRTH_FOR_ASSESSMENT_ONLY", value: birthMonth + (history.birth.precision === "DAY" ? history.birth.declaredValue!.slice(7) : "-01"), unit: "DATE", citationIds: ["ND158_ART12"] },
    { code: "NORMAL_RETIREMENT_MONTH", value: retirementMonth, unit: "DATE", citationIds: ["ND135_ANNEX_I"] },
    { code: "BENEFIT_YEARS", value: benefitYears(counted.length).toFixed(), unit: "YEARS", citationIds: ["LAW_ART5"] },
    { code: "ADJUSTED_WAGE_AVERAGE", value: average, unit: "VND", citationIds: ["LAW_ART72", "LAW_ART73", "TT12_ART15_16"] },
    { code: "PENSION_RATE", value: rate, unit: "PERCENT", citationIds: ["LAW_ART66"] },
    { code: "PENSION_BEFORE_FLOOR", value: raw.toFixed(), unit: "VND", citationIds: ["LAW_ART66"] },
    { code: "DECLARED_DOCUMENT_BENEFIT_START", value: benefitMonth, unit: "DATE", citationIds: ["LAW_ART69", "TT12_ART15_16"] });
  const grant = retirementLumpSum(history.legalSex as "MALE" | "FEMALE", counted.map(r => r.month), retirementMonth, average);
  breakdown.push({ code: "LUMP_SUM_BEFORE_AGE", value: grant.beforeAmount, unit: "VND", citationIds: ["LAW_ART68", "TT12_ART14"] },
    { code: "LUMP_SUM_AFTER_AGE", value: grant.afterAmount, unit: "VND", citationIds: ["LAW_ART68", "TT12_ART14"] },
    { code: "RETIREMENT_LUMP_SUM", value: grant.total, unit: "VND", citationIds: ["LAW_ART68", "TT12_ART14"] });
  return finish("ELIGIBLE", { monthlyPension: pension.toFixed(), startMonth: benefitMonth, lumpSum: grant.total });
}
