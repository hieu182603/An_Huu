import { RetirementDecimal as D } from "../retirement/engine";

// Format only the answer. Never round values used by the financial engine.
export function displayDecimal(value: string, places = 0) {
  const [whole, fraction] = new D(value).toFixed(places, D.ROUND_HALF_UP).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fraction ? "," + fraction : "");
}
export function questionTopics(question: string) {
  const text = question.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
  return {
    simulation: /\b(neu|what if|earlier|later)\b|nghi.*som|giam.*chi|tang.*gop/.test(text),
    inflation: /lam phat|inflation|gia tri.*hom nay/.test(text),
    returns: /loi suat|lai suat|return|yield/.test(text),
    coverage: /bao phu|coverage|ty le/.test(text),
    contribution: /gop|tich luy|contribut|saving/.test(text),
    shortfall: /thieu|het tien|shortfall|run out/.test(text),
    products: /san pham|goi |quy mo|quy dau tu|bao hiem|tiet kiem|nen mua|nen chon|nen dau tu|product|fund|insurance/.test(text),
  };
}
type Risk = "LOW" | "MEDIUM" | "HIGH";
const RISK_VI: Record<Risk, string> = { LOW: "rủi ro thấp", MEDIUM: "rủi ro trung bình", HIGH: "rủi ro cao" };
// ponytail: horizon-only suitability (years to desired retirement); use the saved risk survey once it is persisted server-side.
export function suitableRisks(yearsToRetirement: number | null): Risk[] {
  if (yearsToRetirement === null) return ["LOW", "MEDIUM", "HIGH"];
  return yearsToRetirement < 5 ? ["LOW"] : yearsToRetirement <= 15 ? ["LOW", "MEDIUM"] : ["LOW", "MEDIUM", "HIGH"];
}
export function productFactText(products: Array<{ name: string; partner: string; riskLevel: Risk; annualFee: string | null }>, yearsToRetirement: number | null) {
  const allowed = suitableRisks(yearsToRetirement), fit = products.filter(p => allowed.includes(p.riskLevel)).slice(0, 5);
  const basis = yearsToRetirement === null
    ? "Hồ sơ chưa có tháng muốn nghỉ hưu nên chưa lọc theo thời gian đầu tư."
    : `Hồ sơ còn khoảng ${yearsToRetirement} năm tới tháng muốn nghỉ hưu, nên ưu tiên sản phẩm ${allowed.map(r => RISK_VI[r]).join(", ")}.`;
  const list = fit.length ? fit.map(p => `- ${p.name} (${p.partner}, ${RISK_VI[p.riskLevel]}${p.annualFee ? `, phí: ${p.annualFee}` : ""})`).join("\n") : "- Hiện chưa có sản phẩm đang phân phối phù hợp tiêu chí này.";
  return `${basis}\nSản phẩm đối tác đang phân phối trên An Hưu:\n${list}\nĐây là gợi ý lọc theo hồ sơ, không phải khuyến nghị đầu tư cá nhân. Đọc kỹ phí, điều kiện, công bố rủi ro và gửi "Yêu cầu tư vấn" tại trang Khám phá để chuyên viên liên hệ.`;
}
export function fallbackFactKeys(question: string, facts: Array<{ key: string }>) {
  const topics = questionTopics(question);
  const preferred = new Set([
    ...(topics.simulation ? ["simulation"] : []), ...(topics.inflation ? ["inflation"] : []),
    ...(topics.returns ? ["returns"] : []), ...(topics.coverage ? ["coverage", "required"] : []),
    ...(topics.contribution ? ["contribution"] : []), ...(topics.shortfall ? ["shortfall", "required"] : []),
    ...(topics.products ? ["products"] : []),
  ]);
  const matched = facts.filter(f => preferred.has(f.key)).map(f => f.key);
  return matched.length ? matched : facts.slice(0, 6).map(f => f.key);
}
