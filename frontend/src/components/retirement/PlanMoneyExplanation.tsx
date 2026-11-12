import { Link } from "react-router";
import { useI18n } from "../../i18n";
import type { RetirementPreviewResult, RetirementRow } from "../../services/retirement";
import { Decimal } from "../../utils/decimal";
import { financeAmount } from "../../utils/financeHubSummary";
import { formatMoneyDecimal, formatCompactMoneyDecimal } from "../../utils/moneyDisplay";
import { formatMonthVN } from "../../utils/date";
import MoneyExplanationDialog, { type MoneyExplanation } from "../MoneyExplanationDialog";

export type PlanMoneyMetric = "required" | "projected" | "gap" | "expense" | "capacity";

// Present the displayed server projection; do not run a second retirement model.
export function planMoneyExplanation(metric: PlanMoneyMetric, preview: RetirementPreviewResult, en: boolean): MoneyExplanation | null {
  const calc = preview.calculation;
  if (!calc) return null;
  const s = calc.summary, rows = calc.rows;
  const t = (vi: string, english: string) => en ? english : vi;
  const money = (v: string | null | undefined) => formatMoneyDecimal(v, en);
  const monthly = (v: string | null | undefined) => `${money(v)}${en ? "/month" : "/tháng"}`;
  const add = (...values: Array<string | null | undefined>) => values.every(v => financeAmount(v) !== null) ? values.reduce<Decimal>((total, v) => total.plus(v!), new Decimal(0)).toString() : null;
  const sum = (part: RetirementRow[], key: keyof RetirementRow) => part.length === s.accumulationMonths ? add(...part.map(row => financeAmount(row[key]))) : null;
  const accumulation = rows.filter(row => row.month < s.retirementMonth);
  const retired = rows.find(row => row.month === s.retirementMonth);
  const first = rows[0];
  const gap = financeAmount(s.atRetirement.fundingGap);
  const missing = gap === null ? null : Decimal.max(0, gap).toString();
  const isShort = gap !== null && new Decimal(gap).gt(0);
  const timing = calc.conventions?.contributionTiming;
  const date = formatMonthVN(s.retirementMonth);
  const titles: Record<PlanMoneyMetric, string> = { required: t("Quỹ cần khi nghỉ hưu", "Fund needed at retirement"), projected: t("Quỹ dự kiến có", "Projected fund"), gap: t("Phần còn thiếu", "Remaining gap"), expense: t("Chi tiêu lúc nghỉ hưu", "Spending in retirement"), capacity: t("Khả năng ngân sách", "Contribution capacity") };
  const values = { required: s.atRetirement.requiredFund, projected: s.atRetirement.projectedFund, gap: missing, expense: s.futureMonthlyExpense, capacity: first?.contributionCapacity };
  const data: MoneyExplanation = {
    title: `${t("Giải thích", "Explanation")}: ${titles[metric]}`, label: titles[metric], value: money(values[metric]),
    subtitle: `${t("Tại tháng nghỉ hưu", "At retirement in")} ${date}`, description: "", steps: [], result: money(values[metric]),
    parameters: [t(`Tích lũy: ${s.accumulationMonths} tháng`, `Accumulation: ${s.accumulationMonths} months`), t(`Chi tiêu nghỉ hưu: ${s.retirementMonths} tháng, đến ${formatMonthVN(s.endMonth)}`, `Retirement: ${s.retirementMonths} months, through ${formatMonthVN(s.endMonth)}`)],
  };
  const step = (label: string, value: string, description?: string) => data.steps.push({ label, value, description });
  if (metric === "required") {
    data.label = t("Mục tiêu quỹ hưu trí của bạn", "Your retirement fund target");
    data.description = t("Số vốn cần có tại tháng nghỉ hưu để trang trải các khoản rút trong suốt kế hoạch, sau nguồn thu và lương hưu được tính. Mô hình giữ cả số dư cuối kỳ bạn đã chọn.", "Capital needed at retirement to cover withdrawals throughout the plan, after included income and pension, while preserving your selected terminal balance.");
    step(t("Chi tiêu sinh hoạt tháng đầu nghỉ hưu", "First retirement month's living expenses"), monthly(s.futureMonthlyExpense));
    step(t("Nguồn thu và lương hưu tháng đầu", "First retirement month's income and pension"), monthly(retired ? add(retired.income, retired.pension) : null), t("Chỉ tính các nguồn có hiệu lực trong tháng này.", "Only income effective in this month is included."));
    step(t("Trả nợ và khoản chi khác tháng đầu", "First retirement month's debt and other expenses"), monthly(retired ? add(retired.debtPayment, retired.additionalExpense) : null));
    step(t("Khoản cần rút từ quỹ tháng đầu", "First retirement month's required withdrawal"), monthly(retired?.withdrawal), t("Bao gồm phí trả từ quỹ nếu đã chọn; không trừ phí lần nữa.", "Includes fund-paid fees where selected; fees are not deducted again."));
    step(t("Số dư mong muốn cuối kế hoạch", "Desired end-of-plan balance"), money(s.terminalTarget));
    data.result = `${t("Tính ngược", "Work backward over")} ${s.retirementMonths} ${t("tháng", "months")} → ${money(s.atRetirement.requiredFund)}`;
    data.note = t("Từng tháng, cộng khoản rút vào số dư cần ở cuối tháng, trừ tiền góp và vốn giải phóng rồi chia hệ số tăng trưởng; tối thiểu bằng 0. Lùi từ cuối kế hoạch tới tháng nghỉ hưu. Các hệ số theo dự phóng đang xem, không dùng một lãi suất cố định thay thế.", "For each month, add withdrawals to the required closing balance, subtract contributions and released capital, then divide by growth and floor at zero. Work back to retirement using the displayed projection's monthly factors.");
    data.formula = { expression: "Kₜ₋₁ = max(0; (Kₜ + Wₜ − Cₜ − Jₜ) ÷ Gₜ)", description: t("K: vốn cần có; W: khoản rút; C: tiền góp; J: vốn giải phóng; G: hệ số tăng trưởng của tháng. Khởi đầu từ số dư mong muốn cuối kế hoạch.", "K: required capital; W: withdrawals; C: contributions; J: capital releases; G: monthly growth factor. Start from the desired terminal balance.") };
  } else if (metric === "projected") {
    data.label = t("Quỹ tích lũy dự kiến của bạn", "Your projected accumulated fund");
    data.description = t("Số dư dự kiến ở đầu tháng nghỉ hưu, hình thành từ vốn đầu kỳ, các khoản góp thực sự trong mô hình, tăng trưởng, vốn được giải phóng và khoản rút trước nghỉ hưu.", "Projected balance at the start of retirement, from opening capital, modeled contributions, growth, capital releases and pre-retirement withdrawals.");
    data.parameters!.push(timing === "START_OF_MONTH" ? t("Góp vào đầu tháng theo nguồn tiền đã xác nhận.", "Contributions at the start of each month using confirmed available funds.") : timing === "END_OF_MONTH" ? t("Góp vào cuối tháng.", "Contributions at the end of each month.") : t("Thời điểm góp theo phiên bản đang xem.", "Contribution timing follows the displayed version."));
    const contributions = sum(accumulation, "contribution"), growth = sum(accumulation, "investmentChange"), injections = sum(accumulation, "capitalInjection"), withdrawals = sum(accumulation, "withdrawal");
    step(t("Vốn dành cho hưu trí đầu kỳ", "Opening retirement capital"), money(s.initialRetirementCapital));
    step(t("Tổng tiền góp trong giai đoạn tích lũy", "Total modeled accumulation contributions"), money(contributions), t("Cộng tiền góp của từng tháng, đã xét ngân sách; không lấy mức chọn nhân số tháng.", "Sum each month's modeled deposit after budget limits, rather than multiplying the selected deposit by the number of months."));
    step(t("Tăng trưởng của vốn và tiền góp", "Growth of capital and contributions"), money(growth), t("Có thể âm theo kịch bản đang xem.", "Can be negative under the selected scenario."));
    if (injections !== "0") step(t("Vốn được giải phóng trước nghỉ hưu", "Capital released before retirement"), money(injections));
    if (withdrawals !== "0") step(t("Khoản rút trước nghỉ hưu", "Withdrawals before retirement"), money(withdrawals), t("Gồm phí trả từ quỹ nếu có.", "Includes fees paid from the fund, if any."));
    data.result = `${money(s.initialRetirementCapital)} + ${money(contributions)} + (${money(growth)}) + ${money(injections)} − ${money(withdrawals)} ≈ ${money(s.atRetirement.projectedFund)}`;
    data.note = t("Số tổng cộng từ các dòng tiền trong cùng dự phóng. Làm tròn chỉ khi hiển thị nên cộng các số đã làm tròn có thể lệch nhỏ. Kế hoạch có lịch góp hoặc lợi suất thay đổi được tính lần lượt từng tháng.", "Totals use cashflows from this projection. Display rounding can cause small differences when adding formatted amounts. Variable contributions and returns are applied month by month.");
    data.formula = { expression: timing?.startsWith("START") ? "Bₜ = (Bₜ₋₁ + Cₜ) × Gₜ + Jₜ − Wₜ" : "Bₜ = Bₜ₋₁ × Gₜ + Cₜ + Jₜ − Wₜ", description: t("B: số dư quỹ; C: tiền góp thực tế trong mô hình; G: hệ số tăng trưởng tháng; J: vốn giải phóng; W: khoản rút. Tính lần lượt từng tháng theo thời điểm góp. Hệ số và mức góp có thể thay đổi, nên không áp công thức góp cố định cho mọi phương án.", "B: fund balance; C: modeled contributions; G: monthly growth factor; J: capital releases; W: withdrawals. Apply month by month using contribution timing. Returns and contributions can vary, so a constant-annuity formula does not apply to every option.") };
  } else if (metric === "gap") {
    data.label = t("Chênh lệch tài chính tại mốc nghỉ hưu", "Funding gap at retirement");
    data.warning = isShort;
    data.description = gap === null ? t("Chưa đủ số liệu để xác định chênh lệch tại tháng nghỉ hưu.", "Insufficient data to determine the retirement funding gap.") : isShort ? t("Phần vốn còn thiếu so với quỹ cần tại tháng nghỉ hưu. Đây là chênh lệch tại một mốc, khác với tổng khoản chi thiếu nguồn trong suốt kế hoạch.", "Capital still needed at retirement. This gap at a single date differs from cumulative unfunded withdrawals across the plan.") : t("Quỹ dự kiến đã đạt hoặc vượt quỹ cần tại tháng nghỉ hưu, nên phần còn thiếu hiển thị bằng 0. Vẫn cần kiểm tra ngân sách và thiếu hụt ở các tháng khác.", "The projected fund meets or exceeds the fund needed at retirement, so the remaining gap is zero. Budget and other monthly shortfalls still need review.");
    step(t("Quỹ cần khi nghỉ hưu", "Fund needed at retirement"), money(s.atRetirement.requiredFund));
    step(t("Trừ quỹ dự kiến có", "Subtract the projected fund"), money(s.atRetirement.projectedFund));
    data.result = `max(0; ${money(s.atRetirement.requiredFund)} − ${money(s.atRetirement.projectedFund)}) ≈ ${money(missing)}`;
    if (gap !== null && new Decimal(gap).lt(0)) data.parameters!.push(`${t("Vượt quỹ cần", "Above required fund")}: ${money(new Decimal(0).minus(gap).toString())}`);
    data.note = isShort ? s.requiredConstantMonthlyContribution == null ? t("Chưa có mức góp đều phù hợp cho các kỳ góp hiện tại. Rà soát vốn đầu kỳ, thời điểm và chi tiêu trước khi lưu.", "No constant contribution solution is available for the current periods. Review opening capital, timing and spending before saving.") : `${t("Mức góp đều tham chiếu", "Reference constant contribution")}: ${monthly(s.requiredConstantMonthlyContribution)}. ${t("Đối chiếu ngân sách trước khi chọn.", "Check your budget before choosing it.")}` : t("Đáp ứng tại mốc nghỉ hưu không phải cam kết kết quả hay xác suất thành công.", "Meeting the target at retirement is not a guarantee or a success probability.");
  } else if (metric === "expense") {
    data.label = t("Chi tiêu tháng đầu tiên khi nghỉ hưu", "First retirement month's living expenses");
    data.value = monthly(s.futureMonthlyExpense);
    const usesPinnedSources = Boolean(preview.reforecast || preview.modelVersion === "retirement-monthly-v4");
    data.description = usesPinnedSources ? t("Chi sinh hoạt danh nghĩa của các nguồn có hiệu lực trong tháng nghỉ hưu ở dự phóng đang xem. Không lấy hồ sơ mới để thay số liệu của phiên bản đã lưu.", "Nominal living expenses from sources effective in the displayed retirement month. Current profile edits do not replace saved-version values.") : t("Số tiền cần để duy trì mức chi sinh hoạt đã chọn sau trượt giá đến tháng đầu nghỉ hưu. Trả nợ và các khoản chi khác có lịch riêng.", "The amount needed to maintain your selected living expenses after inflation through the first retirement month. Debt and other expenses have separate schedules.");
    if (!usesPinnedSources) {
      step(t("Chi tiêu mong muốn theo giá hôm nay", "Selected spending at today's prices"), monthly(preview.selection.monthlyExpenseToday));
      // This factor is display-only; the result always comes from the server.
      const factor = accumulation.length === s.accumulationMonths ? accumulation.reduce((v, row) => v * Number(row.inflationFactor), 1) : NaN;
      step(t("Hệ số trượt giá đến tháng nghỉ hưu", "Inflation factor through retirement"), Number.isFinite(factor) ? `× ${new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 6 }).format(factor)}` : t("Xem từng tháng", "See monthly factors"), t("Nhân lần lượt các hệ số lạm phát theo tháng; hệ số hiển thị được làm tròn.", "Multiply the monthly inflation factors in sequence; the displayed factor is rounded."));
    }
    step(t("Chi sinh hoạt tháng nghỉ hưu trong dự phóng", "Projected retirement-month living expenses"), monthly(retired?.livingExpense));
    data.result = monthly(s.futureMonthlyExpense);
    data.note = t("Số tiền lấy từ tháng nghỉ hưu trong cùng kết quả tính. Lạm phát theo bộ giả định hệ thống; không mặc định 3,5% cho mọi kế hoạch.", "The amount comes from the retirement month in this calculation. Inflation follows system assumptions, not a fixed 3.5% for every plan.");
  } else {
    data.label = t("Ngân sách có thể trích góp tháng đầu", "First month's contribution budget");
    data.value = monthly(first?.contributionCapacity);
    data.subtitle = first ? `${t("Tháng", "Month")} ${formatMonthVN(first.month)}` : t("Chưa có dòng tiền tháng đầu", "First-month cashflow unavailable");
    data.parameters = [timing === "START_OF_MONTH" ? t("Góp đầu tháng, có giới hạn nguồn tiền sẵn có.", "Start-of-month contributions are limited by available funds.") : t("Theo thời điểm góp của phương án đang xem.", "Uses this option's contribution timing.")];
    if (preview.replayInput?.contributionStartMonth) data.parameters.push(`${t("Tháng bắt đầu được góp", "First eligible contribution month")}: ${formatMonthVN(preview.replayInput.contributionStartMonth)}`);
    data.description = t("Phần ngân sách có thể góp vào quỹ sau sinh hoạt, trả nợ và khoản dành riêng. Khả năng góp còn chịu ràng buộc nguồn tiền ở thời điểm góp; khác với số tiền bạn đang chọn góp.", "Budget available after living costs, debt and other reserves, subject to funding availability at the contribution date. This differs from your chosen contribution.");
    const income = first ? add(first.income, first.pension) : null;
    step(t("Thu nhập và lương hưu trong tháng", "Monthly income and pension"), money(income));
    step(t("Trừ chi tiêu sinh hoạt", "Subtract living expenses"), money(first?.livingExpense));
    step(t("Trừ trả nợ", "Subtract debt payments"), money(first?.debtPayment));
    step(t("Trừ khoản chi khác và tiền dành riêng", "Subtract other spending and reserves"), money(first?.additionalExpense), t("Phí trả ngoài quỹ đã nằm trong chi khác nếu có; không trừ lại.", "External fees are already included in other expenses where applicable; do not subtract them again."));
    const household = first && income !== null ? Decimal.max(0, new Decimal(income).minus(first.livingExpense).minus(first.debtPayment).minus(first.additionalExpense)).toString() : null;
    step(t("Ngân sách còn lại, tối thiểu bằng 0", "Remaining budget, floored at zero"), money(household));
    if (timing === "START_OF_MONTH") step(t("Sau giới hạn tiền sẵn có ở đầu tháng", "After start-of-month funding limits"), money(first?.contributionCapacity));
    data.result = `max(0; ${money(income)} − ${money(first?.livingExpense)} − ${money(first?.debtPayment)} − ${money(first?.additionalExpense)}) ≈ ${money(household)}. ${t("Có thể góp", "Available contribution")}: ${monthly(first?.contributionCapacity)}`;
    data.note = t("Ngân sách âm không được biến thành khoản góp âm. Góp đầu tháng còn bị giới hạn bởi nguồn tiền đã xác nhận và tháng bắt đầu được góp. Số này không tự thay mức góp hoặc áp dụng kế hoạch.", "Negative available cash does not become a negative contribution. Start-of-month deposits also depend on confirmed funds and the first eligible month. This explanation does not change contributions or apply a plan.");
  }
  data.compactValue = `${formatCompactMoneyDecimal(values[metric], en)}${metric === "expense" || metric === "capacity" ? t("/tháng", "/month") : ""}`;
  return data;
}

export default function PlanMoneyExplanation({ metric, preview, onClose, onAdjust, onHistory }: {
  metric: PlanMoneyMetric; preview: RetirementPreviewResult; onClose: () => void; onAdjust?: () => void; onHistory?: () => void;
}) {
  const en = useI18n().language === "en";
  const data = planMoneyExplanation(metric, preview, en);
  if (!data) return null;
  const funded = metric === "gap" && !data.warning;
  const label = funded ? (en ? "View saved options" : "Xem các phương án") : metric === "required" || metric === "expense" ? (en ? "Edit plan options" : "Chỉnh sửa phương án") : (en ? "Choose contribution" : "Chọn mức góp");
  const act = funded ? onHistory : onAdjust;
  return <MoneyExplanationDialog data={data} onClose={onClose} action={act ? <button type="button" className="overview-button primary" onClick={() => { onClose(); act(); }}>{label}</button> : <Link className="overview-button primary" to={funded ? "/user/plan?view=history" : metric==="required"||metric==="expense"?"/user/plan?dialog=options":"/user/plan?dialog=contribution"} onClick={onClose}>{label}</Link>} />;
}
