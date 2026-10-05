import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { DebtDecimal as D, periodRate } from "./loan";
import { loanContractV2Schema, type LoanContractV2 } from "./revision-schema";

export const LOAN_REVISION_ENGINE = "loan-revision-v2";
export type LoanV2Row = { dueDate: string; opening: string; principal: string; interest: string; carriedInterest: string; fee: string;
  closing: string; contractPayment: string; userPayment: string; remainingLiabilityCap: string | null };
/** Explicit contract arithmetic, not a bank approval or an inferred legal rate.
 * Each period pins its rate/day convention; no live index lookup or capitalization. */
export function projectLoanRevision(value: LoanContractV2) {
  const c = loanContractV2Schema.parse(value), rows: LoanV2Row[] = [], issues: string[] = [];
  const round = (n: InstanceType<typeof D>) => c.rounding === "CENT_HALF_UP" ? n.toDecimalPlaces(2, D.ROUND_HALF_UP) : n;
  let balance = new D(c.principalBalance), cap = c.responsibility.kind === "CAPPED" ? new D(c.responsibility.limit).minus(c.responsibility.previouslyPaid) : null;
  // Present value of unit payments under explicitly supplied variable rates.
  // Interest-only grace pays interest separately and leaves principal unchanged.
  let discount = new D(1), annuityFactor = new D(0);
  for (const p of c.periods) if (!p.gracePrincipal) {
    discount = discount.div(periodRate(p.rate).plus(1)); annuityFactor = annuityFactor.plus(discount);
  }
  const regular = c.mode === "REDUCE_PAYMENT_KEEP_TERM" ? round(balance.div(annuityFactor)) : new D(c.fixedPayment ?? "0");
  const bank = c.mode === "BANK_SCHEDULE" || c.mode === "RESTRUCTURED";
  for (const [i, p] of c.periods.entries()) {
    const opening = balance, accrued = round(opening.mul(periodRate(p.rate)));
    const interest = bank ? new D(p.bankPayment!.interest) : accrued;
    if (bank && !interest.eq(accrued)) { issues.push("BANK_INTEREST_DIFFERS_FROM_DECLARED_RATE"); break; }
    let principal = bank ? new D(p.bankPayment!.principal) : p.gracePrincipal || balance.isZero() ? new D(0) : regular.minus(interest);
    if (principal.lt(0)) { issues.push("PAYMENT_BELOW_INTEREST_NO_CAPITALIZATION"); break; }
    if (bank && principal.gt(balance)) { issues.push("PRINCIPAL_PAYMENT_EXCEEDS_BALANCE"); break; }
    const final = i === c.periods.length - 1;
    if (!bank && final && !p.gracePrincipal && (c.finalPayment === "ADJUST_FINAL_PAYMENT" || c.finalPayment === "BALLOON_CONFIRMED")) principal = balance;
    else principal = D.min(balance, principal);
    balance = balance.minus(principal);
    const carried = new D(p.carriedInterest), fee = new D(p.fee), total = principal.plus(interest).plus(carried).plus(fee);
    // Principal payoff does not cancel separately declared arrears or fees.
    if (opening.isZero() && total.isZero()) continue;
    let user = round(total.mul(c.paymentShare));
    if (cap !== null) { user = D.min(user, cap); cap = cap.minus(user); }
    rows.push({ dueDate: p.dueDate, opening: opening.toFixed(), principal: principal.toFixed(), interest: interest.toFixed(), carriedInterest: carried.toFixed(), fee: fee.toFixed(),
      closing: balance.toFixed(), contractPayment: total.toFixed(), userPayment: user.toFixed(), remainingLiabilityCap: cap?.toFixed() ?? null });
  }
  if (!issues.length && !balance.isZero()) issues.push("UNSETTLED_BALANCE_AT_MATURITY");
  if (rows.some(r => new D(r.closing).lt(0))) throw new AppError(422, "LOAN_BALANCE_INVALID", "Dư gốc không hợp lệ.");
  const sum = (key: "principal" | "interest" | "carriedInterest" | "fee" | "contractPayment" | "userPayment") => rows.reduce((n,r) => n.plus(r[key]),new D(0)).toFixed();
  return { engineCode: LOAN_REVISION_ENGINE, inputHash: digest(c), status: issues.length ? "REVIEW_REQUIRED" as const : "READY" as const,
    confirmation: c.confirmation, issues, rows: issues.length ? [] : rows,
    totals: issues.length ? null : { principal: sum("principal"), interest: sum("interest"), carriedInterest: sum("carriedInterest"), fee: sum("fee"),
      contractPayment: sum("contractPayment"), userPayment: sum("userPayment"), remainingLiabilityCap: cap?.toFixed() ?? null },
    conventions: { rateSource: "PINNED_CONTRACT_PERIODS", dayBoundary: "EXCLUDE_START_INCLUDE_END", capitalization: "NONE", valueKind: "SCHEDULE_NOT_ACTUAL", currency: "VND" } };
}
