// Formatting helpers shared by the what-if page and the lazily loaded actuals tab.
export const formatVND = (num: number) => {
  const rounded = Math.round(num);
  const isNeg = rounded < 0;
  return `${isNeg ? "-" : ""}${Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
};

export function formatVNDText(amount: number, language: "vi" | "en" = "vi"): string {
  if (amount === 0) return "0 VND";
  if (amount < 0) return `-${formatVNDText(-amount, language)}`;
  if (amount >= 1_000_000_000) {
    const ty = amount / 1_000_000_000;
    const formatted = ty % 1 === 0 ? ty.toString() : ty.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${formatted} ${language === "en" ? "billion" : "tỷ"} VND`;
  }
  if (amount >= 1_000_000) {
    const trieu = amount / 1_000_000;
    const formatted = trieu % 1 === 0 ? trieu.toString() : trieu.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${formatted} ${language === "en" ? "million" : "triệu"} VND`;
  }
  if (amount >= 1_000) {
    const nghin = amount / 1_000;
    const formatted = nghin % 1 === 0 ? nghin.toString() : nghin.toFixed(0);
    return `${formatted} ${language === "en" ? "thousand" : "nghìn"} VND`;
  }
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
}

// Vietnam current month string YYYY-MM
export const getVietnamCurrentMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
