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
      rule.destination === '/index.html' && matches(rule.source, new URL(url, 'https://example.test').pathname),
    );
    for (const url of ['/', '/login', '/user/explore', '/admin/settings/general', '/admin/users/user.123/profile']) {
      assert.equal(rewritesToHtml(url), true, url);
    }
    for (const url of ['/images/missing.jpg', '/images/missing', '/assets/missing.js', '/assets/hero-abc.jpg', '/logo.png', '/missing.JPG?v=2', '/favicon.ico', '/robots.txt']) {
      assert.equal(rewritesToHtml(url), false, url);
    }
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
