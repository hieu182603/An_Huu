import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { discovery } from "../services/discovery";
import type { ContentItem } from "../services/content";
import { DiscoveryError, DiscoveryImage, DiscoveryPager } from "../components/DiscoveryParts";
import PublishedArticleBody, { articleBlocks, blockHeading } from "../components/PublishedArticleBody";
import { Icon } from "../components/ui";
import trackingImage from "../assets/knowledge-tracking.jpg";
import insuranceImage from "../assets/product-insurance.jpg";
import investmentImage from "../assets/product-investment.jpg";
import knowledgeImage from "../assets/knowledge-plan.jpg";
import "./explore-products.css";
import "./discovery-workspace.css";
import "./knowledge-controls.css";

const readMinutes = (article: ContentItem) => Math.max(1, Math.ceil(article.content.split(/\s+/).filter(Boolean).length / 220));
export default function UserKnowledgePage() {
  const en = useI18n().language === "en", t = (vi: string, eng: string) => en ? eng : vi, { user } = useAuth();
  const [params, setParams] = useSearchParams(), slug = params.get("article") ?? "", category = params.get("category") ?? "", q = (params.get("q") ?? "").slice(0,120), savedOnly = params.get("saved") === "1";
  const page = Math.min(100000, Math.max(1, /^\d+$/.test(params.get("page") ?? "1") ? Number(params.get("page") ?? 1) : 1));
  const [query, setQuery] = useState(q), [attempt, setAttempt] = useState(0), [savedAttempt, setSavedAttempt] = useState(0), [saving, setSaving] = useState<string | null>(null), [actionError, setActionError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null), listScroll = useRef(0), lastCard = useRef<string | null>(null), priorSlug = useRef(slug), restorePending = useRef(false);
  useEffect(() => setQuery(q), [q]);
  const update = (values: Record<string, string | null>, reset = true) => { const next = new URLSearchParams(params); if (reset) next.delete("page"); for (const [key,value] of Object.entries(values)) { if (value) next.set(key,value); else next.delete(key); } setParams(next); };
  const scope = user?.id ?? "", reload = () => setAttempt(n => n+1);
  const facets = useDiscoveryQuery(`${scope}:facets:${attempt}`, signal => discovery.contentFacets(signal));
  const list = useDiscoveryQuery(`${scope}:list:${category}:${q}:${savedOnly}:${page}:${attempt}:${savedAttempt}`, signal => discovery.articles({ category, search:q, page, limit:12, sortBy:"updatedAt", order:"desc" }, savedOnly, signal));
  const saved = useDiscoveryQuery(`${scope}:saved:${savedAttempt}:${attempt}`, signal => discovery.savedArticles(signal));
  const detail = useDiscoveryQuery(`${scope}:article:${slug}:${attempt}`, signal => slug ? discovery.article(slug, signal) : Promise.resolve(null));
  const related = useDiscoveryQuery(`${scope}:related:${detail.data?.category}:${slug}:${attempt}`, signal => slug && detail.data ? discovery.articles({ category:detail.data.category, page:1, limit:6 }, false, signal) : Promise.resolve({ items: [], total:0, page:1, limit:6 }));
  const current = detail.data, savedIds = saved.data?.map(row => row.articleId) ?? [];
  useEffect(() => {
    if (!list.data || slug) return;
    const last = Math.max(1, Math.ceil(list.data.total / 12));
    if (page > last) { const next = new URLSearchParams(params); next.set("page", String(last)); setParams(next, { replace: true }); }
  }, [list.data, slug, page, params, setParams]);
  useEffect(() => {
    if (slug && current) { window.scrollTo({ top:0, behavior:"instant" }); heading.current?.focus({ preventScroll:true }); }
  }, [slug, current?.id]);
  useEffect(() => {
    if (priorSlug.current && !slug) restorePending.current = true;
    priorSlug.current = slug;
    if (!slug && list.data && restorePending.current) {
      restorePending.current = false;
      window.scrollTo({ top:listScroll.current, behavior:"instant" });
      if (lastCard.current) document.querySelector<HTMLButtonElement>(`[data-read-id="${lastCard.current}"]`)?.focus({ preventScroll:true });
    }
  }, [slug, Boolean(list.data)]);
  const open = (article: ContentItem) => { listScroll.current = window.scrollY; lastCard.current = article.id; update({ article:article.slug },false); };
  const toggle = async (article: ContentItem) => {
    if (saving || !saved.data) return; setSaving(article.id); setActionError("");
    try { await discovery.saveArticle(article.id, !savedIds.includes(article.id)); setSavedAttempt(n => n+1); }
    catch (e) { setActionError(e instanceof Error ? e.message : t("Chưa lưu được bài viết.", "Could not save article.")); }
    finally { setSaving(null); }
  };
  const saveButton = (article: ContentItem, compact = false) => <button className={compact ? "card-star-btn" : "discovery-text"} disabled={Boolean(saving) || !saved.data} aria-pressed={savedIds.includes(article.id)} aria-label={`${savedIds.includes(article.id) ? t("Bỏ lưu bài", "Unsave article") : t("Lưu bài", "Save article")}: ${article.title}`} onClick={() => void toggle(article)}><Icon name={savedIds.includes(article.id) ? "check" : "plus"} />{!compact && (savedIds.includes(article.id) ? t("Đã lưu", "Saved") : t("Lưu bài", "Save article"))}</button>;
  const cover = (article: ContentItem) => <DiscoveryImage key={article.thumbnail ?? article.id} src={article.thumbnail} fallback={/bhxh|bảo hiểm|sức khỏe/i.test(article.category) ? insuranceImage : /theo dõi|tracking/i.test(article.category) ? trackingImage : /phân bổ|đầu tư|allocation/i.test(article.category) ? investmentImage : knowledgeImage} alt={article.title} />;
  const back = () => update({ article:null },false);
  return <div className="discovery-page discovery-knowledge-page">
    {actionError && <p role="alert" className="discovery-error">{actionError}</p>}{saved.error && <DiscoveryError message={saved.error} retry={() => setSavedAttempt(n => n+1)} />}
    {slug ? <>
      <nav className="discovery-reader-bar"><button className="overview-button secondary" onClick={back}>{t("← Quay lại danh sách bài viết", "← Back to articles")}</button>{current && <span>{current.category} · {readMinutes(current)} {t("phút đọc", "min read")}</span>}{current && saveButton(current)}</nav>
      {detail.loading ? <p role="status">{t("Đang tải bài viết…", "Loading article…")}</p> : detail.error ? <DiscoveryError message={detail.error} retry={reload} /> : current && <div className="discovery-reader-grid">
        <article className="discovery-reader"><header><span className="discovery-category">{current.category}</span><h1 tabIndex={-1} ref={heading}>{current.title}</h1><p className="discovery-sapo">{current.excerpt}</p><div className="discovery-byline">{current.authorName} · {readMinutes(current)} {t("phút đọc", "min read")}{current.publishedAt && ` · ${new Date(current.publishedAt).toLocaleDateString(en ? "en-GB" : "vi-VN")}`}</div></header><figure>{cover(current)}{!current.thumbnail && <figcaption>{t("Ảnh minh họa", "Illustrative image")}</figcaption>}</figure><PublishedArticleBody content={current.content} /><footer className="discovery-reader-footer"><h2>{t("Tiếp tục tìm hiểu", "Continue exploring")}</h2><div><button className="overview-button secondary" onClick={back}>{t("Xem bài khác", "More articles")}</button><Link className="overview-button primary" to="/user/explore">{t("Mở Sản phẩm tài chính", "Explore financial products")}</Link><Link className="overview-button secondary" to="/user/plan">{t("Xem kế hoạch của bạn", "Review your plan")}</Link></div></footer></article>
        <aside className="discovery-reader-aside"><section><h2>{t("Trong bài viết này", "In this article")}</h2><nav>{articleBlocks(current.content).map((block,index) => { const title = blockHeading(block); return title ? <a key={index} href={`#article-section-${index}`}>{title[2]}</a> : null; })}</nav><p>{current.excerpt}</p></section><section><h2>{t("Bài viết cùng chuyên mục", "Related articles")}</h2>{related.error ? <DiscoveryError message={related.error} retry={reload} /> : related.data?.items.filter(row => row.id !== current.id).map(row => <button className="discovery-related-article" key={row.id} onClick={() => update({ article:row.slug },false)}>{cover(row)}<span><small>{row.category}</small><strong>{row.title}</strong></span></button>)}{related.data && !related.data.items.some(row => row.id !== current.id) && <p>{t("Chưa có bài viết khác trong chuyên mục này.", "No other articles in this category yet.")}</p>}</section><section><h2>{t("Sản phẩm tài chính", "Financial products")}</h2><p>{t("Đối chiếu điều kiện, phí và rủi ro trước khi lựa chọn.", "Review terms, fees and risks before making a choice.")}</p><Link className="overview-button secondary" to="/user/explore">{t("Khám phá sản phẩm →", "Explore products →")}</Link></section></aside>
      </div>}
    </> : <>
      <header className="discovery-heading"><h1>{t("Kiến thức và giải pháp", "Knowledge and solutions")}</h1><p>{t("Đọc điều cần biết ngay tại bước bạn đang làm. Bấm vào từng bài viết để đọc chi tiết như một trang chuyên đề.", "Explore knowledge for your current planning step. Open an article to read the full guide.")}</p></header>
      <section className="knowledge-controls" aria-label={t("Tìm và lọc bài viết", "Find and filter articles")}>
        <div className="discovery-knowledge-toolbar"><div className="discovery-topic-buttons" role="group" aria-label={t("Chủ đề kiến thức", "Knowledge topics")}>
          <button type="button" aria-pressed={!category} onClick={() => update({ category:null })}>{t("Tất cả", "All")}</button>
          {facets.data?.map(row => <button type="button" key={row.category} aria-pressed={category === row.category} onClick={() => update({ category:row.category })}>{row.category}</button>)}
        </div></div>
        <form className="discovery-knowledge-search" role="search" onSubmit={(event: FormEvent) => { event.preventDefault(); update({ q:query.trim() }); }}>
          <div className="knowledge-search-entry"><label><Icon name="search" /><span className="sr-only">{t("Tìm bài viết", "Search articles")}</span><input aria-label={t("Tìm bài viết", "Search articles")} value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder={t("Tìm theo tiêu đề và nội dung…", "Search titles and content…")} /></label><button type="submit" className="overview-button primary">{t("Tìm", "Search")}</button></div>
          <button type="button" className="knowledge-saved-toggle" aria-label={t("Chỉ bài đã lưu", "Saved articles only")} aria-pressed={savedOnly} onClick={() => update({ saved:savedOnly ? null : "1" })}><Icon name={savedOnly ? "check" : "file-text"} size="small" /><span>{t("Chỉ bài đã lưu", "Saved articles only")}</span><span className="knowledge-saved-count">{saved.data?.length ?? "…"}</span></button>
        </form>
        <div className="knowledge-result-meta"><span role="status"><strong>{list.data?.total ?? "…"}</strong> {t("bài viết", "articles")}{category && <span className="knowledge-result-category"> · {category}</span>}</span>{(q || category || savedOnly) && <button type="button" className="discovery-text" onClick={() => { setQuery(""); update({ q:null,category:null,saved:null }); }}><Icon name="x" size="small" />{t("Xóa bộ lọc", "Clear filters")}</button>}</div>
      </section>
      {facets.error && <DiscoveryError message={facets.error} retry={reload} />}
      {list.loading ? <p role="status">{t("Đang tải bài viết…", "Loading articles…")}</p> : list.error ? <DiscoveryError message={list.error} retry={reload} /> : <>{list.data?.items.length ? <div className="products-grid discovery-knowledge-grid">{list.data.items.map(article => <article className="product-card" key={article.id}><button className="product-card__media discovery-cover-button" aria-label={`${t("Đọc bài", "Read article")}: ${article.title}`} onClick={() => open(article)}>{cover(article)}<span className="product-card__tag">{article.category}</span><span className="product-card__code">{readMinutes(article)} {t("phút đọc", "min read")}</span></button><div className="product-card__body"><div className="discovery-card-title"><h2><button data-read-id={article.id} className="discovery-title-button" onClick={() => open(article)}>{article.title}</button></h2>{saveButton(article,true)}</div><p className="discovery-clamp">{article.excerpt}</p><p className="discovery-article-author">{article.authorName}</p><div className="product-card__actions">{saveButton(article)}<button className="overview-button primary" onClick={() => open(article)}>{t("Đọc bài viết →", "Read article →")}</button></div></div></article>)}</div> : <div className="discovery-empty"><h2>{t("Chưa có bài viết trong danh sách này", "No articles in this list")}</h2><p>{t("Bạn có thể đổi chủ đề, tìm từ khóa khác hoặc bỏ lọc bài đã lưu.", "Try another topic, search term, or turn off saved-only filtering.")}</p></div>}<DiscoveryPager page={page} total={list.data?.total ?? 0} limit={12} change={n => update({ page:String(n) },false)} /></>}
      <section className="discovery-knowledge-cta"><div><h2>{t("Tìm hiểu sản phẩm tài chính", "Explore financial products")}</h2><p>{t("Xem điều kiện, phí, thông tin công bố và công cụ tính minh họa để đối chiếu với nhu cầu của bạn.", "Review terms, fees, disclosures and illustrative tools for your financial needs.")}</p></div><Link className="overview-button primary" to="/user/explore">{t("Mở Sản phẩm tài chính →", "Explore products →")}</Link></section>
    </>}
  </div>;
}
