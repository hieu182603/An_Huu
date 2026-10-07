import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { digest } from "../common/digest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { legalRuleDraftSchema } from "../modules/pensions/insurance-schema";
import { voluntaryTopUpValidationCase } from "../modules/pensions/voluntary-top-up-validation";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { validatedVoluntaryFixture } from "./benefit-fixtures";

const corpus = () => legalRuleDraftSchema.parse(JSON.parse(readFileSync("seed-data/legal-2026/bh2-voluntary-top-up.draft.json", "utf8"))).document;
const fixture = () => ({ ...voluntaryTopUpValidationCase(), rules: corpus() });
const assess = (f = fixture(), on = "2026-10-07") => assessBenefit(f.history, f.input, f.rules, on);
it("validates sourced top-up rules and rejects changed, missing, unofficial or misdated payment tables", () => {
  const valid = validateLegalDocument(corpus()); expect(valid.issues).toEqual([]); expect(valid.valid).toBe(true);
  expect(valid.coverage[0].cases).toHaveLength(17);
  for (const mutate of [
    (r: ReturnType<typeof corpus>) => { r.tables.find(t => t.kind === "FUND_MONTHLY_RATE")!.value = "3.1"; },
    (r: ReturnType<typeof corpus>) => { r.tables.find(t => t.key === "VOLUNTARY_MIN_INCOME")!.value = "2200000"; },
    (r: ReturnType<typeof corpus>) => { r.tables.find(t => t.kind === "FUND_MONTHLY_RATE")!.effectiveFrom = "2026-02-01"; },
    (r: ReturnType<typeof corpus>) => { r.tables = r.tables.filter(t => t.key !== "VOLUNTARY_MIN_INCOME"); },
    (r: ReturnType<typeof corpus>) => { r.citations.find(c => c.id === "CV151_FUND_RATE_2026")!.url = "https://baohiemxahoi.gov.vn.evil.invalid"; },
  ]) { const r = corpus(); mutate(r); expect(validateLegalDocument(r).valid).toBe(false); }
});
it.each(["VOLUNTARY", "EMPLOYER", "STATE"] as const)("counts settlement separately for %s history without inventing monthly records", regime => {
  const f = { ...voluntaryTopUpValidationCase("MALE", regime), rules: corpus() }, before = digest(f), r = assess(f);
  expect(r).toMatchObject({ assessmentStatus: "ELIGIBLE", countedMonths: 180, startMonth: "2026-07", lumpSum: "0", estimateKind: "CURRENT_RULE_ESTIMATE" });
  expect(new D(r.monthlyPension!).toFixed(2)).toBe(regime === "STATE" ? "3232000.00" : "4062666.67");
  expect(r.breakdown).toContainEqual({ code: "TOP_UP_MONTHS", value: "60", unit: "MONTHS", citationIds: ["ND159_ART7"] });
  expect(digest(f)).toBe(before); expect(f.history.months).toHaveLength(120);
});
it("uses payment-date ceiling and benefit-date state reference across July2026", () => {
  const f = fixture(); f.input.voluntaryTopUp.monthlyIncome = "46800000"; expect(assess(f).assessmentStatus).toBe("ELIGIBLE");
  f.input.voluntaryTopUp.monthlyIncome = "46800001"; expect(assess(f).missingFields).toContainEqual({ path: "voluntaryTopUp.monthlyIncome", code: "PAYMENT_INCOME_OUTSIDE_LIMITS" });
  f.input.voluntaryTopUp.paymentOn = "2026-07-01"; f.input.intendedBenefitDate = "2026-08-01";
  f.input.voluntaryTopUp.monthlyIncome = "50600000"; expect(assess(f).assessmentStatus).toBe("ELIGIBLE");
  f.input.voluntaryTopUp.monthlyIncome = "50600001"; expect(assess(f).monthlyPension).toBeNull();
  f.input.voluntaryTopUp.monthlyIncome = "1499999"; expect(assess(f).monthlyPension).toBeNull();
  f.input.voluntaryTopUp.monthlyIncome = "1500000"; expect(assess(f).assessmentStatus).toBe("ELIGIBLE");
});
it("never interprets an intended future payment or pre-payment evidence as fully paid", () => {
  const f = fixture(); f.input.voluntaryTopUp.paymentOn = "2026-11-10"; f.input.intendedBenefitDate = "2026-12-01";
  expect(assess(f).missingFields.some(i => i.code === "FULL_PAYMENT_EVIDENCE_REQUIRED")).toBe(true);
  f.input.voluntaryTopUp.confirmation = "HYPOTHETICAL";
  expect(assess(f)).toMatchObject({ assessmentStatus: "ELIGIBLE", estimateKind: "PROJECTED_SCENARIO", startMonth: "2026-12" });
  const paid = fixture(); paid.input.voluntaryTopUp.evidence[0] = { ...paid.input.voluntaryTopUp.evidence[0], confirmedOn: "2026-06-01" };
  expect(assess(paid).monthlyPension).toBeNull();
});
it("requires eligible age, at most60 missing months and complete known history", () => {
  const f = fixture(); f.input.voluntaryTopUp.missingMonths = 59; expect(assess(f).monthlyPension).toBeNull();
  f.input.voluntaryTopUp.missingMonths = 60; f.history.months[0].status = "UNKNOWN"; expect(assess(f).monthlyPension).toBeNull();
  const age = fixture(); age.history.birth.declaredValue = "1966-04";
  expect(assess(age).missingFields.some(i => i.code === "TOP_UP_BEFORE_AGE_ELIGIBILITY")).toBe(true);
});
it("requires income/rate/citation at the payment date and next-month benefit start", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.rules.tables = f.rules.tables.filter(t => t.kind !== "FUND_MONTHLY_RATE"); },
    (f: ReturnType<typeof fixture>) => { f.rules.citations.find(c => c.id === "CV151_FUND_RATE_2026")!.effectiveFrom = "2026-07-01"; },
    (f: ReturnType<typeof fixture>) => { f.input.intendedBenefitDate = "2026-08-01"; },
    (f: ReturnType<typeof fixture>) => { f.input.employmentEndDate = "2026-06-29"; },
  ]) { const f = fixture(); mutate(f); expect(assess(f).monthlyPension).toBeNull(); }
});
it("does not let old engines silently ignore top-up metadata", () => {
  const f = fixture(); f.rules = validatedVoluntaryFixture().rules;
  expect(() => assess(f)).toThrowError(expect.objectContaining({ code: "PENSION_CASE_ENGINE_MISMATCH" }));
});
it("checks the eligibility day inside the birthday month and clamps a31st to month end", () => {
  const f = fixture(); f.history.birth = { precision: "DAY", declaredValue: "1964-10-31" };
  f.input.voluntaryTopUp.paymentOn = "2026-04-29"; f.input.intendedBenefitDate = "2026-05-01";
  expect(assess(f).monthlyPension).toBeNull();
  f.input.voluntaryTopUp.paymentOn = "2026-04-30"; expect(assess(f).assessmentStatus).toBe("ELIGIBLE");
  f.history.birth = { precision: "MONTH", declaredValue: "1964-10" };
  expect(assess(f).missingFields.some(i => i.code === "BIRTH_DAY_REQUIRED_FOR_PAYMENT_MONTH")).toBe(true);
});
it("accepts exactly179 regular months plus1 and rejects topping up an already complete180", () => {
  const f = fixture(), regular = validatedVoluntaryFixture();
  f.history = regular.history; f.input.contributionStopMonth = "2026-06"; f.input.voluntaryTopUp.missingMonths = 1;
  expect(assess(f).missingFields.some(i => i.code === "TOP_UP_MUST_COMPLETE_180_MONTHS")).toBe(true);
  f.history.months.pop(); f.history.coverageThrough = f.history.confirmedThroughMonth = f.input.contributionStopMonth = "2026-05";
  const r = assess(f);
  // Independent sum: 179 adjusted10m bases total2,211,800,000; plus4m /180 *40%.
  expect(r.assessmentStatus).toBe("ELIGIBLE"); expect(new D(r.monthlyPension!).toFixed(2)).toBe("4924000.00");
});
