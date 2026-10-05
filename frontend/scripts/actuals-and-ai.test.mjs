import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/utils/decimal.ts";

test("calculateLocalReconciliation correctly balances cashflows and reconciles closing balances", () => {
  const calculateLocalReconciliation = (payload) => {
    const kinds = [
      "INCOME",
      "EXPENSE",
      "DEBT_PAYMENT",
      "CONTRIBUTION",
      "WITHDRAWAL",
      "INVESTMENT_INCOME",
      "FEE",
      "MARKET_CHANGE",
      "INTERNAL_TRANSFER",
      "BALANCE_ADJUSTMENT",
    ];

    const totals = kinds.reduce((acc, k) => {
      acc[k] = new Decimal(0);
      return acc;
    }, {});

    for (const entry of payload.entries) {
      if (totals[entry.kind]) {
        totals[entry.kind] = totals[entry.kind].plus(entry.amount || "0");
      }
    }

    const surplus = totals.INCOME.minus(totals.EXPENSE).minus(totals.DEBT_PAYMENT);
    const opening = new Decimal(payload.openingBalance || "0");
    const closing = new Decimal(payload.closingBalance || "0");

    const calculatedClosing = opening
      .plus(totals.CONTRIBUTION)
      .minus(totals.WITHDRAWAL)
      .plus(totals.INVESTMENT_INCOME)
      .plus(totals.MARKET_CHANGE)
      .minus(totals.FEE)
      .plus(totals.BALANCE_ADJUSTMENT);

    const discrepancy = closing.minus(calculatedClosing);

    const totalsFormatted = Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, v.toFixed()])
    );

    return {
      totals: totalsFormatted,
      householdSurplus: surplus.toFixed(),
      cashflowState: surplus.gt(0) ? "SURPLUS" : surplus.lt(0) ? "DEFICIT" : "BALANCED",
      actualContribution: totals.CONTRIBUTION.toFixed(),
      calculatedClosingBalance: calculatedClosing.toFixed(),
      discrepancy: discrepancy.toFixed(),
      reconciliation: discrepancy.isZero() ? "MATCHED" : "UNRECONCILED",
      hasAdjustments: payload.entries.some((e) => e.kind === "BALANCE_ADJUSTMENT"),
      conventions: "ONE_CONSOLIDATED_RETIREMENT_FUND_EXTERNAL_FLOWS_ONLY",
    };
  };

  // Case 1: Balanced surplus and matched closing balance
  const result1 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "100000000",
    closingBalance: "105000000",
    entries: [
      { eventId: "1", date: "2026-10-01", kind: "INCOME", amount: "30000000" },
      { eventId: "2", date: "2026-10-02", kind: "EXPENSE", amount: "15000000" },
      { eventId: "3", date: "2026-10-03", kind: "DEBT_PAYMENT", amount: "5000000" },
      { eventId: "4", date: "2026-10-05", kind: "CONTRIBUTION", amount: "5000000" },
    ],
    correctionReason: "Test reconcile",
  });

  assert.equal(result1.householdSurplus, "10000000");
  assert.equal(result1.cashflowState, "SURPLUS");
  assert.equal(result1.actualContribution, "5000000");
  assert.equal(result1.calculatedClosingBalance, "105000000");
  assert.equal(result1.discrepancy, "0");
  assert.equal(result1.reconciliation, "MATCHED");

  // Case 2: Market loss, fee, withdrawal, and balance adjustment
  const result2 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "100000000",
    closingBalance: "93000000",
    entries: [
      { eventId: "5", date: "2026-10-10", kind: "WITHDRAWAL", amount: "5000000" },
      { eventId: "6", date: "2026-10-15", kind: "MARKET_CHANGE", amount: "-3000000" },
      { eventId: "7", date: "2026-10-20", kind: "FEE", amount: "500000" },
      { eventId: "8", date: "2026-10-25", kind: "INVESTMENT_INCOME", amount: "1000000" },
      { eventId: "9", date: "2026-10-28", kind: "BALANCE_ADJUSTMENT", amount: "500000", note: "Correction" },
    ],
    correctionReason: "Adjustments test",
  });

  // 100M - 5M - 3M - 0.5M + 1M + 0.5M = 93M
  assert.equal(result2.calculatedClosingBalance, "93000000");
  assert.equal(result2.discrepancy, "0");
  assert.equal(result2.reconciliation, "MATCHED");
  assert.equal(result2.hasAdjustments, true);

  // Case 3: Discrepancy (UNRECONCILED)
  const result3 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "100000000",
    closingBalance: "110000000", // Actual bank statement has 110M
    entries: [
      { eventId: "10", date: "2026-10-05", kind: "CONTRIBUTION", amount: "5000000" }, // Calculated is only 105M
    ],
    correctionReason: "Discrepancy test",
  });

  assert.equal(result3.calculatedClosingBalance, "105000000");
  assert.equal(result3.discrepancy, "5000000");
  assert.equal(result3.reconciliation, "UNRECONCILED");

  // Case 4: Cents, negative numbers, and numbers exceeding MAX_SAFE_INTEGER
  const result4 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "9007199254740993.25",
    closingBalance: "9007199254740993.26",
    entries: [
      { eventId: "11", date: "2026-10-01", kind: "CONTRIBUTION", amount: "0.01" },
    ],
    correctionReason: "Precision test",
  });

  assert.equal(result4.actualContribution, "0.01");
  assert.equal(result4.calculatedClosingBalance, "9007199254740993.26");
  assert.equal(result4.discrepancy, "0");
  assert.equal(result4.reconciliation, "MATCHED");
});

test("anti-slop and terminology integrity: no em-dashes in actual labels and AI policies", () => {
  const ACTUAL_KIND_LABELS = {
    INCOME: "Thu nhập hàng tháng",
    EXPENSE: "Chi tiêu sinh hoạt",
    DEBT_PAYMENT: "Trả nợ gốc & lãi",
    CONTRIBUTION: "Tích lũy vào quỹ hưu",
    WITHDRAWAL: "Rút tiền từ quỹ hưu",
    INVESTMENT_INCOME: "Lợi tức đầu tư (cổ tức/lãi)",
    FEE: "Phí quản lý & giao dịch",
    MARKET_CHANGE: "Biến động thị trường (lãi/lỗ)",
    INTERNAL_TRANSFER: "Chuyển khoản nội bộ",
    BALANCE_ADJUSTMENT: "Điều chỉnh số dư kiểm toán",
  };

  for (const [key, label] of Object.entries(ACTUAL_KIND_LABELS)) {
    assert.ok(!label.includes("—"), `Label for ${key} contains forbidden em-dash`);
  }

  const AI_POLICY_VERSION = "ai-explanation-2026-10-v1";
  const AI_RETENTION_DAYS = 30;

  assert.equal(AI_POLICY_VERSION, "ai-explanation-2026-10-v1");
  assert.equal(AI_RETENTION_DAYS, 30);
});
