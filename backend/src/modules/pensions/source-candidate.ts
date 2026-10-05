import { z } from "zod";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { assertSourceRegistry, composeSourceMonths, sealSourceRegistry, sealSourceRevision, type SourceRegistry } from "../retirement/sources";
import { estimateCaptureSchema, replayPensionCapture } from "./estimate-service";
import { insuranceHash } from "./insurance-schema";

export const pensionSourceEvidenceSchema = z.object({ estimateId: z.string().uuid(), ownerId: z.string().min(1),
  estimateIntegrityHash: insuranceHash, capture: estimateCaptureSchema, evidenceHash: insuranceHash }).strict();
export const pensionSourceSelectionSchema = z.object({ estimateId: z.string().uuid(), expectedEstimateIntegrityHash: insuranceHash,
  expectedRegistryHash: insuranceHash, commandId: z.string().uuid(), sourceId: z.string().min(1).max(200),
  operation: z.enum(["CREATE", "REVISE"]), expectedSourceRevision: z.number().int().min(0),
  effectiveFromMonth: monthSchema, effectiveToMonth: monthSchema,
  amountPolicy: z.literal("FIXED_NOMINAL"), confirm: z.literal(true),
}).strict();
export type PensionSourceEvidence = z.infer<typeof pensionSourceEvidenceSchema>;
export type PensionSourceSelection = z.infer<typeof pensionSourceSelectionSchema>;
const fail = (code: string, status = 422): never => { throw new AppError(status, code, "Cần rà soát nguồn lương hưu và kết quả BHXH đã chọn."); };

export function readPensionSourceEvidence(value: unknown) {
  const evidence = pensionSourceEvidenceSchema.parse(value), { evidenceHash, ...payload } = evidence;
  if (digest(payload) !== evidenceHash) fail("PENSION_SOURCE_EVIDENCE_MISMATCH", 409);
  const result = replayPensionCapture(evidence.capture), assessment = result.assessment;
  const estimatePayload = { userId: evidence.ownerId, historyVersionId: result.historyVersionId, legalRuleSetVersionId: result.legalRuleSetVersionId,
    engineCode: result.engineCode, inputHash: result.inputHash, inputSnapshot: evidence.capture, result };
  if (digest(estimatePayload) !== evidence.estimateIntegrityHash) fail("PENSION_SOURCE_EVIDENCE_MISMATCH", 409);
  return { evidence, assessment };
}

/** Pure internal candidate builder. The caller obtains evidence from
 * captureForSource under ownership/CAS checks, never from a client body. The
 * returned evidence MUST be persisted beside the new registry for offline replay.
 * This does not apply a plan, alter actuals, or promote data to the profile. */
export function pensionSourceCandidate(registryValue: SourceRegistry, selectionValue: PensionSourceSelection,
  evidenceValue: PensionSourceEvidence, ownerId: string, anchorThroughMonth: string, knownOn: string) {
  const selection = pensionSourceSelectionSchema.parse(selectionValue), { evidence, assessment } = readPensionSourceEvidence(evidenceValue);
  assertSourceRegistry(registryValue); monthSchema.parse(anchorThroughMonth); dateSchema.parse(knownOn);
  const { evidenceHash } = evidence;
  if (evidence.ownerId !== ownerId || evidence.estimateId !== selection.estimateId ||
    evidence.estimateIntegrityHash !== selection.expectedEstimateIntegrityHash) fail("PENSION_SOURCE_EVIDENCE_MISMATCH", 409);
  if (selection.expectedRegistryHash !== registryValue.registryHash) fail("SOURCE_REGISTRY_CHANGED", 409);
  if (knownOn < registryValue.knowledgeAsOf || knownOn < evidence.capture.assessedOn) fail("SOURCE_KNOWLEDGE_DATE_INVALID");
  if (assessment.assessmentStatus !== "ELIGIBLE" || !assessment.startMonth || assessment.monthlyPension === null || new D(assessment.monthlyPension).lte(0))
    fail("PENSION_ESTIMATE_NOT_ELIGIBLE");
  if (selection.effectiveFromMonth <= anchorThroughMonth || selection.effectiveFromMonth < registryValue.startMonth ||
    selection.effectiveFromMonth < assessment.startMonth! || selection.effectiveToMonth > registryValue.endMonth ||
    selection.effectiveFromMonth > selection.effectiveToMonth) fail("PENSION_SOURCE_PERIOD_INVALID");
  const latest = new Map(registryValue.revisions.map(r => [r.sourceId, r])), previous = latest.get(selection.sourceId);
  if (selection.operation === "CREATE" ? !!previous || selection.expectedSourceRevision !== 0
    : !previous || previous.operation === "END" || previous.kind !== "PENSION" || previous.revision !== selection.expectedSourceRevision)
    fail("SOURCE_REVISION_CONFLICT", 409);
  // A single selected statutory pension replaces the existing pension identity.
  // Do not add it alongside a profile pension or a legacy aggregate override.
  const activeCells = composeSourceMonths(registryValue, selection.effectiveFromMonth, selection.effectiveToMonth).attribution;
  if (activeCells.some(c => c.metric === "pension" && c.sourceId !== selection.sourceId))
    fail("PENSION_SOURCE_OVERLAP");
  const schedule = [];
  for (let month = selection.effectiveFromMonth; month <= selection.effectiveToMonth; month = addMonths(month, 1))
    schedule.push({ month, metric: "pension" as const, amount: assessment.monthlyPension! });
  const revision = sealSourceRevision({ sourceId: selection.sourceId, revision: (previous?.revision ?? 0) + 1,
    previousHash: previous?.sourceHash ?? null, scope: "PLAN_VERSION", origin: previous?.origin ?? "PLAN_CREATED", kind: "PENSION",
    effectiveFromMonth: selection.effectiveFromMonth, effectiveToMonth: selection.effectiveToMonth,
    knownOn, evidenceHash, commandId: selection.commandId, confirmation: "HYPOTHETICAL", operation: selection.operation, schedule });
  const registry = sealSourceRegistry({ ...registryValue, knowledgeAsOf: knownOn, revisions: [...registryValue.revisions, revision] });
  return { registry, evidence, selection, sourceHash: revision.sourceHash,
    excludedLumpSum: assessment.lumpSum, amountPolicy: selection.amountPolicy };
}
