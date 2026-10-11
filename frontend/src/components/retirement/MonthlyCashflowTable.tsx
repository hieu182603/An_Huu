import { useState, useMemo } from "react";
import { Icon, Button, Badge, Pagination } from "../ui";
import { useI18n } from "../../i18n";
import type { RetirementRow, RetirementSummary, RetirementPreviewResult } from "../../services/retirement";
import { exportPlanVersionCsv } from "../../services/plans";

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
  if (!Number.isFinite(num) || num === 0) return "0";
  return new Intl.NumberFormat("vi-VN").format(Math.round(num));
};

export function MonthlyCashflowTable({ rows = [], summary, previewData, isApplied = false, planId, versionId }: MonthlyCashflowTableProps) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState("");
  const pageSize = 24; // 2 years per page for comfortable browsing

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
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const handleExportCSV = async () => {
    if (!rows || rows.length === 0 || isExporting) return;
    setExportError("");

    if (isApplied && planId && versionId) {
      setIsExporting(true);
      try {
        await exportPlanVersionCsv(planId, versionId);
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
          "Rút ròng (netWithdrawal)",
          "Tiền dư ngoài quỹ",
          "Vốn giải phóng",
          "Lãi/Lỗ đầu tư",
          "Số dư quỹ cuối kỳ",
          "Số dư thực có (funded)",
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
          `"Mã băm dữ liệu đầu vào (inputHash): ${previewData?.inputHash || "N/A"}"`,
          `"Phiên bản hồ sơ: ${previewData?.profileRevision || 0}"`,
          `"Chính sách danh mục T04: ${previewData?.references.policyVersionId || "N/A"} (v${previewData?.references.policyVersion || 0})"`,
          `"Giả định vĩ mô T03: ${previewData?.references.assumptionVersionId || "N/A"} (v${previewData?.references.assumptionVersion || 0})"`,
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

  return (
    <div className="monthly-cashflow-table-component" style={{ marginTop: "24px" }}>
      {exportError && <p role="alert">{isEn ? "CSV export failed. Retry the export button." : "Chưa xuất được CSV. Hãy bấm xuất để thử lại."} {exportError}</p>}
      <p>{isApplied ? (isEn ? "Applied version's cashflow." : "Dòng tiền của phiên bản đang áp dụng.") : (isEn ? "Preview cashflow; not the applied plan." : "Dòng tiền bản xem trước; chưa phải kế hoạch đang áp dụng.")}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--color-text-main)" }}>
            {isEn ? "Detailed Monthly Cashflow Ledger" : "Bảng kê dòng tiền chi tiết từng tháng"}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--color-text-muted)" }}>
            {isEn
              ? `Reconciliation of income, pension, living expenses, debt, contributions, and withdrawals across ${rows.length} projection periods.`
              : `Đối chiếu thu nhập, lương hưu, chi phí, nợ, tiền đóng và tiền rút qua ${rows.length} kỳ dự phóng.`}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>{isEn ? "Filter Year:" : "Lọc năm:"}</span>
            <select
              aria-label={isEn ? "Filter year" : "Lọc năm"}
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                background: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "6px",
                color: "var(--color-text-main)",
                fontSize: "14px",
                padding: "4px 8px",
              }}
            >
              <option value="ALL">
                {isEn ? `All (${availableYears.length} years)` : `Tất cả (${availableYears.length} năm)`}
              </option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {isEn ? `Year ${yr}` : `Năm ${yr}`}
                </option>
              ))}
            </select>
          </div>

          <Button variant="ghost" size="small" onClick={handleExportCSV} loading={isExporting} disabled={isExporting || rows.length === 0}>
            <Icon name="download" size="small" /> {isExporting ? (isEn ? "Exporting CSV..." : "Đang xuất CSV...") : (isEn ? "Export CSV" : "Xuất file CSV")}
          </Button>
        </div>
      </div>

      <p className="horizontal-scroll-hint" style={{ fontSize: "14px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
        <Icon name="info" size="small" />{" "}
        {isEn
          ? "Scroll horizontally to view all cashflow columns. CSV includes all projection months."
          : "Cuộn ngang để xem đầy đủ các cột dòng tiền. CSV bao gồm toàn bộ các tháng dự phóng."}
      </p>

      <div
        className="table-scroll-container"
        tabIndex={0}
        role="region"
        aria-label={isEn ? "Detailed retirement cashflow table" : "Bảng kê dòng tiền hưu trí chi tiết"}
        style={{
          overflowX: "auto",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "8px",
          background: "var(--color-surface)",
        }}
      >
        <table style={{ width: "100%", minWidth: "1080px", borderCollapse: "collapse", fontSize: "14px", textAlign: "right" }}>
          <thead>
            <tr style={{ background: "var(--color-surface-subtle)", borderBottom: "1px solid var(--color-border-subtle)" }}>
              <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>{isEn ? "Month" : "Tháng"}</th>
              <th style={{ padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap" }}>{isEn ? "Phase" : "Giai đoạn"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Income" : "Thu nhập"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Pension" : "Lương hưu"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Living Expenses" : "Chi hoạt động"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Debt" : "Trả nợ"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Actual Contribution" : "Thực góp"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Withdrawal" : "Rút chi tiêu"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Surplus Outside Fund" : "Tiền dư ngoài quỹ"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Net Return" : "Lãi/Lỗ ròng"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Ending Balance" : "Số dư cuối tháng"}</th>
              <th style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{isEn ? "Minimum Required" : "Vốn cần tối thiểu"}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((r) => {
              const isRetireStart = r.month === summary.retirementMonth;
              const isFirstShortfall = r.month === summary.firstShortfallMonth;
              const isNegative = parseFloat(r.closingBalance) < 0;

              return (
                <tr
                  key={r.month}
                  style={{
                    borderBottom: "1px solid var(--color-border-subtle)",
                    background: isRetireStart
                      ? "rgba(var(--color-warning-rgb), 0.08)"
                      : isFirstShortfall
                      ? "rgba(var(--color-danger-rgb), 0.08)"
                      : undefined,
                  }}
                >
                  <td style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {r.month}
                    {isRetireStart && (
                      <span style={{ marginLeft: "6px", fontSize: "14px", color: "var(--color-warning)", background: "rgba(var(--color-warning-rgb), 0.18)", padding: "2px 4px", borderRadius: "3px" }}>
                        {isEn ? "Retirement Starts" : "Bắt đầu hưu"}
                      </span>
                    )}
                    {isFirstShortfall && (
                      <span style={{ marginLeft: "6px", fontSize: "14px", color: "var(--color-danger)", background: "rgba(var(--color-danger-rgb), 0.14)", padding: "2px 4px", borderRadius: "3px" }}>
                        {isEn ? "Deficit Starts" : "Bắt đầu thiếu quỹ"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "left", whiteSpace: "nowrap" }}>
                    <Badge tone={r.phase === "RETIREMENT" ? "warning" : "soft"}>
                      {r.phase === "RETIREMENT" ? (isEn ? "Retirement" : "Hưu trí") : (isEn ? "Accumulation" : "Tích lũy")}
                    </Badge>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatMoneyCell(r.income)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: parseFloat(r.pension) > 0 ? "var(--color-secondary-700)" : undefined }}>
                    {formatMoneyCell(r.pension)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatMoneyCell(r.livingExpense)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: parseFloat(r.debtPayment) > 0 ? "var(--color-warning)" : undefined }}>
                    {formatMoneyCell(r.debtPayment)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: 600, color: "var(--color-primary-700)" }}>
                    {formatMoneyCell(r.contribution)}
                    {parseFloat(r.budgetShortfall) > 0 && (
                      <small style={{ display: "block", fontSize: "14px", color: "var(--color-danger)" }}>
                        {isEn ? "Shortfall: -" : "Thiếu: -"}{formatMoneyCell(r.budgetShortfall)}
                      </small>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: 600, color: parseFloat(r.withdrawal) > 0 ? "var(--color-warning)" : undefined }}>
                    {formatMoneyCell(r.withdrawal)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--color-text-muted)" }}>
                    {formatMoneyCell(r.uninvestedSurplus)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: parseFloat(r.investmentChange) >= 0 ? "var(--color-secondary-700)" : "var(--color-danger)" }}>
                    {formatMoneyCell(r.investmentChange)}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      fontWeight: 700,
                      color: isNegative ? "var(--color-danger)" : "var(--color-primary-700)",
                    }}
                  >
                    {formatMoneyCell(r.closingBalance)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: 600, color: "var(--color-secondary-700)" }}>
                    {formatMoneyCell(r.requiredClosingBalance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          showRowsPerPage={false}
        />
      )}
    </div>
  );
}
