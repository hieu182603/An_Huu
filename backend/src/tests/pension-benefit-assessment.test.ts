import { expect, it } from "vitest";
import { assessOrdinaryBenefit, normalCohortAge } from "../modules/pensions/benefit-assessment";
import { benefitFixture } from "./benefit-fixtures";

it.each([[180,"MALE","4000000"],[180,"FEMALE","4500000"],[240,"MALE","4500000"],[420,"MALE","7500000"],[360,"FEMALE","7500000"]] as const)
("BH-G normal %i months %s independently yields %s", (months, sex, amount) => {
  const f = benefitFixture(months, sex), original = JSON.stringify(f);
  const result = assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05");
  expect(result).toMatchObject({ assessmentStatus: "ELIGIBLE", estimateKind: "CURRENT_RULE_ESTIMATE", countedMonths: months, monthlyPension: amount, startMonth: "2026-07", lumpSum: "0" });
  expect(JSON.stringify(f)).toBe(original);
});
it("keeps eligibility months exact and distinguishes missing/withdrawn/uninsured months", () => {
  const f = benefitFixture(179);
  expect(assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "NOT_YET_ELIGIBLE", countedMonths: 179, monthlyPension: null });
  const g = benefitFixture(180); g.history.months[0].status = "UNKNOWN";
  expect(assessOrdinaryBenefit(g.history, g.input, g.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", countedMonths: null });
  g.history.months[0].status = "WITHDRAWN";
  expect(assessOrdinaryBenefit(g.history, g.input, g.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "NOT_YET_ELIGIBLE", countedMonths: 179 });
  g.history.months[0].status = "NOT_CONTRIBUTED"; g.history.months[0].contributionBase = null;
  expect(assessOrdinaryBenefit(g.history, g.input, g.rules, "2026-10-05").countedMonths).toBe(179);
});
it("requires every applicable benefit-year factor and never substitutes the previous year's table", () => {
  const f = benefitFixture(); f.rules.tables = f.rules.tables.filter(t => t.key !== "2026:2011");
  const missing = assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05");
  expect(missing.assessmentStatus).toBe("INSUFFICIENT_DATA"); expect(missing.monthlyPension).toBeNull();
  expect(missing.missingFields).toContainEqual({ path: "tables.WAGE_FACTOR.2026:2011", code: "RULE_TABLE_REQUIRED" });
  const future = benefitFixture(); future.input.intendedBenefitDate = "2027-01-01"; future.input.caseDetails!.benefitStart.month = "2027-01";
  expect(assessOrdinaryBenefit(future.history, future.input, future.rules, "2026-10-05")).toMatchObject({ estimateKind: "PROJECTED_SCENARIO", monthlyPension: null });
});
it("applies a conditional transitional floor only to the qualifying 240-month group", () => {
  for (const [months, amount] of [[180,"400000"],[239,"450000"],[240,"2530000"]] as const) {
    const f = benefitFixture(months); f.history.months.forEach(r => { r.contributionBase = "1000000"; });
    expect(assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05").monthlyPension).toBe(amount);
  }
});
it("does not infer benefit receipt just from reaching the reference age", () => {
  const f = benefitFixture(); delete f.input.caseDetails;
  expect(assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05")).toMatchObject({ assessmentStatus: "INSUFFICIENT_DATA", startMonth: null });
  const g = benefitFixture(); g.input.caseDetails!.participationAtRetirement = "PRESERVED";
  expect(assessOrdinaryBenefit(g.history, g.input, g.rules, "2026-10-05").missingFields).toContainEqual({ path: "benefitRequestDate", code: "BENEFIT_REQUEST_REQUIRED" });
  const h = benefitFixture(); h.input.employmentEndDate = "2026-08-31";
  expect(assessOrdinaryBenefit(h.history, h.input, h.rules, "2026-10-05").monthlyPension).toBeNull();
});
it("rejects overlapping/future actual history and routes special regimes to review", () => {
  const f = benefitFixture(); f.history.months.push(f.history.months[0]);
  expect(assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05").assessmentStatus).toBe("INSUFFICIENT_DATA");
  const g = benefitFixture(); g.history.months[0].salaryRegime = "STATE";
  expect(assessOrdinaryBenefit(g.history, g.input, g.rules, "2026-10-05").assessmentStatus).toBe("REVIEW_REQUIRED");
  const h = benefitFixture(); h.input.futureContributions.push(h.history.months[0]);
  expect(assessOrdinaryBenefit(h.history, h.input, h.rules, "2026-10-05").monthlyPension).toBeNull();
});
it("keeps historical cohorts and delayed retirement lump sums explicit pending their branches", () => {
  expect(normalCohortAge("MALE", "1960-12")).toBe(720);
  expect(normalCohortAge("FEMALE", "1966-01")).toBe(664);
  expect(normalCohortAge("MALE", "1960-11")).toBeNull();
  const f = benefitFixture(421), result = assessOrdinaryBenefit(f.history, f.input, f.rules, "2026-10-05");
  expect(result).toMatchObject({ assessmentStatus: "REVIEW_REQUIRED", monthlyPension: "7500000", lumpSum: null });
});
