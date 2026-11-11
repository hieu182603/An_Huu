import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
const api = "http://127.0.0.1:55442", known = (value: string) => ({ status: "KNOWN", value });
const unknown = { status: "UNKNOWN" }, empty = { status: "KNOWN", entries: [] };
const loan = (changes = {}) => ({ id: "loan-a", label: "Vay mua nhà", currency: "VND", outstandingBalance: known("100000000"), payment: known("10000000"), balanceAsOf: known("2026-10-04"), balanceShare: known("0.5"), paymentShare: known("0.5"), responsibility: unknown, frequency: "MONTHLY", startMonth: "2026-10", endMonth: null, ...changes });
const group = (entry = loan()) => ({ status: "KNOWN", entries: [entry] });
async function setup(page: Page, request: APIRequestContext, changes: object = { debts: group() }, withPlan = false) {
  const response = await request.post(`${api}/__fixture/reset`, { data: { changes, withPlan } });
  expect(response.ok()).toBeTruthy(); const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_TEST_API", message: "No debt fixture" } } }));
  await installRouteAuth(page); await installFinancialProfileRoutes(page, { profile: fixture.profile });
  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route("**/socket.io/**", route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const writes: Array<{ path: string; body: any; status: number }> = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/\/api\/v1\/me\/(financial-profile|debts\/preview|retirement\/(plans|preview))([/?]|$)/, async route => {
    const outgoing = route.request(), url = new URL(outgoing.url());
    const res = await route.fetch({ url: api + url.pathname + url.search, headers: { ...outgoing.headers(), Authorization: `Bearer ${fixture.accessToken}` } });
    if (outgoing.method() !== "GET") writes.push({ path: url.pathname, body: outgoing.postDataJSON(), status: res.status() });
    await route.fulfill({ response: res });
  });
  await page.goto("/user/debts"); await expect(page.getByRole("heading", { level: 1, name: "Khoản nợ & khả năng trả" })).toBeVisible();
  const get = async (path: string) => (await (await request.get(`${api}/api/v1/me/${path}`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data;
  return { fixture, writes, errors, report: () => get("financial-profile/debts"), record: () => get("financial-profile"), get };
}
const dialog = (page: Page) => page.getByRole("dialog");
async function add(page: Page, name: string, balance = "20.000.000", payment = "2.000.000", split = false) {
  await page.getByRole("button", { name: "Thêm khoản nợ", exact: true }).click();
  await dialog(page).getByLabel("Tên khoản vay", { exact: true }).fill(name);
  const source = dialog(page).getByRole("combobox", { name: "Khoản này đã nằm trong số tổng ban đầu chưa?", exact: true });
  if (!split && await source.count()) await source.selectOption("");
  await dialog(page).getByLabel("Dư nợ hiện tại", { exact: true }).fill(balance);
  await dialog(page).getByLabel("Trả nợ mỗi tháng", { exact: true }).fill(payment);
}
async function save(page: Page) {
  await dialog(page).getByRole("button", { name: "Lưu khoản vay", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
}
test("real API split/add/edit/delete/reload keeps totals and linked expenses consistent", async ({ page, request }) => {
  const base = loan(), expense = { id: "ref", label: "Chi trả vay", category: "DEBT_PAYMENT", loanId: base.id, amount: known("5000000"), currency: "VND", frequency: "MONTHLY", startMonth: base.startMonth, endMonth: null };
  const state = await setup(page, request, { debts: group(base), expenses: { status: "KNOWN", entries: [expense] } });
  await expect(page.getByTestId("debt-total")).toHaveText("50.000.000 ₫");
  await add(page, "Khoản đã gộp", "20.000.000", "2.000.000", true); await save(page);
  await expect(page.getByTestId("debt-total")).toHaveText("50.000.000 ₫");
  expect((await state.record()).data.expenses.entries[0].amount).toEqual(known("4000000"));
  await add(page, "Khoản mới", "10.000.000", "1.000.000"); await save(page);
  await expect(page.getByTestId("debt-total")).toHaveText("55.000.000 ₫");
  await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click();
  await dialog(page).getByLabel("Trả nợ mỗi tháng", { exact: true }).fill("6.000.000"); await save(page);
  expect((await state.record()).data.expenses.entries[0].amount).toEqual(known("3000000"));
  await page.getByRole("button", { name: "Xóa Vay mua nhà", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Hủy", exact: true }).click(); expect(state.writes).toHaveLength(3);
  await page.getByRole("button", { name: "Xóa Vay mua nhà", exact: true }).click(); await dialog(page).getByRole("button", { name: "Xóa khoản nợ", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId("debt-total")).toHaveText("15.000.000 ₫");
  expect((await state.record()).data.expenses).toEqual(empty);
  expect(state.writes.map(write => write.body.command.kind)).toEqual(["SPLIT", "ADD", "UPDATE", "DELETE"]); expect(state.errors).toEqual([]);
});
test("missing rate never becomes 8.5 percent or a fabricated payoff date", async ({ page, request }) => {
  const state = await setup(page, request); await expect(page.getByTestId("debt-total")).toHaveText("50.000.000 ₫");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click();
  await expect(dialog(page)).toContainText("Chưa đủ điều khoản để lập lịch"); await expect(dialog(page).locator("table")).toHaveCount(0);
  expect((await state.report()).loans[0]).toMatchObject({ rate: null, payoffDate: null, firstMonthInterest: null }); expect(state.writes).toHaveLength(0);
});
test("explicit interest-free rate produces a capped illustrative schedule, distinct from contracts", async ({ page, request }) => {
  const state = await setup(page, request, { debts: group(loan({ outstandingBalance: known("250"), payment: known("100"), illustration: { annualRatePercent: known("0") } })) });
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click(); await expect(dialog(page)).toContainText("Lịch minh họa");
  await expect(dialog(page).locator("tbody tr")).toHaveCount(3); await expect(dialog(page).locator("tbody tr").last()).toContainText("25 ₫");
  await expect(dialog(page)).toContainText("12/2026"); expect((await state.report()).loans[0].rows[2].userPayment).toBe("25");
});
test("unknown group requires explicit completion and zero is distinct from none", async ({ page, request }) => {
  const state = await setup(page, request, { debts: unknown }); await expect(page.getByTestId("debt-total")).toHaveText("Chưa xác định");
  await add(page, "Khoản bằng không", "0", "0"); await dialog(page).getByRole("button", { name: "Lưu khoản vay", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Xác nhận đã kê đầy đủ");
  await dialog(page).getByRole("checkbox", { name: "Tôi xác nhận danh sách sau khi lưu đã kê đầy đủ nhóm nợ.", exact: true }).check(); await save(page);
  await expect(page.getByTestId("debt-total")).toHaveText("0 ₫"); await page.getByRole("button", { name: "Xóa Khoản bằng không", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Xóa khoản nợ", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  expect((await state.record()).data.debts).toEqual(empty);
  await page.getByRole("button", { name: "Tôi không có nợ", exact: true }).click(); await dialog(page).getByRole("button", { name: "Xác nhận", exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  expect((await state.record()).data.debts.status).toBe("NOT_APPLICABLE");
});
test("balance allocation, payment allocation and capped liability are independently editable", async ({ page, request }) => {
  const state = await setup(page, request); await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click();
  await dialog(page).getByLabel("Phần dư nợ của bạn (%)", { exact: true }).fill("25"); await dialog(page).getByLabel("Phần trả nợ của bạn (%)", { exact: true }).fill("10");
  await dialog(page).getByRole("combobox", { name: "Trách nhiệm đã xác nhận", exact: true }).selectOption("CAPPED");
  await dialog(page).getByLabel("Căn cứ xác nhận trách nhiệm", { exact: true }).fill("Điều khoản đã xác nhận"); await dialog(page).getByLabel("Giới hạn nghĩa vụ", { exact: true }).fill("30.000.000"); await save(page);
  await expect(page.getByTestId("debt-total")).toHaveText("25.000.000 ₫"); expect((await state.report()).totals.monthlyPayment).toBe("1000000");
  const debt = (await state.record()).data.debts.entries[0]; expect(debt.responsibility.limit.value).toBe("30000000"); expect(debt.paymentShare.value).toBe("0.1");
});
test("failed writes retain form values and retry without duplicate mutations", async ({ page, request }) => {
  const state = await setup(page, request); let fail = true;
  await page.route("**/api/v1/me/financial-profile/debts", route => route.request().method() === "PATCH" && fail ? route.fulfill({ status: 503, json: { error: { code: "TEMPORARY", message: "Tạm thời chưa lưu được" } } }) : route.fallback());
  await add(page, "Giữ dữ liệu"); await dialog(page).getByRole("button", { name: "Lưu khoản vay", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Tạm thời chưa lưu được"); await expect(dialog(page).getByLabel("Tên khoản vay", { exact: true })).toHaveValue("Giữ dữ liệu");
  expect(state.writes).toHaveLength(0); fail = false; await save(page); expect(state.writes).toHaveLength(1);
});
test("revision conflict refuses stale edits and offers profile reload", async ({ page, request }) => {
  const state = await setup(page, request); await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click();
  const response = await request.patch(`${api}/api/v1/me/financial-profile/debts`, { headers: { Authorization: `Bearer ${state.fixture.accessToken}` }, data: { expectedRevision: 1, command: { kind: "UPDATE", entry: loan({ label: "Đổi ở phiên khác" }) } } }); expect(response.ok()).toBeTruthy();
  await dialog(page).getByLabel("Tên khoản vay", { exact: true }).fill("Bản cũ"); await dialog(page).getByRole("button", { name: "Lưu khoản vay", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toBeVisible(); expect(state.writes[0].status).toBe(409);
  await dialog(page).getByRole("button", { name: "Tải lại hồ sơ", exact: true }).click(); await expect(dialog(page)).toHaveCount(0); await expect(page.getByRole("heading", { name: "Đổi ở phiên khác", exact: true })).toBeVisible();
});
test("report failure hides totals and retry fetches the authoritative revision", async ({ page, request }) => {
  await setup(page, request); let fail = true;
  await page.route("**/api/v1/me/financial-profile/debts", route => fail && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: { code: "REPORT_DOWN", message: "Chưa tính được khoản nợ" } } }) : route.fallback());
  await page.reload(); await expect(page.getByRole("alert")).toContainText("Chưa tính được khoản nợ"); await expect(page.getByTestId("debt-total")).toHaveText("Chưa xác định");
  fail = false; await page.getByRole("button", { name: "Thử lại", exact: true }).click(); await expect(page.getByTestId("debt-total")).toHaveText("50.000.000 ₫");
});
test("future once-only payments do not appear as this month's debt service", async ({ page, request }) => {
  const state = await setup(page, request, { debts: group(loan({ frequency: "ONCE", startMonth: "2026-12", endMonth: "2026-12" })) });
  await expect(page.getByTestId("debt-row")).toContainText("Trả tháng hiện tại: 0 ₫"); expect((await state.report()).totals.monthlyPayment).toBe("0");
});
test("debt edits preserve the applied plan version and mark it stale", async ({ page, request }) => {
  const state = await setup(page, request, { debts: empty }, true); await add(page, "Nợ mới", "100", "10"); await save(page);
  expect(await state.get(`retirement/plans/${state.fixture.plan.id}`)).toMatchObject({ currentVersionId: state.fixture.plan.versionId, stale: true });
});
test("comparison is a backend preview and disappears when inputs change", async ({ page, request }) => {
  const state = await setup(page, request); await page.locator(".debt-comparison summary").click();
  await page.getByLabel("Giữ lại mỗi tháng (0 nếu không có)", { exact: true }).fill("0"); await page.getByLabel("Ngân sách trả thêm mỗi tháng (0 nếu không có)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Xem so sánh", exact: true }).click(); await expect(page.locator(".debt-analysis-results")).toBeVisible();
  expect(state.writes).toHaveLength(1); expect(state.writes[0].path).toBe("/api/v1/me/debts/preview"); expect(state.writes[0].status).toBe(200); expect((await state.record()).revision).toBe(1);
  await page.getByLabel("Số tháng phân tích", { exact: true }).fill("60"); await expect(page.locator(".debt-analysis-results")).toHaveCount(0);
});
test("contract editor preserves per-period rates, fees and early-repayment restrictions", async ({ page, request }) => {
  const contract = { contractVersion: 1, source: "Điều khoản gốc", confirmedOn: "2026-10-01", balanceAsOf: "2026-10-04", interestBasis: "REDUCING_BALANCE", periodConvention: "DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS", maturityDate: "2026-11-28", settleRemainingAtMaturity: true, parties: [{ reference: "self", role: "BORROWER" }], periods: ["2026-10-28", "2026-11-28"].map((dueDate, index) => ({ dueDate, rate: { kind: "EFFECTIVE_MONTHLY", percent: "1" }, repayment: { kind: "PRINCIPAL_PLUS_INTEREST", amount: "100" }, minimumPayment: "0", fee: index ? "8" : "7", prepayment: { status: "PROHIBITED", reason: "Không cho trả trước theo hợp đồng" } })) };
  const state = await setup(page, request, { debts: group(loan({ outstandingBalance: known("1000"), contract: { status: "KNOWN", value: contract }, endMonth: "2026-11" })) });
  await expect(page.getByTestId("debt-row")).toContainText("Theo hợp đồng");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click(); await expect(dialog(page).locator("tbody tr")).toHaveCount(2); await expect(dialog(page)).toContainText("hiệu dụng tháng"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click(); await dialog(page).locator(".debt-contract-editor details summary").first().click();
  await dialog(page).getByLabel("Phí kỳ này", { exact: true }).first().fill("9"); await save(page);
  const result = (await state.record()).data.debts.entries[0].contract.value;
  expect(result.periods[0]).toMatchObject({ fee: "9", rate: contract.periods[0].rate, prepayment: contract.periods[0].prepayment }); expect(result.periods[1]).toEqual(contract.periods[1]); expect(result.parties).toEqual(contract.parties);
  expect((await state.report()).totals.monthlyPayment).toBe("59.5");
});
test("English labels, exact large amounts and keyboard focus work in the editor", async ({ page, request }) => {
  await setup(page, request, { debts: group(loan({ outstandingBalance: known("9007199254740993.25"), balanceShare: known("1") })) });
  await expect(page.getByTestId("debt-total")).toHaveText("9.007.199.254.740.993 ₫");
  await page.getByRole("button", { name: "Chọn ngôn ngữ", exact: true }).click(); await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Debts & repayment capacity");
  const trigger = page.getByRole("button", { name: "Edit Vay mua nhà", exact: true }); await trigger.click(); await expect(dialog(page)).toHaveAccessibleName("Edit loan"); await expect(dialog(page).getByLabel("Loan name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
});
test("foreign loan amounts and liability keep their currency without invented VND conversion", async ({ page, request }) => {
  const state = await setup(page, request, { debts: group(loan({ currency: "USD", outstandingBalance: known("1000"), payment: known("100"), responsibility: { status: "KNOWN", scope: "CAPPED", confirmedDocument: "Confirmed limit", limit: known("300") } })) });
  await expect(page.getByTestId("debt-total")).toHaveText("Chưa xác định");
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click(); await expect(dialog(page)).toContainText("300 USD"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click();
  await expect(dialog(page).locator(".input-suffix")).toHaveText(["USD", "USD", "USD"]);
  await dialog(page).getByLabel("Dư nợ hiện tại", { exact: true }).fill("1.234,56"); await expect(dialog(page).locator(".debt-entry-preview")).toContainText("617.28 USD"); await save(page);
  const debt = (await state.record()).data.debts.entries[0]; expect(debt.currency).toBe("USD"); expect(debt.outstandingBalance.value).toBe("1234.56"); expect((await state.report()).totals.outstandingBalance).toBeNull();
});
test("new contract builder requires declared amounts and supports adding and removing periods", async ({ page, request }) => {
  const state = await setup(page, request, { debts: empty }); await add(page, "Hợp đồng mới", "1.000", "100");
  await dialog(page).getByText("Lịch gốc, lãi, phí theo hợp đồng", { exact: true }).click();
  await dialog(page).getByRole("checkbox", { name: "Tôi có điều khoản để khai lịch hợp đồng", exact: true }).check();
  await dialog(page).getByRole("button", { name: "Tạo lịch để đối chiếu hợp đồng", exact: true }).click(); await expect(dialog(page).getByRole("alert")).toContainText("Điền đủ số kỳ");
  await dialog(page).getByLabel("Số kỳ hợp đồng", { exact: true }).fill("2"); await dialog(page).getByLabel("Lãi danh nghĩa mỗi năm (%)", { exact: true }).fill("0");
  await dialog(page).getByLabel("Mức trả mỗi kỳ", { exact: true }).fill("100"); await dialog(page).getByLabel("Phí mỗi kỳ", { exact: true }).fill("0"); await dialog(page).getByLabel("Mức trả tối thiểu mỗi kỳ", { exact: true }).fill("0");
  await dialog(page).getByRole("button", { name: "Tạo lịch để đối chiếu hợp đồng", exact: true }).click();
  await dialog(page).getByLabel("Nguồn xác nhận hợp đồng", { exact: true }).fill("Hợp đồng đã đối chiếu");
  await dialog(page).getByRole("checkbox", { name: "Hợp đồng yêu cầu trả hết gốc còn lại ở kỳ cuối", exact: true }).check();
  await dialog(page).getByRole("button", { name: "Thêm kỳ từ điều khoản kỳ cuối", exact: true }).click(); await expect(dialog(page).locator(".debt-contract-editor details")).toHaveCount(3);
  await dialog(page).getByRole("button", { name: "Bỏ kỳ cuối", exact: true }).click(); await save(page);
  const result = (await state.record()).data.debts.entries[0].contract.value; expect(result.periods).toHaveLength(2); expect(result.maturityDate).toBe("2026-11-04"); expect(result.periods[0].prepayment.status).toBe("UNKNOWN");
  const report = await state.report(); expect(report.loans[0]).toMatchObject({ status: "CONTRACT", payoffDate: "2026-11-04", monthlyPayment: "100" }); expect(report.loans[0].rows[1].userPayment).toBe("900");
});
test("non-amortizing and horizon-limited illustrations explain why payoff is unknown", async ({ page, request }) => {
  const state = await setup(page, request, { debts: group(loan({ outstandingBalance: known("1000"), payment: known("10"), illustration: { annualRatePercent: known("12") } })) });
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click(); await expect(dialog(page)).toContainText("Mức trả không đủ giảm gốc"); await expect(dialog(page).locator("tbody tr")).toHaveCount(0); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click(); await dialog(page).getByLabel("Trả nợ mỗi tháng", { exact: true }).fill("100"); await dialog(page).getByLabel("Tháng kết thúc (nếu biết)", { exact: true }).fill("2026-11"); await save(page);
  await page.getByRole("button", { name: "Xem lịch", exact: true }).click(); await expect(dialog(page)).toContainText("Chưa trả hết trong thời gian đã khai"); await expect(dialog(page).locator("tbody tr")).toHaveCount(2); expect((await state.report()).loans[0].payoffDate).toBeNull();
});
for (const [name, width, height] of [["desktop", 1440, 1000], ["laptop", 1024, 768], ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740], ["wide", 1920, 1080]] as const) {
  test(`debt page and popups fit ${name}`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height }); const state = await setup(page, request, { debts: group(loan({ illustration: { annualRatePercent: known("12") } })) });
    await expect(page.getByTestId("debt-total")).toHaveText("50.000.000 ₫");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy(); await page.screenshot({ path: testInfo.outputPath("debts-page.png"), fullPage: true });
    await page.getByRole("button", { name: "Xem lịch", exact: true }).click(); await expect(dialog(page).locator("table")).toBeVisible(); expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy(); await page.screenshot({ path: testInfo.outputPath("debt-schedule.png") }); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sửa Vay mua nhà", exact: true }).click(); await expect(dialog(page).getByLabel("Tên khoản vay", { exact: true })).toBeFocused(); await page.screenshot({ path: testInfo.outputPath("debt-entry-top.png") });
    await dialog(page).getByRole("button", { name: "Lưu khoản vay", exact: true }).scrollIntoViewIfNeeded(); expect(await dialog(page).evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy(); await page.screenshot({ path: testInfo.outputPath("debt-entry-bottom.png") });
    await page.keyboard.press("Escape"); expect(state.errors).toEqual([]); expect(state.writes).toHaveLength(0);
  });
}
