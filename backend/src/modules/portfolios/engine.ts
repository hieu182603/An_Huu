import { addMonths } from "../../common/calendar";
import type { AssumptionDocument } from "../assumptions/schema";
import { AssumptionDecimal as D, validateConfiguration, resolveYearSeries, normalizedAnnualReturn, type ConfigurationIssue } from "../assumptions/series";
import { dimensions, portfolioDocumentSchema, portfolioPreviewSchema, type PortfolioDocument, type PortfolioPreview, type PortfolioTemplate } from "./schema";

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
  const data = portfolioDocumentSchema.parse(document), input = portfolioPreviewSchema.parse(command);
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
  if (!selected) issues.push({ path: "templateId", code: !eligibleIds.length ? "POLICY_NOT_COVERED" : input.templateId ? "TEMPLATE_NOT_ELIGIBLE" : "PORTFOLIO_CHOICE_REQUIRED" });
  return { status: issues.length ? "INCOMPLETE" as const : "MATCHED" as const, issues,
    totalScore: issues.some(i => i.path.startsWith("answers")) ? null : totalScore,
    dimensionScores: Object.fromEntries(dimensions.map(d => [d, issues.some(i => i.path.startsWith("answers")) ? null : scores[d]])), riskBandId: issues.some(i => i.path.startsWith("answers")) ? null : band?.id ?? null,
    selectedTemplateId: issues.length ? null : selected!, eligibleTemplateIds: issues.length && issues.some(i => i.path.startsWith("answers")) ? [] : eligibleIds, answers: explanations, checks };
}

export function previewPortfolio(document: PortfolioDocument, assumptions: AssumptionDocument, command: PortfolioPreview) {
  const data = portfolioDocumentSchema.parse(document), input = portfolioPreviewSchema.parse(command);
  const validation = validatePortfolioPolicy(data, assumptions), assessment = assessPortfolio(data, input);
  const context = { assessment, limitations: ["UNIT_PORTFOLIO_WITHOUT_PERSONAL_CASHFLOWS", "INITIAL_ALLOCATION_COST_NOT_MODELED", "NO_TRANSACTIONS_OR_PLAN_APPLICATION"], priceBasis: "NOMINAL", timing: "REBALANCE_START_GROWTH_END" };
  if (validation.status !== "VALID" || assessment.status !== "MATCHED") return { ...context, status: "INCOMPLETE", issues: [...validation.issues, ...assessment.issues], scenarios: [] };
  const template = data.templates.find(t => t.id === assessment.selectedTemplateId)!;
  const assetCodes = [...new Set(allocationSets(template).flatMap(p => p.filter(a => new D(a.weightPercent).gt(0)).map(a => a.assetClass)))];
  const glide = "glidePath" in template ? template : null;
  if (glide && !input.retirementMonth) return { ...context, status: "INCOMPLETE", issues: [{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }], scenarios: [] };
  // v1: indexed period targets. v2: whole-year glide position; a change of
  // position forces a rebalance exactly like a v1 period boundary.
  const targetAt = (i: number, month: string) => {
    if (glide) {
      const years = glideYears(glide, month, input.retirementMonth!);
      const previous = i === 0 ? null : glideYears(glide, addMonths(month, -1), input.retirementMonth!);
      return { targets: glideTargets(glide, years, assetCodes), boundary: previous !== years };
    }
    const period = (template as Extract<typeof template, { schedule: unknown }>).schedule.find(p => p.fromIndex <= i + 1 && p.toIndex >= i + 1)!;
    return { targets: new Map(assetCodes.map(code => [code, new D(period.allocations.find(a => a.assetClass === code)?.weightPercent ?? "0").div(100)])),
      boundary: period.fromIndex === i + 1 };
  };
  const endMonth = addMonths(input.startMonth, input.horizonMonths - 1);
  const base = new Map(assetCodes.map(assetClass => [assetClass, resolveYearSeries(assumptions, { versionId: data.assumptionVersionId,
    startMonth: input.startMonth, endMonth, horizonMonths: input.horizonMonths, assetClass })]));
  const issues: ConfigurationIssue[] = [...base.values()].flatMap(r => r.issues);
  if (issues.length) return { ...context, status: "INCOMPLETE", issues, scenarios: [] };
  const scenarios = [];
  for (const scenario of data.scenarios) {
    const annual = new Map(scenario.years.map(y => [y.year, y]));
    let weights = new Map(assetCodes.map(c => [c, new D(0)])), unitValue = new D(1);
    const rows = [], factorCache = new Map<string, { growth: InstanceType<typeof D>; inflation: InstanceType<typeof D>; annualReturn: string; annualInflation: string }>();
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
          factorCache.set(key, { growth: rate.div(100).plus(1).pow(new D(1).div(12)), inflation: inflation.div(100).plus(1).pow(new D(1).div(12)), annualReturn: rate.toFixed(), annualInflation: inflation.toFixed() });
        }
        const factors = factorCache.get(key)!;
        const value = weights.get(code)!.mul(factors.growth); nextValues.set(code, value); grossFactor = grossFactor.plus(value);
        inflationFactor = factors.inflation.toFixed(); inflationPercent = factors.annualInflation;
        holdings.push({ assetClass: code, startWeightPercent: weights.get(code)!.mul(100).toFixed(), annualNetNominalReturnPercent: factors.annualReturn, returnDeltaPoints: delta });
      }
      const netFactor = grossFactor.mul(new D(1).minus(feeFraction)); unitValue = unitValue.mul(netFactor);
      weights = new Map(assetCodes.map(code => [code, nextValues.get(code)!.div(grossFactor)]));
      rows.push({ month, rebalanced: rebalance, turnoverFraction: turnover.toFixed(), rebalanceCostFraction: feeFraction.toFixed(),
        returnMonthlyFactor: netFactor.toFixed(), inflationMonthlyFactor: inflationFactor, inflationAnnualPercent: inflationPercent,
        inflationDeltaPoints: changes.inflationDeltaPoints, unitValue: unitValue.toFixed(), holdings });
    }
    scenarios.push({ kind: scenario.kind, label: scenario.label, evidence: scenario.evidence, changes: scenario.years,
      rows, endingUnitValue: unitValue.toFixed() });
  }
  return { ...context, status: "READY", issues: [], scenarios };
}
