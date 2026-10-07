import { useEffect, useState, useMemo, type FormEvent } from "react";
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
  Select,
  Tabs,
} from "../../../components/ui";
import { authenticatedRequest } from "../../../services/api";
import { useI18n } from "../../../i18n";
import {
  formatDate,
  actionLabelsVi,
  actionLabelsEn,
  type AuditLogEntry,
  type LoginLogEntry,
  type SystemLogEntry,
  type PaginatedResponse,
} from "./types";

export default function SystemLogsPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const tabOptions = useMemo(
    () =>
      isEn
        ? ["Admin Activity", "Login Log", "System Errors"]
        : ["Hoạt động quản trị", "Đăng nhập", "Lỗi hệ thống"],
    [isEn]
  );

  const [activeTab, setActiveTab] = useState(tabOptions[0]);

  // Keep activeTab in sync with language switch
  useEffect(() => {
    setActiveTab((prev) => {
      const idx = prev === "Admin Activity" || prev === "Hoạt động quản trị" ? 0
        : prev === "Login Log" || prev === "Đăng nhập" ? 1
        : 2;
      return tabOptions[idx];
    });
  }, [tabOptions]);

  return (
    <div className="admin-page-section">
      <header className="admin-page-header">
        <div>
          <span>ADMIN AREA</span>
          <h1>{isEn ? "System Logs" : "Nhật ký hệ thống"}</h1>
          <p>
            {isEn
              ? "Comprehensive immutable record of administrative actions, authentication attempts, and system errors."
              : "Lịch sử bất biến ghi nhận mọi thao tác quản trị, lịch sử đăng nhập và lỗi phát sinh trong hệ thống."}
          </p>
        </div>
      </header>

      <div style={{ marginBottom: 16 }}>
        <Tabs items={tabOptions} active={activeTab} onChange={setActiveTab} />
      </div>

      {(activeTab === "Admin Activity" || activeTab === "Hoạt động quản trị") && <AuditLogTab isEn={isEn} />}
      {(activeTab === "Login Log" || activeTab === "Đăng nhập") && <LoginLogTab isEn={isEn} />}
      {(activeTab === "System Errors" || activeTab === "Lỗi hệ thống") && <SystemErrorLogTab isEn={isEn} />}
    </div>
  );
}

// ------------------------------------------
// 4.1 TAB HOẠT ĐỘNG QUẢN TRỊ (AUDIT LOGS)
// ------------------------------------------

function AuditLogTab({ isEn }: { isEn: boolean }) {
  const [data, setData] = useState<PaginatedResponse<AuditLogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedAudit, setSelectedAudit] = useState<AuditLogEntry | null>(null);

  const actionMap = isEn ? actionLabelsEn : actionLabelsVi;

  const targetOptions = isEn
    ? ["All Targets", "SYSTEM_SETTINGS", "USER", "ARTICLE", "SUPPORT", "PARTNER"]
    : ["Tất cả đối tượng", "SYSTEM_SETTINGS", "USER", "ARTICLE", "SUPPORT", "PARTNER"];

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (actionFilter) q.set("action", actionFilter);
      if (targetFilter && !targetFilter.startsWith("Tất cả") && !targetFilter.startsWith("All")) {
        q.set("targetType", targetFilter);
      }
      if (search) q.set("search", search);

      const res = await authenticatedRequest<PaginatedResponse<AuditLogEntry>>(
        `/admin/settings/logs/audit?${q.toString()}`,
        undefined,
        "GET",
        undefined,
        { skipCache: true }
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Failed to load audit logs." : "Không thể tải nhật ký hoạt động.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, targetFilter, search]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  return (
    <Card className="audit-log-card">
      <div className="audit-log-header">
        <div>
          <h2>{isEn ? "Administrative Activity Trail" : "Nhật ký hoạt động quản trị"}</h2>
          <p>
            {isEn
              ? "All modifications made by administrators across system settings, user roles, content, and partnerships."
              : "Toàn bộ tác vụ thay đổi cấu hình, phân quyền, bài viết và đối tác do Quản trị viên thực hiện."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => fetchLogs()} disabled={loading}>
          <Icon name="upload" size="small" /> {isEn ? "Refresh" : "Làm mới"}
        </Button>
      </div>

      {/* BỘ LỌC TÌM KIẾM */}
      <form onSubmit={handleSearch} className="audit-filter-bar">
        <Input
          label={isEn ? "Search Action or Performer" : "Tìm kiếm thao tác, người thực hiện"}
          hideLabel
          placeholder={isEn ? "Search performer name, email, IP..." : "Tìm theo tên, email, địa chỉ IP..."}
          value={searchDraft}
          onChange={setSearchDraft}
        />
        <Select
          label={isEn ? "Filter by Action" : "Lọc theo hành động"}
          hideLabel
          options={[
            isEn ? "All Actions" : "Tất cả hành động",
            "UPDATE_SYSTEM_SETTINGS",
            "UPDATE_SECURITY_SETTINGS",
            "UPDATE_NOTIFICATION_SETTINGS",
            "AUTH_LOGIN",
            "AUTH_LOGOUT",
            "ADMIN_USER_STATUS",
            "CONTENT_CREATED",
            "CONTENT_UPDATED",
            "SUPPORT_REPLIED",
          ]}
          value={actionFilter || (isEn ? "All Actions" : "Tất cả hành động")}
          onChange={(val) => {
            setPage(1);
            setActionFilter(val.startsWith("Tất cả") || val.startsWith("All") ? "" : val);
          }}
        />
        <Select
          label={isEn ? "Filter by Target Resource" : "Lọc theo đối tượng"}
          hideLabel
          options={targetOptions}
          value={targetFilter || targetOptions[0]}
          onChange={(val) => {
            setPage(1);
            setTargetFilter(val.startsWith("Tất cả") || val.startsWith("All") ? "" : val);
          }}
        />
        <Button type="submit">{isEn ? "Filter Logs" : "Lọc nhật ký"}</Button>
      </form>

      {error && (
        <Alert tone="danger" title={isEn ? "Error loading logs" : "Lỗi tải dữ liệu"}>
          {error}
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={fetchLogs}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {loading ? (
        <p style={{ padding: 20 }}>{isEn ? "Loading audit records..." : "Đang tải bản ghi nhật ký..."}</p>
      ) : data && (
        <>
          <div style={{ padding: "0 20px 8px" }}>
            <p className="audit-total-count">
              {isEn ? `Found ${data.total} action records` : `Tìm thấy ${data.total} bản ghi thao tác`}
            </p>
          </div>

          <div className="table-scroll">
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th>{isEn ? "Time" : "Thời gian"}</th>
                  <th>{isEn ? "Performer" : "Người thực hiện"}</th>
                  <th>{isEn ? "Action" : "Hành động"}</th>
                  <th>{isEn ? "Target" : "Đối tượng"}</th>
                  <th>{isEn ? "IP Address" : "Địa chỉ IP"}</th>
                  <th style={{ textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      {isEn ? "No matching records found." : "Không có bản ghi phù hợp."}
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.createdAt, isEn)}</td>
                      <td>
                        <strong>{row.performerName || row.performerId || (isEn ? "System" : "Hệ thống")}</strong>
                      </td>
                      <td>
                        <Badge tone="info">{actionMap[row.action] || row.action}</Badge>
                      </td>
                      <td>
                        <strong>{row.targetType}</strong>
                        {row.targetId && (
                          <div>
                            <small className="target-id-sub">{row.targetId}</small>
                          </div>
                        )}
                      </td>
                      <td>{row.ipAddress || "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedAudit(row)}
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          {isEn ? "View Details" : "Xem chi tiết"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
            totalItems={data.total}
            pageSize={data.limit}
            onPageChange={setPage}
            showRowsPerPage={false}
          />
        </>
      )}

      {/* DRAWER XEM CHI TIẾT AUDIT LOG */}
      <Drawer
        open={Boolean(selectedAudit)}
        title={isEn ? "Audit Record Detail" : "Chi tiết nhật ký hoạt động"}
        onClose={() => setSelectedAudit(null)}
      >
        {selectedAudit && (
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>
                {isEn ? "General Information" : "Thông tin chung"}
              </h4>
              <div style={{ background: "var(--color-bg)", padding: 12, borderRadius: 8, display: "grid", gap: 6, fontSize: 13 }}>
                <div><strong>{isEn ? "Performer:" : "Người thực hiện:"}</strong> {selectedAudit.performerName} ({selectedAudit.performerId || "System"})</div>
                <div><strong>{isEn ? "Time:" : "Thời gian:"}</strong> {formatDate(selectedAudit.createdAt, isEn)}</div>
                <div><strong>{isEn ? "IP Address:" : "Địa chỉ IP:"}</strong> {selectedAudit.ipAddress || "—"}</div>
                <div><strong>{isEn ? "User Agent:" : "Trình duyệt:"}</strong> {selectedAudit.userAgent || "—"}</div>
                <div><strong>{isEn ? "Action:" : "Hành động:"}</strong> <Badge tone="info">{actionMap[selectedAudit.action] || selectedAudit.action}</Badge></div>
                <div><strong>{isEn ? "Resource:" : "Đối tượng:"}</strong> {selectedAudit.targetType} (#{selectedAudit.targetId || "—"})</div>
              </div>
            </div>

            {/* BEFORE / AFTER DIFF */}
            {selectedAudit.details && (selectedAudit.details.before || selectedAudit.details.after) ? (
              <div>
                <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>
                  {isEn ? "Configuration Diff (Before vs After)" : "So sánh thay đổi (Trước và Sau)"}
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <h5 style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 4 }}>
                      {isEn ? "Before Update:" : "Trước khi sửa:"}
                    </h5>
                    <pre style={{ background: "var(--color-bg)", padding: 10, borderRadius: 6, fontSize: 11, overflowX: "auto", border: "1px solid var(--color-border)" }}>
                      {JSON.stringify(selectedAudit.details.before || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h5 style={{ fontSize: 12, color: "var(--color-success)", marginBottom: 4 }}>
                      {isEn ? "After Update:" : "Sau khi sửa:"}
                    </h5>
                    <pre style={{ background: "var(--color-bg)", padding: 10, borderRadius: 6, fontSize: 11, overflowX: "auto", border: "1px solid var(--color-border)" }}>
                      {JSON.stringify(selectedAudit.details.after || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ) : selectedAudit.details ? (
              <div>
                <h4 style={{ fontSize: 13, textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>
                  {isEn ? "Additional Details" : "Dữ liệu chi tiết"}
                </h4>
                <pre style={{ background: "var(--color-bg)", padding: 12, borderRadius: 8, fontSize: 12, overflowX: "auto" }}>
                  {JSON.stringify(selectedAudit.details, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </Drawer>
    </Card>
  );
}

// ------------------------------------------
// 4.2 TAB NHẬT KÝ ĐĂNG NHẬP (LOGIN LOGS)
// ------------------------------------------

function LoginLogTab({ isEn }: { isEn: boolean }) {
  const [data, setData] = useState<PaginatedResponse<LoginLogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const statusOptions = isEn
    ? ["All Statuses", "SUCCESS", "FAILED", "LOCKED"]
    : ["Tất cả trạng thái", "SUCCESS", "FAILED", "LOCKED"];

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (statusFilter && !statusFilter.startsWith("Tất cả") && !statusFilter.startsWith("All")) {
        q.set("status", statusFilter);
      }
      if (search) q.set("search", search);

      const res = await authenticatedRequest<PaginatedResponse<LoginLogEntry>>(
        `/admin/settings/logs/login?${q.toString()}`,
        undefined,
        "GET",
        undefined,
        { skipCache: true }
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Failed to load login history." : "Không thể tải lịch sử đăng nhập.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, statusFilter, search]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const renderStatusBadge = (status: LoginLogEntry["status"]) => {
    switch (status) {
      case "SUCCESS":
        return <Badge tone="success">{isEn ? "Successful" : "Thành công"}</Badge>;
      case "FAILED":
        return <Badge tone="warning">{isEn ? "Failed" : "Thất bại"}</Badge>;
      case "LOCKED":
        return <Badge tone="danger">{isEn ? "Locked Out" : "Bị khóa"}</Badge>;
      default:
        return <Badge tone="neutral">{status}</Badge>;
    }
  };

  return (
    <Card className="audit-log-card">
      <div className="audit-log-header">
        <div>
          <h2>{isEn ? "Authentication Attempts & Access History" : "Lịch sử đăng nhập & Xác thực"}</h2>
          <p>
            {isEn
              ? "Tracks all successful authentications, wrong password attempts, and brute-force lockout occurrences."
              : "Theo dõi toàn bộ phiên đăng nhập thành công, đăng nhập sai mật khẩu và các sự kiện khóa tài khoản."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => fetchLogs()} disabled={loading}>
          <Icon name="upload" size="small" /> {isEn ? "Refresh" : "Làm mới"}
        </Button>
      </div>

      <form onSubmit={handleSearch} className="audit-filter-bar">
        <Input
          label={isEn ? "Search Email or IP" : "Tìm theo email hoặc IP"}
          hideLabel
          placeholder={isEn ? "Search login email, username, IP..." : "Tìm theo email, tên đăng nhập, địa chỉ IP..."}
          value={searchDraft}
          onChange={setSearchDraft}
        />
        <Select
          label={isEn ? "Filter by Status" : "Lọc theo trạng thái"}
          hideLabel
          options={statusOptions}
          value={statusFilter || statusOptions[0]}
          onChange={(val) => {
            setPage(1);
            setStatusFilter(val.startsWith("Tất cả") || val.startsWith("All") ? "" : val);
          }}
        />
        <Button type="submit">{isEn ? "Filter Logs" : "Lọc lịch sử"}</Button>
      </form>

      {error && (
        <Alert tone="danger" title={isEn ? "Error loading logs" : "Lỗi tải dữ liệu"}>
          {error}
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={fetchLogs}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {loading ? (
        <p style={{ padding: 20 }}>{isEn ? "Loading login records..." : "Đang tải lịch sử đăng nhập..."}</p>
      ) : data && (
        <>
          <div style={{ padding: "0 20px 8px" }}>
            <p className="audit-total-count">
              {isEn ? `Found ${data.total} authentication events` : `Tìm thấy ${data.total} lượt đăng nhập`}
            </p>
          </div>

          <div className="table-scroll">
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th>{isEn ? "Time" : "Thời gian"}</th>
                  <th>{isEn ? "Identifier / Account" : "Tài khoản / Email"}</th>
                  <th>{isEn ? "Status" : "Trạng thái"}</th>
                  <th>{isEn ? "IP Address" : "Địa chỉ IP"}</th>
                  <th>{isEn ? "Failure Reason" : "Lý do thất bại"}</th>
                  <th>{isEn ? "User Agent" : "Thiết bị & Trình duyệt"}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      {isEn ? "No matching login attempts." : "Không có lượt đăng nhập nào."}
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.createdAt, isEn)}</td>
                      <td>
                        <strong>{row.identifier}</strong>
                        {row.user && (
                          <div>
                            <small style={{ color: "var(--color-text-muted)" }}>
                              {row.user.fullName} ({row.user.role})
                            </small>
                          </div>
                        )}
                      </td>
                      <td>{renderStatusBadge(row.status)}</td>
                      <td>{row.ipAddress || "—"}</td>
                      <td>
                        {row.failureReason ? (
                          <span style={{ color: "var(--color-danger)", fontSize: 12 }}>
                            {row.failureReason}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-success)", fontSize: 12 }}>
                            {isEn ? "None (Granted)" : "Hợp lệ"}
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <small title={row.userAgent || ""}>{row.userAgent || "—"}</small>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
            totalItems={data.total}
            pageSize={data.limit}
            onPageChange={setPage}
            showRowsPerPage={false}
          />
        </>
      )}
    </Card>
  );
}

// ------------------------------------------
// 4.3 TAB LỖI HỆ THỐNG (SYSTEM ERRORS)
// ------------------------------------------

function SystemErrorLogTab({ isEn }: { isEn: boolean }) {
  const [data, setData] = useState<PaginatedResponse<SystemLogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [levelFilter, setLevelFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [selectedError, setSelectedError] = useState<SystemLogEntry | null>(null);

  const levelOptions = isEn
    ? ["All Levels", "ERROR", "CRITICAL", "WARNING", "INFO"]
    : ["Tất cả mức độ", "ERROR", "CRITICAL", "WARNING", "INFO"];

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (levelFilter && !levelFilter.startsWith("Tất cả") && !levelFilter.startsWith("All")) {
        q.set("level", levelFilter);
      }
      if (search) q.set("search", search);

      const res = await authenticatedRequest<PaginatedResponse<SystemLogEntry>>(
        `/admin/settings/logs/errors?${q.toString()}`,
        undefined,
        "GET",
        undefined,
        { skipCache: true }
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Failed to load error logs." : "Không thể tải nhật ký lỗi hệ thống.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, levelFilter, search]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  const renderLevelBadge = (level: SystemLogEntry["level"]) => {
    switch (level) {
      case "CRITICAL":
        return <Badge tone="danger">{isEn ? "Critical" : "Khẩn cấp"}</Badge>;
      case "ERROR":
        return <Badge tone="danger">{isEn ? "Error" : "Lỗi"}</Badge>;
      case "WARNING":
        return <Badge tone="warning">{isEn ? "Warning" : "Cảnh báo"}</Badge>;
      case "INFO":
        return <Badge tone="info">{isEn ? "Info" : "Thông tin"}</Badge>;
      default:
        return <Badge tone="neutral">{level}</Badge>;
    }
  };

  return (
    <Card className="audit-log-card">
      <div className="audit-log-header">
        <div>
          <h2>{isEn ? "Runtime Diagnostics & Error Log" : "Nhật ký lỗi hệ thống & Ngoại lệ"}</h2>
          <p>
            {isEn
              ? "Monitors uncaught runtime exceptions, API HTTP 5xx responses, and critical worker failures."
              : "Ghi nhận toàn bộ lỗi ngoại lệ, mã HTTP 5xx và các sự cố phát sinh trong quá trình chạy hệ thống."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => fetchLogs()} disabled={loading}>
          <Icon name="upload" size="small" /> {isEn ? "Refresh" : "Làm mới"}
        </Button>
      </div>

      <form onSubmit={handleSearch} className="audit-filter-bar">
        <Input
          label={isEn ? "Search Message or Path" : "Tìm kiếm thông điệp hoặc đường dẫn"}
          hideLabel
          placeholder={isEn ? "Search error message, endpoint path, traceId..." : "Tìm theo nội dung lỗi, URL, traceId..."}
          value={searchDraft}
          onChange={setSearchDraft}
        />
        <Select
          label={isEn ? "Filter by Severity Level" : "Lọc theo mức độ lỗi"}
          hideLabel
          options={levelOptions}
          value={levelFilter || levelOptions[0]}
          onChange={(val) => {
            setPage(1);
            setLevelFilter(val.startsWith("Tất cả") || val.startsWith("All") ? "" : val);
          }}
        />
        <Button type="submit">{isEn ? "Filter Errors" : "Lọc nhật ký lỗi"}</Button>
      </form>

      {error && (
        <Alert tone="danger" title={isEn ? "Error loading logs" : "Lỗi tải dữ liệu"}>
          {error}
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" onClick={fetchLogs}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {loading ? (
        <p style={{ padding: 20 }}>{isEn ? "Loading system errors..." : "Đang tải nhật ký lỗi..."}</p>
      ) : data && (
        <>
          <div style={{ padding: "0 20px 8px" }}>
            <p className="audit-total-count">
              {isEn ? `Found ${data.total} recorded exceptions` : `Tìm thấy ${data.total} sự cố được ghi nhận`}
            </p>
          </div>

          <div className="table-scroll">
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th>{isEn ? "Time" : "Thời gian"}</th>
                  <th>{isEn ? "Severity" : "Mức độ"}</th>
                  <th>{isEn ? "Source Service" : "Nguồn phát sinh"}</th>
                  <th>{isEn ? "Error Message" : "Nội dung lỗi"}</th>
                  <th>{isEn ? "HTTP Code / Path" : "Mã HTTP / Đường dẫn"}</th>
                  <th style={{ textAlign: "right" }}>{isEn ? "Action" : "Thao tác"}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24 }}>
                      {isEn ? "No system errors recorded. System running smoothly." : "Hệ thống hoạt động ổn định, không có lỗi nào."}
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.createdAt, isEn)}</td>
                      <td>{renderLevelBadge(row.level)}</td>
                      <td>
                        <strong>{row.source}</strong>
                      </td>
                      <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span title={row.message}>{row.message}</span>
                      </td>
                      <td>
                        {row.statusCode ? <code>{row.statusCode}</code> : "—"}{" "}
                        {row.path && <small className="target-id-sub">{row.path}</small>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedError(row)}
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          {isEn ? "View Details" : "Xem chi tiết"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(data.total / data.limit))}
            totalItems={data.total}
            pageSize={data.limit}
            onPageChange={setPage}
            showRowsPerPage={false}
          />
        </>
      )}

      {/* MODAL XEM CHI TIẾT LỖI */}
      <Modal
        open={Boolean(selectedError)}
        title={isEn ? "System Error Details" : "Chi tiết lỗi hệ thống"}
        onClose={() => setSelectedError(null)}
      >
        {selectedError && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {renderLevelBadge(selectedError.level)}
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{formatDate(selectedError.createdAt, isEn)}</span>
            </div>
            <div>
              <strong>{isEn ? "Source:" : "Nguồn phát sinh:"}</strong> {selectedError.source}
            </div>
            <div>
              <strong>{isEn ? "Error Message:" : "Thông điệp lỗi:"}</strong>
              <div style={{ marginTop: 4, padding: 10, background: "rgba(239, 68, 68, 0.08)", color: "var(--color-danger)", borderRadius: 6, fontWeight: 500 }}>
                {selectedError.message}
              </div>
            </div>
            {selectedError.path && (
              <div>
                <strong>{isEn ? "Request Path:" : "Đường dẫn yêu cầu:"}</strong> <code>{selectedError.path}</code>
              </div>
            )}
            {selectedError.statusCode && (
              <div>
                <strong>{isEn ? "HTTP Status Code:" : "Mã HTTP phản hồi:"}</strong> {selectedError.statusCode}
              </div>
            )}
            {selectedError.traceId && (
              <div>
                <strong>{isEn ? "Trace / Request ID:" : "Mã truy vết (Trace ID):"}</strong> <code>{selectedError.traceId}</code>
              </div>
            )}
            {selectedError.details && (
              <div>
                <strong>{isEn ? "Stack / Context Details:" : "Thông tin ngoại lệ chi tiết:"}</strong>
                <pre style={{ background: "var(--color-bg)", padding: 10, borderRadius: 6, fontSize: 11, overflowX: "auto", marginTop: 4, maxHeight: 220 }}>
                  {JSON.stringify(selectedError.details, null, 2)}
                </pre>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <Button onClick={() => setSelectedError(null)}>{isEn ? "Close" : "Đóng"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
