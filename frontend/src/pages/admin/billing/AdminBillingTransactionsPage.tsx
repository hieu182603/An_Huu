import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Button, Card, Icon, Input, Pagination, Select } from "../../../components/ui";
import {
  ORDER_STATUS_LABEL, RECONCILE_OUTCOME_LABEL, adminBilling, formatDateTime, formatPeriod, formatVnd, formatVndText, billingErrorMessage, markBillingDisabled,
  type AdminOrderRow, type Page, type ReconcileOutcome,
} from "../../../services/adminBilling";
import { ErrorAlert, OrderBadge, PageHeader, PermissionHint, UserCell, WriteDialog, usePerms } from "./billingShared";

const StatementDrawer = lazy(() => import("./StatementDrawer"));
const STATUS_OPTIONS = [{ value: "", label: "Tất cả trạng thái" }, ...Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label }))];
const isDay = (value: string) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function AdminBillingTransactionsPage() {
  const perms = usePerms();
  const [params, setParams] = useSearchParams();
  const openId = params.get("statementId");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Page<AdminOrderRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [target, setTarget] = useState<AdminOrderRow | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "warning"; text: string } | null>(null);
  const rangeInvalid = Boolean(from && to && from > to);

  useEffect(() => {
    if (!isDay(from) || !isDay(to) || rangeInvalid) return;
    let active = true;
    setLoading(true);
    setError("");
    adminBilling.orders({ page, limit: pageSize, status: status || undefined, from: from || undefined, to: to || undefined })
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active && !markBillingDisabled(err)) setError(billingErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, from, to, page, pageSize, reload, rangeInvalid]);

  const openStatement = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("statementId", id); else next.delete("statementId");
    setParams(next, { replace: true });
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="admin-page ab-page">
      <PageHeader title="Giao dịch payOS" description="Các mã thanh toán đã tạo cho người dùng. Bấm vào dòng để mở kỳ phí tương ứng.">
        <div className="ab-header-actions"><Button variant="ghost" icon="sparkles" onClick={() => setReload((value) => value + 1)} disabled={loading}>Làm mới</Button></div>
      </PageHeader>

      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}

      <Card className="admin-filter-card ab-filter-card ab-filter-transactions">
          <Select label="Trạng thái" options={STATUS_OPTIONS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />
          <Input label="Từ ngày" type="date" value={from} onChange={(value) => { setFrom(value); setPage(1); }} />
          <Input label="Đến ngày" type="date" value={to} onChange={(value) => { setTo(value); setPage(1); }}
            error={rangeInvalid ? "Đến ngày phải sau hoặc bằng Từ ngày" : undefined} helper="Gồm cả ngày cuối (giờ Việt Nam)" />
          {(status || from || to) && <div className="ab-filter-actions"><Button variant="ghost" onClick={() => { setStatus(""); setFrom(""); setTo(""); setPage(1); }}><Icon name="trash" size="small" /> Xóa bộ lọc</Button></div>}
      </Card>

      {!perms.canOperate && <PermissionHint need="OPERATIONS" />}
      {error && <ErrorAlert message={error} onRetry={() => setReload((value) => value + 1)} />}

      <Card className="admin-table-card">
        <div className="admin-users-table-wrap">
          <table className="admin-users-table admin-stack-table ab-table">
            <thead>
              <tr>
                <th>Mã đơn</th><th>Người dùng</th><th>Kỳ</th><th className="ab-num">Số tiền</th><th>Trạng thái</th>
                <th className="ab-num col-optional">Thực nhận</th><th className="col-optional">Mã tham chiếu</th><th className="col-optional">Thời điểm</th><th><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data?.items.length ? (
                <tr><td colSpan={9} className="ab-empty"><Icon name="sparkles" /> Đang tải giao dịch…</td></tr>
              ) : !data?.items.length ? (
                <tr><td colSpan={9} className="ab-empty">Không có giao dịch nào phù hợp bộ lọc.</td></tr>
              ) : data.items.map((row) => (
                <tr key={row.id} className="ab-row-click" tabIndex={0} onClick={() => openStatement(row.statementId)}
                  onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) openStatement(row.statementId); }}>
                  <td data-label="Mã đơn">#{row.orderCode}</td>
                  <td><UserCell user={row.user} /></td>
                  <td data-label="Kỳ">{formatPeriod(row.period)}</td>
                  <td className="ab-num" data-label="Số tiền">{formatVnd(row.amountVnd)}</td>
                  <td data-label="Trạng thái"><OrderBadge status={row.status} /></td>
                  <td className="ab-num col-optional" data-label="Thực nhận">{row.receivedVnd === null ? "—" : formatVnd(row.receivedVnd)}</td>
                  <td className="col-optional" data-label="Mã tham chiếu">{row.bankReference ?? "—"}</td>
                  <td className="col-optional" data-label="Thời điểm">{formatDateTime(row.paidAt ?? row.createdAt)}</td>
                  <td>
                    {perms.canOperate && (row.status === "PENDING" || row.status === "UNDERPAID") && (
                      <Button size="small" variant="secondary" onClick={(event) => { event.stopPropagation(); setTarget(row); }}>Kiểm tra lại payOS</Button>
                    )}
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
        <WriteDialog open title="Kiểm tra lại payOS" errorContext="reconcile" onClose={() => setTarget(null)}
          summary={<>Hỏi payOS về mã thanh toán <strong>#{target.orderCode}</strong> ({formatVndText(target.amountVnd)}) của kỳ {formatPeriod(target.period)} ({target.user?.email ?? "tài khoản đã xóa"}). Nếu payOS đã nhận tiền, hệ thống sẽ ghi nhận thanh toán.</>}
          confirmLabel="Kiểm tra lại"
          onSubmit={async ({ reason }) => {
            const result = await adminBilling.reconcile(target.id, { reason });
            const outcome = result.outcome as ReconcileOutcome;
            setNotice({ tone: outcome === "APPLIED" ? "success" : outcome === "PENDING" ? "info" : "warning", text: `#${target.orderCode}: ${RECONCILE_OUTCOME_LABEL[outcome] ?? outcome}` });
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
