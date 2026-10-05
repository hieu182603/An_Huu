import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Icon, SearchField } from "./ui";
import ResponsiveDialog from "./ResponsiveDialog";
import { apiRequest, authenticatedRequest } from "../services/api";
import type { ContentItem, ContentPage } from "../services/content";
import { useI18n } from "../i18n";
import "./knowledge-library.css";

export default function KnowledgeLibrary({
  category,
  userId,
  resetCategory,
}: {
  category: string;
  userId: string;
  resetCategory: () => void;
}) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [data, setData] = useState<ContentPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState<ContentItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [category, savedOnly]);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const params = new URLSearchParams({
      kind: "ARTICLE",
      search,
      page: String(page),
      limit: "12",
      ...(category !== "all" ? { category } : {}),
    });

    Promise.all([
      savedOnly
        ? authenticatedRequest<ContentPage>("/me/saved-content?" + params)
        : apiRequest<ContentPage>("/content?" + params),
      authenticatedRequest<{ articleId: string }[]>("/me/saved-articles"),
    ])
      .then(([next, bookmarks]) => {
        if (active) {
          setData(next);
          setSaved(bookmarks.map((v) => v.articleId));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });

    return () => {
      active = false;
    };
  }, [search, category, savedOnly, page, userId, reload]);

  useEffect(() => {
    const refresh = () => setReload((v) => v + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const toggle = async (article: ContentItem) => {
    if (saving) return;
    setSaving(true);
    setNotice("");
    const exists = saved.includes(article.id);
    try {
      await authenticatedRequest(`/me/saved-articles/${article.id}`, {}, exists ? "DELETE" : "PUT");
      setSaved((current) =>
        exists ? current.filter((id) => id !== article.id) : [...current.filter((id) => id !== article.id), article.id]
      );
      setNotice(
        exists
          ? (isEn ? "Removed from saved articles." : "Đã bỏ lưu bài viết.")
          : (isEn ? "Article saved to your account." : "Đã lưu bài viết vào tài khoản.")
      );
      if (savedOnly) setReload((v) => v + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : (isEn ? "Could not update saved articles." : "Không thể cập nhật bài đã lưu."));
    } finally {
      setSaving(false);
    }
  };

  const saveButton = (article: ContentItem) => (
    <button
      type="button"
      className="button button-secondary button-small knowledge-save"
      disabled={saving}
      aria-pressed={saved.includes(article.id)}
      aria-label={`${saved.includes(article.id) ? (isEn ? "Remove save" : "Bỏ lưu") : (isEn ? "Save article" : "Lưu bài")}: ${article.title}`}
      onClick={() => void toggle(article)}
    >
      <Icon name={saved.includes(article.id) ? "check" : "plus"} size="small" />
      <span>
        {saved.includes(article.id)
          ? (isEn ? "Saved" : "Đã lưu")
          : (isEn ? "Save for later" : "Lưu đọc sau")}
      </span>
    </button>
  );

  return (
    <section className="explore-section knowledge-library" aria-label={isEn ? "Articles Library" : "Thư viện bài viết"}>
      <header>
        <div>
          <Badge tone="soft">{isEn ? "TOPICAL ARTICLES" : "BÀI VIẾT CHUYÊN ĐỀ"}</Badge>
          <h2>{isEn ? "Essential Retirement Knowledge" : "Kiến thức hưu trí thiết yếu"}</h2>
          <p>{isEn ? "Search by title and content with flexible keyword matching." : "Tìm kiếm theo tiêu đề và nội dung, có dấu hoặc không dấu."}</p>
        </div>
      </header>

      <div className="knowledge-toolbar">
        <SearchField
          label={isEn ? "Search articles" : "Tìm bài viết"}
          placeholder={isEn ? "E.g. Pension, regular investing..." : "Ví dụ: BHXH, đầu tư định kỳ..."}
          value={query}
          onChange={setQuery}
        />
        <Checkbox
          label={isEn ? `Saved articles only (${saved.length})` : `Chỉ xem bài đã lưu (${saved.length})`}
          checked={savedOnly}
          onChange={setSavedOnly}
        />
      </div>

      <p className="knowledge-hint">
        {isEn ? "Saved articles are synchronized across all your devices." : "Bài đã lưu được đồng bộ theo tài khoản trên các thiết bị."}
      </p>

      {notice && <p role="status">{notice}</p>}

      {error ? (
        <Alert tone="danger" title={isEn ? "Cannot load articles" : "Không thể tải bài viết"} action={<Button onClick={() => setReload((v) => v + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>}>
          {error}
        </Alert>
      ) : !data ? (
        <p role="status">{isEn ? "Loading articles..." : "Đang tải bài viết..."}</p>
      ) : (
        <>
          <p className="knowledge-result" role="status">
            {isEn ? `${data.total} matching articles` : `${data.total} bài viết phù hợp`}
          </p>
          <div className="article-grid">
            {data.items.map((article) => (
              <Card className="article-card" key={article.id}>
                {article.thumbnail ? (
                  <img className="content-preview-image" src={article.thumbnail} alt="" loading="lazy" />
                ) : (
                  <div className="article-visual">
                    <Icon name="file-text" size="large" />
                  </div>
                )}
                <div className="article-card-copy">
                  <Badge tone="soft">{article.category}</Badge>
                  <h3>{article.title}</h3>
                  <p>{article.excerpt}</p>
                  <div className="knowledge-actions">
                    <Button variant="ghost" size="small" onClick={() => setOpened(article)}>
                      {isEn ? "Read Article" : "Đọc bài viết"}
                    </Button>
                    {saveButton(article)}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {!data.items.length && (
            <Card className="explore-empty">
              <div>
                <h3>{savedOnly ? (isEn ? "No matching saved articles" : "Chưa có bài đã lưu phù hợp") : (isEn ? "No matching articles" : "Chưa có bài viết phù hợp")}</h3>
                <p>{isEn ? "Try another keyword or browse all topics." : "Thử từ khóa khác hoặc xem tất cả chủ đề."}</p>
              </div>
              <Button onClick={() => { setQuery(""); setSavedOnly(false); resetCategory(); }}>
                {isEn ? "View all articles" : "Xem tất cả bài viết"}
              </Button>
            </Card>
          )}

          <div className="account-save-row">
            <Button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
              {isEn ? "Previous" : "Trang trước"}
            </Button>
            <span>
              {isEn
                ? `Page ${page} / ${Math.max(1, Math.ceil(data.total / data.limit))}`
                : `Trang ${page} / ${Math.max(1, Math.ceil(data.total / data.limit))}`}
            </span>
            <Button disabled={page * data.limit >= data.total} onClick={() => setPage((v) => v + 1)}>
              {isEn ? "Next" : "Trang sau"}
            </Button>
          </div>
        </>
      )}

      <ResponsiveDialog
        open={!!opened}
        title={opened?.title || (isEn ? "Article" : "Bài viết")}
        onClose={() => setOpened(null)}
      >
        {opened && (
          <article className="knowledge-reader">
            <Badge tone="soft">{opened.category}</Badge>
            <p>{opened.authorName}</p>
            <p className="knowledge-body">{opened.content}</p>
            {notice && <p role="status">{notice}</p>}
            <div className="knowledge-actions">
              {saveButton(opened)}
              <Button variant="ghost" onClick={() => setOpened(null)}>
                {isEn ? "Close Article" : "Đóng bài viết"}
              </Button>
            </div>
          </article>
        )}
      </ResponsiveDialog>
    </section>
  );
}

function ReferenceContent({ kind }: { kind: "GLOSSARY" | "FAQ" }) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<ContentPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    apiRequest<ContentPage>(
      "/content?" +
        new URLSearchParams({
          kind,
          search,
          page: String(page),
          limit: "20",
        })
    )
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, search, page, reload]);

  return (
    <div className="knowledge-glossary">
      <SearchField
        label={kind === "FAQ" ? (isEn ? "Search questions" : "Tìm câu hỏi") : (isEn ? "Search terms" : "Tìm thuật ngữ")}
        value={query}
        onChange={setQuery}
      />
      {error ? (
        <Alert tone="danger" title={isEn ? "Cannot load content" : "Không thể tải nội dung"} action={<Button onClick={() => setReload((v) => v + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>}>
          {error}
        </Alert>
      ) : !data ? (
        <p role="status">{isEn ? "Loading..." : "Đang tải..."}</p>
      ) : (
        <>
          <p role="status">{isEn ? `${data.total} results` : `${data.total} kết quả`}</p>
          {data.items.map((item) =>
            kind === "FAQ" ? (
              <details key={item.id}>
                <summary>{item.title}</summary>
                <p className="knowledge-body">{item.content}</p>
              </details>
            ) : (
              <dl key={item.id}>
                <dt>{item.title}</dt>
                <dd className="knowledge-body">{item.content}</dd>
              </dl>
            )
          )}
          {!data.items.length && <p>{isEn ? "No matching content." : "Chưa có nội dung phù hợp."}</p>}
          <div className="account-save-row">
            <Button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
              {isEn ? "Previous" : "Trang trước"}
            </Button>
            <span>{isEn ? `Page ${page}` : `Trang ${page}`}</span>
            <Button disabled={page * data.limit >= data.total} onClick={() => setPage((v) => v + 1)}>
              {isEn ? "Next" : "Trang sau"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function KnowledgeGlossary() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [open, setOpen] = useState<"GLOSSARY" | "FAQ" | null>(null);

  return (
    <>
      <div className="glossary-strip">
        <span>
          <Icon name="sparkles" size="large" />
        </span>
        <div>
          <small>{isEn ? "AN HUU REFERENCE" : "TRA CỨU AN HƯU"}</small>
          <h2>{isEn ? "Financial Glossary & Frequently Asked Questions" : "Thuật ngữ & câu hỏi thường gặp"}</h2>
          <p>{isEn ? "Look up retirement concepts, regulations, and user guides." : "Tra cứu kiến thức và hướng dẫn sử dụng."}</p>
        </div>
        <Button variant="secondary" onClick={() => setOpen("GLOSSARY")}>
          {isEn ? "Open Glossary" : "Mở từ điển tra cứu"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen("FAQ")}>
          {isEn ? "Frequently Asked Questions" : "Câu hỏi thường gặp"}
        </Button>
      </div>

      <ResponsiveDialog
        open={!!open}
        title={open === "FAQ" ? (isEn ? "Frequently Asked Questions" : "Câu hỏi thường gặp") : (isEn ? "An Huu Financial Glossary" : "Từ điển thuật ngữ An Hưu")}
        onClose={() => setOpen(null)}
      >
        {open && <ReferenceContent key={open} kind={open} />}
      </ResponsiveDialog>
    </>
  );
}
