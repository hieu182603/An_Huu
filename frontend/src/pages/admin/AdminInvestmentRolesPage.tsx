import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import "./admin-management.css";
import "./admin-users.css";
import "./admin-gaps.css";
import { Alert, Badge, Button, Card, Input, Modal, SearchField, Switch } from "../../components/ui";
import { ApiError, authenticatedRequest } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";

export const INVESTMENT_ROLES = ["OPERATIONS", "DATA_ADMIN", "MODEL_ADMIN", "ADVISOR", "APPROVER", "SYSTEM_ADMIN"] as const;
export type InvestmentRole = (typeof INVESTMENT_ROLES)[number];
type Grant = { role: string; grantedBy: string | null; createdAt: string };
type AdminRoles = { userId: string; fullName: string; email: string; status: string; roles: Grant[] };
type RoleList = { items: AdminRoles[]; assignableRoles: string[] };
type Pending = { admin: AdminRoles; role: string; action: "grant" | "revoke" };

const ROLE_INFO: Record<string, { vi: [string, string]; en: [string, string] }> = {
  OPERATIONS: { vi: ["Vận hành", "Theo dõi nhà cung cấp dữ liệu và tình trạng đồng bộ."], en: ["Operations", "Monitors data providers and sync health."] },
  DATA_ADMIN: { vi: ["Quản trị dữ liệu", "Nhập và cập nhật dữ liệu sản phẩm đầu tư."], en: ["Data admin", "Enters and updates investment product data."] },
  MODEL_ADMIN: { vi: ["Quản trị mô hình", "Quản lý chính sách và mô hình danh mục."], en: ["Model admin", "Manages portfolio policies and models."] },
  ADVISOR: { vi: ["Chuyên viên tư vấn", "Lập đề xuất đầu tư cho người dùng."], en: ["Advisor", "Prepares investment proposals."] },
  APPROVER: { vi: ["Người duyệt", "Duyệt đề xuất đầu tư trước khi phát hành."], en: ["Approver", "Approves proposals before release."] },
  SYSTEM_ADMIN: { vi: ["Quản trị hệ thống", "Được cấp và thu hồi vai trò đầu tư cho quản trị viên."], en: ["System admin", "Grants and revokes investment roles."] },
};
const roleName = (role: string, isEn: boolean) => ROLE_INFO[role]?.[isEn ? "en" : "vi"][0] ?? role;
const roleHint = (role: string, isEn: boolean) => ROLE_INFO[role]?.[isEn ? "en" : "vi"][1] ?? "";
const STATUS: Record<string, [string, string]> = { ACTIVE: ["Đang hoạt động", "Active"], PENDING_VERIFICATION: ["Chờ xác minh", "Pending verification"], SUSPENDED: ["Đã khóa", "Suspended"] };
const FORBIDDEN_VI = "Chỉ quản trị viên hệ thống (SYSTEM_ADMIN) được phân quyền đầu tư.";
const FORBIDDEN_EN = "Only system administrators (SYSTEM_ADMIN) can manage investment roles.";

/** Maps the role API's error codes to messages an administrator can act on. */
export function investmentRoleError(error: unknown, isEn: boolean): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : String(error);
  switch (error.code) {
    case "FORBIDDEN": return isEn ? FORBIDDEN_EN : FORBIDDEN_VI;
    case "LAST_ROLE_MANAGER": return isEn
      ? "Cannot revoke: this is the last active SYSTEM_ADMIN. Grant SYSTEM_ADMIN to another administrator first."
      : "Không thể thu hồi: đây là SYSTEM_ADMIN đang hoạt động cuối cùng. Hãy cấp SYSTEM_ADMIN cho một quản trị viên khác trước.";
    case "INVESTMENT_ROLE_ADMIN_ONLY": return isEn
      ? "Investment roles can only be given to ADMIN accounts."
      : "Chỉ tài khoản quản trị (ADMIN) mới nhận vai trò đầu tư.";
    case "ROLE_NOT_GRANTED": return isEn
      ? "This account no longer has that role (someone may have revoked it). The row has been reloaded."
      : "Tài khoản này không còn vai trò đó (có thể người khác vừa thu hồi). Dòng đã được tải lại.";
    case "NOT_FOUND": return isEn ? "Account not found." : "Không tìm thấy tài khoản.";
    case "CONCURRENT_UPDATE": return isEn ? "Another change was saved at the same time. Please try again." : "Có thay đổi khác đang được lưu cùng lúc. Vui lòng thử lại.";
    default: return error.message;
  }
}

const formatDate = (value: string, isEn: boolean) =>
  new Date(value).toLocaleDateString(isEn ? "en-GB" : "vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function AdminInvestmentRolesPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const { user } = useAuth();
  const [myRoles, setMyRoles] = useState<string[] | null>(null);
  const [data, setData] = useState<RoleList | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const result = await authenticatedRequest<{ roles: string[] }>("/investments/permissions", undefined, "GET", undefined, { skipCache: true });
      setMyRoles(result.roles);
      return result.roles;
    } catch {
      setMyRoles(null); // Unknown: let the role API decide (it answers 403 itself).
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setForbidden(false);
    (async () => {
      const roles = await loadPermissions();
      if (!active) return;
      if (roles && !roles.includes("SYSTEM_ADMIN")) { setForbidden(true); return; }
      try {
        const list = await authenticatedRequest<RoleList>("/admin/investment-roles", undefined, "GET", undefined, { skipCache: true });
        if (active) setData(list);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(investmentRoleError(err, isEn));
      }
    })();
    return () => { active = false; };
  }, [retry, loadPermissions, isEn]);

  const replaceRow = (row: AdminRoles) =>
    setData((current) => current ? { ...current, items: current.items.map((item) => item.userId === row.userId ? { ...item, ...row } : item) } : current);

  const roles = data?.assignableRoles?.length ? data.assignableRoles : [...INVESTMENT_ROLES];
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const items = data?.items ?? [];
    return query ? items.filter((item) => `${item.fullName} ${item.email}`.toLocaleLowerCase().includes(query)) : items;
  }, [data, search]);
  const managers = data?.items.filter((item) => item.roles.some((grant) => grant.role === "SYSTEM_ADMIN")).length ?? 0;

  const onDone = async (row: AdminRoles & { changed?: boolean }, change: Pending) => {
    replaceRow(row);
    setPending(null);
    const name = roleName(change.role, isEn);
    if (change.action === "grant" && row.changed === false) {
      setNotice({ tone: "info", text: isEn ? `${row.fullName} already had the ${name} role. Nothing changed.` : `${row.fullName} đã có vai trò ${name} từ trước, không có thay đổi.` });
    } else {
      setNotice({ tone: "success", text: change.action === "grant"
        ? (isEn ? `Granted ${name} to ${row.fullName}.` : `Đã cấp vai trò ${name} cho ${row.fullName}.`)
        : (isEn ? `Revoked ${name} from ${row.fullName}.` : `Đã thu hồi vai trò ${name} của ${row.fullName}.`) });
    }
    if (row.userId === user?.id) {
      const mine = await loadPermissions();
      if (mine && !mine.includes("SYSTEM_ADMIN")) setForbidden(true);
    }
  };

  return (
    <div className="admin-page admin-management-page ag-roles-page">
      <div className="admin-page-header">
        <div>
          <span>{isEn ? "ACCESS CONTROL" : "KIỂM SOÁT TRUY CẬP"}</span>
          <h1>{isEn ? "Investment roles" : "Phân quyền đầu tư"}</h1>
          <p>{isEn
            ? "Investment roles are an extra permission layer on ADMIN accounts. Every change needs a reason and is written to the audit log."
            : "Vai trò đầu tư là lớp phân quyền phụ trên tài khoản ADMIN. Mỗi thay đổi cần lý do và được ghi vào nhật ký hệ thống."}</p>
        </div>
        <Button variant="secondary" icon="sparkles" onClick={() => setRetry((value) => value + 1)}>
          {isEn ? "Reload" : "Tải lại"}
        </Button>
      </div>

      {myRoles && (
        <p className="ag-my-roles">
          {isEn ? "Your investment roles:" : "Vai trò đầu tư của bạn:"}{" "}
          {myRoles.length ? myRoles.map((role) => <Badge key={role} tone="soft">{roleName(role, isEn)}</Badge>) : <em>{isEn ? "none" : "chưa có"}</em>}
        </p>
      )}

      {notice && <Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} />}

      {forbidden && (
        <Alert tone="warning" title={isEn ? FORBIDDEN_EN : FORBIDDEN_VI}>
          {isEn
            ? "Ask an administrator who holds SYSTEM_ADMIN to change roles. The first SYSTEM_ADMIN is granted once by the project owner."
            : "Hãy nhờ quản trị viên đang giữ SYSTEM_ADMIN thay đổi vai trò. SYSTEM_ADMIN đầu tiên do chủ dự án cấp một lần."}
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title={isEn ? "Could not load investment roles" : "Không tải được danh sách phân quyền"}
          action={<Button size="small" variant="secondary" onClick={() => setRetry((value) => value + 1)}>{isEn ? "Retry" : "Thử lại"}</Button>}>
          {error}
        </Alert>
      )}

      {!data && !error && !forbidden && <Card className="ag-state"><p role="status">{isEn ? "Loading investment roles…" : "Đang tải danh sách phân quyền…"}</p></Card>}

      {data && !forbidden && (
        <>
          <div className="admin-management-summary">
            <Card><span>{isEn ? "ADMIN accounts" : "Tài khoản ADMIN"}</span><strong>{data.items.length}</strong></Card>
            <Card><span>{isEn ? "SYSTEM_ADMIN holders" : "Đang giữ SYSTEM_ADMIN"}</span><strong>{managers}</strong></Card>
            <Card><span>{isEn ? "Assignable roles" : "Vai trò có thể cấp"}</span><strong>{roles.length}</strong></Card>
          </div>
          <Card className="admin-management-table-card">
            <div className="admin-management-section-header">
              <div>
                <h2>{isEn ? "Administrator accounts" : "Tài khoản quản trị"}</h2>
                <p>{isEn ? "Turn a role on or off; you will be asked to confirm and give a reason." : "Bật hoặc tắt từng vai trò; hệ thống sẽ hỏi xác nhận và lý do."}</p>
              </div>
              <SearchField label={isEn ? "Find administrator" : "Tìm quản trị viên"} hideLabel
                placeholder={isEn ? "Name or email" : "Họ tên hoặc email"} value={search} onChange={setSearch} />
            </div>
            {!visible.length && (
              <p className="admin-management-empty">{data.items.length
                ? (isEn ? "No administrator matches this search." : "Không có quản trị viên phù hợp.")
                : (isEn ? "There are no ADMIN accounts yet." : "Chưa có tài khoản ADMIN nào.")}</p>
            )}
            <ul className="ag-role-list">
              {visible.map((admin) => (
                <li key={admin.userId} className="ag-role-row" aria-label={admin.fullName}>
                  <div className="ag-role-person">
                    <strong>{admin.fullName}{admin.userId === user?.id && <Badge tone="info">{isEn ? "You" : "Bạn"}</Badge>}</strong>
                    <small>{admin.email}</small>
                    <Badge tone={admin.status === "ACTIVE" ? "success" : admin.status === "SUSPENDED" ? "danger" : "warning"}>{STATUS[admin.status]?.[isEn ? 1 : 0] ?? admin.status}</Badge>
                  </div>
                  <div className="ag-role-grid">
                    {roles.map((role) => {
                      const grant = admin.roles.find((item) => item.role === role);
                      return (
                        <div key={role} className={`ag-role-toggle ${grant ? "is-on" : ""}`}>
                          <Switch checked={Boolean(grant)} label={roleName(role, isEn)}
                            ariaLabel={`${roleName(role, isEn)} (${role}): ${admin.fullName}`}
                            onChange={() => { setNotice(null); setPending({ admin, role, action: grant ? "revoke" : "grant" }); }} />
                          <small>{grant
                            ? (isEn ? `Since ${formatDate(grant.createdAt, isEn)}` : `Từ ${formatDate(grant.createdAt, isEn)}`)
                            : roleHint(role, isEn)}</small>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Modal open={pending !== null} className="ag-confirm-modal"
        title={pending ? (pending.action === "grant"
          ? (isEn ? `Grant ${roleName(pending.role, isEn)}` : `Cấp vai trò ${roleName(pending.role, isEn)}`)
          : (isEn ? `Revoke ${roleName(pending.role, isEn)}` : `Thu hồi vai trò ${roleName(pending.role, isEn)}`)) : ""}
        onClose={() => { if (!busy) setPending(null); }}>
        {pending && (
          <RoleChangeForm key={`${pending.admin.userId}-${pending.role}`} change={pending} self={pending.admin.userId === user?.id}
            onBusyChange={setBusy} onCancel={() => setPending(null)} onDone={(row) => onDone(row, pending)}
            onStale={async () => {
              try { replaceRow(await authenticatedRequest<AdminRoles>(`/admin/investment-roles/${pending.admin.userId}`, undefined, "GET", undefined, { skipCache: true })); }
              catch { /* the list reload button still works */ }
            }} />
        )}
      </Modal>
    </div>
  );
}

function RoleChangeForm({ change, self, onCancel, onDone, onStale, onBusyChange }: {
  change: Pending; self: boolean;
  onCancel: () => void;
  onDone: (row: AdminRoles & { changed?: boolean }) => void;
  onStale: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { language } = useI18n();
  const isEn = language === "en";
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 500;
  const granting = change.action === "grant";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const row = await authenticatedRequest<AdminRoles & { changed: boolean }>(
        `/admin/investment-roles/${change.admin.userId}/${change.action}`, { role: change.role, reason: trimmed });
      onDone(row);
    } catch (err) {
      setError(investmentRoleError(err, isEn));
      if (err instanceof ApiError && err.code === "ROLE_NOT_GRANTED") onStale();
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <form className="admin-user-status-form ag-confirm-form" onSubmit={submit} aria-busy={busy}>
      <dl className="ag-confirm-facts">
        <div><dt>{isEn ? "Administrator" : "Quản trị viên"}</dt><dd><strong>{change.admin.fullName}</strong><small>{change.admin.email}</small></dd></div>
        <div><dt>{isEn ? "Role" : "Vai trò"}</dt><dd><strong>{roleName(change.role, isEn)}</strong><small><code>{change.role}</code> · {roleHint(change.role, isEn)}</small></dd></div>
      </dl>
      {!granting && self && change.role === "SYSTEM_ADMIN" && (
        <Alert tone="warning" title={isEn ? "You are revoking your own SYSTEM_ADMIN role" : "Bạn đang thu hồi SYSTEM_ADMIN của chính mình"}>
          {isEn ? "You will no longer be able to manage investment roles." : "Sau khi thu hồi, bạn không còn phân quyền đầu tư được nữa."}
        </Alert>
      )}
      <Input label={isEn ? "Reason (required)" : "Lý do (bắt buộc)"}
        placeholder={isEn ? "Why is this change needed?" : "Vì sao cần thay đổi này?"}
        helper={isEn ? "3–500 characters. Saved to the audit log." : "Từ 3–500 ký tự. Lý do được lưu vào nhật ký hệ thống."}
        value={reason} onChange={setReason} disabled={busy} />
      {error && <p role="alert" className="admin-user-status-error">{error}</p>}
      <div className="admin-user-status-footer">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{isEn ? "Cancel" : "Hủy bỏ"}</Button>
        <Button type="submit" variant={granting ? "primary" : "danger"} loading={busy} disabled={!valid}>
          {granting ? (isEn ? "Confirm grant" : "Xác nhận cấp") : (isEn ? "Confirm revoke" : "Xác nhận thu hồi")}
        </Button>
      </div>
    </form>
  );
}
