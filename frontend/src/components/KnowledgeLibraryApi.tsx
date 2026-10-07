import { useEffect, useState, useMemo } from "react";
import { Alert, Badge, Button, Card, Checkbox, Icon, SearchField } from "./ui";
import ResponsiveDialog from "./ResponsiveDialog";
import {
  knowledgeArticles,
  glossaryTerms,
  matchesSearch,
  parsePublishedArticles,
  type KnowledgeArticle,
} from "../domain/knowledge";
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
  const [savedOnly, setSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedError, setSavedError] = useState("");
  const [adminError, setAdminError] = useState("");
  const [publishedArticles, setPublishedArticles] = useState<KnowledgeArticle[]>([]);
  const [notice, setNotice] = useState("");
  const [opened, setOpened] = useState<KnowledgeArticle | null>(null);

  const storageUserKey = "anhuu_saved_articles:" + (userId || "USR-001");

  useEffect(() => {
    try {
      const rawContents = localStorage.getItem("anhuu_demo_contents");
      if (rawContents !== null && rawContents !== "") {
        const parsed = parsePublishedArticles(rawContents);
        setPublishedArticles(parsed);
      } else {
        setPublishedArticles([]);
      }
      setAdminError("");
    } catch {
      setAdminError(isEn ? "Unable to read admin content" : "Không đọc được nội dung từ quản trị");
      setPublishedArticles([]);
    }

    try {
      const rawSaved = localStorage.getItem(storageUserKey);
      if (rawSaved !== null && rawSaved !== "") {
        const parsed = JSON.parse(rawSaved);
        if (!Array.isArray(parsed)) {
          setSavedError(isEn ? "Cannot read saved list" : "Không đọc được danh sách đã lưu");
          setSavedIds([]);
        } else {
          setSavedIds(parsed.filter((id): id is string => typeof id === "string"));
          setSavedError("");
        }
      } else {
        setSavedIds([]);
        setSavedError("");
      }
    } catch {
      setSavedError(isEn ? "Cannot read saved list" : "Không đọc được danh sách đã lưu");
      setSavedIds([]);
    }
  }, [storageUserKey, isEn]);

  const allArticles = useMemo(() => {
    return [...knowledgeArticles, ...publishedArticles];
  }, [publishedArticles]);

  const validSavedCount = useMemo(() => {
    return savedIds.filter(id => allArticles.some(a => a.id === id)).length;
  }, [savedIds, allArticles]);

  const filteredArticles = useMemo(() => {
    let list = allArticles;

    if (savedOnly) {
      list = list.filter(a => savedIds.includes(a.id));
    }

    if (category !== "all") {
      list = list.filter(a => a.categoryId === category);
    }

    if (query.trim()) {
      list = list.filter(a =>
        matchesSearch(query, `${a.title} ${a.summary} ${a.content}`)
      );
    }

    return list;
  }, [allArticles, savedOnly, savedIds, category, query]);

  const toggle = (article: KnowledgeArticle) => {
    setNotice("");
    const isSaved = savedIds.includes(article.id);
    const nextSaved = isSaved
      ? savedIds.filter(id => id !== article.id)
      : [...savedIds.filter(id => id !== article.id), article.id];

    try {
      localStorage.setItem(storageUserKey, JSON.stringify(nextSaved));
      setSavedIds(nextSaved);
      setNotice(
        isSaved
          ? (isEn ? "Removed from saved articles." : "Đã bỏ lưu bài viết.")
          : (isEn ? "Article saved to your account." : "Đã lưu bài viết vào tài khoản.")
      );
    } catch {
      setNotice(isEn ? "Could not update saved articles." : "Không thể cập nhật bài đã lưu");
    }
  };

  const saveButton = (article: KnowledgeArticle) => {
    const isSaved = savedIds.includes(article.id);
    return (
      <button
        type="button"
        className="button button-secondary button-small knowledge-save"
        aria-pressed={isSaved}
        aria-label={`${isSaved ? (isEn ? "Remove save" : "Bỏ lưu") : (isEn ? "Save article" : "Lưu bài")}: ${article.title}`}
        onClick={() => toggle(article)}
      >
        <Icon name={isSaved ? "check" : "plus"} size="small" />
        <span>
          {isSaved
            ? (isEn ? "Saved" : "Đã lưu")
            : (isEn ? "Save for later" : "Lưu đọc sau")}
        </span>
      </button>
    );
  };

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
          label={isEn ? `Saved articles only (${validSavedCount})` : `Chỉ xem bài đã lưu (${validSavedCount})`}
          checked={savedOnly}
          onChange={setSavedOnly}
        />
      </div>

      <p className="knowledge-hint">
        {isEn ? "Saved articles are synchronized across all your devices." : "Bài đã lưu được đồng bộ theo tài khoản trên các thiết bị."}
      </p>

      {adminError && (
        <Alert tone="danger" title={adminError}>
          {adminError}
        </Alert>
      )}

      {notice ? (
        <p role="status">{notice}</p>
      ) : savedError ? (
        <p role="status">{savedError}</p>
      ) : (
        <p className="knowledge-result" role="status">
          {isEn ? `${filteredArticles.length} matching articles` : `${filteredArticles.length} bài viết phù hợp`}
        </p>
      )}

      {filteredArticles.length > 0 ? (
        <div className="article-grid">
          {filteredArticles.map((article) => (
            <Card className="article-card" key={article.id}>
              <div className="article-visual">
                <Icon name="file-text" size="large" />
              </div>
              <div className="article-card-copy">
                <Badge tone="soft">{article.category}</Badge>
                <h3>{article.title}</h3>
                <p>{article.summary}</p>
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
      ) : (
        <Card className="explore-empty">
          <div>
            <p>
              {savedOnly
                ? (validSavedCount === 0
                    ? (isEn ? "You haven't saved any articles yet." : "Bạn chưa lưu bài viết nào")
                    : (isEn ? "No matching saved articles." : "Chưa có bài đã lưu phù hợp"))
                : (isEn ? "No matching articles found." : "Không tìm thấy bài viết phù hợp")}
            </p>
          </div>
          {!savedOnly && (
            <Button
              onClick={() => {
                setQuery("");
                resetCategory();
              }}
            >
              {isEn ? "View all articles" : "Xem tất cả bài viết"}
            </Button>
          )}
        </Card>
      )}

      <ResponsiveDialog
        open={!!opened}
        title={opened?.title || (isEn ? "Article" : "Bài viết")}
        onClose={() => setOpened(null)}
      >
        {opened && (
          <article className="knowledge-reader">
            <Badge tone="soft">{opened.category}</Badge>
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

export function KnowledgeGlossary() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [open, setOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");

  const matchedTerms = useMemo(() => {
    if (!glossaryQuery.trim()) return glossaryTerms;
    return glossaryTerms.filter(item =>
      matchesSearch(glossaryQuery, `${item.term} ${item.aliases}`)
    );
  }, [glossaryQuery]);

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
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {isEn ? "Open Glossary" : "Mở từ điển tra cứu"}
        </Button>
      </div>

      <ResponsiveDialog
        open={open}
        title={isEn ? "An Huu Financial Glossary" : "Từ điển thuật ngữ An Hưu"}
        onClose={() => setOpen(false)}
      >
        <div className="knowledge-glossary">
          <SearchField
            label={isEn ? "Search terms" : "Tìm thuật ngữ"}
            value={glossaryQuery}
            onChange={setGlossaryQuery}
          />
          {matchedTerms.length > 0 ? (
            <dl>
              {matchedTerms.map((item) => (
                <div key={item.term} className="glossary-item">
                  <dt>{item.term}</dt>
                  <dd className="knowledge-body">{item.definition}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="explore-empty">
              <p>{isEn ? "No matching terms found" : "Chưa tìm thấy thuật ngữ"}</p>
              <Button variant="secondary" onClick={() => setGlossaryQuery("")}>
                {isEn ? "View all terms" : "Xem tất cả thuật ngữ"}
              </Button>
            </div>
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}
