import { expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { benefitFixtureV2 } from "./benefit-fixtures";
import { assessOrdinaryBenefitV2, retirementLumpSum } from "../modules/pensions/benefit-assessment-v2";
import { assessBenefit } from "../modules/pensions/benefit-engine";

it.each([
  ["MALE",420,0,"0"], ["MALE",421,0,"2500000"], ["MALE",426,0,"2500000"], ["MALE",427,0,"5000000"],
  ["MALE",420,1,"10000000"], ["MALE",420,6,"10000000"], ["MALE",420,7,"20000000"], ["MALE",432,12,"25000000"],
  ["MALE",408,24,"20000000"], ["FEMALE",360,0,"0"], ["FEMALE",372,12,"25000000"],
] as const)("grant %s with %i months through age and %i afterward yields %s", (sex, before, after, amount) => {
  const months = Array.from({ length: before + after }, (_, i) => addMonths("2026-06", i - before + 1));
  expect(retirementLumpSum(sex, months.reverse(), "2026-06", "10000000").total).toBe(amount);
});
it("assesses the excess contribution month, not every month worked after pension age", () => {
  const f = benefitFixtureV2(421), result = assessBenefit(f.history, f.input, f.rules, "2026-10-05");
  expect(result).toMatchObject({ assessmentStatus: "ELIGIBLE", monthlyPension: "7500000", lumpSum: "10000000" });
  expect(result.breakdown).toContainEqual(expect.objectContaining({ code: "LUMP_SUM_EXCESS_MONTHS_AFTER_AGE", value: "1" }));
  const g = benefitFixtureV2(446), split = assessBenefit(g.history, g.input, g.rules, "2026-10-05");
  expect(split.lumpSum).toBe("35000000"); // retirement April2025:12 excess months before,14 after.
  expect(split.monthlyPension).toBe(result.monthlyPension);
});
it("keeps grants null on missing rules/coverage instead of asserting a zero grant", () => {
  const f = benefitFixtureV2(421); f.rules.citations = f.rules.citations.filter(c => c.id !== "LAW_ART68");
  expect(assessBenefit(f.history, f.input, f.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", lumpSum: null });
  f.rules.engineCode = "vn-pension-benefit-v1";
  expect(assessOrdinaryBenefitV2(f.history, f.input, f.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
  f.rules.engineCode = "unknown";
  expect(() => assessBenefit(f.history, f.input, f.rules, "2026-10-05")).toThrow();
  expect(() => retirementLumpSum("MALE", ["2026-01", "2026-01"], "2026-06", "10000000")).toThrow();
});
