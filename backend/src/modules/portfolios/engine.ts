import { addMonths } from "../../common/calendar";
import type { AssumptionDocument } from "../assumptions/schema";
import { AssumptionDecimal as D, validateConfiguration, resolveYearSeries, normalizedAnnualReturn, type ConfigurationIssue } from "../assumptions/series";
import { dimensions, portfolioDocumentSchema, portfolioPreviewSchema, type PortfolioDocument, type PortfolioPreview, type PortfolioTemplate } from "./schema";
import { customTargets, customWeightIssues } from "./custom";

type Allocation = { assetClass: string; weightPercent: string };
const allocationSets = (template: PortfolioTemplate): Allocation[][] =>
  "glidePath" in template ? template.glidePath.points.map(p => p.allocations) : template.schedule.map(p => p.allocations);
const monthNumber = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

/** Whole years left until the anchor month (0 at or after it), clamped to the last point. */
export function glideYears(template: Extract<PortfolioTemplate, { glidePath: unknown }>, month: string, anchorMonth: string) {
  const months = monthNumber(anchorMonth) - monthNumber(month);
  const top = Math.max(...template.glidePath.points.map(p => p.yearsToAnchor));
  return Math.min(top, Math.max(0, Math.floor(months / 12)));
}
/** Linear interpolation between the neighbouring points; the last asset absorbs rounding so weights sum to exactly 100. */
export function glideTargets(template: Extract<PortfolioTemplate, { glidePath: unknown }>, years: number, assetCodes: string[]) {
  const points = [...template.glidePath.points].sort((a, b) => a.yearsToAnchor - b.yearsToAnchor);
  const hi = points.find(p => p.yearsToAnchor >= years) ?? points.at(-1)!, lo = [...points].reverse().find(p => p.yearsToAnchor <= years) ?? points[0];
  const weightOf = (p: typeof points[number], code: string) => new D(p.allocations.find(a => a.assetClass === code)?.weightPercent ?? "0");
  const share = hi.yearsToAnchor === lo.yearsToAnchor ? new D(0) : new D(years - lo.yearsToAnchor).div(hi.yearsToAnchor - lo.yearsToAnchor);
  const targets = new Map<string, InstanceType<typeof D>>();
  let assigned = new D(0);
  assetCodes.forEach((code, i) => {
    const percent = i === assetCodes.length - 1 ? new D(100).minus(assigned) : weightOf(lo, code).plus(weightOf(hi, code).minus(weightOf(lo, code)).mul(share));
    assigned = assigned.plus(percent); targets.set(code, percent.div(100));
  });
  return targets;
}

export type SpendingFloorInput = {
  essentialSpendingPV: string;
  growthCapital: string;
  bounds?: Array<{ assetClass: string; minPercent: string; maxPercent: string }>;
  safeAssets?: string[];
};

/** The actual-holdings minimum shares the target floor's approved bounds. */
export function spendingFloorConstraint(targets: Map<string, InstanceType<typeof D>>, floor: SpendingFloorInput) {
  const pv = new D(floor.essentialSpendingPV), growth = new D(floor.growthCapital);
  if (pv.lte(0) || growth.lte(0)) return undefined;
  const safe = new Set(floor.safeAssets ?? ["CASH", "GOV_BOND"]), codes = [...targets.keys()];
  const safeAssets = codes.filter(c => safe.has(c)), risky = codes.filter(c => !safe.has(c));
  if (!safeAssets.length) return undefined;
  const maxSafe = safeAssets.reduce((s,c) => s.plus(new D(floor.bounds?.find(b=>b.assetClass===c)?.maxPercent ?? 100).div(100)),new D(0));
  const minRisky = risky.reduce((s,c) => s.plus(new D(floor.bounds?.find(b=>b.assetClass===c)?.minPercent ?? 0).div(100)),new D(0));
  return { safeAssets, minSafeFraction: D.min(new D(1).minus(minRisky),maxSafe,pv.div(growth)).toFixed() };
}

/** Spec §8.3 / B7-6: from retirement onward, ensure safe assets (CASH + GOV_BOND) cover at least
 * PV(N years of essential spending) / growthCapital, clamped within customization.bounds,
 * redistributing proportionally from remaining assets. No-op when already satisfied or inputs <= 0. */
export function applySpendingFloorTargets(targets: Map<string, InstanceType<typeof D>>, floor: SpendingFloorInput) {
  const pv = new D(floor.essentialSpendingPV), growth = new D(floor.growthCapital);
  if (pv.lte(0) || growth.lte(0)) return targets;
  const codes = [...targets.keys()];
  const safeSet = new Set(floor.safeAssets ?? ["CASH", "GOV_BOND"]);
  const safeCodes = codes.filter(c => safeSet.has(c)), riskyCodes = codes.filter(c => !safeSet.has(c));
  if (!safeCodes.length || !riskyCodes.length) return targets;
  const minW = (c: string) => { const b = floor.bounds?.find(x => x.assetClass === c); return b ? new D(b.minPercent).div(100) : new D(0); };
  const maxW = (c: string) => { const b = floor.bounds?.find(x => x.assetClass === c); return b ? new D(b.maxPercent).div(100) : new D(1); };
  const currentSafe = safeCodes.reduce((s, c) => s.plus(targets.get(c)!), new D(0));
  const desiredSafe = new D(spendingFloorConstraint(targets, floor)!.minSafeFraction);
  if (desiredSafe.lte(currentSafe)) return targets;
  const delta = desiredSafe.minus(currentSafe);
  const safeHeadroom = new Map(safeCodes.map(c => [c, D.max(0, maxW(c).minus(targets.get(c)!))]));
  const totalHeadroom = [...safeHeadroom.values()].reduce((s, v) => s.plus(v), new D(0));
  const riskySlack = new Map(riskyCodes.map(c => [c, D.max(0, targets.get(c)!.minus(minW(c)))]));
  const totalSlack = [...riskySlack.values()].reduce((s, v) => s.plus(v), new D(0));
  if (totalHeadroom.lte(0) || totalSlack.lte(0)) return targets;
  const shift = D.min(delta, D.min(totalHeadroom, totalSlack));
  const next = new Map<string, InstanceType<typeof D>>();
  for (const c of safeCodes) next.set(c, targets.get(c)!.plus(shift.mul(safeHeadroom.get(c)!).div(totalHeadroom)));
  for (const c of riskyCodes) next.set(c, targets.get(c)!.minus(shift.mul(riskySlack.get(c)!).div(totalSlack)));
  const absorb = riskyCodes.find(c => riskySlack.get(c)!.gt(0)) ?? safeCodes[safeCodes.length - 1];
  const otherSum = codes.reduce((s, c) => c === absorb ? s : s.plus(next.get(c)!), new D(0));
  next.set(absorb, new D(1).minus(otherSum));
  return next;
}

export function validatePortfolioPolicy(document: PortfolioDocument, assumptions: AssumptionDocument) {
  const data = portfolioDocumentSchema.parse(document), issues: ConfigurationIssue[] = [];
  const issue = (path: string, code: string) => issues.push({ path, code });
  const unique = (values: string[], path: string) => { if (new Set(values).size !== values.length) issue(path, "DUPLICATE_ENTRY"); };
  if (validateConfiguration(assumptions).status !== "VALID") issue("assumptionVersionId", "ASSUMPTIONS_INCOMPLETE");
  if (data.source.reviewedOn > data.effectiveFrom) issue("source", "SOURCE_AFTER_EFFECTIVE_DATE");
  unique(data.questions.map(q => q.id), "questions"); unique(data.riskBands.map(b => b.id), "riskBands");
  unique(data.templates.map(t => t.id), "templates"); unique(data.rules.map(r => r.id), "rules");
  data.questions.forEach((q, i) => unique(q.choices.map(c => c.id), `questions.${i}.choices`));
  for (const dimension of dimensions) if (!data.questions.some(q => q.dimension === dimension)) issue(`questions.${dimension}`, "DIMENSION_REQUIRED");
  const maximum = data.questions.reduce((sum, q) => sum + Math.max(...q.choices.map(c => c.score)), 0);
  let nextScore = 0;
  for (const band of [...data.riskBands].sort((a, b) => a.minScore - b.minScore)) {
    if (band.minScore !== nextScore) issue("riskBands", "SCORE_GAP_OR_OVERLAP");
    nextScore = band.maxScore + 1;
  }
  if (!data.riskBands.length || nextScore !== maximum + 1) issue("riskBands", "SCORE_RANGE_NOT_COVERED");
  if (!data.templates.length || !data.rules.length) issue("templates", "POLICY_REQUIRED");
  const assets = new Set(assumptions.assetClasses.map(a => a.code));
  if (data.schemaVersion === 2 && data.quickStartTemplates) {
    for (const reaction of ["SELL", "HOLD", "BUY_MORE"] as const)
      if (!data.templates.some(template => template.id === data.quickStartTemplates![reaction]))
        issue(`quickStartTemplates.${reaction}`, "UNKNOWN_TEMPLATE");
  }
  if (data.schemaVersion === 2 && data.customization) {
    if (!data.lossStress) issue("customization", "LOSS_STRESS_REQUIRED");
    const bounds = data.customization.bounds;
    if (bounds.some(b => !assets.has(b.assetClass))) issue("customization", "UNKNOWN_ASSET_CLASS");
    if (bounds.reduce((s,b)=>s.plus(b.minPercent),new D(0)).gt(100) || bounds.reduce((s,b)=>s.plus(b.maxPercent),new D(0)).lt(100))
      issue("customization", "CUSTOM_BOUNDS_INFEASIBLE");
    const used = new Set(data.templates.flatMap(t => allocationSets(t).flatMap(rows => rows.map(r => r.assetClass))));
    if ([...used].some(code => !bounds.some(b => b.assetClass === code))) issue("customization", "CUSTOM_BOUND_COVERAGE_REQUIRED");
  }
  if (data.schemaVersion === 2 && data.allocationRisk?.stresses) {
    const stresses = data.allocationRisk.stresses;
    for (const [kind, parameters] of Object.entries(stresses)) {
      if (parameters && "assetClass" in parameters && !assets.has(parameters.assetClass))
        issue(`allocationRisk.stresses.${kind}`, "STRESS_ASSET_NOT_COVERED");
    }
    if (stresses.RATE_RISE && new D(stresses.RATE_RISE.durationYears).mul(stresses.RATE_RISE.yieldRisePoints).gte(100))
      issue("allocationRisk.stresses.RATE_RISE", "SCENARIO_RATE_OUT_OF_RANGE");
    if (stresses.LONGEVITY && new Set(stresses.LONGEVITY.extraYears).size !== stresses.LONGEVITY.extraYears.length)
      issue("allocationRisk.stresses.LONGEVITY", "DUPLICATE_ENTRY");
  }
  if (data.schemaVersion === 2 && data.lossStress) {
    const stress = data.lossStress;
    unique(stress.shocks.map(s => s.assetClass), "lossStress.shocks");
    if (stress.shocks.some(s => !assets.has(s.assetClass))) issue("lossStress.shocks", "UNKNOWN_ASSET_CLASS");
    const used = new Set(data.templates.flatMap(t => allocationSets(t).flatMap(a => a.filter(w => new D(w.weightPercent).gt(0)).map(w => w.assetClass))));
    for (const code of [...used, stress.equityAssetClass, stress.depositAssetClass])
      if (!stress.shocks.some(s => s.assetClass === code)) issue("lossStress.shocks", "STRESS_ASSET_NOT_COVERED");
    const equity = stress.shocks.find(s => s.assetClass === stress.equityAssetClass);
    const deposit = stress.shocks.find(s => s.assetClass === stress.depositAssetClass);
    if (equity && deposit && !new D(equity.percent).lt(deposit.percent)) issue("lossStress", "STRESS_REDUCTION_NOT_POSSIBLE");
  }
  const allocationCheck = (allocations: Allocation[], i: number) => {
    unique(allocations.map(a => a.assetClass), `templates.${i}.allocations`);
    if (!allocations.reduce((sum, a) => sum.plus(a.weightPercent), new D(0)).eq(100)) issue(`templates.${i}.allocations`, "WEIGHTS_MUST_SUM_100");
    if (allocations.some(a => !assets.has(a.assetClass))) issue(`templates.${i}.allocations`, "UNKNOWN_ASSET_CLASS");
  };
  data.templates.forEach((template, i) => {
    if ("glidePath" in template) {
      const years = template.glidePath.points.map(p => p.yearsToAnchor);
      unique(years.map(String), `templates.${i}.glidePath.points`);
      if (!years.includes(0)) issue(`templates.${i}.glidePath`, "ZERO_YEAR_POINT_REQUIRED");
      template.glidePath.points.forEach(p => allocationCheck(p.allocations, i));
      return;
    }
    let nextIndex = 1;
    for (const period of [...template.schedule].sort((a, b) => a.fromIndex - b.fromIndex)) {
      if (period.fromIndex !== nextIndex) issue(`templates.${i}.schedule`, "SCHEDULE_GAP_OR_OVERLAP");
      nextIndex = period.toIndex + 1;
      allocationCheck(period.allocations, i);
    }
    if (!template.schedule.length || nextIndex !== template.coverageMonths + 1) issue(`templates.${i}.schedule`, "TEMPLATE_COVERAGE_REQUIRED");
  });
  data.rules.forEach((rule, i) => {
    unique(rule.riskBandIds, `rules.${i}.riskBandIds`);
    const template = data.templates.find(t => t.id === rule.templateId);
    // A glide path covers any horizon; an indexed schedule only its coverage.
    if (!template || ("coverageMonths" in template && rule.horizon.max > template.coverageMonths)) issue(`rules.${i}`, "TEMPLATE_HORIZON_NOT_COVERED");
    if (rule.riskBandIds.some(id => !data.riskBands.some(b => b.id === id))) issue(`rules.${i}`, "UNKNOWN_RISK_BAND");
    // Distinct applicable templates may be offered to the user. Without an
    // explicit choice, multiple candidates are reported; no arbitrary priority.
    if (template) for (const asset of new Set(allocationSets(template).flatMap(p => p.filter(a => new D(a.weightPercent).gt(0)).map(a => a.assetClass)))) {
      const horizons = assumptions.assetClasses.find(a => a.code === asset)?.horizons ?? [];
      for (let month = rule.horizon.min; month <= rule.horizon.max; month++) {
        if (!horizons.some(h => month >= h.minMonths && month <= h.maxMonths)) { issue(`rules.${i}`, "ASSET_HORIZON_NOT_COVERED"); break; }
      }
    }
  });
  unique(data.scenarios.map(s => s.kind), "scenarios");
  for (const kind of ["BASE", "ADVERSE", "FAVORABLE"]) if (!data.scenarios.some(s => s.kind === kind)) issue("scenarios", "THREE_SCENARIOS_REQUIRED");
  data.scenarios.forEach((scenario, i) => {
    unique(scenario.years.map(y => String(y.year)), `scenarios.${i}.years`);
    const checkDirection = (v: string, inflation: boolean) => scenario.kind === "BASE" ? new D(v).isZero()
      : scenario.kind === "ADVERSE" ? (inflation ? new D(v).gte(0) : new D(v).lte(0)) : (inflation ? new D(v).lte(0) : new D(v).gte(0));
    for (let year = assumptions.projectionStartYear; year <= assumptions.projectionEndYear; year++)
      if (!scenario.years.some(y => y.year === year)) issue(`scenarios.${i}.${year}`, "YEAR_REQUIRED");
    for (const year of scenario.years) {
      unique(year.returns.map(r => r.assetClass), `scenarios.${i}.${year.year}`);
      if (year.year < assumptions.projectionStartYear || year.year > assumptions.projectionEndYear) issue(`scenarios.${i}.${year.year}`, "OUTSIDE_PROJECTION");
      if (!checkDirection(year.inflationDeltaPoints, true) || year.returns.some(r => !checkDirection(r.deltaPoints, false))) issue(`scenarios.${i}.${year.year}`, "SCENARIO_DIRECTION_INVALID");
      for (const asset of assets) if (!year.returns.some(r => r.assetClass === asset)) issue(`scenarios.${i}.${year.year}.${asset}`, "ASSET_ADJUSTMENT_REQUIRED");
      if (year.returns.some(r => !assets.has(r.assetClass))) issue(`scenarios.${i}.${year.year}`, "UNKNOWN_ASSET_CLASS");
      const inflation = assumptions.inflation.find(r => r.year === year.year);
      if (inflation && new D(inflation.percent).plus(year.inflationDeltaPoints).lte(-100)) issue(`scenarios.${i}.${year.year}`, "SCENARIO_RATE_OUT_OF_RANGE");
      if (inflation) for (const row of assumptions.returns.filter(r => r.year === year.year)) {
        const rate = normalizedAnnualReturn(row, inflation.percent), delta = year.returns.find(r => r.assetClass === row.assetClass);
        if (rate && delta && rate.mul(100).plus(delta.deltaPoints).lte(-100)) issue(`scenarios.${i}.${year.year}.${row.assetClass}`, "SCENARIO_RATE_OUT_OF_RANGE");
      }
    }
  });
  return { status: issues.length ? "INCOMPLETE" as const : "VALID" as const, issues };
}

export function assessPortfolio(document: PortfolioDocument, command: PortfolioPreview) {
  return assessParsedPortfolio(portfolioDocumentSchema.parse(document), portfolioPreviewSchema.parse(command));
}
function assessParsedPortfolio(data: PortfolioDocument, input: PortfolioPreview) {
  const issues: ConfigurationIssue[] = [];
  const scores = Object.fromEntries(dimensions.map(d => [d, 0])) as Record<typeof dimensions[number], number>;
  const explanations: Array<{ questionId: string; dimension: string; choiceId: string; label: string; score: number }> = [];
  if (new Set(input.answers.map(a => a.questionId)).size !== input.answers.length) issues.push({ path: "answers", code: "DUPLICATE_ANSWER" });
  if (input.answers.some(a => !data.questions.some(q => q.id === a.questionId))) issues.push({ path: "answers", code: "UNKNOWN_QUESTION" });
  for (const question of data.questions) {
    const answer = input.answers.find(a => a.questionId === question.id), choice = question.choices.find(c => c.id === answer?.choiceId);
    if (!choice) { issues.push({ path: `answers.${question.id}`, code: answer ? "UNKNOWN_CHOICE" : "ANSWER_REQUIRED" }); continue; }
    scores[question.dimension] += choice.score;
    explanations.push({ questionId: question.id, dimension: question.dimension, choiceId: choice.id, label: choice.label, score: choice.score });
  }
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const band = data.riskBands.find(b => totalScore >= b.minScore && totalScore <= b.maxScore);
  if (!band) issues.push({ path: "riskBands", code: "RISK_BAND_NOT_COVERED" });
  const checks = data.rules.map(rule => {
    const failed: string[] = [];
    if (issues.some(i => i.path.startsWith("answers"))) failed.push("INCOMPLETE_ANSWERS");
    if (!band || !rule.riskBandIds.includes(band.id)) failed.push("RISK_BAND");
    if (input.horizonMonths < rule.horizon.min || input.horizonMonths > rule.horizon.max) failed.push("HORIZON_MONTHS");
    if (input.liquidityNeedMonths < rule.liquidityNeed.min || input.liquidityNeedMonths > rule.liquidityNeed.max) failed.push("LIQUIDITY_NEED_MONTHS");
    for (const d of dimensions) if (scores[d] < rule.dimensions[d].min || scores[d] > rule.dimensions[d].max) failed.push(d);
    return { ruleId: rule.id, templateId: rule.templateId, matched: !failed.length, failed, explanation: rule.explanation };
  });
  const eligibleIds = [...new Set(checks.filter(c => c.matched).map(c => c.templateId))];
  const selected = input.templateId ? eligibleIds.find(id => id === input.templateId) : eligibleIds.length === 1 ? eligibleIds[0] : undefined;
  // Missing answers fail every rule; that is not a policy coverage gap (which asks an
  // administrator to review the configuration), so report only the answer issues.
  const answersIncomplete = issues.some(i => i.path.startsWith("answers"));
  if (!selected && !(answersIncomplete && !eligibleIds.length))
    issues.push({ path: "templateId", code: !eligibleIds.length ? "POLICY_NOT_COVERED" : input.templateId ? "TEMPLATE_NOT_ELIGIBLE" : "PORTFOLIO_CHOICE_REQUIRED" });
  return { status: issues.length ? "INCOMPLETE" as const : "MATCHED" as const, issues,
    totalScore: issues.some(i => i.path.startsWith("answers")) ? null : totalScore,
    dimensionScores: Object.fromEntries(dimensions.map(d => [d, issues.some(i => i.path.startsWith("answers")) ? null : scores[d]])), riskBandId: issues.some(i => i.path.startsWith("answers")) ? null : band?.id ?? null,
    selectedTemplateId: issues.length ? null : selected!, eligibleTemplateIds: issues.length && issues.some(i => i.path.startsWith("answers")) ? [] : eligibleIds, answers: explanations, checks };
}

/** Reuse across previews of the SAME policy and assumption objects only (one
 * adjustment search). Validation and base series never depend on the retirement
 * month, answers or scenario; the objects must not be mutated while it is alive. */
export type PortfolioPreviewCache = { document?: PortfolioDocument; validation?: ReturnType<typeof validatePortfolioPolicy>; series: Map<string, ReturnType<typeof resolveYearSeries>>;
  /** Whole results by command: the spending search repeats an identical portfolio ~30 times.
   * Callers only read the returned object, so sharing it is safe. */
  results?: Map<string, ReturnType<typeof computePortfolioPreview>> };
export const portfolioPreviewCache = (): PortfolioPreviewCache => ({ series: new Map(), results: new Map() });

/** `only` limits the scenario paths to one kind. Scenarios are independent, so the
 * requested path is identical either way; retirement previews read just one. */
export function previewPortfolio(document: PortfolioDocument, assumptions: AssumptionDocument, command: PortfolioPreview,
  only?: PortfolioDocument["scenarios"][number]["kind"], cache?: PortfolioPreviewCache, planningReaction?: "SELL" | "HOLD" | "BUY_MORE", withGross = false,
  spendingFloor?: SpendingFloorInput): ReturnType<typeof computePortfolioPreview> {
  if (!cache?.results) return computePortfolioPreview(document, assumptions, command, only, cache, planningReaction, withGross, spendingFloor);
  const key = JSON.stringify(spendingFloor ? [command, only ?? null, planningReaction ?? null, withGross, spendingFloor] : [command, only ?? null, planningReaction ?? null, withGross]);
  const hit = cache.results.get(key);
  if (hit) return hit;
  const result = computePortfolioPreview(document, assumptions, command, only, cache, planningReaction, withGross, spendingFloor);
  cache.results.set(key, result);
  return result;
}
function computePortfolioPreview(document: PortfolioDocument, assumptions: AssumptionDocument, command: PortfolioPreview,
  only?: PortfolioDocument["scenarios"][number]["kind"], cache?: PortfolioPreviewCache, planningReaction?: "SELL" | "HOLD" | "BUY_MORE", withGross = false,
  spendingFloor?: SpendingFloorInput) {
  const data = cache?.document ?? portfolioDocumentSchema.parse(document), input = portfolioPreviewSchema.parse(command);
  if (cache) cache.document = data;
  const validation = cache?.validation ?? validatePortfolioPolicy(data, assumptions);
  let assessment = assessParsedPortfolio(data, input);
  if (planningReaction) {
    const templateId = data.schemaVersion === 2 ? data.quickStartTemplates?.[planningReaction] : undefined;
    const template = data.templates.find(row => row.id === templateId);
    const issues = !template ? [{ path: "quickStartTemplates", code: "QUICK_START_POLICY_REQUIRED" }]
      : input.templateId && input.templateId !== template.id ? [{ path: "templateId", code: "PLANNING_TEMPLATE_MISMATCH" }]
      : "coverageMonths" in template && input.horizonMonths > template.coverageMonths ? [{ path: "endMonth", code: "TEMPLATE_HORIZON_NOT_COVERED" }] : [];
    assessment = { ...assessment, status: issues.length ? "INCOMPLETE" : "MATCHED", issues,
      totalScore: null, dimensionScores: Object.fromEntries(dimensions.map(d => [d, null])), riskBandId: null,
      answers: [], checks: [], eligibleTemplateIds: template ? [template.id] : [], selectedTemplateId: issues.length ? null : template!.id };
  }
  if (cache) cache.validation = validation;
  const context = { assessment, ...(planningReaction ? { suitability: "NOT_ASSESSED" as const, planningBasis: "PUBLISHED_REACTION_REFERENCE" as const } : {}), limitations: ["UNIT_PORTFOLIO_WITHOUT_PERSONAL_CASHFLOWS", "INITIAL_ALLOCATION_COST_NOT_MODELED", "NO_TRANSACTIONS_OR_PLAN_APPLICATION"], priceBasis: "NOMINAL", timing: "REBALANCE_START_GROWTH_END" };
  if (validation.status !== "VALID" || assessment.status !== "MATCHED") return { ...context, status: "INCOMPLETE", issues: [...validation.issues, ...assessment.issues], scenarios: [] };
  const template = data.templates.find(t => t.id === assessment.selectedTemplateId)!;
  const floorEnabled = "glidePath" in template && template.glidePath.spendingFloorYears && spendingFloor;
  const floorSafeAssets = new Set(spendingFloor?.safeAssets ?? ["CASH", "GOV_BOND"]);
  const assetCodes = [...new Set(allocationSets(template).flatMap(p => p.filter(a => new D(a.weightPercent).gt(0)
    || (floorEnabled && floorSafeAssets.has(a.assetClass))).map(a => a.assetClass)))];
  const glide = "glidePath" in template ? template : null;
  if (glide && !input.retirementMonth) return { ...context, status: "INCOMPLETE", issues: [{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }], scenarios: [] };
  // v1: indexed period targets. v2: whole-year glide position; a change of
  // position forces a rebalance exactly like a v1 period boundary.
  // glideTargets is pure in (template, years, assetCodes); a projection reads ~12 months per year.
  const glideByYears = new Map<number, ReturnType<typeof glideTargets>>();
  const glideAt = (years: number) => {
    let targets = glideByYears.get(years);
    if (!targets) {
      targets = glideTargets(glide!, years, assetCodes);
      glideByYears.set(years, targets);
    }
    return targets;
  };
  const baseTargetAt = (i: number, month: string) => {
    if (glide) {
      const years = glideYears(glide, month, input.retirementMonth!);
      const previous = i === 0 ? null : glideYears(glide, addMonths(month, -1), input.retirementMonth!);
      return { targets: glideAt(years), boundary: previous !== years };
    }
    const period = (template as Extract<typeof template, { schedule: unknown }>).schedule.find(p => p.fromIndex <= i + 1 && p.toIndex >= i + 1)!;
    return { targets: new Map(assetCodes.map(code => [code, new D(period.allocations.find(a => a.assetClass === code)?.weightPercent ?? "0").div(100)])),
      boundary: period.fromIndex === i + 1 };
  };
  const initialTargets = baseTargetAt(0, input.startMonth).targets;
  const customByBase = new Map<Map<string, InstanceType<typeof D>>, Map<string, InstanceType<typeof D>>>();
  const floorByTargets = new Map<Map<string, InstanceType<typeof D>>, Map<string, InstanceType<typeof D>>>();
  const targetAt = (i: number, month: string) => {
    const base = baseTargetAt(i, month);
    let targets = base.targets;
    if (input.customAllocation) {
      let custom = customByBase.get(base.targets);
      if (!custom) customByBase.set(base.targets, custom = customTargets(input.customAllocation, initialTargets, base.targets));
      targets = custom;
    }
    // Whole-year interpolation reaches zero up to 11 months before retirement.
    // The spending floor begins at the actual month, after the customer's shifts.
    if (floorEnabled && month >= input.retirementMonth!) {
      let lifted = floorByTargets.get(targets);
      if (!lifted) floorByTargets.set(targets, lifted = applySpendingFloorTargets(targets, {
        ...spendingFloor!, bounds: data.schemaVersion === 2 ? data.customization?.bounds : undefined,
      }));
      targets = lifted;
    }
    return { targets, boundary: base.boundary || Boolean(floorEnabled && month === input.retirementMonth) };
  };
  if (input.customAllocation) {
    if (input.customAllocation.weights.some(r=>!assetCodes.includes(r.assetClass)))
      return { ...context,status:"INCOMPLETE",issues:[{path:"customAllocation",code:"CUSTOM_ASSET_NOT_ALLOWED"}],scenarios:[] };
    const checkedTargets = new Set<Map<string, InstanceType<typeof D>>>();
    const firstTargets = targetAt(0, input.startMonth).targets;
    const customIssues = customWeightIssues(input.customAllocation, data.schemaVersion === 2 ? data.customization : undefined, assetCodes, firstTargets);
    if (customIssues.length) return { ...context, status: "INCOMPLETE", issues: customIssues.map(code => ({ path: "customAllocation", code })), scenarios: [] };
    checkedTargets.add(firstTargets);
    for (let i = 1; i < input.horizonMonths; i++) {
      const monthTargets = targetAt(i, addMonths(input.startMonth, i)).targets;
      if (checkedTargets.has(monthTargets)) continue;
      const errors = customWeightIssues(input.customAllocation, data.schemaVersion === 2 ? data.customization : undefined, assetCodes, monthTargets);
      if (errors.length) return { ...context, status: "INCOMPLETE", issues: errors.map(code => ({ path: `customAllocation.${i}`, code })), scenarios: [] };
      checkedTargets.add(monthTargets);
    }
  }
  const endMonth = addMonths(input.startMonth, input.horizonMonths - 1);
  const series = (assetClass: string) => {
    const request = { versionId: data.assumptionVersionId, startMonth: input.startMonth, endMonth, horizonMonths: input.horizonMonths, assetClass };
    const key = JSON.stringify(request), cached = cache?.series.get(key);
    if (cached) return cached;
    const resolved = resolveYearSeries(assumptions, request);
    cache?.series.set(key, resolved);
    return resolved;
  };
  const base = new Map(assetCodes.map(assetClass => [assetClass, series(assetClass)]));
  const issues: ConfigurationIssue[] = [...base.values()].flatMap(r => r.issues);
  if (issues.length) return { ...context, status: "INCOMPLETE", issues, scenarios: [] };
  const scenarios = [];
  for (const scenario of only ? data.scenarios.filter(s => s.kind === only) : data.scenarios) {
    const annual = new Map(scenario.years.map(y => [y.year, y]));
    let weights = new Map(assetCodes.map(c => [c, new D(0)])), unitValue = new D(1);
    const rows = [], factorCache = new Map<string, { growth: InstanceType<typeof D>; inflation: string; annualReturn: string; annualInflation: string }>();
    for (let i = 0; i < input.horizonMonths; i++) {
      const month = addMonths(input.startMonth, i), year = +month.slice(0, 4), changes = annual.get(year)!;
      const { targets, boundary } = targetAt(i, month);
      const rebalance = i === 0 || i % template.rebalance.everyMonths === 0 || boundary;
      const turnover = rebalance && i > 0 ? assetCodes.reduce((sum, code) => sum.plus(targets.get(code)!.minus(weights.get(code)!).abs()), new D(0)).div(2) : new D(0);
      if (rebalance) weights = targets;
      const feeFraction = turnover.mul(template.rebalance.turnoverCostPercent).div(100);
      const holdings = [], nextValues = new Map<string, InstanceType<typeof D>>();
      let grossFactor = new D(0), inflationFactor = "1", inflationPercent = "0";
      for (const code of assetCodes) {
        const row = base.get(code)!.months[i], delta = changes.returns.find(r => r.assetClass === code)!.deltaPoints;
        const key = `${year}:${code}`;
        if (!factorCache.has(key)) {
          const rate = new D(row.returnAnnualNetNominalPercent).plus(delta), inflation = new D(row.inflationAnnualPercent).plus(changes.inflationDeltaPoints);
          if (rate.lte(-100) || inflation.lte(-100)) return { ...context, status: "INCOMPLETE", issues: [{ path: `scenarios.${scenario.kind}.${year}.${code}`, code: "SCENARIO_RATE_OUT_OF_RANGE" }], scenarios: [] };
          factorCache.set(key, { growth: rate.div(1200).plus(1), inflation: inflation.div(1200).plus(1).toFixed(), annualReturn: rate.toFixed(), annualInflation: inflation.toFixed() });
        }
        const factors = factorCache.get(key)!;
        const value = weights.get(code)!.mul(factors.growth); nextValues.set(code, value); grossFactor = grossFactor.plus(value);
        inflationFactor = factors.inflation; inflationPercent = factors.annualInflation;
        holdings.push({ assetClass: code, startWeightPercent: weights.get(code)!.mul(100).toFixed(), annualNetNominalReturnPercent: factors.annualReturn, returnDeltaPoints: delta });
      }
      const netFactor = grossFactor.mul(new D(1).minus(feeFraction)); unitValue = unitValue.mul(netFactor);
      weights = new Map(assetCodes.map(code => [code, nextValues.get(code)!.div(grossFactor)]));
      rows.push({ month, rebalanced: rebalance, turnoverFraction: turnover.toFixed(), rebalanceCostFraction: feeFraction.toFixed(),
        returnMonthlyFactor: netFactor.toFixed(), inflationMonthlyFactor: inflationFactor, inflationAnnualPercent: inflationPercent,
        inflationDeltaPoints: changes.inflationDeltaPoints, unitValue: unitValue.toFixed(), holdings,
        ...(withGross ? { grossReturnMonthlyFactor: grossFactor.toFixed() } : {}) });
    }
    scenarios.push({ kind: scenario.kind, label: scenario.label, evidence: scenario.evidence, changes: scenario.years,
      rows, endingUnitValue: unitValue.toFixed() });
  }
  return { ...context, status: "READY", issues: [], scenarios };
}
