// The Rust reader (stage 34): code facts read from `.rs` files and the fields of each `Cargo.toml`, as csh-facts/v2.
// Nothing of Cargo or rustc runs. Each file is parsed alone with the tree-sitter grammar and read into plain data;
// then the crates are found from the Cargo.toml files, each crate's module tree is built by following its `mod`
// declarations from its roots, and every `use` path is resolved against those trees.
//
// Facts: one module per file; a dependency per `mod foo;` on the file it loads, and per `use` leaf and `extern crate`
// on the file that defines the deepest module the path names, on another workspace crate, on `rust:std` (and core,
// alloc, proc_macro, test) or on an external crate by name; one declaration per top-level item, with a trait's first
// supertrait and a constant's or static's literal value; one export per plain `pub` item and per `pub use` leaf. A
// `mod` that loads no file, and a `crate::`, `self::` or `super::` path that names nothing the tree knows, is a
// skipped fact at its line, never dropped. `impl` blocks declare nothing; a trait's base is its supertrait alone.
import { posix } from "node:path";
import { parse as parseToml } from "smol-toml";
import { compareCodePoints } from "@csh/kernel";
import type { Diagnostic, Fact } from "@csh/witness";
import { tomlFields } from "./manifest.ts";
import { lineOf, parseWith, type Node } from "./parser.ts";
import type { FactContext, InputFile, LanguageReader } from "./run.ts";

const TOOL = { id: "facts-rust", version: "0.1.0" } as const;
/** The Cargo.toml tables read as fields: what the package is, its targets, dependencies and features. */
const CARGO_TABLES = ["package", "workspace", "lib", "bin", "dependencies", "dev-dependencies", "build-dependencies", "features"];
/** The crates every Rust program can name without a dependency. */
const STD = new Set(["std", "core", "alloc", "proc_macro", "test"]);

type RustDeclares = "struct" | "enum" | "trait" | "function" | "const" | "static" | "type" | "module" | "macro";

interface ModDecl {
  name: string;
  line: number;
  /** The inline modules the declaration sits in, outermost first. */
  inline: string[];
  pathAttr?: string;
}

interface UseLeaf {
  /** The path as written, by segment; a leading `::` is an empty first segment, and a trailing `self` is dropped. */
  segs: string[];
  glob: boolean;
  line: number;
  inline: string[];
}

/** What pass one keeps of a file: plain data, no tree. */
interface FileData {
  mods: ModDecl[];
  /** Every inline module, by its path within the file. */
  inlineMods: string[][];
  uses: UseLeaf[];
  externs: { name: string; line: number }[];
  declarations: { symbol: string; declares: RustDeclares; line: number; base?: string; value?: string; members?: string[] }[];
  /** Each `match` with no catch-all arm, by the top-level item it sits in: the variants it names and the enums it names them by (stage 47). */
  matches: { owner: string; variants: string[]; enums: string[]; scrutinee?: string }[];
  exports: { symbol: string; from?: string }[];
  /** Names the file's top level declares, which a 2018 path may start with. */
  topLevel: Set<string>;
  /** Every name the file declares or imports by name, at any module level. Globs are in `uses`. */
  names: Set<string>;
}

const text = (n: Node | null | undefined): string => n?.text ?? "";
const isComment = (n: Node) => n.type === "line_comment" || n.type === "block_comment";

/** The attributes written before an item, as `name` and its string value if any. */
function attributesOf(n: Node): { name: string; value?: string }[] {
  const out: { name: string; value?: string }[] = [];
  for (let p = n.previousNamedSibling; p !== null && (p.type === "attribute_item" || isComment(p)); p = p.previousNamedSibling) {
    if (p.type !== "attribute_item") continue;
    const a = p.namedChildren.find((c) => c?.type === "attribute");
    if (a === undefined || a === null) continue;
    const value = a.childForFieldName("value");
    const v = value?.type === "string_literal" ? unescape(value.namedChildren.map((c) => text(c)).join("")) : undefined;
    out.push({ name: text(a.namedChild(0)), ...(v !== undefined ? { value: v } : {}) });
  }
  return out;
}

const visibility = (n: Node): string | undefined => n.namedChildren.find((c) => c?.type === "visibility_modifier")?.text;

/** A string's escapes, read as Rust reads them. */
function unescape(s: string): string {
  return s.replace(/\\(u\{([0-9a-fA-F_]+)\}|x([0-9a-fA-F]{2})|\r?\n\s*|.)/g, (_, e: string, u?: string, x?: string) => {
    if (u !== undefined) return String.fromCodePoint(parseInt(u.replace(/_/g, ""), 16));
    if (x !== undefined) return String.fromCharCode(parseInt(x, 16));
    if (e.startsWith("\n") || e.startsWith("\r")) return "";
    return ({ n: "\n", t: "\t", r: "\r", "0": "\0" } as Record<string, string>)[e] ?? e;
  });
}

/** A literal's value as text: a string unquoted, an integer or float without its suffix and separators, a bool. */
export function literalValue(n: Node | null): string | undefined {
  if (n === null) return undefined;
  if (n.type === "string_literal") return unescape(n.namedChildren.map((c) => (c?.type === "string_content" || c?.type === "escape_sequence" ? text(c) : "")).join(""));
  if (n.type === "raw_string_literal") return n.namedChildren.filter((c) => c?.type === "string_content").map((c) => text(c)).join("");
  if (n.type === "boolean_literal") return n.text;
  if (n.type === "integer_literal") {
    const t = n.text.replace(/_/g, "").replace(/(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize)$/, "");
    try {
      return BigInt(t).toString();
    } catch {
      return undefined;
    }
  }
  if (n.type === "float_literal") {
    const v = Number(n.text.replace(/_/g, "").replace(/f(32|64)$/, ""));
    return Number.isFinite(v) ? String(v) : undefined;
  }
  if (n.type === "unary_expression" && n.child(0)?.type === "-") {
    const v = literalValue(n.namedChild(0));
    return v !== undefined && /^[0-9.e+-]+$/.test(v) ? (v.startsWith("-") ? v.slice(1) : `-${v}`) : undefined;
  }
  return undefined;
}

/** The segments of a path in a `use`: `a::b::c` as ["a", "b", "c"], and `::a` as ["", "a"]. */
function segmentsOf(n: Node): string[] {
  if (n.type === "scoped_identifier") {
    const path = n.childForFieldName("path");
    return [...(path !== null ? segmentsOf(path) : [""]), text(n.childForFieldName("name"))];
  }
  return [n.text];
}

/** The leaves of a use tree, each with its full path and the name it is bound to. */
function leavesOf(n: Node, prefix: string[], out: { segs: string[]; bound: string; glob: boolean }[]): void {
  const leaf = (segs: string[], alias?: string) => {
    const s = segs.at(-1) === "self" && segs.length > 1 ? segs.slice(0, -1) : segs;
    out.push({ segs: s, bound: alias ?? s.at(-1)!, glob: false });
  };
  switch (n.type) {
    case "use_as_clause":
      leaf([...prefix, ...segmentsOf(n.childForFieldName("path")!)], text(n.childForFieldName("alias")));
      return;
    case "use_wildcard": {
      const path = n.namedChildren.find((c) => c !== null && !isComment(c));
      out.push({ segs: [...prefix, ...(path !== undefined && path !== null ? segmentsOf(path) : [])], bound: "*", glob: true });
      return;
    }
    case "scoped_use_list": {
      const path = n.childForFieldName("path");
      const list = n.childForFieldName("list");
      const p = [...prefix, ...(path !== null ? segmentsOf(path) : n.text.startsWith("::") ? [""] : [])];
      if (list !== null) leavesOf(list, p, out);
      return;
    }
    case "use_list":
      for (const c of n.namedChildren) if (c !== null && !isComment(c)) leavesOf(c, prefix, out);
      return;
    default:
      leaf([...prefix, ...segmentsOf(n)]);
  }
}

const ITEMS: Record<string, RustDeclares> = {
  struct_item: "struct",
  union_item: "struct",
  enum_item: "enum",
  trait_item: "trait",
  function_item: "function",
  const_item: "const",
  static_item: "static",
  type_item: "type",
  mod_item: "module",
  macro_definition: "macro",
};

/** Pass one: everything the reader needs of one file's tree, as plain data. */
export function readTree(root: Node): FileData {
  const d: FileData = { mods: [], inlineMods: [], uses: [], externs: [], declarations: [], exports: [], topLevel: new Set(), names: new Set(), matches: [] };
  const walk = (n: Node, inline: string[]): void => {
    for (const c of n.namedChildren) {
      if (c === null) continue;
      const top = inline.length === 0 && n.type === "source_file";
      if (c.type === "use_declaration") {
        const leaves: { segs: string[]; bound: string; glob: boolean }[] = [];
        const arg = c.childForFieldName("argument");
        if (arg !== null) leavesOf(arg, [], leaves);
        for (const l of leaves) {
          d.uses.push({ segs: l.segs, glob: l.glob, line: lineOf(c), inline });
          if (!l.glob) d.names.add(l.bound);
          if (top && visibility(c) === "pub") d.exports.push({ symbol: l.bound, from: l.glob ? `${l.segs.join("::")}::*` : l.segs.join("::") });
        }
        continue;
      }
      if (c.type === "extern_crate_declaration") {
        const name = text(c.childForFieldName("name"));
        const alias = c.childForFieldName("alias");
        if (name !== "self") d.externs.push({ name, line: lineOf(c) });
        d.names.add(alias !== null ? text(alias) : name);
        continue;
      }
      // The matches of an impl block belong to its type, when the file declares that type at its top level (stage 47).
      if (c.type === "impl_item" && inline.length === 0 && n.type === "source_file") {
        const owner = text(c.childForFieldName("type")).replace(/<[\s\S]*$/, "");
        for (const m of matchesIn(c, owner)) d.matches.push({ owner, ...m });
      }
      const declares = ITEMS[c.type];
      if (declares === undefined) {
        // Items inside functions, impls and blocks are not module items; a `use` there still names a dependency.
        if (c.type !== "mod_item") walkUses(c, inline);
        continue;
      }
      const symbol = text(c.childForFieldName("name"));
      d.names.add(symbol);
      if (c.type === "mod_item") {
        const body = c.childForFieldName("body");
        if (body === null) {
          const pathAttr = attributesOf(c).find((a) => a.name === "path")?.value;
          d.mods.push({ name: symbol, line: lineOf(c), inline, ...(pathAttr !== undefined ? { pathAttr } : {}) });
        } else {
          d.inlineMods.push([...inline, symbol]);
          walk(body, [...inline, symbol]);
        }
      } else if (c.type === "function_item" || c.type === "trait_item" || c.type === "macro_definition") walkUses(c, inline);
      if (!top) continue;
      d.topLevel.add(symbol);
      const base = c.type === "trait_item" ? firstBound(c) : undefined;
      const value = c.type === "const_item" || c.type === "static_item" ? literalValue(c.childForFieldName("value")) : undefined;
      const members = c.type === "enum_item" ? (c.childForFieldName("body")?.namedChildren ?? []).flatMap((v) => (v !== null && v.type === "enum_variant" ? [text(v.childForFieldName("name"))] : [])) : undefined;
      d.declarations.push({ symbol, declares, line: lineOf(c), ...(base !== undefined ? { base } : {}), ...(value !== undefined ? { value } : {}), ...(members !== undefined ? { members } : {}) });
      if (c.type === "function_item") for (const m of matchesIn(c)) d.matches.push({ owner: symbol, ...m });
      const exported = c.type === "macro_definition" ? attributesOf(c).some((a) => a.name === "macro_export") : visibility(c) === "pub";
      if (exported) d.exports.push({ symbol });
    }
  };
  // A `use` inside a function, impl or trait body: scoped to the enclosing module, as far as its path is concerned.
  const walkUses = (n: Node, inline: string[]): void => {
    for (const u of n.descendantsOfType("use_declaration")) {
      if (u === null) continue;
      const arg = u.childForFieldName("argument");
      const leaves: { segs: string[]; bound: string; glob: boolean }[] = [];
      if (arg !== null) leavesOf(arg, [], leaves);
      for (const l of leaves) d.uses.push({ segs: l.segs, glob: l.glob, line: lineOf(u), inline });
    }
  };
  walk(root, []);
  return d;
}

/**
 * The variants a pattern names, with the enum it names each by when the path says so; undefined for a pattern that
 * catches anything (`_`, or a binding), which makes a match say nothing of completeness (stage 47).
 */
function variantsOf(p: Node): { variant: string; via?: string }[] | undefined {
  switch (p.type) {
    case "match_pattern":
      return p.namedChildren[0] === null || p.namedChildren[0] === undefined ? (p.text.trim() === "_" ? undefined : []) : variantsOf(p.namedChildren[0]!);
    case "or_pattern": {
      const out: { variant: string; via?: string }[] = [];
      for (const c of p.namedChildren) {
        if (c === null) continue;
        const v = variantsOf(c);
        if (v === undefined) return undefined;
        out.push(...v);
      }
      return out;
    }
    case "reference_pattern":
      // `&Enum::Variant` names the variant through a reference; `&x` still binds anything.
      return p.namedChildren[0] === null || p.namedChildren[0] === undefined ? undefined : variantsOf(p.namedChildren[0]!);
    case "captured_pattern":
      // `x @ Enum::Variant` binds what the pattern after `@` matches.
      return p.namedChildren.length < 2 || p.namedChildren[p.namedChildren.length - 1] === null ? undefined : variantsOf(p.namedChildren[p.namedChildren.length - 1]!);
    case "tuple_struct_pattern":
    case "struct_pattern":
      return variantsOf(p.childForFieldName("type") ?? p.namedChildren[0]!);
    case "scoped_identifier":
    case "scoped_type_identifier": {
      const path = p.childForFieldName("path");
      const name = text(p.childForFieldName("name"));
      return [{ variant: name, ...(path !== null ? { via: text(path).split("::").pop()! } : {}) }];
    }
    case "identifier":
    case "type_identifier":
      // A capitalised name is a variant brought into scope; any other name binds whatever is matched.
      return /^[A-Z]/.test(p.text) ? [{ variant: p.text }] : undefined;
    default:
      return undefined;
  }
}

/**
 * The simple name of the type a match's scrutinee is declared with, when the scrutinee is `self` in an impl (its type)
 * or a name a parameter or `let` of the enclosing item declares with a type; references and paths are stripped.
 */
function scrutineeType(m: Node, item: Node, owner: string | undefined): string | undefined {
  const v = m.childForFieldName("value");
  if (v === null) return undefined;
  if (v.type === "self") return owner;
  if (v.type !== "identifier") return undefined;
  const named = (t: Node | null): string | undefined => {
    let x = t;
    while (x !== null && x.type === "reference_type") x = x.childForFieldName("type");
    if (x === null) return undefined;
    if (x.type === "generic_type") x = x.childForFieldName("type");
    return x === null ? undefined : x.text.split("::").pop()!;
  };
  for (const p of item.descendantsOfType(["parameter", "let_declaration"])) {
    if (p === null || p.childForFieldName("pattern")?.text !== v.text) continue;
    const t = named(p.childForFieldName("type"));
    if (t !== undefined) return t;
  }
  return undefined;
}

/**
 * Each `match` in an item that has no catch-all arm, by the variants its unguarded arms name, the enums its paths
 * name (`Self` read as the impl's type) and its scrutinee's declared type when known (stage 47).
 */
function matchesIn(item: Node, owner?: string): { variants: string[]; enums: string[]; scrutinee?: string }[] {
  const out: { variants: string[]; enums: string[]; scrutinee?: string }[] = [];
  for (const m of item.descendantsOfType("match_expression")) {
    if (m === null) continue;
    const arms = (m.childForFieldName("body")?.namedChildren ?? []).filter((a): a is Node => a !== null && a.type === "match_arm");
    const variants: string[] = [];
    const enums = new Set<string>();
    let catchAll = false;
    for (const a of arms) {
      const pattern = a.childForFieldName("pattern");
      if (pattern === null) continue;
      // A guarded arm covers nothing for the compiler's check.
      if (pattern.childForFieldName("condition") !== null) continue;
      const v = variantsOf(pattern);
      if (v === undefined) {
        catchAll = true;
        break;
      }
      for (const x of v) {
        variants.push(x.variant);
        if (x.via !== undefined) enums.add(x.via === "Self" && owner !== undefined ? owner : x.via);
      }
    }
    const scrutinee = scrutineeType(m, item, owner);
    if (!catchAll && variants.length > 0) out.push({ variants, enums: [...enums].sort(compareCodePoints), ...(scrutinee !== undefined ? { scrutinee } : {}) });
  }
  return out;
}

/** A trait's first supertrait as written, without its type arguments. */
function firstBound(trait: Node): string | undefined {
  const bounds = trait.childForFieldName("bounds");
  const first = bounds?.namedChildren.find((c) => c !== null && c.type !== "lifetime" && !isComment(c));
  if (first === undefined || first === null) return undefined;
  const t = first.type === "generic_type" ? text(first.childForFieldName("type")) : first.text;
  return t.replace(/^\?/, "");
}

interface Crate {
  dir: string;
  name: string | undefined;
  /** Its root files, among those read: the library first, then binaries, then tests, examples, benches and build.rs. */
  roots: string[];
}

const join = (...parts: string[]): string => {
  const p = posix.normalize(parts.filter((x) => x !== "").join("/"));
  return p === "." ? "" : p.replace(/^\.\//, "");
};
const dirOf = (p: string) => (posix.dirname(p) === "." ? "" : posix.dirname(p));
const under = (dir: string, path: string) => dir === "" || path.startsWith(`${dir}/`);

/** The crates the Cargo.toml files declare, or the repository root as one crate when none declares a package. */
export function cratesOf(files: readonly InputFile[], rs: Set<string>): Crate[] {
  const crates: Crate[] = [];
  const rootsIn = (dir: string, lib: string | undefined, bins: string[]): string[] => {
    const inDir = (rel: string) => join(dir, rel);
    const sub = (folder: string) => [...rs].filter((p) => dirOf(p) === inDir(folder)).sort(compareCodePoints);
    const nested = [...rs].filter((p) => p.startsWith(`${inDir("src/bin")}/`) && p.endsWith("/main.rs") && p.split("/").length === inDir("src/bin").split("/").length + 2).sort(compareCodePoints);
    const all = [lib ?? inDir("src/lib.rs"), inDir("src/main.rs"), ...bins, ...sub("src/bin"), ...nested, ...sub("tests"), ...sub("examples"), ...sub("benches"), inDir("build.rs")];
    return [...new Set(all)].filter((p) => rs.has(p));
  };
  for (const f of files) {
    if (posix.basename(f.path) !== "Cargo.toml") continue;
    let toml: Record<string, unknown>;
    try {
      toml = parseToml(new TextDecoder().decode(f.bytes)) as Record<string, unknown>;
    } catch {
      continue; // reported as a malformed manifest where its fields are read
    }
    const pkg = toml.package as Record<string, unknown> | undefined;
    if (typeof pkg !== "object" || pkg === null) continue;
    const dir = dirOf(f.path);
    const lib = toml.lib as Record<string, unknown> | undefined;
    const libPath = typeof lib?.path === "string" ? join(dir, lib.path) : undefined;
    const bins = (Array.isArray(toml.bin) ? (toml.bin as Record<string, unknown>[]) : []).flatMap((b) => (typeof b?.path === "string" ? [join(dir, b.path)] : []));
    const raw = typeof lib?.name === "string" ? lib.name : typeof pkg.name === "string" ? pkg.name : undefined;
    crates.push({ dir, name: raw?.replace(/-/g, "_"), roots: rootsIn(dir, libPath, bins) });
  }
  if (crates.length === 0) crates.push({ dir: "", name: undefined, roots: rootsIn("", undefined, []) });
  return crates.sort((a, b) => compareCodePoints(a.dir, b.dir));
}

/** Where a file sits in a module tree: the root of its tree and its path from that root; null if no tree reaches it. */
interface Place {
  crate: Crate | undefined;
  root: string | undefined;
  path: string[] | null;
}

/** The file `mod name;` loads from `file`, among `rs`, or undefined. */
export function resolveMod(file: string, ownsDir: boolean, m: ModDecl, rs: Set<string>): string | undefined {
  const base = dirOf(file);
  if (m.pathAttr !== undefined) {
    const p = join(base, ...m.inline, m.pathAttr);
    return rs.has(p) ? p : undefined;
  }
  const dir = join(ownsDir ? base : join(base, posix.basename(file, ".rs")), ...m.inline);
  return [join(dir, `${m.name}.rs`), join(dir, m.name, "mod.rs")].find((p) => rs.has(p));
}

/** Read the `.rs` files and Cargo.toml manifests of a source. */
export async function readRust(files: readonly InputFile[], ctx: FactContext): Promise<{ facts: Fact[]; diagnostics: Diagnostic[] }> {
  const sorted = [...files].sort((a, b) => compareCodePoints(a.path, b.path));
  const facts: Fact[] = [];
  const diagnostics: Diagnostic[] = [];
  const base = ctx.base(TOOL);
  const rs = new Set(sorted.filter((f) => f.path.endsWith(".rs")).map((f) => f.path));

  // Pass one: each file's tree, read into plain data and freed.
  const data = new Map<string, FileData>();
  for (const f of sorted) if (rs.has(f.path)) data.set(f.path, await parseWith("rust", new TextDecoder().decode(f.bytes), readTree));

  // Pass two: the crates and their module trees.
  const crates = cratesOf(sorted, rs);
  const crateOf = (p: string) => crates.filter((c) => under(c.dir, p)).sort((a, b) => b.dir.length - a.dir.length)[0];
  const places = new Map<string, Place>();
  const owners = new Set<string>(); // files whose `mod` children sit beside them
  const trees = new Map<string, Map<string, string>>(); // root file -> module path -> file
  for (const c of crates) for (const r of c.roots) if (!places.has(r)) {
    places.set(r, { crate: c, root: r, path: [] });
    owners.add(r);
  }
  for (const c of crates) {
    for (const r of c.roots) {
      if (places.get(r)?.root !== r) continue;
      const tree = new Map<string, string>([["", r]]);
      trees.set(r, tree);
      const queue = [r];
      while (queue.length > 0) {
        const file = queue.shift()!;
        const at = places.get(file)!.path!;
        const d = data.get(file)!;
        for (const im of d.inlineMods) tree.set([...at, ...im].join("::"), file);
        for (const m of d.mods) {
          const to = resolveMod(file, owners.has(file) || posix.basename(file) === "mod.rs", m, rs);
          if (to === undefined || places.has(to)) continue;
          const path = [...at, ...m.inline, m.name];
          places.set(to, { crate: c, root: r, path });
          if (m.pathAttr !== undefined) owners.add(to);
          tree.set(path.join("::"), to);
          queue.push(to);
        }
      }
    }
  }
  const primary = (c: Crate | undefined) => c?.roots.find((r) => places.get(r)?.root === r);
  const crateByName = new Map(crates.filter((c) => c.name !== undefined).map((c) => [c.name!, c]));

  type Target = { to: string } | { skip: string };
  /** The file of the deepest module of `abs` in a tree; with `strict`, the next segment must be a name it knows. */
  const resolveIn = (root: string, abs: string[], strict: boolean, written: string): Target => {
    const tree = trees.get(root)!;
    let k = abs.length;
    while (k > 0 && !tree.has(abs.slice(0, k).join("::"))) k--;
    const file = tree.get(abs.slice(0, k).join("::"))!;
    const next = abs[k];
    if (strict && next !== undefined) {
      if (!knows(file, next, new Set())) return { skip: `unresolved ${written}` };
    }
    return { to: file };
  };
  const external = (name: string | undefined, rest: string[], written: string): Target => {
    if (name === undefined || name === "") return { skip: `unresolved ${written}` };
    if (STD.has(name)) return { to: `rust:${name}` };
    const other = crateByName.get(name);
    const root = primary(other);
    if (root !== undefined) return resolveIn(root, rest, false, written);
    return { to: name };
  };
  /**
   * Whether a file declares or imports a name: by name, or through a glob of a file that does. A glob of an external
   * crate or of std could bring in anything, so it knows every name.
   */
  const knows = (file: string, name: string, visited: Set<string>): boolean => {
    const d = data.get(file)!;
    if (d.names.has(name)) return true;
    visited.add(file);
    for (const u of d.uses) {
      if (!u.glob) continue;
      const t = resolveUse(file, u.segs, u.inline, false);
      if ("skip" in t) continue;
      if (!data.has(t.to)) return true;
      if (!visited.has(t.to) && knows(t.to, name, visited)) return true;
    }
    return false;
  };
  const resolveUse = (file: string, segs: string[], inline: string[], strict = true): Target => {
    const place = places.get(file);
    const written = segs.join("::");
    const s0 = segs[0];
    if (s0 === "") return external(segs[1], segs.slice(2), written);
    const root = place?.root ?? primary(place?.crate ?? crateOf(file));
    if (s0 === "crate" || s0 === "$crate") return root === undefined ? { skip: `unresolved ${written}` } : resolveIn(root, segs.slice(1), strict, written);
    const here = place?.path === null || place?.path === undefined ? null : [...place.path, ...inline];
    if (s0 === "self" || s0 === "super") {
      if (here === null || root === undefined) return { skip: `unresolved ${written}` };
      const at = [...here];
      let i = s0 === "self" ? 1 : 0;
      for (; segs[i] === "super"; i++) {
        if (at.length === 0) return { skip: `unresolved ${written}` };
        at.pop();
      }
      return resolveIn(root, [...at, ...segs.slice(i)], strict, written);
    }
    // A 2018 path may start with a name the current module declares or a child module of it.
    if (here !== null && root !== undefined && (trees.get(root)!.has([...here, s0!].join("::")) || (inline.length === 0 && data.get(file)!.topLevel.has(s0!)))) return resolveIn(root, [...here, ...segs], strict, written);
    return external(s0, segs.slice(1), written);
  };

  // The enums read, by name; a match is complete over the one whose variants its arms name exactly (stage 47). The
  // enum its paths name, else its scrutinee's declared type, decides which; with neither, two enums with the same
  // variants leave the match unattributed rather than credit an enum it may not match on.
  const enums = new Map<string, Set<string>[]>();
  for (const fd of data.values()) for (const x of fd.declarations) if (x.members !== undefined) enums.set(x.symbol, [...(enums.get(x.symbol) ?? []), new Set(x.members)]);
  const totalOf = (fd: FileData, owner: string): string[] => {
    const over = new Set<string>();
    for (const m of fd.matches.filter((y) => y.owner === owner)) {
      const named = new Set(m.variants);
      const fits = [...enums]
        .filter(([name]) => (m.enums.length === 0 || (m.enums.length === 1 && m.enums[0] === name)) && (m.scrutinee === undefined || m.scrutinee === name || m.enums.length > 0))
        .filter(([, sets]) => sets.some((vs) => vs.size === named.size && [...vs].every((v) => named.has(v))))
        .map(([name]) => name);
      if (fits.length === 1) over.add(fits[0]!);
    }
    return [...over].sort(compareCodePoints);
  };
  for (const f of sorted) {
    if (!rs.has(f.path)) {
      const out = tomlFields(f, ctx, TOOL, CARGO_TABLES);
      facts.push(...out.facts);
      diagnostics.push(...out.diagnostics);
      continue;
    }
    const d = data.get(f.path)!;
    facts.push({ ...base, kind: "module", at: f.path, name: f.path, language: "rust" });
    const refs: { line: number; target: Target }[] = [];
    const ownsDir = owners.has(f.path) || posix.basename(f.path) === "mod.rs";
    for (const m of d.mods) {
      const to = resolveMod(f.path, ownsDir, m, rs);
      refs.push({ line: m.line, target: to !== undefined ? { to } : { skip: `unresolved mod ${m.name}` } });
    }
    for (const e of d.externs) refs.push({ line: e.line, target: external(e.name, [], e.name) });
    for (const u of d.uses) refs.push({ line: u.line, target: resolveUse(f.path, u.segs, u.inline) });
    refs.sort((a, b) => a.line - b.line);
    const seen = new Set<string>();
    for (const r of refs) {
      const at = `${f.path}:${r.line}`;
      const key = "to" in r.target ? `d ${r.target.to} ${r.line}` : `s ${r.target.skip} ${r.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if ("skip" in r.target) facts.push({ ...base, kind: "skipped", at, from: f.path, reason: r.target.skip });
      else if (r.target.to !== f.path) facts.push({ ...base, kind: "depends", at, from: f.path, to: r.target.to, via: "import", typeOnly: false });
    }
    for (const x of d.declarations) {
      const total = totalOf(d, x.symbol);
      facts.push({ ...base, kind: "declare", at: `${f.path}:${x.line}`, module: f.path, symbol: x.symbol, declares: x.declares, ...(x.base !== undefined ? { base: x.base } : {}), ...(x.value !== undefined ? { value: x.value } : {}), ...(x.members !== undefined ? { members: x.members } : {}), ...(total.length > 0 ? { total } : {}) });
    }
    for (const e of d.exports) facts.push({ ...base, kind: "export", at: f.path, module: f.path, symbol: e.symbol, ...(e.from !== undefined ? { from: e.from } : {}), typeOnly: false });
  }
  return { facts, diagnostics };
}

export const rust: LanguageReader = {
  language: "rust",
  manifest: (path) => posix.basename(path) === "Cargo.toml",
  read: readRust,
};
