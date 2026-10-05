import { AppError } from "../../common/errors";
import { RetirementDecimal as D, type MonthlyInput } from "../retirement/engine";
import type { RetirementPreview } from "../retirement/schema";
import type { z } from "zod";
import type { futureChangeSchema } from "./schema";

export function updateFutureRows(source: MonthlyInput[], changes: z.infer<typeof futureChangeSchema>[], selection: RetirementPreview, retirementMonth: string, recalculate = false): MonthlyInput[] {
  for (const change of changes) {
    if (!source.length || change.startMonth < source[0].month || change.endMonth > source.at(-1)!.month)
      throw new AppError(422, "FUTURE_CHANGE_OUTSIDE_REMAINING_HORIZON", "Chỉ sửa các tháng tương lai còn lại.");
  }
  return source.map(original => {
    const applicable = changes.filter(c => c.startMonth <= original.month && original.month <= c.endMonth);
    if (!applicable.length && !recalculate) return { ...original };
    const row = { ...original };
    for (const c of applicable) row[c.field] = c.amount;
    // These are nominal monthly totals after the cutoff. Pension, debt, capital
    // releases and market factors remain pinned; never infer their edits from cash.
    const remaining = new D(row.income).plus(row.pension).minus(row.livingExpense).minus(row.additionalExpense).minus(row.debtPayment);
    const householdCapacity = D.max(0, remaining);
    const startAvailable = selection.startOfMonthFunding?.schedule.find(r => r.month === row.month)?.amount ?? selection.startOfMonthFunding?.monthlyAvailable ?? "0";
    const capacity = selection.contributionTiming === "START_OF_MONTH" && row.month < retirementMonth
      ? D.min(householdCapacity, startAvailable) : householdCapacity;
    const contribution = D.min(capacity, row.plannedContribution);
    return { ...row, contributionCapacity: capacity.toFixed(), contribution: contribution.toFixed(),
      withdrawal: D.max(0, remaining.neg()).toFixed(), uninvestedSurplus: householdCapacity.minus(contribution).toFixed() };
  });
}
