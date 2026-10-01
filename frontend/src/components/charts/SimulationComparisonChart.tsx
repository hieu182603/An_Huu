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

interface SimulationComparisonChartProps {
  currentAge?: number;
  simRetireAge: number;
  baseProjectedFund: number;
  simProjectedFund: number;
  simFundTarget: number;
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
        minWidth: "230px",
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
            Mô phỏng mới:
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.simulated)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#94A3B8", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#64748B", display: "inline-block" }} />
            Kế hoạch gốc:
          </span>
          <strong style={{ color: "#CBD5E1" }}>{formatFullVND(data.base)}</strong>
        </div>

        <div
          style={{
            marginTop: "4px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "space-between",
            color: data.simulated >= data.base ? "#86EFAC" : "#FCA5A5",
            fontWeight: 600,
          }}
        >
          <span>Chênh lệch:</span>
          <span>
            {data.simulated >= data.base ? "+" : ""}
            {formatFullVND(data.simulated - data.base)}
          </span>
        </div>
      </div>
    </div>
  );
};

export function SimulationComparisonChart({
  currentAge = 32,
  simRetireAge,
  baseProjectedFund,
  simProjectedFund,
  simFundTarget,
}: SimulationComparisonChartProps) {
  const currentYear = 2025;
  const maxAge = 75;

  const chartData = useMemo(() => {
    const points: any[] = [];
    const ages = [32, 36, 40, 45, 50, 55, simRetireAge, 65, 75].filter(
      (v, i, a) => a.indexOf(v) === i
    ).sort((a, b) => a - b);

    const startAmount = 850_000_000;

    ages.forEach((age) => {
      const year = currentYear + (age - currentAge);
      const progress = (age - currentAge) / (60 - currentAge);
      const simProgress = (age - currentAge) / (simRetireAge - currentAge);

      let baseVal = 0;
      if (age <= 60) {
        baseVal = startAmount + (baseProjectedFund - startAmount) * Math.pow(Math.max(0, progress), 1.6);
      } else {
        baseVal = Math.max(0, baseProjectedFund - (age - 60) * 280_000_000);
      }

      let simVal = 0;
      if (age <= simRetireAge) {
        simVal = startAmount + (simProjectedFund - startAmount) * Math.pow(Math.max(0, simProgress), 1.5);
      } else {
        simVal = Math.max(0, simProjectedFund - (age - simRetireAge) * 320_000_000);
      }

      points.push({
        age,
        year,
        label: `${age}t (${year})`,
        base: Math.round(baseVal),
        simulated: Math.round(simVal),
      });
    });

    return points;
  }, [currentAge, simRetireAge, baseProjectedFund, simProjectedFund]);

  return (
    <div style={{ width: "100%", height: 320, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="simulatedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6F9B7C" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#6F9B7C" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#64748B" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#64748B" stopOpacity={0.0} />
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

          {/* Reference Line for Target */}
          <ReferenceLine
            y={simFundTarget}
            stroke="#D9A85E"
            strokeDasharray="4 4"
            label={{
              value: `Mục tiêu (${formatVND(simFundTarget)})`,
              position: "top",
              fill: "#B88738",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          {/* Reference Line for Simulated Retirement Age */}
          <ReferenceLine
            x={`${simRetireAge}t (${currentYear + (simRetireAge - currentAge)})`}
            stroke="#6F9B7C"
            strokeDasharray="3 3"
            label={{
              value: `Hưu (${simRetireAge}t)`,
              position: "insideTopLeft",
              fill: "#2E6B56",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          <Area
            type="monotone"
            dataKey="base"
            name="Kế hoạch gốc"
            stroke="#64748B"
            strokeWidth={2}
            strokeDasharray="4 4"
            fillOpacity={1}
            fill="url(#baseGrad)"
          />

          <Area
            type="monotone"
            dataKey="simulated"
            name="Mô phỏng mới"
            stroke="#6F9B7C"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#simulatedGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
