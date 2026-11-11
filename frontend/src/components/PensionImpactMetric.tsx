import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../i18n";
import { authenticatedRequest } from "../services/api";
import { financeMoney } from "../utils/financeHubSummary";
import { formatMonthVN } from "../utils/date";
import ResponsiveDialog from "./ResponsiveDialog";
type Impact = { status: "READY" | "INCOMPLETE"; profileRevision: number; requiredFundWithPension: string | null; requiredFundWithoutPension: string | null; fundReduction: string | null; endMonth: string; issues: Array<{ path: string; code: string }> };
export default function PensionImpactMetric({ revision }: { revision: number }) {
  const { synchronization: sync, currentVersion, previewData, previewStatus, loadingPlans, plansError, draftSelection } = useRetirementPlan(), { user } = useAuth();
  const en = useI18n().language === "en", t = (vi: string, english: string) => en ? english : vi;
  const candidate = currentVersion ? sync.status === "ready" ? sync.preview : null : previewStatus === "ready" ? previewData : null;
  const matches = !candidate || !draftSelection || Object.entries(draftSelection).every(([field, value]) => JSON.stringify(candidate.selection?.[field as keyof typeof candidate.selection]) === JSON.stringify(value));
  const input = !loadingPlans && !plansError && matches && candidate?.status === "READY" && candidate.profileRevision === revision && !candidate.reforecast && !candidate.selection?.whatIf ? candidate.selection : null;
  const key = JSON.stringify([user?.id, revision, input]), latest = useRef(key); latest.current = key;
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [key]);
  const [state, setState] = useState<{ key: string; data?: Impact; error?: string } | null>(null), [busy, setBusy] = useState(false);
  const current = state?.key === key ? state : null;
  const compare = async () => {
    if (!input || busy) return; const requestKey = key; setState(null); setBusy(true);
    try { const data = await authenticatedRequest<Impact>("/me/retirement/pension-impact", input, "POST"); if (latest.current === requestKey) setState(data.profileRevision === revision ? { key: requestKey, data } : { key: requestKey, error: t("Hồ sơ đã đổi. So sánh lại với bản tính mới.", "Profile changed. Compare again using the updated preview.") }); }
    catch (error) { if (latest.current === requestKey) setState({ key: requestKey, error: error instanceof Error ? error.message : t("Chưa so sánh được.", "Could not compare.") }); } finally { setBusy(false); }
  };
  return <><div className="insurance-impact-metric"><span>{t("Quỹ tự tích lũy giảm", "Reduction in self-funded capital")}</span><strong data-testid="insurance-reduction">{busy ? t("Đang so sánh…", "Comparing…") : current?.data?.status === "READY" ? financeMoney(current.data.fundReduction, en) : current?.data ? t("Chưa đủ thông tin", "Incomplete information") : t("Chưa so sánh", "Not compared")}</strong><small>{t("Đối chiếu cùng dữ liệu, thời gian và giả định; chỉ thay việc có hoặc không có lương hưu.", "Same data, dates and assumptions; only pension inclusion changes.")}</small>{input ? <button type="button" className="cashflow-text-button insurance-impact-trigger" disabled={busy} onClick={() => void compare()}>{t("So sánh cùng bản tính", "Compare using this preview")}</button> : <Link className="cashflow-text-button" to="/user/plan">{t("Chọn bản tính hồ sơ để so sánh", "Choose a profile preview to compare")}</Link>}{current?.error && <p role="alert">{current.error}</p>}{current?.data?.status === "INCOMPLETE" && <small>{t("Cần đủ mức hưởng, tháng nhận, giả định và dữ liệu bản tính. Chưa thay số thiếu bằng 0.", "Complete the pension, start month, assumptions and preview data. Missing values are not replaced with zero.")}</small>}{current?.data?.status === "READY" && <button type="button" className="cashflow-text-button insurance-impact-details-trigger" onClick={() => setOpen(true)}>{t("Xem phép đối chiếu", "Review comparison")}</button>}</div><ResponsiveDialog open={open && current?.data?.status === "READY"} title={t("Ảnh hưởng lương hưu tới quỹ", "Pension impact on required capital")} className="user-workspace-dialog insurance-impact-dialog" fallbackFocusSelector=".insurance-impact-details-trigger" onClose={() => setOpen(false)}>{current?.data?.status === "READY" && <><p>{t("Quỹ cần khi nghỉ hưu — có lương hưu:", "Required retirement capital — with pension:")} <b>{financeMoney(current.data.requiredFundWithPension, en)}</b></p><p>{t("Không có lương hưu:", "Without pension:")} <b>{financeMoney(current.data.requiredFundWithoutPension, en)}</b></p><small>{t("Tính đến", "Through")} {formatMonthVN(current.data.endMonth)}. {t("Bản xem trước từ hồ sơ, không thay snapshot hay đối soát giao dịch thực tế.", "Profile preview; saved snapshots and actual-transaction reconciliation are unchanged.")}</small><footer><button type="button" className="overview-button secondary" onClick={() => setOpen(false)}>{t("Đóng", "Close")}</button></footer></>}</ResponsiveDialog></>;
}
