import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, fillEvidence } from './helpers';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const runtime = requireBackend('ts-node').register({ project: fileURLToPath(new URL('../../backend/tsconfig.json', import.meta.url)), transpileOnly: true });
const { loanSourceRevisionSchema } = requireBackend('./src/modules/debts/source-candidate.ts');
const { reconcileLoanRevision } = requireBackend('./src/modules/debts/reconciliation.ts');
runtime.enabled(false);
const hash = 'a'.repeat(64), sourceHash = 'b'.repeat(64), contractHash = 'c'.repeat(64);
const paymentId = '40000000-0000-4000-8000-000000000001';
const proof = [{ reference: 'FIXTURE-BANK', contentHash: hash, confirmedOn: '2026-07-31' }];
const original = (scope = 'FULL_CONTRACT', capped = false) => ({ contractVersion: 2, currency: 'VND', signedOn: '2023-04-15', amendedOn: null, effectiveOn: '2023-04-15', knownOn: '2026-07-31', confirmation: 'BANK_CONFIRMED', evidence: proof, balanceAsOf: '2026-07-31', principalBalance: '100000000', balanceScope: scope, paymentShare: scope === 'USER_SHARE' ? '1' : '0.5', userPaidToDate: '10000000', responsibility: capped ? { kind: 'CAPPED', capBasis: 'TOTAL_USER_PAYMENTS', limit: '80000000', previouslyPaid: '10000000', evidence: proof } : { kind: 'ALLOCATED_SHARE' }, interestBasis: 'REDUCING_BALANCE', rounding: 'CENT_HALF_UP', mode: 'BANK_SCHEDULE', fixedPayment: null, finalPayment: 'NO_BALLOON', maturityDate: '2026-08-31', periods: [{ accrualFrom: '2026-07-31', dueDate: '2026-08-31', rate: { kind: 'SIMPLE_ANNUAL_DAILY', percent: '0', days: 31, yearDays: 365 }, fee: '0', carriedInterest: '0', gracePrincipal: false, bankPayment: { principal: '100000000', interest: '0' } }] });
const option = { sourceId: 'loan-saved', sourceRevision: 3, sourceHash, contractHash, legacyOpeningRequired: false };
const registry = { registryHash: hash, startMonth: '2026-01', endMonth: '2029-12', revisions: [{ sourceId: option.sourceId, sourceHash, revision: 3, kind: 'DEBT', operation: 'REVISE', effectiveFromMonth: '2026-01', effectiveToMonth: '2029-12', schedule: [] }] };
const result = (contract = original()) => ({ status: 'READY', inputHash: hash, issues: [], loanRevisionOptions: [option], plannedRefinanceOptions: { eligibleLoans: [], activePairs: [] }, assetRevisionOptions: [], candidate: { replayInput: { sourceRegistry: registry }, loanSources: [{ sourceHash, evidence: { command: { contract, allocations: [] } } }], calculation: { summary: { retirementMonth: '2027-01', endMonth: '2029-12', atRetirement: { projectedFund: '1000000000', coveragePercent: '80' } } } } });
const ledger = (amount = '100000000', revision = 2, reconciliation = 'MATCHED') => ({ id: 'actual-fixture', period: '2026-08', revision, reconciliation, history: [], data: { currency: 'VND', openingBalance: '100000', closingBalance: '100000', correctionReason: 'Đã đối soát fixture', entries: [{ eventId: paymentId, kind: 'DEBT_PAYMENT', date: '2026-08-15', amount, note: 'Khoản trả fixture' }, { eventId: '40000000-0000-4000-8000-000000000002', kind: 'EXPENSE', date: '2026-08-15', amount: '1000' }] } });
const previewUrl = '**/source-reforecasts/preview';
const area = (page: Page) => page.getByRole('region', { name: 'Sửa hoặc kết thúc nguồn khoản vay', exact: true });
const run = (page: Page) => page.getByRole('button', { name: 'Xem trước nguồn V4', exact: true });
const save = (page: Page) => page.getByRole('button', { name: 'Lưu phiên bản V4', exact: true });
const list = (page: Page) => page.getByRole('region', { name: 'Danh sách lệnh khoản vay', exact: true });
async function setup(page: Page, contract = original(), profile?: any) {
  await installRouteAuth(page); await installFinancialProfileRoutes(page, profile ? { profile } : undefined); await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const plan = { id: 'loan-plan', revision: 2, currentVersionId: 'loan-v1', current: { id: 'loan-v1', version: 1, snapshotHash: hash, preview: { modelVersion: 'retirement-monthly-v4', ...result(contract).candidate, selection: { answers: [] } } } };
  await page.route('**/me/retirement/plans**', route => { const path = new URL(route.request().url()).pathname; return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: [plan] } : path.endsWith('/versions') ? { items: [] } : plan } }); });
  await page.route('**/me/retirement/actuals/*', route => route.fulfill({ json: { data: ledger() } }));
  await page.route(previewUrl, route => route.fulfill({ json: { data: result(contract) } }));
  await page.route('**/source-reforecasts', route => route.fulfill({ json: { data: { planId: 'loan-plan', revision: 3, saved: { id: 'loan-v2', version: 2 } } } }));
  await page.goto('/user/simulation?tab=actuals'); await page.locator('#actual-period').fill('2026-08'); await expect(page.getByRole('button', { name: 'Chạy dự báo neo số dư', exact: true })).toBeEnabled(); await page.getByRole('button', { name: /Lệnh nguồn \(V4\)/ }).click();
}
async function choose(page: Page) { await area(page).getByRole('button', { name: 'Tải danh mục khoản vay', exact: true }).click(); await page.locator('#lr-source').selectOption('loan-saved'); }
async function terms(page: Page, principal = '100000000', months = '12', rate = '8.1234567891') { await page.locator('#lr-principal').fill(principal); await page.locator('#lr-months').fill(months); await page.locator('#lr-rate').fill(rate); }
async function confirmAdd(page: Page, end = false) { await fillEvidence(page, 'Căn cứ số dư và điều khoản khoản vay'); await area(page).getByRole('checkbox', { name: /Tôi xác nhận số dư/ }).check(); await area(page).getByRole('button', { name: end ? 'Thêm lệnh kết thúc khoản vay' : 'Thêm lệnh sửa khoản vay', exact: true }).click(); }
async function capture(page: Page) { const req = page.waitForRequest(previewUrl); await run(page).click(); await expect(save(page)).toBeVisible(); return (await req).postDataJSON(); }
async function allocate(page: Page, userPrincipal = '100000000', contractPrincipal = userPrincipal) {
  const details = area(page).locator('.loan-payment-details'); if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) await details.locator('summary').click();
  await area(page).getByRole('button', { name: 'Tải sổ trả nợ', exact: true }).click(); await page.locator('#lr-event').selectOption(paymentId);
  for (const key of ['principal', 'interest', 'prepaymentFee', 'otherFee']) { await page.locator('#lr-user-' + key).fill(key === 'principal' ? userPrincipal : '0'); if (await page.locator('#lr-contract-' + key).count()) await page.locator('#lr-contract-' + key).fill(key === 'principal' ? contractPrincipal : '0'); }
  await fillEvidence(page, 'Căn cứ phân bổ khoản trả'); await area(page).getByRole('button', { name: 'Thêm phân bổ khoản trả', exact: true }).click();
}
function reconcile(command: any, previous = original()) { loanSourceRevisionSchema.parse(command); return reconcileLoanRevision({ previous, next: command.contract, allocations: command.allocations, principalAdvances: command.principalAdvances, ...(command.responsibilityAmendment ? { responsibilityAmendment: command.responsibilityAmendment } : {}) }, [{ period: '2026-08', revision: 2, status: 'RECONCILED', data: ledger().data }], []); }

test('loan revision: load error/retry and empty list are distinct', async ({ page }) => {
  await setup(page); await page.route(previewUrl, route => route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được danh mục fixture' } } })); await area(page).getByRole('button', { name: 'Tải danh mục khoản vay' }).click(); await expect(area(page).getByRole('alert')).toContainText('Không tải được danh mục fixture');
  await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), loanRevisionOptions: [] } } })); await area(page).getByRole('button', { name: 'Tải danh mục khoản vay' }).click(); await expect(area(page).getByRole('status')).toContainText('Không có khoản vay'); await expect(page.locator('#lr-source')).toBeDisabled();
});
test('loan revision: immutable original identity, dates, scope and precise rate; backend reconciliation', async ({ page }) => {
  await setup(page); await choose(page); await expect(area(page)).toContainText('2023-04-15'); await terms(page); await expect(run(page)).toBeDisabled(); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0];
  expect(command).toMatchObject({ sourceId: option.sourceId, expectedSourceRevision: 3, expectedSourceHash: sourceHash, expectedContractHash: contractHash, allocations: [], principalAdvances: [] }); expect(command.contract).toMatchObject({ signedOn: '2023-04-15', balanceScope: 'FULL_CONTRACT', paymentShare: '0.5', principalBalance: '100000000', userPaidToDate: '10000000' }); expect(command.contract.periods[0].rate.percent).toBe('8.1234567891'); expect(reconcile(command).status).toBe('RECONCILED');
  await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), loanRevisionOptions: [{ ...option, sourceRevision: 4, sourceHash: 'd'.repeat(64) }] } } })); await list(page).getByRole('button', { name: 'Xóa lệnh khoản vay loan-saved' }).click(); await page.locator('#lr-source').selectOption('loan-saved'); await terms(page); await confirmAdd(page); expect((await capture(page)).loanRevisions[0].expectedSourceRevision).toBe(3);
});
test('loan revision: missing balance, rate and invalid terms do not silently become defaults', async ({ page }) => {
  await setup(page); await choose(page); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Dư nợ cuối kỳ');
  for (const [months, rate] of [['601', '8'], ['1.5', '8'], ['12', '1e2'], ['12', '101'], ['', ''], ['0', '8']]) { await terms(page, '100000000', months, rate); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('1–600'); }
  await terms(page, '1e8'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Dư nợ cuối kỳ'); await expect(list(page)).toHaveCount(0);
});
test('loan revision: selecting keep payment then END does not leak hidden fixed payment', async ({ page }) => {
  await setup(page); await choose(page); await page.locator('#lr-mode').selectOption('REDUCE_TERM_KEEP_PAYMENT'); await page.locator('#lr-fixed').fill('5000000'); await page.locator('#lr-operation').selectOption('END'); await allocate(page); await confirmAdd(page, true); const command = (await capture(page)).loanRevisions[0]; expect(command.contract).toMatchObject({ principalBalance: '0', fixedPayment: null, mode: 'BANK_SCHEDULE', finalPayment: 'NO_BALLOON', periods: [] }); expect(reconcile(command).closingPrincipal).toBe('0');
});
test('loan revision: END cannot erase debt without saved payments', async ({ page }) => {
  await setup(page); await choose(page); await page.locator('#lr-operation').selectOption('END'); await confirmAdd(page, true); await expect(area(page).getByRole('alert')).toContainText('Dư nợ cuối kỳ'); await expect(list(page)).toHaveCount(0);
});
test('loan revision: allocation preserves event ID/revision/date and capped payment carry', async ({ page }) => {
  const previous = original('FULL_CONTRACT', true); await setup(page, previous); await choose(page); await terms(page, '60000000'); await allocate(page, '20000000', '40000000'); await expect(page.locator('#lr-event option')).toHaveCount(2); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0];
  expect(command.allocations[0]).toMatchObject({ eventId: paymentId, actualRevision: 2, bookedOn: '2026-08-15', components: { principal: '20000000' }, contractComponents: { principal: '40000000' } }); expect(command.contract.responsibility).toMatchObject({ kind: 'CAPPED', limit: '80000000', previouslyPaid: '30000000' }); expect(command.contract.userPaidToDate).toBe('30000000'); expect(reconcile(command, previous).closingPrincipal).toBe('60000000');
});
test('loan revision: user share is not multiplied again; over-allocation blocked', async ({ page }) => {
  const previous = original('USER_SHARE'); await setup(page, previous); await choose(page); await expect(page.locator('#lr-contract-principal')).toHaveCount(0); await allocate(page, '100000001'); await expect(area(page).getByRole('alert')).toContainText('không vượt');
  await page.locator('#lr-user-principal').fill('25000000'); await area(page).getByRole('button', { name: 'Thêm phân bổ khoản trả' }).click(); await terms(page, '75000000'); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command.allocations[0].components).toEqual(command.allocations[0].contractComponents); expect(command.contract.paymentShare).toBe('1'); expect(reconcile(command, previous).closingPrincipal).toBe('75000000');
});
for (const mode of ['BANK_SCHEDULE', 'RESTRUCTURED']) test('loan revision: ' + mode + ' requires separate principal and interest for every period', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '100000000', '2', '0'); await page.locator('#lr-mode').selectOption(mode); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Nhập gốc và lãi'); await area(page).getByRole('button', { name: 'Tạo ô nhập lịch ngân hàng' }).click();
  for (let i = 1; i <= 2; i++) { await area(page).getByLabel('Gốc kỳ ' + i, { exact: true }).fill('50000000'); await area(page).getByLabel('Lãi kỳ ' + i, { exact: true }).fill('0'); }
  await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; loanSourceRevisionSchema.parse(command); expect(command.contract.periods).toHaveLength(2); expect(command.contract.periods[0].bankPayment).toEqual({ principal: '50000000', interest: '0' });
});
test('loan revision: changed saved actual revision blocks attach until reloaded', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '75000000'); await allocate(page, '25000000'); await page.route('**/me/retirement/actuals/*', route => route.fulfill({ json: { data: ledger('100000000', 3) } })); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Sổ trả nợ đã thay đổi'); await expect(list(page)).toHaveCount(0); await area(page).getByRole('button', { name: 'Tải sổ trả nợ' }).click(); await expect(area(page).getByText(/Đã bỏ phân bổ cũ/)).toBeVisible(); await expect(area(page).locator('.loan-allocation')).toHaveCount(0);
});
test('loan revision: unmatched ledger and delayed old month cannot become payment options', async ({ page }) => {
  await setup(page); await choose(page); await area(page).locator('.loan-payment-details > summary').click(); await page.route('**/me/retirement/actuals/*', route => route.fulfill({ json: { data: ledger('100000000', 2, 'UNRECONCILED') } })); await area(page).getByRole('button', { name: 'Tải sổ trả nợ' }).click(); await expect(area(page)).toContainText('Sổ tháng chưa đối soát'); await expect(page.locator('#lr-event option')).toHaveCount(1);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let called = false; await page.route('**/me/retirement/actuals/*', async route => { called = true; await gate; return route.fulfill({ json: { data: ledger() } }); }); await area(page).getByRole('button', { name: 'Tải sổ trả nợ' }).click(); await expect.poll(() => called).toBe(true); await page.locator('#lr-period').fill('2026-07'); const response = page.waitForResponse('**/me/retirement/actuals/*'); release(); await response; await expect(page.locator('#lr-event option')).toHaveCount(1);
});
test('loan revision: saved preview invalidates for draft; duplicate command cannot silently overwrite', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await confirmAdd(page); await capture(page); await save(page).click(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible(); await page.locator('#lr-source').selectOption('loan-saved'); await expect(save(page)).toHaveCount(0); await expect(run(page)).toBeDisabled(); await expect(page.getByRole('button', { name: 'Tạo khoản vay', exact: true })).toBeDisabled(); await terms(page); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('đã có lệnh'); await expect(list(page).locator('tbody tr')).toHaveCount(1); await area(page).getByRole('button', { name: 'Bỏ nhập dở khoản vay' }).click(); await expect(run(page)).toBeEnabled();
});
test('loan revision: missing v2 contract never falls back to invented dates', async ({ page }) => {
  await setup(page); await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), candidate: { ...result().candidate, loanSources: [] } } } })); await choose(page); await expect(area(page).getByRole('alert')).toContainText('Thiếu hợp đồng gốc'); await expect(area(page).getByRole('button', { name: 'Thêm lệnh sửa khoản vay' })).toHaveCount(0);
});
test('loan revision: save/apply retains command snapshot and requires popup confirmation', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await confirmAdd(page); const input = await capture(page); let savedBody: any; await page.route('**/source-reforecasts', route => { savedBody = route.request().postDataJSON(); return route.fulfill({ json: { data: { planId: 'loan-plan', revision: 3, saved: { id: 'loan-v2', version: 2 } } } }); }); await save(page).click(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible(); expect(savedBody.preview).toEqual(input);
  let applied: any = null; await page.route('**/plans/loan-plan/apply', route => { applied = route.request().postDataJSON(); return route.fulfill({ json: { data: { planId: 'loan-plan', revision: 4, currentVersionId: 'loan-v2' } } }); }); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); expect(applied).toBeNull(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await dialog.getByRole('button', { name: 'Xác nhận áp dụng nguồn' }).click(); await expect(page).toHaveURL(/\/user\/plan$/); expect(applied).toMatchObject({ versionId: 'loan-v2', expectedRevision: 3 });
});
test('loan revision: legacy dates and evidence are explicit, never defaulted or clamped', async ({ page }) => {
  const known = (value: string) => ({ status: 'KNOWN', value });
  const debt = { id: 'old-loan', label: 'Khoản vay cũ fixture', currency: 'VND', outstandingBalance: known('100000000'), balanceAsOf: known('2026-07-31'), paymentShare: known('0.5'), balanceShare: known('0.5'), payment: known('50000000'), responsibility: { status: 'KNOWN', scope: 'ALLOCATED_ONLY', confirmedDocument: 'FIXTURE', limit: { status: 'UNKNOWN' } }, contract: { status: 'KNOWN', value: { contractVersion: 1, source: 'FIXTURE', confirmedOn: '2026-07-31', balanceAsOf: '2026-07-31', interestBasis: 'REDUCING_BALANCE', periodConvention: 'DECLARED_FULL_MONTH_OR_EXPLICIT_DAYS', maturityDate: '2026-08-31', settleRemainingAtMaturity: false, parties: [{ reference: 'fixture', role: 'BORROWER' }], periods: [{ dueDate: '2026-08-31', rate: { kind: 'SIMPLE_ANNUAL_DAILY', percent: '0', days: 31, yearDays: 365 }, repayment: { kind: 'PRINCIPAL_PLUS_INTEREST', amount: '100000000' }, minimumPayment: '100000000', fee: '0', prepayment: { status: 'UNKNOWN' } }] } }, startMonth: '2026-07', endMonth: null, frequency: 'MONTHLY' };
  const profile = { revision: 1, schemaVersion: 2, data: { schemaVersion: 2, valuationDate: '2026-07-31', currency: 'VND', periodUnit: 'MONTH', personal: { birthMonth: known('1970-01'), desiredRetirementMonth: known('2027-01'), pensionStartMonth: { status: 'UNKNOWN' } }, income: { status: 'KNOWN', entries: [] }, expenses: { status: 'KNOWN', entries: [] }, assets: { status: 'KNOWN', entries: [] }, debts: { status: 'KNOWN', entries: [debt] } } };
  await setup(page, original(), profile);
  await page.route(previewUrl, route => route.fulfill({ json: { data: { ...result(), loanRevisionOptions: [{ ...option, sourceId: 'profile:debt:old-loan', sourceRevision: 1, legacyOpeningRequired: true }], candidate: { ...result().candidate, loanSources: [] } } } }));
  await area(page).getByRole('button', { name: 'Tải danh mục khoản vay' }).click(); await page.locator('#lr-source').selectOption('profile:debt:old-loan');
  await expect(page.locator('#lr-signed')).toHaveValue(''); await expect(page.locator('#lr-effective')).toHaveValue(''); await expect(page.locator('#lr-opening-paid')).toHaveValue('');
  await terms(page); await fillEvidence(page, 'Căn cứ mở đầu khoản vay cũ'); await page.locator('#lr-signed').fill('2026-08-01'); await page.locator('#lr-effective').fill('2026-08-01'); await page.locator('#lr-opening-paid').fill('0'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Kiểm tra căn cứ mở đầu');
  await page.locator('#lr-signed').fill('2023-04-15'); await page.locator('#lr-effective').fill('2023-04-16'); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; loanSourceRevisionSchema.parse(command); expect(command.legacyOpening).toMatchObject({ signedOn: '2023-04-15', effectiveOn: '2023-04-16', previouslyPaid: '0' }); expect(command.legacyOpening.evidence[0].reference).toBe('TEST-EVIDENCE-ONLY'); expect(command.contract.signedOn).toBe('2023-04-15');
});
test('loan revision: cutoff change cannot reuse attached command for a different month', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await confirmAdd(page); await capture(page);
  await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1); return route.fulfill({ json: { data: { ...ledger(), period, data: { ...ledger().data, entries: [] } } } }); });
  await page.locator('#actual-period').fill('2026-09'); await expect(save(page)).toHaveCount(0); await run(page).click(); await expect(page.locator('#main-content').getByRole('alert').filter({ hasText: 'Lỗi nguồn V4' })).toContainText('Kỳ đối soát đã đổi');
});
test('loan revision: async attachment locks inputs and cannot survive cutoff change', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '75000000'); await allocate(page, '25000000');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let requested = false;
  await page.route('**/me/retirement/actuals/*', async route => { requested = true; await gate; return route.fulfill({ json: { data: ledger() } }); });
  await confirmAdd(page); await expect.poll(() => requested).toBe(true); await expect(page.locator('#lr-principal')).toBeDisabled(); await expect(area(page).getByRole('button', { name: 'Bỏ nhập dở khoản vay' })).toBeDisabled();
  await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1); return route.fulfill({ json: { data: { ...ledger(), period, data: { ...ledger().data, entries: [] } } } }); });
  await page.locator('#actual-period').fill('2026-09'); await expect(page.locator('#lr-source')).toHaveValue('');
  const response = page.waitForResponse('**/me/retirement/actuals/2026-08'); release(); await response; await expect(list(page)).toHaveCount(0);
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) test(`loan revision layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.setViewportSize(viewport); await setup(page); await choose(page); await terms(page); const box = await area(page).boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(await area(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); await area(page).screenshot({ path: `../artifacts/ui-audit-2026-10-11/loan-revision-${viewport.width}x${viewport.height}.png` }); await confirmAdd(page); await list(page).focus(); await expect(list(page)).toBeFocused(); await capture(page); await save(page).click(); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.screenshot({ path: `../artifacts/ui-audit-2026-10-11/loan-revision-confirm-${viewport.width}x${viewport.height}.png` }); expect(errors).toEqual([]);
});

async function openAdvances(page: Page) { const details = area(page).locator('.loan-advance-details'); if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) await details.locator('summary').click(); }
async function advance(page: Page, amount = '20000000', bookedOn = '2026-08-10', reference = 'ADVANCE-FIXTURE', confirmedOn = '2026-10-08') {
  await openAdvances(page); await page.getByLabel('Ngày giải ngân bổ sung', { exact: true }).fill(bookedOn); await page.getByLabel('Số tiền giải ngân bổ sung (VND)', { exact: true }).fill(amount); await fillEvidence(page, 'Căn cứ giải ngân bổ sung', reference, confirmedOn); await area(page).getByRole('button', { name: 'Thêm khoản giải ngân', exact: true }).click();
}
const advanceList = (page: Page) => area(page).getByRole('region', { name: 'Danh sách giải ngân bổ sung', exact: true });

test('loan advance: exact amount, evidence hash and ID survive schema/reconciliation/save retry', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '9007199354740993.01');
  await advance(page, '9007199254740993.01'); await expect(advanceList(page)).toContainText('9.007.199.254.740.993,01 ₫'); await confirmAdd(page);
  const input = await capture(page), command = input.loanRevisions[0]; expect(command.principalAdvances).toHaveLength(1); const item = command.principalAdvances[0];
  expect(item).toMatchObject({ amount: '9007199254740993.01', bookedOn: '2026-08-10', kind: 'CONFIRMED_PRINCIPAL_ADVANCE', evidence: [{ reference: 'ADVANCE-FIXTURE', confirmedOn: '2026-10-08' }] }); expect(item.changeId).toMatch(/^[a-f0-9-]{36}$/); expect(item.evidence[0].contentHash).toMatch(/^[a-f0-9]{64}$/); expect(item).not.toHaveProperty('eventId'); expect(reconcile(command).closingPrincipal).toBe('9007199354740993.01'); expect(command.contract.userPaidToDate).toBe('10000000');
  const writes: any[] = []; await page.route('**/source-reforecasts', route => { writes.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] }); return writes.length === 1 ? route.abort('failed') : route.fulfill({ json: { data: { planId: 'loan-plan', revision: 3, saved: { id: 'loan-v2', version: 2 } } } }); });
  await save(page).click(); await expect.poll(() => writes.length).toBe(1); await expect(save(page)).toBeEnabled(); await save(page).click(); await expect(page.getByRole('button', { name: 'Áp dụng bản v2', exact: true })).toBeVisible(); expect(writes[1]).toEqual(writes[0]); expect(writes[1].body.preview).toEqual(input);
});
test('loan advance: empty, zero, negative, exponent, oversized and excessive precision rejected', async ({ page }) => {
  await setup(page); await choose(page);
  for (const amount of ['', '0', '-1', '1e6', '10000000000000000', '1.001']) { await advance(page, amount); await expect(area(page).locator('.loan-advance-details').getByRole('alert')).toContainText('Số tiền giải ngân'); }
  await expect(advanceList(page).locator('.loan-allocation')).toHaveCount(0);
});
test('loan advance: date must be strictly after opening and within cutoff', async ({ page }) => {
  await setup(page); await choose(page);
  for (const bookedOn of ['', '2026-07-30', '2026-07-31', '2026-09-01']) { await advance(page, '1', bookedOn); await expect(area(page).locator('.loan-advance-details').getByRole('alert')).toContainText('Ngày giải ngân'); }
  await advance(page, '1', '2026-08-31'); await expect(advanceList(page).locator('.loan-allocation')).toHaveCount(1);
});
test('loan advance: evidence is mandatory and cannot be dated in the future', async ({ page }) => {
  await setup(page); await choose(page); await openAdvances(page); await page.locator('#lr-advance-date').fill('2026-08-10'); await page.locator('#lr-advance-amount').fill('20000000'); await area(page).getByRole('button', { name: 'Thêm khoản giải ngân', exact: true }).click(); await expect(area(page).locator('.loan-advance-details').getByRole('alert')).toContainText('Vui lòng nhập tên căn cứ');
  await advance(page, '20000000', '2026-08-10', 'ADVANCE-FIXTURE', '2099-01-01'); await expect(area(page).locator('.loan-advance-details').getByRole('alert')).toContainText('không sau hôm nay');
  await advance(page, '20000000', '2026-08-10', 'x'.repeat(1001)); await expect(area(page).locator('.loan-advance-details').getByRole('alert')).toContainText('1000');
});
test('loan advance: duplicate entry blocked; discard/remove reset confirmation without changing saved ledgers', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '120000000'); await advance(page); await advance(page, '20000000.00'); await expect(area(page).locator('.loan-advance-details').getByRole('alert')).toContainText('ghi trùng'); await expect(advanceList(page).locator('.loan-allocation')).toHaveCount(1);
  await area(page).getByRole('button', { name: 'Bỏ phần giải ngân đang nhập', exact: true }).click(); await area(page).getByRole('checkbox', { name: /Tôi xác nhận số dư/ }).check();
  const writes: string[] = []; page.on('request', req => { if (req.method() !== 'GET') writes.push(req.url()); });
  await advanceList(page).getByRole('button', { name: 'Bỏ giải ngân 1', exact: true }).click(); await expect(area(page).getByRole('checkbox', { name: /Tôi xác nhận số dư/ })).not.toBeChecked(); await expect(advanceList(page).locator('.loan-allocation')).toHaveCount(0); expect(writes).toEqual([]);
  await confirmAdd(page); await expect(area(page).getByRole('alert').filter({ hasText: 'Kiểm tra lệnh khoản vay' })).toContainText('Dư nợ cuối kỳ');
});
test('loan advance: collapsed unfinished draft cannot be silently omitted', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await openAdvances(page); await page.locator('#lr-advance-amount').fill('20000000'); await area(page).locator('.loan-advance-details > summary').click(); await expect(area(page).getByRole('status')).toContainText('Còn khoản giải ngân đang nhập'); await expect(run(page)).toBeDisabled(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Thêm hoặc bỏ phần giải ngân');
  await openAdvances(page); await area(page).getByRole('button', { name: 'Bỏ phần giải ngân đang nhập' }).click(); await confirmAdd(page); expect((await capture(page)).loanRevisions[0].principalAdvances).toEqual([]);
});
test('loan advance: closing proof must cover advance proof date', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '120000000'); await advance(page, '20000000', '2026-08-10', 'ADVANCE-FIXTURE', '2026-10-09'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('không được trước căn cứ giải ngân');
});
for (const scope of ['FULL_CONTRACT', 'USER_SHARE']) test('loan advance: scope ' + scope + ' preserves amount and paid history', async ({ page }) => {
  const previous = original(scope, true); await setup(page, previous); await choose(page); await terms(page, '120000000'); await advance(page); await expect(area(page).locator('.loan-advance-details')).toContainText(scope === 'FULL_CONTRACT' ? 'toàn hợp đồng' : 'phần của bạn'); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command.principalAdvances[0].amount).toBe('20000000'); expect(command.contract.responsibility.previouslyPaid).toBe('10000000'); expect(command.contract.responsibility.limit).toBe('80000000'); expect(reconcile(command, previous).closingPrincipal).toBe('120000000');
});
test('loan advance: sums multiple advances exactly without creating fund events', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '100000000.30'); await advance(page, '0.10', '2026-08-10', 'ADV-1'); await advance(page, '0.20', '2026-08-11', 'ADV-2'); await expect(advanceList(page)).toContainText('0,3 ₫'); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(new Set(command.principalAdvances.map((a: any) => a.changeId)).size).toBe(2); expect(command.allocations).toEqual([]); expect(reconcile(command).fundAdjustment).toBe('0'); expect(reconcile(command).closingPrincipal).toBe('100000000.3');
});
test('loan advance: same-day principal repayment and advance are rejected even if ending balance matches', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await advance(page, '20000000', '2026-08-15'); await allocate(page, '20000000'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('chưa xác định được thứ tự'); await expect(list(page)).toHaveCount(0);
});
test('loan advance: later advance cannot cover an earlier overpayment', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '0'); await advance(page, '20000000', '2026-08-20'); await page.route('**/me/retirement/actuals/*', route => route.fulfill({ json: { data: ledger('120000000') } })); await allocate(page, '120000000'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Giải ngân sau không bù'); await expect(list(page)).toHaveCount(0);
});
test('loan advance: earlier advance followed by repayment can settle completely with backend reconciliation', async ({ page }) => {
  await setup(page); await choose(page); await page.locator('#lr-operation').selectOption('END'); await advance(page, '20000000', '2026-08-10'); await page.route('**/me/retirement/actuals/*', route => route.fulfill({ json: { data: ledger('120000000') } })); await allocate(page, '120000000'); await confirmAdd(page, true); const command = (await capture(page)).loanRevisions[0]; loanSourceRevisionSchema.parse(command); const checked = reconcileLoanRevision({ previous: original(), next: command.contract, allocations: command.allocations, principalAdvances: command.principalAdvances }, [{ period: '2026-08', revision: 2, status: 'RECONCILED', data: ledger('120000000').data }], []); expect(checked).toMatchObject({ status: 'RECONCILED', principalAdvanced: '20000000', principalPaid: '120000000', closingPrincipal: '0', fundAdjustment: '0' });
});
test('loan advance: cutoff change clears pending evidence and advances', async ({ page }) => {
  await setup(page); await choose(page); await advance(page); await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1); return route.fulfill({ json: { data: { ...ledger(), period, data: { ...ledger().data, entries: [] } } } }); }); await page.locator('#actual-period').fill('2026-09'); await expect(page.locator('#lr-source')).toHaveValue(''); await choose(page); await openAdvances(page); await expect(advanceList(page).locator('.loan-allocation')).toHaveCount(0); await expect(page.locator('#lr-advance-amount')).toHaveValue('');
});
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) test('loan advance layout ' + viewport.width + 'x' + viewport.height, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.setViewportSize(viewport); await setup(page); await choose(page); await terms(page, '120000000'); await advance(page); const details = area(page).locator('.loan-advance-details'); await details.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(details).not.toHaveAttribute('open', ''); await page.keyboard.press('Enter'); await expect(details).toHaveAttribute('open', ''); const box = await details.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(await details.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); await details.screenshot({ path: '../artifacts/ui-audit-2026-10-11/loan-advance-' + viewport.width + 'x' + viewport.height + '.png' }); await confirmAdd(page); await capture(page); await save(page).click(); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); expect(errors).toEqual([]);
});

const amendment = (page: Page) => area(page).getByRole('group', { name: 'Thay trách nhiệm và trần nghĩa vụ', exact: true });
const amendmentCheck = (page: Page) => amendment(page).getByRole('checkbox', { name: /Tôi xác nhận thay trách nhiệm/ });
async function amend(page: Page, kind = 'CAPPED', cap = '50000000', effectiveOn = '2026-08-10') {
  if (await page.locator('.lr-amend-start').count()) await page.locator('.lr-amend-start').click();
  await page.locator('#lr-amend-kind').selectOption(kind); if (kind === 'CAPPED') await page.locator('#lr-amend-cap').fill(cap);
  await page.locator('#lr-amended-on').fill(effectiveOn); await page.locator('#lr-amend-effective').fill(effectiveOn);
  await fillEvidence(page, 'Căn cứ thay trách nhiệm', 'AMENDMENT-FIXTURE'); await amendmentCheck(page).check();
}

test('loan amendment: cap change keeps principal, original identity, exact history and dedicated evidence through retry', async ({ page }) => {
  const previous = original('FULL_CONTRACT', true); await setup(page, previous); await choose(page); await terms(page); await amend(page, 'CAPPED', '9007199254740993.01');
  await expect(page.locator('#lr-amend-paid')).toHaveValue('10000000'); await expect(page.locator('#lr-amend-paid')).toHaveAttribute('readonly', ''); await expect(amendment(page)).toContainText('9.007.199.244.740.993,01 ₫');
  await confirmAdd(page); const input = await capture(page), command = input.loanRevisions[0]; expect(command.responsibilityAmendment).toMatchObject({ effectiveOn: '2026-08-10', openingUserPaid: '10000000', confirm: true, evidence: [{ reference: 'AMENDMENT-FIXTURE' }] }); expect(command.responsibilityAmendment.evidence[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(command.contract).toMatchObject({ signedOn: previous.signedOn, amendedOn: '2026-08-10', effectiveOn: '2026-08-10', balanceAsOf: '2026-08-31', paymentShare: '0.5', balanceScope: 'FULL_CONTRACT', userPaidToDate: '10000000', responsibility: { limit: '9007199254740993.01', previouslyPaid: '10000000', evidence: command.responsibilityAmendment.evidence } }); expect(reconcile(command, previous).fundAdjustment).toBe('0'); await expect(list(page)).toContainText('Thay trách nhiệm từ 2026-08-10');
  const writes: any[] = []; await page.route('**/source-reforecasts', route => { writes.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] }); return writes.length === 1 ? route.abort('failed') : route.fulfill({ json: { data: { planId: 'loan-plan', revision: 3, saved: { id: 'loan-v2', version: 2 } } } }); }); await save(page).click(); await expect.poll(() => writes.length).toBe(1); await expect(save(page)).toBeEnabled(); await save(page).click(); await expect.poll(() => writes.length).toBe(2); expect(writes[1]).toEqual(writes[0]); expect(writes[1].body.preview).toEqual(input);
});

test('loan amendment: cap removal and re-entry retain principal, interest and fee history', async ({ page }) => {
  let previous: any = original('FULL_CONTRACT', true);
  for (const [index, kind, cap] of [[0, 'CAPPED', '50000000'], [1, 'ALLOCATED_SHARE', ''], [2, 'CAPPED', '40000000']] as const) {
    await setup(page, previous); await choose(page); await terms(page, '90000000');
    if (index === 0) {
      await allocate(page, '10000000'); await page.locator('#lr-event').selectOption(paymentId);
      for (const side of ['user', 'contract']) for (const [key, amount] of Object.entries({ principal: '0', interest: '2000000', prepaymentFee: '1000000', otherFee: '2000000' })) await page.locator('#lr-' + side + '-' + key).fill(amount);
      await fillEvidence(page, 'Căn cứ phân bổ khoản trả'); await area(page).getByRole('button', { name: 'Thêm phân bổ khoản trả', exact: true }).click();
    }
    await amend(page, kind, cap, '2026-08-31'); await expect(amendment(page)).toContainText('25.000.000 ₫'); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command.contract.userPaidToDate).toBe('25000000'); expect(reconcile(command, previous).fundAdjustment).toBe('0');
    if (kind === 'CAPPED') expect(command.contract.responsibility.previouslyPaid).toBe('25000000'); else expect(command.contract.responsibility).toEqual({ kind: 'ALLOCATED_SHARE' }); previous = command.contract;
  }
});

test('loan amendment: unknown paid history is empty and must be declared; confirmed zero is allowed', async ({ page }) => {
  const previous: any = original(); delete previous.userPaidToDate; await setup(page, previous); await choose(page); await terms(page); await amend(page, 'CAPPED', '0'); await expect(page.locator('#lr-amend-paid')).toHaveValue(''); await expect(amendment(page)).toContainText('Chưa đủ thông tin'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('không mặc định');
  await page.locator('#lr-amend-paid').fill('0'); await amendmentCheck(page).check(); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command.responsibilityAmendment.openingUserPaid).toBe('0'); expect(command.contract.userPaidToDate).toBe('0'); expect(reconcile(command, previous).fundAdjustment).toBe('0');
});

test('loan amendment: capped snapshot without userPaidToDate still has locked paid history', async ({ page }) => {
  const previous: any = original('FULL_CONTRACT', true); delete previous.userPaidToDate; await setup(page, previous); await choose(page); await terms(page); await amend(page, 'ALLOCATED_SHARE'); await expect(page.locator('#lr-amend-paid')).toHaveValue('10000000'); await expect(page.locator('#lr-amend-paid')).toHaveAttribute('readonly', ''); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command.contract.userPaidToDate).toBe('10000000'); reconcile(command, previous);
});

test('loan amendment: declared opening cannot be below recorded allocations for the same source', async ({ page }) => {
  const previous: any = original(); delete previous.userPaidToDate; await setup(page, previous); const response: any = result(previous);
  response.candidate.loanSources[0].evidence.consumed = [{ sourceId: 'loan-saved', allocation: { allocationId: 'old-payment', components: { principal: '7000000', interest: '1000000', prepaymentFee: '1000000', otherFee: '1000000' } } }];
  await page.route(previewUrl, route => route.fulfill({ json: { data: response } })); await choose(page); await terms(page); await amend(page); await page.locator('#lr-amend-paid').fill('9999999.99'); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('thấp hơn các phân bổ');
});

test('loan amendment: new cap cannot be below all paid components, equality is valid', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '80000000'); await allocate(page, '20000000'); await amend(page, 'CAPPED', '29999999.99'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Trần mới thấp hơn'); await expect(amendment(page)).toContainText('Trần thấp hơn tổng đã trả');
  await page.locator('#lr-amend-cap').fill('30000000'); await amendmentCheck(page).check(); await expect(amendment(page)).toContainText('Phần còn lại theo trần mới: 0 ₫'); await confirmAdd(page); reconcile((await capture(page)).loanRevisions[0]);
});

test('loan amendment: invalid cap and unknown paid history are rejected without coercion', async ({ page }) => {
  const previous: any = original(); delete previous.userPaidToDate; await setup(page, previous); await choose(page); await terms(page); await amend(page); await page.locator('#lr-amend-paid').fill('0');
  for (const value of ['', '-1', '1e6', '10000000000000000', '1.001']) { await page.locator('#lr-amend-cap').fill(value); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Nhập trần'); }
  await page.locator('#lr-amend-cap').fill('50000000');
  for (const value of ['-1', '1e6', '10000000000000000', '1.001']) { await page.locator('#lr-amend-paid').fill(value); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Nhập tổng tiền'); }
});

test('loan amendment: invalid amendment/effective dates cannot replace dates from evidence', async ({ page }) => {
  const previous: any = original(); previous.amendedOn = '2026-07-20'; previous.effectiveOn = '2026-07-20'; await setup(page, previous); await choose(page); await terms(page); await amend(page);
  for (const [changed, effective] of [['', '2026-08-10'], ['2026-07-19', '2026-08-10'], ['2026-08-11', '2026-08-10'], ['2026-07-20', '2026-07-30'], ['2026-08-10', '2026-09-01'], ['2026-08-10', '']]) { await page.locator('#lr-amended-on').fill(changed); await page.locator('#lr-amend-effective').fill(effective); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Ngày sửa đổi'); }
  await page.locator('#lr-amended-on').fill('2026-07-31'); await page.locator('#lr-amend-effective').fill('2026-07-31'); await amendmentCheck(page).check(); await confirmAdd(page); reconcile((await capture(page)).loanRevisions[0], previous);
});

test('loan amendment: dedicated proof is required and its dates must cover effective date', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await amend(page); await fillEvidence(page, 'Căn cứ thay trách nhiệm', ''); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Vui lòng nhập tên căn cứ');
  for (const day of ['2026-08-09', '2026-10-09']) { await fillEvidence(page, 'Căn cứ thay trách nhiệm', 'AMENDMENT', day); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('Căn cứ thay trách nhiệm'); }
  await fillEvidence(page, 'Căn cứ thay trách nhiệm', 'x'.repeat(1001)); await amendmentCheck(page).check(); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('1000');
});

test('loan amendment: separate confirmation required; edits and allocation changes invalidate it', async ({ page }) => {
  await setup(page); await choose(page); await terms(page, '90000000'); await amend(page); await page.locator('#lr-amend-cap').fill('60000000'); await expect(amendmentCheck(page)).not.toBeChecked(); await allocate(page, '10000000'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('xác nhận riêng'); await amendmentCheck(page).check(); await area(page).getByRole('button', { name: 'Bỏ phân bổ 1', exact: true }).click(); await expect(amendmentCheck(page)).not.toBeChecked();
});

test('loan amendment: cancel clears only amendment, restores focus and preserves loan allocations', async ({ page }) => {
  await setup(page, original('FULL_CONTRACT', true)); await choose(page); await terms(page, '90000000'); await allocate(page, '10000000'); await amend(page, 'ALLOCATED_SHARE'); await expect(run(page)).toBeDisabled(); await amendment(page).getByRole('button', { name: 'Hủy thay đổi trách nhiệm' }).click(); await expect(page.locator('.lr-amend-start')).toBeFocused(); await expect(page.locator('#lr-principal')).toHaveValue('90000000'); await expect(area(page).getByRole('button', { name: 'Bỏ phân bổ 1' })).toBeVisible(); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command).not.toHaveProperty('responsibilityAmendment'); expect(command.contract.responsibility).toMatchObject({ kind: 'CAPPED', limit: '80000000', previouslyPaid: '20000000' });
});

test('loan amendment: unchanged responsibility cannot accidentally create an amendment', async ({ page }) => {
  await setup(page, original('FULL_CONTRACT', true)); await choose(page); await terms(page); await amend(page, 'CAPPED', '80000000.00'); await confirmAdd(page); await expect(area(page).getByRole('alert')).toContainText('chưa thay đổi');
});

test('loan amendment: changing cap kind removes hidden limit and keeps USER_SHARE unchanged', async ({ page }) => {
  const previous = original('USER_SHARE', true); await setup(page, previous); await choose(page); await terms(page); await amend(page, 'CAPPED', '999999'); await page.locator('#lr-amend-kind').selectOption('ALLOCATED_SHARE'); await expect(page.locator('#lr-amend-cap')).toHaveCount(0); await amendmentCheck(page).check(); await confirmAdd(page); const command = (await capture(page)).loanRevisions[0]; expect(command.contract).toMatchObject({ balanceScope: 'USER_SHARE', paymentShare: '1', responsibility: { kind: 'ALLOCATED_SHARE' }, userPaidToDate: '10000000' }); expect(command.contract.responsibility).not.toHaveProperty('limit'); reconcile(command, previous);
});

test('loan amendment: cutoff change clears amendment and never reuses old evidence', async ({ page }) => {
  await setup(page); await choose(page); await terms(page); await amend(page); await page.route('**/me/retirement/actuals/*', route => { const period = new URL(route.request().url()).pathname.split('/').at(-1); return route.fulfill({ json: { data: { ...ledger(), period, data: { ...ledger().data, entries: [] } } } }); }); await page.locator('#actual-period').fill('2026-09'); await expect(page.locator('#lr-source')).toHaveValue(''); await choose(page); await page.locator('.lr-amend-start').click(); await expect(page.locator('#lr-amend-kind')).toHaveValue(''); await expect(page.locator('#lr-amended-on')).toHaveValue(''); await expect(amendmentCheck(page)).not.toBeChecked();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) test('loan amendment layout ' + viewport.width + 'x' + viewport.height, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.setViewportSize(viewport); await setup(page); await choose(page); await terms(page); await page.locator('.lr-amend-start').click(); await expect(page.locator('#lr-amend-kind')).toBeFocused(); await amend(page); const form = amendment(page); const box = await form.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(await form.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await form.getByRole('button', { name: 'Hủy thay đổi trách nhiệm' }).click(); await expect(page.locator('.lr-amend-start')).toBeFocused(); await amend(page); await form.screenshot({ path: '../artifacts/ui-audit-2026-10-11/loan-amendment-' + viewport.width + 'x' + viewport.height + '.png' }); await confirmAdd(page); await capture(page); await save(page).click(); await page.getByRole('button', { name: 'Áp dụng bản v2', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); expect(errors).toEqual([]);
});
