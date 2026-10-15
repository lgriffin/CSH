// The test-file inventory adapter (Ingesting a codebase, stage 22). Each test file is one item, with the number of
// tests it declares. An identifier in the title of a describe, it or test call cites that identifier: the title is
// what the runner reports, so it is what a reader of a failure sees. Identifiers elsewhere in the file, in data or
// comments, cite nothing. The file is read as text and never run: a small lexer tells comments, strings and regular
// expressions from code, so a test written inside a fixture string is not a test. The runner's results, when the
// practice names a results file (stage 26), are joined to each file and to the identifiers each test's full name cites;
// they are counted, and never decide anything. Python, Java, Go and Rust test files are read by their runners'
// conventions (tests-other.ts, stage 35), and their results join by path as these do, or, when the runner names a Java
// class, a Go package or a Rust test binary instead of a file, by what the source's files declare (tests-join.ts).
import { posix } from "node:path";
import { compareCodePoints, digestOf } from "@csh/kernel";
import { type Adapter, type AdapterInput, type AdapterOutput, type Diagnostic, type ItemEdge, parseTestResults, type SourceItem, type TestOutcome, type TestResult } from "@csh/witness";
import { decode, idPatternOf, sortedFiles } from "./common.ts";
import { joiner, type Join } from "./tests-join.ts";
import { stepDefinitionsOther } from "./steps-other.ts";
import { inventory, languageOf, lexOther, lineIndex, lineStarts, runnerName, underscoreFree } from "./tests-other.ts";

/** A `go.mod` or `Cargo.toml` in a test source is read for its layout, to join results, and is not a test file. */
const isLayout = (path: string) => /(?:^|\/)(?:go\.mod|Cargo\.toml)$/.test(path);

export const manifest = {
  id: "csh.adapter.items.tests",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges", "results"],
  inputKinds: ["TestFiles"],
} as const;

/** A describe, it or test call in code, with any modifier such as .each or .skip, and an optional type argument. */
const CALL = /(?<![.\w$])(describe|it|test)((?:\.\w+)*)\s*(?:<[^<>()]*>)?\s*(\(|`)/g;

/**
 * The code of a file with every comment, string, template and regular expression blanked to spaces (line breaks kept,
 * so offsets and lines still match the text), and the content of each string by the offset of its opening quote.
 * A call written inside a fixture string or a comment is then not code, and is never read as a test.
 */
export function lex(text: string): { code: string; strings: Map<number, string> } {
  const out = text.split("");
  const strings = new Map<number, string>();
  const blank = (a: number, b: number) => {
    for (let k = a; k < b && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // The last character of code that is not space: a slash after an operator or an opening bracket starts a regular
  // expression, and after a name, a number or a closing bracket it divides.
  let prev = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const e = text.indexOf("\n", i);
      const end = e < 0 ? text.length : e;
      blank(i, end);
      i = end;
    } else if (c === "/" && next === "*") {
      const e = text.indexOf("*/", i + 2);
      const end = e < 0 ? text.length : e + 2;
      blank(i, end);
      i = end;
    } else if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === "`" || text[j] !== "\n")) j += text[j] === "\\" ? 2 : 1;
      strings.set(i, text.slice(i + 1, j));
      blank(i + 1, j);
      i = j + 1;
      prev = "x";
    } else if (c === "/" && (prev === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      let j = i + 1;
      let cls = false;
      while (j < text.length && text[j] !== "\n" && (cls || text[j] !== "/")) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") cls = true;
        else if (text[j] === "]") cls = false;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
      prev = "x";
    } else {
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return { code: out.join(""), strings };
}

const skipSpace = (code: string, at: number) => {
  while (at < code.length && /\s/.test(code[at]!)) at++;
  return at;
};

/** The offset just past the bracket that closes the one before `at`, counting only brackets in code. */
function pastClose(code: string, at: number): number {
  let depth = 1;
  while (at < code.length && depth > 0) {
    if (code[at] === "(") depth++;
    else if (code[at] === ")") depth--;
    at++;
  }
  return at;
}

/** The offset of the brace that closes the one at `at`, counting only braces in code; -1 when none does. */
function closeBrace(code: string, at: number): number {
  let depth = 0;
  for (let k = at; k < code.length; k++) {
    if (code[k] === "{") depth++;
    else if (code[k] === "}" && --depth === 0) return k;
  }
  return -1;
}

/**
 * The tags of an options object that follows a title (From real runs, stage 42): Playwright's
 * `test("title", { tag: "@a" }, ...)` or `{ tag: ["@a", "@b"] }`. `after` is the offset just past the title's closing quote.
 */
function tagsAfter(code: string, strings: Map<number, string>, after: number): string[] {
  let at = skipSpace(code, after);
  if (code[at] !== ",") return [];
  at = skipSpace(code, at + 1);
  if (code[at] !== "{") return [];
  const end = closeBrace(code, at);
  if (end < 0) return [];
  const key = /(?<![\w$])tag\s*:\s*/y;
  for (let k = at + 1; k < end; k++) {
    key.lastIndex = k;
    const m = key.exec(code);
    if (m === null) continue;
    const v = k + m[0].length;
    const one = strings.get(v);
    if (one !== undefined) return [one];
    if (code[v] !== "[") return [];
    const close = code.indexOf("]", v);
    return [...strings].filter(([o]) => o > v && o < close).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  }
  return [];
}

/**
 * Each test declaration of a file: its line, whether it is a describe, its modifiers, its literal title and the tags of
 * its options. Playwright's `test.describe` is a describe (stage 42).
 */
export function declarations(text: string): { line: number; at: number; describe: boolean; modifiers: string; title: string; tags: string[] }[] {
  const { code, strings } = lex(text);
  const out: { line: number; at: number; describe: boolean; modifiers: string; title: string; tags: string[] }[] = [];
  for (const m of code.matchAll(CALL)) {
    let at = m.index + m[0].length;
    // A table first, as each(rows)(title, ...) or each`table`(title, ...): the title is in the call that follows.
    if (m[3] === "`") {
      const table = strings.get(at - 1);
      if (table === undefined) continue;
      at = skipSpace(code, at + table.length + 1);
      if (code[at] !== "(") continue;
      at++;
    } else if (/\.(each|for)\b/.test(m[2]!)) {
      at = skipSpace(code, pastClose(code, at));
      if (code[at] !== "(") continue;
      at++;
    }
    at = skipSpace(code, at);
    const title = strings.get(at);
    if (title === undefined) continue;
    out.push({ line: code.slice(0, at).split("\n").length, at, describe: m[1] === "describe" || /^\.describe\b/.test(m[2]!), modifiers: m[2]!, title, tags: tagsAfter(code, strings, at + title.length + 2) });
  }
  return out;
}

/** A Cucumber step definition: Given, When, Then, And, But, Step or defineStep, called with a string or a regular expression. */
const STEP = /(?<![.\w$])(Given|When|Then|And|But|Step|defineStep)\s*\(/g;
/** jest-cucumber's step functions, read only in a file that loads a feature, where they cannot be anything else (stage 42). */
const LOWER_STEP = /(?<![.\w$])(Given|When|Then|And|But|Step|defineStep|given|when|then|and|but)\s*\(/g;
const LOAD = /(?<![.\w$])loadFeature\s*\(/g;

/**
 * What a step definition matches (stage 42): a Cucumber expression, a regular expression with its flags, or nothing
 * CSH can read (a template with an interpolation, or a regular expression that does not compile), which could match
 * any step.
 */
export type StepPattern = { k: "expression"; text: string } | { k: "vitest"; text: string } | { k: "regex"; source: string; flags: string } | { k: "unreadable"; text: string };

/** A file that imports vitest-cucumber, whose step strings are read in its dialect (From the tutors run, section 4). */
/** Whether a file imports @amiceli/vitest-cucumber: an import or require in its code, not a mention in a comment. */
function importsVitestCucumber(code: string, strings: Map<number, string>): boolean {
  return [...code.matchAll(/\b(?:from|import)\s*|\brequire\(\s*/g)].some((m) => strings.get(m.index + m[0].length) === "@amiceli/vitest-cucumber");
}

/**
 * Each step definition of a file (Cucumber-js style): its line, its literal text and its pattern. A regular
 * expression's text is not kept as a title: the lexer blanks its content, so it cites nothing.
 */
export function stepDefinitions(text: string): { line: number; title: string; pattern: StepPattern }[] {
  const { code, strings } = lex(text);
  const out: { line: number; title: string; pattern: StepPattern }[] = [];
  const loads = new RegExp(LOAD.source).test(code);
  const dialect = importsVitestCucumber(code, strings) ? "vitest" : "expression";
  for (const m of code.matchAll(loads ? LOWER_STEP : STEP)) {
    const at = skipSpace(code, m.index + m[0].length);
    const line = code.slice(0, at).split("\n").length;
    // A bare name as the first argument, with a step function after it, is read when the file declares it as a const
    // string literal (A-209). A call with the name alone, such as jest-when's `when(mockFn)`, is no step definition.
    const named = /^([A-Za-z_$][\w$]*)\s*,/.exec(code.slice(at));
    const raw = strings.get(at) ?? (named !== null ? constString(code, strings, text, named[1]!) : undefined);
    // The literal's value, as the runtime sees it: `'the course\'s'` is the course's (From the tutors run, section 4).
    const str = raw === undefined ? undefined : unescapeJs(raw);
    if (str !== undefined) {
      const pattern: StepPattern = text[at] === "`" && str.includes("${") ? { k: "unreadable", text: str } : { k: dialect, text: str };
      out.push({ line, title: str, pattern });
    } else if (named !== null) {
      out.push({ line, title: "", pattern: { k: "unreadable", text: named[1]! } });
    } else if (code[at] === "/") {
      // The lexer blanks a regular expression's content, so its closing slash is the next one in code.
      const close = code.indexOf("/", at + 1);
      const flags = /^[a-z]*/.exec(code.slice(close + 1))![0];
      const source = text.slice(at + 1, close);
      let pattern: StepPattern;
      try {
        new RegExp(source, flags.replace(/g/g, ""));
        pattern = { k: "regex", source, flags: flags.replace(/g/g, "") };
      } catch {
        pattern = { k: "unreadable", text: `/${source}/${flags}` };
      }
      out.push({ line, title: "", pattern });
    }
  }
  return out;
}

/** A title as it binds a scenario (From the tutors run, section 2): trimmed, its runs of white space one space. */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/** A string literal's escapes read as JavaScript reads them: `\'` is `'`, `\n` a line break, `\\` one backslash. */
export function unescapeJs(raw: string): string {
  const named: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|[\s\S])/g, (_, e: string) => {
    if (e.startsWith("u{")) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (/^[ux]/.test(e) && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^\r?\n$/.test(e)) return "";
    return named[e] ?? e;
  });
}

/** The literal a file declares as `const <name> = "…"`, once, with no interpolation; undefined for any other name. */
function constString(code: string, strings: Map<number, string>, text: string, name: string): string | undefined {
  const found = [...code.matchAll(new RegExp(`(?<![.\\w$])const\\s+${name.replace(/\$/g, "\\$")}\\s*(?::\\s*string\\s*)?=\\s*`, "g"))];
  if (found.length !== 1) return undefined;
  const at = found[0]!.index + found[0]![0].length;
  const value = strings.get(at);
  return value === undefined || (text[at] === "`" && value.includes("${")) ? undefined : value;
}

/**
 * The feature each `loadFeature("path")` of a file names (stage 42): from the repository root, or from the file's own
 * directory when the path climbs out of it with `../`.
 */
export function loadedFeatures(path: string, text: string): { line: number; feature: string }[] {
  const { code, strings } = lex(text);
  const out: { line: number; feature: string }[] = [];
  for (const m of code.matchAll(LOAD)) {
    const at = skipSpace(code, m.index + m[0].length);
    const raw = strings.get(at);
    if (raw === undefined) continue;
    const rel = raw.replace(/\\/g, "/");
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const feature = /^(?:\.\/)*\.\.\//.test(rel) ? posix.normalize(posix.join(dir, rel)) : posix.normalize(rel).replace(/^\.\//, "");
    out.push({ line: code.slice(0, at).split("\n").length, feature });
  }
  return out;
}

/** A step pattern as an item attribute: one definition per line, `line<TAB>kind<TAB>text` (stage 42). */
function encodeStep(d: { line: number; pattern: StepPattern }): string {
  const p = d.pattern;
  const body = p.k === "regex" ? `${p.flags}/${p.source}` : p.text;
  return `${d.line}\t${p.k}\t${body.replace(/[\t\n\r]/g, " ")}`;
}

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * The grain of a test (Analyse, danger and grain, section 4; stage 57): the identifiers its body mentions, from the
 * code with comments and strings blanked, and each string literal in the body that is itself a single identifier (a
 * value such as `"in_progress"` that the test compares, where prose such as a title is not). A TypeScript test's body is
 * its call, to the parenthesis that closes it, so a describe's body holds its tests; in the other languages a body runs
 * from where the test is named to where the next test is declared, or to the end of the file (A-196).
 */
export function observedIn(code: string, from: number, to: number, strings?: Map<number, string>): string[] {
  const out = new Set(code.slice(from, to).match(IDENTIFIER) ?? []);
  for (const [at, value] of strings ?? []) if (at >= from && at < to && VALUE.test(value)) out.add(value);
  return [...out].sort(compareCodePoints);
}

/** A string literal that is a single identifier: a value, not prose. */
const VALUE = /^[A-Za-z_][\w-]*$/;

/** The offset where the body of the test named at `at` ends: the next declaration after it, or the end of the file. */
function bodyEnd(declared: number[], at: number, end: number): number {
  return declared.find((d) => d > at) ?? end;
}

/** Add a test's citation, or widen the grain of the file's citation of the same item when another test cites it. */
function citeWith(edges: ItemEdge[], byTarget: Map<string, ItemEdge>, edge: ItemEdge): void {
  const seen = byTarget.get(edge.to);
  if (seen === undefined) {
    byTarget.set(edge.to, edge);
    edges.push(edge);
    return;
  }
  if (seen.observes !== undefined && edge.observes !== undefined) seen.observes = [...new Set([...seen.observes, ...edge.observes])].sort(compareCodePoints);
}

export function run(input: AdapterInput): AdapterOutput {
  const pattern = input.config?.citePattern ?? idPatternOf(input);
  const id = new RegExp(`\\b(?:${pattern})\\b`, "g");
  // In a Python, Java, Go or Rust test's name, an underscore stands for a hyphen (test_REQ_12 cites REQ-12), but only
  // when the identifier pattern cannot hold an underscore itself; otherwise the name is read as written (A-128).
  const hyphenate = underscoreFree(pattern);
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  // style: "cucumber" reads step definitions too: they are not tests, so they are counted as steps, and a file of
  // steps alone declares no test but is not an empty one. Identifiers in a step's text cite, as in a test title.
  const cucumber = input.config?.style === "cucumber";
  const citeBodies = input.config?.citeBodies === "true";
  for (const file of sortedFiles(input)) {
    if (isLayout(file.path)) continue;
    const text = decode(file.bytes);
    const lang = languageOf(file.path);
    if (lang !== undefined) {
      const found = inventory(text, lang, file.path);
      const starts = lineStarts(text);
      const { code, strings: literals } = lexOther(text, lang);
      const declared = found.declared.map((d) => d.at).sort((a, b) => a - b);
      const byTarget = new Map<string, ItemEdge>();
      // A text's grain is the body of each test it is about: its own, or each test of the class it annotates (A-196).
      const grainOf = (at: number, of?: number[]) => [...new Set((of ?? [at]).flatMap((d) => observedIn(code, d, bodyEnd(declared, d, code.length), literals)))].sort(compareCodePoints);
      const cite = (value: string, at: number, of?: number[]) => {
        for (const c of value.matchAll(id)) {
          const observes = grainOf(at, of);
          citeWith(edges, byTarget, { from: file.path, rel: "cites", to: c[0], span: `${file.path}:${lineIndex(starts, at) + 1}`, observes, reader: lang });
        }
      };
      for (const s of found.sources) cite(s.name && hyphenate ? s.text.replace(/_/g, "-") : s.text, s.at, s.of);
      if (citeBodies) for (const [at, value] of found.strings) cite(value, at);
      const attrs: Record<string, string> = { tests: String(found.tests) };
      if (found.skipped > 0) attrs.skipped = String(found.skipped);
      // style: "cucumber" reads behave, Cucumber-JVM, godog and cucumber-rs step definitions too (stage 59).
      const defs = cucumber ? stepDefinitionsOther(text, lang) : [];
      if (defs.length > 0) {
        attrs.steps = String(defs.length);
        attrs.stepDefinitions = defs.map(encodeStep).join("\n");
        const cited = new Set(edges.filter((e) => e.from === file.path).map((e) => e.to));
        for (const d of defs) {
          for (const c of d.title.matchAll(id)) {
            if (cited.has(c[0])) continue;
            cited.add(c[0]);
            edges.push({ from: file.path, rel: "cites", to: c[0], span: `${file.path}:${d.line}` });
          }
        }
      }
      items.push({ id: file.path, kind: "test-file", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text), attrs });
      if (found.tests === 0 && defs.length === 0) diagnostics.push({ code: "no-tests", severity: "info", message: `${file.path} declares no test its runner would collect`, span: file.path });
      continue;
    }
    let steps = 0;
    let tests = 0;
    let skipped = 0;
    const cited = new Set<string>();
    const byTarget = new Map<string, ItemEdge>();
    const decls = declarations(text);
    const { code: tsCode, strings: tsStrings } = lex(text);
    for (const d of decls) {
      if (!d.describe) tests++;
      if (/\.(skip|todo)\b/.test(d.modifiers)) skipped++;
      // A tag is matched as written and, when that finds nothing, upper-cased: `@rule-0001` cites RULE-0001 (A-152).
      const tagged = d.tags.flatMap((t) => {
        const as = [...t.matchAll(id)].map((c) => c[0]);
        return as.length > 0 ? as : [...t.toUpperCase().matchAll(id)].map((c) => c[0]);
      });
      for (const c of [...[...d.title.matchAll(id)].map((x) => x[0]), ...tagged]) {
        cited.add(c);
        citeWith(edges, byTarget, { from: file.path, rel: "cites", to: c, span: `${file.path}:${d.line}`, observes: observedIn(tsCode, d.at, pastClose(tsCode, d.at), tsStrings), reader: "typescript" });
      }
    }
    // citeBodies: an identifier in any string literal of the file cites, not only one in a title (a test that loops over a
    // list of mutants or rules names each in data). Comments still cite nothing.
    if (citeBodies) {
      for (const [at, value] of lex(text).strings) {
        for (const c of value.matchAll(id)) {
          if (cited.has(c[0])) continue;
          cited.add(c[0]);
          edges.push({ from: file.path, rel: "cites", to: c[0], span: `${file.path}:${text.slice(0, at).split("\n").length}` });
        }
      }
    }
    const defs: string[] = [];
    if (cucumber) {
      for (const f of loadedFeatures(file.path, text)) edges.push({ from: file.path, rel: "loads", to: f.feature, span: `${file.path}:${f.line}` });
      for (const d of stepDefinitions(text)) {
        steps++;
        defs.push(encodeStep(d));
        for (const c of d.title.matchAll(id)) {
          if (cited.has(c[0])) continue;
          cited.add(c[0]);
          edges.push({ from: file.path, rel: "cites", to: c[0], span: `${file.path}:${d.line}` });
        }
      }
    }
    const attrs: Record<string, string> = { tests: String(tests) };
    // The literal titles of its tests, by which a scenario of the same title is bound (From the tutors run, section 2).
    // A skipped or todo test runs nothing, so it binds nothing. A title is read as its value, as a step string is.
    const titles = [...new Set(decls.filter((d) => !d.describe && !/\.(skip|todo)\b/.test(d.modifiers) && d.title.trim() !== "").map((d) => titleKey(unescapeJs(d.title))))];
    if (titles.length > 0) attrs.titles = titles.join("\n");
    if (steps > 0) attrs.steps = String(steps);
    if (defs.length > 0) attrs.stepDefinitions = defs.join("\n");
    if (skipped > 0) attrs.skipped = String(skipped);
    items.push({ id: file.path, kind: "test-file", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text), attrs });
    if (tests === 0 && steps === 0) diagnostics.push({ code: "no-tests", severity: "info", message: `${file.path} declares no it or test call with a literal title`, span: file.path });
  }
  if (input.executions === undefined) return { items, edges, diagnostics };
  const results = joinResults(input, items, id, diagnostics, hyphenate);
  return { items, edges, diagnostics, results };
}

/**
 * The file of the source a runner's file name is: the same path, or the longest item path that ends the runner's
 * (runners write absolute paths, or paths from their own root), so `packages/x/test/a.test.ts` wins over
 * `test/a.test.ts`. Undefined when none matches, or two of the longest length do.
 */
export function fileOf(name: string, paths: string[]): string | undefined {
  const n = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (paths.includes(n)) return n;
  const ends = paths.filter((p) => n.endsWith(`/${p}`)).sort((a, b) => b.length - a.length);
  return ends.length > 0 && (ends.length === 1 || ends[1]!.length < ends[0]!.length) ? ends[0] : undefined;
}

/** Each test the results files report, joined to its file and to the identifiers its full name cites (A-115). */
function joinResults(input: AdapterInput, items: SourceItem[], id: RegExp, diagnostics: Diagnostic[], hyphenate: boolean): TestResult[] {
  const paths = items.map((i) => i.id);
  // A runner that names a class, a package or a test binary is joined by what the source's files declare (stage 35),
  // read only when a result names no file of the source by path.
  let declared: ((runnerFile: string, name: string) => Join) | undefined;
  const byDeclaration = (runnerFile: string, name: string) => {
    declared ??= joiner(sortedFiles(input).filter((f) => isLayout(f.path) || languageOf(f.path) !== undefined).map((f) => ({ path: f.path, text: decode(f.bytes) })));
    return declared(runnerFile, name);
  };
  const results: TestResult[] = [];
  const unmatched = new Map<string, number>();
  const ambiguous = new Map<string, number>();
  const counts = new Map<string, Record<TestOutcome, number>>();
  for (const f of input.executions ?? []) {
    const parsed = parseTestResults(decode(f.bytes));
    for (const p of parsed.problems) diagnostics.push({ code: "malformed-results", severity: "error", message: p.message, span: `${f.path}:${p.line}` });
    // Results from another commit say nothing of this one: a reduced file names its commit, and is joined only at it.
    if (parsed.commit !== undefined && input.config?.commit !== undefined && parsed.commit !== input.config.commit) {
      diagnostics.push({ code: "results-other-commit", severity: "warning", message: `the results are of ${parsed.commit.slice(0, 7)}, not ${input.config.commit.slice(0, 7)}: none is joined`, span: f.path });
      continue;
    }
    for (const r of parsed.results) {
      let file = fileOf(r.file, paths);
      if (file === undefined) {
        const j = byDeclaration(r.file, r.name);
        if (j !== undefined && "file" in j) file = j.file;
        else {
          unmatched.set(r.file, (unmatched.get(r.file) ?? 0) + 1);
          if (j !== undefined) ambiguous.set(r.file, (ambiguous.get(r.file) ?? 0) + 1);
          continue;
        }
      }
      // A Python, Java, Go or Rust runner reports the function's name, so it is read as the inventory reads that name.
      const names = hyphenate && languageOf(file) !== undefined ? [r.name, runnerName(r.name)] : [r.name];
      const cites = r.cites ?? [...new Set(names.flatMap((n) => [...n.matchAll(id)].map((m) => m[0])))].sort();
      results.push({ file, outcome: r.outcome, cites, span: /^\d+$/.test(r.at) ? `${f.path}:${r.at}` : `${f.path}#${r.at}` });
      const c = counts.get(file) ?? { passed: 0, failed: 0, errored: 0, skipped: 0 };
      c[r.outcome]++;
      counts.set(file, c);
    }
  }
  if ((input.executions ?? []).length === 0) diagnostics.push({ code: "no-results", severity: "info", message: "the practice names a results file and none was found: every test's outcome is unknown" });
  // A runner's file outside the source is reported once, by count, never by name: names can be anything.
  // A class, package or test binary that more than one test file declares is not joined to any, and is said apart.
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const twice = ambiguous.size > 0 ? `; ${sum(ambiguous)} results in ${ambiguous.size} of them name a class, package or test that more than one test file declares, and are not joined` : "";
  if (unmatched.size > 0) diagnostics.push({ code: "results-unmatched", severity: "info", message: `${sum(unmatched)} results in ${unmatched.size} files name no test file of the source${twice}` });
  const unrun: string[] = [];
  for (const it of items) {
    const c = counts.get(it.id);
    if (c === undefined) {
      if ((input.executions ?? []).length > 0 && it.attrs?.tests !== "0") unrun.push(it.id);
      continue;
    }
    // The runner's counts, zeros too, replace what the declarations said: `skipped` is then what the runner skipped.
    it.attrs = { ...(it.attrs ?? {}), ...Object.fromEntries(Object.entries(c).map(([k, n]) => [k, String(n)])) };
  }
  // The files are named, the first ten in code-point order, so the reader can tell a join that failed from a file
  // that was left out of the run (A-174).
  if (unrun.length > 0) {
    const named = [...unrun].sort(compareCodePoints);
    const list = named.slice(0, 10).join(", ") + (named.length > 10 ? ` and ${named.length - 10} more` : "");
    diagnostics.push({ code: "results-missing", severity: "info", message: `${unrun.length} test files declare tests and have no result: their outcomes are unknown (${list})` });
  }
  return results;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
