import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { previewAllocation, type AllocationWorkspaceResult, type WorkspaceInput } from "../services/allocationWorkspace";
import { analyzeRisk, type RiskResult, type SimulationResult } from "../services/planningAnalysis";
import type { CustomAllocation } from "../services/portfolios";
import type { RetirementPreviewInput } from "../services/retirement";
import { adjustAllocation, initialAllocationWeights } from "../utils/allocationWeights";
import { portfolioAssetLabel } from "../utils/portfolioGlidePath";
import { financeMoney } from "../utils/financeHubSummary";
import ResponsiveDialog from "./ResponsiveDialog";
import AllocationPackages from "./AllocationPackages";
import AllocationScenarios from "./AllocationScenarios";
import AllocationAdjustments from "./AllocationAdjustments";
import { Icon, Select } from "./ui";
import "./allocation-experiment.css";

export type AllocationChoice = { templateId: string; customAllocation?: CustomAllocation; allocationFunding?: "PROTECTED_CAPITAL_V1" };
export type AllocationEvaluationState = { busy: boolean; error: string };
type Candidate = NonNullable<RiskResult["candidates"]>[number];
type Row = { assetClass: string; weightPercent: string };
type Props = {
  data: AllocationWorkspaceResult; input: WorkspaceInput; plan: RetirementPreviewInput | null;
  onChoose: (value: AllocationChoice) => void;
  onReferenceChange: (value: AllocationWorkspaceResult, result: RiskResult | null, state: AllocationEvaluationState) => void;
  thresholds?: { essential?: string; all?: string; range?: {min:string;max:string} };
  /** Rendered between the two cards and the custom comparison, where the demo explains the pick. */
  why?: ReactNode;
};

// One colour per asset class everywhere on the page, so the two rings and the comparison bars agree.
const palette: Record<string, string> = { CASH: "#4d8a9b", GOV_BOND: "#7476b5", BOND: "#7476b5", EQUITY: "#245dab", STOCK: "#245dab", GOLD: "#c29a39", SILVER: "#8c9bab", REAL_ESTATE: "#a56c51", PROPERTY: "#a56c51" };
const spare = ["#4d8a9b", "#7476b5", "#245dab", "#c29a39", "#8c9bab", "#a56c51"];
export const allocationColor = (code: string, index: number) => palette[code] ?? spare[index % spare.length];
export const allocationPurpose = (code: string, en: boolean) => {
  const text: Record<string, [string, string]> = {
    CASH: ["Linh hoạt cho các khoản cần dùng", "Liquidity for upcoming needs"],
    BOND: ["Tạo nền thu nhập ổn định", "A foundation for regular income"],
    GOV_BOND: ["Tạo nền thu nhập ổn định", "A foundation for regular income"],
    STOCK: ["Tăng trưởng trong dài hạn", "Long-term growth"],
    EQUITY: ["Tăng trưởng trong dài hạn", "Long-term growth"],
    GOLD: ["Đa dạng hóa danh mục", "Portfolio diversification"],
  };
  return (text[code] ?? ["Theo vai trò trong chính sách phân bổ", "As defined in the allocation policy"])[en ? 1 : 0];
};
const candidateName = (id: string, referenceId: string | null | undefined, qualified: boolean, en: boolean) => {
  const t = (vi: string, english: string) => en ? english : vi;
  if (id === referenceId) return qualified ? t("Phương án đề xuất", "Recommended allocation") : t("Danh mục tham khảo", "Reference allocation");
  return ({ CUSTOM: t("Tự chọn", "Custom"), BASE: t("Theo hồ sơ", "Profile allocation"), LOWER_EQUITY: t("Giảm cổ phiếu", "Lower equity"),
    HIGHER_EQUITY: t("Tăng cổ phiếu", "Higher equity"), CONTINUOUS: t("Phân bổ tối ưu", "Optimized allocation") } as Record<string, string>)[id] ?? t("Cách chia khác", "Alternative");
};
const FIRST_PATHS = 20, METHOD_PATHS = 1000, DEFAULT_MILESTONES = [20, 50, 100, 200, 500, 1000];
const meets = (candidate: SimulationResult | undefined, threshold: string | undefined | null) =>
  candidate?.pEssential != null && !!threshold && candidate.pEssential >= Number(threshold);

/** Every tested allocation side by side with the reason it was or was not picked. Mirrors the demo's "why" table. */
export function AllocationCandidates({ result, labels, en, rates }: { result: RiskResult; labels: Record<string, string>; en: boolean; rates: Record<string, number> }) {
  const t = (vi: string, english: string) => en ? english : vi;
  const money = (v: string | null | undefined) => financeMoney(v ?? null, en);
  const num = (v: number) => new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 1 }).format(v);
  const share = (v: number | null | undefined) => v == null ? "—" : `${num(v * 100)}%`;
  const all = (result.candidates ?? []).filter(c => c.id !== "CUSTOM"), ref = all.find(c => c.id === result.referenceId);
  if (!ref) return null;
  // Compounded annual return of the starting weights on the published monthly inputs: (1 + Σ weight × monthly rate)¹² − 1.
  const assumed = (c: Candidate) => { const rows = c.targets[0] ?? []; if (!rows.length || rows.some(r => Number(r.weightPercent) > 0 && rates[r.assetClass] === undefined)) return null;
    return (Math.pow(1 + rows.reduce((sum, r) => sum + Number(r.weightPercent) / 100 * (rates[r.assetClass] ?? 0), 0), 12) - 1) * 100; };
  const refQ = meets(ref, result.threshold), cvar = (c: Candidate) => Number(c.display?.cvarVnd ?? 0), loss = (c: Candidate) => Number(c.loss?.lossAmount ?? 0);
  const reason = (c: Candidate) => {
    if (refQ && !meets(c, result.threshold)) return t("Chưa đạt ngưỡng đủ chi", "Below the essential-spending threshold");
    if (refQ) return cvar(c) > cvar(ref) + 1 ? t("Thiếu hụt lớn hơn khi thị trường xấu", "Larger shortfall in bad markets") : t("Phải đổi nhiều hơn so với tài sản hiện có", "Needs a larger change from current holdings");
    if (loss(c) > loss(ref) + 1) return (c.pEssential ?? 0) > (ref.pEssential ?? 0) ? t("Đủ chi nhỉnh hơn nhưng rủi ro giảm giá lớn hơn", "Slightly better coverage but a larger stress loss") : t("Rủi ro giảm giá lớn hơn", "Larger stress loss");
    const own = assumed(c), base = assumed(ref);
    if (own !== null && base !== null && own < base - 0.005) return loss(c) < loss(ref) - 1 ? t("An toàn hơn nhưng lợi suất giả định thấp hơn", "Safer but with a lower assumed return") : t("Lợi suất giả định thấp hơn", "Lower assumed return");
    return t("Cân bằng lợi suất và rủi ro kém hơn", "A weaker balance of return and risk");
  };
  const differences = (c: Candidate) => {
    const parts: string[] = [], own = assumed(c), base = assumed(ref), dr = own !== null && base !== null ? own - base : 0, dl = loss(c) - loss(ref), dc = cvar(c) - cvar(ref), dp = ((c.pEssential ?? 0) - (ref.pEssential ?? 0)) * 100;
    if (Math.abs(dr) >= 0.005) parts.push(`${t("Lợi suất", "Return")} ${dr < 0 ? t("thấp hơn", "lower by") : t("cao hơn", "higher by")} ${new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 2 }).format(Math.abs(dr))} ${t("điểm %", "pts")}`);
    if (Math.abs(dl) > 1) parts.push(`${dl < 0 ? t("Giảm ít hơn", "Loses less:") : t("Giảm nhiều hơn", "Loses more:")} ${money(String(Math.round(Math.abs(dl))))} ${t("khi sốc", "under stress")}`);
    if (Math.abs(dc) > 1) parts.push(`${t("Thiếu hụt", "Shortfall")} ${dc < 0 ? t("nhỏ hơn", "smaller by") : t("lớn hơn", "larger by")} ${money(String(Math.round(Math.abs(dc))))}`);
    if (Math.abs(dp) >= 0.05) parts.push(`${t("Đủ chi thiết yếu", "Essential coverage")} ${dp < 0 ? t("thấp hơn", "lower by") : t("cao hơn", "higher by")} ${num(Math.abs(dp))} ${t("điểm %", "pts")}`);
    return parts;
  };
  const mix = (c: Candidate) => (c.targets[0] ?? []).filter(r => Number(r.weightPercent) > 0);
  const yearly = (c: Candidate) => { const value = assumed(c); return value === null ? "—" : `${new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 2 }).format(value)}%/${t("năm", "yr")}`; };
  const headers = [t("Cách chia vốn", "Allocation"), t("Giảm khi thị trường sốc", "Stress loss"), t("Đủ chi thiết yếu", "Essentials covered"), t("Đủ mọi mục tiêu", "All goals covered"), t("Thiếu hụt khi thị trường xấu", "Shortfall in bad markets"), t("Kết luận", "Verdict")];
  return <>
    <div className="allocation-comparison-scroll" tabIndex={0} role="region" aria-label={t("So sánh các cách chia vốn đã kiểm tra", "Comparison of tested allocations")}>
      <table className="allocation-why-table"><thead><tr><th scope="col">{headers[0]}</th><th scope="col">{t("Lợi suất giả định", "Assumed return")}</th>{headers.slice(1).map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>
        {[ref, ...all.filter(c => c !== ref)].map(c => <tr key={c.id} className={c === ref ? "is-current" : ""}>
          <th scope="row"><span className="allocation-why-name">{candidateName(c.id, result.referenceId, refQ, en)}</span>
            <span className="allocation-why-bar" role="img" aria-label={mix(c).map(r => `${portfolioAssetLabel(r.assetClass, en ? "en" : "vi", labels)} ${num(Number(r.weightPercent))}%`).join(", ")}>{mix(c).map((r, i) => <i key={r.assetClass} style={{ width: `${r.weightPercent}%`, background: allocationColor(r.assetClass, i) }} />)}</span>
            <small>{mix(c).map(r => `${portfolioAssetLabel(r.assetClass, en ? "en" : "vi", labels)} ${num(Number(r.weightPercent))}%`).join(" · ")}</small></th>
          <td data-label={t("Lợi suất giả định", "Assumed return")}>{yearly(c)}</td><td data-label={headers[1]}>{money(c.loss?.lossAmount)}</td><td data-label={headers[2]}>{share(c.pEssential)}</td><td data-label={headers[3]}>{share(c.pAll)}</td><td data-label={headers[4]}>{money(c.display?.cvarVnd)}</td>
          <td data-label={headers[5]}>{c === ref ? <span className={`allocation-why-pick${refQ ? "" : " is-reference"}`}>{refQ ? t("Đề xuất", "Recommended") : t("Tham khảo", "Reference")}</span>
            : <>{reason(c)}{differences(c).length > 0 && <ul>{differences(c).map(text => <li key={text}>{text}</li>)}</ul>}</>}</td>
        </tr>)}
        {(result.rejected ?? []).filter(r => r.id !== "CUSTOM").map(r => <tr key={r.id}><th scope="row"><span className="allocation-why-name">{candidateName(r.id, null, false, en)}</span></th>
          <td data-label={t("Lợi suất giả định", "Assumed return")}>—</td><td data-label={headers[1]}>—</td><td data-label={headers[2]}>—</td><td data-label={headers[3]}>—</td><td data-label={headers[4]}>—</td>
          <td data-label={headers[5]}>{r.issues.includes("LOSS_CONSTRAINT_EXCEEDED") ? t("Vượt giới hạn chịu lỗ", "Exceeds your loss limit") : r.issues.includes("WEIGHT_BOUND_EXCEEDED") ? t("Vượt giới hạn tỷ trọng của chính sách (ví dụ cổ phiếu tối đa 60%)", "Outside the policy weight bounds (e.g. equity at most 60%)") : t("Không đáp ứng ràng buộc của chính sách", "Fails the policy constraints")}</td></tr>)}
      </tbody></table>
    </div>
    <p className="allocation-result-footnote">{t("Lợi suất trước phí theo đầu vào đã công bố, quy đổi lãi kép; là giả định dùng cho phép tính.", "Returns are before fees on published inputs, compounded; they are calculation assumptions.")} {t(`Tỷ lệ đủ chi là tần suất trên ${ref.paths ?? "—"} kịch bản mô phỏng, không phải bảo đảm. Thiếu hụt khi thị trường xấu là mức thiếu chi thiết yếu trung bình ở nhóm kịch bản xấu nhất, quy về giá hôm nay.`, `Coverage is a frequency across ${ref.paths ?? "—"} simulated scenarios, not a guarantee. Shortfall in bad markets is the average essential shortfall in the worst scenarios, in today's money.`)}</p>
  </>;
}

/** Asks the allocation page to open its input editor at a step (0 capital, 1 loss limit, 2 review). */
export const ALLOCATION_EDIT_EVENT = "anhuu:allocation-edit";
export function requestAllocationEdit(step: number, focusId?: string) {
  window.dispatchEvent(new CustomEvent(ALLOCATION_EDIT_EVENT, { detail: { step, focusId } }));
}

export default function AllocationExperiment({ data, input, plan, onChoose, onReferenceChange, thresholds, why }: Props) {
  const en = useI18n().language === "en", t = (vi: string, eng: string) => en ? eng : vi;
  const label = (code: string) => portfolioAssetLabel(code, en ? "en" : "vi", data.assetLabels);
  const money = (v: string | null | undefined) => financeMoney(v ?? null, en);
  const num = (v: number, digits = 2) => new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: digits }).format(v);
  const policy = data.customization;
  const initialWeights = () => policy ? initialAllocationWeights(plan?.customAllocation?.weights ?? data.allocations, policy) : [];
  const [weights, setWeights] = useState(initialWeights);
  const [result, setResult] = useState<RiskResult | null>(null), [trial, setTrial] = useState<AllocationWorkspaceResult | null>(null), [reference, setReference] = useState(data);
  const [referenceResult, setReferenceResult] = useState<RiskResult | null>(null);
  const [chosenThreshold, setChosenThreshold] = useState<string>();
  const [trialError, setTrialError] = useState(""), [trialAttempt, setTrialAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [rate, setRate] = useState<AllocationWorkspaceResult | null>(null), [packages, setPackages] = useState<WorkspaceInput | null>(null);
  const [stressPlan, setStressPlan] = useState<RetirementPreviewInput | null>(null);
  // Paths asked of the server. 20 first (fast, preliminary); the customer raises it step by step to the 1,000 the method requires.
  const [paths, setPaths] = useState(FIRST_PATHS), [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [runningMilestone, setRunningMilestone] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(() => !window.matchMedia("(max-width: 800px)").matches || !!plan?.customAllocation);
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), autoRan = useRef("");
  const fingerprint = JSON.stringify({ input, plan, data: data.allocations, customization: policy });
  const weightsKey = JSON.stringify(weights);
  useEffect(() => onReferenceChange(reference, referenceResult, { busy, error }), [reference, referenceResult, busy, error, onReferenceChange]);
  // An aborted auto-run (StrictMode remount, fast navigation) must be allowed to run again, or the page stays on "Finding…".
  useEffect(() => () => { sequence.current++; controller.current?.abort(); autoRan.current = ""; }, [fingerprint]);
  useEffect(() => { setResult(null); setReferenceResult(null); setChosenThreshold(undefined); setTrial(null); setTrialError(""); setReference(data); setBusy(false); setError(""); setProgress(null); setRunningMilestone(null); setPaths(FIRST_PATHS); setWeights(initialWeights()); }, [fingerprint]);
  const custom: CustomAllocation = { model: "custom-glide-v1", weights };
  // Live check while dragging: the server answers with the loss stress, amounts and return for these exact weights.
  useEffect(() => {
    if (!policy || !weights.length) return;
    setTrial(null); setTrialError("");
    if (weightsKey === JSON.stringify(initialAllocationWeights(data.allocations, policy))) { setTrial(data); return; }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      previewAllocation({ ...input, customAllocation: custom }, abort.signal)
        .then(value => { if (!abort.signal.aborted) setTrial(value); })
        .catch(reason => { if (!abort.signal.aborted) setTrialError(reason instanceof Error ? reason.message : t("Không kiểm tra được tỷ trọng. Hãy thử lại.", "Could not check these weights. Please retry.")); });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [weightsKey, fingerprint, trialAttempt]);

  const threshold = referenceResult?.threshold ?? thresholds?.essential, allThreshold = referenceResult?.allThreshold ?? thresholds?.all;
  const range=thresholds?.range, thresholdChoices:number[]=[];
  if(range){const min=Number(range.min),max=Number(range.max);thresholdChoices.push(min);for(let value=min+0.05;value<max-1e-9;value+=0.05)thresholdChoices.push(value);if(max>min)thresholdChoices.push(max);}
  const thresholdOptions=thresholdChoices.map(value=>({value:value.toFixed(4),label:`${num(value*100)}%`}));
  if(threshold&&!thresholdChoices.some(value=>Math.abs(value-Number(threshold))<1e-9))thresholdOptions.unshift({value:Number(threshold).toFixed(4),label:`${num(Number(threshold)*100)}%`});
  if(!threshold)thresholdOptions.unshift({value:"",label:t("Theo chính sách", "Policy threshold")});
  const referenceCandidate = referenceResult?.candidates?.find(c => c.id === referenceResult.referenceId), customCandidate = result?.candidates?.find(c => c.id === "CUSTOM");
  const qualified = meets(referenceCandidate, threshold), tested = (referenceResult?.candidates ?? []).filter(c => c.id !== "CUSTOM").length + (referenceResult?.rejected ?? []).filter(r => r.id !== "CUSTOM").length;
  const eligible = (r: AllocationWorkspaceResult) => r.portfolio?.status === "READY" && r.loss.status === "WITHIN_LIMIT" && r.capital.status === "READY";
  const selectionPlan = plan && input.templateId ? { ...plan, templateId: input.templateId, customAllocation: undefined } : null;
  const lastRun = useRef<[kind: "reference" | "custom", pathsOverride?: number, thresholdOverride?: string]>(["reference"]);
  const run = async (kind: "reference" | "custom" = "custom", pathsOverride?: number, thresholdOverride?: string) => {
    if (!selectionPlan || busy) return;
    lastRun.current = [kind, pathsOverride, thresholdOverride];
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const ticket = ++sequence.current; setBusy(true); setError(""); if (thresholdOverride === undefined && !pathsOverride) setResult(null); setProgress(null); setRunningMilestone(pathsOverride ?? null);
    const startedAt = Date.now();
    const wanted = pathsOverride ?? paths; if (pathsOverride) setPaths(pathsOverride);
    try {
      const nextTrial = kind === "custom" && policy ? await previewAllocation({ ...input, customAllocation: custom }, abort.signal) : null;
      if (ticket !== sequence.current) return;
      if (nextTrial && !eligible(nextTrial)) { setTrial(nextTrial); setError(t("Tỷ trọng này chưa đáp ứng chính sách hoặc giới hạn chịu lỗ. Hãy điều chỉnh trước khi mô phỏng.", "These weights do not satisfy the policy or loss limit. Adjust them before simulation.")); return; }
      // The server stops a run after 10 s and keeps the paths already computed; sending the same request with
      // continuation:true resumes from them until READY/INSUFFICIENT (results equal a one-shot run).
      const request = (n: number, continuation = false) => analyzeRisk("selection", { kind: "PREVIEW", preview: selectionPlan }, n, undefined, abort.signal, kind === "custom" && policy ? custom : undefined, "ALLOCATION_V2", undefined, continuation, thresholdOverride ?? chosenThreshold);
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      // Heavy runs are limited per minute per account: retry once, after a pause, only when the server reports it
      // is busy with other runs. A 429 is shown as is (retrying would only spend the quota).
      const send = async (n: number, continuation = false) => {
        const res = await request(n, continuation);
        if (res.status !== "LIMIT_EXCEEDED" || !res.issues?.includes("CONCURRENT_RUN_LIMIT")) return res;
        await sleep(3000);
        if (abort.signal.aborted) return res;
        return request(n, continuation);
      };
      let response = await send(wanted);
      let best = -1, stalled = 0;
      while (response.status === "LIMIT_EXCEEDED" && response.issues?.includes("RUNTIME_LIMIT_PARTIAL_PROGRESS_SAVED")) {
        if (ticket !== sequence.current || abort.signal.aborted) return;
        const done = response.progress?.pathsCompleted ?? 0;
        setProgress({ done, total: response.progress?.pathsRequested ?? wanted });
        stalled = done > best ? 0 : stalled + 1; best = Math.max(best, done);
        if (stalled >= 5) break;
        response = await send(wanted, true);
      }
      if (ticket !== sequence.current) return;
      // Older servers drop the partial work: fall back once to fewer paths.
      if (response.status === "LIMIT_EXCEEDED" && response.issues?.includes("RUNTIME_LIMIT_NO_PARTIAL_ESTIMATE")) {
        const fewer = Math.max(2, Math.floor(wanted / 2)); setPaths(fewer); response = await send(fewer);
      }
      if (pathsOverride && (!response.candidates?.length || response.status === "LIMIT_EXCEEDED")) {
        setError(response.issues?.includes("CONCURRENT_RUN_LIMIT") || response.issues?.includes("ACCOUNT_RUN_IN_PROGRESS")
          ? t("Hệ thống đang xử lý nhiều lượt mô phỏng cùng lúc. Vui lòng thử lại sau giây lát.", "The system is processing concurrent simulations. Please retry in a moment.")
          : t("Không thể tăng số kịch bản lúc này. Vui lòng thử lại.", "Could not increase scenarios now. Please retry."));
        return;
      }
      const picked = response.candidates?.find(c => c.id === response.referenceId);
      const sameReference = picked?.selection?.templateId === data.portfolio?.assessment.selectedTemplateId && JSON.stringify(picked?.selection?.customAllocation ?? null) === JSON.stringify(data.customAllocation ?? null);
      const nextReference = picked?.selection && !sameReference ? await previewAllocation({ ...input, ...picked.selection }, abort.signal) : data;
      if (ticket !== sequence.current) return;
      if (nextTrial) setTrial(nextTrial);
      if (thresholdOverride !== undefined) setChosenThreshold(thresholdOverride);
      setResult(response); setReferenceResult(response); setReference(nextReference);
    } catch (e) {
      if (ticket !== sequence.current || abort.signal.aborted) return;
      const status = (e as { status?: number })?.status, code = (e as { code?: string })?.code;
      setError(status === 429 ? t("Bạn đã chạy mô phỏng 3 lần trong một phút. Vui lòng đợi khoảng một phút rồi bấm Thử tính lại.", "You ran 3 simulations within a minute. Wait about a minute, then retry.")
        : code === "NETWORK_ERROR" ? t("Máy chủ chưa phản hồi kịp hoặc mất kết nối. Đây là lỗi kỹ thuật, không phải kết luận về kế hoạch của bạn; hãy thử tính lại.", "The server did not answer in time or the connection dropped. This is a technical error, not a verdict on your plan; please retry.")
        : e instanceof Error ? e.message : t("Chưa tính được kết quả.", "Could not calculate the result."));
    }
    finally {
      // Keep a fast response visible long enough for the customer to see that a new run happened.
      if (pathsOverride && !abort.signal.aborted) await new Promise(resolve => setTimeout(resolve, Math.max(0, 600 - (Date.now() - startedAt))));
      if (ticket === sequence.current) { setBusy(false); setProgress(null); setRunningMilestone(null); }
    }
  };
  useEffect(() => { if (selectionPlan && autoRan.current !== fingerprint && weightsKey === JSON.stringify(initialWeights())) { autoRan.current = fingerprint; void run("reference"); } }, [fingerprint, weightsKey]);
  const invalidate = () => { sequence.current++; controller.current?.abort(); setBusy(false); setProgress(null); setRunningMilestone(null); setResult(null); setTrial(null); setTrialError(""); setTrialAttempt(n => n + 1); setError(""); };
  const change = (code: string, value: string) => { if (!policy) return; invalidate(); setWeights(prev => adjustAllocation(prev, policy, code, value)); };
  const reset = () => { if (!policy) return; invalidate(); setWeights(initialAllocationWeights(reference.allocations, policy)); };
  const choose = (candidate: Candidate | undefined, workspace: AllocationWorkspaceResult) => {
    if (!candidate?.selection || !eligible(workspace) || !selectionPlan) return;
    onChoose({ ...candidate.selection, ...(selectionPlan.allocationFunding ? { allocationFunding: selectionPlan.allocationFunding } : {}) });
  };
  const sameSelection = (a: Candidate["selection"], b: RetirementPreviewInput | null) => !!a && !!b && a.templateId === b.templateId && JSON.stringify(a.customAllocation?.weights ?? null) === JSON.stringify(b.customAllocation?.weights ?? null);
  const usingReference = sameSelection(referenceCandidate?.selection, plan);

  const shownPaths = referenceCandidate?.paths ?? 0;
  const preliminary = shownPaths > 0 && (referenceResult?.preliminary ?? shownPaths < METHOD_PATHS);
  const nextMilestones = (referenceResult?.pathMilestones ?? DEFAULT_MILESTONES).filter(m => m > shownPaths && m <= METHOD_PATHS);
  const pathsControl = result?.status !== "DATA_REQUIRED" && (shownPaths > 0 || (busy && progress)) && <div className="allocation-paths">
    {shownPaths > 0 && <p className="allocation-paths-head"><strong>{t(`Đang dùng ${num(shownPaths, 0)} kịch bản`, `Using ${num(shownPaths, 0)} scenarios`)}</strong>
      <span className={preliminary ? "is-preliminary" : "is-standard"}>{preliminary ? t("Sơ bộ · chuẩn ≥ 1.000", "Preliminary · standard ≥ 1,000") : t("Đạt chuẩn", "Meets standard")}</span></p>}
    {busy && progress && <div role="status"><progress max={progress.total} value={progress.done} aria-label={t("Tiến độ chạy kịch bản", "Scenario run progress")} /><small>{t(`Đã chạy ${num(progress.done, 0)}/${num(progress.total, 0)} kịch bản`, `Ran ${num(progress.done, 0)}/${num(progress.total, 0)} scenarios`)}</small></div>}
    {referenceCandidate?.thresholdUndecided && <small className="allocation-paths-undecided" role="status">{t(`Khoảng tin cậy còn vắt qua ngưỡng ${num(Number(threshold) * 100)}%; tăng số kịch bản để kết luận chắc hơn.`, `The confidence interval still straddles the ${num(Number(threshold) * 100)}% threshold; increase the number of scenarios for a firmer conclusion.`)}</small>}
    {nextMilestones.length > 0 && <div className="allocation-paths-actions" title={t("Các kịch bản đã chạy được giữ lại, chỉ chạy phần mới.", "Scenarios already run are kept; only the new ones are computed.")}>
      <span>{t("Chạy thêm đến", "Run up to")}</span>
      {nextMilestones.map(m => <button key={m} type="button" aria-label={t(`Tăng lên ${num(m, 0)} kịch bản`, `Raise to ${num(m, 0)} scenarios`)} disabled={busy || !selectionPlan} onClick={() => void run("reference", m)}>{num(m, 0)}</button>)}
    </div>}
  </div>;
  const share = (v: number | null | undefined) => v == null ? t("Chưa xác định", "Unavailable") : `${num(v * 100, 1)}%`;
  const meter = (name: string, value: number | null | undefined, target: string | undefined | null, wilson?: { lower: number; upper: number } | null, paths?: number | null) => <div className="allocation-success" key={name}>
    <div><span>{name}</span><strong className={value == null ? "is-unknown" : undefined}>{share(value)}</strong></div>
    {value != null && <div className="allocation-success-track" role="img" aria-label={`${name}: ${share(value)}${target ? `; ${t("ngưỡng", "threshold")} ${num(Number(target) * 100)}%` : ""}`}><span style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />{target && <i style={{ left: `${Number(target) * 100}%` }} />}</div>}
    <small>
      {target ? t(`Ngưỡng mục tiêu ${num(Number(target) * 100)}%`, `Target threshold ${num(Number(target) * 100)}%`) : t("Chưa công bố ngưỡng đánh giá", "No published threshold")}
      {wilson ? ` · CI 95%: ${wilson.lower}–${wilson.upper}% (${paths ?? "—"} ${t("kịch bản", "scenarios")})` : paths ? ` · ${paths} ${t("kịch bản", "scenarios")}` : ""}
    </small>
  </div>;
  const metrics = (candidate: SimulationResult | undefined) => <div className="allocation-success-grid">
    {meter(t("Đủ chi thiết yếu", "Essential spending covered"), candidate?.pEssential, threshold, candidate?.display ? { lower: candidate.display.wilsonLowerPercent, upper: candidate.display.wilsonUpperPercent } : null, candidate?.paths)}
    {meter(t("Đủ mọi mục tiêu", "All goals covered"), candidate?.pAll, allThreshold, null, candidate?.paths)}
  </div>;
  const ring = (rows: Row[], small = false) => { let offset = 0; return <svg className={`allocation-result-ring${small ? " is-small" : ""}`} viewBox="0 0 200 200" role="img" aria-label={t("Cơ cấu phần vốn dài hạn, tổng 100 phần trăm", "Long-term capital allocation, 100 percent in total")}>
    <circle cx="100" cy="100" r="78" fill="none" stroke="#e9eff5" strokeWidth="20" />
    {rows.map((r, i) => { const start = offset; offset += Number(r.weightPercent); return Number(r.weightPercent) > 0 ? <circle key={r.assetClass} cx="100" cy="100" r="78" fill="none" stroke={allocationColor(r.assetClass, i)} strokeWidth="20" pathLength="100" strokeDasharray={`${r.weightPercent} ${100 - Number(r.weightPercent)}`} strokeDashoffset={-start} transform="rotate(-90 100 100)" /> : null; })}
    <text className="allocation-ring-total" x="100" y="99" textAnchor="middle">100%</text><text className="allocation-ring-label" x="100" y="122" textAnchor="middle">{t("Vốn dài hạn", "Long-term capital")}</text></svg>; };
  const annual = (workspace: AllocationWorkspaceResult | null) => workspace?.returnBreakdown?.pathAnnualPercent;
  const rateButton = (workspace: AllocationWorkspaceResult | null, compact = false) => <button type="button" className={`allocation-reference-rate allocation-rate-button${compact ? " is-compact" : ""}`} onClick={() => setRate(workspace)} disabled={!workspace?.returnBreakdown}>
    <strong>{annual(workspace) ? num(Number(annual(workspace))) : "—"}{annual(workspace) && <small>%/{t("năm", "yr")}</small>}</strong>
    <span>{t("Lợi suất đường cơ sở · trước phí tư vấn ⓘ", "Base-path return · before advisory fees ⓘ")}<br />{t("Giả định dùng cho phép tính, không cam kết", "A calculation assumption, not a commitment")}</span></button>;
  const growth = data.capital.growthCapital === null ? null : Number(data.capital.growthCapital);
  const lossText = (loss: AllocationWorkspaceResult["loss"]) => `${t("Tình huống thị trường sốc", "Market stress")}: ${money(loss.lossAmount)} / ${t("giới hạn", "limit")} ${money(loss.allowedLossAmount)}.`;
  const trialValid = !!trial && eligible(trial);
  const trialProblem = !trial ? "" : trial.capital.status !== "READY" ? t("Cần xác nhận phần vốn dài hạn trước khi thử tỷ trọng.", "Confirm long-term capital before testing weights.")
    : trial.portfolio?.status !== "READY" ? t("Tỷ trọng chưa đáp ứng giới hạn của chính sách danh mục.", "These weights fall outside the portfolio policy limits.")
    : trial.loss.status !== "WITHIN_LIMIT" ? `${t("Vượt giới hạn tổn thất đã khai", "Exceeds your declared loss limit")}. ${lossText(trial.loss)}${trial.loss.maxEquityWeightPercent ? ` ${t(`Giảm cổ phiếu xuống tối đa ${num(Number(trial.loss.maxEquityWeightPercent), 1)}% để đạt.`, `Lower equity to at most ${num(Number(trial.loss.maxEquityWeightPercent), 1)}% to pass.`)}` : ""}` : "";
  const dataMissing = result?.status === "DATA_REQUIRED";
  // What the reference card shows: a candidate the plan cannot replay (loss-reduced, over-limit, or unsimulated)
  // is displayed from its own first-month weights, never from the template it was derived from.
  const pinned = result?.deterministic, pinnedPick = pinned?.candidates.find(c => c.id === pinned.referenceId);
  const kind = referenceResult?.referenceKind ?? pinned?.referenceKind ?? null, feasibility = referenceResult?.lossFeasibility ?? pinned?.lossFeasibility ?? null;
  const overLimit = kind === "LEAST_LOSS_OVER_LIMIT", reducedKind = kind === "LOSS_REDUCED_WITHIN_LIMIT";
  const displayCandidate = referenceCandidate ?? pinnedPick;
  const ownTargets = displayCandidate && (pinnedPick === displayCandidate || !referenceCandidate?.selection) ? displayCandidate.targets[0] : null;
  const longTerm = data.capital.growthCapital;
  const shownRows = ownTargets ? ownTargets.map(r => ({ ...r, amountVnd: longTerm && !longTerm.startsWith("-") ? String(Math.round(Number(longTerm) * Number(r.weightPercent) / 100)) : null })) as typeof reference.allocations : reference.allocations;
  // Stress scenarios use pinned assumptions, so the unmodified template can be tested before market data is published.
  const stressSelection = referenceCandidate?.selection ?? (dataMissing && pinnedPick?.id === "BASE" ? {} : null);
  const withinLimit = overLimit ? false : displayCandidate ? true : eligible(reference);
  const openLossEditor = () => requestAllocationEdit(1);
  const openGoalsEditor = () => requestAllocationEdit(0, "allocation-goals-question");
  const kindNote = overLimit && feasibility ? <div className="allocation-result-callout is-over" role="status"><Icon name="info" /><p>{t(
      `Kể cả khi chuyển hết cổ phiếu sang tiền gửi, mức giảm khi thị trường sốc vẫn khoảng ${money(feasibility.minimumLossAmount)}, vượt giới hạn ${money(feasibility.allowedLossAmount)} bạn đã khai. Danh mục này chỉ để tham khảo. Để có phương án trong giới hạn, cần chấp nhận giảm tối thiểu ${feasibility.requiredTolerancePercentOfGrowth.replace(".", ",")}% vốn dài hạn (≈ ${money(feasibility.requiredToleranceAmountVnd)}).`,
      `Even with all equity moved to deposits, the stress loss is about ${money(feasibility.minimumLossAmount)}, above your ${money(feasibility.allowedLossAmount)} limit. This allocation is for reference only. To get an allocation within the limit, accept at least ${feasibility.requiredTolerancePercentOfGrowth}% of long-term capital (≈ ${money(feasibility.requiredToleranceAmountVnd)}).`)}</p>
      <button type="button" className="remaining-text" onClick={openLossEditor}>{t("Sửa mức chịu giảm →", "Edit loss limit →")}</button></div>
    : reducedKind && displayCandidate ? <div className="allocation-result-callout is-valid" role="status"><Icon name="check" /><p>{t(
      `Danh mục mẫu vượt giới hạn chịu lỗ của bạn, nên đã chuyển ${num(Number(displayCandidate.changePoints))} điểm % cổ phiếu sang tiền gửi để mức giảm khi sốc nằm trong giới hạn.`,
      `The template exceeded your loss limit, so ${num(Number(displayCandidate.changePoints))} points of equity were moved to deposits to keep the stress loss within it.`)}</p></div>
    : null;
  const isProtectedShortfall = result?.issues?.includes("PROTECTED_CAPITAL_EXCEEDS_ASSETS");
  const isGoalsRequired = result?.issues?.includes("GOALS_REQUIRED");
  const isLossLimitRequired = !isGoalsRequired && !!result?.issues?.some(code => code === "LOSS_TOLERANCE_REQUIRED");
  const isLiquidityUnknown = !isGoalsRequired && !isLossLimitRequired && result?.status === "REVIEW_REQUIRED"
    && !!result?.issues?.some(code => code === "LIQUIDITY_NEED_UNKNOWN" || code === "LIQUIDITY_REQUIREMENTS_INCOMPLETE");
  const isProfileReview = !isGoalsRequired && !isLossLimitRequired && !isLiquidityUnknown && result?.status === "REVIEW_REQUIRED"
    && !!result.issues?.some(code => ["UNKNOWN_VALUE", "CAPITAL_SEPARATION_REQUIRED"].includes(code) || code.startsWith("GOAL_") || code.startsWith("DEPOSIT_"));
  const statusText = dataMissing ? "" : result?.status === "DATA_REQUIRED"
    ? t("Chưa có bộ dữ liệu thị trường tháng đã công bố để mô phỏng. Các xác suất được để chưa xác định.", "Published monthly market data is required. Probabilities remain unavailable.")
    : result?.status === "LIMIT_EXCEEDED"
      ? (result.issues?.includes("CONCURRENT_RUN_LIMIT")
        ? t("Hệ thống đang xử lý nhiều lượt mô phỏng cùng lúc. Vui lòng thử lại sau giây lát.", "The system is processing concurrent simulations. Please retry in a moment.")
        : t("Phép thử vượt giới hạn xử lý. Chưa có ước lượng hoàn chỉnh; hãy thử lại sau.", "The run exceeded processing limits. No complete estimate is available; retry later."))
      : (isProtectedShortfall || isGoalsRequired || isLossLimitRequired || isProfileReview || isLiquidityUnknown)
        ? ""
        : result && !result.candidates?.length && result.status === "REVIEW_REQUIRED"
          ? t("Cần hoàn thiện dòng tiền và chính sách mô phỏng trước khi đánh giá khả năng đủ tiền.", "Complete cash flows and simulation policy before estimating funding success.")
          : "";
  const customPasses = meets(customCandidate, threshold) && (!allThreshold || (customCandidate?.pAll ?? 0) >= Number(allThreshold));

  return <section className="allocation-experiment" aria-label={t("Thử và đối chiếu phân bổ", "Test and compare allocations")}>
    <ResponsiveDialog open={runningMilestone !== null && busy} title={t("Đang chạy thêm kịch bản", "Running more scenarios")} onClose={() => setRunningMilestone(null)} className="user-workspace-dialog allocation-progress-dialog">
      <p>{t(`Đang kiểm tra phương án với tối đa ${num(runningMilestone ?? 0, 0)} kịch bản. Kết quả cũ vẫn được giữ cho đến khi lượt chạy hoàn tất.`, `Testing the allocation with up to ${num(runningMilestone ?? 0, 0)} scenarios. The previous result remains available until this run finishes.`)}</p>
      <progress max={progress?.total} value={progress?.done} aria-label={t("Tiến độ mô phỏng", "Simulation progress")} />
      <p role="status">{progress ? t(`Đã xử lý ${num(progress.done, 0)}/${num(progress.total, 0)} lượt mô phỏng qua các phương án.`, `Processed ${num(progress.done, 0)}/${num(progress.total, 0)} simulation runs across allocations.`) : t("Máy chủ đang tính toán. Tiến độ sẽ cập nhật khi có kết quả từng phần.", "The server is calculating. Progress will update when partial results arrive.")}</p>
      <small>{t("Bạn có thể đóng cửa sổ này; phép tính vẫn tiếp tục.", "You can close this window; the calculation will continue.")}</small>
    </ResponsiveDialog>
    {range&&<Select label={t("Ngưỡng đủ chi thiết yếu", "Essential-spending threshold")} options={thresholdOptions} disabled={busy||!selectionPlan} value={threshold?Number(threshold).toFixed(4):""} onChange={value=>void run("reference",undefined,value)}/>}
    {busy && <div className="allocation-evaluation-notice" role="status"><progress aria-label={t("Đang kiểm tra các phương án", "Testing allocations")} /><div><strong>{t("Đang kiểm tra các phương án…", "Testing allocations…")}</strong><p>{t("Đối chiếu vốn, giới hạn chịu lỗ và các kịch bản thị trường.", "Comparing capital, loss limits and market scenarios.")}</p></div></div>}
    {error && <div className="allocation-evaluation-notice is-error" role="alert"><div><strong>{t("Chưa tính được phương án", "Could not calculate the allocation")}</strong><p>{error}</p></div><button type="button" className="overview-button secondary" disabled={busy || !selectionPlan} onClick={() => void run(...lastRun.current)}>{t("Thử tính lại", "Retry calculation")}</button></div>}
    {!selectionPlan && <div className="allocation-evaluation-notice" role="status"><div><strong>{t("Cần bổ sung thông tin kế hoạch", "Complete your plan inputs")}</strong><p>{t("Xác nhận chi tiêu và thời gian nghỉ hưu để tính phương án theo dòng tiền của bạn.", "Confirm retirement spending and dates to calculate an allocation using your cash flows.")}</p></div><Link className="overview-button secondary" to="/user/plan?tab=adjust">{t("Bổ sung thông tin", "Complete inputs")}</Link></div>}
    {isProtectedShortfall && (
      <div className="allocation-evaluation-notice is-error" role="status">
        <div>
          <strong>{t("Chưa đủ tiền giữ quỹ dự phòng và khoản cần dùng sớm", "Insufficient capital for emergency reserve and near-term goals")}</strong>
          <p>{t(
            `Bạn còn thiếu ${money(result?.shortfallAmount || (data.capital.growthCapital ? data.capital.growthCapital.replace("-", "") : "0"))} để đủ quỹ dự phòng và khoản cần dùng sớm. An Hưu chưa đề xuất phân bổ vốn dài hạn; hãy ưu tiên hoàn thiện quỹ dự phòng.`,
            `You need ${money(result?.shortfallAmount || (data.capital.growthCapital ? data.capital.growthCapital.replace("-", "") : "0"))} more to cover your emergency reserve and near-term goals. Long-term allocation is deferred; prioritize funding your reserve.`
          )}</p>
          <div className="allocation-shortfall-guidance" style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            <p><strong>{t("Các hướng điều chỉnh có thể thử:", "Possible adjustments to try:")}</strong></p>
            <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0 }}>
              <li>{t("Giảm số tháng dự phòng cần giữ (nếu công việc ổn định)", "Reduce reserve months (if income is stable)")}</li>
              <li>{t("Bổ sung thêm tài sản thanh khoản khả dụng", "Add more available liquid assets")}</li>
              <li>{t("Xem lại hoặc dời lịch các mục tiêu chi tiêu gần hạn", "Review or reschedule near-term spending goals")}</li>
            </ul>
          </div>
        </div>
        <button type="button" className="overview-button secondary" onClick={openGoalsEditor}>{t("Điều chỉnh dự phòng & mục tiêu →", "Adjust reserve & goals →")}</button>
      </div>
    )}
    {isGoalsRequired && (
      <div className="allocation-evaluation-notice is-error" role="status">
        <div>
          <strong>{t("Cần trả lời câu hỏi khoản lớn sắp tới", "Near-term goals question required")}</strong>
          <p>{t("Hệ thống cần biết bạn có dự định chi khoản lớn nào trong 5 năm tới hay không để tính phần tiền giữ riêng trước khi phân bổ.", "We need to know if you plan any major expenses in the next 5 years to separate protected funds before allocating.")}</p>
        </div>
        <button type="button" className="overview-button primary" onClick={openGoalsEditor}>{t("Trả lời câu hỏi mục tiêu →", "Answer goals question →")}</button>
      </div>
    )}
    {isLossLimitRequired && (
      <div className="allocation-evaluation-notice" role="status">
        <div>
          <strong>{t("Cần khai mức chịu giảm", "Loss limit required")}</strong>
          <p>{t("Hệ thống cần biết bạn chấp nhận giảm tối đa bao nhiêu để loại các cách chia vượt giới hạn trước khi mô phỏng.", "We need your maximum acceptable loss to exclude allocations above it before simulating.")}</p>
        </div>
        <button type="button" className="overview-button primary" onClick={openLossEditor}>{t("Khai mức chịu giảm →", "Set loss limit →")}</button>
      </div>
    )}
    {isProfileReview && (
      <div className="allocation-evaluation-notice" role="status">
        <div>
          <strong>{t("Cần bổ sung thông tin hồ sơ", "Profile details required")}</strong>
          <p>{t("Một số giá trị tài sản hoặc mục tiêu chưa rõ nên chưa tách được phần vốn giữ riêng. Hãy bổ sung rồi tính lại.", "Some asset or goal values are unknown, so protected capital cannot be separated yet. Complete them and recalculate.")}</p>
        </div>
        <Link className="overview-button secondary" to="/user/profile?section=assets">{t("Mở hồ sơ tài chính →", "Open financial profile →")}</Link>
      </div>
    )}
    {isLiquidityUnknown && (
      <div className="allocation-evaluation-notice" role="status">
        <div>
          <strong>{t("Cần khai nhu cầu tiền trong 1, 3 hoặc 5 năm tới", "Near-term cash needs required")}</strong>
          <p>{t("Bạn đang để nhu cầu tiền trong 1, 3 hoặc 5 năm tới là 'Chưa biết'. Hãy khai số tiền (có thể là 0) để tính khả năng đủ tiền.", "Your cash needs for the next 1, 3 or 5 years are set to 'Unknown'. Please declare an amount (which can be 0) to evaluate funding feasibility.")}</p>
        </div>
        <Link className="overview-button secondary" to="/user/profile?section=constraints">{t("Khai nhu cầu tiền →", "Declare cash needs →")}</Link>
      </div>
    )}
    {statusText && <div className="allocation-evaluation-notice" role="status"><p>{statusText}</p></div>}
    <div className="allocation-lab-real">
      <article className="allocation-reference">
        <header className="allocation-result-card-heading"><span className="allocation-result-icon" aria-hidden="true"><Icon name="shield" /></span><div>
          <span className="allocation-card-meta"><span className={`allocation-loss-badge${withinLimit ? " is-valid" : overLimit ? " is-over" : ""}`}>{withinLimit ? t("Trong giới hạn chịu lỗ", "Within loss limit") : overLimit ? t("Vượt giới hạn chịu lỗ", "Above loss limit") : t("Cần rà soát", "Review needed")}</span></span>
          <h2>{overLimit ? t("Danh mục tham khảo, vượt giới hạn", "Reference allocation, above limit") : reducedKind ? t("Danh mục đã giảm rủi ro", "Risk-reduced allocation") : !referenceCandidate ? t("Phương án theo hồ sơ", "Profile allocation") : qualified ? t("Phương án đề xuất", "Recommended allocation") : t("Danh mục tham khảo", "Reference allocation")}</h2></div></header>
        {rateButton(reference)}
        {kindNote}
        {shownRows.length > 0 && <div className="allocation-breakdown">{ring(shownRows)}<dl>{shownRows.filter(r => Number(r.weightPercent) > 0).map((row, i) => <div key={row.assetClass}><dt><i style={{ background: allocationColor(row.assetClass, i) }} /><span>{label(row.assetClass)}<small>{allocationPurpose(row.assetClass, en)}</small></span></dt><dd><strong>{num(Number(row.weightPercent))}%</strong><span>{money(row.amountVnd)}</span></dd></div>)}</dl></div>}
        {referenceCandidate && !overLimit && <div className={`allocation-result-callout${qualified ? " is-valid" : ""}`}><Icon name={qualified ? "check" : "info"} /><p>{qualified ? t(`Tốt nhất trong ${tested} cách chia vốn đã kiểm tra theo tiêu chí của bạn.`, `Best of ${tested} tested allocations under your criteria.`) : t("Ít thiếu hụt nhất trong giới hạn chịu lỗ, nhưng chưa đủ chi thiết yếu.", "Smallest shortfall within your loss limit, but essential spending is not yet covered.")}</p><a href="#allocation-result-why">{t("Xem vì sao ↓", "See why ↓")}</a></div>}
        {dataMissing ? <div className="allocation-data-missing" role="status"><strong>{t("Chưa thể mô phỏng", "Simulation unavailable")}</strong><p>{t("Hệ thống chưa có bộ dữ liệu thị trường tháng đã công bố, nên chưa tính được tỷ lệ đủ chi thiết yếu và đủ mọi mục tiêu. Tỷ trọng ở trên là phương án theo chính sách, chưa được kiểm tra bằng mô phỏng.", "No published monthly market dataset is available, so the share of scenarios covering essentials and goals cannot be calculated. The weights above follow the published policy and have not been simulated.")}</p></div> : metrics(referenceCandidate)}
        {!dataMissing && <p className="allocation-result-footnote">{referenceCandidate?.paths ? t(`Tần suất trên ${referenceCandidate.paths} đường mô phỏng lịch sử; không phải bảo đảm kết quả.`, `Frequency across ${referenceCandidate.paths} historical simulation paths; not a guarantee.`) : busy ? t("Đang kiểm tra các phương án…", "Testing allocations…") : t("Chưa có kết quả mô phỏng cho phương án này.", "No simulation result for this allocation yet.")}
          {referenceCandidate?.display && <> {t("Khoảng tin cậy 95% của tỷ lệ đủ chi thiết yếu:", "95% interval for essential coverage:")} {referenceCandidate.display.wilsonLowerPercent}–{referenceCandidate.display.wilsonUpperPercent}%.</>}</p>}
        {pathsControl}
        <div className="allocation-reference-actions">
          <button className="overview-button primary" disabled={busy || !referenceCandidate?.selection || !eligible(reference)} onClick={() => choose(referenceCandidate, reference)}>{usingReference ? (qualified ? t("Đang dùng phương án này trong bản xem trước", "Currently used in the plan preview") : t("Đang xem thử với danh mục tham khảo", "Currently previewing the reference allocation")) : qualified || !referenceCandidate ? t("Dùng phương án này để xem trước", "Use this allocation in the preview") : t("Xem thử kế hoạch với danh mục này", "Preview the plan with this allocation")} <span aria-hidden="true">→</span></button>
          <button className="overview-button secondary" onClick={() => setPackages({ ...input, ...(referenceCandidate?.selection ?? {}) })} disabled={!eligible(reference) || overLimit}>{t("Gợi ý gói đầu tư phù hợp", "Explore investment packages")}</button>
          <button className="remaining-text" disabled={busy || !selectionPlan || !stressSelection} onClick={() => selectionPlan && stressSelection && setStressPlan({ ...selectionPlan, ...stressSelection })}>{t("Thử các biến cố với phương án này", "Stress-test this allocation")}</button>
        </div>
      </article>

      <details className="allocation-alternatives allocation-custom" open={customOpen} onToggle={event => setCustomOpen(event.currentTarget.open)}>
        <summary><span className="allocation-result-icon" aria-hidden="true"><Icon name="chart" /></span><span><strong>{t("Tự điều chỉnh tỷ trọng", "Adjust the weights yourself")}</strong><small>{t("Kéo thanh % để thử một cách chia tiền khác và so sánh với phương án đề xuất.", "Drag the sliders to try another split and compare it with the recommended allocation.")}</small></span><span className="allocation-result-toggle" aria-hidden="true">+</span></summary>
        <div className="allocation-alternatives-body">
          {!policy ? <p role="status">{t("Chính sách hiện tại chưa công bố giới hạn cho tỷ trọng tự chọn.", "The current policy has no published custom-allocation bounds.")}</p> : <>
            <div className="allocation-custom-top"><span>{t("Tổng tỷ trọng", "Total weight")} <strong>100%</strong></span><button type="button" className="remaining-text" disabled={busy} onClick={reset}>{t("Về tỷ trọng đề xuất ↺", "Back to recommended ↺")}</button></div>
            <div className="allocation-weight-bar" role="img" aria-label={t("Cơ cấu phần vốn dài hạn, tổng 100 phần trăm", "Long-term capital allocation, 100 percent in total")}>{weights.map((r, i) => Number(r.weightPercent) > 0 ? <span key={r.assetClass} style={{ flexGrow: Number(r.weightPercent), background: allocationColor(r.assetClass, i) }} /> : null)}</div>
            {plan?.customAllocation && <p>{t("Đã nạp tỷ trọng từ lựa chọn hiện có. Kiểm tra lại trước khi dùng kết quả mới.", "Weights loaded from your existing selection. Test again before using new results.")}</p>}
            {weights.map((row, i) => { const bound = policy.bounds.find(b => b.assetClass === row.assetClass)!, locked = busy || bound.minPercent === bound.maxPercent; return <div className="allocation-slider-row" key={row.assetClass} style={{ "--allocation-asset": allocationColor(row.assetClass, i) } as CSSProperties}>
              <div className="allocation-slider-heading"><label htmlFor={`allocation-${row.assetClass}`}><i />{label(row.assetClass)}</label><span className="allocation-percent-input"><input type="number" inputMode="decimal" disabled={locked} min={bound.minPercent} max={bound.maxPercent} step="0.1" aria-label={`${label(row.assetClass)} (%)`} value={row.weightPercent} onChange={e => change(row.assetClass, e.target.value)} /><span>%</span></span></div>
              <input id={`allocation-${row.assetClass}`} type="range" disabled={locked} min={bound.minPercent} max={bound.maxPercent} step="0.1" value={row.weightPercent} aria-valuetext={`${num(Number(row.weightPercent))}%`} onChange={e => change(row.assetClass, e.target.value)} />
              <div className="allocation-slider-caption"><span>{allocationPurpose(row.assetClass, en)} · {t(`cho phép ${num(Number(bound.minPercent))}–${num(Number(bound.maxPercent))}%`, `allowed ${num(Number(bound.minPercent))}–${num(Number(bound.maxPercent))}%`)}</span><strong>{growth !== null && growth >= 0 ? money(String(Math.round(growth * Number(row.weightPercent) / 100))) : "—"}</strong></div>
            </div>; })}
            <p className="allocation-result-footnote">{t("Khi thay một tỷ trọng, các phần còn lại tự cân đối để tổng luôn bằng 100%.", "Changing one weight rebalances the others so the total stays at 100%.")}</p>
            <div className="allocation-feedback">
              {rateButton(trial, true)}
              <div className={`allocation-check ${trialError ? "is-invalid" : !trial ? "is-pending" : trialValid ? "is-valid" : "is-invalid"}`} role="status"><strong>{trialError ? t("Chưa kiểm tra được tỷ trọng", "Could not check these weights") : !trial ? t("Đang kiểm tra ràng buộc…", "Checking constraints…") : trialValid ? t("Đạt kiểm tra ràng buộc ban đầu", "Passes the initial constraint check") : t("Cần điều chỉnh tỷ trọng", "Adjust the weights")}</strong>{trialError ? <><p>{trialError}</p><button type="button" className="remaining-text" onClick={() => setTrialAttempt(n => n + 1)}>{t("Thử kiểm tra lại", "Retry check")}</button></> : trial && <p>{trialValid ? lossText(trial.loss) : trialProblem}</p>}</div>
              {trialValid && <button className="overview-button secondary" disabled={busy} onClick={() => setPackages({ ...input, customAllocation: custom })}>{t("Gợi ý gói đầu tư cho tỷ trọng tự chọn", "Explore packages for custom weights")}</button>}
              {trial?.returnBreakdown && <details className="allocation-method"><summary>{t("Hiểu mức sinh lời đang dùng", "How this return is calculated")}</summary><table><thead><tr><th>{t("Tài sản", "Asset")}</th><th>{t("Đầu vào/tháng", "Monthly input")}</th><th>{t("Đóng góp", "Contribution")}</th></tr></thead><tbody>{trial.returnBreakdown.rows.filter(r => Number(r.weightPercent) > 0).map(r => <tr key={r.assetClass}><td>{label(r.assetClass)}</td><td>{num(Number(r.monthlyRate) * 100, 4)}%</td><td>{num(Number(r.monthlyContribution) * 100, 4)} {t("điểm %", "pts")}</td></tr>)}</tbody><tfoot><tr><th>{t("Tổng/tháng", "Monthly total")}</th><td colSpan={2}>{num(Number(trial.returnBreakdown.monthly) * 100, 4)}%</td></tr></tfoot></table><p>{t("Đóng góp = tỷ trọng × lợi suất tháng. Quy đổi năm có lãi kép = (1 + tổng lợi suất tháng)¹² − 1. Đây là giả định của phép tính, không phải lợi nhuận cam kết.", "Contribution = weight × monthly return. Compounded annual = (1 + monthly total)¹² − 1. This is a calculation assumption, not a committed return.")}</p></details>}
            </div>
          </>}
          <button className="overview-button primary" disabled={busy || !selectionPlan || (!!policy && !trialValid)} onClick={() => void run()}>{busy ? t("Đang mô phỏng…", "Simulating…") : t("Kiểm tra phương án tự chọn", "Test the custom allocation")}</button>
          {!selectionPlan && <p>{t("Bổ sung chi tiêu và thời gian nghỉ hưu để mô phỏng cùng dòng tiền của kế hoạch.", "Complete retirement spending and dates to simulate the plan cash flows.")} <Link to="/user/plan?tab=adjust">{t("Mở Kế hoạch", "Open Plan")}</Link></p>}
          {result?.status === "INSUFFICIENT" && <p role="status">{t("Chưa có phương án đạt ngưỡng chi thiết yếu. Hãy xem lại mức góp, thời điểm nghỉ hưu hoặc chi tiêu.", "No allocation meets the essential-spending threshold. Review contributions, retirement date or spending.")}</p>}
        </div>
      </details>
    </div>

    {/* Spec §7.4 step 4: an infeasible plan gets behavioural adjustments, searched in a separate run on the reference allocation. */}
    {selectionPlan && referenceResult?.status === "INSUFFICIENT" && referenceCandidate?.selection && referenceCandidate.paths &&
      <AllocationAdjustments plan={{ ...selectionPlan, ...referenceCandidate.selection }} paths={referenceCandidate.paths} essentialThreshold={chosenThreshold} />}
    {why}
    {customCandidate && referenceCandidate && <section className="allocation-tested">
      <h2>{t("Kết quả kiểm tra cùng điều kiện", "Results under the same conditions")}</h2>
      <div className="allocation-comparison-scroll"><table><thead><tr><th>{t("Chỉ tiêu", "Measure")}</th><th>{qualified ? t("Đề xuất", "Recommended") : t("Tham khảo", "Reference")}</th><th>{t("Tự chọn", "Custom")}</th></tr></thead><tbody>
        <tr><th>{t("Đủ chi thiết yếu", "Essentials covered")}</th><td>{share(referenceCandidate.pEssential)}</td><td>{share(customCandidate.pEssential)}</td></tr>
        <tr><th>{t("Đủ toàn bộ mục tiêu", "All goals covered")}</th><td>{share(referenceCandidate.pAll)}</td><td>{share(customCandidate.pAll)}</td></tr>
        <tr><th>{t("CVaR thiếu chi thiết yếu", "Essential shortfall CVaR")}</th><td>{money(referenceCandidate.display?.cvarVnd)}</td><td>{money(customCandidate.display?.cvarVnd)}</td></tr>
        <tr><th>{t("Giảm khi thị trường sốc", "Stress loss")}</th><td>{money(referenceCandidate.loss?.lossAmount)}</td><td>{money(customCandidate.loss?.lossAmount)}</td></tr>
      </tbody></table></div>
      <p>{customCandidate.thresholdUndecided && <>{t(`Khoảng tin cậy còn vắt qua ngưỡng ${num(Number(threshold) * 100)}%; tăng số kịch bản để kết luận chắc hơn.`, `The confidence interval still straddles the ${num(Number(threshold) * 100)}% threshold; increase the number of scenarios for a firmer conclusion.`)} </>}{customCandidate.paths} {t("đường mô phỏng · cùng lịch thu chi, phí và dữ liệu thị trường.", "simulation paths · same cash flows, fees and market data.")} {customPasses ? t("Phương án tự chọn đạt ngưỡng trong phép thử này.", "The custom allocation meets the thresholds in this test.") : t("Phương án tự chọn chưa đạt ngưỡng mục tiêu; cần xem lại mức góp, tuổi nghỉ hoặc chi tiêu.", "The custom allocation is below the target thresholds; review contributions, retirement age or spending.")}</p>
      <div className="allocation-tested-actions">
        <button className="overview-button secondary" disabled={busy || !customCandidate.selection || !trial || !eligible(trial)} onClick={() => trial && choose(customCandidate, trial)}>{t("Xem kế hoạch với tỷ trọng này", "View the plan with these weights")}</button>
        {customCandidate.selection && <button className="remaining-text" disabled={busy || !selectionPlan} onClick={() => selectionPlan && customCandidate.selection && setStressPlan({ ...selectionPlan, ...customCandidate.selection })}>{t("Thử biến cố với tỷ trọng tự chọn", "Stress-test custom allocation")}</button>}
      </div>
    </section>}

    <ResponsiveDialog open={!!rate} title={t("Giải thích tỷ suất sinh lời", "Return calculation")} onClose={() => setRate(null)} className="user-workspace-dialog allocation-products-dialog">{rate?.returnBreakdown && <><p>{t("Tỷ suất danh nghĩa dùng đầu vào tháng; tỷ suất hiệu dụng có lãi kép. Tỷ suất theo lộ trình còn phản ánh lịch phân bổ và chi phí tái cân bằng đã mô hình hóa.", "Nominal return uses monthly inputs; effective return compounds them. Path return also reflects modeled allocation changes and rebalancing costs.")}</p><dl>{rate.returnBreakdown.rows.map(row => <div key={row.assetClass}><dt>{label(row.assetClass)} · {Number(row.weightPercent).toFixed(2)}%</dt><dd>{t("Đóng góp tháng", "Monthly contribution")}: {(Number(row.monthlyContribution) * 100).toFixed(4)}%</dd></div>)}<div><dt>{t("Danh nghĩa năm (tháng × 12)", "Nominal annual (monthly × 12)")}</dt><dd>{Number(rate.returnBreakdown.nominalAnnualPercent).toFixed(2)}%</dd></div><div><dt>{t("Hiệu dụng năm ((1 + tháng)¹² − 1)", "Effective annual ((1 + monthly)¹² − 1)")}</dt><dd>{Number(rate.returnBreakdown.effectiveAnnualPercent).toFixed(2)}%</dd></div><div><dt>{t("Quy đổi theo toàn lộ trình", "Annualized whole-path return")}</dt><dd>{Number(rate.returnBreakdown.pathAnnualPercent).toFixed(2)}%</dd></div></dl></>}</ResponsiveDialog>
    <AllocationPackages input={packages} onClose={() => setPackages(null)} labels={data.assetLabels} />
    <AllocationScenarios plan={stressPlan} onClose={() => setStressPlan(null)} />
  </section>;
}
