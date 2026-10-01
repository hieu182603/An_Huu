import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateAssets } from './validate-assets.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'an-huu-assets-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('an-huu-assets-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'public/images'), { recursive: true });
  await mkdir(path.join(root, 'src/assets'), { recursive: true });
  return root;
}

test('accepts the actual checked-out assets', async () => {
  assert.ok(await validateAssets() > 0);
});

for (const filename of ['public/images/hero.jpg', 'src/assets/logo.png']) {
  test(`rejects an unresolved LFS pointer in ${filename}`, async (t) => {
    const root = await fixture(t);
    await writeFile(path.join(root, filename), `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 849309\n`);
    await assert.rejects(validateAssets(root), /unresolved Git LFS pointer/);
  });
}

test('rejects an empty image', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'public/images/empty.jpg'), '');
  await assert.rejects(validateAssets(root), /image is empty/);
});
