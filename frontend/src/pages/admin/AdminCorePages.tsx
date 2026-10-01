import { useState, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Icon,
  IconButton,
  Input,
  Pagination,
  ProgressBar,
  SearchField,
  Select,
  Tabs,
  type IconName,
} from "../../components/ui";

// Mock User database for Admin
export type AdminUserData = {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  status: "Đang hoạt động" | "Chờ xác minh" | "Tạm khóa";
  profileCompletion: number;
  planStatus: "On track" | "Needs attention" | "Behind plan" | "Chưa lập";
  targetAge: number;
  targetFund: string;
  created: string;
  lastActive: string;
  currentAge: number;
  salary: string;
  assets: string;
  notes: string;
};

export const mockUsers: AdminUserData[] = [
  {
    id: "USR-1082",
    name: "Nguyễn Minh An",
    initials: "NA",
    email: "minhan@example.com",
    phone: "0912 345 678",
    status: "Đang hoạt động",
    profileCompletion: 92,
    planStatus: "On track",
    targetAge: 60,
    targetFund: "8.5 tỷ đ",
    created: "12/03/2025",
    lastActive: "15 phút trước",
    currentAge: 32,
    salary: "35.000.000 đ",
    assets: "3.720.000.000 đ",
    notes: "Khách hàng tích cực, quan tâm đến việc nghỉ hưu sớm và tối ưu danh mục quỹ mở.",
  },
  {
    id: "USR-1081",
    name: "Trần Thu Hà",
    initials: "TH",
    email: "thuha@example.com",
    phone: "0908 123 456",
    status: "Đang hoạt động",
    profileCompletion: 85,
    planStatus: "Needs attention",
    targetAge: 55,
    targetFund: "10.2 tỷ đ",
    created: "20/04/2025",
    lastActive: "2 giờ trước",
    currentAge: 40,
    salary: "48.000.000 đ",
    assets: "4.500.000.000 đ",
    notes: "Cần hỗ trợ giải thích công thức lương hưu BHXH và kịch bản giảm chi tiêu.",
  },
  {
    id: "USR-1079",
    name: "Lê Hoàng Nam",
    initials: "LN",
    email: "hoangnam@example.com",
    phone: "0933 555 777",
    status: "Đang hoạt động",
    profileCompletion: 100,
    planStatus: "On track",
    targetAge: 62,
    targetFund: "6.8 tỷ đ",
    created: "05/01/2025",
    lastActive: "Hôm qua",
    currentAge: 45,
    salary: "30.000.000 đ",
    assets: "3.100.000.000 đ",
    notes: "Đã hoàn thành 100% hồ sơ, đã tải bản PDF báo cáo kế hoạch.",
  },
  {
    id: "USR-1075",
    name: "Phạm Ngọc Mai",
    initials: "PM",
    email: "ngocmai@example.com",
    phone: "0988 999 888",
    status: "Chờ xác minh",
    profileCompletion: 45,
    planStatus: "Chưa lập",
    targetAge: 60,
    targetFund: "Chưa có",
    created: "16/08/2025",
    lastActive: "3 ngày trước",
    currentAge: 28,
    salary: "22.000.000 đ",
    assets: "650.000.000 đ",
    notes: "Chưa hoàn tất bước khai báo tài sản và nợ.",
  },
  {
    id: "USR-1068",
    name: "Vũ Đức Long",
    initials: "VL",
    email: "duclong@example.com",
    phone: "0977 444 333",
    status: "Tạm khóa",
    profileCompletion: 70,
    planStatus: "Behind plan",
    targetAge: 58,
    targetFund: "7.5 tỷ đ",
    created: "10/02/2025",
    lastActive: "1 tuần trước",
    currentAge: 38,
    salary: "26.000.000 đ",
    assets: "1.800.000.000 đ",
    notes: "Tài khoản tạm khóa do nhập sai mật khẩu 5 lần liên tiếp. Đã yêu cầu mở khóa.",
  },
];

// AD01 — Admin Dashboard
export function AdminDashboardPage() {
  const navigate = useNavigate();

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <span>TỔNG QUAN VẬN HÀNH (AD01)</span>
          <h1>Bảng điều khiển Quản trị An Hưu</h1>
          <p>Giám sát chỉ số người dùng, tỷ lệ hoàn tất hồ sơ, tải lượng AI và công việc cần xử lý.</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/admin/users")}>
          <Icon name="users" /> Quản lý danh sách người dùng
        </Button>
      </div>

      {/* 4 Primary KPIs */}
      <div className="admin-kpi-grid">
        <Card className="admin-kpi-card">
          <div>
            <span>Tổng người dùng đăng ký</span>
            <span className="admin-kpi-icon"><Icon name="users" /></span>
          </div>
          <strong>12.480</strong>
          <small>
            <Icon name="arrow-right" size="small" /> +14.2% so với tháng trước
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>Hồ sơ tài chính hoàn tất</span>
            <span className="admin-kpi-icon"><Icon name="file-text" /></span>
          </div>
          <strong>8.920</strong>
          <small>
            <Icon name="circle-check" size="small" /> Tỷ lệ hoàn thành: 71.5%
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>Kế hoạch hưu trí đang hoạt động</span>
            <span className="admin-kpi-icon"><Icon name="target" /></span>
          </div>
          <strong>7.640</strong>
          <small>
            <Icon name="circle-check" size="small" /> 84% người dùng On-track
          </small>
        </Card>

        <Card className="admin-kpi-card needs-attention">
          <div>
            <span>Yêu cầu tư vấn & hỗ trợ mới</span>
            <span className="admin-kpi-icon"><Icon name="alert" /></span>
          </div>
          <strong style={{ color: "var(--color-danger)" }}>18</strong>
          <small>
            <Icon name="alert" size="small" /> 5 yêu cầu cần phản hồi ngay
          </small>
        </Card>
      </div>

      {/* Secondary Chart & System Usage Grid */}
      <div className="admin-chart-grid">
        {/* User Growth Line Chart */}
        <Card className="admin-chart-card">
          <header>
            <div>
              <h2>Tăng trưởng người dùng & Kế hoạch mới (2025)</h2>
              <p>Số lượng tài khoản đăng ký mới và hồ sơ tài chính hoàn tất qua từng tháng.</p>
            </div>
            <Button variant="secondary" size="small">9 tháng qua</Button>
          </header>

          <div className="admin-line-chart">
            <svg viewBox="0 0 600 230" preserveAspectRatio="none">
              <line x1="0" y1="40" x2="600" y2="40" className="admin-chart-guides" />
              <line x1="0" y1="90" x2="600" y2="90" className="admin-chart-guides" />
              <line x1="0" y1="140" x2="600" y2="140" className="admin-chart-guides" />
              <line x1="0" y1="190" x2="600" y2="190" className="admin-chart-guides" />

              {/* Area */}
              <path
                d="M 20 200 C 120 180, 240 150, 360 110 S 500 70, 580 35 L 580 210 L 20 210 Z"
                className="admin-chart-area"
              />

              {/* User Curve */}
              <path
                d="M 20 200 C 120 180, 240 150, 360 110 S 500 70, 580 35"
                className="admin-chart-primary"
              />

              {/* Plan Curve */}
              <path
                d="M 20 210 C 120 195, 240 170, 360 135 S 500 95, 580 65"
                className="admin-chart-secondary"
              />
            </svg>

            <div>
              <span>Tháng 1</span>
              <span>Tháng 3</span>
              <span>Tháng 5</span>
              <span>Tháng 7</span>
              <span>Tháng 9 (Hiện tại)</span>
            </div>
          </div>

          <footer>
            <span><i className="legend-admin-primary" /> Người dùng mới (+1,240/tháng)</span>
            <span><i className="legend-admin-secondary" /> Kế hoạch hưu trí được tạo (+890/tháng)</span>
            <p>Tỷ lệ chuyển đổi Onboarding: 71.8%</p>
          </footer>
        </Card>

        {/* AI & Feature Utilization Card */}
        <Card className="admin-list-card">
          <header>
            <div>
              <h2>Mức độ sử dụng tính năng</h2>
              <p>Tải lượng hệ thống & AI Engine</p>
            </div>
            <Badge tone="soft">THỜI GIAN THỰC</Badge>
          </header>

          <div className="usage-bars">
            <div>
              <span>Mô phỏng</span>
              <div><i className="bar-full" /></div>
              <strong>92%</strong>
            </div>

            <div>
              <span>Trợ lý AI</span>
              <div><i className="bar-medium" /></div>
              <strong>62%</strong>
            </div>

            <div>
              <span>Xuất PDF</span>
              <div><i className="bar-short" /></div>
              <strong>46%</strong>
            </div>

            <div>
              <span>Đặt tư vấn</span>
              <div><i className="bar-minimum" /></div>
              <strong>18%</strong>
            </div>
          </div>

          <div className="usage-summary">
            <span>
              <Icon name="sparkles" />
              Tổng số lượt hỏi AI hôm nay: <strong>3.420 câu hỏi</strong> (Thời gian phản hồi TB: 0.8s).
            </span>
          </div>
        </Card>
      </div>

      {/* Operations Grid: Urgent Tasks, Recent Users, Recent Activity */}
      <div className="admin-operations-grid">
        {/* Task List */}
        <Card className="admin-list-card">
          <header>
            <div>
              <h2>Công việc cần xử lý</h2>
              <p>Nhiệm vụ vận hành ưu tiên</p>
            </div>
            <Badge tone="warning">4 việc</Badge>
          </header>

          <div className="admin-task-list">
            <button type="button" onClick={() => navigate("/admin/support")}>
              <span className="task-icon tone-warning"><Icon name="alert" /></span>
              <span>
                <strong>5 ticket cần hỗ trợ khẩn</strong>
                <small>Thời gian chờ &gt; 30 phút</small>
              </span>
              <Icon name="chevron-right" size="small" />
            </button>

            <button type="button" onClick={() => navigate("/admin/consultations")}>
              <span className="task-icon tone-info"><Icon name="message" /></span>
              <span>
                <strong>3 lịch tư vấn 1-1 hôm nay</strong>
                <small>Khách hàng gói Premium</small>
              </span>
              <Icon name="chevron-right" size="small" />
            </button>

            <button type="button" onClick={() => navigate("/admin/financial-config")}>
              <span className="task-icon tone-warning"><Icon name="chart" /></span>
              <span>
                <strong>Duyệt cập nhật lãi suất Q3</strong>
                <small>Bản nháp cấu hình v2.6</small>
              </span>
              <Icon name="chevron-right" size="small" />
            </button>
          </div>
        </Card>

        {/* Recent Users List */}
        <Card className="admin-list-card">
          <header>
            <div>
              <h2>Người dùng mới tham gia</h2>
              <p>Đăng ký gần đây nhất</p>
            </div>
            <Link to="/admin/users" className="auth-text-action">Xem tất cả</Link>
          </header>

          <div className="recent-user-list">
            {mockUsers.slice(0, 3).map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => navigate(`/admin/users/${user.id}`)}
              >
                <span className="avatar">{user.initials}</span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <Badge tone={user.planStatus === "On track" ? "success" : "warning"}>
                  {user.planStatus}
                </Badge>
                <Icon name="chevron-right" size="small" />
              </button>
            ))}
          </div>
        </Card>

        {/* System Activity List */}
        <Card className="admin-list-card activity-card">
          <header>
            <div>
              <h2>Nhật ký vận hành hệ thống</h2>
              <p>Audit log gần đây</p>
            </div>
            <Link to="/admin/settings/audit-log" className="auth-text-action">Xem log</Link>
          </header>

          <div className="admin-activity-list">
            <div>
              <span><Icon name="circle-check" /></span>
              <div>
                <p><strong>Lê Lan Anh</strong> đã xuất báo cáo tổng kết tuần.</p>
                <small>15 phút trước</small>
              </div>
            </div>

            <div>
              <span><Icon name="sparkles" /></span>
              <div>
                <p><strong>AI Engine</strong> đồng bộ kiến thức từ Luật BHXH 2024.</p>
                <small>1 giờ trước</small>
              </div>
            </div>

            <div>
              <span><Icon name="settings" /></span>
              <div>
                <p><strong>Hệ thống</strong> tự động sao lưu dữ liệu toàn bộ người dùng.</p>
                <small>Hôm nay, 04:00</small>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// AD02 — User Management
export function AdminUsersPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tất cả trạng thái");
  const [planFilter, setPlanFilter] = useState("Tất cả tiến độ");

  const filteredUsers = useMemo(() => {
    return mockUsers.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus =
        statusFilter === "Tất cả trạng thái" || u.status === statusFilter;
      const matchPlan =
        planFilter === "Tất cả tiến độ" || u.planStatus === planFilter;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [searchTerm, statusFilter, planFilter]);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <span>QUẢN LÝ NGƯỜI DÙNG (AD02)</span>
          <h1>Danh sách người dùng An Hưu</h1>
          <p>Xem danh sách tài khoản, tiến độ hoàn tất hồ sơ và tình trạng kế hoạch hưu trí.</p>
        </div>
        <Button variant="secondary" icon="download" onClick={() => alert("Đang xuất danh sách ra file Excel...")}>
          Xuất dữ liệu Excel
        </Button>
      </div>

      <Card className="admin-table-card">
        {/* Toolbar */}
        <div className="admin-table-toolbar">
          <div className="admin-user-search">
            <SearchField
              label="Tìm kiếm người dùng"
              placeholder="Tìm theo tên, email hoặc mã USR..."
              value={searchTerm}
              onChange={setSearchTerm}
              hideLabel
            />
          </div>

          <div className="admin-filters">
            <Select
              label="Trạng thái tài khoản"
              options={["Tất cả trạng thái", "Đang hoạt động", "Chờ xác minh", "Tạm khóa"]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            <Select
              label="Tiến độ kế hoạch"
              options={["Tất cả tiến độ", "On track", "Needs attention", "Behind plan", "Chưa lập"]}
              value={planFilter}
              onChange={setPlanFilter}
            />
          </div>
        </div>

        {/* Results summary bar */}
        <div className="admin-results-summary">
          <span>Hiển thị <strong>{filteredUsers.length}</strong> người dùng phù hợp</span>
          {(searchTerm || statusFilter !== "Tất cả trạng thái" || planFilter !== "Tất cả tiến độ") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("Tất cả trạng thái");
                setPlanFilter("Tất cả tiến độ");
              }}
            >
              <Icon name="x" size="small" /> Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Table View for Desktop */}
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Mã USR</th>
                <th>Trạng thái</th>
                <th>Độ hoàn tất hồ sơ</th>
                <th>Kế hoạch hưu</th>
                <th>Mục tiêu quỹ</th>
                <th>Ngày tạo</th>
                <th>Hoạt động gần nhất</th>
                <th><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button
                      type="button"
                      className="table-user"
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                    >
                      <span className="avatar">{u.initials}</span>
                      <span>
                        <strong>{u.name}</strong>
                        <small style={{ color: "var(--color-text-muted)", display: "block" }}>{u.email}</small>
                      </span>
                    </button>
                  </td>
                  <td><code>{u.id}</code></td>
                  <td>
                    <Badge tone={u.status === "Đang hoạt động" ? "success" : u.status === "Chờ xác minh" ? "neutral" : "danger"}>
                      {u.status}
                    </Badge>
                  </td>
                  <td>
                    <div className="table-progress">
                      <ProgressBar value={u.profileCompletion} />
                      <span>{u.profileCompletion}%</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone={u.planStatus === "On track" ? "success" : u.planStatus === "Needs attention" ? "warning" : u.planStatus === "Behind plan" ? "deficit" : "neutral"}>
                      {u.planStatus}
                    </Badge>
                  </td>
                  <td><strong>{u.targetFund}</strong></td>
                  <td>{u.created}</td>
                  <td>{u.lastActive}</td>
                  <td>
                    <IconButton
                      icon="chevron-right"
                      label={`Xem hồ sơ chi tiết của ${u.name}`}
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="admin-user-cards">
          {filteredUsers.map((u) => (
            <Card key={u.id} className="admin-user-card">
              <header>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <span className="avatar">{u.initials}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <small style={{ display: "block", color: "var(--color-text-muted)" }}>{u.email}</small>
                  </div>
                </div>
                <Badge tone={u.status === "Đang hoạt động" ? "success" : "neutral"}>{u.status}</Badge>
              </header>
              <div>
                <span>
                  <small>Hồ sơ:</small>
                  <strong>{u.profileCompletion}%</strong>
                </span>
                <span>
                  <small>Kế hoạch:</small>
                  <strong>{u.planStatus}</strong>
                </span>
                <span>
                  <small>Mục tiêu:</small>
                  <strong>{u.targetFund}</strong>
                </span>
                <span>
                  <small>Hoạt động:</small>
                  <strong>{u.lastActive}</strong>
                </span>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={() => navigate(`/admin/users/${u.id}`)}
              >
                Xem chi tiết người dùng <Icon name="arrow-right" size="small" />
              </Button>
            </Card>
          ))}
        </div>

        {/* Table Footer with Pagination */}
        <div className="admin-table-footer">
          <span>Đang hiển thị 1–{filteredUsers.length} trên tổng số {mockUsers.length} tài khoản</span>
          <Pagination current={1} total={1} />
        </div>
      </Card>
    </div>
  );
}

// AD03 — User Detail
export function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Tổng quan");

  const user = mockUsers.find((u) => u.id === userId) || mockUsers[0];

  return (
    <div className="admin-page user-detail-page">
      <Breadcrumb
        items={[
          "Quản trị",
          "Người dùng",
          user.name,
        ]}
      />

      {/* Header */}
      <div className="user-detail-header">
        <button
          type="button"
          className="detail-back"
          onClick={() => navigate("/admin/users")}
          title="Quay lại danh sách người dùng"
        >
          <Icon name="arrow-left" />
        </button>

        <Avatar initials={user.initials} />

        <div>
          <h1>{user.name}</h1>
          <p>{user.email} · {user.phone} · Đăng ký ngày {user.created}</p>
        </div>

        <Badge tone={user.status === "Đang hoạt động" ? "success" : "warning"}>
          {user.status}
        </Badge>

        <Button variant="secondary" size="small" onClick={() => alert("Đang chuẩn bị xuất báo cáo cá nhân...")}>
          <Icon name="download" /> Xuất hồ sơ PDF
        </Button>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <Tabs
          items={["Tổng quan", "Hồ sơ tài chính", "Mục tiêu & Kế hoạch", "Lịch sử hoạt động", "Hỗ trợ"]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Main Grid: Detail Content + Context Rail */}
      <div className="admin-detail-grid">
        <div className="admin-detail-main">
          {/* Summary Card */}
          <Card className="detail-summary-card">
            <header>
              <div>
                <h2>Tóm tắt chỉ số tài chính</h2>
                <p>Dữ liệu cập nhật từ lần khai báo gần nhất của người dùng</p>
              </div>
              <Badge tone="soft">HOÀN TẤT {user.profileCompletion}%</Badge>
            </header>

            <div className="detail-metrics">
              <div>
                <span>Thu nhập sau thuế</span>
                <strong>{user.salary}</strong>
              </div>
              <div>
                <span>Tổng tài sản ước tính</span>
                <strong>{user.assets}</strong>
              </div>
              <div>
                <span>Tuổi hiện tại</span>
                <strong>{user.currentAge} tuổi</strong>
              </div>
              <div>
                <span>Tuổi dự kiến nghỉ hưu</span>
                <strong>{user.targetAge} tuổi</strong>
              </div>
            </div>
          </Card>

          {/* Retirement Plan Status Card */}
          <Card className="detail-plan-card">
            <header>
              <div>
                <h2>Tình trạng kế hoạch nghỉ hưu</h2>
                <p>Mục tiêu tài chính tuổi {user.targetAge}</p>
              </div>
              <Badge tone={user.planStatus === "On track" ? "success" : "warning"}>
                {user.planStatus}
              </Badge>
            </header>

            <div className="detail-plan-progress">
              <div>
                <span>Mức độ sẵn sàng</span>
                <strong>72%</strong>
              </div>
              <div className="progress-track" role="progressbar" aria-valuenow={72} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ "--progress": "72%" } as React.CSSProperties} />
              </div>
            </div>

            <div className="detail-plan-stats">
              <span>
                <small>Mục tiêu quỹ:</small>
                <strong>{user.targetFund}</strong>
              </span>
              <span>
                <small>Tích lũy/tháng:</small>
                <strong>14.200.000 đ</strong>
              </span>
              <span>
                <small>Thời gian còn lại:</small>
                <strong>{user.targetAge - user.currentAge} năm</strong>
              </span>
            </div>
          </Card>

          {/* Activity Timeline Card */}
          <Card className="detail-activity-card">
            <header>
              <div>
                <h2>Lịch sử hoạt động gần đây</h2>
                <p>Nhật ký tương tác trên ứng dụng</p>
              </div>
            </header>

            <div className="detail-timeline">
              <div>
                <span><Icon name="check" size="small" /></span>
                <p>
                  <strong>Hoàn tất tích lũy tháng 9</strong>
                  <small>Ghi nhận nộp 14.200.000 đ vào quỹ</small>
                </p>
                <time>Hôm nay, 10:24</time>
              </div>

              <div>
                <span><Icon name="sparkles" size="small" /></span>
                <p>
                  <strong>Trò chuyện cùng Trợ lý AI</strong>
                  <small>Mô phỏng kịch bản nghỉ hưu sớm ở tuổi 58</small>
                </p>
                <time>Hôm qua, 16:45</time>
              </div>

              <div>
                <span><Icon name="file-text" size="small" /></span>
                <p>
                  <strong>Cập nhật thông tin đóng BHXH</strong>
                  <small>Bổ sung số năm tham gia thành 9 năm</small>
                </p>
                <time>15/08/2025</time>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Sticky Rail */}
        <aside className="admin-detail-rail">
          {/* User Context Card */}
          <Card className="detail-context-card">
            <div className="avatar-wrap">
              <span className="avatar">{user.initials}</span>
              <div className="avatar-copy">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>

            <div className="detail-status-row">
              <span>Trạng thái tài khoản:</span>
              <Badge tone="success">{user.status}</Badge>
            </div>

            <div className="detail-meta">
              <span>
                Mã tài khoản:
                <strong>{user.id}</strong>
              </span>
              <span>
                Số điện thoại:
                <strong>{user.phone}</strong>
              </span>
              <span>
                Khu vực:
                <strong>TP. Hồ Chí Minh</strong>
              </span>
              <span>
                Đăng nhập cuối:
                <strong>{user.lastActive}</strong>
              </span>
            </div>

            <Button
              variant="secondary"
              onClick={() => alert(`Đã gửi email hỗ trợ trực tiếp tới ${user.email}`)}
            >
              <Icon name="message" size="small" /> Gửi email cho người dùng
            </Button>
          </Card>

          {/* Admin Note Card */}
          <Card className="detail-note-card">
            <Icon name="info" />
            <div>
              <strong>Ghi chú nội bộ Admin</strong>
              <p>{user.notes}</p>
              <Button
                variant="ghost"
                size="small"
                onClick={() => alert("Đang mở hộp thoại chỉnh sửa ghi chú...")}
              >
                Chỉnh sửa ghi chú
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
