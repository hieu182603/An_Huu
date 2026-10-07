import { z } from "zod";
import { AppError } from "../../common/errors";
import { dateSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { moneySchema } from "../../common/http";
import { loanEvidenceSchema } from "./revision-schema";
import { loanComponentsTotal } from "./reconciliation";
import { loanSourceRevisionSchema, type LoanSourceEvidence } from "./source-candidate";
import { loanCreationSchema, type LoanCreationEvidence } from "./source-create";
import { DebtDecimal as D } from "./loan";

export const refinanceSchema = z.object({ commandId: z.string().uuid(), closingCommandId: z.string().uuid(), newLoanCommandId: z.string().uuid(),
  settledOn: dateSchema, fundingScope: z.enum(["FULL_CONTRACT", "USER_SHARE"]), grossDisbursement: moneySchema, withheldFees: moneySchema,
  externalTopUp: moneySchema, unusedProceeds: moneySchema, confirm: z.literal(true), evidence: z.array(loanEvidenceSchema).min(1).max(20),
  proceedsAtSettlement: z.object({ availableAmount: moneySchema, confirm: z.literal(true),
    usesBeforeSettlement: z.array(z.object({ useId: z.string().uuid(), bookedOn: dateSchema, amount: moneySchema,
      description: z.string().trim().min(1).max(1000), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict()).max(500),
    evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict().optional() }).strict();
export type RefinanceCommand = z.infer<typeof refinanceSchema>;
export type RefinanceProof = { command: RefinanceCommand; closingSourceHash: string; newSourceHash: string; settlementAmount: string; proofHash: string };
const fail = (): never => { throw new AppError(422, "REFINANCE_FUNDING_MISMATCH", "Chứng từ giải ngân, tất toán hoặc phí tái cấp vốn không khớp."); };

/** Link a verified actual payoff and a new confirmed loan inside one changeset.
 * Whole-contract and user-share amounts stay in their declared scope; no FX,
 * inferred co-payer payments or retirement-fund adjustment occurs here. */
export function reconcileRefinance(value: RefinanceCommand,
  closing: { sourceHash: string; evidence: LoanSourceEvidence }, replacement: { sourceHash: string; evidence: LoanCreationEvidence }): RefinanceProof {
  const command = refinanceSchema.parse(value), old = loanSourceRevisionSchema.parse(closing.evidence.command), next = loanCreationSchema.parse(replacement.evidence.command);
  const disbursed = next.funding.kind === "DISBURSED_BALANCE" ? next.funding : null;
  // A replacement amended after settlement is checked against the terms in force at settlement.
  const original = disbursed?.originalTerms && command.settledOn < next.contract.effectiveOn ? disbursed.originalTerms : null;
  const atSettlement = { balanceScope: original?.balanceScope ?? next.contract.balanceScope, effectiveOn: original?.effectiveOn ?? next.contract.effectiveOn };
  if (old.commandId !== command.closingCommandId || next.commandId !== command.newLoanCommandId || old.operation !== "END" ||
    old.refinanceCommandId !== command.commandId || next.refinanceCommandId !== command.commandId ||
    old.sourceId === next.sourceId || old.contract.confirmation !== "BANK_CONFIRMED" || next.contract.confirmation !== "BANK_CONFIRMED" ||
    !["EXISTING_BALANCE", "DISBURSED_BALANCE"].includes(next.funding.kind) || old.contract.balanceScope !== command.fundingScope || atSettlement.balanceScope !== command.fundingScope ||
    old.contract.balanceAsOf !== next.contract.balanceAsOf || closing.evidence.cutoff !== replacement.evidence.cutoff ||
    !new D(old.contract.principalBalance).isZero() || !new D(disbursed?.grossPrincipal ?? next.contract.principalBalance).eq(command.grossDisbursement) ||
    (disbursed && (disbursed.disbursedOn > command.settledOn ||
      (disbursed.disbursedOn < command.settledOn && !command.proceedsAtSettlement) || !replacement.evidence.reconciliation)) ||
    command.settledOn > next.contract.balanceAsOf || command.settledOn < next.contract.signedOn || command.settledOn < atSettlement.effectiveOn ||
    command.evidence.some(e => e.confirmedOn > replacement.evidence.knownOn) || old.allocations.some(a => a.bookedOn > command.settledOn)) fail();
  const settlement = old.allocations.filter(a => a.bookedOn === command.settledOn);
  if (!settlement.length || settlement.some(a => a.scope !== command.fundingScope)) fail();
  const paid = settlement.reduce((n, a) => n.plus(loanComponentsTotal(a.contractComponents)), new D(0));
  const net = new D(command.grossDisbursement).minus(command.withheldFees);
  let available = net;
  if (command.proceedsAtSettlement) {
    // A dated opening plus a separately confirmed proceeds balance is required.
    // Debt payments may use other funds; do not infer cash use from principal.
    if (!disbursed) fail();
    const p = command.proceedsAtSettlement, ids = new Set<string>();
    if (p.evidence.some(e => e.confirmedOn < command.settledOn || e.confirmedOn > replacement.evidence.knownOn)) fail();
    let used = new D(0);
    for (const use of p.usesBeforeSettlement) {
      if (ids.has(use.useId) || use.bookedOn < disbursed!.disbursedOn || use.bookedOn >= command.settledOn ||
        new D(use.amount).lte(0) || use.evidence.some(e => e.confirmedOn < use.bookedOn || e.confirmedOn > replacement.evidence.knownOn)) fail();
      ids.add(use.useId); used = used.plus(use.amount);
    }
    available = new D(p.availableAmount);
    if (!net.minus(used).eq(available)) fail();
  }
  if (net.lt(0) || paid.lte(0) || !available.plus(command.externalTopUp).eq(paid.plus(command.unusedProceeds))) fail();
  const proof = { command, closingSourceHash: closing.sourceHash, newSourceHash: replacement.sourceHash, settlementAmount: paid.toFixed() };
  return { ...proof, proofHash: digest(proof) };
}
