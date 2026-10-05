import { z } from "zod";
import { Prisma } from "@prisma/client";
import { dateSchema, monthSchema } from "../../common/calendar";

export const ASSUMPTION_SERIES_CODE = "assumption-series-v2";
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const year = z.number().int().min(1900).max(2199);
export const ratePercentSchema = z.string().regex(/^-?(0|[1-9]\d{0,2})(\.\d{1,10})?$/)
  .refine(v => new Prisma.Decimal(v).gt(-100) && new Prisma.Decimal(v).lte(100), "Tỷ lệ phải lớn hơn -100% và không quá 100%.");
const note = z.string().trim().min(3).max(2000);
export const assumptionSourceSchema = z.object({
  id: code, kind: z.enum(["HISTORICAL_OFFICIAL", "FORECAST", "AN_HUU_LONG_TERM", "ASSET_RESEARCH"]),
  title: z.string().trim().min(3).max(200), publisher: z.string().trim().min(2).max(150),
  url: z.string().url().max(2000).refine(v => v.startsWith("https://")), release: z.string().trim().min(1).max(150),
  publishedOn: dateSchema, retrievedOn: dateSchema, fromYear: year, toYear: year, note,
}).strict().refine(v => v.fromYear <= v.toYear && v.publishedOn <= v.retrievedOn, "Kỳ nguồn/ngày lấy không hợp lệ.");
export const inflationYearSchema = z.object({ year, percent: ratePercentSchema, sourceId: code,
  kind: z.enum(["FORECAST", "LONG_TERM"]), rateType: z.literal("EFFECTIVE_ANNUAL"), priceBasis: z.literal("NOMINAL"),
  conversionNote: note,
}).strict();
export const costSchema = z.discriminatedUnion("treatment", [
  z.object({ treatment: z.literal("INCLUDED"), evidence: note }).strict(),
  z.object({ treatment: z.literal("EXPLICIT_ANNUAL_DRAG"), percent: ratePercentSchema.refine(v => new Prisma.Decimal(v).gte(0)),
    convention: z.literal("PERCENTAGE_POINTS_AFTER_NOMINAL_CONVERSION"), evidence: note }).strict(),
  z.object({ treatment: z.literal("UNKNOWN") }).strict(),
]);
export const annualRateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EFFECTIVE_ANNUAL"), percent: ratePercentSchema }).strict(),
  z.object({ type: z.literal("NOMINAL_ANNUAL"), percent: ratePercentSchema, compoundsPerYear: z.number().int().min(1).max(366) }).strict(),
]);
export const returnYearSchema = z.object({ year, assetClass: code, horizonId: code, sourceId: code,
  rate: annualRateSchema, priceBasis: z.enum(["NOMINAL", "REAL"]), fees: costSchema, taxes: costSchema,
}).strict();
export const assumptionDocumentSchema = z.object({
  schemaVersion: z.literal(2), title: z.string().trim().min(3).max(200), currency: z.literal("VND"),
  effectiveFrom: dateSchema, projectionStartYear: year, projectionEndYear: year,
  sources: z.array(assumptionSourceSchema).max(100),
  historicalCpi: z.array(z.object({ year, percent: ratePercentSchema, sourceId: code,
    measure: z.enum(["ANNUAL_AVERAGE_CHANGE", "END_YEAR_CHANGE"]),
  }).strict()).max(300),
  inflation: z.array(inflationYearSchema).max(300),
  assetClasses: z.array(z.object({ code, label: z.string().trim().min(1).max(120),
    horizons: z.array(z.object({ id: code, minMonths: z.number().int().min(1).max(1200), maxMonths: z.number().int().min(1).max(1200) }).strict()
      .refine(v => v.minMonths <= v.maxMonths, "Thời hạn không hợp lệ.")).min(1).max(10),
  }).strict()).max(20),
  returns: z.array(returnYearSchema).max(12000), reason: note,
}).strict().refine(v => v.projectionStartYear <= v.projectionEndYear, "Năm kết thúc phải từ năm bắt đầu.");
export const revisionSchema = z.object({ expectedRevision: z.number().int().min(1) }).strict();
export const writeAssumptionsSchema = revisionSchema.extend({ data: assumptionDocumentSchema }).strict();
export const approveAssumptionsSchema = revisionSchema.extend({ impactToken: z.string().regex(/^[a-f0-9]{64}$/), reviewNote: note }).strict();
export const publishAssumptionsSchema = revisionSchema.extend({ confirm: z.literal(true) }).strict();
export const seriesRequestSchema = z.object({ versionId: z.string().uuid(), startMonth: monthSchema, endMonth: monthSchema,
  assetClass: code, horizonMonths: z.number().int().min(1).max(1200),
}).strict().refine(v => v.startMonth <= v.endMonth, "Khoảng tháng không hợp lệ.");
export const assumptionsListSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export type AssumptionDocument = z.infer<typeof assumptionDocumentSchema>;
export type ReturnYear = z.infer<typeof returnYearSchema>;
export type SeriesRequest = z.infer<typeof seriesRequestSchema>;
