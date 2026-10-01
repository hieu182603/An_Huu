import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface AssetSlice {
  name: string;
  value: number;
  color: string;
  percent: number;
}

const assetData: AssetSlice[] = [
  { name: "Bất động sản nhà ở", value: 2_400_000_000, color: "#153A52", percent: 65 },
  { name: "Cổ phiếu & Quỹ đầu tư", value: 570_000_000, color: "#D9A85E", percent: 15 },
  { name: "Tiền gửi tiết kiệm", value: 450_000_000, color: "#6F9B7C", percent: 12 },
  { name: "Tài sản thanh khoản khác", value: 300_000_000, color: "#556B7A", percent: 8 },
];

const totalValue = assetData.reduce((acc, curr) => acc + curr.value, 0);

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data: AssetSlice = payload[0].payload;

  return (
    <div
      style={{
        background: "rgba(15, 38, 54, 0.95)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "8px",
        padding: "8px 12px",
        color: "#ffffff",
        fontSize: "12px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: data.color }} />
        <span style={{ fontWeight: 600 }}>{data.name}</span>
      </div>
      <div style={{ color: "#E2E8F0" }}>
        {data.value.toLocaleString("vi-VN")} đ ({data.percent}%)
      </div>
    </div>
  );
};

export function AssetDonutChart() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div style={{ width: "100%", height: 180, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={assetData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={3}
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {assetData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                stroke="transparent"
                style={{
                  transition: "all 0.3s ease",
                  transform: activeIndex === index ? "scale(1.04)" : "scale(1)",
                  transformOrigin: "center center",
                  cursor: "pointer",
                }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center Label */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: "10px", color: "#7B8F9D", textTransform: "uppercase", letterSpacing: "0.5px", display: "block" }}>
          Tổng tài sản
        </span>
        <strong style={{ fontSize: "14px", color: "#153A52", fontWeight: 800, display: "block", marginTop: "1px" }}>
          3.72 tỷ
        </strong>
      </div>
    </div>
  );
}
