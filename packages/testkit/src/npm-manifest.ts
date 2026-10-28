// The npm package's manifest and the unpacking of a packed package (stage 76, ADR-36): the parts of
// npm-package.ts that need no child process, so that the unit tests and coverage reach them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

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

export interface PackageJson {
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

