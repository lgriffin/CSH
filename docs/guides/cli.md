# The command line

CSH is two commands: `csh`, which reads, checks, decides and reports, and `csl`, which emits and prints a
specification. This guide is how to use them day to day. The full reference, the text `csh help` prints, is at the
end, and a test holds the two to each other.

## Running it

In a clone of this repository, after `pnpm install`:

```
node packages/cli/bin/csh.js <command> [arguments] [options]
node packages/cli/bin/csl.js <command> <file> [options]
```

Installed from the packed tarballs or a release ([ADR-32](../adr/ADR-32-local-only-distribution.md)), the same
commands are `npx csh` and `npx csl`. Below, `csh` stands for either. Node 22.18 or later and git are needed;
GnuPG only to verify signed approvals.

`csh help` lists every command, `csh help <command>` or `csh <command> --help` prints one, and `csh --version`
prints the version.

## What you will do with it

**Read a repository you already have.** `csh analyse <path>` reads any git repository cold, with no setup, and
writes `reports/csh-analysis.html` and `.json` in the current directory: danger first, then conflicts, gaps,
indeterminate and converged. It never writes into the repository and never runs its tests. Open the HTML file, or
add `--json` to read the analysis from a script.

```
csh analyse ../my-service
csh analyse ../my-service --at v2.1.0 --out reports/v2.1.0
```

**Describe a component.** `csh init` asks for each field of `csh/component.json` and guesses nothing. For a
repository you evaluate from outside, `csh init --subject <checkout>` proposes one and prints every guess
([the manifest guide](manifest.md)).

**Run it and read the results.** `csh run` runs each practice's tests, checks, decides and stores the run. The
reading commands then read its report without running anything again:

| Command | What it shows |
| --- | --- |
| `csh overview` | Every result as a gap, indeterminate or converged, and `reports/csh-overview.html` |
| `csh explain <id>` | One finding or overview entry in full, members printed |
| `csh ladder` | Every told rule on the Assertion Ladder, weakest first |
| `csh gaps` | The gap view only (this one checks again) |
| `csh coverage` | What each source reads, and the tracked files nothing reads |
| `csh status` | What is and is not protected |
| `csh queue` | What awaits the owner's decision |

Each of `overview`, `ladder` and `explain` takes `--run <dir|commit>` to read a stored run instead of the last
report, and most reading commands take `--json` for scripts.

**Decide.** `csh approve`, `reject`, `retire`, `waive` and `countersign` print what is being decided, then append
one line to `csh/ledger.ndjson`. They never commit or sign: you commit that file alone, signed with your own key
([the authority runbook](authority.md)).

```
csh approve SignInService/LockAfterFive --actor "Ada" --rationale "Agreed with the security review"
git add csh/ledger.ndjson && git commit -S -m "approve LockAfterFive"
```

**Gate a change.** In continuous integration, `csh run --mode enforcing` exits 1 when an approved rule is broken, and
`csh gate --verify reports/csh-gate.json` recomputes a stored decision and refuses one made for any other snapshot.
`csh diff <base> <head>` says what a change did to the results ([the change review guide](review.md)).

**Follow a problem.** `csh a3 open <slug>` starts an A3 from a run, `csh a3 stage` adds the run of a later commit,
and `csh a3 build` writes the sheet ([the A3 guide](a3.md)). `csh history <slug>` records a subject's releases as
stages.

## Options

- An option takes its value as `--name value` or `--name=value`. `--` ends the options, so an argument that starts
  with `--` can follow it.
- `--root <dir>` names the component's directory. Without it, csh uses the git repository's top level, or the current
  directory outside one. `--subject <dir>` reads that checkout of a subject instead of the fetched one. Both must be
  directories that exist.
- `--budget <ms>` is the solver's time per query, a whole number of milliseconds. `--mode` is `advisory` or
  `enforcing`.
- Every argument is checked before anything is read or run. A misspelt option is named with the nearest one the
  command takes (`unknown option --josn; did you mean --json?`), never ignored, and an option given twice is refused.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | The command did its work, whatever it found. A report full of gaps still exits 0. |
| 1 | It could not do its work: no manifest, a specification that does not emit, a repository it cannot read. Also: an enforcing gate blocked (`csh run`, `csh gate`), results did not meet what was expected (`csh expect`, `csh analyse --expected`), `csh a3 build --check` found the sheet out of date, or the head of `csh diff` could not be run. |
| 2 | A usage error: an unknown command or option, a missing argument or value, a value of the wrong form, a file named on the command line that is not there or not what it should be. The problem is on standard error with the command's usage. |
| 3 | Refused: `csh gate --verify` was given a decision for another snapshot or one that differs, or `csh run --at` names a commit that needs other dependencies than the installed ones. |

## Output

- Results go to standard output; problems, warnings and the output of the tests a harness runs go to standard error,
  so `csh run > summary.txt` keeps the summary alone.
- `csh check`, `csh run`, `csh overview` and `csh gate` write under `reports/` (`csh-report.json`, `csh-model.json`,
  `csh-overview.html`, `csh-gate.json`); `csh run` also stores each run under `.csh-cache/runs/`. Both are
  usually ignored by git. `csh analyse` writes under `--out`, by default `reports/` of the current directory.
- Output piped into a reader that stops early, such as `head`, ends the command quietly.
- An error nothing expected is said in one line. Set `CSH_DEBUG=1` to print where it came from.

## Environment

| Variable | Read by | Meaning |
| --- | --- | --- |
| `CSH_DEBUG` | `csh`, `csl` | Set to anything but empty or `0`, print the stack of an unexpected error. |
| `CSH_ROOT_COMMIT` | every command that reads the ledger | The commit whose maintainers file is the root of trust, pinned outside the repository ([A-28](../../ASSUMPTIONS.md)). |
| `CI` | `csh diff` | `true` refuses a dirty working tree as the head. |
| `CSH_COMMIT`, `CSH_WITNESS_FILE`, `CSH_EXECUTIONS_FILE` | a practice's harness | Set by `csh run` for the tests it runs ([the probe guide](probe.md)). |

## csl

`csl emit <spec.csl.ts>` emits the model and prints its digest, and exits 1 on any rule or error. `csl print` prints
a model or specification as canonical TypeScript, and `csl lock` writes `csh/lock.json` from the packs a
specification uses. It takes `--root`, `--help` and `--version`, and uses the same exit codes 0 to 2.

## Reference

The text `csh help` prints:

```text
csh: the Composable Specification Harness

  csh init                        Write csh/component.json by asking for each field. Guesses nothing. Writes under
                                  the same root as every other command: --root, or the git top level.
  csh init --subject <dir>        Propose csh/component.json from a checkout's tracked files: sources by directory and
                                  extension, an identifier pattern, tag and test settings, a results file. Prints
                                  every guess and what the proposal leaves unread.
  csh analyse <path> [--at <commit>] [--json] [--out <dir>] [--profile <dir>] [--expected <file>] [--budget ms]
                                  Read a repository cold: propose a profile, lift the layering and EARS sentences of
                                  its documents as told rules, read its code and tests, check, and place every result,
                                  danger first, then conflicts, gaps, indeterminate and converged. Writes
                                  csh-analysis.html and .json under --out (reports). Never writes into the repository,
                                  runs its tests or reads a ledger. Exits 0 when it completes; with --expected, 1 when
                                  the analysis does not meet that csh-expected/v1 file.
  csh run [--at <commit>] [--mode advisory|enforcing] [--budget ms] [--no-cache]
                                  Run each practice's harness, check and gate one snapshot of the component, and
                                  store the run under .csh-cache/runs/. Exits 1 only on block in enforcing mode, or
                                  when the run could not be made; 3 when a past commit needs other dependencies.
  csh check [spec] [--out report.json] [--json] [--budget ms] [--no-cache]
                                  Run every check and write the report. Exits 0 when the run completed.
  csh gaps [spec]                 Print the gap view only.
  csh coverage [--json]           What each source reads, and the tracked files no source reads, by extension.
  csh overview [--run <dir|commit>] [--signal <id>] [--out <file>] [--json]
                                  Place every result of the last report in one of three outcomes: gaps (suggestions,
                                  with what would close each), indeterminate (with what would decide it) and
                                  converged. Prints the counts by practice and kind and writes the sheet to
                                  reports/csh-overview.html, which opens on any signal as #<id>. --signal prints one.
  csh ladder [--run <dir|commit>] [--json]
                                  Every told rule on the Assertion Ladder, weakest first: its rung (L2 told, L3
                                  checked, L4 explained, L5 prevented), the mechanisms that establish it, and the
                                  outcomes of the overview entries about it. Reads the last report; decides nothing.
  csh explain <finding-id> [--run <dir|commit>]
                                  Print one finding, members rendered through the printer. With --run, from a stored
                                  run (its directory, or a commit whose newest stored run is read) rather than reports/.
  csh approve <fragment> --actor <name> --rationale <text>
                                  A fragment, or #a3/<slug> for an A3's judgments.
  csh reject <fragment> --actor <name> --rationale <text>
  csh retire <fragment> --actor <name> --rationale <text>
  csh waive <fragment> --scope <finding-id|obligation> --expires <YYYY-MM-DD> --actor <name> --rationale <text>
  csh countersign <seq> --actor <name> --rationale <text>
                                  Draft a ledger line. The tool never commits or signs: commit
                                  csh/ledger.ndjson alone, signed with your own key.
  csh status [--json]             What is and is not protected, for one component: the root of trust, the
                                  maintainers, what is approved, the gate mode and whether the stored decision is
                                  for the current snapshot. Reads only; always exits 0 when it can read the component.
  csh diff <base> <head> [--json] [--out <dir>]
                                  What a change did to the results: approvals lost, new violations, rules gone
                                  unknown, signals appeared and cleared, observations, counts. Each side is a stored
                                  run's directory, a commit (run when no run of it is stored) or . for the working
                                  tree. A side that cannot be run is unavailable, never an empty diff. Exits 0, or 1
                                  when the head cannot be run.
  csh queue [--json]              What awaits the owner's decision: candidate rules, unapproved bindings and A3
                                  judgments, each with who wrote it, how long it has waited and what approving it
                                  would unlock. Warns past csh/config.json's queueLimit. Reads only; exits 0.
  csh gate [--mode advisory|enforcing] [--out decision.json]
                                  Check and decide for the current snapshot. Exits 1 only on block in enforcing mode.
  csh gate --verify <decision.json>
                                  Recompute the decision; refuse (exit 3) one made for any other snapshot or that differs.
  csh a3 open <slug> [--at <commit>] [--stage <id>]
                                  Record a run as an A3's first stage and write an empty judgments skeleton under
                                  csh/a3/<slug>/. Never overwrites judgments.
  csh a3 stage <slug> <id> --at <commit> [--mode advisory|enforcing]
                                  Record the run of a commit as a stage, running the commit if no run is stored.
  csh a3 build <slug> [--check]   Build a3.json, a3.md and a3.html from the stage records and judgments; with
                                  --check, fail when the committed ones differ.
  csh a3 verify <slug>            Re-run every stage at its commit and report any that differs.
  csh history <slug> [--from <tag>] [--to <tag>] [--match <glob>]
                                  Run a subject at each release tag in the range (tags matching v* by default),
                                  oldest first, and record each run as a stage of the A3 <slug>, opening it if needed.
  csh results import <practice> <runner-report> [--base <dir>]
                                  Reduce a Jest or Vitest JSON report to csh-results/v1 (each test file's counts, the
                                  identifiers each citing test cites, the commit) and write it to the practice's
                                  executions path. Test names are dropped, so the file can be committed.
  csh expect [--expected <file>] [--run <dir|commit>]
                                  Compare the last report with the expected results (csh/expected.json): each
                                  expectation names an outcome, a signal kind and a subject that must be reported.
                                  Exits 1 on any mismatch.
  csh subject fetch [--at <tag|commit>]
                                  Clone the subject the manifest names at its pinned commit, or another commit beside
                                  it, under .csh-cache/subjects/.
  csh help [command]              This text, or one command's part of it. csh <command> --help does the same.
  csh --version                   The version of csh.

Options common to all: --root <dir> (default: the git repository or the current directory); --subject <dir> (a
checkout of the subject to read instead of the fetched one). An option takes its value as --name value or
--name=value; -- ends the options.

Exit codes: 0 the command did its work, whatever it found; 1 it could not, or an enforcing gate blocked, or results
did not meet what was expected; 2 a usage error, named on standard error with the command's usage; 3 a decision
refused by csh gate --verify, or a past commit that needs other dependencies (csh run). Set CSH_DEBUG=1 to print the
stack of an unexpected error.
```
