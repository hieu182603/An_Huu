import { digest } from "../../common/digest";
import { addMonths } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { ordinaryBenefitStrategyV2 } from "./benefit-validation-v2";
import { BENEFIT_ENGINE_V2, ORDINARY_STRATEGY_V2 } from "./benefit-assessment-v2";
import { ORDINARY_BRANCH } from "./benefit-assessment";
import { assessStateBenefit, assessStateBenefitV2, STATE_BENEFIT_ENGINE, STATE_BENEFIT_ENGINE_V2, STATE_BRANCH, STATE_CITATIONS, STATE_CITATIONS_V2, STATE_STRATEGY, STATE_STRATEGY_V2 } from "./state-assessment";
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

// Hand-computed v2 goldens (reference 2,530,000; male born 1964-01, benefit 2026-07):
// G1 60 credited months coef2 + 117 converted coef2 + 261 coef4 = 438m (75%): window avg 4×ref > all-time → 7,590,000.
// G2 60 credited coef6 + 378 coef3: all-time 1494/438×ref > window 3×ref → ×75% = 6,472,294.52.
// G3 officer 2000-01..2010-12 coef6, transfer 2011-01, coef3 to 2026-06 = 318m (26.5y, 58%): before-transfer 72m 6×ref → 8,804,400.
// G4 hazardous 1995-01..2012-12 coef5 (216m), other work from 2013-01 coef3; declared window 2007-01..2012-12 (N=72)
//    5×ref = 12,650,000 > final 3×ref; 378m = 31.5y → 68% → 8,602,000.
// G5 seniority (3)(b): 2004-10..2026-06 coef4, allowance in every month, change 2010-01; 261m → 22y → 49% → 4,958,800.
type GoldenV2 = { id: string; from: string; credited: string | null; early: string; late: string; transfer: string | null; expected: string;
  treatment?: "HAZARDOUS_TRANSFER" | "SENIORITY_ALLOWANCE_TRANSFER"; hazard?: [string, string]; windowFrom?: string };
const goldensV2: readonly GoldenV2[] = [
  { id: "BH2-V2-CREDITED-WINDOW", from: "1990-01", credited: "2", early: "2", late: "4", transfer: null, expected: "7590000.00" },
  { id: "BH2-V2-CREDITED-ALLTIME", from: "1990-01", credited: "6", early: "3", late: "3", transfer: null, expected: "6472294.52" },
  { id: "BH2-V2-MILITARY-TRANSFER", from: "2000-01", credited: null, early: "6", late: "3", transfer: "2011-01", expected: "8804400.00" },
  { id: "BH2-V2-HAZARDOUS-TRANSFER", from: "1995-01", credited: null, early: "5", late: "3", transfer: "2013-01", expected: "8602000.00",
    treatment: "HAZARDOUS_TRANSFER", hazard: ["1995-01", "2012-12"], windowFrom: "2007-01" },
  { id: "BH2-V2-SENIORITY-B", from: "2004-10", credited: null, early: "4", late: "4", transfer: "2010-01", expected: "4958800.00", treatment: "SENIORITY_ALLOWANCE_TRANSFER" },
];
export const stateBenefitStrategyV2: LegalStrategy = {
  engineCode: STATE_BENEFIT_ENGINE_V2, branch: STATE_BRANCH, strategyCode: STATE_STRATEGY_V2,
  fixtureSuiteHash: digest({ version: "STATE-MIXED-2", base: stateBenefitStrategy.fixtureSuiteHash, goldensV2 }),
  validate(document) {
    const transformed = { ...document, engineCode: STATE_BENEFIT_ENGINE, coverage: document.coverage.map(c => c.branch === STATE_BRANCH ? { ...c, strategyCode: STATE_STRATEGY } : c) };
    const result = stateBenefitStrategy.validate(transformed), branch = document.coverage.find(c => c.branch === STATE_BRANCH);
    for (const id of STATE_CITATIONS_V2) if (!branch?.citationIds.includes(id) || !document.citations.some(c => c.id === id))
      if (!result.issues.some(i => i.code === "STATUTORY_CITATION_REQUIRED:" + id)) result.issues.push({ path: "citations", code: "STATUTORY_CITATION_REQUIRED:" + id });
    const evidence = { reference: "SERVER_VALIDATION_FIXTURE", contentHash: digest("fixture"), confirmedOn: "2026-07-01" };
    for (const g of goldensV2) {
      const months = [];
      for (let month: string = g.from; month <= "2026-06"; month = addMonths(month, 1)) {
        const credited = g.credited !== null && month < "1995-01", armed = !g.treatment && g.transfer !== null && month < g.transfer;
        const coefficient = credited ? g.credited! : armed || month < "2004-10" || (g.transfer !== null && month < g.transfer) ? g.early : g.late;
        months.push({ month, scheme: "COMPULSORY", salaryRegime: "STATE", status: credited ? "CREDITED" : "PAID",
          ...(credited ? { creditKind: armed ? "PRE_1995_ARMED_FORCES" : "PRE_1995_STATE_SECTOR" } : {}),
          contributionBase: credited ? null : "1000000", participantCategory: armed ? "ARTICLE_2_1_D" : "ARTICLE_2_1_B", evidence: [evidence],
          stateSalary: { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: coefficient, evidence: [evidence],
            ...(g.treatment === "SENIORITY_ALLOWANCE_TRANSFER" ? { includesSeniorityAllowance: true } : {}),
            ...(month < "2004-10" ? { pre2004Conversion: { scale: armed ? "ND204_ARMED_FORCES" : "ND204_PUBLIC", evidence: [evidence] } } : {}) } });
      }
      const history = insuranceHistorySchema.parse({ schemaVersion: 1, birth: { precision: "MONTH", declaredValue: "1964-01" }, legalSex: "MALE",
        coverageFrom: g.from, coverageThrough: "2026-06", confirmedThroughMonth: "2026-06", specialPeriods: [], months });
      const input = pensionEstimateInputSchema.parse({ historyVersionId: "00000000-0000-4000-8000-000000000001", expectedHistoryRevision: 1, legalRuleSetVersionId: "00000000-0000-4000-8000-000000000002",
        intendedBenefitDate: "2026-07-01", employmentEndDate: "2026-06-30", contributionStopMonth: "2026-06", benefitRequestDate: null, futureContributions: [],
        caseDetails: { kind: "NORMAL_EMPLOYEE", participationAtRetirement: "ACTIVE_COMPULSORY", benefitStart: { kind: "EMPLOYER_NOTICE", month: "2026-07", evidence: [evidence] } },
        stateSalaryCase: { firstParticipationMonth: g.from, firstParticipationEvidence: [evidence], salaryTreatment: g.treatment ?? (g.transfer ? "MILITARY_TRANSFER" : "ORDINARY"),
          treatmentEvidence: [evidence], ...(g.transfer ? { transferMonth: g.transfer } : {}),
          ...(g.hazard ? { hazardousPeriods: [{ fromMonth: g.hazard[0], toMonth: g.hazard[1], evidence: [evidence] }], hazardousWindowFrom: g.windowFrom } : {}) } });
      const rules: LegalRuleDocument = { ...document, tables: [
        { kind: "AGE_MONTHS", key: "NORMAL:MALE:1964-01", value: "735", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01", citationId: "ND135_ANNEX_I" },
        { kind: "REFERENCE_AMOUNT", key: "GENERAL", value: "2530000", effectiveFrom: "2026-07-01", effectiveTo: "2027-01-01", citationId: "ND158_ART13" }] };
      const assessment = assessStateBenefitV2(history, input, rules, "2026-10-05");
      const actual = { status: assessment.assessmentStatus, amount: assessment.monthlyPension === null ? null : new D(assessment.monthlyPension).toFixed(2) }, expected = { status: "ELIGIBLE", amount: g.expected };
      result.cases.push({ id: g.id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    }
    return result;
  },
};
