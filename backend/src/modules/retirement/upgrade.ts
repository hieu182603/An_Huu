import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { prepareRetirement } from "./prepare";
import type { RetirementResult, RetirementService } from "./service";
import { profileSourceRegistry } from "./source-profile";
import { importLegacySourceChanges } from "./source-legacy";
import { projectSources, SOURCE_MODEL, type SourceProjectionInput } from "./engine-v4";
import type { PensionSourceEvidence, PensionSourceSelection } from "../pensions/source-candidate";
import type { FlowSourceCommand } from "../plans/source-schema";
import type { LoanSourceEvidence } from "../debts/source-candidate";
import type { LoanCreationEvidence } from "../debts/source-create";
import type { RefinanceProof } from "../debts/refinance";

export type SourceRetirementResult = Omit<RetirementResult, "modelVersion" | "replayInput" | "calculation" | "status"> & {
  status: "READY";
  modelVersion: typeof SOURCE_MODEL;
  replayInput: SourceProjectionInput;
  calculation: NonNullable<RetirementResult["calculation"]> & ReturnType<typeof projectSources>;
  sourceCommands?: FlowSourceCommand[];
  pensionSources?: Array<{ sourceHash: string; selection: PensionSourceSelection; evidence: PensionSourceEvidence }>;
  loanSources?: Array<{ sourceHash: string; evidence: LoanSourceEvidence }>;
  newLoanSources?: Array<{ sourceHash: string; evidence: LoanCreationEvidence }>;
  refinances?: RefinanceProof[];
};
export type PlanPreview = RetirementResult | SourceRetirementResult;

/** Internal migration only. Authorization/actual CAS belong to the caller. The
 * returned candidate is new; neither its parent snapshot nor the profile changes. */
export function upgradeSourcePreview(capture: Awaited<ReturnType<RetirementService["capture"]>>, preview: PlanPreview,
  parentSnapshotHash: string, knownOn: string): SourceRetirementResult {
  if (preview.modelVersion !== "retirement-monthly-v3" || preview.status !== "READY" || !preview.replayInput || !preview.calculation || preview.replayInput.modelVersion !== "retirement-monthly-v3")
    throw new AppError(422, "SOURCE_UPGRADE_REQUIRES_V3", "Cần bản dự báo v3 hoàn chỉnh trước khi tạo phiên bản nguồn.");
  if (knownOn < capture.profile.valuationDate) throw new AppError(422, "SOURCE_KNOWLEDGE_DATE_INVALID", "Ngày ghi nhận không được trước ngày định giá nguồn.");
  const original = prepareRetirement(capture.profile, preview.selection, capture.policy.data, capture.assumptions.data);
  if (!original.replayInput) throw new AppError(422, "SOURCE_BASELINE_INCOMPLETE", "Không tái lập được nguồn ban đầu.");
  const baseline = profileSourceRegistry(capture.profile, preview.selection, original.replayInput.rows, parentSnapshotHash);
  const originalRetirementMonth = preview.reforecast?.originalRetirementMonth ?? preview.replayInput.retirementMonth;
  const registry = importLegacySourceChanges(baseline, preview.replayInput.rows, originalRetirementMonth,
    preview.sourceChanges ?? [], preview.futureChanges ?? [], parentSnapshotHash, knownOn);
  const funding = preview.selection.startOfMonthFunding;
  const replayInput: SourceProjectionInput = { ...preview.replayInput, modelVersion: SOURCE_MODEL, sourceRegistry: registry,
    sourceBudget: { originalRetirementMonth, startFunding: funding ? { monthlyAvailable: funding.monthlyAvailable, schedule: funding.schedule } : null } };
  const result = projectSources(replayInput);
  if (digest(result.rows) !== digest(preview.calculation.rows) || digest(result.summary) !== digest(preview.calculation.summary))
    throw new AppError(422, "SOURCE_UPGRADE_NOOP_MISMATCH", "Nâng phiên bản làm lệch dự báo. Cần rà nguồn trước khi lưu.");
  return { ...preview, modelVersion: SOURCE_MODEL, replayInput,
    inputHash: digest({ previousInputHash: preview.inputHash, replayInput, parentSnapshotHash }), calculation: { ...preview.calculation, ...result } };
}
