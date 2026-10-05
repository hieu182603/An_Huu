import { Prisma } from "@prisma/client";
import { addMonths } from "../../common/calendar";
import type { ProfileV2 } from "../profiles/schema-v2";
import type { AssumptionDocument } from "../assumptions/schema";

const D = Prisma.Decimal.clone({ precision: 48 });
export type PensionIssue = { path: string; code: string };
export function pensionAtMonth(profile: Pick<ProfileV2, "pension" | "personal">, month: string,
  assumptions?: AssumptionDocument) {
  const pension = profile.pension, start = profile.personal.pensionStartMonth;
  const fail = (code: string) => ({ amount: null, issues: [{ path: "pension", code }] });
  const ready = (value: string) => ({ amount: value, issues: [] as PensionIssue[] });
  if (pension?.status === "NOT_APPLICABLE") return ready("0");
  if (start.status === "KNOWN" && month < start.value) return ready("0");
  if (!pension || pension.status === "UNKNOWN") return fail("PENSION_NOT_INCLUDED");
  // Confirmed zero does not need a start month or a conversion factor.
  if (new D(pension.monthlyAmount).isZero() && pension.adjustment.kind === "NONE") return ready("0");
  if (start.status !== "KNOWN") return fail("PENSION_START_MONTH_REQUIRED");
  if (pension.adjustment.kind === "EXPLICIT_SCHEDULE") {
    const applicable = pension.adjustment.entries.filter(e => e.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))[0];
    if (applicable) return ready(new D(applicable.monthlyAmount).toFixed());
  }
  let amount = new D(pension.monthlyAmount);
  if (pension.priceBasis === "TODAY" && pension.basisMonth !== start.value && !amount.isZero()) {
    if (pension.basisMonth > start.value) return fail("NOMINAL_AMOUNT_REQUIRED_FOR_EXISTING_PENSION");
    if (!assumptions) return fail("PUBLISHED_INFLATION_REQUIRED");
    // TODAY is beginning-of-basis-month money. Convert to beginning-of-start-month
    // money once; after receipt starts, there is no implicit CPI indexation.
    const factors = new Map<number, Prisma.Decimal>();
    for (let period = pension.basisMonth; period < start.value; period = addMonths(period, 1)) {
      const year = Number(period.slice(0, 4));
      const row = assumptions.inflation.find(r => r.year === year);
      if (!row) return fail("INFLATION_YEAR_MISSING");
      const factor = factors.get(year) ?? new D(row.percent).div(100).plus(1).pow(new D(1).div(12));
      factors.set(year, factor);
      amount = amount.mul(factor);
    }
  }
  return ready(amount.toFixed());
}
