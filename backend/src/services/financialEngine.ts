export interface RetirementCalculationInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  monthlyExpenseToday: number;
  monthlyContribution: number;
  annualReturnRate: number;
  annualInflationRate: number;
  cashSavings: number;
  liquidAssets: number;
  stockFundValue: number;
  consumerDebt: number;
  socialInsuranceYears: number;
  socialInsuranceSalary: number;
}

export interface RetirementCalculationResult {
  yearsToRetirement: number;
  retirementYears: number;
  investableAssetsToday: number;
  homeEquityExcluded: true;
  futureMonthlyExpense: number;
  estimatedMonthlyPension: null;
  pensionStatus: "NOT_ESTIMATED";
  requiredMonthlyWithdrawal: number;
  targetFund: number;
  projectedFund: number;
  gap: number;
  readinessScore: number;
}

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, finite(value, min)));

export function validateRetirementInput(input: RetirementCalculationInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.currentAge) || input.currentAge < 18 || input.currentAge > 74) {
    errors.push("Tuổi hiện tại phải từ 18 đến 74.");
  }
  if (!Number.isFinite(input.retirementAge) || input.retirementAge <= input.currentAge || input.retirementAge > 75) {
    errors.push("Tuổi nghỉ hưu phải lớn hơn tuổi hiện tại và không quá 75.");
  }
  if (!Number.isFinite(input.lifeExpectancy) || input.lifeExpectancy <= input.retirementAge || input.lifeExpectancy > 110) {
    errors.push("Tuổi thọ kỳ vọng phải lớn hơn tuổi nghỉ hưu và không quá 110.");
  }
  if (!Number.isFinite(input.annualInflationRate) || input.annualInflationRate < 0 || input.annualInflationRate > 20) {
    errors.push("Tỷ lệ lạm phát phải nằm trong khoảng 0% đến 20%.");
  }
  if (!Number.isFinite(input.annualReturnRate) || input.annualReturnRate < 0 || input.annualReturnRate > 30) {
    errors.push("Lợi suất đầu tư phải nằm trong khoảng 0% đến 30%.");
  }
  return errors;
}

export function futureValue(principal: number, monthlyContribution: number, annualRate: number, months: number): number {
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  if (months <= 0) return principal;
  if (Math.abs(monthlyRate) < 1e-10) return principal + monthlyContribution * months;
  const factor = Math.pow(1 + monthlyRate, months);
  return principal * factor + monthlyContribution * ((factor - 1) / monthlyRate);
}

export function requiredFundAtRetirement(
  monthlyExpense: number,
  monthlyPension: number,
  annualReturn: number,
  annualInflation: number,
  months: number
): number {
  const monthlyReturn = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + annualInflation / 100, 1 / 12) - 1;
  let required = 0;
  for (let month = months - 1; month >= 0; month--) {
    const withdrawal = Math.max(0, monthlyExpense * Math.pow(1 + monthlyInflation, month) - monthlyPension);
    required = (required + withdrawal) / (1 + monthlyReturn);
  }
  return required;
}

export function calculateRetirement(input: RetirementCalculationInput): RetirementCalculationResult {
  const currentAge = clamp(input.currentAge, 18, 74);
  const retirementAge = clamp(input.retirementAge, currentAge + 1, 75);
  const lifeExpectancy = clamp(input.lifeExpectancy, retirementAge + 1, 110);
  const annualReturn = clamp(input.annualReturnRate, 0, 30);
  const annualInflation = clamp(input.annualInflationRate, 0, 20);

  const yearsToRetirement = retirementAge - currentAge;
  const retirementYears = lifeExpectancy - retirementAge;
  const monthsToRetirement = yearsToRetirement * 12;
  const retirementMonths = retirementYears * 12;

  const investableAssetsToday = Math.max(
    0,
    finite(input.cashSavings) + finite(input.liquidAssets) + finite(input.stockFundValue) - Math.max(0, finite(input.consumerDebt))
  );

  const projectedFund = futureValue(
    investableAssetsToday,
    Math.max(0, finite(input.monthlyContribution)),
    annualReturn,
    monthsToRetirement
  );

  const inflationFactor = Math.pow(1 + annualInflation / 100, yearsToRetirement);
  const futureMonthlyExpense = Math.max(0, finite(input.monthlyExpenseToday)) * inflationFactor;

  // Legacy input cannot establish pension entitlement. T05 uses declared amounts,
  // dated sources and receipt months; never infer benefits from salary/years.
  const requiredMonthlyWithdrawal = Math.max(0, futureMonthlyExpense);

  // Legacy demo only: no unsupported retirement discount. Production uses the
  // approved annual asset/horizon series in modules/assumptions (T03/T06).
  const retirementReturn = annualReturn;
  const targetFund = requiredFundAtRetirement(
    futureMonthlyExpense,
    0,
    retirementReturn,
    annualInflation,
    retirementMonths
  );

  const gap = targetFund - projectedFund;
  const readinessScore = targetFund <= 0 ? 100 : clamp(Math.round((projectedFund / targetFund) * 100), 0, 100);

  return {
    yearsToRetirement,
    retirementYears,
    investableAssetsToday: Math.round(investableAssetsToday),
    homeEquityExcluded: true,
    futureMonthlyExpense: Math.round(futureMonthlyExpense),
    estimatedMonthlyPension: null,
    pensionStatus: "NOT_ESTIMATED",
    requiredMonthlyWithdrawal: Math.round(requiredMonthlyWithdrawal),
    targetFund: Math.round(targetFund),
    projectedFund: Math.round(projectedFund),
    gap: Math.round(gap),
    readinessScore,
  };
}
