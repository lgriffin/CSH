// pytest-bdd (From the Toads run, sections 2 and 3; stage 62): how a Python test module binds scenarios, and the step
// definitions it registers, read from the code with nothing run. pytest-bdd runs a scenario only when a module binds it,
// with `scenarios(...)` for every scenario of a feature file or `@scenario(file, title)` for one; its steps are the
// functions `@given`, `@when`, `@then` and `@step` decorate, each with a plain string or a parser.
import type { StepPattern } from "./tests.ts";
import { lexOther, lineIndex, lineStarts } from "./tests-other.ts";

/** A Python string literal's content as Python reads it, unless it is raw. */
export function unescapePython(raw: string): string {
  const named: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", a: "\x07", b: "\b", f: "\f", v: "\v" };
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|[\s\S])/g, (_, e: string) => {
    if (/^[ux]/.test(e) && e.length > 1) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^\r?\n$/.test(e)) return "";
    return named[e] ?? (/["'\\]/.test(e) ? e : `\\${e}`);
  });
}

/** The names a file imports from pytest_bdd (and pytest_bdd.parsers), by the name the file uses: alias to original. */
export function pytestBddImports(code: string): { names: Map<string, string>; parsers: Map<string, string>; module: string[] } | undefined {
  const names = new Map<string, string>();
  const parsers = new Map<string, string>();
  const module: string[] = [];
  let found = false;
  for (const m of code.matchAll(/^[ \t]*from\s+pytest_bdd(\.parsers)?\s+import\s+(\([^)]*\)|[^\n]*)/gm)) {
    found = true;
    for (const part of m[2]!.replace(/[()]/g, " ").split(",")) {
      const p = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (p !== null) (m[1] !== undefined ? parsers : names).set(p[2] ?? p[1]!, p[1]!);
    }
  }
  for (const m of code.matchAll(/^[ \t]*import\s+pytest_bdd(?:\s+as\s+(\w+))?\s*$/gm)) {
    found = true;
    module.push(m[1] ?? "pytest_bdd");
  }
  return found ? { names, parsers, module } : undefined;
}

/** The string a literal argument at `at` writes: one literal, or adjacent literals joined, with its end; undefined for any other expression. */
export function literalAt(text: string, code: string, strings: Map<number, string>, at: number): { value: string; end: number } | undefined {
  let value = "";
  let i = at;
  let any = false;
  for (;;) {
    while (i < code.length && /\s/.test(code[i]!)) i++;
    const prefix = /^[rRbBuUfF]{0,2}(?=["'])/.exec(code.slice(i, i + 3))?.[0];
    if (prefix === undefined) break;
    const q = i + prefix.length;
    const raw = strings.get(q);
    if (raw === undefined) break;
    // An f-string with a field is computed.
    if (/[fF]/.test(prefix) && /\{[^{]/.test(raw.replace(/\{\{/g, ""))) return undefined;
    value += /[rR]/.test(prefix) ? raw : unescapePython(raw);
    any = true;
    const quote = text.startsWith(text[q]!.repeat(3), q) ? 3 : 1;
    i = q + quote + raw.length + quote;
  }
  if (!any) return undefined;
  return { value, end: i };
}

/** The offset of the comma that ends the argument starting at `at`, or of the call's closing parenthesis. */
function argumentEnd(code: string, at: number): number {
  let depth = 0;
  for (let i = at; i < code.length; i++) {
    const c = code[i]!;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return i;
      depth--;
    } else if (c === "," && depth === 0) return i;
  }
  return code.length;
}

const skip = (code: string, at: number) => {
  while (at < code.length && /\s/.test(code[at]!)) at++;
  return at;
};

export interface Bindings {
  /** Feature files `scenarios(...)` names by a literal, as written. */
  features: string[];
  /** For a computed `scenarios(...)`: the file's literals that may name a feature file by its base name. */
  named: string[];
  /** Titles `scenario(file, title)` binds by a literal. */
  titles: string[];
  /** For a computed title: the file's literals that name a `.feature` file, whose scenarios may be bound. */
  undecided: string[];
  /** Whether the file binds anything, so that its tests are generated. */
  binds: boolean;
}

/** What a Python test file binds through pytest-bdd; undefined when it does not import pytest_bdd. */
export function pytestBddBindings(text: string): Bindings | undefined {
  const { code, strings } = lexOther(text, "python");
  const imports = pytestBddImports(code);
  if (imports === undefined) return undefined;
  const callee = (orig: string) => [...[...imports.names].filter(([, o]) => o === orig).map(([alias]) => alias), ...imports.module.map((m) => `${m}.${orig}`)];
  const out: Bindings = { features: [], named: [], titles: [], undecided: [], binds: false };
  // Every literal of the file, read once: candidates for a computed call.
  const literals: string[] = [];
  for (const [at] of strings) {
    const l = literalAt(text, code, strings, /[rRbBuUfF]/.test(code[at - 1] ?? "") ? at - 1 : at);
    if (l !== undefined) literals.push(l.value);
  }
  const call = (names: string[]) => (names.length === 0 ? [] : [...code.matchAll(new RegExp(`(?<![\\w.])(?:${names.map((n) => n.replace(/\./g, "\\.")).join("|")})\\s*\\(`, "g"))].filter((m) => !/\bdef\s+$/.test(code.slice(Math.max(0, m.index - 8), m.index))));
  for (const m of call(callee("scenarios"))) {
    out.binds = true;
    const open = m.index + m[0].length;
    const close = argumentEndAll(code, open);
    const named = [...strings].filter(([at]) => at >= open && at < close).map(([at, v]) => ({ v, f: /[fF]/.test(code[at - 1] ?? "") }));
    const feats = named.filter((x) => !x.f && /\.feature$/.test(x.v)).map((x) => x.v);
    if (feats.length > 0) out.features.push(...feats);
    else out.named.push(...literals.filter((l) => /^[\w.-]+$/.test(l)).map((l) => l.replace(/\.feature$/, "")));
  }
  for (const m of call(callee("scenario"))) {
    out.binds = true;
    const first = skip(code, m.index + m[0].length);
    const comma = argumentEnd(code, first);
    const title = code[comma] === "," ? literalAt(text, code, strings, comma + 1) : undefined;
    const after = title === undefined ? undefined : skip(code, title.end);
    if (title !== undefined && (code[after!] === "," || code[after!] === ")")) out.titles.push(title.value.trim().replace(/\s+/g, " "));
    else out.undecided.push(...literals.filter((l) => /\.feature$/.test(l)));
  }
  for (const k of ["features", "named", "titles", "undecided"] as const) out[k] = [...new Set(out[k])].sort();
  return out;
}

/** The offset of the parenthesis that closes the call whose arguments start at `at`. */
function argumentEndAll(code: string, at: number): number {
  let depth = 0;
  for (let i = at; i < code.length; i++) {
    const c = code[i]!;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return code.length;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** A parse or cfparse format as a regular expression: a field matches anything, everything else is literal (A-202). */
function parseFormat(text: string): string {
  return text
    .split(/(\{\{|\}\}|\{[^{}]*\})/)
    .map((p) => (p === "{{" ? "\\{" : p === "}}" ? "\\}" : p.startsWith("{") && p.endsWith("}") ? "(.*)" : escapeRegex(p)))
    .join("");
}

/** A Python regular expression in JavaScript's syntax: named groups and their back references. */
function pythonRegex(source: string): string {
  return source.replace(/\(\?P<(\w+)>/g, "(?<$1>").replace(/\(\?P=(\w+)\)/g, "\\k<$1>");
}

const compiles = (source: string): boolean => {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
};

/**
 * pytest-bdd's step definitions (A-217): `given`, `when`, `then` and `step` as the file imports them from pytest_bdd,
 * with a plain string (or `parsers.string`) matched exactly, `parsers.parse` and `parsers.cfparse` read as a parse
 * format, and `parsers.re` a regular expression over the whole step. Anything else is unreadable.
 */
export function pytestBddSteps(text: string): { line: number; title: string; pattern: StepPattern }[] {
  const { code, strings } = lexOther(text, "python");
  const imports = pytestBddImports(code);
  if (imports === undefined) return [];
  const starts = lineStarts(text);
  const line = (at: number) => lineIndex(starts, at) + 1;
  const steps = [...imports.names].filter(([, o]) => ["given", "when", "then", "step"].includes(o)).map(([alias]) => alias);
  const decorators = [...steps, ...imports.module.flatMap((m) => ["given", "when", "then", "step"].map((s) => `${m}.${s}`))];
  if (decorators.length === 0) return [];
  // A parser, written as parsers.x (the module imported from pytest_bdd), pytest_bdd.parsers.x, or a name imported from pytest_bdd.parsers.
  const parserModules = [...[...imports.names].filter(([, o]) => o === "parsers").map(([a]) => a), ...imports.module.map((m) => `${m}.parsers`)];
  const parserOf = (at: number): { kind: string; open: number } | undefined => {
    const m = /^([\w.]+)\s*\(/.exec(code.slice(at));
    if (m === null) return undefined;
    const name = m[1]!;
    const dot = name.lastIndexOf(".");
    const kind = dot >= 0 && parserModules.includes(name.slice(0, dot)) ? name.slice(dot + 1) : imports.parsers.get(name);
    return kind === undefined ? undefined : { kind, open: at + m[0].length };
  };
  const out: { line: number; title: string; pattern: StepPattern }[] = [];
  const re = new RegExp(`@\\s*(?:${decorators.map((d) => d.replace(/\./g, "\\.")).join("|")})\\s*\\(`, "g");
  for (const m of code.matchAll(re)) {
    const at = skip(code, m.index + m[0].length);
    const unreadable = () => out.push({ line: line(m.index), title: "", pattern: { k: "unreadable", text: text.slice(m.index, text.indexOf("\n", m.index) < 0 ? undefined : text.indexOf("\n", m.index)).trim() } });
    const ends = (i: number) => code[skip(code, i)] === "," || code[skip(code, i)] === ")";
    const plain = literalAt(text, code, strings, at);
    if (plain !== undefined) {
      if (!ends(plain.end)) unreadable();
      else out.push({ line: line(at), title: plain.value, pattern: { k: "regex", source: `^${escapeRegex(plain.value)}$`, flags: "" } });
      continue;
    }
    const parser = parserOf(at);
    const lit = parser === undefined ? undefined : literalAt(text, code, strings, skip(code, parser.open));
    if (parser === undefined || lit === undefined || code[skip(code, lit.end)] !== ")" || !ends(skip(code, lit.end) + 1)) {
      unreadable();
      continue;
    }
    const source = parser.kind === "string" ? `^${escapeRegex(lit.value)}$` : parser.kind === "parse" || parser.kind === "cfparse" ? `^${parseFormat(lit.value)}$` : parser.kind === "re" ? `^(?:${pythonRegex(lit.value)})$` : undefined;
    if (source === undefined || !compiles(source)) {
      unreadable();
      continue;
    }
    out.push({ line: line(at), title: parser.kind === "re" ? "" : lit.value, pattern: { k: "regex", source, flags: "" } });
  }
  return out.sort((a, b) => a.line - b.line);
}
