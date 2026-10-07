import { z } from "zod";
import { digest } from "../../common/digest";
import { monthSchema } from "../../common/calendar";
import { AppError } from "../../common/errors";
import { RetirementDecimal as D } from "../retirement/engine";
import { insuranceHistorySchema, maternityCreditCitation, legalRuleDocumentSchema, pensionEstimateInputSchema, type LegalRuleDocument } from "./insurance-schema";
import { benefitYears } from "./benefit-math";
import { assessOrdinaryBenefit as assessV1, BENEFIT_ENGINE as ENGINE_V1, ORDINARY_STRATEGY as STRATEGY_V1,
  ORDINARY_BRANCH, ORDINARY_CITATIONS as CITATIONS_V1, type BenefitAssessment } from "./benefit-assessment";

export const BENEFIT_ENGINE_V2 = "vn-pension-benefit-v2";
export const ORDINARY_STRATEGY_V2 = "vn-bh1-employer-2025-v2";
export const ORDINARY_CITATIONS_V2 = [...CITATIONS_V1, "LAW_ART68", "TT12_ART14"];

/** Art68 + TT12/2025 Art14. The threshold counts actual contribution months;
 * only excess months are apportioned by normal retirement age, then each
 * statutory benefit component uses Art5(6)'s half/full-year amount convention. */
export function retirementLumpSum(sex: "MALE" | "FEMALE", paidMonths: string[], retirementMonth: string, average: string) {
  monthSchema.parse(retirementMonth);
  if (paidMonths.length > 1200 || new Set(paidMonths).size !== paidMonths.length || paidMonths.some(m => !monthSchema.safeParse(m).success) ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(average) || new D(average).gt("1e100")) throw new AppError(422, "INVALID_LUMP_SUM_INPUT", "Dữ liệu tính trợ cấp không hợp lệ.");
  const threshold = sex === "MALE" ? 420 : 360;
  const excess = [...paidMonths].sort().slice(threshold);
  const before = excess.filter(month => month <= retirementMonth).length, after = excess.length - before;
  const beforeYears = benefitYears(before), afterYears = benefitYears(after);
  const beforeAmount = new D(average).mul(beforeYears).mul("0.5"), afterAmount = new D(average).mul(afterYears).mul(2);
  return { beforeMonths: before, afterMonths: after, beforeYears: beforeYears.toFixed(), afterYears: afterYears.toFixed(),
    beforeAmount: beforeAmount.toFixed(), afterAmount: afterAmount.toFixed(), total: beforeAmount.plus(afterAmount).toFixed() };
}

/** V1 stays frozen for stored estimates. V2 reuses its monthly assessment and
 * adds the separately stated retirement grant; it never changes fund capital. */
export function assessOrdinaryBenefitV2(historyValue: unknown, inputValue: z.infer<typeof pensionEstimateInputSchema>, rulesValue: LegalRuleDocument, assessedOn: string): BenefitAssessment {
  const history = insuranceHistorySchema.parse(historyValue), input = pensionEstimateInputSchema.parse(inputValue), rules = legalRuleDocumentSchema.parse(rulesValue);
  const supported = rules.engineCode === BENEFIT_ENGINE_V2 && rules.coverage.some(c => c.branch === ORDINARY_BRANCH && c.strategyCode === ORDINARY_STRATEGY_V2);
  const numericalRules = supported ? { ...rules, engineCode: ENGINE_V1, coverage: rules.coverage.map(c => c.branch === ORDINARY_BRANCH ? { ...c, strategyCode: STRATEGY_V1 } : c) } : rules;
  // Maternity months (Law 2024 Art53(8) / Law 2014 Art39(2), BHXH-recorded base, rule set cites the applicable law) are
  // contribution time: present them to the frozen v1 arithmetic as counted months. Hashes stay bound to the ORIGINAL history.
  const citedMaternity = (row: { status: string; creditKind?: string; month: string; scheme: string }) => {
    const id = maternityCreditCitation(row); return supported && id !== null && rules.citations.some(c => c.id === id) ? id : null;
  };
  const counted = <T extends { status: string; creditKind?: string; month: string; scheme: string }>(row: T) => citedMaternity(row) ? { ...row, status: "PAID" as const, creditKind: undefined } : row;
  const numericalHistory = { ...history, months: history.months.map(counted) }, numericalInput = { ...input, futureContributions: input.futureContributions.map(counted) };
  const result = assessV1(numericalHistory, numericalInput, numericalRules, assessedOn);
  result.historyHash = digest(history);
  result.ruleHash = digest(rules);
  result.inputHash = digest({ historyHash: result.historyHash, ruleHash: result.ruleHash, input, assessedOn, engineCode: BENEFIT_ENGINE_V2 });
  if (!supported) return { ...result, assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null, lumpSum: null, startMonth: null,
    missingFields: [{ path: "legalRuleSetVersionId", code: "RULE_BRANCH_NOT_SUPPORTED" }] };
  if (result.monthlyPension === null) return result;
  const missingCitations = ["LAW_ART68", "TT12_ART14"].filter(id => !rules.citations.some(c => c.id === id));
  if (missingCitations.length) return { ...result, assessmentStatus: "REVIEW_REQUIRED", lumpSum: null,
    missingFields: [...result.missingFields, ...missingCitations.map(id => ({ path: "citations." + id, code: "LUMP_SUM_CITATION_REQUIRED" }))] };
  const retirementMonth = result.breakdown.find(r => r.code === "NORMAL_RETIREMENT_MONTH")!.value!;
  const average = result.breakdown.find(r => r.code === "ADJUSTED_WAGE_AVERAGE")!.value!;
  const paidMonths = [...numericalHistory.months.filter(r => r.month <= history.confirmedThroughMonth), ...numericalInput.futureContributions]
    .filter(r => r.month <= input.contributionStopMonth! && r.status === "PAID").map(r => r.month);
  const maternityRows = [...history.months, ...input.futureContributions].filter(r => r.month <= input.contributionStopMonth! && citedMaternity(r));
  if (maternityRows.length) result.breakdown.push({ code: "MATERNITY_CREDITED_MONTHS", value: String(maternityRows.length), unit: "MONTHS",
    citationIds: [...new Set(maternityRows.map(r => citedMaternity(r)!))].sort() });
  const grant = retirementLumpSum(history.legalSex as "MALE" | "FEMALE", paidMonths, retirementMonth, average);
  result.missingFields = result.missingFields.filter(i => i.code !== "RETIREMENT_LUMP_SUM_ASSESSMENT_REQUIRED");
  result.assessmentStatus = result.missingFields.length ? "REVIEW_REQUIRED" : "ELIGIBLE";
  result.lumpSum = grant.total;
  const citationIds = ["LAW_ART5", "LAW_ART68", "TT12_ART14"];
  result.breakdown.push(
    { code: "LUMP_SUM_EXCESS_MONTHS_BEFORE_AGE", value: String(grant.beforeMonths), unit: "MONTHS", citationIds },
    { code: "LUMP_SUM_EXCESS_MONTHS_AFTER_AGE", value: String(grant.afterMonths), unit: "MONTHS", citationIds },
    { code: "LUMP_SUM_BEFORE_AGE", value: grant.beforeAmount, unit: "VND", citationIds },
    { code: "LUMP_SUM_AFTER_AGE", value: grant.afterAmount, unit: "VND", citationIds },
    { code: "RETIREMENT_LUMP_SUM", value: grant.total, unit: "VND", citationIds });
  return result;
}
