import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';
const previewUrl = '**/source-reforecasts/preview';
const saveUrl = '**/source-reforecasts';
const registry = { startMonth: '2026-01', endMonth: '2028-12', registryHash: 'a'.repeat(64), revisions: [
  { sourceId: 'salary', revision: 2, kind: 'INCOME', operation: 'REVISE', effectiveFromMonth: '2026-01', effectiveToMonth: '2028-12', schedule: [{ month: '2026-01', metric: 'income', amount: '20000000' }] },
  { sourceId: 'living', revision: 1, kind: 'EXPENSE', operation: 'CREATE', effectiveFromMonth: '2026-01', effectiveToMonth: '2028-12', schedule: [{ month: '2026-01', metric: 'livingExpense', amount: '10000000' }] },
  ...['LOAN', 'ASSET', 'AGGREGATE'].map(kind => ({ sourceId: kind.toLowerCase(), revision: 1, kind, operation: 'CREATE', schedule: [] })),
  { sourceId: 'ended', revision: 2, kind: 'INCOME', operation: 'END', schedule: [] },
] };
const result = (hash = 'b'.repeat(64)) => ({ status: 'READY', inputHash: hash, issues: [], saved: false, applied: false, loanRevisionOptions: [], assetRevisionOptions: [], plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] },
  candidate: { replayInput: { sourceRegistry: registry }, calculation: { summary: { atRetirement: { projectedFund: '1234567890.01', coveragePercent: null } } } } });
const saved = { planId: 'flow-plan', revision: 3, saved: { id: 'flow-v2', version: 2 } };
const run = (page: Page) => page.getByRole('button', { name: 'Xem trước nguồn V4', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Lưu phiên bản V4', exact: true });
const table = (page: Page) => page.getByRole('region', { name: 'Danh sách lệnh thu chi', exact: true });
async function setup(page: Page, discovery = false) {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const plan = { id: 'flow-plan', revision: 2, currentVersionId: 'flow-v1', current: { id: 'flow-v1', snapshotHash: 'a'.repeat(64), version: 1, preview: { modelVersion: 'retirement-monthly-v4', selection: { answers: [] }, replayInput: discovery ? {} : { sourceRegistry: registry }, calculation: { summary: { retirementMonth: '2027-01', endMonth: '2028-12' } } } } };
  await page.route('**/me/retirement/plans**', route => { const path = new URL(route.request().url()).pathname; return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: [plan] } : path.endsWith('/versions') ? { items: [] } : plan } }); });
  await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1)!; return route.fulfill({ json: { data: { id: period, period, revision: 2, updatedAt: '2026-10-11', history: [], data: { currency: 'VND', openingBalance: '100000', closingBalance: '100000', entries: [], correctionReason: 'Đã đối soát' } } } }); });
  await page.route(previewUrl, route => route.fulfill({ json: { data: result() } })); await page.route(saveUrl, route => route.fulfill({ json: { data: saved } }));
  await page.goto('/user/simulation?tab=actuals'); await page.locator('#actual-period').fill('2026-08'); await expect(page.getByRole('button', { name: 'Chạy dự báo neo số dư', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /Lệnh nguồn \(V4\)/ }).click();
}
async function draft(page: Page, amount = '1000000.01', from = '2026-09', to = '2026-12') {
  await page.locator('#flow-from').fill(from); await page.locator('#flow-to').fill(to);
  if (await page.locator('#flow-amount').count()) await page.locator('#flow-amount').fill(amount);
  await page.locator('#flow-document').fill('Giả định thu nhập theo hợp đồng đang rà soát');
}
async function add(page: Page, amount = '1000000.01') { await draft(page, amount); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click(); }
async function capture(page: Page) { const request = page.waitForRequest(previewUrl); await run(page).click(); await expect(save(page)).toBeVisible(); return (await request).postDataJSON(); }

test('flow: source chooser excludes specialized, aggregate and ended sources', async ({ page }) => {
  await setup(page); await page.getByLabel('Thao tác', { exact: true }).selectOption('REVISE');
  await expect(page.locator('#flow-source option')).toHaveCount(2); await expect(page.locator('#flow-source')).toHaveValue('salary');
  await expect(page.locator('#flow-metric')).toHaveValue('income'); await expect(page.locator('#flow-metric')).toBeDisabled();
  await page.locator('#flow-source').selectOption('living'); await expect(page.locator('#flow-metric')).toHaveValue('livingExpense');
  await expect(page.locator('#flow-metric option[value="income"]')).toBeDisabled();
});
test('flow: revise uses saved source identity and revision, not candidate registry', async ({ page }) => {
  await setup(page); await page.locator('#flow-operation').selectOption('REVISE'); await add(page);
  await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), candidate: { ...result().candidate, replayInput: { sourceRegistry: { ...registry, revisions: [{ ...registry.revisions[0], revision: 3 }] } } } } } }));
  const first = await capture(page); expect(first.sourceCommands[0]).toMatchObject({ operation: 'REVISE', sourceId: 'salary', expectedSourceRevision: 2, amount: '1000000.01' });
  await table(page).getByRole('button', { name: 'Xóa', exact: true }).click(); await add(page, '3000000');
  const second = await capture(page); expect(second.sourceCommands[0].expectedSourceRevision).toBe(2);
});
test('flow: empty preview discovers sources for legacy plans', async ({ page }) => {
  await setup(page, true); await page.locator('#flow-operation').selectOption('REVISE'); await run(page).click();
  await expect(page.locator('#flow-source option')).toHaveCount(2); await draft(page); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click();
  const input = await capture(page); expect(input.sourceCommands[0].sourceId).toBe('salary');
});
test('flow: duplicate source commands are rejected', async ({ page }) => {
  await setup(page); await page.locator('#flow-operation').selectOption('REVISE'); await add(page); await add(page, '500');
  await expect(page.getByRole('alert').filter({ hasText: 'Kiểm tra lệnh nguồn' })).toContainText('đã có lệnh'); await expect(table(page).locator('tbody tr')).toHaveCount(1);
});
test('flow: exponent, negative, blank and over-limit amounts are rejected', async ({ page }) => {
  await setup(page);
  for (const amount of ['1e6', '-1', '', '1' + '0'.repeat(101)]) { await add(page, amount); await expect(page.getByRole('alert').filter({ hasText: 'Kiểm tra lệnh nguồn' })).toContainText('số tiền thập phân'); }
  await expect(table(page)).toHaveCount(0);
});
test('flow: decimal and hypothetical/confirmed basis survive the request exactly', async ({ page }) => {
  await setup(page); await add(page, '9007199254740993.001'); await expect(table(page)).toContainText('9.007.199.254.740.993,001 ₫');
  const first = await capture(page); expect(first.sourceCommands[0]).toMatchObject({ amount: '9007199254740993.001', confirmation: 'HYPOTHETICAL', expectedSourceRevision: 0 });
  await page.locator('#flow-confirmation').selectOption('USER_CONFIRMED'); await add(page, '0'); const next = await capture(page); expect(next.sourceCommands[1]).toMatchObject({ amount: '0', confirmation: 'USER_CONFIRMED' });
});
test('flow: months outside remaining horizon and multi-month once are rejected', async ({ page }) => {
  await setup(page);
  for (const [from, to] of [['2026-08', '2026-12'], ['2026-12', '2026-09'], ['2028-12', '2029-01']]) { await draft(page, '1', from, to); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Kiểm tra lệnh nguồn' })).toContainText('khoảng tháng'); }
  await page.locator('#flow-frequency').selectOption('ONCE'); await draft(page); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Kiểm tra lệnh nguồn' })).toContainText('một lần');
  await page.locator('#flow-to').fill('2026-09'); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click(); const input = await capture(page); expect(input.sourceCommands[0].frequency).toBe('ONCE');
});
test('flow: ending explains tail removal and sends no amount or metric', async ({ page }) => {
  await setup(page); await page.locator('#flow-operation').selectOption('END'); await draft(page); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click();
  await expect(page.locator('.source-flow-note')).toContainText('không tự chạy lại'); await expect(table(page)).toContainText('Không áp dụng'); const input = await capture(page);
  expect(input.sourceCommands[0]).toMatchObject({ operation: 'END', sourceId: 'salary', expectedSourceRevision: 2 }); for (const key of ['amount', 'metric', 'frequency', 'confirmation']) expect(input.sourceCommands[0]).not.toHaveProperty(key);
});
test('flow: unfinished draft invalidates preview and must be added or discarded', async ({ page }) => {
  await setup(page); await add(page); await capture(page); await page.locator('#flow-document').fill('Chưa thêm'); await expect(save(page)).toHaveCount(0); await expect(run(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Bỏ nhập dở lệnh nguồn', exact: true }).click(); await expect(run(page)).toBeEnabled(); await expect(save(page)).toHaveCount(0);
});
test('flow: same input restored cannot revive a delayed preview', async ({ page }) => {
  await setup(page); await add(page); let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let called = false;
  await page.route(previewUrl, async route => { called = true; await gate; return route.fulfill({ json: { data: result() } }); });
  await run(page).click(); await expect.poll(() => called).toBe(true); await page.locator('#flow-document').fill('Tạm sửa'); await page.locator('#flow-document').fill('');
  const response = page.waitForResponse(r => r.url().endsWith('/source-reforecasts/preview')); release(); await response; await expect(save(page)).toHaveCount(0);
});
test('flow: incomplete preview cannot be saved; blocked issue remains inline', async ({ page }) => {
  await setup(page); await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), candidate: null } } })); await run(page).click();
  await expect(page.getByText('Chưa đủ kết quả để lưu', { exact: true })).toBeVisible(); await expect(save(page)).toHaveCount(0);
  await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), status: 'BLOCKED', candidate: null, issues: [{ month: '2026-07', code: 'MISSING_MONTH', message: 'Thiếu sổ tháng' }] } } })); await run(page).click();
  await expect(page.locator('#main-content').getByRole('alert').filter({ hasText: 'Chưa đủ kết quả để lưu' })).toContainText('Thiếu sổ tháng');
});
test('flow: saved version cannot be saved twice; apply confirmation can cancel and retry', async ({ page }) => {
  await setup(page); await add(page); await capture(page); await save(page).click(); const apply = page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }); await expect(apply).toBeVisible(); await expect(save(page)).toBeDisabled();
  const calls: any[] = []; await page.route('**/plans/flow-plan/apply', route => { calls.push(route.request().postDataJSON()); return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Apply unavailable' } } }); });
  await apply.click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); expect(calls).toHaveLength(0);
  for (let i = 0; i < 6; i++) { await page.keyboard.press(i < 3 ? 'Tab' : 'Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  for (let i = 0; i < 2; i++) { await apply.click(); await dialog.getByRole('button', { name: 'Xác nhận áp dụng nguồn', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator('#main-content').getByRole('alert').filter({ hasText: 'Lỗi nguồn V4' })).toContainText('Apply unavailable'); }
  expect(calls).toHaveLength(2); expect(calls[0]).toEqual(calls[1]); expect(calls[0]).toMatchObject({ versionId: 'flow-v2', expectedRevision: 3 });
});
test('flow: pending apply locks the dialog, then opens the plan on success', async ({ page }) => {
  await setup(page); await add(page); await capture(page); await save(page).click();
  let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let calls = 0;
  await page.route('**/plans/flow-plan/apply', async route => { calls++; await gate; return route.fulfill({ json: { data: { planId: 'flow-plan', revision: 4, currentVersionId: 'flow-v2' } } }); });
  await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Xác nhận áp dụng nguồn', exact: true }).click();
  await expect.poll(() => calls).toBe(1); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeDisabled();
  release(); await expect(page).toHaveURL(/\/user\/plan$/); expect(calls).toBe(1);
});
test('flow: subsequent preview uses the last saved plan revision', async ({ page }) => {
  await setup(page); await add(page); await capture(page); await save(page).click(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible();
  await add(page, '200'); const input = await capture(page); expect(input.expectedRevision).toBe(3); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toHaveCount(0);
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`flow layout: ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await setup(page); await page.locator('#flow-operation').selectOption('REVISE'); await add(page);
    const form = page.locator('.source-flow-form'); await form.scrollIntoViewIfNeeded(); const bounds = await form.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    await table(page).focus(); await expect(table(page)).toBeFocused(); if (viewport.width < 800) { await table(page).press('ArrowRight'); await expect.poll(() => table(page).evaluate(el => el.scrollLeft)).toBeGreaterThan(0); }
    await form.screenshot({ path: `../artifacts/ui-audit-2026-10-11/source-flow-${viewport.width}x${viewport.height}.png` });
    await capture(page); await save(page).click(); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.screenshot({ path: `../artifacts/ui-audit-2026-10-11/source-confirm-${viewport.width}x${viewport.height}.png` }); expect(errors).toEqual([]);
  });
}
