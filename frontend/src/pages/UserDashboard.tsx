import { useState } from "react";
import { Link } from "react-router";
import { MonthlyRetirementChart } from "../components/charts";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { Icon } from "../components/ui";
import PlanSyncStatus from "../components/PlanSyncStatus";
import DashboardDetailsDialog, { overviewNumber, overviewMoney, type DashboardDetail } from "../components/DashboardDetailsDialog";
import DashboardSaveDialog from "../components/DashboardSaveDialog";
import { formatMonthVN } from "../utils/date";
import { userProfileProgress } from "../utils/userProfileProgress";
import type { RetirementPreviewResult } from "../services/retirement";
import { financeAmount } from "../utils/financeHubSummary";
import { Decimal } from "../utils/decimal";
import "./dashboard-overview.css";

export default function UserDashboard() {
  const { user } = useAuth();
  const { profile, v2Profile, profileSummary, hasProfile, loadError, profileRevision } = useFinancialProfile();
  const { synchronization: sync, currentVersion, previewData, previewStatus, previewError, loadingPlans, plansError, refreshPlans, draftSelection } = useRetirementPlan();
  const { language } = useI18n();
  const en = language === "en", lang = en ? 1 : 0;
  const [detail, setDetail] = useState<DashboardDetail | null>(null);
  const [savePreview, setSavePreview] = useState<RetirementPreviewResult | null>(null);

  // Pending/failed synchronization must not expose an older snapshot as current.
  const source = currentVersion ? (sync.status === "ready" ? sync.preview : null)
    : previewStatus === "ready" && previewData?.profileRevision === profileRevision ? previewData : null;
  const preview = hasProfile && !loadError && !loadingPlans && !plansError && source?.status === "READY" ? source : null;
  const calculation = preview?.calculation, summary = calculation?.summary;
  const rows = calculation?.rows ?? [];
  const projected = financeAmount(summary?.atRetirement?.projectedFund), required = financeAmount(summary?.atRetirement?.requiredFund);
  const cashflow = !hasProfile || loadError ? null : financeAmount(profileSummary?.availableMonthlySurplus);
  const capacity = calculation ? financeAmount(rows[0]?.contributionCapacity) : currentVersion || draftSelection || loadingPlans || plansError ? null : cashflow;
  const capacityValue = capacity === null ? null : Decimal.max(0, capacity).toString();
  const contribution = financeAmount(summary?.plannedMonthlyContribution ?? preview?.selection.monthlyContribution);
  const busy = loadingPlans || Boolean(currentVersion && sync.status === "loading") || (!currentVersion && previewStatus === "loading");
  const changed = Boolean(currentVersion && sync.changed);
  const name = user?.name?.trim().split(/\s+/).pop();
  const progress = userProfileProgress(profile, v2Profile, hasProfile, Boolean(currentVersion?.preview.status === "READY" && currentVersion.preview.selection?.answers?.length));
  const birthYear = v2Profile?.personal.birthMonth.status === "KNOWN" ? overviewNumber(v2Profile.personal.birthMonth.value.slice(0, 4)) : profile.personal.age > 0 && preview?.valuationDate ? Number(preview.valuationDate.slice(0, 4)) - profile.personal.age : null;
  const warnings = preview?.warnings ?? [];
  const pensionOmitted = warnings.some(w => w.code === "PENSION_NOT_INCLUDED");
  const hasPension = rows.some(row => (overviewNumber(row.pension) ?? 0) > 0);
  const hypothetical = Boolean(preview?.selection.whatIf || warnings.some(w => w.code === "HYPOTHETICAL_VALUES_PROFILE_UNCHANGED"));
  const needsPlan = !currentVersion || changed;
  const next = !hasProfile ? { path: "/onboarding", title: ["Hoàn tất bản kế hoạch đầu tiên", "Finish your first plan"] }
    : needsPlan ? { path: "/user/plan", title: ["Xem và dùng một phương án làm kế hoạch chính", "Review and use an option as your main plan"] }
    : { path: "/user/simulation", title: ["Cập nhật tình hình theo kế hoạch chính", "Check in on your main plan"] };
  const metrics: Array<{ key: DashboardDetail; title: string; value: string | null }> = [
    { key: "projected", title: en ? "Projected fund at retirement" : "Quỹ dự kiến khi nghỉ hưu", value: projected },
    { key: "required", title: en ? "Required fund for your goal" : "Quỹ cần cho mục tiêu", value: required },
    { key: "capacity", title: en ? "First-month contribution capacity" : "Có thể góp tháng đầu", value: capacityValue },
  ];

  return <div className="yoga-dashboard-layout dashboard-overview"><div className="yoga-dashboard-content">
    <header className="dashboard-greeting"><span className="eyebrow">{en ? "YOUR RETIREMENT PICTURE" : "BỨC TRANH NGHỈ HƯU CỦA BẠN"}</span><h1 className="user-hero-title">{en ? `Hi${name ? ` ${name}` : ""}, one calm step at a time.` : `Chào${name ? ` ${name}` : " bạn"}, an tâm từng bước.`}</h1><p>{en ? "See where you stand and take one next step." : "Xem mình đang ở đâu và chọn một việc tiếp theo."}</p></header>

    {plansError && !currentVersion && <div className="dashboard-load-error" role="alert"><div><strong>{en ? "Could not load your plan" : "Chưa tải được kế hoạch"}</strong><p>{plansError}</p></div><button type="button" className="overview-button secondary" onClick={() => void refreshPlans()}>{en ? "Retry" : "Tải lại kế hoạch"}</button></div>}
    <PlanSyncStatus />
    {!currentVersion && !plansError && previewStatus === "error" && <p className="dashboard-load-error" role="alert">{previewError}<Link to="/user/plan">{en ? "Review and retry" : "Mở kế hoạch để thử lại"}</Link></p>}
    {busy && <p className="dashboard-loading" role="status">{en ? "Loading your plan figures…" : "Đang tải số liệu kế hoạch…"}</p>}

    {hasProfile && !busy && !plansError && <section className={`dashboard-plan-status ${needsPlan ? "is-draft" : "is-applied"}`} aria-label={en ? "Plan status" : "Trạng thái kế hoạch"}>
      <span className="dashboard-status-dot" aria-hidden="true" />
      <div><strong>{needsPlan ? (changed ? (en ? "Your changes have not been applied" : "Thay đổi chưa được dùng làm kế hoạch chính") : (en ? "Next step: save this option as your main plan" : "Bước tiếp theo: lưu phương án này làm kế hoạch chính")) : (en ? `Version ${currentVersion.version} is your main plan` : `Phiên bản ${currentVersion.version} là kế hoạch chính đang dùng`)}</strong>
        {needsPlan ? <ol><li>{contribution === null ? (en ? "Review results and choose your monthly contribution." : "Xem kết quả và chọn mức góp mỗi tháng.") : (en ? `Check your contribution: ${overviewMoney(contribution, en)}/month.` : `Kiểm tra mức góp đang thử: ${overviewMoney(contribution, en)}/tháng.`)}</li><li>{en ? "Confirm a main plan to track progress and view reports." : "Xác nhận kế hoạch chính để theo dõi tiến độ và xem báo cáo."}</li></ol>
          : <p>{currentVersion.preview.reforecast ? (en ? "This plan uses a recorded actual balance. Update it from progress tracking." : "Kế hoạch dùng số dư thực tế đã ghi. Cập nhật tiếp tại Cập nhật tình hình.") : (en ? "Track progress or compare options when your situation changes." : "Theo dõi tiến độ hoặc so sánh phương án khác khi tình hình thay đổi.")}</p>}</div>
      {needsPlan && preview?.inputHash && !currentVersion?.preview.reforecast ? <button type="button" className="overview-button" onClick={() => setSavePreview(preview)}>{changed ? (en ? "Save changes" : "Lưu thay đổi") : (en ? "Save as main plan" : "Lưu làm kế hoạch chính")}</button>
        : <Link className="overview-button" to={needsPlan ? "/user/plan" : "/user/simulation"}>{needsPlan ? (en ? "Review plan" : "Xem kế hoạch") : (en ? "Update progress" : "Cập nhật tình hình")}</Link>}
    </section>}

    <section className="dashboard-next-step"><div><span className="eyebrow">{en ? "YOUR NEXT STEP" : "VIỆC TIẾP THEO CỦA BẠN"}</span><h2>{next.title[lang]}</h2><p>{en ? "Each step helps you understand and control your plan." : "Mỗi bước giúp bạn hiểu và kiểm soát kế hoạch rõ hơn."}</p></div><Link to={next.path} className="overview-button">{en ? "Continue →" : "Tiếp tục →"}</Link></section>
    <details className="dashboard-prep-steps"><summary>{en ? "Plan preparation steps" : "Các bước chuẩn bị kế hoạch"}</summary><div className="dashboard-journey">
      {[...progress.slice(0, 3), { key: "plan", title: ["Dùng kế hoạch chính", "Use a main plan"], path: "/user/plan", done: Boolean(currentVersion) }, progress[4]].map((item, index) => <Link key={item.key} to={item.path}><span aria-hidden="true">{item.done ? <Icon name="check" /> : index + 1}</span><span>{item.title[lang]}<small>{item.done ? (en ? "Ready to review" : "Đã có · Xem lại") : (en ? "Review and complete" : "Rà soát và bổ sung")}</small></span></Link>)}
    </div></details>

    <div className="dashboard-metric-grid" aria-busy={busy}>{metrics.map(({ key, title, value }) => <section key={key} className={`dashboard-metric is-${key}`} aria-label={title}><div className="dashboard-metric-label"><span>{title}</span><button type="button" className="metric-info-btn" aria-label={`${en ? "Explain" : "Giải thích"} ${title}`} aria-haspopup="dialog" onClick={() => setDetail(key)}><Icon name="info" /></button></div><strong>{busy && key !== "capacity" ? (en ? "Calculating…" : "Đang tính…") : overviewMoney(value, en, true)}{key === "capacity" && value !== null && <small>/{en ? "month" : "tháng"}</small>}</strong><span className="dashboard-metric-full">{value === null ? (en ? "Add details or calculate a plan" : "Bổ sung thông tin hoặc tính kế hoạch") : `${overviewMoney(value, en)}${key === "capacity" ? (en ? "/month" : "/tháng") : ""}`}</span></section>)}</div>
    <p className="dashboard-result-note"><Icon name="info" /><span>{en ? "Projection under selected assumptions" : "Dự phóng theo giả định đã chọn"}{pensionOmitted ? (en ? " · Pension not included" : " · Chưa tính lương hưu BHXH") : hasPension ? (en ? " · Declared pension included" : " · Đã tính lương hưu đã khai") : ""}{hypothetical ? (en ? " · Hypothetical option" : " · Phương án giả định") : ""} · <button type="button" onClick={() => setDetail("assumptions")} aria-haspopup="dialog">{en ? "View assumptions" : "Xem giả định"}</button></span></p>

    <section className="dashboard-chart-card"><header><div><h2>{en ? "Your retirement fund" : "Quỹ nghỉ hưu của bạn"}</h2><p>{rows.length ? (en ? `From ${formatMonthVN(rows[0].month)} to ${formatMonthVN(summary!.endMonth)}` : `Từ ${formatMonthVN(rows[0].month)} đến ${formatMonthVN(summary!.endMonth)}`) : (en ? "Uses the same figures as the detailed Plan page." : "Dùng cùng số liệu với trang Kế hoạch chi tiết.")}</p></div><span>{changed || !currentVersion ? (en ? "Preview" : "Bản xem trước") : (en ? "Projection" : "Dự phóng")}</span></header>
      {rows.length && summary ? <MonthlyRetirementChart birthMonth={v2Profile?.personal.birthMonth.status === "KNOWN" ? v2Profile.personal.birthMonth.value : undefined} responsive key={preview?.inputHash} rows={rows} summary={summary} {...(birthYear !== null ? { birthYear } : {})} /> : <div className="dashboard-chart-empty"><Icon name="chart" /><h3>{busy ? (en ? "Updating projection…" : "Đang cập nhật dự phóng…") : (en ? "No projection data available" : "Chưa có số liệu dự phóng")}</h3><p>{en ? "Review your details and calculate a plan to see your fund over time." : "Rà soát thông tin và tính kế hoạch để xem quỹ nghỉ hưu qua từng tháng."}</p><Link to={hasProfile ? "/user/plan" : "/onboarding"} className="overview-button secondary">{hasProfile ? (en ? "Open plan" : "Mở kế hoạch") : (en ? "Add your information" : "Khai báo thông tin")}</Link></div>}
    </section>
    <nav className="dashboard-quick-links" aria-label={en ? "Explore more" : "Xem thêm tình hình"}>{[["/user/plan", "Xem kế hoạch", "See plan"], ["/user/profile", "Xem tài chính", "See finances"], ["/user/risk-portfolio", "Xem phân bổ", "See allocation"], ["/user/simulation", "Cập nhật tình hình", "Update progress"]].map(([path, vi, english]) => <Link to={path} key={path} className="overview-button secondary">{en ? english : vi}</Link>)}</nav>
  </div>
    {detail && <DashboardDetailsDialog detail={detail} preview={preview} capacity={capacity} onClose={() => setDetail(null)} />}
    {savePreview && <DashboardSaveDialog preview={savePreview} onClose={() => setSavePreview(null)} />}
  </div>;
}
