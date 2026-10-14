import { Link } from "react-router";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import { Button } from "./ui";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import "./plan-sync-status.css";

export default function PlanSyncStatus() {
  const { synchronization: sync, currentVersion, plansError, refreshPlans } = useRetirementPlan();
  const { loadError, reloadProfile } = useFinancialProfile();
  const { language } = useI18n();
  const en = language === "en";
  if (!currentVersion) return null;
  if (sync.status === "loading") return <p className="plan-sync-status" role="status">{en ? "Updating calculations from your profile…" : "Đang cập nhật số liệu theo hồ sơ…"}</p>;
  if (sync.status === "error") return <div className="plan-sync-status" role="alert">{en ? "Could not update calculations. Your saved version is retained." : "Chưa cập nhật được số liệu. Phiên bản đã lưu vẫn được giữ."} <Button variant="secondary" onClick={() => { if (loadError) reloadProfile(); if (plansError) void refreshPlans(); sync.retry(); }}>{en ? "Retry" : "Thử lại"}</Button><small>{sync.error}</small></div>;
  if (sync.status === "incomplete") return <p className="plan-sync-status">{en ? "More information is needed to calculate your updated plan." : "Cần bổ sung thông tin để tính kế hoạch theo hồ sơ mới."} <Link to="/user/plan">{en ? "View missing items" : "Xem mục cần bổ sung"}</Link></p>;
  return sync.changed ? <p className="plan-sync-status">{en ? "Calculated from your current profile · Preview" : "Đã tính theo hồ sơ hiện tại · Bản xem trước"}</p> : null;
}
