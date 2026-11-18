import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { setupDiscovery } from "./discovery-helpers";

async function result(page: Page, request: APIRequestContext, multiple = false) {
  // Read-only previews are cached per input and the saved draft already carries these inputs, so listen from page load.
  let payload: any = null;
  page.on("response", async r => { const body = r.request().postDataJSON?.(); if (r.url().endsWith("workspace/preview") && r.ok() && body?.endMonth === "2027-12" && body?.liquidityNeedMonths === 12) payload = await r.json().catch(() => payload); });
  const state = await setupDiscovery(page, request, "/user/risk-portfolio", { allocation: true, multiple }, true);
  await page.locator(".allocation-steps button").nth(1).click();
  await page.locator(".allocation-steps button").nth(2).click();
  await page.getByText("Giả định đang dùng", { exact: true }).click();
  await page.getByLabel("Tháng kết thúc kế hoạch", { exact: true }).fill("12/2027");
  await page.getByLabel("Thời gian cần giữ thanh khoản", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Xem phương án của tôi →", exact: true }).click();
  await expect.poll(() => payload).toBeTruthy();
  await expect(page.locator(".allocation-results")).toBeVisible();
  await expect(page.locator(".allocation-experiment .allocation-reference")).toBeVisible();
  return { ...state, data: payload.data ?? payload };
}

test("result displays server amounts in the capital summary and the experiment card", async ({ page, request }) => {
  const state = await result(page, request);
  await expect(page.locator(".allocation-experiment .allocation-breakdown")).toBeVisible();
  await expect(page.locator(".allocation-result-summary > div")).toHaveCount(4);
  await expect(page.locator(".allocation-result-summary > div").nth(1)).toContainText("96.000.000");
  await expect(page.locator(".allocation-result-summary > div").nth(3)).toContainText("904.000.000");
  await expect(page.locator(".allocation-result-why li")).toHaveCount(3);
  await expect(page.locator(".allocation-results")).not.toContainText("120 đường mô phỏng");
  await expect(page.locator(".allocation-results input[type=range]")).toHaveCount(0);
  expect(state.errors).toEqual([]);
  expect(state.writes.every(w => w.path.endsWith("/preview"))).toBe(true);
});

test("product dialog reflects the selected allocation, closes with focus restored and opens real catalog routes", async ({ page, request }) => {
  const state = await result(page, request);
  const trigger = page.locator(".allocation-experiment .allocation-reference").getByRole("button", { name: "Gợi ý gói đầu tư phù hợp", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Khám phá sản phẩm", exact: true })).toHaveAttribute("href", "/user/explore");
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(state.writes.every(w => w.path.endsWith("/preview") || w.path.endsWith("/packages"))).toBe(true);
  expect(state.errors).toEqual([]);
});

for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740], ["landscape", 844, 390]] as const) {
  test(`demo result hierarchy and product dialog fit ${name}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height });
    const state = await result(page, request);
    // One main card (experiment); the published-template switcher holds only templates, weights and actions.
    await expect(page.locator(".allocation-results .allocation-reference")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("result.png"), fullPage: true });
    await page.locator(".allocation-experiment .allocation-reference").getByRole("button", { name: "Gợi ý gói đầu tư phù hợp", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; })).toBe(true);
    await page.screenshot({ path: info.outputPath("products.png") });
    await page.keyboard.press("Escape");
    await page.locator(".allocation-policy-comparison > summary").click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(state.errors).toEqual([]);
  });
}
