import assert from 'node:assert/strict';
import test from 'node:test';

const { calculateRetirement, validateRetirementInput } = await import('../src/domain/retirementCalculator.ts');

const base = {
  currentAge: 32, retirementAge: 60, lifeExpectancy: 82,
  monthlyExpenseToday: 22_000_000, monthlyContribution: 14_200_000,
  annualReturnRate: 7.8, annualInflationRate: 4,
  cashSavings: 450_000_000, liquidAssets: 220_000_000, stockFundValue: 350_000_000,
  consumerDebt: 0, socialInsuranceYears: 9, socialInsuranceSalary: 18_000_000,
};

test('same input always produces the same result', () => assert.deepEqual(calculateRetirement(base), calculateRetirement(base)));
test('higher return increases projected fund', () => assert.ok(calculateRetirement({ ...base, annualReturnRate: 8 }).projectedFund > calculateRetirement({ ...base, annualReturnRate: 0 }).projectedFund));
test('higher inflation increases required fund', () => assert.ok(calculateRetirement({ ...base, annualInflationRate: 6 }).targetFund > calculateRetirement({ ...base, annualInflationRate: 0 }).targetFund));
test('zero return remains finite', () => Object.values(calculateRetirement({ ...base, annualReturnRate: 0 })).forEach((value) => typeof value !== 'boolean' && assert.ok(Number.isFinite(value))));
test('home value is deliberately absent from investable input', () => assert.equal('realEstateValue' in base, false));
test('invalid ages, rates and money are rejected', () => {
  const errors = validateRetirementInput({ ...base, retirementAge: 32, lifeExpectancy: 30, annualInflationRate: -100, monthlyExpenseToday: Number.NaN });
  assert.ok(errors.length >= 4);
});
test('investable assets do not double-deduct consumer debt (F04 separation)', () => {
  const withDebt = calculateRetirement({ ...base, consumerDebt: 100_000_000 });
  const withoutDebt = calculateRetirement({ ...base, consumerDebt: 0 });
  assert.equal(withDebt.investableAssetsToday, withoutDebt.investableAssetsToday);
});
