import { initialPlanSelection } from "../services/initialPlanSelection";
import type { RetirementPreviewInput } from "../services/retirement";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useNotification } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useFinancialProfile } from "../context/FinancialProfileContext";
import { useRetirementPlan } from "../context/RetirementPlanContext";
import { useI18n } from "../i18n";
import { useDiscoveryQuery } from "../hooks/useDiscoveryQuery";
import { fetchUserPortfolioPolicies, fetchUserPortfolioPolicyDetail } from "../services/portfolios";
import { previewAllocation, saveAllocationTolerance, type LossLimitInput } from "../services/allocationWorkspace";
import { readRiskDraft } from "../services/riskDraft";
import { policyQuestionPrompt } from "../services/policyQuestionLabels";
import { selectionForCurrentProfile } from "../services/profilePlanSelection";
import { financeMoney } from "../utils/financeHubSummary";
import { DiscoveryError } from "../components/DiscoveryParts";
import AllocationWorkspace from "./AllocationWorkspace";
import "./risk-portfolio.css";
import "./allocation-workspace.css";
export default function RiskPortfolioPage() {
  const {user}=useAuth(), {language}=useI18n(), {v2Profile,profileRevision,reloadProfile,updateProfileV2,loading:loadingProfile,loadError}=useFinancialProfile();
  const {currentVersion,draftSelection,loadingPlans,updateDraft}=useRetirementPlan(), {notify}=useNotification();
  const navigate=useNavigate();
  const [searchParams,setSearchParams]=useSearchParams(), isRiskSubView=searchParams.get("section")==="risk";
  const baseline=currentVersion?.preview.selection;
  const selection=baseline&&v2Profile?selectionForCurrentProfile(baseline,draftSelection,v2Profile,profileRevision):{
    ...baseline,...draftSelection,
    endMonth:draftSelection?.endMonth??v2Profile?.retirementGoal?.endMonth??baseline?.endMonth,
    monthlyExpenseToday:draftSelection?.monthlyExpenseToday??v2Profile?.retirementGoal?.monthlyExpenseToday??baseline?.monthlyExpenseToday??v2Profile?.retirementSurvey?.monthlyExpenseToday,
  };
  const [policyAttempt,setPolicyAttempt]=useState(0);
  const [attempt,setAttempt]=useState(0), [answers,setAnswers]=useState<Record<string,string>>({}), [selectedTemplateId,setSelectedTemplateId]=useState(selection.templateId??"");
  const [liquidityNeedMonths,setLiquidityNeedMonths]=useState(selection.liquidityNeedMonths||6), [endMonth,setEndMonth]=useState(selection.endMonth??"");
  const [reactionChoice,setReactionChoice]=useState<"sell"|"hold"|"buy">("hold"), [lossMode,setLossMode]=useState<"percent"|"amount"|"both">("percent"), [lossPercent,setLossPercent]=useState(""), [lossAmount,setLossAmount]=useState(""), [pendingLimit,setPendingLimit]=useState<LossLimitInput|null>(null);
  const [savingRisk,setSavingRisk]=useState(false), [riskError,setRiskError]=useState("");
  const policies=useDiscoveryQuery(`${user?.id}:${loadingPlans}:${selection.policyVersionId}:${v2Profile?.retirementSurvey?.policyVersionId}:${policyAttempt}`,async()=>{
    if(loadingPlans) return null;
    const fresh=policyAttempt>0, knownId=selection.policyVersionId??v2Profile?.retirementSurvey?.policyVersionId;
    // A known version's detail does not depend on the list: fetch both at once.
    const [list,known]=await Promise.all([fetchUserPortfolioPolicies(1,50,fresh),// A remembered version may have been unpublished since; fall back to the list instead of failing the page.
    knownId?fetchUserPortfolioPolicyDetail(knownId,fresh).catch(()=>null):null]);
    if(!list.items.length) return null;
    // Always work on the latest published policy; saved plan versions stay pinned server-side. Answers carry over below.
    return known&&known.id===list.items[0].id?known:fetchUserPortfolioPolicyDetail(list.items[0].id,fresh);
  });
  useEffect(()=>{if(!loadingPlans&&!loadingProfile){setEndMonth(selection.endMonth??"");setLiquidityNeedMonths(selection.liquidityNeedMonths||6);}},[loadingPlans,loadingProfile,currentVersion?.id,user?.id,selection.endMonth,selection.liquidityNeedMonths]);
  // Keep the loaded policy while it refreshes, so saving in the wizard never unmounts it (step reset).
  const policyDetail=policies.data??(policies.loading?policies.previous:null)??null, questions=policyDetail?.data.questions??[];
  useEffect(()=>{
    if(!policyDetail||!user)return;
    const stored=readRiskDraft(user.id,policyDetail.id,questions), source=selection.policyVersionId===policyDetail.id?selection.answers:v2Profile?.retirementSurvey?.policyVersionId===policyDetail.id?v2Profile.retirementSurvey.answers
      // A newer policy version: carry answers whose question and choice still exist (filtered below), so the survey is not repeated.
      :selection.answers?.length?selection.answers:v2Profile?.retirementSurvey?.answers;
    setAnswers(source?Object.fromEntries(source.filter(a=>questions.some(q=>q.id===a.questionId&&q.choices.some(c=>c.id===a.choiceId))).map(a=>[a.questionId,a.choiceId])):stored);
    setSelectedTemplateId(selection.policyVersionId===policyDetail.id||policyDetail.data.templates.some(t=>t.id===selection.templateId)?selection.templateId??"":"");
  },[policyDetail?.id,user?.id,selection.policyVersionId,JSON.stringify(selection.answers),JSON.stringify(v2Profile?.retirementSurvey)]);
  useEffect(()=>{
    const loss=v2Profile?.lossTolerance;
    setLossMode(loss?.inputMode==="BOTH"?"both":loss?.inputMode==="AMOUNT"?"amount":loss?.percent?.status==="KNOWN"?"percent":loss?.amountVnd?.status==="KNOWN"?"amount":"percent");
    setLossPercent(loss?.percent?.status==="KNOWN"?loss.percent.value:"");setLossAmount(loss?.amountVnd?.status==="KNOWN"?loss.amountVnd.value:"");
    setReactionChoice(loss?.reaction?.status==="KNOWN"?({SELL:"sell",HOLD:"hold",BUY_MORE:"buy"} as const)[loss.reaction.value]:"hold");
  },[profileRevision,isRiskSubView]);
  const answeredCount=questions.filter(q=>q.choices.some(c=>c.id===answers[q.id])).length;
  const allAnswered=questions.length>0&&questions.every(q=>q.choices.some(c=>c.id===answers[q.id]));
  const retirementMonth=selection.whatIf?.retirementMonth??(v2Profile?.personal.desiredRetirementMonth?.status==="KNOWN"?v2Profile.personal.desiredRetirementMonth.value:undefined);
  const workspace=useDiscoveryQuery(`${user?.id}:${loadingProfile}:${policyDetail?.id}:${profileRevision}:${JSON.stringify(answers)}:${liquidityNeedMonths}:${selectedTemplateId}:${endMonth}:${retirementMonth}:${selection.monthlyExpenseToday}:${attempt}`,signal=>
    !policyDetail||!profileRevision||loadingProfile?Promise.resolve(null):previewAllocation({expectedProfileRevision:profileRevision,policyVersionId:policyDetail.id,
      answers:questions.filter(q=>answers[q.id]).map(q=>({questionId:q.id,choiceId:answers[q.id]})),liquidityNeedMonths,...(selectedTemplateId?{templateId:selectedTemplateId}:{}),...(endMonth?{endMonth}:{}),...(retirementMonth?{retirementMonth}:{})},signal));
  const planInput:RetirementPreviewInput|null=v2Profile&&policyDetail&&endMonth&&selection.monthlyExpenseToday!==undefined?{
    ...(baseline??initialPlanSelection(v2Profile,profileRevision,policyDetail.id,endMonth,selection.monthlyExpenseToday,[])),...draftSelection,
    expectedProfileRevision:profileRevision,policyVersionId:policyDetail.id,endMonth,liquidityNeedMonths,scenario:"BASE",
    answers:questions.filter(q=>answers[q.id]).map(q=>({questionId:q.id,choiceId:answers[q.id]})),
    templateId:selectedTemplateId||undefined,planningReaction:undefined,
    ...(retirementMonth?{whatIf:{...selection.whatIf,retirementMonth}}:{}),
    ...(policyDetail.data.customization?{allocationFunding:"PROTECTED_CAPITAL_V1"}:{}),customAllocation:selection.policyVersionId===policyDetail.id&&(!selectedTemplateId||selectedTemplateId===selection.templateId)?selection.customAllocation:undefined,
  }:null;
  const growthCapital=workspace.data?.capital.growthCapital??null;
  const saveRisk=async(direct?:LossLimitInput)=>{
    if(savingRisk||!policyDetail)return;
    // The limit is entered only in step 2 of the allocation wizard; this page saves the reaction alongside it.
    const saved=lossMode==="both"?(lossPercent&&lossAmount?{kind:"BOTH" as const,percent:lossPercent,amountVnd:lossAmount}:null):lossMode==="percent"?(lossPercent?{kind:"PERCENT" as const,value:lossPercent}:null):(lossAmount?{kind:"AMOUNT" as const,value:lossAmount}:null);
    const limit=direct??pendingLimit??saved;
    if(!limit){setRiskError(language==="en"?"Choose the maximum loss in step 2 of Asset allocation first.":"Hãy chọn mức giảm tối đa ở bước 2 của Phân bổ tài sản trước.");return;}
    setSavingRisk(true);setRiskError("");
    try{await saveAllocationTolerance({expectedRevision:profileRevision,policyVersionId:policyDetail.id,reaction:direct&&v2Profile?.lossTolerance?.reaction?.status==="KNOWN"?v2Profile.lossTolerance.reaction.value:({sell:"SELL",hold:"HOLD",buy:"BUY_MORE"} as const)[reactionChoice],limit});
      setPendingLimit(null);reloadProfile();setAttempt(n=>n+1);setSearchParams({});notify.success(language==="en"?"Loss tolerance saved":"Đã lưu giới hạn chịu lỗ",language==="en"?"Allocation will use your updated profile.":"Phân bổ được tính lại theo hồ sơ vừa cập nhật.");
    }catch(e){setRiskError(e instanceof Error?e.message:"Chưa lưu được giới hạn.");}finally{setSavingRisk(false);}
  };
  // Step 2 of the allocation wizard edits the limit in place; the reaction answer still comes from the saved profile.
  const saveLossInPlace=(limit:LossLimitInput)=>{
    if(v2Profile?.lossTolerance?.reaction?.status!=="KNOWN"){
      setPendingLimit(limit);setRiskError(language==="en"?"Confirm your reaction to a market decline, then press Update to save the limit you chose.":"Hãy chọn phản ứng khi thị trường giảm rồi bấm Cập nhật để lưu mức giảm vừa chọn.");
      setSearchParams({section:"risk"});return;
    }
    void saveRisk(limit);
  };
  const confirmSavedLoss=()=>{
    if(v2Profile?.lossTolerance?.reaction?.status!=="KNOWN"){
      setRiskError(language==="en"?"Review and confirm your reaction to a market decline before converting the limit.":"Bạn cần xác nhận phản ứng khi thị trường giảm trước khi quy đổi giới hạn.");
      setSearchParams({section:"risk"});
      return;
    }
    void saveRisk();
  };
  if (isRiskSubView) {
    return (
      <div className="phase-page risk-portfolio-page content">
        <nav className="breadcrumb" aria-label="Đường dẫn trang" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            style={{ border: "1px solid #cddfee", borderRadius: "8px", padding: "6px 12px", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
          >
            ← {language === "en" ? "Asset allocation" : "Phân bổ tài sản"}
          </button>
          <span className="sep" style={{ color: "#64748b" }}>/</span>
          <span aria-current="page" style={{ fontSize: "13px", color: "#052659", fontWeight: 600 }}>
            {language === "en" ? "Risk tolerance" : "Khả năng chịu rủi ro"}
          </span>
        </nav>

        <div className="page-head" style={{ marginBottom: "18px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#052659", margin: "0 0 6px" }}>
            {language === "en" ? "Risk tolerance" : "Khả năng chịu rủi ro"}
          </h1>
          <p style={{ color: "#536779", fontSize: "14px", margin: 0 }}>
            {language === "en" ? "Update how you feel and your limits before trying a portfolio." : "Cập nhật cảm nhận và giới hạn trước khi thử danh mục."}
          </p>
        </div>

        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bce3d0",
            borderRadius: "12px",
            padding: "12px 16px",
            fontSize: "13px",
            color: "#14532d",
            marginBottom: "18px",
          }}
        >
          {v2Profile?.lossTolerance?.percent?.status === "KNOWN" ? "✓ " : ""}{language === "en"
            ? "Review your loss tolerance. Update and recalculate to save these choices to your profile."
            : "Xem lại giới hạn chịu lỗ. Bấm Cập nhật và tính lại để lưu lựa chọn vào hồ sơ."}
        </div>

        {riskError && <p role="alert">{riskError} <button onClick={reloadProfile}>Tải lại hồ sơ</button></p>}
        <section className="card" style={{ padding: "24px", borderRadius: "16px", background: "#fff", border: "1px solid #d5e3f0", marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: "17px", fontWeight: 700, color: "#052659" }}>
            {language === "en" ? "Understand what you can accept" : "Hiểu điều bạn có thể chấp nhận"}
          </h2>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13.5px", fontWeight: 600, color: "#052659", marginBottom: "10px" }}>
              {language === "en"
                ? "When your investment drops about 15% over a few months, what do you usually do?"
                : "Khi khoản đầu tư giảm khoảng 15% trong vài tháng, bạn thường làm gì?"}
            </label>
            <div className="risk-reaction-grid">
              {[
                { id: "sell" as const, title: language === "en" ? "Sell some to preserve capital" : "Bán bớt để giữ phần còn lại", desc: language === "en" ? "Prioritize safety during volatility" : "Ưu tiên an toàn trước biến động" },
                { id: "hold" as const, title: language === "en" ? "Hold and monitor" : "Giữ nguyên và theo dõi thêm", desc: language === "en" ? "Accept moderate fluctuation" : "Chấp nhận dao động vừa phải" },
                { id: "buy" as const, title: language === "en" ? "Accept volatility for recovery" : "Chấp nhận biến động để chờ phục hồi", desc: language === "en" ? "Invest for long-term goals" : "Đầu tư cho mục tiêu dài hạn" },
              ].map(opt => {
                const active = reactionChoice === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReactionChoice(opt.id)}
                    style={{
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: active ? "1.5px solid #225eaa" : "1px solid #cddfee",
                      background: active ? "#f0f7ff" : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                    }}
                  >
                    <input type="radio" checked={active} readOnly style={{ marginTop: "3px", accentColor: "#225eaa" }} />
                    <div>
                      <strong style={{ display: "block", fontSize: "13.5px", color: "#052659", marginBottom: "2px" }}>{opt.title}</strong>
                      <span style={{ fontSize: "12px", color: "#536779" }}>{opt.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="risk-actions">
            <button
              type="button"
              className="risk-btn-cancel"
              onClick={() => setSearchParams({})}
            >
              {language === "en" ? "Cancel" : "Hủy"}
            </button>
            <button
              type="button"
              className="risk-btn-submit"
              disabled={savingRisk || !policyDetail}
              onClick={() => void saveRisk()}
            >
              {language === "en" ? "Update and recalculate" : "Cập nhật và tính lại"}
            </button>
          </div>
        </section>

        {policyDetail && <section className="card" style={{padding:24,marginBottom:20}}>
          <h2>{language==="en"?"Investment suitability questionnaire":"Đánh giá mức phù hợp đầu tư"}</h2>
          <p>{language==="en"?"These answers are separate from the initial retirement planning reference.":"Các câu trả lời này tách riêng khỏi danh mục tham khảo dùng cho kế hoạch ban đầu."}</p>
          <p className="risk-quiz-progress" aria-live="polite"><strong>{answeredCount}/{questions.length}</strong> {language==="en"?"questions answered":"câu đã trả lời"}</p>
          <ol className="risk-quiz-list">
            {questions.map((question,index)=>{const prompt=policyQuestionPrompt(question,language),headingId=`risk-q-${question.id}`;return <li key={question.id}>
              <fieldset className={`risk-quiz-question${answers[question.id]?" answered":""}`} data-policy-question={question.id} data-answer={answers[question.id]??""} aria-labelledby={headingId}>
                <legend id={headingId}><span className="risk-quiz-num" aria-hidden="true">{index+1}</span>{prompt}</legend>
                <div className="risk-quiz-choices">
                  {question.choices.map(choice=>{const checked=answers[question.id]===choice.id,[title,...rest]=choice.label.split(/,\s*/);return <label key={choice.id} className={`risk-quiz-choice${checked?" checked":""}`}>
                    <input type="radio" name={`policy-q-${question.id}`} value={choice.id} checked={checked} onChange={()=>setAnswers(previous=>({...previous,[question.id]:choice.id}))}/>
                    <span><strong>{title}</strong>{rest.length>0&&<small>{rest.join(", ")}</small>}</span>
                  </label>;})}
                </div>
              </fieldset>
            </li>;})}
          </ol>
          <button className="overview-button primary" disabled={!allAnswered||savingRisk||!selection.monthlyExpenseToday} onClick={async()=>{if(!allAnswered||savingRisk||!selection.monthlyExpenseToday)return;setSavingRisk(true);setRiskError("");try{const items=questions.map(q=>({questionId:q.id,choiceId:answers[q.id]}));const saved=await updateProfileV2({retirementSurvey:{policyVersionId:policyDetail.id,monthlyExpenseToday:selection.monthlyExpenseToday,answers:items}});if(!saved)throw new Error(language==="en"?"Could not save answers.":"Chưa lưu được câu trả lời.");updateDraft({policyVersionId:policyDetail.id,answers:items,planningReaction:undefined,templateId:undefined,customAllocation:undefined,allocationFunding:undefined});if(!currentVersion&&v2Profile?.quickStartSurvey)navigate("/user/plan",{state:{fromOnboarding:true}});else setSearchParams({});}catch(error){setRiskError(error instanceof Error?error.message:"Chưa lưu được.");}finally{setSavingRisk(false);}}}>{language==="en"?"Save assessment answers":"Lưu câu trả lời đánh giá"}</button>
        </section>}

        <button
          type="button"
          onClick={() => setSearchParams({})}
          style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cddfee", background: "#fff", color: "#052659", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          ← Quay lại Phân bổ tài sản
        </button>
      </div>
    );
  }

  return <div className="phase-page risk-portfolio-page allocation-workspace">
    {riskError&&<p role="alert">{riskError}</p>}
    {(loadingProfile&&!v2Profile)||(!policyDetail&&(policies.loading||loadingPlans))?<p role="status">{language==="en"?"Loading allocation…":"Đang tải phân bổ…"}</p>:loadError?<DiscoveryError message={loadError} retry={reloadProfile}/>:!v2Profile?<p>{language==="en"?"Review your detailed financial profile.":"Hãy rà soát hồ sơ tài chính chi tiết."} <Link to="/user/profile">{language==="en"?"Open Finances":"Mở Tài chính"}</Link></p>:policies.error?<DiscoveryError message={policies.error} retry={()=>setPolicyAttempt(n=>n+1)}/>:!policyDetail?<><h1>{language==="en"?"Asset allocation":"Phân bổ tài sản"}</h1><p>{language==="en"?"No published portfolio policy is available.":"Chưa có chính sách danh mục đã công bố."} <Link to="/user/profile?section=assets">{language==="en"?"Review assets":"Kiểm tra tài sản"}</Link></p><button onClick={()=>setPolicyAttempt(n=>n+1)}>{language==="en"?"Retry":"Thử lại"}</button></>:<AllocationWorkspace lossInputMode={v2Profile.lossTolerance?.inputMode} planInput={planInput} profileRevision={profileRevision} retirementExpense={selection.monthlyExpenseToday??null} confirmLoss={confirmSavedLoss} saveLoss={saveLossInPlace} riskError={riskError} savingRisk={savingRisk} lossAmount={v2Profile.lossTolerance?.amountVnd?.status==="KNOWN"?v2Profile.lossTolerance.amountVnd.value:null} lossPercent={v2Profile.lossTolerance?.percent?.status==="KNOWN"?v2Profile.lossTolerance.percent.value:null} policy={policyDetail} data={workspace.data??(workspace.loading?workspace.previous:null)??null} loading={workspace.loading} error={workspace.error} retry={()=>setAttempt(n=>n+1)} selected={selectedTemplateId} months={liquidityNeedMonths} setMonths={setLiquidityNeedMonths} endMonth={endMonth} setEndMonth={setEndMonth} retirementMonth={retirementMonth} answers={answers} complete={allAnswered} openRisk={()=>setSearchParams({section:"risk"})}/>}
  </div>;
}
