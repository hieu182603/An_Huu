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
  };
}
export function fallbackFactKeys(question: string, facts: Array<{ key: string }>) {
  const topics = questionTopics(question);
  const preferred = new Set([
    ...(topics.simulation ? ["simulation"] : []), ...(topics.inflation ? ["inflation"] : []),
    ...(topics.returns ? ["returns"] : []), ...(topics.coverage ? ["coverage", "required"] : []),
    ...(topics.contribution ? ["contribution"] : []), ...(topics.shortfall ? ["shortfall", "required"] : []),
  ]);
  const matched = facts.filter(f => preferred.has(f.key)).map(f => f.key);
  return matched.length ? matched : facts.slice(0, 6).map(f => f.key);
}
