import { test, expect } from "@playwright/test";
import { installRouteAuth } from "./helpers";
test("account edits persist through API, preserve form on conflict and update identity", async ({ page }) => {
  await installRouteAuth(page);
  let account = { id: "USR-001", email: "user@demo.com", fullName: "Nguyễn Minh An", role: "USER", status: "ACTIVE", phone: null, city: null, avatarUrl: null, revision: 0, emailVerifiedAt: "2026-10-03T00:00:00.000Z" };
  let conflict = false;
  await page.route("**/api/v1/me", async route => {
    if (route.request().method() === "PATCH") {
      if (conflict) return route.fulfill({ status: 409, json: { error: { message: "Dữ liệu đã thay đổi. Vui lòng tải lại trước khi lưu." } } });
      const body = route.request().postDataJSON(); expect(body.expectedRevision).toBe(account.revision);
      account = { ...account, ...body.changes, revision: account.revision + 1 };
    }
    await route.fulfill({ json: { data: account } });
  });
  await page.goto("/user/account");
  await page.getByRole("button", { name: /^Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: "Hồ sơ", exact: true }).click();
  await expect(page.getByLabel("Email tài khoản")).toBeDisabled();
  await page.getByLabel("Họ và tên", { exact: true }).fill("Tên mới");
  await page.getByRole("button", { name: "Lưu thông tin cá nhân" }).click();
  await expect(page.getByRole("button", { name: "Tài khoản: Tên mới" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: "Hồ sơ", exact: true }).click();
  await expect(page.getByLabel("Họ và tên", { exact: true })).toHaveValue("Tên mới");
  conflict = true;
  await page.getByLabel("Họ và tên", { exact: true }).fill("Bản đang sửa");
  await page.getByRole("button", { name: "Lưu thông tin cá nhân" }).click();
  await expect(page.getByText("Dữ liệu đã thay đổi.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Họ và tên", { exact: true })).toHaveValue("Bản đang sửa");
});
test("change password shows server failures and logs out only after API success", async ({ page }) => {
  await installRouteAuth(page);
  await page.route("**/api/v1/me", r => r.fulfill({ status: 503, json: { error: { message: "Tạm ngừng" } } }));
  let fail = true;
  await page.route("**/api/v1/auth/change-password", r => r.fulfill({ status: fail ? 400 : 200, json: fail ? { error: { message: "Mật khẩu hiện tại không đúng." } } : { data: { changed: true } } }));
  await page.goto("/user/account");
  await page.getByRole("button", { name: /^Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  await page.getByLabel("Mật khẩu hiện tại", { exact: true }).fill("wrong-password-123");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("replacement-password-123");
  await page.getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill("replacement-password-123");
  await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await expect(page.getByText("Mật khẩu hiện tại không đúng.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/user\/account$/);
  fail = false; await page.getByRole("button", { name: "Đổi mật khẩu", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
