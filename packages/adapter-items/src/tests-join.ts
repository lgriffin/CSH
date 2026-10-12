// Joining a runner's result to the test file it ran from when the runner names no file (Polyglot code, stage 35):
// Maven Surefire and Gradle name a Java class, `go test -json` a package's import path, and cargo-nextest a crate and
// its test binary. Each is joined from the bytes of the test files the source holds, never from a guessed path: a Java
// class by the `package` and top-level type its file declares, a Go package by the directory its `_test.go` files sit
// in and the `func TestX` one of them declares, a Rust test by its module path within the target nextest names. A
// result joins only when exactly one file of the source fits; two that fit are an ambiguity, and the result stays
// unmatched as one that fits none does (A-129).
import { inventory, languageOf, lexOther } from "./tests-other.ts";

/** What joining a runner's file and name gave: the test file, or an ambiguity between files, or nothing. */
export type Join = { file: string } | { ambiguous: true } | undefined;

/** A test file of the source, read once, lazily, for what the joins need. */
interface Known {
  path: string;
  text: string;
}

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const under = (dir: string, rest: string) => (dir === "" ? rest : rest === "" ? dir : `${dir}/${rest}`);

/** The top-level type names of a Java file and its package, read from code with comments and strings blanked. */
export function javaDeclarations(text: string): { pkg: string; types: string[] } {
  const { code } = lexOther(text, "java");
  const types: string[] = [];
  let pkg = "";
  let depth = 0;
  const re = /[{}]|\bpackage\s+([\w$]+(?:\s*\.\s*[\w$]+)*)\s*;|(?<![@\w$])(?:class|interface|enum|record)\s+([\w$]+)/g;
  for (const m of code.matchAll(re)) {
    if (m[0] === "{") depth++;
    else if (m[0] === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && m[1] !== undefined) pkg = m[1].replace(/\s+/g, "");
    else if (depth === 0 && m[2] !== undefined) types.push(m[2]);
  }
  return { pkg, types };
}

/** The module path of a `go.mod`, from its `module` line; undefined when it has none. */
export function goModule(text: string): string | undefined {
  const m = /^\s*module\s+("?)([^\s"]+)\1/m.exec(text.replace(/\/\/[^\n]*/g, ""));
  return m?.[2];
}

/** The names a `Cargo.toml` gives its package's targets: `[package] name` and `[lib] name`, read line by line. */
export function cargoNames(text: string): string[] {
  const out: string[] = [];
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    // A table (`[package]`) or an array of tables (`[[bin]]`), whose name is then not `package` or `lib`.
    const header = /^\[(\[?)\s*([\w.-]+)\s*\]\]?$/.exec(line);
    if (header !== null) section = header[1] === "[" ? `[${header[2]!}]` : header[2]!;
    else if (section === "package" || section === "lib") {
      const m = /^name\s*=\s*"([^"]+)"$/.exec(line);
      if (m !== null) out.push(m[1]!);
    }
  }
  return out;
}

/** The module path of each test function of a Rust file: its inline `mod name { ... }` blocks, outermost first, and its name. */
export function rustTestPaths(text: string): string[][] {
  const { code } = lexOther(text, "rust");
  const mods: { name: string; open: number; close: number }[] = [];
  for (const m of code.matchAll(/(?<![\w#])mod\s+(\w+)\s*\{/g)) {
    const open = m.index + m[0].length;
    let depth = 1;
    let at = open;
    while (at < code.length && depth > 0) {
      if (code[at] === "{") depth++;
      else if (code[at] === "}") depth--;
      at++;
    }
    mods.push({ name: m[1]!, open, close: at });
  }
  return inventory(text, "rust").declared.map((d) => [...mods.filter((m) => m.open <= d.at && d.at < m.close).map((m) => m.name), d.name]);
}

/** Exactly one file, or an ambiguity, or nothing. */
const one = (files: string[]): Join => {
  const set = [...new Set(files)];
  return set.length === 1 ? { file: set[0]! } : set.length > 1 ? { ambiguous: true } : undefined;
};

/**
 * The joins of one source's test files, built once per run. `join` takes a runner's file (a classname, import path or
 * binary id) and its full name, and returns the one test file both name, by each language's rule; when the rules of two
 * languages each find a file, that too is an ambiguity.
 */
export function joiner(files: { path: string; text: string }[]): (runnerFile: string, name: string) => Join {
  const java: (Known & { pkg: string; types: string[] })[] = [];
  const goTests: (Known & { dir: string; names: Set<string> })[] = [];
  const goMods: { dir: string; module: string }[] = [];
  const rust: Known[] = [];
  const crates: { dir: string; names: string[] }[] = [];
  for (const f of files) {
    const base = f.path.slice(f.path.lastIndexOf("/") + 1);
    if (base === "go.mod") {
      const module = goModule(f.text);
      if (module !== undefined) goMods.push({ dir: dirOf(f.path), module });
    } else if (base === "Cargo.toml") crates.push({ dir: dirOf(f.path), names: cargoNames(f.text) });
    else if (languageOf(f.path) === "java") java.push({ ...f, ...javaDeclarations(f.text) });
    else if (f.path.endsWith("_test.go")) goTests.push({ ...f, dir: dirOf(f.path), names: new Set(inventory(f.text, "go", f.path).declared.map((d) => d.name)) });
    else if (languageOf(f.path) === "rust") rust.push(f);
  }
  const rustPaths = new Map<string, string[][]>();
  const pathsOf = (k: Known) => {
    let p = rustPaths.get(k.path);
    if (p === undefined) rustPaths.set(k.path, (p = rustTestPaths(k.text)));
    return p;
  };

  /**
   * A Surefire or Gradle classname: `a.b.C`, `a.b.C$Inner`, or a nested class written with dots (`a.b.C.Inner`). The
   * longest package that, with the type after it, names a file's package and top-level type decides; failing that, a
   * single file whose path ends `a/b/C.java`.
   */
  const joinJava = (classname: string): Join => {
    if (java.length === 0 || !/^[\p{L}\p{N}_$]+(?:\.[\p{L}\p{N}_$]+)*$/u.test(classname)) return undefined;
    const segments = classname.split("$")[0]!.split(".");
    for (let k = segments.length - 1; k >= 0; k--) {
      const pkg = segments.slice(0, k).join(".");
      const found = java.filter((j) => j.pkg === pkg && j.types.includes(segments[k]!)).map((j) => j.path);
      if (found.length > 0) return one(found);
    }
    const tail = `${segments.join("/")}.java`;
    return one(java.filter((j) => j.path === tail || j.path.endsWith(`/${tail}`)).map((j) => j.path));
  };

  /**
   * A `go test -json` package and test: the directory the import path names, by the module line of a `go.mod` in the
   * source whose module is the longest prefix of it, or else the longest directory of `_test.go` files the import path
   * ends with; then the one file there declaring the test (a subtest's top-level test, `TestX` of `TestX/sub`).
   */
  const joinGo = (importPath: string, name: string): Join => {
    if (goTests.length === 0 || !/^[^\s:\\]+$/.test(importPath) || name === "") return undefined;
    let dir: string | undefined;
    const mod = goMods
      .filter((m) => importPath === m.module || importPath.startsWith(`${m.module}/`))
      .sort((a, b) => b.module.length - a.module.length || (a.dir < b.dir ? -1 : 1))[0];
    if (mod !== undefined) dir = under(mod.dir, importPath.slice(mod.module.length + 1));
    else {
      const dirs = [...new Set(goTests.map((g) => g.dir))].filter((d) => d !== "" && (importPath === d || importPath.endsWith(`/${d}`)));
      dir = dirs.sort((a, b) => b.length - a.length)[0];
    }
    if (dir === undefined) return undefined;
    const test = name.split("/")[0]!;
    return one(goTests.filter((g) => g.dir === dir && g.names.has(test)).map((g) => g.path));
  };

  /**
   * A cargo-nextest binary id (`crate`, `crate::itest`, `crate::bin/name`, `crate::example/name`, `crate::bench/name`)
   * and test name (`module::path::test_fn`): the one `.rs` file of that target whose `#[test]` function, under its
   * file's module path and any inline `mod` blocks, has that path. The crate's directory is that of the `Cargo.toml`
   * in the source naming it; with no `Cargo.toml` in the source at all, any directory, so long as one file fits.
   */
  const joinRust = (binaryId: string, name: string): Join => {
    const id = /^([A-Za-z0-9_-]+)(?:::(?:(bin|example|bench)\/)?([A-Za-z0-9_-]+))?$/.exec(binaryId);
    if (rust.length === 0 || id === null || name === "") return undefined;
    const [, crate, kind, target] = id;
    const norm = (s: string) => s.replace(/-/g, "_");
    const roots = crates.length === 0 ? undefined : crates.filter((c) => c.names.some((n) => norm(n) === norm(crate!))).map((c) => c.dir);
    if (roots !== undefined && roots.length === 0) return undefined;
    const want = name.split("::");
    const found: string[] = [];
    for (const k of rust) {
      const rels = roots === undefined ? suffixes(k.path) : roots.filter((r) => r === "" || k.path.startsWith(`${r}/`)).map((r) => (r === "" ? k.path : k.path.slice(r.length + 1)));
      const modules = rels.map((rel) => rustModules(rel, crate!, kind, target)).find((m) => m !== undefined);
      if (modules === undefined) continue;
      if (pathsOf(k).some((p) => p.length + modules.length === want.length && [...modules, ...p].every((s, i) => s === want[i]))) found.push(k.path);
    }
    return one(found);
  };

  return (runnerFile, name) => {
    // A JUnit report's name is the classname and the case's name joined by a space; Go's is the test's name alone.
    const own = name.startsWith(`${runnerFile} `) ? name.slice(runnerFile.length + 1) : name;
    const joins = [joinJava(runnerFile), joinGo(runnerFile, own), joinRust(runnerFile, own)].filter((j) => j !== undefined);
    if (joins.length > 1) return { ambiguous: true };
    return joins[0];
  };
}

/** Each path a file could have relative to a crate root: itself and every tail after a slash. */
function suffixes(path: string): string[] {
  const out = [path];
  for (let k = path.indexOf("/"); k >= 0; k = path.indexOf("/", k + 1)) out.push(path.slice(k + 1));
  return out;
}

/**
 * The module path of a file at `rel` (relative to its crate's directory) within the target nextest names, by Cargo's
 * default layout, or undefined when the file is not in that target. The library is `src/lib.rs` and the modules under
 * `src/`; the default binary `src/main.rs` and those modules; a named binary, integration test, example or bench is
 * `<dir>/<name>.rs` or `<dir>/<name>/main.rs` and the modules under `<dir>/<name>/`. `a/mod.rs` and `a.rs` are both `a`.
 */
export function rustModules(rel: string, crate: string, kind: string | undefined, target: string | undefined): string[] | undefined {
  const modulesOf = (rest: string) => {
    const segments = rest.replace(/\.rs$/, "").split("/");
    if (segments[segments.length - 1] === "mod") segments.pop();
    // A `mod.rs` beside a target's root is the module of no name, which Cargo's layout has none of.
    return segments.length > 0 ? segments : undefined;
  };
  if (!rel.endsWith(".rs")) return undefined;
  const inSrc = (root: string, other: string) => {
    if (!rel.startsWith("src/") || rel.startsWith("src/bin/") || rel === `src/${other}`) return undefined;
    const rest = rel.slice(4);
    return rest === root ? [] : modulesOf(rest);
  };
  if (target === undefined) return inSrc("lib.rs", "main.rs");
  // The default binary shares the library's directory, and is named after the package.
  if (kind === "bin" && target.replace(/-/g, "_") === crate.replace(/-/g, "_") && rel.startsWith("src/") && !rel.startsWith("src/bin/")) return inSrc("main.rs", "lib.rs");
  const dir = kind === "bin" ? "src/bin" : kind === "example" ? "examples" : kind === "bench" ? "benches" : "tests";
  if (rel === `${dir}/${target}.rs` || rel === `${dir}/${target}/main.rs`) return [];
  if (!rel.startsWith(`${dir}/${target}/`)) return undefined;
  return modulesOf(rel.slice(dir.length + target.length + 2));
}
