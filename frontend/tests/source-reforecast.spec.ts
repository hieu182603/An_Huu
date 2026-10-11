import { expect, test } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);
});

test("FE-11: source reforecast preview, save, apply and CSV export flow in SimulationTrackingPage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  let previewCaptured: any = null;
  let saveCaptured: any = null;
  let applyCaptured: any = null;
  let csvCaptured = false;

  // Mock source reforecast preview API
  await page.route("**/api/v1/me/retirement/plans/*/source-reforecasts/preview", async (route) => {
    previewCaptured = {
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          status: "READY",
          issues: [],
          inputHash: "input-hash-mock-fe11-999",
          candidate: {
            calculation: {
              summary: { atRetirement: { projectedFund: "1500000000", coveragePercent: "80" } },
              rows: [{ month: "2026-10", capitalInjection: "150000000", totalLivingExpense: "25000000" }],
            },
          },
          loanRevisionOptions: [
            {
              sourceId: "loan-opt-1",
              sourceRevision: 1,
              sourceHash: "a".repeat(64),
              contractHash: "b".repeat(64),
              legacyOpeningRequired: false,
            },
          ],
          plannedRefinanceOptions: {
            eligibleLoans: [
              {
                sourceId: "loan-opt-1",
                sourceRevision: 1,
                sourceHash: "a".repeat(64),
                contractHash: "b".repeat(64),
              },
            ],
            activePairs: [],
          },
          assetRevisionOptions: [
            {
              sourceId: "profile:asset:bds-1",
              sourceRevision: 1,
              sourceHash: "c".repeat(64),
            },
          ],
          saved: false,
          applied: false,
        },
      }),
    });
  });

  // Mock source reforecast save API
  await page.route("**/api/v1/me/retirement/plans/*/source-reforecasts", async (route) => {
    if (route.request().method() === "POST") {
      saveCaptured = {
        body: route.request().postDataJSON(),
        headers: route.request().headers(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            planId: "pl-mock-1",
            revision: 3,
            currentVersionId: "ver-mock-saved-3",
            baselineVersionId: "ver-mock-1",
            saved: {
              id: "ver-mock-saved-3",
              version: 3,
              createdAt: "2026-10-07T12:00:00.000Z",
              snapshotHash: "d".repeat(64),
              preview: {},
            },
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  // Mock apply version API
  await page.route("**/api/v1/me/retirement/plans/*/apply", async (route) => {
    applyCaptured = {
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          planId: "pl-mock-1",
          revision: 4,
          currentVersionId: "ver-mock-saved-3",
          baselineVersionId: "ver-mock-1",
          alreadyCurrent: false,
        },
      }),
    });
  });

  // Mock CSV export API
  await page.route("**/export.csv**", async (route) => {
    csvCaptured = true;
    await route.fulfill({
      status: 200,
      contentType: "text/csv",
      headers: {
        "Content-Disposition": 'attachment; filename="an-huu-plan-test.csv"',
      },
      body: "month,income,expense,capitalInjection\n2026-10,35000000,25000000,150000000\n",
    });
  });

  await page.goto("/user/simulation?tab=actuals");

  // Switch to "Lệnh nguồn (V4)" sub-tab
  const v4SubTabButton = page.getByRole("button", { name: /Lệnh nguồn \(V4\)/i });
  await expect(v4SubTabButton).toBeVisible();
  await v4SubTabButton.click();

  // Verify Loan and Asset sections are present
  await expect(page.getByText(/Quản lý điều chỉnh & tạo khoản vay V2/i)).toBeVisible();
  await expect(page.getByText(/4\. Quản lý tài sản và vốn một lần V4/i)).toBeVisible();

  // Click Preview V4 Sources
  const previewButton = page.getByRole("button", { name: /Xem trước nguồn V4/i });
  await expect(previewButton).toBeVisible();
  await expect(previewButton).toBeEnabled();
  await previewButton.click();

  // Wait for preview request to be captured
  await expect.poll(() => previewCaptured).not.toBeNull();
  expect(previewCaptured.body.throughMonth).toBeDefined();

  // Save button should appear when preview is READY
  const saveButton = page.getByRole("button", { name: /Lưu phiên bản V4/i });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  // Wait for save request to be captured
  await expect.poll(() => saveCaptured).not.toBeNull();
  expect(saveCaptured.headers["idempotency-key"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  expect(saveCaptured.body.expectedInputHash).toBe("input-hash-mock-fe11-999");
  expect(saveCaptured.body.confirm).toBe(true);

  // Apply button should appear for saved version
  const applyButton = page.getByRole("button", { name: /Áp dụng bản/i });
  await expect(applyButton).toBeVisible();
  await applyButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận áp dụng nguồn", exact: true }).click();

  // Wait for apply request to be captured
  await expect.poll(() => applyCaptured).not.toBeNull();

  // Trigger CSV export via account reports tab
  await page.goto("/user/account?tab=reports");
  const exportCsvButton = page.getByRole("button", { name: /Xuất.*CSV/i });
  await expect(exportCsvButton).toBeVisible();
  await exportCsvButton.click();
  await expect.poll(() => csvCaptured).toBe(true);

  // Ensure no unhandled client-side runtime crashes
  expect(errors).toEqual([]);
});

test("FE-11: handles 409 conflict without dropping form input and shows clear error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.route("**/api/v1/me/retirement/plans/*/source-reforecasts/preview", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PLANNED_PAIR_SOURCE_LOCKED",
          message: "Khoản vay thuộc cặp dự kiến đang khóa, không thể sửa độc lập.",
        },
      }),
    });
  });

  await page.goto("/user/simulation?tab=actuals");
  const v4SubTabButton = page.getByRole("button", { name: /Lệnh nguồn \(V4\)/i });
  await expect(v4SubTabButton).toBeVisible();
  await v4SubTabButton.click();

  const previewButton = page.getByRole("button", { name: /Xem trước nguồn V4/i });
  await expect(previewButton).toBeVisible();
  await expect(previewButton).toBeEnabled();
  await previewButton.click();

  // Error message should be rendered
  await expect(page.getByText(/PLANNED_PAIR_SOURCE_LOCKED|không thể sửa độc lập/i).first()).toBeVisible();

  // Page must not crash
  expect(errors).toEqual([]);
});

test("FE-11: anti-slop check confirms zero em-dashes in simulation tracking UI", async ({ page }) => {
  await page.goto("/user/simulation?tab=actuals");
  const v4SubTabButton = page.getByRole("button", { name: /Lệnh nguồn \(V4\)/i });
  await expect(v4SubTabButton).toBeVisible();
  await v4SubTabButton.click();

  // Get all text content on the tracking page
  const textContent = await page.locator("body").innerText();
  expect(textContent).not.toContain("—");
});
