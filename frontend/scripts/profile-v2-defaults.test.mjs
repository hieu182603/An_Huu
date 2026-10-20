import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultProfileV2 } from "../src/services/financialProfile.ts";
import { hasMissingProfileValue } from "../src/utils/profileCompletion.ts";

const v1 = (over = {}) => ({
  personal: { name: "", email: "", phone: "", city: "Hà Nội", age: 45, gender: "male", maritalStatus: "married", dependents: 1 },
  income: { primaryIncome: 30_000_000, secondaryIncome: 0 },
  expenses: { essentialExpense: 12_000_000, lifestyleExpense: 3_000_000 },
  assets: { cashSavings: 200_000_000, realEstateValue: 2_000_000_000, liquidAssets: 0, stockFundValue: 50_000_000 },
  debt: { hasDebt: true, mortgageDebt: 500_000_000, consumerDebt: 0, monthlyDebtService: 8_000_000 },
  socialSecurity: { socialInsuranceYears: 10, socialInsuranceSalary: 15_000_000 },
  goal: { targetRetireAge: 60, monthlyExpenseInRetirement: 15_000_000 },
  plan: { monthlySavings: 5_000_000 },
  ...over,
});

test("upgrade never invents birth, retirement or pension months", () => {
  const v2 = createDefaultProfileV2(v1());
  assert.deepEqual(v2.personal.birthMonth, { status: "UNKNOWN" });
  assert.deepEqual(v2.personal.desiredRetirementMonth, { status: "UNKNOWN" });
  assert.deepEqual(v2.personal.pensionStartMonth, { status: "UNKNOWN" });
  // Same result with a missing age: no 30-year default.
  assert.deepEqual(createDefaultProfileV2(v1({ personal: { ...v1().personal, age: 0 } })).personal.birthMonth, { status: "UNKNOWN" });
});
test("declared amounts stay KNOWN; allocation, ownership and loan responsibility are left for review", () => {
  const v2 = createDefaultProfileV2(v1());
  const cash = v2.assets.entries.find(a => a.type === "CASH");
  assert.deepEqual(cash.value, { status: "KNOWN", value: "200000000.00" });
  for (const asset of v2.assets.entries)
    for (const key of ["ownershipShare", "retirementShare", "emergencyShare", "otherGoalsShare"]) assert.deepEqual(asset[key], { status: "UNKNOWN" }, `${asset.id}.${key}`);
  assert.deepEqual(v2.assets.entries.find(a => a.type === "REAL_ESTATE").availableFromMonth, { status: "UNKNOWN" });
  const [mortgage] = v2.debts.entries;
  assert.deepEqual(mortgage.payment, { status: "KNOWN", value: "8000000.00" }); // only one loan: total service is its payment
  assert.deepEqual(mortgage.responsibility, { status: "UNKNOWN" });
});
test("a single debt-service total is not split across two loans", () => {
  const v2 = createDefaultProfileV2(v1({ debt: { hasDebt: true, mortgageDebt: 500_000_000, consumerDebt: 20_000_000, monthlyDebtService: 8_000_000 } }));
  assert.deepEqual(v2.debts.entries.map(d => d.payment), [{ status: "UNKNOWN" }, { status: "UNKNOWN" }]);
});

test("loan with required fields KNOWN and contract/responsibility UNKNOWN is not missing", () => {
  const completeLoan = {
    id: "dbt_1",
    label: "Vay mua nhà",
    currency: "VND",
    frequency: "MONTHLY",
    outstandingBalance: { status: "KNOWN", value: "500000000.00" },
    balanceAsOf: { status: "KNOWN", value: "2026-10-20" },
    payment: { status: "KNOWN", value: "8000000.00" },
    paymentShare: { status: "KNOWN", value: "1.0000" },
    balanceShare: { status: "KNOWN", value: "1.0000" },
    contract: { status: "UNKNOWN" },
    responsibility: { status: "UNKNOWN" },
    startMonth: "2026-01",
    endMonth: null,
  };
  assert.equal(hasMissingProfileValue({ status: "KNOWN", entries: [completeLoan] }), false);
  assert.equal(hasMissingProfileValue(completeLoan), false);
});

test("loan missing outstandingBalance is reported as missing", () => {
  const missingBalanceLoan = {
    id: "dbt_1",
    label: "Vay mua nhà",
    currency: "VND",
    frequency: "MONTHLY",
    outstandingBalance: { status: "UNKNOWN" },
    balanceAsOf: { status: "KNOWN", value: "2026-10-20" },
    payment: { status: "KNOWN", value: "8000000.00" },
    paymentShare: { status: "KNOWN", value: "1.0000" },
    balanceShare: { status: "KNOWN", value: "1.0000" },
    contract: { status: "UNKNOWN" },
    responsibility: { status: "UNKNOWN" },
    startMonth: "2026-01",
    endMonth: null,
  };
  assert.equal(hasMissingProfileValue({ status: "KNOWN", entries: [missingBalanceLoan] }), true);
  assert.equal(hasMissingProfileValue(missingBalanceLoan), true);
});

test("debts with status UNKNOWN is missing; NOT_APPLICABLE with reason is not missing", () => {
  assert.equal(hasMissingProfileValue({ status: "UNKNOWN" }), true);
  assert.equal(hasMissingProfileValue({ status: "NOT_APPLICABLE", reason: "Người dùng xác nhận không có khoản nợ" }), false);
  assert.equal(hasMissingProfileValue({ status: "NOT_APPLICABLE", reason: "" }), true);
  assert.equal(hasMissingProfileValue({ status: "NOT_APPLICABLE" }), true);
});

test("asset with required fields KNOWN and costBasis UNKNOWN is not missing", () => {
  const completeAsset = {
    id: "ast_1",
    label: "Cổ phiếu & Quỹ đầu tư",
    type: "STOCK_FUND",
    value: { status: "KNOWN", value: "50000000.00" },
    currency: "VND",
    valuedOn: { status: "KNOWN", value: "2026-10-20" },
    ownershipShare: { status: "KNOWN", value: "1.0000" },
    retirementShare: { status: "KNOWN", value: "1.0000" },
    emergencyShare: { status: "KNOWN", value: "0.0000" },
    otherGoalsShare: { status: "KNOWN", value: "0.0000" },
    liquidity: { status: "KNOWN", value: "LIQUID" },
    availableFromMonth: { status: "KNOWN", value: "2026-10" },
    costBasis: { status: "UNKNOWN" },
  };
  assert.equal(hasMissingProfileValue({ status: "KNOWN", entries: [completeAsset] }), false);
  assert.equal(hasMissingProfileValue(completeAsset), false);
});

