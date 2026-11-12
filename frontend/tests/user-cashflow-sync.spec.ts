import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";

const api = process.env.USER_CASHFLOW_API ?? "http://127.0.0.1:55442";
const known = (value: string) => ({ status: "KNOWN", value });
async function setup(page: Page, request: APIRequestContext, changes: object = {}, withPlan = false) {
  const reset = await request.post(`${api}/__fixture/reset`, { data: { changes, withPlan } });
  expect(reset.ok()).toBeTruthy();
  const fixture = await reset.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_TEST_API", message: "No fixture" } } }));
  await installRouteAuth(page, "USR-001", fixture.accessToken);
  await installFinancialProfileRoutes(page, { profile: fixture.profile });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route("**/socket.io/**", route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const writes: Array<{ path: string; body: any; status: number }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(withPlan ? /\/api\/v1\/me\/(financial-profile|retirement\/(plans|preview))([/?]|$)/ : /\/api\/v1\/me\/financial-profile([/?]|$)/, async route => {
    const outgoing = route.request();
    const url = new URL(outgoing.url());
    const response = await route.fetch({ url: api + url.pathname + url.search, headers: { ...outgoing.headers(), Authorization: `Bearer ${fixture.accessToken}` } });
    if (outgoing.method() !== "GET") writes.push({ path: new URL(outgoing.url()).pathname, body: outgoing.postDataJSON(), status: response.status() });
    await route.fulfill({ response });
  });
  await page.goto("/user/profile?section=cashflow");
  await expect(page.getByRole("heading", { level: 1, name: "Thu nhập & chi tiêu" })).toBeVisible();
  return { fixture, writes, errors,
    record: async () => (await (await request.get(`${api}/api/v1/me/financial-profile`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data,
  };
}
const ledger = (page: Page, group: "income" | "expenses") => page.locator(`.cashflow-ledger[aria-labelledby="cashflow-${group}"]`);
const dialog = (page: Page) => page.getByRole("dialog");
async function add(page: Page, group: "income" | "expenses", label: string, amount: string, split = false) {
  await ledger(page, group).getByRole("button", { name: group === "income" ? "＋ Thêm nguồn thu" : "＋ Thêm khoản chi" }).click();
  await dialog(page).getByLabel("Tên khoản", { exact: true }).fill(label);
  if (!split && await dialog(page).getByLabel("Khoản này đã nằm trong số tổng ban đầu chưa?", { exact: true }).count())
    await dialog(page).getByLabel("Khoản này đã nằm trong số tổng ban đầu chưa?", { exact: true }).selectOption("");
  await dialog(page).getByLabel("Số tiền mỗi tháng", { exact: true }).fill(amount);
}

test("real API: split, add, edit and delete persist through reload and update the hub", async ({ page, request }) => {
  const state = await setup(page, request);
  await expect(ledger(page, "income").locator("li")).toContainText("Thu khả dụng");
  await expect(ledger(page, "expenses")).toContainText("Sinh hoạt");
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("20.000.000 ₫");
  await add(page, "income", "Cho thuê nhà", "4.000.000", true);
  await expect(dialog(page).getByRole("status").last()).toContainText("16.000.000 ₫");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(ledger(page, "income").locator("li")).toHaveCount(2);
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("20.000.000 ₫");
  await add(page, "expenses", "Ăn uống", "3.000.000");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(ledger(page, "expenses").locator(".cashflow-total strong").last()).toHaveText("19.000.000 ₫");
  await ledger(page, "income").getByRole("button", { name: "Sửa Cho thuê nhà", exact: true }).click();
  await dialog(page).getByLabel("Số tiền mỗi tháng", { exact: true }).fill("5.000.000");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("21.000.000 ₫");
  await ledger(page, "expenses").getByRole("button", { name: "Xóa Ăn uống", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Hủy", exact: true }).click();
  expect(state.writes).toHaveLength(3);
  await ledger(page, "expenses").getByRole("button", { name: "Xóa Ăn uống", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Xóa khoản", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await page.reload();
  await expect(ledger(page, "income")).toContainText("Cho thuê nhà");
  await expect(ledger(page, "expenses")).not.toContainText("Ăn uống");
  expect((await state.record()).summary.values).toMatchObject({ monthlyIncome: "21000000", monthlyExpense: "16000000", availableMonthlySurplus: "5000000" });
  await page.getByRole("link", { name: "← Quay lại Tài chính của bạn", exact: true }).click();
  await expect(page.locator(".finance-summary-metric.is-income > strong")).toHaveText("21.000.000 ₫");
  await expect(page.locator(".finance-summary-metric.is-surplus > strong")).toHaveText("5.000.000 ₫");
  expect(state.writes.map(write => write.body.command?.kind)).toEqual(["SPLIT", "ADD", "UPDATE", "DELETE"]);
  expect(state.errors).toEqual([]);
});

test("split validation, cancel, focus and time controls preserve the original schedule", async ({ page, request }) => {
  const state = await setup(page, request);
  const trigger = ledger(page, "income").getByRole("button", { name: "＋ Thêm nguồn thu" });
  await add(page, "income", "Khoản quá lớn", "20.000.001", true);
  await expect(dialog(page).getByLabel("Tên khoản", { exact: true })).not.toBeEmpty();
  await expect(dialog(page).getByLabel("Tháng bắt đầu", { exact: true })).toHaveValue("2026-01");
  await expect(dialog(page).getByLabel("Tháng bắt đầu", { exact: true })).toBeDisabled();
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("vượt số còn lại");
  expect(state.writes).toHaveLength(0);
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  expect((await state.record()).revision).toBe(1);
});

test("unknown groups, explicit zero and confirming none are saved as distinct API states", async ({ page, request }) => {
  const state = await setup(page, request, { income: { status: "UNKNOWN" }, expenses: { status: "UNKNOWN" } });
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("Chưa xác định");
  await ledger(page, "expenses").getByRole("button", { name: "Xác nhận không có", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(ledger(page, "expenses").locator(".cashflow-total strong").last()).toHaveText("0 ₫");
  await add(page, "income", "Chưa nhận lương", "0");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Xác nhận đã kê đầy đủ");
  await dialog(page).getByRole("checkbox", { name: "Tôi xác nhận danh sách sau khi lưu đã kê đầy đủ nhóm này." }).check();
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("0 ₫");
  const record = await state.record();
  expect(record.data.expenses.status).toBe("NOT_APPLICABLE");
  expect(record.data.income.entries[0].amount).toEqual(known("0"));
});

test("stability cancel and save use the real API and persist after reload", async ({ page, request }) => {
  const state = await setup(page, request, { incomeStability: known("STABLE") });
  const select = page.getByLabel("Thu nhập của bạn thường thế nào? (không bắt buộc)", { exact: true });
  await expect(select).toHaveValue("STABLE");
  await select.selectOption("VARIABLE");
  const form = select.locator("..");
  await form.getByRole("button", { name: "Hủy", exact: true }).click(); await expect(select).toHaveValue("STABLE");
  expect(state.writes).toHaveLength(0);
  await select.selectOption("UNCERTAIN");
  await page.getByRole("button", { name: "Lưu thông tin thu nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lưu thông tin thu nhập", exact: true })).toBeDisabled();
  await page.reload(); await expect(select).toHaveValue("UNCERTAIN");
  expect((await state.record()).data.incomeStability).toEqual(known("UNCERTAIN"));
});

test("failed saves keep the editor and do not claim success; retry commits once", async ({ page, request }) => {
  const state = await setup(page, request); let fail = true, attempts = 0;
  await page.route("**/api/v1/me/financial-profile/cashflow", async route => {
    attempts++;
    if (fail) return route.fulfill({ status: 503, json: { error: { code: "TEST_UNAVAILABLE", message: "Chưa lưu được khoản kiểm thử." } } });
    await route.fallback();
  });
  await add(page, "income", "Thu nhập mới", "1.000.000");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Chưa lưu được khoản kiểm thử");
  await expect(dialog(page).getByLabel("Tên khoản", { exact: true })).toHaveValue("Thu nhập mới");
  expect((await state.record()).revision).toBe(1);
  fail = false;
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect((await state.record()).revision).toBe(2); expect(attempts).toBe(2);
});

test("a concurrent API update returns 409 and preserves the user's unsaved editor", async ({ page, request }) => {
  const state = await setup(page, request);
  await add(page, "income", "Khoản chưa lưu", "1.000.000");
  const external = await request.patch(`${api}/api/v1/me/financial-profile`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: { expectedRevision: 1, changes: { schemaVersion: 2, incomeStability: known("VARIABLE") } } });
  expect(external.ok()).toBeTruthy();
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Dữ liệu đã thay đổi");
  await expect(dialog(page).getByLabel("Tên khoản", { exact: true })).toHaveValue("Khoản chưa lưu");
  expect((await state.record()).data.income.entries).toHaveLength(1);
  await dialog(page).getByRole("button", { name: "Tải lại hồ sơ", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByLabel("Thu nhập của bạn thường thế nào? (không bắt buộc)", { exact: true })).toHaveValue("VARIABLE");
});

test("one-time, future and large amounts use server totals and retain schedules", async ({ page, request }) => {
  const state = await setup(page, request);
  await add(page, "income", "Thưởng một lần", "5.000.000");
  await dialog(page).getByText("Thời gian và tần suất", { exact: true }).click();
  await dialog(page).getByRole("combobox", { name: "Tần suất", exact: true }).selectOption("ONCE");
  await dialog(page).getByLabel("Tháng bắt đầu", { exact: true }).fill("2026-11");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("20.000.000 ₫");
  await expect(ledger(page, "income")).toContainText("Ngoài kỳ hồ sơ");
  const record = await state.record();
  expect(record.data.income.entries[1]).toMatchObject({ frequency: "ONCE", startMonth: "2026-11", endMonth: "2026-11" });
  await ledger(page, "income").getByRole("button", { name: "Sửa Thu khả dụng", exact: true }).click();
  await dialog(page).getByLabel("Số tiền mỗi tháng", { exact: true }).fill("9.007.199.254.740.993,25");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("9.007.199.254.740.993,25 ₫");
});

test("real saved plan: budget uses projected reserve, caps deposits, and never applies profile or reserve edits automatically", async ({ page, request }) => {
  const state = await setup(page, request, {}, true);
  const focus = page.locator(".cashflow-budget-focus");
  await expect(focus.locator(":scope > strong")).toContainText("3.000.000 ₫");
  await expect(focus.locator("dd")).toHaveText(["5.000.000 ₫", "3.000.000 ₫"]);
  await expect(focus).toContainText("2.000.000 ₫ vượt ngân sách");
  await page.getByRole("button", { name: "Điều chỉnh tiền dành cho việc khác", exact: true }).click();
  await dialog(page).getByLabel("Số tiền mỗi tháng (VND)", { exact: true }).fill("5000000");
  await dialog(page).getByRole("button", { name: "Cập nhật bản nháp", exact: true }).click();
  await expect(focus.locator(":scope > strong")).toContainText("Chưa xác định");
  await expect(page.locator(".cashflow-budget-status")).toHaveText("Cần bù từ quỹ");
  await expect(focus.locator(":scope > strong")).toContainText("0 ₫");
  await expect(focus).toContainText("Cần rút 1.000.000 ₫");
  await expect(focus.locator("dd")).toHaveText(["5.000.000 ₫", "0 ₫"]);
  await ledger(page, "expenses").getByRole("button", { name: "Sửa Sinh hoạt", exact: true }).click();
  await dialog(page).getByLabel("Số tiền mỗi tháng", { exact: true }).fill("15.000.000");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".cashflow-budget-status")).toHaveText("Thu chi cân đối");
  await expect(focus.locator("dd")).toHaveText(["5.000.000 ₫", "0 ₫"]);
  const unchanged = await request.get(`${api}/api/v1/me/retirement/plans/${state.fixture.plan.id}`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` } });
  const plan = (await unchanged.json()).data;
  expect(plan.currentVersionId).toBe(state.fixture.plan.versionId);
  expect(plan.stale).toBe(true);
  expect(state.writes.filter(write => /\/(apply|versions)$/.test(write.path))).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("foreign currency keeps totals unknown through API reload", async ({ page, request }) => {
  const state = await setup(page, request);
  await add(page, "income", "Ngoại tệ", "1.000");
  await dialog(page).getByText("Thời gian và tần suất", { exact: true }).click();
  await dialog(page).getByLabel("Tiền tệ", { exact: true }).fill("USD");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("Chưa xác định");
  await expect(ledger(page, "income")).toContainText("1000 USD");
  await page.reload(); await expect(page.locator(".cashflow-budget-income strong")).toHaveText("Chưa xác định");
  expect((await state.record()).summary.values.monthlyIncome).toBeNull();
});

test("English labels and money follow the shared language menu", async ({ page, request }) => {
  await setup(page, request);
  await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /English/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Income & expenses");
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("20,000,000 ₫");
  await ledger(page, "income").getByRole("button", { name: "+ Add income", exact: true }).click();
  await expect(dialog(page)).toHaveAccessibleName("Add income");
  await expect(dialog(page).getByLabel("Item name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
});

test("reserve edits persist as plan drafts without writing or applying a main plan", async ({ page, request }) => {
  const state = await setup(page, request);
  await expect(page.getByTestId("cashflow-reserve")).toHaveText("Chưa xác định");
  await page.getByRole("button", { name: "Điều chỉnh tiền dành cho việc khác", exact: true }).click();
  await dialog(page).getByLabel("Số tiền mỗi tháng (VND)", { exact: true }).fill("2000000");
  await dialog(page).getByRole("button", { name: "Cập nhật bản nháp", exact: true }).click();
  await expect(page.getByTestId("cashflow-reserve")).toHaveText("2.000.000 ₫");
  await page.reload(); await expect(page.getByTestId("cashflow-reserve")).toHaveText("2.000.000 ₫");
  expect(state.writes).toHaveLength(0); expect((await state.record()).revision).toBe(1);
});

test("load errors hide all figures, retry reaches the API, and an absent profile offers onboarding", async ({ page, request }) => {
  const state = await setup(page, request); let failed = true;
  await page.route("**/api/v1/me/financial-profile", async route => failed
    ? route.fulfill({ status: 503, json: { error: { code: "PROFILE_UNAVAILABLE", message: "Chưa tải được hồ sơ" } } })
    : route.fallback());
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Chưa tải được hồ sơ");
  await expect(page.locator(".cashflow-budget")).toHaveCount(0);
  failed = false; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator(".cashflow-budget-income strong")).toHaveText("20.000.000 ₫");
  await page.route("**/api/v1/me/financial-profile", route => route.fulfill({ json: { data: null } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Bạn chưa có hồ sơ tài chính", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Khai báo hồ sơ", exact: true })).toHaveAttribute("href", "/onboarding");
  await expect(page.locator(".cashflow-budget")).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

for (const [width, height] of [[1440, 1000], [1024, 768], [768, 1024], [390, 844], [320, 568], [844, 390]]) {
  test(`cashflow page and entry/confirmation dialogs fit ${width}x${height}`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height }); const state = await setup(page, request);
    await expect(page.locator(".cashflow-ledger")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath("cashflow-page.png"), fullPage: true });
    await add(page, "expenses", "Chi phí gia đình", "1.000.000", true);
    const box = await dialog(page).boundingBox(); expect(box).toBeTruthy(); expect(box!.width).toBeLessThanOrEqual(width); expect(box!.height).toBeLessThanOrEqual(height);
    expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("cashflow-entry.png") });
    await page.keyboard.press("Escape");
    await ledger(page, "expenses").getByRole("button", { name: "Xóa Sinh hoạt", exact: true }).click();
    await expect(dialog(page).getByRole("button", { name: "Hủy", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(state.errors).toEqual([]); expect(state.writes).toHaveLength(0);
  });
}
