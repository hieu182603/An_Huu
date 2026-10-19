import { expect, test } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes, defaultMockProfile } from './helpers';

async function openGoalPage(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installRouteAuth(page);
  const profile = defaultMockProfile();
  profile.data.expenses = {
    essentialExpense: '12000000',
    lifestyleExpense: '8000000',
  };
  profile.data.income = {
    primaryIncome: '30000000',
    secondaryIncome: '10000000',
  };
  await installFinancialProfileRoutes(page, { profile });
  await page.route('**/api/v1/me/explanations/glossary', route => route.fulfill({
    json: {
      data: {
        version: 'test-v1',
        terms: [
          { key: 'fundCoverage', label: { vi: 'Độ phủ quỹ', en: 'Fund coverage' }, definition: { vi: 'Phần quỹ dự kiến so với quỹ cần có.', en: 'Projected fund compared with the required fund.' } },
          { key: 'glidePath', label: { vi: 'Lộ trình giảm dần rủi ro', en: 'Risk reduction path' }, definition: { vi: 'Cách giảm dần mức rủi ro khi gần đến tuổi nghỉ hưu.', en: 'A way to gradually reduce risk as retirement approaches.' } },
        ]
      }
    }
  }));
  await page.route('**/api/v1/me/retirement/plans**', route => route.fulfill({ json: { data: { items: [], total: 0, page: 1, limit: 50 } } }));
  await page.route('**/api/v1/me/assumptions', route => route.fulfill({ json: { data: { status: 'PUBLISHED', items: [{ id: '1' }], total: 1, page: 1, limit: 20 } } }));
  await page.route('**/api/v1/me/notifications**', route => route.fulfill({ json: { data: { items: [], unread: 0, total: 0, page: 1, limit: 25 } } }));
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.goto('/user/goal');
  await expect(page.locator('.retirement-page-header')).toBeVisible();
  const explainBtn = page.getByRole('button', { name: 'Trợ lý AI', exact: true });
  await explainBtn.click();
  await expect(explainBtn).toHaveAttribute('aria-pressed', 'true');
}

test('clicking on labels and numbers in RetirementGoalPage opens definition and formula', async ({ page }) => {
  await openGoalPage(page);

  // 1. Click on "Mốc tuổi nghỉ hưu mong muốn" (Image 1 fix)
  const headerMilestone = page.locator('h2 .explain-target', { hasText: 'Mốc tuổi nghỉ hưu mong muốn' });
  await expect(headerMilestone).toBeVisible();
  await headerMilestone.click();

  let dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Mốc tuổi nghỉ hưu');
  await expect(dialog).toContainText('Độ tuổi bạn mong muốn ngừng làm việc toàn thời gian');
  await expect(dialog.locator('.explain-formula')).toContainText('Năm bắt đầu nghỉ hưu = Năm sinh + Mốc tuổi nghỉ hưu mong muốn');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // 2. Click on "Chi tiêu hôm nay (PV):" and value 20.000.000 VND (Image 2 fix)
  const expenseTarget = page.locator('.goal-summary-stats').locator('.explain-target', { hasText: '20.000.000 VND' });
  await expect(expenseTarget).toBeVisible();
  await expenseTarget.click();

  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Chi tiêu hôm nay (PV)');
  await expect(dialog.locator('.explain-value')).toContainText('20.000.000 VND');
  await expect(dialog.locator('.explain-formula')).toContainText('Chi tiêu hôm nay (PV) = Chi thiết yếu + Chi linh hoạt');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // 3. Click on "Dòng tiền có thể tích lũy hiện tại:"
  const surplusTarget = page.locator('.goal-estimate').locator('.explain-target', { hasText: 'Dòng tiền có thể tích lũy hiện tại:' });
  await expect(surplusTarget).toBeVisible();
  await surplusTarget.click();

  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Tiền còn lại mỗi tháng');
  await expect(dialog.locator('.explain-formula')).toContainText('Dòng tiền tích lũy = Tổng thu nhập − Chi phí sinh hoạt − Tiền trả nợ hàng tháng');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // 4. Click on Assumptions & Inflation
  const inflationTarget = page.locator('.assumption-metric-box').locator('.explain-target', { hasText: 'Lạm phát dài hạn' });
  await expect(inflationTarget).toBeVisible();
  await inflationTarget.click();

  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Lạm phát dài hạn');
  await expect(dialog.locator('.explain-formula')).toContainText('Chi tiêu tương lai (FV) = Chi tiêu hôm nay (PV) × (1 + i)^n');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('selecting numbers or phrases triggers formula explanation popup with selected value', async ({ page }) => {
  await openGoalPage(page);

  // Simulate selecting "20.000.000 VND" inside goal-summary-stats
  await page.locator('.goal-summary-stats').locator('.explain-target', { hasText: '20.000.000 VND' }).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Chi tiêu hôm nay (PV)');
  await expect(dialog.locator('.explain-value')).toContainText('20.000.000 VND');
  await expect(dialog.locator('.explain-formula')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
