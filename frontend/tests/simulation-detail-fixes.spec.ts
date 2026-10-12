import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

const periodNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const detail = (period: string, balance = '12345678') => ({ id: period, period, revision: 2, updatedAt: '2026-10-08', history: [], data: { currency: 'VND', openingBalance: balance, closingBalance: balance, entries: [], correctionReason: 'Đã kiểm tra' } });
async function setup(page: Page, options: { error?: number; tab?: string; policyError?: boolean; v2?: boolean; applied?: boolean } = {}) {
  await installRouteAuth(page); await installFinancialProfileRoutes(page, options.v2 ? { profile: { schemaVersion: 2, revision: 3, data: {
    schemaVersion: 2, valuationDate: '2026-10-08', currency: 'VND', periodUnit: 'MONTH',
    personal: { birthMonth: { status: 'KNOWN', value: '1994-03' }, desiredRetirementMonth: { status: 'KNOWN', value: '2054-03' }, pensionStartMonth: { status: 'UNKNOWN' } },
    income: { status: 'KNOWN', entries: [{ id: 'income', kind: 'FIXED', label: 'Lương', basis: 'DISPOSABLE', amount: { status: 'KNOWN', value: '30000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    expenses: { status: 'KNOWN', entries: [{ id: 'expense', category: 'ESSENTIAL', label: 'Sinh hoạt', amount: { status: 'KNOWN', value: '20000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    assets: { status: 'KNOWN', entries: [] }, debts: { status: 'NOT_APPLICABLE', reason: 'Không có nợ' }
  } } } : undefined);
  await page.route('**/socket.io/**', r => r.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  let error = options.error || 0, policyError = !!options.policyError;
  const writes: any[] = [], previews: any[] = [];
  const policy = { id: 'audit-policy', data: { questions: [], scenarios: [{ years: [{ year: 2099 }] }], rules: [] } };
  await page.route('**/me/portfolio-policies**', route => policyError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Policy unavailable' } } }) : route.fulfill({ json: { data: route.request().url().endsWith('/audit-policy') ? policy : { status: 'AVAILABLE', items: [{ id: policy.id }] } } }));
  const preview = (input: any) => ({ inputHash: 'test-hash', status: 'READY', selection: input, warnings: [], issues: [], calculation: { summary: { atRetirement: { requiredFund: '1000000000', projectedFund: '1200000000', coveragePercent: null }, retirementFundingShortfall: '0', excessAtRetirement: '200000000', retirementMonth: input.whatIf?.retirementMonth || '2054-03', initialRetirementCapital: '0', endMonth: input.endMonth }, rows: [] } });
  const savedVersion = { id: 'base-v1', version: 1, preview: preview({ answers: [], monthlyContribution: '7000000', monthlyExpenseToday: '15000000', scenario: 'ADVERSE' }) };
  const plan = { id: 'base-plan', revision: 2, currentVersionId: 'base-v1', current: savedVersion };
  await page.route('**/me/retirement/plans**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/simulate')) { const body = route.request().postDataJSON(); previews.push(body); return route.fulfill({ json: { data: { candidate: preview(body.candidate || body.preview || body), comparison: { delta: {} } } } }); }
    if (route.request().method() !== 'GET') { writes.push(route.request().postDataJSON()); return route.fulfill({ status: 503, json: { error: { code: 'TEST', message: 'Write prevented' } } }); }
    return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: options.applied ? [plan] : [] } : path.endsWith('/versions') ? { items: [savedVersion] } : plan } });
  });
  await page.route('**/me/retirement/preview', route => { const input = route.request().postDataJSON(); previews.push(input); return route.fulfill({ json: { data: preview(input) } }); });
  await page.route('**/me/retirement/actuals/*', route => {
    const period = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (route.request().method() !== 'GET') { writes.push({ period, body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] }); return route.fulfill({ json: { data: { ...detail(period), revision: 3 } } }); }
    return error ? route.fulfill({ status: error, json: { error: { code: error === 404 ? 'NOT_FOUND' : 'UNAVAILABLE', message: 'Ledger unavailable' } } }) : route.fulfill({ json: { data: detail(period) } });
  });
  await page.goto(`/user/simulation?tab=${options.tab || 'actuals'}`);
  return { writes, previews, recover: () => { error = 0; policyError = false; } };
}

test('simulation: ledger load error is not initialized as a new month', async ({ page }) => {
  await setup(page, { error: 503 });
  await expect(page.getByText('Chưa tải được sổ tháng', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(page.getByRole('button', { name: /Lưu sổ tháng/ })).toBeDisabled();
});

test('simulation: entering a minus sign does not crash the ledger', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await setup(page);
  await page.getByRole('button', { name: 'Thêm giao dịch', exact: true }).click();
  const row = page.locator('tbody tr').first(); await row.locator('select').selectOption('MARKET_CHANGE');
  await row.locator('input').nth(1).fill('-');
  await expect(page.getByRole('heading', { name: /Chi tiết giao dịch/ })).toBeVisible(); expect(errors).toEqual([]);
});

test('simulation: apply button opens confirmation without writing', async ({ page }) => {
  const f = await setup(page, { tab: 'what-if' }); await page.getByRole('button', { name: 'Áp dụng kịch bản này', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Áp dụng kịch bản này?', exact: true })).toBeVisible({ timeout: 2500 });
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Hủy', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Áp dụng kịch bản này', exact: true })).toBeFocused(); expect(f.writes).toEqual([]);
});

test('simulation: failed month can retry without any write', async ({ page }) => {
  const f = await setup(page, { error: 503 }); await expect(page.getByText('Chưa tải được sổ tháng', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true })).toHaveCount(0);
  f.recover(); await page.getByRole('button', { name: 'Tải lại sổ tháng', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true })).toHaveValue('12345678'); expect(f.writes).toEqual([]);
});

test('simulation: genuinely missing month needs declared balances, including confirmed zero', async ({ page }) => {
  const f = await setup(page, { error: 404 }); await expect(page.getByText('Tháng chưa có bản ghi', { exact: true })).toBeVisible();
  const opening = page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true }), closing = page.getByRole('textbox', { name: 'Số dư cuối kỳ', exact: true });
  await expect(opening).toHaveValue(''); await expect(closing).toHaveValue('');
  await expect(page.getByText('KHỚP HOÀN TOÀN', { exact: true })).toHaveCount(0);
  const save = page.getByRole('button', { name: /Lưu sổ tháng/ }); await expect(save).toBeDisabled();
  await opening.fill('0'); await closing.fill('0'); await expect(save).toBeEnabled(); expect(f.writes).toEqual([]);
});

test('simulation: late month response cannot overwrite the selected period', async ({ page }) => {
  await setup(page); await expect(page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true })).toHaveValue('12345678');
  let release!: () => void, started = false, finished = false; const gate = new Promise<void>(r => { release = r; });
  await page.route('**/me/retirement/actuals/2026-01', async route => { started = true; await gate; await route.fulfill({ json: { data: detail('2026-01', '111111') } }); finished = true; });
  await page.route('**/me/retirement/actuals/2026-02', route => route.fulfill({ json: { data: detail('2026-02', '222222') } }));
  const picker = page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true });
  await picker.fill('2026-01'); await expect.poll(() => started).toBe(true); await picker.fill('2026-02');
  await expect(page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true })).toHaveValue('222222');
  release(); await expect.poll(() => finished).toBe(true); await expect(page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true })).toHaveValue('222222');
});

test('simulation: exact decimal amounts survive save and editing is locked while saving', async ({ page }) => {
  await setup(page); const opening = page.getByRole('textbox', { name: 'Số dư đầu kỳ', exact: true });
  await expect(opening).toBeVisible(); await opening.fill('90071992547409.91'); await page.getByRole('textbox', { name: 'Số dư cuối kỳ', exact: true }).fill('90071992547408.66');
  await page.getByRole('button', { name: 'Thêm giao dịch', exact: true }).click(); await page.getByLabel('Loại dòng tiền 1', { exact: true }).selectOption('MARKET_CHANGE');
  await page.getByLabel('Số tiền 1', { exact: true }).fill('-1.25');
  let release!: () => void, body: any; const gate = new Promise<void>(r => { release = r; });
  await page.route('**/me/retirement/actuals/*', async route => { if (route.request().method() === 'GET') return route.fallback(); body = route.request().postDataJSON(); await gate; return route.fulfill({ json: { data: { ...detail(periodNow()), revision: 3 } } }); });
  await page.getByRole('button', { name: /Lưu sổ tháng/ }).click(); await expect.poll(() => body).toBeTruthy();
  await expect(opening).toBeDisabled(); await expect(page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Thử nghiệm kịch bản/ })).toBeDisabled();
  expect(body.data.openingBalance).toBe('90071992547409.91'); expect(body.data.entries[0].amount).toBe('-1.25'); expect(body.expectedRevision).toBe(2);
  release(); await expect(opening).toBeEnabled();
});

test('simulation: invalid partial amount and out-of-month date cannot be saved', async ({ page }) => {
  const f = await setup(page); await page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true }).fill('2026-02');
  await page.getByRole('button', { name: 'Thêm giao dịch', exact: true }).click();
  await page.getByLabel('Loại dòng tiền 1', { exact: true }).selectOption('MARKET_CHANGE'); await page.getByLabel('Số tiền 1', { exact: true }).fill('-');
  const save = page.getByRole('button', { name: /Lưu sổ tháng/ }); await expect(save).toBeDisabled();
  await page.getByLabel('Số tiền 1', { exact: true }).fill('-50'); await page.getByLabel('Ngày giao dịch 1', { exact: true }).fill('2026-03-01'); await expect(save).toBeDisabled();
  await expect(page.getByLabel('Ngày giao dịch 1', { exact: true })).toHaveAttribute('max', '2026-02-28');
  await page.getByLabel('Ngày giao dịch 1', { exact: true }).fill('2026-02-28'); await expect(save).toBeEnabled(); expect(f.writes).toEqual([]);
});

test('simulation: policy load retry and unknown coverage remain distinct', async ({ page }) => {
  const f = await setup(page, { tab: 'what-if', policyError: true }); await expect(page.getByText('Chưa tải được chính sách mô phỏng', { exact: true })).toBeVisible();
  f.recover(); await page.getByRole('button', { name: 'Tải lại chính sách', exact: true }).click();
  await expect(page.locator('.simulation-score strong')).toHaveText('Chưa xác định');
  await expect(page.locator('.simulation-primary-result')).toContainText('200.000.000');
});

test('simulation: keeps the declared retirement month rather than changing to December', async ({ page }) => {
  const f = await setup(page, { tab: 'what-if', v2: true }); await expect(page.locator('.simulation-primary-result')).toBeVisible();
  expect(f.previews.at(-1).whatIf.retirementMonth).toBe('2054-03');
  await page.getByRole('button', { name: 'Tăng 1 tuổi', exact: true }).click();
  await expect.poll(() => f.previews.at(-1).whatIf.retirementMonth).toBe('2055-03');
});

test('simulation: comparison uses the saved plan parameters and dirty ledger blocks reforecast', async ({ page }) => {
  await setup(page, { tab: 'what-if', applied: true }); await expect(page.locator('.simulation-primary-result')).toBeVisible();
  const rows = page.locator('.comparison-table > div');
  await expect(rows.filter({ hasText: 'Mức tích lũy / tháng' }).locator('strong').first()).toContainText('7.000.000');
  await expect(rows.filter({ hasText: 'Chi tiêu tháng khi hưu' }).locator('strong').first()).toContainText('15.000.000');
  await expect(rows.filter({ hasText: 'Kịch bản kinh tế' }).locator('strong').first()).toHaveText('ADVERSE');
  await page.getByRole('button', { name: 'Theo dõi tiến độ', exact: true }).click();
  const run = page.getByRole('button', { name: 'Chạy dự báo neo số dư', exact: true }); await expect(run).toBeEnabled();
  await page.getByRole('textbox', { name: 'Số dư cuối kỳ', exact: true }).fill('777'); await expect(run).toBeDisabled();
});

test('simulation: failed ledger save retries without losing input or changing its key', async ({ page }) => {
  await setup(page); const closing = page.getByRole('textbox', { name: 'Số dư cuối kỳ', exact: true }); await expect(closing).toBeVisible(); await closing.fill('123.45');
  let fail = true; const keys: string[] = [];
  await page.route('**/me/retirement/actuals/*', route => { if (route.request().method() === 'GET') return route.fallback(); keys.push(route.request().headers()['idempotency-key']); return fail ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Save failed for test' } } }) : route.fulfill({ json: { data: { ...detail(periodNow()), revision: 3 } } }); });
  await page.getByRole('button', { name: /Lưu sổ tháng/ }).click(); await expect(page.getByText('Chưa lưu được sổ tháng', { exact: true })).toBeVisible(); await expect(closing).toHaveValue('123.45');
  fail = false; await page.getByRole('button', { name: /Lưu sổ tháng/ }).click(); await expect(closing).toHaveValue('12345678'); expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[0]).toBe(keys[1]);
});

test('simulation: absent asset overrides are rejected rather than silently ignored', async ({ page }) => {
  const f = await setup(page, { tab: 'what-if', v2: true }); await expect(page.locator('.simulation-primary-result')).toBeVisible(); const count = f.previews.length;
  await page.locator('#simulation-real-estate').fill('500000000');
  await expect(page.getByRole('alert').filter({ hasText: 'Lỗi chạy mô phỏng' })).toContainText('Giá trị tài sản giả định cần đúng một tài sản tương ứng trong hồ sơ.'); expect(f.previews.length).toBe(count);
  await expect(page.getByRole('button', { name: 'Áp dụng kịch bản này', exact: true })).toHaveCount(0);
});

test('simulation: failed application retries the saved scenario without another version', async ({ page }) => {
  await setup(page, { tab: 'what-if', applied: true }); let saves = 0; const appliedIds: string[] = [];
  await page.route('**/plans/base-plan/versions', route => { if (route.request().method() === 'GET') return route.fallback(); saves++; return route.fulfill({ json: { data: { saved: { id: 'candidate-v2', version: 2 }, planId: 'base-plan', revision: 3 } } }); });
  await page.route('**/plans/base-plan/apply', route => { appliedIds.push(route.request().postDataJSON().versionId); return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Apply unavailable' } } }); });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Áp dụng kịch bản này', exact: true }).click();
    await page.getByRole('button', { name: 'Xác nhận áp dụng', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.simulation-summary').getByRole('alert')).toContainText('Apply unavailable');
  }
  expect(saves).toBe(1); expect(appliedIds).toEqual(['candidate-v2', 'candidate-v2']);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`simulation layout: ledger and what-if ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await setup(page);
    await page.getByRole('button', { name: 'Thêm giao dịch', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`capture-${Date.now()}.png`), fullPage: true });
    await page.getByRole('button', { name: /Thử nghiệm kịch bản/ }).click(); await expect(page.locator('.simulation-primary-result')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`capture-${Date.now()}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Áp dụng kịch bản này', exact: true }).click(); const dialog = page.getByRole('dialog');
    for (let i = 0; i < 8; i++) { await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(errors).toEqual([]);
  });
}

for(const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844},{width:390,height:400}]){
 test(`simulation asset inputs are readable and retain entered values ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await setup(page);
  await page.getByRole('button',{name:/Thử nghiệm kịch bản/}).click();
  for(const id of ['simulation-real-estate','simulation-stock-fund']){
   const input=page.locator('#'+id);await input.click();await input.fill('123456789');await expect(input).toHaveValue('123.456.789');
   const metrics=await input.evaluate(e=>({height:e.getBoundingClientRect().height,font:parseFloat(getComputedStyle(e).fontSize),label:parseFloat(getComputedStyle(document.querySelector(`label[for="${e.id}"]`)!).fontSize)}));
   expect(metrics.height).toBeGreaterThanOrEqual(44);expect(metrics.font).toBeGreaterThanOrEqual(16);expect(metrics.label).toBeGreaterThanOrEqual(14);
   await input.fill('');await expect(input).toHaveValue('');
  }
  await page.locator('#simulation-stock-fund').evaluate(el=>el.scrollIntoView({block:'center'}));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('asset-inputs.png')});
 });
}
