import { Link } from "react-router";
import { useI18n } from "../i18n";
import type { userProfileProgress } from "../utils/userProfileProgress";
import ResponsiveDialog from "./ResponsiveDialog";
import { Icon } from "./ui";
import "./user-workspace-dialogs.css";

export default function UserProfileProgressDialog({ items, onClose }: { items: ReturnType<typeof userProfileProgress>; onClose: () => void }) {
  const { language } = useI18n();
  const en = language === "en", lang = en ? 1 : 0;
  const count = items.filter(item => item.done).length, percent = count * 20;
  return <ResponsiveDialog open title={en ? "Profile completion progress" : "Tiến độ hoàn thiện hồ sơ"} onClose={onClose} className="user-workspace-dialog user-profile-progress-dialog" fallbackFocusSelector=".profile-progress, .sidebar-profile-compact, .user-mobile-brand > button">
    <div className="profile-checklist-modal">
      <aside className="checklist-overview-panel">
        <div className="checklist-gauge-wrap" role="progressbar" aria-label={en ? "Profile completion" : "Hoàn thiện hồ sơ"} aria-valuemin={0} aria-valuemax={5} aria-valuenow={count} aria-valuetext={`${count}/5 · ${percent}%`}>
          <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="38" fill="none" stroke="#e1ecfa" strokeWidth="7" /><circle cx="46" cy="46" r="38" fill="none" stroke="#2560b4" strokeWidth="7" strokeDasharray="238.76" strokeDashoffset={238.76 * (1 - count / 5)} strokeLinecap="round" transform="rotate(-90 46 46)" /></svg>
          <div><strong>{count}/5</strong><small>{percent}%</small></div>
        </div>
        <h3>{count === 5 ? (en ? "5 initial information groups ready" : "Đã có 5 nhóm thông tin ban đầu") : (en ? `${5 - count} information groups left` : `Còn ${5 - count} nhóm thông tin`)}</h3>
        <p>{en ? "Review these details so your retirement plan reflects your situation. Asset allocation also needs its own checks." : "Bổ sung và rà soát thông tin để kế hoạch phản ánh đầy đủ hơn hồ sơ của bạn. Phân bổ tài sản vẫn cần kiểm tra các điều kiện riêng."}</p>
        <div className="checklist-status-badge is-done"><Icon name="check" />{en ? `${count} groups ready` : `${count} nhóm đã có`}</div>
        {count < 5 && <div className="checklist-status-badge">{en ? `${5 - count} groups to add` : `${5 - count} nhóm cần thêm`}</div>}
        <p className="checklist-footer-note"><Icon name="shield" />{en ? "Your financial information belongs to your signed-in account." : "Thông tin tài chính được lưu theo tài khoản đăng nhập của bạn."}</p>
      </aside>
      <div className="checklist-items-panel"><p className="checklist-items-head"><span>{en ? "Information groups" : "Các hạng mục thông tin"}</span><span>{en ? `${count}/5 completed` : `${count}/5 hoàn thành`}</span></p>
        {items.map((item, index) => <div className={`profile-checklist-item ${item.done ? "is-done" : ""}`} key={item.key}>
          <span className="profile-checklist-item-icon" aria-hidden="true">{item.done ? <Icon name="check" /> : index + 1}</span>
          <div><strong>{item.title[lang]}</strong><p>{item.description[lang]}</p></div>
          <Link to={item.path} onClick={onClose} aria-label={`${item.done ? (en ? "Review" : "Xem lại") : (en ? "Add" : "Bổ sung")}: ${item.title[lang]}`}>{item.done ? (en ? "Review" : "Xem lại") : (en ? "Add →" : "Bổ sung →")}</Link>
        </div>)}
      </div>
    </div>
  </ResponsiveDialog>;
}
