import { addMonths, monthSchema } from "../../common/calendar";
import type { DebtEntry } from "../profiles/schema-v2";
import { Prisma } from "@prisma/client";
const D = Prisma.Decimal.clone({ precision: 48 });
export type IllustrationRow = { dueDate: string; opening: string; principal: string; interest: string; fee: string; closing: string; userPayment: string; userPrincipal: string; userInterest: string; userFee: string };
/** Nominal annual rate / 12, fixed total payment, reducing balance, no fees.
 * Explicitly illustrative; never synthesizes a confirmed loan contract. */
export function illustrateDebt(debt: DebtEntry, valuationDate: string) {
  const issues: Array<{ loanId: string; code: string }> = [];
  const issue = (code: string) => { issues.push({ loanId: debt.id, code }); };
  if (debt.currency !== "VND") issue("FX_RULE_REQUIRED");
  if (debt.balanceAsOf.status !== "KNOWN" || debt.balanceAsOf.value !== valuationDate) issue("VALUATION_DATE_MISMATCH");
  if (debt.outstandingBalance.status !== "KNOWN") issue("BALANCE_REQUIRED");
  if (debt.payment.status !== "KNOWN") issue("PAYMENT_REQUIRED");
  if (debt.paymentShare.status !== "KNOWN") issue("PAYMENT_SHARE_REQUIRED");
  const rate = debt.illustration?.annualRatePercent;
  if (rate?.status !== "KNOWN") issue("DECLARED_RATE_REQUIRED");
  if (debt.frequency !== "MONTHLY") issue("MONTHLY_ILLUSTRATION_REQUIRED");
  if (debt.startMonth > valuationDate.slice(0, 7) && rate?.status === "KNOWN" && new D(rate.value).gt(0) && debt.outstandingBalance.status === "KNOWN" && new D(debt.outstandingBalance.value).gt(0)) issue("DEFERRED_INTEREST_TERMS_REQUIRED");
  const rows: IllustrationRow[] = [];
  if (issues.length || debt.outstandingBalance.status !== "KNOWN" || debt.payment.status !== "KNOWN" || debt.paymentShare.status !== "KNOWN" || rate?.status !== "KNOWN") return { status: "INCOMPLETE" as const, rows, payoffDate: null, issues };
  let balance = new D(debt.outstandingBalance.value);
  const payment = new D(debt.payment.value), share = new D(debt.paymentShare.value), monthlyRate = new D(rate.value).div(1200);
  const start = debt.startMonth > valuationDate.slice(0, 7) ? debt.startMonth : valuationDate.slice(0, 7);
  for (let i = 0; i < 600 && balance.gt(0); i++) {
    const month = addMonths(start, i);
    if (!monthSchema.safeParse(month).success || debt.endMonth !== null && month > debt.endMonth) break;
    const interest = balance.mul(monthlyRate), available = payment.minus(interest);
    if (!available.gt(0)) { issue("PAYMENT_NOT_REDUCING_PRINCIPAL"); return { status: "INCOMPLETE" as const, rows: [], payoffDate: null, issues }; }
    const principal = D.min(balance, available), closing = balance.minus(principal), dueDate = month + "-01";
    rows.push({ dueDate, opening: balance.toFixed(), principal: principal.toFixed(), interest: interest.toFixed(), fee: "0", closing: closing.toFixed(),
      userPayment: principal.plus(interest).mul(share).toFixed(), userPrincipal: principal.mul(share).toFixed(), userInterest: interest.mul(share).toFixed(), userFee: "0" });
    balance = closing;
  }
  if (balance.gt(0)) issue("ILLUSTRATION_HORIZON_OR_DECLARED_END_REACHED");
  return { status: balance.isZero() ? "READY" as const : "HORIZON_LIMIT" as const, rows, payoffDate: balance.isZero() ? rows.at(-1)?.dueDate ?? null : null, issues };
}
