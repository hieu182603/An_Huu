import type { RetirementPreviewInput } from "../services/retirement";
import type { CustomAllocation } from "../services/portfolios";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useI18n } from "../i18n";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { Decimal } from "../utils/decimal";
import type { PortfolioPolicyDetail } from "../services/portfolios";
import type { AllocationWorkspaceResult } from "../services/allocationWorkspace";
import AllocationResults from "../components/AllocationResults";
import { resolveLossTolerance } from "../utils/lossTolerance";
import AllocationLossLimit from "../components/AllocationLossLimit";
import { AllocationCapitalInput, AllocationSpendingInputs, AllocationPersonalPlan } from "../components/AllocationPersonalInputs";
import { AllocationGoals, AllocationReserveMonths } from "../components/AllocationProfileEdits";
import { financeMoney } from "../utils/financeHubSummary";



import { RebalanceProposal } from "../components/retirement/RiskAnalysis";
import ResponsiveDialog from "../components/ResponsiveDialog";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import { DiscoveryError } from "../components/DiscoveryParts";
import { Explain } from "../components/explanations/ExplainMode";
import "../components/user-workspace-dialogs.css";
import "../pages/financial-cashflow.css";

type Props={lossInputMode?:"PERCENT"|"AMOUNT";planInput?:RetirementPreviewInput|null;confirmLoss:()=>void;saveLoss:(kind:"PERCENT"|"AMOUNT",value:string)=>void;riskError?:string;savingRisk:boolean;profileRevision:number;retirementExpense:string|null;lossPercent:string|null;lossAmount:string|null;policy:PortfolioPolicyDetail;data:AllocationWorkspaceResult|null;loading:boolean;error?:string;retry:()=>void;selected:string;select:(id:string)=>void;months:number;setMonths:(n:number)=>void;endMonth:string;setEndMonth:(s:string)=>void;retirementMonth?:string;answers:Record<string,string>;complete:boolean;openRisk:()=>void};
export default function AllocationWorkspace(p:Props) {
  const en=useI18n().language==="en", t=(v:string,e:string)=>en?e:v;
  const navigate=useNavigate(), {updateDraft}=useRetirementPlan();
  const [applyError,setApplyError]=useState("");
  const [reservePending,setReservePending]=useState(false);
  const [chosen,setChosen]=useState<{templateId:string;customAllocation?:CustomAllocation;allocationFunding?:"PROTECTED_CAPITAL_V1"}|null>(null);
  const [resultsRequested,setResultsRequested]=useState(false);
  const [publishedOpen,setPublishedOpen]=useState(false);
  const [applied,setApplied]=useState(false);
  useEffect(()=>{setResultsRequested(false);setApplied(false);},[p.profileRevision,p.policy.id,p.months,p.endMonth,JSON.stringify(p.answers)]);
  const [step,setStep]=useState(0),[modal,setModal]=useState<"capital"|"reserve"|"goals"|"rebalance"|"apply"|null>(null);
  const r=p.data,c=r?.capital, portfolio=r?.portfolio, money=(s:string|null|undefined)=>financeMoney(s??null,en);
  const limit=resolveLossTolerance(c?.growthCapital??null,p.lossAmount,p.lossPercent,p.lossInputMode);
  const template=p.policy.data.templates.find(row=>row.id===portfolio?.assessment.selectedTemplateId);
  const inflation=portfolio?.scenarios.find(row=>row.kind==="BASE")?.rows[0]?.inflationAnnualPercent;
  const decimalPercent=(value:string|undefined)=>value===undefined?"—":new Intl.NumberFormat(en?"en-GB":"vi-VN",{maximumFractionDigits:2}).format(Number(value))+"%";
  const usable=p.complete&&portfolio?.status==="READY"&&c?.status==="READY"&&r?.loss.status==="WITHIN_LIMIT";

  const explain=(kind:"capital"|"reserve"|"goals",text:string)=> <button className="allocation-help" aria-label={`${t("Giải thích","Explain")}: ${text}`} onClick={()=>setModal(kind)}>i</button>;

  const canApply=chosen?Boolean(p.complete&&!p.loading&&r):Boolean(usable);
  useEffect(()=>{setChosen(null);setModal(null);},[p.profileRevision,p.policy.id,p.months,p.endMonth,p.retirementMonth,p.selected,JSON.stringify(p.answers)]);
  const protectedCapital=c?.requiredEmergencyReserve!=null&&c.nearTermGoalsPresentValue!=null?new Decimal(c.requiredEmergencyReserve).plus(c.nearTermGoalsPresentValue).toString():null;
  const savedBand=p.policy.data.riskBands.find(b=>b.id===portfolio?.assessment.riskBandId);
  // Keep the published band explanation without showing the raw questionnaire score.
  const bands=[...p.policy.data.riskBands].sort((a,b)=>a.minScore-b.minScore), bandIndex=savedBand?bands.indexOf(savedBand):-1, bandMiddle=(bands.length-1)/2;
  const bandNote=bandIndex<0?null:bandIndex===0?t("Ưu tiên giữ vốn, chấp nhận ít biến động.","Puts protecting capital first and accepts little volatility."):bandIndex===bands.length-1?t("Chấp nhận biến động lớn để hướng tới tăng trưởng dài hạn.","Accepts large swings in pursuit of long-term growth."):bandIndex<bandMiddle?t("Nghiêng về an toàn, chấp nhận biến động vừa phải.","Leans towards safety and accepts moderate volatility."):bandIndex>bandMiddle?t("Nghiêng về tăng trưởng, chấp nhận biến động khá lớn.","Leans towards growth and accepts sizeable volatility."):t("Cân đối giữa giữ vốn và tăng trưởng.","Balances protecting capital with growth.");
  const surveyStatus=<p role="status" className="allocation-survey-status">{p.complete?t("Đang sử dụng kết quả khảo sát rủi ro ban đầu.","Using your initial risk survey results."):t("Chưa có kết quả khảo sát rủi ro hợp lệ cho chính sách hiện tại.","No valid saved risk survey results are available for this policy.")}{savedBand&&<> <strong>{savedBand.label}</strong>{bandNote&&<span className="allocation-survey-note">{bandNote}</span>}</>}{!p.complete&&<> <button className="remaining-text" onClick={p.openRisk}>{t("Trả lời câu hỏi đánh giá","Complete suitability questions")}</button></>}</p>;
  const wizard=<div className="allocation-wizard">
    <nav className="allocation-steps" aria-label={t("Các bước phân bổ","Allocation steps")}>{[t("Tiền có thể đầu tư","Investable capital"),t("Khoản cần bảo vệ","Protected needs"),t("Kiểm tra và tính","Review and calculate")].map((name,i)=><button type="button" key={name} aria-current={step===i?"step":undefined} className={step===i?"is-active":""} disabled={reservePending&&i!==step} onClick={()=>setStep(Math.min(i,step+1))}><span>{i+1}</span>{name}</button>)}</nav>
    <div className="allocation-wizard-body">
      <h2>{step===0?t("Tiền có thể đầu tư","Investable capital"):step===1?t("Khoản cần bảo vệ","Protected needs"):t("Kiểm tra và tính","Review and calculate")}</h2>
      {step===0?<>
        <AllocationCapitalInput en={en}/>
        <div className="allocation-known-money"><span>{t("Tiền đã dành cho nghỉ hưu trong hồ sơ","Declared retirement capital")}</span><strong>{money(chosen?.allocationFunding?c?.growthCapital:c?.retirementLiquidAssets)}</strong><Link to="/user/profile?section=assets">{t("Sửa trong Tài chính","Edit in Finances")}</Link></div>
        <AllocationReserveMonths months={c?.reserveMonths??null} en={en} onPendingChange={setReservePending}/>
        <details className="allocation-disclosure"><summary>{t("Tôi có khoản để riêng ngoài quỹ nghỉ hưu","I have capital set aside outside my retirement fund")}</summary><dl className="allocation-protection"><div><dt>{t("Dự phòng đã để riêng","Separate emergency reserve")}</dt><dd>{money(c?.declaredEmergencyReserve)}</dd></div><div><dt>{t("Tiền đã dành cho mục tiêu khác","Separate goal capital")}</dt><dd>{money(c?.declaredOtherGoalsCapital)}</dd></div></dl><Link to="/user/profile?section=assets">{t("Xem và sửa khoản để riêng","Review and edit separate capital")}</Link></details>
        <p>{t("Dự phòng và tiền cho mục tiêu gần hạn sẽ được tách trước khi đầu tư.","Emergency and near-term goal reserves are protected before investing.")}</p>
      </>:step===1?<>
        <AllocationSpendingInputs en={en} current={c?.essentialMonthlyExpense??null} retirement={p.retirementExpense} endMonth={p.endMonth} />
        <dl className="allocation-protection"><div><dt><Explain term="essentialExpenses">{t("Chi thiết yếu hiện nay","Current essential spending")}</Explain></dt><dd>{money(c?.essentialMonthlyExpense)} / {t("tháng","month")}</dd></div><div><dt><Explain term="expenseToday">{t("Chi thiết yếu khi nghỉ hưu","Retirement spending")}</Explain></dt><dd>{money(p.retirementExpense)} / {t("tháng","month")}</dd></div><div><dt><Explain term="emergencyReserve">{t("Dự phòng còn thiếu","Reserve shortfall")}</Explain></dt><dd>{money(c?.emergencyShortfall)}</dd></div></dl>
        <AllocationLossLimit growth={c?.growthCapital??null} amount={p.lossAmount} percent={p.lossPercent} inputMode={p.lossInputMode} saving={p.savingRisk||p.loading} save={p.saveLoss} en={en} error={p.riskError}/>
        {!p.complete&&surveyStatus}
        {(p.lossAmount!==null)!==(p.lossPercent!==null)&&<button type="button" className="overview-button primary" disabled={p.savingRisk||p.loading} onClick={p.confirmLoss}>{p.savingRisk?t("Đang quy đổi…","Converting…"):t("Quy đổi giới hạn đã khai","Convert declared loss limit")}</button>}

        <p>{t("Giới hạn này dùng để lọc danh mục, không bảo đảm quỹ sẽ không giảm nhiều hơn.","This limit filters portfolios and does not guarantee actual losses.")}</p>
      </>:<>
        <dl className="allocation-review-strip">{([
          [t("Vốn dài hạn để đầu tư","Long-term capital"),money(c?.growthCapital),0,"growthCapital"],
          [t("Giữ riêng, không đầu tư","Protected capital"),money(protectedCapital),0],
          [t("Giới hạn giảm","Loss limit"),`${money(limit.amount)}${limit.percent!==null?` · ${limit.percent.replace(".",",")}%`:""}`,1,"lossTolerance"],
          [t("Chi thiết yếu khi nghỉ hưu","Retirement spending"),`${money(p.retirementExpense)} / ${t("tháng","month")}`,1,"expenseToday"],
        ] as Array<[string,string,number,string?]>).map(([label,value,target,term])=><div key={label}><dt>{term?<Explain term={term}>{label}</Explain>:label}</dt><dd>{value}</dd><button type="button" className="remaining-text" aria-label={`${t("Sửa","Edit")} ${label}`} onClick={()=>setStep(Number(target))}>{t("Sửa","Edit")}</button></div>)}</dl>
        {!p.complete&&surveyStatus}
        <details className="allocation-disclosure"><summary><strong>{t("Khoản lớn cần dùng trong tương lai","Major future expenses")}</strong><small>{c?.goals.length?t(`${c.goals.length} mục tiêu đã khai. Bấm để xem hoặc sửa.`,`${c.goals.length} goals declared. Open to review or edit.`):t("Không bắt buộc. Thêm học phí, sửa nhà, chăm sóc sức khỏe… nếu bạn có kế hoạch chi lớn.","Optional. Add tuition, home repairs or health care if you plan a large expense.")}</small></summary>{!!c?.goals.length&&<dl className="allocation-protection">{c.goals.map(goal=><div key={goal.id}><dt>{goal.label} · {goal.dueMonth.slice(5)}/{goal.dueMonth.slice(0,4)}</dt><dd>{goal.treatment==="RESERVED"?money(goal.presentValue):t("Mục tiêu dài hạn","Long-term goal")}</dd></div>)}</dl>}<AllocationGoals en={en} minMonth={r?.valuationDate.slice(0,7)}/><Link to="/user/profile?section=constraints">{t("Xem và chỉnh mục tiêu khác →","Review and edit other goals →")}</Link></details>
        <p className="allocation-data-note">{t("Giả định: lạm phát", "Assumptions: inflation")} {decimalPercent(inflation)}/{t("năm", "year")} · {t("phí tư vấn", "advisory fee")} {decimalPercent(p.planInput?.advisoryFee?.annualPercent??"0")}/{t("năm", "year")} · {p.policy.data.allocationRisk?.simulationPaths??"—"} {t("kịch bản thị trường", "market scenarios")}. <button type="button" className="remaining-text" onClick={()=>{const details=document.getElementById("allocation-system-assumptions") as HTMLDetailsElement|null;if(details){details.open=true;details.querySelector("summary")?.focus();details.scrollIntoView({block:"nearest"});}}}>{t("Chỉnh", "Review")}</button></p>
        <AllocationPersonalPlan en={en} input={p.planInput} retirementMonth={p.retirementMonth} />
        <details className="allocation-disclosure"><summary>{t("Tài sản đang nắm giữ", "Current holdings")}</summary><RebalanceProposal templates={p.policy.data.templates} basis={template&&r&&p.retirementMonth?{policyVersionId:p.policy.id,templateId:template.id,month:r.valuationDate.slice(0,7),retirementMonth:p.retirementMonth}:null}/></details>
        <details id="allocation-system-assumptions" className="allocation-disclosure"><summary><strong>{t("Giả định đang dùng","Current assumptions")}</strong><small>{t("Thời gian tính, thanh khoản và chính sách danh mục đang dùng.","Projection horizon, liquidity and the current portfolio policy.")}</small></summary>
          <p>{t("Lạm phát và số kịch bản theo chính sách đã công bố; phí tư vấn theo phương án đang xem. Bạn có thể sửa thời gian tính và nhu cầu thanh khoản dưới đây.","Inflation and scenario counts follow the published policy; advisory fees follow this plan. You can edit the horizon and liquidity needs below.")}</p>
          <p>{t("Tổng vốn chỉ gồm tài sản thanh khoản đủ thông tin và khả dụng. Dự phòng bằng chi thiết yếu nhân số tháng bạn chọn, mặc định 6 tháng. Mục tiêu đến hạn trong 60 tháng được giữ riêng theo giả định đã công bố.","Capital includes confirmed, available liquid assets. Reserves equal essential spending times your selected months, defaulting to 6. Goals due within 60 months are protected using published assumptions.")}</p>
          {p.complete&&surveyStatus}
          <ProfileFormattedInput format="month" label={t("Tháng kết thúc kế hoạch","Plan end month")} value={p.endMonth} min={r?.valuationDate.slice(0,7)} onChange={p.setEndMonth}/>
          <label>{t("Thời gian cần giữ thanh khoản cho phương án (tháng)","Liquidity horizon for the portfolio (months)")}<input type="number" min={0} max={1200} value={p.months} aria-label={t("Thời gian cần giữ thanh khoản","Liquidity horizon")} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<=1200)p.setMonths(n);}}/></label>
          <p>{p.policy.data.title}</p><Link to="/user/plan?tab=adjust#plan-settings">{t("Xem giả định và phí của kế hoạch →","Review plan assumptions and fees →")}</Link>
        </details>
        {!p.endMonth&&<p className="allocation-review">{t("Chọn tháng kết thúc kế hoạch trong Giả định đang dùng trước khi tính.","Choose a plan end month in Current assumptions before calculating.")}</p>}
      </>}
      <footer>{step>0&&<button type="button" className="overview-button secondary" onClick={()=>setStep(step-1)}>{t("Quay lại","Back")}</button>}{step<2?<button type="button" className="overview-button primary" disabled={reservePending} onClick={()=>setStep(step+1)}>{t("Tiếp tục →","Continue →")}</button>:<button type="button" className="overview-button primary" disabled={!p.complete||!p.endMonth||p.loading} onClick={()=>{setResultsRequested(true);p.retry();window.scrollTo({top:0,behavior:"instant"});}}>{p.loading?t("Đang tính…","Calculating…"):t("Xem phương án của tôi →","View my allocation →")}</button>}</footer>
      <p className="allocation-data-note">{t("Dùng hồ sơ và chính sách đã công bố. Chưa áp dụng vào kế hoạch.","Uses your profile and published policy. Not applied to the plan yet.")}</p>
    </div>
  </div>;

  // Like the demo: choosing a tested allocation puts it straight into the plan draft and keeps the user here.
  const useInPreview=(selection:NonNullable<typeof chosen>)=>{
    if(!r||!p.complete)return;
    try{
      updateDraft({...p.planInput,expectedProfileRevision:r.profileRevision,policyVersionId:p.policy.id,templateId:selection.templateId,customAllocation:selection.customAllocation??null,allocationFunding:selection.allocationFunding??null,answers:p.policy.data.questions.map(q=>({questionId:q.id,choiceId:p.answers[q.id]})),liquidityNeedMonths:p.months,endMonth:p.endMonth});
      setApplyError("");setApplied(true);
    }catch{setApplied(false);setApplyError(t("Chưa giữ được bản nháp trên thiết bị. Hãy cho phép lưu trữ rồi thử lại.","Could not store the draft on this device. Allow browser storage and retry."));}
  };
  return <>
    <header className="allocation-page-head"><div><span className="allocation-eyebrow">{t("KẾ HOẠCH ĐẦU TƯ CỦA BẠN","YOUR INVESTMENT PLAN")}</span><h1>{t("Phân bổ tài sản","Asset allocation")}</h1><p>{t("Biết tiền đi đâu. Hiểu vì sao lựa chọn đó phù hợp.","Know where your money goes and why the choice fits.")}</p></div><button className="overview-button secondary" onClick={p.openRisk}>{t("Khả năng chịu rủi ro →","Risk tolerance →")}</button></header>
    {p.error&&<DiscoveryError message={p.error} retry={p.retry}/>}
    {p.loading&&<p role="status">{t("Đang tính từ hồ sơ hiện hành…","Calculating from your current profile…")}</p>}
    {!resultsRequested&&<section className="allocation-workbench">
      <aside className="allocation-capital"><span className="allocation-eyebrow">{t("MỖI KHOẢN TIỀN, MỘT VAI TRÒ","EVERY AMOUNT HAS A PURPOSE")}</span><h2>{t("Đầu tư từ phần tiền bạn có thể dành dài hạn.","Invest from capital you can commit long-term.")}</h2><p>{t("Giữ riêng khoản cần dùng trước, rồi tìm cách chia phần còn lại phù hợp với mục tiêu nghỉ hưu.","Protect near-term needs before allocating the remainder.")}</p><dl>
        <div><dt>{t("Tổng vốn đang xét","Capital considered")}</dt><dd>{money(c?.investableLiquidAssets)}</dd></div>
        <div><dt><Explain term="emergencyReserve">{t("Dự phòng cần giữ","Required reserve")}</Explain></dt><dd>{money(c?.requiredEmergencyReserve)}</dd></div>
        <div><dt><Explain term="nearTermGoals">{t("Mục tiêu gần hạn","Near-term goals")}</Explain></dt><dd>{money(c?.nearTermGoalsPresentValue)}</dd></div>
        <div className="allocation-capital-total"><dt><Explain term="growthCapital">{c?.growthCapital?.startsWith("-")?t("Còn thiếu để giữ đủ vốn","Protected capital shortfall"):t("Còn lại cho dài hạn","Remaining for the long term")}</Explain></dt><dd>{money(c?.growthCapital)}</dd></div>
      </dl><p>{t("Số tạm tính theo thông tin hiện có; kết quả sẽ cập nhật khi bạn hoàn tất.","Preliminary values from current information; results update when you finish.")}</p><footer><strong>{t("3 bước, dùng lại hồ sơ đã khai","3 steps using your profile")}</strong><p>{t("Không cần nhập lại thu nhập và toàn bộ tài sản.","No need to re-enter income and assets.")}</p></footer></aside>
      {wizard}
    </section>}
    {resultsRequested&&applied&&<p role="status" className="allocation-applied">{t("Đã dùng phương án này trong bản xem trước của kế hoạch. Mở Kế hoạch để xem mức cần góp và lưu khi sẵn sàng.","This allocation is now used in your plan preview. Open your plan to review contributions and save when ready.")} <Link to="/user/plan">{t("Xem kế hoạch nghỉ hưu →","View retirement plan →")}</Link></p>}
    {resultsRequested&&!applied&&applyError&&modal===null&&<p role="alert">{applyError}</p>}
    {resultsRequested&&r&&<AllocationResults publishedOpen={publishedOpen} onPublishedToggle={setPublishedOpen} data={r} planInput={p.planInput??null} workspaceInput={{expectedProfileRevision:r.profileRevision,policyVersionId:p.policy.id,answers:p.policy.data.questions.map(q=>({questionId:q.id,choiceId:p.answers[q.id]})),liquidityNeedMonths:p.months,endMonth:p.endMonth,retirementMonth:p.retirementMonth,...(template?{templateId:template.id}:{})}} onChoose={useInPreview} policy={p.policy} retirementMonth={p.retirementMonth} complete={p.complete} usable={Boolean(usable)} loading={p.loading} select={p.select} onApply={()=>{setChosen(null);setApplyError("");setModal("apply");}} onRebalance={()=>setModal("rebalance")} explain={explain}/>}
    {resultsRequested&&<details className="allocation-editor-disclosure"><summary>{t("Chỉnh thông tin phân bổ","Edit allocation inputs")}<small>{t("Nguồn vốn, mức chịu lỗ, mục tiêu và thời gian tính","Capital, loss limit, goals and projection horizon")}</small></summary>{wizard}</details>}
    <ResponsiveDialog open={modal!==null} title={modal==="apply"?t("Dùng phương án này trong kế hoạch?","Use this portfolio in the plan?"):modal==="rebalance"?t("Đề xuất tái cân bằng","Rebalance proposal"):t("Cơ sở phân bổ vốn","Capital allocation basis")} className="user-workspace-dialog allocation-dialog" onClose={()=>setModal(null)}>
      {modal==="apply"?<><p>{t("Phương án sẽ được chuyển sang bản nháp kế hoạch để tính lại. Bạn kiểm tra kết quả rồi lưu hoặc áp dụng kế hoạch tại đó.","This changes the plan draft for recalculation. Review the results before saving or applying the plan there.")}</p><p>{t("Vốn dài hạn dùng trong kế hoạch:","Long-term capital used in the plan:")} <strong>{money(chosen?.allocationFunding?c?.growthCapital:c?.retirementLiquidAssets)}</strong>. {t("Bạn có thể đổi phần vốn này trong Tài chính.","Review Finances to change this capital allocation.")}</p>{applyError&&<p role="alert">{applyError}</p>}<button className="overview-button primary" disabled={!canApply} onClick={()=>{if(!canApply||(!template&&!chosen)||!r)return;try{updateDraft({...p.planInput,expectedProfileRevision:r.profileRevision,policyVersionId:p.policy.id,templateId:chosen?.templateId??template!.id,customAllocation:chosen?.customAllocation??null,allocationFunding:chosen?.allocationFunding??null,answers:p.policy.data.questions.map(q=>({questionId:q.id,choiceId:p.answers[q.id]})),liquidityNeedMonths:p.months,endMonth:p.endMonth});setModal(null);navigate("/user/plan");}catch{setApplyError(t("Chưa giữ được bản nháp trên thiết bị. Hãy cho phép lưu trữ rồi thử lại.","Could not store the draft on this device. Allow browser storage and retry."));}}}>{t("Xác nhận dùng trong bản nháp","Confirm draft selection")}</button></>:modal==="rebalance"?<RebalanceProposal templates={p.policy.data.templates} basis={template&&r&&p.retirementMonth?{policyVersionId:p.policy.id,templateId:template.id,month:r.valuationDate.slice(0,7),retirementMonth:p.retirementMonth}:null}/>:<><p>{modal==="capital"?t("Chỉ xét tài sản thanh khoản có giá trị, tỷ lệ sở hữu, phần dành cho từng mục đích và thời điểm khả dụng đã xác nhận; không đưa nhà ở hoặc tài sản đang khóa vào vốn hiện tại.","Only confirmed owned liquid assets available at valuation are considered; housing and locked assets are excluded."):modal==="reserve"?t("Chi thiết yếu trong tháng định giá nhân với số tháng dự phòng bạn đã chọn (6–12 tháng). Khi chưa chọn riêng, dùng 6 tháng; độ ổn định thu nhập không tự đổi số tháng dự phòng.","Essential spending at valuation times your chosen reserve months (6–12). Until separately chosen, uses 6 months; income stability does not change reserve months."):t("Chỉ mục tiêu đến hạn trong 60 tháng được tách theo giá trị hiện tại từ giả định đã công bố. Mục tiêu xa hơn giữ để theo dõi. Nhu cầu lũy kế 1/3/5 năm không được cộng thêm lần nữa.","Goals due within 60 months are reserved at present value using published assumptions. Longer goals remain visible. Cumulative 1/3/5 year needs are not added again.")}</p>{modal==="goals"&&c?.goals.map(goal=><p key={goal.id}>{goal.label} · {goal.dueMonth.slice(5)}/{goal.dueMonth.slice(0,4)} ·{goal.treatment==="RESERVED"?money(goal.presentValue):t("Mục tiêu dài hạn","Long-term goal")}</p>)}<Link to={modal==="goals"?"/user/profile?section=constraints":modal==="reserve"?"/user/profile?section=cashflow":"/user/profile?section=assets"}>{t("Kiểm tra thông tin đã khai →","Review declared information →")}</Link></>}
    </ResponsiveDialog>
  </>;
}
