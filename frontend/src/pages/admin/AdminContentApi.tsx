import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Pagination,
  SearchField,
  Select,
} from "../../components/ui";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import { authenticatedRequest } from "../../services/api";
import { contentKinds, type ContentItem, type ContentPage } from "../../services/content";
import { useI18n } from "../../i18n";

type ContentForm = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  authorName: string;
  thumbnail: string | null;
  kind: ContentItem["kind"];
  status: ContentItem["status"];
};

const initial: ContentForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Kế hoạch hưu trí",
  authorName: "",
  thumbnail: null,
  kind: "ARTICLE",
  status: "DRAFT",
};

const getContentKindLabels = (isEn: boolean): Record<ContentItem["kind"], string> => ({
  ARTICLE: isEn ? "In-depth Article" : "Bài viết chuyên sâu",
  FAQ: isEn ? "FAQ" : "Câu hỏi thường gặp",
  GLOSSARY: isEn ? "Glossary Term" : "Từ điển thuật ngữ",
});

export default function AdminContentPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const kindLabels = useMemo(() => getContentKindLabels(isEn), [isEn]);

  const [data, setData] = useState<ContentPage | null>(null);
  const [kind, setKind] = useState<ContentItem["kind"]>("ARTICLE");
  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState(false);
  const [original, setOriginal] = useState(JSON.stringify(initial));

  const statusOptions = useMemo(
    () => [
      { key: "ALL", label: isEn ? "All statuses" : "Tất cả trạng thái" },
      { key: "PUBLISHED", label: isEn ? "Published" : "Đã xuất bản" },
      { key: "DRAFT", label: isEn ? "Draft" : "Bản nháp" },
    ],
    [isEn]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      kind,
      search: activeQuery,
    });

    if (statusFilter !== "ALL") {
      params.set("status", statusFilter);
    }

    authenticatedRequest<ContentPage>("/admin/content?" + params)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : (isEn ? "Could not load content list." : "Không thể tải danh sách nội dung."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kind, activeQuery, page, pageSize, statusFilter, reload, isEn]);

  const handleSearchSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setActiveQuery("");
    setStatusFilter("ALL");
    setPage(1);
  };

  const openEditor = (item?: ContentItem) => {
    const fields = item
      ? {
          title: item.title,
          slug: item.slug,
          excerpt: item.excerpt,
          content: item.content,
          category: item.category,
          authorName: item.authorName,
          thumbnail: item.thumbnail,
          kind: item.kind,
          status: item.status,
        }
      : { ...initial, kind };

    setEditing(item || null);
    setForm(fields);
    setOriginal(JSON.stringify(fields));
    setSaveError("");
    setPreview(false);
    setEditor(true);
  };

  const closeEditor = () => {
    if (
      !busy &&
      (JSON.stringify(form) === original ||
        window.confirm(isEn ? "You have unsaved changes. Are you sure you want to close?" : "Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?"))
    ) {
      setEditor(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaveError("");

    try {
      await authenticatedRequest(
        editing ? `/admin/content/${editing.id}` : "/admin/content",
        editing ? { ...form, expectedRevision: editing.revision } : form,
        editing ? "PATCH" : "POST"
      );
      setEditor(false);
      setReload((v) => v + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (isEn ? "Could not save content." : "Không thể lưu nội dung."));
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const total = data?.total || 0;
    const published = data?.items?.filter((i) => i.status === "PUBLISHED").length || 0;
    const drafts = data?.items?.filter((i) => i.status === "DRAFT").length || 0;
    return { total, published, drafts };
  }, [data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span>{isEn ? "PUBLISHING MANAGEMENT" : "QUẢN LÝ XUẤT BẢN"}</span>
          <h1>{isEn ? "Content & Knowledge Base" : "Quản lý nội dung & tri thức"}</h1>
          <p>
            {isEn
              ? "In-depth articles, frequently asked questions, and retirement financial planning glossary."
              : "Bài viết chuyên sâu, câu hỏi thường gặp và từ điển thuật ngữ hoạch định tài chính hưu trí."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button variant="primary" icon="plus" onClick={() => openEditor()}>
            {isEn ? "Create New Content" : "Tạo nội dung mới"}
          </Button>
          <Button variant="ghost" icon="sparkles" onClick={() => setReload((v) => v + 1)}>
            {isEn ? "Refresh" : "Làm mới"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <Card className="admin-kpi-card">
          <div>
            <span>{isEn ? "Total Content" : "Tổng số nội dung"}</span>
            <span className="admin-kpi-icon"><Icon name="file-text" /></span>
          </div>
          <strong>{data ? data.total.toLocaleString(isEn ? "en-US" : "vi-VN") : "0"}</strong>
          <small>
            <Icon name="check" size="small" /> {isEn ? "System knowledge base" : "Kho tri thức hệ thống"}
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>{isEn ? "Published (This page)" : "Đã xuất bản (Trang này)"}</span>
            <span className="admin-kpi-icon" style={{ color: "var(--color-secondary-700)", background: "var(--color-success-soft)" }}>
              <Icon name="check" />
            </span>
          </div>
          <strong>{stats.published}</strong>
          <small style={{ color: "var(--color-secondary-700)" }}>
            {isEn ? "Publicly visible" : "Đang hiển thị công khai"}
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>{isEn ? "Drafts" : "Bản nháp lưu tạm"}</span>
            <span className="admin-kpi-icon" style={{ color: "var(--color-text-muted)", background: "var(--color-soft)" }}>
              <Icon name="info" />
            </span>
          </div>
          <strong>{stats.drafts}</strong>
          <small style={{ color: "var(--color-text-muted)" }}>
            {isEn ? "In editorial progress" : "Đang hoàn thiện biên tập"}
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>{isEn ? "Content Category" : "Phân loại nội dung"}</span>
            <span className="admin-kpi-icon" style={{ color: "var(--color-primary-700)", background: "var(--color-soft)" }}>
              <Icon name="target" />
            </span>
          </div>
          <strong style={{ fontSize: "20px", marginTop: "auto", marginBottom: "var(--space-2)" }}>
            {kindLabels[kind]}
          </strong>
          <small>
            {isEn ? "Category format" : "Định dạng chuyên mục"}
          </small>
        </Card>
      </div>

      {/* Error state */}
      {error && (
        <Alert tone="danger" title={isEn ? "Could not load content list" : "Không thể tải danh sách nội dung"}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span>{error}</span>
            <Button size="small" variant="secondary" onClick={() => setReload((v) => v + 1)}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {/* Main Table Card */}
      <Card className="admin-table-card">
        {/* Toolbar */}
        <div className="admin-table-toolbar">
          <form className="admin-user-search" onSubmit={handleSearchSubmit}>
            <SearchField
              label={isEn ? "Search content" : "Tìm kiếm nội dung"}
              placeholder={isEn ? "Enter title, keyword, author..." : "Nhập tiêu đề, từ khóa, tác giả..."}
              value={searchInput}
              onChange={setSearchInput}
              hideLabel
            />
          </form>

          <div className="admin-filters">
            <Select
              label={isEn ? "Content Type" : "Loại nội dung"}
              value={kindLabels[kind]}
              options={Object.values(kindLabels)}
              onChange={(val) => {
                setPage(1);
                const foundKind = (Object.keys(kindLabels) as ContentItem["kind"][]).find(
                  (k) => kindLabels[k] === val
                );
                if (foundKind) setKind(foundKind);
              }}
            />

            <Select
              label={isEn ? "Publishing Status" : "Trạng thái xuất bản"}
              options={statusOptions.map((o) => o.label)}
              value={statusOptions.find((o) => o.key === statusFilter)?.label || statusOptions[0].label}
              onChange={(val) => {
                setPage(1);
                const found = statusOptions.find((o) => o.label === val);
                setStatusFilter(found ? found.key : "ALL");
              }}
            />

            <Button variant="primary" onClick={handleSearchSubmit}>
              {isEn ? "Search" : "Tìm kiếm"}
            </Button>
            {(activeQuery || statusFilter !== "ALL") && (
              <Button variant="ghost" onClick={handleClearFilters}>
                <Icon name="trash" size="small" /> {isEn ? "Clear filters" : "Xóa bộ lọc"}
              </Button>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>{isEn ? "Title & Excerpt" : "Tiêu đề & Trích dẫn"}</th>
                <th>{isEn ? "Category" : "Chủ đề"}</th>
                <th>{isEn ? "Author" : "Tác giả"}</th>
                <th>{isEn ? "Status" : "Trạng thái"}</th>
                <th>{isEn ? "Actions" : "Thao tác"}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data?.items?.length ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--color-text-muted)" }}>
                    <Icon name="sparkles" /> {isEn ? "Updating content list..." : "Đang cập nhật danh sách bài viết…"}
                  </td>
                </tr>
              ) : !data?.items?.length ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--color-text-muted)" }}>
                    {isEn ? "No content found matching filter criteria." : "Không có nội dung nào phù hợp với bộ lọc tìm kiếm."}
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ maxWidth: "420px", whiteSpace: "normal" }}>
                      <div style={{ display: "grid", gap: "3px" }}>
                        <strong style={{ fontSize: "14px", color: "var(--color-midnight-900)" }}>
                          {item.title}
                        </strong>
                        {item.excerpt && (
                          <small style={{ color: "var(--color-text-muted)", fontSize: "12px", lineHeight: "1.4" }}>
                            {item.excerpt}
                          </small>
                        )}
                        <small style={{ color: "var(--color-primary-700)", fontSize: "11px", fontWeight: 600 }}>
                          /{item.slug}
                        </small>
                      </div>
                    </td>

                    <td>
                      <Badge tone="soft">{item.category}</Badge>
                    </td>

                    <td>
                      <span style={{ fontSize: "13px", color: "var(--color-text-strong)" }}>
                        {item.authorName || (isEn ? "An Huu Editorial Team" : "Ban biên tập An Hưu")}
                      </span>
                    </td>

                    <td>
                      <Badge tone={item.status === "PUBLISHED" ? "success" : "neutral"}>
                        {item.status === "PUBLISHED" ? (isEn ? "Published" : "Đã xuất bản") : (isEn ? "Draft" : "Bản nháp")}
                      </Badge>
                    </td>

                    <td>
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => openEditor(item)}
                        >
                          {isEn ? "Edit" : "Sửa nội dung"}
                        </Button>
                        {item.status === "PUBLISHED" && (
                          <a
                            href={`/kien-thuc/${item.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button button-ghost button-small"
                            style={{ textDecoration: "none" }}
                          >
                            {isEn ? "View ↗" : "Xem ↗"}
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={data.total}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}
      </Card>

      {/* Editor Modal */}
      <ResponsiveDialog
        open={editor}
        title={editing ? (isEn ? `Edit: ${editing.title}` : `Chỉnh sửa: ${editing.title}`) : (isEn ? "Create New Content" : "Tạo bài viết & nội dung mới")}
        onClose={closeEditor}
      >
        <form onSubmit={handleSave}>
          <fieldset disabled={busy} className="account-api-fields" style={{ display: "grid", gap: "var(--space-4)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <Input
                label={isEn ? "Content Title / Question / Term" : "Tiêu đề nội dung / Câu hỏi / Thuật ngữ"}
                value={form.title}
                onChange={(title) => setForm({ ...form, title })}
              />

              <Input
                label={isEn ? "Slug identifier" : "Đường dẫn định danh (Slug)"}
                helper={isEn ? "Lowercase alphanumeric with hyphens (e.g., retirement-plan-2026)" : "Chữ thường không dấu, số và dấu gạch ngang (VD: ke-hoach-huu-tri-2026)"}
                value={form.slug}
                onChange={(slug) => setForm({ ...form, slug })}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}>
              <Input
                label={isEn ? "Category" : "Chuyên mục"}
                value={form.category}
                onChange={(category) => setForm({ ...form, category })}
              />

              <Input
                label={isEn ? "Author / Editor" : "Tác giả / Biên tập viên"}
                value={form.authorName}
                onChange={(authorName) => setForm({ ...form, authorName })}
              />

              <Select
                label={isEn ? "Content Type" : "Loại nội dung"}
                value={kindLabels[form.kind]}
                options={Object.values(kindLabels)}
                onChange={(v) => {
                  const foundKind = (Object.keys(kindLabels) as ContentItem["kind"][]).find(
                    (k) => kindLabels[k] === v
                  );
                  if (foundKind) setForm({ ...form, kind: foundKind });
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-4)" }}>
              <Input
                label={isEn ? "Short Description / Preview Excerpt" : "Mô tả ngắn / Trích dẫn xem trước"}
                value={form.excerpt}
                onChange={(excerpt) => setForm({ ...form, excerpt })}
              />

              <Select
                label={isEn ? "Publishing Status" : "Trạng thái xuất bản"}
                options={isEn ? ["Draft", "Published"] : ["Bản nháp", "Đã xuất bản"]}
                value={form.status === "PUBLISHED" ? (isEn ? "Published" : "Đã xuất bản") : (isEn ? "Draft" : "Bản nháp")}
                onChange={(v) =>
                  setForm({ ...form, status: v === "Published" || v === "Đã xuất bản" ? "PUBLISHED" : "DRAFT" })
                }
              />
            </div>

            <Input
              label={isEn ? "Thumbnail URL (Optional HTTPS URL)" : "Đường dẫn ảnh bìa (Thumbnail HTTPS URL - tùy chọn)"}
              placeholder="https://images.unsplash.com/..."
              value={form.thumbnail || ""}
              onChange={(thumbnail) => setForm({ ...form, thumbnail: thumbnail || null })}
            />

            <label className="form-field" style={{ display: "grid", gap: "6px" }}>
              <span className="field-label" style={{ fontWeight: 600, fontSize: "13px" }}>
                {isEn ? "Detailed Content (Markdown or Text)" : "Nội dung chi tiết (Định dạng bài viết)"}
              </span>
              <textarea
                rows={10}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
                maxLength={100000}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "inherit",
                  fontSize: "13.5px",
                  lineHeight: "1.6",
                }}
              />
            </label>

            {saveError && <Alert tone="danger" title={isEn ? "Could not save" : "Không thể lưu"}>{saveError}</Alert>}

            {preview && (
              <article
                style={{
                  padding: "var(--space-5)",
                  background: "rgba(240, 246, 253, 0.5)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(199, 210, 254, 0.8)",
                  marginTop: "var(--space-3)",
                }}
              >
                <Badge tone="soft">{form.category}</Badge>
                <h3 style={{ margin: "var(--space-2) 0", fontSize: "18px", color: "var(--color-midnight-900)" }}>
                  {form.title || (isEn ? "(Untitled)" : "(Chưa có tiêu đề)")}
                </h3>
                {form.excerpt && <p style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>{form.excerpt}</p>}
                {form.thumbnail && (
                  <img
                    src={form.thumbnail}
                    alt="Thumbnail preview"
                    style={{ maxWidth: "100%", maxHeight: "240px", objectFit: "cover", borderRadius: "8px", margin: "var(--space-3) 0" }}
                  />
                )}
                <div style={{ whiteSpace: "pre-line", fontSize: "14px", lineHeight: "1.6", marginTop: "var(--space-3)" }}>
                  {form.content || (isEn ? "(No content)" : "(Chưa có nội dung)")}
                </div>
              </article>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
              <Button type="button" variant="secondary" onClick={() => setPreview((v) => !v)}>
                {preview ? (isEn ? "Hide Preview" : "Ẩn xem trước") : (isEn ? "Preview Article" : "Xem trước bài viết")}
              </Button>

              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button type="button" variant="ghost" onClick={closeEditor} disabled={busy}>
                  {isEn ? "Cancel" : "Hủy"}
                </Button>
                <Button type="submit" variant="primary" loading={busy}>
                  {editing
                    ? (isEn ? "Update Article" : "Cập nhật bài viết")
                    : (isEn ? "Save New Article" : "Lưu bài viết mới")}
                </Button>
              </div>
            </div>
          </fieldset>
        </form>
      </ResponsiveDialog>
    </div>
  );
}
