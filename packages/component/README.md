# @csh/component

## Purpose

`@csh/component` reads and checks the component manifest, `csh/component.json` (schema `csh-component/v1`): one named unit of software under evaluation, the practices that describe it, the sources each practice feeds, and each practice's harness. The manifest says what is evaluated, never what is right: it carries no judgment and no authority ([09](../../docs/spec/09-anchor-harness-a3.md), section 2.1).

## Where it sits

It is the "Component" container ([the manifest reference](../../docs/guides/manifest.md) describes each field), shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (manifest reader, structural validator, specification check) are in [components-component.mmd](../../docs/architecture/components-component.mmd). It runs in the main process and holds no state.

## Public interface

- `ComponentManifest`, `Practice`, `Harness`: the manifest's types. A harness is an argument vector, never a shell string, and the witness file it writes. A practice without a harness may name `executions`, the file a reporter run by hand writes.
- `COMPONENT_PATH`, `COMPONENT_SCHEMA`, `PRACTICE_KINDS`, `DEFAULT_EXECUTIONS`, `DEFAULT_HARNESS_TIMEOUT_MS`: `csh/component.json`, `csh-component/v1`, the four practice kinds, `reports/executions.ndjson`, and the ten minutes a harness may run when `harness.timeoutMs` does not say.
- `validateManifest(v)`: every structural problem, as `{ code, detail }`; codes `malformed-manifest`, `duplicate-practice`, `source-owned-twice`.
- `loadComponent(root)`, `parseComponent(bytes)`: the manifest and the digest of its bytes, or its problems.
- `checkAgainstModule(manifest, module)`: errors (`component-name-mismatch`, `practice-unknown-source`, `harness-file-unread`) and the sources no practice names.
- `ownersOf(manifest)`, `practiceOf(manifest, source)`: which practice owns each source.

## Depends on and used by

- Depends on: `@csh/kernel` (`digestOf`, `compareCodePoints`, the `Module` type). No external packages.
- Used by: `@csh/run` (loading a project and checking the manifest before a run), `@csh/cli` (`csh init`) and `@csh/testkit` (fixtures F80 and F81).

## Invariants it protects

- Nothing in the manifest is guessed: `csh init` writes only what a person typed, and the reader repairs nothing (P10).
- A source has one owner: two practices naming the same source is an error, not a merge.
- Every path the manifest names is inside the component root.
- A practice naming a source the specification lacks stops the run before anything is evaluated; a source no practice names is reported as the gap `unowned-source`, never silently dropped (P3).
- The manifest's digest is over its bytes and joins the snapshot, so a change of manifest is a change of snapshot (P5).

## Rationale

The component, not the project or the specification, is the unit a run evaluates and an A3 describes ([ADR-30](../../docs/adr/ADR-30-anchor-is-the-gate.md)). It is its own package so that `csh init`, the run and the test kit read it the same way, and so that `@csh/check` never learns about practices: it receives only the owners of sources and the unowned list ([ADR-33](../../docs/adr/ADR-33-run-package.md)).

## How it is tested

- `test/manifest.test.ts`: a well-formed manifest; a wrong schema, an empty name and a path outside the root; a duplicate practice and a source owned twice; steps outside a scenarios practice and a harness given as a string; a harness timeout that is not a positive whole number; an `executions` file on a practice that has a harness; the digest follows the bytes; text that is not JSON; the check against a module, with each error code and an unowned source.
- Fixtures: F80 (a practice naming a source the specification lacks) and F81 (an unowned source).

## Known limits

- Version 1 has one component per manifest and one manifest per directory. A repository with several components keeps each in its own directory, as `packages/gate` does.
- The manifest does not say which adapter version a practice expects; it names a module specifier or a path.
