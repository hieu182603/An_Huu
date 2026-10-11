import { test, expect, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

async function goal(page: Page, options: { reportDelay?: number; reportError?: boolean; assumptionsError?: boolean; noExpense?: boolean; v2?: boolean; saveError?: boolean; noPlan?: boolean; smallExpense?: boolean } = {}) {
  await installRouteAuth(page);
  const record: any = defaultMockProfile();
  if (options.noExpense) record.data.expenses = { essentialExpense: '0', lifestyleExpense: '0' };
  if (options.smallExpense) record.data.expenses = { essentialExpense: '100000', lifestyleExpense: '0' };
  if (options.v2) {
    record.schemaVersion = 2;
    record.data = { schemaVersion: 2, valuationDate: '2026-10-08', currency: 'VND', periodUnit: 'MONTH',
      personal: { birthMonth: { status: 'KNOWN', value: '1994-03' }, desiredRetirementMonth: { status: 'KNOWN', value: '2054-11' }, pensionStartMonth: { status: 'UNKNOWN' }, gender: 'MALE', city: 'Hà Nội' },
      income: { status: 'KNOWN', entries: [{ id: 'income', label: 'Lương', kind: 'FIXED', basis: 'DISPOSABLE', amount: { status: 'KNOWN', value: '30000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
      expenses: { status: 'KNOWN', entries: [{ id: 'expense', label: 'Sinh hoạt', category: 'ESSENTIAL', amount: { status: 'KNOWN', value: '20000000' }, currency: 'VND', startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
      assets: { status: 'KNOWN', entries: [] }, debts: { status: 'NOT_APPLICABLE', reason: 'Không có nợ' } };
  }
  await installFinancialProfileRoutes(page, { profile: record });
  const writes: any[] = []; let saveError = !!options.saveError;
  await page.route('**/api/v1/me/financial-profile', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); writes.push(body);
      await new Promise(resolve => setTimeout(resolve, 450));
      if (saveError) return route.fulfill({ status: 409, json: { error: { code: 'REVISION_CONFLICT', message: 'Hồ sơ đã thay đổi ở phiên khác.' } } });
      record.revision++; record.data = { ...record.data, ...body.changes };
    }
    return route.fulfill({ json: { data: record } });
  });
  await page.route('**/socket.io/**', route => route.abort()); await page.routeWebSocket(/socket\.io/, ws => ws.close());
  let reportError = !!options.reportError, assumptionsError = !!options.assumptionsError;
  const version = { id: 'goal-version', version: 1, preview: { calculation: { summary: { valuationDate: '2026-10-08', futureMonthlyExpense: '55000000', requiredConstantMonthlyContribution: null, atRetirement: { requiredFund: '5000000000', projectedFund: '3000000000', coveragePercent: '60' } } } } };
  const plan = { id: 'goal-plan', currentVersionId: version.id, revision: 1, current: version };
  await page.route('**/api/v1/me/retirement/plans**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/report')) {
      if (options.reportDelay) await new Promise(resolve => setTimeout(resolve, options.reportDelay));
      return reportError ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được báo cáo kiểm thử.' } } }) : route.fulfill({ json: { data: { planId: plan.id, status: 'AVAILABLE', version, goal: { monthlyExpenseToday: '17000000' }, profileChanged: true, hypothetical: true } } });
    }
    return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: options.noPlan ? [] : [plan], total: options.noPlan ? 0 : 1, page: 1, limit: 50 } : path.endsWith('/versions') ? { items: [version], total: 1 } : plan } });
  });
  await page.route('**/api/v1/me/assumptions', route => assumptionsError
    ? route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Không tải được giả định kiểm thử.' } } })
    : route.fulfill({ json: { data: { status: 'UNCONFIGURED', items: [], total: 0, page: 1, limit: 20 } } }));
  await page.goto('/user/goal'); await expect(page.locator('.goal-layout')).toBeVisible(); await expect(page.locator('.anhuu-loading')).toHaveCount(0);
  return { writes, record, setSaveError: (value: boolean) => { saveError = value; }, setReportError: (value: boolean) => { reportError = value; }, setAssumptionsError: (value: boolean) => { assumptionsError = value; } };
}

test('goal: retirement age can be cleared and typed digit by digit; stepper stops at 75', async ({ page }) => {
  await goal(page); const target = page.getByRole('spinbutton', { name: 'Nhập tuổi dự kiến nghỉ hưu', exact: true });
  await target.fill(''); await expect(target).toHaveValue(''); await target.pressSequentially('65'); await expect(target).toHaveValue('65');
  await target.fill('75'); await expect(page.getByRole('button', { name: 'Tăng 1 tuổi hưu', exact: true })).toBeDisabled();
});

test('goal: delayed report never overwrites the expense being edited', async ({ page }) => {
  await goal(page, { reportDelay: 1800 });
  const expense = page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng (theo thời giá hiện tại)', exact: false });
  await expense.fill('31000000'); await page.waitForResponse(response => response.url().endsWith('/report'));
  await expect(page.locator('.goal-summary-card')).toContainText('Kế hoạch có giả định cá nhân');
  await expect(expense).toHaveValue('31.000.000');
});

test('goal: report failure is visible and can be retried', async ({ page }) => {
  const f = await goal(page, { reportError: true }); await expect(page.getByText('Chưa tải được báo cáo kế hoạch', { exact: true })).toBeVisible();
  f.setReportError(false); await page.getByRole('button', { name: 'Tải lại báo cáo', exact: true }).click();
  await expect(page.locator('.goal-summary-card')).toContainText('Hồ sơ đã thay đổi');
});

test('goal: unavailable current spending is not replaced by a made-up lifestyle amount', async ({ page }) => {
  await goal(page, { noExpense: true });
  await expect(page.getByRole('button', { name: 'Thoải mái & Độc lập', exact: false })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false })).toHaveValue('');
});

test('goal: invalid ages and unsafe amount focus the field and prevent continuing', async ({ page }) => {
  const f = await goal(page); const proceed = page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true });
  const target = page.getByRole('spinbutton', { name: 'Nhập tuổi dự kiến nghỉ hưu', exact: true });
  await target.fill('76'); await proceed.click(); await expect(target).toBeFocused(); await expect(target).toHaveAttribute('aria-invalid', 'true');
  await target.fill('60.5'); await proceed.click(); await expect(target).toBeFocused();
  await target.fill('60'); await expect(page.locator('#goal-validation')).toHaveCount(0);
  const life = page.getByRole('spinbutton', { name: 'Tuổi kết thúc kế hoạch', exact: true });
  await life.fill(''); await proceed.click(); await expect(life).toBeFocused(); await life.pressSequentially('85'); await expect(life).toHaveValue('85');
  await life.fill('110'); await expect(page.getByRole('button', { name: 'Tăng 1 tuổi kết thúc kế hoạch', exact: true })).toBeDisabled();
  const expense = page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false });
  await expense.fill('999999999999999999999'); await proceed.click(); await expect(expense).toBeFocused(); await expect(expense).toHaveAttribute('aria-invalid', 'true');
  expect(f.writes).toHaveLength(0); await expect(page).toHaveURL(/\/user\/goal$/);
});

test('goal: assumptions error is distinct from unconfigured and retries', async ({ page }) => {
  const f = await goal(page, { assumptionsError: true });
  await expect(page.getByText('Chưa tải được giả định', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có chuỗi giả định vĩ mô được phê duyệt', { exact: true })).toHaveCount(0);
  f.setAssumptionsError(false); await page.getByRole('button', { name: 'Tải lại giả định', exact: true }).click();
  await expect(page.getByText('Chưa có chuỗi giả định vĩ mô được phê duyệt', { exact: true })).toBeVisible();
  await expect(page.getByText('T03', { exact: false })).toHaveCount(0);
});

test('goal: small expense lifestyle suggestions do not round down to zero; session state is explicit', async ({ page }) => {
  const f = await goal(page, { smallExpense: true });
  await page.getByRole('button', { name: 'Tiết kiệm & Giản dị', exact: false }).click();
  await expect(page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false })).toHaveValue('75.000');
  await page.getByRole('button', { name: 'Giữ để thử trong phiên', exact: true }).click();
  await expect(page.getByText('Đã giữ đầu vào để thử trong phiên.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '90 tuổi', exact: true }).click();
  await expect(page.getByText('Đã giữ đầu vào để thử trong phiên.', { exact: true })).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  await expect(page.locator('.goal-summary-main')).toContainText('Thay đổi đầu vào tại đây chưa tính lại');
  await expect(page.locator('.goal-estimate')).toContainText('29.900.000');
});

test('goal v2: current age is read-only and unchanged retirement age preserves its exact month', async ({ page }) => {
  const f = await goal(page, { v2: true });
  await expect(page.getByRole('spinbutton', { name: 'Nhập tuổi hiện tại của bạn', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tăng 1 tuổi', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Cập nhật Hồ sơ tài chính', exact: true })).toHaveAttribute('href', '/user/account');
  await page.getByRole('button', { name: 'Lưu mốc hưu & giữ đầu vào', exact: true }).click();
  await expect(page.getByText('Đã giữ đầu vào để thử trong phiên.', { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(0); expect(f.record.data.personal.desiredRetirementMonth.value).toBe('2054-11');
});

test('goal v2: failed save keeps inputs and page, pending save locks edits, retry writes one snapshot', async ({ page }) => {
  const f = await goal(page, { v2: true, saveError: true });
  const target = page.getByRole('spinbutton', { name: 'Nhập tuổi dự kiến nghỉ hưu', exact: true }); await target.fill('65');
  const expense = page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false }); await expense.fill('31000000');
  await page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true }).click();
  await expect(target).toBeDisabled(); await expect(expense).toBeDisabled();
  await expect(page.locator('#goal-validation')).toContainText('Chưa lưu được thời điểm nghỉ hưu');
  await expect(page).toHaveURL(/\/user\/goal$/); await expect(target).toHaveValue('65'); await expect(expense).toHaveValue('31.000.000');
  f.setSaveError(false); await page.getByRole('button', { name: 'Lưu mốc hưu & giữ đầu vào', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true })).toBeDisabled();
  await expect(page.getByText('Đã giữ đầu vào để thử trong phiên.', { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(2); expect(f.writes.map(body => body.expectedRevision)).toEqual([1, 1]);
  expect(f.record.data.personal.desiredRetirementMonth.value).toBe('2059-03');
  expect(f.writes[1].changes.personal.birthMonth.value).toBe('1994-03');
  expect(f.writes[1].changes).not.toHaveProperty('goal');
});

test('goal: no plan has explicit empty state; inflation help works with keyboard', async ({ page }) => {
  await goal(page, { noPlan: true }); await expect(page.locator('.goal-summary-main')).toContainText('Chờ kế hoạch');
  const help = page.getByRole('button', { name: 'Thông tin bổ sung về lạm phát chi tiêu', exact: true });
  await help.focus(); await expect(help.locator('..').getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false })).toBeFocused();
});

test('goal: preview navigation retains prepared inputs when returning in the same session', async ({ page }) => {
  const f = await goal(page, { noPlan: true });
  const expense = page.getByRole('textbox', { name: 'Mức chi tiêu dự kiến mỗi tháng', exact: false });
  await expense.fill('31000000'); await page.getByRole('button', { name: '90 tuổi', exact: true }).click();
  await page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true }).click(); await expect(page).toHaveURL(/\/user\/plan$/);
  await page.locator('.user-sidebar a[href="/user/goal"]').click();
  await expect(expense).toHaveValue('31.000.000'); await expect(page.getByRole('spinbutton', { name: 'Tuổi kết thúc kế hoạch', exact: true })).toHaveValue('90');
  expect(f.writes).toHaveLength(0);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`goal layout: form and summary ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await goal(page); await expect(page.locator('.goal-summary-card')).toContainText('Hồ sơ đã thay đổi');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const label of ['Tăng 1 tuổi hưu', 'Giảm 1 tuổi hưu', '90 tuổi']) { await page.getByRole('button', { name: label, exact: true }).click(); }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`), fullPage: true });
    const hold = page.getByRole('button', { name: 'Giữ để thử trong phiên', exact: true }); await hold.click();
    await expect(page.getByText('Đã giữ đầu vào để thử trong phiên.', { exact: true })).toBeVisible();
    await hold.scrollIntoViewIfNeeded(); await expect(hold).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`) });
    expect(errors).toEqual([]);
  });
}

test('goal plan horizon is explained and summary amounts remain readable at reflow', async ({page})=>{
  await page.setViewportSize({width:720,height:500}); await goal(page);
  await expect(page.getByRole('spinbutton',{name:'Tuổi kết thúc kế hoạch',exact:true})).toHaveAttribute('aria-describedby','goal-end-age-help');
  await expect(page.locator('#goal-end-age-help')).toContainText('không phải dự đoán tuổi thọ');
  const sizes=await page.locator('.goal-summary-stats span, .goal-summary-stats strong').evaluateAll(es=>es.map(e=>parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThan(0); expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('goal-reflow.png'),fullPage:true});
});
