import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { estimateFee, getBillingOverview, isBillingDisabled, type FeeEstimate } from "../../services/billing";
import { formatPeriod, formatVnd, toBaseAmount } from "../../services/billingFormat";
import "./billing.css";

type EstimateState = { estimate: FeeEstimate | null; disabled: boolean };

/** Debounced POST /me/billing/estimate. Stays silent on errors and when billing is off. */
export function useFeeEstimate(baseAmountVnd: string | null, delayMs = 400): EstimateState {
  const [state, setState] = useState<EstimateState>({ estimate: null, disabled: false });
  useEffect(() => {
    if (baseAmountVnd === null) { setState(current => current.estimate ? { ...current, estimate: null } : current); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      estimateFee(baseAmountVnd, controller.signal)
        .then(estimate => { if (!controller.signal.aborted) setState({ estimate, disabled: false }); })
        .catch(error => {
          if (controller.signal.aborted) return;
          if (isBillingDisabled(error)) setState({ estimate: null, disabled: true });
          else setState(current => current.estimate ? { ...current, estimate: null } : current);
        });
    }, delayMs);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [baseAmountVnd, delayMs]);
  return state;
}

/** Onboarding asset step: expected fee for the retirement money being typed. */
export function FeeEstimateBox({ baseAmountVnd }: { baseAmountVnd: number }) {
  const { language } = useI18n();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const { estimate, disabled } = useFeeEstimate(toBaseAmount(baseAmountVnd));
  if (disabled || !estimate) return null;
  const rate = estimate.schedule.annualRatePercent;
  return <div className="billing-estimate-box" role="status" aria-live="polite">
    <strong>{t("Phí dịch vụ dự kiến", "Estimated service fee")}: {formatVnd(estimate.amountVnd)}{t("/tháng", "/month")}</strong>
    <span>{t(`${rate.replace(".", ",")}%/năm, chia 12 tháng, không tính nhà ở và bất động sản.`, `${rate}% per year, split over 12 months, excluding housing and property.`)}
      {estimate.applied.minimum ? ` ${t("Áp dụng phí tối thiểu.", "The minimum fee applies.")}` : ""}{estimate.applied.maximum ? ` ${t("Áp dụng phí tối đa.", "The maximum fee applies.")}` : ""}</span>
  </div>;
}

/** Assets page: "Phí từ tháng MM/YYYY dự kiến: A → B" before saving a change that moves the fee base. */
export function AssetFeeHint({ currentBaseVnd, newBaseVnd }: { currentBaseVnd: string | null; newBaseVnd: string | null }) {
  const { language } = useI18n();
  const en = language === "en", t = (vi: string, english: string) => en ? english : vi;
  const changed = currentBaseVnd !== null && newBaseVnd !== null && currentBaseVnd !== newBaseVnd;
  const next = useFeeEstimate(changed ? newBaseVnd : null);
  const [currentAmount, setCurrentAmount] = useState<number | null>(null);
  useEffect(() => {
    if (!changed) return;
    let active = true;
    getBillingOverview().then(overview => { if (active) setCurrentAmount(overview.nextEstimate?.amountVnd ?? null); }).catch(() => { if (active) setCurrentAmount(null); });
    return () => { active = false; };
  }, [changed]);
  // When the account has no estimate yet, price the unchanged base the same way.
  const fallback = useFeeEstimate(changed && currentAmount === null ? currentBaseVnd : null);
  const from = currentAmount ?? fallback.estimate?.amountVnd ?? null;
  if (!changed || next.disabled || !next.estimate || from === null) return null;
  return <p className="billing-asset-hint" role="status" aria-live="polite">
    {t(`Phí từ tháng ${formatPeriod(next.estimate.period)} dự kiến: ${formatVnd(from)} → ${formatVnd(next.estimate.amountVnd)}`, `Fee from ${formatPeriod(next.estimate.period)} (estimated): ${formatVnd(from)} → ${formatVnd(next.estimate.amountVnd)}`)}
  </p>;
}
