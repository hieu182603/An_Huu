import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

// Execute the compiled debt engine locally, with fixtures only (no database).
const require = createRequire(import.meta.url);
const { previewDebts } = require('../../backend/dist/modules/debts/engine.js');
const { profileV2Schema } = require('../../backend/dist/modules/profiles/schema-v2.js');
const known = (value: string) => ({ status: 'KNOWN', value });
const none = { status: 'NOT_APPLICABLE', reason: 'Không có' };
function profile() {
  const periods = Array.from({ length: 10 }, (_, i) => ({ dueDate: `${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, '0')}-28`, rate: { kind: 'NOMINAL_ANNUAL_MONTHLY', percent: '12' }, repayment: { kind: 'PRINCIPAL_PLUS_INTEREST', amount: '10000000' }, minimumPayment: '0', fee: '0', prepayment: { status: 'ALLOWED', mode: 'PARTIAL_OR_FULL', minimumPrincipal: '0', maximumPrincipal: null, fixedFee: '0', feePercent: '0', effect: 'REDUCE_TERM_KEEP_SCHEDULE', funding: 'SOLE_BORROWER', evidence: 'Test agreement' } }));
  return profileV2Schema.parse({ schemaVersion: 2, currency: 'VND', periodUnit: 'MONTH', valuationDate: '2026-10-04',
    personal: { birthMonth: known('1976-10'), desiredRetirementMonth: known('2036-10'), pensionStartMonth: none },
    income: { status: 'KNOWN', entries: [{ id: 'salary', label: 'Lương', kind: 'FIXED', basis: 'DISPOSABLE', amount: known('30000000'), currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    expenses: { status: 'KNOWN', entries: [{ id: 'living', label: 'Sinh hoạt', category: 'ESSENTIAL', amount: known('10000000'), currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    assets: none, pension: none,
    debts: { status: 'KNOWN', entries: [{ id: 'loan-a', label: 'Khoản vay kiểm thử', currency: 'VND', outstandingBalance: known('100000000'), balanceAsOf: known('2026-10-04'), payment: known('999999999'), paymentShare: known('1'), balanceShare: known('1'), responsibility: { status: 'KNOWN', scope: 'FULL', confirmedDocument: 'Test contract', limit: known('100000000') }, startMonth: '2026-01', endMonth: '2027-07', frequency: 'MONTHLY', contract: { status: 'KNOWN', value: { contractVersion: 1, source: 'Test contract', confirmedOn: '2026-10-01', balanceAsOf: '2026-10-04', interestBasis: 'REDUCING_BALANCE', periodConvention: 'DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS', maturityDate: '2027-07-28', settleRemainingAtMaturity: true, parties: [{ reference: 'borrower', role: 'BORROWER' }], periods } } }] },
  });
}
const { profileDebtSummary } = require('../../backend/dist/modules/profiles/debt-summary.js');
const { debtChanges } = require('../../backend/dist/modules/profiles/debt-commands.js');

// /user/debts after the demo-sync redesign (a0a85ac): the debt report comes from
// GET /me/financial-profile/debts and the repayment comparison is an explicit,
// collapsed "So sánh phương án trả nợ" preview. Both are served by the compiled engine.
async function setup(page: Page, data = profile()) {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { error: { message: 'Unmocked test API' } } }));
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page, { profile: { schemaVersion: 2, revision: 3, data } });
  await page.route('**/api/v1/me/retirement/plans**', route => route.fulfill({ json: { data: { items: [] } } }));
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.route('**/api/v1/me/financial-profile/debts', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { data: profileDebtSummary(data, 3) } }) : route.fallback());
  const calls: any[] = [];
  await page.route('**/api/v1/me/debts/preview', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    return route.fulfill({ json: { data: { ...previewDebts(data, body), profileRevision: 3, capital: { netWorth: '0', retirementLiquidAssets: '0' } } } });
  });
  return { calls, data };
}
async function openComparison(page: Page) {
  await page.goto('/user/debts');
  await expect(page.getByTestId('debt-total')).not.toHaveText('Chưa xác định');
  await page.locator('.debt-comparison > summary').click();
  return {
    horizon: page.getByLabel('Số tháng phân tích', { exact: true }),
    reserve: page.getByLabel('Giữ lại mỗi tháng (0 nếu không có)', { exact: true }),
    extra: page.getByLabel('Ngân sách trả thêm mỗi tháng (0 nếu không có)', { exact: true }),
    compare: page.getByRole('button', { name: 'Xem so sánh', exact: true }),
    panel: page.getByRole('region', { name: 'Kết quả phân tích trả nợ' }),
  };
}

test('typing comparison inputs never saves or recalculates until the user asks', async ({ page }) => {
  const { calls } = await setup(page);
  const writes: string[] = [];
  page.on('request', req => { if (['PATCH', 'PUT', 'DELETE'].includes(req.method())) writes.push(req.url()); });
  const ui = await openComparison(page);
  await ui.reserve.pressSequentially('1234567', { delay: 50 });
  await ui.extra.pressSequentially('555', { delay: 50 });
  // Click straight from the focused money field: its quick-pick row must not move the button mid-click.
  await expect(page.getByRole('group', { name: 'Gợi ý số tiền' })).toBeVisible();
  // Longer than any debounce: no preview or profile write is allowed while typing.
  await page.waitForTimeout(750);
  expect(calls).toHaveLength(0); expect(writes).toEqual([]);
  await expect(ui.panel).toHaveCount(0);
  await ui.compare.click();
  await expect.poll(() => calls.at(-1)?.reserveMonthly).toBe('1234567');
  expect(calls.at(-1)).toMatchObject({ expectedProfileRevision: 3, horizonMonths: 120, extraMonthlyBudget: '555' });
  await expect(ui.panel).toBeVisible();
  expect(writes).toEqual([]);
});

test('real engine results show monthly cash, DTI and payoff date; changed inputs need a new comparison', async ({ page }) => {
  const { calls } = await setup(page);
  const ui = await openComparison(page);
  // Blank reserve/budget are unknown (shown as -), never silently 0.
  await ui.compare.click();
  await expect(ui.panel).toContainText('36,7%');
  await expect(ui.panel).toContainText('Nhập khoản giữ lại và ngân sách trả thêm; nhập 0 nếu không có.');
  await ui.reserve.fill('0'); await ui.extra.fill('0'); await ui.compare.click();
  await expect(ui.panel).toContainText('9.000.000 VND');
  await expect(ui.panel).toContainText('28/07/2027');
  await expect(ui.panel).not.toContainText(/TỐI ĐA|Tối ưu toán học|\+Chưa có|Vượt kỳ phân tích/);
  await ui.reserve.fill('2000000');
  // A result computed from other inputs must not stay on screen.
  await expect(ui.panel).toHaveCount(0);
  await ui.compare.click();
  await expect(ui.panel).toContainText('7.000.000 VND');
  await ui.extra.fill('3000000'); await ui.compare.click();
  await expect.poll(() => calls.at(-1)?.extraMonthlyBudget).toBe('3000000');
  await expect(ui.panel.locator('.debt-comparison-savings strong').first()).not.toHaveText('0 VND');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('missing contracts and missing cashflow never masquerade as successful projections', async ({ page }) => {
  const data = profile(); data.debts.entries[0].contract = { status: 'UNKNOWN' };
  await setup(page, data);
  const ui = await openComparison(page);
  await ui.compare.click();
  await expect(ui.panel).toContainText('Khoản vay kiểm thử:');
  await expect(ui.panel).toContainText('Bổ sung lịch trả gốc, lãi và phí theo hợp đồng.');
  await expect(ui.panel.locator('.debt-results-strategies')).toHaveCount(0);
  await expect(ui.panel).not.toContainText(/Chưa trả hết|Vượt kỳ|\+Chưa có|tiết kiệm tối đa/i);
  data.debts.entries[0].contract = profile().debts.entries[0].contract;
  data.income = { status: 'UNKNOWN' };
  await ui.horizon.fill('24'); await ui.compare.click();
  await expect(ui.panel).toContainText('Một phần kỳ phân tích còn thiếu thu nhập hoặc chi tiêu');
  await expect(ui.panel).not.toContainText('Chưa ghi nhận trong kỳ');
  await expect(ui.panel.locator('.debt-comparison-savings')).toContainText(['Chưa đủ thông tin', 'Chưa đủ thông tin']);
});

test('errors can be retried; a result for outdated inputs is discarded', async ({ page }) => {
  const { data } = await setup(page);
  let fail = true;
  let release: (() => void) | undefined;
  await page.route('**/api/v1/me/debts/preview', async route => {
    if (fail) return route.fulfill({ status: 503, json: { error: { message: 'Lỗi tạm thời khi tính nợ.' } } });
    const body = route.request().postDataJSON();
    if (body.reserveMonthly === '1000000') await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill({ json: { data: { ...previewDebts(data, body), profileRevision: 3 } } });
  });
  const ui = await openComparison(page);
  await ui.reserve.fill('0'); await ui.extra.fill('0');
  await ui.compare.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Lỗi tạm thời khi tính nợ.' })).toBeVisible();
  await expect(ui.panel).toHaveCount(0);
  fail = false; await ui.compare.click();
  await expect(ui.panel).toContainText('9.000.000 VND');
  await ui.reserve.fill('1000000'); await ui.compare.click(); await expect.poll(() => Boolean(release)).toBe(true);
  await ui.reserve.fill('3000000');
  release!();
  await expect(ui.compare).toBeEnabled();
  // The late response belongs to reserve 1.000.000 and must not be shown as current.
  await expect(ui.panel).toHaveCount(0);
  await ui.compare.click();
  await expect(ui.panel).toContainText('6.000.000 VND');
});

test('higher prepayment fees are shown as additional costs, not savings', async ({ page }) => {
  const data = profile();
  data.income.entries[0].amount.value = '300000000';
  data.debts.entries[0].contract.value.periods.forEach((period: any) => { period.prepayment.fixedFee = '10000000'; });
  await setup(page, data);
  const ui = await openComparison(page);
  await ui.reserve.fill('0'); await ui.extra.fill('150000000'); await ui.compare.click();
  const savings = ui.panel.locator('.debt-comparison-savings').first();
  await expect(savings).toContainText('Lãi và phí tăng thêm');
  await expect(savings).toContainText('5.500.000 VND');
  await expect(savings).not.toContainText('+-');
});

test('short analysis periods show remaining debt and scope instead of a fabricated payoff date', async ({ page }) => {
  const data = profile();
  const loan = data.debts.entries[0];
  const period = loan.contract.value.periods[0];
  loan.contract.value.periods = Array.from({ length: 40 }, (_, i) => ({ ...structuredClone(period), dueDate: `${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, '0')}-28` }));
  loan.contract.value.maturityDate = '2030-01-28'; loan.endMonth = '2030-01'; loan.outstandingBalance.value = '400000000';
  await setup(page, data);
  const ui = await openComparison(page);
  await ui.horizon.fill('24'); await ui.compare.click();
  await expect(ui.panel).toContainText('Chưa trả hết trong 24 tháng');
  await expect(ui.panel).toContainText('160.000.000 VND');
  await expect(ui.panel).toContainText('Chỉ tính trong 24 tháng');
  await expect(ui.panel).not.toContainText('28/01/2030');
});

test('loan months are validated before saving and keep the undeclared contract', async ({ page }) => {
  const data = profile(); data.debts.entries[0].contract = { status: 'UNKNOWN' }; data.debts.entries[0].payment = known('10000000');
  await setup(page, data);
  let saved = data, revision = 3;
  const patches: any[] = [];
  const record = () => ({ data: { schemaVersion: 2, revision, data: saved } });
  await page.route('**/api/v1/me/financial-profile', route => route.fulfill({ json: record() }));
  await page.route('**/api/v1/me/financial-profile/debts', async route => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: { data: profileDebtSummary(saved, revision) } });
    const body = route.request().postDataJSON(); patches.push(body);
    saved = profileV2Schema.parse({ ...saved, ...debtChanges(saved, body.command) }); revision++;
    return route.fulfill({ json: record() });
  });
  await page.goto('/user/debts');
  await page.getByRole('button', { name: 'Sửa Khoản vay kiểm thử', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tháng bắt đầu trả', { exact: true }).fill('2026-02');
  await dialog.getByLabel('Tháng kết thúc (nếu biết)', { exact: true }).fill('2026-01');
  await dialog.getByRole('button', { name: 'Lưu khoản vay', exact: true }).click();
  // min={startMonth} lets the browser block the submit before any write.
  expect(await dialog.getByLabel('Tháng kết thúc (nếu biết)', { exact: true }).evaluate(el => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  await expect(dialog).toBeVisible();
  expect(patches).toHaveLength(0);
  await dialog.getByLabel('Tháng kết thúc (nếu biết)', { exact: true }).fill('2027-12');
  await dialog.getByRole('button', { name: 'Lưu khoản vay', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(patches).toHaveLength(1);
  expect(saved.debts.entries[0]).toMatchObject({ startMonth: '2026-02', endMonth: '2027-12', contract: { status: 'UNKNOWN' }, balanceAsOf: { status: 'KNOWN', value: '2026-10-04' }, outstandingBalance: { status: 'KNOWN', value: '100000000' } });
  await page.reload();
  await page.getByRole('button', { name: 'Sửa Khoản vay kiểm thử', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Tháng kết thúc (nếu biết)', { exact: true })).toHaveValue('2027-12');
});
