import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { RETIREMENT_MODEL } from "./schema";
import { projectRetirement as projectV2, type ProjectionInput as LegacyInput } from "./engine-v2";

export const RetirementDecimal = Prisma.Decimal.clone({ precision: 48 });
const D = RetirementDecimal;
export type MonthlyInput = {
  month: string; growthFactor: string; inflationFactor: string;
  income: string; pension: string; livingExpense: string; additionalExpense: string; debtPayment: string;
  plannedContribution: string; contribution: string; contributionCapacity: string;
  withdrawal: string; uninvestedSurplus: string; capitalInjection: string;
};
export type ProjectionInput = {
  valuationDate: string; retirementMonth: string; initialCapital: string; terminalBalance: string;
  monthlyContribution: string; contributionTiming: "END_OF_MONTH" | "START_OF_MONTH_RESEARCH" | "START_OF_MONTH"; rows: MonthlyInput[];
  modelVersion?: "retirement-monthly-v3";
  contributionStartMonth?: string;
};
const decimal = (value: string) => {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Dữ liệu tính toán phải là chuỗi thập phân.");
  const parsed = new D(value);
  if (!parsed.isFinite() || parsed.abs().gt("1e100")) throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Dữ liệu vượt phạm vi tính toán.");
  return parsed;
};
const positivePart = (v: Prisma.Decimal) => D.max(0, v);

/** Pure monthly recurrence. Rates/cashflows are resolved on the server, never from
 * the public request. Unmarked historical payloads dispatch to the frozen v2 engine. */
export function projectRetirement(input: ProjectionInput) {
  // Unmarked replay payloads belong to v2. Never reinterpret their conventions.
  if (input.modelVersion === undefined) return projectV2(input as LegacyInput);
  if (input.modelVersion !== RETIREMENT_MODEL) throw new AppError(422, "SNAPSHOT_MODEL_UNSUPPORTED", "Mô hình không được hỗ trợ.");
  dateSchema.parse(input.valuationDate); monthSchema.parse(input.retirementMonth);
  if (!["END_OF_MONTH", "START_OF_MONTH"].includes(input.contributionTiming))
    throw new AppError(422, "INVALID_CONTRIBUTION_TIMING", "Quy ước đóng chưa được hỗ trợ.");
  if (decimal(input.monthlyContribution).lt(0)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Mức đóng không âm.");
  const firstMonth = input.valuationDate.slice(0, 7);
  const contributionStart = input.contributionStartMonth ?? firstMonth;
  monthSchema.parse(contributionStart);
  const n = input.rows.findIndex(r => r.month === input.retirementMonth);
  if (!input.rows.length || input.rows.length > 1200 || n < 0 || !monthSchema.safeParse(firstMonth).success)
    throw new AppError(422, "INVALID_PROJECTION_PERIOD", "Khoảng tháng phải gồm tháng nghỉ hưu và tối đa 1.200 kỳ.");
  const initial = decimal(input.initialCapital), terminal = decimal(input.terminalBalance);
  if (initial.lt(0) || terminal.lt(0)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Vốn đầu kỳ và mục tiêu cuối kỳ không âm.");
  const rows = input.rows.map((r, i) => {
    if (r.month !== addMonths(firstMonth, i) || !monthSchema.safeParse(r.month).success) throw new AppError(422, "NONCONTIGUOUS_PERIODS", "Chuỗi tháng không liên tục hoặc vượt lịch hỗ trợ.");
    const fields: Array<Exclude<keyof MonthlyInput, "month">> = ["growthFactor", "inflationFactor", "income", "pension", "livingExpense", "additionalExpense", "debtPayment", "plannedContribution", "contribution", "contributionCapacity", "withdrawal", "uninvestedSurplus", "capitalInjection"];
    const values = Object.fromEntries(fields.map(key => [key, decimal(r[key])])) as Record<Exclude<keyof MonthlyInput, "month">, Prisma.Decimal>;
    if (Object.values(values).some(v => v.lt(0)) || values.growthFactor.lte(0) || values.inflationFactor.lte(0))
      throw new AppError(422, "INVALID_PROJECTION_INPUT", "Hệ số tăng trưởng phải dương, các dòng thu/chi không âm.");
    if (r.month < input.retirementMonth && r.month < contributionStart && values.contribution.gt(0))
      throw new AppError(422, "INVALID_CONTRIBUTION_TIMING", "Không thể góp trước tháng hiệu lực.");
    return { ...values, month: r.month };
  });
  // End-month capital releases and explicitly funded deposits reduce required
  // withdrawals. A nonnegative requirement at EVERY month rules out borrowing
  // against a later receipt even when an algebraic terminal PV appears sufficient.
  const requiredOpening: Prisma.Decimal[] = [], requiredClosing: Prisma.Decimal[] = [];
  let required = terminal, algebraic = terminal;
  for (let i = rows.length - 1; i >= n; i--) {
    const r = rows[i]; requiredClosing[i] = required;
    const flow = r.withdrawal.minus(r.contribution).minus(r.capitalInjection);
    algebraic = algebraic.plus(flow).div(r.growthFactor);
    required = positivePart(required.plus(flow).div(r.growthFactor));
    requiredOpening[i] = required;
  }
  const target = required, algebraicTarget = algebraic;
  // During accumulation, the target line is the actual remaining required
  // balance given declared future deposits, not an ornamental progress curve.
  for (let i = n - 1; i >= 0; i--) {
    const r = rows[i]; requiredClosing[i] = required;
    const weight = r.month < contributionStart ? new D(0) : input.contributionTiming === "START_OF_MONTH" ? r.growthFactor : new D(1);
    required = positivePart(required.plus(r.withdrawal).minus(r.contribution.mul(weight)).minus(r.capitalInjection).div(r.growthFactor));
    requiredOpening[i] = required;
  }
  let balance = initial, fundedBalance = initial, projected = initial, factorToRetirement = new D(1);
  let noContributionBalance = initial, coefficient = new D(0), requiredConstant = new D(0), additional = new D(0);
  let unmetTotal = new D(0), firstShortfallMonth: string | null = null, firstBudgetShortfallMonth: string | null = null;
  let earlyFundingRequired = false;
  const chart = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], accumulation = i < n, opening = balance;
    const eligible = r.month >= contributionStart;
    const begin = accumulation && eligible && input.contributionTiming === "START_OF_MONTH";
    const startDeposit = begin ? r.contribution : new D(0), endDeposit = begin ? new D(0) : r.contribution;
    const growth = opening.plus(startDeposit).mul(r.growthFactor.minus(1));
    balance = opening.plus(startDeposit).mul(r.growthFactor).plus(endDeposit).plus(r.capitalInjection).minus(r.withdrawal);
    // A separate funded ledger measures NEW unmet withdrawals without charging
    // investment returns to hypothetical borrowing. The signed balance above is
    // retained as the deterministic gap trajectory, never silently floored.
    const fundedAvailable = fundedBalance.plus(startDeposit).mul(r.growthFactor).plus(endDeposit).plus(r.capitalInjection);
    const unmet = positivePart(r.withdrawal.minus(fundedAvailable));
    fundedBalance = positivePart(fundedAvailable.minus(r.withdrawal));
    unmetTotal = unmetTotal.plus(unmet);
    if (unmet.gt(0)) firstShortfallMonth ??= r.month;
    const budgetShortfall = positivePart(r.plannedContribution.minus(r.contribution));
    if (budgetShortfall.gt(0) || (accumulation && r.withdrawal.gt(0))) firstBudgetShortfallMonth ??= r.month;
    if (accumulation) {
      factorToRetirement = factorToRetirement.mul(r.growthFactor);
      const weight = !eligible ? new D(0) : begin ? r.growthFactor : new D(1);
      noContributionBalance = noContributionBalance.mul(r.growthFactor).plus(r.capitalInjection).minus(r.withdrawal);
      coefficient = coefficient.mul(r.growthFactor).plus(weight);
      if (coefficient.gt(0)) {
        requiredConstant = D.max(requiredConstant, noContributionBalance.neg().div(coefficient));
        additional = D.max(additional, balance.neg().div(coefficient));
      } else if (balance.lt(0)) earlyFundingRequired = true;
      if (i === n - 1) {
        projected = balance;
        if (coefficient.gt(0)) {
          requiredConstant = D.max(requiredConstant, target.minus(noContributionBalance).div(coefficient));
          additional = D.max(additional, target.minus(balance).div(coefficient));
        }
      }
    }
    if (!balance.isFinite() || balance.abs().gt("1e100")) throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Khoảng dự phóng vượt giới hạn tính toán.");
    chart.push({ ...input.rows[i], phase: accumulation ? "ACCUMULATION" : "RETIREMENT",
      openingBalance: opening.toFixed(), investmentChange: growth.toFixed(), closingBalance: balance.toFixed(),
      fundedClosingBalance: fundedBalance.toFixed(), unfundedWithdrawal: unmet.toFixed(), budgetShortfall: budgetShortfall.toFixed(),
      requiredOpeningBalance: requiredOpening[i].toFixed(), requiredClosingBalance: requiredClosing[i].toFixed(),
      netWithdrawal: r.livingExpense.plus(r.additionalExpense).plus(r.debtPayment).minus(r.income).minus(r.pension).toFixed(),
    });
  }
  const gap = target.minus(projected), comparison = (a: Prisma.Decimal, k: Prisma.Decimal) => ({
    projectedFund: a.toFixed(), requiredFund: k.toFixed(), fundingGap: k.minus(a).toFixed(),
    coveragePercent: k.gt(0) ? a.div(k).mul(100).toFixed() : null,
  });
  const solvable = n > 0 && coefficient.gt(0) && !earlyFundingRequired;
  const requiredAmount = solvable ? positivePart(requiredConstant) : null;
  const additionalAmount = solvable ? positivePart(additional) : null;
  return { modelVersion: RETIREMENT_MODEL,
    conventions: { contributionTiming: input.contributionTiming, withdrawalTiming: "END_OF_MONTH",
      capitalReleaseTiming: "END_OF_MONTH", surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
      allocationCashflows: "PROPORTIONAL_TO_CURRENT_HOLDINGS", arithmeticPrecision: 48,
      firstPeriod: "FULL_MONTH_NO_DAILY_PRORATION", rounding: "DISPLAY_ONLY_VND_1000_PERCENT_2DP",
      negativeBalance: "GAP_TRAJECTORY_NOT_BORROWING", terminalBalanceBasis: "NOMINAL_AT_END" },
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
      terminalBalance: balance.toFixed(), fundedTerminalBalance: fundedBalance.toFixed(), terminalTarget: terminal.toFixed(),
      terminalTargetShortfall: positivePart(terminal.minus(fundedBalance)).toFixed(),
    }, rows: chart };
}
