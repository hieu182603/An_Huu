import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
const api = "http://127.0.0.1:55442", known = (value: string) => ({ status: "KNOWN", value }), unknown = { status: "UNKNOWN" };
const pension = { status: "KNOWN", monthlyAmount: "5000000", currency: "VND", priceBasis: "NOMINAL_AT_START", basisMonth: "2050-05", source: "Mức tự khai đã lưu", estimatedOn: "2026-10-04", adjustment: { kind: "NONE" } };
const historyDocument = () => ({ schemaVersion: 1, birth: { precision: "UNKNOWN", declaredValue: null }, legalSex: "UNKNOWN", coverageFrom: "2026-01", coverageThrough: "2026-03", confirmedThroughMonth: "2026-03", months: ["2026-01", "2026-02", "2026-03"].map(month => ({ month, scheme: "COMPULSORY", salaryRegime: "EMPLOYER", status: "PAID", contributionBase: "10000000", evidence: [] as Array<{ reference: string; contentHash: string; confirmedOn: string }> })), specialPeriods: [] });
async function setup(page: Page, request: APIRequestContext, changes: object = {}, history?: object, withPlan = false) {
  const response = await request.post(`${api}/__fixture/reset`, { data: { changes, historyDocument: history, withPlan } }); expect(response.ok()).toBeTruthy(); const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_API", message: "No insurance fixture" } } }));
  await installRouteAuth(page); await installFinancialProfileRoutes(page, { profile: fixture.profile });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route("**/socket.io/**", route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const writes: Array<{ path: string; body: any; key?: string; status: number }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/\/api\/v1\/me\/(financial-profile|pension|assumptions|retirement\/(plans|preview|pension-impact))([/?]|$)/, async route => {
    const outgoing = route.request(), url = new URL(outgoing.url());
    const res = await route.fetch({ url: api + url.pathname + url.search, headers: { ...outgoing.headers(), Authorization: `Bearer ${fixture.accessToken}` } });
    if (outgoing.method() !== "GET") writes.push({ path: url.pathname, body: outgoing.postDataJSON(), key: outgoing.headers()["idempotency-key"], status: res.status() });
    await route.fulfill({ response: res });
  });
  await page.goto("/user/profile?section=insurance"); await expect(page.getByRole("heading", { level: 1, name: "BHXH và nguồn lương hưu" })).toBeVisible();
  const get = async (path: string) => (await (await request.get(`${api}/api/v1/me/${path}`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data;
  return { fixture, writes, errors, record: () => get("financial-profile"), history: () => get("pension/history/periods"), get };
}
const declaration = (page: Page) => page.locator(".insurance-declaration"), dialog = (page: Page) => page.getByRole("dialog");
async function openHistory(page: Page) { await page.locator(".insurance-history>summary").click(); }
async function addPeriod(page: Page, from = "2026-01", through = "2026-03", amount = "10.000.000") {
  await page.getByRole("button", { name: "Thêm giai đoạn đóng BHXH", exact: true }).click();
  await dialog(page).getByLabel("Từ tháng", { exact: true }).fill(from); await dialog(page).getByLabel("Đến tháng", { exact: true }).fill(through);
  await dialog(page).getByLabel("Mức lương / thu nhập làm căn cứ đóng", { exact: true }).fill(amount);
}
async function savePeriod(page: Page) { await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await expect(dialog(page)).toHaveCount(0); }
async function knownPension(page: Page, amount = "5.000.000", start = "2050-05", basis = "NOMINAL_AT_START") {
  await declaration(page).getByLabel("Bạn đã biết mức lương hưu chưa?", { exact: true }).selectOption("KNOWN");
  await declaration(page).getByLabel("Lương hưu dự kiến / tháng", { exact: true }).fill(amount);
  await declaration(page).getByRole("checkbox", { name: "Chưa xác định tháng bắt đầu nhận", exact: true }).uncheck();
  await declaration(page).getByLabel("Tháng bắt đầu nhận", { exact: true }).fill(start); await declaration(page).getByLabel("Giá cơ sở của số tiền", { exact: true }).selectOption(basis);
}
async function savePension(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/me/financial-profile/pension") && response.request().method() === "PATCH");
  await declaration(page).getByRole("button", { name: "Lưu và dùng trong bản tính", exact: true }).click(); expect((await response).status()).toBe(200);
}
test("initial data is unknown instead of fixed zero years, age sixty or a fabricated capital reduction", async ({ page, request }) => {
  const state = await setup(page, request); await expect(page.getByTestId("insurance-history")).toHaveText("Chưa kê khai"); await expect(page.getByTestId("insurance-amount")).toHaveText("Chưa xác định"); await expect(page.getByTestId("insurance-start")).toHaveText("Chưa xác định"); await expect(page.getByTestId("insurance-reduction")).toHaveText("Chưa so sánh"); await expect(page.getByTestId("insurance-current")).toHaveText("Chưa xác định"); expect(state.writes).toHaveLength(0); expect(state.errors).toEqual([]);
});
test("period CRUD persists versioned history, leaves gaps unknown and preserves a pension draft", async ({ page, request }) => {
  const state = await setup(page, request); await knownPension(page, "7.000.000"); await openHistory(page); await addPeriod(page); await savePeriod(page);
  await expect(page.getByTestId("insurance-history")).toHaveText("0 năm 3 tháng"); await expect(declaration(page).getByLabel("Lương hưu dự kiến / tháng", { exact: true })).toHaveValue("7.000.000");
  await addPeriod(page, "2026-05", "2026-06", "8.000.000"); await dialog(page).getByLabel("Hình thức", { exact: true }).selectOption("VOLUNTARY"); await savePeriod(page);
  expect(await state.history()).toMatchObject({ historyRevision: 2, declaredContributionMonths: 5, unknownMonths: 1 });
  await page.getByRole("button", { name: "Sửa giai đoạn 01/2026", exact: true }).click(); await dialog(page).getByLabel("Mức lương / thu nhập làm căn cứ đóng", { exact: true }).fill("12.000.000"); await savePeriod(page);
  await page.getByRole("button", { name: "Xóa giai đoạn 05/2026", exact: true }).click(); await dialog(page).getByRole("button", { name: "Hủy", exact: true }).click(); expect(state.writes).toHaveLength(3);
  await page.getByRole("button", { name: "Xóa giai đoạn 05/2026", exact: true }).click(); await dialog(page).getByRole("button", { name: "Xóa giai đoạn", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId("insurance-history")).toHaveText("0 năm 3 tháng"); expect((await state.record()).revision).toBe(1); expect((await state.record()).data.pension).toBeUndefined();
  const report = await state.history(); expect(report).toMatchObject({ historyRevision: 4, declaredContributionMonths: 3, unknownMonths: 3 }); expect(report.periods[0].details.contributionBase).toBe("12000000"); expect(state.errors).toEqual([]);
});
test("overlapping periods are refused by the real API and retain the form", async ({ page, request }) => {
  const state = await setup(page, request, {}, historyDocument()); await openHistory(page); await addPeriod(page, "2026-02", "2026-04");
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await expect(dialog(page).getByRole("alert")).toContainText("trùng lịch sử"); await expect(dialog(page).getByLabel("Từ tháng", { exact: true })).toHaveValue("2026-02"); expect(state.writes[0].status).toBe(422); expect((await state.history()).historyRevision).toBe(1);
});
test("zero, unknown and large contribution bases retain their meaning", async ({ page, request }) => {
  const state = await setup(page, request); await openHistory(page); await addPeriod(page, "2026-01", "2026-01", "0"); await savePeriod(page); expect((await state.history()).periods[0].details.contributionBase).toBe("0");
  await addPeriod(page, "2026-03", "2026-03"); await dialog(page).getByRole("checkbox", { name: "Chưa xác định mức làm căn cứ đóng", exact: true }).check(); await savePeriod(page); expect((await state.history()).periods[1].details.contributionBase).toBeNull();
  await addPeriod(page, "2026-05", "2026-05", "9.007.199.254.740.993,25"); await savePeriod(page); expect((await state.history()).periods[2].details.contributionBase).toBe("9007199254740993.25");
});
test("evidenced periods open the detailed history editor without destructive basic edits", async ({ page, request }) => {
  const document = historyDocument(); document.months.forEach(row => { row.evidence = [{ reference: "Original evidence", contentHash: "f".repeat(64), confirmedOn: "2026-10-01" }]; });
  const state = await setup(page, request, {}, document); await openHistory(page); await expect(page.getByRole("button", { name: /Sửa giai đoạn/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Xem chi tiết", exact: true }).click(); await expect(dialog(page)).toHaveAccessibleName("Quản lý Bảo hiểm xã hội & Ước tính lương hưu"); await expect(dialog(page).getByRole("button", { name: /Quá trình đóng BHXH/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape"); expect((await state.history()).periods[0].details.evidence[0].contentHash).toBe("f".repeat(64)); expect(state.writes).toHaveLength(0); expect(state.errors).toEqual([]);
});
test("known pension saves a complete declaration and explicit start with no age sixty default", async ({ page, request }) => {
  const state = await setup(page, request); await knownPension(page, "6.000.000", "2051-02"); await savePension(page); await expect(page.getByTestId("insurance-amount")).toHaveText("6.000.000 ₫"); await expect(page.getByTestId("insurance-start")).toHaveText("02/2051"); await expect(page.getByTestId("insurance-current")).toHaveText("0 ₫");
  expect((await state.record()).data.pension).toMatchObject({ status: "KNOWN", monthlyAmount: "6000000", currency: "VND", priceBasis: "NOMINAL_AT_START", basisMonth: "2051-02", adjustment: { kind: "NONE" } }); expect((await state.record()).data.personal.pensionStartMonth).toEqual(known("2051-02")); expect((await state.history()).historyRevision).toBe(0);
});
test("no pension, unknown pension and known zero remain three distinct persisted states", async ({ page, request }) => {
  const state = await setup(page, request); await declaration(page).getByLabel("Bạn đã biết mức lương hưu chưa?", { exact: true }).selectOption("NOT_APPLICABLE"); await savePension(page); await expect(page.getByTestId("insurance-amount")).toHaveText("Không có lương hưu"); expect((await state.record()).data.pension.status).toBe("NOT_APPLICABLE");
  await declaration(page).getByLabel("Bạn đã biết mức lương hưu chưa?", { exact: true }).selectOption("UNKNOWN"); await savePension(page); await expect(page.getByTestId("insurance-amount")).toHaveText("Chưa xác định"); expect((await state.record()).data.pension).toEqual(unknown);
  await declaration(page).getByLabel("Bạn đã biết mức lương hưu chưa?", { exact: true }).selectOption("KNOWN"); await declaration(page).getByLabel("Lương hưu dự kiến / tháng", { exact: true }).fill("0"); await savePension(page); await expect(page.getByTestId("insurance-amount")).toHaveText("0 ₫"); expect((await state.record()).data.pension.status).toBe("KNOWN");
});
test("today's price conversion requires assumptions and never invents annual indexation", async ({ page, request }) => {
  const state = await setup(page, request); await knownPension(page, "5.000.000", "2030-01", "TODAY"); await savePension(page);
  await page.locator(".insurance-projection-section>summary").click(); await page.getByLabel("Xem từ tháng", { exact: true }).fill("2030-01"); await page.getByLabel("Số tháng xem trước", { exact: true }).fill("2"); await page.getByRole("button", { name: "Xem dòng lương hưu", exact: true }).click();
  await expect(page.locator(".insurance-preview-result")).toContainText("Cần chọn bộ giả định lạm phát"); await expect(page.locator(".insurance-preview-table tbody tr")).toHaveCount(2); await expect(page.locator(".insurance-preview-table tbody")).toContainText("Chưa xác định"); expect((await state.record()).data.pension.adjustment).toEqual({ kind: "NONE" });
});
test("explicit adjustments are saved and used by the backend monthly pension engine", async ({ page, request }) => {
  const state = await setup(page, request); await knownPension(page, "5.000.000", "2030-01"); await declaration(page).locator("details>summary").click();
  await declaration(page).getByRole("checkbox", { name: "Có lịch điều chỉnh đã xác định", exact: true }).check(); await declaration(page).getByRole("button", { name: "Thêm kỳ điều chỉnh", exact: true }).click();
  await declaration(page).getByLabel("Tháng điều chỉnh", { exact: true }).fill("2030-02"); await declaration(page).getByLabel("Mức hưởng sau điều chỉnh", { exact: true }).fill("6.000.000"); await declaration(page).getByLabel("Nguồn điều chỉnh", { exact: true }).fill("Thông báo đã ghi nhận"); await savePension(page);
  await page.locator(".insurance-projection-section>summary").click(); await page.getByLabel("Xem từ tháng", { exact: true }).fill("2030-01"); await page.getByLabel("Số tháng xem trước", { exact: true }).fill("3"); await page.getByRole("button", { name: "Xem dòng lương hưu", exact: true }).click();
  await expect(page.locator(".insurance-preview-table tbody tr td:last-child")).toHaveText(["5.000.000 ₫", "6.000.000 ₫", "6.000.000 ₫"]); expect((await state.record()).data.pension.adjustment.entries[0].source).toBe("Thông báo đã ghi nhận");
  await page.getByLabel("Số tháng xem trước", { exact: true }).fill("4"); await expect(page.locator(".insurance-preview-result")).toHaveCount(0);
});
test("failed pension writes preserve input and only report success after persistence", async ({ page, request }) => {
  const state = await setup(page, request); let fail = true;
  await page.route("**/api/v1/me/financial-profile/pension", route => fail && route.request().method() === "PATCH" ? route.fulfill({ status: 503, json: { error: { code: "TEMPORARY", message: "Tạm thời chưa lưu được" } } }) : route.fallback());
  await knownPension(page, "7.000.000"); await declaration(page).getByRole("button", { name: "Lưu và dùng trong bản tính", exact: true }).click(); await expect(declaration(page).getByRole("alert")).toContainText("Tạm thời chưa lưu được"); await expect(declaration(page).getByLabel("Lương hưu dự kiến / tháng", { exact: true })).toHaveValue("7.000.000"); expect(state.writes).toHaveLength(0);
  fail = false; await savePension(page); await expect(page.getByTestId("insurance-amount")).toHaveText("7.000.000 ₫"); expect(state.writes).toHaveLength(1);
});
test("pension revision conflicts retain the draft and reload the current profile", async ({ page, request }) => {
  const state = await setup(page, request); await knownPension(page, "7.000.000");
  const response = await request.patch(`${api}/api/v1/me/financial-profile/pension`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: { expectedRevision: 1, pension: { ...pension, monthlyAmount: "6000000" }, pensionStartMonth: known("2050-05") } }); expect(response.ok()).toBeTruthy();
  await declaration(page).getByRole("button", { name: "Lưu và dùng trong bản tính", exact: true }).click(); await expect(declaration(page).getByRole("alert")).toBeVisible(); await expect(declaration(page).getByLabel("Lương hưu dự kiến / tháng", { exact: true })).toHaveValue("7.000.000"); expect(state.writes[0].status).toBe(409);
  await declaration(page).getByRole("button", { name: "Tải lại hồ sơ", exact: true }).click(); await expect(page.getByTestId("insurance-amount")).toHaveText("6.000.000 ₫");
});
test("history revision conflicts never silently overwrite another period", async ({ page, request }) => {
  const state = await setup(page, request); await openHistory(page); await addPeriod(page, "2026-05", "2026-06");
  const response = await request.patch(`${api}/api/v1/me/pension/history/periods`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}`, "Idempotency-Key": crypto.randomUUID() }, data: { expectedHistoryRevision: 0, command: { kind: "ADD", entry: { fromMonth: "2026-01", toMonth: "2026-03", scheme: "COMPULSORY", salaryRegime: "EMPLOYER", contributionBase: "10000000" } } } }); expect(response.ok()).toBeTruthy();
  await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await expect(dialog(page).getByRole("alert")).toContainText("đã thay đổi"); expect(state.writes[0].status).toBe(409);
  await dialog(page).getByRole("button", { name: "Tải lại lịch sử", exact: true }).click(); await expect(page.getByTestId("insurance-history")).toHaveText("0 năm 3 tháng"); expect((await state.history()).periods).toHaveLength(1);
});
test("a lost history response reuses the idempotency key instead of appending twice", async ({ page, request }) => {
  const state = await setup(page, request); let lose = true, firstKey = "";
  await page.route("**/api/v1/me/pension/history/periods", async route => {
    if (route.request().method() !== "PATCH" || !lose) return route.fallback(); lose = false; firstKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch({ url: `${api}/api/v1/me/pension/history/periods`, headers: { ...route.request().headers(), Authorization: `Bearer ${state.fixture.accessToken}` } }); expect(response.status()).toBe(200);
    await route.fulfill({ status: 503, json: { error: { code: "LOST_RESPONSE", message: "Chưa nhận được kết quả lưu" } } });
  });
  await openHistory(page); await addPeriod(page); await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).click(); await expect(dialog(page).getByRole("alert")).toContainText("Chưa nhận được kết quả"); await savePeriod(page); expect((await state.history()).historyRevision).toBe(1); expect(state.writes[0].key).toBe(firstKey);
});
test("history report failure keeps pension declaration available and retry does not show fabricated zero history", async ({ page, request }) => {
  await setup(page, request, {}, historyDocument()); let fail = true;
  await page.route("**/api/v1/me/pension/history/periods", route => fail && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: { code: "HISTORY_UNAVAILABLE", message: "Chưa tải được lịch sử" } } }) : route.fallback());
  await page.reload(); await openHistory(page); await expect(page.getByRole("alert")).toContainText("Chưa tải được lịch sử"); await expect(page.getByTestId("insurance-history")).toHaveText("Chưa xác định"); await expect(declaration(page).getByLabel("Bạn đã biết mức lương hưu chưa?", { exact: true })).toBeVisible();
  fail = false; await page.getByRole("button", { name: "Thử lại lịch sử", exact: true }).click(); await expect(page.getByTestId("insurance-history")).toHaveText("0 năm 3 tháng");
});
test("pension edits only mark the applied plan stale while history edits keep the declaration unchanged", async ({ page, request }) => {
  const state = await setup(page, request, {}, undefined, true); await knownPension(page); await savePension(page); await expect(page.getByTestId("insurance-amount")).toHaveText("5.000.000 ₫");
  expect(await state.get(`retirement/plans/${state.fixture.plan.id}`)).toMatchObject({ currentVersionId: state.fixture.plan.versionId, stale: true });
  await openHistory(page); await addPeriod(page); await savePeriod(page); expect((await state.record()).data.pension.monthlyAmount).toBe("5000000"); expect((await state.record()).revision).toBe(2);
});
test("English labels, formatted amounts and keyboard focus work across the page and period dialog", async ({ page, request }) => {
  const state = await setup(page, request); await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click(); await page.getByRole("menuitemradio", { name: "English", exact: true }).click(); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Social insurance and pension income");
  await page.locator(".insurance-history>summary").click(); const trigger = page.getByRole("button", { name: "Add contribution period", exact: true }); await trigger.click(); await expect(dialog(page).getByLabel("From month", { exact: true })).toBeFocused(); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused(); expect(state.errors).toEqual([]); expect(state.writes).toHaveLength(0);
});
test("capital reduction compares the same published model with and without pension and never applies it", async ({ page, request }) => {
  const state = await setup(page, request, {}, undefined, true); await knownPension(page, "1.000.000", "2027-01"); await savePension(page);
  const compare = page.getByRole("button", { name: "So sánh cùng bản tính", exact: true }); await expect(compare).toBeVisible();
  const response = page.waitForResponse(response => response.url().endsWith("/me/retirement/pension-impact")); await compare.click(); const result = await (await response).json();
  expect(result.data).toMatchObject({ status: "READY", profileRevision: 2, requiredFundWithPension: "0", requiredFundWithoutPension: "300", fundReduction: "300" });
  await expect(page.getByTestId("insurance-reduction")).toHaveText("300 ₫"); await page.getByRole("button", { name: "Xem phép đối chiếu", exact: true }).click(); await expect(dialog(page)).toHaveAccessibleName("Ảnh hưởng lương hưu tới quỹ"); await expect(dialog(page)).toContainText("Không có lương hưu");
  await page.screenshot({ path: test.info().outputPath("insurance-impact.png") }); await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Xem phép đối chiếu", exact: true })).toBeFocused();
  expect((await state.record()).revision).toBe(2); expect(await state.get(`retirement/plans/${state.fixture.plan.id}`)).toMatchObject({ currentVersionId: state.fixture.plan.versionId, stale: true });
  await declaration(page).getByLabel("Lương hưu dự kiến / tháng", { exact: true }).fill("2.000.000"); await savePension(page); await expect(page.getByTestId("insurance-reduction")).toHaveText("Chưa so sánh");
});
for (const [name, width, height] of [["desktop", 1440, 1000], ["laptop", 1024, 768], ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740], ["landscape", 844, 390]] as const) {
  test(`insurance page and popups fit ${name}`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height }); const state = await setup(page, request, {}, historyDocument()); await expect(page.getByTestId("insurance-history")).toHaveText("0 năm 3 tháng");
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy(); await fits(); await page.screenshot({ path: testInfo.outputPath("insurance-page.png"), fullPage: true });
    await openHistory(page); await page.getByRole("button", { name: "Sửa giai đoạn 01/2026", exact: true }).click(); await expect(dialog(page).getByLabel("Từ tháng", { exact: true })).toBeFocused(); await fits(); expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy(); await page.screenshot({ path: testInfo.outputPath("insurance-period-top.png") });
    await dialog(page).getByRole("button", { name: "Lưu thay đổi", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath("insurance-period-bottom.png") }); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Xóa giai đoạn 01/2026", exact: true }).click(); await expect(dialog(page).getByRole("button", { name: "Hủy", exact: true })).toBeVisible(); await page.keyboard.press("Escape"); expect(state.errors).toEqual([]); expect(state.writes).toHaveLength(0);
  });
}
