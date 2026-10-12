// The test-file inventory adapter (Ingesting a codebase, stage 22). Each test file is one item, with the number of
// tests it declares. An identifier in the title of a describe, it or test call cites that identifier: the title is
// what the runner reports, so it is what a reader of a failure sees. Identifiers elsewhere in the file, in data or
// comments, cite nothing. The file is read as text and never run: a small lexer tells comments, strings and regular
// expressions from code, so a test written inside a fixture string is not a test. The runner's results, when the
// practice names a results file (stage 26), are joined to each file and to the identifiers each test's full name cites;
// they are counted, and never decide anything.
import { digestOf } from "@csh/kernel";
import { type Adapter, type AdapterInput, type AdapterOutput, type Diagnostic, type ItemEdge, parseTestResults, type SourceItem, type TestOutcome, type TestResult } from "@csh/witness";
import { decode, idPatternOf, sortedFiles } from "./common.ts";

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

/** Each test declaration of a file: its line, whether it is a describe, its modifiers and its literal title. */
export function declarations(text: string): { line: number; describe: boolean; modifiers: string; title: string }[] {
  const { code, strings } = lex(text);
  const out: { line: number; describe: boolean; modifiers: string; title: string }[] = [];
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
    out.push({ line: code.slice(0, at).split("\n").length, describe: m[1] === "describe", modifiers: m[2]!, title });
  }
  return out;
}

/** A Cucumber step definition: Given, When, Then, And, But, Step or defineStep, called with a string or a regular expression. */
const STEP = /(?<![.\w$])(Given|When|Then|And|But|Step|defineStep)\s*\(/g;

/**
 * Each step definition of a file (Cucumber-js style): its line and its literal text. A regular expression is a step
 * whose text is not kept: the lexer blanks its content, so it cites nothing.
 */
export function stepDefinitions(text: string): { line: number; title: string }[] {
  const { code, strings } = lex(text);
  const out: { line: number; title: string }[] = [];
  for (const m of code.matchAll(STEP)) {
    const at = skipSpace(code, m.index + m[0].length);
    const title = strings.get(at) ?? (code[at] === "/" ? "" : undefined);
    if (title === undefined) continue;
    out.push({ line: code.slice(0, at).split("\n").length, title });
  }
  return out;
}

export function run(input: AdapterInput): AdapterOutput {
  const id = new RegExp(`\\b(?:${input.config?.citePattern ?? idPatternOf(input)})\\b`, "g");
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  // style: "cucumber" reads step definitions too: they are not tests, so they are counted as steps, and a file of
  // steps alone declares no test but is not an empty one. Identifiers in a step's text cite, as in a test title.
  const cucumber = input.config?.style === "cucumber";
  const citeBodies = input.config?.citeBodies === "true";
  for (const file of sortedFiles(input)) {
    const text = decode(file.bytes);
    let steps = 0;
    let tests = 0;
    let skipped = 0;
    const cited = new Set<string>();
    for (const d of declarations(text)) {
      if (!d.describe) tests++;
      if (/\.(skip|todo)\b/.test(d.modifiers)) skipped++;
      for (const c of d.title.matchAll(id)) {
        if (cited.has(c[0])) continue;
        cited.add(c[0]);
        edges.push({ from: file.path, rel: "cites", to: c[0], span: `${file.path}:${d.line}` });
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
    if (cucumber) {
      for (const d of stepDefinitions(text)) {
        steps++;
        for (const c of d.title.matchAll(id)) {
          if (cited.has(c[0])) continue;
          cited.add(c[0]);
          edges.push({ from: file.path, rel: "cites", to: c[0], span: `${file.path}:${d.line}` });
        }
      }
    }
    const attrs: Record<string, string> = { tests: String(tests) };
    if (steps > 0) attrs.steps = String(steps);
    if (skipped > 0) attrs.skipped = String(skipped);
    items.push({ id: file.path, kind: "test-file", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text), attrs });
    if (tests === 0 && steps === 0) diagnostics.push({ code: "no-tests", severity: "info", message: `${file.path} declares no it or test call with a literal title`, span: file.path });
  }
  if (input.executions === undefined) return { items, edges, diagnostics };
  const results = joinResults(input, items, id, diagnostics);
  return { items, edges, diagnostics, results };
}

/**
 * The file of the source a runner's file name is: the same path, or the longest item path that ends the runner's
 * (runners write absolute paths, or paths from their own root), so `packages/x/test/a.test.ts` wins over
 * `test/a.test.ts`. Undefined when none matches, or two of the longest length do.
 */
function fileOf(name: string, paths: string[]): string | undefined {
  const n = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (paths.includes(n)) return n;
  const ends = paths.filter((p) => n.endsWith(`/${p}`)).sort((a, b) => b.length - a.length);
  return ends.length > 0 && (ends.length === 1 || ends[1]!.length < ends[0]!.length) ? ends[0] : undefined;
}

/** Each test the results files report, joined to its file and to the identifiers its full name cites (A-115). */
function joinResults(input: AdapterInput, items: SourceItem[], id: RegExp, diagnostics: Diagnostic[]): TestResult[] {
  const paths = items.map((i) => i.id);
  const results: TestResult[] = [];
  const unmatched = new Map<string, number>();
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
      const file = fileOf(r.file, paths);
      if (file === undefined) {
        unmatched.set(r.file, (unmatched.get(r.file) ?? 0) + 1);
        continue;
      }
      const cites = r.cites ?? [...new Set([...r.name.matchAll(id)].map((m) => m[0]))].sort();
      results.push({ file, outcome: r.outcome, cites, span: /^\d+$/.test(r.at) ? `${f.path}:${r.at}` : `${f.path}#${r.at}` });
      const c = counts.get(file) ?? { passed: 0, failed: 0, errored: 0, skipped: 0 };
      c[r.outcome]++;
      counts.set(file, c);
    }
  }
  if ((input.executions ?? []).length === 0) diagnostics.push({ code: "no-results", severity: "info", message: "the practice names a results file and none was found: every test's outcome is unknown" });
  // A runner's file outside the source is reported once, by count, never by name: names can be anything.
  if (unmatched.size > 0) diagnostics.push({ code: "results-unmatched", severity: "info", message: `${[...unmatched.values()].reduce((a, b) => a + b, 0)} results in ${unmatched.size} files name no test file of the source` });
  let unrun = 0;
  for (const it of items) {
    const c = counts.get(it.id);
    if (c === undefined) {
      if ((input.executions ?? []).length > 0 && it.attrs?.tests !== "0") unrun++;
      continue;
    }
    // The runner's counts, zeros too, replace what the declarations said: `skipped` is then what the runner skipped.
    it.attrs = { ...(it.attrs ?? {}), ...Object.fromEntries(Object.entries(c).map(([k, n]) => [k, String(n)])) };
  }
  if (unrun > 0) diagnostics.push({ code: "results-missing", severity: "info", message: `${unrun} test files declare tests and have no result: their outcomes are unknown` });
  return results;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
