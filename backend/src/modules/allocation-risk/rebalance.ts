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
  record: z.boolean().optional(),
  compareProbabilities: z.boolean().optional(),
  planId: z.string().uuid().optional(),
  planVersionId: z.string().uuid().optional(),
  source: z.enum(["PROPOSAL", "MONITOR"]).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.compareProbabilities && (!v.planId || !v.planVersionId))
    ctx.addIssue({ code: "custom", message: "So sánh xác suất cần kế hoạch và phiên bản thuộc tài khoản." });
  if (new Set(v.holdings.map(h => h.assetClass)).size !== v.holdings.length || v.holdings.some(h => new D(h.maturedAmount).gt(h.value)))
    ctx.addIssue({ code: "custom", message: "Trùng tài sản hoặc đáo hạn vượt giá trị nắm giữ." });
});
export type RebalanceSpendingFloor = { safeAssets: string[]; minSafeFraction: string };
export type Allocation = { assetClass: string; weightPercent: string };
export type RebalanceTaxAndFeePolicy = {
  evidence: string;
  saleTaxPercent?: string;
  transactionFeePercent?: string;
};
export function validWeights(weights: Allocation[]) {
  return weights.length > 0 && new Set(weights.map(w => w.assetClass)).size === weights.length &&
    weights.every(w => new D(w.weightPercent).isFinite() && new D(w.weightPercent).gte(0)) &&
    weights.reduce((s, w) => s.plus(w.weightPercent), new D(0)).eq(100);
}
export function proposeRebalance(
  input: z.infer<typeof rebalanceInputSchema>,
  targets: Allocation[],
  bandPoints: string,
  costPercent: string,
  rebalancePolicy?: RebalanceTaxAndFeePolicy,
  spendingFloor?: RebalanceSpendingFloor,
) {
  rebalanceInputSchema.parse(input);
  const saleTaxPercent = rebalancePolicy?.saleTaxPercent;
  const transactionFeePercent = rebalancePolicy?.transactionFeePercent;
  if (!validWeights(targets) || new D(bandPoints).lt(0) || new D(bandPoints).gt(100) || new D(costPercent).lt(0) || new D(costPercent).gte(100) ||
    (saleTaxPercent !== undefined && (new D(saleTaxPercent).lt(0) || new D(saleTaxPercent).gte(100))) ||
    (transactionFeePercent !== undefined && (new D(transactionFeePercent).lt(0) || new D(transactionFeePercent).gte(100))) ||
    input.holdings.some(h => !targets.some(t => t.assetClass === h.assetClass))) throw new RangeError("Invalid rebalance configuration");
  if (spendingFloor && (!new D(spendingFloor.minSafeFraction).isFinite() || new D(spendingFloor.minSafeFraction).lt(0) || new D(spendingFloor.minSafeFraction).gt(1) ||
    (input.month >= input.retirementMonth && targets.filter(t=>spendingFloor.safeAssets.includes(t.assetClass)).reduce((s,t)=>s.plus(t.weightPercent),new D(0)).div(100).plus("1e-12").lt(spendingFloor.minSafeFraction))))
    throw new RangeError("Invalid spending floor target");
  const total = input.holdings.reduce((s, h) => s.plus(h.value), new D(0));
  if (total.isZero()) return { status: "REVIEW_REQUIRED" as const, issues: ["POSITIVE_HOLDINGS_REQUIRED"] };
  const gross = total.plus(input.newContribution), costRate = new D(costPercent).div(100);
  const saleTaxRate = saleTaxPercent !== undefined ? new D(saleTaxPercent).div(100) : null;
  const txFeeRate = transactionFeePercent !== undefined ? new D(transactionFeePercent).div(100) : null;
  const entries = targets.map(t => {
    const h = input.holdings.find(h => h.assetClass === t.assetClass);
    const old = new D(h?.value ?? "0"), matured = new D(h?.maturedAmount ?? "0");
    return { ...t, old, retained: old.minus(matured), matured, weight: old.div(total).mul(100) };
  });
  const free = new D(input.newContribution).plus(entries.reduce((s, e) => s.plus(e.matured), new D(0)));
  const allocateCash = (net: InstanceType<typeof D>) => {
    const deficits = entries.map(e => D.max(0, net.mul(e.weightPercent).div(100).minus(e.retained)));
    const demand = deficits.reduce((s, d) => s.plus(d), new D(0));
    const allocated = D.min(free, demand);
    const lastDeficit = deficits.reduce((last, deficit, i) => deficit.gt(0) ? i : last, -1);
    let remaining = allocated;
    const cash = deficits.map((deficit, i) => {
      const amount = i === lastDeficit ? remaining : demand.gt(0) ? allocated.mul(deficit).div(demand) : new D(0);
      remaining = remaining.minus(amount);
      return amount;
    });
    return { cash, allocated };
  };
  const assumptions = [
    "CONTRIBUTIONS_AND_MATURITIES_FIRST",
    "MATURITIES_ALREADY_INCLUDED_IN_HOLDINGS",
    "ABSOLUTE_DRIFT_CHECKED_AFTER_FREE_CASH_ALLOCATION",
    txFeeRate !== null ? "EXPLICIT_TRANSACTION_FEE_ON_BUY_AND_SELL" : "HALF_L1_REMAINING_TRADES_TIMES_COST",
    saleTaxRate !== null ? "SALE_TAX_ON_SELL_VALUE" : "TAX_NOT_MODELED",
    "NO_INITIAL_PURCHASE_FEE_ON_FREE_CASH",
    "NO_TRADE_EXECUTION_OR_DB_WRITE",
  ];
  const initialCash = allocateCash(gross);
  const afterCash = entries.map((e, i) => e.retained.plus(initialCash.cash[i]));
  const afterCashWeights = afterCash.map(value => value.div(gross).mul(100));
  const floorBreached = !!spendingFloor && input.month >= input.retirementMonth && entries.reduce((s,e,i) =>
    spendingFloor.safeAssets.includes(e.assetClass) ? s.plus(afterCash[i]) : s,new D(0)).div(gross).plus("1e-12").lt(spendingFloor.minSafeFraction);
  const triggered = floorBreached || entries.some((e, i) => afterCashWeights[i].minus(e.weightPercent).abs().gte(bandPoints));
  if (!triggered) {
    if (free.isZero()) return { status: "WITHIN_BAND" as const, issues: [], oldWeights: entries.map(e => ({ assetClass: e.assetClass, weightPercent: e.weight.toFixed() })),
      targetWeights: targets, bandPoints, costPercent, reason: "ABSOLUTE_DRIFT_NOT_GREATER_THAN_BAND", trigger: "BELOW_BAND" as const, cost: "0", trades: [], unallocatedNewContribution: input.newContribution };
    // Cash can restore the band without forcing the entire portfolio to its exact target.
    let remainingWeight = new D(100);
    const newWeights = entries.map((e, i) => {
      const weight = i === entries.length - 1 ? remainingWeight : afterCashWeights[i];
      remainingWeight = remainingWeight.minus(weight);
      return { assetClass: e.assetClass, weightPercent: weight.toFixed() };
    });
    return { status: "PROPOSED" as const, issues: [], oldWeights: entries.map(e => ({ assetClass: e.assetClass, weightPercent: e.weight.toFixed() })),
      targetWeights: targets, newWeights, reason: "ABSOLUTE_DRIFT_NOT_GREATER_THAN_BAND", trigger: "BELOW_BAND" as const, bandPoints, costPercent,
      cost: "0", netValue: gross.toFixed(), trades: entries.map((e, i) => ({ assetClass: e.assetClass, oldValue: e.old.toFixed(),
        maturedAmount: e.matured.toFixed(), cashAllocated: initialCash.cash[i].toFixed(), buy: "0", sell: "0", newValue: afterCash[i].toFixed() })),
      ...(rebalancePolicy ? { taxAmount: "0", transactionFeeAmount: "0", taxEvidence: rebalancePolicy.evidence } : {}),
      assumptions: [...assumptions, "CASH_ALLOCATION_WITHIN_BAND_NO_TRADES"], cashUsedBeforeTrades: initialCash.allocated.toFixed() };
  }
  // Solve net assets = gross assets - trading cost (and optional sale tax) on remaining buys
  // and sells, after assigning free cash (contribution+maturities) to deficits.
  const at = (net: InstanceType<typeof D>) => {
    const allocation = allocateCash(net);
    const trades = entries.map((e, i) => {
      const cash = allocation.cash[i];
      const target = net.mul(e.weightPercent).div(100), delta = target.minus(e.retained).minus(cash);
      return { assetClass: e.assetClass, oldValue: e.old.toFixed(), maturedAmount: e.matured.toFixed(), cashAllocated: cash.toFixed(),
        buy: D.max(0, delta).toFixed(), sell: D.max(0, delta.neg()).toFixed(), newValue: target.toFixed() };
    });
    const buyTotal = trades.reduce((s, t) => s.plus(t.buy), new D(0));
    const sellTotal = trades.reduce((s, t) => s.plus(t.sell), new D(0));
    // Explicit transactionFeePercent replaces the generic half-L1 turnover cost to avoid double-counting trading fees.
    const feeCost = txFeeRate !== null ? buyTotal.plus(sellTotal).mul(txFeeRate) : buyTotal.plus(sellTotal).div(2).mul(costRate);
    const taxCost = saleTaxRate !== null ? sellTotal.mul(saleTaxRate) : new D(0);
    return { trades, feeCost, taxCost, cost: feeCost.plus(taxCost), unusedCash: free.minus(allocation.allocated) };
  };
  let low = new D(0), high = gross;
  for (let i = 0; i < 170; i++) {
    const mid = low.plus(high).div(2), r = at(mid);
    if (mid.plus(r.cost).gt(gross)) high = mid; else low = mid;
  }
  const decision = at(low);
  return { status: "PROPOSED" as const, issues: [], oldWeights: entries.map(e => ({ assetClass: e.assetClass, weightPercent: e.weight.toFixed() })),
    targetWeights: targets, newWeights: targets, reason: floorBreached ? "SPENDING_FLOOR_BREACHED" : "ABSOLUTE_DRIFT_GREATER_THAN_BAND", trigger: floorBreached ? "SPENDING_FLOOR_BREACHED" as const : "AT_OR_ABOVE_BAND" as const, bandPoints, costPercent,
    cost: decision.cost.toFixed(), trades: decision.trades, netValue: low.toFixed(),
    ...(rebalancePolicy ? { taxAmount: decision.taxCost.toFixed(), transactionFeeAmount: decision.feeCost.toFixed(), taxEvidence: rebalancePolicy.evidence } : {}),
    assumptions: floorBreached ? [...assumptions, "SPENDING_FLOOR_OVERRIDES_TOLERANCE_BAND"] : assumptions,
    cashUsedBeforeTrades: free.minus(decision.unusedCash).toFixed() };
}
