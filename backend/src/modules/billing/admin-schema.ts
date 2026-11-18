import { z } from "zod";
import { PERIOD_PATTERN } from "./periods";

/** Request schemas for the admin billing API (all bodies strict, every write carries a reason of at least 10 characters). */
export const reasonSchema = z.string().trim().min(10, "Lý do cần ít nhất 10 ký tự.").max(500, "Lý do tối đa 500 ký tự.");
export const periodSchema = z.string().regex(PERIOD_PATTERN, "Kỳ phí phải có dạng YYYY-MM.");
const vnd = z.number().int().min(1, "Số tiền phải lớn hơn 0.").max(2_000_000_000, "Số tiền vượt giới hạn cho phép.");
const bankReference = z.string().trim().min(3, "Mã tham chiếu ngân hàng cần ít nhất 3 ký tự.").max(100);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD.");
const flag = z.enum(["true", "false"]).transform(value => value === "true");

export const uuidParam = z.object({ id: z.string().uuid() }).strict();
export const userParam = z.object({ userId: z.string().uuid() }).strict();
export const emptyBody = z.object({}).strict();
export const reasonBody = z.object({ reason: reasonSchema }).strict();

const page = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const overviewQuery = z.object({ period: periodSchema.optional() }).strict();
export const exportQuery = overviewQuery;
export const statementsQuery = page.extend({
  period: periodSchema.optional(),
  status: z.enum(["ISSUED", "PAID", "OVERDUE", "WAIVED", "VOID"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  overdueOnly: flag.optional(),
  hasAlert: flag.optional(),
}).strict();
export const ordersQuery = page.extend({
  status: z.enum(["PENDING", "PAID", "UNDERPAID", "EXPIRED", "CANCELLED"]).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
}).strict();
export const alertsQuery = page.extend({ includeResolved: flag.optional() }).strict();
export const overridesQuery = page.extend({ userId: z.string().uuid().optional() }).strict();

export const manualPaymentInput = z.object({
  amountVnd: vnd, bankReference, receivedAt: z.string().datetime({ offset: true }), reason: reasonSchema,
}).strict();
// waiveRemaining: the refund cancels the fee for this period (e.g. the 7-day refund policy). Without it a refunded
// statement reopens and the user would be asked to pay again — and be gated once it is overdue.
export const refundInput = z.object({ amountVnd: vnd, bankReference, reason: reasonSchema, waiveRemaining: z.boolean().optional() }).strict();
export const adjustInput = z.object({ amountVnd: vnd, reason: reasonSchema }).strict();
export const reconcileInput = reasonBody;
export const resolveAlertInput = z.object({
  key: z.string().regex(/^(UNDERPAID|OVERPAID|EXTRA_TRANSFER):[0-9a-f-]{36}(:\d{1,12})?$/, "Mã cảnh báo không hợp lệ."),
  note: reasonSchema,
}).strict();

const rate = z.union([z.string(), z.number()]).transform(String)
  .pipe(z.string().regex(/^(100(\.0{1,4})?|\d{1,2}(\.\d{1,4})?)$/, "Tỷ lệ phí phải từ 0 đến 100 (tối đa 4 chữ số thập phân)."));
const reminderDays = z.array(z.number().int().min(1).max(28)).max(10)
  .refine(days => days.every((day, index) => index === 0 || day > days[index - 1]), "Ngày nhắc phải từ 1 đến 28, tăng dần và không trùng nhau.");
const termsShape = {
  annualRatePercent: rate,
  minMonthlyVnd: z.number().int().min(0).max(1_000_000_000),
  maxMonthlyVnd: z.number().int().min(0).max(2_000_000_000).nullable(),
  roundingStepVnd: z.number().int().min(1).max(1_000_000),
  dueDay: z.number().int().min(1, "Ngày hạn thanh toán từ 1 đến 28.").max(28, "Ngày hạn thanh toán từ 1 đến 28."),
  reminderDays,
  trialMonths: z.number().int().min(0).max(12),
};
const maxAtLeastMin = (terms: { minMonthlyVnd?: number; maxMonthlyVnd?: number | null }) =>
  terms.maxMonthlyVnd === undefined || terms.maxMonthlyVnd === null || terms.minMonthlyVnd === undefined || terms.maxMonthlyVnd >= terms.minMonthlyVnd;
const maxMessage = "Phí tối đa phải lớn hơn hoặc bằng phí tối thiểu.";
const note = z.string().trim().max(500).nullable();

/** Full set of schedule terms (also used to validate a patched draft after merging). */
export const scheduleTerms = z.object(termsShape).strict().refine(maxAtLeastMin, { message: maxMessage, path: ["maxMonthlyVnd"] });
export const createScheduleInput = z.object({ ...termsShape, note: note.optional(), reason: reasonSchema }).strict()
  .refine(maxAtLeastMin, { message: maxMessage, path: ["maxMonthlyVnd"] });
export const patchScheduleInput = z.object({
  expectedUpdatedAt: z.string().datetime(),
  reason: reasonSchema,
  note: note.optional(),
  ...Object.fromEntries(Object.entries(termsShape).map(([key, field]) => [key, field.optional()])) as { [K in keyof typeof termsShape]: z.ZodOptional<(typeof termsShape)[K]> },
}).strict().refine(maxAtLeastMin, { message: maxMessage, path: ["maxMonthlyVnd"] });
export const publishScheduleInput = z.object({ effectiveFromPeriod: periodSchema, reason: reasonSchema }).strict();

const overrideValue = z.union([z.string(), z.number()]).transform(String);
export const createOverrideInput = z.object({
  kind: z.enum(["DISCOUNT_PERCENT", "FIXED_AMOUNT", "WAIVE"]),
  value: overrideValue.nullable().optional(),
  fromPeriod: periodSchema,
  toPeriod: periodSchema.nullable().optional(),
  reason: reasonSchema,
}).strict();

export type ManualPaymentInput = z.infer<typeof manualPaymentInput>;
export type RefundInput = z.infer<typeof refundInput>;
export type AdjustInput = z.infer<typeof adjustInput>;
export type CreateScheduleInput = z.infer<typeof createScheduleInput>;
export type PatchScheduleInput = z.infer<typeof patchScheduleInput>;
export type PublishScheduleInput = z.infer<typeof publishScheduleInput>;
export type CreateOverrideInput = z.infer<typeof createOverrideInput>;
export type StatementsQuery = z.infer<typeof statementsQuery>;
export type OrdersQuery = z.infer<typeof ordersQuery>;
export type AlertsQuery = z.infer<typeof alertsQuery>;
export type OverridesQuery = z.infer<typeof overridesQuery>;
