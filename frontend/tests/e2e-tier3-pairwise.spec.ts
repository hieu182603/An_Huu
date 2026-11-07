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
// TIER 3: PAIRWISE COMBINATORIAL WORKFLOWS & CROSS-FEATURE FLOWS
// =========================================================================
test.describe("Tier 3: Pairwise Combinatorial Flows", () => {
  test("3.1 Pairwise Flow: Public Discovery -> Simulation -> Quick Onboarding", async ({ page }) => {
    const tracker = trackPageErrors(page);
    // 1. Start at Landing Page
    await page.goto("/");
    await expect(page.locator(".mk-hero")).toBeVisible();

    // 2. Click primary CTA to go to Simulation
    const cta = page.locator(".mk-hero-actions a").first();
    await cta.click();
    await expect(page).toHaveURL(/\/mo-phong/);

    // 3. Save prefill and transition to Onboarding
    await installFinancialProfileRoutes(page, { profile: null, draft: null });
    await page.evaluate(() => {
      sessionStorage.setItem("anhuu_simulator_prefill", JSON.stringify({
        currentAge: 32,
        retirementAge: 60,
        monthlyExpenseToday: 25000000,
      }));
    });
    await page.goto("/onboarding");
    await expect(page.locator(".qo-shell")).toBeVisible();
    await expect(page.locator(".quick-sim-badge, .qo-card")).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.2 Pairwise Flow: Landing Page -> How It Works -> Simulation anchor link", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Điều hướng chính", exact: true });
    await nav.getByRole("link", { name: "Cách hoạt động" }).click();
    await expect(page).toHaveURL(/\/cach-hoat-dong/);

    // Click journey link into simulation
    const simLink = page.getByRole("link", { name: /Khám phá bản mô phỏng|Thử kế hoạch/i }).first();
    await simLink.click();
    await expect(page).toHaveURL(/\/mo-phong/);

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.3 Pairwise Flow: Public Assistant -> Member AI Workspace", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/tro-ly-ai");
    await expect(page.locator(".mk-assistant-hero")).toBeVisible();

    // Member navigates to personal workspace assistant
    await page.goto("/user/assistant");
    await expect(page.locator(".ai-assistant-page, .assistant-page, .ai-page, [aria-label*='Trợ lý AI']").first()).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.4 Pairwise Flow: Knowledge Hub -> Financial Product Catalog -> Consultation request", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/knowledge");
    await expect(page.getByRole("heading", { name: /Kiến thức tài chính/i })).toBeVisible();

    // Navigate to products catalog
    await page.goto("/user/explore");
    await expect(page.getByRole("heading", { name: /Sản phẩm tài chính|Khám phá sản phẩm/i })).toBeVisible();

    // Open consultation dialog
    const consultBtn = page.getByRole("button", { name: /Tư vấn|Quan tâm|Chi tiết/i }).first();
    if (await consultBtn.count() > 0) {
      await consultBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      // Close modal
      const closeBtn = modal.getByRole("button", { name: /Hủy|Đóng/i }).first();
      if (await closeBtn.count() > 0) await closeBtn.click();
    }

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.5 Pairwise Flow: User Dashboard -> Goals -> Plan Adjustments -> Portfolio Allocation", async ({ page }) => {
    const tracker = trackPageErrors(page);
    // 1. Dashboard
    await page.goto("/user/dashboard");
    await expect(page.locator(".yoga-dashboard-layout, .dashboard-summary, h1.user-hero-title").first()).toBeVisible();

    // 2. Goal
    await page.goto("/user/goal");
    await expect(page.getByRole("heading", { name: /Mục tiêu (nghỉ hưu|hưu trí)/i })).toBeVisible();

    // 3. Plan
    await page.goto("/user/plan");
    await expect(page.locator(".plan-page, .retirement-plan-page").first()).toBeVisible();

    // 4. Portfolio Allocation
    await page.goto("/user/risk-portfolio");
    await expect(page.getByRole("heading", { name: /Phân bổ tài sản/i })).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.6 Pairwise Flow: Debt Management -> Financial Profile Cashflow Sync", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/debts");
    await expect(page.getByRole("heading", { name: /Khoản nợ|Quản lý nợ/i })).toBeVisible();

    await page.goto("/user/account");
    await expect(page.getByText(/Trả nợ trong tháng/i).first()).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.7 Pairwise Flow: Account Settings -> Support Ticket -> Notifications Center", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/account?tab=settings");
    await expect(page.locator(".account-settings-page, .account-settings-container, .settings-page").first()).toBeVisible();

    await page.goto("/user/support");
    await expect(page.getByRole("heading", { name: /Hỗ trợ/i })).toBeVisible();

    await page.goto("/user/notifications");
    await expect(page.getByRole("heading", { name: /Trung tâm thông báo/i })).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });
});

// =========================================================================
// TIER 3: DESIGN TOKEN ISOLATION & HISTORY NAVIGATION
// =========================================================================
test.describe("Tier 3: Design Token Isolation & History Navigation", () => {
  test("3.8 Token Isolation: Transitioning from Marketing to User Workspace switches design tokens", async ({ page }) => {
    // 1. Marketing page has .mk-site
    await page.goto("/");
    await assertMarketingDesignTokens(page);

    // 2. Navigate into authenticated user workspace
    await page.goto("/user/dashboard");
    await assertWorkspaceDesignTokens(page);

    // 3. Ensure .mk-site is NOT wrapping user workspace
    const mkSiteInWorkspace = page.locator(".mk-site");
    expect(await mkSiteInWorkspace.count()).toBe(0);
  });

  test("3.9 History Navigation: Browser back and forward preserve navigation state without crash", async ({ page }) => {
    const tracker = trackPageErrors(page);
    await page.goto("/user/dashboard");
    await page.goto("/user/goal");
    await page.goto("/user/plan");

    // Go back to goal
    await page.goBack();
    await expect(page).toHaveURL(/\/user\/goal/);

    // Go back to dashboard
    await page.goBack();
    await expect(page).toHaveURL(/\/user\/dashboard/);

    // Go forward to goal
    await page.goForward();
    await expect(page).toHaveURL(/\/user\/goal/);

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("3.10 URL Query Preservation: Query parameters maintain tab selection across page reload", async ({ page }) => {
    await page.goto("/user/account?tab=settings");
    await expect(page.locator(".account-settings-page, .account-settings-container, .settings-page").first()).toBeVisible();
    await page.reload();
    await expect(page.locator(".account-settings-page, .account-settings-container, .settings-page").first()).toBeVisible();
    await expect(page).toHaveURL(/tab=settings/);
  });
});
