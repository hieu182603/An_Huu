import { digest } from "../../common/digest";
import { addMonths } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { ordinaryBenefitStrategyV2 } from "./benefit-validation-v2";
import { BENEFIT_ENGINE_V2, ORDINARY_STRATEGY_V2 } from "./benefit-assessment-v2";
import { ORDINARY_BRANCH } from "./benefit-assessment";
import { assessStateBenefit, STATE_BENEFIT_ENGINE, STATE_BRANCH, STATE_CITATIONS, STATE_STRATEGY } from "./state-assessment";
import { insuranceHistorySchema, pensionEstimateInputSchema, type LegalRuleDocument } from "./insurance-schema";
import type { LegalStrategy } from "./legal-validation";
const goldens = [
  { id: "BH2-STATE-180", employerMonths: 0, expected: "4048000.00" },
  { id: "BH2-MIXED-180", employerMonths: 60, expected: "5365333.33" },
];
export const stateBenefitStrategy: LegalStrategy = {
  engineCode: STATE_BENEFIT_ENGINE, branch: STATE_BRANCH, strategyCode: STATE_STRATEGY,
  fixtureSuiteHash: digest({ version: "STATE-MIXED-1", base: ordinaryBenefitStrategyV2.fixtureSuiteHash, goldens }),
  validate(document) {
    const transformed = { ...document, engineCode: BENEFIT_ENGINE_V2, coverage: document.coverage.map(c => c.branch === STATE_BRANCH ? { ...c, branch: ORDINARY_BRANCH, strategyCode: ORDINARY_STRATEGY_V2 } : c) };
    const result = ordinaryBenefitStrategyV2.validate(transformed), branch = document.coverage.find(c => c.branch === STATE_BRANCH);
    for (const id of STATE_CITATIONS) if (!branch?.citationIds.includes(id) || !document.citations.some(c => c.id === id))
      result.issues.push({ path: "citations", code: "STATUTORY_CITATION_REQUIRED:" + id });
    const evidence = { reference: "SERVER_VALIDATION_FIXTURE", contentHash: digest("fixture"), confirmedOn: "2026-07-01" };
    for (const g of goldens) {
      const history = insuranceHistorySchema.parse({ schemaVersion: 1, birth: { precision: "MONTH", declaredValue: "1964-01" }, legalSex: "MALE",
        coverageFrom: "2011-07", coverageThrough: "2026-06", confirmedThroughMonth: "2026-06", specialPeriods: [],
        months: Array.from({ length: 180 }, (_, i) => ({ month: addMonths("2011-07", i), scheme: "COMPULSORY", salaryRegime: i < g.employerMonths ? "EMPLOYER" : "STATE",
          status: "PAID", contributionBase: i < g.employerMonths ? "20000000" : "5000000", participantCategory: "ARTICLE_2_1_A", evidence: [evidence],
          ...(i < g.employerMonths ? {} : { stateSalary: { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "4", evidence: [evidence] } }) })) });
      const input = pensionEstimateInputSchema.parse({ historyVersionId: "00000000-0000-4000-8000-000000000001", expectedHistoryRevision: 1, legalRuleSetVersionId: "00000000-0000-4000-8000-000000000002",
        intendedBenefitDate: "2026-07-01", employmentEndDate: "2026-06-30", contributionStopMonth: "2026-06", benefitRequestDate: null, futureContributions: [],
        caseDetails: { kind: "NORMAL_EMPLOYEE", participationAtRetirement: "ACTIVE_COMPULSORY", benefitStart: { kind: "EMPLOYER_NOTICE", month: "2026-07", evidence: [evidence] } },
        stateSalaryCase: { firstParticipationMonth: "2011-07", firstParticipationEvidence: [evidence], salaryTreatment: "ORDINARY", treatmentEvidence: [evidence] } });
      // Isolated arithmetic corpus: factor1 to make weighted means independently
      // auditable. Supplied production factors were checked by the base strategy.
      const rules: LegalRuleDocument = { ...document, tables: [
        { kind: "AGE_MONTHS", key: "NORMAL:MALE:1964-01", value: "735", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01", citationId: "ND135_ANNEX_I" },
        { kind: "REFERENCE_AMOUNT", key: "GENERAL", value: "2530000", effectiveFrom: "2026-07-01", effectiveTo: "2027-01-01", citationId: "ND158_ART13" },
        ...Array.from({ length: 16 }, (_, i) => ({ kind: "WAGE_FACTOR" as const, key: `2026:${2011 + i}`, value: "1", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01", citationId: "LAW_ART73" }))] };
      const assessment = assessStateBenefit(history, input, rules, "2026-10-05"), actual = { status: assessment.assessmentStatus, amount: assessment.monthlyPension === null ? null : new D(assessment.monthlyPension).toFixed(2) }, expected = { status: "ELIGIBLE", amount: g.expected };
      result.cases.push({ id: g.id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    }
    return result;
  },
};
