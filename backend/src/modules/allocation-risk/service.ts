import type { PrismaClient } from "@prisma/client";
import { addMonths, monthSchema } from "../../common/calendar";
import { AppError } from "../../common/errors";
import { RetirementDecimal as D, type ProjectionInput } from "../retirement/engine";
import { RetirementService } from "../retirement/service";
import { PlansService } from "../plans/service";
import { PortfoliosService } from "../portfolios/service";
import { glideTargets, glideYears, portfolioPreviewCache, applySpendingFloorTargets, spendingFloorConstraint, type SpendingFloorInput } from "../portfolios/engine";
import type { PortfolioDocument } from "../portfolios/schema";
import type { PlanPreview } from "../retirement/upgrade";
import { essentialCoverage, adjustmentOptions, selectionExplanations } from "../retirement/preview-insights";
import { profileMonthlyCashflow } from "../profiles/cashflow";
import { prepareRetirement } from "../retirement/prepare";
import { buildSpendingFloor } from "../retirement/spending-floor";
import { separateCapital } from "../capital/separation";
import { assessLossConstraint } from "../capital/loss-constraint";
import { liquidityRequirement } from "../capital/liquidity";
import { composeSourceMonths } from "../retirement/sources";
import { MarketDataService } from "./market-service";
import { riskRequestSchema, type RiskRequest } from "./schema";
import { LIMITS, PATH_MILESTONES, simulate, runPath, type RiskContext, type PathMarket } from "./simulation";
import { continuousCandidate, type LockedWeight } from "./optimizer-candidate";
import { checkPortfolioFeasibility } from "./optimizer";
import { applyLateLifeCare, deterministicScenarios, extendLongevityContext, type StressExtraInputs } from "./stresses";
import { allocationCandidates, selectCandidate, compareChange, compareCvarThenChange } from "./selection";
import { currentWeightsFromHoldings, currentWeightsFromProfile, policyCodeResolver, turnoverFromCurrent } from "./current-weights";
import { leastLossCandidate, lossFeasibility, lossReducedCandidate } from "./loss-candidates";
import { proposeRebalance, rebalanceInputSchema, type Allocation } from "./rebalance";
import type { z } from "zod";
import { customTargets, customAllocationSchema, type CustomAllocation } from "../portfolios/custom";
import { searchAdjustments } from "./adjustments";

type Capture = Awaited<ReturnType<RetirementService["capture"]>>;
const review = (...issues: string[]) => ({ status: "REVIEW_REQUIRED" as const, issues });
type RunMode = "simulation" | "scenarios" | "selection" | "adjustments";
type ActiveRun = { controller: AbortController; mode: RunMode; done: Promise<void> };
// Initial settings (decided 19/11/2026); tune after load measurements.
const MAX_SERVER_RUNS = 2, SUPERSEDE_WAIT_MS = 3000;
/** First, fast estimate when neither the request nor the policy names a path count; the customer raises it through PATH_MILESTONES. */
const DEFAULT_PATHS = 20;
/** Wilson interval still straddles the threshold: more paths could change the verdict (lower < threshold <= upper). */
const thresholdUndecided = (wilson: { lower: number; upper: number }, threshold: string) => wilson.lower < Number(threshold) && Number(threshold) <= wilson.upper;
/** Partial progress of a selection run: finished candidates count in full, the interrupted one by its saved paths. */
function selectionProgress<T extends { status: string; progress?: { pathsCompleted: number; pathsRequested: number } }>(result: T, paths: number, finished: number, total: number) {
  return result.progress ? { ...result, progress: { pathsCompleted: finished * paths + result.progress.pathsCompleted, pathsRequested: total * paths } } : result;
}
/** Own budget of the adjustment search (one lever after another, each a few simulations). */
export const ADJUSTMENT_LIMIT_MS = 60000;
const activeRuns = new Map<string, ActiveRun>(), running = new Set<ActiveRun>();
function targetsAt(policy: PortfolioDocument, templateId: string, months: string[], retirementMonth: string, custom?: CustomAllocation, spendingFloor?: SpendingFloorInput): Allocation[][] | null {
  const template = policy.templates.find(t => t.id === templateId);
  if (!template) return null;
  if ("glidePath" in template) {
    const codes = [...new Set(template.glidePath.points.flatMap(p => p.allocations.map(a => a.assetClass)))];
    const initial = glideTargets(template, glideYears(template, months[0], retirementMonth), codes);
    const byYears = new Map<string, Allocation[]>();
    return months.map(m => {
      const years = glideYears(template, m, retirementMonth);
      const key = `${years}:${Boolean(spendingFloor && m >= retirementMonth)}`;
      let row = byYears.get(key);
      if (!row) {
        const target = glideTargets(template, years, codes);
        const resolved = custom ? customTargets(custom, initial, target) : target;
        const final = spendingFloor && m >= retirementMonth ? applySpendingFloorTargets(resolved, spendingFloor) : resolved;
        byYears.set(key, row = [...final].map(([assetClass, w]) => ({ assetClass, weightPercent: w.mul(100).toFixed() })));
      }
      return row;
    });
  }
  return months.map((_, i) => template.schedule.find(s => s.fromIndex <= i + 1 && s.toIndex >= i + 1)?.allocations ?? []);
}
export function contextOf(capture: Capture, preview: PlanPreview): RiskContext | null {
  if (!preview.replayInput || !preview.calculation) return null;
  const replay = preview.replayInput;
  // Never mix conventions inside one plan: the saved model decides (v4 source plans: v3 kernel unless the input pins a v5 kernel).
  const kernel = replay.modelVersion === "retirement-monthly-v4" ? (replay as { kernelModel?: string }).kernelModel : replay.modelVersion ?? preview.calculation.modelVersion;
  const model = kernel === "retirement-monthly-v5" ? "retirement-monthly-v5" as const : "retirement-monthly-v3" as const;
  if (replay.contributionTiming === "START_OF_MONTH_RESEARCH") return null;
  const essential = essentialCoverage(capture.profile, preview.selection, {
    ...preview, status: "READY", issues: [], replayInput: { ...replay, modelVersion: model },
    calculation: { ...preview.calculation, modelVersion: model },
  });
  if (essential.rows.some(r => r.essentialExpense === null)) return null;
  let essentials = essential.rows.map((r,i) => new D(r.essentialExpense!).minus(
    (preview.calculation!.rows[i] as typeof preview.calculation.rows[number]&{essentialGoalExpense?:string}).essentialGoalExpense??0).toFixed());
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
  const floorProfile = structuredClone(capture.profile);
  for (const override of preview.selection.whatIf?.assetValues ?? []) {
    const asset = floorProfile.assets.status === "KNOWN" ? floorProfile.assets.entries.find(a => a.id === override.assetId) : undefined;
    if (asset) asset.value = {status:"KNOWN",value:override.value};
  }
  const floor = buildSpendingFloor(floorProfile, preview.selection, capture.policy.data, capture.assumptions.data, {...replay, modelVersion:model}, templateId);
  if (floor.status === "INCOMPLETE") return null;
  const targets = targetsAt(capture.policy.data, templateId, replay.rows.map(r => r.month), replay.retirementMonth, preview.selection.customAllocation, floor.status === "READY" ? floor.input : undefined);
  const template = capture.policy.data.templates.find(t => t.id === templateId);
  if (!targets || !template) return null;
  // Undo only the prior additional external fee; runPath recalculates all fees.
  const rows = replay.rows.map(r => {
    const feeRow = r as typeof r & { advisoryFeeAmount?: string; advisoryFeePaidFrom?: string };
    return { ...r, additionalExpense: feeRow.advisoryFeePaidFrom === "EXTERNAL" && feeRow.advisoryFeeAmount
      ? new D(r.additionalExpense).minus(feeRow.advisoryFeeAmount).toFixed() : r.additionalExpense };
  });
  const projection: ProjectionInput = { ...replay, rows, modelVersion: model };
  const selection = replay.modelVersion === "retirement-monthly-v4" ? { ...preview.selection,
    startOfMonthFunding: replay.sourceBudget.startFunding ? {
      confirmed: true as const, source: "CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START" as const,
      ...replay.sourceBudget.startFunding,
    } : undefined } : preview.selection;
  return { projection, selection, essentialExpenses: essentials, targets,
    ...(floor.status === "READY" ? { spendingFloor: spendingFloorConstraint(new Map(targets[0].map(t=>[t.assetClass,new D(t.weightPercent).div(100)])),floor.input) } : {}),
    allGoalsCovered: !!replay.protection || (capture.profile.goals?.status === "KNOWN" && capture.profile.goals.entries.length === 0),
    rebalance: preview.calculation.marketRows.map(r => r.rebalanced), turnoverCostPercent: template.rebalance.turnoverCostPercent,
    // Spec §8.2: simulated holdings follow the approved tolerance band, like proposeRebalance in operation.
    rebalanceBandPoints: capture.policy.data.schemaVersion === 2 ? capture.policy.data.allocationRisk?.rebalanceBandPoints ?? null : null };
}
function deterministicMarket(preview: PlanPreview): PathMarket[] {
  const protection=preview.replayInput?.protection;
  return preview.calculation!.marketRows.map((r,i) => ({ cpi: new D(r.inflationMonthlyFactor).minus(1).toFixed(),
    returns: Object.fromEntries(r.holdings.map(h => [h.assetClass,
      new D(h.annualNetNominalReturnPercent).div(1200).toFixed()]).concat(protection?[
        [protection.depositAssetClass,new D(protection.depositFactors[i]).minus(1).toFixed()],
        ...protection.goals.flatMap(g=>g.depositAssetClass&&g.depositFactors?.[i]?[[g.depositAssetClass,new D(g.depositFactors[i]).minus(1).toFixed()]]:[])
      ]:[])) }));
}
export class AllocationRiskService {
  constructor(private db: PrismaClient, private optimizer = { continuous: false, fallback: false }) {}
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
  async run(userId: string, command: RiskRequest, mode: RunMode, externalSignal?: AbortSignal) {
    const busy = (...extra: string[]) => ({ status: "LIMIT_EXCEEDED" as const, issues: ["CONCURRENT_RUN_LIMIT", ...extra] });
    // At most one run per account. A newer run of the same kind supersedes the older one (the
    // browser already abandoned it); the slot is only reused once the old run has really stopped.
    // A different kind (e.g. a stress test during selection) is refused instead of cancelling.
    const existing = activeRuns.get(userId);
    if (existing) {
      if (existing.mode !== mode) return busy("ACCOUNT_RUN_IN_PROGRESS");
      existing.controller.abort();
      await Promise.race([existing.done, new Promise(resolve => setTimeout(resolve, SUPERSEDE_WAIT_MS).unref?.())]);
      if (activeRuns.has(userId)) return busy("ACCOUNT_RUN_IN_PROGRESS");
    }
    // Server-wide cap counts every run still executing, including cancelled ones not yet stopped.
    if (running.size >= MAX_SERVER_RUNS) return busy();
    const controller = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    let release!: () => void;
    const entry = { controller, mode, done: new Promise<void>(resolve => { release = resolve; }) };
    activeRuns.set(userId, entry); running.add(entry);
    try { return await this.execute(userId, command, mode, controller.signal); }
    finally {
      running.delete(entry);
      if (activeRuns.get(userId) === entry) activeRuns.delete(userId);
      release();
    }
  }
  /** Test/operations helper: number of runs still executing (including cancelled ones not yet stopped). */
  static activeRunCount() { return running.size; }
  private async execute(userId: string, command: RiskRequest, mode: RunMode, signal?: AbortSignal) {
    const loaded = await this.load(userId, command), { input, capture } = loaded;
    const dataset = await new MarketDataService(this.db).published(input.marketVersionId);
    const dataRequired = { status: "DATA_REQUIRED" as const, issues: ["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"] };
    // Scenarios and selection run on pinned deterministic assumptions; only Monte Carlo needs published data.
    if (!dataset && (mode === "simulation" || mode === "adjustments")) return dataRequired;
    const preview: PlanPreview = loaded.preview ?? new RetirementService(this.db).evaluate(capture, loaded.selection);
    const reference = { marketVersionId: dataset?.id ?? null, marketVersion: dataset?.version ?? null, marketHash: dataset?.documentHash ?? null,
      inputHash: preview.inputHash, ...preview.references, informationalOnly: true, persisted: false };
    const abortedResult = { ...reference, status: "LIMIT_EXCEEDED" as const, issues: ["SIMULATION_ABORTED"], limits: LIMITS };
    if (signal?.aborted) return abortedResult;
    const context = contextOf(capture, preview), policy = capture.policy.data.schemaVersion === 2 ? capture.policy.data.allocationRisk : undefined;
    const thresholdRange = policy?.essentialThresholdRange ?? { min: "0.90", max: "0.95" };
    if (input.essentialThreshold !== undefined) {
      const chosen = new D(input.essentialThreshold);
      if (chosen.lt(thresholdRange.min) || chosen.gt(thresholdRange.max))
        throw new AppError(422, "ESSENTIAL_THRESHOLD_OUT_OF_RANGE", `Ngưỡng xác suất chi thiết yếu phải nằm trong khoảng [${thresholdRange.min}, ${thresholdRange.max}].`);
    }
    const essentialThreshold = input.essentialThreshold ?? policy?.essentialThreshold;
    const paths = policy?.simulationPaths ?? input.paths ?? DEFAULT_PATHS;

    const riskProfile = structuredClone(capture.profile);
    for (const override of preview.selection.whatIf?.assetValues ?? []) {
      const asset = riskProfile.assets.status === "KNOWN" ? riskProfile.assets.entries.find(a => a.id === override.assetId) : undefined;
      if (asset) asset.value = { status: "KNOWN", value: override.value };
    }
    const capital = separateCapital(riskProfile, capture.assumptions.data);

    if (mode === "selection" && capital.status === "READY" && capital.growthCapital !== null && new D(capital.growthCapital).lt(0)) {
      const shortfallAmount = new D(capital.growthCapital).abs().toFixed();
      return {
        ...reference,
        status: "INSUFFICIENT" as const,
        issues: ["PROTECTED_CAPITAL_EXCEEDS_ASSETS"],
        shortfallAmount,
        growthCapital: capital.growthCapital,
        ...(policy?.essentialThreshold ? { threshold: essentialThreshold } : {}),
        candidates: [],
        rejected: [],
        ...(input.detail ? { referenceId: null, referenceKind: null, lossFeasibility: null, allThreshold: policy?.allGoalsThreshold ?? null } : {}),
        ...(input.detail === "ALLOCATION_V2" ? {
          explanation: selectionExplanations({
            profile: riskProfile, capital, status: "INSUFFICIENT", threshold: essentialThreshold ?? null,
            shortfallAmount, rejected: [],
          }),
        } : {}),
        adjustmentKinds: null,
        rule: "P_ESSENTIAL_THRESHOLD_THEN_MIN_CVAR_THEN_MIN_ALLOCATION_CHANGE; ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION",
      };
    }
    if (!context) {
      const realIssues = [
        ...new Set([
          "CLASSIFIED_SERVER_CASHFLOWS_AND_COMPLETE_PROJECTION_REQUIRED",
          ...(capital.issues ?? []).map(i => i.code),
          ...(preview.issues ?? []).map(i => i.code),
        ]),
      ];
      return { ...reference, ...review(...realIssues) };
    }
    const deadline = performance.now() + LIMITS.maxRuntimeMs;
    if (mode === "adjustments") {
      if (!policy?.essentialThreshold || !policy.blockMonths || !policy.cvarAlpha) return { ...reference, ...review("APPROVED_STEP_THRESHOLD_AND_LOSS_STRESS_REQUIRED") };
      if (capital.status === "READY" && capital.growthCapital !== null && new D(capital.growthCapital).lt(0))
        return { ...reference, ...review("PROTECTED_CAPITAL_EXCEEDS_ASSETS") };
      const threshold = essentialThreshold!, budget = performance.now() + ADJUSTMENT_LIMIT_MS;
      const retirement = new RetirementService(this.db);
      // Same allocation, seed and number of paths as the selection; only the behavioural input changes.
      const evaluate = async (variant: { selection: typeof loaded.selection; profile?: typeof capture.profile }) => {
        if (signal?.aborted) return { limit: true as const };
        const variantCapture = variant.profile ? { ...capture, profile: variant.profile } : capture;
        const evaluated = retirement.evaluate(variantCapture, variant.selection);
        const variantContext = evaluated.status === "READY" ? contextOf(variantCapture, evaluated) : null;
        if (!variantContext) return { review: "ADJUSTED_PLAN_REVIEW_REQUIRED" };
        const result = await simulate(variantContext, dataset!.data, policy, paths, budget, input.detail, signal);
        return result.status === "READY" ? { pEssential: result.pEssential } : result.status === "LIMIT_EXCEEDED" ? { limit: true as const } : { review: result.issues[0] ?? "SIMULATION_REVIEW_REQUIRED" };
      };
      const baseline = await simulate(context, dataset!.data, policy, paths, budget, input.detail, signal);
      if (baseline.status !== "READY") return { ...reference, ...baseline };
      const common = { threshold, paths, basis: "SIMULATED_P_ESSENTIAL_SAME_SEED_AND_ALLOCATION" as const, baselinePEssential: baseline.pEssential };
      if (new D(baseline.pEssential).gte(threshold)) return { ...reference, ...common, status: "NOT_NEEDED" as const };
      const accumulationCapacity = preview.calculation!.rows.filter(r => r.month < context.projection.retirementMonth).map(r => r.contributionCapacity);
      const found = await searchAdjustments({ selection: loaded.selection, profile: capture.profile, threshold,
        retirementMonth: context.projection.retirementMonth, accumulationCapacity, evaluate, outOfTime: () => performance.now() >= budget || !!signal?.aborted });
      if (signal?.aborted) return abortedResult;
      return { ...reference, ...common, ...found };
    }
    if (mode === "simulation") return { ...reference, ...await simulate(context, dataset!.data, policy, paths, deadline, input.detail, signal) };
    if (mode === "scenarios") {
      const propertyInjections = preview.reforecast ? undefined : (capture.profile.assets.status === "KNOWN" ? capture.profile.assets.entries : []).flatMap(a => {
        const plan = a.housingPlan, mapping = preview.selection.housing.find(h => h.assetId === a.id);
        if (plan?.status !== "CONFIRMED" || plan.kind === "RENT" || !mapping || plan.netAmount.status !== "KNOWN" || a.retirementShare.status !== "KNOWN" || a.ownershipShare.status !== "KNOWN") return [];
        return [{ month: plan.startMonth, amount: new D(plan.netAmount.value).mul(a.retirementShare.value).mul(mapping.amountScope === "WHOLE_ASSET" ? a.ownershipShare.value : 1).toFixed() }];
      });
      const market = deterministicMarket(preview);
      const birthMonth = capture.profile.personal.birthMonth.status === "KNOWN" ? capture.profile.personal.birthMonth.value : undefined;
      const healthExpenses = policy?.stresses?.HIGH_INFLATION?.healthDeltaPoints && capture.profile.expenses.status === "KNOWN"
        ? context.projection.rows.map(r => {
          const retired = r.month >= context.projection.retirementMonth;
          const entries = capture.profile.expenses.status === "KNOWN"
            ? capture.profile.expenses.entries.filter(e => e.category === "HEALTH" && (!retired || preview.selection.retirementAdditionalExpenseIds.includes(e.id)))
            : [];
          return (profileMonthlyCashflow({ income: { status: "KNOWN", entries: [] }, expenses: { status: "KNOWN", entries } }, r.month).expenses ?? new D(0)).toFixed();
        }) : undefined;
      const stressExtra: StressExtraInputs = { ...(birthMonth ? { birthMonth } : {}), ...(healthExpenses ? { healthExpenses } : {}) };
      const scenarios = deterministicScenarios(context, market, policy, propertyInjections, stressExtra);
      const lateLifeCare = policy?.stresses?.LONGEVITY?.lateLifeCareMonthly;
      const longevity = (policy?.stresses?.LONGEVITY?.extraYears ?? []).map(extraYears => {
        const endMonth = addMonths(preview.selection.endMonth, extraYears * 12);
        if (preview.reforecast || !monthSchema.safeParse(endMonth).success) return { extraYears, ...review("EXTENDED_SOURCE_CASHFLOW_REVIEW_REQUIRED") };
        const selection = { ...preview.selection, endMonth }, extended = new RetirementService(this.db).evaluate(capture, selection);
        const ctx = contextOf(capture, extended);
        if (!ctx) {
          const last = context.projection.rows.at(-1)!;
          if (policy?.stresses?.LONGEVITY?.terminalContinuation !== "LIVING_CPI_LIFELONG_PENSION_ONLY"
            || [last.income, last.debtPayment, last.additionalExpense].some(v => new D(v).gt(0)))
            return { extraYears, ...review("EXTENDED_POLICY_ASSUMPTION_OR_CASHFLOW_COVERAGE_REQUIRED") };
          const tail = extendLongevityContext(context, deterministicMarket(preview), extraYears);
          const tailCtx = lateLifeCare && birthMonth ? applyLateLifeCare(tail.extendedContext, birthMonth, lateLifeCare) : tail.extendedContext;
          return { extraYears, status: "READY" as const, endMonth: tail.endMonth, basis: "APPROVED_TERMINAL_CONTINUATION", result: runPath(tailCtx, tail.extendedMarket) };
        }
        const runCtx = lateLifeCare && birthMonth ? applyLateLifeCare(ctx, birthMonth, lateLifeCare) : ctx;
        return { extraYears, status: "READY" as const, endMonth, result: runPath(runCtx, deterministicMarket(extended)) };
      });
      return { ...reference, status: "READY" as const, basis: "PINNED_DETERMINISTIC_ASSUMPTIONS", sources: capture.assumptions.data.sources,
        scenarios, longevity: { kind: "LONGEVITY", status: longevity.length ? longevity.every(r => r.status === "READY") ? "READY" : "REVIEW_REQUIRED" : "REVIEW_REQUIRED", results: longevity },
        limitations: ["EACH_SCENARIO_HAS_ITS_OWN_STATUS", "NO_PROBABILITY_FOR_DETERMINISTIC_STRESS"] };
    }
    if (!policy?.equityShiftPoints || !policy.essentialThreshold || capture.policy.data.schemaVersion !== 2 || !capture.policy.data.lossStress)
      return { ...reference, ...review("APPROVED_STEP_THRESHOLD_AND_LOSS_STRESS_REQUIRED") };
    const stress = capture.policy.data.lossStress;
    const candidates = allocationCandidates(context.targets, stress.equityAssetClass, stress.depositAssetClass, policy.equityShiftPoints);
    const resolveCode = policyCodeResolver(context.targets[0].map(r => r.assetClass), stress.equityAssetClass, stress.depositAssetClass);
    const recorded = await this.recordedHoldings(userId, capture.profile.valuationDate, resolveCode);
    // Spec §6.3 constraint 4 (B5-1): month-0 deposit floor from uncovered 12-month liquidity need.
    const liquidity = liquidityRequirement(riskProfile, capital, capture.assumptions.data);
    if (liquidity.issues.length) return { ...reference, ...review("LIQUIDITY_REQUIREMENTS_INCOMPLETE", ...liquidity.issues.map(i => i.code)) };
    const spendingFloor = buildSpendingFloor(riskProfile, preview.selection, capture.policy.data, capture.assumptions.data, context.projection, preview.calculation!.assessment.selectedTemplateId);
    const floorInput = spendingFloor.status === "READY" ? spendingFloor.input : undefined;
    const uncovered12 = new D(liquidity.horizons.find(h => h.months === 12)?.uncovered ?? "0");
    const minCashFraction = capital.status === "READY" && capital.growthCapital !== null && new D(capital.growthCapital).gt(0) && uncovered12.gt(0)
      ? uncovered12.div(capital.growthCapital) : null;
    const minCashPercent = minCashFraction ? minCashFraction.mul(100) : null;
    const optimizerHardLimits = minCashFraction
      ? [{ id: "LIQUIDITY_12M", assetClass: stress.depositAssetClass, min: minCashFraction.toNumber() }] : undefined;
    // The optimizer only adds a candidate once the published policy carries an approved continuousOptimizer block.
    // Without it (or when its inputs cannot be solved and fallback is on) the approved grid candidates are still evaluated.
    const continuous = dataset && this.optimizer.continuous && policy.continuousOptimizer
      ? continuousCandidate(context.targets, dataset.data, policy.continuousOptimizer, recorded.lockedWeights, optimizerHardLimits) : undefined;
    if (continuous && !continuous.input && !this.optimizer.fallback) return { ...reference, ...review(continuous.issue ?? "OPTIMIZER_CONSTRAINTS_REQUIRED") };
    if (continuous?.candidate) candidates.unshift(continuous.candidate);
    if (continuous && !this.optimizer.fallback) candidates.splice(continuous.candidate ? 1 : 0);
    if (input.trialAllocation) {
      const trialPreview = new RetirementService(this.db).evaluate(capture, { ...loaded.selection, customAllocation: input.trialAllocation });
      const trialContext = contextOf(capture, trialPreview);
      if (trialPreview.status !== "READY" || !trialContext) return { ...reference, ...review(...trialPreview.issues.map(i=>i.code), "CUSTOM_ALLOCATION_REVIEW_REQUIRED") };
      candidates.push({ id: "CUSTOM", valid: true, targets: trialContext.targets,
        changePoints: trialContext.targets[0].reduce((sum,row)=>sum.plus(new D(row.weightPercent).minus(context.targets[0].find(r=>r.assetClass===row.assetClass)?.weightPercent??0).abs()),new D(0)).toFixed() });
    }
    const templateId = context.selection.templateId ?? preview.calculation?.assessment.selectedTemplateId;
    const previewCache = portfolioPreviewCache();
    const customEvalCache = new Map<string, boolean>();
    const customGen = capture.policy.data.customization && templateId ? (custom: CustomAllocation) =>
      targetsAt(capture.policy.data, templateId, context.projection.rows.map(r => r.month), context.projection.retirementMonth, custom, floorInput) : undefined;
    const customEval = customGen && templateId ? (custom: CustomAllocation) => {
      const key = JSON.stringify(custom), cached = customEvalCache.get(key);
      if (cached !== undefined) return cached;
      const ok = prepareRetirement(capture.profile, { ...loaded.selection, templateId, customAllocation: custom }, capture.policy.data, capture.assumptions.data, previewCache).status === "READY";
      customEvalCache.set(key, ok);
      return ok;
    } : undefined;
    if (signal?.aborted) return abortedResult;
    // Approved per-asset bounds (policy customization). A weight above zero needs a bound; tolerance absorbs renormalization digits.
    const bounds = capture.policy.data.schemaVersion === 2 ? capture.policy.data.customization?.bounds : undefined;
    const outsideBounds = (targets: Allocation[][]) => !!bounds && [...new Set(targets)].some(month => month.some(row => {
      const bound = bounds.find(b => b.assetClass === row.assetClass), weight = new D(row.weightPercent);
      return bound ? weight.lt(new D(bound.minPercent).minus("0.000001")) || weight.gt(new D(bound.maxPercent).plus("0.000001")) : weight.gt(0);
    }));
    // Spec B2-4: optional approved occupational-risk equity ceiling (complete no-op when absent).
    const occ = capture.policy.data.schemaVersion === 2 ? capture.policy.data.occupationalRisk : undefined;
    let occupationalEquityCap: InstanceType<typeof D> | null = null;
    if (occ) {
      if (occ.employerConcentration?.excludeEmployerSector && riskProfile.employerConcentration?.status === "KNOWN" && riskProfile.employerConcentration.value === "HIGH")
        return { ...reference, ...review("OCCUPATIONAL_SECTOR_CLASSIFICATION_REQUIRED") };
      const uncertainCap = riskProfile.incomeStability?.status === "KNOWN" && riskProfile.incomeStability.value === "UNCERTAIN"
        ? occ.incomeStability?.UNCERTAIN?.maxEquityPercent : undefined;
      if (uncertainCap !== undefined) occupationalEquityCap = new D(uncertainCap);
      const empReduction = riskProfile.employerConcentration?.status === "KNOWN" && riskProfile.employerConcentration.value === "HIGH"
        ? occ.employerConcentration?.maxEquityPercentReduction : undefined;
      if (empReduction !== undefined) {
        const baseEquityMax = new D(bounds?.find(b => b.assetClass === stress.equityAssetClass)?.maxPercent
          ?? context.targets[0]?.find(r => r.assetClass === stress.equityAssetClass)?.weightPercent ?? "100");
        const reducedCap = D.max(0, baseEquityMax.minus(empReduction));
        occupationalEquityCap = occupationalEquityCap ? D.min(occupationalEquityCap, reducedCap) : reducedCap;
      }
    }
    const lossCheckCache = new Map<Allocation[], ReturnType<typeof assessLossConstraint>>();
    const lossCheck = (t: Allocation[]) => {
      let result = lossCheckCache.get(t);
      if (!result) lossCheckCache.set(t, result = assessLossConstraint(capital, riskProfile, capture.policy.data, t.map(a => ({ assetClass: a.assetClass, startWeightPercent: a.weightPercent }))));
      return result;
    };
    const reduced = lossReducedCandidate(context.targets, stress.equityAssetClass, stress.depositAssetClass, lossCheck, customGen, customEval);
    if (reduced) candidates.push(reduced);
    // Spec 7.4 step 3: turnover is measured against what the customer holds now; the template distance is the fallback.
    let current = currentWeightsFromHoldings(recorded.assetClasses, resolveCode) ?? currentWeightsFromProfile(riskProfile, resolveCode,
      // The protected reserve and near-term goals stay in deposits (capital separation), not in long-term capital.
      capital.requiredEmergencyReserve === null || capital.nearTermGoalsPresentValue === null ? null
        : new D(capital.requiredEmergencyReserve).plus(capital.nearTermGoalsPresentValue).toFixed());
    // One basis for the whole run: if any candidate is not comparable, every candidate falls back to the template distance.
    if (current && candidates.some(c => turnoverFromCurrent(current, c.targets[0]) === null)) current = null;
    const turnoverBasis = current ? "CURRENT_HOLDINGS" as const : "TEMPLATE_FALLBACK" as const;
    const turnover = (targets: Allocation[][]) => ({ turnoverFromCurrentPoints: turnoverFromCurrent(current, targets[0]) });
    const scores = [], rejected = [], pinned: Array<Record<string, unknown> & { id: string; changePoints: string; turnoverFromCurrentPoints?: string | null }> = [];
    const market = dataset ? null : deterministicMarket(preview);
    // Candidates are simulated one after another; a deadline keeps the finished paths in the cache and the identical next request continues.
    let simulated = 0;
    const simulatedTotal = candidates.filter(c => c.valid).length;
    for (const candidate of candidates) {
      if (signal?.aborted) return abortedResult;
      if (!candidate.valid) { rejected.push({ id: candidate.id, issues: ["INVALID_WEIGHTS"] }); continue; }
      // Spec §7.4 step 1 / §6.3 constraint 3: drop candidates outside the approved per-asset bounds in any month.
      if (outsideBounds(candidate.targets)) { rejected.push({ id: candidate.id, issues: ["WEIGHT_BOUND_EXCEEDED"] }); continue; }
      if (floorInput && candidate.targets.some((target,i) => {
        if(context.projection.rows[i].month < context.projection.retirementMonth) return false;
        const weights=new Map(target.map(r=>[r.assetClass,new D(r.weightPercent).div(100)]));
        const corrected=applySpendingFloorTargets(weights,floorInput);
        return [...weights].some(([code,w])=>w.minus(corrected.get(code)??0).abs().gt("0.00000001"));
      })) { rejected.push({id:candidate.id,issues:["SPENDING_FLOOR_CONSTRAINT"]}); continue; }
      if (minCashPercent !== null) {
        const cashWeight = new D(candidate.targets[0]?.find(r => r.assetClass === stress.depositAssetClass)?.weightPercent ?? "0");
        if (cashWeight.lt(minCashPercent.minus("0.000001"))) { rejected.push({ id: candidate.id, issues: ["LIQUIDITY_CONSTRAINT"] }); continue; }
      }
      if (occupationalEquityCap !== null) {
        if (candidate.targets.some(target => new D(target.find(r => r.assetClass === stress.equityAssetClass)?.weightPercent ?? "0").gt(occupationalEquityCap!.plus("0.000001")))) { rejected.push({ id: candidate.id, issues: ["OCCUPATIONAL_RISK_LIMIT"] }); continue; }
      }
      if (continuous?.input && candidate.targets.some(t => !checkPortfolioFeasibility(continuous.input!, continuous.input!.currentWeights!.map((_, i) => Number(t.find(a => a.assetClass === context.targets[0][i].assetClass)?.weightPercent ?? NaN) / 100)).feasible)) {
        rejected.push({ id: candidate.id, issues: ["OPTIMIZER_HARD_CONSTRAINT_VIOLATION"] }); continue;
      }
      const checks = candidate.targets.map(lossCheck);
      if (checks.some(c => c.status === "REVIEW_REQUIRED")) {
        const checkIssues = checks.flatMap(c => c.issues ?? []);
        return { ...reference, ...review("LOSS_CONSTRAINT_INPUTS_REQUIRED", ...new Set(checkIssues)) };
      }
      if (checks.some(c => c.status !== "WITHIN_LIMIT")) { rejected.push({ id: candidate.id, issues: ["LOSS_CONSTRAINT_EXCEEDED"] }); continue; }
      if (!dataset) {
        const path = runPath({ ...context, targets: candidate.targets }, market!);
        pinned.push({ id: candidate.id, changePoints: candidate.changePoints, ...turnover(candidate.targets), targets: candidate.targets, loss: checks[0], withinLossLimit: true,
          essentialLossToday: path.essentialLossToday, funded: path.funded, fundedTerminalBalance: path.fundedTerminalBalance });
        continue;
      }
      const result = await simulate({ ...context, targets: candidate.targets }, dataset.data, policy, paths, deadline, input.detail, signal);
      if (result.status !== "READY") return { ...reference, ...selectionProgress(result, paths, simulated, simulatedTotal) };
      simulated++;
      let selection: {templateId:string;customAllocation?:CustomAllocation}|null=null;
      if(input.detail&&templateId){
        if(candidate.id==="BASE") selection={templateId,...(context.selection.customAllocation?{customAllocation:context.selection.customAllocation}:{})};
        else if(capture.policy.data.schemaVersion===2&&capture.policy.data.customization){
          const weights=candidate.targets[0].map(r=>({...r,weightPercent:new D(r.weightPercent).toDecimalPlaces(8).toFixed()}));
          if(weights.length)weights[weights.length-1].weightPercent=new D(100).minus(weights.slice(0,-1).reduce((s,r)=>s.plus(r.weightPercent),new D(0))).toFixed();
          const choice=customAllocationSchema.safeParse({model:"custom-glide-v1",weights});
          if(choice.success){
            // Normalize the last share after precision rounding, then verify the
            // replayable recipe reproduces every simulated target.
            const generated=targetsAt(capture.policy.data,templateId,context.projection.rows.map(r=>r.month),context.projection.retirementMonth,choice.data,floorInput);
            const equal=generated?.every((rows,i)=>rows.every(row=>new D(row.weightPercent).minus(candidate.targets[i].find(r=>r.assetClass===row.assetClass)?.weightPercent??-100).abs().lt("0.0000001")));
            if(equal&&customEval?.(choice.data))selection={templateId,customAllocation:choice.data};
          }
        }
      }
      scores.push({ ...result, thresholdUndecided: thresholdUndecided(result.wilson, essentialThreshold!), id: candidate.id, changePoints: candidate.changePoints, ...turnover(candidate.targets), targets: candidate.targets, withinLossLimit: true,
        ...(input.detail?{selection,loss:checks[0],applicable:!!selection,applyIssues:selection?[]:["CUSTOM_POLICY_REQUIRED"]}:{}) });
    }
    // Nothing fits the declared loss limit: show the least-loss allocation reachable with the
    // approved equity-to-deposit move as a reference only, with the limit the customer would need.
    const least = leastLossCandidate(context.targets, stress.equityAssetClass, stress.depositAssetClass, customGen);
    const leastCheck = least.valid && !outsideBounds(least.targets) ? lossCheck(least.targets[0]) : null;
    const feasibility = (scores.length || pinned.length) || !leastCheck ? null : lossFeasibility(leastCheck);
    const lockedNotes = recorded.hasLocked && (!continuous || !recorded.lockedWeights.length) ? { notes: ["LOCKED_HOLDINGS_EXCLUDED"] } : {};
    if (!dataset) {
      const ordered = [...pinned].sort(compareChange);
      const over = !ordered.length && least.valid && leastCheck ? (() => { const path = runPath({ ...context, targets: least.targets }, market!);
        return { id: least.id, changePoints: least.changePoints, ...turnover(least.targets), targets: least.targets, loss: leastCheck, withinLossLimit: false,
          essentialLossToday: path.essentialLossToday, funded: path.funded, fundedTerminalBalance: path.fundedTerminalBalance }; })() : null;
      const pick = ordered[0] ?? over;
      return { ...reference, ...dataRequired, turnoverBasis, ...lockedNotes, deterministic: {
        basis: "PINNED_DETERMINISTIC_ASSUMPTIONS", turnoverBasis, referenceId: pick?.id ?? null,
        referenceKind: !pick ? null : pick === over ? "LEAST_LOSS_OVER_LIMIT" : pick.id === "LOSS_REDUCED" ? "LOSS_REDUCED_WITHIN_LIMIT" : "TEMPLATE_UNSIMULATED",
        candidates: over ? [...ordered, over] : ordered, rejected, lossFeasibility: feasibility, applicable: false,
        applyIssues: ["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"], limitations: ["NO_PROBABILITY_WITHOUT_PUBLISHED_MARKET_DATA"] } };
    }
    let overLimit: (typeof scores)[number] | null = null;
    if (!scores.length && least.valid && leastCheck) {
      const result = await simulate({ ...context, targets: least.targets }, dataset.data, policy, paths, deadline, input.detail, signal);
      if (result.status === "LIMIT_EXCEEDED" && result.progress) return { ...reference, ...selectionProgress(result, paths, simulated, simulated + 1) };
      if (result.status === "READY") overLimit = { ...result, thresholdUndecided: thresholdUndecided(result.wilson, essentialThreshold!), id: least.id, changePoints: least.changePoints, ...turnover(least.targets), targets: least.targets, withinLossLimit: false,
        ...(input.detail ? { selection: null, loss: leastCheck, applicable: false, applyIssues: ["LOSS_CONSTRAINT_EXCEEDED"] } : {}) } as (typeof scores)[number];
    }
    const selected = selectCandidate(scores, essentialThreshold!);
    const replayable=scores.filter(c=>c.id!=="CUSTOM"&&(!input.detail||c.selection));
    const shown=replayable.length?replayable:scores.filter(c=>c.id!=="CUSTOM");
    const referenceChoice=selectCandidate(shown,essentialThreshold!)
      ?? [...shown].sort(compareCvarThenChange)[0]
      ?? overLimit ?? undefined;
    const referenceKind=!referenceChoice?null:referenceChoice===overLimit?"LEAST_LOSS_OVER_LIMIT":selected&&referenceChoice.id===selected.id?"QUALIFIED"
      :referenceChoice.id==="LOSS_REDUCED"?"LOSS_REDUCED_WITHIN_LIMIT":"BEST_WITHIN_LOSS_LIMIT";
    const omitAdjustments = input.detail === "ALLOCATION_V2";
    const adjustments = selected || !scores.length || omitAdjustments ? undefined : preview.reforecast ? { status: "REVIEW_REQUIRED", issues: ["REFORECAST_ADJUSTMENTS_REQUIRE_SOURCE_REBUILD"] }
      : performance.now() >= deadline ? { status: "REVIEW_REQUIRED" as const, issues: ["ADJUSTMENT_RUNTIME_LIMIT"] }
      : adjustmentOptions(capture.profile, preview.selection, capture.policy.data, capture.assumptions.data,
        prepareRetirement(capture.profile, preview.selection, capture.policy.data, capture.assumptions.data, previewCache), deadline);
    const adjustmentKinds = ["CONTRIBUTE_MORE", "RETIRE_LATER", "SPEND_LESS"] as const;
    return { ...reference, status: selected ? "READY" : "INSUFFICIENT", ...(!scores.length ? { issues: ["NO_CANDIDATE_WITHIN_LOSS_LIMIT"] } : {}), turnoverBasis, ...lockedNotes, selectedId: selected?.id ?? null, threshold: essentialThreshold!,
      paths, pathMilestones: [...PATH_MILESTONES], preliminary: paths < LIMITS.maxPaths,
      ...(input.detail?{referenceId:referenceChoice?.id??null,referenceKind,lossFeasibility:feasibility,allThreshold:policy.allGoalsThreshold??null}:{}),
      optimization: continuous ? { status: continuous.result?.status ?? "REVIEW_REQUIRED", method: continuous.result?.solverMetadata.method, issues: continuous.result?.issues ?? (continuous.issue ? [continuous.issue] : []), feasible: continuous.result?.solverMetadata.feasible ?? false } : { status: "DISABLED", method: "APPROVED_FINITE_CANDIDATES" },
      candidates: overLimit ? [...scores, overLimit] : scores, rejected,
      ...(adjustments ? { adjustmentOptions: adjustments, adjustmentKinds } : omitAdjustments && !selected ? { adjustmentsOmitted: true, adjustmentKinds } : {}),
      ...(input.detail === "ALLOCATION_V2" ? {
        explanation: selectionExplanations({
          profile: riskProfile, capital, status: selected ? "READY" : "INSUFFICIENT", threshold: essentialThreshold!,
          horizonMonths: Math.max(0, (Number(context.projection.retirementMonth.slice(0, 4)) - Number(context.projection.valuationDate.slice(0, 4))) * 12 + Number(context.projection.retirementMonth.slice(5, 7)) - Number(context.projection.valuationDate.slice(5, 7))), retirementMonth: context.projection.retirementMonth,
          turnoverBasis, rejected, selected, referenceChoice, referenceKind, hasLossReduced: Boolean(reduced),
        }),
      } : {}),
      rule: "P_ESSENTIAL_THRESHOLD_THEN_MIN_CVAR_THEN_MIN_ALLOCATION_CHANGE; ASSET_CLASS_LEVEL; LOT_AND_ISSUER_LIMITS_AT_EXECUTION" };
  }
  /** Recorded investment holdings valued by asset class plus holdings locked past valuationDate (spec §6.3 / B5-2). */
  private async recordedHoldings(userId: string, valuationDate: string, resolve: (generic: string) => string | null): Promise<{
    assetClasses: Array<{ assetClass: string; value: string }> | null; hasLocked: boolean; lockedWeights: LockedWeight[];
  }> {
    try {
      const { HoldingsRepository } = await import("../holdings/repository");
      const read = await new HoldingsRepository(this.db).read(userId, valuationDate);
      const locked = read.holdings.filter(h => !!h.lockedUntil && h.lockedUntil > valuationDate);
      const lockedWeights: LockedWeight[] = [];
      if (read.status === "READY" && read.summary && new D(read.summary.totalValue).gt(0)) {
        const total = new D(read.summary.totalValue), amounts = new Map<string, InstanceType<typeof D>>();
        for (const h of locked) {
          const code = h.assetClass ? resolve(h.assetClass) : null;
          if (!code || h.currentPrice === null) continue;
          amounts.set(code, (amounts.get(code) ?? new D(0)).plus(new D(h.quantity).mul(h.currentPrice)));
        }
        for (const [assetClass, amount] of amounts) if (amount.gt(0)) lockedWeights.push({ assetClass, weight: amount.div(total).toNumber() });
      }
      return { assetClasses: read.status === "READY" ? read.summary?.assetClasses ?? null : null, hasLocked: locked.length > 0, lockedWeights };
    } catch { return { assetClasses: null, hasLocked: false, lockedWeights: [] }; }
  }
  private async rebalanceProbabilities(userId: string, input: z.infer<typeof rebalanceInputSchema>, proposal: ReturnType<typeof proposeRebalance>) {
    if (proposal.status !== "PROPOSED" && proposal.status !== "WITHIN_BAND") return review("REBALANCE_PROPOSAL_REQUIRED");
    const saved = await new PlansService(this.db).readVersion(this.db, userId, input.planId!, input.planVersionId!);
    const context = contextOf(saved.capture, saved.version.preview);
    const risk = saved.capture.policy.data.schemaVersion === 2 ? saved.capture.policy.data.allocationRisk : undefined;
    if (!context || input.policyVersionId !== saved.capture.policy.id || input.retirementMonth !== context.projection.retirementMonth || input.month !== context.projection.valuationDate.slice(0, 7))
      return review("REBALANCE_PLAN_CONTEXT_MISMATCH");
    const total = input.holdings.reduce((s,h) => s.plus(h.value), new D(0));
    if (!total.eq(context.projection.initialCapital)) return review("REBALANCE_GROWTH_CAPITAL_MISMATCH");
    const dataset = await new MarketDataService(this.db).published();
    if (!dataset) return { status: "DATA_REQUIRED" as const, issues: ["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"] };
    const depositCode = saved.capture.policy.data.schemaVersion === 2 ? saved.capture.policy.data.lossStress?.depositAssetClass : undefined;
    if (!depositCode) return review("APPROVED_LOSS_STRESS_REQUIRED");
    const gross = total.plus(input.newContribution), free = new D(input.newContribution).plus(input.holdings.reduce((s,h)=>s.plus(h.maturedAmount),new D(0)));
    const amounts = new Map(input.holdings.map(h=>[h.assetClass,new D(h.value).minus(h.maturedAmount)]));
    amounts.set(depositCode,(amounts.get(depositCode)??new D(0)).plus(free));
    let assigned = new D(0);
    const entries = [...amounts], beforeWeights = entries.map(([assetClass,amount],i)=>{
      const weight = i===entries.length-1 ? new D(100).minus(assigned) : amount.div(gross).mul(100); assigned=assigned.plus(weight);
      return {assetClass,weightPercent:weight.toFixed()};
    });
    const afterWeights = proposal.status === "PROPOSED" ? proposal.newWeights : beforeWeights;
    const afterCapital = proposal.status === "PROPOSED" ? proposal.netValue : gross.toFixed();
    const run = (weights: Allocation[], initialCapital: string) => simulate({...context, spendingFloor:undefined,
      targets:context.targets.map(()=>weights), projection:{...context.projection,initialCapital}},dataset.data,risk,20,performance.now()+LIMITS.maxRuntimeMs);
    const before = await run(beforeWeights,gross.toFixed()), after = await run(afterWeights,afterCapital);
    if (before.status !== "READY" || after.status !== "READY") return review("REBALANCE_PROBABILITY_COMPARISON_INCOMPLETE");
    return {status:"READY" as const,paths:20,before:before.pEssential,after:after.pEssential,
      basis:"SAME_CASHFLOWS_SEED_FIXED_WEIGHTS_AFTER_RECORDED_FREE_CASH_AND_COST" as const};
  }
  async rebalance(command: z.infer<typeof rebalanceInputSchema>, userId?: string) {
    const input = rebalanceInputSchema.parse(command), policy = await new PortfoliosService(this.db).get(input.policyVersionId, true);
    const risk = policy.data.schemaVersion === 2 ? policy.data.allocationRisk : undefined;
    if (risk?.rebalanceBandPoints === undefined) return review("APPROVED_REBALANCE_BAND_REQUIRED");
    const template = policy.data.templates.find(t => t.id === input.templateId);
    if (!template || !("glidePath" in template)) return review("GLIDE_TEMPLATE_REQUIRED");
    let targets = targetsAt(policy.data, input.templateId, [input.month], input.retirementMonth)![0];
    let spendingFloor: RiskContext["spendingFloor"];
    if (template.glidePath.spendingFloorYears || (userId && input.planId && input.planVersionId)) {
      if (!userId || !input.planId || !input.planVersionId) return review("SPENDING_FLOOR_PLAN_CONTEXT_REQUIRED");
      const saved=await new PlansService(this.db).readVersion(this.db,userId,input.planId,input.planVersionId);
      const context=contextOf(saved.capture,saved.version.preview);
      const index=context?.projection.rows.findIndex(r=>r.month===input.month)??-1;
      if(!context || index<0 || saved.capture.policy.id!==policy.id || saved.version.preview.calculation?.assessment.selectedTemplateId!==input.templateId || context.projection.retirementMonth!==input.retirementMonth) return review("REBALANCE_PLAN_CONTEXT_MISMATCH");
      targets=context.targets[index];
      spendingFloor=context.spendingFloor;
    }
    const proposal = proposeRebalance(input, targets, risk.rebalanceBandPoints, template.rebalance.turnoverCostPercent, risk.rebalance, spendingFloor);
    const probabilityComparison = input.compareProbabilities && userId
      ? await this.rebalanceProbabilities(userId, input, proposal) : undefined;
    return { policyVersionId: policy.id, policyHash: policy.documentHash, month: input.month, persisted: false, informationalOnly: true,
      ...proposal, ...(probabilityComparison ? { probabilityComparison } : {}) };
  }
}
