import { expect, it } from "vitest";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { stateBenefitFixture } from "./benefit-fixtures";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { wageFactors2026 } from "../modules/pensions/benefit-validation";
import { addMonths } from "../common/calendar";

it("calculates the state reference coefficient and the weighted mixed monthly pension", () => {
  const f = stateBenefitFixture(), result = assessBenefit(f.history, f.input, f.rules, "2026-10-05");
  expect(result).toMatchObject({ assessmentStatus: "ELIGIBLE", monthlyPension: "4048000", lumpSum: "0" });
  const mixed = stateBenefitFixture(180, 60), m = assessBenefit(mixed.history, mixed.input, mixed.rules, "2026-10-05");
  expect(m.assessmentStatus).toBe("ELIGIBLE"); expect(Number(m.monthlyPension)).toBeCloseTo(5365333.3333333, 5);
  expect(m.breakdown).toContainEqual(expect.objectContaining({ code: "STATE_CONTRIBUTION_MONTHS", value: "120" }));
});
it("uses wage-year adjustment for participation from2016 and reference coefficients before2016", () => {
  const f = stateBenefitFixture(180);
  f.history.coverageFrom = "2016-01"; f.history.coverageThrough = "2030-12"; f.history.confirmedThroughMonth = "2030-12";
  f.history.months.forEach((r, i) => { r.month = addMonths("2016-01", i); delete r.stateSalary; });
  f.input.stateSalaryCase!.firstParticipationMonth = "2016-01"; f.input.contributionStopMonth = "2030-12";
  f.input.intendedBenefitDate = "2031-01-01"; f.input.employmentEndDate = "2030-12-31"; f.input.caseDetails!.benefitStart.month = "2031-01";
  f.rules.tables.forEach(t => { t.effectiveFrom = "2031-01-01"; t.effectiveTo = "2032-01-01"; });
  f.rules.tables = f.rules.tables.filter(t => t.kind !== "WAGE_FACTOR");
  for (let year = 2016; year <= 2030; year++) f.rules.tables.push({ kind: "WAGE_FACTOR", key: `2031:${year}`, value: "1.1", citationId: "LAW_ART73", effectiveFrom: "2031-01-01", effectiveTo: "2032-01-01" });
  // Pure arithmetic fixture only; publishing unknown2031 coefficients is rejected.
  expect(assessBenefit(f.history, f.input, f.rules, "2031-02-01")).toMatchObject({ assessmentStatus: "ELIGIBLE", monthlyPension: "4400000" });
  expect(validateLegalDocument(f.rules).valid).toBe(false);
});
it("keeps incomplete/special/pre2004 state salary cases explicit", () => {
  const f = stateBenefitFixture(); delete f.history.months[0].stateSalary;
  expect(assessBenefit(f.history, f.input, f.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", monthlyPension: null });
  const special = stateBenefitFixture(); special.input.stateSalaryCase!.salaryTreatment = "SENIORITY_ALLOWANCE_TRANSFER";
  expect(assessBenefit(special.history, special.input, special.rules, "2026-10-05").assessmentStatus).toBe("REVIEW_REQUIRED");
  const old = stateBenefitFixture(300);
  expect(assessBenefit(old.history, old.input, old.rules, "2026-10-05").missingFields.some(r => r.code === "PRE_2004_STATE_SALARY_CONVERSION_REQUIRED")).toBe(true);
  const ceiling = stateBenefitFixture(); ceiling.history.months[0].stateSalary!.totalContributionCoefficient = "21";
  expect(assessBenefit(ceiling.history, ceiling.input, ceiling.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
});
it("requires full participation history, including earlier withdrawn periods and evidence dates", () => {
  const f = stateBenefitFixture(); f.history.months[0].status = "WITHDRAWN"; delete f.history.months[0].stateSalary;
  f.input.stateSalaryCase!.firstParticipationMonth = f.history.months[1].month;
  expect(assessBenefit(f.history, f.input, f.rules, "2026-10-05").missingFields.some(r => r.code === "EARLIER_PARTICIPATION_IN_HISTORY")).toBe(true);
  const g = stateBenefitFixture(); g.history.months[0].stateSalary!.evidence = [{ ...g.history.months[0].evidence[0], confirmedOn: "2027-01-01" }];
  expect(assessBenefit(g.history, g.input, g.rules, "2026-10-05").monthlyPension).toBeNull();
});
it("registers state strategy with independent weighted-mean fixtures and rejects missing statutory citations", () => {
  const f = stateBenefitFixture(); f.rules.citations.forEach(c => { c.url = "https://vanban.chinhphu.vn/"; });
  f.rules.tables.filter(t => t.kind === "WAGE_FACTOR").forEach(t => { t.value = wageFactors2026[t.key.split(":")[1]]; });
  const valid = validateLegalDocument(f.rules);
  expect(valid.issues).toEqual([]); expect(valid.coverage[0].cases).toHaveLength(18);
  f.rules.citations = f.rules.citations.filter(c => c.id !== "ND158_ART15");
  expect(validateLegalDocument(f.rules).valid).toBe(false);
});
