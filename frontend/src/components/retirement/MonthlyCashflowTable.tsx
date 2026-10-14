import { Fragment, useEffect, useId, useRef, useState, useMemo } from "react";
import { Icon, Button, Pagination } from "../ui";
import { useI18n } from "../../i18n";
import type { RetirementRow, RetirementSummary, RetirementPreviewResult } from "../../services/retirement";
import { exportPlanVersionCsv } from "../../services/plans";
import { formatMonthVN } from "../../utils/date";
import "./monthly-cashflow-table.css";

interface MonthlyCashflowTableProps {
  rows: RetirementRow[];
  summary: RetirementSummary;
  previewData?: RetirementPreviewResult | null;
  isApplied?: boolean;
  planId?: string;
  versionId?: string;
}

const formatMoneyCell = (val: string | number) => {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (!Number.isFinite(num)) return "—";
  if (num === 0) return "0";
  const rounded = Math.round(num);
  const isNeg = rounded < 0;
  return `${isNeg ? "-" : ""}${Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};

export function MonthlyCashflowTable({ rows = [], summary, previewData, isApplied = false, planId, versionId }: MonthlyCashflowTableProps) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState("");
  const pageSize = 12;
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const jumpTarget = useRef<string | null>(null);
  const tableId = useId();

  const safeRows = rows || [];

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    safeRows.forEach((r) => {
      if (r?.month) years.add(r.month.slice(0, 4));
    });
    return Array.from(years).sort();
  }, [safeRows]);

  const filteredRows = useMemo(() => {
    if (selectedYear === "ALL") return safeRows;
    return safeRows.filter((r) => r?.month?.startsWith(selectedYear));
  }, [safeRows, selectedYear]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const handleExportCSV = async () => {
    if (!rows || rows.length === 0 || isExporting) return;
    setExportError("");

    if (isApplied && planId && versionId) {
      setIsExporting(true);
      try {
        await exportPlanVersionCsv(planId, versionId, isEn ? "technical" : "readable-vi");
      } catch (err) {
        setExportError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsExporting(false);
      }
      return;
    }

    const headers = isEn
      ? [
          "Month",
          "Phase",
          "Income",
          "Social Security Pension",
          "Living Expense",
          "Additional Expense",
          "Debt Payment",
          "Planned Contribution",
          "Fund Contribution",
          "Contribution Capacity",
          "Budget Shortfall",
          "Living Withdrawal",
          "Net Withdrawal",
          "Surplus Outside Fund",
          "Capital Injection",
          "Investment Return",
          "Ending Fund Balance",
          "Funded Balance",
          "Unfunded Withdrawal",
          "Minimum Capital Required",
        ]
      : [
          "Tháng",
          "Giai đoạn",
          "Thu nhập",
          "Lương hưu BHXH",
          "Chi hoạt động",
          "Chi bổ sung",
          "Trả nợ",
          "Góp dự định",
          "Thực góp vào quỹ",
          "Khả năng góp",
          "Thiếu hụt góp",
          "Rút chi tiêu",
          "Tiền rút sau khi trừ tiền góp cùng kỳ",
          "Tiền dư ngoài quỹ",
          "Vốn giải phóng",
          "Lãi/Lỗ đầu tư",
          "Số dư quỹ cuối kỳ",
          "Số tiền có thể dùng theo dự tính",
          "Nhu cầu chưa tài trợ",
          "Vốn yêu cầu tối thiểu",
        ];

    const metadataRows = isEn
      ? [
          `"An Huu Retirement Plan Monthly Cashflow Report"`,
          `"Status: ${isApplied ? "Official Active Plan" : "Preview Projection (Not Applied)"}"`,
          `"Valuation Date: ${summary.valuationDate}"`,
          `"Retirement Month: ${summary.retirementMonth}"`,
          `"End Month: ${summary.endMonth}"`,
          `"Model Version: ${previewData?.modelVersion || "retirement-monthly-v2"}"`,
          `"Input Hash: ${previewData?.inputHash || "N/A"}"`,
          `"Profile Revision: ${previewData?.profileRevision || 0}"`,
          `"Portfolio Policy T04: ${previewData?.references.policyVersionId || "N/A"} (v${previewData?.references.policyVersion || 0})"`,
          `"Macro Assumption T03: ${previewData?.references.assumptionVersionId || "N/A"} (v${previewData?.references.assumptionVersion || 0})"`,
          "",
        ]
      : [
          `"Báo cáo dòng tiền kế hoạch hưu trí An Hưu"`,
          `"Trạng thái: ${isApplied ? "Kế hoạch chính thức đang áp dụng" : "Bản xem trước dự phóng chưa áp dụng"}"`,
          `"Ngày định giá: ${summary.valuationDate}"`,
          `"Tháng hưu: ${summary.retirementMonth}"`,
          `"Tháng kết thúc: ${summary.endMonth}"`,
          `"Phiên bản mô hình: ${previewData?.modelVersion || "retirement-monthly-v2"}"`,
          `"Mã đối chiếu dữ liệu: ${previewData?.inputHash || "Chưa có"}"`,
          `"Phiên bản hồ sơ: ${previewData?.profileRevision || 0}"`,
          `"Chính sách danh mục: ${previewData?.references.policyVersionId || "Chưa có"} (v${previewData?.references.policyVersion || 0})"`,
          `"Giả định vĩ mô: ${previewData?.references.assumptionVersionId || "Chưa có"} (v${previewData?.references.assumptionVersion || 0})"`,
          "",
        ];

    const dataRows = rows.map((r) => [
      r.month,
      r.phase === "RETIREMENT" ? (isEn ? "Retirement" : "Hưu trí") : (isEn ? "Accumulation" : "Tích lũy"),
      r.income,
      r.pension,
      r.livingExpense,
      r.additionalExpense,
      r.debtPayment,
      r.plannedContribution,
      r.contribution,
      r.contributionCapacity,
      r.budgetShortfall,
      r.withdrawal,
      r.netWithdrawal,
      r.uninvestedSurplus,
      r.capitalInjection,
      r.investmentChange,
      r.closingBalance,
      r.fundedClosingBalance,
      r.unfundedWithdrawal,
      r.requiredClosingBalance,
    ]);

    const csvContent =
      "\uFEFF" + // UTF-8 BOM for Excel
      metadataRows.join("\n") +
      headers.join(",") +
      "\n" +
      dataRows.map((row) => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${isEn ? "an_huu_cashflow" : "an_huu_dong_tien"}_${summary.retirementMonth}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (selectedYear !== "ALL" && !availableYears.includes(selectedYear)) {
      setSelectedYear("ALL"); setCurrentPage(1); setExpandedMonth(null);
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (!jumpTarget.current) return;
    const button = document.getElementById(`${tableId}-toggle-${jumpTarget.current}`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    jumpTarget.current = null;
  }, [selectedYear, page, expandedMonth, tableId]);

  const jumpToMonth = (month: string) => {
    setSelectedYear(month.slice(0, 4)); setCurrentPage(1);
    setExpandedMonth(month); jumpTarget.current = month;
  };
  const detailGroup = (title: string, entries: [string, string | undefined][]) => (
    <section><h4>{title}</h4><dl>{entries.map(([label, value]) => (
      <div key={label}><dt>{label}</dt><dd>{value === undefined ? "—" : formatMoneyCell(value)}</dd></div>
    ))}</dl></section>
  );

  return (
    <section className="monthly-cashflow-table-component" aria-labelledby={`${tableId}-title`}>
      <header className="cashflow-ledger-header">
        <div>
          <h3 id={`${tableId}-title`}>{isEn ? "Your fund, month by month" : "Quỹ hưu trí của bạn qua từng tháng"}</h3>
          <p>{isEn ? "See how much goes into the fund, how much is needed and what remains." : "Xem mỗi tháng góp vào bao nhiêu, cần rút bao nhiêu và quỹ còn lại bao nhiêu."}</p>
          <small>{isApplied ? (isEn ? "Forecast from the applied plan" : "Dự tính theo kế hoạch đang áp dụng") : (isEn ? "Preview · Not yet applied" : "Bản xem trước · Chưa áp dụng")}</small>
        </div>
        <Button variant="ghost" size="small" onClick={handleExportCSV} loading={isExporting} disabled={isExporting || !rows.length}>
          <Icon name="download" size="small" /> {isExporting ? (isEn ? "Exporting…" : "Đang xuất…") : (isEn ? "Export CSV" : "Xuất file CSV")}
        </Button>
      </header>
      {exportError && <p role="alert">{isEn ? "CSV export failed. Please retry." : "Chưa xuất được CSV. Hãy bấm xuất để thử lại."} {exportError}</p>}

      <div className="cashflow-ledger-toolbar">
        <label>{isEn ? "Year" : "Xem theo năm"}
          <select aria-label={isEn ? "Filter year" : "Lọc năm"} value={selectedYear} onChange={event => { setSelectedYear(event.target.value); setCurrentPage(1); setExpandedMonth(null); }}>
            <option value="ALL">{isEn ? "All years" : "Tất cả các năm"}</option>
            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <div className="cashflow-ledger-milestones">
          {safeRows.some(row => row.month === summary.retirementMonth) && <button type="button" onClick={() => jumpToMonth(summary.retirementMonth)}>{isEn ? "Retirement starts" : "Bắt đầu nghỉ hưu"} <strong>{formatMonthVN(summary.retirementMonth)}</strong><span aria-hidden="true"> →</span></button>}
          {summary.firstShortfallMonth && safeRows.some(row => row.month === summary.firstShortfallMonth) && <button type="button" className="is-shortfall" onClick={() => jumpToMonth(summary.firstShortfallMonth!)}>{isEn ? "First fund shortfall" : "Bắt đầu thiếu quỹ"} <strong>{formatMonthVN(summary.firstShortfallMonth)}</strong><span aria-hidden="true"> →</span></button>}
        </div>
      </div>

      <div className="cashflow-ledger-guide" id={`${tableId}-guide`}>
        <p>{isEn ? "Unit: VND · All amounts are forecasts." : "Đơn vị: đồng (VND) · Tất cả số tiền là dự tính."}</p>
        <p>{isEn ? "A negative ending balance shows a projected shortfall, not an actual debt balance. Open a month's details to see income, expenses and debt payments." : "Số dư âm là phần tiền dự tính còn thiếu, không phải số nợ thực tế. Bấm “Chi tiết” để xem thu nhập, chi tiêu và trả nợ của tháng đó."}</p>
      </div>
      <div className="cashflow-ledger-scroll" tabIndex={0} role="region" aria-label={isEn ? "Monthly retirement fund table" : "Bảng quỹ hưu trí từng tháng"}>
        <table className="cashflow-ledger" aria-describedby={`${tableId}-guide`}>
          <thead><tr>
            <th scope="col">{isEn ? "Month" : "Tháng"}</th>
            <th scope="col">{isEn ? "Into the fund" : "Góp vào quỹ"}</th>
            <th scope="col">{isEn ? "Needed from fund" : "Cần rút từ quỹ"}</th>
            <th scope="col">{isEn ? "Investment gain / loss" : "Lãi / lỗ dự tính"}</th>
            <th scope="col" className="cashflow-ledger-balance">{isEn ? "Fund at month end" : "Quỹ cuối tháng"}</th>
            <th scope="col"><span className="cashflow-visually-hidden">{isEn ? "Month details" : "Chi tiết tháng"}</span></th>
          </tr></thead>
          <tbody>{paginatedRows.map(row => {
            const opened = expandedMonth === row.month;
            const shortfall = row.month === summary.firstShortfallMonth;
            const retirement = row.month === summary.retirementMonth;
            const negative = Number(row.closingBalance) < 0;
            return <Fragment key={row.month}>
              <tr className={`${shortfall ? "cashflow-first-shortfall" : ""} ${opened ? "is-expanded" : ""}`}>
                <th scope="row"><strong>{formatMonthVN(row.month)}</strong><small>{row.phase === "RETIREMENT" ? (isEn ? "Retired" : "Đã nghỉ hưu") : (isEn ? "Before retirement" : "Trước nghỉ hưu")}</small>
                  {retirement && <span className="cashflow-month-marker">{isEn ? "Retirement starts" : "Bắt đầu nghỉ hưu"}</span>}
                  {shortfall && <span className="cashflow-month-marker is-shortfall">{isEn ? "First shortfall" : "Bắt đầu thiếu quỹ"}</span>}
                </th>
                <td>{formatMoneyCell(row.contribution)}{Number(row.budgetShortfall) > 0 && <small className="cashflow-negative">{isEn ? "Contribution short by " : "Góp thiếu "}{formatMoneyCell(row.budgetShortfall)}</small>}</td>
                <td>{formatMoneyCell(row.withdrawal)}</td>
                <td className={Number(row.investmentChange) < 0 ? "cashflow-negative" : undefined}>{formatMoneyCell(row.investmentChange)}</td>
                <td className={`cashflow-ledger-balance ${negative ? "cashflow-negative" : ""}`}><strong>{formatMoneyCell(row.closingBalance)}</strong>{negative && <small>{isEn ? "Projected shortfall" : "Dự tính còn thiếu"}</small>}</td>
                <td><button type="button" className="cashflow-detail-toggle" id={`${tableId}-toggle-${row.month}`} aria-expanded={opened} aria-controls={`${tableId}-detail-${row.month}`} aria-label={`${opened ? (isEn ? "Hide details" : "Ẩn chi tiết") : (isEn ? "Details" : "Chi tiết")} ${formatMonthVN(row.month)}`} onClick={() => setExpandedMonth(opened ? null : row.month)}>{opened ? (isEn ? "Hide" : "Thu gọn") : (isEn ? "Details" : "Chi tiết")}<span aria-hidden="true">{opened ? " −" : " +"}</span></button></td>
              </tr>
              <tr hidden={!opened} id={`${tableId}-detail-${row.month}`} className="cashflow-detail-row"><td colSpan={6}>
                {opened && <div className="cashflow-month-detail">
                  <h4>{isEn ? "Details for " : "Chi tiết tháng "}{formatMonthVN(row.month)} <span>{isEn ? "· VND" : "· Đơn vị: đồng"}</span></h4>
                  <div className="cashflow-detail-groups">
                    {detailGroup(isEn ? "Income & spending" : "Thu nhập & chi tiêu", [
                      [isEn ? "Income" : "Thu nhập", row.income], [isEn ? "Pension" : "Lương hưu", row.pension],
                      [isEn ? "Living expenses" : "Chi phí sinh hoạt", row.livingExpense], [isEn ? "Additional expenses" : "Chi phí khác", row.additionalExpense],
                      [isEn ? "Debt payments" : "Tiền trả nợ", row.debtPayment], [isEn ? "Surplus kept outside fund" : "Tiền dư giữ ngoài quỹ", row.uninvestedSurplus],
                    ])}
                    {detailGroup(isEn ? "Money into & out of fund" : "Tiền vào & ra khỏi quỹ", [
                      [isEn ? "Planned contribution" : "Số tiền muốn góp", row.plannedContribution], [isEn ? "Contribution capacity" : "Khả năng góp từ thu nhập", row.contributionCapacity],
                      [isEn ? "Projected contribution" : "Số tiền dự tính góp được", row.contribution], [isEn ? "Contribution shortfall" : "Phần góp còn thiếu", row.budgetShortfall],
                      [isEn ? "Capital added" : "Vốn bổ sung vào quỹ", row.capitalInjection], [isEn ? "Needed from fund" : "Số tiền cần rút", row.withdrawal],
                      [isEn ? "Withdrawals less contributions" : "Tiền rút trừ tiền góp", row.netWithdrawal],
                    ])}
                    {detailGroup(isEn ? "Fund balance" : "Số dư & mức quỹ cần có", [
                      [isEn ? "At start of month" : "Quỹ đầu tháng", row.openingBalance], [isEn ? "Investment gain / loss" : "Lãi / lỗ dự tính", row.investmentChange],
                      [isEn ? "At end of month" : "Quỹ cuối tháng", row.closingBalance], [isEn ? "Available at month end" : "Tiền có thể dùng cuối tháng", row.fundedClosingBalance],
                      [isEn ? "Withdrawals not funded" : "Tiền cần rút nhưng quỹ không đủ", row.unfundedWithdrawal],
                      [isEn ? "Required fund at month end" : "Quỹ cần có cuối tháng", row.requiredClosingBalance],
                    ])}
                  </div>
                  <p>{isEn ? "Required fund: the amount the model estimates is needed to cover the remaining plan, not a payment due this month." : "“Quỹ cần có cuối tháng” là số tiền mô hình tính cần để đáp ứng phần kế hoạch còn lại, không phải khoản phải đóng trong tháng này."}</p>
                </div>}
              </td></tr>
            </Fragment>;
          })}</tbody>
        </table>
        {!paginatedRows.length && <p className="cashflow-ledger-empty">{isEn ? "No monthly forecast available." : "Chưa có số liệu dự tính theo tháng."}</p>}
      </div>
      <footer className="cashflow-ledger-footer">
        <p>{isEn ? `${filteredRows.length} months · Up to 12 months per page` : `${filteredRows.length} tháng · Mỗi trang tối đa 12 tháng`}</p>
        <small>{isEn ? "CSV includes every month and all details, regardless of the year filter." : "File CSV gồm tất cả các tháng và đầy đủ chi tiết, không phụ thuộc năm đang chọn."}</small>
      </footer>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} totalItems={filteredRows.length} pageSize={pageSize} onPageChange={next => { setCurrentPage(next); setExpandedMonth(null); }} showRowsPerPage={false} />}
    </section>
  );
}
