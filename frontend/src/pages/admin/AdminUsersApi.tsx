import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import "./admin-users.css";
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
  const statuses = getStatuses(language);
  const allStatusLabel = language === "en" ? "All statuses" : "Tất cả trạng thái";

  const [selected, setSelected] = useState<{ user: User; mode: "detail" | "status" } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const closeDialog = () => { if (!statusBusy) setSelected(null); };

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
    <div className="admin-page admin-users-page">
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

      {notice && <div role="status"><Alert tone="success" title={notice} /></div>}

      {/* Main Table Card */}
      {/* Search & Filter Toolbar */}
      <Card className="admin-filter-card">
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
      </Card>

      <Card className="admin-table-card">
        {/* Table: stacks into cards on phones */}
        <div className="admin-users-table-wrap">
          <table className="admin-users-table admin-stack-table">
            <thead>
              <tr>
                <th>{language === "en" ? "User" : "Người dùng"}</th>
                <th>{language === "en" ? "Status" : "Trạng thái"}</th>
                <th>{language === "en" ? "Registered Date" : "Ngày đăng ký"}</th>
                <th className="col-optional">{language === "en" ? "Last Active" : "Hoạt động gần nhất"}</th>
                <th>{language === "en" ? "Actions" : "Thao tác"}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data?.items?.length ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--color-text-muted)" }}>
                    <Icon name="sparkles" /> {language === "en" ? "Updating user list..." : "Đang cập nhật danh sách người dùng…"}
                  </td>
                </tr>
              ) : !data?.items?.length ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--color-text-muted)" }}>
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
                          <small style={{ color: "var(--color-text-muted)", overflowWrap: "anywhere" }}>
                            {u.email}{u.role === "ADMIN" ? (language === "en" ? " · Administrator" : " · Quản trị viên") : ""}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td data-label={language === "en" ? "Status" : "Trạng thái"}>
                      <StatusBadge value={u.status} language={language} />
                    </td>

                    <td data-label={language === "en" ? "Registered" : "Ngày đăng ký"}>
                      <span style={{ fontSize: "12.5px", color: "var(--color-text-muted)" }}>
                        {formatDate(u.createdAt, language)}
                      </span>
                    </td>

                    <td className="col-optional" data-label={language === "en" ? "Last active" : "Hoạt động gần nhất"}>
                      <span style={{ fontSize: "12.5px", color: "var(--color-text-muted)" }}>
                        {formatDate(u.lastActiveAt, language)}
                      </span>
                    </td>

                    <td data-label={language === "en" ? "Actions" : "Thao tác"}>
                      <div className="admin-user-actions">
                        <button
                          type="button"
                          className="admin-user-action"
                          title={language === "en" ? "View details" : "Xem chi tiết"}
                          aria-label={`${language === "en" ? "View details" : "Xem chi tiết"}: ${u.fullName}`}
                          onClick={() => setSelected({ user: u, mode: "detail" })}
                        >
                          <Icon name="eye" size="small" />
                        </button>
                        <button
                          type="button"
                          className={`admin-user-action ${u.status === "SUSPENDED" ? "is-restore" : "is-suspend"}`}
                          title={u.status === "SUSPENDED" ? (language === "en" ? "Unlock account" : "Mở khóa tài khoản") : (language === "en" ? "Lock account" : "Khóa tài khoản")}
                          aria-label={`${u.status === "SUSPENDED" ? (language === "en" ? "Unlock account" : "Mở khóa tài khoản") : (language === "en" ? "Lock account" : "Khóa tài khoản")}: ${u.fullName}`}
                          onClick={() => setSelected({ user: u, mode: "status" })}
                        >
                          <Icon name={u.status === "SUSPENDED" ? faLockOpen : faLock} size="small" />
                        </button>
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
      <Modal
        open={selected !== null}
        title={selected?.mode === "detail"
          ? (language === "en" ? "User account details" : "Chi tiết tài khoản người dùng")
          : selected?.user.status === "SUSPENDED"
            ? (language === "en" ? "Unlock account" : "Mở khóa tài khoản")
            : (language === "en" ? "Lock account" : "Khóa tài khoản")}
        className={selected?.mode === "detail" ? "admin-user-detail-modal" : "admin-user-status-modal"}
        onClose={closeDialog}
      >
        {selected?.mode === "detail" && (
          <AdminUserDetail key={selected.user.id} target={selected.user.id}
            onStatusRequest={(user) => setSelected({ user, mode: "status" })} />
        )}
        {selected?.mode === "status" && (
          <UserStatusForm key={selected.user.id} user={selected.user} onCancel={closeDialog}
            onBusyChange={setStatusBusy}
            onUpdated={(user) => {
              setData((current) => current ? { ...current, items: current.items.map((item) => item.id === user.id ? user : item) } : current);
              setNotice(language === "en" ? `Account status updated: ${user.fullName}` : `Đã cập nhật trạng thái tài khoản: ${user.fullName}`);
              setSelected(null);
              setRetry((value) => value + 1);
            }} />
        )}
      </Modal>
    </div>
  );
}

export function AdminUserDetailPage() {
  const { language } = useI18n();
  const { userId, id } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const closeDialog = () => { if (!busy) setSelected(null); };
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
          <p>{language === "en" ? "View contact information and account verification status." : "Xem thông tin liên hệ và trạng thái xác thực của tài khoản."}</p>
        </div>
      </div>
      <AdminUserDetail key={revision} target={userId || id} onStatusRequest={setSelected} />
      <Modal open={selected !== null} title={language === "en" ? "Update account status" : "Cập nhật trạng thái tài khoản"} onClose={closeDialog}>
        {selected && <UserStatusForm user={selected} onCancel={closeDialog} onBusyChange={setBusy}
          onUpdated={() => { setSelected(null); setRevision((value) => value + 1); }} />}
      </Modal>
    </div>
  );
}

function AdminUserDetail({ target, onStatusRequest }: { target: string | undefined; onStatusRequest: (user: User) => void }) {
  const { language } = useI18n();
  const [data, setData] = useState<{ user: User } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    authenticatedRequest<{ user: User }>(`/admin/users/${target}`)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : (language === "en" ? "Could not load user details." : "Không thể tải thông tin chi tiết tài khoản.")); });
    return () => { active = false; };
  }, [target, retry, language]);

  return (
    <div className="admin-user-detail-content">
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
        <div className="admin-user-profile">
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
              <dl className="admin-user-essential-info">
                <div>
                  <dt>Email</dt>
                  <dd>{data.user.email}</dd>
                </div>
                <div>
                  <dt>{language === "en" ? "Phone" : "Số điện thoại"}</dt>
                  <dd>{data.user.phone || (language === "en" ? "Not updated" : "Chưa cập nhật")}</dd>
                </div>
                <div>
                  <dt>{language === "en" ? "Province / City" : "Tỉnh / Thành phố"}</dt>
                  <dd>{data.user.city || (language === "en" ? "Not updated" : "Chưa cập nhật")}</dd>
                </div>
                <div>
                  <dt>{language === "en" ? "Role" : "Vai trò"}</dt>
                  <dd>{data.user.role === "ADMIN" ? (language === "en" ? "Administrator" : "Quản trị viên") : (language === "en" ? "Customer" : "Khách hàng")}</dd>
                </div>
                <div>
                  <dt>{language === "en" ? "Email verification" : "Xác thực email"}</dt>
                  <dd><Badge tone={data.user.emailVerifiedAt ? "success" : "warning"}>
                    {data.user.emailVerifiedAt
                      ? (language === "en" ? "Verified" : "Đã xác minh")
                      : (language === "en" ? "Unverified" : "Chưa xác minh")}
                  </Badge></dd>
                </div>
                <div>
                  <dt>{language === "en" ? "Registration date" : "Ngày đăng ký"}</dt>
                  <dd>{formatDate(data.user.createdAt, language)}</dd>
                </div>
              </dl>

              <div style={{ paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
                <Button
                  variant={data.user.status === "SUSPENDED" ? "primary" : "danger"}
                  onClick={() => onStatusRequest(data.user)}
                >
                  {data.user.status === "SUSPENDED"
                    ? (language === "en" ? "Unlock Account" : "Mở khóa tài khoản")
                    : (language === "en" ? "Suspend Account" : "Khóa tài khoản này")}
                </Button>
              </div>
            </div>
          </Card>

        </div>
      )}

    </div>
  );
}

function UserStatusForm({ user, onCancel, onUpdated, onBusyChange }: {
  user: User;
  onCancel: () => void;
  onUpdated: (user: User) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { language } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const restoring = user.status === "SUSPENDED";
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 500;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !validReason) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const updated = await authenticatedRequest<User>(`/admin/users/${user.id}/status`, {
        expectedRevision: user.revision,
        action: restoring ? "restore" : "suspend",
        reason: reason.trim(),
      }, "PATCH");
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === "en" ? "Could not update account status." : "Không thể cập nhật trạng thái tài khoản."));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <form onSubmit={submit} className="admin-user-status-form" aria-busy={busy}>
      <div className="admin-user-status-person">
        <span className="avatar">{getInitials(user.fullName)}</span>
        <div><strong>{user.fullName}</strong><small>{user.email}</small></div>
        <StatusBadge value={user.status} language={language} />
      </div>
      <p>{restoring
        ? (language === "en" ? "The account will be unlocked. Email verification is still required if it has not been completed." : "Tài khoản sẽ được mở khóa. Người dùng vẫn cần xác minh email nếu chưa hoàn tất.")
        : (language === "en" ? "Locking this account will end all current sessions and prevent the user from signing in." : "Khóa tài khoản sẽ kết thúc toàn bộ phiên đăng nhập hiện tại và ngăn người dùng đăng nhập vào hệ thống.")}</p>
      <Input label={language === "en" ? "Reason (required)" : "Lý do (bắt buộc)"}
        placeholder={language === "en" ? "Enter a reason for this action..." : "Nhập lý do thực hiện thao tác..."}
        helper={language === "en" ? "3–500 characters. Saved to the activity log." : "Từ 3–500 ký tự. Lý do được lưu vào nhật ký hoạt động."}
        value={reason} onChange={setReason} disabled={busy} />
      {error && <p role="alert" className="admin-user-status-error">{error}</p>}
      <div className="admin-user-status-footer">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{language === "en" ? "Cancel" : "Hủy bỏ"}</Button>
        <Button type="submit" variant={restoring ? "primary" : "danger"} loading={busy} disabled={!validReason}>
          <Icon name={restoring ? faLockOpen : faLock} size="small" /> {restoring
            ? (language === "en" ? "Confirm unlock" : "Xác nhận mở khóa")
            : (language === "en" ? "Confirm lock" : "Xác nhận khóa")}
        </Button>
      </div>
    </form>
  );
}
