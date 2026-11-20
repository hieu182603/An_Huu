import { solveContinuousOptimization, checkPortfolioFeasibility, type ContinuousOptimizationInput } from "./optimizer";
import type { MarketDocument } from "./market-schema";
import type { RiskPolicy } from "./policy";
import { RetirementDecimal as D } from "../retirement/engine";
import type { Allocation } from "./rebalance";
import { ledoitWolf, shrinkMean } from "./estimation";

export type LockedWeight = { assetClass: string; weight: number };
export type AssetHardLimit = { id: string; assetClass: string; min?: number; max?: number };

// The optimizer proposes one candidate. Goal simulation, loss checks and CVaR
// ranking remain the final selection gate; an optimum is not a goal guarantee.
export function continuousCandidate(base: Allocation[][], data: MarketDocument, policy: NonNullable<RiskPolicy["continuousOptimizer"]>,
  lockedWeights?: LockedWeight[], extraLimits?: AssetHardLimit[]) {
  const codes = base[0].map(a => a.assetClass), n = codes.length;
  if (new Set(policy.bounds.map(b => b.assetClass)).size !== n || policy.bounds.length !== n || codes.some(c => !policy.bounds.some(b => b.assetClass === c)))
    return { issue: "OPTIMIZER_BOUND_COVERAGE_REQUIRED" as const };
  const estimation = policy.estimation;
  if (!estimation || estimation.monthlyBaselines.length !== n || new Set(estimation.monthlyBaselines.map(b => b.assetClass)).size !== n || codes.some(c => !estimation.monthlyBaselines.some(b => b.assetClass === c)))
    return { issue: "APPROVED_RETURN_ESTIMATION_REQUIRED" as const };
  const samples = data.rows.map(r => codes.map(c => {
    const asset = data.assets.find(a => a.assetClass === c);
    return r.returns[c] === undefined || !asset ? NaN : new D(r.returns[c]).minus(asset.fees.treatment === "GROSS" ? asset.fees.monthlyDrag : 0).toNumber();
  }));
  if (samples.length < 2 || samples.some(row => row.some(v => !Number.isFinite(v)))) return { issue: "OPTIMIZER_MARKET_DATA_REQUIRED" as const };
  const estimated = ledoitWolf(samples.map(row => row.map(String)), estimation.target);
  const mean = codes.map((c, i) => Number(shrinkMean(estimated.mean[i], String(estimation.monthlyBaselines.find(b => b.assetClass === c)!.returnRate), String(estimation.historicalWeight))));
  const covariance = estimated.covariance.map(row => row.map(Number));
  const lockedByIndex = new Map<number, number>();
  for (const lock of lockedWeights ?? []) {
    const index = codes.indexOf(lock.assetClass);
    if (index >= 0 && lock.weight > 0) lockedByIndex.set(index, (lockedByIndex.get(index) ?? 0) + lock.weight);
  }
  const locked = [...lockedByIndex].map(([index, weight]) => ({ index, weight }));
  const assetBounds = codes.map(c => { const b = policy.bounds.find(b => b.assetClass === c)!; return { min: b.min, max: b.max }; });
  const hardLimits: Array<{ id: string; coefficients: number[]; min?: number; max?: number }> = [];
  for (const limit of extraLimits ?? []) {
    const index = codes.indexOf(limit.assetClass);
    if (index < 0) continue;
    hardLimits.push({ id: limit.id, coefficients: codes.map((_, i) => i === index ? 1 : 0),
      ...(limit.min !== undefined ? { min: limit.min } : {}), ...(limit.max !== undefined ? { max: limit.max } : {}) });
    if (limit.min !== undefined && limit.min <= assetBounds[index].max) assetBounds[index].min = Math.max(assetBounds[index].min, limit.min);
    if (limit.max !== undefined && limit.max >= assetBounds[index].min) assetBounds[index].max = Math.min(assetBounds[index].max, limit.max);
  }
  const input: ContinuousOptimizationInput = { expectedReturns: mean, covarianceMatrix: covariance, currentWeights: base[0].map(a => Number(a.weightPercent) / 100),
    riskAversionGamma: policy.riskAversionGamma, uncertaintyKappa: policy.uncertaintyKappa, turnoverPenaltyEta: policy.turnoverPenaltyEta,
    uncertaintyMatrix: covariance.map((row, i) => row.map((_, j) => i === j ? row[i] / samples.length : 0)),
    constraints: { assetBounds,
      ...(locked.length ? { lockedWeights: locked } : {}),
      ...(hardLimits.length ? { hardLimits } : {}) } };
  const result = solveContinuousOptimization(input);
  if (!result.solverMetadata.feasible) return { issue: "CONTINUOUS_OPTIMIZER_REVIEW_REQUIRED" as const, result, input };
  // Preserve the approved glide-path shape by applying the first-month delta.
  const delta = result.weights.map((w, i) => new D(w).minus(input.currentWeights![i]));
  const absorbIndex = locked.length ? (() => { for (let i = n - 1; i >= 0; i--) if (!lockedByIndex.has(i)) return i; return n - 1; })() : n - 1;
  const lockedRow = locked.length ? (() => {
    const vals = result.weights.map(w => new D(w).mul(100));
    vals[absorbIndex] = new D(100).minus(vals.reduce((s, v, i) => i === absorbIndex ? s : s.plus(v), new D(0)));
    return codes.map((assetClass, i) => ({ assetClass, weightPercent: vals[i].toFixed() }));
  })() : null;
  const targets = base.map(row => {
    if (lockedRow && locked.some(l => !new D(row.find(a => a.assetClass === codes[l.index])?.weightPercent ?? 0).eq(base[0].find(a => a.assetClass === codes[l.index])?.weightPercent ?? 0)))
      return lockedRow;
    const values = codes.map((c, i) => new D(row.find(a => a.assetClass === c)?.weightPercent ?? 0).plus(delta[i].mul(100)));
    // Decimal exact sum, followed by the independent hard-constraint check.
    values[absorbIndex] = new D(100).minus(values.reduce((s, v, i) => i === absorbIndex ? s : s.plus(v), new D(0)));
    return codes.map((assetClass, i) => ({ assetClass, weightPercent: values[i].toFixed() }));
  });
  const valid = targets.every(t => checkPortfolioFeasibility(input, t.map(a => Number(a.weightPercent) / 100)).feasible);
  return { input, result, candidate: { id: "CONTINUOUS", targets, valid, changePoints: delta.reduce((s, d) => s.plus(d.abs().mul(100)), new D(0)).toFixed() } };
}
