import { useState, useMemo } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Icon,
  Input,
  Modal,
  Pagination,
  SearchField,
  Select,
  Switch,
  Tabs,
  Textarea,
  Avatar,
  type IconName,
} from "../../components/ui";
import { downloadCsv } from "../../utils/downloads";

// ==========================================
// AD04 — CONSULTATION MANAGEMENT
// ==========================================

export type ConsultationRequest = {
  id: string;
  userId: string;
  userName: string;
  userInitials: string;
  userEmail: string;
  userPhone: string;
  userAge: number;
  userFund: string;
  topic: string;
  details: string;
  date: string;
  preferredTime: string;
  appointmentAt?: string;
  status: "Mới" | "Đang xử lý" | "Đã xếp lịch" | "Đã hoàn thành" | "Đã hủy";
  assignedAdmin: string;
  notes: string;
};

const initialConsultations: ConsultationRequest[] = [
  {
    id: "CS-3091",
    userId: "USR-1082",
    userName: "Nguyễn Minh An",
    userInitials: "NA",
    userEmail: "minhan@example.com",
    userPhone: "0912 345 678",
    userAge: 32,
    userFund: "8.5 tỷ đ",
    topic: "Tư vấn điều chỉnh tỷ trọng quỹ mở khi chuyển giao việc làm",
    details: "Dự định chuyển công tác trong 6 tháng tới, muốn tái cơ cấu danh mục cổ phiếu/trái phiếu để giữ ổn định dòng tiền tích lũy hưu trí.",
    date: "18/08/2025, 08:30",
    preferredTime: "Sáng thứ Bảy (09:00 - 10:30)",
    status: "Mới",
    assignedAdmin: "Chưa phân công",
    notes: "Khách hàng có kế hoạch FIRE tuổi 50, cần chuyên viên có kinh nghiệm phân bổ tài sản.",
  },
  {
    id: "CS-3088",
    userId: "USR-1081",
    userName: "Trần Thu Hà",
    userInitials: "TH",
    userEmail: "thuha@example.com",
    userPhone: "0908 123 456",
    userAge: 40,
    userFund: "10.2 tỷ đ",
    topic: "Giải thích công thức lương hưu BHXH mới và kịch bản đóng tiếp",
    details: "Đã tham gia BHXH bắt buộc 14 năm, muốn hỏi phương án chuyển sang BHXH tự nguyện sau khi dừng làm công ty.",
    date: "17/08/2025, 14:15",
    preferredTime: "Chiều thứ Tư (15:00 - 16:00)",
    status: "Đang xử lý",
    assignedAdmin: "Lê Lan Anh",
    notes: "Đã gửi bản tóm tắt qua email, chuẩn bị tài liệu so sánh mức hưởng 2025 vs 2026.",
  },
  {
    id: "CS-3085",
    userId: "USR-1079",
    userName: "Lê Hoàng Nam",
    userInitials: "LN",
    userEmail: "hoangnam@example.com",
    userPhone: "0987 654 321",
    userAge: 48,
    userFund: "12.0 tỷ đ",
    topic: "Lập phương án rút vốn định kỳ sau khi về hưu tuổi 58",
    details: "Đã có đủ bất động sản cho thuê và tiền gửi ngân hàng, cần tối ưu quy tắc rút vốn 4% tránh lạm phát làm bào mòn gốc.",
    date: "16/08/2025, 11:00",
    preferredTime: "Tối thứ Năm (19:30 - 20:30)",
    appointmentAt: "2026-10-05T19:30",
    status: "Đã xếp lịch",
    assignedAdmin: "Phạm Minh Tú",
    notes: "Lịch hẹn Zoom online ngày 22/08 lúc 19:30. Đã gửi đường link và xác nhận qua SMS.",
  },
  {
    id: "CS-3077",
    userId: "USR-1075",
    userName: "Vũ Đức Long",
    userInitials: "VL",
    userEmail: "duclong@example.com",
    userPhone: "0971 888 999",
    userAge: 45,
    userFund: "6.8 tỷ đ",
    topic: "Hỏi về gói bảo hiểm sức khỏe niên kim liên kết hưu trí",
    details: "Quan tâm đến quyền lợi y tế khi tuổi cao và mức bảo vệ dự phòng trước 60 tuổi.",
    date: "14/08/2025, 16:45",
    preferredTime: "Sáng thứ Hai (10:00 - 11:00)",
    status: "Đã hoàn thành",
    assignedAdmin: "Lê Lan Anh",
    notes: "Đã tư vấn chi tiết quyền lợi bổ sung và cung cấp bảng minh họa phí 3 đối tác liên kết.",
  },
  {
    id: "CS-3069",
    userId: "USR-1072",
    userName: "Phạm Ngọc Mai",
    userInitials: "PM",
    userEmail: "ngocmai@example.com",
    userPhone: "0934 567 890",
    userAge: 29,
    userFund: "5.5 tỷ đ",
    topic: "Kế hoạch bắt đầu tiết kiệm từ 5 triệu/tháng",
    details: "Mới đi làm 4 năm, muốn được tư vấn bước đầu mở tài khoản quỹ tích lũy hưu trí tự nguyện.",
    date: "12/08/2025, 09:20",
    preferredTime: "Chiều thứ Bảy",
    status: "Đã hoàn thành",
    assignedAdmin: "Nguyễn Thu Hương",
    notes: "Đã hướng dẫn tích lũy tự động hàng tháng qua Vietcombank DigiBank.",
  },
  {
    id: "CS-3064",
    userId: "USR-1068",
    userName: "Đoàn Quốc Bảo",
    userInitials: "DB",
    userEmail: "quocbao@example.com",
    userPhone: "0915 222 333",
    userAge: 52,
    userFund: "15.0 tỷ đ",
    topic: "Tư vấn hoạch định thừa kế và chuyển giao tài sản",
    details: "Khách hàng muốn tham vấn cấu trúc tài sản chuyển nhượng cho con cái song song quỹ sống an nhàn.",
    date: "10/08/2025, 15:30",
    preferredTime: "Cuối tuần",
    status: "Đã hủy",
    assignedAdmin: "Phạm Minh Tú",
    notes: "Khách hàng thông báo bận việc gia đình đột xuất và xin hoãn hẹn lại sau tháng 9.",
  },
];

export function AdminConsultationsPage() {
  const [requests, setRequests] = useState<ConsultationRequest[]>(() => { try { return JSON.parse(localStorage.getItem("anhuu_demo_consultations") || "null") || initialConsultations; } catch { return initialConsultations; } });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tất cả trạng thái");
  const [selectedRequest, setSelectedRequest] = useState<ConsultationRequest | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingStatus, setEditingStatus] = useState<ConsultationRequest["status"]>("Mới");
  const [editingAdmin, setEditingAdmin] = useState("");
  const [editingAppointment, setEditingAppointment] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [savedToast, setSavedToast] = useState(false);

  // Statistics
  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === "Mới" || r.status === "Đang xử lý").length;
    const scheduled = requests.filter((r) => r.status === "Đã xếp lịch").length;
    const completed = requests.filter((r) => r.status === "Đã hoàn thành").length;
    return { total, pending, scheduled, completed };
  }, [requests]);

  // Filtered requests
  const filtered = useMemo(() => {
    return requests.filter((req) => {
      const matchSearch =
        search === "" ||
        req.userName.toLowerCase().includes(search.toLowerCase()) ||
        req.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        req.topic.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "Tất cả trạng thái" || req.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, search, statusFilter]);

  const handleOpenDrawer = (req: ConsultationRequest) => {
    setSelectedRequest(req);
    setEditingNotes(req.notes);
    setEditingStatus(req.status);
    setEditingAdmin(req.assignedAdmin);
    setEditingAppointment(req.appointmentAt || "");
    setDrawerError("");
    setSavedToast(false);
  };

  const handleSaveDrawer = () => {
    if (!selectedRequest) return;
    if (editingStatus === "Đã xếp lịch" && (!editingAppointment || Number.isNaN(new Date(editingAppointment).getTime()))) {
      setDrawerError("Vui lòng chọn ngày và giờ hẹn hợp lệ trước khi chuyển sang trạng thái Đã xếp lịch.");
      return;
    }
    const nextRequests = requests.map((r) =>
        r.id === selectedRequest.id
          ? { ...r, notes: editingNotes, status: editingStatus, assignedAdmin: editingAdmin, appointmentAt: editingAppointment || undefined }
          : r
      );
    setRequests(nextRequests);
    localStorage.setItem("anhuu_demo_consultations", JSON.stringify(nextRequests));
    setSelectedRequest((prev) =>
      prev ? { ...prev, notes: editingNotes, status: editingStatus, assignedAdmin: editingAdmin, appointmentAt: editingAppointment || undefined } : null
    );
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const getStatusTone = (status: ConsultationRequest["status"]) => {
    switch (status) {
      case "Mới":
        return "info";
      case "Đang xử lý":
        return "warning";
      case "Đã xếp lịch":
        return "soft";
      case "Đã hoàn thành":
        return "success";
      case "Đã hủy":
        return "neutral";
    }
  };

  return (
    <div className="admin-page business-page">
      <header className="admin-page-header">
        <div>
          <span>VẬN HÀNH & KINH DOANH</span>
          <h1>Quản lý yêu cầu tư vấn (AD04)</h1>
          <p>Tiếp nhận, xếp lịch và phân công chuyên viên hỗ trợ kế hoạch hưu trí cho khách hàng.</p>
        </div>
      </header>

      {/* KPI Summary Grid */}
      <div className="business-summary-grid">
        <Card className="business-summary-card">
          <div className="summary-card-icon">
            <Icon name="message" />
          </div>
          <div>
            <small>Tổng yêu cầu tiếp nhận</small>
            <strong>{stats.total}</strong>
            <span>Từ khi khởi chạy</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-warning">
            <Icon name="alert" />
          </div>
          <div>
            <small>Cần xử lý & xác nhận</small>
            <strong>{stats.pending}</strong>
            <span>Ưu tiên liên hệ &lt; 24h</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-info">
            <Icon name="target" />
          </div>
          <div>
            <small>Đã xếp lịch gặp</small>
            <strong>{stats.scheduled}</strong>
            <span>Buổi tư vấn trực tuyến</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-success">
            <Icon name="circle-check" />
          </div>
          <div>
            <small>Đã hoàn thành tư vấn</small>
            <strong>{stats.completed}</strong>
            <span>Hài lòng 98.4%</span>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="business-table-card">
        <header className="admin-table-toolbar">
          <div className="admin-filter-group">
            <div className="business-search">
              <SearchField
                label="Tìm kiếm yêu cầu"
                placeholder="Tìm tên, email hoặc nội dung tư vấn..."
                value={search}
                onChange={setSearch}
              />
            </div>
            <Select
              label="Trạng thái"
              options={[
                "Tất cả trạng thái",
                "Mới",
                "Đang xử lý",
                "Đã xếp lịch",
                "Đã hoàn thành",
                "Đã hủy",
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          <div className="admin-export-group">
            <Button variant="secondary" icon="download" onClick={() => downloadCsv("an-huu-yeu-cau-tu-van.csv", [
              ["Mã", "Khách hàng", "Email", "Chủ đề", "Trạng thái", "Ngày hẹn"],
              ...filtered.map((item) => [item.id, item.userName, item.userEmail, item.topic, item.status, item.date]),
            ])}>
              Xuất danh sách (CSV)
            </Button>
          </div>
        </header>

        {/* Desktop Table */}
        <div className="business-table-scroll">
          <table className="business-table consultation-table">
            <thead>
              <tr>
                <th>Mã / Khách hàng</th>
                <th>Chủ đề tư vấn</th>
                <th>Khung giờ ưu tiên</th>
                <th>Trạng thái</th>
                <th>Chuyên viên phụ trách</th>
                <th>Ghi chú nội bộ</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="business-person">
                      <Avatar initials={item.userInitials} name={item.userName} />
                      <span>
                        <strong>{item.userName}</strong>
                        <small>{item.id} · {item.userPhone}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <strong>{item.topic}</strong>
                    <small style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {item.details}
                    </small>
                  </td>
                  <td>
                    <span>{item.preferredTime}</span>
                    <small>Gửi lúc: {item.date}</small>
                  </td>
                  <td>
                    <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td>
                    {item.assignedAdmin === "Chưa phân công" ? (
                      <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>
                        Chưa phân công
                      </span>
                    ) : (
                      <div className="business-person">
                        <Avatar initials="AD" name={item.assignedAdmin} />
                        <span>
                          <strong>{item.assignedAdmin}</strong>
                          <small>Cố vấn tài chính</small>
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="notes-cell">
                    <small>{item.notes || "Chưa có ghi chú."}</small>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => handleOpenDrawer(item)}
                    >
                      Xử lý
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards List */}
        <div className="business-mobile-list">
          {filtered.map((item) => (
            <Card key={item.id} className="business-mobile-card">
              <header>
                <div className="business-person">
                  <Avatar initials={item.userInitials} name={item.userName} />
                  <span>
                    <strong>{item.userName}</strong>
                    <small>{item.id}</small>
                  </span>
                </div>
                <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
              </header>
              <h2>{item.topic}</h2>
              <p>{item.details}</p>
              <div>
                <span>
                  Khung giờ:
                  <strong>{item.preferredTime}</strong>
                </span>
                <span>
                  Phụ trách:
                  <strong>{item.assignedAdmin}</strong>
                </span>
              </div>
              <Button variant="secondary" onClick={() => handleOpenDrawer(item)}>
                Xử lý yêu cầu
              </Button>
            </Card>
          ))}
        </div>

        <footer style={{ padding: "var(--space-4) var(--space-5)", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <small style={{ color: "var(--color-text-muted)" }}>
            Hiển thị {filtered.length} trên tổng số {requests.length} yêu cầu tư vấn
          </small>
          <Pagination current={1} total={1} />
        </footer>
      </Card>

      {/* Consultation Detail Drawer */}
      <Drawer
        open={Boolean(selectedRequest)}
        title={selectedRequest ? `Xử lý yêu cầu ${selectedRequest.id}` : "Chi tiết yêu cầu"}
        onClose={() => setSelectedRequest(null)}
      >
        {selectedRequest && (
          <div className="management-drawer-content">
            <div className="drawer-request-summary">
              <div className="business-person">
                <Avatar initials={selectedRequest.userInitials} name={selectedRequest.userName} />
                <span>
                  <strong>{selectedRequest.userName}</strong>
                  <small>{selectedRequest.userEmail} · {selectedRequest.userPhone}</small>
                </span>
              </div>
              <h3>{selectedRequest.topic}</h3>
              <p>{selectedRequest.details}</p>
              <div className="modal-details-grid" style={{ marginTop: "var(--space-4)" }}>
                <div style={{ background: "var(--color-bg)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}>
                  <small style={{ color: "var(--color-text-muted)" }}>Tuổi hiện tại:</small>
                  <strong style={{ display: "block", color: "var(--color-midnight-900)" }}>{selectedRequest.userAge} tuổi</strong>
                </div>
                <div style={{ background: "var(--color-bg)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)" }}>
                  <small style={{ color: "var(--color-text-muted)" }}>Mục tiêu quỹ hưu trí:</small>
                  <strong style={{ display: "block", color: "var(--color-midnight-900)" }}>{selectedRequest.userFund}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              <Select
                label="Trạng thái yêu cầu"
                options={["Mới", "Đang xử lý", "Đã xếp lịch", "Đã hoàn thành", "Đã hủy"]}
                value={editingStatus}
                onChange={(val) => setEditingStatus(val as ConsultationRequest["status"])}
              />

              <Input
                label="Ngày và giờ hẹn"
                type="datetime-local"
                value={editingAppointment}
                onChange={(value) => { setEditingAppointment(value); setDrawerError(""); }}
              />

              <Select
                label="Chuyên viên phụ trách"
                options={[
                  "Chưa phân công",
                  "Lê Lan Anh",
                  "Phạm Minh Tú",
                  "Nguyễn Thu Hương",
                  "Trần Minh Quang",
                ]}
                value={editingAdmin}
                onChange={setEditingAdmin}
              />

              <Textarea
                label="Ghi chú nội bộ & Tiến độ xử lý"
                placeholder="Nhập thông tin trao đổi, thời gian hẹn cụ thể, đường link họp online..."
                rows={4}
                value={editingNotes}
                onChange={setEditingNotes}
              />

              {drawerError && <Alert tone="danger" title="Chưa thể lưu lịch hẹn">{drawerError}</Alert>}

              {savedToast && (
                <div style={{ padding: "var(--space-3)", background: "rgba(145, 181, 161, 0.2)", border: "1px solid var(--color-secondary-500)", borderRadius: "var(--radius-sm)", color: "var(--color-primary-700)", fontSize: "13px", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <Icon name="check" /> Đã cập nhật trạng thái yêu cầu thành công.
                </div>
              )}
            </div>

            <div className="drawer-actions">
              <Button variant="secondary" onClick={() => setSelectedRequest(null)}>
                Đóng
              </Button>
              <Button variant="primary" onClick={handleSaveDrawer}>
                Lưu thay đổi
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ==========================================
// AD05 — CONTENT MANAGEMENT
// ==========================================

export type ContentItem = {
  id: string;
  title: string;
  summary: string;
  content?: string;
  type: "Bài viết kiến thức" | "Video hướng dẫn" | "Câu hỏi thường gặp" | "Thuật ngữ tài chính";
  category: "Kế hoạch hưu trí" | "Bảo hiểm xã hội" | "Đầu tư tích lũy" | "Chi tiêu & Ngân sách";
  author: string;
  readTime: string;
  views: number;
  status: "Đã xuất bản" | "Bản nháp" | "Chờ duyệt";
  updated: string;
  isFeatured?: boolean;
};

const initialContents: ContentItem[] = [
  {
    id: "CNT-401",
    title: "Hiểu đúng về tỷ lệ thay thế thu nhập 70-75% khi về hưu",
    summary: "Hướng dẫn xác định chi tiêu tối thiểu và chi tiêu hưởng thụ khi không còn thu nhập từ công việc hàng ngày.",
    type: "Bài viết kiến thức",
    category: "Kế hoạch hưu trí",
    author: "Ban Cố vấn An Hưu",
    readTime: "7 phút đọc",
    views: 3420,
    status: "Đã xuất bản",
    updated: "16/08/2025",
    isFeatured: true,
  },
  {
    id: "CNT-402",
    title: "Điểm mới của Luật Bảo hiểm xã hội 2024: Cách tính lương hưu nam và nữ",
    summary: "Phân tích lộ trình điều chỉnh tỷ lệ hưởng lương hưu và điều kiện giảm năm đóng tối thiểu xuống 15 năm.",
    type: "Bài viết kiến thức",
    category: "Bảo hiểm xã hội",
    author: "Nguyễn Thu Hương",
    readTime: "10 phút đọc",
    views: 5890,
    status: "Đã xuất bản",
    updated: "14/08/2025",
    isFeatured: true,
  },
  {
    id: "CNT-403",
    title: "Video: Hướng dẫn thiết lập kế hoạch 3 trụ cột chỉ trong 5 phút",
    summary: "Video từng bước nhập thu nhập, ước tính BHXH và mô phỏng danh mục tài sản tự do tài chính.",
    type: "Video hướng dẫn",
    category: "Kế hoạch hưu trí",
    author: "Đội ngũ Sản phẩm",
    readTime: "5 phút xem",
    views: 2150,
    status: "Đã xuất bản",
    updated: "12/08/2025",
  },
  {
    id: "CNT-404",
    title: "FIRE (Financial Independence, Retire Early) có khả thi tại Việt Nam?",
    summary: "Mô hình nghỉ hưu sớm dưới góc độ chi phí y tế và biến động lạm phát thực tế tại các đô thị lớn.",
    type: "Bài viết kiến thức",
    category: "Đầu tư tích lũy",
    author: "Lê Hoàng Nam",
    readTime: "8 phút đọc",
    views: 4310,
    status: "Đã xuất bản",
    updated: "10/08/2025",
  },
  {
    id: "CNT-405",
    title: "Thuật ngữ: Quy tắc 4% (Bengen Rule) trong rút vốn hưu trí",
    summary: "Giải thích phương pháp rút 4% danh mục tài sản năm đầu tiên và điều chỉnh theo lạm phát hàng năm.",
    type: "Thuật ngữ tài chính",
    category: "Đầu tư tích lũy",
    author: "Phạm Minh Tú",
    readTime: "3 phút đọc",
    views: 1840,
    status: "Đã xuất bản",
    updated: "08/08/2025",
  },
  {
    id: "CNT-406",
    title: "FAQ: Tôi tham gia BHXH ngắt quãng thì có được cộng dồn thời gian không?",
    summary: "Quy định về bảo lưu thời gian đóng BHXH và thủ tục gộp sổ bảo hiểm xã hội khi thay đổi công ty.",
    type: "Câu hỏi thường gặp",
    category: "Bảo hiểm xã hội",
    author: "Ban Cố vấn An Hưu",
    readTime: "4 phút đọc",
    views: 1290,
    status: "Chờ duyệt",
    updated: "17/08/2025",
  },
  {
    id: "CNT-407",
    title: "Tái cơ cấu danh mục hưu trí tuổi 50: Giảm rủi ro hay giữ đà tăng trưởng?",
    summary: "Bản thảo nghiên cứu các chiến lược Glide Path thích ứng với thị trường chứng khoán Việt Nam.",
    type: "Bài viết kiến thức",
    category: "Đầu tư tích lũy",
    author: "Lê Lan Anh",
    readTime: "12 phút đọc",
    views: 0,
    status: "Bản nháp",
    updated: "18/08/2025",
  },
];

export function AdminContentPage() {
  const [contents, setContents] = useState<ContentItem[]>(() => { try { return JSON.parse(localStorage.getItem("anhuu_demo_contents") || "null") || initialContents; } catch { return initialContents; } });
  const [activeTab, setActiveTab] = useState("Tất cả");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Tất cả danh mục");
  const [statusFilter, setStatusFilter] = useState("Tất cả trạng thái");
  const [editorModal, setEditorModal] = useState<ContentItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states for editor
  const [formTitle, setFormTitle] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formType, setFormType] = useState<ContentItem["type"]>("Bài viết kiến thức");
  const [formCategory, setFormCategory] = useState<ContentItem["category"]>("Kế hoạch hưu trí");
  const [formReadTime, setFormReadTime] = useState("5 phút đọc");
  const [formStatus, setFormStatus] = useState<ContentItem["status"]>("Bản nháp");
  const [editorError, setEditorError] = useState("");

  // Summary counts
  const stats = useMemo(() => {
    const total = contents.length;
    const published = contents.filter((c) => c.status === "Đã xuất bản").length;
    const drafts = contents.filter((c) => c.status === "Bản nháp").length;
    const pending = contents.filter((c) => c.status === "Chờ duyệt").length;
    return { total, published, drafts, pending };
  }, [contents]);

  // Filtered contents
  const filtered = useMemo(() => {
    return contents.filter((item) => {
      const matchTab = activeTab === "Tất cả" || item.type === activeTab;
      const matchSearch =
        search === "" ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.author.toLowerCase().includes(search.toLowerCase());
      const matchCategory =
        categoryFilter === "Tất cả danh mục" || item.category === categoryFilter;
      const matchStatus =
        statusFilter === "Tất cả trạng thái" || item.status === statusFilter;
      return matchTab && matchSearch && matchCategory && matchStatus;
    });
  }, [contents, activeTab, search, categoryFilter, statusFilter]);

  const handleOpenEditor = (item?: ContentItem) => {
    if (item) {
      setEditorModal(item);
      setIsCreating(false);
      setFormTitle(item.title);
      setFormSummary(item.summary);
      setFormContent(item.content || item.summary);
      setFormType(item.type);
      setFormCategory(item.category);
      setFormReadTime(item.readTime);
      setFormStatus(item.status);
    } else {
      setIsCreating(true);
      setEditorModal({
        id: `CNT-${Math.floor(Math.random() * 900) + 100}`,
        title: "",
        summary: "",
        type: "Bài viết kiến thức",
        category: "Kế hoạch hưu trí",
        author: "Lê Lan Anh",
        readTime: "5 phút đọc",
        views: 0,
        status: "Bản nháp",
        updated: "Hôm nay",
      });
      setFormTitle("");
      setFormSummary("");
      setFormContent("");
      setFormType("Bài viết kiến thức");
      setFormCategory("Kế hoạch hưu trí");
      setFormReadTime("5 phút đọc");
      setFormStatus("Bản nháp");
      setEditorError("");
    }
  };

  const handleSaveEditor = () => {
    if (!editorModal) return;
    if (!formTitle.trim()) { setEditorError("Vui lòng nhập tiêu đề trước khi lưu."); return; }
    if (formStatus === "Đã xuất bản" && (!formSummary.trim() || !formContent.trim())) { setEditorError("Nội dung xuất bản cần có tóm tắt và nội dung đầy đủ."); return; }
    let nextContents: ContentItem[];
    if (isCreating) {
      const newItem: ContentItem = {
        ...editorModal,
        title: formTitle.trim(),
        summary: formSummary,
        content: formContent,
        type: formType,
        category: formCategory,
        readTime: formReadTime,
        status: formStatus,
      };
      nextContents = [newItem, ...contents];
    } else {
      nextContents = contents.map((c) =>
          c.id === editorModal.id
            ? {
                ...c,
                title: formTitle,
                summary: formSummary,
                content: formContent,
                type: formType,
                category: formCategory,
                readTime: formReadTime,
                status: formStatus,
                updated: "Vừa cập nhật",
              }
            : c
        );
    }
    setContents(nextContents);
    localStorage.setItem("anhuu_demo_contents", JSON.stringify(nextContents));
    setEditorModal(null);
  };

  const getStatusTone = (status: ContentItem["status"]) => {
    switch (status) {
      case "Đã xuất bản":
        return "success";
      case "Bản nháp":
        return "neutral";
      case "Chờ duyệt":
        return "warning";
    }
  };

  return (
    <div className="admin-page business-page">
      <header className="admin-page-header">
        <div>
          <span>QUẢN LÝ THÔNG TIN</span>
          <h1>Quản lý nội dung & Cẩm nang (AD05)</h1>
          <p>Xuất bản bài viết chuyên đề, video hướng dẫn và từ điển thuật ngữ hưu trí.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => handleOpenEditor()}>
          Tạo nội dung mới
        </Button>
      </header>

      {/* Summary KPI Grid */}
      <div className="business-summary-grid">
        <Card className="business-summary-card">
          <div className="summary-card-icon">
            <Icon name="file-text" />
          </div>
          <div>
            <small>Tổng nội dung hệ thống</small>
            <strong>{stats.total}</strong>
            <span>Bài viết & Video</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-success">
            <Icon name="circle-check" />
          </div>
          <div>
            <small>Đang xuất bản trực tuyến</small>
            <strong>{stats.published}</strong>
            <span>Độc giả truy cập tự do</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-info">
            <Icon name="briefcase" />
          </div>
          <div>
            <small>Bản nháp đang soạn thảo</small>
            <strong>{stats.drafts}</strong>
            <span>Đang hoàn thiện</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-warning">
            <Icon name="alert" />
          </div>
          <div>
            <small>Chờ duyệt nghiệp vụ</small>
            <strong>{stats.pending}</strong>
            <span>Cần kiểm duyệt trước khi live</span>
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="business-table-card">
        {/* Category & Type Tabs */}
        <div className="content-type-tabs">
          <Tabs
            active={activeTab}
            items={[
              "Tất cả",
              "Bài viết kiến thức",
              "Video hướng dẫn",
              "Câu hỏi thường gặp",
              "Thuật ngữ tài chính",
            ]}
            onChange={setActiveTab}
          />
        </div>

        <header className="admin-table-toolbar">
          <div className="admin-filter-group">
            <div className="business-search">
              <SearchField
                label="Tìm kiếm nội dung"
                placeholder="Tìm tiêu đề, tác giả..."
                value={search}
                onChange={setSearch}
              />
            </div>
            <Select
              label="Chuyên mục"
              options={[
                "Tất cả danh mục",
                "Kế hoạch hưu trí",
                "Bảo hiểm xã hội",
                "Đầu tư tích lũy",
                "Chi tiêu & Ngân sách",
              ]}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
            <Select
              label="Trạng thái"
              options={["Tất cả trạng thái", "Đã xuất bản", "Bản nháp", "Chờ duyệt"]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
        </header>

        {/* Desktop Table */}
        <div className="business-table-scroll">
          <table className="business-table content-table">
            <thead>
              <tr>
                <th>Tiêu đề & Tóm tắt</th>
                <th>Phân loại</th>
                <th>Chuyên mục</th>
                <th>Tác giả</th>
                <th>Lượt đọc / Xem</th>
                <th>Trạng thái</th>
                <th>Cập nhật</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ display: "grid", gap: "var(--space-1)" }}>
                      <strong style={{ color: "var(--color-primary-700)", fontSize: "14px" }}>
                        {item.title}
                      </strong>
                      <small style={{ color: "var(--color-text-muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.summary}
                      </small>
                    </div>
                  </td>
                  <td>
                    <span className="type-label">
                      <Icon
                        name={
                          item.type === "Video hướng dẫn"
                            ? "maximize"
                            : item.type === "Câu hỏi thường gặp"
                            ? "info"
                            : item.type === "Thuật ngữ tài chính"
                            ? "sparkles"
                            : "file-text"
                        }
                      />
                      {item.type}
                    </span>
                  </td>
                  <td>
                    <Badge tone="soft">{item.category}</Badge>
                  </td>
                  <td>
                    <span>{item.author}</span>
                  </td>
                  <td>
                    <strong>{item.views.toLocaleString("vi-VN")}</strong>
                    <small>{item.readTime}</small>
                  </td>
                  <td>
                    <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td>
                    <small>{item.updated}</small>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => handleOpenEditor(item)}
                    >
                      Sửa
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="business-mobile-list">
          {filtered.map((item) => (
            <Card key={item.id} className="business-mobile-card">
              <header>
                <Badge tone="soft">{item.category}</Badge>
                <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
              </header>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>
              <div>
                <span>
                  Định dạng:
                  <strong>{item.type}</strong>
                </span>
                <span>
                  Lượt xem:
                  <strong>{item.views.toLocaleString("vi-VN")}</strong>
                </span>
              </div>
              <Button variant="secondary" onClick={() => handleOpenEditor(item)}>
                Chỉnh sửa bài
              </Button>
            </Card>
          ))}
        </div>

        <footer style={{ padding: "var(--space-4) var(--space-5)", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <small style={{ color: "var(--color-text-muted)" }}>
            Hiển thị {filtered.length} trên tổng số {contents.length} tài liệu
          </small>
          <Pagination current={1} total={1} />
        </footer>
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        open={Boolean(editorModal)}
        title={isCreating ? "Thêm nội dung mới" : "Chỉnh sửa nội dung"}
        onClose={() => setEditorModal(null)}
      >
        {editorModal && (
          <div className="content-editor-form">
            <Input
              label="Tiêu đề nội dung"
              placeholder="Nhập tiêu đề hấp dẫn, rõ nghĩa..."
              value={formTitle}
              onChange={setFormTitle}
            />

            <div>
              <Select
                label="Định dạng nội dung"
                options={[
                  "Bài viết kiến thức",
                  "Video hướng dẫn",
                  "Câu hỏi thường gặp",
                  "Thuật ngữ tài chính",
                ]}
                value={formType}
                onChange={(val) => setFormType(val as ContentItem["type"])}
              />
              <Select
                label="Chuyên mục"
                options={[
                  "Kế hoạch hưu trí",
                  "Bảo hiểm xã hội",
                  "Đầu tư tích lũy",
                  "Chi tiêu & Ngân sách",
                ]}
                value={formCategory}
                onChange={(val) => setFormCategory(val as ContentItem["category"])}
              />
            </div>

            <div>
              <Input
                label="Thời gian ước tính (đọc / xem)"
                placeholder="VD: 5 phút đọc, 8 phút xem"
                value={formReadTime}
                onChange={setFormReadTime}
              />
              <Select
                label="Trạng thái hiển thị"
                options={["Đã xuất bản", "Bản nháp", "Chờ duyệt"]}
                value={formStatus}
                onChange={(val) => setFormStatus(val as ContentItem["status"])}
              />
            </div>

            <Textarea
              label="Tóm tắt ngắn (Lead / Meta description)"
              placeholder="1-2 câu tóm tắt giá trị chính mà người đọc sẽ nhận được..."
              rows={3}
              value={formSummary}
              onChange={setFormSummary}
            />

            <Textarea
              label={formType === "Video hướng dẫn" ? "Kịch bản hoặc đường dẫn video" : "Nội dung đầy đủ"}
              placeholder="Nhập nội dung chính sẽ hiển thị cho người đọc..."
              rows={7}
              value={formContent}
              onChange={(value) => { setFormContent(value); setEditorError(""); }}
            />

            {editorError && <p role="alert" style={{ color: "var(--color-danger)", margin: 0 }}>{editorError}</p>}

            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
              <Button variant="secondary" onClick={() => setEditorModal(null)}>
                Hủy
              </Button>
              <Button variant="primary" onClick={handleSaveEditor}>
                {isCreating ? "Tạo và lưu" : "Cập nhật thay đổi"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ==========================================
// AD06 — PARTNERS & FINANCIAL PRODUCTS
// ==========================================

export type PartnerOrg = {
  id: string;
  name: string;
  type: "Ngân hàng thương mại" | "Công ty Quản lý Quỹ" | "Công ty Bảo hiểm Nhân thọ";
  productsCount: number;
  contactPerson: string;
  contactEmail: string;
  status: "Đang hợp tác" | "Đang rà soát hợp đồng";
  rating: string;
};

export type FinancialProduct = {
  id: string;
  name: string;
  partnerName: string;
  partnerType: string;
  category: "Quỹ mở cổ phiếu/trái phiếu" | "Bảo hiểm hưu trí tự nguyện" | "Tiết kiệm mục tiêu";
  riskTier: "Rủi ro thấp" | "Rủi ro trung bình" | "Rủi ro cao";
  annualFee: string;
  conditions: string;
  disclosure: string;
  isVisible: boolean;
  status: "Đang phân phối" | "Tạm dừng";
};

const initialPartners: PartnerOrg[] = [
  {
    id: "PT-01",
    name: "Vietcombank (VCBF)",
    type: "Công ty Quản lý Quỹ",
    productsCount: 4,
    contactPerson: "Trần Anh Tuấn",
    contactEmail: "tuan.ta@vcbf.com",
    status: "Đang hợp tác",
    rating: "AAA",
  },
  {
    id: "PT-02",
    name: "Dragon Capital (DCVFM)",
    type: "Công ty Quản lý Quỹ",
    productsCount: 5,
    contactPerson: "Lê Minh Trang",
    contactEmail: "trang.lm@dragoncapital.com",
    status: "Đang hợp tác",
    rating: "AAA",
  },
  {
    id: "PT-03",
    name: "SSI Asset Management (SSIAM)",
    type: "Công ty Quản lý Quỹ",
    productsCount: 3,
    contactPerson: "Vũ Hải Đăng",
    contactEmail: "dangvh@ssi.com.vn",
    status: "Đang hợp tác",
    rating: "AA+",
  },
  {
    id: "PT-04",
    name: "Bảo Việt Nhân Thọ",
    type: "Công ty Bảo hiểm Nhân thọ",
    productsCount: 2,
    contactPerson: "Nguyễn Thị Mai",
    contactEmail: "maintt@baoviet.com.vn",
    status: "Đang rà soát hợp đồng",
    rating: "AA",
  },
];

const initialProducts: FinancialProduct[] = [
  {
    id: "PRD-501",
    name: "Quỹ Đầu tư Cân bằng Chiến lược (VCBF-TBF)",
    partnerName: "Vietcombank (VCBF)",
    partnerType: "Công ty Quản lý Quỹ",
    category: "Quỹ mở cổ phiếu/trái phiếu",
    riskTier: "Rủi ro trung bình",
    annualFee: "1.5%/năm",
    conditions: "Tối thiểu 500.000 đ/tháng; Khuyến nghị nắm giữ từ 3-5 năm",
    disclosure: "Hoa hồng môi giới 0.25%; Minh bạch biểu phí NAV hàng ngày",
    isVisible: true,
    status: "Đang phân phối",
  },
  {
    id: "PRD-502",
    name: "Quỹ Đầu tư Trái phiếu Doanh nghiệp (DCVFM-BF)",
    partnerName: "Dragon Capital (DCVFM)",
    partnerType: "Công ty Quản lý Quỹ",
    category: "Quỹ mở cổ phiếu/trái phiếu",
    riskTier: "Rủi ro thấp",
    annualFee: "0.95%/năm",
    conditions: "Tối thiểu 100.000 đ/lần nạp; Dành cho giai đoạn tích lũy phòng thủ",
    disclosure: "Không thu phí hoa hồng người dùng; Phí quản lý khấu trừ trực tiếp vào NAV",
    isVisible: true,
    status: "Đang phân phối",
  },
  {
    id: "PRD-503",
    name: "Quỹ Cổ phiếu Tăng trưởng Bền vững (SSIAM-SCA)",
    partnerName: "SSI Asset Management (SSIAM)",
    partnerType: "Công ty Quản lý Quỹ",
    category: "Quỹ mở cổ phiếu/trái phiếu",
    riskTier: "Rủi ro cao",
    annualFee: "1.75%/năm",
    conditions: "Tối thiểu 1.000.000 đ; Phù hợp nhóm tuổi dưới 40 tích lũy tăng tốc",
    disclosure: "Hoa hồng liên kết 0.3%; Khuyến nghị đọc kỹ Bản cáo bạch",
    isVisible: true,
    status: "Đang phân phối",
  },
  {
    id: "PRD-504",
    name: "Gói Hưu trí An Sinh Toàn Diện",
    partnerName: "Bảo Việt Nhân Thọ",
    partnerType: "Công ty Bảo hiểm Nhân thọ",
    category: "Bảo hiểm hưu trí tự nguyện",
    riskTier: "Rủi ro thấp",
    annualFee: "Phí theo hợp đồng bảo hiểm",
    conditions: "Đóng phí tối thiểu 10 năm; Chi trả niên kim từ tuổi 60 đến 80",
    disclosure: "Chiết khấu đại lý theo quy định Bộ Tài chính; Khấu trừ phí rủi ro theo tuổi",
    isVisible: false,
    status: "Tạm dừng",
  },
  {
    id: "PRD-505",
    name: "Tiết kiệm Tích lũy Hưu trí Chủ động",
    partnerName: "Vietcombank",
    partnerType: "Ngân hàng thương mại",
    category: "Tiết kiệm mục tiêu",
    riskTier: "Rủi ro thấp",
    annualFee: "0 đồng",
    conditions: "Kỳ hạn 12 - 36 tháng; Lãi suất cố định cộng thưởng kỳ hạn dài",
    disclosure: "Bảo hiểm tiền gửi theo quy định Ngân hàng Nhà nước",
    isVisible: true,
    status: "Đang phân phối",
  },
];

export function AdminPartnersPage() {
  const [activeTab, setActiveTab] = useState("Sản phẩm tài chính");
  const [products, setProducts] = useState<FinancialProduct[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("anhuu_demo_financial_products") || "null");
      return Array.isArray(stored) ? stored : initialProducts;
    } catch {
      return initialProducts;
    }
  });
  const [partners, setPartners] = useState<PartnerOrg[]>(initialPartners);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("Tất cả mức rủi ro");
  const [selectedProduct, setSelectedProduct] = useState<FinancialProduct | null>(null);

  // Stats
  const stats = useMemo(() => {
    const totalPartners = partners.length;
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.isVisible && p.status === "Đang phân phối").length;
    const pausedProducts = products.filter((p) => p.status === "Tạm dừng").length;
    return { totalPartners, totalProducts, activeProducts, pausedProducts };
  }, [partners, products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      const matchSearch =
        search === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.partnerName.toLowerCase().includes(search.toLowerCase());
      const matchRisk = riskFilter === "Tất cả mức rủi ro" || item.riskTier === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [products, search, riskFilter]);

  // Filter partners
  const filteredPartners = useMemo(() => {
    return partners.filter((item) => {
      return (
        search === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.contactPerson.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [partners, search]);

  const handleToggleProductVisibility = (id: string) => {
    setProducts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, isVisible: !p.isVisible } : p));
      localStorage.setItem("anhuu_demo_financial_products", JSON.stringify(next));
      return next;
    });
  };

  const getRiskTone = (tier: FinancialProduct["riskTier"]) => {
    switch (tier) {
      case "Rủi ro thấp":
        return "success";
      case "Rủi ro trung bình":
        return "warning";
      case "Rủi ro cao":
        return "danger";
    }
  };

  return (
    <div className="admin-page business-page">
      <header className="admin-page-header">
        <div>
          <span>ĐỐI TÁC VÀ GIẢI PHÁP</span>
          <h1>Đối tác & Sản phẩm tài chính (AD06)</h1>
          <p>Quản lý tổ chức liên kết, phân phối sản phẩm quỹ mở, bảo hiểm và minh bạch hoa hồng.</p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="business-summary-grid">
        <Card className="business-summary-card">
          <div className="summary-card-icon">
            <Icon name="briefcase" />
          </div>
          <div>
            <small>Tổ chức đối tác</small>
            <strong>{stats.totalPartners}</strong>
            <span>Đã ký hợp đồng liên kết</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-info">
            <Icon name="target" />
          </div>
          <div>
            <small>Sản phẩm tài chính</small>
            <strong>{stats.totalProducts}</strong>
            <span>Quỹ mở, Tiết kiệm, BH</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-success">
            <Icon name="circle-check" />
          </div>
          <div>
            <small>Đang hiển thị cho người dùng</small>
            <strong>{stats.activeProducts}</strong>
            <span>Đầy đủ minh bạch hoa hồng</span>
          </div>
        </Card>
        <Card className="business-summary-card">
          <div className="summary-card-icon tone-warning">
            <Icon name="alert" />
          </div>
          <div>
            <small>Tạm dừng phân phối</small>
            <strong>{stats.pausedProducts}</strong>
            <span>Cần cập nhật biểu phí</span>
          </div>
        </Card>
      </div>

      {/* Main Container */}
      <Card className="business-table-card">
        <div className="content-type-tabs">
          <Tabs
            active={activeTab}
            items={["Sản phẩm tài chính", "Tổ chức đối tác"]}
            onChange={setActiveTab}
          />
        </div>

        <header className="admin-table-toolbar">
          <div className="admin-filter-group">
            <div className="business-search">
              <SearchField
                label="Tìm kiếm"
                placeholder={
                  activeTab === "Sản phẩm tài chính"
                    ? "Tìm tên sản phẩm hoặc quỹ phát hành..."
                    : "Tìm tên tổ chức, đại diện liên hệ..."
                }
                value={search}
                onChange={setSearch}
              />
            </div>
            {activeTab === "Sản phẩm tài chính" && (
              <Select
                label="Mức độ rủi ro"
                options={["Tất cả mức rủi ro", "Rủi ro thấp", "Rủi ro trung bình", "Rủi ro cao"]}
                value={riskFilter}
                onChange={setRiskFilter}
              />
            )}
          </div>
        </header>

        {/* FINANCIAL PRODUCTS VIEW */}
        {activeTab === "Sản phẩm tài chính" && (
          <>
            <div className="business-table-scroll">
              <table className="business-table product-table">
                <thead>
                  <tr>
                    <th>Sản phẩm / Tổ chức</th>
                    <th>Loại hình</th>
                    <th>Mức độ rủi ro</th>
                    <th>Phí quản lý / năm</th>
                    <th>Điều kiện tham gia</th>
                    <th>Minh bạch hoa hồng & Rủi ro</th>
                    <th>Hiển thị</th>
                    <th style={{ textAlign: "right" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="partner-name">
                          <span>
                            <Icon name="wallet" />
                          </span>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.partnerName}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="soft">{item.category}</Badge>
                      </td>
                      <td>
                        <Badge tone={getRiskTone(item.riskTier)}>{item.riskTier}</Badge>
                      </td>
                      <td>
                        <strong style={{ color: "var(--color-midnight-900)" }}>{item.annualFee}</strong>
                      </td>
                      <td className="conditions-cell">
                        <small>{item.conditions}</small>
                      </td>
                      <td className="disclosure-cell">
                        <small style={{ color: "var(--color-text-muted)" }}>{item.disclosure}</small>
                      </td>
                      <td>
                        <Switch
                          checked={item.isVisible}
                          label={item.isVisible ? "Hiển thị" : "Ẩn"}
                          onChange={() => handleToggleProductVisibility(item.id)}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => setSelectedProduct(item)}
                        >
                          Chi tiết
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="business-mobile-list">
              {filteredProducts.map((item) => (
                <Card key={item.id} className="business-mobile-card">
                  <header>
                    <Badge tone="soft">{item.category}</Badge>
                    <Badge tone={getRiskTone(item.riskTier)}>{item.riskTier}</Badge>
                  </header>
                  <h2>{item.name}</h2>
                  <p>{item.partnerName}</p>
                  <div>
                    <span>
                      Phí quản lý:
                      <strong>{item.annualFee}</strong>
                    </span>
                    <span>
                      Trạng thái:
                      <strong>{item.status}</strong>
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => setSelectedProduct(item)}>
                    Xem chi tiết minh bạch
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* PARTNER ORGS VIEW */}
        {activeTab === "Tổ chức đối tác" && (
          <>
            <div className="business-table-scroll">
              <table className="business-table partner-table">
                <thead>
                  <tr>
                    <th>Tổ chức đối tác</th>
                    <th>Loại hình định chế</th>
                    <th>Số sản phẩm niêm yết</th>
                    <th>Đại diện liên hệ</th>
                    <th>Hạng tín nhiệm</th>
                    <th>Trạng thái hợp tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="partner-name">
                          <span>
                            <Icon name="briefcase" />
                          </span>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone="soft">{item.type}</Badge>
                      </td>
                      <td>
                        <strong>{item.productsCount} sản phẩm</strong>
                      </td>
                      <td>
                        <div>
                          <strong>{item.contactPerson}</strong>
                          <small style={{ display: "block", color: "var(--color-text-muted)" }}>
                            {item.contactEmail}
                          </small>
                        </div>
                      </td>
                      <td>
                        <Badge tone="info">{item.rating}</Badge>
                      </td>
                      <td>
                        <Badge tone={item.status === "Đang hợp tác" ? "success" : "warning"}>
                          {item.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards for Partners */}
            <div className="business-mobile-list">
              {filteredPartners.map((item) => (
                <Card key={item.id} className="business-mobile-card">
                  <header>
                    <Badge tone="info">Hạng {item.rating}</Badge>
                    <Badge tone={item.status === "Đang hợp tác" ? "success" : "warning"}>
                      {item.status}
                    </Badge>
                  </header>
                  <h2>{item.name}</h2>
                  <p>{item.type}</p>
                  <div>
                    <span>
                      Sản phẩm:
                      <strong>{item.productsCount} gói</strong>
                    </span>
                    <span>
                      Liên hệ:
                      <strong>{item.contactPerson}</strong>
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        <footer style={{ padding: "var(--space-4) var(--space-5)", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <small style={{ color: "var(--color-text-muted)" }}>
            {activeTab === "Sản phẩm tài chính"
              ? `Hiển thị ${filteredProducts.length} trên tổng số ${products.length} sản phẩm`
              : `Hiển thị ${filteredPartners.length} trên tổng số ${partners.length} đối tác`}
          </small>
          <Pagination current={1} total={1} />
        </footer>
      </Card>

      {/* Product Detail Modal */}
      <Modal
        open={Boolean(selectedProduct)}
        title={selectedProduct ? selectedProduct.name : "Chi tiết sản phẩm"}
        onClose={() => setSelectedProduct(null)}
      >
        {selectedProduct && (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <div style={{ background: "rgba(23, 59, 87, 0.04)", padding: "var(--space-4)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
              <small style={{ color: "var(--color-text-muted)" }}>Tổ chức phát hành / Quản lý:</small>
              <h3 style={{ margin: "var(--space-1) 0", color: "var(--color-midnight-900)" }}>{selectedProduct.partnerName}</h3>
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "13px" }}>{selectedProduct.partnerType}</p>
            </div>

            <div className="modal-details-grid">
              <div>
                <small style={{ color: "var(--color-text-muted)" }}>Mức độ rủi ro:</small>
                <div style={{ marginTop: "var(--space-1)" }}>
                  <Badge tone={getRiskTone(selectedProduct.riskTier)}>{selectedProduct.riskTier}</Badge>
                </div>
              </div>
              <div>
                <small style={{ color: "var(--color-text-muted)" }}>Phí quản lý niêm yết:</small>
                <strong style={{ display: "block", marginTop: "var(--space-1)", color: "var(--color-midnight-900)", fontSize: "15px" }}>{selectedProduct.annualFee}</strong>
              </div>
            </div>

            <div>
              <small style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Điều kiện tham gia:</small>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--color-text-strong)", fontSize: "13px", lineHeight: 1.5 }}>
                {selectedProduct.conditions}
              </p>
            </div>

            <div style={{ padding: "var(--space-3)", background: "rgba(229, 169, 60, 0.12)", border: "1px solid rgba(229, 169, 60, 0.3)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-text-strong)", fontWeight: 600, fontSize: "13px" }}>
                <Icon name="alert" /> Minh bạch hoa hồng & Cảnh báo rủi ro
              </div>
              <p style={{ margin: "var(--space-2) 0 0", color: "var(--color-text-muted)", fontSize: "12px", lineHeight: 1.5 }}>
                {selectedProduct.disclosure}
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
              <Button variant="secondary" onClick={() => setSelectedProduct(null)}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
