import { Link } from "react-router";
import { useI18n } from "../../i18n";
import { Button } from "../ui";
import type { RetirementPreviewResult } from "../../services/retirement";
import type { AdjustmentOptions, Allocation, ReadWarning } from "../../services/planningAnalysis";
import "./planning-analysis.css";

export function useAnalysisText() { const { language } = useI18n(); return (vi: string, en: string) => language === "en" ? en : vi; }
// Formatting only. All financial quantities and decisions come from the server.
export function displayNumber(value: string | number | null | undefined, en = false, suffix = "") {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? (en ? "Undetermined" : "Chưa xác định") : `${new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;
}
const statusText: Record<string, [string, string]> = {
  DATA_REQUIRED: ["Chưa có dữ liệu thị trường đủ điều kiện để mô phỏng", "Eligible market data is not available"],
  REVIEW_REQUIRED: ["Cần rà soát dữ liệu hoặc cấu hình trước khi kết luận", "Data or configuration needs review before a conclusion"],
  INCOMPLETE: ["Thông tin chưa đầy đủ — cần bổ sung các mục bên dưới", "Incomplete information — complete the items below"],
  INSUFFICIENT: ["Chưa có phương án đạt ngưỡng bảo vệ chi thiết yếu", "No candidate meets the essential-spending threshold"],
  LIMIT_EXCEEDED: ["Đã chạm giới hạn tính toán. Giảm số đường đi hoặc thử lại sau; chưa có kết quả hoàn chỉnh.", "Calculation limit reached. Reduce paths or retry later; no complete estimate is available."],
  READY: ["Đã có kết quả tính — xem phạm vi và giới hạn bên dưới", "Result available — review its scope and limitations below"],
  WITHIN_LIMIT: ["Mức lỗ mô hình nằm trong giới hạn đã khai", "Modeled loss is within the declared limit"],
  REDUCE_RISK: ["Mức lỗ vượt giới hạn — cần giảm rủi ro", "Modeled loss exceeds the limit — reduce risk"],
  NOT_FEASIBLE: ["Chưa tìm được phương án khả thi trong phạm vi đã kiểm tra", "No feasible option in the evaluated range"],
  NOT_APPLICABLE: ["Không áp dụng cho kế hoạch này", "Not applicable to this plan"],
  NOT_NEEDED: ["Chưa cần điều chỉnh theo kết quả hiện tại", "No adjustment needed for the current result"],
  FOUND: ["Đã tìm thấy trong phạm vi kiểm tra", "Found within the evaluated range"],
  WITHIN_BAND: ["Chưa vượt dải lệch; tiền góp mới chưa được phân bổ", "Within the drift band; new contributions remain unallocated"],
  PROPOSED: ["Đề xuất tái cân bằng — chưa giao dịch, chưa lưu nhật ký", "Rebalance proposal — no trades executed or decision log saved"],
};
const issueText: Record<string, [string, string]> = {
  INCOME_STABILITY_REQUIRED: ["Hãy khai độ ổn định thu nhập để xác định dự phòng.", "Declare income stability to determine the reserve."],
  GOALS_REQUIRED: ["Hãy khai mục tiêu hoặc xác nhận không có mục tiêu khác.", "Declare goals or confirm there are none."],
  GOAL_AMOUNT_REQUIRED: ["Bổ sung số tiền của mục tiêu theo giá hôm nay.", "Enter the goal amount at today's prices."],
  GOAL_DUE_MONTH_REQUIRED: ["Bổ sung tháng cần tiền cho mục tiêu.", "Enter the goal due month."],
  GOAL_INFLATION_REQUIRED: ["Xác nhận lạm phát riêng hoặc chọn dùng bộ giả định.", "Confirm custom inflation or choose pinned assumptions."],
  UNKNOWN_VALUE: ["Có số liệu chưa biết; hãy bổ sung tại hồ sơ.", "Some values are unknown; complete the profile."],
  VALUATION_DATE_REQUIRED: ["Cần xác nhận ngày định giá tài sản.", "Confirm the asset valuation date."],
  FX_RULE_REQUIRED: ["Chưa có quy tắc quy đổi ngoại tệ được duyệt.", "An approved currency conversion rule is required."],
  EMERGENCY_RESERVE_SHORTFALL: ["Phần dự phòng đã khai chưa đủ; xem số tiền cần bổ sung.", "The declared emergency reserve is insufficient; review the shortfall."],
  OTHER_GOALS_CAPITAL_SHORTFALL: ["Vốn đã dành cho mục tiêu chưa đủ so với nhu cầu gần hạn.", "Declared goal capital is below the near-term requirement."],
  PROTECTED_CAPITAL_EXCEEDS_RETIREMENT_ASSETS: ["Tổng vốn đầu tư thanh khoản chưa đủ dự phòng và mục tiêu gần hạn. Vốn tăng trưởng đang âm.", "Liquid investable assets do not cover reserves and near-term goals. Growth capital is negative."],
  LIQUIDITY_NEEDS_REQUIRE_GOAL_RECONCILIATION: ["Đối chiếu tiền cần trong 1/3/5 năm với danh sách mục tiêu. Chưa kết luận mọi nhu cầu đã được bảo đảm.", "Reconcile 1/3/5-year needs with goals. Coverage of all needs has not been established."],
  LOSS_TOLERANCE_REQUIRED: ["Cần khai cả số tiền và tỷ lệ lỗ chịu được; chưa thể kết luận đạt giới hạn.", "Both loss amount and percentage are required before assessing the limit."],
  NONNEGATIVE_GROWTH_CAPITAL_REQUIRED: ["Cần đủ thông tin tách vốn và vốn tăng trưởng không âm.", "Complete capital separation and nonnegative growth capital are required."],
  APPROVED_LOSS_STRESS_REQUIRED: ["Chưa có cấu hình cú sốc được duyệt trong chính sách đã ghim.", "The pinned policy has no approved loss-stress configuration."],
  PUBLISHED_MONTHLY_TOTAL_RETURN_DATA_REQUIRED: ["Chưa có chuỗi tổng lợi nhuận theo tháng được cấp phép và công bố. Bạn không cần tự nhập lợi suất.", "No licensed, published monthly total-return history is available. You do not need to enter returns."],
  HISTORY_OR_ASSET_COVERAGE_REQUIRED: ["Dữ liệu chưa đủ kỳ lịch sử hoặc chưa phủ các nhóm tài sản.", "History is too short or does not cover the asset classes."],
  NO_PROPERTY_RELEASE_IN_STRESS_WINDOW: ["Không có khoản bán bất động sản trong thời gian thử thách.", "There is no property sale within the stress window."],
  CONTRIBUTION_ESTIMATE_USES_CURRENT_FEE_SCHEDULE_REPREVIEW_REQUIRED: ["Khoản góp cần dùng lịch phí hiện tại. Hãy xem trước lại khi thay đổi khoản góp để tính lại phí.", "The contribution estimate uses the current fee schedule. Preview again after changing contributions."],
  ADVISORY_FEE_REFORECAST_REVIEW_REQUIRED: ["Kế hoạch có phí tư vấn chưa hỗ trợ tính lại từ số dư thực tế. Hãy tạo bản xem trước mới và giữ khoản phí đã chọn.", "Actual-balance reforecast is not supported for advisory-fee plans. Create a fresh preview retaining the fee."],
};
export function Issues({ issues = [] }: { issues?: Array<string | { code: string; path?: string }> }) {
  const t = useAnalysisText();
  return issues.length ? <ul>{issues.map((issue, i) => { const code = typeof issue === "string" ? issue : issue.code;
    const fallback: [string, string] = /DEPOSIT_|ASSUMPTIONS_|APPROVED_|STRESS_ASSET|POLICY_|PROJECTION_NOT/.test(code)
      ? ["Cấu hình đã ghim chưa đủ hoặc chưa được duyệt; cần quản trị viên rà soát. Không thay bằng giả định tự đặt.", "Pinned configuration is incomplete or unapproved; administrator review is required. No substitute assumptions are used."]
      : /LIMIT/.test(code) ? ["Phép tính đã chạm giới hạn; chưa thể kết luận. Thử phạm vi nhỏ hơn hoặc thử lại sau.", "The calculation reached a limit; no conclusion is available. Try a smaller scope or retry later."]
      : ["Cần rà soát thông tin hoặc lịch nguồn của kế hoạch trước khi tính. Xem chi tiết để đối chiếu với hỗ trợ.", "Plan inputs or source schedules need review. Use the details when contacting support."];
    return <li key={`${code}-${i}`}>{t(...(issueText[code] ?? fallback))}<details><summary>{t("Chi tiết đối chiếu", "Reference details")}</summary><code>{code}{typeof issue !== "string" && issue.path ? ` · ${issue.path}` : ""}</code></details></li>; })}</ul> : null;
}
export function AnalysisStatus({ status, issues }: { status: string; issues?: Array<string | { code: string; path?: string }> }) {
  const t = useAnalysisText(); return <div className="planning-status" role="status"><strong>{t(...(statusText[status] ?? statusText.REVIEW_REQUIRED))}</strong>
    {status === "DATA_REQUIRED" && <p>{t("Mô phỏng sẽ khả dụng khi bộ dữ liệu phù hợp được duyệt và công bố. Hiện chưa có xác suất hay biểu đồ để hiển thị. Bạn vẫn có thể xem kế hoạch theo giả định đã ghim.", "Simulation becomes available when suitable data is approved and published. No probability or chart is available yet. You can still review your plan using pinned assumptions.")}</p>}<Issues issues={issues} /></div>;
}
export function Allocations({ rows = [] }: { rows?: Allocation[] }) {
  const t = useAnalysisText(); const names: Record<string, [string, string]> = { CASH: ["Tiền gửi", "Deposits"], GOV_BOND: ["Trái phiếu chính phủ", "Government bonds"], EQUITY: ["Cổ phiếu", "Equities"], GOLD: ["Vàng", "Gold"] };
  return <ul>{rows.map(row => <li key={row.assetClass}>{names[row.assetClass] ? t(...names[row.assetClass]) : row.assetClass}: {displayNumber(row.weightPercent, t("vi", "en") === "en", "%")}</li>)}</ul>;
}
export function Adjustments({ data }: { data: AdjustmentOptions }) {
  const t = useAnalysisText(); const en = t("vi", "en") === "en";
  return <section><h3>{t("Ba hướng điều chỉnh", "Three ways to adjust")}</h3><AnalysisStatus status={data.status} issues={data.issues} /><dl>
    <div><dt>{t("Góp thêm — khoản góp mỗi tháng cần có", "Contribute more — required monthly contribution")}</dt><dd>{displayNumber(data.requiredMonthlyContribution, en, " VND")}</dd>{data.contributionWithinCapacity != null && <p>{data.contributionWithinCapacity ? t("Trong khả năng góp đã khai", "Within declared capacity") : t("Vượt khả năng góp đã khai", "Above declared capacity")}</p>}</div>
    <div><dt>{t("Nghỉ muộn — tháng sớm nhất đã xác nhận khả thi", "Retire later — earliest confirmed feasible month")}</dt><dd>{data.retirementSearchStatus === "FOUND" ? data.earliestFeasibleRetirementMonth : t("Chưa xác định", "Undetermined")}</dd><AnalysisStatus status={data.retirementSearchStatus ?? "REVIEW_REQUIRED"} />{data.feasibleRetirementCandidate && data.retirementSearchStatus !== "FOUND" && <p>{t("Tháng ứng viên, chưa xác nhận là sớm nhất: ", "Candidate month, not certified earliest: ")}{data.feasibleRetirementCandidate}</p>}</div>
    <div><dt>{t("Chi ít hơn — mức chi tối đa theo giá hôm nay", "Spend less — maximum spending at today's prices")}</dt><dd>{data.expenseSearchStatus === "FOUND" ? displayNumber(data.maximumFeasibleMonthlyExpenseToday, en, " VND") : t("Chưa xác định", "Undetermined")}</dd><AnalysisStatus status={data.expenseSearchStatus ?? "REVIEW_REQUIRED"} /></div>
  </dl><p>{t("Đây là điều chỉnh theo giả định cố định; cần xem trước và mô phỏng lại sau khi đổi. Không tự nâng lợi suất hoặc thay lịch hợp đồng.", "These adjustments use fixed assumptions. Preview and simulate again after changes. Returns and contractual schedules are not adjusted automatically.")}{data.endMonth && ` ${t("Tháng kết thúc giữ nguyên", "End month retained")}: ${data.endMonth}.`}</p></section>;
}
export function HorizonWarnings({ warnings, onRecalculate }: { warnings?: ReadWarning[]; onRecalculate?: (month: string) => void }) {
  const t = useAnalysisText(); return <>{warnings?.map((w, i) => <div className="planning-analysis" role="alert" key={i}><h3>{t("Kế hoạch bị cắt ngắn, nên tính lại", "The plan horizon is truncated; recalculate")}</h3><p>{t("Kết thúc đã lưu", "Saved end")}: {w.endMonth}. {t("Mốc cần tính tới theo mục tiêu hiện tại", "Expected end for the current goal")}: {w.expectedEndMonth}.</p>{onRecalculate && <Button onClick={() => onRecalculate(w.expectedEndMonth)}>{t("Xem trước tới mốc đầy đủ", "Preview the full horizon")}</Button>}</div>)}</>;
}
export function PreviewInsights({ preview }: { preview: RetirementPreviewResult | null }) {
  const t = useAnalysisText(); const en = t("vi", "en") === "en"; if (!preview) return null;
  const c = preview.capitalSeparation, loss = preview.lossConstraint, coverage = preview.essentialCoverage;
  const money = (v: string | number | null | undefined) => displayNumber(v, en, " VND");
  return <>
    {c && <section className="planning-analysis" data-testid="capital-separation"><h2>{t("Dự phòng / mục tiêu gần hạn / vốn tăng trưởng", "Reserve / near-term goals / growth capital")}</h2><p>{t("Thông tin tách vốn — chưa áp dụng vào quỹ hưu trí đang tính. Dùng giả định cơ sở đã ghim, độc lập với kịch bản.", "Informational capital separation — not applied to the current retirement fund calculation. Uses pinned base assumptions, independently of the scenario.")}</p><AnalysisStatus status={c.status} issues={c.issues} /><Issues issues={c.warnings} />
      <dl className="planning-grid">{([
        [t("Tổng vốn đầu tư thanh khoản", "Liquid investable capital"), c.investableLiquidAssets], [t("Dự phòng cần có", "Required reserve"), c.requiredEmergencyReserve],
        [t("Dự phòng đã khai", "Declared reserve"), c.declaredEmergencyReserve], [t("Dự phòng cần bổ sung", "Reserve shortfall"), c.emergencyShortfall],
        [t("Vốn dành cho mục tiêu đã khai", "Declared goal capital"), c.declaredOtherGoalsCapital], [t("Vốn giữ cho mục tiêu gần hạn (giá trị hiện tại)", "Near-term goal capital (present value)"), c.nearTermGoalsPresentValue],
        [t("Vốn tăng trưởng", "Growth capital"), c.growthCapital], [t("Phần tài sản dành cho hưu trí — tham chiếu", "Retirement asset share — reference"), c.retirementLiquidAssets],
      ] as const).map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{money(v)}</dd></div>)}</dl>
      <p>{t("Tháng định giá", "Valuation month")}: {c.valuationMonth} · {t("Số tháng dự phòng", "Reserve months")}: {displayNumber(c.reserveMonths, en)} · {t("Chi thiết yếu mỗi tháng", "Monthly essential expenses")}: {money(c.essentialMonthlyExpense)}.</p>
      {c.goals.map(g => <details key={g.id}><summary>{t("Mục tiêu", "Goal")} {g.id} · {g.dueMonth}</summary><p>{g.treatment === "LONG_TERM" ? t("Mục tiêu trên 60 tháng: chưa tính giá trị tương lai/hiện tại trong phần tách vốn này.", "Beyond 60 months: future/present values are not calculated in this separation.") : t("Đã giữ vốn cho mục tiêu trong 60 tháng, kể cả sau nghỉ hưu.", "Capital reserved within 60 months, including after retirement.")}</p><p>{t("Số tháng tới hạn", "Months until due")}: {g.monthsUntilDue} · {t("Giá trị tương lai", "Future value")}: {money(g.futureAmount)} · {t("Giá trị hiện tại", "Present value")}: {money(g.presentValue)}</p><p>{t("Nguồn lạm phát / tiền gửi", "Inflation / deposit sources")}: {[...g.inflationSourceIds, ...g.depositSourceIds].join(", ") || t("Chưa có", "Unavailable")}</p></details>)}
      <p>{t("Bộ giả định đã ghim", "Pinned assumptions")}: {preview.references.assumptionVersionId} · {preview.references.assumptionVersion}</p><Link to="/user/account?tab=profile">{t("Bổ sung hồ sơ và đối chiếu mục tiêu", "Complete profile and reconcile goals")}</Link>
    </section>}
    {loss && <section className="planning-analysis" data-testid="loss-constraint"><h2>{t("Nếu thị trường có cú sốc", "If the market suffers a shock")}</h2><AnalysisStatus status={loss.status} issues={loss.issues} /><p>{en ? t("", "The shock uses the pinned policy and growth capital. The proposal is informational and is not applied automatically.") : loss.message}</p><dl className="planning-grid">
      <div><dt>{t("Mức lỗ mô hình", "Modeled loss")}</dt><dd>{money(loss.lossAmount)}</dd></div><div><dt>{t("Giới hạn lỗ theo số tiền và tỷ lệ bạn khai", "Loss limit from your declared amount and percentage")}</dt><dd>{money(loss.allowedLossAmount)}</dd></div>
      <div><dt>{t("Lỗ so với vốn tăng trưởng", "Loss as a share of growth capital")}</dt><dd>{displayNumber(loss.lossPercentOfGrowth, en, "%")}</dd></div><div><dt>{t("Lỗ so với tổng vốn đầu tư", "Loss as a share of investable assets")}</dt><dd>{displayNumber(loss.lossPercentOfInvestableAssets, en, "%")}</dd></div>
    </dl><p>{loss.exceedsTolerance === null ? t("Chưa thể so sánh với mức chịu lỗ đã khai.", "Cannot yet compare against the declared tolerance.") : loss.exceedsTolerance ? t("Vượt mức chịu lỗ đã khai.", "Exceeds the declared tolerance.") : t("Không vượt mức chịu lỗ đã khai trong cú sốc này.", "Does not exceed the declared tolerance for this shock.")}</p>
      {loss.proposedAllocations.length > 0 && <><h3>{t("Minh họa giảm cổ phiếu — chưa áp dụng", "Illustrative equity reduction — not applied")}</h3><p>{t("Trần cổ phiếu khả thi khi chỉ giảm từ mức hiện tại", "Feasible equity cap when reducing from the current allocation")}: {displayNumber(loss.maxEquityWeightPercent, en, "%")}. {t("Lỗ còn lại của phương án", "Remaining modeled loss")}: {money(loss.proposedLossAmount)}.</p><Allocations rows={loss.proposedAllocations} /></>}
    </section>}
    {coverage && <section className="planning-analysis"><h2>{t("Chi thiết yếu có được đáp ứng?", "Are essential expenses covered?")}</h2><p>{t("Ưu tiên phân loại nguồn còn lại cho chi thiết yếu. Chi khác có thể gồm nợ, phí và y tế; không có nghĩa có thể bỏ các khoản đó.", "Remaining resources are classified toward essentials first. Other expenses may include debt, fees and healthcare; they are not necessarily optional.")}</p><p>{t("Tổng thiếu hụt thiết yếu", "Total essential shortfall")}: <strong>{money(coverage.essentialShortfall)}</strong></p><p>{t("Tháng thiếu đầu tiên", "First shortfall month")}: {coverage.firstEssentialShortfallMonth ?? (coverage.essentialShortfall == null ? t("Chưa xác định", "Undetermined") : t("Chưa ghi nhận", "None reported"))}</p>
      <details><summary>{t("Chi tiết theo tháng", "Monthly detail")}</summary><div className="planning-table"><table><thead><tr>{[t("Tháng", "Month"), t("Chi thiết yếu", "Essential expense"), t("Thiếu hụt thiết yếu", "Essential shortfall"), t("Thiếu hụt chi khác", "Other expense shortfall")].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{coverage.rows.map(r => <tr key={r.month}><td>{r.month}</td><td>{money(r.essentialExpense)}</td><td>{money(r.essentialShortfall)}</td><td>{money(r.otherShortfall)}</td></tr>)}</tbody></table></div></details>
    </section>}
    {preview.adjustmentOptions && <section className="planning-analysis"><Adjustments data={preview.adjustmentOptions} /></section>}
    {!!preview.decisionExplanations?.length && <section className="planning-analysis"><h2>{t("Vì sao có kết quả này?", "Why this result?")}</h2>{preview.decisionExplanations.map((e, i) => <p key={i}>{en ? ({ GOAL_CAPITAL_RESERVED: "Near-term goal capital uses the pinned inflation and deposit assumptions.", GROWTH_CAPITAL: "Growth capital is what remains after emergency reserves and near-term goals.", PORTFOLIO_HORIZON: "The allocation follows the pinned policy for the time remaining until retirement.", PLAN_FUNDED: "The deterministic plan covers its modeled cash flows to the end month. This is not a success probability.", PLAN_NOT_FUNDED: "The plan is not fully funded. Review contributions, retirement timing and spending.", LOSS_CONSTRAINT: "Review the modeled loss against your declared tolerance above.", REVIEW_REQUIRED: "Employer concentration and liquidity-to-goal reconciliation still require review." } as Record<string, string>)[e.code] ?? "Further review is required. Server explanation: " + e.text : e.text}</p>)}</section>}
    {preview.selection?.advisoryFee && <section className="planning-analysis"><h2>{t("Phí tư vấn trong dòng tiền", "Advisory fees in cash flows")}</h2><p>{t("Chỉ tính phí tư vấn bổ sung; không trừ lại phí quản lý đã có trong NAV. Phí dựa trên bình quân quỹ hai đầu tháng, không phải bình quân ngày.", "Only additional advisory fees are charged; NAV management fees are not deducted again. The fee uses the average of month opening and closing fund values, not a daily average.")}</p><div className="planning-table"><table><thead><tr>{[t("Tháng", "Month"), t("Quỹ bình quân", "Average fund"), t("Phí", "Fee"), t("Nguồn trả", "Paid from")].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{preview.calculation?.rows.filter(r => r.advisoryFeeAmount !== undefined).map(r => <tr key={r.month}><td>{r.month}</td><td>{money(r.advisoryFeeAverageFund)}</td><td>{money(r.advisoryFeeAmount)}</td><td>{r.advisoryFeePaidFrom === "FUND" ? t("Rút quỹ cuối tháng", "Month-end fund withdrawal") : t("Ngân sách hộ — vẫn kiểm tra thiếu tiền", "Household budget — shortfalls still checked")}</td></tr>)}</tbody></table></div></section>}
  </>;
}
