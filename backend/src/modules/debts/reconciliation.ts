import { z } from "zod";
import { AppError } from "../../common/errors";
import { dateSchema, monthSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { moneySchema } from "../../common/http";
import { actualPayloadSchema } from "../actuals/schema";
import { reconcile } from "../actuals/reconcile";
import { DebtDecimal as D } from "./loan";
import { loanAllocationSchema, loanBalanceBasisSchema, loanContractV2Schema, loanEvidenceSchema, type LoanComponents } from "./revision-schema";

export const loanActualEvidenceSchema = z.object({ period: monthSchema, revision: z.number().int().positive(),
  status: z.literal("RECONCILED"), data: actualPayloadSchema }).strict();
export const loanBalanceChangeSchema = z.object({ changeId: z.string().uuid(), bookedOn: dateSchema, amount: moneySchema,
  kind: z.literal("CONFIRMED_PRINCIPAL_ADVANCE"), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict();
export const loanReconciliationSchema = z.object({ previous: z.union([loanContractV2Schema, loanBalanceBasisSchema]), next: loanContractV2Schema,
  allocations: z.array(loanAllocationSchema).max(500), principalAdvances: z.array(loanBalanceChangeSchema).max(100) }).strict();
export type LoanReconciliation = z.infer<typeof loanReconciliationSchema>;
export type LoanActualEvidence = z.infer<typeof loanActualEvidenceSchema>;
export type LoanConsumedAllocation = { sourceId: string; allocation: z.infer<typeof loanAllocationSchema> };
const keys = ["principal", "interest", "prepaymentFee", "otherFee"] as const;
export const loanComponentsTotal = (c: LoanComponents) => keys.reduce((n, k) => n.plus(c[k]), new D(0));
const fail = (code: string) => { throw new AppError(409, code, "Chứng từ trả nợ hoặc số dư không khớp. Hãy đối soát lại."); };

/** The service supplies owned, reconciled actual snapshots and ALL allocations
 * in the parent lineage. Nothing in this function debits the retirement fund. */
export function reconcileLoanRevision(value: LoanReconciliation, actualValues: LoanActualEvidence[], consumed: LoanConsumedAllocation[]) {
  const input = loanReconciliationSchema.parse(value), { previous, next } = input;
  if (next.balanceScope !== previous.balanceScope || next.balanceAsOf < previous.balanceAsOf || next.knownOn < previous.knownOn ||
    next.signedOn !== previous.signedOn || (previous.amendedOn && (!next.amendedOn || next.amendedOn < previous.amendedOn))) fail("LOAN_REVISION_LINEAGE_INVALID");
  const actuals = actualValues.map(a => loanActualEvidenceSchema.parse(a));
  if (actuals.some(a => reconcile(a.data).reconciliation !== "MATCHED")) fail("LOAN_ACTUAL_UNRECONCILED");
  const byPeriod = new Map(actuals.map(a => [a.period, a]));
  if (byPeriod.size !== actuals.length) fail("LOAN_ACTUAL_PERIOD_DUPLICATE");
  const events = new Map<string, { actual: LoanActualEvidence; entry: LoanActualEvidence["data"]["entries"][number] }>();
  for (const actual of actuals) for (const entry of actual.data.entries) {
    if (events.has(entry.eventId) || entry.date.slice(0, 7) !== actual.period) fail("LOAN_ACTUAL_EVENT_INVALID");
    events.set(entry.eventId, { actual, entry });
  }
  const allocations = consumed.map(c => loanAllocationSchema.parse(c.allocation));
  const ids = new Set<string>(), amounts = new Map<string, InstanceType<typeof D>>();
  for (const allocation of [...allocations, ...input.allocations]) {
    if (ids.has(allocation.allocationId)) fail("LOAN_ALLOCATION_REUSED");
    ids.add(allocation.allocationId);
    const proof = events.get(allocation.eventId);
    if (!proof || proof.actual.revision !== allocation.actualRevision || proof.entry.date !== allocation.bookedOn || proof.entry.kind !== "DEBT_PAYMENT") fail("LOAN_ACTUAL_STALE_OR_MISSING");
    const total = loanComponentsTotal(allocation.components);
    if (total.lte(0)) fail("LOAN_ALLOCATION_EMPTY");
    const allocated = (amounts.get(allocation.eventId) ?? new D(0)).plus(total);
    if (allocated.gt(proof!.entry.amount)) fail("LOAN_EVENT_OVERALLOCATED");
    amounts.set(allocation.eventId, allocated);
  }
  let principalPaid = new D(0), userPaid = new D(0);
  for (const a of input.allocations) {
    if (a.scope !== previous.balanceScope || a.bookedOn <= previous.balanceAsOf || a.bookedOn > next.balanceAsOf ||
      a.evidence.some(e => e.confirmedOn > next.knownOn)) fail("LOAN_ALLOCATION_BASIS_INVALID");
    for (const k of keys) {
      if (new D(a.components[k]).gt(a.contractComponents[k]) ||
        (a.scope === "USER_SHARE" && !new D(a.components[k]).eq(a.contractComponents[k]))) fail("LOAN_COMPONENT_SCOPE_MISMATCH");
    }
    principalPaid = principalPaid.plus(a.contractComponents.principal);
    userPaid = userPaid.plus(loanComponentsTotal(a.components));
  }
  const changeIds = new Set<string>();
  let advance = new D(0);
  for (const a of input.principalAdvances) {
    if (changeIds.has(a.changeId) || a.bookedOn <= previous.balanceAsOf || a.bookedOn > next.balanceAsOf ||
      a.evidence.some(e => e.confirmedOn > next.knownOn) || new D(a.amount).lte(0)) fail("LOAN_ADVANCE_EVIDENCE_INVALID");
    changeIds.add(a.changeId); advance = advance.plus(a.amount);
  }
  const closing = new D(previous.principalBalance).minus(principalPaid).plus(advance);
  if (closing.lt(0) || !closing.eq(next.principalBalance)) fail("DEBT_BALANCE_MISMATCH");
  // A later advance cannot retrospectively fund an earlier principal payment.
  // Date-only evidence cannot establish ordering when both occur on one date.
  const days = new Map<string, { paid: InstanceType<typeof D>; advanced: InstanceType<typeof D> }>();
  for (const a of input.allocations) {
    const day = days.get(a.bookedOn) ?? { paid: new D(0), advanced: new D(0) };
    day.paid = day.paid.plus(a.contractComponents.principal); days.set(a.bookedOn, day);
  }
  for (const a of input.principalAdvances) {
    const day = days.get(a.bookedOn) ?? { paid: new D(0), advanced: new D(0) };
    day.advanced = day.advanced.plus(a.amount); days.set(a.bookedOn, day);
  }
  let running = new D(previous.principalBalance);
  for (const [, day] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (day.paid.gt(0) && day.advanced.gt(0)) fail("LOAN_POSTING_ORDER_REQUIRED");
    running = running.plus(day.advanced).minus(day.paid);
    if (running.lt(0)) fail("LOAN_PRINCIPAL_PAYMENT_EXCEEDS_BALANCE");
  }
  if (previous.responsibility.kind !== next.responsibility.kind) fail("LOAN_RESPONSIBILITY_REVIEW_REQUIRED");
  if (previous.responsibility.kind === "CAPPED" && next.responsibility.kind === "CAPPED") {
    if (!new D(previous.responsibility.limit).eq(next.responsibility.limit) ||
      !new D(previous.responsibility.previouslyPaid).plus(userPaid).eq(next.responsibility.previouslyPaid)) fail("LOAN_CAP_CARRY_MISMATCH");
  }
  // A same-day payment is ambiguous with an opening balance: the caller must
  // supply the prior day's confirmed close instead of guessing posting order.
  return { status: "RECONCILED" as const, openingPrincipal: previous.principalBalance, principalPaid: principalPaid.toFixed(),
    principalAdvanced: advance.toFixed(), closingPrincipal: closing.toFixed(), userPaid: userPaid.toFixed(),
    fundAdjustment: "0" as const, proofHash: digest({ input, actuals, consumed }) };
}
