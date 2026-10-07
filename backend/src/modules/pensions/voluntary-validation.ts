import { digest } from "../../common/digest";
import { addMonths } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { insuranceHistorySchema, type LegalRuleDocument } from "./insurance-schema";
import { normalCohortAge } from "./benefit-assessment";
import { wageFactors2026 } from "./benefit-validation";
import { assessVoluntaryBenefit, voluntaryEstimateInputSchema, VOLUNTARY_BRANCH, VOLUNTARY_CITATIONS, VOLUNTARY_ENGINE, VOLUNTARY_STRATEGY,
  assessVoluntaryStateBenefit, VOLUNTARY_STATE_ENGINE, VOLUNTARY_STATE_BRANCH, VOLUNTARY_STATE_STRATEGY, VOLUNTARY_STATE_CITATIONS } from "./voluntary-assessment";
import type { LegalStrategy } from "./legal-validation";

// CV340/BHXH-CSXH, signed03/02/2026, income column starts at2008.
// Both signed pages were visually checked; do not infer earlier income factors.
export const incomeFactors2026 = Object.freeze(Object.fromEntries(Object.entries(wageFactors2026).filter(([year]) => Number(year) >= 2008)));
// Independently calculated with Python Decimal80 over180 explicit months.
const goldens = [{ id: "VOL-MALE180", sex: "MALE" as const, compulsory: 0, expected: "4937333.33" },
  { id: "VOL-FEMALE180", sex: "FEMALE" as const, compulsory: 0, expected: "5554500.00" },
  { id: "VOL-MIXED180", sex: "MALE" as const, compulsory: 120, expected: "4092533.33" }];

export function voluntaryValidationCase(sex: "MALE" | "FEMALE", compulsory: number) {
  const evidence = [{ reference: "SERVER_VALIDATION_FIXTURE", contentHash: digest("voluntary fixture"), confirmedOn: "2026-07-01" }];
  const birth = sex === "MALE" ? "1964-01" : "1969-01";
  const history = insuranceHistorySchema.parse({ schemaVersion: 1, birth: { precision: "MONTH", declaredValue: birth }, legalSex: sex,
    coverageFrom: "2011-07", coverageThrough: "2026-06", confirmedThroughMonth: "2026-06", specialPeriods: [],
    months: Array.from({ length: 180 }, (_, i) => ({ month: addMonths("2011-07", i), scheme: i < compulsory ? "COMPULSORY" : "VOLUNTARY",
      salaryRegime: i < compulsory ? "EMPLOYER" : "VOLUNTARY_INCOME", status: "PAID", evidence,
      contributionBase: compulsory && i >= compulsory ? "4000000" : "10000000", ...(i < compulsory ? { participantCategory: "ARTICLE_2_1_A" } : {}) })) });
  const input = voluntaryEstimateInputSchema.parse({ historyVersionId: "00000000-0000-4000-8000-000000000001", expectedHistoryRevision: 1,
    legalRuleSetVersionId: "00000000-0000-4000-8000-000000000002", intendedBenefitDate: "2026-07-01", employmentEndDate: compulsory ? "2021-06-30" : null,
    contributionStopMonth: "2026-06", benefitRequestDate: null, futureContributions: [], voluntaryCase: { kind: "NORMAL_VOLUNTARY", ageRule: "NORMAL", paymentMethod: "REGULAR_ONLY",
      benefitStart: { kind: "ELIGIBILITY", month: "2026-07", confirmation: "DOCUMENTED", evidence } } });
  return { history, input };
}

export const voluntaryBenefitStrategy: LegalStrategy = {
  engineCode: VOLUNTARY_ENGINE, branch: VOLUNTARY_BRANCH, strategyCode: VOLUNTARY_STRATEGY,
  fixtureSuiteHash: digest({ version: "VOLUNTARY-MIXED-1", goldens, incomeFactors2026, guards: ["179", "UNKNOWN", "MISSING_FACTOR", "CREDITED", "CONTINUED"] }),
  validate(document) {
    const issues: Array<{ path: string; code: string }> = [], add = (path: string, code: string) => issues.push({ path, code });
    const coverage = document.coverage.find(c => c.branch === VOLUNTARY_BRANCH);
    for (const id of VOLUNTARY_CITATIONS) if (!coverage?.citationIds.includes(id) || !document.citations.some(c => c.id === id)) add("citations", "STATUTORY_CITATION_REQUIRED:" + id);
    for (const c of document.citations) {
      const host = new URL(c.url).hostname;
      if (!(host === "xdcs.cdnchinhphu.vn" || host === "chinhphu.vn" || host.endsWith(".chinhphu.vn") || host === "baohiemxahoi.gov.vn" || host.endsWith(".baohiemxahoi.gov.vn") || host === "vbpl.vn" || host.endsWith(".vbpl.vn"))) add("citations." + c.id, "OFFICIAL_LEGAL_SOURCE_REQUIRED");
    }
    for (const kind of ["AGE_MONTHS", "INCOME_FACTOR"] as const) if (!document.tables.some(t => t.kind === kind)) add("tables." + kind, "BRANCH_TABLE_REQUIRED");
    document.tables.forEach((t, i) => {
      const path = `tables.${i}`;
      const source = document.citations.find(c => c.id === t.citationId);
      if (!source || source.effectiveFrom > t.effectiveFrom || (source.effectiveTo && (!t.effectiveTo || t.effectiveTo > source.effectiveTo))) add(path, "TABLE_OUTSIDE_CITATION_PERIOD");
      if (t.kind === "AGE_MONTHS") {
        const m = /^NORMAL:(MALE|FEMALE):((?:19|20|21)\d{2}-(?:0[1-9]|1[0-2]))$/.exec(t.key), age = m ? normalCohortAge(m[1] as "MALE" | "FEMALE", m[2]) : null;
        if (age === null || !new D(t.value).eq(age)) add(path, "UNVERIFIED_AGE_COHORT");
      } else if (t.kind === "WAGE_FACTOR" || t.kind === "INCOME_FACTOR") {
        const [year, paidYear, extra] = t.key.split(":"), expected = (t.kind === "INCOME_FACTOR" ? incomeFactors2026 : wageFactors2026)[paidYear];
        if (extra !== undefined || year !== "2026" || !expected || !new D(t.value).eq(expected) || t.effectiveFrom < "2026-01-01" || !t.effectiveTo || t.effectiveTo > "2027-01-01") add(path, "UNVERIFIED_BENEFIT_YEAR_COEFFICIENT");
      } else if (t.kind === "REFERENCE_AMOUNT") {
        const first = t.effectiveFrom < "2026-07-01", expected = first ? "2340000" : "2530000", end = first ? "2026-07-01" : "2027-01-01";
        if (t.key !== "GENERAL" || t.effectiveFrom < "2026-01-01" || t.effectiveFrom >= "2027-01-01" || !new D(t.value).eq(expected) || !t.effectiveTo || t.effectiveTo > end) add(path, "UNVERIFIED_REFERENCE_AMOUNT");
      } else add(path, "TABLE_KIND_OUTSIDE_BRANCH");
    });
    const rules: LegalRuleDocument = { ...document, tables: [
      ...(["MALE", "FEMALE"] as const).map(sex => { const birth = sex === "MALE" ? "1964-01" : "1969-01"; return { kind: "AGE_MONTHS" as const, key: `NORMAL:${sex}:${birth}`, value: String(normalCohortAge(sex, birth)), citationId: "ND135_ANNEX_I", effectiveFrom: "2025-07-01", effectiveTo: null }; }),
      ...Object.entries(incomeFactors2026).map(([year, value]) => ({ kind: "INCOME_FACTOR" as const, key: `2026:${year}`, value, citationId: "ND159_ART10", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01" })),
      ...Object.entries(wageFactors2026).map(([year, value]) => ({ kind: "WAGE_FACTOR" as const, key: `2026:${year}`, value, citationId: "LAW_ART73", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01" })),
    ] };
    const cases: ReturnType<LegalStrategy["validate"]>["cases"] = [];
    const record = (id: string, actual: unknown, expected: unknown) => cases.push({ id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    for (const g of goldens) {
      const f = voluntaryValidationCase(g.sex, g.compulsory), r = assessVoluntaryBenefit(f.history, f.input, rules, "2026-10-07");
      record(g.id, { status: r.assessmentStatus, pension: r.monthlyPension === null ? null : new D(r.monthlyPension).toFixed(2), start: r.startMonth }, { status: "ELIGIBLE", pension: g.expected, start: "2026-07" });
    }
    const f = voluntaryValidationCase("MALE", 0);
    const assessment = () => assessVoluntaryBenefit(f.history, f.input, rules, "2026-10-07");
    f.history.months[0].status = "NOT_CONTRIBUTED"; f.history.months[0].contributionBase = null;
    record("VOL-179", assessment().assessmentStatus, "NOT_YET_ELIGIBLE");
    f.history.months[0].status = "UNKNOWN";
    record("VOL-UNKNOWN", assessment().assessmentStatus, "INSUFFICIENT_DATA");
    f.history.months[0].status = "CREDITED"; f.history.months[0].creditKind = "UNKNOWN_CREDIT"; f.history.months[0].contributionBase = "10000000";
    record("VOL-CREDITED", assessment().assessmentStatus, "REVIEW_REQUIRED");
    f.history.months[0].status = "PAID"; delete f.history.months[0].creditKind;
    record("VOL-MISSING_FACTOR", assessVoluntaryBenefit(f.history, f.input, { ...rules, tables: rules.tables.filter(t => t.kind !== "INCOME_FACTOR") }, "2026-10-07").monthlyPension, null);
    f.input.voluntaryCase.benefitStart.kind = "CONTINUED_CONTRIBUTIONS";
    record("VOL-CONTINUED_INVALID", assessment().assessmentStatus, "INSUFFICIENT_DATA");
    return { issues, cases };
  },
};

// Independently summed Python Decimal80: state coefficient4/reference2530000,
// employer bases10m and voluntary bases4m over Jul2011–Jun2026.
const stateGoldens = [{ state: 120, employer: 0, expected: "3261866.67" }, { state: 60, employer: 60, expected: "3539200.00" }, { state: 179, employer: 0, expected: "4034400.00" }];
export const voluntaryStateBenefitStrategy: LegalStrategy = {
  engineCode: VOLUNTARY_STATE_ENGINE, branch: VOLUNTARY_STATE_BRANCH, strategyCode: VOLUNTARY_STATE_STRATEGY,
  fixtureSuiteHash: digest({ base: voluntaryBenefitStrategy.fixtureSuiteHash, version: "VOLUNTARY-STATE-1", stateGoldens, guards: ["COEFFICIENT", "FIRST_PARTICIPATION", "SPECIAL_TREATMENT"] }),
  validate(document) {
    const baseDocument = { ...document, engineCode: VOLUNTARY_ENGINE, coverage: document.coverage.map(c => c.branch === VOLUNTARY_STATE_BRANCH ? { ...c, branch: VOLUNTARY_BRANCH, strategyCode: VOLUNTARY_STRATEGY } : c) };
    const base = voluntaryBenefitStrategy.validate(baseDocument);
    const coverage = document.coverage.find(c => c.branch === VOLUNTARY_STATE_BRANCH);
    for (const id of VOLUNTARY_STATE_CITATIONS) if (!coverage?.citationIds.includes(id) || !document.citations.some(c => c.id === id)) base.issues.push({ path: "citations", code: "STATUTORY_CITATION_REQUIRED:" + id });
    if (!document.tables.some(t => t.kind === "REFERENCE_AMOUNT")) base.issues.push({ path: "tables.REFERENCE_AMOUNT", code: "BRANCH_TABLE_REQUIRED" });
    const rules: LegalRuleDocument = { ...document, tables: [
      { kind: "AGE_MONTHS", key: "NORMAL:MALE:1964-01", value: "735", citationId: "ND135_ANNEX_I", effectiveFrom: "2025-07-01", effectiveTo: null },
      { kind: "REFERENCE_AMOUNT", key: "GENERAL", value: "2530000", citationId: "LAW_ART31", effectiveFrom: "2026-07-01", effectiveTo: "2027-01-01" },
      ...Object.entries(incomeFactors2026).map(([year, value]) => ({ kind: "INCOME_FACTOR" as const, key: `2026:${year}`, value, citationId: "ND159_ART10", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01" })),
      ...Object.entries(wageFactors2026).map(([year, value]) => ({ kind: "WAGE_FACTOR" as const, key: `2026:${year}`, value, citationId: "LAW_ART73", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01" })),
    ] };
    const make = (state: number, employer: number) => {
      const f = voluntaryValidationCase("MALE", state + employer);
      f.input.employmentEndDate = f.history.months[state + employer - 1].month + "-28";
      f.input.stateSalaryCase = { firstParticipationMonth: f.history.coverageFrom, firstParticipationEvidence: f.history.months[0].evidence,
        salaryTreatment: "ORDINARY", treatmentEvidence: f.history.months[0].evidence };
      f.history.months.slice(0, state).forEach(r => { r.salaryRegime = "STATE"; r.participantCategory = "ARTICLE_2_1_B"; r.stateSalary = { kind: "CURRENT_SCALE_COEFFICIENT", totalContributionCoefficient: "4", evidence: r.evidence }; });
      return f;
    };
    const record = (id: string, actual: unknown, expected: unknown) => base.cases.push({ id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    for (const g of stateGoldens) {
      const f = make(g.state, g.employer), r = assessVoluntaryStateBenefit(f.history, f.input, rules, "2026-10-07");
      record(`STATE-VOL-${g.state}-${g.employer}`, { status: r.assessmentStatus, pension: r.monthlyPension === null ? null : new D(r.monthlyPension).toFixed(2) }, { status: "ELIGIBLE", pension: g.expected });
    }
    const f = make(120, 0), assess = () => assessVoluntaryStateBenefit(f.history, f.input, rules, "2026-10-07");
    delete f.history.months[0].stateSalary;
    record("STATE-VOL-COEFFICIENT", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.stateSalaryCase!.firstParticipationMonth = "2012-01";
    record("STATE-VOL-FIRST", assess().assessmentStatus, "INSUFFICIENT_DATA");
    f.input.stateSalaryCase!.salaryTreatment = "UNKNOWN";
    record("STATE-VOL-SPECIAL", assess().assessmentStatus, "REVIEW_REQUIRED");
    return base;
  },
};
