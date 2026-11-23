import { Link } from "react-router";
import { useI18n } from "../../i18n";
import type { RetirementPreviewResult, RetirementRow } from "../../services/retirement";
import { Decimal } from "../../utils/decimal";
import { financeAmount } from "../../utils/financeHubSummary";
import { formatMoneyDecimal, formatCompactMoneyDecimal } from "../../utils/moneyDisplay";
import { formatMonthVN } from "../../utils/date";
import { retirementCapitalGap } from "../../utils/retirementCapitalGap";
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
  const { declared, remaining } = retirementCapitalGap(preview);
  const timing = calc.conventions?.contributionTiming;
  const date = formatMonthVN(s.retirementMonth);
  const titles: Record<PlanMoneyMetric, string> = { required: t("Quỹ cần khi nghỉ hưu", "Fund needed at retirement"), projected: t("Quỹ dự kiến có", "Projected fund"), gap: t("Phần còn thiếu", "Remaining gap"), expense: t("Chi tiêu lúc nghỉ hưu", "Spending in retirement"), capacity: t("Khả năng ngân sách", "Contribution capacity") };
  const values = { required: s.atRetirement.requiredFund, projected: s.atRetirement.projectedFund, gap: remaining, expense: s.futureMonthlyExpense, capacity: first?.contributionCapacity };
  const data: MoneyExplanation = {
    title: `${t("Giải thích", "Explanation")}: ${titles[metric]}`, label: titles[metric], value: money(values[metric]),
    subtitle: `${t("Tại tháng nghỉ hưu", "At retirement in")} ${date}`, description: "", steps: [], result: money(values[metric]),
    parameters: [t(`Tích lũy: ${s.accumulationMonths} tháng`, `Accumulation: ${s.accumulationMonths} months`), t(`Chi tiêu nghỉ hưu: ${s.retirementMonths} tháng, đến ${formatMonthVN(s.endMonth)}`, `Retirement: ${s.retirementMonths} months, through ${formatMonthVN(s.endMonth)}`)],
  };
  const step = (label: string, value: string, description?: string) => data.steps.push({ label, value, description });
  if (metric === "required") {
    const planningPercent = preview.replayInput?.retirementPlanningAnnualPercent;
    if (planningPercent != null) data.parameters!.push(t(`Chiết khấu theo lạm phát đã chốt: ${Number(planningPercent).toLocaleString("vi-VN")}%/năm.`, `Discounted at the pinned inflation rate: ${planningPercent}% per year.`));
    data.label = t("Mục tiêu quỹ hưu trí của bạn", "Your retirement fund target");
    data.description = t("Số vốn cần có tại tháng nghỉ hưu để trang trải các khoản rút trong suốt kế hoạch, sau nguồn thu và lương hưu được tính. Mô hình giữ cả số dư cuối kỳ bạn đã chọn.", "Capital needed at retirement to cover withdrawals throughout the plan, after included income and pension, while preserving your selected terminal balance.");
    step(t("Chi tiêu sinh hoạt tháng đầu nghỉ hưu", "First retirement month's living expenses"), monthly(s.futureMonthlyExpense));
    step(t("Nguồn thu và lương hưu tháng đầu", "First retirement month's income and pension"), monthly(retired ? add(retired.income, retired.pension) : null), t("Chỉ tính các nguồn có hiệu lực trong tháng này.", "Only income effective in this month is included."));
    step(t("Trả nợ và khoản chi khác tháng đầu", "First retirement month's debt and other expenses"), monthly(retired ? add(retired.debtPayment, retired.additionalExpense) : null));
    step(t("Khoản cần rút từ quỹ tháng đầu", "First retirement month's required withdrawal"), monthly(retired?.withdrawal), t("Bao gồm phí trả từ quỹ nếu đã chọn; không trừ phí lần nữa.", "Includes fund-paid fees where selected; fees are not deducted again."));
    step(t("Số dư mong muốn cuối kế hoạch", "Desired end-of-plan balance"), money(s.terminalTarget));
    const pv = financeAmount(s.algebraicRequiredFund);
    const reserve = financeAmount(s.liquidityReserveAboveAlgebraicPV);
    if (pv !== null && reserve !== null) {
      const base = new Decimal(pv).lt(0) ? `max(0, ${money(pv)})` : money(pv);
      step(t("Giá trị hiện tại của dòng tiền khi nghỉ hưu", "Present value of retirement cash flows"), money(pv));
      if (new Decimal(reserve).gt(0)) {
        step(t("Vốn bổ sung để chi trả đúng tháng", "Additional capital to fund withdrawals on time"), money(reserve));
        data.result = `${base} + ${money(reserve)} ≈ ${money(s.atRetirement.requiredFund)}`;
      }
    }
    const withdrawal = financeAmount(retired?.withdrawal);
    const substituted = withdrawal === null ? "" : ` ${t("Nếu giữ nguyên khoản rút tháng đầu, phép tính tham chiếu cuối tháng là", "Holding the first withdrawal constant, the month-end reference calculation is")} ${money(withdrawal)} × [1 − (1 + r)^(${-s.retirementMonths})] ÷ r.`;
    data.referenceFormula = {
      title: t("Công thức PV khi rút đều", "PV formula for fixed withdrawals"),
      expression: "PV = W × [1 − (1 + r)⁻ⁿ] ÷ r",
      description: t("Áp dụng khi rút cùng số tiền W vào cuối mỗi tháng với lãi suất cố định r, số dư cuối kỳ bằng 0 và không có tiền góp hay vốn bổ sung. n là số tháng chi tiêu khi nghỉ hưu. r là lãi suất chiết khấu tháng (lãi suất danh nghĩa năm chia 12). Rút đầu tháng thì nhân thêm (1 + r). Khi r = 0, PV = W × n.", "Use for equal month-end withdrawals W, a constant rate r, a zero terminal balance and no additional deposits. n is the number of retirement months. r is the monthly discount rate (nominal annual rate divided by 12). For beginning-of-month withdrawals, multiply by (1 + r). At r = 0, PV = W × n.") + substituted,
    };
  } else if (metric === "projected") {
    data.label = t("Quỹ tích lũy dự kiến của bạn", "Your projected accumulated fund");
    data.description = t("Số dư dự kiến ở đầu tháng nghỉ hưu, sau khi tính tiền góp, tăng trưởng, vốn giải phóng, các khoản rút và chi phí giao dịch trước nghỉ hưu.", "Projected balance at the start of retirement after contributions, growth, capital releases, withdrawals and trading costs before retirement.");
    data.parameters!.push(timing === "START_OF_MONTH" ? t("Góp vào đầu tháng theo nguồn tiền đã xác nhận.", "Contributions at the start of each month using confirmed available funds.") : timing === "END_OF_MONTH" ? t("Góp vào cuối tháng.", "Contributions at the end of each month.") : t("Thời điểm góp theo phiên bản đang xem.", "Contribution timing follows the displayed version."));
    const hasTradingCosts = calc.modelVersion === "retirement-monthly-v5" || rows.some(row => row.tradingCost !== undefined);
    const contributions = sum(accumulation, "contribution");
    const growth = sum(accumulation, "investmentChange");
    const injections = sum(accumulation, "capitalInjection");
    const withdrawals = sum(accumulation, "withdrawal");
    const unfunded = hasTradingCosts ? sum(accumulation, "unfundedWithdrawal") : "0";
    const paid = withdrawals === null || unfunded === null ? null : new Decimal(withdrawals).minus(unfunded).toString();
    const tradingCosts = hasTradingCosts ? sum(accumulation, "tradingCost") : "0";
    step(t("Vốn dành cho hưu trí đầu kỳ", "Opening retirement capital"), money(s.initialRetirementCapital));
    step(t("Tổng tiền góp trong giai đoạn tích lũy", "Total modeled accumulation contributions"), money(contributions), t("Cộng tiền góp của từng tháng, đã xét ngân sách; không lấy mức chọn nhân số tháng.", "Sum each month's modeled deposit after budget limits, rather than multiplying the selected deposit by the number of months."));
    step(t("Tăng trưởng của vốn và tiền góp", "Growth of capital and contributions"), money(growth), t("Có thể âm theo kịch bản đang xem.", "Can be negative under the selected scenario."));
    if (injections !== "0") step(t("Vốn được giải phóng trước nghỉ hưu", "Capital released before retirement"), money(injections));
    if (paid !== "0") step(t("Khoản rút trước nghỉ hưu", "Withdrawals before retirement"), money(paid),
      hasTradingCosts ? t("Phần quỹ chi trả được, gồm phí trả từ quỹ nếu có.", "Amount covered by the fund, including fund-paid fees if applicable.") : t("Gồm phí trả từ quỹ nếu có.", "Includes fees paid from the fund, if any."));
    if (tradingCosts !== "0") step(t("Chi phí giao dịch và tái cân bằng", "Trading and rebalancing costs"), money(tradingCosts),
      t("Trừ khỏi số dư sau khoản rút và trước khi tính tăng trưởng tháng.", "Deducted after withdrawals and before applying monthly growth."));
    if ([contributions, growth, injections, paid, tradingCosts].every(value => value !== null)) {
      const parts = [money(s.initialRetirementCapital), `+ ${money(contributions)}`, `+ (${money(growth)})`];
      if (injections !== "0") parts.push(`+ ${money(injections)}`);
      if (paid !== "0") parts.push(`− ${money(paid)}`);
      if (tradingCosts !== "0") parts.push(`− ${money(tradingCosts)}`);
      data.result = `${parts.join(" ")} ≈ ${money(s.atRetirement.projectedFund)}`;
    }
    data.note = t("Số tổng cộng từ các dòng tiền trong cùng dự phóng. Làm tròn chỉ khi hiển thị nên cộng các số đã làm tròn có thể lệch nhỏ. Kế hoạch có lịch góp hoặc lợi suất thay đổi được tính lần lượt từng tháng.", "Totals use cashflows from this projection. Display rounding can cause small differences when adding formatted amounts. Variable contributions and returns are applied month by month.");
    const depositsAtStart = timing?.startsWith("START");
    data.referenceFormula = {
      title: depositsAtStart
        ? t("Công thức khi góp đều đầu tháng", "Formula for fixed start-of-month deposits")
        : t("Công thức khi góp đều cuối tháng", "Formula for fixed end-of-month deposits"),
      expression: <span className="money-explanation-equation" role="img"
        aria-label={`FV = P × (1 + r)ⁿ + A × [(1 + r)ⁿ − 1] ÷ r${depositsAtStart ? " × (1 + r)" : ""}`}>
        <span aria-hidden="true">FV = P × (1 + r)<sup>n</sup></span>
        <span className="money-explanation-equation-term" aria-hidden="true">
          <span>+ A ×</span>
          <span className="money-explanation-fraction">
            <span>(1 + r)<sup>n</sup> − 1</span>
            <span>r</span>
          </span>
          {depositsAtStart && <span>× (1 + r)</span>}
        </span>
      </span>,
      description: t("P là vốn đầu kỳ, A là tiền góp mỗi tháng, n là số tháng tích lũy và r là lãi suất danh nghĩa năm chia 12. Công thức áp dụng khi tiền góp và lợi suất cố định, không có phí, khoản rút hoặc vốn bổ sung. Nếu lãi suất bằng 0, quỹ bằng tổng vốn và tiền góp.", "P is opening capital, A the monthly deposit, n the number of accumulation months, and r the nominal annual rate divided by 12. This formula assumes fixed deposits and returns, with no fees, withdrawals or capital releases. At zero interest, the fund is opening capital plus all deposits."),
    };
  } else if (metric === "gap") {
    data.subtitle = t("So với vốn hưu trí đã khai ban đầu", "Compared with initially declared retirement capital");
    data.warning = remaining !== null && remaining !== "0";
    data.parameters = undefined;
    data.description = remaining === null
      ? t("Chưa đủ số liệu để tính phần còn thiếu.", "There is not enough information to calculate the remaining gap.")
      : t("Lấy quỹ cần khi nghỉ hưu trừ vốn hưu trí bạn đã khai ban đầu. Nếu vốn đã khai bằng hoặc lớn hơn quỹ cần, phần còn thiếu là 0.", "Subtract your initially declared retirement capital from the fund needed at retirement. If the declared capital meets or exceeds the target, the remaining gap is zero.");
    step(t("Quỹ cần khi nghỉ hưu", "Fund needed at retirement"), money(s.atRetirement.requiredFund));
    step(t("Trừ vốn dành cho hưu trí đã khai ban đầu", "Subtract initially declared retirement capital"), money(declared),
      t("Số vốn trong hồ sơ, chưa tính các khoản góp và tăng trưởng trong tương lai.", "The amount in your profile before future contributions and growth."));
    if (remaining !== null) data.result = `max(0; ${money(s.atRetirement.requiredFund)} − ${money(declared)}) ≈ ${money(remaining)}`;
    if (declared === null) {
      data.note = t("Vào mục Tài sản để khai số vốn hiện có dành cho hưu trí, rồi quay lại xem kết quả.", "Enter your existing retirement capital under Assets, then return to see the result.");
    } else if (data.warning && s.accumulationMonths > 0 && !preview.reforecast) {
      data.note = t("Để chuẩn bị thêm, hãy thử một khoản góp hằng tháng phù hợp với ngân sách. Xem quỹ dự kiến có khi nghỉ hưu để biết mức góp đó đưa bạn đến gần mục tiêu bao nhiêu.", "To build your fund, try a monthly contribution that fits your budget. Check the projected fund at retirement to see how close that contribution gets you to your goal.");
    } else if (data.warning) {
      data.note = t("Nếu bạn có thêm vốn thực tế đã dành riêng cho hưu trí, hãy cập nhật số tiền đó trong mục Tài sản.", "If you have set aside additional capital for retirement, update that amount under Assets.");
    }
  } else if (metric === "expense") {
    data.label = t("Chi tiêu tháng đầu tiên khi nghỉ hưu", "First retirement month's living expenses");
    data.value = monthly(s.futureMonthlyExpense);
    const usesPinnedSources = Boolean(preview.reforecast || preview.modelVersion === "retirement-monthly-v4");
    data.referenceFormula = {
      title: t("Công thức trượt giá", "Inflation formula"),
      expression: <span className="money-explanation-power" role="img" aria-label={t(
        `Một cộng lạm phát năm chia 12, tất cả lũy thừa ${s.accumulationMonths}`,
        `One plus annual inflation divided by 12, all raised to ${s.accumulationMonths}`,
      )}>
        <span className="money-explanation-power-base" aria-hidden="true">
          <span>(</span><span>1 +</span>
          <span className="money-explanation-fraction">
            <span>{t("Lạm phát năm", "Annual inflation")}</span><span>12</span>
          </span>
          <span>)</span>
        </span>
        <sup aria-hidden="true">{s.accumulationMonths}</sup>
      </span>,
      description: t("Nhân chi tiêu hôm nay với hệ số trên để ra chi tiêu lúc nghỉ hưu khi lạm phát cố định. Số mũ là số tháng còn lại đến lúc nghỉ hưu. Khi tỷ lệ thay đổi, nhân lần lượt hệ số trượt giá của từng tháng.", "Multiply today's spending by this factor to get retirement spending when inflation is constant. The exponent is the number of months until retirement. If the rate varies, multiply the individual monthly inflation factors."),
    };
    data.description = usesPinnedSources ? t("Chi sinh hoạt danh nghĩa của các nguồn có hiệu lực trong tháng nghỉ hưu ở dự phóng đang xem. Không lấy hồ sơ mới để thay số liệu của phiên bản đã lưu.", "Nominal living expenses from sources effective in the displayed retirement month. Current profile edits do not replace saved-version values.") : t("Số tiền cần để duy trì mức chi sinh hoạt đã chọn sau trượt giá đến tháng đầu nghỉ hưu. Trả nợ và các khoản chi khác có lịch riêng.", "The amount needed to maintain your selected living expenses after inflation through the first retirement month. Debt and other expenses have separate schedules.");
    if (!usesPinnedSources) {
      step(t("Chi tiêu mong muốn theo giá hôm nay", "Selected spending at today's prices"), monthly(preview.selection.monthlyExpenseToday));
      // This factor is display-only; the result always comes from the server.
      const factor = accumulation.length === s.accumulationMonths ? accumulation.reduce((v, row) => v * Number(row.inflationFactor), 1) : NaN;
      const factors = accumulation.map(row => Number(row.inflationFactor));
      const constantRate = factors.length > 0 && factors.every(value => Math.abs(value - factors[0]) < 1e-12);
      const percent = constantRate ? new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 6 }).format((factors[0] - 1) * 1200) : null;
      const rate = percent === null ? "" : t(`Lạm phát cố định ${percent}%/năm. `, `Fixed inflation of ${percent}% per year. `);
      step(t("Hệ số trượt giá đến tháng nghỉ hưu", "Inflation factor through retirement"), Number.isFinite(factor) ? `× ${new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 6 }).format(factor)}` : t("Xem từng tháng", "See monthly factors"), rate + t("Ghép lãi từng tháng. Hệ số hiển thị được làm tròn.", "Compounded monthly. The displayed factor is rounded."));
    }
    step(t("Chi sinh hoạt tháng nghỉ hưu trong dự phóng", "Projected retirement-month living expenses"), monthly(retired?.livingExpense));
    data.result = monthly(s.futureMonthlyExpense);
    data.note = preview.replayInput?.retirementPlanningAnnualPercent != null
      ? t("Lạm phát được chốt cho toàn bộ lần tính theo bộ giả định của phương án.", "This projection uses the same pinned planning inflation rate throughout.")
      : t("Số tiền và lạm phát lấy từ phiên bản dự phóng đang xem.", "The amount and inflation come from the displayed projection.");
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

export default function PlanMoneyExplanation({ metric, preview, onClose, onAdjust }: {
  metric: PlanMoneyMetric; preview: RetirementPreviewResult; onClose: () => void; onAdjust?: () => void;
}) {
  const en = useI18n().language === "en";
  const data = planMoneyExplanation(metric, preview, en);
  if (!data) return null;
  if (metric === "gap") {
    const { declared } = retirementCapitalGap(preview);
    const canTryContribution = data.warning && !preview.reforecast && (preview.calculation?.summary.accumulationMonths ?? 0) > 0;
    const tryLabel = en ? "Try a monthly contribution" : "Thử mức góp hằng tháng";
    const assetsLabel = declared === null
      ? (en ? "Enter retirement capital" : "Khai vốn hưu trí")
      : (en ? "Update retirement capital" : "Cập nhật vốn hưu trí");
    const action = canTryContribution
      ? onAdjust
        ? <button type="button" className="overview-button primary" onClick={() => { onClose(); onAdjust(); }}>{tryLabel}</button>
        : <Link className="overview-button primary" to="/user/plan?dialog=contribution" onClick={onClose}>{tryLabel}</Link>
      : (declared === null || data.warning) && <Link className="overview-button primary" to="/user/profile?section=assets" onClick={onClose}>{assetsLabel}</Link>;
    return <MoneyExplanationDialog data={data} onClose={onClose} action={action} />;
  }
  const editOptions = metric === "required" || metric === "expense";
  const label = editOptions ? (en ? "Edit plan options" : "Chỉnh sửa phương án") : (en ? "Choose contribution" : "Chọn mức góp");
  return <MoneyExplanationDialog data={data} onClose={onClose} action={onAdjust ? <button type="button" className="overview-button primary" onClick={() => { onClose(); onAdjust(); }}>{label}</button> : <Link className="overview-button primary" to={editOptions ? "/user/plan?dialog=options" : "/user/plan?dialog=contribution"} onClick={onClose}>{label}</Link>} />;
}
