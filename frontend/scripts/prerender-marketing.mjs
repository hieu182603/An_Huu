import { build, loadEnv } from 'vite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({ root, ssr: { noExternal: ['gsap', '@gsap/react'] }, build: { ssr: 'src/marketing/prerender.tsx', outDir: '.cache/marketing-ssr', emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'render.mjs' } } } });
const { renderPage, renderSeoHead, validatedSiteUrl, pageMetadata } = await import(pathToFileURL(path.join(root, '.cache/marketing-ssr/render.mjs')).href);
const env = { ...loadEnv('production', root, ''), ...process.env };
const origin = validatedSiteUrl(env.VITE_SITE_URL);
const dist = path.join(root, 'dist');
const assetFiles = await readdir(path.join(dist, 'assets'));
const jsFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));
const cssFile = assetFiles.find(f => f.startsWith('index-') && f.endsWith('.css'));

const template = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#10385b" />
    <link rel="icon" type="image/png" href="/logo.png" />
    <script type="module" crossorigin src="/assets/${jsFile}"></script>
    <link rel="stylesheet" crossorigin href="/assets/${cssFile}">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

const appShell = template.replace('</head>', '    <meta name="robots" content="noindex, follow" />\n  </head>');
await writeFile(path.join(dist, 'app-shell.html'), appShell);

for (const route of Object.keys(pageMetadata)) {
  const folder = path.join(dist, route.slice(1));
  await mkdir(folder, { recursive: true });
  const html = template
    .replace('</head>', `${renderSeoHead(route, origin)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${renderPage(route)}</div>`);
  await writeFile(path.join(folder, 'index.html'), html);
}
const robots = `User-agent: *\nAllow: /\nDisallow: /user/\nDisallow: /admin/\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`;
await writeFile(path.join(dist, 'robots.txt'), robots);
if (origin) {
  const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const urls = Object.keys(pageMetadata).map(route => `  <url><loc>${escapeXml(origin + route)}</loc></url>`).join('\n');
  await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
} else {
  console.warn('SEO: VITE_SITE_URL is not set. Public HTML and metadata are ready; canonical URLs and sitemap will be generated once a domain is configured.');
}
console.log(`Prerendered ${Object.keys(pageMetadata).length} public pages.`);
