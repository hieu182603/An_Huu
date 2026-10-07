import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Input, Pagination, Select } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { useI18n } from "../../i18n";

type AuditEntry = { id: string; action: string; targetType: string; targetId: string; performerId: string | null; createdAt: string };
type AuditPage = { items: AuditEntry[]; total: number; page: number; limit: number };

const formatDate = (v: string | null, isEn: boolean) =>
  v ? new Date(v).toLocaleString(isEn ? "en-US" : "vi-VN") : isEn ? "Not recorded" : "Chưa ghi nhận";

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
          <h2>{isEn ? "Platform Audit & Activity Trail" : "Log hệ thống & Hoạt động nền tảng"}</h2>
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

export default AdminAuditPage;
