import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from "./helpers";

const api = "http://127.0.0.1:55442", known = (value: string | number) => ({ status: "KNOWN", value });
const expense = (changes: object = {}) => ({ id: "support", label: "Hỗ trợ bố mẹ", category: "DEPENDENT", amount: known("3000000"), currency: "VND", startMonth: "2026-01", endMonth: null, frequency: "MONTHLY", ...changes });
async function setup(page: Page, request: APIRequestContext, changes: object = {}, withPlan = false) {
  const response = await request.post(`${api}/__fixture/reset`, { data: { changes, withPlan } }); expect(response.ok()).toBeTruthy(); const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_API", message: "No family fixture" } } }));
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
  await page.goto("/user/profile?section=family"); await expect(page.getByRole("heading", { level: 1, name: "Gia đình & người phụ thuộc" })).toBeVisible();
  const get = async (path: string) => (await (await request.get(`${api}/api/v1/me/${path}`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data;
  return { fixture, writes, errors, get, record: () => get("financial-profile") };
}
const count = (page: Page) => page.getByLabel("Số người phụ thuộc tài chính", { exact: true });
const marital = (page: Page) => page.getByLabel("Tình trạng hôn nhân", { exact: true });
const save = async (page: Page) => {
  const response = page.waitForResponse(r => r.url().endsWith("/me/financial-profile/family") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Lưu thông tin gia đình", exact: true }).click(); expect((await response).status()).toBe(200);
};
const info = (page: Page) => page.getByRole("button", { name: "Xem cách tính khoản chi hỗ trợ", exact: true });
const dialog = (page: Page) => page.getByRole("dialog");

test("unknown family data remains blank and no support expenses is an explicit zero", async ({ page, request }) => {
  const state = await setup(page, request); await expect(count(page)).toHaveValue(""); await expect(marital(page)).toHaveValue("");
  await expect(page.getByTestId("family-support")).toHaveText("0 ₫"); expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});
test("divorce and an exact count above four persist through reload and appear in the finance hub", async ({ page, request }) => {
  const state = await setup(page, request); await marital(page).selectOption("DIVORCED"); await count(page).fill("7");
  await page.getByRole("button", { name: "Từ 4 người; có thể nhập số chính xác", exact: true }).click(); await expect(count(page)).toHaveValue("7");
  await save(page); await page.reload(); await expect(count(page)).toHaveValue("7"); await expect(marital(page)).toHaveValue("DIVORCED");
  expect((await state.record()).data.personal).toMatchObject({ maritalStatus: "DIVORCED", dependents: known(7) });
  await page.getByRole("link", { name: "← Quay lại Tài chính của bạn", exact: true }).click();
  await expect(page.locator('article[aria-labelledby="finance-topic-family"]')).toContainText("Đã ly hôn"); await expect(page.locator('article[aria-labelledby="finance-topic-family"]')).toContainText("7 người");
});
test("zero and withheld declarations stay distinct and clearing does not restore old values", async ({ page, request }) => {
  const state = await setup(page, request); await marital(page).selectOption("MARRIED"); await page.getByRole("button", { name: "0 người phụ thuộc", exact: true }).click(); await save(page);
  await expect(count(page)).toHaveValue("0"); expect((await state.record()).data.personal.dependents).toEqual(known(0));
  await marital(page).selectOption(""); await count(page).fill(""); await save(page); await page.reload();
  await expect(marital(page)).toHaveValue(""); await expect(count(page)).toHaveValue(""); expect((await state.record()).data.personal).toMatchObject({ maritalStatus: null, dependents: { status: "UNKNOWN" } });
});
test("up to thirty dependents are saved without changing expenses or applying the main plan", async ({ page, request }) => {
  const state = await setup(page, request, {}, true), before = await state.record(); await count(page).fill("30"); await save(page); await expect(count(page)).toHaveValue("30");
  const after = await state.record(); expect(after.data.expenses).toEqual(before.data.expenses); expect(after.data.income).toEqual(before.data.income); expect(after.summary).toEqual(before.summary);
  expect(await state.get(`retirement/plans/${state.fixture.plan.id}`)).toMatchObject({ stale: true, currentVersionId: state.fixture.plan.versionId });
});
test("invalid counts focus the field and never produce a successful write", async ({ page, request }) => {
  const state = await setup(page, request);
  for (const value of ["-1", "31", "1.5", "abc"]) { await count(page).fill(value); await page.getByRole("button", { name: "Lưu thông tin gia đình", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("số nguyên từ 0 đến 30"); await expect(count(page)).toBeFocused(); }
  expect(state.writes).toEqual([]); expect((await state.record()).revision).toBe(1);
});
test("discard restores saved declarations without a network mutation", async ({ page, request }) => {
  const state = await setup(page, request); await count(page).fill("7"); await marital(page).selectOption("OTHER");
  await page.getByRole("button", { name: "Hủy thay đổi", exact: true }).click(); await expect(count(page)).toHaveValue(""); await expect(marital(page)).toHaveValue(""); expect(state.writes).toEqual([]);
});
test("failed saves retain the draft and retry writes only once", async ({ page, request }) => {
  const state = await setup(page, request); let fail = true;
  await page.route("**/api/v1/me/financial-profile/family", route => fail && route.request().method() === "PATCH" ? route.fulfill({ status: 503, json: { error: { code: "TEMPORARY", message: "Tạm thời chưa lưu được" } } }) : route.fallback());
  await count(page).fill("7"); await page.getByRole("button", { name: "Lưu thông tin gia đình", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Tạm thời chưa lưu được"); await expect(count(page)).toHaveValue("7"); expect(state.writes).toHaveLength(0);
  fail = false; await save(page); expect((await state.record()).data.personal.dependents).toEqual(known(7)); expect(state.writes).toHaveLength(1);
});
test("a revision conflict retains the draft and reloads the authoritative family", async ({ page, request }) => {
  const state = await setup(page, request); await count(page).fill("7");
  const response = await request.patch(`${api}/api/v1/me/financial-profile/family`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: { expectedRevision: 1, maritalStatus: "MARRIED", dependents: known(2) } }); expect(response.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Lưu thông tin gia đình", exact: true }).click(); await expect(page.getByRole("alert")).toBeVisible(); await expect(count(page)).toHaveValue("7"); expect(state.writes[0].status).toBe(409);
  await page.getByRole("button", { name: "Tải lại hồ sơ", exact: true }).click(); await expect(count(page)).toHaveValue("2"); await expect(marital(page)).toHaveValue("MARRIED");
});
test("support uses only active dependent expenses and its details restore keyboard focus", async ({ page, request }) => {
  const state = await setup(page, request, { expenses: { status: "KNOWN", entries: [expense(), expense({ id: "once", label: "Học phí tháng này", amount: known("2000000"), frequency: "ONCE", startMonth: "2026-10", endMonth: "2026-10" }), expense({ id: "future", label: "Khoản hỗ trợ năm sau", startMonth: "2027-01" }), expense({ id: "living", category: "ESSENTIAL", label: "Sinh hoạt", amount: known("16000000") })] } });
  await expect(page.getByTestId("family-support")).toHaveText("5.000.000 ₫"); await info(page).click();
  await expect(dialog(page)).toHaveAccessibleName("Khoản chi hỗ trợ được tính thế nào?"); await expect(dialog(page)).toContainText("Học phí tháng này"); await expect(dialog(page)).toContainText("Ngoài kỳ hồ sơ"); await expect(dialog(page)).not.toContainText("Sinh hoạt");
  await page.keyboard.press("Escape"); await expect(info(page)).toBeFocused(); expect(state.writes).toEqual([]);
  await page.getByRole("link", { name: "Xem khoản chi hỗ trợ", exact: true }).click(); await expect(page).toHaveURL(/section=cashflow/);
});
test("incomplete and foreign expenses stay undetermined without inventing conversion", async ({ page, request }) => {
  await setup(page, request, { expenses: { status: "KNOWN", entries: [expense({ currency: "USD" })] } });
  await expect(page.getByTestId("family-support")).toHaveText("Chưa xác định"); await info(page).click(); await expect(dialog(page)).toContainText("3000000 USD"); await page.keyboard.press("Escape");
  await setup(page, request, { expenses: { status: "UNKNOWN" } }); await expect(page.getByTestId("family-support")).toHaveText("Chưa xác định"); await info(page).click(); await expect(dialog(page)).toContainText("chưa kết luận khoản hỗ trợ bằng 0");
});
test("report failure shows no stale total and retry restores the current report", async ({ page, request }) => {
  await setup(page, request, { expenses: { status: "KNOWN", entries: [expense()] } }); let fail = true;
  await page.route("**/api/v1/me/financial-profile/family", route => fail && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: { code: "REPORT_UNAVAILABLE", message: "Chưa tải được khoản hỗ trợ" } } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tải được khoản hỗ trợ"); await expect(page.getByTestId("family-support")).toHaveText("Chưa xác định"); await expect(info(page)).toBeDisabled();
  fail = false; await page.getByRole("button", { name: "Thử lại", exact: true }).click(); await expect(page.getByTestId("family-support")).toHaveText("3.000.000 ₫");
});
test("English labels and the other-goals navigation work", async ({ page, request }) => {
  const state = await setup(page, request); await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click(); await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Family & dependents"); await expect(page.getByLabel("Marital status", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Review other goals", exact: true }).click(); await expect(page).toHaveURL(/section=constraints/); expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
});
test("empty profiles and load failures hide the family form and offer a working next action", async ({ page, request }) => {
  const state = await setup(page, request); let mode = "NONE";
  await page.route("**/api/v1/me/financial-profile", route => mode === "NONE" ? route.fulfill({ json: { data: null } }) : mode === "ERROR" ? route.fulfill({ status: 503, json: { error: { code: "PROFILE_UNAVAILABLE", message: "Chưa tải được hồ sơ" } } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("heading", { name: "Bạn chưa có hồ sơ tài chính", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Khai báo hồ sơ", exact: true })).toHaveAttribute("href", "/onboarding"); await expect(count(page)).toHaveCount(0);
  mode = "ERROR"; await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tải được hồ sơ"); await expect(count(page)).toHaveCount(0); await expect(page.getByTestId("family-support")).toHaveCount(0);
  mode = "REAL"; await page.getByRole("button", { name: "Thử lại", exact: true }).click(); await expect(count(page)).toBeVisible(); await expect(page.getByTestId("family-support")).toHaveText("0 ₫"); expect(state.writes).toHaveLength(0);
});
test("legacy profiles offer an explicit upgrade instead of silently changing declaration schemas", async ({ page, request }) => {
  const state = await setup(page, request);
  await page.route("**/api/v1/me/financial-profile", route => route.fulfill({ json: { data: defaultMockProfile() } })); await page.reload();
  await expect(page.getByRole("button", { name: "Chuyển hồ sơ", exact: true })).toBeVisible(); await expect(count(page)).toHaveCount(0); await expect(info(page)).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
for (const [name, width, height] of [["desktop", 1440, 1000], ["laptop", 1024, 768], ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740], ["landscape", 844, 390]] as const) {
  test(`family page and support popup fit ${name}`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height }); const state = await setup(page, request, { expenses: { status: "KNOWN", entries: [expense({ label: "Hỗ trợ học phí và sinh hoạt cho bố mẹ cùng các con đang đi học" })] } });
    await expect(page.getByTestId("family-support")).toHaveText("3.000.000 ₫");
    if (width > 650) {
      const left = await marital(page).boundingBox(), right = await count(page).boundingBox();
      expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
    }
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await fits(); await page.screenshot({ path: testInfo.outputPath("family-page.png"), fullPage: true }); await info(page).click(); await expect(dialog(page)).toBeVisible(); await fits();
    expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy(); await page.screenshot({ path: testInfo.outputPath("family-support-top.png") });
    await dialog(page).getByRole("link", { name: "Quản lý khoản chi", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath("family-support-bottom.png") });
    await page.keyboard.press("Escape"); await expect(info(page)).toBeFocused(); expect(state.errors).toEqual([]); expect(state.writes).toEqual([]);
  });
}
