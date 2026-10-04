# @csh/run

## Purpose

`@csh/run` evaluates one component at one snapshot: it emits the specification and checks the manifest against it, runs each practice's harness, which records witnesses, then runs every source through its adapter, resolves authority from the ledger, checks, decides the gate, and stores the run record (`csh-run/v1`) under `.csh-cache/runs/<snapshot digest>/`. It also holds the pipeline and project loading that `csh check` and `csh gate` use ([09](../../docs/spec/09-anchor-harness-a3.md), section 4).

## Where it sits

It is the "Run" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (project, source runner, adapter runner, pipeline, evaluation, harness runner, run store, past-commit runner) are in [components-run.mmd](../../docs/architecture/components-run.mmd), and one run in order is [run-sequence.mmd](../../docs/architecture/run-sequence.mmd). It runs in the main process and is trusted; the harness commands, adapters and specification modules it starts are not.

## Public interface

- `runComponent(o)`: harnesses, evaluation, gate and stored record for the root's current state; returns the record, report, decision and directory, or a refusal code (`no-component`, `component-unusable`, `evaluation-failed`, `inputs-changed-by-harness`).
- `runAt(o)`: the same for a past commit, in a throwaway worktree. It writes nothing outside the run store: no `reports/` files, which belong to the working tree ([A-59](../../ASSUMPTIONS.md)). It refuses with `dependencies-differ`, `workspace-differs` or `unknown-commit` ([A-38](../../ASSUMPTIONS.md), [A-55](../../ASSUMPTIONS.md)).
- `RunRecord`, `HarnessRecord`, `RunResult`, `RunOptions`, `RUNS_DIR`, `GATE_PATH`, `DEPENDENCY_FILES`, `runDir(store, digest)`, `storedRuns(store, commit)` (newest first), `readStoredRun(dir)` (a stored run's record, report, decision and kept model, as `csh diff` and the A3 read them), `runHarnesses(project, manifest, out)`, `inputDigests(project, manifest, module)`, `changedInputs(before, after)`.
- `evaluateProject(project, opts)`, `decideGate(project, evaluation, mode)`: one evaluation and its gate decision, shared by `csh check`, `csh gate` and `csh run`. `emitProject(project, opts)` and `emissionProblem(emission)` make and judge the emission alone; `opts.emission` hands it to `evaluateProject` so that it is not made twice.
- `evaluateSpec(spec, opts, emission?)`, `emitSpec(spec, opts)`, `Emission`, `checkModule(module, digest, opts)`, `PipelineOptions`, `PipelineResult`, `sourceSettings(component)`: the pipeline for one specification, with or without a component.
- `runSources(module, opts)`, `runIsolated(adapterUrl, input, timeoutMs)`, `BUILTIN_ADAPTERS`: sources through their adapters, each in a permission-restricted subprocess; a practice's adapter overrides the built-in one for its sources. A Scenarios source that names no adapter and whose every file is JSON declaring `csh-ir/v1` is read as pre-lifted claims (`claims-json`), not by the Gherkin adapter ([A-66](../../ASSUMPTIONS.md)). The built-in adapters are the witness, Gherkin and EARS adapters, and since stage 18 `@csh/adapter-c4-mermaid` for `Architecture` and `@csh/facts` for `Facts`.
- `componentStatus(project, solver)`, `renderStatus(status, where)`, `ComponentStatus` (`csh-status/v1`), `UNSEEN`: `csh status` ([10](../../docs/spec/10-next-layers.md), section 3.2). It reads the manifest, the specification as emitted, the sources' items, the ledger and maintainers history, the configuration and `reports/csh-gate.json`, and writes nothing. The root is `pinned` (by `CSH_ROOT_COMMIT`, checked to be a commit holding the maintainers file), `history` (A-28) or `none`. A stored decision is `current` only when its snapshot digest equals the one `csh run` would compute now.
- `loadProject(cwd, root)`, `projectRoot(cwd, root)` (the root every command defaults to, `csh init` included), `Project`, `ProjectConfig`, `specOf`, `ledgerOf`, `snapshotOf`, `unchangedSince`, `readConfig`, `fixtureRoot`, and the paths `CONFIG_PATH`, `LOCK_PATH`, `REPORT_PATH`, `MODEL_PATH`, `CACHE_DIR`.

## Depends on and used by

- Depends on: `@csh/kernel`, `@csh/component`, `@csh/emit`, `@csh/solver`, `@csh/check`, `@csh/witness`, `@csh/adapter-witness-files`, `@csh/adapter-ears-markdown`, `@csh/ledger` and `@csh/gate`. The adapters are loaded by module specifier inside the adapter subprocess rather than imported. External: the `git` executable.
- Used by: `@csh/review` (types), `@csh/cli` (`csh run`, `csh check`, `csh gate`, the decision commands, `csl lock`) and `@csh/testkit` (the fixture runner calls `evaluateSpec`).

## Invariants it protects

- A harness's exit code is stored as an execution fact and never enters a verdict: a failing harness still gives a full evaluation (P2).
- A harness never blocks a run for ever: past its `timeoutMs` (ten minutes by default) its whole process group is killed and it is recorded with `exitCode: null` and `error: "timed out after N ms"` ([A-60](../../ASSUMPTIONS.md)). Interrupted by SIGINT, SIGTERM or SIGHUP, csh passes the signal to that group before it ends, so no harness is left running.
- Old witness and execution files are removed before a harness runs, so a run never reads witnesses from an earlier one (P5).
- A harness writes only its own witness and executions files: the specification and the files it imports, every file of every source but the harnesses' own output, each practice's local adapter and step table, `csh/component.json`, `csh/config.json` and `csh/lock.json` are digested before and after the harnesses, and a run in which any moved is refused with `inputs-changed-by-harness` ([A-57](../../ASSUMPTIONS.md)).
- The record is keyed by the snapshot digest, and stored with `report.json`, `gate.json` and the model, `model.json`, so that `csh explain --run` reads a stored run; which includes the component manifest's digest; the same snapshot always gives the same directory, and `reportDigest` and `gateDigest` are over the stored bytes.
- A run at a past commit installs nothing and is refused when the commit's dependency files differ from the working tree's; a missing stage is never filled from a neighbouring run ([A-38](../../ASSUMPTIONS.md)). A component in a subdirectory, such as a workspace package, gets the installed `node_modules` of its directories linked into the worktree ([A-50](../../ASSUMPTIONS.md)).
- A manifest error stops the run before any harness runs or any source is read: a component that will be refused runs none of its test commands, and the emission that was checked is the one evaluated ([A-58](../../ASSUMPTIONS.md)). A component with errors is never evaluated in part (P3).
- An executions file is joined to a Witnesses source only when it is named: by its practice's harness (or the reporter's default for a harness), by its practice's `executions`, or, with no manifest, by `csh/config.json`'s `executions`. A source never takes outcomes from another practice's tests ([A-62](../../ASSUMPTIONS.md)).
- `csh/config.json` may not repeat what the manifest says (`spec`, `implementationPaths`, `adapters`, `executions`): the run refuses the project rather than choose between them.
- Everything `@csh/cli` protected before the move still holds: adapters run isolated with bytes as input, sources are read from inside the root only, and a dirty tree is never current ([A-16](../../ASSUMPTIONS.md), [A-33](../../ASSUMPTIONS.md)).

## Rationale

The pipeline moved here from the command line so that a run, a check and a fixture all share one evaluation, and so that the command line is only argument parsing and printing ([ADR-33](../../docs/adr/ADR-33-run-package.md), which supersedes [ADR-24](../../docs/adr/ADR-24-pipeline-in-cli.md)). Harnesses run with the project's own permissions, exactly as running the tests by hand would, and the record says so (`sandbox: "none"`). Caches stay in `.csh-cache/` ([ADR-23](../../docs/adr/ADR-23-caches.md)).

## How it is tested

- `test/run.test.ts` (in a throwaway git repository with a scripted harness): a run executes the harness with `CSH_COMMIT` and `CSH_WITNESS_FILE`, stores a record whose digests match the stored bytes, and gives the same snapshot the same record; a failing harness is recorded and the run still evaluates; a root with no manifest and a malformed manifest are refused; a manifest that does not match the specification is refused before its harness runs; a harness that changes a source, a file the specification imports or the configuration makes the run refused; a past commit runs in a worktree that is removed afterwards and writes no report files; a component in a subdirectory whose harness imports a package installed only beside it runs at a past commit; a commit with different dependency files and a name that is not a commit are refused; harnesses sharing a file both keep their lines; the executions file is joined only where a harness, a practice or a manifest-less configuration names it; a Scenarios source of `csh-ir/v1` JSON with no adapter named is read as claims, and a named adapter or a feature file still goes to the adapter; a harness past its timeout is killed with the process it started, and recorded as timed out; csh interrupted while a harness runs takes the harness and the process it started with it.
- `test/faults.test.ts` ("no silent satisfaction", on a copy of F34): a missing or malformed witness file, an adapter that crashes or never returns, a solver fault and a witness for another commit each leave obligations unknown, never satisfied.
- Fixtures: every fixture runs through `evaluateSpec`; F80 and F81 exercise the component path.
- `examples/lockout/walkthrough.sh` runs every stage of the lockout example through `csh run`.

## Known limits

- Harnesses are not sandboxed: a run executes the project's own test command. On Windows a timeout kills the command only, not the processes it started.
- Installed from a packed tarball, an adapter's sandbox may read the whole `node_modules` directory the tool is installed in ([A-40](../../ASSUMPTIONS.md)).
- `runAt` refuses any difference in dependency files, even one that would not matter.
- Each adapter run costs a subprocess start, and authorship from history emits the specification at each historical commit, which is slow on long histories.
