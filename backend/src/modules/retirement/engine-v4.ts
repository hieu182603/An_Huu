import { z } from "zod";
import { AppError } from "../../common/errors";
import { monthSchema } from "../../common/calendar";
import { projectRetirement as projectFrozen, RetirementDecimal as D, type ProjectionInput, type MonthlyInput } from "./engine";
import { assertSourceTotals, sourceRegistrySchema, type SourceRegistry } from "./sources";

export const SOURCE_MODEL = "retirement-monthly-v4" as const;
export const SOURCE_SNAPSHOT_FORMAT = "retirement-plan-snapshot-v2" as const;
const amount = z.string().max(160).regex(/^(0|[1-9]\d*)(\.\d+)?$/).refine(v => new D(v).lte("1e100"));
export const sourceBudgetSchema = z.object({
  originalRetirementMonth: monthSchema,
  startFunding: z.object({ monthlyAvailable: amount, schedule: z.array(z.object({ month: monthSchema, amount }).strict()).max(1200) }).strict().nullable(),
}).strict().superRefine((v, ctx) => {
  const months = v.startFunding?.schedule.map(r => r.month) ?? [];
  if (new Set(months).size !== months.length) ctx.addIssue({ code: "custom", message: "Trùng tháng ngân sách đầu kỳ." });
});
export type SourceProjectionInput = Omit<ProjectionInput, "modelVersion"> & {
  modelVersion: typeof SOURCE_MODEL; sourceRegistry: SourceRegistry; sourceBudget: z.infer<typeof sourceBudgetSchema>;
};

/** V4 owns source resolution and household budget derivation. The verified v3
 * recurrence is an explicitly frozen numerical kernel; its inputs are rebuilt
 * and cross-checked here, never trusted as independently editable totals. */
export function projectSources(input: SourceProjectionInput) {
  if (input.modelVersion !== SOURCE_MODEL) throw new AppError(422, "SNAPSHOT_MODEL_UNSUPPORTED", "Sai mô hình nguồn.");
  sourceRegistrySchema.parse(input.sourceRegistry);
  const budget = sourceBudgetSchema.parse(input.sourceBudget);
  if (input.contributionTiming === "START_OF_MONTH_RESEARCH" ||
    input.retirementMonth !== (budget.originalRetirementMonth < input.valuationDate.slice(0, 7) ? input.valuationDate.slice(0, 7) : budget.originalRetirementMonth))
    throw new AppError(422, "SOURCE_BUDGET_INVALID", "Quy ước ngân sách không khớp thời điểm nghỉ hưu.");
  const composed = assertSourceTotals(input.sourceRegistry, input.rows);
  const rows = rebuildSourceBudget(input, composed.rows);
  for (let i = 0; i < rows.length; i++) for (const key of ["contribution", "contributionCapacity", "withdrawal", "uninvestedSurplus"] as const)
    if (!new D(rows[i][key]).eq(input.rows[i][key])) throw new AppError(422, "SOURCE_BUDGET_MISMATCH", "Ngân sách không khớp lịch nguồn.");
  const { sourceRegistry: _, sourceBudget: __, ...kernel } = input;
  const result = projectFrozen({ ...kernel, modelVersion: "retirement-monthly-v3", rows });
  return { ...result, modelVersion: SOURCE_MODEL, sourceRegistryHash: input.sourceRegistry.registryHash, attribution: composed.attribution };
}

export function rebuildSourceBudget(input: SourceProjectionInput, totals: Array<Pick<MonthlyInput, "month" | "income" | "pension" | "livingExpense" | "additionalExpense" | "debtPayment" | "capitalInjection">>): MonthlyInput[] {
  return totals.map((total, i) => {
    const row = { ...input.rows[i], ...total }, budget = input.sourceBudget;
    const remaining = new D(row.income).plus(row.pension).minus(row.livingExpense).minus(row.additionalExpense).minus(row.debtPayment);
    const capacity = D.max(0, remaining), retired = row.month >= budget.originalRetirementMonth;
    const available = budget.startFunding?.schedule.find(r => r.month === row.month)?.amount ?? budget.startFunding?.monthlyAvailable ?? "0";
    const allowed = !retired && input.contributionTiming === "START_OF_MONTH"
      ? row.month < (input.contributionStartMonth ?? input.valuationDate.slice(0, 7)) ? new D(0) : D.min(capacity, available) : capacity;
    const contribution = D.min(allowed, row.plannedContribution);
    return { ...row, contributionCapacity: allowed.toFixed(), contribution: contribution.toFixed(), withdrawal: D.max(0, remaining.neg()).toFixed(),
      uninvestedSurplus: capacity.minus(contribution).toFixed() };
  });
}
