import { expect, test } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

async function openDashboard(page: import('@playwright/test').Page, viewport = 1440) {
  await page.setViewportSize({ width: viewport, height: 900 });
  await installRouteAuth(page);
  await installFinancialProfileRoutes(page, { profile: defaultMockProfile() });
  await page.route('**/api/v1/me/explanations/glossary', route => route.fulfill({ json: { data: { version: 'test-v1', terms: [{ key: 'fundCoverage', label: { vi: 'Độ phủ quỹ', en: 'Fund coverage' }, definition: { vi: 'Phần quỹ dự kiến so với quỹ cần có.', en: 'Projected fund compared with the required fund.' } }, { key: 'glidePath', label: { vi: 'Lộ trình giảm dần rủi ro', en: 'Risk reduction path' }, definition: { vi: 'Cách giảm dần mức rủi ro khi gần đến tuổi nghỉ hưu.', en: 'A way to gradually reduce risk as retirement approaches.' } }] } } }));
  await page.route('**/api/v1/me/retirement/plans**', route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route('**/api/v1/me/notifications**', route => route.fulfill({ json: { data: { items: [], unread: 0, total: 0, page: 1, limit: 25 } } }));
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.goto('/user/dashboard');
  await expect(page.locator('.user-hero-title')).toBeVisible();
  return page.getByRole('button', { name: 'Trợ lý AI', exact: true });
}

test('explain mode toggles from the header, supports Escape and leaves targets inert while off', async ({ page }) => {
  const button = await openDashboard(page);
  await expect(page.getByText('Chạm vào cụm từ hoặc con số để xem giải thích')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Chạm vào cụm từ hoặc con số để xem giải thích/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('glossary phrase opens a keyboard-accessible dialog and returns focus on Escape at mobile width', async ({ page }) => {
  const button = await openDashboard(page, 375);
  await button.click();
  await page.goto('/user/risk-portfolio');
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  const target = page.getByRole('button', { name: 'lộ trình giảm dần rủi ro' });
  await expect(target).toBeVisible();
  await target.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Cách giảm dần mức rủi ro khi gần đến tuổi nghỉ hưu.');
  const bounds = await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, css: getComputedStyle(el).position, inline: (el as HTMLElement).style.cssText, scrollY }; });
  expect(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, JSON.stringify(bounds)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(target).toBeFocused();
});

const consentedPrivacy = { revision: 5, processing: true, saveHistory: false, policyVersion: 'policy-v1', acceptedPolicyVersion: 'policy-v1', retentionDays: 30, purpose: 'explain', providerData: [], excludedData: [], historyPolicy: 'optional', providerConfigured: true, reconsentRequired: false };

async function selectText(page: import('@playwright/test').Page, text: string) {
  // Put the phrase on the page, select it and release the pointer like a user drag would.
  await page.evaluate(value => {
    const holder = document.createElement('p'); holder.id = 'selection-fixture'; holder.textContent = value;
    document.querySelector('main')?.prepend(holder);
    const range = document.createRange(); range.selectNodeContents(holder);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, text);
}

test('selected unknown phrase checks AI consent automatically and sends no question before consent', async ({ page }) => {
  const button = await openDashboard(page);
  let explainRequests = 0;
  await page.route('**/api/v1/me/ai/privacy', route => route.fulfill({ json: { data: { ...consentedPrivacy, processing: false, acceptedPolicyVersion: null } } }));
  await page.route('**/api/v1/me/ai/explain', route => { explainRequests++; return route.fulfill({ json: { data: {} } }); });
  await button.click();
  await page.getByRole('heading', { name: 'Tổng quan' }).evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  const popup = page.getByRole('dialog');
  await expect(popup).toContainText('Để AI giải thích, hãy mở trang Trợ lý AI và đồng ý xử lý trước.');
  await expect(popup.getByRole('button', { name: /Nhờ AI giải thích/ })).toHaveCount(0);
  expect(explainRequests).toBe(0);
});

test('selected unknown phrase is explained by AI without an extra click, once per selection', async ({ page }) => {
  const button = await openDashboard(page);
  const questions: string[] = [];
  await page.route('**/api/v1/me/ai/privacy', route => route.fulfill({ json: { data: consentedPrivacy } }));
  await page.route('**/api/v1/me/ai/explain', route => { questions.push(route.request().postDataJSON().question); return route.fulfill({ json: { data: { status: 'AI_ASSISTED', answer: 'Đây là phần tiền bạn để riêng cho chi tiêu bất ngờ.', facts: [], citations: [], provenance: null, knowledgeStatus: 'AVAILABLE', nextAction: '', applied: false, savedHistory: false, conversationId: null } } }); });
  await button.click();
  await selectText(page, 'quỹ dự phòng khẩn cấp');
  const popup = page.getByRole('dialog');
  await expect(popup.getByRole('heading')).toHaveText('“quỹ dự phòng khẩn cấp”');
  await expect(popup).toContainText('Đây là phần tiền bạn để riêng cho chi tiêu bất ngờ.');
  await expect(popup).toContainText('AI giải thích – tham khảo');
  await expect(popup.getByRole('button', { name: /Nhờ AI giải thích/ })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(questions).toEqual(['Giải thích cụm từ: quỹ dự phòng khẩn cấp']);
});

test('selected glossary phrase shows the curated definition immediately without calling AI', async ({ page }) => {
  const button = await openDashboard(page);
  let aiCalls = 0;
  await page.route('**/api/v1/me/ai/**', route => { aiCalls++; return route.fulfill({ json: { data: consentedPrivacy } }); });
  await button.click();
  await selectText(page, 'ĐỘ PHỦ QUỸ (Fund coverage)');
  const popup = page.getByRole('dialog');
  await expect(popup.getByRole('heading')).toHaveText('Độ phủ quỹ');
  await expect(popup).toContainText('Phần quỹ dự kiến so với quỹ cần có.');
  await expect(popup).not.toContainText('AI giải thích – tham khảo');
  await popup.screenshot({ animations: 'disabled', path: 'test-results/explanation-glossary.png' });
  await page.waitForTimeout(300);
  expect(aiCalls).toBe(0);
});

test('a long selected passage waits for an explicit AI request', async ({ page }) => {
  const button = await openDashboard(page);
  let explainRequests = 0;
  await page.route('**/api/v1/me/ai/privacy', route => route.fulfill({ json: { data: consentedPrivacy } }));
  await page.route('**/api/v1/me/ai/explain', route => { explainRequests++; return route.fulfill({ json: { data: { status: 'AI_ASSISTED', answer: 'Tóm tắt đoạn văn.', facts: [], citations: [], provenance: null, knowledgeStatus: 'AVAILABLE', nextAction: '', applied: false, savedHistory: false, conversationId: null } } }); });
  await button.click();
  await selectText(page, 'Kế hoạch nghỉ hưu cần được xem lại định kỳ. '.repeat(10));
  const popup = page.getByRole('dialog');
  const ask = popup.getByRole('button', { name: 'Nhờ AI giải thích đoạn này' });
  await expect(ask).toBeVisible();
  await page.waitForTimeout(300);
  expect(explainRequests).toBe(0);
  await ask.click();
  await expect(popup).toContainText('Tóm tắt đoạn văn.');
  expect(explainRequests).toBe(1);
});

for (const width of [375, 1280, 1440, 1920]) test(`long AI explanation remains readable and scrollable at ${width}px`, async ({ page }) => {
  const button = await openDashboard(page, width);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const paragraphs = Array.from({ length: 12 }, (_, i) => `Ý ${i + 1}: quỹ dự phòng là khoản tiền bạn để riêng cho những chi phí bất ngờ. Khoản này giúp bạn chủ động hơn khi thu nhập hoặc chi tiêu thay đổi lần ${i + 1}.`);
  await page.route('**/api/v1/me/ai/privacy', route => route.fulfill({ json: { data: consentedPrivacy } }));
  await page.route('**/api/v1/me/ai/explain', route => route.fulfill({ json: { data: { status: 'AI_ASSISTED', answer: paragraphs.join('\n\n'), facts: [], citations: [{ title: 'Tài liệu tham khảo kiểm thử', url: null }], provenance: null, knowledgeStatus: 'AVAILABLE', nextAction: '', applied: false, savedHistory: false, conversationId: null } } }));
  await button.click();
  await selectText(page, 'quỹ dự phòng khẩn cấp');
  const popup = page.getByRole('dialog');
  // Long answers open with a bold one-sentence summary; extra points sit behind "Xem thêm".
  await expect(popup.locator('.explain-summary')).toHaveText('Ý 1: quỹ dự phòng là khoản tiền bạn để riêng cho những chi phí bất ngờ.');
  await expect(popup).toBeFocused();
  await popup.getByText(/^Xem thêm \d+ ý$/).click();
  await expect(popup.locator('.explain-answer')).toContainText('thay đổi lần 12.');
  await page.screenshot({ animations: 'disabled', path: `test-results/explanation-ai-${width}.png` });
  const body = popup.locator('.explain-body');
  expect(await body.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  await body.hover(); await page.mouse.wheel(0, 450);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(popup.getByRole('button', { name: 'Đóng giải thích' })).toBeVisible();
  await expect(popup.getByRole('link', { name: 'Hỏi thêm Trợ lý AI' })).toBeVisible();
  await popup.getByText('Nguồn tham khảo').click();
  await expect(popup.getByText('Tài liệu tham khảo kiểm thử')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
});

for (const width of [375, 1440]) test(`metric details preserve popup scrolling and monthly dialog keyboard navigation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const { setupPlanning } = await import('./planning-contract-fixtures');
  const { errors } = await setupPlanning(page);
  const metric = {
    metricKey: 'summary.atRetirement.requiredFund', label: { vi: 'Quỹ cần có khi nghỉ hưu', en: 'Required retirement fund' }, value: '1000000000', unit: 'VND',
    formula: { vi: 'Số vốn cần có để đáp ứng các khoản chi trong thời gian nghỉ hưu, theo giả định của kế hoạch.', en: 'Capital needed for retirement spending under the plan assumptions.', symbolic: 'K = Σ (chi tiêu − thu nhập) / hệ số tích lũy' },
    steps: Array.from({ length: 12 }, (_, i) => ({ label: { vi: `Chi tiêu tháng ${i + 1}`, en: `Spending month ${i + 1}` }, value: '25000000', unit: 'VND', source: `rows[${i}].expense` })),
    assumptions: { version: 3, sources: [] }, notes: ['Xem chi tiết từng tháng để đối chiếu cách tính.'], limitations: ['Kết quả phụ thuộc các giả định của kế hoạch.'],
  };
  const details: string[] = [];
  await page.route('**/api/v1/me/explanations/glossary', r => r.fulfill({ json: { data: { version: 'test-v1', terms: [] } } }));
  await page.route('**/api/v1/me/explanations/metric', r => {
    details.push(r.request().postDataJSON().detail);
    return r.fulfill({ json: { data: r.request().postDataJSON().detail === 'MONTHLY' ? { ...metric, steps: Array.from({ length: 100 }, (_, i) => ({ ...metric.steps[i % 12], source: `rows[${i}].expense` })) } : metric } });
  });
  await page.goto('/user/plan');
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  const target = page.locator('.explain-target').filter({ hasText: '1.000.000.000' }).first();
  await target.focus(); await page.keyboard.press('Enter');
  const popup = page.locator('.explain-popup');
  await expect(popup.locator('.explain-value')).toContainText('1.000.000.000');
  expect(await popup.locator('td').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  await page.screenshot({ animations: 'disabled', path: `test-results/explanation-metric-${width}.png` });
  const body = popup.locator('.explain-body');
  await body.hover(); await page.mouse.wheel(0, 500);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await popup.locator('summary').click();
  await expect(popup.getByText('Phiên bản giả định: 3')).toBeVisible();
  const monthlyButton = popup.getByRole('button', { name: 'Xem chi tiết từng tháng' });
  await monthlyButton.click();
  const monthly = page.getByRole('dialog', { name: 'Chi tiết phép tính theo tháng' });
  await expect(monthly).toBeVisible();
  await expect(monthly.getByRole('button', { name: 'Đóng modal' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(monthly.getByRole('region')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(monthly.getByRole('button', { name: 'Đóng modal' })).toBeFocused();
  await monthly.getByRole('region').hover(); await page.mouse.wheel(0, 700);
  await expect.poll(() => monthly.getByRole('region').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ animations: 'disabled', path: `test-results/explanation-monthly-${width}.png` });
  await page.keyboard.press('Escape');
  await expect(monthly).toHaveCount(0);
  await expect(popup).toBeVisible();
  await expect(monthlyButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(target).toBeFocused();
  // Reopening both levels reuses the same source, rather than POSTing again.
  await target.focus(); await page.keyboard.press('Enter');
  await expect(popup.locator('.explain-value')).toContainText('1.000.000.000');
  await monthlyButton.click(); await expect(monthly).toBeVisible();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  expect(details).toEqual(['SUMMARY', 'MONTHLY']);
  expect(errors).toEqual([]);
});

test('bundled fixed labels work repeatedly without AI even if the glossary is unavailable, in both languages', async ({ page }) => {
  const button = await openDashboard(page);
  let aiCalls = 0;
  await page.route('**/api/v1/me/explanations/glossary', r => r.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } } }));
  await page.route('**/api/v1/me/ai/**', r => { aiCalls++; return r.abort(); });
  await button.click();
  const target = page.getByRole('button', { name: 'Tiền còn lại mỗi tháng', exact: true });
  for (let i = 0; i < 3; i++) {
    await target.click();
    await expect(page.getByRole('dialog')).toContainText('Khoản còn lại chưa tự trở thành tiền góp');
    await page.keyboard.press('Escape');
  }
  await target.click();
  await expect(page.getByRole('dialog')).toContainText('Khoản còn lại chưa tự trở thành tiền góp');
  await page.evaluate(() => window.scrollBy(0, 80));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Chuyển sang Tiếng Anh (English)' }).click();
  await selectText(page, 'Monthly surplus');
  await expect(page.getByRole('dialog')).toContainText('The remainder is not automatically contributed');
  expect(aiCalls).toBe(0);
});

test('glossary aliases use prepared definitions and toggling mode reuses the glossary', async ({ page }) => {
  const button = await openDashboard(page);
  const explanationGlossary = { version: 'fixture-v2', terms: [
    { key: 'emergencyReserve', label: { vi: 'Dự phòng khẩn cấp', en: 'Emergency reserve' }, definition: { vi: 'Phần vốn để ứng phó khi thu nhập gián đoạn hoặc phát sinh nhu cầu cấp bách.', en: 'Capital set aside for interrupted income or urgent needs.' } },
    { key: 'glidePath', label: { vi: 'Lộ trình giảm dần rủi ro', en: 'Glide path' }, definition: { vi: 'Lịch thay đổi tỷ trọng các nhóm tài sản theo thời gian còn lại tới nghỉ hưu.', en: 'A schedule of asset weights based on time remaining until retirement.' } },
  ] };
  let glossaryCalls = 0, aiCalls = 0;
  await page.route('**/api/v1/me/explanations/glossary', r => { glossaryCalls++; return r.fulfill({ json: { data: explanationGlossary } }); });
  await page.route('**/api/v1/me/ai/**', r => { aiCalls++; return r.abort(); });
  for (let i = 0; i < 3; i++) {
    await button.click();
    await selectText(page, 'quỹ dự phòng khẩn cấp');
    await expect(page.getByRole('dialog')).toContainText('Phần vốn để ứng phó khi thu nhập gián đoạn');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  expect(glossaryCalls).toBe(1);
  expect(aiCalls).toBe(0);
});

test('missing fixed keys never call AI and failed glossary can be retried', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/user/risk-portfolio');
  let failed = false, aiCalls = 0;
  await page.route('**/api/v1/me/explanations/glossary', r => failed
    ? r.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Unavailable' } } })
    : r.fulfill({ json: { data: { version: 'empty', terms: [] } } }));
  await page.route('**/api/v1/me/ai/**', r => { aiCalls++; return r.abort(); });
  const button = page.getByRole('button', { name: 'Trợ lý AI', exact: true });
  await button.click();
  await page.getByRole('button', { name: 'lộ trình giảm dần rủi ro' }).click();
  await expect(page.getByRole('dialog')).toContainText('Nhãn này chưa có nội dung giải thích viết sẵn.');
  expect(aiCalls).toBe(0);
  failed = true;
  await page.reload(); await button.click();
  await page.getByRole('button', { name: 'lộ trình giảm dần rủi ro' }).click();
  await expect(page.getByRole('dialog')).toContainText('Chưa tải được bảng thuật ngữ');
  const explanationGlossary = { version: 'fixture-v2', terms: [
    { key: 'emergencyReserve', label: { vi: 'Dự phòng khẩn cấp', en: 'Emergency reserve' }, definition: { vi: 'Phần vốn để ứng phó khi thu nhập gián đoạn hoặc phát sinh nhu cầu cấp bách.', en: 'Capital set aside for interrupted income or urgent needs.' } },
    { key: 'glidePath', label: { vi: 'Lộ trình giảm dần rủi ro', en: 'Glide path' }, definition: { vi: 'Lịch thay đổi tỷ trọng các nhóm tài sản theo thời gian còn lại tới nghỉ hưu.', en: 'A schedule of asset weights based on time remaining until retirement.' } },
  ] };
  await page.route('**/api/v1/me/explanations/glossary', r => r.fulfill({ json: { data: explanationGlossary } }));
  await page.getByRole('button', { name: 'Tải lại thuật ngữ' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lịch thay đổi tỷ trọng các nhóm tài sản');
  expect(aiCalls).toBe(0);
});

test('metric cache retries failures, discards a popup when input changes and fetches the new source', async ({ page }) => {
  const { setupPlanning } = await import('./planning-contract-fixtures');
  await setupPlanning(page);
  let fail = true;
  const requests: any[] = [];
  await page.route('**/api/v1/me/explanations/glossary', r => r.fulfill({ json: { data: { version: 'test', terms: [] } } }));
  await page.route('**/api/v1/me/explanations/metric', r => {
    requests.push(r.request().postDataJSON());
    return fail ? r.fulfill({ status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Wait' } } }) : r.fulfill({ json: { data: {
      metricKey: 'summary.atRetirement.requiredFund', label: { vi: 'Quỹ cần có khi nghỉ hưu', en: 'Required retirement fund' }, value: '1000000000', unit: 'VND',
      formula: { vi: 'Cách tính theo phương án.', en: 'Calculation for this option.' }, steps: [], assumptions: { version: 3, sources: [] }, notes: [], limitations: [],
    } } });
  });
  await page.goto('/user/plan');
  await page.getByRole('button', { name: 'Trợ lý AI', exact: true }).click();
  const target = page.locator('.result-total .explain-target');
  await target.click();
  await expect(page.getByRole('dialog')).toContainText('Bạn thao tác hơi nhanh');
  await page.keyboard.press('Escape'); fail = false;
  await target.click();
  await expect(page.getByRole('dialog')).toContainText('Cách tính theo phương án.');
  await page.keyboard.press('Escape');
  await target.click();
  await expect(page.getByRole('dialog')).toContainText('Cách tính theo phương án.');
  expect(requests).toHaveLength(2);
  await page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)', { exact: true }).fill('3000000');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => page.getByLabel('Tiền bạn chọn góp hưu trí mỗi tháng (đồng)', { exact: true }).inputValue()).toBe('3000000');
  await target.click();
  await expect(page.getByRole('dialog')).toContainText('Cách tính theo phương án.');
  expect(requests).toHaveLength(3);
  expect(requests[2].source.input.monthlyContribution).toBe('3000000');
  expect(requests[1].source.input.monthlyContribution).toBe('2000000');
});
