import { useState, useMemo } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Modal,
  Pagination,
  SearchField,
  Select,
  Switch,
  Textarea,
  useNotification,
  type IconName,
} from "../../components/ui";
import { useI18n } from "../../i18n";

// ==========================================
// AD07: AI & KNOWLEDGE BASE MANAGEMENT
// ==========================================

export type KnowledgeSource = {
  id: string;
  title: string;
  referenceCode: string;
  category: "Luật & Nghị định" | "Thống kê vĩ mô" | "Nghiên cứu hưu trí" | "Chuẩn mực tài chính";
  vectorChunks: number;
  status: "Đã đồng bộ" | "Cần quét lại" | "Đang xử lý";
  updated: string;
  description: string;
};

export type PromptRule = {
  id: string;
  title: string;
  description: string;
  severity: "Bắt buộc tuyệt đối" | "Cảnh báo người dùng" | "Gợi ý bổ sung";
  isEnabled: boolean;
  systemPrompt: string;
  updated: string;
};

const initialSources: KnowledgeSource[] = [
  {
    id: "SRC-01",
    title: "Luật Bảo hiểm Xã hội số 41/2024/QH15",
    referenceCode: "41/2024/QH15",
    category: "Luật & Nghị định",
    vectorChunks: 1420,
    status: "Đã đồng bộ",
    updated: "15/08/2025",
    description: "Toàn văn luật sửa đổi có hiệu lực từ 01/07/2025: cách tính lương hưu, lộ trình tuổi nghỉ hưu nam/nữ, điều kiện rút BHXH một lần.",
  },
  {
    id: "SRC-02",
    title: "Nghị định 134/2015/NĐ-CP Hướng dẫn BHXH Tự nguyện",
    referenceCode: "134/2015/NĐ-CP",
    category: "Luật & Nghị định",
    vectorChunks: 580,
    status: "Đã đồng bộ",
    updated: "10/07/2025",
    description: "Quy định mức hỗ trợ tiền đóng của Nhà nước cho người tham gia BHXH tự nguyện thuộc hộ nghèo, cận nghèo.",
  },
  {
    id: "SRC-03",
    title: "Niên giám Thống kê Dân số & Tuổi thọ Việt Nam 2024",
    referenceCode: "GSO-VN-2024",
    category: "Thống kê vĩ mô",
    vectorChunks: 890,
    status: "Cần quét lại",
    updated: "02/08/2025",
    description: "Bảng tỷ lệ tử vong, kỳ vọng sống theo độ tuổi và giới tính từ Tổng cục Thống kê (GSO). Cần tái đồng bộ dữ liệu sửa đổi.",
  },
  {
    id: "SRC-04",
    title: "Chuẩn mực Kế hoạch Hưu trí Cá nhân FPSB 2023",
    referenceCode: "FPSB-RET-2023",
    category: "Chuẩn mực tài chính",
    vectorChunks: 310,
    status: "Đã đồng bộ",
    updated: "28/06/2025",
    description: "Khung hướng dẫn tỷ lệ thay thế thu nhập (Income Replacement Ratio - 70-80%) và quy tắc rút vốn an toàn 4% điều chỉnh lạm phát.",
  },
];

const initialRules: PromptRule[] = [
  {
    id: "RUL-01",
    title: "Không cam kết lợi nhuận đầu tư",
    description: "Ngăn chặn mô hình AI đưa ra các phát biểu đảm bảo lãi suất tương lai đối với sản phẩm đầu tư phi bảo đảm.",
    severity: "Bắt buộc tuyệt đối",
    isEnabled: true,
    systemPrompt: "BẠN KHÔNG ĐƯỢC CAM KẾT hoặc dùng từ 'chắc chắn', 'đảm bảo có lãi' với bất kỳ kênh đầu tư quỹ mở nào. Luôn trích dẫn hiệu suất quá khứ không đại diện cho tương lai.",
    updated: "12/08/2025",
  },
  {
    id: "RUL-02",
    title: "Bắt buộc dẫn số hiệu điều khoản khi giải thích BHXH",
    description: "Mọi thông tin về năm đóng, tỷ lệ hưởng và tuổi nghỉ hưu phải kèm theo số điều cụ thể trong Luật BHXH 2024.",
    severity: "Bắt buộc tuyệt đối",
    isEnabled: true,
    systemPrompt: "Khi trả lời về chế độ hưu trí bắt buộc hoặc tự nguyện, luôn ghi rõ: '(Căn cứ Điều X, Luật BHXH số 41/2024/QH15)'.",
    updated: "15/08/2025",
  },
  {
    id: "RUL-03",
    title: "Cảnh báo rủi ro lạm phát và tuổi thọ vượt mức",
    description: "Tự động cảnh báo nguy cơ thiếu hụt ngân sách hưu trí nếu người dùng đặt mục tiêu lạm phát quá thấp hoặc thời gian hưu trí quá ngắn.",
    severity: "Cảnh báo người dùng",
    isEnabled: true,
    systemPrompt: "Nếu người dùng chọn tỷ lệ lạm phát dưới 3.5% hoặc tuổi thọ dưới 75 tuổi, giải thích rủi ro bào mòn tài sản thực tế và đề xuất mức an toàn.",
    updated: "05/08/2025",
  },
  {
    id: "RUL-04",
    title: "Từ chối phán đoán giá cổ phiếu đơn lẻ",
    description: "Giữ vững vai trò trợ lý hoạch định tài chính hưu trí vĩ mô, không cung cấp 'phím hàng' hay khuyến nghị mã chứng khoán cụ thể.",
    severity: "Bắt buộc tuyệt đối",
    isEnabled: true,
    systemPrompt: "Nếu người dùng hỏi về mã cổ phiếu cụ thể (VD: VCB, HPG), từ chối lịch sự và hướng dẫn phân bổ danh mục theo quỹ chỉ số hoặc quỹ mở.",
    updated: "01/08/2025",
  },
];

export function AdminAIManagementPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [sources, setSources] = useState<KnowledgeSource[]>(initialSources);
  const [rules, setRules] = useState<PromptRule[]>(initialRules);
  const [searchSource, setSearchSource] = useState("");
  const [categoryKey, setCategoryKey] = useState("ALL");
  const [editingRule, setEditingRule] = useState<PromptRule | null>(null);
  const [tempPrompt, setTempPrompt] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [serviceNotice, setServiceNotice] = useState("");

  const categoryOptions = useMemo(() => [
    { key: "ALL", label: isEn ? "All sources" : "Tất cả nguồn" },
    { key: "Luật & Nghị định", label: isEn ? "Laws & Decrees" : "Luật & Nghị định" },
    { key: "Thống kê vĩ mô", label: isEn ? "Macro Statistics" : "Thống kê vĩ mô" },
    { key: "Chuẩn mực tài chính", label: isEn ? "Financial Standards" : "Chuẩn mực tài chính" },
  ], [isEn]);

  // Filter sources
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      const matchSearch =
        searchSource === "" ||
        s.title.toLowerCase().includes(searchSource.toLowerCase()) ||
        s.referenceCode.toLowerCase().includes(searchSource.toLowerCase());
      const matchCat = categoryKey === "ALL" || s.category === categoryKey;
      return matchSearch && matchCat;
    });
  }, [sources, searchSource, categoryKey]);

  const sourceStatusMap: Record<string, string> = useMemo(() => ({
    "Đã đồng bộ": isEn ? "Synchronized" : "Đã đồng bộ",
    "Cần quét lại": isEn ? "Needs Rescan" : "Cần quét lại",
    "Đang xử lý": isEn ? "Processing" : "Đang xử lý",
  }), [isEn]);

  const sourceCategoryMap: Record<string, string> = useMemo(() => ({
    "Luật & Nghị định": isEn ? "Laws & Decrees" : "Luật & Nghị định",
    "Thống kê vĩ mô": isEn ? "Macro Statistics" : "Thống kê vĩ mô",
    "Chuẩn mực tài chính": isEn ? "Financial Standards" : "Chuẩn mực tài chính",
    "Nghiên cứu hưu trí": isEn ? "Retirement Studies" : "Nghiên cứu hưu trí",
  }), [isEn]);

  const ruleSeverityMap: Record<string, string> = useMemo(() => ({
    "Bắt buộc tuyệt đối": isEn ? "Strict Mandatory" : "Bắt buộc tuyệt đối",
    "Cảnh báo người dùng": isEn ? "User Warning" : "Cảnh báo người dùng",
    "Gợi ý bổ sung": isEn ? "Advisory Suggestion" : "Gợi ý bổ sung",
  }), [isEn]);

  const handleToggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r))
    );
  };

  const handleOpenEditRule = (rule: PromptRule) => {
    setEditingRule(rule);
    setTempPrompt(rule.systemPrompt);
  };

  const handleSaveRule = () => {
    if (!editingRule) return;
    setRules((prev) =>
      prev.map((r) =>
        r.id === editingRule.id
          ? { ...r, systemPrompt: tempPrompt, updated: isEn ? "Today" : "Hôm nay" }
          : r
      )
    );
    setEditingRule(null);
  };

  const handleSyncSource = (id: string) => {
    setSyncingId(null);
    setServiceNotice(
      isEn
        ? `Unable to synchronize source ${id}: demo environment has no server-side indexing service configured.`
        : `Chưa thể đồng bộ nguồn ${id}: bản demo chưa được cấu hình dịch vụ lập chỉ mục phía máy chủ.`
    );
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
                <Badge tone="neutral">{isEn ? "Demo Data Mode" : "Chế độ dữ liệu minh họa"}</Badge>
                <span style={{ color: "var(--color-soft)", fontSize: "12px" }}>{isEn ? "Average latency: 0.82s" : "Độ trễ trung bình: 0.82s"}</span>
              </div>
              <h2>{isEn ? "Smart Financial & Retirement Advisory Assistant" : "Trợ lý Tư vấn Tài chính & Hưu trí Thông minh"}</h2>
              <p>
                {isEn
                  ? "Knowledge source catalog demonstration. No AI services or search indexing connected yet for asset management and Vietnamese demographic statistics. All reasoning has transparent citations, no guesswork, and no misleading commitments."
                  : "Giao diện minh họa danh mục nguồn tri thức. Chưa có dịch vụ AI hoặc chỉ mục tìm kiếm được kết nối về quản lý tài sản và dữ liệu thống kê dân số Việt Nam. Mọi lập luận đều có dẫn chiếu minh bạch, không phỏng đoán, không cam kết sai lệch."}
              </p>
            </div>
          </div>

          <div className="ai-business-capabilities">
            <span>
              <Icon name="file-text" />
              <div>
                <strong>{isEn ? "Social Insurance Law 2024" : "Luật BHXH 2024"}</strong>
                <small>{isEn ? "41 new retirement articles" : "41 điều khoản hưu trí mới"}</small>
              </div>
            </span>
            <span>
              <Icon name="chart" />
              <div>
                <strong>{isEn ? "Cashflow Planning" : "Hoạch định dòng tiền"}</strong>
                <small>{isEn ? "Independent inflation indexing" : "Độc lập trượt giá & lạm phát"}</small>
              </div>
            </span>
            <span>
              <Icon name="target" />
              <div>
                <strong>{isEn ? "Portfolio Allocation" : "Phân bổ danh mục"}</strong>
                <small>{isEn ? "Standardized risk profile" : "Khẩu vị rủi ro chuẩn hóa"}</small>
              </div>
            </span>
          </div>

          <footer>
            <Icon name="circle-check" size="small" />
            <span>{isEn ? "Source data is UI mockup; no server sync verified yet." : "Dữ liệu nguồn đang là mẫu giao diện; chưa có lần đồng bộ máy chủ được xác nhận."}</span>
          </footer>
        </Card>

        {/* AI Usage Card */}
        <Card className="ai-usage-card">
          <header>
            <div>
              <h2>{isEn ? "Conversation Traffic" : "Lưu lượng hội thoại"}</h2>
              <p>{isEn ? "Last 4 weeks statistics" : "Thống kê 4 tuần gần nhất"}</p>
            </div>
            <Badge tone="soft">{isEn ? "Past 30 days" : "30 ngày qua"}</Badge>
          </header>

          <div className="ai-usage-metric">
            <span>{isEn ? "Total Q&A Interactions" : "Tổng lượt tương tác hỏi đáp"}</span>
            <strong>38.450</strong>
            <small>{isEn ? "↑ 14.2% vs previous month" : "↑ 14.2% so với tháng trước"}</small>
          </div>

          <div className="ai-week-bars">
            <div>
              <span className="week-one" />
              <small>{isEn ? "Week 1" : "Tuần 1"}</small>
            </div>
            <div>
              <span className="week-two" />
              <small>{isEn ? "Week 2" : "Tuần 2"}</small>
            </div>
            <div>
              <span className="week-three" />
              <small>{isEn ? "Week 3" : "Tuần 3"}</small>
            </div>
            <div>
              <span className="week-four" />
              <small>{isEn ? "Week 4" : "Tuần 4"}</small>
            </div>
          </div>

          <div className="ai-usage-footer">
            <span>
              {isEn ? "Service Status: " : "Trạng thái dịch vụ: "}<strong>{isEn ? "Not connected" : "Chưa kết nối"}</strong>
            </span>
            <span>
              {isEn ? "Business Audit: " : "Kiểm định nghiệp vụ: "}<strong>{isEn ? "Not conducted" : "Chưa thực hiện"}</strong>
            </span>
          </div>
        </Card>
      </div>

      {/* Knowledge Sources Table Card */}
      <Card className="ai-source-card">
        <div className="ai-section-header">
          <div>
            <h2>{isEn ? "Planned Knowledge Sources Directory" : "Danh mục nguồn tri thức dự kiến"}</h2>
            <p>{isEn ? "Mock data for process design; not uploaded or indexed on server." : "Dữ liệu mẫu để thiết kế quy trình; chưa được tải lên hoặc lập chỉ mục trên máy chủ."}</p>
          </div>
          <Button variant="secondary" icon="plus" onClick={() => setServiceNotice(isEn ? "Uploading documents requires server-side storage and indexing services; demo is unconfigured." : "Tải tài liệu cần dịch vụ lưu trữ và lập chỉ mục phía máy chủ; bản demo chưa được cấu hình.")}>
            {isEn ? "Upload New Document" : "Tải lên tài liệu mới"}
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
                <th>{isEn ? "Document & Code" : "Văn bản & Số hiệu"}</th>
                <th>{isEn ? "Category" : "Phân loại"}</th>
                <th>{isEn ? "Vector Chunks" : "Số phân đoạn (Vector Chunks)"}</th>
                <th>{isEn ? "Index Status" : "Trạng thái chỉ mục"}</th>
                <th>{isEn ? "Last Updated" : "Cập nhật lần cuối"}</th>
                <th style={{ textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="source-name">
                      <span>
                        <Icon name="file-text" />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{isEn ? "Code: " : "Số hiệu: "}{item.referenceCode} · {item.description}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone="soft">{sourceCategoryMap[item.category] || item.category}</Badge>
                  </td>
                  <td>
                    <strong>{item.vectorChunks} {isEn ? "chunks" : "phân đoạn"}</strong>
                  </td>
                  <td>
                    <Badge tone={item.status === "Đã đồng bộ" ? "success" : "warning"}>
                      {sourceStatusMap[item.status] || item.status}
                    </Badge>
                  </td>
                  <td>
                    <small>{item.updated}</small>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={syncingId === item.id}
                      onClick={() => handleSyncSource(item.id)}
                    >
                      {syncingId === item.id ? (isEn ? "Scanning..." : "Đang quét...") : (isEn ? "Rescan" : "Quét lại")}
                    </Button>
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
                <Badge tone="soft">{sourceCategoryMap[item.category] || item.category}</Badge>
                <Badge tone={item.status === "Đã đồng bộ" ? "success" : "warning"}>
                  {sourceStatusMap[item.status] || item.status}
                </Badge>
              </header>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <div className="source-detail-grid">
                <span>
                  {isEn ? "Document Code:" : "Số hiệu văn bản:"} <strong>{item.referenceCode}</strong>
                </span>
                <span>
                  {isEn ? "Vector Size:" : "Khối lượng vector:"} <strong>{item.vectorChunks} chunks</strong>
                </span>
              </div>
              <Button
                variant="secondary"
                disabled={syncingId === item.id}
                onClick={() => handleSyncSource(item.id)}
              >
                {syncingId === item.id ? (isEn ? "Syncing..." : "Đang đồng bộ...") : (isEn ? "Resync Document" : "Đồng bộ lại tài liệu")}
              </Button>
            </Card>
          ))}
        </div>
      </Card>

      {serviceNotice && <Alert tone="warning" title={isEn ? "Feature not configured" : "Chức năng chưa được cấu hình"}>{serviceNotice}</Alert>}

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
          {rules.map((rule) => (
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
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <Switch
                  checked={rule.isEnabled}
                  label={rule.isEnabled ? (isEn ? "Active" : "Đang kích hoạt") : (isEn ? "Paused" : "Tạm dừng")}
                  onChange={() => handleToggleRule(rule.id)}
                />
              </div>
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
              value={tempPrompt}
              disabled
              onChange={setTempPrompt}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <Button variant="secondary" onClick={() => setEditingRule(null)}>
                {isEn ? "Close" : "Đóng"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==========================================
// AD08: FINANCIAL CONFIGURATION
// ==========================================

export type FinancialAssumption = {
  id: string;
  name: string;
  code: string;
  category: "Kinh tế vĩ mô" | "Lợi suất đầu tư" | "Nhân khẩu học";
  currentValue: number;
  unit: string;
  recommendedRange: string;
  description: string;
  updated: string;
  updatedBy: string;
};

export type ChangeHistoryItem = {
  id: string;
  paramName: string;
  oldValue: string;
  newValue: string;
  author: string;
  date: string;
  reason: string;
};

const initialAssumptions: FinancialAssumption[] = [
  {
    id: "FIN-01",
    name: "Tỷ lệ lạm phát kỳ vọng dài hạn",
    code: "MACRO_INFLATION_RATE",
    category: "Kinh tế vĩ mô",
    currentValue: 4.0,
    unit: "%/năm",
    recommendedRange: "3.5% - 4.5%",
    description: "Tỷ lệ trượt giá trung bình áp dụng cho tính toán chi phí sinh hoạt tuổi già trong 20-30 năm tới.",
    updated: "18/08/2025",
    updatedBy: "Lê Lan Anh",
  },
  {
    id: "FIN-02",
    name: "Lãi suất tiền gửi phi rủi ro (Risk-Free Rate)",
    code: "RISK_FREE_RATE",
    category: "Lợi suất đầu tư",
    currentValue: 5.5,
    unit: "%/năm",
    recommendedRange: "5.0% - 6.0%",
    description: "Tham chiếu lãi suất kỳ hạn 12 tháng nhóm ngân hàng thương mại quốc doanh lớn (Big 4).",
    updated: "10/08/2025",
    updatedBy: "Phạm Minh Tú",
  },
  {
    id: "FIN-03",
    name: "Lợi suất kỳ vọng Quỹ Cân bằng (60% CP / 40% TP)",
    code: "BALANCED_PORTFOLIO_RETURN",
    category: "Lợi suất đầu tư",
    currentValue: 8.5,
    unit: "%/năm",
    recommendedRange: "8.0% - 9.5%",
    description: "Lợi suất gộp bình quân kỳ vọng cho nhà đầu tư duy trì kỷ luật tích lũy định kỳ 5 năm trở lên.",
    updated: "12/08/2025",
    updatedBy: "Lê Lan Anh",
  },
  {
    id: "FIN-04",
    name: "Lợi suất kỳ vọng Quỹ Cổ phiếu Tăng trưởng",
    code: "EQUITY_GROWTH_RETURN",
    category: "Lợi suất đầu tư",
    currentValue: 10.5,
    unit: "%/năm",
    recommendedRange: "10.0% - 12.0%",
    description: "Áp dụng cho giai đoạn tích lũy của nhóm người dùng trẻ (dưới 40 tuổi) chịu được biến động ngắn hạn.",
    updated: "05/08/2025",
    updatedBy: "Nguyễn Thu Hương",
  },
  {
    id: "FIN-05",
    name: "Kỳ vọng sống trung bình của Nam giới",
    code: "LIFE_EXPECTANCY_MALE",
    category: "Nhân khẩu học",
    currentValue: 78,
    unit: "tuổi",
    recommendedRange: "75 - 82 tuổi",
    description: "Tuổi thọ trung bình dùng để xác định số năm cần chi trả sau khi nghỉ hưu đối với nam giới.",
    updated: "01/08/2025",
    updatedBy: "Hội đồng Actuarial",
  },
  {
    id: "FIN-06",
    name: "Kỳ vọng sống trung bình của Nữ giới",
    code: "LIFE_EXPECTANCY_FEMALE",
    category: "Nhân khẩu học",
    currentValue: 83,
    unit: "tuổi",
    recommendedRange: "80 - 86 tuổi",
    description: "Tuổi thọ trung bình dùng để xác định số năm cần chi trả sau khi nghỉ hưu đối với nữ giới.",
    updated: "01/08/2025",
    updatedBy: "Hội đồng Actuarial",
  },
];

const initialHistory: ChangeHistoryItem[] = [
  {
    id: "HIS-01",
    paramName: "Lãi suất tiền gửi phi rủi ro",
    oldValue: "5.8%/năm",
    newValue: "5.5%/năm",
    author: "Phạm Minh Tú",
    date: "10/08/2025, 14:15",
    reason: "Điều chỉnh theo mặt bằng lãi suất huy động thực tế các ngân hàng thương mại Nhà nước Q3/2025.",
  },
  {
    id: "HIS-02",
    paramName: "Tỷ lệ lạm phát kỳ vọng dài hạn",
    oldValue: "4.2%/năm",
    newValue: "4.0%/năm",
    author: "Lê Lan Anh",
    date: "18/08/2025, 09:30",
    reason: "Đồng bộ theo dự báo lạm phát mục tiêu 10 năm của Ngân hàng Nhà nước và WB.",
  },
  {
    id: "HIS-03",
    paramName: "Kỳ vọng sống trung bình Nữ giới",
    oldValue: "82 tuổi",
    newValue: "83 tuổi",
    author: "Hội đồng Actuarial",
    date: "01/08/2025, 16:00",
    reason: "Cập nhật dữ liệu từ Niên giám thống kê dân số 2024 mới nhất của Tổng cục Thống kê.",
  },
];

export function AdminFinancialConfigPage() {
  const { notify } = useNotification();
  const { language } = useI18n();
  const isEn = language === "en";

  const [assumptions, setAssumptions] = useState<FinancialAssumption[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("anhuu_demo_financial_assumptions") || "null") || initialAssumptions;
    } catch {
      return initialAssumptions;
    }
  });

  const [history, setHistory] = useState<ChangeHistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("anhuu_demo_financial_history") || "null") || initialHistory;
    } catch {
      return initialHistory;
    }
  });

  const [editingParam, setEditingParam] = useState<FinancialAssumption | null>(null);

  // Form states for confirmation modal
  const [newValueInput, setNewValueInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [savingToast, setSavingToast] = useState(false);
  const [validationError, setValidationError] = useState("");

  const assumptionCategoryMap: Record<string, string> = useMemo(() => ({
    "Kinh tế vĩ mô": isEn ? "Macroeconomics" : "Kinh tế vĩ mô",
    "Lợi suất đầu tư": isEn ? "Investment Returns" : "Lợi suất đầu tư",
    "Nhân khẩu học": isEn ? "Demographics" : "Nhân khẩu học",
  }), [isEn]);

  const assumptionMetaMap: Record<string, { name: string; desc: string; range: string }> = useMemo(() => ({
    "MACRO_INFLATION_RATE": {
      name: isEn ? "Long-term Expected Inflation Rate" : "Tỷ lệ lạm phát kỳ vọng dài hạn",
      desc: isEn ? "Average inflation rate applied to calculating living expenses in old age over the next 20-30 years." : "Tỷ lệ trượt giá trung bình áp dụng cho tính toán chi phí sinh hoạt tuổi già trong 20-30 năm tới.",
      range: "3.5% - 4.5%",
    },
    "RISK_FREE_RATE": {
      name: isEn ? "Risk-Free Deposit Rate" : "Lãi suất tiền gửi phi rủi ro (Risk-Free Rate)",
      desc: isEn ? "Referenced to the 12-month term deposit rates of major State-owned commercial banks (Big 4)." : "Tham chiếu lãi suất kỳ hạn 12 tháng nhóm ngân hàng thương mại quốc doanh lớn (Big 4).",
      range: "5.0% - 6.0%",
    },
    "BALANCED_PORTFOLIO_RETURN": {
      name: isEn ? "Expected Balanced Fund Return (60% Eq / 40% Bd)" : "Lợi suất kỳ vọng Quỹ Cân bằng (60% CP / 40% TP)",
      desc: isEn ? "Expected gross average return for disciplined periodic accumulation investors over 5+ years." : "Lợi suất gộp bình quân kỳ vọng cho nhà đầu tư duy trì kỷ luật tích lũy định kỳ 5 năm trở lên.",
      range: "8.0% - 9.5%",
    },
    "EQUITY_GROWTH_RETURN": {
      name: isEn ? "Expected Growth Equity Fund Return" : "Lợi suất kỳ vọng Quỹ Cổ phiếu Tăng trưởng",
      desc: isEn ? "Applied to accumulation phase of younger users (under 40) who tolerate short-term volatility." : "Áp dụng cho giai đoạn tích lũy của nhóm người dùng trẻ (dưới 40 tuổi) chịu được biến động ngắn hạn.",
      range: "10.0% - 12.0%",
    },
    "LIFE_EXPECTANCY_MALE": {
      name: isEn ? "Average Male Life Expectancy" : "Kỳ vọng sống trung bình của Nam giới",
      desc: isEn ? "Average life expectancy used to determine post-retirement payout duration for men." : "Tuổi thọ trung bình dùng để xác định số năm cần chi trả sau khi nghỉ hưu đối với nam giới.",
      range: isEn ? "75 - 82 years" : "75 - 82 tuổi",
    },
    "LIFE_EXPECTANCY_FEMALE": {
      name: isEn ? "Average Female Life Expectancy" : "Kỳ vọng sống trung bình của Nữ giới",
      desc: isEn ? "Average life expectancy used to determine post-retirement payout duration for women." : "Tuổi thọ trung bình dùng để xác định số năm cần chi trả sau khi nghỉ hưu đối với nữ giới.",
      range: isEn ? "80 - 86 years" : "80 - 86 tuổi",
    },
  }), [isEn]);

  const formatUnit = (unit: string) => {
    if (isEn) {
      if (unit === "%/năm") return "%/yr";
      if (unit === "tuổi") return "yrs";
    }
    return unit;
  };

  const handleOpenEdit = (param: FinancialAssumption) => {
    setEditingParam(param);
    setNewValueInput(param.currentValue.toString());
    setReasonInput("");
    setConfirmedCheck(false);
    setValidationError("");
  };

  const handleConfirmChange = () => {
    if (!editingParam || !confirmedCheck || !reasonInput.trim()) return;
    const numericVal = parseFloat(newValueInput);
    if (!Number.isFinite(numericVal)) {
      const err = isEn ? "Value must be a finite number." : "Giá trị phải là một số hữu hạn.";
      setValidationError(err);
      notify.error(isEn ? "Format Error" : "Lỗi định dạng", err);
      return;
    }
    const isAge = editingParam.code.startsWith("LIFE_EXPECTANCY");
    const minimum = isAge ? 60 : 0;
    const maximum = isAge ? 110 : editingParam.code === "MACRO_INFLATION_RATE" ? 20 : 30;
    if (numericVal < minimum || numericVal > maximum) {
      const err = isEn
        ? `Value must be between ${minimum} and ${maximum}${formatUnit(editingParam.unit)}.`
        : `Giá trị phải nằm trong khoảng ${minimum} đến ${maximum}${editingParam.unit}.`;
      setValidationError(err);
      notify.warning(isEn ? "Value Out of Range" : "Giá trị ngoài khoảng cho phép", err);
      return;
    }

    // Update assumption
    const nextAssumptions = assumptions.map((a) =>
      a.id === editingParam.id
        ? {
            ...a,
            currentValue: numericVal,
            updated: isEn ? "Today" : "Hôm nay",
            updatedBy: "Lê Lan Anh",
          }
        : a
    );
    setAssumptions(nextAssumptions);

    // Add to history
    const paramDisplayName = assumptionMetaMap[editingParam.code]?.name || editingParam.name;
    const newHistoryItem: ChangeHistoryItem = {
      id: `HIS-${Math.floor(Math.random() * 900) + 100}`,
      paramName: paramDisplayName,
      oldValue: `${editingParam.currentValue}${formatUnit(editingParam.unit)}`,
      newValue: `${numericVal}${formatUnit(editingParam.unit)}`,
      author: "Lê Lan Anh",
      date: isEn ? "Just now" : "Vừa xong",
      reason: reasonInput,
    };
    const nextHistory = [newHistoryItem, ...history];
    setHistory(nextHistory);
    localStorage.setItem("anhuu_demo_financial_assumptions", JSON.stringify(nextAssumptions));
    localStorage.setItem("anhuu_demo_financial_history", JSON.stringify(nextHistory));
    try {
      const auditKey = "anhuu_demo_admin_audit";
      const previous = JSON.parse(localStorage.getItem(auditKey) || "[]");
      localStorage.setItem(auditKey, JSON.stringify([{
        actor: "Lê Lan Anh",
        action: isEn ? "Update financial parameter" : "Cập nhật tham số tài chính",
        target: editingParam.code,
        time: new Date().toLocaleString(isEn ? "en-US" : "vi-VN"),
        before: `${editingParam.currentValue}${editingParam.unit}`,
        after: `${numericVal}${editingParam.unit}`,
        result: isEn ? "Success" : "Thành công",
        category: isEn ? "Configuration" : "Cấu hình",
      }, ...previous].slice(0, 100)));
    } catch {}

    setEditingParam(null);
    setSavingToast(true);
    notify.success(
      isEn ? "Parameter updated successfully" : "Cập nhật tham số thành công",
      isEn
        ? `Parameter ${paramDisplayName} has been adjusted to ${numericVal}${formatUnit(editingParam.unit)}.`
        : `Tham số ${editingParam.name} đã được điều chỉnh thành ${numericVal}${editingParam.unit}.`
    );
    setTimeout(() => setSavingToast(false), 3000);
  };

  return (
    <div className="admin-page financial-config-page">
      <header className="admin-page-header">
        <div>
          <span>{isEn ? "RISK GOVERNANCE & MATHEMATICAL MODELS" : "QUẢN TRỊ RỦI RO & MÔ HÌNH TOÁN"}</span>
          <h1>{isEn ? "Financial Parameters & Retirement Formulas (AD08)" : "Cấu hình tham số tài chính & Công thức hưu trí (AD08)"}</h1>
          <p>{isEn ? "Configure macroeconomic variables, expected rates of return, and retirement formula versions." : "Thiết lập biến số vĩ mô, tỷ suất sinh lời kỳ vọng và quản lý phiên bản công thức tính toán."}</p>
        </div>
      </header>

      {/* CRITICAL WARNING ALERT */}
      <Alert
        tone="warning"
        title={isEn ? "Sensitive Configuration Area: Affects All Users" : "Khu vực cấu hình nhạy cảm: Ảnh hưởng toàn bộ người dùng"}
      >
        {isEn
          ? "Demo parameters are saved locally in the browser and will not recalculate existing user plans. Production system requires backend approval workflow and immutable audit log."
          : "Bản demo chỉ lưu tham số trong trình duyệt và không tự tính lại kế hoạch người dùng hiện có. Hệ thống thật cần backend, quy trình phê duyệt và nhật ký máy chủ."}
      </Alert>

      {savingToast && (
        <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(145, 181, 161, 0.25)", border: "1px solid var(--color-secondary-500)", borderRadius: "var(--radius-sm)", color: "var(--color-primary-700)", fontSize: "13px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Icon name="check" /> {isEn ? "Saved parameters to demo storage. No server recalculation triggered." : "Đã lưu tham số vào bộ nhớ demo. Chưa có tác vụ tính lại trên máy chủ."}
        </div>
      )}

      {/* Version and Governance Grid */}
      <div className="financial-version-grid">
        <Card className="formula-version-card">
          <span className="formula-icon">
            <Icon name="target" size="large" />
          </span>
          <div>
            <Badge tone="neutral">{isEn ? "Demo Model" : "Mô hình demo"}</Badge>
            <h2>{isEn ? "Reference Retirement Calculation Model" : "Mô hình tính toán Hưu trí tham khảo"}</h2>
            <p>
              {isEn
                ? "Formula used for product demonstration and has not been actuarially certified as an official Social Insurance benefit calculation."
                : "Công thức dùng cho trình diễn sản phẩm và chưa được kiểm định chuyên môn hoặc xác nhận là phép tính quyền lợi BHXH chính thức."}
            </p>
          </div>
          <div>
            <Button variant="secondary" icon="download" onClick={() => window.print()}>
              {isEn ? "Print description or save PDF" : "In mô tả hoặc lưu PDF"}
            </Button>
          </div>
        </Card>

        <Card className="financial-governance-card">
          <header>
            <Icon name="circle-check" />
            <div>
              <h2>{isEn ? "Algorithmic Risk Governance" : "Kiểm soát rủi ro thuật toán"}</h2>
              <p>{isEn ? "Mandatory data protection safeguards" : "Các điều kiện bảo vệ dữ liệu bắt buộc"}</p>
            </div>
          </header>
          <div>
            <span>
              <Icon name="check" /> {isEn ? "Test 100,000 Monte Carlo samples before deployment" : "Kiểm thử 100.000 mẫu Monte Carlo trước khi áp dụng"}
            </span>
            <span>
              <Icon name="check" /> {isEn ? "Senior Administrator digital signature approval" : "Ký số phê duyệt cấp Quản trị viên cao cấp"}
            </span>
            <span>
              <Icon name="check" /> {isEn ? "Immutable audit trail logging" : "Lưu vết kiểm toán bất biến (Audit Log)"}
            </span>
            <span>
              <Icon name="check" /> {isEn ? "Rollback capability to version v2.3 within 60 seconds" : "Khả năng Rollback về bản v2.3 trong 60 giây"}
            </span>
          </div>
        </Card>
      </div>

      {/* Assumptions Table Card */}
      <Card className="financial-assumptions-card">
        <div className="ai-section-header">
          <div>
            <h2>{isEn ? "Macroeconomic Parameters & Demographic Assumptions" : "Bảng tham số kinh tế vĩ mô & Giả định nhân khẩu học"}</h2>
            <p>{isEn ? "Baseline variables applied to cashflow algorithms, inflation indexing, and retirement annuities." : "Các biến số cơ sở áp dụng cho các thuật toán tính toán dòng tiền, trượt giá và hưu bổng."}</p>
          </div>
          <Badge tone="soft">{isEn ? `${assumptions.length} standard variables` : `${assumptions.length} biến số chuẩn`}</Badge>
        </div>

        <div className="financial-table-scroll">
          <table className="financial-assumptions-table">
            <thead>
              <tr>
                <th>{isEn ? "Parameter & System Code" : "Tên tham số & Mã hệ thống"}</th>
                <th>{isEn ? "Category" : "Phân loại"}</th>
                <th>{isEn ? "Current Value" : "Giá trị hiện tại"}</th>
                <th>{isEn ? "Recommended Range" : "Phạm vi khuyến nghị"}</th>
                <th>{isEn ? "Updated By" : "Người cập nhật"}</th>
                <th>{isEn ? "Updated Date" : "Ngày cập nhật"}</th>
                <th style={{ textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
              </tr>
            </thead>
            <tbody>
              {assumptions.map((item) => {
                const meta = assumptionMetaMap[item.code];
                const displayName = meta?.name || item.name;
                const displayDesc = meta?.desc || item.description;
                const displayRange = meta?.range || item.recommendedRange;
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{displayName}</strong>
                      <small>{isEn ? "Code: " : "Mã: "}{item.code} · {displayDesc}</small>
                    </td>
                    <td>
                      <Badge tone="soft">{assumptionCategoryMap[item.category] || item.category}</Badge>
                    </td>
                    <td>
                      <span className="current-financial-value">
                        {item.currentValue} <small>{formatUnit(item.unit)}</small>
                      </span>
                    </td>
                    <td>
                      <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                        {displayRange}
                      </span>
                    </td>
                    <td>
                      <span>{item.updatedBy}</span>
                    </td>
                    <td>
                      <small>{item.updated}</small>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleOpenEdit(item)}
                      >
                        {isEn ? "Adjust" : "Điều chỉnh"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View for Assumptions */}
        <div className="financial-mobile-list">
          {assumptions.map((item) => {
            const meta = assumptionMetaMap[item.code];
            const displayName = meta?.name || item.name;
            const displayDesc = meta?.desc || item.description;
            const displayRange = meta?.range || item.recommendedRange;
            return (
              <Card key={item.id} className="business-mobile-card">
                <header>
                  <Badge tone="soft">{assumptionCategoryMap[item.category] || item.category}</Badge>
                  <span className="current-financial-value">
                    {item.currentValue} <small>{formatUnit(item.unit)}</small>
                  </span>
                </header>
                <h2>{displayName}</h2>
                <p>{displayDesc}</p>
                <div>
                  <span>
                    {isEn ? "Safe range:" : "Phạm vi an toàn:"} <strong>{displayRange}</strong>
                  </span>
                  <span>
                    {isEn ? "Updated by:" : "Cập nhật bởi:"} <strong>{item.updatedBy}</strong>
                  </span>
                </div>
                <Button variant="secondary" onClick={() => handleOpenEdit(item)}>
                  {isEn ? "Adjust Parameter" : "Điều chỉnh tham số"}
                </Button>
              </Card>
            );
          })}
        </div>
      </Card>

      {/* Change History Card (Audit Log) */}
      <Card className="change-history-card">
        <div className="ai-section-header">
          <div>
            <h2>{isEn ? "Recent Parameter Adjustment History (Audit Trail)" : "Lịch sử điều chỉnh tham số gần nhất (Audit Trail)"}</h2>
            <p>{isEn ? "Complete record of financial variable changes, operators, and business rationales." : "Ghi lại đầy đủ mọi thay đổi biến số tài chính, người thực hiện và căn cứ nghiệp vụ."}</p>
          </div>
          <Badge tone="neutral">{isEn ? "Immutable Storage" : "Lưu trữ bất biến"}</Badge>
        </div>

        <div className="change-history-list">
          {history.map((his) => (
            <div key={his.id}>
              <span className="history-change-icon">
                <Icon name="chart" />
              </span>
              <div>
                <strong>{his.paramName}</strong>
                <p>
                  {isEn ? "Old value:" : "Giá trị cũ:"} <b>{his.oldValue}</b> → {isEn ? "New value:" : "Giá trị mới:"} <b>{his.newValue}</b>
                </p>
                <small>{isEn ? "Reason:" : "Lý do:"} {his.reason}</small>
              </div>
              <div className="history-meta">
                <strong>{his.author}</strong>
                <span>{his.date}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Parameter Edit Confirmation Modal */}
      <Modal
        open={Boolean(editingParam)}
        title={editingParam ? (isEn ? `Adjust Parameter: ${assumptionMetaMap[editingParam.code]?.name || editingParam.name}` : `Điều chỉnh tham số: ${editingParam.name}`) : (isEn ? "Configuration" : "Cấu hình")}
        onClose={() => setEditingParam(null)}
      >
        {editingParam && (
          <div className="financial-confirmation">
            <div className="current-value-panel">
              <span>{isEn ? "Current Applied Value" : "Giá trị hiện đang áp dụng"}</span>
              <strong>
                {editingParam.currentValue} <small>{formatUnit(editingParam.unit)}</small>
              </strong>
              <p>{assumptionMetaMap[editingParam.code]?.desc || editingParam.description}</p>
            </div>

            <div className="value-comparison">
              <span>
                <small>{isEn ? "Current" : "Hiện tại"}</small>
                <strong>{editingParam.currentValue} <b>{formatUnit(editingParam.unit)}</b></strong>
              </span>
              <Icon name="arrow-right" size="large" />
              <span className="is-new">
                <small>{isEn ? "Proposed New Value" : "Giá trị mới đề xuất"}</small>
                <div style={{ marginTop: "var(--space-2)" }}>
                  <Input
                    label={isEn ? "New Value" : "Giá trị mới"}
                    type="number"
                    value={newValueInput}
                    onChange={setNewValueInput}
                  />
                </div>
              </span>
            </div>

            <div className="confirmation-details">
              <span>
                {isEn ? "System Parameter Code:" : "Mã tham số hệ thống:"} <strong>{editingParam.code}</strong>
              </span>
              <span>
                {isEn ? "Recommended Range:" : "Phạm vi khuyến nghị:"} <strong>{assumptionMetaMap[editingParam.code]?.range || editingParam.recommendedRange}</strong>
              </span>
            </div>

            <Alert tone="warning" title={isEn ? "Macro Assumptions Governance" : "Quy trình phê duyệt vĩ mô T03"}>
              {isEn
                ? "Official changes to financial assumptions require the T03 Macro Assumptions Workflow. Submissions here are registered as draft proposals."
                : "Các thay đổi chính thức đối với giả định tài chính vĩ mô đòi hỏi quy trình phê duyệt T03 Macro Assumptions Workflow. Thay đổi tại đây được ghi nhận dưới dạng đề xuất dự thảo."}
            </Alert>

            <Textarea
              label={isEn ? "Basis for Change & Business Rationale (Required)" : "Căn cứ thay đổi & Lý do nghiệp vụ (Bắt buộc)"}
              placeholder={isEn ? "E.g. Based on Decision No... or State Bank macroeconomic report..." : "VD: Căn cứ theo quyết định số... hoặc báo cáo vĩ mô của Ngân hàng Nhà nước..."}
              rows={3}
              value={reasonInput}
              onChange={setReasonInput}
            />

            <div className="change-requirements">
              <span className="is-complete">
                <Icon name="info" /> {isEn ? "Does not auto-recalculate user plans in demo mode" : "Không tự tính lại kế hoạch người dùng trong bản demo"}
              </span>
              <span className="is-complete">
                <Icon name="check" /> {isEn ? "Changes saved to browser local history" : "Thay đổi được lưu trong lịch sử cục bộ của trình duyệt"}
              </span>
            </div>

            {validationError && <Alert tone="danger" title={isEn ? "Invalid Value" : "Giá trị không hợp lệ"}>{validationError}</Alert>}

            <label className="confirmation-check">
              <input
                type="checkbox"
                checked={confirmedCheck}
                onChange={(e) => setConfirmedCheck(e.target.checked)}
              />
              <span className="checkbox-visual" style={{ width: "18px", height: "18px", border: "1px solid var(--color-border)", borderRadius: "4px", display: "grid", placeItems: "center" }}>
                {confirmedCheck && <Icon name="check" size="small" />}
              </span>
              <span>
                {isEn
                  ? "I confirm that I have evaluated the impact and accept responsibility for this parameter modification."
                  : "Tôi xác nhận đã kiểm tra tác động và chịu trách nhiệm với sự thay đổi tham số này."}
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <Button variant="secondary" onClick={() => setEditingParam(null)}>
                {isEn ? "Cancel" : "Hủy bỏ"}
              </Button>
              <Button
                variant="primary"
                disabled={!confirmedCheck || !reasonInput.trim() || !newValueInput}
                onClick={handleConfirmChange}
              >
                {isEn ? "Confirm & Update Parameter" : "Xác nhận & Cập nhật tham số"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
