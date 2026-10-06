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
  externalTopUp: moneySchema, unusedProceeds: moneySchema, confirm: z.literal(true), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict();
export type RefinanceCommand = z.infer<typeof refinanceSchema>;
export type RefinanceProof = { command: RefinanceCommand; closingSourceHash: string; newSourceHash: string; settlementAmount: string; proofHash: string };
const fail = (): never => { throw new AppError(422, "REFINANCE_FUNDING_MISMATCH", "Chứng từ giải ngân, tất toán hoặc phí tái cấp vốn không khớp."); };

/** Link a verified actual payoff and a new confirmed loan inside one changeset.
 * Whole-contract and user-share amounts stay in their declared scope; no FX,
 * inferred co-payer payments or retirement-fund adjustment occurs here. */
export function reconcileRefinance(value: RefinanceCommand,
  closing: { sourceHash: string; evidence: LoanSourceEvidence }, replacement: { sourceHash: string; evidence: LoanCreationEvidence }): RefinanceProof {
  const command = refinanceSchema.parse(value), old = loanSourceRevisionSchema.parse(closing.evidence.command), next = loanCreationSchema.parse(replacement.evidence.command);
  if (old.commandId !== command.closingCommandId || next.commandId !== command.newLoanCommandId || old.operation !== "END" ||
    old.sourceId === next.sourceId || old.contract.confirmation !== "BANK_CONFIRMED" || next.contract.confirmation !== "BANK_CONFIRMED" ||
    next.funding.kind !== "EXISTING_BALANCE" || old.contract.balanceScope !== command.fundingScope || next.contract.balanceScope !== command.fundingScope ||
    old.contract.balanceAsOf !== next.contract.balanceAsOf || closing.evidence.cutoff !== replacement.evidence.cutoff ||
    !new D(old.contract.principalBalance).isZero() || !new D(next.contract.principalBalance).eq(command.grossDisbursement) ||
    command.settledOn > next.contract.balanceAsOf || command.settledOn < next.contract.signedOn || command.settledOn < next.contract.effectiveOn ||
    command.evidence.some(e => e.confirmedOn > replacement.evidence.knownOn) || old.principalAdvances.length) fail();
  const settlement = old.allocations.filter(a => a.bookedOn === command.settledOn);
  if (!settlement.length || settlement.some(a => a.scope !== command.fundingScope)) fail();
  const paid = settlement.reduce((n, a) => n.plus(loanComponentsTotal(a.contractComponents)), new D(0));
  const net = new D(command.grossDisbursement).minus(command.withheldFees);
  if (net.lt(0) || paid.lte(0) || !net.plus(command.externalTopUp).eq(paid.plus(command.unusedProceeds))) fail();
  const proof = { command, closingSourceHash: closing.sourceHash, newSourceHash: replacement.sourceHash, settlementAmount: paid.toFixed() };
  return { ...proof, proofHash: digest(proof) };
}
