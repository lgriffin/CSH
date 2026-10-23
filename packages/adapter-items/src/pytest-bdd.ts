// pytest-bdd (From the Toads run, sections 2 and 3; stage 62): how a Python test module binds scenarios, and the step
// definitions it registers, read from the code with nothing run. pytest-bdd runs a scenario only when a module binds it,
// with `scenarios(...)` for every scenario of a feature file or `@scenario(file, title)` for one; its steps are the
// functions `@given`, `@when`, `@then` and `@step` decorate, each with a plain string or a parser.
import type { StepPattern } from "./tests.ts";
import { lexOther, lineIndex, lineStarts } from "./tests-other.ts";

/** A Python string literal's content as Python reads it, unless it is raw; undefined for a `\N{name}` escape, which needs Unicode's names. */
export function unescapePython(raw: string): string | undefined {
  const named: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", a: "\x07", b: "\b", f: "\f", v: "\v" };
  if (/(?<!\\)(?:\\\\)*\\N\{/.test(raw)) return undefined;
  return raw.replace(/\\(U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|[\s\S])/g, (_, e: string) => {
    if (/^[uxU]/.test(e) && e.length > 1) return parseInt(e.slice(1), 16) <= 0x10ffff ? String.fromCodePoint(parseInt(e.slice(1), 16)) : `\\${e}`;
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
  for (const m of code.matchAll(/^[ \t]*import\s+([^\n]*)/gm)) {
    for (const part of m[1]!.split(",")) {
      const p = /^\s*pytest_bdd(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (p === null) continue;
      found = true;
      module.push(p[1] ?? "pytest_bdd");
    }
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
    const read = /[rR]/.test(prefix) ? raw : unescapePython(raw);
    if (read === undefined) return undefined;
    value += read;
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
  /** Directories `scenarios(...)` names by an argument that is one literal, every feature file under which it binds. */
  dirs: string[];
  /** For a computed `scenarios(...)`: the file's literals that may name a feature file by its base name. */
  named: string[];
  /** `scenario(file, title)` with both literal: the feature file as written, a tab, and the title. */
  pairs: string[];
  /** Titles `scenario(file, title)` binds by a literal, where the feature file is computed. */
  titles: string[];
  /** For a binding CSH cannot read, or one in a function that may never be called: the feature files it may bind. */
  undecided: string[];
  /** Whether the file binds anything, so that its tests are generated. */
  binds: boolean;
}

/** The offset where the string whose quote is at `q` starts, its prefix (`r`, `f`, `fr`, …) included. */
function prefixStart(code: string, q: number): number {
  let i = q;
  while (i > q - 2 && /[rRbBuUfF]/.test(code[i - 1] ?? "")) i--;
  return /\w/.test(code[i - 1] ?? "") ? q : i;
}

/** The literals of the code from `open` to `close`, adjacent ones joined: each value, undefined when it is computed, and whether it is all its argument. */
function literalsIn(text: string, code: string, strings: Map<number, string>, open: number, close: number): { value: string | undefined; whole: boolean }[] {
  const out: { value: string | undefined; whole: boolean }[] = [];
  let past = open;
  for (const [q] of [...strings].filter(([at]) => at >= open && at < close).sort((x, y) => x[0] - y[0])) {
    if (q < past) continue;
    const start = prefixStart(code, q);
    const l = literalAt(text, code, strings, start);
    let end = l?.end;
    if (end === undefined) {
      const raw = strings.get(q)!;
      const quote = text.startsWith(text[q]!.repeat(3), q) ? 3 : 1;
      end = q + quote + raw.length + quote;
    }
    past = end;
    // All its argument: at the call's own depth, after its "(" or a ",", and before a "," or its ")".
    const before = code.slice(open, start);
    const depth = (before.match(/[([{]/g) ?? []).length - (before.match(/[)\]}]/g) ?? []).length;
    const whole = depth === 0 && /(?:^|,)\s*$/.test(before) && /[,)]/.test(code[skip(code, end)] ?? "");
    out.push({ value: l?.value, whole });
  }
  return out;
}

/** Whether the code at `at` is in the body of a function, which runs only when something calls it. */
function inFunction(code: string, at: number): boolean {
  const lines = code.slice(0, at).split("\n");
  const indent = (l: string) => /^[ \t]*/.exec(l)![0].length;
  let level = indent(lines[lines.length - 1]!);
  for (let i = lines.length - 2; i >= 0 && level > 0; i--) {
    const l = lines[i]!;
    if (l.trim() === "" || indent(l) >= level) continue;
    if (/^[ \t]*(?:async\s+)?def\b/.test(l)) return true;
    level = indent(l);
  }
  return false;
}

/** What a Python test file binds through pytest-bdd; undefined when it does not import pytest_bdd. */
export function pytestBddBindings(text: string): Bindings | undefined {
  const { code, strings } = lexOther(text, "python");
  const imports = pytestBddImports(code);
  if (imports === undefined) return undefined;
  const callee = (orig: string) => [...[...imports.names].filter(([, o]) => o === orig).map(([alias]) => alias), ...imports.module.map((m) => `${m}.${orig}`)];
  const out: Bindings = { features: [], dirs: [], named: [], pairs: [], titles: [], undecided: [], binds: false };
  // Every literal of the file, read once: candidates for a computed call.
  const literals = literalsIn(text, code, strings, 0, code.length).flatMap((l) => (l.value === undefined ? [] : [l.value]));
  const featureLiterals = literals.filter((l) => /\.feature$/.test(l));
  const call = (names: string[]) => (names.length === 0 ? [] : [...code.matchAll(new RegExp(`(?<![\\w.])(?:${names.map((n) => n.replace(/\./g, "\\.")).join("|")})\\s*\\(`, "g"))].filter((m) => !/\bdef\s+$/.test(code.slice(Math.max(0, m.index - 8), m.index))));
  for (const m of call(callee("scenarios"))) {
    out.binds = true;
    const open = m.index + m[0].length;
    const close = argumentEndAll(code, open);
    const lits = literalsIn(text, code, strings, open, close);
    const feats = lits.flatMap((l) => (l.value !== undefined && /\.feature$/.test(l.value) ? [l.value] : []));
    const dirs = lits.flatMap((l) => (l.whole && l.value !== undefined && !/\.feature$/.test(l.value) && l.value.trim() !== "" ? [l.value.replace(/\/+$/, "")] : []));
    // A call in a function binds only if the function is called, which CSH does not follow.
    const target = inFunction(code, m.index) ? out.undecided : undefined;
    if (lits.every((l) => l.value !== undefined) && (feats.length > 0 || dirs.length > 0)) {
      (target ?? out.features).push(...feats);
      if (target === undefined) out.dirs.push(...dirs);
    } else if (target !== undefined) target.push(...featureLiterals);
    else out.named.push(...literals.filter((l) => /^[\w.-]+$/.test(l)).map((l) => l.replace(/\.feature$/, "")));
  }
  for (const m of call(callee("scenario"))) {
    out.binds = true;
    const first = skip(code, m.index + m[0].length);
    const comma = argumentEnd(code, first);
    const title = code[comma] === "," ? literalAt(text, code, strings, comma + 1) : undefined;
    const after = title === undefined ? undefined : skip(code, title.end);
    const feats = literalsIn(text, code, strings, first, comma).flatMap((l) => (l.value !== undefined && /\.feature$/.test(l.value) ? [l.value] : []));
    if (title === undefined || !(code[after!] === "," || code[after!] === ")") || inFunction(code, m.index)) {
      out.undecided.push(...(feats.length > 0 ? feats : featureLiterals));
      continue;
    }
    const t = title.value.trim().replace(/\s+/g, " ");
    if (feats.length === 1) out.pairs.push(`${feats[0]}\t${t}`);
    else out.titles.push(t);
  }
  for (const k of ["features", "dirs", "named", "pairs", "titles", "undecided"] as const) out[k] = [...new Set(out[k])].sort();
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
