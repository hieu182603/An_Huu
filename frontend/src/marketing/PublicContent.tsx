import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Button, Icon, Pagination, SearchField } from "../components/ui";
import { ApiError, apiRequest } from "../services/api";
import type { ContentItem, ContentPage } from "../services/content";
import MarketingLayout, { FinalCTA, PageIntro } from "./MarketingLayout";

function useContent(kind: ContentItem["kind"], category: string, search: string, page: number, limit: number) {
  const [data, setData] = useState<ContentPage | null>(null); const [error, setError] = useState(""); const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError("");
    const params = new URLSearchParams({ kind, search, page: String(page), limit: String(limit), ...(category !== "all" ? { category } : {}) });
    apiRequest<ContentPage>("/content?" + params).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [kind, category, search, page, limit, reload]);
  return { data, error, retry: () => setReload(v => v + 1) };
}
function ContentCards({ items }: { items: ContentItem[] }) {
  return <div className="mk-article-grid">{items.map(article => <Link className="mk-article" key={article.id} to={`/kien-thuc/${article.slug}`}>
    <div className="mk-article-image">{article.thumbnail ? <img src={article.thumbnail} width="600" height="400" loading="lazy" alt="" /> : <Icon name="file-text" size="large" />}</div>
    <span className="mk-eyebrow">{article.category}</span><h3>{article.title}</h3><p>{article.excerpt}</p><span className="mk-text-link">Đọc bài viết<Icon name="arrow-right" /></span>
  </Link>)}</div>;
}
function ContentError({ error, retry }: { error: string; retry: () => void }) {
  return <Alert tone="danger" title="Chưa tải được nội dung" action={<Button onClick={retry}>Thử lại</Button>}>{error}</Alert>;
}
export function ArticleCards({ category = "all", limit = 6 }: { category?: string; limit?: number }) {
  const { data, error, retry } = useContent("ARTICLE", category, "", 1, limit);
  if (error) return <ContentError error={error} retry={retry} />;
  if (!data) return <p role="status">Đang tải bài viết…</p>;
  return data.items.length ? <ContentCards items={data.items} /> : <p>Chưa có bài viết được xuất bản.</p>;
}
function ReferenceContent({ kind }: { kind: "GLOSSARY" | "FAQ" }) {
  const [page, setPage] = useState(1);
  const { data, error, retry } = useContent(kind, "all", "", page, 12);
  return <section className="mk-container mk-faq"><h2>{kind === "FAQ" ? "Câu hỏi thường gặp" : "Sổ tay thuật ngữ"}</h2>
    {error ? <ContentError error={error} retry={retry} /> : !data ? <p role="status">Đang tải…</p> : <>
      {data.items.map(item => <details key={item.id}><summary>{item.title}<Icon name="plus" /></summary><p style={{ whiteSpace: "pre-wrap" }}>{item.content}</p></details>)}
      {!data.items.length && <p>Chưa có nội dung được xuất bản.</p>}
      {data.total > data.limit && (
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
          totalItems={data.total}
          pageSize={data.limit}
          onPageChange={setPage}
          showRowsPerPage={false}
        />
      )}
    </>}
  </section>;
}
export function KnowledgePage() {
  const [input, setInput] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [input]);
  const { data, error, retry } = useContent("ARTICLE", "all", search, page, 12);
  return <MarketingLayout><PageIntro eyebrow="KIẾN THỨC HƯU TRÍ" title="Hiểu hôm nay. Vững bước ngày mai.">Khám phá bài viết, thuật ngữ và hướng dẫn từ thư viện An Hưu.</PageIntro>
    <section className="mk-container mk-knowledge"><SearchField label="Tìm kiếm bài viết" value={input} onChange={setInput} placeholder="Nhập chủ đề bạn quan tâm…" />
      {error ? <ContentError error={error} retry={retry} /> : !data ? <p role="status">Đang tải thư viện…</p> : <>
        <div className="mk-knowledge-header"><h2>Tất cả chuyên đề</h2><span>{data.total} bài viết</span></div>
        <ContentCards items={data.items} />
        {!data.items.length && <p>Chưa có bài viết phù hợp.</p>}
        {data.total > data.limit && (
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
            totalItems={data.total}
            pageSize={data.limit}
            onPageChange={setPage}
            showRowsPerPage={false}
          />
        )}
      </>}
    </section><ReferenceContent kind="GLOSSARY" /><ReferenceContent kind="FAQ" /><FinalCTA /></MarketingLayout>;
}
export function ArticlePage() {
  const { slug } = useParams(); const [article, setArticle] = useState<ContentItem | null>(null);
  const [error, setError] = useState(""); const [missing, setMissing] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setArticle(null); setError(""); setMissing(false);
    apiRequest<ContentItem>("/content/" + encodeURIComponent(slug || "")).then(value => { if (active) setArticle(value); })
      .catch(e => { if (active) { setMissing(e instanceof ApiError && e.status === 404); setError(e.message); } });
    return () => { active = false; };
  }, [slug, reload]);
  useEffect(() => { if (article) document.title = `${article.title} | An Hưu`; }, [article]);
  return <MarketingLayout><article className="mk-reading"><Link to="/kien-thuc" className="mk-text-link"><Icon name="arrow-left" />Về thư viện kiến thức</Link>
    {missing ? <><h1>Bài viết không còn khả dụng</h1><p>Bài viết có thể chưa được xuất bản hoặc đã được gỡ.</p></> : error ? <ContentError error={error} retry={() => setReload(v => v + 1)} /> : !article ? <p role="status">Đang tải bài viết…</p> : <><span className="mk-eyebrow">{article.category}</span><h1>{article.title}</h1><p>{article.authorName}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString("vi-VN")}` : ""}</p><p className="mk-reading-lead">{article.excerpt}</p>{article.thumbnail && <img src={article.thumbnail} width="960" height="640" alt="" />}<div className="knowledge-body" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{article.content}</div></>}
  </article></MarketingLayout>;
}
