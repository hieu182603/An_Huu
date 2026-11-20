import { RetirementDecimal as D, type MonthlyInput } from "./engine";
import type { RetirementPreview } from "./schema";
import type { protectCashflows } from "./protected-capital";

export type FeeRow = MonthlyInput & { advisoryFeeAmount?: string; advisoryFeeAverageFund?: string; advisoryFeePaidFrom?: "FUND" | "EXTERNAL" };
/** Calendar days in a YYYY-MM month (handles leap years via UTC day 0 of the next month). */
export function daysInMonth(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}
/** Full monthly periods, consistent with the kernel. AUM is the funded opening
 * and funded closing BEFORE this advisory charge, never a hypothetical debt.
 * v5 (spec §8.1): actual calendar days / 365; v3 (frozen): 1/12 year.
 * This is an additional advisory service, not a second deduction of NAV costs. */
export function applyAdvisoryFee(rows: MonthlyInput[], initialCapital: string, retirementMonth: string, input: RetirementPreview, v5 = false): FeeRow[] {
  if (!input.advisoryFee) return rows;
  let funded = new D(initialCapital);
  const annualRate = new D(input.advisoryFee.annualPercent).div(100);
  const v3PeriodRate = annualRate.div(12);
  return rows.map(original => {
    const r = { ...original };
    const begin = r.month < retirementMonth && input.contributionTiming === "START_OF_MONTH";
    // v5: withdrawals (incl. a FUND-paid fee) leave at the start of the month, before that month's return and trading cost.
    const closing = (row: MonthlyInput) => v5
      ? D.max(0, funded.plus(begin ? row.contribution : 0).minus(row.withdrawal)).mul(new D(1).minus(row.tradingCostRate ?? 0)).mul(row.growthFactor)
        .plus(begin ? 0 : row.contribution).plus(row.capitalInjection)
      : funded.plus(begin ? row.contribution : 0).mul(row.growthFactor)
        .plus(begin ? 0 : row.contribution).plus(row.capitalInjection).minus(row.withdrawal);
    const average = funded.plus(D.max(0, closing(r))).div(2);
    const fee = v5 ? average.mul(annualRate).mul(daysInMonth(r.month)).div(365) : average.mul(v3PeriodRate);
    if (input.advisoryFee!.paidFrom === "FUND") r.withdrawal = new D(r.withdrawal).plus(fee).toFixed();
    else {
      r.additionalExpense = new D(r.additionalExpense).plus(fee).toFixed();
      const remaining = new D(r.income).plus(r.pension).minus(r.livingExpense).minus(r.additionalExpense).minus(r.debtPayment);
      const household = D.max(0, remaining);
      r.contributionCapacity = D.min(r.contributionCapacity, household).toFixed();
      r.contribution = D.min(r.plannedContribution, r.contributionCapacity).toFixed();
      const paid=original as MonthlyInput & Partial<ReturnType<typeof protectCashflows>[number]>;
      r.withdrawal = D.max(0, remaining.neg().minus(paid.protectedHouseholdPaid??0).minus(paid.protectedGoalPaid??0)).toFixed();
      r.uninvestedSurplus = household.minus(r.contribution).toFixed();
    }
    funded = D.max(0, closing(r));
    return { ...r, advisoryFeeAmount: fee.toFixed(), advisoryFeeAverageFund: average.toFixed(), advisoryFeePaidFrom: input.advisoryFee!.paidFrom };
  });
}
