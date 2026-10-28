# Stage 76: The npm package

**Exit:** `npm install --global @lgriffin/csh`, `npm install @lgriffin/csh` in a project and `npx @lgriffin/csh` each
install the packed package outside the repository and run `csh analyse` on a repository, on Linux (Node 22 and 24),
macOS and Windows: the CI job `npm package`. Every other job is unchanged.

**Status:** exit reached locally on Linux with Node 22. `BUILT_THROUGH_STAGE` stays 75: this stage adds no fixture,
because what it changes is how the tool is installed, which the smoke test checks end to end.

Leigh asked on 28 October 2026: "I'm eager to get this to a 1.0 and have it prepped for npm install and to run as a
pure CLI", and chose the name `@lgriffin/csh` ([Q-84](../../QUESTIONS.md)). [ADR-36](../adr/ADR-36-npm-package.md)
records the decision and supersedes ADR-32's distribution.

## Built

- `testkit`: `src/npm-package.ts` packs the npm package: every workspace package but testkit, compiled and packed at
  one version (`packWorkspace(out, repo, version)`), unpacked in Node (`untar`) under the package's `node_modules`,
  and listed as `bundleDependencies` ([A-270](../../ASSUMPTIONS.md)). The registry packages they use are the
  package's own dependencies; a bundled package declares none ([A-271](../../ASSUMPTIONS.md)). Its commands are
  `csh`, `cshx`, `csl` and `csh-agent`.
- `facts-code`: `grammarFile(pkg)` loads a grammar from `grammars/` beside the code when the package carries it, else
  from the grammar's package. The npm package carries the four grammars' `.wasm` files and licences, so installing it
  runs no native build ([A-272](../../ASSUMPTIONS.md)).
- `packages/cli/npm-readme.md`: the README npm shows.
- CI: the job `npm package` on four systems runs `.github/scripts/npm-smoke.sh`. The script checks the package is
  public, under 3 MB, at the expected version and with every command, then installs it the three ways and analyses
  fixture F160's subject with each.
- Release: `.github/workflows/release.yml` packs the npm package at the tag's version, refuses a tag that is not
  `packages/cli/package.json`'s version, runs the same smoke test, attaches the package to the release, and publishes
  it only when the owner's `NPM_TOKEN` secret is set, from the `npm` environment. [The release guide](../guides/release.md)
  gives the owner's steps.

## What the run revealed

- **A global install left dependencies empty.** With the bundled packages declaring their registry dependencies, npm
  counted those as bundled too, created their directories inside the package, and filled none: `csh` failed on
  `import "typescript"`. A local install hid it, because npm hoisted them to the project. Fixed by A-271.
- **The grammars' install script.** `tree-sitter-python` and the others run `node-gyp-build` when installed, which
  failed in a global install and would need a compiler where no prebuild exists. CSH only loads their WebAssembly.
  Fixed by A-272.
- **Footprint.** The package is 0.8 MB; a global install is 99 MB in 104 packages, of which Z3 is 35 MB and TypeScript
  23 MB. A project install adds the same packages.
- **Hadur_Robot.** The installed package analysed lgriffin/Hadur_Robot (33,017 tracked files, 1,086 Java) cold in 88
  seconds: 148 gaps, 5 indeterminate, 3 converged.
