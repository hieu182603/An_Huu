import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

function forecast(throughMonth = '2026-08', status = 'READY') {
  return { status, valueKind: 'REFORECAST', planId: 'anchor-plan', versionId: 'anchor-v1', snapshotHash: 'hash', baselineVersionId: 'anchor-v1', throughMonth, originalRetirementMonth: '2054-03', actuals: [], issues: [],
    anchor: { period: throughMonth, revision: 2, closingBalance: '987654321.01' }, limitations: ['ORIGINAL_VERSION_FUTURE_CASHFLOWS_AND_RATES_RETAINED', 'ACTUAL_ONE_OFFS_NOT_REPEATED', 'NO_AUTOMATIC_SURPLUS_DEPOSIT', 'CONSOLIDATED_FUND_SCOPE_MUST_MATCH_VERSION', 'REFORECAST_NOT_SAVED_OR_APPLIED'],
    comparison: [{ month: throughMonth, actualRevision: 2, actualClosingBalance: '987654321.01', forecastClosingBalance: '900000000', closingBalanceDelta: '87654321.01', actualContribution: '1000000', forecastContribution: '2000000' }],
    calculation: status === 'READY' ? { summary: { atRetirement: { projectedFund: '1500000000', coveragePercent: null }, retirementMonth: '2054-03', endMonth: '2028-10' }, limitations: [], rows: Array.from({ length: 26 }, (_, i) => ({ month: `${2026 + Math.floor((8 + i) / 12)}-${String((8 + i) % 12 + 1).padStart(2, '0')}`, openingBalance: '987654321.01', contribution: '1000000', withdrawal: '0', closingBalance: `${988654321 + i}.01` })) } : null };
}

async function setup(page: Page, planState: "ready" | "empty" | "error" = "ready") {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  await page.route('**/socket.io/**', r => r.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const plan = { id: 'anchor-plan', revision: 2, currentVersionId: 'anchor-v1', current: { id: 'anchor-v1', version: 1, preview: { selection: { answers: [] }, calculation: { summary: { retirementMonth: '2054-03' } } } } };
  await page.route('**/me/retirement/plans**', route => planState === 'error' ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Plan unavailable' } } }) : route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith('/plans') ? { items: planState === 'empty' ? [] : [plan] } : new URL(route.request().url()).pathname.endsWith('/versions') ? { items: [] } : plan } }));
  await page.route('**/me/retirement/actuals/*', route => {
    const period = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return route.fulfill({ json: { data: { id: period, period, revision: 2, updatedAt: '2026-10-09', history: [], data: { currency: 'VND', openingBalance: '100000', closingBalance: '100000', entries: [], correctionReason: 'Đã đối soát' } } } });
  });
  await page.route('**/me/retirement/actuals/reforecast', route => route.fulfill({ json: { data: forecast(route.request().postDataJSON().throughMonth) } }));
  await page.goto('/user/simulation?tab=actuals');
  await page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true }).fill('2026-08');
  const run = page.getByRole('button', { name: 'Chạy dự báo neo số dư', exact: true }); if (planState === 'ready') await expect(run).toBeEnabled();
  return { run };
}

test('anchor: unknown coverage is explained and the comparison names its actual sources', async ({ page }) => {
  const { run } = await setup(page); await run.click();
  await expect(page.getByRole('heading', { name: 'Đối chiếu số thực tế với dự báo gốc', exact: true })).toBeVisible({ timeout: 2500 });
  await expect(page.locator('.anchor-reforecast-result').getByText('Chưa xác định', { exact: true })).toBeVisible();
});

test('anchor: retry hides previous successful result before the next response', async ({ page }) => {
  const { run } = await setup(page); await run.click(); await expect(page.getByText(/987.654.321/).first()).toBeVisible();
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  await page.route('**/me/retirement/actuals/reforecast', async route => { await gate; return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Test forecast unavailable' } } }); });
  await run.click(); await expect(page.getByText(/987.654.321/)).toHaveCount(0, { timeout: 2500 }); release();
  await expect(page.locator('#main-content').getByRole('alert').filter({ hasText: 'Lỗi dự báo lại' })).toContainText('Test forecast unavailable');
});

test('anchor: unknown blocking issue still has a readable explanation', async ({ page }) => {
  const { run } = await setup(page);
  await page.route('**/me/retirement/actuals/reforecast', route => route.fulfill({ json: { data: { ...forecast('2026-08', 'BLOCKED'), issues: [{ month: '2026-08', code: 'NEW_SERVER_CHECK' }] } } }));
  await run.click(); await expect(page.getByText(/Cần kiểm tra dữ liệu tháng này/)).toBeVisible({ timeout: 2500 });
});

test('anchor: future rows, year filter, pagination and assumptions use returned data', async ({ page }) => {
  const { run } = await setup(page); await run.click();
  const table = page.getByRole('region', { name: 'Dự báo các tháng tiếp theo', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(24);
  await expect(table.locator('tbody tr').first()).toContainText('2026-09');
  await expect(table.locator('tbody tr').first()).toContainText('988.654.321,01 ₫');
  const pagination = page.locator('.anchor-reforecast-result').getByRole('navigation');
  await pagination.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2); await expect(table).toContainText('2028-10');
  await page.getByLabel('Năm dự báo', { exact: true }).selectOption('2027');
  await expect(table.locator('tbody tr')).toHaveCount(12); await expect(pagination).toContainText('Trang 1 / 1');
  await expect(table).not.toContainText('2026-');
  await expect(page.getByText('Tiền dư không tự động được nộp vào quỹ.', { exact: true })).toBeVisible();
  await expect(page.getByText('Kết quả này chưa được lưu hoặc áp dụng vào kế hoạch.', { exact: true })).toBeVisible();
});

test('anchor: a delayed response cannot win after changing month and returning', async ({ page }) => {
  const { run } = await setup(page);
  let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let calls = 0;
  await page.route('**/me/retirement/actuals/reforecast', async route => {
    const first = ++calls === 1; if (first) await gate;
    const data = forecast(); data.anchor.closingBalance = first ? '111111' : '222222';
    return route.fulfill({ json: { data } });
  });
  await run.click(); await expect.poll(() => calls).toBe(1);
  const month = page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true });
  await month.fill('2026-07'); await expect(run).toBeEnabled(); await month.fill('2026-08'); await expect(run).toBeEnabled();
  await run.click(); await expect(page.locator('.anchor-summary')).toContainText('222.222 ₫');
  const response = page.waitForResponse(r => r.url().endsWith('/actuals/reforecast')); release(); await response;
  await expect(page.locator('.anchor-summary')).toContainText('222.222 ₫'); await expect(page.locator('.anchor-summary')).not.toContainText('111.111');
});

test('anchor: editing and restoring a balance invalidates the pending request', async ({ page }) => {
  const { run } = await setup(page);
  let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let called = false;
  await page.route('**/me/retirement/actuals/reforecast', async route => { called = true; await gate; return route.fulfill({ json: { data: forecast() } }); });
  await run.click(); await expect.poll(() => called).toBe(true);
  const closing = page.getByRole('textbox', { name: 'Số dư cuối kỳ', exact: true });
  await closing.fill('200000'); await expect(run).toBeDisabled(); await closing.fill('100000'); await expect(run).toBeEnabled();
  const response = page.waitForResponse(r => r.url().endsWith('/actuals/reforecast')); release(); await response;
  await expect(page.locator('.anchor-reforecast-result')).toHaveCount(0);
});

test('anchor: blocked months explain each cause and open the matching ledger with focus', async ({ page }) => {
  const { run } = await setup(page);
  await page.route('**/me/retirement/actuals/reforecast', route => route.fulfill({ json: { data: { ...forecast('2026-08', 'BLOCKED'), issues: ['MISSING_MONTH', 'UNRECONCILED_MONTH', 'OPENING_BALANCE_MISMATCH', 'MONTH_NOT_CLOSED'].map((code, i) => ({ month: `2026-0${i + 1}`, code })) } } }));
  await run.click(); const alert = page.getByRole('alert').filter({ hasText: 'Cần hoàn tất đối soát' });
  await expect(alert).toContainText('Chưa khai báo sổ thực tế'); await expect(alert).toContainText('Sổ thực tế chưa khớp'); await expect(alert).toContainText('tháng trước'); await expect(alert).toContainText('Tháng chưa kết thúc');
  await expect(alert.getByRole('button')).toHaveCount(3);
  await alert.getByRole('button', { name: 'Mở sổ tháng 2026-01', exact: true }).click();
  const month = page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true }); await expect(month).toHaveValue('2026-01'); await expect(month).toBeFocused(); await expect(alert).toHaveCount(0);
});

test('anchor: horizon completion links to the plan without showing fake results', async ({ page }) => {
  const { run } = await setup(page); await page.route('**/me/retirement/actuals/reforecast', route => route.fulfill({ json: { data: forecast('2026-08', 'HORIZON_COMPLETE') } }));
  await run.click(); const alert = page.locator('#main-content .inline-alert').filter({ hasText: 'Đã hết kỳ dự báo' });
  await expect(alert.getByRole('link', { name: 'Mở kế hoạch hưu trí' })).toHaveAttribute('href', '/user/plan'); await expect(page.locator('.anchor-summary')).toHaveCount(0);
});

test('anchor: incomplete success can retry and recover', async ({ page }) => {
  const { run } = await setup(page); let incomplete = true;
  await page.route('**/me/retirement/actuals/reforecast', route => route.fulfill({ json: { data: { ...forecast(), calculation: incomplete ? null : forecast().calculation } } }));
  await run.click(); await expect(page.getByText('Kết quả dự báo chưa đầy đủ', { exact: true })).toBeVisible();
  incomplete = false; await run.click(); await expect(page.locator('.anchor-summary')).toBeVisible(); await expect(page.getByText('Kết quả dự báo chưa đầy đủ', { exact: true })).toHaveCount(0);
});

for (const planState of ['empty', 'error'] as const) {
  test(`anchor: ${planState} plan explains the disabled forecast button`, async ({ page }) => {
    const { run } = await setup(page, planState); await expect(run).toBeDisabled();
    if (planState === 'empty') await expect(page.getByText('Cần có phiên bản kế hoạch chính thức.', { exact: false })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Tải lại kế hoạch', exact: true })).toBeVisible();
  });
}

test('anchor: exact decimal amounts and zero coverage remain visible', async ({ page }) => {
  const { run } = await setup(page); const data = forecast(); data.anchor.closingBalance = '9007199254740993.01';
  await page.route('**/me/retirement/actuals/reforecast', route => route.fulfill({ json: { data: { ...data, calculation: { ...data.calculation, summary: { ...data.calculation!.summary, atRetirement: { projectedFund: '0', coveragePercent: '0' } } } } } }));
  await run.click(); await expect(page.locator('.anchor-summary')).toContainText('9.007.199.254.740.993,01 ₫'); await expect(page.locator('.anchor-summary')).toContainText('0%');
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`anchor layout: ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const { run } = await setup(page); await run.click(); await expect(page.locator('.anchor-summary')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    const table = page.getByRole('region', { name: 'Dự báo các tháng tiếp theo', exact: true }); await table.focus(); await expect(table).toBeFocused();
    if (viewport.width < 800) { await table.press('ArrowRight'); await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0); }
    await page.getByLabel('Năm dự báo', { exact: true }).selectOption('2026');
    const closeToast = page.getByRole('complementary', { name: 'Thông báo hệ thống' }).getByRole('button', { name: 'Đóng thông báo' });
    if (await closeToast.count()) await closeToast.first().click();
    await table.evaluate(el => { el.scrollLeft = 0; });
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `../artifacts/ui-audit-2026-10-09/anchor-${viewport.width}x${viewport.height}.png`, fullPage: true }); expect(errors).toEqual([]);
  });
}
