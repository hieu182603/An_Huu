import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { RETIREMENT_MODEL_V5 } from "./schema";
import { RetirementDecimal, decimal, positivePart, type MonthlyInput, type ProjectionInput } from "./engine-core";

const D = RetirementDecimal;

/** retirement-monthly-v5 kernel (spec thuat-toan-phan-bo-tai-san.md 7.2):
 *   A_{m+1} = (A_m - C_m - F_m - K_m)(1 + R) + S_m
 * Withdrawal C leaves at the START of the month, before that month's return. Per month:
 *   available = funded + startDeposit           (START_OF_MONTH contribution is usable the same month)
 *   unmet     = max(0, withdrawal - available)  (shortfall; never erased by a later surplus)
 *   x         = max(0, available - withdrawal)  (balance that actually earns the return)
 *   K         = x * tradingCostRate             (trading cost on the post-withdrawal balance)
 *   funded'   = (x - K) * growthFactor + endDeposit + capitalInjection
 * Negative balances never exist (zero floor) and never earn returns. END_OF_MONTH contributions and
 * capital injections/releases stay at month end. The advisory fee is NOT modelled here (later step).
 *
 * Solvers are exact Decimal algebra. Define the signed recurrence (x may be negative, K = t*x). It
 * equals the floored recurrence up to the first month with x < 0, and funded balance is monotone
 * non-decreasing in a constant monthly deposit c. So c is feasible iff every month's signed x_i(c) >= 0
 * and the signed opening balance of the retirement month >= target. x_i and the balance are affine in c
 * (x_i = a_i + b_i c), so the smallest feasible c is max(0, max_i(-a_i / b_i), (target - a_n)/b_n).
 * No bisection or tolerance is needed. */
/** Optional month-by-month coupling (Monte Carlo with money per asset). Called once per month, after the
 * kernel knows the post-withdrawal invested amount x, BEFORE the month's return is applied:
 *   opening = funded at month start, startDeposit/withdrawal = this month's flows, x = max(0, opening + startDeposit - withdrawal),
 *   endDeposit/capitalInjection = what will be added at month end (so the hook can direct it to deficits).
 * It returns the month's gross growth factor and the trading cost rate for that x (K = x * tradingCostRate).
 * Without a hook the kernel uses rows[i].growthFactor / rows[i].tradingCostRate exactly as before. */
export type V5MonthHook = (month: { index: number; opening: Prisma.Decimal; startDeposit: Prisma.Decimal; withdrawal: Prisma.Decimal;
  x: Prisma.Decimal; endDeposit: Prisma.Decimal; capitalInjection: Prisma.Decimal }) => { growthFactor: Prisma.Decimal; tradingCostRate: Prisma.Decimal };
type V5Dec = Prisma.Decimal;
const ZERO = new D(0), RANGE_LIMIT = new D("1e100");
/** max(0, v) with the same value as D.max(0, v) (+0 for zero/negative, v itself otherwise), without re-parsing a 0 on every call. */
const pp = (v: V5Dec) => v.isZero() || v.isNeg() ? ZERO : v;
/** v < 0 (negative zero is not below zero). */
const below0 = (v: V5Dec) => v.isNeg() && !v.isZero();
/** Same test as decimal(): finite and |v| <= 1e100. |v| > 1e100 needs a decimal exponent >= 100, so most values skip the abs/compare. */
const outOfRange = (v: V5Dec) => !v.isFinite() || (v.e >= 100 && v.abs().gt(RANGE_LIMIT));

type V5Header = Pick<ProjectionInput, "valuationDate" | "retirementMonth" | "contributionTiming" | "monthlyContribution" | "contributionStartMonth" | "modelVersion">;
/** Per-run structure that does not depend on the amounts: month calendar, retirement index, deposit placement rule. */
export type V5Structure = { length: number; n: number; months: string[]; contributionStart: string; eligibleAt: boolean[]; beginAt: boolean[] };
function checkHeader(input: V5Header) {
  if (input.modelVersion !== RETIREMENT_MODEL_V5) throw new AppError(422, "SNAPSHOT_MODEL_UNSUPPORTED", "Mô hình không được hỗ trợ.");
  dateSchema.parse(input.valuationDate); monthSchema.parse(input.retirementMonth);
  if (!["END_OF_MONTH", "START_OF_MONTH"].includes(input.contributionTiming))
    throw new AppError(422, "INVALID_CONTRIBUTION_TIMING", "Quy ước đóng chưa được hỗ trợ.");
  if (decimal(input.monthlyContribution).lt(0)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Mức đóng không âm.");
  const firstMonth = input.valuationDate.slice(0, 7);
  const contributionStart = input.contributionStartMonth ?? firstMonth;
  monthSchema.parse(contributionStart);
  return { firstMonth, contributionStart };
}
function checkPeriod(input: V5Header, months: string[], firstMonth: string) {
  const n = months.findIndex(m => m === input.retirementMonth);
  if (!months.length || months.length > 1200 || n < 0 || !monthSchema.safeParse(firstMonth).success)
    throw new AppError(422, "INVALID_PROJECTION_PERIOD", "Khoảng tháng phải gồm tháng nghỉ hưu và tối đa 1.200 kỳ.");
  return n;
}
function makeStructure(input: V5Header, months: string[], n: number, contributionStart: string): V5Structure {
  // Per-month deposit placement (identical rule to v3).
  const eligibleAt = months.map(m => m >= contributionStart);
  const beginAt = months.map((_, i) => i < n && eligibleAt[i] && input.contributionTiming === "START_OF_MONTH");
  return { length: months.length, n, months, contributionStart, eligibleAt, beginAt };
}
/** Validates the header and the month calendar once; the result can be reused for every path of a simulation. */
export function prepareV5Structure(input: V5Header & { months: string[] }): V5Structure {
  const { firstMonth, contributionStart } = checkHeader(input);
  const n = checkPeriod(input, input.months, firstMonth);
  input.months.forEach((m, i) => {
    if (m !== addMonths(firstMonth, i) || !monthSchema.safeParse(m).success) throw new AppError(422, "NONCONTIGUOUS_PERIODS", "Chuỗi tháng không liên tục hoặc vượt lịch hỗ trợ.");
  });
  return makeStructure(input, input.months.slice(), n, contributionStart);
}

export type V5LedgerRow = { growthFactor: V5Dec; tradingCostRate: V5Dec; withdrawal: V5Dec; contribution: V5Dec; capitalInjection: V5Dec };
export type V5Ledger = { available: V5Dec[]; unmet: V5Dec[]; x: V5Dec[]; tradingCost: V5Dec[]; monthGrowth: V5Dec[]; funded: V5Dec[]; unmetTotal: V5Dec };
/** The month recurrence, shared by projectRetirementV5 and projectFundedLedgerV5 (same operations, same order, same precision). */
function runLedger(s: V5Structure, rows: readonly V5LedgerRow[], initial: V5Dec, hook?: V5MonthHook): V5Ledger {
  const available: V5Dec[] = [], unmetAt: V5Dec[] = [], xAt: V5Dec[] = [], costAt: V5Dec[] = [], growthAt: V5Dec[] = [], fundedAt: V5Dec[] = [];
  let funded = initial, unmetTotal = ZERO;
  for (let i = 0; i < s.length; i++) {
    const r = rows[i], opening = funded;
    const startDeposit = s.beginAt[i] ? r.contribution : ZERO, endDeposit = s.beginAt[i] ? ZERO : r.contribution;
    const avail = opening.plus(startDeposit);
    const unmet = pp(r.withdrawal.minus(avail));
    const x = pp(avail.minus(r.withdrawal));
    const month = hook ? hook({ index: i, opening, startDeposit, withdrawal: r.withdrawal, x, endDeposit, capitalInjection: r.capitalInjection }) : null;
    const monthGrowth = month ? month.growthFactor : r.growthFactor, monthCostRate = month ? month.tradingCostRate : r.tradingCostRate;
    const tradingCost = x.mul(monthCostRate);
    funded = x.minus(tradingCost).mul(monthGrowth).plus(endDeposit).plus(r.capitalInjection);
    unmetTotal = unmetTotal.plus(unmet);
    if (outOfRange(funded)) throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Khoảng dự phóng vượt giới hạn tính toán.");
    available.push(avail); unmetAt.push(unmet); xAt.push(x); costAt.push(tradingCost); growthAt.push(monthGrowth); fundedAt.push(funded);
  }
  return { available, unmet: unmetAt, x: xAt, tradingCost: costAt, monthGrowth: growthAt, funded: fundedAt, unmetTotal };
}
/** Funded-balance recurrence only (no required-fund pass, no contribution solvers, no chart rows): what the Monte Carlo needs
 * per path. Values are bit-identical to projectRetirementV5's fundedClosingBalance / unfundedWithdrawal / fundedAvailableAtStart /
 * summary.unfundedWithdrawals / summary.fundedTerminalBalance for the same inputs. The calendar is validated once by
 * prepareV5Structure; the amounts are validated here with the same rules as projectRetirementV5. */
export function projectFundedLedgerV5(input: { structure: V5Structure; initialCapital: V5Dec; rows: readonly V5LedgerRow[] }, hook?: V5MonthHook): V5Ledger {
  const s = input.structure;
  if (input.rows.length !== s.length) throw new AppError(422, "INVALID_PROJECTION_PERIOD", "Khoảng tháng phải gồm tháng nghỉ hưu và tối đa 1.200 kỳ.");
  if (outOfRange(input.initialCapital)) throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Dữ liệu vượt phạm vi tính toán.");
  if (below0(input.initialCapital)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Vốn đầu kỳ và mục tiêu cuối kỳ không âm.");
  for (let i = 0; i < s.length; i++) {
    const r = input.rows[i];
    if (outOfRange(r.growthFactor) || outOfRange(r.withdrawal) || outOfRange(r.contribution) || outOfRange(r.capitalInjection) || outOfRange(r.tradingCostRate))
      throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Dữ liệu vượt phạm vi tính toán.");
    if (below0(r.withdrawal) || below0(r.contribution) || below0(r.capitalInjection) || r.growthFactor.isZero() || r.growthFactor.isNeg())
      throw new AppError(422, "INVALID_PROJECTION_INPUT", "Hệ số tăng trưởng phải dương, các dòng thu/chi không âm.");
    if (below0(r.tradingCostRate) || (r.tradingCostRate.e >= 0 && r.tradingCostRate.gte(1))) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Tỷ lệ chi phí giao dịch phải trong [0, 1).");
    if (i < s.n && !s.eligibleAt[i] && r.contribution.gt(0)) throw new AppError(422, "INVALID_CONTRIBUTION_TIMING", "Không thể góp trước tháng hiệu lực.");
  }
  return runLedger(s, input.rows, input.initialCapital, hook);
}

export function projectRetirementV5(input: ProjectionInput, hook?: V5MonthHook) {
  const { firstMonth, contributionStart } = checkHeader(input);
  const n = checkPeriod(input, input.rows.map(r => r.month), firstMonth);
  const initial = decimal(input.initialCapital), terminal = decimal(input.terminalBalance);
  if (initial.lt(0) || terminal.lt(0)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Vốn đầu kỳ và mục tiêu cuối kỳ không âm.");
  const rows = input.rows.map((r, i) => {
    if (r.month !== addMonths(firstMonth, i) || !monthSchema.safeParse(r.month).success) throw new AppError(422, "NONCONTIGUOUS_PERIODS", "Chuỗi tháng không liên tục hoặc vượt lịch hỗ trợ.");
    const fields: Array<Exclude<keyof MonthlyInput, "month" | "tradingCostRate">> = ["growthFactor", "inflationFactor", "income", "pension", "livingExpense", "additionalExpense", "debtPayment", "plannedContribution", "contribution", "contributionCapacity", "withdrawal", "uninvestedSurplus", "capitalInjection"];
    const values = Object.fromEntries(fields.map(key => [key, decimal(r[key])])) as Record<Exclude<keyof MonthlyInput, "month" | "tradingCostRate">, Prisma.Decimal>;
    if (Object.values(values).some(v => v.lt(0)) || values.growthFactor.lte(0) || values.inflationFactor.lte(0))
      throw new AppError(422, "INVALID_PROJECTION_INPUT", "Hệ số tăng trưởng phải dương, các dòng thu/chi không âm.");
    const tradingCostRate = r.tradingCostRate === undefined ? new D(0) : decimal(r.tradingCostRate);
    if (tradingCostRate.lt(0) || tradingCostRate.gte(1)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Tỷ lệ chi phí giao dịch phải trong [0, 1).");
    if (r.month < input.retirementMonth && r.month < contributionStart && values.contribution.gt(0))
      throw new AppError(422, "INVALID_CONTRIBUTION_TIMING", "Không thể góp trước tháng hiệu lực.");
    return { ...values, tradingCostRate, month: r.month };
  });
  const structure = makeStructure(input, rows.map(r => r.month), n, contributionStart);
  const { beginAt, eligibleAt } = structure;
  const startDepositAt = rows.map((r, i) => beginAt[i] ? r.contribution : new D(0));
  const endDepositAt = rows.map((r, i) => beginAt[i] ? new D(0) : r.contribution);
  // keep (1 - t) * g, the effective growth on the post-withdrawal balance
  const netGrowth = rows.map(r => r.growthFactor.mul(new D(1).minus(r.tradingCostRate)));
  const retirementDiscount = input.retirementPlanningAnnualPercent === undefined ? undefined
    : decimal(input.retirementPlanningAnnualPercent).div(1200).plus(1);
  if (retirementDiscount?.lte(0)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Hệ số chiết khấu phải dương.");

  // Backward pass: required funded balance before each month's withdrawal. x >= 0 is needed before growth,
  // so the month's required "x" is max(0, (closing - endDeposit - injection) / ((1-t) g)).
  const requiredOpening: Prisma.Decimal[] = [], requiredClosing: Prisma.Decimal[] = [];
  let required = terminal, algebraic = terminal, target = new D(0), algebraicTarget = new D(0);
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]; requiredClosing[i] = required;
    const discount = i >= n && retirementDiscount ? retirementDiscount : netGrowth[i];
    const need = required.minus(endDepositAt[i]).minus(r.capitalInjection).div(discount);
    required = positivePart(r.withdrawal.plus(positivePart(need)).minus(startDepositAt[i]));
    algebraic = r.withdrawal.plus(algebraic.minus(endDepositAt[i]).minus(r.capitalInjection).div(discount)).minus(startDepositAt[i]);
    requiredOpening[i] = required;
    if (i === n) { target = required; algebraicTarget = algebraic; }
  }

  // Funded-balance recurrence (shared with projectFundedLedgerV5).
  const ledger = runLedger(structure, rows, initial, hook);
  const funded = ledger.funded.length ? ledger.funded[ledger.funded.length - 1] : initial, unmetTotal = ledger.unmetTotal;
  let projected = initial, factorToRetirement = new D(1);
  // Solver state: signed balance with zero declared deposits (a) and with declared deposits (b),
  // and slope = d(balance)/d(constant monthly deposit c).
  let signedNoContribution = initial, signedDeclared = initial, slope = new D(0);
  let requiredConstant = new D(0), additional = new D(0), earlyFundingRequired = false;
  let cumulativeUnmet = new D(0), firstShortfallMonth: string | null = null, firstBudgetShortfallMonth: string | null = null;
  const chart = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], accumulation = i < n, opening = i === 0 ? initial : ledger.funded[i - 1];
    const startDeposit = startDepositAt[i], endDeposit = endDepositAt[i];
    const available = ledger.available[i], unmet = ledger.unmet[i], tradingCost = ledger.tradingCost[i], closing = ledger.funded[i];
    const growth = ledger.x[i].minus(tradingCost).mul(ledger.monthGrowth[i].minus(1));
    cumulativeUnmet = cumulativeUnmet.plus(unmet);
    if (unmet.gt(0)) firstShortfallMonth ??= r.month;
    const budgetShortfall = positivePart(r.plannedContribution.minus(r.contribution));
    if (budgetShortfall.gt(0) || (accumulation && r.withdrawal.gt(0))) firstBudgetShortfallMonth ??= r.month;
    if (accumulation) {
      factorToRetirement = factorToRetirement.mul(r.growthFactor);
      const unitStart = beginAt[i] ? 1 : 0, unitEnd = eligibleAt[i] && !beginAt[i] ? 1 : 0;
      // signed x_i = a + b c
      const xNo = signedNoContribution.minus(r.withdrawal), xDeclared = signedDeclared.plus(startDeposit).minus(r.withdrawal), xSlope = slope.plus(unitStart);
      if (xSlope.gt(0)) {
        requiredConstant = D.max(requiredConstant, xNo.neg().div(xSlope));
        additional = D.max(additional, xDeclared.neg().div(xSlope));
      } else if (xDeclared.lt(0)) earlyFundingRequired = true;
      signedNoContribution = xNo.mul(netGrowth[i]).plus(r.capitalInjection);
      signedDeclared = xDeclared.mul(netGrowth[i]).plus(endDeposit).plus(r.capitalInjection);
      slope = xSlope.mul(netGrowth[i]).plus(unitEnd);
      if (i === n - 1) {
        projected = closing;
        if (slope.gt(0)) {
          requiredConstant = D.max(requiredConstant, target.minus(signedNoContribution).div(slope));
          additional = D.max(additional, target.minus(signedDeclared).div(slope));
        }
      }
    }
    chart.push({ ...input.rows[i], phase: accumulation ? "ACCUMULATION" : "RETIREMENT",
      openingBalance: opening.toFixed(), investmentChange: growth.toFixed(), closingBalance: closing.toFixed(),
      fundedClosingBalance: closing.toFixed(), unfundedWithdrawal: unmet.toFixed(), budgetShortfall: budgetShortfall.toFixed(),
      requiredOpeningBalance: requiredOpening[i].toFixed(), requiredClosingBalance: requiredClosing[i].toFixed(),
      netWithdrawal: r.livingExpense.plus(r.additionalExpense).plus(r.debtPayment).minus(r.income).minus(r.pension).toFixed(),
      fundedAvailableAtStart: available.toFixed(), tradingCost: tradingCost.toFixed(), cumulativeUnfunded: cumulativeUnmet.toFixed(),
    });
  }
  const gap = target.minus(projected), comparison = (a: Prisma.Decimal, k: Prisma.Decimal) => ({
    projectedFund: a.toFixed(), requiredFund: k.toFixed(), fundingGap: k.minus(a).toFixed(),
    coveragePercent: k.gt(0) ? a.div(k).mul(100).toFixed() : null,
  });
  const solvable = n > 0 && slope.gt(0) && !earlyFundingRequired;
  const requiredAmount = solvable ? positivePart(requiredConstant) : null;
  const additionalAmount = solvable ? positivePart(additional) : null;
  return { modelVersion: RETIREMENT_MODEL_V5,
    conventions: { contributionTiming: input.contributionTiming, withdrawalTiming: "START_OF_MONTH",
      capitalReleaseTiming: "END_OF_MONTH", surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
      allocationCashflows: "PROPORTIONAL_TO_CURRENT_HOLDINGS", arithmeticPrecision: 48,
      firstPeriod: "FULL_MONTH_NO_DAILY_PRORATION", rounding: "DISPLAY_ONLY_VND_1000_PERCENT_2DP",
      negativeBalance: "ZERO_FLOOR_NO_NEGATIVE_RETURNS", terminalBalanceBasis: "NOMINAL_AT_END",
      tradingCostBasis: "POST_WITHDRAWAL_BALANCE" },
    summary: { valuationDate: input.valuationDate, retirementMonth: input.retirementMonth, endMonth: rows.at(-1)!.month,
      accumulationMonths: n, retirementMonths: rows.length - n, initialRetirementCapital: initial.toFixed(),
      atRetirement: comparison(projected, target),
      atValuation: comparison(projected.div(factorToRetirement), target.div(factorToRetirement)),
      algebraicRequiredFund: algebraicTarget.toFixed(), liquidityReserveAboveAlgebraicPV: target.minus(positivePart(algebraicTarget)).toFixed(),
      futureMonthlyExpense: rows[n].livingExpense.toFixed(),
      plannedMonthlyContribution: input.monthlyContribution, requiredConstantMonthlyContribution: requiredAmount?.toFixed() ?? null,
      additionalMonthlyContribution: additionalAmount?.toFixed() ?? null,
      savingsStatus: earlyFundingRequired ? "EARLY_FUNDING_REQUIRED" : !solvable ? (gap.gt(0) ? n > 0 ? "NO_ELIGIBLE_CONTRIBUTION_PERIOD" : "NO_ACCUMULATION_PERIOD" : "NO_ADDITIONAL_CONTRIBUTION") : additionalAmount!.gt(0) ? "ADDITIONAL_CONTRIBUTION_REQUIRED" : "NO_ADDITIONAL_CONTRIBUTION",
      requiredContributionWithinCapacity: requiredAmount === null ? null : rows.slice(0, n).filter(r => r.month >= contributionStart).every(r => r.contributionCapacity.gte(requiredAmount)),
      retirementFundingShortfall: positivePart(gap).toFixed(), excessAtRetirement: positivePart(gap.neg()).toFixed(),
      firstShortfallMonth, firstBudgetShortfallMonth, unfundedWithdrawals: unmetTotal.toFixed(),
      terminalBalance: funded.toFixed(), fundedTerminalBalance: funded.toFixed(), terminalTarget: terminal.toFixed(),
      terminalTargetShortfall: positivePart(terminal.minus(funded)).toFixed(),
    }, rows: chart };
}
