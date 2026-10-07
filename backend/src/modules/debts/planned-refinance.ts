import { z } from "zod";
import { AppError } from "../../common/errors";
import { dateSchema, monthSchema, addMonths } from "../../common/calendar";
import { digest } from "../../common/digest";
import { moneySchema } from "../../common/http";
import { DebtDecimal as D } from "./loan";
import { loanContractV2Schema, loanEvidenceSchema } from "./revision-schema";
import { loanCreationSchema } from "./source-create";
import { projectLoanRevision } from "./revision-engine";
import type { SourceCell } from "../retirement/sources";

const evidence = z.array(loanEvidenceSchema).min(1).max(20);
/** Internal arithmetic contract. The public source service must supply the
 * pinned previous contract and perform owner/CAS/actual checks before saving. */
export const plannedRefinanceSchema = z.object({
  engineCode: z.literal("planned-refinance-v1"), previous: loanContractV2Schema,
  replacement: loanCreationSchema, cutoff: monthSchema, knownOn: dateSchema, horizon: monthSchema,
  settledOn: dateSchema, sameDayOrder: z.enum(["BEFORE_SCHEDULED_PAYMENT", "AFTER_SCHEDULED_PAYMENT"]),
  payoffQuote: z.object({ principal: moneySchema, interest: moneySchema, carriedInterest: moneySchema,
    prepaymentFee: moneySchema, otherFee: moneySchema, allRemainingChargesIncluded: z.literal(true),
    valueKind: z.literal("HYPOTHETICAL_QUOTE"), evidence }).strict(),
  funding: z.object({ scope: z.enum(["FULL_CONTRACT", "USER_SHARE"]), externalTopUp: moneySchema,
    userTopUp: moneySchema, userFinancedAmount: moneySchema, unusedProceeds: moneySchema,
    unusedProceedsNotContributed: z.literal(true), evidence }).strict(),
  confirm: z.literal(true),
}).strict();
export type PlannedRefinance = z.infer<typeof plannedRefinanceSchema>;
function fail(code: string): never { throw new AppError(422, code, "Cần kiểm tra giả định, lịch vay và báo giá tất toán dự kiến."); }

/** Future cash-flow substitution, never an actual payoff or a fund transaction.
 * Loan proceeds pay the old creditor externally. Only the explicitly allocated
 * user top-up remains a household payment; unused proceeds do not enter a fund. */
export function projectPlannedRefinance(value: PlannedRefinance) {
  const input = plannedRefinanceSchema.parse(value), { previous: old, replacement, payoffQuote: quote, funding } = input;
  const next = replacement.contract, disbursement = replacement.funding;
  const firstMonth = addMonths(input.cutoff, 1);
  const cutoffDate = new Date(Date.parse(firstMonth + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  if (old.balanceAsOf !== cutoffDate || old.balanceNature === "PROJECTED_DISBURSEMENT" || old.knownOn > input.knownOn ||
    input.settledOn <= input.knownOn || input.settledOn <= cutoffDate || input.settledOn > old.maturityDate ||
    input.horizon < input.settledOn.slice(0, 7) || input.horizon < firstMonth) fail("PLANNED_REFINANCE_PERIOD_INVALID");
  if (replacement.refinanceCommandId || disbursement.kind !== "PLANNED_DISBURSEMENT" || next.confirmation !== "HYPOTHETICAL" ||
    next.balanceNature !== "PROJECTED_DISBURSEMENT" || next.balanceAsOf !== input.settledOn || next.knownOn > input.knownOn ||
    old.balanceScope !== funding.scope || next.balanceScope !== funding.scope) fail("PLANNED_REFINANCE_REPLACEMENT_INVALID");
  if (disbursement.kind !== "PLANNED_DISBURSEMENT") return fail("PLANNED_REFINANCE_REPLACEMENT_INVALID");
  if ([...quote.evidence, ...funding.evidence, ...disbursement.evidence].some(e => e.confirmedOn > input.knownOn))
    fail("PLANNED_REFINANCE_EVIDENCE_INVALID");
  if (!new D(disbursement.grossPrincipal).eq(next.principalBalance) || new D(next.principalBalance).lte(0) ||
    !new D(disbursement.grossPrincipal).minus(disbursement.withheldFees).eq(disbursement.netDisbursement) ||
    (next.responsibility.kind === "CAPPED" && !new D(next.responsibility.previouslyPaid).isZero()) ||
    (next.userPaidToDate !== undefined && !new D(next.userPaidToDate).isZero())) fail("PLANNED_REFINANCE_FUNDING_MISMATCH");
  const original = projectLoanRevision(old), created = projectLoanRevision(next);
  if (original.status !== "READY" || created.status !== "READY") fail("LOAN_SCHEDULE_REVIEW_REQUIRED");
  const retained = original.rows.filter(r => r.dueDate < input.settledOn ||
    (r.dueDate === input.settledOn && input.sameDayOrder === "AFTER_SCHEDULED_PAYMENT"));
  const principal = new D(retained.at(-1)?.closing ?? old.principalBalance);
  if (principal.lte(0) || !principal.eq(quote.principal)) fail("PLANNED_REFINANCE_PRINCIPAL_MISMATCH");
  // An immediate post-payment payoff has no additional elapsed-interest day.
  // Other interest/charges are a pinned quote, never inferred from generic law.
  if (retained.at(-1)?.dueDate === input.settledOn && !new D(quote.interest).isZero()) fail("PLANNED_REFINANCE_QUOTE_MISMATCH");
  const settlement = [quote.principal, quote.interest, quote.carriedInterest, quote.prepaymentFee, quote.otherFee]
    .reduce((sum, amount) => sum.plus(amount), new D(0));
  const round = (amount: InstanceType<typeof D>) => old.rounding === "CENT_HALF_UP" ? amount.toDecimalPlaces(2, D.ROUND_HALF_UP) : amount;
  let userSettlement = round(settlement.mul(old.paymentShare));
  const paidBefore = retained.reduce((sum, r) => sum.plus(r.userPayment), new D(0));
  let remainingCap: InstanceType<typeof D> | null = null;
  if (old.responsibility.kind === "CAPPED") {
    remainingCap = new D(old.responsibility.limit).minus(old.responsibility.previouslyPaid).minus(paidBefore);
    userSettlement = D.min(userSettlement, remainingCap);
  }
  if (!new D(disbursement.netDisbursement).plus(funding.externalTopUp).eq(settlement.plus(funding.unusedProceeds)) ||
    !new D(funding.userTopUp).plus(funding.userFinancedAmount).eq(userSettlement) ||
    new D(funding.userTopUp).gt(funding.externalTopUp) || new D(funding.userFinancedAmount).gt(disbursement.netDisbursement) ||
    (funding.scope === "USER_SHARE" && !new D(funding.userTopUp).eq(funding.externalTopUp))) fail("PLANNED_REFINANCE_FUNDING_MISMATCH");
  const toSchedule = (rows: Array<{ dueDate: string; userPayment: string }>): SourceCell[] => {
    const months = new Map<string, InstanceType<typeof D>>();
    for (const row of rows) {
      const month = row.dueDate.slice(0, 7);
      if (month >= firstMonth && month <= input.horizon) months.set(month, (months.get(month) ?? new D(0)).plus(row.userPayment));
    }
    return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, metric: "debtPayment", amount: amount.toFixed() }));
  };
  return { engineCode: input.engineCode, inputHash: digest(input), confirmation: "HYPOTHETICAL" as const,
    settlementAmount: settlement.toFixed(), projectedPrincipal: principal.toFixed(), userSettlementAmount: userSettlement.toFixed(),
    remainingOldCapBeforeSettlement: remainingCap?.toFixed() ?? null,
    retainedPayments: retained, oldSchedule: toSchedule([...retained, { dueDate: input.settledOn, userPayment: funding.userTopUp }]),
    replacementSchedule: toSchedule(created.rows),
    fundAdjustment: "0" as const, limitations: ["QUOTE_NOT_BANK_APPROVAL", "NO_AUTOMATIC_PROCEEDS_CONTRIBUTION", "SAME_DAY_ORDER_EXPLICIT", "PROJECTED_PAYMENTS_NOT_ACTUAL"] };
}
