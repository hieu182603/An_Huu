import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuickStartProfileV2 } from "../src/services/financialProfile.ts";

test("quick-start profile: không nợ (status NOT_APPLICABLE)", () => {
  const profile = createQuickStartProfileV2({
    birthMonth: "1980-05",
    desiredRetirementMonth: "2040-01",
    monthlyIncome: 25_000_000,
    monthlyExpense: 15_000_000,
    retirementSavings: 100_000_000,
    hasDebt: false,
    valuationDate: "2026-10-01",
  });

  assert.equal(profile.schemaVersion, 2);
  assert.equal(profile.valuationDate, "2026-10-01");
  assert.equal(profile.debts.status, "NOT_APPLICABLE");
  assert.equal(profile.debts.reason, "Người dùng xác nhận không có nợ");
  assert.deepEqual(profile.personal.birthMonth, { status: "KNOWN", value: "1980-05" });
  assert.deepEqual(profile.personal.desiredRetirementMonth, { status: "KNOWN", value: "2040-01" });
  assert.deepEqual(profile.personal.pensionStartMonth, { status: "UNKNOWN" });
  assert.deepEqual(profile.pension, { status: "UNKNOWN" });
});

test("quick-start profile: có nợ (status KNOWN, 1 mục, contract và responsibility UNKNOWN)", () => {
  const profile = createQuickStartProfileV2({
    birthMonth: "1985-08",
    desiredRetirementMonth: "2045-08",
    monthlyIncome: 30_000_000,
    monthlyExpense: 18_000_000,
    retirementSavings: 200_000_000,
    hasDebt: true,
    debtBalance: 150_000_000,
    debtMonthlyPayment: 4_500_000,
    valuationDate: "2026-10-01",
  });

  assert.equal(profile.debts.status, "KNOWN");
  assert.equal(profile.debts.entries.length, 1);
  const debt = profile.debts.entries[0];
  assert.equal(debt.id, "dbt_quick");
  assert.deepEqual(debt.outstandingBalance, { status: "KNOWN", value: "150000000.00" });
  assert.deepEqual(debt.payment, { status: "KNOWN", value: "4500000.00" });
  assert.deepEqual(debt.paymentShare, { status: "KNOWN", value: "1" });
  assert.deepEqual(debt.balanceShare, { status: "KNOWN", value: "1" });
  assert.deepEqual(debt.contract, { status: "UNKNOWN" });
  assert.deepEqual(debt.responsibility, { status: "UNKNOWN" });
});

test("quick-start profile: thu nhập 0 -> entries rỗng", () => {
  const profile = createQuickStartProfileV2({
    birthMonth: "1970-01",
    desiredRetirementMonth: "2026-10",
    monthlyIncome: 0,
    monthlyExpense: 12_000_000,
    retirementSavings: 500_000_000,
    hasDebt: false,
    valuationDate: "2026-10-01",
  });

  assert.equal(profile.income.status, "KNOWN");
  assert.equal(profile.income.entries.length, 0);
});

test("quick-start profile: tiền để dành 0 -> entries rỗng", () => {
  const profile = createQuickStartProfileV2({
    birthMonth: "1990-03",
    desiredRetirementMonth: "2050-03",
    monthlyIncome: 20_000_000,
    monthlyExpense: 10_000_000,
    retirementSavings: 0,
    hasDebt: false,
    valuationDate: "2026-10-01",
  });

  assert.equal(profile.assets.status, "KNOWN");
  assert.equal(profile.assets.entries.length, 0);
});

test("quick-start profile: retirementShare = 1 mặc định và UNKNOWN khi được yêu cầu", () => {
  const profileDefault = createQuickStartProfileV2({
    birthMonth: "1988-12",
    desiredRetirementMonth: "2048-12",
    monthlyIncome: 35_000_000,
    monthlyExpense: 20_000_000,
    retirementSavings: 300_000_000,
    hasDebt: false,
    valuationDate: "2026-10-01",
  });

  assert.equal(profileDefault.assets.entries.length, 1);
  const asset = profileDefault.assets.entries[0];
  assert.deepEqual(asset.retirementShare, { status: "KNOWN", value: "1" });
  assert.deepEqual(asset.emergencyShare, { status: "KNOWN", value: "0" });
  assert.deepEqual(asset.otherGoalsShare, { status: "KNOWN", value: "0" });
  assert.deepEqual(asset.ownershipShare, { status: "KNOWN", value: "1" });
  assert.deepEqual(asset.liquidity, { status: "KNOWN", value: "LIQUID" });

  const profileUnknown = createQuickStartProfileV2({
    birthMonth: "1988-12",
    desiredRetirementMonth: "2048-12",
    monthlyIncome: 35_000_000,
    monthlyExpense: 20_000_000,
    retirementSavings: 300_000_000,
    hasDebt: false,
    valuationDate: "2026-10-01",
    retirementShare: "UNKNOWN",
  });
  assert.deepEqual(profileUnknown.assets.entries[0].retirementShare, { status: "UNKNOWN" });
});

test("quick-start profile: pension luôn UNKNOWN trừ khi có cấu hình riêng", () => {
  const profile = createQuickStartProfileV2({
    birthMonth: "1985-05",
    desiredRetirementMonth: "2045-05",
    monthlyIncome: 25_000_000,
    monthlyExpense: 15_000_000,
    retirementSavings: 150_000_000,
    hasDebt: false,
    valuationDate: "2026-10-01",
  });

  assert.deepEqual(profile.pension, { status: "UNKNOWN" });
  assert.deepEqual(profile.personal.pensionStartMonth, { status: "UNKNOWN" });
});

test("quick-start profile: hasDebt không truyền (màn 1 chưa hỏi nợ) -> debts status UNKNOWN", () => {
  const profile = createQuickStartProfileV2({
    birthMonth: "1985-05",
    desiredRetirementMonth: "2045-05",
    monthlyIncome: 0,
    monthlyExpense: 15_000_000,
    retirementSavings: 0,
    valuationDate: "2026-10-01",
  });

  assert.deepEqual(profile.debts, { status: "UNKNOWN" });
});

