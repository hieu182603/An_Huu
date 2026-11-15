import { test } from "node:test";
import assert from "node:assert/strict";
import { allocationExpenseChanges } from "../src/utils/allocationExpenses.ts";
const entry = (id, value, extra = {}) => ({ id, label: id, category: "ESSENTIAL", amount: { status: "KNOWN", value }, currency: "VND", startMonth: "2026-01", endMonth: null, frequency: "MONTHLY", ...extra });
const profile = (...entries) => ({ valuationDate: "2026-11-14", expenses: { status: "KNOWN", entries } });
test("editing essential totals preserves care, debt, future expenses and source schedules", () => {
  const p = profile(entry("a", "10"), entry("b", "20"), entry("care", "7", { category: "DEPENDENT" }), entry("future", "8", { startMonth: "2027-01" }));
  const before = structuredClone(p), rows = allocationExpenseChanges(p, "20");
  assert.deepEqual(rows.map(row => row.amount.value), ["6.66", "13.34", "7", "8"]);
  assert.deepEqual(rows[2], p.expenses.entries[2]); assert.deepEqual(rows[3], p.expenses.entries[3]); assert.deepEqual(p, before);
});
test("zero budgets can be declared and amounts above safe integer remain exact", () => {
  const p = profile(entry("a", "0"), entry("b", "0"));
  assert.deepEqual(allocationExpenseChanges(p, "9007199254740993.01").map(row => row.amount.value), ["9007199254740993.01", "0.00"]);
  assert.deepEqual(allocationExpenseChanges(p, "0").map(row => row.amount.value), ["0.00", "0.00"]);
});
test("ambiguous active schedules are never silently rewritten", () => {
  assert.equal(allocationExpenseChanges(profile(entry("a", "1", { frequency: "ONCE" })), "2"), null);
  assert.equal(allocationExpenseChanges(profile(entry("a", "1", { amount: { status: "UNKNOWN" } })), "2"), null);
  assert.equal(allocationExpenseChanges({ valuationDate: "2026-11-14", expenses: { status: "UNKNOWN" } }, "2"), null);
});
