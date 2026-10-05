import { expect, test } from "@playwright/test";

test("register and verify call the API once with the correct email and phone", async ({ page }) => {
  const calls: { path: string; body: any }[] = [];
  await page.route("**/api/v1/auth/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    calls.push({ path, body });
    if (path.endsWith("/refresh") || (path.endsWith("/verify-email") && body.otp !== "123456")) {
      return route.fulfill({ status: 401, json: { error: { code: "INVALID_TOKEN", message: "Mã xác thực không hợp lệ hoặc đã hết hạn." } } });
    }
    await route.fulfill({ json: { data: { status: "ACCEPTED" } } });
  });
  await page.goto("/register");
  await page.locator("#register-name").fill("Nguyễn Minh Anh");
  await page.locator("#register-email").fill("minhan@anhuu.test");
  await page.locator("#register-phone").fill("0912 345 678");
  await page.locator("#register-password").fill("  password-with-spaces-123  ");
  await page.getByLabel(/Tôi đồng ý/).check();
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByLabel("Email cần xác minh")).toHaveValue("minhan@anhuu.test");
  expect(calls.filter(c => c.path.endsWith("/register"))).toHaveLength(1);
  expect(calls.find(c => c.path.endsWith("/register"))?.body).toEqual({ fullName: "Nguyễn Minh Anh", email: "minhan@anhuu.test", phone: "0912345678", password: "  password-with-spaces-123  " });
  await page.getByLabel("Mã OTP 6 số").fill("000000");
  await page.getByRole("button", { name: "Xác nhận email & Đăng nhập" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("không hợp lệ");
  await page.getByLabel("Mã OTP 6 số").fill("123456");
  await page.getByRole("button", { name: "Xác nhận email & Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls.filter(c => c.path.endsWith("/verify-email"))).toHaveLength(2);
});

test("forgot/reset use a fragment token and do not double submit", async ({ page }) => {
  const calls: { path: string; body: any }[] = [];
  await page.route("**/api/v1/auth/**", async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, body: route.request().postDataJSON() });
    await route.fulfill({ status: path.endsWith("/refresh") ? 401 : 200, json: { data: { status: "ACCEPTED" } } });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("Email đã đăng ký").fill("minhan@anhuu.test");
  await page.getByRole("button", { name: /Gửi mã xác nhận/ }).click();
  await expect(page.getByText(/Nếu tài khoản phù hợp, hướng dẫn/)).toBeVisible();
  expect(calls.filter(c => c.path.endsWith("/forgot-password"))).toHaveLength(1);
  await page.goto("/reset-password#token=" + "a".repeat(43));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.locator("#reset-new-password").fill("new-long-password-123");
  await page.locator("#reset-confirm-password").fill("new-long-password-123");
  await page.getByRole("button", { name: "Cập nhật mật khẩu & Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Mật khẩu đã được cập nhật" })).toBeVisible();
  expect(calls.filter(c => c.path.endsWith("/reset-password"))).toHaveLength(1);
  expect(calls.find(c => c.path.endsWith("/reset-password"))?.body).toEqual({ token: "a".repeat(43), password: "new-long-password-123" });
});

test("forged stored role cannot grant access and network login errors are visible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("an_huu_auth_user", JSON.stringify({ role: "admin", id: "forged" })));
  let restoreAvailable = false;
  await page.route("**/api/v1/auth/**", route => {
    if (restoreAvailable && new URL(route.request().url()).pathname.endsWith("/refresh")) {
      return route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Yêu cầu đăng nhập." } } });
    }
    return route.abort("connectionrefused");
  });
  await page.goto("/admin/dashboard");
  await expect(page.getByText("Chưa kết nối được máy chủ để khôi phục phiên đăng nhập. Vui lòng thử lại.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.locator(".admin-sidebar")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("an_huu_auth_user"))).toBeNull();
  restoreAvailable = true;
  await page.getByRole("button", { name: "Thử kết nối lại" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Địa chỉ Email").fill("minhan@anhuu.test");
  await page.locator("#login-password").fill("long-password-123");
  await page.getByRole("button", { name: "Đăng nhập vào tài khoản" }).click();
  await expect(page.locator(".auth-error-banner")).toContainText("Không thể kết nối máy chủ");
  await expect(page.getByRole("button", { name: "Đăng nhập vào tài khoản" })).toBeEnabled();
});

test("resending OTP validates email, calls API once and starts a cooldown", async ({ page }) => {
  let resends = 0;
  await page.route("**/api/v1/auth/**", async route => {
    const refresh = route.request().url().endsWith("/refresh");
    if (route.request().url().endsWith("/resend-verification")) resends++;
    await route.fulfill({ status: refresh ? 401 : 202, json: { data: { status: "ACCEPTED" } } });
  });
  await page.goto("/verify");
  await page.getByRole("button", { name: /Gửi lại OTP/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("email hợp lệ");
  expect(resends).toBe(0);
  await page.getByLabel("Email cần xác minh").fill("otp@example.test");
  await page.getByRole("button", { name: /Gửi lại OTP/ }).click();
  await expect(page.getByRole("button", { name: /Gửi lại sau/ })).toBeDisabled();
  await expect(page.getByRole("main").getByRole("status")).toContainText("mã mới");
  expect(resends).toBe(1);
});

test("switching accounts and logout synchronize between tabs", async ({ context, page }) => {
  const baseUser = { id: "first", fullName: "Tài khoản Một", email: "first@example.test", role: "USER", status: "ACTIVE", phone: null, city: null, avatarUrl: null, revision: 0 };
  let current: typeof baseUser | null = null;
  await context.route("**/api/v1/auth/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/login")) {
      const email = route.request().postDataJSON().email;
      current = { ...baseUser, id: email, email, fullName: email === "first@example.test" ? "Tài khoản Một" : "Tài khoản Hai" };
    }
    if (path.endsWith("/logout")) { current = null; return route.fulfill({ json: { data: { loggedOut: true } } }); }
    await route.fulfill({ status: current ? 200 : 401, json: current ? { data: { user: current, accessToken: "test-token" } } : { error: { code: "UNAUTHENTICATED", message: "Yêu cầu đăng nhập." } } });
  });
  const signIn = async (tab: typeof page, email: string) => {
    await tab.goto("/login");
    await tab.getByLabel("Địa chỉ Email").fill(email);
    await tab.locator("#login-password").fill("long-password-123");
    await tab.getByRole("button", { name: "Đăng nhập vào tài khoản" }).click();
    await expect(tab).toHaveURL(/\/user\/dashboard$/);
  };
  await signIn(page, "first@example.test");
  const second = await context.newPage();
  await signIn(second, "second@example.test");
  await expect(page.getByRole("button", { name: /Tài khoản: Tài khoản Hai/ })).toBeVisible();
  await second.getByRole("button", { name: /Tài khoản: Tài khoản Hai/ }).click();
  await second.getByRole("menuitem", { name: /Đăng xuất/ }).click();
  await expect(second).toHaveURL(/\/login$/);
  await expect(page).toHaveURL(/\/login$/);
});

test("auth forms fit desktop and mobile without horizontal overflow", async ({ page }) => {
  await page.route("**/api/v1/auth/**", route => route.fulfill({ status: 401, json: { error: { message: "Yêu cầu đăng nhập." } } }));
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/register", "/verify", "/forgot-password", "/reset-password"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      if (path === "/register" && (width === 390 || width === 1440)) await page.screenshot({ path: `.cache/auth-register-${width}.png`, fullPage: true });
    }
  }
});
