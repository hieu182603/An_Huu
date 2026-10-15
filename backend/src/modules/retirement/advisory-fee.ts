import { RetirementDecimal as D, type MonthlyInput } from "./engine";
import type { RetirementPreview } from "./schema";

export type FeeRow = MonthlyInput & { advisoryFeeAmount?: string; advisoryFeeAverageFund?: string; advisoryFeePaidFrom?: "FUND" | "EXTERNAL" };
/** Full monthly periods, consistent with the kernel. AUM is the funded opening
 * and funded closing BEFORE this advisory charge, never a hypothetical debt.
 * This is an additional advisory service, not a second deduction of NAV costs. */
export function applyAdvisoryFee(rows: MonthlyInput[], initialCapital: string, retirementMonth: string, input: RetirementPreview): FeeRow[] {
  if (!input.advisoryFee) return rows;
  let funded = new D(initialCapital);
  const periodRate = new D(input.advisoryFee.annualPercent).div(100).div(12);
  return rows.map(original => {
    const r = { ...original };
    const begin = r.month < retirementMonth && input.contributionTiming === "START_OF_MONTH";
    const closing = (row: MonthlyInput) => funded.plus(begin ? row.contribution : 0).mul(row.growthFactor)
      .plus(begin ? 0 : row.contribution).plus(row.capitalInjection).minus(row.withdrawal);
    const average = funded.plus(D.max(0, closing(r))).div(2);
    const fee = average.mul(periodRate);
    if (input.advisoryFee!.paidFrom === "FUND") r.withdrawal = new D(r.withdrawal).plus(fee).toFixed();
    else {
      r.additionalExpense = new D(r.additionalExpense).plus(fee).toFixed();
      const remaining = new D(r.income).plus(r.pension).minus(r.livingExpense).minus(r.additionalExpense).minus(r.debtPayment);
      const household = D.max(0, remaining);
      r.contributionCapacity = D.min(r.contributionCapacity, household).toFixed();
      r.contribution = D.min(r.plannedContribution, r.contributionCapacity).toFixed();
      r.withdrawal = D.max(0, remaining.neg()).toFixed();
      r.uninvestedSurplus = household.minus(r.contribution).toFixed();
    }
    funded = D.max(0, closing(r));
    return { ...r, advisoryFeeAmount: fee.toFixed(), advisoryFeeAverageFund: average.toFixed(), advisoryFeePaidFrom: input.advisoryFee!.paidFrom };
  });
}
