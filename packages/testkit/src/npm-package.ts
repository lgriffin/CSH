// The npm package (stage 76, ADR-36): one package a stranger installs with `npm install` and runs as a plain command,
// with no clone and no workspace. Every workspace package is packed as for the tarball release (pack.ts, A-40) and
// bundled inside it under node_modules, so the names the tool resolves at run time (`csl`, `@csh/adapter-gherkin` in a
// manifest) resolve as they do in the workspace. The packages from the registry it uses are its dependencies, so npm
// installs and shares them. Nothing is published here: publishing is the owner's (docs/guides/release.md).
//
//   node packages/testkit/src/npm-package.ts <out-dir> [--name <name>] [--version <version>]
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { packWorkspace } from "./pack.ts";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
/** The name the package is published under, until the owner names another (Q-84). */
export const NPM_NAME = "@lgriffin/csh";
/** The commands the package puts on PATH, each with the bundled entry point it runs. `cshx` is `csh` under a name no shell has (A-271). */
export const NPM_BINS: Record<string, string> = {
  csh: "@csh/cli/bin/csh.js",
  cshx: "@csh/cli/bin/csh.js",
  csl: "@csh/cli/bin/csl.js",
  "csh-agent": "@csh/agent/bin/csh-agent.js",
};

/**
 * Packages whose files the npm package carries instead of depending on them: the tree-sitter grammars, whose install
 * script builds a native binding CSH never loads (it reads the WebAssembly file). Each goes into the package that
 * uses it, beside the compiled code, with its licence (A-272).
 */
export const CARRIED: Record<string, { into: string; files: (pkg: string) => string[] }> = Object.fromEntries(
  ["tree-sitter-python", "tree-sitter-java", "tree-sitter-go", "tree-sitter-rust"].map((g) => [g, { into: "@csh/facts-code", files: (pkg: string) => [`${pkg}.wasm`, "LICENSE"] }]),
);

interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}

/**
 * Unpack a tarball `npm pack` wrote into dest, in Node rather than with a tar command, whose spelling of a Windows
 * path differs between the tar of Git for Windows and Windows' own. Reads ustar files and directories, and the long
 * names a pax header gives.
 */
export function untar(tgz: string, dest: string): void {
  const b = gunzipSync(readFileSync(tgz));
  const str = (at: number, n: number) => b.toString("utf8", at, at + n).replace(/\0.*$/s, "");
  let longName: string | undefined;
  for (let at = 0; at + 512 <= b.length; ) {
    if (b[at] === 0) break;
    const size = parseInt(str(at + 124, 12).trim() || "0", 8);
    const type = str(at + 156, 1);
    const prefix = str(at + 345, 155);
    const name = longName ?? (prefix !== "" ? `${prefix}/${str(at, 100)}` : str(at, 100));
    const body = b.subarray(at + 512, at + 512 + size);
    longName = undefined;
    if (type === "x") {
      const path = /\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      if (path !== null) longName = path[1];
    } else if (type === "0" || type === "") {
      const out = join(dest, ...name.split("/"));
      if (!resolve(out).startsWith(resolve(dest) + sep)) throw new Error(`untar: ${name} is outside the package`);
      mkdirSync(join(out, ".."), { recursive: true });
      writeFileSync(out, body);
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
}

/** The manifest of the npm package: its commands, the bundled packages and the registry packages they use. */
export function npmManifest(name: string, version: string, bundled: PackageJson[]): Record<string, unknown> {
  const names = new Set(bundled.map((p) => p.name));
  const deps: Record<string, string> = {};
  for (const p of bundled) {
    for (const [k, v] of Object.entries(p.dependencies ?? {})) {
      if (names.has(k)) continue;
      if (deps[k] !== undefined && deps[k] !== v) throw new Error(`npm package: ${k} is wanted at ${deps[k]} and at ${v}`);
      deps[k] = v;
    }
  }
  const sorted = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : 1)));
  const bundleDependencies = [...names].sort();
  return {
    name,
    version,
    description: "CSH reads a repository's prose, specifications, tests and code, and reports where they converge, where they leave a gap, and what it cannot decide.",
    keywords: ["static-analysis", "requirements", "specification", "documentation", "drift", "a3", "cli"],
    license: "MIT",
    homepage: "https://github.com/lgriffin/CSH#readme",
    repository: { type: "git", url: "git+https://github.com/lgriffin/CSH.git" },
    bugs: "https://github.com/lgriffin/CSH/issues",
    type: "module",
    engines: { node: ">=22.18" },
    bin: Object.fromEntries(Object.keys(NPM_BINS).map((b) => [b, `bin/${b}.js`])),
    files: ["bin", "README.md", "LICENSE"],
    // Bundled packages must also be dependencies; npm then installs the copy inside the package, never the registry's.
    dependencies: { ...sorted, ...Object.fromEntries(bundleDependencies.map((n) => [n, version])) },
    bundleDependencies,
  };
}

/** Pack the npm package into outDir; returns the tarball's path. */
export function packNpm(outDir: string, o: { name?: string; version?: string } = {}, repo = REPO): string {
  const cli = JSON.parse(readFileSync(join(repo, "packages", "cli", "package.json"), "utf8")) as PackageJson;
  const version = o.version ?? cli.version;
  const work = mkdtempSync(join(tmpdir(), "csh-npm-"));
  try {
    const tarballs = packWorkspace(join(work, "tarballs"), repo, version);
    const pkg = join(work, "package");
    const bundled: PackageJson[] = [];
    for (const t of tarballs) {
      const unpacked = join(work, "unpacked", String(bundled.length));
      mkdirSync(unpacked, { recursive: true });
      untar(t, unpacked);
      const p = JSON.parse(readFileSync(join(unpacked, "package", "package.json"), "utf8")) as PackageJson;
      for (const [carried, c] of Object.entries(CARRIED)) {
        if (c.into !== p.name || p.dependencies?.[carried] === undefined) continue;
        const from = join(createRequire(join(repo, "packages", p.name.replace("@csh/", ""), "package.json")).resolve(`${carried}/package.json`), "..");
        mkdirSync(join(unpacked, "package", "dist", "grammars"), { recursive: true });
        for (const f of c.files(carried)) cpSync(join(from, f), join(unpacked, "package", "dist", "grammars", f === "LICENSE" ? `${carried}.LICENSE` : f));
        delete p.dependencies[carried];
      }
      // A bundled package declares no dependencies: the npm package declares them all. Otherwise npm counts what a
      // bundled package depends on as bundled too, and a global install leaves those directories empty (A-271).
      const { dependencies: _deps, ...alone } = p;
      writeFileSync(join(unpacked, "package", "package.json"), `${JSON.stringify(alone, null, 2)}\n`);
      const dest = join(pkg, "node_modules", ...p.name.split("/"));
      mkdirSync(join(dest, ".."), { recursive: true });
      cpSync(join(unpacked, "package"), dest, { recursive: true });
      bundled.push(p);
    }
    mkdirSync(join(pkg, "bin"), { recursive: true });
    for (const [b, entry] of Object.entries(NPM_BINS)) {
      writeFileSync(join(pkg, "bin", `${b}.js`), `#!/usr/bin/env node\n// ${b}: the bundled ${entry.split("/bin/")[0]} command.\nimport "../node_modules/${entry}";\n`, { mode: 0o755 });
    }
    writeFileSync(join(pkg, "package.json"), `${JSON.stringify(npmManifest(o.name ?? NPM_NAME, version, bundled), null, 2)}\n`);
    cpSync(join(repo, "packages", "cli", "npm-readme.md"), join(pkg, "README.md"));
    cpSync(join(repo, "LICENSE"), join(pkg, "LICENSE"));
    const win = process.platform === "win32";
    mkdirSync(outDir, { recursive: true });
    const dest = resolve(outDir);
    const out = execFileSync("npm", ["pack", "--silent", "--pack-destination", win ? `"${dest}"` : dest], { cwd: pkg, encoding: "utf8", shell: win }).trim().split("\n").pop()!;
    return join(dest, out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(`--${k}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const name = opt("name");
  const version = opt("version")?.replace(/^v/, "");
  if (args.length !== 1) {
    process.stderr.write("usage: node packages/testkit/src/npm-package.ts <out-dir> [--name <name>] [--version <version>]\n");
    process.exit(2);
  }
  const t = packNpm(args[0]!, { ...(name !== undefined ? { name } : {}), ...(version !== undefined ? { version } : {}) });
  process.stdout.write(`${relative(process.cwd(), t).split(sep).join("/")}\n`);
}
