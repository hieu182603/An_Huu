import { expect, test, type Page } from '@playwright/test';

async function loginFixture(page: Page) {
  const calls: { path: string; body: any }[] = [];
  let mode: 'unverified' | 'wrong' | 'network' | 'limited' | 'success' = 'unverified';
  let resendFails = false, verified = false, delay = 0;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON(); calls.push({ path, body });
    if (path.endsWith('/refresh')) return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Yêu cầu đăng nhập.' } } });
    if (path.endsWith('/resend-verification')) return route.fulfill(resendFails
      ? { status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Chưa gửi được yêu cầu xác minh. Vui lòng thử lại.' } } }
      : { status: 202, json: { data: { status: 'ACCEPTED' } } });
    if (path.endsWith('/verify-email')) { verified = true; return route.fulfill({ json: { data: { verified: true } } }); }
    if (path.endsWith('/login')) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      if (mode === 'network') return route.abort('connectionrefused');
      if (verified) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Tạm không đăng nhập được.' } } });
      if (mode === 'success') return route.fulfill({ json: { data: { accessToken: `audit.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`, user: { id: 'login-audit', fullName: 'Nguyễn Minh An', email: body.email, role: 'USER', status: 'ACTIVE', phone: null, city: null, avatarUrl: null, revision: 1 } } } });
      return route.fulfill({ status: mode === 'limited' ? 429 : mode === 'wrong' ? 401 : 403, json: { error: { code: mode === 'limited' ? 'RATE_LIMITED' : mode === 'wrong' ? 'UNAUTHENTICATED' : 'EMAIL_NOT_VERIFIED', message: mode === 'limited' ? 'Bạn thử quá nhiều lần. Vui lòng thử lại sau.' : mode === 'wrong' ? 'Email hoặc mật khẩu không đúng.' : 'Bạn cần xác minh email.' } } });
    }
    return route.fulfill({ status: 503, json: { error: { code: 'UNMOCKED_TEST_API', message: 'Outside login audit' } } });
  });
  const submit = () => page.getByRole('button', { name: 'Đăng nhập vào tài khoản', exact: true }).click();
  const fill = async () => { await page.goto('/login'); await page.locator('#login-email').fill('audit@example.test'); await page.locator('#login-password').fill('  valid-password-123  '); };
  return { calls, fill, submit, count: (suffix: string) => calls.filter(c => c.path.endsWith(suffix)).length, setMode: (value: typeof mode) => { mode = value; }, failResend: (value: boolean) => { resendFails = value; }, setDelay: (ms: number) => { delay = ms; } };
}

test('login: failed automatic resend is visible and immediately retryable', async ({ page }) => {
  const f = await loginFixture(page); f.failResend(true); await f.fill(); await f.submit();
  const dialog = page.getByRole('dialog', { name: 'Xác minh email' }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Chưa gửi được yêu cầu');
  await expect(dialog.getByRole('button', { name: 'Gửi lại mã', exact: true })).toBeEnabled();
  f.failResend(false); await dialog.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /Gửi lại sau/ })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('login: successful verification followed by failed login exits consumed-code dialog', async ({ page }) => {
  const f = await loginFixture(page); await f.fill(); await f.submit();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.type('123456');
  await page.getByRole('button', { name: 'Xác nhận email & Đăng nhập', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.auth-error-banner')).toContainText('đã xác minh');
  await expect(page.locator('#login-password')).toBeFocused();
  expect(f.count('/verify-email')).toBe(1); expect(f.count('/login')).toBe(2);
});

test('login: fallback from registration prefills email without persisting password', async ({ page }) => {
  await loginFixture(page);
  await page.addInitScript(() => { if (location.pathname === '/login') history.replaceState({ usr: { email: 'verified@example.test', isNewUser: true, from: '/onboarding' }, key: 'audit', idx: 0 }, ''); });
  await page.goto('/login'); await expect(page.locator('#login-email')).toHaveValue('verified@example.test');
  await expect(page.locator('#login-password')).toHaveValue('');
});

test('login: in-flight credentials and remember choice stay fixed', async ({ page }) => {
  const f = await loginFixture(page); f.setDelay(1500); f.setMode('wrong'); await f.fill();
  await page.getByLabel('Ghi nhớ đăng nhập', { exact: true }).check(); await f.submit();
  await expect(page.locator('#login-email')).toBeDisabled();
  await expect(page.locator('#login-password')).toBeDisabled();
  await expect(page.getByLabel('Ghi nhớ đăng nhập', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Đăng nhập nhanh với Google', exact: true })).toBeDisabled();
  await expect(page.locator('.auth-error-banner')).toContainText('không đúng');
  await expect(page.locator('#login-email')).toBeEnabled();
  expect(f.calls.find(c => c.path.endsWith('/login'))?.body).toEqual({ email: 'audit@example.test', password: '  valid-password-123  ', remember: true });
});

test('login: OTP reopen keeps resend cooldown and restores focus after close', async ({ page }) => {
  await page.clock.install(); const f = await loginFixture(page); await f.fill(); await f.submit();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.clock.fastForward(20_000); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Đăng nhập vào tài khoản', exact: true })).toBeFocused();
  await f.submit(); await expect(page.getByRole('button', { name: 'Gửi lại sau 40 giây' })).toBeDisabled();
  expect(f.count('/resend-verification')).toBe(1);
  await page.clock.fastForward(41_000); await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gửi lại sau 60 giây' })).toBeDisabled();
  await page.clock.fastForward(10_000); await page.keyboard.press('Escape'); await f.submit();
  await expect(page.getByRole('button', { name: 'Gửi lại sau 50 giây' })).toBeDisabled();
  expect(f.count('/resend-verification')).toBe(2);
});

test('login: required fields, password eye, remember off, network and rate limit recovery', async ({ page }) => {
  const f = await loginFixture(page); await page.goto('/login'); await f.submit();
  await expect(page.locator('#login-email')).toBeFocused(); expect(f.count('/login')).toBe(0);
  await f.fill();
  await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click(); await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ẩn mật khẩu', exact: true }).click(); await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');
  f.setMode('network'); await f.submit(); await expect(page.locator('.auth-error-banner')).toContainText('Không thể kết nối');
  f.setMode('limited'); await f.submit(); await expect(page.locator('.auth-error-banner')).toContainText('quá nhiều');
  f.setMode('wrong'); await f.submit(); await expect(page.locator('.auth-error-banner')).toContainText('không đúng');
  expect(f.calls.filter(c => c.path.endsWith('/login')).every(c => c.body.remember === false)).toBe(true);
  await page.locator('#login-password').fill('another-password'); await expect(page.locator('.auth-error-banner')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Quên mật khẩu?', exact: true })).toHaveAttribute('href', '/forgot-password');
  await expect(page.getByRole('link', { name: /Đăng ký ngay/ })).toHaveAttribute('href', '/register');
});

test('login Google: unavailable prompt shows an actionable message', async ({ page }) => {
  await loginFixture(page);
  await page.addInitScript(() => {
    (window as any).google = { accounts: { id: { initialize() {}, prompt(callback: any) { callback({ isNotDisplayed: () => true, getNotDisplayedReason: () => 'test_unavailable', isSkippedMoment: () => false, isDismissedMoment: () => false }); } } } };
  });
  await page.goto('/login'); await page.getByRole('button', { name: 'Đăng nhập nhanh với Google', exact: true }).click();
  await expect(page.locator('.auth-error-banner')).toContainText('không mở được');
  await expect(page.locator('#login-email')).toBeEnabled();
});

test('login Google: SDK load failure can retry without reloading the page', async ({ page }) => {
  await loginFixture(page); let loads = 0;
  await page.route('https://accounts.google.com/gsi/client', route => {
    loads++;
    if (loads === 1) return route.abort('connectionrefused');
    return route.fulfill({ contentType: 'application/javascript', body: `window.google = { accounts: { id: { initialize() {}, prompt(callback) { callback({ isNotDisplayed: () => true, getNotDisplayedReason: () => 'test', isSkippedMoment: () => false, isDismissedMoment: () => false }); } } } };` });
  });
  await page.goto('/login'); const google = page.getByRole('button', { name: 'Đăng nhập nhanh với Google', exact: true });
  await google.click(); await expect(page.locator('.auth-error-banner')).toContainText('Chưa thể kết nối');
  await google.click(); await expect.poll(() => loads).toBe(2);
  await expect(page.locator('.auth-error-banner')).toContainText('không mở được');
});

test('login: successful session resumes the requested private route', async ({ page }) => {
  const f = await loginFixture(page); f.setMode('success');
  await page.addInitScript(() => { if (location.pathname === '/login') history.replaceState({ usr: { from: '/user/account?tab=security' }, key: 'audit', idx: 0 }, ''); });
  await f.fill(); await f.submit(); await expect(page).toHaveURL(/\/user\/account\?tab=security$/);
  expect(f.count('/login')).toBe(1);
  // Assert only the navigation boundary, not the destination screen's data.
});

test('login Google: credential API error restores controls and shows the server message', async ({ page }) => {
  await loginFixture(page);
  await page.route('**/api/v1/auth/google', async route => {
    await new Promise(r => setTimeout(r, 700));
    return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Phiên Google chưa được chấp nhận. Vui lòng thử lại.' } } });
  });
  await page.addInitScript(() => {
    let callback: any;
    (window as any).google = { accounts: { id: { initialize(options: any) { callback = options.callback; }, prompt() { callback({ credential: `x.${btoa(JSON.stringify({ sub: 'audit-google', email: 'audit@example.test', email_verified: true, name: 'Audit' }))}.x` }); } } } };
  });
  await page.goto('/login'); await page.getByRole('button', { name: 'Đăng nhập nhanh với Google', exact: true }).click();
  await expect(page.locator('#login-email')).toBeDisabled();
  await expect(page.locator('.auth-error-banner')).toContainText('Phiên Google chưa được chấp nhận');
  await expect(page.locator('#login-email')).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }, { width: 390, height: 400 }]) {
  test(`login: controls and OTP reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const f = await loginFixture(page); await page.setViewportSize(viewport); await f.fill();
    const eye = page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }); const box = await eye.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator('.anhuu-loading')).toHaveCount(0);
    await page.screenshot({ path: `../artifacts/ui-audit-2026-10-08/login-fixed-${viewport.width}x${viewport.height}.png` });
    await f.submit(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Số thứ 1', { exact: true })).toBeFocused();
    await page.keyboard.type('000000'); await page.locator('.otp-submit-btn').scrollIntoViewIfNeeded();
    await expect(page.locator('.otp-submit-btn')).toBeInViewport();
    await page.screenshot({ path: `../artifacts/ui-audit-2026-10-08/login-otp-fixed-${viewport.width}x${viewport.height}.png` });
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đăng nhập vào tài khoản', exact: true })).toBeFocused();
  });
}
