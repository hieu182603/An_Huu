import { normalizePublicPath, pageMetadata } from './content';

export function validatedSiteUrl(value: string | undefined) {
  if (!value) return '';
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_SITE_URL must be an http(s) origin, without a path, credentials or query.');
  }
  return url.origin;
}

const configuredOrigin = validatedSiteUrl(import.meta.env.VITE_SITE_URL);
export function structuredData(pathname: string, origin = configuredOrigin) {
  const path = normalizePublicPath(pathname);
  const meta = pageMetadata[path];
  if (!meta) return null;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'An Hưu', ...(origin ? { '@id': `${origin}/#organization`, url: origin, logo: `${origin}/logo.png` } : {}) },
      { '@type': 'WebSite', name: 'An Hưu', inLanguage: 'vi-VN', ...(origin ? { '@id': `${origin}/#website`, url: `${origin}/` } : {}) },
      { '@type': 'WebPage', name: meta.title, description: meta.description, inLanguage: 'vi-VN', ...(origin ? { url: `${origin}${path}`, isPartOf: { '@id': `${origin}/#website` } } : {}) },
      ...(origin && path !== '/' ? [{ '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: meta.title.split(' | ')[0], item: `${origin}${path}` },
      ] }] : []),
    ],
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderSeoHead(path: string, origin = configuredOrigin) {
  const meta = pageMetadata[normalizePublicPath(path)];
  const canonical = origin ? `${origin}${normalizePublicPath(path)}` : '';
  return `<title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="An Hưu" />
    <meta property="og:locale" content="vi_VN" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${escapeHtml(origin)}/images/social-preview.jpg" /><meta property="og:image:alt" content="An Hưu - Chuẩn bị cho cuộc sống nghỉ hưu" /><meta name="twitter:image" content="${escapeHtml(origin)}/images/social-preview.jpg" />` : ''}
    <script type="application/ld+json" id="marketing-schema">${JSON.stringify(structuredData(path, origin)).replace(/</g, '\\u003c')}</script>`;
}

export function applyPageSeo(pathname: string) {
  const path = normalizePublicPath(pathname);
  const meta = pageMetadata[path];
  document.querySelectorAll('meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],#marketing-schema').forEach(node => node.remove());
  if (meta) {
    document.querySelector('title')?.remove();
    document.head.insertAdjacentHTML('beforeend', renderSeoHead(path));
  } else {
    const heading = document.querySelector('.settings-content h2') ?? document.querySelector('h1');
    document.title = `${heading?.textContent ?? 'Nền tảng hưu trí'} | An Hưu`;
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, follow'; document.head.appendChild(robots);
  }
}
