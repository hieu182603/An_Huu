import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

function createV2Profile(debtsOverride?: any) {
  return {
    schemaVersion: 2,
    profileRevision: 1,
    data: {
      valuationDate: "2026-10-15",
      currency: "VND",
      periodUnit: "MONTH",
      personal: {
        birthMonth: { status: "KNOWN", value: "1988-06" },
        desiredRetirementMonth: { status: "KNOWN", value: "2048-06" },
        dependents: { status: "KNOWN", value: 0 },
        city: "Hà Nội",
      },
      income: {
        status: "KNOWN",
        entries: [
          {
            id: "inc-1",
            label: "Lương",
            kind: "FIXED",
            source: "EMPLOYMENT",
            basis: "DISPOSABLE",
            amount: { status: "KNOWN", value: "30000000" },
            currency: "VND",
            startMonth: "2026-01",
            endMonth: null,
            frequency: "MONTHLY",
          },
        ],
      },
      expenses: {
        status: "KNOWN",
        entries: [
          {
            id: "exp-1",
            label: "Chi tiêu sinh hoạt",
            category: "ESSENTIAL",
            amount: { status: "KNOWN", value: "15000000" },
            currency: "VND",
            startMonth: "2026-01",
            endMonth: null,
            frequency: "MONTHLY",
          },
        ],
      },
      assets: {
        status: "KNOWN",
        entries: [
          {
            id: "ast-1",
            label: "Tiền gửi tiết kiệm",
            type: "DEPOSIT",
            value: { status: "KNOWN", value: "200000000" },
            currency: "VND",
            ownershipShare: { status: "KNOWN", value: "1" },
            valuedOn: { status: "KNOWN", value: "2026-10-15" },
            retirementShare: { status: "KNOWN", value: "1" },
            liquidity: { status: "KNOWN", value: "LIQUID" },
            availableFromMonth: { status: "KNOWN", value: "2026-10" },
          },
        ],
      },
      debts: debtsOverride ?? {
        status: "NOT_APPLICABLE",
        reason: "Không có nợ",
      },
      pension: { status: "UNKNOWN" },
    },
    summary: {
      status: "CALCULATED",
      values: {
        monthlyIncome: "30000000",
        monthlyExpense: "15000000",
        monthlyDebtService: "0",
        availableMonthlySurplus: "15000000",
        totalAssets: "200000000",
        totalDebt: "0",
        netWorth: "200000000",
      },
    },
  };
}

async function setupPageEnv(page: Page, options: {
  profile?: any;
  requiredContribution?: string;
  contributionCapacity?: string;
  activePlan?: boolean;
} = {}) {
  const previewCalls: any[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const userId = "USR-FIXES";

  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } })
  );
  await installRouteAuth(page, userId);
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());

  const profile = options.profile ?? createV2Profile();
  await installFinancialProfileRoutes(page, { profile });

  const reqConstant = options.requiredContribution ?? "4500000.1234567890123456789012345678901234567890";
  const capacity = options.contributionCapacity ?? "3000000.888888888";

  const defaultSummary = {
    retirementMonth: "2048-06",
    endMonth: "2065-01",
    accumulationMonths: 240,
    retirementMonths: 200,
    initialRetirementCapital: "200000000",
    futureMonthlyExpense: "30000000",
    firstShortfallMonth: null,
    atRetirement: { requiredFund: "1500000000", projectedFund: "1600000000", fundingGap: "0", coveragePercent: "106.7" },
    atValuation: { requiredFund: "1500000000", projectedFund: "1600000000", fundingGap: "0", coveragePercent: "106.7" },
    requiredConstantMonthlyContribution: reqConstant,
    plannedMonthlyContribution: "0",
    additionalMonthlyContribution: "0",
    savingsStatus: "ON_TRACK",
    retirementFundingShortfall: "0",
    excessAtRetirement: "100000000",
    unfundedWithdrawals: "0",
    terminalBalance: "50000000",
    terminalTarget: "0",
    terminalTargetShortfall: "0",
  };

  const planVersion = {
    id: "plan-ver-1",
    version: 1,
    planId: "plan-1",
    planRevision: 1,
    summary: defaultSummary,
    preview: {
      profileRevision: 1,
      valuationDate: "2026-10-15",
      selection: {
        policyVersionId: "policy-test",
        monthlyContribution: "0",
        monthlyReserve: "0",
        contributionTiming: "END_OF_MONTH",
        surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
      },
      calculation: {
        summary: defaultSummary,
        rows: [{ contributionCapacity: capacity }],
        limitations: [],
      },
    },
  };

  const planDetail = options.activePlan
    ? {
        id: "plan-1",
        revision: 1,
        currentVersionId: "plan-ver-1",
        baselineVersionId: "plan-ver-1",
        current: planVersion,
      }
    : null;

  await page.route("**/api/v1/me/retirement/plans**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/plans")) {
      return route.fulfill({
        json: {
          data: {
            items: planDetail ? [{ id: "plan-1" }] : [],
            total: planDetail ? 1 : 0,
          },
        },
      });
    }
    if (url.pathname.endsWith("/versions")) {
      return route.fulfill({
        json: {
          data: {
            items: planDetail ? [planVersion] : [],
            total: planDetail ? 1 : 0,
          },
        },
      });
    }
    return route.fulfill({ json: { data: planDetail } });
  });

  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies**", (route) => {
    return route.fulfill({
      json: {
        data: new URL(route.request().url()).pathname.endsWith("/policy-test")
          ? policy
          : { status: "AVAILABLE", items: [policy] },
      },
    });
  });

  await page.route("**/api/v1/me/retirement/preview*", async (route) => {
    const input = route.request().postDataJSON();
    previewCalls.push(input);

    const summary = {
      ...defaultSummary,
      requiredConstantMonthlyContribution: reqConstant,
      plannedMonthlyContribution: input.monthlyContribution ?? "0",
    };

    await route.fulfill({
      json: {
        data: {
          status: "READY",
          issues: [],
          warnings: [],
          inputHash: `test-hash-${previewCalls.length}`,
          profileRevision: 1,
          valuationDate: "2026-10-15",
          references: {},
          selection: input,
          calculation: {
            summary,
            rows: [{ contributionCapacity: capacity }],
            limitations: [],
          },
        },
      },
    });
  });

  await page.route("**/api/v1/me/debts/preview**", (route) => {
    return route.fulfill({
      json: {
        data: {
          baseline: {
            rows: [],
          },
          accelerated: {
            rows: [],
          },
        },
      },
    });
  });

  // Pre-seed survey answers in localStorage for policy-test so hasCompleteSurvey is true
  const answers: Record<string, string> = {};
  for (const q of policies.v2.questions ?? []) {
    if (q.choices?.[0]?.id) answers[q.id] = q.choices[0].id;
  }
  await page.addInitScript(
    ({ uid, ans }) => {
      localStorage.setItem(`anhuu:risk:${uid}:policy-test`, JSON.stringify(ans));
    },
    { uid: userId, ans: answers }
  );

  await page.clock.setFixedTime(new Date("2026-10-15T05:00:00Z"));

  return { previewCalls, errors };
}

test.describe("Task đợt 4 — Sửa số hiển thị sai ở các trang user", () => {
  test("1. Mở trang Mục tiêu rồi sang Kế hoạch: không có request preview nào gửi whatIf: {}", async ({ page }) => {
    const { previewCalls } = await setupPageEnv(page, { activePlan: true });

    await page.goto("/user/goal");
    await page.waitForLoadState("domcontentloaded");

    // Click "Xem trước kế hoạch" to navigate to /user/plan
    const previewBtn = page.getByRole("button", { name: /Xem trước kế hoạch/i });
    await expect(previewBtn).toBeVisible({ timeout: 5000 });
    await previewBtn.click();

    await page.waitForURL("**/user/plan");
    await page.waitForTimeout(800);

    // Verify all preview calls sent: whatIf must NEVER be an empty object {}
    expect(previewCalls.length).toBeGreaterThan(0);
    for (const call of previewCalls) {
      if ("whatIf" in call && call.whatIf !== undefined) {
        expect(Object.keys(call.whatIf).length).toBeGreaterThan(0);
      }
    }
  });

  test("2. Chip 'Góp đủ mức cần' và 'Toàn bộ phần dư' gửi chuỗi số nguyên khi backend trả số nhiều chữ số thập phân", async ({ page }) => {
    const reqWithDecimals = "4500000.1234567890123456789012345678901234567890";
    const capacityWithDecimals = "3000000.987654321";

    const { previewCalls } = await setupPageEnv(page, {
      requiredContribution: reqWithDecimals,
      contributionCapacity: capacityWithDecimals,
      activePlan: false,
    });

    await page.goto("/user/plan");
    await page.waitForLoadState("domcontentloaded");

    // Verify chip 1 displays rounded-up integer (4.500.001 ₫)
    const chip1 = page.locator(".plan-settings__chip").filter({ hasText: /Góp đủ mức cần/i });
    await expect(chip1).toBeVisible({ timeout: 5000 });
    await expect(chip1).toContainText("4.500.001");

    // Click chip 1: should update draft with integer "4500001"
    await chip1.click();
    await page.waitForTimeout(500);

    const latestCallChip1 = previewCalls[previewCalls.length - 1];
    expect(latestCallChip1.monthlyContribution).toBe("4500001");

    // Verify chip 2 displays rounded-down integer (3.000.000 ₫)
    const chip2 = page.locator(".plan-settings__chip").filter({ hasText: /Toàn bộ phần dư/i });
    await expect(chip2).toBeVisible();
    await expect(chip2).toContainText("3.000.000");

    // Click chip 2: should update draft with integer "3000000"
    await chip2.click();
    await page.waitForTimeout(500);

    const latestCallChip2 = previewCalls[previewCalls.length - 1];
    expect(latestCallChip2.monthlyContribution).toBe("3000000");
  });

  test("3. Checklist với người không có nợ: mục 5 được đánh dấu đã xong và không gợi ý ước tính", async ({ page }) => {
    const noDebtProfile = createV2Profile({
      status: "NOT_APPLICABLE",
      reason: "Không có nợ",
    });

    await setupPageEnv(page, { profile: noDebtProfile, activePlan: true });

    await page.goto("/user/plan");
    await page.waitForLoadState("domcontentloaded");

    const checklist = page.locator(".accuracy-checklist");
    await expect(checklist).toBeVisible({ timeout: 5000 });

    const completedDetails = checklist.locator(".checklist-completed-details");
    await expect(completedDetails).toBeVisible();

    // Click summary to expand
    await completedDetails.locator("summary").click();

    // Item 5 "Chi tiết khoản vay" should be in the completed list
    const completedItems = completedDetails.locator(".checklist-completed-item");
    await expect(completedItems.filter({ hasText: /Chi tiết khoản vay/i })).toBeVisible();

    // The copy "Khoản vay đang được ước tính…" must NOT appear anywhere in the checklist
    await expect(checklist.locator("text=Khoản vay đang được ước tính")).not.toBeVisible();
  });

  test("4. Trang Khoản vay (DebtAnalysisPage): thu nhập > 0 và tổng trả nợ = 0 thì DTI = 0%", async ({ page }) => {
    const noDebtProfile = createV2Profile({
      status: "NOT_APPLICABLE",
      reason: "Không có nợ",
    });

    await setupPageEnv(page, { profile: noDebtProfile });

    await page.goto("/user/debts");
    await page.waitForLoadState("domcontentloaded");

    // The gauge number should show "0%"
    const dtiNumber = page.locator(".debt-dti-number");
    await expect(dtiNumber).toBeVisible({ timeout: 5000 });
    await expect(dtiNumber).toHaveText("0%");

    // The status badge should show safe zone (< 30%), NOT "Chưa đủ dữ liệu"
    const dtiBadge = page.locator(".debt-dti-badge");
    await expect(dtiBadge).toContainText("Tỷ lệ trả nợ dưới 30%");
    await expect(dtiBadge).not.toContainText("Chưa đủ dữ liệu");
  });
});
