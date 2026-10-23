# Stage 71: Snapshot entries and outputs named after a test

**Exit:** fixtures F217 to F219, written from [21](../spec/21-test-suites-as-evidence.md) and committed before the
code. In TypeScript, each entry of a Jest or Vitest snapshot file is matched with a test of the file it names. In every
language, an output no convention of stage 70 pairs may be named after a test file. Every subject in CI still meets
its expected results and its `analysis-expected.json`.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 71.

TypeScript comes first (Leigh, 23 October 2026). Stage 74 brings syrupy, insta, ApprovalTests and Go's golden files
named after a test function to the same standard, with fixtures F220 to F222.

## Built

- `adapter-items`:
  - `tests`: `testNames(text)` gives each test's describe titles and its own, and the lines of the titles CSH cannot
    read: not a literal, a template with a placeholder, or an `each` or `for` title with a `%` or `$` format. Every test
    beneath an unreadable describe is unreadable too.
  - `outputs`: `snapshotKeys` reads a snapshot file's keys, unescaped, and the runner its first line names.
    `snapshotEntries` matches each key, less its counter, with a full name joined as that runner joins it (a space and
    `: hint` in Jest, ` > ` and ` > hint` in Vitest, both when the file says neither) (A-266). `testStemOf` and the
    seventh convention, named after a test file, pair an output with the test file whose stem less its affix the
    output's name begins with (A-267).
- `check`: `obsolete-snapshot` (a gap) for an entry that names no test of a file whose titles are all literals, and
  `snapshot-undecided` (indeterminate) for a file whose unmatched entries a title CSH cannot read might name. The
  `accepted-outputs` detail counts the entries that name a test.
- `run`: `propose` reads a snapshot file's test file whole, so the entries can be matched; it was read by name in stage
  70 (F216 records the change).
- `testkit`: `BUILT_THROUGH_STAGE` is 71.

## What the run revealed

The cold read of lgriffin/TypeScript at `a91e938`:

| | Stage 70 | Stage 71 |
|---|---|---|
| `accepted-outputs` | 16 | 17: fourslash joins them, 1,546 baselines named after 1,499 test files |
| fourslash `unpaired-outputs` | 1,763 files | 217 files |

Each of the 1,546 pairs was checked against the Go source: the baseline is named after a `Test…` function that the
paired file declares. The 217 left are named after a test function in a file of another name
(`autoImportCompletion_test.go` declares `TestAutoImportCompletion1` to `3`), which is section 3's Go row and stage 74's.

Before the rule that a test file keeps the outputs of its own directory's suite, three `tsc` baselines were paired with
the fourslash tests of the same stem. `tsc_test.go`'s scenarios of that name write them, so the rule now leaves them
unpaired, and says why.

ESI.ts, read cold at its pinned commit: both Jest snapshot files match every entry with a test, 6 of 6.

No subject's expected results change.
