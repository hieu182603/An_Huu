import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import type { Protection } from "./protected-capital";

/** Shared decimal class and input types for the v3/v5 kernels (breaks the engine.ts <-> engine-v3/v5 cycle). */
export const RetirementDecimal = Prisma.Decimal.clone({ precision: 48 });
const D = RetirementDecimal;
export type MonthlyInput = {
  month: string; growthFactor: string; inflationFactor: string;
  income: string; pension: string; livingExpense: string; additionalExpense: string; debtPayment: string;
  plannedContribution: string; contribution: string; contributionCapacity: string;
  withdrawal: string; uninvestedSurplus: string; capitalInjection: string;
  /** v5 only: fraction of the post-withdrawal balance lost to trading cost (default 0). v3 ignores it. */
  tradingCostRate?: string;
};
export type ProjectionInput = {
  valuationDate: string; retirementMonth: string; initialCapital: string; terminalBalance: string;
  monthlyContribution: string; contributionTiming: "END_OF_MONTH" | "START_OF_MONTH_RESEARCH" | "START_OF_MONTH"; rows: MonthlyInput[];
  modelVersion?: "retirement-monthly-v3" | "retirement-monthly-v5";
  contributionStartMonth?: string;
  /** Pinned nominal annual planning rate. Older snapshots use portfolio growth for discounting. */
  retirementPlanningAnnualPercent?: string;
  protection?: Protection;
};
export const decimal = (value: string) => {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new AppError(422, "INVALID_PROJECTION_INPUT", "Dữ liệu tính toán phải là chuỗi thập phân.");
  const parsed = new D(value);
  if (!parsed.isFinite() || parsed.abs().gt("1e100")) throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Dữ liệu vượt phạm vi tính toán.");
  return parsed;
};
export const positivePart = (v: Prisma.Decimal) => D.max(0, v);
