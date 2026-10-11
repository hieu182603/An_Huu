import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const runtime = requireBackend('ts-node').register({ project: fileURLToPath(new URL('../../backend/tsconfig.json', import.meta.url)), transpileOnly: true });
const { pensionSourceSelectionSchema } = requireBackend('./src/modules/pensions/source-candidate.ts');
runtime.enabled(false);
const hash = 'a'.repeat(64), changedHash = 'c'.repeat(64);
const estimate = (id = '30000000-0000-4000-8000-000000000001', startMonth = '2026-03', monthlyPension = '9007199254740993.001') => ({ id, createdAt: '2026-10-10T15:00:00Z', integrityHash: 'b'.repeat(64), inputHash: hash, engineCode: 'vn-pension-benefit-v2', assessedOn: '2026-10-10', historyVersionId: '10000000-0000-4000-8000-000000000001', historyRevision: 4, legalRuleSetVersionId: '20000000-0000-4000-8000-000000000001', legalRuleVersion: 2, assessment: { assessmentStatus: 'ELIGIBLE', monthlyPension, startMonth, lumpSum: '50000000' } });
const source = (id = 'pension-existing', revision = 3) => ({ sourceId: id, revision, kind: 'PENSION', operation: 'REVISE', effectiveFromMonth: '2026-01', effectiveToMonth: '2028-12', schedule: [{ month: '2026-01', metric: 'pension', amount: '5000000' }] });
const registry = (revisions: any[] = [source()]) => ({ registryHash: hash, startMonth: '2026-01', endMonth: '2028-12', revisions });
const result = (reg = registry()) => ({ status: 'READY', inputHash: hash, issues: [], saved: false, applied: false, loanRevisionOptions: [], assetRevisionOptions: [], plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] }, candidate: { replayInput: { sourceRegistry: reg }, calculation: { summary: { atRetirement: { projectedFund: '1200000000', coveragePercent: '90' } } } } });
const previewUrl = '**/source-reforecasts/preview', saveUrl = '**/source-reforecasts';
const area = (page: Page) => page.getByRole('region', { name: 'Gắn nguồn lương hưu từ kết quả BHXH đã lưu', exact: true });
const run = (page: Page) => page.getByRole('button', { name: 'Xem trước nguồn V4', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Lưu phiên bản V4', exact: true });
const attachButton = (page: Page) => page.getByRole('button', { name: 'Gắn vào bản nháp', exact: true });
async function setup(page: Page, options: { items?: any[]; reg?: any; deferList?: Promise<void>; failList?: boolean } = {}) {
  await installRouteAuth(page); await installFinancialProfileRoutes(page);
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const reg = options.reg === undefined ? registry() : options.reg;
  const plan = { id: 'pension-plan', revision: 2, currentVersionId: 'pension-v1', current: { id: 'pension-v1', snapshotHash: hash, version: 1, preview: { modelVersion: 'retirement-monthly-v4', selection: { answers: [] }, replayInput: reg ? { sourceRegistry: reg } : {}, calculation: { summary: { retirementMonth: '2027-01', endMonth: '2028-12' } } } } };
  await page.route('**/me/retirement/plans**', route => { const path = new URL(route.request().url()).pathname; return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: [plan] } : path.endsWith('/versions') ? { items: [] } : plan } }); });
  await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1)!; return route.fulfill({ json: { data: { id: period, period, revision: 2, history: [], data: { currency: 'VND', openingBalance: '100000', closingBalance: '100000', entries: [], correctionReason: 'Đã đối soát' } } } }); });
  await page.route('**/me/pension/estimates', async route => { if (options.deferList) await options.deferList; return options.failList ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } } }) : route.fulfill({ json: { data: { items: options.items ?? [estimate(), estimate('30000000-0000-4000-8000-000000000002', '2027-02', '12000000')] } } }); });
  await page.route(previewUrl, route => route.fulfill({ json: { data: result() } }));
  await page.route(saveUrl, route => route.fulfill({ json: { data: { planId: 'pension-plan', revision: 3, saved: { id: 'pension-v2', version: 2 } } } }));
  await page.goto('/user/simulation?tab=actuals'); await page.locator('#actual-period').fill('2026-08');
  await expect(page.getByRole('button', { name: 'Chạy dự báo neo số dư', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /Lệnh nguồn \(V4\)/ }).click();
}
async function choose(page: Page, id = estimate().id) { await page.getByLabel('Kết quả ước tính hợp lệ đã lưu', { exact: true }).selectOption(id); }
async function attach(page: Page, id = estimate().id) { await choose(page, id); await page.getByRole('checkbox', { name: /Tôi xác nhận bản ước tính/ }).check(); await attachButton(page).click(); await expect(area(page).locator('.pension-attached')).toBeVisible(); }
async function capture(page: Page) { const req = page.waitForRequest(previewUrl); await run(page).click(); await expect(save(page)).toBeVisible(); return (await req).postDataJSON(); }
async function addFlow(page: Page, operation: string, metric = 'pension') { await page.locator('#flow-operation').selectOption(operation); if (operation === 'CREATE') await page.locator('#flow-metric').selectOption(metric); if (operation !== 'END') await page.locator('#flow-amount').fill('1000000'); await page.locator('#flow-from').fill('2026-09'); await page.locator('#flow-to').fill('2026-12'); await page.locator('#flow-document').fill('Căn cứ thử nghiệm'); await page.getByRole('button', { name: 'Thêm lệnh', exact: true }).click(); }

test('pension: loading is separate from empty; errors can retry without automatic selection', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await setup(page, { deferList: gate, failList: true }); await expect(area(page).getByText('Đang tải kết quả đã lưu…')).toBeVisible(); await expect(page.locator('#pension-estimate')).toBeDisabled(); release();
  await expect(area(page).getByRole('alert')).toContainText('Không tải được');
  await page.route('**/me/pension/estimates', route => route.fulfill({ json: { data: { items: [estimate()] } } }));
  await area(page).getByRole('button', { name: 'Tải lại kết quả BHXH', exact: true }).click(); await expect(page.locator('#pension-estimate option')).toHaveCount(2); await expect(page.locator('#pension-estimate')).toHaveValue(''); await expect(attachButton(page)).toBeDisabled();
});
test('pension: empty and invalid records cannot masquerade as eligible pension', async ({ page }) => {
  const items = [estimate('zero', '2026-01', '0'), estimate('zero-decimal', '2026-01', '0.00'), estimate('negative', '2026-01', '-1'), estimate('no-month', '', '100'), estimate('invalid-month', '2026-13', '100'), { ...estimate(), integrityHash: '' }, { ...estimate(), assessment: { ...estimate().assessment, assessmentStatus: 'INCOMPLETE' } }];
  await setup(page, { items }); await expect(area(page)).toContainText('Chưa có bản lưu đủ điều kiện'); await expect(page.locator('#pension-estimate option')).toHaveCount(1); await expect(attachButton(page)).toBeDisabled();
});
test('pension: explicit confirmation, exact money, original hashes and saved source revision', async ({ page }) => {
  await setup(page); await choose(page); await expect(attachButton(page)).toBeDisabled(); await expect(area(page)).toContainText('9.007.199.254.740.993,001 ₫/tháng'); await expect(area(page)).toContainText('2026-09 → 2028-12'); await expect(area(page)).toContainText('Phiên bản lịch đóng: 4'); await expect(area(page)).toContainText('Phiên bản bộ luật: 2');
  await page.getByRole('checkbox', { name: /Tôi xác nhận bản ước tính/ }).check(); await attachButton(page).click(); const input = await capture(page); const selection = input.pensionSelections[0]; pensionSourceSelectionSchema.parse(selection);
  expect(selection).toMatchObject({ estimateId: estimate().id, expectedEstimateIntegrityHash: estimate().integrityHash, expectedRegistryHash: hash, sourceId: 'pension-existing', expectedSourceRevision: 3, operation: 'REVISE', effectiveFromMonth: '2026-09', effectiveToMonth: '2028-12', amountPolicy: 'FIXED_NOMINAL', confirm: true });
  expect(selection).not.toHaveProperty('amount'); expect(selection).not.toHaveProperty('lumpSum'); await expect(page.locator('#pension-estimate')).toBeDisabled();
});
test('pension: create when none exists and respect future benefit start', async ({ page }) => {
  await setup(page, { reg: registry([]) }); await attach(page, '30000000-0000-4000-8000-000000000002'); const selection = (await capture(page)).pensionSelections[0]; pensionSourceSelectionSchema.parse(selection); expect(selection).toMatchObject({ operation: 'CREATE', expectedSourceRevision: 0, effectiveFromMonth: '2027-02' }); expect(selection.sourceId).toMatch(/^plan:/);
});
test('pension: missing registry requires empty discovery; candidate changes cannot replace original hash', async ({ page }) => {
  await setup(page, { reg: null }); await expect(page.locator('#pension-estimate')).toBeDisabled(); await run(page).click(); await expect(page.locator('#pension-estimate')).toBeEnabled(); await attach(page);
  await page.route(previewUrl, route => route.fulfill({ json: { data: result({ ...registry([source('pension-existing', 4)]), registryHash: changedHash }) } }));
  expect((await capture(page)).pensionSelections[0].expectedRegistryHash).toBe(hash);
  await page.getByRole('button', { name: 'Bỏ gắn lương hưu', exact: true }).click(); await attach(page); const selection = (await capture(page)).pensionSelections[0]; expect(selection.expectedRegistryHash).toBe(hash); expect(selection.expectedSourceRevision).toBe(3);
});
test('pension: multiple sources require choosing replacement identity', async ({ page }) => {
  await setup(page, { reg: registry([source('pension-one', 2), source('pension-two', 5)]) }); await choose(page); await page.getByRole('checkbox', { name: /Tôi xác nhận bản ước tính/ }).check(); await expect(attachButton(page)).toBeDisabled(); await page.getByLabel('Nguồn lương hưu cần thay thế', { exact: true }).selectOption('pension-two'); await expect(page.getByRole('checkbox', { name: /Tôi xác nhận bản ước tính/ })).not.toBeChecked(); await page.getByRole('checkbox', { name: /Tôi xác nhận bản ước tính/ }).check(); await attachButton(page).click(); expect((await capture(page)).pensionSelections[0]).toMatchObject({ sourceId: 'pension-two', expectedSourceRevision: 5 });
});
test('pension: expired horizon is blocked; changing cutoff invalidates attached period', async ({ page }) => {
  await setup(page, { items: [estimate(undefined, '2029-01')] }); await choose(page); await expect(area(page).getByRole('alert')).toContainText('Không còn tháng'); await expect(attachButton(page)).toBeDisabled();
  await page.route('**/me/pension/estimates', route => route.fulfill({ json: { data: { items: [estimate()] } } })); await area(page).getByRole('button', { name: 'Tải lại kết quả BHXH' }).click(); await attach(page); await capture(page);
  await page.locator('#actual-period').fill('2026-10'); await expect(save(page)).toHaveCount(0); let calls = 0; await page.route(previewUrl, route => { calls++; return route.fulfill({ json: { data: result() } }); }); await run(page).click(); await expect(page.locator('#main-content').getByRole('alert').filter({ hasText: 'Lỗi nguồn V4' })).toContainText('tháng hiệu lực'); expect(calls).toBe(0);
});
for (const operation of ['CREATE', 'REVISE', 'END']) test('pension: conflicting flow command before attachment ' + operation, async ({ page }) => {
  await setup(page); await addFlow(page, operation); await choose(page); await page.getByRole('checkbox', { name: /Tôi xác nhận bản ước tính/ }).check(); await attachButton(page).click(); await expect(area(page).getByRole('alert')).toContainText('Đã có lệnh'); await expect(area(page).locator('.pension-attached')).toHaveCount(0);
});
test('pension: attaching first blocks duplicate pension flows and changing a draft invalidates preview', async ({ page }) => {
  await setup(page); await capture(page); await choose(page); await expect(save(page)).toHaveCount(0); await expect(run(page)).toBeDisabled(); await page.getByRole('button', { name: 'Bỏ lựa chọn BHXH', exact: true }).click(); await expect(run(page)).toBeEnabled(); await attach(page); await addFlow(page, 'CREATE'); await expect(page.getByRole('alert').filter({ hasText: 'Kiểm tra lệnh nguồn' })).toContainText('Đã gắn kết quả BHXH');
});
test('pension: changed selection rejects late preview even when selection is discarded', async ({ page }) => {
  await setup(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let requested = false;
  await page.route(previewUrl, async route => { requested = true; await gate; return route.fulfill({ json: { data: result() } }); }); await run(page).click(); await expect.poll(() => requested).toBe(true); await choose(page); await page.getByRole('button', { name: 'Bỏ lựa chọn BHXH', exact: true }).click(); const response = page.waitForResponse(previewUrl); release(); await response; await expect(save(page)).toHaveCount(0);
});
test('pension: save locks remove/reload, retries exact selection, then apply needs confirmation', async ({ page }) => {
  await setup(page); await attach(page); const preview = await capture(page); const writes: any[] = []; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(saveUrl, async route => { writes.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] }); if (writes.length === 1) { await gate; return route.abort('failed'); } return route.fulfill({ json: { data: { planId: 'pension-plan', revision: 3, saved: { id: 'pension-v2', version: 2 } } } }); });
  await save(page).click(); await expect.poll(() => writes.length).toBe(1); await expect(page.getByRole('button', { name: 'Bỏ gắn lương hưu', exact: true })).toBeDisabled(); await expect(page.locator('#actual-period')).toBeDisabled(); release(); await expect(save(page)).toBeEnabled(); await save(page).click(); const apply = page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }); await expect(apply).toBeVisible(); expect(writes[1]).toEqual(writes[0]); expect(writes[1].body.preview).toEqual(preview);
  const applies: any[] = []; await page.route('**/plans/pension-plan/apply', route => { applies.push(route.request().postDataJSON()); return route.fulfill({ json: { data: { planId: 'pension-plan', revision: 4, currentVersionId: 'pension-v2' } } }); });
  await apply.click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); expect(applies).toHaveLength(0); await dialog.getByRole('button', { name: 'Hủy', exact: true }).click(); await apply.click(); await dialog.getByRole('button', { name: 'Xác nhận áp dụng nguồn', exact: true }).click(); await expect(page).toHaveURL(/\/user\/plan$/); expect(applies).toEqual([{ versionId: 'pension-v2', expectedRevision: 3, expectedProfileRevision: 1, confirm: true }]);
});
test('pension: stale estimate conflict hides saved actions and removal preserves server-owned estimate', async ({ page }) => {
  await setup(page); await attach(page); await capture(page); await page.route(saveUrl, route => route.fulfill({ status: 409, json: { error: { code: 'PENSION_ESTIMATE_STALE', message: 'Lịch đóng hoặc bộ luật đã thay đổi. Tính và lưu lại kết quả BHXH.' } } })); await save(page).click(); await expect(page.locator('#main-content')).toContainText('Tính và lưu lại kết quả BHXH.'); await expect(save(page)).toHaveCount(0); await expect(area(page).locator('.pension-attached')).toBeVisible();
  const mutations: string[] = []; page.on('request', req => { if (req.method() !== 'GET') mutations.push(req.url()); }); await page.getByRole('button', { name: 'Bỏ gắn lương hưu', exact: true }).click(); await expect(area(page).locator('.pension-attached')).toHaveCount(0); await expect(page.locator('#pension-estimate option')).toHaveCount(3); expect(mutations).toEqual([]);
});
test('pension: account change clears attachment and rejects late list response', async ({ page }) => {
  await setup(page); await attach(page); await capture(page);
  let owner = 'account-a', held = false;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/**', route => route.fulfill({ json: { data: { accessToken: 'test-' + owner, user: { id: owner, fullName: 'Người dùng ' + owner, email: owner + '@example.test', role: 'USER', status: 'ACTIVE', revision: 1 } } } }));
  await page.route('**/me/pension/estimates', async route => { const requestedOwner = owner; if (requestedOwner === 'account-a') { held = true; await gate; } return route.fulfill({ json: { data: { items: requestedOwner === 'account-a' ? [estimate()] : [] } } }); });
  const switchAccount = () => page.evaluate(() => { const channel = new BroadcastChannel('anhuu-auth'); channel.postMessage({ type: 'session-changed', tabId: 'pension-test-other-tab' }); channel.close(); });
  await switchAccount(); await expect.poll(() => held).toBe(true); owner = 'account-b'; await switchAccount();
  await expect(page.getByRole('button', { name: /Tài khoản: Người dùng account-b/ })).toBeVisible();
  await page.getByRole('button', { name: /Lệnh nguồn \(V4\)/ }).click();
  await expect(area(page)).toContainText('Chưa có bản lưu đủ điều kiện');
  const oldResponse = page.waitForResponse('**/me/pension/estimates'); release(); await oldResponse;
  await expect(area(page).locator('.pension-attached')).toHaveCount(0); await expect(page.locator('#pension-estimate option')).toHaveCount(1); await expect(save(page)).toHaveCount(0);
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) test(`pension layout: ${viewport.width}x${viewport.height}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize(viewport); await setup(page); await attach(page); const box = await area(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(await area(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await area(page).screenshot({ path: `../artifacts/ui-audit-2026-10-11/pension-${viewport.width}x${viewport.height}.png` }); await capture(page); await save(page).click(); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); for (let i = 0; i < 5; i++) { await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); } await page.screenshot({ path: `../artifacts/ui-audit-2026-10-11/pension-confirm-${viewport.width}x${viewport.height}.png` }); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(errors).toEqual([]);
});
