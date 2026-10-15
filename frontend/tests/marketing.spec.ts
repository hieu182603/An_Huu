import { expect, test } from '@playwright/test';

const routes = [
  ['Trang chủ', '/', 'Lập kế hoạch tài chính hưu trí'],
  ['Cách hoạt động', '/cach-hoat-dong', 'Cách hoạt động'],
  ['Mô phỏng', '/mo-phong', 'Mô phỏng hưu trí'],
  ['Trợ lý AI', '/tro-ly-ai', 'Trợ lý AI An Hưu'],
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
  await expect(page).toHaveURL(/\/mo-phong$/);
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
  // Only the remaining marketing routes are prerendered.
  const paths = routes.map(item => item[1]);
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
  await page.getByRole('button', { name: 'Sửa thông tin', exact: true }).click();
  await expect(page.getByLabel('Nhập giá trị cho Tuổi hiện tại', { exact: true })).toBeFocused();
  await page.getByRole('slider', { name: 'Tuổi hiện tại', exact: true }).fill('65');
  await expect(page.getByRole('slider', { name: 'Tuổi nghỉ hưu', exact: true })).toHaveValue('65');
  await page.getByRole('button', { name: 'Đặt lại' }).click();
  await expect(value).toHaveText(initial!);
});

test('sample assistant works without authentication', async ({ page }) => {
  await page.goto('/tro-ly-ai');
  await page.getByRole('tab', { name: 'Nghỉ hưu sớm 50t' }).click();
  await expect(page.locator('.mk-chat-answer')).toContainText('bớt 10 năm tích lũy');
});

test('removed knowledge routes return home without loading the content API', async ({ page }) => {
  const contentRequests: string[] = [];
  page.on('request', request => { if (/\/content(?:[/?]|$)/.test(request.url())) contentRequests.push(request.url()); });
  for (const path of ['/', '/kien-thuc', '/kien-thuc/hieu-ve-lam-phat', '/#kien-thuc']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.mk-hero h1')).toBeVisible();
    await expect(page.locator('a[href*="kien-thuc"], #kien-thuc')).toHaveCount(0);
  }
  expect(contentRequests).toEqual([]);
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

test('demo handles partial scenario URLs, zero rates and invalid numeric entries', async ({ page }) => {
  await page.goto('/mo-phong?annualReturnRate=0&cashSavings=0&monthlyExpenseToday=1000000');
  await expect(page.getByLabel('Nhập giá trị cho Lợi suất giả định mỗi năm')).toHaveValue('0');
  const contribution = page.getByLabel('Nhập giá trị cho Tích lũy mỗi tháng');
  await contribution.fill('0');
  await contribution.press('Enter');
  await expect(page.getByTestId('projected-fund')).toHaveText('0 VND');
  await page.getByRole('button', { name: 'Thử khoản góp này', exact: true }).click();
  await expect(page.getByTestId('readiness')).toHaveText('100%');
  await expect(page.getByTestId('next-action')).toContainText('đáp ứng mục tiêu');
  await page.getByRole('button', { name: 'Sửa thông tin', exact: true }).click();
  const age = page.getByLabel('Nhập giá trị cho Tuổi hiện tại', { exact: true });
  await age.fill('999');
  await age.press('Enter');
  await expect(age).toHaveValue('74');
  await expect(page.getByTestId('next-action')).toContainText('nghỉ hưu ngay');
  await contribution.fill('-100');
  await contribution.press('Enter');
  await expect(contribution).toHaveValue('0');
  await page.goto('/mo-phong?cashSavings=Infinity&lifeExpectancy=-1');
  await expect(page.getByTestId('projected-fund')).not.toContainText(/NaN|Infinity/);
  await expect(page.getByLabel('Nhập giá trị cho Dự trù chi tiêu đến tuổi')).toHaveValue('61');
});

test('demo compares scenarios, applies a valid allocation and resets all changes', async ({ page }) => {
  await page.goto('/mo-phong');
  const initial = await page.getByTestId('projected-fund').textContent();
  await page.getByRole('button', { name: 'Thử: Nghỉ muộn hơn 5 năm', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Tuổi nghỉ hưu', exact: true })).toHaveValue('65');
  await expect(page.getByTestId('projected-fund')).not.toHaveText(initial!);
  await page.locator('#phan-bo summary').filter({ hasText: 'Tiết kiệm' }).click();
  const apply = page.getByRole('button', { name: 'Áp dụng lợi suất vào demo' });
  await page.getByRole('slider', { name: 'Tỷ trọng Tiết kiệm', exact: true }).fill('20');
  await expect(apply).toBeDisabled();
  await expect(page.getByLabel('Nhập giá trị cho Lợi suất giả định mỗi năm')).toHaveValue('6');
  await page.getByRole('slider', { name: 'Tỷ trọng Tiết kiệm', exact: true }).fill('30');
  await apply.click();
  await expect(page.getByLabel('Nhập giá trị cho Lợi suất giả định mỗi năm')).toHaveValue('5.4');
  await expect(page.getByText('Đã áp dụng 5,4%/năm vào kết quả phía trên.')).toBeVisible();
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click();
  await expect(page.getByTestId('projected-fund')).toHaveText(initial!);
  await expect(page.getByText('Đã áp dụng 5,4%/năm vào kết quả phía trên.')).toHaveCount(0);
});

test('homepage opens the allocation demo and expanded controls fit mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Khám phá phân bổ tài sản', exact: true }).click();
  await expect(page).toHaveURL(/\/mo-phong#phan-bo$/);
  await expect(page.locator('#allocation-title')).toBeInViewport();
  for (const details of await page.locator('#phan-bo details').all()) await details.locator('summary').click();
  await expect(page.getByRole('slider', { name: 'Tỷ trọng Tiết kiệm', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px`).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/marketing/demo-allocation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/marketing/demo-allocation-mobile.png', fullPage: true });
});

test('redesigned journey leads to the demo and its section links work', async ({ page }) => {
  await page.goto('/cach-hoat-dong');
  await expect(page.locator('.mk-how-timeline li')).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/marketing/how-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/marketing/how-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Thử kế hoạch của tôi', exact: true }).click();
  await expect(page.getByTestId('projected-fund')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Các phần mô phỏng' });
  await nav.getByRole('link', { name: /Thử kịch bản/ }).click();
  await expect(page.locator('#scenario-title')).toBeInViewport();
  await nav.getByRole('link', { name: /Phân bổ tài sản/ }).click();
  await expect(page.locator('#allocation-title')).toBeInViewport();
  await nav.getByRole('link', { name: /Kế hoạch của bạn/ }).click();
  await expect(page.locator('.mk-chart-heading')).toBeInViewport();
  await page.locator('.mk-sim-scope-title').click();
  await expect(page.getByText('Chưa bao gồm trong demo', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0, 0); (document.activeElement as HTMLElement)?.blur(); });
  await page.screenshot({ path: 'artifacts/marketing/simulation-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'artifacts/marketing/simulation-desktop.png', fullPage: true });
  await page.screenshot({ path: 'artifacts/marketing/simulation-desktop-top.png' });
});
