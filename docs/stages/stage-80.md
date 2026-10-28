# Stage 80: Seeded-drift recall

**Exit:** every TypeScript subject of [22](../spec/22-analysis-a3-and-1.0.md), section 4, has a drifts file whose drifts
CSH reports in CI, and an unrelated change moves no entry's anchor.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 80; F230 holds the fix.

## Built

- **`evaluation/drift.ts`.** `node evaluation/drift.ts <checkout> <drifts.json>` checks the checkout is at the drifts'
  commit and analyses it. It applies every drift at once (a file deleted, or text replaced, which must be there),
  commits, analyses cold, and requires each drift's entry, by outcome, kind, subject and words of its detail; an entry
  already reported before the drift fails, since it measures nothing. It then resets, appends a line to a file no
  entry names, commits, and requires every entry to keep its anchor and none to appear. The checkout is reset after
  either way; recall and stability go to the job summary, and a miss or a moved anchor exits 1.
- **Drifts** for each subject in `evaluation/drifts/`, run by the `labelled` CI job after its labels.
- **Fix:** a path written from a package's own directory, whose first folder is beside the mentioning file and not at
  the root, is dangling when it is missing there (A-288, F230). Before, any path whose first folder was not at the
  root was unchecked, so deleting `typescript/src/events/handlers.ts`, which `typescript/AGENTS.md` names as
  `src/events/handlers.ts`, went unreported. Labels on all four subjects are unchanged by it.

## What seeding found

Each subject drifted on 28 October 2026:

| Subject | Drifts | Reported | Entries | Kept their anchor |
| --- | ---: | ---: | ---: | ---: |
| ESI.ts | 4 | 4 | 63 | 63 |
| tutors-mono-repo | 4 | 4 | 79 | 79 |
| taskboard | 3 | 3 (2 before the fix) | 6 | 6 |
| lgriffin/TypeScript | 3 | 3 | 38 | 38 |

- **ESI.ts:** a deleted script ARCHITECTURE.md names, `systemClock` renamed in `src/core/clock.ts`, the soak test
  no longer naming `leakyInterceptor`, and a deleted test ARCH-06 is verified by.
- **tutors-mono-repo:** a deleted test helper the reader's README names, `convertMdToHtml` renamed, the release harness
  test no longer naming `DEFAULT_RUNS`, and a deleted contract test whose snapshot stays.
- **taskboard:** a deleted handler module, the deleted evaluation results the Assertion Ladder cites, and the task
  service test no longer naming `moveTask`.
- **lgriffin/TypeScript:** the fswatch `CHANGES.md` deleted, the LSP watcher test no longer naming `ErrOverflow`, and
  the compiler case `2dArrays` deleted with its three baselines kept.

A first ESI.ts drift, a test that stops citing ARCH-06 in its title, was not a drift: ARCH-06's Verified by names the
test file, which still verifies it. It is replaced by deleting that test.

The TypeScript fork's three analyses take about four minutes on one CI-sized machine; the others under a minute.
