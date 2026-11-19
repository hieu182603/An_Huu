import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Alert, Button } from "../ui";
import ResponsiveDialog from "../ResponsiveDialog";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import { ApiError } from "../../services/api";
import {
  acceptTerms, BILLING_OVERDUE_EVENT, getBillingOverview, getFeeSchedule, isBillingDisabled, parseOverdueDetails,
  type BillingOverdueDetails, type BillingOverview,
} from "../../services/billing";
import { canPayStatement, formatPeriod, formatVnDate, formatVnd } from "../../services/billingFormat";
import FeePolicyContent from "./FeePolicyContent";
import "./billing.css";

type BillingContextValue = {
  /** null until loaded, or when billing is off / failed to load. */
  overview: BillingOverview | null;
  /** True once GET /me/billing answered 503 BILLING_DISABLED: render no billing UI. */
  disabled: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  openTerms: () => void;
};

const BillingContext = createContext<BillingContextValue>({ overview: null, disabled: false, loading: false, error: "", refresh: async () => {}, openTerms: () => {} });
export const useBilling = () => useContext(BillingContext);

const termsSeenKey = (userId: string | undefined, version: string) => `anhuu:billing-terms-later:${userId ?? ""}:${version}`;

/**
 * Loads GET /me/billing once for the signed-in area, listens for the global 402
 * BILLING_OVERDUE event, and owns the two billing dialogs (overdue + terms).
 */
export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overdue, setOverdue] = useState<BillingOverdueDetails | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getBillingOverview();
      setOverview(next); setDisabled(false); setError("");
      return;
    } catch (e) {
      if (isBillingDisabled(e)) { setOverview(null); setDisabled(true); setError(""); return; }
      setError(e instanceof Error && e.message ? e.message : "Chưa tải được phí dịch vụ. Vui lòng thử lại.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { setOverview(null); setDisabled(false); setLoading(true); void refresh(); }, [user?.id, refresh]);

  useEffect(() => {
    const onOverdue = (event: Event) => {
      if (disabled) return;
      const details = parseOverdueDetails((event as CustomEvent).detail);
      // The 402 carries the statement to pay; without it fall back to the account page.
      setOverdue(current => current ?? details ?? { statementId: "", amountDueVnd: 0, dueDate: "" });
      void refresh();
    };
    window.addEventListener(BILLING_OVERDUE_EVENT, onOverdue);
    return () => window.removeEventListener(BILLING_OVERDUE_EVENT, onOverdue);
  }, [disabled, refresh]);

  // Existing users: one terms prompt after sign-in (per browser session; "Để sau" hides it until the next one).
  const termsRequired = overview?.termsRequired === true;
  useEffect(() => {
    if (!termsRequired || !overview) return;
    try { if (sessionStorage.getItem(termsSeenKey(user?.id, overview.termsVersion))) return; } catch { /* storage blocked: still show once */ }
    setTermsOpen(true);
  }, [termsRequired, overview, user?.id]);

  const value = useMemo<BillingContextValue>(() => ({ overview, disabled, loading, error, refresh, openTerms: () => setTermsOpen(true) }), [overview, disabled, loading, error, refresh]);
  return <BillingContext.Provider value={value}>
    {children}
    {!disabled && overdue && <OverdueDialog details={overdue} onClose={() => setOverdue(null)} />}
    {!disabled && termsOpen && overview && <TermsDialog termsVersion={overview.termsVersion} onClose={() => {
      try { sessionStorage.setItem(termsSeenKey(user?.id, overview.termsVersion), "1"); } catch { /* ignore */ }
      setTermsOpen(false);
    }} onAccepted={async () => { setTermsOpen(false); await refresh(); }} />}
  </BillingContext.Provider>;
}

function OverdueDialog({ details, onClose }: { details: BillingOverdueDetails; onClose: () => void }) {
  const { language } = useI18n();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const navigate = useNavigate();
  const target = details.statementId ? `/user/billing/pay/${encodeURIComponent(details.statementId)}` : "/user/account?tab=billing";
  return <ResponsiveDialog open title={t("Thanh toán phí tháng này để tiếp tục", "Pay this month's fee to continue")} className="user-workspace-dialog billing-dialog" initialFocusSelector=".billing-overdue-pay" onClose={onClose}>
    <p>{t("Phí dịch vụ tháng này chưa được thanh toán nên bạn chưa thể tạo mới hoặc tính toán lại kế hoạch lúc này.", "This month's service fee has not been paid yet, so creating or recalculating plans is paused for now.")}</p>
    <p>{t("Dữ liệu của bạn vẫn được giữ nguyên và bạn vẫn xem được mọi thông tin như bình thường.", "Your data is kept as it is and you can still view everything as usual.")}</p>
    {details.amountDueVnd > 0 && <dl className="billing-facts">
      <div><dt>{t("Số cần thanh toán", "Amount due")}</dt><dd>{formatVnd(details.amountDueVnd)}</dd></div>
      {details.dueDate && <div><dt>{t("Hạn thanh toán", "Due date")}</dt><dd>{formatVnDate(details.dueDate)}</dd></div>}
    </dl>}
    <div className="saved-actions">
      <Button variant="secondary" onClick={onClose}>{t("Để sau", "Later")}</Button>
      <Button className="billing-overdue-pay" onClick={() => { onClose(); navigate(target); }}>{t("Thanh toán ngay", "Pay now")}</Button>
    </div>
  </ResponsiveDialog>;
}

/** Terms acceptance dialog. Also used by stop/resume when the API answers TERMS_REQUIRED. */
export function TermsDialog({ termsVersion, onClose, onAccepted }: { termsVersion: string; onClose: () => void; onAccepted: () => void | Promise<void> }) {
  const { language } = useI18n();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const [version, setVersion] = useState(termsVersion);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!agreed || busy) return;
    setBusy(true); setError("");
    try { await acceptTerms(version); await onAccepted(); }
    catch (e) {
      if (e instanceof ApiError && e.code === "TERMS_VERSION_MISMATCH") {
        // The terms changed while the dialog was open: load the current version and ask again.
        try { setVersion((await getFeeSchedule()).termsVersion); setAgreed(false); setError(t("Điều khoản vừa được cập nhật. Vui lòng đọc lại và đồng ý lần nữa.", "The terms were just updated. Please review and agree again.")); }
        catch (inner) { setError(inner instanceof Error ? inner.message : ""); }
      } else setError(e instanceof Error ? e.message : t("Chưa lưu được xác nhận. Vui lòng thử lại.", "Could not save your confirmation. Please try again."));
    } finally { setBusy(false); }
  };
  return <ResponsiveDialog open title={t("Điều khoản & Chính sách phí dịch vụ", "Terms & service fee policy")} className="user-workspace-dialog billing-dialog" onClose={() => { if (!busy) onClose(); }}>
    <p>{t("An Hưu có phí dịch vụ theo quy mô tài sản dành cho nghỉ hưu của bạn. Bạn được dùng thử trước, có thể xem mức phí dự kiến bất cứ lúc nào và ngừng dịch vụ khi muốn.", "An Huu charges a service fee based on the size of your retirement assets. You get a trial first, can see the estimated fee at any time, and can stop the service whenever you like.")}</p>
    <div className="billing-policy-box" tabIndex={0} role="region" aria-label={t("Chính sách phí dịch vụ", "Service fee policy")}><FeePolicyContent /></div>
    <label className="billing-terms-check"><input type="checkbox" checked={agreed} disabled={busy} onChange={event => setAgreed(event.target.checked)} /><span><strong>{t("Tôi đã đọc và đồng ý với Điều khoản & Chính sách phí.", "I have read and agree to the terms & fee policy.")}</strong></span></label>
    {error && <p role="alert" className="billing-error">{error}</p>}
    <div className="saved-actions">
      <Button variant="secondary" disabled={busy} onClick={onClose}>{t("Để sau", "Later")}</Button>
      <Button disabled={!agreed || busy} loading={busy} onClick={() => void submit()}>{t("Đồng ý", "Agree")}</Button>
    </div>
  </ResponsiveDialog>;
}

/** Calm reminder at the top of the user area while the account is OVERDUE. */
export function BillingBanner() {
  const { overview, disabled } = useBilling();
  const { language } = useI18n();
  const { pathname } = useLocation();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  // The pay/result pages and the fee section already say this in full.
  if (disabled || !overview || pathname.startsWith("/user/billing") || pathname === "/user/account") return null;
  const statement = overview.currentStatement;
  if (overview.account?.status !== "OVERDUE" || !statement || !canPayStatement(statement)) return null;
  return <Alert tone="warning" className="billing-banner" title={t(`Phí dịch vụ tháng ${formatPeriod(statement.period)} đã quá hạn`, `The service fee for ${formatPeriod(statement.period)} is overdue`)}
    action={<Link className="button button-primary button-small" to={`/user/billing/pay/${encodeURIComponent(statement.id)}`}><span>{t("Thanh toán", "Pay")}</span></Link>}>
    {t("Thanh toán để tiếp tục tạo mới và tính toán lại kế hoạch. Dữ liệu của bạn vẫn được giữ nguyên.", "Pay to keep creating and recalculating plans. Your data is kept as it is.")}
  </Alert>;
}
