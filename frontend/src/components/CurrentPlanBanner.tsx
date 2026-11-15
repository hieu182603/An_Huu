import { Link } from "react-router";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import { planVersionName } from "../utils/planVersionName";

export default function CurrentPlanBanner() {
  const { currentVersion } = useRetirementPlan(), { v2Profile } = useFinancialProfile();
  const en = useI18n().language === "en";
  if (!currentVersion) return null;
  const preview = currentVersion.preview, month = preview.calculation?.summary.retirementMonth;
  const birth = currentVersion.birthMonth !== undefined ? currentVersion.birthMonth : v2Profile?.personal.birthMonth.status === "KNOWN" ? v2Profile.personal.birthMonth.value : undefined;

  return <section className="plan-status is-current current-plan-banner" role="status">
    <div><strong>{en ? "Current main plan" : "Kế hoạch chính đang dùng"}</strong>
      <p>{planVersionName(currentVersion.version,birth,month,preview.selection.monthlyContribution,en)} {en ? "is the main plan in use." : "là kế hoạch chính đang dùng."}</p>
      <small>{en ? "You can edit this option or compare other scenarios." : "Bạn có thể chỉnh sửa phương án hoặc so sánh các kịch bản khác."}</small>
    </div><Link className="overview-button secondary" to="/user/plan?view=history">{en ? "View options" : "Xem các phương án"}</Link>
  </section>;
}
