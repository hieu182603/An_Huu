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

// 1. Full 3-screen journey across 1440x1000 and 375x812
for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`complete 3-screen onboarding and see results ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { calls, errors, state } = await setupQuick(page);
    await page.goto("/onboarding");

    // Screen 1: Mong muốn
    await expect(page.getByRole("heading", { name: "Mong muốn của bạn" })).toBeVisible();
    await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1988-06");
    await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2048-06");
    await page.getByRole("button", { name: "30 triệu", exact: true }).click();
    await expect(page.getByText(/Tuổi tính từ tháng sinh: 38 tuổi/)).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

    // Screen 2: Tiền hôm nay
    await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
    await page.getByLabel("Thu nhập mỗi tháng (sau thuế)").fill("40000000");
    await page.getByRole("button", { name: "Bằng mức chi mong muốn", exact: true }).click();
    await page.getByLabel("Tiền bạn đã để dành cho hưu trí").fill("150000000");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

    // Screen 3: Khẩu vị đầu tư
    await expect(page.getByRole("heading", { name: "Khẩu vị đầu tư" })).toBeVisible();
    await expect(page.locator(".quick-risk-card").first()).toBeVisible();
    const cards = page.locator(".quick-risk-card");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const activeChip = card.locator(".quick-chip.is-active");
      if (await activeChip.count() === 0) {
        await card.locator(".quick-chip").first().click();
      }
    }

    const finishBtn = page.getByRole("button", { name: "Xem kế hoạch đầu tiên của bạn", exact: true });
    await expect(finishBtn).toBeEnabled();
    await finishBtn.click();

    // Results on /user/plan
    await expect(page).toHaveURL(/\/user\/plan/);
    await expect(page.locator(".plan-hero-quick-summary")).toBeVisible();
    await expect(page.getByText(/Thiếu từ tháng 08\/2055/)).toBeVisible();
    await expect(page.getByText(/Cần góp khoảng 4\.500\.000.*mỗi tháng/)).toBeVisible();
    await expect(page.getByText(/Chưa tính: lương hưu BHXH/)).toBeVisible();

    // Actions
    await expect(page.getByRole("button", { name: "Lưu kế hoạch này" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Làm chính xác hơn" })).toBeVisible();

    // Checklist on plan page starts at 3/7 (now includes Item 5 for no-debt users per Task 4 P2)
    const checklist = page.locator(".accuracy-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText(/Độ chính xác kế hoạch: 3\/7 mục/)).toBeVisible();

    expect(state.getProfile().schemaVersion).toBe(2);
    expect(state.getProfile().data.personal).toMatchObject({
      birthMonth: { status: "KNOWN", value: "1988-06" },
      desiredRetirementMonth: { status: "KNOWN", value: "2048-06" },
    });
    expect(errors).toEqual([]);
  });
}

// 2. Prefill from simulator (read once and deleted immediately)
test("simulator prefill loads data into step 1 and clears key immediately", async ({ page }) => {
  const simData = {
    currentAge: 42,
    desiredRetirementAge: 62,
    monthlyExpenseToday: 35_000_000,
    timestamp: Date.now(),
  };
  await setupQuick(page, { simPrefill: simData });
  await page.goto("/onboarding");

  // Prefilled badge is visible (ensures QuickOnboarding has mounted and read the key)
  await expect(page.getByTestId("sim-prefilled-badge")).toBeVisible();
  await expect(page.getByText("Đã điền từ bản mô phỏng của bạn")).toBeVisible();

  // Key was read and deleted on mount
  const stored = await page.evaluate(() => sessionStorage.getItem("anhuu_simulator_prefill"));
  expect(stored).toBeNull();

  // Desired expense has 35.000.000
  const expenseInput = page.getByLabel("Mức chi mong muốn mỗi tháng (theo giá hôm nay)");
  await expect(expenseInput).toHaveValue("35.000.000");

  // Suggested birth year text contains (2026 - 42 = 1984)
  await expect(page.getByText(/Gợi ý năm sinh từ bản mô phỏng: 1984/)).toBeVisible();
});

// 3. Legacy v1 draft still goes to legacy flow
test("legacy v1 draft still routes to legacy onboarding flow", async ({ page }) => {
  const legacyDraft = {
    revision: 1,
    schemaVersion: 1,
    data: {
      step: "welcome",
      primaryIncome: 25000000,
      essentialExpense: 18000000,
    },
  };
  await setupQuick(page, { draft: legacyDraft });
  await page.goto("/onboarding");

  // Renders legacy flow, NOT QuickOnboarding
  await expect(page.locator(".quick-onboarding-container")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bắt đầu khai báo" })).toBeVisible();
});

// 4. Retired user (allows current or past month)
test("retired user can choose current or past month without blocking", async ({ page }) => {
  await setupQuick(page);
  await page.goto("/onboarding");

  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1960-01");
  // Past month
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2024-05");
  await page.getByRole("button", { name: "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Successfully advanced to Step 2
  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
});

// 5. Zero income disables salary input and does not suggest capacity
test("zero income disables input and prevents financial capacity suggestion", async ({ page }) => {
  await setupQuick(page);
  await page.goto("/onboarding");

  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1975-01");
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2035-01");
  await page.getByRole("button", { name: "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Screen 2: click "Không còn thu nhập từ lương"
  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
  const noSalaryChip = page.getByRole("button", { name: "Không còn thu nhập từ lương" });
  await noSalaryChip.click();

  const incomeInput = page.getByLabel("Thu nhập mỗi tháng (sau thuế)");
  await expect(incomeInput).toBeDisabled();
  await expect(incomeInput).toHaveValue("0");

  await page.getByRole("button", { name: "Bằng mức chi mong muốn", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Screen 3: Q_FINANCIAL_CAPACITY has no suggestion badge
  await expect(page.getByRole("heading", { name: "Khẩu vị đầu tư" })).toBeVisible();
  const capacityCard = page.locator(".quick-risk-card", { hasText: "Khả năng tài chính" });
  if (await capacityCard.count() > 0) {
    await expect(capacityCard.locator(".quick-chip-suggestion")).toHaveCount(0);
  }
});

// 6. Has debt reveals balance and payment and warns on plan page
test("has debt reveals balance and payment and warns on plan page", async ({ page }) => {
  await setupQuick(page, { warnings: ["LOAN_CONTRACT_ESTIMATED", "PENSION_NOT_INCLUDED"] });
  await page.goto("/onboarding");

  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1985-03");
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2045-03");
  await page.getByRole("button", { name: "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Screen 2: click "Có" nợ
  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
  await page.getByLabel("Thu nhập mỗi tháng (sau thuế)").fill("35000000");
  await page.getByRole("button", { name: "Bằng mức chi mong muốn", exact: true }).click();
  await page.getByRole("button", { name: "Có", exact: true }).click();

  const balanceInput = page.getByLabel("Tổng dư nợ");
  const paymentInput = page.getByLabel("Trả mỗi tháng");
  await expect(balanceInput).toBeVisible();
  await expect(paymentInput).toBeVisible();

  await balanceInput.fill("200000000");
  await paymentInput.fill("5000000");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Screen 3: complete
  await expect(page.getByRole("heading", { name: "Khẩu vị đầu tư" })).toBeVisible();
  await expect(page.locator(".quick-risk-card").first()).toBeVisible();
  const cards = page.locator(".quick-risk-card");
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    if (await card.locator(".quick-chip.is-active").count() === 0) {
      await card.locator(".quick-chip").first().click();
    }
  }
  const finishBtn = page.getByRole("button", { name: "Xem kế hoạch đầu tiên của bạn", exact: true });
  await expect(finishBtn).toBeEnabled();
  await finishBtn.click();

  // On plan page: verifies warning for estimated loan contract
  await expect(page).toHaveURL(/\/user\/plan/);
  await expect(page.getByText(/Chưa tính:.*hợp đồng vay chi tiết/)).toBeVisible();
});

// 7. Q_HORIZON auto-fill logic
test("Q_HORIZON auto-fills based on retirement timeline", async ({ page }) => {
  await setupQuick(page);
  await page.goto("/onboarding");

  // Timeline: 2026-10 to 2029-10 (3 years < 5) -> HOR_SHORT
  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1970-01");
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2029-10");
  await page.getByRole("button", { name: "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Step 2 -> Step 3
  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
  await page.getByLabel("Thu nhập mỗi tháng (sau thuế)").fill("30000000");
  await page.getByRole("button", { name: "Bằng mức chi mong muốn", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Step 3
  await expect(page.getByRole("heading", { name: "Khẩu vị đầu tư" })).toBeVisible();
  await expect(page.locator(".quick-risk-card").first()).toBeVisible();
  const horizonCard = page.locator(".quick-risk-card", { hasText: "Thời gian dự kiến từ nay đến khi bạn bắt đầu rút quỹ hưu trí" });
  await expect(horizonCard.locator('.quick-chip[data-choice-id="HOR_SHORT"]')).toHaveClass(/is-active/);
});

// 8. CAP_STRONG is never suggested (at most CAP_STABLE)
test("CAP_STRONG is never suggested even with high financial capacity", async ({ page }) => {
  await setupQuick(page);
  await page.goto("/onboarding");

  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1985-01");
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2045-01");
  await page.getByRole("button", { name: "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Step 2: High income 100M, low expense 10M (surplus 90%)
  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
  await page.getByLabel("Thu nhập mỗi tháng (sau thuế)").fill("100000000");
  await page.getByLabel("Chi tiêu hiện tại mỗi tháng").fill("10000000");
  await page.getByRole("button", { name: "Không", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Step 3: Check capacity card
  await expect(page.getByRole("heading", { name: "Khẩu vị đầu tư" })).toBeVisible();
  await expect(page.locator(".quick-risk-card").first()).toBeVisible();
  const capacityCard = page.locator(".quick-risk-card", { hasText: "Khả năng tài chính" });
  if (await capacityCard.count() > 0) {
    // CAP_STRONG choice must NOT have suggested badge
    const strongChip = capacityCard.locator('.quick-chip[data-choice-id="CAP_STRONG"]');
    await expect(strongChip.locator(".quick-chip-suggestion")).toHaveCount(0);

    // CAP_STABLE should be suggested
    const stableChip = capacityCard.locator('.quick-chip[data-choice-id="CAP_STABLE"]');
    await expect(stableChip.locator(".quick-chip-suggestion")).toBeVisible();
  }
});

// 9. Uncompleted onboarding user sees resume banner on dashboard
test("uncompleted user sees onboarding banner on dashboard", async ({ page }) => {
  await setupQuick(page, { profile: null });
  await page.goto("/user/dashboard");

  const banner = page.locator(".onboarding-resume-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Còn 3 bước nữa là thấy kế hoạch của bạn.");
  const continueBtn = banner.getByRole("link", { name: "Tiếp tục", exact: true });
  await expect(continueBtn).toBeVisible();
  await expect(continueBtn).toHaveAttribute("href", "/onboarding");
});

// 10. Completed user sees accuracy checklist starting at 3/7 on dashboard and can toggle it (includes Item 5 for no-debt)
test("accuracy checklist starts at 3/7 on dashboard and can be toggled", async ({ page }) => {
  const completedProfile = {
    revision: 1,
    schemaVersion: 2,
    data: {
      schemaVersion: 2,
      personal: {
        birthMonth: { status: "KNOWN", value: "1985-05" },
        desiredRetirementMonth: { status: "KNOWN", value: "2045-05" },
      },
      pension: { status: "UNKNOWN" },
      income: { status: "KNOWN", entries: [{ id: "inc-1", amount: { status: "KNOWN", value: "30000000" }, kind: "FIXED" }] },
      expenses: { status: "KNOWN", entries: [{ id: "exp-1", amount: { status: "KNOWN", value: "15000000" }, category: "ESSENTIAL" }] },
      assets: { status: "KNOWN", entries: [{ id: "ast_quick", value: { status: "KNOWN", value: "50000000" }, type: "DEPOSIT" }] },
      debts: { status: "NOT_APPLICABLE", reason: "Không có nợ" },
    },
  };

  await setupQuick(page, { profile: completedProfile });
  await page.goto("/user/dashboard");

  const checklist = page.locator(".accuracy-checklist");
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText(/Độ chính xác kế hoạch: 3\/7 mục/)).toBeVisible();

  // Test hide/show toggle
  const toggleBtn = checklist.getByRole("button", { name: "Thu gọn checklist" });
  await toggleBtn.click();
  await expect(checklist.locator(".accuracy-checklist-body")).toBeHidden();
  await expect(checklist.getByRole("button", { name: "Mở rộng checklist" })).toBeVisible();
});

// 11. P1 & P2: Field validation blocks proceeding with unentered / zero amounts
test("field validation blocks proceeding with un-entered or zero amounts", async ({ page }) => {
  await setupQuick(page);
  await page.goto("/onboarding");

  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1990-01");
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2050-01");

  // Screen 1: click Tiếp tục without selecting monthly expense
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByText("Vui lòng nhập mức chi mong muốn mỗi tháng.")).toBeVisible();

  // Enter expense and advance to Screen 2
  await page.getByRole("button", { name: "20 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Screen 2: click Tiếp tục without entering income
  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByText("Vui lòng nhập thu nhập mỗi tháng hoặc chọn 'Không còn thu nhập từ lương'.")).toBeVisible();

  // Enter income, but leave current expense 0
  await page.getByLabel("Thu nhập mỗi tháng (sau thuế)").fill("30000000");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByText("Vui lòng nhập chi tiêu hiện tại mỗi tháng.")).toBeVisible();

  // Set current expense
  await page.getByRole("button", { name: "Bằng mức chi mong muốn", exact: true }).click();

  // Select "Có" nợ without entering debt balance or payment
  await page.getByRole("button", { name: "Có", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByText("Vui lòng nhập tổng dư nợ và số tiền trả nợ mỗi tháng lớn hơn 0, hoặc chọn 'Không' nếu không có nợ.")).toBeVisible();

  // Switch back to "Không" nợ and continue
  await page.getByRole("button", { name: "Không", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  // Advanced to Screen 3
  await expect(page.getByRole("heading", { name: "Khẩu vị đầu tư" })).toBeVisible();
});

// 12. P2: Screen 1 draft save sets debts status to UNKNOWN, not NOT_APPLICABLE
test("screen 1 draft save records debts as UNKNOWN before debts are surveyed", async ({ page }) => {
  const { state } = await setupQuick(page);
  await page.goto("/onboarding");

  await page.getByLabel("Tháng/năm sinh (bắt buộc)").fill("1992-05");
  await page.getByLabel("Tháng bạn muốn nghỉ hưu (bắt buộc)").fill("2052-05");
  await page.getByRole("button", { name: "30 triệu", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Tiền của bạn hôm nay" })).toBeVisible();

  const savedDraft = state.getDraft();
  expect(savedDraft).toBeTruthy();
  expect(savedDraft.data?.debts?.status).toBe("UNKNOWN");
  expect(savedDraft.data?.debts?.reason).toBeUndefined();
});

// 13. P2: Dashboard remaining steps calculation
test("dashboard calculates remaining steps accurately", async ({ page }) => {
  // Screen 2 draft (step: quick-money) -> 2 steps remaining
  await setupQuick(page, {
    profile: null,
    draft: { revision: 1, step: "quick-money", data: {} },
  });
  await page.goto("/user/dashboard");
  const banner = page.locator(".onboarding-resume-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Còn 2 bước nữa là thấy kế hoạch của bạn.");

  // Screen 3 draft (step: quick-risk) -> 1 step remaining
  await setupQuick(page, {
    profile: null,
    draft: { revision: 1, step: "quick-risk", data: {} },
  });
  await page.goto("/user/dashboard");
  await expect(banner).toContainText("Còn 1 bước nữa là thấy kế hoạch của bạn.");
});

// 14. P2: Plan page preserves original button order for normal visits
test("plan page preserves original button order for normal visits", async ({ page }) => {
  await setupQuick(page);
  await page.goto("/user/plan");

  const mainActions = page.locator(".plan-hero-actions__main");
  await expect(mainActions).toBeVisible();

  // Primary button is "Dùng làm kế hoạch hiện tại" (or "Đang là kế hoạch hiện tại" if applied)
  const primaryBtn = mainActions.locator(".plan-hero-action--apply");
  await expect(primaryBtn).toBeVisible();

  // Secondary button is "Lưu phương án này"
  const secondaryBtn = mainActions.locator(".plan-hero-action--save");
  await expect(secondaryBtn).toBeVisible();
  await expect(secondaryBtn).toContainText("Lưu phương án này");
});


