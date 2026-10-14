import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
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
} from "../../components/ui";
import { authenticatedRequest, type ApiUser } from "../../services/api";
import { downloadCsv } from "../../utils/downloads";
import { useI18n } from "../../i18n";

type User = ApiUser & { createdAt: string; lastActiveAt: string | null; emailVerifiedAt?: string | null };
type History = { id: string; action: string; performerName: string; createdAt: string; details: { reason?: string } | null };

const getStatuses = (language: "vi" | "en"): Record<string, string> => ({
  ACTIVE: language === "en" ? "Active" : "Đang hoạt động",
  PENDING_VERIFICATION: language === "en" ? "Pending Verification" : "Chờ xác minh",
  SUSPENDED: language === "en" ? "Suspended" : "Đã khóa",
});

const formatDate = (value: string | null | undefined, language: "vi" | "en") => {
  if (!value) return language === "en" ? "Not recorded" : "Chưa ghi nhận";
  try {
    const d = new Date(value);
    return d.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return value;
  }
};

const getInitials = (name: string) => {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "ND";
};

const StatusBadge = ({ value, language }: { value: string; language: "vi" | "en" }) => {
  const statuses = getStatuses(language);
  const tone = value === "ACTIVE" ? "success" : value === "SUSPENDED" ? "danger" : "warning";
  return <Badge tone={tone}>{statuses[value] || value}</Badge>;
};

export function AdminUsersPage() {
  const { language } = useI18n();
  const navigate = useNavigate();
  const statuses = getStatuses(language);
  const allStatusLabel = language === "en" ? "All statuses" : "Tất cả trạng thái";

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(allStatusLabel);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<{ items: User[]; total: number; limit: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const query = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      search: activeSearch,
    });

    const statusKey = Object.keys(statuses).find((key) => statuses[key] === statusFilter);
    if (statusKey) {
      query.set("status", statusKey);
    }

    authenticatedRequest<{ items: User[]; total: number; limit: number }>("/admin/users?" + query)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : (language === "en" ? "Could not load user directory." : "Không thể tải dữ liệu danh sách người dùng."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, pageSize, activeSearch, statusFilter, retry, language]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim());
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setActiveSearch("");
    setStatusFilter(allStatusLabel);
    setPage(1);
  };

  const handleExportCsv = () => {
    if (!data?.items?.length) return;
    downloadCsv("danh-sach-nguoi-dung-an-huu.csv", [
      [
        language === "en" ? "User ID" : "Mã ID",
        language === "en" ? "Full Name" : "Họ và tên",
        language === "en" ? "Email" : "Email",
        language === "en" ? "Phone" : "Số điện thoại",
        language === "en" ? "City" : "Tỉnh / Thành",
        language === "en" ? "Role" : "Vai trò",
        language === "en" ? "Status" : "Trạng thái",
        language === "en" ? "Created At" : "Ngày tạo",
        language === "en" ? "Last Active" : "Hoạt động gần nhất",
      ],
      ...data.items.map((u) => [
        u.id,
        u.fullName,
        u.email,
        u.phone || "",
        u.city || "",
        u.role,
        statuses[u.status] || u.status,
        formatDate(u.createdAt, language),
        formatDate(u.lastActiveAt, language),
      ]),
    ]);
  };

  // Quick stats derived from currently loaded total
  const kpiStats = useMemo(() => {
    const total = data?.total || 0;
    const activeCount = data?.items?.filter((u) => u.status === "ACTIVE").length || 0;
    const pendingCount = data?.items?.filter((u) => u.status === "PENDING_VERIFICATION").length || 0;
    const suspendedCount = data?.items?.filter((u) => u.status === "SUSPENDED").length || 0;
    return { total, activeCount, pendingCount, suspendedCount };
  }, [data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span>{language === "en" ? "OPERATIONS MANAGEMENT" : "QUẢN LÝ VẬN HÀNH"}</span>
          <h1>{language === "en" ? "User Management" : "Quản lý người dùng"}</h1>
          <p>{language === "en" ? "Search accounts, inspect contact details, and administer system access permissions." : "Tìm kiếm tài khoản, kiểm tra thông tin liên hệ và quản trị quyền truy cập hệ thống."}</p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button
            variant="secondary"
            icon="download"
            onClick={handleExportCsv}
            disabled={!data?.items?.length}
          >
            {language === "en" ? "Export CSV Data" : "Xuất dữ liệu CSV"}
          </Button>
          <Button
            variant="ghost"
            icon="sparkles"
            onClick={() => setRetry((v) => v + 1)}
          >
            {language === "en" ? "Refresh" : "Làm mới"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <Card className="admin-kpi-card">
          <div>
            <span>{language === "en" ? "Total Accounts" : "Tổng tài khoản"}</span>
            <span className="admin-kpi-icon"><Icon name="users" /></span>
          </div>
          <strong>{data ? data.total.toLocaleString(language === "en" ? "en-US" : "vi-VN") : "0"}</strong>
          <small>
            <Icon name="check" size="small" /> {language === "en" ? "Database system" : "Hệ thống cơ sở dữ liệu"}
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>{language === "en" ? "Active (This page)" : "Đang hoạt động (Trang này)"}</span>
            <span className="admin-kpi-icon" style={{ color: "var(--color-secondary-700)", background: "var(--color-success-soft)" }}>
              <Icon name="check" />
            </span>
          </div>
          <strong>{kpiStats.activeCount}</strong>
          <small style={{ color: "var(--color-secondary-700)" }}>
            {language === "en" ? "Verified and active" : "Tài khoản hợp lệ đã sẵn sàng"}
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>{language === "en" ? "Pending Verification" : "Chờ xác minh"}</span>
            <span className="admin-kpi-icon" style={{ color: "var(--color-warning)", background: "var(--color-warning-soft)" }}>
              <Icon name="info" />
            </span>
          </div>
          <strong>{kpiStats.pendingCount}</strong>
          <small style={{ color: "var(--color-warning)" }}>
            {language === "en" ? "Awaiting email verification" : "Đang chờ hoàn tất email"}
          </small>
        </Card>

        <Card className="admin-kpi-card">
          <div>
            <span>{language === "en" ? "Suspended / Inactive" : "Đã khóa / Tạm dừng"}</span>
            <span className="admin-kpi-icon" style={{ color: "var(--color-danger)", background: "rgba(var(--color-danger-rgb), 0.12)" }}>
              <Icon name="shield" />
            </span>
          </div>
          <strong>{kpiStats.suspendedCount}</strong>
          <small style={{ color: "var(--color-danger)" }}>
            {language === "en" ? "Login restricted" : "Hạn chế quyền đăng nhập"}
          </small>
        </Card>
      </div>

      {/* Error state */}
      {error && (
        <Alert tone="danger" title={language === "en" ? "Could not load user list" : "Không thể tải danh sách người dùng"}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span>{error}</span>
            <Button size="small" variant="secondary" onClick={() => setRetry((v) => v + 1)}>
              {language === "en" ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {/* Main Table Card */}
      <Card className="admin-table-card">
        {/* Search & Filter Toolbar */}
        <div className="admin-table-toolbar">
          <form className="admin-user-search" onSubmit={handleSearchSubmit}>
            <SearchField
              label={language === "en" ? "Search users" : "Tìm kiếm người dùng"}
              placeholder={language === "en" ? "Enter full name, email or phone..." : "Nhập họ tên, email hoặc số điện thoại..."}
              value={searchInput}
              onChange={setSearchInput}
              hideLabel
            />
          </form>

          <div className="admin-filters">
            <Select
              label={language === "en" ? "Status" : "Trạng thái"}
              options={[allStatusLabel, ...Object.values(statuses)]}
              value={statusFilter}
              onChange={(val) => {
                setPage(1);
                setStatusFilter(val);
              }}
            />
            <Button variant="primary" onClick={handleSearchSubmit}>
              {language === "en" ? "Search" : "Tìm kiếm"}
            </Button>
            {(activeSearch || statusFilter !== allStatusLabel) && (
              <Button variant="ghost" onClick={handleClearFilters}>
                <Icon name="trash" size="small" /> {language === "en" ? "Clear filters" : "Xóa bộ lọc"}
              </Button>
            )}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>{language === "en" ? "User" : "Người dùng"}</th>
                <th>{language === "en" ? "Contact Info" : "Thông tin liên hệ"}</th>
                <th>{language === "en" ? "Status" : "Trạng thái"}</th>
                <th>{language === "en" ? "Registered Date" : "Ngày đăng ký"}</th>
                <th>{language === "en" ? "Last Active" : "Hoạt động gần nhất"}</th>
                <th>{language === "en" ? "Actions" : "Thao tác"}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data?.items?.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--color-text-muted)" }}>
                    <Icon name="sparkles" /> {language === "en" ? "Updating user list..." : "Đang cập nhật danh sách người dùng…"}
                  </td>
                </tr>
              ) : !data?.items?.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--color-text-muted)" }}>
                    {language === "en" ? "No users found matching search criteria." : "Không tìm thấy người dùng nào phù hợp với điều kiện tìm kiếm."}
                  </td>
                </tr>
              ) : (
                data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="business-person">
                        <span className="avatar" style={{ background: "var(--color-soft)", color: "var(--color-primary-700)", fontWeight: 700 }}>
                          {getInitials(u.fullName)}
                        </span>
                        <div>
                          <strong>{u.fullName}</strong>
                          <small style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>
                            {u.role === "ADMIN" ? (language === "en" ? "Administrator" : "Quản trị viên") : (language === "en" ? "Customer" : "Khách hàng")} · ID: {u.id.slice(0, 8)}…
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: "grid", gap: "2px" }}>
                        <span style={{ color: "var(--color-primary-700)", fontWeight: 500 }}>{u.email}</span>
                        <small style={{ color: "var(--color-text-muted)" }}>
                          {u.phone ? u.phone : (language === "en" ? "No phone" : "Chưa có điện thoại")}
                          {u.city ? ` · ${u.city}` : ""}
                        </small>
                      </div>
                    </td>

                    <td>
                      <StatusBadge value={u.status} language={language} />
                    </td>

                    <td>
                      <span style={{ fontSize: "12.5px", color: "var(--color-text-muted)" }}>
                        {formatDate(u.createdAt, language)}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontSize: "12.5px", color: "var(--color-text-muted)" }}>
                        {formatDate(u.lastActiveAt, language)}
                      </span>
                    </td>

                    <td>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                      >
                        {language === "en" ? "Details" : "Chi tiết"} <Icon name="arrow-right" size="small" />
                      </Button>
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
    </div>
  );
}

export function AdminUserDetailPage() {
  const { language } = useI18n();
  const { userId, id } = useParams();
  const target = userId || id;
  const navigate = useNavigate();

  const [data, setData] = useState<{ user: User; history: History[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");

    authenticatedRequest<{ user: User; history: History[] }>(`/admin/users/${target}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : (language === "en" ? "Could not load user details." : "Không thể tải thông tin chi tiết tài khoản."));
      });

    return () => {
      active = false;
    };
  }, [target, retry, language]);

  const handleStatusChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!data || busy) return;
    setBusy(true);
    setError("");

    try {
      await authenticatedRequest(
        `/admin/users/${target}/status`,
        {
          expectedRevision: data.user.revision,
          action: data.user.status === "SUSPENDED" ? "restore" : "suspend",
          reason,
        },
        "PATCH"
      );
      setConfirm(false);
      setReason("");
      setRetry((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "en" ? "Could not update user status." : "Không thể cập nhật trạng thái người dùng."));
    } finally {
      setBusy(false);
    }
  };

  const activityLabels: Record<string, string> = {
    ACCOUNT_UPDATED: language === "en" ? "Account Profile Updated" : "Cập nhật hồ sơ tài khoản",
    ACCOUNT_AVATAR_UPDATED: language === "en" ? "Avatar Photo Changed" : "Thay đổi ảnh đại diện",
    AUTH_LOGIN: language === "en" ? "System Login" : "Đăng nhập hệ thống",
    AUTH_LOGOUT: language === "en" ? "Account Logout" : "Đăng xuất tài khoản",
    AUTH_REGISTER: language === "en" ? "New Account Registration" : "Đăng ký tài khoản mới",
    AUTH_VERIFY_EMAIL: language === "en" ? "Email Verified Successfully" : "Xác minh email thành công",
    AUTH_CHANGE_PASSWORD: language === "en" ? "Password Changed" : "Đổi mật khẩu tài khoản",
    ADMIN_USER_STATUS: language === "en" ? "Admin Status Update" : "Quản trị viên cập nhật trạng thái",
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <button
            type="button"
            onClick={() => navigate("/admin/users")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--color-primary-700)",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              marginBottom: "var(--space-2)",
            }}
          >
            <Icon name="arrow-left" size="small" /> {language === "en" ? "Back to users list" : "Quay lại danh sách người dùng"}
          </button>
          <h1>{language === "en" ? "User Account Profile" : "Hồ sơ tài khoản người dùng"}</h1>
          <p>{language === "en" ? "View details, verification status, and activity history for this account." : "Xem thông tin chi tiết, trạng thái xác thực và lịch sử tương tác của tài khoản."}</p>
        </div>
      </div>

      {error && (
        <Alert tone="danger" title={language === "en" ? "Failed to process request" : "Không thể xử lý yêu cầu"}>
          {error}
          <Button size="small" variant="secondary" onClick={() => setRetry((v) => v + 1)}>
            {language === "en" ? "Reload" : "Tải lại"}
          </Button>
        </Alert>
      )}

      {!data && !error && (
        <Card style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--color-text-muted)" }}>
          <Icon name="sparkles" /> {language === "en" ? "Loading account details..." : "Đang tải thông tin tài khoản…"}
        </Card>
      )}

      {data && (
        <div className="admin-user-detail-grid">
          {/* Left Column: Profile Card */}
          <Card className="admin-list-card">
            <header>
              <div className="business-person" style={{ gap: "var(--space-3)" }}>
                <span
                  className="avatar"
                  style={{
                    width: "48px",
                    height: "48px",
                    fontSize: "18px",
                    background: "var(--color-soft)",
                    color: "var(--color-primary-700)",
                    fontWeight: 700,
                  }}
                >
                  {getInitials(data.user.fullName)}
                </span>
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px" }}>{data.user.fullName}</h2>
                  <small style={{ color: "var(--color-text-muted)" }}>
                    {language === "en" ? "User ID:" : "Mã người dùng:"} {data.user.id}
                  </small>
                </div>
              </div>
              <StatusBadge value={data.user.status} language={language} />
            </header>

            <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-5)" }}>
              <div className="admin-user-info-table">
                <span style={{ color: "var(--color-text-muted)" }}>Email:</span>
                <strong style={{ color: "var(--color-primary-700)" }}>{data.user.email}</strong>

                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Phone:" : "Số điện thoại:"}</span>
                <strong>{data.user.phone || (language === "en" ? "Not updated" : "Chưa cập nhật")}</strong>

                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Province / City:" : "Tỉnh / Thành phố:"}</span>
                <strong>{data.user.city || (language === "en" ? "Not updated" : "Chưa cập nhật")}</strong>

                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Email Status:" : "Xác thực Email:"}</span>
                <div>
                  {data.user.emailVerifiedAt ? (
                    <Badge tone="success">
                      {language === "en" ? `Verified (${formatDate(data.user.emailVerifiedAt, language)})` : `Đã xác minh (${formatDate(data.user.emailVerifiedAt, language)})`}
                    </Badge>
                  ) : (
                    <Badge tone="warning">{language === "en" ? "Unverified" : "Chưa xác minh"}</Badge>
                  )}
                </div>

                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Created Date:" : "Ngày khởi tạo:"}</span>
                <span>{formatDate(data.user.createdAt, language)}</span>

                <span style={{ color: "var(--color-text-muted)" }}>{language === "en" ? "Last Active:" : "Hoạt động gần nhất:"}</span>
                <span>{formatDate(data.user.lastActiveAt, language)}</span>
              </div>

              <div style={{ paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
                <Button
                  variant={data.user.status === "SUSPENDED" ? "primary" : "danger"}
                  onClick={() => setConfirm(true)}
                >
                  {data.user.status === "SUSPENDED"
                    ? (language === "en" ? "Unlock Account" : "Mở khóa tài khoản")
                    : (language === "en" ? "Suspend Account" : "Khóa tài khoản này")}
                </Button>
              </div>
            </div>
          </Card>

          {/* Right Column: Activity History Card */}
          <Card className="admin-list-card">
            <header>
              <div>
                <h2>{language === "en" ? "Recent Activity History" : "Nhật ký hoạt động gần nhất"}</h2>
                <p>{language === "en" ? "Track user authentication, profile updates, and admin operations." : "Theo dõi các hành vi đăng nhập, cập nhật hồ sơ và quản trị tài khoản."}</p>
              </div>
            </header>

            <div style={{ marginTop: "var(--space-4)" }}>
              {!data.history.length ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>
                  {language === "en" ? "No recent activities recorded." : "Chưa ghi nhận hoạt động nào gần đây."}
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-3)" }}>
                  {data.history.map((h) => (
                    <li
                      key={h.id}
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        background: "rgba(248, 250, 252, 0.75)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid rgba(226, 232, 240, 0.8)",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ color: "var(--color-primary-700)" }}>
                          {activityLabels[h.action] || h.action}
                        </strong>
                        <small style={{ color: "var(--color-text-muted)" }}>{formatDate(h.createdAt, language)}</small>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                        {language === "en" ? "Performed by:" : "Người thực hiện:"} {h.performerName}
                        {h.details?.reason && (
                          <div style={{ color: "var(--color-text-strong)", marginTop: "2px" }}>
                            {language === "en" ? "Reason:" : "Lý do:"} <em>{h.details.reason}</em>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        open={confirm}
        title={
          data?.user.status === "SUSPENDED"
            ? (language === "en" ? "Unlock User Account?" : "Mở khóa tài khoản người dùng?")
            : (language === "en" ? "Confirm Account Suspension?" : "Xác nhận khóa tài khoản người dùng?")
        }
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
      >
        <form onSubmit={handleStatusChange} style={{ display: "grid", gap: "var(--space-4)" }}>
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--color-text-muted)" }}>
            {data?.user.status === "SUSPENDED"
              ? (language === "en"
                  ? "The account will be restored with full login and access permissions to An Huu."
                  : "Tài khoản sẽ được khôi phục quyền đăng nhập và truy cập vào các tính năng của An Hưu.")
              : (language === "en"
                  ? "This action will immediately revoke all current sessions and block the user from accessing the system."
                  : "Thao tác này sẽ ngay lập tức thu hồi toàn bộ các phiên đăng nhập hiện tại và chặn người dùng truy cập.")}
          </p>

          <Input
            label={language === "en" ? "Reason for status change (Required)" : "Lý do cập nhật trạng thái (Bắt buộc)"}
            placeholder={language === "en" ? "Enter the operational reason for this action..." : "Nhập lý do thực hiện thao tác này..."}
            value={reason}
            onChange={setReason}
          />

          {error && <p role="alert" style={{ color: "var(--color-danger)", fontSize: "13px" }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
              {language === "en" ? "Cancel" : "Hủy bỏ"}
            </Button>
            <Button
              type="submit"
              variant={data?.user.status === "SUSPENDED" ? "primary" : "danger"}
              loading={busy}
              disabled={reason.trim().length < 3}
            >
              {language === "en" ? "Confirm Change" : "Xác nhận thay đổi"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
