import { addMonths } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { runPath, type RiskContext, type PathMarket } from "./simulation";
import { stressKinds, type RiskPolicy } from "./policy";

/** Golden sequence example has BEGINNING-of-year withdrawals, deliberately
 * separate from the production monthly END-of-month withdrawal convention. */
export function sequenceOfReturns(initial: string, withdrawal: string, returns: string[]) {
  let funded = new D(initial), unmet = new D(0);
  for (const r of returns) {
    if (new D(r).lte(-1) || new D(initial).lt(0) || new D(withdrawal).lt(0)) throw new RangeError("Invalid sequence input");
    unmet = unmet.plus(D.max(0, new D(withdrawal).minus(funded)));
    funded = D.max(0, funded.minus(withdrawal)).mul(new D(r).plus(1));
  }
  return { fundedBalance: funded.toFixed(), unfundedWithdrawals: unmet.toFixed() };
}
export function deterministicStress(kind: typeof stressKinds[number], context: RiskContext, baseMarket: PathMarket[], policy: RiskPolicy | undefined,
  propertyInjections?: Array<{ month: string; amount: string }>) {
  const p = policy?.stresses?.[kind];
  const review = (issue: string) => ({ kind, status: "REVIEW_REQUIRED" as const, issues: [issue] });
  if (!p) return review("APPROVED_SCENARIO_PARAMETERS_REQUIRED");
  if (kind === "LONGEVITY") return review("EXTENDED_SERVER_CASHFLOW_REQUIRED");
  const market = structuredClone(baseMarket), rows = structuredClone(context.projection.rows);
  const configured = policy!.stresses!;
  const start = "offsetMonths" in p ? addMonths(context.projection.retirementMonth, p.offsetMonths) : "";
  const index = rows.findIndex(r => r.month === start);
  if (index < 0) return review("SCENARIO_OUTSIDE_PLAN_HORIZON");
  const end = "durationMonths" in p ? addMonths(start, p.durationMonths - 1) : start;
  if (end > rows.at(-1)!.month) return review("SCENARIO_OUTSIDE_PLAN_HORIZON");
  if (kind === "HIGH_INFLATION") {
    const params = configured.HIGH_INFLATION!;
    market.forEach((r, i) => { if (rows[i].month >= start && rows[i].month <= end)
      r.cpi = new D(r.cpi).plus(1).pow(12).plus(new D(params.annualDeltaPoints).div(100)).pow(new D(1).div(12)).minus(1).toFixed(); });
  } else if (kind === "INCOME_LOSS") {
    rows.forEach(r => { if (r.month >= start && r.month <= end) r.income = new D(r.income).mul(new D(1).minus(new D(configured.INCOME_LOSS!.lostPercent).div(100))).toFixed(); });
  } else if (kind === "PROPERTY_ILLIQUIDITY") {
    if (!propertyInjections) return review("PROPERTY_CASHFLOW_ATTRIBUTION_REQUIRED");
    const params = configured.PROPERTY_ILLIQUIDITY!;
    const affected = propertyInjections.filter(r => r.month >= start && r.month <= end);
    if (!affected.length) return { kind, status: "NOT_APPLICABLE" as const, issues: ["NO_PROPERTY_RELEASE_IN_STRESS_WINDOW"] };
    for (const injection of affected) {
      const original = rows.find(r => r.month === injection.month)!;
      if (new D(original.capitalInjection).lt(injection.amount)) return review("PROPERTY_CASHFLOW_ATTRIBUTION_REQUIRED");
      original.capitalInjection = new D(original.capitalInjection).minus(injection.amount).toFixed();
      const delayed = rows.find(r => r.month === addMonths(injection.month, params.delayMonths));
      // A delayed receipt beyond plan end is not available in this projection.
      if (delayed) delayed.capitalInjection = new D(delayed.capitalInjection).plus(new D(injection.amount).mul(new D(1).minus(new D(params.haircutPercent).div(100)))).toFixed();
    }
  } else {
    let asset: string, shock: InstanceType<typeof D>;
    if (kind === "EQUITY_CRASH") { const q = configured.EQUITY_CRASH!; asset = q.assetClass; shock = new D(q.shockPercent).div(100); }
    else if (kind === "RATE_RISE") { const q = configured.RATE_RISE!; asset = q.assetClass; shock = new D(q.durationYears).mul(q.yieldRisePoints).div(100).neg(); }
    else if (kind === "CREDIT") { const q = configured.CREDIT!; asset = q.assetClass; shock = new D(q.defaultPercent).div(100).mul(new D(1).minus(new D(q.recoveryPercent).div(100))).neg(); }
    else { const q = configured.GOLD!; asset = q.assetClass; shock = new D(1).plus(new D(q.shockPercent).div(100)).mul(new D(1).minus(new D(q.spreadPoints).div(100))).minus(1); }
    if (market[index].returns[asset] === undefined || shock.lte(-1)) return review("SCENARIO_ASSET_OR_FACTOR_INVALID");
    market[index].returns[asset] = new D(market[index].returns[asset]).plus(1).mul(shock.plus(1)).minus(1).toFixed();
  }
  return { kind, status: "READY" as const, parameters: p, result: runPath(context, market, rows),
    assumptions: ["SINGLE_SCENARIO_NOT_PROBABILITY", "RATE_RISE_FIRST_ORDER_DURATION", "GOLD_SPREAD_LIQUIDATION_MARK_AT_SHOCK", "INCOME_LOSS_ALL_NON_PENSION_INCOME"] };
}
