import { fixtureProfile, known, empty } from "./profile-v2-fixtures";
import { portfolioFixture, portfolioAssumptionsFixture, portfolioCommand } from "./portfolio-fixtures";
import { retirementPreviewSchema } from "../modules/retirement/schema";
export function retirementProfile() {
  const p = fixtureProfile({ debts: empty(), assets: empty(), expenses: empty(), pension: { status: "NOT_APPLICABLE", reason: "Confirmed no pension in fixture" } });
  p.personal.desiredRetirementMonth = known("2027-01");
  p.personal.pensionStartMonth = { status: "NOT_APPLICABLE", reason: "Confirmed no pension in fixture" };
  if (p.income.status === "KNOWN") { p.income.entries[0].amount = known("100"); p.income.entries[0].endMonth = "2026-12"; }
  return p;
}
export function retirementCommand(policyVersionId = "00000000-0000-4000-8000-000000000002") {
  const portfolio = portfolioCommand(policyVersionId, false);
  return retirementPreviewSchema.parse({ expectedProfileRevision: 1, policyVersionId, scenario: "BASE", answers: portfolio.answers,
    liquidityNeedMonths: 0, endMonth: "2027-03", monthlyExpenseToday: "100", monthlyContribution: "100", monthlyReserve: "0", retirementIncomeIds: [] });
}
export function retirementConfiguration() {
  const assumptions = portfolioAssumptionsFixture(), policy = portfolioFixture();
  assumptions.inflation = assumptions.inflation.map(r => ({ ...r, percent: "0" }));
  assumptions.returns = assumptions.returns.map(r => ({ ...r, rate: { type: "EFFECTIVE_ANNUAL", percent: "0" } }));
  return { assumptions, policy };
}
