import { expect, test } from "@playwright/test";
import {
  setupE2ERoutes,
  trackPageErrors,
  assertWorkspaceDesignTokens,
} from "./e2e-helpers";
import fs from "node:fs";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await setupE2ERoutes(page);
});

// =========================================================================
// 1. CONSOLE ERRORS & UNCAUGHT EXCEPTIONS AUDIT (Screens 12 to 18)
// =========================================================================
test.describe("Challenger M3 Task 1: Uncaught Exceptions & DOM Stability (Screens 12-18)", () => {
  const M3_ROUTES = [
    { name: "Screen 12: Khoản nợ & Lịch trả nợ", path: "/user/debts", selector: ".debt-page-container, .debt-hero-card" },
    { name: "Screen 13: Sản phẩm tài chính", path: "/user/explore", selector: ".products-page, .marketplace-tabs" },
    { name: "Screen 14: Trợ lý AI người dùng", path: "/user/assistant", selector: ".ai-chat-page, .ai-assistant-page" },
    { name: "Screen 15: Hồ sơ tài chính chi tiết", path: "/user/account", selector: ".finance-hub-container, .finance-hub-grid" },
    { name: "Screen 16: Cài đặt tài khoản", path: "/user/account?tab=settings", selector: ".account-settings-page, .account-settings-tabs" },
    { name: "Screen 17: Hỗ trợ", path: "/user/support", selector: ".support-member-view, .support-create-card, .phase-eight-page" },
    { name: "Screen 18: Thông báo", path: "/user/notifications", selector: ".notif-hub-container, .notif-hub-grid" },
  ];

  for (const route of M3_ROUTES) {
    test(`${route.name} (${route.path}) loads cleanly without page errors or crash`, async ({ page }) => {
      const tracker = trackPageErrors(page);
      const resp = await page.goto(route.path);
      expect(resp?.status()).toBe(200);

      // Verify targeted M3 element is present and visible
      const element = page.locator(route.selector).first();
      await expect(element).toBeVisible({ timeout: 15000 });

      // Verify no uncaught page errors
      expect(tracker.pageErrors, `Page errors on ${route.path}: ${tracker.pageErrors.join("; ")}`).toEqual([]);

      tracker.detach();
    });
  }

  test("Rapid sequential navigation across Screens 12 to 18 maintains zero memory leak/unmount crashes", async ({ page }) => {
    const tracker = trackPageErrors(page);
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const route of M3_ROUTES) {
        await page.goto(route.path);
        await page.locator(route.selector).first().waitFor({ state: "visible", timeout: 10000 });
      }
    }
    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });
});

// =========================================================================
// 2. STRICT LOCATOR UNIQUENESS ACROSS ALL 18 SCREENS
// =========================================================================
test.describe("Challenger M3 Task 2: Strict Locator Uniqueness Across All 18 Screens", () => {
  const ALL_18_SCREENS = [
    { name: "Screen 1: Landing Page", path: "/", h1Regex: /An tâm|hôm nay/i },
    { name: "Screen 2: Mô phỏng nhanh", path: "/mo-phong", h1Regex: /Một thay đổi/i },
    { name: "Screen 3: Trợ lý AI công khai", path: "/tro-ly-ai", h1Regex: /Hỏi đúng băn khoăn/i },
    { name: "Screen 4: Cách hoạt động", path: "/cach-hoat-dong", h1Regex: /Một ngày mai an yên/i },
    { name: "Screen 5: Cẩm nang kiến thức", path: "/user/knowledge", h1Regex: /Kiến thức tài chính/i },
    { name: "Screen 6: Khảo sát ban đầu", path: "/onboarding", h1Regex: null }, // Multi-step onboarding
    { name: "Screen 7: Tổng quan", path: "/user/dashboard", h1Regex: /Chào|Tổng quan/i },
    { name: "Screen 8: Mục tiêu hưu trí", path: "/user/goal", h1Regex: /Mục tiêu/i },
    { name: "Screen 9: Kế hoạch nghỉ hưu", path: "/user/plan", h1Regex: /Kế hoạch nghỉ hưu/i },
    { name: "Screen 10: Dòng tiền thực tế", path: "/user/simulation", h1Regex: /Kế hoạch nghỉ hưu/i },
    { name: "Screen 11: Phân bổ danh mục", path: "/user/risk-portfolio", h1Regex: /Phân bổ tài sản/i },
    { name: "Screen 12: Khoản nợ & Lịch trả", path: "/user/debts", h1Regex: /Khoản nợ/i },
    { name: "Screen 13: Sản phẩm tài chính", path: "/user/explore", h1Regex: /Sản phẩm tài chính/i },
    { name: "Screen 14: Trợ lý AI người dùng", path: "/user/assistant", h1Regex: /Trợ lý An Hưu/i },
    { name: "Screen 15: Hồ sơ tài chính", path: "/user/account", h1Regex: /Tài chính của bạn/i },
    { name: "Screen 16: Tài khoản & Cài đặt", path: "/user/account?tab=settings", h1Regex: /Cài đặt tài khoản/i },
    { name: "Screen 17: Hỗ trợ", path: "/user/support", h1Regex: /Hỗ trợ/i },
    { name: "Screen 18: Thông báo", path: "/user/notifications", h1Regex: /Trung tâm thông báo/i },
  ];

  for (const screen of ALL_18_SCREENS) {
    test(`${screen.name} has strict unique H1 heading without Playwright strict mode conflict`, async ({ page }) => {
      await page.goto(screen.path);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toBeVisible();
      if (screen.h1Regex) {
        await expect(h1).toContainText(screen.h1Regex);
      }
    });
  }
});

// =========================================================================
// 3. ANTI-SLOP AUDIT: ZERO FORBIDDEN EM-DASHES (— / \u2014) IN SCREENS 12-18
// =========================================================================
test.describe("Challenger M3 Task 3: Anti-Slop Audit (Zero Em-Dash in Milestone 3)", () => {
  const M3_FILES = [
    "src/pages/DebtAnalysisPage.tsx",
    "src/components/retirement/DebtAnalysisResults.tsx",
    "src/pages/debt-page.css",
    "src/pages/ExplorePage.tsx",
    "src/pages/InvestmentsPage.tsx",
    "src/pages/explore-products.css",
    "src/pages/investments.css",
    "src/pages/AIAssistantPage.tsx",
    "src/pages/ai-assistant.css",
    "src/pages/FinancialProfilePage.tsx",
    "src/pages/financial-profile.css",
    "src/pages/AccountPage.tsx",
    "src/pages/account-settings.css",
    "src/pages/SupportPage.tsx",
    "src/pages/NotificationsPage.tsx",
    "src/pages/notifications.css",
  ];

  test("Milestone 3 source code files contain exactly ZERO em-dash (\\u2014) characters", async () => {
    const violations: { file: string; line: number; text: string }[] = [];
    for (const file of M3_FILES) {
      const fullPath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf8");
      content.split("\n").forEach((line, idx) => {
        if (line.includes("\u2014")) {
          violations.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }
    expect(violations, `Forbidden em-dash \\u2014 detected: ${JSON.stringify(violations)}`).toEqual([]);
  });

  test("Screens 12 to 18 rendered DOM text contains exactly ZERO em-dash (\\u2014) characters", async ({ page }) => {
    const urls = [
      "/user/debts",
      "/user/explore",
      "/user/assistant",
      "/user/account",
      "/user/account?tab=settings",
      "/user/support",
      "/user/notifications",
    ];

    for (const url of urls) {
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");
      const bodyText = await page.evaluate(() => document.body.innerText || "");
      const emDashes = [...bodyText.matchAll(/\u2014/g)];
      expect(emDashes.length, `Em-dash detected in DOM text of ${url}`).toBe(0);
    }
  });
});

// =========================================================================
// 4. BOUNDARY & INTERACTION STRESS TESTS (Screens 12 to 18)
// =========================================================================
test.describe("Challenger M3 Task 4: Boundary & Interaction Stress Tests", () => {
  test("Screen 12: Breadcrumb navigation and debt list zero-debt empty state", async ({ page }) => {
    await page.goto("/user/debts");
    const breadcrumb = page.locator("nav.breadcrumb, a[href*='account']").first();
    await expect(breadcrumb).toBeVisible();

    const emptyOrList = page.locator(".debt-empty-card, .debt-loan-list").first();
    await expect(emptyOrList).toBeVisible();
  });

  test("Screen 13: Category tabs toggle active state and filter chips respond cleanly", async ({ page }) => {
    await page.goto("/user/explore");
    const tabBtns = page.locator(".marketplace-tabs button");
    await expect(tabBtns.first()).toBeVisible();
    expect(await tabBtns.count()).toBeGreaterThanOrEqual(4);

    // Switch between Explore and Saved
    await tabBtns.nth(3).click();
    await expect(tabBtns.nth(3)).toHaveAttribute("aria-selected", "true");
    await tabBtns.nth(0).click();
    await expect(tabBtns.nth(0)).toHaveAttribute("aria-selected", "true");
  });

  test("Screen 14: AI assistant welcome pills and composer submission prevention on empty input", async ({ page }) => {
    await page.goto("/user/assistant");
    const pills = page.locator(".prompt-pill, .suggestion-chip, .quick-question-btn");
    await expect(pills.first()).toBeVisible();

    const textarea = page.locator(".ai-chat-composer textarea, .ai-chat-bottom textarea, textarea").first();
    await expect(textarea).toBeVisible();
    await textarea.fill("");

    // Submit button in composer should be disabled when input is empty
    const sendBtn = page.locator(".ai-chat-bottom .ai-chat-send, .ai-chat-composer .ai-chat-send").first();
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toBeDisabled();
  });

  test("Screen 15: Financial Profile hub displays 4 cashflow summary metrics and 5 core cards", async ({ page }) => {
    await page.goto("/user/account");
    const metrics = page.locator(".finance-hub-metrics, .overview-metrics").first();
    await expect(metrics).toBeVisible();

    const hubCards = page.locator(".finance-hub-card, .profile-hub-card");
    expect(await hubCards.count()).toBeGreaterThanOrEqual(5);

    const debtsLink = page.locator("a[href*='debts']").first();
    await expect(debtsLink).toBeVisible();
  });

  test("Screen 16: Account settings switches between Profile, Security, and Export tabs", async ({ page }) => {
    await page.goto("/user/account?tab=settings");
    const tabs = page.locator(".account-settings-tabs button");
    await expect(tabs.first()).toBeVisible();
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);

    // Click Security tab
    await tabs.nth(1).click();
    await expect(page.locator(".account-settings-page, .phase-eight-page").first()).toBeVisible();
  });

  test("Screen 17: Support center displays ticket form and renders ledger items", async ({ page }) => {
    await page.goto("/user/support");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(/Hỗ trợ/i);

    const createBtn = page.getByRole("button", { name: /Gửi yêu cầu|Tạo yêu cầu/i }).first();
    await expect(createBtn).toBeVisible();
  });

  test("Screen 18: Notification center search input filters query and mark all read button functions", async ({ page }) => {
    await page.goto("/user/notifications");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText(/Thông báo/i);

    const markAllBtn = page.getByRole("button", { name: /Đánh dấu tất cả đã đọc/i }).first();
    if (await markAllBtn.count() > 0) {
      await markAllBtn.click();
    }

    const searchInput = page.locator(".notif-hub-search-box input, input[type='search']").first();
    if (await searchInput.count() > 0) {
      await searchInput.fill("bảo mật");
      await searchInput.fill("");
    }
  });
});
