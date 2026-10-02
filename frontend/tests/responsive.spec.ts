import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth } from "./helpers";

test.beforeEach(async ({ page }) => installRouteAuth(page));

const routes = ["/", "/demo", "/login", "/register", "/forgot-password", "/reset-password", "/verify", "/onboarding", "/user/dashboard", "/user/goal", "/user/plan", "/user/simulation", "/user/assistant", "/user/explore", "/user/account", "/admin/dashboard", "/admin/users", "/admin/users/USR-1082", "/admin/consultations", "/admin/content", "/admin/partners", "/admin/ai", "/admin/financial-config", "/admin/support", "/admin/reports", "/admin/settings/general", "/admin/settings/integrations", "/admin/settings/notifications", "/admin/settings/privacy", "/admin/settings/audit-log"];

async function expectReflow(page: Page) {
  const issues = await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 2) issues.push(`Document: ${document.documentElement.scrollWidth}px > ${innerWidth}px`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.visibility === "hidden" || style.opacity === "0" || el.closest("svg,.sr-only,.label-hidden .field-label,.skip-link")) continue;
      // Intentional horizontal scrolling belongs to tables/charts, never the page.
      let inScroller = false;
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX)) { inScroller = true; break; }
      }
      if (!inScroller && (rect.right > innerWidth + 2 || rect.left < -2)) issues.push(`${el.tagName}.${el.className}: ${Math.round(rect.left)}..${Math.round(rect.right)}`);
    }
    return issues.slice(0, 12);
  });
  expect(issues, page.url()).toEqual([]);
}

for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [844, 390], [1024, 768], [1280, 900], [1440, 1000], [1920, 1080]]) {
  test(`all routes reflow at ${width} × ${height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("#main-content").or(page.locator(".auth-page,.onboarding-page,.demo-entry")).first()).toBeVisible();
      await expectReflow(page);
    }
    expect(errors).toEqual([]);
  });
}

test("mobile navigation exposes every user module and traps focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/user/dashboard");
  const trigger = page.getByRole("button", { name: "Mở menu tài khoản" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('a[href^="/user/"]')).toHaveCount(7);
  await expectReflow(page);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Hồ sơ tài chính" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Đóng drawer" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Mô phỏng & Theo dõi" }).click();
  await expect(page).toHaveURL(/\/user\/simulation$/);
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Theo dõi tiến độ", exact: true }).click();
  await expectReflow(page);
  await page.getByRole("button", { name: "Mở menu tài khoản" }).click();
  await dialog.getByRole("link", { name: "Kiến thức & Giải pháp" }).click();
  await expect(page).toHaveURL(/\/user\/explore$/);
});

test("tablet landing navigation and landscape admin menu remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở menu", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Mô phỏng", exact: true }).click();
  await expect(page).toHaveURL(/\/mo-phong$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto("/admin/dashboard");
  await page.getByRole("button", { name: "Mở menu quản trị" }).click();
  const dialog = page.getByRole("dialog");
  await expectReflow(page);
  await dialog.getByRole("link", { name: "Cấu hình hệ thống" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/general$/);
  await expect(dialog).toHaveCount(0);
});

test("long edit modal scrolls on a short screen and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/admin/content");
  const trigger = page.getByRole("button", { name: "Tạo nội dung mới" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectReflow(page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(481);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  const cancel = dialog.getByRole("button", { name: "Hủy", exact: true });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Đóng modal" })).toBeInViewport();
  await cancel.click();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.getElementById("root")!.inert)).toBe(false);
});

test("all onboarding steps and account panels reflow on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/onboarding");
  for (let step = 0; step < 8; step++) {
    await expectReflow(page);
    const next = page.getByRole("button", { name: /Tiếp tục bước tiếp theo|Hoàn tất hồ sơ/ });
    await next.click();
  }
  await expectReflow(page);
  await page.goto("/user/account");
  const buttons = page.locator(".account-nav button");
  for (let index = 0; index < await buttons.count(); index++) {
    await buttons.nth(index).click();
    await expectReflow(page);
  }
});

test("financial charts scroll and AI composer stays available after messages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/user/dashboard");
  const chart = page.locator(".projection-chart-area");
  await chart.scrollIntoViewIfNeeded();
  await chart.focus();
  await page.keyboard.press("End");
  await chart.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  expect(await chart.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expectReflow(page);
  await page.goto("/user/assistant");
  const input = page.getByRole("textbox", { name: "Câu hỏi dành cho trợ lý AI" });
  await input.fill("Tôi cần tiết kiệm bao nhiêu mỗi tháng?");
  await page.getByRole("button", { name: "Gửi câu hỏi" }).click();
  await expect(input).toHaveValue("");
  await expectReflow(page);
  await expect(page.getByRole("button", { name: "Gửi câu hỏi" })).toBeVisible();
});

for (const width of [320, 768]) {
  test(`admin tabs and detail forms reflow at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 740 });
    for (const route of ["/admin/users/USR-1082", "/admin/content", "/admin/partners", "/admin/ai", "/admin/financial-config", "/admin/support"]) {
      await page.goto(route);
      const tabs = page.getByRole("tab");
      for (let i = 0; i < await tabs.count(); i++) {
        await tabs.nth(i).click();
        await expectReflow(page);
      }
    }
    if (width === 320) {
      for (const [route, label] of [["/admin/consultations", "Xử lý yêu cầu"], ["/admin/partners", "Xem chi tiết minh bạch"], ["/admin/financial-config", "Điều chỉnh tham số"]]) {
        await page.goto(route);
        await page.getByRole("button", { name: label, exact: true }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectReflow(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
    }
  });
}
