import "./admin-dashboard.css";
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { formatRelativeTime } from "../../utils/notifications";
import { useI18n } from "../../i18n";
import {
  type Page,
  type RecentUser,
  type Audit,
  type OperationsOverview,
  type Snapshot,
  metricRoutes,
  cachedSnapshot,
  lastFetchTimestamp,
  CACHE_TTL_MS,
  updateSnapshotCache,
  getActionLabel,
} from "./overviewShared";

export default function AdminDashboardPage() {
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
        authenticatedRequest<OperationsOverview>("/admin/operations").catch(() => null),
      ]);

      const snapshot: Snapshot = {
        counts,
        users: users.items,
        audit: audit.items,
        uptimeSeconds: ops?.uptimeSeconds || 0,
        outboxJobs: ops?.mailJobs || {},
        configuration: ops?.configuration ?? null,
        fetchedAt: new Date().toLocaleTimeString(isEn ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };

      updateSnapshotCache(snapshot);
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
  const totalActiveTickets = openTickets + inProgressTickets;
  const publishedArticles = data ? data.counts[6] : 0;
  const pendingMailJobs = data?.outboxJobs?.["PENDING"] || 0;
  const completedMailJobs = data?.outboxJobs?.["COMPLETED"] || 0;
  const uptimeHours = data ? Math.floor(data.uptimeSeconds / 3600) : 0;
  const uptimeMinutes = data ? Math.floor((data.uptimeSeconds % 3600) / 60) : 0;

  return (
    <div className="admin-page">
      {/* Header with Live Status & Quick Actions */}
      <div className="admin-page-header">
        <div className="admin-header-title-group">
          <div className="admin-live-pulse-badge">
            <span className="live-pulse-dot" />
            <span>{isEn ? "SYSTEM OPERATIONAL · LIVE COMMAND STREAM" : "HỆ THỐNG TRỰC TUYẾN · CƠ SỞ DỮ LIỆU KẾT NỐI SẴN SÀNG"}</span>
          </div>
          <h1>{isEn ? "Administration Command Center" : "Trung tâm điều hành & Quản trị"}</h1>
          <p>
            {isEn
              ? "Mission-critical financial telemetry, user engagement metrics, and administrative governance."
              : "Báo cáo chỉ số hoạt động nền tảng hưu trí, giám sát dữ liệu người dùng và phân luồng tác vụ."}
          </p>
        </div>
        <div className="admin-header-actions">
          {data?.fetchedAt && (
            <span className="admin-sync-time">
              <Icon name="check" size="small" />
              {isEn ? `Synced ${data.fetchedAt}` : `Đồng bộ: ${data.fetchedAt}`}
            </span>
          )}
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
            <Icon name="upload" size="small" />
            {isEn ? "Refresh Feed" : "Cập nhật dữ liệu"}
          </Button>
          <Link to="/admin/reports">
            <Button variant="primary">
              <Icon name="chart" size="small" />
              {isEn ? "Executive Reports" : "Báo cáo chuyên sâu"}
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title={isEn ? "Connection Error" : "Lỗi kết nối dữ liệu"}>
          {error}
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => fetchDashboardData(true)}>
              {isEn ? "Retry Request" : "Thử lại ngay"}
            </Button>
          </div>
        </Alert>
      ) : null}

      {/* Hero KPIs Grid */}
      <div className="admin-stats-grid">
        <Card className="admin-stat-card is-primary-gradient">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Total Registered Users" : "Tổng tài khoản thành viên"}</span>
            <div className="stat-card-icon-pill">
              <Icon name="users" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{loading ? "..." : totalUsers}</strong>
            <Badge tone="success">{isEn ? "Live Active" : "Đang hoạt động"}</Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? `${activeUsers} active members (${activePercent}%) verified` : `${activeUsers} thành viên đã kích hoạt (${activePercent}%)`}
          </p>
          <div className="stat-card-link-bar">
            <Link to="/admin/users">{isEn ? "Manage member database →" : "Xem danh sách người dùng →"}</Link>
          </div>
        </Card>

        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Pending Inquiries" : "Yêu cầu cần hỗ trợ"}</span>
            <div className="stat-card-icon-pill is-warning-pill">
              <Icon name="life-buoy" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{loading ? "..." : totalActiveTickets}</strong>
            {openTickets > 0 ? (
              <Badge tone="danger">{isEn ? `${openTickets} urgent` : `${openTickets} cần xử lý`}</Badge>
            ) : (
              <Badge tone="soft">{isEn ? "Zero Backlog" : "Đã thông suốt"}</Badge>
            )}
          </div>
          <p className="stat-card-sub">
            {isEn ? `${openTickets} unassigned, ${inProgressTickets} in progress` : `${openTickets} chờ phản hồi, ${inProgressTickets} đang xử lý`}
          </p>
          <div className="stat-card-link-bar">
            <Link to="/admin/support">{isEn ? "Open customer support queue →" : "Xử lý hàng đợi hỗ trợ →"}</Link>
          </div>
        </Card>

        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Knowledge Library" : "Bài viết cẩm nang"}</span>
            <div className="stat-card-icon-pill is-info-pill">
              <Icon name="file-text" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{loading ? "..." : publishedArticles}</strong>
            <Badge tone="info">{isEn ? "Published" : "Đã xuất bản"}</Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? "Verified financial literacy articles online" : "Các cẩm nang tài chính hưu trí đã phát hành"}
          </p>
          <div className="stat-card-link-bar">
            <Link to="/admin/content">{isEn ? "Content management center →" : "Quản trị nội dung cẩm nang →"}</Link>
          </div>
        </Card>

        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Platform Heartbeat" : "Trạng thái máy chủ"}</span>
            <div className="stat-card-icon-pill is-emerald-pill">
              <Icon name="shield" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{loading ? "..." : `${uptimeHours}h ${uptimeMinutes}m`}</strong>
            <Badge tone={data ? "success" : "warning"}>{isEn ? "Live" : "Đang chạy"}</Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? `${completedMailJobs} mail jobs delivered, ${pendingMailJobs} queued` : `${completedMailJobs} email gửi thành công, ${pendingMailJobs} đang chờ`}
          </p>
          <div className="stat-card-link-bar">
            <Link to="/admin/settings/audit-log">{isEn ? "View system audit trail →" : "Xem kiểm toán hệ thống →"}</Link>
          </div>
        </Card>
      </div>

      {data ? (
        <>
          {/* Middle Row: Strategic Portfolio & Governance Breakdown */}
          <div className="admin-analytics-row">
            {/* Left: User Lifecycle & Trust Distribution */}
            <Card className="admin-breakdown-card">
              <div className="breakdown-card-header">
                <div>
                  <h2>{isEn ? "Account Verification Distribution" : "Cơ cấu tài khoản & Mức độ tin cậy"}</h2>
                  <p>{isEn ? "Live status partitioning across registered member base" : "Tỷ lệ phân bổ trạng thái tài khoản trong hệ thống"}</p>
                </div>
                <Link to="/admin/users" className="breakdown-action-link">
                  {isEn ? "View users →" : "Xem toàn bộ →"}
                </Link>
              </div>

              {/* Progress bar visual */}
              <div className="status-progress-track">
                <div className="status-progress-seg is-active" style={{ width: `${Math.max(4, activePercent)}%` }} title={`Active: ${activePercent}%`} />
                <div className="status-progress-seg is-pending" style={{ width: `${Math.max(2, pendingPercent)}%` }} title={`Pending: ${pendingPercent}%`} />
                <div className="status-progress-seg is-suspended" style={{ width: `${Math.max(2, suspendedPercent)}%` }} title={`Suspended: ${suspendedPercent}%`} />
              </div>

              <div className="status-metrics-legend">
                <div className="legend-metric-item">
                  <span className="legend-indicator is-active" />
                  <div>
                    <strong>{activeUsers}</strong>
                    <span>{isEn ? `Active (${activePercent}%)` : `Hoạt động (${activePercent}%)`}</span>
                  </div>
                </div>

                <div className="legend-metric-item">
                  <span className="legend-indicator is-pending" />
                  <div>
                    <strong>{pendingUsers}</strong>
                    <span>{isEn ? `Pending OTP (${pendingPercent}%)` : `Chờ xác minh (${pendingPercent}%)`}</span>
                  </div>
                </div>

                <div className="legend-metric-item">
                  <span className="legend-indicator is-suspended" />
                  <div>
                    <strong>{suspendedUsers}</strong>
                    <span>{isEn ? `Suspended (${suspendedPercent}%)` : `Tạm khóa (${suspendedPercent}%)`}</span>
                  </div>
                </div>
              </div>

              <div className="governance-summary-note">
                <Icon name="shield" size="small" />
                <p>
                  {isEn
                    ? "Anti-abuse rate limiting and account locking are enforced automatically by backend security policy."
                    : "Cơ chế bảo vệ chống tấn công mật khẩu và khóa tài khoản tự động được kích hoạt trực tiếp tại tầng bảo mật."}
                </p>
              </div>
            </Card>

            {/* Right: Quick Operational Gateways */}
            <Card className="admin-gateways-card">
              <div className="breakdown-card-header">
                <div>
                  <h2>{isEn ? "Administrative Quick Launch" : "Tác vụ quản trị nhanh"}</h2>
                  <p>{isEn ? "Instant shortcuts to mission-critical operational tools" : "Truy cập nhanh các phân hệ nghiệp vụ trọng tâm"}</p>
                </div>
              </div>

              <div className="gateways-grid">
                <Link to="/admin/financial-config" className="gateway-nav-tile">
                  <div className="gateway-icon-wrap is-navy">
                    <Icon name="target" />
                  </div>
                  <div>
                    <strong>{isEn ? "Financial Benchmarks" : "Giả định tài chính"}</strong>
                    <span>{isEn ? "Inflation & macro returns" : "Tỷ lệ lạm phát & lợi suất quỹ"}</span>
                  </div>
                </Link>

                <Link to="/admin/ai" className="gateway-nav-tile">
                  <div className="gateway-icon-wrap is-purple">
                    <Icon name="sparkles" />
                  </div>
                  <div>
                    <strong>{isEn ? "AI Retirement Assistant" : "Cấu hình Trợ lý AI"}</strong>
                    <span>{isEn ? "LLM policy & prompt rules" : "Chỉ đạo mô hình & tri thức"}</span>
                  </div>
                </Link>

                <Link to="/admin/partners" className="gateway-nav-tile">
                  <div className="gateway-icon-wrap is-emerald">
                    <Icon name="briefcase" />
                  </div>
                  <div>
                    <strong>{isEn ? "Financial Partners" : "Đối tác & Sản phẩm"}</strong>
                    <span>{isEn ? "Pension funds & insurers" : "Quỹ hưu trí & bảo hiểm liên kết"}</span>
                  </div>
                </Link>

                <Link to="/admin/settings" className="gateway-nav-tile">
                  <div className="gateway-icon-wrap is-blue">
                    <Icon name="settings" />
                  </div>
                  <div>
                    <strong>{isEn ? "System Governance" : "Cấu hình hệ thống"}</strong>
                    <span>{isEn ? "Security, 2FA & sessions" : "Bảo mật, 2FA & chính sách"}</span>
                  </div>
                </Link>
              </div>
            </Card>
          </div>

          {/* Bottom Stream Grid: Real-time Telemetry & Recent Entities */}
          <div className="admin-stream-grid">
            {/* Left: Recent User Onboardings */}
            <Card className="admin-stream-card">
              <div className="stream-card-header">
                <div>
                  <h2>{isEn ? "Latest User Registrations" : "Thành viên gia nhập gần đây"}</h2>
                  <p>{isEn ? "Recently onboarded customer accounts" : "Các tài khoản vừa tạo hồ sơ tài chính"}</p>
                </div>
                <Link to="/admin/users" className="stream-view-all-link">
                  {isEn ? "Directory →" : "Danh bạ →"}
                </Link>
              </div>

              <div className="admin-stream-list">
                {data.users.map((u) => (
                  <div key={u.id} className="stream-user-row">
                    <div className="stream-user-avatar">
                      {(u.fullName || u.name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="stream-user-info">
                      <strong className="stream-user-name">{u.fullName || u.name || (isEn ? "Unnamed User" : "Chưa đặt tên")}</strong>
                      <span className="stream-user-email">{u.email}</span>
                    </div>
                    <div className="stream-user-meta">
                      <Badge tone={u.status === "ACTIVE" ? "success" : u.status === "PENDING_VERIFICATION" ? "warning" : "danger"}>
                        {u.status === "ACTIVE" ? (isEn ? "Active" : "Hoạt động") : u.status === "PENDING_VERIFICATION" ? (isEn ? "Pending" : "Chờ kích hoạt") : (isEn ? "Suspended" : "Bị khóa")}
                      </Badge>
                      <small className="stream-user-time">{formatRelativeTime(u.createdAt, isEn)}</small>
                    </div>
                  </div>
                ))}
                {!data.users.length && (
                  <p className="stream-empty-text">{isEn ? "No recent users registered." : "Chưa có thành viên nào đăng ký gần đây."}</p>
                )}
              </div>
            </Card>

            {/* Right: Recent Operational Activities & Engine Diagnostics */}
            <Card className="admin-stream-card">
              <div className="stream-card-header">
                <div>
                  <h2>{isEn ? "Live Audit Operations" : "Nhật ký vận hành & Thao tác"}</h2>
                  <p>{isEn ? "Real-time security events & administrative audits" : "Các tác vụ quản trị và xác thực hệ thống"}</p>
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

              {/* Service Health Matrix Row */}
              <div className="service-matrix-row">
                <div className="service-matrix-item">
                  <span className={`service-status-dot ${data?.configuration !== null ? "is-online" : ""}`} />
                  <span>{isEn ? `Database: ${data?.configuration !== null ? "Connected" : "—"}` : `Cơ sở dữ liệu: ${data?.configuration !== null ? "Kết nối" : "—"}`}</span>
                </div>
                <div className="service-matrix-item">
                  <span className={`service-status-dot ${data?.configuration?.email ? "is-online" : ""}`} />
                  <span>{isEn ? `SMTP: ${data?.configuration?.email ? "Configured" : "Not set"}` : `SMTP: ${data?.configuration?.email ? "Đã cấu hình" : "Chưa cấu hình"}`}</span>
                </div>
                <div className="service-matrix-item">
                  <span className="service-status-dot" />
                  <span>{isEn ? `Outbox: ${completedMailJobs} sent` : `Outbox: ${completedMailJobs} đã gửi`}</span>
                </div>
                <div className="service-matrix-item">
                  <span className={`service-status-dot ${data?.configuration?.encryption ? "is-online" : ""}`} />
                  <span>{isEn ? `Encryption: ${data?.configuration?.encryption ? "Active" : "Not set"}` : `Mã hóa: ${data?.configuration?.encryption ? "Đang hoạt động" : "Chưa cấu hình"}`}</span>
                </div>
              </div>

              <div className="stream-card-footer">
                <Link to="/admin/settings/audit-log" className="stream-health-cta">
                  <Icon name="shield" size="small" />
                  <span>{isEn ? "View System Audit Trail & Logs →" : "Xem log hệ thống →"}</span>
                </Link>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
