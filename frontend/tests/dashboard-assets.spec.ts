import { test, expect } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

test('asset overview presents total once and groups by size with readable percentages', async ({ page }) => {
  await installRouteAuth(page);
  const profile = defaultMockProfile();
  profile.data.assets = { cashSavings: '2000000000', realEstateValue: '3000000000', stockFundValue: '0', liquidAssets: '0' };
  await installFinancialProfileRoutes(page, { profile });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/user/dashboard');
  const card = page.getByRole('region', { name: 'Tài sản của bạn' });
  await expect(card).toBeVisible();
  await expect(card.locator('.asset-overview-total strong')).toHaveText('5.000.000.000 VND');
  await expect(card.getByText('Chưa trừ các khoản nợ của bạn')).toBeVisible();
  const groups = card.getByRole('listitem');
  await expect(groups).toHaveCount(4);
  await expect(groups.nth(0)).toContainText('Bất động sản');
  await expect(groups.nth(0)).toContainText('3.000.000.000 VND');
  await expect(groups.nth(0)).toContainText('60%');
  await expect(groups.nth(1)).toContainText('40%');
  await expect(card.locator('.asset-breakdown-share')).toHaveCount(2);
  await expect(card.locator('svg.recharts-surface')).toHaveCount(0);
  await card.screenshot({ path: '../artifacts/dashboard-assets-desktop.png' });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await card.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await card.screenshot({ path: `../artifacts/dashboard-assets-${width}.png` });
  }
});

test('zero assets and missing asset values do not invent an allocation', async ({ page }) => {
  await installRouteAuth(page);
  const profile = defaultMockProfile();
  profile.data.assets = { cashSavings: '0', realEstateValue: '0', stockFundValue: '0', liquidAssets: '0' };
  const state = await installFinancialProfileRoutes(page, { profile });
  await page.goto('/user/dashboard');
  const card = page.getByRole('region', { name: 'Tài sản của bạn' });
  await expect(card.locator('.asset-overview-total strong')).toHaveText('0 VND');
  await expect(card).toContainText('Hồ sơ hiện ghi nhận bạn chưa có tài sản.');
  await expect(card.getByRole('list')).toHaveCount(0);
  state.setProfile({ schemaVersion: 2, revision: 2, data: {
    schemaVersion: 2, valuationDate: '2026-10-13', currency: 'VND', periodUnit: 'MONTH',
    personal: { birthMonth: { status: 'KNOWN', value: '1976-01' }, desiredRetirementMonth: { status: 'KNOWN', value: '2036-01' }, pensionStartMonth: { status: 'UNKNOWN' } },
    income: { status: 'UNKNOWN' }, expenses: { status: 'UNKNOWN' }, assets: { status: 'UNKNOWN' }, debts: { status: 'UNKNOWN' },
  } });
  await page.reload();
  await expect(card.locator('.asset-overview-total')).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Bổ sung thông tin tài sản' })).toHaveAttribute('href', '/user/account');
  await expect(card.getByRole('list')).toHaveCount(0);
});
