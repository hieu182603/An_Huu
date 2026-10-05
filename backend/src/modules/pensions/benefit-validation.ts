import { addMonths } from "../../common/calendar";
import { digest } from "../../common/digest";
import { RetirementDecimal as D } from "../retirement/engine";
import { insuranceHistorySchema, pensionEstimateInputSchema, type LegalRuleDocument } from "./insurance-schema";
import { assessOrdinaryBenefit, BENEFIT_ENGINE, normalCohortAge, ORDINARY_BRANCH, ORDINARY_CITATIONS, ORDINARY_STRATEGY } from "./benefit-assessment";
import type { LegalStrategy } from "./legal-validation";

// R07, CV340/BHXH-CSXH 03/02/2026. No coefficients for a later benefit year.
export const wageFactors2026: Readonly<Record<string, string>> = {
  PRE_1995: "5.81", 1995: "4.91", 1996: "4.65", 1997: "4.50", 1998: "4.18", 1999: "4.01", 2000: "4.07", 2001: "4.09", 2002: "3.94",
  2003: "3.81", 2004: "3.54", 2005: "3.27", 2006: "3.05", 2007: "2.81", 2008: "2.29", 2009: "2.14", 2010: "1.96", 2011: "1.65",
  2012: "1.51", 2013: "1.42", 2014: "1.36", 2015: "1.36", 2016: "1.32", 2017: "1.28", 2018: "1.23", 2019: "1.20", 2020: "1.16",
  2021: "1.14", 2022: "1.11", 2023: "1.07", 2024: "1.03", 2025: "1.00", 2026: "1.00",
};
// Expected money was calculated independently with Python Decimal (precision100)
// from the 2026 coefficients and a constant 10m contribution base; compare cents
// because the public engine intentionally returns unrounded precision48 values.
const goldens = [
  { id: "BH-G01", months: 180, sex: "MALE" as const, expected: "4937333.33" },
  { id: "BH-G02", months: 180, sex: "FEMALE" as const, expected: "5554500.00" },
  { id: "BH-G03-240", months: 240, sex: "MALE" as const, expected: "6764625.00" },
  { id: "BH-G03-420", months: 420, sex: "MALE" as const, expected: "20763214.29" },
  { id: "BH-G03-360", months: 360, sex: "FEMALE" as const, expected: "17331250.00" },
  { id: "BH-G04-181", months: 181, sex: "MALE" as const, expected: "5008350.83" },
];
export const ordinaryBenefitStrategy: LegalStrategy = {
  engineCode: BENEFIT_ENGINE, branch: ORDINARY_BRANCH, strategyCode: ORDINARY_STRATEGY,
  fixtureSuiteHash: digest({ version: "BH1-2026-1", goldens, wageFactors2026, guardCases: ["179", "MISSING_FACTOR", "UNSUPPORTED_BRANCH"] }),
  validate(document) {
    const issues: Array<{ path: string; code: string }> = [];
    const add = (path: string, code: string) => issues.push({ path, code });
    const coverage = document.coverage.find(c => c.branch === ORDINARY_BRANCH);
    for (const id of ORDINARY_CITATIONS) if (!coverage?.citationIds.includes(id) || !document.citations.some(c => c.id === id)) add("citations", "STATUTORY_CITATION_REQUIRED:" + id);
    for (const c of document.citations) {
      const host = new URL(c.url).hostname;
      // The official CV340 page links its signed attachment on this exact CDN
      // host. This is provenance allowlisting, not signature/hash verification.
      if (!(host === "xdcs.cdnchinhphu.vn" || host === "chinhphu.vn" || host.endsWith(".chinhphu.vn") || host === "baohiemxahoi.gov.vn" || host.endsWith(".baohiemxahoi.gov.vn") || host === "vbpl.vn" || host.endsWith(".vbpl.vn")))
        add(`citations.${c.id}`, "OFFICIAL_LEGAL_SOURCE_REQUIRED");
    }
    for (const kind of ["AGE_MONTHS", "WAGE_FACTOR", "REFERENCE_AMOUNT"] as const) if (!document.tables.some(t => t.kind === kind)) add(`tables.${kind}`, "BRANCH_TABLE_REQUIRED");
    document.tables.forEach((t, i) => {
      const path = `tables.${i}`;
      if (t.kind === "AGE_MONTHS") {
        const match = /^NORMAL:(MALE|FEMALE):((?:19|20|21)\d{2}-(?:0[1-9]|1[0-2]))$/.exec(t.key);
        const age = match ? normalCohortAge(match[1] as "MALE" | "FEMALE", match[2]) : null;
        if (age === null || !new D(t.value).eq(age)) add(path, "UNVERIFIED_AGE_COHORT");
      } else if (t.kind === "WAGE_FACTOR") {
        const [benefitYear, paidYear] = t.key.split(":");
        if (benefitYear !== "2026" || !wageFactors2026[paidYear] || !new D(t.value).eq(wageFactors2026[paidYear]) ||
          t.effectiveFrom < "2026-01-01" || !t.effectiveTo || t.effectiveTo > "2027-01-01") add(path, "UNVERIFIED_BENEFIT_YEAR_COEFFICIENT");
      } else if (t.kind === "REFERENCE_AMOUNT") {
        const firstHalf = t.effectiveFrom >= "2026-01-01" && t.effectiveFrom < "2026-07-01";
        const expected = firstHalf ? "2340000" : "2530000", end = firstHalf ? "2026-07-01" : "2027-01-01";
        if (t.key !== "GENERAL" || t.effectiveFrom < "2026-01-01" || t.effectiveFrom >= "2027-01-01" || !new D(t.value).eq(expected) || !t.effectiveTo || t.effectiveTo > end)
          add(path, "UNVERIFIED_REFERENCE_AMOUNT");
      } else add(path, "TABLE_KIND_OUTSIDE_BRANCH");
    });
    // Fixture rules are a frozen complete 2026 corpus independent of whichever
    // subset of birth cohorts/years the draft includes. Every supplied table was
    // validated against that corpus above; missing case-specific tables at runtime
    // still yield INSUFFICIENT_DATA instead of being extrapolated.
    const rules = fixtureRules(document);
    const cases = goldens.map(g => {
      const { history, input } = fixtureCase(g.months, g.sex), result = assessOrdinaryBenefit(history, input, rules, "2026-10-05");
      const actual = { status: result.assessmentStatus, pension: result.monthlyPension === null ? null : new D(result.monthlyPension).toFixed(2) }, expected = { status: "ELIGIBLE", pension: g.expected };
      return { id: g.id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) };
    });
    const guard = (id: string, actual: unknown, expected: unknown) => cases.push({ id, passed: digest(actual) === digest(expected), expectedHash: digest(expected), actualHash: digest(actual) });
    const insufficient = fixtureCase(179, "MALE");
    guard("BH-G04-179", assessOrdinaryBenefit(insufficient.history, insufficient.input, rules, "2026-10-05").assessmentStatus, "NOT_YET_ELIGIBLE");
    const missing = fixtureCase(180, "MALE");
    guard("BH-G07", assessOrdinaryBenefit(missing.history, missing.input, { ...rules, tables: rules.tables.filter(t => t.kind !== "WAGE_FACTOR") }, "2026-10-05").monthlyPension, null);
    missing.history.months[0].salaryRegime = "STATE";
    guard("BH-BRANCH-GUARD", assessOrdinaryBenefit(missing.history, missing.input, rules, "2026-10-05").assessmentStatus, "REVIEW_REQUIRED");
    return { issues, cases };
  },
};
function fixtureRules(document: LegalRuleDocument): LegalRuleDocument {
  return { ...document, tables: [
    ...(["MALE", "FEMALE"] as const).map(sex => { const birth = sex === "MALE" ? "1964-01" : "1969-01";
      return { kind: "AGE_MONTHS" as const, key: `NORMAL:${sex}:${birth}`, value: String(normalCohortAge(sex, birth)), citationId: "ND135_ANNEX_I", effectiveFrom: "2025-07-01", effectiveTo: null }; }),
    ...Object.entries(wageFactors2026).map(([year, value]) => ({ kind: "WAGE_FACTOR" as const, key: `2026:${year}`, value, citationId: "LAW_ART73", effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01" })),
    { kind: "REFERENCE_AMOUNT", key: "GENERAL", value: "2530000", citationId: "ND158_ART13", effectiveFrom: "2026-07-01", effectiveTo: "2027-01-01" },
  ] };
}
function fixtureCase(months: number, sex: "MALE" | "FEMALE") {
  const first = addMonths("2026-06", 1 - months), evidence = { reference: "SERVER_VALIDATION_FIXTURE", contentHash: digest("fixture"), confirmedOn: "2026-07-01" };
  const history = insuranceHistorySchema.parse({ schemaVersion: 1, birth: { precision: "MONTH", declaredValue: sex === "MALE" ? "1964-01" : "1969-01" }, legalSex: sex,
    coverageFrom: first, coverageThrough: "2026-06", confirmedThroughMonth: "2026-06", specialPeriods: [],
    months: Array.from({ length: months }, (_, i) => ({ month: addMonths(first, i), scheme: "COMPULSORY", salaryRegime: "EMPLOYER", participantCategory: "ARTICLE_2_1_A",
      status: "PAID", contributionBase: "10000000", evidence: [evidence] })) });
  const input = pensionEstimateInputSchema.parse({ historyVersionId: "00000000-0000-4000-8000-000000000001", expectedHistoryRevision: 1, legalRuleSetVersionId: "00000000-0000-4000-8000-000000000002",
    intendedBenefitDate: "2026-07-01", employmentEndDate: "2026-06-30", contributionStopMonth: "2026-06", benefitRequestDate: null, futureContributions: [],
    caseDetails: { kind: "NORMAL_EMPLOYEE", participationAtRetirement: "ACTIVE_COMPULSORY", benefitStart: { kind: "EMPLOYER_NOTICE", month: "2026-07", evidence: [evidence] } } });
  return { history, input };
}
