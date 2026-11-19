import type { RetirementPreviewInput } from "../services/retirement";
import type { CustomAllocation } from "../services/portfolios";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useI18n } from "../i18n";
import { useAuth } from "../context/AuthContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { Decimal } from "../utils/decimal";
import type { PortfolioPolicyDetail } from "../services/portfolios";
import { confirmAllocation, getAllocationConfirmation, type AllocationWorkspaceResult } from "../services/allocationWorkspace";
import AllocationResults from "../components/AllocationResults";
import { resolveLossTolerance } from "../utils/lossTolerance";
import AllocationLossLimit from "../components/AllocationLossLimit";
import { AllocationCapitalInput, AllocationSpendingInputs, AllocationPersonalPlan } from "../components/AllocationPersonalInputs";
import { AllocationGoalsQuestion, AllocationReserveMonths } from "../components/AllocationProfileEdits";
import { financeMoney } from "../utils/financeHubSummary";



import { RebalanceProposal } from "../components/retirement/RiskAnalysis";
import ResponsiveDialog from "../components/ResponsiveDialog";
import ProfileFormattedInput from "../components/ProfileFormattedInput";
import { DiscoveryError } from "../components/DiscoveryParts";
import { Explain } from "../components/explanations/ExplainMode";
import "../components/user-workspace-dialogs.css";
import "../pages/financial-cashflow.css";
import "./allocation-workspace.css";

type Props={lossInputMode?:"PERCENT"|"AMOUNT";planInput?:RetirementPreviewInput|null;confirmLoss:()=>void;saveLoss:(kind:"PERCENT"|"AMOUNT",value:string)=>void;riskError?:string;savingRisk:boolean;profileRevision:number;retirementExpense:string|null;lossPercent:string|null;lossAmount:string|null;policy:PortfolioPolicyDetail;data:AllocationWorkspaceResult|null;loading:boolean;error?:string;retry:()=>void;selected:string;months:number;setMonths:(n:number)=>void;endMonth:string;setEndMonth:(s:string)=>void;retirementMonth?:string;answers:Record<string,string>;complete:boolean;openRisk:()=>void};
export default function AllocationWorkspace(p:Props) {
  const en=useI18n().language==="en", t=(v:string,e:string)=>en?e:v;
  const navigate=useNavigate(), {updateDraft}=useRetirementPlan();
  const [applyError,setApplyError]=useState("");
  const [reservePending,setReservePending]=useState(false);
  // "3 steps done" is remembered on the server until the financial profile changes (revision bump).
  // A per-tab hint avoids flashing the wizard while the server answer loads.
  const {user}=useAuth();
  const hintKey=`anhuu:allocation-confirmed:${user?.id??""}:${p.profileRevision}`;
  const readHint=()=>{try{return sessionStorage.getItem(hintKey)==="1";}catch{return false;}};
  const writeHint=(on:boolean)=>{try{if(on)sessionStorage.setItem(hintKey,"1");else sessionStorage.removeItem(hintKey);}catch{/* storage may be unavailable */}};
  const [resultsRequested,setResultsRequestedState]=useState(readHint);
  const setResultsRequested=(value:boolean)=>{
    setResultsRequestedState(value);writeHint(value);
    if(value)void confirmAllocation(p.profileRevision).catch(()=>{/* the results still show for this visit */});
  };
  const [applied,setApplied]=useState(false);
  useEffect(()=>{
    let active=true;setApplied(false);setResultsRequestedState(readHint());
    getAllocationConfirmation().then(row=>{if(!active)return;const ok=row.confirmed&&row.profileRevision===p.profileRevision;writeHint(ok);setResultsRequestedState(ok);}).catch(()=>{});
    return()=>{active=false;};
  },[hintKey]);
  const [step,setStep]=useState(0),[modal,setModal]=useState<"capital"|"reserve"|"goals"|"growth"|null>(null);
  const r=p.data,c=r?.capital, portfolio=r?.portfolio, money=(s:string|null|undefined)=>financeMoney(s??null,en);
  const limit=resolveLossTolerance(c?.growthCapital??null,p.lossAmount,p.lossPercent,p.lossInputMode);
  const template=p.policy.data.templates.find(row=>row.id===portfolio?.assessment.selectedTemplateId);
  const inflation=portfolio?.scenarios.find(row=>row.kind==="BASE")?.rows[0]?.inflationAnnualPercent;
  const decimalPercent=(value:string|undefined)=>value===undefined?"—":new Intl.NumberFormat(en?"en-GB":"vi-VN",{maximumFractionDigits:2}).format(Number(value))+"%";
  const usable=p.complete&&!p.loading&&portfolio?.status==="READY"&&c?.status==="READY"&&r?.loss.status==="WITHIN_LIMIT";

  const explain=(kind:"capital"|"reserve"|"goals"|"growth",text:string)=> <button className="allocation-help" aria-label={`${t("Giải thích","Explain")}: ${text}`} onClick={()=>setModal(kind)}>i</button>;

  useEffect(()=>{setModal(null);},[p.profileRevision,p.policy.id,p.months,p.endMonth,p.retirementMonth,p.selected,JSON.stringify(p.answers)]);
  const profileCapital=c?.retirementLiquidAssets!=null&&c.declaredEmergencyReserve!=null&&c.declaredOtherGoalsCapital!=null?{retirement:c.retirementLiquidAssets,reserve:c.declaredEmergencyReserve,otherGoals:c.declaredOtherGoalsCapital,total:new Decimal(c.retirementLiquidAssets).plus(c.declaredEmergencyReserve).plus(c.declaredOtherGoalsCapital).toString()}:null;
  const shortfall=c?.growthCapital?.startsWith("-")??false;
  const protectedCapital=c?.requiredEmergencyReserve!=null&&c.nearTermGoalsPresentValue!=null?new Decimal(c.requiredEmergencyReserve).plus(c.nearTermGoalsPresentValue).toString():null;
  const growthPositive=c?.growthCapital!=null&&!c.growthCapital.startsWith("-")&&Number(c.growthCapital)>0;
  // What is still missing to determine long-term capital, in the user's terms (never "Chưa xác định").
  const goTo=(id:string)=>{setStep(0);window.setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"center"}),50);};
  const missing=(()=>{
    const out=new Map<string,{text:string;action:()=>void}>();
    for(const issue of c?.issues??[]){
      if(issue.code==="GOALS_REQUIRED")out.set("goals",{text:t("Trả lời câu “Trong tương lai bạn có khoản lớn cần dùng không?”","Answer “Do you have a large expense coming up?”"),action:()=>goTo("allocation-goals-question")});
      else if(issue.code.startsWith("GOAL_")||issue.code.startsWith("DEPOSIT_"))out.set("goal-detail",{text:t("Bổ sung số tiền và tháng cần cho từng khoản lớn","Complete the amount and month of each large expense"),action:()=>goTo("allocation-goals-question")});
      else if(issue.path.startsWith("expenses"))out.set("expenses",{text:t("Khai chi tiêu thiết yếu hiện nay","Enter your current essential spending"),action:()=>navigate("/user/profile?section=cashflow")});
      else if(issue.path.includes("assets"))out.set("assets",{text:t("Kiểm tra tài sản đã khai: giá trị, tỷ lệ sở hữu, thời điểm dùng được","Check declared assets: value, ownership and availability"),action:()=>navigate("/user/profile?section=assets")});
      else out.set("other",{text:t("Kiểm tra lại hồ sơ tài chính","Review your financial profile"),action:()=>navigate("/user/profile")});
    }
    return [...out.values()];
  })();
  const pending=(value:string|null|undefined,label:string)=>value==null?<span className="allocation-pending">{label}</span>:money(value);
  const savedBand=p.policy.data.riskBands.find(b=>b.id===portfolio?.assessment.riskBandId);
  // Keep the published band explanation without showing the raw questionnaire score.
  const bands=[...p.policy.data.riskBands].sort((a,b)=>a.minScore-b.minScore), bandIndex=savedBand?bands.indexOf(savedBand):-1, bandMiddle=(bands.length-1)/2;
  const bandNote=bandIndex<0?null:bandIndex===0?t("Ưu tiên giữ vốn, chấp nhận ít biến động.","Puts protecting capital first and accepts little volatility."):bandIndex===bands.length-1?t("Chấp nhận biến động lớn để hướng tới tăng trưởng dài hạn.","Accepts large swings in pursuit of long-term growth."):bandIndex<bandMiddle?t("Nghiêng về an toàn, chấp nhận biến động vừa phải.","Leans towards safety and accepts moderate volatility."):bandIndex>bandMiddle?t("Nghiêng về tăng trưởng, chấp nhận biến động khá lớn.","Leans towards growth and accepts sizeable volatility."):t("Cân đối giữa giữ vốn và tăng trưởng.","Balances protecting capital with growth.");
  const surveyStatus=<p role="status" className="allocation-survey-status">{p.complete?t("Đang sử dụng kết quả khảo sát rủi ro ban đầu.","Using your initial risk survey results."):t("Chưa có kết quả khảo sát rủi ro hợp lệ cho chính sách hiện tại.","No valid saved risk survey results are available for this policy.")}{savedBand&&<> <strong>{savedBand.label}</strong>{bandNote&&<span className="allocation-survey-note">{bandNote}</span>}</>}{!p.complete&&<> <button className="remaining-text" onClick={p.openRisk}>{t("Trả lời câu hỏi đánh giá","Complete suitability questions")}</button></>}</p>;
  // Explanation dialog: the calculation as rows (customer 18/11/2026: one long paragraph was hard to follow).
  type ExplainRow={op?:"+"|"−"|"×";label:string;hint?:string;value:string};
  const calcBody=(rows:ExplainRow[],total:{label:string;value:string;tone?:"ok"|"short"}|null,note:string,link:{to:string;label:string})=><div className="allocation-explain">
    <ol className="allocation-explain-rows">{rows.map((row,i)=><li key={i}><span className="allocation-explain-op" aria-hidden="true">{row.op??""}</span><span className="allocation-explain-label">{row.label}{row.hint&&<small>{row.hint}</small>}</span><strong>{row.value}</strong></li>)}</ol>
    {total&&<div className="allocation-explain-total" data-tone={total.tone}><span>= {total.label}</span><strong>{total.value}</strong></div>}
    <p className="allocation-explain-note">{note}</p>
    <Link className="allocation-explain-link" to={link.to}>{link.label}</Link>
  </div>;
  const reviewLabel=t("Kiểm tra thông tin đã khai →","Review declared information →");
  const customTotal=c?.investableLiquidAssets!=null&&profileCapital&&c.investableLiquidAssets!==profileCapital.total;
  const explainBody=modal==="growth"?calcBody([
      {label:t("Tổng số tiền","Total amount"),value:money(c?.investableLiquidAssets)},
      {op:"−",label:t("Dự phòng cần giữ","Required reserve"),value:money(c?.requiredEmergencyReserve)},
      {op:"−",label:t("Khoản cần dùng trong 5 năm","Needed within 5 years"),value:money(c?.nearTermGoalsPresentValue)},
    ],{label:shortfall?t("Còn thiếu","Shortfall"):t("Vốn dài hạn để đầu tư","Long-term capital"),value:money(shortfall?c?.growthCapital?.slice(1):c?.growthCapital),tone:shortfall?"short":"ok"},
    shortfall?t("Tiền hiện có chưa đủ giữ dự phòng và khoản cần dùng sớm. Có thể tăng tổng vốn, giảm số tháng dự phòng hoặc xem lại khoản cần dùng.","Current money does not cover the reserve and near-term needs. Raise capital, lower reserve months or review near-term needs.")
      :t("Đây là phần vốn được đem đi phân bổ đầu tư dài hạn. Dự phòng và khoản cần dùng sớm được giữ riêng.","This is the capital invested for the long term. The reserve and near-term needs are kept aside."),
    {to:"/user/profile?section=assets",label:reviewLabel})
  :modal==="capital"?calcBody(customTotal||!profileCapital?[
      {label:customTotal?t("Tổng vốn bạn tự khai ở bước 1","Total you declared in step 1"):t("Tổng số tiền","Total amount"),hint:customTotal?t(`Số trong hồ sơ: ${money(profileCapital?.total)}`,`Profile figure: ${money(profileCapital?.total)}`):undefined,value:money(c?.investableLiquidAssets)},
    ]:[
      {label:t("Tiền dành cho hưu trí","Retirement money"),value:money(profileCapital.retirement)},
      {op:"+",label:t("Quỹ dự phòng","Emergency reserve"),value:money(profileCapital.reserve)},
      {op:"+",label:t("Tiền cho mục tiêu khác","Other goals capital"),value:money(profileCapital.otherGoals)},
    ],customTotal||!profileCapital?null:{label:t("Tổng số tiền","Total amount"),value:money(profileCapital.total)},
    t("Chỉ tính tài sản dễ rút ra tiền, đúng phần bạn sở hữu và đã dùng được. Nhà ở và tài sản đang bị khóa không được tính.","Only liquid assets you own and can use now are counted. Housing and locked assets are excluded."),
    {to:"/user/profile?section=assets",label:reviewLabel})
  :modal==="reserve"?calcBody([
      {label:t("Chi thiết yếu mỗi tháng","Essential spending per month"),value:money(c?.essentialMonthlyExpense)},
      {op:"×",label:t("Số tháng dự phòng","Reserve months"),hint:t("Bạn chọn từ 6 đến 12 tháng","You choose 6 to 12 months"),value:`${c?.reserveMonths??"—"} ${t("tháng","months")}`},
    ],{label:t("Dự phòng cần giữ","Required reserve"),value:money(c?.requiredEmergencyReserve)},
    t("Khi chưa chọn, hệ thống dùng 6 tháng. Khoản này được giữ riêng, không đem đầu tư.","Until chosen, 6 months is used. This amount is kept aside, not invested."),
    {to:"/user/profile?section=cashflow",label:reviewLabel})
  :modal==="goals"?calcBody(c?.goals.length?c.goals.map(goal=>({label:goal.label,hint:`${t("Cần vào","Due")} ${goal.dueMonth.slice(5)}/${goal.dueMonth.slice(0,4)}`,value:goal.treatment==="RESERVED"?money(goal.presentValue):t("Dài hạn, chưa giữ riêng","Long-term, not reserved")})):[{label:t("Chưa có khoản lớn nào","No large expenses yet"),value:"0 ₫"}],
    {label:t("Giữ riêng cho 5 năm tới","Kept aside for the next 5 years"),value:money(c?.nearTermGoalsPresentValue)},
    t("Chỉ khoản cần trong 60 tháng tới được giữ riêng, tính theo giá trị hôm nay. Khoản xa hơn vẫn được theo dõi nhưng không trừ vào vốn hiện tại.","Only needs within 60 months are kept aside, at today's value. Later goals stay visible but are not deducted now."),
    {to:"/user/profile?section=constraints",label:reviewLabel})
  :null;
  const wizard=<div className="allocation-wizard">
    <nav className="allocation-steps" aria-label={t("Các bước phân bổ","Allocation steps")}>{[t("Tiền của bạn","Your capital"),t("Mức chịu giảm","Loss tolerance"),t("Kiểm tra và tính","Review and calculate")].map((name,i)=><button type="button" key={name} aria-current={step===i?"step":undefined} className={step===i?"is-active":""} disabled={reservePending&&i!==step} onClick={()=>setStep(Math.min(i,step+1))}><span>{i+1}</span>{name}</button>)}</nav>
    <div className="allocation-wizard-body">
      <h2>{step===0?t("Tiền của bạn","Your capital"):step===1?t("Mức chịu giảm","Loss tolerance"):t("Kiểm tra và tính","Review and calculate")}</h2>
      <p className="allocation-step-desc">{step===0?t("Xác định tổng số tiền hiện có và tách các khoản cần bảo vệ trước khi bắt đầu đầu tư.","Define your available capital and protect essential reserves before investing."):step===1?t("Chọn mức sụt giảm tối đa bạn chấp nhận để định hình danh mục phù hợp.","Select the maximum loss tolerance you can accept to shape your portfolio."):t("Rà soát tổng thể phương án phân bổ và kiểm tra tính khả thi trước khi áp dụng.","Review overall allocation strategy and verify feasibility before applying.")}</p>
      {step===0?<>
        <AllocationCapitalInput en={en} suggested={profileCapital}/>
        <AllocationSpendingInputs en={en} only="current" current={c?.essentialMonthlyExpense??null} retirement={p.retirementExpense} endMonth={p.endMonth} />
        <AllocationReserveMonths months={c?.reserveMonths??null} en={en} essentialExpense={c?.essentialMonthlyExpense??null} onPendingChange={setReservePending}/>
        {/* Asked in the initial survey; shown here only while still unanswered (older profiles). */}
        {c?.issues?.some(i=>i.code==="GOALS_REQUIRED")&&<AllocationGoalsQuestion en={en} minMonth={r?.valuationDate.slice(0,7)} id="allocation-goals-question"/>}
        <details className="allocation-disclosure"><summary>{t("Tôi có khoản để riêng ngoài quỹ nghỉ hưu","I have capital set aside outside my retirement fund")}</summary><dl className="allocation-protection"><div><dt>{t("Dự phòng đã để riêng","Separate emergency reserve")}</dt><dd>{money(c?.declaredEmergencyReserve)}</dd></div><div><dt>{t("Tiền đã dành cho mục tiêu khác","Separate goal capital")}</dt><dd>{money(c?.declaredOtherGoalsCapital)}</dd></div></dl><Link to="/user/profile?section=assets">{t("Xem và sửa khoản để riêng","Review and edit separate capital")}</Link></details>
      </>:step===1?<>
        <AllocationSpendingInputs en={en} only="retirement" current={c?.essentialMonthlyExpense??null} retirement={p.retirementExpense} endMonth={p.endMonth} />
        <dl className="allocation-protection"><div><dt><Explain term="essentialExpenses">{t("Chi thiết yếu hiện nay","Current essential spending")}</Explain></dt><dd>{money(c?.essentialMonthlyExpense)} / {t("tháng","month")}</dd></div><div><dt><Explain term="expenseToday">{t("Chi thiết yếu khi nghỉ hưu","Retirement spending")}</Explain></dt><dd>{money(p.retirementExpense)} / {t("tháng","month")}</dd></div><div><dt><Explain term="emergencyReserve">{t("Dự phòng còn thiếu","Reserve shortfall")}</Explain></dt><dd>{money(c?.emergencyShortfall)}</dd></div></dl>
        <AllocationLossLimit growth={c?.growthCapital??null} amount={p.lossAmount} percent={p.lossPercent} inputMode={p.lossInputMode} saving={p.savingRisk||p.loading} save={p.saveLoss} en={en} error={p.riskError} onFixCapital={()=>setStep(0)}/>
        {!p.complete&&surveyStatus}
        {growthPositive&&(p.lossAmount!==null)!==(p.lossPercent!==null)&&<button type="button" className="overview-button primary" disabled={p.savingRisk||p.loading} onClick={p.confirmLoss}>{p.savingRisk?t("Đang quy đổi…","Converting…"):t("Quy đổi giới hạn đã khai","Convert declared loss limit")}</button>}

      </>:<>
        <dl className="allocation-review-strip">{([
          [t("Vốn dài hạn để đầu tư","Long-term capital"),money(c?.growthCapital),0,"growthCapital"],
          [t("Giữ riêng, không đầu tư","Protected capital"),money(protectedCapital),0],
          [t("Giới hạn giảm","Loss limit"),`${money(limit.amount)}${limit.percent!==null?` · ${limit.percent.replace(".",",")}%`:""}`,1,"lossTolerance"],
          [t("Chi thiết yếu khi nghỉ hưu","Retirement spending"),`${money(p.retirementExpense)} / ${t("tháng","month")}`,1,"expenseToday"],
        ] as Array<[string,string,number,string?]>).map(([label,value,target,term])=><div key={label}><dt>{term?<Explain term={term}>{label}</Explain>:label}</dt><dd>{value}</dd><button type="button" className="remaining-text" aria-label={`${t("Sửa","Edit")} ${label}`} onClick={()=>setStep(Number(target))}>{t("Sửa","Edit")}</button></div>)}</dl>
        {!p.complete&&surveyStatus}
        {!!c?.goals.length&&<dl className="allocation-protection">{c.goals.map(goal=><div key={goal.id}><dt>{goal.label} · {goal.dueMonth.slice(5)}/{goal.dueMonth.slice(0,4)}</dt><dd>{goal.treatment==="RESERVED"?money(goal.presentValue):t("Mục tiêu dài hạn","Long-term goal")}</dd></div>)}</dl>}
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
  const useInPreview=(selection:{templateId:string;customAllocation?:CustomAllocation;allocationFunding?:"PROTECTED_CAPITAL_V1"})=>{
    if(!r||!p.complete)return;
    try{
      updateDraft({...p.planInput,expectedProfileRevision:r.profileRevision,policyVersionId:p.policy.id,templateId:selection.templateId,customAllocation:selection.customAllocation??null,allocationFunding:selection.allocationFunding??null,answers:p.policy.data.questions.map(q=>({questionId:q.id,choiceId:p.answers[q.id]})),liquidityNeedMonths:p.months,endMonth:p.endMonth});
      setApplyError("");setApplied(true);
    }catch{setApplied(false);setApplyError(t("Chưa giữ được bản nháp trên thiết bị. Hãy cho phép lưu trữ rồi thử lại.","Could not store the draft on this device. Allow browser storage and retry."));}
  };
  return <>
    <header className="allocation-page-head"><div><span className="allocation-eyebrow">{t("KẾ HOẠCH ĐẦU TƯ CỦA BẠN","YOUR INVESTMENT PLAN")}</span><h1>{t("Phân bổ tài sản","Asset allocation")}</h1><p>{t("Biết tiền đi đâu. Hiểu vì sao lựa chọn đó phù hợp.","Know where your money goes and why the choice fits.")}</p></div><button className="overview-button secondary" onClick={p.openRisk}>{t("Khả năng chịu rủi ro →","Risk tolerance →")}</button></header>
    {p.error&&<DiscoveryError message={p.error} retry={p.retry}/>}
    {p.loading&&!p.data&&<div className="skeleton-card" role="status" aria-busy="true" aria-label={t("Đang tính từ hồ sơ hiện hành","Calculating from your current profile")}><span className="skeleton skeleton-medium"/><span className="skeleton skeleton-full"/><span className="skeleton skeleton-small"/></div>}{p.loading&&p.data&&<span className="sr-only" role="status">{t("Đang cập nhật số liệu…","Refreshing figures…")}</span>}
    {!resultsRequested&&<section className="allocation-workbench">
      <aside className="allocation-capital"><span className="allocation-eyebrow">{t("MỖI KHOẢN TIỀN, MỘT VAI TRÒ","EVERY AMOUNT HAS A PURPOSE")}</span><h2>{t("Đầu tư từ phần tiền bạn có thể dành dài hạn.","Invest from capital you can commit long-term.")}</h2><dl>
        <div><dt>{t("Tổng số tiền","Total amount")}{explain("capital",t("Tổng số tiền","Total amount"))}</dt><dd>{pending(c?.investableLiquidAssets,t("Chờ thông tin","Pending"))}</dd></div>
        <div><dt><Explain term="emergencyReserve">{t("Dự phòng cần giữ","Required reserve")}</Explain>{explain("reserve",t("Dự phòng cần giữ","Required reserve"))}</dt><dd>{pending(c?.requiredEmergencyReserve,t("Chờ thông tin","Pending"))}</dd></div>
        <div><dt><Explain term="nearTermGoals">{t("Mục tiêu gần hạn","Near-term goals")}</Explain>{explain("goals",t("Mục tiêu gần hạn","Near-term goals"))}</dt><dd>{pending(c?.nearTermGoalsPresentValue,t("Chờ câu trả lời","Waiting for your answer"))}</dd></div>
        <div className="allocation-capital-total"><dt><Explain term="growthCapital">{shortfall?t("Còn thiếu để giữ đủ dự phòng và mục tiêu gần hạn","Short of covering reserve and near-term goals"):t("Còn lại cho dài hạn","Remaining for the long term")}</Explain>{explain("growth",shortfall?t("Còn thiếu","Shortfall"):t("Còn lại cho dài hạn","Remaining for the long term"))}</dt><dd>{c?.growthCapital==null?<span className="allocation-pending">{t("Cần thêm thông tin","More information needed")}</span>:money(shortfall?c.growthCapital.slice(1):c.growthCapital)}</dd>{c?.growthCapital==null&&missing.length>0&&<ul className="allocation-aside-missing">{missing.map(m=><li key={m.text}><button type="button" onClick={m.action}>{m.text} →</button></li>)}</ul>}{shortfall&&<p className="allocation-shortfall-note">{t("Tổng vốn đang xét chưa đủ để giữ dự phòng và mục tiêu gần hạn, nên chưa còn tiền cho đầu tư dài hạn.","Capital considered does not yet cover the reserve and near-term goals, so nothing is left for long-term investing.")}</p>}</div>
      </dl><p>{t("Số tạm tính theo thông tin hiện có; kết quả sẽ cập nhật khi bạn hoàn tất.","Preliminary values from current information; results update when you finish.")}</p></aside>
      {wizard}
    </section>}
    {resultsRequested&&applied&&<p role="status" className="allocation-applied">{t("Đã dùng phương án này trong bản xem trước của kế hoạch. Mở Kế hoạch để xem mức cần góp và lưu khi sẵn sàng.","This allocation is now used in your plan preview. Open your plan to review contributions and save when ready.")} <Link to="/user/plan">{t("Xem kế hoạch nghỉ hưu →","View retirement plan →")}</Link></p>}
    {resultsRequested&&!applied&&applyError&&modal===null&&<p role="alert">{applyError}</p>}
    {resultsRequested&&r&&<AllocationResults data={r} planInput={p.planInput??null} workspaceInput={{expectedProfileRevision:r.profileRevision,policyVersionId:p.policy.id,answers:p.policy.data.questions.map(q=>({questionId:q.id,choiceId:p.answers[q.id]})),liquidityNeedMonths:p.months,endMonth:p.endMonth,retirementMonth:p.retirementMonth,...(template?{templateId:template.id}:{})}} onChoose={useInPreview} policy={p.policy} retirementMonth={p.retirementMonth} complete={p.complete} usable={Boolean(usable)} loading={p.loading} explain={explain}/>}
    {resultsRequested&&<details className="allocation-editor-disclosure"><summary>{t("Sửa thông tin phân bổ","Edit allocation inputs")}</summary>{wizard}</details>}
    <ResponsiveDialog open={modal!==null} title={modal==="capital"?t("Tổng số tiền được tính thế nào?","How is capital considered calculated?"):modal==="reserve"?t("Dự phòng cần giữ được tính thế nào?","How is the reserve calculated?"):modal==="goals"?t("Khoản cần dùng trong 5 năm","Needed within 5 years"):t("Vốn dài hạn để đầu tư được tính thế nào?","How is long-term capital calculated?")} className="user-workspace-dialog allocation-dialog" onClose={()=>setModal(null)}>
      {explainBody}
    </ResponsiveDialog>
  </>;
}
