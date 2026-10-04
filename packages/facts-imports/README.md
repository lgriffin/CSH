# @csh/facts-imports

## Purpose

`@csh/facts-imports` is the command that writes dependency facts: it reads each workspace package's manifest `dependencies` and the import statements of its `src` and `bin` directories, through the TypeScript parser, and writes one `csh-facts/v1` line per dependency between packages of the workspace, with its file and line ([10](../../docs/spec/10-next-layers.md), section 4.2). A practice of kind `facts` runs it as its harness.

## Where it sits

It belongs to the "Harnesses" container of the [containers diagram](../../docs/architecture/containers.mmd): `csh run` runs it, like a test harness, before the check. It is drawn in [components-facts.mmd](../../docs/architecture/components-facts.mmd).

```sh
node packages/facts-imports/bin/facts-imports.js --root . --out reports/facts.ndjson
```

## Public interface

- `facts-imports [--root <dir>] [--out <file>]` (`bin/facts-imports.js`, `main`): scans the workspace at `--root` and writes `--out` (default `reports/facts.ndjson`), stamping `CSH_COMMIT` when the harness runner sets it, else HEAD with `-dirty` for a dirty tree.
- `scanWorkspace(root, commit)`: every fact, in a stable order: packages, then each package's manifest and files.
- `importsOf(file, text)`, `ImportSite`: every module reference of one file: imports, re-exports, import-equals, `require`, dynamic `import()` and import types, each with its line and whether it is type-only.
- `workspacePackages(root)`, `workspacePatterns(root)`, `packageOf(spec, names)`, `currentCommit(root)`, `TOOL`.

## Depends on and used by

- Depends on: `@csh/facts` (writer), `@csh/witness` (fact types) and `typescript` (the parser, an external package).
- Used by: the `Workspace` component's `facts` practice (`csh/component.json`), through `csh run`.

## Invariants it protects

- A specifier the scan cannot read, such as a dynamic import of a computed string, is written as a `skipped` fact with its file and line, never dropped (section 10: "reports what it skipped").
- An import whose every name is a type is a dependency, with `typeOnly: true` ([A-74](../../ASSUMPTIONS.md)).
- Tests and development dependencies are not read; a package's import of itself and of packages outside the workspace are not facts ([A-83](../../ASSUMPTIONS.md)).

## Rationale

The TypeScript parser reads re-exports, type-only forms and dynamic imports exactly, where a pattern would guess ([DEPENDENCIES.md](../../DEPENDENCIES.md), checklist of section 11.1).

## How it is tested

- `test/scan.test.ts`: every reference form with its line and type-only flag, specifier resolution, a scan of a small workspace (manifest, import, skipped dynamic import; tests, self-imports and outside packages left out), and the command stamping the commit it is given.
- The `Workspace` component's run, in [the stage 18 note](../../docs/stages/stage-18.md).

## Known limits

- TypeScript and JavaScript only. Another language needs its own facts command; the adapter and the evaluation do not change ([10](../../docs/spec/10-next-layers.md), section 4.5).
- A relation that runs through a subprocess, a pipe or a file is invisible.
