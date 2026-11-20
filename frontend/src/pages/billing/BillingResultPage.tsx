import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "../../components/ui";
import { useBilling } from "../../components/billing/BillingContext";
import { useI18n } from "../../i18n";
import { getOrderStatus, getStatement, type OrderStatusResult } from "../../services/billing";
import { formatPeriod, formatVnd, ORDER_POLL_INTERVAL_MS, ORDER_POLL_MAX_ATTEMPTS, orderView, type OrderView } from "../../services/billingFormat";
import "../account-settings.css";
import "../../components/billing/billing.css";

/**
 * /user/billing/result?orderId=…  payOS adds its own query (code, status, cancel…): ignored on purpose,
 * the answer always comes from GET /me/billing/orders/:id (3 s x 20 polls).
 */
export default function BillingResultPage() {
  const [params] = useSearchParams();
  const orderId = params.get("orderId") ?? "";
  const statementParam = params.get("statementId") ?? "";
  const { language } = useI18n();
  const { disabled, refresh } = useBilling();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [result, setResult] = useState<OrderStatusResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [settledPeriod, setSettledPeriod] = useState("");
  const [round, setRound] = useState(0); // bumps when the user asks to check again
  const attemptRef = useRef(0);

  const view: OrderView | "settled" | "none" = orderId ? orderView(result?.order.status, attempt) : statementParam ? "settled" : "none";

  // The pay page sends people here without an order when the statement was already settled.
  useEffect(() => {
    if (orderId || !statementParam) return;
    let active = true;
    getStatement(statementParam).then(row => { if (active) setSettledPeriod(row.period); void refresh(); }).catch(e => { if (active) setError(e instanceof Error ? e.message : ""); });
    return () => { active = false; };
  }, [orderId, statementParam]);

  useEffect(() => {
    if (!orderId || disabled) return;
    let active = true, timer = 0;
    attemptRef.current = 0; setAttempt(0); setError("");
    const poll = async () => {
      try {
        const next = await getOrderStatus(orderId);
        if (!active) return;
        attemptRef.current += 1; setAttempt(attemptRef.current); setResult(next); setError("");
        const state = orderView(next.order.status, attemptRef.current);
        if (state === "paid" || state === "underpaid") { void refresh(); return; }
        if (state === "waiting") timer = window.setTimeout(poll, ORDER_POLL_INTERVAL_MS);
      } catch (e) {
        if (!active) return;
        attemptRef.current += 1; setAttempt(attemptRef.current);
        setError(e instanceof Error ? e.message : "");
        if (attemptRef.current < ORDER_POLL_MAX_ATTEMPTS) timer = window.setTimeout(poll, ORDER_POLL_INTERVAL_MS);
      }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [orderId, round, disabled]);

  const checkAgain = useCallback(() => setRound(n => n + 1), []);
  const period = result?.statement?.period ?? settledPeriod;

  if (disabled) return <div className="account-page-wrapper"><p>{t("Tính năng này hiện chưa được bật.", "This feature is not available right now.")}</p></div>;
  return <div className="account-page-wrapper billing-result">
    <div className="account-page-head"><h1>{t("Kết quả thanh toán", "Payment result")}</h1>{period && <p>{t(`Phí dịch vụ tháng ${formatPeriod(period)}`, `Service fee for ${formatPeriod(period)}`)}</p>}</div>
    <section className="account-card" aria-live="polite">
      {view === "none" && <><p>{t("Không tìm thấy giao dịch để kiểm tra.", "There is no payment to check.")}</p></>}
      {view === "waiting" && <p role="status">{t("Đang xác nhận thanh toán của bạn… Việc này thường chỉ mất vài giây.", "Confirming your payment… this usually takes a few seconds.")}</p>}
      {(view === "paid" || view === "settled") && <><h2>{t("Thanh toán thành công", "Payment received")}</h2>
        <p>{t("Cảm ơn bạn. Biên nhận sẽ được gửi qua email.", "Thank you. Your receipt will be sent by email.")}</p></>}
      {view === "underpaid" && <><h2>{t("Đã nhận một phần số tiền", "We received part of the amount")}</h2>
        <p>{t("Bộ phận hỗ trợ sẽ liên hệ với bạn để hoàn tất. Bạn không cần làm thêm gì lúc này.", "Our support team will contact you to finish. You do not need to do anything right now.")}</p>
        {result && <p className="billing-note">{t(`Số đã chuyển theo mã này: ${formatVnd(result.order.amountVnd)}.`, `Amount of this code: ${formatVnd(result.order.amountVnd)}.`)}</p>}</>}
      {view === "retry" && <><h2>{result?.order.status === "CANCELLED" ? t("Giao dịch đã được hủy", "The payment was cancelled") : t("Mã thanh toán đã hết hạn", "The payment code expired")}</h2>
        <p>{t("Vui lòng liên hệ An Hưu để được hỗ trợ thanh toán kỳ phí này.", "Please contact An Huu for help paying this fee.")}</p></>}
      {view === "late" && <><h2>{t("Chưa nhận được thanh toán", "We have not received the payment yet")}</h2>
        <p>{t("Chưa nhận được, bạn có thể kiểm tra lại sau. Nếu bạn đã chuyển khoản, hệ thống sẽ tự cập nhật khi ngân hàng báo về.", "Not received yet; you can check again later. If you already paid, we will update automatically once the bank confirms.")}</p>
        <Button onClick={checkAgain}>{t("Kiểm tra lại", "Check again")}</Button></>}
      {error && view === "waiting" && <p className="billing-note" role="status">{t("Chưa kiểm tra được lần này, đang thử lại…", "Could not check this time, retrying…")}</p>}
      <p className="billing-note"><Link to="/user/account?tab=billing">{t("Về mục Phí dịch vụ", "Back to Service fee")}</Link></p>
    </section>
  </div>;
}
