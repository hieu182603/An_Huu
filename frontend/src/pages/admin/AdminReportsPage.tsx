import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { downloadCsv } from "../../utils/downloads";
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
  updateSnapshotCache,
} from "./overviewShared";

export default function AdminReportsPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [data, setData] = useState<Snapshot | null>(cachedSnapshot);
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const fetchReportsData = async () => {
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
        authenticatedRequest<OperationsOverview>("/admin/operations").catch(() => null),
      ]);

      const snapshot: Snapshot = {
        counts,
        users: users.items,
        audit: audit.items,
        uptimeSeconds: ops?.uptimeSeconds || 0,
        outboxJobs: ops?.mailJobs || {},
        configuration: ops?.configuration ?? null,
        fetchedAt: new Date().toLocaleString(isEn ? "en-US" : "vi-VN"),
      };

      updateSnapshotCache(snapshot);
      setData(snapshot);
    } catch (err) {
      if (cachedSnapshot) {
        setData(cachedSnapshot);
      } else {
        setError(err instanceof Error ? err.message : isEn ? "Failed to generate report." : "Không thể tạo báo cáo.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, [reloadKey, isEn]);

  const totalUsers = data ? data.counts[0] : 0;
  const activeUsers = data ? data.counts[1] : 0;
  const pendingUsers = data ? data.counts[2] : 0;
  const suspendedUsers = data ? data.counts[3] : 0;
  const openTickets = data ? data.counts[4] : 0;
  const inProgressTickets = data ? data.counts[5] : 0;
  const publishedArticles = data ? data.counts[6] : 0;
  const pendingMailJobs = data?.outboxJobs?.["PENDING"] || 0;
  const completedMailJobs = data?.outboxJobs?.["COMPLETED"] || 0;
  const uptimeHours = data ? Math.floor(data.uptimeSeconds / 3600) : 0;
  const uptimeMinutes = data ? Math.floor((data.uptimeSeconds % 3600) / 60) : 0;

  const exportExecutiveReport = () => {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      ["Metric", "Value", "Status"],
      ["Total Registered Users", totalUsers, "Audit Confirmed"],
      ["Active Verified Users", activeUsers, "Operational"],
      ["Pending Verification Users", pendingUsers, "Pending"],
      ["Suspended Accounts", suspendedUsers, "Restricted"],
      ["Open Support Inquiries", openTickets, openTickets > 0 ? "Action Required" : "Zero"],
      ["In Progress Support Inquiries", inProgressTickets, "Ongoing"],
      ["Published Financial Articles", publishedArticles, "Public"],
      ["Delivered Outbox Messages", completedMailJobs, "Delivered"],
      ["Pending Mail Queue", pendingMailJobs, "Queued"],
      ["Platform Uptime Seconds", data.uptimeSeconds, "Continuous"],
    ];
    downloadCsv("an-huu-executive-operations-report.csv", rows);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div className="admin-header-title-group">
          <div className="admin-breadcrumb-line">
            <Link to="/admin/dashboard">{isEn ? "← Back to Command Center" : "← Quay lại Tổng quan"}</Link>
          </div>
          <h1>{isEn ? "Executive Operations & Auditing Report" : "Báo cáo vận hành & Kiểm toán chuyên sâu"}</h1>
          <p>
            {isEn
              ? "Comprehensive operational verification data, user demographics, and systemic governance metrics."
              : "Dữ liệu đối soát hệ thống, cơ cấu người dùng và các chỉ số đảm bảo an toàn vận hành nền tảng."}
          </p>
        </div>
        <div className="admin-header-actions">
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
            <Icon name="upload" size="small" />
            {isEn ? "Re-audit Data" : "Đối soát lại"}
          </Button>
          <Button variant="primary" onClick={exportExecutiveReport} disabled={!data || loading}>
            <Icon name="download" size="small" />
            {isEn ? "Export Executive CSV" : "Xuất báo cáo CSV"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title={isEn ? "Audit Generation Error" : "Lỗi tổng hợp báo cáo"}>
          {error}
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => fetchReportsData()}>
              {isEn ? "Retry" : "Thử lại"}
            </Button>
          </div>
        </Alert>
      ) : null}

      {/* Report Summary Cards */}
      <div className="admin-stats-grid">
        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Member Base Health" : "Chỉ số hoàn thiện hồ sơ"}</span>
            <div className="stat-card-icon-pill">
              <Icon name="users" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{totalUsers > 0 ? `${Math.round((activeUsers / totalUsers) * 100)}%` : "0%"}</strong>
            <Badge tone="success">{isEn ? "Healthy" : "Đạt chuẩn"}</Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? `${activeUsers} active of ${totalUsers} total members` : `${activeUsers} người dùng kích hoạt trên tổng số ${totalUsers}`}
          </p>
        </Card>

        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Inquiry Clearance Rate" : "Tỷ lệ xử lý hỗ trợ"}</span>
            <div className="stat-card-icon-pill is-warning-pill">
              <Icon name="life-buoy" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{openTickets === 0 ? "100%" : `${Math.max(0, 100 - openTickets * 10)}%`}</strong>
            <Badge tone={openTickets === 0 ? "success" : "warning"}>
              {openTickets === 0 ? (isEn ? "Cleared" : "Thông suốt") : (isEn ? "Attention" : "Cần giải quyết")}
            </Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? `${openTickets} unresolved customer tickets remaining` : `Còn ${openTickets} yêu cầu chưa phản hồi`}
          </p>
        </Card>

        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Process Uptime" : "Thời gian hoạt động"}</span>
            <div className="stat-card-icon-pill is-emerald-pill">
              <Icon name="shield" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{data ? `${uptimeHours}h ${uptimeMinutes}m` : "—"}</strong>
            <Badge tone={data ? "success" : "warning"}>{data ? (isEn ? "Live" : "Đang chạy") : (isEn ? "Unavailable" : "Không có dữ liệu")}</Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? "Time since last process restart" : "Thời gian kể từ lần khởi động máy chủ cuối"}
          </p>
        </Card>

        <Card className="admin-stat-card">
          <div className="stat-card-top">
            <span className="stat-card-label">{isEn ? "Email Deliverability" : "Tỷ lệ phát hành Email"}</span>
            <div className="stat-card-icon-pill is-info-pill">
              <Icon name="check" />
            </div>
          </div>
          <div className="stat-card-val-row">
            <strong className="stat-card-val">{completedMailJobs}</strong>
            <Badge tone="info">{isEn ? "sent" : "đã gửi"}</Badge>
          </div>
          <p className="stat-card-sub">
            {isEn ? `${pendingMailJobs} pending in outbox queue` : `${pendingMailJobs} đang chờ trong hàng đợi`}
          </p>
        </Card>
      </div>

      {data && (
        <>
          {/* Detailed Metric Audit Matrix */}
          <Card className="admin-breakdown-card" style={{ marginTop: 24 }}>
            <div className="breakdown-card-header">
              <div>
                <h2>{isEn ? "System Operations Breakdown Matrix" : "Bảng chỉ số đối soát hoạt động chi tiết"}</h2>
                <p>{isEn ? "Audited values snapshot as of current timestamp" : "Số liệu ghi nhận tức thời từ cơ sở dữ liệu sản xuất"}</p>
              </div>
              <Button variant="secondary" onClick={exportExecutiveReport}>
                <Icon name="download" size="small" />
                {isEn ? "Export Sheet" : "Tải bảng dữ liệu"}
              </Button>
            </div>

            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{isEn ? "Operational Category" : "Hạng mục nghiệp vụ"}</th>
                    <th>{isEn ? "Key Performance Indicator (KPI)" : "Chỉ số đánh giá"}</th>
                    <th>{isEn ? "Current Count" : "Giá trị hiện thời"}</th>
                    <th>{isEn ? "Status Benchmark" : "Trạng thái vận hành"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{isEn ? "User Management" : "Quản lý thành viên"}</strong></td>
                    <td>{isEn ? "Active / Verified Accounts" : "Tài khoản kích hoạt / Đã xác thực"}</td>
                    <td><strong>{activeUsers}</strong></td>
                    <td>
                      <Badge tone="success">
                        {isEn ? "Normal" : "Đạt yêu cầu"}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>{isEn ? "User Management" : "Quản lý thành viên"}</strong></td>
                    <td>{isEn ? "Pending OTP Verification" : "Tài khoản đang chờ xác minh OTP"}</td>
                    <td><strong>{pendingUsers}</strong></td>
                    <td>
                      <Badge tone={pendingUsers > 50 ? "warning" : "soft"}>
                        {pendingUsers > 50 ? (isEn ? "High Volume" : "Lượng chờ cao") : (isEn ? "Acceptable" : "Bình thường")}
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
