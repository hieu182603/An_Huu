import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import KnowledgeLibrary, { KnowledgeGlossary } from '../components/KnowledgeLibraryApi';
import { Icon } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import MarketingLayout, { FinalCTA } from '../marketing/MarketingLayout';
import { ARTICLES_DATA, type KnowledgeArticle } from '../marketing/knowledgeContent';
import './explore-products.css';

// User Area View (preserves full bookmark & library API tests for /user/knowledge)
function UserKnowledgeView() {
  const { user } = useAuth();
  const { language } = useI18n();
  const isEn = language === 'en';
  const [selectedCategory, setSelectedCategory] = useState('all');
  const categories = [
    { id: 'all', label: isEn ? 'All topics' : 'Tất cả chủ đề', icon: 'compass' as const },
    { id: 'bhxh', label: isEn ? 'Social insurance (BHXH)' : 'Bảo hiểm xã hội (BHXH)', icon: 'file-text' as const },
    { id: 'invest', label: isEn ? 'Investing & funds' : 'Đầu tư & quỹ', icon: 'chart' as const },
    { id: 'health', label: isEn ? 'Health & insurance' : 'Sức khỏe & bảo hiểm', icon: 'life-buoy' as const },
    { id: 'lifestyle', label: isEn ? 'Retirement life' : 'Cuộc sống hưu trí', icon: 'sparkles' as const },
  ];

  return (
    <div className="products-page knowledge-page">
      <header className="products-head">
        <div>
          <h1>{isEn ? 'Financial knowledge' : 'Kiến thức tài chính'}</h1>
          <p>{isEn ? 'Short guides to understand the figures in your plan.' : 'Bài viết ngắn giúp bạn hiểu các con số trong kế hoạch.'}</p>
        </div>
      </header>
      <div className="explore-category-tabs knowledge-topics">
        {categories.map(c => (
          <button key={c.id} type="button" className={selectedCategory === c.id ? 'is-active' : ''} aria-pressed={selectedCategory === c.id} onClick={() => setSelectedCategory(c.id)}>
            <Icon name={c.icon} size="small" /><span>{c.label}</span>
          </button>
        ))}
      </div>
      <KnowledgeLibrary key={user?.id || 'guest'} userId={user?.id || 'guest'} category={selectedCategory} resetCategory={() => setSelectedCategory('all')} />
      <KnowledgeGlossary />
    </div>
  );
}

// Public Marketing Editorial Knowledge View (matching sites/an-huu-trai-nghiem/dist/kien-thuc.html)
function PublicKnowledgeView() {
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const [hashArticleId, setHashArticleId] = useState(() => (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''));

  useEffect(() => {
    const handleHashChange = () => {
      setHashArticleId(window.location.hash.replace(/^#/, ''));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const activeArticle: KnowledgeArticle | null = useMemo(() => {
    if (!hashArticleId) return null;
    return ARTICLES_DATA.find(a => a.id === hashArticleId) || null;
  }, [hashArticleId]);

  const openArticle = (id: string) => {
    window.location.hash = id;
    setHashArticleId(id);
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  const closeArticle = () => {
    window.history.pushState('', document.title, window.location.pathname);
    setHashArticleId('');
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  const shareArticle = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const relatedArticles = useMemo(() => {
    if (!activeArticle) return [];
    return ARTICLES_DATA.filter(a => a.id !== activeArticle.id);
  }, [activeArticle]);

  return (
    <MarketingLayout>
      <div className="mk-knowledge-page">
        {/* Hero Section */}
        <section className="ed-hero ed-hero-kb">
          <div className="mk-container ed-hero-grid">
            <div className="ed-hero-copy">
              <nav className="mk-breadcrumb ed-breadcrumb" aria-label="Đường dẫn trang">
                <Link to="/">Trang chủ</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Kiến thức hưu trí</span>
              </nav>
              <h1>Kiến thức hưu trí, <em>viết cho người bận rộn.</em></h1>
              <p className="ed-lead">
                Hiểu rõ số liệu. Tự tin bước vào tuổi già. Trang bị kiến thức tài chính hưu trí thực tế, công thức lương hưu BHXH và nguyên lý tích lũy bền vững.
              </p>
              <div className="ed-actions">
                <button
                  type="button"
                  className="mk-button"
                  onClick={() => openArticle(ARTICLES_DATA[0].id)}
                >
                  <span>Bắt đầu đọc</span>
                  <Icon name="arrow-right" />
                </button>
                <Link to="/mo-phong" className="ed-link-btn">
                  Thử tính kế hoạch của tôi →
                </Link>
              </div>
            </div>

            <div
              className="ed-feature-card"
              role="button"
              tabIndex={0}
              onClick={() => openArticle(ARTICLES_DATA[0].id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openArticle(ARTICLES_DATA[0].id); }}
            >
              <img
                src={ARTICLES_DATA[0].image}
                alt="Tuổi già thảnh thơi bên người thân"
                width="720"
                height="480"
                fetchPriority="high"
              />
              <span className="ed-feature-body">
                <span className="ed-tag">Chuyên đề trọng tâm</span>
                <strong>{ARTICLES_DATA[0].title}</strong>
                <span className="ed-meta">5 phút đọc · Tỷ lệ rút an toàn 4% - 4,5%</span>
              </span>
            </div>
          </div>
        </section>

        {/* Reference Metrics Strip */}
        <section className="ed-metrics" aria-label="Các con số tham chiếu">
          <div className="mk-container ed-metrics-grid">
            <div><strong>3,5%</strong><span>lạm phát quy chiếu mỗi năm</span></div>
            <div><strong>4% đến 4,5%</strong><span>tỷ lệ rút vốn tham khảo mỗi năm</span></div>
            <div><strong>45% đến 75%</strong><span>tỷ lệ hưởng lương hưu BHXH</span></div>
            <div><strong>25 đến 30 năm</strong><span>thời gian sống hưu cần chuẩn bị</span></div>
          </div>
        </section>

        {/* VIEW 1: CATALOG CARD GRID VIEW */}
        {!activeArticle && (
          <section id="ed-catalog-view" className="ed-catalog-section">
            <div className="mk-container">
              <div className="ed-catalog-header">
                <span className="ed-eyebrow">THƯ VIỆN CHUYÊN ĐỀ HƯU TRÍ</span>
                <h2>Tất cả bài viết hướng dẫn thực tế</h2>
                <p className="ed-catalog-desc">
                  Trang bị hiểu biết chuẩn xác về mục tiêu vốn, công thức lương hưu BHXH, cách phòng hộ lạm phát và thiết lập tháp tài sản an toàn.
                </p>
              </div>

              <div className="ed-cards-grid">
                {ARTICLES_DATA.map(article => (
                  <article key={article.id} id={article.id} className="ed-card">
                    <div className="ed-card-media" onClick={() => openArticle(article.id)}>
                      <img src={article.image} alt={article.title} loading="lazy" width="380" height="220" />
                      <span className="ed-card-cat-badge">{article.category}</span>
                      <span className="ed-card-time-badge">⏱ {article.readTime}</span>
                    </div>
                    <div className="ed-card-body">
                      <span className="ed-card-kicker">{article.categoryTag}</span>
                      <h3 className="ed-card-title">
                        <button type="button" className="ed-card-title-btn" onClick={() => openArticle(article.id)}>
                          {article.title}
                        </button>
                      </h3>
                      <p className="ed-card-excerpt">{article.sapo}</p>
                      <div className="ed-card-pill">
                        <span>{article.pillText}</span>
                      </div>
                    </div>
                    <div className="ed-card-footer">
                      <button type="button" className="ed-card-action" onClick={() => openArticle(article.id)}>
                        <span>Đọc bài phân tích</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* VIEW 2: INTERACTIVE ARTICLE READER */}
        {activeArticle && (
          <section id="ed-reader-view" className="ed-reader-section">
            <div className="mk-container">
              <div className="knowledge-shell editorial-reader" id="ed-active-reader-shell">
                {/* Top Navigation Bar */}
                <nav className="editorial-topbar" aria-label="Điều hướng bài viết">
                  <button type="button" className="btn secondary small ed-btn-back" onClick={closeArticle}>
                    <Icon name="arrow-left" />
                    <span>Quay lại danh sách bài viết</span>
                  </button>
                  <div className="editorial-topbar-meta">
                    <span>Chuyên mục: <strong>{activeArticle.category}</strong></span>
                    <span>•</span>
                    <span>⏱ <strong>{activeArticle.readTime}</strong></span>
                    <span>•</span>
                    <span>Mã: <strong>{activeArticle.code}</strong></span>
                  </div>
                  <button type="button" className="btn ghost small" onClick={shareArticle}>
                    <span>{copied ? '✓ Đã sao chép liên kết!' : '☆ Chia sẻ bài viết'}</span>
                  </button>
                </nav>

                {/* 2-Column Newspaper Layout */}
                <div className="editorial-newspaper-grid">
                  {/* Left: Main Article Content */}
                  <article className="card editorial-article-main">
                    <header className="editorial-header">
                      <div className="editorial-kicker">
                        <span className="badge-cat-pill">{activeArticle.category}</span>
                        <span className={`badge-risk ${activeArticle.badgeClass}`}>● {activeArticle.badgeText}</span>
                        <span className="badge-strategy">{activeArticle.strategyTag}</span>
                      </div>
                      <h2 className="editorial-headline">{activeArticle.title}</h2>
                      <p className="editorial-sapo">{activeArticle.sapo}</p>
                      <div className="editorial-byline">
                        <span><strong>Ban biên tập Hoạch định Tài chính An Hưu</strong></span>
                        <span>•</span>
                        <span>⏱ {activeArticle.readTime}</span>
                        <span>•</span>
                        <span>Kiểm định phương pháp độc lập</span>
                      </div>
                    </header>

                    <figure className="editorial-hero-figure">
                      <img
                        src={activeArticle.image}
                        alt={activeArticle.title}
                        className="editorial-hero-img"
                        loading="lazy"
                        width="860"
                        height="420"
                      />
                      <figcaption>{activeArticle.caption}</figcaption>
                    </figure>

                    <div
                      className="editorial-content-body"
                      dangerouslySetInnerHTML={{ __html: activeArticle.sectionsHtml }}
                    />

                    <footer className="editorial-article-footer">
                      <div>
                        <strong>Áp dụng kiến thức này vào kế hoạch của bạn</strong>
                        <p>Mở công cụ mô phỏng để tính toán ngay với mức chi tiêu và tuổi hưu mong muốn của cá nhân bạn.</p>
                      </div>
                      <div className="editorial-footer-btns">
                        <button type="button" className="btn secondary ed-footer-back-btn" onClick={closeArticle}>
                          <Icon name="arrow-left" />
                          <span>Xem bài khác</span>
                        </button>
                        <Link to="/mo-phong" className="mk-button mk-small">
                          <span>Thử tính kế hoạch</span>
                          <Icon name="arrow-right" />
                        </Link>
                      </div>
                    </footer>
                  </article>

                  {/* Right: Editorial Sticky Sidebar */}
                  <aside className="editorial-sidebar">
                    {/* Box 1: Quick Stats Summary */}
                    <section className="card editorial-summary-box">
                      <span className="eyebrow">TÓM TẮT TRỌNG TÂM</span>
                      <h3>Chỉ số & Quy tắc nhanh</h3>
                      <div className="modal-stat-card" style={{ margin: '12px 0 16px' }}>
                        <div className="stat-main">
                          <span className="stat-label">{activeArticle.heroLabel}</span>
                          <strong className="stat-value">
                            {activeArticle.heroVal} <small style={{ fontSize: '0.65em', fontWeight: 600, color: '#64748b' }}>{activeArticle.heroUnit}</small>
                          </strong>
                        </div>
                        <div className="stat-sub-row">
                          <div>
                            <span>{activeArticle.subLabel}</span>
                            <strong>{activeArticle.subVal}</strong>
                          </div>
                          <div>
                            <span>Ghi chú</span>
                            <strong>{activeArticle.statNote}</strong>
                          </div>
                        </div>
                      </div>
                      <ul className="product-card-highlights" style={{ margin: 0, listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
                        {activeArticle.highlights.map(h => (
                          <li key={h} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.86rem', lineHeight: 1.45, color: '#334155' }}>
                            <span className="chk" style={{ color: '#007763', fontWeight: 700 }}>✓</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {/* Box 2: Read Next / Related Articles */}
                    <section className="card editorial-related-box">
                      <span className="eyebrow">ĐỌC TIẾP CHUYÊN ĐỀ</span>
                      <h3>Bài viết khác cùng cẩm nang</h3>
                      <div className="editorial-related-list">
                        {relatedArticles.map(rel => (
                          <button
                            key={rel.id}
                            type="button"
                            className="editorial-related-item"
                            onClick={() => openArticle(rel.id)}
                            aria-label={`Đọc bài: ${rel.title}`}
                          >
                            <img src={rel.image} alt="" loading="lazy" width="58" height="46" />
                            <div className="editorial-related-info">
                              <span className="related-cat">{rel.category}</span>
                              <strong className="related-title">{rel.title}</strong>
                              <span className="related-time">⏱ {rel.readTime}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* Box 3: Simulator Tool Jump */}
                    <section className="card editorial-market-box">
                      <span className="eyebrow">CÔNG CỤ LIÊN QUAN</span>
                      <h3>Thử tính kế hoạch của bạn</h3>
                      <p className="small muted" style={{ margin: '6px 0 14px', lineHeight: 1.55 }}>
                        Đưa số liệu thu nhập, mức chi tiêu và tuổi hưu mong muốn vào công cụ mô phỏng thực tế.
                      </p>
                      <Link to="/mo-phong" className="mk-button mk-small" style={{ width: '100%', justifyContent: 'center' }}>
                        <span>Mở công cụ mô phỏng</span>
                        <Icon name="arrow-right" />
                      </Link>
                    </section>
                  </aside>
                </div>
              </div>
            </div>
          </section>
        )}

        <FinalCTA />
      </div>
    </MarketingLayout>
  );
}

export default function KnowledgePage() {
  const location = useLocation();
  const isUserArea = location.pathname.startsWith('/user/');

  if (isUserArea) {
    return <UserKnowledgeView />;
  }

  return <PublicKnowledgeView />;
}
