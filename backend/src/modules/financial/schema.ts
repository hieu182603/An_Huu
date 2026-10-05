import { z } from "zod";
import { Prisma } from "@prisma/client";
import { moneySchema } from "../../common/http";

export const MODEL_CODE = "monthly-cashflow-v1";
export const riskSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const percentage = z.string().regex(/^-?(0|[1-9]\d?)(\.\d{1,4})?$/)
  .refine(v => new Prisma.Decimal(v).gte(-50) && new Prisma.Decimal(v).lte(50), "Tỷ lệ nằm ngoài miền tính toán.");
const weight = z.string().regex(/^(0|[1-9]\d?|100)(\.\d{1,4})?$/).refine(v => new Prisma.Decimal(v).lte(100));
export const sourceSchema = z.object({
  title: z.string().trim().min(3).max(200), url: z.string().url().refine(v => v.startsWith("https://")),
  asOfDate: z.string().datetime(), note: z.string().trim().min(3).max(2000),
}).strict();
const values = z.object({
  annualInflationRate: percentage.refine(v => new Prisma.Decimal(v).gte(0) && new Prisma.Decimal(v).lte(20)),
  assetClasses: z.array(z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,29}$/), annualReturnRate: percentage }).strict()).min(1).max(10),
}).strict();
const rule = z.object({
  minAge: z.number().int().min(18).max(110), maxAge: z.number().int().min(18).max(110), riskLevel: riskSchema,
  allocations: z.array(z.object({ assetClass: z.string(), weightPercent: weight }).strict()).min(1).max(10),
}).strict();
export const assumptionSchema = z.object({
  modelCode: z.literal(MODEL_CODE), values, policy: z.object({ rules: z.array(rule).min(3).max(60) }).strict(),
  source: z.array(sourceSchema).min(1).max(20), reason: z.string().trim().min(5).max(2000),
}).strict().superRefine((data, ctx) => {
  const codes = data.values.assetClasses.map(a => a.code);
  if (new Set(codes).size !== codes.length) ctx.addIssue({ code: "custom", path: ["values"], message: "Mã loại tài sản không được trùng." });
  for (const [i, r] of data.policy.rules.entries()) {
    const total = r.allocations.reduce((sum, a) => sum.plus(a.weightPercent), new Prisma.Decimal(0));
    if (r.maxAge < r.minAge || !total.eq(100) || new Set(r.allocations.map(a => a.assetClass)).size !== r.allocations.length ||
        r.allocations.some(a => !codes.includes(a.assetClass)))
      ctx.addIssue({ code: "custom", path: ["policy", "rules", i], message: "Phân bổ phải hợp lệ, không trùng và có tổng 100%." });
  }
  for (const risk of riskSchema.options) for (let age = 18; age <= 110; age++) {
    if (data.policy.rules.filter(r => r.riskLevel === risk && r.minAge <= age && r.maxAge >= age).length !== 1) {
      ctx.addIssue({ code: "custom", path: ["policy"], message: "Mỗi tuổi 18–110 và mức rủi ro phải khớp đúng một quy tắc." }); return;
    }
  }
});
export const goalDataSchema = z.object({
  targetRetirementAge: z.number().int().min(18).max(100), lifeExpectancy: z.number().int().min(19).max(110),
  lifestyle: z.enum(["ESSENTIAL", "COMFORTABLE", "FLEXIBLE"]), monthlyExpense: moneySchema,
  monthlyContribution: moneySchema, riskLevel: riskSchema,
}).strict().refine(v => v.lifeExpectancy > v.targetRetirementAge, { path: ["lifeExpectancy"], message: "Tuổi kết thúc kế hoạch phải sau tuổi nghỉ hưu." });
export const goalWriteSchema = z.object({ expectedRevision: z.number().int().min(0), data: goalDataSchema }).strict();
export const calculateSchema = z.object({ expectedProfileRevision: z.number().int().min(1), expectedGoalRevision: z.number().int().min(1) }).strict();
export const draftWriteSchema = z.object({ expectedRevision: z.number().int().min(1), data: assumptionSchema }).strict();
export const publishSchema = z.object({
  expectedRevision: z.number().int().min(1), expectedActiveVersionId: z.string().uuid().nullable(), confirm: z.literal(true),
}).strict();
export const approveModelSchema = z.object({ confirm: z.literal(true), review: sourceSchema }).strict();
export const publicPreviewSchema = z.object({
  currentAge: z.number().int().min(18).max(100), initialInvestableAssets: moneySchema, goal: goalDataSchema,
}).strict().refine(v => v.goal.targetRetirementAge >= v.currentAge, { path: ["goal", "targetRetirementAge"], message: "Tuổi nghỉ hưu không được nhỏ hơn tuổi hiện tại." });
export type Assumptions = z.infer<typeof assumptionSchema>;
export type Goal = z.infer<typeof goalDataSchema>;
