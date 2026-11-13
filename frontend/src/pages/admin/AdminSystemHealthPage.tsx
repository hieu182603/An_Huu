import { useEffect, useState } from "react";
import "./admin-management.css";
import "./admin-gaps.css";
import { Alert, Badge, Button, Card, Icon } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { useI18n } from "../../i18n";

type MailFailure = { id: string; type: string; attempts: number; lastErrorCode: string | null; createdAt: string };
export type OperationsOverview = {
  asOfDate: string;
  api: string;
  database: string;
  uptimeSeconds: number;
  configuration?: Record<string, boolean>;
  mailJobs: Record<string, number>;
  mailDeliveryEvidence?: string;
  recentFailures: MailFailure[];
  lastJobCompletedAt: string | null;
};

const JOB_STATUS: Record<string, [string, string]> = {
  PENDING: ["Chờ gửi", "Pending"],
  PROCESSING: ["Đang gửi", "Processing"],
  COMPLETED: ["Nhà cung cấp đã nhận", "Accepted by provider"],
  FAILED: ["Lỗi", "Failed"],
};
const JOB_ORDER = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];
const JOB_TYPE: Record<string, [string, string]> = {
  "auth.verify_email": ["Email xác minh tài khoản", "Account verification email"],
  "auth.reset_password": ["Email đặt lại mật khẩu", "Password reset email"],
};
const CONFIG: Record<string, [string, string]> = {
  email: ["Máy chủ email (SMTP)", "Email server (SMTP)"],
  encryption: ["Khóa mã hóa hàng đợi", "Queue encryption key"],
  google: ["Đăng nhập Google", "Google sign-in"],
  media: ["Lưu trữ ảnh", "Media storage"],
};
const pick = (map: Record<string, [string, string]>, key: string, isEn: boolean) => map[key]?.[isEn ? 1 : 0] ?? key;
const formatDateTime = (value: string | null, isEn: boolean) =>
  value ? new Date(value).toLocaleString(isEn ? "en-GB" : "vi-VN") : isEn ? "Not recorded" : "Chưa ghi nhận";

export function formatUptime(seconds: number, isEn: boolean): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = isEn
    ? [days && `${days}d`, hours && `${hours}h`, `${minutes}m`]
    : [days && `${days} ngày`, hours && `${hours} giờ`, `${minutes} phút`];
  return parts.filter(Boolean).join(" ");
}

export default function AdminSystemHealthPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    authenticatedRequest<OperationsOverview>("/admin/operations", undefined, "GET", undefined, { skipCache: reload > 0 })
      .then((value) => { if (active) setData(value); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const apiOk = data?.api === "ready";
  const dbOk = data?.database === "connected";
  const jobKeys = data ? [...JOB_ORDER.filter((k) => k in data.mailJobs || k !== "PROCESSING"), ...Object.keys(data.mailJobs).filter((k) => !JOB_ORDER.includes(k))] : [];

  return (
    <div className="admin-page admin-management-page ag-health-page">
      <div className="admin-page-header">
        <div>
          <span>{isEn ? "OPERATIONS MONITORING" : "GIÁM SÁT VẬN HÀNH"}</span>
          <h1>{isEn ? "System health" : "Tình trạng hệ thống"}</h1>
          <p>{data
            ? (isEn ? `Updated ${formatDateTime(data.asOfDate, isEn)}` : `Cập nhật lúc ${formatDateTime(data.asOfDate, isEn)}`)
            : (isEn ? "API, database and email queue status." : "Trạng thái API, cơ sở dữ liệu và hàng đợi email.")}</p>
        </div>
        <Button variant="secondary" icon="sparkles" loading={loading} onClick={() => setReload((value) => value + 1)}>
          {isEn ? "Reload" : "Tải lại"}
        </Button>
      </div>

      {error && (
        <Alert tone="danger" title={isEn ? "Could not load system health" : "Không tải được tình trạng hệ thống"}
          action={<Button size="small" variant="secondary" onClick={() => setReload((value) => value + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>}>
          {error}
        </Alert>
      )}

      {!data && loading && !error && <Card className="ag-state"><p role="status">{isEn ? "Loading system health…" : "Đang tải tình trạng hệ thống…"}</p></Card>}

      {data && (
        <>
          <div className="ag-health-cards">
            <Card className={`ag-health-card ${apiOk ? "is-ok" : "is-bad"}`}>
              <span>API</span>
              <strong>{apiOk ? (isEn ? "Ready" : "Sẵn sàng") : data.api}</strong>
              <small>{isEn ? "Responds to requests" : "Đang phản hồi yêu cầu"}</small>
            </Card>
            <Card className={`ag-health-card ${dbOk ? "is-ok" : "is-bad"}`}>
              <span>{isEn ? "Database" : "Cơ sở dữ liệu"}</span>
              <strong>{dbOk ? (isEn ? "Connected" : "Đã kết nối") : data.database}</strong>
              <small>PostgreSQL</small>
            </Card>
            <Card className="ag-health-card">
              <span>{isEn ? "Uptime" : "Thời gian chạy"}</span>
              <strong>{formatUptime(data.uptimeSeconds, isEn)}</strong>
              <small>{isEn ? "Since the API process started" : "Kể từ khi tiến trình API khởi động"}</small>
            </Card>
            <Card className="ag-health-card">
              <span>{isEn ? "Last job completed" : "Job hoàn tất gần nhất"}</span>
              <strong className="ag-health-date">{formatDateTime(data.lastJobCompletedAt, isEn)}</strong>
              <small>{isEn ? "Any background job" : "Mọi loại job nền"}</small>
            </Card>
          </div>

          <Card className="admin-management-table-card">
            <div className="admin-management-section-header">
              <div>
                <h2>{isEn ? "Email queue" : "Hàng đợi email"}</h2>
                <p>{isEn ? "Verification and password reset emails by status." : "Email xác minh và đặt lại mật khẩu theo trạng thái."}</p>
              </div>
            </div>
            <dl className="ag-job-counts">
              {jobKeys.map((status) => (
                <div key={status} className={status === "FAILED" && data.mailJobs[status] ? "is-failed" : ""}>
                  <dt>{pick(JOB_STATUS, status, isEn)} <code>{status}</code></dt>
                  <dd>{data.mailJobs[status] ?? 0}</dd>
                </div>
              ))}
            </dl>
            <p className="ag-evidence-note" data-evidence={data.mailDeliveryEvidence}>
              <Icon name="info" size="small" />
              {isEn
                ? "COMPLETED = the email provider accepted the message; it does not prove the email was delivered."
                : "COMPLETED = nhà cung cấp email đã nhận, chưa chắc đã giao tới hộp thư người dùng."}
            </p>
            {data.configuration && (
              <ul className="ag-config-list" aria-label={isEn ? "Configuration" : "Cấu hình"}>
                {Object.entries(data.configuration).map(([key, on]) => (
                  <li key={key}>{pick(CONFIG, key, isEn)} <Badge tone={on ? "success" : "warning"}>{on ? (isEn ? "Configured" : "Đã cấu hình") : (isEn ? "Missing" : "Chưa cấu hình")}</Badge></li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="admin-management-table-card">
            <div className="admin-management-section-header">
              <div>
                <h2>{isEn ? "Recent failed jobs" : "Job lỗi gần nhất"}</h2>
                <p>{isEn ? "Up to 20 most recent failed email jobs." : "Tối đa 20 job email lỗi gần nhất."}</p>
              </div>
            </div>
            {data.recentFailures.length ? (
              <div className="table-scroll">
                <table className="admin-management-table ag-failure-table">
                  <thead>
                    <tr>
                      <th>{isEn ? "Created" : "Thời điểm tạo"}</th>
                      <th>{isEn ? "Job type" : "Loại job"}</th>
                      <th>{isEn ? "Attempts" : "Số lần thử"}</th>
                      <th>{isEn ? "Error code" : "Mã lỗi"}</th>
                      <th>{isEn ? "Job ID" : "Mã job"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentFailures.map((job) => (
                      <tr key={job.id}>
                        <td>{formatDateTime(job.createdAt, isEn)}</td>
                        <td>{pick(JOB_TYPE, job.type, isEn)}<small>{job.type}</small></td>
                        <td>{job.attempts}</td>
                        <td>{job.lastErrorCode ? <code>{job.lastErrorCode}</code> : (isEn ? "Not recorded" : "Chưa ghi nhận")}</td>
                        <td><code>{job.id}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-management-empty">{isEn ? "No failed email jobs." : "Không có job email lỗi."}</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
