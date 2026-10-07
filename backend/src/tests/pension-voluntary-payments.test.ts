import { expect, it } from "vitest";
import { quoteVoluntaryPrepayment, quoteVoluntaryTopUp, quoteVoluntaryPrepaymentRefund } from "../modules/pensions/voluntary-payment-math";
import { RetirementDecimal as D } from "../modules/retirement/engine";
import { readFileSync } from "node:fs";
const base = { monthlyIncome: "4000000", fundMonthlyRatePercent: "0.31" };
it("pins the official fund-rate archive and uses a percent-per-month unit for payment year2026", () => {
  const { buildPaymentRateFragment } = require("../../scripts/generate-legal-corpus.cjs");
  const fragment = buildPaymentRateFragment();
  expect(JSON.parse(readFileSync("seed-data/legal-2026/fund-monthly-rate-2026.fragment.json", "utf8"))).toEqual(fragment);
  expect(fragment).toMatchObject({ status: "DRAFT_FRAGMENT_NOT_PUBLISHABLE", paymentYear: 2026, rateUnit: "PERCENT_PER_MONTH",
    table: { value: "0.31", kind: "FUND_MONTHLY_RATE", key: "2026" },
    citation: { contentHash: "9239d7ca5e0c867c8b2c3a4a1966ddb6caa8b74866a9dc0c116e4a2a259191e9" } });
});
// Golden totals computed independently with Python Decimal80 from signed formulas.
it.each([[2, "20386137.18"], [3, "30025180.04"], [4, "39312772.42"], [5, "48261728.60"]] as const)("discounts %i years of advance payments", (years, expected) => {
  const r = quoteVoluntaryPrepayment({ ...base, years });
  expect(new D(r.grossContribution).toFixed(2)).toBe(expected);
  expect(r.installments[0].contribution).toBe("880000");
  expect(new D(r.grossContribution).plus(r.discount).toFixed()).toBe(r.undiscountedContribution);
});
it.each([[1, "882728.00"], [6, "5337584.91"], [60, "58110779.05"]] as const)("compounds each of%i missing months separately", (missingMonths, expected) => {
  const r = quoteVoluntaryTopUp({ ...base, missingMonths, monthsAlreadyCounted: 180 - missingMonths, normalRetirementMonth: "2026-05", paidOn: "2026-06-15" });
  expect(new D(r.grossContribution).toFixed(2)).toBe(expected); expect(r.countedMonthsAfterPayment).toBe(180);
  expect(r.installments[0].contribution).toBe("882728");
});
it("refunds only remaining original installments, excluding documented state support", () => {
  const r = quoteVoluntaryPrepaymentRefund({ ...base, years: 2, remainingMonths: 6, stateSupportToExclude: "100000" });
  expect(r.firstRefundOrdinal).toBe(19); expect(new D(r.refundAmount).toFixed(2)).toBe("4855451.92");
  expect(() => quoteVoluntaryPrepaymentRefund({ ...base, years: 2, remainingMonths: 25, stateSupportToExclude: "0" })).toThrow();
  expect(() => quoteVoluntaryPrepaymentRefund({ ...base, years: 2, remainingMonths: 1, stateSupportToExclude: "999999999" })).toThrow();
});
it("handles a zero published rate without singular annuity division", () => {
  expect(quoteVoluntaryPrepayment({ ...base, fundMonthlyRatePercent: "0", years: 2 }).grossContribution).toBe("21120000");
  expect(quoteVoluntaryTopUp({ ...base, fundMonthlyRatePercent: "0", monthsAlreadyCounted: 120, missingMonths: 60, normalRetirementMonth: "2026-06", paidOn: "2026-06-30" }).grossContribution).toBe("52800000");
});
it("rejects retirement-age/count mismatches and invalid payment data", () => {
  const input = { ...base, monthsAlreadyCounted: 179, missingMonths: 1, normalRetirementMonth: "2026-06", paidOn: "2026-06-15" };
  for (const changed of [{ ...input, monthsAlreadyCounted: 119, missingMonths: 61 }, { ...input, missingMonths: 2 }, { ...input, monthsAlreadyCounted: 180 },
    { ...input, paidOn: "2026-05-31" }, { ...input, paidOn: "2025-06-30", normalRetirementMonth: "2025-05" },
    { ...input, monthlyIncome: "-1" }, { ...input, fundMonthlyRatePercent: "-0.31" }]) expect(() => quoteVoluntaryTopUp(changed)).toThrow();
  for (const years of [1, 2.5, 6]) expect(() => quoteVoluntaryPrepayment({ ...base, years } as never)).toThrow();
});
