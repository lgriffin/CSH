// The npm package (stage 76, ADR-36): one package a stranger installs with `npm install` and runs as a plain command,
// with no clone and no workspace. Every workspace package is packed as for the tarball release (pack.ts, A-40) and
// bundled inside it under node_modules, so the names the tool resolves at run time (`csl`, `@csh/adapter-gherkin` in a
// manifest) resolve as they do in the workspace. The packages from the registry it uses are its dependencies, so npm
// installs and shares them. Nothing is published here: publishing is the owner's (docs/guides/release.md).
//
//   node packages/testkit/src/npm-package.ts <out-dir> [--name <name>] [--version <version>]
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CARRIED, NPM_BINS, NPM_NAME, npmManifest, type PackageJson, untar } from "./npm-manifest.ts";
import { packWorkspace } from "./pack.ts";

export { CARRIED, NPM_BINS, NPM_NAME, npmManifest, untar };

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
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
