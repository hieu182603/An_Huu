import { z } from "zod";
import { moneySchema } from "../../common/http";
import { dateSchema, monthSchema } from "../../common/calendar";

const source = z.string().trim().min(1).max(500);
export const pensionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNKNOWN") }).strict(),
  z.object({ status: z.literal("NOT_APPLICABLE"), reason: z.string().trim().min(1).max(300) }).strict(),
  z.object({
    status: z.literal("KNOWN"), monthlyAmount: moneySchema, currency: z.literal("VND"),
    priceBasis: z.enum(["TODAY", "NOMINAL_AT_START"]), basisMonth: monthSchema,
    source, estimatedOn: dateSchema,
    linkedIncomeId: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    adjustment: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("NONE") }).strict(),
      z.object({ kind: z.literal("EXPLICIT_SCHEDULE"), entries: z.array(z.object({
        effectiveMonth: monthSchema, monthlyAmount: moneySchema, source,
      }).strict()).min(1).max(200) }).strict(),
    ]),
  }).strict(),
]);
export const retirementConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("UNKNOWN") }).strict(),
  z.object({ kind: z.literal("NORMAL") }).strict(),
  z.object({ kind: z.literal("ARTICLE_5_DECLARED"), basis: z.enum([
    "HAZARDOUS_15_YEARS", "DIFFICULT_REGION_15_YEARS", "COMBINED_15_YEARS", "WORK_CAPACITY_LOSS_61_PERCENT",
  ]), evidence: source }).strict(),
  z.object({ kind: z.literal("OTHER"), description: source }).strict(),
]);
export const pensionPreviewSchema = z.object({
  expectedProfileRevision: z.number().int().min(1), startMonth: monthSchema,
  months: z.number().int().min(1).max(1200), assumptionVersionId: z.string().uuid().optional(),
}).strict();
export type Pension = z.infer<typeof pensionSchema>;
export type RetirementCondition = z.infer<typeof retirementConditionSchema>;
