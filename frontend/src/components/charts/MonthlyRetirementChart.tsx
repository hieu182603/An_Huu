import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { RetirementRow, RetirementSummary } from "../../services/retirement";
import { formatMonthVN } from "../../utils/date";

interface MonthlyRetirementChartProps {
  rows: RetirementRow[];
  summary: RetirementSummary;
  birthYear?: number;
  birthMonth?: string;
  responsive?: boolean;
}

export type ChartFilterMode = "annual" | "all-months" | "first-5y" | "retirement-phase";

function formatCompactCurrency(val: number): string {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1e9) {
    const v = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1e9);
    return `${v} tỷ ₫`;
  }
  if (Math.abs(n) >= 1e6) {
    const v = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: Math.round(n / 1e5) % 10 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(n / 1e6);
    return `${v} triệu ₫`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫`;
}

function formatAxisCompact(val: number): string {
  const n = Number(val) || 0;
  if (Math.abs(n) >= 1e9) {
    const v = new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: Math.round(n / 1e8) % 10 === 0 ? 0 : 1,
      maximumFractionDigits: 2,
    }).format(n / 1e9);
    return `${v} tỷ`;
  }
  if (Math.abs(n) >= 1e6) {
    const v = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n / 1e6);
    return `${v} triệu`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} ₫`;
}

function formatFullVnd(val: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(Number(val) || 0))} ₫`;
}

function normalizeYearMonth(month: string): string {
  const m = String(month || "").trim();
  if (/^\d{2}\/\d{4}$/.test(m)) {
    const [mm, yyyy] = m.split("/");
    return `${yyyy}-${mm}`;
  }
  return m;
}

function ageAtMonth(month: string, birthYear?: number, birthMonth?: string): number | null {
  const norm = normalizeYearMonth(month);
  const y = Number(norm.slice(0, 4));
  if (birthMonth && /^\d{4}-\d{2}$/.test(birthMonth) && /^\d{4}-\d{2}$/.test(norm)) {
    return Math.max(0, Math.floor(((y - Number(birthMonth.slice(0, 4))) * 12 + Number(norm.slice(5, 7)) - Number(birthMonth.slice(5, 7))) / 12));
  }
  if (!Number.isFinite(y) || y <= 0 || birthYear == null || !Number.isFinite(birthYear)) return null;
  return Math.max(18, y - birthYear);
}

function rowClosing(r: RetirementRow | undefined): number {
  if (!r) return 0;
  return Number(r.fundedClosingBalance ?? r.closingBalance ?? (r as any).closingFund ?? 0);
}

function rowOpening(r: RetirementRow | undefined): number {
  if (!r) return 0;
  return Number(r.openingBalance ?? (r as any).openingFund ?? rowClosing(r));
}

export function MonthlyRetirementChart({ rows, summary, birthYear, birthMonth, responsive = false }: MonthlyRetirementChartProps) {
  const { language } = useI18n();
  const isEn = language === "en";
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(840);
  const hasRows = Boolean(rows?.length);
  useEffect(() => {
    if (!responsive || !frame.current) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [responsive, hasRows]);

  const retIdx = useMemo(() => {
    if (!rows || rows.length === 0) return 0;
    const targetMonth = normalizeYearMonth(summary.retirementMonth);
    const idx = rows.findIndex(
      r => normalizeYearMonth(r.month) === targetMonth || r.phase === "RETIREMENT"
    );
    return idx >= 0 ? idx : Math.min(Math.max(0, summary.accumulationMonths - 1), rows.length - 1);
  }, [rows, summary.retirementMonth, summary.accumulationMonths]);

  const defaultSelectedIdx = useMemo(() => {
    if (!rows || rows.length === 0) return 0;
    // Match demo: select the last accumulation month (or retirement boundary)
    return Math.max(0, retIdx > 0 ? retIdx - 1 : retIdx);
  }, [rows, retIdx]);

  const [selectedIdx, setSelectedIdx] = useState<number>(defaultSelectedIdx);

  useEffect(() => {
    setSelectedIdx(defaultSelectedIdx);
  }, [defaultSelectedIdx]);

  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--muted, #64748b)" }}>
        {isEn ? "No projection data available." : "Chưa có dữ liệu dòng tiền dự phóng."}
      </div>
    );
  }

  const safeIdx = Math.min(Math.max(0, selectedIdx), rows.length - 1);
  const currentRow = rows[safeIdx];
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const retRow = rows[Math.max(0, retIdx > 0 ? retIdx - 1 : retIdx)] || rows[retIdx] || firstRow;

  const startAge = Number((firstRow as any).age) || ageAtMonth(firstRow.month, birthYear, birthMonth);
  const retAge = Number((rows[retIdx] as any)?.age) || ageAtMonth(summary.retirementMonth || retRow.month, birthYear, birthMonth);
  const endAge = Number((lastRow as any).age) || ageAtMonth(lastRow.month, birthYear, birthMonth);
  const selectedAge = Number((currentRow as any).age) || ageAtMonth(currentRow.month, birthYear, birthMonth);

  const requiredAtRetirement = Number(summary.atRetirement?.requiredFund || 0);
  const projectedAtRetirement = Number(summary.atRetirement?.projectedFund ?? rowClosing(retRow));
  const initialFund = rowOpening(firstRow);

  const maxBalance = (() => {
    let m = requiredAtRetirement;
    for (const r of rows) {
      const b = Math.max(0, rowClosing(r));
      if (b > m) m = b;
    }
    return Math.max(m, 1);
  })();

  // SVG layout matching plan-chart.js
  const W = responsive ? Math.max(240, Math.min(840, frameWidth)) : 840;
  const H = 310;
  const pad = { l: W < 500 ? 60 : 82, r: W < 500 ? 16 : 22, t: 24, b: 44 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const xOf = (i: number) => pad.l + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * plotW);
  const yOf = (val: number) => {
    const clamped = Math.max(0, Number(val) || 0);
    return pad.t + plotH - Math.min(1, clamped / maxBalance) * plotH;
  };

  const splitIdx = Math.max(0, Math.min(rows.length - 1, retIdx > 0 ? retIdx - 1 : retIdx));

  const accPoints = rows
    .slice(0, splitIdx + 1)
    .map((r, idx) => `${xOf(idx).toFixed(1)},${yOf(rowClosing(r)).toFixed(1)}`)
    .join(" ");
  const accArea = `${xOf(0).toFixed(1)},${(pad.t + plotH).toFixed(1)} ${accPoints} ${xOf(splitIdx).toFixed(1)},${(pad.t + plotH).toFixed(1)}`;

  const retSlice = rows.slice(splitIdx);
  const retPoints = retSlice
    .map((r, offset) => {
      const idx = splitIdx + offset;
      return `${xOf(idx).toFixed(1)},${yOf(rowClosing(r)).toFixed(1)}`;
    })
    .join(" ");
  const retArea =
    retSlice.length > 0
      ? `${xOf(splitIdx).toFixed(1)},${(pad.t + plotH).toFixed(1)} ${retPoints} ${xOf(rows.length - 1).toFixed(1)},${(pad.t + plotH).toFixed(1)}`
      : "";

  const retX = xOf(splitIdx);
  const selX = xOf(safeIdx);
  const selBalance = Math.max(0, rowClosing(currentRow));
  const selY = yOf(selBalance);
  const targetY = yOf(requiredAtRetirement);

  const firstShortfallRow = rows.find(r => Number(r.unfundedWithdrawal || 0) > 0);

  const selectedContribution = Number(currentRow.contribution || 0);
  // The API's withdrawal already includes any advisory fee paid from the fund.
  const selectedOutflow = Number(currentRow.withdrawal || 0);

  return (
    <div className="plan-chart-interactive">
      <div ref={frame} className="chart-frame" style={{ width: "100%", overflowX: "auto" }}>
        <svg
          className="projection-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={isEn ? "Monthly retirement fund projection chart" : "Biểu đồ số dư quỹ nghỉ hưu theo từng tháng"}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map(p => {
            const y = pad.t + plotH - p * plotH;
            const v = maxBalance * p;
            return (
              <g key={p}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#e3ebf3" strokeWidth="1" />
                <text x={pad.l - 10} y={y + 4} textAnchor="end" fill="#5e7285" fontSize="11">
                  {formatAxisCompact(v)}
                </text>
              </g>
            );
          })}

          {accPoints && <polygon points={accArea} fill="rgba(34,94,170,0.14)" />}
          {retPoints && <polygon points={retArea} fill="rgba(125,91,166,0.14)" />}
          {accPoints && (
            <polyline
              fill="none"
              stroke="#225eaa"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={accPoints}
            />
          )}
          {retPoints && (
            <polyline
              fill="none"
              stroke="#7d5ba6"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={retPoints}
            />
          )}

          <line
            x1={retX}
            x2={retX}
            y1={pad.t}
            y2={pad.t + plotH}
            stroke="#7a8ea3"
            strokeDasharray="4 4"
            strokeWidth="1.2"
          />

          {requiredAtRetirement > 0 && (
            <g>
              <circle cx={retX} cy={targetY} r="4.5" fill="#7d5ba6" />
              <text
                x={Math.min(W - pad.r - 4, retX + 8)}
                y={Math.max(pad.t + 12, targetY - 6)}
                fill="#5e3d82"
                fontSize="11"
                fontWeight="700"
              >
                {isEn ? `Need ${formatAxisCompact(requiredAtRetirement)}` : `Cần ${formatAxisCompact(requiredAtRetirement)}`}
              </text>
            </g>
          )}

          <line
            x1={selX}
            x2={selX}
            y1={pad.t}
            y2={pad.t + plotH}
            stroke="#173a6a"
            strokeWidth="1.2"
            opacity="0.55"
          />
          <circle cx={selX} cy={selY} r="5.5" fill="#173a6a" stroke="#fff" strokeWidth="2" />

          <text x={pad.l} y={H - 14} fill="#5e7285" fontSize="11">
            {startAge === null ? formatMonthVN(firstRow.month) : `${startAge} ${isEn ? "yrs" : "tuổi"}`}
          </text>
          {W >= 500 && <text x={retX} y={H - 14} textAnchor="middle" fill="#173a6a" fontSize="11" fontWeight="700">
            {retAge === null ? (isEn ? "Retirement" : "Nghỉ hưu") : isEn ? `Retire · ${retAge} yrs` : `Nghỉ hưu · ${retAge} tuổi`}
          </text>}
          <text x={W - pad.r} y={H - 14} textAnchor="end" fill="#5e7285" fontSize="11">
            {endAge === null ? formatMonthVN(lastRow.month) : `${endAge} ${isEn ? "yrs" : "tuổi"}`}
          </text>
        </svg>
      </div>

      <div
        className="chart-phase-key"
        aria-label={isEn ? "Phase legend" : "Chú giải giai đoạn"}
        style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "12px", color: "#4f6478", margin: "8px 0 14px" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <i style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#225eaa", display: "inline-block" }} />
          {retAge === null ? (isEn ? "Accumulate before retirement" : "Tích lũy trước nghỉ hưu") : isEn ? `Accumulate until age ${retAge}` : `Tích lũy đến ${retAge} tuổi`}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <i style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#7d5ba6", display: "inline-block" }} />
          {isEn ? "Spend fund in retirement" : "Dùng quỹ khi nghỉ hưu"}
        </span>
      </div>

      <div
        className="chart-inspector"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "14px 18px",
          background: "#f8fbff",
          border: "1px solid #d8e5f3",
          borderRadius: "12px",
          marginBottom: "14px",
        }}
      >
        <div>
          <span style={{ display: "block", fontSize: "12px", color: "#536779", marginBottom: "2px" }}>
            {isEn
              ? `End of ${formatMonthVN(currentRow.month)}${selectedAge === null ? "" : ` · age ${selectedAge}`}`
              : `Cuối tháng ${formatMonthVN(currentRow.month)}${selectedAge === null ? "" : ` · ${selectedAge} tuổi`}`}
          </span>
          <strong style={{ fontSize: "22px", fontWeight: 700, color: "#052659" }}>
            {formatFullVnd(selBalance)}
          </strong>
        </div>
        <dl style={{ display: "flex", gap: "24px", margin: 0, flexWrap: "wrap" }}>
          <div>
            <dt style={{ fontSize: "11.5px", color: "#637589", marginBottom: "2px" }}>
              {isEn ? "Contribution in month" : "Góp trong tháng"}
            </dt>
            <dd style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "#052659" }}>
              {formatFullVnd(selectedContribution)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: "11.5px", color: "#637589", marginBottom: "2px" }}>
              {isEn ? "Withdrawal from fund, incl. fees" : "Chi từ quỹ, gồm phí nếu có"}
            </dt>
            <dd style={{ margin: 0, fontSize: "13.5px", fontWeight: 700, color: "#052659" }}>
              {formatFullVnd(selectedOutflow)}
            </dd>
          </div>
        </dl>
      </div>

      <label
        className="chart-slider-label"
        htmlFor="plan-chart-month-slider"
        style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#456B91", marginBottom: "6px" }}
      >
        {isEn ? "Drag to inspect each month" : "Kéo để xem từng tháng"}
      </label>
      <input
        id="plan-chart-month-slider"
        type="range"
        min={0}
        max={Math.max(0, rows.length - 1)}
        value={safeIdx}
        onChange={e => setSelectedIdx(Number(e.target.value))}
        aria-label={isEn ? "Select month on chart" : "Chọn tháng trên biểu đồ"}
        aria-valuetext={`${formatMonthVN(currentRow.month)} · ${formatFullVnd(selBalance)}`}
        style={{ width: "100%", accentColor: "#225eaa", cursor: "pointer", marginBottom: "12px" }}
      />

      <div
        className="chart-milestones"
        style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}
      >
        <button
          type="button"
          onClick={() => setSelectedIdx(0)}
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid #cddfee",
            background: "#fff",
            color: "#052659",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isEn ? `Start · ${formatCompactCurrency(initialFund)}` : `Bắt đầu · ${formatCompactCurrency(initialFund)}`}
        </button>
        <button
          type="button"
          onClick={() => setSelectedIdx(splitIdx)}
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid #cddfee",
            background: "#fff",
            color: "#052659",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isEn
            ? `Retire${retAge === null ? "" : ` · ${retAge} yrs`} · ${formatCompactCurrency(projectedAtRetirement)}`
            : `Nghỉ hưu${retAge === null ? "" : ` · ${retAge} tuổi`} · ${formatCompactCurrency(projectedAtRetirement)}`}
        </button>
        {firstShortfallRow ? <button type="button" className="chart-shortfall-jump" onClick={() => setSelectedIdx(rows.indexOf(firstShortfallRow))}>
          {isEn
              ? `Shortfall starts ${formatMonthVN(firstShortfallRow.month)} · first month gap ${formatCompactCurrency(Number(firstShortfallRow.unfundedWithdrawal || 0))}`
              : `Bắt đầu thiếu từ ${formatMonthVN(firstShortfallRow.month)} · thiếu tháng đầu ${formatCompactCurrency(Number(firstShortfallRow.unfundedWithdrawal || 0))}`}
        </button> : <span style={{ fontSize: "12px", color: "#536779", marginLeft: "4px" }}>{endAge === null ? (isEn ? `Projected through ${formatMonthVN(lastRow.month)}` : `Dự phóng đến ${formatMonthVN(lastRow.month)}`) : isEn ? `Lasts until age ${endAge} (${formatMonthVN(lastRow.month)})` : `Đủ dùng đến ${endAge} tuổi (${formatMonthVN(lastRow.month)})`}</span>}
      </div>

      <details className="chart-explanation" style={{ fontSize: "12.5px", color: "#456B91", borderTop: "1px solid #e6eef7", paddingTop: "10px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "#052659" }}>
          {isEn ? "How to read the chart" : "Cách đọc biểu đồ"}
        </summary>
        <p style={{ margin: "6px 0 0", lineHeight: 1.55 }}>
          {isEn
            ? "The blue line shows the accumulation phase before retirement. The purple area shows the retirement spending phase. Drag the slider to inspect the balance, contribution, and withdrawal of any month."
            : "Đường màu xanh là giai đoạn tích lũy trước nghỉ hưu. Vùng màu tím là giai đoạn rút quỹ để chi tiêu khi nghỉ hưu. Kéo thanh trượt để kiểm tra số dư, tiền góp và tiền rút của từng tháng."}
        </p>
      </details>
    </div>
  );
}
