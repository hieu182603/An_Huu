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
    coverage: /bao phu|coverage|ty le dap ung|dap ung/.test(text),
    contribution: /gop|tich luy|contribut|saving/.test(text),
    shortfall: /thieu|het tien|shortfall|run out/.test(text),
    // "bảo hiểm xã hội / y tế / thất nghiệp" are statutory schemes, not partner products.
    products: /san pham|goi |quy mo|quy dau tu|bao hiem(?! xa hoi| y te| that nghiep)|tiet kiem|nen mua|nen chon|nen dau tu|dau tu vao|dau tu gi|product|fund|insurance/.test(text),
  };
}
export type Risk = "LOW" | "MEDIUM" | "HIGH";
const RISK_VI: Record<Risk, string> = { LOW: "rủi ro thấp", MEDIUM: "rủi ro trung bình", HIGH: "rủi ro cao" };
const RISK_ORDER: Risk[] = ["LOW", "MEDIUM", "HIGH"];
const RISK_USE: Record<Risk, string> = { LOW: "giữ tiền an toàn, dễ rút (quỹ dự phòng, tiền sắp cần dùng)",
  MEDIUM: "cân bằng giữa ổn định và tăng trưởng", HIGH: "tăng trưởng cho phần tiền dài hạn, chấp nhận biến động mạnh" };
const REACTION_RISK = { SELL: "LOW", HOLD: "MEDIUM", BUY_MORE: "HIGH" } as const;
const REACTION_VI = { SELL: "bán bớt", HOLD: "giữ nguyên", BUY_MORE: "mua thêm" } as const;
const lowest = (a: Risk, b: Risk) => RISK_ORDER[Math.min(RISK_ORDER.indexOf(a), RISK_ORDER.indexOf(b))];
/** Highest product risk level the time to retirement allows. */
export function horizonRisk(yearsToRetirement: number | null): Risk {
  return yearsToRetirement === null ? "HIGH" : yearsToRetirement < 5 ? "LOW" : yearsToRetirement <= 15 ? "MEDIUM" : "HIGH";
}
export function suitableRisks(yearsToRetirement: number | null, tolerance: Risk | null = null): Risk[] {
  const cap = tolerance ? lowest(horizonRisk(yearsToRetirement), tolerance) : horizonRisk(yearsToRetirement);
  return RISK_ORDER.slice(0, RISK_ORDER.indexOf(cap) + 1);
}
/** What the server already knows about the person asking; nothing here is typed by the provider. */
export type Suitability = {
  yearsToRetirement: number | null;
  /** Risk band of the survey pinned in the selected plan version. */
  survey: { risk: Risk; label: string } | null;
  /** Declared reaction to a market fall (profile); used only when no survey is available. */
  reaction: keyof typeof REACTION_RISK | null;
  /** true = declared emergency reserve below the required months; null = not computable. */
  emergencyShortfall: boolean | null;
  /** Opening weights of the selected plan version, already formatted. */
  allocation: Array<{ label: string; percent: string }>;
};
export type ProductRow = { name: string; partner: string; category: string; riskLevel: Risk; annualFee: string | null };
export function productFactText(products: ProductRow[], profile: Suitability | number | null) {
  const p: Suitability = profile === null || typeof profile === "number"
    ? { yearsToRetirement: profile, survey: null, reaction: null, emergencyShortfall: null, allocation: [] } : profile;
  const tolerance = p.survey?.risk ?? (p.reaction ? REACTION_RISK[p.reaction] : null);
  const allowed = suitableRisks(p.yearsToRetirement, tolerance), cap = allowed[allowed.length - 1];
  const basis = [
    p.yearsToRetirement === null ? "- Thời gian: hồ sơ chưa có tháng muốn nghỉ hưu nên chưa lọc theo thời gian đầu tư."
      : `- Thời gian: còn khoảng ${p.yearsToRetirement} năm đến tháng muốn nghỉ hưu.`,
    p.survey ? `- Mức chấp nhận rủi ro: nhóm “${p.survey.label}” theo khảo sát rủi ro của kế hoạch đang xem.`
      : p.reaction ? `- Mức chấp nhận rủi ro: chưa có khảo sát rủi ro; tạm dựa vào phản ứng bạn đã khai khi thị trường giảm (${REACTION_VI[p.reaction]}).`
      : "- Mức chấp nhận rủi ro: chưa có khảo sát rủi ro. Hãy làm khảo sát ở mục Phân bổ tài sản để gợi ý sát hơn.",
    ...(p.emergencyShortfall === null ? [] : [p.emergencyShortfall
      ? "- Quỹ dự phòng: chưa đủ mức nên có. Nên bù quỹ dự phòng bằng sản phẩm rủi ro thấp, dễ rút trước khi đầu tư dài hạn."
      : "- Quỹ dự phòng: đã đủ mức nên có."]),
    ...(p.allocation.length ? [`- Cơ cấu phân bổ của kế hoạch đang xem: ${p.allocation.map(a => `${a.label} ${a.percent}%`).join("; ")}.`] : []),
  ];
  const groups = allowed.flatMap(risk => {
    // Up to 3 per level, one per product type first so the list is not three look-alike deposits.
    const rows = products.filter(x => x.riskLevel === risk), seen = new Set<string>();
    const picked = [...rows.filter(x => !seen.has(x.category) && !!seen.add(x.category)), ...rows].filter((x, i, all) => all.indexOf(x) === i).slice(0, 3);
    return picked.length ? [`Nhóm ${RISK_VI[risk]} – ${RISK_USE[risk]}:\n${picked.map(x => `- ${x.name} (${x.partner}, ${x.category}${x.annualFee ? `; phí: ${x.annualFee}` : ""})`).join("\n")}`] : [];
  });
  return [
    `Gợi ý lọc theo hồ sơ của bạn:\n${basis.join("\n")}`,
    `Vì vậy mức rủi ro phù hợp tối đa là ${RISK_VI[cap]}${tolerance && p.yearsToRetirement !== null ? " (lấy mức thấp hơn giữa thời gian còn lại và mức chấp nhận rủi ro)" : ""}.`,
    groups.length ? `Sản phẩm đối tác đang có trên An Hưu trong phạm vi này:\n${groups.join("\n")}` : "Hiện chưa có sản phẩm đối tác đang phân phối trong phạm vi này.",
    "Đây là kết quả lọc theo hồ sơ, không phải khuyến nghị đầu tư cá nhân. Hãy đọc kỹ phí, điều kiện, công bố rủi ro của từng sản phẩm và gửi “Yêu cầu tư vấn” tại trang Khám phá để chuyên viên liên hệ.",
  ].join("\n");
}
/** The person explicitly asks which product to pick: the filtered list must follow the answer. */
export const asksForProducts = (question: string) => /nen (mua|chon|dau tu|gui)|(san pham|goi|quy|kenh) (nao|gi)|dau tu (vao )?(gi|dau|cai gi)|goi y (san pham|dau tu)|de tien o dau/
  .test(question.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d"));
const PLAN_TOPICS = ["coverage", "contribution", "shortfall", "simulation"] as const;
/** The question is about the person's own plan numbers, not general knowledge. */
export const asksAboutPlan = (question: string) => { const t = questionTopics(question); return PLAN_TOPICS.some(k => t[k]); };
export function fallbackFactKeys(question: string, facts: Array<{ key: string }>, hasKnowledge = false) {
  const topics = questionTopics(question);
  const preferred = new Set([
    ...(topics.simulation ? ["simulation"] : []), ...(topics.inflation ? ["inflation"] : []),
    ...(topics.returns ? ["returns"] : []), ...(topics.coverage ? ["coverage", "required"] : []),
    ...(topics.contribution ? ["contribution"] : []), ...(topics.shortfall ? ["shortfall", "required"] : []),
    ...(topics.products ? ["products"] : []),
  ]);
  const matched = facts.filter(f => preferred.has(f.key)).map(f => f.key);
  // A general question answered by an approved document does not need every plan number.
  return matched.length || hasKnowledge ? matched : facts.slice(0, 6).map(f => f.key);
}
/** Opening of the best approved excerpt, cut at a line end, for answers written without the provider. */
export function knowledgeLead(citation: { title: string; excerpt: string }, max = 900) {
  let text = citation.excerpt.trim();
  if (text.length > max) { const cut = text.lastIndexOf("\n", max); text = text.slice(0, cut > max / 2 ? cut : max).trimEnd() + " …"; }
  return `Theo tài liệu đã duyệt “${citation.title}”:\n${text}`;
}
const NUMBER = /\d+(?:[.,]\d+)*/g;
const numbers = (text: string) => (text.match(NUMBER) ?? []).map(n => n.replace(/^0+(?=\d)/, ""));
const PROMISE = /(?<!không |không phải |chưa |không được |không có |chẳng )(cam kết lợi nhuận|bảo đảm lợi nhuận|đảm bảo lợi nhuận|chắc chắn (sẽ )?(có lãi|sinh lời|thành công|đạt))/iu;
/** Accepts provider prose only when it stays inside server data: plain text, no links, no return promises and
 * every number already present in the question, the facts or the approved excerpts. Returns null to fall back. */
export function groundedAnswer(raw: unknown, packet: { question: string; facts: Array<{ text: string }>; knowledge: Array<{ title: string; content: string }> }) {
  if (typeof raw !== "string") return null;
  const answer = raw.replace(/\r/g, "").replace(/\*\*|__|`/g, "").replace(/^\s*#{1,6}\s+/gm, "").replace(/^(\s*)[*•]\s+/gm, "$1- ").replace(/\n{3,}/g, "\n\n").trim();
  if (answer.length < 20 || answer.length > 2500 || /https?:\/\/|www\./i.test(answer) || PROMISE.test(answer)) return null;
  const allowed = new Set(numbers([packet.question, ...packet.facts.map(f => f.text), ...packet.knowledge.flatMap(k => [k.title, k.content])].join("\n")));
  // "1." / "2)" at the start of a line only number a list.
  return numbers(answer.replace(/^\s*\d{1,2}[.)]\s/gm, "")).every(n => allowed.has(n)) ? answer : null;
}
