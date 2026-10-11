import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLatestInsuranceHistory,
  getInsuranceHistoryById,
  previewInsuranceHistoryImport,
  saveInsuranceHistory,
  getPublishedLegalRules,
  listPensionEstimates,
  getPensionEstimate,
  previewPensionEstimate,
  savePensionEstimate,
} from "../src/services/insurance.ts";
import {
  listAdminLegalRules,
  getAdminLegalRule,
  createAdminLegalRule,
  patchAdminLegalRule,
  transitionAdminLegalRule,
} from "../src/services/legalRules.ts";
import { ApiError, clearAccessToken, invalidateApiCache } from "../src/services/api.ts";

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

test("FE-11: session switch rejects old history and preserves the new in-flight request/cache", async () => {
  clearAccessToken();
  let releaseOld, releaseNew, startedOld, startedNew;
  const oldStarted = new Promise(resolve => { startedOld = resolve; });
  const newStarted = new Promise(resolve => { startedNew = resolve; });
  let calls = 0;
  const restore = mockFetch(async () => {
    ++calls;
    if (calls === 1) {
      startedOld();
      await new Promise(resolve => { releaseOld = resolve; });
      return jsonResponse({ id: "history-A", userId: "account-A" });
    }
    startedNew();
    await new Promise(resolve => { releaseNew = resolve; });
    return jsonResponse({ id: "history-B", userId: "account-B" });
  });
  try {
    const first = getLatestInsuranceHistory();
    const rejected = assert.rejects(first, error => error instanceof ApiError && error.code === "SESSION_CHANGED");
    await oldStarted;
    clearAccessToken();
    const second = getLatestInsuranceHistory();
    await newStarted;
    releaseOld();
    await rejected;
    const duplicate = getLatestInsuranceHistory();
    releaseNew();
    assert.deepEqual(await second, { id: "history-B", userId: "account-B" });
    assert.deepEqual(await duplicate, await second);
    assert.deepEqual(await getLatestInsuranceHistory(), await second);
    assert.equal(calls, 2);
  } finally {
    clearAccessToken();
    restore();
  }
});

test("FE-00: getPublishedLegalRules correctly unpacks { items: [] } envelope and passes query", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  const restore = mockFetch((url, options) => {
    capturedUrl = url;
    capturedMethod = options.method || "GET";
    return jsonResponse({ items: [] });
  });

  try {
    const res = await getPublishedLegalRules("2045-06-01");
    assert.equal(capturedMethod, "GET");
    assert.ok(capturedUrl.includes("/me/pension/legal-rules?benefitDate=2045-06-01"));
    assert.ok(Array.isArray(res.items));
    assert.equal(res.items.length, 0);
  } finally {
    restore();
  }
});

test("FE-00: getPublishedLegalRules correctly returns published rules matching server contract", async () => {
  const sampleRule = {
    id: "99999999-9999-9999-9999-999999999999",
    code: "vn-bh1-employer-2025-v1",
    version: 1,
    effectiveFrom: "2025-07-01",
    effectiveTo: null,
    documentHash: "a".repeat(64),
    knowledgeAsOf: "2026-10-05T00:00:00.000Z",
    coverage: [
      {
        branch: "BH1_COMPULSORY_EMPLOYER_NORMAL",
        strategyCode: "vn-bh1-employer-2025-v1",
        citationIds: ["LAW_ART5"],
      },
    ],
    citations: [
      {
        id: "LAW_ART5",
        instrument: "Luật BHXH 41/2024/QH15",
        locator: "Điều 5",
        url: "https://example.com/law",
        effectiveFrom: "2025-07-01",
        effectiveTo: null,
      },
    ],
  };

  const restore = mockFetch(() => jsonResponse({ items: [sampleRule] }));

  try {
    const res = await getPublishedLegalRules("2045-06-01");
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].code, "vn-bh1-employer-2025-v1");
    assert.equal(res.items[0].version, 1);
    assert.equal(res.items[0].coverage[0].branch, "BH1_COMPULSORY_EMPLOYER_NORMAL");
  } finally {
    restore();
  }
});

test("FE-00: listPensionEstimates unpacks { items: [...] } envelope and preserves assessment structure", async () => {
  const sampleRecord = {
    id: "11111111-1111-1111-1111-111111111111",
    createdAt: "2026-10-07T12:00:00.000Z",
    integrityHash: "b".repeat(64),
    inputHash: "c".repeat(64),
    engineCode: "vn-pension-benefit-v1",
    assessedOn: "2026-10-07",
    historyVersionId: "22222222-2222-2222-2222-222222222222",
    historyRevision: 1,
    legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
    legalRuleVersion: 1,
    assessment: {
      assessmentStatus: "ELIGIBLE",
      estimateKind: "CURRENT_RULE_ESTIMATE",
      inputHash: "c".repeat(64),
      historyHash: "d".repeat(64),
      ruleHash: "e".repeat(64),
      countedMonths: 240,
      monthlyPension: "7590000.00",
      startMonth: "2045-06",
      lumpSum: null,
      missingFields: [],
      breakdown: [
        {
          code: "BENEFIT_RATE",
          value: "45",
          unit: "PERCENT",
          citationIds: ["LAW_ART5"],
        },
      ],
      citations: [],
    },
  };

  const restore = mockFetch((url) => {
    assert.ok(url.includes("/me/pension/estimates"));
    return jsonResponse({ items: [sampleRecord] });
  });

  try {
    const res = await listPensionEstimates();
    assert.ok(Array.isArray(res.items));
    assert.equal(res.items.length, 1);
    const rec = res.items[0];
    assert.equal(rec.id, sampleRecord.id);
    assert.equal(rec.assessment.assessmentStatus, "ELIGIBLE");
    assert.equal(rec.assessment.monthlyPension, "7590000.00");
    assert.equal(rec.assessment.countedMonths, 240);
  } finally {
    restore();
  }
});

test("FE-00: previewPensionEstimate sends full body and receives top-level inputHash + assessment", async () => {
  let capturedBody = null;
  const samplePreviewResult = {
    inputHash: "f".repeat(64),
    engineCode: "vn-pension-benefit-v1",
    assessedOn: "2026-10-07",
    historyVersionId: "22222222-2222-2222-2222-222222222222",
    historyRevision: 1,
    legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
    legalRuleVersion: 1,
    assessment: {
      assessmentStatus: "ELIGIBLE",
      estimateKind: "CURRENT_RULE_ESTIMATE",
      inputHash: "f".repeat(64),
      historyHash: "d".repeat(64),
      ruleHash: "e".repeat(64),
      countedMonths: 240,
      monthlyPension: "8000000.00",
      startMonth: "2045-06",
      lumpSum: null,
      missingFields: [],
      breakdown: [],
      citations: [],
    },
  };

  const restore = mockFetch((url, options) => {
    assert.ok(url.includes("/me/pension/estimates/preview"));
    assert.equal(options.method, "POST");
    capturedBody = JSON.parse(options.body);
    return jsonResponse(samplePreviewResult);
  });

  try {
    const input = {
      historyVersionId: "22222222-2222-2222-2222-222222222222",
      expectedHistoryRevision: 1,
      legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
      intendedBenefitDate: "2045-06-01",
      employmentEndDate: "2045-05-31",
      contributionStopMonth: "2045-05",
      benefitRequestDate: null,
      futureContributions: [],
      caseDetails: {
        kind: "NORMAL_EMPLOYEE",
        participationAtRetirement: "ACTIVE_COMPULSORY",
        benefitStart: {
          kind: "PERSON_REQUEST",
          month: "2045-06",
          evidence: [
            {
              reference: "REF-01",
              contentHash: "1".repeat(64),
              confirmedOn: "2026-10-07",
            },
          ],
        },
      },
    };

    const res = await previewPensionEstimate(input);
    assert.equal(capturedBody.intendedBenefitDate, "2045-06-01");
    assert.equal(capturedBody.caseDetails.kind, "NORMAL_EMPLOYEE");
    assert.equal(res.inputHash, "f".repeat(64));
    assert.equal(res.assessment.assessmentStatus, "ELIGIBLE");
    assert.equal(res.assessment.monthlyPension, "8000000.00");
  } finally {
    restore();
  }
});

test("FE-00: savePensionEstimate sends preview + expectedInputHash and idempotency header", async () => {
  let capturedBody = null;
  let capturedHeaders = null;

  const sampleRecord = {
    id: "44444444-4444-4444-4444-444444444444",
    createdAt: "2026-10-07T12:00:00.000Z",
    integrityHash: "9".repeat(64),
    inputHash: "f".repeat(64),
    engineCode: "vn-pension-benefit-v1",
    assessedOn: "2026-10-07",
    historyVersionId: "22222222-2222-2222-2222-222222222222",
    historyRevision: 1,
    legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
    legalRuleVersion: 1,
    assessment: {
      assessmentStatus: "ELIGIBLE",
      estimateKind: "CURRENT_RULE_ESTIMATE",
      inputHash: "f".repeat(64),
      historyHash: "d".repeat(64),
      ruleHash: "e".repeat(64),
      countedMonths: 240,
      monthlyPension: "8000000.00",
      startMonth: "2045-06",
      lumpSum: null,
      missingFields: [],
      breakdown: [],
      citations: [],
    },
  };

  const restore = mockFetch((url, options) => {
    assert.ok(url.includes("/me/pension/estimates"));
    assert.equal(options.method, "POST");
    capturedBody = JSON.parse(options.body);
    capturedHeaders = options.headers;
    return jsonResponse(sampleRecord, 201);
  });

  try {
    const previewInput = {
      historyVersionId: "22222222-2222-2222-2222-222222222222",
      expectedHistoryRevision: 1,
      legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
      intendedBenefitDate: "2045-06-01",
      employmentEndDate: "2045-05-31",
      contributionStopMonth: "2045-05",
      benefitRequestDate: null,
      futureContributions: [],
    };

    const res = await savePensionEstimate(previewInput, "f".repeat(64), "55555555-5555-5555-5555-555555555555");
    assert.equal(capturedHeaders["Idempotency-Key"], "55555555-5555-5555-5555-555555555555");
    assert.equal(capturedBody.expectedInputHash, "f".repeat(64));
    assert.equal(capturedBody.preview.historyVersionId, "22222222-2222-2222-2222-222222222222");
    assert.equal(res.id, sampleRecord.id);
    assert.equal(res.integrityHash, "9".repeat(64));
  } finally {
    restore();
  }
});

test("FE-00: getLatestInsuranceHistory handles null when user has no record", async () => {
  const restore = mockFetch((url) => {
    assert.ok(url.includes("/me/pension/history"));
    return jsonResponse(null);
  });

  try {
    const res = await getLatestInsuranceHistory();
    assert.equal(res, null);
  } finally {
    restore();
  }
});

test("FE-00: HTTP 409 conflict throws ApiError with status 409 and code", async () => {
  const restore = mockFetch(() => {
    return errorResponse(409, "PREVIEW_CHANGED", "Dữ liệu hoặc ngày đánh giá đã đổi. Hãy xem trước lại.");
  });

  try {
    await previewPensionEstimate({
      historyVersionId: "22222222-2222-2222-2222-222222222222",
      expectedHistoryRevision: 1,
      legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
      intendedBenefitDate: "2045-06-01",
      employmentEndDate: null,
      contributionStopMonth: null,
      benefitRequestDate: null,
      futureContributions: [],
    });
    assert.fail("Should have thrown ApiError");
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 409);
    assert.equal(err.code, "PREVIEW_CHANGED");
  } finally {
    restore();
  }
});

test("FE-00: HTTP 422 unprocessable throws ApiError with status 422 and fieldErrors", async () => {
  const restore = mockFetch(() => {
    return errorResponse(
      422,
      "VALIDATION_ERROR",
      "Dữ liệu không hợp lệ",
      { intendedBenefitDate: ["Required format YYYY-MM-DD"] }
    );
  });

  try {
    await previewPensionEstimate({
      historyVersionId: "22222222-2222-2222-2222-222222222222",
      expectedHistoryRevision: 1,
      legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
      intendedBenefitDate: "invalid-date",
      employmentEndDate: null,
      contributionStopMonth: null,
      benefitRequestDate: null,
      futureContributions: [],
    });
    assert.fail("Should have thrown ApiError");
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.ok(err.fieldErrors?.intendedBenefitDate);
  } finally {
    restore();
  }
});

test("FE-01: computeContentHash returns 64-character lowercase hex string", async () => {
  const { computeContentHash } = await import("../src/services/insurance.ts");
  const hash = await computeContentHash("Sổ BHXH số 0123456789:2026-05-15");
  assert.equal(typeof hash, "string");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
});

test("evidence hashing matches SHA-256 bytes and refuses unavailable crypto", async () => {
  const { computeContentHash } = await import("../src/services/insurance.ts");
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(await computeContentHash("abc"), expected);
  assert.equal(await computeContentHash(new TextEncoder().encode("abc").buffer), expected);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    await assert.rejects(() => computeContentHash("abc"), /HTTPS/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else delete globalThis.crypto;
  }
});

test("FE-01: previewInsuranceHistoryImport sends document and unpacks status & issues", async () => {
  let capturedBody = null;
  const samplePreviewResult = {
    status: "INCOMPLETE",
    inputHash: "a".repeat(64),
    issues: [
      { path: "months.2025-06", code: "CONTRIBUTION_EVIDENCE_REQUIRED" },
    ],
    normalized: {
      schemaVersion: 1,
      birth: { precision: "UNKNOWN", declaredValue: null },
      legalSex: "UNKNOWN",
      coverageFrom: "2025-01",
      coverageThrough: "2025-06",
      confirmedThroughMonth: "2025-06",
      months: [],
      specialPeriods: [],
    },
  };

  const restore = mockFetch((url, options) => {
    assert.ok(url.includes("/me/pension/history/import-preview"));
    assert.equal(options.method, "POST");
    capturedBody = JSON.parse(options.body);
    return jsonResponse(samplePreviewResult);
  });

  try {
    const doc = {
      schemaVersion: 1,
      birth: { precision: "UNKNOWN", declaredValue: null },
      legalSex: "UNKNOWN",
      coverageFrom: "2025-01",
      coverageThrough: "2025-06",
      confirmedThroughMonth: "2025-06",
      months: [],
      specialPeriods: [],
    };

    const res = await previewInsuranceHistoryImport(0, doc);
    assert.equal(capturedBody.expectedHistoryRevision, 0);
    assert.equal(capturedBody.document.coverageFrom, "2025-01");
    assert.equal(res.status, "INCOMPLETE");
    assert.equal(res.issues.length, 1);
    assert.equal(res.issues[0].code, "CONTRIBUTION_EVIDENCE_REQUIRED");
    assert.equal(res.inputHash, "a".repeat(64));
  } finally {
    restore();
  }
});

test("FE-01: saveInsuranceHistory sends preview envelope, expectedInputHash and confirm: true", async () => {
  let capturedBody = null;
  let capturedHeaders = null;
  const sampleSavedRecord = {
    id: "77777777-7777-7777-7777-777777777777",
    revision: 1,
    documentHash: "b".repeat(64),
    document: {
      schemaVersion: 1,
      birth: { precision: "YEAR", declaredValue: "1990" },
      legalSex: "FEMALE",
      coverageFrom: "2020-01",
      coverageThrough: "2025-12",
      confirmedThroughMonth: "2025-12",
      months: [],
      specialPeriods: [],
    },
    recordedAt: "2026-10-07T12:00:00.000Z",
  };

  const restore = mockFetch((url, options) => {
    assert.ok(url.includes("/me/pension/history"));
    assert.equal(options.method, "POST");
    capturedBody = JSON.parse(options.body);
    capturedHeaders = options.headers;
    return jsonResponse(sampleSavedRecord, 201);
  });

  try {
    const doc = sampleSavedRecord.document;
    const res = await saveInsuranceHistory(
      { expectedHistoryRevision: 0, document: doc },
      "c".repeat(64),
      "88888888-8888-8888-8888-888888888888"
    );

    assert.equal(capturedHeaders["Idempotency-Key"], "88888888-8888-8888-8888-888888888888");
    assert.equal(capturedBody.expectedInputHash, "c".repeat(64));
    assert.equal(capturedBody.confirm, true);
    assert.equal(capturedBody.preview.expectedHistoryRevision, 0);
    assert.equal(capturedBody.preview.document.legalSex, "FEMALE");
    assert.equal(res.id, sampleSavedRecord.id);
    assert.equal(res.revision, 1);
  } finally {
    restore();
  }
});

test("FE-02: savePensionEstimate preserves voluntaryTopUp and caseDetails in preview body", async () => {
  let capturedBody = null;
  const sampleRecord = {
    id: "99999999-9999-9999-9999-999999999999",
    createdAt: "2026-10-07T12:00:00.000Z",
    integrityHash: "d".repeat(64),
    inputHash: "e".repeat(64),
    engineCode: "vn-pension-topup-v1",
    assessedOn: "2026-10-07",
    historyVersionId: "22222222-2222-2222-2222-222222222222",
    historyRevision: 1,
    legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
    legalRuleVersion: 1,
    assessment: {
      assessmentStatus: "ELIGIBLE",
      estimateKind: "CURRENT_RULE_ESTIMATE",
      inputHash: "e".repeat(64),
      historyHash: "f".repeat(64),
      ruleHash: "1".repeat(64),
      countedMonths: 240,
      monthlyPension: "4500000.00",
      startMonth: "2030-01",
      lumpSum: null,
      missingFields: [],
      breakdown: [],
      citations: [],
    },
  };

  const restore = mockFetch((url, options) => {
    capturedBody = JSON.parse(options.body);
    return jsonResponse(sampleRecord, 201);
  });

  try {
    const inputWithTopUp = {
      historyVersionId: "22222222-2222-2222-2222-222222222222",
      expectedHistoryRevision: 1,
      legalRuleSetVersionId: "33333333-3333-3333-3333-333333333333",
      intendedBenefitDate: "2030-01-01",
      employmentEndDate: null,
      contributionStopMonth: null,
      benefitRequestDate: null,
      futureContributions: [],
      voluntaryTopUp: {
        kind: "MISSING_YEARS_TOP_UP",
        ageRule: "NORMAL",
        historyTreatment: "REGULAR_ONLY",
        paymentOn: "2026-10-07",
        missingMonths: 24,
        monthlyIncome: "6000000",
        confirmation: "DOCUMENTED_FULLY_PAID",
        evidence: [
          {
            reference: "Biên lai nộp tiền",
            contentHash: "2".repeat(64),
            confirmedOn: "2026-10-07",
          },
        ],
      },
    };

    const res = await savePensionEstimate(inputWithTopUp, "e".repeat(64));
    assert.ok(capturedBody.preview.voluntaryTopUp);
    assert.equal(capturedBody.preview.voluntaryTopUp.missingMonths, 24);
    assert.equal(capturedBody.preview.voluntaryTopUp.monthlyIncome, "6000000");
    assert.equal(capturedBody.expectedInputHash, "e".repeat(64));
    assert.equal(res.id, sampleRecord.id);
  } finally {
    restore();
  }
});

test("FE-06: listAdminLegalRules correctly unpacks { items: [...] } envelope", async () => {
  const sampleRule = {
    id: "rule-1111-1111-1111-111111111111",
    revision: 1,
    version: 1,
    status: "DRAFT",
    documentHash: "a".repeat(64),
    knowledgeAsOf: "2026-10-07T00:00:00.000Z",
    publishedAt: null,
    draft: {
      code: "BH2_TEST_RULE",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      supersedesId: null,
      document: {
        schemaVersion: 1,
        engineCode: "test-engine",
        coverage: [],
        citations: [],
        tables: [],
      },
    },
    validation: null,
    review: null,
  };

  const restore = mockFetch(async (url, options) => {
    assert.equal(options.method, "GET");
    assert.ok(url.endsWith("/admin/legal-rules"));
    return jsonResponse({ items: [sampleRule] });
  });

  try {
    const res = await listAdminLegalRules();
    assert.ok(Array.isArray(res.items));
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].id, sampleRule.id);
    assert.equal(res.items[0].draft.code, "BH2_TEST_RULE");
  } finally {
    restore();
  }
});

test("FE-06: createAdminLegalRule sends draft with idempotency key and returns 201 created draft", async () => {
  let capturedBody = null;
  let capturedHeaders = null;

  const sampleCreated = {
    id: "rule-new-2222-2222-222222222222",
    revision: 1,
    version: 1,
    status: "DRAFT",
    documentHash: "b".repeat(64),
    knowledgeAsOf: "2026-10-07T00:00:00.000Z",
    publishedAt: null,
    draft: {
      code: "BH2_VOLUNTARY_2026",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      supersedesId: null,
      document: {
        schemaVersion: 1,
        engineCode: "test-engine-2026",
        coverage: [],
        citations: [],
        tables: [],
      },
    },
    validation: null,
    review: null,
  };

  const restore = mockFetch(async (url, options) => {
    assert.equal(options.method, "POST");
    assert.ok(url.endsWith("/admin/legal-rules"));
    capturedBody = JSON.parse(options.body);
    capturedHeaders = options.headers;
    return jsonResponse(sampleCreated, 201);
  });

  try {
    const draftInput = {
      code: "BH2_VOLUNTARY_2026",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      supersedesId: null,
      document: {
        schemaVersion: 1,
        engineCode: "test-engine-2026",
        coverage: [],
        citations: [],
        tables: [],
      },
    };

    const res = await createAdminLegalRule(draftInput, "idem-create-key-123");
    assert.equal(capturedBody.code, "BH2_VOLUNTARY_2026");
    assert.equal(capturedHeaders["Idempotency-Key"], "idem-create-key-123");
    assert.equal(res.id, sampleCreated.id);
    assert.equal(res.status, "DRAFT");
    assert.equal(res.revision, 1);
  } finally {
    restore();
  }
});

test("FE-06: patchAdminLegalRule increments revision and resets status to DRAFT", async () => {
  let capturedBody = null;

  const samplePatched = {
    id: "rule-1111-1111-1111-111111111111",
    revision: 2,
    version: 1,
    status: "DRAFT",
    documentHash: "c".repeat(64),
    knowledgeAsOf: "2026-10-07T00:00:00.000Z",
    publishedAt: null,
    draft: {
      code: "BH2_TEST_RULE",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2030-12-31",
      supersedesId: null,
      document: {
        schemaVersion: 1,
        engineCode: "test-engine",
        coverage: [],
        citations: [],
        tables: [],
      },
    },
    validation: null,
    review: null,
  };

  const restore = mockFetch(async (url, options) => {
    assert.equal(options.method, "PATCH");
    assert.ok(url.includes("/admin/legal-rules/rule-1111"));
    capturedBody = JSON.parse(options.body);
    return jsonResponse(samplePatched);
  });

  try {
    const res = await patchAdminLegalRule(
      "rule-1111-1111-1111-111111111111",
      1,
      samplePatched.draft,
      "idem-patch-key-456"
    );
    assert.equal(capturedBody.expectedRevision, 1);
    assert.equal(capturedBody.draft.effectiveTo, "2030-12-31");
    assert.equal(res.revision, 2);
    assert.equal(res.status, "DRAFT");
  } finally {
    restore();
  }
});

test("FE-06: transitionAdminLegalRule handles full DRAFT -> VALIDATED -> REVIEWED -> PUBLISHED lifecycle", async () => {
  let step = 1;
  const docHash = "d".repeat(64);
  const valHash = "e".repeat(64);
  const revHash = "f".repeat(64);

  const restore = mockFetch(async (url, options) => {
    assert.equal(options.method, "POST");
    assert.ok(url.endsWith("/transitions"));
    const body = JSON.parse(options.body);

    if (body.action === "VALIDATE") {
      assert.equal(body.expectedRevision, 1);
      assert.equal(body.expectedDocumentHash, docHash);
      assert.equal(body.confirm, true);
      return jsonResponse({
        id: "rule-test-trans",
        revision: 2,
        version: 1,
        status: "VALIDATED",
        documentHash: docHash,
        validation: { valid: true, validationHash: valHash, checkedAt: "2026-10-07T00:00:00Z" },
        review: null,
      });
    }

    if (body.action === "REVIEW") {
      assert.equal(body.expectedRevision, 2);
      assert.equal(body.validationHash, valHash);
      assert.ok(body.reviewNote);
      assert.equal(body.confirm, true);
      return jsonResponse({
        id: "rule-test-trans",
        revision: 3,
        version: 1,
        status: "REVIEWED",
        documentHash: docHash,
        validation: { valid: true, validationHash: valHash, checkedAt: "2026-10-07T00:00:00Z" },
        review: {
          actor: "independent-admin-99",
          reviewedAt: "2026-10-07T00:00:00Z",
          reviewNote: body.reviewNote,
          validationHash: valHash,
          draftHash: "0".repeat(64),
          reviewHash: revHash,
        },
      });
    }

    if (body.action === "PUBLISH") {
      assert.equal(body.expectedRevision, 3);
      assert.equal(body.validationHash, valHash);
      assert.equal(body.reviewHash, revHash);
      assert.equal(body.confirm, true);
      return jsonResponse({
        id: "rule-test-trans",
        revision: 4,
        version: 1,
        status: "PUBLISHED",
        documentHash: docHash,
        publishedAt: "2026-10-07T00:00:00Z",
        validation: { valid: true, validationHash: valHash, checkedAt: "2026-10-07T00:00:00Z" },
        review: {
          actor: "independent-admin-99",
          reviewHash: revHash,
        },
      });
    }

    return errorResponse(400, "BAD_REQUEST", "Unexpected action");
  });

  try {
    // 1. VALIDATE
    const validated = await transitionAdminLegalRule("rule-test-trans", {
      action: "VALIDATE",
      expectedRevision: 1,
      expectedDocumentHash: docHash,
      confirm: true,
    });
    assert.equal(validated.status, "VALIDATED");
    assert.equal(validated.revision, 2);

    // 2. REVIEW
    const reviewed = await transitionAdminLegalRule("rule-test-trans", {
      action: "REVIEW",
      expectedRevision: 2,
      expectedDocumentHash: docHash,
      validationHash: valHash,
      reviewNote: "Verified against Official Gazette ND135/2020",
      confirm: true,
    });
    assert.equal(reviewed.status, "REVIEWED");
    assert.equal(reviewed.revision, 3);

    // 3. PUBLISH
    const published = await transitionAdminLegalRule("rule-test-trans", {
      action: "PUBLISH",
      expectedRevision: 3,
      expectedDocumentHash: docHash,
      validationHash: valHash,
      reviewHash: revHash,
      confirm: true,
    });
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.revision, 4);
    assert.ok(published.publishedAt);
  } finally {
    restore();
  }
});

test("FE-06: 403 Forbidden for non-admin and 409 Conflict on stale expectedRevision", async () => {
  const restore = mockFetch(async (url, options) => {
    if (url.includes("/admin/legal-rules") && options.method === "POST") {
      return errorResponse(403, "FORBIDDEN", "Chỉ quản trị viên được quản lý luật.");
    }
    if (url.includes("/admin/legal-rules") && options.method === "PATCH") {
      return errorResponse(409, "RULE_REVISION_CONFLICT", "Bộ luật đã đổi. Hãy kiểm tra và duyệt lại.");
    }
    return errorResponse(404, "NOT_FOUND", "Not found");
  });

  try {
    await assert.rejects(
      async () => {
        await createAdminLegalRule({
          code: "FORBIDDEN_RULE",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          supersedesId: null,
          document: { schemaVersion: 1, engineCode: "e", coverage: [], citations: [], tables: [] },
        });
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 403);
        assert.equal(err.code, "FORBIDDEN");
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await patchAdminLegalRule("rule-stale", 1, {
          code: "STALE_RULE",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          supersedesId: null,
          document: { schemaVersion: 1, engineCode: "e", coverage: [], citations: [], tables: [] },
        });
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 409);
        assert.equal(err.code, "RULE_REVISION_CONFLICT");
        return true;
      }
    );
  } finally {
    restore();
  }
});


