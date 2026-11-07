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
          retirementAge: 60,
          monthlySavings: 5000000,
          monthlyContribution: '5000000',
          monthlyExpenseToday: '20000000',
          targetRetirementExpense: 20000000,
          scenario: 'BASE'
        },
        calculation: {
          summary: {
            retirementFundingShortfall: '0',
            retirementMonth: '2054-03',
            atRetirement: {
              requiredFund: '5000000000',
              projectedFund: '6000000000',
              coveragePercent: '120'
            }
          },
          annualProjections: []
        }
      }
    }
  };

  // Block analytics
  page.route(/(googletagmanager|google-analytics)\.com/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  page.route('**/api/v1/auth/**', route => route.fulfill({ json: { data: { accessToken: 'ui-test-token', user: currentUser } } }));
  page.route('**/api/v1/me', route => route.fulfill({ json: { data: currentUser } }));
  page.route('**/api/v1/me/financial-profile', route => route.fulfill({ json: { data: profile } }));
  page.route('**/api/v1/me/retirement/plans**', route => route.fulfill({ json: { data: plan } }));
  page.route('**/api/v1/me/notifications**', route => route.fulfill({ json: { data: { items: [], total: 0, unreadCount: 0 } } }));
  page.route('**/api/v1/me/portfolio-policies**', route => route.fulfill({
    json: {
      data: {
        status: 'AVAILABLE',
        total: 1,
        page: 1,
        limit: 20,
        items: [{ id: 'pol-1', version: 1, revision: 1, status: 'PUBLISHED', title: 'Chính sách danh mục chuẩn', effectiveAt: '2026-01-01T00:00:00.000Z' }]
      }
    }
  }));
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
}

async function captureMarketing(browser) {
  console.log('--- CAPTURING MARKETING PAGES ---');
  for (const screen of MARKETING_SCREENS) {
    console.log(`Capturing ${screen.id}...`);

    // Capture Demo
    const demoPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await demoPage.goto(screen.demoUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await demoPage.waitForTimeout(500);
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
      await mainPage.waitForTimeout(500);
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
        await demoPage.goto(`${DEMO_BASE}/app.html#setup`, { waitUntil: 'networkidle', timeout: 30000 });
      } else {
        await demoPage.evaluate((jumpKey) => {
          const [k, id] = jumpKey.split(':');
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

