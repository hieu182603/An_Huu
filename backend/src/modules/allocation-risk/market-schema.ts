import { z } from "zod";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";
import { revisionSchema, publishAssumptionsSchema } from "../assumptions/schema";

export const MARKET_DATA_CODE = "monthly-total-return-data-v1";
const note = z.string().trim().min(3).max(2000);
const code = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const rate = z.string().max(30).regex(/^-?(0|[1-9]\d*)(\.\d{1,16})?$/)
  .refine(v => new D(v).gt(-1) && new D(v).lte(10), "Lợi suất thập phân phải > -1 và <= 10; không nhận giá trị thiếu.");
const returnBasisSchema = z.enum(["TOTAL_RETURN", "PRICE_ONLY", "INCOME_ONLY"]);
const licenseStatusSchema = z.enum(["VERIFIED", "UNVERIFIED"]);
const priceSideSchema = z.enum(["BUY", "SELL", "MID"]);
const assetBase = {
  assetClass: code, sourceId: code, totalReturnEvidence: note,
  fees: z.discriminatedUnion("treatment", [
    z.object({ treatment: z.literal("NET"), evidence: note }).strict(),
    z.object({ treatment: z.literal("GROSS"), monthlyDrag: rate.refine(v => new D(v).gte(0) && new D(v).lt(1)), evidence: note }).strict(),
  ]),
  taxTreatment: note,
  // Drafts may record an unknown side; publication requires BUY-side gold or an explicit reviewed override.
  priceSide: priceSideSchema.optional(),
};
const buildMarketSchema = <T extends z.ZodTypeAny>(assetSchema: T) => z.object({
  schemaVersion: z.literal(1), title: note, reason: note, effectiveFrom: dateSchema,
  currency: z.literal("VND"), unit: z.literal("DECIMAL_MONTHLY_TOTAL_RETURN"),
  priceBasis: z.literal("NOMINAL"), cpiMeasure: z.literal("MONTH_ON_MONTH_CHANGE"),
  period: z.object({ from: monthSchema, to: monthSchema }).strict(),
  sources: z.array(z.object({ id: code, title: note, url: z.string().url().max(2000), retrievedOn: dateSchema,
    license: note, usage: z.literal("SIMULATION_AND_DERIVED_OUTPUTS_PERMITTED"), evidence: note }).strict()).min(1).max(30),
  assets: z.array(assetSchema).min(1).max(20),
  cpiSourceId: code,
  quality: z.object({ missingValues: z.literal("REJECT"), imputation: z.literal("NONE"), reviewNote: note }).strict(),
  rows: z.array(z.object({ month: monthSchema, returns: z.record(code, rate), cpi: rate }).strict()).min(12).max(2400),
}).strict().superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const typedAssets = v.assets as Array<{ assetClass: string; sourceId: string; fees: { treatment: string; monthlyDrag?: string } }>;
  const assets = typedAssets.map(a => a.assetClass), sources = v.sources.map(s => s.id);
  if (new Set(assets).size !== assets.length || new Set(sources).size !== sources.length) issue("Trùng cột hoặc nguồn.");
  if (!sources.includes(v.cpiSourceId) || typedAssets.some(a => !sources.includes(a.sourceId))) issue("Thiếu nguồn cho cột.");
  if (v.rows[0]?.month !== v.period.from || v.rows.at(-1)?.month !== v.period.to) issue("Kỳ dữ liệu không khớp.");
  v.rows.forEach((r, i) => {
    if (r.month !== addMonths(v.period.from, i)) issue("Tháng phải liên tục, đúng thứ tự, không trùng.");
    if (Object.keys(r.returns).length !== assets.length || assets.some(a => r.returns[a] === undefined)) issue("Thiếu/thừa cột; không điền 0.");
    if (typedAssets.some(a => a.fees.treatment === "GROSS" && new D(r.returns[a.assetClass] ?? "0").minus(a.fees.monthlyDrag!).lte(-1)))
      issue("Lợi suất sau phí phải lớn hơn -100%.");
  });
});
/** Write/validation schema: returnBasis and licenseStatus are mandatory on every asset (B4-1). */
export const marketDocumentSchema = buildMarketSchema(
  z.object({ ...assetBase, returnBasis: returnBasisSchema, licenseStatus: licenseStatusSchema }).strict(),
);
/** Read schema for stored DB rows: accepts legacy documents missing returnBasis/licenseStatus without mutating their hash. */
export const storedMarketDocumentSchema = buildMarketSchema(
  z.object({ ...assetBase, returnBasis: returnBasisSchema.optional(), licenseStatus: licenseStatusSchema.optional() }).strict(),
);
export const writeMarketSchema = revisionSchema.extend({ data: marketDocumentSchema }).strict();
export const approveMarketSchema = revisionSchema.extend({ confirm: z.literal(true), reviewNote: note }).strict();
export const publishMarketSchema = publishAssumptionsSchema.extend({
  override: z.object({ reason: note }).strict().optional(),
}).strict();
export type MarketDocument = z.infer<typeof storedMarketDocumentSchema>;
export type StrictMarketDocument = z.infer<typeof marketDocumentSchema>;
