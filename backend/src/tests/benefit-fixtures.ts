import { addMonths } from "../common/calendar";
import { digest } from "../common/digest";
import { insuranceHistorySchema, pensionEstimateInputSchema, type LegalRuleDocument } from "../modules/pensions/insurance-schema";
import { BENEFIT_ENGINE, ORDINARY_BRANCH, ORDINARY_STRATEGY, ORDINARY_CITATIONS, normalCohortAge } from "../modules/pensions/benefit-assessment";
import { wageFactors2026 } from "../modules/pensions/benefit-validation";
import { BENEFIT_ENGINE_V2, ORDINARY_STRATEGY_V2, ORDINARY_CITATIONS_V2 } from "../modules/pensions/benefit-assessment-v2";
import { STATE_BENEFIT_ENGINE, STATE_BRANCH, STATE_STRATEGY, STATE_CITATIONS } from "../modules/pensions/state-assessment";
// Test-only document: canonical numbers, synthetic evidence hashes. Never seed.
export function validatedBenefitFixture(months = 180) {
  const f = benefitFixture(months);
  f.rules.citations.forEach(c => { c.url = "https://vanban.chinhphu.vn/"; });
  f.rules.tables.filter(t => t.kind === "WAGE_FACTOR").forEach(t => { t.value = wageFactors2026[t.key.split(":")[1]]; });
  return f;
}
export function benefitFixtureV2(months = 180, sex: "MALE" | "FEMALE" = "MALE") {
  const f = benefitFixture(months, sex);
  f.rules.engineCode = BENEFIT_ENGINE_V2;
  f.rules.coverage[0].strategyCode = ORDINARY_STRATEGY_V2;
  f.rules.coverage[0].citationIds = ORDINARY_CITATIONS_V2;
  f.rules.citations.push(...["LAW_ART68", "TT12_ART14"].map(id => ({ ...f.rules.citations[0], id })));
  return f;
}
export function stateBenefitFixture(months = 180, employerMonths = 0) {
  const f = benefitFixtureV2(months);
  f.rules.engineCode = STATE_BENEFIT_ENGINE;
  f.rules.coverage[0] = { branch: STATE_BRANCH, strategyCode: STATE_STRATEGY, citationIds: STATE_CITATIONS, requiredTableKeys: [] };
  f.rules.citations.push(...["ND158_ART15", "LAW_ART31"].map(id => ({ ...f.rules.citations[0], id })));
  f.history.months.forEach((r, i) => {
    if (i < employerMonths) { r.contributionBase = "20000000"; return; }
    r.salaryRegime = "STATE"; r.participantCategory = "ARTICLE_2_1_B";
    r.stateSalary = { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "4", evidence: r.evidence };
  });
  f.input.stateSalaryCase = { firstParticipationMonth: f.history.coverageFrom, firstParticipationEvidence: f.history.months[0].evidence,
    salaryTreatment: "ORDINARY", treatmentEvidence: f.history.months[0].evidence };
  return f;
}
export function benefitFixture(months = 180, sex: "MALE" | "FEMALE" = "MALE") {
  const end = "2026-06", first = addMonths(end, 1 - months), birth = sex === "MALE" ? "1964-01" : "1969-01";
  const evidence = { reference: "Synthetic statutory fixture", contentHash: digest("fixture"), confirmedOn: "2026-07-01" };
  const history = insuranceHistorySchema.parse({ schemaVersion: 1, birth: { precision: "MONTH", declaredValue: birth }, legalSex: sex,
    coverageFrom: first, coverageThrough: end, confirmedThroughMonth: end, specialPeriods: [],
    months: Array.from({ length: months }, (_, i) => ({ month: addMonths(first, i), scheme: "COMPULSORY", salaryRegime: "EMPLOYER", status: "PAID",
      participantCategory: "ARTICLE_2_1_A", contributionBase: "10000000", evidence: [evidence] })) });
  const input = pensionEstimateInputSchema.parse({ historyVersionId: "10000000-0000-4000-8000-000000000001", expectedHistoryRevision: 1,
    legalRuleSetVersionId: "10000000-0000-4000-8000-000000000002", intendedBenefitDate: "2026-07-01", employmentEndDate: "2026-06-30", contributionStopMonth: end,
    benefitRequestDate: null, futureContributions: [], caseDetails: { kind: "NORMAL_EMPLOYEE", participationAtRetirement: "ACTIVE_COMPULSORY",
      benefitStart: { kind: "EMPLOYER_NOTICE", month: "2026-07", evidence: [evidence] } } });
  const years = [...new Set(history.months.map(r => Number(r.month.slice(0, 4)) < 1995 ? "PRE_1995" : r.month.slice(0, 4)))];
  const rules: LegalRuleDocument = { schemaVersion: 1, engineCode: BENEFIT_ENGINE,
    coverage: [{ branch: ORDINARY_BRANCH, strategyCode: ORDINARY_STRATEGY, citationIds: ORDINARY_CITATIONS, requiredTableKeys: [] }],
    citations: [...ORDINARY_CITATIONS, "COEFFICIENT_FIXTURE"].map(id => ({ id, instrument: "Fixture only", locator: id, url: "https://example.org/fixture", contentHash: digest(id), effectiveFrom: "2025-07-01", effectiveTo: null })),
    tables: [{ kind: "AGE_MONTHS", key: `NORMAL:${sex}:${birth}`, value: String(normalCohortAge(sex, birth)), citationId: "ND135_ANNEX_I", effectiveFrom: "2025-07-01", effectiveTo: null },
      ...years.map(year => ({ kind: "WAGE_FACTOR" as const, key: `2026:${year}`, value: "1", citationId: "COEFFICIENT_FIXTURE", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01" })),
      { kind: "REFERENCE_AMOUNT", key: "GENERAL", value: "2530000", citationId: "ND158_ART13", effectiveFrom: "2026-07-01", effectiveTo: "2027-01-01" }] };
  return { history, input, rules };
}
