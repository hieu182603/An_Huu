import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const VIEWPORTS = [
  { name: '390px (Mobile)', width: 390, height: 844 },
  { name: '768px (Tablet)', width: 768, height: 1024 },
  { name: '1024px (Small Desktop)', width: 1024, height: 768 },
  { name: '1440px (Wide Desktop)', width: 1440, height: 900 },
];

const MARKETING_ROUTES = [
  { name: 'Landing (Screen 1)', path: '/' },
  { name: 'Simulation (Screen 2)', path: '/mo-phong' },
  { name: 'AI Assistant (Screen 3)', path: '/tro-ly-ai' },
  { name: 'How It Works (Screen 4)', path: '/cach-hoat-dong' },
  { name: 'Knowledge Hub (Screen 5)', path: '/kien-thuc' },
];

test.describe('Task 1: DOM Structure & Class Parity with sites/an-huu-trai-nghiem/dist/', () => {
  test('Landing Section 5 (#kien-thuc) DOM parity', async ({ page }) => {
    await page.goto('/');
    const sec5 = page.locator('section#kien-thuc');
    await expect(sec5).toBeVisible();
    await expect(sec5).toHaveClass(/mk-section/);

    // Container & Heading
    await expect(sec5.locator('> .mk-container')).toBeVisible();
    await expect(sec5.locator('.mk-eyebrow')).toHaveText('CẨM NANG KIẾN THỨC HƯU TRÍ');

    // 3 Article Cards
    const cardsGrid = sec5.locator('.mk-landing-knowledge-grid');
    await expect(cardsGrid).toBeVisible();
    const cards = cardsGrid.locator('article.mk-landing-article-card');
    await expect(cards).toHaveCount(3);

    for (let i = 0; i < 3; i++) {
      const card = cards.nth(i);
      await expect(card.locator('.mk-card-img-wrap img')).toBeVisible();
      await expect(card.locator('.mk-card-img-wrap .mk-card-category-badge')).toBeVisible();
      await expect(card.locator('.mk-card-content h3')).toBeVisible();
      await expect(card.locator('.mk-card-content p')).toBeVisible();
      const action = card.locator('.mk-card-content a.mk-card-action');
      await expect(action).toBeVisible();
      await expect(action.locator('svg')).toBeVisible();
    }

    // View All Button
    const viewAll = sec5.locator('a.mk-button.mk-secondary-btn');
    await expect(viewAll).toBeVisible();
    await expect(viewAll).toHaveAttribute('href', '/kien-thuc');
  });

  test('Landing Section 6 (#gioi-thieu) DOM parity', async ({ page }) => {
    await page.goto('/');
    const sec6 = page.locator('section#gioi-thieu');
    await expect(sec6).toBeVisible();
    await expect(sec6).toHaveClass(/mk-section/);
    await expect(sec6).toHaveClass(/mk-alt-bg/);

    // Section Heading
    await expect(sec6.locator('.mk-eyebrow')).toHaveText('VỀ NỀN TẢNG AN HƯU');

    // 2 About Cards
    const aboutGrid = sec6.locator('.mk-landing-about-grid');
    await expect(aboutGrid).toBeVisible();
    const aboutCards = aboutGrid.locator('.mk-about-card');
    await expect(aboutCards).toHaveCount(2);

    // Card 1
    const card1 = aboutCards.nth(0);
    await expect(card1.locator('.mk-about-card-top .mk-about-card-icon')).toBeVisible();
    await expect(card1.locator('.mk-about-card-top .mk-about-badge-pill')).toHaveText('Đội ngũ chuyên gia');
    await expect(card1.locator('.mk-about-card-body h3')).toHaveText('Đội ngũ chuyên môn & Cố vấn');
    const items1 = card1.locator('.mk-about-items .mk-about-item');
    await expect(items1).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(items1.nth(i).locator('.mk-about-tag.mk-tag-navy')).toBeVisible();
      await expect(items1.nth(i).locator('.mk-about-item-content strong')).toBeVisible();
      await expect(items1.nth(i).locator('.mk-about-item-content p')).toBeVisible();
    }
    await expect(card1.locator('.mk-about-card-foot a.mk-card-action')).toBeVisible();

    // Card 2
    const card2 = aboutCards.nth(1);
    await expect(card2.locator('.mk-about-card-top .mk-about-card-icon')).toBeVisible();
    await expect(card2.locator('.mk-about-card-top .mk-about-badge-pill')).toHaveText('Minh bạch dữ liệu');
    await expect(card2.locator('.mk-about-card-body h3')).toHaveText('Nguồn dữ liệu & Cơ sở tính toán');
    const items2 = card2.locator('.mk-about-items .mk-about-item');
    await expect(items2).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(items2.nth(i).locator('.mk-about-tag.mk-tag-jade')).toBeVisible();
      await expect(items2.nth(i).locator('.mk-about-item-content strong')).toBeVisible();
      await expect(items2.nth(i).locator('.mk-about-item-content p')).toBeVisible();
    }
    await expect(card2.locator('.mk-about-card-foot a.mk-card-action')).toBeVisible();
  });

  test('5-Column Footer DOM parity across marketing pages', async ({ page }) => {
    for (const route of MARKETING_ROUTES) {
      await page.goto(route.path);
      const footer = page.locator('footer.mk-footer');
      await expect(footer).toBeVisible();
      const footerTop = footer.locator('.mk-footer-top');
      await expect(footerTop).toBeVisible();

      // Column 1: Brand
      await expect(footerTop.locator('.mk-footer-brand')).toBeVisible();
      await expect(footerTop.locator('.mk-footer-brand .mk-footer-logo')).toBeVisible();

      // Column 2: Khám phá (6 links)
      const col2 = footerTop.locator('nav.mk-footer-links').first();
      await expect(col2.locator('h2')).toHaveText('Khám phá');
      const col2Links = col2.locator('a');
      await expect(col2Links).toHaveCount(6);

      // Column 3: Chính sách (4 links)
      const col3 = footerTop.locator('nav.mk-footer-links').nth(1);
      await expect(col3.locator('h2')).toHaveText('Chính sách');
      await expect(col3.locator('a')).toHaveCount(4);

      // Column 4: Thông tin liên hệ
      const col4 = footerTop.locator('.mk-footer-contact');
      await expect(col4.locator('h2')).toHaveText('Thông tin liên hệ');
      await expect(col4.locator('ul.mk-contact-list li')).toHaveCount(3);

      // Column 5: Bắt đầu thật đơn giản
      const col5 = footerTop.locator('.mk-footer-start');
      await expect(col5.locator('h2')).toHaveText('Bắt đầu thật đơn giản.');
      await expect(col5.locator('a')).toBeVisible();

      // Footer bottom
      await expect(footer.locator('.mk-footer-bottom')).toBeVisible();
    }
  });

  test('Knowledge Page (Screen 5) Catalog Grid & Interactive Reader DOM parity', async ({ page }) => {
    await page.goto('/kien-thuc');

    // Hero
    await expect(page.locator('.ed-hero.ed-hero-kb')).toBeVisible();
    await expect(page.locator('.ed-breadcrumb')).toBeVisible();
    await expect(page.locator('h1')).toHaveText(/Kiến thức hưu trí/);
    await expect(page.locator('.ed-feature-card')).toBeVisible();

    // Metrics strip
    await expect(page.locator('.ed-metrics .ed-metrics-grid')).toBeVisible();

    // Catalog grid (6 cards)
    const catalog = page.locator('#ed-catalog-view');
    await expect(catalog).toBeVisible();
    const cards = catalog.locator('article.ed-card');
    await expect(cards).toHaveCount(6);

    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      await expect(card.locator('.ed-card-media img')).toBeVisible();
      await expect(card.locator('.ed-card-media .ed-card-cat-badge')).toBeVisible();
      await expect(card.locator('.ed-card-media .ed-card-time-badge')).toBeVisible();
      await expect(card.locator('.ed-card-body .ed-card-kicker')).toBeVisible();
      await expect(card.locator('.ed-card-body .ed-card-title')).toBeVisible();
      await expect(card.locator('.ed-card-body .ed-card-excerpt')).toBeVisible();
      await expect(card.locator('.ed-card-body .ed-card-pill')).toBeVisible();
      await expect(card.locator('.ed-card-footer .ed-card-action')).toBeVisible();
    }

    // Click on Card 1 to activate interactive reader
    await cards.nth(0).locator('.ed-card-action').click();
    await expect(page.locator('#ed-reader-view')).toBeVisible();
    await expect(page.locator('#ed-catalog-view')).toHaveCount(0);

    // Reader DOM structure
    const readerShell = page.locator('#ed-active-reader-shell');
    await expect(readerShell).toBeVisible();
    await expect(readerShell.locator('.editorial-topbar')).toBeVisible();
    await expect(readerShell.locator('.editorial-topbar button.ed-btn-back')).toBeVisible();
    await expect(readerShell.locator('.editorial-newspaper-grid')).toBeVisible();
    await expect(readerShell.locator('.editorial-article-main')).toBeVisible();
    await expect(readerShell.locator('.editorial-sidebar')).toBeVisible();
    await expect(readerShell.locator('.editorial-summary-box')).toBeVisible();
    await expect(readerShell.locator('.editorial-related-box')).toBeVisible();
    await expect(readerShell.locator('.editorial-market-box')).toBeVisible();

    // Return to catalog
    await readerShell.locator('.editorial-topbar button.ed-btn-back').click();
    await expect(page.locator('#ed-catalog-view')).toBeVisible();
  });
});

test.describe('Task 2: Responsive Viewport & Overflow Stress Testing', () => {
  for (const vp of VIEWPORTS) {
    for (const route of MARKETING_ROUTES) {
      test(`${route.name} at ${vp.name} has zero horizontal overflow & valid layout`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');

        // Check horizontal overflow: scrollWidth must equal window.innerWidth (allowing max 1px rounding)
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
          const clientW = window.innerWidth;
          const hasOverflow = scrollW > clientW + 1;
          const elementsWithOverflow: string[] = [];
          if (hasOverflow) {
            document.querySelectorAll('*').forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.right > clientW + 1) {
                elementsWithOverflow.push(`${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')} (right: ${rect.right}px > ${clientW}px)`);
              }
            });
          }
          return { hasOverflow, scrollW, clientW, elementsWithOverflow: elementsWithOverflow.slice(0, 5) };
        });

        expect(overflow.hasOverflow, `Route ${route.path} overflowed on ${vp.name}: scrollW=${overflow.scrollW}, clientW=${overflow.clientW}, elements=${overflow.elementsWithOverflow.join('; ')}`).toBe(false);
      });
    }
  }
});

test.describe('Task 3: Navigation Links & Hash Anchor Smoothness', () => {
  test('All 6 Header navigation links resolve cleanly with active states', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header.mk-header nav.mk-nav');
    const links = nav.locator('a');
    await expect(links).toHaveCount(6);

    const expected = [
      { text: 'Trang chủ', href: '/' },
      { text: 'Cách hoạt động', href: '/cach-hoat-dong' },
      { text: 'Mô phỏng', href: '/mo-phong' },
      { text: 'Kiến thức', href: '/kien-thuc' },
      { text: 'Giới thiệu', href: '/#gioi-thieu' },
      { text: 'Trợ lý AI', href: '/tro-ly-ai' },
    ];

    for (let i = 0; i < 6; i++) {
      const link = links.nth(i);
      await expect(link).toHaveText(expected[i].text);
      await expect(link).toHaveAttribute('href', expected[i].href);
    }
  });

  test('All 6 Drawer navigation links on mobile (390px) open and navigate cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const menuBtn = page.locator('button.mk-menu');
    await expect(menuBtn).toBeVisible();

    const expectedLinks = [
      { text: 'Trang chủ', pathRegex: /\/$/ },
      { text: 'Cách hoạt động', pathRegex: /\/cach-hoat-dong$/ },
      { text: 'Mô phỏng', pathRegex: /\/mo-phong$/ },
      { text: 'Kiến thức', pathRegex: /\/kien-thuc$/ },
      { text: 'Giới thiệu', pathRegex: /\/#gioi-thieu$/ },
      { text: 'Trợ lý AI', pathRegex: /\/tro-ly-ai$/ },
    ];

    for (const item of expectedLinks) {
      await menuBtn.click();
      const mobileNav = page.locator('nav.mk-mobile-nav');
      await expect(mobileNav).toBeVisible();
      const targetLink = mobileNav.locator('a', { hasText: item.text }).first();
      await expect(targetLink).toBeVisible();
      await targetLink.click();
      await expect(page).toHaveURL(item.pathRegex);
      await expect(page.locator('nav.mk-mobile-nav')).toHaveCount(0); // Drawer must close
    }
  });

  test('Hash anchor navigation: /#gioi-thieu scrolls properly on homepage', async ({ page }) => {
    await page.goto('/');
    const introLink = page.locator('header.mk-header nav.mk-nav a[href="/#gioi-thieu"]');
    await introLink.click();
    await page.waitForTimeout(500);

    const isInView = await page.evaluate(() => {
      const el = document.getElementById('gioi-thieu');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= -50 && rect.top <= window.innerHeight;
    });
    expect(isInView).toBe(true);
  });

  test('Hash anchor navigation: /#gioi-thieu from /mo-phong navigates to homepage and scrolls', async ({ page }) => {
    await page.goto('/mo-phong');
    const introLink = page.locator('header.mk-header nav.mk-nav a[href="/#gioi-thieu"]');
    await introLink.click();
    await expect(page).toHaveURL(/\/#gioi-thieu$/);
    await page.waitForTimeout(600);

    const isInView = await page.evaluate(() => {
      const el = document.getElementById('gioi-thieu');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= -50 && rect.top <= window.innerHeight;
    });
    expect(isInView).toBe(true);
  });

  test('Hash anchor check on /#kien-thuc (Challenge: Does legacy redirect strip hash?)', async ({ page }) => {
    await page.goto('/#kien-thuc');
    await page.waitForTimeout(600);
    const url = page.url();
    // Does the URL retain #kien-thuc or was it redirected to '/'?
    const hasHash = url.endsWith('#kien-thuc');
    const isSection5InView = await page.evaluate(() => {
      const el = document.getElementById('kien-thuc');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= -50 && rect.top <= window.innerHeight;
    });
    console.log(`[CHALLENGE RESULT] /#kien-thuc final url: ${url}, hasHash: ${hasHash}, isSection5InView: ${isSection5InView}`);
  });

  test('Knowledge Article Hash Anchors activate Reader view directly', async ({ page }) => {
    await page.goto('/kien-thuc#can-bao-nhieu-tien-de-nghi-huu');
    await expect(page.locator('#ed-reader-view')).toBeVisible();
    await expect(page.locator('.editorial-headline')).toHaveText('Cần bao nhiêu tiền để nghỉ hưu an tâm tại Việt Nam?');

    // Switch hash to another article
    await page.goto('/kien-thuc#luong-huu-bhxh-tinh-the-nao');
    await expect(page.locator('#ed-reader-view')).toBeVisible();
    await expect(page.locator('.editorial-headline')).toHaveText('Lương hưu BHXH tính thế nào theo quy định mới nhất?');
  });
});
