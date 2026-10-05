import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card } from "../../components/ui";
import { authenticatedRequest, type ApiUser } from "../../services/api";
import { downloadCsv } from "../../utils/downloads";
import { useI18n } from "../../i18n";

type Page<T> = { items: T[]; total: number };
type RecentUser = ApiUser & { createdAt: string };
type Audit = { id: string; action: string; targetType: string; createdAt: string };

const metricRoutes = [
  "/admin/users?limit=1",
  "/admin/users?limit=1&status=ACTIVE",
  "/admin/users?limit=1&status=PENDING_VERIFICATION",
  "/admin/users?limit=1&status=SUSPENDED",
  "/admin/support?limit=1&status=OPEN",
  "/admin/support?limit=1&status=IN_PROGRESS",
  "/admin/content?limit=1&kind=ARTICLE&status=PUBLISHED",
] as const;

const metricNavPaths = [
  "/admin/users",
  "/admin/users",
  "/admin/users",
  "/admin/users",
  "/admin/support",
  "/admin/support",
  "/admin/content",
] as const;

type Snapshot = { counts: number[]; users: RecentUser[]; audit: Audit[]; fetchedAt: string };

function Overview({ report = false }: { report?: boolean }) {
  const { language } = useI18n();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const metricLabels = [
    language === "en" ? "Registered Users" : "Người dùng đăng ký",
    language === "en" ? "Active Accounts" : "Đang hoạt động",
    language === "en" ? "Pending Verification" : "Chờ xác minh",
    language === "en" ? "Suspended Accounts" : "Đang tạm khóa",
    language === "en" ? "New Support Tickets" : "Yêu cầu hỗ trợ mới",
    language === "en" ? "Tickets in Progress" : "Hỗ trợ đang xử lý",
    language === "en" ? "Published Articles" : "Bài viết đã xuất bản",
  ];

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    Promise.all([
      Promise.all(metricRoutes.map((path) => authenticatedRequest<Page<never>>(path).then((page) => page.total))),
      authenticatedRequest<Page<RecentUser>>("/admin/users?limit=5&sortBy=createdAt&order=desc"),
      authenticatedRequest<Page<Audit>>("/admin/audit-logs?limit=5&order=desc"),
    ])
      .then(([counts, users, audit]) => {
        if (active) {
          setData({
            counts,
            users: users.items,
            audit: audit.items,
            fetchedAt: new Date().toLocaleString(language === "en" ? "en-US" : "vi-VN"),
          });
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : (language === "en" ? "Could not load statistics." : "Không tải được dữ liệu."));
      });
    return () => {
      active = false;
    };
  }, [reload, language]);

  const userStatusMap: Record<string, string> = {
    ACTIVE: language === "en" ? "Active" : "Hoạt động",
    PENDING_VERIFICATION: language === "en" ? "Pending" : "Chờ xác minh",
    SUSPENDED: language === "en" ? "Suspended" : "Tạm khóa",
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{report ? (language === "en" ? "Status Report" : "Báo cáo hiện trạng") : (language === "en" ? "Administration Overview" : "Tổng quan quản trị")}</h1>
          <p>
            {data
              ? (language === "en" ? `Data fetched at: ${data.fetchedAt}` : `Dữ liệu tại thời điểm tải: ${data.fetchedAt}`)
              : (language === "en" ? "Statistics aggregated from accounts, tickets, and stored content." : "Thống kê từ tài khoản, yêu cầu và nội dung đã lưu.")}
          </p>
        </div>
        <div className="account-save-row">
          <Button onClick={() => setReload((v) => v + 1)} disabled={!data && !error}>
            {language === "en" ? "Refresh" : "Làm mới"}
          </Button>
          {report && (
            <Button
              disabled={!data}
              onClick={() => {
                if (data) {
                  downloadCsv("an-huu-hien-trang.csv", [
                    [language === "en" ? "Timestamp" : "Thời điểm tải", data.fetchedAt],
                    [language === "en" ? "Metric" : "Chỉ số", language === "en" ? "Count" : "Số lượng"],
                    ...metricLabels.map((label, i) => [label, data.counts[i]]),
                  ]);
                }
              }}
            >
              {language === "en" ? "Export CSV" : "Xuất CSV"}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <Alert
          tone="danger"
          title={language === "en" ? "Failed to load statistics" : "Chưa tải được thống kê"}
          action={<Button onClick={() => setReload((v) => v + 1)}>{language === "en" ? "Retry" : "Thử lại"}</Button>}
        >
          {error}
        </Alert>
      ) : !data ? (
        <p role="status">{language === "en" ? "Loading statistics..." : "Đang tải số liệu…"}</p>
      ) : (
        <>
          <div className="admin-kpi-grid">
            {metricLabels.map((label, i) => (
              <Card className="admin-kpi-card" key={label}>
                <span>{label}</span>
                <strong>{data.counts[i].toLocaleString(language === "en" ? "en-US" : "vi-VN")}</strong>
                <Link to={metricNavPaths[i]}>{language === "en" ? "Open list" : "Mở danh sách"}</Link>
              </Card>
            ))}
          </div>

          <p>
            {language === "en"
              ? "Statistics reflect current live state, not monthly accruals. Aggregated growth reports, AI usage, and retirement plans will populate as data accumulates."
              : "Thống kê phản ánh trạng thái hiện tại, không phải số phát sinh theo tháng. Báo cáo tăng trưởng, lượt dùng AI và kế hoạch hưu trí chưa có dữ liệu tổng hợp."}
          </p>

          {!report && (
            <div className="admin-chart-grid">
              <Card className="admin-list-card">
                <header>
                  <h2>{language === "en" ? "New Users" : "Người dùng mới"}</h2>
                  <Link to="/admin/users">{language === "en" ? "View all" : "Xem tất cả"}</Link>
                </header>
                <div className="recent-user-list">
                  {data.users.map((user) => (
                    <Link key={user.id} to={`/admin/users/${user.id}`}>
                      <strong>{user.fullName}</strong>
                      <p>{user.email}</p>
                      <Badge>{userStatusMap[user.status] || user.status}</Badge>
                      <p>{new Date(user.createdAt).toLocaleString(language === "en" ? "en-US" : "vi-VN")}</p>
                    </Link>
                  ))}
                  {!data.users.length && <p>{language === "en" ? "No registered users." : "Chưa có người dùng đăng ký."}</p>}
                </div>
              </Card>

              <Card className="admin-list-card">
                <header>
                  <h2>{language === "en" ? "Recent Operations" : "Thao tác gần đây"}</h2>
                  <Link to="/admin/settings/audit-log">{language === "en" ? "Open audit log" : "Mở nhật ký"}</Link>
                </header>
                {data.audit.map((row) => (
                  <div key={row.id}>
                    <strong>{row.action}</strong>
                    <p>
                      {row.targetType} · {new Date(row.createdAt).toLocaleString(language === "en" ? "en-US" : "vi-VN")}
                    </p>
                  </div>
                ))}
                {!data.audit.length && <p>{language === "en" ? "No operations recorded." : "Chưa có thao tác được ghi nhận."}</p>}
                <Link to="/admin/operations">{language === "en" ? "View system health and diagnostics" : "Xem tình trạng hệ thống và gửi email"}</Link>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AdminDashboardPage() {
  return <Overview />;
}

export function AdminReportsPage() {
  return <Overview report />;
}
