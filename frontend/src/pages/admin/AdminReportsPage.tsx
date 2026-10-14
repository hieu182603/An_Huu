import "./admin-dashboard.css";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Alert, Button, Card, Icon } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { downloadCsv } from "../../utils/downloads";
import { useI18n } from "../../i18n";
import { getActionLabel } from "./overviewShared";

type Pair = { current: number; previous: number };
type Counts = Record<string, number>;
type Day = { date: string; signups: number; logins: number; aiQuestions: number; tickets: number };
export type AdminReport = {
  days: 7 | 30 | 90; from: string; to: string;
  kpis: Record<"signups" | "activeUsers" | "aiQuestions" | "tickets" | "consults" | "published", Pair>;
  series: Day[];
  funnel: { registered: number; verified: number; withProfile: number; withPlan: number; usedAi: number };
  support: { byCategory: Counts; byStatus: Counts };
  security: { logins: Counts; systemLogs: Counts };
  adminActions: { action: string; count: number }[];
};

const PERIODS = [7, 30, 90] as const;
const LABELS: Record<string, [string, string]> = {
  OPEN: ["Chờ phản hồi", "Open"], IN_PROGRESS: ["Đang xử lý", "In progress"], RESOLVED: ["Đã giải quyết", "Resolved"], CLOSED: ["Đã đóng", "Closed"],
  SUCCESS: ["Thành công", "Successful"], FAILED: ["Thất bại", "Failed"], LOCKED: ["Bị khóa tạm", "Locked"],
  INFO: ["Thông tin", "Info"], WARNING: ["Cảnh báo", "Warning"], ERROR: ["Lỗi", "Error"], CRITICAL: ["Nghiêm trọng", "Critical"],
  TECHNICAL: ["Kỹ thuật", "Technical"], FINANCIAL: ["Tài chính", "Financial"], FEATURE_REQUEST: ["Đề xuất tính năng", "Feature request"],
};
const label = (k: string, isEn: boolean) => LABELS[k]?.[isEn ? 1 : 0] ?? k;
const fmtDate = (iso: string, isEn: boolean) => new Date(iso).toLocaleDateString(isEn ? "en-GB" : "vi-VN");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Delta({ pair, isEn }: { pair: Pair; isEn: boolean }) {
  const { current, previous } = pair;
  if (!current && !previous) return <span className="rp-delta">{isEn ? "No activity in either period" : "Không phát sinh ở cả hai kỳ"}</span>;
  if (!previous) return <span className="rp-delta is-up"><Icon name="arrow-right" size="small" />{isEn ? "New this period" : "Mới phát sinh trong kỳ"}</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  return (
    <span className={`rp-delta ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}`}>
      {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {change > 0 ? "+" : ""}{change}% {isEn ? `vs previous (${previous})` : `so với kỳ trước (${previous})`}
    </span>
  );
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`ov-panel ${className}`}>
      <header className="ov-panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div></header>
      {children}
    </Card>
  );
}

function CountList({ counts, isEn, empty }: { counts: Counts; isEn: boolean; empty: string }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, v]) => n + v, 0);
  if (!rows.length) return <p className="ov-empty">{empty}</p>;
  return (
    <dl className="ov-status-list">
      {rows.map(([k, v]) => <div key={k}><dt>{label(k, isEn)}</dt><dd>{v} <small className="rp-share">({pct(v, total)}%)</small></dd></div>)}
    </dl>
  );
}

export default function AdminReportsPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const t = (vi: string, en: string) => (isEn ? en : vi);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metric, setMetric] = useState<keyof Omit<Day, "date">>("signups");
  const [data, setData] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    authenticatedRequest<AdminReport>(`/admin/reports?days=${days}`, undefined, undefined, undefined, { skipCache: reload > 0 })
      .then((res) => { if (active) setData(res); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : t("Không thể tải báo cáo.", "Could not load the report.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, reload]);

  const metrics: { key: keyof Omit<Day, "date">; label: string }[] = [
    { key: "signups", label: t("Đăng ký mới", "New signups") }, { key: "logins", label: t("Lượt đăng nhập", "Logins") },
    { key: "aiQuestions", label: t("Câu hỏi AI", "AI questions") }, { key: "tickets", label: t("Ticket hỗ trợ", "Support tickets") },
  ];
  const kpis: { key: keyof AdminReport["kpis"]; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
    { key: "signups", label: t("Đăng ký mới", "New signups"), icon: "users" },
    { key: "activeUsers", label: t("Người dùng có đăng nhập", "Users who signed in"), icon: "target" },
    { key: "aiQuestions", label: t("Câu hỏi gửi trợ lý AI", "Questions to the AI assistant"), icon: "sparkles" },
    { key: "tickets", label: t("Ticket hỗ trợ mới", "New support tickets"), icon: "life-buoy" },
    { key: "consults", label: t("Yêu cầu tư vấn sản phẩm", "Product consultation requests"), icon: "message" },
    { key: "published", label: t("Bài viết xuất bản", "Articles published"), icon: "file-text" },
  ];

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`bao-cao-an-huu-${data.days}-ngay.csv`, [
      [t("Kỳ báo cáo", "Period"), `${fmtDate(data.from, isEn)} – ${fmtDate(data.to, isEn)}`],
      [],
      [t("Chỉ số", "Metric"), t("Kỳ này", "This period"), t("Kỳ trước", "Previous period")],
      ...kpis.map((k) => [k.label, data.kpis[k.key].current, data.kpis[k.key].previous]),
      [],
      [t("Phễu", "Funnel"), t("Số người", "Users")],
      ...funnel.map((f) => [f.label, f.value]),
      [],
      [t("Ngày", "Date"), ...metrics.map((m) => m.label)],
      ...data.series.map((d) => [d.date, d.signups, d.logins, d.aiQuestions, d.tickets]),
    ]);
  };

  const f = data?.funnel;
  const funnel = f ? [
    { label: t("Tài khoản đã đăng ký", "Registered accounts"), value: f.registered },
    { label: t("Đã kích hoạt (xác minh email)", "Activated (email verified)"), value: f.verified },
    { label: t("Đã có hồ sơ tài chính", "Completed financial profile"), value: f.withProfile },
    { label: t("Đã lập kế hoạch hưu trí", "Created a retirement plan"), value: f.withPlan },
    { label: t("Đã dùng trợ lý AI", "Used the AI assistant"), value: f.usedAi },
  ] : [];
  const series = data?.series ?? [];
  const max = Math.max(1, ...series.map((d) => d[metric]));
  const total = series.reduce((n, d) => n + d[metric], 0);
  const labelEvery = days === 7 ? 1 : days === 30 ? 3 : 10;
  const failedLogins = (data?.security.logins.FAILED ?? 0) + (data?.security.logins.LOCKED ?? 0);
  const criticalLogs = (data?.security.systemLogs.CRITICAL ?? 0) + (data?.security.systemLogs.ERROR ?? 0);

  return (
    <div className="admin-page ov-page rp-page">
      <div className="admin-page-header">
        <div className="admin-header-title-group">
          <Link to="/admin/dashboard" className="rp-back"><Icon name="arrow-left" size="small" />{t("Tổng quan", "Overview")}</Link>
          <h1>{t("Báo cáo vận hành", "Operations report")}</h1>
          <p>
            {data
              ? t(`Từ ${fmtDate(data.from, false)} đến ${fmtDate(data.to, false)} · so với ${days} ngày liền trước`, `${fmtDate(data.from, true)} – ${fmtDate(data.to, true)} · compared with the previous ${days} days`)
              : t("Đang chuẩn bị số liệu…", "Preparing figures…")}
          </p>
        </div>
        <div className="admin-header-actions rp-actions">
          <div className="rp-segment" role="group" aria-label={t("Kỳ báo cáo", "Report period")}>
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={days === p} className={days === p ? "is-active" : ""} onClick={() => setDays(p)}>
                {p} {t("ngày", "days")}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setReload((k) => k + 1)} disabled={loading}><Icon name="upload" size="small" />{t("Làm mới", "Refresh")}</Button>
          <Button variant="secondary" onClick={() => window.print()} disabled={!data}><Icon name="file-text" size="small" />{t("In", "Print")}</Button>
          <Button onClick={exportCsv} disabled={!data}><Icon name="download" size="small" />{t("Xuất CSV", "Export CSV")}</Button>
        </div>
      </div>

      {error && <Alert tone="danger" title={t("Lỗi tải báo cáo", "Report error")}>{error} <Button variant="secondary" onClick={() => setReload((k) => k + 1)}>{t("Thử lại", "Retry")}</Button></Alert>}
      {!data && loading && <div className="ov-skeleton" aria-busy="true" aria-label={t("Đang tải báo cáo", "Loading report")}><span /><span /><span /><span /></div>}

      {data && (
        <div className={loading ? "rp-stale" : ""} aria-busy={loading}>
          {(failedLogins > 0 || criticalLogs > 0) && (
            <Alert tone="warning" title={t("Cần lưu ý trong kỳ", "Needs attention this period")}>
              {t(`${failedLogins} lần đăng nhập thất bại/bị khóa và ${criticalLogs} log lỗi hệ thống (lỗi + nghiêm trọng).`, `${failedLogins} failed/locked sign-ins and ${criticalLogs} system error logs (error + critical).`)}{" "}
              <Link to="/admin/settings/logs">{t("Xem nhật ký", "Open logs")}</Link>
            </Alert>
          )}

          <section className="rp-kpis" aria-label={t("Chỉ số chính của kỳ", "Key metrics")}>
            {kpis.map((k) => (
              <Card key={k.key} className="ov-kpi rp-kpi">
                <span className="ov-kpi-icon"><Icon name={k.icon} /></span>
                <span className="ov-kpi-label">{k.label}</span>
                <strong className="ov-kpi-value">{data.kpis[k.key].current}</strong>
                <span className="ov-kpi-sub"><Delta pair={data.kpis[k.key]} isEn={isEn} /></span>
              </Card>
            ))}
          </section>

          <Panel title={t("Xu hướng theo ngày", "Daily trend")} sub={t(`Tổng ${total} trong ${days} ngày · giờ Việt Nam`, `${total} in total over ${days} days · Vietnam time`)}>
            <div className="rp-segment rp-metric" role="group" aria-label={t("Chỉ số biểu đồ", "Chart metric")}>
              {metrics.map((m) => (
                <button key={m.key} type="button" aria-pressed={metric === m.key} className={metric === m.key ? "is-active" : ""} onClick={() => setMetric(m.key)}>{m.label}</button>
              ))}
            </div>
            <div className={`ov-bars rp-bars is-${days}`} role="img" aria-label={`${metrics.find((m) => m.key === metric)?.label}: ${series.map((d) => `${d.date} ${d[metric]}`).join(", ")}`}>
              {series.map((d, i) => (
                <div key={d.date} className="ov-bar-col" title={`${d.date.split("-").reverse().join("/")}: ${d[metric]}`}>
                  <span className="ov-bar-value">{days === 7 && d[metric] > 0 ? d[metric] : ""}</span>
                  <span className="ov-bar" style={{ height: `${Math.max(d[metric] > 0 ? 4 : 1, (d[metric] / max) * 100)}%` }} />
                  <span className="ov-bar-label">{i % labelEvery === 0 || i === series.length - 1 ? `${d.date.slice(8)}/${d.date.slice(5, 7)}` : ""}</span>
                </div>
              ))}
            </div>
            <details className="rp-table-toggle">
              <summary>{t("Xem bảng số liệu theo ngày", "Show daily figures table")}</summary>
              <div className="rp-table-scroll">
                <table className="rp-table">
                  <thead><tr><th>{t("Ngày", "Date")}</th>{metrics.map((m) => <th key={m.key}>{m.label}</th>)}</tr></thead>
                  <tbody>
                    {[...series].reverse().map((d) => (
                      <tr key={d.date}><td>{d.date.split("-").reverse().join("/")}</td><td>{d.signups}</td><td>{d.logins}</td><td>{d.aiQuestions}</td><td>{d.tickets}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th>{t("Tổng", "Total")}</th>{metrics.map((m) => <th key={m.key}>{series.reduce((n, d) => n + d[m.key], 0)}</th>)}</tr></tfoot>
                </table>
              </div>
            </details>
          </Panel>

          <div className="ov-row ov-row-2-1">
            <Panel title={t("Phễu chuyển đổi người dùng", "User conversion funnel")} sub={t("Tính trên toàn bộ tài khoản người dùng hiện có", "Across all current user accounts")}>
              <ol className="rp-funnel">
                {funnel.map((s, i) => (
                  <li key={s.label}>
                    <div className="rp-funnel-head"><span>{s.label}</span><strong>{s.value}</strong></div>
                    <div className="rp-funnel-track"><span style={{ width: `${Math.max(s.value ? 2 : 0, pct(s.value, funnel[0].value))}%` }} /></div>
                    <small>
                      {pct(s.value, funnel[0].value)}% {t("tổng đăng ký", "of registered")}
                      {i > 0 && ` · ${pct(s.value, funnel[i - 1].value)}% ${t("so với bước trước", "of previous step")}`}
                    </small>
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel title={t("Bảo mật trong kỳ", "Security this period")}>
              <h3 className="ov-subhead">{t("Đăng nhập", "Sign-ins")}</h3>
              <CountList counts={data.security.logins} isEn={isEn} empty={t("Không có lượt đăng nhập.", "No sign-ins.")} />
              <h3 className="ov-subhead">{t("Log hệ thống theo mức độ", "System logs by level")}</h3>
              <CountList counts={data.security.systemLogs} isEn={isEn} empty={t("Không có log.", "No logs.")} />
            </Panel>
          </div>

          <div className="ov-row rp-row-2">
            <Panel title={t("Hỗ trợ trong kỳ", "Support this period")} sub={t("Ticket tạo mới trong kỳ", "Tickets created in the period")}>
              <h3 className="ov-subhead">{t("Theo trạng thái hiện tại", "By current status")}</h3>
              <CountList counts={data.support.byStatus} isEn={isEn} empty={t("Không có ticket mới.", "No new tickets.")} />
              <h3 className="ov-subhead">{t("Theo nhóm yêu cầu", "By category")}</h3>
              <CountList counts={data.support.byCategory} isEn={isEn} empty={t("Không có ticket mới.", "No new tickets.")} />
            </Panel>
            <Panel title={t("Hoạt động được ghi nhật ký", "Audited activity")} sub={t("8 loại thao tác nhiều nhất trong kỳ (người dùng và quản trị)", "Top 8 actions in the period (users and admins)")}>
              {data.adminActions.length ? (
                <ol className="rp-actions-list">
                  {data.adminActions.map((a) => (
                    <li key={a.action}>
                      <span>{getActionLabel(a.action, isEn).title}</span>
                      <span className="rp-funnel-track"><span style={{ width: `${pct(a.count, data.adminActions[0].count)}%` }} /></span>
                      <strong>{a.count}</strong>
                    </li>
                  ))}
                </ol>
              ) : <p className="ov-empty">{t("Không có hoạt động.", "No activity.")}</p>}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
