import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { installRouteAuth } from "./helpers";
import { mkdirSync, writeFileSync } from "node:fs";

const api = "http://127.0.0.1:18452";
const artifacts = "E:/An_Huu/artifacts/survey-parity-2026-11-14/fixed";
// Let the real browser request settle before the fixture is reset.
test.afterEach(async ({ page }) => { await page.waitForLoadState("networkidle"); await page.goto("about:blank"); await page.unrouteAll({ behavior: "wait" }); });
async function setup(page: Page, request: APIRequestContext, endYear?: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-14T05:00:00Z"));
  const response = await request.post(`${api}/__fixture/reset`, { data: {endYear} });
  expect(response.ok(), await response.text()).toBeTruthy();
  const fixture = await response.json();
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { message: "No synthetic route" } } }));
  await installRouteAuth(page, "USR-001", fixture.accessToken);
  await page.route("**/socket.io/**", route => route.abort());
  await page.routeWebSocket(/socket\.io/, socket => socket.close());
  const writes: any[] = [], previews: any[] = [];
  await page.route(/\/api\/v1\/me\/(financial-profile|onboarding-draft|onboarding\/complete|portfolio-policies|assumptions|retirement)([/?]|$)/, async route => {
    const outgoing = route.request(), url = new URL(outgoing.url());
    // Continue the browser's actual request. Fetch-then-fulfill races React's
    // cancellation of obsolete reads and can fulfill an already handled route.
    await route.continue({ url: api + url.pathname + url.search, headers: { ...outgoing.headers(), authorization: `Bearer ${fixture.accessToken}` } });
  });
  await page.goto("/onboarding");
  await expect(page.locator("#step1-title")).toBeVisible();
  const get = async (path: string) => (await (await request.get(`${api}/api/v1/me/${path}`, { headers: { Authorization: `Bearer ${fixture.accessToken}` } })).json()).data;
  const refresh = async () => {
    const response = await request.get(`${api}/__fixture/evidence`); expect(response.ok()).toBeTruthy();
    const evidence = await response.json();
    writes.splice(0, writes.length, ...evidence.writes); previews.splice(0, previews.length, ...evidence.previews);
  };
  return { writes, previews, get, refresh };
}
const next = async (page: Page) => page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
async function start(page: Page, birth = "24/11/1943", age = "84", expense = "20000000") {
  await page.getByLabel("Ngày tháng năm sinh", { exact: true }).fill(birth);
  await page.getByLabel("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", { exact: true }).fill(age);
  await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng", { exact: true }).fill(expense);
  await next(page);
  await expect(page.locator("#step2-title")).toBeVisible();
  for (const [label, value] of [
    ["Thu nhập bình quân thực nhận mỗi tháng của bạn bao nhiêu?", "40000000"],
    ["Bạn đang chi bao nhiêu mỗi tháng?", "25000000"],
    ["Bạn đã tích lũy được bao nhiêu cho tuổi nghỉ hưu?", "300000000"],
    ["Bạn muốn góp vào quỹ hưu mỗi tháng bao nhiêu?", "5000000"],
  ]) await page.getByLabel(label, { exact: true }).fill(value);
}
async function family(page: Page) {
  await next(page);
  await expect(page.locator("#step3-family-title")).toBeVisible();
}
async function snapshot(page: Page, name: string) {
  mkdirSync(artifacts, { recursive: true });
  await expect(page.locator(".anhuu-loading")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
}
async function fit(page: Page) {
  await expect.poll(() => page.locator(".qo-card,input,select,button,.goal-main-form").evaluateAll(nodes => nodes.filter(el => el.checkVisibility()).flatMap(el => {
    const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 ? [{ tag: el.tagName, id: el.id, left: r.left, right: r.right }] : [];
  }))).toEqual([]);
}

test("all declared fields survive HTTP save, reload, complete and the actual retirement calculation", async ({ page, request }) => {
  const state = await setup(page, request);
  await start(page);
  await page.getByText("Quỹ dự phòng đang có", { exact: true }).click();
  await page.getByLabel("Quỹ dự phòng để riêng", { exact: true }).fill("100000000");
  await family(page);
  await page.locator("#qo-marital").selectOption("DIVORCED");
  await page.locator("#qo-dependents").fill("2");
  await page.getByRole("checkbox", { name: /Tôi có con nhỏ/ }).check();
  await page.getByLabel("Chi phí chăm lo mỗi tháng", { exact: true }).fill("3000000");
  await page.locator("#qo-child-duration").selectOption("1");
  await page.getByRole("checkbox", { name: /Tôi có bố mẹ già/ }).check();
  await expect(page.getByLabel("Chi phí phụng dưỡng mỗi tháng", { exact: true })).toHaveValue("0");
  await page.getByLabel("Chi phí phụng dưỡng mỗi tháng", { exact: true }).fill("2000000");
  await page.locator("#qo-parent-duration").selectOption("3");
  await page.locator(".survey-source-field select").nth(1).selectOption("no");
  await page.getByRole("checkbox", { name: /Tôi đang trả một khoản vay/ }).check();
  await page.getByLabel("Dư nợ hiện tại", { exact: true }).fill("6000000");
  await page.getByLabel("Trả nợ mỗi tháng", { exact: true }).fill("2000000");
  await page.locator("#survey-debt-rate").fill("0");
  await page.getByRole("checkbox", { name: /Tôi có một mục tiêu lớn khác/ }).check();
  await page.locator("#survey-goal-name").fill("Học phí thử nghiệm");
  await page.getByLabel("Cần bao nhiêu tiền (theo giá hiện tại)?", { exact: true }).fill("12000000");
  await page.getByLabel("Khi nào bạn cần dùng số tiền này?", { exact: true }).fill("06/2028");
  await page.locator("#qo-goal-deferrable").selectOption("yes");
  await page.locator("#survey-pension-status").selectOption("known");
  await page.getByLabel("Lương hưu dự kiến mỗi tháng", { exact: true }).fill("4000000");
  await expect(page.getByLabel("Tháng bắt đầu nhận lương hưu", { exact: true })).toHaveValue("11/2027");
  await next(page);
  await expect(page.locator("#step4-title")).toBeVisible();
  await expect(page.locator("input[name=comfortReaction]:checked")).toHaveCount(0);
  await expect(page.locator("#qo-stability")).toHaveValue("unknown");
  const policySelects = page.locator("[data-policy-question]");
  await expect(policySelects).toHaveCount(0);
  for (const select of await policySelects.all()) await expect(select).toHaveValue("");
  await page.locator("input[name=comfortReaction][value=hold]").check();
  await page.locator("#qo-stability").selectOption("variable");
  await page.locator("#qo-priority").selectOption("health");
  await page.getByText("Mức lỗ tối đa bạn có thể chấp nhận", { exact: true }).click();
  await page.locator("#qo-loss-status").selectOption("percent");
  await page.locator("#qo-loss-percent").fill("0");
  await page.locator("#qo-loss-percent").press("Backspace");
  await expect(page.locator("#qo-loss-percent")).toHaveValue("");
  await page.locator("#qo-loss-percent").fill("12.5");
  for (const select of await policySelects.all()) await select.selectOption("LOW");
  await page.getByRole("button", { name: "Xem kế hoạch đầu tiên →", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/plan/);
  await expect.poll(async () => { await state.refresh(); return state.previews.some(p => p.data?.status === "READY"); }).toBeTruthy();
  const record = await state.get("financial-profile"), p = record.data;
  expect(p.personal).toMatchObject({ birthDate: "1943-11-24", maritalStatus: "DIVORCED", dependents: { value: 2 } });
  expect(p.retirementGoal).toMatchObject({ monthlyExpenseToday: "20000000", monthlyContribution: "5000000", endMonth: "2028-10", lifestylePriority: "HEALTH" });
  expect(p.expenses.entries.reduce((sum: number, e: any) => sum + Number(e.amount.value), 0)).toBe(27000000);
  expect(p.assets.entries).toHaveLength(2);
  expect(p.assets.entries.find((a: any) => a.id === "ast_quick_reserve")).toMatchObject({ value: { value: "100000000" }, retirementShare: { value: "0" } });
  expect(p.goals.entries[0]).toMatchObject({ label: "Học phí thử nghiệm", amountToday: { value: "12000000" }, dueMonth: { value: "2028-06" }, deferrable: { value: true } });
  expect(p.pension).toMatchObject({ status: "KNOWN", monthlyAmount: "4000000" });
  expect(p.personal.pensionStartMonth.value).toBe("2027-11");
  expect(p.lossTolerance.percent.value).toBe("12.5");
  expect(p.retirementSurvey).toBeUndefined();
  expect(state.previews.find(p=>p.data?.status==="READY").data.selection).toMatchObject({answers:[],planningReaction:"HOLD"});
  expect(state.previews.find(p=>p.data?.status==="READY").data.calculation).toMatchObject({suitability:"NOT_ASSESSED",planningBasis:"PUBLISHED_REACTION_REFERENCE"});
  expect(state.writes.every(w => w.status < 400)).toBe(true);
  // The post-retirement period must include twelve months, not just the
  // preparation/retirement month that caused the customer's tiny target fund.
  const calculation = state.previews.find(p => p.data?.status === "READY").data.calculation;
  expect(calculation.summary.retirementMonths).toBe(12);
  expect(Number(calculation.summary.atRetirement.requiredFund)).toBeGreaterThan(200000000);
  await snapshot(page, "plan-desktop");
  await page.goto("/user/goal");
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toHaveValue("24/11/1943");
  await expect(page.getByLabel("Chuẩn bị quỹ đến tháng", { exact: true })).toHaveValue("11/2028");
  await page.setViewportSize({ width: 390, height: 844 });
  await fit(page); await snapshot(page, "goal-mobile");
  // Demo parity: finishing the survey saves and applies the first preview as the main plan.
  await state.refresh();
  const saveRequest = state.writes.find(w => w.path.endsWith("/retirement/plans"));
  expect(saveRequest?.status).toBe(201);
  expect(saveRequest.body.preview.monthlyContribution).toBe("5000000");
  expect(state.writes.some(w => /\/retirement\/plans\/[^/]+\/apply$/.test(w.path) && w.status === 200)).toBe(true);
  // Without the session draft the saved survey still reads as the unchanged main plan.
  await page.evaluate(() => sessionStorage.removeItem("anhuu:plan-draft:USR-001"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/user/plan");
  await expect(page.getByText("Kế hoạch chính đang dùng", { exact: true })).toBeVisible();
  await expect(page.locator(".current-plan-banner")).toContainText("góp 5 triệu ₫/tháng");
  writeFileSync(`${artifacts}/http-evidence.json`, JSON.stringify({ profile: record, writes: state.writes, preview: state.previews.find(p => p.data?.status === "READY") }, null, 2));
});

test("draft resume keeps the actual birth day and separate current spending, retirement spending, contribution and reserve", async ({ page, request }) => {
  await setup(page, request); await start(page, "24/11/1991", "60"); await family(page);
  await page.reload(); await expect(page.locator("#step3-family-title")).toBeVisible();
  await page.getByRole("button", { name: "← Tiền hôm nay", exact: true }).click();
  await expect(page.getByLabel("Bạn đang chi bao nhiêu mỗi tháng?", { exact: true })).toHaveValue("25.000.000");
  await expect(page.getByLabel("Bạn muốn góp vào quỹ hưu mỗi tháng bao nhiêu?", { exact: true })).toHaveValue("5.000.000");
  await page.getByText("Quỹ dự phòng đang có", { exact: true }).click();
  await expect(page.getByLabel("Quỹ dự phòng để riêng", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "← Mong muốn", exact: true }).click();
  await expect(page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng", { exact: true })).toHaveValue("20.000.000");
  await expect(page.getByLabel("Ngày tháng năm sinh", { exact: true })).toHaveValue("24/11/1991");
});

test("invalid birth text clears the old date and blocks saving; retirement age can be erased", async ({ page, request }) => {
  const state = await setup(page, request);
  const birth = page.getByLabel("Ngày tháng năm sinh", { exact: true }), age = page.getByLabel("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", { exact: true });
  await birth.fill("24/11/1991"); await birth.fill("32/13/1991");
  await age.fill(""); await expect(age).toHaveValue("");
  await age.fill("60"); await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng", { exact: true }).fill("20000000");
  await next(page); await expect(page.locator("#step1-title")).toBeVisible();
  await state.refresh(); expect(state.writes).toHaveLength(0);
  await expect(birth).toHaveValue("32/13/1991"); await expect(birth).toHaveAttribute("aria-invalid", "true");
});

test("a loan payment that cannot cover interest is rejected before persistence", async ({ page, request }) => {
  const state = await setup(page, request); await start(page); await family(page);
  await page.getByRole("checkbox", { name: /Tôi đang trả một khoản vay/ }).check();
  await page.getByLabel("Dư nợ hiện tại", { exact: true }).fill("6000000");
  await page.getByLabel("Trả nợ mỗi tháng", { exact: true }).fill("1");
  await page.locator("#survey-debt-rate").fill("12");
  await state.refresh(); const count = state.writes.length; await next(page);
  await expect(page.locator("#step3-family-title")).toBeVisible();
  await expect(page.getByText("Khoản trả phải lớn hơn tiền lãi tháng để giảm gốc.", { exact: true }).first()).toBeVisible();
  await state.refresh(); expect(state.writes).toHaveLength(count);
});

for (const width of [320, 390]) test(`all survey fields fit ${width}px and the first quick-pick click commits`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  await setup(page, request); await fit(page); await snapshot(page, `step1-${width}`);
  await start(page); await fit(page); await snapshot(page, `step2-${width}`);
  await family(page);
  await page.getByRole("checkbox", { name: /Tôi có con nhỏ/ }).check();
  await page.getByRole("checkbox", { name: /Tôi có bố mẹ già/ }).check();
  await expect(page.locator("#qo-dependents")).toHaveValue("2");
  await page.getByLabel("Chi phí chăm lo mỗi tháng", { exact: true }).fill("1000000");
  const amount = page.getByLabel("Chi phí phụng dưỡng mỗi tháng", { exact: true });
  await amount.fill("3");
  const field = amount.locator("xpath=ancestor::div[contains(@class,'form-field')]").first();
  await field.getByRole("button", { name: "Chọn 3.000.000 đồng", exact: true }).click();
  await expect(amount).toHaveValue("3.000.000");
  await fit(page); await snapshot(page, `step3-${width}`);
  await next(page); await expect(page.locator("#step4-title")).toBeVisible();
  await fit(page); await snapshot(page, `step4-${width}`);
});

test("initial planning saves no suitability answers; the separate allocation questionnaire saves only explicit choices", async ({ page, request }) => {
  const state = await setup(page, request);
  await start(page); await family(page); await next(page);
  await expect(page.locator("[data-policy-question]")).toHaveCount(0);
  await page.locator("input[name=comfortReaction][value=hold]").check();
  await page.getByRole("button", { name: "Xem kế hoạch đầu tiên →", exact: true }).click();
  await expect(page.getByText("Kế hoạch chính đang dùng", { exact: true })).toBeVisible();
  expect((await state.get("financial-profile")).data.retirementSurvey).toBeUndefined();
  await page.waitForLoadState("networkidle");
  await page.goto("/user/risk-portfolio?section=risk");
  const questions = page.locator("[data-policy-question]");
  await expect(questions).toHaveCount(6);
  for (const select of await questions.all()) { await expect(select).toHaveValue(""); await select.selectOption("LOW"); }
  await page.getByRole("button", { name: "Lưu câu trả lời đánh giá", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/risk-portfolio$/);
  const saved = (await state.get("financial-profile")).data;
  expect(saved.retirementSurvey.answers).toHaveLength(6);
  expect(saved.retirementSurvey.answers.every((answer: any) => answer.choiceId === "LOW")).toBe(true);
});

test("saving a comparison option creates a version without applying it", async ({ page, request }) => {
  const state = await setup(page, request);
  await start(page); await family(page); await next(page);
  await page.locator("input[name=comfortReaction][value=hold]").check();
  await page.getByRole("button", { name: "Xem kế hoạch đầu tiên →", exact: true }).click();
  await expect(page.getByText("Kế hoạch chính đang dùng", { exact: true })).toBeVisible();
  await state.refresh(); const before = state.writes.length;
  await page.waitForLoadState("networkidle");
  await page.goto("/user/plan?view=compare");
  await page.getByRole("button", { name: "Lưu phương án", exact: true }).first().click();
  await expect(page).toHaveURL(/view=history/);
  await state.refresh(); const writes = state.writes.slice(before);
  expect(writes.some(w => /\/versions$/.test(w.path) && w.status === 201)).toBe(true);
  expect(writes.some(w => /\/apply$/.test(w.path))).toBe(false);
});

// T8: real application services over an in-memory HTTP fixture; never the shared DB.
for (const width of [1440,390]) test(`sample profile: five main pages preserve labels and formats at ${width}px`, async ({page,request})=>{
  await page.setViewportSize({width,height:1000});
  await setup(page,request,2075);
  await start(page,"15/06/1990","60","15000000");
  for(const [label,value] of [
    ["Thu nhập bình quân thực nhận mỗi tháng của bạn bao nhiêu?","35000000"],
    ["Bạn đang chi bao nhiêu mỗi tháng?","20000000"],
    ["Bạn đã tích lũy được bao nhiêu cho tuổi nghỉ hưu?","400000000"],
    ["Bạn muốn góp vào quỹ hưu mỗi tháng bao nhiêu?","7500000"],
  ])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByText("Quỹ dự phòng đang có",{exact:true}).click();
  await page.getByLabel("Quỹ dự phòng để riêng",{exact:true}).fill("60000000");
  await family(page);await next(page);
  await page.locator("input[name=comfortReaction][value=hold]").check();
  for(const select of await page.locator("[data-policy-question]").all())await select.selectOption("LOW");
  await page.getByRole("button",{name:"Xem kế hoạch đầu tiên →",exact:true}).click();
  await expect(page).toHaveURL(/\/user\/plan/);
  await expect(page.getByText("Kế hoạch chính đang dùng",{exact:true})).toBeVisible();
  for(const [path,title] of [["dashboard","Tổng quan"],["profile","Tài chính của bạn"],["goal","Mục tiêu nghỉ hưu"],["plan","Kế hoạch nghỉ hưu"],["risk-portfolio","Phân bổ tài sản"]]){
    await page.goto(`/user/${path}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator(".anhuu-loading")).toHaveCount(0);
    if(path==="plan") await expect(page.locator(".plan-result-hero")).toBeVisible();
    const text=await page.locator("main").innerText();
    expect(text).not.toMatch(/,\d{2} ₫/);
    expect(text).not.toMatch(/\b\d{4}-\d{2}\b/);
    await expect(page.locator("main")).toContainText(title);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await snapshot(page,`main-${path}-${width}`);
  }
});
