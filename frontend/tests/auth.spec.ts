import { expect, test } from "@playwright/test";

test("khách bị chặn khỏi khu vực bảo vệ và user không thể vào admin", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Địa chỉ Email").fill("user@demo.com");
  await page.locator("#login-password").fill("demo123");
  await page.getByRole("button", { name: "Đăng nhập vào tài khoản" }).click();
  await expect(page).toHaveURL(/\/user\/dashboard$/);

  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/user\/dashboard$/);
});

test("ghi nhớ đăng nhập chọn đúng nơi lưu và đăng xuất xóa phiên", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Địa chỉ Email").fill("admin@demo.com");
  await page.locator("#login-password").fill("admin123");
  await page.getByRole("button", { name: "Đăng nhập vào tài khoản" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect.poll(() => page.evaluate(() => ({ local: localStorage.getItem("an_huu_auth_user"), session: sessionStorage.getItem("an_huu_auth_user") }))).toEqual(expect.objectContaining({ local: null }));
  expect(await page.evaluate(() => sessionStorage.getItem("an_huu_auth_user"))).toBeTruthy();

  await page.getByRole("button", { name: /Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: /Đăng xuất/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => ({ local: localStorage.getItem("an_huu_auth_user"), session: sessionStorage.getItem("an_huu_auth_user") }))).toEqual({ local: null, session: null });
});

test("email và mã xác thực không hợp lệ không được báo thành công", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email đã đăng ký").fill("abc");
  await page.getByRole("button", { name: /Gửi mã xác nhận/ }).click();
  await expect(page.getByRole("alert")).toContainText(/email hợp lệ/i);

  await page.goto("/verify");
  await page.getByRole("button", { name: /Xác nhận & Bắt đầu/ }).click();
  await expect(page.getByRole("alert")).toContainText(/6 chữ số/i);
});
