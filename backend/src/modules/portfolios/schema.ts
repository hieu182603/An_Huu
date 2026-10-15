import { z } from "zod";
import { Prisma } from "@prisma/client";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { ratePercentSchema, revisionSchema } from "../assumptions/schema";
import { riskPolicySchema } from "../allocation-risk/policy";

export const PORTFOLIO_POLICY_CODE = "portfolio-policy-v1";
export const dimensions = ["OBJECTIVE", "HORIZON", "LIQUIDITY", "LOSS_TOLERANCE", "EXPERIENCE", "FINANCIAL_CAPACITY"] as const;
export const dimensionSchema = z.enum(dimensions);
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const note = z.string().trim().min(3).max(2000);
const score = z.number().int().min(0).max(3000);
const months = z.number().int().min(1).max(1200);
const percent = z.string().regex(/^(0|[1-9]\d?|100)(\.\d{1,8})?$/).refine(v => new Prisma.Decimal(v).lte(100));
const range = z.object({ min: score, max: score }).strict().refine(v => v.min <= v.max, "Ngưỡng không hợp lệ.");
const allocationsSchema = z.array(z.object({ assetClass: code, weightPercent: percent }).strict()).min(1).max(20);
const rebalanceSchema = z.object({ everyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  timing: z.literal("START_OF_MONTH"), turnoverCostPercent: percent.refine(v => new Prisma.Decimal(v).lt(100)),
  costConvention: z.literal("HALF_L1_TURNOVER_TIMES_COST"), evidence: note,
}).strict();
const scheduleTemplateSchema = z.object({ id: code, label: note, coverageMonths: months, rebalance: rebalanceSchema,
  schedule: z.array(z.object({ fromIndex: months, toIndex: months, allocations: allocationsSchema,
  }).strict().refine(v => v.fromIndex <= v.toIndex, "Lịch không hợp lệ.")).max(120),
}).strict();
// Schema v2: targets depend on whole years remaining until the plan's retirement
// month, so the same template de-risks correctly for any age or retirement date.
const glideTemplateSchema = z.object({ id: code, label: note, rebalance: rebalanceSchema,
  glidePath: z.object({ anchor: z.literal("RETIREMENT_MONTH"), interpolation: z.literal("LINEAR_BY_WHOLE_YEARS_TO_ANCHOR"),
    afterAnchor: z.literal("HOLD_ZERO_YEAR_POINT"),
    points: z.array(z.object({ yearsToAnchor: z.number().int().min(0).max(100), allocations: allocationsSchema }).strict()).min(1).max(40),
  }).strict(),
}).strict();
// Key order is part of the approval hash (JSON of the parsed document), so both
// versions keep the v1 order: header, questions, bands, templates, rules, scenarios.
const headerFields = {
  title: z.string().trim().min(3).max(200), reason: note, effectiveFrom: dateSchema,
  assumptionVersionId: z.string().uuid(),
  source: z.object({ title: note, url: z.string().url().max(2000).refine(v => v.startsWith("https://")), release: note, reviewedOn: dateSchema }).strict(),
  questions: z.array(z.object({ id: code, dimension: dimensionSchema, prompt: note,
    choices: z.array(z.object({ id: code, label: note, score: z.number().int().min(0).max(100) }).strict()).min(2).max(10),
  }).strict()).max(30),
  riskBands: z.array(z.object({ id: code, label: note, minScore: score, maxScore: score }).strict()
    .refine(v => v.minScore <= v.maxScore, "Ngưỡng không hợp lệ.")).max(20),
};
const tailFields = {
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
};
export const portfolioDocumentV1Schema = z.object({ schemaVersion: z.literal(1), ...headerFields,
  templates: z.array(scheduleTemplateSchema).max(30), ...tailFields }).strict();
export const portfolioDocumentV2Schema = z.object({ schemaVersion: z.literal(2), ...headerFields,
  templates: z.array(glideTemplateSchema).max(30), ...tailFields,
  lossStress: z.object({
    evidence: note, equityAssetClass: code, depositAssetClass: code,
    shocks: z.array(z.object({ assetClass: code,
      percent: z.string().regex(/^-?(0|[1-9]\d{0,2})(\.\d{1,10})?$/)
        .refine(v => new Prisma.Decimal(v).gte(-100) && new Prisma.Decimal(v).lte(0)),
    }).strict()).min(1).max(20),
  }).strict().optional(),
  allocationRisk: riskPolicySchema.optional(),
}).strict();
export const portfolioDocumentSchema = z.discriminatedUnion("schemaVersion", [portfolioDocumentV1Schema, portfolioDocumentV2Schema]);
export const writePortfolioSchema = revisionSchema.extend({ data: portfolioDocumentSchema }).strict();
export const approvePortfolioSchema = revisionSchema.extend({ reviewNote: note, confirm: z.literal(true) }).strict();
export const portfolioPreviewSchema = z.object({ policyVersionId: z.string().uuid(), startMonth: monthSchema, horizonMonths: months,
  liquidityNeedMonths: z.number().int().min(0).max(1200), templateId: code.optional(),
  answers: z.array(z.object({ questionId: code, choiceId: code }).strict()).max(30),
  // Required by schema-v2 (glide path) policies; ignored by schema-v1 policies.
  retirementMonth: monthSchema.optional(),
}).strict().refine(v => monthSchema.safeParse(addMonths(v.startMonth, v.horizonMonths - 1)).success, "Khoảng tháng vượt năm 2199.");
export type PortfolioDocument = z.infer<typeof portfolioDocumentSchema>;
export type PortfolioTemplate = PortfolioDocument["templates"][number];
export type PortfolioPreview = z.infer<typeof portfolioPreviewSchema>;
