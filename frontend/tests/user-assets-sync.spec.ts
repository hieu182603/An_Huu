import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
const api = "http://127.0.0.1:55442", known = (value: string) => ({ status: "KNOWN", value });
async function setup(page: Page, request: APIRequestContext, changes: object = {}, withPlan = false) {
  const response = await request.post(`${api}/__fixture/reset`, { data: { changes, withPlan } });
  expect(response.ok()).toBeTruthy(); const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_TEST_API", message: "No asset fixture" } } }));
  await installRouteAuth(page); await installFinancialProfileRoutes(page, { profile: fixture.profile });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route("**/socket.io/**", route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const writes: Array<{ path: string; body: any; status: number }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(withPlan ? /\/api\/v1\/me\/(financial-profile|retirement\/(plans|preview))([/?]|$)/ : /\/api\/v1\/me\/financial-profile([/?]|$)/, async route => {
    const outgoing = route.request(), url = new URL(outgoing.url());
    const res = await route.fetch({ url: api + url.pathname + url.search, headers: { ...outgoing.headers(), Authorization: `Bearer ${fixture.accessToken}` } });
    if (outgoing.method() !== "GET") writes.push({ path: url.pathname, body: outgoing.postDataJSON(), status: res.status() });
    await route.fulfill({ response: res });
  });
  await page.goto("/user/profile?section=assets");
  await expect(page.getByRole("heading", { level: 1, name: "Tài sản & quỹ dự phòng" })).toBeVisible();
  return { fixture, writes, errors,
    report: async () => (await (await request.get(`${api}/api/v1/me/financial-profile/assets`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data,
    record: async () => (await (await request.get(`${api}/api/v1/me/financial-profile`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data,
  };
}
const dialog = (page: Page) => page.getByRole("dialog");
const structure = (page: Page) => page.locator(".assets-structure");
async function add(page: Page, name: string, value: string, split = false) {
  await page.getByRole("button", { name: "＋ Thêm tài sản", exact: true }).click();
  await dialog(page).getByLabel("Tên tài sản", { exact: true }).fill(name);
  const source = dialog(page).getByRole("combobox", { name: "Khoản này đã nằm trong số tổng ban đầu chưa?", exact: true });
  if (!split && await source.count()) await source.selectOption("");
  await dialog(page).getByLabel("Tổng giá trị tài sản", { exact: true }).fill(value);
}
async function save(page: Page) {
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}
test("real API split/add/edit/delete/reload updates all asset totals and the finance hub", async ({ page, request }) => {
  const state = await setup(page, request);
  await expect(page.getByTestId("assets-owned")).toHaveText("100.000.000 ₫");
  await expect(page.getByTestId("assets-coverage")).toHaveText("1,9 tháng");
  await add(page, "Dự phòng riêng", "20.000.000", true);
  await dialog(page).getByRole("combobox", { name: "Khoản này dùng để làm gì?", exact: true }).selectOption("emergencyShare");
  await expect(dialog(page).getByRole("status").last()).toContainText("80.000.000 ₫");
  await save(page);
  await expect(page.getByTestId("assets-declared")).toHaveText("100.000.000 ₫");
  await expect(structure(page)).toContainText("44.000.000 ₫");
  await add(page, "Nhà gia đình", "200.000.000");
  await dialog(page).getByRole("combobox", { name: "Khoản này dùng để làm gì?", exact: true }).selectOption("HOME");
  await dialog(page).getByLabel("Bạn sở hữu bao nhiêu phần trăm tài sản này?", { exact: true }).fill("50");
  await save(page);
  await expect(page.getByTestId("assets-declared")).toHaveText("300.000.000 ₫");
  await expect(page.getByTestId("assets-owned")).toHaveText("200.000.000 ₫");
  await expect(structure(page)).toContainText("48.000.000 ₫");
  await page.getByRole("button", { name: "Sửa Dự phòng riêng", exact: true }).click();
  await dialog(page).getByLabel("Tổng giá trị tài sản", { exact: true }).fill("30.000.000"); await save(page);
  await expect(page.getByTestId("assets-owned")).toHaveText("210.000.000 ₫");
  await page.getByRole("button", { name: "Xóa Nhà gia đình", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Hủy", exact: true }).click(); expect(state.writes).toHaveLength(3);
  await page.getByRole("button", { name: "Xóa Nhà gia đình", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Xóa tài sản", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId("assets-owned")).toHaveText("110.000.000 ₫");
  expect((await state.report()).totals).toMatchObject({ declaredValue: "110000000", ownedValue: "110000000", retirementLiquidAssets: "48000000", emergencyReserve: "54000000" });
  await page.getByRole("link", { name: "← Quay lại Tài chính của bạn", exact: true }).click();
  await expect(page.locator('article[aria-labelledby="finance-topic-assets"]')).toContainText("54.000.000 ₫");
  expect(state.writes.map(write => write.body.command.kind)).toEqual(["SPLIT", "ADD", "UPDATE", "DELETE"]); expect(state.errors).toEqual([]);
});
test("unknown, explicit none and last-asset deletion preserve distinct API states", async ({ page, request }) => {
  const state = await setup(page, request, { assets: { status: "UNKNOWN" } });
  await expect(page.getByTestId("assets-owned")).toHaveText("Chưa xác định");
  await add(page, "Tài sản bằng không", "0");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Xác nhận đã kê đầy đủ");
  await dialog(page).getByRole("checkbox", { name: "Tôi xác nhận danh sách sau khi lưu đã kê đầy đủ tài sản.", exact: true }).check();
  await save(page); await expect(page.getByTestId("assets-owned")).toHaveText("0 ₫");
  await page.getByRole("button", { name: "Xóa Tài sản bằng không", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Xóa tài sản", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  expect((await state.record()).data.assets).toEqual({ status: "KNOWN", entries: [] });
  expect((await state.report()).totals.ownedValue).toBe("0");
});
test("confirming no assets writes NOT_APPLICABLE and zero coverage", async ({ page, request }) => {
  const state = await setup(page, request, { assets: { status: "UNKNOWN" } });
  await page.getByRole("button", { name: "Xác nhận không có tài sản", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Xác nhận", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId("assets-owned")).toHaveText("0 ₫"); await expect(page.getByTestId("assets-coverage")).toHaveText("0,0 tháng");
  expect((await state.record()).data.assets.status).toBe("NOT_APPLICABLE");
});
test("allocation, overdraw and cancel validation do not write invalid data", async ({ page, request }) => {
  const state = await setup(page, request);
  await add(page, "Vượt số gốc", "100.000.001", true);
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("không vượt số còn lại");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByLabel("Phần dành cho nghỉ hưu (%)", { exact: true }).fill("80");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("phải bằng 100%");
  await dialog(page).getByLabel("Phần dành cho nghỉ hưu (%)", { exact: true }).fill("60");
  await dialog(page).getByLabel("Ngày định giá", { exact: true }).fill("");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Điền ngày định giá");
  await page.keyboard.press("Escape"); expect(state.writes).toHaveLength(0); expect((await state.record()).revision).toBe(1);
});
test("locked and future assets are owned wealth but not current retirement or reserve money", async ({ page, request }) => {
  const state = await setup(page, request);
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByRole("combobox", { name: "Thanh khoản", exact: true }).selectOption("LOCKED"); await save(page);
  await expect(page.getByTestId("assets-owned")).toHaveText("100.000.000 ₫");
  expect((await state.report()).totals).toMatchObject({ retirementLiquidAssets: "0", emergencyReserve: "0", otherOwnedValue: "100000000" });
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByRole("combobox", { name: "Thanh khoản", exact: true }).selectOption("LIQUID");
  await dialog(page).getByLabel("Tháng có thể sử dụng", { exact: true }).fill("2026-11"); await save(page);
  await expect(page.getByTestId("assets-coverage")).toHaveText("0,0 tháng"); expect((await state.report()).totals.retirementLiquidAssets).toBe("0");
});
test("stale valuation and foreign currency remain unknown rather than fallback amounts", async ({ page, request }) => {
  const state = await setup(page, request);
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByLabel("Ngày định giá", { exact: true }).fill("2026-10-03"); await save(page);
  await expect(page.getByTestId("assets-owned")).toHaveText("Chưa xác định"); await expect(page.getByTestId("assets-net-worth")).toHaveText("Chưa xác định");
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByLabel("Ngày định giá", { exact: true }).fill("2026-10-04");
  await dialog(page).getByLabel("Tiền tệ", { exact: true }).fill("USD"); await save(page);
  await page.reload(); await expect(page.getByTestId("assets-owned")).toHaveText("Chưa xác định"); expect((await state.report()).totals.netWorth).toBeNull();
});
test("cost basis is retained on edits and proportionally divided on splits", async ({ page, request }) => {
  const state = await setup(page, request);
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByText("Giá vốn và thông tin bổ sung", { exact: true }).click();
  await dialog(page).getByRole("checkbox", { name: "Khai giá vốn", exact: true }).check();
  await dialog(page).getByRole("checkbox", { name: "Chưa xác định giá vốn", exact: true }).uncheck();
  await dialog(page).getByLabel("Giá vốn", { exact: true }).fill("90.000.000"); await save(page);
  await add(page, "Tách có giá vốn", "20.000.000", true); await save(page);
  expect((await state.record()).data.assets.entries.map((asset: any) => asset.costBasis)).toEqual([known("72000000"), known("18000000")]);
});
test("save failures and revision conflicts preserve the editor; reload fetches the current revision", async ({ page, request }) => {
  const state = await setup(page, request); let failed = true;
  await page.route("**/api/v1/me/financial-profile/assets", route => route.request().method() === "PATCH" && failed
    ? route.fulfill({ status: 503, json: { error: { code: "WRITE_FAILED", message: "Chưa lưu được tài sản kiểm thử" } } }) : route.fallback());
  await add(page, "Khoản đang nhập", "1.000.000");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Chưa lưu được tài sản kiểm thử");
  expect((await state.record()).revision).toBe(1); failed = false;
  await request.patch(`${api}/api/v1/me/financial-profile`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: { expectedRevision: 1, changes: { schemaVersion: 2, incomeStability: known("VARIABLE") } } });
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Dữ liệu đã thay đổi");
  await expect(dialog(page).getByLabel("Tên tài sản", { exact: true })).toHaveValue("Khoản đang nhập");
  await dialog(page).getByRole("button", { name: "Tải lại hồ sơ", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId("assets-owned")).toHaveText("100.000.000 ₫");
  await add(page, "Khoản sau tải lại", "1.000.000"); await save(page); expect((await state.record()).revision).toBe(3);
});
test("failed reports hide old totals and retry without changing the profile", async ({ page, request }) => {
  const state = await setup(page, request); let failed = true;
  await page.route("**/api/v1/me/financial-profile/assets", route => failed ? route.fulfill({ status: 503, json: { error: { code: "REPORT_FAILED", message: "Chưa tải được phân bổ" } } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tải được phân bổ");
  await expect(page.getByTestId("assets-owned")).toHaveText("Chưa xác định");
  failed = false; await page.getByRole("button", { name: "Thử lại phân bổ", exact: true }).click();
  await expect(page.getByTestId("assets-owned")).toHaveText("100.000.000 ₫"); expect(state.writes).toHaveLength(0);
});
test("partial unknown allocations remain editable and a delayed report cannot show the previous revision", async ({ page, request }) => {
  const state = await setup(page, request);
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByRole("combobox", { name: "Khoản này dùng để làm gì?", exact: true }).selectOption("CUSTOM");
  await dialog(page).getByRole("checkbox", { name: "Chưa xác định: Phần dự phòng (%)", exact: true }).check();
  await save(page); await expect(page.getByTestId("assets-coverage")).toHaveText("Chưa xác định");
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await expect(dialog(page).getByRole("combobox", { name: "Khoản này dùng để làm gì?", exact: true })).toHaveValue("CUSTOM");
  await expect(dialog(page).getByRole("checkbox", { name: "Chưa xác định: Phần dự phòng (%)", exact: true })).toBeChecked();
  await dialog(page).getByRole("checkbox", { name: "Chưa xác định: Phần dự phòng (%)", exact: true }).uncheck();
  await dialog(page).getByLabel("Phần dự phòng (%)", { exact: true }).fill("30");
  await page.route("**/api/v1/me/financial-profile/assets", async route => { if (route.request().method() === "GET") await new Promise(resolve => setTimeout(resolve, 700)); await route.fallback(); });
  await dialog(page).getByLabel("Tổng giá trị tài sản", { exact: true }).fill("200.000.000"); await save(page);
  await expect(page.getByTestId("assets-owned")).toHaveText("Chưa xác định");
  await expect(page.getByTestId("assets-owned")).toHaveText("200.000.000 ₫");
  expect((await state.record()).revision).toBe(3);
});
test("large values retain VND precision and net-worth details trap focus and restore it", async ({ page, request }) => {
  await setup(page, request);
  await page.getByRole("button", { name: "Sửa Tiền gửi", exact: true }).click();
  await dialog(page).getByLabel("Tổng giá trị tài sản", { exact: true }).fill("9.007.199.254.740.993,25"); await save(page);
  await expect(page.getByTestId("assets-declared")).toHaveText("9.007.199.254.740.993 ₫");
  const trigger = page.getByRole("button", { name: "Giải thích tài sản ròng", exact: true }); await trigger.click();
  await expect(dialog(page)).toContainText("tài sản thuộc sở hữu của bạn − phần dư nợ");
  await page.keyboard.press("Shift+Tab"); await expect(dialog(page).getByRole("link", { name: "Rà soát khoản nợ", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(dialog(page).getByRole("button", { name: "Đóng modal", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
});
test("zero living expenses have no infinite month ratio and language switching covers the page and editor", async ({ page, request }) => {
  await setup(page, request, { expenses: { status: "KNOWN", entries: [] } });
  await expect(page.getByTestId("assets-coverage")).toHaveText("Chi sinh hoạt bằng 0; không tính số tháng");
  await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click(); await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Assets & emergency reserve");
  await expect(page.getByTestId("assets-owned")).toHaveText("100,000,000 ₫");
  await page.getByRole("button", { name: "+ Add asset", exact: true }).click(); await expect(dialog(page)).toHaveAccessibleName("Add asset");
  await expect(dialog(page).getByLabel("Asset name", { exact: true })).toBeFocused();
});
test("asset changes leave the applied plan version unchanged", async ({ page, request }) => {
  const state = await setup(page, request, {}, true);
  await add(page, "Tài sản của kế hoạch", "10.000.000"); await save(page);
  const response = await request.get(`${api}/api/v1/me/retirement/plans/${state.fixture.plan.id}`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` } });
  expect((await response.json()).data).toMatchObject({ currentVersionId: state.fixture.plan.versionId, stale: true });
  expect(state.writes.every(write => write.path.endsWith("/financial-profile/assets"))).toBeTruthy();
});
test("empty profiles and load failures hide assets; profile retry returns real totals", async ({ page, request }) => {
  await setup(page, request); let mode = "NONE";
  await page.route("**/api/v1/me/financial-profile", route => mode === "NONE" ? route.fulfill({ json: { data: null } }) : mode === "ERROR" ? route.fulfill({ status: 503, json: { error: { code: "PROFILE_UNAVAILABLE", message: "Chưa tải được hồ sơ" } } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("heading", { name: "Bạn chưa có hồ sơ tài chính", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Khai báo hồ sơ", exact: true })).toHaveAttribute("href", "/onboarding");
  await expect(page.getByTestId("assets-owned")).toHaveCount(0);
  mode = "ERROR"; await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tải được hồ sơ");
  await expect(page.getByTestId("assets-owned")).toHaveCount(0);
  mode = "REAL"; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByTestId("assets-owned")).toHaveText("100.000.000 ₫");
});
for (const [width, height] of [[1440, 1000], [1024, 768], [768, 1024], [390, 844], [320, 568], [844, 390]]) {
  test(`assets and dialogs fit ${width}x${height}`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height }); const state = await setup(page, request);
    await expect(page.getByTestId("assets-owned")).toHaveText("100.000.000 ₫");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath("assets-page.png"), fullPage: true });
    await add(page, "Tài sản gia đình", "1.000.000", true);
    const box = await dialog(page).boundingBox(); expect(box!.width).toBeLessThanOrEqual(width); expect(box!.height).toBeLessThanOrEqual(height);
    await dialog(page).locator(".modal-body").evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath("asset-entry-top.png") });
    await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("asset-entry.png") });
    expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Xóa Tiền gửi", exact: true }).click();
    await expect(dialog(page).getByRole("button", { name: "Hủy", exact: true })).toBeVisible(); await page.keyboard.press("Escape");
    expect(state.errors).toEqual([]); expect(state.writes).toHaveLength(0);
  });
}
