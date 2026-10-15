import { useEffect, useRef, useState } from "react";
import { Button, Input } from "../ui";
import { previewMonthlyRetirement, type RetirementPreviewInput, type RetirementPreviewResult } from "../../services/retirement";
import { AnalysisStatus, PreviewInsights, displayNumber, useAnalysisText } from "./AnalysisResults";
import { RiskAnalysis } from "./RiskAnalysis";

/** Explicit, read-only restart from the current profile; never overwrites actuals. */
export function ProfileReviewPreview({ input, onClose }: { input: RetirementPreviewInput; onClose: () => void }) {
  const t = useAnalysisText();
  const [endMonth, setEndMonth] = useState(input.endMonth);
  const [result, setResult] = useState<RetirementPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    ++sequence.current; controller.current?.abort(); setEndMonth(input.endMonth);
    setResult(null); setBusy(false); setError("");
    return () => { ++sequence.current; controller.current?.abort(); };
  }, [inputKey]);
  const run = async () => {
    if (busy || !endMonth) return;
    const seq = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setResult(null); setError("");
    try {
      const data = await previewMonthlyRetirement({ ...input, endMonth }, abort.signal);
      if (seq === sequence.current) setResult(data);
    } catch (e) {
      if (seq === sequence.current) setError(e instanceof Error ? e.message : t("Chưa tính được kết quả.", "Could not calculate the preview."));
    } finally { if (seq === sequence.current) setBusy(false); }
  };
  return <section className="planning-analysis" data-testid="profile-review-preview">
    <h2>{t("Xem trước mới từ hồ sơ hiện tại", "Fresh preview from the current profile")}</h2>
    <p>{t("Bản xem trước này bắt đầu từ tài sản và dòng tiền trong hồ sơ hiện tại. Hãy đối chiếu hồ sơ trước khi tính: số dư thực tế và các điều chỉnh nguồn của kế hoạch cũ không được chuyển sang. Phí tư vấn và cấu hình đã chọn được giữ nguyên. Kết quả chỉ để xem xét, chưa lưu hay áp dụng.", "This preview starts from the assets and cash flows in your current profile. Reconcile the profile first: recorded balances and source adjustments from the old plan are not transferred. Advisory fees and selected configuration are retained. Results are for review, not saved or applied.")}</p>
    <Input label={t("Tính bản xem trước mới đến tháng", "Fresh preview end month")} type="month" value={endMonth} disabled={busy} onChange={v => { setEndMonth(v); setResult(null); setError(""); }} />
    {input.advisoryFee && <p>{t("Phí được giữ", "Retained fee")}: {input.advisoryFee.annualPercent}%/{t("năm", "year")} · {input.advisoryFee.paidFrom === "FUND" ? t("Trừ quỹ", "Fund") : t("Ngân sách hộ", "Household budget")}</p>}
    <div className="planning-actions"><Button disabled={busy || !endMonth} onClick={() => void run()}>{busy ? t("Đang tính…", "Calculating…") : t("Tính bản xem trước độc lập", "Calculate independent preview")}</Button><Button variant="secondary" onClick={onClose}>{t("Đóng bản xem trước độc lập", "Close independent preview")}</Button></div>
    {error && <p role="alert">{error}</p>}
    {result && <><AnalysisStatus status={result.status} issues={result.issues} />
      {result.status === "READY" && result.calculation && <p>{t("Quỹ dự kiến khi nghỉ hưu", "Projected retirement fund")}: {displayNumber(result.calculation.summary.atRetirement.projectedFund, t("vi", "en") === "en", " VND")}</p>}
      <PreviewInsights preview={result} />
      <RiskAnalysis plan={result.status === "READY" ? { kind: "PREVIEW", preview: { ...input, endMonth } } : null} />
    </>}
  </section>;
}
