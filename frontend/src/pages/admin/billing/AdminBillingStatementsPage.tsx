import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Icon, Input, Pagination, SearchField, Select, Switch } from "../../../components/ui";
import AdminActionButton from "../AdminActionButton";
import {
  STATEMENT_STATUS_LABEL, adminBilling, billingErrorMessage, currentPeriod, downloadBillingCsv, formatDate, formatPeriod, formatVnd, isPeriod,
  markBillingDisabled, type AdminStatement, type Page,
} from "../../../services/adminBilling";
import { ErrorAlert, PageHeader, StatementBadge, UserCell } from "./billingShared";

const StatementDrawer = lazy(() => import("./StatementDrawer"));

const STATUS_OPTIONS = [{ value: "", label: "Tất cả trạng thái" }, ...Object.entries(STATEMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))];

export default function AdminBillingStatementsPage() {
  const [params, setParams] = useSearchParams();
  const openId = params.get("statementId");
  const [period, setPeriod] = useState(params.get("period") ?? currentPeriod());
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [hasAlert, setHasAlert] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Page<AdminStatement> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (period && !isPeriod(period)) return;
    let active = true;
    setLoading(true);
    setError("");
    adminBilling.statements({ page, limit: pageSize, period: period || undefined, status: status || undefined, q: q || undefined, overdueOnly, hasAlert })
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active && !markBillingDisabled(err)) setError(billingErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, status, q, overdueOnly, hasAlert, page, pageSize, reload]);

  // Search as the admin types, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => { setQ(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const openStatement = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("statementId", id); else next.delete("statementId");
    setParams(next, { replace: true });
  };
  const exportCsv = useCallback(async () => {
    const target = isPeriod(period) ? period : currentPeriod();
    setExporting(true);
    setNotice(null);
    try { const name = await downloadBillingCsv(target); setNotice({ tone: "success", text: `Đã tải ${name}.` }); }
    catch (err) { setNotice({ tone: "danger", text: billingErrorMessage(err) }); }
    finally { setExporting(false); }
  }, [period]);
  const filtered = Boolean(status || q || overdueOnly || hasAlert);
  const clearFilters = () => { setStatus(""); setSearchInput(""); setQ(""); setOverdueOnly(false); setHasAlert(false); setPage(1); };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="admin-page ab-page">
      <PageHeader title="Kỳ phí" description="Mỗi dòng là phí dịch vụ của một người dùng trong một tháng. Bấm vào dòng để xem sổ chi tiết và xử lý.">
        <div className="ab-header-actions">
          <Button variant="secondary" icon="download" loading={exporting} onClick={exportCsv}>Xuất CSV tháng {formatPeriod(isPeriod(period) ? period : currentPeriod())}</Button>
          <Button variant="ghost" icon="sparkles" onClick={() => setReload((value) => value + 1)} disabled={loading}>Làm mới</Button>
        </div>
      </PageHeader>

      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}

      <Card className="admin-filter-card">
        <div className="admin-user-search">
          <SearchField label="Tìm theo email hoặc tên" hideLabel placeholder="Email hoặc họ tên người dùng…" value={searchInput} onChange={setSearchInput} />
        </div>
        <div className="admin-filters">
          <Input label="Tháng" type="month" value={period} onChange={(value) => { setPeriod(value); setPage(1); }} helper={period ? undefined : "Mọi tháng"} />
          <Select label="Trạng thái" options={STATUS_OPTIONS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />
          <div className="ab-switches">
            <Switch label="Chỉ quá hạn" checked={overdueOnly} onChange={(value) => { setOverdueOnly(value); setPage(1); }} />
            <Switch label="Có cảnh báo" checked={hasAlert} onChange={(value) => { setHasAlert(value); setPage(1); }} />
          </div>
          {period && <Button variant="ghost" onClick={() => { setPeriod(""); setPage(1); }}>Mọi tháng</Button>}
          {filtered && <Button variant="ghost" onClick={clearFilters}><Icon name="trash" size="small" /> Xóa bộ lọc</Button>}
        </div>
      </Card>

      {error && <ErrorAlert message={error} onRetry={() => setReload((value) => value + 1)} />}

      <Card className="admin-table-card">
        <div className="admin-users-table-wrap">
          <table className="admin-users-table admin-stack-table ab-table">
            <thead>
              <tr>
                <th>Kỳ</th><th>Người dùng</th><th className="ab-num">Phí phải thu</th><th className="ab-num col-optional">Giảm</th>
                <th className="ab-num col-optional">Đã thu</th><th className="ab-num col-optional">Đã hoàn</th><th className="ab-num">Còn phải thu</th>
                <th className="ab-num col-optional">Thu thừa</th><th className="col-optional">Hạn</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data?.items.length ? (
                <tr><td colSpan={11} className="ab-empty"><Icon name="sparkles" /> Đang tải kỳ phí…</td></tr>
              ) : !data?.items.length ? (
                <tr><td colSpan={11} className="ab-empty">Không có kỳ phí nào phù hợp bộ lọc.</td></tr>
              ) : data.items.map((row) => (
                <tr key={row.id} className="ab-row-click" tabIndex={0} onClick={() => openStatement(row.id)}
                  onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) openStatement(row.id); }}>
                  <td data-label="Kỳ">{formatPeriod(row.period)}</td>
                  <td><UserCell user={row.user} /></td>
                  <td className="ab-num" data-label="Phí phải thu">{formatVnd(row.amountVnd)}</td>
                  <td className="ab-num col-optional" data-label="Giảm">{formatVnd(row.adjustedVnd)}</td>
                  <td className="ab-num col-optional" data-label="Đã thu">{formatVnd(row.paidVnd)}</td>
                  <td className="ab-num col-optional" data-label="Đã hoàn">{formatVnd(row.refundedVnd)}</td>
                  <td className="ab-num" data-label="Còn phải thu">{formatVnd(row.amountDueVnd)}</td>
                  <td className="ab-num col-optional" data-label="Thu thừa">{row.overpaidVnd > 0 ? <Badge tone="honey">{formatVnd(row.overpaidVnd)}</Badge> : "—"}</td>
                  <td className="col-optional" data-label="Hạn">{formatDate(row.dueDate)}</td>
                  <td data-label="Trạng thái"><StatementBadge status={row.status} /></td>
                  <td><AdminActionButton icon="eye" label="Xem chi tiết kỳ phí" context={`${row.user?.email ?? ""} ${formatPeriod(row.period)}`} onClick={() => openStatement(row.id)} /></td>
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

      {openId && (
        <Suspense fallback={null}>
          <StatementDrawer statementId={openId} onClose={() => openStatement(null)} onChanged={() => setReload((value) => value + 1)} />
        </Suspense>
      )}
    </div>
  );
}
