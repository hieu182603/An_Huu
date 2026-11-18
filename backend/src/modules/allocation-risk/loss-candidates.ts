import { RetirementDecimal as D } from "../retirement/engine";
import type { LossConstraint } from "../capital/loss-constraint";
import { validWeights, type Allocation } from "./rebalance";

/** Algorithm §10.4: when the template exceeds the declared loss limit, lower the
 * equity weight (moving it to deposits, the approved lossStress pair) or ask the
 * customer to revise the limit. These helpers never invent weights outside that move. */
type Check = (targets: Allocation[]) => LossConstraint;
type Candidate = { id: string; targets: Allocation[][]; changePoints: string; valid: boolean };

const weight = (rows: Allocation[], code: string) => new D(rows.find(r => r.assetClass === code)?.weightPercent ?? "0");

/** Move `points` of equity into deposits in every month, never below zero equity. */
export function shiftEquityToDeposit(base: Allocation[][], equity: string, deposit: string, points: InstanceType<typeof D> | "ALL") {
  return base.map(rows => {
    const current = weight(rows, equity), moved = points === "ALL" ? current : D.min(current, points);
    const next = rows.map(r => ({ ...r }));
    if (!next.some(r => r.assetClass === deposit)) next.push({ assetClass: deposit, weightPercent: "0" });
    return next.map(r => r.assetClass === equity ? { ...r, weightPercent: current.minus(moved).toFixed() }
      : r.assetClass === deposit ? { ...r, weightPercent: new D(r.weightPercent).plus(moved).toFixed() } : r);
  });
}

/** The template with just enough equity moved to deposits for the first month to meet the
 * limit, then following the template's own glide shifts. Null when no reduction helps. */
export function lossReducedCandidate(base: Allocation[][], equity: string, deposit: string, check: Check): Candidate | null {
  if (!base.length) return null;
  const first = check(base[0]);
  if (first.status !== "REDUCE_RISK" || first.maxEquityWeightPercent === null) return null;
  // Round the move up to 0.01 point so rounding can never leave the result above the limit.
  const points = weight(base[0], equity).minus(first.maxEquityWeightPercent).toDecimalPlaces(2, D.ROUND_UP);
  if (points.lte(0)) return null;
  const targets = shiftEquityToDeposit(base, equity, deposit, points);
  return { id: "LOSS_REDUCED", targets, changePoints: points.toFixed(), valid: targets.every(t => validWeights(t)) };
}

/** All equity moved to deposits: the lowest stress loss reachable with the approved move. */
export function leastLossCandidate(base: Allocation[][], equity: string, deposit: string): Candidate {
  const targets = shiftEquityToDeposit(base, equity, deposit, "ALL");
  return { id: "LEAST_LOSS", targets, changePoints: weight(base[0] ?? [], equity).toFixed(), valid: targets.every(t => validWeights(t)) };
}

/** What the customer would need to accept for `check` to fit: the amount (rounded up to
 * the dong) and the share of long-term capital (rounded up to 0.1 point). */
export function lossFeasibility(check: LossConstraint) {
  if (check.lossAmount === null || check.allowedLossAmount === null || check.lossPercentOfGrowth === null) return null;
  return {
    minimumLossAmount: check.lossAmount,
    allowedLossAmount: check.allowedLossAmount,
    requiredToleranceAmountVnd: new D(check.lossAmount).toDecimalPlaces(0, D.ROUND_UP).toFixed(),
    requiredTolerancePercentOfGrowth: new D(check.lossPercentOfGrowth).toDecimalPlaces(1, D.ROUND_UP).toFixed(),
  };
}
