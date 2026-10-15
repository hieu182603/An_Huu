import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));
const profile = { revision: 1, schemaVersion: 2, data: {
  schemaVersion: 2, valuationDate: "2026-10-15", currency: "VND", periodUnit: "MONTH",
  personal: { birthMonth: { status: "KNOWN", value: "1980-01" }, desiredRetirementMonth: { status: "KNOWN", value: "2033-11" }, pensionStartMonth: { status: "UNKNOWN" } },
  income: { status: "KNOWN", entries: [] }, expenses: { status: "KNOWN", entries: [] }, assets: { status: "KNOWN", entries: [] },
  debts: { status: "NOT_APPLICABLE", reason: "Không có nợ" }, pension: { status: "UNKNOWN" },
} };

async function setup(page: Page, options: { onboarding?: boolean; missingYear?: boolean; assumptionError?: boolean; en?: boolean; endMonth?: string; scenarioFailure?: boolean; delayedResponse?: boolean } = {}) {
  const calls: Array<{ path: string; method: string; body: any }> = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().includes("/api/v1/") && !["GET", "OPTIONS"].includes(request.method())) calls.push({ path: new URL(request.url()).pathname, method: request.method(), body: request.postDataJSON() }); });
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } }));
  await installRouteAuth(page);
  await page.route("**/socket.io/**", route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const state = await installFinancialProfileRoutes(page, { profile: options.onboarding ? null : profile, draft: null });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0 } } }));
  await page.route("**/api/v1/me/assumptions/asm-1", route => options.assumptionError ? route.fulfill({ status: 503, json: { error: { message: "Unavailable" } } }) : route.fulfill({ json: { data: {
    id: "asm-1", version: 3, status: "PUBLISHED", data: { title: "Bộ giả định kiểm thử", reason: "Chuỗi lạm phát theo từng năm.", assetClasses: [],
      inflation: [{ year: 2026, percent: "2", sourceId: "s1", rateType: "EFFECTIVE_ANNUAL" }, ...options.missingYear ? [] : [{ year: 2027, percent: "6", sourceId: "s1", rateType: "EFFECTIVE_ANNUAL" }]],
      sources: [{ id: "s1", title: "Nguồn lạm phát kiểm thử", publisher: "Cơ quan kiểm thử", release: "2026", publishedOn: "2026-10-01", note: "Chỉ dùng trong kiểm thử.", url: "https://example.org/inflation" }],
    },
  } } }));
  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies**", route => route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/policy-test") ? policy : { status: "AVAILABLE", items: [policy] } } }));
  await page.route("**/api/v1/me/retirement/preview", async route => {
    const input = route.request().postDataJSON();
    const delayed = input.whatIf?.retirementMonth === "2038-11";
    if (options.delayedResponse && input.monthlyContribution === "1000000") await new Promise(resolve => setTimeout(resolve, 1600));
    if (options.scenarioFailure && delayed) return route.fulfill({ status: 503, json: { error: { message: "Scenario unavailable" } } });
    const lower = input.monthlyExpenseToday === "17000000.00";
    const summary = {
      retirementMonth: input.whatIf?.retirementMonth ?? "2033-11", endMonth: input.endMonth,
      accumulationMonths: 85, retirementMonths: 300, initialRetirementCapital: "0", futureMonthlyExpense: "25000000",
      atRetirement: { requiredFund: lower ? "850000000" : "1000000000", projectedFund: delayed ? "950000000" : "800000000", fundingGap: "200000000", coveragePercent: "80" },
      atValuation: { requiredFund: "1000000000", projectedFund: "800000000", fundingGap: "200000000", coveragePercent: "80" },
      requiredConstantMonthlyContribution: input.monthlyContribution === "1000000" ? "1111111" : input.monthlyContribution === "3000000" ? "3333333" : delayed ? null : lower ? "3000000" : "5000000",
      plannedMonthlyContribution: input.monthlyContribution, additionalMonthlyContribution: "0", savingsStatus: "ADDITIONAL_CONTRIBUTION_REQUIRED",
      retirementFundingShortfall: "200000000", excessAtRetirement: "0", unfundedWithdrawals: "0", terminalBalance: "0", terminalTarget: "0", terminalTargetShortfall: "0",
    };
    await route.fulfill({ json: { data: { status: "READY", issues: [], warnings: [], inputHash: "test-hash", profileRevision: 1, valuationDate: "2026-10-15", references: {}, selection: input, calculation: { summary, rows: [], limitations: [] } } } });
  });
  await page.addInitScript(({ onboarding, en, endMonth, answers, templateId }) => {
    localStorage.setItem("anhuu_language", en ? "en" : "vi");
    if (!onboarding) sessionStorage.setItem("anhuu:plan-draft:USR-001", JSON.stringify({ policyVersionId: "policy-test", templateId, endMonth: endMonth ?? "2060-01", monthlyExpenseToday: "20000000", monthlyContribution: "2000000", monthlyReserve: "0", answers }));
  }, { onboarding: options.onboarding, en: options.en, endMonth: options.endMonth, answers: policies.v2.questions.map((q: any) => ({ questionId: q.id, choiceId: q.choices[0].id })), templateId: policies.v2.templates[0].id });
  await page.clock.setFixedTime(new Date("2026-10-15T05:00:00Z"));
  await page.goto(options.onboarding ? "/onboarding" : "/user/plan");
  return { calls, errors, state };
}

async function enterTimeline(page: Page, en = false) {
  await page.getByRole("button", { name: en ? "20 million" : "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: en ? "Start" : "Bắt đầu khai báo", exact: true }).click();
  await page.getByLabel(en ? "Your Current Age (required to finish)" : "Tuổi hiện tại của bạn (cần để hoàn tất)", { exact: true }).fill("45");
  await page.getByLabel(en ? "Birth month for the detailed profile (unknown allowed)" : "Tháng sinh cho hồ sơ chi tiết (có thể chưa biết)").fill("1981-05");
  await page.getByLabel(en ? "Desired retirement month" : "Tháng bạn muốn nghỉ hưu", { exact: true }).fill("2027-10");
  await page.getByRole("button", { name: en ? "Continue" : "Tiếp tục", exact: true }).click();
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`guided onboarding, published purchasing power and contribution budget ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { calls, errors, state } = await setup(page, { onboarding: true });
    await expect(page.getByRole("heading", { name: "Bạn muốn chi bao nhiêu mỗi tháng khi nghỉ hưu?" })).toBeVisible();
    await expect(page.getByLabel("Giới tính", { exact: true })).toHaveCount(0);
    await enterTimeline(page);
    await expect(page.getByRole("heading", { name: "Mức sống hôm nay, sức mua ngày mai" })).toBeVisible();
    // Oct-Dec 2026 at 2%, Jan-Sep 2027 at 6%; a fixed-rate shortcut gives a different result.
    const expected = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(20000000 * 1.02 ** (3/12) * 1.06 ** (9/12));
    await expect(page.getByTestId("future-purchasing-power")).toHaveText(`${expected} đồng/tháng`);
    await page.getByText("Vì sao An Hưu dùng con số này?", { exact: true }).click();
    await expect(page.getByText("Nguồn lạm phát kiểm thử", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Xem nguồn" })).toHaveAttribute("href", "https://example.org/inflation");
    await page.screenshot({ path: `test-results/purchasing-power-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByLabel("Thu nhập chính sau thuế (Lương / Thù lao)", { exact: true }).fill("30000000");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByLabel("Chi tiêu thiết yếu hàng tháng", { exact: true }).fill("20000000");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(page.getByLabel("Bất động sản khác (không tính nhà đang ở)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByLabel("Khoản góp mỗi tháng bạn chọn", { exact: true }).fill("11000000");
    await expect(page.getByText(/Khoản góp vượt phần còn dư/)).toBeVisible();
    await expect(page.getByText(/Phần còn dư = thu − chi sinh hoạt/)).toContainText("10.000.000");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Bạn còn những khoản nợ nào cần trả?" })).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await page.getByRole("button", { name: "Chưa biết, bổ sung sau", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Bức tranh tài chính tổng quan của bạn" })).toBeVisible();
    expect(state.getDraft().step).toBe("summary");
    const draftWrites = calls.filter(call => call.path.endsWith("/onboarding-draft"));
    expect(draftWrites.map(call => call.body.step)).toEqual(["personal", "income", "expenses", "assets", "investment", "debt", "socialSecurity", "summary"]);
    for (const call of draftWrites) { expect(call.body.data.schemaVersion).toBe(2); expect(call.body.data.lossTolerance).toBeUndefined(); expect(call.body.data.incomeStability).toBeUndefined(); }
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")!))).toMatchObject({ monthlyExpenseToday: "20000000", monthlyContribution: "11000000", whatIf: { retirementMonth: "2027-10" } });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Bức tranh tài chính tổng quan của bạn" })).toBeVisible();
    await page.getByRole("button", { name: "Hoàn tất hồ sơ", exact: true }).click();
    await expect(page).toHaveURL(/\/user\/account/);
    expect(state.getProfile().schemaVersion).toBe(2);
    expect(state.getProfile().data.personal).toMatchObject({ birthMonth: { status: "KNOWN", value: "1981-05" }, gender: "UNDISCLOSED", maritalStatus: "OTHER" });
    expect(errors).toEqual([]);
  });
}

for (const failure of ["missingYear", "assumptionError"] as const) {
  test(`purchasing power does not invent rates: ${failure}`, async ({ page }) => {
    const { errors } = await setup(page, { onboarding: true, [failure]: true });
    await enterTimeline(page);
    await expect(page.getByText(failure === "missingYear" ? /Cần mức chi và thời điểm nghỉ hưu hợp lệ/ : /Chưa tải được bộ giả định đang công bố/)).toBeVisible();
    await expect(page.getByTestId("future-purchasing-power")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("English onboarding preserves the same published calculation", async ({ page }) => {
  const { errors } = await setup(page, { onboarding: true, en: true });
  await enterTimeline(page, true);
  await expect(page.getByRole("heading", { name: "Today's lifestyle, tomorrow's purchasing power" })).toBeVisible();
  await expect(page.getByTestId("future-purchasing-power")).toContainText("VND/month");
  expect(errors).toEqual([]);
});

test("three scenario cards use API results and never save a plan", async ({ page }) => {
  const { calls, errors } = await setup(page);
  const cards = page.locator(".guided-scenario");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("1.000.000.000");
  await expect(cards.nth(1)).toContainText("950.000.000");
  await expect(cards.nth(1)).toContainText("Chưa xác định");
  await expect(cards.nth(2)).toContainText("850.000.000");
  const previews = calls.filter(call => call.path.endsWith("/retirement/preview")).map(call => call.body);
  expect(previews.some(body => body.whatIf?.retirementMonth === "2038-11")).toBe(true);
  expect(previews.some(body => body.monthlyExpenseToday === "17000000.00")).toBe(true);
  for (const body of previews) { expect(body.endMonth).toBe("2060-01"); expect(body.expectedProfileRevision).toBe(1); }
  expect(calls.filter(call => call.path.includes("/plans"))).toEqual([]);
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("anhuu:plan-draft:USR-001")!));
  expect(draft.monthlyExpenseToday).toBe("20000000"); expect(draft.whatIf).toBeUndefined();
  await page.setViewportSize({ width: 375, height: 812 });
  await cards.nth(2).scrollIntoViewIfNeeded();
  expect(await page.locator(".guided-scenarios").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.locator(".guided-scenarios").screenshot({ path: "test-results/guided-scenarios-mobile.png" });
  expect(errors).toEqual([]);
});

test("retiring five years later cannot exceed endMonth", async ({ page }) => {
  const { calls, errors } = await setup(page, { endMonth: "2036-01" });
  await expect(page.locator(".guided-scenario").nth(2)).toContainText("850.000.000");
  await expect(page.locator(".guided-scenario").nth(1)).toContainText("không được vượt tháng kết thúc");
  expect(calls.some(call => call.body?.whatIf?.retirementMonth === "2038-11")).toBe(false);
  expect(errors).toEqual([]);
});

test("scenario errors remain local and old preview requests are cancelled", async ({ page }) => {
  const { calls, errors } = await setup(page, { scenarioFailure: true, delayedResponse: true });
  await expect(page.locator(".guided-scenario").nth(1)).toContainText("Chưa tính được phương án này");
  await expect(page.locator(".guided-scenario").nth(0)).toContainText("5.000.000");
  const contribution = page.getByLabel("Tiền bạn chọn góp hưu trí mỗi tháng (đồng)", { exact: true });
  await contribution.fill("1000000");
  await expect.poll(() => calls.filter(call => call.body?.monthlyContribution === "1000000").length).toBeGreaterThanOrEqual(3);
  await contribution.fill("3000000");
  await expect(page.locator(".guided-scenario").nth(0)).toContainText("3.333.333");
  await page.waitForTimeout(1800);
  await expect(page.locator(".guided-scenario").nth(0)).not.toContainText("1.111.111");
  expect(errors).toEqual([]);
});


test("English scenarios and incomplete API results are explicit", async ({ page }) => {
  const { errors } = await setup(page, { en: true });
  await expect(page.getByRole("heading", { name: "Retire 5 years later", exact: true })).toBeVisible();
  await expect(page.locator(".guided-scenario").nth(1)).toContainText("Undetermined");
  await page.route("**/api/v1/me/retirement/preview", route => route.fulfill({ json: { data: { status: "INCOMPLETE", issues: [{ path: "retirementMonth", code: "RETIREMENT_MONTH_REQUIRED" }], warnings: [], calculation: null } } }));
  await page.getByLabel("Monthly retirement contribution (VND)", { exact: true }).fill("123456");
  await expect(page.locator(".guided-scenario").nth(0)).toContainText("Not enough data to calculate");
  await expect(page.locator(".guided-scenario").nth(0).locator("dl")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("partner products require explicit visibility and always carry a reference label", async ({ page }) => {
  const { calls, errors } = await setup(page);
  const product = { id: "visible", name: "Sản phẩm kiểm thử", category: "Tiết kiệm", description: "Thông tin sản phẩm", annualFee: "Chưa công bố", riskLevel: "LOW", isVisible: true };
  await page.route("**/api/v1/products**", route => route.fulfill({ json: { data: { items: [product, { ...product, id: "hidden", name: "Sản phẩm ẩn", isVisible: false }, { ...product, id: "missing", name: "Thiếu cờ hiển thị", isVisible: undefined }] } } }));
  await page.goto("/user/explore");
  await expect(page.locator(".solution-card")).toHaveCount(1);
  await expect(page.locator(".solution-card")).toContainText("Thông tin tham khảo — không phải khuyến nghị cá nhân");
  await expect(page.getByText("Sản phẩm ẩn", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Xem chi tiết giải pháp" }).click();
  await expect(page.getByRole("dialog")).toContainText("Sản phẩm không được xếp hạng hay đề xuất theo hồ sơ tài chính");
  expect(calls.some(call => call.path.includes("/consult"))).toBe(false);
  expect(errors).toEqual([]);
});

test("portfolio explains the role of each published asset class", async ({ page }) => {
  const { errors } = await setup(page);
  await page.route("**/api/v1/me/portfolio-policies/preview", route => route.fulfill({ json: { data: { status: "READY", assessment: { totalScore: 30, riskBandId: policies.v2.riskBands[0].id, selectedTemplateId: policies.v2.templates[0].id, eligibleTemplateIds: [policies.v2.templates[0].id] }, scenarios: [], issues: [] } } }));
  await page.goto("/user/risk-portfolio");
  const roles = page.getByRole("region", { name: "Vai trò từng nhóm tài sản" });
  await expect(roles).toContainText("Giữ chủ động");
  await expect(roles).toContainText("Gắn kỳ hạn với nhu cầu tiền");
  await expect(roles).toContainText("tăng trưởng dài hạn");
  await expect(roles).toContainText("Đa dạng hóa danh mục");
  expect(errors).toEqual([]);
});
