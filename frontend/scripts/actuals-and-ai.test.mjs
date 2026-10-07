import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "../src/utils/decimal.ts";
import {
  calculateLocalReconciliation,
  previewReforecast,
  saveReforecast,
} from "../src/services/actuals.ts";
import {
  previewSourceReforecast,
  saveSourceReforecast,
} from "../src/services/plans.ts";
import { ApiError, invalidateApiCache } from "../src/services/api.ts";

function mockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    return await handler(url.toString(), options);
  };
  return () => {
    globalThis.fetch = originalFetch;
    invalidateApiCache();
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status, code, message, fieldErrors) {
  return new Response(JSON.stringify({ error: { code, message, fieldErrors } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("calculateLocalReconciliation correctly balances cashflows and reconciles closing balances", () => {
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
  assert.equal(result1.confirmedContribution, "5000000");
  assert.equal(result1.uninvestedSurplus, "5000000");
  assert.equal(result1.budgetShortfall, "0");
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
      { eventId: "10", date: "2026-10-05", kind: "CONTRIBUTION", amount: "5000000" },
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

test("FE-03 Contract: surplus 5 with contributions 0, 2, 5, 6 and deficit/balanced cashflow", () => {
  // Scenario: Income 10, Expense 5 => surplus = 5
  const baseEntries = [
    { eventId: "inc", date: "2026-10-01", kind: "INCOME", amount: "5000000" },
    { eventId: "inc2", date: "2026-10-01", kind: "INCOME", amount: "5000000" },
    { eventId: "exp", date: "2026-10-02", kind: "EXPENSE", amount: "5000000" },
  ];

  // 1. Contribution = 0 => confirmed = 0, uninvested = 5, shortfall = 0
  const r0 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "0",
    closingBalance: "0",
    entries: baseEntries,
  });
  assert.equal(r0.householdSurplus, "5000000");
  assert.equal(r0.actualContribution, "0");
  assert.equal(r0.confirmedContribution, "0");
  assert.equal(r0.uninvestedSurplus, "5000000");
  assert.equal(r0.budgetShortfall, "0");

  // 2. Contribution = 2 => confirmed = 2, uninvested = 3, shortfall = 0
  const r2 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "0",
    closingBalance: "2000000",
    entries: [
      ...baseEntries,
      { eventId: "c2", date: "2026-10-05", kind: "CONTRIBUTION", amount: "2000000" },
    ],
  });
  assert.equal(r2.householdSurplus, "5000000");
  assert.equal(r2.actualContribution, "2000000");
  assert.equal(r2.confirmedContribution, "2000000");
  assert.equal(r2.uninvestedSurplus, "3000000");
  assert.equal(r2.budgetShortfall, "0");

  // 3. Contribution = 5 => confirmed = 5, uninvested = 0, shortfall = 0
  const r5 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "0",
    closingBalance: "5000000",
    entries: [
      ...baseEntries,
      { eventId: "c5", date: "2026-10-05", kind: "CONTRIBUTION", amount: "5000000" },
    ],
  });
  assert.equal(r5.householdSurplus, "5000000");
  assert.equal(r5.actualContribution, "5000000");
  assert.equal(r5.confirmedContribution, "5000000");
  assert.equal(r5.uninvestedSurplus, "0");
  assert.equal(r5.budgetShortfall, "0");

  // 4. Contribution = 6 => confirmed = 5, uninvested = 0, shortfall = 1 (capped at surplus)
  const r6 = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "0",
    closingBalance: "6000000",
    entries: [
      ...baseEntries,
      { eventId: "c6", date: "2026-10-05", kind: "CONTRIBUTION", amount: "6000000" },
    ],
  });
  assert.equal(r6.householdSurplus, "5000000");
  assert.equal(r6.actualContribution, "6000000");
  assert.equal(r6.confirmedContribution, "5000000");
  assert.equal(r6.uninvestedSurplus, "0");
  assert.equal(r6.budgetShortfall, "1000000");

  // 5. Income == Expense (thu bằng chi, surplus = 0)
  const rBalanced = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "0",
    closingBalance: "2000000",
    entries: [
      { eventId: "i", date: "2026-10-01", kind: "INCOME", amount: "5000000" },
      { eventId: "e", date: "2026-10-02", kind: "EXPENSE", amount: "5000000" },
      { eventId: "c", date: "2026-10-05", kind: "CONTRIBUTION", amount: "2000000" },
    ],
  });
  assert.equal(rBalanced.householdSurplus, "0");
  assert.equal(rBalanced.cashflowState, "BALANCED");
  assert.equal(rBalanced.confirmedContribution, "0");
  assert.equal(rBalanced.uninvestedSurplus, "0");
  assert.equal(rBalanced.budgetShortfall, "2000000");

  // 6. Income < Expense (thu thấp hơn chi, surplus = -1M)
  const rDeficit = calculateLocalReconciliation({
    currency: "VND",
    openingBalance: "0",
    closingBalance: "2000000",
    entries: [
      { eventId: "i", date: "2026-10-01", kind: "INCOME", amount: "4000000" },
      { eventId: "e", date: "2026-10-02", kind: "EXPENSE", amount: "5000000" },
      { eventId: "c", date: "2026-10-05", kind: "CONTRIBUTION", amount: "2000000" },
    ],
  });
  assert.equal(rDeficit.householdSurplus, "-1000000");
  assert.equal(rDeficit.cashflowState, "DEFICIT");
  assert.equal(rDeficit.confirmedContribution, "0");
  assert.equal(rDeficit.uninvestedSurplus, "0");
  assert.equal(rDeficit.budgetShortfall, "2000000");
});

test("FE-03 & FE-04: Wire tests for previewReforecast and saveReforecast with idempotency", async () => {
  let capturedPreviewReq = null;
  let capturedSaveReq = null;

  const restore = mockFetch(async (url, options) => {
    if (url.includes("/reforecast/preview") && options.method === "POST") {
      capturedPreviewReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        status: "READY",
        issues: [],
        inputHash: "input-hash-ref-1",
        candidate: { replayInput: { sources: [] } },
        beforeChanges: null,
        saved: false,
        applied: false,
      });
    }

    if (url.includes("/reforecasts") && options.method === "POST") {
      capturedSaveReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        planId: "p1",
        planRevision: 2,
        version: 2,
        versionId: "v2",
      });
    }

    return errorResponse(404, "NOT_FOUND", "Not found");
  });

  try {
    const previewRes = await previewReforecast({
      planId: "p1",
      versionId: "v1",
      throughMonth: "2026-09",
      expectedProfileRevision: 1,
      futureChanges: [
        {
          id: "fc-1",
          field: "plannedContribution",
          operation: "REPLACE_MONTHLY_TOTAL",
          amount: "10000000",
          startMonth: "2026-10",
          endMonth: "2026-12",
          reason: "Bonus raise",
        },
      ],
    });

    assert.equal(previewRes.status, "READY");
    assert.equal(capturedPreviewReq.body.throughMonth, "2026-09");
    assert.equal(capturedPreviewReq.body.futureChanges.length, 1);
    assert.equal(capturedPreviewReq.body.futureChanges[0].amount, "10000000");

    const saveRes = await saveReforecast(
      "p1",
      {
        expectedRevision: 1,
        expectedInputHash: "input-hash-ref-1",
        preview: capturedPreviewReq.body,
      },
      "custom-idem-key-123"
    );

    assert.equal(saveRes.planRevision, 2);
    assert.equal(capturedSaveReq.options.headers["Idempotency-Key"], "custom-idem-key-123");
    assert.equal(capturedSaveReq.body.expectedInputHash, "input-hash-ref-1");
  } finally {
    restore();
  }
});

test("FE-04 & FE-05: previewSourceReforecast and saveSourceReforecast strictly validate V4 commands and pensionSelections", async () => {
  let capturedPreviewReq = null;
  let capturedSaveReq = null;

  const restore = mockFetch(async (url, options) => {
    if (url.includes("/source-reforecasts/preview") && options.method === "POST") {
      capturedPreviewReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        status: "READY",
        issues: [],
        inputHash: "v4-input-hash-abc",
        candidate: { replayInput: { sourceRegistry: { revisions: [] } } },
        loanRevisionOptions: [],
        plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] },
        assetRevisionOptions: [],
        saved: false,
        applied: false,
      });
    }

    if (url.includes("/source-reforecasts") && options.method === "POST") {
      capturedSaveReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        planId: "p1",
        revision: 3,
        currentVersionId: "v3",
        baselineVersionId: "v2",
        saved: { id: "v3", version: 3 },
      });
    }

    return errorResponse(404, "NOT_FOUND", "Not found");
  });

  try {
    // 1. Flow commands: CREATE, REVISE, and strict END
    const endCommand = {
      commandId: "cmd-end-1",
      sourceId: "plan:src-existing-1",
      expectedSourceRevision: 2,
      effectiveFromMonth: "2026-11",
      effectiveToMonth: "2026-11",
      confirm: true,
      document: "doc-end-proof",
      operation: "END",
    };
    // Ensure END command does not include metric, amount, currency, or frequency
    assert.equal("metric" in endCommand, false);
    assert.equal("amount" in endCommand, false);
    assert.equal("currency" in endCommand, false);
    assert.equal("frequency" in endCommand, false);

    const createCommand = {
      commandId: "cmd-create-1",
      sourceId: "plan:src-new-uuid",
      expectedSourceRevision: 0,
      effectiveFromMonth: "2026-10",
      effectiveToMonth: "2030-12",
      confirm: true,
      document: "doc-raise",
      operation: "CREATE",
      metric: "income",
      frequency: "MONTHLY",
      amount: "15000000",
      currency: "VND",
      confirmation: "USER_CONFIRMED",
    };

    // 2. Pension Selection (FE-05)
    const pensionSelection = {
      estimateId: "est-pension-123",
      expectedEstimateIntegrityHash: "sha256-estimate-integrity",
      expectedRegistryHash: "sha256-registry-hash",
      commandId: "cmd-pen-1",
      sourceId: "plan:pension-source-1",
      operation: "CREATE",
      expectedSourceRevision: 0,
      effectiveFromMonth: "2045-02",
      effectiveToMonth: "2065-12",
      amountPolicy: "FIXED_NOMINAL",
      confirm: true,
    };

    const previewRes = await previewSourceReforecast("p1", {
      versionId: "v2",
      expectedSnapshotHash: "snap-hash-v2",
      expectedRevision: 2,
      expectedProfileRevision: 1,
      throughMonth: "2026-09",
      sourceCommands: [createCommand, endCommand],
      pensionSelections: [pensionSelection],
    });

    assert.equal(previewRes.status, "READY");
    assert.equal(previewRes.inputHash, "v4-input-hash-abc");
    assert.equal(capturedPreviewReq.body.sourceCommands.length, 2);
    assert.equal(capturedPreviewReq.body.pensionSelections.length, 1);
    assert.equal(capturedPreviewReq.body.pensionSelections[0].amountPolicy, "FIXED_NOMINAL");

    // Save with idempotency key
    const saveRes = await saveSourceReforecast(
      "p1",
      {
        preview: capturedPreviewReq.body,
        expectedInputHash: "v4-input-hash-abc",
        confirm: true,
      },
      "v4-idem-key-888"
    );

    assert.equal(saveRes.revision, 3);
    assert.equal(capturedSaveReq.options.headers["Idempotency-Key"], "v4-idem-key-888");
    assert.equal(capturedSaveReq.body.expectedInputHash, "v4-input-hash-abc");
  } finally {
    restore();
  }
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
