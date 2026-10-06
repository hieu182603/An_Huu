import { z } from "zod";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { digest } from "../../common/digest";
import { DebtDecimal as D } from "./loan";
import { loanAllocationSchema, loanContractV2Schema, type LoanContractV2 } from "./revision-schema";
import { loanActualEvidenceSchema, loanBalanceChangeSchema, reconcileLoanRevision, type LoanActualEvidence, type LoanConsumedAllocation } from "./reconciliation";
import { loanLegacyBasisSchema, loanLegacyOpeningSchema, readLegacyLoanBasis } from "./legacy-basis";
import { projectLoanRevision } from "./revision-engine";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, type SourceCell, type SourceRegistry } from "../retirement/sources";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const loanSourceRevisionSchema = z.object({ commandId: z.string().uuid(), sourceId: z.string().min(1).max(200), operation: z.enum(["REVISE", "END"]),
  expectedSourceRevision: z.number().int().positive(), expectedSourceHash: hash, expectedContractHash: hash,
  refinanceCommandId: z.string().uuid().optional(),
  confirm: z.literal(true), contract: loanContractV2Schema, legacyOpening: loanLegacyOpeningSchema.optional(),
  allocations: z.array(loanAllocationSchema).max(500), principalAdvances: z.array(loanBalanceChangeSchema).max(100) }).strict();
export type LoanSourceRevisionCommand = z.infer<typeof loanSourceRevisionSchema>;
export const loanSourceBasisSchema = z.union([
  z.object({ sourceHash: hash, contract: loanContractV2Schema }).strict(),
  z.object({ sourceHash: hash, legacy: loanLegacyBasisSchema }).strict(),
]);
export type LoanSourceBasis = z.infer<typeof loanSourceBasisSchema>;
export const loanSourceEvidenceSchema = z.object({ command: loanSourceRevisionSchema, basis: loanSourceBasisSchema,
  actuals: z.array(loanActualEvidenceSchema).max(1200), consumed: z.array(z.object({ sourceId: z.string(), allocation: loanAllocationSchema }).strict()).max(10000),
  cutoff: monthSchema, knownOn: dateSchema }).strict();
export type LoanSourceEvidence = z.infer<typeof loanSourceEvidenceSchema>;
const fail = (code: string): never => { throw new AppError(409, code, "Lịch vay hoặc chứng từ nguồn đã thay đổi. Hãy kiểm tra lại phương án."); };

/** Aggregate exact dated payments, never redistribute them over a monthly mean. */
export function loanSourceSchedule(contract: LoanContractV2, from: string, through: string): SourceCell[] {
  monthSchema.parse(from); monthSchema.parse(through);
  const projection = projectLoanRevision(contract);
  if (projection.status !== "READY") fail("LOAN_SCHEDULE_REVIEW_REQUIRED");
  const months = new Map<string, InstanceType<typeof D>>();
  for (const row of projection.rows) {
    const month = row.dueDate.slice(0, 7);
    if (month >= from && month <= through) months.set(month, (months.get(month) ?? new D(0)).plus(row.userPayment));
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, metric: "debtPayment", amount: amount.toFixed() }));
}

/** Pure builder used by the public plan service. The service obtains basis
 * from the owned parent snapshot and actuals/consumed from its full lineage.
 * Legacy opening declarations are verified against the pinned v1 source. */
export function loanSourceCandidate(registry: SourceRegistry, commandValue: LoanSourceRevisionCommand, basisValue: LoanSourceBasis,
  actuals: LoanActualEvidence[], consumed: LoanConsumedAllocation[], cutoff: string, knownOn: string) {
  const command = loanSourceRevisionSchema.parse(commandValue);
  // Match the JSON wire/storage representation before hashing optional fields.
  if (command.legacyOpening === undefined) delete command.legacyOpening;
  const basis = loanSourceBasisSchema.parse(basisValue);
  assertSourceRegistry(registry); monthSchema.parse(cutoff); dateSchema.parse(knownOn);
  const previous = registry.revisions.filter(r => r.sourceId === command.sourceId).at(-1);
  if (!previous || previous.kind !== "DEBT" || previous.operation === "END" || previous.revision !== command.expectedSourceRevision ||
    previous.sourceHash !== command.expectedSourceHash || previous.sourceHash !== basis.sourceHash ||
    digest("contract" in basis ? basis.contract : basis.legacy.debt) !== command.expectedContractHash)
    fail("LOAN_SOURCE_REVISION_CONFLICT");
  if ("contract" in basis && (command.legacyOpening || digest(previous!.schedule) !== digest(loanSourceSchedule(basis.contract, previous!.effectiveFromMonth, previous!.effectiveToMonth))))
    fail("LOAN_SOURCE_BASIS_MISMATCH");
  if ("legacy" in basis && (!command.legacyOpening || digest(command.legacyOpening) !== digest(basis.legacy.opening))) fail("LOAN_SOURCE_BASIS_MISMATCH");
  const previousBalance = "contract" in basis ? basis.contract : readLegacyLoanBasis(basis.legacy, previous!, knownOn, registry.originHash);
  const from = addMonths(cutoff, 1), through = registry.endMonth;
  const cutoffDate = new Date(Date.parse(from + "-01T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  if (knownOn < registry.knowledgeAsOf || command.contract.knownOn > knownOn || command.contract.balanceAsOf !== cutoffDate ||
    command.contract.balanceNature === "PROJECTED_DISBURSEMENT" ||
    from < registry.startMonth || from > through || from < previous!.effectiveFromMonth ||
    actuals.some(a => a.period > cutoff)) fail("LOAN_SOURCE_CUTOFF_INVALID");
  const active = composeSourceMonths(registry, from, through).attribution;
  if (active.some(c => c.metric === "debtPayment" && registry.revisions.some(r => r.sourceHash === c.sourceHash && r.kind === "AGGREGATE")))
    fail("SOURCE_AGGREGATE_OVERLAP");
  const reconciliation = reconcileLoanRevision({ previous: previousBalance, next: command.contract,
    allocations: command.allocations, principalAdvances: command.principalAdvances }, actuals, consumed);
  const schedule = loanSourceSchedule(command.contract, from, through);
  if (command.operation === "END" && (command.contract.confirmation !== "BANK_CONFIRMED" || !new D(command.contract.principalBalance).isZero() ||
    !new D(projectLoanRevision(command.contract).totals?.contractPayment ?? "1").isZero())) fail("LOAN_NOT_FULLY_SETTLED");
  const evidence = loanSourceEvidenceSchema.parse(JSON.parse(JSON.stringify({ command, basis, actuals, consumed, cutoff, knownOn })));
  const revision = sealSourceRevision({ sourceId: command.sourceId, revision: previous!.revision + 1, previousHash: previous!.sourceHash,
    scope: "PLAN_VERSION", origin: previous!.origin, kind: "DEBT", effectiveFromMonth: from, effectiveToMonth: through, knownOn,
    evidenceHash: digest(evidence), commandId: command.commandId, confirmation: command.contract.confirmation, operation: command.operation,
    schedule: command.operation === "END" ? [] : schedule });
  return { registry: sealSourceRegistry({ ...registry, knowledgeAsOf: knownOn, revisions: [...registry.revisions, revision] }),
    sourceHash: revision.sourceHash, evidence, reconciliation };
}

/** Recompute a saved revision against the exact preceding registry prefix.
 * Later registry revisions may exist but cannot rewrite this historical proof. */
export function replayLoanSourceEvidence(registry: SourceRegistry, sourceHash: string, evidenceValue: LoanSourceEvidence) {
  const evidence = loanSourceEvidenceSchema.parse(evidenceValue);
  assertSourceRegistry(registry);
  const index = registry.revisions.findIndex(r => r.sourceHash === sourceHash);
  if (index < 1 || registry.revisions[index].evidenceHash !== digest(evidence)) fail("LOAN_SOURCE_EVIDENCE_MISMATCH");
  const parent = sealSourceRegistry({ ...registry, knowledgeAsOf: evidence.knownOn, revisions: registry.revisions.slice(0, index) });
  const result = loanSourceCandidate(parent, evidence.command, evidence.basis, evidence.actuals, evidence.consumed, evidence.cutoff, evidence.knownOn);
  if (result.sourceHash !== sourceHash) fail("LOAN_SOURCE_EVIDENCE_MISMATCH");
  return result.reconciliation;
}
