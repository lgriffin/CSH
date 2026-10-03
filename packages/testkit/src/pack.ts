// Local packing (Anchor, harnesses and A3, section 10.4; A-40): every package of the workspace compiled to JavaScript
// with its declarations, and packed into a tarball a project outside the repository can install. The workspace itself
// keeps running TypeScript directly (ADR-18); compiled code exists only inside the tarballs. Nothing is published:
// every packed package keeps its private flag (ADR-32).
//
//   node packages/testkit/src/pack.ts <out-dir>
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
/** Development-only packages are never packed. */
const NOT_PACKED = new Set(["testkit"]);

interface PackageJson {
  name: string;
  version: string;
  exports?: Record<string, string>;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [k: string]: unknown;
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

/** The workspace packages that are packed, by directory name. */
export function packedPackages(repo = REPO): string[] {
  return readdirSync(join(repo, "packages"))
    .filter((d) => !NOT_PACKED.has(d) && existsSync(join(repo, "packages", d, "package.json")))
    .sort();
}

/** Compile every packed package's sources in one program, so imports between packages resolve as in the workspace. */
function compile(repo: string, dirs: string[], outDir: string): void {
  const base = ts.parseJsonConfigFileContent(JSON.parse(readFileSync(join(repo, "tsconfig.base.json"), "utf8")), ts.sys, repo).options;
  const rootNames = dirs.flatMap((d) => files(join(repo, "packages", d, "src")).filter((f) => f.endsWith(".ts")));
  const options: ts.CompilerOptions = {
    ...base,
    noEmit: false,
    declaration: true,
    rewriteRelativeImportExtensions: true,
    rootDir: join(repo, "packages"),
    outDir,
  };
  const program = ts.createProgram({ rootNames, options });
  const emitted = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics].filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    const host = { getCanonicalFileName: (f: string) => f, getCurrentDirectory: () => repo, getNewLine: () => "\n" };
    throw new Error(`packing: the sources do not compile\n${ts.formatDiagnostics(diagnostics, host)}`);
  }
}

/** A source path in package.json ("./src/index.ts") as its compiled path ("./dist/index.js"). */
const compiled = (p: string, ext = ".js") => p.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, ext);

function stagePackage(repo: string, dir: string, compiledDir: string, versions: Map<string, string>, stage: string): string {
  const src = join(repo, "packages", dir);
  const pkg = JSON.parse(readFileSync(join(src, "package.json"), "utf8")) as PackageJson;
  const out = join(stage, dir);
  mkdirSync(out, { recursive: true });
  // dist: the compiled JavaScript and declarations, and every file of src that is not TypeScript (a stylesheet).
  cpSync(join(compiledDir, dir, "src"), join(out, "dist"), { recursive: true });
  for (const f of files(join(src, "src")).filter((f) => !f.endsWith(".ts"))) cpSync(f, join(out, "dist", relative(join(src, "src"), f)));
  if (existsSync(join(src, "bin"))) {
    mkdirSync(join(out, "bin"));
    for (const f of readdirSync(join(src, "bin"))) {
      const text = readFileSync(join(src, "bin", f), "utf8")
        .replace("Node runs the TypeScript sources directly (type stripping).", "Packed: Node runs the JavaScript compiled from the sources.")
        .replace(/"\.\.\/src\/([^"]+)\.ts"/g, '"../dist/$1.js"');
      writeFileSync(join(out, "bin", f), text, { mode: 0o755 });
    }
  }
  if (existsSync(join(src, "README.md"))) cpSync(join(src, "README.md"), join(out, "README.md"));
  const exportsOut: Record<string, { types: string; default: string }> = {};
  for (const [k, v] of Object.entries(pkg.exports ?? {})) exportsOut[k] = { types: compiled(v, ".d.ts"), default: compiled(v) };
  const deps: Record<string, string> = {};
  for (const [k, v] of Object.entries(pkg.dependencies ?? {})) deps[k] = v.startsWith("workspace:") ? (versions.get(k) ?? v) : v;
  const { devDependencies: _dev, ...rest } = pkg;
  const packed: PackageJson = { ...rest, exports: exportsOut as never, dependencies: deps, files: ["dist", ...(existsSync(join(src, "bin")) ? ["bin"] : []), "README.md"] };
  writeFileSync(join(out, "package.json"), `${JSON.stringify(packed, null, 2)}\n`);
  const name = execFileSync("npm", ["pack", "--silent", "--pack-destination", stage], { cwd: out, encoding: "utf8" }).trim().split("\n").pop()!;
  return join(stage, name);
}

/** Compile and pack every packed package into outDir; returns the tarballs' paths. */
export function packWorkspace(outDir: string, repo = REPO): string[] {
  const dirs = packedPackages(repo);
  const stage = mkdtempSync(join(tmpdir(), "csh-pack-"));
  try {
    const compiledDir = join(stage, "compiled");
    compile(repo, dirs, compiledDir);
    const versions = new Map(dirs.map((d) => {
      const p = JSON.parse(readFileSync(join(repo, "packages", d, "package.json"), "utf8")) as PackageJson;
      return [p.name, p.version] as const;
    }));
    mkdirSync(outDir, { recursive: true });
    return dirs.map((d) => {
      const tgz = stagePackage(repo, d, compiledDir, versions, join(stage, "packages"));
      const dest = join(resolve(outDir), basename(tgz));
      cpSync(tgz, dest);
      return dest;
    });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (out === undefined) {
    process.stderr.write("usage: node packages/testkit/src/pack.ts <out-dir>\n");
    process.exit(2);
  }
  for (const t of packWorkspace(out)) process.stdout.write(`${relative(process.cwd(), t).split(sep).join("/")}\n`);
}
