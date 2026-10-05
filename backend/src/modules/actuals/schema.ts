import { z } from "zod";
import { monthSchema, dateSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
export const actualKind = z.enum(["INCOME", "EXPENSE", "DEBT_PAYMENT", "CONTRIBUTION", "WITHDRAWAL", "INVESTMENT_INCOME", "FEE", "MARKET_CHANGE", "INTERNAL_TRANSFER", "BALANCE_ADJUSTMENT"]);
const signedMoney = z.string().regex(/^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/);
export const actualEntrySchema = z.object({ eventId: z.string().uuid(), date: dateSchema, kind: actualKind,
  amount: signedMoney, note: z.string().trim().max(1000).optional() }).strict().superRefine((v, ctx) => {
  if (v.amount.startsWith("-") && !["MARKET_CHANGE", "BALANCE_ADJUSTMENT"].includes(v.kind))
    ctx.addIssue({ code: "custom", path: ["amount"], message: "Chỉ biến động giá và điều chỉnh được âm." });
  if (v.kind === "BALANCE_ADJUSTMENT" && !v.note)
    ctx.addIssue({ code: "custom", path: ["note"], message: "Điều chỉnh cần giải thích." });
});
export const actualPayloadSchema = z.object({ currency: z.literal("VND"), openingBalance: moneySchema, closingBalance: moneySchema,
  entries: z.array(actualEntrySchema).max(500), correctionReason: z.string().trim().min(1).max(1000) }).strict()
  .superRefine((v, ctx) => { if (new Set(v.entries.map(e => e.eventId)).size !== v.entries.length)
    ctx.addIssue({ code: "custom", path: ["entries"], message: "Mã giao dịch bị trùng." }); });
export const actualWriteSchema = z.object({ expectedRevision: z.number().int().min(0), data: actualPayloadSchema }).strict();
export const actualRangeSchema = z.object({ from: monthSchema, to: monthSchema }).strict().refine(v => v.from <= v.to, "Khoảng tháng không hợp lệ.");
export const actualForecastSchema = z.object({ planId: z.string().uuid(), versionId: z.string().uuid(), throughMonth: monthSchema }).strict();
// Explicit future totals, not inferred recurring transactions. Each item replaces
// one named aggregate field for its declared interval, never adds a duplicate row.
export const futureChangeSchema = z.object({
  id: z.string().uuid(), field: z.enum(["income", "livingExpense", "additionalExpense", "plannedContribution"]),
  operation: z.literal("REPLACE_MONTHLY_TOTAL"), amount: moneySchema,
  startMonth: monthSchema, endMonth: monthSchema, reason: z.string().trim().min(1).max(500),
}).strict().refine(v => v.startMonth <= v.endMonth, "Khoảng hiệu lực không hợp lệ.");
const sourceReview = { id: z.string().uuid(), confirmed: z.literal(true), document: z.string().trim().min(1).max(500) };
const actualReference = z.object({ period: monthSchema, eventId: z.string().uuid() }).strict();
export const sourceChangeSchema = z.discriminatedUnion("kind", [
  z.object({ ...sourceReview, kind: z.literal("DEBT_SETTLED"), sourceId: z.string().min(1).max(100), actual: actualReference,
    remainingObligation: z.literal("0") }).strict(),
  z.object({ ...sourceReview, kind: z.literal("ASSET_REALIZED"), sourceId: z.string().min(1).max(100), actual: actualReference }).strict(),
  z.object({ ...sourceReview, kind: z.literal("PENSION_REPLACE"), sourceId: z.literal("pension"),
    startMonth: monthSchema, endMonth: monthSchema, monthlyAmount: moneySchema, priceBasis: z.literal("NOMINAL_MONTHLY") }).strict(),
  z.object({ ...sourceReview, kind: z.literal("FLOW_REPLACE"), sourceType: z.enum(["INCOME", "EXPENSE"]), sourceId: z.string().min(1).max(100),
    startMonth: monthSchema, endMonth: monthSchema, monthlyAmount: moneySchema }).strict(),
]);
export const reforecastPreviewSchema = actualForecastSchema.extend({
  expectedProfileRevision: z.number().int().min(1), futureChanges: z.array(futureChangeSchema).max(200).default([]),
  sourceChanges: z.array(sourceChangeSchema).max(200).optional(),
}).superRefine((v, ctx) => {
  const ids = new Set<string>();
  v.futureChanges.forEach((row, i) => {
    if (ids.has(row.id) || v.futureChanges.slice(0, i).some(other => other.field === row.field && other.startMonth <= row.endMonth && row.startMonth <= other.endMonth))
      ctx.addIssue({ code: "custom", path: ["futureChanges", i], message: "Không trùng ID hoặc chồng khoảng cùng trường." });
    ids.add(row.id);
  });
  (v.sourceChanges ?? []).forEach((row, i) => {
    if (ids.has(row.id)) ctx.addIssue({ code: "custom", path: ["sourceChanges", i], message: "Mã điều chỉnh bị trùng." });
    ids.add(row.id);
    if ((row.kind === "PENSION_REPLACE" || row.kind === "FLOW_REPLACE") && row.startMonth > row.endMonth)
      ctx.addIssue({ code: "custom", path: ["sourceChanges", i], message: "Khoảng hiệu lực không hợp lệ." });
  });
});
export const saveReforecastSchema = z.object({
  expectedRevision: z.number().int().min(1), expectedInputHash: z.string().regex(/^[a-f0-9]{64}$/),
  preview: reforecastPreviewSchema,
}).strict();
export type ActualPayload = z.infer<typeof actualPayloadSchema>;
