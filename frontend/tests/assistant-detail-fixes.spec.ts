import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';
import { createRequire } from 'node:module';
const { explanationSchema } = createRequire(import.meta.url)('../../backend/src/modules/ai/schema.ts');

async function setupAssistant(page: Page, options: { noPlan?: boolean; draftPlan?: boolean; saveHistory?: boolean; privacyError?: boolean; noProvider?: boolean; processing?: boolean; reconsent?: boolean; privacyDelay?: number } = {}) {
  await installRouteAuth(page);
  const profile = defaultMockProfile();
  await installFinancialProfileRoutes(page, { profile });
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());

  const version = {
    id: '00000000-0000-4000-8000-000000000002',
    planId: '00000000-0000-4000-8000-000000000001',
    version: 1,
    preview: {
      status: 'READY',
      calculation: {
        summary: {
          valuationDate: '2026-10-08',
          retirementMonth: '2054-10',
          endMonth: '2074-10',
          futureMonthlyExpense: '20000000',
          requiredConstantMonthlyContribution: null,
          savingsStatus: 'NORMAL',
          atRetirement: { projectedFund: '3000000000', requiredFund: '5000000000', coveragePercent: '60' },
          retirementFundingShortfall: '2000000000',
        },
        annualProjections: [],
      },
      selection: {monthlyContribution: '0', monthlyExpenseToday: '10000000', endMonth: '2074-10'},
    },
  };
  const plan = { id: version.planId, currentVersionId: options.draftPlan ? null : version.id, revision: 1, current: options.draftPlan ? null : version };

  await page.route('**/api/v1/me/retirement/plans**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/plans')) {
      return route.fulfill({ json: { data: { items: options.noPlan ? [] : [plan], total: options.noPlan ? 0 : 1, limit: 50, page: 1 } } });
    }
    return route.fulfill({ json: { data: plan } });
  });

  await page.route('**/api/v1/me/ai/privacy', async route => {
    if (options.privacyDelay) await new Promise(resolve => setTimeout(resolve, options.privacyDelay));
    if (options.privacyError) {
      return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Dịch vụ AI tạm gián đoạn.' } } });
    }
    return route.fulfill({
      json: {
        data: {
          processing: options.processing ?? true,
          saveHistory: options.saveHistory ?? true,
          policyVersion: '2026-04-01',
          acceptedPolicyVersion: '2026-04-01',
          revision: 1,
          processingNotice: 'Dữ liệu được gửi tới Google Gemini qua dịch vụ Google bên ngoài hệ thống.',
          providerConfigured: !options.noProvider,
          reconsentRequired: options.reconsent ?? false,
        },
      },
    });
  });

  await page.route('**/api/v1/me/ai/conversations**', route => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { data: { id: '00000000-0000-4000-8000-000000000003', revision: 0, title: 'Hội thoại', expiresAt: '2026-11-12T00:00:00Z' } } });
    return route.fulfill({ json: { data: { items: [], total: 0, limit: 20, page: 1 } } });
  });

  await page.goto('/user/assistant');
  await expect(page.locator('.ai-chat-header')).toBeVisible();
  await expect(page.locator('.anhuu-loading')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

for (const state of ['none', 'draft', 'applied'] as const) {
  test(`assistant sends valid API context with ${state} plan and saves the first message`, async ({ page }) => {
    await setupAssistant(page, { noPlan: state === 'none', draftPlan: state === 'draft' });
    const commands: any[] = [];
    await page.route('**/api/v1/me/ai/explain', route => {
      const body = route.request().postDataJSON(); commands.push(body);
      if (!explanationSchema.safeParse(body).success) return route.fulfill({ status: 422, json: { error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ.' } } });
      return route.fulfill({ json: { data: { answer: state === 'applied' ? 'Giải thích theo kế hoạch đã áp dụng.' : 'Cần lưu và áp dụng kế hoạch để tính mức góp khi nghỉ sớm.', status: 'PROVIDER_NOT_CONFIGURED', facts: [], citations: [], conversationId: body.conversationId, revision: body.expectedRevision + 1, savedHistory: true } } });
    });
    const input = page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' });
    await input.fill('Nếu nghỉ hưu sớm hơn 2 năm thì cần góp thêm bao nhiêu?');
    await expect(page.locator('.ai-chat-send')).toBeEnabled();
    await input.press('Enter');
    await expect(page.locator('.ai-chat-message.assistant').last()).toContainText(state === 'applied' ? 'Giải thích theo kế hoạch đã áp dụng.' : 'Cần lưu và áp dụng kế hoạch để tính mức góp khi nghỉ sớm.');
    expect(commands[0].conversationId).toBe('00000000-0000-4000-8000-000000000003');
    expect(commands[0].expectedRevision).toBe(0);
    if (state === 'applied') {
      expect(commands[0].planId).toBe('00000000-0000-4000-8000-000000000001');
      expect(commands[0].versionId).toBe('00000000-0000-4000-8000-000000000002');
    } else {
      expect(commands[0]).not.toHaveProperty('planId');
      expect(commands[0]).not.toHaveProperty('versionId');
      await page.locator('.ai-plan-trigger').click();
      await expect(page.locator('.ai-chat-plan')).toContainText('Cần lưu và áp dụng kế hoạch');
      await expect(page.getByRole('link',{name:'Lập kế hoạch',exact:true})).toBeVisible();await page.getByRole('dialog').locator('.dialog-close').click();
    }
    await input.fill('Giải thích tiếp giúp tôi'); await input.press('Enter');
    await expect.poll(() => commands.length).toBe(2);
    expect(commands[1].expectedRevision).toBe(1);
  });
}

test('assistant keeps history off and restores the question after an API failure', async ({ page }) => {
  await setupAssistant(page, { draftPlan: true, saveHistory: false });
  let created = 0;
  page.on('request', request => { if (request.url().endsWith('/ai/conversations') && request.method() === 'POST') created++; });
  await page.route('**/api/v1/me/ai/explain', route => {
    const body = route.request().postDataJSON();
    expect(explanationSchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty('conversationId');
    expect(body).not.toHaveProperty('expectedRevision');
    return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Dịch vụ tạm gián đoạn.' } } });
  });
  const input = page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' });
  await input.fill('Giải thích kế hoạch');
  await expect(page.locator('.ai-chat-send')).toBeEnabled();
  await input.press('Enter');
  await expect(page.locator('.ai-chat-message.assistant').last()).toContainText('Dịch vụ tạm gián đoạn.');
  await expect(input).toHaveValue('Giải thích kế hoạch');
  expect(created).toBe(0);
});

test('assistant: selecting suggestion fills draft without auto-sending', async ({ page }) => {
  await setupAssistant(page);
  const textbox = page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' });
  await expect(textbox).toHaveValue('');

  // Click first chip
  await page.getByRole('button', { name: 'Tôi có đủ tiền không?' }).click();
  await expect(textbox).toHaveValue('Tiền dự kiến có đáp ứng bao nhiêu phần trăm số tiền cần khi nghỉ hưu?');
  await expect(textbox).toBeFocused();

  // Verify no message was auto-sent
  await expect(page.locator('.ai-chat-message.user')).toHaveCount(0);
});

test('assistant: selecting suggestion preserves existing draft without overwriting', async ({ page }) => {
  await setupAssistant(page);
  const textbox = page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' });
  await textbox.fill('Tôi muốn hỏi cụ thể:');

  // Click second chip
  await page.getByRole('button', { name: 'Cần góp thêm bao nhiêu?' }).click();
  await expect(textbox).toHaveValue('Tôi muốn hỏi cụ thể:\nGiải thích số tiền cần góp thêm mỗi tháng theo kế hoạch đã lưu của tôi.');
  await expect(textbox).toBeFocused();

  // Clear button clears draft and keeps focus
  await page.getByRole('button', { name: 'Xóa câu hỏi' }).click();
  await expect(textbox).toHaveValue('');
  await expect(textbox).toBeFocused();
});

test('assistant: status badge shows plan version or profile baseline honestly', async ({ page }) => {
  await setupAssistant(page);
  await page.locator('.ai-plan-trigger').click();
  await expect(page.locator('.ai-chat-plan-name')).toContainText('Đang dùng kế hoạch phiên bản 1');
  await expect(page.locator('.ai-chat-header')).toContainText('Trợ lý An Hưu');
  await expect(page.locator('.codex-pulse')).toHaveCount(0);
});

test('assistant: no plan shows explicit baseline badge', async ({ page }) => {
  await setupAssistant(page, { noPlan: true });
  await page.locator('.ai-plan-trigger').click();
  await expect(page.locator('.ai-chat-plan-name')).toContainText('chưa có kế hoạch đang áp dụng');
  await expect(page.locator('.ai-welcome-plan')).toContainText('Chưa có dự phóng');
  await expect(page.locator('.ai-welcome-plan')).not.toContainText('Thiếu');
});

for (const viewport of [{ width: 1920, height: 850 }, { width: 1366, height: 768 }, { width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
  test(`assistant layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setupAssistant(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`capture-${Date.now()}.png`), fullPage: true });
  });
}

for (const noPlan of [false, true]) {
  test(`assistant missing provider is explicit with noPlan=${noPlan}`, async ({page}) => {
    await setupAssistant(page,{noProvider:true,noPlan});
    await expect(page.locator('.assistant-send-status')).toContainText('Chưa kết nối AI ngoài');
    await page.setViewportSize({width:390,height:844});
    await expect(page.locator('.assistant-send-status')).toBeVisible();
    await expect(page.locator('.assistant-send-status')).toContainText('Chưa kết nối AI ngoài');
  });
}
test('assistant privacy error keeps draft, blocks Enter and resumes only after retry', async ({page}) => {
  const options = {privacyError:true};
  let sent = 0;
  await setupAssistant(page, options);
  await page.route('**/api/v1/me/ai/explain', route => {sent++; return route.fulfill({json:{data:{answer:'Đã nhận câu hỏi',status:'OK',facts:[],citations:[]}}});});
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
  await expect(page.locator('.assistant-send-status')).toContainText('Chưa tải được quyền xử lý');
  await input.fill('Giải thích kế hoạch của tôi'); await input.press('Enter');
  await expect(input).toHaveValue('Giải thích kế hoạch của tôi');
  await expect(page.locator('.ai-chat-send')).toBeDisabled();
  await expect(page.locator('.ai-chat-message.user')).toHaveCount(0); expect(sent).toBe(0);
  options.privacyError=false;
  await page.getByRole('button',{name:'Tải lại quyền xử lý',exact:true}).click();
  await expect(page.locator('.ai-chat-send')).toBeEnabled();
  await input.press('Enter'); await expect.poll(()=>sent).toBe(1);
  await expect(page.locator('.ai-chat-message.user')).toContainText('Giải thích kế hoạch của tôi');
});
test('assistant initial privacy loading keeps typed draft without sending', async ({page}) => {
  let sent=0; page.on('request',request=>{if(request.url().endsWith('/ai/explain'))sent++;});
  await setupAssistant(page,{privacyDelay:2500});
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
  await expect(page.locator('.assistant-send-status')).toContainText('Đang tải quyền xử lý');
  await input.fill('Câu hỏi đang soạn'); await input.press('Enter');
  await expect(input).toHaveValue('Câu hỏi đang soạn');
  await expect(page.locator('.ai-chat-send')).toBeDisabled(); expect(sent).toBe(0);
  await expect(page.locator('.ai-chat-send')).toBeEnabled();
  await expect(input).toHaveValue('Câu hỏi đang soạn'); expect(sent).toBe(0);
});
for (const options of [{processing:false},{reconsent:true}]) {
  test(`assistant consent remains required ${JSON.stringify(options)}`, async ({page})=>{
    let sent=0;page.on('request',r=>{if(r.url().endsWith('/ai/explain'))sent++;});
    await setupAssistant(page,options);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Google Gemini qua dịch vụ Google bên ngoài hệ thống');
    // Only a changed policy (not a first-time choice) says the processing content changed.
    const changed = page.getByRole('dialog').getByText('Nội dung xử lý của trợ lý đã thay đổi');
    if (options.reconsent) await expect(changed).toBeVisible(); else await expect(changed).toHaveCount(0);
    expect(sent).toBe(0);
  });
}

test('assistant labels approved-excerpt answers and keeps long citations scrollable', async ({ page }) => {
  await setupAssistant(page, { noProvider: true });
  const excerpt = `Điều 169. Tuổi nghỉ hưu\n${'1. Người lao động bảo đảm điều kiện về thời gian đóng bảo hiểm xã hội theo quy định. '.repeat(25)}`;
  await page.route('**/api/v1/me/ai/explain', route => route.fulfill({ json: { data: {
    status: 'PROVIDER_NOT_CONFIGURED', answerSource: 'APPROVED_EXCERPT',
    answer: 'Theo tài liệu đã duyệt, tuổi nghỉ hưu được điều chỉnh theo lộ trình.\n\n- Lao động nam: tăng dần mỗi năm\n- Lao động nữ: tăng dần mỗi năm',
    facts: [{ key: 'limits', text: 'KHỐI FACTS KHÔNG ĐƯỢC HIỆN' }],
    citations: [{ id: '00000000-0000-4000-8000-000000000009:120', sourceId: '00000000-0000-4000-8000-000000000009', title: 'Bộ luật Lao động 2019', version: 'r1', url: null, contentHash: 'h', effectiveDate: '2021-01-01', excerpt }],
    provenance: null, knowledgeStatus: 'AVAILABLE', nextAction: '', applied: false, savedHistory: true,
    conversationId: '00000000-0000-4000-8000-000000000003', revision: 1, provider: null,
  } } }));
  await page.getByRole('button', { name: 'Tuổi nghỉ hưu của tôi?' }).click();
  await expect(page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' })).toHaveValue('Tuổi nghỉ hưu của tôi là bao nhiêu?');
  await page.locator('.ai-chat-send').click();
  const answer = page.locator('.ai-chat-message.assistant').last();
  await expect(answer.locator('.ai-chat-response-note')).toHaveText('Trích từ tài liệu đã duyệt; trợ lý chưa diễn giải thêm.');
  await expect(answer).not.toContainText('Giải thích từ số liệu hệ thống');
  await expect(answer).not.toContainText('KHỐI FACTS KHÔNG ĐƯỢC HIỆN');
  // Bullet lines stay on their own lines (pre-wrap), not merged into one paragraph line.
  const bullets = await answer.locator('.ai-chat-message-body p').nth(1).evaluate(el => (el as HTMLElement).innerText.split('\n').length);
  expect(bullets).toBe(2);
  await answer.locator('.ai-chat-sources summary').click();
  const quote = answer.locator('.ai-citation-excerpt');
  await expect(quote).toBeVisible();
  const box = await quote.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight, ws: getComputedStyle(el).whiteSpace, tab: el.tabIndex }));
  expect(box.client).toBeLessThanOrEqual(220);
  expect(box.scroll).toBeGreaterThan(box.client);
  expect(box.ws).toBe('pre-wrap');
  expect(box.tab).toBe(0);
  await page.screenshot({ path: test.info().outputPath('approved-excerpt.png') });
});

test('assistant treats saved answers without answerSource as server facts', async ({ page }) => {
  await setupAssistant(page, { noProvider: true });
  const id = '00000000-0000-4000-8000-000000000007';
  await page.route('**/api/v1/me/ai/conversations**', route => {
    if (new URL(route.request().url()).pathname.endsWith(id)) return route.fulfill({ json: { data: { id, title: 'Hội thoại cũ', revision: 2, expiresAt: '2026-12-01T00:00:00Z', messages: [
      { id: '00000000-0000-4000-8000-000000000011', role: 'user', content: 'Câu hỏi cũ', createdAt: '2026-11-01T01:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000012', role: 'assistant', content: 'Trả lời cũ từ số liệu', createdAt: '2026-11-01T01:00:01Z', context: { response: { status: 'PROVIDER_NOT_CONFIGURED' } } },
    ] } } });
    return route.fulfill({ json: { data: { items: [{ id, title: 'Hội thoại cũ', revision: 2, createdAt: '2026-11-01T01:00:00Z', expiresAt: '2026-12-01T00:00:00Z' }], total: 1, limit: 20, page: 1 } } });
  });
  await page.reload();
  await page.locator('.ai-history-toggle').click();
  await page.getByRole('button', { name: /Hội thoại cũ/ }).click();
  const answer = page.locator('.ai-chat-message.assistant').last();
  await expect(answer).toContainText('Trả lời cũ từ số liệu');
  await expect(answer.locator('.ai-chat-response-note')).toHaveText('Giải thích từ số liệu hệ thống.');
});

for (const height of [844,400]) {
 for (const noPlan of [false,true]) {
  test(`assistant mobile privacy retry is unobstructed ${height} noPlan=${noPlan}`,async({page})=>{
   await page.setViewportSize({width:390,height});
   const options={privacyError:true,noPlan}; await setupAssistant(page,options);
   let sent=0;
   await page.route('**/api/v1/me/ai/explain',route=>{sent++;return route.fulfill({json:{data:{answer:'Kết quả kiểm thử',status:'OK',facts:[],citations:[]}}});});
   const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
   await input.fill('Giải thích kế hoạch'); await input.press('Enter');
   await expect(input).toHaveValue('Giải thích kế hoạch'); expect(sent).toBe(0);
   await expect(page.locator('.ai-chat-send')).toBeDisabled();
   const retry=page.getByRole('button',{name:'Tải lại quyền xử lý',exact:true});
   await retry.click({trial:true});
   await page.screenshot({path:test.info().outputPath('privacy-error.png')});
   options.privacyError=false;
   if(noPlan){await retry.focus();await page.keyboard.press('Enter');}else await retry.click();
   const send=page.locator('.ai-chat-send'); await expect(send).toBeEnabled();
   const box=(await send.boundingBox())!; // Chromium may report a 48px CSS box as 47.999984px after transforms.
   expect(box.width).toBeGreaterThanOrEqual(47.99);expect(box.height).toBeGreaterThanOrEqual(47.99);
   await send.click(); await expect.poll(()=>sent).toBe(1);
   await expect(page.locator('.ai-chat-message.user')).toContainText('Giải thích kế hoạch');
   await expect(page.locator('.ai-chat-message.assistant').last()).toContainText('Kết quả kiểm thử');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
 }
 test(`assistant mobile send remains usable without external provider ${height}`,async({page})=>{
   await page.setViewportSize({width:390,height});await setupAssistant(page,{noProvider:true});
   await page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'}).fill('Câu hỏi đang soạn');
   const send=page.locator('.ai-chat-send');await expect(send).toBeEnabled();await send.click({trial:true});
   const box=(await send.boundingBox())!;
   // Chromium may report a 48px CSS box as 47.999984px after transforms.
   expect(box.width).toBeGreaterThanOrEqual(47.99);expect(box.height).toBeGreaterThanOrEqual(47.99);expect(box.y+box.height).toBeLessThanOrEqual((await page.locator('.user-mobile-nav').boundingBox())!.y+1);
   if(height===844) expect(await page.evaluate(()=>window.scrollY)).toBe(0);
   await page.screenshot({path:test.info().outputPath('composer.png')});
 });
}


test('assistant retries the same request without duplicate question', async ({page}) => {
  await setupAssistant(page, {saveHistory:false});
  const keys: string[] = [];
  await page.route('**/api/v1/me/ai/explain', route => {
    keys.push(route.request().headers()['idempotency-key']);
    return keys.length === 1
      ? route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Hãy thử lại.'}}})
      : route.fulfill({json:{data:{answer:'Đã khôi phục câu trả lời.',status:'AI_ASSISTED',facts:[],citations:[]}}});
  });
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
  await input.fill('Giải thích tiền góp'); await expect(page.locator('.ai-chat-send')).toBeEnabled(); await input.press('Enter');
  await expect(input).toHaveValue('Giải thích tiền góp'); await expect(page.locator('.ai-chat-send')).toBeEnabled(); await input.press('Enter');
  await expect(page.locator('.ai-chat-message.assistant').last()).toContainText('Đã khôi phục câu trả lời.');
  expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
  await expect(page.locator('.ai-chat-message.user')).toHaveCount(1);
});

test('assistant ignores a late answer after starting a new conversation', async ({page}) => {
  await setupAssistant(page, {saveHistory:false});
  let release!: () => void; const gate=new Promise<void>(resolve=>{release=resolve;});
  let requested=false;
  await page.route('**/api/v1/me/ai/explain',async route=>{requested=true;await gate;await route.fulfill({json:{data:{answer:'CÂU TRẢ LỜI HỘI THOẠI CŨ',status:'AI_ASSISTED',facts:[],citations:[]}}});});
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
  await input.fill('Câu hỏi cũ'); await expect(page.locator('.ai-chat-send')).toBeEnabled(); await input.press('Enter');
  await expect.poll(()=>requested).toBe(true);
  await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();await page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true}).click();
  const response=page.waitForResponse('**/api/v1/me/ai/explain'); release(); await response;
  await input.fill('Câu hỏi mới'); await expect(page.locator('.ai-chat-send')).toBeEnabled();
  await expect(page.locator('.ai-chat-message.user')).toHaveCount(0);
  await expect(page.getByText('CÂU TRẢ LỜI HỘI THOẠI CŨ',{exact:true})).toHaveCount(0);
});

test('assistant simulation uses saved month and explicit zero, and reports incomplete data', async ({page}) => {
  await setupAssistant(page,{saveHistory:false});
  await page.route('**/api/v1/me/ai/explain',route=>route.fulfill({json:{data:{answer:'Thông tin kế hoạch',status:'AI_ASSISTED',facts:[],citations:[],provenance:{modelVersion:'retirement-monthly-v3',valuationDate:'2026-10-08',valueKind:'FORECAST'}}}}));
  const commands:any[]=[];
  await page.route('**/api/v1/me/ai/simulate',route=>{commands.push(route.request().postDataJSON());return route.fulfill({json:{data:{candidate:{status:'INCOMPLETE'},applied:false}}});});
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
  await input.fill('Thử thay đổi'); await expect(page.locator('.ai-chat-send')).toBeEnabled(); await input.press('Enter');
  await page.locator('.ai-plan-trigger').click();await page.getByRole('button',{name:'Thử thay đổi kế hoạch',exact:true}).click();
  await expect(page.locator('#ai-retirement-month')).toHaveValue('2054-10');
  await expect(page.getByLabel('Tiền góp mỗi tháng',{exact:true})).toHaveValue('0');
  await expect(page.getByLabel('Chi tiêu mỗi tháng khi nghỉ hưu, theo giá hôm nay',{exact:true})).toHaveValue('10.000.000');
  await page.getByLabel('Tiền góp mỗi tháng',{exact:true}).fill(''); await page.getByRole('button',{name:'Tính phương án thử'}).click();
  await expect(page.getByRole('dialog')).toContainText('Hãy nhập tháng nghỉ hưu'); expect(commands).toHaveLength(0);
  await page.getByLabel('Tiền góp mỗi tháng',{exact:true}).fill('0'); await page.getByRole('button',{name:'Tính phương án thử'}).click();
  await expect(page.getByRole('dialog')).toContainText('Chưa đủ dữ liệu để tính thay đổi này');
  expect(commands[0].changes).toEqual({retirementMonth:'2054-10',monthlyContribution:'0',monthlyExpenseToday:'10000000'});
  await expect(page.getByRole('region',{name:'Kết quả mô phỏng'})).toHaveCount(0);
});


test('assistant rename refreshes active revision and deletion requires confirmation', async ({page}) => {
  await setupAssistant(page);
  const id='00000000-0000-4000-8000-000000000003';
  let revision=1,title='Cuộc trò chuyện đã lưu',deleted=false;
  await page.route('**/api/v1/me/ai/conversations**',route=>{
    const r=route.request(),method=r.method(),url=new URL(r.url());
    if(method==='DELETE'){deleted=true;return route.fulfill({json:{data:{deleted:true}}});}
    if(method==='PATCH'){expect(r.postDataJSON().expectedRevision).toBe(revision);title=r.postDataJSON().title;revision++;return route.fulfill({json:{data:{id,title,revision}}});}
    if(url.pathname.endsWith(id))return route.fulfill({json:{data:{id,title,revision,expiresAt:'2026-11-12T00:00:00Z',messages:[]}}});
    return route.fulfill({json:{data:{items:deleted?[]:[{id,title,revision,createdAt:'2026-10-13T00:00:00Z',expiresAt:'2026-11-12T00:00:00Z'}],total:deleted?0:1,page:1,limit:20}}});
  });
  await page.reload();await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();
  await page.locator('.ai-history-open').click();await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();
  await page.getByRole('button',{name:'Đổi tên',exact:true}).click();await page.getByRole('textbox',{name:'Tên hội thoại'}).fill('Tên vừa sửa');await page.getByRole('button',{name:'Lưu',exact:true}).click();
  await page.getByRole('button',{name:'Đóng danh sách hội thoại',exact:true}).click();
  let sent:any;
  await page.route('**/api/v1/me/ai/explain',route=>{sent=route.request().postDataJSON();return route.fulfill({json:{data:{answer:'Đã dùng phiên bản hội thoại mới',status:'AI_ASSISTED',facts:[],citations:[],conversationId:id,revision:3,savedHistory:true}}});});
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});await input.fill('Câu hỏi sau đổi tên');await input.press('Enter');
  await expect(page.locator('.ai-chat-message.assistant').last()).toContainText('Đã dùng phiên bản hội thoại mới');expect(sent.expectedRevision).toBe(2);
  await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();await page.getByRole('button',{name:'Xóa',exact:true}).click();expect(deleted).toBe(false);
  await page.getByRole('button',{name:'Giữ lại',exact:true}).click();expect(deleted).toBe(false);
  await page.getByRole('button',{name:'Xóa',exact:true}).click();await page.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await expect.poll(()=>deleted).toBe(true);
});


test('assistant comparison names both valuation dates and keeps non-comparable delta unknown', async ({page}) => {
  await setupAssistant(page,{saveHistory:false});
  await page.route('**/api/v1/me/ai/explain',route=>route.fulfill({json:{data:{answer:'Kế hoạch để thử',status:'AI_ASSISTED',facts:[],citations:[],provenance:{modelVersion:'retirement-monthly-v3',valuationDate:'2026-10-08',valueKind:'FORECAST'}}}}));
  await page.route('**/api/v1/me/ai/simulate',route=>route.fulfill({json:{data:{
    baseline:{preview:{valuationDate:'2026-10-08',calculation:{summary:{atValuation:{projectedFund:'9007199254740993',requiredFund:'100',fundingGap:'-9007199254740893'}}}}},
    candidate:{status:'READY',valuationDate:'2026-10-13',calculation:{summary:{atValuation:{projectedFund:'500',requiredFund:'200',fundingGap:'-300'},firstShortfallMonth:null}}},
    comparison:{status:'NOT_COMPARABLE',reasons:['VALUATION_DATE_DIFFERS'],delta:null},applied:false
  }}}));
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});await input.fill('Thử kế hoạch');await expect(page.locator('.ai-chat-send')).toBeEnabled();await input.press('Enter');
  await page.locator('.ai-plan-trigger').click();await page.getByRole('button',{name:'Thử thay đổi kế hoạch',exact:true}).click();await page.getByRole('button',{name:'Tính phương án thử'}).click();
  const result=page.getByRole('region',{name:'Kết quả mô phỏng'});
  await expect(result).toContainText('08/10/2026');await expect(result).toContainText('13/10/2026');
  await expect(result).toContainText('9.007.199.254.740.993 VND');
  await expect(result.getByRole('cell',{name:'Chưa xác định',exact:true})).toHaveCount(3);
  await expect(result).toContainText('khác cơ sở tính');
});


test('assistant redesign exposes only supported actions and keeps privacy accessible', async ({page}) => {
  await setupAssistant(page);
  await expect(page.getByRole('heading',{name:'Bạn muốn hỏi gì?'})).toBeVisible();
  await expect(page.locator('.ai-chat-suggestions button')).toHaveCount(4);
  await page.locator('.ai-plan-trigger').click();await expect(page.getByRole('button',{name:'Thử thay đổi kế hoạch',exact:true})).toBeVisible();await page.getByRole('dialog').locator('.dialog-close').click();
  await expect(page.getByRole('button',{name:/Tải hội thoại/})).toHaveCount(0);
  await expect(page.getByText('Nghỉ hưu sớm hơn 2 năm cần thêm vốn gì?',{exact:true})).toHaveCount(0);
  await expect(page.locator('.codex-side-rail,.typing-pulse-dots,.codex-status-pill')).toHaveCount(0);
  await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();await page.getByRole('button',{name:/Quyền riêng tư & lịch sử/}).click();
  await expect(page.getByRole('dialog')).toContainText('Google Gemini');
  await expect(page.getByRole('button',{name:'Đồng ý, không lưu lịch sử',exact:true})).toBeVisible();
});

test('assistant answer is not duplicated as fact cards and only shows actual citations', async ({page})=>{
  await setupAssistant(page,{saveHistory:false});
  const fact='Theo kế hoạch đã lưu, quỹ dự kiến có đủ cho 80% nhu cầu.';
  await page.route('**/api/v1/me/ai/explain',route=>route.fulfill({json:{data:{answer:fact,status:'AI_ASSISTED',facts:[{key:'coverage',text:fact}],citations:[]}}}));
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});await input.fill('Quỹ có đủ không?');await expect(page.locator('.ai-chat-send')).toBeEnabled();await input.press('Enter');
  await expect(page.getByText(fact,{exact:true})).toHaveCount(1);
  await expect(page.locator('.ai-chat-welcome')).toHaveCount(0);
  await expect(page.locator('.ai-chat-sources')).toHaveCount(0);
  // Conversation download was removed: it could produce a file not backed by any saved record.
  await expect(page.getByRole('button',{name:/Tải hội thoại/})).toHaveCount(0);
});

for (const viewport of [{width:1920,height:850},{width:1366,height:768}]) {
  test(`chat workspace centers composer without clipping ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);await setupAssistant(page);
    const welcome=(await page.locator('.ai-chat-welcome').boundingBox())!;
    const composer=(await page.locator('.ai-chat-composer').boundingBox())!;
    const suggestions=(await page.locator('.ai-chat-suggestions').boundingBox())!;
    expect(composer.y-(welcome.y+welcome.height)).toBeLessThan(50);
    expect(suggestions.y+suggestions.height).toBeLessThan(viewport.height-40);
    expect(await page.locator('.ai-chat-stage').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
    await expect(page.locator('.user-topbar')).toBeVisible();await expect(page.locator('.user-sidebar')).toBeVisible();
    await expect(page.locator('.ai-chat-sidebar')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true})).toBeHidden();
    const draft=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});await draft.fill('Câu hỏi đang soạn');
    const toggle=page.getByRole('button',{name:'Lịch sử chat',exact:true});await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded','true');
    const panel=page.getByRole('complementary',{name:'Hội thoại đã lưu',exact:true});await expect(panel).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const chatBody=(await page.locator('.ai-chat-body').boundingBox())!;
    await expect.poll(async()=>{const rect=(await panel.boundingBox())!;return rect.x+rect.width<=chatBody.x+chatBody.width+1;}).toBe(true);
    const panelBox=(await panel.boundingBox())!;
    expect(panelBox.y).toBeGreaterThanOrEqual(chatBody.y);
    expect(panelBox.y+panelBox.height).toBeLessThanOrEqual(chatBody.y+chatBody.height+1);
    expect(await page.locator('#root').evaluate(el=>(el as HTMLElement).inert)).toBe(false);
    const planBox=(await page.locator('.ai-plan-trigger').boundingBox())!,toggleBox=(await toggle.boundingBox())!;
    expect(toggleBox.x).toBeGreaterThanOrEqual(planBox.x+planBox.width);
    await expect(page.locator('.ai-plan-trigger')).toContainText('Kế hoạch nghỉ hưu');
    await expect(page.locator('.ai-plan-trigger')).toHaveAttribute('title','Xem kế hoạch nghỉ hưu dùng để trả lời');
    await expect(page.locator('.ai-chat-page')).toHaveCSS('background-color','rgb(255, 255, 255)');
    await expect(page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true})).toBeVisible();
    await page.screenshot({path:`../artifacts/ai-completion/chat-toolbar-history-${viewport.width}.png`});
    await page.getByRole('button',{name:'Đóng danh sách hội thoại',exact:true}).click();await expect(toggle).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.ai-history-panel')).toHaveCSS('visibility','hidden');
    await expect(draft).toHaveValue('Câu hỏi đang soạn');await draft.fill('');
    await page.screenshot({path:`../artifacts/ai-completion/chat-toolbar-${viewport.width}.png`});
    await page.route('**/api/v1/me/ai/explain',route=>route.fulfill({json:{data:{answer:'Kế hoạch đã lưu của bạn được giải thích ở đây.',status:'AI_ASSISTED',facts:[],citations:[]}}}));
    const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});await input.fill('Giải thích kế hoạch');await expect(page.locator('.ai-chat-send')).toBeEnabled();await input.press('Enter');
    await expect(page.locator('.ai-chat-message.assistant')).toBeVisible();
    const activeComposer=(await page.locator('.ai-chat-composer').boundingBox())!;
    expect(activeComposer.y).toBeGreaterThan(viewport.height*.65);
    await expect(page.locator('.ai-chat-welcome,.ai-chat-suggestions')).toHaveCount(0);
    await page.screenshot({path:`../artifacts/ai-completion/chat-toolbar-answer-${viewport.width}.png`});
  });
}

test('mobile conversation navigation opens history and privacy, and closes with Escape', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await setupAssistant(page);
  await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Hội thoại đã lưu',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('complementary',{name:'Hội thoại đã lưu',exact:true})).toBeHidden();
  await expect(page.getByRole('button',{name:'Lịch sử chat',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Lịch sử chat',exact:true}).click();
  await page.getByRole('button',{name:'Quyền riêng tư & lịch sử',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Google Gemini');
  await page.getByRole('dialog').locator('.dialog-close').click();
  await page.screenshot({path:'../artifacts/ai-completion/chat-toolbar-mobile.png'});
});

for (const reducedMotion of ['reduce','no-preference'] as const) {
  test(`history panel can reverse its transition and keeps app controls usable ${reducedMotion}`, async ({page}) => {
    await page.emulateMedia({reducedMotion});await setupAssistant(page);
    const toggle=page.getByRole('button',{name:'Lịch sử chat',exact:true});
    await toggle.click();await toggle.click();await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded','true');
    await expect(page.getByRole('complementary',{name:'Hội thoại đã lưu',exact:true})).toBeVisible();
    await page.locator('.ai-plan-trigger').click();await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').locator('.dialog-close').click();
    await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('.ai-history-panel')).toHaveAttribute('inert','');
    await expect(page.getByRole('button',{name:'Cuộc trò chuyện mới',exact:true})).toBeHidden();
  });
}
