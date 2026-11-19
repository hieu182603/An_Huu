import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, Badge, Button, Card, Icon, Input } from "../../../components/ui";
import {
  STATEMENT_STATUS_LABEL, adminBilling, billingErrorMessage, currentPeriod, downloadBillingCsv, formatPeriod, formatRate, formatVnd, isPeriod,
  markBillingDisabled, statementTone, type AdminOverview, type StatementStatus,
} from "../../../services/adminBilling";
import { ErrorAlert, PageHeader } from "./billingShared";

const compact = (value: number) =>
  value >= 1e9 ? `${(value / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ` : value >= 1e6 ? `${(value / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr` : value.toLocaleString("vi-VN");

export default function AdminBillingOverviewPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (!isPeriod(period)) return;
    let active = true;
    setLoading(true);
    setError("");
    adminBilling.overview(period)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active && !markBillingDisabled(err)) setError(billingErrorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, reload]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    setNotice(null);
    try { const name = await downloadBillingCsv(period); setNotice({ tone: "success", text: `Đã tải ${name}.` }); }
    catch (err) { setNotice({ tone: "danger", text: billingErrorMessage(err) }); }
    finally { setExporting(false); }
  }, [period]);

  const totals = data?.totals;
  const chart = (data?.series ?? []).map((row) => ({ ...row, label: formatPeriod(row.period), rate: Math.round(row.collectionRate * 1000) / 10 }));

  return (
    <div className="admin-page ab-page">
      <PageHeader title="Tổng quan phí dịch vụ" description="Phải thu, đã thu và tỷ lệ thu theo tháng. Số tiền là VND, đã trừ giảm/miễn và hoàn tiền.">
        <div className="ab-header-actions">
          <Input label="Kỳ phí (tháng)" type="month" value={period} onChange={setPeriod} />
          <Button variant="secondary" icon="download" loading={exporting} disabled={!isPeriod(period)} onClick={exportCsv}>Xuất CSV</Button>
          <Button variant="ghost" icon="sparkles" onClick={() => setReload((value) => value + 1)} disabled={loading}>Làm mới</Button>
        </div>
      </PageHeader>

      {notice && <div role="status"><Alert tone={notice.tone} title={notice.text} onClose={() => setNotice(null)} /></div>}
      {!isPeriod(period) && <Alert tone="warning" title="Chọn một tháng hợp lệ để xem số liệu." />}
      {error && <ErrorAlert message={error} onRetry={() => setReload((value) => value + 1)} />}
      {loading && !data && !error && <Card className="ag-state"><p role="status">Đang tải số liệu thu phí…</p></Card>}

      {data && totals && (
        <div style={{ display: "grid", gap: 24 }} aria-busy={loading}>
          <div className="admin-kpi-grid ab-kpis">
            <Card className="admin-kpi-card">
              <div><span>Phải thu kỳ {formatPeriod(data.period)}</span><span className="admin-kpi-icon"><Icon name="wallet" /></span></div>
              <strong>{formatVnd(totals.dueTotalVnd)}</strong>
              <small style={{ color: "var(--color-text-muted)" }}>{totals.statementCount} kỳ phí, đã trừ giảm/miễn</small>
            </Card>
            <Card className="admin-kpi-card">
              <div><span>Đã thu</span><span className="admin-kpi-icon" style={{ color: "var(--color-secondary-700)", background: "var(--color-success-soft)" }}><Icon name="check" /></span></div>
              <strong>{formatVnd(totals.collectedVnd)}</strong>
              <small style={{ color: "var(--color-text-muted)" }}>Thanh toán trừ hoàn tiền</small>
            </Card>
            <Card className="admin-kpi-card">
              <div><span>Còn lại</span><span className="admin-kpi-icon" style={{ color: "var(--color-warning)", background: "var(--color-warning-soft)" }}><Icon name="info" /></span></div>
              <strong>{formatVnd(totals.remainingVnd)}</strong>
              <small style={{ color: "var(--color-text-muted)" }}>Chờ thanh toán và quá hạn</small>
            </Card>
            <Card className="admin-kpi-card">
              <div><span>Tỷ lệ thu</span><span className="admin-kpi-icon"><Icon name="chart" /></span></div>
              <strong>{formatRate(totals.collectionRate)}</strong>
              <small style={{ color: "var(--color-text-muted)" }}>Đã thu / phải thu</small>
            </Card>
            {totals.overpaidVnd > 0 && (
              <Card className="admin-kpi-card">
                <div><span>Thu thừa</span><span className="admin-kpi-icon" style={{ color: "var(--color-warning)", background: "var(--color-warning-soft)" }}><Icon name="alert" /></span></div>
                <strong>{formatVnd(totals.overpaidVnd)}</strong>
                <small style={{ color: "var(--color-warning)" }}>Cần hoàn lại cho khách</small>
              </Card>
            )}
            <Link to="/admin/billing/alerts" className="ab-kpi-link" aria-label={`Cảnh báo chưa xử lý: ${data.unresolvedAlertCount}. Mở trang Cảnh báo`}>
              <Card className="admin-kpi-card">
                <div><span>Cảnh báo chưa xử lý</span><span className="admin-kpi-icon" style={data.unresolvedAlertCount ? { color: "var(--color-danger)", background: "var(--color-danger-soft)" } : undefined}><Icon name="bell" /></span></div>
                <strong>{data.unresolvedAlertCount}</strong>
                <small style={{ color: "var(--color-text-muted)" }}>Bấm để xem và đối soát</small>
              </Card>
            </Link>
          </div>

          <Card className="ov-panel">
            <header className="ov-panel-head"><div><h2>Số kỳ phí theo trạng thái</h2><p>Kỳ {formatPeriod(data.period)}</p></div><Link to="/admin/billing/statements">Xem kỳ phí</Link></header>
            <ul className="ab-status-counts">
              {(Object.keys(STATEMENT_STATUS_LABEL) as StatementStatus[]).map((status) => (
                <li key={status}><Badge tone={statementTone(status)}>{STATEMENT_STATUS_LABEL[status]}</Badge><strong>{data.statusCounts[status] ?? 0}</strong></li>
              ))}
            </ul>
          </Card>

          <Card className="ov-panel">
            <header className="ov-panel-head"><div><h2>12 tháng gần nhất</h2><p>Cột: phải thu và đã thu (triệu đồng). Đường: tỷ lệ thu (%).</p></div></header>
            <div className="ab-chart" role="img" aria-label={`Biểu đồ 12 tháng: ${chart.map((row) => `${row.label} phải thu ${compact(row.dueTotalVnd)}, đã thu ${compact(row.collectedVnd)}, tỷ lệ ${row.rate}%`).join("; ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="money" tickFormatter={compact} tick={{ fontSize: 12 }} width={64} />
                  <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} width={44} />
                  <Tooltip formatter={(value, name) => name === "Tỷ lệ thu" ? [`${value}%`, name] : [formatVnd(Number(value)), name]} />
                  <Legend />
                  <Bar yAxisId="money" dataKey="dueTotalVnd" name="Phải thu" fill="#9db4e8" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="money" dataKey="collectedVnd" name="Đã thu" fill="#052659" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="rate" dataKey="rate" name="Tỷ lệ thu" stroke="#b36800" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <details className="ab-details" style={{ marginTop: 12 }}>
              <summary>Xem bảng số liệu</summary>
              <div className="admin-users-table-wrap">
                <table className="admin-users-table ab-table">
                  <thead><tr><th>Tháng</th><th className="ab-num">Số kỳ</th><th className="ab-num">Phải thu</th><th className="ab-num">Đã thu</th><th className="ab-num">Còn lại</th><th className="ab-num">Tỷ lệ thu</th></tr></thead>
                  <tbody>
                    {[...data.series].reverse().map((row) => (
                      <tr key={row.period}>
                        <td>{formatPeriod(row.period)}</td><td className="ab-num">{row.statementCount}</td>
                        <td className="ab-num">{formatVnd(row.dueTotalVnd)}</td><td className="ab-num">{formatVnd(row.collectedVnd)}</td>
                        <td className="ab-num">{formatVnd(row.remainingVnd)}</td><td className="ab-num">{formatRate(row.collectionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Card>
        </div>
      )}
    </div>
  );
}
