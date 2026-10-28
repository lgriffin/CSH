# ADR-36: One npm package, `@lgriffin/csh`, carries the whole tool

Source: the owner, 28 October 2026: "I'm eager to get this to a 1.0 and have it prepped for npm install and to run as a
pure CLI." Supersedes the distribution part of [ADR-32](ADR-32-local-only-distribution.md).

## Context

ADR-32 kept CSH off npm: a stranger installed it from tarballs packed from a clone, or from a tagged release that
carried the same tarballs. Twenty-seven packages had to be installed together, by path. The owner now wants
`npm install` and a plain `csh` command, with no clone and no workspace.

The tool resolves its own packages by name while it runs: `csl` for a specification, `@csh/adapter-gherkin` and the
other adapters a manifest names, the adapter runner beside `@csh/run`. Any packaging must keep those names resolvable.

## Decision

One package, `@lgriffin/csh` ([Q-84](../../QUESTIONS.md)), is published. Its commands are `csh`, `cshx` (the same
command under a name no shell has), `csl` and `csh-agent`.

- **The workspace packages are bundled.** `packages/testkit/src/npm-package.ts` packs every package as the tarball
  release does (compiled JavaScript, A-40), at one version, and places each inside the package under `node_modules`,
  named as in the workspace. They are `bundleDependencies`, so npm installs the copies inside the package and never
  looks for `@csh/*` on the registry ([A-270](../../ASSUMPTIONS.md)).
- **The registry packages are its dependencies.** TypeScript, z3-solver, web-tree-sitter, smol-toml and the MCP SDK
  are declared once, at the exact versions the workspace locks, and shared with anything else the user installs. A
  bundled package declares none of its own ([A-271](../../ASSUMPTIONS.md)).
- **The grammars are carried, not installed.** The tree-sitter grammar packages build a native binding when installed,
  which CSH never loads. The package carries their WebAssembly files and licences instead ([A-272](../../ASSUMPTIONS.md)).
- **CI installs it three ways.** The `npm package` job installs the packed package globally, into a project and
  through `npx`, on Linux, macOS and Windows, and analyses a repository from each (`.github/scripts/npm-smoke.sh`).
- **Publishing is the owner's.** The release workflow publishes on a tag `v*` only when the repository holds the
  owner's `NPM_TOKEN` secret, from an environment the owner can set to wait for their approval. Every package keeps
  `"private": true` in the workspace, so nothing else can be published by accident. The steps are in
  [the release guide](../guides/release.md).

The workspace is unchanged: it still runs TypeScript directly (ADR-18), and the tarball release stays.

## Alternatives

- **Publish each workspace package under a scope.** Twenty-seven packages to publish and version together, and the
  `@csh` scope is not the owner's.
- **One bundle file.** A bundler would merge the code into one file, but the names resolved at run time would no
  longer resolve, and the adapter sandbox would need another way to find its runner.

## Consequences

`npm install --global @lgriffin/csh` installs about 100 MB, most of it TypeScript and the Z3 solver; the package
itself is under 1 MB. `csh --version` gives the package's version. A global `csh` can shadow the C shell, so
documentation names `cshx` beside it.

## Status

Accepted. The owner asked for npm on 28 October 2026 and chose the name the same day.
