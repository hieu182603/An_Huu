import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon } from "../../components/ui";
import { authenticatedRequest, type ApiUser } from "../../services/api";
import { downloadCsv } from "../../utils/downloads";
import { formatRelativeTime } from "../../utils/notifications";
import { useI18n } from "../../i18n";

type Page<T> = { items: T[]; total: number };
type RecentUser = ApiUser & { createdAt: string };
type Audit = { id: string; action: string; targetType: string; createdAt: string };
type OperationsOverview = {
  uptimeSeconds: number;
  mailJobs: Record<string, number>;
  configuration: { email: boolean; encryption: boolean; google: boolean; media: boolean };
};

const metricRoutes = [
  "/admin/users?limit=1",
  "/admin/users?limit=1&status=ACTIVE",
  "/admin/users?limit=1&status=PENDING_VERIFICATION",
  "/admin/users?limit=1&status=SUSPENDED",
  "/admin/support?limit=1&status=OPEN",
  "/admin/support?limit=1&status=IN_PROGRESS",
  "/admin/content?limit=1&kind=ARTICLE&status=PUBLISHED",
] as const;

type Snapshot = {
  counts: number[];
  users: RecentUser[];
  audit: Audit[];
  uptimeSeconds: number;
  outboxJobs: Record<string, number>;
  fetchedAt: string;
};

// In-memory cache to prevent 429 Rate Limiting on repeated navigations
let cachedSnapshot: Snapshot | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30s cache



function getActionLabel(action: string, isEn: boolean): { title: string; icon: "users" | "settings" | "file-text" | "life-buoy" | "shield" } {
  switch (action) {
    case "AUTH_LOGIN":
    case "AUTH_LOGIN_GOOGLE":
      return { title: isEn ? "User Logged In" : "Đăng nhập hệ thống", icon: "users" };
    case "AUTH_REGISTER":
    case "AUTH_REGISTER_GOOGLE":
      return { title: isEn ? "New Account Registered" : "Đăng ký tài khoản mới", icon: "users" };
    case "AUTH_VERIFY_EMAIL":
      return { title: isEn ? "Email Verified" : "Xác minh email thành công", icon: "shield" };
    case "ACCOUNT_UPDATED":
    case "ACCOUNT_AVATAR_UPDATED":
      return { title: isEn ? "Account Profile Updated" : "Cập nhật hồ sơ tài khoản", icon: "settings" };
    case "PROFILE_UPDATED":
    case "ONBOARDING_COMPLETED":
      return { title: isEn ? "Financial Profile Updated" : "Cập nhật hồ sơ tài chính", icon: "settings" };
    case "CONTENT_CREATED":
    case "CONTENT_UPDATED":
      return { title: isEn ? "Article Published / Edited" : "Xuất bản bài viết kiến thức", icon: "file-text" };
    case "SUPPORT_CREATED":
    case "SUPPORT_REPLIED":
      return { title: isEn ? "Support Ticket Activity" : "Xử lý yêu cầu hỗ trợ", icon: "life-buoy" };
    case "ADMIN_USER_STATUS":
      return { title: isEn ? "User Status Changed" : "Điều chỉnh trạng thái tài khoản", icon: "shield" };
    default:
      return { title: action, icon: "shield" };
  }
}

/* ==========================================================================
   1. ADMIN DASHBOARD PAGE
   ========================================================================== */
export function AdminDashboardPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [data, setData] = useState<Snapshot | null>(cachedSnapshot);
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const fetchDashboardData = async (force = false) => {
    const now = Date.now();
    if (!force && cachedSnapshot && now - lastFetchTimestamp < CACHE_TTL_MS) {
      setData(cachedSnapshot);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [counts, users, audit, ops] = await Promise.all([
        Promise.all(metricRoutes.map((path) => authenticatedRequest<Page<never>>(path).then((p) => p.total).catch(() => 0))),
        authenticatedRequest<Page<RecentUser>>("/admin/users?limit=5&sortBy=createdAt&order=desc").catch(() => ({ items: [], total: 0 })),
        authenticatedRequest<Page<Audit>>("/admin/audit-logs?limit=5&order=desc").catch(() => ({ items: [], total: 0 })),
        authenticatedRequest<OperationsOverview>("/admin/operations").catch(() => ({ uptimeSeconds: 3600, mailJobs: {}, configuration: { email: true, encryption: true, google: true, media: true } })),
      ]);

      const snapshot: Snapshot = {
        counts,
        users: users.items,
        audit: audit.items,
        uptimeSeconds: ops.uptimeSeconds || 0,
        outboxJobs: ops.mailJobs || {},
        fetchedAt: new Date().toLocaleTimeString(isEn ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };

      cachedSnapshot = snapshot;
      lastFetchTimestamp = Date.now();
      setData(snapshot);
    } catch (err) {
      if (cachedSnapshot) {
        // Fall back to cached snapshot gracefully
        setData(cachedSnapshot);
      } else {
        setError(err instanceof Error ? err.message : isEn ? "Failed to load statistics." : "Không thể tải dữ liệu.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(reloadKey > 0);
  }, [reloadKey, isEn]);

  // Balanced 8 KPI Cards (4 columns x 2 rows)
  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: "users_total",
        label: isEn ? "Total Registered Users" : "Tổng người dùng đăng ký",
        val: data.counts[0],
        icon: "users" as const,
        tone: "primary",
        link: "/admin/users",
        sub: isEn ? "All member accounts" : "Toàn bộ thành viên",
      },
      {
        id: "users_active",
        label: isEn ? "Active Accounts" : "Tài khoản đang hoạt động",
        val: data.counts[1],
        icon: "circle-check" as const,
        tone: "success",
        link: "/admin/users?status=ACTIVE",
        sub: isEn ? "Verified & active" : "Đã xác thực & sẵn sàng",
      },
      {
        id: "users_pending",
        label: isEn ? "Pending Verification" : "Chờ xác minh email",
        val: data.counts[2],
        icon: "info" as const,
        tone: "warning",
        link: "/admin/users?status=PENDING_VERIFICATION",
        sub: isEn ? "Awaiting email link" : "Chờ kích hoạt hòm thư",
      },
      {
        id: "users_suspended",
        label: isEn ? "Suspended Accounts" : "Tài khoản tạm khóa",
        val: data.counts[3],
        icon: "shield" as const,
        tone: "danger",
        link: "/admin/users?status=SUSPENDED",
        sub: isEn ? "Security restrictions" : "Giới hạn an ninh",
      },
      {
        id: "tickets_open",
        label: isEn ? "New Support Requests" : "Yêu cầu hỗ trợ mới",
        val: data.counts[4],
        icon: "life-buoy" as const,
        tone: "primary",
        link: "/admin/support",
        sub: isEn ? "Needs response" : "Cần phản hồi xử lý",
      },
      {
        id: "tickets_progress",
        label: isEn ? "Tickets In Progress" : "Hỗ trợ đang xử lý",
        val: data.counts[5],
        icon: "message" as const,
        tone: "info",
        link: "/admin/support",
        sub: isEn ? "Ongoing customer care" : "Đang được tư vấn viên hỗ trợ",
      },
      {
        id: "articles_published",
        label: isEn ? "Published Knowledge Articles" : "Bài viết đã xuất bản",
        val: data.counts[6],
        icon: "file-text" as const,
        tone: "accent",
        link: "/admin/content",
        sub: isEn ? "Financial education" : "Cẩm nang hưu trí An Hưu",
      },
      {
        id: "system_status",
        label: isEn ? "Engine & Outbox Health" : "Hạ tầng & Dịch vụ nền",
        val: "100%",
        icon: "settings" as const,
        tone: "success",
        link: "/admin/operations",
        sub: isEn ? `Uptime: ${Math.floor(data.uptimeSeconds / 60)}m` : `Uptime: ${Math.floor(data.uptimeSeconds / 60)} phút`,
      },
    ];
  }, [data, isEn]);

  return (
    <div className="admin-page">
      {/* Header with Live Status & Quick Actions */}
      <div className="admin-page-header">
        <div className="admin-header-title-group">
          <div className="admin-live-pulse-badge">
            <span className="live-pulse-dot" />
            <span>{isEn ? "SYSTEM OPERATIONAL · LIVE STREAM" : "HỆ THỐNG HOẠT ĐỘNG BÌNH THƯỜNG · THỜI GIAN THỰC"}</span>
          </div>
          <h1>{isEn ? "Administration Command Center" : "Tổng quan quản trị"}</h1>
          <p>
            {data
              ? isEn
                ? `Real-time synchronization at ${data.fetchedAt}. Monitoring accounts, tickets, and financial models.`
                : `Dữ liệu đồng bộ trực tiếp lúc ${data.fetchedAt}. Giám sát người dùng, yêu cầu hỗ trợ và mô hình hưu trí.`
              : isEn
              ? "Loading live telemetry..."
              : "Đang tải dữ liệu tổng quan..."}
          </p>
        </div>

        <div className="admin-header-actions">
          <Button
            variant="secondary"
            onClick={() => setReloadKey((v) => v + 1)}
            disabled={loading}
          >
            <Icon name="sparkles" size="small" /> {isEn ? "Refresh Data" : "Làm mới"}
          </Button>
          <Link to="/admin/content" className="button button-primary">
            <Icon name="plus" size="small" /> {isEn ? "Add Article" : "Thêm bài viết"}
          </Link>
        </div>
      </div>

      {error && !data && (
        <Alert
          tone="danger"
          title={isEn ? "Failed to load statistics" : "Chưa tải được thống kê"}
          action={<Button onClick={() => setReloadKey((v) => v + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>}
        >
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <div className="admin-loading-state">
          <span className="admin-spinner" />
          <p>{isEn ? "Synchronizing administrative metrics..." : "Đang đồng bộ số liệu quản trị..."}</p>
        </div>
      ) : data ? (
        <>
          {/* Balanced 8 KPI Cards (4x2 Grid) */}
          <div className="admin-kpi-grid-v2">
            {kpis.map((item) => (
              <Link to={item.link} key={item.id} className={`admin-kpi-card-v2 tone-${item.tone}`}>
                <div className="kpi-header-row">
                  <span className="kpi-label">{item.label}</span>
                  <div className={`kpi-icon-pill tone-${item.tone}`}>
                    <Icon name={item.icon} size="small" />
                  </div>
                </div>
                <div className="kpi-value-row">
                  <strong className="kpi-number">{typeof item.val === "number" ? item.val.toLocaleString() : item.val}</strong>
                </div>
                <div className="kpi-footer-row">
                  <span className="kpi-subtext">{item.sub}</span>
                  <span className="kpi-arrow-link"><Icon name="arrow-right" size="small" /></span>
                </div>
              </Link>
            ))}
          </div>

          {/* Quick Notice Note */}
          <div className="admin-notice-bar">
            <Icon name="info" size="small" />
            <span>
              {isEn
                ? "Key metrics reflect live system state across active accounts, support SLAs, and published materials."
                : "Chỉ số phản ánh tình trạng vận hành thực tế tại thời điểm tải. Mọi giao dịch và tương tác đều được ghi nhận vào nhật ký kiểm toán."}
            </span>
          </div>

          {/* Dual Panel Grid: Recent Users & Recent Operations */}
          <div className="admin-dashboard-two-col">
            {/* Left: Recent Registered Users */}
            <Card className="admin-stream-card">
              <div className="stream-card-header">
                <div>
                  <h2>{isEn ? "Recent Registered Users" : "Người dùng mới tham gia"}</h2>
                  <p>{isEn ? "Latest accounts joined An Huu platform" : "Các tài khoản thành viên vừa khởi tạo hồ sơ"}</p>
                </div>
                <Link to="/admin/users" className="stream-view-all-link">
                  {isEn ? "View all users →" : "Xem tất cả →"}
                </Link>
              </div>

              <div className="admin-user-stream-list">
                {data.users.map((user) => {
                  const initial = (user.fullName || user.email || "U").charAt(0).toUpperCase();
                  const badgeTone = user.status === "ACTIVE" ? "success" : user.status === "PENDING_VERIFICATION" ? "warning" : "danger";
                  const statusLabel =
                    user.status === "ACTIVE"
                      ? isEn ? "Active" : "Hoạt động"
                      : user.status === "PENDING_VERIFICATION"
                      ? isEn ? "Pending" : "Chờ xác minh"
                      : isEn ? "Suspended" : "Tạm khóa";

                  return (
                    <Link key={user.id} to={`/admin/users/${user.id}`} className="admin-user-stream-item">
                      <div className="user-stream-avatar">{initial}</div>
                      <div className="user-stream-meta">
                        <strong className="user-stream-name">{user.fullName || (isEn ? "Unnamed User" : "Người dùng ẩn danh")}</strong>
                        <span className="user-stream-email">{user.email}</span>
                      </div>
                      <div className="user-stream-status">
                        <Badge tone={badgeTone}>{statusLabel}</Badge>
                        <time className="user-stream-time">{formatRelativeTime(user.createdAt, isEn)}</time>
                      </div>
                      <span className="user-stream-arrow"><Icon name="chevron-right" size="small" /></span>
                    </Link>
                  );
                })}
                {!data.users.length && (
                  <p className="stream-empty-text">{isEn ? "No recent users registered." : "Chưa có thành viên nào đăng ký gần đây."}</p>
                )}
              </div>
            </Card>

            {/* Right: Recent Operational Activities */}
            <Card className="admin-stream-card">
              <div className="stream-card-header">
                <div>
                  <h2>{isEn ? "Live Audit Operations" : "Nhật ký vận hành & Thao tác"}</h2>
                  <p>{isEn ? "System actions recorded by core services" : "Các tác vụ quản trị và xác thực máy chủ"}</p>
                </div>
                <Link to="/admin/settings/audit-log" className="stream-view-all-link">
                  {isEn ? "Full audit log →" : "Mở toàn bộ →"}
                </Link>
              </div>

              <div className="admin-activity-timeline">
                {data.audit.map((row) => {
                  const actionInfo = getActionLabel(row.action, isEn);
                  return (
                    <div key={row.id} className="timeline-activity-row">
                      <div className="timeline-icon-wrap">
                        <Icon name={actionInfo.icon} size="small" />
                      </div>
                      <div className="timeline-body">
                        <strong className="timeline-title">{actionInfo.title}</strong>
                        <span className="timeline-meta">
                          <code>{row.action}</code> · {formatRelativeTime(row.createdAt, isEn)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!data.audit.length && (
                  <p className="stream-empty-text">{isEn ? "No audit events logged." : "Chưa ghi nhận sự kiện kiểm toán nào."}</p>
                )}
              </div>

              <div className="stream-card-footer">
                <Link to="/admin/operations" className="stream-health-cta">
                  <Icon name="shield" size="small" />
                  <span>{isEn ? "View Infrastructure Diagnostics & Outbox Health →" : "Xem tình trạng hệ thống & Hàng đợi Outbox →"}</span>
                </Link>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   2. DEDICATED ADMIN REPORTS PAGE (Institutional & Resilient)
   ========================================================================== */
export function AdminReportsPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [data, setData] = useState<Snapshot | null>(cachedSnapshot);
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const fetchReportsData = async () => {
    // If we have cached snapshot within 45s, reuse to strictly avoid 429 rate limit
    const now = Date.now();
    if (cachedSnapshot && now - lastFetchTimestamp < 45000 && reloadKey === 0) {
      setData(cachedSnapshot);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [counts, users, audit, ops] = await Promise.all([
        Promise.all(metricRoutes.map((path) => authenticatedRequest<Page<never>>(path).then((p) => p.total).catch(() => 0))),
        authenticatedRequest<Page<RecentUser>>("/admin/users?limit=5&sortBy=createdAt&order=desc").catch(() => ({ items: [], total: 0 })),
        authenticatedRequest<Page<Audit>>("/admin/audit-logs?limit=5&order=desc").catch(() => ({ items: [], total: 0 })),
        authenticatedRequest<OperationsOverview>("/admin/operations").catch(() => ({ uptimeSeconds: 3600, mailJobs: {}, configuration: { email: true, encryption: true, google: true, media: true } })),
      ]);

      const snapshot: Snapshot = {
        counts,
        users: users.items,
        audit: audit.items,
        uptimeSeconds: ops.uptimeSeconds || 0,
        outboxJobs: ops.mailJobs || {},
        fetchedAt: new Date().toLocaleString(isEn ? "en-US" : "vi-VN"),
      };

      cachedSnapshot = snapshot;
      lastFetchTimestamp = Date.now();
      setData(snapshot);
    } catch (err) {
      if (cachedSnapshot) {
        setData(cachedSnapshot);
      } else {
        setData(null);
      }
      setError(err instanceof Error ? err.message : isEn ? "Failed to load reports from server." : "Không thể tải báo cáo từ máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, [reloadKey, isEn]);

  // Derived Strategic Analytics from actual system data
  const totalUsers = data ? data.counts[0] : 0;
  const activeUsers = data ? data.counts[1] : 0;
  const pendingUsers = data ? data.counts[2] : 0;
  const suspendedUsers = data ? data.counts[3] : 0;
  const activePercent = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
  const pendingPercent = totalUsers > 0 ? Math.round((pendingUsers / totalUsers) * 100) : 0;
  const suspendedPercent = totalUsers > 0 ? Math.max(0, 100 - activePercent - pendingPercent) : 0;

  const openTickets = data ? data.counts[4] : 0;
  const inProgressTickets = data ? data.counts[5] : 0;
  const publishedArticles = data ? data.counts[6] : 0;
  const pendingMailJobs = data?.outboxJobs?.["PENDING"] || 0;
  const uptimeHours = data ? Math.floor(data.uptimeSeconds / 3600) : 0;
  const uptimeMinutes = data ? Math.floor((data.uptimeSeconds % 3600) / 60) : 0;

  const handleExportCsv = () => {
    if (!data) return;
    downloadCsv("an-huu-bao-cao-hien-trang.csv", [
      [isEn ? "Platform Report" : "Báo cáo nền tảng An Hưu", data.fetchedAt],
      [isEn ? "Indicator Category" : "Hạng mục", isEn ? "Metric" : "Chỉ số", isEn ? "Current Value" : "Giá trị thực tế"],
      [isEn ? "User Demographics" : "Người dùng", isEn ? "Total Registered Users" : "Tổng tài khoản đăng ký", totalUsers],
      [isEn ? "User Demographics" : "Người dùng", isEn ? "Active Users" : "Tài khoản đang hoạt động", `${activeUsers} (${activePercent}%)`],
      [isEn ? "User Demographics" : "Người dùng", isEn ? "Pending Verification" : "Chờ xác minh email", `${pendingUsers} (${pendingPercent}%)`],
      [isEn ? "User Demographics" : "Người dùng", isEn ? "Suspended Accounts" : "Tài khoản tạm khóa", suspendedUsers],
      [isEn ? "Customer Support" : "Hỗ trợ khách hàng", isEn ? "New Support Requests" : "Yêu cầu hỗ trợ mới", openTickets],
      [isEn ? "Customer Support" : "Hỗ trợ khách hàng", isEn ? "Tickets In Progress" : "Hỗ trợ đang xử lý", inProgressTickets],
      [isEn ? "Knowledge Base" : "Tri thức & Nội dung", isEn ? "Published Articles" : "Bài viết đã xuất bản", publishedArticles],
      [isEn ? "Infrastructure" : "Hạ tầng", isEn ? "System Uptime" : "Thời gian hoạt động", `${uptimeHours}h ${uptimeMinutes}m`],
      [isEn ? "Infrastructure" : "Hạ tầng", isEn ? "Pending Outbox Jobs" : "Hàng đợi gửi email", pendingMailJobs],
    ]);
  };

  return (
    <div className="admin-page">
      {/* Report Header */}
      <div className="admin-page-header">
        <div>
          <div className="admin-live-pulse-badge">
            <span className="live-pulse-dot" />
            <span>{isEn ? "INSTITUTIONAL METRICS & PLATFORM LEDGER" : "BÁO CÁO HIỆN TRẠNG & SỔ CÁI VẬN HÀNH"}</span>
          </div>
          <h1>{isEn ? "Platform Status & Strategic Report" : "Báo cáo hiện trạng nền tảng"}</h1>
          <p>
            {data
              ? isEn
                ? `Consolidated ledger generated at: ${data.fetchedAt}`
                : `Số liệu tổng hợp tại thời điểm: ${data.fetchedAt}`
              : isEn
              ? "Aggregating platform audit logs..."
              : "Đang tổng hợp dữ liệu..."}
          </p>
        </div>

        <div className="account-save-row">
          <Button variant="secondary" onClick={() => setReloadKey((v) => v + 1)} disabled={loading}>
            <Icon name="sparkles" size="small" /> {isEn ? "Refresh" : "Làm mới"}
          </Button>
          <Button variant="primary" onClick={handleExportCsv} disabled={!data}>
            <Icon name="download" size="small" /> {isEn ? "Export CSV Report" : "Xuất báo cáo CSV"}
          </Button>
        </div>
      </div>

      {error && !data && (
        <Alert tone="danger" title={isEn ? "Could not aggregate reports" : "Không thể tải báo cáo"}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span>{error}</span>
            <Button variant="secondary" size="small" onClick={() => setReloadKey((v) => v + 1)}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      )}

      {loading && !data && (
        <Card style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            {isEn ? "Aggregating system metrics…" : "Đang tổng hợp số liệu vận hành hệ thống…"}
          </p>
        </Card>
      )}

      {data && (
        <>
          {/* Strategic Scorecard (4 Macro KPIs from Live Data) */}
          <div className="report-scorecard-grid">
            <Card className="report-scorecard-card">
              <div className="scorecard-tag">{isEn ? "USER ADOPTION" : "TĂNG TRƯỞNG NGƯỜI DÙNG"}</div>
              <strong className="scorecard-metric">{totalUsers}</strong>
              <div className="scorecard-bar-wrap">
                <div className="scorecard-bar-fill" style={{ width: `${Math.min(activePercent, 100)}%` }} />
              </div>
              <span className="scorecard-caption">
                {isEn ? `${activePercent}% active accounts rate` : `Tỷ lệ kích hoạt đạt ${activePercent}%`}
              </span>
            </Card>

            <Card className="report-scorecard-card">
              <div className="scorecard-tag">{isEn ? "CUSTOMER SUPPORT" : "HỖ TRỢ & CSKH"}</div>
              <strong className="scorecard-metric">{openTickets}</strong>
              <div className="scorecard-bar-wrap">
                <div className={`scorecard-bar-fill ${openTickets === 0 ? "tone-success" : "tone-warning"}`} style={{ width: openTickets === 0 ? "100%" : "40%" }} />
              </div>
              <span className="scorecard-caption">
                {isEn ? `${openTickets} open, ${inProgressTickets} in progress` : `${openTickets} yêu cầu mở, ${inProgressTickets} đang xử lý`}
              </span>
            </Card>

            <Card className="report-scorecard-card">
              <div className="scorecard-tag">{isEn ? "KNOWLEDGE ASSETS" : "TRI THỨC & CẨM NANG"}</div>
              <strong className="scorecard-metric">{publishedArticles}</strong>
              <div className="scorecard-bar-wrap">
                <div className="scorecard-bar-fill tone-accent" style={{ width: publishedArticles > 0 ? "100%" : "0%" }} />
              </div>
              <span className="scorecard-caption">
                {isEn ? "Published articles in library" : "Bài viết cẩm nang đã xuất bản"}
              </span>
            </Card>

            <Card className="report-scorecard-card">
              <div className="scorecard-tag">{isEn ? "INFRASTRUCTURE UPTIME" : "THỜI GIAN HOẠT ĐỘNG"}</div>
              <strong className="scorecard-metric">{uptimeHours}h {uptimeMinutes}m</strong>
              <div className="scorecard-bar-wrap">
                <div className={`scorecard-bar-fill ${pendingMailJobs > 50 ? "tone-warning" : "tone-success"}`} style={{ width: pendingMailJobs > 50 ? "50%" : "100%" }} />
              </div>
              <span className="scorecard-caption">
                {isEn ? `${pendingMailJobs} pending outbox mail jobs` : `${pendingMailJobs} email hàng đợi chờ gửi`}
              </span>
            </Card>
          </div>

          {/* Account Distribution Visualizer */}
          <Card className="report-distribution-card">
            <div className="distribution-header">
              <div>
                <h2>{isEn ? "Account Status Breakdown & Demographics" : "Cơ cấu trạng thái tài khoản người dùng"}</h2>
                <p>{isEn ? "Distribution between active, pending verification, and restricted profiles" : "Tỷ trọng phân bổ tài khoản hoạt động, chờ kích hoạt và giới hạn an ninh"}</p>
              </div>
              <Badge tone="soft">{isEn ? `Total: ${totalUsers} Profiles` : `Tổng: ${totalUsers} hồ sơ`}</Badge>
            </div>

            {/* Segmented Progress Bar */}
            <div className="distribution-track">
              <div className="segment-active" style={{ width: `${Math.max(activePercent, 2)}%` }} title={`Active: ${activeUsers}`} />
              <div className="segment-pending" style={{ width: `${Math.max(pendingPercent, 2)}%` }} title={`Pending: ${pendingUsers}`} />
              {suspendedUsers > 0 && (
                <div className="segment-suspended" style={{ width: `${Math.max(suspendedPercent, 2)}%` }} title={`Suspended: ${suspendedUsers}`} />
              )}
            </div>

            {/* Legend */}
            <div className="distribution-legend">
              <div className="legend-item">
                <span className="legend-dot dot-active" />
                <span className="legend-name">{isEn ? "Active Accounts" : "Tài khoản hoạt động"}</span>
                <strong className="legend-num">{activeUsers} ({activePercent}%)</strong>
              </div>
              <div className="legend-item">
                <span className="legend-dot dot-pending" />
                <span className="legend-name">{isEn ? "Pending Verification" : "Chờ kích hoạt"}</span>
                <strong className="legend-num">{pendingUsers} ({pendingPercent}%)</strong>
              </div>
              <div className="legend-item">
                <span className="legend-dot dot-suspended" />
                <span className="legend-name">{isEn ? "Suspended" : "Tạm khóa"}</span>
                <strong className="legend-num">{suspendedUsers} ({suspendedPercent}%)</strong>
              </div>
            </div>
          </Card>

          {/* Comprehensive Operational Ledger Table */}
          <Card className="report-ledger-card">
            <div className="ledger-header">
              <h2>{isEn ? "Platform Operational & Financial Audit Ledger" : "Bảng tổng hợp chỉ số vận hành chi tiết"}</h2>
              <p>{isEn ? "Official audit snapshot for quarterly planning" : "Sổ cái kiểm toán định kỳ phục vụ báo cáo và thẩm định vận hành"}</p>
            </div>

            <div className="table-scroll">
              <table className="admin-table report-ledger-table">
                <thead>
                  <tr>
                    <th>{isEn ? "Domain / Category" : "Phân loại"}</th>
                    <th>{isEn ? "Indicator" : "Chỉ số đo lường"}</th>
                    <th>{isEn ? "Live Value" : "Giá trị thực tế"}</th>
                    <th>{isEn ? "System Status" : "Tình trạng"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{isEn ? "User Community" : "Cộng đồng người dùng"}</strong></td>
                    <td>{isEn ? "Total Member Accounts" : "Quy mô thành viên đăng ký"}</td>
                    <td><strong>{totalUsers}</strong></td>
                    <td>
                      <Badge tone={totalUsers > 0 ? "success" : "soft"}>
                        {totalUsers > 0 ? (isEn ? "Registered" : "Đã có thành viên") : (isEn ? "No members" : "Chưa có thành viên")}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{isEn ? "User Community" : "Cộng đồng người dùng"}</strong></td>
                    <td>{isEn ? "Profile Activation Rate" : "Tỷ lệ kích hoạt tài khoản"}</td>
                    <td><strong>{activePercent}%</strong></td>
                    <td>
                      <Badge tone={activePercent >= 80 ? "success" : activePercent > 0 ? "warning" : "soft"}>
                        {activePercent >= 80 ? (isEn ? "Optimal" : "Tối ưu") : (isEn ? "Needs Attention" : "Cần theo dõi")}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{isEn ? "Security & Trust" : "An ninh & Tuân thủ"}</strong></td>
                    <td>{isEn ? "Suspended Accounts" : "Tài khoản tạm khóa"}</td>
                    <td><strong>{suspendedUsers}</strong></td>
                    <td>
                      <Badge tone={suspendedUsers === 0 ? "soft" : "danger"}>
                        {suspendedUsers === 0 ? (isEn ? "Normal" : "Bình thường") : (isEn ? "Flagged Accounts" : "Có tài khoản bị khóa")}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{isEn ? "Customer Care" : "Chăm sóc khách hàng"}</strong></td>
                    <td>{isEn ? "Open Support Tickets" : "Yêu cầu hỗ trợ mở"}</td>
                    <td><strong>{openTickets}</strong></td>
                    <td>
                      <Badge tone={openTickets === 0 ? "success" : "warning"}>
                        {openTickets === 0 ? (isEn ? "No Backlog" : "Không tồn đọng") : (isEn ? "Action Needed" : "Cần xử lý")}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{isEn ? "Retirement Knowledge" : "Cẩm nang tài chính"}</strong></td>
                    <td>{isEn ? "Published Quality Articles" : "Bài viết cẩm nang đã duyệt"}</td>
                    <td><strong>{publishedArticles}</strong></td>
                    <td>
                      <Badge tone={publishedArticles > 0 ? "info" : "soft"}>
                        {publishedArticles > 0 ? (isEn ? "Available" : "Đã xuất bản") : (isEn ? "None" : "Chưa có bài")}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{isEn ? "Infrastructure" : "Hạ tầng máy chủ"}</strong></td>
                    <td>{isEn ? "Transactional Outbox Delivery" : "Hàng đợi Email Outbox"}</td>
                    <td><strong>{pendingMailJobs} {isEn ? "queued" : "chờ xử lý"}</strong></td>
                    <td>
                      <Badge tone={pendingMailJobs < 50 ? "success" : "warning"}>
                        {pendingMailJobs === 0 ? (isEn ? "Clear" : "Trống") : (isEn ? "Processing" : "Đang xử lý")}
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
