import type { PortfolioScenarioResult } from "../services/portfolios";
import "./portfolio-scenarios.css";

const ORDER = ["ADVERSE", "BASE", "FAVORABLE"] as const;
const TONE: Record<PortfolioScenarioResult["kind"], string> = { BASE: "base", ADVERSE: "adverse", FAVORABLE: "favorable" };

// Display only: derived from the server's monthly unit-value path; exact values stay server-side.
function summarize(sc: PortfolioScenarioResult) {
  const months = sc.rows.length;
  const ending = Number(sc.endingUnitValue);
  const inflation = sc.rows.reduce((acc, r) => acc * Number(r.inflationMonthlyFactor), 1);
  const real = ending / inflation;
  const annual = (v: number) => (months > 0 && v > 0 ? (Math.pow(v, 12 / months) - 1) * 100 : NaN);
  return { months, ending, real, nominalPct: annual(ending), realPct: annual(real), inflationPct: annual(inflation) };
}

export function PortfolioScenarios({ scenarios, language }: { scenarios: PortfolioScenarioResult[]; language: "vi" | "en" }) {
  const en = language === "en";
  const locale = en ? "en-US" : "vi-VN";
  const num = (v: number, d = 2) => (Number.isFinite(v) ? new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : "—");
  const signed = (v: number) => (Number.isFinite(v) && v > 0 ? "+" : "") + num(v) + "%";
  const sorted = [...scenarios].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const kindLabel = (k: PortfolioScenarioResult["kind"]) =>
    k === "BASE" ? (en ? "Base" : "Cơ sở") : k === "ADVERSE" ? (en ? "Cautious" : "Thận trọng") : (en ? "Optimistic" : "Lạc quan");
  const months = sorted[0]?.rows.length ?? 0;
  const first = sorted[0]?.rows[0]?.month, last = sorted[0]?.rows[months - 1]?.month;

  // Chart geometry
  const W = 1000, H = 240, P = { l: 0, r: 0, t: 8, b: 8 };
  const values = sorted.flatMap(s => s.rows.map(r => Number(r.unitValue))).concat(1);
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const x = (i: number) => P.l + (months > 1 ? (i / (months - 1)) * (W - P.l - P.r) : 0);
  const y = (v: number) => P.t + (1 - (v - min) / span) * (H - P.t - P.b);
  const step = Math.max(1, Math.ceil(months / 160));
  const path = (s: PortfolioScenarioResult) =>
    s.rows.filter((_, i) => i % step === 0 || i === s.rows.length - 1)
      .map((r, j, arr) => `${j ? "L" : "M"}${x(j === arr.length - 1 ? s.rows.length - 1 : j * step).toFixed(1)},${y(Number(r.unitValue)).toFixed(1)}`).join("");
  const ticks = [min, (min + max) / 2, max];

  return <section className="pf-scen" aria-labelledby="pf-scen-title">
    <header className="pf-scen-head">
      <div>
        <h3 id="pf-scen-title">{en ? "How 1 unit of the benchmark portfolio could evolve" : "1 đơn vị danh mục chuẩn có thể thay đổi thế nào"}</h3>
        <p>{en
          ? `Three macro scenarios over ${months} months (${first} → ${last}). 1.00 = starting value; not your actual fund balance.`
          : `Ba kịch bản vĩ mô trong ${months} tháng (${first} → ${last}). Mốc 1,00 = giá trị ban đầu; chưa phải số dư quỹ thực tế của bạn.`}</p>
      </div>
    </header>

    <div className="pf-scen-grid">
      {sorted.map(sc => {
        const s = summarize(sc);
        return <article key={sc.kind} className={`pf-scen-card is-${TONE[sc.kind]}`}>
          <div className="pf-scen-card-top">
            <span className="pf-scen-dot" aria-hidden="true" />
            <h4>{sc.label}</h4>
            <span className="pf-scen-chip">{kindLabel(sc.kind)}</span>
          </div>
          <div className="pf-scen-hero">
            <strong>{num(s.ending)}<small>×</small></strong>
            <span>{en ? "ending value of 1 unit" : "giá trị cuối kỳ của 1 đơn vị"}</span>
          </div>
          <dl className="pf-scen-stats">
            <div><dt>{en ? "Avg. return / yr" : "Sinh lời bình quân / năm"}</dt><dd>{signed(s.nominalPct)}</dd></div>
            <div><dt>{en ? "Avg. inflation / yr" : "Lạm phát bình quân / năm"}</dt><dd>{num(s.inflationPct)}%</dd></div>
            <div><dt>{en ? "After inflation" : "Sau lạm phát"}</dt><dd>{num(s.real)}× <small>({signed(s.realPct)}/{en ? "yr" : "năm"})</small></dd></div>
          </dl>
          {sc.evidence && <p className="pf-scen-note">{sc.evidence}</p>}
        </article>;
      })}
    </div>

    {months > 1 && <figure className="pf-scen-chart">
      <div className="pf-scen-plot">
        <div className="pf-scen-yaxis" aria-hidden="true">
          {ticks.map(t => <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>{num(t)}</span>)}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={en ? "Unit value path by scenario" : "Diễn biến giá trị 1 đơn vị theo kịch bản"}>
          {ticks.map(t => <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} className="pf-grid" vectorEffect="non-scaling-stroke" />)}
          {min < 1 && max > 1 && <line x1={0} x2={W} y1={y(1)} y2={y(1)} className="pf-base" vectorEffect="non-scaling-stroke" />}
          {sorted.map(sc => <path key={sc.kind} d={path(sc)} className={`pf-line is-${TONE[sc.kind]}`} vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div className="pf-scen-xaxis" aria-hidden="true"><span>{first}</span><span>{last}</span></div>
      </div>
      <figcaption>
        {sorted.map(sc => <span key={sc.kind} className={`pf-legend is-${TONE[sc.kind]}`}><i aria-hidden="true" />{sc.label}</span>)}
      </figcaption>
    </figure>}
  </section>;
}
