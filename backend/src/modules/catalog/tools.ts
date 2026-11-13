import { Prisma } from "@prisma/client";
import { z } from "zod";
import { dateSchema } from "../../common/calendar";
import { moneySchema } from "../../common/http";
const D = Prisma.Decimal.clone({ precision: 48 });
const positiveMoney = moneySchema.refine(v => /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(v) && new D(v).gt(0), "Số tiền phải lớn hơn 0.");
const rate = z.string().regex(/^(0|[1-9]\d?)(\.\d{1,8})?$/).refine(v => { try { return new D(v).gte(0) && new D(v).lte(50); } catch { return false; } }, "Lãi suất từ 0 đến 50%/năm.");

export function monthDate(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number), index = y * 12 + m - 1 + months;
  const year = Math.floor(index / 12), month = index % 12 + 1, day = Math.min(d, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export const depositInput = z.object({ principal: positiveMoney, annualRate: rate, termMonths: z.number().int().min(1).max(120), startDate: dateSchema,
  payout: z.enum(["END", "MONTHLY", "COMPOUND"]), early: z.object({ month: z.number().int().min(1), annualRate: rate }).strict().optional(),
}).strict().superRefine((v, ctx) => { if (v.early && v.early.month >= v.termMonths) ctx.addIssue({ code: "custom", path: ["early", "month"], message: "Rút sớm phải trước tháng đáo hạn." }); });
export function depositPreview(raw: unknown) {
  const v = depositInput.parse(raw), principal = new D(v.principal), monthly = principal.mul(v.annualRate).div(1200).toDecimalPlaces(2);
  const final = v.payout === "COMPOUND" ? principal.mul(new D(v.annualRate).div(1200).plus(1).pow(v.termMonths)) : v.payout === "MONTHLY" ? principal.plus(monthly.mul(v.termMonths)) : principal.plus(principal.mul(v.annualRate).div(1200).mul(v.termMonths).toDecimalPlaces(2));
  const earlyInterest = v.early ? principal.mul(v.early.annualRate).div(1200).mul(v.early.month).toDecimalPlaces(2) : null;
  const paid = v.early && v.payout === "MONTHLY" ? monthly.mul(v.early.month) : new D(0);
  const interest = final.minus(principal);
  // Annual equivalent rate only differs from the nominal rate when interest compounds.
  const effectiveAnnualRatePercent = (v.payout === "COMPOUND" ? new D(v.annualRate).div(1200).plus(1).pow(12).minus(1).mul(100) : new D(v.annualRate)).toFixed(8);
  // Interest the held deposit would have earned by the same month, minus what early exit pays.
  const forgone = v.early && earlyInterest ? D.max(0, interest.mul(v.early.month).div(v.termMonths).minus(earlyInterest)).toFixed(2) : null;
  return { informationalOnly: true, currency: "VND", assumptions: v, maturityDate: monthDate(v.startDate, v.termMonths),
    interest: interest.toFixed(2), effectiveAnnualRatePercent, monthlyPayout: v.payout === "MONTHLY" ? monthly.toFixed(2) : "0.00",
    maturityPayment: (v.payout === "MONTHLY" ? principal : final).toFixed(2), totalReceived: final.toFixed(2),
    early: v.early && earlyInterest ? { date: monthDate(v.startDate, v.early.month), interest: earlyInterest.toFixed(2), alreadyPaid: paid.toFixed(2), settlementPayment: principal.plus(earlyInterest).minus(paid).toFixed(2), totalReceived: principal.plus(earlyInterest).toFixed(2), forgoneInterest: forgone! } : null };
}
export const bondInput = z.object({ faceValue: positiveMoney, purchasePrice: positiveMoney, quantity: z.number().int().min(1).max(1e9), annualCoupon: rate,
  termMonths: z.number().int().min(1).max(600), couponEveryMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]), startDate: dateSchema,
  sale: z.object({ month: z.number().int().min(1), price: moneySchema }).strict().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.termMonths % v.couponEveryMonths !== 0) ctx.addIssue({ code: "custom", path: ["termMonths"], message: "Kỳ hạn phải là bội số của kỳ trả coupon." });
  if (v.sale && v.sale.month >= v.termMonths) ctx.addIssue({ code: "custom", path: ["sale", "month"], message: "Bán sớm phải trước tháng đáo hạn." });
});
export function bondPreview(raw: unknown) {
  const v = bondInput.parse(raw), cost = new D(v.purchasePrice).mul(v.quantity), par = new D(v.faceValue).mul(v.quantity);
  const coupon = par.mul(v.annualCoupon).div(1200).mul(v.couponEveryMonths).toDecimalPlaces(2), periods = v.termMonths / v.couponEveryMonths;
  const schedule = Array.from({ length: periods }, (_, i) => ({ month: (i + 1) * v.couponEveryMonths, date: monthDate(v.startDate, (i + 1) * v.couponEveryMonths),
    coupon: coupon.toFixed(2), principal: i + 1 === periods ? par.toFixed(2) : "0.00", total: coupon.plus(i + 1 === periods ? par : 0).toFixed(2) }));
  // Coupon pricing uses face value. Yield is a bounded periodic IRR, not coupon/price.
  const npv = (r: Prisma.Decimal) => coupon.mul(new D(1).minus(new D(1).plus(r).pow(-periods))).div(r).plus(par.div(new D(1).plus(r).pow(periods))).minus(cost);
  let lo = new D("-0.999999"), hi = new D(1), ytm: string | null = null;
  for (let i = 0; i < 40 && npv(hi).gt(0); i++) hi = hi.mul(2);
  if (npv(lo).gte(0) && npv(hi).lte(0)) {
    for (let i = 0; i < 140; i++) { const mid = lo.plus(hi).div(2); if (mid.isZero()) { if (coupon.mul(periods).plus(par).gt(cost)) lo = mid; else hi = mid; } else if (npv(mid).gt(0)) lo = mid; else hi = mid; }
    ytm = lo.plus(hi).div(2).mul(1200).div(v.couponEveryMonths).toFixed(8);
  }
  const totalCoupons = coupon.mul(periods), received = totalCoupons.plus(par);
  const collected = v.sale ? coupon.mul(Math.floor(v.sale.month / v.couponEveryMonths)) : null, proceeds = v.sale ? new D(v.sale.price).mul(v.quantity) : null;
  return { informationalOnly: true, currency: "VND", assumptions: v, cost: cost.toFixed(2), faceValueTotal: par.toFixed(2), totalCoupons: totalCoupons.toFixed(2), totalReceived: received.toFixed(2), gain: received.minus(cost).toFixed(2), currentYieldPercent: new D(v.faceValue).mul(v.annualCoupon).div(v.purchasePrice).toFixed(8), nominalYtmPercent: ytm, schedule,
    sale: collected !== null && proceeds !== null && v.sale ? { date: monthDate(v.startDate, v.sale.month), collectedCoupons: collected.toFixed(2), proceeds: proceeds.toFixed(2), gain: collected.plus(proceeds).minus(cost).toFixed(2),
      // Holding period return on the actual purchase cost, and its simple per-year equivalent.
      holdingPeriodReturnPercent: collected.plus(proceeds).minus(cost).div(cost).mul(100).toFixed(8),
      annualizedReturnPercent: collected.plus(proceeds).minus(cost).div(cost).mul(1200).div(v.sale.month).toFixed(8) } : null };
}
const nonNegativeMoney = moneySchema.refine(v => /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(v), "Số tiền không âm, tối đa 16 chữ số và 2 số lẻ.");
/** D.I.M.E. protection need: Debt + Income replacement + Mortgage/education - liquid assets - existing cover.
 * Illustrative only; it does not read or change the user's profile or plan. */
export const protectionInput = z.object({
  outstandingDebt: nonNegativeMoney, monthlyIncomeToReplace: nonNegativeMoney, replacementYears: z.number().int().min(1).max(40),
  educationNeed: nonNegativeMoney, otherNeeds: nonNegativeMoney.default("0"), liquidAssets: nonNegativeMoney, existingCoverage: nonNegativeMoney,
}).strict();
export function protectionPreview(raw: unknown) {
  const v = protectionInput.parse(raw), income = new D(v.monthlyIncomeToReplace).mul(12).mul(v.replacementYears);
  const gross = new D(v.outstandingDebt).plus(income).plus(v.educationNeed).plus(v.otherNeeds);
  const need = D.max(0, gross.minus(v.liquidAssets)), gap = D.max(0, need.minus(v.existingCoverage));
  return { informationalOnly: true, currency: "VND", assumptions: v,
    components: { debt: new D(v.outstandingDebt).toFixed(2), incomeReplacement: income.toFixed(2), education: new D(v.educationNeed).toFixed(2), other: new D(v.otherNeeds).toFixed(2) },
    grossNeed: gross.toFixed(2), liquidAssetsOffset: D.min(gross, v.liquidAssets).toFixed(2), protectionNeed: need.toFixed(2),
    existingCoverage: new D(v.existingCoverage).toFixed(2), protectionGap: gap.toFixed(2), surplusCoverage: D.max(0, new D(v.existingCoverage).minus(need)).toFixed(2) };
}
