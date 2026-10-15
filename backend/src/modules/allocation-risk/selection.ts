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
export function selectCandidate<T extends { id: string; pEssential: number; cvarEssentialShortfallToday: string; changePoints: string }>(candidates: T[], threshold: string) {
  return candidates.filter(c => new D(c.pEssential).gte(threshold)).sort((a, b) =>
    new D(a.cvarEssentialShortfallToday).cmp(b.cvarEssentialShortfallToday) || new D(a.changePoints).cmp(b.changePoints) || a.id.localeCompare(b.id))[0] ?? null;
}
