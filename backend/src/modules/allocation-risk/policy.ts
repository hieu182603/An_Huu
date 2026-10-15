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
  stresses: z.object({
    HIGH_INFLATION: z.object({ ...timing, annualDeltaPoints: positive }).strict().optional(),
    EQUITY_CRASH: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, shockPercent: shock }).strict().optional(),
    RATE_RISE: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, durationYears: positive, yieldRisePoints: positive }).strict().optional(),
    CREDIT: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, defaultPercent: percent, recoveryPercent: percent }).strict().optional(),
    GOLD: z.object({ offsetMonths: timing.offsetMonths, assetClass: code, shockPercent: shock, spreadPoints: percent }).strict().optional(),
    PROPERTY_ILLIQUIDITY: z.object({ ...timing, delayMonths: z.number().int().min(1).max(120), haircutPercent: percent }).strict().optional(),
    INCOME_LOSS: z.object({ ...timing, lostPercent: percent }).strict().optional(),
    LONGEVITY: z.object({ extraYears: z.array(z.union([z.literal(5), z.literal(10)])).min(1).max(2) }).strict().optional(),
  }).strict().optional(),
}).strict();
export type RiskPolicy = z.infer<typeof riskPolicySchema>;
