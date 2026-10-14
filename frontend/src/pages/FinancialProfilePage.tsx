import { Link } from "react-router";
import FinancialProfileGate from "../components/FinancialProfileGate";
import FinancialProfilePanel from "../components/FinancialProfilePanel";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useI18n } from "../i18n";
import "./financial-profile.css";

export default function FinancialProfilePage() {
  const { hasProfile, completenessPercentage } = useFinancialProfile();
  const { language } = useI18n();
  const vi = language !== "en";
  return <div className="financial-profile-page">
    <header className="financial-profile-header">
      <div>
        <span className="financial-profile-eyebrow">{vi ? "CHUẨN BỊ CHO KẾ HOẠCH NGHỈ HƯU" : "PREPARE FOR YOUR RETIREMENT"}</span>
        <h1>{vi ? "Hồ sơ tài chính cá nhân" : "Personal Financial Profile"}</h1>
        <p>{vi ? "Xem lại thông tin, bổ sung các mục còn thiếu và cập nhật khi tình hình tài chính của bạn thay đổi." : "Review your information, complete missing items and update your financial situation."}</p>
      </div>
      <div className="financial-profile-progress"><strong>{completenessPercentage}%</strong><span>{vi ? "Độ hoàn thiện hồ sơ đã lưu" : "Saved profile completion"}</span><progress value={completenessPercentage} max={100} aria-label={vi ? "Độ hoàn thiện hồ sơ" : "Profile completion"} /></div>
    </header>
    <FinancialProfileGate inline>
      {hasProfile ? <FinancialProfilePanel /> : <section className="financial-profile-empty"><h2>{vi ? "Bạn chưa có hồ sơ tài chính" : "Start your financial profile"}</h2><p>{vi ? "Khai báo thông tin ban đầu để theo dõi và cập nhật hồ sơ tại đây." : "Enter your initial information to review and update it here."}</p><Link className="btn btn-primary" to="/onboarding">{vi ? "Khai báo hồ sơ" : "Create profile"}</Link></section>}
    </FinancialProfileGate>
  </div>;
}
