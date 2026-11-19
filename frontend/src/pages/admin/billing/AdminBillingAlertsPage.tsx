import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Icon, Pagination, Switch } from "../../../components/ui";
import { ApiError } from "../../../services/api";
import {
  ALERT_TYPE_LABEL, adminBilling, billingErrorMessage, formatDateTime, formatPeriod, formatVnd, formatVndText, markBillingDisabled,
  type AdminAlert, type Page,
} from "../../../services/adminBilling";
import { ErrorAlert, PageHeader, PermissionHint, UserCell, WriteDialog, usePerms } from "./billingShared";

const StatementDrawer = lazy(() => import("./StatementDrawer"));
const toneOf = (type: AdminAlert["type"]) => (type === "UNDERPAID" ? "warning" : type === "OVERPAID" ? "honey" : "danger") as "warning" | "honey" | "danger";
const HINT: Record<AdminAlert["type"], string> = {
  UNDERPAID: "Khách chuyển thiếu. Chờ khách chuyển bù, hoặc ghi nhận/giảm kỳ phí rồi đánh dấu đã xử lý.",
  OVERPAID: "Thu thừa: hoàn lại phần thừa cho khách (Hoàn tiền) rồi cảnh báo tự biến mất.",
  EXTRA_TRANSFER: "Khoản này CHƯA nằm trong sổ: ghi nhận thủ công hoặc hoàn lại cho khách.",
};

export default function AdminBillingAlertsPage() {
  const perms = usePerms();
  const [params, setParams] = useSearchParams();
  const openId = params.get("statementId");
  const [includeResolved, setIncludeResolved] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<(Page<AdminAlert> & { unresolvedCount: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [target, setTarget] = useState<AdminAlert | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminBilling.alerts({ page, limit: pageSize, includeResolved })
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active && !markBillingDisabled(err)) setError(billingErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [includeResolved, page, pageSize, reload]);

  const openStatement = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("statementId", id); else next.delete("statementId");
    setParams(next, { replace: true });
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="admin-page ab-page">
      <PageHeader title="Cảnh báo & đối soát" description="Cảnh báo được tính từ dữ liệu: khi vấn đề được sửa (đã hoàn hoặc đã thu đủ) cảnh báo tự biến mất. Đánh dấu Đã xử lý để ghi lại cách xử lý.">
        <div className="ab-header-actions"><Button variant="ghost" icon="sparkles" onClick={() => setReload((value) => value + 1)} disabled={loading}>Làm mới</Button></div>
      </PageHeader>

      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}

      <Card className="admin-filter-card">
        <div className="ab-switches">
          <Switch label="Hiện cả đã xử lý" checked={includeResolved} onChange={(value) => { setIncludeResolved(value); setPage(1); }} />
        </div>
        {data && <p className="ab-note" style={{ marginLeft: "auto" }}>Chưa xử lý: <strong>{data.unresolvedCount}</strong></p>}
      </Card>

      {!perms.canOperate && <PermissionHint need="OPERATIONS" />}
      {error && <ErrorAlert message={error} onRetry={() => setReload((value) => value + 1)} />}

      <Card className="admin-table-card">
        <div className="admin-users-table-wrap">
          <table className="admin-users-table admin-stack-table ab-table">
            <thead>
              <tr><th>Loại</th><th>Người dùng</th><th>Kỳ</th><th className="ab-num">Số tiền</th><th>Nội dung</th><th className="col-optional">Phát sinh</th><th>Xử lý</th></tr>
            </thead>
            <tbody>
              {loading && !data?.items.length ? (
                <tr><td colSpan={7} className="ab-empty"><Icon name="sparkles" /> Đang tải cảnh báo…</td></tr>
              ) : !data?.items.length ? (
                <tr><td colSpan={7} className="ab-empty">{includeResolved ? "Không có cảnh báo nào." : "Không có cảnh báo nào chưa xử lý."}</td></tr>
              ) : data.items.map((alert) => (
                <tr key={alert.key}>
                  <td data-label="Loại"><Badge tone={toneOf(alert.type)}>{ALERT_TYPE_LABEL[alert.type]}</Badge></td>
                  <td><UserCell user={alert.user} /></td>
                  <td data-label="Kỳ">{formatPeriod(alert.period)}</td>
                  <td className="ab-num" data-label="Số tiền">{formatVnd(alert.amountVnd)}</td>
                  <td className="ab-wrap">{alert.message}<small>{HINT[alert.type]}</small></td>
                  <td className="col-optional" data-label="Phát sinh">{formatDateTime(alert.occurredAt)}</td>
                  <td className="ab-wrap">
                    <div className="ab-row-actions">
                      <Button size="small" variant="secondary" onClick={() => openStatement(alert.statementId)}>Xem kỳ phí</Button>
                      {alert.resolved ? null : perms.canOperate && <Button size="small" onClick={() => setTarget(alert)}>Đã xử lý</Button>}
                    </div>
                    {alert.resolved && <small>Đã xử lý {formatDateTime(alert.resolved.at)}: {alert.resolved.note}</small>}
                  </td>
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

      {target && (
        <WriteDialog open title="Đánh dấu đã xử lý" reasonField="note" reasonLabel="Ghi chú xử lý (bắt buộc)" onClose={() => setTarget(null)}
          summary={<>Đánh dấu đã xử lý cảnh báo <strong>{ALERT_TYPE_LABEL[target.type]}</strong> {formatVndText(target.amountVnd)} của kỳ {formatPeriod(target.period)} ({target.user?.email ?? "tài khoản đã xóa"}). Cảnh báo sẽ ẩn khỏi danh sách mặc định.</>}
          confirmLabel="Xác nhận đã xử lý"
          onSubmit={async ({ reason }) => {
            try {
              await adminBilling.resolveAlert({ key: target.key, note: reason });
              setNotice({ tone: "success", text: "Đã đánh dấu cảnh báo là đã xử lý." });
            } catch (err) {
              if (err instanceof ApiError && err.status === 404) {
                setNotice({ tone: "info", text: "Cảnh báo này không còn nữa (vấn đề đã được sửa). Danh sách đã được tải lại." });
              } else {
                if (err instanceof ApiError && err.code === "ALERT_ALREADY_RESOLVED") setReload((value) => value + 1);
                throw err;
              }
            }
            setTarget(null);
            setReload((value) => value + 1);
          }} />
      )}

      {openId && (
        <Suspense fallback={null}>
          <StatementDrawer statementId={openId} onClose={() => openStatement(null)} onChanged={() => setReload((value) => value + 1)} />
        </Suspense>
      )}
    </div>
  );
}
