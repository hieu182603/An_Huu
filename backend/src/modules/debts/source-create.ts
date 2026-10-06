import { z } from "zod";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { digest } from "../../common/digest";
import { loanContractV2Schema, loanEvidenceSchema } from "./revision-schema";
import { DebtDecimal as D } from "./loan";
import { loanSourceSchedule } from "./source-candidate";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, type SourceRegistry } from "../retirement/sources";

export const loanCreationSchema = z.object({ commandId: z.string().uuid(), sourceId: z.string().regex(/^plan:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i),
  operation: z.literal("CREATE"), expectedSourceRevision: z.literal(0), confirm: z.literal(true),
  agreementReference: z.string().trim().min(1).max(200), contract: loanContractV2Schema,
  funding: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("EXISTING_BALANCE"), notAlreadyInSources: z.literal(true), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict(),
    z.object({ kind: z.literal("PLANNED_DISBURSEMENT"), grossPrincipal: moneySchema, withheldFees: moneySchema, netDisbursement: moneySchema,
      destination: z.literal("EXTERNAL_ACCOUNT"), evidence: z.array(loanEvidenceSchema).min(1).max(20) }).strict(),
  ]) }).strict();
export type LoanCreation = z.infer<typeof loanCreationSchema>;
export const loanCreationEvidenceSchema = z.object({ command: loanCreationSchema, cutoff: monthSchema, knownOn: dateSchema }).strict();
export type LoanCreationEvidence = z.infer<typeof loanCreationEvidenceSchema>;
const fail = (code: string): never => { throw new AppError(422, code, "Cần rà soát nguồn khoản vay và chứng từ giải ngân."); };

/** New debt records only obligations. Loan proceeds never become income or a
 * retirement contribution; past fund movements are already in the actual anchor. */
export function createLoanSource(registry: SourceRegistry, commandValue: LoanCreation, cutoff: string, knownOn: string) {
  const command = loanCreationSchema.parse(commandValue), c = command.contract;
  assertSourceRegistry(registry); monthSchema.parse(cutoff); dateSchema.parse(knownOn);
  if (registry.revisions.some(s => s.sourceId === command.sourceId)) fail("LOAN_SOURCE_ALREADY_EXISTS");
  if (knownOn < registry.knowledgeAsOf || c.knownOn > knownOn || command.funding.evidence.some(e => e.confirmedOn > knownOn) || new D(c.principalBalance).lte(0))
    fail("LOAN_CREATION_EVIDENCE_INVALID");
  const next = addMonths(cutoff, 1), lastDay = new Date(Date.parse(next + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  let from = next;
  if (command.funding.kind === "EXISTING_BALANCE") {
    if (c.balanceAsOf !== lastDay || c.balanceNature === "PROJECTED_DISBURSEMENT" || c.confirmation !== "BANK_CONFIRMED") fail("LOAN_OPENING_BALANCE_REQUIRED");
  } else {
    const f = command.funding;
    from = c.balanceAsOf.slice(0, 7);
    if (from <= cutoff || c.balanceNature !== "PROJECTED_DISBURSEMENT" || c.confirmation !== "HYPOTHETICAL" ||
      !new D(f.grossPrincipal).eq(c.principalBalance) || !new D(f.grossPrincipal).minus(f.withheldFees).eq(f.netDisbursement) ||
      (c.responsibility.kind === "CAPPED" && !new D(c.responsibility.previouslyPaid).isZero())) fail("LOAN_DISBURSEMENT_MISMATCH");
  }
  if (from < registry.startMonth || from > registry.endMonth) fail("LOAN_CREATION_OUTSIDE_HORIZON");
  const active = composeSourceMonths(registry, from, registry.endMonth).attribution;
  if (active.some(a => a.metric === "debtPayment" && registry.revisions.some(s => s.sourceHash === a.sourceHash && s.kind === "AGGREGATE"))) fail("SOURCE_AGGREGATE_OVERLAP");
  const evidence = loanCreationEvidenceSchema.parse(JSON.parse(JSON.stringify({ command, cutoff, knownOn })));
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
  if (createLoanSource(prefix, evidence.command, evidence.cutoff, evidence.knownOn).sourceHash !== sourceHash) fail("LOAN_CREATION_EVIDENCE_MISMATCH");
}
