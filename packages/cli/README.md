# @csh/cli

## Purpose

`@csh/cli` provides the two commands, `csl` (emit, print, lock) and `csh` (check, gaps, explain, approve, reject, retire, waive, countersign, gate), and the pipeline that joins the other packages: emit the specification, run each source through its adapter in an isolated subprocess, resolve authority from the ledger, check, and gate. It also loads the project on disk: configuration, lock file, git state and snapshot.

## Where it sits

It is the "Command line" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (csl command, csh command, project, source runner, pipeline) are in [components-cli.mmd](../../docs/architecture/components-cli.mmd). It runs in the main process and is trusted; the adapters and specification modules it starts are not.

## Public interface

- `csh(argv, io)`: the `csh` command; returns the exit code. `bin/csh.js` is its entry point.
- `csl(argv, io)`: the `csl` command; `bin/csl.js` is its entry point.
- `parseArgs(argv)`, `Args`: positionals, `--key value` options and flags.
- `evaluateSpec(spec, opts)`, `checkModule(module, digest, opts)`, `PipelineOptions`, `PipelineResult`: the full pipeline for one specification.
- `readConfig(dir)`, `FixtureConfig`, `fixtureRoot(spec)`: per-fixture configuration (`inputs/config.json`) and root.
- `runSources(module, opts)`, `RunSourcesOptions`, `SourceRun`: run every declared source through its adapter.
- `runIsolated(adapterUrl, input, timeoutMs)`: run one adapter in a permission-restricted subprocess, input over IPC.
- `BUILTIN_ADAPTERS`: `Witnesses` to `@csh/adapter-witness-files`, `Requirements` to `@csh/adapter-ears-markdown`.
- `loadProject(cwd, root)`, `Project`, `ProjectConfig`, `specOf`: the project on disk.
- `ledgerOf(project, spec)`: the ledger read from history, with authorship once a second person is listed.
- `snapshotOf(project, ...)`, `unchangedSince(project)`: the gate snapshot, and whether implementation paths changed since a witness's commit.
- `CONFIG_PATH`, `LOCK_PATH`, `REPORT_PATH`, `MODEL_PATH`, `CACHE_DIR`: file locations (`csh/config.json`, `csh/lock.json`, `reports/csh-report.json`, `reports/csh-model.json`, `.csh-cache`).

## Depends on and used by

- Depends on: every runtime package: `@csh/kernel`, `csl`, `@csh/emit`, `@csh/print`, `@csh/solver`, `@csh/check`, `@csh/witness`, `@csh/adapter-witness-files`, `@csh/adapter-ears-markdown`, `@csh/ledger` and `@csh/gate`. The two adapters are loaded by module specifier inside the adapter subprocess rather than imported. External: the `git` executable.
- Used by: `@csh/testkit` (fixture runner, which calls the pipeline). People run it through `bin/csh.js` and `bin/csl.js`.

## Invariants it protects

- `csh check` exits 0 whenever the run completes, whatever it found; only `csh gate` in enforcing mode exits non-zero on block (P7, CSH-011).
- Decision commands print the fragment through the canonical printer with its digest, findings and gaps, append a draft line and stop. They never commit or sign (P1, P6, CSH-015).
- A decision needs a non-empty rationale and, for a waiver, a scope and an expiry date (P9, CSH-013).
- `csh gate` runs the check itself and never trusts a report file; `--verify` recomputes the decision and refuses one made for another snapshot or one that differs (P5, CSH-010, [A-34](../../ASSUMPTIONS.md)).
- Sources are read only from inside the project root ([A-33](../../ASSUMPTIONS.md)), and the trusted maintainers root comes from `CSH_ROOT_COMMIT`, never from `csh/config.json` ([A-28](../../ASSUMPTIONS.md)).
- Adapters run in a subprocess with file reads limited to the tool's own code, an empty environment and a time limit; they receive bytes, the vocabulary and bindings, never paths or the ledger (P6; Evidence tab, section 4).
- A source with no adapter, a missing source file, an adapter crash or an adapter timeout is reported as a diagnostic and leaves obligations unknown (P3, CSH-006).
- A working tree with uncommitted changes gives the snapshot commit `HEAD-dirty`, against which no witness is current (P5, CSH-007).

## Rationale

Sources and the pipeline live here rather than in the check engine, so `@csh/check` only reads adapter output ([ADR-24](../../docs/adr/ADR-24-pipeline-in-cli.md)). Decision commands only draft ([ADR-25](../../docs/adr/ADR-25-drafts-never-commit.md)). Adapters run isolated with bytes as input ([ADR-20](../../docs/adr/ADR-20-adapter-isolation.md)). `csh check` never blocks ([ADR-11](../../docs/adr/ADR-11-check-never-blocks.md)). Node runs the TypeScript sources directly, so `bin/*.js` import `src/*.ts` ([ADR-18](../../docs/adr/ADR-18-no-build-step.md)). A `.json`-only source with no adapter is read as csh-ir/v1 claim sets ([A-13](../../ASSUMPTIONS.md)). A dirty tree is `HEAD-dirty` ([A-16](../../ASSUMPTIONS.md)). With no `implementationPaths`, every file outside `csh/` counts as implementation ([A-17](../../ASSUMPTIONS.md)). Caches are kept in `.csh-cache/` and `--no-cache` discards them ([A-31](../../ASSUMPTIONS.md)).

## How it is tested

- `test/cli.test.ts` (in a throwaway git repository): `csh check` exits 0 and writes the report and model; `csh gate` decides for the current snapshot and refuses a decision for a later commit or a forged one; an option without its value is a usage error; `csh approve` drafts a ledger line and commits nothing; a decision with no rationale is refused; `csl emit` fails on F07 and prints the digest of a valid specification.
- `test/faults.test.ts` ("no silent satisfaction", on a copy of F34): a missing witness file, a malformed witness file, an adapter that crashes (`test/adapters/crash.ts`), an adapter that never returns (`test/adapters/hang.ts`) and a witness for another commit with no history each leave obligations unknown, never satisfied.
- Fixtures: every fixture runs through `evaluateSpec` in `@csh/testkit`. F23 exercises the claims-json path; F42 to F45 and F60 to F64 exercise `ledgerOf` and the gate path.

## Known limits

- Each adapter run costs a subprocess start; a hanging adapter is stopped after the timeout (30 seconds by default).
- `csh check` and the decision commands need the Z3 WebAssembly build; there is no other solver.
- Authorship emits the specification at each historical commit in a temporary worktree, which is slow on long histories.
