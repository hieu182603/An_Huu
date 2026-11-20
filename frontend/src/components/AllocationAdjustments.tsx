import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { analyzeAdjustments, type SimulatedAdjustments } from "../services/planningAnalysis";
import type { RetirementPreviewInput } from "../services/retirement";
import { financeMoney } from "../utils/financeHubSummary";
import { Icon } from "./ui";

type Props = {
  /** The plan with the reference allocation (template and custom weights) that the selection simulated. */
  plan: RetirementPreviewInput;
  /** Same number of paths as the selection, so the adjustments are measured on the same scenarios. */
  paths: number;
  essentialThreshold?: string;
};

/**
 * Spec §7.4 step 4: when no allocation reaches the essential threshold, show the behavioural adjustments
 * (contribute more, retire later, cut optional spending) found on the same simulation. Never a higher return.
 */
export default function AllocationAdjustments({ plan, paths, essentialThreshold }: Props) {
  const en = useI18n().language === "en", t = (vi: string, eng: string) => en ? eng : vi;
  const money = (v: string | null | undefined) => financeMoney(v ?? null, en);
  const pct = (p: number | null | undefined) => p === null || p === undefined ? "—" : `${Math.round(p * 100)}%`;
  const month = (m: string | null | undefined) => m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "—";
  const [data, setData] = useState<SimulatedAdjustments | null>(null), [error, setError] = useState(""), [progress, setProgress] = useState<{ done: number; total: number } | null>(null), [attempt, setAttempt] = useState(0);
  const key = JSON.stringify({ plan, paths, essentialThreshold });
  useEffect(() => {
    const abort = new AbortController();
    setData(null); setError(""); setProgress(null);
    // The server keeps the progress when its time budget ends; resend the same request with continuation:true until it finishes.
    const partial = (v: SimulatedAdjustments) => v.status === "LIMIT_EXCEEDED" && !!v.issues?.includes("RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED");
    const load = async () => {
      let value = await analyzeAdjustments({ kind: "PREVIEW", preview: plan }, paths, abort.signal, undefined, essentialThreshold);
      let best = -1, stalled = 0;
      while (partial(value) && !abort.signal.aborted) {
        const done = value.progress?.pathsCompleted ?? 0;
        setProgress({ done, total: value.progress?.pathsRequested ?? paths });
        stalled = done > best ? 0 : stalled + 1; best = Math.max(best, done);
        if (stalled >= 5) break;
        value = await analyzeAdjustments({ kind: "PREVIEW", preview: plan }, paths, abort.signal, true, essentialThreshold);
      }
      return value;
    };
    load()
      .then(value => { if (!abort.signal.aborted) { setData(value); setProgress(null); } })
      .catch(e => {
        if (abort.signal.aborted) return;
        setProgress(null);
        const status = (e as { status?: number })?.status, code = (e as { code?: string })?.code;
        setError(status === 429 ? t("Bạn đã chạy mô phỏng 3 lần trong một phút. Đợi khoảng một phút rồi tìm lại.", "You ran 3 simulations within a minute. Wait about a minute, then retry.")
          : code === "NETWORK_ERROR" ? t("Máy chủ chưa phản hồi kịp. Đây là lỗi kỹ thuật, không phải kết luận về kế hoạch.", "The server did not answer in time. This is a technical error, not a verdict on your plan.")
          : e instanceof Error ? e.message : t("Chưa tìm được cách điều chỉnh.", "Could not find adjustments."));
      });
    return () => abort.abort();
  }, [key, attempt]);

  const threshold = `${Math.round(Number(data?.threshold ?? essentialThreshold ?? "0.9") * 100)}%`;
  const busyRun = data?.status === "LIMIT_EXCEEDED";
  const c = data?.contribution, r = data?.retirement, o = data?.optionalSpending, d = data?.deferFlexibleGoals;
  const unfinished = t("Chưa tìm xong trong thời gian cho phép; hãy thử lại.", "Not finished within the time limit; retry.");
  const contributionText = !c ? null : c.status === "FOUND"
    ? <>{t("Góp", "Contribute")} <strong>{money(c.requiredMonthlyContribution)}{t("/tháng", "/month")}</strong> ({t("thêm", "plus")} {money(c.additionalMonthlyContribution)}) → {t("đủ chi thiết yếu ở", "essentials covered in")} <strong>{pct(c.pEssential)}</strong> {t("kịch bản.", "of scenarios.")}
      {c.withinCapacityEveryMonth === false && <small> {t("Mức này vượt khả năng góp ở một số tháng; các tháng đó chỉ góp được tối đa khả năng.", "Above your capacity in some months; those months contribute only up to capacity.")}</small>}</>
    : c.issues.includes("CONTRIBUTION_CAPACITY_REACHED") ? t("Bạn đang góp hết khả năng hằng tháng, nên không thể góp thêm.", "You already contribute your full monthly capacity.")
    : c.issues.includes("THRESHOLD_NOT_REACHED_WITHIN_CAPACITY") ? t("Kể cả góp tối đa khả năng hằng tháng vẫn chưa đạt ngưỡng.", "Even contributing your full capacity does not reach the threshold.")
    : c.issues.includes("NO_ACCUMULATION_PERIOD") ? t("Không còn giai đoạn tích lũy để góp thêm.", "No accumulation period is left to contribute more.")
    : c.issues.includes("CONTRIBUTION_SCHEDULE_DECLARED") ? t("Kế hoạch có lịch góp riêng; hãy điều chỉnh lịch góp ở trang Kế hoạch.", "The plan has a contribution schedule; adjust it on the Plan page.")
    : unfinished;
  const retirementText = !r ? null : r.status === "FOUND"
    ? <>{t("Nghỉ hưu từ tháng", "Retire from")} <strong>{month(r.retirementMonth)}</strong> ({t(`muộn ${r.delayMonths} tháng`, `${r.delayMonths} months later`)}) → <strong>{pct(r.pEssential)}</strong> {t("kịch bản.", "of scenarios.")}</>
    : r.issues.includes("THRESHOLD_NOT_REACHED_WITHIN_DELAY_LIMIT") ? t("Lùi nghỉ hưu tới 10 năm vẫn chưa đạt ngưỡng.", "Retiring up to 10 years later still does not reach the threshold.")
    : r.issues.includes("PLAN_END_TOO_CLOSE") ? t("Thời gian còn lại của kế hoạch quá ngắn để lùi nghỉ hưu.", "The plan ends too soon to retire later.")
    : unfinished;
  const optionalText = !o ? null : o.status === "FOUND"
    ? <>{t("Giảm", "Cut")} <strong>{o.cutPercent}%</strong> {t("chi tiêu tùy chọn", "of optional spending")}{o.monthlyCutToday && <> ({t("khoảng", "about")} {money(o.monthlyCutToday)}{t("/tháng theo giá hôm nay", "/month in today's money")})</>} → <strong>{pct(o.pEssential)}</strong> {t("kịch bản.", "of scenarios.")}</>
    : o.issues.includes("NO_OPTIONAL_SPENDING_DECLARED") ? t("Bạn chưa khai khoản chi tùy chọn nào. An Hưu không đề xuất cắt chi tiêu thiết yếu.", "You declared no optional spending. An Hưu never proposes cutting essential spending.")
    : o.issues.includes("THRESHOLD_NOT_REACHED_WITHOUT_OPTIONAL_SPENDING") ? t("Bỏ toàn bộ chi tiêu tùy chọn vẫn chưa đạt ngưỡng.", "Removing all optional spending still does not reach the threshold.")
    : unfinished;
  const deferText = !d ? null : d.status === "FOUND"
    ? <>{t("Lùi mục tiêu linh hoạt", "Defer flexible goals")} <strong>{d.deferMonths} {t("tháng", "months")}</strong> → {t("đủ chi thiết yếu ở", "essentials covered in")} <strong>{pct(d.pEssential)}</strong> {t("kịch bản.", "of scenarios.")}</>
    : d.issues.includes("NO_DEFERRABLE_GOAL") ? t("Chưa có mục tiêu linh hoạt nào được đánh dấu có thể lùi.", "No flexible goal is marked as deferrable.")
    : d.issues.includes("THRESHOLD_NOT_REACHED_WITHIN_GOAL_DEFER_LIMIT") ? t("Lùi mục tiêu linh hoạt tối đa 5 năm vẫn chưa đạt ngưỡng.", "Deferring flexible goals by up to 5 years still does not reach the threshold.")
    : d.issues.includes("PLAN_END_TOO_CLOSE") ? t("Thời gian còn lại của kế hoạch quá ngắn để lùi mục tiêu.", "The plan ends too soon to defer goals.")
    : unfinished;

  return <section className="allocation-adjustments" aria-label={t("Cách điều chỉnh kế hoạch", "Plan adjustments")}>
    <header className="allocation-result-card-heading"><span className="allocation-result-icon" aria-hidden="true"><Icon name="info" /></span>
      <div><h2>{t("Cách điều chỉnh để đạt ngưỡng chi thiết yếu", "Adjustments that reach the essential threshold")}</h2>
        <p>{t(`Mỗi cách được thử riêng trên cùng ${paths} kịch bản mô phỏng và cùng danh mục tham khảo, tới khi tỷ lệ đủ chi thiết yếu đạt ${threshold}. An Hưu không nâng giả định lợi suất để kế hoạch trông khả thi.`,
          `Each change is tested alone on the same ${paths} simulated scenarios and reference allocation until essential coverage reaches ${threshold}. Return assumptions are never raised to make the plan look feasible.`)}</p></div></header>
    {!data && !error && <div className="allocation-evaluation-notice" role="status"><progress aria-label={t("Đang tìm cách điều chỉnh", "Finding adjustments")} {...(progress ? { max: progress.total, value: progress.done } : {})} /><p>{progress ? t(`Đã chạy ${progress.done}/${progress.total} kịch bản…`, `Ran ${progress.done}/${progress.total} scenarios…`) : t("Đang tìm mức điều chỉnh, có thể mất tới một phút…", "Finding adjustments; this can take up to a minute…")}</p></div>}
    {(error || busyRun) && <div className="allocation-evaluation-notice is-error" role="alert"><p>{error || t("Hệ thống đang bận với lượt mô phỏng khác. Hãy thử lại sau giây lát.", "The system is busy with another simulation. Retry in a moment.")}</p>
      <button type="button" className="overview-button secondary" onClick={() => setAttempt(n => n + 1)}>{t("Tìm lại", "Retry")}</button></div>}
    {data?.status === "NOT_NEEDED" && <p role="status">{t("Danh mục này đã đạt ngưỡng chi thiết yếu.", "This allocation already reaches the essential threshold.")}</p>}
    {data && !busyRun && data.status !== "NOT_NEEDED" && <ul className="allocation-adjustment-list">
      {contributionText && <li className={c?.status === "FOUND" ? "is-found" : ""}><strong>{t("Góp thêm", "Contribute more")}</strong><p>{contributionText}</p></li>}
      {retirementText && <li className={r?.status === "FOUND" ? "is-found" : ""}><strong>{t("Nghỉ hưu muộn hơn", "Retire later")}</strong><p>{retirementText}</p></li>}
      {optionalText && <li className={o?.status === "FOUND" ? "is-found" : ""}><strong>{t("Giảm chi tiêu tùy chọn", "Cut optional spending")}</strong><p>{optionalText}</p></li>}
      {deferText && <li className={d?.status === "FOUND" ? "is-found" : ""}><strong>{t("Lùi mục tiêu linh hoạt", "Defer flexible goals")}</strong><p>{deferText}</p></li>}
    </ul>}
    {data && !busyRun && data.status !== "NOT_NEEDED" && <p className="allocation-result-footnote">{t("Mỗi cách tính riêng lẻ; kết hợp nhiều cách cần kiểm tra lại. Mức góp tìm theo bậc 500.000 đ, tháng nghỉ hưu theo bậc 6 tháng, mức cắt chi tùy chọn theo bậc 5%, lùi mục tiêu linh hoạt theo bậc 6 tháng. Chỉ khoản góp bạn xác nhận mới được đầu tư; khoản lương có ngày kết thúc không tự kéo dài khi nghỉ hưu muộn hơn.",
      "Each change is computed alone; combining them needs a new check. Contributions are searched in 500,000 VND steps, retirement in 6-month steps, optional cuts in 5% steps, flexible goal deferrals in 6-month steps. Only confirmed deposits are invested; a salary with an end date is not extended when retiring later.")}</p>}
  </section>;
}
