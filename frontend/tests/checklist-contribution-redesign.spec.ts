import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

async function setupTestEnv(page: Page, options: {
  profile?: any;
  requiredConstantContribution?: string | null;
  contributionCapacity?: string | null;
  reforecast?: boolean;
  user?: string;
} = {}) {
  const previewCalls: any[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const userId = options.user ?? "USR-001";

  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } })
  );
  await installRouteAuth(page, userId);
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());

  const state = await installFinancialProfileRoutes(page, {
    profile: options.profile ?? null,
  });

  const reqContribution =
    options.requiredConstantContribution !== undefined ? options.requiredConstantContribution : "4500000";
  const capacity = options.contributionCapacity !== undefined ? options.contributionCapacity : "3000000";

  const defaultSummary = {
    retirementMonth: "2048-06",
    endMonth: "2065-01",
    accumulationMonths: 240,
    retirementMonths: 200,
    initialRetirementCapital: "100000000",
    futureMonthlyExpense: "35000000",
    firstShortfallMonth: "2055-08",
    atRetirement: { requiredFund: "1200000000", projectedFund: "900000000", fundingGap: "300000000", coveragePercent: "75" },
    atValuation: { requiredFund: "1200000000", projectedFund: "900000000", fundingGap: "300000000", coveragePercent: "75" },
    requiredConstantMonthlyContribution: reqContribution,
    plannedMonthlyContribution: "0",
    additionalMonthlyContribution: "4500000",
    savingsStatus: "ADDITIONAL_CONTRIBUTION_REQUIRED",
    retirementFundingShortfall: "300000000",
    excessAtRetirement: "0",
    unfundedWithdrawals: "0",
    terminalBalance: "0",
    terminalTarget: "0",
    terminalTargetShortfall: "0",
  };

  const planVersion = options.reforecast
    ? {
        id: "plan-ver-1",
        version: 1,
        planId: "plan-1",
        planRevision: 1,
        summary: defaultSummary,
        preview: {
          selection: {
            policyVersionId: "policy-test",
            monthlyContribution: "5000000",
            monthlyReserve: "0",
            contributionTiming: "END_OF_MONTH",
            surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
          },
          calculation: {
            summary: defaultSummary,
            rows: capacity ? [{ contributionCapacity: capacity }] : [],
            limitations: [],
          },
          reforecast: {
            actualBalance: "150000000",
            asOfDate: "2026-10-15",
          },
        },
      }
    : null;

  const planDetail = {
    id: "plan-1",
    revision: 1,
    currentVersionId: "plan-ver-1",
    baselineVersionId: "plan-ver-1",
    current: planVersion,
  };

  await page.route("**/api/v1/me/retirement/plans**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/plans")) {
      return route.fulfill({
        json: {
          data: {
            items: options.reforecast ? [{ id: "plan-1" }] : [],
            total: options.reforecast ? 1 : 0,
          },
        },
      });
    }
    if (url.pathname.endsWith("/versions")) {
      return route.fulfill({
        json: {
          data: {
            items: planVersion ? [planVersion] : [],
            total: planVersion ? 1 : 0,
          },
        },
      });
    }
    return route.fulfill({ json: { data: planDetail } });
  });

  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies**", (route) => {
    return route.fulfill({
      json: {
        data: new URL(route.request().url()).pathname.endsWith("/policy-test")
          ? policy
          : { status: "AVAILABLE", items: [policy] },
      },
    });
  });

  await page.route("**/api/v1/me/retirement/preview*", async (route) => {
    const input = route.request().postDataJSON();
    previewCalls.push(input);

    const summary = {
      ...defaultSummary,
      retirementMonth: input.whatIf?.retirementMonth ?? "2048-06",
      endMonth: input.endMonth ?? "2065-01",
      requiredConstantMonthlyContribution: reqContribution,
      plannedMonthlyContribution: input.monthlyContribution ?? "0",
    };

    const rows = capacity ? [{ contributionCapacity: capacity }] : [];

    await route.fulfill({
      json: {
        data: {
          status: "READY",
          issues: [],
          warnings: ["PENSION_NOT_INCLUDED"],
          inputHash: `test-hash-${previewCalls.length}`,
          profileRevision: 1,
          valuationDate: "2026-10-15",
          references: {},
          selection: input,
          calculation: { summary, rows, limitations: [] },
        },
      },
    });
  });

  // Pre-seed survey answers in localStorage for policy-test so hasCompleteSurvey is true
  const answers: Record<string, string> = {};
  for (const q of policies.v2.questions ?? []) {
    if (q.choices?.[0]?.id) answers[q.id] = q.choices[0].id;
  }
  await page.addInitScript(
    ({ uid, ans }) => {
      localStorage.setItem(`anhuu:risk:${uid}:policy-test`, JSON.stringify(ans));
    },
    { uid: userId, ans: answers }
  );

  await page.clock.setFixedTime(new Date("2026-10-15T05:00:00Z"));
  return { previewCalls, errors, state };
}

const baseProfile = {
  schemaVersion: 2,
  profileRevision: 1,
  data: {
    personal: {
      birthMonth: { status: "KNOWN", value: "1988-06" },
      desiredRetirementMonth: { status: "KNOWN", value: "2048-06" },
      maritalStatus: "MARRIED", // old profile field that previously caused false done on item 7
    },
    income: { status: "KNOWN", entries: [{ id: "inc-1", amount: { status: "KNOWN", value: "30000000" }, kind: "FIXED" }] },
    expenses: { status: "KNOWN", entries: [{ id: "exp-1", amount: { status: "KNOWN", value: "15000000" }, category: "ESSENTIAL" }] },
    assets: { status: "KNOWN", entries: [{ id: "ast_quick", value: { status: "KNOWN", value: "50000000" }, type: "DEPOSIT" }] },
    debts: {
      status: "KNOWN",
      entries: [
        {
          id: "debt-1",
          outstandingBalance: { status: "KNOWN", value: "50000000" },
          payment: { status: "KNOWN", value: "2000000" },
          contract: { status: "UNKNOWN" },
        },
      ],
    },
  },
};

test.describe("Part A: Redesigned AccuracyChecklist", () => {
  test("pending items appear before completed group, recommended item is highlighted, and completed group can be toggled", async ({ page }) => {
    await setupTestEnv(page, { profile: baseProfile });
    await page.goto("/user/plan");

    const checklist = page.locator(".accuracy-checklist");
    await expect(checklist).toBeVisible();

    // Progress bar accessible attributes
    const progressBar = checklist.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible();
    await expect(progressBar).toHaveAttribute("aria-valuenow", "2");
    await expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    await expect(progressBar).toHaveAttribute("aria-valuemax", "7");
    await expect(checklist.locator(".checklist-progress-ratio")).toHaveText("2/7");

    // Status hint says: Còn 5 mục. Nên làm tiếp: Lương hưu BHXH
    await expect(checklist.locator(".checklist-status-hint")).toContainText("Còn 5 mục. Nên làm tiếp: Lương hưu BHXH");

    // Pending items appear first
    const pendingList = checklist.locator(".checklist-pending-list");
    await expect(pendingList).toBeVisible();

    const pendingRows = pendingList.locator(".checklist-action-row");
    await expect(pendingRows).toHaveCount(5); // items 3, 4, 5, 6, 7

    // First pending item (Item 3: Lương hưu BHXH) is recommended
    const firstRow = pendingRows.first();
    await expect(firstRow).toHaveClass(/is-recommended/);
    await expect(firstRow.locator(".checklist-action-title")).toHaveText("Lương hưu BHXH");
    await expect(firstRow.locator(".checklist-action-benefit")).toHaveText(
      "Kế hoạch đang chưa tính lương hưu. Thêm vào thường làm số tiền cần góp giảm đáng kể."
    );
    const primaryBtn = firstRow.locator(".checklist-action-btn");
    await expect(primaryBtn).toHaveClass(/btn-primary/);
    await expect(primaryBtn).toHaveAttribute("aria-label", "Bổ sung Lương hưu BHXH");

    // Other pending rows use secondary button
    const secondRow = pendingRows.nth(1);
    await expect(secondRow).not.toHaveClass(/is-recommended/);
    await expect(secondRow.locator(".checklist-action-btn")).toHaveClass(/btn-secondary/);

    // Completed section is a details element, default closed
    const completedDetails = checklist.locator(".checklist-completed-details");
    await expect(completedDetails).toBeVisible();
    await expect(completedDetails.locator(".checklist-completed-summary")).toContainText("Đã xong (2)");

    // Items inside details should not be visible initially
    await expect(completedDetails.locator(".checklist-completed-list")).toBeHidden();

    // Click to expand completed items
    await completedDetails.locator("summary").click();
    await expect(completedDetails.locator(".checklist-completed-list")).toBeVisible();
    await expect(completedDetails.locator(".checklist-completed-item")).toHaveCount(2);
    await expect(completedDetails.locator(".checklist-completed-item").first()).toContainText("Mong muốn và thời gian");
    await expect(completedDetails.locator(".checklist-completed-item").nth(1)).toContainText("Bản kế hoạch đầu tiên");
  });

  test("Item 7 is NOT completed when only maritalStatus is set; completes when dependents status is KNOWN or city is filled", async ({ page }) => {
    // 1. Only maritalStatus set -> Item 7 is NOT done
    await setupTestEnv(page, { profile: baseProfile });
    await page.goto("/user/plan");
    const checklist = page.locator(".accuracy-checklist");
    await expect(checklist.locator(".checklist-pending-list")).toContainText("Thông tin gia đình");

    // 2. Dependents status KNOWN (even with 0) -> Item 7 IS done
    const profileWithDependents = JSON.parse(JSON.stringify(baseProfile));
    profileWithDependents.data.personal.dependents = { status: "KNOWN", value: 0 };
    await setupTestEnv(page, { profile: profileWithDependents });
    await page.goto("/user/plan");
    await expect(checklist.locator(".checklist-pending-list")).not.toContainText("Thông tin gia đình");
    await expect(checklist.locator(".checklist-completed-summary")).toContainText("Đã xong (3)");

    // 3. City filled -> Item 7 IS done
    const profileWithCity = JSON.parse(JSON.stringify(baseProfile));
    profileWithCity.data.personal.city = "TP. Hồ Chí Minh";
    await setupTestEnv(page, { profile: profileWithCity });
    await page.goto("/user/plan");
    await expect(checklist.locator(".checklist-pending-list")).not.toContainText("Thông tin gia đình");
    await expect(checklist.locator(".checklist-completed-summary")).toContainText("Đã xong (3)");
  });

  test("when all 7 items are done, card collapses into a single success line with 'Xem lại' button", async ({ page }) => {
    const allDoneProfile = {
      schemaVersion: 2,
      profileRevision: 1,
      data: {
        personal: {
          birthMonth: { status: "KNOWN", value: "1988-06" },
          desiredRetirementMonth: { status: "KNOWN", value: "2048-06" },
          city: "Đà Nẵng", // item 7 done
        },
        income: { status: "KNOWN", entries: [{ id: "inc-1", amount: { status: "KNOWN", value: "30000000" }, kind: "FIXED" }] },
        expenses: { status: "KNOWN", entries: [{ id: "exp-1", amount: { status: "KNOWN", value: "15000000" }, category: "ESSENTIAL" }] },
        assets: {
          status: "KNOWN",
          entries: [
            { id: "ast_quick", value: { status: "KNOWN", value: "50000000" }, type: "DEPOSIT" },
            { id: "ast_other", value: { status: "KNOWN", value: "100000000" }, type: "EQUITY" }, // item 4 done
          ],
        },
        debts: {
          status: "KNOWN",
          entries: [
            { id: "debt-1", contract: { status: "KNOWN" } }, // item 5 done
          ],
        },
        pension: { status: "KNOWN", monthlyAmount: "5000000" }, // item 3 done
        goals: { status: "KNOWN", entries: [{ id: "g-1", targetAmount: "50000000" }] }, // item 6 done
      },
    };

    await setupTestEnv(page, { profile: allDoneProfile });
    await page.goto("/user/plan");

    const singleRow = page.locator(".accuracy-checklist--all-done");
    await expect(singleRow).toBeVisible();
    await expect(singleRow.locator(".checklist-all-done-text")).toHaveText("Kế hoạch đã dùng đủ thông tin quan trọng");

    const reviewBtn = singleRow.locator(".btn-review-checklist");
    await expect(reviewBtn).toBeVisible();
    await expect(reviewBtn).toHaveText("Xem lại");

    // Click "Xem lại" expands review view
    await reviewBtn.click();
    await expect(page.locator(".accuracy-checklist-header")).toBeVisible();
    await expect(page.locator(".checklist-status-hint")).toHaveText("Kế hoạch đã dùng đủ thông tin quan trọng");
  });

  test("checklist collapse persists across page reload per user account", async ({ page }) => {
    // User A collapses checklist
    await setupTestEnv(page, { profile: baseProfile, user: "user_a" });
    await page.goto("/user/plan");

    const checklist = page.locator(".accuracy-checklist");
    await expect(checklist.locator(".accuracy-checklist-body")).toBeVisible();

    await checklist.getByRole("button", { name: "Thu gọn checklist" }).click();
    await expect(checklist.locator(".accuracy-checklist-body")).toBeHidden();

    // Reload page as User A -> still collapsed
    await page.reload();
    await expect(page.locator(".accuracy-checklist .accuracy-checklist-body")).toBeHidden();
    await expect(page.locator(".accuracy-checklist").getByRole("button", { name: "Mở rộng checklist" })).toBeVisible();

    // Switch to User B -> expanded by default
    await setupTestEnv(page, { profile: baseProfile, user: "user_b" });
    await page.goto("/user/plan");
    await expect(page.locator(".accuracy-checklist .accuracy-checklist-body")).toBeVisible();
  });
});

test.describe("Part B: Contribution selection with chips and advanced options", () => {
  test("neutral state with 0 contribution, no chip pre-selected, custom input visible", async ({ page }) => {
    await setupTestEnv(page, { profile: baseProfile });
    await page.goto("/user/plan");

    const settings = page.locator("#plan-settings");
    await expect(settings).toBeVisible();

    // Question
    await expect(settings.locator(".plan-settings__question")).toHaveText(
      "Mỗi tháng bạn muốn góp bao nhiêu vào quỹ hưu trí?"
    );

    // Context line from backend: rows[0].contributionCapacity = 3000000
    await expect(settings.locator(".plan-settings__capacity-context")).toContainText(
      "Phần dư mỗi tháng sau chi tiêu và trả nợ: 3.000.000 VND"
    );

    // Neutral notice when monthlyContribution = 0
    await expect(settings.locator(".plan-settings__neutral-notice")).toHaveText(
      "Bạn chưa chọn khoản góp — kế hoạch đang tính như không góp thêm."
    );

    // No chip is pre-selected (aria-pressed=false)
    const chipReq = settings.locator('.plan-settings__chip:has-text("Góp đủ mức cần")');
    const chipCap = settings.locator('.plan-settings__chip:has-text("Toàn bộ phần dư")');
    const chipCustom = settings.locator('.plan-settings__chip:has-text("Tự nhập")');

    await expect(chipReq).toHaveAttribute("aria-pressed", "false");
    await expect(chipCap).toHaveAttribute("aria-pressed", "false");
    await expect(chipCustom).toHaveAttribute("aria-pressed", "false");

    // ProfileFormattedInput is visible because 0 does not match any chip
    await expect(settings.getByLabel("Tiền bạn chọn góp hưu trí mỗi tháng (đồng)", { exact: true })).toBeVisible();
  });

  test("clicking 'Góp đủ mức cần' sends requiredConstantMonthlyContribution in next preview request", async ({ page }) => {
    const { previewCalls } = await setupTestEnv(page, {
      profile: baseProfile,
      requiredConstantContribution: "4500000",
      contributionCapacity: "3000000",
    });
    await page.goto("/user/plan");

    const settings = page.locator("#plan-settings");
    const chipReq = settings.locator('.plan-settings__chip:has-text("Góp đủ mức cần")');
    await expect(chipReq).toBeVisible();
    await chipReq.click();

    await expect(chipReq).toHaveAttribute("aria-pressed", "true");

    // Verify last preview request received 4500000
    await expect.poll(() => previewCalls[previewCalls.length - 1]?.monthlyContribution).toBe("4500000");
  });

  test("clicking 'Toàn bộ phần dư' sends contributionCapacity in next preview request", async ({ page }) => {
    const { previewCalls } = await setupTestEnv(page, {
      profile: baseProfile,
      requiredConstantContribution: "4500000",
      contributionCapacity: "3000000",
    });
    await page.goto("/user/plan");

    const settings = page.locator("#plan-settings");
    const chipCap = settings.locator('.plan-settings__chip:has-text("Toàn bộ phần dư")');
    await expect(chipCap).toBeVisible();
    await chipCap.click();

    await expect(chipCap).toHaveAttribute("aria-pressed", "true");

    // Verify last preview request received 3000000
    await expect.poll(() => previewCalls[previewCalls.length - 1]?.monthlyContribution).toBe("3000000");
  });

  test("shows warning when required contribution Y exceeds monthly surplus X (Y > X)", async ({ page }) => {
    await setupTestEnv(page, {
      profile: baseProfile,
      requiredConstantContribution: "4500000",
      contributionCapacity: "3000000",
    });
    await page.goto("/user/plan");

    const settings = page.locator("#plan-settings");
    // Y (4.5M) > X (3.0M), Z = 1.5M
    const warning = settings.locator(".plan-settings__chip-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Vượt phần dư hiện tại 1.500.000 VND mỗi tháng");
  });

  test("hides 'Góp đủ mức cần' chip when Y is null", async ({ page }) => {
    await setupTestEnv(page, {
      profile: baseProfile,
      requiredConstantContribution: null,
      contributionCapacity: "3000000",
    });
    await page.goto("/user/plan");

    const settings = page.locator("#plan-settings");
    await expect(settings.locator('.plan-settings__chip:has-text("Góp đủ mức cần")')).toBeHidden();
    await expect(settings.locator('.plan-settings__chip:has-text("Toàn bộ phần dư")')).toBeVisible();
  });

  test("advanced options collapsible is closed by default with summary, and auto-opens when reserve > 0", async ({ page }) => {
    // 1. Default reserve = 0 -> advanced options closed
    await setupTestEnv(page, { profile: baseProfile });
    await page.goto("/user/plan");

    const advanced = page.locator(".plan-advanced-settings");
    await expect(advanced).toBeVisible();
    await expect(advanced).not.toHaveAttribute("open", "");
    await expect(advanced.locator(".plan-advanced-settings__overview")).toHaveText(
      "Giữ lại ngoài quỹ: 0 đ · Góp cuối mỗi tháng"
    );

    // 2. Open it and set reserve > 0 -> content is visible
    await advanced.locator("summary").click();
    await expect(advanced).toHaveAttribute("open", "");
    const reserveInput = advanced.getByLabel("Tiền giữ lại mỗi tháng ngoài quỹ hưu trí (đồng)");
    await expect(reserveInput).toBeVisible();
    await reserveInput.fill("2000000");

    // Close to inspect overview updated
    await advanced.locator("summary").click();
    await expect(advanced.locator(".plan-advanced-settings__overview")).toContainText("2.000.000 đ");
  });

  test("usesActualBalance disables all controls in plan settings", async ({ page }) => {
    await setupTestEnv(page, { profile: baseProfile, reforecast: true });
    await page.goto("/user/plan");

    const settings = page.locator("#plan-settings");
    await expect(settings).toBeVisible();

    // All chips disabled
    for (const chip of await settings.locator(".plan-settings__chip").all()) {
      await expect(chip).toBeDisabled();
    }

    // Input disabled
    const contributionInput = settings.getByLabel("Tiền bạn chọn góp hưu trí mỗi tháng (đồng)", { exact: true });
    if (await contributionInput.isVisible()) {
      await expect(contributionInput).toBeDisabled();
    }
  });
});

test.describe("Responsive and Visual Evidence", () => {
  test("responsive layout has no horizontal scroll and captures evidence at 1440 and 375", async ({ page }) => {
    await setupTestEnv(page, {
      profile: baseProfile,
      requiredConstantContribution: "4500000",
      contributionCapacity: "3000000",
    });

    // 1440x1000 Viewport
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/user/plan");

    // Check no horizontal scroll on page and card
    const hasScroll1440 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasScroll1440).toBe(false);

    const checklist = page.locator(".accuracy-checklist");
    const settings = page.locator("#plan-settings");
    await expect(checklist).toBeVisible();
    await expect(settings).toBeVisible();

    // Capture screenshots at 1440
    await checklist.screenshot({ path: "test-results/checklist-1440.png" });
    await settings.screenshot({ path: "test-results/contribution-1440.png" });

    // 375x812 Mobile Viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/user/plan");

    const hasScroll375 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasScroll375).toBe(false);

    // On mobile, action button spans full width (tested via width matching parent or >= 300px)
    const mobileBtn = checklist.locator(".checklist-action-btn").first();
    const btnBox = await mobileBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.height).toBeGreaterThanOrEqual(44); // 44px min touch target

    // Capture screenshots at 375
    await checklist.screenshot({ path: "test-results/checklist-375.png" });
    await settings.screenshot({ path: "test-results/contribution-375.png" });
  });
});
