# @csh/run

## Purpose

`@csh/run` evaluates one component at one snapshot: it runs each practice's harness, which records witnesses, then emits the specification, runs every source through its adapter, resolves authority from the ledger, checks, decides the gate, and stores the run record (`csh-run/v1`) under `.csh-cache/runs/<snapshot digest>/`. It also holds the pipeline and project loading that `csh check` and `csh gate` use ([09](../../docs/spec/09-anchor-harness-a3.md), section 4).

## Where it sits

It is the "Run" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (project, source runner, adapter runner, pipeline, evaluation, harness runner, run store, past-commit runner) are in [components-run.mmd](../../docs/architecture/components-run.mmd). It runs in the main process and is trusted; the harness commands, adapters and specification modules it starts are not.

## Public interface

- `runComponent(o)`: harnesses, evaluation, gate and stored record for the root's current state; returns the record, report, decision and directory, or a refusal code (`no-component`, `component-unusable`, `evaluation-failed`).
- `runAt(o)`: the same for a past commit, in a throwaway worktree; refuses with `dependencies-differ` or `unknown-commit` ([A-38](../../ASSUMPTIONS.md)).
- `RunRecord`, `HarnessRecord`, `RunResult`, `RunOptions`, `RUNS_DIR`, `GATE_PATH`, `DEPENDENCY_FILES`, `runDir(store, digest)`, `runHarnesses(project, manifest, out)`.
- `evaluateProject(project, opts)`, `decideGate(project, evaluation, mode)`: one evaluation and its gate decision, shared by `csh check`, `csh gate` and `csh run`.
- `evaluateSpec(spec, opts)`, `checkModule(module, digest, opts)`, `PipelineOptions`, `PipelineResult`, `sourceSettings(component)`: the pipeline for one specification, with or without a component.
- `runSources(module, opts)`, `runIsolated(adapterUrl, input, timeoutMs)`, `BUILTIN_ADAPTERS`: sources through their adapters, each in a permission-restricted subprocess; a practice's adapter overrides the built-in one for its sources.
- `loadProject(cwd, root)`, `Project`, `ProjectConfig`, `specOf`, `ledgerOf`, `snapshotOf`, `unchangedSince`, `readConfig`, `fixtureRoot`, and the paths `CONFIG_PATH`, `LOCK_PATH`, `REPORT_PATH`, `MODEL_PATH`, `CACHE_DIR`.

## Depends on and used by

- Depends on: `@csh/kernel`, `@csh/component`, `@csh/emit`, `@csh/solver`, `@csh/check`, `@csh/witness`, `@csh/adapter-witness-files`, `@csh/adapter-ears-markdown`, `@csh/ledger` and `@csh/gate`. The adapters are loaded by module specifier inside the adapter subprocess rather than imported. External: the `git` executable.
- Used by: `@csh/cli` (`csh run`, `csh check`, `csh gate`, the decision commands, `csl lock`) and `@csh/testkit` (the fixture runner calls `evaluateSpec`).

## Invariants it protects

- A harness's exit code is stored as an execution fact and never enters a verdict: a failing harness still gives a full evaluation (P2).
- Old witness and execution files are removed before a harness runs, so a run never reads witnesses from an earlier one (P5).
- The record is keyed by the snapshot digest, which includes the component manifest's digest; the same snapshot always gives the same directory, and `reportDigest` and `gateDigest` are over the stored bytes.
- A run at a past commit installs nothing and is refused when the commit's dependency files differ from the working tree's; a missing stage is never filled from a neighbouring run ([A-38](../../ASSUMPTIONS.md)).
- A manifest error stops the run before any source is read; a component with errors is never evaluated in part (P3).
- `csh/config.json` may not repeat what the manifest says (`spec`, `implementationPaths`, `adapters`): the run refuses the project rather than choose between them.
- Everything `@csh/cli` protected before the move still holds: adapters run isolated with bytes as input, sources are read from inside the root only, and a dirty tree is never current ([A-16](../../ASSUMPTIONS.md), [A-33](../../ASSUMPTIONS.md)).

## Rationale

The pipeline moved here from the command line so that a run, a check and a fixture all share one evaluation, and so that the command line is only argument parsing and printing ([ADR-33](../../docs/adr/ADR-33-run-package.md), which supersedes [ADR-24](../../docs/adr/ADR-24-pipeline-in-cli.md)). Harnesses run with the project's own permissions, exactly as running the tests by hand would, and the record says so (`sandbox: "none"`). Caches stay in `.csh-cache/` ([ADR-23](../../docs/adr/ADR-23-caches.md)).

## How it is tested

- `test/run.test.ts` (in a throwaway git repository with a scripted harness): a run executes the harness with `CSH_COMMIT` and `CSH_WITNESS_FILE`, stores a record whose digests match the stored bytes, and gives the same snapshot the same record; a failing harness is recorded and the run still evaluates; a root with no manifest and a malformed manifest are refused; a past commit runs in a worktree that is removed afterwards; a commit with different dependency files and a name that is not a commit are refused.
- `test/faults.test.ts` ("no silent satisfaction", on a copy of F34): a missing or malformed witness file, an adapter that crashes or never returns, a solver fault and a witness for another commit each leave obligations unknown, never satisfied.
- Fixtures: every fixture runs through `evaluateSpec`; F80 and F81 exercise the component path.
- `examples/lockout/walkthrough.sh` runs every stage of the lockout example through `csh run`.

## Known limits

- Harnesses are not sandboxed: a run executes the project's own test command.
- `runAt` refuses any difference in dependency files, even one that would not matter.
- Each adapter run costs a subprocess start, and authorship from history emits the specification at each historical commit, which is slow on long histories.
