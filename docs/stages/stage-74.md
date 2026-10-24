# Stage 74: Snapshot entries and outputs named after a test, beyond TypeScript

**Exit:** fixtures F220 to F222, written from [21](../spec/21-test-suites-as-evidence.md), section 3, and committed
before the code. syrupy, insta, ApprovalTests and Go golden files are read to the standard stage 71 set for Jest and
Vitest. Every subject in CI still meets its expected results and its `analysis-expected.json`.

**Status:** exit reached. `BUILT_THROUGH_STAGE` stays 75.

## Built

- `adapter-items`: `outputDirsOf(paths, read)` takes the text of the files a row of section 3 needs, and records each
  one it asked for (`opened`). It reads syrupy's `# name:` lines (`syrupyKeys`, `syrupyName`) against a module's tests
  (`pythonTestNames`); pairs an insta snapshot with the source its header names (`instaSource`, `instaName`,
  `rustSnapshotNames`), keeping that source code (`code`); matches an approved file's method (`javaDeclares`); and
  pairs a Go golden file or baseline with a test function (`goTestFunctions`, `testFunctionOf`), the eighth
  convention, "named after a test function". Each output read this way is an entry (`entries`), which the adapter
  turns into the attributes of stage 71 (A-269).
- `run`: the proposal hands `outputDirsOf` its reader, reads whole every file the pairing opened, and leaves an insta
  source in Code. A golden file with two siblings of its stem has both siblings read by name, so the adapter sees the
  same two the proposal saw.
- `check`: an `obsolete-snapshot` for a whole output (a golden, approved or insta file) says the file stays and no
  test reads it.

F211 changes: `TestFormat.golden` is now named after `TestFormat` of `format_test.go`, as the Go row says, so three of
three cases converge and one file (`twice.golden`, with two siblings) stays unpaired. F222's fourslash entries name
the reference tree's child `fourslash` as their subject, as F219's do; its first draft named the subdirectory, which
no convention reports.

## What the run revealed

| Subject | New | Checked |
|---|---|---|
| lgriffin/TypeScript read cold, at `a91e938` | `api` and `astnav` converge, named after a test function; fourslash's unpaired baselines fall from 217 to 54 | `encodeSourceFile*.txt` name `TestEncodeSourceFile*` of `internal/api/encoder/encoder_test.go`, and the seven `astnav` baselines the functions of `internal/astnav/tokens_test.go`. 284 gaps, 14 indeterminate, 20 converged (were 16 and 18) |
| ESI.ts, read cold and through its profile | none | its snapshots are Vitest's, which stage 71 reads |
| The seven other CI subjects | none | every expected result met |

The fourslash baselines left are named after no test file and no single test function: a shared helper writes them,
or a function two files declare. Q-83 records the choice.
