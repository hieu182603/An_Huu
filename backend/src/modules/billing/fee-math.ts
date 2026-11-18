import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Fee schedule terms as stored (Decimal columns arrive as Decimal or string). */
export type ScheduleTerms = {
  annualRatePercent: Decimal | string;
  minMonthlyVnd: number;
  maxMonthlyVnd: number | null;
  roundingStepVnd: number;
};
export type OverrideTerms = { kind: "DISCOUNT_PERCENT" | "FIXED_AMOUNT" | "WAIVE"; value: Decimal | string | null } | null;

export type FeeComputation = {
  /** Whole VND, never negative. */
  baseAmountVnd: string;
  /** base × rate ÷ 12 before rounding, 2 decimals. */
  rawFeeVnd: string;
  /** After rounding up to the step and the min/max clamp. */
  scheduleFeeVnd: number;
  /** What the user is asked to pay for the period, after a per-user override. */
  amountVnd: number;
  applied: { minimum: boolean; maximum: boolean; override: "DISCOUNT_PERCENT" | "FIXED_AMOUNT" | "WAIVE" | null };
};

const roundUp = (value: Decimal, step: number) => value.div(step).ceil().mul(step);

/**
 * Monthly service fee: base × annualRate% ÷ 12, rounded UP to `roundingStepVnd`,
 * then clamped to [minMonthlyVnd, maxMonthlyVnd]. A per-user override is applied last.
 * Pure and Decimal-only so the same inputs always give the same statement.
 */
export function computeFee(base: Decimal | string | null, schedule: ScheduleTerms, override: OverrideTerms = null): FeeComputation {
  const baseAmount = D.max(0, new D(base ?? 0)).floor();
  const raw = baseAmount.mul(new D(schedule.annualRatePercent)).div(100).div(12);
  let fee = roundUp(raw, schedule.roundingStepVnd);
  const minimum = fee.lt(schedule.minMonthlyVnd), maximum = schedule.maxMonthlyVnd !== null && fee.gt(schedule.maxMonthlyVnd);
  if (minimum) fee = new D(schedule.minMonthlyVnd);
  if (maximum) fee = new D(schedule.maxMonthlyVnd!);
  const scheduleFee = fee.toNumber();
  let amount = scheduleFee;
  if (override?.kind === "WAIVE") amount = 0;
  else if (override?.kind === "FIXED_AMOUNT") amount = D.max(0, new D(override.value ?? 0)).floor().toNumber();
  else if (override?.kind === "DISCOUNT_PERCENT") {
    const percent = D.min(100, D.max(0, new D(override.value ?? 0)));
    amount = roundUp(fee.mul(new D(100).minus(percent)).div(100), schedule.roundingStepVnd).toNumber();
  }
  return {
    baseAmountVnd: baseAmount.toFixed(0),
    rawFeeVnd: raw.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2),
    scheduleFeeVnd: scheduleFee,
    amountVnd: amount,
    applied: { minimum, maximum, override: override?.kind ?? null },
  };
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
/** Remaining amount for a statement from its ledger. ≤ 0 means settled (negative = overpaid). */
export function amountDue(input: { amountVnd: number; adjustments: number[]; payments: number[]; refunds: number[] }): number {
  return input.amountVnd - sum(input.adjustments) - sum(input.payments) + sum(input.refunds);
}
