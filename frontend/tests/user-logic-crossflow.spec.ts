import { test, expect } from "@playwright/test";
import { discoveryApi } from "./discovery-helpers";
import { setupRemaining } from "./remaining-helpers";
import { formatMoneyDecimal } from "../src/utils/moneyDisplay";

test.afterEach(async ({ page }) => { await page.waitForLoadState("networkidle"); });

test("allocation reuses the saved goal and survey without a plan or browser draft", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  const record = await s.get("me/financial-profile");
  const response = await request.patch(`${discoveryApi}/api/v1/me/financial-profile`, {
    headers: { Authorization: `Bearer ${s.fixture.accessToken}` },
    data: { expectedRevision: record.revision, changes: { schemaVersion: 2,
      retirementSurvey: { policyVersionId: s.fixture.policyId, answers: s.fixture.planInput.answers, monthlyExpenseToday: "0" } } },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await page.getByRole("link", { name: "Phân bổ tài sản", exact: true }).click();
  await page.locator(".allocation-steps button").nth(1).click();
  await expect(page.locator(".allocation-protection").first()).toContainText("10.000.000");
  await page.locator(".allocation-steps button").nth(2).click();
  await page.getByText("Chỉnh giả định nâng cao", { exact: true }).click();
  await expect(page.getByLabel("Tháng kết thúc kế hoạch", { exact: true })).toHaveValue("12/2028");
  expect(s.writes.some(w => /\/apply$|\/versions$|\/plans$/.test(w.path))).toBe(false);
  expect(s.errors).toEqual([]);
});

test("allocation uses a newer saved goal instead of an older applied snapshot", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan");
  const record = await s.get("me/financial-profile");
  const response = await request.patch(`${discoveryApi}/api/v1/me/financial-profile/retirement-goal`, {
    headers: { Authorization: `Bearer ${s.fixture.accessToken}` },
    data: { expectedRevision: record.revision, birthMonth: "1990-04", retirementMonth: "2027-01",
      goal: { endMonth: "2027-12", monthlyExpenseToday: "0", lifestylePriority: null } },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await page.getByRole("link", { name: "Phân bổ tài sản", exact: true }).click();
  await page.locator(".allocation-steps button").nth(1).click();
  await expect(page.locator(".allocation-protection").first()).toContainText("0 ₫ / tháng");
  await page.locator(".allocation-steps button").nth(2).click();
  await page.getByText("Chỉnh giả định nâng cao", { exact: true }).click();
  await expect(page.getByLabel("Tháng kết thúc kế hoạch", { exact: true })).toHaveValue("12/2027");
  expect((await s.get(`me/retirement/plans/${s.fixture.planId}`)).currentVersionId).toBe(s.fixture.versionId);
  expect(s.errors).toEqual([]);
});

test("allocation shows zero spending from the initial survey when no goal or plan exists", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  const record = await s.get("me/financial-profile");
  const { retirementGoal, ...data } = record.data;
  await page.route("**/api/v1/me/financial-profile", route => route.fulfill({ json: { data: { ...record, data: { ...data,
    retirementSurvey: { policyVersionId: s.fixture.policyId, answers: s.fixture.planInput.answers, monthlyExpenseToday: "0" } } } } }));
  await page.reload();
  await page.getByRole("link", { name: "Phân bổ tài sản", exact: true }).click();
  await page.locator(".allocation-steps button").nth(1).click();
  await expect(page.locator(".allocation-protection").first()).toContainText("0 ₫ / tháng");
  await expect(page.locator(".allocation-survey-status").first()).toContainText("Đang sử dụng kết quả khảo sát rủi ro ban đầu.");
  expect(s.errors).toEqual([]);
});

test("overview never offers an old unsaved preview after the contribution draft changes", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  await page.evaluate(input => sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify(input)), s.fixture.planInput);
  await page.reload();
  await expect(page.locator("#plan-overview")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.route("**/api/v1/me/retirement/preview**", route => route.fulfill({ status: 503, json: { error: { message: "Calculation unavailable" } } }));
  await page.locator(".plan-hero-actions").getByRole("button", { name: "Chọn mức góp", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Góp vào quỹ nghỉ hưu mỗi tháng", { exact: true }).fill("2.000.000");
  // Navigate in the same SPA turn as the draft update: the old result may still be READY.
  await page.evaluate(() => {
    document.querySelector<HTMLFormElement>('[role="dialog"] form')!.requestSubmit();
    document.querySelector<HTMLAnchorElement>('a[href="/user/dashboard"]')!.click();
  });
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("Chưa xác định");
  await expect(page.getByRole("button", { name: "Lưu làm kế hoạch chính", exact: true })).toHaveCount(0);
  expect(s.writes.some(w => w.path.endsWith("/apply"))).toBe(false);
  expect(s.errors).toEqual([]);
});

test("changing a reserve on Finances invalidates an unsaved overview until recalculation", async ({ page, request }) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  await page.evaluate(input => sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify(input)), s.fixture.planInput);
  await page.reload();
  await expect(page.locator("#plan-overview")).toBeVisible();
  await page.getByRole("link", { name: "Tài chính của bạn", exact: true }).click();
  await page.getByRole("link", { name: "Xem & cập nhật thu chi", exact: false }).click();
  await page.getByRole("button", { name: "Điều chỉnh tiền dành cho việc khác", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Số tiền mỗi tháng (VND)", { exact: true }).fill("2.000.000");
  await page.getByRole("dialog").getByRole("button", { name: "Cập nhật bản nháp", exact: true }).click();
  await page.getByRole("link", { name: "Tổng quan", exact: true }).click();
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("Chưa xác định");
  await expect(page.locator(".dashboard-metric.is-capacity > strong")).toHaveText("Chưa xác định");
  await expect(page.getByRole("button", { name: "Lưu làm kế hoạch chính", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Kế hoạch nghỉ hưu", exact: true }).click();
  await expect(page.locator("#plan-overview")).toBeVisible();
  expect(s.writes.some(w => w.path.endsWith("/preview") && w.body.monthlyReserve === "2000000")).toBe(true);
  expect(s.writes.some(w => w.path.endsWith("/apply"))).toBe(false);
  expect(s.errors).toEqual([]);
});

for (const en of [false, true]) test(`overview save confirmation preserves exact money and locale: ${en ? "en" : "vi"}`, async ({ page, request }, info) => {
  const s = await setupRemaining(page, request, "/user/plan", { savedPlan: false });
  const response = await request.post(`${discoveryApi}/api/v1/me/retirement/preview`, {
    headers: { Authorization: `Bearer ${s.fixture.accessToken}` }, data: s.fixture.planInput,
  });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  const input = { ...s.fixture.planInput, monthlyContribution: "1234567.89" };
  const amount = "9007199254740993.25";
  data.selection = input;
  data.calculation.summary.atRetirement.projectedFund = amount;
  await page.route("**/api/v1/me/retirement/preview**", route => route.fulfill({ json: { data } }));
  await page.evaluate(input => {
    sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify(input));
  }, input);
  await page.reload();
  if (en) {
    // Use the public language control rather than depending on a storage key.
    await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click();
    await expect(page.locator("#plan-overview")).toBeVisible();
    await expect(page.getByRole("menu", { name: "Ngôn ngữ", exact: true })).toBeVisible();
    await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  }
  await expect(page.locator("#plan-overview")).toBeVisible();
  await page.getByRole("link", { name: en ? "Overview" : "Tổng quan", exact: true }).click();
  await page.getByRole("button", { name: en ? "Save as main plan" : "Lưu làm kế hoạch chính", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(formatMoneyDecimal(amount, en));
  await expect(dialog).toContainText(formatMoneyDecimal(input.monthlyContribution, en));
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await dialog.locator(".modal-body").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("save-exact-money.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  expect(s.writes.some(w => w.path.endsWith("/apply"))).toBe(false);
});
