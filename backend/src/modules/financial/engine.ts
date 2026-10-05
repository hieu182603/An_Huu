import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { assumptionSchema, goalDataSchema, MODEL_CODE, type Assumptions, type Goal } from "./schema";
import { moneySchema } from "../../common/http";
import { z } from "zod";

// Candidate model: activating it requires a separately recorded business review.
// Precision is local to this model; never change Prisma.Decimal's global settings.
const D = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
const MAX = new D("9999999999999999.99");
export const modelDefinition = {
  code: MODEL_CODE, description: "Monthly nominal cashflow; effective annual-to-monthly rates; end-month contributions; beginning-month withdrawals.",
  conventions: {
    pension: "NOT_ESTIMATED", contributionTiming: "END_OF_MONTH", withdrawalTiming: "BEGINNING_OF_MONTH",
    contributionGrowth: "FIXED_NOMINAL", expenseGrowth: "MONTHLY_INFLATION", ratePolicy: "FIXED_ALLOCATION_AT_CURRENT_AND_RETIREMENT_AGE",
    debtPolicy: "SETTLE_ALL_DECLARED_DEBT_FROM_LIQUID_ASSETS_AT_START", taxFees: "NOT_SEPARATELY_MODELED",
    rounding: "40_DIGIT_INTERMEDIATE_HALF_UP_CENTS_OUTPUT; REQUIRED_SAVINGS_CEILING_TO_CENT",
  },
  businessReviewRequired: true,
};
export function resolveAssumptions(data: Assumptions, currentAge: number, retirementAge: number, risk: Goal["riskLevel"]) {
  const parsed = assumptionSchema.parse(data);
  function allocation(age: number) {
    const rule = parsed.policy.rules.find(r => r.riskLevel === risk && r.minAge <= age && age <= r.maxAge);
    if (!rule) throw new AppError(422, "POLICY_NOT_COVERED", "Chưa có quy tắc phân bổ phù hợp.");
    const annualReturnRate = rule.allocations.reduce((sum, a) => sum.plus(
      new D(parsed.values.assetClasses.find(c => c.code === a.assetClass)!.annualReturnRate).mul(a.weightPercent).div(100)), new D(0));
    return { annualReturnRate: annualReturnRate.toFixed(8), allocations: rule.allocations };
  }
  return { annualInflationRate: parsed.values.annualInflationRate, accumulation: allocation(currentAge), retirement: allocation(retirementAge) };
}
export type ResolvedRates = ReturnType<typeof resolveAssumptions>;
const ratesSchema = z.object({
  annualInflationRate: z.string(), accumulation: z.object({ annualReturnRate: z.string() }).passthrough(),
  retirement: z.object({ annualReturnRate: z.string() }).passthrough(),
});
export function calculatePlan(input: { currentAge: number; initialInvestableAssets: string; goal: Goal }, rates: ResolvedRates) {
  z.number().int().min(18).max(100).parse(input.currentAge);
  moneySchema.parse(input.initialInvestableAssets);
  const goal = goalDataSchema.parse(input.goal);
  if (goal.targetRetirementAge < input.currentAge) throw new AppError(422, "INVALID_RETIREMENT_AGE", "Tuổi nghỉ hưu không được nhỏ hơn tuổi hiện tại.");
  ratesSchema.parse(rates);
  const annuals = [rates.annualInflationRate, rates.accumulation.annualReturnRate, rates.retirement.annualReturnRate].map(v => new D(v));
  if (annuals.some(v => !v.isFinite() || v.lt(-50) || v.gt(50)) || annuals[0].lt(0) || annuals[0].gt(20))
    throw new AppError(422, "INVALID_ASSUMPTIONS", "Bộ giả định ngoài miền tính toán.");
  const monthly = annuals.map(v => v.div(100).plus(1).pow(new D(1).div(12)));
  const [inflation, growth, retirementGrowth] = monthly;
  const months = (goal.targetRetirementAge - input.currentAge) * 12;
  const retirementMonths = (goal.lifeExpectancy - goal.targetRetirementAge) * 12;
  const initial = new D(input.initialInvestableAssets), contribution = new D(goal.monthlyContribution);
  const expenseAtRetirement = new D(goal.monthlyExpense).mul(inflation.pow(months));
  let target = new D(0);
  for (let m = retirementMonths - 1; m >= 0; m--) target = target.div(retirementGrowth).plus(expenseAtRetirement.mul(inflation.pow(m)));
  const factor = growth.pow(months);
  const annuity = growth.eq(1) ? new D(months) : factor.minus(1).div(growth.minus(1));
  const future = (c: InstanceType<typeof D>) => initial.mul(factor).plus(c.mul(annuity));
  let required: string | null = null;
  let savingsStatus = "CALCULATED";
  if (future(new D(0)).gte(target)) required = "0.00";
  else if (!months) savingsStatus = "NO_ACCUMULATION_PERIOD";
  else if (future(MAX).lt(target)) savingsStatus = "OUT_OF_RANGE";
  else {
    // Monotone integer-cent bisection. <= 60 iterations for Decimal(18,2).
    let low = new D(0), high = MAX.mul(100);
    for (let i = 0; high.minus(low).gt(1) && i < 64; i++) {
      const mid = low.plus(high).div(2).floor();
      if (future(mid.div(100)).gte(target)) high = mid; else low = mid;
    }
    if (high.minus(low).gt(1)) throw new AppError(422, "SOLVER_FAILED", "Chưa tìm được mức tích lũy phù hợp.");
    required = high.div(100).toFixed(2);
  }
  let balance = initial;
  type Point = { month: number; age: number; phase: string; balance: string };
  const series: Point[] = [{ month: 0, age: input.currentAge, phase: months ? "ACCUMULATION" : "RETIREMENT", balance: balance.toFixed(2) }];
  const point = (month: number, phase: string) => series.push({ month, age: input.currentAge + month / 12, phase, balance: balance.toFixed(2) });
  for (let m = 1; m <= months; m++) {
    balance = balance.mul(growth).plus(contribution);
    if (m % 12 === 0) point(m, m === months ? "RETIREMENT" : "ACCUMULATION");
  }
  const projected = balance;
  let depletedMonth: number | null = null, unmetWithdrawals = new D(0);
  for (let m = 0; m < retirementMonths; m++) {
    const withdrawal = expenseAtRetirement.mul(inflation.pow(m));
    if (balance.lt(withdrawal)) {
      depletedMonth ??= months + m;
      unmetWithdrawals = unmetWithdrawals.plus(withdrawal.minus(balance));
      balance = new D(0);
    } else balance = balance.minus(withdrawal);
    balance = balance.mul(retirementGrowth);
    if ((m + 1) % 12 === 0) point(months + m + 1, "RETIREMENT");
  }
  if ([target, projected, balance, unmetWithdrawals].some(v => !v.isFinite() || v.abs().gt("1e35")))
    throw new AppError(422, "PROJECTION_OUT_OF_RANGE", "Khoảng dự phóng vượt giới hạn tính toán.");
  return {
    summary: {
      yearsToRetirement: months / 12, retirementYears: retirementMonths / 12,
      initialInvestableAssets: initial.toFixed(2), homeEquityExcluded: true,
      targetFund: target.toFixed(2), projectedFund: projected.toFixed(2), fundingGap: target.minus(projected).toFixed(2),
      futureMonthlyExpense: expenseAtRetirement.toFixed(2), requiredMonthlySavings: required,
      savingsStatus, plannedMonthlyContribution: contribution.toFixed(2),
      readinessScore: target.eq(0) ? 100 : D.min(100, projected.div(target).mul(100)).toDecimalPlaces(2).toNumber(),
      terminalBalance: balance.toFixed(2), depletedMonth, unmetWithdrawals: unmetWithdrawals.toFixed(2),
      pension: { status: "NOT_ESTIMATED", estimatedMonthlyAmount: null }, currency: "VND",
    },
    chartSeries: series, assumptions: rates, modelCode: MODEL_CODE,
    limitations: ["PENSION_NOT_INCLUDED", "DETERMINISTIC_RETURNS_NOT_GUARANTEED", "TAX_FEES_NOT_SEPARATELY_MODELED", "FIXED_NOMINAL_CONTRIBUTIONS"],
  };
}
