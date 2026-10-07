import { expect, it } from "vitest";
import { benefitFixture } from "./benefit-fixtures";
import { addMonths } from "../common/calendar";
import { assessVoluntaryBenefit, voluntaryEstimateInputSchema, VOLUNTARY_ENGINE, VOLUNTARY_BRANCH, VOLUNTARY_STRATEGY, VOLUNTARY_CITATIONS } from "../modules/pensions/voluntary-assessment";
import { digest } from "../common/digest";

function fixture(months = 180, compulsory = 0, sex: "MALE" | "FEMALE" = "MALE") {
  const f = benefitFixture(months, sex), evidence = f.history.months[0].evidence;
  f.history.months.forEach((r, i) => {
    if (i >= compulsory) { r.scheme = "VOLUNTARY"; r.salaryRegime = "VOLUNTARY_INCOME"; delete r.participantCategory; r.contributionBase = "4000000"; }
  });
  const input = voluntaryEstimateInputSchema.parse({ ...f.input, caseDetails: undefined,
    employmentEndDate: compulsory ? f.history.months[compulsory - 1].month + "-28" : null,
    voluntaryCase: { kind: "NORMAL_VOLUNTARY", paymentMethod: "REGULAR_ONLY", ageRule: "NORMAL",
      benefitStart: { kind: "ELIGIBILITY", month: "2026-07", confirmation: "DOCUMENTED", evidence } } });
  f.rules.engineCode = VOLUNTARY_ENGINE;
  f.rules.coverage = [{ branch: VOLUNTARY_BRANCH, strategyCode: VOLUNTARY_STRATEGY, citationIds: VOLUNTARY_CITATIONS, requiredTableKeys: [] }];
  f.rules.citations = VOLUNTARY_CITATIONS.map(id => ({ ...f.rules.citations[0], id }));
  f.rules.tables.forEach(t => { if (t.kind === "WAGE_FACTOR") t.citationId = "LAW_ART73"; });
  for (const year of new Set(f.history.months.filter(r => r.scheme === "VOLUNTARY").map(r => r.month.slice(0, 4))))
    f.rules.tables.push({ kind: "INCOME_FACTOR", key: "2026:" + year, value: "1.25", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01", citationId: "ND159_ART10" });
  return { ...f, input };
}
const calculate = (f: ReturnType<typeof fixture>) => assessVoluntaryBenefit(f.history, f.input, f.rules, "2026-10-07");

it("assesses complete pure voluntary histories with separate contribution counts and no compulsory pension floor", () => {
  expect(calculate(fixture())).toMatchObject({ assessmentStatus: "ELIGIBLE", countedMonths: 180, monthlyPension: "2000000", lumpSum: "0", startMonth: "2026-07" });
  expect(calculate(fixture(180, 0, "FEMALE"))).toMatchObject({ assessmentStatus: "ELIGIBLE", monthlyPension: "2250000" });
});
it("combines employer wage and voluntary income using the correct factors and time weights", () => {
  const result = calculate(fixture(180, 120));
  expect(result.assessmentStatus).toBe("ELIGIBLE");
  expect(result.monthlyPension!.slice(0, 10)).toBe("3333333.33");
  expect(result.breakdown).toContainEqual(expect.objectContaining({ code: "COMPULSORY_MONTHS", value: "120" }));
  expect(result.breakdown).toContainEqual(expect.objectContaining({ code: "VOLUNTARY_MONTHS", value: "60" }));
});
it("does not extrapolate income factors or substitute wage factors, and requires active citation evidence", () => {
  const f = fixture(); f.rules.tables = f.rules.tables.filter(r => r.kind !== "INCOME_FACTOR");
  expect(calculate(f)).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", monthlyPension: null });
  const g = fixture(); g.rules.citations = g.rules.citations.filter(c => c.id !== "TT11_ART5");
  expect(calculate(g)).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
  const h = fixture(); h.rules.tables.find(t => t.kind === "INCOME_FACTOR")!.value = "0.9";
  expect(calculate(h)).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: null });
  const expired = fixture();
  expired.rules.citations.push({ ...expired.rules.citations[0], id: "EXPIRED_FACTOR", effectiveTo: "2026-06-01" });
  expired.rules.tables.filter(t => t.kind === "INCOME_FACTOR").forEach(t => { t.citationId = "EXPIRED_FACTOR"; });
  expect(calculate(expired)).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", monthlyPension: null });
});
it("counts eligibility in whole actual months and rejects holes, duplicates and undeclared future payments", () => {
  expect(calculate(fixture(179))).toMatchObject({ assessmentStatus: "NOT_YET_ELIGIBLE", monthlyPension: null });
  const f = fixture(); f.history.months.splice(20, 1);
  expect(calculate(f).missingFields.some(i => i.code === "UNKNOWN_CONTRIBUTION_MONTH")).toBe(true);
  const g = fixture(); g.history.months.push(g.history.months[0]);
  expect(calculate(g).missingFields.some(i => i.code === "DUPLICATE_CONTRIBUTION_MONTH")).toBe(true);
  const h = fixture(); h.history.confirmedThroughMonth = "2026-05";
  expect(calculate(h).missingFields.some(i => i.code === "FUTURE_HISTORY_MUST_BE_SEPARATE_SCENARIO")).toBe(true);
});
it("computes the eligibility month from the 180th paid month and the normal age, then enforces the statutory start", () => {
  const f = fixture(); f.input.intendedBenefitDate = "2026-08-01"; f.input.voluntaryCase.benefitStart.month = "2026-08";
  expect(calculate(f).missingFields.some(i => i.code === "VOLUNTARY_BENEFIT_START_MISMATCH")).toBe(true);
  f.input.intendedBenefitDate = "2026-06-01"; f.input.voluntaryCase.benefitStart.month = "2026-06";
  expect(calculate(f).monthlyPension).toBeNull();
});
it("requires the continued-contributions case and a request, including eligibility before the 2025 transition", () => {
  const f = fixture(240, 60);
  expect(calculate(f).missingFields.some(i => i.code === "CONTINUED_CONTRIBUTION_CASE_REQUIRED")).toBe(true);
  f.input.voluntaryCase.benefitStart.kind = "CONTINUED_CONTRIBUTIONS";
  expect(calculate(f).missingFields.some(i => i.code === "CONTINUED_CONTRIBUTION_REQUEST_REQUIRED")).toBe(true);
  f.input.benefitRequestDate = "2026-06-28";
  expect(calculate(f).assessmentStatus).toBe("ELIGIBLE");
  f.input.benefitRequestDate = "2026-08-28";
  expect(calculate(f).monthlyPension).toBeNull();
});
it("accepts explicitly projected future contributions without treating them as confirmed history", () => {
  const f = fixture(); const last = f.history.months.pop()!;
  f.history.coverageThrough = "2026-05"; f.history.confirmedThroughMonth = "2026-05";
  f.input.futureContributions = [last];
  expect(calculate(f)).toMatchObject({ assessmentStatus: "ELIGIBLE", estimateKind: "PROJECTED_SCENARIO", countedMonths: 180 });
});
it("preserves unknown versus withdrawn months, and rejects unsupported state/credited cases", () => {
  const f = fixture(); f.history.months[0].status = "WITHDRAWN";
  expect(calculate(f)).toMatchObject({ assessmentStatus: "NOT_YET_ELIGIBLE", countedMonths: 179 });
  const g = fixture(180, 1); g.history.months[0].salaryRegime = "STATE";
  expect(calculate(g).assessmentStatus).toBe("REVIEW_REQUIRED");
  const h = fixture(); h.history.months[0].status = "CREDITED"; h.history.months[0].creditKind = "EXAMPLE";
  expect(calculate(h).assessmentStatus).toBe("REVIEW_REQUIRED");
});
it("keeps the assessment pure and binds hashes to history, rules and the exact case", () => {
  const f = fixture(), before = digest(f), first = calculate(f);
  expect(digest(f)).toBe(before); expect(calculate(f)).toEqual(first);
  f.input.voluntaryCase.benefitStart.confirmation = "HYPOTHETICAL";
  expect(calculate(f).inputHash).not.toBe(first.inputHash);
  const g = fixture(); g.history.months[0].evidence = [{ ...g.history.months[0].evidence[0], confirmedOn: "2027-01-01" }];
  expect(calculate(g).monthlyPension).toBeNull();
});
