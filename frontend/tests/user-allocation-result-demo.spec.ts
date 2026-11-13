import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { setupDiscovery } from "./discovery-helpers";

async function result(page: Page, request: APIRequestContext, multiple = false) {
  const state = await setupDiscovery(page, request, "/user/risk-portfolio", { allocation: true, multiple }, true);
  await page.locator(".allocation-steps button").nth(1).click();
  await page.locator(".allocation-steps button").nth(2).click();
  await page.getByText("Chỉnh giả định nâng cao", { exact: true }).click();
  await page.getByLabel("Tháng kết thúc kế hoạch", { exact: true }).fill("12/2027");
  await page.getByLabel("Thời gian cần giữ thanh khoản", { exact: true }).fill("12");
  const response = page.waitForResponse(r => r.url().endsWith("workspace/preview") && r.request().postDataJSON()?.endMonth === "2027-12");
  await page.getByRole("button", { name: "Xem phương án của tôi →", exact: true }).click();
  const payload = await (await response).json();
  await expect(page.locator(".allocation-results")).toBeVisible();
  await page.locator(".allocation-template-details > summary").click();
  if (!multiple) await expect(page.locator(".allocation-template-details .allocation-reference h2")).toHaveText("Fixture CAUTIOUS");
  return { ...state, data: payload.data ?? payload };
}

test("result displays server amounts and derives the annual equivalent from the returned path", async ({ page, request }) => {
  const state = await result(page, request);
  const base = state.data.portfolio.scenarios.find((s: any) => s.kind === "BASE");
  const rate = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format((Number(base.endingUnitValue) ** (12 / base.rows.length) - 1) * 100);
  await expect(page.locator(".allocation-reference-rate > strong")).toContainText(rate);
  await expect(page.locator(".allocation-reference-rate")).toContainText("chi phí");
  await expect(page.locator(".allocation-result-summary > div")).toHaveCount(3);
  await expect(page.locator(".allocation-result-summary > div").nth(0)).toContainText("96.000.000");
  await expect(page.locator(".allocation-result-summary > div").nth(2)).toContainText("904.000.000");
  await expect(page.locator(".allocation-result-why li")).toHaveCount(3);
  await expect(page.locator(".allocation-result-details")).not.toHaveAttribute("open", "");
  await page.locator(".allocation-result-details > summary").click();
  await expect(page.locator(".pf-scen")).toBeVisible();
  await expect(page.locator(".allocation-results")).not.toContainText("120 đường mô phỏng");
  await expect(page.locator(".allocation-results input[type=range]")).toHaveCount(0);
  expect(state.errors).toEqual([]);
  expect(state.writes.every(w => w.path.endsWith("/preview"))).toBe(true);
});

test("product dialog reflects the selected allocation, closes with focus restored and opens real catalog routes", async ({ page, request }) => {
  const state = await result(page, request, true);
  await page.getByRole("button", { name: "Fixture GROWTH", exact: true }).click();
  await expect(page.locator(".allocation-template-details .allocation-reference h2")).toHaveText("Fixture GROWTH");
  const trigger = page.locator(".allocation-template-details").getByRole("button", { name: "Gợi ý gói đầu tư phù hợp", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("271.200.000");
  await expect(dialog).toContainText("30%");
  await expect(dialog.getByRole("link", { name: "Khám phá sản phẩm", exact: true })).toHaveAttribute("href", "/user/explore");
  await expect(dialog.getByRole("link", { name: "Sản phẩm theo kế hoạch →", exact: true })).toHaveAttribute("href", "/user/explore?tab=matched");
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(state.writes.every(w => w.path.endsWith("/preview"))).toBe(true);
  expect(state.errors).toEqual([]);
});

for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740], ["landscape", 844, 390]] as const) {
  test(`demo result hierarchy and product dialog fit ${name}`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height });
    const state = await result(page, request);
    const reference = await page.locator(".allocation-template-details .allocation-reference").boundingBox();
    const alternatives = await page.locator(".allocation-alternatives").boundingBox();
    expect(reference && alternatives).toBeTruthy();
    if (width > 800) {
      expect(alternatives!.x).toBeGreaterThan(reference!.x + reference!.width);
      expect(Math.abs(alternatives!.y - reference!.y)).toBeLessThan(2);
      await expect(page.locator(".allocation-alternatives")).toHaveAttribute("open", "");
    } else {
      expect(alternatives!.y).toBeGreaterThan(reference!.y + reference!.height);
      await expect(page.locator(".allocation-alternatives")).not.toHaveAttribute("open", "");
      await page.locator(".allocation-alternatives > summary").click();
      await expect(page.getByRole("button", { name: "Đề xuất tái cân bằng", exact: true })).toBeVisible();
      await page.locator(".allocation-alternatives > summary").click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath("result.png"), fullPage: true });
    await page.locator(".allocation-template-details").getByRole("button", { name: "Gợi ý gói đầu tư phù hợp", exact: true }).click();
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
