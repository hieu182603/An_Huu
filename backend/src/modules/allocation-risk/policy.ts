import { z } from "zod";
import { Prisma } from "@prisma/client";
import { LIMITS } from "./simulation";

const decimal = z.string().max(30).regex(/^-?(0|[1-9]\d*)(\.\d+)?$/);
const positive = decimal.refine(v => new Prisma.Decimal(v).gt(0));
const percent = decimal.refine(v => new Prisma.Decimal(v).gte(0) && new Prisma.Decimal(v).lte(100));
export const unitRatio = decimal.refine(v => new Prisma.Decimal(v).gt(0) && new Prisma.Decimal(v).lte(1));
const shock = decimal.refine(v => new Prisma.Decimal(v).gt(-100) && new Prisma.Decimal(v).lte(0));
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const timing = { offsetMonths: z.number().int().min(-1200).max(1200), durationMonths: z.number().int().min(1).max(1200) };
const goldSpread = z.union([percent, z.number().finite().min(0).max(100)]);
export const stressKinds = ["HIGH_INFLATION", "EQUITY_CRASH", "RATE_RISE", "CREDIT", "GOLD", "PROPERTY_ILLIQUIDITY", "INCOME_LOSS", "LONGEVITY", "SEQUENCE_OF_RETURNS"] as const;
export const riskPolicySchema = z.object({
  evidence: z.string().min(3).max(2000),
  simulationPaths: z.number().int().min(1).max(LIMITS.maxPaths).optional(),
  blockMonths: z.number().int().min(12).max(36).optional(),
  cvarAlpha: decimal.refine(v => new Prisma.Decimal(v).gt(0) && new Prisma.Decimal(v).lt(1)).optional(),
  essentialThreshold: unitRatio.optional(),
  essentialThresholdRange: z.object({ min: unitRatio, max: unitRatio }).strict()
    .refine(v => new Prisma.Decimal(v.min).lte(v.max), { path: ["max"], message: "Ngưỡng tối đa phải >= ngưỡng tối thiểu." }).optional(),
  allGoalsThreshold: unitRatio.optional(),
  equityShiftPoints: positive.refine(v => new Prisma.Decimal(v).lte(100)).optional(),
  rebalanceBandPoints: percent.optional(),
  rebalance: z.object({
    evidence: z.string().trim().min(5).max(2000),
    saleTaxPercent: percent.optional(),
    transactionFeePercent: percent.optional(),
  }).strict().optional(),
  continuousOptimizer: z.object({
    riskAversionGamma: z.number().finite().min(0).max(1000),
    uncertaintyKappa: z.number().finite().min(0).max(1000),
    turnoverPenaltyEta: z.number().finite().min(0).max(1000),
    estimation: z.object({
      evidence: z.string().min(5).max(2000),
      historicalWeight: z.number().finite().min(0).max(1),
      monthlyBaselines: z.array(z.object({ assetClass: code, returnRate: z.number().finite().gt(-1).max(1) }).strict()).min(1).max(20),
      target: z.enum(["SCALED_IDENTITY", "CONSTANT_CORRELATION"]).optional(),
    }).strict().optional(),
    bounds: z.array(z.object({ assetClass: code, min: z.number().min(0).max(1), max: z.number().min(0).max(1) }).strict().refine(v => v.min <= v.max)).min(1).max(20),
  }).strict().optional(),
  stresses: z.object({
    HIGH_INFLATION: z.object({ ...timing, annualDeltaPoints: positive, healthDeltaPoints: positive.optional() }).strict().optional(),
    // Spec 9.1 asks for a -35% to -50% range: shockPercent is the base level, severeShockPercent an optional deeper level.
    EQUITY_CRASH: z.object({ offsetMonths: timing.offsetMonths.optional(),
      offsetsMonths: z.array(timing.offsetMonths).min(1).max(20).refine(v => new Set(v).size === v.length).optional(),
      assetClass: code, shockPercent: shock, severeShockPercent: shock.optional() }).strict()
      .refine(v => v.offsetMonths !== undefined || v.offsetsMonths !== undefined, { path: ["offsetMonths"], message: "Cần ít nhất một thời điểm sốc đã được duyệt." })
      .refine(v => v.severeShockPercent === undefined || new Prisma.Decimal(v.severeShockPercent).lt(v.shockPercent), { path: ["severeShockPercent"], message: "Mức sốc nặng phải sâu hơn mức cơ sở." }).optional(),
    RATE_RISE: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, durationYears: positive, yieldRisePoints: positive }).strict().optional(),
    CREDIT: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, defaultPercent: percent, recoveryPercent: percent }).strict().optional(),
    GOLD: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, shockPercent: shock,
      spreadPoints: z.union([goldSpread, z.array(goldSpread).min(1).max(10)
        .refine(v => new Set(v.map(x => new Prisma.Decimal(x).toFixed())).size === v.length)]) }).strict().optional(),
    PROPERTY_ILLIQUIDITY: z.object({ ...timing, delayMonths: z.number().int().min(1).max(120), haircutPercent: percent }).strict().optional(),
    INCOME_LOSS: z.object({ ...timing, lostPercent: percent }).strict().optional(),
    LONGEVITY: z.object({ extraYears: z.array(z.union([z.literal(5), z.literal(10)])).min(1).max(2),
      terminalContinuation: z.literal("LIVING_CPI_LIFELONG_PENSION_ONLY").optional(),
      lateLifeCareMonthly: positive.optional() }).strict().optional(),
    SEQUENCE_OF_RETURNS: z.object({ assetClass: code,
      annualLossPercent: shock.refine(v => new Prisma.Decimal(v).lt(0)), annualGainPercent: positive.refine(v => new Prisma.Decimal(v).lte(100)) }).strict().optional(),
  }).strict().optional(),
}).strict();
export type RiskPolicy = z.infer<typeof riskPolicySchema>;
