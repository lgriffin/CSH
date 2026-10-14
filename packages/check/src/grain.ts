// Grain (Analyse, danger and grain, section 4; stage 57): the terms a statement constrains and the terms the evidence
// citing it observes. A green citation is reassurance over its grain and silence beyond it, so a told rule whose terms
// no citing test observes is a gap that names the terms, and masked danger. The terms of a sentence are its own words,
// never a translation: the identifiers it writes in backticks.

/** A backticked span that is an identifier, or a dotted path of them, and not a file name. */
const TERM = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const FILE = /\.(?:[cm]?[jt]sx?|py|java|go|rs|kt|md|json|ya?ml|toml|xml|feature|txt|sh)$/i;

/** The terms a sentence constrains: each backticked identifier, a dotted path read as its last segment (A-197). */
export function termsOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const span = m[1]!.trim();
    if (!TERM.test(span) || FILE.test(span)) continue;
    out.add(span.split(".").pop()!);
  }
  return [...out];
}

/** The words of an identifier, lower-cased: camelCase, PascalCase, snake_case and kebab-case split. */
export function wordsOf(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w !== "")
    .map((w) => w.toLowerCase());
}

/** Whether an identifier a test mentions observes a term: the term's words stand together among the identifier's. */
export function observesTerm(identifiers: string[], term: string): boolean {
  const want = wordsOf(term);
  if (want.length === 0) return false;
  return identifiers.some((id) => {
    const words = wordsOf(id);
    for (let i = 0; i + want.length <= words.length; i++) if (want.every((w, k) => words[i + k] === w)) return true;
    return false;
  });
}

export interface Citation {
  span: string;
  observes?: string[];
  reader?: string;
}

/**
 * The terms of a statement that no citing evidence observes, or undefined when the comparison cannot be made: the
 * statement names no term, nothing cites it, or a citation's grain was not read (A-198).
 */
export function unobserved(terms: string[], citations: Citation[]): string[] | undefined {
  if (terms.length === 0 || citations.length === 0 || citations.some((c) => c.observes === undefined)) return undefined;
  const all = citations.flatMap((c) => c.observes!);
  return terms.filter((t) => !observesTerm(all, t));
}
