import { z } from "zod";
import { Prisma } from "@prisma/client";
import { moneySchema } from "../../common/http";
import { dateSchema, monthSchema } from "../../common/calendar";

const money = moneySchema.refine(v => new Prisma.Decimal(v).lte("1000000000000000"), "Số tiền vượt giới hạn khảo sát.").nullable().optional();
const month = monthSchema.nullable().optional();
const duration = z.enum(["unknown", "1", "3", "5", "10", "retirement", "custom"]).optional();
const rate = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,10})?$/).refine(v => new Prisma.Decimal(v).lte(100)).nullable().optional();
/** Draft answers are retained independently of canonical totals: going back must
 * not turn retirement spending into today's spending, or add support twice. */
export const quickStartSurveySchema = z.object({
  version: z.literal(1), birthDate: dateSchema.nullable().optional(), birthMonth: month,
  retirementAge: z.number().int().min(18).max(100).nullable().optional(), retirementMonth: month, endMonth: month,
  monthlyExpenseToday: money, monthlyIncome: money, monthlyExpense: money,
  retirementSavings: money, monthlyContribution: money, emergencyAmount: money,
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "OTHER"]).nullable().optional(),
  dependents: z.number().int().min(0).max(30).nullable().optional(),
  childEnabled: z.boolean().optional(), childAmount: money, childDuration: duration, childEnd: month, childIncluded: z.boolean().optional(),
  parentEnabled: z.boolean().optional(), parentAmount: money, parentDuration: duration, parentEnd: month, parentIncluded: z.boolean().optional(),
  debtEnabled: z.boolean().optional(), debtBalance: money, debtMonthlyPayment: money, debtAnnualRatePercent: rate,
  goalEnabled: z.boolean().optional(), goalName: z.string().trim().max(100).optional(), goalAmount: money, goalMonth: month, goalDeferrable: z.boolean().optional(),
  pensionStatus: z.enum(["unknown", "none", "known"]).optional(), pension: money, pensionStart: month,
  reaction: z.enum(["SELL", "HOLD", "BUY_MORE"]).nullable().optional(),
  stability: z.enum(["UNKNOWN", "STABLE", "VARIABLE", "UNCERTAIN"]).optional(),
  priority: z.enum(["BALANCED", "HEALTH", "HOUSING", "TRAVEL"]).optional(),
  lossStatus: z.enum(["unknown", "amount", "percent"]).optional(), lossAmount: money, lossPercent: rate,
}).strict();
export type QuickStartSurvey = z.infer<typeof quickStartSurveySchema>;
