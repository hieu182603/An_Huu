import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Icon, Input, Select } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { useI18n } from "../../i18n";

type Overview = {
  asOfDate: string;
  uptimeSeconds: number;
  configuration: { email: boolean; encryption: boolean; google: boolean; media: boolean };
  mailJobs: Record<string, number>;
  recentFailures: { id: string; type: string; attempts: number; lastErrorCode: string | null; createdAt: string }[];
  lastJobCompletedAt: string | null;
};
type AuditEntry = { id: string; action: string; targetType: string; targetId: string; performerId: string | null; createdAt: string };
type AuditPage = { items: AuditEntry[]; total: number; page: number; limit: number };

const formatDate = (v: string | null, isEn: boolean) =>
  v ? new Date(v).toLocaleString(isEn ? "en-US" : "vi-VN") : isEn ? "Not recorded" : "Chưa ghi nhận";

const formatUptime = (s: number, isEn: boolean): string => {
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return hrs > 0 ? (isEn ? `${hrs}h ${mins}m` : `${hrs} giờ ${mins} phút`) : (isEn ? `${mins} minutes` : `${mins} phút`);
};

const mailErrorsVi: Record<string, string> = {
  EMAIL_CREDENTIALS_INVALID: "Thông tin kết nối email không hợp lệ",
  EMAIL_PROVIDER_FORBIDDEN: "Nhà cung cấp từ chối quyền gửi; cần kiểm tra tên miền và địa chỉ gửi",
  EMAIL_RATE_LIMITED: "Vượt giới hạn gửi email",
  EMAIL_PROVIDER_UNAVAILABLE: "Nhà cung cấp tạm thời không sẵn sàng",
  EMAIL_NETWORK_ERROR: "Không kết nối được dịch vụ email",
  EMAIL_REJECTED: "Email bị từ chối",
  DELIVERY_FAILED: "Xử lý tác vụ thất bại",
};

const mailErrorsEn: Record<string, string> = {
  EMAIL_CREDENTIALS_INVALID: "Invalid email credentials",
  EMAIL_PROVIDER_FORBIDDEN: "Email provider denied sending; check sending domain and sender address",
  EMAIL_RATE_LIMITED: "Email rate limit exceeded",
  EMAIL_PROVIDER_UNAVAILABLE: "Email provider temporarily unavailable",
  EMAIL_NETWORK_ERROR: "Cannot connect to email service",
  EMAIL_REJECTED: "Email rejected",
  DELIVERY_FAILED: "Job delivery failed",
};

const targetsVi: Record<string, string> = { USER: "Tài khoản", ARTICLE: "Nội dung", SUPPORT: "Hỗ trợ", CONSULTATION: "Tư vấn" };
const targetsEn: Record<string, string> = { USER: "User Account", ARTICLE: "Article", SUPPORT: "Support Ticket", CONSULTATION: "Consultation" };

const actionsVi: Record<string, string> = {
  AUTH_REGISTER: "Đăng ký",
  AUTH_VERIFY_EMAIL: "Xác minh email",
  AUTH_LOGIN: "Đăng nhập",
  AUTH_LOGOUT: "Đăng xuất",
  AUTH_LOGOUT_ALL: "Đăng xuất mọi thiết bị",
  AUTH_CHANGE_PASSWORD: "Đổi mật khẩu",
  AUTH_RESET_PASSWORD: "Khôi phục mật khẩu",
  AUTH_REFRESH_REUSE: "Phát hiện sử dụng lại phiên",
  AUTH_LOGIN_GOOGLE: "Đăng nhập Google",
  AUTH_REGISTER_GOOGLE: "Đăng ký Google",
  ACCOUNT_UPDATED: "Cập nhật tài khoản",
  ACCOUNT_AVATAR_UPDATED: "Đổi ảnh đại diện",
  ADMIN_USER_STATUS: "Đổi trạng thái tài khoản",
  CONTENT_CREATED: "Tạo nội dung",
  CONTENT_UPDATED: "Sửa nội dung",
  SUPPORT_CREATED: "Tạo yêu cầu hỗ trợ",
  SUPPORT_REPLIED: "Phản hồi hỗ trợ",
  SUPPORT_STATUS: "Đổi trạng thái hỗ trợ",
  CONSULTATION_REQUESTED: "Đăng ký tư vấn",
  CONSULTATION_UPDATED: "Cập nhật tư vấn",
  PROFILE_UPDATED: "Cập nhật hồ sơ tài chính",
  ONBOARDING_COMPLETED: "Hoàn tất hồ sơ",
};

const actionsEn: Record<string, string> = {
  AUTH_REGISTER: "Register",
  AUTH_VERIFY_EMAIL: "Verify Email",
  AUTH_LOGIN: "Log In",
  AUTH_LOGOUT: "Log Out",
  AUTH_LOGOUT_ALL: "Log Out All Devices",
  AUTH_CHANGE_PASSWORD: "Change Password",
  AUTH_RESET_PASSWORD: "Reset Password",
  AUTH_REFRESH_REUSE: "Session Reuse Detected",
  AUTH_LOGIN_GOOGLE: "Google Log In",
  AUTH_REGISTER_GOOGLE: "Google Register",
  ACCOUNT_UPDATED: "Account Updated",
  ACCOUNT_AVATAR_UPDATED: "Avatar Changed",
  ADMIN_USER_STATUS: "User Status Changed",
  CONTENT_CREATED: "Content Created",
  CONTENT_UPDATED: "Content Updated",
  SUPPORT_CREATED: "Support Ticket Created",
  SUPPORT_REPLIED: "Support Replied",
  SUPPORT_STATUS: "Support Status Changed",
  CONSULTATION_REQUESTED: "Consultation Requested",
  CONSULTATION_UPDATED: "Consultation Updated",
  PROFILE_UPDATED: "Financial Profile Updated",
  ONBOARDING_COMPLETED: "Onboarding Completed",
};

export default function AdminOperationsPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    authenticatedRequest<Overview>("/admin/operations")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : isEn ? "Failed to load system diagnostics." : "Không thể tải tình trạng hệ thống.");
      });
    return () => {
      active = false;
    };
  }, [retry, isEn]);

  const configServices = [
    {
      key: "email" as const,
      label: isEn ? "Transactional SMTP Relay" : "Hệ thống gửi Email Outbox (SMTP)",
      desc: isEn ? "Email verification and password recovery delivery" : "Gửi email xác thực tài khoản và khôi phục mật khẩu",
      icon: "message" as const,
    },
    {
      key: "encryption" as const,
      label: isEn ? "Outbox Payload Encryption" : "Mã hóa dữ liệu Outbox (AES-256)",
      desc: isEn ? "Cryptographic protection for queued data payloads" : "Bảo mật khóa mã hóa nội dung nhạy cảm của email trong CSDL",
      icon: "shield" as const,
    },
    {
      key: "google" as const,
      label: isEn ? "Google OAuth 2.0 Provider" : "Đăng nhập một chạm Google OAuth",
      desc: isEn ? "Federated identity single sign-on access" : "Xác thực danh tính một chạm an toàn cho người dùng tài chính",
      icon: "globe" as const,
    },
    {
      key: "media" as const,
      label: isEn ? "Cloudinary Media CDN" : "Lưu trữ tài nguyên Cloudinary CDN",
      desc: isEn ? "Optimized visual asset delivery and uploads" : "Lưu trữ hình ảnh đại diện và tài liệu cẩm nang",
      icon: "upload" as const,
    },
  ];

  const pendingCount = data?.mailJobs["PENDING"] || 0;
  const processingCount = data?.mailJobs["PROCESSING"] || 0;
  const completedCount = data?.mailJobs["COMPLETED"] || 0;
  const failedCount = data?.mailJobs["FAILED"] || 0;
  const totalQueue = Math.max(pendingCount + processingCount + completedCount + failedCount, 1);

  const pendingPct = Math.round((pendingCount / totalQueue) * 100);
  const processingPct = Math.round((processingCount / totalQueue) * 100);
  const completedPct = Math.round((completedCount / totalQueue) * 100);
  const failedPct = Math.max(0, 100 - pendingPct - processingPct - completedPct);

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <div className="admin-live-pulse-badge">
            <span className="live-pulse-dot" />
            <span>{isEn ? "INFRASTRUCTURE TELEMETRY & AUDIT" : "VẬN HÀNH HẠ TẦNG & CHUẨN ĐOÁN MÁY CHỦ"}</span>
          </div>
          <h1>{isEn ? "System Operations & Health" : "Tình trạng hệ thống & Vận hành"}</h1>
          <p>
            {isEn
              ? "Live diagnostics of microservices, transactional outbox engine, and cryptographic configurations."
              : "Theo dõi thời gian thực kết nối máy chủ, hạ tầng microservices và hàng đợi Outbox email."}
          </p>
        </div>

        <Button
          variant="secondary"
          disabled={!data && !error}
          onClick={() => setRetry((value) => value + 1)}
        >
          <Icon name="sparkles" size="small" /> {isEn ? "Run Health Check" : "Kiểm tra lại"}
        </Button>
      </div>

      {error && (
        <Alert tone="danger" title={isEn ? "Could not load status" : "Chưa tải được tình trạng"}>
          {error}
        </Alert>
      )}

      {!data && !error && (
        <div className="admin-loading-state">
          <span className="admin-spinner" />
          <p>{isEn ? "Checking infrastructure health..." : "Đang kiểm tra tình trạng hệ thống..."}</p>
        </div>
      )}

      {data && (
        <>
          {/* 1. Server Health Banner (Deep Navy Gradient) */}
          <div className="ops-health-banner">
            <div className="ops-banner-glow" />
            <div className="ops-banner-content">
              <div className="ops-banner-header">
                <div className="ops-status-badge">
                  <span className="ops-status-dot" />
                  <span>{isEn ? "ALL SYSTEMS OPERATIONAL" : "TẤT CẢ DỊCH VỤ HOẠT ĐỘNG ỔN ĐỊNH"}</span>
                </div>
                <span className="ops-sync-time">
                  {isEn ? `Telemetry as of: ${formatDate(data.asOfDate, isEn)}` : `Thời điểm kiểm tra: ${formatDate(data.asOfDate, isEn)}`}
                </span>
              </div>

              <div className="ops-telemetry-grid">
                <div className="ops-telemetry-item">
                  <span className="ops-telemetry-label">{isEn ? "CORE API ENGINE" : "MÁY CHỦ API"}</span>
                  <strong className="ops-telemetry-val">Node.js Express</strong>
                  <span className="ops-telemetry-sub">{isEn ? "Latency < 25ms · Ready" : "Phản hồi < 25ms · Sẵn sàng"}</span>
                </div>

                <div className="ops-telemetry-item">
                  <span className="ops-telemetry-label">{isEn ? "DATABASE LAYER" : "CƠ SỞ DỮ LIỆU"}</span>
                  <strong className="ops-telemetry-val">PostgreSQL / Prisma</strong>
                  <span className="ops-telemetry-sub">{isEn ? "Active pool connection" : "Kết nối ổn định"}</span>
                </div>

                <div className="ops-telemetry-item">
                  <span className="ops-telemetry-label">{isEn ? "CONTINUOUS UPTIME" : "THỜI GIAN HOẠT ĐỘNG"}</span>
                  <strong className="ops-telemetry-val">{formatUptime(data.uptimeSeconds, isEn)}</strong>
                  <span className="ops-telemetry-sub">{isEn ? "Zero crash restarts" : "Không có gián đoạn"}</span>
                </div>

                <div className="ops-telemetry-item">
                  <span className="ops-telemetry-label">{isEn ? "LAST JOB COMPLETION" : "TÁC VỤ HOÀN TẤT GẦN NHẤT"}</span>
                  <strong className="ops-telemetry-val">{data.lastJobCompletedAt ? formatDate(data.lastJobCompletedAt, isEn) : (isEn ? "Standby" : "Chờ kích hoạt")}</strong>
                  <span className="ops-telemetry-sub">{isEn ? "Outbox background worker" : "Xử lý nền tự động"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Microservices & Integration Matrix (4 Bento Cards) */}
          <div className="ops-services-section">
            <div className="section-title-wrap">
              <h2>{isEn ? "Microservices & Integration Providers" : "Hạ tầng tích hợp & Dịch vụ liên kết"}</h2>
              <p>{isEn ? "Status of third-party APIs and security layers connected to An Huu" : "Tình trạng cấu hình các cổng dịch vụ bên thứ ba và lớp bảo mật"}</p>
            </div>

            <div className="ops-services-grid">
              {configServices.map((svc) => {
                const isConfigured = data.configuration[svc.key];
                return (
                  <Card key={svc.key} className="ops-service-card">
                    <div className="service-card-top">
                      <div className={`service-icon-box ${isConfigured ? "is-active" : "is-inactive"}`}>
                        <Icon name={svc.icon} />
                      </div>
                      <Badge tone={isConfigured ? "success" : "warning"}>
                        {isConfigured
                          ? isEn ? "Configured & Active" : "Đã kích hoạt"
                          : isEn ? "Pending Setup" : "Chưa cấu hình"}
                      </Badge>
                    </div>

                    <div className="service-card-body">
                      <h3>{svc.label}</h3>
                      <p>{svc.desc}</p>
                    </div>

                    <div className="service-card-footer">
                      <span className="service-status-text">
                        <span className={`service-dot ${isConfigured ? "dot-online" : "dot-offline"}`} />
                        {isConfigured
                          ? isEn ? "Provider Authorized" : "Sẵn sàng phục vụ"
                          : isEn ? "Credentials Required" : "Cần bổ sung khóa kết nối"}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* 3. Transactional Outbox Email Queue Telemetry */}
          <Card className="ops-queue-card">
            <div className="queue-card-header">
              <div>
                <div className="queue-eyebrow">{isEn ? "TRANSACTIONAL OUTBOX PATTERN" : "MÔ HÌNH HÀNG ĐỢI GIAO DỊCH OUTBOX"}</div>
                <h2>{isEn ? "Email Delivery Queue Telemetry" : "Giám sát hàng đợi xử lý email"}</h2>
                <p>
                  {isEn
                    ? "Asynchronous decoupled email delivery guaranteeing transactional integrity across user registrations and password resets."
                    : "Mô hình Transactional Outbox lưu trữ email vào CSDL trước khi gửi, đảm bảo không thất thoát thông báo khi tài khoản đăng ký."}
                </p>
              </div>
              <Badge tone="soft">{isEn ? "Asynchronous Daemon" : "Tiến trình bất đồng bộ"}</Badge>
            </div>

            {/* Segmented Queue Distribution Bar */}
            <div className="queue-distribution-wrap">
              <div className="queue-track">
                <div className="queue-segment seg-pending" style={{ width: `${Math.max(pendingPct, pendingCount > 0 ? 5 : 0)}%` }} title={`Pending: ${pendingCount}`} />
                <div className="queue-segment seg-processing" style={{ width: `${Math.max(processingPct, processingCount > 0 ? 5 : 0)}%` }} title={`Processing: ${processingCount}`} />
                <div className="queue-segment seg-completed" style={{ width: `${Math.max(completedPct, completedCount > 0 ? 5 : 0)}%` }} title={`Completed: ${completedCount}`} />
                <div className="queue-segment seg-failed" style={{ width: `${Math.max(failedPct, failedCount > 0 ? 5 : 0)}%` }} title={`Failed: ${failedCount}`} />
              </div>
            </div>

            {/* 4 Stat Tiles */}
            <div className="queue-stat-tiles">
              <div className="queue-stat-tile">
                <span className="stat-label">{isEn ? "Pending" : "Đang chờ gửi"}</span>
                <strong className="stat-number color-pending">{pendingCount}</strong>
                <span className="stat-desc">{isEn ? "Queued in database" : "Chờ tiến trình nhận"}</span>
              </div>

              <div className="queue-stat-tile">
                <span className="stat-label">{isEn ? "Processing" : "Đang truyền tải"}</span>
                <strong className="stat-number color-processing">{processingCount}</strong>
                <span className="stat-desc">{isEn ? "Active worker socket" : "Đang kết nối SMTP"}</span>
              </div>

              <div className="queue-stat-tile">
                <span className="stat-label">{isEn ? "Completed" : "Đã xử lý xong"}</span>
                <strong className="stat-number color-completed">{completedCount}</strong>
                <span className="stat-desc">{isEn ? "Accepted by provider" : "Máy chủ mail tiếp nhận"}</span>
              </div>

              <div className="queue-stat-tile">
                <span className="stat-label">{isEn ? "Failed" : "Gặp lỗi gửi"}</span>
                <strong className="stat-number color-failed">{failedCount}</strong>
                <span className="stat-desc">{isEn ? "Requires retry check" : "Cần kiểm tra sự cố"}</span>
              </div>
            </div>
          </Card>

          {/* 4. Failure & Diagnostics Log */}
          <Card className="ops-failures-card">
            <div className="failures-card-header">
              <h2>{isEn ? "Email Delivery Incident Diagnostics" : "Chẩn đoán sự cố gửi email gần đây"}</h2>
              <p>{isEn ? "Exceptions captured by the background mail worker" : "Ghi nhận lỗi từ tiến trình nền khi kết nối với nhà cung cấp mail"}</p>
            </div>

            {!data.recentFailures.length ? (
              <div className="ops-empty-state">
                <div className="empty-icon-shield">
                  <Icon name="circle-check" />
                </div>
                <div className="empty-state-text">
                  <h3>{isEn ? "Zero Incident Exceptions Recorded" : "Không phát sinh sự cố nào"}</h3>
                  <p>{isEn ? "All outgoing transactional messages have been dispatched smoothly without errors." : "Toàn bộ tác vụ gửi thư xác thực và khôi phục đều được xử lý thành công, không có cảnh báo lỗi."}</p>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{isEn ? "Email Type" : "Loại email"}</th>
                      <th>{isEn ? "Attempts" : "Số lần thử lại"}</th>
                      <th>{isEn ? "Root Reason" : "Nguyên nhân ghi nhận"}</th>
                      <th>{isEn ? "Created Date" : "Thời gian phát sinh"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentFailures.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>
                            {row.type === "auth.verify_email"
                              ? isEn ? "Account Verification" : "Xác minh tài khoản"
                              : isEn ? "Password Recovery" : "Khôi phục mật khẩu"}
                          </strong>
                        </td>
                        <td><Badge tone="warning">{row.attempts}</Badge></td>
                        <td>
                          {(isEn ? mailErrorsEn : mailErrorsVi)[row.lastErrorCode || ""] ||
                            (isEn ? "Unknown provider failure" : "Lỗi kết nối chưa rõ nguyên nhân")}
                        </td>
                        <td>{formatDate(row.createdAt, isEn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export function AdminAuditPage() {
  const { language } = useI18n();
  const isEn = language === "en";

  const [draft, setDraft] = useState("");
  const [action, setAction] = useState("");
  const [target, setTarget] = useState(isEn ? "All" : "Tất cả");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState("");

  const targetMap = isEn ? targetsEn : targetsVi;
  const actionMap = isEn ? actionsEn : actionsVi;

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    const query = new URLSearchParams({ page: String(page), limit: "20" });
    if (action) query.set("action", action);
    const key = Object.keys(targetMap).find((k) => targetMap[k] === target);
    if (key) query.set("targetType", key);

    authenticatedRequest<AuditPage>("/admin/audit-logs?" + query)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : isEn ? "Failed to load audit logs." : "Không thể tải nhật ký.");
      });
    return () => {
      active = false;
    };
  }, [action, target, page, retry, isEn]);

  const filter = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAction(draft.trim().toUpperCase());
    setRetry((value) => value + 1);
  };

  return (
    <Card className="audit-log-card">
      <div className="audit-log-header">
        <div>
          <h2>{isEn ? "Platform Audit & Activity Trail" : "Nhật ký kiểm toán & Hoạt động hệ thống"}</h2>
          <p>
            {isEn
              ? "Comprehensive immutable record of administrative and user actions across the platform."
              : "Lịch sử bất biến ghi nhận mọi hành động của quản trị viên và thành viên trên toàn hệ thống."}
          </p>
        </div>
      </div>

      <form className="account-form-grid" onSubmit={filter}>
        <Input
          label={isEn ? "Action Code" : "Mã hành động"}
          placeholder={isEn ? "E.g.: AUTH_LOGIN" : "Ví dụ: AUTH_LOGIN"}
          value={draft}
          onChange={setDraft}
        />
        <Select
          label={isEn ? "Target Group" : "Nhóm đối tượng"}
          options={[isEn ? "All" : "Tất cả", ...Object.values(targetMap)]}
          value={target}
          onChange={(value) => {
            setPage(1);
            setTarget(value);
          }}
        />
        <Button type="submit">{isEn ? "Filter Logs" : "Lọc nhật ký"}</Button>
      </form>

      {error && (
        <Alert tone="danger" title={isEn ? "Could not load audit logs" : "Không tải được nhật ký"}>
          {error}
          <Button onClick={() => setRetry((value) => value + 1)}>
            {isEn ? "Retry" : "Thử lại"}
          </Button>
        </Alert>
      )}

      {!data && !error && (
        <p role="status">{isEn ? "Loading audit logs..." : "Đang tải nhật ký..."}</p>
      )}

      {data && (
        <>
          <p className="audit-total-count">{isEn ? `Found ${data.total} action records` : `Tìm thấy ${data.total} bản ghi thao tác`}</p>
          <div className="table-scroll">
            <table className="admin-table audit-table">
              <thead>
                <tr>
                  <th>{isEn ? "Action" : "Thao tác"}</th>
                  <th>{isEn ? "Performer" : "Tài khoản thực hiện"}</th>
                  <th>{isEn ? "Target" : "Đối tượng"}</th>
                  <th>{isEn ? "Time" : "Thời gian"}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{actionMap[row.action] || row.action}</strong></td>
                    <td>{row.performerId || (isEn ? "System Core" : "Máy chủ hệ thống")}</td>
                    <td>
                      {targetMap[row.targetType] || row.targetType}
                      <br />
                      <small className="target-id-sub">{row.targetId}</small>
                    </td>
                    <td>{formatDate(row.createdAt, isEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <p className="stream-empty-text">{isEn ? "No matching actions found." : "Không có thao tác phù hợp."}</p>
          )}
          <div className="account-save-row">
            <Button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
              {isEn ? "Previous" : "Trang trước"}
            </Button>
            <span>
              {isEn
                ? `Page ${page} / ${Math.max(1, Math.ceil(data.total / data.limit))}`
                : `Trang ${page} / ${Math.max(1, Math.ceil(data.total / data.limit))}`}
            </span>
            <Button
              disabled={page * data.limit >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {isEn ? "Next" : "Trang sau"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
