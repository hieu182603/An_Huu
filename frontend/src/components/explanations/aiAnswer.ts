import { normalize, type GlossaryTermLike } from "./glossaryMatch.ts";

/** A curated term whose label appears inside a longer selection
 * ("Mức dự phòng khẩn cấp cho gia đình" → "Dự phòng khẩn cấp"). Shown only as a
 * labelled "related term" hint while the AI answers, never as the definition of
 * the selection itself. Short labels are ignored to avoid matching common words. */
export function relatedGlossaryTerm<T extends GlossaryTermLike>(selection: string, terms: T[]): T | undefined {
  const text = ` ${normalize(selection)} `;
  let best: { term: T; length: number } | undefined;
  for (const term of terms) {
    for (const label of [term.label.vi, term.label.en, ...(term.aliases ?? [])].map(normalize)) {
      if (label.length >= 6 && label.length > (best?.length ?? 0) && text.includes(` ${label} `)) best = { term, length: label.length };
    }
  }
  return best?.term;
}

/** Group long digit runs: 90000000 → 90.000.000 (vi) / 90,000,000 (en). Years and
 * already-grouped amounts are left untouched. */
export function formatAnswerNumbers(text: string, language: string) {
  return text.replace(/(?<![\d.,])\d{5,}(?![\d.,]\d)/g, digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, language === "en" ? "," : "."));
}

type Fact = { key: string; text: string };
export type StructuredAnswer = { summary?: string; details: string[]; more: string[]; example: string[]; notes: string[] };

// Fact keys produced by the backend explain service (backend/src/modules/ai/service.ts).
const PLAN_NUMBER_FACTS = new Set(["fund", "required", "contribution", "coverage", "shortfall", "actual-balance"]);
const NOTE_FACTS = new Set(["limits", "hypothetical", "warnings", "actual-status", "simulation"]);
// "missing" asks the user to pick a plan version, which does not explain a
// selected phrase; the popup shows its own empty state instead.
const PLAN_MISSING = "missing";

const sentences = (text: string) => text
  .split(/\n+/)
  .flatMap(line => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line) ? [line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")] : line.split(/(?<=[.!?…])\s+(?=\S)/))
  .map(part => part.replace(/\*\*/g, "").trim())
  .filter(part => part.length > 1);
const firstSentence = (text: string) => sentences(text)[0] ?? text;

/** Turn the server's fact list and approved-document excerpts into a short
 * summary, a few bullet points (the rest in `more`), a personal-numbers example
 * and brief notes. */
export function structureAiAnswer(result: { answer: string; facts?: Fact[]; citations?: Array<{ excerpt?: string }> }, language: string, maxDetails = 4): StructuredAnswer {
  const facts = result.facts?.length ? result.facts : result.answer.trim() ? [{ key: "answer", text: result.answer }] : [];
  const body = [
    ...(result.citations ?? []).slice(0, 2).map(citation => citation.excerpt?.trim() ?? "").filter(Boolean),
    ...facts.filter(fact => fact.key !== PLAN_MISSING && !PLAN_NUMBER_FACTS.has(fact.key) && !NOTE_FACTS.has(fact.key)).map(fact => fact.text),
  ].flatMap(sentences).map(text => formatAnswerNumbers(text, language));
  const unique = Array.from(new Set(body));
  const example = facts.filter(fact => PLAN_NUMBER_FACTS.has(fact.key)).map(fact => formatAnswerNumbers(firstSentence(fact.text), language));
  const notes = facts
    .filter(fact => NOTE_FACTS.has(fact.key))
    .map(fact => firstSentence(fact.text))
    .slice(0, 2);
  return { summary: unique[0], details: unique.slice(1, 1 + maxDetails), more: unique.slice(1 + maxDetails), example, notes };
}
