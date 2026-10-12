// facts-py: code facts read from Python source files, as csh-facts/v2 (stage 31). Each `.py` and `.pyi` file is parsed
// alone with tree-sitter, and its imports are resolved against the other files of the source, never against an
// installed interpreter, a virtual environment or site-packages. Nothing is imported, run or type checked.
//
// Facts: one module per file; one dependency per imported module, resolved against the source roots (the repository
// root, `src`, and the parent of every top-level package) or relative to the importing file's package, else named as
// an external top-level package, or `python:<name>` for the standard library; one declaration per top-level class,
// function, assignment and type alias, and per class nested in a class body under its dotted name (`Outer.Inner`),
// with a class's first base and a literal's value; the exports `__all__` names, else every public top-level name; and
// the `project` and `build-system` tables of each `pyproject.toml`. An import that cannot be resolved or a computed
// one is a skipped fact, never dropped.
import { posix } from "node:path";
import { compareCodePoints } from "@csh/kernel";
import type { Diagnostic, Fact } from "@csh/witness";
import { tomlFields } from "./manifest.ts";
import { lineOf, parseWith, type Node } from "./parser.ts";
import type { FactContext, InputFile, LanguageReader } from "./run.ts";

export const TOOL = { id: "facts-py", version: "0.1.0" } as const;

/** The pyproject.toml tables read as facts: what the project is and how it is built. Tool settings are not read. */
const PYPROJECT_TABLES = ["project", "build-system"];

/** Python 3.12's `sys.stdlib_module_names`: a dependency on one of these is `python:<name>`. */
const STDLIB = new Set(
  (
    "__future__ _abc _aix_support _ast _asyncio _bisect _blake2 _bz2 _codecs _codecs_cn _codecs_hk _codecs_iso2022 _codecs_jp _codecs_kr _codecs_tw " +
    "_collections _collections_abc _compat_pickle _compression _contextvars _crypt _csv _ctypes _curses _curses_panel _datetime _dbm _decimal " +
    "_elementtree _frozen_importlib _frozen_importlib_external _functools _gdbm _hashlib _heapq _imp _io _json _locale _lsprof _lzma _markupbase " +
    "_md5 _msi _multibytecodec _multiprocessing _opcode _operator _osx_support _overlapped _pickle _posixshmem _posixsubprocess _py_abc _pydatetime " +
    "_pydecimal _pyio _pylong _queue _random _scproxy _sha1 _sha2 _sha3 _signal _sitebuiltins _socket _sqlite3 _sre _ssl _stat _statistics _string " +
    "_strptime _struct _symtable _thread _threading_local _tkinter _tokenize _tracemalloc _typing _uuid _warnings _weakref _weakrefset _winapi " +
    "_zoneinfo abc aifc antigravity argparse array ast asyncio atexit audioop base64 bdb binascii bisect builtins bz2 cProfile calendar cgi cgitb " +
    "chunk cmath cmd code codecs codeop collections colorsys compileall concurrent configparser contextlib contextvars copy copyreg crypt csv ctypes " +
    "curses dataclasses datetime dbm decimal difflib dis doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch " +
    "fractions ftplib functools gc genericpath getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib imghdr " +
    "importlib inspect io ipaddress itertools json keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes mmap " +
    "modulefinder msilib msvcrt multiprocessing netrc nis nntplib nt ntpath nturl2path numbers opcode operator optparse os ossaudiodev pathlib pdb " +
    "pickle pickletools pipes pkgutil platform plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data " +
    "pyexpat queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site " +
    "smtplib sndhdr socket socketserver spwd sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct subprocess " +
    "sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile termios textwrap this threading time timeit tkinter token tokenize " +
    "tomllib trace traceback tracemalloc tty turtle turtledemo types typing unicodedata unittest urllib uu uuid venv warnings wave weakref " +
    "webbrowser winreg winsound wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo"
  ).split(" "),
);

const CODE = /\.pyi?$/;
const CONSTANT = /^[A-Z][A-Z0-9_]*$/;

/** One import: the module as written (dotted, with leading dots when relative), the names imported from it, if any. */
export interface PyImport {
  module: string;
  /** For `from m import a, b`: the names, each tried as a submodule first. Empty for `import m` and `from m import *`. */
  names: string[];
  star: boolean;
  line: number;
  typeOnly: boolean;
}

export interface PyDeclaration {
  symbol: string;
  declares: "class" | "function" | "const" | "var" | "type";
  line: number;
  base?: string;
  value?: string;
}

const named = (n: Node): Node[] => n.namedChildren.filter((c) => c.type !== "comment");

const ESCAPES: Record<string, string> = { "\n": "", "\\": "\\", "'": "'", '"': '"', a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };

/** A string literal's value: undefined for an f-string, a bytes literal or an escape not decoded here. */
function stringValue(n: Node): string | undefined {
  if (n.type === "concatenated_string") {
    const parts = named(n).map(stringValue);
    return parts.every((p) => p !== undefined) ? parts.join("") : undefined;
  }
  if (n.type !== "string") return undefined;
  const prefix = (named(n).find((c) => c.type === "string_start")?.text ?? "").replace(/["']/g, "").toLowerCase();
  if (/[fbt]/.test(prefix) || named(n).some((c) => c.type === "interpolation")) return undefined;
  const content = named(n)
    .filter((c) => c.type === "string_content")
    .map((c) => c.text)
    .join("");
  if (prefix.includes("r")) return content;
  let bad = false;
  const out = content.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|[\s\S])/g, (_, e: string) => {
    if (/^[xuU]/.test(e) && e.length > 1) return String.fromCodePoint(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e)) return String.fromCodePoint(parseInt(e, 8));
    if (Object.hasOwn(ESCAPES, e)) return ESCAPES[e]!;
    bad = true;
    return "";
  });
  return bad ? undefined : out;
}

/** A literal's value as text: a string, an integer or float, or a boolean. */
function literalValue(n: Node | null): string | undefined {
  if (n === null) return undefined;
  if (n.type === "parenthesized_expression" && named(n).length === 1) return literalValue(named(n)[0]!);
  if (n.type === "string" || n.type === "concatenated_string") return stringValue(n);
  if (n.type === "integer" || n.type === "float") {
    const v = Number(n.text.replace(/_/g, ""));
    return Number.isNaN(v) ? undefined : String(v);
  }
  if (n.type === "true") return "true";
  if (n.type === "false") return "false";
  return undefined;
}

/** The names a target of an assignment binds: one for a name, each for a tuple or list. Attributes bind none. */
function targetNames(n: Node): string[] {
  if (n.type === "identifier") return [n.text];
  if (["pattern_list", "tuple_pattern", "list_pattern", "list_splat_pattern", "parenthesized_expression", "tuple", "list"].includes(n.type)) return named(n).flatMap(targetNames);
  return [];
}

const isTypeChecking = (n: Node | null) => n !== null && (n.text === "TYPE_CHECKING" || n.text === "typing.TYPE_CHECKING");
const isFinal = (t: Node | null) => t !== null && /^(typing\.)?Final(\[[\s\S]*\])?$/.test(t.text);

/** The declarations of one top-level statement, or of a class body's class. */
function declarationsOf(n: Node): PyDeclaration[] {
  const line = lineOf(n);
  if (n.type === "decorated_definition") {
    const def = n.childForFieldName("definition");
    // The decorator's line is the definition's own; a class nested in it keeps its line.
    return def === null ? [] : declarationsOf(def).map((d, i) => (i === 0 ? { ...d, line } : d));
  }
  if (n.type === "class_definition") {
    const name = n.childForFieldName("name")?.text;
    const sup = n.childForFieldName("superclasses");
    const first = sup === null ? undefined : named(sup).find((c) => !["keyword_argument", "list_splat", "dictionary_splat"].includes(c.type));
    if (name === undefined) return [];
    // A class defined directly in the body is declared under its dotted name, at any depth (A-170); one inside a
    // method is not a member of the class.
    const body = n.childForFieldName("body");
    const nested = (body === null ? [] : named(body))
      .filter((c) => c.type === "class_definition" || (c.type === "decorated_definition" && c.childForFieldName("definition")?.type === "class_definition"))
      .flatMap(declarationsOf)
      .map((d) => ({ ...d, symbol: `${name}.${d.symbol}` }));
    return [{ symbol: name, declares: "class", line, ...(first !== undefined ? { base: first.text } : {}) }, ...nested];
  }
  if (n.type === "function_definition") {
    const name = n.childForFieldName("name")?.text;
    return name === undefined ? [] : [{ symbol: name, declares: "function", line }];
  }
  if (n.type === "type_alias_statement") {
    const left = n.childForFieldName("left");
    const id = left === null ? undefined : left.type === "identifier" ? left : left.descendantsOfType("identifier")[0];
    return id === undefined ? [] : [{ symbol: id.text, declares: "type", line }];
  }
  if (n.type === "expression_statement" && named(n).length === 1 && named(n)[0]!.type === "assignment") {
    // A chained assignment, `A = B = 1`, nests: each left side binds, and the innermost right side is the value.
    let a: Node | null = named(n)[0]!;
    const lefts: Node[] = [];
    let type: Node | null = null;
    while (a !== null && a.type === "assignment") {
      const left = a.childForFieldName("left");
      if (left !== null) lefts.push(left);
      type ??= a.childForFieldName("type");
      a = a.childForFieldName("right");
    }
    const out: PyDeclaration[] = [];
    for (const left of lefts) {
      // Unpacking binds each name, with no single value.
      if (left.type !== "identifier") {
        for (const symbol of targetNames(left)) out.push({ symbol, declares: "var", line });
        continue;
      }
      const declares = CONSTANT.test(left.text) || isFinal(type) ? "const" : "var";
      const value = literalValue(a);
      out.push({ symbol: left.text, declares, line, ...(value !== undefined ? { value } : {}) });
    }
    return out;
  }
  return [];
}

/** `__all__` when the module sets it: the names, or the line that makes it not a literal list of strings. */
export type PyAll = string[] | { computed: number } | undefined;

function allOf(root: Node): PyAll {
  let found: PyAll;
  for (const s of named(root)) {
    if (s.type !== "expression_statement" || named(s).length !== 1) continue;
    const a = named(s)[0]!;
    const left = a.childForFieldName("left");
    if (left?.type !== "identifier" || left.text !== "__all__") continue;
    if (a.type === "augmented_assignment") found = { computed: lineOf(s) };
    else if (a.type === "assignment") {
      const right = a.childForFieldName("right");
      const items = right !== null && (right.type === "list" || right.type === "tuple") ? named(right).map(stringValue) : [undefined];
      found = items.every((x) => x !== undefined) ? (items as string[]) : { computed: lineOf(s) };
    }
  }
  return found;
}

/** Every import of one file, the computed ones by line, its top-level declarations and its `__all__`, as plain data. */
export function readPython(root: Node): { imports: PyImport[]; computed: number[]; declarations: PyDeclaration[]; all: PyAll } {
  const imports: PyImport[] = [];
  const computed: number[] = [];
  const visit = (n: Node, typeOnly: boolean): void => {
    const line = lineOf(n);
    if (n.type === "import_statement") {
      for (const c of n.childrenForFieldName("name")) {
        const m = c.type === "aliased_import" ? c.childForFieldName("name") : c;
        if (m !== null) imports.push({ module: m.text, names: [], star: false, line, typeOnly });
      }
      return;
    }
    if (n.type === "import_from_statement") {
      const module = n.childForFieldName("module_name")?.text.replace(/\s+/g, "");
      if (module === undefined) return;
      const star = named(n).some((c) => c.type === "wildcard_import");
      const names = n
        .childrenForFieldName("name")
        .map((c) => (c.type === "aliased_import" ? (c.childForFieldName("name")?.text ?? "") : c.text))
        .filter((x) => x !== "");
      imports.push({ module, names, star, line, typeOnly });
      return;
    }
    if (n.type === "call") {
      const fn = n.childForFieldName("function")?.text;
      if (fn === "importlib.import_module" || fn === "__import__") {
        const args = n.childForFieldName("arguments");
        const arg = (args?.type === "argument_list" ? named(args) : []).filter((c) => c.type !== "keyword_argument")[0];
        const spec = arg === undefined ? undefined : stringValue(arg);
        if (spec !== undefined) imports.push({ module: spec, names: [], star: false, line, typeOnly });
        else if (arg !== undefined) computed.push(line);
      }
    }
    if (n.type === "if_statement" && isTypeChecking(n.childForFieldName("condition"))) {
      const consequence = n.childForFieldName("consequence");
      for (const c of named(n)) visit(c, typeOnly || c.id === consequence?.id);
      return;
    }
    for (const c of named(n)) visit(c, typeOnly);
  };
  visit(root, false);
  return { imports, computed, declarations: named(root).flatMap(declarationsOf), all: allOf(root) };
}

/**
 * The source roots: the repository root, `src`, and the parent of every top-level package (a directory holding an
 * `__init__.py` whose parent holds none), in code-point order. An absolute import resolves under the first that has it.
 */
export function sourceRoots(files: ReadonlySet<string>): string[] {
  const roots = new Set(["", "src"]);
  const init = (dir: string) => files.has(dir === "" ? "__init__.py" : `${dir}/__init__.py`) || files.has(dir === "" ? "__init__.pyi" : `${dir}/__init__.pyi`);
  for (const f of files) {
    if (!/(^|\/)__init__\.pyi?$/.test(f)) continue;
    const dir = posix.dirname(f) === "." ? "" : posix.dirname(f);
    if (dir === "") continue;
    const parent = posix.dirname(dir) === "." ? "" : posix.dirname(dir);
    if (!init(parent)) roots.add(parent);
  }
  return [...roots].sort(compareCodePoints);
}

/** The file a module path (a directory path with no extension, such as `src/app/models`) lands on. */
function moduleFile(stem: string, files: ReadonlySet<string>): string | undefined {
  if (stem === "") return ["__init__.py", "__init__.pyi"].find((c) => files.has(c));
  return [`${stem}.py`, `${stem}.pyi`, `${stem}/__init__.py`, `${stem}/__init__.pyi`].find((c) => files.has(c));
}

const join = (dir: string, rel: string) => (dir === "" ? rel : rel === "" ? dir : `${dir}/${rel}`);

/** The files an import lands on: one per name that is a submodule, and the module itself for the others. */
function resolveUnder(dir: string, imp: PyImport, files: ReadonlySet<string>): string[] | undefined {
  const own = moduleFile(dir, files);
  if (imp.names.length === 0) return own === undefined ? undefined : [own];
  const out: string[] = [];
  for (const name of imp.names) {
    const sub = moduleFile(join(dir, name), files) ?? own;
    if (sub === undefined) return undefined;
    if (!out.includes(sub)) out.push(sub);
  }
  return out;
}

export type Resolved = { to: string[] } | { external: string } | { unresolved: string };

/** Where one import of `from` lands: files of the source, an external package, or nothing the reader can name. */
export function resolveImport(from: string, imp: PyImport, files: ReadonlySet<string>, roots: readonly string[]): Resolved {
  const dots = imp.module.match(/^\.*/)![0].length;
  const path = imp.module.slice(dots).split(".").filter((x) => x !== "").join("/");
  if (dots > 0) {
    // A relative import starts at the importing file's package, one directory up for each dot after the first.
    let dir = posix.dirname(from) === "." ? "" : posix.dirname(from);
    for (let i = 1; i < dots; i++) {
      if (dir === "") return { unresolved: imp.module };
      dir = posix.dirname(dir) === "." ? "" : posix.dirname(dir);
    }
    const to = resolveUnder(join(dir, path), imp, files);
    return to !== undefined ? { to } : { unresolved: imp.module };
  }
  for (const root of roots) {
    const to = resolveUnder(join(root, path), imp, files);
    if (to !== undefined) return { to };
  }
  const top = imp.module.split(".")[0]!;
  // A top-level name that is a module or directory of the source is local, though this import lands on no file of it.
  const prefixes = roots.map((r) => join(r, top));
  if ([...files].some((f) => prefixes.some((p) => f === `${p}.py` || f === `${p}.pyi` || f.startsWith(`${p}/`)))) return { unresolved: imp.module };
  return { external: STDLIB.has(top) ? `python:${top}` : top };
}

/** The reader of Python source files and their pyproject.toml manifests. */
export const python: LanguageReader = {
  language: "python",
  manifest: (path) => posix.basename(path) === "pyproject.toml",
  async read(input: readonly InputFile[], ctx: FactContext): Promise<{ facts: Fact[]; diagnostics: Diagnostic[] }> {
    const base = ctx.base(TOOL);
    const facts: Fact[] = [];
    const diagnostics: Diagnostic[] = [];
    const sorted = [...input].sort((a, b) => compareCodePoints(a.path, b.path));
    const code = new Set(sorted.filter((f) => CODE.test(f.path)).map((f) => f.path));
    const roots = sourceRoots(code);
    for (const f of sorted) {
      if (!code.has(f.path)) {
        const t = tomlFields(f, ctx, TOOL, PYPROJECT_TABLES);
        facts.push(...t.facts);
        diagnostics.push(...t.diagnostics);
        continue;
      }
      facts.push({ ...base, kind: "module", at: f.path, name: f.path, language: "python" });
      const r = await parseWith("python", new TextDecoder().decode(f.bytes), readPython);
      for (const imp of r.imports) {
        const at = `${f.path}:${imp.line}`;
        const res = resolveImport(f.path, imp, code, roots);
        if ("unresolved" in res) facts.push({ ...base, kind: "skipped", at, from: f.path, reason: `unresolved ${res.unresolved}` });
        else if ("external" in res) facts.push({ ...base, kind: "depends", at, from: f.path, to: res.external, via: "import", typeOnly: imp.typeOnly, namespace: "dotted" });
        else for (const to of res.to) if (to !== f.path) facts.push({ ...base, kind: "depends", at, from: f.path, to, via: "import", typeOnly: imp.typeOnly });
      }
      for (const line of r.computed) facts.push({ ...base, kind: "skipped", at: `${f.path}:${line}`, from: f.path, reason: "computed specifier" });
      for (const d of r.declarations) facts.push({ ...base, kind: "declare", at: `${f.path}:${d.line}`, module: f.path, symbol: d.symbol, declares: d.declares, ...(d.base !== undefined ? { base: d.base } : {}), ...(d.value !== undefined ? { value: d.value } : {}) });
      // At the line that computes it: a file-level skipped fact would say the module was not read.
      if (r.all !== undefined && !Array.isArray(r.all)) facts.push({ ...base, kind: "skipped", at: `${f.path}:${r.all.computed}`, from: f.path, reason: "computed __all__" });
      else {
        const names = r.all ?? r.declarations.map((d) => d.symbol).filter((s) => !s.startsWith("_") && !s.includes("."));
        for (const symbol of [...new Set(names)]) facts.push({ ...base, kind: "export", at: f.path, module: f.path, symbol, typeOnly: false });
        // A package that re-exports with * exports names this reader does not follow, unless __all__ lists them.
        if (r.all === undefined && /(^|\/)__init__\.pyi?$/.test(f.path)) {
          for (const imp of r.imports.filter((i) => i.star)) facts.push({ ...base, kind: "export", at: f.path, module: f.path, symbol: "*", from: imp.module, typeOnly: false });
        }
      }
    }
    return { facts, diagnostics };
  },
};
