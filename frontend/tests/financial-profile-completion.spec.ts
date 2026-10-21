import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth } from "./helpers";
import type { ProfileV2 } from "../src/services/financialProfile";

const known = (value: string) => ({ status: "KNOWN" as const, value });
function fixture(): ProfileV2 {
  return {
    schemaVersion: 2, currency: "VND", periodUnit: "MONTH", valuationDate: "2026-10-13",
    personal: { birthMonth: known("1976-03"), desiredRetirementMonth: known("2036-03"), pensionStartMonth: { status: "UNKNOWN" }, gender: "MALE", city: "Hà Nội" },
    income: { status: "KNOWN", entries: [{ id: "income-original", label: "Thu nhập hiện tại", kind: "FIXED", basis: "DISPOSABLE", amount: known("18000000.25"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-10", endMonth: null }] },
    expenses: { status: "KNOWN", entries: [{ id: "expense-original", label: "Sinh hoạt", category: "ESSENTIAL", amount: known("12000000.00"), currency: "VND", frequency: "MONTHLY", startMonth: "2026-10", endMonth: null }] },
    assets: { status: "KNOWN", entries: [{ id: "asset-original", label: "Tiền tiết kiệm", type: "DEPOSIT", value: known("9007199254740993.00"), currency: "VND", valuedOn: known("2026-10-13"), ownershipShare: known("1"), retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0"), liquidity: known("LIQUID"), availableFromMonth: known("2026-10") }] },
    debts: { status: "NOT_APPLICABLE", reason: "Không có khoản vay" },
    pension: { status: "NOT_APPLICABLE", reason: "Không nhận lương hưu" },
  };
}
async function install(page: Page, data: ProfileV2 | null = fixture()) {
  await installRouteAuth(page);
  const state = { data, revision: 3, conflict: false, writes: [] as any[] };
  await page.route("**/api/v1/me/onboarding-draft", route => route.fulfill({ json: { data: null } }));
  await page.route("**/api/v1/me/financial-profile", async route => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      expect(body.expectedRevision).toBe(state.revision);
      if (state.conflict) return route.fulfill({ status: 409, json: { error: { message: "Hồ sơ đã thay đổi. Vui lòng tải lại." } } });
      state.writes.push(body);
      state.data = { ...state.data!, ...body.changes };
      state.revision += 1;
    }
    return route.fulfill({ json: { data: state.data ? { schemaVersion: 2, revision: state.revision, data: state.data } : null } });
  });
  return state;
}

test("completion card opens only financial profile, missing items are red, desktop layout fits", async ({ page }) => {
  await install(page);
  await page.goto("/user/dashboard");
  await expect(page.locator(".dashboard-summary-header").getByRole("link", { name: "Hồ sơ tài chính" })).toHaveCount(0);
  const entry = page.getByRole("link", { name: "Xem và hoàn thiện hồ sơ tài chính" });
  await expect(entry).toContainText("89%");
  await entry.click();
  await expect(page.getByRole("heading", { name: /^Hồ sơ tài chính(?: cá nhân)?$/, exact: true })).toBeVisible();
  await expect(page.getByLabel("Email tài khoản")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Menu tài khoản" })).toHaveCount(0);
  await expect(page.locator(".profile-checklist .is-missing")).toHaveCount(1);
  await expect(page.locator(".profile-checklist .is-missing")).toContainText("Thời điểm nhận lương hưu");
  await page.screenshot({ path: "../artifacts/financial-profile-desktop.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("complete missing item, save and reload; edit existing date without replacing detailed data", async ({ page }) => {
  const state = await install(page);
  const original = structuredClone(state.data!);
  await page.goto("/user/account");
  await page.locator(".profile-checklist .is-missing").click();
  await page.getByLabel("Thông tin tháng nhận lương hưu", { exact: true }).selectOption("NOT_APPLICABLE");
  await page.getByRole("button", { name: "Lưu thông tin lương hưu", exact: true }).click();
  await expect(page.locator(".financial-profile-progress strong")).toHaveText("100%");
  await page.reload();
  await expect(page.locator(".financial-profile-progress strong")).toHaveText("100%");
  await page.getByLabel("Ngày tháng năm sinh", { exact: true }).fill("1975-03-01");
  await page.getByRole("button", { name: "Lưu thông tin & thời gian" }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.data!.income).toEqual(original.income);
  expect(state.data!.assets).toEqual(original.assets);
  expect(state.data!.debts).toEqual(original.debts);
  await page.reload();
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toHaveValue("01/03/1975");
  await page.locator(".profile-checklist").getByRole("button", { name: /^Thu nhập/ }).click();
  await page.getByLabel("Số tiền (VND)", { exact: true }).first().fill("18.000.001,25");
  await page.getByRole("button", { name: "Lưu thu nhập & chi tiêu" }).click();
  await expect.poll(() => state.writes.length).toBe(3);
  expect(state.data!.income.status === "KNOWN" && state.data!.income.entries[0].amount).toEqual(known("18000001.25"));
  await page.locator(".profile-checklist").getByRole("button", { name: /^Ngày tháng năm sinh/ }).click();
  state.conflict = true;
  await page.getByLabel("Ngày tháng năm sinh", { exact: true }).fill("1974-03-01");
  await page.getByRole("button", { name: "Lưu thông tin & thời gian" }).click();
  await expect(page.getByText("Hồ sơ đã thay đổi. Vui lòng tải lại.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toHaveValue("01/03/1974");
  expect(state.data!.personal.birthMonth).toEqual(known("1975-03"));
});

test("unknown amounts remain blank and red; explicitly entered zero is complete", async ({ page }) => {
  const data = fixture();
  if (data.income.status === "KNOWN") data.income.entries[0].amount = { status: "UNKNOWN" };
  await install(page, data);
  await page.goto("/user/account");
  await page.locator(".profile-checklist").getByRole("button", { name: /^Thu nhập/ }).click();
  const amount = page.getByLabel("Số tiền (VND)", { exact: true }).first();
  await expect(amount).toHaveValue("");
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await amount.fill("0");
  await page.getByRole("button", { name: "Lưu thu nhập & chi tiêu" }).click();
  await expect(page.locator(".financial-profile-progress strong")).toHaveText("89%");
  await page.reload();
  await expect(page.locator(".profile-checklist").getByRole("button", { name: /^Thu nhập/ })).toHaveClass("is-complete");
});

test("no profile shows onboarding and zero completion; mobile page does not overflow", async ({ page }) => {
  await install(page, null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/user/account");
  await expect(page.locator(".financial-profile-progress strong")).toHaveText("0%");
  await expect(page.getByRole("link", { name: "Khai báo hồ sơ", exact: true })).toBeVisible();
  await expect(page.locator(".financial-profile-editor")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("unknown pension stays unknown and never inserts an invented pension amount", async ({ page }) => {
  await install(page);
  await page.goto("/user/account");
  await page.locator(".profile-checklist .is-missing").click();
  await page.getByLabel("Trạng thái khai báo lương hưu").selectOption("KNOWN");
  await expect(page.getByLabel("Mức lương hưu dự kiến (VND / tháng)", { exact: true })).toHaveValue("");
  await page.getByLabel("Trạng thái khai báo lương hưu").selectOption("UNKNOWN");
  await expect(page.getByLabel("Mức lương hưu dự kiến (VND / tháng)", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Trạng thái khai báo lương hưu")).toHaveValue("UNKNOWN");
});

test("collapsed sidebar completion opens by keyboard; financial form fits small screens", async ({ page }) => {
  await install(page);
  await page.goto("/user/dashboard");
  await page.getByRole("button", { name: "Thu gọn thanh menu", exact: true }).click();
  const entry = page.getByRole("link", { name: "Xem và hoàn thiện hồ sơ tài chính" });
  await expect(entry).toBeVisible();
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /^Hồ sơ tài chính(?: cá nhân)?$/, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../artifacts/financial-profile-mobile.png", fullPage: true });
});

test("Vietnamese dates validate real days and calendar selection; money preserves exact decimal strings", async ({ page }) => {
  const state = await install(page);
  await page.goto("/user/account");
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toHaveValue("01/03/1976");
  const date = page.getByLabel("Ngày cập nhật số liệu tài chính", { exact: true });
  await expect(date).toHaveValue("13/10/2026");
  await date.fill("31/02/2026");
  await page.getByRole("button", { name: "Lưu thông tin & thời gian" }).click();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  expect(state.writes).toHaveLength(0);
  await date.fill("12/10/2026");
  await page.getByRole("button", { name: "Lưu thông tin & thời gian" }).click();
  await expect.poll(() => state.data!.valuationDate).toBe("2026-10-12");
  await page.getByLabel("Mở lịch chọn ngày tháng năm sinh", { exact: true }).fill("1974-02-01");
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toHaveValue("01/02/1974");
  await page.getByRole("button", { name: "Lưu thông tin & thời gian" }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  await page.locator(".profile-section-tabs").getByRole("button", { name: "Tài sản", exact: true }).click();
  const money = page.getByLabel("Giá trị (VND)", { exact: true });
  await expect(money).toHaveValue("9.007.199.254.740.993");
  await money.fill("9007199254740994,25");
  await expect(money).toHaveValue("9.007.199.254.740.994,25");
  await page.locator(".financial-profile-editor form").getByRole("button", { name: /Lưu/ }).click();
  await expect.poll(() => state.writes.length).toBe(3);
  expect(state.data!.assets.status === "KNOWN" && state.data!.assets.entries[0].value).toEqual(known("9007199254740994.25"));
  await page.reload();
  await page.locator(".profile-section-tabs").getByRole("button", { name: "Tài sản", exact: true }).click();
  await expect(money).toHaveValue("9.007.199.254.740.994,25");
  await money.fill("");
  await expect(money).toHaveAttribute("aria-invalid", "true");
  await money.fill("2000000000");
  await expect(money).toHaveValue("2.000.000.000");
  await money.press("End");
  await money.press("Backspace");
  await expect(money).toHaveValue("200.000.000");
});

test("all profile sections have usable desktop and mobile layouts", async ({ page }) => {
  await install(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/user/account");
  const sidebar = page.getByRole("link", { name: "Xem và hoàn thiện hồ sơ tài chính" });
  await expect(sidebar).toContainText("Hồ sơ tài chính");
  await expect(sidebar).toContainText("Chỉnh sửa hồ sơ");
  await sidebar.screenshot({ path: "../artifacts/profile-entry-redesign.png" });
  const tabs = ["Thông tin & thời gian", "Thu nhập & chi tiêu", "Tài sản", "Khoản nợ", "Lương hưu"];
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [index, name] of tabs.entries()) {
      await page.locator(".profile-section-tabs").getByRole("button", { name, exact: true }).click();
      if (name === "Lương hưu") {
        await page.getByLabel("Trạng thái khai báo lương hưu").selectOption("KNOWN");
        await page.getByLabel("Mức lương hưu dự kiến (VND / tháng)", { exact: true }).fill("5000000");
        await expect(page.getByLabel("Mức lương hưu dự kiến (VND / tháng)", { exact: true })).toHaveValue("5.000.000");
        await page.getByLabel("Chính sách điều chỉnh lương hưu").selectOption("EXPLICIT_SCHEDULE");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const form = page.locator(".financial-profile-editor form");
      await expect(form).toBeVisible();
      if (name === "Tài sản") {
        expect(await page.locator(".profile-entry-card").first().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThanOrEqual(16);
      }
      await form.screenshot({ path: `../artifacts/profile-tab-${index}-${width}.png` });
    }
  }
});
