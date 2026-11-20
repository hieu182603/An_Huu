import { Link } from "react-router";
import { useI18n } from "../i18n";
import type { CalculationNotice } from "../services/plans";

/** Shown for saved plans calculated with the older end-of-month withdrawal convention. */
export default function CalculationNoticeBanner({ notice, onPreviewAgain }: { notice?: CalculationNotice | null; onPreviewAgain?: () => void }) {
  const en = useI18n().language === "en";
  if (!notice || notice.code !== "CALCULATION_CONVENTION_UPDATED") return null;
  return <section className="plan-status plan-next calculation-notice" role="status">
    <div>
      <strong>{en ? "Calculation method updated" : "Cách tính đã cập nhật"}</strong>
      <p>{en ? "Spending is now withdrawn at the start of each month by method. This plan was saved with the old method; preview again to update it." : "Cách tính đã cập nhật: chi tiêu được rút đầu tháng theo phương pháp. Kế hoạch này lưu theo cách cũ; hãy xem trước lại để cập nhật."}</p>
    </div>
    {notice.suggestedAction === "PREVIEW_AGAIN" && (onPreviewAgain
      ? <button type="button" className="overview-button secondary" onClick={onPreviewAgain}>{en ? "Preview again" : "Xem trước lại"}</button>
      : <Link className="overview-button secondary" to="/user/plan">{en ? "Preview again" : "Xem trước lại"}</Link>)}
  </section>;
}
