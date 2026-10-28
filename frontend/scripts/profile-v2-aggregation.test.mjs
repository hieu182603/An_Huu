import { test } from "node:test";
import assert from "node:assert/strict";
import { profileFromV2 } from "../src/services/financialProfile.ts";

const emptyBase = {
  personal: { name: "", email: "", phone: "", city: "", age: 0, gender: "", maritalStatus: "", dependents: 0 },
  income: { primaryIncome: 0, secondaryIncome: 0 },
  expenses: { essentialExpense: 0, lifestyleExpense: 0 },
  assets: { cashSavings: 0, realEstateValue: 0, liquidAssets: 0, stockFundValue: 0 },
  debt: { hasDebt: false, mortgageDebt: 0, consumerDebt: 0, monthlyDebtService: 0 },
  socialSecurity: { socialInsuranceYears: 0, socialInsuranceSalary: 0 },
  goal: { targetRetireAge: 60, lifeExpectancy: 85, lifestyle: "standard", monthlyExpenseInRetirement: 0, inflationRate: 0, investmentReturn: 0 },
  plan: { targetFund: 0, projectedFund: 0, monthlySavings: 0, readinessScore: 0, lastUpdated: "" },
};

test("profileFromV2 calculates age, active monthly cashflows, asset shares and debt shares correctly", () => {
  const exampleV2 = {
    schemaVersion: 2,
    valuationDate: "2026-10-22",
    currency: "VND",
    periodUnit: "MONTH",
    personal: {
      birthMonth: { status: "KNOWN", value: "1976-11" },
      desiredRetirementMonth: { status: "KNOWN", value: "2036-11" },
      pensionStartMonth: { status: "UNKNOWN" },
    },
    income: {
      status: "KNOWN",
      entries: [
        {
          id: "inc_salary",
          label: "Lương",
          kind: "FIXED",
          source: "EMPLOYMENT",
          basis: "DISPOSABLE",
          amount: { status: "KNOWN", value: "30000000" },
          currency: "VND",
          startMonth: "2026-01",
          endMonth: null,
          frequency: "MONTHLY",
        },
        {
          id: "inc_bonus",
          label: "Thưởng",
          kind: "BONUS",
          source: "EMPLOYMENT",
          basis: "DISPOSABLE",
          amount: { status: "KNOWN", value: "20000000" },
          currency: "VND",
          startMonth: "2027-01",
          endMonth: null,
          frequency: "ONCE",
        },
      ],
    },
    expenses: {
      status: "KNOWN",
      entries: [
        {
          id: "exp_essential",
          label: "Chi tiêu thiết yếu",
          category: "ESSENTIAL",
          amount: { status: "KNOWN", value: "15000000" },
          currency: "VND",
          startMonth: "2026-01",
          endMonth: null,
          frequency: "MONTHLY",
        },
        {
          id: "exp_lifestyle",
          label: "Chi tiêu lối sống",
          category: "OPTIONAL",
          amount: { status: "KNOWN", value: "3000000" },
          currency: "VND",
          startMonth: "2026-01",
          endMonth: null,
          frequency: "MONTHLY",
        },
      ],
    },
    assets: {
      status: "KNOWN",
      entries: [
        {
          id: "ast_deposit",
          label: "Tiền gửi",
          type: "DEPOSIT",
          value: { status: "KNOWN", value: "500000000" },
          currency: "VND",
          ownershipShare: { status: "KNOWN", value: "1" },
          valuedOn: { status: "KNOWN", value: "2026-10-22" },
          retirementShare: { status: "KNOWN", value: "1" },
          emergencyShare: { status: "UNKNOWN" },
          otherGoalsShare: { status: "UNKNOWN" },
          liquidity: { status: "KNOWN", value: "LIQUID" },
          availableFromMonth: { status: "KNOWN", value: "2026-10" },
        },
        {
          id: "ast_house",
          label: "Nhà",
          type: "REAL_ESTATE",
          value: { status: "KNOWN", value: "3000000000" },
          currency: "VND",
          ownershipShare: { status: "KNOWN", value: "0.5" },
          valuedOn: { status: "KNOWN", value: "2026-10-22" },
          retirementShare: { status: "UNKNOWN" },
          emergencyShare: { status: "UNKNOWN" },
          otherGoalsShare: { status: "UNKNOWN" },
          liquidity: { status: "KNOWN", value: "ILLIQUID" },
          availableFromMonth: { status: "KNOWN", value: "2026-10" },
        },
      ],
    },
    debts: {
      status: "KNOWN",
      entries: [
        {
          id: "dbt_loan",
          label: "Vay mua nhà",
          outstandingBalance: { status: "KNOWN", value: "120000000" },
          balanceAsOf: { status: "KNOWN", value: "2026-10-22" },
          currency: "VND",
          payment: { status: "KNOWN", value: "5000000" },
          paymentShare: { status: "KNOWN", value: "0.5" },
          balanceShare: { status: "KNOWN", value: "0.5" },
          startMonth: "2026-01",
          endMonth: "2030-01",
          frequency: "MONTHLY",
          responsibility: { status: "UNKNOWN" },
        },
      ],
    },
  };

  const p = profileFromV2(emptyBase, exampleV2);

  // 1. Tuổi: sinh 11/1976, tháng 10/2026 -> 49 tuổi
  assert.equal(p.personal.age, 49, "Age should be 49 because birthday month (11) is after current month (10)");

  // 2. Thu nhập: chỉ lương 30tr, bỏ qua thưởng 20tr một lần vào 01/2027
  const totalIncome = p.income.primaryIncome + p.income.secondaryIncome;
  assert.equal(totalIncome, 30_000_000, "Monthly income should only include 30M active salary");

  // 3. Chi tiêu: 15tr + 3tr = 18tr
  const totalExpense = p.expenses.essentialExpense + p.expenses.lifestyleExpense;
  assert.equal(totalExpense, 18_000_000, "Monthly expense should be 18M");

  // 4. Trả nợ mỗi tháng: 5tr * 0.5 = 2.5tr
  assert.equal(p.debt.monthlyDebtService, 2_500_000, "Monthly debt service should be 2.5M (5M * 50%)");

  // 5. Thặng dư mỗi tháng: 30tr - 18tr - 2.5tr = 9.500.000
  const monthlySurplus = totalIncome - totalExpense - p.debt.monthlyDebtService;
  assert.equal(monthlySurplus, 9_500_000, "Monthly surplus should be 9.5M");

  // 6. Tài sản: tiền gửi 500tr (100%) + nhà 3 tỷ * 50% = 2 tỷ
  const totalAssets = Object.values(p.assets).reduce((a, b) => a + b, 0);
  assert.equal(totalAssets, 2_000_000_000, "Total assets should be 2B (500M + 3B * 50%)");

  // 7. Tổng nợ: 120tr * 50% = 60tr
  const totalDebt = p.debt.mortgageDebt + p.debt.consumerDebt;
  assert.equal(totalDebt, 60_000_000, "Total debt should be 60M (120M * 50%)");

  // 8. Tài sản ròng: 2 tỷ - 60tr = 1.940.000.000 (1,94 tỷ)
  const netWorth = totalAssets - totalDebt;
  assert.equal(netWorth, 1_940_000_000, "Net worth should be 1.94B");
});
