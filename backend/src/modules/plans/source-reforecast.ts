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
import { loanSourceCandidate, type LoanSourceBasis } from "../debts/source-candidate";
import { loanActualEvidenceSchema } from "../debts/reconciliation";
import { createLoanSource, loanCreationAllocations } from "../debts/source-create";
import { reconcileRefinance } from "../debts/refinance";
import { assetSourceCandidate, assertAssetCommandHistory, assetAllocations, capitalActualEvidenceSchema, legacyCapitalAllocations, priorCapitalAllocations } from "../capital/source-candidate";

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
    return { status: forecast.status, issues: forecast.issues, inputHash: null, candidate: null, loanRevisionOptions: [], assetRevisionOptions: [], saved: false, applied: false };
  const knownOn = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const original = version.preview;
  const upgraded = original.modelVersion === SOURCE_MODEL ? original : upgradeSourcePreview(capture, original, version.snapshotHash, knownOn);
  const lineage: ReforecastLineage = { kind: "ACTUAL_REFORECAST", sourceVersionId: version.id, sourceSnapshotHash: version.snapshotHash,
    originalValuationDate: original.reforecast?.originalValuationDate ?? original.valuationDate, originalRetirementMonth: forecast.originalRetirementMonth,
    throughMonth: input.throughMonth, actualRevisions: [...(original.reforecast?.actualRevisions ?? []),
      ...forecast.actuals.map(a => ({ period: a.period, revision: a.revision, closingBalance: a.data.closingBalance }))] };
  let registry = upgraded.replayInput.sourceRegistry;
  const pensions = new PensionEstimateService(db), pensionSources = [...(upgraded.pensionSources ?? [])], loanSources = [...(upgraded.loanSources ?? [])];
  const newLoanSources = [...(upgraded.newLoanSources ?? [])];
  const refinances = [...(upgraded.refinances ?? [])];
  const assetSources = [...(upgraded.assetSources ?? [])];
  const newCommandIds = [...input.sourceCommands, ...input.pensionSelections, ...(input.loanRevisions ?? []), ...(input.loanCreations ?? []), ...(input.refinances ?? []), ...(input.assetCommands ?? [])].map(c => c.commandId);
  if (newCommandIds.some(id => refinances.some(r => r.command.commandId === id)) || (input.refinances ?? []).some(c => registry.revisions.some(r => r.commandId === c.commandId)))
    throw new AppError(409, "SOURCE_COMMAND_REUSED", "Mã thao tác đã được dùng trong lịch sử phương án.");
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
  const loanActualRows = input.loanRevisions?.length || input.loanCreations?.some(c => c.funding.kind === "DISBURSED_BALANCE")
    ? await tx.actualMonth.findMany({ where: { userId, period: { in: lineage.actualRevisions.map(r => r.period) } }, orderBy: { period: "asc" } }) : [];
  const loanActuals = loanActualRows.map(row => loanActualEvidenceSchema.parse({ period: row.period, revision: row.revision, status: "RECONCILED", data: row.payload }));
  const consumedLoanAllocations = () => registry.revisions.flatMap(r => {
    const revised = loanSources.find(s => s.sourceHash === r.sourceHash), created = newLoanSources.find(s => s.sourceHash === r.sourceHash);
    return (revised?.evidence.command.allocations ?? (created ? loanCreationAllocations(created.evidence.command) : []))
      .map(allocation => ({ sourceId: r.sourceId, allocation }));
  });
  for (const command of input.loanCreations ?? []) {
    if (newLoanSources.some(s => s.evidence.command.agreementReference.toUpperCase() === command.agreementReference.toUpperCase()))
      throw new AppError(409, "LOAN_AGREEMENT_ALREADY_EXISTS", "Hợp đồng đã có trong lịch sử nguồn của phương án.");
    const result = createLoanSource(registry, command, input.throughMonth, knownOn, loanActuals, consumedLoanAllocations());
    registry = result.registry; newLoanSources.push({ sourceHash: result.sourceHash, evidence: result.evidence });
  }
  if (input.loanRevisions?.length) {

    for (const command of input.loanRevisions) {
      const priorSource = registry.revisions.filter(r => r.sourceId === command.sourceId).at(-1);
      const priorLoan = priorSource && loanSources.find(s => s.sourceHash === priorSource.sourceHash);
      const createdLoan = priorSource && newLoanSources.find(s => s.sourceHash === priorSource.sourceHash);
      let basis: LoanSourceBasis;
      if (priorLoan) basis = { sourceHash: priorLoan.sourceHash, contract: priorLoan.evidence.command.contract };
      else if (createdLoan) basis = { sourceHash: createdLoan.sourceHash, contract: createdLoan.evidence.command.contract };
      else {
        const debt = capture.profile.debts.status === "KNOWN" ? capture.profile.debts.entries.find(d => `profile:debt:${d.id}` === command.sourceId) : undefined;
        if (!priorSource || !debt || !command.legacyOpening) throw new AppError(422, "LOAN_OPENING_CONFIRMATION_REQUIRED", "Cần xác nhận căn cứ số dư khoản vay cũ.");
        basis = { sourceHash: priorSource.sourceHash, legacy: { debt, opening: command.legacyOpening, stress: original.selection.debtStress.filter(s => s.loanId === debt.id) } };
      }
      const consumed = consumedLoanAllocations();
      const result = loanSourceCandidate(registry, command, basis, loanActuals, consumed, input.throughMonth, knownOn);
      registry = result.registry; loanSources.push({ sourceHash: result.sourceHash, evidence: result.evidence });
    }
  }
  for (const command of input.refinances ?? []) {
    const closing = loanSources.find(s => s.evidence.command.commandId === command.closingCommandId);
    const replacement = newLoanSources.find(s => s.evidence.command.commandId === command.newLoanCommandId);
    if (!closing || !replacement) throw new AppError(422, "REFINANCE_COMMANDS_REQUIRED", "Thiếu cặp tất toán và khoản vay thay thế.");
    refinances.push(reconcileRefinance(command, closing, replacement));
  }
  if (input.assetCommands?.length) {
    const rows = await tx.actualMonth.findMany({ where: { userId, period: { in: lineage.actualRevisions.map(r => r.period) } }, orderBy: { period: "asc" } });
    const actuals = rows.map(row => capitalActualEvidenceSchema.parse({ period: row.period, revision: row.revision, data: row.payload }));
    for (const command of input.assetCommands) {
      assertAssetCommandHistory(command, assetSources.map(s => s.evidence), upgraded.sourceChanges ?? [], capture.profile.assets.status === "KNOWN" ? capture.profile.assets.entries : [], input.throughMonth);
      const consumed = [...legacyCapitalAllocations(upgraded.sourceChanges ?? [], actuals), ...assetSources.flatMap(s => assetAllocations(s.evidence.command))];
      const priorRealized = priorCapitalAllocations(command.sourceId, assetSources.map(s => s.evidence), upgraded.sourceChanges ?? [], actuals);
      const result = assetSourceCandidate(registry, command, actuals, consumed, input.throughMonth, knownOn, priorRealized);
      registry = result.registry; assetSources.push({ sourceHash: result.sourceHash, evidence: result.evidence });
    }
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
  const inputHash = digest({ input, knownOn, parentHash: version.snapshotHash, replayInput, lineage, pensionSources, loanSources, newLoanSources, refinances, assetSources });
  const candidate: SourceRetirementResult = { ...upgraded, valuationDate: replayInput.valuationDate, inputHash, replayInput, reforecast: lineage,
    sourceCommands: [...(upgraded.sourceCommands ?? []), ...input.sourceCommands], pensionSources,
    ...(loanSources.length ? { loanSources } : {}),
    ...(newLoanSources.length ? { newLoanSources } : {}),
    ...(refinances.length ? { refinances } : {}),
    ...(assetSources.length ? { assetSources } : {}),
    calculation: { ...upgraded.calculation, ...projectSources(replayInput), marketRows: upgraded.calculation.marketRows.filter(r => r.month >= nextMonth),
      limitations: [...new Set([...upgraded.calculation.limitations, "PLAN_SCOPED_SOURCES", "EXPLICIT_DEPOSITS_ONLY", "PENSION_ESTIMATE_NOT_OFFICIAL_AWARD", "PROFILE_NET_WORTH_AND_GOAL_SELECTION_RETAIN_ORIGINAL_BASIS"])] } };
  const latestSources = new Map(registry.revisions.map(s => [s.sourceId, s]));
  const loanRevisionOptions = [...latestSources.values()].filter(s => s.kind === "DEBT" && s.operation !== "END").flatMap(source => {
    const loan = loanSources.find(s => s.sourceHash === source.sourceHash) ?? newLoanSources.find(s => s.sourceHash === source.sourceHash);
    const debt = capture.profile.debts.status === "KNOWN" ? capture.profile.debts.entries.find(d => `profile:debt:${d.id}` === source.sourceId) : undefined;
    if (!loan && (!debt || source.revision !== 1)) return [];
    return [{ sourceId: source.sourceId, sourceRevision: source.revision, sourceHash: source.sourceHash,
      contractHash: digest(loan ? loan.evidence.command.contract : debt), legacyOpeningRequired: !loan }];
  });
  const assetRevisionOptions = [...latestSources.values()].filter(s => s.kind === "ASSET_CAPITAL" && s.operation !== "END")
    .map(s => ({ sourceId: s.sourceId, sourceRevision: s.revision, sourceHash: s.sourceHash }));
  return { status: "READY", issues: [], inputHash, candidate, loanRevisionOptions, assetRevisionOptions, saved: false, applied: false };
}
