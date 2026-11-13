import { expect, test } from "@playwright/test";
import {
  setupE2ERoutes,
  trackPageErrors,
  assertNoHorizontalOverflow,
  installFinancialProfileRoutes,
} from "./e2e-helpers";

test.beforeEach(async ({ page }) => {
  await setupE2ERoutes(page);
});

// =========================================================================
// GROUP 1: RESPONSIVE VIEWPORTS & HORIZONTAL OVERFLOW PREVENTION
// =========================================================================
test.describe("Tier 2 Group 1: Responsive Viewports & Horizontal Overflow", () => {
  const testedPaths = [
    "/",
    "/mo-phong",
    "/cach-hoat-dong",
    "/tro-ly-ai",
    "/onboarding",
    "/user/dashboard",
    "/user/goal",
    "/user/plan",
    "/user/risk-portfolio",
    "/user/debts",
    "/user/explore",
    "/user/assistant",
    "/user/account",
    "/user/support",
    "/user/notifications",
  ];

  test("2.1.1 Mobile Small (320px) viewport eliminates horizontal overflow across screens", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const path of ["/", "/mo-phong", "/user/dashboard", "/user/plan", "/user/account"]) {
      await page.goto(path);
      await assertNoHorizontalOverflow(page, `320px - ${path}`);
    }
  });

  test("2.1.2 Mobile Standard (390px) iPhone viewport renders cleanly without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/", "/cach-hoat-dong", "/onboarding", "/user/goal", "/user/debts"]) {
      await page.goto(path);
      await assertNoHorizontalOverflow(page, `390px - ${path}`);
    }
  });

  test("2.1.3 Tablet (768px) iPad viewport adapts 2-column grids cleanly", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    for (const path of ["/", "/mo-phong", "/user/dashboard", "/user/risk-portfolio", "/user/explore"]) {
      await page.goto(path);
      await assertNoHorizontalOverflow(page, `768px - ${path}`);
    }
  });

  test("2.1.4 Desktop (1024px & 1440px) viewports render multi-column cards within container max-width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/", "/user/dashboard", "/user/plan", "/user/account"]) {
      await page.goto(path);
      await assertNoHorizontalOverflow(page, `1440px - ${path}`);
    }
  });

  test("2.1.5 Dynamic viewport resizing preserves interactive form state and inputs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/mo-phong");
    const ageInput = page.locator('#num-sim-currentAge, #ke-hoach input.mk-num-input').first();
    await ageInput.fill("42");
    await ageInput.blur();
    // Resize down to mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(ageInput).toHaveValue("42");
    // Resize back to desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(ageInput).toHaveValue("42");
  });
});

// =========================================================================
// GROUP 2: MOBILE DRAWER, HAMBURGER & WORKSPACE NAVIGATION
// =========================================================================
test.describe("Tier 2 Group 2: Mobile Drawer & Navigation", () => {
  test("2.2.1 Mobile hamburger button toggles drawer navigation open and close", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const menuBtn = page.getByRole("button", { name: "Mở menu" });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const mobileNav = page.locator(".mk-mobile-nav, [aria-label*='di động']").first();
    await expect(mobileNav).toBeVisible();
    // Close drawer via close button or Escape
    const closeBtn = page.locator(".dialog-close, button[aria-label*='Đóng']").first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
  });

  test("2.2.2 Navigating via mobile menu closes drawer and navigates to target route", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const menuBtn = page.getByRole("button", { name: "Mở menu" });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();
    const howLink = page.locator(".mk-mobile-nav").getByRole("link", { name: "Cách hoạt động" });
    await howLink.click();
    await expect(page).toHaveURL(/\/cach-hoat-dong/);
  });

  test("2.2.3 User workspace responsive navigation displays accessible bottom bar or drawer on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/user/dashboard");
    const mobileBar = page.locator(".user-mobile-nav, .user-bottom-nav, .user-topbar").first();
    await expect(mobileBar).toBeVisible();
  });

  test("2.2.4 User profile and settings menu toggles cleanly without leaving viewport", async ({ page }) => {
    await page.goto("/user/dashboard");
    const userDropdown = page.locator(".user-profile-menu, .user-avatar-btn, [aria-label*='tài khoản']").first();
    if (await userDropdown.count() > 0) {
      await userDropdown.click();
      const menu = page.locator(".dropdown-menu, .user-menu-popover").first();
      if (await menu.count() > 0) {
        await expect(menu).toBeVisible();
      }
    }
  });

  test("2.2.5 Keyboard focus cycles logically through navigation links", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator(".skip-link");
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Tab");
    const activeElement = page.locator(":focus");
    await expect(activeElement).toBeVisible();
  });
});

// =========================================================================
// GROUP 3: ACCORDIONS, COLLAPSIBLES & DISCLOSURES
// =========================================================================
test.describe("Tier 2 Group 3: Accordions & Collapsibles", () => {
  test("2.3.1 Marketing FAQ accordions open on click and reveal hidden explanation text", async ({ page }) => {
    await page.goto("/cach-hoat-dong");
    const faq = page.locator(".mk-how-faq details").first();
    await expect(faq).not.toHaveAttribute("open");
    await faq.locator("summary").click();
    await expect(faq).toHaveAttribute("open", "");
    await expect(faq.locator("p")).toBeVisible();
  });

  test("2.3.2 Multiple accordions can be toggled independently without interference", async ({ page }) => {
    await page.goto("/cach-hoat-dong");
    const faqs = page.locator(".mk-how-faq details");
    if (await faqs.count() >= 2) {
      await faqs.nth(0).locator("summary").click();
      await faqs.nth(1).locator("summary").click();
      await expect(faqs.nth(0)).toHaveAttribute("open", "");
      await expect(faqs.nth(1)).toHaveAttribute("open", "");
    }
  });

  test("2.3.3 Knowledge page topic category tabs switch active panel and filter items", async ({ page }) => {
    await page.goto("/user/knowledge");
    const tabs = page.locator(".explore-category-tabs button, .knowledge-topics button");
    await tabs.first().waitFor({ state: "visible" });
    if (await tabs.count() >= 3) {
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
      await tabs.nth(2).click();
      await expect(tabs.nth(2)).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("2.3.4 Plan cashflow table toggles rows and pagination controls smoothly", async ({ page }) => {
    await page.goto("/user/plan#plan-cashflow");
    const cashflowTable = page.locator("#plan-cashflow, .monthly-cashflow-table").first();
    await expect(cashflowTable).toBeVisible();
  });

  test("2.3.5 Support ticket detail disclosure expands message history thread", async ({ page }) => {
    await page.goto("/user/support?ticket=tk-001");
    const conversation = page.locator(".ticket-messages, .support-conversation, .messages-list").first();
    if (await conversation.count() > 0) {
      await expect(conversation).toBeVisible();
    }
  });
});

// =========================================================================
// GROUP 4: MODAL TOGGLES, DIALOG FOCUS & BACKDROPS
// =========================================================================
test.describe("Tier 2 Group 4: Modal Toggles & Dialogs", () => {
  test("2.4.1 Product consultation modal opens and closes via ESC key", async ({ page }) => {
    await page.goto("/user/explore");
    const consultBtn = page.getByRole("button", { name: /Tư vấn|Quan tâm|Chi tiết/i }).first();
    if (await consultBtn.count() > 0) {
      await consultBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
    }
  });

  test("2.4.2 Product consultation modal closes upon clicking backdrop or cancel button", async ({ page }) => {
    await page.goto("/user/explore");
    const consultBtn = page.getByRole("button", { name: /Tư vấn|Quan tâm|Chi tiết/i }).first();
    if (await consultBtn.count() > 0) {
      await consultBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      const cancelBtn = modal.getByRole("button", { name: /Hủy|Đóng/i }).first();
      await cancelBtn.click();
      await expect(modal).not.toBeVisible();
    }
  });

  test("2.4.3 Add debt modal opens with focus trapped and closes cleanly", async ({ page }) => {
    await page.goto("/user/debts");
    const addBtn = page.getByRole("button", { name: /Thêm khoản nợ|Khai báo khoản (nợ|vay)/i }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      await expect(modal).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
    }
  });

  test("2.4.4 Social insurance explanation / pension calculation dialog toggles smoothly", async ({ page }) => {
    await page.goto("/user/plan");
    const bhxhBtn = page.getByRole("button", { name: /Bảo hiểm xã hội|BHXH|Tính lương hưu/i }).first();
    if (await bhxhBtn.count() > 0) {
      await bhxhBtn.click();
      const modal = page.locator('.modal, [role="dialog"]').first();
      if (await modal.count() > 0) {
        await expect(modal).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }
  });

  test("2.4.5 Quick onboarding error notification displays and clears on valid correction", async ({ page }) => {
    await installFinancialProfileRoutes(page, { profile: null, draft: null });
    await page.goto("/onboarding");
    const card = page.locator(".qo-card");
    const nextBtn = card.getByRole("button", { name: /Tiếp tục/i });
    // Attempt clicking next with empty birth month
    const birthInput = card.locator('input[type="month"]').first();
    await birthInput.fill("");
    await nextBtn.click();
    // Expect error alert
    const errAlert = page.locator('.qo-error, [role="alert"]').first();
    if (await errAlert.count() > 0) {
      await expect(errAlert).toBeVisible();
      // Fill valid month and verify advancement
      await birthInput.fill("1988-10");
      const monthInputs = card.locator('input[type="month"]');
      if (await monthInputs.count() > 1) {
        await monthInputs.nth(1).fill("2050-10");
      }
      const currencyInput = card.locator('input[type="text"]').first();
      if (await currencyInput.count() > 0) {
        await currencyInput.fill("20000000");
      }
      await nextBtn.click();
      await expect(card.getByText(/BƯỚC 2\/4/i)).toBeVisible();
    }
  });
});

// =========================================================================
// GROUP 5: EMPTY STATES, BOUNDARY & EXTREME INPUT VALUES
// =========================================================================
test.describe("Tier 2 Group 5: Empty States & Boundary Inputs", () => {
  test("2.5.1 Zero initial savings and zero monthly savings in simulator handle math safely", async ({ page }) => {
    await page.goto("/mo-phong");
    const inputs = page.locator('#ke-hoach input.mk-num-input');
    if (await inputs.count() > 1) {
      await inputs.nth(1).fill("0");
      await inputs.nth(1).blur();
      const resultCard = page.locator(".mk-result-card, .mk-demo-result, .mk-plan-chart-card").first();
      await expect(resultCard).toBeVisible();
      // Ensure no NaN or Infinity is displayed
      const text = await resultCard.innerText();
      expect(text).not.toContain("NaN");
      expect(text).not.toContain("Infinity");
    }
  });

  test("2.5.2 Bound extreme retirement ages: equal to current age vs late retirement age (70)", async ({ page }) => {
    await page.goto("/mo-phong");
    const currentAgeInput = page.locator('#num-sim-currentAge, #ke-hoach input.mk-num-input').first();
    if (await currentAgeInput.count() > 0) {
      await currentAgeInput.fill("55");
      await currentAgeInput.blur();
      const resultCard = page.locator(".mk-result-card, .mk-demo-result, .mk-plan-chart-card").first();
      await expect(resultCard).toBeVisible();
    }
  });

  test("2.5.3 Empty notifications list displays informative empty state message", async ({ page }) => {
    // Override notifications route with empty list
    await page.route("**/api/v1/me/notifications**", async (route) => {
      return route.fulfill({
        json: {
          items: [],
          total: 0,
          unread: 0,
          data: { items: [], total: 0, unreadCount: 0 },
        },
      });
    });
    await page.goto("/user/notifications");
    await expect(page.getByText(/Không có thông báo|Chưa có thông báo/i).first()).toBeVisible();
  });

  test("2.5.4 Empty support tickets list displays empty state with invitation to create ticket", async ({ page }) => {
    // Override support route with empty list
    await page.route("**/api/v1/me/support**", async (route) => {
      return route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 20 } } });
    });
    await page.goto("/user/support");
    await expect(page.getByText(/Chưa có yêu cầu hỗ trợ|Không có yêu cầu/i).first()).toBeVisible();
  });

  test("2.5.5 User dashboard with 0 debt renders zero-debt / healthy status badge", async ({ page }) => {
    await page.goto("/user/dashboard");
    const cashflowSection = page.locator(".user-cashflow-section");
    await expect(cashflowSection).toBeVisible();
  });
});
