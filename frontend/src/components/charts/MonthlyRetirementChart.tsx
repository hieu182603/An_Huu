import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useI18n } from "../../i18n";
import type { RetirementRow, RetirementSummary } from "../../services/retirement";

interface MonthlyRetirementChartProps {
  rows: RetirementRow[];
  summary: RetirementSummary;
}

export type ChartFilterMode = "annual" | "all-months" | "first-5y" | "retirement-phase";

const formatVNDAxis = (value: number, isEn: boolean) => {
  if (Math.abs(value) >= 1_000_000_000) {
    return isEn ? `${(value / 1_000_000_000).toFixed(1)}B ₫` : `${(value / 1_000_000_000).toFixed(1)} tỷ`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return isEn ? `${Math.round(value / 1_000_000)}M ₫` : `${Math.round(value / 1_000_000)} tr`;
  }
  return `${value.toLocaleString(isEn ? "en-US" : "vi-VN")} ₫`;
};

const formatFullVND = (value: number, isEn: boolean) => {
  return `${new Intl.NumberFormat(isEn ? "en-US" : "vi-VN").format(Math.round(value))} ₫`;
};

const CustomTooltip = ({ active, payload, isEn }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  return (
    <div
      style={{
        background: "rgba(16, 45, 61, 0.96)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(185, 204, 190, 0.22)",
        borderRadius: "10px",
        padding: "12px 16px",
        color: "#F6F1E8",
        boxShadow: "0 10px 25px -5px rgba(16, 45, 61, 0.5)",
        fontSize: "12.5px",
        minWidth: "260px",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      <div
        style={{
          borderBottom: "1px solid rgba(185, 204, 190, 0.2)",
          paddingBottom: "6px",
          marginBottom: "8px",
          fontWeight: 700,
          color: "#F6F1E8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{isEn ? `Month: ${data.month}` : `Tháng: ${data.month}`}</span>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: data.phase === "RETIREMENT" ? "rgba(217, 168, 94, 0.25)" : "rgba(111, 155, 124, 0.25)",
            color: data.phase === "RETIREMENT" ? "#E2B874" : "#B9CCBE",
          }}
        >
          {data.phase === "RETIREMENT"
            ? (isEn ? "Retirement Phase" : "Giai đoạn hưu trí")
            : (isEn ? "Accumulation Phase" : "Giai đoạn tích lũy")}
        </span>
      </div>

      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#C1E8FF", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#052659", border: "1px solid #7DA0CA", display: "inline-block" }} />
            {isEn ? "Projected Balance:" : "Số dư dự phóng:"}
          </span>
          <strong style={{ color: data.closingBalance < 0 ? "#A14D47" : "#FFFFFF" }}>
            {formatFullVND(data.closingBalance, isEn)}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#7096D1", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#334DAF", display: "inline-block" }} />
            {isEn ? "Minimum Required Capital:" : "Vốn yêu cầu tối thiểu:"}
          </span>
          <strong style={{ color: "#FFFFFF" }}>{formatFullVND(data.requiredClosingBalance, isEn)}</strong>
        </div>

        {data.unfundedWithdrawal > 0 && (
          <div
            style={{
              marginTop: "4px",
              paddingTop: "6px",
              borderTop: "1px dashed rgba(161, 77, 71, 0.4)",
              display: "flex",
              justifyContent: "space-between",
              color: "#C5726B",
              fontWeight: 600,
            }}
          >
            <span>{isEn ? "Shortfall this month:" : "Thiếu hụt tháng này:"}</span>
            <span>{formatFullVND(data.unfundedWithdrawal, isEn)}</span>
          </div>
        )}

        <div
          style={{
            marginTop: "6px",
            paddingTop: "6px",
            borderTop: "1px solid rgba(185, 204, 190, 0.15)",
            display: "grid",
            gap: "3px",
            fontSize: "11px",
            color: "#B9CCBE",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{isEn ? "Fund Contribution:" : "Đóng góp vào quỹ:"}</span>
            <span>{formatFullVND(data.contribution, isEn)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{isEn ? "Living Withdrawal:" : "Rút chi tiêu từ quỹ:"}</span>
            <span>{formatFullVND(data.withdrawal, isEn)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export function MonthlyRetirementChart({ rows, summary }: MonthlyRetirementChartProps) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [filterMode, setFilterMode] = useState<ChartFilterMode>("annual");

  const chartData = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    let filtered = rows;

    if (filterMode === "first-5y") {
      filtered = rows.slice(0, Math.min(60, rows.length));
    } else if (filterMode === "retirement-phase") {
      filtered = rows.filter((r) => r.phase === "RETIREMENT");
    } else if (filterMode === "annual" && rows.length > 36) {
      filtered = rows.filter((r, idx) => {
        const isYearEnd = r.month.endsWith("-12");
        const isRetirement = r.month === summary.retirementMonth;
        const isStart = idx === 0;
        const isEnd = idx === rows.length - 1;
        return isYearEnd || isRetirement || isStart || isEnd;
      });
    }

    return filtered.map((r) => ({
      month: r.month,
      phase: r.phase,
      closingBalance: parseFloat(r.closingBalance),
      requiredClosingBalance: parseFloat(r.requiredClosingBalance),
      fundedClosingBalance: parseFloat(r.fundedClosingBalance),
      unfundedWithdrawal: parseFloat(r.unfundedWithdrawal),
      contribution: parseFloat(r.contribution),
      withdrawal: parseFloat(r.withdrawal),
    }));
  }, [rows, summary.retirementMonth, filterMode]);

  const hasNegativeBalance = useMemo(() => {
    return chartData.some((d) => d.closingBalance < 0);
  }, [chartData]);

  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-muted)" }}>
        {isEn ? "No cashflow projection data available." : "Chưa có dữ liệu dòng tiền dự phóng."}
      </div>
    );
  }

  return (
    <div className="monthly-retirement-chart-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {isEn ? "ACCUMULATION FUND AND REQUIRED CAPITAL OVER TIME" : "QUỸ TÍCH LŨY VÀ VỐN YÊU CẦU THEO THÁNG"}
          </span>
          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--color-text-subtle)" }}>
            {isEn
              ? "The actual balance curve accurately reflects cashflow dynamics, retaining negative values during deficits."
              : "Đường số dư thực tế phản ánh chính xác dòng tiền và giữ nguyên giá trị âm khi thiếu hụt."}
          </p>
        </div>

        <div className="chart-period">
          <button
            type="button"
            className={filterMode === "annual" ? "is-active" : ""}
            onClick={() => setFilterMode("annual")}
          >
            {isEn ? "Annual" : "Mốc năm"}
          </button>
          <button
            type="button"
            className={filterMode === "first-5y" ? "is-active" : ""}
            onClick={() => setFilterMode("first-5y")}
          >
            {isEn ? "First 5 Years" : "5 năm đầu"}
          </button>
          <button
            type="button"
            className={filterMode === "retirement-phase" ? "is-active" : ""}
            onClick={() => setFilterMode("retirement-phase")}
          >
            {isEn ? "Retirement Phase" : "Giai đoạn hưu"}
          </button>
          <button
            type="button"
            className={filterMode === "all-months" ? "is-active" : ""}
            onClick={() => setFilterMode("all-months")}
          >
            {isEn ? "All Months" : "Tất cả tháng"}
          </button>
        </div>
      </div>

      <div style={{ width: "100%", height: 380 }} tabIndex={0} role="region" aria-label={isEn ? "Monthly retirement cashflow chart" : "Biểu đồ dòng tiền hưu trí theo tháng"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 16, bottom: 8 }}>
            <defs>
              <linearGradient id="balanceGradSafe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#052659" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#052659" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="balanceGradWarning" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A14D47" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#A14D47" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="requiredFundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#334DAF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#334DAF" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(216, 226, 217, 0.25)" vertical={false} />

            <XAxis
              dataKey="month"
              stroke="#586B61"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(216, 226, 217, 0.4)" }}
              minTickGap={28}
            />

            <YAxis
              stroke="#586B61"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(216, 226, 217, 0.4)" }}
              tickFormatter={(v) => formatVNDAxis(v, isEn)}
              width={72}
            />

            <Tooltip content={<CustomTooltip isEn={isEn} />} />

            {/* Zero threshold line when balance can be negative */}
            {hasNegativeBalance && (
              <ReferenceLine
                y={0}
                stroke="#A14D47"
                strokeDasharray="3 3"
                label={{
                  value: isEn ? "Deficit Threshold (0 ₫)" : "Ngưỡng thâm hụt (0 ₫)",
                  fill: "#A14D47",
                  fontSize: 11,
                }}
              />
            )}

            {/* Reference Line for Retirement Month */}
            <ReferenceLine
              x={summary.retirementMonth}
              stroke="#D9A85E"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: isEn ? `Retirement Month (${summary.retirementMonth})` : `Tháng hưu (${summary.retirementMonth})`,
                fill: "#D9A85E",
                fontSize: 11,
                position: "insideTopLeft",
              }}
            />

            {/* Required Fund Area / Line */}
            <Area
              type="monotone"
              dataKey="requiredClosingBalance"
              stroke="#334DAF"
              strokeWidth={2}
              fill="url(#requiredFundGrad)"
              name={isEn ? "Minimum Capital Required" : "Vốn yêu cầu tối thiểu"}
            />

            {/* Projected Fund Closing Balance Area */}
            <Area
              type="monotone"
              dataKey="closingBalance"
              stroke="#052659"
              strokeWidth={2.5}
              fill={hasNegativeBalance ? "url(#balanceGradWarning)" : "url(#balanceGradSafe)"}
              name={isEn ? "Projected Fund Balance" : "Số dư quỹ dự phóng"}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginTop: "12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 10, height: 10, borderRadius: "2px", background: "#052659" }} />
            {isEn ? "Projected Fund Balance (closingBalance)" : "Số dư quỹ dự phóng (closingBalance)"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 10, height: 10, borderRadius: "2px", background: "#334DAF" }} />
            {isEn ? "Minimum Required Capital (requiredClosingBalance)" : "Vốn yêu cầu tối thiểu (requiredClosingBalance)"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 12, height: 2, background: "#5483B3" }} />
            {isEn ? "Retirement Milestone" : "Mốc bắt đầu nghỉ hưu"}
          </span>
        </div>

        <div>
          {isEn ? (
            <>
              Total Periods: <strong>{rows.length} months</strong> ({summary.accumulationMonths} accumulation months, {summary.retirementMonths} retirement months)
            </>
          ) : (
            <>
              Tổng số kỳ: <strong>{rows.length} tháng</strong> ({summary.accumulationMonths} tháng tích lũy, {summary.retirementMonths} tháng hưu)
            </>
          )}
        </div>
      </div>
    </div>
  );
}
