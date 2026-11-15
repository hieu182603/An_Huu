import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { normalizeQuickStart } from "../../backend/src/modules/profiles/quick-start";
import { createQuickStartProfileV2 } from "../src/services/financialProfile";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));
const goalEvidence=fileURLToPath(new URL("../../artifacts/demo-reaccept-2026-11-15/goal-horizons/",import.meta.url));
async function captureGoal(page:Page,name:string){
  mkdirSync(goalEvidence,{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${goalEvidence}/${name}-${width}.png`,fullPage:true});
  }
}
test.setTimeout(30000);
test.use({ actionTimeout: 10000 });
const profile = () => createQuickStartProfileV2({ birthMonth: "1991-11", desiredRetirementMonth: "2056-11", monthlyIncome: 80000000, monthlyExpense: 30000000, retirementSavings: 100000000, hasDebt: false, valuationDate: "2026-11-01" });

async function setup(page: Page, step?: "personal" | "investment", saved = profile()) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-14T05:00:00Z"));
  await page.route("**/api/v1/**", r => r.fulfill({ status: 503, json: { error: { message: "No test fixture" } } }));
  await installRouteAuth(page);
  await page.route("**/socket.io/**", r => r.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  // Exercise the production normalizer in this mocked-HTTP regression fixture.
  const previousGoal = saved.retirementGoal;
  saved = normalizeQuickStart({ ...saved, quickStartSurvey: { version: 1, birthDate: "1991-11-24", retirementAge: 65, monthlyExpenseToday: "30000000", monthlyIncome: "80000000", monthlyExpense: "30000000", retirementSavings: "100000000", emergencyAmount: "0", monthlyContribution: "0", pensionStatus: "unknown", ...saved.quickStartSurvey } }) as typeof saved;
  if (previousGoal) saved.retirementGoal = previousGoal;
  const state = await installFinancialProfileRoutes(page, { profile: step ? null : { schemaVersion: 2, revision: 1, data: saved }, draft: step ? { revision: 1, step, data: saved, updatedAt: "2026-11-14T05:00:00Z" } : null });
  await page.route("**/api/v1/me/onboarding-draft", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    const body = route.request().postDataJSON();
    try {
      const data = normalizeQuickStart(body.data, false, ["investment", "summary"].includes(body.step));
      const draft = { revision: (state.getDraft()?.revision ?? 0) + 1, step: body.step, data, updatedAt: "2026-11-14T05:00:00Z" };
      state.setDraft(draft); return route.fulfill({ json: { data: draft } });
    } catch (error) { return route.fulfill({ status: 400, json: { error: { message: String(error) } } }); }
  });
  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies**", r => r.fulfill({ json: { data: new URL(r.request().url()).pathname.endsWith("/policy-test") ? policy : { status: "AVAILABLE", items: [policy] } } }));
  await page.route("**/api/v1/me/retirement/plans**", r => r.fulfill({ json: { data: { items: [], total: 0 } } }));
  await page.goto(step ? "/onboarding" : "/user/goal");
  return state;
}

test("support has no invented amount; saves the declared amount once and restores it after reload", async ({ page }) => {
  const state = await setup(page, "personal");
  await page.getByRole("checkbox", { name: /Tôi có bố mẹ già/ }).check();
  const amount = page.getByLabel("Chi phí phụng dưỡng mỗi tháng", { exact: true });
  await expect(amount).toHaveValue("0");
  await amount.focus(); await expect(amount).toHaveValue("");
  await amount.fill("3000000");
  await page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  await expect(page.locator("#step4-title")).toBeVisible();
  const data = state.getDraft().data;
  expect(data.expenses.entries.find((e: any) => e.id === "exp_quick_parent").amount.value).toBe("3000000");
  expect(data.expenses.entries.reduce((sum: number, e: any) => sum + Number(e.amount.value), 0)).toBe(30000000);
  await page.reload();
  await page.getByRole("button", { name: "← Gia đình", exact: true }).click();
  await expect(amount).toHaveValue("3.000.000");
});

test("loan rate can be cleared and typed; blank blocks saving and zero is persisted as interest-free", async ({ page }) => {
  const state = await setup(page, "personal");
  await page.getByRole("checkbox", { name: /Tôi đang trả một khoản vay/ }).check();
  await page.getByLabel("Dư nợ hiện tại", { exact: true }).fill("100000000");
  await page.getByLabel("Trả nợ mỗi tháng", { exact: true }).fill("10000000");
  const rate = page.locator("#survey-debt-rate");
  await rate.fill("0"); await rate.press("Backspace"); await expect(rate).toHaveValue("");
  await page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  await expect(rate).toHaveAttribute("aria-invalid", "true");
  await rate.pressSequentially("8.5"); await expect(rate).toHaveValue("8.5");
  await rate.fill("0");
  await page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  await expect(page.locator("#step4-title")).toBeVisible();
  expect(state.getDraft().data.debts.entries[0].illustration.annualRatePercent).toEqual({ status: "KNOWN", value: "0" });
  await page.reload(); await page.getByRole("button", { name: "← Gia đình", exact: true }).click();
  await expect(rate).toHaveValue("0");
  await rate.fill("8.5");
  await page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  await expect(page.locator("#step4-title")).toBeVisible();
  expect(state.getDraft().data.debts.entries[0].illustration.annualRatePercent.value).toBe("8.5");
});

test("loss percentage allows blank editing, rejects a blank submission and accepts zero", async ({ page }) => {
  const saved = profile(); saved.lossTolerance = { percent: { status: "KNOWN", value: "15" } };
  const state = await setup(page, "investment", saved);
  await page.getByText("Mức lỗ tối đa bạn có thể chấp nhận", { exact: true }).click();
  await page.getByRole("radio").nth(1).check();
  for (const select of await page.locator("[data-policy-question]").all()) await select.selectOption({ index: 1 });
  await expect(page.locator("#qo-loss-status")).toBeVisible();
  await page.locator("#qo-loss-status").selectOption("percent");
  const rate = page.locator("#qo-loss-percent");
  await rate.fill("15");
  await rate.fill("0"); await rate.press("Backspace"); await expect(rate).toHaveValue("");
  await page.getByRole("button", { name: "Xem kế hoạch đầu tiên →", exact: true }).click();
  await expect(page.locator("#qo-loss-percent-error")).toBeVisible();
  expect(state.getProfile()).toBeNull();
  await rate.pressSequentially("12.5"); await expect(rate).toHaveValue("12.5");
  await rate.fill("0");
  await page.getByRole("button", { name: "Xem kế hoạch đầu tiên →", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/plan/);
  expect(state.getProfile().data.lossTolerance.percent).toEqual({ status: "KNOWN", value: "0" });
  expect(state.getProfile().data.retirementGoal.endMonth).toBe("2076-10");
});

test("R-05 preparation follows the saved/custom spending end plus one month", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const preparation = page.getByLabel("Chuẩn bị quỹ đến tháng", { exact: true });
  const age = page.getByRole("spinbutton", { name: "Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", exact: true });
  await expect(preparation).toHaveValue("11/2076");
  await expect(preparation).toHaveAttribute("readonly", "");
  await captureGoal(page,"default");
  await age.fill("60"); await expect(preparation).toHaveValue("11/2076");
  await page.getByText("Chỉnh thời gian nghỉ hưu và chi tiêu", { exact: true }).click();
  const horizon = page.getByLabel("Tính chi tiêu nghỉ hưu đến tháng", { exact: true });
  await expect(horizon).toHaveValue("10/2076");
  await horizon.fill("12/2080");
  await age.fill("65"); await expect(preparation).toHaveValue("01/2081");
  await expect(horizon).toHaveValue("12/2080");
  await age.fill(""); await expect(preparation).toHaveValue("01/2081");
  await age.fill("65");
  await page.getByLabel("Tháng nghỉ hưu mong muốn", { exact: true }).fill("08/2056");
  await expect(preparation).toHaveValue("01/2081");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("goal-mobile.png"), fullPage: true });
});

test("saving a new goal sends retirement and the age-85 horizon as distinct dates without an extra answer", async ({ page }) => {
  const saved = profile(); saved.retirementSurvey = { policyVersionId: "policy-test", monthlyExpenseToday: "30000000", answers: [{ questionId: "Q_HORIZON", choiceId: "HOR_LONG" }] };
  await setup(page, undefined, saved);
  let command: any;
  await page.route("**/api/v1/me/financial-profile/retirement-goal", async route => {
    command = route.request().postDataJSON();
    const updated = { ...saved, retirementGoal: command.goal, personal: { ...saved.personal, desiredRetirementMonth: { status: "KNOWN", value: command.retirementMonth } } };
    await route.fulfill({ json: { data: { revision: 2, schemaVersion: 2, data: updated } } });
  });
  await page.getByRole("spinbutton", { name: "Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", exact: true }).fill("60");
  await page.getByRole("button", { name: "Lưu và xem kết quả mới", exact: true }).click();
  await expect(page).toHaveURL(/\/user\/plan/);
  expect(command.retirementMonth).toBe("2051-11");
  expect(command.goal.endMonth).toBe("2076-10");
});

test("saved one-month horizon is disclosed and never silently changes", async ({ page }) => {
  const data = profile(); data.retirementGoal = { endMonth: "2056-11", monthlyExpenseToday: "30000000", lifestylePriority: null };
  await setup(page, undefined, data);
  await page.getByText("Chỉnh thời gian nghỉ hưu và chi tiêu", { exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hai mốc đang trùng nhau" })).toContainText("quỹ cần chỉ tính 1 tháng");
  await expect(page.getByLabel("Tính chi tiêu nghỉ hưu đến tháng", { exact: true })).toHaveValue("11/2056");
  await page.getByRole("button", { name: "Dùng mốc 85 tuổi như bản demo", exact: true }).click();
  await expect(page.getByLabel("Tính chi tiêu nghỉ hưu đến tháng", { exact: true })).toHaveValue("10/2076");
});

test("R-05 an old saved horizon shows its actual exclusive boundary and saving adopts age 85", async ({page}) => {
  const saved=profile();saved.retirementGoal={endMonth:"2076-11",monthlyExpenseToday:"30000000",lifestylePriority:null};
  const state=await setup(page,undefined,saved);
  await page.route("**/api/v1/me/financial-profile/retirement-goal",async route=>{
    const command=route.request().postDataJSON(),updated={...saved,retirementGoal:command.goal};
    state.setProfile({revision:2,schemaVersion:2,data:updated});
    await route.fulfill({json:{data:{revision:2,schemaVersion:2,data:updated}}});
  });
  await expect(page.getByLabel("Chuẩn bị quỹ đến tháng",{exact:true})).toHaveValue("12/2076");
  await expect(page.getByRole("status").filter({hasText:"Kế hoạch đang lưu tính đến 11/2076"})).toBeVisible();
  await expect(page.locator(".goal-sync-timeline li").last()).toContainText("Dự tính chi tiêu đến hết tháng 11/2076");
  await expect(page.locator("main")).not.toContainText("dd/mm/yyyy · ngày/tháng/năm");
  await captureGoal(page,"legacy");
  await page.getByRole("button",{name:"Lưu và xem kết quả mới",exact:true}).click();
  await expect(page).toHaveURL(/\/user\/plan/);
  expect(state.getProfile()!.data.retirementGoal.endMonth).toBe("2076-10");
});


test("a goal cannot submit zero spending as a valid retirement target", async ({ page }) => {
  await setup(page);
  let writes = 0;
  await page.route("**/api/v1/me/financial-profile/retirement-goal", async route => { writes++; await route.fulfill({ status: 500 }); });
  await page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Lưu và xem kết quả mới", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("lớn hơn 0");
  expect(writes).toBe(0);
});
