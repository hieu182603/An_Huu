import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { previewAllocation, type AllocationWorkspaceResult, type WorkspaceInput } from "../services/allocationWorkspace";
import { analyzeRisk, type RiskResult, type SimulationResult } from "../services/planningAnalysis";
import type { CustomAllocation } from "../services/portfolios";
import type { RetirementPreviewInput } from "../services/retirement";
import { adjustAllocation,initialAllocationWeights } from "../utils/allocationWeights";
import { portfolioAssetLabel } from "../utils/portfolioGlidePath";
import { financeMoney } from "../utils/financeHubSummary";
import ResponsiveDialog from "./ResponsiveDialog";
import AllocationPackages from "./AllocationPackages";
import "./allocation-experiment.css";
import AllocationScenarios from "./AllocationScenarios";

export type AllocationChoice={templateId:string;customAllocation?:CustomAllocation;allocationFunding?:"PROTECTED_CAPITAL_V1"};
type Candidate=NonNullable<RiskResult["candidates"]>[number];
type Props={data:AllocationWorkspaceResult;input:WorkspaceInput;plan:RetirementPreviewInput|null;onChoose:(value:AllocationChoice)=>void;onReferenceChange:(value:AllocationWorkspaceResult)=>void;thresholds?:{essential?:string;all?:string}};
export default function AllocationExperiment({data,input,plan,onChoose,onReferenceChange,thresholds}:Props){
 const en=useI18n().language==="en",t=(vi:string,eng:string)=>en?eng:vi;
 const label=(code:string)=>portfolioAssetLabel(code,en?"en":"vi",data.assetLabels);
 const money=(v:string|null|undefined)=>financeMoney(v??null,en);
 const policy=data.customization;
 const initialWeights=()=>policy?initialAllocationWeights(plan?.customAllocation?.weights??data.allocations,policy):[];
 const [weights,setWeights]=useState(initialWeights);
 const [result,setResult]=useState<RiskResult|null>(null),[trial,setTrial]=useState<AllocationWorkspaceResult|null>(null),[reference,setReference]=useState(data);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[rate,setRate]=useState<AllocationWorkspaceResult|null>(null),[packages,setPackages]=useState<WorkspaceInput|null>(null);
 const [stressPlan,setStressPlan]=useState<RetirementPreviewInput|null>(null);
 const controller=useRef<AbortController|null>(null),sequence=useRef(0),autoRan=useRef("");
 const fingerprint=JSON.stringify({input,plan,data:data.allocations,customization:policy});
 useEffect(()=>onReferenceChange(reference),[reference,onReferenceChange]);
 useEffect(()=>()=>{sequence.current++;controller.current?.abort();},[fingerprint]);
 useEffect(()=>{setResult(null);setTrial(null);setReference(data);setBusy(false);setError("");setWeights(initialWeights());},[fingerprint]);
 const custom:CustomAllocation={model:"custom-glide-v1",weights};
 const referenceCandidate=result?.candidates?.find(c=>c.id===result.referenceId),customCandidate=result?.candidates?.find(c=>c.id==="CUSTOM");
 const eligible=(r:AllocationWorkspaceResult)=>r.portfolio?.status==="READY"&&r.loss.status==="WITHIN_LIMIT"&&r.capital.status==="READY";
 const selectionPlan=plan&&input.templateId?{...plan,templateId:input.templateId,customAllocation:undefined}:null;
 const run=async()=>{
  if(!selectionPlan||busy)return;
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const ticket=++sequence.current;setBusy(true);setError("");setResult(null);setTrial(null);
  try{
   const nextTrial=policy?await previewAllocation({...input,customAllocation:custom},abort.signal):null;
   if(ticket!==sequence.current)return;
   if(nextTrial&&!eligible(nextTrial)){setTrial(nextTrial);setError(t("Tỷ trọng này chưa đáp ứng chính sách hoặc giới hạn chịu lỗ. Hãy điều chỉnh trước khi mô phỏng.","These weights do not satisfy the policy or loss limit. Adjust them before simulation."));return;}
   const from=data.valuationDate.slice(0,7),to=selectionPlan.endMonth;
   const months=Math.max(1,(Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5,7))-Number(from.slice(5,7))+1);
   const paths=Math.max(1,Math.min(200,Math.floor(150000/(months*5))));
   const response=await analyzeRisk("selection",{kind:"PREVIEW",preview:selectionPlan},paths,undefined,abort.signal,policy?custom:undefined,"ALLOCATION_V2");
   const picked=response.candidates?.find(c=>c.id===response.referenceId);
   const nextReference=picked?.selection?await previewAllocation({...input,...picked.selection},abort.signal):data;
   if(ticket!==sequence.current)return;
   setTrial(nextTrial);setResult(response);setReference(nextReference);
  }catch(e){if(ticket===sequence.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:t("Chưa tính được kết quả.","Could not calculate the result."));}
  finally{if(ticket===sequence.current)setBusy(false);}
 };
 useEffect(()=>{if(selectionPlan&&autoRan.current!==fingerprint&&JSON.stringify(weights)===JSON.stringify(initialWeights())){autoRan.current=fingerprint;void run();}},[fingerprint,JSON.stringify(weights)]);
 const change=(code:string,value:string)=>{
  if(!policy)return;sequence.current++;controller.current?.abort();setBusy(false);setResult(null);setTrial(null);setError("");setWeights(prev=>adjustAllocation(prev,policy,code,value));
 };
 const reset=()=>{if(!policy)return;sequence.current++;controller.current?.abort();setBusy(false);setResult(null);setTrial(null);setError("");setWeights(initialAllocationWeights(reference.allocations,policy));};
 const choose=(candidate:Candidate|undefined,workspace:AllocationWorkspaceResult)=>{
  if(!candidate?.selection||!eligible(workspace)||!selectionPlan)return;
  onChoose({...candidate.selection,...(selectionPlan.allocationFunding?{allocationFunding:selectionPlan.allocationFunding}:{})});
 };
 const percentage=(v:number|null|undefined)=>v==null?t("Chưa xác định","Unavailable"):`${new Intl.NumberFormat(en?"en-US":"vi-VN",{maximumFractionDigits:0}).format(v*100)}%`;
 const metrics=(candidate:SimulationResult|undefined)=><div className="allocation-probabilities">
  {[{label:t("Đủ chi thiết yếu","Essential spending covered"),value:candidate?.pEssential,threshold:result?.threshold??thresholds?.essential},{label:t("Đủ toàn bộ mục tiêu","All goals covered"),value:candidate?.pAll,threshold:result?.allThreshold??thresholds?.all}].map(row=><div key={row.label}><div><span>{row.label}</span><strong>{percentage(row.value)}</strong></div>{row.value!=null&&<meter min={0} max={1} value={row.value} aria-label={row.label}/>}<small>{row.threshold?t(`Ngưỡng theo chính sách: ${Number(row.threshold)*100}%`,`Policy threshold: ${Number(row.threshold)*100}%`):t("Chưa công bố ngưỡng đánh giá","No published threshold")}</small></div>)}
  {candidate?.display&&<p>{t("Khoảng tin cậy chi thiết yếu (95%):","Essential spending 95% interval:")} {candidate.display.wilsonLowerPercent}–{candidate.display.wilsonUpperPercent}%. CVaR: {money(candidate.display.cvarVnd)}.</p>}
 </div>;
 const ring=(rows:Array<{assetClass:string;weightPercent:string}>)=>{let offset=0;const colors=["#7476b5","#245dab","#c29a39","#4d8a9b","#8c9bab"];return <svg className="allocation-result-ring" viewBox="0 0 200 200" role="img" aria-label={t("Biểu đồ tỷ trọng vốn dài hạn","Long-term capital allocation chart")}><circle cx="100" cy="100" r="78" fill="none" stroke="#e9eff5" strokeWidth="20"/>{rows.map((r,i)=>{const start=offset;offset+=Number(r.weightPercent);return <circle key={r.assetClass} cx="100" cy="100" r="78" fill="none" stroke={colors[i%colors.length]} strokeWidth="20" pathLength="100" strokeDasharray={`${r.weightPercent} ${100-Number(r.weightPercent)}`} strokeDashoffset={-start} transform="rotate(-90 100 100)"/>;})}<text className="allocation-ring-total" x="100" y="99" textAnchor="middle">100%</text><text className="allocation-ring-label" x="100" y="122" textAnchor="middle">{t("Vốn dài hạn","Long-term capital")}</text></svg>;};
 const breakdown=(workspace:AllocationWorkspaceResult)=><dl className="allocation-experiment-weights">{workspace.allocations.map(row=><div key={row.assetClass}><dt>{label(row.assetClass)}</dt><dd><strong>{Number(row.weightPercent).toLocaleString(en?"en-US":"vi-VN",{maximumFractionDigits:2})}%</strong><span>{money(row.amountVnd)}</span></dd></div>)}</dl>;
 const annual=(workspace:AllocationWorkspaceResult)=>workspace.returnBreakdown?.pathAnnualPercent;
 const statusText=result?.status==="DATA_REQUIRED"?t("Chưa có bộ dữ liệu thị trường tháng đã công bố để mô phỏng. Các xác suất được để chưa xác định.","Published monthly market data is required. Probabilities remain unavailable."):result?.status==="LIMIT_EXCEEDED"?t("Phép thử vượt giới hạn xử lý. Chưa có ước lượng hoàn chỉnh; hãy thử lại sau.","The run exceeded processing limits. No complete estimate is available; retry later."):result&&!result.candidates?.length?t("Cần hoàn thiện dòng tiền và chính sách mô phỏng trước khi đánh giá khả năng đủ tiền.","Complete cash flows and simulation policy before estimating funding success."):"";
 return <section className="allocation-experiment" aria-label={t("Thử và đối chiếu phân bổ","Test and compare allocations")}>
  <div className="allocation-lab-real">
   <article className="allocation-reference"><span className="allocation-source-badge">{t("PHƯƠNG ÁN THAM CHIẾU","REFERENCE ALLOCATION")}</span><h2>{t("Cách chia để đối chiếu","Your comparison allocation")}</h2>
    <button type="button" className="allocation-rate-button" onClick={()=>setRate(reference)} disabled={!reference.returnBreakdown}><strong>{annual(reference)?`${Number(annual(reference)).toFixed(2)}%`:"—"}</strong><span>{t("Sinh lời quy đổi / năm ⓘ","Annual equivalent return ⓘ")}</span></button>
    {reference.allocations.length>0&&ring(reference.allocations)}{breakdown(reference)}{metrics(referenceCandidate)}
    <p className="allocation-result-footnote">{t("Lọc theo giới hạn chịu lỗ, sau đó chọn theo ngưỡng chi thiết yếu, CVaR và mức thay đổi tỷ trọng. Không có phương án đạt ngưỡng thì chỉ hiển thị để tham khảo.","Loss limit first, then essential-spending threshold, CVaR and allocation change. A below-threshold allocation is shown for comparison only.")}</p>
    <button className="overview-button primary" disabled={busy||!referenceCandidate?.selection||!eligible(reference)} onClick={()=>choose(referenceCandidate,reference)}>{t("Chọn phương án tham chiếu","Choose reference allocation")}</button>
    <button className="overview-button secondary" onClick={()=>setPackages({...input,...(referenceCandidate?.selection??{})})} disabled={!eligible(reference)}>{t("Gợi ý gói đầu tư phù hợp","Explore investment packages")}</button>
    <button className="remaining-text" disabled={busy||!selectionPlan||!referenceCandidate?.selection} onClick={()=>selectionPlan&&referenceCandidate?.selection&&setStressPlan({...selectionPlan,...referenceCandidate.selection})}>{t("Thử các biến cố với phương án này","Stress-test this allocation")}</button>
   </article>
   <article className="allocation-reference allocation-custom"><h2>{t("Tự chọn tỷ trọng","Choose your own weights")}</h2><p>{t("Điều chỉnh cách chia; phần còn lại cân đối về 100% trong giới hạn đã công bố.","Adjust the allocation; other shares balance to 100% within published limits.")}</p>
    {!policy?<p role="status">{t("Chính sách hiện tại chưa công bố giới hạn cho tỷ trọng tự chọn.","The current policy has no published custom-allocation bounds.")}</p>:<>{ring(weights)}{plan?.customAllocation&&<p>{t("Đã nạp tỷ trọng từ lựa chọn hiện có. Kiểm tra lại trước khi dùng kết quả mới.","Weights loaded from your existing selection. Test again before using new results.")}</p>}{weights.map(row=>{const bound=policy.bounds.find(b=>b.assetClass===row.assetClass)!;return <div className="allocation-slider-row" key={row.assetClass}><label htmlFor={`allocation-${row.assetClass}`}>{label(row.assetClass)}</label><div><input id={`allocation-${row.assetClass}`} type="range" disabled={busy||bound.minPercent===bound.maxPercent} min={bound.minPercent} max={bound.maxPercent} step="0.1" value={row.weightPercent} onChange={e=>change(row.assetClass,e.target.value)}/><input type="number" disabled={busy||bound.minPercent===bound.maxPercent} min={bound.minPercent} max={bound.maxPercent} step="0.1" aria-label={`${label(row.assetClass)} (%)`} value={row.weightPercent} onChange={e=>change(row.assetClass,e.target.value)}/><span>%</span></div></div>;})}<p>{t("Tổng tỷ trọng: 100%","Total allocation: 100%")}</p></>}
    {trial&&<><button type="button" className="allocation-rate-button" onClick={()=>setRate(trial)} disabled={!trial.returnBreakdown}><strong>{annual(trial)?`${Number(annual(trial)).toFixed(2)}%`:"—"}</strong><span>{t("Sinh lời quy đổi / năm ⓘ","Annual equivalent return ⓘ")}</span></button>{breakdown(trial)}<p>{trial.loss.message}</p></>}
    {metrics(customCandidate)}<button className="overview-button primary" disabled={busy||!selectionPlan} onClick={()=>void run()}>{busy?t("Đang mô phỏng…","Simulating…"):t("Kiểm tra và so sánh","Test and compare")}</button>
    {policy&&<><button className="remaining-text" disabled={busy} onClick={reset}>{t("Đặt lại theo tham chiếu","Reset to reference")}</button><button className="overview-button secondary" disabled={busy||!customCandidate?.selection||!trial||!eligible(trial)} onClick={()=>trial&&choose(customCandidate,trial)}>{t("Chọn tỷ trọng tự chọn","Choose custom allocation")}</button><button className="overview-button secondary" disabled={busy||!trial||!eligible(trial)} onClick={()=>setPackages({...input,customAllocation:custom})}>{t("Gợi ý gói cho tỷ trọng tự chọn","Explore packages for custom weights")}</button></>}
    {customCandidate?.selection&&<button className="remaining-text" disabled={busy||!selectionPlan} onClick={()=>selectionPlan&&customCandidate.selection&&setStressPlan({...selectionPlan,...customCandidate.selection})}>{t("Thử biến cố với tỷ trọng tự chọn","Stress-test custom allocation")}</button>}
    {!selectionPlan&&<p>{t("Bổ sung chi tiêu và thời gian nghỉ hưu để mô phỏng cùng dòng tiền của kế hoạch.","Complete retirement spending and dates to simulate the plan cash flows.")} <Link to="/user/plan?tab=adjust">{t("Mở Kế hoạch","Open Plan")}</Link></p>}
    {error&&<p role="alert">{error}</p>}{statusText&&<p role="status">{statusText}</p>}
    {result?.status==="INSUFFICIENT"&&<p role="status">{t("Chưa có phương án đạt ngưỡng chi thiết yếu. Hãy xem lại mức góp, thời điểm nghỉ hưu hoặc chi tiêu.","No allocation meets the essential-spending threshold. Review contributions, retirement date or spending.")}</p>}
   </article>
  </div>
  {!!result?.candidates?.length&&<div className="allocation-comparison-scroll"><table><caption>{t("Kết quả trên cùng dữ liệu và dòng tiền; thay tỷ trọng sẽ xóa kết quả cũ.","Same data and cash flows; editing weights invalidates these results.")}</caption><thead><tr><th>{t("Phương án","Allocation")}</th><th>{t("Đủ thiết yếu","Essentials")}</th><th>{t("Đủ mục tiêu","All goals")}</th><th>CVaR</th><th>{t("Giảm khi sốc","Stress loss")}</th></tr></thead><tbody>{result.candidates.map(row=><tr key={row.id}><th>{row.id==="CUSTOM"?t("Tự chọn","Custom"):row.id===result.referenceId?t("Tham chiếu","Reference"):({BASE:t("Theo hồ sơ","Profile allocation"),LOWER_EQUITY:t("Giảm cổ phiếu","Lower equity"),HIGHER_EQUITY:t("Tăng cổ phiếu","Higher equity"),CONTINUOUS:t("Phân bổ tối ưu","Optimized allocation")} as Record<string,string>)[row.id]??t("Phương án khác","Alternative")}</th><td>{percentage(row.pEssential)}</td><td>{percentage(row.pAll)}</td><td>{money(row.display?.cvarVnd)}</td><td>{money(row.loss?.lossAmount)}</td></tr>)}</tbody></table><p className="allocation-result-footnote">{result.candidates[0]?.paths} {t("đường mô phỏng lịch sử; không bảo đảm kết quả tương lai.","historical simulation paths; future results are not guaranteed.")}</p></div>}
  {result?.candidates?.[0]?.disclosure&&<details className="allocation-probability-details"><summary>{t("Cơ sở tính xác suất và giới hạn của kết quả","Probability calculation and limitations")}</summary><p>{t("Đủ toàn bộ mục tiêu nghĩa là không thiếu khoản chi nào trong suốt kỳ và đáp ứng số dư cuối kỳ đã khai. Chi tiêu sau hưu theo CPI của mỗi đường thử; khoản chi và mục tiêu danh nghĩa khác giữ nguyên.","All-goals success requires no unfunded withdrawal throughout the horizon and the declared terminal balance. Retirement living expenses follow each path's CPI; other nominal spending and goals remain fixed.")}</p><p>{result.candidates[0].disclosure.period.from} → {result.candidates[0].disclosure.period.to} · {result.candidates[0].disclosure.historyMonths} {t("tháng lịch sử","historical months")} · {result.candidates[0].paths} {t("đường thử","paths")}. {t("Khoảng Wilson chỉ đo sai số lấy mẫu, không đo sai lệch mô hình. Chi phí mua ban đầu, chênh lệch giá và lô giao dịch chưa được trừ trong mô phỏng.","Wilson measures sampling error, not model error. Initial purchase costs, spreads and trading lots are not deducted in the simulation.")}</p><ul>{result.candidates[0].disclosure.sources.map(s=><li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · {s.license}</li>)}</ul></details>}
  <ResponsiveDialog open={!!rate} title={t("Giải thích tỷ suất sinh lời","Return calculation")} onClose={()=>setRate(null)} className="user-workspace-dialog allocation-products-dialog">{rate?.returnBreakdown&&<><p>{t("Tỷ suất danh nghĩa dùng đầu vào tháng; tỷ suất hiệu dụng có lãi kép. Tỷ suất theo lộ trình còn phản ánh lịch phân bổ và chi phí tái cân bằng đã mô hình hóa.","Nominal return uses monthly inputs; effective return compounds them. Path return also reflects modeled allocation changes and rebalancing costs.")}</p><dl>{rate.returnBreakdown.rows.map(row=><div key={row.assetClass}><dt>{label(row.assetClass)} · {Number(row.weightPercent).toFixed(2)}%</dt><dd>{t("Đóng góp tháng","Monthly contribution")}: {(Number(row.monthlyContribution)*100).toFixed(4)}%</dd></div>)}<div><dt>{t("Danh nghĩa năm (tháng × 12)","Nominal annual (monthly × 12)")}</dt><dd>{Number(rate.returnBreakdown.nominalAnnualPercent).toFixed(2)}%</dd></div><div><dt>{t("Hiệu dụng năm ((1 + tháng)¹² − 1)","Effective annual ((1 + monthly)¹² − 1)")}</dt><dd>{Number(rate.returnBreakdown.effectiveAnnualPercent).toFixed(2)}%</dd></div><div><dt>{t("Quy đổi theo toàn lộ trình","Annualized whole-path return")}</dt><dd>{Number(rate.returnBreakdown.pathAnnualPercent).toFixed(2)}%</dd></div></dl></>}</ResponsiveDialog>
  <AllocationPackages input={packages} onClose={()=>setPackages(null)} labels={data.assetLabels}/>
  <AllocationScenarios plan={stressPlan} onClose={()=>setStressPlan(null)}/>
 </section>;
}
