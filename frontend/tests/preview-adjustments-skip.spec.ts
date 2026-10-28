import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

const profile = {
  revision: 3,
  schemaVersion: 2,
  data: {
    schemaVersion: 2,
    valuationDate: "2026-10-15",
    currency: "VND",
    periodUnit: "MONTH",
    personal: {
      birthMonth: { status: "KNOWN", value: "1980-01" },
      desiredRetirementMonth: { status: "KNOWN", value: "2033-11" },
      pensionStartMonth: { status: "UNKNOWN" },
    },
    income: { status: "KNOWN", entries: [] },
    expenses: { status: "KNOWN", entries: [] },
    assets: { status: "KNOWN", entries: [] },
    debts: { status: "NOT_APPLICABLE", reason: "Không có nợ" },
    pension: { status: "UNKNOWN" },
  },
};

const defaultAdjustments = {
  status: "REVIEW_REQUIRED",
  requiredMonthlyContribution: "3500000",
  contributionWithinCapacity: true,
  earliestFeasibleRetirementMonth: "2035-01",
  feasibleRetirementCandidate: "2035-01",
  retirementSearchStatus: "FOUND",
  maximumFeasibleMonthlyExpenseToday: "18000000",
  expenseSearchStatus: "FOUND",
  endMonth: "2065-01",
  evaluations: 64,
  issues: [],
};

const selection = {
  expectedProfileRevision: 3,
  policyVersionId: "policy-test",
  templateId: policies.v2.templates[0].id,
  scenario: "BASE",
  answers: policies.v2.questions.map((q: any) => ({ questionId: q.id, choiceId: q.choices[0].id })),
  liquidityNeedMonths: 6,
  endMonth: "2065-01",
  monthlyExpenseToday: "20000000",
  monthlyContribution: "2000000",
  monthlyReserve: "0",
  retirementIncomeIds: [],
};

function createPreviewResponse(input: any, funded = false, adjustmentsData?: any) {
  const comparison = funded
    ? { requiredFund: "800000000", projectedFund: "1000000000", fundingGap: "0", coveragePercent: "125" }
    : { requiredFund: "1000000000", projectedFund: "800000000", fundingGap: "200000000", coveragePercent: "80" };

  return {
    status: "READY",
    issues: [],
    warnings: [],
    modelVersion: "retirement-monthly-v3",
    inputHash: `hash-${JSON.stringify(input)}`,
    profileRevision: 3,
    valuationDate: "2026-10-15",
    references: { assumptionVersionId: "assumption-test", assumptionVersion: 3 },
    decisionExplanations: [
      { code: funded ? "PLAN_FUNDED" : "PLAN_NOT_FUNDED", text: funded ? "Kế hoạch đủ tiền" : "Kế hoạch chưa đủ tiền" },
    ],
    selection: input,
    calculation: {
      summary: {
        retirementMonth: "2033-11",
        endMonth: input.endMonth,
        accumulationMonths: 85,
        retirementMonths: 375,
        initialRetirementCapital: "1479290000",
        futureMonthlyExpense: "25000000",
        atRetirement: comparison,
        atValuation: comparison,
        requiredConstantMonthlyContribution: funded ? "2000000" : "5000000",
        plannedMonthlyContribution: input.monthlyContribution,
        additionalMonthlyContribution: funded ? "0" : "3000000",
        savingsStatus: funded ? "NO_ADDITIONAL_CONTRIBUTION" : "ADDITIONAL_CONTRIBUTION_REQUIRED",
        retirementFundingShortfall: funded ? "0" : "200000000",
        excessAtRetirement: funded ? "200000000" : "0",
        unfundedWithdrawals: "0",
        terminalBalance: "0",
        terminalTarget: "0",
        terminalTargetShortfall: "0",
        firstShortfallMonth: funded ? null : "2040-01",
        firstBudgetShortfallMonth: null,
      },
      rows: [],
      limitations: [],
      assessment: { selectedTemplateId: input.templateId },
    },
    ...(adjustmentsData ? { adjustmentOptions: adjustmentsData } : {}),
  };
}

interface SetupOptions {
  funded?: boolean;
  adjustmentsErrorStatus?: number;
  adjustmentsErrorCode?: string;
  delayAdjustmentsMs?: number;
  delaySkipMs?: number;
  onPreviewRequest?: (req: { url: string; adjustments: string | null; input: any }) => void;
}

async function setupPlanTest(page: Page, options: SetupOptions = {}) {
  const previewRequests: Array<{ url: string; adjustments: string | null; input: any; timestamp: number }> = [];

  await installRouteAuth(page);
  await installFinancialProfileRoutes(page, { profile: structuredClone(profile), draft: null });
  await page.route("**/socket.io/**", (r) => r.abort());
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());

  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies**", (r) =>
    r.fulfill({
      json: {
        data: new URL(r.request().url()).pathname.endsWith("/policy-test")
          ? policy
          : { status: "AVAILABLE", items: [policy] },
      },
    })
  );

  await page.route("**/api/v1/me/retirement/plans**", (r) =>
    r.fulfill({ json: { data: { items: [], total: 0 } } })
  );

  await page.route("**/api/v1/me/retirement/preview*", async (route) => {
    const req = route.request();
    const urlObj = new URL(req.url());
    const adjustmentsParam = urlObj.searchParams.get("adjustments");
    const input = req.postDataJSON();

    const record = { url: req.url(), adjustments: adjustmentsParam, input, timestamp: Date.now() };
    previewRequests.push(record);
    options.onPreviewRequest?.(record);

    if (adjustmentsParam === "include") {
      if (options.delayAdjustmentsMs) {
        await new Promise((res) => setTimeout(res, options.delayAdjustmentsMs));
      }

      if (options.adjustmentsErrorStatus) {
        return route.fulfill({
          status: options.adjustmentsErrorStatus,
          json: {
            error: {
              code: options.adjustmentsErrorCode ?? "PREVIEW_BUSY",
              message: "Máy chủ đang xử lý nhiều lượt tính toán.",
            },
          },
        });
      }

      return route.fulfill({
        json: {
          data: createPreviewResponse(input, options.funded ?? false, defaultAdjustments),
        },
      });
    }

    // Default "skip" preview
    if (options.delaySkipMs) await new Promise((res) => setTimeout(res, options.delaySkipMs));
    return route.fulfill({
      json: {
        data: createPreviewResponse(input, options.funded ?? false),
      },
    });
  });

  await page.addInitScript(
    ({ input }) => {
      localStorage.setItem("anhuu_language", "vi");
      sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify(input));
    },
    { input: selection }
  );

  return { previewRequests };
}

test.describe("Retirement Plan Preview adjustments=skip & include behavior", () => {
  test("1. Mở /user/plan: bản chính và 3 thẻ kịch bản đều gọi ?adjustments=skip", async ({ page }) => {
    const { previewRequests } = await setupPlanTest(page);

    await page.goto("/user/plan");

    // Wait for the main result and guided scenarios to be visible
    await expect(page.locator(".result-total")).toBeVisible();
    await expect(page.locator(".guided-scenarios")).toBeVisible();

    // Give a brief moment for initial scenario preview calls to finish
    await page.waitForTimeout(500);

    // There must be at least 4 preview requests: 1 main plan + 3 scenario cards
    expect(previewRequests.length).toBeGreaterThanOrEqual(4);

    // Every single initial request must have ?adjustments=skip
    for (const req of previewRequests) {
      expect(req.adjustments).toBe("skip");
    }

    // None should be include yet
    const includeCalls = previewRequests.filter((r) => r.adjustments === "include");
    expect(includeCalls.length).toBe(0);
  });

  test("2. Kết quả chưa đủ tiền và khối điều chỉnh hiển thị: đúng 1 request ?adjustments=include sau debounce", async ({
    page,
  }) => {
    const { previewRequests } = await setupPlanTest(page, { funded: false });

    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).toBeVisible();

    // Target the adjustment options container
    const adjustmentsSection = page.locator('[data-testid="adjustment-options"]');
    await adjustmentsSection.scrollIntoViewIfNeeded();

    // Before debounce (e.g. at 200ms), adjustments=include shouldn't have been called yet
    const beforeDebounceInclude = previewRequests.filter((r) => r.adjustments === "include");
    expect(beforeDebounceInclude.length).toBe(0);

    // After debounce (>= 1s) and fetch, the section renders adjustment options
    await expect(adjustmentsSection).toContainText("Ba hướng điều chỉnh", { timeout: 4000 });
    await expect(adjustmentsSection).toContainText("Góp thêm — khoản góp mỗi tháng cần có");

    // Exactly 1 include request was sent
    const includeCalls = previewRequests.filter((r) => r.adjustments === "include");
    expect(includeCalls.length).toBe(1);
    expect(includeCalls[0].adjustments).toBe("include");
  });

  test("2b. Tìm phương án mất hơn 20 giây (như dữ liệu thật) vẫn hiện kết quả, không bị trình duyệt tự hủy", async ({ page }) => {
    test.setTimeout(90_000);
    // Real profiles need ~30–50 s; the default client timeout (20 s) used to abort it.
    const { previewRequests } = await setupPlanTest(page, { funded: false, delayAdjustmentsMs: 23_000 });

    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).toBeVisible();
    const adjustmentsSection = page.locator('[data-testid="adjustment-options"]');
    await adjustmentsSection.scrollIntoViewIfNeeded();

    await expect(adjustmentsSection).toContainText("Góp thêm — khoản góp mỗi tháng cần có", { timeout: 40_000 });
    await expect(adjustmentsSection).not.toContainText("Không thể tìm phương án điều chỉnh");
    expect(previewRequests.filter((r) => r.adjustments === "include")).toHaveLength(1);
  });

  test("3. Đổi đầu vào trong lúc chờ: request cũ bị hủy và chỉ dùng kết quả mới", async ({ page }) => {
    let includeCallCount = 0;
    const requestedInputs: any[] = [];

    const { previewRequests } = await setupPlanTest(page, {
      funded: false,
      onPreviewRequest: (req) => {
        if (req.adjustments === "include") {
          includeCallCount++;
          requestedInputs.push(req.input);
        }
      },
    });

    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).toBeVisible();

    // Scroll adjustment section into view to start debounce
    const adjustmentsSection = page.locator('[data-testid="adjustment-options"]');
    await adjustmentsSection.scrollIntoViewIfNeeded();

    // Within 400ms (during the 1000ms debounce), change input by clicking Chip 1 or changing monthly contribution
    await page.waitForTimeout(300);

    // Click "Góp đủ mức cần" chip or change contribution to trigger draft update
    const chipRequired = page.locator('button.plan-settings__chip:has-text("Góp đủ mức cần")');
    if (await chipRequired.isVisible()) {
      await chipRequired.click();
    } else {
      // Fallback: click custom amount
      const chipCustom = page.locator('button.plan-settings__chip:has-text("Tự nhập")');
      await chipCustom.click();
    }

    // Ensure adjustment section is viewed after changing input
    await adjustmentsSection.scrollIntoViewIfNeeded();

    // Wait for the new debounce and result to resolve with rendered adjustment options
    await expect(adjustmentsSection).toContainText("Góp thêm — khoản góp mỗi tháng cần có", { timeout: 6000 });

    // The old debounced include request was cancelled, only the latest input sent include
    const includeCalls = previewRequests.filter((r) => r.adjustments === "include");
    expect(includeCalls.length).toBe(1);
    expect(includeCalls[0].input.monthlyContribution).toBe("5000000");
  });

  test("4. Kết quả đủ tiền: không có request include", async ({ page }) => {
    const { previewRequests } = await setupPlanTest(page, { funded: true });

    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).toBeVisible();

    // Scroll to bottom of page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    // When funded, no adjustment section is rendered, and NO adjustments=include request is sent
    const includeCalls = previewRequests.filter((r) => r.adjustments === "include");
    expect(includeCalls.length).toBe(0);

    // Adjustment section should not be in the document
    await expect(page.locator('[data-testid="adjustment-options"]')).toHaveCount(0);
  });

  test("5. 503 PREVIEW_BUSY: hiện nút 'Thử lại', bấm thì gửi lại", async ({ page }) => {
    let failFirstInclude = true;
    const { previewRequests } = await setupPlanTest(page, {
      funded: false,
      adjustmentsErrorStatus: 503,
      adjustmentsErrorCode: "PREVIEW_BUSY",
    });

    // Override the route to fail on the first include request, and succeed on retry
    await page.route("**/api/v1/me/retirement/preview*", async (route) => {
      const req = route.request();
      const urlObj = new URL(req.url());
      const adjustmentsParam = urlObj.searchParams.get("adjustments");
      const input = req.postDataJSON();

      previewRequests.push({ url: req.url(), adjustments: adjustmentsParam, input, timestamp: Date.now() });

      if (adjustmentsParam === "include") {
        if (failFirstInclude) {
          failFirstInclude = false;
          return route.fulfill({
            status: 503,
            json: {
              error: {
                code: "PREVIEW_BUSY",
                message: "Máy chủ đang xử lý nhiều lượt tính toán.",
              },
            },
          });
        }

        return route.fulfill({
          json: {
            data: createPreviewResponse(input, false, defaultAdjustments),
          },
        });
      }

      return route.fulfill({
        json: {
          data: createPreviewResponse(input, false),
        },
      });
    });

    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).toBeVisible();

    const adjustmentsSection = page.locator('[data-testid="adjustment-options"]');
    await adjustmentsSection.scrollIntoViewIfNeeded();

    // Wait for the error state to appear
    await expect(adjustmentsSection.locator(".adjustments-error")).toBeVisible({ timeout: 4000 });
    await expect(adjustmentsSection).toContainText("Máy chủ đang xử lý nhiều lượt tính toán");

    const retryButton = adjustmentsSection.locator('button:has-text("Thử lại")');
    await expect(retryButton).toBeVisible();

    // Count include requests so far (should be 1)
    const initialIncludes = previewRequests.filter((r) => r.adjustments === "include");
    expect(initialIncludes.length).toBe(1);

    // Click "Thử lại"
    await retryButton.click();

    // The retry should succeed and render the adjustment options
    await expect(adjustmentsSection).toContainText("Góp thêm — khoản góp mỗi tháng cần có", { timeout: 4000 });
    await expect(adjustmentsSection.locator(".adjustments-error")).toHaveCount(0);

    // Count include requests now (should be 2)
    const finalIncludes = previewRequests.filter((r) => r.adjustments === "include");
    expect(finalIncludes.length).toBe(2);
  });

  test("6. Preview chậm: không gửi trùng request giống hệt khi request trước chưa xong", async ({ page }) => {
    // Production previews take seconds and run one at a time; the plan context and the
    // "keep your plan" scenario ask for the same body while the first is in flight.
    const { previewRequests } = await setupPlanTest(page, { delaySkipMs: 1500 });

    await page.goto("/user/plan");
    await expect(page.locator(".result-total")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    const skipBodies = previewRequests.filter((r) => r.adjustments === "skip").map((r) => JSON.stringify(r.input));
    expect(skipBodies.length).toBeGreaterThan(0);
    expect(new Set(skipBodies).size).toBe(skipBodies.length);
    // Main plan + the two changed scenarios; the unchanged scenario shares the main request.
    expect(skipBodies.length).toBe(3);
  });
});
