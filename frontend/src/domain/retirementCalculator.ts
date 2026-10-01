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

export interface RetirementCalculation {
  yearsToRetirement: number;
  retirementYears: number;
  investableAssetsToday: number;
  homeEquityExcluded: true;
  futureMonthlyExpense: number;
  estimatedMonthlyPension: number;
  requiredMonthlyWithdrawal: number;
  targetFund: number;
  projectedFund: number;
  gap: number;
  readinessScore: number;
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, finite(value, min)));

export function validateRetirementInput(input: RetirementCalculationInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.currentAge) || input.currentAge < 18 || input.currentAge > 74) errors.push("Tuổi hiện tại phải từ 18 đến 74.");
  if (!Number.isFinite(input.retirementAge) || input.retirementAge <= input.currentAge || input.retirementAge > 75) errors.push("Tuổi nghỉ hưu phải lớn hơn tuổi hiện tại và không quá 75.");
  if (!Number.isFinite(input.lifeExpectancy) || input.lifeExpectancy <= input.retirementAge || input.lifeExpectancy > 110) errors.push("Tuổi thọ phải lớn hơn tuổi nghỉ hưu và không quá 110.");
  if (!Number.isFinite(input.annualInflationRate) || input.annualInflationRate < 0 || input.annualInflationRate > 20) errors.push("Lạm phát phải nằm trong khoảng 0% đến 20%.");
  if (!Number.isFinite(input.annualReturnRate) || input.annualReturnRate < 0 || input.annualReturnRate > 30) errors.push("Lợi suất phải nằm trong khoảng 0% đến 30%.");
  for (const [label, value] of [
    ["Chi tiêu", input.monthlyExpenseToday],
    ["Tích lũy", input.monthlyContribution],
    ["Tiền mặt", input.cashSavings],
    ["Tài sản thanh khoản", input.liquidAssets],
    ["Quỹ và cổ phiếu", input.stockFundValue],
    ["Nợ tiêu dùng", input.consumerDebt],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) errors.push(`${label} không được âm hoặc để trống.`);
  }
  return errors;
}

function futureValue(principal: number, monthlyContribution: number, annualRate: number, months: number) {
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  if (months <= 0) return principal;
  if (Math.abs(monthlyRate) < 1e-10) return principal + monthlyContribution * months;
  const factor = Math.pow(1 + monthlyRate, months);
  return principal * factor + monthlyContribution * ((factor - 1) / monthlyRate);
}

function requiredFundAtRetirement(monthlyExpense: number, monthlyPension: number, annualReturn: number, annualInflation: number, months: number) {
  const monthlyReturn = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + annualInflation / 100, 1 / 12) - 1;
  let required = 0;
  for (let month = months - 1; month >= 0; month--) {
    const withdrawal = Math.max(0, monthlyExpense * Math.pow(1 + monthlyInflation, month) - monthlyPension * Math.pow(1 + monthlyInflation, month));
    required = (required + withdrawal) / (1 + monthlyReturn);
  }
  return required;
}

export function calculateRetirement(input: RetirementCalculationInput): RetirementCalculation {
  const currentAge = clamp(input.currentAge, 18, 74);
  const retirementAge = clamp(input.retirementAge, currentAge + 1, 75);
  const lifeExpectancy = clamp(input.lifeExpectancy, retirementAge + 1, 110);
  const annualReturn = clamp(input.annualReturnRate, 0, 30);
  const annualInflation = clamp(input.annualInflationRate, 0, 20);
  const yearsToRetirement = retirementAge - currentAge;
  const retirementYears = lifeExpectancy - retirementAge;
  const monthsToRetirement = yearsToRetirement * 12;
  const retirementMonths = retirementYears * 12;

  // Nhà ở không được coi là tiền có thể chi tiêu. Chỉ các tài sản tài chính thanh khoản
  // được đưa vào quỹ, sau khi trừ nợ tiêu dùng.
  const investableAssetsToday = Math.max(0,
    finite(input.cashSavings) + finite(input.liquidAssets) + finite(input.stockFundValue) - Math.max(0, finite(input.consumerDebt)),
  );
  const projectedFund = futureValue(investableAssetsToday, Math.max(0, finite(input.monthlyContribution)), annualReturn, monthsToRetirement);
  const inflationFactor = Math.pow(1 + annualInflation / 100, yearsToRetirement);
  const futureMonthlyExpense = Math.max(0, finite(input.monthlyExpenseToday)) * inflationFactor;

  // Ước tính demo: tỷ lệ thay thế 45% sau 20 năm, cộng 2% mỗi năm tiếp theo, tối đa 75%.
  // Đây không phải phép tính quyền lợi BHXH chính thức.
  const contributionYearsAtRetirement = Math.max(0, finite(input.socialInsuranceYears)) + yearsToRetirement;
  const pensionReplacementRate = contributionYearsAtRetirement < 20
    ? 0
    : Math.min(0.75, 0.45 + (contributionYearsAtRetirement - 20) * 0.02);
  const estimatedMonthlyPension = Math.max(0, finite(input.socialInsuranceSalary)) * inflationFactor * pensionReplacementRate;
  const requiredMonthlyWithdrawal = Math.max(0, futureMonthlyExpense - estimatedMonthlyPension);

  // Giai đoạn hưu trí dùng lợi suất thận trọng hơn 1,5 điểm phần trăm.
  const retirementReturn = Math.max(0, annualReturn - 1.5);
  const targetFund = requiredFundAtRetirement(futureMonthlyExpense, estimatedMonthlyPension, retirementReturn, annualInflation, retirementMonths);
  const gap = targetFund - projectedFund;
  const readinessScore = targetFund <= 0 ? 100 : clamp(Math.round(projectedFund / targetFund * 100), 0, 100);

  return {
    yearsToRetirement,
    retirementYears,
    investableAssetsToday: Math.round(investableAssetsToday),
    homeEquityExcluded: true,
    futureMonthlyExpense: Math.round(futureMonthlyExpense),
    estimatedMonthlyPension: Math.round(estimatedMonthlyPension),
    requiredMonthlyWithdrawal: Math.round(requiredMonthlyWithdrawal),
    targetFund: Math.round(targetFund),
    projectedFund: Math.round(projectedFund),
    gap: Math.round(gap),
    readinessScore,
  };
}

export function projectBalanceAtAge(input: RetirementCalculationInput, age: number, targetTrack = false): number {
  const result = calculateRetirement(input);
  const boundedAge = clamp(age, input.currentAge, input.lifeExpectancy);
  if (boundedAge <= input.retirementAge) {
    const elapsedMonths = Math.round((boundedAge - input.currentAge) * 12);
    if (targetTrack) {
      const progress = result.yearsToRetirement <= 0 ? 1 : (boundedAge - input.currentAge) / result.yearsToRetirement;
      return Math.round(result.investableAssetsToday + (result.targetFund - result.investableAssetsToday) * Math.pow(progress, 1.35));
    }
    return Math.round(futureValue(result.investableAssetsToday, Math.max(0, input.monthlyContribution), clamp(input.annualReturnRate, 0, 30), elapsedMonths));
  }

  const postMonths = Math.round((boundedAge - input.retirementAge) * 12);
  const monthlyReturn = Math.pow(1 + Math.max(0, clamp(input.annualReturnRate, 0, 30) - 1.5) / 100, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + clamp(input.annualInflationRate, 0, 20) / 100, 1 / 12) - 1;
  let balance = targetTrack ? result.targetFund : result.projectedFund;
  for (let month = 0; month < postMonths; month++) {
    const withdrawal = Math.max(0,
      result.futureMonthlyExpense * Math.pow(1 + monthlyInflation, month) -
      result.estimatedMonthlyPension * Math.pow(1 + monthlyInflation, month),
    );
    balance = Math.max(0, balance * (1 + monthlyReturn) - withdrawal);
  }
  return Math.round(balance);
}

export function inputFromProfile(profile: {
  personal: { age: number };
  assets: { cashSavings: number; liquidAssets: number; stockFundValue: number };
  debt: { hasDebt: boolean; consumerDebt: number };
  socialSecurity: { socialInsuranceYears: number; socialInsuranceSalary: number };
  goal: { targetRetireAge: number; lifeExpectancy: number; monthlyExpenseInRetirement: number; investmentReturn: number; inflationRate: number };
  plan: { monthlySavings: number };
}): RetirementCalculationInput {
  return {
    currentAge: profile.personal.age,
    retirementAge: profile.goal.targetRetireAge,
    lifeExpectancy: profile.goal.lifeExpectancy,
    monthlyExpenseToday: profile.goal.monthlyExpenseInRetirement,
    monthlyContribution: profile.plan.monthlySavings,
    annualReturnRate: profile.goal.investmentReturn,
    annualInflationRate: profile.goal.inflationRate,
    cashSavings: profile.assets.cashSavings,
    liquidAssets: profile.assets.liquidAssets,
    stockFundValue: profile.assets.stockFundValue,
    consumerDebt: profile.debt.hasDebt ? profile.debt.consumerDebt : 0,
    socialInsuranceYears: profile.socialSecurity.socialInsuranceYears,
    socialInsuranceSalary: profile.socialSecurity.socialInsuranceSalary,
  };
}
