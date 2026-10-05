import { Prisma } from "@prisma/client";
import type { DebtEntry } from "../profiles/schema-v2";
import type { ContractPeriod, ContractRate, LoanContract } from "./schema";

export const DebtDecimal = Prisma.Decimal.clone({ precision: 48 });
const D = DebtDecimal;
export type DebtIssue = { loanId: string | null; code: string };
export type ReadyLoan = { debt: DebtEntry; contract: LoanContract; opening: Prisma.Decimal; share: Prisma.Decimal };

export function periodRate(rate: ContractRate): Prisma.Decimal {
  const percent = new D(rate.percent).div(100);
  switch (rate.kind) {
    case "EFFECTIVE_ANNUAL": return percent.plus(1).pow(new D(1).div(12)).minus(1);
    case "NOMINAL_ANNUAL_MONTHLY": return percent.div(12);
    case "EFFECTIVE_MONTHLY": return percent;
    case "SIMPLE_ANNUAL_DAILY": return percent.mul(rate.days).div(rate.yearDays);
  }
}
export function comparableAnnualRate(rate: ContractRate): Prisma.Decimal {
  const periods = rate.kind === "SIMPLE_ANNUAL_DAILY" ? new D(365).div(rate.days) : new D(12);
  return periodRate(rate).plus(1).pow(periods).minus(1);
}
export function prepareLoan(debt: DebtEntry, valuationDate: string): { loan: ReadyLoan | null; issues: DebtIssue[] } {
  const issues: DebtIssue[] = [];
  const issue = (code: string) => issues.push({ loanId: debt.id, code });
  if (debt.currency !== "VND") issue("FX_RULE_REQUIRED");
  if (debt.outstandingBalance.status !== "KNOWN") issue("BALANCE_REQUIRED");
  if (debt.paymentShare.status !== "KNOWN") issue("PAYMENT_SHARE_REQUIRED");
  if (debt.balanceAsOf.status !== "KNOWN" || debt.balanceAsOf.value !== valuationDate) issue("VALUATION_DATE_MISMATCH");
  if (debt.contract?.status !== "KNOWN") issue("LOAN_CONTRACT_REQUIRED");
  if (issues.length || debt.outstandingBalance.status !== "KNOWN" || debt.paymentShare.status !== "KNOWN" || debt.contract?.status !== "KNOWN") return { loan: null, issues };
  const contract = debt.contract.value;
  if (contract.balanceAsOf !== valuationDate || contract.periods[0].dueDate.slice(0, 7) !== valuationDate.slice(0, 7)) issue("CONTRACT_VALUATION_MISMATCH");
  if (contract.confirmedOn > valuationDate) issue("CONTRACT_CONFIRMATION_AFTER_VALUATION");
  if (debt.endMonth !== contract.maturityDate.slice(0, 7)) issue("MATURITY_MISMATCH");
  if (debt.startMonth > valuationDate.slice(0, 7) || debt.frequency !== "MONTHLY") issue("MONTHLY_CONTRACT_REQUIRED");
  return { loan: issues.length ? null : { debt, contract, opening: new D(debt.outstandingBalance.value), share: new D(debt.paymentShare.value) }, issues };
}
export type ScheduledPayment = { opening: Prisma.Decimal; interest: Prisma.Decimal; principal: Prisma.Decimal; fee: Prisma.Decimal; closing: Prisma.Decimal; code: string | null };
export function scheduledPayment(opening: Prisma.Decimal, period: ContractPeriod, settleRemaining: boolean): ScheduledPayment {
  if (opening.isZero()) return { opening, interest: new D(0), principal: new D(0), fee: new D(0), closing: opening, code: null };
  const interest = opening.mul(periodRate(period.rate));
  const declared = period.repayment.kind === "INTEREST_ONLY" ? new D(0)
    : period.repayment.kind === "PRINCIPAL_PLUS_INTEREST" ? new D(period.repayment.amount)
    : new D(period.repayment.amount).minus(interest);
  const desired = D.max(declared, new D(period.minimumPayment).minus(interest));
  if (desired.lt(0)) return { opening, interest, principal: new D(0), fee: new D(period.fee), closing: opening, code: "NEGATIVE_AMORTIZATION_UNSUPPORTED" };
  const principal = settleRemaining ? opening : D.min(opening, desired);
  const closing = opening.minus(principal);
  const code = closing.gt(0) && principal.plus(interest).lt(period.minimumPayment) ? "CONTRACT_PAYMENT_BELOW_MINIMUM" : null;
  return { opening, interest, principal, fee: new D(period.fee), closing, code };
}

export function buildContractSchedule(debt: DebtEntry, valuationDate: string) {
  const prepared = prepareLoan(debt, valuationDate);
  const rows: Array<{ dueDate: string; opening: string; principal: string; interest: string; fee: string; closing: string; userPrincipalInterest: string; userFee: string; userPayment: string }> = [];
  if (!prepared.loan) return { status: "INCOMPLETE" as const, rows, issues: prepared.issues };
  const { loan } = prepared;
  let balance = loan.opening;
  for (const [index, period] of loan.contract.periods.entries()) {
    const payment = scheduledPayment(balance, period, index === loan.contract.periods.length - 1 && loan.contract.settleRemainingAtMaturity);
    if (payment.code) return { status: "INCOMPLETE" as const, rows: [], issues: [{ loanId: debt.id, code: payment.code }] };
    balance = payment.closing;
    const principalInterest = payment.principal.plus(payment.interest).mul(loan.share), fee = payment.fee.mul(loan.share);
    rows.push({ dueDate: period.dueDate, opening: payment.opening.toFixed(), principal: payment.principal.toFixed(), interest: payment.interest.toFixed(),
      fee: payment.fee.toFixed(), closing: balance.toFixed(), userPrincipalInterest: principalInterest.toFixed(), userFee: fee.toFixed(), userPayment: principalInterest.plus(fee).toFixed() });
  }
  if (balance.gt(0)) return { status: "INCOMPLETE" as const, rows: [], issues: [{ loanId: debt.id, code: "UNSETTLED_BALANCE_AT_MATURITY" }] };
  return { status: "READY" as const, rows, issues: prepared.issues };
}

// One source for current debt cashflow in both profile summary and debt preview.
export function declaredDebtPayment(debt: DebtEntry, valuationDate: string) {
  if (debt.contract?.status === "KNOWN") {
    const schedule = buildContractSchedule(debt, valuationDate);
    if (schedule.status !== "READY") return { value: null, issues: schedule.issues };
    const row = schedule.rows.find(row => row.dueDate.slice(0, 7) === valuationDate.slice(0, 7));
    return { value: new D(row?.userPayment ?? "0"), issues: [] };
  }
  const month = valuationDate.slice(0, 7);
  if (debt.startMonth > month || (debt.endMonth !== null && debt.endMonth < month)) return { value: new D(0), issues: [] };
  if (debt.currency !== "VND") return { value: null, issues: [{ loanId: debt.id, code: "FX_RULE_REQUIRED" }] };
  if (debt.payment.status !== "KNOWN" || debt.paymentShare.status !== "KNOWN") return { value: null, issues: [{ loanId: debt.id, code: "UNKNOWN_VALUE" }] };
  return { value: new D(debt.payment.value).mul(debt.paymentShare.value), issues: [] };
}
