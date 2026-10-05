import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Input, Select } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { useI18n } from "../../i18n";

type Overview = {
  asOfDate: string; uptimeSeconds: number;
  configuration: { email: boolean; encryption: boolean; google: boolean; media: boolean };
  mailJobs: Record<string, number>;
  recentFailures: { id: string; type: string; attempts: number; lastErrorCode: string | null; createdAt: string }[];
  lastJobCompletedAt: string | null;
};
type AuditEntry = { id: string; action: string; targetType: string; targetId: string; performerId: string | null; createdAt: string };
type AuditPage = { items: AuditEntry[]; total: number; page: number; limit: number };

const formatDate = (value: string | null, isEn: boolean) =>
  value ? new Date(value).toLocaleString(isEn ? "en-US" : "vi-VN") : isEn ? "Not recorded" : "Chưa ghi nhận";

const formatMessage = (error: unknown, isEn: boolean) =>
  error instanceof Error ? error.message : isEn ? "Failed to load data. Please try again." : "Không tải được dữ liệu. Vui lòng thử lại.";

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
  AUTH_REGISTER: "Đăng ký", AUTH_VERIFY_EMAIL: "Xác minh email", AUTH_LOGIN: "Đăng nhập", AUTH_LOGOUT: "Đăng xuất",
  AUTH_LOGOUT_ALL: "Đăng xuất mọi thiết bị", AUTH_CHANGE_PASSWORD: "Đổi mật khẩu", AUTH_RESET_PASSWORD: "Khôi phục mật khẩu",
  AUTH_REFRESH_REUSE: "Phát hiện sử dụng lại phiên", AUTH_LOGIN_GOOGLE: "Đăng nhập Google", AUTH_REGISTER_GOOGLE: "Đăng ký Google",
  ACCOUNT_UPDATED: "Cập nhật tài khoản", ACCOUNT_AVATAR_UPDATED: "Đổi ảnh đại diện", ADMIN_USER_STATUS: "Đổi trạng thái tài khoản",
  CONTENT_CREATED: "Tạo nội dung", CONTENT_UPDATED: "Sửa nội dung", SUPPORT_CREATED: "Tạo yêu cầu hỗ trợ",
  SUPPORT_REPLIED: "Phản hồi hỗ trợ", SUPPORT_STATUS: "Đổi trạng thái hỗ trợ", CONSULTATION_REQUESTED: "Đăng ký tư vấn",
  CONSULTATION_UPDATED: "Cập nhật tư vấn", PROFILE_UPDATED: "Cập nhật hồ sơ tài chính", ONBOARDING_COMPLETED: "Hoàn tất hồ sơ",
};

const actionsEn: Record<string, string> = {
  AUTH_REGISTER: "Register", AUTH_VERIFY_EMAIL: "Verify Email", AUTH_LOGIN: "Log In", AUTH_LOGOUT: "Log Out",
  AUTH_LOGOUT_ALL: "Log Out All Devices", AUTH_CHANGE_PASSWORD: "Change Password", AUTH_RESET_PASSWORD: "Reset Password",
  AUTH_REFRESH_REUSE: "Session Reuse Detected", AUTH_LOGIN_GOOGLE: "Google Log In", AUTH_REGISTER_GOOGLE: "Google Register",
  ACCOUNT_UPDATED: "Account Updated", ACCOUNT_AVATAR_UPDATED: "Avatar Changed", ADMIN_USER_STATUS: "User Status Changed",
  CONTENT_CREATED: "Content Created", CONTENT_UPDATED: "Content Updated", SUPPORT_CREATED: "Support Ticket Created",
  SUPPORT_REPLIED: "Support Replied", SUPPORT_STATUS: "Support Status Changed", CONSULTATION_REQUESTED: "Consultation Requested",
  CONSULTATION_UPDATED: "Consultation Updated", PROFILE_UPDATED: "Financial Profile Updated", ONBOARDING_COMPLETED: "Onboarding Completed",
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
        if (active) setError(formatMessage(err, isEn));
      });
    return () => {
      active = false;
    };
  }, [retry, isEn]);

  const configLabels = isEn
    ? [
        ["email", "Send Email"],
        ["encryption", "Email Data Encryption"],
        ["google", "Google Sign-In"],
        ["media", "Media Storage"],
      ]
    : [
        ["email", "Gửi email"],
        ["encryption", "Bảo vệ dữ liệu email"],
        ["google", "Đăng nhập Google"],
        ["media", "Lưu ảnh"],
      ];

  const queueLabels = isEn
    ? { PENDING: "Pending", PROCESSING: "Processing", COMPLETED: "Completed", FAILED: "Failed" }
    : { PENDING: "Đang chờ", PROCESSING: "Đang xử lý", COMPLETED: "Đã xử lý", FAILED: "Thất bại" };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{isEn ? "System Status" : "Tình trạng hệ thống"}</h1>
          <p>{isEn ? "Monitor connectivity and email processing." : "Theo dõi kết nối và xử lý email."}</p>
        </div>
        <Button disabled={!data && !error} onClick={() => setRetry((value) => value + 1)}>
          {isEn ? "Refresh" : "Cập nhật"}
        </Button>
      </div>

      {error && (
        <Alert tone="danger" title={isEn ? "Could not load status" : "Chưa tải được tình trạng"}>
          {error}
        </Alert>
      )}

      {!data && !error && (
        <p role="status">{isEn ? "Loading system status..." : "Đang tải tình trạng hệ thống..."}</p>
      )}

      {data && (
        <>
          <Card>
            <h2>{isEn ? "Connectivity" : "Kết nối"}</h2>
            <Badge tone="success">
              {isEn ? "API and database operational" : "API và dữ liệu đã phản hồi"}
            </Badge>
            <p>
              {isEn
                ? `Updated at ${formatDate(data.asOfDate, isEn)} · Uptime: ${Math.floor(data.uptimeSeconds / 60)} minutes.`
                : `Cập nhật lúc ${formatDate(data.asOfDate, isEn)} · API đã chạy ${Math.floor(data.uptimeSeconds / 60)} phút.`}
            </p>
            <p>
              {isEn
                ? `Last completed task: ${formatDate(data.lastJobCompletedAt, isEn)}. This reflects processing history, not real-time daemon status.`
                : `Tác vụ hoàn tất gần nhất: ${formatDate(data.lastJobCompletedAt, isEn)}. Đây là lịch sử xử lý, không xác nhận dịch vụ nền đang chạy.`}
            </p>
            <div className="account-form-grid">
              {configLabels.map(([key, label]) => (
                <div key={key}>
                  <strong>{label}</strong>
                  <p>
                    <Badge tone={data.configuration[key as keyof typeof data.configuration] ? "success" : "warning"}>
                      {data.configuration[key as keyof typeof data.configuration]
                        ? isEn
                          ? "Configured"
                          : "Đã có cấu hình"
                        : isEn
                        ? "Not configured"
                        : "Chưa có cấu hình"}
                    </Badge>
                  </p>
                </div>
              ))}
            </div>
            <p>
              {isEn
                ? "Having configuration does not guarantee that the provider has authorized access or connection succeeded."
                : "Có cấu hình chưa đồng nghĩa nhà cung cấp đã cấp quyền hoặc kết nối thành công."}
            </p>
          </Card>

          <Card>
            <h2>{isEn ? "Email Queue" : "Hàng đợi email"}</h2>
            <div className="account-form-grid">
              {Object.entries(queueLabels).map(([key, label]) => (
                <div key={key}>
                  <strong>{label}</strong>
                  <p>{data.mailJobs[key] || 0}</p>
                </div>
              ))}
            </div>
            <p>
              {isEn
                ? "Processed tasks may have expired or been skipped; this is not mailbox delivery statistics."
                : "Tác vụ đã xử lý có thể đã hết hạn và được bỏ qua; không phải thống kê email đã đến hộp thư."}
            </p>
          </Card>

          <Card>
            <h2>{isEn ? "Recent Failed Emails" : "Email xử lý thất bại gần đây"}</h2>
            {!data.recentFailures.length ? (
              <p>{isEn ? "No errors recorded." : "Chưa có lỗi được ghi nhận."}</p>
            ) : (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{isEn ? "Email Type" : "Loại email"}</th>
                      <th>{isEn ? "Attempts" : "Số lần xử lý"}</th>
                      <th>{isEn ? "Reason" : "Nguyên nhân"}</th>
                      <th>{isEn ? "Created Date" : "Ngày tạo"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentFailures.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.type === "auth.verify_email"
                            ? isEn
                              ? "Account Verification"
                              : "Xác minh tài khoản"
                            : isEn
                            ? "Password Recovery"
                            : "Khôi phục mật khẩu"}
                        </td>
                        <td>{row.attempts}</td>
                        <td>
                          {(isEn ? mailErrorsEn : mailErrorsVi)[row.lastErrorCode || ""] ||
                            (isEn ? "Processing failed" : "Xử lý chưa thành công")}
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
        if (active) setError(formatMessage(err, isEn));
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
      <h2>{isEn ? "Action Audit Log" : "Nhật ký thao tác"}</h2>
      <p>
        {isEn
          ? "Server-recorded history. Account IDs and target objects assist in troubleshooting."
          : "Lịch sử được ghi tại máy chủ. Mã tài khoản và đối tượng giúp đối chiếu khi xử lý sự cố."}
      </p>
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
          <p>{isEn ? `${data.total} actions` : `${data.total} thao tác`}</p>
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
                    <td>{actionMap[row.action] || row.action}</td>
                    <td>{row.performerId || (isEn ? "System" : "Hệ thống")}</td>
                    <td>
                      {targetMap[row.targetType] || row.targetType}
                      <br />
                      {row.targetId}
                    </td>
                    <td>{formatDate(row.createdAt, isEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && (
            <p>{isEn ? "No matching actions found." : "Không có thao tác phù hợp."}</p>
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
