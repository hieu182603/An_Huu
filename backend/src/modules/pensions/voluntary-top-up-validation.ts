import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import type { LegalStrategy } from "./legal-validation";
import { type LegalRuleDocument, pensionEstimateInputSchema } from "./insurance-schema";
import { voluntaryBenefitStrategy, voluntaryValidationCase } from "./voluntary-validation";
import { assessVoluntaryTopUpBenefit, voluntaryTopUpInputSchema, VOLUNTARY_TOP_UP_ENGINE, VOLUNTARY_TOP_UP_BRANCH,
  VOLUNTARY_TOP_UP_STRATEGY, VOLUNTARY_TOP_UP_CITATIONS, VOLUNTARY_ENGINE, VOLUNTARY_BRANCH, VOLUNTARY_STRATEGY } from "./voluntary-assessment";

// Synthetic statutory validation case, not customer data and never seeded.
export function voluntaryTopUpValidationCase(sex: "MALE" | "FEMALE" = "MALE", regime: "VOLUNTARY" | "EMPLOYER" | "STATE" = "VOLUNTARY") {
  const f = voluntaryValidationCase(sex, regime === "VOLUNTARY" ? 0 : 120);
  f.history.months = f.history.months.slice(0, 120);
  f.history.coverageThrough = f.history.confirmedThroughMonth = "2021-06";
  const input = pensionEstimateInputSchema.parse(f.input); delete input.voluntaryCase;
  input.contributionStopMonth = "2021-06";
  if (regime === "STATE") {
    input.stateSalaryCase = { firstParticipationMonth: "2011-07", firstParticipationEvidence: f.history.months[0].evidence,
      salaryTreatment: "ORDINARY", treatmentEvidence: f.history.months[0].evidence };
    f.history.months.forEach(r => { r.salaryRegime = "STATE"; r.participantCategory = "ARTICLE_2_1_B";
      r.stateSalary = { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "4", evidence: r.evidence }; });
  }
  return { history: f.history, input: voluntaryTopUpInputSchema.parse({ ...input, voluntaryTopUp: {
    kind: "MISSING_YEARS_TOP_UP", ageRule: "NORMAL", historyTreatment: "REGULAR_ONLY", paymentOn: "2026-06-28",
    missingMonths: 60, monthlyIncome: "4000000", confirmation: "DOCUMENTED_FULLY_PAID", evidence: f.history.months[0].evidence } }) };
}
// Independent Python Decimal80 sums, 120 regular Jul2011–Jun2021 months;
// 60 settlement months at4m/factor1, benefit reference2.53m, payment reference2.34m.
const goldens = [
  { sex: "MALE" as const, regime: "VOLUNTARY" as const, pension: "4062666.67" },
  { sex: "FEMALE" as const, regime: "VOLUNTARY" as const, pension: "4570500.00" },
  { sex: "MALE" as const, regime: "EMPLOYER" as const, pension: "4062666.67" },
  { sex: "MALE" as const, regime: "STATE" as const, pension: "3232000.00" },
];
export const voluntaryTopUpStrategy: LegalStrategy = {
  engineCode: VOLUNTARY_TOP_UP_ENGINE, branch: VOLUNTARY_TOP_UP_BRANCH, strategyCode: VOLUNTARY_TOP_UP_STRATEGY,
  fixtureSuiteHash: digest({ version: "VOLUNTARY-TOP-UP-1", base: voluntaryBenefitStrategy.fixtureSuiteHash, goldens,
    paymentRate2026: "0.31", minimum2026: "1500000", quote60: "58110779.05", guards: ["COUNT", "RECEIPT", "INCOME", "RATE", "DATE"] }),
  validate(document) {
    const base = validateVoluntaryPaymentRules(document, VOLUNTARY_TOP_UP_BRANCH, VOLUNTARY_TOP_UP_CITATIONS);
    const record = (id: string, actual: unknown, expected: unknown) => base.cases.push({ id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    // Exercise the submitted tables, including payment-date and benefit-date
    // lookups. A missing fixture cohort/factor must not pass publication.
    for (const g of goldens) {
      const f = voluntaryTopUpValidationCase(g.sex, g.regime), r = assessVoluntaryTopUpBenefit(f.history, f.input, document, "2026-10-07");
      const quote = r.breakdown.find(b => b.code === "TOP_UP_GROSS_CONTRIBUTION")?.value;
      record(`TOP-UP-${g.sex}-${g.regime}`, { status: r.assessmentStatus, pension: r.monthlyPension && new D(r.monthlyPension).toFixed(2), start: r.startMonth,
        months: r.countedMonths, quote: quote && new D(quote).toFixed(2) }, { status: "ELIGIBLE", pension: g.pension, start: "2026-07", months: 180, quote: "58110779.05" });
    }
    const f = voluntaryTopUpValidationCase(), assess = () => assessVoluntaryTopUpBenefit(f.history, f.input, document, "2026-10-07");
    f.input.voluntaryTopUp.missingMonths = 59; record("TOP-UP-COUNT", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.voluntaryTopUp.missingMonths = 60; f.input.voluntaryTopUp.evidence = [{ ...f.input.voluntaryTopUp.evidence[0], confirmedOn: "2026-06-01" }];
    record("TOP-UP-RECEIPT", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.voluntaryTopUp.evidence = f.history.months[0].evidence; f.input.voluntaryTopUp.monthlyIncome = "48000000";
    record("TOP-UP-PAYMENT-CEILING", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.voluntaryTopUp.monthlyIncome = "4000000";
    record("TOP-UP-NO-RATE", assessVoluntaryTopUpBenefit(f.history, f.input, { ...document, tables: document.tables.filter(t => t.kind !== "FUND_MONTHLY_RATE") }, "2026-10-07").monthlyPension, null);
    f.input.intendedBenefitDate = "2026-08-01"; record("TOP-UP-START", assess().assessmentStatus, "INSUFFICIENT_DATA");
    return base;
  },
};

export function validateVoluntaryPaymentRules(document: LegalRuleDocument, branch: string, requiredCitations: string[]) {
    const paymentTable = (t: LegalRuleDocument["tables"][number]) => t.kind === "FUND_MONTHLY_RATE" || (t.kind === "REFERENCE_AMOUNT" && t.key === "VOLUNTARY_MIN_INCOME");
    const base = voluntaryBenefitStrategy.validate({ ...document, engineCode: VOLUNTARY_ENGINE,
      coverage: document.coverage.map(c => c.branch === branch ? { ...c, branch: VOLUNTARY_BRANCH, strategyCode: VOLUNTARY_STRATEGY } : c),
      tables: document.tables.filter(t => !paymentTable(t)) });
    const add = (path: string, code: string) => base.issues.push({ path, code });
    const coverage = document.coverage.find(c => c.branch === branch);
    for (const id of requiredCitations) if (!coverage?.citationIds.includes(id) || !document.citations.some(c => c.id === id)) add("citations", "STATUTORY_CITATION_REQUIRED:" + id);
    for (const key of ["FUND_MONTHLY_RATE:2026", "REFERENCE_AMOUNT:VOLUNTARY_MIN_INCOME", "REFERENCE_AMOUNT:GENERAL"])
      if (!coverage?.requiredTableKeys.includes(key) || !document.tables.some(t => `${t.kind}:${t.key}` === key)) add("tables", "BRANCH_TABLE_REQUIRED:" + key);
    document.tables.filter(paymentTable).forEach(t => {
      const rate = t.kind === "FUND_MONTHLY_RATE", citation = document.citations.find(c => c.id === t.citationId);
      if (t.key !== (rate ? "2026" : "VOLUNTARY_MIN_INCOME") || !new D(t.value).eq(rate ? "0.31" : "1500000") ||
        t.effectiveFrom !== "2026-01-01" || t.effectiveTo !== "2027-01-01" || t.citationId !== (rate ? "CV151_FUND_RATE_2026" : "ND351_ART2")) add("tables." + t.key, "UNVERIFIED_PAYMENT_TABLE");
      if (!citation || citation.effectiveFrom > t.effectiveFrom || (citation.effectiveTo && (!t.effectiveTo || t.effectiveTo > citation.effectiveTo))) add("tables." + t.key, "TABLE_OUTSIDE_CITATION_PERIOD");
    });
    return base;
}
