import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import type { AllocationWorkspaceResult } from "../services/allocationWorkspace";
import type { PortfolioPolicyDetail, PortfolioTemplate, TemplateAllocation } from "../services/portfolios";
import { financeMoney } from "../utils/financeHubSummary";
import { portfolioAssetLabel, portfolioGlideWeights, portfolioGlideYears } from "../utils/portfolioGlidePath";
import { translateIssueCode } from "../services/retirement";
import { PortfolioGlidePath } from "./PortfolioGlidePath";
import { PortfolioScenarios } from "./PortfolioScenarios";
import ResponsiveDialog from "./ResponsiveDialog";
import { Icon } from "./ui";
import { Explain } from "./explanations/ExplainMode";
import "./allocation-results.css";
import AllocationExperiment, {AllocationCandidates, allocationColor as color, allocationPurpose, type AllocationChoice, type AllocationEvaluationState} from "./AllocationExperiment";
import type { RiskResult } from "../services/planningAnalysis";
import type { WorkspaceInput } from "../services/allocationWorkspace";
import type { RetirementPreviewInput } from "../services/retirement";


/** A display of published policy results. Never manufactures optimizer scores or market probabilities. */
export default function AllocationResults({ data, policy, retirementMonth, complete, usable, loading, explain,planInput,workspaceInput,onChoose }: {
  data: AllocationWorkspaceResult; policy: PortfolioPolicyDetail; retirementMonth?: string;
  complete: boolean; usable: boolean; loading: boolean;
  explain: (kind: "capital" | "reserve" | "goals", label: string) => ReactNode;
  planInput:RetirementPreviewInput|null;workspaceInput:WorkspaceInput;onChoose:(selection:AllocationChoice)=>void;
}) {
  const en = useI18n().language === "en", language = en ? "en" : "vi";
  const t = (vi: string, english: string) => en ? english : vi;
  const [referenceState,setReferenceState]=useState<{source:AllocationWorkspaceResult;value:AllocationWorkspaceResult;result:RiskResult|null;state:AllocationEvaluationState}>({source:data,value:data,result:null,state:{busy:false,error:""}});
  const onReferenceChange=useCallback((value:AllocationWorkspaceResult,result:RiskResult|null,state:AllocationEvaluationState)=>setReferenceState({source:data,value,result,state}),[data]);
  const whyReference=referenceState.source===data?referenceState.value:data, tested=referenceState.source===data?referenceState.result:null;
  const whyPortfolio=whyReference.portfolio,whyAssessment=whyPortfolio?.assessment;
  const whyUsable=whyPortfolio?.status==="READY"&&whyReference.loss.status==="WITHIN_LIMIT"&&complete;
  const evaluation = referenceState.source === data ? referenceState.state : { busy: false, error: "" };
  const resultTitle = evaluation.error ? t("Chưa tính được phương án phân bổ", "Could not calculate your allocation")
    : !planInput || !workspaceInput.templateId ? t("Bổ sung thông tin để tính phương án", "Complete inputs to calculate your allocation")
    : tested ? t("Chưa đủ dữ liệu để đề xuất phương án", "More data is needed to recommend an allocation")
    : t("Đang tìm phương án phù hợp với bạn", "Finding an allocation for you");
  const c = data.capital, p = data.portfolio, assessment = p?.assessment;
  const template = policy.data.templates.find(row => row.id === assessment?.selectedTemplateId);
  const label = (code: string) => portfolioAssetLabel(code, language, data.assetLabels);
  const money = (value: string | null | undefined) => financeMoney(value ?? null, en);
  const num = (value: number, digits = 2) => new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: digits }).format(value);
  const weightsFor = (item: PortfolioTemplate): TemplateAllocation[] => {
    if ("glidePath" in item) {
      const years = portfolioGlideYears(item.glidePath.points, data.valuationDate.slice(0, 7), retirementMonth);
      return years === null ? [] : portfolioGlideWeights(item.glidePath.points, years);
    }
    return item.schedule.find(period => period.fromIndex <= 0 && period.toIndex >= 0)?.allocations ?? [];
  };
  const purpose = (code: string) => allocationPurpose(code, en);
  const issueText = (code: string) => code === "RETIREMENT_MONTH_REQUIRED" ? translateIssueCode(code, language)
    : code === "ANSWER_REQUIRED" ? t("Cần kiểm tra kết quả khảo sát rủi ro đã lưu.", "Review the saved risk survey results.")
    : code === "PORTFOLIO_CHOICE_REQUIRED" ? t("Có nhiều phương án phù hợp. Hãy chọn một phương án để xem tỷ trọng.", "Several portfolios match. Choose one to see its weights.")
    : code === "TEMPLATE_NOT_ELIGIBLE" ? t("Phương án này chưa phù hợp với câu trả lời và thời gian đã chọn.", "This portfolio does not match your answers and horizon.")
    : t("Cần rà soát thông tin đã khai hoặc chính sách danh mục trước khi tính.", "Review declared information or the portfolio policy before calculating.");
  const testedKind = tested?.referenceKind ?? tested?.deterministic?.referenceKind ?? null;
  const reducedPick = testedKind !== "LOSS_REDUCED_WITHIN_LIMIT" ? null
    : (tested?.candidates?.find(row => row.id === tested.referenceId) ?? tested?.deterministic?.candidates.find(row => row.id === tested.deterministic?.referenceId)) ?? null;
  const reducedLoss = (reducedPick as { loss?: { lossAmount: string | null } } | null)?.loss?.lossAmount ?? null;
  const criteria = [
    reducedPick ? { known: true, title: t("Đã giảm rủi ro cho vừa giới hạn chịu lỗ", "Risk reduced to fit your loss limit"),
      detail: `${t("Danh mục mẫu giảm", "The template loses")} ${money(whyReference.loss.lossAmount)} ${t("khi thị trường sốc, vượt giới hạn", "in the approved stress, above your limit of")} ${money(whyReference.loss.allowedLossAmount)}. ${t(`Đã chuyển ${num(Number(reducedPick.changePoints))} điểm % cổ phiếu sang tiền gửi`, `${num(Number(reducedPick.changePoints))} points of equity were moved to deposits`)}${reducedLoss ? `; ${t("mức giảm còn", "the loss is now")} ${money(reducedLoss)}` : ""}.` }
    : { known: whyReference.loss.status === "WITHIN_LIMIT", title: whyReference.loss.status === "WITHIN_LIMIT" ? t("Không vượt giới hạn chịu lỗ", "Within your loss limit") : t("Cần rà soát giới hạn chịu lỗ", "Review the loss limit"), detail: `${whyReference.loss.message} ${t("Mức giảm trong tình huống đã duyệt", "Loss in the approved stress")}: ${money(whyReference.loss.lossAmount)}. ${t("Giới hạn đã khai", "Declared limit")}: ${money(whyReference.loss.allowedLossAmount)}.` },
    { known: c.status === "READY", title: c.status === "READY" ? t("Giữ riêng khoản cần dùng trước", "Protect near-term needs first") : t("Cần xác nhận khoản giữ riêng", "Confirm protected capital"), detail: `${t("Dự phòng", "Emergency reserve")}: ${money(c.requiredEmergencyReserve)}. ${t("Mục tiêu gần hạn", "Near-term goals")}: ${money(c.nearTermGoalsPresentValue)}. ${t("Chỉ phần vốn còn lại được phân bổ dài hạn.", "Only the remainder is allocated for the long term.")}` },
    { known: whyPortfolio?.status === "READY" && complete, title: whyPortfolio?.status === "READY" && complete ? t("Phù hợp hồ sơ và thời gian đã chọn", "Matches your profile and horizon") : t("Cần chọn phương án phù hợp hồ sơ", "Choose an eligible allocation"), detail: whyAssessment?.checks?.filter(check => check.templateId === whyAssessment.selectedTemplateId && check.matched).map(check => check.explanation).filter(Boolean).join(" ") || t("Đối chiếu câu trả lời đã lưu, thời gian cần thanh khoản và chính sách đã công bố. Chưa có kết luận về khả năng đủ tiền của toàn bộ kế hoạch.", "Checks saved answers, liquidity needs and the published policy. This does not establish that the whole plan is fully funded.") },
  ];

  // Once the simulation has run, explain the pick the way the demo does: loss limit, then essential-spending threshold, then smallest shortfall.
  const picked = tested?.candidates?.find(row => row.id === tested.referenceId);
  const overLimitResult = (tested?.referenceKind ?? tested?.deterministic?.referenceKind) === "LEAST_LOSS_OVER_LIMIT";
  // Applying needs admin-published market data (customer decision); unknown until the selection run returns.
  const marketMissing = tested?.status === "DATA_REQUIRED";
  const unsimulated = !overLimitResult && tested?.status === "DATA_REQUIRED" && !!tested.deterministic?.referenceId;
  const share = (value: number | null | undefined) => value == null ? t("chưa xác định", "unavailable") : `${num(value * 100, 1)}%`;
  const qualified = picked?.pEssential != null && !!tested?.threshold && picked.pEssential >= Number(tested.threshold);
  const testedCount = (tested?.candidates?.filter(row => row.id !== "CUSTOM").length ?? 0) + (tested?.rejected?.filter(row => row.id !== "CUSTOM").length ?? 0);
  const whyCriteria = !picked ? criteria : [criteria[0],
    { known: qualified, title: qualified ? t("Đạt ngưỡng đủ chi thiết yếu", "Meets the essential-spending threshold") : t("Chưa đạt ngưỡng đủ chi thiết yếu", "Below the essential-spending threshold"),
      detail: `${t("Đủ chi thiết yếu", "Essentials covered in")} ${share(picked.pEssential)} ${t("số kịch bản", "of scenarios")}${tested?.threshold ? ` (${t("cần từ", "needs at least")} ${num(Number(tested.threshold) * 100)}%)` : ""}. ${t("Đủ mọi mục tiêu", "All goals covered in")} ${share(picked.pAll)}${tested?.allThreshold ? ` (${t("mức mong muốn", "desired")} ${num(Number(tested.allThreshold) * 100)}%)` : ""}.${qualified ? "" : ` ${t("Chưa cách chia nào đạt, vì số vốn và mức góp hiện tại còn thấp so với chi tiêu dự kiến.", "No allocation qualifies because current capital and contributions are low relative to planned spending.")}`}` },
    qualified ? { known: true, title: t("Ít thiếu hụt nhất khi thị trường xấu", "Smallest shortfall in bad markets"), detail: t("Trong các cách chia đạt ngưỡng, đây là cách có mức thiếu trung bình thấp nhất ở nhóm kịch bản xấu nhất, rồi ít phải đổi tỷ trọng nhất.", "Among qualifying allocations this one has the lowest average shortfall in the worst scenarios, then the smallest allocation change.") }
      : { known: false, title: t("Chưa chọn được phương án đề xuất", "No recommended allocation yet"), detail: t("Khi không cách chia nào đạt ngưỡng thì kế hoạch chưa khả thi. Danh mục tham khảo chỉ để bạn xem trước. Hãy tăng mức góp, nghỉ hưu muộn hơn hoặc giảm chi tiêu.", "When no allocation qualifies the plan is not yet feasible. The reference allocation is a preview only. Raise contributions, retire later or reduce spending.") },
  ];

  const rates = Object.fromEntries([...(data.returnBreakdown?.rows ?? []), ...(whyReference.returnBreakdown?.rows ?? [])].map(row => [row.assetClass, Number(row.monthlyRate)]));
  const why = <section className="allocation-result-why" id="allocation-result-why"><h2>{picked ? (qualified ? t("Vì sao đây là phương án tốt nhất cho bạn?", "Why is this the best allocation for you?") : t("Vì sao chưa có phương án đạt?", "Why does no allocation qualify yet?")) : whyUsable ? t("Vì sao phương án này phù hợp?", "Why does this allocation fit?") : t("Vì sao cần rà soát phương án?", "Why does this allocation need review?")}</h2><p>{picked ? t(`Hệ thống đã thử ${testedCount} cách chia vốn dài hạn trên cùng ${picked.paths ?? "—"} kịch bản thị trường, rồi chọn theo 3 tiêu chí theo thứ tự ưu tiên.`, `${testedCount} long-term splits were tested on the same ${picked.paths ?? "—"} market scenarios and ranked by three criteria in priority order.`) : t("Ba cơ sở của phương án tham chiếu; đối chiếu trước khi đưa vào kế hoạch nghỉ hưu.", "Three checks for the reference allocation before using it in your retirement plan.")}</p><ol>{whyCriteria.map(item => <li key={item.title} className={item.known ? "is-valid" : "is-review"}><span className="allocation-criterion-icon" aria-hidden="true"><Icon name={item.known ? "check" : "info"} /></span><div><h3>{item.title}</h3><p>{item.detail}</p></div></li>)}</ol>
      {tested && picked && <AllocationCandidates result={tested} labels={data.assetLabels} en={en} rates={rates} />}
      <details className="allocation-policy-comparison"><summary>{t("Đối chiếu các cách chia vốn đã công bố", "Compare published allocations")}</summary><div className="allocation-comparison-scroll" role="region" tabIndex={0} aria-label={t("Bảng đối chiếu phương án phân bổ", "Published allocation comparison")}><table><caption>{t("Tỷ trọng tham chiếu tại tháng định giá; kết quả áp dụng do máy chủ kiểm tra lại.", "Reference weights at valuation; the server verifies each selection.")}</caption><thead><tr><th>{t("Phương án", "Allocation")}</th><th>{t("Cách chia vốn", "Capital allocation")}</th><th>{t("Theo hồ sơ hiện tại", "Profile eligibility")}</th></tr></thead><tbody>{policy.data.templates.map(item => <tr key={item.id} className={item.id === template?.id ? "is-current" : ""}><th scope="row">{item.label}</th><td>{weightsFor(item).length ? weightsFor(item).map(row => `${label(row.assetClass)} ${num(Number(row.weightPercent))}%`).join(" · ") : t("Cần xác nhận mốc thời gian", "Confirm projection dates")}</td><td>{assessment?.eligibleTemplateIds.includes(item.id) ? t("Có thể chọn", "Eligible") : t("Chưa phù hợp", "Not eligible")}</td></tr>)}</tbody></table></div></details>
    </section>;

  return <section className="allocation-results" aria-label={t("Kết quả phân bổ tài sản", "Asset allocation results")}>
    <header className="allocation-capital-heading"><div><span>{t("BẮT ĐẦU TỪ SỐ TIỀN BẠN CÓ", "START WITH YOUR AVAILABLE CAPITAL")}</span><h2>{t("Giữ riêng trước. Đầu tư phần còn lại.", "Protect first. Invest the remainder.")}</h2></div><div className="allocation-total-capital">{t("Tổng vốn trong phạm vi", "Capital considered")}{explain("capital", t("Tổng vốn", "Capital"))}<strong>{money(c.investableLiquidAssets)}</strong></div></header>
    <dl className="allocation-result-summary">
      <div><dt><span aria-hidden="true">01</span><Explain term="emergencyReserve">{t("Dự phòng giữ riêng", "Emergency reserve")}</Explain>{explain("reserve", t("Dự phòng", "Reserve"))}</dt><dd>{money(c.requiredEmergencyReserve)}</dd><small>{c.reserveMonths === null ? t("Chưa xác định số tháng dự phòng", "Reserve months undetermined") : t(`Cho ${c.reserveMonths} tháng chi thiết yếu`, `For ${c.reserveMonths} months of essential spending`)}</small></div>
      <div><dt><span aria-hidden="true">02</span><Explain term="nearTermGoals">{t("Mục tiêu gần hạn", "Near-term goals")}</Explain>{explain("goals", t("Mục tiêu gần hạn", "Near-term goals"))}</dt><dd>{money(c.nearTermGoalsPresentValue)}</dd><small>{c.goals.filter(goal => goal.treatment === "RESERVED").length} {t("mục tiêu cần vốn trong 5 năm", "goals needing funds within 5 years")}</small></div>
      <div className="allocation-capital-total"><dt><span aria-hidden="true">03</span><Explain term="growthCapital">{c.growthCapital?.startsWith("-") ? t("Còn thiếu để giữ đủ vốn", "Protected capital shortfall") : t("Vốn dài hạn để phân bổ", "Long-term allocation capital")}</Explain></dt><dd>{money(c.growthCapital)}</dd><small>{c.status === "READY" ? t("Đây là 100% trong biểu đồ bên dưới", "This is the 100% shown in the chart below") : t("Cần xác nhận đủ vốn trước khi áp dụng", "Confirm available capital before applying")}</small></div>
    </dl>
    {(data.issues.length > 0 || c.issues?.length > 0) && <div className="allocation-review" role="status"><h2>{t("Cần bổ sung trước khi phân bổ", "Complete these details before allocation")}</h2><p>{t("Rà soát tài sản, chi thiết yếu, độ ổn định thu nhập, mục tiêu và thời gian tính.", "Review assets, essential spending, income stability, goals and projection dates.")}</p><Link to="/user/profile">{t("Mở Tài chính", "Open Finances")}</Link></div>}
    <header className="allocation-results-heading"><div><h2>{overLimitResult ? t("Chưa có phương án trong giới hạn chịu lỗ", "No allocation fits your loss limit yet")
      : unsimulated ? (reducedPick ? t("Danh mục đã giảm rủi ro, chưa mô phỏng", "Risk-reduced allocation, not yet simulated") : t("Phương án theo chính sách, chưa mô phỏng", "Policy allocation, not yet simulated")) : picked ? (qualified ? t("Phương án đề xuất cho hồ sơ của bạn", "The recommended allocation for your profile") : t("Chưa có phương án đạt ngưỡng", "No allocation meets the threshold yet")) : resultTitle}</h2><p>{overLimitResult ? t("Kể cả danh mục ít rủi ro nhất mà chính sách cho phép vẫn giảm nhiều hơn mức bạn đã khai. Danh mục bên dưới chỉ để tham khảo; hãy xem mức chịu giảm tối thiểu cần chấp nhận.", "Even the lowest-risk allocation the policy allows loses more than your declared limit. The allocation below is for reference only; see the minimum loss you would need to accept.")
      : unsimulated ? reducedPick ? t("Danh mục mẫu vượt giới hạn chịu lỗ nên đã giảm cổ phiếu cho vừa giới hạn. Chưa có bộ dữ liệu thị trường đã công bố nên chưa tính xác suất; chỉ áp dụng được khi có dữ liệu thị trường.", "The template exceeded your loss limit, so equity was reduced to fit. No published market data yet, so no probabilities; it can be applied once market data is published.") : t("Chưa có bộ dữ liệu thị trường đã công bố nên chưa tính xác suất. Tỷ trọng bên dưới theo chính sách và đã kiểm tra với giới hạn chịu lỗ của bạn; chỉ áp dụng được khi có dữ liệu thị trường.", "No published market data yet, so no probabilities. The weights below follow the policy and were checked against your loss limit; they can be applied once market data is published.")
      : picked ? (qualified ? t("Hệ thống thử nhiều cách chia tiền trên cùng các kịch bản thị trường, rồi chọn cách tốt nhất mà không vượt giới hạn chịu lỗ bạn đã khai. Đây là phép thử trên dữ liệu lịch sử, không phải lời khuyên đầu tư.", "Several splits are tested on the same market scenarios and the best one within your declared loss limit is picked. This is a test on historical data, not investment advice.") : t("Không cách chia nào đủ chi thiết yếu ở mức yêu cầu với số vốn và mức góp hiện tại. Danh mục bên dưới chỉ để tham khảo. Đây là phép thử trên dữ liệu lịch sử, không phải lời khuyên đầu tư.", "No split covers essential spending at the required level with current capital and contributions. The allocation below is for reference only. This is a test on historical data, not investment advice.")) : t("Đối chiếu phần vốn dài hạn với hồ sơ và giới hạn chịu lỗ đã khai. Xem lại kết quả trước khi đưa vào bản nháp kế hoạch.", "Compare long-term capital against your profile and declared loss limit. Review the result before using it in a plan draft.")}</p></div><span className={`allocation-source-badge${marketMissing ? " is-missing" : ""}`}>{marketMissing ? t("Chưa có dữ liệu thị trường", "No market data yet") : tested?.marketVersion ? t(`Dữ liệu thị trường đã công bố · v${tested.marketVersion}`, `Published market data · v${tested.marketVersion}`) : t("Chính sách đã công bố", "Published policy")}</span></header>
    {p?.issues?.length ? <ul className="allocation-result-issues" role="status">{p.issues.map((issue, i) => <li key={i}>{issueText(issue.code)}</li>)}</ul> : null}
    <AllocationExperiment data={data} input={workspaceInput} plan={planInput} onChoose={onChoose} onReferenceChange={onReferenceChange} thresholds={{essential:policy.data.allocationRisk?.essentialThreshold,all:policy.data.allocationRisk?.allGoalsThreshold}} why={why}/>
    <footer className="allocation-result-next"><div><strong>{t("Đã chọn được phương án?", "Ready to review your plan?")}</strong><p>{t("Mở Kế hoạch để xem mức cần góp, lưu và xác nhận khi sẵn sàng.", "Open your plan to review contributions, save and confirm when ready.")}</p></div><Link className="overview-button secondary" to="/user/plan">{t("Xem kế hoạch nghỉ hưu →", "View retirement plan →")}</Link></footer>
  </section>;
}
