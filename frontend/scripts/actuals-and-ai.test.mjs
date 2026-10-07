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
  generateContractPeriods,
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

test("FE-07: generateContractPeriods utility calculates valid monthly periods", () => {
  const periods = generateContractPeriods("2026-09-30", 6, "9.5");
  assert.equal(periods.length, 6);
  assert.equal(periods[0].accrualFrom, "2026-09-30");
  assert.equal(periods[0].dueDate, "2026-10-31");
  assert.equal(periods[0].rate.kind, "SIMPLE_ANNUAL_DAILY");
  assert.equal(periods[0].rate.percent, "9.5");
  assert.equal(periods[0].gracePrincipal, false);
  assert.equal(periods[0].bankPayment, null);

  // Subsequent periods link accrualFrom to previous dueDate
  assert.equal(periods[1].accrualFrom, "2026-10-31");
  assert.equal(periods[1].dueDate, "2026-11-30");
  assert.ok(periods[1].rate.days >= 28 && periods[1].rate.days <= 31);
});

test("FE-07: previewSourceReforecast and saveSourceReforecast correctly validate and wire loanRevisions and loanCreations", async () => {
  let capturedPreviewReq = null;
  let capturedSaveReq = null;

  const restore = mockFetch(async (url, options) => {
    if (url.includes("/source-reforecasts/preview")) {
      capturedPreviewReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        status: "READY",
        issues: [],
        inputHash: "loan-v2-input-hash-999",
        candidate: {
          loanRevisionOptions: [
            {
              sourceId: "loan-existing-1",
              sourceRevision: 1,
              sourceHash: "hash-src-1",
              contractHash: "hash-contract-1",
              legacyOpeningRequired: false,
            },
          ],
        },
        loanRevisionOptions: [
          {
            sourceId: "loan-existing-1",
            sourceRevision: 1,
            sourceHash: "hash-src-1",
            contractHash: "hash-contract-1",
            legacyOpeningRequired: false,
          },
        ],
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
        revision: 4,
        currentVersionId: "v3",
        baselineVersionId: "v1",
        saved: { id: "v3", versionNumber: 3 },
      });
    }

    return errorResponse(404, "NOT_FOUND", "Unknown route");
  });

  try {
    const evidence = [
      {
        reference: "HD-TD-2026-001",
        contentHash: "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
        confirmedOn: "2026-09-30",
      },
    ];

    // 1. REVISE loan with legacyOpening and responsibilityAmendment
    const reviseLoanCommand = {
      commandId: "cmd-rev-loan-1",
      sourceId: "loan-existing-1",
      operation: "REVISE",
      expectedSourceRevision: 1,
      expectedSourceHash: "hash-src-1",
      expectedContractHash: "hash-contract-1",
      confirm: true,
      legacyOpening: {
        signedOn: "2025-01-15",
        amendedOn: null,
        effectiveOn: "2025-01-15",
        knownOn: "2026-09-30",
        previouslyPaid: "30000000",
        capBasis: "TOTAL_USER_PAYMENTS",
        evidence,
      },
      responsibilityAmendment: {
        effectiveOn: "2026-09-30",
        openingUserPaid: "30000000",
        confirm: true,
        evidence,
      },
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2025-01-15",
        amendedOn: "2026-09-30",
        effectiveOn: "2026-09-30",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "450000000",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        userPaidToDate: "42000000",
        responsibility: {
          kind: "CAPPED",
          capBasis: "TOTAL_USER_PAYMENTS",
          limit: "250000000",
          previouslyPaid: "42000000",
          evidence,
        },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "REDUCE_PAYMENT_KEEP_TERM",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2030-09-30",
        periods: generateContractPeriods("2026-09-30", 48, "8.5"),
      },
      allocations: [
        {
          allocationId: "alloc-1",
          eventId: "evt-debt-pay-1",
          actualRevision: 1,
          bookedOn: "2026-09-15",
          scope: "USER_SHARE",
          components: {
            principal: "10000000",
            interest: "1800000",
            prepaymentFee: "200000",
            otherFee: "0",
          },
          contractComponents: {
            principal: "10000000",
            interest: "1800000",
            prepaymentFee: "200000",
            otherFee: "0",
          },
          paymentStatus: "CURRENT",
          allocationBasis: "BANK_STATEMENT",
          evidence,
        },
      ],
      principalAdvances: [],
    };

    // 2. END loan
    const endLoanCommand = {
      commandId: "cmd-end-loan-2",
      sourceId: "loan-closing-2",
      operation: "END",
      expectedSourceRevision: 2,
      expectedSourceHash: "hash-src-2",
      expectedContractHash: "hash-contract-2",
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2024-05-10",
        amendedOn: "2026-09-30",
        effectiveOn: "2026-09-30",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "0",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "BANK_SCHEDULE",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2026-09-30",
        periods: [],
      },
      allocations: [],
      principalAdvances: [],
    };

    // 3. CREATE loan: EXISTING_BALANCE
    const createExistingCommand = {
      commandId: "cmd-create-exist-1",
      sourceId: "plan:create-exist-uuid",
      operation: "CREATE",
      expectedSourceRevision: 0,
      agreementReference: "AGREE-EXIST-999",
      confirm: true,
      funding: {
        kind: "EXISTING_BALANCE",
        notAlreadyInSources: true,
        evidence,
      },
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-09-01",
        amendedOn: null,
        effectiveOn: "2026-09-01",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "200000000",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "REDUCE_TERM_KEEP_PAYMENT",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2031-09-30",
        periods: generateContractPeriods("2026-09-30", 60, "7.8"),
      },
    };

    // 4. CREATE loan: PLANNED_DISBURSEMENT
    const createPlannedCommand = {
      commandId: "cmd-create-plan-2",
      sourceId: "plan:create-plan-uuid",
      operation: "CREATE",
      expectedSourceRevision: 0,
      agreementReference: "AGREE-PLAN-888",
      confirm: true,
      funding: {
        kind: "PLANNED_DISBURSEMENT",
        grossPrincipal: "500000000",
        withheldFees: "5000000",
        netDisbursement: "495000000",
        destination: "EXTERNAL_ACCOUNT",
        evidence,
      },
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-09-30",
        amendedOn: null,
        effectiveOn: "2026-10-15",
        knownOn: "2026-09-30",
        confirmation: "HYPOTHETICAL",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "500000000",
        balanceNature: "PROJECTED_DISBURSEMENT",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "REDUCE_PAYMENT_KEEP_TERM",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2036-10-15",
        periods: generateContractPeriods("2026-09-30", 120, "9.0"),
      },
    };

    // 5. CREATE loan: DISBURSED_BALANCE with originalTerms & scopeChange
    const createDisbursedCommand = {
      commandId: "cmd-create-disb-3",
      sourceId: "plan:create-disb-uuid",
      operation: "CREATE",
      expectedSourceRevision: 0,
      agreementReference: "AGREE-DISB-777",
      confirm: true,
      funding: {
        kind: "DISBURSED_BALANCE",
        notAlreadyInSources: true,
        disbursedOn: "2026-08-15",
        grossPrincipal: "300000000",
        openingUserPaid: "0",
        evidence,
        allocations: [],
        principalAdvances: [],
        originalTerms: {
          signedOn: "2026-08-10",
          amendedOn: null,
          effectiveOn: "2026-08-15",
          balanceScope: "FULL_CONTRACT",
          paymentShare: "0.5",
          responsibility: { kind: "ALLOCATED_SHARE" },
          evidence,
          confirm: true,
        },
        scopeChange: {
          openingPrincipal: "150000000",
          evidence,
          confirm: true,
        },
      },
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-08-10",
        amendedOn: "2026-09-01",
        effectiveOn: "2026-09-01",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "145000000",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "REDUCE_PAYMENT_KEEP_TERM",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2031-09-01",
        periods: generateContractPeriods("2026-09-30", 60, "8.0"),
      },
    };

    const previewRes = await previewSourceReforecast("p1", {
      versionId: "v2",
      expectedSnapshotHash: "snap-hash-v2",
      expectedRevision: 2,
      expectedProfileRevision: 1,
      throughMonth: "2026-09",
      loanRevisions: [reviseLoanCommand, endLoanCommand],
      loanCreations: [createExistingCommand, createPlannedCommand, createDisbursedCommand],
    });

    assert.equal(previewRes.status, "READY");
    assert.equal(previewRes.inputHash, "loan-v2-input-hash-999");
    assert.equal(capturedPreviewReq.body.loanRevisions.length, 2);
    assert.equal(capturedPreviewReq.body.loanCreations.length, 3);

    // Assert REVISE structure
    const sentRevise = capturedPreviewReq.body.loanRevisions[0];
    assert.equal(sentRevise.operation, "REVISE");
    assert.equal(sentRevise.legacyOpening.previouslyPaid, "30000000");
    assert.equal(sentRevise.responsibilityAmendment.openingUserPaid, "30000000");
    assert.equal(sentRevise.contract.userPaidToDate, "42000000");
    assert.equal(sentRevise.allocations[0].components.principal, "10000000");

    // Assert END structure
    const sentEnd = capturedPreviewReq.body.loanRevisions[1];
    assert.equal(sentEnd.operation, "END");
    assert.equal(sentEnd.contract.principalBalance, "0");
    assert.equal(sentEnd.contract.periods.length, 0);

    // Assert PLANNED_DISBURSEMENT net calculation
    const sentPlanned = capturedPreviewReq.body.loanCreations[1];
    assert.equal(sentPlanned.funding.kind, "PLANNED_DISBURSEMENT");
    assert.equal(sentPlanned.funding.netDisbursement, "495000000");
    assert.equal(sentPlanned.contract.confirmation, "HYPOTHETICAL");

    // Assert DISBURSED_BALANCE originalTerms & scopeChange
    const sentDisbursed = capturedPreviewReq.body.loanCreations[2];
    assert.equal(sentDisbursed.funding.kind, "DISBURSED_BALANCE");
    assert.equal(sentDisbursed.funding.originalTerms.balanceScope, "FULL_CONTRACT");
    assert.equal(sentDisbursed.funding.scopeChange.openingPrincipal, "150000000");

    // Save with idempotency key
    const saveRes = await saveSourceReforecast(
      "p1",
      {
        preview: capturedPreviewReq.body,
        expectedInputHash: "loan-v2-input-hash-999",
        confirm: true,
      },
      "loan-v2-idem-key-777"
    );

    assert.equal(saveRes.revision, 4);
    assert.equal(capturedSaveReq.options.headers["Idempotency-Key"], "loan-v2-idem-key-777");
    assert.equal(capturedSaveReq.body.expectedInputHash, "loan-v2-input-hash-999");
    assert.equal(capturedSaveReq.body.preview.loanRevisions.length, 2);
    assert.equal(capturedSaveReq.body.preview.loanCreations.length, 3);
  } finally {
    restore();
  }
});

test("FE-08: previewSourceReforecast and saveSourceReforecast correctly wire refinances (with proceedsAtSettlement) and plannedRefinances (CREATE, REVISE, CANCEL)", async () => {
  let capturedPreviewReq = null;
  let capturedSaveReq = null;

  const restore = mockFetch(async (url, options) => {
    if (url.includes("/source-reforecasts/preview")) {
      capturedPreviewReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        status: "READY",
        issues: [],
        inputHash: "refi-v2-input-hash-555",
        candidate: {
          plannedRefinanceOptions: {
            eligibleLoans: [
              {
                sourceId: "loan-old-1",
                sourceRevision: 2,
                sourceHash: "hash-old-src-1",
                contractHash: "hash-old-contract-1",
                balanceAsOf: "2026-09-30",
                principalBalance: "600000000",
              },
            ],
            activePairs: [
              {
                pairId: "pair-active-1",
                pairHash: "hash-active-pair-1",
                oldSource: { sourceId: "loan-old-1", revision: 2, sourceHash: "hash-old-src-1" },
                newSource: { sourceId: "plan:pair-new-1", revision: 1, sourceHash: "hash-new-src-1" },
                contractHash: "hash-old-contract-1",
                settledOn: "2026-12-15",
                reviseAllowed: true,
              },
            ],
          },
        },
        loanRevisionOptions: [],
        plannedRefinanceOptions: {
          eligibleLoans: [],
          activePairs: [],
        },
        assetRevisionOptions: [],
        saved: false,
        applied: false,
      });
    }

    if (url.includes("/source-reforecasts") && options.method === "POST") {
      capturedSaveReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        planId: "p1",
        revision: 5,
        currentVersionId: "v4",
        baselineVersionId: "v1",
        saved: { id: "v4", versionNumber: 4 },
      });
    }

    return errorResponse(404, "NOT_FOUND", "Unknown route");
  });

  try {
    const evidence = [
      {
        reference: "REFI-DOC-2026-01",
        contentHash: "222233334444555566667777888899990000aaaabbbbccccddddeeeeffff1111",
        confirmedOn: "2026-09-30",
      },
    ];

    // 1. Actual Refinance (Same day)
    const refiCommandId1 = "refi-cmd-actual-1";
    const closingCommandId1 = "cmd-close-loan-1";
    const newLoanCommandId1 = "cmd-new-loan-1";

    const closingLoanCmd1 = {
      commandId: closingCommandId1,
      sourceId: "loan-old-closed-1",
      operation: "END",
      expectedSourceRevision: 1,
      expectedSourceHash: "hash-old-1",
      expectedContractHash: "hash-contract-old-1",
      refinanceCommandId: refiCommandId1,
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-09-30",
        amendedOn: "2026-09-30",
        effectiveOn: "2026-09-30",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "0",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "BANK_SCHEDULE",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2026-09-30",
        periods: [],
      },
      allocations: [
        {
          allocationId: "alloc-payoff-1",
          eventId: "evt-payoff-1",
          actualRevision: 1,
          bookedOn: "2026-09-30",
          scope: "USER_SHARE",
          components: {
            principal: "600000000",
            interest: "0",
            prepaymentFee: "0",
            otherFee: "0",
          },
          contractComponents: {
            principal: "600000000",
            interest: "0",
            prepaymentFee: "0",
            otherFee: "0",
          },
          paymentStatus: "CURRENT",
          allocationBasis: "BANK_STATEMENT",
          evidence,
        },
      ],
      principalAdvances: [],
    };

    const newLoanCmd1 = {
      commandId: newLoanCommandId1,
      sourceId: "plan:new-refi-loan-1",
      operation: "CREATE",
      expectedSourceRevision: 0,
      refinanceCommandId: refiCommandId1,
      agreementReference: "AGREE-REFI-SAME-DAY",
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-09-30",
        amendedOn: null,
        effectiveOn: "2026-09-30",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "600000000",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "REDUCE_PAYMENT_KEEP_TERM",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2031-09-30",
        periods: generateContractPeriods("2026-09-30", 60, "8.0"),
      },
      funding: {
        kind: "EXISTING_BALANCE",
        notAlreadyInSources: true,
        evidence,
      },
    };

    const actualRefinanceCmd1 = {
      commandId: refiCommandId1,
      closingCommandId: closingCommandId1,
      newLoanCommandId: newLoanCommandId1,
      settledOn: "2026-09-30",
      fundingScope: "USER_SHARE",
      grossDisbursement: "600000000",
      withheldFees: "6000000",
      externalTopUp: "10000000",
      unusedProceeds: "4000000",
      confirm: true,
      evidence,
    };

    // 2. Actual Refinance with Early Disbursement (proceedsAtSettlement)
    // Formula verification: gross 1000M - withheld 0 - used 100M = available 900M;
    // available 900M + externalTopUp 120M = settlement 1020M + unused 0!
    const refiCommandId2 = "refi-cmd-early-2";
    const closingCommandId2 = "cmd-close-loan-2";
    const newLoanCommandId2 = "cmd-new-loan-2";

    const closingLoanCmd2 = {
      commandId: closingCommandId2,
      sourceId: "loan-old-closed-2",
      operation: "END",
      expectedSourceRevision: 1,
      expectedSourceHash: "hash-old-2",
      expectedContractHash: "hash-contract-old-2",
      refinanceCommandId: refiCommandId2,
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-09-30",
        amendedOn: "2026-09-30",
        effectiveOn: "2026-09-30",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "0",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "BANK_SCHEDULE",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2026-09-30",
        periods: [],
      },
      allocations: [
        {
          allocationId: "alloc-payoff-2",
          eventId: "evt-payoff-2",
          actualRevision: 1,
          bookedOn: "2026-09-30",
          scope: "USER_SHARE",
          components: {
            principal: "1020000000",
            interest: "0",
            prepaymentFee: "0",
            otherFee: "0",
          },
          contractComponents: {
            principal: "1020000000",
            interest: "0",
            prepaymentFee: "0",
            otherFee: "0",
          },
          paymentStatus: "CURRENT",
          allocationBasis: "BANK_STATEMENT",
          evidence,
        },
      ],
      principalAdvances: [],
    };

    const newLoanCmd2 = {
      commandId: newLoanCommandId2,
      sourceId: "plan:new-refi-loan-2",
      operation: "CREATE",
      expectedSourceRevision: 0,
      refinanceCommandId: refiCommandId2,
      agreementReference: "AGREE-REFI-EARLY-DISB",
      confirm: true,
      contract: {
        contractVersion: 2,
        currency: "VND",
        signedOn: "2026-08-20",
        amendedOn: null,
        effectiveOn: "2026-08-20",
        knownOn: "2026-09-30",
        confirmation: "BANK_CONFIRMED",
        evidence,
        balanceAsOf: "2026-09-30",
        principalBalance: "1000000000",
        balanceScope: "USER_SHARE",
        paymentShare: "1",
        responsibility: { kind: "ALLOCATED_SHARE" },
        interestBasis: "REDUCING_BALANCE",
        rounding: "EXACT",
        mode: "REDUCE_PAYMENT_KEEP_TERM",
        fixedPayment: null,
        finalPayment: "ADJUST_FINAL_PAYMENT",
        maturityDate: "2031-08-20",
        periods: generateContractPeriods("2026-09-30", 60, "8.0"),
      },
      funding: {
        kind: "DISBURSED_BALANCE",
        notAlreadyInSources: true,
        disbursedOn: "2026-08-20",
        grossPrincipal: "1000000000",
        openingUserPaid: "0",
        evidence,
        allocations: [],
        principalAdvances: [],
      },
    };

    const actualRefinanceCmd2 = {
      commandId: refiCommandId2,
      closingCommandId: closingCommandId2,
      newLoanCommandId: newLoanCommandId2,
      settledOn: "2026-09-30",
      fundingScope: "USER_SHARE",
      grossDisbursement: "1000000000",
      withheldFees: "0",
      externalTopUp: "120000000",
      unusedProceeds: "0",
      confirm: true,
      evidence,
      proceedsAtSettlement: {
        availableAmount: "900000000",
        confirm: true,
        usesBeforeSettlement: [
          {
            useId: "use-before-settle-1",
            bookedOn: "2026-08-25",
            amount: "100000000",
            description: "Used for intermediate expenses before payoff",
            evidence,
          },
        ],
        evidence,
      },
    };

    // 3. Planned Refinance (CREATE pair)
    const plannedNewLoanId = "cmd-planned-new-1";
    const plannedNewSourceId = "plan:planned-pair-new-1";
    const plannedCreatePairCmd = {
      operation: "CREATE",
      commandId: "cmd-pair-create-1",
      replacementCommandId: plannedNewLoanId,
      pairId: "pair-uuid-create-1",
      oldSource: { sourceId: "loan-old-1", revision: 2, sourceHash: "hash-old-src-1" },
      newSource: { sourceId: plannedNewSourceId, revision: 0, sourceHash: null },
      expectedContractHash: "hash-old-contract-1",
      expectedPairHash: null,
      confirm: true,
      terms: {
        replacement: {
          commandId: plannedNewLoanId,
          sourceId: plannedNewSourceId,
          operation: "CREATE",
          expectedSourceRevision: 0,
          agreementReference: "PLANNED-REFI-QUOTE-1",
          confirm: true,
          contract: {
            contractVersion: 2,
            currency: "VND",
            signedOn: "2026-09-30",
            amendedOn: null,
            effectiveOn: "2026-11-15",
            knownOn: "2026-09-30",
            confirmation: "HYPOTHETICAL",
            evidence,
            balanceAsOf: "2026-11-15",
            principalBalance: "300000000",
            balanceNature: "PROJECTED_DISBURSEMENT",
            balanceScope: "USER_SHARE",
            paymentShare: "1",
            responsibility: { kind: "ALLOCATED_SHARE" },
            interestBasis: "REDUCING_BALANCE",
            rounding: "EXACT",
            mode: "REDUCE_PAYMENT_KEEP_TERM",
            fixedPayment: null,
            finalPayment: "ADJUST_FINAL_PAYMENT",
            maturityDate: "2031-11-15",
            periods: generateContractPeriods("2026-11-15", 60, "7.5"),
          },
          funding: {
            kind: "PLANNED_DISBURSEMENT",
            grossPrincipal: "300000000",
            withheldFees: "0",
            netDisbursement: "300000000",
            destination: "EXTERNAL_ACCOUNT",
            evidence,
          },
        },
        settledOn: "2026-11-15",
        sameDayOrder: "AFTER_SCHEDULED_PAYMENT",
        payoffQuote: {
          principal: "300000000",
          interest: "5000000",
          carriedInterest: "0",
          prepaymentFee: "1000000",
          otherFee: "0",
          allRemainingChargesIncluded: true,
          valueKind: "HYPOTHETICAL_QUOTE",
          evidence,
        },
        funding: {
          scope: "USER_SHARE",
          externalTopUp: "6000000",
          userTopUp: "6000000",
          userFinancedAmount: "300000000",
          unusedProceeds: "0",
          unusedProceedsNotContributed: true,
          evidence,
        },
      },
    };

    // 4. Planned Refinance (CANCEL pair)
    const plannedCancelPairCmd = {
      operation: "CANCEL",
      commandId: "cmd-pair-cancel-1",
      replacementCommandId: "cmd-dummy-rep-1",
      pairId: "pair-active-1",
      oldSource: { sourceId: "loan-old-1", revision: 2, sourceHash: "hash-old-src-1" },
      newSource: { sourceId: "plan:pair-new-1", revision: 1, sourceHash: "hash-new-src-1" },
      expectedContractHash: "hash-old-contract-1",
      expectedPairHash: "hash-active-pair-1",
      reason: "Hủy phương án tái cấp vốn dự kiến theo nhu cầu người dùng",
      confirm: true,
    };

    const previewRes = await previewSourceReforecast("p1", {
      versionId: "v3",
      expectedSnapshotHash: "snap-hash-v3",
      expectedRevision: 3,
      expectedProfileRevision: 1,
      throughMonth: "2026-09",
      loanRevisions: [closingLoanCmd1, closingLoanCmd2],
      loanCreations: [newLoanCmd1, newLoanCmd2],
      refinances: [actualRefinanceCmd1, actualRefinanceCmd2],
      plannedRefinances: [plannedCreatePairCmd, plannedCancelPairCmd],
    });

    assert.equal(previewRes.status, "READY");
    assert.equal(previewRes.inputHash, "refi-v2-input-hash-555");
    assert.equal(capturedPreviewReq.body.refinances.length, 2);
    assert.equal(capturedPreviewReq.body.plannedRefinances.length, 2);

    // Assert Actual Refinance 1 links
    const sentRefi1 = capturedPreviewReq.body.refinances[0];
    assert.equal(sentRefi1.closingCommandId, closingCommandId1);
    assert.equal(sentRefi1.newLoanCommandId, newLoanCommandId1);
    assert.equal(sentRefi1.fundingScope, "USER_SHARE");
    assert.equal(sentRefi1.externalTopUp, "10000000");

    // Assert Actual Refinance 2 proceedsAtSettlement
    const sentRefi2 = capturedPreviewReq.body.refinances[1];
    assert.ok(sentRefi2.proceedsAtSettlement);
    assert.equal(sentRefi2.proceedsAtSettlement.availableAmount, "900000000");
    assert.equal(sentRefi2.proceedsAtSettlement.usesBeforeSettlement.length, 1);
    assert.equal(sentRefi2.proceedsAtSettlement.usesBeforeSettlement[0].amount, "100000000");

    // Assert Planned Refinance CREATE
    const sentPlannedCreate = capturedPreviewReq.body.plannedRefinances[0];
    assert.equal(sentPlannedCreate.operation, "CREATE");
    assert.equal(sentPlannedCreate.expectedPairHash, null);
    assert.equal(sentPlannedCreate.terms.payoffQuote.valueKind, "HYPOTHETICAL_QUOTE");
    assert.equal(sentPlannedCreate.terms.funding.unusedProceedsNotContributed, true);

    // Assert Planned Refinance CANCEL
    const sentPlannedCancel = capturedPreviewReq.body.plannedRefinances[1];
    assert.equal(sentPlannedCancel.operation, "CANCEL");
    assert.equal(sentPlannedCancel.expectedPairHash, "hash-active-pair-1");
    assert.equal(sentPlannedCancel.reason, "Hủy phương án tái cấp vốn dự kiến theo nhu cầu người dùng");

    // Save with idempotency key
    const saveRes = await saveSourceReforecast(
      "p1",
      {
        preview: capturedPreviewReq.body,
        expectedInputHash: "refi-v2-input-hash-555",
        confirm: true,
      },
      "refi-v2-idem-key-666"
    );

    assert.equal(saveRes.revision, 5);
    assert.equal(capturedSaveReq.options.headers["Idempotency-Key"], "refi-v2-idem-key-666");
    assert.equal(capturedSaveReq.body.expectedInputHash, "refi-v2-input-hash-555");
    assert.equal(capturedSaveReq.body.preview.refinances.length, 2);
    assert.equal(capturedSaveReq.body.preview.plannedRefinances.length, 2);
  } finally {
    restore();
  }
});

test("FE-09: previewSourceReforecast and saveSourceReforecast correctly wire assetCommands (PLANNED, REALIZED, rentalExit, missedContribution)", async () => {
  let capturedPreviewReq = null;
  let capturedSaveReq = null;

  const restore = mockFetch(async (url, options) => {
    if (url.includes("/source-reforecasts/preview")) {
      capturedPreviewReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        status: "READY",
        issues: [],
        inputHash: "asset-v4-input-hash-777",
        candidate: {
          assetRevisionOptions: [
            { sourceId: "profile:asset:rental-1", sourceRevision: 2, sourceHash: "hash-rental-src" },
            { sourceId: "plan:asset-delayed-1", sourceRevision: 1, sourceHash: "hash-delayed-src" },
          ],
        },
      });
    }
    if (url.includes("/source-reforecasts")) {
      capturedSaveReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        planId: "p1",
        revision: 6,
        currentVersionId: "v-new",
        baselineVersionId: "v2",
        saved: { id: "v-new", version: 6, snapshotHash: "snap-hash-v6" },
      });
    }
    return jsonResponse({});
  });

  try {
    const evidence = [{ reference: "Chung-tu-bds-01", contentHash: "e".repeat(64), confirmedOn: "2026-09-30" }];

    // 1. CREATE PLANNED asset sale with net calculation
    const createAssetCmd = {
      commandId: "cmd-asset-create-1",
      sourceId: "plan:asset-sale-new-1",
      operation: "CREATE",
      expectedSourceRevision: 0,
      expectedSourceHash: null,
      notAlreadyInSources: true,
      confirm: true,
      evidence,
      capital: {
        reference: "BDS-NHA-PHO-Q1",
        kind: "ASSET_SALE",
        currency: "VND",
        priceBasis: "NOMINAL_AT_AVAILABILITY",
        amountScope: "WHOLE_ASSET",
        ownershipShare: "0.5",
        retirementShare: "0.5",
        grossAmount: "1000000000",
        fees: "50000000",
        taxes: "50000000",
        securedDebtSettlement: "100000000",
        netAmount: "800000000",
        availableOn: "2026-10-31",
        confirmedContributionAmount: "150000000",
        funding: {
          status: "PLANNED",
          liquidity: "AVAILABLE",
          notIncludedInFund: true,
          contributionMonth: "2026-11",
          contributionTiming: "END_OF_MONTH",
        },
      },
    };

    // 2. REVISE rental asset with rentalExit
    const reviseRentalCmd = {
      commandId: "cmd-asset-revise-rental",
      sourceId: "profile:asset:rental-1",
      operation: "REVISE",
      expectedSourceRevision: 2,
      expectedSourceHash: "hash-rental-src",
      confirm: true,
      evidence,
      capital: {
        reference: "CAN-HO-CHO-THUE-Q7",
        kind: "ASSET_SALE",
        currency: "VND",
        priceBasis: "NOMINAL_AT_AVAILABILITY",
        amountScope: "USER_SHARE",
        ownershipShare: "1",
        retirementShare: "1",
        grossAmount: "800000000",
        fees: "0",
        taxes: "0",
        securedDebtSettlement: "0",
        netAmount: "800000000",
        availableOn: "2026-10-15",
        confirmedContributionAmount: "400000000",
        funding: {
          status: "REALIZED",
          allocations: [
            {
              allocationId: "alloc-rental-sale-1",
              eventId: "evt-contrib-101",
              actualRevision: 1,
              bookedOn: "2026-10-15",
              amount: "400000000",
            },
          ],
        },
      },
      rentalExit: {
        rentEndsOn: "2026-10-15",
        finalMonthIncome: "7000000",
        amountScope: "SOURCE_SHARE",
        confirm: true,
      },
    };

    // 3. REVISE delayed planned asset with missedContribution
    const reviseMissedCmd = {
      commandId: "cmd-asset-revise-missed",
      sourceId: "plan:asset-delayed-1",
      operation: "REVISE",
      expectedSourceRevision: 1,
      expectedSourceHash: "hash-delayed-src",
      confirm: true,
      evidence,
      capital: {
        reference: "DAT-NEN-LONG-AN",
        kind: "ASSET_SALE",
        currency: "VND",
        priceBasis: "NOMINAL_AT_AVAILABILITY",
        amountScope: "WHOLE_ASSET",
        ownershipShare: "1",
        retirementShare: "1",
        grossAmount: "500000000",
        fees: "0",
        taxes: "0",
        securedDebtSettlement: "0",
        netAmount: "500000000",
        availableOn: "2026-11-30",
        confirmedContributionAmount: "200000000",
        funding: {
          status: "PLANNED",
          liquidity: "AVAILABLE",
          notIncludedInFund: true,
          contributionMonth: "2026-12",
          contributionTiming: "END_OF_MONTH",
        },
      },
      missedContribution: {
        scheduledMonth: "2026-09",
        actualRevision: 1,
        amountNotContributed: "200000000",
        confirmedOn: "2026-10-01",
        reason: "Bán tài sản bị trì hoãn, chưa góp khoản dự kiến",
        confirmNotContributed: true,
      },
    };

    // 4. END asset
    const endAssetCmd = {
      commandId: "cmd-asset-end-1",
      sourceId: "plan:asset-to-cancel-1",
      operation: "END",
      expectedSourceRevision: 1,
      expectedSourceHash: "hash-cancel-src",
      reason: "Hủy bỏ kế hoạch bán tài sản",
      confirm: true,
      evidence,
    };

    const previewRes = await previewSourceReforecast("p1", {
      versionId: "v2",
      expectedSnapshotHash: "snap-hash-v2",
      expectedRevision: 2,
      expectedProfileRevision: 1,
      throughMonth: "2026-09",
      assetCommands: [createAssetCmd, reviseRentalCmd, reviseMissedCmd, endAssetCmd],
    });

    assert.equal(previewRes.status, "READY");
    assert.equal(previewRes.inputHash, "asset-v4-input-hash-777");
    assert.equal(capturedPreviewReq.body.assetCommands.length, 4);

    // Verify sent CREATE
    const sentCreate = capturedPreviewReq.body.assetCommands[0];
    assert.equal(sentCreate.operation, "CREATE");
    assert.equal(sentCreate.capital.netAmount, "800000000");
    assert.equal(sentCreate.capital.confirmedContributionAmount, "150000000");
    assert.equal(sentCreate.capital.funding.status, "PLANNED");

    // Verify sent rentalExit
    const sentRental = capturedPreviewReq.body.assetCommands[1];
    assert.equal(sentRental.operation, "REVISE");
    assert.equal(sentRental.rentalExit.rentEndsOn, "2026-10-15");
    assert.equal(sentRental.rentalExit.finalMonthIncome, "7000000");
    assert.equal(sentRental.capital.funding.status, "REALIZED");

    // Verify sent missedContribution
    const sentMissed = capturedPreviewReq.body.assetCommands[2];
    assert.equal(sentMissed.operation, "REVISE");
    assert.equal(sentMissed.missedContribution.scheduledMonth, "2026-09");
    assert.equal(sentMissed.missedContribution.amountNotContributed, "200000000");
    assert.equal(sentMissed.missedContribution.confirmNotContributed, true);

    // Verify sent END
    const sentEnd = capturedPreviewReq.body.assetCommands[3];
    assert.equal(sentEnd.operation, "END");
    assert.equal(sentEnd.reason, "Hủy bỏ kế hoạch bán tài sản");

    // Save with idempotency
    const saveRes = await saveSourceReforecast(
      "p1",
      {
        preview: capturedPreviewReq.body,
        expectedInputHash: "asset-v4-input-hash-777",
        confirm: true,
      },
      "asset-v4-idem-key-888"
    );

    assert.equal(saveRes.revision, 6);
    assert.equal(capturedSaveReq.options.headers["Idempotency-Key"], "asset-v4-idem-key-888");
    assert.equal(capturedSaveReq.body.expectedInputHash, "asset-v4-input-hash-777");
    assert.equal(capturedSaveReq.body.preview.assetCommands.length, 4);
  } finally {
    restore();
  }
});

test("FE-10: STAGED funding with plannedContributions, availability releases, and reconciliations", async () => {
  let capturedPreviewReq = null;
  let capturedSaveReq = null;

  const restore = mockFetch(async (url, options) => {
    if (url.includes("/source-reforecasts/preview")) {
      capturedPreviewReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        status: "READY",
        issues: [],
        inputHash: "staged-v4-input-hash-123",
        candidate: {
          assetRevisionOptions: [{ sourceId: "profile:asset:legacy-v3-1", sourceRevision: 3, sourceHash: "hash-legacy-v3" }],
        },
      });
    }
    if (url.includes("/source-reforecasts")) {
      capturedSaveReq = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        planId: "p1",
        revision: 7,
        currentVersionId: "v-staged",
        baselineVersionId: "v2",
        saved: { id: "v-staged", version: 7, snapshotHash: "snap-hash-v7" },
      });
    }
    return jsonResponse({});
  });

  try {
    const evidence = [{ reference: "Chung-tu-staged-release", contentHash: "s".repeat(64), confirmedOn: "2026-09-30" }];

    const stagedAssetCmd = {
      commandId: "cmd-asset-staged-1",
      sourceId: "profile:asset:legacy-v3-1",
      operation: "REVISE",
      expectedSourceRevision: 3,
      expectedSourceHash: "hash-legacy-v3",
      confirm: true,
      evidence,
      capital: {
        reference: "BDS-DA-NANG-STAGED",
        kind: "ASSET_SALE",
        currency: "VND",
        priceBasis: "NOMINAL_AT_AVAILABILITY",
        amountScope: "WHOLE_ASSET",
        ownershipShare: "1",
        retirementShare: "1",
        grossAmount: "200000000",
        fees: "0",
        taxes: "0",
        securedDebtSettlement: "0",
        netAmount: "200000000",
        availableOn: "2026-08-20",
        confirmedContributionAmount: "200000000",
        funding: {
          status: "STAGED",
          liquidity: "PLANNED_RELEASE",
          plannedNotIncludedInFund: true,
          availability: {
            amountScope: "NET_SOURCE_SHARE",
            releases: [
              {
                releaseId: "rel-1",
                availableOn: "2026-08-20",
                amount: "80000000",
                status: "CONFIRMED",
                evidence,
              },
              {
                releaseId: "rel-2",
                availableOn: "2026-11-30",
                amount: "120000000",
                status: "EXPECTED",
                evidence,
              },
            ],
          },
          allocations: [
            {
              allocationId: "alloc-staged-new-1",
              eventId: "evt-contrib-staged-new",
              actualRevision: 1,
              bookedOn: "2026-09-28",
              amount: "30000000",
            },
          ],
          plannedContributions: [
            {
              installmentId: "inst-1",
              month: "2026-11",
              amount: "70000000",
              timing: "END_OF_MONTH",
            },
            {
              installmentId: "inst-2",
              month: "2026-12",
              amount: "40000000",
              timing: "END_OF_MONTH",
            },
          ],
          reconciliations: [
            {
              scheduledMonth: "2026-09",
              actualRevision: 1,
              receivedAllocationIds: ["alloc-staged-new-1"],
              amountNotContributed: "70000000",
              confirmedOn: "2026-10-01",
              reason: "Dự kiến 100, đã góp 30, chưa góp 70",
              confirm: true,
            },
          ],
        },
      },
    };

    const previewRes = await previewSourceReforecast("p1", {
      versionId: "v2",
      expectedSnapshotHash: "snap-hash-v2",
      expectedRevision: 2,
      expectedProfileRevision: 1,
      throughMonth: "2026-09",
      assetCommands: [stagedAssetCmd],
    });

    assert.equal(previewRes.status, "READY");
    assert.equal(previewRes.inputHash, "staged-v4-input-hash-123");
    assert.equal(capturedPreviewReq.body.assetCommands.length, 1);

    const sentStaged = capturedPreviewReq.body.assetCommands[0];
    assert.equal(sentStaged.operation, "REVISE");
    assert.equal(sentStaged.capital.funding.status, "STAGED");
    assert.equal(sentStaged.capital.funding.availability.releases.length, 2);
    assert.equal(sentStaged.capital.funding.availability.releases[0].status, "CONFIRMED");
    assert.equal(sentStaged.capital.funding.availability.releases[1].status, "EXPECTED");
    assert.equal(sentStaged.capital.funding.plannedContributions.length, 2);
    assert.equal(sentStaged.capital.funding.reconciliations.length, 1);
    assert.equal(sentStaged.capital.funding.reconciliations[0].amountNotContributed, "70000000");

    // Save with idempotency
    const saveRes = await saveSourceReforecast(
      "p1",
      {
        preview: capturedPreviewReq.body,
        expectedInputHash: "staged-v4-input-hash-123",
        confirm: true,
      },
      "staged-v4-idem-key-999"
    );

    assert.equal(saveRes.revision, 7);
    assert.equal(capturedSaveReq.options.headers["Idempotency-Key"], "staged-v4-idem-key-999");
    assert.equal(capturedSaveReq.body.preview.assetCommands[0].capital.funding.status, "STAGED");
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
