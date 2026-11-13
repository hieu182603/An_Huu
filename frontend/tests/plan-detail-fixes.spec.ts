import { toggleExplainMode } from "./helpers";
import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

// Behaviour checks for /user/plan after the demo-sync redesign (commit a0a85ac).
// Saved-version history, replay, report and history CSV live in the ?view=history
// sub-page and are covered by user-plan-sync.spec.ts; goal edits reaching the plan
// are covered by user-plan-journey.spec.ts.

async function planPage(page: Page, options: { policyError?: boolean; previewError?: boolean; applyError?: boolean; plansError?: boolean; incomplete?: boolean; coverage?: string | null } = {}) {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page, { profile: { revision: 3, schemaVersion: 2, data: {
    schemaVersion: 2, valuationDate: '2026-10-08', currency: 'VND', periodUnit: 'MONTH',
    personal: { birthMonth: { status: 'KNOWN', value: '1994-03' }, desiredRetirementMonth: { status: 'KNOWN', value: '2054-03' }, pensionStartMonth: { status: 'UNKNOWN' } },
    income: { status: 'KNOWN', entries: [{ id: 'income', kind: 'FIXED', label: 'Lương', basis: 'DISPOSABLE', amount: { status: 'KNOWN', value: '30000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    expenses: { status: 'KNOWN', entries: [{ id: 'expense', category: 'ESSENTIAL', label: 'Sinh hoạt', amount: { status: 'KNOWN', value: '20000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    assets: { status: 'KNOWN', entries: [] }, debts: { status: 'NOT_APPLICABLE', reason: 'Không có nợ' }
  } } });
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  let policyError = !!options.policyError, previewError = !!options.previewError, applyError = !!options.applyError, exportError = false;
  let plansError = !!options.plansError;
  const calls: { path: string; method: string; body: any }[] = [];
  const policy = { id: 'policy-audit', version: 1, data: { questions: [{ id: 'q1', choices: [{ id: 'BALANCED', score: 1 }] }], scenarios: [{ years: [{ year: 2055 }] }], rules: [{ horizon: { max: 360 } }], templates: [{ id: 'balanced', label: 'Cân bằng', coverageMonths: 360, schedule: [] }] } };
  await page.route('**/api/v1/me/portfolio-policies**', route => policyError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được chính sách kiểm thử.' } } }) : route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith('/policy-audit') ? policy : { status: 'AVAILABLE', items: [{ id: policy.id }], total: 1 } } }));
  const rows = Array.from({ length: 30 }, (_, i) => ({ month: `${2026 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, phase: 'ACCUMULATION', growthFactor: '1', inflationFactor: '1', income: '30000000', pension: '0', livingExpense: '20000000', additionalExpense: '0', debtPayment: '0', plannedContribution: '10000000', contribution: '10000000', contributionCapacity: '10000000', withdrawal: '0', uninvestedSurplus: '0', capitalInjection: '0', openingBalance: '0', investmentChange: '0', closingBalance: String(12345678 + i), fundedClosingBalance: '0', unfundedWithdrawal: '0', budgetShortfall: '0', requiredOpeningBalance: '0', requiredClosingBalance: '0', netWithdrawal: '0' }));
  const summary = { valuationDate: '2026-10-08', retirementMonth: '2054-03', endMonth: '2055-12', accumulationMonths: 330, retirementMonths: 22, initialRetirementCapital: '0', atRetirement: { projectedFund: '3000000000', requiredFund: '5000000000', fundingGap: '2000000000', coveragePercent: null as string | null }, requiredConstantMonthlyContribution: null, additionalMonthlyContribution: null, savingsStatus: 'NO_ELIGIBLE_CONTRIBUTION_PERIOD', retirementFundingShortfall: '2000000000', excessAtRetirement: '0', futureMonthlyExpense: '50000000' };
  if ('coverage' in options) {
    const coverage = Number(options.coverage);
    const required = options.coverage == null ? 0 : 100000000;
    const projected = Number.isFinite(coverage) ? coverage * required / 100 : 0;
    // fundingGap = requiredFund − projectedFund; the API always sends it (negative means a surplus).
    Object.assign(summary.atRetirement, { coveragePercent: options.coverage, requiredFund: String(required), projectedFund: String(projected), fundingGap: String(required - projected) });
    summary.retirementFundingShortfall = String(Math.max(0, required - projected));
    summary.excessAtRetirement = String(Math.max(0, projected - required));
    // Reproduce the screenshot's long amount without depending on production data.
    if (options.coverage === '2822.14') {
      summary.excessAtRetirement = '21648153495';
      summary.atRetirement.requiredFund = '795262329.454032';
      summary.atRetirement.projectedFund = '22443415824.454032';
      summary.atRetirement.fundingGap = '-21648153495';
    }
  }
  const makePreview = (input: any, hash = `hash-${input.contributionTiming}`) => ({ status: 'READY', inputHash: hash, modelVersion: 'retirement-monthly-v2', profileRevision: 3, valuationDate: '2026-10-08', references: { profileHash: 'profile-hash' }, issues: [], warnings: [], selection: input, calculation: { summary, rows, netWorth: '0', limitations: [] } });
  let latest: any = null;
  const baselineSelection = { expectedProfileRevision: 2, policyVersionId: policy.id, answers: [{ questionId: 'q1', choiceId: 'BALANCED' }], liquidityNeedMonths: 6, endMonth: '2055-12', monthlyExpenseToday: '20000000', monthlyContribution: '10000000', monthlyReserve: '0', terminalBalance: '0', retirementIncomeIds: [], retirementAdditionalExpenseIds: [], debtStress: [], housing: [], scenario: 'BASE', contributionTiming: 'END_OF_MONTH', surplusPolicy: 'EXPLICIT_DEPOSITS_ONLY' };
  const versions: any[] = [{ id: 'version-old', version: 1, snapshotHash: 'profile-hash', createdAt: '2026-10-01T00:00:00Z', preview: makePreview(baselineSelection, 'old-hash') }, { id: 'version-history', version: 2, snapshotHash: 'history-hash', createdAt: '2026-10-02T00:00:00Z', preview: makePreview(baselineSelection, 'history-hash') }];
  let currentId = 'version-old', revision = 4;
  const detail = () => ({ id: 'plan-audit', revision, currentVersionId: currentId, baselineVersionId: 'version-old', current: versions.find(v => v.id === currentId) });
  await page.route('**/api/v1/me/retirement/preview*', async route => {
    const body = route.request().postDataJSON(); calls.push({ path: 'preview', method: 'POST', body });
    await new Promise(resolve => setTimeout(resolve, 200));
    if (previewError) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Lỗi dự phóng kiểm thử.' } } });
    latest = makePreview(body); if (options.incomplete) { latest.status = 'INCOMPLETE'; latest.calculation = null; latest.issues = [{ path: 'profile', code: 'ANSWER_REQUIRED' }]; }
    return route.fulfill({ json: { data: latest } });
  });
  await page.route('**/api/v1/me/retirement/plans**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method(); const body = route.request().postDataJSON(); calls.push({ path, method, body });
    if (path.endsWith('/plans') && plansError) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được danh sách kế hoạch.' } } });
    if (path.endsWith('/export.csv')) return exportError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Lỗi tải CSV kiểm thử.' } } }) : route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename="official.csv"' }, body: 'official-version' });
    if (path.endsWith('/apply')) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (applyError) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Chưa áp dụng được phiên bản kiểm thử.' } } });
      currentId = body.versionId; revision++; return route.fulfill({ json: { data: { planId: 'plan-audit', revision, currentVersionId: currentId } } });
    }
    if (path.endsWith('/versions') && method === 'POST') {
      const saved = { id: `version-${versions.length + 1}`, version: versions.length + 1, snapshotHash: 'saved-hash', createdAt: '2026-10-08T00:00:00Z', preview: makePreview(body.preview, body.expectedInputHash) }; versions.push(saved); revision++;
      return route.fulfill({ json: { data: { saved, planId: 'plan-audit', revision } } });
    }
    return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: [detail()], total: 1 } : path.endsWith('/versions') ? { items: versions.map(v => ({ ...v, summary })), total: versions.length } : detail() } });
  });
  await page.goto('/user/plan'); await expect(page.locator('.retirement-plan-page h1')).toBeVisible(); await expect(page.locator('.anhuu-loading')).toHaveCount(0);
  return { calls, setPlansError: (v: boolean) => { plansError = v; }, setPolicyError: (v: boolean) => { policyError = v; }, setPreviewError: (v: boolean) => { previewError = v; }, setApplyError: (v: boolean) => { applyError = v; }, setExportError: (v: boolean) => { exportError = v; } };
}

const saveAsMain = (page: Page) => page.getByRole('button', { name: 'Lưu làm kế hoạch chính', exact: true });
const loadError = (page: Page) => page.getByRole('alert').filter({ hasText: 'Chưa tải được kế hoạch' });
const coverageSide = (page: Page) => page.locator('.plan-summary-hero__side');

// Contribution settings live on the "adjust" view: "Chỉnh sửa phương án" → "Giả định nâng cao".
async function openAdjust(page: Page) {
  await page.getByRole('button', { name: 'Chỉnh sửa phương án', exact: true }).first().click();
  await page.getByRole('button', { name: 'Giả định nâng cao', exact: true }).click();
  await expect(page.locator('#plan-settings')).toBeVisible();
}

// The monthly table and CSV export sit in the collapsed "Chi tiết dòng tiền và giả định" section.
async function openCashflow(page: Page) {
  await page.getByText('Chi tiết dòng tiền và giả định', { exact: true }).click();
  await expect(page.locator('.monthly-cashflow-table-component')).toBeVisible();
}

// --- Metric explanations (explain mode) ---------------------------------------------------

const requiredFundTarget = (page: Page) => page.locator('.plan-metrics .explain-target').first();

test('explanation metric compares raw value and requests MONTHLY only after the user asks', async ({ page }) => {
  await planPage(page, { coverage: '60' });
  const requests: any[] = [];
  await page.route('**/api/v1/me/explanations/metric', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const monthly = body.detail === 'MONTHLY';
    return route.fulfill({ json: { data: {
      metricKey: body.metricKey, detail: body.detail, label: { vi: 'Quỹ cần có khi nghỉ hưu', en: 'Required fund' },
      value: '100000000', unit: 'VND', formula: { vi: 'Cộng các khoản cần có.', en: 'Add the required amounts.', symbolic: 'A + B' },
      steps: [{ label: { vi: 'Khoản A', en: 'Amount A' }, value: '100000000', unit: 'VND', source: 'engine.summary' }, ...(monthly ? [{ label: { vi: 'Tháng 1', en: 'Month 1' }, value: '100000000', unit: 'VND', source: 'engine.rows[0]' }] : [])],
      assumptions: { version: 2, sources: [] }, notes: ['Chi tiết phép tính được cung cấp bởi máy chủ.'], limitations: ['Đây là ước tính.']
    } } });
  });
  await toggleExplainMode(page);
  const value = requiredFundTarget(page);
  await expect(value).toHaveText('100.000.000 ₫'); await value.click();
  const popup = page.getByRole('dialog', { name: 'Quỹ cần có khi nghỉ hưu' });
  await expect(popup).toContainText('100.000.000 đ');
  expect(requests).toHaveLength(1); expect(requests[0].detail).toBe('SUMMARY'); expect(requests[0].source.kind).toBe('PREVIEW');
  expect(requests[0].metricKey).toBe('summary.atRetirement.requiredFund');
  await popup.getByRole('button', { name: 'Xem chi tiết từng tháng' }).click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết phép tính theo tháng' })).toContainText('Tháng 1');
  expect(requests).toHaveLength(2); expect(requests[1].detail).toBe('MONTHLY');
});

test('explanation metric mismatch hides the formula and tells the user to reload', async ({ page }) => {
  await planPage(page, { coverage: '60' });
  await page.route('**/api/v1/me/explanations/metric', route => route.fulfill({ json: { data: {
    metricKey: 'summary.atRetirement.requiredFund', detail: 'SUMMARY', label: { vi: 'Quỹ cần có khi nghỉ hưu', en: 'Required fund' }, value: '999', unit: 'VND',
    formula: { vi: 'Công thức không được hiển thị.', en: 'Do not show this formula.', symbolic: 'A + B' }, steps: [], assumptions: { version: 2, sources: [] }, notes: [], limitations: []
  } } }));
  await toggleExplainMode(page);
  await requiredFundTarget(page).click();
  const popup = page.getByRole('dialog');
  await expect(popup).toContainText('Số liệu đã thay đổi, hãy tải lại');
  await expect(popup).not.toContainText('Công thức không được hiển thị.');
});

for (const scenario of [
  { name: 'unavailable metric', status: 422, code: 'METRIC_NOT_AVAILABLE', message: 'Chưa có giải thích cho số liệu này' },
  { name: 'rate limited metric', status: 429, code: 'RATE_LIMITED', message: 'Bạn thao tác hơi nhanh. Vui lòng chờ rồi thử lại.' },
]) {
  test(`explanation ${scenario.name} shows a localized message and does not fabricate a formula`, async ({ page }) => {
    await planPage(page, { coverage: '60' });
    await page.route('**/api/v1/me/explanations/metric', route => route.fulfill({ status: scenario.status, json: { error: { code: scenario.code, message: 'API fixture response' } } }));
    await toggleExplainMode(page);
    await requiredFundTarget(page).click();
    const popup = page.getByRole('dialog');
    await expect(popup).toContainText(scenario.message);
    await expect(popup).not.toContainText('A + B');
  });
}

// --- Coverage figure ----------------------------------------------------------------------

for (const example of [
  { value: '0', text: '0%', state: 'is-warning' },
  { value: '25', text: '25%', state: 'is-warning' },
  { value: '99.9', text: '99,9%', state: 'is-warning' },
  // A shortfall must never be rounded up to look like 100%.
  { value: '99.9999', text: '< 100%', state: 'is-warning' },
  { value: '100', text: '100%', state: 'is-safe' },
  { value: '150', text: '150%', state: 'is-safe' },
  { value: '2822.14', text: '2.822,14%', state: 'is-safe' },
  { value: '-25', text: '-25%', state: 'is-warning' },
  { value: null, text: 'Chưa xác định', state: 'is-unknown' },
  { value: 'invalid', text: 'Chưa xác định', state: 'is-unknown' },
]) {
  test(`plan coverage: ${example.value}`, async ({ page }) => {
    await planPage(page, { coverage: example.value });
    await expect(saveAsMain(page)).toBeEnabled();
    const side = coverageSide(page);
    await expect(side.getByText('Quỹ dự kiến bằng', { exact: true })).toBeVisible();
    await expect(side.locator('strong').first()).toHaveText(example.text);
    await expect(side).toHaveClass(new RegExp(example.state));
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`plan coverage layout: large coverage ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await planPage(page, { coverage: '2822.14' });
    const side = coverageSide(page);
    await expect(side.locator('strong').first()).toHaveText('2.822,14%');
    await side.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const bounds = await side.locator('strong').first().evaluate(el => {
      const r = el.getBoundingClientRect(), p = el.closest('.plan-summary-hero__side')!.getBoundingClientRect();
      return { inside: r.left >= p.left - 1 && r.right <= p.right + 1, overflow: el.scrollWidth > el.clientWidth + 1 };
    });
    expect(bounds).toEqual({ inside: true, overflow: false });
    await side.screenshot({ animations: 'disabled', path: testInfo.outputPath('coverage.png') });
  });
}

test('plan coverage: English labels and reflow at a 200-percent-equivalent viewport', async ({ browser }, testInfo) => {
  // Browser zoom reduces the CSS viewport. CSS zoom on <html> does not update
  // media queries, so use half the viewport and twice the pixel density here.
  const context = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => localStorage.setItem('anhuu_language', 'en'));
    await planPage(page, { coverage: '2822.14' });
    const side = coverageSide(page);
    await expect(side.getByText('Projected fund equals', { exact: true })).toBeVisible();
    await expect(side.locator('strong').first()).toHaveText('2,822.14%');
    await side.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await side.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await side.screenshot({ animations: 'disabled', path: testInfo.outputPath('coverage-zoom.png') });
  } finally { await context.close(); }
});

// --- Layout -------------------------------------------------------------------------------

test('plan redesign: desktop and mobile keep content readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await planPage(page, { coverage: '2822.14' });
  await expect(saveAsMain(page)).toBeEnabled();
  const artifacts = fileURLToPath(new URL('../../artifacts/plan-redesign/', import.meta.url));
  await mkdir(artifacts, { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const selector of ['.retirement-plan-page h1', '.plan-status', '.plan-summary-hero__side', '.plan-metrics', '.plan-chart-card']) {
      const box = (await page.locator(selector).first().boundingBox())!;
      expect(box.x, selector).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    }
    await expect(page.locator('.plan-status')).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: `${artifacts}/plan-${viewport.width}-viewport.png` });
    await page.screenshot({ animations: 'disabled', fullPage: true, path: `${artifacts}/plan-${viewport.width}-full.png` });
  }
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`plan layout: result and apply popup ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const f = await planPage(page);
    const save = saveAsMain(page); await expect(save).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('plan.png'), fullPage: true });
    await save.click();
    const dialog = page.getByRole('dialog', { name: 'Xác nhận đổi kế hoạch đang dùng' }); await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 8; i++) { await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('plan-apply.png') });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(save).toBeFocused();
    expect(f.calls.filter(c => c.method === 'POST' && c.path !== 'preview')).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}

test('plan redesign: optional advisory fees expand and collapse from the keyboard', async ({ page }) => {
  await planPage(page, { coverage: '60' });
  await openAdjust(page);
  const fees = page.locator('details.plan-fee-details');
  const summary = fees.locator('summary').first();
  const rate = fees.getByLabel('Phí tư vấn (%/năm)', { exact: true });
  await expect(fees).not.toHaveAttribute('open', '');
  await expect(rate).not.toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(fees).toHaveAttribute('open', '');
  await expect(rate).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(fees).not.toHaveAttribute('open', '');
  await expect(rate).not.toBeVisible();
  await expect(summary).toBeFocused();
});

// --- Loading and failure states -----------------------------------------------------------

test('plan: failed preview does not claim success or offer saving', async ({ page }) => {
  const f = await planPage(page, { previewError: true });
  await expect(loadError(page)).toContainText('Lỗi dự phóng kiểm thử.');
  await expect(page.locator('.plan-metrics')).toHaveCount(0);
  await expect(saveAsMain(page)).toHaveCount(0);
  f.setPreviewError(false); await loadError(page).getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(saveAsMain(page)).toBeEnabled();
  await expect(loadError(page)).toHaveCount(0);
});

test('plan: missing policy has retry and then shows an unsaved preview, not the applied plan', async ({ page }) => {
  const f = await planPage(page, { policyError: true });
  await expect(loadError(page)).toContainText('Không tải được chính sách kiểm thử.');
  await expect(saveAsMain(page)).toHaveCount(0);
  f.setPolicyError(false); await loadError(page).getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(saveAsMain(page)).toBeEnabled();
  // The recalculated result is a preview until the user saves it as the main plan.
  await expect(page.locator('.plan-status')).not.toHaveClass(/is-current/);
  await expect(page.locator('.plan-status')).toContainText('Lưu để dùng kết quả mới?');
  await expect(coverageSide(page).locator('strong').first()).toHaveText('Chưa xác định');
  expect(f.calls.find(c => c.path === 'preview')?.body.endMonth).toBe('2055-12');
  expect(f.calls.filter(c => c.method === 'POST' && c.path !== 'preview')).toHaveLength(0);
});

test('plan: list failure blocks saving instead of creating another plan', async ({ page }) => {
  const f = await planPage(page, { plansError: true });
  await expect(loadError(page)).toBeVisible();
  await expect(saveAsMain(page)).toHaveCount(0);
  f.setPlansError(false); await loadError(page).getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(saveAsMain(page)).toBeEnabled();
  expect(f.calls.filter(c => c.method === 'POST' && c.path.endsWith('/plans'))).toHaveLength(0);
});

test('plan: incomplete input has no actionable stale result', async ({ page }) => {
  await planPage(page, { incomplete: true });
  await expect(page.getByRole('heading', { name: 'Hoàn thiện thông tin để tính kế hoạch', exact: true })).toBeVisible();
  await expect(saveAsMain(page)).toHaveCount(0);
  await expect(page.locator('.plan-metrics')).toHaveCount(0);
  await expect(page.locator('.monthly-cashflow-table-component')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kế hoạch chưa có kết quả tính' })).not.toContainText('₫');
});

// --- Save, apply and export ---------------------------------------------------------------

test('plan: preview CSV matches displayed rows rather than the previously applied version', async ({ page }) => {
  const f = await planPage(page); await expect(saveAsMain(page)).toBeEnabled();
  await openCashflow(page);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất file CSV', exact: true }).click(); const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf8')).toContain('12345678');
  expect(f.calls.filter(c => c.path.endsWith('/export.csv'))).toHaveLength(0);
});

test('plan: cancelling preview application performs no writes', async ({ page }) => {
  const f = await planPage(page); const save = saveAsMain(page);
  await expect(save).toBeEnabled(); await save.click(); await page.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(save).toBeFocused();
  expect(f.calls.filter(c => c.method === 'POST' && c.path !== 'preview')).toHaveLength(0);
});

test('plan: saving then applying and retrying a failed apply reuse the exact saved version', async ({ page }) => {
  const f = await planPage(page, { applyError: true }); const save = saveAsMain(page);
  await expect(save).toBeEnabled(); await save.click();
  const dialog = page.getByRole('dialog', { name: 'Xác nhận đổi kế hoạch đang dùng' });
  const confirm = dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true });
  await confirm.click(); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Chưa áp dụng được phiên bản kiểm thử.');
  await expect(dialog.getByRole('status')).toContainText('Bản xem trước đã lưu thành v3');
  f.setApplyError(false); await confirm.click(); await expect(dialog).toHaveCount(0);
  await expect(page.locator('.plan-status')).toHaveClass(/is-current/);
  await expect(page.locator('.plan-status')).toContainText('Phiên bản v3 đã lưu');
  expect(f.calls.filter(c => c.method === 'POST' && c.path.endsWith('/versions'))).toHaveLength(1);
  expect(f.calls.filter(c => c.path.endsWith('/apply')).map(c => c.body.versionId)).toEqual(['version-3', 'version-3']);
  // The applied version exports the server's immutable CSV, with a visible retry on failure.
  await openCashflow(page);
  f.setExportError(true); await page.getByRole('button', { name: 'Xuất file CSV', exact: true }).click();
  await expect(page.locator('.monthly-cashflow-table-component').getByRole('alert')).toContainText('Chưa xuất được CSV');
  f.setExportError(false); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất file CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('official.csv');
});

test('plan: changing timing to start of month asks for start-of-month cash; year filter matches rows', async ({ page }) => {
  await planPage(page); await expect(saveAsMain(page)).toBeEnabled();
  await openCashflow(page);
  await page.getByRole('combobox', { name: 'Lọc năm', exact: true }).selectOption('2027');
  await expect(page.locator('.monthly-cashflow-table-component tbody tr:not(.cashflow-detail-row)')).toHaveCount(12);
  await expect(page.locator('.monthly-cashflow-table-component tbody th[scope="row"] strong')).toHaveText(Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, '0')}/2027`));
  await openAdjust(page);
  await page.locator('.plan-advanced-settings summary').click();
  const start = page.getByRole('button', { name: 'Đầu mỗi tháng', exact: true });
  await start.click();
  await expect(start).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Cuối mỗi tháng', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Tiền sẵn có để góp vào đầu tháng (đồng) *', { exact: true })).toBeVisible();
});
