import { expect, test } from "@playwright/test";
import { installRouteAuth } from "./helpers";

const report = (days: number) => ({
  days, from: "2026-09-14T17:35:01.543Z", to: "2026-10-14T17:35:01.543Z",
  kpis: { signups: { current: 55, previous: 20 }, activeUsers: { current: 7, previous: 7 }, aiQuestions: { current: 1, previous: 0 },
    tickets: { current: 4, previous: 8 }, consults: { current: 0, previous: 0 }, published: { current: 2, previous: 1 } },
  series: Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 14 - days + 1 + i)).toISOString().slice(0, 10), signups: i === days - 8 ? 52 : i % 5 === 0 ? 1 : 0, logins: i % 3, aiQuestions: i === days - 1 ? 1 : 0, tickets: i % 7 === 0 ? 1 : 0 })),
  funnel: { registered: 55, verified: 54, withProfile: 54, withPlan: 1, usedAi: 1 },
  support: { byCategory: { TECHNICAL: 2, FINANCIAL: 1, "Tư vấn sản phẩm": 1 }, byStatus: { OPEN: 2, IN_PROGRESS: 1, RESOLVED: 1 } },
  security: { logins: { SUCCESS: 55, FAILED: 28 }, systemLogs: { ERROR: 5, CRITICAL: 88 } },
  adminActions: [{ action: "AUTH_LOGIN", count: 50 }, { action: "KNOWLEDGE_APPROVED", count: 30 }, { action: "AI_PRIVACY_UPDATED", count: 8 }],
});

test("reports switch period and metric, and export CSV", async ({ page }) => {
  await installRouteAuth(page, "ADM-001");
  const asked: string[] = [];
  await page.route("**/api/v1/admin/reports?**", (r) => { const d = Number(new URL(r.request().url()).searchParams.get("days")); asked.push(String(d)); return r.fulfill({ json: { data: report(d) } }); });
  await page.route("**/api/v1/admin/support?**", (r) => r.fulfill({ json: { data: { items: [], total: 0 } } }));
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Báo cáo vận hành" })).toBeVisible();
  await expect(page.locator(".rp-kpi").first()).toContainText("55");
  await expect(page.locator(".rp-kpi").first()).toContainText("+175% so với kỳ trước (20)");
  await expect(page.getByText("28 lần đăng nhập thất bại/bị khóa và 93 log lỗi hệ thống")).toBeVisible();
  await expect(page.locator(".rp-bars .ov-bar-col")).toHaveCount(30);
  await page.screenshot({ path: "tests/tmp-shots/reports-1440.png", fullPage: true });

  await page.getByRole("group", { name: "Kỳ báo cáo" }).getByRole("button", { name: "7 ngày" }).click();
  await expect(page.locator(".rp-bars .ov-bar-col")).toHaveCount(7);
  expect(asked).toEqual(["30", "7"]);
  await page.getByRole("group", { name: "Chỉ số biểu đồ" }).getByRole("button", { name: "Ticket hỗ trợ" }).click();
  await expect(page.getByRole("button", { name: "Ticket hỗ trợ" })).toHaveAttribute("aria-pressed", "true");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Xuất CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("bao-cao-an-huu-7-ngay.csv");

  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: "tests/tmp-shots/reports-390.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
