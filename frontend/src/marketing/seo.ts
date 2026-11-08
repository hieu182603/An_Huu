import { normalizePublicPath, pageMetadata } from './content';

export function validatedSiteUrl(value: string | undefined) {
  if (!value) return '';
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_SITE_URL must be an http(s) origin, without a path, credentials or query.');
  }
  return url.origin;
}

const defaultKeywords = 'kế hoạch hưu trí, tài chính cá nhân, tính tiền nghỉ hưu, hưu trí việt nam, mô phỏng hưu trí, bảo hiểm xã hội, an hưu, độc lập tài chính, FIRE việt nam';

const configuredOrigin = validatedSiteUrl(import.meta.env.VITE_SITE_URL);
export function structuredData(pathname: string, origin = configuredOrigin) {
  const path = normalizePublicPath(pathname);
  const meta = pageMetadata[path];
  if (!meta) return null;

  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      name: 'An Hưu',
      ...(origin ? { '@id': `${origin}/#organization`, url: origin, logo: `${origin}/logo.png` } : {}),
      description: 'Nền tảng lập kế hoạch tài chính hưu trí độc lập 100% cho người Việt.',
      slogan: 'Lập kế hoạch hôm nay — Cho an yên ngày mai.'
    },
    {
      '@type': 'WebSite',
      name: 'An Hưu',
      inLanguage: 'vi-VN',
      ...(origin ? { '@id': `${origin}/#website`, url: `${origin}/` } : {})
    },
    {
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      inLanguage: 'vi-VN',
      ...(origin ? { url: `${origin}${path}`, isPartOf: { '@id': `${origin}/#website` } } : {})
    },
    ...(origin && path !== '/' ? [{
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: meta.title.split(' | ')[0], item: `${origin}${path}` },
      ]
    }] : []),
  ];

  if (path === '/' || path === '/mo-phong') {
    graph.push({
      '@type': 'WebApplication',
      ...(origin ? { '@id': `${origin}/#software` } : {}),
      name: 'An Hưu — Công cụ mô phỏng & Lập kế hoạch hưu trí',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'All',
      browserRequirements: 'Requires JavaScript. Requires HTML5.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'VND'
      },
      description: 'Công cụ tính toán số tiền cần có khi nghỉ hưu, lương hưu BHXH và xác định khoảng thiếu hụt tài chính miễn phí.',
      featureList: [
        'Mô phỏng hưu trí nhanh (Instant Simulator)',
        'Tính toán khoảng thiếu hụt quỹ hưu trí (Funding Gap)',
        'Tích hợp Luật Bảo hiểm Xã hội Việt Nam (BHXH)',
        'Mô hình phân bổ 3 rổ tài sản: An toàn, Tích lũy, Tăng trưởng',
        'Đối soát dòng tiền thực tế định kỳ',
        'Trợ lý giải thích tài chính hưu trí'
      ],
      ...(origin ? { url: `${origin}/mo-phong` } : {})
    });
  }

  if (['/', '/mo-phong', '/tro-ly-ai', '/kien-thuc', '/cach-hoat-dong'].includes(path)) {
    graph.push({
      '@type': 'FAQPage',
      ...(origin ? { '@id': `${origin}${path}#faq` } : {}),
      mainEntity: [
        {
          '@type': 'Question',
          name: 'An Hưu là gì và giải quyết bài toán gì?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'An Hưu là nền tảng lập kế hoạch tài chính hưu trí độc lập tại Việt Nam, giúp người dùng chuyển đổi bài toán hưu trí phức tạp thành lộ trình hành động định lượng rõ ràng. Hệ thống giúp xác định chính xác khoảng thiếu hụt tài chính (Funding Gap), mức tiết kiệm cần thiết mỗi tháng, ước tính quyền lợi BHXH và phân bổ tài sản thông minh theo 3 rổ (An toàn, Tích lũy, Tăng trưởng).'
          }
        },
        {
          '@type': 'Question',
          name: 'An Hưu có bán bảo hiểm hay liên kết hoa hồng không?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Không. An Hưu cam kết độc lập 100% (Zero Bias). Hệ thống hoàn toàn không bán chéo bảo hiểm, không quảng cáo sản phẩm tài chính và không nhận hoa hồng phân phối. Mọi phân tích và khuyến nghị đều xuất phát từ lợi ích khách quan của người dùng.'
          }
        },
        {
          '@type': 'Question',
          name: 'Công cụ tính hưu trí An Hưu dựa trên cơ sở tính toán nào?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Hệ thống dựa trên mô hình chuẩn hóa giá trị tiền tệ thời gian (Time Value of Money), tác động lạm phát lũy kế tại Việt Nam và cơ chế mô phỏng quyền lợi Bảo hiểm Xã hội (BHXH) chuẩn theo quy định pháp luật Việt Nam hiện hành.'
          }
        },
        {
          '@type': 'Question',
          name: 'Quy tắc 3 rổ tài sản cho người nghỉ hưu là gì?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Mô hình 3 rổ tài sản của An Hưu gồm: Rổ An toàn (tiền mặt, tiền gửi ngắn hạn để chi trả sinh hoạt 2-3 năm), Rổ Tích lũy (trái phiếu, chứng chỉ tiền gửi, tài sản tạo dòng tiền ổn định) và Rổ Tăng trưởng (cổ phiếu, chứng chỉ quỹ để chống lại lạm phát dài hạn).'
          }
        },
        {
          '@type': 'Question',
          name: 'Tôi có thể dùng thử tính năng mô phỏng hưu trí mà không cần tạo tài khoản không?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Có. An Hưu cung cấp thanh trượt mô phỏng hưu trí nhanh (Instant Simulator) trên web, cho phép bạn nhập tuổi, mức chi tiêu mong muốn và số tiền tiết kiệm hàng tháng để xem ngay kết quả dự phóng mà không cần đăng ký tài khoản hay để lại thông tin cá nhân.'
          }
        }
      ]
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph
  };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function renderSeoHead(path: string, origin = configuredOrigin) {
  const meta = pageMetadata[normalizePublicPath(path)];
  const canonical = origin ? `${origin}${normalizePublicPath(path)}` : '';
  const keywords = meta.keywords || defaultKeywords;
  const llmsUrl = origin ? `${origin}/llms.txt` : '/llms.txt';
  return `<title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta name="keywords" content="${escapeHtml(keywords)}" />
    <meta name="author" content="An Hưu" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="An Hưu" />
    <meta property="og:locale" content="vi_VN" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <link rel="alternate" type="text/plain" href="${escapeHtml(llmsUrl)}" title="LLM Context" />
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
