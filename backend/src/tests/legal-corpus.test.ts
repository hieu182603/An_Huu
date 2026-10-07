import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { legalRuleDraftSchema } from "../modules/pensions/insurance-schema";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { benefitFixtureV2, stateBenefitFixture, validatedVoluntaryFixture, validatedVoluntaryStateFixture } from "./benefit-fixtures";
import { addMonths } from "../common/calendar";
import { voluntaryTransitionCase } from "../modules/pensions/voluntary-validation";

const root = resolve("seed-data/legal-2026");
const { verifySources } = require("../../scripts/generate-legal-corpus.cjs");
const draft = (file: string) => legalRuleDraftSchema.parse(JSON.parse(readFileSync(join(root, file), "utf8")));
const employer = draft("bh1-employer.draft.json"), state = draft("bh2-state-mixed.draft.json"), voluntary = draft("bh2-voluntary-employer.draft.json");
const stateVoluntary = draft("bh2-voluntary-state.draft.json"), topUp = draft("bh2-voluntary-top-up.draft.json"), prepaid = draft("bh2-voluntary-prepaid.draft.json");
const stateV2 = draft("bh2-state-mixed-v2.draft.json"), transition = draft("bh2-voluntary-transition-2025.draft.json");

describe("archived legal corpus 2026 (draft only)", () => {
  it("reproduces all drafts byte-for-byte and verifies all archived source bytes offline", () => {
    expect(execFileSync(process.execPath, ["scripts/generate-legal-corpus.cjs", "--check"], { encoding: "utf8" })).toContain("CHECKED bh2-state-mixed");
    const manifest = verifySources(root);
    for (const rules of [employer, state, voluntary, stateVoluntary, topUp, prepaid, stateV2, transition]) {
      expect(Buffer.byteLength(JSON.stringify(rules))).toBeLessThan(2 * 1024 * 1024);
      for (const citation of rules.document.citations) {
        expect(manifest.sources.some((s: { url: string; sha256: string }) => s.url === citation.url && s.sha256 === citation.contentHash)).toBe(true);
      }
    }
  });
  it("fails closed for changed source bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "anhuu-corpus-"));
    try {
      mkdirSync(join(dir, "sources"));
      const source = verifySources(root).sources[0];
      writeFileSync(join(dir, "sources.json"), JSON.stringify({ sources: [source] }));
      writeFileSync(join(dir, "sources", source.file), "changed archive");
      expect(() => verifySources(dir)).toThrow("Source integrity failed");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([[employer, 16], [state, 18], [voluntary, 9], [stateVoluntary, 15], [topUp, 18], [prepaid, 24], [transition, 9]] as const)("passes registered validation with actual source citations (%#)", (rules, count) => {
    const report = validateLegalDocument(rules.document);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.coverage[0].cases).toHaveLength(count);
  });
  it("prices the TT11 Art5(4) transition with the archived TT01/2025 benefit-year tables", () => {
    const f = voluntaryTransitionCase(), r = assessBenefit(f.history, f.input, transition.document, "2026-10-07");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(r.startMonth).toBe("2025-07");
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("3596468.75");
    expect(transition.document.citations.find(c => c.id === "TT01_2025_WAGE")?.effectiveTo).toBe("2026-01-01");
    // The same case cannot be priced with the 2026 corpus (different benefit year).
    expect(assessBenefit(f.history, f.input, voluntary.document, "2026-10-07").assessmentStatus).not.toBe("ELIGIBLE");
  });
  it("uses the archived sources for a state/employer/voluntary career", () => {
    const f = validatedVoluntaryStateFixture(60, 60);
    const result = assessBenefit(f.history, f.input, stateVoluntary.document, "2026-10-07");
    expect(result.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(result.monthlyPension!).toFixed(2)).toBe("3539200.00");
  });
  it.each([0, 120])("uses the voluntary corpus with %i employer months and separates income and wage factor citations", compulsory => {
    const f = validatedVoluntaryFixture(compulsory);
    const r = assessBenefit(f.history, f.input, voluntary.document, "2026-10-07");
    expect(r.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(r.monthlyPension!).toFixed(2)).toBe("4937333.33");
    const income = voluntary.document.tables.filter(t => t.kind === "INCOME_FACTOR");
    expect(income).toHaveLength(19);
    expect(income.every(t => t.citationId === "CV340_INCOME_2026" && t.key >= "2026:2008")).toBe(true);
    const missing = structuredClone(voluntary.document); missing.tables = missing.tables.filter(t => t.kind !== "INCOME_FACTOR");
    expect(assessBenefit(f.history, f.input, missing, "2026-10-07").monthlyPension).toBeNull();
    const expired = structuredClone(voluntary.document); expired.citations.find(c => c.id === "CV340_INCOME_2026")!.effectiveTo = "2026-07-01";
    expect(validateLegalDocument(expired).valid).toBe(false);
    expect(assessBenefit(f.history, f.input, expired, "2026-10-07").monthlyPension).toBeNull();
  });
  it.each([
    [180, "MALE", "4937333.33"], [180, "FEMALE", "5554500.00"],
    [240, "MALE", "6764625.00"], [420, "MALE", "20763214.29"],
    [360, "FEMALE", "17331250.00"], [181, "MALE", "5008350.83"],
  ] as const)("assesses the actual employer draft: %i months %s", (months, sex, expected) => {
    const f = benefitFixtureV2(months, sex);
    const result = assessBenefit(f.history, f.input, employer.document, "2026-10-05");
    expect(result.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(result.monthlyPension!).toFixed(2)).toBe(expected);
  });
  it("uses the actual state draft and the July reference change", () => {
    const f = stateBenefitFixture();
    const july = assessBenefit(f.history, f.input, state.document, "2026-10-05");
    expect(july.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(july.monthlyPension!).toFixed(2)).toBe("4048000.00");
    f.history.months.forEach(m => { m.month = addMonths(m.month, -1); });
    f.history.coverageFrom = f.history.months[0].month;
    f.history.coverageThrough = f.history.confirmedThroughMonth = "2026-05";
    f.input.stateSalaryCase!.firstParticipationMonth = f.history.coverageFrom;
    f.input.intendedBenefitDate = "2026-06-01"; f.input.employmentEndDate = "2026-05-31";
    f.input.contributionStopMonth = "2026-05"; f.input.caseDetails!.benefitStart.month = "2026-06";
    const june = assessBenefit(f.history, f.input, state.document, "2026-10-05");
    expect(june.assessmentStatus).toBe("ELIGIBLE");
    expect(new D(june.monthlyPension!).toFixed(2)).toBe("3744000.00");
  });
  it("does not fill missing factors or publish coverage for a later benefit year", () => {
    expect(employer.effectiveTo).toBe("2027-01-01");
    expect(employer.document.tables.every(t => t.effectiveTo === "2027-01-01" || t.effectiveTo === "2026-07-01")).toBe(true);
    const f = benefitFixtureV2();
    const rules = structuredClone(employer.document);
    rules.tables = rules.tables.filter(t => t.key !== "2026:2012");
    const result = assessBenefit(f.history, f.input, rules, "2026-10-05");
    expect(result.monthlyPension).toBeNull();
    expect(result.assessmentStatus).toBe("INSUFFICIENT_DATA");
  });
  it("rejects lookalike CDN hosts", () => {
    const rules = structuredClone(employer.document);
    rules.citations.find(c => c.id === "CV340_2026")!.url = "https://xdcs.cdnchinhphu.vn.example.org/fake.pdf";
    expect(validateLegalDocument(rules).issues).toContainEqual({ path: "citations.CV340_2026", code: "OFFICIAL_LEGAL_SOURCE_REQUIRED" });
  });
});
