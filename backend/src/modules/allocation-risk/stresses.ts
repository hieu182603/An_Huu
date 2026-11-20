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
  const originalRows = context.projection.protection?.rawRows ?? context.projection.rows;
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
    ...(context.projection.protection?{protection:{...context.projection.protection,rawRows:extendedRows,
      depositFactors:[...context.projection.protection.depositFactors,...Array.from({length:extraMonths},()=>new D(lastMarket.returns[context.projection.protection!.depositAssetClass]).plus(1).toFixed())]}}:{}),
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

/** Golden sequence example has BEGINNING-of-period withdrawals: it now matches the production
 * retirement-monthly-v5 convention (spec 7.2) and differs only from the legacy END-of-month v3. */
export function sequenceOfReturns(initial: string, withdrawal: string, returns: string[]) {
  let funded = new D(initial), unmet = new D(0);
  for (const r of returns) {
    if (new D(r).lte(-1) || new D(initial).lt(0) || new D(withdrawal).lt(0)) throw new RangeError("Invalid sequence input");
    unmet = unmet.plus(D.max(0, new D(withdrawal).minus(funded)));
    funded = D.max(0, funded.minus(withdrawal)).mul(new D(r).plus(1));
  }
  return { fundedBalance: funded.toFixed(), unfundedWithdrawals: unmet.toFixed() };
}
export type StressExtraInputs = {
  /** Per-month nominal HEALTH expense aligned with context.projection.rows (for HIGH_INFLATION.healthDeltaPoints). */
  healthExpenses?: string[];
  /** Customer birthMonth YYYY-MM (for LONGEVITY.lateLifeCareMonthly starting at age 75). */
  birthMonth?: string;
};

/** Add approved late-life care monthly expense from age 75 onward (B6-6, off when parameter absent). */
export function applyLateLifeCare(context: RiskContext, birthMonth: string, lateLifeCareMonthly: string): RiskContext {
  const care = new D(lateLifeCareMonthly);
  if (!monthSchema.safeParse(birthMonth).success || care.lte(0)) return context;
  const age75Month = addMonths(birthMonth, 75 * 12);
  const addCare = (rows: MonthlyInput[]) => rows.map(r => {
    if (r.month < age75Month) return r;
    const additionalExpense = new D(r.additionalExpense).plus(care);
    const netSpending = new D(r.livingExpense).plus(additionalExpense).plus(r.debtPayment).minus(r.income).minus(r.pension);
    return {
      ...r,
      additionalExpense: additionalExpense.toFixed(),
      withdrawal: D.max(0, netSpending).toFixed(),
      uninvestedSurplus: D.max(0, netSpending.neg()).toFixed(),
    };
  });
  const rows = addCare(context.projection.rows);
  const protection = context.projection.protection
    ? { ...context.projection.protection, ...(context.projection.protection.rawRows ? { rawRows: addCare(context.projection.protection.rawRows) } : {}) }
    : undefined;
  const essentialExpenses = context.essentialExpenses.map((amount, i) =>
    context.projection.rows[i].month >= age75Month ? new D(amount).plus(care).toFixed() : amount);
  return { ...context, essentialExpenses, projection: { ...context.projection, rows, ...(protection ? { protection } : {}) } };
}

type StressKind = typeof stressKinds[number];
type StressPathResult = ReturnType<typeof runPath> & {
  lossFirstTerminalBalance?: string; gainFirstTerminalBalance?: string; balanceDifference?: string;
};
type ScenarioCommon = {
  kind: StressKind; parameters?: Record<string, unknown>; firstShortfallMonth?: string | null;
  assumptions?: string[]; issues?: string[]; level?: "SEVERE"; windowAdjusted?: boolean;
  window?: { from: string; to: string };
};
type ScenarioSingle = ScenarioCommon & (
  { status: "READY"; result: StressPathResult }
  | { status: "REVIEW_REQUIRED" | "NOT_APPLICABLE"; result?: never }
);
export type StressScenario = ScenarioSingle & {
  offsets?: Array<ScenarioSingle & { offsetMonths: number }>;
  worstOffsetMonths?: number;
  orders?: Array<{ order: "LOSS_FIRST" | "GAIN_FIRST"; annualReturns: string[]; result: StressPathResult }>;
};
const firstShortfall = (result: StressPathResult) =>
  (result as StressPathResult & { firstShortfallMonth?: string | null }).firstShortfallMonth ?? null;

/** Compare household outcomes, rather than the size of the market shock itself. */
function worseScenario(a: ScenarioSingle & { status: "READY" }, b: ScenarioSingle & { status: "READY" }) {
  for (const key of ["essentialLossToday", "unfundedWithdrawals"] as const) {
    const comparison = new D(a.result[key]).cmp(b.result[key]);
    if (comparison) return comparison > 0;
  }
  return new D(a.result.fundedTerminalBalance).lt(b.result.fundedTerminalBalance);
}

function sequenceStress(context: RiskContext, baseMarket: PathMarket[], policy: RiskPolicy): StressScenario {
  const kind = "SEQUENCE_OF_RETURNS" as const, p = policy.stresses!.SEQUENCE_OF_RETURNS!;
  const start = context.projection.rows.findIndex(r => r.month === context.projection.retirementMonth);
  if (start < 0 || start + 60 > baseMarket.length)
    return { kind, status: "REVIEW_REQUIRED", issues: ["SEQUENCE_WINDOW_REQUIRES_FIVE_YEARS"], firstShortfallMonth: null };
  const blocks = Array.from({ length: 5 }, (_, year) => {
    const vectors = baseMarket.slice(start + year * 12, start + (year + 1) * 12).map(r => ({ ...r.returns }));
    if (vectors.some(r => r[p.assetClass] === undefined || new D(r[p.assetClass]).lte(-1))) throw new RangeError("Sequence asset data required");
    if (year < 2) {
      const annualPercent = year === 0 ? p.annualLossPercent : p.annualGainPercent;
      const monthly = new D(1).plus(new D(annualPercent).div(100)).pow(new D(1).div(12)).minus(1).toFixed();
      vectors.forEach(r => { r[p.assetClass] = monthly; });
    }
    const annualReturn = vectors.reduce((value, r) => value.mul(new D(r[p.assetClass]).plus(1)), new D(1)).minus(1).toFixed();
    return { vectors, annualReturn };
  });
  const losses = blocks.filter(b => new D(b.annualReturn).lt(0)), gains = blocks.filter(b => new D(b.annualReturn).gte(0));
  const runOrder = (order: "LOSS_FIRST" | "GAIN_FIRST", ordered: typeof blocks) => {
    const market = structuredClone(baseMarket);
    // Move complete asset-return vectors together; CPI and household flows stay on their original dates.
    ordered.flatMap(b => b.vectors).forEach((value, i) => { market[start + i].returns = { ...value }; });
    return { order, annualReturns: ordered.map(b => b.annualReturn), result: runPath(context, market) };
  };
  const lossFirst = runOrder("LOSS_FIRST", [...losses, ...gains]);
  const gainFirst = runOrder("GAIN_FIRST", [...gains, ...losses]);
  const result = { ...lossFirst.result, lossFirstTerminalBalance: lossFirst.result.fundedTerminalBalance,
    gainFirstTerminalBalance: gainFirst.result.fundedTerminalBalance,
    balanceDifference: new D(gainFirst.result.fundedTerminalBalance).minus(lossFirst.result.fundedTerminalBalance).toFixed() };
  return { kind, status: "READY", parameters: p, result, firstShortfallMonth: firstShortfall(result),
    orders: [lossFirst, gainFirst], assumptions: ["SINGLE_SCENARIO_NOT_PROBABILITY", "SAME_MONTHLY_RETURN_MULTISET_DIFFERENT_ORDER",
      "FIRST_FIVE_RETIREMENT_YEARS", "CPI_AND_HOUSEHOLD_CASHFLOWS_UNCHANGED"] };
}

export function deterministicStress(kind: StressKind, context: RiskContext, baseMarket: PathMarket[], policy: RiskPolicy | undefined,
  propertyInjections?: Array<{ month: string; amount: string }>, longevityExtraYears?: number, extendedContext?: RiskContext, extendedMarket?: PathMarket[],
  extra?: StressExtraInputs): StressScenario {
  const p = policy?.stresses?.[kind];
  const review = (issue: string): StressScenario => ({ kind, status: "REVIEW_REQUIRED", issues: [issue], firstShortfallMonth: null });
  if (!p) return review("APPROVED_SCENARIO_PARAMETERS_REQUIRED");
  if (kind === "SEQUENCE_OF_RETURNS") {
    try { return sequenceStress(context, baseMarket, policy!); }
    catch { return review("SCENARIO_ASSET_OR_FACTOR_INVALID"); }
  }
  if (kind === "EQUITY_CRASH" && policy!.stresses!.EQUITY_CRASH!.offsetsMonths) {
    const configured = policy!.stresses!.EQUITY_CRASH!;
    const offsets = configured.offsetsMonths!.map(offsetMonths => ({ offsetMonths,
      ...deterministicStress(kind, context, baseMarket, { ...policy!, stresses: { ...policy!.stresses,
        EQUITY_CRASH: { ...configured, offsetMonths, offsetsMonths: undefined } } }) }));
    const ready = offsets.filter((r): r is typeof r & { status: "READY" } => r.status === "READY");
    if (!ready.length) return { ...review("SCENARIO_OUTSIDE_PLAN_HORIZON"), parameters: configured, offsets };
    const worst = ready.reduce((a, b) => worseScenario(b, a) ? b : a);
    return { ...worst, parameters: configured, offsets, worstOffsetMonths: worst.offsetMonths,
      ...(ready.length < offsets.length ? { issues: ["SOME_SCENARIO_OFFSETS_OUTSIDE_PLAN_HORIZON"] } : {}),
      assumptions: [...(worst.assumptions ?? []), "WORST_OF_EVALUATED_OFFSETS"] };
  }
  if (kind === "LONGEVITY") {
    const years = longevityExtraYears ?? ("extraYears" in p ? p.extraYears[0] : 5);
    try {
      const ext = (extendedContext && extendedMarket)
        ? { extendedContext, extendedMarket }
        : extendLongevityContext(context, baseMarket, years);
      const runCtx = "lateLifeCareMonthly" in p && p.lateLifeCareMonthly && extra?.birthMonth
        ? applyLateLifeCare(ext.extendedContext, extra.birthMonth, p.lateLifeCareMonthly)
        : ext.extendedContext;
      const result = runPath(runCtx, ext.extendedMarket);
      return {
        kind, status: "READY", parameters: p, result, firstShortfallMonth: firstShortfall(result),
        assumptions: ["SINGLE_SCENARIO_NOT_PROBABILITY", "LIFELONG_PENSION_CONTINUATION", "INFLATION_INDEXED_LIVING_EXPENSES",
          "TERMINAL_ALLOCATION_HELD", "ZERO_FLOOR_DEPLETION_NO_NEGATIVE_BORROWING"],
      };
    } catch { return review("EXTENDED_SERVER_CASHFLOW_REQUIRED"); }
  }
  const market = structuredClone(baseMarket), rows = structuredClone(context.projection.protection?.rawRows ?? context.projection.rows);
  const configured = policy!.stresses!;
  if (!rows.length) return review("SCENARIO_OUTSIDE_PLAN_HORIZON");
  const originalStart = "offsetMonths" in p && p.offsetMonths !== undefined ? addMonths(context.projection.retirementMonth, p.offsetMonths) : "";
  let start = originalStart, end = "durationMonths" in p ? addMonths(start, p.durationMonths - 1) : start;
  const originalEnd = end;
  if (kind === "INCOME_LOSS") {
    // A lost working income window cannot run before valuation or into retirement.
    const firstAccumulation = rows[0].month > context.projection.valuationDate.slice(0, 7)
      ? rows[0].month : context.projection.valuationDate.slice(0, 7);
    const lastAccumulation = rows.at(-1)!.month < context.projection.retirementMonth
      ? rows.at(-1)!.month : addMonths(context.projection.retirementMonth, -1);
    start = start < firstAccumulation ? firstAccumulation : start;
    end = addMonths(start, configured.INCOME_LOSS!.durationMonths - 1);
    if (end > lastAccumulation) end = lastAccumulation;
    if (start > end) return { kind, status: "NOT_APPLICABLE", parameters: p,
      issues: ["NO_ACCUMULATION_MONTHS"], firstShortfallMonth: null };
  }
  const index = rows.findIndex(r => r.month === start);
  if (index < 0 || end > rows.at(-1)!.month) return review("SCENARIO_OUTSIDE_PLAN_HORIZON");
  const essentialExpenses = [...context.essentialExpenses];
  if (kind === "HIGH_INFLATION") {
    const params = configured.HIGH_INFLATION!;
    market.forEach((r, i) => { if (rows[i].month >= start && rows[i].month <= end)
      r.cpi = new D(r.cpi).plus(new D(params.annualDeltaPoints).div(1200)).toFixed(); });
    if (params.healthDeltaPoints && extra?.healthExpenses?.length) {
      const monthlyHealthDelta = new D(params.healthDeltaPoints).div(1200);
      let healthFactor = new D(1);
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].month >= start && rows[i].month <= end) healthFactor = healthFactor.mul(new D(1).plus(monthlyHealthDelta));
        const baseHealth = new D(extra.healthExpenses[i] ?? "0");
        if (healthFactor.gt(1) && baseHealth.gt(0)) {
          const delta = baseHealth.mul(healthFactor.minus(1));
          rows[i].additionalExpense = new D(rows[i].additionalExpense).plus(delta).toFixed();
          essentialExpenses[i] = new D(essentialExpenses[i]).plus(delta).toFixed();
        }
      }
    }
  } else if (kind === "INCOME_LOSS") {
    rows.forEach(r => { if (r.month >= start && r.month <= end) r.income = new D(r.income).mul(new D(1).minus(new D(configured.INCOME_LOSS!.lostPercent).div(100))).toFixed(); });
  } else if (kind === "PROPERTY_ILLIQUIDITY") {
    if (!propertyInjections) return review("PROPERTY_CASHFLOW_ATTRIBUTION_REQUIRED");
    const params = configured.PROPERTY_ILLIQUIDITY!;
    const affected = propertyInjections.filter(r => r.month >= start && r.month <= end);
    if (!affected.length) return { kind, status: "NOT_APPLICABLE", issues: ["NO_PROPERTY_RELEASE_IN_STRESS_WINDOW"], firstShortfallMonth: null };
    for (const injection of affected) {
      const original = rows.find(r => r.month === injection.month)!;
      if (new D(original.capitalInjection).lt(injection.amount)) return review("PROPERTY_CASHFLOW_ATTRIBUTION_REQUIRED");
      original.capitalInjection = new D(original.capitalInjection).minus(injection.amount).toFixed();
      const delayed = rows.find(r => r.month === addMonths(injection.month, params.delayMonths));
      if (delayed) delayed.capitalInjection = new D(delayed.capitalInjection).plus(new D(injection.amount).mul(new D(1).minus(new D(params.haircutPercent).div(100)))).toFixed();
    }
  } else {
    let asset: string, shock: InstanceType<typeof D>;
    if (kind === "EQUITY_CRASH") { const q = configured.EQUITY_CRASH!; asset = q.assetClass; shock = new D(q.shockPercent).div(100); }
    else if (kind === "RATE_RISE") { const q = configured.RATE_RISE!; asset = q.assetClass; shock = new D(q.durationYears).mul(q.yieldRisePoints).div(100).neg(); }
    else if (kind === "CREDIT") { const q = configured.CREDIT!; asset = q.assetClass; shock = new D(q.defaultPercent).div(100).mul(new D(1).minus(new D(q.recoveryPercent).div(100))).neg(); }
    else {
      const q = configured.GOLD!; asset = q.assetClass;
      const spread = Array.isArray(q.spreadPoints) ? q.spreadPoints[0] : q.spreadPoints;
      shock = new D(1).plus(new D(q.shockPercent).div(100)).mul(new D(1).minus(new D(spread).div(100))).minus(1);
    }
    if (!market[index] || market[index].returns[asset] === undefined || shock.lte(-1)) return review("SCENARIO_ASSET_OR_FACTOR_INVALID");
    market[index].returns[asset] = new D(market[index].returns[asset]).plus(1).mul(shock.plus(1)).minus(1).toFixed();
  }
  const result = runPath({ ...context, essentialExpenses }, market, rows);
  return { kind, status: "READY", parameters: p, result, firstShortfallMonth: firstShortfall(result),
    ...(kind === "INCOME_LOSS" ? { window: { from: start, to: end }, ...(start !== originalStart || end !== originalEnd ? { windowAdjusted: true } : {}) } : {}),
    assumptions: ["SINGLE_SCENARIO_NOT_PROBABILITY", "RATE_RISE_FIRST_ORDER_DURATION", "GOLD_SPREAD_LIQUIDATION_MARK_AT_SHOCK", "INCOME_LOSS_ALL_NON_PENSION_INCOME"] };
}

/** The deeper equity level is optional and uses exactly the same set of timing offsets. */
export function severeEquityCrash(context: RiskContext, baseMarket: PathMarket[], policy: RiskPolicy | undefined): StressScenario | null {
  const base = policy?.stresses?.EQUITY_CRASH;
  if (!base?.severeShockPercent) return null;
  const severePolicy = { ...policy!, stresses: { ...policy!.stresses, EQUITY_CRASH: { ...base, shockPercent: base.severeShockPercent } } };
  return { ...deterministicStress("EQUITY_CRASH", context, baseMarket, severePolicy), level: "SEVERE" };
}

/** Public scenario rows, keeping old scalar gold/equity configurations unchanged. */
export function deterministicScenarios(context: RiskContext, market: PathMarket[], policy: RiskPolicy | undefined,
  propertyInjections?: Array<{ month: string; amount: string }>, extra?: StressExtraInputs): StressScenario[] {
  return stressKinds.filter(kind => kind !== "LONGEVITY").flatMap(kind => {
    if (kind === "EQUITY_CRASH") {
      const base = deterministicStress(kind, context, market, policy), severe = severeEquityCrash(context, market, policy);
      return severe ? [base, severe] : [base];
    }
    const gold = policy?.stresses?.GOLD;
    if (kind === "GOLD" && gold && Array.isArray(gold.spreadPoints)) {
      const spreads = gold.spreadPoints, maximum = D.max(...spreads);
      return spreads.map(spreadPoints => {
        const configured = { ...policy!, stresses: { ...policy!.stresses, GOLD: { ...gold, spreadPoints } } };
        return { ...deterministicStress(kind, context, market, configured),
          ...(spreads.length > 1 && new D(spreadPoints).eq(maximum) ? { level: "SEVERE" as const } : {}) };
      });
    }
    return [deterministicStress(kind, context, market, policy, propertyInjections, undefined, undefined, undefined, extra)];
  });
}
