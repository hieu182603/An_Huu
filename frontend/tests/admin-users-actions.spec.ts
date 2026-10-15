import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth } from "./helpers";

async function mockUsers(page: Page, rejectFirstUpdate = false) {
  await installRouteAuth(page, "ADM-001");
  let user = {
    id: "6eb8adb2-7a1d-42fe-b0c7-d829d6b605d5", fullName: "Nguyễn Minh An",
    email: "an.nguyenminh88@gmail.com", phone: "0912345678", city: "Hà Nội",
    role: "USER", status: "ACTIVE", revision: 1, emailVerifiedAt: "2026-10-03T00:00:00.000Z",
    createdAt: "2026-10-02T18:43:24.563Z", lastActiveAt: "2026-10-03T11:00:00.000Z",
  };
  const mutations: unknown[] = [];
  await page.route("**/api/v1/admin/users**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      mutations.push(body);
      if (rejectFirstUpdate) {
        rejectFirstUpdate = false;
        return route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Không thể cập nhật trạng thái." } } });
      }
      user = { ...user, status: body.action === "suspend" ? "SUSPENDED" : "ACTIVE", revision: user.revision + 1 };
      return route.fulfill({ json: { data: user } });
    }
    if (url.pathname.endsWith(user.id)) {
      return route.fulfill({ json: { data: { user, history: [
        { id: "h1", action: "AUTH_LOGIN", performerName: "Hệ thống", createdAt: user.lastActiveAt, details: null },
      ] } } });
    }
    const matches = !url.searchParams.get("status") || url.searchParams.get("status") === user.status;
    return route.fulfill({ json: { data: { items: matches ? [user] : [], total: matches ? 1 : 0, limit: 10 } } });
  });
  await page.goto("/admin/users");
  return mutations;
}

test("details open in a wide dialog, retain search and restore keyboard focus", async ({ page }, testInfo) => {
  await mockUsers(page);
  const search = page.getByPlaceholder("Nhập họ tên, email hoặc số điện thoại...");
  await search.fill("Minh An");
  await search.press("Enter");
  const details = page.getByRole("button", { name: "Xem chi tiết: Nguyễn Minh An" });
  await expect(page.getByRole("button", { name: "Khóa tài khoản: Nguyễn Minh An", exact: true })).toBeInViewport();
  await details.click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết tài khoản người dùng" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("an.nguyenminh88@gmail.com")).toBeVisible();
  await expect(dialog.getByText("Nhật ký hoạt động gần nhất")).toHaveCount(0);
  await expect(dialog.getByText("Đăng nhập hệ thống")).toHaveCount(0);
  await expect(dialog.getByText("Khách hàng", { exact: true })).toBeVisible();
  await expect(dialog.getByText("0912345678")).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(1000);
  await expect(page).toHaveURL(/\/admin\/users$/);
  await page.screenshot({ path: testInfo.outputPath("user-detail-desktop.png") });
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Khóa tài khoản này" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Đóng modal" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(details).toBeFocused();
  await expect(search).toHaveValue("Minh An");
  await page.screenshot({ path: testInfo.outputPath("user-actions-desktop.png") });
});

test("lock and unlock require a reason, preserve errors and refresh the row", async ({ page }) => {
  const mutations = await mockUsers(page, true);
  await page.getByRole("button", { name: "Khóa tài khoản: Nguyễn Minh An", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Xác nhận khóa", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Lý do (bắt buộc)").fill("Kiểm tra tài khoản");
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("Không thể cập nhật trạng thái.");
  await expect(dialog.getByLabel("Lý do (bắt buộc)")).toHaveValue("Kiểm tra tài khoản");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("tbody").getByText("Đã khóa", { exact: true })).toBeVisible();
  expect(mutations[1]).toEqual({ expectedRevision: 1, action: "suspend", reason: "Kiểm tra tài khoản" });
  await page.getByRole("button", { name: "Mở khóa tài khoản: Nguyễn Minh An" }).click();
  await dialog.getByLabel("Lý do (bắt buộc)").fill("Đã kiểm tra xong");
  await dialog.getByRole("button", { name: "Xác nhận mở khóa" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("tbody").getByText("Đang hoạt động", { exact: true })).toBeVisible();
  expect(mutations[2]).toEqual({ expectedRevision: 2, action: "restore", reason: "Đã kiểm tra xong" });
});

test("mobile detail fits the viewport and detail-to-lock uses a single dialog", async ({ page }, testInfo) => {
  const mutations = await mockUsers(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Xem chi tiết: Nguyễn Minh An" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("an.nguyenminh88@gmail.com")).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("user-detail-mobile.png") });
  await dialog.getByRole("button", { name: "Khóa tài khoản này" }).click();
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAccessibleName("Khóa tài khoản");
  await dialog.getByRole("button", { name: "Hủy bỏ" }).click();
  await expect(dialog).toHaveCount(0);
  expect(mutations).toHaveLength(0);
  await expect(page).toHaveURL(/\/admin\/users$/);
});
