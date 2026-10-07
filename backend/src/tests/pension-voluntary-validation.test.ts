import { expect, it } from "vitest";
import { validatedVoluntaryFixture, validatedBenefitFixture } from "./benefit-fixtures";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { assessBenefit } from "../modules/pensions/benefit-engine";

it("validates the voluntary strategy with independent pension goldens and eligibility guards", () => {
  const r = validateLegalDocument(validatedVoluntaryFixture().rules);
  expect(r.issues).toEqual([]); expect(r.valid).toBe(true);
  expect(r.coverage[0].cases).toHaveLength(9);
  expect(r.coverage[0].cases.every(c => c.passed)).toBe(true);
});
it("rejects altered income factors, unsupported years, missing authority and lookalike source hosts", () => {
  const f = validatedVoluntaryFixture();
  for (const change of [
    (r: typeof f.rules) => { r.tables.find(t => t.kind === "INCOME_FACTOR")!.value = "1.01"; },
    (r: typeof f.rules) => { r.tables.find(t => t.kind === "INCOME_FACTOR")!.key = "2026:2007"; },
    (r: typeof f.rules) => { r.citations = r.citations.filter(c => c.id !== "LAW_ART104"); },
    (r: typeof f.rules) => { r.citations[0].url = "https://vbpl.vn.example.org/"; },
    (r: typeof f.rules) => { r.citations.find(c => c.id === "ND159_ART10")!.effectiveTo = "2026-06-01"; },
  ]) { const rules = structuredClone(f.rules); change(rules); expect(validateLegalDocument(rules).valid).toBe(false); }
});
it("requires the voluntary case and prevents the old engine from silently ignoring it", () => {
  const f = validatedVoluntaryFixture();
  expect(() => assessBenefit(f.history, { ...f.input, voluntaryCase: undefined }, f.rules, "2026-10-07")).toThrow();
  expect(() => assessBenefit(f.history, f.input, validatedBenefitFixture().rules, "2026-10-07"))
    .toThrowError(expect.objectContaining({ code: "PENSION_CASE_ENGINE_MISMATCH" }));
});
