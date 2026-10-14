import { Icon, type IconName } from "../ui";
import { useI18n } from "../../i18n";
import type { DebtPreviewResponse, DebtSimulationResult, DebtIssue } from "../../services/debts";
import type { DebtEntry } from "../../services/financialProfile";
import { Decimal } from "../../utils/decimal";
import { formatDateVN, formatMonthVN } from "../../utils/date";
import "./debt-analysis-results.css";

export default function DebtAnalysisResults({ data, loans, horizonMonths }: { data: DebtPreviewResponse; loans: DebtEntry[]; horizonMonths: number }) {
  const { language } = useI18n();
  const en = language === "en";
  const unknown = en ? "Not enough information" : "Chưa đủ thông tin";
  const money = (value: string | null | undefined) => {
    if (value == null || !/^-?\d+(\.\d+)?$/.test(value)) return unknown;
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const rounded = BigInt(whole) + (Number(fraction[0] ?? 0) >= 5 ? 1n : 0n);
    return `${value.startsWith("-") && rounded !== 0n ? "-" : ""}${new Intl.NumberFormat(en ? "en-US" : "vi-VN").format(rounded)} VND`;
  };
  const baseline = data.baseline;
  const first = baseline?.rows[0];
  const ratio = first?.pressure?.ratioPercent;
  const remaining = first?.availableForRetirement;
  const deficit = remaining != null && new Decimal(remaining).lt(0);
  const shortfall = baseline?.totals.firstShortfallMonth;
  const cashflowKnown = baseline?.cashflowAssessment?.shortfallStatus === "NOT_DETECTED_IN_HORIZON";
  const date = (result: DebtSimulationResult | null | undefined) => !result ? unknown : result.totals.debtFreeDate ? formatDateVN(result.totals.debtFreeDate) : result.status === "HORIZON_LIMIT" ? (en ? `Not repaid within ${horizonMonths} months` : `Chưa trả hết trong ${horizonMonths} tháng`) : unknown;
  const descriptions: Record<string, [string, string]> = {
    LOAN_CONTRACT_REQUIRED: ["Bổ sung lịch trả gốc, lãi và phí theo hợp đồng.", "Add the contractual principal, interest and fee schedule."],
    BALANCE_REQUIRED: ["Bổ sung dư nợ hiện tại.", "Add the outstanding balance."],
    PAYMENT_SHARE_REQUIRED: ["Xác nhận phần tiền trả nợ bạn chịu trách nhiệm.", "Confirm your payment share."],
    VALUATION_DATE_MISMATCH: ["Cập nhật ngày xác nhận dư nợ trùng ngày cập nhật hồ sơ.", "Align the balance date with the profile valuation date."],
    CONTRACT_VALUATION_MISMATCH: ["Cập nhật lịch hợp đồng theo ngày cập nhật hồ sơ.", "Align the contract schedule with the profile valuation date."],
    MATURITY_MISMATCH: ["Kiểm tra tháng kết thúc khoản vay và ngày đáo hạn hợp đồng.", "Check the loan end month and contract maturity."],
    MONTHLY_CONTRACT_REQUIRED: ["Cần lịch trả nợ theo tháng đang có hiệu lực.", "An active monthly repayment schedule is required."],
    PREPAYMENT_TERMS_REQUIRED: ["Bổ sung điều kiện và phí trả nợ trước hạn.", "Add early repayment terms and fees."],
    SHARED_PREPAYMENT_AGREEMENT_REQUIRED: ["Xác nhận thỏa thuận trả trước cho khoản vay chung.", "Confirm the shared-loan prepayment agreement."],
    CONFIRMED_BUDGET_REQUIRED: ["Nhập khoản giữ lại và ngân sách trả thêm; nhập 0 nếu không có.", "Enter the reserve and extra budget; use 0 for none."],
    CASHFLOW_REQUIRED: ["Bổ sung đầy đủ thu nhập và chi tiêu trong kỳ phân tích.", "Complete income and expenses throughout the analysis period."],
    RESERVE_REQUIRED: ["Nhập số tiền giữ lại mỗi tháng; nhập 0 nếu không có.", "Enter the monthly reserve; use 0 for none."],
    FX_RULE_REQUIRED: ["Khoản tiền khác VND chưa có quy tắc quy đổi.", "A currency conversion rule is needed."],
    NEGATIVE_AMORTIZATION_UNSUPPORTED: ["Số tiền trả theo lịch chưa đủ tiền lãi; kiểm tra hợp đồng.", "Scheduled payments do not cover interest; review the contract."],
    UNSETTLED_BALANCE_AT_MATURITY: ["Lịch trả nợ còn dư nợ tại ngày đáo hạn; kiểm tra khoản trả cuối.", "Review the final payment: a balance remains at maturity."],
  };
  const issues = (items: DebtIssue[]) => Array.from(new Map(items.map(issue => [`${issue.loanId}:${issue.code}`, issue])).values()).map(issue => {
    const loan = loans.find(item => item.id === issue.loanId);
    return <li key={`${issue.loanId}:${issue.code}`}>{loan && <strong>{loan.label}: </strong>}{descriptions[issue.code]?.[en ? 1 : 0] ?? (en ? "Review the loan information and confirmed contract terms." : "Kiểm tra thông tin khoản vay và các điều khoản hợp đồng đã xác nhận.")}</li>;
  });
  const strategies = [
    { key: "CONTRACT", title: en ? "Current schedule" : "Theo lịch hiện tại", description: en ? "Pay the agreed amounts without an extra payment budget." : "Trả theo lịch đã khai báo, không dùng ngân sách trả thêm.", result: baseline, alternative: null },
    ...data.alternatives.map(alternative => ({ key: alternative.strategy,
      title: alternative.strategy === "AVALANCHE" ? (en ? "Highest interest first" : "Ưu tiên khoản lãi cao") : alternative.strategy === "SNOWBALL" ? (en ? "Smallest balance first" : "Ưu tiên khoản nợ nhỏ") : (en ? "Selected loan first" : "Ưu tiên khoản đã chọn"),
      description: alternative.strategy === "AVALANCHE" ? (en ? "Use the extra budget for the highest-rate loan first, subject to prepayment terms." : "Dùng ngân sách trả thêm cho khoản lãi suất cao trước, theo điều kiện trả trước của hợp đồng.") : alternative.strategy === "SNOWBALL" ? (en ? "Use the extra budget for the smallest balance first." : "Dùng ngân sách trả thêm để thanh toán khoản có dư nợ nhỏ trước.") : (en ? "Use the extra budget for your selected loan first." : "Dùng ngân sách trả thêm cho khoản vay bạn đã chọn."),
      result: alternative.status === "INCOMPLETE" ? null : alternative.result, alternative })),
  ];

  const metrics: { label: string; icon: IconName; value: string; note?: string; description: string; warning?: boolean }[] = [
    {
      label: en ? "Income used for repayments" : "Tỷ lệ thu nhập trả nợ", icon: "chart",
      value: ratio != null && Number.isFinite(Number(ratio)) ? new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 1 }).format(Number(ratio)) + "%" : unknown,
      description: en ? "Scheduled principal and interest as a share of income after deductions. Fees are counted separately in cashflow." : "Phần thu nhập sau khấu trừ dùng để trả gốc và lãi. Phí được tính riêng trong dòng tiền.",
    },
    {
      label: en ? "Money remaining this month" : "Tiền còn lại trong tháng", icon: "wallet", value: money(remaining), warning: deficit,
      note: remaining == null ? undefined : deficit ? (en ? "Spending exceeds income" : "Chi vượt thu nhập") : Number(remaining) === 0 ? (en ? "No surplus" : "Không còn tiền dư") : (en ? "Projected surplus" : "Khoản dư dự tính"),
      description: en ? "Income less living expenses, debt payments and the monthly reserve." : "Sau khi trừ chi tiêu, tiền trả nợ và khoản giữ lại mỗi tháng.",
    },
    {
      label: en ? "First month of cash shortfall" : "Tháng đầu thiếu tiền", icon: "alert", warning: Boolean(shortfall),
      value: shortfall ? formatMonthVN(shortfall) : cashflowKnown ? (en ? "None in this period" : "Chưa ghi nhận trong kỳ") : unknown,
      description: en ? "The first month income cannot cover outgoings. This does not mean all assets run out." : "Tháng thu nhập không đủ chi trả; chưa có nghĩa toàn bộ tài sản đã hết.",
    },
    {
      label: en ? "Expected debt-free date" : "Ngày dự tính hết nợ", icon: "target", value: date(baseline),
      description: en ? "Based on the current contract schedule, within the selected analysis period." : "Theo lịch trả nợ trong hợp đồng và khoảng thời gian bạn chọn.",
    },
  ];
  const hasMissingMetrics = metrics.some(metric => metric.value === unknown);

  return <section className="debt-analysis-results" aria-label={en ? "Debt analysis results" : "Kết quả phân tích trả nợ"}>
    <div className="debt-results-overview">
      <header className="debt-overview-heading">
        <div>
          <h2>{en ? "Your repayment outlook" : "Tình hình trả nợ của bạn"}</h2>
          <p>{first
            ? (en ? "Monthly figures at the start of the period: " : "Số liệu hàng tháng tính tại đầu kỳ: ") + formatMonthVN(first.month)
            : (en ? "An overview of your cashflow and repayment timeline." : "Theo dõi khả năng chi trả và thời điểm dự kiến hết nợ.")}</p>
        </div>
        <div className="debt-overview-tags">
          <span className="debt-period-tag">{en ? "Analysis period" : "Kỳ phân tích"}<strong>{horizonMonths} {en ? "months" : "tháng"}</strong></span>
          {hasMissingMetrics && <span className="debt-data-status"><Icon name="info" size="small" />{en ? "More information needed" : "Chờ bổ sung dữ liệu"}</span>}
        </div>
      </header>
      <div className="debt-results-metrics">
        {metrics.map(metric => <article key={metric.icon} className={metric.warning ? "has-deficit" : ""}>
          <div className="debt-metric-heading"><span className="debt-result-icon" aria-hidden="true"><Icon name={metric.icon} /></span><h3>{metric.label}</h3></div>
          <strong className={metric.value === unknown ? "debt-metric-unavailable" : ""} aria-label={metric.value === unknown ? unknown : undefined}>{metric.value === unknown ? "—" : metric.value}</strong>
          {metric.note && <span className="debt-metric-note">{metric.note}</span>}
          <p>{metric.description}</p>
        </article>)}
      </div>
      {hasMissingMetrics && <p className="debt-metric-key">{en ? "— means the information needed to calculate this figure is missing." : "Dấu — là chỉ số chưa tính được vì thiếu thông tin."}</p>}
      {!baseline && <div className="debt-results-missing debt-overview-missing" role="status">
        <span className="debt-missing-icon" aria-hidden="true"><Icon name="file-text" /></span>
        <div>
          <h3>{en ? "Complete these items to compare repayment options" : "Cần bổ sung để so sánh cách trả nợ"}</h3>
          {data.issues.length > 0 && <ul>{issues(data.issues)}</ul>}
          <p>{en ? "A monthly payment alone is not enough to calculate interest savings or a debt-free date." : "Chỉ số tiền trả hàng tháng chưa đủ để tính tiền lãi tiết kiệm hoặc ngày hết nợ."}</p>
        </div>
      </div>}
    </div>

    {baseline && <><div className="debt-results-heading"><h2>{en ? "Compare repayment options" : "So sánh các cách trả nợ"}</h2><p>{en ? "Compare costs within the same period. These are projections; no repayment is made automatically." : "Đối chiếu chi phí trong cùng khoảng thời gian. Đây là dự tính; hệ thống không tự thực hiện trả nợ."}</p></div>
      <div className="debt-results-strategies">{strategies.map(({ key, title, description, result, alternative }) => {
        const saved = alternative?.interestAndFeesSaved;
        const hasSavings = result && alternative?.comparisonScope !== "UNAVAILABLE" && saved != null;
        const extraCost = hasSavings && new Decimal(saved!).lt(0);
        return <article key={key}><h3>{title}</h3><p>{description}</p><span className="debt-comparison-scope">{!result ? unknown : alternative?.comparisonScope === "SAME_HORIZON_ONLY" || result.status === "HORIZON_LIMIT" ? (en ? `Only within ${horizonMonths} months` : `Chỉ tính trong ${horizonMonths} tháng`) : (en ? "Until fully repaid" : "Tính đến khi trả hết nợ")}</span>
          {alternative && <div className={`debt-comparison-savings ${extraCost ? "has-deficit" : ""}`}><span>{extraCost ? (en ? "Additional interest & fees" : "Lãi và phí tăng thêm") : (en ? "Interest & fees saved" : "Lãi và phí giảm được")}</span><strong>{hasSavings ? money(extraCost ? new Decimal(saved!).mul(-1).toFixed() : saved) : unknown}</strong></div>}
          <dl><div><dt>{en ? "Interest & fees in period" : "Lãi và phí trong kỳ"}</dt><dd>{money(result?.totals.interestAndFees)}</dd></div><div><dt>{en ? "Expected debt-free date" : "Ngày dự tính hết nợ"}</dt><dd>{date(result)}</dd></div><div><dt>{en ? "Debt remaining at period end" : "Dư nợ cuối kỳ phân tích"}</dt><dd>{money(result?.totals.closingLoanBalance)}</dd></div></dl>
          {!!alternative?.issues.length && <ul className="debt-option-issues">{issues(alternative.issues)}</ul>}
        </article>;
      })}</div>
      {baseline.cashflowAssessment?.shortfallStatus === "UNKNOWN" && <p className="debt-results-missing">{en ? "Income or expense data is incomplete in part of the period. A missing shortfall date does not confirm that cashflow is sufficient." : "Một phần kỳ phân tích còn thiếu thu nhập hoặc chi tiêu. Chưa có mốc thiếu tiền không có nghĩa dòng tiền đã đủ."}</p>}
    </>}
  </section>;
}
