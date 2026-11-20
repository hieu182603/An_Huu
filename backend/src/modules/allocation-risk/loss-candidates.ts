import { RetirementDecimal as D } from "../retirement/engine";
import type { LossConstraint } from "../capital/loss-constraint";
import { validWeights, type Allocation } from "./rebalance";
import { customAllocationSchema, type CustomAllocation } from "../portfolios/custom";

/** Algorithm §10.4: when the template exceeds the declared loss limit, lower the
 * equity weight (moving it to deposits, the approved lossStress pair) or ask the
 * customer to revise the limit. These helpers never invent weights outside that move. */
type Check = (targets: Allocation[]) => LossConstraint;
type Candidate = { id: string; targets: Allocation[][]; changePoints: string; valid: boolean };
type TargetGenerator = (custom: CustomAllocation) => Allocation[][] | null;
type Evaluator = (custom: CustomAllocation) => boolean;

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
export function lossReducedCandidate(base: Allocation[][], equity: string, deposit: string, check: Check, generator?: TargetGenerator, evaluator?: Evaluator): Candidate | null {
  if (!base.length) return null;
  const first = check(base[0]);
  if (first.status !== "REDUCE_RISK" || first.maxEquityWeightPercent === null) return null;
  // Round the move up to 0.01 point so rounding can never leave the result above the limit.
  const points = weight(base[0], equity).minus(first.maxEquityWeightPercent).toDecimalPlaces(2, D.ROUND_UP);
  if (points.lte(0)) return null;

  if (generator) {
    // Replayable path: start from the reduced first-month weights and follow the template's
    // shifts (FOLLOW_TEMPLATE_SHIFTS), so the saved plan reproduces every simulated month.
    // Two checks must hold: every target month within the loss limit (cheap) and the plan's
    // own check (evaluator: prepareRetirement re-tests the DRIFTED holdings between
    // rebalances, which can exceed the limit when equity outgrows its target). Moving more
    // equity never raises a loss, so gallop up from the first-month estimate and bisect to
    // 0.01 point: the smallest replayable move, with about ten evaluations instead of one per cent.
    const top = weight(base[0], equity).toDecimalPlaces(2, D.ROUND_DOWN);
    const attempt = (cents: number) => {
      const moved = new D(cents).div(100);
      const shifted0 = shiftEquityToDeposit([base[0]], equity, deposit, moved)[0];
      const weights = shifted0.map(r => ({ ...r, weightPercent: new D(r.weightPercent).toDecimalPlaces(8).toFixed() }));
      if (weights.length) weights[weights.length - 1].weightPercent = new D(100).minus(weights.slice(0, -1).reduce((s, r) => s.plus(r.weightPercent), new D(0))).toFixed();
      const custom = customAllocationSchema.safeParse({ model: "custom-glide-v1", weights });
      if (!custom.success) return null;
      const targets = generator(custom.data);
      if (!targets) return null;
      const unique = [...new Set(targets)];
      if (!unique.every(t => validWeights(t)) || !unique.every(t => check(t).status === "WITHIN_LIMIT")) return null;
      if (evaluator && !evaluator(custom.data)) return null;
      return { moved, targets };
    };
    const first = points.mul(100).toNumber(), last = top.mul(100).toNumber();
    if (first > last) return null;
    let found = attempt(first);
    if (!found) {
      let lo = first, step = 25, hi = -1;
      while (hi < 0) {
        const next = Math.min(last, lo + step);
        const result = attempt(next);
        if (result) { hi = next; found = result; }
        else if (next === last) return null;
        else { lo = next; step *= 2; }
      }
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2), result = attempt(mid);
        if (result) { hi = mid; found = result; } else lo = mid;
      }
    }
    return found ? { id: "LOSS_REDUCED", targets: found.targets, changePoints: found.moved.toFixed(), valid: true } : null;
  }

  const targets = shiftEquityToDeposit(base, equity, deposit, points);
  return { id: "LOSS_REDUCED", targets, changePoints: points.toFixed(), valid: targets.every(t => validWeights(t)) };
}

/** All equity moved to deposits: the lowest stress loss reachable with the approved move. */
export function leastLossCandidate(base: Allocation[][], equity: string, deposit: string, generator?: TargetGenerator): Candidate {
  if (generator && base.length) {
    const shifted0 = shiftEquityToDeposit([base[0]], equity, deposit, "ALL")[0];
    const weights = shifted0.map(r => ({ ...r, weightPercent: new D(r.weightPercent).toDecimalPlaces(8).toFixed() }));
    if (weights.length) weights[weights.length - 1].weightPercent = new D(100).minus(weights.slice(0, -1).reduce((s, r) => s.plus(r.weightPercent), new D(0))).toFixed();
    const custom = customAllocationSchema.safeParse({ model: "custom-glide-v1", weights });
    if (custom.success) {
      const targets = generator(custom.data);
      if (targets && [...new Set(targets)].every(t => validWeights(t))) {
        return { id: "LEAST_LOSS", targets, changePoints: weight(base[0] ?? [], equity).toFixed(), valid: true };
      }
    }
  }
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
