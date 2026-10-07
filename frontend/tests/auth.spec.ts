import { expect, test } from "@playwright/test";

const apiUser = { id: "AUTH-USER", fullName: "Nguyễn Minh Anh", email: "user@demo.com", role: "USER", status: "ACTIVE", phone: null, city: null, avatarUrl: null, revision: 0 };
test.beforeEach(async ({ page }) => {
  let current: typeof apiUser | null = null;
  await page.route("**/api/v1/auth/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith("/login")) current = { ...apiUser, role: body.email === "admin@demo.com" ? "ADMIN" : "USER" };
    if (path.endsWith("/logout")) { current = null; return route.fulfill({ json: { data: { status: "OK" } } }); }
    if (!current) return route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Yêu cầu đăng nhập." } } });
    await route.fulfill({ json: { data: { user: current, accessToken: "test-token" } } });
  });
});

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

test("phiên API không lưu token vào browser storage và đăng xuất thu hồi phiên", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Địa chỉ Email").fill("admin@demo.com");
  await page.locator("#login-password").fill("admin123");
  await page.getByRole("button", { name: "Đăng nhập vào tài khoản" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect.poll(() => page.evaluate(() => ({ local: localStorage.getItem("an_huu_auth_user"), session: sessionStorage.getItem("an_huu_auth_user") }))).toEqual(expect.objectContaining({ local: null }));
  expect(await page.evaluate(() => sessionStorage.getItem("an_huu_auth_user"))).toBeNull();

  await page.getByRole("button", { name: /Tài khoản:/ }).click();
  await page.getByRole("menuitem", { name: /Đăng xuất/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => ({ local: localStorage.getItem("an_huu_auth_user"), session: sessionStorage.getItem("an_huu_auth_user") }))).toEqual({ local: null, session: null });
});

test("email và mã xác thực không hợp lệ không được báo thành công", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email đã đăng ký").fill("abc");
  await page.getByRole("button", { name: /Gửi mã xác nhận/ }).click();
  expect(await page.getByLabel("Email đã đăng ký").evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);

});
