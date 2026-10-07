import { expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { voluntaryMixedAverage, voluntaryMixedMonthlyPension, voluntaryBenefitStart, voluntaryRetirementGrant, type VoluntaryAverageInput } from "../modules/pensions/voluntary-math";

const fixture = (compulsoryMonths: number, voluntaryMonths: number): VoluntaryAverageInput => ({
  compulsory: compulsoryMonths ? { adjustedAverage: "10000000", months: Array.from({ length: compulsoryMonths }, (_, i) => ({ month: addMonths("1988-01", i), participantCategory: "ARTICLE_2_1_A" })) } : null,
  voluntary: Array.from({ length: voluntaryMonths }, (_, i) => ({ month: addMonths("2008-01", i), contributionBase: "4000000", adjustment: { kind: "ANNUAL_FACTOR", factor: "1.25" } })),
});
it("weights compulsory and voluntary money by actual month counts instead of averaging the two averages", () => {
  // (120 x 10m + 60 x 4m x 1.25) / 180 = 8,333,333.333...;
  // male15years40% = 3,333,333.333... independently rounded to two cents below.
  const result = voluntaryMixedMonthlyPension(fixture(120, 60), "MALE", null);
  expect(result).toMatchObject({ compulsoryMonths: 120, voluntaryMonths: 60, totalMonths: 180, compulsoryAdjustedTotal: "1200000000", voluntaryAdjustedTotal: "300000000", rate: "40", floorApplies: false });
  expect(result.monthlyPension!.slice(0, 10)).toBe("3333333.33");
  const pure = voluntaryMixedMonthlyPension(fixture(0, 180), "FEMALE", null);
  expect(pure).toMatchObject({ combinedAverage: "5000000", rate: "45", monthlyPension: "2250000", floorApplies: false });
});

it("uses coefficient one for missing-years top-ups, and rejects unverified factor precision/floor", () => {
  const input = fixture(0, 2); input.voluntary[1].adjustment = { kind: "MISSING_YEARS_TOP_UP" };
  expect(voluntaryMixedAverage(input)).toMatchObject({ voluntaryAdjustedTotal: "9000000", combinedAverage: "4500000" });
  for (const factor of ["0.99", "1.001"]) {
    input.voluntary[0].adjustment = { kind: "ANNUAL_FACTOR", factor };
    expect(() => voluntaryMixedAverage(input)).toThrowError(expect.objectContaining({ code: "VOLUNTARY_FACTOR_REVIEW_REQUIRED" }));
  }
});

it("does not round 179 months into eligibility or count overlapping compulsory and voluntary months twice", () => {
  expect(voluntaryMixedMonthlyPension(fixture(0, 179), "MALE", null)).toMatchObject({ eligibleMonths: false, rate: null, monthlyPension: null });
  expect(voluntaryMixedMonthlyPension(fixture(0, 181), "MALE", null)).toMatchObject({ rate: "40.5", monthlyPension: "2025000" });
  const input = fixture(1, 1); input.compulsory!.months[0].month = input.voluntary[0].month;
  expect(() => voluntaryMixedAverage(input)).toThrowError(expect.objectContaining({ code: "DUPLICATE_OR_EXCESS_INSURANCE_MONTHS" }));
  const old = fixture(0, 1); old.voluntary[0].month = "2007-12";
  expect(() => voluntaryMixedAverage(old)).toThrowError(expect.objectContaining({ code: "VOLUNTARY_MONTH_BEFORE_SCHEME_START" }));
});

it("tests the reference floor using qualifying compulsory months, never total months or voluntary months", () => {
  const input = fixture(240, 12); input.compulsory!.adjustedAverage = "1000000";
  input.voluntary.forEach(r => { r.contributionBase = "1000000"; r.adjustment = { kind: "ANNUAL_FACTOR", factor: "1" }; });
  expect(() => voluntaryMixedMonthlyPension(input, "MALE", null)).toThrowError(expect.objectContaining({ code: "REFERENCE_AMOUNT_REQUIRED" }));
  expect(voluntaryMixedMonthlyPension(input, "MALE", "2530000")).toMatchObject({ floorApplies: true, beforeFloor: "470000", monthlyPension: "2530000" });
  input.compulsory!.months[0].participantCategory = "OTHER";
  expect(voluntaryMixedMonthlyPension(input, "MALE", "2530000")).toMatchObject({ floorApplies: false, monthlyPension: "470000" });
  expect(voluntaryMixedMonthlyPension(fixture(0, 240), "MALE", "10000000").floorApplies).toBe(false);
});

it.each([
  [{ kind: "ELIGIBILITY", eligibilityMonth: "2026-06", lastContributionMonth: "2026-04" }, "2026-07"],
  [{ kind: "CONTINUED_CONTRIBUTIONS", eligibilityMonth: "2026-04", lastContributionMonth: "2026-06", requestDate: "2026-08-20" }, "2026-09"],
  [{ kind: "CONTINUED_CONTRIBUTIONS", eligibilityMonth: "2026-04", lastContributionMonth: "2026-06", requestDate: "2026-05-20" }, "2026-07"],
  [{ kind: "PREPAID_REQUEST", eligibilityMonth: "2026-04", prepaidThroughMonth: "2027-06", requestDate: "2026-05-20" }, "2026-06"],
  [{ kind: "MISSING_YEARS_TOP_UP", eligibilityMonth: "2026-04", fullyPaidOn: "2026-06-30" }, "2026-07"],
  [{ kind: "TRANSITION_2025", eligibilityMonth: "2025-05", lastContributionMonth: "2025-06" }, "2025-07"],
] as const)("resolves the separate statutory start case %#", (input, expected) => {
  expect(voluntaryBenefitStart(input).date).toBe(expected + "-01");
});

it.each([
  [{ kind: "ELIGIBILITY", eligibilityMonth: "2026-04", lastContributionMonth: "2026-06" }, "CONTINUED_CONTRIBUTION_CASE_REQUIRED"],
  [{ kind: "CONTINUED_CONTRIBUTIONS", eligibilityMonth: "2026-04", lastContributionMonth: "2026-03", requestDate: "2026-06-01" }, "VOLUNTARY_CONTINUATION_NOT_ESTABLISHED"],
  [{ kind: "PREPAID_REQUEST", eligibilityMonth: "2026-04", prepaidThroughMonth: "2026-05", requestDate: "2026-06-01" }, "REQUEST_OUTSIDE_PREPAID_PERIOD"],
  [{ kind: "MISSING_YEARS_TOP_UP", eligibilityMonth: "2026-06", fullyPaidOn: "2026-05-31" }, "TOP_UP_BEFORE_AGE_ELIGIBILITY"],
  [{ kind: "TRANSITION_2025", eligibilityMonth: "2025-05", lastContributionMonth: "2025-07" }, "VOLUNTARY_TRANSITION_CONDITIONS_NOT_MET"],
  [{ kind: "ELIGIBILITY", eligibilityMonth: "2025-05", lastContributionMonth: "2025-05" }, "HISTORICAL_VOLUNTARY_START_REQUIRES_PRIOR_RULE"],
] as const)("rejects a start case whose stated conditions contradict its history %#", (input, code) => {
  expect(() => voluntaryBenefitStart(input)).toThrowError(expect.objectContaining({ code }));
});

it("separates grants before/after retirement age, uses the female threshold and leaves grant outside monthly pension", () => {
  const months = Array.from({ length: 444 }, (_, i) => addMonths("1989-07", i));
  expect(voluntaryRetirementGrant("MALE", months, "2025-06", "10000000")).toMatchObject({ excessMonths: 24, beforeMonths: 12, afterMonths: 12, beforeAmount: "5000000", afterAmount: "20000000", total: "25000000" });
  const female = Array.from({ length: 361 }, (_, i) => addMonths("1996-06", i));
  expect(voluntaryRetirementGrant("FEMALE", female, "2026-06", "10000000").total).toBe("2500000");
  expect(voluntaryRetirementGrant("MALE", months.slice(0, 420), "2025-06", "10000000").total).toBe("0");
});
