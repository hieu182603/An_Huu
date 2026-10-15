import { RetirementDecimal as D } from "../retirement/engine";

function value(s: string) {
  const d = new D(s);
  if (!d.isFinite() || d.abs().gt("1e100")) throw new RangeError("Non-finite or out-of-range input");
  return d;
}
function factor(s: string) {
  const d = value(s).plus(1);
  if (d.lte(0)) throw new RangeError("Return must exceed -100%");
  return d;
}
/** All returns are decimal fractions, not percentages. Distributions occur at
 * period end. Adjusted prices must not already include these distributions. */
export function totalReturn(previousPrice: string, price: string, distribution: string) {
  const previous = value(previousPrice), current = value(price), paid = value(distribution);
  if (previous.lte(0) || current.lt(0) || paid.lt(0)) throw new RangeError("Invalid price/distribution");
  return current.plus(paid).div(previous).minus(1).toFixed();
}
export function cagr(monthlyReturns: string[]) {
  if (!monthlyReturns.length) throw new RangeError("Monthly observations required");
  return monthlyReturns.reduce((p, r) => p.mul(factor(r)), new D(1)).pow(new D(12).div(monthlyReturns.length)).minus(1).toFixed();
}
export function shrinkMean(historical: string, baseline: string, a: string) {
  const weight = value(a);
  if (weight.lt(0) || weight.gt(1)) throw new RangeError("Shrinkage weight outside [0,1]");
  return weight.mul(value(historical)).plus(new D(1).minus(weight).mul(value(baseline))).toFixed();
}
export const realReturn = (nominal: string, inflation: string) => factor(nominal).div(factor(inflation)).minus(1).toFixed();
/** FX is domestic currency per unit of foreign currency; FX return > 0 means
 * foreign currency appreciation. Both series must use the same period. */
export const domesticReturn = (foreign: string, fx: string) => factor(foreign).mul(factor(fx)).minus(1).toFixed();

/** Ledoit-Wolf (2004), centered ML covariance (divisor n), target mu*I.
 * beta = sum_ij Var_n(x_i*x_j)/n; delta = ||S-mu I||_F².
 * Same estimator as sklearn.covariance.ledoit_wolf(assume_centered=False).
 * Decimal arithmetic retains the existing financial precision convention. */
export function ledoitWolf(observations: string[][]) {
  const n = observations.length, p = observations[0]?.length ?? 0;
  if (n < 2 || n > 2400 || p < 1 || p > 20 || observations.some(r => r.length !== p)) throw new RangeError("Rectangular observations required");
  const x = observations.map(r => r.map(value));
  const means = Array.from({ length: p }, (_, j) => x.reduce((s, r) => s.plus(r[j]), new D(0)).div(n));
  const centered = x.map(r => r.map((v, j) => v.minus(means[j])));
  const covariance = means.map((_, j) => means.map((__, k) => centered.reduce((s, r) => s.plus(r[j].mul(r[k])), new D(0)).div(n)));
  const mu = covariance.reduce((s, r, j) => s.plus(r[j]), new D(0)).div(p);
  let beta = new D(0), delta = new D(0);
  for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) {
    beta = beta.plus(centered.reduce((s, r) => s.plus(r[j].mul(r[k]).minus(covariance[j][k]).pow(2)), new D(0)).div(n * n));
    delta = delta.plus(covariance[j][k].minus(j === k ? mu : 0).pow(2));
  }
  const shrinkage = delta.isZero() ? new D(0) : D.min(1, D.max(0, beta.div(delta)));
  return { shrinkage: shrinkage.toFixed(), mean: means.map(v => v.toFixed()),
    covariance: covariance.map((r, j) => r.map((v, k) => v.mul(new D(1).minus(shrinkage)).plus(j === k ? mu.mul(shrinkage) : 0).toFixed())) };
}
