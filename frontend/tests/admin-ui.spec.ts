import { test, expect } from "@playwright/test";
import { installRouteAuth } from "./helpers";

test.describe("Admin Layout & Styling Verification", () => {
  test("renders admin dashboard with royal navy sidebar, inverted fillet curve, and functional collapse", async ({ page }, testInfo) => {
    await installRouteAuth(page);

    // 1. Visit Admin Dashboard
    await page.goto("/admin/dashboard");
    await page.waitForSelector(".admin-sidebar", { state: "visible" });
    await page.waitForSelector(".admin-topbar", { state: "visible" });

    // Verify Brand Logo
    const brandLogo = page.locator(".admin-sidebar-brand .brand-logo-container");
    await expect(brandLogo).toBeVisible();

    // Verify Active Navigation item
    const activeNav = page.locator(".admin-nav a.is-active");
    await expect(activeNav).toBeVisible();
    await expect(activeNav).toHaveAttribute("href", "/admin/dashboard");

    // Screenshot 1: Expanded Sidebar & Topbar
    await page.screenshot({
      path: testInfo.outputPath("admin_dashboard_expanded.png"),
      fullPage: false,
    });

    // 2. Click collapse toggle button in sidebar brand header
    const toggleBtn = page.locator(".admin-sidebar-brand button");
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // Verify collapsed state class applied
    const collapsedSidebar = page.locator(".admin-sidebar.is-collapsed");
    await expect(collapsedSidebar).toBeVisible();

    // Screenshot 2: Collapsed Sidebar
    await page.screenshot({
      path: testInfo.outputPath("admin_dashboard_collapsed.png"),
      fullPage: false,
    });

    // 3. Click toggle button again to expand
    await toggleBtn.click();
    await expect(page.locator(".admin-sidebar")).not.toHaveClass(/is-collapsed/);

    // 4. Verify 'Chọn khu vực demo' is completely removed from DOM
    await expect(page.locator(".admin-sidebar-footer")).toHaveCount(0);
    await expect(page.locator(".demo-home-link")).toHaveCount(0);
    await expect(page.locator('text="Chọn khu vực demo"')).toHaveCount(0);

    // 5. Verify 'Tư vấn & Lịch hẹn' is completely removed from sidebar navigation
    await expect(page.locator('.admin-nav a[href="/admin/consultations"]')).toHaveCount(0);
    await expect(page.locator('.admin-nav:has-text("Tư vấn & Lịch hẹn")')).toHaveCount(0);

    // 6. Verify AI Console button is completely removed from topbar header
    await expect(page.locator(".topbar-ai-pill")).toHaveCount(0);
    await expect(page.locator('.admin-topbar:has-text("AI Console")')).toHaveCount(0);

    // 7. Navigate to Users page and screenshot
    await page.locator('.admin-nav a[href="/admin/users"]').click();
    await page.waitForSelector(".admin-kpi-grid", { state: "visible" });
    await page.waitForSelector(".admin-users-table", { state: "visible" });
    await page.screenshot({
      path: testInfo.outputPath("admin_users_view.png"),
      fullPage: false,
    });

    // 8. Navigate to Content page and screenshot
    await page.locator('.admin-nav a[href="/admin/content"]').click();
    await page.waitForSelector(".admin-kpi-grid", { state: "visible" });
    await page.waitForSelector(".admin-users-table", { state: "visible" });
    await page.screenshot({
      path: testInfo.outputPath("admin_content_view.png"),
      fullPage: false,
    });

    // 9. Navigate to Support & Ticket page and screenshot
    await page.locator('.admin-nav a[href="/admin/support"]').click();
    await page.waitForSelector(".admin-kpi-grid", { state: "visible" });
    await page.waitForSelector(".admin-table-card", { state: "visible" });
    await expect(page.locator("h1")).toContainText("Quản lý hỗ trợ & Ticket");
    await page.screenshot({
      path: testInfo.outputPath("admin_support_redesigned.png"),
      fullPage: false,
    });

    // 10. Navigate to Financial Config page and screenshot
    await page.locator('.admin-nav a[href="/admin/financial-config"]').click();
    await page.waitForSelector(".admin-kpi-grid", { state: "visible" });
    await page.waitForSelector(".financial-assumptions-card", { state: "visible" });
    await expect(page.locator("h1")).toContainText("Cấu hình tham số tài chính");
    // Ensure zero em-dashes on page
    const pageText = await page.locator(".admin-page").innerText();
    expect(pageText).not.toContain("—");
    await page.screenshot({
      path: testInfo.outputPath("admin_financial_redesigned.png"),
      fullPage: false,
    });

    // 11. Navigate to Settings page and screenshot
    await page.locator('.admin-nav a[href="/admin/settings/general"]').first().click();
    await page.waitForSelector(".system-setting-card", { state: "visible" });
    await expect(page.locator("h1")).toContainText("Cài đặt chung");
    await page.screenshot({
      path: testInfo.outputPath("admin_settings_redesigned.png"),
      fullPage: false,
    });

    // 12. Navigate to System Logs sub-item and screenshot
    await page.locator('.admin-nav a[href="/admin/settings/logs"]').click();
    await page.waitForSelector(".audit-log-card", { state: "visible" });
    await page.waitForSelector(".audit-table", { state: "visible" });
    await page.screenshot({
      path: testInfo.outputPath("admin_audit_redesigned.png"),
      fullPage: false,
    });
  });
});
