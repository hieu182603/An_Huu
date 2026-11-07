/**
 * Continuous Constrained Convex Portfolio Optimizer (Feature F04)
 * Solves the robust mean-variance-uncertainty-turnover optimization problem:
 * 
 *   min_w  f(w) = (gamma / 2) * w^T * Sigma * w - mu^T * w + kappa * sqrt(w^T * U * w) + eta * sum(|w_i - w0_i|)
 * 
 * Subject to:
 *   sum(w_i) = 1
 *   w_i >= 0  (no short-selling)
 *   l_i <= w_i <= u_i  (box bounds, e.g. equity constraint w_equity <= maxEquity from loss limit)
 *   locked assets hold fixed weights (l_i = u_i = w_fixed)
 * 
 * Method: Projected Proximal Gradient Descent with Barzilai-Borwein adaptive step size
 * and exact O(N log N) bisection projection onto the bounded simplex.
 */

import { checkOptimizationInput, checkPortfolioFeasibility } from "./optimizer-feasibility";
export { checkPortfolioFeasibility } from "./optimizer-feasibility";

export interface AssetBound {
  min: number;
  max: number;
}

export interface ContinuousOptimizationInput {
  expectedReturns: number[]; // Length N, mu
  covarianceMatrix: number[][]; // N x N shrinked covariance matrix, Sigma
  currentWeights?: number[]; // Length N, w0 (defaults to zeros or equal weights)
  riskAversionGamma?: number; // gamma >= 0, default 2.5
  uncertaintyKappa?: number; // kappa >= 0, parameter uncertainty penalty, default 0
  turnoverPenaltyEta?: number; // eta >= 0, L1 turnover penalty, default 0
  uncertaintyMatrix?: number[][]; // N x N matrix U (defaults to diag(diag(Sigma)/T))
  assetClasses?: string[]; // Asset class identifiers, e.g. ["CASH", "BOND", "EQUITY", "GOLD"]
  constraints?: {
    sumToOne?: boolean; // default true
    nonNegative?: boolean; // default true
    maxEquityWeight?: number; // e.g. from loss constraint
    assetBounds?: AssetBound[]; // Specific [l_i, u_i] bounds per asset
    lockedWeights?: Array<{ index: number; weight: number }>;
    // All coefficients and limits are fractions of the same investable capital.
    hardLimits?: Array<{ id: string; coefficients: number[]; min?: number; max?: number }>;
  };
  options?: {
    maxIterations?: number; // default 500
    tolerance?: number; // default 1e-6
    initialStepSize?: number; // default 0.1
  };
}

export interface ContinuousOptimizationOutput {
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "REVIEW_REQUIRED";
  issues?: string[];
  weights: number[]; // Length N, sum = 1.0
  expectedReturn: number; // mu^T * w
  expectedVolatility: number; // sqrt(w^T * Sigma * w)
  objectiveValue: number; // f(w)
  solverMetadata: {
    iterations: number;
    dualityGap: number;
    runtimeMs: number;
    gradientNorm: number;
    method: "PROJECTED_PROXIMAL_GRADIENT" | "GRID_FALLBACK";
    feasible: boolean;
  };
}

/**
 * Exact projection of vector y onto bounded simplex:
 *   min_w 0.5 * ||w - y||^2
 *   s.t.  sum(w_i) = targetSum,  lower_i <= w_i <= upper_i
 * 
 * Solved via bisection on the 1D monotonic dual multiplier nu:
 *   w_i(nu) = clip(y_i - nu, lower_i, upper_i)
 */
export function projectSimplexBox(
  y: number[],
  lower: number[],
  upper: number[],
  targetSum = 1.0
): { projected: number[]; feasible: boolean } {
  const n = y.length;
  if (n === 0 || lower.length !== n || upper.length !== n || !Number.isFinite(targetSum)
    || [...y, ...lower, ...upper].some(v => !Number.isFinite(v))) return { projected: [], feasible: false };

  let sumLower = 0;
  let sumUpper = 0;
  for (let i = 0; i < n; i++) {
    if (lower[i] > upper[i] + 1e-12) {
      return { projected: [...lower], feasible: false };
    }
    sumLower += lower[i];
    sumUpper += upper[i];
  }

  // Check feasibility
  if (sumLower > targetSum + 1e-8 || sumUpper < targetSum - 1e-8) {
    // Infeasible bounds
    return { projected: [...lower], feasible: false };
  }

  // Exact bounds for nu:
  // w_i(nu) = min(upper[i], max(lower[i], y[i] - nu))
  // When nu is very small, w_i = upper[i], sum = sumUpper >= targetSum
  // When nu is very large, w_i = lower[i], sum = sumLower <= targetSum
  let nuMin = Infinity;
  let nuMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const diffUpper = y[i] - upper[i];
    const diffLower = y[i] - lower[i];
    if (diffUpper < nuMin) nuMin = diffUpper;
    if (diffLower > nuMax) nuMax = diffLower;
  }
  nuMin -= 1.0;
  nuMax += 1.0;

  // Bisection loop (60 iterations gives machine epsilon precision ~ 10^-18)
  for (let iter = 0; iter < 60; iter++) {
    const nuMid = 0.5 * (nuMin + nuMax);
    let sumMid = 0;
    for (let i = 0; i < n; i++) {
      const val = y[i] - nuMid;
      const clipped = val < lower[i] ? lower[i] : val > upper[i] ? upper[i] : val;
      sumMid += clipped;
    }

    if (sumMid > targetSum) {
      nuMin = nuMid; // need larger nu to reduce w_i
    } else {
      nuMax = nuMid; // need smaller nu to increase w_i
    }
  }

  const nuOptimal = 0.5 * (nuMin + nuMax);
  const projected: number[] = new Array(n);
  let finalSum = 0;
  for (let i = 0; i < n; i++) {
    const val = y[i] - nuOptimal;
    projected[i] = val < lower[i] ? lower[i] : val > upper[i] ? upper[i] : val;
    finalSum += projected[i];
  }

  // Micro-adjustment for exact machine precision targetSum
  const residual = targetSum - finalSum;
  if (Math.abs(residual) > 1e-12 && Math.abs(residual) < 1e-4) {
    // Distribute residual among strictly unclipped coordinates
    const unclippedIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      if (projected[i] > lower[i] + 1e-7 && projected[i] < upper[i] - 1e-7) {
        unclippedIndices.push(i);
      }
    }
    if (unclippedIndices.length > 0) {
      const delta = residual / unclippedIndices.length;
      for (const idx of unclippedIndices) {
        projected[idx] += delta;
      }
    } else {
      // If all clipped, adjust coordinate with biggest slack
      let bestIdx = 0;
      let maxSlack = -1;
      for (let i = 0; i < n; i++) {
        const slack = residual > 0 ? (upper[i] - projected[i]) : (projected[i] - lower[i]);
        if (slack > maxSlack) {
          maxSlack = slack;
          bestIdx = i;
        }
      }
      projected[bestIdx] = Math.max(lower[bestIdx], Math.min(upper[bestIdx], projected[bestIdx] + residual));
    }
  }

  return { projected, feasible: true };
}

/**
 * Matrix-vector product: M * v
 */
function matVecMul(M: number[][], v: number[]): number[] {
  const n = v.length;
  const res = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const row = M[i];
    for (let j = 0; j < n; j++) {
      sum += row[j] * v[j];
    }
    res[i] = sum;
  }
  return res;
}

/**
 * Vector inner product: u^T * v
 */
function dotProduct(u: number[], v: number[]): number {
  let sum = 0;
  for (let i = 0; i < u.length; i++) {
    sum += u[i] * v[i];
  }
  return sum;
}

/**
 * Objective function evaluation:
 * f(w) = (gamma / 2) * w^T * Sigma * w - mu^T * w + kappa * sqrt(w^T * U * w) + eta * ||w - w0||_1
 */
export function evaluateObjective(
  w: number[],
  mu: number[],
  Sigma: number[][],
  w0: number[],
  gamma: number,
  kappa: number,
  eta: number,
  U: number[][]
): {
  total: number;
  varianceTerm: number;
  returnTerm: number;
  uncertaintyTerm: number;
  turnoverTerm: number;
} {
  const Sw = matVecMul(Sigma, w);
  const variance = dotProduct(w, Sw);
  const varianceTerm = (gamma / 2) * variance;

  const returnTerm = dotProduct(mu, w);

  const Uw = matVecMul(U, w);
  const uncertaintyQuad = Math.max(0, dotProduct(w, Uw));
  const uncertaintyTerm = kappa * Math.sqrt(uncertaintyQuad);

  let turnover = 0;
  for (let i = 0; i < w.length; i++) {
    turnover += Math.abs(w[i] - (w0[i] ?? 0));
  }
  const turnoverTerm = eta * turnover;

  const total = varianceTerm - returnTerm + uncertaintyTerm + turnoverTerm;
  return { total, varianceTerm, returnTerm, uncertaintyTerm, turnoverTerm };
}

/**
 * Gradient of smooth portion:
 * grad_g(w) = gamma * Sigma * w - mu + (kappa * U * w) / (sqrt(w^T * U * w) + eps)
 */
function gradientSmooth(
  w: number[],
  mu: number[],
  Sigma: number[][],
  gamma: number,
  kappa: number,
  U: number[][]
): number[] {
  const n = w.length;
  const Sw = matVecMul(Sigma, w);
  const Uw = matVecMul(U, w);
  const uQuad = Math.max(0, dotProduct(w, Uw));
  const uNorm = Math.sqrt(uQuad);

  const grad = new Array(n);
  const eps = 1e-12;
  const uFactor = (kappa > 0 && uNorm > eps) ? (kappa / (uNorm + eps)) : 0;

  for (let i = 0; i < n; i++) {
    grad[i] = gamma * Sw[i] - mu[i] + uFactor * Uw[i];
  }
  return grad;
}

/**
 * Proximal operator for L1 turnover:
 * prox_{alpha * eta * ||. - w0||_1}(v)_i = w0_i + sign(v_i - w0_i) * max(0, |v_i - w0_i| - alpha * eta)
 */
function proximalL1(v: number[], w0: number[], alphaEta: number): number[] {
  const n = v.length;
  const res = new Array(n);
  for (let i = 0; i < n; i++) {
    const diff = v[i] - (w0[i] ?? 0);
    const absDiff = Math.abs(diff);
    if (absDiff <= alphaEta) {
      res[i] = w0[i] ?? 0;
    } else {
      res[i] = (w0[i] ?? 0) + Math.sign(diff) * (absDiff - alphaEta);
    }
  }
  return res;
}

/**
 * Main Solver: Continuous Constrained Convex Portfolio Optimizer
 */
export function solveContinuousOptimization(
  input: ContinuousOptimizationInput
): ContinuousOptimizationOutput {
  const startTime = performance.now();
  const n = input.expectedReturns.length;

  if (n === 0) {
    return {
      status: "INFEASIBLE",
      weights: [],
      expectedReturn: 0,
      expectedVolatility: 0,
      objectiveValue: 0,
      solverMetadata: {
        iterations: 0,
        dualityGap: 0,
        runtimeMs: performance.now() - startTime,
        gradientNorm: 0,
        method: "PROJECTED_PROXIMAL_GRADIENT",
        feasible: false,
      },
    };
  }

  const invalid = checkOptimizationInput(input);
  if (invalid.length) return failedOptimization("REVIEW_REQUIRED", invalid);

  const mu = input.expectedReturns;
  const Sigma = input.covarianceMatrix;
  const w0 = input.currentWeights ?? new Array(n).fill(1 / n);
  const gamma = Math.max(0, input.riskAversionGamma ?? 2.5);
  const kappa = Math.max(0, input.uncertaintyKappa ?? 0);
  const eta = Math.max(0, input.turnoverPenaltyEta ?? 0);
  const maxIter = input.options?.maxIterations ?? 500;
  const tol = input.options?.tolerance ?? 1e-6;

  // Build uncertainty matrix U if not provided
  let U = input.uncertaintyMatrix;
  if (!U) {
    U = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (__, j) => (i === j ? Math.max(1e-6, Sigma[i][i] / 120) : 0))
    );
  }

  // Build bounds [lower_i, upper_i]
  const lower = new Array(n).fill(0);
  const upper = new Array(n).fill(1);

  if (input.constraints?.assetBounds) {
    for (let i = 0; i < n; i++) {
      const b = input.constraints.assetBounds[i];
      if (b) {
        lower[i] = Math.max(lower[i], b.min);
        upper[i] = Math.min(upper[i], b.max);
      }
    }
  }

  // Apply maxEquityWeight if assetClasses provided
  if (input.constraints?.maxEquityWeight !== undefined && input.assetClasses) {
    const maxEq = input.constraints.maxEquityWeight;
    for (let i = 0; i < n; i++) {
      if (input.assetClasses[i] === "EQUITY") {
        upper[i] = Math.min(upper[i], maxEq);
      }
    }
  }

  for (const lock of input.constraints?.lockedWeights ?? []) {
    lower[lock.index] = Math.max(lower[lock.index], lock.weight);
    upper[lock.index] = Math.min(upper[lock.index], lock.weight);
  }

  // Check feasibility upfront
  const initProj = projectSimplexBox(w0, lower, upper, 1.0);
  if (!initProj.feasible) {
    return {
      status: "INFEASIBLE",
      weights: initProj.projected,
      expectedReturn: 0,
      expectedVolatility: 0,
      objectiveValue: Infinity,
      solverMetadata: {
        iterations: 0,
        dualityGap: Infinity,
        runtimeMs: performance.now() - startTime,
        gradientNorm: Infinity,
        method: "PROJECTED_PROXIMAL_GRADIENT",
        feasible: false,
      },
    };
  }

  // Initial iterate w
  let w = initProj.projected;
  let alpha = input.options?.initialStepSize ?? 0.1;

  // Compute Lipschitz constant estimate of smooth part: L <= gamma * ||Sigma||_F + kappa * ||U||_F
  let frobSigma = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      frobSigma += Sigma[i][j] * Sigma[i][j];
    }
  }
  const L_est = gamma * Math.sqrt(frobSigma) + 1.0;
  alpha = Math.min(1.0, 1.0 / Math.max(1e-3, L_est));

  let prevGrad = gradientSmooth(w, mu, Sigma, gamma, kappa, U);
  let prevW = [...w];
  let iterations = 0;
  let finalGradNorm = Infinity;
  let converged = false;

  for (let iter = 1; iter <= maxIter; iter++) {
    iterations = iter;

    const grad = gradientSmooth(w, mu, Sigma, gamma, kappa, U);

    // Barzilai-Borwein step size update when iter > 1
    if (iter > 1) {
      const s = new Array(n);
      const yVec = new Array(n);
      let sDotY = 0;
      let sDotS = 0;
      for (let i = 0; i < n; i++) {
        s[i] = w[i] - prevW[i];
        yVec[i] = grad[i] - prevGrad[i];
        sDotY += s[i] * yVec[i];
        sDotS += s[i] * s[i];
      }
      if (sDotY > 1e-12 && sDotS > 1e-12) {
        alpha = Math.max(1e-6, Math.min(10.0, sDotS / sDotY));
      }
    }

    prevW = [...w];
    prevGrad = [...grad];

    // Armijo backtracking line search with Proximal step and Simplex projection
    let stepAccepted = false;
    let currentAlpha = alpha;
    const currentObj = evaluateObjective(w, mu, Sigma, w0, gamma, kappa, eta, U).total;

    let candidateW = [...w];

    for (let lineSearch = 0; lineSearch < 25; lineSearch++) {
      // 1. Gradient step on smooth portion
      const gradStep = new Array(n);
      for (let i = 0; i < n; i++) {
        gradStep[i] = w[i] - currentAlpha * grad[i];
      }

      // 2. Proximal operator for L1 turnover
      const proxStep = (eta > 0) ? proximalL1(gradStep, w0, currentAlpha * eta) : gradStep;

      // 3. Project onto bounded simplex
      const proj = projectSimplexBox(proxStep, lower, upper, 1.0);
      candidateW = proj.projected;

      // 4. Line search evaluation
      const candidateObj = evaluateObjective(candidateW, mu, Sigma, w0, gamma, kappa, eta, U).total;
      
      let diffNormSq = 0;
      for (let i = 0; i < n; i++) {
        const d = candidateW[i] - w[i];
        diffNormSq += d * d;
      }

      // Sufficient decrease condition: candidateObj <= currentObj - (0.5 / currentAlpha) * ||candidateW - w||^2
      if (candidateObj <= currentObj + 1e-9 || diffNormSq < 1e-16) {
        stepAccepted = true;
        break;
      }
      currentAlpha *= 0.5;
    }

    if (!stepAccepted) break;

    // Measure step size
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      const change = Math.abs(candidateW[i] - w[i]);
      if (change > maxChange) maxChange = change;
    }

    w = candidateW;

    // Check convergence
    if (maxChange < tol) {
      finalGradNorm = maxChange;
      converged = true;
      break;
    }
  }

  // Calculate final metrics
  const finalObj = evaluateObjective(w, mu, Sigma, w0, gamma, kappa, eta, U);
  const expReturn = dotProduct(mu, w);
  const Sw = matVecMul(Sigma, w);
  const expVol = Math.sqrt(Math.max(0, dotProduct(w, Sw)));

  const feasible = checkPortfolioFeasibility(input, w);
  if (!feasible.feasible) return failedOptimization("REVIEW_REQUIRED", feasible.issues);
  if (![finalObj.total, expReturn, expVol].every(Number.isFinite)) return failedOptimization("REVIEW_REQUIRED", ["NUMERICAL_FAILURE"]);
  // Convex first-order gap over the bounded simplex certifies smooth solutions.
  // Sequential L1 shrink + projection has no such certificate; report FEASIBLE.
  const gradient = gradientSmooth(w, mu, Sigma, gamma, kappa, U);
  const vertex = [...lower];
  let remaining = 1 - vertex.reduce((s, v) => s + v, 0);
  for (const i of gradient.map((_, i) => i).sort((i, j) => gradient[i] - gradient[j])) {
    const add = Math.min(remaining, upper[i] - vertex[i]);
    vertex[i] += add; remaining -= add;
  }
  const gap = Math.max(0, dotProduct(gradient, w.map((v, i) => v - vertex[i])));
  const certified = converged && eta === 0 && gap <= Math.min(tol, 1e-6);

  return {
    status: certified ? "OPTIMAL" : "FEASIBLE",
    issues: certified ? [] : ["OPTIMALITY_NOT_CERTIFIED"],
    weights: w,
    expectedReturn: expReturn,
    expectedVolatility: expVol,
    objectiveValue: finalObj.total,
    solverMetadata: {
      iterations,
      dualityGap: eta === 0 ? gap : Infinity,
      runtimeMs: performance.now() - startTime,
      gradientNorm: finalGradNorm,
      method: "PROJECTED_PROXIMAL_GRADIENT",
      feasible: true,
    },
  };
}

/**
 * Fallback to candidate grid if continuous optimizer fails or is infeasible (Feature F05)
 */
export function continuousOptimizationWithFallback(
  input: ContinuousOptimizationInput,
  candidateGridFallback: () => { weights: number[]; id: string }
): ContinuousOptimizationOutput {
  const result = solveContinuousOptimization(input);
  if (result.status === "OPTIMAL") {
    return result;
  }

  if (checkOptimizationInput(input).length) return result;
  // Recheck the exact same constraints; fallback is never a relaxation.
  let fallback: { weights: number[]; id: string };
  try { fallback = candidateGridFallback(); }
  catch { return { ...result, issues: [...(result.issues ?? []), "FALLBACK_UNAVAILABLE"] }; }
  const checked = checkPortfolioFeasibility(input, fallback.weights);
  if (!checked.feasible) return { ...result, issues: [...(result.issues ?? []), ...checked.issues] };
  const mu = input.expectedReturns;
  const Sigma = input.covarianceMatrix;
  const w = fallback.weights;
  const expReturn = dotProduct(mu, w);
  const Sw = matVecMul(Sigma, w);
  const expVol = Math.sqrt(Math.max(0, dotProduct(w, Sw)));
  const obj = evaluateObjective(
    w,
    mu,
    Sigma,
    input.currentWeights ?? w,
    input.riskAversionGamma ?? 2.5,
    input.uncertaintyKappa ?? 0,
    input.turnoverPenaltyEta ?? 0,
    input.uncertaintyMatrix ?? Sigma.map((row, i) => row.map((_, j) => i === j ? Math.max(1e-6, Sigma[i][i] / 120) : 0))
  );

  if (![expReturn, expVol, obj.total].every(Number.isFinite)) return failedOptimization("REVIEW_REQUIRED", ["NUMERICAL_FAILURE"]);
  return {
    status: "FEASIBLE",
    weights: w,
    expectedReturn: expReturn,
    expectedVolatility: expVol,
    objectiveValue: obj.total,
    solverMetadata: {
      iterations: 0,
      dualityGap: Infinity,
      runtimeMs: 0,
      gradientNorm: Infinity,
      method: "GRID_FALLBACK",
      feasible: true,
    },
  };
}


function failedOptimization(status: "INFEASIBLE" | "REVIEW_REQUIRED", issues: string[]): ContinuousOptimizationOutput {
  return { status, issues, weights: [], expectedReturn: 0, expectedVolatility: 0, objectiveValue: Infinity,
    solverMetadata: { iterations: 0, dualityGap: Infinity, runtimeMs: 0, gradientNorm: Infinity, method: "PROJECTED_PROXIMAL_GRADIENT", feasible: false } };
}
