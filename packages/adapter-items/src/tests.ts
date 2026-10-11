// The test-file inventory adapter (Ingesting a codebase, stage 22). Each test file is one item, with the number of
// tests it declares. An identifier in the title of a describe, it or test call cites that identifier: the title is
// what the runner reports, so it is what a reader of a failure sees. Identifiers elsewhere in the file, in data or
// comments, cite nothing. The file is read as text and never run: a small lexer tells comments, strings and regular
// expressions from code, so a test written inside a fixture string is not a test. The runner's results are stage 26's.
import { digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic, ItemEdge, SourceItem } from "@csh/witness";
import { decode, idPatternOf, sortedFiles } from "./common.ts";

export const manifest = {
  id: "csh.adapter.items.tests",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items", "edges"],
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

export function run(input: AdapterInput): AdapterOutput {
  const id = new RegExp(`\\b(?:${input.config?.citePattern ?? idPatternOf(input)})\\b`, "g");
  const items: SourceItem[] = [];
  const edges: ItemEdge[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const file of sortedFiles(input)) {
    const text = decode(file.bytes);
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
    const attrs: Record<string, string> = { tests: String(tests) };
    if (skipped > 0) attrs.skipped = String(skipped);
    items.push({ id: file.path, kind: "test-file", text: file.path, span: `${file.path}:1`, textDigest: digestOf(text), attrs });
    if (tests === 0) diagnostics.push({ code: "no-tests", severity: "info", message: `${file.path} declares no it or test call with a literal title`, span: file.path });
  }
  return { items, edges, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
