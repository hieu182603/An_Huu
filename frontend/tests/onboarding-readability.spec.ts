import { test, expect, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

async function setup(page: Page) {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { error: { message: 'Unmocked test API' } } }));
  await installRouteAuth(page);
  const state = await installFinancialProfileRoutes(page, { profile: null, draft: null });
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.goto('/onboarding');
  await expect(page.getByRole('button', { name: '20 triệu', exact: true })).toBeVisible();
  return state;
}

for (const viewport of [{width:1440,height:1000}, {width:768,height:1024}, {width:390,height:844}, {width:390,height:400}]) {
  test(`onboarding readable stages and preserved draft ${viewport.width}x${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport);
    const state = await setup(page);
    await expect(page.locator('.onboarding-stages li')).toHaveCount(3);
    await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Mong muốn');

    const birthInput = page.getByLabel('Tháng/năm sinh (bắt buộc)');
    const retireInput = page.getByLabel('Tháng bạn muốn nghỉ hưu (bắt buộc)');
    await expect(birthInput).toBeVisible();
    await expect(retireInput).toBeVisible();

    await birthInput.fill('1981-05');
    await retireInput.fill('2040-01');
    await page.getByRole('button', { name: '20 triệu', exact: true }).click();

    expect((await birthInput.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(/Tuổi tính từ tháng sinh:/)).toBeVisible();

    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tiền của bạn hôm nay' })).toBeVisible();
    await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Tiền hôm nay');
    await expect.poll(() => state.getDraft()?.birthMonth || state.getDraft()?.data?.personal?.birthMonth?.value).toBe('1981-05');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Quay lại', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
    await expect(birthInput).toHaveValue('1981-05');
    await expect(retireInput).toHaveValue('2040-01');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('onboarding.png'), fullPage: true });
  });
}

test('onboarding failed draft save retains entries and retries without advancing', async ({page}) => {
  await setup(page);
  const birthInput = page.getByLabel('Tháng/năm sinh (bắt buộc)');
  const retireInput = page.getByLabel('Tháng bạn muốn nghỉ hưu (bắt buộc)');
  await birthInput.fill('1981-05');
  await retireInput.fill('2040-01');
  await page.getByRole('button', { name: '20 triệu', exact: true }).click();

  let fail = true;
  await page.route('**/api/v1/me/onboarding-draft', route => {
    if (fail && route.request().method() === 'PUT') {
      return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không lưu được bản nháp kiểm thử' } } });
    }
    return route.fallback();
  });

  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  // Remains on stage 1 due to save failure
  await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Mong muốn');
  await expect(birthInput).toHaveValue('1981-05');

  fail = false;
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Tiền hôm nay');
  await expect(page.getByRole('heading', { name: 'Tiền của bạn hôm nay' })).toBeVisible();
});
