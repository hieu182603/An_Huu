import { z } from "zod";
import { Prisma } from "@prisma/client";

const decimal = z.string().max(30).regex(/^-?(0|[1-9]\d*)(\.\d+)?$/);
const positive = decimal.refine(v => new Prisma.Decimal(v).gt(0));
const percent = decimal.refine(v => new Prisma.Decimal(v).gte(0) && new Prisma.Decimal(v).lte(100));
const shock = decimal.refine(v => new Prisma.Decimal(v).gt(-100) && new Prisma.Decimal(v).lte(0));
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const timing = { offsetMonths: z.number().int().min(-1200).max(1200), durationMonths: z.number().int().min(1).max(1200) };
export const stressKinds = ["HIGH_INFLATION", "EQUITY_CRASH", "RATE_RISE", "CREDIT", "GOLD", "PROPERTY_ILLIQUIDITY", "INCOME_LOSS", "LONGEVITY"] as const;
export const riskPolicySchema = z.object({
  evidence: z.string().min(3).max(2000),
  blockMonths: z.number().int().min(12).max(36).optional(),
  cvarAlpha: decimal.refine(v => new Prisma.Decimal(v).gt(0) && new Prisma.Decimal(v).lt(1)).optional(),
  essentialThreshold: decimal.refine(v => new Prisma.Decimal(v).gt(0) && new Prisma.Decimal(v).lte(1)).optional(),
  equityShiftPoints: positive.refine(v => new Prisma.Decimal(v).lte(100)).optional(),
  rebalanceBandPoints: percent.optional(),
  continuousOptimizer: z.object({
    riskAversionGamma: z.number().finite().min(0).max(1000),
    uncertaintyKappa: z.number().finite().min(0).max(1000),
    turnoverPenaltyEta: z.number().finite().min(0).max(1000),
    estimation: z.object({
      evidence: z.string().min(5).max(2000),
      historicalWeight: z.number().finite().min(0).max(1),
      monthlyBaselines: z.array(z.object({ assetClass: code, returnRate: z.number().finite().gt(-1).max(1) }).strict()).min(1).max(20),
    }).strict().optional(),
    bounds: z.array(z.object({ assetClass: code, min: z.number().min(0).max(1), max: z.number().min(0).max(1) }).strict().refine(v => v.min <= v.max)).min(1).max(20),
  }).strict().optional(),
  stresses: z.object({
    HIGH_INFLATION: z.object({ ...timing, annualDeltaPoints: positive }).strict().optional(),
    // Spec 9.1 asks for a -35% to -50% range: shockPercent is the base level, severeShockPercent an optional deeper level.
    EQUITY_CRASH: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, shockPercent: shock, severeShockPercent: shock.optional() }).strict()
      .refine(v => v.severeShockPercent === undefined || new Prisma.Decimal(v.severeShockPercent).lt(v.shockPercent), { path: ["severeShockPercent"], message: "Mức sốc nặng phải sâu hơn mức cơ sở." }).optional(),
    RATE_RISE: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, durationYears: positive, yieldRisePoints: positive }).strict().optional(),
    CREDIT: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, defaultPercent: percent, recoveryPercent: percent }).strict().optional(),
    GOLD: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, shockPercent: shock, spreadPoints: percent }).strict().optional(),
    PROPERTY_ILLIQUIDITY: z.object({ ...timing, delayMonths: z.number().int().min(1).max(120), haircutPercent: percent }).strict().optional(),
    INCOME_LOSS: z.object({ ...timing, lostPercent: percent }).strict().optional(),
    LONGEVITY: z.object({ extraYears: z.array(z.union([z.literal(5), z.literal(10)])).min(1).max(2),
      terminalContinuation: z.literal("LIVING_CPI_LIFELONG_PENSION_ONLY").optional() }).strict().optional(),
  }).strict().optional(),
}).strict();
export type RiskPolicy = z.infer<typeof riskPolicySchema>;
