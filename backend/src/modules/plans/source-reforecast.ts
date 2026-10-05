import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../common/errors";
import { digest } from "../../common/digest";
import { addMonths } from "../../common/calendar";
import { profileV2Schema } from "../profiles/schema-v2";
import { ActualsService } from "../actuals/service";
import { assertActualSource, type ReforecastLineage } from "../actuals/lineage";
import { PensionEstimateService } from "../pensions/estimate-service";
import { pensionSourceCandidate } from "../pensions/source-candidate";
import { composeSourceMonths } from "../retirement/sources";
import { applyFlowSourceCommand } from "../retirement/source-commands";
import { projectSources, rebuildSourceBudget, SOURCE_MODEL, type SourceProjectionInput } from "../retirement/engine-v4";
import { upgradeSourcePreview, type SourceRetirementResult } from "../retirement/upgrade";
import { PlansService } from "./service";
import type { SourceReforecastCommand } from "./source-schema";

export async function previewSourceReforecast(db: PrismaClient, tx: Prisma.TransactionClient, userId: string, planId: string, input: SourceReforecastCommand) {
  const { plan, version, capture } = await new PlansService(db).readVersion(tx, userId, planId, input.versionId);
  if (plan.revision !== input.expectedRevision || version.snapshotHash !== input.expectedSnapshotHash)
    throw new AppError(409, "REVISION_CONFLICT", "Kế hoạch hoặc phiên bản nguồn đã đổi.");
  const profile = await tx.financialProfile.findUnique({ where: { userId } });
  if (!profile || profile.revision !== input.expectedProfileRevision || version.profileRevision !== profile.revision ||
    digest(profileV2Schema.parse(profile.profileData)) !== digest(capture.profile))
    throw new AppError(409, "PROFILE_CHANGED_RECREATE_VERSION", "Hồ sơ khác phiên bản nguồn.");
  await assertActualSource(tx, userId, version.preview.reforecast);
  const sameAnchor = version.preview.reforecast?.throughMonth === input.throughMonth;
  const pinnedAnchor = version.preview.reforecast?.actualRevisions.at(-1);
  const forecast = sameAnchor && pinnedAnchor ? { status: "READY", issues: [], anchor: pinnedAnchor,
    calculation: version.preview.calculation, originalRetirementMonth: version.preview.reforecast!.originalRetirementMonth, actuals: [] }
    : await new ActualsService(db).forecast(userId, { planId, versionId: version.id, throughMonth: input.throughMonth }, tx);
  if (forecast.status !== "READY" || !forecast.anchor || !forecast.calculation)
    return { status: forecast.status, issues: forecast.issues, inputHash: null, candidate: null, saved: false, applied: false };
  const knownOn = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const original = version.preview;
  const upgraded = original.modelVersion === SOURCE_MODEL ? original : upgradeSourcePreview(capture, original, version.snapshotHash, knownOn);
  let registry = upgraded.replayInput.sourceRegistry;
  const pensions = new PensionEstimateService(db), pensionSources = [...(upgraded.pensionSources ?? [])];
  for (const command of input.sourceCommands) registry = applyFlowSourceCommand(registry, command, input.throughMonth, knownOn);
  for (const selection of input.pensionSelections) {
    const evidence = await pensions.captureForSource(userId, selection.estimateId, selection.expectedEstimateIntegrityHash, tx);
    // All selections name the registry at the start of the command batch. Flow
    // mutations have their own revision CAS; bind the pure builder to its input.
    if (selection.expectedRegistryHash !== upgraded.replayInput.sourceRegistry.registryHash)
      throw new AppError(409, "SOURCE_REGISTRY_CHANGED", "Lịch nguồn khác lần đã chọn.");
    const selected = { ...selection, expectedRegistryHash: registry.registryHash };
    const result = pensionSourceCandidate(registry, selected, evidence, userId, input.throughMonth, knownOn);
    registry = result.registry; pensionSources.push({ sourceHash: result.sourceHash, selection: selected, evidence });
  }
  const nextMonth = addMonths(input.throughMonth, 1), remaining = upgraded.replayInput.rows.filter(r => r.month >= nextMonth);
  // Replaced/ended estimates remain immutable history, but must not prevent a
  // user from replacing a stale estimate. Recheck only surviving future cells.
  const future = composeSourceMonths(registry, nextMonth, remaining.at(-1)!.month);
  const activeHashes = new Set(future.attribution.map(c => c.sourceHash));
  for (const source of pensionSources) if (activeHashes.has(source.sourceHash))
    await pensions.captureForSource(userId, source.evidence.estimateId, source.evidence.estimateIntegrityHash, tx);
  const replayInput: SourceProjectionInput = { ...upgraded.replayInput, sourceRegistry: registry,
    valuationDate: nextMonth + "-01", retirementMonth: forecast.originalRetirementMonth < nextMonth ? nextMonth : forecast.originalRetirementMonth,
    initialCapital: forecast.anchor.closingBalance, rows: remaining };
  replayInput.rows = rebuildSourceBudget(replayInput, future.rows);
  const lineage: ReforecastLineage = { kind: "ACTUAL_REFORECAST", sourceVersionId: version.id, sourceSnapshotHash: version.snapshotHash,
    originalValuationDate: original.reforecast?.originalValuationDate ?? original.valuationDate, originalRetirementMonth: forecast.originalRetirementMonth,
    throughMonth: input.throughMonth, actualRevisions: [...(original.reforecast?.actualRevisions ?? []),
      ...forecast.actuals.map(a => ({ period: a.period, revision: a.revision, closingBalance: a.data.closingBalance }))] };
  const inputHash = digest({ input, knownOn, parentHash: version.snapshotHash, replayInput, lineage, pensionSources });
  const candidate: SourceRetirementResult = { ...upgraded, valuationDate: replayInput.valuationDate, inputHash, replayInput, reforecast: lineage,
    sourceCommands: [...(upgraded.sourceCommands ?? []), ...input.sourceCommands], pensionSources,
    calculation: { ...upgraded.calculation, ...projectSources(replayInput), marketRows: upgraded.calculation.marketRows.filter(r => r.month >= nextMonth),
      limitations: [...new Set([...upgraded.calculation.limitations, "PLAN_SCOPED_SOURCES", "EXPLICIT_DEPOSITS_ONLY", "PENSION_ESTIMATE_NOT_OFFICIAL_AWARD", "PROFILE_NET_WORTH_AND_GOAL_SELECTION_RETAIN_ORIGINAL_BASIS"])] } };
  return { status: "READY", issues: [], inputHash, candidate, saved: false, applied: false };
}
