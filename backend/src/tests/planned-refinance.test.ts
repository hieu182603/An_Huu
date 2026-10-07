import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { plannedRefinanceSchema, projectPlannedRefinance, type PlannedRefinance } from "../modules/debts/planned-refinance";
import type { LoanContractV2 } from "../modules/debts/revision-schema";
import { digest } from "../common/digest";

const evidence = [{ reference: "Synthetic scenario and payoff quote", contentHash: "a".repeat(64), confirmedOn: "2026-11-05" }];
function contract(balance: string, from: string, dates: string[]): LoanContractV2 {
  let previous = from;
  return { contractVersion: 2, currency: "VND", signedOn: "2026-01-01", amendedOn: null, effectiveOn: "2026-01-01", knownOn: "2026-11-05",
    confirmation: "BANK_CONFIRMED", evidence, balanceAsOf: from, principalBalance: balance, balanceScope: "FULL_CONTRACT", paymentShare: "1",
    responsibility: { kind: "ALLOCATED_SHARE" }, interestBasis: "REDUCING_BALANCE", rounding: "CENT_HALF_UP", mode: "REDUCE_PAYMENT_KEEP_TERM",
    fixedPayment: null, finalPayment: "ADJUST_FINAL_PAYMENT", maturityDate: dates.at(-1)!, periods: dates.map(dueDate => {
      const row = { accrualFrom: previous, dueDate, rate: { kind: "SIMPLE_ANNUAL_DAILY" as const, percent: "0", days: (Date.parse(dueDate) - Date.parse(previous)) / 86400000, yearDays: 365 as const },
        fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null };
      previous = dueDate; return row;
    }) };
}
function fixture(): PlannedRefinance {
  const previous = contract("900", "2026-10-31", ["2026-11-30", "2026-12-31", "2027-01-31"]);
  const next = contract("600", "2026-12-15", ["2027-01-31", "2027-02-28"]);
  next.confirmation = "HYPOTHETICAL"; next.balanceNature = "PROJECTED_DISBURSEMENT";
  return plannedRefinanceSchema.parse({ engineCode: "planned-refinance-v1", previous, cutoff: "2026-10", knownOn: "2026-11-05", horizon: "2027-02",
    settledOn: "2026-12-15", sameDayOrder: "BEFORE_SCHEDULED_PAYMENT", confirm: true,
    payoffQuote: { principal: "600", interest: "10", carriedInterest: "0", prepaymentFee: "20", otherFee: "0", allRemainingChargesIncluded: true, valueKind: "HYPOTHETICAL_QUOTE", evidence },
    funding: { scope: "FULL_CONTRACT", externalTopUp: "40", userTopUp: "40", userFinancedAmount: "590", unusedProceeds: "0", unusedProceedsNotContributed: true, evidence },
    replacement: { commandId: randomUUID(), sourceId: "plan:" + randomUUID(), operation: "CREATE", expectedSourceRevision: 0, confirm: true, agreementReference: "New scenario loan", contract: next,
      funding: { kind: "PLANNED_DISBURSEMENT", grossPrincipal: "600", withheldFees: "10", netDisbursement: "590", destination: "EXTERNAL_ACCOUNT", evidence } } });
}

it("replaces projected creditor payments with only the user top-up and keeps both input contracts unchanged", () => {
  const input = fixture(), before = digest(input), result = projectPlannedRefinance(input);
  expect(result).toMatchObject({ projectedPrincipal: "600", settlementAmount: "630", userSettlementAmount: "630", confirmation: "HYPOTHETICAL", fundAdjustment: "0" });
  expect(result.oldSchedule).toEqual([{ month: "2026-11", metric: "debtPayment", amount: "300" }, { month: "2026-12", metric: "debtPayment", amount: "40" }]);
  expect(result.replacementSchedule).toEqual([{ month: "2027-01", metric: "debtPayment", amount: "300" }, { month: "2027-02", metric: "debtPayment", amount: "300" }]);
  expect(digest(input)).toBe(before);
  expect(projectPlannedRefinance(structuredClone(input))).toEqual(result);
});

it.each(["BEFORE_SCHEDULED_PAYMENT", "AFTER_SCHEDULED_PAYMENT"] as const)("uses explicit same-day order: %s", order => {
  const input = fixture(); input.settledOn = "2026-12-31"; input.sameDayOrder = order;
  const next = input.replacement.contract; next.balanceAsOf = input.settledOn; next.periods[0].accrualFrom = input.settledOn;
  next.periods[0].rate = { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: 31, yearDays: 365 };
  input.payoffQuote.interest = "0"; input.payoffQuote.prepaymentFee = "0";
  const before = order === "BEFORE_SCHEDULED_PAYMENT";
  input.payoffQuote.principal = before ? "600" : "300";
  next.principalBalance = before ? "600" : "300";
  input.replacement.funding = { kind: "PLANNED_DISBURSEMENT", grossPrincipal: next.principalBalance, withheldFees: "0", netDisbursement: next.principalBalance, destination: "EXTERNAL_ACCOUNT", evidence };
  input.funding.externalTopUp = "0"; input.funding.userTopUp = "0"; input.funding.userFinancedAmount = next.principalBalance;
  const result = projectPlannedRefinance(input);
  expect(result.projectedPrincipal).toBe(before ? "600" : "300");
  expect(result.oldSchedule.map(r => r.amount)).toEqual(before ? ["300", "0"] : ["300", "300"]);
  if (!before) {
    input.payoffQuote.interest = "1";
    expect(() => projectPlannedRefinance(input)).toThrowError(expect.objectContaining({ code: "PLANNED_REFINANCE_QUOTE_MISMATCH" }));
  }
});

it.each([false, true])("keeps full-contract payments distinct from user share and remaining cap (%s)", capped => {
  const input = fixture(); input.previous.paymentShare = "0.5";
  if (capped) input.previous.responsibility = { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "400", previouslyPaid: "100", evidence };
  input.funding.userTopUp = "20"; input.funding.userFinancedAmount = capped ? "130" : "295";
  const result = projectPlannedRefinance(input);
  expect(result.userSettlementAmount).toBe(capped ? "150" : "315");
  expect(result.remainingOldCapBeforeSettlement).toBe(capped ? "150" : null);
  expect(result.oldSchedule.map(r => r.amount)).toEqual(["150", "20"]);
  expect(result.settlementAmount).toBe("630");
});

it("handles user-share scope and leaves unused proceeds outside the retirement fund", () => {
  const input = fixture(); input.previous.balanceScope = input.replacement.contract.balanceScope = input.funding.scope = "USER_SHARE";
  input.funding.externalTopUp = input.funding.userTopUp = "50"; input.funding.userFinancedAmount = "580"; input.funding.unusedProceeds = "10";
  expect(projectPlannedRefinance(input).oldSchedule.at(-1)?.amount).toBe("50");
  input.funding.userTopUp = "40"; input.funding.userFinancedAmount = "590";
  expect(() => projectPlannedRefinance(input)).toThrowError(expect.objectContaining({ code: "PLANNED_REFINANCE_FUNDING_MISMATCH" }));
});

it("rejects principal, funding, missing-charge confirmation and dates that would fabricate actual refinancing", () => {
  const input = fixture();
  for (const kind of ["principal", "funding", "paidOpening", "date", "known", "evidence"] as const) {
    const bad = structuredClone(input);
    if (kind === "principal") bad.payoffQuote.principal = "900";
    if (kind === "funding") bad.funding.userFinancedAmount = "600";
    if (kind === "paidOpening") bad.replacement.contract.userPaidToDate = "1";
    if (kind === "date") bad.settledOn = "2026-10-31";
    if (kind === "known") bad.knownOn = "2026-12-16";
    if (kind === "evidence") bad.payoffQuote.evidence[0].confirmedOn = "2026-11-06";
    expect(() => projectPlannedRefinance(bad)).toThrowError(expect.objectContaining({ status: 422 }));
  }
  expect(plannedRefinanceSchema.safeParse({ ...input, payoffQuote: { ...input.payoffQuote, allRemainingChargesIncluded: false } }).success).toBe(false);
});

it("does not accept a paid-off predecessor or an incomplete replacement schedule as a complete refinance", () => {
  const input = fixture(); input.settledOn = "2027-01-31"; input.sameDayOrder = "AFTER_SCHEDULED_PAYMENT";
  input.replacement.contract.balanceAsOf = input.settledOn;
  input.replacement.contract.periods = [{ accrualFrom: input.settledOn, dueDate: "2027-02-28", rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: 28, yearDays: 365 }, fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null }];
  expect(() => projectPlannedRefinance(input)).toThrowError(expect.objectContaining({ code: "PLANNED_REFINANCE_PRINCIPAL_MISMATCH" }));
  const balloon = fixture(); balloon.replacement.contract.mode = "REDUCE_TERM_KEEP_PAYMENT"; balloon.replacement.contract.fixedPayment = "1"; balloon.replacement.contract.finalPayment = "NO_BALLOON";
  expect(() => projectPlannedRefinance(balloon)).toThrowError(expect.objectContaining({ code: "LOAN_SCHEDULE_REVIEW_REQUIRED" }));
});
