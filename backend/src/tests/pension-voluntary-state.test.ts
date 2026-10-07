import { expect, it } from "vitest";
import { validatedVoluntaryStateFixture, validatedVoluntaryFixture } from "./benefit-fixtures";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { addMonths } from "../common/calendar";
const calculate = (f: ReturnType<typeof validatedVoluntaryStateFixture>) => assessBenefit(f.history, f.input, f.rules, "2026-10-07");

it.each([[120, 0, "3261866.67"], [60, 60, "3539200.00"], [179, 0, "4034400.00"]] as const)("combines %i state and %i employer months with voluntary income", (state, employer, expected) => {
  const f = validatedVoluntaryStateFixture(state, employer), before = structuredClone(f), r = calculate(f);
  expect(r.assessmentStatus).toBe("ELIGIBLE");
  expect(new D(r.monthlyPension!).toFixed(2)).toBe(expected);
  expect(r.breakdown).toContainEqual(expect.objectContaining({ code: "STATE_CONTRIBUTION_MONTHS", value: String(state) }));
  expect(r.lumpSum).toBe("0"); expect(f).toEqual(before);
});
it("registers state/voluntary validation goldens without changing employer/voluntary coverage", () => {
  const r = validateLegalDocument(validatedVoluntaryStateFixture().rules);
  expect(r.issues).toEqual([]); expect(r.valid).toBe(true); expect(r.coverage[0].cases).toHaveLength(14);
  expect(validateLegalDocument(validatedVoluntaryFixture().rules).coverage[0].cases).toHaveLength(8);
});
it.each([[150, 0, "4317866.67"], [130, 30, "3813422.22"]] as const)("uses the state wage window and the appropriate all-time comparison (%i/%i)", (state, employer, expected) => {
  const f = validatedVoluntaryStateFixture(state, employer);
  f.history.months.slice(0, state - 120).forEach(r => { r.stateSalary!.totalContributionCoefficient = "8"; });
  const r = calculate(f);
  expect(r.assessmentStatus).toBe("ELIGIBLE");
  expect(new D(r.monthlyPension!).toFixed(2)).toBe(expected);
});
it("requires state evidence, ordinary treatment, reference and complete state coefficients", () => {
  for (const mutate of [
    (f: ReturnType<typeof validatedVoluntaryStateFixture>) => { delete f.input.stateSalaryCase; },
    (f: ReturnType<typeof validatedVoluntaryStateFixture>) => { delete f.history.months[0].stateSalary; },
    (f: ReturnType<typeof validatedVoluntaryStateFixture>) => { f.rules.tables = f.rules.tables.filter(t => t.kind !== "REFERENCE_AMOUNT"); },
    (f: ReturnType<typeof validatedVoluntaryStateFixture>) => { f.input.stateSalaryCase!.firstParticipationMonth = "2012-01"; },
    (f: ReturnType<typeof validatedVoluntaryStateFixture>) => { f.history.months[0].stateSalary!.evidence = [{ ...f.history.months[0].evidence[0], confirmedOn: "2026-12-01" }]; },
  ]) { const f = validatedVoluntaryStateFixture(); mutate(f); expect(calculate(f)).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", monthlyPension: null }); }
  const special = validatedVoluntaryStateFixture(); special.input.stateSalaryCase!.salaryTreatment = "SENIORITY_ALLOWANCE_TRANSFER";
  expect(calculate(special)).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
  const ceiling = validatedVoluntaryStateFixture(); ceiling.history.months[0].stateSalary!.totalContributionCoefficient = "20.01";
  expect(calculate(ceiling)).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
});
it("keeps state histories unsupported under the original voluntary engine", () => {
  const f = validatedVoluntaryStateFixture(); f.rules = validatedVoluntaryFixture().rules;
  expect(calculate(f)).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
  delete f.input.stateSalaryCase;
  expect(calculate(f)).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
});
it("requires at least one state month and protects separate compulsory and voluntary counts", () => {
  const f = validatedVoluntaryStateFixture(0, 120);
  expect(calculate(f)).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", monthlyPension: null });
  const small = validatedVoluntaryStateFixture(); small.history.months[0].status = "WITHDRAWN"; delete small.history.months[0].stateSalary;
  expect(calculate(small)).toMatchObject({ assessmentStatus: "NOT_YET_ELIGIBLE", countedMonths: 179, monthlyPension: null });
});
it.each([239, 240])("applies the state/voluntary floor only after240 compulsory qualifying months (%i)", compulsory => {
  const f = validatedVoluntaryStateFixture(), evidence = f.history.months[0].evidence;
  f.history.coverageFrom = "2006-06";
  f.history.months = Array.from({ length: 241 }, (_, i) => ({ month: addMonths("2006-06", i), status: "PAID", contributionBase: "1000000", evidence,
    scheme: i < compulsory ? "COMPULSORY" : "VOLUNTARY", salaryRegime: i < compulsory ? "STATE" : "VOLUNTARY_INCOME",
    ...(i < compulsory ? { participantCategory: "ARTICLE_2_1_B", stateSalary: { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "0.4", evidence } } : {}) }));
  f.input.stateSalaryCase!.firstParticipationMonth = "2006-06";
  f.input.employmentEndDate = f.history.months[compulsory - 1].month + "-28";
  f.input.voluntaryCase!.benefitStart.kind = "CONTINUED_CONTRIBUTIONS";
  f.input.benefitRequestDate = "2026-06-28";
  const r = calculate(f);
  expect(r.assessmentStatus).toBe("ELIGIBLE"); expect(r.countedMonths).toBe(241);
  expect(r.breakdown).toContainEqual(expect.objectContaining({ code: "TRANSITIONAL_FLOOR_APPLIED", value: String(compulsory === 240) }));
  if (compulsory === 240) expect(r.monthlyPension).toBe("2530000");
  else expect(new D(r.monthlyPension!).lt("2530000")).toBe(true);
});
