import type { PrismaClient } from "@prisma/client";
import { addMonths, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D, type ProjectionInput } from "../retirement/engine";
import { RetirementService } from "../retirement/service";
import { PlansService } from "../plans/service";
import { PortfoliosService } from "../portfolios/service";
import { glideTargets, glideYears } from "../portfolios/engine";
import type { PortfolioDocument } from "../portfolios/schema";
import type { PlanPreview } from "../retirement/upgrade";
import { essentialCoverage, adjustmentOptions } from "../retirement/preview-insights";
import { prepareRetirement } from "../retirement/prepare";
import { separateCapital } from "../capital/separation";
import { assessLossConstraint } from "../capital/loss-constraint";
import { composeSourceMonths } from "../retirement/sources";
import { MarketDataService } from "./market-service";
import { riskRequestSchema, type RiskRequest } from "./schema";
import { LIMITS, simulate, runPath, type RiskContext, type PathMarket } from "./simulation";
import { stressKinds } from "./policy";
import { deterministicStress } from "./stresses";
import { allocationCandidates, selectCandidate } from "./selection";
import { proposeRebalance, rebalanceInputSchema, type Allocation } from "./rebalance";
import type { z } from "zod";

type Capture = Awaited<ReturnType<RetirementService["capture"]>>;
const review = (...issues: string[]) => ({ status: "REVIEW_REQUIRED" as const, issues });
const activeUsers = new Set<string>();
function targetsAt(policy: PortfolioDocument, templateId: string, months: string[], retirementMonth: string): Allocation[][] | null {
  const template = policy.templates.find(t => t.id === templateId);
  if (!template) return null;
  if ("glidePath" in template) {
    const codes = [...new Set(template.glidePath.points.flatMap(p => p.allocations.map(a => a.assetClass)))];
    return months.map(m => [...glideTargets(template, glideYears(template, m, retirementMonth), codes)].map(([assetClass, w]) => ({ assetClass, weightPercent: w.mul(100).toFixed() })));
  }
  return months.map((_, i) => template.schedule.find(s => s.fromIndex <= i + 1 && s.toIndex >= i + 1)?.allocations ?? []);
}
function contextOf(capture: Capture, preview: PlanPreview): RiskContext | null {
  if (!preview.replayInput || !preview.calculation) return null;
  const replay = preview.replayInput;
  if (replay.contributionTiming === "START_OF_MONTH_RESEARCH") return null;
  const essential = essentialCoverage(capture.profile, preview.selection, {
    ...preview, status: "READY", issues: [], replayInput: { ...replay, modelVersion: "retirement-monthly-v3" },
    calculation: { ...preview.calculation, modelVersion: "retirement-monthly-v3" },
  });
  if (essential.rows.some(r => r.essentialExpense === null)) return null;
  let essentials = essential.rows.map(r => r.essentialExpense!);
  // Source plans must retain classified expense identities. New/legacy expense
  // aggregates carry no essential/optional classification: never guess one.
  if (replay.modelVersion === "retirement-monthly-v4") {
    const composed = composeSourceMonths(replay.sourceRegistry);
    const expenseIds = new Map((capture.profile.expenses.status === "KNOWN" ? capture.profile.expenses.entries : []).map(e => [`profile:expense:${e.id}`, e.category]));
    const cells = composed.attribution.filter(c => c.metric === "livingExpense" || c.metric === "additionalExpense");
    if (cells.some(c => !expenseIds.has(c.sourceId) && !["plan:retirement-living", "plan:reserve"].includes(c.sourceId))) return null;
    if (cells.some(c => c.sourceId === "plan:retirement-living" && c.sourceRevision !== 1)) return null;
    if (cells.some(c => c.month >= replay.retirementMonth && c.metric === "livingExpense" && c.sourceId !== "plan:retirement-living")) return null;
    essentials = replay.rows.map(r => cells.filter(c => c.month === r.month && (c.sourceId === "plan:retirement-living" || expenseIds.get(c.sourceId) === "ESSENTIAL"))
      .reduce((s, c) => s.plus(c.amount), new D(0)).toFixed());
  } else if (preview.reforecast && (preview.futureChanges?.length || preview.sourceChanges?.length)) return null;
  const templateId = preview.calculation.assessment.selectedTemplateId;
  if (!templateId) return null;
  const targets = targetsAt(capture.policy.data, templateId, replay.rows.map(r => r.month), replay.retirementMonth);
  const template = capture.policy.data.templates.find(t => t.id === templateId);
  if (!targets || !template) return null;
  // Undo only the prior additional external fee; runPath recalculates all fees.
  const rows = replay.rows.map(r => {
    const feeRow = r as typeof r & { advisoryFeeAmount?: string; advisoryFeePaidFrom?: string };
    return { ...r, additionalExpense: feeRow.advisoryFeePaidFrom === "EXTERNAL" && feeRow.advisoryFeeAmount
      ? new D(r.additionalExpense).minus(feeRow.advisoryFeeAmount).toFixed() : r.additionalExpense };
  });
  const projection: ProjectionInput = { ...replay, rows, modelVersion: "retirement-monthly-v3" };
  const selection = replay.modelVersion === "retirement-monthly-v4" ? { ...preview.selection,
    startOfMonthFunding: replay.sourceBudget.startFunding ? {
      confirmed: true as const, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START" as const,
      ...replay.sourceBudget.startFunding,
    } : undefined } : preview.selection;
  return { projection, selection, essentialExpenses: essentials, targets,
    rebalance: preview.calculation.marketRows.map(r => r.rebalanced), turnoverCostPercent: template.rebalance.turnoverCostPercent };
}
function deterministicMarket(preview: PlanPreview): PathMarket[] {
  return preview.calculation!.marketRows.map(r => ({ cpi: new D(r.inflationMonthlyFactor).minus(1).toFixed(),
    returns: Object.fromEntries(r.holdings.map(h => [h.assetClass,
      new D(h.annualNetNominalReturnPercent).div(100).plus(1).pow(new D(1).div(12)).minus(1).toFixed()])) }));
}
export class AllocationRiskService {
  constructor(private db: PrismaClient) {}
  private async load(userId: string, command: RiskRequest) {
    const input = riskRequestSchema.parse(command);
    const retirement = new RetirementService(this.db);
    if (input.plan.kind === "PREVIEW") {
      const capture = await retirement.capture(this.db, userId, input.plan.preview);
      return { input, capture, preview: null, selection: input.plan.preview };
    }
    const saved = await new PlansService(this.db).readVersion(this.db, userId, input.plan.planId, input.plan.versionId);
    return { input, capture: saved.capture, preview: saved.version.preview, selection: saved.version.preview.selection };
  }
  async run(userId: string, command: RiskRequest, mode: "simulation" | "scenarios" | "selection") {
    if (activeUsers.has(userId) || activeUsers.size >= 2) return { status: "LIMIT_EXCEEDED" as const, issues: ["CONCURRENT_RUN_LIMIT"] };
    activeUsers.add(userId);
    try { return await this.execute(userId, command, mode); }
    finally { activeUsers.delete(userId); }
  }
  private async execute(userId: string, command: RiskRequest, mode: "simulation" | "scenarios" | "selection") {
    const loaded = await this.load(userId, command), { input, capture } = loaded;
    const dataset = await new MarketDataService(this.db).published(input.marketVersionId);
    if (!dataset) return { status: "DATA_REQUIRED" as const, issues: ["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"] };
    const preview: PlanPreview = loaded.preview ?? new RetirementService(this.db).evaluate(capture, loaded.selection);
    const reference = { marketVersionId: dataset.id, marketVersion: dataset.version, marketHash: dataset.documentHash,
      inputHash: preview.inputHash, ...preview.references, informationalOnly: true, persisted: false };
    const context = contextOf(capture, preview), policy = capture.policy.data.schemaVersion === 2 ? capture.policy.data.allocationRisk : undefined;
    if (!context) return { ...reference, ...review("CLASSIFIED_SERVER_CASHFLOWS_AND_COMPLETE_PROJECTION_REQUIRED") };
    const deadline = performance.now() + LIMITS.maxRuntimeMs;
    if (mode === "simulation") return { ...reference, ...await simulate(context, dataset.data, policy, input.paths, deadline) };
    if (mode === "scenarios") {
      const propertyInjections = preview.reforecast ? undefined : (capture.profile.assets.status === "KNOWN" ? capture.profile.assets.entries : []).flatMap(a => {
        const plan = a.housingPlan, mapping = preview.selection.housing.find(h => h.assetId === a.id);
        if (plan?.status !== "CONFIRMED" || plan.kind === "RENT" || !mapping || plan.netAmount.status !== "KNOWN" || a.retirementShare.status !== "KNOWN" || a.ownershipShare.status !== "KNOWN") return [];
        return [{ month: plan.startMonth, amount: new D(plan.netAmount.value).mul(a.retirementShare.value).mul(mapping.amountScope === "WHOLE_ASSET" ? a.ownershipShare.value : 1).toFixed() }];
      });
      const scenarios = stressKinds.filter(k => k !== "LONGEVITY").map(k => deterministicStress(k, context, deterministicMarket(preview), policy, propertyInjections));
      const longevity = (policy?.stresses?.LONGEVITY?.extraYears ?? []).map(extraYears => {
        const endMonth = addMonths(preview.selection.endMonth, extraYears * 12);
        if (preview.reforecast || !monthSchema.safeParse(endMonth).success) return { extraYears, ...review("EXTENDED_SOURCE_CASHFLOW_REVIEW_REQUIRED") };
        const selection = { ...preview.selection, endMonth }, extended = new RetirementService(this.db).evaluate(capture, selection);
        const ctx = contextOf(capture, extended);
        if (!ctx) return { extraYears, ...review("EXTENDED_POLICY_ASSUMPTION_OR_CASHFLOW_COVERAGE_REQUIRED") };
        return { extraYears, status: "READY" as const, endMonth, result: runPath(ctx, deterministicMarket(extended)) };
      });
      return { ...reference, status: "READY" as const, basis: "PINNED_DETERMINISTIC_ASSUMPTIONS", sources: capture.assumptions.data.sources,
        scenarios, longevity: { kind: "LONGEVITY", status: longevity.length ? longevity.every(r => r.status === "READY") ? "READY" : "REVIEW_REQUIRED" : "REVIEW_REQUIRED", results: longevity },
        limitations: ["EACH_SCENARIO_HAS_ITS_OWN_STATUS", "NO_PROBABILITY_FOR_DETERMINISTIC_STRESS"] };
    }
    if (!policy?.equityShiftPoints || !policy.essentialThreshold || capture.policy.data.schemaVersion !== 2 || !capture.policy.data.lossStress)
      return { ...reference, ...review("APPROVED_STEP_THRESHOLD_AND_LOSS_STRESS_REQUIRED") };
    const stress = capture.policy.data.lossStress;
    const riskProfile = structuredClone(capture.profile);
    for (const override of preview.selection.whatIf?.assetValues ?? []) {
      const asset = riskProfile.assets.status === "KNOWN" ? riskProfile.assets.entries.find(a => a.id === override.assetId) : undefined;
      if (asset) asset.value = { status: "KNOWN", value: override.value };
    }
    const capital = separateCapital(riskProfile, capture.assumptions.data);
    const candidates = allocationCandidates(context.targets, stress.equityAssetClass, stress.depositAssetClass, policy.equityShiftPoints);
    const scores = [], rejected = [];
    if (input.paths * context.projection.rows.length * candidates.length > LIMITS.maxPathMonths)
      return { ...reference, status: "LIMIT_EXCEEDED" as const, issues: ["CANDIDATE_PATH_MONTH_LIMIT"], limits: LIMITS };
    for (const candidate of candidates) {
      if (!candidate.valid) { rejected.push({ id: candidate.id, issues: ["INVALID_WEIGHTS"] }); continue; }
      const checks = candidate.targets.map(t => assessLossConstraint(capital, riskProfile, capture.policy.data,
        t.map(a => ({ assetClass: a.assetClass, startWeightPercent: a.weightPercent }))));
      if (checks.some(c => c.status === "REVIEW_REQUIRED")) return { ...reference, ...review("LOSS_CONSTRAINT_INPUTS_REQUIRED") };
      if (checks.some(c => c.status !== "WITHIN_LIMIT")) { rejected.push({ id: candidate.id, issues: ["LOSS_CONSTRAINT_EXCEEDED"] }); continue; }
      const result = await simulate({ ...context, targets: candidate.targets }, dataset.data, policy, input.paths, deadline);
      if (result.status !== "READY") return { ...reference, ...result };
      scores.push({ ...result, id: candidate.id, changePoints: candidate.changePoints, targets: candidate.targets });
    }
    const selected = selectCandidate(scores, policy.essentialThreshold);
    const adjustments = selected ? undefined : preview.reforecast ? { status: "REVIEW_REQUIRED", issues: ["REFORECAST_ADJUSTMENTS_REQUIRE_SOURCE_REBUILD"] }
      : adjustmentOptions(capture.profile, preview.selection, capture.policy.data, capture.assumptions.data,
        prepareRetirement(capture.profile, preview.selection, capture.policy.data, capture.assumptions.data));
    return { ...reference, status: selected ? "READY" : "INSUFFICIENT", selectedId: selected?.id ?? null, threshold: policy.essentialThreshold,
      candidates: scores, rejected, ...(adjustments ? { adjustmentOptions: adjustments, adjustmentKinds: ["CONTRIBUTE_MORE", "RETIRE_LATER", "SPEND_LESS"] } : {}),
      rule: "P_ESSENTIAL_THRESHOLD_THEN_MIN_CVAR_THEN_MIN_ALLOCATION_CHANGE" };
  }
  async rebalance(command: z.infer<typeof rebalanceInputSchema>) {
    const input = rebalanceInputSchema.parse(command), policy = await new PortfoliosService(this.db).get(input.policyVersionId, true);
    const risk = policy.data.schemaVersion === 2 ? policy.data.allocationRisk : undefined;
    if (risk?.rebalanceBandPoints === undefined) return review("APPROVED_REBALANCE_BAND_REQUIRED");
    const template = policy.data.templates.find(t => t.id === input.templateId);
    if (!template || !("glidePath" in template)) return review("GLIDE_TEMPLATE_REQUIRED");
    const targets = targetsAt(policy.data, input.templateId, [input.month], input.retirementMonth)![0];
    return { policyVersionId: policy.id, policyHash: policy.documentHash, month: input.month, persisted: false, informationalOnly: true,
      ...proposeRebalance(input, targets, risk.rebalanceBandPoints, template.rebalance.turnoverCostPercent) };
  }
}
