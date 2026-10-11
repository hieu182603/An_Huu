import { expect, test } from '@playwright/test';
import { installRouteAuth } from './helpers';

test.beforeEach(async ({ page }) => {
  await installRouteAuth(page);
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.goto('/user/explore');
});

for (const collapsed of [false, true]) test('glossary sidebar stays anchored while open, collapsed=' + collapsed, async ({ page }) => {
  if (collapsed) await page.getByRole('button', { name: 'Thu gọn thanh menu', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Mở từ điển tra cứu' });
  await trigger.scrollIntoViewIfNeeded();
  const before = await page.locator('.user-sidebar').boundingBox();
  const scroll = await page.evaluate(() => scrollY);
  expect(scroll).toBeGreaterThan(100); expect(before!.y).toBeCloseTo(0, 0);
  await trigger.click();
  const during = await page.locator('.user-sidebar').boundingBox();
  expect(during!.y).toBeCloseTo(before!.y, 0); expect(during!.height).toBeCloseTo(before!.height, 0);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.mouse.move(15, 500); await page.mouse.wheel(0, 650);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scroll);
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  expect((await page.locator('.user-sidebar').boundingBox())!.y).toBeCloseTo(0, 0);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.mouse.wheel(0, -500); await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(scroll);
});

for (const size of [{ width: 1904, height: 893 }, { width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) test('glossary wide layout ' + size.width + 'x' + size.height, async ({ page }) => {
  await page.setViewportSize(size);
  const trigger = page.getByRole('button', { name: 'Mở từ điển tra cứu' }); await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Từ điển thuật ngữ An Hưu' });
  const search = dialog.getByLabel('Tìm thuật ngữ'); await expect(search).toBeFocused();
  const box = (await dialog.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  if (size.width >= 1024) { expect(box.width).toBeGreaterThan(900); expect(box.width).toBeGreaterThan(box.height); }
  const items = dialog.locator('dt'); const first = (await items.nth(0).boundingBox())!, second = (await items.nth(1).boundingBox())!;
  if (size.width >= 1024) { expect(first.y).toBeCloseTo(second.y, 0); expect(second.x).toBeGreaterThan(first.x + 100); } else expect(second.y).toBeGreaterThan(first.y);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dialog.locator('.glossary-results').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(items.last()).toBeInViewport();
  await expect(search).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Đóng modal' })).toBeInViewport();
  await search.fill('lai kep'); await expect(items).toHaveText(['Lãi kép']); await search.fill('xyz-nothing'); await expect(dialog.getByText('Chưa tìm thấy thuật ngữ')).toBeVisible(); await dialog.getByRole('button', { name: 'Xem tất cả thuật ngữ' }).click(); await expect(items).toHaveCount(12);
  await page.screenshot({ path: '../artifacts/ui-audit-2026-10-11/glossary-fixed-' + size.width + 'x' + size.height + '.png' });
  await dialog.getByRole('button', { name: 'Đóng modal' }).click(); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});
