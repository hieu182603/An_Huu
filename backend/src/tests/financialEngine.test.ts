import { describe, it, expect } from "vitest";
import {
  calculateRetirement,
  validateRetirementInput,
  futureValue,
  type RetirementCalculationInput,
} from "../services/financialEngine";

describe("Financial Calculation Engine", () => {
  const sampleInput: RetirementCalculationInput = {
    currentAge: 32,
    retirementAge: 60,
    lifeExpectancy: 82,
    monthlyExpenseToday: 22000000,
    monthlyContribution: 8000000,
    annualReturnRate: 8.5,
    annualInflationRate: 4.0,
    cashSavings: 450000000,
    liquidAssets: 220000000,
    stockFundValue: 350000000,
    consumerDebt: 0,
    socialInsuranceYears: 9,
    socialInsuranceSalary: 18000000,
  };

  it("calculates realistic retirement targets and positive funds", () => {
    const result = calculateRetirement(sampleInput);

    expect(result.yearsToRetirement).toBe(28);
    expect(result.retirementYears).toBe(22);
    expect(result.investableAssetsToday).toBe(1020000000);
    expect(result.targetFund).toBeGreaterThan(0);
    expect(result.projectedFund).toBeGreaterThan(0);
    expect(result.readinessScore).toBeGreaterThanOrEqual(0);
    expect(result.readinessScore).toBeLessThanOrEqual(100);
    expect(result.estimatedMonthlyPension).toBeGreaterThan(0);
  });

  it("validates input boundary ranges correctly", () => {
    const invalidInput = {
      ...sampleInput,
      currentAge: 15, // Dưới 18 tuổi
      retirementAge: 10, // Nhỏ hơn tuổi hiện tại
      annualInflationRate: 35, // Quá cao
    };

    const errors = validateRetirementInput(invalidInput);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("Tuổi hiện tại"))).toBe(true);
    expect(errors.some((e) => e.includes("Tuổi nghỉ hưu"))).toBe(true);
  });

  it("handles future value computation with zero contribution", () => {
    const fv = futureValue(100000000, 0, 10, 12);
    expect(fv).toBeGreaterThan(100000000);
    expect(Math.round(fv)).toBe(110000000);
  });
});
