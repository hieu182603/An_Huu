import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BillingQr } from "../../components/billing/BillingQr";
import { useBilling } from "../../components/billing/BillingContext";
import { useI18n } from "../../i18n";
import { ApiError } from "../../services/api";
import { getOrderStatus, getStatement, payStatement, type PaymentOrder, type StatementDetail } from "../../services/billing";
import { canPayStatement, formatCountdown, formatPeriod, formatVnDate, formatVnd, secondsLeft } from "../../services/billingFormat";
import "../account-settings.css";
import "../../components/billing/billing.css";

const WATCH_INTERVAL_MS = 4000;

/** /user/billing/pay/:statementId: breakdown, payOS link and a countdown to the link's expiry. */
export default function BillingPayPage() {
  const { statementId = "" } = useParams();
  const { language } = useI18n();
  const { disabled } = useBilling();
  const navigate = useNavigate();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());


  const goResult = useCallback((orderId?: string) => {
    navigate(orderId ? `/user/billing/result?orderId=${encodeURIComponent(orderId)}` : `/user/billing/result?statementId=${encodeURIComponent(statementId)}`, { replace: true });
  }, [navigate, statementId]);

  useEffect(() => {
    if (disabled || !statementId) return;
    let active = true;
    setOrder(null);
    setStatement(null);
    setError("");
    setCreating(false);
    async function load() {
      try {
        const row = await getStatement(statementId);
        if (!active) return;
        setStatement(row);
        if (!canPayStatement(row)) {
          if (row.status === "PAID" || row.status === "WAIVED") goResult();
          return;
        }
        setCreating(true);
        const payment = await payStatement(statementId);
        if (active) { setNow(Date.now()); setOrder(payment); }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.code === "STATEMENT_SETTLED") { goResult(); return; }
        if (e instanceof ApiError && e.code === "PAYMENT_CODE_UNAVAILABLE") setError(t("Vui lòng liên hệ An Hưu để được hỗ trợ thanh toán kỳ phí này.", "Please contact An Huu for help paying this fee."));
        else setError(e instanceof Error ? e.message : t("Chưa tải được thông tin thanh toán.", "Unable to load payment details."));
      } finally { if (active) setCreating(false); }
    }
    void load();
    return () => { active = false; };
  }, [statementId, disabled, goResult, en]);

  useEffect(() => {
    if (!order) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [order]);

  const remaining = order ? secondsLeft(order.expiredAt, now) : 0;
  const live = Boolean(order && order.status === "PENDING" && remaining > 0);

  // Paying from a banking app does not redirect back here, so watch the order while the code is live.
  useEffect(() => {
    if (!order || !live) return;
    let active = true;
    const timer = window.setInterval(() => {
      getOrderStatus(order.id).then(result => { if (active && result.order.status !== "PENDING") goResult(order.id); }).catch(() => { /* the result page reports errors */ });
    }, WATCH_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [order?.id, live, goResult]);

  if (disabled) return <div className="account-page-wrapper"><p>{t("Tính năng này hiện chưa được bật.", "This feature is not available right now.")}</p></div>;
  const rate = statement?.schedule?.annualRatePercent;
  return <div className="account-page-wrapper billing-pay">
    <div className="account-page-head">
      <h1>{t("Thanh toán phí dịch vụ", "Pay the service fee")}</h1>
      <p>{statement ? t(`Kỳ phí ${formatPeriod(statement.period)}`, `Fee period ${formatPeriod(statement.period)}`) : t("Đang tải kỳ phí…", "Loading the fee period…")}</p>
    </div>
    <div className="billing-pay-grid">
      <section className="account-card" aria-labelledby="billing-breakdown">
        <header className="card-header"><h2 id="billing-breakdown">{t("Diễn giải", "Breakdown")}</h2></header>
        {statement ? <dl className="billing-facts">
          <div><dt>{t("Căn cứ tính phí", "Fee base")}</dt><dd>{formatVnd(statement.baseAmountVnd)}</dd></div>
          <div><dt>{t("Công thức", "Formula")}</dt><dd>{rate ? t(`${formatVnd(statement.baseAmountVnd)} × ${rate.replace(".", ",")}%/năm ÷ 12 = ${formatVnd(statement.rawFeeVnd)}`, `${formatVnd(statement.baseAmountVnd)} × ${rate}%/year ÷ 12 = ${formatVnd(statement.rawFeeVnd)}`) : formatVnd(statement.rawFeeVnd)}</dd></div>
          <div><dt>{t("Phí của kỳ", "Fee for the period")}</dt><dd>{formatVnd(statement.amountVnd)}</dd></div>
          {statement.adjustments.map(row => <div key={row.id}><dt>{t("Điều chỉnh", "Adjustment")}</dt><dd>{formatVnd(row.amountVnd)}</dd></div>)}
          {statement.payments.length > 0 && <div><dt>{t("Đã thanh toán", "Already paid")}</dt><dd>{formatVnd(statement.payments.reduce((sum, row) => sum + row.amountVnd, 0))}</dd></div>}
          <div className="billing-facts-total"><dt>{t("Số cần thanh toán", "Amount to pay")}</dt><dd>{formatVnd(statement.amountDueVnd)}</dd></div>
          <div><dt>{t("Hạn thanh toán", "Due date")}</dt><dd>{formatVnDate(statement.dueDate)}</dd></div>
        </dl> : !error && <p role="status">{t("Đang tải…", "Loading…")}</p>}
      </section>
      <section className="account-card billing-payment-panel" aria-labelledby="billing-qr">
        <header className="card-header"><h2 id="billing-qr">{t("Thanh toán qua payOS", "Pay with payOS")}</h2></header>
        {statement && !canPayStatement(statement) && !order && <p className="billing-note" role="status">{t("Kỳ phí này hiện không còn khoản nào cần thanh toán.", "This fee period has nothing left to pay.")}</p>}
        {creating && <p role="status">{t("Đang tải mã thanh toán…", "Loading your payment code…")}</p>}
        {error && <p role="alert" className="billing-error">{error}</p>}
        {order && !creating && <>
          <p className="billing-amount-label">{t("Số tiền thanh toán", "Payment amount")}</p>
          <p className="billing-amount">{formatVnd(order.amountVnd)}</p>
          {live ? <>
            {order.qrCode ? <BillingQr value={order.qrCode} label={t(`Mã VietQR thanh toán ${formatVnd(order.amountVnd)}`, `VietQR code to pay ${formatVnd(order.amountVnd)}`)} /> : null}
            <p className="billing-note" role="timer" aria-live="off">{t(`Mã còn hiệu lực trong ${formatCountdown(remaining)}.`, `This code stays valid for ${formatCountdown(remaining)}.`)}</p>
            <p className="billing-note">{t("Mở ứng dụng ngân hàng, chọn quét mã QR và xác nhận chuyển khoản. Thanh toán xong, trang này sẽ tự cập nhật.", "Open your banking app, scan the QR code and confirm the transfer. This page updates once payment arrives.")}</p>
            {order.checkoutUrl ? <a className="button button-secondary billing-checkout" href={order.checkoutUrl} target="_blank" rel="noopener noreferrer"><span>{t("Mở trang thanh toán payOS", "Open payOS checkout")}</span></a> : null}
          </> : <p className="billing-note" role="status">{t("Mã thanh toán đã hết hiệu lực. Vui lòng liên hệ An Hưu để được hỗ trợ.", "This payment code has expired. Please contact An Huu for assistance.")}</p>}
        </>}
        <p className="billing-note"><Link to="/user/account?tab=billing">{t("Để sau, quay lại mục Phí dịch vụ", "Later, back to Service fee")}</Link></p>
      </section>
    </div>
  </div>;
}
