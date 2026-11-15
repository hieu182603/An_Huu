import type { RetirementRow } from "../../services/retirement";
import { Decimal } from "../../utils/decimal";
import { financeMoney } from "../../utils/financeHubSummary";

export default function AnnualCashflowTable({ rows, en }: { rows: RetirementRow[]; en: boolean }) {
  const years = new Map<string, RetirementRow[]>();
  for (const row of rows) { const year = row.month.slice(0, 4); years.set(year, [...years.get(year) ?? [], row]); }
  const sum = (items: RetirementRow[], key: "contribution" | "withdrawal" | "investmentChange") => items.reduce((total, row) => total.plus(row[key] ?? "0"), new Decimal(0)).toString();
  return <div className="cashflow-ledger-scroll" tabIndex={0} role="region" aria-label={en ? "Annual cashflow" : "Dòng tiền tổng hợp theo năm"}>
    <table className="cashflow-ledger"><thead><tr>{(en ? ["Year", "Into the fund", "Needed from fund", "Investment gain / loss", "Fund at year end"] : ["Năm", "Góp vào quỹ", "Cần rút từ quỹ", "Lãi / lỗ dự tính", "Quỹ cuối năm"]).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{[...years].map(([year, items]) => <tr key={year}><th scope="row">{year}</th>{([sum(items,"contribution"),sum(items,"withdrawal"),sum(items,"investmentChange"),items[items.length-1].closingBalance]).map((amount, index) => <td key={index}>{financeMoney(amount, en)}</td>)}</tr>)}</tbody></table>
  </div>;
}
