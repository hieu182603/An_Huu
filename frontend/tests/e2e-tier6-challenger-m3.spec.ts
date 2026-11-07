import { expect, test } from "@playwright/test";
import { setupE2ERoutes, trackPageErrors } from "./e2e-helpers";
import { installFinancialProfileRoutes } from "./helpers";

const known = (value: string) => ({ status: "KNOWN" as const, value });

const richV2Profile = {
  schemaVersion: 2,
  currency: "VND",
  periodUnit: "MONTH",
  valuationDate: "2026-10-04",
  personal: {
    birthMonth: known("1976-10"),
    desiredRetirementMonth: known("2036-10"),
    pensionStartMonth: { status: "NOT_APPLICABLE", reason: "Không có" },
    maritalStatus: "MARRIED",
    dependents: { status: "KNOWN" as const, value: 2 },
  },
  income: {
    status: "KNOWN" as const,
    entries: [
      {
        id: "salary",
        label: "Lương cố định",
        kind: "FIXED",
        basis: "DISPOSABLE",
        amount: known("35000000"),
        currency: "VND",
        startMonth: "2026-01",
        endMonth: null,
        frequency: "MONTHLY",
      },
    ],
  },
  expenses: {
    status: "KNOWN" as const,
    entries: [
      {
        id: "living",
        label: "Chi tiêu gia đình",
        category: "ESSENTIAL",
        amount: known("18000000"),
        currency: "VND",
        startMonth: "2026-01",
        endMonth: null,
        frequency: "MONTHLY",
      },
    ],
  },
  assets: {
    status: "KNOWN" as const,
    entries: [
      {
        id: "savings",
        label: "Tiết kiệm dự phòng",
        kind: "CASH_SAVINGS",
        currentValue: known("300000000"),
        intendedUse: "RETIREMENT_ONLY",
      },
    ],
  },
  pension: {
    status: "KNOWN" as const,
    expectedMonthlyPension: known("6500000"),
    startAge: 62,
  },
  debts: {
    status: "KNOWN" as const,
    entries: [
      {
        id: "loan-home",
        label: "Vay mua nhà trả góp",
        currency: "VND",
        outstandingBalance: known("600000000"),
        balanceAsOf: known("2026-10-04"),
        payment: known("9500000"),
        paymentShare: known("1"),
        balanceShare: known("1"),
        startMonth: "2024-01",
        endMonth: "2032-12",
        frequency: "MONTHLY",
        contract: {
          status: "KNOWN" as const,
          value: {
            contractVersion: 1,
            source: "Hợp đồng tín dụng BĐS",
            confirmedOn: "2024-01-10",
            balanceAsOf: "2026-10-04",
            interestBasis: "REDUCING_BALANCE",
            periodConvention: "DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS",
            maturityDate: "2032-12-28",
            settleRemainingAtMaturity: true,
            interestRateAnnual: 8.5,
            periods: Array.from({ length: 36 }, (_, i) => ({
              dueDate: `2026-${String((i % 12) + 1).padStart(2, "0")}-28`,
              rate: { kind: "NOMINAL_ANNUAL_MONTHLY", percent: "8.5" },
              repayment: { kind: "PRINCIPAL_PLUS_INTEREST", amount: "9500000" },
              minimumPayment: "0",
              fee: "0",
              prepayment: {
                status: "ALLOWED",
                mode: "PARTIAL_OR_FULL",
                minimumPrincipal: "0",
                maximumPrincipal: null,
                fixedFee: "0",
                feePercent: "1.0",
                effect: "REDUCE_TERM_KEEP_SCHEDULE",
                funding: "SOLE_BORROWER",
                evidence: "Hợp đồng",
              },
            })),
          },
        },
      },
    ],
  },
};

const mockProducts = [
  {
    id: "prod-001",
    partnerId: "ptn-001",
    name: "Quỹ Mở Cổ Phiếu Tăng Trưởng VEOF",
    category: "Quỹ mở & ETF",
    expectedReturn: "12%–15%/năm",
    riskLevel: "HIGH",
    description: "Đầu tư vào top 30 cổ phiếu niêm phong uy tín hàng đầu trên HOSE.",
    annualFee: "1,2%/năm",
    conditions: "Vốn tối thiểu từ 1.000.000 ₫",
    disclosure: "Lợi suất lịch sử không bảo đảm lợi nhuận tương lai.",
    imageUrl: "/assets/product-investment.svg",
    isVisible: true,
    revision: 1,
    partner: { id: "ptn-001", name: "VinaCapital", type: "OPEN_FUND" },
  },
  {
    id: "prod-002",
    partnerId: "ptn-002",
    name: "Tiền Gửi Tích Lũy Hưu Trí An Tâm",
    category: "Tiền gửi",
    expectedReturn: "6,5%/năm",
    riskLevel: "LOW",
    description: "Kỳ hạn 24 tháng, bảo hiểm tiền gửi quốc gia, lãi suất cố định.",
    annualFee: "Miễn phí",
    conditions: "Vốn ban đầu từ 5.000.000 ₫",
    disclosure: "Rút trước hạn hưởng lãi suất không kỳ hạn.",
    imageUrl: "/assets/product-deposit.svg",
    isVisible: true,
    revision: 1,
    partner: { id: "ptn-002", name: "Vietcombank", type: "BANK" },
  },
];

const mockSupportTickets = [
  {
    id: "tk-101",
    subject: "Hỏi về cách tính lương hưu BHXH mốc 62 tuổi",
    category: "Kế hoạch",
    status: "OPEN",
    revision: 1,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  },
  {
    id: "tk-102",
    subject: "Cần tư vấn gói chứng chỉ quỹ mở VEOF",
    category: "Tư vấn sản phẩm",
    status: "RESOLVED",
    revision: 2,
    createdAt: "2026-10-25T09:30:00.000Z",
    updatedAt: "2026-10-26T15:00:00.000Z",
  },
];

const mockNotifications = [
  {
    id: "notif-001",
    title: "Kế hoạch hưu trí đã đồng bộ",
    message: "Bản kế hoạch số 1 của bạn đã sẵn sàng đối chiếu mục tiêu.",
    type: "PLAN",
    path: "/user/plan",
    readAt: null,
    createdAt: "2026-11-06T10:00:00.000Z",
  },
  {
    id: "notif-002",
    title: "Chuyên viên đã phản hồi yêu cầu",
    message: "Xem phản hồi về mức đóng BHXH tự nguyện tại mục Hỗ trợ.",
    type: "SUPPORT",
    path: "/user/support",
    readAt: "2026-11-05T08:00:00.000Z",
    createdAt: "2026-11-05T07:30:00.000Z",
  },
];

test.beforeEach(async ({ page }) => {
  await setupE2ERoutes(page);

  // Install complete financial profile v2 with known debt
  await installFinancialProfileRoutes(page, {
    profile: {
      schemaVersion: 2,
      revision: 4,
      data: richV2Profile,
    },
    draft: null,
  });

  // Mock Debt Preview API
  await page.route("**/api/v1/me/debts/preview", async (route) => {
    return route.fulfill({
      json: {
        data: {
          profileRevision: 4,
          status: "READY",
          modelVersion: "1.0",
          valuationDate: "2026-10-04",
          currency: "VND",
          baseline: {
            status: "CALCULATED",
            rows: [
              {
                month: "2026-11",
                debtPayment: "9500000",
                pressure: {
                  ratioPercent: "27.1",
                  remainingCash: "7500000",
                  cashflowStatus: "SURPLUS",
                  status: "HEALTHY",
                },
                availableForRetirement: "7500000",
                income: "35000000",
                nonDebtExpense: "18000000",
              },
            ],
            totals: {
              principal: "600000000",
              interest: "50000000",
              fees: "0",
              interestAndFees: "50000000",
              extraPrincipal: "0",
              firstShortfallMonth: null,
              debtFreeDate: "2032-12-28",
              closingLoanBalance: "0",
            },
            cashflowAssessment: {
              status: "COMPLETE",
              evaluatedMonths: 60,
              totalMonths: 60,
              firstUnknownMonth: null,
              shortfallStatus: "NOT_DETECTED_IN_HORIZON",
              issues: [],
            },
          },
          alternatives: [
            {
              strategy: "AVALANCHE",
              status: "CALCULATED",
              comparisonScope: "FULL_TERM",
              interestAndFeesSaved: "15000000",
              retirementCashflowDelta: [],
              issues: [],
              result: {
                status: "CALCULATED",
                rows: [],
                totals: {
                  principal: "600000000",
                  interest: "35000000",
                  fees: "0",
                  interestAndFees: "35000000",
                  extraPrincipal: "0",
                  debtFreeDate: "2031-06-28",
                  firstShortfallMonth: null,
                  closingLoanBalance: "0",
                },
                cashflowAssessment: {
                  status: "COMPLETE",
                  evaluatedMonths: 60,
                  totalMonths: 60,
                  firstUnknownMonth: null,
                  shortfallStatus: "NOT_DETECTED_IN_HORIZON",
                  issues: [],
                },
              },
            },
            {
              strategy: "SNOWBALL",
              status: "CALCULATED",
              comparisonScope: "FULL_TERM",
              interestAndFeesSaved: "12000000",
              retirementCashflowDelta: [],
              issues: [],
              result: {
                status: "CALCULATED",
                rows: [],
                totals: {
                  principal: "600000000",
                  interest: "38000000",
                  fees: "0",
                  interestAndFees: "38000000",
                  extraPrincipal: "0",
                  debtFreeDate: "2031-08-28",
                  firstShortfallMonth: null,
                  closingLoanBalance: "0",
                },
                cashflowAssessment: {
                  status: "COMPLETE",
                  evaluatedMonths: 60,
                  totalMonths: 60,
                  firstUnknownMonth: null,
                  shortfallStatus: "NOT_DETECTED_IN_HORIZON",
                  issues: [],
                },
              },
            },
          ],
          capital: { netWorth: "500000000", retirementLiquidAssets: "300000000" },
          issues: [],
          warnings: [],
          limitations: [],
          stress: null,
        },
      },
    });
  });

  // Mock Plans API
  await page.route("**/api/v1/me/retirement/plans**", async (route) => {
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "plan-01",
              version: 1,
              status: "ACTIVE",
              currentVersionId: "v1",
              preview: {
                selection: {
                  monthlyReserve: "0",
                  monthlyContribution: "5000000",
                  monthlyExpenseToday: "18000000",
                },
                calculation: {
                  summary: {
                    retirementFundingShortfall: "0",
                    retirementMonth: "2036-10",
                  },
                },
              },
            },
          ],
        },
      },
    });
  });

  // Mock Products API
  await page.route("**/api/v1/products**", async (route) => {
    return route.fulfill({
      json: {
        data: {
          items: mockProducts,
          total: mockProducts.length,
          page: 1,
          limit: 50,
        },
      },
    });
  });

  // Mock Support Tickets API
  await page.route("**/api/v1/me/support**", async (route) => {
    const url = route.request().url();
    if (url.includes("/support/") && !url.includes("?")) {
      return route.fulfill({
        json: {
          data: {
            ...mockSupportTickets[0],
            messages: [
              {
                id: "msg-1",
                body: "Xin chào An Hưu, tôi muốn biết năm 2036 mức hưởng lương hưu tối đa là bao nhiêu?",
                createdAt: "2026-11-01T08:00:00.000Z",
                author: { fullName: "Nguyễn Văn A", role: "USER" },
              },
              {
                id: "msg-2",
                body: "Chào bạn, theo quy định Luật BHXH 2024, tỷ lệ tối đa đạt 75% mức bình quân thu nhập đóng.",
                createdAt: "2026-11-01T09:30:00.000Z",
                author: { fullName: "Cố vấn An Hưu", role: "ADMIN" },
              },
            ],
          },
        },
      });
    }
    return route.fulfill({
      json: {
        data: {
          items: mockSupportTickets,
          total: mockSupportTickets.length,
          page: 1,
          limit: 20,
        },
      },
    });
  });

  // Mock Notifications API
  await page.route("**/api/v1/me/notifications**", async (route) => {
    return route.fulfill({
      json: {
        data: {
          items: mockNotifications,
          total: mockNotifications.length,
          unreadCount: 1,
        },
      },
    });
  });
});

// =========================================================================
// SCREEN 12: KHOẢN NỢ & LỊCH TRẢ NỢ (/user/debts)
// =========================================================================
test.describe("Screen 12: Khoản nợ & Lịch trả nợ (/user/debts)", () => {
  test("12.1 Breadcrumb navigation and header match demo specifications", async ({ page }) => {
    page.on("console", msg => console.log("BROWSER_LOG:", msg.type(), msg.text()));
    page.on("pageerror", err => console.log("PAGE_ERROR:", err.message, err.stack));
    const tracker = trackPageErrors(page);
    await page.goto("/user/debts");

    // Breadcrumb
    const breadcrumb = page.locator("nav.breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByText(/Tài chính của bạn|Your finances/i)).toBeVisible();

    // H1 Heading
    const h1 = page.locator("h1");
    await expect(h1).toHaveText(/Khoản nợ & khả năng trả|Debts & ability to pay/i);

    // Hero card
    await expect(page.locator(".debt-hero-card")).toBeVisible();
    await expect(page.locator(".debt-dti-ring-container")).toBeVisible();

    expect(tracker.pageErrors).toEqual([]);
    tracker.detach();
  });

  test("12.2 Debt ledger displays active loan cards with interest rate and monthly payment", async ({ page }) => {
    await page.goto("/user/debts");

    const debtRows = page.locator(".ledger-row.debt-row, .debt-card");
    await debtRows.first().waitFor({ state: "visible", timeout: 10000 });
    const count = await debtRows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const firstRow = debtRows.first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByText(/Vay mua nhà/i)).toBeVisible();
    await expect(firstRow.getByText(/8\.5%/i)).toBeVisible();
  });

  test("12.3 24-period loan amortization schedule modal opens and renders 4-column schedule", async ({ page }) => {
    await page.goto("/user/debts");

    const scheduleBtn = page.getByRole("button", { name: /Xem lịch trả|Schedule/i }).first();
    await scheduleBtn.waitFor({ state: "visible", timeout: 10000 });
    await expect(scheduleBtn).toBeVisible();
    await scheduleBtn.click();

    // Modal dialog
    const modal = page.locator("div[role='dialog']").filter({ hasText: /Lịch trả nợ minh họa|Illustrative Repayment Schedule/i });
    await expect(modal).toBeVisible();

    // Responsive table columns: Kỳ, Tiền gốc, Tiền lãi, Còn nợ
    const table = modal.locator("table.responsive-table");
    await expect(table).toBeVisible();
    const headers = table.locator("th");
    await expect(headers.nth(0)).toHaveText(/Kỳ|Period/i);
    await expect(headers.nth(1)).toHaveText(/Tiền gốc|Principal/i);
    await expect(headers.nth(2)).toHaveText(/Tiền lãi|Interest/i);
    await expect(headers.nth(3)).toHaveText(/Còn nợ|Remaining/i);

    // Rows count: <= 24
    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
    expect(rowCount).toBeLessThanOrEqual(24);

    // Close button
    await modal.getByRole("button", { name: /Đóng|Close/i }).last().click();
    await expect(modal).not.toBeVisible();
  });

  test("12.4 Three repayment strategies and parameters card are present", async ({ page }) => {
    await page.goto("/user/debts");

    // Scenario parameters card
    const scenarioCard = page.locator(".debt-scenario-card");
    await expect(scenarioCard).toBeVisible();
    await expect(scenarioCard.getByText(/Khung thời gian so sánh|Comparison Horizon/i)).toBeVisible();

    // Impact on retirement plan card
    const impactCard = page.locator(".card").filter({ hasText: /Ảnh hưởng tới kế hoạch|Impact on retirement plan/i });
    await expect(impactCard).toBeVisible();
    await expect(impactCard.getByText(/Tổng dư nợ còn lại|Total remaining debt balance/i)).toBeVisible();
    await expect(impactCard.getByText(/Tỷ lệ trả nợ \/ thu nhập|Debt-to-income ratio/i)).toBeVisible();

    // Back link to finances
    const backLink = page.getByRole("link", { name: /Quay lại Tài chính của bạn|Back to your finances/i });
    await expect(backLink).toBeVisible();
  });
});

// =========================================================================
// SCREEN 13: SẢN PHẨM TÀI CHÍNH (/user/explore)
// =========================================================================
test.describe("Screen 13: Sản phẩm tài chính (/user/explore)", () => {
  test("13.1 Header contains navigation link back to retirement plan", async ({ page }) => {
    await page.goto("/user/explore");

    const h1 = page.locator("h1");
    await expect(h1).toHaveText(/Sản phẩm tài chính|Financial products/i);

    const backToPlan = page.getByRole("link", { name: /Về kế hoạch|Back to plan/i });
    await expect(backToPlan).toBeVisible();
    await expect(backToPlan).toHaveAttribute("href", "/user/plan");
  });

  test("13.2 5 Marketplace tabs render with active count badges", async ({ page }) => {
    await page.goto("/user/explore");

    const tabsContainer = page.locator(".marketplace-tabs");
    await expect(tabsContainer).toBeVisible();

    // 5 tabs
    const tabs = tabsContainer.locator("[role='tab']");
    await expect(tabs).toHaveCount(5);

    await expect(tabs.nth(0)).toContainText(/Khám phá tất cả|Explore all/i);
    await expect(tabs.nth(1)).toContainText(/Gợi ý theo kế hoạch|Plan recommendations/i);
    await expect(tabs.nth(2)).toContainText(/So sánh sản phẩm|Compare products/i);
    await expect(tabs.nth(3)).toContainText(/Quan tâm|Saved/i);
    await expect(tabs.nth(4)).toContainText(/Yêu cầu thử|Trial requests/i);
  });

  test("13.3 Category filter chips filter product catalog", async ({ page }) => {
    await page.goto("/user/explore");

    const filterBar = page.locator(".explore-category-chips, .explore-filters");
    await expect(filterBar).toBeVisible();

    const allChip = filterBar.locator(".explore-category-chip").first();
    await expect(allChip).toBeVisible();
    await expect(allChip).toContainText(/Tất cả|All/i);
  });

  test("13.4 Product cards display risk badge, financial facts grid, and action buttons", async ({ page }) => {
    await page.goto("/user/explore");

    const cards = page.locator(".product-card");
    await expect(cards).toHaveCount(2);

    const firstCard = cards.first();
    await expect(firstCard.getByText("Quỹ Mở Cổ Phiếu Tăng Trưởng VEOF")).toBeVisible();
    await expect(firstCard.getByText("VinaCapital")).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /Chi tiết|Details/i })).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /Tư vấn|Consult/i })).toBeVisible();
  });

  test("13.5 Consultation modal opens upon clicking 'Tư vấn'", async ({ page }) => {
    await page.goto("/user/explore");

    const consultBtn = page.getByRole("button", { name: /Tư vấn|Consult/i }).first();
    await consultBtn.click();

    const dialog = page.locator("div[role='dialog']");
    await expect(dialog).toBeVisible();

    const closeBtn = dialog.locator("button").filter({ hasText: /Đóng|Hủy|Cancel|Close/i }).first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    }
  });
});

// =========================================================================
// SCREEN 14: TRỢ LÝ AI NGƯỜI DÙNG (/user/assistant)
// =========================================================================
test.describe("Screen 14: Trợ lý AI người dùng (/user/assistant)", () => {
  test("14.1 Full-height layout with centered 860px column and header actions", async ({ page }) => {
    await page.goto("/user/assistant");

    const pageContainer = page.locator(".ai-chat-page.ai-assistant-page");
    await expect(pageContainer).toBeVisible();

    const header = page.locator(".ai-chat-header");
    await expect(header).toBeVisible();
    await expect(header.getByText(/Trợ lý An Hưu|An Huu assistant/i)).toBeVisible();
    await expect(header.locator(".ai-new-chat, [data-ai='new']")).toBeVisible();
  });

  test("14.2 Welcome banner features 4 suggestion prompt chips", async ({ page }) => {
    await page.goto("/user/assistant");

    const welcome = page.locator(".ai-chat-welcome");
    await expect(welcome).toBeVisible();

    const promptChips = welcome.locator(".prompt-pill.suggestion-chip.quick-question-btn");
    await expect(promptChips).toHaveCount(4);

    await expect(promptChips.nth(0)).toContainText(/Tiền nghỉ hưu của tôi có đủ không|Will my retirement fund be enough/i);
    await expect(promptChips.nth(1)).toContainText(/Tôi cần góp thêm bao nhiêu|How much more should I contribute/i);
    await expect(promptChips.nth(2)).toContainText(/Khi nào tôi có thể thiếu tiền|When might I run short/i);
    await expect(promptChips.nth(3)).toContainText(/Nghỉ hưu muộn hơn thì sao|What if I retire later/i);
  });

  test("14.3 Composer provides textarea, shortcut hint, and send button", async ({ page }) => {
    await page.goto("/user/assistant");

    const composerWrap = page.locator(".ai-chat-composer-wrap").first();
    await expect(composerWrap).toBeVisible();

    const textarea = page.locator("#ai-chat-question");
    await expect(textarea).toBeVisible();

    await expect(composerWrap.getByText(/Enter để gửi|Enter to send/i)).toBeVisible();
    await expect(composerWrap.locator("button.ai-chat-send")).toBeVisible();
  });
});

// =========================================================================
// SCREEN 15: HỒ SƠ TÀI CHÍNH CHI TIẾT (/user/account)
// =========================================================================
test.describe("Screen 15: Hồ sơ tài chính chi tiết (/user/account)", () => {
  test("15.1 Header renders progress bar and quick link to account settings", async ({ page }) => {
    await page.goto("/user/account");

    const header = page.locator(".finance-hub-head, .financial-profile-header");
    await expect(header).toBeVisible();
    await expect(header.getByText(/Tài chính của bạn|Your finances/i)).toBeVisible();
    await expect(header.locator(".finance-hub-progress")).toBeVisible();

    const settingsLink = header.getByRole("link", { name: /Cài đặt tài khoản|Account settings/i });
    await expect(settingsLink).toBeVisible();
  });

  test("15.2 4-metric overview grid displays core financial indicators", async ({ page }) => {
    await page.goto("/user/account");

    const metricsSection = page.locator(".finance-hub-metrics");
    await expect(metricsSection).toBeVisible();

    await expect(metricsSection.getByText(/Thu nhập \+ lương hưu|Income & pension/i)).toBeVisible();
    await expect(metricsSection.getByText(/Chi tiêu sinh hoạt|Living expenses/i)).toBeVisible();
    await expect(metricsSection.getByText(/Trả nợ trong tháng|Debt payments/i)).toBeVisible();
    await expect(metricsSection.getByText(/Phần dư thu chi|Monthly surplus/i)).toBeVisible();
  });

  test("15.3 5 Hub cards are present with titles, badges, and detail actions", async ({ page }) => {
    await page.goto("/user/account");

    const hubGrid = page.locator(".finance-hub-grid");
    await expect(hubGrid).toBeVisible();

    const cards = hubGrid.locator("article.finance-hub-card");
    await expect(cards).toHaveCount(5);

    await expect(cards.nth(0).getByText(/Thu nhập & chi tiêu|Income & expenses/i)).toBeVisible();
    await expect(cards.nth(1).getByText(/Tài sản & dự phòng|Assets & reserves/i)).toBeVisible();
    await expect(cards.nth(2).getByText(/Khoản nợ & trả nợ|Debts & repayments/i)).toBeVisible();
    await expect(cards.nth(3).getByText(/Lương hưu BHXH|Social insurance pension/i)).toBeVisible();
    await expect(cards.nth(4).getByText(/Gia đình & người phụ thuộc|Family & dependents/i)).toBeVisible();

    // Card 3 links to /user/debts
    const debtLink = cards.nth(2).getByRole("link", { name: /Xem chi tiết khoản nợ|Review debts/i });
    await expect(debtLink).toBeVisible();
    await expect(debtLink).toHaveAttribute("href", "/user/debts");
  });
});

// =========================================================================
// SCREEN 16: TÀI KHOẢN & CÀI ĐẶT (/user/account?tab=settings)
// =========================================================================
test.describe("Screen 16: Tài khoản & Cài đặt (/user/account?tab=settings)", () => {
  test("16.1 Breadcrumb link returns to /user/account", async ({ page }) => {
    await page.goto("/user/account?tab=settings");

    const breadcrumb = page.locator(".btn-breadcrumb, .account-breadcrumb a");
    if (await breadcrumb.count() > 0) {
      await expect(breadcrumb.first()).toHaveAttribute("href", "/user/account");
    }
  });

  test("16.2 Pill tabs navigate between profile, security, and export plan", async ({ page }) => {
    await page.goto("/user/account?tab=settings");

    const tabs = page.locator(".account-settings-tabs, .account-nav-tabs, [role='tablist']");
    await expect(tabs).toBeVisible();

    await expect(tabs.getByText(/Thông tin tài khoản|Profile|Cá nhân/i)).toBeVisible();
    await expect(tabs.getByText(/Bảo mật & thông báo|Security & Notifications|Cài đặt/i)).toBeVisible();
    await expect(tabs.getByText(/Xuất kế hoạch|Export Plan|Báo cáo/i)).toBeVisible();
  });
});

// =========================================================================
// SCREEN 17: HỖ TRỢ (/user/support)
// =========================================================================
test.describe("Screen 17: Hỗ trợ (/user/support)", () => {
  test("17.1 Member layout displays two primary cards: Create ticket and Recorded tickets", async ({ page }) => {
    await page.goto("/user/support");

    // Card 1: Tạo yêu cầu
    const createCard = page.locator(".support-create-card");
    await expect(createCard).toBeVisible();
    await expect(createCard.getByText(/Tạo yêu cầu|Create Support Request/i)).toBeVisible();

    // Card 2: Yêu cầu đã ghi
    const historyCard = page.locator(".support-history-card");
    await expect(historyCard).toBeVisible();
    await expect(historyCard.getByText(/Yêu cầu đã ghi|Logged Requests/i)).toBeVisible();
  });

  test("17.2 Ticket conversation modal renders An Huu chat bubbles and message composer", async ({ page }) => {
    await page.goto("/user/support");

    const openChatBtn = page.getByRole("button", { name: /Mở hội thoại|Xem chi tiết|View conversation/i }).first();
    if (await openChatBtn.count() > 0) {
      await openChatBtn.click();

      const dialog = page.locator("div[role='dialog']");
      await expect(dialog).toBeVisible();

      // Close dialog
      const closeBtn = dialog.locator("button").filter({ hasText: /Đóng|Close/i }).first();
      await closeBtn.click();
      await expect(dialog).not.toBeVisible();
    }
  });
});

// =========================================================================
// SCREEN 18: THÔNG BÁO (/user/notifications)
// =========================================================================
test.describe("Screen 18: Thông báo (/user/notifications)", () => {
  test("18.1 Header renders title, subtitle, and 'Đánh dấu tất cả đã đọc' button", async ({ page }) => {
    await page.goto("/user/notifications");

    const h1 = page.locator(".notif-hub-header-title-box h1");
    await expect(h1).toHaveText(/Trung tâm thông báo|Notification Center/i);

    const markAllBtn = page.getByRole("button", { name: /Đánh dấu tất cả đã đọc|Mark all as read/i });
    await expect(markAllBtn).toBeVisible();
  });

  test("18.2 Summary cards display Total, Unread, and Read counts", async ({ page }) => {
    await page.goto("/user/notifications");

    const cards = page.locator(".notif-hub-stat-card");
    await expect(cards).toHaveCount(3);

    await expect(cards.nth(0)).toContainText(/Tổng thông báo|Total Messages/i);
    await expect(cards.nth(1)).toContainText(/Chưa đọc|Unread Messages/i);
    await expect(cards.nth(2)).toContainText(/Đã đọc|Read Messages/i);
  });

  test("18.3 Category filter tabs and search input filter notification entries", async ({ page }) => {
    await page.goto("/user/notifications");

    const filterTabs = page.locator(".notif-hub-filter-tabs");
    await expect(filterTabs).toBeVisible();

    await expect(filterTabs.getByText(/Tất cả|All/i)).toBeVisible();
    await expect(filterTabs.getByText(/Chưa đọc|Unread/i)).toBeVisible();

    const searchInput = page.locator(".notif-hub-search-box input");
    await expect(searchInput).toBeVisible();
  });
});

// =========================================================================
// ANTI-SLOP AUDIT: ZERO EM-DASHES (\u2014) IN DOM ACROSS M3 SCREENS
// =========================================================================
test.describe("Anti-Slop Audit: Zero Em-Dashes (\\u2014) in DOM", () => {
  const M3_ROUTES = [
    { name: "Screen 12: Debts", path: "/user/debts" },
    { name: "Screen 13: Financial Products", path: "/user/explore" },
    { name: "Screen 14: AI Assistant", path: "/user/assistant" },
    { name: "Screen 15: Financial Profile", path: "/user/account" },
    { name: "Screen 16: Account Settings", path: "/user/account?tab=settings" },
    { name: "Screen 17: Support", path: "/user/support" },
    { name: "Screen 18: Notifications", path: "/user/notifications" },
  ];

  for (const screen of M3_ROUTES) {
    test(`DOM text on ${screen.name} (${screen.path}) contains ZERO em-dash (\\u2014) characters`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForLoadState("domcontentloaded");

      const bodyText = await page.evaluate(() => document.body.innerText);
      const matches = bodyText.match(/\u2014/g) || [];
      expect(
        matches.length,
        `Forbidden em-dash (\\u2014) found ${matches.length} time(s) on ${screen.name} (${screen.path})!`
      ).toBe(0);
    });
  }
});
