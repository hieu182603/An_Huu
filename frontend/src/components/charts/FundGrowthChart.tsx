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
import { useI18n } from "../../i18n";
import { formatCompactVND, formatFullVND } from "../../utils/currency";

interface FundGrowthChartProps {
  view: "milestone" | "annual";
  profile: FinancialProfile;
}

const CustomTooltip = ({ active, payload, isVi }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  return (
    <div
      style={{
        background: "rgba(5, 38, 89, 0.95)",
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
          borderBottom: "1px solid rgba(208, 228, 254, 0.25)",
          paddingBottom: "6px",
          marginBottom: "8px",
          fontWeight: 700,
          color: "#F9FBFF",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{isVi ? `Năm ${data.year}` : `Year ${data.year}`}</span>
        <span style={{ color: "#C1E8FF" }}>{isVi ? `${data.age} tuổi` : `${data.age} yrs`}</span>
      </div>

      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#7096D1", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#334DAF", display: "inline-block" }} />
            {isVi ? "Mục tiêu cần có:" : "Target required:"}
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.target, isVi)}</strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <span style={{ color: "#C1E8FF", display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#052659", border: "1px solid #7DA0CA", display: "inline-block" }} />
            {isVi ? "Tài sản dự phóng:" : "Projected wealth:"}
          </span>
          <strong style={{ color: "#ffffff" }}>{formatFullVND(data.current, isVi)}</strong>
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
          <span>{isVi ? "Thiếu hụt:" : "Shortfall:"}</span>
          <span>{formatFullVND(Math.max(0, data.target - data.current), isVi)}</span>
        </div>
      </div>
    </div>
  );
};

export function FundGrowthChart({ view, profile }: FundGrowthChartProps) {
  const { language } = useI18n();
  const isVi = language === "vi";

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
        label: view === "annual" ? `${currentYear + elapsed}` : (isVi ? `${age}t (${currentYear + elapsed})` : `${age}y (${currentYear + elapsed})`),
        current: index === desiredPoints - 1 ? final.projectedFund : Math.round(partial),
        target: index === desiredPoints - 1 ? final.targetFund : Math.round(target),
      };
    });
  }, [view, profile, isVi]);

  return (
    <div style={{ width: "100%", height: 320, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="fundTargetGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#334DAF" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#334DAF" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="fundCurrentGrad" x1="0" y1="0" x2="0" y2="1">
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
            axisLine={{ stroke: "rgba(5, 38, 89, 0.15)" }}
          />

          <YAxis
            stroke="#7B8F9D"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatCompactVND(v, isVi)}
            domain={[0, "auto"]}
          />

          <Tooltip content={<CustomTooltip isVi={isVi} />} />

          <ReferenceLine
            x={chartData.at(-1)?.label}
            stroke="#334DAF"
            strokeDasharray="4 4"
            label={{
              value: isVi ? `Nghỉ hưu (${profile.goal.targetRetireAge}t)` : `Retirement (${profile.goal.targetRetireAge}y)`,
              position: "top",
              fill: "#334DAF",
              fontSize: 11,
              fontWeight: 600,
            }}
          />

          <Area
            type="monotone"
            dataKey="target"
            name={isVi ? "Mục tiêu tối thiểu" : "Minimum Target"}
            stroke="#334DAF"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#fundTargetGrad)"
          />

          <Area
            type="monotone"
            dataKey="current"
            name={isVi ? "Tiến độ hiện tại" : "Current Trajectory"}
            stroke="#052659"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#fundCurrentGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
