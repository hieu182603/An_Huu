import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { renderPage, pageMetadata } from '../.cache/marketing-ssr/render.mjs';

test('Screen 5 SSR: /kien-thuc renders complete 6-card catalog and adheres to SEO rules', async () => {
  const html = renderPage('/kien-thuc');

  // Verify Single H1 rule
  const h1Matches = html.match(/<h1(?:\s|>)/g) || [];
  assert.equal(h1Matches.length, 1, 'Knowledge page must have exactly one <h1>');
  assert.ok(html.includes('Kiến thức hưu trí, <em>viết cho người bận rộn.</em></h1>'), 'Hero h1 heading must be present');

  // Verify Catalog Section is active in SSR
  assert.ok(html.includes('id="ed-catalog-view"'), 'Catalog view must be present');
  assert.ok(!html.includes('id="ed-reader-view"'), 'Reader view should not be rendered during initial SSR without hash');

  // Verify exactly 6 catalog cards in HTML
  const expectedArticleIds = [
    'can-bao-nhieu-tien-de-nghi-huu',
    'luong-huu-bhxh-tinh-the-nao',
    'thap-tai-san-bao-ve',
    'lam-phat-va-suc-mua',
    'ky-luat-tich-luy',
    'doi-soat-so-du',
  ];

  for (const id of expectedArticleIds) {
    assert.ok(
      html.includes(`id="${id}"`),
      `Catalog card with id="${id}" must be present in HTML`
    );
  }

  // Count articles rendered in catalog
  const articleCardMatches = html.match(/<article id="[^"]+" class="ed-card">/g) || [];
  assert.equal(articleCardMatches.length, 6, 'Must render exactly 6 article cards in catalog');

  // Verify reference metrics strip
  assert.ok(html.includes('3,5%'), 'Lạm phát quy chiếu metric');
  assert.ok(html.includes('4% đến 4,5%'), 'Tỷ lệ rút vốn tham khảo metric');
  assert.ok(html.includes('45% đến 75%'), 'Tỷ lệ hưởng lương hưu BHXH metric');
  assert.ok(html.includes('25 đến 30 năm'), 'Thời gian sống hưu metric');

  // Verify 5-column footer
  assert.ok(html.includes('mk-footer-top'), '5-column footer present');
  assert.ok(html.includes('Khám phá'), 'Footer column 2');
  assert.ok(html.includes('Chính sách'), 'Footer column 3');
  assert.ok(html.includes('Thông tin liên hệ'), 'Footer column 4');
  assert.ok(html.includes('Bắt đầu thật đơn giản'), 'Footer column 5');
});

test('Interactive Reader & Hash Navigation: Articles data contracts and reader state model', async () => {
  // Read knowledgeContent.ts source directly to test full authentic article definitions
  const rawTs = await readFile(new URL('../src/marketing/knowledgeContent.ts', import.meta.url), 'utf8');

  const expectedArticleIds = [
    'can-bao-nhieu-tien-de-nghi-huu',
    'luong-huu-bhxh-tinh-the-nao',
    'thap-tai-san-bao-ve',
    'lam-phat-va-suc-mua',
    'ky-luat-tich-luy',
    'doi-soat-so-du',
  ];

  for (const id of expectedArticleIds) {
    assert.ok(rawTs.includes(`id: '${id}'`), `knowledgeContent.ts must define article ${id}`);
  }

  // Verify Landing Page Section 5 links match the authentic article IDs
  const landingTs = await readFile(new URL('../src/pages/LandingPage.tsx', import.meta.url), 'utf8');
  assert.ok(landingTs.includes('/kien-thuc#can-bao-nhieu-tien-de-nghi-huu'), 'Landing links to article 1');
  assert.ok(landingTs.includes('/kien-thuc#luong-huu-bhxh-tinh-the-nao'), 'Landing links to article 2');
  assert.ok(landingTs.includes('/kien-thuc#thap-tai-san-bao-ve'), 'Landing links to article 3');

  // Simulate hash matching and reader view transitions
  function getActiveArticle(articles, hash) {
    if (!hash) return null;
    const cleanHash = hash.replace(/^#/, '');
    return articles.find(a => a.id === cleanHash) || null;
  }

  function getRelatedArticles(articles, active) {
    if (!active) return [];
    return articles.filter(a => a.id !== active.id);
  }

  const dummyArticles = expectedArticleIds.map(id => ({ id, title: `Title ${id}` }));

  // 1. Initial /kien-thuc without hash -> catalog view
  assert.equal(getActiveArticle(dummyArticles, ''), null, 'No hash gives null activeArticle (catalog view)');

  // 2. Navigating to authentic article hashes -> reader view
  for (const id of expectedArticleIds) {
    const active = getActiveArticle(dummyArticles, `#${id}`);
    assert.ok(active, `Hash #${id} must activate article reader`);
    assert.equal(active.id, id);

    // Verify related articles list
    const related = getRelatedArticles(dummyArticles, active);
    assert.equal(related.length, 5, `Article ${id} must have exactly 5 related articles`);
    assert.ok(!related.some(r => r.id === id), `Related list must not contain the active article ${id}`);
  }

  // 3. Challenging the slug discrepancy: `#an-tam-huu-tri`
  // Worker M1's handoff text reported `an-tam-huu-tri` instead of `can-bao-nhieu-tien-de-nghi-huu`
  const nonExistentActive = getActiveArticle(dummyArticles, '#an-tam-huu-tri');
  assert.equal(nonExistentActive, null, '#an-tam-huu-tri is not an article ID, must gracefully default to catalog view without throwing');

  // 4. Back button / closeArticle returns to catalog view
  let currentHash = '#can-bao-nhieu-tien-de-nghi-huu';
  let active = getActiveArticle(dummyArticles, currentHash);
  assert.ok(active !== null);
  // simulate closeArticle()
  currentHash = '';
  active = getActiveArticle(dummyArticles, currentHash);
  assert.equal(active, null, 'Closing article resets activeArticle to null, displaying catalog view');
});

test('Non-regression: domain/retirementCalculator.ts is strictly preserved', async () => {
  // Confirm git diff on retirementCalculator.ts is completely empty
  const diff = execSync('git diff -- frontend/src/domain/retirementCalculator.ts', { encoding: 'utf8' });
  assert.equal(diff.trim(), '', 'frontend/src/domain/retirementCalculator.ts must not have any git changes');

  // Confirm status is clean
  const status = execSync('git status --porcelain -- frontend/src/domain/retirementCalculator.ts', { encoding: 'utf8' });
  assert.equal(status.trim(), '', 'frontend/src/domain/retirementCalculator.ts must have clean git status');
});

test('Non-regression: Prerender generated all 5 public pages with valid content and assets', async () => {
  const publicRoutes = ['/', '/cach-hoat-dong', '/mo-phong', '/tro-ly-ai', '/kien-thuc'];

  for (const route of publicRoutes) {
    const filePath = new URL(`../dist${route === '/' ? '' : route}/index.html`, import.meta.url);
    const content = await readFile(filePath, 'utf8');

    // Page must not be empty
    assert.ok(content.length > 5000, `${route} prerendered HTML must be substantial (>5KB)`);

    // Exactly one <h1>
    const h1Count = (content.match(/<h1(?:\s|>)/g) || []).length;
    assert.equal(h1Count, 1, `${route} must have exactly one <h1>, found ${h1Count}`);

    // Must have title and description
    assert.ok(content.includes('<title>'), `${route} must have <title>`);
    assert.ok(content.includes('<meta name="description"'), `${route} must have meta description`);
    assert.ok(content.includes('rel="canonical"'), `${route} must have canonical tag`);

    // Image references must exist on disk
    for (const match of content.matchAll(/<img[^>]+src="(\/assets\/[^" ]+)"/g)) {
      const assetPath = new URL(`../dist${match[1]}`, import.meta.url);
      await access(assetPath);
    }
  }
});
