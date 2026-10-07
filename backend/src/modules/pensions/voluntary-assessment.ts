import { z } from "zod";
import { addMonths, dateSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import { voluntaryCaseSchema, voluntaryTopUpCaseSchema, voluntaryPrepaidCaseSchema, insuranceHistorySchema, legalRuleDocumentSchema, pensionEstimateInputSchema, type LegalRuleDocument } from "./insurance-schema";
import { normalCohortAge, type BenefitAssessment } from "./benefit-assessment";
import { quoteVoluntaryTopUp, quoteVoluntaryPeriod } from "./voluntary-payment-math";
import { adjustedWageAverage } from "./benefit-math";
import { voluntaryBenefitStart, voluntaryMixedMonthlyPension, voluntaryRetirementGrant, type VoluntaryAverageInput } from "./voluntary-math";
import { ordinaryStateMixedAverage } from "./state-wage";

export const VOLUNTARY_ENGINE = "vn-pension-voluntary-v1";
export const VOLUNTARY_BRANCH = "BH2_VOLUNTARY_EMPLOYER_MIXED_NORMAL";
export const VOLUNTARY_STRATEGY = "vn-voluntary-employer-normal-2025-v1";
export const VOLUNTARY_CITATIONS = ["LAW_ART5", "LAW_ART98", "LAW_ART99", "LAW_ART100", "LAW_ART101", "LAW_ART104", "LAW_ART72", "LAW_ART73", "ND135_ANNEX_I", "ND159_ART10", "ND159_ART11", "TT11_ART5"];
export const VOLUNTARY_STATE_ENGINE = "vn-pension-voluntary-state-v1";
export const VOLUNTARY_STATE_BRANCH = "BH2_VOLUNTARY_STATE_MIXED_NORMAL";
export const VOLUNTARY_STATE_STRATEGY = "vn-voluntary-state-normal-2025-v1";
export const VOLUNTARY_STATE_CITATIONS = [...VOLUNTARY_CITATIONS, "LAW_ART31", "ND158_ART15", "TT12_ART15_16"];
export const voluntaryEstimateInputSchema = pensionEstimateInputSchema.extend({ voluntaryCase: voluntaryCaseSchema }).strict();
export const VOLUNTARY_TOP_UP_ENGINE = "vn-pension-voluntary-top-up-v1";
export const VOLUNTARY_TOP_UP_BRANCH = "BH2_VOLUNTARY_MISSING_YEARS_TOP_UP";
export const VOLUNTARY_TOP_UP_STRATEGY = "vn-voluntary-top-up-2026-v1";
export const VOLUNTARY_TOP_UP_CITATIONS = [...VOLUNTARY_STATE_CITATIONS, "LAW_ART36", "ND159_ART7", "TT11_ART5_6", "ND351_ART2", "ND07_ART3", "CV151_FUND_RATE_2026"];
export const voluntaryTopUpInputSchema = pensionEstimateInputSchema.extend({ voluntaryTopUp: voluntaryTopUpCaseSchema }).strict();
export function assessVoluntaryTopUpBenefit(history: unknown, input: z.infer<typeof voluntaryTopUpInputSchema>, rules: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  return assess(history, input, rules, assessedOn, Boolean(input.stateSalaryCase), true);
}
export const VOLUNTARY_PREPAID_ENGINE = "vn-pension-voluntary-prepaid-v1";
export const VOLUNTARY_PREPAID_BRANCH = "BH2_VOLUNTARY_PREPAID_REQUEST";
export const VOLUNTARY_PREPAID_STRATEGY = "vn-voluntary-prepaid-2026-v1";
export const VOLUNTARY_PREPAID_CITATIONS = [...VOLUNTARY_STATE_CITATIONS, "LAW_ART36", "ND159_ART6", "ND159_ART8", "TT11_ART5_3", "ND351_ART2", "ND07_ART3", "CV151_FUND_RATE_2026"];
export const voluntaryPrepaidInputSchema = pensionEstimateInputSchema.extend({ voluntaryPrepaid: voluntaryPrepaidCaseSchema }).strict();
export function assessVoluntaryPrepaidBenefit(history: unknown, input: z.infer<typeof voluntaryPrepaidInputSchema>, rules: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  return assess(history, input, rules, assessedOn, Boolean(input.stateSalaryCase), false, true);
}
type Input = z.infer<typeof voluntaryEstimateInputSchema>;

/** Pure assessment used by the version-pinned public estimate dispatcher.
 * The regular voluntary branch includes an earlier employer-salary career.
 * State salary, prepaid/top-up, early/transition cases require their own branch;
 * the caller may not label those histories REGULAR_ONLY to get a normal result. */
export function assessVoluntaryBenefit(historyValue: unknown, inputValue: Input, rulesValue: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  return assess(historyValue, inputValue, rulesValue, assessedOn, false);
}
export function assessVoluntaryStateBenefit(historyValue: unknown, inputValue: Input, rulesValue: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  return assess(historyValue, inputValue, rulesValue, assessedOn, true);
}
function assess(historyValue: unknown, inputValue: z.infer<typeof pensionEstimateInputSchema>, rulesValue: LegalRuleDocument, assessedOn: string, withState: boolean, topUpMode = false, prepaidMode = false): BenefitAssessment {
  const engineCode = prepaidMode ? VOLUNTARY_PREPAID_ENGINE : topUpMode ? VOLUNTARY_TOP_UP_ENGINE : withState ? VOLUNTARY_STATE_ENGINE : VOLUNTARY_ENGINE;
  const branch = prepaidMode ? VOLUNTARY_PREPAID_BRANCH : topUpMode ? VOLUNTARY_TOP_UP_BRANCH : withState ? VOLUNTARY_STATE_BRANCH : VOLUNTARY_BRANCH;
  const strategy = prepaidMode ? VOLUNTARY_PREPAID_STRATEGY : topUpMode ? VOLUNTARY_TOP_UP_STRATEGY : withState ? VOLUNTARY_STATE_STRATEGY : VOLUNTARY_STRATEGY;
  const requiredCitations = prepaidMode ? VOLUNTARY_PREPAID_CITATIONS : topUpMode ? VOLUNTARY_TOP_UP_CITATIONS : withState ? VOLUNTARY_STATE_CITATIONS : VOLUNTARY_CITATIONS;
  const history = insuranceHistorySchema.parse(historyValue), input = prepaidMode ? voluntaryPrepaidInputSchema.parse(inputValue) : topUpMode ? voluntaryTopUpInputSchema.parse(inputValue) : voluntaryEstimateInputSchema.parse(inputValue), rules = legalRuleDocumentSchema.parse(rulesValue);
  dateSchema.parse(assessedOn);
  const issues: BenefitAssessment["missingFields"] = [], review: BenefitAssessment["missingFields"] = [];
  const historyHash = digest(history), ruleHash = digest(rules), details = input.voluntaryCase, topUp = topUpMode ? input.voluntaryTopUp! : null, prepaid = prepaidMode ? input.voluntaryPrepaid! : null;
  const result: BenefitAssessment = { assessmentStatus: "INSUFFICIENT_DATA", estimateKind: input.futureContributions.length || input.intendedBenefitDate > assessedOn || details?.benefitStart.confirmation === "HYPOTHETICAL" || topUp?.confirmation === "HYPOTHETICAL" || prepaid?.confirmation === "HYPOTHETICAL" || prepaid?.benefitRequest.confirmation === "HYPOTHETICAL" ? "PROJECTED_SCENARIO" : "CURRENT_RULE_ESTIMATE",
    inputHash: digest({ historyHash, ruleHash, input, assessedOn, engineCode }), historyHash, ruleHash,
    countedMonths: null, monthlyPension: null, startMonth: null, lumpSum: null, missingFields: [], breakdown: [], citations: rules.citations };
  const missing = (path: string, code: string) => issues.push({ path, code });
  const unsupported = (path: string, code: string) => review.push({ path, code });
  const finish = (status?: BenefitAssessment["assessmentStatus"]) => ({ ...result, assessmentStatus: status ?? (review.length ? "REVIEW_REQUIRED" : "INSUFFICIENT_DATA"), missingFields: [...issues, ...review] });
  if (rules.engineCode !== engineCode || !rules.coverage.some(c => c.branch === branch && c.strategyCode === strategy)) unsupported("legalRuleSetVersionId", "RULE_BRANCH_NOT_SUPPORTED");
  for (const id of requiredCitations) if (!rules.citations.some(c => c.id === id && c.effectiveFrom <= input.intendedBenefitDate && (!c.effectiveTo || input.intendedBenefitDate < c.effectiveTo))) unsupported("citations." + id, "STATUTORY_CITATION_REQUIRED");
  if (input.caseDetails || (!withState && input.stateSalaryCase) || (topUpMode || prepaidMode ? !!details : !!input.voluntaryTopUp) || (prepaidMode ? !!input.voluntaryTopUp : !!input.voluntaryPrepaid)) unsupported("voluntaryCase", "MIXED_ASSESSMENT_CASES");
  const stateCase = input.stateSalaryCase;
  if (withState) {
    if (!stateCase) missing("stateSalaryCase", "STATE_SALARY_CASE_REQUIRED");
    else {
      if (stateCase.salaryTreatment !== "ORDINARY") unsupported("stateSalaryCase", "SPECIAL_STATE_SALARY_ASSESSMENT_REQUIRED");
      if (stateCase.firstParticipationMonth < history.coverageFrom || stateCase.firstParticipationMonth > history.coverageThrough) missing("stateSalaryCase", "FIRST_PARTICIPATION_OUTSIDE_HISTORY");
      if ([...stateCase.firstParticipationEvidence, ...stateCase.treatmentEvidence].some(e => e.confirmedOn > assessedOn)) missing("stateSalaryCase", "FUTURE_EVIDENCE_CONFIRMATION");
    }
  }
  if (history.specialPeriods.length) unsupported("specialPeriods", "SPECIAL_CASE_ASSESSMENT_REQUIRED");
  if (history.birth.precision === "UNKNOWN") missing("birth", "BIRTH_REQUIRED");
  if (history.legalSex === "UNKNOWN") missing("legalSex", "LEGAL_SEX_REQUIRED");
  if (!input.contributionStopMonth) missing("contributionStopMonth", "CONTRIBUTION_STOP_REQUIRED");
  if (history.confirmedThroughMonth > assessedOn.slice(0, 7)) missing("confirmedThroughMonth", "FUTURE_HISTORY_CONFIRMATION");
  const all = [...history.months, ...input.futureContributions];
  if ([...all, ...(details ? [details.benefitStart] : []), ...(topUp ? [topUp] : []), ...(prepaid ? [prepaid, prepaid.benefitRequest, ...(prepaid.refundSupport ? [prepaid.refundSupport] : [])] : [])].some(r => r.evidence.some(e => e.confirmedOn > assessedOn))) missing("evidence", "FUTURE_EVIDENCE_CONFIRMATION");
  if (!input.intendedBenefitDate.endsWith("-01") || input.intendedBenefitDate < "2025-07-01") unsupported("intendedBenefitDate", "BENEFIT_DATE_OUTSIDE_SUPPORTED_RULE");
  if (issues.length || review.length) return finish();
  const stop = input.contributionStopMonth!, benefitMonth = input.intendedBenefitDate.slice(0, 7);
  if (stop >= benefitMonth || stop < history.coverageFrom || addMonths(history.coverageFrom, 1199) < stop) missing("contributionStopMonth", "ASSESSMENT_HORIZON_INVALID");
  if (details && details.benefitStart.month !== benefitMonth) missing("voluntaryCase.benefitStart.month", "BENEFIT_DOCUMENT_MONTH_MISMATCH");
  const prepaidEnd = prepaid ? addMonths(prepaid.periodStartMonth, prepaid.periodMonths - 1) : null;
  if (prepaid) {
    const paidMonth = prepaid.paymentOn.slice(0, 7), registeredMonth = prepaid.registeredOn.slice(0, 7);
    const deadlineOffset = prepaid.periodMonths === 3 ? 2 : prepaid.periodMonths === 6 ? 3 : prepaid.periodMonths === 12 ? 6 : 0;
    if (registeredMonth !== prepaid.periodStartMonth || prepaid.registeredOn > prepaid.paymentOn || paidMonth < prepaid.periodStartMonth || paidMonth > addMonths(prepaid.periodStartMonth, deadlineOffset) ||
      (prepaid.periodMonths > 12 && prepaid.paymentOn !== prepaid.registeredOn)) missing("voluntaryPrepaid.paymentOn", "PREPAID_PAYMENT_WINDOW_INVALID");
    if (prepaid.paymentOn < "2026-01-01" || prepaid.paymentOn >= "2027-01-01") unsupported("voluntaryPrepaid.paymentOn", "PAYMENT_YEAR_NOT_SUPPORTED");
    if (stop !== addMonths(benefitMonth, -1) || stop < prepaid.periodStartMonth || stop > prepaidEnd! || paidMonth > stop || prepaid.periodStartMonth < history.coverageFrom) missing("contributionStopMonth", "PREPAID_BENEFIT_PERIOD_INVALID");
    if (!input.benefitRequestDate) missing("benefitRequestDate", "PREPAID_BENEFIT_REQUEST_REQUIRED");
    if (input.benefitRequestDate && (input.benefitRequestDate < prepaid.paymentOn || input.benefitRequestDate.slice(0, 7) > prepaidEnd!)) missing("benefitRequestDate", "PREPAID_REQUEST_OUTSIDE_PAID_PERIOD");
    if (prepaid.confirmation === "DOCUMENTED_FULLY_PAID" && (prepaid.paymentOn > assessedOn || prepaid.evidence.some(e => e.confirmedOn < prepaid.paymentOn))) missing("voluntaryPrepaid.evidence", "FULL_PAYMENT_EVIDENCE_REQUIRED");
    if (prepaid.benefitRequest.confirmation === "DOCUMENTED" && input.benefitRequestDate && (input.benefitRequestDate > assessedOn || prepaid.benefitRequest.evidence.some(e => e.confirmedOn < input.benefitRequestDate!))) missing("voluntaryPrepaid.benefitRequest", "BENEFIT_REQUEST_EVIDENCE_REQUIRED");
    if (prepaid.refundSupport?.evidence.some(e => e.confirmedOn < prepaid.paymentOn)) missing("voluntaryPrepaid.refundSupport", "REFUND_SUPPORT_EVIDENCE_REQUIRED");
    if (input.employmentEndDate && input.employmentEndDate.slice(0, 7) >= prepaid.periodStartMonth) missing("employmentEndDate", "COMPULSORY_OVERLAPS_PREPAID_PERIOD");
    if (issues.length || review.length) return finish();
  }
  const combined = new Map<string, typeof history.months[number]>(), seen = new Set<string>();
  for (const row of history.months) {
    if (seen.has(row.month)) missing("months", "DUPLICATE_CONTRIBUTION_MONTH"); seen.add(row.month);
    if (row.month < history.coverageFrom || row.month > history.coverageThrough) missing("months", "MONTH_OUTSIDE_COVERAGE");
    if (row.month > stop && ["PAID", "CREDITED"].includes(row.status)) missing("contributionStopMonth", "PAID_MONTH_AFTER_DECLARED_STOP");
    if (row.month > history.confirmedThroughMonth && row.status !== "UNKNOWN") missing("months", "FUTURE_HISTORY_MUST_BE_SEPARATE_SCENARIO");
    if (row.month <= history.confirmedThroughMonth) combined.set(row.month, row);
  }
  const futureSeen = new Set<string>();
  for (const row of input.futureContributions) {
    if (row.month <= history.confirmedThroughMonth || row.month > stop || futureSeen.has(row.month)) missing("futureContributions", "FUTURE_CONTRIBUTION_INTERVAL_INVALID");
    futureSeen.add(row.month); combined.set(row.month, row);
  }
  if (prepaid) {
    for (const row of input.futureContributions) if (row.month >= prepaid.periodStartMonth && row.month <= prepaidEnd!) missing("futureContributions", "PREPAID_OVERLAPS_FUTURE_CONTRIBUTIONS");
    // Derive only the covered calendar months through the benefit cutoff. Never
    // persist generated PAID rows or count the unused future part of the period.
    for (let month = prepaid.periodStartMonth; month <= stop; month = addMonths(month, 1)) {
      const existing = combined.get(month);
      if (existing && existing.status !== "UNKNOWN") {
        if (existing.status !== "PAID" || existing.scheme !== "VOLUNTARY" || existing.salaryRegime !== "VOLUNTARY_INCOME" ||
          !existing.contributionBase || !new D(existing.contributionBase).eq(prepaid.monthlyIncome)) missing("months." + month, "PREPAID_HISTORY_CONFLICT");
      } else combined.set(month, { month, scheme: "VOLUNTARY", salaryRegime: "VOLUNTARY_INCOME", status: "PAID", contributionBase: prepaid.monthlyIncome, evidence: prepaid.evidence });
    }
  }
  if (issues.length) return finish();
  const counted: typeof history.months = [];
  for (let month = history.coverageFrom; month <= stop; month = addMonths(month, 1)) {
    const row = combined.get(month), path = "months." + month;
    if (!row || row.status === "UNKNOWN") { missing(path, "UNKNOWN_CONTRIBUTION_MONTH"); continue; }
    if (!row.evidence.length) missing(path, "CONTRIBUTION_EVIDENCE_REQUIRED");
    if (["NOT_CONTRIBUTED", "WITHDRAWN"].includes(row.status)) continue;
    if (row.status === "CREDITED") unsupported(path, "CREDITED_MONTH_ASSESSMENT_REQUIRED");
    if (row.contributionBase === null || new D(row.contributionBase).lte(0)) missing(path, "POSITIVE_CONTRIBUTION_BASE_REQUIRED");
    if (row.scheme === "VOLUNTARY" && row.salaryRegime === "VOLUNTARY_INCOME") {
      if (row.month < "2008-01") unsupported(path, "VOLUNTARY_MONTH_BEFORE_SCHEME_START");
    } else if (row.scheme !== "COMPULSORY" || !(withState ? ["EMPLOYER", "STATE"].includes(row.salaryRegime) && ["ARTICLE_2_1_A", "ARTICLE_2_1_B"].includes(row.participantCategory ?? "") : row.salaryRegime === "EMPLOYER" && row.participantCategory === "ARTICLE_2_1_A")) unsupported(path, "DIFFERENT_INSURANCE_BRANCH_REQUIRED");
    counted.push(row);
  }
  const voluntary = counted.filter(r => r.scheme === "VOLUNTARY"), compulsory = counted.filter(r => r.scheme === "COMPULSORY");
  if (withState && stateCase) {
    if (!compulsory.some(r => r.salaryRegime === "STATE")) missing("months", "STATE_SALARY_MONTH_REQUIRED");
    const participated = history.months.filter(r => ["PAID", "CREDITED", "WITHDRAWN"].includes(r.status));
    if (!participated.some(r => r.month === stateCase.firstParticipationMonth)) missing("stateSalaryCase", "FIRST_PARTICIPATION_EVIDENCE_MONTH_REQUIRED");
    if ([...participated, ...counted].some(r => r.month < stateCase.firstParticipationMonth)) missing("stateSalaryCase", "EARLIER_PARTICIPATION_IN_HISTORY");
  }
  if (!topUp && !voluntary.length) missing("months", "VOLUNTARY_MONTH_REQUIRED");
  if (!topUp && counted.at(-1)?.scheme !== "VOLUNTARY") unsupported("months", "VOLUNTARY_PARTICIPATION_AT_RETIREMENT_REQUIRED");
  if (compulsory.length && (!input.employmentEndDate || input.employmentEndDate.slice(0, 7) < compulsory.at(-1)!.month || input.employmentEndDate >= input.intendedBenefitDate)) missing("employmentEndDate", "COMPULSORY_EMPLOYMENT_END_REQUIRED");
  if (issues.length || review.length) return finish();
  result.countedMonths = counted.length;
  if (!topUp && counted.length < 180) { missing("months", "MINIMUM_180_MONTHS_NOT_MET"); return finish("NOT_YET_ELIGIBLE"); }
  const sex = history.legalSex as "MALE" | "FEMALE", birth = history.birth.precision === "YEAR" ? history.birth.declaredValue! + "-01" : history.birth.declaredValue!.slice(0, 7);
  const age = normalCohortAge(sex, birth);
  if (age === null) { unsupported("birth", "HISTORICAL_BIRTH_COHORT_REVIEW_REQUIRED"); return finish(); }
  const resolve = (kind: LegalRuleDocument["tables"][number]["kind"], key: string, on = input.intendedBenefitDate) => {
    const found = rules.tables.filter(t => t.kind === kind && t.key === key && t.effectiveFrom <= on && (!t.effectiveTo || on < t.effectiveTo));
    if (found.length !== 1) { missing(`tables.${kind}.${key}`, found.length ? "RULE_TABLE_AMBIGUOUS" : "RULE_TABLE_REQUIRED"); return null; }
    if (!rules.citations.some(c => c.id === found[0].citationId && c.effectiveFrom <= on && (!c.effectiveTo || on < c.effectiveTo))) {
      missing(`tables.${kind}.${key}`, "TABLE_CITATION_MISSING_OR_INACTIVE"); return null;
    }
    return found[0].value;
  };
  let prepaidQuote: ReturnType<typeof quoteVoluntaryPeriod> | null = null;
  if (prepaid) {
    const minimum = resolve("REFERENCE_AMOUNT", "VOLUNTARY_MIN_INCOME", prepaid.paymentOn), reference = resolve("REFERENCE_AMOUNT", "GENERAL", prepaid.paymentOn);
    const fundRate = prepaid.periodMonths <= 12 ? "0" : resolve("FUND_MONTHLY_RATE", prepaid.paymentOn.slice(0, 4), prepaid.paymentOn);
    if (minimum && reference && (new D(prepaid.monthlyIncome).lt(minimum) || new D(prepaid.monthlyIncome).gt(new D(reference).mul(20)))) missing("voluntaryPrepaid.monthlyIncome", "PAYMENT_INCOME_OUTSIDE_LIMITS");
    if (fundRate !== null && (new D(fundRate).lt(0) || new D(fundRate).gt(100))) unsupported("tables.FUND_MONTHLY_RATE", "FUND_RATE_REVIEW_REQUIRED");
    if (issues.length || review.length) return finish();
    const usedMonths = (Number(stop.slice(0, 4)) - Number(prepaid.periodStartMonth.slice(0, 4))) * 12 + Number(stop.slice(5)) - Number(prepaid.periodStartMonth.slice(5)) + 1;
    const gross = quoteVoluntaryPeriod({ monthlyIncome: prepaid.monthlyIncome, fundMonthlyRatePercent: fundRate!, periodMonths: prepaid.periodMonths, usedMonths, stateSupportToExclude: null });
    if (prepaid.refundSupport && new D(prepaid.refundSupport.stateSupportToExclude).gt(gross.grossRemaining)) { missing("voluntaryPrepaid.refundSupport", "REFUND_SUPPORT_EXCEEDS_REMAINING_PAYMENT"); return finish(); }
    prepaidQuote = quoteVoluntaryPeriod({ monthlyIncome: prepaid.monthlyIncome, fundMonthlyRatePercent: fundRate!, periodMonths: prepaid.periodMonths, usedMonths, stateSupportToExclude: prepaid.refundSupport?.stateSupportToExclude ?? null });
  }
  const statedAge = resolve("AGE_MONTHS", `NORMAL:${sex}:${birth}`);
  if (statedAge === null) return finish();
  if (!new D(statedAge).eq(age)) { unsupported("tables.AGE_MONTHS", "AGE_TABLE_REVIEW_REQUIRED"); return finish(); }
  const retirementAgeMonth = addMonths(birth, age), eligibilityMonth = [retirementAgeMonth, topUp ? topUp.paymentOn.slice(0, 7) : counted[179].month].sort().at(-1)!;
  let topUpQuote: ReturnType<typeof quoteVoluntaryTopUp> | null = null;
  if (topUp) {
    if (counted.length < 120 || counted.length >= 180 || counted.length + topUp.missingMonths !== 180) missing("voluntaryTopUp.missingMonths", "TOP_UP_MUST_COMPLETE_180_MONTHS");
    if (topUp.paymentOn < "2026-01-01" || topUp.paymentOn >= "2027-01-01") unsupported("voluntaryTopUp.paymentOn", "PAYMENT_YEAR_NOT_SUPPORTED");
    if (topUp.paymentOn.slice(0, 7) < retirementAgeMonth) missing("voluntaryTopUp.paymentOn", "TOP_UP_BEFORE_AGE_ELIGIBILITY");
    // A month-only birthday cannot establish the exact eligibility day inside
    // that month. Require evidence with day precision or a later payment month.
    if (topUp.paymentOn.slice(0, 7) === retirementAgeMonth && history.birth.precision === "MONTH") missing("birth", "BIRTH_DAY_REQUIRED_FOR_PAYMENT_MONTH");
    if (history.birth.precision === "DAY") {
      const lastDay = new Date(addMonths(retirementAgeMonth, 1) + "-01T00:00:00Z"); lastDay.setUTCDate(0);
      const day = Math.min(Number(history.birth.declaredValue!.slice(8, 10)), lastDay.getUTCDate());
      if (topUp.paymentOn < retirementAgeMonth + "-" + String(day).padStart(2, "0")) missing("voluntaryTopUp.paymentOn", "TOP_UP_BEFORE_AGE_ELIGIBILITY");
    }
    if (stop > topUp.paymentOn.slice(0, 7) || (input.employmentEndDate && input.employmentEndDate > topUp.paymentOn)) missing("voluntaryTopUp.paymentOn", "TOP_UP_BEFORE_CONTRIBUTION_STOP");
    if (topUp.confirmation === "DOCUMENTED_FULLY_PAID" && (topUp.paymentOn > assessedOn || input.futureContributions.length || topUp.evidence.some(e => e.confirmedOn < topUp.paymentOn))) missing("voluntaryTopUp.evidence", "FULL_PAYMENT_EVIDENCE_REQUIRED");
    const fundRate = resolve("FUND_MONTHLY_RATE", topUp.paymentOn.slice(0, 4), topUp.paymentOn);
    const minimum = resolve("REFERENCE_AMOUNT", "VOLUNTARY_MIN_INCOME", topUp.paymentOn), reference = resolve("REFERENCE_AMOUNT", "GENERAL", topUp.paymentOn);
    if (minimum && reference && (new D(topUp.monthlyIncome).lt(minimum) || new D(topUp.monthlyIncome).gt(new D(reference).mul(20)))) missing("voluntaryTopUp.monthlyIncome", "PAYMENT_INCOME_OUTSIDE_LIMITS");
    if (fundRate !== null && (new D(fundRate).lt(0) || new D(fundRate).gt(100))) unsupported("tables.FUND_MONTHLY_RATE", "FUND_RATE_REVIEW_REQUIRED");
    if (issues.length || review.length) return finish();
    topUpQuote = quoteVoluntaryTopUp({ monthlyIncome: topUp.monthlyIncome, fundMonthlyRatePercent: fundRate!, monthsAlreadyCounted: counted.length,
      missingMonths: topUp.missingMonths, normalRetirementMonth: retirementAgeMonth, paidOn: topUp.paymentOn });
  }
  if (benefitMonth <= eligibilityMonth) { missing("intendedBenefitDate", "ELIGIBILITY_NOT_MET_AT_BENEFIT_START"); return finish("NOT_YET_ELIGIBLE"); }
  const lastContributionMonth = counted.at(-1)!.month;
  if (!topUp && !prepaid && eligibilityMonth < "2025-07" && lastContributionMonth < "2025-07") { unsupported("voluntaryCase", "VOLUNTARY_TRANSITION_ASSESSMENT_REQUIRED"); return finish(); }
  if (stop !== lastContributionMonth) missing("contributionStopMonth", "STOP_MUST_MATCH_LAST_CONTRIBUTION");
  if (!topUp && !prepaid && lastContributionMonth > eligibilityMonth && details!.benefitStart.kind !== "CONTINUED_CONTRIBUTIONS") missing("voluntaryCase.benefitStart", "CONTINUED_CONTRIBUTION_CASE_REQUIRED");
  if (!topUp && !prepaid && details!.benefitStart.kind === "CONTINUED_CONTRIBUTIONS" && (lastContributionMonth <= eligibilityMonth || !input.benefitRequestDate)) missing("benefitRequestDate", "CONTINUED_CONTRIBUTION_REQUEST_REQUIRED");
  if (issues.length) return finish();
  const start = voluntaryBenefitStart(prepaid ? { kind: "PREPAID_REQUEST", eligibilityMonth, prepaidThroughMonth: prepaidEnd!, requestDate: input.benefitRequestDate! } : topUp ? { kind: "MISSING_YEARS_TOP_UP", eligibilityMonth, fullyPaidOn: topUp.paymentOn } : details!.benefitStart.kind === "ELIGIBILITY" ? { kind: "ELIGIBILITY", eligibilityMonth, lastContributionMonth }
    : { kind: "CONTINUED_CONTRIBUTIONS", eligibilityMonth, lastContributionMonth, requestDate: input.benefitRequestDate! });
  if (start.month !== benefitMonth) { missing("intendedBenefitDate", "VOLUNTARY_BENEFIT_START_MISMATCH"); return finish(); }
  const voluntaryRows: VoluntaryAverageInput["voluntary"] = [], wageRows: Array<{ base: string; factor: string }> = [];
  const stateWageRows: Array<{ month: string; salaryRegime: "STATE" | "EMPLOYER"; adjustedBase: string }> = [];
  for (const row of counted) {
    if (withState && row.salaryRegime === "STATE") {
      if (row.month < "2004-10") { unsupported(`months.${row.month}`, "PRE_2004_STATE_SALARY_CONVERSION_REQUIRED"); continue; }
      if (stateCase!.firstParticipationMonth < "2016-01") {
        if (!row.stateSalary) { missing(`months.${row.month}.stateSalary`, "CONTRIBUTION_COEFFICIENT_REQUIRED"); continue; }
        if (row.stateSalary.evidence.some(e => e.confirmedOn > assessedOn)) { missing(`months.${row.month}.stateSalary`, "FUTURE_EVIDENCE_CONFIRMATION"); continue; }
        const coefficient = new D(row.stateSalary.totalContributionCoefficient);
        if (coefficient.lte(0)) { missing(`months.${row.month}.stateSalary`, "POSITIVE_CONTRIBUTION_COEFFICIENT_REQUIRED"); continue; }
        if (coefficient.gt(20)) { unsupported(`months.${row.month}.stateSalary`, "CONTRIBUTION_CEILING_REVIEW_REQUIRED"); continue; }
        const reference = resolve("REFERENCE_AMOUNT", "GENERAL");
        if (reference) stateWageRows.push({ month: row.month, salaryRegime: "STATE", adjustedBase: coefficient.mul(reference).toFixed() });
        continue;
      }
    }
    const isVoluntary = row.scheme === "VOLUNTARY", year = row.month.slice(0, 4), factor = resolve(isVoluntary ? "INCOME_FACTOR" : "WAGE_FACTOR", `${input.intendedBenefitDate.slice(0, 4)}:${!isVoluntary && Number(year) < 1995 ? "PRE_1995" : year}`);
    if (factor === null) continue;
    if (new D(factor).lte(0) || (isVoluntary && (new D(factor).lt(1) || new D(factor).decimalPlaces() > 2))) { unsupported("tables", "VOLUNTARY_FACTOR_REVIEW_REQUIRED"); continue; }
    if (isVoluntary) voluntaryRows.push({ month: row.month, contributionBase: row.contributionBase!, adjustment: { kind: "ANNUAL_FACTOR", factor } });
    else if (withState) stateWageRows.push({ month: row.month, salaryRegime: row.salaryRegime as "STATE" | "EMPLOYER", adjustedBase: new D(row.contributionBase!).mul(factor).toFixed() });
    else wageRows.push({ base: row.contributionBase!, factor });
  }
  const floor = compulsory.length >= 240 && compulsory.some(r => r.month < "2025-07") ? resolve("REFERENCE_AMOUNT", "GENERAL") : null;
  if (issues.length || review.length) return finish();
  const stateAverage = withState ? ordinaryStateMixedAverage(stateCase!.firstParticipationMonth, stateWageRows) : null;
  const regularPension = () => voluntaryMixedMonthlyPension({ compulsory: compulsory.length ? { adjustedAverage: stateAverage?.average ?? adjustedWageAverage(wageRows), months: compulsory.map(r => ({ month: r.month, participantCategory: r.participantCategory as "ARTICLE_2_1_A" | "ARTICLE_2_1_B" })) } : null, voluntary: voluntaryRows }, sex, floor);
  // Settlement months have no invented calendar dates and factor exactly1.
  const topUpAverage = topUp ? new D(stateAverage?.average ?? (wageRows.length ? adjustedWageAverage(wageRows) : "0")).mul(compulsory.length)
    .plus(voluntaryRows.reduce((sum, r) => sum.plus(new D(r.contributionBase).mul(r.adjustment.kind === "ANNUAL_FACTOR" ? r.adjustment.factor : 1)), new D(0)))
    .plus(new D(topUp.monthlyIncome).mul(topUp.missingMonths)).div(180) : null;
  const pension = topUpAverage ? { combinedAverage: topUpAverage.toFixed(), rate: sex === "MALE" ? "40" : "45", floorApplies: false,
    monthlyPension: topUpAverage.mul(sex === "MALE" ? "0.40" : "0.45").toFixed() } : regularPension();
  const grant = topUp ? { total: "0" } : voluntaryRetirementGrant(sex, counted.map(r => r.month), retirementAgeMonth, pension.combinedAverage);
  result.monthlyPension = pension.monthlyPension; result.startMonth = start.month; result.lumpSum = grant.total;
  if (stateAverage) result.breakdown.push(
    { code: "STATE_WAGE_WINDOW_MONTHS", value: stateAverage.prescribedWindowMonths === null ? null : String(stateAverage.prescribedWindowMonths), unit: "MONTHS", citationIds: ["LAW_ART72"] },
    { code: "STATE_CONTRIBUTION_MONTHS", value: String(stateAverage.stateMonths), unit: "MONTHS", citationIds: ["ND158_ART15"] },
    { code: "STATE_ADJUSTED_AVERAGE", value: stateAverage.stateAverage, unit: "VND", citationIds: ["LAW_ART73", "ND158_ART15"] },
    { code: "COMPULSORY_ADJUSTED_AVERAGE", value: stateAverage.average, unit: "VND", citationIds: ["LAW_ART72", "TT12_ART15_16"] });
  result.breakdown.push(
    { code: "COMPULSORY_MONTHS", value: String(compulsory.length), unit: "MONTHS", citationIds: ["ND159_ART11"] },
    { code: "VOLUNTARY_MONTHS", value: String(voluntary.length), unit: "MONTHS", citationIds: ["LAW_ART98"] },
    { code: "COMBINED_ADJUSTED_AVERAGE", value: pension.combinedAverage, unit: "VND", citationIds: ["ND159_ART10", "ND159_ART11", "LAW_ART104"] },
    { code: "NORMAL_RETIREMENT_MONTH", value: retirementAgeMonth, unit: "DATE", citationIds: ["ND135_ANNEX_I"] },
    { code: "ELIGIBILITY_MONTH", value: eligibilityMonth, unit: "DATE", citationIds: ["LAW_ART98"] },
    { code: "PENSION_RATE", value: pension.rate, unit: "PERCENT", citationIds: ["LAW_ART99"] },
    { code: "TRANSITIONAL_FLOOR_APPLIED", value: String(pension.floorApplies), unit: "CODE", citationIds: ["ND159_ART11"] },
    { code: "BENEFIT_START_CLAUSE", value: start.citationId, unit: "CODE", citationIds: ["TT11_ART5"] },
    { code: "RETIREMENT_LUMP_SUM", value: grant.total, unit: "VND", citationIds: ["LAW_ART100"] });
  if (prepaid && prepaidQuote) result.breakdown.push(
    { code: "PREPAID_PERIOD_MONTHS", value: String(prepaid.periodMonths), unit: "MONTHS", citationIds: ["LAW_ART36"] },
    { code: "PREPAID_USED_MONTHS", value: String(prepaid.periodMonths - prepaidQuote.remainingMonths), unit: "MONTHS", citationIds: ["TT11_ART5_3"] },
    { code: "PREPAID_REMAINING_MONTHS", value: String(prepaidQuote.remainingMonths), unit: "MONTHS", citationIds: ["ND159_ART8"] },
    { code: "PREPAID_GROSS_CONTRIBUTION", value: prepaidQuote.grossContribution, unit: "VND", citationIds: ["LAW_ART36", "ND159_ART6"] },
    { code: "PREPAID_REFUND_GROSS", value: prepaidQuote.grossRemaining, unit: "VND", citationIds: ["ND159_ART8"] },
    { code: "PREPAID_REFUND_SUPPORT_EXCLUDED", value: prepaid.refundSupport?.stateSupportToExclude ?? null, unit: "VND", citationIds: ["ND159_ART8"] },
    { code: "PREPAID_REFUND_ESTIMATE", value: prepaidQuote.refundAmount, unit: "VND", citationIds: ["ND159_ART8"] },
    { code: "PREPAID_REFUND_STATUS", value: prepaidQuote.refundStatus, unit: "CODE", citationIds: ["ND159_ART8"] },
    { code: "PREPAID_PAYMENT_STATUS", value: prepaid.confirmation, unit: "CODE", citationIds: ["LAW_ART36"] });
  if (topUp && topUpQuote) {
    result.countedMonths = 180;
    result.breakdown.push(
      { code: "REGULAR_COUNTED_MONTHS", value: String(counted.length), unit: "MONTHS", citationIds: ["ND159_ART7"] },
      { code: "TOP_UP_MONTHS", value: String(topUp.missingMonths), unit: "MONTHS", citationIds: ["ND159_ART7"] },
      { code: "TOP_UP_ADJUSTMENT_FACTOR", value: "1", unit: "CODE", citationIds: ["ND159_ART10"] },
      { code: "TOP_UP_GROSS_CONTRIBUTION", value: topUpQuote.grossContribution, unit: "VND", citationIds: ["ND159_ART7", "CV151_FUND_RATE_2026"] },
      { code: "TOP_UP_PAYMENT_STATUS", value: topUp.confirmation, unit: "CODE", citationIds: ["TT11_ART5_6"] },
      { code: "TOP_UP_QUOTE_BASIS", value: "BEFORE_SUPPORT_AND_COLLECTION_ROUNDING", unit: "CODE", citationIds: ["ND159_ART7"] });
  }
  return finish("ELIGIBLE");
}
