import { setImmediate } from "node:timers/promises";
import { projectRetirement, RetirementDecimal as D, type ProjectionInput, type MonthlyInput } from "../retirement/engine";
import { applyAdvisoryFee } from "../retirement/advisory-fee";
import { projectRetirementV5, type V5MonthHook } from "../retirement/engine-v5";
import type { RetirementPreview } from "../retirement/schema";
import type { MarketDocument } from "./market-schema";
import { marketDataDisclosureLimitations } from "./market-service";
import type { RiskPolicy } from "./policy";
import { validWeights, type Allocation } from "./rebalance";
import { protectCashflows } from "../retirement/protected-capital";
import { appendRecord, getCacheEntry, simulationCacheKey, type PathRecord } from "./simulation-cache";
import { openSimulationSession, runParallel } from "./simulation-pool";
import { contributionFirstHookFast, portfolioLegsFast, runPathV5Fast } from "./simulation-kernel";

export const SIMULATION_MODEL = "allocation-risk-v1";
export const SEED = 20261016;
/** maxPathMonths is a per-candidate sanity cap (paths x months) that bounds cache memory (~4 bytes per path-month);
 * compute per request is bounded by maxRuntimeMs and unfinished work is kept by the progressive cache. */
export const LIMITS = { maxPaths: 1000, maxPathMonths: 1300000, maxRuntimeMs: 10000 } as const;
/** Customer-selectable path counts; every one reuses all paths already computed for the same inputs. */
export const PATH_MILESTONES = [20, 50, 100, 200, 500, 1000] as const;
export type RiskContext = {
  projection: ProjectionInput;
  selection: RetirementPreview;
  essentialExpenses: string[];
  targets: Allocation[][];
  rebalance: boolean[];
  turnoverCostPercent: string;
  allGoalsCovered?: boolean;
  /** Approved minimum safe share, already clamped to the policy bounds. Enforced from the
   * retirement month even when the required correction is smaller than the drift band. */
  spendingFloor?: { safeAssets: string[]; minSafeFraction: string };
  /** Approved tolerance band (percentage points). When set, simulated holdings are rebalanced only when a
   * weight drifts beyond it (spec §8.2, same trigger as proposeRebalance); otherwise `rebalance` (the
   * deterministic calendar) is used. */
  rebalanceBandPoints?: string | null;
};
/** Same trigger as proposeRebalance (spec §8.2): some asset's absolute drift from target is at least the band (>=). */
const parsedTargets = new WeakMap<Allocation[], Map<string, InstanceType<typeof D>>>(), parsedBands = new Map<string, InstanceType<typeof D>>();
export function bandTriggered(weights: Map<string, InstanceType<typeof D>>, targets: Allocation[], bandPoints: string) {
  // Targets and band are the same on every simulated path: parse them once.
  let target = parsedTargets.get(targets);
  if (!target) parsedTargets.set(targets, target = new Map(targets.map(t => [t.assetClass, new D(t.weightPercent)])));
  let band = parsedBands.get(bandPoints);
  if (!band) parsedBands.set(bandPoints, band = new D(bandPoints));
  const zero = new D(0);
  for (const [code, percent] of target) if (percent.minus((weights.get(code) ?? zero).mul(100)).abs().gte(band)) return true;
  for (const [code, weight] of weights) if (!target.has(code) && zero.minus(weight.mul(100)).abs().gte(band)) return true;
  return false;
}
export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  const next = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  /** The whole generator state is one uint32: reading/restoring it continues the exact same sequence. */
  return Object.assign(next, { getState: () => state, setState: (value: number) => { state = value >>> 0; } });
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
const isV5 = (context: RiskContext) => context.projection.modelVersion === "retirement-monthly-v5";
/** v3: growth factor with trading cost folded in (gross x (1 - turnover x cost)). v5: gross factor; the cost is
 * charged after the withdrawal by the engine through tradingCostRate (see portfolioCosts). */
export function portfolioFactors(context: RiskContext, market: PathMarket[]) {
  const v5 = isV5(context);
  return portfolioLegsFast(context, market, !v5).map(l => (v5 ? l.gross : l.net!).toFixed());
}
/** Per-month trading cost rate as a fraction of the post-withdrawal balance (turnover x cost% / 100). */
export function portfolioCosts(context: RiskContext, market: PathMarket[]) {
  return portfolioLegsFast(context, market, false).map(l => l.cost.toFixed());
}
/** Contribution-first rebalancing (spec 8.2) for v5 contexts with an approved band. Holds money per asset:
 *   1. withdrawal leaves pro-rata to current holdings (the part above holdings comes out of the start deposit);
 *   2. deposits (start of month, and at month end incl. capital injection) go to the deficits of the target at the new
 *      total, proportionally to the deficits (same cash step as proposeRebalance);
 *   3. only if some weight is still outside the band, trade to target: cost = half-L1 of the remaining trades x cost%.
 * Returns the v5 kernel hook: gross factor = sum w(1+r) over the post-trade weights, tradingCostRate = cost / x. */
export function contributionFirstHook(context: RiskContext, market: PathMarket[]): V5MonthHook {
  return contributionFirstHookFast(context, market);
}
/** Rebuild household budget from pinned nominal flows. Only retirement living
 * expense is CPI-indexed, matching prepareRetirement. Fees are re-evaluated.
 * v5 without an advisory fee (the fee depends on the path) runs the funded-ledger kernel on Decimal rows (simulation-kernel.ts);
 * v3 (saved plans) and the fee case keep the full frozen kernel on string rows. Both return identical values. */
export function runPath(context: RiskContext, market: PathMarket[], transformed?: MonthlyInput[]) {
  return isV5(context) && !context.selection.advisoryFee
    ? runPathV5Fast(context, market, transformed ?? context.projection.protection?.rawRows ?? context.projection.rows,
      context.rebalanceBandPoints !== undefined && context.rebalanceBandPoints !== null) : runPathFrozen(context, market, transformed);
}
function runPathFrozen(context: RiskContext, market: PathMarket[], transformed?: MonthlyInput[]) {
  const base = transformed ?? context.projection.protection?.rawRows ?? context.projection.rows;
  const v5 = isV5(context), hooked = v5 && context.rebalanceBandPoints !== undefined && context.rebalanceBandPoints !== null;
  const growth = hooked ? [] : portfolioFactors(context, market), costs = v5 && !hooked ? portfolioCosts(context, market) : [];
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
    return { ...original, growthFactor: hooked ? "1" : growth[i], ...(v5 ? { tradingCostRate: hooked ? "0" : costs[i] } : {}), inflationFactor: new D(market[i].cpi).plus(1).toFixed(), livingExpense: living.toFixed(),
      contributionCapacity: allowed.toFixed(), contribution: contribution.toFixed(), withdrawal: D.max(0, remaining.neg()).toFixed(), uninvestedSurplus: capacity.minus(contribution).toFixed() };
  });
  const protection=context.projection.protection;
  const protectedRows=protection?protectCashflows(rows,{...protection,depositFactors:market.map(m=>{
    if(m.returns[protection.depositAssetClass]===undefined)throw new RangeError("Protected deposit market data required");
    return new D(m.returns[protection.depositAssetClass]).plus(1).toFixed();
  }),goals:protection.goals.map(g=>({...g,...(g.depositAssetClass?{depositFactors:market.map(m=>{
    if(m.returns[g.depositAssetClass!]===undefined)throw new RangeError("Protected goal deposit market data required");
    return new D(m.returns[g.depositAssetClass!]).plus(1).toFixed();
  })}:{})}))}):rows;
  const projectionInput = { ...context.projection, modelVersion: v5 ? "retirement-monthly-v5" : "retirement-monthly-v3",
    rows: applyAdvisoryFee(protectedRows, context.projection.initialCapital, context.projection.retirementMonth, context.selection, v5) } as ProjectionInput;
  // v5 + band: holdings in money per asset, deposits directed to deficits before any trade (hook); otherwise precomputed factors.
  const result = hooked ? projectRetirementV5(projectionInput, contributionFirstHook(context, market)) as unknown as ReturnType<typeof projectRetirement>
    : projectRetirement(projectionInput);
  let loss = new D(0);
  const balances = result.rows.map((r, i) => {
    const protectedRow=protection?protectedRows[i] as ReturnType<typeof protectCashflows>[number]:null;
    // v3: back-solve the fund available at the end-of-month withdrawal; v5: the engine reports the fund available at the start.
    const availableFund = (v5 ? new D((r as typeof r & { fundedAvailableAtStart: string }).fundedAvailableAtStart)
      : new D(r.fundedClosingBalance).plus(r.withdrawal).minus(r.unfundedWithdrawal))
      .plus(protectedRow?.protectedHouseholdPaid??0).plus(protectedRow?.protectedEssentialGoalPaid??0);
    const unmet = D.min(r.unfundedWithdrawal, D.max(0, new D(essentials[i]).plus(protectedRow?.essentialGoalExpense??0).minus(r.income).minus(r.pension).minus(availableFund)));
    loss = loss.plus(unmet.div(prices[i]));
    return new D(r.fundedClosingBalance).div(prices[i]).toFixed();
  });
  return { essentialLossToday: loss.toFixed(), funded: loss.isZero(), balances,
    firstShortfallMonth: result.rows.find(r => new D(r.unfundedWithdrawal).gt(0))?.month ?? null,
    unfundedWithdrawals: result.summary.unfundedWithdrawals, fundedTerminalBalance: result.summary.fundedTerminalBalance };
}
export function marketRows(data: MarketDocument): PathMarket[] {
  return data.rows.map(row => ({ cpi: row.cpi, returns: Object.fromEntries(data.assets.map(a => [a.assetClass,
    new D(row.returns[a.assetClass]).minus(a.fees.treatment === "GROSS" ? a.fees.monthlyDrag : 0).toFixed()])) }));
}
const marketHashes = new WeakMap<MarketDocument, string>();
const marketHash = (data: MarketDocument) => {
  let hash = marketHashes.get(data);
  if (!hash) marketHashes.set(data, hash = simulationCacheKey({ assets: data.assets, rows: data.rows }));
  return hash;
};
/** Quantile of an ascending Float64Array with the same linear interpolation as quantile(). */
function quantileSorted(sorted: Float64Array, q: number) {
  const at = (sorted.length - 1) * q, low = Math.floor(at);
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
}
/** Display band value: Float32-derived number rounded to 1,000,000 VND (same rounding as moneyDisplay). */
const bandDisplay = (value: number) => { const text = moneyDisplay(String(value + 0)); return text === "-0" ? "0" : text; };
/** The record the cache stores for one path (shared by the inline loop and the worker threads). */
export function computePathRecord(context: RiskContext, market: PathMarket[]): PathRecord {
  const result = runPath(context, market);
  return { funded: result.funded,
    allFunded: result.funded && new D(result.unfundedWithdrawals).isZero() && new D(result.fundedTerminalBalance).gte(context.projection.terminalBalance),
    essentialLossToday: result.essentialLossToday, balances: Float32Array.from(result.balances, Number) };
}
export async function simulate(context: RiskContext, data: MarketDocument | null, policy: RiskPolicy | undefined, paths: number,
  deadline = performance.now() + LIMITS.maxRuntimeMs, detail?: "ALLOCATION_V2", signal?: AbortSignal) {
  if (!data) return { status: "DATA_REQUIRED" as const, issues: ["PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED"] };
  if (!policy?.blockMonths || !policy.cvarAlpha) return { status: "REVIEW_REQUIRED" as const, issues: ["APPROVED_BLOCK_AND_ALPHA_REQUIRED"] };
  if (data.rows.length < policy.blockMonths || context.targets.some(ts => ts.some(t => !data.assets.some(a => a.assetClass === t.assetClass)))
    || (context.projection.protection && (!data.assets.some(a => a.assetClass === context.projection.protection!.depositAssetClass)
      ||context.projection.protection.goals.some(g=>g.depositAssetClass&&!data.assets.some(a=>a.assetClass===g.depositAssetClass)))))
    return { status: "DATA_REQUIRED" as const, issues: ["HISTORY_OR_ASSET_COVERAGE_REQUIRED"] };
  if (!Number.isInteger(paths) || paths < 1 || paths > LIMITS.maxPaths || paths * context.projection.rows.length > LIMITS.maxPathMonths)
    return { status: "LIMIT_EXCEEDED" as const, issues: ["PATH_MONTH_LIMIT"], limits: LIMITS };
  const history = marketRows(data), months = context.projection.rows.length;
  // Everything that can change a path record; N (paths) is deliberately not part of the key.
  const entry = getCacheEntry(simulationCacheKey({ model: SIMULATION_MODEL, seed: SEED, detail: detail ?? null, blockMonths: policy.blockMonths, cvarAlpha: policy.cvarAlpha,
    projection: context.projection, selection: context.selection, essentialExpenses: context.essentialExpenses, targets: context.targets, rebalance: context.rebalance,
    turnoverCostPercent: context.turnoverCostPercent, rebalanceBandPoints: context.rebalanceBandPoints ?? null, allGoalsCovered: context.allGoalsCovered ?? null,
    ...(context.spendingFloor ? { spendingFloor: context.spendingFloor } : {}), market: marketHash(data) }));
  // Missing paths run on the worker pool when one is configured (SIM_WORKERS): indices are still drawn here, in path order,
  // and records are committed in path order. The loop below stays the reference implementation and the fallback.
  const session = paths - entry.records.length >= 2 ? openSimulationSession({ context, history }) : null;
  if (session) {
    const random = randomGenerator(SEED);
    if (entry.rngState !== null) random.setState(entry.rngState);
    const outcome = await runParallel(session, { start: entry.records.length, end: paths, deadline, signal,
      draw: () => ({ indices: bootstrapIndices(history.length, months, policy.blockMonths!, random), state: random.getState() }),
      compute: indices => computePathRecord(context, indices.map(i => history[i])),
      commit: (index, record, state) => { if (index === entry.records.length) appendRecord(entry, record, state); } });
    if (outcome === "ABORTED") return { status: "LIMIT_EXCEEDED" as const, issues: ["SIMULATION_ABORTED"], limits: LIMITS };
    if (outcome === "DEADLINE") return { status: "LIMIT_EXCEEDED" as const, issues: ["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"], limits: LIMITS,
      progress: { pathsCompleted: entry.records.length, pathsRequested: paths } };
  }
  for (let path = 0; path < paths; path++) {
    // Another run (or an earlier request) may already have computed this path: reuse it unchanged.
    if (path < entry.records.length) continue;
    if (signal?.aborted) return { status: "LIMIT_EXCEEDED" as const, issues: ["SIMULATION_ABORTED"], limits: LIMITS };
    if (performance.now() >= deadline) return { status: "LIMIT_EXCEEDED" as const, issues: ["RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED"], limits: LIMITS,
      progress: { pathsCompleted: entry.records.length, pathsRequested: paths } };
    // Path k draws a fixed number of randoms, so continuing from the saved state reproduces the one-shot sequence.
    const random = randomGenerator(SEED);
    if (entry.rngState !== null) random.setState(entry.rngState);
    const indices = bootstrapIndices(history.length, months, policy.blockMonths, random);
    const record = computePathRecord(context, indices.map(i => history[i]));
    // No awaits between here and the append: check-and-append stays atomic for concurrent runs.
    appendRecord(entry, record, random.getState());
    await setImmediate();
  }
  if (signal?.aborted) return { status: "LIMIT_EXCEEDED" as const, issues: ["SIMULATION_ABORTED"], limits: LIMITS };
  // Results always come from the first N records, whether they were computed now or in earlier requests.
  const used = entry.records.slice(0, paths);
  const successes = used.filter(r => r.funded).length, allSuccesses = used.filter(r => r.allFunded).length;
  const interval = wilson(successes, paths), risk = cvar(used.map(r => r.essentialLossToday), policy.cvarAlpha);
  // Bands are display-only (rounded to 1,000,000 VND): quantiles come from the Float32 balances for fresh and
  // cached paths alike, so one-shot and incremental runs print identical bands.
  const column = new Float64Array(paths);
  const bands = context.projection.rows.map((row, i) => {
    for (let k = 0; k < paths; k++) column[k] = used[k].balances[i];
    column.sort();
    return { month: row.month, p10: bandDisplay(quantileSorted(column, .1)), p50: bandDisplay(quantileSorted(column, .5)), p90: bandDisplay(quantileSorted(column, .9)) };
  });
  return { status: "READY" as const, modelCode: SIMULATION_MODEL, seed: SEED, paths, blockMonths: policy.blockMonths,
    ...(detail ? { modelCode: "allocation-risk-v2", allGoalsStatus: context.allGoalsCovered ? "READY" as const : "REVIEW_REQUIRED" as const,
      pAll: context.allGoalsCovered ? allSuccesses / paths : null,
      allGoalsIssue: context.allGoalsCovered ? null : "CLASSIFIED_GOAL_CASHFLOWS_REQUIRED" } : {}),
    pEssential: successes / paths, wilson: interval, cvarAlpha: policy.cvarAlpha, cvarEssentialShortfallToday: risk,
    display: { pEssentialPercent: probabilityDisplay(successes / paths), wilsonLowerPercent: probabilityDisplay(interval.lower), wilsonUpperPercent: probabilityDisplay(interval.upper), cvarVnd: moneyDisplay(risk) },
    bands,
    disclosure: { period: data.period, sources: data.sources, currency: data.currency, bandBasis: "FUNDED_BALANCE_TODAY_VND", moneyRounding: "VND_1000000", probabilityRounding: "WHOLE_PERCENT", historyMonths: data.rows.length,
      limitations: ["HISTORICAL_BOOTSTRAP_NOT_FORECAST_OR_GUARANTEE", "BOOTSTRAP_USES_HISTORICAL_MEAN", ...marketDataDisclosureLimitations(data), "WILSON_MEASURES_MONTE_CARLO_ERROR_NOT_MODEL_RISK", "FIXED_NOMINAL_DECLARED_FLOWS_EXCEPT_RETIREMENT_LIVING", "INITIAL_ALLOCATION_COST_NOT_MODELED"] } };
}
