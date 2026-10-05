import { useMemo } from "react";
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
import type { FinancialProfile } from "../../context/FinancialProfileContext";
import { inputFromProfile, projectBalanceAtAge } from "../../domain/retirementCalculator";
import { useI18n } from "../../i18n";

export type ChartPeriod = "5y" | "10y" | "retire" | "lifetime";

interface DataPoint {
  year: number;
  age: number;
  label: string;
  projected: number;
  target: number;
  gap: number;
}

const generateData = (period: ChartPeriod, profile: FinancialProfile, isVi: boolean): DataPoint[] => {
  const currentAge = profile.personal.age;
  const currentYear = new Date().getFullYear();
  let totalYears = Math.max(1, profile.goal.targetRetireAge - currentAge);
  if (period === "5y") totalYears = 5;
  else if (period === "10y") totalYears = 10;
  else if (period === "lifetime") totalYears = Math.max(1, profile.goal.lifeExpectancy - currentAge);
  totalYears = Math.min(totalYears, profile.goal.lifeExpectancy - currentAge);

  const pointsCount = period === "5y" ? 6 : period === "10y" ? 11 : 15;
  const step = totalYears / (pointsCount - 1);

  const data: DataPoint[] = [];

  for (let i = 0; i < pointsCount; i++) {
    const elapsedYears = i * step;
    const year = Math.round(currentYear + elapsedYears);
    const age = Math.round(currentAge + elapsedYears);

    const input = inputFromProfile(profile);
    const projected = projectBalanceAtAge(input, age, false);
    const target = projectBalanceAtAge(input, age, true);

    const gap = target - projected;

    data.push({
      year,
      age,
      label: isVi ? `${year} (${age}t)` : `${year} (${age}y)`,
      projected: Math.round(projected),
      target: Math.round(target),
      gap: Math.round(gap),
    });
  }

  return data;
};

const formatVND = (value: number, isVi: boolean) => {
  if (value >= 1_000_000_000) {
    return isVi ? `${(value / 1_000_000_000).toFixed(2)} tỷ` : `${(value / 1_000_000_000).toFixed(2)}B ₫`;
  }
  if (value >= 1_000_000) {
    return isVi ? `${Math.round(value / 1_000_000)} tr` : `${Math.round(value / 1_000_000)}M ₫`;
  }
  return `${value.toLocaleString(isVi ? "vi-VN" : "en-US")} ₫`;
};

const formatFullVND = (value: number, isVi: boolean) => {
  return `${value.toLocaleString(isVi ? "vi-VN" : "en-US")} ₫`;
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  isVi: boolean;
}

const CustomTooltip = ({ active, payload, isVi }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  const data: DataPoint = payload[0].payload;
  const gapPositive = data.gap > 0;

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
        minWidth: "220px",
        pointerEvents: "none",
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
        }}
      >
        <span>{isVi ? `Năm ${data.year}` : `Year ${data.year}`}</span>
        <span style={{ color: "#6F9B7C" }}>{isVi ? `${data.age} tuổi` : `${data.age} yrs`}</span>
      </div>

      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#7096D1", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#334DAF", display: "inline-block" }} />
            {isVi ? "Mục tiêu cần đạt:" : "Target required:"}
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.target, isVi)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#C1E8FF", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#052659", border: "1px solid #7DA0CA", display: "inline-block" }} />
            {isVi ? "Dự phóng hiện tại:" : "Current projection:"}
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.projected, isVi)}</strong>
        </div>

        <div
          style={{
            marginTop: "4px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(208, 228, 254, 0.4)",
            display: "flex",
            justifyContent: "space-between",
            color: gapPositive ? "var(--color-danger, #A14D47)" : "var(--color-secondary-500, #334DAF)",
            fontWeight: 600,
          }}
        >
          <span>{gapPositive ? (isVi ? "Khoảng thiếu hụt:" : "Projected shortfall:") : (isVi ? "Thặng dư tích lũy:" : "Accumulated surplus:")}</span>
          <span>{formatFullVND(Math.abs(data.gap), isVi)}</span>
        </div>
      </div>
    </div>
  );
};

export function ProjectionWealthChart({ period, profile }: { period: ChartPeriod; profile: FinancialProfile }) {
  const { language } = useI18n();
  const isVi = language === "vi";
  const chartData = useMemo(() => generateData(period, profile, isVi), [period, profile, isVi]);

  return (
    <div style={{ width: "100%", height: 320, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="anHuuTargetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#334DAF" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#334DAF" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="anHuuProjectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#052659" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#052659" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(5, 38, 89, 0.08)"
          />

          <XAxis
            dataKey="label"
            stroke="#7B8F9D"
            fontSize={11.5}
            tickLine={false}
            axisLine={{ stroke: "rgba(21, 58, 82, 0.15)" }}
          />

          <YAxis
            stroke="#7B8F9D"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatVND(v, isVi)}
            domain={[0, "auto"]}
          />

          <Tooltip content={<CustomTooltip isVi={isVi} />} />

          {/* Reference line for retirement milestone if in view */}
          {period !== "5y" && period !== "10y" && (
            <ReferenceLine
              x={chartData.find((d) => d.age === profile.goal.targetRetireAge)?.label}
              stroke="#D9A85E"
              strokeDasharray="4 4"
              label={{
                value: isVi ? `Nghỉ hưu (${profile.goal.targetRetireAge}t)` : `Retirement (${profile.goal.targetRetireAge}y)`,
                position: "top",
                fill: "#B88738",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="target"
            name={isVi ? "Mục tiêu tối thiểu" : "Minimum Target"}
            stroke="#334DAF"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#anHuuTargetGrad)"
          />

          <Area
            type="monotone"
            dataKey="projected"
            name={isVi ? "Dự phóng hiện tại" : "Current Projection"}
            stroke="#052659"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#anHuuProjectedGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
