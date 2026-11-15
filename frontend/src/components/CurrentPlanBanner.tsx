import { Link } from "react-router";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import { formatCompactMoneyDecimal } from "../utils/moneyDisplay";

export default function CurrentPlanBanner() {
  const { currentVersion } = useRetirementPlan(), { v2Profile } = useFinancialProfile();
  const en = useI18n().language === "en";
  if (!currentVersion) return null;
  const preview = currentVersion.preview, month = preview.calculation?.summary.retirementMonth;
  const birth = currentVersion.birthMonth ? {status:"KNOWN" as const,value:currentVersion.birthMonth} : v2Profile?.personal.birthMonth;
  const age = month && birth?.status === "KNOWN" ? Math.floor(((Number(month.slice(0,4))-Number(birth.value.slice(0,4)))*12+Number(month.slice(5))-Number(birth.value.slice(5)))/12) : null;
  return <section className="plan-status is-current current-plan-banner" role="status">
    <div><strong>{en ? "Current main plan" : "Kế hoạch chính đang dùng"}</strong>
      <p>{en ? `Option ${currentVersion.version} (Version ${currentVersion.version}` : `Phương án ${currentVersion.version} (Phiên bản ${currentVersion.version}`}{age !== null ? (en ? ` · Retire at ${age}` : ` · Nghỉ ${age} tuổi`) : ""}{en ? ", contribute " : ", góp "}{formatCompactMoneyDecimal(preview.selection.monthlyContribution, en)}/{en ? "month" : "tháng"}) {en ? "is the main plan in use." : "là kế hoạch chính đang dùng."}</p>
      <small>{en ? "You can edit this option or compare other scenarios." : "Bạn có thể chỉnh sửa phương án hoặc so sánh các kịch bản khác."}</small>
    </div><Link className="overview-button secondary" to="/user/plan?view=history">{en ? "View options" : "Xem các phương án"}</Link>
  </section>;
}
