import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from "./helpers";

const api = "http://127.0.0.1:55442", known = (value: string | number) => ({ status: "KNOWN", value });
async function setup(page: Page, request: APIRequestContext, changes: object = {}, withPlan = false) {
  const response = await request.post(`${api}/__fixture/reset`, { data: { changes, withPlan } }); expect(response.ok()).toBeTruthy(); const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_API", message: "No planning fixture" } } }));
  await installRouteAuth(page); await installFinancialProfileRoutes(page, { profile: fixture.profile });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route("**/socket.io/**", route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const writes: Array<{ status: number; body: any }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/\/api\/v1\/me\/(financial-profile|retirement\/plans)([/?]|$)/, async route => {
    const outgoing = route.request(), url = new URL(outgoing.url());
    const res = await route.fetch({ url: api + url.pathname + url.search, headers: { ...outgoing.headers(), Authorization: `Bearer ${fixture.accessToken}` } });
    if (outgoing.method() !== "GET") writes.push({ status: res.status(), body: outgoing.postDataJSON() });
    await route.fulfill({ response: res });
  });
  await page.goto("/user/profile?section=constraints"); await expect(page.getByRole("heading", { level: 1, name: "Mục tiêu khác" })).toBeVisible(); await expect(page.getByRole("button", { name: "Các khoản này được dùng thế nào?", exact: true })).toBeEnabled();
  const get = async (path: string) => (await (await request.get(`${api}/api/v1/me/${path}`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data;
  return { fixture, writes, errors, get, record: () => get("financial-profile") };
}
const panel = (page: Page) => page.locator(".planning-question").nth(1);
const rows = (page: Page) => page.locator(".planning-goal");
const dialog = (page: Page) => page.getByRole("dialog");
const care = (page: Page) => page.getByLabel("Nghĩa vụ gia đình hiện tại", { exact: true });
const need = (page: Page, year: number) => page.getByLabel(`Trong ${year} năm tới`, { exact: true });
const goalStatus = (page: Page) => page.getByLabel("Tình trạng các mục tiêu khác", { exact: true });
const help = (page: Page) => page.getByRole("button", { name: "Các khoản này được dùng thế nào?", exact: true });
const goal = (id: string, label = "Quỹ học vấn") => ({ id, label, amountToday: known("100000000.25"), dueMonth: known("2027-10"), inflation: known("4.25"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } });
const personal = () => ({ birthMonth: known("1990-04"), desiredRetirementMonth: known("2050-05"), pensionStartMonth: { status: "UNKNOWN" }, maritalStatus: "DIVORCED", dependents: known(7), careResponsibility: known("PARENTS") });
const savedGoals = () => ({ status: "KNOWN", entries: [goal("education"), { ...goal("legacy", "Để lại tài sản"), inflation: { status: "UNKNOWN" }, priority: known("LEGACY"), deferrable: { status: "UNKNOWN" } }] });
async function openNeeds(page: Page) { if (!await panel(page).evaluate(el => (el as HTMLDetailsElement).open)) await panel(page).locator(":scope>summary").click(); }
async function addGoal(page: Page) {
  await openNeeds(page); if (await goalStatus(page).inputValue() !== "KNOWN") await goalStatus(page).selectOption("KNOWN");
  await page.getByRole("button", { name: "Thêm mục tiêu", exact: true }).click();
  return rows(page).last();
}
async function save(page: Page) {
  const response = page.waitForResponse(r => r.url().endsWith("/me/financial-profile/planning") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); expect((await response).status()).toBe(200); await expect(page).toHaveURL(/\/user\/plan$/);
}
async function returnToForm(page: Page) { await page.goto("/user/profile?section=constraints"); await expect(care(page)).toBeVisible(); await expect(help(page)).toBeEnabled(); await openNeeds(page); }

test("initial unknowns stay blank and the two groups match the demo hierarchy", async ({ page, request }) => {
  const state = await setup(page, request); await expect(page.locator(".user-sidebar").getByRole("link", { name: "Mục tiêu nghỉ hưu", exact: true })).toHaveClass(/is-active/); await expect(care(page)).toHaveValue(""); await expect(panel(page)).not.toHaveAttribute("open");
  await openNeeds(page); for (const year of [1,3,5]) await expect(need(page, year)).toHaveValue(""); await expect(goalStatus(page)).toHaveValue("UNKNOWN");
  await expect(page.getByRole("link", { name: "Tài sản & dự phòng Quỹ dự phòng khẩn cấp & tài sản có sẵn" })).toHaveAttribute("href", "/user/profile?section=assets"); expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});
test("save persists care, cumulative needs and a complete goal before navigating to the plan", async ({ page, request }) => {
  const state = await setup(page, request); await care(page).selectOption("BOTH"); await openNeeds(page);
  await need(page, 1).fill("0"); await need(page, 3).fill("100.000.000"); await need(page, 5).fill("150.000.000");
  const row = await addGoal(page); await row.getByLabel("Bạn muốn dùng tiền vào việc gì?", { exact: true }).fill("Quỹ học vấn");
  await row.getByLabel("Cần bao nhiêu tiền (theo giá hiện tại)?", { exact: true }).fill("100.000.000,25"); await row.getByLabel("Khi nào bạn cần dùng số tiền này?", { exact: true }).fill("10/2027");
  await row.getByLabel("Mức ưu tiên của mục tiêu", { exact: true }).selectOption("FLEXIBLE"); await row.getByLabel("Nếu chưa đủ tiền, có thể lùi thời gian không?", { exact: true }).selectOption("yes");
  await row.locator(".planning-goal-inflation>summary").click(); await row.getByLabel("Cách quy đổi giá mục tiêu", { exact: true }).selectOption("KNOWN"); await row.getByLabel("Lạm phát riêng (%/năm)", { exact: true }).fill("3,25");
  await save(page); const record = await state.record(); expect(record.revision).toBe(2); expect(record.data).toMatchObject({ personal: { careResponsibility: known("BOTH") }, liquidityNeeds: { y1: known("0"), y3: known("100000000"), y5: known("150000000") } });
  expect(record.data.goals.entries[0]).toMatchObject({ label: "Quỹ học vấn", amountToday: known("100000000.25"), dueMonth: known("2027-10"), inflation: known("3.25"), priority: known("FLEXIBLE"), deferrable: { status: "KNOWN", value: true } });
  await returnToForm(page); await expect(need(page, 1)).toHaveValue("0"); await expect(rows(page).first().getByLabel("Bạn muốn dùng tiền vào việc gì?", { exact: true })).toHaveValue("Quỹ học vấn");
});
test("editing care retains every existing goal, legacy priority and unknown metadata", async ({ page, request }) => {
  const state = await setup(page, request, { personal: personal(), goals: savedGoals() }), before = await state.record();
  await care(page).selectOption("OTHER"); await save(page); const after = await state.record(); expect(after.data.goals).toEqual(before.data.goals); expect(after.data.personal).toMatchObject({ dependents: known(7), maritalStatus: "DIVORCED", careResponsibility: known("OTHER") });
  await returnToForm(page); await expect(rows(page)).toHaveCount(2); await expect(rows(page).nth(1).getByLabel("Mức ưu tiên của mục tiêu", { exact: true })).toHaveValue("LEGACY");
});
test("unrelated edits keep existing incomplete and zero-value goals without forcing guessed data", async ({ page, request }) => {
  const existing = { status: "KNOWN", entries: [{ ...goal("pending"), amountToday: { status: "UNKNOWN" }, dueMonth: { status: "UNKNOWN" } }, { ...goal("zero"), amountToday: known("0") }] };
  const state = await setup(page, request, { goals: existing }); await care(page).selectOption("BOTH"); await openNeeds(page); await need(page, 1).fill("100"); await save(page);
  expect((await state.record()).data.goals).toEqual(existing); await returnToForm(page); await expect(rows(page).first().getByLabel("Cần bao nhiêu tiền (theo giá hiện tại)?", { exact: true })).toHaveValue("");
});
test("blank, zero and large decimal cash needs survive reload without floating point conversion", async ({ page, request }) => {
  const state = await setup(page, request); await openNeeds(page); await need(page, 1).fill("0"); await need(page, 5).fill("9.007.199.254.740.993,25"); await save(page);
  expect((await state.record()).data.liquidityNeeds).toEqual({ y1: known("0"), y3: { status: "UNKNOWN" }, y5: known("9007199254740993.25") });
  await returnToForm(page); await expect(need(page, 5)).toHaveValue("9.007.199.254.740.993,25"); await expect(need(page, 3)).toHaveValue("");
});
test("decreasing cumulative needs open the group, focus the error and make no write", async ({ page, request }) => {
  const state = await setup(page, request); await openNeeds(page); await need(page, 1).fill("20"); await need(page, 5).fill("10"); await panel(page).locator(":scope>summary").click();
  await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Nhu cầu lũy kế không được giảm"); await expect(need(page, 5)).toBeFocused(); expect(state.writes).toEqual([]);
});
test("incomplete goals, non-positive amounts and past dates are refused without losing the draft", async ({ page, request }) => {
  const state = await setup(page, request); const row = await addGoal(page); await row.getByLabel("Bạn muốn dùng tiền vào việc gì?", { exact: true }).fill("Sửa nhà");
  await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Mục tiêu cần có số tiền lớn hơn 0");
  await row.getByLabel("Cần bao nhiêu tiền (theo giá hiện tại)?", { exact: true }).fill("0"); await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Mục tiêu cần có số tiền lớn hơn 0");
  await row.getByLabel("Cần bao nhiêu tiền (theo giá hiện tại)?", { exact: true }).fill("100"); await row.getByLabel("Khi nào bạn cần dùng số tiền này?", { exact: true }).fill("09/2026");
  await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Chọn tháng cần tiền"); await expect(row.getByLabel("Khi nào bạn cần dùng số tiền này?", { exact: true })).toBeFocused(); expect(state.writes).toEqual([]);
});
test("invalid custom inflation expands its details and focuses the field", async ({ page, request }) => {
  const state = await setup(page, request, { goals: savedGoals() }); await openNeeds(page); const row = rows(page).first(); await row.locator(".planning-goal-inflation>summary").click();
  await row.getByLabel("Lạm phát riêng (%/năm)", { exact: true }).fill("-100"); await row.locator(".planning-goal-inflation>summary").click();
  await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Lạm phát phải lớn hơn -100%"); await expect(row.getByLabel("Lạm phát riêng (%/năm)", { exact: true })).toBeFocused(); expect(state.writes).toEqual([]);
});
test("removal confirms draft-only changes, cancel restores focus and discard restores all saved goals", async ({ page, request }) => {
  const state = await setup(page, request, { goals: savedGoals() }); await openNeeds(page); const trigger = page.getByRole("button", { name: "Xóa mục tiêu 1", exact: true }); await trigger.click();
  await expect(dialog(page)).toHaveAccessibleName("Bỏ mục tiêu khỏi bản đang chỉnh?"); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog(page).getByRole("button", { name: "Bỏ khỏi bản đang chỉnh", exact: true }).click(); await expect(rows(page)).toHaveCount(1); expect(state.writes).toEqual([]);
  await page.getByRole("button", { name: "Hủy thay đổi", exact: true }).click(); await expect(rows(page)).toHaveCount(2); expect((await state.record()).revision).toBe(1);
});
test("clearing all goals requires confirmation and confirmed none stays distinct from unknown", async ({ page, request }) => {
  const state = await setup(page, request, { goals: savedGoals() }); await openNeeds(page); await goalStatus(page).selectOption("NOT_APPLICABLE"); await expect(dialog(page)).toHaveAccessibleName("Bỏ toàn bộ danh sách đang chỉnh?");
  await dialog(page).getByRole("button", { name: "Giữ lại", exact: true }).click(); await expect(rows(page)).toHaveCount(2); await expect(goalStatus(page)).toHaveValue("KNOWN");
  await goalStatus(page).selectOption("NOT_APPLICABLE"); await dialog(page).getByRole("button", { name: "Bỏ khỏi bản đang chỉnh", exact: true }).click(); await save(page); expect((await state.record()).data.goals.status).toBe("NOT_APPLICABLE");
  await returnToForm(page); await goalStatus(page).selectOption("UNKNOWN"); await save(page); expect((await state.record()).data.goals).toEqual({ status: "UNKNOWN" });
});
test("failed saves retain drafts, stay on the form and retry commits once", async ({ page, request }) => {
  const state = await setup(page, request); let fail = true; await page.route("**/api/v1/me/financial-profile/planning", route => fail && route.request().method() === "PATCH" ? route.fulfill({ status: 503, json: { error: { code: "TEMPORARY", message: "Tạm thời chưa lưu được" } } }) : route.fallback());
  await care(page).selectOption("BOTH"); await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("Tạm thời chưa lưu được"); await expect(page).toHaveURL(/section=constraints/); await expect(care(page)).toHaveValue("BOTH");
  fail = false; await save(page); expect(state.writes).toHaveLength(1);
});
test("revision conflicts retain the draft and reload the authoritative planning record", async ({ page, request }) => {
  const state = await setup(page, request); await care(page).selectOption("BOTH");
  const response = await request.patch(`${api}/api/v1/me/financial-profile/planning`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: { expectedRevision: 1, careResponsibility: known("SELF"), liquidityNeeds: { y1: { status: "UNKNOWN" }, y3: { status: "UNKNOWN" }, y5: { status: "UNKNOWN" } }, goals: { status: "UNKNOWN" } } }); expect(response.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Lưu và xem kế hoạch", exact: true }).click(); await expect(page.getByRole("alert")).toBeVisible(); await expect(care(page)).toHaveValue("BOTH"); expect(state.writes[0].status).toBe(409);
  await page.getByRole("button", { name: "Tải lại hồ sơ", exact: true }).click(); await expect(care(page)).toHaveValue("SELF"); await expect(help(page)).toBeEnabled();
});
test("planning edits mark the main plan stale and preserve every financial cashflow and applied version", async ({ page, request }) => {
  const state = await setup(page, request, {}, true), before = await state.record(); await care(page).selectOption("BOTH"); await openNeeds(page); await need(page, 1).fill("10.000.000"); await save(page);
  const after = await state.record(); expect(after.data.expenses).toEqual(before.data.expenses); expect(after.data.income).toEqual(before.data.income); expect(after.summary).toEqual(before.summary); expect(await state.get(`retirement/plans/${state.fixture.plan.id}`)).toMatchObject({ stale: true, currentVersionId: state.fixture.plan.versionId });
});
test("saved-data popup explains cumulative totals and restores focus; English covers both groups", async ({ page, request }) => {
  const state = await setup(page, request, { liquidityNeeds: { y1: known("0"), y3: { status: "UNKNOWN" }, y5: known("150000000") } }); await expect(help(page)).toBeEnabled(); await help(page).click();
  await expect(dialog(page)).toContainText("không phải ba khoản chi độc lập"); await expect(dialog(page)).toContainText("0 ₫"); await expect(dialog(page)).toContainText("Chưa xác định"); await page.keyboard.press("Escape"); await expect(help(page)).toBeFocused();
  await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click(); await page.getByRole("menuitemradio", { name: "English", exact: true }).click(); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Other goals"); await openNeeds(page); await expect(page.getByLabel("Within 1 year", { exact: true })).toHaveValue("0"); expect(state.errors).toEqual([]);
});
test("report failure hides saved figures and its retry recovers without writing", async ({ page, request }) => {
  const state = await setup(page, request); let fail = true; await page.route("**/api/v1/me/financial-profile/planning", route => fail && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: { code: "REPORT_UNAVAILABLE", message: "Chưa tải được báo cáo mục tiêu" } } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tải được báo cáo mục tiêu"); await expect(help(page)).toBeDisabled(); await expect(care(page)).toBeVisible(); await care(page).selectOption("BOTH"); fail = false; await page.getByRole("button", { name: "Thử lại báo cáo", exact: true }).click(); await expect(help(page)).toBeEnabled(); await expect(care(page)).toHaveValue("BOTH"); expect(state.writes).toEqual([]);
});
test("empty, failed and legacy profiles offer an appropriate next action without showing a stale editor", async ({ page, request }) => {
  await setup(page, request); let mode = "NONE"; await page.route("**/api/v1/me/financial-profile", route => mode === "NONE" ? route.fulfill({ json: { data: null } }) : mode === "ERROR" ? route.fulfill({ status: 503, json: { error: { code: "PROFILE_UNAVAILABLE", message: "Chưa tải được hồ sơ" } } }) : mode === "LEGACY" ? route.fulfill({ json: { data: defaultMockProfile() } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("link", { name: "Khai báo hồ sơ", exact: true })).toHaveAttribute("href", "/onboarding"); await expect(care(page)).toHaveCount(0);
  mode = "ERROR"; await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tải được hồ sơ"); await expect(care(page)).toHaveCount(0);
  mode = "LEGACY"; await page.getByRole("button", { name: "Thử lại", exact: true }).click(); await expect(page.getByRole("button", { name: "Chuyển hồ sơ", exact: true })).toBeVisible(); await expect(care(page)).toHaveCount(0);
});
for (const [name, width, height] of [["desktop", 1440, 1000], ["laptop", 1024, 768], ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740], ["landscape", 844, 390]] as const) {
  test(`planning form and popups fit ${name}`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height }); const state = await setup(page, request, { goals: savedGoals(), liquidityNeeds: { y1: known("0"), y3: known("100000000"), y5: known("150000000") } });
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await expect(help(page)).toBeEnabled(); await fits(); await page.screenshot({ path: testInfo.outputPath("planning-page.png"), fullPage: true }); await openNeeds(page); await fits(); await page.screenshot({ path: testInfo.outputPath("planning-expanded.png"), fullPage: true }); await rows(page).first().getByLabel("Cần bao nhiêu tiền (theo giá hiện tại)?", { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath("planning-goal-fields.png") });
    await help(page).click(); await fits(); expect(await dialog(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy(); await page.screenshot({ path: testInfo.outputPath("planning-help-top.png") }); await dialog(page).getByRole("link", { name: "Xem phân bổ tài sản", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath("planning-help-bottom.png") }); await page.keyboard.press("Escape"); await expect(help(page)).toBeFocused();
    await page.getByRole("button", { name: "Xóa mục tiêu 1", exact: true }).click(); await fits(); await page.screenshot({ path: testInfo.outputPath("planning-remove.png") }); await page.keyboard.press("Escape"); expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
  });
}
