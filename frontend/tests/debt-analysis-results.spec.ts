import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

test('money presets work with pointer and keyboard; typing never saves or recalculates', async ({ page }) => {
  const { calls } = await setup(page);
  const writes: string[] = [];
  page.on('request', req => { if (['PATCH', 'PUT', 'DELETE'].includes(req.method())) writes.push(req.url()); });
  await page.goto('/user/debts');
  const panel = page.getByRole('region', { name: 'Kết quả phân tích trả nợ' });
  await expect(panel).toContainText('9.000.000 VND');
  const initialCount = calls.length;
  const reserve = page.getByLabel('Ngân sách dự phòng giữ lại mỗi tháng (VND)', { exact: true });
  const extra = page.getByLabel('Ngân sách trả nợ thêm mỗi tháng (VND)', { exact: true });
  const cols = page.locator('.debt-scenario-col');
  const reservePreset = cols.nth(1).getByRole('button', { name: '2.000.000 đ', exact: true });
  await expect(reservePreset).toBeVisible();
  await reserve.fill('1234'); await reservePreset.click();
  await expect(reserve).toHaveValue('2.000.000');
  await extra.fill('555');
  const extraPreset = cols.nth(2).getByRole('button', { name: '3.000.000 đ', exact: true });
  await extraPreset.focus(); await extraPreset.press('Enter');
  await expect(extra).toHaveValue('3.000.000');
  await reserve.fill(''); await reserve.pressSequentially('1234567', { delay: 50 });
  // Longer than the old 350 ms debounce: no preview or profile write is allowed.
  await page.waitForTimeout(750);
  expect(calls).toHaveLength(initialCount); expect(writes).toEqual([]);
  await expect(panel).toContainText('9.000.000 VND');
  await expect(reservePreset).toBeVisible();
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  await expect.poll(() => calls.at(-1)?.reserveMonthly).toBe('1234567');
  await expect(panel).toContainText('7.765.433 VND');
  await page.setViewportSize({ width: 1920, height: 1000 });
  const boxes = await Promise.all([page.locator('.debt-horizon-pills'), reserve, extra, cols.nth(3).locator('select')].map(l => l.boundingBox()));
  expect(Math.max(...boxes.map(b => b!.y)) - Math.min(...boxes.map(b => b!.y))).toBeLessThan(2);
  await page.locator('.debt-scenario-card').screenshot({ path: '../artifacts/debt-inputs-fixed.png' });
});

test('loan dates are validated, saved and editable after reload without changing existing contract data', async ({ page }) => {
  const data = profile(); data.debts.entries[0].contract = { status: 'UNKNOWN' };
  await setup(page, data);
  let saved = data, revision = 3;
  const patches: any[] = [];
  await page.route('**/api/v1/me/financial-profile', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); patches.push(body);
      saved = profileV2Schema.parse({ ...saved, ...body.changes }); revision++;
    }
    return route.fulfill({ json: { data: { schemaVersion: 2, revision, data: saved } } });
  });
  await page.goto('/user/debts');
  await page.getByRole('button', { name: 'Sửa khoản vay', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Sửa khoản vay', exact: true });
  await expect(dialog.getByLabel('Ngày xác nhận dư nợ', { exact: true })).toHaveValue('04/10/2026');
  const calendar = dialog.getByRole('textbox', { name: 'Ngày xác nhận dư nợ', exact: true });
  expect(await calendar.evaluate(el => {
    const wrap = el.parentElement!.getBoundingClientRect();
    const picker = el.parentElement!.querySelector('.profile-date-picker')!.getBoundingClientRect();
    return picker.left >= wrap.left && picker.right <= wrap.right;
  })).toBe(true);
  await dialog.getByLabel('Tháng bắt đầu trả nợ', { exact: true }).fill('02/2026');
  await dialog.getByLabel('Tháng kết thúc trả nợ (nếu biết)', { exact: true }).fill('01/2026');
  await dialog.getByRole('button', { name: 'Lưu khoản vay' }).click();
  await expect(dialog).toContainText('Tháng kết thúc phải từ tháng bắt đầu trở đi');
  expect(patches).toHaveLength(0);
  await dialog.getByLabel('Tháng kết thúc trả nợ (nếu biết)', { exact: true }).fill('12/2027');
  await dialog.getByRole('button', { name: 'Lưu khoản vay' }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved.debts.entries[0]).toEqual({ ...data.debts.entries[0], startMonth: '2026-02', endMonth: '2027-12' });
  await page.reload();
  await page.getByRole('button', { name: 'Sửa khoản vay', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Sửa khoản vay', exact: true });
  await expect(dialog.getByLabel('Tháng kết thúc trả nợ (nếu biết)', { exact: true })).toHaveValue('12/2027');
  await dialog.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm khoản vay mới' }).click();
  dialog = page.getByRole('dialog', { name: 'Khai báo khoản vay mới' });
  await dialog.getByLabel('Tên khoản vay', { exact: true }).fill('Khoản vay mới có ngày');
  await dialog.getByLabel('Dư nợ gốc hiện tại (VND)', { exact: true }).fill('9007199254740993,01');
  await dialog.getByLabel('Số tiền trả mỗi tháng (VND)', { exact: true }).fill('1000000');
  await dialog.getByLabel('Ngày xác nhận dư nợ', { exact: true }).fill('31/02/2026');
  await dialog.getByRole('button', { name: 'Lưu khoản vay' }).click();
  expect(patches).toHaveLength(1);
  await dialog.getByLabel('Ngày xác nhận dư nợ', { exact: true }).fill('04/10/2026');
  await dialog.getByLabel('Tháng bắt đầu trả nợ', { exact: true }).fill('01/2026');
  await dialog.getByLabel('Tháng kết thúc trả nợ (nếu biết)', { exact: true }).fill('12/2028');
  await dialog.screenshot({ path: '../artifacts/debt-loan-dates.png' });
  await dialog.getByRole('button', { name: 'Lưu khoản vay' }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved.debts.entries[1]).toMatchObject({ balanceAsOf: { status: 'KNOWN', value: '2026-10-04' }, startMonth: '2026-01', endMonth: '2028-12', outstandingBalance: { value: '9007199254740993.01' }, contract: { status: 'UNKNOWN' }, responsibility: { status: 'UNKNOWN' } });
});

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
async function setup(page: Page, data = profile()) {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { error: { message: 'Unmocked test API' } } }));
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page, { profile: { schemaVersion: 2, revision: 3, data } });
  await page.route('**/api/v1/me/retirement/plans**', route => route.fulfill({ json: { data: { items: [] } } }));
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const calls: any[] = [];
  await page.route('**/api/v1/me/debts/preview', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    return route.fulfill({ json: { data: { ...previewDebts(data, body), profileRevision: 3, capital: { netWorth: '0', retirementLiquidAssets: '0' } } } });
  });
  return { calls, data };
}

test('real engine results show monthly cash, DTI and payoff date; budget changes recalculate', async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto('/user/debts');
  const panel = page.getByRole('region', { name: 'Kết quả phân tích trả nợ' });
  await expect(panel).toContainText('36,7%');
  await expect(panel).toContainText('9.000.000 VND');
  await expect(panel).toContainText('28/07/2027');
  await expect(panel).toContainText('5.500.000 VND');
  await expect(panel).not.toContainText(/TỐI ĐA|Tối ưu toán học|\+Chưa có|Vượt kỳ phân tích/);
  await page.getByLabel('Ngân sách dự phòng giữ lại mỗi tháng (VND)', { exact: true }).fill('2000000');
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  await expect(panel).toContainText('7.000.000 VND');
  await page.getByLabel('Ngân sách trả nợ thêm mỗi tháng (VND)', { exact: true }).fill('3000000');
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  await expect.poll(() => calls.at(-1)?.extraMonthlyBudget).toBe('3000000');
  await expect(panel.locator('.debt-comparison-savings strong').first()).not.toHaveText('0 VND');
  await panel.screenshot({ path: '../artifacts/debt-results-ready.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('missing contracts and missing cashflow never masquerade as successful projections', async ({ page }) => {
  const data = profile(); data.debts.entries[0].contract = { status: 'UNKNOWN' };
  await setup(page, data); await page.goto('/user/debts');
  const panel = page.getByRole('region', { name: 'Kết quả phân tích trả nợ' });
  await expect(panel).toContainText('Khoản vay kiểm thử:');
  await expect(panel).toContainText('Bổ sung lịch trả gốc, lãi và phí theo hợp đồng.');
  await expect(panel.locator('.debt-results-strategies')).toHaveCount(0);
  await expect(panel).not.toContainText(/Chưa trả hết|Vượt kỳ|\+Chưa có|tiết kiệm tối đa/i);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await panel.screenshot({ path: '../artifacts/debt-overview-empty-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: '../artifacts/debt-overview-empty-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  data.debts.entries[0].contract = profile().debts.entries[0].contract;
  data.income = { status: 'UNKNOWN' };
  await page.getByRole('button', { name: '2 năm', exact: true }).click();
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  await expect(panel).toContainText('Một phần kỳ phân tích còn thiếu thu nhập hoặc chi tiêu');
  await expect(panel).not.toContainText('Chưa ghi nhận trong kỳ');
  await expect(panel.locator('.debt-comparison-savings')).toContainText(['Chưa đủ thông tin', 'Chưa đủ thông tin']);
  await panel.screenshot({ path: '../artifacts/debt-results-incomplete.png' });
});

test('errors can be retried; edits during calculation retain results and are explicitly marked outdated', async ({ page }) => {
  const { data } = await setup(page);
  let fail = true;
  let release: (() => void) | undefined;
  await page.route('**/api/v1/me/debts/preview', async route => {
    if (fail) return route.fulfill({ status: 503, json: { error: { message: 'Lỗi tạm thời khi tính nợ.' } } });
    const body = route.request().postDataJSON();
    if (body.reserveMonthly === '1000000') await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill({ json: { data: { ...previewDebts(data, body), profileRevision: 3 } } });
  });
  await page.goto('/user/debts');
  await expect(page.getByText('Lỗi tạm thời khi tính nợ.', { exact: true })).toBeVisible();
  fail = false; await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Kết quả phân tích trả nợ' });
  await expect(panel).toContainText('9.000.000 VND');
  const reserve = page.getByLabel('Ngân sách dự phòng giữ lại mỗi tháng (VND)', { exact: true });
  await reserve.fill('1000000'); await page.getByRole('button', { name: 'Tính lại', exact: true }).click(); await expect.poll(() => Boolean(release)).toBe(true);
  await reserve.fill('3000000'); await expect(panel).toContainText('9.000.000 VND');
  release!(); await expect(panel).toContainText('8.000.000 VND');
  await expect(page.getByText('Kết quả bên dưới đang dùng thông số của lần tính trước.')).toBeVisible();
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  await expect(panel).toContainText('6.000.000 VND');
});

test('higher prepayment fees are shown as additional costs, not savings', async ({ page }) => {
  const data = profile();
  data.income.entries[0].amount.value = '300000000';
  data.debts.entries[0].contract.value.periods.forEach((period: any) => { period.prepayment.fixedFee = '10000000'; });
  await setup(page, data); await page.goto('/user/debts');
  await page.getByLabel('Ngân sách trả nợ thêm mỗi tháng (VND)', { exact: true }).fill('150000000');
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  const savings = page.locator('.debt-comparison-savings').first();
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
  await setup(page, data); await page.goto('/user/debts');
  await page.getByRole('button', { name: '2 năm', exact: true }).click();
  await page.getByRole('button', { name: 'Tính lại', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Kết quả phân tích trả nợ' });
  await expect(panel).toContainText('Chưa trả hết trong 24 tháng');
  await expect(panel).toContainText('160.000.000 VND');
  await expect(panel).toContainText('Chỉ tính trong 24 tháng');
  await expect(panel).not.toContainText('28/01/2030');
});
