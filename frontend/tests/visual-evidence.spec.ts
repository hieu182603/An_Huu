import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installRouteAuth } from "./helpers";

test("capture key responsive screens for review", async ({ page }) => {
  await installRouteAuth(page);
  await mkdir("artifacts/qa", { recursive: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /An tâm hôm nay/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/landing-desktop-after.png", fullPage: true });

  await page.goto("/user/plan");
  await expect(page.getByRole("heading", { name: /Kế hoạch hưu trí/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/plan-desktop-after.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/user/assistant");
  await expect(page.getByRole("textbox", { name: "Câu hỏi dành cho trợ lý AI" })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/assistant-mobile-after.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/financial-config");
  await expect(page.getByRole("heading", { name: /Cấu hình tham số tài chính/i })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/admin-config-after.png", fullPage: true });
});
