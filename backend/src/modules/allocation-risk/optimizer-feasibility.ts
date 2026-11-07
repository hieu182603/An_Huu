import type { ContinuousOptimizationInput } from "./optimizer";

// Independent of solver convergence tolerance: callers cannot relax hard limits.
export const FEASIBILITY_TOLERANCE = 1e-8;
function positiveSemidefinite(matrix: number[][], n: number): boolean {
  if (matrix.length !== n || matrix.some(r => r.length !== n || r.some(v => !Number.isFinite(v)))) return false;
  const a = matrix.map(r => [...r]);
  const eps = Math.max(1, ...a.flat().map(Math.abs)) * 1e-12;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Math.abs(a[i][j] - a[j][i]) > eps) return false;
  // Semidefinite LDL elimination accepts singular PSD matrices, without inversion.
  for (let k = 0; k < n; k++) {
    if (a[k][k] < -eps) return false;
    if (a[k][k] <= eps) {
      if (a.slice(k + 1).some(r => Math.abs(r[k]) > eps)) return false;
      continue;
    }
    for (let i = k + 1; i < n; i++) for (let j = k + 1; j < n; j++) a[i][j] -= a[i][k] * a[k][j] / a[k][k];
  }
  return true;
}
export function checkOptimizationInput(input: ContinuousOptimizationInput): string[] {
  const n = input.expectedReturns.length, c = input.constraints;
  const issues: string[] = [];
  if (!n || input.expectedReturns.some(v => !Number.isFinite(v))) issues.push("INVALID_RETURNS");
  if (!positiveSemidefinite(input.covarianceMatrix, n)) issues.push("INVALID_COVARIANCE");
  if (input.uncertaintyMatrix && !positiveSemidefinite(input.uncertaintyMatrix, n)) issues.push("INVALID_UNCERTAINTY");
  if (input.currentWeights && (input.currentWeights.length !== n || input.currentWeights.some(v => !Number.isFinite(v) || v < 0))) issues.push("INVALID_CURRENT_WEIGHTS");
  if ([input.riskAversionGamma, input.uncertaintyKappa, input.turnoverPenaltyEta].some(v => v !== undefined && (!Number.isFinite(v) || v < 0))) issues.push("INVALID_PENALTY");
  if (c?.sumToOne === false || c?.nonNegative === false) issues.push("UNSUPPORTED_CONSTRAINT_MODE");
  if (c?.assetBounds && (c.assetBounds.length !== n || c.assetBounds.some(b => !Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min < 0 || b.max > 1 || b.min > b.max))) issues.push("INVALID_BOUNDS");
  if (c?.maxEquityWeight !== undefined && (!Number.isFinite(c.maxEquityWeight) || c.maxEquityWeight < 0 || c.maxEquityWeight > 1 || input.assetClasses?.length !== n)) issues.push("INVALID_EQUITY_LIMIT");
  if (c?.lockedWeights?.some(l => !Number.isInteger(l.index) || l.index < 0 || l.index >= n || !Number.isFinite(l.weight) || l.weight < 0 || l.weight > 1)) issues.push("INVALID_LOCK");
  if (c?.hardLimits?.some(l => !l.id || l.coefficients.length !== n || l.coefficients.some(v => !Number.isFinite(v)) || (l.min === undefined && l.max === undefined) || [l.min, l.max].some(v => v !== undefined && !Number.isFinite(v)) || (l.min !== undefined && l.max !== undefined && l.min > l.max))) issues.push("INVALID_HARD_LIMIT");
  const o = input.options;
  if (o?.maxIterations !== undefined && (!Number.isInteger(o.maxIterations) || o.maxIterations < 0 || o.maxIterations > 10000)) issues.push("INVALID_ITERATION_LIMIT");
  if ([o?.tolerance, o?.initialStepSize].some(v => v !== undefined && (!Number.isFinite(v) || v <= 0))) issues.push("INVALID_SOLVER_OPTION");
  return issues;
}
export function checkPortfolioFeasibility(input: ContinuousOptimizationInput, weights: number[]) {
  const issues = checkOptimizationInput(input), eps = FEASIBILITY_TOLERANCE;
  if (weights.length !== input.expectedReturns.length || weights.some(w => !Number.isFinite(w))) return { feasible: false, issues: [...issues, "INVALID_WEIGHTS"] };
  if (Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > eps) issues.push("SUM_NOT_ONE");
  if (weights.some(w => w < -eps)) issues.push("NEGATIVE_WEIGHT");
  weights.forEach((w, i) => {
    const b = input.constraints?.assetBounds?.[i] ?? { min: 0, max: 1 };
    if (w < b.min - eps || w > b.max + eps) issues.push(`BOUND:${i}`);
  });
  const c = input.constraints;
  if (c?.maxEquityWeight !== undefined && weights.reduce((s, w, i) => s + (input.assetClasses?.[i] === "EQUITY" ? w : 0), 0) > c.maxEquityWeight + eps) issues.push("EQUITY_CAP");
  c?.lockedWeights?.forEach(l => { if (Math.abs(weights[l.index] - l.weight) > eps) issues.push(`LOCK:${l.index}`); });
  c?.hardLimits?.forEach(l => {
    const value = weights.reduce((s, w, i) => s + w * l.coefficients[i], 0);
    if ((l.min !== undefined && value < l.min - eps) || (l.max !== undefined && value > l.max + eps)) issues.push(`HARD_LIMIT:${l.id}`);
  });
  return { feasible: !issues.length, issues };
}
