import { AppError } from "../../common/errors";
import { RetirementDecimal as D } from "../retirement/engine";

/** Law on social insurance, consolidated 28/02/2026, Art 5(6).
 * This rounding is ONLY for the amount. Eligibility always uses raw months. */
export function benefitYears(months: number) {
  if (!Number.isInteger(months) || months < 0 || months > 1200) throw new AppError(422, "INVALID_INSURANCE_MONTHS", "Thời gian đóng không hợp lệ.");
  return new D(Math.floor(months / 12)).plus(months % 12 === 0 ? 0 : months % 12 <= 6 ? "0.5" : 1);
}

/** Art 66(1), ordinary compulsory branch; eligibility/disability/treaties are
 * assessed separately. Do not apply the 15-year minimum to every benefit. */
export function ordinaryPensionRate(sex: "MALE" | "FEMALE", months: number): string | null {
  const years = benefitYears(months);
  if (months < 180) return null;
  return D.min(75, sex === "FEMALE" ? new D(45).plus(years.minus(15).mul(2))
    : months < 240 ? new D(40).plus(years.minus(15)) : new D(45).plus(years.minus(20).mul(2))).toFixed();
}

/** Art 66(3), only AFTER the disability branch has established entitlement.
 * A preschool-teacher early retirement must not pass through this reduction. */
export function disabilityReductionPercent(earlyMonths: number): string {
  if (!Number.isInteger(earlyMonths) || earlyMonths < 0 || earlyMonths > 1200) throw new AppError(422, "INVALID_EARLY_RETIREMENT_MONTHS", "Khoảng nghỉ trước tuổi không hợp lệ.");
  return new D(Math.floor(earlyMonths / 12)).mul(2).plus(earlyMonths % 12 >= 6 ? 1 : 0).toFixed();
}

/** Art 72(2), TT12/2025 Art16(2). Caller resolves a published, benefit-year
 * coefficient for EVERY counted month; this helper has no factor fallback. */
export function adjustedWageAverage(rows: Array<{ base: string; factor: string }>): string {
  if (!rows.length || rows.length > 1200) throw new AppError(422, "INVALID_INSURANCE_MONTHS", "Thiếu căn cứ đóng theo tháng.");
  let total = new D(0);
  for (const row of rows) {
    if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(row.base) || !/^(0|[1-9]\d*)(\.\d+)?$/.test(row.factor))
      throw new AppError(422, "INSURANCE_DECIMAL_REQUIRED", "Căn cứ đóng và hệ số phải là chuỗi thập phân.");
    const base = new D(row.base), factor = new D(row.factor);
    if (base.gt("1e100") || factor.lte(0) || factor.gt("1e100")) throw new AppError(422, "INSURANCE_VALUE_OUT_OF_RANGE", "Căn cứ đóng hoặc hệ số không hợp lệ.");
    total = total.plus(base.mul(factor));
  }
  return total.div(rows.length).toFixed();
}
