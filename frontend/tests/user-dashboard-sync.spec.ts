import { expect, test, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { profile as baseProfile, selection as baseSelection, preview as makePreview } from "./planning-contract-fixtures";

async function setup(page: Page, options: { noProfile?: boolean; noPlan?: boolean; emptyProfile?: boolean; changed?: boolean; syncError?: boolean; plansError?: boolean; zero?: boolean; pension?: boolean; failedApply?: boolean; shortfall?: boolean; birthMonth?: string; exactMoney?: boolean; goalInfo?: "missing" | "zero" | "survey-zero" } = {}) {
  // Every API request stays at the mock boundary, including writes.
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_TEST_API", message: "Missing test fixture" } } }));
  await installRouteAuth(page);
  await page.route("**/socket.io/**", route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.addInitScript(() => sessionStorage.setItem("anhuu_onboarding_all_dismissed", "true"));
  const profile = structuredClone(baseProfile) as any;
  if (options.birthMonth) profile.data.personal.birthMonth.value = options.birthMonth;
  profile.summary = { values: { monthlyIncome: "30000000", monthlyExpense: "20000000", monthlyDebtService: "0", availableMonthlySurplus: options.zero ? "0" : "10000000" } };
  profile.data.expenses = { status: "KNOWN", entries: [{ id: "expense", category: "ESSENTIAL", label: "Sinh hoạt", amount: { status: "KNOWN", value: "20000000" }, currency: "VND", frequency: "MONTHLY", startMonth: "2020-01", endMonth: null }] };
  if (options.goalInfo) {
    delete profile.data.retirementGoal; delete profile.data.retirementSurvey;
    if (options.goalInfo === "zero") profile.data.retirementGoal = { endMonth: "2065-01", monthlyExpenseToday: "0", lifestylePriority: null };
    if (options.goalInfo === "survey-zero") profile.data.retirementSurvey = { policyVersionId: baseSelection.policyVersionId, monthlyExpenseToday: "0", answers: baseSelection.answers };
  }
  if (options.emptyProfile) {
    for (const key of ["birthMonth", "desiredRetirementMonth"]) profile.data.personal[key] = { status: "UNKNOWN" };
    for (const key of ["income", "expenses", "assets"]) profile.data[key] = { status: "UNKNOWN" };
    profile.summary.values.availableMonthlySurplus = null;
  }
  await installFinancialProfileRoutes(page, { profile: options.noProfile ? null : profile });
  const selection = { ...baseSelection, monthlyContribution: "6000000", monthlyReserve: "2000000" };
  const makeData = (input: any, amount: string, hash: string) => {
    const data: any = makePreview(input);
    data.inputHash = hash; data.valuationDate = "2026-11-10";
    data.calculation.summary.plannedMonthlyContribution = input.monthlyContribution;
    data.calculation.summary.initialRetirementCapital = "250000000";
    data.calculation.summary.atRetirement.projectedFund = amount;
    data.calculation.summary.atRetirement.requiredFund = options.zero ? "0" : "4800000000";
    data.calculation.conventions = { contributionTiming: "END_OF_MONTH" };
    data.calculation.scenario = { label: "Cơ sở" };
    data.warnings = options.pension ? [] : [{ path: "pension", code: "PENSION_NOT_INCLUDED" }];
    data.calculation.rows = [
      { month: "2026-11", phase: "ACCUMULATION", openingBalance: "250000000", fundedClosingBalance: "260000000", closingBalance: "260000000", contributionCapacity: options.zero ? "0" : "8000000", contribution: "6000000", withdrawal: "0", pension: "0" },
      { month: "2033-10", phase: "ACCUMULATION", fundedClosingBalance: amount, contribution: "6000000", withdrawal: "0", pension: "0" },
      { month: "2033-11", phase: "RETIREMENT", fundedClosingBalance: amount, contribution: "0", withdrawal: "20000000", pension: options.pension ? "10000000" : "0" },
      { month: "2065-01", phase: "RETIREMENT", fundedClosingBalance: "0", contribution: "0", withdrawal: "20000000", pension: "0" },
    ];
    if (options.shortfall) data.calculation.rows[3].unfundedWithdrawal = "20000000";
    if (options.exactMoney) {
      data.calculation.summary.atRetirement.projectedFund = "9007199254740993.25";
      data.calculation.summary.atRetirement.requiredFund = "9007199254740994.75";
      Object.assign(data.calculation.rows[0], { fundedClosingBalance: "9007199254740993.25", contributionCapacity: "9007199254740993.25", contribution: "1234567.89", withdrawal: "543.21" });
    }
    return data;
  };
  const initial = makeData(selection, options.zero ? "0" : "5200000000", "initial-preview");
  let version: any = { id: "version-1", planId: "plan-sync", version: 1, profileRevision: options.changed ? 2 : 3, preview: { ...initial, profileRevision: options.changed ? 2 : 3 } };
  let current = version;
  let planRevision = 7, plansFail = !!options.plansError, syncFail = !!options.syncError, applyFail = !!options.failedApply;
  const calls: Array<{ path: string; body: any }> = [];
  const plan = () => ({ id: "plan-sync", userId: "USR-001", currentVersionId: current.id, baselineVersionId: "version-1", revision: planRevision, current, profileChanged: false, updates: { assumptions: null, policy: null } });
  await page.route("**/api/v1/me/retirement/plans**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); calls.push({ path, body });
      if (path.endsWith("/apply")) {
        if (applyFail) return route.fulfill({ status: 503, json: { error: { code: "TEST_APPLY_FAILURE", message: "Chưa áp dụng được, thử lại." } } });
        current = version; planRevision++;
        return route.fulfill({ json: { data: { ...plan(), applied: true } } });
      }
      version = { ...version, id: "version-2", version: 2, profileRevision: 3, preview: makeData(body.preview, "5300000000", "updated-preview") }; planRevision++;
      return route.fulfill({ json: { data: { planId: "plan-sync", revision: planRevision, saved: version } } });
    }
    if (plansFail) return route.fulfill({ status: 503, json: { error: { code: "TEST_PLANS_FAILURE", message: "Chưa tải được kế hoạch kiểm thử." } } });
    if (path.endsWith("/plans")) return route.fulfill({ json: { data: { items: options.noPlan ? [] : [plan()], page: 1, limit: 50, total: options.noPlan ? 0 : 1 } } });
    return route.fulfill({ json: { data: path.endsWith("/versions") ? { items: [version], total: 1, page: 1, limit: 50 } : plan() } });
  });
  await page.route("**/api/v1/me/retirement/preview**", async route => {
    await new Promise(resolve => setTimeout(resolve, 150));
    if (syncFail) return route.fulfill({ status: 503, json: { error: { code: "TEST_SYNC_FAILURE", message: "Chưa tính được số liệu mới." } } });
    return route.fulfill({ json: { data: makeData(route.request().postDataJSON(), "5300000000", "updated-preview") } });
  });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/user/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Chào An");
  return { calls, errors, setPlansFail: (value: boolean) => { plansFail = value; }, setSyncFail: (value: boolean) => { syncFail = value; }, setApplyFail: (value: boolean) => { applyFail = value; } };
}

test("saved main plan: correct status, figures and capacity after reserve", async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole("region", { name: "Trạng thái kế hoạch" })).toContainText("Phiên bản 1 là kế hoạch chính đang dùng");
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("5,20 tỷ ₫");
  await expect(page.locator(".dashboard-metric.is-capacity > strong")).toHaveText("8 triệu ₫/tháng");
  await expect(page.getByRole("button", { name: "Lưu làm kế hoạch chính", exact: true })).toHaveCount(0);
  await expect(page.locator(".dashboard-next-step a")).toHaveAttribute("href", "/user/simulation");
  expect(state.errors).toEqual([]);
});

test("zero projection, target and capacity remain zero", async ({ page }) => {
  await setup(page, { zero: true });
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("0 ₫");
  await expect(page.locator(".dashboard-metric.is-required > strong")).toHaveText("0 ₫");
  await expect(page.locator(".dashboard-metric.is-capacity > strong")).toHaveText("0 ₫/tháng");
  await page.getByRole("button", { name: "Giải thích Quỹ dự kiến khi nghỉ hưu", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".money-explanation-kpi > strong")).toHaveText("0 ₫");
});

test("overview and selected chart month retain exact API money beyond safe integers", async ({ page }, info) => {
  await setup(page, { exactMoney: true });
  await expect(page.locator(".dashboard-metric.is-projected .dashboard-metric-full")).toHaveText("9.007.199.254.740.993,25 ₫");
  await expect(page.locator(".dashboard-metric.is-required .dashboard-metric-full")).toHaveText("9.007.199.254.740.994,75 ₫");
  await expect(page.locator(".dashboard-metric.is-capacity .dashboard-metric-full")).toHaveText("9.007.199.254.740.993,25 ₫/tháng");
  const chart = page.locator(".plan-chart-interactive");
  await chart.getByRole("button", { name: /^Bắt đầu ·/ }).click();
  await expect(chart.getByRole("slider")).toHaveAttribute("aria-valuetext", "11/2026 · 9.007.199.254.740.993,25 ₫");
  await expect(chart).toContainText("1.234.567,89 ₫");
  await expect(chart).toContainText("543,21 ₫");
  await page.getByRole("button", { name: "Giải thích Quỹ dự kiến khi nghỉ hưu", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("9.007.199.254.740.993,25 ₫");
  await page.keyboard.press("Escape");
  await page.setViewportSize({width:320,height:740});
  await expect.poll(() => chart.locator(".chart-axis-label,.chart-target-label").evaluateAll(labels => labels.every(label => {
    const text=label as SVGGraphicsElement,box=text.getBBox();
    return box.x >= 0 && box.x + box.width <= text.ownerSVGElement!.viewBox.baseVal.width;
  }))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await chart.locator("svg.projection-svg").screenshot({path:info.outputPath("chart-exact-money-mobile.png")});
  await page.screenshot({path:info.outputPath("overview-exact-money-mobile.png"),fullPage:true});
});

for (const goalInfo of ["missing", "zero", "survey-zero"] as const) test(`profile progress uses declared retirement spending: ${goalInfo}`, async ({ page }) => {
  await setup(page, { goalInfo });
  await page.getByRole("button", { name: "Tiến độ hoàn thiện hồ sơ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: `${goalInfo === "missing" ? "Bổ sung" : "Xem lại"}: Mục tiêu nghỉ hưu`, exact: true })).toBeVisible();
});

test("no plan or unknown profile never substitutes demo money", async ({ page }) => {
  await setup(page, { noPlan: true, emptyProfile: true });
  await expect(page.locator(".dashboard-metric > strong")).toHaveText(["Chưa xác định", "Chưa xác định", "Chưa xác định"]);
  await expect(page.locator(".dashboard-chart-empty")).toBeVisible();
  await expect(page.locator(".dashboard-overview")).not.toContainText("1,80 tỷ");
  await expect(page.locator(".dashboard-overview")).not.toContainText("15 triệu");
  await page.getByRole("button", { name: "Tiến độ hoàn thiện hồ sơ", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("link", { name: "Bổ sung: Thu nhập và chi tiêu", exact: true })).toHaveAttribute("href", "/user/profile?section=cashflow");
});

test("pension note reflects the actual calculation", async ({ page }) => {
  await setup(page, { pension: true });
  await expect(page.locator(".dashboard-result-note")).toContainText("Đã tính lương hưu đã khai");
  await expect(page.locator(".dashboard-result-note")).not.toContainText("Chưa tính");
});

test("synchronization failure hides old figures, and retry shows the new preview", async ({ page }) => {
  const state = await setup(page, { changed: true, syncError: true });
  await expect(page.locator(".plan-sync-status[role=alert]")).toContainText("Chưa cập nhật được số liệu");
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("Chưa xác định");
  await expect(page.locator(".dashboard-metric.is-capacity > strong")).toHaveText("Chưa xác định");
  await page.getByRole("button", { name: "Giải thích Có thể góp tháng đầu", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".money-explanation-kpi > strong")).toHaveText("Chưa xác định");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("img", { name: "Biểu đồ số dư quỹ nghỉ hưu theo từng tháng" })).toHaveCount(0);
  state.setSyncFail(false);
  await page.locator(".plan-sync-status").getByRole("button", { name: "Thử lại" }).click();
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("5,30 tỷ ₫");
  await expect(page.locator(".dashboard-plan-status")).toContainText("Thay đổi chưa được dùng");
  expect(state.errors).toEqual([]);
});

test("failed plan load has a working retry", async ({ page }) => {
  const state = await setup(page, { plansError: true });
  await expect(page.getByRole("alert")).toContainText("Chưa tải được kế hoạch");
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("Chưa xác định");
  state.setPlansFail(false); await page.getByRole("button", { name: "Tải lại kế hoạch" }).click();
  await expect(page.locator(".dashboard-metric.is-projected > strong")).toHaveText("5,20 tỷ ₫");
});

test("feature search supports aliases, Vietnamese without accents, empty results and exact destinations", async ({ page }) => {
  const state = await setup(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog"), search = dialog.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("zzzzkhongtontai"); await expect(dialog.getByRole("status")).toHaveText("0 chức năng phù hợp");
  await expect(dialog.locator(".feature-search-result")).toHaveCount(0);
  await search.fill("tro ly"); await expect(dialog.locator(".feature-search-result")).toHaveCount(1);
  await expect(dialog.locator(".feature-search-result")).toContainText("Trợ lý AI");
  await search.fill("bhxh");
  await expect(dialog.locator(".feature-search-result")).toHaveCount(1);
  await search.press("Enter");
  await expect(page).toHaveURL(/\/user\/profile\?section=insurance$/);
  await expect(dialog).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("search keyboard focus stays in dialog and returns to trigger", async ({ page }) => {
  await setup(page);
  const trigger = page.getByRole("button", { name: "Tìm chức năng", exact: true });
  await trigger.click(); const dialog = page.getByRole("dialog");
  for (let i = 0; i < 16; i++) { await page.keyboard.press(i < 8 ? "Tab" : "Shift+Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
});

test("save confirms before mutation, and an apply retry does not save another version", async ({ page }) => {
  const state = await setup(page, { changed: true, failedApply: true });
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("Dùng phương án này");
  expect(state.calls).toHaveLength(0);
  await dialog.getByRole("button", { name: "Xác nhận dùng kế hoạch", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Phiên bản đã lưu, chưa áp dụng");
  expect(state.calls.filter(call => call.path.endsWith("/versions"))).toHaveLength(1);
  expect(state.calls[0].body.expectedInputHash).toBe("updated-preview");
  state.setApplyFail(false); await dialog.getByRole("button", { name: "Thử áp dụng lại", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".dashboard-plan-status")).toContainText("Phiên bản 2 là kế hoạch chính đang dùng");
  expect(state.calls.filter(call => call.path.endsWith("/versions"))).toHaveLength(1);
  expect(state.calls.filter(call => call.path.endsWith("/apply")).map(call => call.body)).toEqual([
    { versionId: "version-2", expectedRevision: 8, expectedProfileRevision: 3, confirm: true },
    { versionId: "version-2", expectedRevision: 8, expectedProfileRevision: 3, confirm: true },
  ]);
  expect(state.errors).toEqual([]);
});

test("language popover selects a language, closes, and restores focus", async ({ page }) => {
  await setup(page);
  const trigger = page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true });
  await trigger.click(); const menu = page.getByRole("menu", { name: "Ngôn ngữ", exact: true });
  await expect(menu.getByRole("menuitemradio", { name: "Tiếng Việt", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown"); await expect(menu.getByRole("menuitemradio", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(menu).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi An");
  await expect(page.getByRole("button", { name: "Choose language", exact: true })).toBeFocused();
  await page.keyboard.press("Control+k"); await expect(page.getByRole("dialog")).toHaveAccessibleName("What would you like to find?");
  await page.keyboard.press("Escape");
});

test("logout popup cancels safely, preserves the session on failure and retries", async ({ page }) => {
  await setup(page);
  let failed = true, writes = 0;
  await page.route("**/api/v1/auth/logout", route => { writes++; return failed ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Thử lại" } } }) : route.fulfill({ json: { data: { loggedOut: true } } }); });
  const avatar = page.getByRole("button", { name: "Tài khoản: Nguyễn Minh An", exact: true });
  const open = async () => { await avatar.click(); await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click(); };
  await open(); const dialog = page.getByRole("dialog", { name: "Đăng xuất khỏi An Hưu?", exact: true });
  expect(writes).toBe(0); await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(avatar).toBeFocused();
  await open(); await dialog.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Không thể kết nối máy chủ"); await expect(page).toHaveURL(/\/user\/dashboard$/);
  failed = false; await dialog.getByRole("button", { name: "Đăng xuất", exact: true }).click(); await expect(page).toHaveURL(/\/login$/); expect(writes).toBe(2);
});

test("tablet navigation can expand and collapse without covering content", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 }); await setup(page);
  for (const label of ["Mở rộng thanh điều hướng", "Thu gọn thanh điều hướng"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect.poll(async () => { const main = await page.locator(".dashboard-main").boundingBox(), sidebar = await page.locator(".user-sidebar").boundingBox(); return main!.x >= sidebar!.x + sidebar!.width - 1; }).toBe(true);
  }
});

test("chart milestones and keyboard slider show actual months, and phone labels stay readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page, { shortfall: true });
  const chart = page.locator(".plan-chart-interactive"), slider = chart.getByRole("slider");
  await chart.getByRole("button", { name: /^Bắt đầu ·/ }).click(); await expect(slider).toHaveValue("0");
  await expect(slider).toHaveAttribute("aria-valuetext", "11/2026 · 260.000.000 ₫");
  await slider.focus(); await page.keyboard.press("ArrowRight"); await expect(slider).toHaveValue("1");
  await chart.getByRole("button", { name: /^Bắt đầu thiếu từ/ }).click(); await expect(slider).toHaveValue("3");
  const actualFontSize = await chart.locator("svg").evaluate(svg => { const font = svg.querySelector("text")!; return Number(font.getAttribute("font-size")) * svg.getBoundingClientRect().width / (svg as SVGSVGElement).viewBox.baseVal.width; });
  expect(actualFontSize).toBeGreaterThanOrEqual(10);
});

test("mobile drawer popups return focus to a visible control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  const menu = page.getByRole("button", { name: "Mở menu tài khoản", exact: true });
  await menu.click(); await page.getByRole("button", { name: /Hoàn thiện hồ sơ ·/ }).click();
  await expect(page.getByRole("dialog", { name: "Tiến độ hoàn thiện hồ sơ", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toBeFocused();
  await menu.click(); await page.getByRole("button", { name: "Tìm chức năng", exact: true }).last().click();
  await expect(page.getByRole("searchbox")).toBeFocused(); await page.keyboard.press("Escape");
  await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches(".topbar-search-trigger, .user-mobile-brand > button"))).toBe(true);
});

test("chart age uses the declared birth month before the birthday", async ({ page }) => {
  await setup(page, { birthMonth: "1980-12" });
  const chart = page.locator(".plan-chart-interactive");
  await expect(chart.getByRole("button", { name: /^Nghỉ hưu ·/ })).toContainText("52 tuổi");
  await chart.getByRole("button", { name: /^Bắt đầu ·/ }).click();
  await expect(chart.locator(".chart-inspector")).toContainText("Cuối tháng 11/2026 · 45 tuổi");
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`overview and all new popups fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const state = await setup(page);
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await fits();
    if (await page.locator(".user-sidebar").isVisible()) {
      const sidebar = await page.locator(".user-sidebar").boundingBox(), main = await page.locator(".dashboard-main").boundingBox();
      expect(main!.x).toBeGreaterThanOrEqual(sidebar!.x + sidebar!.width - 1);
    }
    await page.screenshot({ path: test.info().outputPath("overview.png"), fullPage: true, animations: "disabled" });
    for (const label of ["Giải thích Quỹ dự kiến khi nghỉ hưu", "Giải thích Quỹ cần cho mục tiêu", "Giải thích Có thể góp tháng đầu", "Xem giả định"]) {
      await page.getByRole("button", { name: label, exact: true }).click(); const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await fits(); await page.screenshot({ path: test.info().outputPath(`${label.includes("giả định") ? "assumptions" : label.split(" ").pop()}.png`), animations: "disabled" });
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    }
    await page.keyboard.press("Control+k"); await expect(page.getByRole("searchbox")).toBeFocused(); await fits();
    await page.screenshot({ path: test.info().outputPath("search.png"), animations: "disabled" }); await page.keyboard.press("Escape");
    if (await page.locator(".profile-progress").isVisible()) await page.locator(".profile-progress").click();
    else if (await page.locator(".sidebar-profile-compact").isVisible()) await page.locator(".sidebar-profile-compact").click();
    else { await page.getByRole("button", { name: "Mở menu tài khoản", exact: true }).click(); await page.getByRole("button", { name: /Hoàn thiện hồ sơ ·/ }).click(); }
    const progress = page.getByRole("dialog", { name: "Tiến độ hoàn thiện hồ sơ", exact: true });
    await expect(progress).toBeVisible();
    await expect(progress.getByRole("link", { name: "Bổ sung: Lương hưu BHXH", exact: true })).toBeAttached();
    await progress.getByRole("link", { name: "Bổ sung: Lương hưu BHXH", exact: true }).scrollIntoViewIfNeeded();
    await expect(progress.getByRole("link", { name: "Bổ sung: Lương hưu BHXH", exact: true })).toBeInViewport();
    await fits(); await page.screenshot({ path: test.info().outputPath("profile-progress.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Thông báo", exact: true }).click();
    await expect(page.getByRole("region", { name: "Trung tâm thông báo mini" })).toBeVisible(); await fits();
    await page.keyboard.press("Escape");
    expect(state.errors).toEqual([]);
  });
}
