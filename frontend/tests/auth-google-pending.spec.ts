import { test, expect } from '@playwright/test';

for (const pageName of ['login', 'register']) {
  test(pageName + ' locks both methods until the Google request finishes', async ({page}) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/**', async route => {
      if (route.request().url().endsWith('/auth/google')) await gate;
      await route.fulfill({status:401,json:{error:{code:'UNAUTHENTICATED',message:'Thử lại Google'}}});
    });
    await page.addInitScript(() => {
      (window as any).google = {accounts:{id:{initialize(options: any){ (window as any).sendCredential = () => options.callback({credential:'x.' + btoa('{}') + '.x'}); },prompt(){}}}};
    });
    await page.goto('/' + pageName);
    const google = page.locator('.auth-btn-google');
    await google.click();
    await expect(google).toBeDisabled();
    await expect(page.locator('.auth-btn-primary')).toBeDisabled();
    const request = page.waitForRequest('**/auth/google');
    await page.evaluate(() => (window as any).sendCredential());
    await request;
    await expect(page.locator('#' + pageName + '-email')).toBeDisabled();
    await expect(page.locator('.auth-btn-primary')).toBeDisabled();
    release();
    await expect(page.getByRole('alert')).toContainText('Thử lại Google');
    await expect(google).toBeEnabled();
  });
}
