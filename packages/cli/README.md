# @csh/cli

## Purpose

`@csh/cli` provides the two commands, `csl` (emit, print, lock) and `csh` (init, analyse, run, check, gaps, coverage, overview, ladder, explain, approve, reject, retire, waive, countersign, status, diff, queue, gate, a3, history, results, expect, subject, help). It parses and checks arguments and prints; the evaluation itself is in `@csh/run` and the manifest in `@csh/component`. How to use it is in [the command line guide](../../docs/guides/cli.md).

## Where it sits

It is the "Command line" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (csl command, csh command, init) are in [components-cli.mmd](../../docs/architecture/components-cli.mmd). It runs in the main process and is trusted; the harnesses, adapters and specification modules that `@csh/run` starts on its behalf are not.

## Public interface

- `csh(argv, io)`: the `csh` command; returns the exit code. `bin/csh.js` is its entry point.
- `csl(argv, io)`: the `csl` command; `bin/csl.js` is its entry point.
- `init(cwd, root, io)`: `csh init`, which writes `csh/component.json` from answers to one question per field, under the root every command uses (`--root`, else the git top level, as `projectRoot` resolves it). `io.ask` replaces standard input in tests.
- `a3Command(project, args, io)`, `buildOutputs`, `a3Authority`, `a3Fragment`: `csh a3 open | stage | build | verify`. They find an A3's inputs (stored runs, or a run at the commit; authority of the judgments from the ledger; files as they stood at a stage's commit) and hand them to `@csh/a3`. `csh approve #a3/<slug>` drafts a decision on the judgments' digest.
- `csh results import <practice> <report> [--base]` and `csh expect [--expected] [--run]` (stage 28): a runner's report reduced and written where the practice reads it, and the overview compared with a profile's expected results, exiting 1 on any mismatch ([A-124](../../ASSUMPTIONS.md), [A-125](../../ASSUMPTIONS.md)).
- `historyCommand(project, args, io)`, `stageIdOf(tag)`: `csh history <slug> [--from] [--to] [--match]` (stage 25). It runs a subject at each release tag in the range, oldest first, and records each run as a stage of the A3, opening it when needed; `csh a3 verify` runs such a stage again at its own subject commit ([A-114](../../ASSUMPTIONS.md)). `csh subject fetch --at <tag|commit>` fetches one such checkout by hand.
- `csh queue [--json]`: what awaits the owner's decision, from `componentQueue` of `@csh/run`; reads only and exits 0.
- `diffCommand(project, args, io)`, `DiffIo`: `csh diff <base> <head>`. Each side is a stored run's directory, a commit (its stored run, else a run at that commit), `.` for the working tree (refused in CI when it is dirty) or `unavailable:<reason>`, which the CI job passes when the merge base cannot be run. It finds the paths changed between the two commits with git and hands everything to `@csh/review`; `--json` prints the model, and `--out <dir>` writes `diff.json` and `diff.md`.
- `analyseCommand(args, io, solver)`: `csh analyse <path> [--at] [--json] [--out] [--profile] [--expected] [--budget]` (stage 55). It
  hands the path to `analyse` of `@csh/run`, writes `csh-analysis.html` and `csh-analysis.json` under `--out` (default
  `reports`, from the working directory, never the subject's), and the A3 of the analysis beside them (`csh-a3.html`,
  `.md`, `.json`, from `analysisSheet` of `@csh/a3`, stage 77). It prints the analysis and then the first three
  countermeasures, or with `--json` the JSON. Exit
  0 when the analysis completes, 1 when the repository cannot be read or (stage 60) when it does not meet the
  `--expected` file, each mismatch on standard error, 2 on a usage error ([16](../../docs/spec/16-analyse-danger-grain.md), section 2).
- `parseArgs(argv)`, `Args`: positionals, `--key value` and `--key=value` options, flags, and `--` to end the options. `argProblems(args, accepts)` and `valueProblems(args)` (stage 64) say what a command does not take, with the nearest option it does, and which values have the wrong form ([A-240](../../ASSUMPTIONS.md)).
- `COMMANDS`, `USAGE`, `helpOf`, `synopsis` (`src/commands.ts`, stage 64): one table of every `csh` command, its options, flags, arguments and help. `csh help`, the usage printed with each error and the argument checks read it; `docs/guides/cli.md` quotes `USAGE` in full.
- `main(name, command)` (`src/exit.ts`, stage 64): how `bin/csh.js` and `bin/csl.js` run a command as a process: an unexpected error in one line, quiet on a closed pipe, and an exit only once standard output drains ([A-242](../../ASSUMPTIONS.md), [A-243](../../ASSUMPTIONS.md)).

- `csh ladder [--run <dir|commit>] [--json]` (stage 48): every told rule of a run, weakest rung first, with what establishes its rung and the outcomes its entries landed in. It decides nothing; it reads the report and exits 0.
## Depends on and used by

- Depends on: `@csh/kernel`, `csl`, `@csh/emit`, `@csh/print`, `@csh/solver`, `@csh/check`, `@csh/component`, `@csh/ledger`, `@csh/gate`, `@csh/run`, `@csh/review` and `@csh/a3`. External: the `git` executable, through `@csh/run` and `@csh/ledger`.
- Used by: people, through `bin/csh.js` and `bin/csl.js`, and the two example walkthroughs; `@csh/agent` calls `a3Command` for its `a3_open` tool.

## Invariants it protects

- Every command checks its arguments before it reads or runs anything. An unknown command or option, a missing or malformed value, the wrong number of arguments, and a `--root` or `--subject` that is not a directory exit 2 with the problem and the command's usage on standard error ([A-240](../../ASSUMPTIONS.md)). A file named on the command line, or a report or model a reading command reads, that cannot be used exits 2 with its path ([A-241](../../ASSUMPTIONS.md)).
- No error reaches a person as a stack trace unless `CSH_DEBUG` asks for one; an error no command expected exits 1 ([A-242](../../ASSUMPTIONS.md)).
- Exit codes mean one thing each: 0 the command did its work, whatever it found; 1 it could not, or a gate blocked in enforcing mode, or results did not meet what was expected; 2 a usage error; 3 a refused decision or a past commit that needs other dependencies.
- `csh check` exits 0 whenever the run completes, whatever it found; only `csh gate` and `csh run` in enforcing mode exit non-zero on block (P7, CSH-011).
- `csh run` exits 3 when a past commit cannot be run against the installed dependencies, so that a missing stage is never mistaken for a passing one ([A-38](../../ASSUMPTIONS.md)).
- `csh init` asks for every field, guesses nothing from the repository, never overwrites an existing manifest, and writes nothing when the answers do not make a valid one (P10). It writes where `csh run` reads, and says so in one line when that is not the current directory ([A-61](../../ASSUMPTIONS.md)).
- Decision commands print the fragment through the canonical printer with its digest, findings and gaps, append a draft line and stop. They never commit or sign (P1, P6, CSH-015).
- A decision needs a non-empty rationale and, for a waiver, a scope and an expiry date (P9, CSH-013).
- `csh status` reads only, and exits 0 whenever it can read the component: it is a report, and the gate job decides. It says `unprotected` unless a maintainers file, a pinned root (`CSH_ROOT_COMMIT`), an approved fragment and an enforcing gate are all there, and it names what it cannot see (branch protection, who may edit the workflows, the variable itself).
- `csh diff` decides nothing and exits 0 whatever it shows; it exits non-zero only when the head cannot be run. A side it could not run is shown as such, never as an empty diff ([A-77](../../ASSUMPTIONS.md)).
- `csh gate` runs the check itself and never trusts a report file; `--verify` recomputes the decision and refuses one made for another snapshot or one that differs (P5, CSH-010, [A-34](../../ASSUMPTIONS.md)).
- `csh a3 open` never overwrites judgments; `csh a3 build --check` fails when a committed output differs from the built one; `csh a3 verify` re-runs each stage at its commit and reports `stage-mismatch` or `stage-unverifiable`, never hiding a stage ([09](../../docs/spec/09-anchor-harness-a3.md), sections 5.7 and 5.8).
- `csh run` names `csh a3 open <slug>` when a run ends with a cross-source conflict or an enforcing block.
- `csh explain --run <dir|commit>` reads a stored run's `report.json` and `model.json`, never `reports/`: `csh run --at` writes nothing outside the run store ([A-59](../../ASSUMPTIONS.md)).
- Harness output goes to standard error and the run summary to standard output, so a script can read the summary alone.

## Rationale

The pipeline moved to `@csh/run` ([ADR-33](../../docs/adr/ADR-33-run-package.md), superseding [ADR-24](../../docs/adr/ADR-24-pipeline-in-cli.md)). Decision commands only draft ([ADR-25](../../docs/adr/ADR-25-drafts-never-commit.md)). `csh check` never blocks ([ADR-11](../../docs/adr/ADR-11-check-never-blocks.md)). Node runs the TypeScript sources directly, so `bin/*.js` import `src/*.ts` ([ADR-18](../../docs/adr/ADR-18-no-build-step.md)).

## How it is tested

- `test/diff.test.ts` (stage 65): `csh diff` on a copy of the lockout example: two commits, each run, with `--out` writing `diff.json` and `diff.md`; a stored run's directory as a side with `--json`; HEAD against the working tree; and a head that cannot be run, unavailable and exit 1.
- `test/args.test.ts` (stage 64): the parser (`--`, `-h`, `--key=value`, a flag given a value, an empty value, an option given twice), the argument checks with their suggestions, budgets and modes, and the command table: every synopsis lists only options its command takes, `docs/guides/cli.md` quotes `csh help` in full, and the README names every command.
- `test/hardening.test.ts` (stage 64): `csh` and `csl` as a person meets them, in a scratch repository: help, `--help`, `-h` and `--version`; an unknown command or option named with the nearest; every problem at once with each synopsis; missing arguments; a `--root` that is not a directory; a waiver and a seq checked before any run; a directory with nothing to evaluate; a decision file, report and model that cannot be used; an unexpected error in one line. The bin scripts print the version, end quietly when `head` closes the pipe, and print a stack only under `CSH_DEBUG=1`.
- `test/analyse.test.ts` (stage 55): `csh analyse` on scratch repositories: usage and a directory that is not a checkout; a cold read that writes both files and leaves the repository unchanged; `--at` and `--json`; a profile beside the subject read without its ledger, with its expected results compared; a profile that names no subject refused; since stage 60, a cold read compared with `--expected`, met, missed and absent.
- `test/cli.test.ts` (in a throwaway git repository): `csh check` exits 0 and writes the report and model; `csh gate` decides for the current snapshot and refuses a decision for a later commit or a forged one; an option without its value is a usage error; `csh approve` drafts a ledger line and commits nothing; a decision with no rationale is refused; `csh run` refuses a project with no manifest and an unknown mode; `csh init` writes the manifest from its answers, never overwrites it, and writes nothing from answers that do not make one; run in a subfolder, it writes at the git top level, where `csh run` from that subfolder finds it, and says so; `csl emit` fails on F07 and prints the digest of a valid specification.
- `test/history.test.ts` (stage 25, in a throwaway subject with dated commits and two tags, and a profile pinned to it): the history source dates lines, finds a line's first commit, lists the commits since and the untraced changes with their agent mark; a run reports `stale-prose` by line, by a bare file name and for a refuted claim, `status-unsupported` and `untraced-change`; `csh history` records a stage per tag, each the run of its tag's commit, and `csh a3 verify` runs each again at it.
- F97 to F99 (and F117) run `componentStatus`, the function behind `csh status`, on scratch repositories; `packages/testkit/test/gate-job.test.ts` runs the CI gate job, which prints `csh status`, on a scratch copy of the gate component.
- `test/a3.test.ts` (on a copy of the lockout example in a throwaway git repository): `csh a3 open` records the run of HEAD and writes a skeleton in which every signal is unclassified, and never overwrites it; `build --check` passes on the built sheet and fails once an output is edited; `stage` adds a stage to the judgments; `verify` re-runs each stage, and reports `stage-mismatch` for an edited report; `csh approve #a3/<slug>` drafts a line for the judgments' digest; `csh run --at` writes no report files, and `csh explain --run` reads its stored run by commit or by directory.
- `examples/lockout/walkthrough.sh` runs `csh run` and `csh a3 stage` at each stage of the lockout example, then `csh a3 build --check` and `csh a3 verify`; `examples/account/walkthrough.sh` runs `csh check` and `csh gate`.

## Known limits

- `csh check` and the decision commands need the Z3 WebAssembly build; there is no other solver.
- `csh init` reads one answer per line; it has no editing beyond what the terminal gives.
