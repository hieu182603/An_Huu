import { z } from "zod";
import { Prisma } from "@prisma/client";
import { moneySchema } from "../../common/http";
import { addMonths, dateSchema, monthSchema } from "../../common/calendar";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const percentSchema = z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,10})?$/)
  .refine(value => new Prisma.Decimal(value).lte(100), "Tỷ lệ phải trong khoảng 0–100%.");
export const contractRateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EFFECTIVE_ANNUAL"), percent: percentSchema }).strict(),
  z.object({ kind: z.literal("NOMINAL_ANNUAL_MONTHLY"), percent: percentSchema }).strict(),
  z.object({ kind: z.literal("EFFECTIVE_MONTHLY"), percent: percentSchema }).strict(),
  z.object({ kind: z.literal("SIMPLE_ANNUAL_DAILY"), percent: percentSchema, days: z.number().int().min(1).max(366), yearDays: z.union([z.literal(360), z.literal(365), z.literal(366)]) }).strict(),
]);
export const prepaymentSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNKNOWN") }).strict(),
  z.object({ status: z.literal("PROHIBITED"), reason: z.string().trim().min(1).max(300) }).strict(),
  z.object({ status: z.literal("ALLOWED"), mode: z.enum(["PARTIAL_OR_FULL", "FULL_ONLY"]),
    minimumPrincipal: moneySchema, maximumPrincipal: moneySchema.nullable(), fixedFee: moneySchema, feePercent: percentSchema,
    effect: z.literal("REDUCE_TERM_KEEP_SCHEDULE"), funding: z.enum(["SOLE_BORROWER", "PRO_RATA_CONFIRMED"]),
    evidence: z.string().trim().min(1).max(300),
  }).strict(),
]).superRefine((value, ctx) => {
  if (value.status === "ALLOWED" && value.maximumPrincipal !== null && new Prisma.Decimal(value.maximumPrincipal).lt(value.minimumPrincipal))
    ctx.addIssue({ code: "custom", path: ["maximumPrincipal"], message: "Giới hạn trả trước không được nhỏ hơn mức tối thiểu." });
});
export const contractPeriodSchema = z.object({
  dueDate: dateSchema, rate: contractRateSchema,
  repayment: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PRINCIPAL_PLUS_INTEREST"), amount: moneySchema }).strict(),
    z.object({ kind: z.literal("TOTAL_PAYMENT"), amount: moneySchema }).strict(),
    z.object({ kind: z.literal("INTEREST_ONLY") }).strict(),
  ]),
  minimumPayment: moneySchema, fee: moneySchema, prepayment: prepaymentSchema,
}).strict();
export const loanContractSchema = z.object({
  contractVersion: z.literal(1), source: z.string().trim().min(1).max(300), confirmedOn: dateSchema,
  balanceAsOf: dateSchema, interestBasis: z.literal("REDUCING_BALANCE"),
  periodConvention: z.literal("DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS"),
  maturityDate: dateSchema, settleRemainingAtMaturity: z.boolean(),
  parties: z.array(z.object({ reference: id, role: z.enum(["BORROWER", "CO_OBLIGOR"]) }).strict()).min(1).max(20),
  periods: z.array(contractPeriodSchema).min(1).max(600),
}).strict().superRefine((value, ctx) => {
  if (!value.periods.length) return; // min(1) already reports this invalid input.
  const last = value.periods[value.periods.length - 1];
  if (last.dueDate !== value.maturityDate) ctx.addIssue({ code: "custom", path: ["maturityDate"], message: "Lịch phải kết thúc đúng ngày đáo hạn." });
  if (value.periods[0].dueDate < value.balanceAsOf) ctx.addIssue({ code: "custom", path: ["periods", 0, "dueDate"], message: "Kỳ trả đầu không được trước ngày chốt dư nợ." });
  value.periods.forEach((period, index) => {
    if (index && period.dueDate.slice(0, 7) !== addMonths(value.periods[index - 1].dueDate.slice(0, 7), 1))
      ctx.addIssue({ code: "custom", path: ["periods", index, "dueDate"], message: "Lịch tháng phải đủ kỳ liên tiếp, không trùng tháng." });
  });
  if (new Set(value.parties.map(party => party.reference)).size !== value.parties.length)
    ctx.addIssue({ code: "custom", path: ["parties"], message: "Bên tham gia không được trùng reference." });
});
export const contractDeclarationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNKNOWN") }).strict(),
  z.object({ status: z.literal("KNOWN"), value: loanContractSchema }).strict(),
]);
export const debtPreviewSchema = z.object({
  expectedProfileRevision: z.number().int().min(1), horizonMonths: z.number().int().min(1).max(600),
  reserveMonthly: moneySchema.nullable(), extraMonthlyBudget: moneySchema.nullable(),
  payoffLoanId: id.optional(),
  stress: z.array(z.object({ loanId: id, startMonth: monthSchema, endMonth: monthSchema, totalPaymentShare: z.string().regex(/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/) }).strict()
    .refine(value => value.startMonth <= value.endMonth, "Tháng kết thúc phải từ tháng bắt đầu.")).max(20).default([]),
}).strict().superRefine((value, ctx) => {
  value.stress.forEach((entry, index) => {
    if (value.stress.slice(0, index).some(other => other.loanId === entry.loanId && other.startMonth <= entry.endMonth && entry.startMonth <= other.endMonth))
      ctx.addIssue({ code: "custom", path: ["stress", index], message: "Không được chồng khoảng căng thẳng của cùng khoản vay." });
  });
});
export type LoanContract = z.infer<typeof loanContractSchema>;
export type ContractPeriod = z.infer<typeof contractPeriodSchema>;
export type ContractRate = z.infer<typeof contractRateSchema>;
export type DebtPreviewInput = z.infer<typeof debtPreviewSchema>;
