import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

async function setupQuick(page: Page, options: {
  draft?: any;
  profile?: any;
  simPrefill?: any;
  warnings?: string[];
} = {}) {
  const calls: Array<{ path: string; method: string; body: any }> = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.url().includes("/api/v1/") && !["GET", "OPTIONS"].includes(request.method())) {
      calls.push({ path: new URL(request.url()).pathname, method: request.method(), body: request.postDataJSON() });
    }
  });

  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } }));
  await installRouteAuth(page);
  await page.route("**/socket.io/**", route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());

  const state = await installFinancialProfileRoutes(page, {
    profile: options.profile ?? null,
    draft: options.draft ?? null,
  });

  await page.route("**/api/v1/me/retirement/plans**", route => route.fulfill({ json: { data: { items: [], total: 0 } } }));

  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies**", route => {
    return route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/policy-test") ? policy : { status: "AVAILABLE", items: [policy] } } });
  });

  await page.route("**/api/v1/me/retirement/preview*", async route => {
    const input = route.request().postDataJSON();
    const summary = {
      retirementMonth: input.whatIf?.retirementMonth ?? "2048-06",
      endMonth: input.endMonth ?? "2065-01",
      accumulationMonths: 240,
      retirementMonths: 200,
      initialRetirementCapital: "100000000",
      futureMonthlyExpense: "35000000",
      firstShortfallMonth: "2055-08",
      atRetirement: { requiredFund: "1200000000", projectedFund: "900000000", fundingGap: "300000000", coveragePercent: "75" },
      atValuation: { requiredFund: "1200000000", projectedFund: "900000000", fundingGap: "300000000", coveragePercent: "75" },
      requiredConstantMonthlyContribution: "4500000",
      plannedMonthlyContribution: input.monthlyContribution ?? "0",
      additionalMonthlyContribution: "4500000",
      savingsStatus: "ADDITIONAL_CONTRIBUTION_REQUIRED",
      retirementFundingShortfall: "300000000",
      excessAtRetirement: "0",
      unfundedWithdrawals: "0",
      terminalBalance: "0",
      terminalTarget: "0",
      terminalTargetShortfall: "0",
    };
    await route.fulfill({
      json: {
        data: {
          status: "READY",
          issues: [],
          warnings: options.warnings ?? ["PENSION_NOT_INCLUDED"],
          inputHash: "test-hash",
          profileRevision: 1,
          valuationDate: "2026-10-15",
          references: {},
          selection: input,
          calculation: { summary, rows: [], limitations: [] },
        },
      },
    });
  });

  if (options.simPrefill) {
    await page.addInitScript((data) => {
      sessionStorage.setItem("anhuu_simulator_prefill", JSON.stringify(data));
    }, options.simPrefill);
  }

  await page.clock.setFixedTime(new Date("2026-10-15T05:00:00Z"));
  return { calls, errors, state };
}


// The four-step completion, persistence, resume, mobile layout and policy-answer
// regressions live in survey-demo-parity.spec.ts against the fixture HTTP server.
test("simulator prefill is consumed once", async ({ page }) => {
  await setupQuick(page, { simPrefill: { currentAge: 42, desiredRetirementAge: 62, monthlyExpenseToday: 35000000, timestamp: new Date("2026-10-15T05:00:00Z").getTime() } });
  await page.goto("/onboarding");
  await expect(page.getByTestId("sim-prefilled-badge")).toBeVisible();
  await expect(page.getByLabel("Chi tiêu nghỉ hưu mỗi tháng", { exact: true })).toHaveValue("35.000.000");
  await expect(page.getByLabel("Bạn muốn nghỉ hưu năm bao nhiêu tuổi?", { exact: true })).toHaveValue("62");
  await page.getByLabel("Ngày tháng năm sinh", { exact: true }).fill("15/06/1984");
  await page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  await expect(page.locator("#step2-title")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("anhuu_simulator_prefill"))).toBeNull();
});

test("legacy draft retains its existing journey", async ({ page }) => {
  await setupQuick(page, { draft: { revision: 1, schemaVersion: 1, data: { step: "welcome", primaryIncome: 25000000, essentialExpense: 18000000 } } });
  await page.goto("/onboarding");
  await expect(page.getByRole("button", { name: "Bắt đầu khai báo" })).toBeVisible();
});

test("unentered birth date cannot advance or write a profile", async ({ page }) => {
  const { calls } = await setupQuick(page);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Tiếp tục →", exact: true }).click();
  await expect(page.locator("#step1-title")).toBeVisible();
  expect(calls.filter(call => /financial-profile|onboarding-draft|onboarding\/complete/.test(call.path))).toEqual([]);
});
