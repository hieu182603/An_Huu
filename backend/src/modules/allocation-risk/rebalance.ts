import { z } from "zod";
import { RetirementDecimal as D } from "../retirement/engine";
import { monthSchema } from "../../common/calendar";

const money = z.string().max(40).regex(/^(0|[1-9]\d*)(\.\d+)?$/);
export const rebalanceInputSchema = z.object({
  policyVersionId: z.string().uuid(), templateId: z.string().min(1).max(100), month: monthSchema,
  retirementMonth: monthSchema,
  holdings: z.array(z.object({ assetClass: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/), value: money,
    // Maturities are a subset of that holding, not additional wealth.
    maturedAmount: money }).strict()).min(1).max(20), newContribution: money,
}).strict().superRefine((v, ctx) => {
  if (new Set(v.holdings.map(h => h.assetClass)).size !== v.holdings.length || v.holdings.some(h => new D(h.maturedAmount).gt(h.value)))
    ctx.addIssue({ code: "custom", message: "Trùng tài sản hoặc đáo hạn vượt giá trị nắm giữ." });
});
export type Allocation = { assetClass: string; weightPercent: string };
export function validWeights(weights: Allocation[]) {
  return weights.length > 0 && new Set(weights.map(w => w.assetClass)).size === weights.length &&
    weights.every(w => new D(w.weightPercent).isFinite() && new D(w.weightPercent).gte(0)) &&
    weights.reduce((s, w) => s.plus(w.weightPercent), new D(0)).eq(100);
}
export function proposeRebalance(input: z.infer<typeof rebalanceInputSchema>, targets: Allocation[], bandPoints: string, costPercent: string) {
  rebalanceInputSchema.parse(input);
  if (!validWeights(targets) || new D(bandPoints).lt(0) || new D(bandPoints).gt(100) || new D(costPercent).lt(0) || new D(costPercent).gte(100) ||
    input.holdings.some(h => !targets.some(t => t.assetClass === h.assetClass))) throw new RangeError("Invalid rebalance configuration");
  const total = input.holdings.reduce((s, h) => s.plus(h.value), new D(0));
  if (total.isZero()) return { status: "REVIEW_REQUIRED" as const, issues: ["POSITIVE_HOLDINGS_REQUIRED"] };
  const gross = total.plus(input.newContribution), costRate = new D(costPercent).div(100);
  const entries = targets.map(t => {
    const h = input.holdings.find(h => h.assetClass === t.assetClass);
    const old = new D(h?.value ?? "0"), matured = new D(h?.maturedAmount ?? "0");
    return { ...t, old, retained: old.minus(matured), matured, weight: old.div(total).mul(100) };
  });
  const triggered = entries.some(e => e.weight.minus(e.weightPercent).abs().gt(bandPoints));
  if (!triggered) return { status: "WITHIN_BAND" as const, issues: [], oldWeights: entries.map(e => ({ assetClass: e.assetClass, weightPercent: e.weight.toFixed() })),
    targetWeights: targets, reason: "ABSOLUTE_DRIFT_NOT_GREATER_THAN_BAND", cost: "0", trades: [], unallocatedNewContribution: input.newContribution };
  // Solve net assets = gross assets - half-L1 turnover cost on remaining buys
  // and sells, after assigning free cash (contribution+maturities) to deficits.
  const free = new D(input.newContribution).plus(entries.reduce((s, e) => s.plus(e.matured), new D(0)));
  const at = (net: InstanceType<typeof D>) => {
    const deficits = entries.map(e => D.max(0, net.mul(e.weightPercent).div(100).minus(e.retained)));
    const demand = deficits.reduce((s, d) => s.plus(d), new D(0));
    const allocated = D.min(free, demand);
    const trades = entries.map((e, i) => {
      const cash = demand.gt(0) ? allocated.mul(deficits[i]).div(demand) : new D(0);
      const target = net.mul(e.weightPercent).div(100), delta = target.minus(e.retained).minus(cash);
      return { assetClass: e.assetClass, oldValue: e.old.toFixed(), maturedAmount: e.matured.toFixed(), cashAllocated: cash.toFixed(),
        buy: D.max(0, delta).toFixed(), sell: D.max(0, delta.neg()).toFixed(), newValue: target.toFixed() };
    });
    const cost = trades.reduce((s, t) => s.plus(t.buy).plus(t.sell), new D(0)).div(2).mul(costRate);
    return { trades, cost, unusedCash: free.minus(allocated) };
  };
  let low = new D(0), high = gross;
  for (let i = 0; i < 170; i++) {
    const mid = low.plus(high).div(2), r = at(mid);
    if (mid.plus(r.cost).gt(gross)) high = mid; else low = mid;
  }
  const decision = at(low);
  return { status: "PROPOSED" as const, issues: [], oldWeights: entries.map(e => ({ assetClass: e.assetClass, weightPercent: e.weight.toFixed() })),
    targetWeights: targets, newWeights: targets, reason: "ABSOLUTE_DRIFT_GREATER_THAN_BAND", bandPoints, costPercent,
    cost: decision.cost.toFixed(), trades: decision.trades, netValue: low.toFixed(),
    assumptions: ["CONTRIBUTIONS_AND_MATURITIES_FIRST", "MATURITIES_ALREADY_INCLUDED_IN_HOLDINGS", "HALF_L1_REMAINING_TRADES_TIMES_COST", "NO_INITIAL_PURCHASE_FEE_ON_FREE_CASH", "NO_TRADE_EXECUTION_OR_DB_WRITE"],
    cashUsedBeforeTrades: free.minus(decision.unusedCash).toFixed() };
}
