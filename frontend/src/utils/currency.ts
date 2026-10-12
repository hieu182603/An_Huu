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

export function formatNumberWithDots(value: number | string): string {
  if (value === "" || value === null || value === undefined) return "";
  const clean = typeof value === "number" ? Math.floor(Math.abs(value)) : Math.floor(Math.abs(Number(String(value).replace(/\D/g, "")) || 0));
  return new Intl.NumberFormat("vi-VN").format(clean);
}

export function formatVND(value: number, suffix = "VND"): string {
  const clean = Math.max(0, Math.floor(value || 0));
  return `${new Intl.NumberFormat("vi-VN").format(clean)} ${suffix}`;
}

const VIETNAMESE_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readGroupOfThree(threeDigits: number, hasHigherGroup: boolean): string {
  const hundreds = Math.floor(threeDigits / 100);
  const remainder = threeDigits % 100;
  const tens = Math.floor(remainder / 10);
  const units = remainder % 10;
  const words: string[] = [];

  if (hundreds > 0 || hasHigherGroup) {
    words.push(`${VIETNAMESE_DIGITS[hundreds]} trăm`);
  }

  if (tens > 1) {
    words.push(`${VIETNAMESE_DIGITS[tens]} mươi`);
    if (units === 1) words.push("mốt");
    else if (units === 5) words.push("lăm");
    else if (units > 0) words.push(VIETNAMESE_DIGITS[units]);
  } else if (tens === 1) {
    words.push("mười");
    if (units === 5) words.push("lăm");
    else if (units > 0) words.push(VIETNAMESE_DIGITS[units]);
  } else if (units > 0) {
    if (hundreds > 0 || hasHigherGroup) words.push("lẻ");
    words.push(VIETNAMESE_DIGITS[units]);
  }

  return words.join(" ");
}

/**
 * Đọc số tiền thành chữ tiếng Việt chuẩn (dùng cho ngân hàng & tài chính)
 * Ví dụ: 30000000 -> "Ba mươi triệu VND"
 */
export function numberToVietnameseWords(amount: number, suffix = "VND"): string {
  if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) return "";
  const num = Math.floor(amount);
  if (num === 0) return "";

  const scales = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const groups: number[] = [];
  let temp = num;
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const resultParts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const groupVal = groups[i];
    if (groupVal > 0) {
      const hasHigher = i < groups.length - 1;
      const groupText = readGroupOfThree(groupVal, hasHigher);
      if (groupText) {
        resultParts.push(groupText);
        if (scales[i]) resultParts.push(scales[i]);
      }
    }
  }

  const rawText = resultParts.join(" ").replace(/\s+/g, " ").trim();
  if (!rawText) return "";
  const capitalized = rawText.charAt(0).toUpperCase() + rawText.slice(1);
  return `${capitalized} ${suffix}`;
}
