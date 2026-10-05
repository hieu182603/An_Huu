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
import { projectBalanceAtAge, type RetirementCalculationInput } from "../../domain/retirementCalculator";
import { useI18n } from "../../i18n";

interface SimulationComparisonChartProps {
  baseInput: RetirementCalculationInput;
  scenarioInput: RetirementCalculationInput;
  simFundTarget: number;
}

const formatVND = (value: number, isVi: boolean) => {
  if (value >= 1_000_000_000) {
    return isVi ? `${(value / 1_000_000_000).toFixed(1)} tỷ` : `${(value / 1_000_000_000).toFixed(1)}B ₫`;
  }
  if (value >= 1_000_000) {
    return isVi ? `${Math.round(value / 1_000_000)} tr` : `${Math.round(value / 1_000_000)}M ₫`;
  }
  return `${value.toLocaleString(isVi ? "vi-VN" : "en-US")} ₫`;
};

const formatFullVND = (value: number, isVi: boolean) => {
  return `${value.toLocaleString(isVi ? "vi-VN" : "en-US")} ₫`;
};

const CustomTooltip = ({ active, payload, isVi }: any) => {
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
        minWidth: "230px",
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
            {isVi ? "Mô phỏng mới:" : "New simulation:"}
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.simulated, isVi)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#C1E8FF", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#052659", border: "1px solid #7DA0CA", display: "inline-block" }} />
            {isVi ? "Kế hoạch gốc:" : "Baseline plan:"}
          </span>
          <strong style={{ color: "#CBD5E1" }}>{formatFullVND(data.base, isVi)}</strong>
        </div>

        <div
          style={{
            marginTop: "4px",
            paddingTop: "6px",
            borderTop: "1px dashed rgba(185, 204, 190, 0.2)",
            display: "flex",
            justifyContent: "space-between",
            color: data.simulated >= data.base ? "var(--color-success, #486D53)" : "var(--color-danger, #A14D47)",
            fontWeight: 600,
          }}
        >
          <span>{isVi ? "Chênh lệch:" : "Difference:"}</span>
          <span>
            {data.simulated >= data.base ? "+" : ""}
            {formatFullVND(data.simulated - data.base, isVi)}
          </span>
        </div>
      </div>
    </div>
  );
};

export function SimulationComparisonChart({
  baseInput,
  scenarioInput,
  simFundTarget,
}: SimulationComparisonChartProps) {
  const { language } = useI18n();
  const isVi = language === "vi";

  const currentAge = baseInput.currentAge;
  const simRetireAge = scenarioInput.retirementAge;
  const currentYear = new Date().getFullYear();

  const chartData = useMemo(() => {
    const endAge = Math.max(baseInput.lifeExpectancy, scenarioInput.lifeExpectancy);
    const span = Math.max(1, endAge - currentAge);
    const ages = Array.from({ length: 9 }, (_, index) =>
      Math.round(currentAge + (span * index) / 8),
    ).concat(baseInput.retirementAge, simRetireAge, endAge)
      .filter((age, index, values) => age >= currentAge && values.indexOf(age) === index)
      .sort((a, b) => a - b);

    return ages.map((age) => {
      const year = currentYear + (age - currentAge);
      return {
        age,
        year,
        label: isVi ? `${age}t (${year})` : `${age}y (${year})`,
        base: projectBalanceAtAge(baseInput, Math.min(age, baseInput.lifeExpectancy)),
        simulated: projectBalanceAtAge(scenarioInput, Math.min(age, scenarioInput.lifeExpectancy)),
      };
    });
  }, [baseInput, scenarioInput, currentAge, simRetireAge, currentYear, isVi]);

  return (
    <div style={{ width: "100%", height: 320, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="simulatedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-secondary)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--chart-secondary)" stopOpacity={0.0} />
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
            tickFormatter={(v) => formatVND(v, isVi)}
            domain={[0, "auto"]}
          />

          <Tooltip content={<CustomTooltip isVi={isVi} />} />

          {/* Reference Line for Target */}
          <ReferenceLine
            y={simFundTarget}
            stroke="var(--color-secondary-500, #334DAF)"
            strokeDasharray="4 4"
            label={{
              value: isVi ? `Mục tiêu (${formatVND(simFundTarget, isVi)})` : `Target (${formatVND(simFundTarget, isVi)})`,
              position: "top",
              fill: "#334DAF",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          {/* Reference Line for Simulated Retirement Age */}
          <ReferenceLine
            x={isVi ? `${simRetireAge}t (${currentYear + (simRetireAge - currentAge)})` : `${simRetireAge}y (${currentYear + (simRetireAge - currentAge)})`}
            stroke="var(--chart-secondary)"
            strokeDasharray="3 3"
            label={{
              value: isVi ? `Hưu (${simRetireAge}t)` : `Retire (${simRetireAge}y)`,
              position: "insideTopLeft",
              fill: "#052659",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          <Area
            type="monotone"
            dataKey="base"
            name={isVi ? "Kế hoạch gốc" : "Baseline Plan"}
            stroke="var(--color-text-muted)"
            strokeWidth={2}
            strokeDasharray="4 4"
            fillOpacity={1}
            fill="url(#baseGrad)"
          />

          <Area
            type="monotone"
            dataKey="simulated"
            name={isVi ? "Mô phỏng mới" : "New Simulation"}
            stroke="var(--chart-secondary)"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#simulatedGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
