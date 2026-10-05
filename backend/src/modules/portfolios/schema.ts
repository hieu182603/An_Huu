import { z } from "zod";
import { Prisma } from "@prisma/client";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { ratePercentSchema, revisionSchema } from "../assumptions/schema";

export const PORTFOLIO_POLICY_CODE = "portfolio-policy-v1";
export const dimensions = ["OBJECTIVE", "HORIZON", "LIQUIDITY", "LOSS_TOLERANCE", "EXPERIENCE", "FINANCIAL_CAPACITY"] as const;
export const dimensionSchema = z.enum(dimensions);
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const note = z.string().trim().min(3).max(2000);
const score = z.number().int().min(0).max(3000);
const months = z.number().int().min(1).max(1200);
const percent = z.string().regex(/^(0|[1-9]\d?|100)(\.\d{1,8})?$/).refine(v => new Prisma.Decimal(v).lte(100));
const range = z.object({ min: score, max: score }).strict().refine(v => v.min <= v.max, "Ngưỡng không hợp lệ.");
export const portfolioDocumentSchema = z.object({
  schemaVersion: z.literal(1), title: z.string().trim().min(3).max(200), reason: note, effectiveFrom: dateSchema,
  assumptionVersionId: z.string().uuid(),
  source: z.object({ title: note, url: z.string().url().max(2000).refine(v => v.startsWith("https://")), release: note, reviewedOn: dateSchema }).strict(),
  questions: z.array(z.object({ id: code, dimension: dimensionSchema, prompt: note,
    choices: z.array(z.object({ id: code, label: note, score: z.number().int().min(0).max(100) }).strict()).min(2).max(10),
  }).strict()).max(30),
  riskBands: z.array(z.object({ id: code, label: note, minScore: score, maxScore: score }).strict()
    .refine(v => v.minScore <= v.maxScore, "Ngưỡng không hợp lệ.")).max(20),
  templates: z.array(z.object({ id: code, label: note, coverageMonths: months,
    rebalance: z.object({ everyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
      timing: z.literal("START_OF_MONTH"), turnoverCostPercent: percent.refine(v => new Prisma.Decimal(v).lt(100)),
      costConvention: z.literal("HALF_L1_TURNOVER_TIMES_COST"), evidence: note,
    }).strict(),
    schedule: z.array(z.object({ fromIndex: months, toIndex: months,
      allocations: z.array(z.object({ assetClass: code, weightPercent: percent }).strict()).min(1).max(20),
    }).strict().refine(v => v.fromIndex <= v.toIndex, "Lịch không hợp lệ.")).max(120),
  }).strict()).max(30),
  rules: z.array(z.object({ id: code, templateId: code, riskBandIds: z.array(code).min(1).max(20), explanation: note,
    horizon: z.object({ min: months, max: months }).strict().refine(v => v.min <= v.max),
    liquidityNeed: z.object({ min: z.number().int().min(0).max(1200), max: z.number().int().min(0).max(1200) }).strict().refine(v => v.min <= v.max),
    dimensions: z.object({ OBJECTIVE: range, HORIZON: range, LIQUIDITY: range, LOSS_TOLERANCE: range, EXPERIENCE: range, FINANCIAL_CAPACITY: range }).strict(),
  }).strict()).max(100),
  scenarios: z.array(z.object({ kind: z.enum(["BASE", "ADVERSE", "FAVORABLE"]), label: note, evidence: note,
    convention: z.literal("DELTA_POINTS_ON_NET_NOMINAL_ANNUAL_RATES"),
    years: z.array(z.object({ year: z.number().int().min(1900).max(2199), inflationDeltaPoints: ratePercentSchema,
      returns: z.array(z.object({ assetClass: code, deltaPoints: ratePercentSchema }).strict()).max(20),
    }).strict()).max(300),
  }).strict()).max(3),
}).strict();
export const writePortfolioSchema = revisionSchema.extend({ data: portfolioDocumentSchema }).strict();
export const approvePortfolioSchema = revisionSchema.extend({ reviewNote: note, confirm: z.literal(true) }).strict();
export const portfolioPreviewSchema = z.object({ policyVersionId: z.string().uuid(), startMonth: monthSchema, horizonMonths: months,
  liquidityNeedMonths: z.number().int().min(0).max(1200), templateId: code.optional(),
  answers: z.array(z.object({ questionId: code, choiceId: code }).strict()).max(30),
}).strict().refine(v => monthSchema.safeParse(addMonths(v.startMonth, v.horizonMonths - 1)).success, "Khoảng tháng vượt năm 2199.");
export type PortfolioDocument = z.infer<typeof portfolioDocumentSchema>;
export type PortfolioPreview = z.infer<typeof portfolioPreviewSchema>;
