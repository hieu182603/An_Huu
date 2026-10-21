import type { GlidePathPoint } from "../services/portfolios";
import { portfolioAssetColor, portfolioAssetLabel, portfolioGlideWeights, portfolioGlideYears } from "../utils/portfolioGlidePath";
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
  const percent = new Intl.NumberFormat(en ? "en-US" : "vi-VN", { maximumFractionDigits: 1 });
  const weightOf = (row: GlidePathPoint, code: string) => Number(row.allocations.find(a => a.assetClass === code)?.weightPercent ?? "0");
  const label = (code: string) => portfolioAssetLabel(code, language, assetLabels);
  const current = years === null ? undefined : rows.find(r => r.yearsToAnchor === years);
  const yearsText = (n: number) => n === 0 ? (en ? "At retirement" : "Khi nghỉ hưu") : en ? `${n} yr${n > 1 ? "s" : ""} left` : `Còn ${n} năm`;
  const describe = (row: GlidePathPoint) => codes.map(c => `${label(c)} ${percent.format(weightOf(row, c))}%`).join(", ");

  const Bar = ({ row, big }: { row: GlidePathPoint; big?: boolean }) => <div className={`pf-glide-bar${big ? " is-big" : ""}`} aria-hidden="true">
    {codes.map((code, i) => {
      const w = weightOf(row, code);
      return w > 0 ? <span key={code} style={{ width: `${w}%`, background: portfolioAssetColor(code, i) }} title={`${label(code)}: ${percent.format(w)}%`}>
        {w >= 8 && `${percent.format(w)}%`}
      </span> : null;
    })}
  </div>;

  return <section className="pf-glide" aria-labelledby="pf-glide-title">
    <header className="pf-glide-head">
      <div>
        <h3 id="pf-glide-title">{en ? "Allocation path to retirement" : "Lộ trình phân bổ tới nghỉ hưu"}</h3>
        <p>{en ? "Risk is reduced step by step as retirement approaches." : "Tỷ trọng tài sản rủi ro giảm dần khi bạn tiến gần tới nghỉ hưu."}</p>
      </div>
      {years !== null && <div className="pf-glide-pos">
        <small>{en ? "You are here" : "Bạn đang ở"}</small>
        <strong>{yearsText(years)}</strong>
        <span>{en ? `${month} → retire ${retirementMonth}` : `${month} → nghỉ hưu ${retirementMonth}`}</span>
      </div>}
    </header>

    {points.length === 0 ? <p>{en ? "No allocation points available." : "Chưa có các điểm phân bổ."}</p> : <>
      {current ? <div className="pf-glide-current" aria-label={`${en ? "Current allocation" : "Tỷ trọng hiện tại"}: ${describe(current)}`}>
        <div className="pf-glide-current-label">{en ? "Current allocation" : "Tỷ trọng hiện tại"}{interpolated && <em> · {en ? "interpolated" : "nội suy"}</em>}</div>
        <Bar row={current} big />
        <ul className="pf-glide-legend">
          {codes.map((code, i) => <li key={code}>
            <i style={{ background: portfolioAssetColor(code, i) }} aria-hidden="true" />
            <span>{label(code)}</span>
            <strong>{percent.format(weightOf(current, code))}%</strong>
          </li>)}
        </ul>
      </div> : <p className="pf-glide-missing">{en ? "Retirement month or valuation month is missing; current position is undetermined." : "Chưa đủ tháng nghỉ hưu hoặc tháng định giá để xác định vị trí hiện tại."}</p>}

      <table className="sr-only">
        <caption>{en ? "Retirement allocation path" : "Lộ trình phân bổ tới nghỉ hưu"}</caption>
        <thead><tr><th scope="col">{en ? "Years to retirement" : "Số năm tới nghỉ hưu"}</th>{codes.map(code => <th scope="col" key={code}>{label(code)}</th>)}</tr></thead>
        <tbody>{rows.map(row => {
          const isCurrent = row.yearsToAnchor === years;
          return <tr key={row.yearsToAnchor} aria-current={isCurrent ? "true" : undefined}>
            <th scope="row">{row.yearsToAnchor}{isCurrent && <> · {en ? "Current position" : "Vị trí hiện tại"}{interpolated ? (en ? " (interpolated ≈)" : " (nội suy ≈)") : ""}</>}</th>
            {codes.map(code => <td key={code}>{percent.format(weightOf(row, code))}%</td>)}
          </tr>;
        })}</tbody>
      </table>
      <ol className="pf-glide-rows" aria-hidden="true">
        {rows.map(row => {
          const isCurrent = row.yearsToAnchor === years;
          return <li key={row.yearsToAnchor} className={isCurrent ? "is-current" : undefined}>
            <span className="pf-glide-year">
              <strong>{row.yearsToAnchor}</strong>
              <small>{row.yearsToAnchor === 0 ? (en ? "retire" : "nghỉ hưu") : (en ? "yrs left" : "năm nữa")}</small>
            </span>
            <Bar row={row} />
            {isCurrent && <span className="pf-glide-tag">{en ? "Now" : "Hiện tại"}</span>}
          </li>;
        })}
      </ol>
      {!current && <ul className="pf-glide-legend">
        {codes.map((code, i) => <li key={code}><i style={{ background: portfolioAssetColor(code, i) }} aria-hidden="true" /><span>{label(code)}</span></li>)}
      </ul>}
    </>}

    <p className="pf-glide-note">{en
      ? "Between points, weights are interpolated linearly by whole years. Under 12 months to retirement and after retirement, the 0-year point applies; exactly 12 months counts as 1 year."
      : "Giữa các mốc, tỷ trọng được nội suy tuyến tính theo năm nguyên. Còn dưới 12 tháng và sau nghỉ hưu dùng mốc 0; đúng 12 tháng tính là 1 năm."}</p>
  </section>;
}
