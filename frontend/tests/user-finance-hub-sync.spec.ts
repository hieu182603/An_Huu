import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from "./helpers";

const known = (value: string | number) => ({ status: "KNOWN", value });
function fixture() {
  return {
    revision: 3, schemaVersion: 2, asOfDate: "2028-03-15T00:00:00Z",
    data: {
      schemaVersion: 2, valuationDate: "2028-03-15", currency: "VND", periodUnit: "MONTH",
      personal: { birthMonth: known("1980-12"), desiredRetirementMonth: known("2040-11"), pensionStartMonth: known("2042-02"), maritalStatus: "MARRIED", dependents: known(0) },
      income: { status: "KNOWN", entries: [{ id: "salary", label: "Lương", source: "EMPLOYMENT", basis: "DISPOSABLE", kind: "FIXED", amount: known("35000000"), currency: "VND", startMonth: "2028-01", endMonth: null, frequency: "MONTHLY" }] },
      expenses: { status: "KNOWN", entries: [{ id: "living", label: "Sinh hoạt", category: "ESSENTIAL", amount: known("20000000"), currency: "VND", startMonth: "2028-01", endMonth: null, frequency: "MONTHLY" }] },
      assets: { status: "KNOWN", entries: [{ id: "deposit", label: "Tiền gửi", type: "DEPOSIT", value: known("625000000"), ownershipShare: known("0.8"), retirementShare: known("0.8"), emergencyShare: known("0.2"), otherGoalsShare: known("0"), currency: "VND", valuedOn: known("2028-03-15"), liquidity: known("LIQUID"), availableFromMonth: known("2028-01") }] },
      debts: { status: "NOT_APPLICABLE", reason: "Không có nợ" },
      pension: { status: "KNOWN", monthlyAmount: "6500000", currency: "VND", priceBasis: "TODAY", basisMonth: "2028-03", source: "Mức tự khai", estimatedOn: "2028-03-15", adjustment: { kind: "NONE" } },
    },
    summary: { values: { monthlyIncome: "35000000", monthlyExpense: "20000000", monthlyDebtService: "0", availableMonthlySurplus: "15000000", totalDebt: "0", totalAssets: "500000000", retirementLiquidAssets: "400000000", emergencyReserve: "100000000" } },
  };
}

async function setup(page: Page, options: { profile?: any; error?: boolean; delay?: number } = {}) {
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_TEST_API", message: "Missing finance fixture" } } }));
  await installRouteAuth(page);
  await page.route("**/socket.io/**", route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  let profile = options.profile !== undefined ? options.profile : fixture(), failed = !!options.error;
  await installFinancialProfileRoutes(page, { profile });
  await page.route("**/api/v1/me/financial-profile", async route => {
    if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
    return failed ? route.fulfill({ status: 503, json: { error: { code: "PROFILE_UNAVAILABLE", message: "Chưa tải được hồ sơ kiểm thử." } } }) : route.fulfill({ json: { data: profile } });
  });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/v1/me/") && request.method() !== "GET") writes.push(request.url()); });
  await page.goto("/user/profile");
  return { errors, writes, setFailed: (value: boolean) => { failed = value; }, setProfile: (value: any) => { profile = value; } };
}
const metric = (page: Page, key: string) => page.locator(`.finance-summary-metric.is-${key} > strong`);
const topic = (page: Page, key: string) => page.locator(`article[aria-labelledby="finance-topic-${key}"]`);

test("hub matches the demo hierarchy and uses profile month, current income and ownership shares", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tài chính của bạn");
  await expect(page.locator(".finance-summary-metric > strong")).toHaveText(["35.000.000 ₫", "20.000.000 ₫", "0 ₫", "15.000.000 ₫"]);
  await expect(topic(page, "assets")).toContainText("400.000.000 ₫");
  await expect(topic(page, "assets")).toContainText("100.000.000 ₫");
  await expect(topic(page, "cashflow")).toContainText("Tháng 03/2028");
  await expect(topic(page, "pension")).toContainText("02/2042");
  await expect(topic(page, "pension")).toContainText("6.500.000 ₫/tháng");
  await expect(topic(page, "family")).toContainText("0 người");
  await expect(page.locator(".finance-summary-badge.is-done")).toHaveCount(5);
  expect(await page.locator(".finance-summary-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3);
  expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});

test("explicit zero declarations remain zero, including no pension and no dependents", async ({ page }) => {
  const profile: any = fixture();
  for (const key of Object.keys(profile.summary.values)) profile.summary.values[key] = "0";
  for (const key of ["income", "expenses", "assets", "debts"]) profile.data[key] = { status: "NOT_APPLICABLE", reason: "Đã xác nhận không có" };
  profile.data.pension = { status: "NOT_APPLICABLE", reason: "Không có lương hưu" };
  profile.data.personal.pensionStartMonth = { status: "NOT_APPLICABLE", reason: "Không có lương hưu" };
  await setup(page, { profile });
  await expect(page.locator(".finance-summary-metric > strong")).toHaveText(["0 ₫", "0 ₫", "0 ₫", "0 ₫"]);
  await expect(topic(page, "assets").locator("dd")).toHaveText(["0 ₫", "0 ₫"]);
  await expect(topic(page, "pension")).toContainText("Không có lương hưu");
  await expect(topic(page, "pension")).toContainText("Không áp dụng");
  await expect(topic(page, "family")).toContainText("0 người");
  await expect(page.locator(".finance-summary-badge.is-done")).toHaveCount(5);
});

test("unknown and incomplete data are not replaced by sample amounts or declared badges", async ({ page }) => {
  const profile: any = fixture();
  profile.data.income = { status: "UNKNOWN" }; profile.data.expenses = { status: "UNKNOWN" };
  profile.data.assets = { status: "UNKNOWN" }; profile.data.debts = { status: "UNKNOWN" }; profile.data.pension = { status: "UNKNOWN" };
  delete profile.data.personal.maritalStatus; profile.data.personal.dependents = { status: "UNKNOWN" }; profile.data.personal.pensionStartMonth = { status: "UNKNOWN" };
  for (const key of Object.keys(profile.summary.values)) profile.summary.values[key] = null;
  await setup(page, { profile });
  await expect(page.locator(".finance-summary-metric > strong")).toHaveText(["Chưa xác định", "Chưa xác định", "Chưa xác định", "Chưa xác định"]);
  await expect(page.locator(".finance-summary-badge.is-missing")).toHaveCount(5);
  await expect(topic(page, "pension")).not.toContainText("60 tuổi");
  await expect(topic(page, "pension").locator("dd")).toHaveText(["Chưa xác nhận", "Chưa xác nhận"]);
  await page.getByRole("button", { name: "Giải thích Thu nhập + lương hưu", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Chưa đủ dữ liệu");
});

test("negative surplus stays negative and is explained as a budget shortfall", async ({ page }) => {
  const profile = fixture(); profile.summary.values.availableMonthlySurplus = "-5000000";
  await setup(page, { profile });
  await expect(metric(page, "surplus")).toHaveText("-5.000.000 ₫");
  await expect(page.locator(".finance-summary-metric.is-negative")).toContainText("Ngân sách đang thiếu");
  await page.getByRole("button", { name: "Giải thích Ngân sách đang thiếu", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Số âm là phần còn thiếu");
  await expect(page.getByRole("dialog").locator("dd").last()).toHaveText("-5.000.000 ₫/tháng");
});

test("a partial summary preserves known values and never fills in a missing reserve", async ({ page }) => {
  const profile: any = fixture();
  profile.summary.values.monthlyIncome = null; profile.summary.values.availableMonthlySurplus = null;
  profile.summary.values.emergencyReserve = null;
  await setup(page, { profile });
  await expect(metric(page, "income")).toHaveText("Chưa xác định");
  await expect(metric(page, "expenses")).toHaveText("20.000.000 ₫");
  await expect(topic(page, "assets").locator("dd")).toHaveText(["400.000.000 ₫", "Chưa xác định"]);
  await expect(topic(page, "cashflow").locator(".finance-summary-badge")).toHaveText("Cần bổ sung");
  await expect(topic(page, "assets").locator(".finance-summary-badge")).toHaveText("Cần bổ sung");
});

test("missing server summary and invalid money do not turn into valid zero amounts", async ({ page }) => {
  const profile: any = fixture(); delete profile.summary;
  await setup(page, { profile });
  await expect(page.locator(".finance-summary-metric > strong")).toHaveText(["Chưa xác định", "Chưa xác định", "Chưa xác định", "Chưa xác định"]);
  await expect(topic(page, "assets").locator("dd").last()).toHaveText("Chưa xác định");
  profile.summary = { values: { monthlyIncome: "NaN", monthlyExpense: "", monthlyDebtService: "Infinity", availableMonthlySurplus: null } };
  await page.reload(); await expect(metric(page, "income")).toHaveText("Chưa xác định");
  await expect(metric(page, "debtPayment")).toHaveText("Chưa xác định");
});

test("reserve uses the API total and never reconstructs an absent or invalid value from asset shares", async ({ page }) => {
  const profile: any = fixture(); profile.summary.values.emergencyReserve = "42000000";
  await setup(page, { profile }); await expect(topic(page, "assets").locator("dd").last()).toHaveText("42.000.000 ₫");
  for (const value of [null, undefined, "NaN", ""]) {
    if (value === undefined) delete profile.summary.values.emergencyReserve;
    else profile.summary.values.emergencyReserve = value;
    await page.reload(); await expect(topic(page, "assets").locator("dd").last()).toHaveText("Chưa xác định");
  }
});

test("locked and future assets keep the zero reserve returned by the API", async ({ page }) => {
  const profile = fixture(); profile.summary.values.emergencyReserve = "0";
  profile.data.assets.entries[0].liquidity = known("LOCKED");
  await setup(page, { profile }); await expect(topic(page, "assets").locator("dd").last()).toHaveText("0 ₫");
  profile.data.assets.entries[0].liquidity = known("LIQUID");
  profile.data.assets.entries[0].availableFromMonth = known("2030-01");
  await page.reload(); await expect(topic(page, "assets").locator("dd").last()).toHaveText("0 ₫");
});

test("large decimal API amounts keep their VND precision through display", async ({ page }) => {
  const profile = fixture(); profile.summary.values.monthlyIncome = "9007199254740993.50";
  profile.summary.values.emergencyReserve = "1801439850948198.65";
  await setup(page, { profile });
  await expect(metric(page, "income")).toHaveText("9.007.199.254.740.994 ₫");
  await expect(topic(page, "assets").locator("dd").last()).toHaveText("1.801.439.850.948.199 ₫");
});

test("legacy profile totals use actual declared values without inventing an emergency reserve", async ({ page }) => {
  const profile = defaultMockProfile(); await setup(page, { profile });
  await expect(metric(page, "income")).toHaveText("30.000.000 ₫");
  await expect(metric(page, "surplus")).toHaveText("10.000.000 ₫");
  await expect(topic(page, "assets").locator("dd").last()).toHaveText("Chưa xác định");
  await expect(topic(page, "pension").locator("dd").last()).toHaveText("Chưa xác nhận");
});

test("empty profile has one onboarding action and no sample financial figures", async ({ page }) => {
  await setup(page, { profile: null });
  await expect(page.getByRole("heading", { name: "Bạn chưa có hồ sơ tài chính", exact: true })).toBeVisible();
  await expect(page.locator(".finance-summary-metric")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Khai báo hồ sơ", exact: true })).toHaveAttribute("href", "/onboarding");
  await expect(page.locator(".finance-summary-page")).not.toContainText("35.000.000");
});

test("load failure hides figures and the profile retry restores them", async ({ page }) => {
  const state = await setup(page, { error: true });
  await expect(page.getByRole("alert")).toContainText("Chưa tải được hồ sơ");
  await expect(page.locator(".finance-summary-metric")).toHaveCount(0);
  state.setFailed(false); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(metric(page, "income")).toHaveText("35.000.000 ₫");
  expect(state.errors).toEqual([]);
});

test("all five hub links open the expected screen and browser Back returns to the hub", async ({ page }) => {
  const state = await setup(page);
  for (const [key, destination] of [["cashflow", "/user/profile?section=cashflow"], ["assets", "/user/profile?section=assets"], ["debts", "/user/debts"], ["pension", "/user/profile?section=insurance"], ["family", "/user/profile?section=family"]]) {
    await topic(page, key).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(destination.replace("?", "\\?") + "$"));
    await expect(page.locator(".finance-summary-page")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await page.goBack(); await expect(page.locator(".finance-summary-grid")).toBeVisible();
  }
  await page.goto("/user/profile?section=debts"); await expect(page).toHaveURL(/\/user\/debts$/);
  expect(state.errors).toEqual([]);
});

test("a retirement-service outage does not replace profile facts with plan preview data", async ({ page }) => {
  await setup(page);
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ status: 503, json: { error: { code: "PLAN_UNAVAILABLE", message: "Kế hoạch tạm không khả dụng" } } }));
  await page.reload();
  await expect(metric(page, "income")).toHaveText("35.000.000 ₫");
  await expect(metric(page, "surplus")).toHaveText("15.000.000 ₫");
  await expect(topic(page, "assets")).toContainText("400.000.000 ₫");
});

test("all metric popups support keyboard, focus restoration and accurate formula values", async ({ page }) => {
  const state = await setup(page);
  for (const label of ["Thu nhập + lương hưu", "Chi tiêu sinh hoạt", "Trả nợ trong tháng", "Phần dư thu chi"]) {
    const trigger = page.getByRole("button", { name: `Giải thích ${label}`, exact: true });
    await trigger.click(); const dialog = page.getByRole("dialog", { name: label, exact: true });
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText("03/2028");
    for (let i = 0; i < 6; i++) { await page.keyboard.press(i < 3 ? "Tab" : "Shift+Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    if (label === "Phần dư thu chi") await expect(dialog.locator("dd")).toHaveText(["03/2028", "35.000.000 ₫/tháng", "20.000.000 ₫/tháng", "0 ₫/tháng", "15.000.000 ₫/tháng"]);
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
  }
  expect(state.writes).toEqual([]);
});

test("language switching covers all hub labels, amounts and popup content", async ({ page }) => {
  await setup(page); await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your finances");
  await expect(metric(page, "income")).toHaveText("35,000,000 ₫");
  await expect(topic(page, "family")).toContainText("0 people");
  await page.getByRole("button", { name: "Explain Monthly surplus", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Surplus = Income and pension");
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`finance hub and popups fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const state = await setup(page);
    await expect(page.locator(".finance-summary-grid")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("finance-hub.png"), fullPage: true, animations: "disabled" });
    for (const label of ["Thu nhập + lương hưu", "Chi tiêu sinh hoạt", "Trả nợ trong tháng", "Phần dư thu chi"]) {
      await page.getByRole("button", { name: `Giải thích ${label}`, exact: true }).click();
      const dialog = page.getByRole("dialog"); const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
      await dialog.getByRole("link").scrollIntoViewIfNeeded(); await expect(dialog.getByRole("link")).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`metric-${label.split(" ").pop()}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
    }
    expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
  });
}
