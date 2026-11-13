import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import type { AllocationWorkspaceResult } from "../services/allocationWorkspace";
import type { PortfolioPolicyDetail, PortfolioTemplate, TemplateAllocation } from "../services/portfolios";
import { Decimal } from "../utils/decimal";
import { financeMoney } from "../utils/financeHubSummary";
import { portfolioAssetLabel, portfolioGlideWeights, portfolioGlideYears } from "../utils/portfolioGlidePath";
import { translateIssueCode } from "../services/retirement";
import { PortfolioGlidePath } from "./PortfolioGlidePath";
import { PortfolioScenarios } from "./PortfolioScenarios";
import ResponsiveDialog from "./ResponsiveDialog";
import { Icon } from "./ui";
import { Explain } from "./explanations/ExplainMode";
import "./allocation-results.css";

const palette: Record<string, string> = { CASH: "#4d8a9b", GOV_BOND: "#7476b5", BOND: "#7476b5", EQUITY: "#245dab", STOCK: "#245dab", GOLD: "#c29a39", REAL_ESTATE: "#8c9bab" };
const colors = ["#4d8a9b", "#7476b5", "#245dab", "#c29a39", "#8c9bab", "#a56c51"];
const color = (code: string, index: number) => palette[code] ?? colors[index % colors.length];

/** A display of published policy results. Never manufactures optimizer scores or market probabilities. */
export default function AllocationResults({ data, policy, retirementMonth, complete, usable, loading, select, onApply, onRebalance, explain }: {
  data: AllocationWorkspaceResult; policy: PortfolioPolicyDetail; retirementMonth?: string;
  complete: boolean; usable: boolean; loading: boolean; select: (id: string) => void;
  onApply: () => void; onRebalance: () => void;
  explain: (kind: "capital" | "reserve" | "goals", label: string) => ReactNode;
}) {
  const en = useI18n().language === "en", language = en ? "en" : "vi";
  const t = (vi: string, english: string) => en ? english : vi;
  const [packages, setPackages] = useState(false);
  const [alternativesOpen, setAlternativesOpen] = useState(() => !window.matchMedia("(max-width: 800px)").matches);
  const c = data.capital, p = data.portfolio, assessment = p?.assessment;
  const template = policy.data.templates.find(row => row.id === assessment?.selectedTemplateId);
  const label = (code: string) => portfolioAssetLabel(code, language, data.assetLabels);
  const money = (value: string | null | undefined) => financeMoney(value ?? null, en);
  const num = (value: number, digits = 2) => new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: digits }).format(value);
  const base = p?.status === "READY" ? p.scenarios.find(row => row.kind === "BASE") : undefined;
  const ending = Number(base?.endingUnitValue);
  const annual = base?.rows.length && ending > 0 && Number.isFinite(ending) ? (Math.pow(ending, 12 / base.rows.length) - 1) * 100 : null;
  const years = retirementMonth ? Math.max(0, Math.floor(((Number(retirementMonth.slice(0, 4)) - Number(data.valuationDate.slice(0, 4))) * 12 + Number(retirementMonth.slice(5, 7)) - Number(data.valuationDate.slice(5, 7))) / 12)) : null;
  const weightsFor = (item: PortfolioTemplate): TemplateAllocation[] => {
    if ("glidePath" in item) {
      const years = portfolioGlideYears(item.glidePath.points, data.valuationDate.slice(0, 7), retirementMonth);
      return years === null ? [] : portfolioGlideWeights(item.glidePath.points, years);
    }
    return item.schedule.find(period => period.fromIndex <= 0 && period.toIndex >= 0)?.allocations ?? [];
  };
  const purpose = (code: string) => ({
    CASH: t("Linh hoạt cho các khoản cần dùng", "Liquidity for upcoming needs"),
    BOND: t("Tạo nền thu nhập ổn định", "A foundation for regular income"),
    GOV_BOND: t("Tạo nền thu nhập ổn định", "A foundation for regular income"),
    STOCK: t("Tăng trưởng trong dài hạn", "Long-term growth"),
    EQUITY: t("Tăng trưởng trong dài hạn", "Long-term growth"),
    GOLD: t("Đa dạng hóa danh mục", "Portfolio diversification"),
  } as Record<string, string>)[code] ?? t("Theo vai trò trong chính sách phân bổ", "As defined in the allocation policy");
  const allocationRows = data.allocations.filter(row => new Decimal(row.weightPercent).gt(0));
  const ring = (small = false) => {
    let offset = 0;
    return <svg className={`allocation-result-ring${small ? " is-small" : ""}`} viewBox="0 0 200 200" role="img" aria-label={t("Tỷ trọng phân bổ theo kết quả", "Portfolio weights from results")}>
      <circle cx="100" cy="100" r="78" fill="none" stroke="#e9eff5" strokeWidth="20" />
      {allocationRows.map((row, i) => { const start = offset; offset += Number(row.weightPercent); return <circle key={row.assetClass} cx="100" cy="100" r="78" fill="none" stroke={color(row.assetClass, data.allocations.indexOf(row))} strokeWidth="20" pathLength="100" strokeDasharray={`${row.weightPercent} ${100 - Number(row.weightPercent)}`} strokeDashoffset={-start} transform="rotate(-90 100 100)" />; })}
      <text className="allocation-ring-total" x="100" y="99" textAnchor="middle">100%</text><text className="allocation-ring-label" x="100" y="122" textAnchor="middle">{t("Vốn dài hạn", "Long-term capital")}</text>
    </svg>;
  };
  const issueText = (code: string) => code === "RETIREMENT_MONTH_REQUIRED" ? translateIssueCode(code, language)
    : code === "ANSWER_REQUIRED" ? t("Cần kiểm tra kết quả khảo sát rủi ro đã lưu.", "Review the saved risk survey results.")
    : code === "PORTFOLIO_CHOICE_REQUIRED" ? t("Có nhiều phương án phù hợp. Hãy chọn một phương án để xem tỷ trọng.", "Several portfolios match. Choose one to see its weights.")
    : code === "TEMPLATE_NOT_ELIGIBLE" ? t("Phương án này chưa phù hợp với câu trả lời và thời gian đã chọn.", "This portfolio does not match your answers and horizon.")
    : t("Cần rà soát thông tin đã khai hoặc chính sách danh mục trước khi tính.", "Review declared information or the portfolio policy before calculating.");
  const criteria = [
    { known: data.loss.status === "WITHIN_LIMIT", title: data.loss.status === "WITHIN_LIMIT" ? t("Không vượt giới hạn chịu lỗ", "Within your loss limit") : t("Cần rà soát giới hạn chịu lỗ", "Review the loss limit"), detail: `${data.loss.message} ${t("Mức giảm trong tình huống đã duyệt", "Loss in the approved stress")}: ${money(data.loss.lossAmount)}. ${t("Giới hạn đã khai", "Declared limit")}: ${money(data.loss.allowedLossAmount)}.` },
    { known: c.status === "READY", title: c.status === "READY" ? t("Giữ riêng khoản cần dùng trước", "Protect near-term needs first") : t("Cần xác nhận khoản giữ riêng", "Confirm protected capital"), detail: `${t("Dự phòng", "Emergency reserve")}: ${money(c.requiredEmergencyReserve)}. ${t("Mục tiêu gần hạn", "Near-term goals")}: ${money(c.nearTermGoalsPresentValue)}. ${t("Chỉ phần vốn còn lại được phân bổ dài hạn.", "Only the remainder is allocated for the long term.")}` },
    { known: p?.status === "READY" && complete, title: p?.status === "READY" && complete ? t("Phù hợp hồ sơ và thời gian đã chọn", "Matches your profile and horizon") : t("Cần chọn phương án phù hợp hồ sơ", "Choose an eligible allocation"), detail: assessment?.checks?.filter(check => check.templateId === template?.id && check.matched).map(check => check.explanation).filter(Boolean).join(" ") || t("Đối chiếu câu trả lời đã lưu, thời gian cần thanh khoản và chính sách đã công bố. Chưa có kết luận về khả năng đủ tiền của toàn bộ kế hoạch.", "Checks saved answers, liquidity needs and the published policy. This does not establish that the whole plan is fully funded.") },
  ];

  return <section className="allocation-results" aria-label={t("Kết quả phân bổ tài sản", "Asset allocation results")}>
    <header className="allocation-capital-heading"><div><span>{t("BẮT ĐẦU TỪ SỐ TIỀN BẠN CÓ", "START WITH YOUR AVAILABLE CAPITAL")}</span><h2>{t("Giữ riêng trước. Đầu tư phần còn lại.", "Protect first. Invest the remainder.")}</h2></div><div className="allocation-total-capital">{t("Tổng vốn trong phạm vi", "Capital considered")}{explain("capital", t("Tổng vốn", "Capital"))}<strong>{money(c.investableLiquidAssets)}</strong></div></header>
    <dl className="allocation-result-summary">
      <div><dt><span aria-hidden="true">01</span><Explain term="emergencyReserve">{t("Dự phòng giữ riêng", "Emergency reserve")}</Explain>{explain("reserve", t("Dự phòng", "Reserve"))}</dt><dd>{money(c.requiredEmergencyReserve)}</dd><small>{c.reserveMonths === null ? t("Chưa xác định số tháng dự phòng", "Reserve months undetermined") : t(`Cho ${c.reserveMonths} tháng chi thiết yếu`, `For ${c.reserveMonths} months of essential spending`)}</small></div>
      <div><dt><span aria-hidden="true">02</span><Explain term="nearTermGoals">{t("Mục tiêu gần hạn", "Near-term goals")}</Explain>{explain("goals", t("Mục tiêu gần hạn", "Near-term goals"))}</dt><dd>{money(c.nearTermGoalsPresentValue)}</dd><small>{c.goals.filter(goal => goal.treatment === "RESERVED").length} {t("mục tiêu cần vốn trong 5 năm", "goals needing funds within 5 years")}</small></div>
      <div className="allocation-capital-total"><dt><span aria-hidden="true">03</span><Explain term="growthCapital">{c.growthCapital?.startsWith("-") ? t("Còn thiếu để giữ đủ vốn", "Protected capital shortfall") : t("Vốn dài hạn để phân bổ", "Long-term allocation capital")}</Explain></dt><dd>{money(c.growthCapital)}</dd><small>{c.status === "READY" ? t("Đây là 100% trong biểu đồ bên dưới", "This is the 100% shown in the chart below") : t("Cần xác nhận đủ vốn trước khi áp dụng", "Confirm available capital before applying")}</small></div>
    </dl>
    {(data.issues.length > 0 || c.issues?.length > 0) && <div className="allocation-review" role="status"><h2>{t("Cần bổ sung trước khi phân bổ", "Complete these details before allocation")}</h2><p>{t("Rà soát tài sản, chi thiết yếu, độ ổn định thu nhập, mục tiêu và thời gian tính.", "Review assets, essential spending, income stability, goals and projection dates.")}</p><Link to="/user/profile">{t("Mở Tài chính", "Open Finances")}</Link></div>}
    <header className="allocation-results-heading"><div><h2>{usable ? t("Phương án phân bổ theo hồ sơ của bạn", "An allocation based on your profile") : t("Kiểm tra phương án phân bổ", "Review your allocation")}</h2><p>{t("Đối chiếu phần vốn dài hạn với hồ sơ và giới hạn chịu lỗ đã khai. Xem lại kết quả trước khi đưa vào bản nháp kế hoạch.", "Compare long-term capital against your profile and declared loss limit. Review the result before using it in a plan draft.")}</p></div><span className="allocation-source-badge">{t("Chính sách đã công bố", "Published policy")}</span></header>
    <section className="allocation-lab-real" aria-label={t("Danh mục và các phương án", "Portfolio and alternatives")}>
      <article className="allocation-reference">
        <header className="allocation-result-card-heading"><span className="allocation-result-icon" aria-hidden="true"><Icon name="shield" /></span><div><span className={`allocation-loss-badge${usable ? " is-valid" : ""}`}>{usable ? t("Trong giới hạn chịu lỗ", "Within loss limit") : t("Cần rà soát", "Review needed")}</span><h2>{template?.label ?? t("Phương án phân bổ cho bạn", "Your allocation")}</h2></div></header>
        <div className="allocation-reference-rate"><strong>{annual === null || !Number.isFinite(annual) ? t("Chưa xác định", "Undetermined") : num(annual)}{annual !== null && Number.isFinite(annual) && <small>%/{t("năm", "yr")}</small>}</strong><span>{t("Sinh lời quy đổi của kịch bản cơ sở", "Annual equivalent return of the base scenario")}<br />{t("Theo lịch tỷ trọng và chi phí trong kết quả; không cam kết", "Includes the modeled allocation path and costs; not guaranteed")}</span></div>
        {p?.issues?.length ? <ul className="allocation-result-issues">{p.issues.map((issue, i) => <li key={i}>{issueText(issue.code)}</li>)}</ul> : null}
        {!!data.allocations.length && <div className="allocation-breakdown">{ring()}<dl>{data.allocations.map((row, i) => <div key={row.assetClass}><dt><i style={{ background: color(row.assetClass, i) }} /><span>{label(row.assetClass)}<small>{purpose(row.assetClass)}</small></span></dt><dd><strong>{num(Number(row.weightPercent))}%</strong><span>{money(row.amountVnd)}</span></dd></div>)}</dl></div>}
        <div className={`allocation-result-callout${usable ? " is-valid" : ""}`}><Icon name={usable ? "check" : "info"} /><p>{data.loss.message || t("Chưa đủ kết quả để xác nhận giới hạn chịu lỗ.", "More data is needed to verify the loss limit.")}</p><a href="#allocation-result-why">{t("Xem vì sao ↓", "See why ↓")}</a></div>
        <dl className="allocation-loss-comparison"><div><dt>{t("Giảm khi thị trường sốc", "Loss under approved stress")}</dt><dd>{money(data.loss.lossAmount)}</dd></div><div><dt>{t("Giới hạn chịu lỗ đã khai", "Declared loss limit")}</dt><dd>{money(data.loss.allowedLossAmount)}</dd></div></dl>
        <p className="allocation-result-footnote">{t("Đây là kiểm tra mức giảm theo tình huống, chưa phải xác suất đủ chi thiết yếu hoặc đủ mọi mục tiêu.", "This stress check is not a probability of covering essential spending or every goal.")}</p>
        <div className="allocation-reference-actions"><button className="overview-button primary" disabled={!usable || loading} onClick={onApply}>{t("Áp dụng vào bản xem trước", "Use in plan preview")} <span aria-hidden="true">→</span></button><button className="overview-button secondary" onClick={() => setPackages(true)}>{t("Gợi ý gói đầu tư phù hợp", "Explore suitable investment products")}</button></div>
      </article>
      <details className="allocation-alternatives" open={alternativesOpen} onToggle={event => setAlternativesOpen(event.currentTarget.open)}>
        <summary><span className="allocation-result-icon" aria-hidden="true"><Icon name="chart" /></span><span><strong>{t("Thử phương án phân bổ khác", "Try another allocation")}</strong><small>{t("Chọn cách chia đã công bố để đối chiếu với hồ sơ của bạn.", "Choose a published allocation to compare against your profile.")}</small></span><span className="allocation-result-toggle" aria-hidden="true">+</span></summary>
        <div className="allocation-alternatives-body"><div className="allocation-custom-top"><span>{t("Tổng tỷ trọng", "Total weight")} <strong>{data.allocations.length ? "100%" : "—"}</strong></span><button type="button" className="remaining-text" onClick={() => select("")}>{t("Đặt lại theo câu trả lời", "Reset to answers")}</button></div>
          {!!data.allocations.length && ring(true)}
          <div className="allocation-template-options">{policy.data.templates.map(item => <button type="button" key={item.id} className="allocation-template-choice" aria-pressed={item.id === template?.id} disabled={!assessment?.eligibleTemplateIds.includes(item.id) || loading} onClick={() => select(item.id)}>{item.label}{item.id === template?.id && <Icon name="check" />}</button>)}</div>
          <div className="allocation-weight-preview">{data.allocations.map((row, i) => <div key={row.assetClass} className="allocation-weight-row" style={{ "--allocation-asset": color(row.assetClass, i) } as CSSProperties}><div><strong><i />{label(row.assetClass)}</strong><span>{num(Number(row.weightPercent))}%</span></div><div className="allocation-weight-track" role="img" aria-label={`${label(row.assetClass)}: ${num(Number(row.weightPercent))}%`}><span style={{ width: `${row.weightPercent}%` }} /></div><footer><span>{purpose(row.assetClass)}</span><strong>{money(row.amountVnd)}</strong></footer></div>)}</div>
          <p className="allocation-result-footnote">{t("Tỷ trọng đi theo từng phương án đã công bố. Khi đổi phương án, hệ thống tính lại mức giảm và số tiền; kế hoạch chính chưa thay đổi.", "Weights follow each published allocation. Switching recalculates its loss and amounts without changing your main plan.")}</p>
          <div className="allocation-result-callout"><Icon name="info" /><p>{assessment?.eligibleTemplateIds.length === 1 ? t("Hiện có một phương án phù hợp với câu trả lời và thời gian đã chọn.", "One allocation currently matches your answers and horizon.") : t("Chỉ các phương án phù hợp với hồ sơ hiện tại mới có thể chọn.", "Only allocations matching your current profile can be selected.")}</p></div>
          <button type="button" className="overview-button secondary" disabled={!template || p?.status !== "READY"} onClick={onRebalance}>{t("Đề xuất tái cân bằng", "Rebalance proposal")}</button>
        </div>
      </details>
    </section>
    <section className="allocation-result-why" id="allocation-result-why"><h2>{usable ? t("Vì sao phương án này phù hợp?", "Why does this allocation fit?") : t("Vì sao cần rà soát phương án?", "Why does this allocation need review?")}</h2><p>{t("Ba cơ sở cần đối chiếu trước khi đưa danh mục vào kế hoạch nghỉ hưu.", "Three checks before using the portfolio in your retirement plan.")}</p><ol>{criteria.map(item => <li key={item.title} className={item.known ? "is-valid" : "is-review"}><span className="allocation-criterion-icon" aria-hidden="true"><Icon name={item.known ? "check" : "info"} /></span><div><h3>{item.title}</h3><p>{item.detail}</p></div></li>)}</ol>
      <details className="allocation-policy-comparison"><summary>{t("Đối chiếu các cách chia vốn đã công bố", "Compare published allocations")}</summary><div className="allocation-comparison-scroll" role="region" tabIndex={0} aria-label={t("Bảng đối chiếu phương án phân bổ", "Published allocation comparison")}><table><caption>{t("Tỷ trọng tham chiếu tại tháng định giá; kết quả áp dụng do máy chủ kiểm tra lại.", "Reference weights at valuation; the server verifies each selection.")}</caption><thead><tr><th>{t("Phương án", "Allocation")}</th><th>{t("Cách chia vốn", "Capital allocation")}</th><th>{t("Theo hồ sơ hiện tại", "Profile eligibility")}</th></tr></thead><tbody>{policy.data.templates.map(item => <tr key={item.id} className={item.id === template?.id ? "is-current" : ""}><th scope="row">{item.label}</th><td>{weightsFor(item).length ? weightsFor(item).map(row => `${label(row.assetClass)} ${num(Number(row.weightPercent))}%`).join(" · ") : t("Cần xác nhận mốc thời gian", "Confirm projection dates")}</td><td>{assessment?.eligibleTemplateIds.includes(item.id) ? t("Có thể chọn", "Eligible") : t("Chưa phù hợp", "Not eligible")}</td></tr>)}</tbody></table></div></details>
    </section>

    <footer className="allocation-result-next"><div><strong>{t("Đã chọn được phương án?", "Ready to review your plan?")}</strong><p>{t("Mở Kế hoạch để xem mức cần góp, lưu và xác nhận khi sẵn sàng.", "Open your plan to review contributions, save and confirm when ready.")}</p></div><Link className="overview-button secondary" to="/user/plan">{t("Xem kế hoạch nghỉ hưu →", "View retirement plan →")}</Link></footer>
    <details className="allocation-result-details"><summary>{t("Lộ trình và các kịch bản đã công bố", "Published allocation path and scenarios")}</summary><div><section className="allocation-life"><h2><Explain term="glidePath">{t("Lộ trình đến nghỉ hưu", "Path to retirement")}</Explain></h2><p>{years === null ? t("Chưa xác nhận tháng nghỉ hưu.", "Retirement month not confirmed.") : t(`Còn ${years} năm tròn đến tháng nghỉ hưu đã chọn.`, `${years} whole years to your retirement month.`)}</p>{template && ("glidePath" in template ? <PortfolioGlidePath points={template.glidePath.points} month={data.valuationDate.slice(0, 7)} retirementMonth={retirementMonth} language={language} assetLabels={data.assetLabels} /> : <p>{t("Phương án dùng lịch phân bổ theo các tháng đã công bố.", "This portfolio follows its published monthly allocation schedule.")}</p>)}</section>{p?.scenarios.length ? <PortfolioScenarios scenarios={p.scenarios} language={language} /> : null}</div></details>
    <ResponsiveDialog open={packages} title={t("Gợi ý gói đầu tư phù hợp", "Explore investment products")} className="user-workspace-dialog allocation-products-dialog" onClose={() => setPackages(false)}><p>{t("Đối chiếu các nhóm tài sản trong phương án với thông tin sản phẩm đã công bố. Chưa đặt lệnh hoặc chuyển tiền.", "Compare the allocation's asset classes with published product information. No orders or transfers are made.")}</p><dl>{data.allocations.map(row => <div key={row.assetClass}><dt>{label(row.assetClass)} · {num(Number(row.weightPercent))}%</dt><dd>{money(row.amountVnd)}</dd></div>)}</dl><p>{t("Đề xuất sản phẩm đã duyệt thuộc kế hoạch chính đang dùng; bản phân bổ đang thử cần được xem lại và xác nhận tại Kế hoạch trước.", "Approved product recommendations belong to your main plan. Review and confirm this trial allocation in Plan first.")}</p><div className="allocation-package-actions"><Link className="overview-button secondary" to="/user/explore" onClick={() => setPackages(false)}>{t("Khám phá sản phẩm", "Explore products")}</Link><Link className="overview-button primary" to="/user/explore?tab=matched" onClick={() => setPackages(false)}>{t("Sản phẩm theo kế hoạch →", "Plan products →")}</Link></div></ResponsiveDialog>
  </section>;
}
