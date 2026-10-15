import { test, expect, type Page } from '@playwright/test';
import { installRouteAuth, installFinancialProfileRoutes } from './helpers';

async function setup(page: Page) {
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, json: { error: { message: 'Unmocked test API' } } }));
  await installRouteAuth(page);
  const state = await installFinancialProfileRoutes(page, { profile: null, draft: null });
  await page.route('**/socket.io/**', route => route.abort());
  await page.routeWebSocket(/socket\.io/, ws => ws.close());
  await page.goto('/onboarding');
  await expect(page.getByRole('button', { name: 'Bắt đầu khai báo' })).toBeVisible();
  await page.getByRole('button', { name: '20 triệu', exact: true }).click();
  return state;
}

for (const viewport of [{width:1440,height:1000}, {width:768,height:1024}, {width:390,height:844}, {width:390,height:400}]) {
  test(`onboarding readable stages and preserved draft ${viewport.width}x${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport); const state = await setup(page);
    await expect(page.locator('.onboarding-stages li')).toHaveCount(3);
    await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Mong muốn & thời gian');
    await page.getByRole('button',{name:'Bắt đầu khai báo'}).click();
    const age=page.getByLabel(/Tuổi hiện tại của bạn/);
    await age.fill('45');
    await page.getByLabel('Tháng sinh cho hồ sơ chi tiết (có thể chưa biết)').fill('1981-05');
    await page.getByLabel('Tháng bạn muốn nghỉ hưu', { exact: true }).fill('2040-01');
    expect((await age.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.onboarding-unknown-help')).toContainText('Không nhập 0');
    await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    await expect(page.getByRole('heading', { name: 'Mức sống hôm nay, sức mua ngày mai' })).toBeVisible();
    await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
    await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Thu chi & tài sản');
    await expect.poll(()=>state.getDraft()?.data.personal?.birthMonth?.value).toBe('1981-05');
    await page.reload();
    await page.getByRole('button',{name:'Quay lại',exact:true}).click();
    await expect(age).toHaveValue('45');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:test.info().outputPath('onboarding.png'),fullPage:true});
  });
}

test('onboarding failed draft save retains entries and retries without advancing', async ({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Bắt đầu khai báo'}).click();
  const age=page.getByLabel(/Tuổi hiện tại của bạn/);
  await expect(age).toBeVisible();
  await age.fill('45');
  await page.getByLabel('Tháng bạn muốn nghỉ hưu', { exact: true }).fill('2040-01');
  await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
  let fail = true;
  await page.route('**/api/v1/me/onboarding-draft', route => {
    if (fail && route.request().method()==='PUT') return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Không lưu được bản nháp kiểm thử'}}});
    return route.fallback();
  });
  await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
  await page.getByRole('button',{name:'Quay lại',exact:true}).click();
  await expect(age).toHaveValue('45');
  await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Mong muốn & thời gian');
  fail=false;
  await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
  await page.getByRole('button',{name:'Tiếp tục',exact:true}).click();
  await expect(page.locator('.onboarding-stages [aria-current]')).toContainText('Thu chi & tài sản');
});
