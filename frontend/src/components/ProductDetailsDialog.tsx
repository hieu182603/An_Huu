import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { discovery, type ConsultTicket } from "../services/discovery";
import { DiscoveryError } from "./DiscoveryParts";
import ResponsiveDialog from "./ResponsiveDialog";
import { financeMoney } from "../utils/financeHubSummary";
export default function ProductDetailsDialog({ id, initialConsult, onClose, onSent }: { id: string; initialConsult: boolean; onClose: () => void; onSent: () => void }) {
  const en = useI18n().language === "en", t = (vi: string, eng: string) => en ? eng : vi;
  const [attempt, setAttempt] = useState(0), [consult, setConsult] = useState(initialConsult), [channel, setChannel] = useState<"PHONE" | "EMAIL" | "BRANCH">("PHONE"), [phone, setPhone] = useState(""), [message, setMessage] = useState(""), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [ticket, setTicket] = useState<ConsultTicket | null>(null);
  const { data: product, loading, error: loadError } = useDiscoveryQuery(`${id}:${attempt}`, signal => discovery.product(id, signal));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !product) return; setError("");
    if (!consent || channel === "PHONE" && !/^[0-9+().\s-]{8,20}$/.test(phone.trim())) { setError(t("Xác nhận đồng ý và bổ sung số điện thoại hợp lệ khi chọn liên hệ điện thoại.", "Confirm consent and provide a valid number for phone contact.")); return; }
    setBusy(true);
    try { const result = await discovery.consult(id, { channel, message: message.trim(), consent: true, ...(phone.trim() ? { phone: phone.trim() } : {}), expectedProductRevision: product.revision }); setTicket(result); onSent(); }
    catch (e) { setError(e instanceof Error ? e.message : t("Chưa gửi được yêu cầu.", "Could not send request.")); }
    finally { setBusy(false); }
  };
  const refresh = () => { setConsent(false); setAttempt(n => n+1); };
  return <ResponsiveDialog open title={ticket ? t("Đã ghi nhận yêu cầu tư vấn", "Consultation request recorded") : consult ? t("Yêu cầu tư vấn sản phẩm", "Request product consultation") : t("Thông tin sản phẩm", "Product details")} className="user-workspace-dialog discovery-product-dialog" onClose={() => { if (!busy) onClose(); }} fallbackFocusSelector=".discovery-tools">
    {loading ? <p role="status">{t("Đang tải điều kiện mới nhất…", "Loading current product terms…")}</p> : loadError ? <DiscoveryError message={loadError} retry={refresh} /> : product && <>
      <h3>{product.name}</h3><p>{product.partner?.name} · {product.category}</p>
      {ticket ? <><p role="status">{t("Yêu cầu đã được lưu trong Hỗ trợ. Bạn có thể theo dõi phản hồi tại hội thoại này.", "Your request is saved in Support. Follow responses in its conversation.")}</p><Link className="overview-button primary" to={`/user/support?ticket=${ticket.id}`} onClick={onClose}>{t("Mở hội thoại hỗ trợ", "Open support conversation")}</Link></> : consult ? <form className="cashflow-form" onSubmit={submit}>
        <p>{t("Yêu cầu được gửi tới bộ phận hỗ trợ An Hưu. Chưa có giao dịch mua hoặc chuyển tiền.", "This creates a request for An Huu support. It does not purchase a product or transfer funds.")}</p>
        <fieldset disabled={busy}><label>{t("Hình thức liên hệ", "Contact channel")}<select aria-label={t("Hình thức liên hệ", "Contact channel")} value={channel} onChange={e => setChannel(e.target.value as typeof channel)}><option value="PHONE">{t("Điện thoại", "Phone")}</option><option value="EMAIL">Email</option><option value="BRANCH">{t("Tại chi nhánh", "At a branch")}</option></select></label><label>{t("Số điện thoại liên hệ", "Contact phone")}<input type="tel" aria-label={t("Số điện thoại liên hệ", "Contact phone")} maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} /></label><label>{t("Nội dung cần tư vấn", "Your question")}<textarea aria-label={t("Nội dung cần tư vấn", "Your question")} value={message} maxLength={2000} rows={4} onChange={e => setMessage(e.target.value)} /></label><label className="discovery-checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{t("Tôi đồng ý gửi thông tin trên để được hỗ trợ về sản phẩm này.", "I agree to send these details for support about this product.")}</label></fieldset>
        {error && <div role="alert" className="discovery-error"><p>{error}</p><button type="button" className="overview-button secondary" disabled={busy} onClick={refresh}>{t("Xem lại điều kiện mới nhất", "Reload current terms")}</button></div>}
        <footer><button type="button" className="overview-button secondary" disabled={busy} onClick={() => setConsult(false)}>{t("Xem điều kiện", "Review terms")}</button><button className="overview-button primary" type="submit" disabled={busy}>{busy ? t("Đang gửi…", "Sending…") : t("Gửi yêu cầu", "Send request")}</button></footer>
      </form> : <><p>{product.description}</p><dl className="discovery-details">{[[t("Lợi suất công bố (không cam kết)", "Published return (not guaranteed)"), product.expectedReturn], ...(product.minimumAmount != null ? [[t("Mức tham gia tối thiểu", "Minimum amount"), financeMoney(product.minimumAmount, en)]] : []), [t("Phí hằng năm", "Annual fee"), product.annualFee], [t("Điều kiện", "Conditions"), product.conditions], [t("Thông tin công bố", "Disclosure"), product.disclosure]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || t("Chưa công bố", "Not provided")}</dd></div>)}</dl><button className="overview-button primary" onClick={() => setConsult(true)}>{t("Yêu cầu tư vấn", "Request consultation")}</button></>}
    </>}
  </ResponsiveDialog>;
}
