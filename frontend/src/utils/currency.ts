export function formatCompactVND(value: number, isVietnamese: boolean, billionFractionDigits = 1): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) {
    const compact = (value / 1_000_000_000).toFixed(billionFractionDigits);
    return isVietnamese ? `${compact} tỷ` : `${compact}B ₫`;
  }
  if (magnitude >= 1_000_000) {
    const compact = Math.round(value / 1_000_000);
    return isVietnamese ? `${compact} tr` : `${compact}M ₫`;
  }
  return `${value.toLocaleString(isVietnamese ? "vi-VN" : "en-US")} ₫`;
}

export function formatFullVND(value: number, isVietnamese: boolean): string {
  return `${Math.round(value).toLocaleString(isVietnamese ? "vi-VN" : "en-US")} ₫`;
}
