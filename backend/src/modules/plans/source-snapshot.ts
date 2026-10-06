import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import type { RetirementService } from "../retirement/service";
import type { SourceRetirementResult } from "../retirement/upgrade";
import { SOURCE_MODEL, SOURCE_SNAPSHOT_FORMAT } from "../retirement/engine-v4";
import { replayProjection } from "../retirement/replay";
import { readPensionSourceEvidence, pensionSourceSelectionSchema } from "../pensions/source-candidate";
import { addMonths } from "../../common/calendar";
import { flowSourceCommandSchema } from "./source-schema";
import { sourceRegistrySchema } from "../retirement/sources";
import { loanSourceEvidenceSchema, replayLoanSourceEvidence } from "../debts/source-candidate";
import type { LoanConsumedAllocation } from "../debts/reconciliation";
import { loanCreationEvidenceSchema, replayLoanCreation } from "../debts/source-create";

export type SourceSnapshot = { format: typeof SOURCE_SNAPSHOT_FORMAT;
  capture: Awaited<ReturnType<RetirementService["capture"]>>; preview: SourceRetirementResult; integrityHash: string };
export function serializeSourceSnapshot(capture: SourceSnapshot["capture"], preview: SourceRetirementResult): SourceSnapshot {
  const payload = { format: SOURCE_SNAPSHOT_FORMAT, capture, preview };
  const snapshot = { ...payload, integrityHash: digest(payload) };
  readSourceSnapshot(snapshot);
  return snapshot;
}
/** No DB lookups: persisted histories replay under their pinned source schedule. */
export function readSourceSnapshot(value: unknown): SourceSnapshot {
  const stored = value as SourceSnapshot;
  if (!stored || stored.format !== SOURCE_SNAPSHOT_FORMAT || stored.preview?.modelVersion !== SOURCE_MODEL ||
    stored.preview.status !== "READY" || !stored.preview.replayInput || !stored.preview.calculation || !stored.capture)
    throw new AppError(409, "SNAPSHOT_MODEL_UNSUPPORTED", "Bản nguồn không đúng định dạng đã hỗ trợ.");
  const { integrityHash, ...payload } = stored;
  if (digest(payload) !== integrityHash) throw new AppError(409, "SNAPSHOT_INTEGRITY_FAILED", "Bản nguồn khác hash đã lưu.");
  const revisions = sourceRegistrySchema.parse(stored.preview.replayInput.sourceRegistry).revisions;
  const evidenceError = () => { throw new AppError(409, "SOURCE_EVIDENCE_MISMATCH", "Căn cứ nguồn không khớp lịch đã lưu."); };
  const evidenced = new Set<string>();
  for (const commandValue of stored.preview.sourceCommands ?? []) {
    const command = flowSourceCommandSchema.parse(commandValue), revision = revisions.find(r => r.commandId === command.commandId);
    if (!revision || evidenced.has(command.commandId) || revision.sourceId !== command.sourceId || revision.evidenceHash !== digest(command)) evidenceError();
    evidenced.add(command.commandId);
    const schedule = [];
    if (command.operation !== "END") for (let month = command.effectiveFromMonth; month <= command.effectiveToMonth && schedule.length <= 1200; month = addMonths(month, 1))
      schedule.push({ month, metric: command.metric, amount: command.amount });
    if (revision!.operation !== command.operation || revision!.revision !== command.expectedSourceRevision + 1 ||
      revision!.effectiveFromMonth !== command.effectiveFromMonth || revision!.effectiveToMonth !== command.effectiveToMonth ||
      revision!.confirmation !== (command.operation === "END" ? "USER_CONFIRMED" : command.confirmation) || digest(schedule) !== digest(revision!.schedule)) evidenceError();
  }
  for (const source of stored.preview.pensionSources ?? []) {
    const { evidence, assessment } = readPensionSourceEvidence(source.evidence), selection = pensionSourceSelectionSchema.parse(source.selection);
    const revision = revisions.find(r => r.sourceHash === source.sourceHash);
    const schedule = [];
    for (let month = selection.effectiveFromMonth; month <= selection.effectiveToMonth && schedule.length <= 1200; month = addMonths(month, 1))
      schedule.push({ month, metric: "pension", amount: assessment.monthlyPension });
    if (!revision || evidenced.has(selection.commandId) || revision.operation !== selection.operation || revision.revision !== selection.expectedSourceRevision + 1 ||
      revision.effectiveFromMonth !== selection.effectiveFromMonth || revision.effectiveToMonth !== selection.effectiveToMonth ||
      assessment.assessmentStatus !== "ELIGIBLE" || revision.kind !== "PENSION" || revision.confirmation !== "HYPOTHETICAL" || revision.evidenceHash !== evidence.evidenceHash ||
      selection.estimateId !== evidence.estimateId || selection.expectedEstimateIntegrityHash !== evidence.estimateIntegrityHash ||
      selection.sourceId !== revision.sourceId || selection.commandId !== revision.commandId || digest(schedule) !== digest(revision.schedule)) evidenceError();
    evidenced.add(selection.commandId);
  }
  const consumed: LoanConsumedAllocation[] = [];
  const priorContracts = new Map<string, { sourceHash: string; contract: unknown }>();
  const agreements = new Set<string>();
  for (const source of stored.preview.newLoanSources ?? []) {
    const evidence = loanCreationEvidenceSchema.parse(source.evidence), command = evidence.command;
    const reference = command.agreementReference.toUpperCase();
    if (evidenced.has(command.commandId) || agreements.has(reference) || priorContracts.has(command.sourceId)) evidenceError();
    replayLoanCreation(stored.preview.replayInput.sourceRegistry, source.sourceHash, evidence);
    agreements.add(reference); evidenced.add(command.commandId);
    priorContracts.set(command.sourceId, { sourceHash: source.sourceHash, contract: command.contract });
  }
  let priorIndex = -1;
  for (const source of stored.preview.loanSources ?? []) {
    const evidence = loanSourceEvidenceSchema.parse(source.evidence), command = evidence.command;
    const index = revisions.findIndex(r => r.sourceHash === source.sourceHash);
    if (index <= priorIndex || evidenced.has(command.commandId) || digest(evidence.consumed) !== digest(consumed)) evidenceError();
    priorIndex = index;
    const prior = priorContracts.get(command.sourceId);
    if ("contract" in evidence.basis) {
      if (!prior || prior.sourceHash !== evidence.basis.sourceHash || digest(prior.contract) !== digest(evidence.basis.contract)) evidenceError();
    } else {
      const debt = stored.capture.profile.debts.status === "KNOWN" ? stored.capture.profile.debts.entries.find(d => `profile:debt:${d.id}` === command.sourceId) : undefined;
      const stress = stored.preview.selection.debtStress.filter(s => s.loanId === debt?.id);
      if (prior || !debt || digest(debt) !== digest(evidence.basis.legacy.debt) || digest(stress) !== digest(evidence.basis.legacy.stress)) evidenceError();
    }
    for (const actual of evidence.actuals) {
      const pinned = stored.preview.reforecast?.actualRevisions.find(a => a.period === actual.period);
      if (!pinned || pinned.revision !== actual.revision || pinned.closingBalance !== actual.data.closingBalance) evidenceError();
    }
    replayLoanSourceEvidence(stored.preview.replayInput.sourceRegistry, source.sourceHash, evidence);
    consumed.push(...command.allocations.map(allocation => ({ sourceId: command.sourceId, allocation })));
    priorContracts.set(command.sourceId, { sourceHash: source.sourceHash, contract: command.contract });
    evidenced.add(command.commandId);
  }
  // Imported profile/legacy commands have namespaced IDs. Every new public
  // UUID command must retain its evidence even after its source ends.
  if (revisions.some(r => /^[a-f0-9-]{36}$/i.test(r.commandId) && !evidenced.has(r.commandId))) evidenceError();
  const replay = replayProjection(stored.format, stored.preview.modelVersion, stored.preview.replayInput);
  if (!("attribution" in replay) || !("sourceRegistryHash" in replay) || digest(replay.rows) !== digest(stored.preview.calculation.rows) ||
    digest(replay.summary) !== digest(stored.preview.calculation.summary) ||
    digest(replay.attribution) !== digest(stored.preview.calculation.attribution) ||
    replay.sourceRegistryHash !== stored.preview.calculation.sourceRegistryHash)
    throw new AppError(409, "SNAPSHOT_REPLAY_MISMATCH", "Bản nguồn không tái lập được kết quả đã lưu.");
  return stored;
}
