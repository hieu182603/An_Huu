import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

const previewUrl = '**/me/retirement/actuals/reforecast/preview';
const saveUrl = '**/plans/future-plan/reforecasts';
const applyUrl = '**/plans/future-plan/apply';
const preview = (hash = 'a'.repeat(64)) => ({ status: 'READY', inputHash: hash, issues: [], saved: false, applied: false, beforeChanges: null,
  candidate: { calculation: { summary: { atRetirement: { projectedFund: '9007199254740993.01', coveragePercent: null } } } } });
const saved = { planId: 'future-plan', planRevision: 3, version: 2, versionId: 'future-v2' };
const run = (page: Page) => page.getByRole('button', { name: 'Xem trước kịch bản điều chỉnh', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Lưu thành phiên bản mới', exact: true });
const section = (page: Page) => page.getByRole('region', { name: 'Điều chỉnh dòng tiền tương lai', exact: true });

async function setup(page: Page, modelVersion = 'retirement-monthly-v3') {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const plan = { id: 'future-plan', revision: 2, currentVersionId: 'future-v1', current: { id: 'future-v1', version: 1, preview: { modelVersion, selection: { answers: [] }, calculation: { summary: { retirementMonth: '2027-01', endMonth: '2027-12' } } } } };
  await page.route('**/me/retirement/plans**', route => { const path = new URL(route.request().url()).pathname; return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: [plan] } : path.endsWith('/versions') ? { items: [] } : plan } }); });
  await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1)!; return route.fulfill({ json: { data: { id: period, period, revision: 2, updatedAt: '2026-10-09', history: [], data: { currency: 'VND', openingBalance: '100000', closingBalance: '100000', entries: [], correctionReason: 'Đã đối soát' } } } }); });
  await page.route(previewUrl, route => route.fulfill({ json: { data: preview() } }));
  await page.route(saveUrl, route => route.fulfill({ json: { data: saved } }));
  await page.goto('/user/simulation?tab=actuals');
  await page.getByLabel('Kỳ đối soát tháng (Việt Nam)', { exact: true }).fill('2026-08');
  await expect(page.getByRole('button', { name: 'Chạy dự báo neo số dư', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /^Dòng tiền tương lai/ }).click();
}
async function draft(page: Page, amount = '1000000.50', field = 'income', from = '2026-09', to = '2026-12') {
  await page.locator('#fc-field').selectOption(field); await page.locator('#fc-start').fill(from); await page.locator('#fc-end').fill(to);
  await page.locator('#fc-amount').fill(amount); await page.locator('#fc-reason').fill('Điều chỉnh theo ngân sách đã rà soát');
}
async function add(page: Page, amount = '1000000.50', field = 'income', from = '2026-09', to = '2026-12') {
  await draft(page, amount, field, from, to); await page.getByRole('button', { name: 'Thêm điều chỉnh', exact: true }).click();
}
async function ready(page: Page) { await add(page); await run(page).click(); await expect(save(page)).toBeVisible(); }

test('future: empty list and unfinished draft cannot preview; labels and exact decimals are preserved', async ({ page }) => {
  await setup(page); await expect(run(page)).toBeDisabled();
  await expect(page.getByLabel('Số tiền thay thế mỗi tháng (VND)', { exact: true })).toBeVisible();
  await draft(page, '9007199254740993.01'); await expect(run(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Thêm điều chỉnh', exact: true }).click();
  await expect(section(page).getByRole('table')).toContainText('9.007.199.254.740.993,01 ₫');
  const request = page.waitForRequest(previewUrl); await run(page).click(); const body = (await request).postDataJSON();
  expect(body.futureChanges[0].amount).toBe('9007199254740993.01'); expect(body.throughMonth).toBe('2026-08'); expect(body.expectedProfileRevision).toBeGreaterThan(0);
});

test('future: invalid amounts, missing reason and invalid periods do not add rows', async ({ page }) => {
  await setup(page);
  for (const amount of ['1e6', '-1', '1.234', '10000000000000000', '']) {
    await draft(page, amount); await page.getByRole('button', { name: 'Thêm điều chỉnh', exact: true }).click(); await expect(section(page).getByRole('alert')).toContainText('Nhập số tiền không âm');
  }
  await draft(page); await page.locator('#fc-reason').fill('  '); await page.getByRole('button', { name: 'Thêm điều chỉnh', exact: true }).click(); await expect(section(page).getByRole('alert')).toContainText('Nhập lý do');
  for (const [from, to] of [['2026-08', '2026-09'], ['2026-12', '2026-09'], ['2027-12', '2028-01']]) {
    await draft(page, '1', 'income', from, to); await page.getByRole('button', { name: 'Thêm điều chỉnh', exact: true }).click(); await expect(section(page).getByRole('alert')).toContainText('Chọn tháng sau kỳ đối soát');
  }
  await expect(section(page).getByRole('table')).toHaveCount(0);
});

test('future: overlapping same field is rejected; different fields and zero are accepted', async ({ page }) => {
  await setup(page); await add(page); await add(page, '0'); await expect(section(page).getByRole('alert')).toContainText('đã có điều chỉnh');
  await add(page, '0', 'livingExpense'); await expect(section(page).locator('tbody tr')).toHaveCount(2); await expect(section(page).getByRole('table')).toContainText('0 ₫');
});

test('future: edit keeps row ID, cancel keeps saved row and delete clears preview', async ({ page }) => {
  await setup(page); await ready(page);
  await page.getByRole('button', { name: /^Sửa Thu nhập/ }).click(); await expect(page.locator('#fc-amount')).toBeFocused(); await expect(save(page)).toHaveCount(0);
  await page.locator('#fc-amount').fill('200'); await page.getByRole('button', { name: 'Bỏ nhập dở', exact: true }).click(); await expect(section(page).getByRole('table')).toContainText('1.000.000,5 ₫');
  let body: any; await page.route(previewUrl, route => { body = route.request().postDataJSON(); return route.fulfill({ json: { data: preview() } }); });
  await run(page).click(); await expect(save(page)).toBeVisible(); const id = body.futureChanges[0].id;
  await page.getByRole('button', { name: /^Sửa Thu nhập/ }).click(); await page.locator('#fc-amount').fill('200.75'); await page.getByRole('button', { name: 'Cập nhật điều chỉnh', exact: true }).click();
  await run(page).click(); await expect(save(page)).toBeVisible(); expect(body.futureChanges[0].id).toBe(id); expect(body.futureChanges[0].amount).toBe('200.75');
  await page.getByRole('button', { name: /^Xóa Thu nhập/ }).click(); await expect(save(page)).toHaveCount(0); await expect(run(page)).toBeDisabled();
});

test('future: new draft invalidates a result; unknown comparison is not zero', async ({ page }) => {
  await setup(page); await ready(page); await expect(page.locator('.future-result').getByText('Chưa xác định', { exact: true })).toHaveCount(2);
  await page.locator('#fc-amount').fill('200'); await expect(page.locator('.future-result')).toHaveCount(0); await expect(run(page)).toBeDisabled();
});

test('future: late preview cannot return after editing and restoring input', async ({ page }) => {
  await setup(page); await add(page); let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let calls = 0;
  await page.route(previewUrl, async route => { calls++; await gate; return route.fulfill({ json: { data: preview() } }); });
  await run(page).click(); await expect.poll(() => calls).toBe(1); await page.locator('#fc-amount').fill('1'); await page.locator('#fc-amount').fill('');
  const response = page.waitForResponse(r => r.url().endsWith('/reforecast/preview')); release(); await response;
  await expect(save(page)).toHaveCount(0); await expect(run(page)).toBeEnabled();
});

test('future: retry clears previous result; server failure can recover', async ({ page }) => {
  await setup(page); await ready(page); let fail = true;
  await page.route(previewUrl, route => fail ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Preview unavailable' } } }) : route.fulfill({ json: { data: preview() } }));
  await run(page).click(); await expect(section(page).getByRole('alert')).toContainText('Preview unavailable'); await expect(save(page)).toHaveCount(0);
  fail = false; await run(page).click(); await expect(save(page)).toBeVisible(); await expect(section(page).getByRole('alert')).toHaveCount(0);
});

test('future: save retries exact preview body and key, then disables duplicate save', async ({ page }) => {
  await setup(page); await ready(page); const bodies: any[] = []; let fail = true;
  await page.route(saveUrl, route => { bodies.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] }); return fail ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Save unavailable' } } }) : route.fulfill({ json: { data: saved } }); });
  await save(page).click(); await expect(section(page).getByRole('alert')).toContainText('Save unavailable'); fail = false; await save(page).click();
  await expect(page.getByRole('button', { name: 'Đã lưu phiên bản', exact: true })).toBeDisabled(); expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(bodies[0].body.expectedRevision).toBe(2); expect(bodies[0].body.expectedInputHash).toBe('a'.repeat(64)); expect(bodies[0].key).toBeTruthy();
});

test('future: saving locks month, ledger, drafts, tabs and preview', async ({ page }) => {
  await setup(page); await ready(page); let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  await page.route(saveUrl, async route => { await gate; return route.fulfill({ json: { data: saved } }); });
  await save(page).click(); await expect(page.locator('#fc-amount')).toBeDisabled(); await expect(page.locator('#actual-period')).toBeDisabled(); await expect(page.getByRole('button', { name: /Lưu sổ tháng/ })).toBeDisabled(); await expect(run(page)).toBeDisabled(); await expect(page.getByRole('button', { name: /Thử nghiệm kịch bản/ })).toBeDisabled();
  release(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeEnabled();
});

test('future: applying requires confirmation; retry uses saved version and server revision', async ({ page }) => {
  await setup(page); await ready(page); await save(page).click(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible(); let saves = 0; const requests: any[] = [];
  await page.route(saveUrl, route => { saves++; return route.fulfill({ json: { data: saved } }); });
  await page.route(applyUrl, route => { requests.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] }); return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Apply unavailable' } } }); });
  await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); expect(requests).toHaveLength(0);
  for (let i = 0; i < 6; i++) { await page.keyboard.press(i < 3 ? 'Tab' : 'Shift+Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await dialog.getByRole('button', { name: 'Xác nhận áp dụng', exact: true }).click(); await expect(section(page).getByRole('alert')).toContainText('Apply unavailable'); }
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]); expect(requests[0].body.versionId).toBe('future-v2'); expect(requests[0].body.expectedRevision).toBe(3); expect(saves).toBe(0);
});

test('future: a newly saved scenario uses the latest known plan revision', async ({ page }) => {
  await setup(page); await ready(page); await save(page).click(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Sửa Thu nhập/ }).click(); await page.locator('#fc-amount').fill('300'); await page.getByRole('button', { name: 'Cập nhật điều chỉnh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toHaveCount(0); await run(page).click(); await expect(save(page)).toBeVisible();
  const request = page.waitForRequest(saveUrl); await save(page).click(); expect((await request).postDataJSON().expectedRevision).toBe(3);
});

test('future: save conflict invalidates preview and requires fresh calculation', async ({ page }) => {
  await setup(page); await ready(page);
  await page.route(saveUrl, route => route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: 'Plan changed elsewhere' } } }));
  await save(page).click(); await expect(save(page)).toHaveCount(0); await expect(page.getByRole('button', { name: /^Áp dụng bản/ })).toHaveCount(0);
  await expect(section(page).getByRole('alert').filter({ hasText: 'Dữ liệu đã thay đổi' })).toBeVisible();
  await expect(run(page)).toBeEnabled(); await run(page).click(); await expect(save(page)).toBeVisible();
});

test('future: changed reconciliation month cannot submit a now-past adjustment', async ({ page }) => {
  await setup(page); await ready(page); let calls = 0;
  await page.route(previewUrl, route => { calls++; return route.fulfill({ json: { data: preview() } }); });
  await page.locator('#actual-period').fill('2026-09'); await expect(save(page)).toHaveCount(0); await expect(run(page)).toBeEnabled(); await run(page).click();
  await expect(section(page).getByRole('alert')).toContainText('Chọn tháng sau kỳ đối soát'); expect(calls).toBe(0);
});

test('future: source-managed plan points to supported source adjustments', async ({ page }) => {
  await setup(page, 'retirement-monthly-v4'); await expect(run(page)).toBeDisabled(); await expect(page.locator('#fc-amount')).toBeDisabled();
  await page.getByRole('button', { name: 'Mở điều chỉnh từng nguồn', exact: true }).click();
  await expect(page.getByRole('button', { name: /Lệnh nguồn \(V4\)/ })).toHaveAttribute('aria-pressed', 'true');
});

test('future: pending apply prevents closing confirmation and success opens plan', async ({ page }) => {
  await setup(page); await ready(page); await save(page).click(); let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let calls = 0;
  await page.route(applyUrl, async route => { calls++; await gate; return route.fulfill({ json: { data: { planId: 'future-plan', revision: 4, currentVersionId: 'future-v2' } } }); });
  await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Xác nhận áp dụng', exact: true }).click();
  await expect.poll(() => calls).toBe(1); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Hủy', exact: true })).toBeDisabled();
  release(); await expect(page).toHaveURL(/\/user\/plan$/); expect(calls).toBe(1);
});

for (const status of ['BLOCKED', 'HORIZON_COMPLETE', 'INCOMPLETE']) {
  test(`future: ${status} never offers save or apply`, async ({ page }) => {
    await setup(page); await add(page);
    await page.route(previewUrl, route => route.fulfill({ json: { data: { ...preview(), status: status === 'INCOMPLETE' ? 'READY' : status, candidate: null, issues: [{ month: '2026-07', code: 'MISSING_MONTH' }] } } }));
    await run(page).click(); await expect(section(page).locator('.inline-alert')).toBeVisible(); await expect(save(page)).toHaveCount(0); await expect(page.getByRole('button', { name: /^Áp dụng bản/ })).toHaveCount(0);
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`future layout: ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await setup(page); await ready(page); await save(page).click();
    await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    const table = page.getByRole('region', { name: 'Danh sách điều chỉnh', exact: true }); await table.focus(); await expect(table).toBeFocused();
    if (viewport.width < 800) { await table.press('ArrowRight'); await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0); }
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `../artifacts/ui-audit-2026-10-09/future-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true); await page.screenshot({ path: `../artifacts/ui-audit-2026-10-09/future-confirm-${viewport.width}x${viewport.height}.png` }); expect(errors).toEqual([]);
  });
}
