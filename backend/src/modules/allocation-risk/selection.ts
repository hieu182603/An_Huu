import { RetirementDecimal as D } from "../retirement/engine";
import { validWeights, type Allocation } from "./rebalance";

export function allocationCandidates(base: Allocation[][], equity: string, cash: string, shiftPoints: string) {
  if (equity === cash || new D(shiftPoints).lte(0)) throw new RangeError("Invalid candidate step");
  return [-1, 0, 1].map(direction => {
    const shift = new D(shiftPoints).mul(direction);
    const targets = base.map(rows => rows.map(a => ({ assetClass: a.assetClass,
      weightPercent: new D(a.weightPercent).plus(a.assetClass === equity ? shift : a.assetClass === cash ? shift.neg() : 0).toFixed() })));
    return { id: direction === 0 ? "BASE" : direction < 0 ? "LOWER_EQUITY" : "HIGHER_EQUITY", targets,
      changePoints: shift.abs().toFixed(), valid: targets.every(t => validWeights(t) && t.some(a => a.assetClass === equity) && t.some(a => a.assetClass === cash)) };
  });
}
type Changing = { id: string; changePoints: string; turnoverFromCurrentPoints?: string | null };
/**
 * Spec 7.4 step 3 / 6.3: among candidates reaching p_essential, lowest CVaR95, then lowest turnover.
 * Turnover is measured against the customer's current holdings when both candidates carry it
 * (turnoverFromCurrentPoints); otherwise against the published template (changePoints).
 */
export function compareChange(a: Changing, b: Changing) {
  const bothCurrent = a.turnoverFromCurrentPoints != null && b.turnoverFromCurrentPoints != null;
  return new D(bothCurrent ? a.turnoverFromCurrentPoints! : a.changePoints).cmp(bothCurrent ? b.turnoverFromCurrentPoints! : b.changePoints) || a.id.localeCompare(b.id);
}
export function compareCvarThenChange(a: Changing & { cvarEssentialShortfallToday: string }, b: Changing & { cvarEssentialShortfallToday: string }) {
  return new D(a.cvarEssentialShortfallToday).cmp(b.cvarEssentialShortfallToday) || compareChange(a, b);
}
export function selectCandidate<T extends { id: string; pEssential: number; cvarEssentialShortfallToday: string; changePoints: string; turnoverFromCurrentPoints?: string | null }>(candidates: T[], threshold: string) {
  return candidates.filter(c => new D(c.pEssential).gte(threshold)).sort(compareCvarThenChange)[0] ?? null;
}
