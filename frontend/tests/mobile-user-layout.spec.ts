import { test, expect, type Page } from "@playwright/test";
import { installRouteAuth, installFinancialProfileRoutes } from "./helpers";
import { readFileSync } from "node:fs";

const policies = JSON.parse(readFileSync(new URL("./fixtures/portfolio-policies.json", import.meta.url), "utf8"));

function createV2Profile(debtsOverride?: any) {
  const defaultDebt = {
    status: "KNOWN",
    entries: [
      {
        id: "loan-1",
        label: "Khoản vay thế chấp mua nhà",
        currency: "VND",
        outstandingBalance: { status: "KNOWN", value: "350000000" },
        balanceAsOf: { status: "KNOWN", value: "2026-10-01" },
        payment: { status: "KNOWN", value: "6500000" },
        paymentShare: { status: "KNOWN", value: "1" },
        balanceShare: { status: "KNOWN", value: "1" },
        responsibility: {
          status: "KNOWN",
          scope: "FULL",
          confirmedDocument: "HĐ 123/2024",
          limit: { status: "KNOWN", value: "350000000" },
        },
        startMonth: "2024-01",
        endMonth: "2031-12",
        frequency: "MONTHLY",
        contract: {
          status: "KNOWN",
          value: {
            contractVersion: 1,
            source: "Hợp đồng tín dụng",
            confirmedOn: "2026-10-01",
            balanceAsOf: "2026-10-01",
            interestBasis: "REDUCING_BALANCE",
            periodConvention: "DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS",
            maturityDate: "2031-12-31",
            settleRemainingAtMaturity: true,
            parties: [{ reference: "borrower", role: "BORROWER" }],
            periods: [],
          },
        },
      },
    ],
  };

  const hasDebt = debtsOverride !== undefined ? debtsOverride.status === "KNOWN" : true;

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
      debts: debtsOverride !== undefined ? debtsOverride : defaultDebt,
      pension: { status: "UNKNOWN" },
    },
    summary: {
      status: "CALCULATED",
      values: {
        monthlyIncome: "30000000",
        monthlyExpense: "15000000",
        monthlyDebtService: hasDebt ? "6500000" : "0",
        availableMonthlySurplus: hasDebt ? "8500000" : "15000000",
        totalAssets: "200000000",
        totalDebt: hasDebt ? "350000000" : "0",
        netWorth: hasDebt ? "-150000000" : "200000000",
      },
    },
  };
}

async function setupMobileUserEnv(page: Page, options: { activePlan?: boolean; debts?: any; riskAnswers?: Record<string, string> } = {}) {
  const userId = "USR-MOBILE";

  // Block unmocked calls by default
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url());
    // Safe fallbacks for read APIs
    if (url.pathname.includes("/content")) {
      return route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 20 } } });
    }
    if (url.pathname.includes("/products") || url.pathname.includes("/partners")) {
      return route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 20 } } });
    }
    if (url.pathname.includes("/notifications")) {
      return route.fulfill({ json: { data: { items: [], total: 0, unread: 0, limit: 25 } } });
    }
    if (url.pathname.includes("/support")) {
      return route.fulfill({ json: { data: { items: [], total: 0, limit: 20 } } });
    }
    return route.fulfill({ status: 503, json: { error: { message: "Unmocked test API" } } });
  });

  await installRouteAuth(page, userId);
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());

  const profile = createV2Profile(options.debts);
  await installFinancialProfileRoutes(page, { profile });

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
    requiredConstantMonthlyContribution: "4500000",
    plannedMonthlyContribution: "5000000",
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
        monthlyContribution: "5000000",
        monthlyReserve: "0",
        contributionTiming: "END_OF_MONTH",
        surplusPolicy: "EXPLICIT_DEPOSITS_ONLY",
      },
      calculation: {
        summary: defaultSummary,
        assessment: {
          totalScore: 25,
          riskBandId: policies.v2.riskBands[0]?.id || "BALANCED",
          riskBandLabel: "Cân bằng",
          selectedTemplateId: policies.v2.templates[0].id,
          eligibleTemplateIds: [policies.v2.templates[0].id],
        },
        rows: [{ contributionCapacity: "3000000" }],
        limitations: [],
      },
    },
  };

  const planDetail = options.activePlan !== false
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

  await page.route("**/api/v1/me/assumptions/**", (route) => {
    return route.fulfill({
      json: {
        data: {
          id: "asm-1",
          version: 1,
          revision: 1,
          status: "PUBLISHED",
          title: "Chuỗi giả định chính thức 2026-2045",
          data: {
            assetClasses: [
              { code: "CASH", label: "Tiền gửi & thanh khoản" },
              { code: "BOND", label: "Trái phiếu" },
              { code: "EQUITY", label: "Cổ phiếu" },
            ],
          },
        },
      },
    });
  });

  const policy = { id: "policy-test", version: 4, data: { ...policies.v2, assumptionVersionId: "asm-1" } };
  await page.route("**/api/v1/me/portfolio-policies/preview", (route) => {
    const input = route.request().postDataJSON() || {};
    const template = policies.v2.templates[0];
    return route.fulfill({
      json: {
        data: {
          status: "READY",
          assessment: {
            totalScore: 25,
            riskBandId: policies.v2.riskBands[0]?.id || "BALANCED",
            riskBandLabel: "Cân bằng",
            selectedTemplateId: template.id,
            eligibleTemplateIds: [template.id],
          },
          recommendedTemplate: template,
          schedule: [
            { year: 2026, cash: "20", bonds: "40", stocks: "40" },
            { year: 2030, cash: "25", bonds: "45", stocks: "30" },
          ],
          scenarios: [
            {
              id: "BASE",
              label: "Cơ sở",
              years: [
                { year: 2026, cash: "20", bonds: "40", stocks: "40" },
                { year: 2030, cash: "25", bonds: "45", stocks: "30" },
              ],
            },
          ],
          issues: [],
        },
      },
    });
  });

  await page.route("**/api/v1/me/portfolio-policies**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/preview")) return;
    return route.fulfill({
      json: {
        data: url.pathname.endsWith("/policy-test")
          ? policy
          : { status: "AVAILABLE", items: [policy] },
      },
    });
  });

  await page.route("**/api/v1/me/retirement/preview*", async (route) => {
    const input = route.request().postDataJSON() || {};
    await route.fulfill({
      json: {
        data: {
          status: "READY",
          issues: [],
          warnings: [],
          inputHash: "test-preview-hash",
          profileRevision: 1,
          valuationDate: "2026-10-15",
          references: { assumptionVersionId: "asm-v1" },
          selection: input,
          calculation: {
            summary: defaultSummary,
            assessment: {
              totalScore: 25,
              riskBandId: policies.v2.riskBands[0]?.id || "BALANCED",
              riskBandLabel: "Cân bằng",
              selectedTemplateId: policies.v2.templates[0].id,
              eligibleTemplateIds: [policies.v2.templates[0].id],
            },
            rows: [{ contributionCapacity: "3000000" }],
            limitations: [],
          },
        },
      },
    });
  });

  const isEstimatedDebts = options.debts?.entries?.some((e: any) => e.contract?.status === "UNKNOWN");
  await page.route("**/api/v1/me/debts/preview**", (route) => {
    if (isEstimatedDebts) {
      return route.fulfill({
        json: {
          data: {
            profileRevision: 1,
            status: "INCOMPLETE",
            modelVersion: "v2",
            valuationDate: "2026-10-15",
            currency: "VND",
            capital: {
              netWorth: "-150000000",
              retirementLiquidAssets: "200000000",
            },
            issues: [{ loanId: "loan-car-1", code: "LOAN_CONTRACT_REQUIRED" }],
            warnings: [],
            limitations: [],
            alternatives: [],
            baseline: null,
          },
        },
      });
    }
    return route.fulfill({
      json: {
        data: {
          profileRevision: 1,
          status: "READY",
          modelVersion: "v2",
          valuationDate: "2026-10-15",
          currency: "VND",
          capital: {
            netWorth: "-150000000",
            retirementLiquidAssets: "200000000",
          },
          issues: [],
          warnings: [],
          limitations: [],
          alternatives: [],
          baseline: {
            status: "CALCULATED",
            totals: {
              principal: "350000000",
              interest: "85000000",
              fees: "0",
              interestAndFees: "85000000",
              extraPrincipal: "0",
              debtFreeDate: "2031-12-31",
              firstShortfallMonth: null,
              closingLoanBalance: "0",
            },
            rows: [
              {
                month: "2026-10",
                payment: "6500000",
                principal: "4500000",
                interest: "2000000",
                remainingBalance: "345500000",
                availableForRetirement: "8500000",
                pressure: { ratioPercent: "21.7" },
              },
            ],
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
      },
    });
  });

  // Pre-seed 4 answers in localStorage so progress bar displays and next question button is present
  const defaultAnswers: Record<string, string> = {};
  const qList = policies.v2?.questions ?? [];
  for (let i = 0; i < Math.min(4, qList.length); i++) {
    const q = qList[i];
    if (q.choices?.[0]?.id) defaultAnswers[q.id] = q.choices[0].id;
  }
  const ans = options.riskAnswers !== undefined ? options.riskAnswers : defaultAnswers;
  await page.addInitScript(
    ({ uid, a }) => {
      localStorage.setItem(`anhuu:risk:${uid}:policy-test`, JSON.stringify(a));
    },
    { uid: userId, a: ans }
  );

  await page.route("**/api/v1/me/ai/privacy", async (route) => {
    return route.fulfill({
      json: {
        data: {
          processing: true,
          saveHistory: true,
          policyVersion: "2026-04-01",
          acceptedPolicyVersion: "2026-04-01",
          revision: 1,
          processingNotice: "Dữ liệu được gửi tới AI an toàn.",
          providerConfigured: true,
          reconsentRequired: false,
        },
      },
    });
  });

  await page.route("**/api/v1/me/ai/conversations**", (route) => {
    return route.fulfill({ json: { data: { items: [], total: 0, limit: 20, page: 1 } } });
  });

  await page.route("**/api/v1/me/support**", (route) => {
    return route.fulfill({ json: { data: { items: [], total: 0, limit: 20 } } });
  });

  await page.route("**/api/v1/me/notifications**", (route) => {
    return route.fulfill({ json: { data: { items: [], total: 0, unread: 0, limit: 25 } } });
  });

  await page.route("**/api/v1/products**", (route) => {
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "prod-1",
              partnerId: "part-1",
              name: "Quỹ Đầu tư Cổ phiếu",
              category: "Quỹ mở",
              expectedReturn: "12%/năm",
              riskLevel: "MEDIUM",
              description: "Tăng trưởng dài hạn",
              isVisible: true,
            },
          ],
          total: 1,
        },
      },
    });
  });

  await page.route("**/api/v1/partners**", (route) => {
    return route.fulfill({
      json: {
        data: {
          items: [
            { id: "part-1", name: "Dragon Capital", type: "OPEN_FUND", isHighlight: true, isVisible: true },
          ],
          total: 1,
        },
      },
    });
  });

  await page.route("**/api/v1/content**", (route) => {
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "c1",
              title: "Bài viết mẫu hưu trí",
              slug: "bai-viet-mau",
              excerpt: "Tóm tắt bài viết hướng dẫn tích lũy.",
              category: "Đầu tư tích lũy",
              kind: "ARTICLE",
              status: "PUBLISHED",
              publishedAt: "2026-10-01T00:00:00.000Z",
            },
          ],
          total: 1,
        },
      },
    });
  });

  await page.clock.setFixedTime(new Date("2026-10-15T05:00:00Z"));
}

const userPages = [
  { path: "/user/dashboard", isMain: true },
  { path: "/user/goal", isMain: true },
  { path: "/user/plan", isMain: true },
  { path: "/user/simulation", isMain: false },
  { path: "/user/debts", isMain: false },
  { path: "/user/risk-portfolio", isMain: false },
  { path: "/user/assistant", isMain: true },
  { path: "/user/explore", isMain: false },
  { path: "/user/account", isMain: false },
  { path: "/user/support", isMain: false },
  { path: "/user/notifications", isMain: false },
];

const viewports = [
  { name: "375x812", width: 375, height: 812 },
  { name: "320x640", width: 320, height: 640 },
];

test.describe("E1: Playwright Mobile User Layout (375x812 & 320x640)", () => {
  for (const vp of viewports) {
    test.describe(`Viewport ${vp.name}`, () => {
      test.use({
        viewport: { width: vp.width, height: vp.height },
        isMobile: true,
        hasTouch: true,
      });

      for (const { path, isMain } of userPages) {
        test(`Kiểm tra bố cục mobile trên trang ${path}`, async ({ page }) => {
          await setupMobileUserEnv(page);
          await page.goto(path);
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(600);

          // 0. Assert trang đã tải thật (có main, h1 và không phải màn lỗi)
          await expect(page.locator("main")).toBeVisible();
          await expect(page.getByText("Trang chưa tải được đầy đủ")).toHaveCount(0);
          const h1 = page.locator("main h1").first();
          await expect(h1).toBeVisible();
          expect((await h1.textContent())?.trim().length).toBeGreaterThan(0);

          // 1. scrollWidth <= innerWidth
          const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(docScrollWidth).toBeLessThanOrEqual(vp.width + 1);

          // 2. Không phần tử hiển thị nào (ngoài vùng cuộn ngang có chủ đích) tràn màn hình
          const overflowingElements = await page.evaluate((vw) => {
            const visible = (el: HTMLElement) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0;
            };
            const all = [...document.querySelectorAll<HTMLElement>("body *")].filter(visible);
            return all
              .filter((el) => el.getBoundingClientRect().right > vw + 1)
              .filter((el) => ![...el.children].some((c) => (c as HTMLElement).getBoundingClientRect().right > vw + 1))
              .filter((el) => {
                for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
                  if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false;
                }
                return true;
              })
              .map((el) => `${el.tagName.toLowerCase()}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`);
          }, vp.width);
          expect(overflowingElements, `Tràn màn hình trên ${path}`).toEqual([]);

          // 3. Mọi input/select/textarea hiển thị có font-size >= 16px (cho phép dung sai làm tròn 15.9px)
          const smallInputs = await page.evaluate(() => {
            const visible = (el: HTMLElement) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0;
            };
            const inputs = [
              ...document.querySelectorAll<HTMLElement>(
                "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
              ),
            ].filter(visible);
            return inputs
              .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 15.9)
              .map((el) => `${el.tagName.toLowerCase()}.${el.className} font-size=${getComputedStyle(el).fontSize}`);
          });
          expect(smallInputs, `Ô nhập dưới 16px trên ${path}`).toEqual([]);

          // 4. Bottom nav: đúng 1 mục aria-current="page" ở 4 trang chính, 0 ở các trang khác
          const bottomNavCurrentCount = await page.evaluate(() => {
            const nav = document.querySelector(".user-mobile-nav");
            if (!nav) return 0;
            return nav.querySelectorAll('[aria-current="page"]').length;
          });
          if (isMain) {
            expect(bottomNavCurrentCount, `Số mục aria-current="page" ở bottom nav trên ${path}`).toBe(1);
          } else {
            expect(bottomNavCurrentCount, `Số mục aria-current="page" ở bottom nav trên ${path}`).toBe(0);
          }
        });
      }

      // Assert B1: 2 hero buttons stacked vertically, in viewport, height 44-52px
      test("B1: Trên /user/plan 2 nút hero xếp dọc, trong màn hình, cao 44-52px", async ({ page }) => {
        await setupMobileUserEnv(page);
        await page.goto("/user/plan");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(600);

        const heroButtons = page.locator(".plan-hero-actions__main > *");
        const count = await heroButtons.count();
        expect(count).toBeGreaterThanOrEqual(2);

        const btn1Rect = await heroButtons.nth(0).boundingBox();
        const btn2Rect = await heroButtons.nth(1).boundingBox();
        expect(btn1Rect).not.toBeNull();
        expect(btn2Rect).not.toBeNull();

        if (btn1Rect && btn2Rect) {
          // Xếp dọc: nút 2 nằm dưới nút 1
          expect(btn2Rect.y).toBeGreaterThanOrEqual(btn1Rect.y + btn1Rect.height - 1);
          // Trong màn hình
          expect(btn1Rect.x).toBeGreaterThanOrEqual(0);
          expect(btn1Rect.x + btn1Rect.width).toBeLessThanOrEqual(vp.width + 1);
          expect(btn2Rect.x).toBeGreaterThanOrEqual(0);
          expect(btn2Rect.x + btn2Rect.width).toBeLessThanOrEqual(vp.width + 1);
          // Chiều cao 44-52px
          expect(btn1Rect.height).toBeGreaterThanOrEqual(44);
          expect(btn1Rect.height).toBeLessThanOrEqual(52);
          expect(btn2Rect.height).toBeGreaterThanOrEqual(44);
          expect(btn2Rect.height).toBeLessThanOrEqual(52);
        }
      });

      // Assert B2: switcher không chồng bottom nav (gap >= 8px)
      test("B2: Trên /user/simulation thanh chuyển giai đoạn không chồng bottom nav", async ({ page }) => {
        await setupMobileUserEnv(page);
        await page.goto("/user/simulation");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(600);

        const switcher = page.locator(".phase-view-switcher");
        const bottomNav = page.locator(".user-mobile-nav");
        await expect(switcher).toBeVisible();
        await expect(bottomNav).toBeVisible();

        const switcherBox = await switcher.boundingBox();
        const navBox = await bottomNav.boundingBox();
        expect(switcherBox).not.toBeNull();
        expect(navBox).not.toBeNull();

        if (switcherBox && navBox) {
          // Switcher đáy phải ở trên bottom nav đỉnh với khoảng cách >= 8px
          const gap = navBox.y - (switcherBox.y + switcherBox.height);
          expect(gap).toBeGreaterThanOrEqual(8);
        }
      });

      // Assert B3: 3 gợi ý không bị phần tử khác đè (elementFromPoint)
      test("B3: Trên /user/assistant 3 nút gợi ý bấm được và không bị đè", async ({ page }) => {
        await setupMobileUserEnv(page);
        await page.goto("/user/assistant");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(600);

        const suggestions = page.locator(".ai-chat-suggestions button");
        await expect(suggestions).toHaveCount(3);

        const notCovered = await page.evaluate(() => {
          const buttons = [...document.querySelectorAll<HTMLButtonElement>(".ai-chat-suggestions button")];
          return buttons.map((btn, idx) => {
            btn.scrollIntoView({ block: "nearest", inline: "center" });
            const rect = btn.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const topEl = document.elementFromPoint(cx, cy);
            const isClickable = Boolean(topEl && (topEl === btn || btn.contains(topEl)));
            return {
              idx,
              isClickable,
              topElTag: topEl?.tagName,
              topElClass: topEl?.className,
              rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
              center: { cx, cy }
            };
          });
        });

        console.log(`B3 debug on ${vp.name}:`, JSON.stringify(notCovered, null, 2));

        for (const item of notCovered) {
          expect(item.isClickable, `Nút gợi ý ${item.idx} bị đè bởi ${item.topElTag}.${item.topElClass}`).toBe(true);
        }
      });

      // Assert C4: Trên /user/debts khi có khoản vay ước tính (không có hợp đồng), danh sách khoản vay hiển thị đầy đủ, thẻ gom "Cần bổ sung dữ liệu" chỉ thay cho chỉ số trống
      test(`C4: Trên /user/debts khi có khoản vay ước tính, danh sách khoản vay hiện đầy đủ (${vp.name})`, async ({ page }) => {
        const estimatedDebts = {
          status: "KNOWN",
          entries: [
            {
              id: "loan-car-1",
              label: "Vay mua ô tô",
              currency: "VND",
              outstandingBalance: { status: "KNOWN", value: "250000000" },
              balanceAsOf: { status: "KNOWN", value: "2026-10-01" },
              payment: { status: "KNOWN", value: "8500000" },
              paymentShare: { status: "KNOWN", value: "1" },
              balanceShare: { status: "KNOWN", value: "1" },
              responsibility: { status: "UNKNOWN" },
              startMonth: "2025-01",
              endMonth: "2028-12",
              frequency: "MONTHLY",
              contract: { status: "UNKNOWN" },
            },
          ],
        };
        await setupMobileUserEnv(page, { debts: estimatedDebts });
        await page.goto("/user/debts");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(600);

        // Assert trang tải thật, không lỗi
        await expect(page.locator("main")).toBeVisible();
        await expect(page.getByText("Trang chưa tải được đầy đủ")).toHaveCount(0);

        // Danh sách khoản vay và các thông tin của nó phải còn hiện
        const loanCard = page.locator(".debt-loan-card");
        await expect(loanCard).toBeVisible();
        await expect(loanCard).toContainText("Vay mua ô tô");
        await expect(loanCard).toContainText("250.000.000");
        await expect(loanCard).toContainText("8.500.000");

        // Thẻ gom "Cần bổ sung dữ liệu" chỉ thay cho các chỉ số trống, không ẩn khoản vay
        const dataRequiredCard = page.locator(".debt-mobile-data-required-card");
        await expect(dataRequiredCard).toBeVisible();
        await expect(dataRequiredCard).toContainText("Cần bổ sung dữ liệu");

        const metricsGrid = page.locator(".debt-results-metrics");
        await expect(metricsGrid).toBeHidden();
      });

      // Assert C5: Kiểm thanh tiến độ khảo sát: khi chưa trả lời hiện "0/6 câu", nút "Câu tiếp theo" đưa tới câu chưa trả lời, trả lời 1 câu thì số tăng
      test(`C5: Trên /user/risk-portfolio thanh tiến độ sticky hoạt động chính xác (${vp.name})`, async ({ page }) => {
        await setupMobileUserEnv(page, { riskAnswers: {} });
        await page.goto("/user/risk-portfolio");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(600);

        // Assert trang tải thật, không lỗi
        await expect(page.locator("main")).toBeVisible();
        await expect(page.getByText("Trang chưa tải được đầy đủ")).toHaveCount(0);

        // Kiểm tra thanh tiến độ sticky "Đã trả lời 0/6 câu"
        const stickyBar = page.locator(".risk-survey-sticky-bar");
        await expect(stickyBar).toBeVisible();
        await expect(stickyBar).toContainText("Đã trả lời 0/6 câu");

        // Nút "Câu tiếp theo" đưa tới câu chưa trả lời
        const nextBtn = stickyBar.locator(".risk-survey-next-btn");
        await expect(nextBtn).toBeVisible();
        await expect(nextBtn).toContainText("Câu tiếp theo");
        const href = await nextBtn.getAttribute("href");
        expect(href).toMatch(/^#question-/);

        // Bấm chọn một phương án ở câu hỏi đầu tiên
        const firstChoice = page.getByRole("radio").first();
        await firstChoice.click();
        await page.waitForTimeout(400);

        // Sau khi trả lời 1 câu, số câu đã trả lời tăng lên "Đã trả lời 1/6 câu"
        await expect(stickyBar).toContainText("Đã trả lời 1/6 câu");
      });

      test(`E2 Phụ lục A: Đo đạc toàn diện trên cả 11 trang (${vp.name})`, async ({ page }) => {
        const auditResults: Record<string, any> = {};

        for (const { path } of userPages) {
          await setupMobileUserEnv(page);
          await page.goto(path);
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(600);

          const result = await page.evaluate(() => {
            const vw = innerWidth;
            const visible = (el: Element) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0;
            };
            const name = (el: Element) =>
              `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${(el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 32)}"`;
            const main = document.querySelector("main") || document.body;
            const all = [...document.querySelectorAll("body *")].filter(visible);
            const overflow = all
              .filter((el) => el.getBoundingClientRect().right > vw + 1)
              .filter((el) => ![...el.children].some((c) => c.getBoundingClientRect().right > vw + 1))
              .filter((el) => {
                for (let p = el.parentElement; p; p = p.parentElement) {
                  if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false;
                }
                return true;
              })
              .map((el) => `${name(el)} right=${Math.round(el.getBoundingClientRect().right)}`);
            const textEls = [...main.querySelectorAll("*")].filter(
              (el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim())
            );
            const tiny = textEls
              .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
              .map((el) => `${getComputedStyle(el).fontSize} ${name(el)}`);
            const interactive = [
              ...document.querySelectorAll(
                "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary"
              ),
            ].filter(visible);

            // WCAG 2.2 & E2: exclude inline links inside paragraphs
            const isInline = (el: Element) => {
              if (el.tagName.toLowerCase() === "a" && el.closest("p, li, span.inline-text")) {
                const parent = el.closest("p, li, span.inline-text");
                if (parent && parent.textContent && parent.textContent.trim().length > (el.textContent || "").trim().length) {
                  return true;
                }
              }
              return false;
            };

            const under24 = interactive
              .filter((el) => !isInline(el))
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.height < 24 || r.width < 24;
              })
              .map(name);
            const under44 = interactive.filter((el) => {
              const r = el.getBoundingClientRect();
              return r.height < 44 || r.width < 44;
            }).length;
            const inputsUnder16 = [
              ...document.querySelectorAll(
                "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
              ),
            ]
              .filter(visible)
              .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 15.9)
              .map((el) => `${getComputedStyle(el).fontSize} ${name(el)}`);
            const fontSizes = [...new Set(textEls.map((el) => getComputedStyle(el).fontSize))].sort(
              (a, b) => parseFloat(a) - parseFloat(b)
            );
            return {
              path: location.pathname,
              vw,
              docWidth: document.documentElement.scrollWidth,
              pageHeight: document.documentElement.scrollHeight,
              overflow,
              tinyTextCount: tiny.length,
              tiny: tiny.slice(0, 10),
              under24,
              under44,
              inputsUnder16,
              fontSizes,
            };
          });

          auditResults[path] = result;
          expect(result.overflow, `Tràn màn hình trên ${path}`).toEqual([]);
          expect(result.tinyTextCount, `Chữ dưới 12px trên ${path}: ${result.tiny.join(", ")}`).toBe(0);
          expect(result.inputsUnder16, `Ô nhập dưới 16px trên ${path}`).toEqual([]);
          expect(result.under24, `Vùng chạm dưới 24px trên ${path}: ${result.under24.join(", ")}`).toEqual([]);
        }

        console.log(`\n=== KẾT QUẢ ĐO PHỤ LỤC A (${vp.name}) ===`);
        console.table(
          Object.entries(auditResults).map(([p, r]) => ({
            path: p,
            vw: r.vw,
            docWidth: r.docWidth,
            pageHeight: r.pageHeight,
            overflowCount: r.overflow.length,
            tinyCount: r.tinyTextCount,
            inputsUnder16: r.inputsUnder16.length,
            under24Count: r.under24.length,
            under44Count: r.under44,
            distinctFontSizes: r.fontSizes.length,
          }))
        );
      });
    });
  }
});
