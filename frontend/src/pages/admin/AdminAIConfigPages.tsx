import { useEffect, useState, useMemo } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Modal,
  SearchField,
  Select,
  Textarea,
  useNotification,
} from "../../components/ui";
import { useI18n } from "../../i18n";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import {
  approveKnowledgeSource,
  createKnowledgeSource,
  getKnowledgeSource,
  indexKnowledgeSource,
  listKnowledgeSources,
  type KnowledgeSourceDetail,
  type KnowledgeSourceInput,
  type KnowledgeSourceItem,
} from "../../services/adminKnowledge";
import "./admin-ai.css";

// ==========================================
// AD07: AI & KNOWLEDGE BASE MANAGEMENT
// ==========================================

export type PromptRule = {
  id: string;
  title: string;
  description: string;
  severity: "Bắt buộc tuyệt đối" | "Cảnh báo người dùng" | "Gợi ý bổ sung";
  systemPrompt: string;
};

const promptRules: PromptRule[] = [
  {
    id: "RUL-01",
    title: "Không cam kết lợi nhuận đầu tư",
    description: "Ngăn chặn mô hình AI đưa ra các phát biểu đảm bảo lãi suất tương lai đối với sản phẩm đầu tư phi bảo đảm.",
    severity: "Bắt buộc tuyệt đối",
    systemPrompt: "BẠN KHÔNG ĐƯỢC CAM KẾT hoặc dùng từ 'chắc chắn', 'đảm bảo có lãi' với bất kỳ kênh đầu tư quỹ mở nào. Luôn trích dẫn hiệu suất quá khứ không đại diện cho tương lai.",
  },
  {
    id: "RUL-02",
    title: "Bắt buộc dẫn số hiệu điều khoản khi giải thích BHXH",
    description: "Mọi thông tin về năm đóng, tỷ lệ hưởng và tuổi nghỉ hưu phải kèm theo số điều cụ thể trong Luật BHXH 2024.",
    severity: "Bắt buộc tuyệt đối",
    systemPrompt: "Khi trả lời về chế độ hưu trí bắt buộc hoặc tự nguyện, luôn ghi rõ: '(Căn cứ Điều X, Luật BHXH số 41/2024/QH15)'.",
  },
  {
    id: "RUL-03",
    title: "Cảnh báo rủi ro lạm phát và tuổi thọ vượt mức",
    description: "Tự động cảnh báo nguy cơ thiếu hụt ngân sách hưu trí nếu người dùng đặt mục tiêu lạm phát quá thấp hoặc thời gian hưu trí quá ngắn.",
    severity: "Cảnh báo người dùng",
    systemPrompt: "Nếu người dùng chọn tỷ lệ lạm phát dưới 3.5% hoặc tuổi thọ dưới 75 tuổi, giải thích rủi ro bào mòn tài sản thực tế và đề xuất mức an toàn.",
  },
  {
    id: "RUL-04",
    title: "Từ chối phán đoán giá cổ phiếu đơn lẻ",
    description: "Giữ vững vai trò trợ lý hoạch định tài chính hưu trí vĩ mô, không cung cấp 'phím hàng' hay khuyến nghị mã chứng khoán cụ thể.",
    severity: "Bắt buộc tuyệt đối",
    systemPrompt: "Nếu người dùng hỏi về mã cổ phiếu cụ thể (VD: VCB, HPG), từ chối lịch sự và hướng dẫn phân bổ danh mục theo quỹ chỉ số hoặc quỹ mở.",
  },
];

type KnowledgeSourceForm = Omit<KnowledgeSourceInput, "effectiveDate"> & { effectiveDate: string };
const emptyKnowledgeSource: KnowledgeSourceForm = {
  title: "",
  referenceCode: "",
  category: "",
  version: "1.0",
  rawContent: "",
  effectiveDate: "",
};

const categoryLabelMapVi: Record<string, string> = {
  FINANCIAL_PLANNING_STANDARDS: "Chuẩn mực hoạch định",
  STATISTICS_DEMOGRAPHICS: "Dân số & Tuổi thọ",
  LEGAL_PENSION_ADJUSTMENT: "Điều chỉnh lương hưu",
  LEGAL_RETIREMENT_AGE: "Tuổi nghỉ hưu",
  LEGAL_SOCIAL_INSURANCE: "Luật BHXH",
};

const categoryLabelMapEn: Record<string, string> = {
  FINANCIAL_PLANNING_STANDARDS: "Planning Standards",
  STATISTICS_DEMOGRAPHICS: "Demographics",
  LEGAL_PENSION_ADJUSTMENT: "Pension Adjustment",
  LEGAL_RETIREMENT_AGE: "Retirement Age",
  LEGAL_SOCIAL_INSURANCE: "Social Insurance Law",
};

const formatCategory = (category: string, isEn: boolean) => {
  const map = isEn ? categoryLabelMapEn : categoryLabelMapVi;
  if (map[category]) return map[category];
  return category.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
};

export function AdminAIManagementPage() {
  const { notify } = useNotification();
  const { language } = useI18n();
  const isEn = language === "en";

  const [sources, setSources] = useState<KnowledgeSourceItem[]>([]);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [searchSource, setSearchSource] = useState("");
  const [categoryKey, setCategoryKey] = useState("ALL");
  const [editingRule, setEditingRule] = useState<PromptRule | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [serviceNotice, setServiceNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [sourceForm, setSourceForm] = useState<KnowledgeSourceForm>(emptyKnowledgeSource);
  const [viewingSource, setViewingSource] = useState<KnowledgeSourceItem | null>(null);
  const [sourceDetail, setSourceDetail] = useState<KnowledgeSourceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let active = true;
    setSourceLoading(true);
    setSourceError("");
    listKnowledgeSources(1, 50)
      .then((result) => { if (active) setSources(result.items); })
      .catch((error) => { if (active) setSourceError(error instanceof Error ? error.message : (isEn ? "Could not load knowledge sources." : "Không thể tải nguồn tri thức.")); })
      .finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [isEn]);

  const categoryOptions = useMemo(() => [
    { key: "ALL", label: isEn ? "All sources" : "Tất cả nguồn" },
    ...Array.from(new Set(sources.map((source) => source.category))).sort().map((category) => ({
      key: category,
      label: formatCategory(category, isEn),
    })),
  ], [isEn, sources]);

  // Filter sources
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      const matchSearch =
        searchSource === "" ||
        s.title.toLowerCase().includes(searchSource.toLowerCase()) ||
        (s.referenceCode || "").toLowerCase().includes(searchSource.toLowerCase());
      const matchCat = categoryKey === "ALL" || s.category === categoryKey;
      return matchSearch && matchCat;
    });
  }, [sources, searchSource, categoryKey]);

  const sourceStatusMap: Record<string, string> = useMemo(() => ({
    INDEXED: isEn ? "Indexed" : "Đã lập chỉ mục",
    PENDING: isEn ? "Pending" : "Chờ lập chỉ mục",
    FAILED: isEn ? "Failed" : "Thất bại",
  }), [isEn]);

  const ruleSeverityMap: Record<string, string> = useMemo(() => ({
    "Bắt buộc tuyệt đối": isEn ? "Strict Mandatory" : "Bắt buộc tuyệt đối",
    "Cảnh báo người dùng": isEn ? "User Warning" : "Cảnh báo người dùng",
    "Gợi ý bổ sung": isEn ? "Advisory Suggestion" : "Gợi ý bổ sung",
  }), [isEn]);

  const handleOpenEditRule = (rule: PromptRule) => {
    setEditingRule(rule);
  };

  const replaceSource = (source: KnowledgeSourceItem) => {
    setSources((items) => items.map((item) => (item.id === source.id ? source : item)));
    setViewingSource((prev) => (prev && prev.id === source.id ? source : prev));
  };

  const handleViewSource = async (source: KnowledgeSourceItem) => {
    setViewingSource(source);
    setLoadingDetail(true);
    setSourceDetail(null);
    try {
      const detail = await getKnowledgeSource(source.id);
      setSourceDetail(detail);
    } catch {
      notify.error(isEn ? "Failed to load document content" : "Không thể tải nội dung văn bản");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSyncSource = async (source: KnowledgeSourceItem) => {
    setSyncingId(source.id);
    setServiceNotice("");
    try {
      replaceSource(await indexKnowledgeSource(source.id, source.revision));
      notify.success(isEn ? "Source indexed" : "Đã lập chỉ mục", source.title);
    } catch (error) {
      setServiceNotice(error instanceof Error ? error.message : (isEn ? "Could not index source." : "Không thể lập chỉ mục nguồn."));
    } finally {
      setSyncingId(null);
    }
  };

  const handleApproval = async (source: KnowledgeSourceItem) => {
    const reviewNote = window.prompt(isEn ? "Review note" : "Ghi chú kiểm duyệt");
    if (!reviewNote?.trim()) return;
    setSyncingId(source.id);
    try {
      replaceSource(await approveKnowledgeSource(source.id, source.revision, !source.isApproved, reviewNote.trim()));
    } catch (error) {
      setServiceNotice(error instanceof Error ? error.message : (isEn ? "Could not update approval." : "Không thể cập nhật phê duyệt."));
    } finally {
      setSyncingId(null);
    }
  };

  const handleCreateSource = async () => {
    setCreateBusy(true);
    setCreateError("");
    try {
      const created = await createKnowledgeSource({
        ...sourceForm,
        referenceCode: sourceForm.referenceCode?.trim() || undefined,
        effectiveDate: new Date(`${sourceForm.effectiveDate}T00:00:00.000Z`).toISOString(),
      });
      setSources((items) => [created, ...items]);
      setSourceForm(emptyKnowledgeSource);
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : (isEn ? "Could not create source." : "Không thể tạo nguồn tri thức."));
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="admin-page business-page">
      <header className="admin-page-header">
        <div>
          <span>{isEn ? "ARTIFICIAL INTELLIGENCE & DATA" : "TRÍ TUỆ NHÂN TẠO & DỮ LIỆU"}</span>
          <h1>{isEn ? "AI Assistant & Knowledge Base Management (AD07)" : "Quản lý Trợ lý AI & Cơ sở tri thức (AD07)"}</h1>
          <p>{isEn ? "Monitor legal knowledge sources, configure safety guardrails, and track advisory traffic." : "Giám sát nguồn tri thức pháp lý, cấu hình guardrails an toàn và giám sát lưu lượng tư vấn."}</p>
        </div>
      </header>

      {/* Hero Overview Grid */}
      <div className="ai-overview-grid">
        <Card className="ai-management-overview">
          <div className="ai-management-heading">
            <span>
              <Icon name="sparkles" size="large" />
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Badge tone="neutral">{isEn ? "Server data" : "Dữ liệu máy chủ"}</Badge>
                <span style={{ color: "var(--color-soft)", fontSize: "12px" }}>{sourceLoading ? (isEn ? "Loading..." : "Đang tải...") : `${sources.length} ${isEn ? "sources" : "nguồn"}`}</span>
              </div>
              <h2>{isEn ? "Smart Financial & Retirement Advisory Assistant" : "Trợ lý Tư vấn Tài chính & Hưu trí Thông minh"}</h2>
              <p>
                {isEn
                  ? "Manage the server knowledge catalog used for cited retirement guidance. Sources must be indexed and approved before retrieval."
                  : "Quản lý danh mục tri thức máy chủ dùng cho tư vấn hưu trí có dẫn nguồn. Nguồn phải được lập chỉ mục và phê duyệt trước khi truy xuất."}
              </p>
            </div>
          </div>

          <div className="ai-business-capabilities">
            <span>
              <Icon name="file-text" />
              <div>
                <strong>{sources.length}</strong>
                <small>{isEn ? "Knowledge sources" : "Nguồn tri thức"}</small>
              </div>
            </span>
            <span>
              <Icon name="chart" />
              <div>
                <strong>{sources.filter((source) => source.status === "INDEXED").length}</strong>
                <small>{isEn ? "Indexed sources" : "Nguồn đã lập chỉ mục"}</small>
              </div>
            </span>
            <span>
              <Icon name="target" />
              <div>
                <strong>{sources.filter((source) => source.isApproved).length}</strong>
                <small>{isEn ? "Approved sources" : "Nguồn đã phê duyệt"}</small>
              </div>
            </span>
          </div>

          <footer>
            <Icon name="circle-check" size="small" />
            <span>{sourceError || (isEn ? "Knowledge catalog loaded from the authenticated admin API." : "Danh mục tri thức được tải từ API quản trị đã xác thực.")}</span>
          </footer>
        </Card>

        {/* AI Usage Card */}
        <Card className="ai-usage-card">
          <header>
            <div>
              <h2>{isEn ? "Knowledge readiness" : "Mức sẵn sàng tri thức"}</h2>
              <p>{isEn ? "Current server catalog" : "Danh mục hiện tại trên máy chủ"}</p>
            </div>
            <Badge tone={sourceError ? "danger" : "soft"}>{sourceError ? (isEn ? "Error" : "Có lỗi") : (isEn ? "Live" : "Trực tiếp")}</Badge>
          </header>

          <div className="ai-usage-metric">
            <span>{isEn ? "Approved / total sources" : "Nguồn được duyệt / tổng nguồn"}</span>
            <strong>{sources.filter((source) => source.isApproved).length}/{sources.length}</strong>
            <small>{isEn ? "Only approved, current indexes are eligible for retrieval." : "Chỉ chỉ mục hiện hành đã phê duyệt mới được phép truy xuất."}</small>
          </div>

          <div className="ai-usage-footer">
            <span>
              {isEn ? "Pending index: " : "Chờ lập chỉ mục: "}<strong>{sources.filter((source) => source.status === "PENDING").length}</strong>
            </span>
            <span>
              {isEn ? "Failed index: " : "Lập chỉ mục lỗi: "}<strong>{sources.filter((source) => source.status === "FAILED").length}</strong>
            </span>
          </div>
        </Card>
      </div>

      {/* Knowledge Sources Table Card */}
      <Card className="ai-source-card">
        <div className="ai-section-header">
          <div>
            <h2>{isEn ? "Knowledge Sources Directory" : "Danh mục nguồn tri thức"}</h2>
            <p>{isEn ? "Create, index and approve sources stored on the server." : "Tạo, lập chỉ mục và phê duyệt nguồn được lưu trên máy chủ."}</p>
          </div>
          <Button variant="secondary" icon="plus" onClick={() => { setCreateError(""); setCreateOpen(true); }}>
            {isEn ? "Add source" : "Thêm nguồn"}
          </Button>
        </div>

        <header className="admin-table-toolbar" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="admin-filter-group">
            <div className="business-search">
              <SearchField
                label={isEn ? "Search data sources" : "Tìm kiếm nguồn dữ liệu"}
                placeholder={isEn ? "Search law name, document number..." : "Tìm tên luật, số hiệu văn bản..."}
                value={searchSource}
                onChange={setSearchSource}
              />
            </div>
            <Select
              label={isEn ? "Source category" : "Phân loại nguồn"}
              options={categoryOptions.map((o) => o.label)}
              value={categoryOptions.find((o) => o.key === categoryKey)?.label || (isEn ? "All sources" : "Tất cả nguồn")}
              onChange={(val) => {
                const found = categoryOptions.find((o) => o.label === val);
                setCategoryKey(found ? found.key : "ALL");
              }}
            />
          </div>
        </header>

        {/* Desktop Table */}
        <div className="ai-source-table-scroll">
          <table className="ai-source-table">
            <thead>
              <tr>
                <th style={{ width: "38%", minWidth: "260px" }}>{isEn ? "Document & Code" : "Văn bản & Số hiệu"}</th>
                <th style={{ width: "18%", minWidth: "140px" }}>{isEn ? "Category" : "Phân loại"}</th>
                <th style={{ width: "10%", minWidth: "85px" }}>{isEn ? "Version" : "Phiên bản"}</th>
                <th style={{ width: "14%", minWidth: "120px" }}>{isEn ? "Index Status" : "Trạng thái chỉ mục"}</th>
                <th style={{ width: "10%", minWidth: "95px" }}>{isEn ? "Effective date" : "Ngày hiệu lực"}</th>
                <th style={{ width: "10%", minWidth: "105px", textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
              </tr>
            </thead>
            <tbody>
              {!sourceLoading && filteredSources.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--color-text-muted)" }}>
                    {isEn ? "No knowledge sources found." : "Không tìm thấy nguồn tri thức."}
                  </td>
                </tr>
              )}
              {filteredSources.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="source-name-box">
                      <span className="source-icon-badge" title={item.referenceCode || ""}>
                        <Icon name="file-text" />
                      </span>
                      <div className="source-text-group">
                        <button
                          type="button"
                          className="source-title-btn"
                          onClick={() => handleViewSource(item)}
                          title={isEn ? "Click to view full text" : "Bấm để đọc toàn văn"}
                        >
                          {item.title}
                        </button>
                        <span className="source-sub-text">
                          {isEn ? "Code: " : "Số hiệu: "}{item.referenceCode || (isEn ? "None" : "Không có")} · {item.indexMethod || (isEn ? "Not indexed" : "Chưa lập chỉ mục")}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone="soft">
                      {formatCategory(item.category, isEn)}
                    </Badge>
                  </td>
                  <td>
                    <strong style={{ fontSize: "12.5px", color: "var(--color-primary-800)" }}>{item.version}</strong>
                  </td>
                  <td>
                    <Badge tone={item.status === "INDEXED" ? "success" : item.status === "FAILED" ? "danger" : "warning"}>
                      {sourceStatusMap[item.status] || item.status}
                    </Badge>
                  </td>
                  <td>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                      {item.effectiveDate ? new Date(item.effectiveDate).toLocaleDateString(isEn ? "en-US" : "vi-VN") : "—"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="admin-ai-actions">
                      <button
                        type="button"
                        className="ai-action-btn btn-view"
                        title={isEn ? "Read document" : "Đọc nội dung văn bản"}
                        onClick={() => handleViewSource(item)}
                      >
                        <Icon name="eye" size="small" />
                      </button>
                      <button
                        type="button"
                        className="ai-action-btn btn-index"
                        disabled={syncingId === item.id}
                        title={syncingId === item.id ? (isEn ? "Indexing..." : "Đang lập chỉ mục...") : (isEn ? "Index source" : "Lập chỉ mục")}
                        onClick={() => handleSyncSource(item)}
                      >
                        <Icon name="sparkles" size="small" />
                      </button>
                      <button
                        type="button"
                        className={`ai-action-btn ${item.isApproved ? "btn-approved" : "btn-approve"}`}
                        disabled={syncingId === item.id || item.status !== "INDEXED"}
                        title={
                          item.isApproved
                            ? (isEn ? "Approved (Click to withdraw)" : "Đã duyệt (Bấm để thu hồi)")
                            : (isEn ? "Approve source" : "Phê duyệt nguồn")
                        }
                        onClick={() => handleApproval(item)}
                      >
                        <Icon name={item.isApproved ? "shield" : "check"} size="small" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View for Sources */}
        <div className="ai-source-mobile-list">
          {filteredSources.map((item) => (
            <Card key={item.id} className="business-mobile-card">
              <header>
                <Badge tone="soft">{formatCategory(item.category, isEn)}</Badge>
                <Badge tone={item.status === "INDEXED" ? "success" : item.status === "FAILED" ? "danger" : "warning"}>
                  {sourceStatusMap[item.status] || item.status}
                </Badge>
              </header>
              <h2
                style={{ cursor: "pointer", color: "var(--color-primary-800)", marginTop: "6px", fontSize: "14px" }}
                onClick={() => handleViewSource(item)}
              >
                {item.title}
              </h2>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {item.indexMethod || (isEn ? "Not indexed" : "Chưa lập chỉ mục")}
              </p>
              <div className="source-detail-grid">
                <span>
                  {isEn ? "Document Code:" : "Số hiệu văn bản:"} <strong>{item.referenceCode || "—"}</strong>
                </span>
                <span>
                  {isEn ? "Version:" : "Phiên bản:"} <strong>{item.version}</strong>
                </span>
                <span>
                  {isEn ? "Effective Date:" : "Ngày hiệu lực:"}{" "}
                  <strong>{item.effectiveDate ? new Date(item.effectiveDate).toLocaleDateString(isEn ? "en-US" : "vi-VN") : "—"}</strong>
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <Button
                  variant="secondary"
                  size="small"
                  icon="eye"
                  onClick={() => handleViewSource(item)}
                  style={{ flex: 1 }}
                >
                  {isEn ? "Read Document" : "Đọc văn bản"}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  icon="sparkles"
                  disabled={syncingId === item.id}
                  onClick={() => handleSyncSource(item)}
                >
                  {syncingId === item.id ? (isEn ? "Syncing..." : "Đang xử lý...") : (isEn ? "Index" : "Lập chỉ mục")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {(sourceError || serviceNotice) && <Alert tone="danger" title={isEn ? "Knowledge service error" : "Lỗi dịch vụ tri thức"}>{sourceError || serviceNotice}</Alert>}

      <Modal open={createOpen} title={isEn ? "Add knowledge source" : "Thêm nguồn tri thức"} onClose={() => { if (!createBusy) setCreateOpen(false); }}>
        <div className="rule-editor">
          <Input label={isEn ? "Title" : "Tiêu đề"} value={sourceForm.title} onChange={(title) => setSourceForm((form) => ({ ...form, title }))} />
          <Input label={isEn ? "Reference code" : "Số hiệu tham chiếu"} value={sourceForm.referenceCode} onChange={(referenceCode) => setSourceForm((form) => ({ ...form, referenceCode }))} />
          <Input label={isEn ? "Category" : "Phân loại"} value={sourceForm.category} onChange={(category) => setSourceForm((form) => ({ ...form, category }))} />
          <Input label={isEn ? "Version" : "Phiên bản"} value={sourceForm.version} onChange={(version) => setSourceForm((form) => ({ ...form, version }))} />
          <Input label={isEn ? "Effective date" : "Ngày hiệu lực"} type="date" value={sourceForm.effectiveDate} onChange={(effectiveDate) => setSourceForm((form) => ({ ...form, effectiveDate }))} />
          <Textarea label={isEn ? "Source content" : "Nội dung nguồn"} rows={8} value={sourceForm.rawContent} onChange={(rawContent) => setSourceForm((form) => ({ ...form, rawContent }))} />
          {createError && <Alert tone="danger" title={isEn ? "Could not create source" : "Không thể tạo nguồn"}>{createError}</Alert>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <Button variant="secondary" disabled={createBusy} onClick={() => setCreateOpen(false)}>{isEn ? "Cancel" : "Hủy"}</Button>
            <Button disabled={createBusy || !sourceForm.title.trim() || !sourceForm.category.trim() || !sourceForm.version.trim() || sourceForm.rawContent.trim().length < 20 || !sourceForm.effectiveDate} onClick={handleCreateSource}>
              {createBusy ? (isEn ? "Creating..." : "Đang tạo...") : (isEn ? "Create source" : "Tạo nguồn")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Prompt Rules & Guardrails Card */}
      <Card className="ai-rules-card">
        <div className="ai-section-header">
          <div>
            <h2>{isEn ? "Business Rules & Safety Guardrails" : "Bộ quy tắc nghiệp vụ & Giới hạn an toàn (Guardrails)"}</h2>
            <p>{isEn ? "Standards for content control, bias prevention, and financial regulatory compliance." : "Quy chuẩn kiểm soát nội dung, chống thiên vị và bảo đảm tuân thủ quy định pháp luật tài chính."}</p>
          </div>
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(23, 59, 87, 0.06)", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Icon name="shield" size="small" />
          <small style={{ color: "var(--color-text-muted)" }}>
            {isEn
              ? "Prompt Guardrails are central read-only system policies. Formal changes require AI Safety & Governance Board approval."
              : "Các quy tắc an toàn (Prompt Guardrails) là chính sách hệ thống chỉ đọc (Read-only System Policy). Mọi điều chỉnh cần phê duyệt từ Hội đồng An toàn AI."}
          </small>
        </div>

        <div className="ai-rules-list">
          {promptRules.map((rule) => (
            <div key={rule.id}>
              <span className="rule-icon">
                <Icon name="target" />
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <strong>{rule.title}</strong>
                  <Badge tone={rule.severity === "Bắt buộc tuyệt đối" ? "danger" : "warning"}>
                    {ruleSeverityMap[rule.severity] || rule.severity}
                  </Badge>
                  <Badge tone="soft">{isEn ? "System Policy" : "Chính sách hệ thống"}</Badge>
                </div>
                <p>{rule.description}</p>
              </div>
              <Badge tone="success">{isEn ? "Active" : "Đang áp dụng"}</Badge>
              <div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => handleOpenEditRule(rule)}
                >
                  {isEn ? "View Directive" : "Xem chỉ thị"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Edit Rule Modal */}
      <Modal
        open={Boolean(editingRule)}
        title={editingRule ? (isEn ? `Prompt Directive: ${editingRule.title}` : `Chỉ dẫn quy tắc: ${editingRule.title}`) : (isEn ? "Rule" : "Quy tắc")}
        onClose={() => setEditingRule(null)}
      >
        {editingRule && (
          <div className="rule-editor">
            <div className="rule-editor-summary">
              <Icon name="info" />
              <div>
                <strong>{editingRule.title}</strong>
                <p>{editingRule.description}</p>
              </div>
            </div>

            <Alert tone="info" title={isEn ? "System Policy Guardrail" : "Chính sách hệ thống Guardrail"}>
              {isEn
                ? "This guardrail prompt is managed as an immutable system code policy. Submissions for prompt updates must follow the T03 Governance process."
                : "Chỉ lệnh guardrail này được quản lý dưới dạng chính sách hệ thống chỉ đọc. Đề xuất cập nhật phải qua quy trình quản trị T03."}
            </Alert>

            <Textarea
              label={isEn ? "System Prompt Guardrail Directive" : "Nội dung chỉ đạo hệ thống (System Prompt Guardrail)"}
              rows={6}
              value={editingRule.systemPrompt}
              disabled
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <Button variant="secondary" onClick={() => setEditingRule(null)}>
                {isEn ? "Close" : "Đóng"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Knowledge Source Reader Dialog */}
      <ResponsiveDialog
        open={Boolean(viewingSource)}
        onClose={() => setViewingSource(null)}
        title={viewingSource?.title || (isEn ? "Knowledge Source" : "Nguồn tri thức")}
      >
        {viewingSource && (
          <div className="ai-source-reader-content">
            <div className="ai-source-reader-meta">
              <div className="ai-source-reader-badges">
                <Badge tone="info">{formatCategory(viewingSource.category, isEn)}</Badge>
                <Badge tone={viewingSource.status === "INDEXED" ? "success" : viewingSource.status === "FAILED" ? "danger" : "warning"}>
                  {sourceStatusMap[viewingSource.status] || viewingSource.status}
                </Badge>
                <Badge tone={viewingSource.isApproved ? "success" : "warning"}>
                  {viewingSource.isApproved ? (isEn ? "Approved" : "Đã phê duyệt") : (isEn ? "Pending Approval" : "Chờ phê duyệt")}
                </Badge>
              </div>

              <div className="ai-source-reader-grid">
                <div>
                  <span>{isEn ? "Reference Code" : "Số hiệu văn bản"}</span>
                  <strong>{viewingSource.referenceCode || "—"}</strong>
                </div>
                <div>
                  <span>{isEn ? "Version" : "Phiên bản"}</span>
                  <strong>{viewingSource.version}</strong>
                </div>
                <div>
                  <span>{isEn ? "Effective Date" : "Ngày hiệu lực"}</span>
                  <strong>
                    {viewingSource.effectiveDate
                      ? new Date(viewingSource.effectiveDate).toLocaleDateString(isEn ? "en-US" : "vi-VN")
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>{isEn ? "Index Method" : "Phương thức chỉ mục"}</span>
                  <strong>{viewingSource.indexMethod || (isEn ? "Not indexed" : "Chưa lập chỉ mục")}</strong>
                </div>
                <div>
                  <span>{isEn ? "Revision" : "Lần sửa đổi"}</span>
                  <strong>v{viewingSource.revision}</strong>
                </div>
                {viewingSource.validUntil && (
                  <div>
                    <span>{isEn ? "Valid Until" : "Hết hiệu lực"}</span>
                    <strong>{new Date(viewingSource.validUntil).toLocaleDateString(isEn ? "en-US" : "vi-VN")}</strong>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "var(--color-midnight-900)" }}>
                {isEn ? "Raw Document Content" : "Toàn văn nội dung tài liệu nguồn"}
              </h4>
              {loadingDetail ? (
                <div style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>
                  {isEn ? "Loading full document content..." : "Đang tải toàn văn tài liệu..."}
                </div>
              ) : sourceDetail?.rawContent ? (
                <div className="ai-source-raw-body">
                  {sourceDetail.rawContent}
                </div>
              ) : (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", background: "#f8fafc", borderRadius: "8px" }}>
                  {isEn ? "No text content available for this source." : "Chưa có nội dung văn bản chi tiết cho nguồn này."}
                </div>
              )}
            </div>

            <div className="ai-source-reader-footer">
              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={syncingId === viewingSource.id}
                  onClick={() => handleSyncSource(viewingSource)}
                >
                  {syncingId === viewingSource.id
                    ? (isEn ? "Indexing..." : "Đang lập chỉ mục...")
                    : (isEn ? "Index Now" : "Lập chỉ mục ngay")}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={syncingId === viewingSource.id || viewingSource.status !== "INDEXED"}
                  onClick={() => handleApproval(viewingSource)}
                >
                  {viewingSource.isApproved
                    ? (isEn ? "Withdraw Approval" : "Thu hồi duyệt")
                    : (isEn ? "Approve Source" : "Phê duyệt nguồn")}
                </Button>
              </div>
              <Button variant="secondary" onClick={() => setViewingSource(null)}>
                {isEn ? "Close" : "Đóng"}
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}
