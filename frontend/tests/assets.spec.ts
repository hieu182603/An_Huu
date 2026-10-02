import { expect, test } from '@playwright/test';
import { installRouteAuth } from './helpers';

test.beforeEach(async ({ page }) => installRouteAuth(page));

test('landing photos and logos decode from fingerprinted build assets', async ({ page }) => {
  const failedImages: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'image') failedImages.push(request.url());
  });
  await page.goto('/');
  const images = page.locator('img');
  await expect(images).toHaveCount(7);
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('src', /^\/assets\/.+-[\w-]+\.(jpg|png|webp)$/);
    await expect.poll(() => img.evaluate((element: HTMLImageElement) =>
      element.complete && element.naturalWidth > 0,
    )).toBe(true);
  }
  expect(failedImages).toEqual([]);
});

test('explore uses the bundled fallback when the external photo fails', async ({ page }) => {
  await page.route('https://images.unsplash.com/**', (route) => route.abort());
  await page.goto('/user/explore');
  const photo = page.locator('.featured-photo img');
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute('src', /\/assets\/peaceful-retirement-[\w-]+\.jpg$/);
  await expect.poll(() => photo.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth > 0,
  )).toBe(true);
});
