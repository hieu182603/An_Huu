import { expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from "./helpers";

export { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile };

export interface ErrorCollector {
  pageErrors: string[];
  consoleErrors: string[];
  detach: () => void;
}

export function trackPageErrors(page: Page): ErrorCollector {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const onPageError = (err: Error) => {
    // Ignore benign WebGL canvas warning in headless browser
    if (err.message.includes("THREE.WebGLRenderer") || err.message.includes("WebGL")) return;
    pageErrors.push(err.message);
  };

  const onConsole = (msg: any) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore network aborts or analytics in headless test environment
      if (text.includes("favicon") || text.includes("analytics") || text.includes("ECONNREFUSED")) return;
      consoleErrors.push(text);
    }
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  return {
    pageErrors,
    consoleErrors,
    detach: () => {
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
    },
  };
}

export async function setupE2ERoutes(page: Page, userId = "USR-001") {
  // First install default base auth routes
  await installRouteAuth(page, userId);

  // Install complete financial profile and onboarding draft routes
  const baseProfile = defaultMockProfile();
  const enhancedProfile = {
    ...baseProfile,
    summary: {
      values: {
        monthlyIncome: "30000000",
        monthlyExpense: "20000000",
        monthlyDebtService: "0",
        availableMonthlySurplus: "10000000",
        totalAssets: "2230000000",
        totalDebt: "0",
        netWorth: "2230000000",
      },
    },
  };
  await installFinancialProfileRoutes(page, { profile: enhancedProfile, draft: null });

  // 1. Economic assumptions for Goal & Plan pages
  await page.route("**/api/v1/assumptions**", async (route) => {
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "asm-1",
              version: 1,
              status: "PUBLISHED",
              effectiveAt: "2026-01-01T00:00:00.000Z",
              inflationRate: 4.0,
              investmentReturnRate: 7.5,
              salaryGrowthRate: 5.0,
              healthCostInflation: 6.5,
              source: "Niên giám Thống kê & Giả định An Hưu 2026",
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        },
      },
    });
  });

  // 2. Member Debts API (/api/v1/me/debts)
  let debts = [
    {
      id: "debt-1",
      name: "Vay mua nhà trả góp",
      category: "REAL_ESTATE",
      initialAmount: "1000000000",
      remainingAmount: "650000000",
      interestRate: 8.5,
      monthlyPayment: "9500000",
      termMonths: 180,
      startDate: "2022-01-01",
    },
    {
      id: "debt-2",
      name: "Thẻ tín dụng tiêu dùng",
      category: "CREDIT_CARD",
      initialAmount: "50000000",
      remainingAmount: "15000000",
      interestRate: 18.0,
      monthlyPayment: "1500000",
      termMonths: 12,
      startDate: "2026-05-01",
    },
  ];

  await page.route("**/api/v1/me/debts**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({
        json: {
          data: {
            items: debts,
            total: debts.length,
            summary: {
              totalDebt: "665000000",
              monthlyDebtService: "11000000",
              debtToAssetRatio: 26.6,
            },
            strategies: {
              snowball: { totalInterest: "120000000", monthsToFreedom: 72 },
              avalanche: { totalInterest: "105000000", monthsToFreedom: 68 },
            },
          },
        },
      });
    }
    if (method === "POST") {
      const body = route.request().postDataJSON() || {};
      const newDebt = { id: `debt-${Date.now()}`, ...body };
      debts.push(newDebt);
      return route.fulfill({ json: { data: newDebt } });
    }
    return route.continue();
  });

  // 3. Member Support Tickets API (/api/v1/me/support)
  let tickets = [
    {
      id: "tk-001",
      subject: "Cần hướng dẫn đồng bộ dữ liệu bảo hiểm xã hội VssID",
      category: "Tài khoản",
      status: "OPEN",
      revision: 1,
      createdAt: "2026-10-02T10:00:00.000Z",
      updatedAt: "2026-10-03T08:30:00.000Z",
    },
    {
      id: "tk-002",
      subject: "Tư vấn phân bổ chứng chỉ quỹ mở VEOF và VESAF",
      category: "Đầu tư",
      status: "RESOLVED",
      revision: 2,
      createdAt: "2026-09-29T09:15:00.000Z",
      updatedAt: "2026-09-30T11:00:00.000Z",
    },
  ];

  await page.route("**/api/v1/me/support**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "POST") {
      const body = route.request().postDataJSON() || {};
      const newTicket = {
        id: `tk-${Date.now().toString().slice(-4)}`,
        subject: body.subject || "Yêu cầu hỗ trợ mới",
        category: body.category || "Hỗ trợ chung",
        status: "OPEN",
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      tickets.unshift(newTicket);
      return route.fulfill({ json: { data: newTicket } });
    }

    if (url.includes("/support/") && !url.includes("?")) {
      const match = url.match(/\/support\/([^/?#]+)/);
      const ticketId = match ? match[1] : "tk-001";
      const target = tickets.find((t) => t.id === ticketId) || tickets[0];
      return route.fulfill({
        json: {
          data: {
            ...target,
            messages: [
              {
                id: "msg-1",
                body: "Chào bạn An Hưu, tôi cần tư vấn về mức lương hưu sau 60 tuổi.",
                createdAt: "2026-10-02T10:00:00.000Z",
                author: { fullName: "Nguyễn Minh An", role: "USER" },
              },
              {
                id: "msg-2",
                body: "Chào bạn An, cố vấn An Hưu đã tiếp nhận yêu cầu và sẽ đối soát dữ liệu giúp bạn.",
                createdAt: "2026-10-02T10:20:00.000Z",
                author: { fullName: "Chuyên viên An Hưu", role: "ADMIN" },
              },
            ],
          },
        },
      });
    }

    return route.fulfill({
      json: {
        data: {
          items: tickets,
          total: tickets.length,
          page: 1,
          limit: 20,
        },
      },
    });
  });

  // 4. Notifications API with dual format (res.items and res.data)
  let notifications = [
    {
      id: "notif-001",
      title: "Kế hoạch đã đồng bộ thành công",
      message: "Bản dự phóng tài chính hưu trí của bạn đã cập nhật mốc 60 tuổi.",
      type: "PLAN",
      path: "/user/plan",
      readAt: null as string | null,
      createdAt: "2026-10-04T10:00:00.000Z",
    },
    {
      id: "notif-002",
      title: "Phản hồi yêu cầu hỗ trợ",
      message: "Chuyên viên tư vấn đã trả lời câu hỏi về chính sách BHXH mới.",
      type: "SUPPORT",
      path: "/user/support",
      readAt: "2026-10-04T08:30:00.000Z",
      createdAt: "2026-10-04T08:00:00.000Z",
    },
    {
      id: "notif-003",
      title: "Bảo mật tài khoản",
      message: "Phiên đăng nhập mới từ trình duyệt web.",
      type: "SECURITY",
      path: "/user/account?tab=settings",
      readAt: null as string | null,
      createdAt: "2026-10-03T15:00:00.000Z",
    },
  ];

  await page.route("**/api/v1/me/notifications**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "POST" && url.includes("/mark-all-read")) {
      notifications = notifications.map((n) => ({ ...n, readAt: new Date().toISOString() }));
      return route.fulfill({ json: { success: true, unread: 0, data: { success: true, unreadCount: 0 } } });
    }

    if (method === "PATCH" && url.includes("/read")) {
      const match = url.match(/\/notifications\/([^/]+)\/read/);
      if (match) {
        const id = match[1];
        notifications = notifications.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
      }
      const unread = notifications.filter((n) => !n.readAt).length;
      return route.fulfill({ json: { success: true, unread, data: { success: true, unreadCount: unread } } });
    }

    const unread = notifications.filter((n) => !n.readAt).length;
    return route.fulfill({
      json: {
        items: notifications,
        total: notifications.length,
        unread,
        limit: 25,
        data: {
          items: notifications,
          total: notifications.length,
          unreadCount: unread,
        },
      },
    });
  });

  // 5. Portfolio Policies with templates and questions
  await page.route("**/api/v1/me/portfolio-policies**", async (route) => {
    const url = route.request().url();
    if (url.includes("/portfolio-policies/") && !url.includes("?")) {
      return route.fulfill({
        json: {
          data: {
            id: "pol-1",
            version: 1,
            revision: 1,
            status: "PUBLISHED",
            data: {
              schemaVersion: 1,
              title: "Chính sách danh mục chuẩn",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
              assumptionVersionId: "asm-1",
              source: { title: "An Hưu", url: "", release: "1.0", reviewedOn: "2026-01-01" },
              questions: [
                {
                  id: "Q_OBJECTIVE",
                  dimension: "OBJECTIVE",
                  prompt: "Mục tiêu tài chính ưu tiên hàng đầu của bạn là gì?",
                  choices: [
                    { id: "OBJ_SECURE", label: "Bảo toàn vốn và an tâm tuổi già", score: 1 },
                    { id: "OBJ_BALANCED", label: "Cân bằng giữa tăng trưởng và an toàn", score: 2 },
                  ],
                },
                {
                  id: "Q_HORIZON",
                  dimension: "HORIZON",
                  prompt: "Bạn dự định giữ khoản đầu tư này trong bao lâu?",
                  choices: [
                    { id: "HOR_SHORT", label: "Dưới 5 năm", score: 1 },
                    { id: "HOR_MEDIUM", label: "Từ 5 đến 12 năm", score: 2 },
                  ],
                },
              ],
              riskBands: [
                { id: "BAND_BALANCED", label: "Cân bằng", minScore: 1, maxScore: 5 },
              ],
              templates: [
                {
                  id: "TMPL_BALANCED",
                  name: "Danh mục Cân bằng",
                  description: "Phân bổ 50% cổ phiếu, 40% trái phiếu, 10% tiền mặt",
                  targetRiskScore: 3,
                  glidePaths: [],
                },
              ],
              rules: [],
              scenarios: [],
            },
          },
        },
      });
    }
    return route.fulfill({
      json: {
        data: {
          status: "AVAILABLE",
          total: 1,
          page: 1,
          limit: 20,
          items: [
            {
              id: "pol-1",
              version: 1,
              revision: 1,
              status: "PUBLISHED",
              title: "Chính sách danh mục chuẩn",
              effectiveAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    });
  });

  // 6. Insurance pension estimates
  await page.route("**/api/v1/insurance/estimates**", async (route) => {
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "pen-1",
              yearsContributed: 20,
              estimatedMonthlyPension: "5500000",
              replacementRatio: 55,
            },
          ],
        },
      },
    });
  });
}

export async function assertNoHorizontalOverflow(page: Page, contextName: string) {
  const overflow = await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const maxScroll = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
    const winWidth = window.innerWidth;
    // Allow small 4px margin for subpixel rendering and vertical scrollbar gutter on Windows
    return {
      hasOverflow: maxScroll > winWidth + 4,
      scrollWidth: maxScroll,
      innerWidth: winWidth,
    };
  });

  expect(
    overflow.hasOverflow,
    `[${contextName}] Horizontal overflow detected: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`
  ).toBe(false);
}

export async function assertMarketingDesignTokens(page: Page) {
  // 1. Scoped under .mk-site
  const mkSite = page.locator(".mk-site");
  await expect(mkSite).toBeVisible();

  // 2. Teal Navy ink color / variables
  const heroKicker = page.locator(".mk-hero-kicker, .mk-eyebrow").first();
  if (await heroKicker.count() > 0) {
    await expect(heroKicker).toBeVisible();
  }

  // 3. Pill buttons have high border-radius (999px)
  const pillBtn = page.locator(".mk-button, .mk-hero-actions a").first();
  if (await pillBtn.count() > 0) {
    const radius = await pillBtn.evaluate((el) => window.getComputedStyle(el).borderRadius);
    const num = parseFloat(radius);
    expect(num, `Marketing button border-radius should be pill shaped (>= 20px), got ${radius}`).toBeGreaterThanOrEqual(20);
  }
}

export async function assertWorkspaceDesignTokens(page: Page) {
  // 1. Authenticated user workspace uses --navy / Oceanic Navy
  const brandOrHeader = page.locator(".user-topbar, .user-nav, .dashboard-summary, .app-header, .yoga-dashboard-layout").first();
  await expect(brandOrHeader).toBeVisible();

  // 2. Card elements use rounded corners (8px - 16px)
  const card = page.locator(".card, .dashboard-metric, .user-cashflow-card, .notif-hub-stat-card").first();
  if (await card.count() > 0) {
    const radius = await card.evaluate((el) => window.getComputedStyle(el).borderRadius);
    const num = parseFloat(radius);
    expect(num, `Workspace card border-radius should be rounded (>= 8px), got ${radius}`).toBeGreaterThanOrEqual(8);
  }
}
