import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { pageMetadata, renderSeoHead, validatedSiteUrl } from '../.cache/marketing-ssr/render.mjs';

test('every public route has distinct prerendered HTML, metadata and valid local images', async () => {
  const titles = new Set();
  for (const [route, meta] of Object.entries(pageMetadata)) {
    const html = await readFile(new URL(`../dist${route === '/' ? '' : route}/index.html`, import.meta.url), 'utf8');
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, route);
    assert.ok(html.includes(`<title>${meta.title}</title>`), route);
    assert.ok(html.includes('content="index, follow, max-image-preview:large"'), route);
    assert.ok(!html.includes('content="noindex'), route);
    const json = html.match(/<script type="application\/ld\+json" id="marketing-schema">(.*?)<\/script>/s)[1];
    assert.equal(JSON.parse(json)['@context'], 'https://schema.org');
    for (const match of html.matchAll(/<img[^>]+src="(\/assets\/[^" ]+)"/g)) {
      await access(new URL(`../dist${match[1]}`, import.meta.url));
    }
    titles.add(meta.title);
  }
  assert.equal(titles.size, Object.keys(pageMetadata).length);
});

test('the SPA fallback does not expose homepage content or indexable metadata', async () => {
  const html = await readFile(new URL('../dist/app-shell.html', import.meta.url), 'utf8');
  assert.ok(html.includes('content="noindex, follow"'));
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(!html.includes('marketing-schema'));
});

test('domain configuration produces per-page canonical and social URLs without placeholders', () => {
  for (const route of Object.keys(pageMetadata)) {
    const configured = renderSeoHead(route, validatedSiteUrl('https://retirement.example/'));
    assert.ok(configured.includes(`rel="canonical" href="https://retirement.example${route}"`));
    assert.ok(configured.includes('https://retirement.example/images/social-preview.jpg'));
    const unconfigured = renderSeoHead(route, '');
    assert.ok(!unconfigured.includes('rel="canonical"'));
    assert.ok(!unconfigured.includes('retirement.example'));
  }
  for (const invalid of ['javascript:alert(1)', 'https://example.com/subpath', 'https://user:pass@example.com/', 'not-a-url']) {
    assert.throws(() => validatedSiteUrl(invalid));
  }
});
