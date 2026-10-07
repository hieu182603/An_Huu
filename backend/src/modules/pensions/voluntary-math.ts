import { z } from "zod";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { benefitYears, ordinaryPensionRate } from "./benefit-math";

// Internal numerical rules only. The assessment layer must first validate the
// owner's complete history, eligibility, evidence, and the published rule set.
// No function in this file accepts an estimate for publication or edits a plan.
const decimal = z.string().max(160).regex(/^(0|[1-9]\d*)(\.\d+)?$/).refine(v => new D(v).lte("1e100"));
const positive = decimal.refine(v => new D(v).gt(0));
const compulsoryMonth = z.object({ month: monthSchema, participantCategory: z.enum([
  "ARTICLE_2_1_A", "ARTICLE_2_1_B", "ARTICLE_2_1_C", "ARTICLE_2_1_D", "ARTICLE_2_1_DD", "ARTICLE_2_1_G", "ARTICLE_2_1_I", "OTHER",
]) }).strict();
const incomeMonth = z.object({ month: monthSchema, contributionBase: positive, adjustment: z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ANNUAL_FACTOR"), factor: positive }).strict(),
  // ND159 Art10(3): a confirmed Art7 missing-years payment has coefficient 1,
  // not the historical calendar-year coefficient or the investment return.
  z.object({ kind: z.literal("MISSING_YEARS_TOP_UP") }).strict(),
]) }).strict();
export const voluntaryAverageInputSchema = z.object({
  compulsory: z.object({ adjustedAverage: positive, months: z.array(compulsoryMonth).min(1).max(1200) }).strict().nullable(),
  voluntary: z.array(incomeMonth).min(1).max(1200),
}).strict();
export type VoluntaryAverageInput = z.infer<typeof voluntaryAverageInputSchema>;
const fail = (code: string): never => { throw new AppError(422, code, "Cần rà soát lịch đóng và căn cứ BHXH tự nguyện/hỗn hợp."); };

/** ND159 Art10–11 / Law Art104. The compulsory average is already calculated
 * under Art72–73 (including its state-salary window); never average two averages
 * with equal weights or apply a state window to voluntary income. */
export function voluntaryMixedAverage(value: VoluntaryAverageInput) {
  const input = voluntaryAverageInputSchema.parse(value), compulsory = input.compulsory?.months ?? [];
  const months = [...compulsory.map(r => r.month), ...input.voluntary.map(r => r.month)];
  if (months.length > 1200 || new Set(months).size !== months.length) fail("DUPLICATE_OR_EXCESS_INSURANCE_MONTHS");
  let voluntaryTotal = new D(0);
  for (const row of input.voluntary) {
    if (row.month < "2008-01") fail("VOLUNTARY_MONTH_BEFORE_SCHEME_START");
    const factor = row.adjustment.kind === "MISSING_YEARS_TOP_UP" ? new D(1) : new D(row.adjustment.factor);
    if (factor.lt(1) || factor.decimalPlaces() > 2) fail("VOLUNTARY_FACTOR_REVIEW_REQUIRED");
    voluntaryTotal = voluntaryTotal.plus(new D(row.contributionBase).mul(factor));
  }
  const compulsoryTotal = new D(input.compulsory?.adjustedAverage ?? "0").mul(compulsory.length);
  return { compulsoryMonths: compulsory.length, voluntaryMonths: input.voluntary.length, totalMonths: months.length,
    compulsoryAdjustedTotal: compulsoryTotal.toFixed(), voluntaryAdjustedTotal: voluntaryTotal.toFixed(),
    voluntaryAverage: voluntaryTotal.div(input.voluntary.length).toFixed(),
    combinedAverage: compulsoryTotal.plus(voluntaryTotal).div(months.length).toFixed() };
}

/** ND159 Art11(3): the floor tests qualifying COMPULSORY months, not combined
 * months. A purely voluntary career never gains this floor from 20 total years. */
export function voluntaryMixedMonthlyPension(value: VoluntaryAverageInput, sex: "MALE" | "FEMALE", referenceAmount: string | null) {
  z.enum(["MALE", "FEMALE"]).parse(sex);
  const input = voluntaryAverageInputSchema.parse(value), average = voluntaryMixedAverage(input);
  const rate = ordinaryPensionRate(sex, average.totalMonths); // Art99(1) has the same numerical rate bands as Art66(1).
  const qualifying = (input.compulsory?.months ?? []).filter(r => r.participantCategory !== "OTHER");
  const floorApplies = qualifying.length >= 240 && qualifying.some(r => r.month < "2025-07");
  if (rate === null) return { ...average, rate: null, beforeFloor: null, floorApplies: false, monthlyPension: null, eligibleMonths: false };
  if (floorApplies && referenceAmount === null) fail("REFERENCE_AMOUNT_REQUIRED");
  if (referenceAmount !== null) positive.parse(referenceAmount);
  const raw = new D(average.combinedAverage).mul(rate).div(100);
  return { ...average, rate, beforeFloor: raw.toFixed(), floorApplies,
    monthlyPension: (floorApplies ? D.max(raw, referenceAmount!) : raw).toFixed(), eligibleMonths: true };
}

const startBase = { eligibilityMonth: monthSchema };
export const voluntaryStartInputSchema = z.discriminatedUnion("kind", [
  z.object({ ...startBase, kind: z.literal("ELIGIBILITY"), lastContributionMonth: monthSchema }).strict(),
  z.object({ ...startBase, kind: z.literal("CONTINUED_CONTRIBUTIONS"), lastContributionMonth: monthSchema, requestDate: dateSchema }).strict(),
  z.object({ ...startBase, kind: z.literal("PREPAID_REQUEST"), prepaidThroughMonth: monthSchema, requestDate: dateSchema }).strict(),
  z.object({ ...startBase, kind: z.literal("MISSING_YEARS_TOP_UP"), fullyPaidOn: dateSchema }).strict(),
  z.object({ ...startBase, kind: z.literal("TRANSITION_2025"), lastContributionMonth: monthSchema }).strict(),
]);
export type VoluntaryStartInput = z.infer<typeof voluntaryStartInputSchema>;

/** Law Art101 / TT11 Art5. Eligibility is assessed BEFORE entering this helper,
 * including the applicable age and unrounded contribution-month threshold. */
export function voluntaryBenefitStart(value: VoluntaryStartInput) {
  const input = voluntaryStartInputSchema.parse(value);
  let month: string, clause: string;
  if (input.kind === "TRANSITION_2025") {
    if (input.eligibilityMonth >= "2025-07" || input.lastContributionMonth >= "2025-07") fail("VOLUNTARY_TRANSITION_CONDITIONS_NOT_MET");
    month = "2025-07"; clause = "TT11_ART5_4_5";
  } else if (input.kind === "ELIGIBILITY") {
    if (input.lastContributionMonth > input.eligibilityMonth) fail("CONTINUED_CONTRIBUTION_CASE_REQUIRED");
    month = addMonths(input.eligibilityMonth, 1); clause = "TT11_ART5_1";
  } else if (input.kind === "CONTINUED_CONTRIBUTIONS") {
    if (input.lastContributionMonth <= input.eligibilityMonth) fail("VOLUNTARY_CONTINUATION_NOT_ESTABLISHED");
    month = addMonths([input.lastContributionMonth, input.requestDate.slice(0, 7)].sort().at(-1)!, 1); clause = "TT11_ART5_2";
  } else if (input.kind === "PREPAID_REQUEST") {
    const eligibleRequest = [input.eligibilityMonth, input.requestDate.slice(0, 7)].sort().at(-1)!;
    if (eligibleRequest > input.prepaidThroughMonth) fail("REQUEST_OUTSIDE_PREPAID_PERIOD");
    month = addMonths(eligibleRequest, 1); clause = "TT11_ART5_3";
  } else {
    if (input.fullyPaidOn.slice(0, 7) < input.eligibilityMonth) fail("TOP_UP_BEFORE_AGE_ELIGIBILITY");
    month = addMonths(input.fullyPaidOn.slice(0, 7), 1); clause = "TT11_ART5_6";
  }
  if (month < "2025-07") fail("HISTORICAL_VOLUNTARY_START_REQUIRES_PRIOR_RULE");
  return { month, date: month + "-01", citationId: clause };
}

/** Law Art100. Excess contribution months before/after retirement age have
 * distinct multipliers. Never feed this grant into pension income or fund capital. */
export function voluntaryRetirementGrant(sex: "MALE" | "FEMALE", contributionMonths: string[], retirementAgeMonth: string, average: string) {
  z.enum(["MALE", "FEMALE"]).parse(sex); monthSchema.parse(retirementAgeMonth); positive.parse(average);
  if (contributionMonths.length > 1200 || new Set(contributionMonths).size !== contributionMonths.length || contributionMonths.some(m => !monthSchema.safeParse(m).success)) fail("DUPLICATE_OR_EXCESS_INSURANCE_MONTHS");
  const threshold = sex === "MALE" ? 420 : 360, excess = [...contributionMonths].sort().slice(threshold);
  const beforeMonths = excess.filter(m => m <= retirementAgeMonth).length, afterMonths = excess.length - beforeMonths;
  const before = benefitYears(beforeMonths).mul(average).mul("0.5"), after = benefitYears(afterMonths).mul(average).mul(2);
  return { excessMonths: excess.length, beforeMonths, afterMonths, beforeAmount: before.toFixed(), afterAmount: after.toFixed(), total: before.plus(after).toFixed() };
}
