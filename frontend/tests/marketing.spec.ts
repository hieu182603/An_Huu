import { expect, test } from '@playwright/test';

const routes = [
  ['Trang chủ', '/', 'Lập kế hoạch tài chính hưu trí'],
  ['Cách hoạt động', '/cach-hoat-dong', 'Cách hoạt động'],
  ['Mô phỏng', '/mo-phong', 'Mô phỏng hưu trí'],
  ['Trợ lý AI', '/tro-ly-ai', 'Trợ lý AI An Hưu'],
  ['Kiến thức', '/kien-thuc', 'Kiến thức hưu trí'],
];

test('header opens separate pages, preserves active state and supports back navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  for (const [name, path, title] of routes) {
    const link = nav.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', path);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle(new RegExp(title));
    await expect(page.locator('h1')).toHaveCount(1);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/tro-ly-ai$/);
  expect(errors).toEqual([]);
});

test('dark surfaces keep headings and actions readable', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['.mk-hero h1', '.mk-final h2', '.mk-feature-primary h3']) {
    await expect(page.locator(selector)).toHaveCSS('color', 'rgb(245, 250, 255)');
  }
  await expect(page.locator('.mk-hero h1 span')).toHaveCSS('color', 'rgb(131, 216, 200)');
  await expect(page.locator('.mk-hero .mk-button')).toHaveCSS('color', 'rgb(11, 53, 66)');
});

test('public pages expose their content and metadata without JavaScript', async ({ browser, request, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const paths = [...routes.map(item => item[1]), '/kien-thuc/hieu-ve-lam-phat'];
  const titles = new Set<string>();
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<h1');
    expect(html).toContain('application/ld+json');
    expect(html).not.toContain('content="noindex');
    await page.goto(`${baseURL}${path}`);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S.{30}/);
    titles.add(await page.title());
    expect(await page.locator('h1').count()).toBe(1);
  }
  expect(titles.size).toBe(paths.length);
  await context.close();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`marketing pages fit ${width}px and mobile menu navigates`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [, path] of routes) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
    }
    if (width < 1200) {
      await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
      const dialog = page.getByRole('dialog');
      for (const [name] of routes) await expect(dialog.getByRole('link', { name, exact: true })).toBeVisible();
      await dialog.getByRole('link', { name: 'Mô phỏng', exact: true }).click();
      await expect(page).toHaveURL(/\/mo-phong$/);
      await expect(dialog).toHaveCount(0);
    }
  });
}

test('simulation responds to keyboard input, enforces ages and resets', async ({ page }) => {
  await page.goto('/mo-phong');
  const value = page.getByTestId('projected-fund');
  const initial = await value.textContent();
  const contribution = page.getByRole('slider', { name: 'Tích lũy mỗi tháng' });
  await contribution.focus();
  await page.keyboard.press('ArrowRight');
  await expect(value).not.toHaveText(initial!);
  await page.getByRole('slider', { name: 'Tuổi hiện tại', exact: true }).fill('65');
  await expect(page.getByRole('slider', { name: 'Tuổi nghỉ hưu', exact: true })).toHaveValue('66');
  await page.getByRole('button', { name: 'Đặt lại' }).click();
  await expect(value).toHaveText(initial!);
});

test('sample assistant and knowledge articles work without authentication', async ({ page }) => {
  await page.goto('/tro-ly-ai');
  await page.getByRole('button', { name: 'Kết quả có được đảm bảo không?' }).click();
  await expect(page.locator('.mk-chat-answer')).toContainText('Không. Mô phỏng');
  await page.goto('/kien-thuc');
  await page.locator('.mk-article').nth(1).click();
  await expect(page).toHaveURL(/\/kien-thuc\/hieu-ve-lam-phat$/);
  await expect(page.getByRole('heading', { name: 'Một ví dụ bằng giả định' })).toBeVisible();
});

test('reduced motion and missing WebGL keep the hero usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForTimeout(700);
  await expect(page.locator('.mk-three-scene canvas')).toHaveCount(0);
  await expect(page.locator('.mk-hero h1')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('.mk-three-scene canvas')).toHaveCount(0);
  await expect(page.locator('.mk-hero .mk-button')).toBeVisible();
});

test('leaving public pages clears their metadata and old anchors still work', async ({ page }) => {
  await page.goto('/#mo-phong');
  await expect(page).toHaveURL(/\/mo-phong$/);
  await page.getByRole('link', { name: 'Lập kế hoạch của riêng bạn', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await expect(page.locator('#marketing-schema')).toHaveCount(0);
});
