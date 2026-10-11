import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, fillEvidence } from './helpers';

const hash = 'a'.repeat(64);
const document = { schemaVersion: 1, birth: { precision: 'MONTH', declaredValue: '1970-01' }, legalSex: 'MALE', coverageFrom: '2020-01', coverageThrough: '2020-01', confirmedThroughMonth: '2020-01', months: [{ month: '2020-01', scheme: 'COMPULSORY', salaryRegime: 'EMPLOYER', status: 'PAID', contributionBase: '8000000', evidence: [] }], specialPeriods: [] };
const history = { id: 'history-test', revision: 2, documentHash: hash, document };
const assessment = { assessmentStatus: 'INSUFFICIENT_DATA', estimateKind: 'CURRENT_RULE_ESTIMATE', monthlyPension: null, countedMonths: null, lumpSum: null, startMonth: null, missingFields: [], breakdown: [], citations: [] };
const record = { id: 'estimate-test', createdAt: '2026-10-08', assessedOn: '2026-10-08', integrityHash: hash, inputHash: hash, engineCode: 'TEST_ONLY', historyRevision: 2, assessment };

async function setup(page: Page, options: { rulesError?: boolean; recordsError?: boolean; historyError?: boolean } = {}) {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, socket => socket.close());
  let rulesError = !!options.rulesError, recordsError = !!options.recordsError, historyError = !!options.historyError;
  const writes: any[] = [];
  await page.route('**/me/pension/history', route => {
    if (historyError) return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'History unavailable' } } });
    if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { data: { ...history, revision: 3 } } }); }
    return route.fulfill({ json: { data: history } });
  });
  await page.route('**/me/pension/legal-rules**', route => rulesError
    ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Rules unavailable' } } })
    : route.fulfill({ json: { data: { items: [{ id: 'rule-test', code: 'TEST_ONLY', version: 1 }] } } }));
  await page.route('**/me/pension/estimates', route => {
    if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { data: record } }); }
    return recordsError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Records unavailable' } } }) : route.fulfill({ json: { data: { items: [record] } } });
  });
  await page.route('**/me/pension/estimates/preview', route => route.fulfill({ json: { data: { inputHash: hash, assessment, engineCode: 'TEST_ONLY' } } }));
  await page.route('**/me/pension/history/import-preview', route => route.fulfill({ json: { data: { status: 'READY', inputHash: hash, issues: [] } } }));
  await page.goto('/user/plan'); await page.getByRole('button', { name: 'Thẩm định & Ước tính BHXH', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ngày dự kiến hưởng lương hưu *', { exact: true }).fill('2030-01-01');
  return { dialog, writes, recover: () => { rulesError = recordsError = historyError = false; } };
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 400 }]) {
  test(`insurance result layout: form and result ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const { dialog } = await setup(page);
    await fillEvidence(page, 'Căn cứ thời điểm hưởng', 'TEST-HYPOTHETICAL');
    await dialog.getByRole('button', { name: 'Tính toán ước tính lương hưu', exact: true }).click();
    const result = dialog.locator('.insurance-estimate-result');
    await expect(result).toBeVisible();
    await expect(result).toBeFocused();
    const resultTop = (await result.boundingBox())!.y;
    const tabsBox = (await dialog.locator('.insurance-tabs').boundingBox())!;
    expect(resultTop).toBeGreaterThanOrEqual(tabsBox.y + tabsBox.height);
    const formBox = (await dialog.locator('.insurance-estimate-config').boundingBox())!;
    const resultBox = (await result.boundingBox())!;
    if (viewport.width >= 1024) {
      expect(resultBox.x).toBeGreaterThan(formBox.x + formBox.width);
      expect(Math.abs(resultBox.y - formBox.y)).toBeLessThan(2);
    } else expect(resultBox.y).toBeGreaterThan(formBox.y + formBox.height);
    const save = dialog.getByRole('button', { name: 'Lưu kết quả này', exact: true });
    await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Đóng modal', exact: true })).toBeInViewport();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('insurance-result.png') });
  });
}

test('insurance: rules load failure is not reported as absent legislation', async ({ page }) => {
  const { dialog } = await setup(page, { rulesError: true });
  await expect(dialog.getByText('Chưa tải được bộ quy tắc', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(dialog.getByText('Chưa có bộ quy tắc công bố', { exact: true })).toHaveCount(0);
});

test('insurance: unknown saved amounts are not displayed as zero', async ({ page }) => {
  const { dialog } = await setup(page); await dialog.getByRole('button', { name: /Bản lưu ước tính/ }).click();
  await expect(dialog.getByText('Chưa xác định', { exact: true }).first()).toBeVisible({ timeout: 2500 });
  await expect(dialog).not.toContainText('0 ₫');
});

test('insurance: late history preview cannot enable saving after draft changes', async ({ page }) => {
  const { dialog } = await setup(page); await dialog.getByRole('button', { name: /Quá trình đóng BHXH/ }).click();
  let release!: () => void, started = false, finished = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/me/pension/history/import-preview', async route => { started = true; await gate; await route.fulfill({ json: { data: { status: 'READY', inputHash: hash, issues: [] } } }); finished = true; });
  await dialog.getByRole('button', { name: /1\. Kiểm tra/ }).click(); await expect.poll(() => started).toBe(true);
  await dialog.getByLabel('Giới tính pháp lý *', { exact: true }).selectOption('FEMALE');
  release(); await expect.poll(() => finished).toBe(true);
  await expect(dialog.getByRole('button', { name: /2\. Lưu sổ/ })).toBeDisabled({ timeout: 2500 });
});

test('insurance: rule retry recovers and history error is visible before calculation', async ({ page }) => {
  const f = await setup(page, { rulesError: true, historyError: true });
  await expect(f.dialog.getByText('Lỗi tải lịch sử BHXH', { exact: true })).toBeVisible();
  const calculate = f.dialog.getByRole('button', { name: 'Tính toán ước tính lương hưu', exact: true });
  await expect(calculate).toBeDisabled(); f.recover();
  await f.dialog.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await f.dialog.getByRole('button', { name: 'Tải lại bộ quy tắc', exact: true }).click();
  await expect(calculate).toBeEnabled();
});

test('insurance: records failure has retry rather than an empty history', async ({ page }) => {
  const f = await setup(page, { recordsError: true }); await f.dialog.getByRole('button', { name: /Bản lưu ước tính/ }).click();
  await expect(f.dialog.getByText('Chưa tải được bản lưu', { exact: true })).toBeVisible();
  await expect(f.dialog.getByText('Chưa có bản ghi ước tính nào được lưu.', { exact: true })).toHaveCount(0);
  f.recover(); await f.dialog.getByRole('button', { name: 'Tải lại bản lưu', exact: true }).click();
  const summary = f.dialog.locator('.insurance-saved-record summary'); await expect(summary).toBeVisible();
  await f.dialog.getByRole('button', { name: /Bản lưu ước tính/ }).focus(); await page.keyboard.press('Tab'); await expect(summary).toBeFocused();
  await page.keyboard.press('Enter'); await expect(f.dialog.locator('.insurance-saved-record')).toHaveAttribute('open', '');
  await expect(f.dialog.getByText('Ngày thẩm định:', { exact: true })).toBeVisible();
  await page.keyboard.press('Space'); await expect(f.dialog.locator('.insurance-saved-record')).not.toHaveAttribute('open', '');
});

test('insurance: history load failure disables editing and preview', async ({ page }) => {
  const f = await setup(page, { historyError: true }); await f.dialog.getByRole('button', { name: /Quá trình đóng BHXH/ }).click();
  await expect(f.dialog.getByLabel('Giới tính pháp lý *', { exact: true })).toBeDisabled();
  await expect(f.dialog.getByRole('button', { name: /1\. Kiểm tra/ })).toBeDisabled();
  await expect(f.dialog.getByRole('button', { name: 'Thêm tháng này', exact: true })).toBeDisabled();
  expect(f.writes).toEqual([]);
});

test('insurance: incomplete history requires confirmation and saves the exact checked draft', async ({ page }) => {
  const f = await setup(page); await f.dialog.getByRole('button', { name: /Quá trình đóng BHXH/ }).click();
  let checked: any;
  await page.route('**/me/pension/history/import-preview', route => { checked = route.request().postDataJSON(); return route.fulfill({ json: { data: { status: 'INCOMPLETE', inputHash: hash, issues: [{ code: 'MISSING_TEST', path: 'birth' }] } } }); });
  await f.dialog.getByLabel('Giới tính pháp lý *', { exact: true }).selectOption('FEMALE');
  await f.dialog.getByRole('button', { name: /1\. Kiểm tra/ }).click();
  const save = f.dialog.getByRole('button', { name: /2\. Lưu sổ/ }); await expect(save).toBeDisabled();
  await f.dialog.getByRole('checkbox', { name: /Tôi xác nhận muốn lưu hồ sơ/ }).check();
  await expect(save).toBeEnabled(); await save.click(); await expect(save).toBeDisabled();
  await expect.poll(() => f.writes.length).toBe(1); expect(f.writes[0]).toMatchObject({ preview: checked, expectedInputHash: hash, confirm: true });
});

test('insurance: closing during preview discards its late response on reopen', async ({ page }) => {
  const f = await setup(page); await f.dialog.getByRole('button', { name: /Quá trình đóng BHXH/ }).click();
  let release!: () => void, started = false, finished = false; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/me/pension/history/import-preview', async route => { started = true; await gate; await route.fulfill({ json: { data: { status: 'READY', inputHash: hash, issues: [] } } }); finished = true; });
  await f.dialog.getByRole('button', { name: /1\. Kiểm tra/ }).click(); await expect.poll(() => started).toBe(true);
  await page.keyboard.press('Escape'); await expect(f.dialog).toHaveCount(0); release(); await expect.poll(() => finished).toBe(true);
  await page.getByRole('button', { name: 'Thẩm định & Ước tính BHXH', exact: true }).click();
  await expect(f.dialog.getByRole('button', { name: /2\. Lưu sổ/ })).toBeDisabled(); expect(f.writes).toEqual([]);
});

test('insurance: saving estimate locks edits and close, then prevents duplicate save', async ({ page }) => {
  const f = await setup(page); const calculate = f.dialog.getByRole('button', { name: 'Tính toán ước tính lương hưu', exact: true });
  await fillEvidence(page, 'Căn cứ thời điểm hưởng', 'TEST-HYPOTHETICAL');
  await expect(calculate).toBeEnabled(); await calculate.click();
  const save = f.dialog.getByRole('button', { name: 'Lưu kết quả này', exact: true }); await expect(save).toBeEnabled();
  let release!: () => void, started = false; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/me/pension/estimates', async route => { if (route.request().method() !== 'POST') return route.fallback(); started = true; f.writes.push(route.request().postDataJSON()); await gate; return route.fulfill({ json: { data: record } }); });
  await save.click(); await expect.poll(() => started).toBe(true);
  await expect(f.dialog.getByLabel('Ngày dự kiến hưởng lương hưu *', { exact: true })).toBeDisabled();
  await expect(f.dialog.getByRole('button', { name: /Quá trình đóng BHXH/ })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(f.dialog).toBeVisible();
  await f.dialog.getByRole('button', { name: 'Đóng modal', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(f.dialog.getByRole('button', { name: 'Đóng modal', exact: true })).toBeFocused();
  release(); await expect(f.dialog.getByText('Đã lưu kết quả này vào Bản lưu ước tính.', { exact: true })).toBeVisible();
  await expect(save).toBeDisabled(); expect(f.writes).toHaveLength(1);
  await f.dialog.getByLabel('Ngày dự kiến hưởng lương hưu *', { exact: true }).fill('2031-01-01');
  await expect(save).toHaveCount(0);
});

test('insurance: failed save preserves input and retries with the same idempotency key', async ({ page }) => {
  const f = await setup(page); await fillEvidence(page, 'Căn cứ thời điểm hưởng', 'TEST-HYPOTHETICAL'); await f.dialog.getByRole('button', { name: 'Tính toán ước tính lương hưu', exact: true }).click();
  const keys: string[] = []; let fail = true;
  await page.route('**/me/pension/estimates', route => { if (route.request().method() !== 'POST') return route.fallback(); keys.push(route.request().headers()['idempotency-key']); return fail ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Save unavailable' } } }) : route.fulfill({ json: { data: record } }); });
  const save = f.dialog.getByRole('button', { name: 'Lưu kết quả này', exact: true }); await save.click();
  await expect(f.dialog.getByText('Save unavailable', { exact: true })).toBeVisible(); await expect(save).toBeEnabled();
  fail = false; await save.click(); await expect(f.dialog.getByText('Đã lưu kết quả này vào Bản lưu ước tính.', { exact: true })).toBeVisible(); await expect(save).toBeDisabled(); expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[0]).toBe(keys[1]);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`insurance layout: three tabs and close ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); const f = await setup(page);
    const box = (await f.dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.width).toBeLessThanOrEqual(viewport.width); expect(box.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width >= 1024) expect(box.width).toBeGreaterThan(1000);
    for (const tab of ['Ước tính lương hưu', 'Quá trình đóng BHXH', 'Bản lưu ước tính']) {
      const button = f.dialog.getByRole('button', { name: new RegExp(tab) }).first(); await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(await f.dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      const slug = tab === 'Ước tính lương hưu' ? 'estimate' : tab === 'Quá trình đóng BHXH' ? 'history' : 'records';
      if (slug === 'history') { const save = f.dialog.getByRole('button', { name: /2\. Lưu sổ/ }); await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport(); }
      await expect(f.dialog.getByRole('button', { name: 'Đóng modal', exact: true })).toBeInViewport();
      await expect(button).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`insurance-${slug}.png`) });
    }
    for (let i = 0; i < 8; i++) { await page.keyboard.press(i < 4 ? 'Tab' : 'Shift+Tab'); expect(await f.dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press('Escape'); await expect(f.dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thẩm định & Ước tính BHXH', exact: true })).toBeFocused(); expect(errors).toEqual([]);
  });
}
