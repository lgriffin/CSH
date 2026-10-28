// Told rules lifted from prose (Analyse, danger and grain, section 2; stage 55). A sentence of a document that states a
// layering ("the domain does not import the store", "handlers must never depend on the driver") or is an EARS sentence
// with no identifier is a told rule: an item of its own, cited as the sentence and never translated to a predicate. The
// test is on the words alone, so it reads structure and never meaning: a sentence that says a dependency is absent or
// restricted is lifted, whatever it is about.
import { classify } from "@csh/adapter-ears-markdown";

export type Told = "layering" | "ears";

/** A phrase that names a dependency between parts of the code (A-190). */
const DEPENDENCY = /\b(?:depends?|depending|depended)\s+(?:directly\s+|only\s+)?(?:up)?on\b|\bimport(?:s|ed|ing)?\b|\bknows?\s+(?:nothing|anything)\b(?:\s+at\s+all)?\s+(?:about|of)\b|\bindependent\s+of\b|\b(?:bound|coupled|tied)\s+to\b|\bdecoupled\s+from\b/i;
/** A word that says the dependency is absent or restricted; never the half of a hyphenated word ("type-only"). */
const RESTRICTION = /(?<![\w-])(?:not|never|no|nothing|only|cannot|independent|decoupled|forbids?|forbidden|forbidding)(?![\w-])|n['’]t(?![\w-])/i;
/** A sentence that hedges or asks says nothing is so (stage 60): "it might seem that", "appears to", a question. */
const HEDGE = /\b(?:might|seems?|seemed|appears?|appeared)\b/i;
/** A word after which "import" or "imports" is a noun, a data import, not a dependency (From the Toads run, section 5). */
const DETERMINER = /^(?:the|a|an|this|that|each|every|its|their|same|later|next|first|last|one)$/i;
/** A word after the noun "import" that makes it name code dependencies again: an import contract, any import of the logger. */
const CODE_NOUN = /^(?:contracts?|rules?|boundary|boundaries|linter|graph|of|from)$/i;
/** A word that opens a clause of its own: a restriction before it restricts nothing after it (A-219). */
const SUBORDINATOR = /^(?:because|since|whereas|although|though|so)$/i;
/** A quotation of three or more words, straight or curly: something said, not something stated (A-219). */
const QUOTED = /"[^"\n]*"|“[^”\n]*”/g;
/** The opening of a dated record or a plan's step: `2026-10-08, no import cycles.`, `**Done when.**`, `**Landed 2026-09-28.**`. */
const RECORD = /^(?:\*\*|__)?\s*(?:\d{4}-\d{2}-\d{2}\b|(?:Landed|Done when|Brief)\b)/;
/** How many words before and after the dependency phrase a restriction is looked for (A-203). */
const BEFORE = 5;
const AFTER = 4;

/** A sentence with each quotation of three or more words blanked to spaces, so what it says neither depends, restricts nor names (A-219). */
export function unquoted(sentence: string): string {
  return sentence.replace(QUOTED, (q) => (q.trim().split(/\s+/).length >= 3 ? " ".repeat(q.length) : q));
}

/**
 * Whether a sentence is a told rule, and which kind: an EARS sentence first, then a layering sentence, whose
 * restriction stands within five words before the dependency phrase, in it, or within four after ("does not import",
 * "depends only on", "imports nothing", "depend on inner layers, never the reverse"), so that a "not" elsewhere in the
 * sentence restricts nothing it names (A-203). Since stage 62 (A-219), a quotation is not read, "import" after a
 * determiner is a data import unless a code noun, `of` or `from` follows it ("an import contract", "any import of"), and the words before are cut at a
 * word that opens a clause of their own ("cannot show that, because it depends on").
 */
export function toldKind(sentence: string): Told | undefined {
  if (classify(sentence) !== undefined) return "ears";
  if (/\?\s*$/.test(sentence) || HEDGE.test(sentence)) return undefined;
  // A quotation is blanked to spaces, so what it says neither depends nor restricts.
  const text = unquoted(sentence);
  const bare = (w: string) => w.replace(/^[^\w]+|[^\w]+$/g, "");
  for (const m of text.matchAll(new RegExp(DEPENDENCY.source, "gi"))) {
    const words = text.slice(0, m.index).split(/\s+/).filter((w) => w !== "");
    const next = bare(text.slice(m.index + m[0].length).split(/\s+/).find((w) => w !== "") ?? "");
    if (/^imports?$/i.test(m[0]) && words.length > 0 && DETERMINER.test(bare(words[words.length - 1]!)) && !CODE_NOUN.test(next)) continue;
    const clause = words.slice(words.findLastIndex((w) => SUBORDINATOR.test(bare(w))) + 1);
    const before = clause.slice(-BEFORE).join(" ");
    const after = text.slice(m.index + m[0].length).split(/\s+/).filter((w) => w !== "").slice(0, AFTER).join(" ");
    if (RESTRICTION.test(before) || RESTRICTION.test(m[0]) || RESTRICTION.test(after)) return "layering";
  }
  return undefined;
}

/** The sentences of a paragraph: each ends at `.`, `!` or `?` before white space, outside backticks. */
export function sentencesOf(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let inTick = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "`") inTick = !inTick;
    else if (!inTick && /[.!?]/.test(c) && (i + 1 === text.length || /\s/.test(text[i + 1]!)) && !/\b(?:e\.g|i\.e|etc|vs)$/i.test(text.slice(start, i))) {
      out.push({ text: text.slice(start, i + 1), offset: start });
      start = i + 1;
    }
  }
  if (text.slice(start).trim() !== "") out.push({ text: text.slice(start), offset: start });
  return out.map((s) => {
    const lead = s.text.length - s.text.trimStart().length;
    return { text: s.text.trim(), offset: s.offset + lead };
  });
}

/**
 * The told rules of a Markdown file: prose paragraphs and list items outside code fences, headings, tables, HTML and the
 * sections an identified item opens (`inItem` says which headings open one), each sentence with the line it starts on.
 */
export function toldSentences(lines: string[], opensItem: (headingText: string) => boolean): { line: number; text: string; told: Told }[] {
  const out: { line: number; text: string; told: Told }[] = [];
  let fence: { char: string; length: number } | undefined;
  let itemLevel: number | undefined;
  let para: { text: string; starts: { at: number; line: number }[] } | undefined;
  const flush = () => {
    if (para === undefined) return;
    const p = para;
    para = undefined;
    // A paragraph or item that opens with a date, or as a plan's "Done when", "Brief" or "Landed", records the past or
    // the planned: it tells nothing of the code now (stage 79, A-283).
    if (RECORD.test(p.text)) return;
    for (const s of sentencesOf(p.text)) {
      const told = toldKind(s.text.replace(/\*\*|__/g, ""));
      if (told === undefined) continue;
      const line = [...p.starts].reverse().find((x) => x.at <= s.offset)!.line;
      out.push({ line, text: s.text.replace(/\*\*|__/g, "").replace(/\s+/g, " "), told });
    }
  };
  lines.forEach((raw, i) => {
    const fenceMark = /^\s*(`{3,}|~{3,})(.*)$/.exec(raw);
    if (fenceMark !== null) {
      flush();
      const mark = fenceMark[1]!;
      if (fence === undefined) fence = { char: mark[0]!, length: mark.length };
      else if (mark[0] === fence.char && mark.length >= fence.length && fenceMark[2]!.trim() === "") fence = undefined;
      return;
    }
    if (fence !== undefined) return;
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (h !== null) {
      flush();
      const level = h[1]!.length;
      if (itemLevel !== undefined && level <= itemLevel) itemLevel = undefined;
      if (itemLevel === undefined && opensItem(h[2]!)) itemLevel = level;
      return;
    }
    const line = raw.trim();
    if (line === "" || line.startsWith("|") || line.startsWith("<") || /^[-*_]{3,}$/.test(line)) {
      flush();
      return;
    }
    if (itemLevel !== undefined) return;
    const item = /^(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+)?(.*)$/.exec(line)!;
    const isListItem = item[0] !== item[1] && /^(?:>\s*)*(?:[-*+]|\d+[.)])\s/.test(line);
    if (isListItem) flush();
    const text = item[1]!.replace(/^>\s*/, "");
    if (para === undefined) para = { text: "", starts: [] };
    if (para.text !== "") para.text += " ";
    para.starts.push({ at: para.text.length, line: i + 1 });
    para.text += text;
  });
  flush();
  return out;
}
