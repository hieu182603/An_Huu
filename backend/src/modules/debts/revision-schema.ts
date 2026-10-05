import { z } from "zod";
import { addMonths, dateSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
import { contractRateSchema } from "./schema";
import { DebtDecimal as D } from "./loan";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const loanEvidenceSchema = z.object({ reference: z.string().trim().min(1).max(1000), contentHash: hash, confirmedOn: dateSchema }).strict();
const evidence = z.array(loanEvidenceSchema).min(1).max(20);
export const loanComponentsSchema = z.object({ principal: moneySchema, interest: moneySchema, prepaymentFee: moneySchema, otherFee: moneySchema }).strict();
export const loanAllocationSchema = z.object({ allocationId: z.string().uuid(), eventId: z.string().uuid(), actualRevision: z.number().int().positive(),
  bookedOn: dateSchema, scope: z.enum(["FULL_CONTRACT", "USER_SHARE"]), components: loanComponentsSchema,
  contractComponents: loanComponentsSchema, paymentStatus: z.enum(["CURRENT", "OVERDUE", "MIXED"]),
  allocationBasis: z.enum(["BANK_STATEMENT", "AGREEMENT_COMPONENTS"]), evidence }).strict();
const period = z.object({ accrualFrom: dateSchema, dueDate: dateSchema, rate: contractRateSchema,
  fee: moneySchema, carriedInterest: moneySchema, gracePrincipal: z.boolean(),
  bankPayment: z.object({ principal: moneySchema, interest: moneySchema }).strict().nullable(),
}).strict();
export const loanContractV2Schema = z.object({ contractVersion: z.literal(2), currency: z.literal("VND"),
  signedOn: dateSchema, amendedOn: dateSchema.nullable(), effectiveOn: dateSchema, knownOn: dateSchema,
  confirmation: z.enum(["HYPOTHETICAL", "BANK_CONFIRMED"]), evidence,
  balanceAsOf: dateSchema, principalBalance: moneySchema, balanceScope: z.enum(["FULL_CONTRACT", "USER_SHARE"]),
  paymentShare: z.string().regex(/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/),
  responsibility: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("ALLOCATED_SHARE") }).strict(),
    z.object({ kind: z.literal("CAPPED"), capBasis: z.literal("TOTAL_USER_PAYMENTS"), limit: moneySchema, previouslyPaid: moneySchema, evidence }).strict(),
  ]),
  interestBasis: z.literal("REDUCING_BALANCE"), rounding: z.enum(["EXACT", "CENT_HALF_UP"]),
  mode: z.enum(["REDUCE_PAYMENT_KEEP_TERM", "REDUCE_TERM_KEEP_PAYMENT", "BANK_SCHEDULE", "RESTRUCTURED"]),
  fixedPayment: moneySchema.nullable(), finalPayment: z.enum(["ADJUST_FINAL_PAYMENT", "BALLOON_CONFIRMED", "NO_BALLOON"]),
  maturityDate: dateSchema, periods: z.array(period).min(1).max(600),
}).strict().superRefine((v, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: "custom", message });
  if (v.signedOn > v.effectiveOn || v.effectiveOn > v.balanceAsOf || v.balanceAsOf > v.knownOn ||
    (v.amendedOn && (v.amendedOn < v.signedOn || v.amendedOn > v.effectiveOn))) error("Ngày hợp đồng/số dư/ghi nhận không nhất quán.");
  if (v.balanceScope === "USER_SHARE" && !new D(v.paymentShare).eq(1)) error("Số dư phần người dùng không nhân tỷ lệ lần nữa.");
  if (v.responsibility.kind === "CAPPED" && new D(v.responsibility.previouslyPaid).gt(v.responsibility.limit)) error("Số đã thực hiện vượt trần nghĩa vụ.");
  if (v.evidence.some(e => e.confirmedOn > v.knownOn) || (v.responsibility.kind === "CAPPED" && v.responsibility.evidence.some(e => e.confirmedOn > v.knownOn))) error("Chứng từ được xác nhận sau ngày ghi nhận.");
  if (v.periods.at(-1)?.dueDate !== v.maturityDate) error("Lịch phải kết thúc tại ngày đáo hạn.");
  const bank = v.mode === "BANK_SCHEDULE" || v.mode === "RESTRUCTURED";
  if (v.mode === "REDUCE_TERM_KEEP_PAYMENT" ? !v.fixedPayment || new D(v.fixedPayment).lte(0) : v.fixedPayment !== null) error("Khoản trả cố định không phù hợp chế độ lịch.");
  v.periods.forEach((p, i) => {
    if (p.accrualFrom !== (i ? v.periods[i - 1].dueDate : v.balanceAsOf) || p.dueDate <= p.accrualFrom) error("Khoảng tính lãi phải liên tiếp, không chồng/lỗ hổng.");
    if (bank !== (p.bankPayment !== null)) error("Lịch ngân hàng cần tách gốc và lãi từng kỳ.");
    if (p.gracePrincipal && p.bankPayment && new D(p.bankPayment.principal).gt(0)) error("Kỳ ân hạn gốc không được khai trả gốc.");
    if (p.rate.kind === "SIMPLE_ANNUAL_DAILY") {
      const days = (Date.parse(p.dueDate + "T00:00:00Z") - Date.parse(p.accrualFrom + "T00:00:00Z")) / 86400000;
      if (days !== p.rate.days) error("Số ngày lãi đơn khác khoảng tính lãi (loại ngày đầu, gồm ngày cuối).");
    } else {
      const nextMonth = addMonths(p.accrualFrom.slice(0, 7), 1);
      const lastDay = new Date(Date.parse(addMonths(nextMonth, 1) + "-01T00:00:00Z") - 86400000).getUTCDate();
      const day = Math.min(Number(p.accrualFrom.slice(8)), lastDay);
      if (p.dueDate !== `${nextMonth}-${String(day).padStart(2, "0")}`) error("Kỳ không đủ một tháng cần lãi theo số ngày cụ thể.");
    }
  });
  if (v.mode === "REDUCE_PAYMENT_KEEP_TERM" && (v.finalPayment !== "ADJUST_FINAL_PAYMENT" || v.periods.every(p => p.gracePrincipal))) error("Giữ kỳ hạn cần ít nhất một kỳ trả gốc và điều chỉnh kỳ cuối.");
  if (v.mode === "REDUCE_TERM_KEEP_PAYMENT" && v.finalPayment === "ADJUST_FINAL_PAYMENT") error("Giữ khoản trả cần chọn rõ có/không balloon tại đáo hạn.");
});
export type LoanContractV2 = z.infer<typeof loanContractV2Schema>;
export type LoanAllocation = z.infer<typeof loanAllocationSchema>;
export type LoanComponents = z.infer<typeof loanComponentsSchema>;
