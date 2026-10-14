import "./admin-dashboard.css";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Icon, type IconName } from "../../components/ui";
import { authenticatedRequest } from "../../services/api";
import { formatRelativeTime } from "../../utils/notifications";
import { useI18n } from "../../i18n";
import { getActionLabel } from "./overviewShared";

type Counts = Record<string, number>;
type Visible = { total: number; visible: number };
export type AdminOverview = {
  asOf: string;
  users: { total: number; byStatus: Counts; new7d: number; new30d: number; signups14d: { date: string; count: number }[]; withProfile: number; withPlan: number; active7d: number };
  security: { logins24h: number; failedLogins24h: number; systemErrors24h: number };
  support: { byStatus: Counts; oldestOpenAt: string | null };
  consultations: { byStatus: Counts };
  content: { byStatus: Counts };
  ai: { knowledge: { byStatus: Counts; approved: number }; conversations7d: number; questions7d: number; providerConfigured: boolean };
  governance: { legalRules: Counts; assumptions: Counts };
  catalog: { partners: Visible; products: Visible };
  system: { uptimeSeconds: number; configuration: Record<"email" | "encryption" | "google" | "media", boolean>; mailJobs: Counts; lastJobCompletedAt: string | null };
  recentUsers: { id: string; fullName: string; email: string; status: string; createdAt: string }[];
  recentAudit: { id: string; action: string; targetType: string; performerName: string; createdAt: string }[];
};

const LABELS: Record<string, [string, string]> = {
  ACTIVE: ["Đang hoạt động", "Active"], PENDING_VERIFICATION: ["Chờ xác minh", "Pending verification"], SUSPENDED: ["Tạm khóa", "Suspended"],
  OPEN: ["Chờ phản hồi", "Open"], IN_PROGRESS: ["Đang xử lý", "In progress"], RESOLVED: ["Đã giải quyết", "Resolved"], CLOSED: ["Đã đóng", "Closed"],
  NEW: ["Mới", "New"], PROCESSING: ["Đang xử lý", "Processing"], SCHEDULED: ["Đã hẹn lịch", "Scheduled"], COMPLETED: ["Hoàn tất", "Completed"], CANCELLED: ["Đã hủy", "Cancelled"],
  PUBLISHED: ["Đã xuất bản", "Published"], DRAFT: ["Bản nháp", "Draft"], VALIDATED: ["Đã kiểm tra", "Validated"], REVIEWED: ["Đã rà soát", "Reviewed"], APPROVED: ["Đã phê duyệt", "Approved"],
  INDEXED: ["Đã lập chỉ mục", "Indexed"], PENDING: ["Chờ xử lý", "Pending"], FAILED: ["Lỗi", "Failed"],
};
const sum = (c: Counts, keys?: string[]) => Object.entries(c).reduce((n, [k, v]) => (!keys || keys.includes(k) ? n + v : n), 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Kpi({ icon, label, value, sub, to, tone = "" }: { icon: IconName; label: string; value: ReactNode; sub: ReactNode; to: string; tone?: string }) {
  return (
    <Link to={to} className={`ov-kpi card ${tone}`}>
      <span className="ov-kpi-icon"><Icon name={icon} /></span>
      <span className="ov-kpi-label">{label}</span>
      <strong className="ov-kpi-value">{value}</strong>
      <span className="ov-kpi-sub">{sub}</span>
    </Link>
  );
}

function StatusList({ counts, isEn, order }: { counts: Counts; isEn: boolean; order: string[] }) {
  const keys = [...order.filter((k) => k in counts), ...Object.keys(counts).filter((k) => !order.includes(k))];
  if (!keys.length) return <p className="ov-empty">{isEn ? "No records yet." : "Chưa có dữ liệu."}</p>;
  return (
    <dl className="ov-status-list">
      {keys.map((k) => (
        <div key={k}><dt>{LABELS[k]?.[isEn ? 1 : 0] ?? k}</dt><dd>{counts[k]}</dd></div>
      ))}
    </dl>
  );
}

function Panel({ title, sub, to, linkLabel, children, className = "" }: { title: string; sub?: string; to?: string; linkLabel?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`ov-panel ${className}`}>
      <header className="ov-panel-head">
        <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        {to && <Link to={to}>{linkLabel} →</Link>}
      </header>
      {children}
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { language } = useI18n();
  const isEn = language === "en";
  const t = (vi: string, en: string) => (isEn ? en : vi);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    // Manual refresh bypasses the 45s API cache; first load reuses the hover prefetch.
    authenticatedRequest<AdminOverview>("/admin/overview", undefined, undefined, undefined, { skipCache: reload > 0 })
      .then((res) => { if (active) setData(res); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : t("Không thể tải dữ liệu tổng quan.", "Could not load the overview.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const u = data?.users;
  const openTickets = data ? sum(data.support.byStatus, ["OPEN", "IN_PROGRESS"]) : 0;
  const newConsultations = data ? sum(data.consultations.byStatus, ["NEW"]) : 0;
  const pendingUsers = u?.byStatus.PENDING_VERIFICATION ?? 0;
  const knowledgeTotal = data ? sum(data.ai.knowledge.byStatus) : 0;
  const knowledgePending = data ? knowledgeTotal - data.ai.knowledge.approved : 0;
  const legalDrafts = data ? sum(data.governance.legalRules) - sum(data.governance.legalRules, ["PUBLISHED"]) : 0;
  const maxSignup = Math.max(1, ...(u?.signups14d.map((d) => d.count) ?? [0]));
  const uptime = data ? `${Math.floor(data.system.uptimeSeconds / 3600)}h ${Math.floor((data.system.uptimeSeconds % 3600) / 60)}m` : "—";

  const attention: { label: string; count: number; to: string; icon: IconName; note?: string }[] = data ? [
    { label: t("Ticket hỗ trợ đang mở", "Open support tickets"), count: openTickets, to: "/admin/support", icon: "life-buoy",
      note: data.support.oldestOpenAt ? t("Cũ nhất mở từ ", "Oldest open since ") + new Date(data.support.oldestOpenAt).toLocaleDateString(isEn ? "en-GB" : "vi-VN") : undefined },
    { label: t("Yêu cầu tư vấn mới", "New consultation requests"), count: newConsultations, to: "/admin/support", icon: "message" },
    { label: t("Tài khoản chờ xác minh", "Accounts awaiting verification"), count: pendingUsers, to: "/admin/users", icon: "users" },
    { label: t("Đăng nhập thất bại 24h", "Failed logins (24h)"), count: data.security.failedLogins24h, to: "/admin/settings/logs", icon: "shield" },
    { label: t("Lỗi hệ thống 24h", "System errors (24h)"), count: data.security.systemErrors24h, to: "/admin/settings/logs", icon: "alert" },
    { label: t("Tài liệu AI chưa duyệt", "Unapproved AI sources"), count: knowledgePending, to: "/admin/ai", icon: "sparkles" },
    { label: t("Bộ luật chưa ban hành", "Unpublished legal rule sets"), count: legalDrafts, to: "/admin/legal-rules", icon: "file-text" },
  ] : [];

  return (
    <div className="admin-page ov-page">
      <div className="admin-page-header">
        <div className="admin-header-title-group">
          <h1>{t("Tổng quan quản trị", "Admin overview")}</h1>
          <p>{t("Toàn cảnh người dùng, vận hành, nội dung, trợ lý AI và sức khỏe hệ thống.", "Users, operations, content, AI assistant and system health at a glance.")}</p>
        </div>
        <div className="admin-header-actions">
          {data && (
            <span className="admin-sync-time">
              <Icon name="check" size="small" />
              {t("Cập nhật", "Updated")} {new Date(data.asOf).toLocaleTimeString(isEn ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button variant="secondary" onClick={() => setReload((k) => k + 1)} disabled={loading}>
            <Icon name="upload" size="small" />
            {loading ? t("Đang tải…", "Loading…") : t("Làm mới", "Refresh")}
          </Button>
          <Link to="/admin/reports"><Button variant="primary"><Icon name="chart" size="small" />{t("Báo cáo", "Reports")}</Button></Link>
        </div>
      </div>

      {error && (
        <Alert tone="danger" title={t("Lỗi tải dữ liệu", "Load error")}>
          {error} <Button variant="secondary" onClick={() => setReload((k) => k + 1)}>{t("Thử lại", "Retry")}</Button>
        </Alert>
      )}

      {!data && loading && <div className="ov-skeleton" aria-busy="true" aria-label={t("Đang tải tổng quan", "Loading overview")}><span /><span /><span /><span /></div>}

      {data && u && (
        <>
          <section className="ov-attention card" aria-label={t("Việc cần xử lý", "Needs attention")}>
            <h2>{t("Việc cần xử lý", "Needs attention")}</h2>
            <div className="ov-attention-grid">
              {attention.map((a) => (
                <Link key={a.label} to={a.to} className={`ov-attention-item ${a.count > 0 ? "is-due" : ""}`}>
                  <Icon name={a.count > 0 ? a.icon : "circle-check"} size="small" />
                  <span><strong>{a.count}</strong> {a.label}{a.note && a.count > 0 && <small>{a.note}</small>}</span>
                </Link>
              ))}
            </div>
          </section>

          <div className="ov-kpi-grid">
            <Kpi icon="users" label={t("Người dùng", "Users")} value={u.total} to="/admin/users"
              sub={t(`+${u.new7d} trong 7 ngày · +${u.new30d} trong 30 ngày`, `+${u.new7d} last 7 days · +${u.new30d} last 30 days`)} />
            <Kpi icon="target" label={t("Hoạt động 7 ngày", "Active (7 days)")} value={u.active7d} to="/admin/settings/logs"
              sub={t(`${pct(u.active7d, u.total)}% người dùng · ${data.security.logins24h} lượt đăng nhập 24h`, `${pct(u.active7d, u.total)}% of users · ${data.security.logins24h} logins (24h)`)} />
            <Kpi icon="wallet" label={t("Có kế hoạch hưu trí", "With a retirement plan")} value={u.withPlan} to="/admin/users"
              sub={t(`${pct(u.withProfile, u.total)}% đã có hồ sơ tài chính (${u.withProfile})`, `${pct(u.withProfile, u.total)}% completed a financial profile (${u.withProfile})`)} />
            <Kpi icon="sparkles" label={t("Câu hỏi AI 7 ngày", "AI questions (7 days)")} value={data.ai.questions7d} to="/admin/ai"
              sub={t(`${data.ai.conversations7d} hội thoại mới · ${data.ai.knowledge.approved}/${knowledgeTotal} nguồn đã duyệt`, `${data.ai.conversations7d} new chats · ${data.ai.knowledge.approved}/${knowledgeTotal} sources approved`)} />
          </div>

          <div className="ov-row ov-row-2-1">
            <Panel title={t("Đăng ký mới 14 ngày", "New signups, last 14 days")} sub={t("Số tài khoản người dùng tạo mỗi ngày (giờ Việt Nam)", "User accounts created per day (Vietnam time)")} to="/admin/users" linkLabel={t("Người dùng", "Users")}>
              <div className="ov-bars" role="img" aria-label={u.signups14d.map((d) => `${d.date}: ${d.count}`).join(", ")}>
                {u.signups14d.map((d) => (
                  <div key={d.date} className="ov-bar-col" title={`${d.date.split("-").reverse().slice(0, 2).join("/")}: ${d.count}`}>
                    <span className="ov-bar-value">{d.count > 0 ? d.count : ""}</span>
                    <span className="ov-bar" style={{ height: `${Math.max(d.count > 0 ? 4 : 1, (d.count / maxSignup) * 100)}%` }} />
                    <span className="ov-bar-label">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t("Trạng thái tài khoản", "Account status")} to="/admin/users" linkLabel={t("Quản lý", "Manage")}>
              <div className="ov-stack" aria-hidden="true">
                {(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"] as const).map((k) => (
                  <span key={k} className={`ov-stack-seg is-${k.toLowerCase()}`} style={{ flexGrow: u.byStatus[k] ?? 0 }} />
                ))}
              </div>
              <StatusList counts={u.byStatus} isEn={isEn} order={["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"]} />
            </Panel>
          </div>

          <div className="ov-row ov-row-3">
            <Panel title={t("Hỗ trợ & tư vấn", "Support & consultations")} to="/admin/support" linkLabel={t("Xử lý", "Open")}>
              <h3 className="ov-subhead">{t("Ticket hỗ trợ", "Support tickets")}</h3>
              <StatusList counts={data.support.byStatus} isEn={isEn} order={["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]} />
              <h3 className="ov-subhead">{t("Yêu cầu tư vấn", "Consultations")}</h3>
              <StatusList counts={data.consultations.byStatus} isEn={isEn} order={["NEW", "PROCESSING", "SCHEDULED", "COMPLETED", "CANCELLED"]} />
            </Panel>
            <Panel title={t("Nội dung & tri thức AI", "Content & AI knowledge")} to="/admin/ai" linkLabel={t("Trợ lý AI", "AI assistant")}>
              <h3 className="ov-subhead">{t("Bài viết, FAQ, thuật ngữ", "Articles, FAQ, glossary")}</h3>
              <StatusList counts={data.content.byStatus} isEn={isEn} order={["PUBLISHED", "DRAFT"]} />
              <h3 className="ov-subhead">{t("Nguồn tri thức AI", "AI knowledge sources")}</h3>
              <dl className="ov-status-list">
                <div><dt>{t("Đã phê duyệt", "Approved")}</dt><dd>{data.ai.knowledge.approved}</dd></div>
                <div><dt>{t("Chưa duyệt", "Not approved")}</dt><dd>{knowledgePending}</dd></div>
                <div><dt>{t("Nhà cung cấp AI", "AI provider")}</dt><dd><Badge tone={data.ai.providerConfigured ? "success" : "warning"}>{data.ai.providerConfigured ? t("Đã cấu hình", "Configured") : t("Chưa cấu hình", "Not configured")}</Badge></dd></div>
              </dl>
            </Panel>
            <Panel title={t("Chính sách & sản phẩm", "Policy & catalog")} to="/admin/legal-rules" linkLabel={t("Luật BHXH", "Legal rules")}>
              <h3 className="ov-subhead">{t("Bộ luật BHXH", "Legal rule sets")}</h3>
              <StatusList counts={data.governance.legalRules} isEn={isEn} order={["PUBLISHED", "REVIEWED", "VALIDATED", "DRAFT"]} />
              <h3 className="ov-subhead">{t("Giả định tài chính", "Financial assumptions")}</h3>
              <StatusList counts={data.governance.assumptions} isEn={isEn} order={["PUBLISHED", "APPROVED", "DRAFT"]} />
              <h3 className="ov-subhead">{t("Đối tác & sản phẩm", "Partners & products")}</h3>
              <dl className="ov-status-list">
                <div><dt>{t("Đối tác hiển thị", "Visible partners")}</dt><dd>{data.catalog.partners.visible}/{data.catalog.partners.total}</dd></div>
                <div><dt>{t("Sản phẩm hiển thị", "Visible products")}</dt><dd>{data.catalog.products.visible}/{data.catalog.products.total}</dd></div>
              </dl>
            </Panel>
          </div>

          <div className="ov-row ov-row-3">
            <Panel title={t("Sức khỏe hệ thống", "System health")} to="/admin/settings/logs" linkLabel={t("Nhật ký", "Logs")}>
              <dl className="ov-status-list">
                <div><dt>{t("Thời gian chạy API", "API uptime")}</dt><dd>{uptime}</dd></div>
                {([["email", t("Gửi email (SMTP)", "Email (SMTP)")], ["encryption", t("Mã hóa hàng đợi", "Queue encryption")], ["google", t("Đăng nhập Google", "Google sign-in")], ["media", t("Lưu trữ ảnh", "Media storage")]] as const).map(([k, label]) => (
                  <div key={k}><dt>{label}</dt><dd><Badge tone={data.system.configuration[k] ? "success" : "warning"}>{data.system.configuration[k] ? t("Sẵn sàng", "Ready") : t("Chưa cấu hình", "Missing")}</Badge></dd></div>
                ))}
                <div><dt>{t("Email đã gửi / lỗi", "Emails sent / failed")}</dt><dd>{data.system.mailJobs.COMPLETED ?? 0} / {data.system.mailJobs.FAILED ?? 0}</dd></div>
                <div><dt>{t("Email đang chờ", "Emails queued")}</dt><dd>{(data.system.mailJobs.PENDING ?? 0) + (data.system.mailJobs.PROCESSING ?? 0)}</dd></div>
              </dl>
            </Panel>
            <Panel title={t("Người dùng mới nhất", "Newest users")} to="/admin/users" linkLabel={t("Tất cả", "All")}>
              <ul className="ov-feed">
                {data.recentUsers.map((r) => (
                  <li key={r.id}>
                    <Link to={`/admin/users/${r.id}`}><strong>{r.fullName}</strong><small>{r.email}</small></Link>
                    <span><Badge tone={r.status === "ACTIVE" ? "success" : r.status === "SUSPENDED" ? "danger" : "warning"}>{LABELS[r.status]?.[isEn ? 1 : 0] ?? r.status}</Badge><small>{formatRelativeTime(r.createdAt, isEn)}</small></span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t("Thao tác quản trị gần đây", "Recent admin actions")} to="/admin/settings/logs" linkLabel={t("Nhật ký", "Logs")}>
              <ul className="ov-feed">
                {data.recentAudit.map((a) => (
                  <li key={a.id}>
                    <span><strong>{getActionLabel(a.action, isEn).title}</strong><small>{a.performerName} · {a.targetType}</small></span>
                    <small>{formatRelativeTime(a.createdAt, isEn)}</small>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
