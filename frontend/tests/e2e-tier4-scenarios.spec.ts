import { expect, test } from "@playwright/test";
import {
  setupE2ERoutes,
  trackPageErrors,
  assertMarketingDesignTokens,
  assertWorkspaceDesignTokens,
  installFinancialProfileRoutes,
} from "./e2e-helpers";

test.beforeEach(async ({ page }) => {
  await setupE2ERoutes(page);
});

// =========================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// =========================================================================
test.describe("Tier 4: Real-World Application Scenarios", () => {
  // -----------------------------------------------------------------------
  // Scenario 1: Public Discovery -> Simulation -> Quick Onboarding
  // Screens Exercised: Screens 1, 2, 4, 6
  // -----------------------------------------------------------------------
  test("Scenario 1: Public Discovery -> Simulation -> Quick Onboarding (Screens 1, 2, 4, 6)", async ({ page }) => {
    const tracker = trackPageErrors(page);

    // Step 1: User arrives at Landing Page (Screen 1)
    await page.goto("/");
    await expect(page).toHaveTitle(/Lập kế hoạch tài chính hưu trí/i);
    await assertMarketingDesignTokens(page);

    // Step 2: Navigates to 'Cách hoạt động' (Screen 4) to understand the methodology
    const nav = page.getByRole("navigation", { name: "Điều hướng chính", exact: true });
    await nav.getByRole("link", { name: "Cách hoạt động" }).click();
    await expect(page).toHaveURL(/\/cach-hoat-dong/);
    await expect(page.locator(".mk-how-timeline")).toBeVisible();

    // Step 3: Proceeds to Simulation Page (Screen 2)
    const simLink = page.getByRole("link", { name: /Thử kế hoạch của tôi|Khám phá bản mô phỏng|Thử mô phỏng/i }).first();
    await simLink.click();
    await expect(page).toHaveURL(/\/mo-phong/);
    await expect(page.locator(".mk-simulation-page, .mk-demo-shell").first()).toBeVisible();

    // Step 4: Adjusts monthly expense in simulator and saves prefill
    await page.evaluate(() => {
      sessionStorage.setItem("anhuu_simulator_prefill", JSON.stringify({
        currentAge: 32,
        retirementAge: 60,
        monthlyExpenseToday: 20000000,
      }));
    });

    // Step 5: Transitions into Quick Onboarding (Screen 6)
    await installFinancialProfileRoutes(page, { profile: null, draft: null });
    await page.goto("/onboarding");
    await expect(page.locator(".qo-shell")).toBeVisible();

    // Complete Step 1
    const card = page.locator(".qo-card");
    const monthInputs = card.locator('input[type="month"]');
    await monthInputs.nth(0).fill("1992-04");
    if (await monthInputs.count() > 1) {
      await monthInputs.nth(1).fill("2052-04");
    }
    const currencyInput = card.locator('input[type="text"]').first();
    if (await currencyInput.count() > 0) {
      await currencyInput.fill("20000000");
    }
    const nextBtn = card.getByRole("button", { name: /Tiếp tục/i });
    await nextBtn.click();

    // Verify arrival at Step 2
    await expect(card.getByText(/BƯỚC 2\/4/i)).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Knowledge Exploration -> Article Reader -> AI Inquiry
  // Screens Exercised: Screens 3, 5, 14
  // -----------------------------------------------------------------------
  test("Scenario 2: Knowledge Exploration -> Article Reader -> AI Inquiry (Screens 3, 5, 14)", async ({ page }) => {
    const tracker = trackPageErrors(page);

    // Step 1: User visits Public AI Assistant (Screen 3)
    await page.goto("/tro-ly-ai");
    await expect(page.locator(".mk-assistant-hero")).toBeVisible();
    await expect(page.locator(".mk-chat")).toBeVisible();

    // Step 2: Navigates to Financial Knowledge Center (Screen 5)
    await page.goto("/user/knowledge");
    await expect(page.getByRole("heading", { name: /Kiến thức tài chính/i })).toBeVisible();

    // Filter by topic 'Bảo hiểm xã hội'
    const bhxhTab = page.locator(".explore-category-tabs button, .knowledge-topics button").filter({ hasText: /Bảo hiểm xã hội/i }).first();
    if (await bhxhTab.count() > 0) {
      await bhxhTab.click();
      await expect(bhxhTab).toHaveAttribute("aria-pressed", "true");
    }

    // Inspect glossary terms
    await expect(page.getByText(/Lãi kép|CPI|BHXH/i).first()).toBeVisible();

    // Step 3: Member transitions to Authenticated AI Assistant (Screen 14) for tailored advice
    await page.goto("/user/assistant");
    await expect(page.locator(".ai-assistant-page, .assistant-page, .ai-page, [aria-label*='Trợ lý AI']").first()).toBeVisible();
    await assertWorkspaceDesignTokens(page);

    // Click quick suggested question if available
    const promptChip = page.locator(".suggestion-chip, .prompt-pill, .quick-question-btn").first();
    if (await promptChip.count() > 0) {
      await promptChip.click();
    }

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Core Member Journey: Dashboard -> Goals -> Plan Adjustment -> Portfolio Allocation
  // Screens Exercised: Screens 7, 8, 9, 11
  // -----------------------------------------------------------------------
  test("Scenario 3: Core Member Journey: Dashboard -> Goals -> Plan Adjustment -> Portfolio Allocation (Screens 7, 8, 9, 11)", async ({ page }) => {
    const tracker = trackPageErrors(page);

    // Step 1: Member logs into Dashboard (Screen 7)
    await page.goto("/user/dashboard");
    await expect(page.locator(".yoga-dashboard-layout, .dashboard-summary, h1.user-hero-title").first()).toBeVisible();
    await assertWorkspaceDesignTokens(page);

    // Step 2: Navigates to Retirement Goals (Screen 8) to refine target age
    await page.goto("/user/goal");
    await expect(page.getByRole("heading", { name: /Mục tiêu (nghỉ hưu|hưu trí)/i })).toBeVisible();

    // Step 3: Navigates to Retirement Plan (Screen 9) to review impact
    await page.goto("/user/plan");
    await expect(page.locator(".plan-page, .retirement-plan-page").first()).toBeVisible();
    await expect(page.getByText(/Quỹ cần|Quỹ dự kiến|Khoảng thiếu/i).first()).toBeVisible();

    // Inspect Plan Adjustment section
    await page.goto("/user/plan#plan-settings");
    await expect(page.locator(".plan-page, .retirement-plan-page").first()).toBeVisible();

    // Step 4: Navigates to Risk Portfolio Allocation (Screen 11) to balance asset weights
    await page.goto("/user/risk-portfolio");
    await expect(page.getByRole("heading", { name: /Phân bổ tài sản/i })).toBeVisible();
    await expect(page.getByText(/Kế hoạch đầu tư|Mục tiêu & Khung thời gian|Khả năng chịu rủi ro/i).first()).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Monthly Financial Tracking: Actuals Check-in -> Debt Analysis -> Financial Hub Update
  // Screens Exercised: Screens 10, 12, 15
  // -----------------------------------------------------------------------
  test("Scenario 4: Monthly Financial Tracking: Actuals Check-in -> Debt Analysis -> Financial Hub Update (Screens 10, 12, 15)", async ({ page }) => {
    const tracker = trackPageErrors(page);

    // Step 1: User visits Simulation / Plan Cashflow & Actuals (Screen 10)
    await page.goto("/user/simulation");
    await expect(page).toHaveURL(/\/user\/plan/);
    await expect(page.locator(".plan-page, .retirement-plan-page").first()).toBeVisible();

    // Step 2: Checks loan obligations in Debt Analysis (Screen 12)
    await page.goto("/user/debts");
    await expect(page.getByRole("heading", { name: /Khoản nợ|Quản lý nợ/i })).toBeVisible();
    await expect(page.getByText(/Tổng dư nợ|Trả nợ trong tháng/i).first()).toBeVisible();

    // Step 3: Navigates to Financial Profile Hub (Screen 15) to update living expenses
    await page.goto("/user/account");
    await expect(page.getByText(/Thu nhập mỗi tháng|Chi tiêu sinh hoạt|Trả nợ trong tháng|Phần dư thu chi/i).first()).toBeVisible();
    await expect(page.getByText(/Thu nhập & chi tiêu/i).first()).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Member Account Management: Settings -> Support Request -> Notification Inbox
  // Screens Exercised: Screens 16, 17, 18
  // -----------------------------------------------------------------------
  test("Scenario 5: Member Account Management: Settings -> Support Request -> Notification Inbox (Screens 16, 17, 18)", async ({ page }) => {
    const tracker = trackPageErrors(page);

    // Step 1: Member opens Account Settings (Screen 16)
    await page.goto("/user/account?tab=settings");
    await expect(page.locator(".account-settings-page, .account-settings-container, .settings-page").first()).toBeVisible();
    await expect(page.getByText(/user@demo.com|Nguyễn Minh An/i).first()).toBeVisible();

    // Step 2: Navigates to Support Center (Screen 17) and reviews support tickets
    await page.goto("/user/support");
    await expect(page.getByRole("heading", { name: /Hỗ trợ/i })).toBeVisible();
    await expect(page.getByText(/tk-001|bảo hiểm xã hội|VssID/i).first()).toBeVisible();

    // Step 3: Navigates to Notification Inbox (Screen 18)
    await page.goto("/user/notifications");
    await expect(page.getByRole("heading", { name: /Trung tâm thông báo/i })).toBeVisible();
    await expect(page.getByText(/Kế hoạch đã đồng bộ|Phản hồi yêu cầu/i).first()).toBeVisible();

    // Filter notifications by keyword
    const search = page.locator('input[type="text"], input[type="search"]').first();
    if (await search.count() > 0) {
      await search.fill("kế hoạch");
      await expect(page.getByText(/Kế hoạch đã đồng bộ/i).first()).toBeVisible();
    }

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });
});
