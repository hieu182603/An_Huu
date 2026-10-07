import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addMonths } from "../common/calendar";
import { digest } from "../common/digest";
import { legalRuleDraftSchema, type LegalRuleDocument } from "../modules/pensions/insurance-schema";
import { assessVoluntaryBenefit, voluntaryEstimateInputSchema } from "../modules/pensions/voluntary-assessment";
import { RetirementDecimal as D } from "../modules/retirement/engine";

const corpus = legalRuleDraftSchema.parse(JSON.parse(readFileSync(join(resolve("seed-data/legal-2026"), "bh2-voluntary-employer.draft.json"), "utf8"))).document;
const evidence = [{ reference: "BHXH statement", contentHash: digest("statement"), confirmedOn: "2025-06-30" }];

/** SYNTHETIC benefit-year tables (all factors 1) so amounts are hand-checkable; not a legal corpus. */
function syntheticRules(benefitYear: number, withLegacyCitation = true): LegalRuleDocument {
  const d = structuredClone(corpus);
  d.citations = d.citations.map(c => ({ ...c, effectiveFrom: "2000-01-01", effectiveTo: null }));
  if (withLegacyCitation) d.citations.push({ ...d.citations.find(c => c.id === "LAW_ART5")!, id: "LAW_ART141_9", locator: "Điều 141 khoản 9" });
  const factors = (kind: "INCOME_FACTOR" | "WAGE_FACTOR", citationId: string) => Array.from({ length: benefitYear - 1994 }, (_, i) => ({ kind, key: `${benefitYear}:${i === 0 ? "PRE_1995" : 1994 + i}`,
    value: "1", citationId, effectiveFrom: `${benefitYear}-01-01`, effectiveTo: `${benefitYear + 1}-01-01` }));
  d.tables = [...d.tables.filter(t => t.kind === "AGE_MONTHS").map(t => ({ ...t, effectiveFrom: "2000-01-01", effectiveTo: null })),
    ...factors("INCOME_FACTOR", "CV340_INCOME_2026"), ...factors("WAGE_FACTOR", "CV340_2026"),
    { kind: "REFERENCE_AMOUNT", key: "GENERAL", value: "2340000", citationId: "ND73_ART3", effectiveFrom: `${benefitYear}-01-01`, effectiveTo: `${benefitYear + 1}-01-01` }];
  return d;
}
type Row = { from: string; to: string; scheme: "COMPULSORY" | "VOLUNTARY" };
function voluntaryCase(o: { sex: "MALE" | "FEMALE"; birth: string; rows: Row[]; benefit: string; start: "ELIGIBILITY" | "TRANSITION_2025"; ageRule?: "NORMAL" | "LAW_ART141_9"; employmentEnd?: string | null }) {
  const months = o.rows.flatMap(r => { const out = []; for (let m = r.from; m <= r.to; m = addMonths(m, 1)) out.push({ month: m, scheme: r.scheme,
    salaryRegime: r.scheme === "VOLUNTARY" ? "VOLUNTARY_INCOME" : "EMPLOYER", status: "PAID", contributionBase: "5000000", evidence,
    ...(r.scheme === "COMPULSORY" ? { participantCategory: "ARTICLE_2_1_A" } : {}) }); return out; });
  const last = months.at(-1)!.month;
  const history = { schemaVersion: 1, birth: { precision: "MONTH", declaredValue: o.birth }, legalSex: o.sex, coverageFrom: months[0].month, coverageThrough: last,
    confirmedThroughMonth: last, specialPeriods: [], months };
  const input = voluntaryEstimateInputSchema.parse({ historyVersionId: "00000000-0000-4000-8000-000000000001", expectedHistoryRevision: 1,
    legalRuleSetVersionId: "00000000-0000-4000-8000-000000000002", intendedBenefitDate: o.benefit + "-01", employmentEndDate: o.employmentEnd ?? null,
    contributionStopMonth: last, benefitRequestDate: null, futureContributions: [],
    voluntaryCase: { kind: "NORMAL_VOLUNTARY", ageRule: o.ageRule ?? "NORMAL", paymentMethod: "REGULAR_ONLY",
      benefitStart: { kind: o.start, month: o.benefit, confirmation: "DOCUMENTED", evidence } } });
  return { history, input };
}
const codes = (r: ReturnType<typeof assessVoluntaryBenefit>) => r.missingFields.map(f => f.code);

describe("voluntary transition 2025 (TT11 Art5(4))", () => {
  // Male born 1963-03 (ND135 age 729 months → 2024-03); 96 compulsory + 96 voluntary months = 16 years, stopped 2020-12.
  // Old law needed 20 years; TT11 Art5(4): >=15 years + age before 01/07/2025, no contribution from then → start 2025-07.
  const transition = { sex: "MALE" as const, birth: "1963-03", employmentEnd: "2012-12-31",
    rows: [{ from: "2005-01", to: "2012-12", scheme: "COMPULSORY" }, { from: "2013-01", to: "2020-12", scheme: "VOLUNTARY" }] as Row[] };

  it("starts the pension on 2025-07 when the transition start is declared", () => {
    const c = voluntaryCase({ ...transition, benefit: "2025-07", start: "TRANSITION_2025" });
    const r = assessVoluntaryBenefit(c.history, c.input, syntheticRules(2025), "2025-10-01");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.startMonth).toBe("2025-07");
    // 192 months = 16 years (<20, male): 40% + 1% = 41% × 5,000,000 (all factors 1).
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("2050000.00");
  });

  it("needs benefit-year-2025 tables: the 2026 draft corpus cannot price it", () => {
    const c = voluntaryCase({ ...transition, benefit: "2025-07", start: "TRANSITION_2025" });
    const r = assessVoluntaryBenefit(c.history, c.input, corpus, "2026-10-07");
    expect(r.assessmentStatus).not.toBe("ELIGIBLE");
    expect(codes(r)).toContain("RULE_TABLE_REQUIRED");
  });

  it("keeps the previous review code when the transition start is not declared (replay unchanged)", () => {
    const c = voluntaryCase({ ...transition, benefit: "2025-07", start: "ELIGIBILITY" });
    const r = assessVoluntaryBenefit(c.history, c.input, syntheticRules(2025), "2025-10-01");
    expect(r.assessmentStatus).toBe("REVIEW_REQUIRED");
    expect(codes(r)).toContain("VOLUNTARY_TRANSITION_ASSESSMENT_REQUIRED");
  });

  it("rejects a transition start when contributions continued from 2025-07", () => {
    const c = voluntaryCase({ ...transition, rows: [...transition.rows, { from: "2021-01", to: "2025-08", scheme: "VOLUNTARY" }], benefit: "2025-09", start: "TRANSITION_2025" });
    const r = assessVoluntaryBenefit(c.history, c.input, syntheticRules(2025), "2025-10-01");
    expect(codes(r)).toContain("VOLUNTARY_TRANSITION_CONDITIONS_NOT_MET");
  });
});

describe("Law Art141(9) legacy retirement age 60/55", () => {
  // Female born 1973-01: 55 at 2028-01; voluntary 2008-01..2027-12 = 240 months (earliest possible: scheme starts 2008).
  // ND135 normal age for this cohort is 58y8m (2031-09), so only the elected legacy path is eligible in 2028.
  const legacy = { sex: "FEMALE" as const, birth: "1973-01", rows: [{ from: "2008-01", to: "2027-12", scheme: "VOLUNTARY" }] as Row[] };

  it("allows the pension at 55 for a pre-2021 voluntary participant with 20 voluntary years", () => {
    const c = voluntaryCase({ ...legacy, benefit: "2028-02", start: "ELIGIBILITY", ageRule: "LAW_ART141_9" });
    const r = assessVoluntaryBenefit(c.history, c.input, syntheticRules(2028), "2028-03-01");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.startMonth).toBe("2028-02");
    // Female 240 months = 20 years: 45% + 5×2% = 55% × 5,000,000.
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("2750000.00");
  });

  it("the same history under the normal age rule is not yet eligible", () => {
    const c = voluntaryCase({ ...legacy, benefit: "2028-02", start: "ELIGIBILITY" });
    expect(assessVoluntaryBenefit(c.history, c.input, syntheticRules(2028), "2028-03-01").assessmentStatus).toBe("NOT_YET_ELIGIBLE");
  });

  it.each([
    ["first voluntary month from 2021", [{ from: "2021-01", to: "2040-12", scheme: "VOLUNTARY" }], "LEGACY_AGE_RULE_REQUIRES_PRE_2021_VOLUNTARY"],
    ["only 239 voluntary months", [{ from: "2008-02", to: "2027-12", scheme: "VOLUNTARY" }], "LEGACY_AGE_RULE_REQUIRES_240_VOLUNTARY_MONTHS"],
  ] as const)("rejects the legacy rule with %s", (_name, rows, code) => {
    const c = voluntaryCase({ ...legacy, rows: rows as unknown as Row[], benefit: "2041-01", start: "ELIGIBILITY", ageRule: "LAW_ART141_9" });
    expect(codes(assessVoluntaryBenefit(c.history, c.input, syntheticRules(2041), "2041-03-01"))).toContain(code);
  });

  it("requires the Art141(9) citation in the rule set", () => {
    const c = voluntaryCase({ ...legacy, benefit: "2028-02", start: "ELIGIBILITY", ageRule: "LAW_ART141_9" });
    const r = assessVoluntaryBenefit(c.history, c.input, syntheticRules(2028, false), "2028-03-01");
    expect(r.assessmentStatus).toBe("REVIEW_REQUIRED");
    expect(codes(r)).toContain("STATUTORY_CITATION_REQUIRED:LAW_ART141_9");
  });
});
