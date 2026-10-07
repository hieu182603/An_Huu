import { expect, test } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

const settings = {
  general: { systemName: "An Hưu", defaultLanguage: "vi", operatingTimezone: "GMT+7 (Việt Nam)", supportEmail: "support@example.test", maintenanceMode: false },
  security: { sessionTimeoutMinutes: 60, maxLoginAttempts: 5, accountLockMinutes: 15, passwordMinLength: 12, passwordRequireUppercase: true, passwordRequireLowercase: true, passwordRequireNumber: true, passwordRequireSpecial: true, admin2faRequired: true },
  notifications: { emailEnabled: true, inAppEnabled: true, smsEnabled: false, notifyAccount: true, notifySupport: true, notifyFinancial: true, notifySystem: true },
};

for (const section of Object.keys(settings) as (keyof typeof settings)[]) {
  test(`${section}: failed load cannot save defaults; retry restores server values`, async ({ page }) => {
    await installRouteAuth(page, "ADM-001");
    let available = false;
    const writes: unknown[] = [];
    await page.route(`**/api/v1/admin/settings/${section}`, route => {
      if (route.request().method() === "PUT") {
        writes.push(route.request().postDataJSON());
        return route.fulfill({ json: { data: settings[section] } });
      }
      return available ? route.fulfill({ json: { data: settings[section] } }) : route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Tạm không tải được cấu hình" } } });
    });
    await page.goto(`/admin/settings/${section}`);
    await expect(page.getByRole("heading", { name: "Lỗi tải cấu hình" })).toBeVisible();
    await expect(page.locator(".system-settings-form")).toHaveCount(0);
    expect(writes).toEqual([]);
    available = true;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(page.locator(".system-settings-form")).toBeVisible();
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual(settings[section]);
  });
}

test("support, notifications and asset overrides expose meaningful input names", async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);
  await page.goto("/user/support");
  await expect(page.getByRole("textbox", { name: "Tìm yêu cầu hỗ trợ" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Nhóm yêu cầu", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Trạng thái yêu cầu" })).toBeVisible();
  await page.goto("/user/notifications");
  await expect(page.getByRole("textbox", { name: "Lọc thông báo" })).toBeVisible();
  await page.goto("/user/simulation");
  await expect(page.getByRole("textbox", { name: /^Bất động sản/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Cổ phiếu & Quỹ/ })).toBeVisible();
});

test("tabs support arrows, Home and End with one tab stop", async ({ page }) => {
  await installRouteAuth(page, "ADM-001");
  await page.goto("/admin/partners");
  const tabs = page.getByRole("tablist").getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.first()).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.last()).toBeFocused();
});

test("registration OTP dialog has a name, traps focus and closes with Escape", async ({ page }) => {
  await page.route("**/api/v1/auth/**", route => route.fulfill({ status: route.request().url().endsWith("/refresh") ? 401 : 200, json: { data: { status: "ACCEPTED" } } }));
  await page.goto("/register");
  await page.locator("#register-name").fill("Nguyễn Minh Anh");
  await page.locator("#register-email").fill("audit@example.test");
  await page.locator("#register-password").fill("valid-password-123");
  await page.getByLabel(/Tôi đồng ý/).check();
  const trigger = page.getByRole("button", { name: "Tạo tài khoản", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Xác minh email" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("changing support category returns pagination to page one", async ({ page }) => {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page);
  const pages: string[] = [];
  await page.route("**/api/v1/me/support?*", route => {
    const current = new URL(route.request().url()).searchParams.get("page")!;
    pages.push(current);
    return route.fulfill({ json: { data: { items: [{ id: "ticket-1", subject: "Yêu cầu mẫu", category: "Tài khoản", status: "OPEN", revision: 1, createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z" }], total: 40, limit: 20 } } });
  });
  await page.goto("/user/support");
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect.poll(() => pages.at(-1)).toBe("2");
  await page.getByRole("combobox", { name: "Nhóm yêu cầu", exact: true }).selectOption("Tài khoản");
  await expect(page.getByRole("button", { name: "Trang 1", exact: true })).toHaveAttribute("aria-current", "page");
});
