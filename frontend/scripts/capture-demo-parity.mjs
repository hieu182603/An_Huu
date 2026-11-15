import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const output = new URL('../../artifacts/demo-parity/reference/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440,390]) {
    const page = await browser.newPage({ viewport:{width,height:1000}, reducedMotion:'reduce' });
    await page.goto('http://127.0.0.1:8460/app#sample');
    for (const [name, destination] of [['dashboard','overview:'],['profile','profile:finance'],['goal','plan:goals'],['plan','plan:'],['risk-portfolio','plan:allocation']]) {
      const link=page.locator(`[data-x="jump:${destination}"]`).first();
      // The sidebar has the same controls on mobile, behind its menu.
      await link.evaluate(el=>el.click());
      await page.locator('main h1').first().waitFor({state:'visible'});
      await page.screenshot({path:new URL(`${name}-${width}.png`,output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
    }
    await page.close();
  }
} finally { await browser.close(); }
