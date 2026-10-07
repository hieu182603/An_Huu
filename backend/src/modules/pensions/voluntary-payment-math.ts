import { z } from "zod";
import { AppError } from "../../common/errors";
import { dateSchema, monthSchema } from "../../common/calendar";
import { RetirementDecimal as D } from "../retirement/engine";

// ND159 Art6–8, signed PDF pages4–6. These are internal arithmetic helpers.
// The service must resolve the published FUND_MONTHLY_RATE for the PAYMENT year,
// validate income bounds/participation/payment evidence and pin it in the capture.
// Never use a personal portfolio return or infer pension rights from this quote.
const amount = z.string().max(100).regex(/^(0|[1-9]\d*)(\.\d+)?$/).refine(v => new D(v).lte("1e60"));
const positive = amount.refine(v => new D(v).gt(0));
const rate = amount.refine(v => new D(v).lte(100));
const base = { monthlyIncome: positive, fundMonthlyRatePercent: rate };
export const voluntaryPrepaymentSchema = z.object({ ...base, years: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) }).strict();
export const voluntaryTopUpSchema = z.object({ ...base, monthsAlreadyCounted: z.number().int().min(120).max(179),
  missingMonths: z.number().int().min(1).max(60), normalRetirementMonth: monthSchema, paidOn: dateSchema,
}).strict().refine(v => v.monthsAlreadyCounted + v.missingMonths === 180, "Chỉ đóng bù số tháng còn thiếu để đủ15năm.")
  .refine(v => v.paidOn.slice(0, 7) >= v.normalRetirementMonth, "Đóng bù sau khi đủ tuổi nghỉ hưu bình thường.")
  .refine(v => v.paidOn >= "2025-07-01", "Khoản đóng trước ngày01/07/2025 cần áp dụng quy định lịch sử.");

/** First prepaid month exponent0; first missing month exponent1. The statutory
 * formulas do not discount/compound either stream using a single end balance. */
function installments(monthlyIncome: string, ratePercent: string, count: number, prepaid: boolean) {
  const baseContribution = new D(monthlyIncome).mul("0.22"), multiplier = new D(1).plus(new D(ratePercent).div(100));
  return Array.from({ length: count }, (_, i) => ({ ordinal: i + 1, contribution: (prepaid
    ? baseContribution.div(multiplier.pow(i)) : baseContribution.mul(multiplier.pow(i + 1))).toFixed() }));
}
function total(rows: Array<{ contribution: string }>) { return rows.reduce((sum, r) => sum.plus(r.contribution), new D(0)); }
export function quoteVoluntaryPrepayment(value: z.infer<typeof voluntaryPrepaymentSchema>) {
  const input = voluntaryPrepaymentSchema.parse(value), months = input.years * 12;
  const rows = installments(input.monthlyIncome, input.fundMonthlyRatePercent, months, true), gross = total(rows);
  const undiscounted = new D(input.monthlyIncome).mul("0.22").mul(months);
  return { months, grossContribution: gross.toFixed(), undiscountedContribution: undiscounted.toFixed(), discount: undiscounted.minus(gross).toFixed(), installments: rows };
}
export function quoteVoluntaryTopUp(value: z.infer<typeof voluntaryTopUpSchema>) {
  const input = voluntaryTopUpSchema.parse(value);
  const rows = installments(input.monthlyIncome, input.fundMonthlyRatePercent, input.missingMonths, false), gross = total(rows);
  const withoutInterest = new D(input.monthlyIncome).mul("0.22").mul(input.missingMonths);
  return { months: input.missingMonths, countedMonthsAfterPayment: 180, grossContribution: gross.toFixed(), contributionBeforeInterest: withoutInterest.toFixed(),
    compoundInterest: gross.minus(withoutInterest).toFixed(), installments: rows };
}
export const voluntaryRefundSchema = voluntaryPrepaymentSchema.extend({ remainingMonths: z.number().int().min(1).max(60), stateSupportToExclude: amount }).strict();
export function quoteVoluntaryPrepaymentRefund(value: z.infer<typeof voluntaryRefundSchema>) {
  const input = voluntaryRefundSchema.parse(value), prepaid = quoteVoluntaryPrepayment({ monthlyIncome: input.monthlyIncome, fundMonthlyRatePercent: input.fundMonthlyRatePercent, years: input.years });
  if (input.remainingMonths > prepaid.months) throw new AppError(422, "REFUND_MONTHS_EXCEED_PREPAYMENT", "Số tháng hoàn không được vượt thời hạn đã đóng trước.");
  // Keep the original installment exponents: do not restart discounting at zero.
  const remaining = prepaid.installments.slice(-input.remainingMonths), gross = total(remaining), support = new D(input.stateSupportToExclude);
  if (support.gt(gross)) throw new AppError(422, "REFUND_SUPPORT_EXCEEDS_REMAINING_PAYMENT", "Tiền hỗ trợ cần đối chiếu với phần đóng trước còn lại.");
  return { remainingMonths: input.remainingMonths, firstRefundOrdinal: remaining[0].ordinal, grossRemaining: gross.toFixed(),
    stateSupportExcluded: support.toFixed(), refundAmount: gross.minus(support).toFixed() };
}

// Law36(2)(b,c,d) periods carry no multi-year discount. ND159 Art6/8
// multi-year periods retain their original installment exponents on refund.
export const voluntaryPeriodQuoteSchema = z.object({ ...base,
  periodMonths: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24), z.literal(36), z.literal(48), z.literal(60)]),
  usedMonths: z.number().int().min(0).max(60), stateSupportToExclude: amount.nullable(),
}).strict();
export function quoteVoluntaryPeriod(value: z.infer<typeof voluntaryPeriodQuoteSchema>) {
  const input = voluntaryPeriodQuoteSchema.parse(value);
  if (input.usedMonths > input.periodMonths) throw new AppError(422, "PREPAID_USED_MONTHS_EXCEED_PERIOD", "Số tháng tính hưởng vượt kỳ đã đóng.");
  const rows = installments(input.monthlyIncome, input.periodMonths <= 12 ? "0" : input.fundMonthlyRatePercent, input.periodMonths, true);
  const gross = total(rows), remaining = input.periodMonths - input.usedMonths, grossRemaining = total(rows.slice(input.usedMonths));
  const support = input.stateSupportToExclude === null ? null : new D(input.stateSupportToExclude);
  if (support?.gt(grossRemaining)) throw new AppError(422, "REFUND_SUPPORT_EXCEEDS_REMAINING_PAYMENT", "Tiền hỗ trợ cần đối chiếu với phần đóng trước còn lại.");
  return { grossContribution: gross.toFixed(), remainingMonths: remaining, grossRemaining: grossRemaining.toFixed(),
    refundAmount: remaining === 0 ? "0" : support === null ? null : grossRemaining.minus(support).toFixed(),
    refundStatus: remaining === 0 ? "NO_REMAINING_PERIOD" : support === null ? "SUPPORT_RECONCILIATION_REQUIRED" : "ESTIMATE_NOT_RECEIVED" };
}
