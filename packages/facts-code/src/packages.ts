// Packages (Analyse, danger and grain, section 5; stage 58): what a Maven module, a Go module, a cargo crate and a
// Python distribution build, as `package` facts, and the dependencies between them, so that container rules, `closed`
// and the diagram's gaps reach every language as they reach an npm workspace. A package is read from its manifest's
// fields, which the language's reader has already written; it holds the source files under its manifest's directory
// that no nearer manifest claims. A dependency between two packages is an import from a file of one to a file of the
// other, or the manifest of one naming the other.
import { compareCodePoints } from "@csh/kernel";
import type { DependencyFact, Fact, FieldFact, PackageFact } from "@csh/witness";
import type { FactContext } from "./run.ts";

export const PACKAGES_TOOL = { id: "facts-code", version: "0.1.0" } as const;

export interface Package {
  name: string;
  /** The manifest's directory, from the repository root, with no trailing slash ("" at the root). */
  dir: string;
  manifest: string;
  /** The names of other packages its manifest depends on, as written (test and development scopes excluded). */
  needs: string[];
  /** How a name is compared: a Python distribution's and a crate's names ignore case and `-`, `_` and `.` (A-199). */
  key: (name: string) => string;
}

const exact = (n: string) => n;
const folded = (n: string) => n.toLowerCase().replace(/[-_.]+/g, "-");
const unescape = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");
const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/**
 * The packages the manifests' fields declare. A `pom.xml` is a package by its `artifactId` unless its packaging is
 * `pom` (an aggregator builds nothing); a `go.mod` by its `module`; a `Cargo.toml` by its `[package] name` (a workspace
 * manifest alone declares none); a `pyproject.toml` by its `[project] name`.
 */
export function packagesOf(facts: readonly Fact[]): Package[] {
  const byFile = new Map<string, FieldFact[]>();
  for (const f of facts) if (f.kind === "field") byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  const out: Package[] = [];
  for (const [file, fields] of [...byFile].sort((a, b) => compareCodePoints(a[0], b[0]))) {
    const get = (path: string) => fields.find((f) => f.path === path)?.value;
    const under = (prefix: string) => fields.filter((f) => f.path.startsWith(prefix));
    const name = base(file);
    let pkg: Omit<Package, "dir" | "manifest"> | undefined;
    if (name === "pom.xml") {
      const artifact = get("/artifactId");
      if (artifact !== undefined && artifact !== "" && get("/packaging") !== "pom") {
        // Each dependency's fields are /dependencies/<i>/<name>; a test-scoped one is not what the module builds on.
        const deps = new Map<string, { artifact?: string; scope?: string }>();
        for (const f of under("/dependencies/")) {
          const [, , i, k] = f.path.split("/");
          const d = deps.get(i!) ?? {};
          if (k === "artifactId") d.artifact = f.value;
          if (k === "scope") d.scope = f.value;
          deps.set(i!, d);
        }
        pkg = { name: artifact, needs: [...deps.values()].flatMap((d) => (d.artifact !== undefined && d.scope !== "test" ? [d.artifact] : [])), key: exact };
      }
    } else if (name === "go.mod") {
      const module = get("/module");
      if (module !== undefined && module !== "") pkg = { name: module, needs: under("/require/").map((f) => unescape(f.path.slice("/require/".length))), key: exact };
    } else if (name === "Cargo.toml") {
      const crate = get("/package/name");
      if (crate !== undefined && crate !== "") pkg = { name: crate, needs: [...new Set(under("/dependencies/").map((f) => unescape(f.path.split("/")[2]!)))], key: folded };
    } else if (name === "pyproject.toml") {
      const dist = get("/project/name");
      if (dist !== undefined && dist !== "") pkg = { name: dist, needs: under("/project/dependencies/").flatMap((f) => /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(f.value)?.[1] ?? []), key: folded };
    }
    if (pkg !== undefined) out.push({ ...pkg, dir: dirOf(file), manifest: file });
  }
  return out;
}

/** The package holding a file: the one whose directory is the longest that contains it. */
export function holderOf(packages: readonly Package[], path: string): Package | undefined {
  let best: Package | undefined;
  for (const p of packages) {
    if (p.dir !== "" && !path.startsWith(`${p.dir}/`)) continue;
    if (best === undefined || p.dir.length > best.dir.length) best = p;
  }
  return best;
}

/**
 * The package facts of a source, and the dependencies between its packages, from the facts its readers wrote. A source
 * holding fewer than two packages writes none: with one package there is no dependency between packages to judge, and
 * a diagram that places directories rather than the one package would read it as unplaced (A-199).
 */
export function packageFacts(facts: readonly Fact[], ctx: FactContext): Fact[] {
  const packages = packagesOf(facts);
  if (new Set(packages.map((p) => p.name)).size < 2) return [];
  const b = ctx.base(PACKAGES_TOOL);
  const out: Fact[] = [];
  const seen = new Set<string>();
  for (const p of packages) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    out.push({ ...b, kind: "package", name: p.name, at: p.manifest } satisfies PackageFact);
  }
  const deps = new Set<string>();
  const depend = (from: Package, to: Package, via: "import" | "manifest", at: string, typeOnly: boolean) => {
    if (from.name === to.name) return;
    const k = `${from.name}\u0000${to.name}\u0000${via}\u0000${at}`;
    if (deps.has(k)) return;
    deps.add(k);
    out.push({ ...b, kind: "depends", from: from.name, to: to.name, via, typeOnly, at } satisfies DependencyFact);
  };
  // A name written in code or a manifest: a module path or a path under it (Go), or a name compared as its kind says.
  const named = (written: string): Package | undefined => packages.find((p) => p.key(p.name) === p.key(written) || (p.key === exact && written.startsWith(`${p.name}/`)));
  const modules = new Set(facts.flatMap((f) => (f.kind === "module" && f.language !== undefined ? [f.name] : [])));
  for (const f of facts) {
    if (f.kind !== "depends" || !modules.has(f.from)) continue;
    const from = holderOf(packages, f.from);
    if (from === undefined) continue;
    const to = modules.has(f.to) ? holderOf(packages, f.to) : f.namespace === "dotted" ? undefined : named(f.to);
    if (to !== undefined) depend(from, to, "import", f.at, f.typeOnly);
  }
  for (const p of packages) {
    for (const n of p.needs) {
      const to = packages.find((q) => q.key(q.name) === q.key(n));
      if (to !== undefined) depend(p, to, "manifest", p.manifest, false);
    }
  }
  return out;
}
