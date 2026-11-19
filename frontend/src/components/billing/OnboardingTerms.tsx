import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../../i18n";
import { ApiError } from "../../services/api";
import { acceptTerms, getBillingOverview } from "../../services/billing";
import "./billing.css";

type TermsState = { status: "loading" | "off" | "accepted" | "needed"; termsVersion: string };

/**
 * Final onboarding step: terms & fee policy consent.
 * `required` is true only when billing is on and the terms are not yet accepted.
 * `submit()` records the consent (POST /me/billing/terms) and resolves false when it must block.
 */
export function useOnboardingTerms() {
  const en = useI18n().language === "en";
  const [state, setState] = useState<TermsState>({ status: "loading", termsVersion: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const overview = await getBillingOverview();
      setState({ status: overview.termsRequired ? "needed" : "accepted", termsVersion: overview.termsVersion });
    } catch {
      // Billing off, or the lookup failed: never block the survey. The signed-in area asks again if needed.
      setState({ status: "off", termsVersion: "" });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const required = state.status === "needed";
  const submit = useCallback(async (): Promise<boolean> => {
    if (!required) return true;
    if (!agreed) return false;
    setError("");
    try { await acceptTerms(state.termsVersion); setState(current => ({ ...current, status: "accepted" })); return true; }
    catch (e) {
      if (e instanceof ApiError && e.code === "TERMS_VERSION_MISMATCH") {
        setAgreed(false); await load();
        setError(en ? "The terms were just updated. Please review and agree again." : "Điều khoản vừa được cập nhật. Vui lòng đọc lại và đồng ý lần nữa.");
      } else setError(e instanceof Error ? e.message : en ? "Could not save your confirmation. Please try again." : "Chưa lưu được xác nhận. Vui lòng thử lại.");
      return false;
    }
  }, [required, agreed, state.termsVersion, load, en]);
  return { required, agreed, setAgreed, submit, error, clearError: () => setError("") };
}

export function TermsCheckbox({ terms, disabled }: { terms: ReturnType<typeof useOnboardingTerms>; disabled?: boolean }) {
  const { language } = useI18n();
  const en = language === "en";
  if (!terms.required) return null;
  return <div className="billing-terms">
    <label className="billing-terms-check">
      <input type="checkbox" checked={terms.agreed} disabled={disabled} onChange={event => { terms.clearError(); terms.setAgreed(event.target.checked); }} />
      <span>{en ? "I agree to the " : "Tôi đồng ý với "}<Link className="billing-terms-link" to="/chinh-sach#phi-dich-vu" target="_blank" rel="noopener noreferrer">{en ? "Terms & fee policy" : "Điều khoản & Chính sách phí"}</Link>{en ? ", including a service fee based on my retirement assets after the trial." : ", gồm phí dịch vụ theo quy mô tài sản dành cho nghỉ hưu sau thời gian dùng thử."}</span>
    </label>
    {terms.error && <p role="alert" className="billing-error">{terms.error}</p>}
  </div>;
}
