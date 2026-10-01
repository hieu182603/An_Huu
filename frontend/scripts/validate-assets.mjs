import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));

// Vite can copy an unresolved LFS pointer into dist without failing the build.
export async function validateAssets(root = frontendRoot) {
  let checked = 0;
  const errors = [];

  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await scan(filename);
      } else if (entry.isFile()) {
        const handle = await open(filename, 'r');
        try {
          const prefix = Buffer.alloc(256);
          const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
          const label = path.relative(root, filename);
          if (prefix.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '').startsWith('version https://git-lfs.github.com/spec/v1')) {
            errors.push(`${label}: unresolved Git LFS pointer. Restore the real file (git lfs pull), then commit the image bytes or enable LFS retrieval in the build environment.`);
          } else if (bytesRead === 0 && /\.(png|jpe?g|svg|ico|webp|avif|gif)$/i.test(filename)) {
            errors.push(`${label}: image is empty.`);
          }
          checked++;
        } finally {
          await handle.close();
        }
      }
    }
  }

  for (const directory of ['public', 'src/assets']) {
    await scan(path.join(root, directory));
  }
  if (errors.length) throw new Error(`Asset validation failed:\n${errors.join('\n')}`);
  return checked;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(`Asset validation passed (${await validateAssets()} files).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
