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

// ==========================================
// AD07 — AI & KNOWLEDGE BASE MANAGEMENT
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
    id: "SRC-101",
    title: "Luật Bảo hiểm xã hội số 41/2024/QH15",
    referenceCode: "41/2024/QH15",
    category: "Luật & Nghị định",
    vectorChunks: 580,
    status: "Đã đồng bộ",
    updated: "15/08/2025",
    description: "Quy định chi tiết điều kiện hưởng lương hưu 15 năm, cách tính tỷ lệ hưởng nam/nữ, trợ cấp hưu trí xã hội.",
  },
  {
    id: "SRC-102",
    title: "Nghị định quy định chi tiết Luật BHXH về hưu trí tự nguyện",
    referenceCode: "NĐ-75/2024/NĐ-CP",
    category: "Luật & Nghị định",
    vectorChunks: 340,
    status: "Đã đồng bộ",
    updated: "10/08/2025",
    description: "Mức hỗ trợ của Nhà nước đối với người tham gia BHXH tự nguyện và chính sách khuyến khích khu vực phi chính thức.",
  },
  {
    id: "SRC-103",
    title: "Báo cáo Tổng điều tra Dân số & Bảng tuổi thọ kỳ vọng Tổng cục Thống kê",
    referenceCode: "GSO-VN-2024",
    category: "Thống kê vĩ mô",
    vectorChunks: 210,
    status: "Đã đồng bộ",
    updated: "01/08/2025",
    description: "Bảng tử vong rút gọn, xác suất sống theo độ tuổi nam và nữ tại Việt Nam giai đoạn 2024-2035.",
  },
  {
    id: "SRC-104",
    title: "Chuẩn mực Hoạch định Hưu trí Cá nhân (CFA Institute & FPSB)",
    referenceCode: "FPSB-RETIRE-2023",
    category: "Chuẩn mực tài chính",
    vectorChunks: 420,
    status: "Đã đồng bộ",
    updated: "28/07/2025",
    description: "Nguyên tắc 3 trụ cột, chiến lược phân bổ tài sản trượt thời gian (Glide Path) và quy tắc rút vốn an toàn.",
  },
  {
    id: "SRC-105",
    title: "Dự thảo Thông tư hướng dẫn thuế thu nhập cá nhân đối với quỹ hưu trí bổ sung",
    referenceCode: "TT-BTC-DRAFT",
    category: "Luật & Nghị định",
    vectorChunks: 125,
    status: "Cần quét lại",
    updated: "18/08/2025",
    description: "Đang cập nhật các điểm sửa đổi về mức trần khấu trừ chi phí đóng quỹ hưu trí tự nguyện của doanh nghiệp.",
  },
];

const initialRules: PromptRule[] = [
  {
    id: "RUL-01",
    title: "Tuyệt đối không cam kết lợi nhuận đầu tư cố định",
    description: "Khi tư vấn quỹ mở hoặc cổ phiếu, AI phải nhấn mạnh lợi suất kỳ vọng không phải là bảo đảm và có biến động thị trường.",
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
  const [sources, setSources] = useState<KnowledgeSource[]>(initialSources);
  const [rules, setRules] = useState<PromptRule[]>(initialRules);
  const [searchSource, setSearchSource] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Tất cả nguồn");
  const [editingRule, setEditingRule] = useState<PromptRule | null>(null);
  const [tempPrompt, setTempPrompt] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [serviceNotice, setServiceNotice] = useState("");

  // Filter sources
  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      const matchSearch =
        searchSource === "" ||
        s.title.toLowerCase().includes(searchSource.toLowerCase()) ||
        s.referenceCode.toLowerCase().includes(searchSource.toLowerCase());
      const matchCat = categoryFilter === "Tất cả nguồn" || s.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [sources, searchSource, categoryFilter]);

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
          ? { ...r, systemPrompt: tempPrompt, updated: "Hôm nay" }
          : r
      )
    );
    setEditingRule(null);
  };

  const handleSyncSource = (id: string) => {
    setSyncingId(null);
    setServiceNotice(`Chưa thể đồng bộ nguồn ${id}: bản demo chưa được cấu hình dịch vụ lập chỉ mục phía máy chủ.`);
  };

  return (
    <div className="admin-page business-page">
      <header className="admin-page-header">
        <div>
          <span>TRÍ TUỆ NHÂN TẠO & DỮ LIỆU</span>
          <h1>Quản lý Trợ lý AI & Cơ sở tri thức (AD07)</h1>
          <p>Giám sát nguồn tri thức pháp lý, cấu hình guardrails an toàn và giám sát lưu lượng tư vấn.</p>
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
                <Badge tone="neutral">Chế độ dữ liệu minh họa</Badge>
                <span style={{ color: "var(--color-soft)", fontSize: "12px" }}>Độ trễ trung bình: 0.82s</span>
              </div>
              <h2>Trợ lý Tư vấn Tài chính & Hưu trí Thông minh</h2>
              <p>
                Giao diện minh họa danh mục nguồn tri thức. Chưa có dịch vụ AI hoặc chỉ mục tìm kiếm được kết nối
                về quản lý tài sản và dữ liệu thống kê dân số Việt Nam. Mọi lập luận đều có dẫn chiếu
                minh bạch, không phỏng đoán, không cam kết sai lệch.
              </p>
            </div>
          </div>

          <div className="ai-business-capabilities">
            <span>
              <Icon name="file-text" />
              <div>
                <strong>Luật BHXH 2024</strong>
                <small>41 điều khoản hưu trí mới</small>
              </div>
            </span>
            <span>
              <Icon name="chart" />
              <div>
                <strong>Hoạch định dòng tiền</strong>
                <small>Độc lập trượt giá & lạm phát</small>
              </div>
            </span>
            <span>
              <Icon name="target" />
              <div>
                <strong>Phân bổ danh mục</strong>
                <small>Khẩu vị rủi ro chuẩn hóa</small>
              </div>
            </span>
          </div>

          <footer>
            <Icon name="circle-check" size="small" />
            <span>Dữ liệu nguồn đang là mẫu giao diện; chưa có lần đồng bộ máy chủ được xác nhận.</span>
          </footer>
        </Card>

        {/* AI Usage Card */}
        <Card className="ai-usage-card">
          <header>
            <div>
              <h2>Lưu lượng hội thoại</h2>
              <p>Thống kê 4 tuần gần nhất</p>
            </div>
            <Badge tone="soft">30 ngày qua</Badge>
          </header>

          <div className="ai-usage-metric">
            <span>Tổng lượt tương tác hỏi đáp</span>
            <strong>38.450</strong>
            <small>↑ 14.2% so với tháng trước</small>
          </div>

          <div className="ai-week-bars">
            <div>
              <span className="week-one" />
              <small>Tuần 1</small>
            </div>
            <div>
              <span className="week-two" />
              <small>Tuần 2</small>
            </div>
            <div>
              <span className="week-three" />
              <small>Tuần 3</small>
            </div>
            <div>
              <span className="week-four" />
              <small>Tuần 4</small>
            </div>
          </div>

          <div className="ai-usage-footer">
            <span>
              Trạng thái dịch vụ: <strong>Chưa kết nối</strong>
            </span>
            <span>
              Kiểm định nghiệp vụ: <strong>Chưa thực hiện</strong>
            </span>
          </div>
        </Card>
      </div>

      {/* Knowledge Sources Table Card */}
      <Card className="ai-source-card">
        <div className="ai-section-header">
          <div>
            <h2>Danh mục nguồn tri thức dự kiến</h2>
            <p>Dữ liệu mẫu để thiết kế quy trình; chưa được tải lên hoặc lập chỉ mục trên máy chủ.</p>
          </div>
          <Button variant="secondary" icon="plus" onClick={() => setServiceNotice("Tải tài liệu cần dịch vụ lưu trữ và lập chỉ mục phía máy chủ; bản demo chưa được cấu hình.")}>
            Tải lên tài liệu mới
          </Button>
        </div>

        <header className="admin-table-toolbar" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="admin-filter-group">
            <div className="business-search">
              <SearchField
                label="Tìm kiếm nguồn dữ liệu"
                placeholder="Tìm tên luật, số hiệu văn bản..."
                value={searchSource}
                onChange={setSearchSource}
              />
            </div>
            <Select
              label="Phân loại nguồn"
              options={[
                "Tất cả nguồn",
                "Luật & Nghị định",
                "Thống kê vĩ mô",
                "Chuẩn mực tài chính",
              ]}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
          </div>
        </header>

        {/* Desktop Table */}
        <div className="ai-source-table-scroll">
          <table className="ai-source-table">
            <thead>
              <tr>
                <th>Văn bản & Số hiệu</th>
                <th>Phân loại</th>
                <th>Số phân đoạn (Vector Chunks)</th>
                <th>Trạng thái chỉ mục</th>
                <th>Cập nhật lần cuối</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
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
                        <small>Số hiệu: {item.referenceCode} · {item.description}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone="soft">{item.category}</Badge>
                  </td>
                  <td>
                    <strong>{item.vectorChunks} chunks</strong>
                  </td>
                  <td>
                    <Badge tone={item.status === "Đã đồng bộ" ? "success" : "warning"}>
                      {item.status}
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
                      {syncingId === item.id ? "Đang quét..." : "Quét lại"}
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
                <Badge tone="soft">{item.category}</Badge>
                <Badge tone={item.status === "Đã đồng bộ" ? "success" : "warning"}>
                  {item.status}
                </Badge>
              </header>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <div className="source-detail-grid">
                <span>
                  Số hiệu văn bản: <strong>{item.referenceCode}</strong>
                </span>
                <span>
                  Khối lượng vector: <strong>{item.vectorChunks} chunks</strong>
                </span>
              </div>
              <Button
                variant="secondary"
                disabled={syncingId === item.id}
                onClick={() => handleSyncSource(item.id)}
              >
                {syncingId === item.id ? "Đang đồng bộ..." : "Đồng bộ lại tài liệu"}
              </Button>
            </Card>
          ))}
        </div>
      </Card>

      {serviceNotice && <Alert tone="warning" title="Chức năng chưa được cấu hình">{serviceNotice}</Alert>}

      {/* Prompt Rules & Guardrails Card */}
      <Card className="ai-rules-card">
        <div className="ai-section-header">
          <div>
            <h2>Bộ quy tắc nghiệp vụ & Giới hạn an toàn (Guardrails)</h2>
            <p>Quy chuẩn kiểm soát nội dung, chống thiên vị và bảo đảm tuân thủ quy định pháp luật tài chính.</p>
          </div>
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
                    {rule.severity}
                  </Badge>
                </div>
                <p>{rule.description}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <Switch
                  checked={rule.isEnabled}
                  label={rule.isEnabled ? "Đang kích hoạt" : "Tạm dừng"}
                  onChange={() => handleToggleRule(rule.id)}
                />
              </div>
              <div>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => handleOpenEditRule(rule)}
                >
                  Sửa lệnh Prompt
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Edit Rule Modal */}
      <Modal
        open={Boolean(editingRule)}
        title={editingRule ? `Chỉnh sửa chỉ dẫn quy tắc: ${editingRule.title}` : "Quy tắc"}
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

            <Textarea
              label="Nội dung chỉ đạo hệ thống (System Prompt Guardrail)"
              rows={6}
              value={tempPrompt}
              onChange={setTempPrompt}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <Button variant="secondary" onClick={() => setEditingRule(null)}>
                Hủy
              </Button>
              <Button variant="primary" onClick={handleSaveRule}>
                Lưu quy tắc
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==========================================
// AD08 — FINANCIAL CONFIGURATION
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
  const [assumptions, setAssumptions] = useState<FinancialAssumption[]>(() => { try { return JSON.parse(localStorage.getItem("anhuu_demo_financial_assumptions") || "null") || initialAssumptions; } catch { return initialAssumptions; } });
  const [history, setHistory] = useState<ChangeHistoryItem[]>(() => { try { return JSON.parse(localStorage.getItem("anhuu_demo_financial_history") || "null") || initialHistory; } catch { return initialHistory; } });
  const [editingParam, setEditingParam] = useState<FinancialAssumption | null>(null);

  // Form states for confirmation modal
  const [newValueInput, setNewValueInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [savingToast, setSavingToast] = useState(false);
  const [validationError, setValidationError] = useState("");

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
      const err = "Giá trị phải là một số hữu hạn.";
      setValidationError(err);
      notify.error("Lỗi định dạng", err);
      return;
    }
    const isAge = editingParam.code.startsWith("LIFE_EXPECTANCY");
    const minimum = isAge ? 60 : 0;
    const maximum = isAge ? 110 : editingParam.code === "MACRO_INFLATION_RATE" ? 20 : 30;
    if (numericVal < minimum || numericVal > maximum) {
      const err = `Giá trị phải nằm trong khoảng ${minimum} đến ${maximum}${editingParam.unit}.`;
      setValidationError(err);
      notify.warning("Giá trị ngoài khoảng cho phép", err);
      return;
    }

    // Update assumption
    const nextAssumptions = assumptions.map((a) =>
        a.id === editingParam.id
          ? {
              ...a,
              currentValue: numericVal,
              updated: "Hôm nay",
              updatedBy: "Lê Lan Anh",
            }
          : a
      );
    setAssumptions(nextAssumptions);

    // Add to history
    const newHistoryItem: ChangeHistoryItem = {
      id: `HIS-${Math.floor(Math.random() * 900) + 100}`,
      paramName: editingParam.name,
      oldValue: `${editingParam.currentValue}${editingParam.unit}`,
      newValue: `${numericVal}${editingParam.unit}`,
      author: "Lê Lan Anh",
      date: "Vừa xong",
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
        action: "Cập nhật tham số tài chính",
        target: editingParam.code,
        time: new Date().toLocaleString("vi-VN"),
        before: `${editingParam.currentValue}${editingParam.unit}`,
        after: `${numericVal}${editingParam.unit}`,
        result: "Thành công",
        category: "Cấu hình",
      }, ...previous].slice(0, 100)));
    } catch {}

    setEditingParam(null);
    setSavingToast(true);
    notify.success("Cập nhật tham số thành công", `Tham số ${editingParam.name} đã được điều chỉnh thành ${numericVal}${editingParam.unit}.`);
    setTimeout(() => setSavingToast(false), 3000);
  };

  return (
    <div className="admin-page financial-config-page">
      <header className="admin-page-header">
        <div>
          <span>QUẢN TRỊ RỦI RO & MÔ HÌNH TOÁN</span>
          <h1>Cấu hình tham số tài chính & Công thức hưu trí (AD08)</h1>
          <p>Thiết lập biến số vĩ mô, tỷ suất sinh lời kỳ vọng và quản lý phiên bản công thức tính toán.</p>
        </div>
      </header>

      {/* CRITICAL WARNING ALERT */}
      <Alert
        tone="warning"
        title="Khu vực cấu hình nhạy cảm — Ảnh hưởng toàn bộ người dùng"
      >
        Bản demo chỉ lưu tham số trong trình duyệt và không tự tính lại kế hoạch người dùng hiện có. Hệ thống thật cần backend, quy trình phê duyệt và nhật ký máy chủ.
      </Alert>

      {savingToast && (
        <div style={{ padding: "var(--space-3) var(--space-4)", background: "rgba(145, 181, 161, 0.25)", border: "1px solid var(--color-secondary-500)", borderRadius: "var(--radius-sm)", color: "var(--color-primary-700)", fontSize: "13px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Icon name="check" /> Đã lưu tham số vào bộ nhớ demo. Chưa có tác vụ tính lại trên máy chủ.
        </div>
      )}

      {/* Version and Governance Grid */}
      <div className="financial-version-grid">
        <Card className="formula-version-card">
          <span className="formula-icon">
            <Icon name="target" size="large" />
          </span>
          <div>
            <Badge tone="neutral">Mô hình demo</Badge>
            <h2>Mô hình tính toán Hưu trí tham khảo</h2>
            <p>
              Công thức dùng cho trình diễn sản phẩm và chưa được kiểm định chuyên môn hoặc xác nhận là phép tính quyền lợi BHXH chính thức.
            </p>
          </div>
          <div>
            <Button variant="secondary" icon="download" onClick={() => window.print()}>
              In mô tả hoặc lưu PDF
            </Button>
          </div>
        </Card>

        <Card className="financial-governance-card">
          <header>
            <Icon name="circle-check" />
            <div>
              <h2>Kiểm soát rủi ro thuật toán</h2>
              <p>Các điều kiện bảo vệ dữ liệu bắt buộc</p>
            </div>
          </header>
          <div>
            <span>
              <Icon name="check" /> Kiểm thử 100.000 mẫu Monte Carlo trước khi áp dụng
            </span>
            <span>
              <Icon name="check" /> Ký số phê duyệt cấp Quản trị viên cao cấp
            </span>
            <span>
              <Icon name="check" /> Lưu vết kiểm toán bất biến (Audit Log)
            </span>
            <span>
              <Icon name="check" /> Khả năng Rollback về bản v2.3 trong 60 giây
            </span>
          </div>
        </Card>
      </div>

      {/* Assumptions Table Card */}
      <Card className="financial-assumptions-card">
        <div className="ai-section-header">
          <div>
            <h2>Bảng tham số kinh tế vĩ mô & Giả định nhân khẩu học</h2>
            <p>Các biến số cơ sở áp dụng cho các thuật toán tính toán dòng tiền, trượt giá và hưu bổng.</p>
          </div>
          <Badge tone="soft">{assumptions.length} biến số chuẩn</Badge>
        </div>

        <div className="financial-table-scroll">
          <table className="financial-assumptions-table">
            <thead>
              <tr>
                <th>Tên tham số & Mã hệ thống</th>
                <th>Phân loại</th>
                <th>Giá trị hiện tại</th>
                <th>Phạm vi khuyến nghị</th>
                <th>Người cập nhật</th>
                <th>Ngày cập nhật</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {assumptions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>Mã: {item.code} · {item.description}</small>
                  </td>
                  <td>
                    <Badge tone="soft">{item.category}</Badge>
                  </td>
                  <td>
                    <span className="current-financial-value">
                      {item.currentValue} <small>{item.unit}</small>
                    </span>
                  </td>
                  <td>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                      {item.recommendedRange}
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
                      Điều chỉnh
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View for Assumptions */}
        <div className="financial-mobile-list">
          {assumptions.map((item) => (
            <Card key={item.id} className="business-mobile-card">
              <header>
                <Badge tone="soft">{item.category}</Badge>
                <span className="current-financial-value">
                  {item.currentValue} <small>{item.unit}</small>
                </span>
              </header>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
              <div>
                <span>
                  Phạm vi an toàn:
                  <strong>{item.recommendedRange}</strong>
                </span>
                <span>
                  Cập nhật bởi:
                  <strong>{item.updatedBy}</strong>
                </span>
              </div>
              <Button variant="secondary" onClick={() => handleOpenEdit(item)}>
                Điều chỉnh tham số
              </Button>
            </Card>
          ))}
        </div>
      </Card>

      {/* Change History Card (Audit Log) */}
      <Card className="change-history-card">
        <div className="ai-section-header">
          <div>
            <h2>Lịch sử điều chỉnh tham số gần nhất (Audit Trail)</h2>
            <p>Ghi lại đầy đủ mọi thay đổi biến số tài chính, người thực hiện và căn cứ nghiệp vụ.</p>
          </div>
          <Badge tone="neutral">Lưu trữ bất biến</Badge>
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
                  Giá trị cũ: <b>{his.oldValue}</b> → Giá trị mới: <b>{his.newValue}</b>
                </p>
                <small>Lý do: {his.reason}</small>
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
        title={editingParam ? `Điều chỉnh tham số: ${editingParam.name}` : "Cấu hình"}
        onClose={() => setEditingParam(null)}
      >
        {editingParam && (
          <div className="financial-confirmation">
            <div className="current-value-panel">
              <span>Giá trị hiện đang áp dụng</span>
              <strong>
                {editingParam.currentValue} <small>{editingParam.unit}</small>
              </strong>
              <p>{editingParam.description}</p>
            </div>

            <div className="value-comparison">
              <span>
                <small>Hiện tại</small>
                <strong>{editingParam.currentValue} <b>{editingParam.unit}</b></strong>
              </span>
              <Icon name="arrow-right" size="large" />
              <span className="is-new">
                <small>Giá trị mới đề xuất</small>
                <div style={{ marginTop: "var(--space-2)" }}>
                  <Input
                    label="Giá trị mới"
                    type="number"
                    value={newValueInput}
                    onChange={setNewValueInput}
                  />
                </div>
              </span>
            </div>

            <div className="confirmation-details">
              <span>
                Mã tham số hệ thống:
                <strong>{editingParam.code}</strong>
              </span>
              <span>
                Phạm vi khuyến nghị:
                <strong>{editingParam.recommendedRange}</strong>
              </span>
            </div>

            <Textarea
              label="Căn cứ thay đổi & Lý do nghiệp vụ (Bắt buộc)"
              placeholder="VD: Căn cứ theo quyết định số... hoặc báo cáo vĩ mô của Ngân hàng Nhà nước..."
              rows={3}
              value={reasonInput}
              onChange={setReasonInput}
            />

            <div className="change-requirements">
              <span className="is-complete">
                <Icon name="info" /> Không tự tính lại kế hoạch người dùng trong bản demo
              </span>
              <span className="is-complete">
                <Icon name="check" /> Thay đổi được lưu trong lịch sử cục bộ của trình duyệt
              </span>
            </div>

            {validationError && <Alert tone="danger" title="Giá trị không hợp lệ">{validationError}</Alert>}

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
                Tôi xác nhận đã kiểm tra tác động và chịu trách nhiệm với sự thay đổi tham số này.
              </span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <Button variant="secondary" onClick={() => setEditingParam(null)}>
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                disabled={!confirmedCheck || !reasonInput.trim() || !newValueInput}
                onClick={handleConfirmChange}
              >
                Xác nhận & Cập nhật tham số
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
