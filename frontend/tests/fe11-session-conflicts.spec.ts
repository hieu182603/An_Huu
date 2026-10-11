import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

const hash = "a".repeat(64);
const preview = { status: "READY", inputHash: hash, issues: [], candidate: { calculation: { summary: { atRetirement: { projectedFund: "1500000000", coveragePercent: "80" } } } }, loanRevisionOptions: [],
  assetRevisionOptions: [], plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] }, saved: false, applied: false };
async function openSources(page: Page, note: string) {
  await page.goto("/user/simulation?tab=actuals");
  await page.getByRole("button", { name: /Lệnh nguồn \(V4\)/ }).click();
  await page.getByPlaceholder("VD: 10000000", { exact: true }).fill("10000000");
  await page.getByPlaceholder("VD: Hợp đồng lao động hoặc phụ lục nguồn thu").fill(note);
  await page.getByRole("button", { name: "Thêm lệnh", exact: true }).click();
  await page.getByRole("button", { name: "Xem trước nguồn V4", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lưu phiên bản V4", exact: true })).toBeVisible();
}

test("two tabs sharing a simulated server revision: one save wins and the other keeps its draft on 409", async ({ page, context }) => {
  const second = await context.newPage();
  let revision = 1;
  let savedCount = 0;
  let conflicts = 0;
  for (const tab of [page, second]) {
    await installRouteAuth(tab);
    await installFinancialProfileRoutes(tab);
    await tab.route("**/source-reforecasts/preview", route => route.fulfill({ json: { data: preview } }));
    await tab.route("**/source-reforecasts", route => {
      const input = route.request().postDataJSON();
      if (input.preview.expectedRevision !== revision) {
        ++conflicts;
        return route.fulfill({ status: 409, json: { error: { code: "PLAN_REVISION_CONFLICT", message: "Kế hoạch đã được cập nhật ở tab khác." } } });
      }
      ++revision; ++savedCount;
      return route.fulfill({ json: { data: { planId: "plan-mock-1", revision, currentVersionId: "ver-mock-1", baselineVersionId: "ver-mock-1",
        saved: { id: "ver-fe11", version: 2, snapshotHash: hash, createdAt: "2026-10-08T00:00:00.000Z", preview: {} } } } });
    });
  }
  await openSources(page, "Nháp tab một");
  await openSources(second, "Nháp tab hai");
  await Promise.all([page, second].map(tab => tab.getByRole("button", { name: "Lưu phiên bản V4", exact: true }).click()));
  await expect.poll(() => savedCount).toBe(1);
  await expect.poll(() => conflicts).toBe(1);
  await expect.poll(async () => (await page.getByRole("button", { name: "Áp dụng bản v2", exact: true }).count())
    + (await second.getByRole("button", { name: "Áp dụng bản v2", exact: true }).count())).toBe(1);
  const loser = await page.getByRole("button", { name: "Áp dụng bản v2", exact: true }).count() ? second : page;
  await expect(loser.getByRole("button", { name: "Lưu phiên bản V4", exact: true })).not.toBeVisible();
  await expect(loser.getByRole("row").filter({ hasText: /Nháp tab/ })).toBeVisible();
  await expect(loser.getByText("Kế hoạch đã được cập nhật ở tab khác.").first()).toBeVisible();
});

test("account switch rejects late BHXH history and clears another account's source draft", async ({ page, context }) => {
  const second = await context.newPage();
  let current = { id: "account-a", fullName: "Tài khoản Một", email: "first@example.test", role: "USER", status: "ACTIVE",
    phone: null, city: null, avatarUrl: null, revision: 0 };
  let releaseHistory!: () => void;
  const heldHistory = new Promise<void>(resolve => { releaseHistory = resolve; });
  let firstHistoryRequested = false;
  const record = (id: string) => {
    const month = id === "account-a" ? "2026-08" : "2026-09";
    return { id: id === "account-a" ? "10000000-0000-4000-8000-000000000001" : "10000000-0000-4000-8000-000000000002",
      userId: id, revision: 1, documentHash: hash, createdAt: "2026-10-01T00:00:00.000Z", document: {
        schemaVersion: 1, birth: { precision: "YEAR", declaredValue: id === "account-a" ? "1965" : "1975" }, legalSex: "FEMALE",
        coverageFrom: month, coverageThrough: month, confirmedThroughMonth: month,
        months: [{ month, scheme: "COMPULSORY", salaryRegime: "EMPLOYER", status: "PAID", contributionBase: "8000000", evidence: [] }], specialPeriods: [],
      } };
  };
  for (const tab of [page, second]) {
    await installRouteAuth(tab);
    await installFinancialProfileRoutes(tab);
    await tab.route("**/api/v1/auth/**", route => {
      if (route.request().url().endsWith("/login")) current = { ...current, id: "account-b", fullName: "Tài khoản Hai", email: "second@example.test" };
      return route.fulfill({ json: { data: { user: current, accessToken: `test-token-${current.id}` } } });
    });
    await tab.route("**/api/v1/me", route => route.fulfill({ json: { data: current } }));
    await tab.route("**/me/pension/estimates", route => route.fulfill({ json: { data: { items: [] } } }));
    await tab.route("**/me/pension/history", async route => {
      const owner = current.id;
      if (owner === "account-a") { firstHistoryRequested = true; await heldHistory; }
      await route.fulfill({ json: { data: record(owner) } });
    });
    await tab.route("**/source-reforecasts/preview", route => route.fulfill({ json: { data: preview } }));
  }
  await openSources(page, "BÍ MẬT NHÁP TÀI KHOẢN MỘT");
  await second.goto("/user/plan");
  await second.getByRole("button", { name: "Thẩm định & Ước tính BHXH", exact: true }).click();
  await expect.poll(() => firstHistoryRequested).toBe(true);
  // A third tab performs the actual sign-in, broadcasting the session change to both open pages.
  const login = await context.newPage();
  await installRouteAuth(login);
  await installFinancialProfileRoutes(login);
  await login.route("**/api/v1/auth/**", route => {
    if (route.request().url().endsWith("/login")) current = { ...current, id: "account-b", fullName: "Tài khoản Hai", email: "second@example.test" };
    return route.fulfill({ json: { data: { user: current, accessToken: `test-token-${current.id}` } } });
  });
  await login.goto("/login");
  await login.getByLabel("Địa chỉ Email").fill("second@example.test");
  await login.locator("#login-password").fill("long-password-123");
  await login.getByRole("button", { name: "Đăng nhập vào tài khoản", exact: true }).click();
  await expect(page.getByRole("button", { name: /Tài khoản: Tài khoản Hai/ })).toBeVisible();
  await page.getByRole("button", { name: /Lệnh nguồn \(V4\)/ }).click();
  await expect(page.getByText("BÍ MẬT NHÁP TÀI KHOẢN MỘT", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu phiên bản V4", exact: true })).not.toBeVisible();
  await expect(second.getByRole("button", { name: /Tài khoản: Tài khoản Hai/ })).toBeVisible();
  await second.getByRole("button", { name: "Thẩm định & Ước tính BHXH", exact: true }).click();
  releaseHistory();
  await second.getByRole("dialog").getByRole("button", { name: /Quá trình đóng BHXH/ }).click();
  await expect(second.getByRole("dialog").getByRole("row").filter({ hasText: "2026-09" })).toBeVisible();
  await expect(second.getByRole("dialog").getByRole("row").filter({ hasText: "2026-08" })).not.toBeVisible();
});
