import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

async function dashboard(page: Page, options: { profile?: any; reportError?: boolean; settingsError?: boolean; readError?: boolean; notificationsError?: boolean; noAssets?: boolean; noPlan?: boolean } = {}) {
  await installRouteAuth(page);
  const profile = options.profile ?? defaultMockProfile();
  if (options.noAssets) { for (const key of Object.keys(profile.data.assets)) (profile.data.assets as any)[key] = '0'; profile.data.debt = { hasDebt: true, mortgageDebt: '10000000', consumerDebt: '0', monthlyDebtService: '1000000' }; }
  await installFinancialProfileRoutes(page, { profile });
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const summary = { valuationDate: '2026-10-08', retirementMonth: '2054-10', endMonth: '2074-10', futureMonthlyExpense: '20000000', requiredConstantMonthlyContribution: null, savingsStatus: 'NO_ELIGIBLE_CONTRIBUTION_PERIOD', atRetirement: { projectedFund: '3000000000', requiredFund: '5000000000', coveragePercent: null }, retirementFundingShortfall: '2000000000' };
  const version = { id: 'audit-version', planId: 'audit-plan', version: 1, preview: { status: 'READY', calculation: { summary, annualProjections: [] }, selection: {} } };
  const plan = { id: 'audit-plan', currentVersionId: version.id, revision: 1, current: version };
  const calls: { path: string; method: string; body: any }[] = [];
  let reportError = !!options.reportError, settingsError = !!options.settingsError, readError = !!options.readError, notificationsError = !!options.notificationsError;
  let unread = 40, readAt: string | null = null;
  let settings = { revision: 7, emailDigest: false, goalAlerts: true, partnerUpdates: false, deliveryAvailable: { emailDigest: false, goalAlerts: true, partnerUpdates: false }, securityAndSupportRequired: true };
  let settingsWriteError = false;
  await page.route('**/api/v1/me/retirement/plans**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/report')) return reportError
      ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được báo cáo kiểm thử.' } } })
      : route.fulfill({ json: { data: { planId: plan.id, currentVersionId: version.id, status: 'AVAILABLE', valueKind: 'FORECAST', version, profileChanged: true, hypothetical: true } } });
    if (url.pathname.endsWith('/plans')) return route.fulfill({ json: { data: { items: options.noPlan ? [] : [plan], total: options.noPlan ? 0 : 1, limit: 50, page: 1 } } });
    return route.fulfill({ json: { data: url.pathname.endsWith('/versions') ? { items: [version], total: 1 } : plan } });
  });
  await page.route('**/api/v1/me/notification-settings', async route => {
    const method = route.request().method(); const body = route.request().postDataJSON(); calls.push({ path: 'settings', method, body });
    if (settingsError || (method === 'PUT' && settingsWriteError)) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải/lưu được cài đặt kiểm thử.' } } });
    if (method === 'PUT') { await new Promise(r => setTimeout(r, 250)); settings = { ...settings, ...body, revision: settings.revision + 1 }; }
    return route.fulfill({ json: { data: settings } });
  });
  await page.route('**/api/v1/me/notifications**', route => {
    const url = new URL(route.request().url()); const method = route.request().method(); calls.push({ path: url.pathname, method, body: route.request().postDataJSON() });
    if (notificationsError || (method === 'POST' && readError)) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Thông báo kiểm thử tạm thời không khả dụng.' } } });
    if (method === 'POST') { unread = url.pathname.endsWith('/read-all') ? 0 : 39; readAt = '2026-10-08T00:00:00Z'; return route.fulfill({ json: { data: { updated: true } } }); }
    return route.fulfill({ json: { data: { items: [{ id: 'notice-1', title: 'Cập nhật kế hoạch', message: 'Thông báo dành riêng cho kiểm thử', path: '/user/plan', readAt, createdAt: '2026-10-08T00:00:00Z' }], unread, total: 40, limit: 25 } } });
  });
  await page.goto('/user/dashboard');
  await expect(page.locator('.user-hero-title')).toBeVisible();
  await expect(page.locator('.anhuu-loading')).toHaveCount(0);
  const account = async (name = 'Cài đặt') => { await page.getByRole('button', { name: 'Tài khoản: Nguyễn Minh An', exact: true }).click(); await page.getByRole('menuitem', { name, exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); };
  return { account, calls, setReportError: (v: boolean) => { reportError = v; }, setSettingsError: (v: boolean) => { settingsError = v; }, setWriteError: (v: boolean) => { settingsWriteError = v; }, setReadError: (v: boolean) => { readError = v; }, setNotificationsError: (v: boolean) => { notificationsError = v; } };
}

test('dashboard: unavailable contribution and zero-asset ratio are not success or zero percent', async ({ page }) => {
  await dashboard(page, { noAssets: true });
  await expect(page.locator('.user-plan-grid')).toContainText('Chưa xác định');
  await expect(page.locator('.metric-coverage')).toContainText('Chưa xác định');
  await expect(page.locator('.debt-ratio-badge')).toContainText('Không xác định');
});

test('dashboard: report failure is visible and retry restores warnings', async ({ page }) => {
  const f = await dashboard(page, { reportError: true });
  await expect(page.getByText('Chưa tải được báo cáo kế hoạch', { exact: true })).toBeVisible();
  f.setReportError(false); await page.getByRole('button', { name: 'Tải lại báo cáo', exact: true }).click();
  await expect(page.getByText('Giả định whatIf', { exact: true })).toBeVisible();
  await expect(page.locator('.user-plan-alert')).toBeVisible();
});

test('dashboard settings: failed load cannot change defaults and retry saves server revision', async ({ page }) => {
  const f = await dashboard(page, { settingsError: true }); await f.account();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('alert')).toContainText('Không tải/lưu được');
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  f.setSettingsError(false); await dialog.getByRole('button', { name: 'Tải lại tùy chọn', exact: true }).click();
  const toggle = dialog.getByRole('switch', { name: 'Bản tổng hợp tiến độ hàng tháng', exact: true });
  await expect(toggle).not.toBeChecked(); await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).toBeDisabled();
  await expect(toggle).toBeEnabled(); await expect(toggle).toBeChecked();
  expect(f.calls.find(c => c.method === 'PUT')?.body).toEqual({ expectedRevision: 7, emailDigest: true, goalAlerts: true, partnerUpdates: false });
  expect(await page.evaluate(() => localStorage.getItem('an_huu_pref_digest'))).toBeNull();
});

test('dashboard account popup: keyboard stays inside and returns to avatar on close', async ({ page }) => {
  const f = await dashboard(page); await f.account('Xuất kế hoạch hưu trí');
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 12; i++) { await page.keyboard.press(i < 6 ? 'Tab' : 'Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  expect(await page.locator('#root').evaluate(el => el.inert)).toBe(true);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tài khoản: Nguyễn Minh An', exact: true })).toBeFocused();
});

test('dashboard notifications: badge uses server total and failed read preserves unread state', async ({ page }) => {
  const f = await dashboard(page, { readError: true });
  await expect(page.locator('.notif-badge-pill')).toHaveText('9+');
  await page.getByRole('button', { name: 'Thông báo', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Trung tâm thông báo mini' });
  await panel.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('không khả dụng');
  await expect(panel.locator('.notif-item-card.is-unread')).toHaveCount(1);
  f.setReadError(false); await panel.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click();
  await expect(panel.locator('.notif-item-card.is-unread')).toHaveCount(0);
  await expect(page).toHaveURL(/\/user\/dashboard$/);
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thông báo', exact: true })).toBeFocused();
});

test('dashboard settings: failed save preserves preference and next save uses confirmed revision', async ({ page }) => {
  const f = await dashboard(page); await f.account(); f.setWriteError(true);
  const toggle = page.getByRole('switch', { name: 'Bản tổng hợp tiến độ hàng tháng', exact: true });
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Không tải/lưu được');
  await expect(toggle).not.toBeChecked(); f.setWriteError(false);
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('switch', { name: 'Cảnh báo mục tiêu và ngân sách', exact: true })).toBeDisabled();
  await expect(toggle).toBeEnabled(); await expect(toggle).toBeChecked();
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(toggle).toBeEnabled(); await expect(toggle).not.toBeChecked();
  expect(f.calls.filter(c => c.method === 'PUT').map(c => c.body.expectedRevision)).toEqual([7, 7, 8]);
});

test('dashboard notifications: load retry, keyboard quick-read, and read-all failure', async ({ page }) => {
  const f = await dashboard(page, { notificationsError: true });
  await page.getByRole('button', { name: 'Thông báo', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Trung tâm thông báo mini' });
  await expect(panel.getByRole('alert')).toBeVisible(); await expect(panel.locator('.notif-empty-state')).toHaveCount(0);
  f.setNotificationsError(false); await panel.getByRole('button', { name: 'Tải lại thông báo', exact: true }).click();
  await expect(panel.locator('.notif-item-card')).toHaveCount(1);
  f.setReadError(true); await panel.getByRole('button', { name: 'Đọc tất cả', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible(); await expect(page.locator('.notif-badge-pill')).toHaveAttribute('aria-label', '40 unread');
  f.setReadError(false); await panel.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(panel.locator('.notif-item-card.is-unread')).toHaveCount(0); await expect(page).toHaveURL(/\/user\/dashboard$/);
  await expect(page.locator('.notif-badge-pill')).toHaveAttribute('aria-label', '39 unread');
  await panel.getByRole('button', { name: 'Chưa đọc', exact: false }).click();
  await expect(panel.locator('.notif-empty-state')).toContainText('danh sách gần đây');
  await panel.getByRole('button', { name: 'Đọc tất cả', exact: true }).click(); await expect(page.locator('.notif-badge-pill')).toHaveCount(0);
});

test('dashboard: search feedback clears while editing and chart periods announce selection', async ({ page }) => {
  await dashboard(page); await page.keyboard.press('Control+k');
  const search = page.getByRole('searchbox'); await expect(search).toBeFocused(); await search.press('Enter');
  await expect(page.locator('.topbar-search-feedback')).toBeVisible(); await search.fill('không tồn tại');
  await expect(page.locator('.topbar-search-feedback')).toHaveCount(0); await search.press('Enter');
  await expect(page.locator('.topbar-search-feedback')).toBeVisible(); await search.fill('Tổng quan'); await search.press('Enter');
  await expect(page.locator('.topbar-search-feedback')).toHaveCount(0);
  for (const label of ['5 năm', '10 năm', 'Đến nghỉ hưu', 'Trọn đời']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.chart-period [aria-pressed="true"]')).toHaveText(label);
  }
});

test('dashboard export: saved version download and honest print description', async ({ page }) => {
  const f = await dashboard(page);
  await page.route('**/audit-plan/versions/audit-version/export.csv', route => route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename="saved-plan.csv"' }, body: 'year,balance\n2026,5000\n' }));
  await f.account('Xuất kế hoạch hưu trí');
  await expect(page.getByRole('heading', { name: 'Phiên bản kế hoạch đã lưu (CSV)', exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất tệp CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('saved-plan.csv');
  await page.evaluate(() => { (window as any).auditPrintCount = 0; window.print = () => { (window as any).auditPrintCount++; }; });
  await expect(page.getByRole('heading', { name: 'In màn hình hiện tại', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'In hoặc lưu PDF', exact: true }).click();
  expect(await page.evaluate(() => (window as any).auditPrintCount)).toBe(1);
});

test('dashboard export: absent plan clearly labels local estimate', async ({ page }) => {
  const f = await dashboard(page, { noPlan: true }); await f.account('Xuất kế hoạch hưu trí');
  await expect(page.getByRole('heading', { name: 'Ước tính tham khảo từ hồ sơ (CSV)', exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất tệp CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('an-huu-du-phong-dong-tien.csv');
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`dashboard layout: dashboard and popups ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize(viewport); const f = await dashboard(page);
    const size = `${viewport.width}x${viewport.height}`;
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Thông báo', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Trung tâm thông báo mini' });
    await expect(panel).toBeVisible();
    await expect.poll(async () => { const b = await panel.boundingBox(); return !!b && b.x >= 0 && b.x + b.width <= viewport.width + 1 && b.y >= 0 && b.y + b.height <= viewport.height + 1; }).toBe(true);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`) });
    await page.keyboard.press('Escape'); await f.account('Xuất kế hoạch hưu trí');
    const close = page.getByRole('button', { name: 'Đóng cửa sổ', exact: true });
    await expect(close).toBeInViewport();
    await page.getByRole('button', { name: 'Xuất tệp CSV', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Xuất tệp CSV', exact: true })).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`) });
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cài đặt', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('switch', { name: 'Bản tổng hợp tiến độ hàng tháng', exact: true }).locator('..').scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`) });
    await close.click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Mở menu tài khoản', exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'Tất cả chức năng User', exact: true })).toBeVisible();
      await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(pageErrors).toEqual([]);
  });
}

function cashflowProfile() {
  const record: any = defaultMockProfile();
  record.schemaVersion = 2;
  record.data = { schemaVersion: 2, valuationDate: '2026-10-08', currency: 'VND', periodUnit: 'MONTH',
    personal: { birthMonth: { status: 'KNOWN', value: '1994-03' }, desiredRetirementMonth: { status: 'KNOWN', value: '2054-03' }, pensionStartMonth: { status: 'UNKNOWN' } },
    income: { status: 'KNOWN', entries: [{ id: 'income', label: 'Lương', kind: 'FIXED', basis: 'DISPOSABLE', amount: { status: 'KNOWN', value: '30000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    expenses: { status: 'KNOWN', entries: [{ id: 'expense', label: 'Sinh hoạt', category: 'ESSENTIAL', amount: { status: 'KNOWN', value: '0' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    assets: { status: 'UNKNOWN' }, debts: { status: 'NOT_APPLICABLE', reason: 'Không có nợ' } };
  return record;
}
for (const missing of ['expenses', 'debts', 'income-entry', 'expense-entry', 'debt-payment']) {
  test(`dashboard missing data: ${missing} cannot imply a surplus`, async ({page}) => {
    const record = cashflowProfile();
    if (missing === 'expenses' || missing === 'debts') record.data[missing] = {status:'UNKNOWN'};
    if (missing === 'income-entry') record.data.income.entries[0].amount = {status:'UNKNOWN'};
    if (missing === 'expense-entry') record.data.expenses.entries[0].amount = {status:'UNKNOWN'};
    if (missing === 'debt-payment') record.data.debts = {status:'KNOWN', entries:[{label:'Vay', outstandingBalance:{status:'KNOWN',value:'1000000'}, payment:{status:'UNKNOWN'}}]};
    await dashboard(page,{profile:record});
    const cashflow = page.locator('.user-cashflow-section');
    await expect(cashflow.locator('.theme-surplus, .theme-deficit')).toHaveCount(0);
    await expect(cashflow).toContainText('Chưa khai báo');
    await expect(cashflow).toContainText('Chưa đủ thông tin');
    await expect(cashflow.getByRole('link',{name:'Bổ sung thông tin thu chi'})).toBeVisible();
    await expect(page.locator('.networth-number')).toContainText('Chưa đủ thông tin');
  });
}
test('dashboard known zero and no debt remain valid cashflow inputs', async ({page}) => {
  await dashboard(page,{profile:cashflowProfile()});
  await expect(page.locator('.theme-expense .cashflow-value')).toContainText('0');
  await expect(page.locator('.theme-debt .cashflow-value')).toContainText('0');
  await expect(page.locator('.theme-surplus .cashflow-value')).toContainText('30.000.000');
});
test('dashboard mobile prioritizes plan and cashflow before chart; reflows at 200 percent equivalent', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await dashboard(page);
  const header = (await page.locator('.dashboard-summary-header').boundingBox())!;
  expect(header.height).toBeLessThan(180);
  const metric = (await page.locator('.user-plan-metric').first().boundingBox())!;
  expect(metric.y).toBeLessThan(844);
  const cashflow = (await page.locator('.user-cashflow-section').boundingBox())!;
  const chart = (await page.locator('.user-trajectory-wrap').boundingBox())!;
  expect(cashflow.y + cashflow.height).toBeLessThan(chart.y);
  await page.setViewportSize({width:720,height:500});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('dashboard-reflow.png'),fullPage:true});
});
