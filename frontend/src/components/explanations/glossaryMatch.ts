export type GlossaryTermLike = { key: string; label: { vi: string; en: string }; aliases?: readonly string[] };

const EDGE = /^[\s"'“”‘’.,:;!?–—-]+|[\s"'“”‘’.,:;!?–—-]+$/g;
export const normalize = (text: string) => text.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/g, " ").replace(EDGE, "").trim();
const variants = (text: string) => [text, ...text.split(/[()]/)].map(normalize).filter(Boolean);

/** Exact match of the whole selection, or one of its parenthesised parts
 * ("TÀI SẢN RÒNG (NET WORTH)"), against a term's Vietnamese or English label.
 * No fuzzy matching: a near miss goes to the AI fallback rather than showing
 * the definition of a different concept (e.g. net worth vs. NAV). */
export function matchGlossaryTerm<T extends GlossaryTermLike>(selection: string, terms: T[]): T | undefined {
  const wanted = variants(selection);
  const matches = terms.filter(term => [term.label.vi, term.label.en, ...(term.aliases ?? [])].flatMap(variants).some(label => wanted.includes(label)));
  return matches.length === 1 ? matches[0] : undefined;
}
