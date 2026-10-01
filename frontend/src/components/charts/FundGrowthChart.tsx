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
import { calculateRetirement, inputFromProfile } from "../../domain/retirementCalculator";

interface FundGrowthChartProps {
  view: "milestone" | "annual";
  profile: FinancialProfile;
}

const formatVND = (value: number) => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)} tỷ`;
  }
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)} tr`;
  }
  return `${value.toLocaleString("vi-VN")} đ`;
};

const formatFullVND = (value: number) => {
  return `${value.toLocaleString("vi-VN")} đ`;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

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
            Mục tiêu cần có:
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.target)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#93C5FD", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6", display: "inline-block" }} />
            Tài sản dự phóng:
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.current)}</strong>
        </div>

        <div
          style={{
            marginTop: "4px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "space-between",
            color: "#FCA5A5",
            fontWeight: 600,
          }}
        >
          <span>Thiếu hụt:</span>
          <span>{formatFullVND(Math.max(0, data.target - data.current))}</span>
        </div>
      </div>
    </div>
  );
};

export function FundGrowthChart({ view, profile }: FundGrowthChartProps) {
  const chartData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const input = inputFromProfile(profile);
    const final = calculateRetirement(input);
    const years = final.yearsToRetirement;
    const desiredPoints = view === "annual" ? Math.min(years + 1, 30) : Math.min(8, years + 1);
    return Array.from({ length: desiredPoints }, (_, index) => {
      const elapsed = desiredPoints === 1 ? 0 : Math.round(index * years / (desiredPoints - 1));
      const age = profile.personal.age + elapsed;
      const partial = elapsed === 0
        ? final.investableAssetsToday
        : calculateRetirement({ ...input, retirementAge: age }).projectedFund;
      const progress = years === 0 ? 1 : elapsed / years;
      const target = final.investableAssetsToday + (final.targetFund - final.investableAssetsToday) * Math.pow(progress, 1.35);
      return {
        age,
        year: currentYear + elapsed,
        label: view === "annual" ? `${currentYear + elapsed}` : `${age}t (${currentYear + elapsed})`,
        current: index === desiredPoints - 1 ? final.projectedFund : Math.round(partial),
        target: index === desiredPoints - 1 ? final.targetFund : Math.round(target),
      };
    });
  }, [view, profile]);

  return (
    <div style={{ width: "100%", height: 320, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="fundTargetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6F9B7C" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6F9B7C" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="fundCurrentGrad" x1="0" y1="0" x2="0" y2="1">
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

          <ReferenceLine
            x={chartData.at(-1)?.label}
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

          <Area
            type="monotone"
            dataKey="target"
            name="Mục tiêu tối thiểu"
            stroke="#6F9B7C"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#fundTargetGrad)"
          />

          <Area
            type="monotone"
            dataKey="current"
            name="Tiến độ hiện tại"
            stroke="#153A52"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#fundCurrentGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
