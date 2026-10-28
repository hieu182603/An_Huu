import { z } from "zod";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { digest } from "../../common/digest";
import { loanContractV2Schema, loanEvidenceSchema, loanAllocationSchema, loanBalanceBasisSchema } from "./revision-schema";
import { loanActualEvidenceSchema, loanBalanceChangeSchema, loanResponsibilityAmendmentSchema, loanComponentsTotal, reconcileLoanRevision, type LoanActualEvidence, type LoanConsumedAllocation } from "./reconciliation";
import { DebtDecimal as D } from "./loan";
import { loanSourceSchedule } from "./source-candidate";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, type SourceRegistry } from "../retirement/sources";

const terms = loanContractV2Schema.shape, evidence = z.array(loanEvidenceSchema).min(1).max(20);
/** Terms in force at disbursement when the bank amended the contract later.
 * Declared with evidence; never inferred from the amended terms. */
export const loanOriginalTermsSchema = z.object({ signedOn: dateSchema, amendedOn: dateSchema.nullable(), effectiveOn: dateSchema,
  balanceScope: terms.balanceScope, paymentShare: terms.paymentShare, responsibility: terms.responsibility, evidence, confirm: z.literal(true) }).strict();
/** Balance in the NEW scope at end of contract.effectiveOn, from a bank/co-borrower document. */
export const loanScopeChangeSchema = z.object({ openingPrincipal: moneySchema, evidence, confirm: z.literal(true) }).strict();
export const loanCreationSchema = z.object({ commandId: z.string().uuid(), sourceId: z.string().regex(/^plan:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i),
  operation: z.literal("CREATE"), expectedSourceRevision: z.literal(0), confirm: z.literal(true),
  refinanceCommandId: z.string().uuid().optional(),
  agreementReference: z.string().trim().min(1).max(200), contract: loanContractV2Schema,
  funding: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("EXISTING_BALANCE"), notAlreadyInSources: z.literal(true), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict(),
    z.object({ kind: z.literal("DISBURSED_BALANCE"), notAlreadyInSources: z.literal(true), disbursedOn: dateSchema,
      grossPrincipal: moneySchema, openingUserPaid: moneySchema, evidence: z.array(loanEvidenceSchema).min(1).max(20),
      allocations: z.array(loanAllocationSchema).max(500), principalAdvances: z.array(loanBalanceChangeSchema).max(100),
      originalTerms: loanOriginalTermsSchema.optional(), scopeChange: loanScopeChangeSchema.optional(),
      responsibilityAmendment: loanResponsibilityAmendmentSchema.optional() }).strict(),
    z.object({ kind: z.literal("PLANNED_DISBURSEMENT"), grossPrincipal: moneySchema, withheldFees: moneySchema, netDisbursement: moneySchema,
      destination: z.literal("EXTERNAL_ACCOUNT"), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict(),
  ]) }).strict();
export type LoanCreation = z.infer<typeof loanCreationSchema>;
export const loanCreationEvidenceSchema = z.object({ command: loanCreationSchema, cutoff: monthSchema, knownOn: dateSchema,
  reconciliation: z.object({ actuals: z.array(loanActualEvidenceSchema).max(1200),
    consumed: z.array(z.object({ sourceId: z.string(), allocation: loanAllocationSchema }).strict()).max(10000) }).strict().optional(),
}).strict();
export type LoanCreationEvidence = z.infer<typeof loanCreationEvidenceSchema>;
const fail = (code: string): never => { throw new AppError(422, code, "Cần rà soát nguồn khoản vay và chứng từ giải ngân."); };

/** New debt records only obligations. Loan proceeds never become income or a
 * retirement contribution; past fund movements are already in the actual anchor. */
export function createLoanSource(registry: SourceRegistry, commandValue: LoanCreation, cutoff: string, knownOn: string,
  actuals: LoanActualEvidence[] = [], consumed: LoanConsumedAllocation[] = []) {
  const command = loanCreationSchema.parse(commandValue), c = command.contract;
  assertSourceRegistry(registry); monthSchema.parse(cutoff); dateSchema.parse(knownOn);
  if (registry.revisions.some(s => s.sourceId === command.sourceId)) fail("LOAN_SOURCE_ALREADY_EXISTS");
  if (knownOn < registry.knowledgeAsOf || c.knownOn > knownOn || command.funding.evidence.some(e => e.confirmedOn > knownOn) || new D(c.principalBalance).lte(0))
    fail("LOAN_CREATION_EVIDENCE_INVALID");
  const next = addMonths(cutoff, 1), lastDay = new Date(Date.parse(next + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  let from = next;
  if (command.funding.kind !== "PLANNED_DISBURSEMENT") {
    if (c.balanceAsOf !== lastDay || c.balanceNature === "PROJECTED_DISBURSEMENT" || c.confirmation !== "BANK_CONFIRMED") fail("LOAN_OPENING_BALANCE_REQUIRED");
    if (command.funding.kind === "DISBURSED_BALANCE") {
      const f = command.funding, o = f.originalTerms;
      // Terms in force at disbursement: the current contract unless the bank amended it afterwards.
      if ((c.effectiveOn > f.disbursedOn) !== Boolean(o)) fail(o ? "LOAN_ORIGINAL_TERMS_INVALID" : "LOAN_ORIGINAL_TERMS_REQUIRED");
      const t = o ?? { signedOn: c.signedOn, amendedOn: c.amendedOn, effectiveOn: c.effectiveOn, balanceScope: c.balanceScope, paymentShare: c.paymentShare, responsibility: c.responsibility };
      if (f.disbursedOn < t.effectiveOn || f.disbursedOn > c.balanceAsOf || new D(f.grossPrincipal).lte(0) ||
        f.evidence.some(e => e.confirmedOn < f.disbursedOn || e.confirmedOn > c.knownOn) || actuals.some(a => a.period > cutoff) ||
        (t.responsibility.kind !== "CAPPED" && !new D(f.openingUserPaid).isZero())) fail("LOAN_DISBURSEMENT_EVIDENCE_INVALID");
      if (o && (o.signedOn !== c.signedOn || o.signedOn > o.effectiveOn || !c.amendedOn || c.amendedOn <= f.disbursedOn ||
        (o.amendedOn && (o.amendedOn < o.signedOn || o.amendedOn > o.effectiveOn)) ||
        (o.balanceScope === "USER_SHARE" && !new D(o.paymentShare).eq(1)) ||
        (o.responsibility.kind === "CAPPED" && !new D(o.responsibility.previouslyPaid).eq(f.openingUserPaid)) ||
        [...o.evidence, ...(o.responsibility.kind === "CAPPED" ? o.responsibility.evidence : [])].some(e => e.confirmedOn > c.knownOn)))
        fail("LOAN_ORIGINAL_TERMS_INVALID");
      if (f.responsibilityAmendment && !o) fail("LOAN_RESPONSIBILITY_AMENDMENT_INVALID");
      const tracked = c.userPaidToDate !== undefined;
      const basis = (scope: typeof c.balanceScope, share: string, asOf: string, principal: string, paid: string, proof: typeof f.evidence) =>
        loanBalanceBasisSchema.parse({ basisVersion: 1, currency: c.currency, signedOn: t.signedOn, amendedOn: t.amendedOn,
          effectiveOn: t.effectiveOn, knownOn: c.knownOn, evidence: proof, balanceAsOf: asOf, principalBalance: principal,
          balanceScope: scope, paymentShare: share, ...(tracked ? { userPaidToDate: paid } : {}),
          responsibility: t.responsibility.kind === "CAPPED" ? { ...t.responsibility, previouslyPaid: paid } : t.responsibility });
      const previous = basis(t.balanceScope, t.paymentShare, f.disbursedOn, f.grossPrincipal, f.openingUserPaid, f.evidence);
      if (previous.responsibility.kind === "CAPPED" && new D(f.openingUserPaid).gt(previous.responsibility.limit)) fail("LOAN_CAP_CARRY_MISMATCH");
      const amendment = f.responsibilityAmendment ? { responsibilityAmendment: f.responsibilityAmendment } : {};
      if (t.balanceScope === c.balanceScope) {
        if (f.scopeChange) fail("LOAN_SCOPE_CHANGE_INVALID");
        reconcileLoanRevision({ previous, next: c, allocations: f.allocations, principalAdvances: f.principalAdvances, ...amendment }, actuals, consumed);
      } else {
        // Scope changes at END of contract.effectiveOn: earlier-or-same-day postings are in the old scope.
        const s = f.scopeChange, at = c.effectiveOn;
        if (!s) return fail("LOAN_SCOPE_CHANGE_REQUIRED");
        const before = f.allocations.filter(a => a.bookedOn <= at), after = f.allocations.filter(a => a.bookedOn > at);
        const advancesBefore = f.principalAdvances.filter(a => a.bookedOn <= at), advancesAfter = f.principalAdvances.filter(a => a.bookedOn > at);
        const closingOld = before.reduce((n, a) => n.minus(a.contractComponents.principal), new D(f.grossPrincipal))
          .plus(advancesBefore.reduce((n, a) => n.plus(a.amount), new D(0)));
        const paidOld = before.reduce((n, a) => n.plus(loanComponentsTotal(a.components)), new D(f.openingUserPaid)).toFixed();
        const opening = new D(s.openingPrincipal);
        // The bank's split cannot be derived; only reject impossible directions.
        if (opening.lte(0) || (c.balanceScope === "USER_SHARE" ? opening.gt(closingOld) : opening.lt(closingOld)) ||
          s.evidence.some(e => e.confirmedOn < at || e.confirmedOn > c.knownOn)) fail("LOAN_SCOPE_CHANGE_INVALID");
        const oldClose = basis(t.balanceScope, t.paymentShare, at, closingOld.toFixed(), paidOld, s.evidence);
        reconcileLoanRevision({ previous, next: oldClose, allocations: before, principalAdvances: advancesBefore }, actuals, consumed);
        const newOpen = basis(c.balanceScope, c.paymentShare, at, s.openingPrincipal, paidOld, s.evidence);
        reconcileLoanRevision({ previous: newOpen, next: c, allocations: after, principalAdvances: advancesAfter, ...amendment }, actuals,
          [...consumed, ...before.map(allocation => ({ sourceId: command.sourceId, allocation }))]);
      }
    }
  } else {
    const f = command.funding;
    from = c.balanceAsOf.slice(0, 7);
    if (from <= cutoff || c.balanceNature !== "PROJECTED_DISBURSEMENT" || c.confirmation !== "HYPOTHETICAL" ||
      !new D(f.grossPrincipal).eq(c.principalBalance) || !new D(f.grossPrincipal).minus(f.withheldFees).eq(f.netDisbursement) ||
      (c.userPaidToDate !== undefined && !new D(c.userPaidToDate).isZero()) ||
      (c.responsibility.kind === "CAPPED" && !new D(c.responsibility.previouslyPaid).isZero())) fail("LOAN_DISBURSEMENT_MISMATCH");
  }
  if (from < registry.startMonth || from > registry.endMonth) fail("LOAN_CREATION_OUTSIDE_HORIZON");
  const active = composeSourceMonths(registry, from, registry.endMonth).attribution;
  if (active.some(a => a.metric === "debtPayment" && registry.revisions.some(s => s.sourceHash === a.sourceHash && s.kind === "AGGREGATE"))) fail("SOURCE_AGGREGATE_OVERLAP");
  const evidence = loanCreationEvidenceSchema.parse(JSON.parse(JSON.stringify({ command, cutoff, knownOn,
    ...(command.funding.kind === "DISBURSED_BALANCE" ? { reconciliation: { actuals, consumed } } : {}) })));
  const revision = sealSourceRevision({ sourceId: command.sourceId, revision: 1, previousHash: null, scope: "PLAN_VERSION", origin: "PLAN_CREATED", kind: "DEBT",
    operation: "CREATE", commandId: command.commandId, knownOn, effectiveFromMonth: from, effectiveToMonth: registry.endMonth, confirmation: c.confirmation,
    evidenceHash: digest(evidence), schedule: loanSourceSchedule(c, from, registry.endMonth) });
  return { registry: sealSourceRegistry({ ...registry, knowledgeAsOf: knownOn, revisions: [...registry.revisions, revision] }), sourceHash: revision.sourceHash, evidence };
}

export function replayLoanCreation(registry: SourceRegistry, sourceHash: string, value: LoanCreationEvidence) {
  const evidence = loanCreationEvidenceSchema.parse(value);
  assertSourceRegistry(registry);
  const index = registry.revisions.findIndex(s => s.sourceHash === sourceHash);
  if (index < 0 || registry.revisions[index].evidenceHash !== digest(evidence)) fail("LOAN_CREATION_EVIDENCE_MISMATCH");
  const prefix = sealSourceRegistry({ ...registry, knowledgeAsOf: evidence.knownOn, revisions: registry.revisions.slice(0, index) });
  if (evidence.command.funding.kind === "DISBURSED_BALANCE" && !evidence.reconciliation) fail("LOAN_CREATION_EVIDENCE_MISMATCH");
  if (createLoanSource(prefix, evidence.command, evidence.cutoff, evidence.knownOn,
    evidence.reconciliation?.actuals, evidence.reconciliation?.consumed).sourceHash !== sourceHash) fail("LOAN_CREATION_EVIDENCE_MISMATCH");
}

export function loanCreationAllocations(command: LoanCreation) {
  return command.funding.kind === "DISBURSED_BALANCE" ? command.funding.allocations : [];
}
