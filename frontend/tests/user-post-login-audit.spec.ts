import { test, expect } from "@playwright/test";
import { setupRemaining } from "./remaining-helpers";
import { discoveryApi, setupDiscovery } from "./discovery-helpers";
import { toggleExplainMode } from "./helpers";

test.afterEach(async ({ page }) => { await page.waitForLoadState("networkidle"); });

test("header account actions open the same personal and settings screens as the demo", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/dashboard");
  await page.getByRole("button", { name: /^Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: "Hồ sơ", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/account$/);
  await expect(page.getByRole("heading", { name: "Thông tin cá nhân", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/account\?tab=settings$/);
  await expect(page.getByRole("button", { name: "Đổi mật khẩu", exact: true })).toBeVisible();
});

test("security notification links open settings and account logout requires confirmation", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/account?tab=security");
  await expect(page.getByRole("button", { name: "Đổi mật khẩu", exact: true })).toBeVisible();
  let writes = 0;
  await page.route("**/api/v1/auth/logout", route => { writes++; return route.fulfill({ status: 503, json: { error: { message: "Chưa đăng xuất được" } } }); });
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Đăng xuất khỏi An Hưu?");
  expect(writes).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Chưa đăng xuất được");
  expect(writes).toBe(1);
});

test("unread pagination returns to a real page after marking all read", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/notifications?filter=unread&page=2");
  await expect(page.locator(".notification-record").first()).toBeVisible();
  await page.getByRole("button", { name: "Đánh dấu tất cả đã đọc", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Phân trang", exact: true })).toContainText("Trang 1/1");
  await expect(page.locator(".notification-record")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Phân trang", exact: true })).toContainText("Trang 1/1");
});

test("notification URL parsing rejects fractional and infinite pages before calling the API", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/notifications?page=Infinity&filter=unknown");
  await expect(page.locator(".notification-record")).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Tất cả", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/user/notifications?page=1.5");
  await expect(page.locator(".notification-record")).toHaveCount(20);
});

test("plan checklist never claims an unsaved first plan is complete", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/plan?tab=adjust", { savedPlan: false });
  const checklist = page.locator(".accuracy-checklist");
  await expect(checklist.getByRole("link", { name: "Bổ sung Bản kế hoạch đầu tiên", exact: true })).toBeVisible();
  await expect(checklist.locator(".checklist-completed-list")).not.toContainText("Bản kế hoạch đầu tiên");
});

test("incomplete comparison links recover to financial data and real plan settings", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/plan");
  await page.route("**/api/v1/me/retirement/preview?**", route => route.fulfill({ json: { data: {
    status: "INCOMPLETE", issues: [
      { code: "DEBT_SCHEDULE_REQUIRED", path: "debts" },
      { code: "START_OF_MONTH_FUNDING_CONFIRMATION_REQUIRED", path: "startOfMonthFunding" },
    ], warnings: [],
  } } }));
  await page.goto("/user/plan?view=compare");
  await expect(page.getByRole("link", { name: "Kiểm tra hồ sơ tài chính", exact: true })).toHaveAttribute("href", "/user/profile");
  await page.getByRole("link", { name: "Kiểm tra thiết lập kế hoạch", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/plan\?tab=adjust/);
  await expect(page.locator("#plan-settings")).toBeVisible();
});

test("mobile header controls stay within the viewport and the drawer exposes account pages", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setupRemaining(page, request, "/user/dashboard");
  const overflow = await page.locator(".user-topbar").evaluate(root =>
    [...root.querySelectorAll<HTMLElement>("button,a")].filter(el => el.getClientRects().length && !el.closest('[role="menu"]')).map(el => ({ label: el.getAttribute("aria-label") ?? el.textContent, box: el.getBoundingClientRect() })).filter(({ box }) => box.left < -1 || box.right > innerWidth + 1).map(({ label }) => label));
  expect(overflow).toEqual([]);
  await page.getByRole("button", { name: "Mở menu tài khoản", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Thông tin cá nhân", exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Cài đặt tài khoản", exact: true })).toBeVisible();
  await dialog.getByRole("link", { name: "Cài đặt tài khoản", exact: true }).click();
  await expect(page).toHaveURL(/tab=settings/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.locator("#root").evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await page.screenshot({ path: info.outputPath("mobile-account-settings.png"), fullPage: true });
});

test("header assistant opens AI chat without changing the saved plan", async ({ page, request }) => {
  const state = await setupRemaining(page, request, "/user/dashboard");
  await page.locator(".topbar-ai-pill").click();
  await expect(page).toHaveURL(/\/user\/assistant$/);
  await expect(page.locator(".ai-chat-workspace")).toBeVisible();
  expect(state.writes.some(write => write.path.endsWith("/apply"))).toBe(false);
});

test("explanation mode remains available from the account menu and Escape turns it off", async ({ page, request }) => {
  await setupRemaining(page, request, "/user/plan");
  await toggleExplainMode(page);
  await expect(page.locator(".explain-mode-banner")).toBeVisible();
  await expect(page).toHaveURL(/\/user\/plan$/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".explain-mode-banner")).toHaveCount(0);
});

test("saved product and article lists recover when the last item on page two is removed", async ({ page, request }) => {
  const state = await setupDiscovery(page, request, "/user/explore");
  for (const [route, rows, listPath, card, button] of [
    ["saved-products", state.fixture.products, "/user/explore?tab=saved&page=2", ".products-grid>.product-card", /^Bỏ quan tâm:/],
    ["saved-articles", state.fixture.articles, "/user/knowledge?saved=1&page=2", ".products-grid>.product-card", /^Bỏ lưu bài:/],
  ] as const) {
    expect(rows.length).toBeGreaterThanOrEqual(13);
    for (const row of rows.slice(0, 13)) {
      const result = await request.put(`${discoveryApi}/api/v1/me/${route}/${row.id}`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: {} });
      expect(result.ok()).toBe(true);
    }
    await page.goto(listPath);
    await expect(page.locator(card)).toHaveCount(1);
    await page.locator(card).getByRole("button", { name: button }).first().click();
    await expect(page.getByRole("navigation", { name: "Phân trang", exact: true })).toContainText("Trang 1/1");
    await expect(page.locator(card)).toHaveCount(12);
  }
});

test("support discard dialog keeps the unsent reply and never leaves the app inert", async ({ page, request }, info) => {
  await setupRemaining(page, request, "/user/support");
  await page.getByLabel("Bạn cần hỗ trợ về việc gì?", { exact: true }).fill("Kiểm tra giao diện");
  await page.getByLabel("Nội dung", { exact: true }).fill("Cần kiểm tra hộp thoại phản hồi.");
  await page.getByRole("button", { name: "Gửi yêu cầu", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Nội dung phản hồi", exact: true }).fill("Phản hồi chưa gửi");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toContainText("Bỏ phản hồi chưa gửi?");
  expect(await page.locator("#root").evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.screenshot({ path: info.outputPath("support-discard-popup.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Nội dung phản hồi", exact: true })).toHaveValue("Phản hồi chưa gửi");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").getByRole("button", { name: "Bỏ phản hồi", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.locator("#root").evaluate(el => (el as HTMLElement).inert)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe("hidden");
});
