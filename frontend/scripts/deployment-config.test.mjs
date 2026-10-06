import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const configs = await Promise.all(['../../vercel.json', '../vercel.json'].map(async (file) =>
  JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8')),
));
const matches = (source, pathname) => new RegExp(`^${source}$`).test(pathname);

test('both Vercel root directory choices use the same routing and cache rules', () => {
  assert.deepEqual(configs[0].rewrites, configs[1].rewrites);
  assert.deepEqual(configs[0].headers, configs[1].headers);
});

for (const [index, config] of configs.entries()) {
  test(`config ${index}: page URLs retain SPA fallback; missing assets cannot return index.html`, () => {
    const rewritesToHtml = (url) => config.rewrites.some((rule) =>
      rule.destination.endsWith('.html') && matches(rule.source, new URL(url, 'https://example.test').pathname),
    );
    for (const url of ['/', '/login', '/user/explore', '/admin/settings/general', '/admin/users/user.123/profile']) {
      assert.equal(rewritesToHtml(url), true, url);
    }
    for (const url of ['/images/missing.jpg', '/images/missing', '/assets/missing.js', '/assets/hero-abc.jpg', '/logo.png', '/missing.JPG?v=2', '/favicon.ico', '/robots.txt']) {
      assert.equal(rewritesToHtml(url), false, url);
    }
  });

  test(`config ${index}: public routes serve their own prerendered content`, () => {
    for (const url of ['/cach-hoat-dong', '/mo-phong', '/tro-ly-ai', '/kien-thuc', '/kien-thuc/hieu-ve-lam-phat']) {
      const first = config.rewrites.find(rule => matches(rule.source, url));
      assert.equal(first.destination, `${url}/index.html`);
      assert.equal(config.rewrites.find(rule => matches(rule.source, `${url}/`)).destination, `${url}/index.html`);
    }
    assert.equal(config.rewrites.find(rule => matches(rule.source, '/login')).destination, '/app-shell.html');
    assert.equal(config.rewrites.find(rule => matches(rule.source, '/kien-thuc/not-a-real-article')).destination, '/app-shell.html');
  });

  test(`config ${index}: api and health endpoints proxy to Azure backend`, () => {
    const apiRule = config.rewrites.find(rule => matches(rule.source, '/api/v1/auth/login'));
    assert.ok(apiRule, 'API rewrite rule must exist');
    assert.match(apiRule.destination, /^https:\/\/anhuu-backend-addwbfcshng0hcf7\.japaneast-01\.azurewebsites\.net/);

    const healthRule = config.rewrites.find(rule => matches(rule.source, '/health/ready'));
    assert.ok(healthRule, 'Health rewrite rule must exist');
    assert.match(healthRule.destination, /^https:\/\/anhuu-backend-addwbfcshng0hcf7\.japaneast-01\.azurewebsites\.net/);
  });

  test(`config ${index}: only fingerprinted assets get immutable caching`, () => {
    const cacheHeaders = (url) => config.headers
      .filter((rule) => matches(rule.source, url))
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key.toLowerCase() === 'cache-control')
      .map((header) => header.value);
    assert.deepEqual(cacheHeaders('/assets/hero-abc.jpg'), ['public, max-age=31536000, immutable']);
    for (const url of ['/images/auth-story.jpg', '/logo.png', '/missing.svg']) {
      assert.deepEqual(cacheHeaders(url), ['public, max-age=0, must-revalidate']);
    }
  });
}
