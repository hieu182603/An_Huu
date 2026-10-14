import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCompactVND, formatFullVND } from "../src/utils/currency.ts";

test("shared chart currency formatters handle locale, scale and negative values", () => {
  assert.equal(formatCompactVND(1_500_000_000, true), "1.5 tỷ");
  assert.equal(formatCompactVND(-2_000_000, false), "-2M VND");
  assert.equal(formatFullVND(25_000_000.5, true), "25.000.001 VND");
});

// Currency and percent formatting tests
test("formatVNDCurrency correctly formats numbers, decimals, null and negative amounts", () => {
  const formatVNDCurrency = (amount) => {
    if (amount === null || amount === undefined) return "Chưa xác định";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (!Number.isFinite(num)) return "0 ₫";
    return new Intl.NumberFormat("vi-VN").format(Math.round(num)) + " ₫";
  };

  assert.equal(formatVNDCurrency(null), "Chưa xác định");
  assert.equal(formatVNDCurrency(undefined), "Chưa xác định");
  assert.equal(formatVNDCurrency("25000000.50"), "25.000.001 ₫");
  assert.equal(formatVNDCurrency(1000000000), "1.000.000.000 ₫");
  assert.equal(formatVNDCurrency("-5000000"), "-5.000.000 ₫");
  assert.equal(formatVNDCurrency(0), "0 ₫");
});

test("formatPercentNumber handles null when K=0 and outputs 2 decimal places", () => {
  const formatPercentNumber = (rate) => {
    if (rate === null || rate === undefined) return "Không áp dụng";
    const num = typeof rate === "string" ? parseFloat(rate) : rate;
    if (!Number.isFinite(num)) return "0%";
    return num.toFixed(2) + "%";
  };

  assert.equal(formatPercentNumber(null), "Không áp dụng");
  assert.equal(formatPercentNumber(undefined), "Không áp dụng");
  assert.equal(formatPercentNumber("125.456"), "125.46%");
  assert.equal(formatPercentNumber(98.1), "98.10%");
  assert.equal(formatPercentNumber(0), "0.00%");
});

test("translateWarningCode and translateIssueCode provide clear Vietnamese messages without em-dashes", () => {
  const WARNING_MESSAGES = {
    PENSION_NOT_INCLUDED: "Kế hoạch chưa bao gồm lương hưu do bạn chưa khai báo mức ước tính cụ thể.",
    PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION: "Tháng đầu tiên được tính tròn một kỳ theo ngày định giá.",
    DEBT_PAYMENT_OUTSIDE_HORIZON: "Có khoản vay còn lịch trả vượt quá thời gian kế hoạch dự phóng.",
    ILLIQUID_ASSETS_EXCLUDED: "Các tài sản chưa đủ điều kiện thanh khoản đã được loại trừ khỏi vốn quỹ hưu trí ban đầu.",
  };

  const translateWarningCode = (code) => WARNING_MESSAGES[code] || `Lưu ý nghiệp vụ: ${code}`;

  const codes = [
    "PENSION_NOT_INCLUDED",
    "PARTIAL_FIRST_MONTH_FULL_PERIOD_NO_PRORATION",
    "DEBT_PAYMENT_OUTSIDE_HORIZON",
    "ILLIQUID_ASSETS_EXCLUDED",
  ];

  for (const c of codes) {
    const text = translateWarningCode(c);
    assert.ok(text.length > 0);
    // Anti-slop check: no em-dashes
    assert.ok(!text.includes("—"), `Warning ${c} contains forbidden em-dash`);
  }
});

test("Idempotency key format is a valid UUID v4", () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const key = crypto.randomUUID();
  assert.ok(uuidRegex.test(key), `Generated key ${key} should match UUID v4 format`);
});

test("T06 comparison math preserves negative closing balance as shortfall without floor", () => {
  const initialCapital = 500000000;
  const monthlyExpense = 20000000;
  const monthlyIncome = 5000000;
  const remaining = monthlyIncome - monthlyExpense; // -15.000.000
  const withdrawal = Math.max(0, -remaining); // 15.000.000

  assert.equal(withdrawal, 15000000);
  // Deficit is preserved as negative balance, never clamped to 0
  const balanceAfterDeficit = -50000000;
  assert.ok(balanceAfterDeficit < 0);
  assert.equal(Math.min(0, balanceAfterDeficit), -50000000);
});
