import { useState } from "react";
import { Link } from "react-router";
import { Alert, Button, Pagination } from "../ui";
import type { ActualForecastResult } from "../../services/actuals";

export function AnchorReforecastResult({ result, language, onSelectMonth }: {
  result: ActualForecastResult;
  language: "vi" | "en";
  onSelectMonth: (month: string) => void;
}) {
  const en = language === "en";
  const t = (vi: string, english: string) => en ? english : vi;
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  // Keep server decimal strings exact, including amounts above Number.MAX_SAFE_INTEGER.
  const money = (value: string | null | undefined) => {
    if (!value || !/^-?\d+(\.\d+)?$/.test(value)) return t("Chưa xác định", "Unknown");
    const [integer, fraction = ""] = value.replace(/^-/, "").split(".");
    const decimal = fraction.replace(/0+$/, "");
    return `${value.startsWith("-") ? "-" : ""}${BigInt(integer).toLocaleString(en ? "en-US" : "vi-VN")}${decimal ? `${en ? "." : ","}${decimal}` : ""} ₫`;
  };
  const issueLabels: Record<string, string> = {
    MISSING_MONTH: t("Chưa khai báo sổ thực tế", "Actual month not recorded"),
    UNRECONCILED_MONTH: t("Sổ thực tế chưa khớp số dư đối soát", "Actual balances are not reconciled"),
    OPENING_BALANCE_MISMATCH: t("Số dư đầu kỳ không khớp số dư cuối kỳ tháng trước", "Opening balance does not match the previous closing balance"),
    MONTH_NOT_CLOSED: t("Tháng chưa kết thúc; hãy chọn tháng đã kết thúc", "Month has not ended; select a completed month"),
  };
  const notes: Record<string, string> = {
    ORIGINAL_VERSION_FUTURE_CASHFLOWS_AND_RATES_RETAINED: t("Giữ dòng tiền tương lai và tỷ suất của phiên bản gốc.", "Future cash flows and rates from the original version are retained."),
    ACTUAL_ONE_OFFS_NOT_REPEATED: t("Các khoản thực tế phát sinh một lần không được lặp lại.", "One-off actual transactions are not repeated."),
    NO_AUTOMATIC_SURPLUS_DEPOSIT: t("Tiền dư không tự động được nộp vào quỹ.", "Surplus is not automatically deposited into the fund."),
    CONSOLIDATED_FUND_SCOPE_MUST_MATCH_VERSION: t("Số dư thực tế phải cùng phạm vi quỹ với phiên bản gốc.", "Actual balances must cover the same fund scope as the original version."),
    REFORECAST_NOT_SAVED_OR_APPLIED: t("Kết quả này chưa được lưu hoặc áp dụng vào kế hoạch.", "This result has not been saved or applied to the plan."),
  };
  if (result.status === "BLOCKED") return <Alert tone="warning" title={t("Cần hoàn tất đối soát trước khi dự báo", "Reconciliation required before forecasting")}>
    <p>{t("Kiểm tra các tháng sau rồi chạy lại dự báo:", "Review these months, then run the forecast again:")}</p>
    {result.issues.length ? <ul className="anchor-issues">{result.issues.map((issue, index) => <li key={`${issue.month}-${index}`}>
      <span>{issue.month}: {issueLabels[issue.code] ?? t("Cần kiểm tra dữ liệu tháng này.", "Review the data for this month.")}</span>
      {!issueLabels[issue.code] && <small>{t("Mã kiểm tra: ", "Check code: ")}{issue.code}</small>}
      {issue.code !== "MONTH_NOT_CLOSED" && /^\d{4}-(0[1-9]|1[0-2])$/.test(issue.month) && <Button variant="secondary" onClick={() => onSelectMonth(issue.month)}>{t("Mở sổ tháng", "Open ledger for")} {issue.month}</Button>}
    </li>)}</ul> : <p>{t("Chưa có chi tiết lỗi. Hãy tải lại sổ thực tế và thử lại.", "No issue details are available. Reload the actual ledger and retry.")}</p>}
  </Alert>;
  if (result.status === "HORIZON_COMPLETE") return <Alert tone="info" title={t("Đã hết kỳ dự báo", "Projection horizon completed")}>
    <p>{t("Toàn bộ kỳ dự báo của phiên bản kế hoạch đã qua. Tạo phiên bản mới để tiếp tục lập kế hoạch.", "This version's projection horizon has ended. Create a new version to continue planning.")}</p>
    <Link to="/user/plan">{t("Mở kế hoạch hưu trí", "Open retirement plan")}</Link>
  </Alert>;
  if (!result.anchor || !result.calculation?.summary?.atRetirement) return <Alert tone="danger" title={t("Kết quả dự báo chưa đầy đủ", "Incomplete forecast result")}>
    {t("Chưa nhận đủ số dư neo hoặc kết quả tính. Hãy chạy lại dự báo.", "The anchor or calculation is missing. Run the forecast again.")}
  </Alert>;
  const { anchor, calculation } = result;
  const coverage = calculation.summary.atRetirement.coveragePercent;
  const rows = calculation.rows ?? [];
  const years = [...new Set(rows.map(row => row.month.slice(0, 4)))];
  const filtered = rows.filter(row => !year || row.month.startsWith(`${year}-`));
  const visible = filtered.slice((page - 1) * 24, page * 24);
  const comparisonTitle = t("Đối chiếu số thực tế với dự báo gốc", "Actuals compared with the original forecast");
  const futureTitle = t("Dự báo các tháng tiếp theo", "Forecast for subsequent months");
  return <div className="anchor-reforecast-result">
    <p>{t("Dự báo lại từ số dư thực tế đã lưu; chưa thay đổi kế hoạch chính thức.", "Reforecast from saved actual balances; the official plan is unchanged.")}</p>
    <div className="anchor-summary">
      <div><span>{t("Số dư neo thực tế", "Actual anchor balance")}</span><strong>{money(anchor.closingBalance)}</strong><small>{anchor.period} · {t("Phiên bản sổ", "Ledger revision")} r{anchor.revision}</small></div>
      <div><span>{t("Quỹ dự kiến khi nghỉ hưu", "Projected fund at retirement")}</span><strong>{money(calculation.summary.atRetirement.projectedFund)}</strong></div>
      <div><span>{t("Tỷ lệ bao phủ mới", "Revised coverage")}</span><strong>{coverage == null ? t("Chưa xác định", "Unknown") : `${coverage}%`}</strong>{coverage == null && <small>{t("Chưa có tỷ lệ bao phủ trong kết quả tính.", "The calculation did not provide a coverage ratio.")}</small>}</div>
    </div>
    <h3>{comparisonTitle}</h3>
    <p>{t("Số tiền: VND. Chênh lệch = số dư thực tế − số dư dự báo gốc.", "Amounts in VND. Variance = actual balance − original forecast balance.")}</p>
    <div className="anchor-table" role="region" aria-label={comparisonTitle} tabIndex={0}>
      <table><thead><tr>{[t("Tháng", "Month"), t("Số dư thực tế", "Actual balance"), t("Số dư dự báo gốc", "Original balance"), t("Chênh lệch", "Variance"), t("Tích lũy thực tế", "Actual contribution"), t("Tích lũy dự báo gốc", "Original contribution")].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.comparison.map(row => <tr key={row.month}><th scope="row">{row.month}</th>{[row.actualClosingBalance, row.forecastClosingBalance, row.closingBalanceDelta, row.actualContribution, row.forecastContribution].map((value, index) => <td key={index}>{money(value)}</td>)}</tr>)}</tbody></table>
      {!result.comparison.length && <p>{t("Chưa có dữ liệu đối chiếu.", "No comparison data is available.")}</p>}
    </div>
    <h3>{futureTitle}</h3>
    <p>{t("Tính tiếp từ số dư neo, giữ các giả định của phiên bản gốc. Số tiền: VND.", "Continues from the anchor balance using the original version's assumptions. Amounts in VND.")}</p>
    {rows.length > 0 ? <>
      <label className="anchor-year">{t("Năm dự báo", "Forecast year")}<select className="input" aria-label={t("Năm dự báo", "Forecast year")} value={year} onChange={e => { setYear(e.target.value); setPage(1); }}><option value="">{t("Tất cả các năm", "All years")}</option>{years.map(value => <option key={value}>{value}</option>)}</select></label>
      <div className="anchor-table" role="region" aria-label={futureTitle} tabIndex={0}>
        <table><thead><tr>{[t("Tháng", "Month"), t("Số dư đầu kỳ", "Opening balance"), t("Đóng góp vào quỹ", "Contribution"), t("Rút từ quỹ", "Withdrawal"), t("Số dư cuối kỳ", "Closing balance")].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{visible.map(row => <tr key={row.month}><th scope="row">{row.month}</th>{[row.openingBalance, row.contribution, row.withdrawal, row.closingBalance].map((value, index) => <td key={index}>{money(value)}</td>)}</tr>)}</tbody></table>
      </div>
      <Pagination page={page} totalPages={Math.ceil(filtered.length / 24)} totalItems={filtered.length} pageSize={24} onPageChange={setPage} showRowsPerPage={false} />
    </> : <Alert tone="warning" title={t("Chưa có bảng dự báo theo tháng", "Monthly forecast unavailable")}>{t("Kết quả chưa có các dòng dự báo. Hãy chạy lại để kiểm tra.", "No monthly rows were returned. Run the forecast again to check.")}</Alert>}
    {result.limitations.length > 0 && <aside><h3>{t("Giả định và giới hạn", "Assumptions and limitations")}</h3><ul>{result.limitations.map((note, index) => <li key={index}>{notes[note] ?? note}</li>)}</ul></aside>}
  </div>;
}
