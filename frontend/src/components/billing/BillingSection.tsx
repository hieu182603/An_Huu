import receiptMark from "../../assets/logo-mark.webp";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Alert, Badge, Button, useNotification } from "../ui";
import ResponsiveDialog from "../ResponsiveDialog";
import { useI18n } from "../../i18n";
import { ApiError } from "../../services/api";
import {
  getFeeSchedule, getStatement, listStatements, resumeBilling, stopBilling,
  type BillingAccount, type FeeSchedule, type FeeStatement, type StatementDetail, type StatementStatus,
} from "../../services/billing";
import {
  canPayStatement, daysUntil, formatPeriod, formatVnDate, formatVnDateTime, formatVnd, needsAssetDeclaration, nextVnPeriod,
} from "../../services/billingFormat";
import { TermsDialog } from "./BillingProvider";
import { useBilling } from "./BillingContext";
import "./billing.css";

const PAGE_SIZE = 12;
type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** "Phí dịch vụ" block of the account page. Renders nothing while billing is switched off. */
export default function BillingSection() {
  const { overview, disabled, loading, error, refresh } = useBilling();
  const { language } = useI18n();
  const { notify } = useNotification();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [history, setHistory] = useState<FeeStatement[]>([]);
  const [total, setTotal] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"stop" | "resume" | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const [schedule, setSchedule] = useState<FeeSchedule | null>(null);
  useEffect(() => { let on = true; getFeeSchedule().then(info => { if (on) setSchedule(info.current); }).catch(() => {}); return () => { on = false; }; }, []);

  const account = overview?.account ?? null;
  const loadHistory = useCallback(async (page: number) => {
    setLoadingMore(true); setHistoryError("");
    try {
      const result = await listStatements(page, PAGE_SIZE);
      setTotal(result.total);
      setHistory(current => page === 1 ? result.items : [...current, ...result.items.filter(item => !current.some(row => row.id === item.id))]);
    } catch (e) { setHistoryError(e instanceof Error ? e.message : ""); }
    finally { setLoadingMore(false); }
  }, []);
  // Reload the list whenever the overview changes (after paying, stopping or resuming).
  useEffect(() => { if (overview && !disabled) void loadHistory(1); }, [overview, disabled, loadHistory]);

  if (disabled) return null;

  const statusLabel = (status: BillingAccount["status"]) => ({
    TRIAL: t("Đang dùng thử", "On trial"), ACTIVE: t("Đang sử dụng", "Active"), OVERDUE: t("Cần thanh toán", "Payment due"), STOPPED: t("Đã ngừng", "Stopped"),
  })[status];
  const statusTone = (status: BillingAccount["status"]): Tone => ({ TRIAL: "info", ACTIVE: "success", OVERDUE: "warning", STOPPED: "neutral" } as const)[status];
  const statementLabel = (status: StatementStatus) => ({
    ISSUED: t("Chờ thanh toán", "Awaiting payment"), PAID: t("Đã thanh toán", "Paid"), OVERDUE: t("Quá hạn", "Overdue"), WAIVED: t("Được miễn", "Waived"), VOID: t("Đã hủy", "Cancelled"),
  })[status];
  const statementTone = (status: StatementStatus): Tone => ({ ISSUED: "info", PAID: "success", OVERDUE: "warning", WAIVED: "neutral", VOID: "neutral" } as const)[status];

  const statement = overview?.currentStatement ?? null;
  const payable = canPayStatement(statement);
  const estimate = overview?.nextEstimate ?? null;
  const dueIn = statement?.status === "ISSUED" ? daysUntil(statement.dueDate, Date.now()) : null;

  const runAction = async (kind: "stop" | "resume") => {
    if (!account || busy) return;
    setBusy(true); setActionError("");
    try {
      await (kind === "stop" ? stopBilling : resumeBilling)(account.revision);
      setConfirm(null);
      await refresh();
      notify.success(kind === "stop" ? t("Đã ngừng dịch vụ", "Service stopped") : t("Đã dùng lại dịch vụ", "Service resumed"), kind === "stop" ? t("Dữ liệu của bạn vẫn được giữ nguyên.", "Your data is kept as it is.") : t("Bạn có thể dùng đầy đủ tính năng trở lại.", "You can use all features again."));
    } catch (e) {
      if (e instanceof ApiError && e.code === "REVISION_CONFLICT") { setActionError(t("Trạng thái vừa thay đổi ở nơi khác. Đã tải lại, vui lòng thử lại.", "Your status just changed elsewhere. It has been reloaded, please try again.")); await refresh(); }
      else if (e instanceof ApiError && e.code === "BILLING_NOT_STOPPED") { setConfirm(null); await refresh(); }
      else if (e instanceof ApiError && e.code === "TERMS_REQUIRED") { setConfirm(null); setTermsOpen(true); }
      else setActionError(e instanceof Error ? e.message : t("Chưa thực hiện được. Vui lòng thử lại.", "Could not complete this. Please try again."));
    } finally { setBusy(false); }
  };

  const heroTone = statement?.status === "OVERDUE" ? "warning" : statement?.status === "PAID" ? "success" : "navy";

  return <section className="account-card account-card-full billing-section" id="billing" aria-labelledby="billing-title">
    <h2 id="billing-title" className="billing-sr">{t("Phí dịch vụ", "Service fee")}</h2>
    {loading && !overview && <p role="status">{t("Đang tải phí dịch vụ…", "Loading service fee…")}</p>}
    {error && !overview && <div role="alert" className="billing-error"><p>{error}</p><Button variant="secondary" size="small" onClick={() => void refresh()}>{t("Tải lại", "Reload")}</Button></div>}
    {overview && <div className="billing-layout">
      <div className="billing-main">
        {!account && <p className="billing-note">{t("Bạn chưa đồng ý Điều khoản & Chính sách phí.", "You have not yet agreed to the terms & fee policy.")} <button type="button" className="billing-link" onClick={() => setTermsOpen(true)}>{t("Xem và đồng ý", "Review and agree")}</button></p>}

        <div className={`billing-hero billing-hero-${heroTone}`}>
          <div className="billing-hero-top">
            <span className="billing-hero-label">{statement ? t(`Phí dịch vụ tháng ${formatPeriod(statement.period)}`, `Service fee for ${formatPeriod(statement.period)}`) : t("Phí dịch vụ", "Service fee")}</span>
            <span className="billing-pill">{statement ? statementLabel(statement.status) : account ? statusLabel(account.status) : t("Chưa kích hoạt", "Not active")}</span>
          </div>
          <strong className="billing-hero-amount">{statement ? formatVnd(payable ? statement.amountDueVnd : statement.amountVnd) : account?.status === "TRIAL" ? t("Miễn phí", "Free") : "—"}</strong>
          <p className="billing-hero-sub">{statement ? (statement.status === "PAID" && statement.paidAt ? t(`Đã thanh toán ngày ${formatVnDate(statement.paidAt)}. Cảm ơn bạn!`, `Paid on ${formatVnDate(statement.paidAt)}. Thank you!`)
            : statement.status === "OVERDUE" ? t(`Quá hạn từ ${formatVnDate(statement.dueDate)}. Thanh toán để dùng lại đầy đủ tính năng; dữ liệu của bạn vẫn được giữ nguyên.`, `Overdue since ${formatVnDate(statement.dueDate)}. Pay to restore full access; your data is kept.`)
            : statement.status === "WAIVED" ? t("Kỳ phí này được miễn.", "This fee period is waived.")
            : <>{t(`Hạn thanh toán ${formatVnDate(statement.dueDate)}`, `Due ${formatVnDate(statement.dueDate)}`)}{dueIn !== null && dueIn >= 0 ? ` · ${dueIn === 0 ? t("hôm nay", "today") : t(`còn ${dueIn} ngày`, `${dueIn} day(s) left`)}` : ""}</>)
            : account?.status === "TRIAL" ? (account.trialEndsAt ? t(`Dùng thử đến ${formatVnDate(account.trialEndsAt)}. Sau đó phí được tính theo tháng.`, `Free trial until ${formatVnDate(account.trialEndsAt)}. After that the fee is billed monthly.`) : t("Bạn đang dùng thử.", "You are on a free trial."))
            : account?.status === "STOPPED" ? t(`Đã ngừng từ tháng ${formatPeriod(account.stoppedFromPeriod)}.`, `Stopped from ${formatPeriod(account.stoppedFromPeriod)}.`)
            : t("Chưa có kỳ phí nào cần thanh toán.", "No fee period needs payment right now.")}</p>
          {payable && statement?.status === "ISSUED" && <p className="billing-hero-hint">{t("Chưa muốn thanh toán ngay? Bạn có thể quay lại bất cứ lúc nào trước hạn. Mã QR chỉ được tạo khi bạn bấm Thanh toán.", "Not ready yet? You can come back any time before the due date. A QR code is only created when you press Pay.")}</p>}
          {statement && <div className="billing-actions">
            {payable && <Link className="button button-primary button-medium billing-pay-btn" to={`/user/billing/pay/${encodeURIComponent(statement.id)}`}><span>{t("Thanh toán ngay", "Pay now")}</span></Link>}
            <Button variant="secondary" onClick={() => setDetailId(statement.id)}>{t("Xem cách tính", "How it is calculated")}</Button>
          </div>}
        </div>

        {overview.override && <p className="billing-note">{overview.override.kind === "WAIVE" ? t("Phí của bạn đang được miễn theo ưu đãi.", "Your fee is currently waived under an offer.")
          : overview.override.kind === "DISCOUNT_PERCENT" ? t(`Bạn đang được giảm ${overview.override.value ?? ""}% phí theo ưu đãi.`, `You currently get ${overview.override.value ?? ""}% off under an offer.`)
          : t("Bạn đang được áp dụng mức phí ưu đãi.", "A special fee amount currently applies to you.")}</p>}

        <section className="billing-history-block" aria-labelledby="billing-history-title">
          <h3 id="billing-history-title" className="billing-subtitle">{t("Lịch sử thanh toán", "Payment history")}</h3>
          {historyError && <div role="alert" className="billing-error"><p>{historyError}</p><Button variant="secondary" size="small" onClick={() => void loadHistory(1)}>{t("Thử lại", "Retry")}</Button></div>}
          {!historyError && !history.length && !loadingMore && <p className="billing-empty">{t("Chưa có kỳ phí nào. Khi có, từng kỳ và các lần thanh toán sẽ hiện ở đây.", "No fee periods yet. Each period and its payments will appear here.")}</p>}
          {history.length > 0 && <ul className="billing-history">{history.map(row => <li key={row.id}>
            <span className="billing-history-period">{formatPeriod(row.period)}<small>{row.paidAt ? t(`Thanh toán ${formatVnDate(row.paidAt)}`, `Paid ${formatVnDate(row.paidAt)}`) : t(`Hạn ${formatVnDate(row.dueDate)}`, `Due ${formatVnDate(row.dueDate)}`)}</small></span>
            <span className="billing-history-amount">{formatVnd(row.amountVnd)}</span>
            <Badge tone={statementTone(row.status)}>{statementLabel(row.status)}</Badge>
            <button type="button" className="billing-link" onClick={() => setDetailId(row.id)}>{t("Chi tiết", "Details")}</button>
          </li>)}</ul>}
          {history.length < total && <Button variant="secondary" size="small" loading={loadingMore} onClick={() => void loadHistory(Math.floor(history.length / PAGE_SIZE) + 1)}>{t("Xem thêm", "Show more")}</Button>}
        </section>
      </div>

      <aside className="billing-side" aria-label={t("Mức phí dự kiến và dịch vụ", "Estimated fee and service")}>
        <div className="billing-side-block">
          <h3 className="billing-subtitle">{t("Mức phí dự kiến kỳ tới", "Estimated next fee")}</h3>
          {estimate ? <>
            <p className="billing-estimate"><strong>{formatVnd(estimate.amountVnd)}</strong> <span>{t(`cho tháng ${formatPeriod(estimate.period)}`, `for ${formatPeriod(estimate.period)}`)}</span></p>
            <p className="billing-note">{t("Tính trên tiền dành cho nghỉ hưu của bạn (không tính nhà ở và bất động sản).", "Based on your retirement funds (housing and property excluded).")}</p>
            <ol className="billing-steps" aria-label={t("Cách tính phí", "How the fee is calculated")}>
              <li><span>{t("Tiền dành cho nghỉ hưu", "Retirement funds")}</span><b>{formatVnd(estimate.baseAmountVnd)}</b></li>
              <li><span>{schedule ? t(`× ${schedule.annualRatePercent.replace(".", ",")}%/năm ÷ 12 tháng`, `× ${schedule.annualRatePercent}%/year ÷ 12 months`) : t("× tỷ lệ phí năm ÷ 12 tháng", "× annual rate ÷ 12 months")}</span><b>{formatVnd(estimate.rawFeeVnd)}</b></li>
              <li><span>{estimate.applied.minimum ? t(`Áp dụng mức tối thiểu${schedule ? ` ${formatVnd(schedule.minMonthlyVnd)}` : ""}`, "Minimum fee applies") : estimate.applied.maximum ? t(`Áp dụng mức tối đa${schedule?.maxMonthlyVnd ? ` ${formatVnd(schedule.maxMonthlyVnd)}` : ""}`, "Maximum fee applies") : t(`Làm tròn lên${schedule ? ` ${formatVnd(schedule.roundingStepVnd)}` : " nghìn đồng"}`, "Rounded up")}</span><b>{formatVnd(estimate.amountVnd)}</b></li>
            </ol>
            {needsAssetDeclaration(estimate.baseSource?.issues) && <p className="billing-note billing-hint">{t("Kê khai tài sản để tính đúng phí.", "Declare your assets so the fee is calculated correctly.")} <Link to="/user/profile?section=assets">{t("Mở trang Tài sản", "Open Assets")}</Link></p>}
          </> : <p className="billing-note">{t("Chưa có mức phí dự kiến.", "No estimate available yet.")}</p>}
        </div>
        {account && <div className="billing-side-block billing-service">
          <h3 className="billing-subtitle">{t("Dịch vụ", "Service")}</h3>
          {account.status === "STOPPED" ? <>
            <p className="billing-note">{t("Bạn có thể dùng lại bất cứ lúc nào.", "You can resume at any time.")}</p>
            <Button onClick={() => { setActionError(""); setConfirm("resume"); }}>{t("Dùng lại dịch vụ", "Resume service")}</Button>
          </> : <>
            <p className="billing-note">{t("Ngừng dịch vụ bất cứ lúc nào. Dữ liệu của bạn được giữ nguyên.", "Stop the service any time. Your data is kept as it is.")}</p>
            <Button variant="secondary" className="billing-stop-btn" onClick={() => { setActionError(""); setConfirm("stop"); }}>{t("Ngừng dịch vụ", "Stop service")}</Button>
          </>}
        </div>}
      </aside>
    </div>}

    {detailId && <StatementDetailDialog id={detailId} onClose={() => setDetailId(null)} />}
    <ResponsiveDialog open={confirm !== null} title={confirm === "resume" ? t("Dùng lại dịch vụ?", "Resume the service?") : t("Ngừng dịch vụ?", "Stop the service?")} className="user-workspace-dialog billing-dialog" onClose={() => { if (!busy) setConfirm(null); }}>
      {confirm === "stop" ? <p>{t(`Dịch vụ sẽ ngừng tính phí từ tháng ${formatPeriod(nextVnPeriod(Date.now()))}. Kỳ phí hiện tại vẫn cần thanh toán nếu còn nợ. Dữ liệu của bạn được giữ nguyên.`, `Billing will stop from ${formatPeriod(nextVnPeriod(Date.now()))}. The current fee period still needs to be paid if anything is due. Your data is kept as it is.`)}</p>
        : <p>{t("Phí dịch vụ sẽ được tính trở lại. Nếu tháng này chưa có kỳ phí, hệ thống sẽ lập kỳ phí mới ngay.", "The service fee will apply again. If this month has no fee period yet, a new one is created right away.")}</p>}
      {actionError && <p role="alert" className="billing-error">{actionError}</p>}
      <div className="saved-actions">
        <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>{t("Giữ nguyên", "Keep as is")}</Button>
        <Button loading={busy} onClick={() => void (confirm && runAction(confirm))}>{confirm === "resume" ? t("Dùng lại", "Resume") : t("Ngừng dịch vụ", "Stop service")}</Button>
      </div>
    </ResponsiveDialog>
    {termsOpen && overview && <TermsDialog termsVersion={overview.termsVersion} onClose={() => setTermsOpen(false)} onAccepted={async () => { setTermsOpen(false); await refresh(); }} />}
  </section>;
}

function StatementDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { language } = useI18n();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setDetail(null); setError("");
    getStatement(id).then(row => { if (active) setDetail(row); }).catch(e => { if (active) setError(e instanceof Error ? e.message : ""); });
    return () => { active = false; };
  }, [id, attempt]);
  const rate = detail?.schedule?.annualRatePercent;
  return <ResponsiveDialog open title={detail ? t(`Kỳ phí ${formatPeriod(detail.period)}`, `Fee period ${formatPeriod(detail.period)}`) : t("Chi tiết kỳ phí", "Fee period details")} className="user-workspace-dialog billing-dialog billing-receipt" onClose={onClose}>
    {error && <div role="alert" className="billing-error"><p>{error}</p><Button variant="secondary" size="small" onClick={() => setAttempt(n => n + 1)}>{t("Thử lại", "Retry")}</Button></div>}
    {!detail && !error && <p role="status">{t("Đang tải…", "Loading…")}</p>}
    {detail && <>
      <div className="billing-receipt-brand"><img src={receiptMark} alt="" /><strong>An Hưu</strong><span>{t("Phiếu phí dịch vụ", "Service fee statement")}</span></div>
      <dl className="billing-facts">
        <div><dt>{t("Căn cứ tính phí", "Fee base")}</dt><dd>{formatVnd(detail.baseAmountVnd)}</dd></div>
        <div><dt>{t("Công thức", "Formula")}</dt><dd>{rate ? t(`${formatVnd(detail.baseAmountVnd)} × ${rate.replace(".", ",")}%/năm ÷ 12 = ${formatVnd(detail.rawFeeVnd)}`, `${formatVnd(detail.baseAmountVnd)} × ${rate}%/year ÷ 12 = ${formatVnd(detail.rawFeeVnd)}`) : formatVnd(detail.rawFeeVnd)}</dd></div>
        <div><dt>{t("Phí theo biểu phí", "Scheduled fee")}</dt><dd>{formatVnd(detail.scheduleFeeVnd)}</dd></div>
        <div><dt>{t("Phí của kỳ", "Fee for the period")}</dt><dd>{formatVnd(detail.amountVnd)}</dd></div>
        {detail.overrideId && <div><dt>{t("Ưu đãi", "Offer")}</dt><dd>{t("Đã áp dụng giảm hoặc miễn", "Discount or waiver applied")}</dd></div>}
        {detail.adjustments.map(row => <div key={row.id}><dt>{t("Điều chỉnh", "Adjustment")}{row.reason ? ` · ${row.reason}` : ""}</dt><dd>{formatVnd(row.amountVnd)}</dd></div>)}
        <div className="billing-receipt-total"><dt>{t("Còn phải trả", "Still due")}</dt><dd>{formatVnd(detail.amountDueVnd)}</dd></div>
        <div><dt>{t("Hạn thanh toán", "Due date")}</dt><dd>{formatVnDate(detail.dueDate)}</dd></div>
        {detail.paidAt && <div><dt>{t("Đã thanh toán lúc", "Paid on")}</dt><dd>{formatVnDateTime(detail.paidAt)}</dd></div>}
      </dl>
      <h3 className="billing-subtitle">{t("Các lần thanh toán", "Payments")}</h3>
      {detail.payments.length || detail.refunds.length ? <ul className="billing-history">
        {detail.payments.map(row => <li key={row.id}><span className="billing-history-period">{formatVnDateTime(row.receivedAt)}</span><span>{formatVnd(row.amountVnd)}</span><span>{t("Đã nhận", "Received")}</span></li>)}
        {detail.refunds.map(row => <li key={row.id}><span className="billing-history-period">{formatVnDateTime(row.createdAt)}</span><span>{formatVnd(row.amountVnd)}</span><span>{t("Hoàn lại", "Refunded")}</span></li>)}
      </ul> : <p className="billing-note">{t("Chưa có lần thanh toán nào.", "No payments yet.")}</p>}
      <div className="saved-actions">
        {canPayStatement(detail) && <Link className="button button-primary button-medium" to={`/user/billing/pay/${encodeURIComponent(detail.id)}`}><span>{t("Thanh toán", "Pay")}</span></Link>}
        <Button variant="secondary" onClick={onClose}>{t("Đóng", "Close")}</Button>
      </div>
    </>}
  </ResponsiveDialog>;
}
