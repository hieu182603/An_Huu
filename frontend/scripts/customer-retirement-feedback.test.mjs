import { test } from "node:test";
import assert from "node:assert/strict";
import { planVersionName } from "../src/utils/planVersionName.ts";

test("saved plan names share pinned age and compact contribution across banner, history and report", () => {
  assert.equal(planVersionName(1, "1990-06", "2050-06", "7500000"), "Phương án 1 (Phiên bản 1 · Nghỉ 60 tuổi, góp 7,5 triệu/tháng)");
  assert.equal(planVersionName(2, "1990-06", "2050-05", "0"), "Phương án 2 (Phiên bản 2 · Nghỉ 59 tuổi, góp 0/tháng)");
  assert.equal(planVersionName(3, null, "2050-06", null), "Phương án 3 (Phiên bản 3, góp Chưa xác định/tháng)");
});
import { createQuickStartProfileV2 } from "../src/services/financialProfile.ts";
import { initialPlanSelection } from "../src/services/initialPlanSelection.ts";
import { illustrativeRetirementEnd, projectionHorizonLabel } from "../src/utils/retirementHorizon.ts";

const input = { birthMonth: "1991-11", desiredRetirementMonth: "2056-11", monthlyIncome: 80000000, monthlyExpense: 30000000, retirementSavings: 100000000, hasDebt: true, debtBalance: 100000000, debtMonthlyPayment: 10000000, valuationDate: "2026-11-01" };
test("declared support is split once if included, added if separate, and keeps its own end month", () => {
  for (const includedInExpense of [true, false]) {
    const p = createQuickStartProfileV2({ ...input, support: [{ kind: "parent", amount: 3000000, endMonth: "2030-12", includedInExpense }] });
    assert.equal(p.expenses.entries.reduce((s, e) => s + Number(e.amount.value), 0), includedInExpense ? 30000000 : 33000000);
    assert.equal(p.expenses.entries.find(e => e.id === "exp_quick_parent").endMonth, "2030-12");
    const selection = initialPlanSelection(p, 1, "test", "2076-10", "30000000", []);
    assert.deepEqual(selection.retirementAdditionalExpenseIds, ["exp_quick_parent"]);
  }
});
test("included support cannot silently exceed total spending; unknown end remains unknown", () => {
  assert.throws(() => createQuickStartProfileV2({ ...input, support: [{ kind: "parent", amount: 31000000, endMonth: null, includedInExpense: true }] }));
  const p = createQuickStartProfileV2({ ...input, support: [{ kind: "parent", amount: 3000000, endMonth: null, includedInExpense: true }] });
  assert.equal(p.expenses.entries[1].endMonth, null);
});
test("loan illustration preserves the declared rate including explicit zero without inventing a contract", () => {
  for (const rate of ["0", "8.5"]) {
    const p = createQuickStartProfileV2({ ...input, debtAnnualRatePercent: rate });
    assert.deepEqual(p.debts.entries[0].illustration.annualRatePercent, { status: "KNOWN", value: rate });
    assert.deepEqual(p.debts.entries[0].contract, { status: "UNKNOWN" });
  }
  assert.equal(createQuickStartProfileV2(input).debts.entries[0].illustration, undefined);
});
test("the demo horizon ends before the 85th birthday using an inclusive end month", () => {
  assert.equal(illustrativeRetirementEnd("1991-11"), "2076-10");
  assert.equal(illustrativeRetirementEnd("1991-01"), "2075-12");
  assert.equal(illustrativeRetirementEnd("1943-11"), "2028-10");
  assert.equal(illustrativeRetirementEnd(""), "");
  assert.equal(illustrativeRetirementEnd("1991-13"), "");
});

test("chart subtitles show age 85 only for that actual horizon, and preserve custom or legacy end months", () => {
  assert.equal(projectionHorizonLabel("2075-05", "1990-06"), "85 tuổi");
  assert.equal(projectionHorizonLabel("2075-05", "1990-06", true), "age 85");
  assert.equal(projectionHorizonLabel("2027-03", "1990-06"), "03/2027");
  assert.equal(projectionHorizonLabel("2075-06", "1990-06"), "06/2075");
  assert.equal(projectionHorizonLabel("2027-03"), "03/2027");
});
test("a fresh plan restores the declared contribution from the server profile", () => {
  const p = createQuickStartProfileV2(input);
  p.retirementGoal = { endMonth: "2076-10", monthlyExpenseToday: "30000000", monthlyContribution: "5000000", lifestylePriority: null };
  assert.equal(initialPlanSelection(p, 1, "test", "2076-10", "30000000", []).monthlyContribution, "5000000");
});
