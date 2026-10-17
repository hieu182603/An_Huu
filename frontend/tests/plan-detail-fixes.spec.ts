import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

async function planPage(page: Page, options: { policyError?: boolean; previewError?: boolean; applyError?: boolean; replayError?: boolean; plansError?: boolean; incomplete?: boolean; coverage?: string | null; historyCount?: number } = {}) {
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page, { profile: { revision: 3, schemaVersion: 2, data: {
    schemaVersion: 2, valuationDate: '2026-10-08', currency: 'VND', periodUnit: 'MONTH',
    personal: { birthMonth: { status: 'KNOWN', value: '1994-03' }, desiredRetirementMonth: { status: 'KNOWN', value: '2054-03' }, pensionStartMonth: { status: 'UNKNOWN' } },
    income: { status: 'KNOWN', entries: [{ id: 'income', kind: 'FIXED', label: 'Lương', basis: 'DISPOSABLE', amount: { status: 'KNOWN', value: '30000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    expenses: { status: 'KNOWN', entries: [{ id: 'expense', category: 'ESSENTIAL', label: 'Sinh hoạt', amount: { status: 'KNOWN', value: '20000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    assets: { status: 'KNOWN', entries: [] }, debts: { status: 'NOT_APPLICABLE', reason: 'Không có nợ' }
  } } });
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  let policyError = !!options.policyError, previewError = !!options.previewError, applyError = !!options.applyError, replayError = !!options.replayError, exportError = false;
  let plansError = !!options.plansError;
  const calls: { path: string; method: string; body: any }[] = [];
  const policy = { id: 'policy-audit', version: 1, data: { questions: [{ id: 'q1', choices: [{ id: 'BALANCED', score: 1 }] }], scenarios: [{ years: [{ year: 2055 }] }], rules: [{ horizon: { max: 360 } }], templates: [{ id: 'balanced', label: 'Cân bằng', coverageMonths: 360, schedule: [] }] } };
  await page.route('**/api/v1/me/portfolio-policies**', route => policyError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được chính sách kiểm thử.' } } }) : route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith('/policy-audit') ? policy : { status: 'AVAILABLE', items: [{ id: policy.id }], total: 1 } } }));
  const rows = Array.from({ length: 30 }, (_, i) => ({ month: `${2026 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, phase: 'ACCUMULATION', growthFactor: '1', inflationFactor: '1', income: '30000000', pension: '0', livingExpense: '20000000', additionalExpense: '0', debtPayment: '0', plannedContribution: '10000000', contribution: '10000000', contributionCapacity: '10000000', withdrawal: '0', uninvestedSurplus: '0', capitalInjection: '0', openingBalance: '0', investmentChange: '0', closingBalance: String(12345678 + i), fundedClosingBalance: '0', unfundedWithdrawal: '0', budgetShortfall: '0', requiredOpeningBalance: '0', requiredClosingBalance: '0', netWithdrawal: '0' }));
  const summary = { valuationDate: '2026-10-08', retirementMonth: '2054-03', endMonth: '2055-12', accumulationMonths: 330, retirementMonths: 22, initialRetirementCapital: '0', atRetirement: { projectedFund: '3000000000', requiredFund: '5000000000', coveragePercent: null }, requiredConstantMonthlyContribution: null, additionalMonthlyContribution: null, savingsStatus: 'NO_ELIGIBLE_CONTRIBUTION_PERIOD', retirementFundingShortfall: '2000000000', excessAtRetirement: '0', futureMonthlyExpense: '50000000' };
  if ('coverage' in options) {
    const coverage = Number(options.coverage);
    const required = options.coverage == null ? 0 : 100000000;
    const projected = Number.isFinite(coverage) ? coverage * required / 100 : 0;
    Object.assign(summary.atRetirement, { coveragePercent: options.coverage, requiredFund: String(required), projectedFund: String(projected) });
    summary.retirementFundingShortfall = String(Math.max(0, required - projected));
    summary.excessAtRetirement = String(Math.max(0, projected - required));
    // Reproduce the screenshot's long amount without depending on production data.
    if (options.coverage === '2822.14') {
      summary.excessAtRetirement = '21648153495';
      summary.atRetirement.requiredFund = '795262329.454032';
      summary.atRetirement.projectedFund = '22443415824.454032';
    }
  }
  const makePreview = (input: any, hash = `hash-${input.contributionTiming}`) => ({ status: 'READY', inputHash: hash, modelVersion: 'retirement-monthly-v2', profileRevision: 3, valuationDate: '2026-10-08', references: { profileHash: 'profile-hash' }, issues: [], warnings: [], selection: input, calculation: { summary, rows, netWorth: '0', limitations: [] } });
  let latest: any = null;
  const baselineSelection = { expectedProfileRevision: 2, policyVersionId: policy.id, answers: [{ questionId: 'q1', choiceId: 'BALANCED' }], liquidityNeedMonths: 6, endMonth: '2055-12', monthlyExpenseToday: '20000000', monthlyContribution: '10000000', monthlyReserve: '0', terminalBalance: '0', retirementIncomeIds: [], retirementAdditionalExpenseIds: [], debtStress: [], housing: [], scenario: 'BASE', contributionTiming: 'END_OF_MONTH', surplusPolicy: 'EXPLICIT_DEPOSITS_ONLY' };
  let versions: any[] = [{ id: 'version-old', version: 1, snapshotHash: 'profile-hash', createdAt: '2026-10-01T00:00:00Z', preview: makePreview(baselineSelection, 'old-hash') }, { id: 'version-history', version: 2, snapshotHash: 'history-hash', createdAt: '2026-10-02T00:00:00Z', preview: makePreview(baselineSelection, 'history-hash') }];
  if (options.historyCount !== undefined) versions = versions.slice(0, options.historyCount);
  let currentId = 'version-old', revision = 4;
  const detail = () => ({ id: 'plan-audit', revision, currentVersionId: currentId, baselineVersionId: 'version-old', current: versions.find(v => v.id === currentId), ...(options.policyError ? { readWarnings: [{ code: 'PLAN_HORIZON_TRUNCATED', message: 'Kế hoạch đã lưu kết thúc sớm hơn mục tiêu hiện tại.', endMonth: '2055-12', expectedEndMonth: '2074-03', goalRevision: 3 }] } : {}) });
  await page.route('**/api/v1/me/retirement/preview', async route => {
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
    if (path.endsWith('/replay')) return replayError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Lỗi kết nối replay.' } } }) : route.fulfill({ json: { data: { replay: { matched: true } } } });
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
  await page.goto('/user/plan'); await expect(page.locator('.plan-result-hero')).toBeVisible(); await expect(page.locator('.anhuu-loading')).toHaveCount(0);
  return { calls, setPlansError: (v: boolean) => { plansError = v; }, setPolicyError: (v: boolean) => { policyError = v; }, setApplyError: (v: boolean) => { applyError = v; }, setExportError: (v: boolean) => { exportError = v; }, setReplayError: (v: boolean) => { replayError = v; } };
}

test('plan redesign: results lead the page and section navigation reaches every destination', async ({ page }) => {
  await planPage(page, { coverage: '60' });
  const ids = ['plan-overview', 'plan-settings', 'plan-cashflow', 'plan-analysis'];
  const navigation = page.locator('.plan-section-nav');
  await expect(navigation).toBeVisible();
  expect(await navigation.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(ids.map(id => `#${id}`));
  expect(await page.locator('.retirement-plan-page [id]').evaluateAll((elements, sectionIds) => elements.map(element => element.id).filter(id => sectionIds.includes(id)), ids)).toEqual(ids);
  await expect(page.locator('#plan-overview .plan-result-hero')).toBeVisible();
  await expect(page.locator('#plan-overview .plan-metric-card')).toHaveCount(4);
  await expect(page.locator('#plan-settings').getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)', { exact: true })).toBeVisible();
  await expect(page.locator('#plan-cashflow .monthly-cashflow-table-component')).toBeVisible();
  await expect(page.locator('#plan-analysis [data-testid="risk-analysis"]')).toBeVisible();
  for (const id of ids) {
    await navigation.locator(`a[href="#${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
});

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
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  const value = page.locator('.result-total [role="button"]');
  await expect(value).toBeVisible(); await value.click();
  const popup = page.getByRole('dialog', { name: 'Quỹ cần có khi nghỉ hưu' });
  await expect(popup).toContainText('100.000.000 VND');
  expect(requests).toHaveLength(1); expect(requests[0].detail).toBe('SUMMARY'); expect(requests[0].source.kind).toBe('PREVIEW');
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
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  await page.locator('.result-total [role="button"]').click();
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
    await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
    await page.locator('.result-total [role="button"]').click();
    const popup = page.getByRole('dialog');
    await expect(popup).toContainText(scenario.message);
    await expect(popup).not.toContainText('A + B');
  });
}

test('plan redesign: desktop and mobile keep content readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await planPage(page, { coverage: '2822.14' });
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  const artifacts = fileURLToPath(new URL('../../artifacts/plan-redesign/', import.meta.url));
  await mkdir(artifacts, { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const selector of ['.retirement-page-header', '.plan-section-nav', '.plan-result-hero', '.plan-metrics', '#plan-settings', '#plan-cashflow', '#plan-analysis']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x, selector).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 1);
    }
    await expect(page.locator('.plan-result-hero')).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: `${artifacts}/plan-${viewport.width}-viewport.png` });
    await page.screenshot({ animations: 'disabled', fullPage: true, path: `${artifacts}/plan-${viewport.width}-full.png` });
  }
});

test('plan redesign: optional advisory fees expand and collapse from the keyboard', async ({ page }) => {
  await planPage(page, { coverage: '60' });
  const fees = page.locator('details.plan-fee-details');
  const summary = fees.locator('summary').first();
  const rate = fees.getByLabel('Phí tư vấn (%/năm)', { exact: true });
  await expect(fees).not.toHaveAttribute('open', '');
  await expect(rate).not.toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(fees).toHaveAttribute('open', '');
  await expect(rate).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(rate).toBeFocused();
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(fees).not.toHaveAttribute('open', '');
  await expect(rate).not.toBeVisible();
  await expect(summary).toBeFocused();
});

for (const example of [
  { value: '0', text: '0', filled: 0, state: 'is-warning' },
  { value: '25', text: '25', filled: 25, state: 'is-warning' },
  { value: '99.9', text: '99,9', filled: 99.9, state: 'is-warning' },
  { value: '99.9999', text: '< 100', filled: 99.9999, state: 'is-warning' },
  { value: '100', text: '100', filled: 100, state: 'is-safe' },
  { value: '150', text: '150', filled: 100, state: 'is-safe' },
  { value: '2822.14', text: '2.822,14', filled: 100, state: 'is-safe' },
  { value: '-25', text: '-25', filled: 0, state: 'is-warning' },
  { value: null, text: 'Chưa xác định', filled: 0, state: 'is-unknown' },
  { value: 'invalid', text: 'Chưa xác định', filled: 0, state: 'is-unknown' },
]) {
  test(`plan gauge: coverage ${example.value}`, async ({ page }) => {
    await planPage(page, { coverage: example.value });
    await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
    const panel = page.locator('.plan-progress-panel');
    await expect(panel.locator('.ring-number')).toHaveText(example.text);
    await expect(panel).toHaveClass(new RegExp(example.state));
    await expect(panel.getByRole('img')).toHaveAccessibleName(/Mức bao phủ quỹ:/);
    await expect(panel.locator('.gauge-milestone-text')).toHaveText(['0%', '100%']);
    const arc = panel.locator('.ring-main-arc');
    expect(await arc.evaluate(el => Number.parseFloat(getComputedStyle(el).strokeDashoffset))).toBeCloseTo(100 - example.filled, 3);
    if (example.filled === 0) {
      await expect(arc).toHaveAttribute('stroke', 'transparent');
      await expect(panel.locator('.gauge-tip-marker')).toHaveCount(0);
    } else {
      const geometry = await arc.evaluate((el, filled) => {
        const path = el as SVGPathElement;
        const point = path.getPointAtLength(path.getTotalLength() * filled / 100);
        const tip = document.querySelector('.gauge-tip-marker circle')!;
        const ys = Array.from({ length: 51 }, (_, i) => path.getPointAtLength(path.getTotalLength() * i / 50).y);
        return { distance: Math.hypot(point.x - Number(tip.getAttribute('cx')), point.y - Number(tip.getAttribute('cy'))), bottom: Math.max(...ys) };
      }, example.filled);
      expect(geometry.distance).toBeLessThan(0.1);
      expect(geometry.bottom).toBeLessThan(166);
    }
    if (example.value === '2822.14') {
      await expect(panel.locator('.gauge-multiplier-tag')).toHaveText('Gấp khoảng 28,22 lần quỹ cần.');
      await expect(panel.locator('.status-card-amount')).toHaveText('+21.648.153.495 VND');
    }
    if (example.value === '100') await expect(panel.locator('.status-card-amount')).toHaveText('0 VND');
    if (example.state === 'is-unknown') await expect(panel.locator('.ring-unit')).toHaveCount(0);
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`plan gauge layout: large coverage ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await planPage(page, { coverage: '2822.14' });
    const panel = page.locator('.plan-progress-panel');
    await expect(panel.locator('.ring-number')).toHaveText('2.822,14');
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const selector of ['.plan-progress-ring', '.ring-center-content', '.status-card-amount', '.status-card-desc']) {
      const bounds = await panel.locator(selector).evaluate(el => {
        const r = el.getBoundingClientRect(), p = el.closest('.plan-progress-panel')!.getBoundingClientRect();
        return { inside: r.left >= p.left && r.right <= p.right, overflow: el.scrollWidth > el.clientWidth + 1 };
      });
      expect(bounds).toEqual({ inside: true, overflow: false });
    }
    expect(await panel.locator('.ring-number').evaluate(el => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(1.3);
    expect(await panel.locator('.status-card-amount').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(35);
    await panel.screenshot({ animations: 'disabled', path: testInfo.outputPath('gauge.png') });
  });
}

test('plan gauge: English labels and reflow at a 200-percent-equivalent viewport', async ({ browser }, testInfo) => {
  // Browser zoom reduces the CSS viewport. CSS zoom on <html> does not update
  // media queries, so use half the viewport and twice the pixel density here.
  const context = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
  await page.addInitScript(() => localStorage.setItem('anhuu_language', 'en'));
  await planPage(page, { coverage: '2822.14' });
  const panel = page.locator('.plan-progress-panel');
  await expect(panel.locator('.ring-number')).toHaveText('2,822.14');
  await expect(panel.locator('.gauge-multiplier-tag')).toHaveText('About 28.22 times the required fund.');
  await expect(panel.getByRole('img')).toHaveAccessibleName('Fund coverage: 2,822.14%. Target: 100%.');
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await panel.locator('.ring-number').evaluate(el => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(1.3);
  await panel.screenshot({ animations: 'disabled', path: testInfo.outputPath('gauge-zoom.png') });
  } finally { await context.close(); }
});

test('plan: failed preview does not claim success or no contribution needed', async ({ page }) => {
  await planPage(page, { previewError: true }); await expect(page.locator('.plan-sync-status[role="alert"]')).toContainText('Chưa cập nhật được số liệu. Phiên bản đã lưu vẫn được giữ.');
  await expect(page.locator('.plan-metrics')).not.toContainText('Đã đạt trọn vẹn'); await expect(page.locator('.plan-metrics')).not.toContainText('Không cần thêm');
});

test('plan: preview CSV matches displayed rows rather than the previously applied version', async ({ page }) => {
  const f = await planPage(page); await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất file CSV', exact: true }).click(); const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf8')).toContain('12345678');
  expect(f.calls.filter(c => c.path.endsWith('/export.csv'))).toHaveLength(0);
});

test('plan: history is an accessible dialog and apply requires a separate confirmation', async ({ page }) => {
  const f = await planPage(page); await page.getByRole('button', { name: /Xem lịch sử/ }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Áp dụng bản này', exact: true }).click();
  expect(f.calls.filter(c => c.path.endsWith('/apply'))).toHaveLength(0);
  await expect(dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại v2', exact: true })).toBeVisible();
});

test('plan: missing policy has retry and preserves the preview versus applied distinction', async ({ page }) => {
  const f = await planPage(page, { policyError: true }); await expect(page.getByText('Chưa tải được chính sách danh mục', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeDisabled();
  f.setPolicyError(false); await page.getByRole('button', { name: 'Tải lại chính sách', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  await expect(page.locator('.header-status-badge')).toContainText('Chưa áp dụng chính thức');
  await expect(page.getByText('Kế hoạch bị cắt ngắn, nên tính lại', { exact: true })).toBeVisible();
  await expect(page.locator('.ring-center-content')).toContainText('Chưa xác định');
  await expect(page.locator('.plan-metrics')).toContainText('Chưa xác định');
  expect(f.calls.find(c => c.path === 'preview')?.body.endMonth).toBe('2055-12');
  await expect(page.getByText('50% Cổ phiếu', { exact: false })).toHaveCount(0);
});

test('plan: saving then applying and retrying a failed apply reuse the exact saved version', async ({ page }) => {
  const f = await planPage(page, { applyError: true }); const save = page.getByRole('button', { name: 'Lưu phương án này', exact: true });
  await expect(save).toBeEnabled(); await save.click(); await expect(page.getByRole('button', { name: 'Đã lưu bản v3', exact: true })).toBeDisabled();
  const apply = page.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true }); await expect(apply).toBeEnabled(); await apply.click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('đã lưu thành v3');
  await dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true }).click(); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await expect(page.getByText('Chưa áp dụng được phiên bản kiểm thử.', { exact: true })).toBeVisible();
  f.setApplyError(false); await dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.locator('.header-status-badge')).toContainText('Kế hoạch chính thức v3');
  expect(f.calls.filter(c => c.method === 'POST' && c.path.endsWith('/versions'))).toHaveLength(1);
  expect(f.calls.filter(c => c.path.endsWith('/apply')).map(c => c.body.versionId)).toEqual(['version-3', 'version-3']);
  f.setExportError(true); await page.getByRole('button', { name: 'Xuất file CSV', exact: true }).click();
  await expect(page.locator('.monthly-cashflow-table-component').getByRole('alert')).toContainText('Chưa xuất được CSV');
  f.setExportError(false); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất file CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('official.csv');
});

test('plan: cancelling preview application performs no writes', async ({ page }) => {
  const f = await planPage(page); const apply = page.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true });
  await expect(apply).toBeEnabled(); await apply.click(); await page.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(apply).toBeFocused();
  expect(f.calls.filter(c => c.method === 'POST' && c.path !== 'preview')).toHaveLength(0);
});

test('plan: history replay network error is not an integrity mismatch, retry works', async ({ page }) => {
  const f = await planPage(page, { replayError: true }); await page.getByRole('button', { name: /Xem lịch sử/ }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Kiểm tra kết quả', exact: true }).first().click();
  await expect(dialog.getByRole('status')).toContainText('Chưa kiểm chứng được'); await expect(dialog.getByRole('status')).not.toContainText('không trùng khớp');
  f.setReplayError(false); await dialog.getByRole('button', { name: 'Kiểm tra kết quả', exact: true }).first().click();
  await expect(dialog.getByRole('status')).toContainText('100%');
  await dialog.getByRole('button', { name: 'Áp dụng bản này', exact: true }).click(); await dialog.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
  expect(f.calls.filter(c => c.path.endsWith('/apply'))).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Áp dụng bản này', exact: true }).click(); await dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại v2', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(f.calls.find(c => c.path.endsWith('/apply'))?.body.versionId).toBe('version-history');
});

test('plan: changing timing hides old rows and confirms selection; year filter matches rows', async ({ page }) => {
  await planPage(page); await expect(page.getByRole('button', { name: 'Xuất file CSV', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Lọc năm', exact: true }).selectOption('2027');
  await expect(page.locator('.monthly-cashflow-table-component tbody tr:not(.cashflow-detail-row)')).toHaveCount(12);
  await expect(page.locator('.monthly-cashflow-table-component tbody th[scope="row"] strong')).toHaveText(Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, '0')}/2027`));
  await page.getByRole('button', { name: 'Đầu mỗi tháng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đầu mỗi tháng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Tiền sẵn có để góp vào đầu tháng (đồng) *', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Lọc năm', exact: true })).toHaveValue('ALL');
});

test('plan: list failure blocks saving instead of creating another plan', async ({ page }) => {
  const f = await planPage(page, { plansError: true }); await expect(page.getByText('Chưa tải được kế hoạch đã lưu', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Xem lịch sử/ })).toBeDisabled();
  f.setPlansError(false); await page.getByRole('button', { name: 'Tải lại kế hoạch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  expect(f.calls.filter(c => c.method === 'POST' && c.path.endsWith('/plans'))).toHaveLength(0);
});

test('plan: incomplete input has no actionable stale result', async ({ page }) => {
  await planPage(page, { incomplete: true }); await expect(page.getByText('Dữ liệu chưa hoàn tất', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true })).toBeDisabled();
  await expect(page.locator('.monthly-cashflow-table-component')).toHaveCount(0);
  await expect(page.locator('.plan-metrics')).not.toContainText('Không cần thêm');
});

test('plan: changed goal expense is sent in preview and saved with the matching hash', async ({ page }) => {
  const f = await planPage(page); await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  await page.locator('.user-sidebar a[href="/user/goal"]').click();
  await page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false }).fill('31000000');
  await page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true }).click();
  const save = page.getByRole('button', { name: 'Lưu phương án này', exact: true }); await expect(save).toBeEnabled(); await save.click();
  await expect(page.getByText('Bản xem trước này đã lưu thành phiên bản v3.', { exact: true })).toBeVisible();
  const saved = f.calls.find(c => c.method === 'POST' && c.path.endsWith('/versions'));
  expect(saved?.body.preview.monthlyExpenseToday).toBe('31000000');
  const matchingPreview = f.calls.filter(c => c.path === 'preview' && c.body.monthlyExpenseToday === '31000000' && !c.body.whatIf?.retirementMonth).at(-1);
  expect(matchingPreview).toBeDefined();
  expect(saved?.body.preview).toEqual(matchingPreview?.body);
  expect(saved?.body.expectedInputHash).toBe('hash-END_OF_MONTH');
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`plan layout: result, history and apply popup ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await planPage(page);
    const apply = page.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true }); await expect(apply).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('plan.png'), fullPage: true });
    await apply.click(); const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 8; i++) { await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('plan-apply.png') });
    await page.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
    await page.getByRole('button', { name: /Xem lịch sử/ }).click(); await expect(dialog).toBeVisible();
    expect(await page.locator('#root').evaluate(el => el.inert)).toBe(true);
    await expect(dialog).toHaveClass(/modal plan-wide-dialog/);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.width).toBeLessThanOrEqual(viewport.width); expect(box.height).toBeLessThanOrEqual(viewport.height);
    const cards = dialog.locator('.plan-version-card');
    const first = (await cards.nth(0).boundingBox())!, second = (await cards.nth(1).boundingBox())!;
    if (viewport.width >= 1024) {
      expect(box.width).toBeGreaterThan(1000); expect(second.x).toBeGreaterThan(first.x + first.width);
      expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    } else expect(second.y).toBeGreaterThan(first.y);
    await expect(dialog.locator('.plan-versions-overview')).toContainText('Đang áp dụng: v1');

    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Áp dụng bản này', exact: true }).click();
    await dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại v2', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Dùng làm kế hoạch hiện tại v2', exact: true })).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('plan-history.png') });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: /Xem lịch sử/ })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const historyCount of [0, 1]) {
  test(`plan history: wide dialog with ${historyCount} saved versions`, async ({ page }, testInfo) => {
    const f = await planPage(page, { historyCount, coverage: '2822.14' });
    await page.getByRole('button', { name: /Xem lịch sử/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.plan-version-card')).toHaveCount(historyCount);
    if (historyCount === 0) await expect(dialog).toContainText('Chưa có phiên bản nào được lưu');
    else {
      await expect(dialog.locator('.plan-version-metrics')).toContainText('2.822,14%');
      const card = (await dialog.locator('.plan-version-card').boundingBox())!;
      expect(card.width).toBeGreaterThan(900);
      await dialog.getByText('Thông tin đối chiếu', { exact: true }).click();
      await expect(dialog.getByText('Lần cập nhật kế hoạch: 4', { exact: true })).toBeVisible();
      await expect(dialog.getByText('profile-hash', { exact: true })).toBeVisible();
    }
    await dialog.screenshot({ path: testInfo.outputPath('history.png') });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    expect(f.calls.filter(c => c.method === 'POST' && c.path !== 'preview')).toHaveLength(0);
  });
}
