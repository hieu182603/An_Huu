import { useRef, useState } from "react";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan, type SavedPlanVersionResult } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import type { RetirementPreviewResult } from "../services/retirement";
import { formatMoneyDecimal } from "../utils/moneyDisplay";
import ResponsiveDialog from "./ResponsiveDialog";
import { useNotification } from "./ui";

export default function DashboardSaveDialog({ preview, onClose }: { preview: RetirementPreviewResult; onClose: () => void }) {
  const { savePlanVersion, applyVersion } = useRetirementPlan();
  const { profileRevision } = useFinancialProfile();
  const { language } = useI18n(), en = language === "en";
  const { notify } = useNotification();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const saved = useRef<SavedPlanVersionResult | null>(null), pending = useRef(false);
  const confirm = async () => {
    if (pending.current) return;
    if (profileRevision !== preview.profileRevision) { setError(en ? "Your profile changed. Close this dialog and review the updated results first." : "Hồ sơ đã thay đổi. Đóng cửa sổ và kiểm tra kết quả cập nhật trước khi lưu."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      // Retry applying the same saved version, without creating a duplicate.
      saved.current ??= await savePlanVersion(preview.selection, preview.inputHash);
      if (!saved.current || !await applyVersion(saved.current.id, preview.profileRevision, saved.current.planId, saved.current.planRevision)) throw new Error(en ? "Could not apply the saved version. Please retry." : "Chưa dùng được phiên bản đã lưu làm kế hoạch chính. Vui lòng thử lại.");
      notify.success(en ? "Main plan updated" : "Đã cập nhật kế hoạch chính", en ? "You can now track progress against this option." : "Bạn có thể theo dõi tiến độ theo phương án này.");
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : (en ? "Could not save the plan. Please retry." : "Chưa lưu được kế hoạch. Vui lòng thử lại.")); }
    finally { pending.current = false; setBusy(false); }
  };
  return <ResponsiveDialog open title={en ? "Use this as your main plan?" : "Dùng phương án này làm kế hoạch chính?"} onClose={() => { if (!pending.current) onClose(); }} className="user-workspace-dialog dashboard-detail-dialog" initialFocusSelector=".dashboard-save-cancel">
    <p>{en ? "This saves a version of the option and makes it the reference for tracking progress and reports. Your existing history is retained." : "Hệ thống sẽ lưu một phiên bản và dùng làm mốc theo dõi tiến độ, báo cáo. Lịch sử hiện có vẫn được giữ lại."}</p>
    <dl><div><dt>{en ? "Monthly contribution" : "Mức góp mỗi tháng"}</dt><dd>{formatMoneyDecimal(preview.selection.monthlyContribution, en)}</dd></div><div><dt>{en ? "Projected retirement fund" : "Quỹ dự kiến khi nghỉ hưu"}</dt><dd>{formatMoneyDecimal(preview.calculation?.summary.atRetirement.projectedFund, en)}</dd></div></dl>
    {error && <div role="alert"><p>{error}</p>{saved.current && <p>{en ? "The version is saved; it has not been applied yet. Retrying will not create another version." : "Phiên bản đã lưu, chưa áp dụng. Thử lại sẽ không tạo thêm phiên bản."}</p>}</div>}
    {profileRevision !== preview.profileRevision && <p role="alert">{en ? "Your profile changed. Close this dialog and review the updated results." : "Hồ sơ đã thay đổi. Đóng cửa sổ và kiểm tra kết quả cập nhật."}</p>}
    <div className="dashboard-dialog-actions"><button type="button" className="overview-button secondary dashboard-save-cancel" onClick={onClose} disabled={busy}>{en ? "Review again" : "Xem lại"}</button><button type="button" className="overview-button" disabled={busy || profileRevision !== preview.profileRevision} onClick={() => void confirm()}>{busy ? (en ? "Saving…" : "Đang lưu…") : saved.current ? (en ? "Retry applying version" : "Thử áp dụng lại") : (en ? "Confirm main plan" : "Xác nhận dùng kế hoạch")}</button></div>
  </ResponsiveDialog>;
}
