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

function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ["ov-avatar-blue", "ov-avatar-indigo", "ov-avatar-amber", "ov-avatar-emerald"];

interface KpiProps {
  icon: IconName;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  sub: ReactNode;
  to: string;
  tone: "blue" | "emerald" | "amber" | "purple";
  progressPct?: number;
}

function Kpi({ icon, label, value, delta, sub, to, tone, progressPct }: KpiProps) {
  return (
    <Link to={to} className={`ov-kpi card tone-${tone}`}>
      <div className="ov-kpi-top">
        <span className="ov-kpi-label">{label}</span>
        <span className={`ov-kpi-icon-pill is-${tone}`}>
          <Icon name={icon} />
        </span>
      </div>
      <div className="ov-kpi-main">
        <strong className="ov-kpi-value">{value}</strong>
        {delta && <span className={`ov-kpi-delta is-${tone}`}>{delta}</span>}
      </div>
      <span className="ov-kpi-sub">{sub}</span>
      {typeof progressPct === "number" && (
        <div className="ov-kpi-progress" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
        </div>
      )}
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

function Panel({
  title,
  sub,
  to,
  linkLabel,
  children,
  className = "",
  extraHeader,
  iconPill,
}: {
  title: string;
  sub?: string;
  to?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
  extraHeader?: ReactNode;
  iconPill?: { icon: IconName; tone: string };
}) {
  return (
    <Card className={`ov-panel ${className}`}>
      <header className="ov-panel-head">
        <div className="ov-panel-head-title-wrap">
          {iconPill && (
            <span className={`ov-pillar-icon is-${iconPill.tone}`}>
              <Icon name={iconPill.icon} size="small" />
            </span>
          )}
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
        </div>
        <div className="ov-panel-head-actions">
          {extraHeader}
          {to && <Link to={to} className="ov-panel-link">{linkLabel || "Chi tiết"} →</Link>}
        </div>
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
  const [attentionFilter, setAttentionFilter] = useState<"all" | "due" | "clear">("all");

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
  const total14d = u ? u.signups14d.reduce((acc, d) => acc + d.count, 0) : 0;
  const avg14d = Math.round((total14d / 14) * 10) / 10;
  const uptime = data ? `${Math.floor(data.system.uptimeSeconds / 3600)}h ${Math.floor((data.system.uptimeSeconds % 3600) / 60)}m` : "—";

  type AttentionPriority = "high" | "medium" | "none";
  interface AttentionItem {
    label: string;
    count: number;
    to: string;
    icon: IconName;
    category: string;
    priority: AttentionPriority;
    statusLabel: string;
    note?: string;
  }

  const attention: AttentionItem[] = data ? [
    {
      label: t("Ticket hỗ trợ đang mở", "Open support tickets"),
      count: openTickets,
      to: "/admin/support",
      icon: "life-buoy",
      category: t("Hỗ trợ khách hàng", "Customer support"),
      priority: openTickets > 5 ? "high" : openTickets > 0 ? "medium" : "none",
      statusLabel: openTickets > 5 ? t("Ưu tiên cao", "High priority") : openTickets > 0 ? t("Cần xử lý", "Pending") : t("Ổn định", "Clear"),
      note: data.support.oldestOpenAt
        ? t("Cũ nhất từ ", "Oldest since ") + new Date(data.support.oldestOpenAt).toLocaleDateString(isEn ? "en-GB" : "vi-VN")
        : undefined,
    },
    {
      label: t("Yêu cầu tư vấn mới", "New consultation requests"),
      count: newConsultations,
      to: "/admin/support",
      icon: "message",
      category: t("Tư vấn & Đối tác", "Consultations"),
      priority: newConsultations > 0 ? "medium" : "none",
      statusLabel: newConsultations > 0 ? t("Chờ phân bổ", "Unassigned") : t("Ổn định", "Clear"),
      note: newConsultations > 0 ? t("Cần kết nối chuyên viên", "Needs specialist") : undefined,
    },
    {
      label: t("Tài khoản chờ xác minh", "Accounts awaiting verification"),
      count: pendingUsers,
      to: "/admin/users",
      icon: "users",
      category: t("Người dùng", "Users"),
      priority: pendingUsers > 0 ? "medium" : "none",
      statusLabel: pendingUsers > 0 ? t("Chờ duyệt", "Pending") : t("Hoàn tất", "Done"),
      note: pendingUsers > 0 ? t("Hồ sơ cần kiểm tra", "Profiles to review") : t("Không có tồn đọng", "No backlog"),
    },
    {
      label: t("Đăng nhập thất bại 24h", "Failed logins (24h)"),
      count: data.security.failedLogins24h,
      to: "/admin/settings/logs",
      icon: "shield",
      category: t("An ninh bảo mật", "Security"),
      priority: data.security.failedLogins24h > 10 ? "high" : data.security.failedLogins24h > 0 ? "medium" : "none",
      statusLabel: data.security.failedLogins24h > 10 ? t("Cảnh báo", "Alert") : data.security.failedLogins24h > 0 ? t("Theo dõi", "Watch") : t("An toàn", "Safe"),
      note: data.security.failedLogins24h > 0 ? t("Trong 24 giờ qua", "Past 24 hours") : t("Không có rủi ro", "No risk detected"),
    },
    {
      label: t("Lỗi hệ thống 24h", "System errors (24h)"),
      count: data.security.systemErrors24h,
      to: "/admin/settings/logs",
      icon: "alert",
      category: t("Hạ tầng & Vận hành", "System health"),
      priority: data.security.systemErrors24h > 0 ? "high" : "none",
      statusLabel: data.security.systemErrors24h > 0 ? t("Lỗi nghiêm trọng", "Critical") : t("Ổn định", "Healthy"),
      note: data.security.systemErrors24h > 0 ? t("Kiểm tra nhật ký hệ thống", "Check server logs") : t("Hạ tầng hoạt động tốt", "Healthy infrastructure"),
    },
    {
      label: t("Tài liệu AI chưa duyệt", "Unapproved AI sources"),
      count: knowledgePending,
      to: "/admin/ai",
      icon: "sparkles",
      category: t("Tri thức & AI", "AI knowledge"),
      priority: knowledgePending > 0 ? "medium" : "none",
      statusLabel: knowledgePending > 0 ? t("Chờ duyệt", "Needs audit") : t("Đã duyệt", "Approved"),
      note: knowledgePending > 0 ? t("Nguồn tri thức mới", "New knowledge sources") : t("Đã kiểm định đầy đủ", "Fully verified"),
    },
    {
      label: t("Bộ luật chưa ban hành", "Unpublished legal rule sets"),
      count: legalDrafts,
      to: "/admin/legal-rules",
      icon: "file-text",
      category: t("Pháp chế & Quy tắc", "Governance"),
      priority: legalDrafts > 0 ? "medium" : "none",
      statusLabel: legalDrafts > 0 ? t("Chờ công bố", "Unpublished") : t("Đã ban hành", "Active"),
      note: legalDrafts > 0 ? t("Bản dự thảo / rà soát", "Draft / review rules") : t("Quy tắc đồng bộ", "All rules synced"),
    },
    {
      label: t("Email gửi lỗi / tồn đọng", "Failed / pending mail jobs"),
      count: data.system.mailJobs.FAILED ?? 0,
      to: "/admin/settings/logs",
      icon: "alert",
      category: t("Dịch vụ & Gửi thư", "Mail & queue"),
      priority: (data.system.mailJobs.FAILED ?? 0) > 0 ? "high" : "none",
      statusLabel: (data.system.mailJobs.FAILED ?? 0) > 0 ? t("Lỗi gửi thư", "Delivery error") : t("Thông suốt", "Clear"),
      note: (data.system.mailJobs.FAILED ?? 0) > 0 ? t("Cần kiểm tra hàng đợi", "Inspect queue") : t("Không có tồn đọng", "No backlog"),
    },
  ] : [];

  const dueCount = attention.filter((a) => a.count > 0).length;
  const clearCount = attention.filter((a) => a.count === 0).length;
  const filteredAttention = attention.filter((a) => {
    if (attentionFilter === "due") return a.count > 0;
    if (attentionFilter === "clear") return a.count === 0;
    return true;
  });

  return (
    <div className="admin-page ov-page">
      <div className="admin-page-header">
        <div className="admin-header-title-group">
          <div className="admin-live-pulse-badge">
            <span className="live-pulse-dot" />
            <span>{t("Hệ thống vận hành bình thường", "Operational · All systems normal")}</span>
          </div>
          <h1>{t("Tổng quan quản trị", "Admin overview")}</h1>
          <p>{t("Toàn cảnh người dùng, vận hành, nội dung, trợ lý AI và sức khỏe hệ thống.", "Users, operations, content, AI assistant and system health at a glance.")}</p>
        </div>
        <div className="admin-header-actions">
          {data && (
            <span className="admin-sync-time">
              <Icon name="check" size="small" />
              <span>{t("Cập nhật", "Updated")} {new Date(data.asOf).toLocaleTimeString(isEn ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
          )}
          <Button variant="secondary" onClick={() => setReload((k) => k + 1)} disabled={loading} icon="upload">
            {loading ? t("Đang tải…", "Loading…") : t("Làm mới", "Refresh")}
          </Button>
          <Link to="/admin/reports" className="button button-primary admin-btn-reports">
            <Icon name="chart" size="small" />
            <span>{t("Báo cáo", "Reports")}</span>
          </Link>
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
          <div className="ov-kpi-grid">
            <Kpi
              icon="users"
              label={t("Tổng người dùng", "Total users")}
              value={u.total.toLocaleString(isEn ? "en-US" : "vi-VN")}
              delta={t(`+${u.new7d} mới tuần này`, `+${u.new7d} this week`)}
              sub={t(
                `${u.byStatus.ACTIVE ?? u.total} đang hoạt động · ${u.byStatus.SUSPENDED ?? 0} bị khóa`,
                `${u.byStatus.ACTIVE ?? u.total} active · ${u.byStatus.SUSPENDED ?? 0} suspended`
              )}
              to="/admin/users"
              tone="blue"
              progressPct={pct(u.byStatus.ACTIVE ?? u.total, Math.max(1, u.total))}
            />
            <Kpi
              icon="target"
              label={t("Tài khoản hoạt động", "Active accounts")}
              value={u.active7d.toLocaleString(isEn ? "en-US" : "vi-VN")}
              delta={t(`${pct(u.active7d, u.total)}% tương tác`, `${pct(u.active7d, u.total)}% active`)}
              sub={t(
                `${data.security.logins24h} lượt đăng nhập trong 24h qua`,
                `${data.security.logins24h} logins in the last 24h`
              )}
              to="/admin/settings/logs"
              tone="emerald"
              progressPct={pct(u.active7d, u.total)}
            />
            <Kpi
              icon="wallet"
              label={t("Kế hoạch hưu trí", "Retirement plans")}
              value={u.withPlan.toLocaleString(isEn ? "en-US" : "vi-VN")}
              delta={t(`${pct(u.withPlan, u.total)}% hoàn thành`, `${pct(u.withPlan, u.total)}% completed`)}
              sub={t(
                `${u.withProfile}/${u.total} tài khoản đã nhập hồ sơ tài chính (${pct(u.withProfile, u.total)}%)`,
                `${u.withProfile}/${u.total} accounts with a financial profile (${pct(u.withProfile, u.total)}%)`
              )}
              to="/admin/users"
              tone="amber"
              progressPct={pct(u.withPlan, u.total)}
            />
            <Kpi
              icon="sparkles"
              label={t("Hội thoại Trợ lý AI", "AI Assistant chats")}
              value={data.ai.conversations7d.toLocaleString(isEn ? "en-US" : "vi-VN")}
              delta={t(`${data.ai.questions7d} câu hỏi mới`, `${data.ai.questions7d} new questions`)}
              sub={t(
                `${data.ai.knowledge.approved}/${knowledgeTotal} nguồn tri thức đã duyệt · Trực tuyến`,
                `${data.ai.knowledge.approved}/${knowledgeTotal} knowledge sources approved · Online`
              )}
              to="/admin/ai"
              tone="purple"
              progressPct={knowledgeTotal > 0 ? pct(data.ai.knowledge.approved, knowledgeTotal) : 0}
            />
          </div>

          <section className="ov-attention card" aria-label={t("Việc cần xử lý", "Needs attention")}>
            <div className="ov-attention-header-row">
              <div className="ov-attention-title-wrap">
                <div className="ov-attention-title-heading">
                  <h2>{t("Việc cần xử lý", "Needs attention")}</h2>
                  {dueCount > 0 ? (
                    <span className="ov-attention-status-pill is-due">
                      <span className="ov-attention-dot" />
                      <span>{t(`${dueCount} mục cần xử lý`, `${dueCount} items need attention`)}</span>
                    </span>
                  ) : (
                    <span className="ov-attention-status-pill is-clear">
                      <span className="ov-attention-dot" />
                      <span>{t("Tất cả ổn định", "All clear")}</span>
                    </span>
                  )}
                </div>
                <p className="ov-attention-subtitle">
                  {t(
                    "Các yêu cầu và chỉ số vận hành quản trị viên cần rà soát và giải quyết kịp thời.",
                    "Operational backlog and indicators requiring admin review and timely action."
                  )}
                </p>
              </div>

              <div className="ov-attention-filters" role="tablist" aria-label={t("Lọc việc cần xử lý", "Filter tasks")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={attentionFilter === "all"}
                  className={`ov-filter-btn ${attentionFilter === "all" ? "is-active" : ""}`}
                  onClick={() => setAttentionFilter("all")}
                >
                  <span>{t("Tất cả", "All")}</span>
                  <span className="ov-filter-count">{attention.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={attentionFilter === "due"}
                  className={`ov-filter-btn is-due-tab ${attentionFilter === "due" ? "is-active" : ""}`}
                  onClick={() => setAttentionFilter("due")}
                >
                  <span>{t("Cần xử lý", "Due")}</span>
                  <span className="ov-filter-count is-due">{dueCount}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={attentionFilter === "clear"}
                  className={`ov-filter-btn is-clear-tab ${attentionFilter === "clear" ? "is-active" : ""}`}
                  onClick={() => setAttentionFilter("clear")}
                >
                  <span>{t("Ổn định", "Clear")}</span>
                  <span className="ov-filter-count is-clear">{clearCount}</span>
                </button>
              </div>
            </div>

            <div className="ov-attention-grid">
              {filteredAttention.map((a) => {
                const isDue = a.count > 0;
                return (
                  <Link
                    key={a.label}
                    to={a.to}
                    className={`ov-attention-card ${isDue ? "is-due" : "is-clear"} priority-${a.priority}`}
                  >
                    <div className="ov-attention-card-top">
                      <span className="ov-attention-card-cat">{a.category}</span>
                      <div className={`ov-attention-card-icon ${isDue ? "is-due" : "is-clear"}`}>
                        <Icon name={isDue ? a.icon : "circle-check"} size="small" />
                      </div>
                    </div>

                    <div className="ov-attention-card-content">
                      <div className="ov-attention-stat-row">
                        <strong className="ov-attention-stat">{a.count}</strong>
                        <span className={`ov-attention-tag ${isDue ? (a.priority === "high" ? "is-urgent" : "is-pending") : "is-done"}`}>
                          {!isDue && <Icon name="check" size="small" />}
                          <span>{a.statusLabel}</span>
                        </span>
                      </div>
                      <h3 className="ov-attention-card-title">{a.label}</h3>
                    </div>

                    <div className="ov-attention-card-bottom">
                      <span className="ov-attention-card-note">{a.note || (isDue ? t("Cần xem xét", "Needs review") : t("Không có tồn đọng", "No backlog"))}</span>
                      <span className="ov-attention-card-arrow" aria-hidden="true">
                        <span className="ov-attention-arrow-label">
                          {isDue ? (a.priority === "high" ? t("Xử lý ngay", "Action") : t("Kiểm tra", "Review")) : t("Chi tiết", "View")}
                        </span>
                        <Icon name="arrow-right" size="small" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="ov-row ov-row-2-1">
            <Panel
              title={t("Tốc độ đăng ký tài khoản (14 ngày qua)", "New signups velocity (last 14 days)")}
              sub={t("Số lượng thành viên mới tham gia nền tảng mỗi ngày (giờ Việt Nam)", "User accounts created per day (Vietnam time)")}
              to="/admin/users"
              linkLabel={t("Người dùng", "Users")}
              extraHeader={
                <div className="ov-chart-stat-chip">
                  <span>{t("TB:", "Avg:")} <strong>{avg14d} {t("người/ngày", "users/day")}</strong></span>
                  <span>{t("Đỉnh:", "Peak:")} <strong>{maxSignup}</strong></span>
                </div>
              }
            >
              <div className="ov-bars" role="img" aria-label={u.signups14d.map((d) => `${d.date}: ${d.count}`).join(", ")}>
                {u.signups14d.map((d) => {
                  const isPeak = d.count === maxSignup && maxSignup > 0;
                  const heightPct = Math.max(d.count > 0 ? 6 : 2, (d.count / maxSignup) * 100);
                  const dayLabel = d.date.slice(8);
                  const fullDate = d.date.split("-").reverse().join("/");
                  return (
                    <div
                      key={d.date}
                      className={`ov-bar-col ${isPeak ? "is-peak" : ""}`}
                      title={`${fullDate}: ${d.count} ${t("đăng ký mới", "new signups")}`}
                    >
                      <span className="ov-bar-value">{d.count > 0 ? d.count : ""}</span>
                      <span className="ov-bar" style={{ height: `${heightPct}%` }} />
                      <span className="ov-bar-label">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
              <div className="ov-chart-footnote">
                <span>* {t("Rà chuột hoặc chạm vào cột để xem số liệu chi tiết", "Hover or tap on any bar to see daily volume")}</span>
                <Link to="/admin/users" className="ov-footnote-link">{t("Xem danh sách người dùng →", "View user list →")}</Link>
              </div>
            </Panel>

            <Panel title={t("Cấu trúc tài khoản", "Account structure")} to="/admin/users" linkLabel={t("Quản lý", "Manage")}>
              <div className="ov-stack" aria-hidden="true">
                {(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"] as const).map((k) => (
                  <span key={k} className={`ov-stack-seg is-${k.toLowerCase()}`} style={{ flexGrow: u.byStatus[k] ?? 0 }} />
                ))}
              </div>
              <div className="ov-account-breakdown">
                <div className="ov-account-row">
                  <div className="ov-account-label">
                    <span className="ov-dot is-active" />
                    <span>{t("Đang hoạt động", "Active")}</span>
                  </div>
                  <strong>{u.byStatus.ACTIVE ?? 0} <small>({pct(u.byStatus.ACTIVE ?? 0, u.total)}%)</small></strong>
                </div>
                <div className="ov-account-row">
                  <div className="ov-account-label">
                    <span className="ov-dot is-pending" />
                    <span>{t("Chờ xác minh", "Pending verification")}</span>
                  </div>
                  <strong>{u.byStatus.PENDING_VERIFICATION ?? 0} <small>({pct(u.byStatus.PENDING_VERIFICATION ?? 0, u.total)}%)</small></strong>
                </div>
                <div className="ov-account-row">
                  <div className="ov-account-label">
                    <span className="ov-dot is-suspended" />
                    <span>{t("Tạm khóa", "Suspended")}</span>
                  </div>
                  <strong>{u.byStatus.SUSPENDED ?? 0} <small>({pct(u.byStatus.SUSPENDED ?? 0, u.total)}%)</small></strong>
                </div>
              </div>
              <div className="ov-profile-rate-box">
                <span>{t("Tỷ lệ hoàn thành hồ sơ tài chính:", "Financial profile completion rate:")}</span>
                <strong>{pct(u.withProfile, u.total)}% ({u.withProfile}/{u.total})</strong>
              </div>
            </Panel>
          </div>

          <div className="ov-row ov-row-3">
            <Panel
              title={t("Hỗ trợ & tư vấn", "Support & consultations")}
              to="/admin/support"
              linkLabel={t("Xử lý", "Open")}
              iconPill={{ icon: "life-buoy", tone: "indigo" }}
            >
              <h3 className="ov-subhead">{t("Ticket hỗ trợ", "Support tickets")}</h3>
              <div className="ov-pillar-stat-grid">
                <div className="ov-pillar-stat-box">
                  <span className="ov-pillar-stat-label">{t("Chờ phản hồi", "Open / in progress")}</span>
                  <strong className="ov-pillar-stat-val is-amber">{openTickets}</strong>
                </div>
                <div className="ov-pillar-stat-box">
                  <span className="ov-pillar-stat-label">{t("Đã giải quyết", "Resolved")}</span>
                  <strong className="ov-pillar-stat-val is-emerald">{data.support.byStatus.RESOLVED ?? 0}</strong>
                </div>
              </div>
              <StatusList counts={data.support.byStatus} isEn={isEn} order={["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]} />
              <h3 className="ov-subhead">{t("Yêu cầu tư vấn", "Consultations")}</h3>
              <StatusList counts={data.consultations.byStatus} isEn={isEn} order={["NEW", "PROCESSING", "SCHEDULED", "COMPLETED", "CANCELLED"]} />
            </Panel>

            <Panel
              title={t("Nội dung & tri thức AI", "Content & AI knowledge")}
              to="/admin/ai"
              linkLabel={t("Trợ lý AI", "AI assistant")}
              iconPill={{ icon: "sparkles", tone: "purple" }}
            >
              <h3 className="ov-subhead">{t("Bài viết, FAQ, thuật ngữ", "Articles, FAQ, glossary")}</h3>
              <StatusList counts={data.content.byStatus} isEn={isEn} order={["PUBLISHED", "DRAFT"]} />
              <h3 className="ov-subhead">{t("Nguồn tri thức AI", "AI knowledge sources")}</h3>
              <div className="ov-knowledge-progress-card">
                <div className="ov-knowledge-progress-head">
                  <span>{t("Kiểm duyệt nguồn tri thức AI", "Knowledge verification")}</span>
                  <strong>{data.ai.knowledge.approved}/{knowledgeTotal} ({knowledgeTotal > 0 ? pct(data.ai.knowledge.approved, knowledgeTotal) : 0}%)</strong>
                </div>
                <div className="ov-progress-track">
                  <span style={{ width: `${knowledgeTotal > 0 ? pct(data.ai.knowledge.approved, knowledgeTotal) : 0}%` }} />
                </div>
              </div>
              <dl className="ov-status-list">
                <div><dt>{t("Đã phê duyệt", "Approved")}</dt><dd>{data.ai.knowledge.approved}</dd></div>
                <div><dt>{t("Chưa duyệt", "Not approved")}</dt><dd>{knowledgePending}</dd></div>
                <div><dt>{t("Nhà cung cấp AI", "AI provider")}</dt><dd><Badge tone={data.ai.providerConfigured ? "success" : "warning"}>{data.ai.providerConfigured ? t("Đã cấu hình", "Configured") : t("Chưa cấu hình", "Not configured")}</Badge></dd></div>
              </dl>
            </Panel>

            <Panel
              title={t("Chính sách & sản phẩm", "Policy & catalog")}
              to="/admin/legal-rules"
              linkLabel={t("Luật BHXH", "Legal rules")}
              iconPill={{ icon: "file-text", tone: "teal" }}
            >
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
            <Panel
              title={t("Sức khỏe hệ thống", "System health")}
              to="/admin/settings/logs"
              linkLabel={t("Nhật ký", "Logs")}
              extraHeader={
                <span className="ov-uptime-pill">
                  <span className="ov-dot is-active" />
                  {uptime}
                </span>
              }
            >
              <dl className="ov-status-list">
                {([["email", t("Gửi email (SMTP)", "Email (SMTP)")], ["encryption", t("Mã hóa hàng đợi", "Queue encryption")], ["google", t("Đăng nhập Google", "Google sign-in")], ["media", t("Lưu trữ ảnh", "Media storage")]] as const).map(([k, label]) => (
                  <div key={k}><dt>{label}</dt><dd><Badge tone={data.system.configuration[k] ? "success" : "warning"}>{data.system.configuration[k] ? t("Sẵn sàng", "Ready") : t("Chưa cấu hình", "Missing")}</Badge></dd></div>
                ))}
                <div><dt>{t("Email đã gửi / lỗi", "Emails sent / failed")}</dt><dd>{data.system.mailJobs.COMPLETED ?? 0} / {data.system.mailJobs.FAILED ?? 0}</dd></div>
                <div><dt>{t("Email đang chờ", "Emails queued")}</dt><dd>{(data.system.mailJobs.PENDING ?? 0) + (data.system.mailJobs.PROCESSING ?? 0)}</dd></div>
              </dl>
            </Panel>

            <Panel title={t("Người dùng mới nhất", "Newest users")} to="/admin/users" linkLabel={t("Tất cả", "All")}>
              <ul className="ov-feed">
                {data.recentUsers.map((r, i) => (
                  <li key={r.id} className="ov-user-feed-item">
                    <div className="ov-user-feed-left">
                      <span className={`ov-avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                        {getInitials(r.fullName)}
                      </span>
                      <div className="ov-user-feed-meta">
                        <Link to={`/admin/users/${r.id}`}><strong>{r.fullName}</strong></Link>
                        <small>{r.email}</small>
                      </div>
                    </div>
                    <div className="ov-user-feed-right">
                      <Badge tone={r.status === "ACTIVE" ? "success" : r.status === "SUSPENDED" ? "danger" : "warning"}>
                        {LABELS[r.status]?.[isEn ? 1 : 0] ?? r.status}
                      </Badge>
                      <small>{formatRelativeTime(r.createdAt, isEn)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={t("Thao tác quản trị gần đây", "Recent admin actions")} to="/admin/settings/logs" linkLabel={t("Nhật ký", "Logs")}>
              {data.recentAudit.length === 0 ? (
                <p className="ov-empty">{t("Chưa có thao tác nào gần đây.", "No recent actions recorded.")}</p>
              ) : (
                <ul className="ov-feed">
                  {data.recentAudit.map((a) => {
                    const actionInfo = getActionLabel(a.action, isEn);
                    return (
                      <li key={a.id} className="ov-audit-feed-item">
                        <div className="ov-audit-feed-left">
                          <span className={`ov-audit-icon is-${actionInfo.icon}`}>
                            <Icon name={actionInfo.icon} size="small" />
                          </span>
                          <div className="ov-audit-feed-meta">
                            <strong className="ov-audit-title">{actionInfo.title}</strong>
                            <div className="ov-audit-feed-sub">
                              <span className="ov-audit-actor">{a.performerName}</span>
                              <span className="ov-audit-sep">·</span>
                              <span className="ov-target-type-tag">{a.targetType}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ov-audit-feed-right">
                          <small className="ov-audit-time">{formatRelativeTime(a.createdAt, isEn)}</small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
