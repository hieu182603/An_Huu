import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page) {
  const calls: { path: string; body: any }[] = [];
  let resendFails = false;
  let registerFails = false;
  let verifyDelay = 0;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, body: route.request().postDataJSON() });
    if (path.endsWith('/refresh')) return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Yêu cầu đăng nhập.' } } });
    if ((path.endsWith('/resend-verification') && resendFails) || (path.endsWith('/register') && registerFails)) {
      return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Tạm không gửi được yêu cầu.' } } });
    }
    if (path.endsWith('/verify-email')) {
      if (verifyDelay) await new Promise(resolve => setTimeout(resolve, verifyDelay));
      return route.fulfill({ status: 400, json: { error: { code: 'INVALID_TOKEN', message: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' } } });
    }
    return route.fulfill({ status: 202, json: { data: { status: 'ACCEPTED' } } });
  });
  const submit = () => page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  const fill = async () => {
    await page.goto('/register');
    await page.locator('#register-name').fill('Nguyễn Minh An');
    await page.locator('#register-email').fill('audit@example.test');
    await page.locator('#register-password').fill('valid-password-123');
    await page.getByLabel(/Tôi đồng ý/).check();
  };
  const open = async () => { await fill(); await submit(); await expect(page.getByRole('dialog')).toBeVisible(); };
  const digits = () => page.locator('.otp-digit-slot').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  const count = (suffix: string) => calls.filter(call => call.path.endsWith(suffix)).length;
  return { calls, fill, open, submit, digits, count, failResend: (value: boolean) => { resendFails = value; }, failRegister: (value: boolean) => { registerFails = value; }, delayVerify: (ms: number) => { verifyDelay = ms; } };
}

test('register: OTP preserves positions, leading zero, paste and keyboard focus', async ({ page }) => {
  const f = await fixture(page); await f.open();
  const first = page.getByLabel('Số thứ 1', { exact: true });
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(page.locator('#register-otp-input')).toHaveCount(0);
  await page.keyboard.type('123456');
  await page.getByLabel('Số thứ 3', { exact: true }).fill('');
  expect(await f.digits()).toEqual(['1', '2', '', '4', '5', '6']);
  await expect(page.locator('.otp-submit-btn')).toBeDisabled();
  await page.getByLabel('Số thứ 3', { exact: true }).fill('9');
  expect(await f.digits()).toEqual(['1', '2', '9', '4', '5', '6']);
  await page.locator('.otp-submit-btn').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  expect(f.calls.find(c => c.path.endsWith('/verify-email'))?.body.otp).toBe('129456');
  await first.evaluate(input => { const data = new DataTransfer(); data.setData('text', '012 345'); input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  expect(await f.digits()).toEqual(['0', '1', '2', '3', '4', '5']);
  await page.getByLabel('Số thứ 3', { exact: true }).fill('');
  await page.getByLabel('Số thứ 3', { exact: true }).press('Backspace');
  await expect(page.getByLabel('Số thứ 2', { exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(first).toBeFocused();
  for (let i = 0; i < 12; i++) { await page.keyboard.press(i < 6 ? 'Tab' : 'Shift+Tab'); expect(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true); }
  expect(await page.locator('#root').evaluate(el => el.inert)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#register-email')).toBeFocused();
  expect(await page.locator('#root').evaluate(el => el.inert)).toBe(false);
});

test('register: reopen keeps cooldown, accepted is conditional, resend errors recover', async ({ page }) => {
  await page.clock.install(); const f = await fixture(page); await f.open();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Nếu đủ điều kiện');
  await expect(page.getByRole('button', { name: 'Gửi lại sau 60 giây' })).toBeDisabled();
  await page.clock.fastForward(20_000); await page.keyboard.press('Escape'); await f.submit();
  expect(f.count('/register')).toBe(1);
  await expect(page.getByRole('button', { name: 'Gửi lại sau 40 giây' })).toBeDisabled();
  await page.clock.fastForward(41_000); f.failResend(true);
  await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Tạm không gửi');
  await expect(page.getByRole('button', { name: 'Gửi lại mã', exact: true })).toBeEnabled();
  f.failResend(false); await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Gửi lại sau 60 giây' })).toBeDisabled();
  await page.clock.fastForward(10_000); await page.keyboard.press('Escape'); await f.submit();
  await expect(page.getByRole('button', { name: 'Gửi lại sau 50 giây' })).toBeDisabled();
  await page.clock.fastForward(181_000);
  await page.getByLabel('Số thứ 1', { exact: true }).fill('123456');
  // Only the backend knows whether ACCEPTED actually issued a code.
  await page.locator('.otp-submit-btn').click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('hết hạn');
  expect(f.count('/verify-email')).toBe(1);
  await page.keyboard.press('Escape'); await f.submit();
  await expect(page.getByRole('button', { name: 'Gửi lại mã', exact: true })).toBeEnabled();
  expect(f.count('/register')).toBe(1);
});

test('register: changing emails keeps each request time and reload makes no delivery promise', async ({ page }) => {
  await page.clock.install(); const f = await fixture(page); await f.open();
  await page.clock.fastForward(20_000); await page.keyboard.press('Escape');
  await page.locator('#register-email').fill('other@example.test'); await f.submit();
  await expect(page.getByTestId('otp-email')).toHaveText('other@example.test');
  await page.keyboard.press('Escape'); await page.locator('#register-email').fill('AUDIT@example.test'); await f.submit();
  await expect(page.getByRole('button', { name: 'Gửi lại sau 40 giây' })).toBeDisabled();
  expect(f.count('/register')).toBe(2);
  await page.reload(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#register-password')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('valid-password-123');
  await f.open(); await expect(page.getByRole('dialog').getByRole('status')).toContainText('Nếu đủ điều kiện');
});

test('register: field errors clear independently and password byte boundaries are explicit', async ({ page }) => {
  const f = await fixture(page); await f.fill();
  await page.locator('#register-phone').fill('123'); await page.getByLabel(/Tôi đồng ý/).uncheck(); await f.submit();
  await expect(page.locator('#register-phone')).toBeFocused();
  await expect(page.locator('#register-phone')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#register-phone').fill('+84 912 345 678');
  await expect(page.locator('#register-phone-error')).toHaveCount(0);
  await expect(page.locator('#register-agree-error')).toBeVisible();
  await page.getByLabel(/Tôi đồng ý/).check(); await expect(page.locator('#register-agree-error')).toHaveCount(0);
  for (const value of ['a'.repeat(11), 'a'.repeat(73), 'ấ'.repeat(25)]) {
    await page.locator('#register-password').fill(value); await f.submit();
    await expect(page.locator('#register-password-error')).toBeVisible();
    await expect(page.locator('#register-password')).toBeFocused();
  }
  expect(f.count('/register')).toBe(0);
  for (const value of ['a'.repeat(12), 'a'.repeat(72), 'ấ'.repeat(24)]) {
    await page.locator('#register-password').fill(value);
    await expect(page.locator('#register-password-hint')).toHaveText('Đủ độ dài cho phép');
  }
  await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click();
  await expect(page.locator('#register-password')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ẩn mật khẩu', exact: true }).click();
  const password = '  valid-password-123  '; await page.locator('#register-password').fill(password);
  await f.submit(); await expect(page.getByRole('dialog')).toBeVisible();
  expect(f.calls.find(c => c.path.endsWith('/register'))?.body).toMatchObject({ phone: '+84912345678', password });
});

test('register: failed request can retry and pending verification cannot double submit or dismiss', async ({ page }) => {
  const f = await fixture(page); await f.fill(); f.failRegister(true); await f.submit();
  await expect(page.locator('.auth-error-banner')).toContainText('Tạm không gửi');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  f.failRegister(false); await f.submit(); await expect(page.getByRole('dialog')).toBeVisible();
  expect(f.count('/register')).toBe(2);
  f.delayVerify(800); await page.keyboard.type('123456'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); expect(f.count('/verify-email')).toBe(1);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click(); await expect(page.locator('#register-email')).toBeFocused();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }, { width: 390, height: 400 }]) {
  test(`register: popup controls remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const f = await fixture(page); await f.open();
    await expect(page.locator('.ah-notification-body')).toHaveCount(0);
    const close = page.getByRole('button', { name: 'Đóng', exact: true });
    const box = await close.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await close.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `../artifacts/ui-audit-2026-10-08/fixed-otp-${viewport.width}x${viewport.height}.png` });
    await page.keyboard.type('123456');
    await page.locator('.otp-submit-btn').scrollIntoViewIfNeeded();
    await expect(page.locator('.otp-submit-btn')).toBeInViewport();
    await page.locator('.otp-submit-btn').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('hết hạn');
    if (viewport.height === 400) await page.screenshot({ path: '../artifacts/ui-audit-2026-10-08/fixed-otp-short-scrolled.png' });
    await close.scrollIntoViewIfNeeded();
    await close.click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    const eye = await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).boundingBox();
    expect(eye!.width).toBeGreaterThanOrEqual(44); expect(eye!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `../artifacts/ui-audit-2026-10-08/fixed-register-${viewport.width}x${viewport.height}.png` });
  });
}
