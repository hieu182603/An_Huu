import { addMonths, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D, type MonthlyInput, type ProjectionInput } from "../retirement/engine";
import { runPath, type RiskContext, type PathMarket } from "./simulation";
import { stressKinds, type RiskPolicy } from "./policy";
import type { RetirementPreview } from "../retirement/schema";
import type { Allocation } from "./rebalance";

/**
 * Pure function to dynamically extend a RiskContext and market timeseries
 * by extraYears (e.g. +60m to +120m) for longevity stress testing.
 * - Compounds living and medical/additional expenses with CPI inflation
 * - Continues active lifelong pensions (BHXH) and non-labor income
 * - Zeroes completed debts, planned contributions, and unexpected capital injections
 * - Preserves terminal defensive portfolio allocation
 * - Adheres strictly to Zero-Floor Liquidity
 */
export function extendLongevityContext(
  context: RiskContext,
  baseMarket: PathMarket[],
  extraYears: number
): { extendedContext: RiskContext; extendedMarket: PathMarket[]; endMonth: string } {
  if (!Number.isInteger(extraYears) || extraYears <= 0 || extraYears > 30) {
    throw new RangeError("Invalid extraYears for longevity extension");
  }
  const extraMonths = extraYears * 12;
  const originalRows = context.projection.rows;
  if (!originalRows.length) {
    throw new RangeError("Cannot extend empty projection rows");
  }

  const lastRow = originalRows.at(-1)!;
  const lastMonth = lastRow.month;
  const endMonth = addMonths(lastMonth, extraMonths);
  if (!monthSchema.safeParse(endMonth).success) {
    throw new RangeError("Extended endMonth exceeds calendar bounds");
  }

  const lastMarket = baseMarket.at(-1) ?? { cpi: "0", returns: {} };
  const lastTarget = context.targets.at(-1) ?? [];
  const lastEssential = new D(context.essentialExpenses.at(-1) ?? lastRow.livingExpense);
  const lastLiving = new D(lastRow.livingExpense);
  const lastPension = new D(lastRow.pension);
  const lastIncome = new D(lastRow.income);
  const lastAdditional = new D(lastRow.additionalExpense);

  const monthlyCpi = new D(lastMarket.cpi);
  const inflationFactor = monthlyCpi.plus(1);

  const extendedRows: MonthlyInput[] = structuredClone(originalRows);
  const extendedMarket: PathMarket[] = structuredClone(baseMarket);
  const extendedEssentialExpenses: string[] = structuredClone(context.essentialExpenses);
  const extendedTargets: Allocation[][] = structuredClone(context.targets);
  const extendedRebalance: boolean[] = structuredClone(context.rebalance);

  let currentLiving = lastLiving;
  let currentAdditional = lastAdditional;
  let currentEssential = lastEssential;

  for (let k = 1; k <= extraMonths; k++) {
    const month = addMonths(lastMonth, k);

    // 1. Trượt giá chi phí sinh hoạt và chi phí y tế/chăm sóc
    currentLiving = currentLiving.mul(inflationFactor);
    currentAdditional = currentAdditional.mul(inflationFactor);
    currentEssential = currentEssential.mul(inflationFactor);

    // 2. Thu nhập và lương hưu trọn đời
    const pension = lastPension;
    const income = lastIncome;
    const debtPayment = new D(0);

    // 3. Tính toán nhu cầu rút vốn theo ngân sách
    const netSpending = currentLiving.plus(currentAdditional).plus(debtPayment).minus(income).minus(pension);
    const capacity = D.max(0, netSpending.neg());
    const withdrawal = D.max(0, netSpending);

    extendedRows.push({
      month,
      growthFactor: lastRow.growthFactor,
      inflationFactor: inflationFactor.toFixed(),
      income: income.toFixed(),
      pension: pension.toFixed(),
      livingExpense: currentLiving.toFixed(),
      additionalExpense: currentAdditional.toFixed(),
      debtPayment: debtPayment.toFixed(),
      plannedContribution: "0",
      contribution: "0",
      contributionCapacity: "0",
      withdrawal: withdrawal.toFixed(),
      uninvestedSurplus: capacity.toFixed(),
      capitalInjection: "0",
    });

    extendedMarket.push({
      cpi: lastMarket.cpi,
      returns: { ...lastMarket.returns },
    });

    extendedEssentialExpenses.push(currentEssential.toFixed());
    extendedTargets.push(structuredClone(lastTarget));
    extendedRebalance.push(false);
  }

  const extendedProjection: ProjectionInput = {
    ...context.projection,
    rows: extendedRows,
  };

  const extendedSelection: RetirementPreview = {
    ...context.selection,
    endMonth,
  };

  const extendedContext: RiskContext = {
    ...context,
    projection: extendedProjection,
    selection: extendedSelection,
    essentialExpenses: extendedEssentialExpenses,
    targets: extendedTargets,
    rebalance: extendedRebalance,
  };

  return { extendedContext, extendedMarket, endMonth };
}

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
  propertyInjections?: Array<{ month: string; amount: string }>, longevityExtraYears?: number, extendedContext?: RiskContext, extendedMarket?: PathMarket[]) {
  const p = policy?.stresses?.[kind];
  const review = (issue: string) => ({ kind, status: "REVIEW_REQUIRED" as const, issues: [issue] });
  if (!p) return review("APPROVED_SCENARIO_PARAMETERS_REQUIRED");
  if (kind === "LONGEVITY") {
    const years = longevityExtraYears ?? ("extraYears" in p ? p.extraYears[0] : 5);
    try {
      const ext = (extendedContext && extendedMarket)
        ? { extendedContext, extendedMarket }
        : extendLongevityContext(context, baseMarket, years);
      return {
        kind,
        status: "READY" as const,
        parameters: p,
        result: runPath(ext.extendedContext, ext.extendedMarket),
        assumptions: [
          "SINGLE_SCENARIO_NOT_PROBABILITY",
          "LIFELONG_PENSION_CONTINUATION",
          "INFLATION_INDEXED_LIVING_EXPENSES",
          "TERMINAL_ALLOCATION_HELD",
          "ZERO_FLOOR_DEPLETION_NO_NEGATIVE_BORROWING",
        ],
      };
    } catch {
      return review("EXTENDED_SERVER_CASHFLOW_REQUIRED");
    }
  }
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

/** The deeper equity level of spec 9.1, run only when the approved policy configures severeShockPercent. */
export function severeEquityCrash(context: RiskContext, baseMarket: PathMarket[], policy: RiskPolicy | undefined) {
  const base = policy?.stresses?.EQUITY_CRASH;
  if (!base?.severeShockPercent) return null;
  const severePolicy = { ...policy!, stresses: { ...policy!.stresses, EQUITY_CRASH: { ...base, shockPercent: base.severeShockPercent } } };
  return { ...deterministicStress("EQUITY_CRASH", context, baseMarket, severePolicy), level: "SEVERE" as const };
}
