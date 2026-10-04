// facts-imports: the dependencies between a workspace's packages, as csh-facts/v1 (Next layers, section 4.2). It reads
// each package's manifest `dependencies` and the import statements of its src and bin directories, through the
// TypeScript parser, and writes one fact per dependency with its file and line. A specifier it cannot resolve, such as
// a dynamic import of a computed string, is written as a skipped fact, never dropped. Tests are not read.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { FACTS_FILE, FACTS_SCHEMA, formatFacts } from "@csh/facts";
import type { DependencyFact, Fact, PackageFact, SkippedFact } from "@csh/witness";

export const TOOL = { id: "facts-imports", version: "0.1.0" } as const;
const SCANNED_DIRS = ["src", "bin"];
const EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export interface WorkspacePackage {
  name: string;
  /** The package's directory, relative to the root, with forward slashes. */
  dir: string;
  dependencies: string[];
}

const posix = (p: string) => p.split(sep).join("/");

/** The package directory patterns of a workspace: pnpm-workspace.yaml, else package.json workspaces, else packages/*. */
export function workspacePatterns(root: string): string[] {
  const pnpm = join(root, "pnpm-workspace.yaml");
  if (existsSync(pnpm)) {
    const lines = readFileSync(pnpm, "utf8").split(/\r?\n/);
    const out: string[] = [];
    let inPackages = false;
    for (const l of lines) {
      if (/^packages:\s*$/.test(l)) inPackages = true;
      else if (/^\S/.test(l)) inPackages = false;
      else if (inPackages) {
        const m = /^\s*-\s*["']?([^"']+?)["']?\s*$/.exec(l);
        if (m !== null) out.push(m[1]!);
      }
    }
    if (out.length > 0) return out;
  }
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    const w = (JSON.parse(readFileSync(pkg, "utf8")) as { workspaces?: string[] | { packages?: string[] } }).workspaces;
    const list = Array.isArray(w) ? w : w?.packages;
    if (list !== undefined && list.length > 0) return list;
  }
  return ["packages/*"];
}

/** The workspace's packages: each directory a pattern names (a path, or a path ending in /*) with a package.json. */
export function workspacePackages(root: string): WorkspacePackage[] {
  const dirs: string[] = [];
  for (const pat of workspacePatterns(root)) {
    if (pat.startsWith("!")) continue;
    if (pat.endsWith("/*")) {
      const base = join(root, pat.slice(0, -2));
      if (!existsSync(base)) continue;
      for (const e of readdirSync(base).sort()) if (statSync(join(base, e)).isDirectory()) dirs.push(posix(relative(root, join(base, e))));
    } else dirs.push(posix(pat));
  }
  return dirs
    .filter((d) => existsSync(join(root, d, "package.json")))
    .map((d) => {
      const m = JSON.parse(readFileSync(join(root, d, "package.json"), "utf8")) as { name?: string; dependencies?: Record<string, string> };
      return { name: m.name ?? d, dir: d, dependencies: Object.keys(m.dependencies ?? {}).sort() };
    });
}

/** The workspace package a module specifier names: the package itself or a path inside it. */
export function packageOf(spec: string, names: string[]): string | undefined {
  return names.find((n) => spec === n || spec.startsWith(`${n}/`));
}

export interface ImportSite {
  spec?: string;
  line: number;
  typeOnly: boolean;
  /** Set when the specifier is not a string the scan can read. */
  skipped?: string;
}

/** Every module reference of one file: imports, re-exports, import-equals, require, dynamic import and import types. */
export function importsOf(fileName: string, text: string): ImportSite[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const out: ImportSite[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const literal = (e: ts.Node | undefined): string | undefined => (e !== undefined && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : undefined);
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) {
      const c = n.importClause;
      const named = c?.namedBindings !== undefined && ts.isNamedImports(c.namedBindings) ? c.namedBindings.elements : undefined;
      const typeOnly = c !== undefined && (c.isTypeOnly || (c.name === undefined && named !== undefined && named.length > 0 && named.every((e) => e.isTypeOnly)));
      const spec = literal(n.moduleSpecifier);
      if (spec !== undefined) out.push({ spec, line: lineOf(n), typeOnly });
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier !== undefined) {
      const named = n.exportClause !== undefined && ts.isNamedExports(n.exportClause) ? n.exportClause.elements : undefined;
      const typeOnly = n.isTypeOnly || (named !== undefined && named.length > 0 && named.every((e) => e.isTypeOnly));
      const spec = literal(n.moduleSpecifier);
      if (spec !== undefined) out.push({ spec, line: lineOf(n), typeOnly });
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      const spec = literal(n.moduleReference.expression);
      if (spec !== undefined) out.push({ spec, line: lineOf(n), typeOnly: n.isTypeOnly });
    } else if (ts.isImportTypeNode(n)) {
      const arg = ts.isLiteralTypeNode(n.argument) ? literal(n.argument.literal) : undefined;
      if (arg !== undefined) out.push({ spec: arg, line: lineOf(n), typeOnly: true });
    } else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) {
      const spec = literal(n.arguments[0]);
      const what = n.expression.kind === ts.SyntaxKind.ImportKeyword ? "dynamic import" : "require";
      if (spec !== undefined) out.push({ spec, line: lineOf(n), typeOnly: false });
      else out.push({ line: lineOf(n), typeOnly: false, skipped: `${what} of a computed specifier` });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir).sort()) {
    if (e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (EXTENSIONS.test(e)) out.push(p);
  }
  return out;
}

/** HEAD, with "-dirty" appended when tracked files have uncommitted changes, as a run's snapshot names it. */
export function currentCommit(root: string): string {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const head = git("rev-parse", "HEAD");
    return git("status", "--porcelain", "--untracked-files=no") === "" ? head : `${head}-dirty`;
  } catch {
    return "unknown";
  }
}

/** Every fact of a workspace, in a stable order: packages, then each package's manifest and files. */
export function scanWorkspace(root: string, commit: string): Fact[] {
  const pkgs = workspacePackages(root);
  const names = pkgs.map((p) => p.name);
  // Fields in the order the format lists them: schema, kind, what, where, then the commit and the tool.
  const fact = <F extends Fact>(body: Omit<F, "schema" | "subject" | "tool">): F => ({ schema: FACTS_SCHEMA, ...body, subject: { commit }, tool: { ...TOOL } }) as F;
  const facts: Fact[] = pkgs.map((p) => fact<PackageFact>({ kind: "package", name: p.name, at: `${p.dir}/package.json` }));
  for (const p of pkgs) {
    for (const d of p.dependencies) {
      const to = packageOf(d, names);
      if (to !== undefined && to !== p.name) facts.push(fact<DependencyFact>({ kind: "depends", from: p.name, to, via: "manifest", typeOnly: false, at: `${p.dir}/package.json` }));
    }
    for (const dir of SCANNED_DIRS) {
      for (const file of filesUnder(join(root, p.dir, dir))) {
        const rel = posix(relative(root, file));
        for (const site of importsOf(file, readFileSync(file, "utf8"))) {
          if (site.skipped !== undefined) {
            facts.push(fact<SkippedFact>({ kind: "skipped", from: p.name, reason: site.skipped, at: `${rel}:${site.line}` }));
            continue;
          }
          const to = packageOf(site.spec!, names);
          if (to !== undefined && to !== p.name) facts.push(fact<DependencyFact>({ kind: "depends", from: p.name, to, via: "import", typeOnly: site.typeOnly, at: `${rel}:${site.line}` }));
        }
      }
    }
  }
  return facts;
}

const USAGE = "usage: facts-imports [--root <dir>] [--out <file>]\n";

export function main(argv: string[], io: { out: (s: string) => void; err: (s: string) => void; cwd: string; env: NodeJS.ProcessEnv }): number {
  let root = io.cwd;
  let out = FACTS_FILE;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--root" || a === "--out") && argv[i + 1] !== undefined) {
      if (a === "--root") root = resolve(io.cwd, argv[++i]!);
      else out = argv[++i]!;
    } else {
      io.err(USAGE);
      return 2;
    }
  }
  const commit = io.env.CSH_COMMIT !== undefined && io.env.CSH_COMMIT !== "" ? io.env.CSH_COMMIT : currentCommit(root);
  const facts = scanWorkspace(root, commit);
  const file = resolve(root, out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, formatFacts(facts));
  const count = (k: Fact["kind"]) => facts.filter((f) => f.kind === k).length;
  io.out(`facts-imports: ${count("package")} packages, ${count("depends")} dependencies, ${count("skipped")} skipped, at ${commit}; wrote ${posix(relative(root, file))}\n`);
  return 0;
}
