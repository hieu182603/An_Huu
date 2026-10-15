import type { GlidePathPoint } from "../services/portfolios";

const monthNumber = (month: string | undefined): number | null => {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
};

// Match the engine's whole-year boundaries; missing dates are not year zero.
export function portfolioGlideYears(points: GlidePathPoint[], month: string, retirementMonth?: string): number | null {
  const start = monthNumber(month), anchor = monthNumber(retirementMonth);
  if (start === null || anchor === null || points.length === 0) return null;
  return Math.min(Math.max(...points.map(p => p.yearsToAnchor)), Math.max(0, Math.floor((anchor - start) / 12)));
}

// Display only. Preview calculations and exact decimal rounding remain server-side.
export function portfolioGlideWeights(points: GlidePathPoint[], years: number): GlidePathPoint["allocations"] {
  const sorted = [...points].sort((a, b) => a.yearsToAnchor - b.yearsToAnchor);
  if (!sorted.length) return [];
  const hi = sorted.find(p => p.yearsToAnchor >= years) ?? sorted[sorted.length - 1];
  const lo = [...sorted].reverse().find(p => p.yearsToAnchor <= years) ?? sorted[0];
  const share = hi.yearsToAnchor === lo.yearsToAnchor ? 0 : (years - lo.yearsToAnchor) / (hi.yearsToAnchor - lo.yearsToAnchor);
  const codes = [...new Set(points.flatMap(p => p.allocations.map(a => a.assetClass)))];
  const weight = (point: GlidePathPoint, code: string) => Number(point.allocations.find(a => a.assetClass === code)?.weightPercent ?? "0");
  return codes.map(assetClass => ({ assetClass, weightPercent: String(weight(lo, assetClass) + (weight(hi, assetClass) - weight(lo, assetClass)) * share) }));
}

export function portfolioAssetLabel(code: string, language: "vi" | "en", labels: Record<string, string>): string {
  const translations: Record<string, [string, string]> = {
    CASH: ["Tiền gửi & thanh khoản", "Deposits & cash"],
    GOV_BOND: ["Trái phiếu Chính phủ", "Government bonds"],
    EQUITY: ["Cổ phiếu đa dạng hóa", "Diversified equities"],
    GOLD: ["Vàng", "Gold"],
    BOND: ["Trái phiếu", "Bonds"],
    STOCK: ["Cổ phiếu", "Equities"],
    BALANCED: ["Quỹ cân bằng", "Balanced funds"],
    REAL_ESTATE: ["Bất động sản", "Real estate"],
  };
  return language === "vi"
    ? labels[code] || translations[code]?.[0] || code
    : translations[code]?.[1] || labels[code] || code;
}
