import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:/Users/os/.gemini/antigravity/brain/73d17f6a-7cf1-450c-985d-136e162f69d9/audit_screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const DEMO_BASE = 'http://127.0.0.1:8460';
const MAIN_BASE = 'http://localhost:8443';

const MARKETING_SCREENS = [
  { id: '01_landing', demoUrl: `${DEMO_BASE}/landing.html`, mainPath: '/' },
  { id: '02_cach_hoat_dong', demoUrl: `${DEMO_BASE}/cach-hoat-dong.html`, mainPath: '/cach-hoat-dong' },
  { id: '03_mo_phong', demoUrl: `${DEMO_BASE}/mo-phong.html`, mainPath: '/mo-phong' },
  { id: '04_tro_ly_ai', demoUrl: `${DEMO_BASE}/tro-ly-ai.html`, mainPath: '/tro-ly-ai' },
  { id: '05_kien_thuc', demoUrl: `${DEMO_BASE}/kien-thuc.html`, mainPath: '/kien-thuc' },
  { id: '06_gioi_thieu', demoUrl: `${DEMO_BASE}/gioi-thieu.html`, mainPath: '/gioi-thieu' },
  { id: '07_chinh_sach', demoUrl: `${DEMO_BASE}/chinh-sach.html`, mainPath: '/chinh-sach' },
];

const USER_SCREENS = [
  { id: '08_onboarding', demoJump: 'setup', mainPath: '/onboarding' },
  { id: '09_dashboard', demoJump: 'overview:', mainPath: '/user/dashboard' },
  { id: '10_goal', demoJump: 'plan:goals', mainPath: '/user/goal' },
  { id: '11_plan', demoJump: 'plan:', mainPath: '/user/plan' },
  { id: '12_simulation', demoJump: 'tracking:', mainPath: '/user/simulation' },
  { id: '13_risk_portfolio', demoJump: 'plan:allocation', mainPath: '/user/risk-portfolio' },
  { id: '14_debts', demoJump: 'profile:debts', mainPath: '/user/debts' },
  { id: '15_explore', demoJump: 'marketplace:', mainPath: '/user/explore' },
  { id: '16_assistant', demoJump: 'overview:assistant', mainPath: '/user/assistant' },
  { id: '17_profile', demoJump: 'profile:finance', mainPath: '/user/profile' },
  { id: '18_account', demoJump: 'profile:account', mainPath: '/user/account' },
  { id: '19_support', demoJump: 'overview:support', mainPath: '/user/support' },
  { id: '20_notifications', demoJump: 'tracking:notifications', mainPath: '/user/notifications' },
];

function setupMainRoutes(page) {
  const currentUser = {
    id: 'USR-001',
    fullName: 'Nguyễn Minh An',
    email: 'user@demo.com',
    role: 'USER',
    status: 'ACTIVE',
    phone: '0912345678',
    city: 'Hà Nội',
    avatarUrl: null,
    revision: 1
  };

  const profile = {
    revision: 1,
    asOfDate: '2026-10-04T00:00:00.000Z',
    schemaVersion: 1,
    data: {
      personal: { age: 32, gender: 'MALE', maritalStatus: 'MARRIED', dependents: 1, city: 'Hà Nội' },
      income: { primaryIncome: '25000000.00', secondaryIncome: '5000000.00' },
      expenses: { essentialExpense: '15000000.00', lifestyleExpense: '5000000.00' },
      assets: { cashSavings: '100000000.00', realEstateValue: '2000000000.00', liquidAssets: '50000000.00', stockFundValue: '80000000.00' },
      debt: { hasDebt: false, mortgageDebt: '0.00', consumerDebt: '0.00', monthlyDebtService: '0.00' },
      socialSecurity: { socialInsuranceYears: 8, socialInsuranceSalary: '12000000.00' }
    }
  };

  const rows = [];
  let balance = 150000000;
  for (let i = 0; i < 360; i++) {
    const yr = 2026 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    const month = `${yr}-${String(m).padStart(2, '0')}`;
    const isRetire = i >= 240;
    const contrib = isRetire ? 0 : 5000000;
    const withdraw = isRetire ? 22000000 : 0;
    const ret = Math.round(balance * 0.006);
    balance = balance + contrib + ret - withdraw;
    rows.push({
      month,
      growthFactor: '1.0',
      inflationFactor: '1.0',
      income: isRetire ? '0' : '35000000',
      pension: isRetire ? '8000000' : '0',
      essentialExpense: isRetire ? '15000000' : '15000000',
      lifestyleExpense: isRetire ? '7000000' : '5000000',
      debtPayment: '0',
      disposableCash: '15000000',
      plannedContribution: String(contrib),
      actualContribution: String(contrib),
      openingBalance: String(balance - contrib - ret + withdraw),
      investmentReturn: String(ret),
      withdrawal: String(withdraw),
      closingBalance: String(balance),
      shortfall: '0',
      requiredBalance: String(Math.round(balance * 0.95))
    });
  }

  const plan = {
    id: 'plan-mock-1',
    userId: 'USR-001',
    currentVersionId: 'ver-mock-1',
    baselineVersionId: 'ver-mock-1',
    revision: 1,
    stale: false,
    createdAt: '2026-10-04T00:00:00.000Z',
    current: {
      id: 'ver-mock-1',
      planId: 'plan-mock-1',
      version: 1,
      createdAt: '2026-10-04T00:00:00.000Z',
      profileRevision: 1,
      snapshotHash: 'hash-mock',
      preview: {
        status: 'READY',
        inputHash: 'mock-hash',
        policy: { id: 'pol-1', version: 1, hash: 'p-hash' },
        assumptions: { id: 'asm-1', version: 1, hash: 'a-hash' },
        selection: {
          policyVersionId: 'pol-1',
          retirementAge: 60,
          monthlySavings: 5000000,
          monthlyContribution: '5000000',
          monthlyExpenseToday: '20000000',
          targetRetirementExpense: 20000000,
          scenario: 'BASE',
          answers: [{ questionId: 'q1', choiceId: 'c2' }]
        },
        calculation: {
          summary: {
            valuationDate: '2026-10-01',
            retirementMonth: '2046-10',
            endMonth: '2076-10',
            accumulationMonths: 240,
            retirementMonths: 360,
            initialRetirementCapital: '150000000',
            atRetirement: {
              projectedFund: '5120000000',
              requiredFund: '4850000000',
              fundingGap: '0',
              coveragePercent: '106'
            },
            atValuation: {
              projectedFund: '150000000',
              requiredFund: '140000000',
              fundingGap: '0',
              coveragePercent: '107'
            },
            algebraicRequiredFund: '4850000000',
            liquidityReserveAboveAlgebraicPV: '0',
            futureMonthlyExpense: '25400000',
            plannedMonthlyContribution: '5000000',
            requiredConstantMonthlyContribution: '4650000',
            additionalMonthlyContribution: '0',
            savingsStatus: 'NO_ADDITIONAL_CONTRIBUTION',
            requiredContributionWithinCapacity: true,
            retirementFundingShortfall: '0',
            excessAtRetirement: '270000000',
            firstShortfallMonth: null,
            firstBudgetShortfallMonth: null,
            unfundedWithdrawals: '0',
            terminalBalance: '850000000',
            fundedTerminalBalance: '850000000',
            terminalTarget: '500000000',
            terminalTargetShortfall: '0',
            firstMonthCapacity: '15000000',
            monthlyContribution: '5000000'
          },
          rows,
          annualProjections: []
        }
      }
    }
  };

  const planVersionItem = {
    id: 'ver-mock-1',
    planId: 'plan-mock-1',
    version: 1,
    createdAt: '2026-10-04T00:00:00.000Z',
    profileRevision: 1,
    snapshotHash: 'hash-mock',
    references: {
      profileHash: 'p-hash',
      policyVersionId: 'pol-1',
      policyVersion: 1,
      policyHash: 'pol-hash',
      assumptionVersionId: 'asm-1',
      assumptionVersion: 1,
      assumptionHash: 'asm-hash'
    },
    summary: plan.current.preview.calculation.summary
  };

  const policyDetail = {
    id: 'pol-1',
    version: 1,
    revision: 1,
    status: 'PUBLISHED',
    documentHash: 'hash-pol',
    createdBy: 'USR-001',
    publishedBy: 'USR-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    effectiveAt: '2026-01-01T00:00:00.000Z',
    data: {
      schemaVersion: 1,
      title: 'Chính sách danh mục chuẩn',
      reason: 'Danh mục chuẩn An Hưu',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      assumptionVersionId: 'asm-1',
      source: {
        title: 'Hội đồng đầu tư An Hưu',
        url: 'https://an-huu.vercel.app',
        release: '2026.1',
        reviewedOn: '2026-01-01'
      },
      questions: [
        {
          id: 'q1',
          dimension: 'LOSS_TOLERANCE',
          prompt: 'Khi thị trường giảm 20%, bạn sẽ làm gì?',
          choices: [
            { id: 'c1', label: 'Bán hết để bảo toàn vốn', score: 1 },
            { id: 'c2', label: 'Giữ nguyên danh mục', score: 2 },
            { id: 'c3', label: 'Mua thêm vì giá rẻ', score: 3 }
          ]
        }
      ],
      riskBands: [
        { id: 'rb1', label: 'Thận trọng', minScore: 1, maxScore: 1 },
        { id: 'rb2', label: 'Cân bằng', minScore: 2, maxScore: 2 },
        { id: 'rb3', label: 'Tăng trưởng', minScore: 3, maxScore: 3 }
      ],
      templates: [
        {
          id: 'tpl-1',
          label: 'Cân bằng',
          rebalance: {
            everyMonths: 12,
            timing: 'START_OF_MONTH',
            turnoverCostPercent: '0.1',
            costConvention: 'HALF_L1_TURNOVER_TIMES_COST',
            evidence: 'Lịch sử'
          },
          coverageMonths: 360,
          schedule: [
            {
              fromIndex: 0,
              toIndex: 360,
              allocations: [
                { assetClass: 'EQUITY', weightPercent: '50' },
                { assetClass: 'BOND', weightPercent: '50' }
              ]
            }
          ]
        }
      ],
      rules: [
        {
          id: 'r1',
          templateId: 'tpl-1',
          riskBandIds: ['rb2'],
          explanation: 'Phù hợp người dùng cân bằng',
          horizon: { min: 1, max: 40 },
          liquidityNeed: { min: 0, max: 100 },
          dimensions: {}
        }
      ],
      scenarios: []
    }
  };

  // Block analytics
  page.route(/(googletagmanager|google-analytics)\.com/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  page.route('**/api/v1/auth/**', route => route.fulfill({ json: { data: { accessToken: 'ui-test-token', user: currentUser } } }));
  page.route('**/api/v1/me', route => route.fulfill({ json: { data: currentUser } }));
  page.route('**/api/v1/me/onboarding-draft', route => route.fulfill({ json: { data: null } }));
  page.route('**/api/v1/me/financial-profile', route => route.fulfill({ json: { data: profile } }));

  page.route(/\/api\/v1\/me\/retirement\/plans/, route => {
    const url = route.request().url();
    if (url.includes('/versions')) {
      return route.fulfill({ json: { data: { page: 1, limit: 20, total: 1, items: [planVersionItem] } } });
    }
    if (url.includes('/preview')) {
      return route.fulfill({ json: { data: plan.current.preview } });
    }
    if (url.includes('/plan-mock-1') || url.match(/\/plans\/[A-Za-z0-9_-]+$/)) {
      return route.fulfill({ json: { data: plan } });
    }
    return route.fulfill({ json: { data: { page: 1, limit: 20, total: 1, items: [plan] } } });
  });

  page.route(/\/api\/v1\/me\/portfolio-policies/, route => {
    const url = route.request().url();
    if (url.includes('/portfolio-policies/pol-1') || url.match(/\/portfolio-policies\/[A-Za-z0-9_-]+$/)) {
      return route.fulfill({ json: { data: policyDetail } });
    }
    return route.fulfill({
      json: {
        data: {
          status: 'AVAILABLE',
          total: 1,
          page: 1,
          limit: 20,
          items: [{ id: 'pol-1', version: 1, revision: 1, status: 'PUBLISHED', title: 'Chính sách danh mục chuẩn', effectiveAt: '2026-01-01T00:00:00.000Z' }]
        }
      }
    });
  });

  page.route('**/api/v1/products**', route => route.fulfill({
    json: {
      data: {
        items: [
          { id: 'prod-1', partnerId: 'part-1', name: 'Quỹ Đầu tư Cổ phiếu Tiếp cận Thị trường', category: 'Quỹ mở cổ phiếu/trái phiếu', expectedReturn: '12%/năm', riskLevel: 'MEDIUM', description: 'Danh mục cổ phiếu tăng trưởng', annualFee: '1.2%/năm', conditions: 'Thời gian nắm giữ tối thiểu 30 ngày', disclosure: 'Minh bạch danh mục định kỳ', isVisible: true, partner: { id: 'part-1', name: 'Dragon Capital', type: 'OPEN_FUND' } },
          { id: 'prod-2', partnerId: 'part-2', name: 'Tiền gửi Tích lũy Hưu trí Tương lai', category: 'Tiết kiệm mục tiêu', expectedReturn: '6.5%/năm', riskLevel: 'LOW', description: 'Lãi suất bậc thang kỳ hạn 24 tháng', annualFee: 'Miễn phí', conditions: 'Trích nợ tự động định kỳ', disclosure: 'Bảo hiểm tiền gửi theo quy định', isVisible: true, partner: { id: 'part-2', name: 'Vietcombank', type: 'BANK' } }
        ],
        total: 2,
        page: 1,
        limit: 20
      }
    }
  }));
  page.route('**/api/v1/partners**', route => route.fulfill({
    json: {
      data: {
        items: [
          { id: 'part-1', name: 'Dragon Capital', type: 'OPEN_FUND', logoUrl: null, website: 'https://dragoncapital.com.vn', contactEmail: 'contact@dragoncapital.com.vn', isHighlight: true, isVisible: true },
          { id: 'part-2', name: 'Vietcombank', type: 'BANK', logoUrl: null, website: 'https://vietcombank.com.vn', contactEmail: 'support@vietcombank.com.vn', isHighlight: true, isVisible: true }
        ],
        total: 2,
        page: 1,
        limit: 20
      }
    }
  }));
  page.route('**/api/v1/me/notifications**', route => route.fulfill({
    json: { data: { items: [], total: 0, unread: 0, unreadCount: 0, limit: 25 } }
  }));
  page.route('**/api/v1/me/support**', route => route.fulfill({
    json: { data: { items: [], total: 0, limit: 10 } }
  }));
  page.route('**/api/v1/me/ai/**', route => route.fulfill({ json: { data: { processing: true, items: [] } } }));
  page.route('**/api/v1/me/notification-settings', route => route.fulfill({ json: { data: { emailDigest: true } } }));
  page.route('**/api/v1/me/debts**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }));
  page.route('**/api/v1/me/actuals**', route => route.fulfill({ json: { data: { items: [], total: 0 } } }));
}

async function captureMarketing(browser) {
  console.log('--- CAPTURING MARKETING PAGES ---');
  for (const screen of MARKETING_SCREENS) {
    console.log(`Capturing ${screen.id}...`);

    // Capture Demo
    const demoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await demoPage.goto(screen.demoUrl, { waitUntil: 'networkidle', timeout: 30000 });
      // Scroll down and up to trigger any IntersectionObserver reveal animations
      await demoPage.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 200));
        window.scrollTo(0, 0);
      });
      await demoPage.waitForTimeout(400);
      await demoPage.screenshot({ path: path.join(SCREENSHOT_DIR, `${screen.id}_demo.png`), fullPage: true });
    } catch (err) {
      console.error(`Error capturing Demo ${screen.id}:`, err.message);
    } finally {
      await demoPage.close();
    }

    // Capture Main
    const mainPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    setupMainRoutes(mainPage);
    try {
      await mainPage.goto(`${MAIN_BASE}${screen.mainPath}`, { waitUntil: 'networkidle', timeout: 30000 });
      await mainPage.waitForTimeout(400);
      await mainPage.screenshot({ path: path.join(SCREENSHOT_DIR, `${screen.id}_main.png`), fullPage: true });
    } catch (err) {
      console.error(`Error capturing Main ${screen.id}:`, err.message);
    } finally {
      await mainPage.close();
    }

    console.log(`Saved ${screen.id}_demo.png and ${screen.id}_main.png`);
  }
}

async function captureUserScreens(browser) {
  console.log('--- CAPTURING USER / APP PAGES ---');
  const demoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Seed demo sample profile first
  await demoPage.goto(`${DEMO_BASE}/app.html#sample`, { waitUntil: 'networkidle', timeout: 30000 });
  await demoPage.waitForTimeout(600);

  const mainPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  setupMainRoutes(mainPage);

  for (const screen of USER_SCREENS) {
    console.log(`Capturing ${screen.id}...`);

    // Capture Demo
    try {
      if (screen.demoJump === 'setup') {
        await demoPage.evaluate(() => {
          if (window.state) {
            window.state.user = { name: 'Minh An', email: 'an@example.com' };
            window.state.page = 'setup';
            window.state.step = 1;
            if (window.render) window.render();
          }
        });
        await demoPage.waitForTimeout(300);
      } else {
        await demoPage.evaluate((jumpKey) => {
          const el = document.createElement('button');
          el.dataset.x = `jump:${jumpKey}`;
          document.body.appendChild(el);
          el.click();
          el.remove();
        }, screen.demoJump);
      }
      await demoPage.waitForTimeout(500);
      await demoPage.screenshot({ path: path.join(SCREENSHOT_DIR, `${screen.id}_demo.png`), fullPage: true });
    } catch (err) {
      console.error(`Error capturing Demo ${screen.id}:`, err.message);
    }

    // Capture Main
    try {
      await mainPage.goto(`${MAIN_BASE}${screen.mainPath}`, { waitUntil: 'networkidle', timeout: 30000 });
      await mainPage.waitForTimeout(600);
      await mainPage.screenshot({ path: path.join(SCREENSHOT_DIR, `${screen.id}_main.png`), fullPage: true });
    } catch (err) {
      console.error(`Error capturing Main ${screen.id}:`, err.message);
    }

    console.log(`Saved ${screen.id}_demo.png and ${screen.id}_main.png`);
  }

  await demoPage.close();
  await mainPage.close();
}

async function main() {
  const mode = process.argv[2] || 'all';
  console.log(`Starting Visual Audit Capture (mode: ${mode})...`);
  const browser = await chromium.launch({ headless: true });

  try {
    if (mode === 'marketing' || mode === 'all') {
      await captureMarketing(browser);
    }
    if (mode === 'user' || mode === 'all') {
      await captureUserScreens(browser);
    }
    console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error in visual audit capture:', err);
  process.exit(1);
});
