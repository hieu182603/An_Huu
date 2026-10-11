import { expect, test, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

async function setupAssistant(page: Page, options: { noPlan?: boolean; privacyError?: boolean; noProvider?: boolean; processing?: boolean; reconsent?: boolean; privacyDelay?: number } = {}) {
  await installRouteAuth(page);
  const profile = defaultMockProfile();
  await installFinancialProfileRoutes(page, { profile });
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());

  const version = {
    id: 'assistant-version',
    planId: 'assistant-plan',
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
      selection: {},
    },
  };
  const plan = { id: 'assistant-plan', currentVersionId: version.id, revision: 1, current: version };

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
          saveHistory: true,
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
    return route.fulfill({ json: { data: { items: [], total: 0, limit: 20, page: 1 } } });
  });

  await page.goto('/user/assistant');
  await expect(page.locator('.codex-topbar')).toBeVisible();
}

test('assistant: selecting suggestion fills draft without auto-sending', async ({ page }) => {
  await setupAssistant(page);
  const textbox = page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' });
  await expect(textbox).toHaveValue('');

  // Click first chip
  await page.getByRole('button', { name: 'Tỷ lệ bao phủ quỹ hưu trí là gì?' }).click();
  await expect(textbox).toHaveValue('Giải thích tỷ lệ bao phủ quỹ hưu trí của tôi và các yếu tố ảnh hưởng lớn nhất?');
  await expect(textbox).toBeFocused();

  // Verify no message was auto-sent
  await expect(page.locator('.codex-turn.user')).toHaveCount(0);
});

test('assistant: selecting suggestion preserves existing draft without overwriting', async ({ page }) => {
  await setupAssistant(page);
  const textbox = page.getByRole('textbox', { name: 'Câu hỏi dành cho trợ lý AI' });
  await textbox.fill('Tôi muốn hỏi cụ thể:');

  // Click second chip
  await page.getByRole('button', { name: 'Nghỉ hưu sớm hơn 2 năm cần thêm vốn gì?' }).click();
  await expect(textbox).toHaveValue('Tôi muốn hỏi cụ thể:\nNếu tôi muốn nghỉ hưu sớm hơn 2 năm thì cần đóng góp thêm bao nhiêu mỗi tháng?');
  await expect(textbox).toBeFocused();

  // Clear button clears draft and keeps focus
  await page.getByRole('button', { name: 'Xóa câu hỏi' }).click();
  await expect(textbox).toHaveValue('');
  await expect(textbox).toBeFocused();
});

test('assistant: status badge shows plan version or profile baseline honestly', async ({ page }) => {
  await setupAssistant(page);
  await expect(page.locator('.composer-badge-text')).toContainText('Kế hoạch v1');
  await expect(page.locator('.codex-status-pill')).toContainText('AI Hỗ trợ phân tích');
});

test('assistant: no plan shows explicit baseline badge', async ({ page }) => {
  await setupAssistant(page, { noPlan: true });
  await expect(page.locator('.composer-badge-text')).toContainText('Chưa chọn kế hoạch');
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 390, height: 400 }]) {
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
    await expect(page.locator('.codex-status-pill')).toContainText('Chưa kết nối AI ngoài');
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
  await expect(page.locator('.composer-send-button')).toBeDisabled();
  await expect(page.locator('.codex-turn.user')).toHaveCount(0); expect(sent).toBe(0);
  options.privacyError=false;
  await page.getByRole('button',{name:'Tải lại quyền xử lý',exact:true}).click();
  await expect(page.locator('.composer-send-button')).toBeEnabled();
  await input.press('Enter'); await expect.poll(()=>sent).toBe(1);
  await expect(page.locator('.codex-turn.user')).toContainText('Giải thích kế hoạch của tôi');
});
test('assistant initial privacy loading keeps typed draft without sending', async ({page}) => {
  let sent=0; page.on('request',request=>{if(request.url().endsWith('/ai/explain'))sent++;});
  await setupAssistant(page,{privacyDelay:2500});
  const input=page.getByRole('textbox',{name:'Câu hỏi dành cho trợ lý AI'});
  await expect(page.locator('.assistant-send-status')).toContainText('Đang tải quyền xử lý');
  await input.fill('Câu hỏi đang soạn'); await input.press('Enter');
  await expect(input).toHaveValue('Câu hỏi đang soạn');
  await expect(page.locator('.composer-send-button')).toBeDisabled(); expect(sent).toBe(0);
  await expect(page.locator('.composer-send-button')).toBeEnabled();
  await expect(input).toHaveValue('Câu hỏi đang soạn'); expect(sent).toBe(0);
});
for (const options of [{processing:false},{reconsent:true}]) {
  test(`assistant consent remains required ${JSON.stringify(options)}`, async ({page})=>{
    let sent=0;page.on('request',r=>{if(r.url().endsWith('/ai/explain'))sent++;});
    await setupAssistant(page,options);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Google Gemini qua dịch vụ Google bên ngoài hệ thống');
    expect(sent).toBe(0);
  });
}
