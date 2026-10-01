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

export type ChartPeriod = "5y" | "10y" | "retire" | "lifetime";

interface DataPoint {
  year: number;
  age: number;
  label: string;
  projected: number;
  target: number;
  gap: number;
}

const generateData = (period: ChartPeriod, profile: FinancialProfile): DataPoint[] => {
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
      label: `${year} (${age}t)`,
      projected: Math.round(projected),
      target: Math.round(target),
      gap: Math.round(gap),
    });
  }

  return data;
};

const formatVND = (value: number) => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)} tỷ`;
  }
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)} tr`;
  }
  return `${value.toLocaleString("vi-VN")} đ`;
};

const formatFullVND = (value: number) => {
  return `${value.toLocaleString("vi-VN")} đ`;
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  const data: DataPoint = payload[0].payload;
  const gapPositive = data.gap > 0;

  return (
    <div
      style={{
        background: "rgba(15, 38, 54, 0.95)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "10px",
        padding: "12px 16px",
        color: "#ffffff",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
        fontSize: "12.5px",
        minWidth: "220px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          paddingBottom: "6px",
          marginBottom: "8px",
          fontWeight: 700,
          color: "#E2E8F0",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Năm {data.year}</span>
        <span style={{ color: "#6F9B7C" }}>{data.age} tuổi</span>
      </div>

      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#6F9B7C", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6F9B7C", display: "inline-block" }} />
            Mục tiêu cần đạt:
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.target)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#93C5FD", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6", display: "inline-block" }} />
            Dự phóng hiện tại:
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.projected)}</strong>
        </div>

        <div
          style={{
            marginTop: "4px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "space-between",
            color: gapPositive ? "#FCA5A5" : "#86EFAC",
            fontWeight: 600,
          }}
        >
          <span>{gapPositive ? "Khoảng thiếu hụt:" : "Thặng dư tích lũy:"}</span>
          <span>{formatFullVND(Math.abs(data.gap))}</span>
        </div>
      </div>
    </div>
  );
};

export function ProjectionWealthChart({ period, profile }: { period: ChartPeriod; profile: FinancialProfile }) {
  const chartData = useMemo(() => generateData(period, profile), [period, profile]);

  return (
    <div style={{ width: "100%", height: 320, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="anHuuTargetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6F9B7C" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#6F9B7C" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="anHuuProjectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#153A52" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#153A52" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(21, 58, 82, 0.08)"
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
            tickFormatter={formatVND}
            domain={[0, "auto"]}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Reference line for Age 60 milestone if in view */}
          {period !== "5y" && period !== "10y" && (
            <ReferenceLine
              x={chartData.find((d) => d.age === profile.goal.targetRetireAge)?.label}
              stroke="#D9A85E"
              strokeDasharray="4 4"
              label={{
                value: `Nghỉ hưu (${profile.goal.targetRetireAge}t)`,
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
            name="Mục tiêu tối thiểu"
            stroke="#6F9B7C"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#anHuuTargetGrad)"
          />

          <Area
            type="monotone"
            dataKey="projected"
            name="Dự phóng hiện tại"
            stroke="#153A52"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#anHuuProjectedGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
