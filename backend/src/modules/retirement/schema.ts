import { z } from "zod";
import { moneySchema } from "../../common/http";
import { monthSchema } from "../../common/calendar";
import { debtPreviewSchema } from "../debts/schema";

const id = z.string().min(1).max(100);
const schedule = z.array(z.object({ month: monthSchema, amount: moneySchema }).strict()).max(1200)
  .refine(rows => new Set(rows.map(r => r.month)).size === rows.length, "Không được trùng tháng đóng.");
const ids = z.array(id).max(200).refine(v => new Set(v).size === v.length, "ID không được trùng.");
export const retirementPreviewSchema = z.object({
  expectedProfileRevision: z.number().int().min(1), policyVersionId: z.string().uuid(),
  scenario: z.enum(["BASE", "ADVERSE", "FAVORABLE"]), templateId: id.optional(),
  answers: z.array(z.object({ questionId: id, choiceId: id }).strict()).max(30),
  liquidityNeedMonths: z.number().int().min(0).max(1200),
  endMonth: monthSchema, monthlyExpenseToday: moneySchema, monthlyContribution: moneySchema,
  monthlyReserve: moneySchema,
  contributionTiming: z.enum(["END_OF_MONTH", "START_OF_MONTH"]).default("END_OF_MONTH"),
  surplusPolicy: z.literal("EXPLICIT_DEPOSITS_ONLY").default("EXPLICIT_DEPOSITS_ONLY"),
  startOfMonthFunding: z.object({
    confirmed: z.literal(true),
    // Part of the same month's disposable cashflow already available at its start.
    // Not extra income, not retirement capital or a release later in the month.
    source: z.literal("CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START"),
    monthlyAvailable: moneySchema,
    schedule: schedule.default([]),
  }).strict().optional(),
  terminalBalance: moneySchema.default("0"),
  contributionSchedule: schedule.default([]), retirementContributionSchedule: schedule.default([]),
  retirementIncomeIds: ids, retirementAdditionalExpenseIds: ids.default([]),
  debtStress: debtPreviewSchema.innerType().shape.stress.default([]),
  // Personal alternatives only; never accepts investment/inflation assumptions.
  // Persisted profile remains unchanged, even when this plan is later applied.
  whatIf: z.object({
    retirementMonth: monthSchema.optional(),
    assetValues: z.array(z.object({ assetId: id, value: moneySchema }).strict()).min(1).max(200)
      .refine(rows => new Set(rows.map(r => r.assetId)).size === rows.length, "Không được trùng tài sản mô phỏng.").optional(),
  }).strict().refine(v => v.retirementMonth !== undefined || v.assetValues !== undefined, "Cần ít nhất một thay đổi mô phỏng.").optional(),
  // Explicit mapping prevents rent/sale proceeds being counted both in assets and
  // income. Old housing declarations lacking amount scope require review.
  housing: z.array(z.object({ assetId: id, amountScope: z.enum(["WHOLE_ASSET", "OWNERS_SHARE"]),
    linkedIncomeId: id.optional() }).strict()).max(200).default([]),
}).strict().superRefine((value, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (value.contributionTiming === "END_OF_MONTH" && value.startOfMonthFunding)
    issue(["startOfMonthFunding"], "Chỉ khai nguồn đầu tháng khi chọn góp đầu tháng.");
  if (new Set(value.housing.map(h => h.assetId)).size !== value.housing.length) issue(["housing"], "Không được trùng tài sản.");
  const linked = value.housing.flatMap(h => h.linkedIncomeId ? [h.linkedIncomeId] : []);
  if (new Set(linked).size !== linked.length) issue(["housing"], "Một dòng thu chỉ liên kết một tài sản.");
  value.debtStress.forEach((entry, i) => {
    if (value.debtStress.slice(0, i).some(other => other.loanId === entry.loanId && other.startMonth <= entry.endMonth && entry.startMonth <= other.endMonth))
      issue(["debtStress", i], "Không được chồng khoảng căng thẳng của cùng khoản vay.");
  });
});
export type RetirementPreview = z.infer<typeof retirementPreviewSchema>;
export const RETIREMENT_MODEL = "retirement-monthly-v3";
