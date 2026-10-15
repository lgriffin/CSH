// Scenario steps matched to step definitions (From real runs, stage 42): the steps the scenarios practice read, each
// against every definition a test practice read in style cucumber. A step nothing matches and a definition nothing
// uses are each a gap. A definition CSH cannot read could match any step, so with one present an unmatched step is
// not decided either way, and is said so.
import { compareCodePoints } from "@csh/kernel";
import type { Prepared } from "./pool.ts";
import type { Gap } from "./types.ts";

const NUMBER = "(-?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)";
const PARAMETERS: Record<string, string> = {
  int: "(-?\\d+)",
  float: NUMBER,
  double: NUMBER,
  bigdecimal: NUMBER,
  biginteger: "(-?\\d+)",
  byte: "(-?\\d+)",
  short: "(-?\\d+)",
  long: "(-?\\d+)",
  word: "([^\\s]+)",
  string: "(\"[^\"]*\"|'[^']*')",
  "": "(.*)",
};

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** One piece of a Cucumber expression with no whitespace or alternation in it. */
function piece(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length) out += escape(text[++i]!);
    else if (c === "{") {
      const end = text.indexOf("}", i);
      if (end < 0) return `${out}${escape(text.slice(i))}`;
      // A parameter type a project defines may match anything: it is read as `{}`.
      out += PARAMETERS[text.slice(i + 1, end)] ?? "(.*)";
      i = end;
    } else if (c === "(") {
      const end = text.indexOf(")", i);
      if (end < 0) return `${out}${escape(text.slice(i))}`;
      out += `(?:${piece(text.slice(i + 1, end))})?`;
      i = end;
    } else out += escape(c);
  }
  return out;
}

/**
 * A Cucumber expression as a regular expression over a whole step: `{int}`, `{float}`, `{word}`, `{string}` and `{}`
 * parameters, optional `(text)`, and `a/b` alternatives within a run of text with no space in it.
 */
export function cucumberExpression(text: string): RegExp {
  const out = text.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok)) return escape(tok);
    // A slash outside a parameter and not escaped separates alternatives.
    const parts: string[] = [];
    let cur = "";
    let depth = 0;
    for (let i = 0; i < tok.length; i++) {
      const c = tok[i]!;
      if (c === "\\" && i + 1 < tok.length) {
        cur += c + tok[++i]!;
        continue;
      }
      if (c === "{" || c === "(") depth++;
      if (c === "}" || c === ")") depth--;
      if (c === "/" && depth === 0) {
        parts.push(cur);
        cur = "";
      } else cur += c;
    }
    parts.push(cur);
    return parts.length === 1 ? piece(parts[0]!) : `(?:${parts.map(piece).join("|")})`;
  });
  return new RegExp(`^${out.join("")}$`);
}

/** vitest-cucumber's parameters (From the tutors run, section 4); any other `{name}` matches anything. */
const VITEST_PARAMETERS: Record<string, string> = {
  string: "(\"[^\"]*\"|'[^']*')",
  int: "(-?\\d+)",
  float: NUMBER,
  number: NUMBER,
  boolean: "(true|false)",
  word: "([^\\s]+)",
  char: "(.)",
};

/**
 * A vitest-cucumber step as a regular expression over a whole step: its `{name}` parameters, and every other character
 * literal, `/`, parentheses and `<placeholders>` included (A-207).
 */
export function vitestExpression(text: string): RegExp {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const end = c === "{" ? text.indexOf("}", i) : -1;
    if (end > i && /^[\w-]*$/.test(text.slice(i + 1, end))) {
      out += VITEST_PARAMETERS[text.slice(i + 1, end)] ?? "(.*)";
      i = end;
    } else out += escape(c);
  }
  return new RegExp(`^${out}$`);
}

interface Definition {
  file: string;
  span: string;
  shown: string;
  match?: RegExp;
}

/** The definitions a test-file item records, `line<TAB>kind<TAB>text`; an unreadable one has no matcher. */
function definitionsOf(source: string, file: string, encoded: string): (Definition & { item: string })[] {
  return encoded.split("\n").flatMap((row) => {
    const [line, kind, text] = row.split("\t");
    if (line === undefined || kind === undefined || text === undefined) return [];
    const span = `${file}:${line}`;
    if (kind === "expression" || kind === "vitest") {
      try {
        return [{ item: `${source}/${file}`, file, span, shown: `"${text}"`, match: kind === "vitest" ? vitestExpression(text) : cucumberExpression(text) }];
      } catch {
        return [{ item: `${source}/${file}`, file, span, shown: `"${text}"` }];
      }
    }
    if (kind === "regex") {
      const cut = text.indexOf("/");
      const flags = text.slice(0, cut);
      const body = text.slice(cut + 1);
      try {
        return [{ item: `${source}/${file}`, file, span, shown: `/${body}/${flags}`, match: new RegExp(body, flags) }];
      } catch {
        return [{ item: `${source}/${file}`, file, span, shown: `/${body}/${flags}` }];
      }
    }
    return [{ item: `${source}/${file}`, file, span, shown: text }];
  });
}

export function stepGaps(prepared: Prepared): Gap[] {
  // A scenario a test carries the title of is bound by that test, not by step definitions (From the tutors run, section 2).
  const titles = new Set(prepared.items.flatMap((i) => (i.kind === "test-file" && i.attrs?.titles !== undefined ? i.attrs.titles.split("\n").map((t) => t.trim()) : [])));
  const scenarios = prepared.items.filter((i) => i.kind === "scenario" && i.attrs?.steps !== undefined);
  const defs = prepared.items.flatMap((i) => (i.attrs?.stepDefinitions !== undefined ? definitionsOf(i.source, i.id, i.attrs.stepDefinitions) : []));
  if (scenarios.length === 0 || defs.length === 0) return [];
  const readable = defs.filter((d) => d.match !== undefined);
  const unreadable = defs.filter((d) => d.match === undefined);
  const used = new Set<Definition>();
  const gaps: Gap[] = [];
  for (const sc of scenarios) {
    const file = sc.span.slice(0, sc.span.lastIndexOf(":"));
    const missing: string[] = [];
    // An outline's step as written, by line: a definition that matches it matches every row (A-208).
    const templates = new Map((sc.attrs!.templates ?? "").split("\n").filter((r) => r !== "").map((r) => [r.slice(0, r.indexOf("\t")), r.slice(r.indexOf("\t") + 1)]));
    for (const row of sc.attrs!.steps!.split("\n")) {
      const tab = row.indexOf("\t");
      const text = row.slice(tab + 1);
      const template = templates.get(row.slice(0, tab));
      const hits = readable.filter((d) => d.match!.test(text) || (template !== undefined && d.match!.test(template)));
      for (const d of hits) used.add(d);
      if (hits.length === 0) missing.push(`${file}:${row.slice(0, tab)} "${text}"`);
    }
    // Its definitions still count as used; only a step none matches is not a gap of it.
    if (missing.length === 0 || titles.has(sc.text.trim().replace(/\s+/g, " "))) continue;
    const subject = `${sc.source}/${sc.id}`;
    if (unreadable.length === 0) gaps.push({ kind: "undefined-step", subject, fragments: [], detail: `no step definition matches ${missing.join("; ")}` });
    else gaps.push({ kind: "steps-undecided", subject, fragments: [], detail: `no step definition CSH can read matches ${missing.join("; ")}; ${unreadable.length} it cannot read could: ${unreadable.map((d) => `${d.span} ${d.shown}`).join("; ")}` });
  }
  const unused = new Map<string, string[]>();
  for (const d of readable) if (!used.has(d)) unused.set(d.item, [...(unused.get(d.item) ?? []), `${d.span} ${d.shown}`]);
  for (const [subject, list] of [...unused].sort((a, b) => compareCodePoints(a[0], b[0]))) {
    gaps.push({ kind: "unused-step-definition", subject, fragments: [], detail: `no scenario step uses ${list.join("; ")}` });
  }
  return gaps;
}
