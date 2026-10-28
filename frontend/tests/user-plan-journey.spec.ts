import { test, expect, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

// Every API is intercepted. These scenarios never read or change customer data.
async function journey(page: Page, hasPlan = true, actualBalance = false) {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { error: { message: 'Unmocked test API' } } }));
  await installRouteAuth(page);
  const financial = await installFinancialProfileRoutes(page, { profile: { revision: 3, schemaVersion: 2, data: {
    schemaVersion: 2, valuationDate: '2026-10-08', currency: 'VND', periodUnit: 'MONTH',
    personal: { birthMonth: { status: 'KNOWN', value: '1994-03' }, desiredRetirementMonth: { status: 'KNOWN', value: '2054-03' }, pensionStartMonth: { status: 'UNKNOWN' } },
    income: { status: 'KNOWN', entries: [{ id: 'income', kind: 'FIXED', label: 'Lương', basis: 'DISPOSABLE', amount: { status: 'KNOWN', value: '30000000' }, startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    expenses: { status: 'KNOWN', entries: [{ id: 'expense', category: 'ESSENTIAL', label: 'Sinh hoạt', amount: { status: 'KNOWN', value: '20000000' }, startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY' }] },
    assets: { status: 'KNOWN', entries: [] }, debts: { status: 'NOT_APPLICABLE', reason: 'Không có nợ' }, pension: { status: 'UNKNOWN' },
  } } });
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  const selection = {
    expectedProfileRevision: 3, policyVersionId: 'policy-journey', scenario: 'ADVERSE',
    templateId: 'balanced', answers: [{ questionId: 'q1', choiceId: 'hold' }],
    liquidityNeedMonths: 9, endMonth: '2079-12', monthlyExpenseToday: '17000000',
    monthlyContribution: '5000000', monthlyReserve: '2000000', terminalBalance: '100000000',
    retirementIncomeIds: ['pension'], retirementAdditionalExpenseIds: ['health'],
    housing: [{ assetId: 'house', amountScope: 'OWNERS_SHARE' }], debtStress: [],
    contributionTiming: 'START_OF_MONTH', surplusPolicy: 'EXPLICIT_DEPOSITS_ONLY',
    startOfMonthFunding: { confirmed: true, source: 'CURRENT_MONTH_DISPOSABLE_CASH_AVAILABLE_AT_START', monthlyAvailable: '5000000' },
  };
  const summary = {
    valuationDate: '2026-10-08', retirementMonth: '2054-03', endMonth: '2079-12',
    accumulationMonths: 330, retirementMonths: 310, initialRetirementCapital: '0',
    atRetirement: { requiredFund: '1000000000', projectedFund: '800000000', coveragePercent: '80' },
    retirementFundingShortfall: '200000000', excessAtRetirement: '0', futureMonthlyExpense: '30000000',
    plannedMonthlyContribution: '5000000', requiredConstantMonthlyContribution: '6000000', additionalMonthlyContribution: '1000000',
  };
  const preview = (input: any) => ({ status: 'READY', inputHash: JSON.stringify(input), modelVersion: 'retirement-monthly-v3', profileRevision: input.expectedProfileRevision, valuationDate: '2026-10-08', references: { policyVersionId: 'policy-journey' }, issues: [], warnings: [], selection: input, calculation: { summary: { ...summary, retirementMonth: input.whatIf?.retirementMonth ?? (financial.getProfile()!.data as any).personal.desiredRetirementMonth.value, endMonth: input.endMonth }, rows: [], netWorth: '0', limitations: [] } });
  let current: any = hasPlan ? { id: 'version-1', version: 1, profileRevision: 3, snapshotHash: 'test-hash', preview: preview(selection) } : null;
  if (current && actualBalance) current.preview.reforecast = { anchorMonth: '2026-09' };
  let revision = 1;
  const versions: any[] = current ? [current] : [];
  const calls: { kind: string; input: any }[] = [];
  const plan = () => ({ id: 'plan-journey', revision, currentVersionId: current?.id ?? null, current, profileChanged: false, actualSourceChanged: false });
  const policy = { id: 'policy-journey', version: 1, data: {
    questions: [{ id: 'q1', text: 'Khi giá giảm bạn làm gì?', dimension: 'LOSS_TOLERANCE', choices: [{ id: 'hold', label: 'Giữ khoản đầu tư', score: 1 }] }],
    scenarios: [], riskBands: [{ id: 'medium', label: 'Vừa phải' }], rules: [],
    templates: ['balanced', 'careful'].map(id => ({ id, label: id === 'balanced' ? 'Cân bằng' : 'Thận trọng', schedule: [], rebalance: { everyMonths: 12, turnoverCostPercent: '0' } })),
  } };
  await page.route('**/api/v1/me/portfolio-policies**', route => route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith('/policy-journey') ? policy : { status: 'AVAILABLE', items: [policy] } } }));
  await page.route('**/api/v1/me/portfolio-policies/preview', route => {
    const input = route.request().postDataJSON(); calls.push({ kind: 'portfolio', input });
    return route.fulfill({ json: { data: { assessment: { totalScore: 1, riskBandId: 'medium', selectedTemplateId: input.templateId ?? 'balanced', eligibleTemplateIds: ['balanced', 'careful'] }, scenarios: [] } } });
  });
  await page.route('**/api/v1/me/retirement/preview*', route => {
    const input = route.request().postDataJSON(); calls.push({ kind: 'preview', input });
    return route.fulfill({ json: { data: preview(input) } });
  });
  await page.route('**/api/v1/me/retirement/plans**', route => {
    const path = new URL(route.request().url()).pathname;
    const input = route.request().postDataJSON();
    if (path.endsWith('/simulate')) {
      calls.push({ kind: 'simulate', input: input.preview });
      return route.fulfill({ json: { data: { baseline: current.preview, candidate: preview(input.preview), comparison: { summary: {} } } } });
    }
    if (path.endsWith('/versions') && route.request().method() === 'POST') {
      const saved = { id: `version-${versions.length + 1}`, version: versions.length + 1, profileRevision: 3, preview: preview(input.preview) };
      versions.push(saved); revision++;
      return route.fulfill({ json: { data: { saved, planId: 'plan-journey', revision } } });
    }
    if (path.endsWith('/apply')) {
      current = versions.find(v => v.id === input.versionId); revision++;
      return route.fulfill({ json: { data: { planId: 'plan-journey', currentVersionId: current.id, revision } } });
    }
    if (path.endsWith('/report')) return route.fulfill({ json: { data: { version: current, profileChanged: false } } });
    return route.fulfill({ json: { data: path.endsWith('/plans') ? { items: hasPlan ? [plan()] : [] } : path.endsWith('/versions') ? { items: versions.map(v => ({ ...v, summary })) } : plan() } });
  });
  return { calls, selection, financial, preview, current };
}

test('current plan survives navigation; changing one simulation input preserves every other choice', async ({ page }) => {
  const { calls, selection } = await journey(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/user/plan');
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toHaveValue(/(5\.000\.000|5000000)/);
  await expect(page.getByRole('button', { name: 'Đầu mỗi tháng', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('main')).not.toContainText(/Infinity|NaN|Dự phóng chưa bao phủ hết tuổi thọ/);
  expect(calls.filter(c => c.kind === 'preview')).toHaveLength(0);
  await page.getByRole('link', { name: 'Thử thay đổi kế hoạch', exact: true }).click();
  await expect(page.getByLabel('Mức tích lũy mỗi tháng', { exact: true })).toHaveValue('5.000.000');
  await expect(page.getByLabel('Chi tiêu khi nghỉ hưu', { exact: true })).toHaveValue('17.000.000');
  expect(calls.filter(c => c.kind === 'simulate')).toHaveLength(0);
  await page.getByLabel('Chi tiêu khi nghỉ hưu', { exact: true }).fill('18000000');
  await expect.poll(() => calls.filter(c => c.kind === 'simulate').length).toBeGreaterThan(0);
  expect(calls.filter(c => c.kind === 'simulate').at(-1)!.input).toEqual({ ...selection, monthlyExpenseToday: '18000000' });
  await page.locator('.user-sidebar').getByRole('link', { name: 'Kế hoạch chi tiết', exact: true }).click();
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toHaveValue(/(5\.000\.000|5000000)/);
  expect(errors).toEqual([]);
});

test('goal edits reach the plan, then apply and reload retain the chosen contribution and expense', async ({ page }) => {
  const { calls } = await journey(page);
  await page.goto('/user/goal');
  const expense = page.locator('.goal-spending-field input');
  await expect(expense).toHaveValue('17.000.000');
  await expense.fill('19000000');
  await page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true }).click();
  await expect(page).toHaveURL(/\/user\/plan$/);
  await expect.poll(() => calls.filter(c => c.kind === 'preview').at(-1)?.input.monthlyExpenseToday).toBe('19000000');
  await page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)').fill('4000000');
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Lưu phương án này', exact: true }).click();
  await expect(page.getByText(/Bản xem trước này đã lưu/)).toBeVisible();
  await page.locator('.plan-hero-actions').getByRole('button', { name: /Dùng làm kế hoạch hiện tại/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dùng làm kế hoạch hiện tại', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toHaveValue(/(4\.000\.000|4000000)/);
  await page.getByRole('link', { name: 'Sửa mục tiêu', exact: true }).click();
  await expect(page.locator('.goal-spending-field input')).toHaveValue('19.000.000');
});

test('goal autosaves once after edits, keeps one action and restores the draft after reload', async ({ page }) => {
  const { financial } = await journey(page);
  const writes: any[] = [];
  page.on('request', request => { if (request.url().endsWith('/me/financial-profile') && request.method() === 'PATCH') writes.push(request.postDataJSON()); });
  await page.goto('/user/goal');
  await expect(page.locator('.goal-spending-field input')).toHaveValue('17.000.000');
  await expect(page.locator('.goal-summary-actions button')).toHaveCount(1);
  expect(writes).toHaveLength(0);
  await page.locator('#goal-target-age').fill('62');
  await page.locator('.goal-spending-field input').fill('19000000');
  await expect(page.locator('.goal-autosave-status')).toHaveText('Đã lưu thay đổi');
  expect(writes).toHaveLength(1);
  expect((financial.getProfile()!.data as any).personal.desiredRetirementMonth.value).toBe('2056-03');
  await page.reload();
  await expect(page.locator('#goal-target-age')).toHaveValue('62');
  await expect(page.locator('.goal-spending-field input')).toHaveValue('19.000.000');
  expect(writes).toHaveLength(1);
  await page.locator('.goal-summary-card').screenshot({ path: '../artifacts/goal-autosave-summary.png' });
});

test('goal autosave retains edits during an in-flight save and retries errors only on request', async ({ page }) => {
  const { financial } = await journey(page);
  let fail = false;
  let writes = 0;
  await page.route('**/api/v1/me/financial-profile', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes++;
    if (fail) return route.fulfill({ status: 409, json: { error: { message: 'Hồ sơ đã thay đổi ở nơi khác.' } } });
    const body = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 1100));
    const previous: any = financial.getProfile();
    const next = { ...previous, revision: previous.revision + 1, data: { ...previous.data, ...body.changes } };
    financial.setProfile(next);
    return route.fulfill({ json: { data: next } });
  });
  await page.goto('/user/goal');
  await expect(page.locator('#goal-target-age')).toHaveValue('60');
  await page.locator('#goal-target-age').fill('61');
  await expect.poll(() => writes).toBe(1);
  await expect(page.locator('#goal-target-age')).toBeEnabled();
  await page.locator('#goal-target-age').fill('63');
  await expect.poll(() => (financial.getProfile()!.data as any).personal.desiredRetirementMonth.value).toBe('2057-03');
  await expect(page.locator('.goal-autosave-status')).toHaveText('Đã lưu thay đổi');
  fail = true;
  await page.locator('#goal-target-age').fill('64');
  await expect(page.locator('.goal-autosave-status')).toHaveText('Thay đổi chưa được lưu');
  await expect(page.locator('#goal-target-age')).toHaveValue('64');
  fail = false;
  await page.getByRole('button', { name: 'Xem trước kế hoạch', exact: true }).click();
  await expect(page).toHaveURL(/\/user\/plan$/);
  expect((financial.getProfile()!.data as any).personal.desiredRetirementMonth.value).toBe('2058-03');
});

test('portfolio choice and liquidity reach the same plan horizon', async ({ page }) => {
  const { calls } = await journey(page);
  await page.goto('/user/risk-portfolio');
  await expect(page.getByLabel('Quỹ dự phòng (đủ chi tiêu bao nhiêu tháng)', { exact: true })).toHaveValue('9');
  await page.getByLabel('Quỹ dự phòng (đủ chi tiêu bao nhiêu tháng)', { exact: true }).fill('12');
  await page.getByRole('button', { name: 'Thận trọng', exact: true }).click();
  await page.getByRole('button', { name: 'Xem kế hoạch với các lựa chọn này', exact: true }).click();
  await expect.poll(() => calls.filter(c => c.kind === 'preview').at(-1)?.input.templateId).toBe('careful');
  const input = calls.filter(c => c.kind === 'preview').at(-1)!.input;
  expect(input.liquidityNeedMonths).toBe(12);
  expect(input.endMonth).toBe('2079-12');
});

test('without a plan, simulation explains the next step instead of inventing a baseline', async ({ page }) => {
  const { calls } = await journey(page, false);
  await page.goto('/user/simulation');
  await expect(page.getByText('Cần có kế hoạch đang dùng để so sánh')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở Kế hoạch', exact: true })).toBeVisible();
  expect(calls.filter(c => c.kind === 'simulate')).toHaveLength(0);
});

test('new plans require real survey answers and never auto-contribute the household surplus', async ({ page }) => {
  const { calls } = await journey(page, false);
  await page.goto('/user/plan');
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toHaveValue('0');
  await expect(page.getByText('Cần hoàn tất lựa chọn đầu tư')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeDisabled();
  await expect.poll(() => calls.filter(c => c.kind === 'preview').at(-1)?.input.endMonth).toBe('2079-03');
});

test('plan steps and contribution fields fit a small phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await journey(page);
  await page.goto('/user/plan');
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toHaveValue(/(5\.000\.000|5000000)/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const field = page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)');
  await field.scrollIntoViewIfNeeded();
  const box = await field.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('plan-mobile.png'), fullPage: true });
});

test('plans based on actual balances lead to actual tracking instead of resetting recorded money', async ({ page }) => {
  const { calls } = await journey(page, true, true);
  await page.goto('/user/plan');
  await expect(page.getByText('Giữ đúng số dư thực tế đã ghi')).toBeVisible();
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Mở Theo dõi thực tế để cập nhật' })).toHaveAttribute('href', '/user/simulation?tab=actuals');
  expect(calls.filter(c => c.kind === 'preview')).toHaveLength(0);
});

test('finishing onboarding resumes the page that requested a profile', async ({ page }) => {
  const { financial } = await journey(page, false);
  financial.setProfile(null);
  financial.setDraft({ revision: 2, step: 'summary', data: defaultMockProfile().data });
  await page.goto('/user/goal');
  await page.getByRole('link', { name: 'Bắt đầu khảo sát', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('button', { name: 'Hoàn tất hồ sơ', exact: true }).click();
  await expect(page).toHaveURL(/\/user\/goal$/);
});

test('a detailed profile opens its editor and retains the incompatible survey for review', async ({ page }) => {
  const { financial } = await journey(page, false);
  const profile = structuredClone(financial.getProfile());
  const draft = { revision: 2, step: 'summary', data: defaultMockProfile().data, updatedAt: '2026-10-12T12:00:00Z' };
  financial.setDraft(draft);
  const writes: string[] = [];
  page.on('request', request => { if (/\/me\/(onboarding|financial-profile)/.test(request.url()) && request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Cập nhật hồ sơ tài chính đang có' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hoàn tất hồ sơ', exact: true })).toHaveCount(0);
  await page.getByText('Xem lại bản nháp khảo sát đã lưu', { exact: true }).click();
  await expect(page.locator('dl')).toContainText('2.000.000.000 VND');
  await page.getByRole('link', { name: 'Mở Hồ sơ tài chính', exact: true }).click();
  await expect(page).toHaveURL(/\/user\/account\?tab=profile$/);
  await expect(page.getByRole('heading', { name: 'Hồ sơ tài chính cá nhân' })).toBeVisible();
  expect(writes).toEqual([]);
  expect(financial.getProfile()).toEqual(profile);
  expect(financial.getDraft()).toEqual(draft);
});

test('a profile upgraded in another tab recovers from schema conflict without retrying or deleting the draft', async ({ page }) => {
  const { financial } = await journey(page, false);
  const detailed = structuredClone(financial.getProfile());
  financial.setProfile(defaultMockProfile());
  financial.setDraft({ revision: 2, step: 'summary', data: defaultMockProfile().data });
  let completions = 0;
  await page.route('**/api/v1/me/onboarding/complete', route => {
    completions++;
    financial.setProfile(detailed);
    return route.fulfill({ status: 409, json: { error: { code: 'PROFILE_SCHEMA_MISMATCH', message: 'Không thể ghi đè hồ sơ mới bằng bản nháp phiên bản cũ.' } } });
  });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Hoàn tất hồ sơ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cập nhật hồ sơ tài chính đang có' })).toBeVisible();
  await page.getByText('Xem lại bản nháp khảo sát đã lưu', { exact: true }).click();
  await expect(page.locator('dl')).toContainText('2.000.000.000 VND');
  expect(completions).toBe(1);
  expect(financial.getProfile()).toEqual(detailed);
  expect(financial.getDraft().data.assets).toEqual(defaultMockProfile().data.assets);
});

test('debt budget is reserved outside the retirement fund without inventing a repayment', async ({ page }) => {
  const { financial, calls } = await journey(page);
  const profile = financial.getProfile();
  profile.data.debts = { status: 'KNOWN', entries: [{
    id: 'loan', label: 'Vay tiêu dùng', currency: 'VND',
    outstandingBalance: { status: 'KNOWN', value: '100000000' }, balanceAsOf: { status: 'KNOWN', value: '2026-10-08' },
    payment: { status: 'KNOWN', value: '1000000' }, balanceShare: { status: 'KNOWN', value: '1' }, paymentShare: { status: 'KNOWN', value: '1' },
    contract: { status: 'UNKNOWN' }, responsibility: { status: 'UNKNOWN' }, startMonth: '2026-01', endMonth: null, frequency: 'MONTHLY',
  }] };
  financial.setProfile(profile);
  await page.route('**/api/v1/me/debts/preview', route => route.fulfill({ json: { data: { status: 'INCOMPLETE', baseline: null, alternatives: [], issues: [], warnings: [], limitations: [], capital: {} } } }));
  await page.goto('/user/debts');
  await page.getByLabel('Ngân sách trả nợ thêm mỗi tháng (VND)', { exact: true }).fill('3000000');
  await page.getByRole('button', { name: 'Giữ riêng ngân sách này và xem kế hoạch hưu trí' }).click();
  await expect(page).toHaveURL(/\/user\/plan$/);
  await expect.poll(() => calls.filter(c => c.kind === 'preview').at(-1)?.input.monthlyReserve).toBe('5000000');
  expect(calls.filter(c => c.kind === 'preview').at(-1)!.input.monthlyContribution).toBe('5000000');
  expect(financial.getProfile().data.debts.entries[0].outstandingBalance.value).toBe('100000000');
});

test('profile changes recalculate once and share the result across overview, goals and plan', async ({ page }, testInfo) => {
  const { calls, financial, current, selection } = await journey(page);
  current.preview.selection = { ...selection, whatIf: { retirementMonth: '2054-03' } };
  const profile: any = financial.getProfile();
  financial.setProfile({ ...profile, revision: 4, data: { ...profile.data, personal: { ...profile.data.personal, desiredRetirementMonth: { status: 'KNOWN', value: '2056-03' } } } });
  const writes: string[] = [];
  page.on('request', req => { if (req.method() === 'POST' && /\/plans.*\/(versions|apply)/.test(req.url())) writes.push(req.url()); });
  await page.goto('/user/dashboard');
  await expect(page.locator('.plan-sync-status')).toContainText('Đã tính theo hồ sơ hiện tại');
  await expect(page.locator('.user-cockpit-card')).toContainText('03/2056');
  expect(calls.filter(c => c.kind === 'preview')).toHaveLength(1);
  expect(calls.find(c => c.kind === 'preview')!.input).toEqual({ ...selection, expectedProfileRevision: 4 });
  await page.locator('.user-sidebar').getByRole('link', { name: 'Mục tiêu nghỉ hưu', exact: true }).click();
  await expect(page.locator('#goal-target-age')).toHaveValue('62');
  await expect(page.locator('.plan-sync-status')).toContainText('Đã tính theo hồ sơ hiện tại');
  await page.locator('.user-sidebar').getByRole('link', { name: 'Kế hoạch chi tiết', exact: true }).click();
  await expect(page.locator('.plan-sync-status')).toContainText('Đã tính theo hồ sơ hiện tại');
  await expect(page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)')).toHaveValue(/(5\.000\.000|5000000)/);
  await expect(page.getByText('Hồ sơ đã thay đổi', { exact: true })).toHaveCount(0);
  expect(calls.filter(c => c.kind === 'preview')).toHaveLength(1);
  expect(writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profile-synchronized-plan.png'), fullPage: true });
});

test('failed or incomplete recalculation never presents the old forecast as current', async ({ page }) => {
  const { financial } = await journey(page);
  financial.setProfile({ ...financial.getProfile(), revision: 4 });
  let attempts = 0;
  await page.route('**/api/v1/me/retirement/preview*', route => {
    attempts++;
    return route.fulfill(attempts === 1
      ? { status: 503, json: { error: { message: 'Tạm thời không thể tính kế hoạch.' } } }
      : { json: { data: { status: 'INCOMPLETE', issues: [{ code: 'BIRTH_MONTH_REQUIRED', path: 'personal.birthMonth' }], warnings: [], selection: route.request().postDataJSON() } } });
  });
  await page.goto('/user/dashboard');
  await expect(page.locator('.plan-sync-status')).toContainText('Chưa cập nhật được số liệu');
  await expect(page.locator('.user-cockpit-card')).not.toContainText('800.000.000');
  expect(attempts).toBe(1);
  await page.locator('.plan-sync-status').getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.locator('.plan-sync-status')).toContainText('Cần bổ sung thông tin');
  await page.getByRole('link', { name: 'Xem mục cần bổ sung', exact: true }).click();
  await expect(page.getByText('Dữ liệu chưa hoàn tất', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeDisabled();
  expect(attempts).toBe(2);
});

test('late preview responses cannot replace newer edits and asset assumptions are retained', async ({ page }) => {
  const { current, selection, preview } = await journey(page);
  current.preview.selection = { ...selection, whatIf: { assetValues: [{ assetId: 'house', value: '900000000' }] } };
  const requests: any[] = [];
  let release: (() => void) | undefined;
  await page.route('**/api/v1/me/retirement/preview*', async route => {
    const input = route.request().postDataJSON(); requests.push(input);
    if (input.monthlyContribution === '4000000') await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { data: preview(input) } });
  });
  await page.goto('/user/plan');
  const contribution = page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)');
  await expect(contribution).toHaveValue(/(5\.000\.000|5000000)/);
  await contribution.fill('4000000');
  await expect.poll(() => Boolean(release)).toBe(true);
  await contribution.fill('3000000');
  await expect(page.getByRole('button', { name: 'Lưu phương án này', exact: true })).toBeEnabled();
  release!();
  await page.getByRole('button', { name: 'Lưu phương án này', exact: true }).click();
  await expect(page.getByText(/Bản xem trước này đã lưu/)).toBeVisible();
  expect(requests.at(-1).monthlyContribution).toBe('3000000');
  expect(requests.at(-1).whatIf.assetValues).toEqual([{ assetId: 'house', value: '900000000' }]);
  await expect(contribution).toHaveValue(/(3\.000\.000|3000000)/);
});

test('cashflow table explains amounts, opens monthly details and jumps to milestones without losing CSV export', async ({ page }) => {
  const { current } = await journey(page);
  current.preview.calculation.summary.retirementMonth = '2027-10';
  current.preview.calculation.summary.firstShortfallMonth = '2027-01';
  current.preview.calculation.rows = Array.from({ length: 25 }, (_, i) => {
    const month = `${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, '0')}`;
    return { month, phase: month < '2027-10' ? 'ACCUMULATION' : 'RETIREMENT', income: '8000000', pension: '0', livingExpense: '12000000', additionalExpense: '500000', debtPayment: i < 4 ? '300000000' : '0', plannedContribution: '0', contribution: '0', contributionCapacity: '0', budgetShortfall: '0', withdrawal: i < 4 ? '304000000' : '4000000', netWithdrawal: '304000000', uninvestedSurplus: '0', capitalInjection: '0', openingBalance: '1000000000', investmentChange: i < 4 ? '4943703' : '-1014492', closingBalance: i < 3 ? '700943703' : '-205124210', fundedClosingBalance: i < 3 ? '700943703' : '0', unfundedWithdrawal: i < 3 ? '0' : '205124210', requiredOpeningBalance: '2300000000', requiredClosingBalance: '2289183695', growthFactor: '1', inflationFactor: '1' };
  });
  let exports = 0;
  await page.route('**/api/v1/me/retirement/plans/**/export*', route => {
    exports++;
    return route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename="cashflow.csv"' }, body: 'Month,Income\n2026-10,8000000\n' });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/user/plan');
  const table = page.locator('.monthly-cashflow-table-component');
  await expect(table.getByRole('columnheader')).toHaveCount(6);
  await expect(table.locator('tbody > tr:visible')).toHaveCount(12);
  await expect(table).toContainText('không phải số nợ thực tế');
  await expect(table.getByRole('columnheader', { name: 'Thực góp', exact: true })).toHaveCount(0);
  await table.getByRole('button', { name: 'Chi tiết 10/2026', exact: true }).click();
  const details = table.locator('.cashflow-month-detail');
  await expect(details).toContainText('Chi phí sinh hoạt');
  await expect(details).toContainText('300.000.000');
  await expect(details).toContainText('500.000');
  await expect(details).toContainText('2.289.183.695');
  await details.screenshot({ path: '../artifacts/cashflow-table-detail-desktop.png' });
  await expect(table.getByRole('button', { name: 'Ẩn chi tiết 10/2026', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await table.getByRole('button', { name: 'Ẩn chi tiết 10/2026', exact: true }).press('Enter');
  await expect(details).toHaveCount(0);
  await table.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(table.locator('tbody > tr:visible').first()).toContainText('10/2027');
  await table.getByRole('button', { name: /Bắt đầu thiếu quỹ 01\/2027/ }).click();
  await expect(table.getByRole('combobox', { name: 'Lọc năm' })).toHaveValue('2027');
  await expect(table.getByRole('button', { name: 'Ẩn chi tiết 01/2027', exact: true })).toBeFocused();
  await expect(table.locator('.cashflow-first-shortfall')).toContainText('-205.124.210');
  await expect(table.locator('.cashflow-first-shortfall')).toContainText('Dự tính còn thiếu');
  await table.getByRole('button', { name: /Bắt đầu nghỉ hưu 10\/2027/ }).click();
  await expect(table.getByRole('button', { name: 'Ẩn chi tiết 10/2027', exact: true })).toBeFocused();
  await table.getByRole('combobox', { name: 'Lọc năm' }).selectOption('2026');
  await expect(table.locator('tbody > tr:visible')).toHaveCount(3);
  const download = page.waitForEvent('download');
  await table.getByRole('button', { name: 'Xuất file CSV', exact: true }).click();
  await download; expect(exports).toBe(1);
  await table.getByRole('combobox', { name: 'Lọc năm' }).selectOption('ALL');
  await table.scrollIntoViewIfNeeded();
  await table.screenshot({ path: '../artifacts/cashflow-table-desktop.png' });
  const scroll = table.locator('.cashflow-ledger-scroll');
  expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await table.getByRole('button', { name: 'Chi tiết 10/2026', exact: true }).click();
  await expect(details).toContainText('Thu nhập & chi tiêu');
  const labelBox = await details.locator('dt').first().boundingBox();
  expect(labelBox!.x).toBeGreaterThanOrEqual(0);
  expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(390);
  await table.screenshot({ path: '../artifacts/cashflow-table-mobile.png' });
});
