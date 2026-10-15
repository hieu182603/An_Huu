import type { GlidePathPoint } from "../services/portfolios";
import { portfolioAssetLabel, portfolioGlideWeights, portfolioGlideYears } from "../utils/portfolioGlidePath";
import { Card } from "./ui";
import "./portfolio-glide-path.css";

export function PortfolioGlidePath({ points, month, retirementMonth, language, assetLabels }: {
  points: GlidePathPoint[]; month: string; retirementMonth?: string; language: "vi" | "en"; assetLabels: Record<string, string>;
}) {
  const en = language === "en";
  const years = portfolioGlideYears(points, month, retirementMonth);
  const rows = [...points];
  const interpolated = years !== null && !points.some(p => p.yearsToAnchor === years);
  if (interpolated) rows.push({ yearsToAnchor: years, allocations: portfolioGlideWeights(points, years) });
  rows.sort((a, b) => b.yearsToAnchor - a.yearsToAnchor);
  const codes = [...new Set(points.flatMap(p => p.allocations.map(a => a.assetClass)))];
  const percent = new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 2 });
  return <Card style={{ padding: "var(--space-4)", marginBottom: "var(--space-6)" }}>
    <h3>{en ? "Years to retirement → allocation weights" : "Số năm tới nghỉ hưu → tỷ trọng"}</h3>
    <p>{en
      ? "Weights are interpolated linearly using whole years between points. With fewer than 12 months to retirement, and after retirement, the zero-year point applies. Exactly 12 months counts as 1 year."
      : "Giữa các điểm, tỷ trọng được nội suy tuyến tính theo năm nguyên. Khi còn dưới 12 tháng tới nghỉ hưu và sau nghỉ hưu, dùng điểm 0. Đúng 12 tháng được tính là 1 năm."}</p>
    {years !== null ? <p>{en ? `Current position: ${years} whole years (as of ${month}; retirement ${retirementMonth}).` : `Vị trí hiện tại: ${years} năm nguyên (tại tháng ${month}; nghỉ hưu ${retirementMonth}).`}</p>
      : <p>{en ? "Retirement month or valuation month is missing; current position is undetermined." : "Chưa đủ tháng nghỉ hưu hoặc tháng định giá để xác định vị trí hiện tại."}</p>}
    {points.length === 0 ? <p>{en ? "No allocation points available." : "Chưa có các điểm phân bổ."}</p> : <div style={{ overflowX: "auto" }}>
      <table className="portfolio-glide-table">
        <caption className="sr-only">{en ? "Retirement allocation path" : "Lộ trình phân bổ tới nghỉ hưu"}</caption>
        <thead><tr><th scope="col">{en ? "Years to retirement" : "Số năm tới nghỉ hưu"}</th>{codes.map(code => <th scope="col" key={code}>{portfolioAssetLabel(code, language, assetLabels)}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const current = row.yearsToAnchor === years;
          return <tr key={row.yearsToAnchor} aria-current={current ? "true" : undefined} style={current ? { background: "var(--color-surface-subtle)", fontWeight: 700 } : undefined}>
            <th scope="row">{row.yearsToAnchor}{current && <> · {en ? "Current position" : "Vị trí hiện tại"}{interpolated ? (en ? " (interpolated ≈)" : " (nội suy ≈)") : ""}</>}</th>
            {codes.map(code => <td key={code}>{percent.format(Number(row.allocations.find(a => a.assetClass === code)?.weightPercent ?? "0"))}%</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </Card>;
}
