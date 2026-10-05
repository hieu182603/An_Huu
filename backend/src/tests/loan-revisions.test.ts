import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { projectLoanRevision } from "../modules/debts/revision-engine";
import { loanContractV2Schema, type LoanAllocation, type LoanContractV2 } from "../modules/debts/revision-schema";
import { reconcileLoanRevision, type LoanActualEvidence, type LoanReconciliation } from "../modules/debts/reconciliation";

const evidence = [{ reference: "Synthetic bank statement", contentHash: "a".repeat(64), confirmedOn: "2026-09-30" }];
function contract(): LoanContractV2 {
  return { contractVersion: 2, currency: "VND", signedOn: "2026-01-01", amendedOn: null, effectiveOn: "2026-01-01", knownOn: "2026-09-30",
    confirmation: "HYPOTHETICAL", evidence, balanceAsOf: "2026-09-30", principalBalance: "90000000", balanceScope: "FULL_CONTRACT",
    paymentShare: "1", responsibility: { kind: "ALLOCATED_SHARE" }, interestBasis: "REDUCING_BALANCE", rounding: "CENT_HALF_UP",
    mode: "REDUCE_PAYMENT_KEEP_TERM", fixedPayment: null, finalPayment: "ADJUST_FINAL_PAYMENT", maturityDate: "2026-11-30",
    periods: [
      { accrualFrom: "2026-09-30", dueDate: "2026-10-30", rate: { kind: "EFFECTIVE_MONTHLY", percent: "0" }, fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null },
      { accrualFrom: "2026-10-30", dueDate: "2026-11-30", rate: { kind: "EFFECTIVE_MONTHLY", percent: "0" }, fee: "0", carriedInterest: "0", gracePrincipal: false, bankPayment: null },
    ] };
}
function reconciliation() {
  const previous = contract(); previous.balanceAsOf = "2026-08-30"; previous.principalBalance = "100000000";
  previous.periods.unshift({ ...previous.periods[0], accrualFrom: "2026-08-30", dueDate: "2026-09-30" });
  const allocation: LoanAllocation = { allocationId: randomUUID(), eventId: randomUUID(), actualRevision: 1, bookedOn: "2026-09-20", scope: "FULL_CONTRACT",
    components: { principal: "10000000", interest: "1000000", prepaymentFee: "1000000", otherFee: "0" },
    contractComponents: { principal: "10000000", interest: "1000000", prepaymentFee: "1000000", otherFee: "0" },
    paymentStatus: "CURRENT", allocationBasis: "BANK_STATEMENT", evidence };
  const actual: LoanActualEvidence = { period: "2026-09", revision: 1, status: "RECONCILED", data: { currency: "VND", openingBalance: "20000000", closingBalance: "8000000",
    correctionReason: "Synthetic monthly close", entries: [
      { eventId: allocation.eventId, kind: "DEBT_PAYMENT", date: allocation.bookedOn, amount: "12000000" },
      { eventId: randomUUID(), kind: "WITHDRAWAL", date: allocation.bookedOn, amount: "12000000" },
    ] } };
  const input: LoanReconciliation = { previous, next: contract(), allocations: [allocation], principalAdvances: [] };
  return { input, actual, allocation };
}

describe("Loan contract v2 arithmetic (independent schedules)", () => {
  it("keeps term or reduces term without changing v1, including zero interest", () => {
    const c = contract();
    expect(projectLoanRevision(c).rows.map(r => r.principal)).toEqual(["45000000", "45000000"]);
    c.mode = "REDUCE_TERM_KEEP_PAYMENT"; c.fixedPayment = "50000000"; c.finalPayment = "NO_BALLOON";
    expect(projectLoanRevision(c).rows.map(r => r.principal)).toEqual(["50000000", "40000000"]);
  });
  it("requires an explicit balloon instead of silently extending or settling a loan", () => {
    const c = contract(); c.mode = "REDUCE_TERM_KEEP_PAYMENT"; c.fixedPayment = "20000000"; c.finalPayment = "NO_BALLOON";
    expect(projectLoanRevision(c)).toMatchObject({ status: "REVIEW_REQUIRED", rows: [], totals: null, issues: ["UNSETTLED_BALANCE_AT_MATURITY"] });
    c.finalPayment = "BALLOON_CONFIRMED";
    expect(projectLoanRevision(c).rows.map(r => r.principal)).toEqual(["20000000", "70000000"]);
  });
  it("amortizes floating rates using present values and explicit cent rounding", () => {
    const c = contract(); c.principalBalance = "1000"; c.periods[1].rate.percent = "10";
    const result = projectLoanRevision(c);
    expect(result.status).toBe("READY");
    expect(result.rows.map(r => [r.principal, r.interest, r.contractPayment, r.closing])).toEqual([
      ["523.81", "0", "523.81", "476.19"], ["476.19", "47.62", "523.81", "0"],
    ]);
  });
  it("pays interest during principal grace and keeps arrears/fees outside principal", () => {
    const c = contract(); c.principalBalance = "10000";
    c.periods.forEach(p => { p.rate.percent = "1"; }); c.periods[0].gracePrincipal = true; c.periods[0].carriedInterest = "20"; c.periods[0].fee = "30";
    expect(projectLoanRevision(c).rows.map(r => [r.principal, r.interest, r.closing, r.contractPayment])).toEqual([
      ["0", "100", "10000", "150"], ["10000", "100", "0", "10100"],
    ]);
  });
  it("retains separate charges after early principal payoff", () => {
    const c = contract(); c.mode = "REDUCE_TERM_KEEP_PAYMENT"; c.fixedPayment = "90000000"; c.finalPayment = "NO_BALLOON";
    c.periods[1].fee = "300"; c.periods[1].carriedInterest = "200";
    expect(projectLoanRevision(c).rows.map(r => [r.principal, r.contractPayment])).toEqual([["90000000", "90000000"], ["0", "500"]]);
  });
  it("uses actual declared days for a mid-period bank schedule", () => {
    const c = contract(); c.principalBalance = "36500000"; c.mode = "BANK_SCHEDULE"; c.confirmation = "BANK_CONFIRMED";
    c.maturityDate = "2026-10-10";
    c.periods = [{ ...c.periods[0], dueDate: "2026-10-10", rate: { kind: "SIMPLE_ANNUAL_DAILY", percent: "10", days: 10, yearDays: 365 },
      bankPayment: { principal: "36500000", interest: "100000" } }];
    expect(projectLoanRevision(c)).toMatchObject({ status: "READY", totals: { interest: "100000", contractPayment: "36600000" } });
    c.periods[0].rate = { kind: "SIMPLE_ANNUAL_DAILY", percent: "10", days: 11, yearDays: 365 };
    expect(loanContractV2Schema.safeParse(c).success).toBe(false);
    c.periods[0].rate = { kind: "EFFECTIVE_MONTHLY", percent: "1" };
    expect(loanContractV2Schema.safeParse(c).success).toBe(false);
  });
  it("rejects inconsistent bank interest and implicit capitalization", () => {
    const c = contract(); c.mode = "RESTRUCTURED"; c.periods.forEach(p => { p.bankPayment = { principal: "45000000", interest: "1" }; });
    expect(projectLoanRevision(c).issues).toEqual(["BANK_INTEREST_DIFFERS_FROM_DECLARED_RATE"]);
    c.mode = "REDUCE_TERM_KEEP_PAYMENT"; c.fixedPayment = "1"; c.finalPayment = "NO_BALLOON";
    c.periods.forEach(p => { p.bankPayment = null; p.rate.percent = "1"; });
    expect(projectLoanRevision(c).issues).toEqual(["PAYMENT_BELOW_INTEREST_NO_CAPITALIZATION"]);
  });
  it("tracks the user's cap across every payment including fees without double share", () => {
    const c = contract(); c.principalBalance = "1000"; c.paymentShare = "0.5"; c.periods[0].fee = "100";
    c.responsibility = { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "450", previouslyPaid: "100", evidence };
    expect(projectLoanRevision(c).rows.map(r => [r.userPayment, r.remainingLiabilityCap])).toEqual([["300", "50"], ["50", "0"]]);
    c.balanceScope = "USER_SHARE";
    expect(loanContractV2Schema.safeParse(c).success).toBe(false);
  });
  it("requires consistent dates, complete periods and explicit known evidence", () => {
    const c = contract(); c.signedOn = "2026-09-30";
    expect(loanContractV2Schema.safeParse(c).success).toBe(false);
    const gap = contract(); gap.periods[1].accrualFrom = "2026-10-31";
    expect(loanContractV2Schema.safeParse(gap).success).toBe(false);
    const future = contract(); future.evidence = [{ ...evidence[0], confirmedOn: "2026-10-01" }];
    expect(loanContractV2Schema.safeParse(future).success).toBe(false);
  });
});

describe("Actual loan reconciliation", () => {
  it("DN-G01/02: 12m paid = 10m principal + 1m interest + 1m fee; never debits the anchor again", () => {
    const { input, actual } = reconciliation();
    expect(reconcileLoanRevision(input, [actual], [])).toMatchObject({ status: "RECONCILED", openingPrincipal: "100000000", principalPaid: "10000000",
      closingPrincipal: "90000000", userPaid: "12000000", fundAdjustment: "0" });
    input.next.principalBalance = "88000000";
    expect(() => reconcileLoanRevision(input, [actual], [])).toThrowError(expect.objectContaining({ code: "DEBT_BALANCE_MISMATCH" }));
  });
  it("pins event revision, kind and posting date", () => {
    for (const change of ["revision", "kind", "date"] as const) {
      const { input, actual } = reconciliation();
      if (change === "revision") actual.revision++;
      if (change === "kind") actual.data.entries[0].kind = "WITHDRAWAL";
      if (change === "date") actual.data.entries[0].date = "2026-09-21";
      expect(() => reconcileLoanRevision(input, [actual], [])).toThrowError(expect.objectContaining({ code: "LOAN_ACTUAL_STALE_OR_MISSING" }));
    }
  });
  it("prevents allocation reuse and excess allocation across different loans", () => {
    const { input, actual, allocation } = reconciliation();
    expect(() => reconcileLoanRevision(input, [actual], [{ sourceId: "loan-a", allocation }])).toThrowError(expect.objectContaining({ code: "LOAN_ALLOCATION_REUSED" }));
    expect(() => reconcileLoanRevision(input, [actual], [{ sourceId: "loan-b", allocation: { ...allocation, allocationId: randomUUID() } }])).toThrowError(expect.objectContaining({ code: "LOAN_EVENT_OVERALLOCATED" }));
    actual.data.entries[0].amount = "24000000";
    expect(reconcileLoanRevision(input, [actual], [{ sourceId: "loan-b", allocation: { ...allocation, allocationId: randomUUID() } }]).status).toBe("RECONCILED");
  });
  it("uses separately documented full principal instead of dividing user payment by share", () => {
    const { input, actual, allocation } = reconciliation(); input.previous.paymentShare = "0.5"; input.next.paymentShare = "0.5";
    allocation.components.principal = "4000000"; allocation.components.interest = "0"; allocation.components.prepaymentFee = "0";
    expect(reconcileLoanRevision(input, [actual], [])).toMatchObject({ principalPaid: "10000000", userPaid: "4000000", closingPrincipal: "90000000" });
    input.previous.balanceScope = input.next.balanceScope = allocation.scope = "USER_SHARE";
    input.previous.paymentShare = input.next.paymentShare = "1";
    expect(() => reconcileLoanRevision(input, [actual], [])).toThrowError(expect.objectContaining({ code: "LOAN_COMPONENT_SCOPE_MISMATCH" }));
  });
  it("carries actual paid amounts into cap and refuses resetting prior obligations", () => {
    const { input, actual } = reconciliation();
    input.previous.responsibility = { kind: "CAPPED", capBasis: "TOTAL_USER_PAYMENTS", limit: "50000000", previouslyPaid: "5000000", evidence };
    input.next.responsibility = { ...input.previous.responsibility, previouslyPaid: "17000000" };
    expect(reconcileLoanRevision(input, [actual], []).status).toBe("RECONCILED");
    input.next.responsibility.previouslyPaid = "12000000";
    expect(() => reconcileLoanRevision(input, [actual], [])).toThrowError(expect.objectContaining({ code: "LOAN_CAP_CARRY_MISMATCH" }));
  });
  it("permits evidenced principal advances but never converts fees into a loan advance", () => {
    const { input, actual } = reconciliation();
    input.principalAdvances = [{ changeId: randomUUID(), bookedOn: "2026-09-25", amount: "2000000", kind: "CONFIRMED_PRINCIPAL_ADVANCE", evidence }];
    input.next.principalBalance = "92000000";
    expect(reconcileLoanRevision(input, [actual], [])).toMatchObject({ principalAdvanced: "2000000", closingPrincipal: "92000000" });
    input.principalAdvances[0].bookedOn = "2026-08-29";
    expect(() => reconcileLoanRevision(input, [actual], [])).toThrowError(expect.objectContaining({ code: "LOAN_ADVANCE_EVIDENCE_INVALID" }));
  });
  it("does not infer ordering for same-day opening balance and principal payment", () => {
    const { input, actual, allocation } = reconciliation(); input.previous.balanceAsOf = allocation.bookedOn;
    input.previous.periods[0].accrualFrom = allocation.bookedOn;
    input.previous.periods[0].rate = { kind: "SIMPLE_ANNUAL_DAILY", percent: "0", days: 10, yearDays: 365 };
    expect(() => reconcileLoanRevision(input, [actual], [])).toThrowError(expect.objectContaining({ code: "LOAN_ALLOCATION_BASIS_INVALID" }));
  });
});
