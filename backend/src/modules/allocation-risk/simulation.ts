import { setImmediate } from "node:timers/promises";
import { projectRetirement, RetirementDecimal as D, type ProjectionInput, type MonthlyInput } from "../retirement/engine";
import { applyAdvisoryFee } from "../retirement/advisory-fee";
import type { RetirementPreview } from "../retirement/schema";
import type { MarketDocument } from "./market-schema";
import type { RiskPolicy } from "./policy";
import { validWeights, type Allocation } from "./rebalance";

export const SIMULATION_MODEL = "allocation-risk-v1";
export const SEED = 20261016;
export const LIMITS = { maxPaths: 500, maxPathMonths: 200000, maxRuntimeMs: 10000 } as const;
export type RiskContext = {
  projection: ProjectionInput;
  selection: RetirementPreview;
  essentialExpenses: string[];
  targets: Allocation[][];
  rebalance: boolean[];
  turnoverCostPercent: string;
};
export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Moving (non-circular) blocks: one index addresses the entire asset+CPI row. */
export function bootstrapIndices(length: number, horizon: number, block: number, random: () => number) {
  if (block < 12 || block > 36 || length < block) throw new RangeError("Insufficient contiguous history for block");
  const indices: number[] = [];
  while (indices.length < horizon) {
    const start = Math.floor(random() * (length - block + 1));
    for (let j = 0; j < block && indices.length < horizon; j++) indices.push(start + j);
  }
  return indices;
}
export function wilson(successes: number, n: number) {
  if (!Number.isInteger(n) || n < 1 || successes < 0 || successes > n) throw new RangeError("Invalid binomial sample");
  const z = 1.959963984540054, p = successes / n, denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { confidence: 0.95, lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}
/** Exact empirical expected shortfall, including fractional mass at VaR:
 * min_eta [eta + sum(max(L-eta,0))/((1-alpha)*N)]. */
export function cvar(losses: string[], alpha: string) {
  const a = new D(alpha);
  if (!losses.length || a.lte(0) || a.gte(1)) throw new RangeError("Invalid CVaR sample/alpha");
  const sorted = losses.map(v => new D(v)).sort((a, b) => a.cmp(b));
  if (sorted.some(v => !v.isFinite() || v.lt(0))) throw new RangeError("Losses must be nonnegative");
  const eta = sorted[Math.max(0, Math.ceil(a.mul(sorted.length).toNumber()) - 1)];
  return eta.plus(sorted.reduce((s, l) => s.plus(D.max(0, l.minus(eta))), new D(0)).div(new D(1).minus(a).mul(sorted.length))).toFixed();
}
const moneyDisplay = (v: string) => new D(v).div(1000000).toDecimalPlaces(0).mul(1000000).toFixed();
const probabilityDisplay = (v: number) => Math.round(v * 100);
export function quantile(values: string[], q: number) {
  const sorted = values.map(v => new D(v)).sort((a, b) => a.cmp(b)), at = (sorted.length - 1) * q, low = Math.floor(at);
  return sorted[low].plus(sorted[Math.ceil(at)].minus(sorted[low]).mul(at - low)).toFixed();
}
export type PathMarket = { returns: Record<string, string>; cpi: string };
export function portfolioFactors(context: RiskContext, market: PathMarket[]) {
  let weights = new Map<string, InstanceType<typeof D>>();
  return market.map((row, i) => {
    const targets = context.targets[i];
    if (!validWeights(targets) || targets.some(t => row.returns[t.assetClass] === undefined)) throw new RangeError("Missing asset or invalid allocation");
    const rebalance = i === 0 || context.rebalance[i];
    const turnover = i && rebalance ? targets.reduce((s, t) => s.plus(new D(t.weightPercent).div(100).minus(weights.get(t.assetClass) ?? 0).abs()), new D(0)).div(2) : new D(0);
    if (rebalance) weights = new Map(targets.map(t => [t.assetClass, new D(t.weightPercent).div(100)]));
    const values = [...weights].map(([code, w]) => [code, w.mul(new D(row.returns[code]).plus(1))] as const);
    const gross = values.reduce((s, [, v]) => s.plus(v), new D(0));
    if (gross.lte(0)) throw new RangeError("Nonpositive portfolio factor");
    weights = new Map(values.map(([code, v]) => [code, v.div(gross)]));
    return gross.mul(new D(1).minus(turnover.mul(context.turnoverCostPercent).div(100))).toFixed();
  });
}
/** Rebuild household budget from pinned nominal flows. Only retirement living
 * expense is CPI-indexed, matching prepareRetirement. Fees are re-evaluated. */
export function runPath(context: RiskContext, market: PathMarket[], transformed?: MonthlyInput[]) {
  const base = transformed ?? context.projection.rows;
  const growth = portfolioFactors(context, market);
  let price = new D(1), basePrice = new D(1);
  const prices: string[] = [], essentials: string[] = [];
  const rows = base.map((original, i) => {
    const retired = original.month >= context.projection.retirementMonth;
    const originalLiving = new D(context.projection.rows[i].livingExpense);
    const living = retired ? new D(original.livingExpense).div(basePrice).mul(price) : new D(original.livingExpense);
    essentials.push(new D(context.essentialExpenses[i]).minus(retired ? originalLiving : 0).plus(retired ? living : 0).toFixed());
    prices.push(price.toFixed());
    const remaining = new D(original.income).plus(original.pension).minus(living).minus(original.additionalExpense).minus(original.debtPayment);
    const capacity = D.max(0, remaining);
    const startFunding = context.selection.startOfMonthFunding;
    const allowed = !retired && context.projection.contributionTiming === "START_OF_MONTH"
      ? original.month < (context.projection.contributionStartMonth ?? context.projection.valuationDate.slice(0, 7)) ? new D(0)
        : D.min(capacity, startFunding?.schedule.find(r => r.month === original.month)?.amount ?? startFunding?.monthlyAvailable ?? "0") : capacity;
    const contribution = D.min(allowed, original.plannedContribution);
    basePrice = basePrice.mul(context.projection.rows[i].inflationFactor);
    price = price.mul(new D(market[i].cpi).plus(1));
    return { ...original, growthFactor: growth[i], inflationFactor: new D(market[i].cpi).plus(1).toFixed(), livingExpense: living.toFixed(),
      contributionCapacity: allowed.toFixed(), contribution: contribution.toFixed(), withdrawal: D.max(0, remaining.neg()).toFixed(), uninvestedSurplus: capacity.minus(contribution).toFixed() };
  });
  const result = projectRetirement({ ...context.projection, modelVersion: "retirement-monthly-v3",
    rows: applyAdvisoryFee(rows, context.projection.initialCapital, context.projection.retirementMonth, context.selection) });
  let loss = new D(0);
  const balances = result.rows.map((r, i) => {
    const availableFund = new D(r.fundedClosingBalance).plus(r.withdrawal).minus(r.unfundedWithdrawal);
    const unmet = D.min(r.unfundedWithdrawal, D.max(0, new D(essentials[i]).minus(r.income).minus(r.pension).minus(availableFund)));
    loss = loss.plus(unmet.div(prices[i]));
    return new D(r.fundedClosingBalance).div(prices[i]).toFixed();
  });
  return { essentialLossToday: loss.toFixed(), funded: loss.isZero(), balances,
    unfundedWithdrawals: result.summary.unfundedWithdrawals, fundedTerminalBalance: result.summary.fundedTerminalBalance };
}
export function marketRows(data: MarketDocument): PathMarket[] {
  return data.rows.map(row => ({ cpi: row.cpi, returns: Object.fromEntries(data.assets.map(a => [a.assetClass,
    new D(row.returns[a.assetClass]).minus(a.fees.treatment === "GROSS" ? a.fees.monthlyDrag : 0).toFixed()])) }));
}
export async function simulate(context: RiskContext, data: MarketDocument | null, policy: RiskPolicy | undefined, paths: number,
  deadline = performance.now() + LIMITS.maxRuntimeMs) {
  if (!data) return { status: "DATA_REQUIRED" as const, issues: ["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"] };
  if (!policy?.blockMonths || !policy.cvarAlpha) return { status: "REVIEW_REQUIRED" as const, issues: ["APPROVED_BLOCK_AND_ALPHA_REQUIRED"] };
  if (data.rows.length < policy.blockMonths || context.targets.some(ts => ts.some(t => !data.assets.some(a => a.assetClass === t.assetClass))))
    return { status: "DATA_REQUIRED" as const, issues: ["HISTORY_OR_ASSET_COVERAGE_REQUIRED"] };
  if (!Number.isInteger(paths) || paths < 1 || paths > LIMITS.maxPaths || paths * context.projection.rows.length > LIMITS.maxPathMonths)
    return { status: "LIMIT_EXCEEDED" as const, issues: ["PATH_MONTH_LIMIT"], limits: LIMITS };
  const random = randomGenerator(SEED), history = marketRows(data), losses: string[] = [], bands = context.projection.rows.map(() => [] as string[]);
  let successes = 0;
  for (let path = 0; path < paths; path++) {
    if (performance.now() >= deadline) return { status: "LIMIT_EXCEEDED" as const, issues: ["RUNTIME_LIMIT_NO_PARTIAL_ESTIMATE"], limits: LIMITS };
    const indices = bootstrapIndices(history.length, bands.length, policy.blockMonths, random);
    const result = runPath(context, indices.map(i => history[i]));
    losses.push(result.essentialLossToday); if (result.funded) successes++;
    result.balances.forEach((v, i) => bands[i].push(v));
    await setImmediate();
  }
  if (performance.now() >= deadline) return { status: "LIMIT_EXCEEDED" as const, issues: ["RUNTIME_LIMIT_NO_PARTIAL_ESTIMATE"], limits: LIMITS };
  const interval = wilson(successes, paths), risk = cvar(losses, policy.cvarAlpha);
  return { status: "READY" as const, modelCode: SIMULATION_MODEL, seed: SEED, paths, blockMonths: policy.blockMonths,
    pEssential: successes / paths, wilson: interval, cvarAlpha: policy.cvarAlpha, cvarEssentialShortfallToday: risk,
    display: { pEssentialPercent: probabilityDisplay(successes / paths), wilsonLowerPercent: probabilityDisplay(interval.lower), wilsonUpperPercent: probabilityDisplay(interval.upper), cvarVnd: moneyDisplay(risk) },
    bands: bands.map((values, i) => ({ month: context.projection.rows[i].month, p10: moneyDisplay(quantile(values, .1)), p50: moneyDisplay(quantile(values, .5)), p90: moneyDisplay(quantile(values, .9)) })),
    disclosure: { period: data.period, sources: data.sources, currency: data.currency, bandBasis: "FUNDED_BALANCE_TODAY_VND", moneyRounding: "VND_1000000", probabilityRounding: "WHOLE_PERCENT", historyMonths: data.rows.length,
      limitations: ["HISTORICAL_BOOTSTRAP_NOT_FORECAST_OR_GUARANTEE", "WILSON_MEASURES_MONTE_CARLO_ERROR_NOT_MODEL_RISK", "FIXED_NOMINAL_DECLARED_FLOWS_EXCEPT_RETIREMENT_LIVING", "INITIAL_ALLOCATION_COST_NOT_MODELED"] } };
}
