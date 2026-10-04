# @csh/cli

## Purpose

`@csh/cli` provides the two commands, `csl` (emit, print, lock) and `csh` (init, run, check, gaps, explain, approve, reject, retire, waive, countersign, gate). It parses arguments and prints; the evaluation itself is in `@csh/run` and the manifest in `@csh/component`.

## Where it sits

It is the "Command line" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (csl command, csh command, init) are in [components-cli.mmd](../../docs/architecture/components-cli.mmd). It runs in the main process and is trusted; the harnesses, adapters and specification modules that `@csh/run` starts on its behalf are not.

## Public interface

- `csh(argv, io)`: the `csh` command; returns the exit code. `bin/csh.js` is its entry point.
- `csl(argv, io)`: the `csl` command; `bin/csl.js` is its entry point.
- `init(cwd, root, io)`: `csh init`, which writes `csh/component.json` from answers to one question per field, under the root every command uses (`--root`, else the git top level, as `projectRoot` resolves it). `io.ask` replaces standard input in tests.
- `a3Command(project, args, io)`, `buildOutputs`, `a3Authority`, `a3Fragment`: `csh a3 open | stage | build | verify`. They find an A3's inputs (stored runs, or a run at the commit; authority of the judgments from the ledger; files as they stood at a stage's commit) and hand them to `@csh/a3`. `csh approve #a3/<slug>` drafts a decision on the judgments' digest.
- `parseArgs(argv)`, `Args`: positionals, `--key value` options and flags.

## Depends on and used by

- Depends on: `@csh/kernel`, `csl`, `@csh/emit`, `@csh/print`, `@csh/solver`, `@csh/check`, `@csh/component`, `@csh/ledger`, `@csh/gate`, `@csh/run` and `@csh/a3`. External: the `git` executable, through `@csh/run` and `@csh/ledger`.
- Used by: people, through `bin/csh.js` and `bin/csl.js`, and the two example walkthroughs.

## Invariants it protects

- `csh check` exits 0 whenever the run completes, whatever it found; only `csh gate` and `csh run` in enforcing mode exit non-zero on block (P7, CSH-011).
- `csh run` exits 3 when a past commit cannot be run against the installed dependencies, so that a missing stage is never mistaken for a passing one ([A-38](../../ASSUMPTIONS.md)).
- `csh init` asks for every field, guesses nothing from the repository, never overwrites an existing manifest, and writes nothing when the answers do not make a valid one (P10). It writes where `csh run` reads, and says so in one line when that is not the current directory ([A-61](../../ASSUMPTIONS.md)).
- Decision commands print the fragment through the canonical printer with its digest, findings and gaps, append a draft line and stop. They never commit or sign (P1, P6, CSH-015).
- A decision needs a non-empty rationale and, for a waiver, a scope and an expiry date (P9, CSH-013).
- `csh gate` runs the check itself and never trusts a report file; `--verify` recomputes the decision and refuses one made for another snapshot or one that differs (P5, CSH-010, [A-34](../../ASSUMPTIONS.md)).
- `csh a3 open` never overwrites judgments; `csh a3 build --check` fails when a committed output differs from the built one; `csh a3 verify` re-runs each stage at its commit and reports `stage-mismatch` or `stage-unverifiable`, never hiding a stage ([09](../../docs/spec/09-anchor-harness-a3.md), sections 5.7 and 5.8).
- `csh run` names `csh a3 open <slug>` when a run ends with a cross-source conflict or an enforcing block.
- `csh explain --run <dir|commit>` reads a stored run's `report.json` and `model.json`, never `reports/`: `csh run --at` writes nothing outside the run store ([A-59](../../ASSUMPTIONS.md)).
- Harness output goes to standard error and the run summary to standard output, so a script can read the summary alone.

## Rationale

The pipeline moved to `@csh/run` ([ADR-33](../../docs/adr/ADR-33-run-package.md), superseding [ADR-24](../../docs/adr/ADR-24-pipeline-in-cli.md)). Decision commands only draft ([ADR-25](../../docs/adr/ADR-25-drafts-never-commit.md)). `csh check` never blocks ([ADR-11](../../docs/adr/ADR-11-check-never-blocks.md)). Node runs the TypeScript sources directly, so `bin/*.js` import `src/*.ts` ([ADR-18](../../docs/adr/ADR-18-no-build-step.md)).

## How it is tested

- `test/cli.test.ts` (in a throwaway git repository): `csh check` exits 0 and writes the report and model; `csh gate` decides for the current snapshot and refuses a decision for a later commit or a forged one; an option without its value is a usage error; `csh approve` drafts a ledger line and commits nothing; a decision with no rationale is refused; `csh run` refuses a project with no manifest and an unknown mode; `csh init` writes the manifest from its answers, never overwrites it, and writes nothing from answers that do not make one; run in a subfolder, it writes at the git top level, where `csh run` from that subfolder finds it, and says so; `csl emit` fails on F07 and prints the digest of a valid specification.
- `test/a3.test.ts` (on a copy of the lockout example in a throwaway git repository): `csh a3 open` records the run of HEAD and writes a skeleton in which every signal is unclassified, and never overwrites it; `build --check` passes on the built sheet and fails once an output is edited; `stage` adds a stage to the judgments; `verify` re-runs each stage, and reports `stage-mismatch` for an edited report; `csh approve #a3/<slug>` drafts a line for the judgments' digest; `csh run --at` writes no report files, and `csh explain --run` reads its stored run by commit or by directory.
- `examples/lockout/walkthrough.sh` runs `csh run` and `csh a3 stage` at each stage of the lockout example, then `csh a3 build --check` and `csh a3 verify`; `examples/account/walkthrough.sh` runs `csh check` and `csh gate`.

## Known limits

- `csh check` and the decision commands need the Z3 WebAssembly build; there is no other solver.
- `csh init` reads one answer per line; it has no editing beyond what the terminal gives.
