import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import type { LegalStrategy } from "./legal-validation";
import { pensionEstimateInputSchema } from "./insurance-schema";
import { voluntaryValidationCase, voluntaryBenefitStrategy } from "./voluntary-validation";
import { validateVoluntaryPaymentRules } from "./voluntary-top-up-validation";
import { assessVoluntaryPrepaidBenefit, voluntaryPrepaidInputSchema, VOLUNTARY_PREPAID_ENGINE, VOLUNTARY_PREPAID_BRANCH,
  VOLUNTARY_PREPAID_STRATEGY, VOLUNTARY_PREPAID_CITATIONS } from "./voluntary-assessment";

// Synthetic fixture for statutory validation. Never imported as customer history.
export function voluntaryPrepaidValidationCase(periodMonths: 3 | 6 | 12 | 24 | 36 | 48 | 60 = 24, regime: "VOLUNTARY" | "EMPLOYER" | "STATE" = "VOLUNTARY") {
  const f = voluntaryValidationCase("MALE", regime === "VOLUNTARY" ? 0 : 120), usedMonths = Math.min(periodMonths, 6);
  const input = pensionEstimateInputSchema.parse(f.input); delete input.voluntaryCase;
  f.history.months = f.history.months.slice(0, 180 - usedMonths);
  f.history.coverageThrough = f.history.confirmedThroughMonth = f.history.months.at(-1)!.month;
  if (regime === "STATE") {
    input.stateSalaryCase = { firstParticipationMonth: "2011-07", firstParticipationEvidence: f.history.months[0].evidence,
      salaryTreatment: "ORDINARY", treatmentEvidence: f.history.months[0].evidence };
    f.history.months.slice(0, 120).forEach(r => { r.salaryRegime = "STATE"; r.participantCategory = "ARTICLE_2_1_B";
      r.stateSalary = { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "4", evidence: r.evidence }; });
  }
  input.benefitRequestDate = "2026-06-15";
  const periodStartMonth = periodMonths === 3 ? "2026-04" : "2026-01";
  return { history: f.history, input: voluntaryPrepaidInputSchema.parse({ ...input, voluntaryPrepaid: {
    kind: "PREPAID_REQUEST", ageRule: "NORMAL", historyTreatment: "NO_OTHER_ACTIVE_PREPAYMENT_OR_TOP_UP", periodStartMonth,
    periodMonths, registeredOn: periodStartMonth + "-10", paymentOn: periodStartMonth + "-10", monthlyIncome: "4000000",
    confirmation: "DOCUMENTED_FULLY_PAID", evidence: f.history.months[0].evidence,
    benefitRequest: { confirmation: "DOCUMENTED", evidence: f.history.months[0].evidence },
    refundSupport: { stateSupportToExclude: periodMonths > usedMonths ? "100000" : "0", evidence: f.history.months[0].evidence } } }) };
}
// Python Decimal80: each covered month880000; original discount indices retained.
const goldens = [
  { months: 3 as const, gross: "2640000.00", refund: "0.00", pension: "4897333.33" },
  { months: 6 as const, gross: "5280000.00", refund: "0.00", pension: "4857333.33" },
  { months: 12 as const, gross: "10560000.00", refund: "5180000.00", pension: "4857333.33" },
  { months: 24 as const, gross: "20386137.18", refund: "15046763.01", pension: "4857333.33" },
  { months: 36 as const, gross: "30025180.04", refund: "24685805.87", pension: "4857333.33" },
  { months: 48 as const, gross: "39312772.42", refund: "33973398.25", pension: "4857333.33" },
  { months: 60 as const, gross: "48261728.60", refund: "42922354.43", pension: "4857333.33" },
];
export const voluntaryPrepaidStrategy: LegalStrategy = {
  engineCode: VOLUNTARY_PREPAID_ENGINE, branch: VOLUNTARY_PREPAID_BRANCH, strategyCode: VOLUNTARY_PREPAID_STRATEGY,
  fixtureSuiteHash: digest({ version: "VOLUNTARY-PREPAID-1", base: voluntaryBenefitStrategy.fixtureSuiteHash, goldens,
    mixed: ["4092533.33", "3261866.67"], guards: ["UNUSED_MONTHS", "OVERLAP", "REQUEST", "RECEIPT", "SUPPORT", "PAYMENT_WINDOW"] }),
  validate(document) {
    const result = validateVoluntaryPaymentRules(document, VOLUNTARY_PREPAID_BRANCH, VOLUNTARY_PREPAID_CITATIONS);
    const record = (id: string, actual: unknown, expected: unknown) => result.cases.push({ id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    for (const g of goldens) {
      const f = voluntaryPrepaidValidationCase(g.months), r = assessVoluntaryPrepaidBenefit(f.history, f.input, document, "2026-10-07");
      const money = (code: string) => { const value = r.breakdown.find(b => b.code === code)?.value; return value ? new D(value).toFixed(2) : null; };
      record(`PREPAID-${g.months}`, { status: r.assessmentStatus, pension: r.monthlyPension && new D(r.monthlyPension).toFixed(2), months: r.countedMonths,
        start: r.startMonth, gross: money("PREPAID_GROSS_CONTRIBUTION"), refund: money("PREPAID_REFUND_ESTIMATE") },
      { status: "ELIGIBLE", pension: g.pension, months: 180, start: "2026-07", gross: g.gross, refund: g.refund });
    }
    for (const regime of ["EMPLOYER", "STATE"] as const) {
      const f = voluntaryPrepaidValidationCase(24, regime), r = assessVoluntaryPrepaidBenefit(f.history, f.input, document, "2026-10-07");
      record("PREPAID-" + regime, r.monthlyPension && new D(r.monthlyPension).toFixed(2), regime === "STATE" ? "3261866.67" : "4092533.33");
    }
    const f = voluntaryPrepaidValidationCase(), assess = () => assessVoluntaryPrepaidBenefit(f.history, f.input, document, "2026-10-07");
    f.input.contributionStopMonth = "2026-05"; f.input.intendedBenefitDate = "2026-06-01";
    record("PREPAID-179", assess().assessmentStatus, "NOT_YET_ELIGIBLE");
    f.input.contributionStopMonth = "2026-06"; f.input.intendedBenefitDate = "2026-07-01";
    f.input.voluntaryPrepaid.periodStartMonth = "2025-12";
    record("PREPAID-PERIOD-WINDOW", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.voluntaryPrepaid.periodStartMonth = "2026-01"; f.input.benefitRequestDate = null;
    record("PREPAID-REQUEST", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.benefitRequestDate = "2026-06-15"; f.input.voluntaryPrepaid.refundSupport!.stateSupportToExclude = "999999999";
    record("PREPAID-SUPPORT-LIMIT", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.voluntaryPrepaid.refundSupport = null;
    record("PREPAID-UNKNOWN-SUPPORT", assess().breakdown.find(b => b.code === "PREPAID_REFUND_STATUS")?.value, "SUPPORT_RECONCILIATION_REQUIRED");
    f.input.voluntaryPrepaid.evidence = [{ ...f.history.months[0].evidence[0], confirmedOn: "2026-01-01" }];
    record("PREPAID-RECEIPT", assess().assessmentStatus, "INSUFFICIENT_DATA");
    return result;
  },
};
