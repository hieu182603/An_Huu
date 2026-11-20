import { AppError } from "../../common/errors";
import { RetirementDecimal as D, decimal, type MonthlyInput } from "../retirement/engine-core";
import { prepareV5Structure, projectFundedLedgerV5, type V5LedgerRow, type V5MonthHook, type V5Structure } from "../retirement/engine-v5";
import { protectCashflowsFast, type FastProtectionGoal } from "../retirement/protected-capital";
import { validWeights, type Allocation } from "./rebalance";
import type { RiskContext, PathMarket } from "./simulation";

/** Fast Monte Carlo path kernel (Decimal values end to end). Every function performs the same Decimal operations, in the same
 * order and at the same precision, as the string-based code it replaces, so results are bit-identical: only parsing,
 * toFixed round trips, container rebuilding and path-independent work are removed. */
type Dec = InstanceType<typeof D>;
const ZERO = new D(0), ONE = new D(1), TWO = new D(2), HUNDRED = new D(100);
/** max(0, v) (same value as D.max(0, v)). */
const pp = (v: Dec) => v.isZero() || v.isNeg() ? ZERO : v;
/** D.min(a, b) for finite values. */
const min2 = (a: Dec, b: Dec) => a.gt(b) ? b : a;
const isPos = (v: Dec) => !v.isZero() && v.isPositive();
const sum = (values: Dec[]) => { let s = ZERO; for (const v of values) s = s.plus(v); return s; };

type ParsedTargets = { codes: string[]; weight: Dec[]; percent: Dec[]; percentApprox: number[]; index: Map<string, number> };
const targetCache = new WeakMap<Allocation[], ParsedTargets>();
/** Validated, parsed targets (weight = percent / 100). Throws exactly like the per-month check it replaces. */
export function parsedTargets(targets: Allocation[]): ParsedTargets {
  let parsed = targetCache.get(targets);
  if (parsed) return parsed;
  if (!validWeights(targets)) throw new RangeError("Missing asset or invalid allocation");
  const percent = targets.map(t => new D(t.weightPercent));
  targetCache.set(targets, parsed = { codes: targets.map(t => t.assetClass), percent, percentApprox: percent.map(approx), weight: percent.map(p => p.div(HUNDRED)),
    index: new Map(targets.map((t, i) => [t.assetClass, i])) });
  return parsed;
}
const BASE_WORD = 1e7;
/** About 15 significant digits of a finite Decimal as a double (NaN when it cannot be represented). Only used to decide comparisons
 * that are far from their threshold; anything within the safety margin is decided with exact Decimal arithmetic. */
export function approx(v: Dec): number {
  const d = v.d;
  if (!d || !d.length) return NaN;
  const d0 = d[0];
  if (d0 === 0) return 0;
  const digits = d0 < 10 ? 1 : d0 < 100 ? 2 : d0 < 1e3 ? 3 : d0 < 1e4 ? 4 : d0 < 1e5 ? 5 : d0 < 1e6 ? 6 : 7;
  const r = (d0 + (d[1] ?? 0) / BASE_WORD + (d[2] ?? 0) / 1e14) * 10 ** (v.e - digits + 1);
  return Number.isFinite(r) && r !== 0 ? (v.isNeg() ? -r : r) : NaN;
}
/** Floating-point pre-check of bandExceeded (>= band): true / false when every asset is clearly (more than 1e-9 relative)
 * strictly above / below the band; undefined within ±margin (including exact equality drift == band) so exact Decimal decides. */
function screenBand(codes: string[], vals: Dec[], invested: Dec, targets: ParsedTargets, bandApprox: number): boolean | undefined {
  const total = approx(invested);
  if (!(total > 0) || !Number.isFinite(bandApprox)) return undefined;
  let uncertain = false;
  const decide = (weight: number, drift: number) => {
    if (!Number.isFinite(drift)) return undefined;
    const margin = 1e-9 * (1 + drift + Math.abs(bandApprox) + Math.abs(weight)), diff = drift - bandApprox;
    if (diff > margin) return true;
    if (diff >= -margin) uncertain = true;
    return false;
  };
  const weights = vals.map(v => approx(v) / total * 100);
  for (let t = 0; t < targets.codes.length; t++) {
    const k = codes.indexOf(targets.codes[t]), weight = k < 0 ? 0 : weights[k];
    const outcome = decide(weight, Math.abs(targets.percentApprox[t] - weight));
    if (outcome === undefined) return undefined;
    if (outcome) return true;
  }
  for (let k = 0; k < codes.length; k++) if (!targets.index.has(codes[k])) {
    const outcome = decide(weights[k], Math.abs(weights[k]));
    if (outcome === undefined) return undefined;
    if (outcome) return true;
  }
  return uncertain ? undefined : false;
}
const requireReturns = (targets: ParsedTargets, row: PathMarket) => {
  for (const code of targets.codes) if (row.returns[code] === undefined) throw new RangeError("Missing asset or invalid allocation");
};
const bandCache = new Map<string, Dec>(), rateCache = new Map<string, { percent: Dec; fraction: Dec }>();
const parsedBand = (band: string) => { let v = bandCache.get(band); if (!v) bandCache.set(band, v = new D(band)); return v; };
const parsedRate = (percent: string) => { let v = rateCache.get(percent); if (!v) rateCache.set(percent, v = { percent: new D(percent), fraction: new D(percent).div(HUNDRED) }); return v; };

type ParsedMarket = { cpiFactor: Dec; onePlus: Map<string, Dec> };
const marketCache = new WeakMap<PathMarket, ParsedMarket>();
function parsedMarket(row: PathMarket): ParsedMarket {
  let parsed = marketCache.get(row);
  if (!parsed) marketCache.set(row, parsed = { cpiFactor: new D(row.cpi).plus(1), onePlus: new Map() });
  return parsed;
}
/** 1 + return of one asset in this market row (undefined when the row has no such asset). */
function onePlus(row: PathMarket, parsed: ParsedMarket, code: string) {
  let v = parsed.onePlus.get(code);
  if (v) return v;
  const text = row.returns[code];
  if (text === undefined) return undefined;
  parsed.onePlus.set(code, v = new D(text).plus(1));
  return v;
}

/** Same trigger as bandTriggered (spec §8.2): some asset's absolute drift from target is at least the band (>=). `weightOf(k)` is the weight
 * of the k-th held asset (cached by the caller); target assets that are not held count as weight 0. */
function bandExceeded(codes: string[], weightOf: (k: number) => Dec, targets: ParsedTargets, band: Dec) {
  const weight100: Dec[] = [];
  const at = (k: number) => weight100[k] ??= weightOf(k).mul(HUNDRED);
  for (let t = 0; t < targets.codes.length; t++) {
    const k = codes.indexOf(targets.codes[t]);
    if (targets.percent[t].minus(k < 0 ? ZERO.mul(HUNDRED) : at(k)).abs().gte(band)) return true;
  }
  for (let k = 0; k < codes.length; k++) if (!targets.index.has(codes[k]) && ZERO.minus(at(k)).abs().gte(band)) return true;
  return false;
}

/** Per-month gross factor and trading cost of a fixed-weights portfolio (v3 folds the cost into `net`). */
export function portfolioLegsFast(context: RiskContext, market: PathMarket[], withNet: boolean) {
  let codes: string[] = [], weights: Dec[] = [];
  const costPercent = parsedRate(context.turnoverCostPercent).percent, band = context.rebalanceBandPoints;
  const bandPoints = band !== undefined && band !== null ? parsedBand(band) : null;
  const floor = parsedSpendingFloor(context);
  return market.map((row, i) => {
    const targets = parsedTargets(context.targets[i]);
    requireReturns(targets, row);
    const rebalance = i === 0 || (floor && context.projection.rows[i].month >= context.projection.retirementMonth
      && safeShareBelowFloor(codes, weights, ONE, floor))
      || (bandPoints ? bandExceeded(codes, k => weights[k], targets, bandPoints) : context.rebalance[i]);
    let turnover = ZERO;
    if (i && rebalance) {
      let s = ZERO;
      for (let t = 0; t < targets.codes.length; t++) { const k = codes.indexOf(targets.codes[t]); s = s.plus(targets.weight[t].minus(k < 0 ? ZERO : weights[k]).abs()); }
      turnover = s.div(TWO);
    }
    if (rebalance) { codes = targets.codes; weights = targets.weight; }
    const parsed = parsedMarket(row);
    const values = weights.map((w, k) => {
      const factor = onePlus(row, parsed, codes[k]);
      if (factor === undefined) return w.mul(new D(row.returns[codes[k]]).plus(1)); // throws like the original
      return w.mul(factor);
    });
    const gross = sum(values);
    if (gross.lte(0)) throw new RangeError("Nonpositive portfolio factor");
    weights = values.map(v => v.div(gross));
    const cost = turnover.mul(costPercent).div(HUNDRED);
    return { gross, cost, net: withNet ? gross.mul(ONE.minus(cost)) : null };
  });
}

type ParsedSpendingFloor = { safeAssets: Set<string>; minSafeFraction: Dec };
function parsedSpendingFloor(context: RiskContext): ParsedSpendingFloor | null {
  if (context.projection.modelVersion !== "retirement-monthly-v5" || !context.spendingFloor) return null;
  const fraction = new D(context.spendingFloor.minSafeFraction);
  if (!fraction.isFinite() || fraction.lt(0) || fraction.gt(1) || !context.spendingFloor.safeAssets.length)
    throw new RangeError("Invalid spending floor");
  return { safeAssets: new Set(context.spendingFloor.safeAssets), minSafeFraction: fraction };
}
function safeShareBelowFloor(codes: string[], values: Dec[], total: Dec, floor: ParsedSpendingFloor) {
  let safe = ZERO;
  for (let k = 0; k < codes.length; k++) if (floor.safeAssets.has(codes[k])) safe = safe.plus(values[k]);
  return safe.lt(total.mul(floor.minSafeFraction));
}

/** Contribution-first rebalancing hook for the v5 kernel (see contributionFirstHook): holdings are two parallel arrays in the
 * same insertion order the Map-based version had, targets/returns/band are parsed once. */
export function contributionFirstHookFast(context: RiskContext, market: PathMarket[]): V5MonthHook {
  const band = parsedBand(context.rebalanceBandPoints as string), bandApprox = approx(band), costRate = parsedRate(context.turnoverCostPercent).fraction;
  const floor = parsedSpendingFloor(context);
  let codes: string[] = [], vals: Dec[] = [];
  /** Allocate cash to deficits of target(total = holdings + cash), proportionally to the deficits. */
  const directCash = (targets: ParsedTargets, cash: Dec) => {
    if (cash.isZero() || cash.isNeg()) return;
    const total = sum(vals).plus(cash);
    const keys = codes.slice();
    for (const code of targets.codes) if (!codes.includes(code)) keys.push(code);
    const deficits = keys.map((code, k) => {
      const t = targets.index.get(code);
      return pp(total.mul(t === undefined ? ZERO : targets.weight[t]).minus(k < codes.length ? vals[k] : ZERO));
    });
    const demand = sum(deficits), allocated = min2(cash, demand), positive = isPos(demand);
    vals = deficits.map((d, k) => (k < codes.length ? vals[k] : ZERO).plus(positive ? allocated.mul(d).div(demand) : ZERO));
    codes = keys;
  };
  return ({ index: i, opening, startDeposit, withdrawal, x, endDeposit, capitalInjection }) => {
    const targets = parsedTargets(context.targets[i]), row = market[i];
    requireReturns(targets, row);
    if (i === 0) { codes = targets.codes; vals = targets.percent.map(p => opening.mul(p).div(HUNDRED)); }
    if (x.isZero() || x.isNeg()) vals = vals.map(() => ZERO);
    else {
      const total = sum(vals), fromHoldings = min2(withdrawal, total), keep = isPos(total) ? total.minus(fromHoldings).div(total) : ZERO;
      vals = vals.map(v => v.mul(keep));
      directCash(targets, pp(startDeposit.minus(withdrawal.minus(fromHoldings))));
    }
    const invested = sum(vals);
    let rate = ZERO;
    if (isPos(invested)) {
      const weights: Dec[] = [];
      const floorBreached = floor && context.projection.rows[i].month >= context.projection.retirementMonth
        && safeShareBelowFloor(codes, vals, invested, floor);
      if (floorBreached || (screenBand(codes, vals, invested, targets, bandApprox) ?? bandExceeded(codes, k => weights[k] ??= vals[k].div(invested), targets, band))) {
        const target = targets.weight.map(w => w.mul(invested));
        let moved = ZERO;
        for (let k = 0; k < codes.length; k++) { const t = targets.index.get(codes[k]); moved = moved.plus((t === undefined ? ZERO : target[t]).minus(vals[k]).abs()); }
        for (let t = 0; t < targets.codes.length; t++) if (!codes.includes(targets.codes[t])) moved = moved.plus(target[t].minus(ZERO).abs());
        const cost = moved.div(TWO).mul(costRate);
        rate = cost.div(invested);
        vals = target.map(tv => tv.minus(tv.mul(rate)));
        codes = targets.codes;
      }
    }
    const net = invested.mul(ONE.minus(rate));
    let gross = ONE;
    if (isPos(net)) {
      const parsed = parsedMarket(row);
      const grown = vals.map((v, k) => {
        const factor = onePlus(row, parsed, codes[k]);
        if (factor === undefined) throw new RangeError("Missing asset or invalid allocation");
        return v.mul(factor);
      });
      gross = sum(grown).div(net);
      if (gross.lte(0)) throw new RangeError("Nonpositive portfolio factor");
      vals = grown;
    }
    directCash(targets, endDeposit.plus(capitalInjection));
    return { growthFactor: gross, tradingCostRate: rate };
  };
}

type PrepRow = { retired: boolean; income: Dec; pension: Dec; incomePension: Dec; additional: Dec; debt: Dec; planned: Dec; injection: Dec;
  essBase: Dec; livingOverBase: Dec; fixed: { living: Dec; contribution: Dec; withdrawal: Dec } | null };
type Prep = { structure: V5Structure; initial: Dec; rows: PrepRow[]; protection: { emergency: Dec; goals: Array<FastProtectionGoal & { assetClass?: string }>; depositAssetClass: string } | null };
const prepCache = new WeakMap<RiskContext, WeakMap<MonthlyInput[], Prep>>();
const invalid = () => new AppError(422, "INVALID_PROJECTION_INPUT", "Hệ số tăng trưởng phải dương, các dòng thu/chi không âm.");
/** Everything that does not depend on the simulated path: parsed pinned flows, calendar validation, the nominal part of the living
 * expense and of the essential expenses, and (before retirement, where nothing is CPI-indexed) the whole household budget row. */
function prepare(context: RiskContext, base: MonthlyInput[]): Prep {
  let byBase = prepCache.get(context);
  if (!byBase) prepCache.set(context, byBase = new WeakMap());
  const cached = byBase.get(base);
  if (cached) return cached;
  const projection = context.projection;
  const header = { valuationDate: projection.valuationDate, retirementMonth: projection.retirementMonth, contributionTiming: projection.contributionTiming,
    monthlyContribution: projection.monthlyContribution, contributionStartMonth: projection.contributionStartMonth, modelVersion: "retirement-monthly-v5" as const };
  const structure = prepareV5Structure({ ...header, months: base.map(r => r.month) });
  const initial = decimal(projection.initialCapital);
  if (initial.lt(0) || decimal(projection.terminalBalance).lt(0)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Vốn đầu kỳ và mục tiêu cuối kỳ không âm.");
  const startFunding = context.selection.startOfMonthFunding, start = projection.contributionStartMonth ?? projection.valuationDate.slice(0, 7);
  let basePrice = ONE;
  const rows = base.map((original, i): PrepRow => {
    const retired = original.month >= projection.retirementMonth;
    const income = decimal(original.income), pension = decimal(original.pension), living = decimal(original.livingExpense), additional = decimal(original.additionalExpense),
      debt = decimal(original.debtPayment), planned = decimal(original.plannedContribution), injection = decimal(original.capitalInjection);
    if ([income, pension, living, additional, debt, planned, injection].some(v => v.lt(0))) throw invalid();
    const originalLiving = new D(projection.rows[i].livingExpense), essential = new D(context.essentialExpenses[i]);
    const incomePension = income.plus(pension);
    const row: PrepRow = { retired, income, pension, incomePension, additional, debt, planned, injection,
      essBase: retired ? essential.minus(originalLiving) : essential.minus(0).plus(0), livingOverBase: retired ? living.div(basePrice) : living, fixed: null };
    if (!retired) {
      const remaining = incomePension.minus(living).minus(additional).minus(debt), capacity = D.max(0, remaining);
      const allowed = projection.contributionTiming === "START_OF_MONTH"
        ? original.month < start ? new D(0)
          : D.min(capacity, startFunding?.schedule.find(r => r.month === original.month)?.amount ?? startFunding?.monthlyAvailable ?? "0") : capacity;
      row.fixed = { living, contribution: D.min(allowed, planned), withdrawal: D.max(0, remaining.neg()) };
    }
    basePrice = basePrice.mul(projection.rows[i].inflationFactor);
    return row;
  });
  const protection = projection.protection;
  const prep: Prep = { structure, initial, rows, protection: protection ? { emergency: new D(protection.emergencyReserve), depositAssetClass: protection.depositAssetClass,
    goals: protection.goals.map(g => ({ month: g.month, amount: new D(g.amount), openingReserve: new D(g.openingReserve), essential: g.essential,
      assetClass: g.depositAssetClass, factors: g.depositAssetClass ? undefined : g.depositFactors?.map(f => new D(f)) })) } : null };
  byBase.set(base, prep);
  return prep;
}

/** v5 path without advisory fee: same result as the string-based runPath on the full kernel, computed with the funded-ledger kernel. */
export function runPathV5Fast(context: RiskContext, market: PathMarket[], base: MonthlyInput[], hooked: boolean) {
  const prep = prepare(context, base), n = prep.rows.length;
  const legs = hooked ? null : portfolioLegsFast(context, market, false);
  const prices: Dec[] = new Array(n), livings: Dec[] = new Array(n), withdrawals: Dec[] = new Array(n), contributions: Dec[] = new Array(n);
  let price = ONE;
  for (let i = 0; i < n; i++) {
    const r = prep.rows[i], cpiFactor = parsedMarket(market[i]).cpiFactor;
    if (cpiFactor.isZero() || cpiFactor.isNeg()) throw invalid();
    prices[i] = price;
    if (r.fixed) { livings[i] = r.fixed.living; contributions[i] = r.fixed.contribution; withdrawals[i] = r.fixed.withdrawal; }
    else {
      const living = r.livingOverBase.mul(price), remaining = r.incomePension.minus(living).minus(r.additional).minus(r.debt);
      livings[i] = living; contributions[i] = min2(pp(remaining), r.planned); withdrawals[i] = pp(remaining.neg());
    }
    price = price.mul(cpiFactor);
  }
  let protectedRows: ReturnType<typeof protectCashflowsFast> | null = null;
  if (prep.protection) {
    const protection = prep.protection, factorsOf = (assetClass: string, message: string) => market.map(m => {
      const factor = onePlus(m, parsedMarket(m), assetClass);
      if (factor === undefined) throw new RangeError(message);
      return factor;
    });
    const depositFactors = factorsOf(protection.depositAssetClass, "Protected deposit market data required");
    const goals = protection.goals.map(g => g.assetClass ? { ...g, factors: factorsOf(g.assetClass, "Protected goal deposit market data required") } : g);
    protectedRows = protectCashflowsFast(prep.structure.months, withdrawals, protection.emergency, goals, depositFactors);
  }
  const rows: V5LedgerRow[] = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = { growthFactor: legs ? legs[i].gross : ONE, tradingCostRate: legs ? legs[i].cost : ZERO,
    withdrawal: protectedRows ? protectedRows[i].withdrawal : withdrawals[i], contribution: contributions[i], capitalInjection: prep.rows[i].injection };
  const ledger = projectFundedLedgerV5({ structure: prep.structure, initialCapital: prep.initial, rows }, hooked ? contributionFirstHookFast(context, market) : undefined);
  let loss = new D(0);
  const balances: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = prep.rows[i], atStart = ledger.unmet[i];
    // No unfunded withdrawal: the essential shortfall is min(0, ...) = 0 and adds nothing to the loss.
    if (!atStart.isZero()) {
      const p = protectedRows ? protectedRows[i] : null, essential = r.retired ? r.essBase.plus(livings[i]) : r.essBase;
      const available = p ? ledger.available[i].plus(p.protectedHouseholdPaid).plus(p.protectedEssentialGoalPaid) : ledger.available[i];
      const unmet = min2(atStart, pp((p ? essential.plus(p.essentialGoalExpense) : essential).minus(r.income).minus(r.pension).minus(available)));
      loss = loss.plus(unmet.div(prices[i]));
    }
    balances[i] = ledger.funded[i].div(prices[i]).toFixed();
  }
  return { essentialLossToday: loss.toFixed(), funded: loss.isZero(), balances,
    firstShortfallMonth: prep.structure.months.find((_, i) => ledger.unmet[i].gt(0)) ?? null,
    unfundedWithdrawals: ledger.unmetTotal.toFixed(), fundedTerminalBalance: ledger.funded[n - 1].toFixed() };
}
