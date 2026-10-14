// The Go reader (stage 33): code facts from `.go` files, parsed with the tree-sitter grammar, and fields from `go.mod`
// and `go.work`, parsed by hand (their line format is small). Nothing of the Go toolchain runs: no `go list`, no
// module download, so the facts of a commit depend on its source files alone.
//
// Facts: one module per `.go` file, test files included. One dependency per import spec. An import under the module
// path of the nearest enclosing `go.mod` (or of any module a `go.work` uses alongside it) is local: a Go package is a
// directory, and a dependency names each non-test file of that directory, because a module rule's glob such as
// `internal/db/**` selects the files under a directory and not the directory itself. A local import whose directory
// holds no file read is a skipped fact. A standard library import is `go:<path>`, any other the import path as written.
// One declaration per top-level name, with a method named `Type.Method`; one export per capitalised name. Go has no
// inheritance; what a struct or an interface embeds is recorded as its `bases`, since the embedded type's methods are
// promoted (stage 59).
import { posix } from "node:path";
import { compareCodePoints } from "@csh/kernel";
import type { Diagnostic, Fact } from "@csh/witness";
import { lineOf, parseWith, type Node } from "./parser.ts";
import type { FactContext, InputFile, LanguageReader } from "./run.ts";

export const TOOL = { id: "facts-go", version: "0.1.0" } as const;

const escapePointer = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
const dirOf = (path: string) => (posix.dirname(path) === "." ? "" : posix.dirname(path));
const isManifest = (path: string) => ["go.mod", "go.work"].includes(posix.basename(path));

/** A directive of go.mod or go.work: its keyword, its arguments, whether `// indirect` follows, and its line. */
interface Directive {
  verb: string;
  args: string[];
  indirect: boolean;
  line: number;
}

/** The words of one line, a quoted word unquoted, and the comment after `//`. */
function wordsOf(text: string): { words: string[]; comment: string } {
  const words: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === " " || c === "\t" || c === "\r") i++;
    else if (text.startsWith("//", i)) return { words, comment: text.slice(i + 2).trim() };
    else if (c === '"' || c === "`") {
      const end = text.indexOf(c, i + 1);
      const stop = end < 0 ? text.length : end;
      words.push(c === '"' ? unquote(text.slice(i + 1, stop)) : text.slice(i + 1, stop));
      i = stop + 1;
    } else {
      let j = i;
      while (j < text.length && !/[\s"`]/.test(text[j]!) && !text.startsWith("//", j)) j++;
      words.push(text.slice(i, j));
      i = j;
    }
  }
  return { words, comment: "" };
}

/** The directives of a go.mod or go.work file, a block `verb ( ... )` read as one directive per line. */
export function parseGoMod(text: string): { directives: Directive[]; problems: { line: number; message: string }[] } {
  const directives: Directive[] = [];
  const problems: { line: number; message: string }[] = [];
  let block: string | undefined;
  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const { words, comment } = wordsOf(raw);
    const indirect = /^indirect\b/.test(comment);
    if (words.length === 0) return;
    if (block !== undefined) {
      if (words.length === 1 && words[0] === ")") block = undefined;
      else directives.push({ verb: block, args: words, indirect, line });
      return;
    }
    const [verb, ...args] = words;
    if (args.length === 1 && args[0] === "(") block = verb!;
    else if (args.length === 0) problems.push({ line, message: `a directive with no arguments: ${verb}` });
    else directives.push({ verb: verb!, args, indirect, line });
  });
  if (block !== undefined) problems.push({ line: text.split("\n").length, message: `an unclosed ${block} block` });
  return { directives, problems };
}

/** The directives each file kind knows, beyond which a line is malformed. */
const KNOWN = { "go.mod": new Set(["module", "go", "toolchain", "godebug", "require", "replace", "exclude", "retract", "tool", "ignore"]), "go.work": new Set(["go", "toolchain", "godebug", "use", "replace"]) } as const;

/** The field facts of a go.mod or go.work, and a warning for each line it cannot read; the rest is still read. */
function manifestFields(f: InputFile, ctx: FactContext): { facts: Fact[]; diagnostics: Diagnostic[]; module?: string; uses: string[] } {
  const kind = posix.basename(f.path) as keyof typeof KNOWN;
  const { directives, problems } = parseGoMod(new TextDecoder().decode(f.bytes));
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = problems.map((p) => ({ code: "malformed-manifest", severity: "warning", message: p.message, span: `${f.path}:${p.line}` }));
  const field = (path: string, value: string, line: number) => facts.push({ ...ctx.base(TOOL), kind: "field", at: `${f.path}:${line}`, file: f.path, path, value });
  let module: string | undefined;
  const uses: string[] = [];
  const counts = new Map<string, number>();
  const next = (verb: string) => {
    const n = counts.get(verb) ?? 0;
    counts.set(verb, n + 1);
    return n;
  };
  for (const d of directives) {
    const [a, b] = d.args;
    if (!KNOWN[kind].has(d.verb)) {
      diagnostics.push({ code: "malformed-manifest", severity: "warning", message: `an unknown ${kind} directive: ${d.verb}`, span: `${f.path}:${d.line}` });
      continue;
    }
    if (d.verb === "module" || d.verb === "go" || d.verb === "toolchain") {
      if (d.verb === "module") module = a!;
      field(`/${d.verb}`, a!, d.line);
    } else if (d.verb === "require" && b !== undefined) {
      field(`/require/${escapePointer(a!)}`, b, d.line);
      if (d.indirect) field(`/indirect/${escapePointer(a!)}`, "true", d.line);
    } else if (d.verb === "replace") {
      const arrow = d.args.indexOf("=>");
      if (arrow < 1 || arrow === d.args.length - 1) diagnostics.push({ code: "malformed-manifest", severity: "warning", message: "a replace with no =>", span: `${f.path}:${d.line}` });
      else field(`/replace/${escapePointer(a!)}`, d.args.slice(arrow + 1).join(" "), d.line);
    } else if (d.verb === "exclude" && b !== undefined) field(`/exclude/${escapePointer(a!)}`, b, d.line);
    else if (d.verb === "godebug") {
      const eq = a!.indexOf("=");
      if (eq > 0) field(`/godebug/${escapePointer(a!.slice(0, eq))}`, a!.slice(eq + 1), d.line);
    } else if (d.verb === "use") {
      uses.push(a!);
      field(`/use/${next("use")}`, a!, d.line);
    } else if (d.verb === "retract" || d.verb === "tool" || d.verb === "ignore") field(`/${d.verb}/${next(d.verb)}`, d.args.join(" "), d.line);
    else diagnostics.push({ code: "malformed-manifest", severity: "warning", message: `an incomplete ${d.verb} directive`, span: `${f.path}:${d.line}` });
  }
  return { facts, diagnostics, ...(module !== undefined ? { module } : {}), uses };
}

/** An interpreted Go string's escapes, resolved. */
function unquote(s: string): string {
  const simple: Record<string, string> = { a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", "'": "'", '"': '"' };
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{3}|.)/g, (_, e: string) => {
    if (/^[xuU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
    if (/^[0-7]{3}$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return simple[e] ?? e;
  });
}

/** A basic literal's value as text: a string unquoted, an integer or float normalised, or a boolean. */
function literalValue(n: Node): string | undefined {
  if (n.type === "interpreted_string_literal") return unquote(n.text.slice(1, -1));
  if (n.type === "raw_string_literal") return n.text.slice(1, -1).replace(/\r/g, "");
  if (n.type === "true" || n.type === "false") return n.type;
  if (n.type === "int_literal") {
    const t = n.text.replace(/_/g, "");
    try {
      return /^0[0-7]+$/.test(t) ? BigInt(`0o${t.slice(1)}`).toString() : BigInt(t.replace(/^0([xXoObB])/, (_, p: string) => `0${p.toLowerCase()}`)).toString();
    } catch {
      return undefined;
    }
  }
  if (n.type === "float_literal") {
    const v = Number(n.text.replace(/_/g, ""));
    return Number.isFinite(v) ? String(v) : undefined;
  }
  return undefined;
}

export interface GoDeclaration {
  symbol: string;
  declares: "function" | "method" | "struct" | "interface" | "type" | "const" | "var";
  /** A struct's embedded fields and an interface's embedded interfaces, as written without `*` (stage 59). */
  bases?: string[];
  line: number;
  value?: string;
  exported: boolean;
}

const exported = (name: string) => /^\p{Lu}/u.test(name);
const named = (n: Node, field: string) => n.childrenForFieldName(field).filter((c): c is Node => c !== null && c.type === "identifier");

/** The type a method's receiver names: `T` for `T`, `*T`, `T[K]` and `*T[K]`. */
function receiverType(method: Node): string | undefined {
  let t = method.childForFieldName("receiver")?.namedChildren.find((c) => c?.type === "parameter_declaration")?.childForFieldName("type") ?? null;
  while (t !== null && (t.type === "pointer_type" || t.type === "parenthesized_type" || t.type === "generic_type")) t = t.type === "generic_type" ? t.childForFieldName("type") : (t.namedChildren[0] ?? null);
  return t?.type === "type_identifier" ? t.text : undefined;
}

/**
 * What a struct or an interface embeds (stage 59): each field with a type and no name, and each interface element that
 * is a lone type name, as written without `*` or type arguments. Its methods are promoted, so a claim that the type
 * is what it embeds follows it (A-201).
 */
function embeddedIn(type: Node): string[] {
  const out: string[] = [];
  const named = (t: Node | null): string | undefined => {
    while (t !== null && (t.type === "pointer_type" || t.type === "generic_type")) t = t.type === "generic_type" ? t.childForFieldName("type") : (t.namedChildren[0] ?? null);
    return t !== null && (t.type === "type_identifier" || t.type === "qualified_type") ? t.text : undefined;
  };
  if (type.type === "struct_type") {
    for (const f of type.namedChildren.find((c) => c?.type === "field_declaration_list")?.namedChildren ?? []) {
      if (f === null || f.type !== "field_declaration" || f.childForFieldName("name") !== null) continue;
      const b = named(f.childForFieldName("type"));
      if (b !== undefined) out.push(b);
    }
  } else if (type.type === "interface_type") {
    for (const e of type.namedChildren) {
      if (e === null || e.type !== "type_elem" || e.namedChildren.length !== 1) continue;
      const b = named(e.namedChildren[0]!);
      if (b !== undefined) out.push(b);
    }
  }
  return out;
}

/** The import specs and top-level declarations of one parsed file, as plain data: no node outlives the call. */
export function readGoFile(root: Node): { imports: { path: string; line: number }[]; declarations: GoDeclaration[] } {
  const imports: { path: string; line: number }[] = [];
  const declarations: GoDeclaration[] = [];
  const declare = (symbol: string, declares: GoDeclaration["declares"], n: Node, extra: { value?: string; exported?: boolean; bases?: string[] } = {}) =>
    declarations.push({ symbol, declares, line: lineOf(n), ...(extra.value !== undefined ? { value: extra.value } : {}), ...(extra.bases !== undefined && extra.bases.length > 0 ? { bases: extra.bases } : {}), exported: extra.exported ?? exported(symbol) });
  for (const n of root.namedChildren) {
    if (n === null) continue;
    if (n.type === "import_declaration") {
      for (const spec of n.descendantsOfType("import_spec")) {
        const p = spec?.childForFieldName("path");
        if (spec != null && p != null) imports.push({ path: p.type === "raw_string_literal" ? p.text.slice(1, -1) : unquote(p.text.slice(1, -1)), line: lineOf(spec) });
      }
    } else if (n.type === "function_declaration") {
      const name = n.childForFieldName("name");
      if (name !== null) declare(name.text, "function", n);
    } else if (n.type === "method_declaration") {
      const name = n.childForFieldName("name");
      const type = receiverType(n);
      if (name !== null && type !== undefined) declare(`${type}.${name.text}`, "method", n, { exported: exported(type) && exported(name.text) });
    } else if (n.type === "type_declaration") {
      for (const spec of n.namedChildren) {
        const name = spec?.childForFieldName("name");
        if (spec == null || name == null) continue;
        const type = spec.childForFieldName("type");
        const t = type?.type;
        declare(name.text, spec.type === "type_spec" && t === "struct_type" ? "struct" : spec.type === "type_spec" && t === "interface_type" ? "interface" : "type", spec, { bases: spec.type === "type_spec" && type != null ? embeddedIn(type) : [] });
      }
    } else if (n.type === "const_declaration" || n.type === "var_declaration") {
      const specs = n.type === "var_declaration" ? n.descendantsOfType("var_spec") : n.namedChildren.filter((c) => c?.type === "const_spec");
      for (const spec of specs) {
        if (spec == null) continue;
        const names = named(spec, "name");
        const values = spec.childForFieldName("value")?.namedChildren ?? [];
        names.forEach((name, i) => {
          if (name.text === "_") return;
          const v = n.type === "const_declaration" && names.length === values.length && values[i] != null ? literalValue(values[i]!) : undefined;
          declare(name.text, n.type === "const_declaration" ? "const" : "var", spec, { ...(v !== undefined ? { value: v } : {}) });
        });
      }
    }
  }
  return { imports, declarations };
}

/** A Go module the source holds: its path, and the directory its go.mod is in ("" at the root). */
interface GoModule {
  path: string;
  dir: string;
}

const within = (dir: string, path: string) => dir === "" || path === dir || path.startsWith(`${dir}/`);

/** The local package directory an import path names among `modules`, the longest module path first. */
function localDir(importPath: string, modules: readonly GoModule[]): string | undefined {
  const m = [...modules].sort((a, b) => b.path.length - a.path.length).find((x) => importPath === x.path || importPath.startsWith(`${x.path}/`));
  if (m === undefined) return undefined;
  return posix.join(m.dir === "" ? "." : m.dir, importPath.slice(m.path.length + 1) || ".").replace(/^\.$/, "");
}

/** Facts of the `.go` files, go.mod and go.work files a source names. */
export async function readGo(files: readonly InputFile[], ctx: FactContext): Promise<{ facts: Fact[]; diagnostics: Diagnostic[] }> {
  const sorted = [...files].sort((a, b) => compareCodePoints(a.path, b.path));
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  const modules: GoModule[] = [];
  const workspaces: { dir: string; uses: string[] }[] = [];
  for (const f of sorted.filter((x) => isManifest(x.path))) {
    const m = manifestFields(f, ctx);
    facts.push(...m.facts);
    diagnostics.push(...m.diagnostics);
    if (posix.basename(f.path) === "go.mod" && m.module !== undefined) modules.push({ path: m.module, dir: dirOf(f.path) });
    if (posix.basename(f.path) === "go.work") workspaces.push({ dir: dirOf(f.path), uses: m.uses.map((u) => posix.join(dirOf(f.path) || ".", u).replace(/^\.$/, "")) });
  }
  const code = sorted.filter((f) => f.path.endsWith(".go"));
  const byDir = new Map<string, string[]>();
  for (const f of code) byDir.set(dirOf(f.path), [...(byDir.get(dirOf(f.path)) ?? []), f.path]);
  /** The modules a file may import locally: its own, and every module a go.work that uses its own also uses. */
  const scope = (path: string): GoModule[] => {
    const own = modules.filter((m) => within(m.dir, path)).sort((a, b) => b.dir.length - a.dir.length)[0];
    if (own === undefined) return [];
    const used = workspaces.filter((w) => w.uses.includes(own.dir)).flatMap((w) => w.uses);
    return [own, ...modules.filter((m) => m !== own && used.includes(m.dir))];
  };
  for (const f of code) {
    facts.push({ ...ctx.base(TOOL), kind: "module", at: f.path, name: f.path, language: "go" });
    let r: ReturnType<typeof readGoFile>;
    try {
      r = await parseWith("go", new TextDecoder().decode(f.bytes), readGoFile);
    } catch (err) {
      facts.push({ ...ctx.base(TOOL), kind: "skipped", at: f.path, from: f.path, reason: `unparsed: ${(err as Error).message}` });
      continue;
    }
    const local = scope(f.path);
    for (const imp of r.imports) {
      const at = `${f.path}:${imp.line}`;
      const dir = localDir(imp.path, local);
      if (dir !== undefined) {
        const inDir = byDir.get(dir) ?? [];
        const targets = inDir.some((p) => !p.endsWith("_test.go")) ? inDir.filter((p) => !p.endsWith("_test.go")) : inDir;
        if (targets.length === 0) facts.push({ ...ctx.base(TOOL), kind: "skipped", at, from: f.path, reason: `unresolved ${imp.path}` });
        for (const to of targets) if (to !== f.path) facts.push({ ...ctx.base(TOOL), kind: "depends", at, from: f.path, to, via: "import", typeOnly: false });
      } else {
        const to = imp.path.split("/")[0]!.includes(".") ? imp.path : `go:${imp.path}`;
        facts.push({ ...ctx.base(TOOL), kind: "depends", at, from: f.path, to, via: "import", typeOnly: false });
      }
    }
    for (const d of r.declarations) facts.push({ ...ctx.base(TOOL), kind: "declare", at: `${f.path}:${d.line}`, module: f.path, symbol: d.symbol, declares: d.declares, ...(d.value !== undefined ? { value: d.value } : {}), ...(d.bases !== undefined ? { bases: d.bases } : {}) });
    for (const d of r.declarations) if (d.exported) facts.push({ ...ctx.base(TOOL), kind: "export", at: f.path, module: f.path, symbol: d.symbol, typeOnly: d.declares === "struct" || d.declares === "interface" || d.declares === "type" });
  }
  return { facts, diagnostics };
}

export const goReader: LanguageReader = { language: "go", manifest: isManifest, read: readGo };
