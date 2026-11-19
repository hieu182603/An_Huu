import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Icon, Pagination } from "../../../components/ui";
import {
  OVERRIDE_KIND_LABEL, adminBilling, billingErrorMessage, formatPeriod, markBillingDisabled, type AdminOverride, type Page,
} from "../../../services/adminBilling";
import { ErrorAlert, PageHeader, PermissionHint, UserCell, usePerms } from "./billingShared";
import { CreateOverrideDialog, RevokeOverrideDialog, UserPicker, overrideValueText, type PickedUser } from "./OverrideDialogs";

export default function AdminBillingOverridesPage() {
  const perms = usePerms();
  const [filterUser, setFilterUser] = useState<PickedUser | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Page<AdminOverride> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<AdminOverride | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminBilling.overrides({ page, limit: pageSize, userId: filterUser?.id })
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active && !markBillingDisabled(err)) setError(billingErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterUser, page, pageSize, reload]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="admin-page ab-page">
      <PageHeader title="Điều chỉnh theo người dùng" description="Ưu đãi riêng cho từng tài khoản: giảm %, phí cố định hoặc miễn phí theo khoảng kỳ. Chỉ hiện ưu đãi còn hiệu lực.">
        <div className="ab-header-actions">
          {perms.canOperate && <Button icon="plus" onClick={() => setCreating(true)}>Tạo ưu đãi</Button>}
          <Button variant="ghost" icon="sparkles" onClick={() => setReload((value) => value + 1)} disabled={loading}>Làm mới</Button>
        </div>
      </PageHeader>
      {!perms.canOperate && <PermissionHint need="OPERATIONS" />}
      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}

      <Card className="admin-filter-card">
        <div style={{ flex: "1 1 320px", maxWidth: 520 }}>
          <UserPicker label="Lọc theo người dùng" value={filterUser} onChange={(user) => { setFilterUser(user); setPage(1); }} />
        </div>
      </Card>

      {error && <ErrorAlert message={error} onRetry={() => setReload((value) => value + 1)} />}

      <Card className="admin-table-card">
        <div className="admin-users-table-wrap">
          <table className="admin-users-table admin-stack-table ab-table">
            <thead>
              <tr><th>Người dùng</th><th>Loại</th><th>Giá trị</th><th>Từ kỳ</th><th>Đến kỳ</th><th className="col-optional">Lý do</th>{perms.canOperate && <th><span className="sr-only">Thao tác</span></th>}</tr>
            </thead>
            <tbody>
              {loading && !data?.items.length ? (
                <tr><td colSpan={7} className="ab-empty"><Icon name="sparkles" /> Đang tải ưu đãi…</td></tr>
              ) : !data?.items.length ? (
                <tr><td colSpan={7} className="ab-empty">Chưa có ưu đãi nào còn hiệu lực.</td></tr>
              ) : data.items.map((row) => (
                <tr key={row.id}>
                  <td><UserCell user={row.user} /></td>
                  <td data-label="Loại"><Badge tone={row.kind === "WAIVE" ? "info" : "soft"}>{OVERRIDE_KIND_LABEL[row.kind]}</Badge></td>
                  <td data-label="Giá trị">{overrideValueText(row)}</td>
                  <td data-label="Từ kỳ">{formatPeriod(row.fromPeriod)}</td>
                  <td data-label="Đến kỳ">{row.toPeriod ? formatPeriod(row.toPeriod) : "Đến khi thu hồi"}</td>
                  <td className="ab-wrap col-optional">{row.reason}</td>
                  {perms.canOperate && <td><Button size="small" variant="secondary" onClick={() => setRevoking(row)}>Thu hồi</Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > 0 && (
          <Pagination page={page} totalPages={totalPages} totalItems={data.total} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        )}
      </Card>

      {creating && <CreateOverrideDialog onClose={() => setCreating(false)} onDone={(text) => { setCreating(false); setNotice({ tone: "success", text }); setReload((value) => value + 1); }} />}
      {revoking && <RevokeOverrideDialog override={revoking} onClose={() => setRevoking(null)} onDone={(tone, text) => { setRevoking(null); setNotice({ tone, text }); setReload((value) => value + 1); }} />}
    </div>
  );
}
