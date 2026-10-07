import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { digest } from "../common/digest";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { assessBenefit } from "../modules/pensions/benefit-engine";
import { legalRuleDraftSchema } from "../modules/pensions/insurance-schema";
import { voluntaryPrepaidValidationCase } from "../modules/pensions/voluntary-prepaid-validation";
import { validateLegalDocument } from "../modules/pensions/legal-validation";
import { quoteVoluntaryPeriod } from "../modules/pensions/voluntary-payment-math";
import { validatedVoluntaryTopUpFixture } from "./benefit-fixtures";

const corpus = () => legalRuleDraftSchema.parse(JSON.parse(readFileSync("seed-data/legal-2026/bh2-voluntary-prepaid.draft.json", "utf8"))).document;
const fixture = () => ({ ...voluntaryPrepaidValidationCase(), rules: corpus() });
const assess = (f = fixture()) => assessBenefit(f.history, f.input, f.rules, "2026-10-07");
const value = (r: ReturnType<typeof assess>, code: string) => r.breakdown.find(b => b.code === code)?.value;

it("validates all seven payment periods against independent pension and refund goldens", () => {
  const result = validateLegalDocument(corpus());
  expect(result.issues).toEqual([]); expect(result.valid).toBe(true); expect(result.coverage[0].cases).toHaveLength(23);
});
it("counts six covered months, leaves18 unused, keeps refunds separate and preserves history bytes", () => {
  const f = fixture(), hash = digest(f), r = assess(f);
  expect(r).toMatchObject({ assessmentStatus: "ELIGIBLE", countedMonths: 180, startMonth: "2026-07", lumpSum: "0", estimateKind: "CURRENT_RULE_ESTIMATE" });
  expect(new D(r.monthlyPension!).toFixed(2)).toBe("4857333.33");
  expect(value(r, "PREPAID_USED_MONTHS")).toBe("6"); expect(value(r, "PREPAID_REMAINING_MONTHS")).toBe("18");
  expect(new D(value(r, "PREPAID_REFUND_ESTIMATE")!).toFixed(2)).toBe("15046763.01");
  expect(value(r, "PREPAID_REFUND_STATUS")).toBe("ESTIMATE_NOT_RECEIVED");
  expect(digest(f)).toBe(hash); expect(f.history.months).toHaveLength(174);
});
it("does not buy immediate eligibility with future prepaid months", () => {
  const f = fixture(); f.input.contributionStopMonth = "2026-05"; f.input.intendedBenefitDate = "2026-06-01";
  const r = assess(f); expect(r).toMatchObject({ assessmentStatus: "NOT_YET_ELIGIBLE", countedMonths: 179, monthlyPension: null });
});
it("merges matching dated history once, rejects conflicting, withdrawn and future allocations", () => {
  const f = fixture(), before = assess(f);
  f.history.coverageThrough = f.history.confirmedThroughMonth = "2026-01";
  f.history.months.push({ month: "2026-01", scheme: "VOLUNTARY", salaryRegime: "VOLUNTARY_INCOME", status: "PAID", contributionBase: "4000000", evidence: f.input.voluntaryPrepaid.evidence });
  expect(assess(f).monthlyPension).toBe(before.monthlyPension); expect(assess(f).countedMonths).toBe(180);
  f.history.months.at(-1)!.contributionBase = "5000000"; expect(assess(f).missingFields.some(i => i.code === "PREPAID_HISTORY_CONFLICT")).toBe(true);
  f.history.months.at(-1)!.contributionBase = "4000000"; f.history.months.at(-1)!.status = "WITHDRAWN";
  expect(assess(f).monthlyPension).toBeNull();
  const other = fixture(); other.input.futureContributions.push({ month: "2026-02", scheme: "VOLUNTARY", salaryRegime: "VOLUNTARY_INCOME", status: "PAID", contributionBase: "4000000", evidence: other.input.voluntaryPrepaid.evidence });
  expect(assess(other).missingFields.some(i => i.code === "PREPAID_OVERLAPS_FUTURE_CONTRIBUTIONS")).toBe(true);
});
it("leaves refund unknown when support is unknown without suppressing the independent pension", () => {
  const f = fixture(); f.input.voluntaryPrepaid.refundSupport = null;
  const r = assess(f); expect(r.assessmentStatus).toBe("ELIGIBLE"); expect(value(r, "PREPAID_REFUND_ESTIMATE")).toBeNull();
  expect(value(r, "PREPAID_REFUND_STATUS")).toBe("SUPPORT_RECONCILIATION_REQUIRED");
});
it("enforces short-period payment deadlines and same-registration payment for multi-year", () => {
  for (const [periodMonths, last, tooLate] of [[3, "2026-06-01", "2026-07-01"], [6, "2026-04-01", "2026-05-01"], [12, "2026-07-01", "2026-08-01"]] as const) {
    const f = { ...voluntaryPrepaidValidationCase(periodMonths), rules: corpus() };
    // Test the payment window separately from eligibility/request boundaries.
    f.input.voluntaryPrepaid.paymentOn = last;
    expect(assess(f).missingFields.some(i => i.code === "PREPAID_PAYMENT_WINDOW_INVALID")).toBe(false);
    f.input.voluntaryPrepaid.paymentOn = tooLate;
    expect(assess(f).missingFields.some(i => i.code === "PREPAID_PAYMENT_WINDOW_INVALID")).toBe(true);
  }
  const f = fixture(); f.input.voluntaryPrepaid.paymentOn = "2026-01-11"; expect(assess(f).monthlyPension).toBeNull();
});
it("requires payment/request evidence and rejects inconsistent cutoff and compulsory overlap", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.input.benefitRequestDate = null; },
    (f: ReturnType<typeof fixture>) => { f.input.voluntaryPrepaid.benefitRequest.evidence = [{ ...f.history.months[0].evidence[0], confirmedOn: "2026-06-01" }]; },
    (f: ReturnType<typeof fixture>) => { f.input.voluntaryPrepaid.evidence = [{ ...f.history.months[0].evidence[0], confirmedOn: "2026-01-01" }]; },
    (f: ReturnType<typeof fixture>) => { f.input.employmentEndDate = "2026-01-01"; },
    (f: ReturnType<typeof fixture>) => { f.input.contributionStopMonth = "2026-05"; },
    (f: ReturnType<typeof fixture>) => { f.input.voluntaryPrepaid.refundSupport!.stateSupportToExclude = "999999999"; },
  ]) { const f = fixture(); change(f); expect(assess(f).monthlyPension).toBeNull(); }
});
it("keeps hypothetical payment/request projected even for past dates and refuses old dispatchers", () => {
  const f = fixture(); f.input.voluntaryPrepaid.confirmation = "HYPOTHETICAL"; expect(assess(f).estimateKind).toBe("PROJECTED_SCENARIO");
  f.input.voluntaryPrepaid.confirmation = "DOCUMENTED_FULLY_PAID"; f.input.voluntaryPrepaid.benefitRequest.confirmation = "HYPOTHETICAL";
  expect(assess(f).estimateKind).toBe("PROJECTED_SCENARIO");
  f.rules = validatedVoluntaryTopUpFixture().rules;
  expect(() => assess(f)).toThrowError(expect.objectContaining({ code: "PENSION_CASE_ENGINE_MISMATCH" }));
});
it("short periods have no interest discount and unknown support never means zero support", () => {
  const quote = quoteVoluntaryPeriod({ monthlyIncome: "4000000", fundMonthlyRatePercent: "0.31", periodMonths: 12, usedMonths: 6, stateSupportToExclude: null });
  expect(quote).toMatchObject({ grossContribution: "10560000", remainingMonths: 6, grossRemaining: "5280000", refundAmount: null });
  expect(() => quoteVoluntaryPeriod({ monthlyIncome: "4000000", fundMonthlyRatePercent: "0.31", periodMonths: 12, usedMonths: 13, stateSupportToExclude: "0" })).toThrow();
});
