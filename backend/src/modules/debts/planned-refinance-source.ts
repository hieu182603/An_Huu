import { z } from "zod";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { plannedRefinanceSchema, projectPlannedRefinance } from "./planned-refinance";
import { loanContractV2Schema } from "./revision-schema";
import { loanSourceSchedule } from "./source-candidate";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, sourceRevisionSchema,
  type SourceCell, type SourceRegistry } from "../retirement/sources";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const target = z.object({ sourceId: z.string().min(1).max(200), revision: z.number().int().nonnegative(), sourceHash: hash.nullable() }).strict();
const common = { commandId: z.string().uuid(), replacementCommandId: z.string().uuid(), pairId: z.string().uuid(),
  oldSource: target, newSource: target, expectedContractHash: hash, confirm: z.literal(true) };
const terms = plannedRefinanceSchema.omit({ engineCode: true, previous: true, cutoff: true, knownOn: true, horizon: true, confirm: true });
export const plannedPairCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...common, operation: z.literal("CREATE"), expectedPairHash: z.null(), terms }).strict(),
  z.object({ ...common, operation: z.literal("REVISE"), expectedPairHash: hash, terms }).strict(),
  z.object({ ...common, operation: z.literal("CANCEL"), expectedPairHash: hash, reason: z.string().trim().min(1).max(1000) }).strict(),
]);
export const plannedPairBasisSchema = z.object({ source: sourceRevisionSchema, contract: loanContractV2Schema }).strict();
export const plannedPairEvidenceSchema = z.object({ command: plannedPairCommandSchema, basis: plannedPairBasisSchema,
  cutoff: monthSchema, knownOn: dateSchema }).strict();
export const plannedPairProofSchema = z.object({ evidence: plannedPairEvidenceSchema, oldSourceHash: hash, newSourceHash: hash, pairHash: hash }).strict();
export type PlannedPairCommand = z.infer<typeof plannedPairCommandSchema>;
export type PlannedPairBasis = z.infer<typeof plannedPairBasisSchema>;
export type PlannedPairProof = z.infer<typeof plannedPairProofSchema>;
function fail(code: string): never { throw new AppError(409, code, "Cặp khoản vay dự kiến đã đổi hoặc cần đối soát trước khi tiếp tục."); }
function verifyProofHash(proof: PlannedPairProof) {
  const { pairHash, ...payload } = proof;
  if (digest(payload) !== pairHash) fail("PLANNED_PAIR_EVIDENCE_MISMATCH");
}

/** Pure, paired revision builder. The service must supply the entire owned
 * history. No HTTP caller may supply basis/history as trusted server evidence. */
export function plannedPairCandidate(registry: SourceRegistry, value: PlannedPairCommand, basisValue: PlannedPairBasis,
  historyValues: PlannedPairProof[], cutoff: string, knownOn: string) {
  assertSourceRegistry(registry); monthSchema.parse(cutoff); dateSchema.parse(knownOn);
  const command = plannedPairCommandSchema.parse(value), basis = plannedPairBasisSchema.parse(basisValue);
  const history = historyValues.map(p => plannedPairProofSchema.parse(p)); history.forEach(verifyProofHash);
  const latest = new Map(history.map(p => [p.evidence.command.pairId, p]));
  const prior = latest.get(command.pairId);
  const from = addMonths(cutoff, 1);
  if (knownOn < registry.knowledgeAsOf || from < registry.startMonth || from > registry.endMonth ||
    command.commandId === command.replacementCommandId || command.oldSource.sourceId === command.newSource.sourceId)
    fail("PLANNED_PAIR_IDENTITY_INVALID");
  const original = registry.revisions.find(r => r.sourceHash === basis.source.sourceHash);
  if (!original || digest(original) !== digest(basis.source) || original.kind !== "DEBT" || original.operation === "END" ||
    original.sourceId !== command.oldSource.sourceId || digest(basis.contract) !== command.expectedContractHash ||
    digest(original.schedule) !== digest(loanSourceSchedule(basis.contract, original.effectiveFromMonth, original.effectiveToMonth)))
    fail("PLANNED_PAIR_BASIS_MISMATCH");
  const old = registry.revisions.filter(r => r.sourceId === command.oldSource.sourceId).at(-1);
  const next = registry.revisions.filter(r => r.sourceId === command.newSource.sourceId).at(-1);
  const matches = (source: typeof old, expected: z.infer<typeof target>) => source
    ? source.revision === expected.revision && source.sourceHash === expected.sourceHash && source.operation !== "END"
    : expected.revision === 0 && expected.sourceHash === null;
  if (!old || !matches(old, command.oldSource) || !matches(next, command.newSource)) fail("PLANNED_PAIR_REVISION_CONFLICT");
  for (const p of latest.values()) if (p.evidence.command.operation !== "CANCEL" && p.evidence.command.pairId !== command.pairId &&
    [p.evidence.command.oldSource.sourceId, p.evidence.command.newSource.sourceId].some(id => id === command.oldSource.sourceId || id === command.newSource.sourceId))
    fail("PLANNED_PAIR_SOURCE_IN_USE");
  if (command.operation === "CREATE") {
    if (prior || next || old.sourceHash !== original.sourceHash || command.oldSource.revision < 1)
      fail("PLANNED_PAIR_REVISION_CONFLICT");
  } else {
    if (!prior || prior.evidence.command.operation === "CANCEL" || command.expectedPairHash !== prior.pairHash ||
      prior.oldSourceHash !== old.sourceHash || prior.newSourceHash !== next?.sourceHash || digest(prior.evidence.basis) !== digest(basis) ||
      prior.evidence.command.oldSource.sourceId !== command.oldSource.sourceId || prior.evidence.command.newSource.sourceId !== command.newSource.sourceId)
      fail("PLANNED_PAIR_REVISION_CONFLICT");
    // REVISE cannot reinterpret projected instalments as paid after the cutoff
    // advances. CANCEL is the reconciliation exit: it restores the pinned contract.
    if (command.operation === "REVISE" && (prior.evidence.cutoff !== cutoff || prior.evidence.command.terms.settledOn <= knownOn))
      fail("PLANNED_PAIR_RECONCILIATION_REQUIRED");
  }
  const aggregate = composeSourceMonths(registry, from, registry.endMonth).attribution.some(a => a.metric === "debtPayment" &&
    registry.revisions.some(r => r.sourceHash === a.sourceHash && r.kind === "AGGREGATE"));
  if (aggregate) fail("SOURCE_AGGREGATE_OVERLAP");
  let oldSchedule: SourceCell[], newSchedule: SourceCell[];
  if (command.operation === "CANCEL") {
    oldSchedule = loanSourceSchedule(basis.contract, from, registry.endMonth); newSchedule = [];
  } else {
    const replacement = command.terms.replacement;
    if (replacement.sourceId !== command.newSource.sourceId || replacement.commandId !== command.replacementCommandId)
      fail("PLANNED_PAIR_IDENTITY_INVALID");
    if (prior && prior.evidence.command.operation !== "CANCEL" &&
      replacement.agreementReference.toUpperCase() !== prior.evidence.command.terms.replacement.agreementReference.toUpperCase())
      fail("PLANNED_PAIR_IDENTITY_INVALID");
    const result = projectPlannedRefinance({ ...command.terms, engineCode: "planned-refinance-v1", previous: basis.contract,
      cutoff, knownOn, horizon: registry.endMonth, confirm: true });
    oldSchedule = result.oldSchedule; newSchedule = result.replacementSchedule;
  }
  const evidence = plannedPairEvidenceSchema.parse(JSON.parse(JSON.stringify({ command, basis, cutoff, knownOn })));
  const oldRevision = sealSourceRevision({ ...old, revision: old.revision + 1, previousHash: old.sourceHash,
    commandId: command.commandId, operation: "REVISE", knownOn, evidenceHash: digest(evidence), effectiveFromMonth: from,
    effectiveToMonth: registry.endMonth, confirmation: command.operation === "CANCEL" ? basis.source.confirmation : "HYPOTHETICAL", schedule: oldSchedule });
  const newRevision = sealSourceRevision({ sourceId: command.newSource.sourceId, revision: (next?.revision ?? 0) + 1,
    previousHash: next?.sourceHash ?? null, scope: "PLAN_VERSION", origin: "PLAN_CREATED", kind: "DEBT",
    commandId: command.replacementCommandId, knownOn, evidenceHash: digest(evidence), effectiveFromMonth: from,
    effectiveToMonth: registry.endMonth, confirmation: "HYPOTHETICAL", operation: command.operation === "CREATE" ? "CREATE" : command.operation === "CANCEL" ? "END" : "REVISE",
    schedule: newSchedule });
  const payload = { evidence, oldSourceHash: oldRevision.sourceHash, newSourceHash: newRevision.sourceHash };
  return { registry: sealSourceRegistry({ ...registry, knowledgeAsOf: knownOn, revisions: [...registry.revisions, oldRevision, newRevision] }),
    proof: { ...payload, pairHash: digest(payload) } };
}

/** Check both members and the ordered history; accepting a valid hash on just
 * one source must never make a half-cancelled refinance look complete. */
export function replayPlannedPairs(registry: SourceRegistry, values: PlannedPairProof[]) {
  assertSourceRegistry(registry);
  const history: PlannedPairProof[] = []; let last = -1;
  for (const value of values) {
    const proof = plannedPairProofSchema.parse(value); verifyProofHash(proof);
    const index = registry.revisions.findIndex(r => r.sourceHash === proof.oldSourceHash);
    if (index <= last || index < 1 || registry.revisions[index + 1]?.sourceHash !== proof.newSourceHash)
      fail("PLANNED_PAIR_EVIDENCE_MISMATCH");
    const prefix = sealSourceRegistry({ ...registry, knowledgeAsOf: proof.evidence.knownOn, revisions: registry.revisions.slice(0, index) });
    const replay = plannedPairCandidate(prefix, proof.evidence.command, proof.evidence.basis, history, proof.evidence.cutoff, proof.evidence.knownOn);
    if (digest(replay.proof) !== digest(proof)) fail("PLANNED_PAIR_EVIDENCE_MISMATCH");
    history.push(proof); last = index + 1;
  }
  return { matched: true as const, pairsReplayed: history.length };
}
