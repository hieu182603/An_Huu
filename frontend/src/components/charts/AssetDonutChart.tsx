import type { AssetProfile } from "../../context/FinancialProfileContext";
import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "../../i18n";

interface AssetSlice {
  name: string;
  value: number;
  color: string;
  percent: number;
}

const CustomTooltip = ({ active, payload, isVi }: any) => {
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
        {data.value.toLocaleString(isVi ? "vi-VN" : "en-US")} ₫ ({data.percent}%)
      </div>
    </div>
  );
};

export function AssetDonutChart({ assets }: { assets: AssetProfile }) {
  const { language } = useI18n();
  const isVi = language === "vi";
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const totalValue = Object.values(assets).reduce((sum, value) => sum + value, 0);
  const assetData: AssetSlice[] = [
    { name: isVi ? "Bất động sản" : "Real Estate", value: assets.realEstateValue, color: "#052659", percent: 0 },
    { name: isVi ? "Cổ phiếu & Quỹ" : "Stocks & Funds", value: assets.stockFundValue, color: "#334DAF", percent: 0 },
    { name: isVi ? "Tiền tiết kiệm" : "Savings & Cash", value: assets.cashSavings, color: "#5483B3", percent: 0 },
    { name: isVi ? "Thanh khoản khác" : "Other Liquid", value: assets.liquidAssets, color: "#7DA0CA", percent: 0 },
  ].filter(item => item.value > 0).map(item => ({ ...item, percent: Math.round(item.value / totalValue * 100) }));

  if (!totalValue) return <p>{isVi ? "Chưa có tài sản được khai báo." : "No assets declared yet."}</p>;

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
          <Tooltip content={<CustomTooltip isVi={isVi} />} />
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
          {isVi ? "Tổng tài sản" : "Total Assets"}
        </span>
        <strong style={{ fontSize: "14px", color: "var(--color-primary-700, #052659)", fontWeight: 800, display: "block", marginTop: "1px" }}>
          {new Intl.NumberFormat(isVi ? "vi-VN" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(totalValue)} ₫
        </strong>
      </div>
    </div>
  );
}
