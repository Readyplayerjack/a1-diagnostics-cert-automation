/**
 * Answer normalisation (matching pipeline step 1). Pure and deterministic:
 * the same function normalises player input and stored aliases, so two
 * strings match exactly when their normal forms are equal.
 *
 * Steps, in order:
 *  1. Unicode NFKC (full-width, ligatures, compatibility forms)
 *  2. Fold diacritics (café → cafe)
 *  3. Lowercase (en-GB)
 *  4. "&" → " and " (M&S ≡ M and S, Marks & Spencer ≡ Marks and Spencer)
 *  5. Apostrophes removed without a gap (Sainsbury's → sainsburys); all other
 *     punctuation and symbols become spaces (Coca-Cola → coca cola)
 *  6. Collapse whitespace and trim
 *  7. Strip one leading article (the/a/an) when something follows it
 *  8. Simple plurals, per alphabetic word (see singularise)
 */

const APOSTROPHES = /['’‘ʼ`´]/g;
// Anything that isn't a letter, number or whitespace is punctuation/symbol.
const NON_WORD = /[^\p{L}\p{N}\s]+/gu;
const COMBINING_MARKS = /\p{M}+/gu;
const LEADING_ARTICLE = /^(?:the|a|an) (?=\S)/;

/**
 * Reduce a simple English plural to its singular. Deliberately rule-based
 * and approximate: what matters is that input and aliases are treated the
 * same way, not linguistic perfection.
 *  - words of 3 letters or fewer, and non-alphabetic tokens, are untouched
 *  - -ies → -y        (berries → berry)
 *  - -sses → -ss      (glasses → glass)
 *  - -ss, -us, -is    unchanged (glass, bus, crisis)
 *  - -shes/-ches/-xes/-zes → drop "es" (dishes → dish, boxes → box)
 *  - -s → drop "s"    (fingers → finger, tacos → taco)
 */
export function singularise(word: string): string {
  if (word.length <= 3 || !/^\p{L}+$/u.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (/(?:sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Normalise a raw answer. Returns "" when nothing meaningful remains. */
export function normalise(raw: string): string {
  let s = raw.normalize("NFKC");
  s = s.normalize("NFD").replace(COMBINING_MARKS, "").normalize("NFC");
  s = s.toLocaleLowerCase("en-GB");
  s = s.replace(/&/g, " and ");
  s = s.replace(APOSTROPHES, "");
  s = s.replace(NON_WORD, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(LEADING_ARTICLE, "");
  return s.split(" ").map(singularise).join(" ");
}
