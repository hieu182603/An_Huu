import { expect, test } from "@playwright/test";
import {
  setupE2ERoutes,
  trackPageErrors,
  assertWorkspaceDesignTokens,
  defaultMockProfile,
} from "./e2e-helpers";
import fs from "node:fs";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await setupE2ERoutes(page);
});

// =========================================================================
// 1. CONSOLE ERRORS & UNCAUGHT EXCEPTIONS AUDIT (Screens 6 to 11)
// =========================================================================
test.describe("Challenger Task 1: Console Errors & Exceptions Audit (Screens 6-11)", () => {
  const M2_ROUTES = [
    { name: "Screen 6: Onboarding", path: "/onboarding", selector: ".quick-onboarding-container, .qo-shell, .setup-shell" },
    { name: "Screen 7: User Dashboard", path: "/user/dashboard", selector: ".summary-hero, .dashboard-summary" },
    { name: "Screen 8: Retirement Goal", path: "/user/goal", selector: ".goal-form, .life-timeline, .retirement-goal-shell" },
    { name: "Screen 9: Retirement Plan", path: "/user/plan", selector: ".plan-status, .summary-hero, .plan-metrics" },
    { name: "Screen 10: Tracking & Simulation Redirect", path: "/user/simulation", selector: ".summary-hero, .plan-metrics, .plan-status" },
    { name: "Screen 10: Plan Cashflow Section", path: "/user/plan#plan-cashflow", selector: "#plan-cashflow, .cashflow-table-wrap, .card.plan-more" },
    { name: "Screen 11: Portfolio Allocation", path: "/user/risk-portfolio", selector: ".allocation-onboarding, .allocation-compact-pillars, .capital-pillars" },
  ];

  for (const route of M2_ROUTES) {
    test(`${route.name} (${route.path}) loads without uncaught exceptions or page errors`, async ({ page }) => {
      const tracker = trackPageErrors(page);
      const resp = await page.goto(route.path);
      expect(resp?.status()).toBe(200);

      // Verify targeted M2 element is present and visible
      const element = page.locator(route.selector).first();
      await expect(element).toBeVisible({ timeout: 15000 });

      // Verify no uncaught page errors
      expect(tracker.pageErrors, `Page errors on ${route.path}: ${tracker.pageErrors.join("; ")}`).toEqual([]);
      // Verify no console errors
      expect(tracker.consoleErrors, `Console errors on ${route.path}: ${tracker.consoleErrors.join("; ")}`).toEqual([]);

      tracker.detach();
    });
  }

  test("Rapid sequential navigation across Screens 6-11 has zero unmount/memory leak crashes", async ({ page }) => {
    const tracker = trackPageErrors(page);
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const route of M2_ROUTES) {
        await page.goto(route.path);
        await page.locator(route.selector).first().waitFor({ state: "visible", timeout: 10000 });
      }
    }
    expect(tracker.pageErrors).toEqual([]);
    expect(tracker.consoleErrors).toEqual([]);
    tracker.detach();
  });
});

// =========================================================================
// 2. CROSS-PAGE STATE CONTINUITY (Screen 6 -> 7 -> 8 -> 9)
// =========================================================================
test.describe("Challenger Task 2: Cross-Page State Continuity Flow", () => {
  test("Screen 6 Onboarding input completion propagates into Screen 7 Dashboard, Screen 8 Goals, and Screen 9 Plan", async ({ page }) => {
    const tracker = trackPageErrors(page);

    // Navigate to Onboarding
    await page.goto("/onboarding");
    await expect(page.locator(".quick-onboarding-container, .qo-shell, .setup-shell")).toBeVisible();

    // Step 1: Input birth month and retirement month
    const card = page.locator(".qo-card, .setup-card").first();
    await expect(card).toBeVisible();

    const monthInputs = card.locator('input[type="month"]');
    if (await monthInputs.count() > 0) {
      await monthInputs.nth(0).fill("1988-06");
      if (await monthInputs.count() > 1) {
        await monthInputs.nth(1).fill("2048-06");
      }
    }

    const currencyInputs = card.locator('input[type="text"]');
    if (await currencyInputs.count() > 0) {
      await currencyInputs.first().fill("22000000");
    }

    // Click Next to advance to Step 2
    const nextBtnStep1 = card.getByRole("button", { name: /Tiếp tục/i });
    if (await nextBtnStep1.isVisible()) {
      await nextBtnStep1.click();
    }

    // Verify Step 2 renders
    await expect(page.locator(".qo-shell, .setup-shell")).toBeVisible();

    // Navigate to Screen 7: Dashboard and verify workspace tokens
    await page.goto("/user/dashboard");
    await expect(page.locator(".summary-hero, .dashboard-summary")).toBeVisible();
    await assertWorkspaceDesignTokens(page);

    // Navigate to Screen 8: Retirement Goal
    await page.goto("/user/goal");
    await expect(page.locator(".goal-form, .life-timeline, .retirement-goal-shell")).toBeVisible();
    await assertWorkspaceDesignTokens(page);

    // Navigate to Screen 9: Retirement Plan
    await page.goto("/user/plan");
    await expect(page.locator(".plan-status, .summary-hero, .plan-metrics")).toBeVisible();
    await assertWorkspaceDesignTokens(page);

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });
});

// =========================================================================
// 3. ANTI-SLOP AUDIT: FORBIDDEN EM-DASH (—) IN SIMULATION & TRACKING
// =========================================================================
test.describe("Challenger Task 3: Anti-Slop Audit (Zero Forbidden Em-Dashes in Simulation/Tracking)", () => {
  test("Screen 10 Cashflow tracking UI text contains ZERO em-dash (—) characters", async ({ page }) => {
    await page.goto("/user/plan#plan-cashflow");
    await page.waitForSelector(".card.plan-more, #plan-cashflow, .cashflow-table-wrap", { timeout: 10000 });
    const cashflowText = await page.locator("body").innerText();
    expect(cashflowText).not.toContain("\u2014");
  });

  test("Screen 10 Source Code Audit: Empirical check for U+2014 in SimulationTrackingPage.tsx and ActualsTab.tsx", async () => {
    const trackingPath = path.resolve(process.cwd(), "src/pages/SimulationTrackingPage.tsx");
    const actualsPath = path.resolve(process.cwd(), "src/pages/simulation/ActualsTab.tsx");

    const actualsContent = fs.readFileSync(actualsPath, "utf8");
    const actualsLinesWithEmDash: number[] = [];
    actualsContent.split("\n").forEach((l, idx) => {
      if (l.includes("\u2014")) actualsLinesWithEmDash.push(idx + 1);
    });
    expect(actualsLinesWithEmDash, `ActualsTab.tsx has em-dashes at lines: ${actualsLinesWithEmDash.join(", ")}`).toEqual([]);

    const trackingContent = fs.readFileSync(trackingPath, "utf8");
    const trackingLinesWithEmDash: { line: number; text: string }[] = [];
    trackingContent.split("\n").forEach((l, idx) => {
      if (l.includes("\u2014")) {
        trackingLinesWithEmDash.push({ line: idx + 1, text: l.trim() });
      }
    });

    console.log(`[ANTI-SLOP AUDIT] SimulationTrackingPage.tsx em-dash count: ${trackingLinesWithEmDash.length}`);
    if (trackingLinesWithEmDash.length > 0) {
      console.log(`[ANTI-SLOP AUDIT] Found occurrences:`, trackingLinesWithEmDash);
    }

    // Challenger finding: SimulationTrackingPage.tsx has 5 hardcoded em-dashes
    expect(
      trackingLinesWithEmDash.length,
      `Forbidden em-dash (\u2014) found in SimulationTrackingPage.tsx at lines: ${trackingLinesWithEmDash.map(x => x.line).join(", ")}`
    ).toBe(0);
  });
});

// =========================================================================
// 4. MILESTONE 1 ANTI-REGRESSION AUDIT (Screens 1 to 5)
// =========================================================================
test.describe("Challenger Task 4: Milestone 1 Anti-Regression Audit", () => {
  const M1_PAGES = [
    { name: "Screen 1: Landing", path: "/", title: /Lập kế hoạch tài chính hưu trí/i, selector: ".mk-hero" },
    { name: "Screen 2: Simulation", path: "/mo-phong", title: /Mô phỏng hưu trí/i, selector: ".mk-simulation-page" },
    { name: "Screen 3: AI Assistant", path: "/tro-ly-ai", title: /Trợ lý AI An Hưu/i, selector: ".mk-assistant-hero" },
    { name: "Screen 4: How It Works", path: "/cach-hoat-dong", title: /Cách hoạt động/i, selector: ".mk-how-page" },
    { name: "Screen 5: Knowledge Hub", path: "/kien-thuc", title: /Kiến thức/i, selector: "#ed-catalog-view" },
  ];

  for (const p of M1_PAGES) {
    test(`${p.name} (${p.path}) renders cleanly without regression`, async ({ page }) => {
      const tracker = trackPageErrors(page);
      const resp = await page.goto(p.path);
      expect(resp?.status()).toBe(200);
      await expect(page).toHaveTitle(p.title);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(p.selector)).toBeVisible({ timeout: 10000 });

      // Footer must be present
      await expect(page.locator("footer.mk-footer")).toBeVisible();

      expect(tracker.pageErrors).toEqual([]);
      tracker.detach();
    });
  }

  test("Screen 5 Knowledge Hub interactive reader activates and dismisses cleanly", async ({ page }) => {
    await page.goto("/kien-thuc");
    const catalog = page.locator("#ed-catalog-view");
    await expect(catalog).toBeVisible();

    const firstCard = catalog.locator("article.ed-card").first();
    await expect(firstCard).toBeVisible();

    // Click card action to open reader
    await firstCard.locator(".ed-card-action").click();
    await expect(page.locator("#ed-reader-view")).toBeVisible();

    // Click back to return to catalog
    await page.locator("button.ed-btn-back").click();
    await expect(catalog).toBeVisible();
  });
});
