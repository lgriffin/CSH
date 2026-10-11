# Stage 27: Scale and the overview

**Exit:** a second run of the ESI.ts profile with nothing changed reads no file again, and the overview sheet opens on every signal.

**Status:** exit reached. A first `csh check --root subjects/esi-ts` with an empty cache takes 15.5 seconds; a second, with nothing changed, takes 2.9 seconds, opens no file of the checkout, runs no blame or line history, and writes a byte-identical report. Git is still asked for the commit list and the tracked files. `csh overview` places all 143 results in one of three outcomes: 107 gaps, 5 indeterminate and 31 converged. Its sheet, `reports/csh-overview.html`, opens on any entry as `#<signal id>`.

## Built

- `run`: each source's adapter output is kept in `.csh-cache/sources/`, keyed by everything it was made from. A subject at its pinned commit is a clean checkout, so its files are keyed by path and not read on a hit; any other file is keyed by its digest ([A-117](../../ASSUMPTIONS.md)). `--no-cache` reads everything.
- `run`: the history source keeps what it asks git in `.csh-cache/history/`, keyed by HEAD and `history.since` ([A-118](../../ASSUMPTIONS.md)). The commits that changed a file since a line leave out merges and commits made before the line on a branch merged after it ([A-119](../../ASSUMPTIONS.md)).
- `run`: a results file a practice names is an input of the run, so a new results file is a new snapshot.
- `check`: `verifiedBy` counts what the runner said of the test files an item's "Verified by" names, apart from `outcomes`, since those tests do not say which item they check ([A-120](../../ASSUMPTIONS.md)).
- `check`, `cli`: `overviewOf`, `renderOverview`, `renderOverviewHtml` and `csh overview [--run] [--signal <id>] [--out] [--json]`. Every entry is a gap, indeterminate or converged, and says what to do next ([A-121](../../ASSUMPTIONS.md)).
- `cli`: `csh` waits for its output to drain before it exits, so piped output is never cut off at 64 KiB.

## What ESI.ts revealed

- **The three outcomes are lopsided.** Of 143 results, 107 are gaps, most of them `stale-prose` (75) and `unverified` (8). Only 31 converge: 9 requirements cited by passing tests, 18 whose named test files all pass, 3 satisfied obligations and the TDD source as a whole.
- **"Verified by" carries most of the test evidence.** 21 charter requirements name test files under "Verified by". The files of 18 all ran and passed; 3 (ARCH-02, TEST-05 and TEST-08) name contract or gated integration tests the unit run does not report, so they stay indeterminate. None of these tests names the requirement, so the overview says so in each entry. This and the BDD suites' silence about the charter are ESI.ts [#639](https://github.com/lgriffin/ESI.ts/issues/639) and [#640](https://github.com/lgriffin/ESI.ts/issues/640).
- **Stale prose is the bulk of the work to do.** 813 mentions on 75 items name a file changed since their line. Row 5 is still one: `guides/CHARTER.md:896` names `tests/tdd/core/security.test.ts`, changed in 1 commit since the line (`4ca8384`).

## What proved wrong or costly in the documents

- The plan keyed the cache per file. For a pinned subject even reading each file to digest it is most of the cost, and the commit already says what each file holds, so the key is the commit and the paths.
- History was most of a cold run's time: blame and `git log -L` per line. A per-file cache would not have helped; caching git's answers by HEAD did.
- The overview was planned as a sheet of signals. Placing each result as converged, gap or indeterminate needs more than signals: satisfied and unknown obligations, test outcomes and diagnostics that say a result is missing.

## What remains

- A results file still records no commit (stage 26).
- BDD results are still not joined to scenarios.
- The tool-code digest uses file sizes and modification times. A source file edited to the same size within the same millisecond would reuse output it should not.

## Effort

About 450 lines of source and 150 lines of tests. Effort was not timed.
