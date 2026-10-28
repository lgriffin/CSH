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
    if (kind === "literal") return [{ item: `${source}/${file}`, file, span, shown: `"${text}"`, match: new RegExp(`^${escape(text)}$`, "i") }];
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

/**
 * The scenarios, and scenarios of specification prose, that a test binds by its title (From the tutors run, section 2),
 * each with the test files that carry it. A title two of them share binds neither: which one a test means is unknown,
 * so both are left to their steps and citations (A-205).
 */
export function boundByTitle(items: Prepared["items"]): Map<string, string[]> {
  const key = (t: string) => t.trim().replace(/\s+/g, " ");
  const tests = new Map<string, string[]>();
  for (const i of items) {
    if (i.kind !== "test-file" || i.attrs?.titles === undefined) continue;
    for (const t of i.attrs.titles.split("\n").map(key).filter((x) => x !== "")) tests.set(t, [...(tests.get(t) ?? []), `${i.source}/${i.id}`]);
  }
  const named = new Map<string, string[]>();
  for (const i of items) {
    if (i.kind !== "scenario" && i.attrs?.gherkin !== "prose") continue;
    const t = key(i.text);
    if (tests.has(t)) named.set(t, [...(named.get(t) ?? []), `${i.source}/${i.id}`]);
  }
  const out = new Map<string, string[]>();
  for (const [t, scenarios] of named) if (scenarios.length === 1) out.set(scenarios[0]!, tests.get(t)!);
  return out;
}

export function stepGaps(prepared: Prepared): Gap[] {
  // A scenario a test carries the title of is bound by that test, not by step definitions (From the tutors run, section 2).
  const bound = boundByTitle(prepared.items);
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
    if (missing.length === 0 || bound.has(`${sc.source}/${sc.id}`)) continue;
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

/**
 * What pytest-bdd's bindings decide (From the Toads run, section 2; A-215, A-216). A Python test file that imports
 * pytest_bdd records the feature files its `scenarios(...)` calls name, the titles its `scenario(...)` calls bind, and,
 * for a call CSH cannot read, the names that may say which. pytest-bdd runs only what a module binds, so, once any test
 * file is read as a pytest-bdd module, each scenario of a feature file is bound, possibly bound, or not bound.
 */
export function pytestBddBindings(items: Prepared["items"]): { bound: Map<string, string[]>; gaps: Gap[] } {
  const bound = new Map<string, string[]>();
  const gaps: Gap[] = [];
  const modules = items.filter((i) => i.kind === "test-file" && i.attrs?.bdd === "pytest-bdd");
  if (modules.length === 0) return { bound, gaps };
  const scenarios = items.filter((i) => i.kind === "scenario" && i.attrs?.gherkin !== "prose" && /\.feature:\d+$/.test(i.span));
  const fileOf = (span: string) => span.slice(0, span.lastIndexOf(":"));
  const features = [...new Set(scenarios.map((s) => fileOf(s.span)))];
  const lines = (v: string | undefined) => (v ?? "").split("\n").filter((x) => x !== "");
  // A path a literal names, from the test file's directory when it climbs with ./ or ../; undefined for any other.
  const climbed = (test: string, ref: string): string | undefined => {
    if (!/^\.\.?\//.test(ref)) return undefined;
    const dir = test.includes("/") ? test.slice(0, test.lastIndexOf("/")) : "";
    const parts: string[] = [];
    for (const seg of `${dir}/${ref}`.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts.join("/");
  };
  // A feature file a literal names: the one it climbs to, else any whose path ends with it.
  const named = (test: string, ref: string): string[] => {
    const r = ref.replace(/\\/g, "/");
    const up = climbed(test, r);
    return features.filter((f) => (up !== undefined ? f === up : f === r || f.endsWith(`/${r}`)));
  };
  // The feature files under a directory a literal names, at any depth, as pytest-bdd collects them.
  const under = (test: string, ref: string): string[] => {
    const r = ref.replace(/\\/g, "/").replace(/\/+$/, "");
    const up = climbed(test, r);
    return features.filter((f) => (up !== undefined ? up === "" || f.startsWith(`${up}/`) : f.startsWith(`${r}/`) || f.includes(`/${r}/`)));
  };
  const base = (f: string) => f.slice(f.lastIndexOf("/") + 1);
  const key = (t: string) => t.trim().replace(/\s+/g, " ");
  const byFeature = new Map<string, Set<string>>();
  const maybe = new Map<string, Set<string>>();
  const byTitle = new Map<string, Set<string>>();
  const byPair = new Map<string, Set<string>>();
  const put = (m: Map<string, Set<string>>, k: string, v: string) => m.set(k, (m.get(k) ?? new Set()).add(v));
  for (const t of modules) {
    for (const ref of lines(t.attrs?.bindsFeatures)) for (const f of named(t.id, ref)) put(byFeature, f, t.id);
    for (const ref of lines(t.attrs?.bindsDirs)) for (const f of under(t.id, ref)) put(byFeature, f, t.id);
    for (const n of lines(t.attrs?.bindsNamed)) for (const f of features.filter((x) => base(x) === `${n}.feature`)) put(byFeature, f, t.id);
    for (const ref of lines(t.attrs?.bindsUndecided)) for (const f of named(t.id, ref)) put(maybe, f, t.id);
    for (const title of lines(t.attrs?.bindsTitles)) put(byTitle, title, t.id);
    for (const pair of lines(t.attrs?.bindsPairs)) {
      const [ref, title] = pair.split("\t") as [string, string];
      for (const f of named(t.id, ref)) put(byPair, `${f}\t${key(title)}`, t.id);
    }
  }
  const shared = new Map<string, number>();
  for (const s of scenarios) shared.set(key(s.text), (shared.get(key(s.text)) ?? 0) + 1);
  const list = (s: Set<string> | undefined) => [...(s ?? [])].sort(compareCodePoints);
  for (const s of scenarios) {
    const q = `${s.source}/${s.id}`;
    const file = fileOf(s.span);
    const title = key(s.text);
    // A title bound with no readable feature file binds the one scenario that has it; when two share it, either may be the one.
    const byShared = shared.get(title) === 1 ? [] : list(byTitle.get(title));
    const by = [...new Set([...list(byFeature.get(file)), ...list(byPair.get(`${file}\t${title}`)), ...(shared.get(title) === 1 ? list(byTitle.get(title)) : [])])].sort(compareCodePoints);
    const steps = lines(s.attrs?.steps).length;
    const tags = s.attrs?.tags !== undefined && s.attrs.tags !== "" ? `; tagged ${s.attrs.tags}` : "";
    if (by.length > 0) {
      bound.set(q, by);
      if (steps === 0) gaps.push({ kind: "stepless-scenario", subject: q, fragments: [], detail: `${s.span}: bound by ${by.join(", ")}, and it has no steps, so its test passes having checked nothing${tags}` });
      continue;
    }
    const undecided = list(maybe.get(file));
    if (undecided.length > 0) gaps.push({ kind: "binding-undecided", subject: q, fragments: [], detail: `${s.span}: ${undecided.join(", ")} ${undecided.length === 1 ? "binds" : "bind"} scenarios of ${file} by a title CSH cannot read, so whether a test binds this one is not known${tags}` });
    else if (byShared.length > 0) gaps.push({ kind: "binding-undecided", subject: q, fragments: [], detail: `${s.span}: ${byShared.join(", ")} ${byShared.length === 1 ? "binds" : "bind"} a scenario titled as this one in a feature file CSH cannot read, and ${shared.get(title)} scenarios share the title, so whether a test binds this one is not known${tags}` });
    else gaps.push({ kind: "unbound-scenario", subject: q, fragments: [], detail: `${s.span}: no test binds it, so pytest-bdd never runs it; ${steps === 0 ? "it has no steps" : `its ${steps} step${steps === 1 ? "" : "s"} never run`}${tags}` });
  }
  return { bound, gaps };
}
