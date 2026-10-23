# Stage 75: What a run read, parsed and skipped

**Exit:** fixture F226, written from [21](../spec/21-test-suites-as-evidence.md), section 8, and committed before the
code, with F216's coverage brought to the new counts. Every subject in CI still meets its expected results and its
`analysis-expected.json`.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 75. Stages 72 to 74 are not built yet; their fixtures, F220 to
F225, are committed with a stage below 75 and so must land with their code or be held back from the fixture run.

Leigh asked on 23 October 2026, after the cold read of lgriffin/TypeScript: "I think its a useful stat to print in the
output the number of files touched and parsed. Why are we missing files on typescript?" and then "explaining what was
skipped is important so we read 100% of eligible files (X files of Y) as a stat is good".

## Built

- `check`: `coverageLine(c)`, the one coverage line `csh run`, `csh analyse` and `csh coverage` share: the eligible
  files read and the percentage, how many parsed and how many by name, how many tracked files were skipped and why, and
  the eligible files not read. `SkipReason` and `CoverageCounts`; the analysis's `coverage` gains `eligible`, `skipped`
  and `missed`.
- `run`: `coverageOf` sorts each unread file into a reason (installed or vendored, build output, test data no suite
  pairs, with no reader) or calls it eligible. `buildOutputsOf(tracked)` finds the `dist`, `build`, `out` and `target`
  directories at the root or beside a build manifest, and `propose` passes over only those (A-268). `renderCoverage`
  lists the sources, the skipped files by reason and the eligible files not read.
- `testkit`: an init fixture's `coverage` may give `eligible`, `byName`, `parsed`, `skipped` and `linesInclude`.

## What the run revealed

The cold read of lgriffin/TypeScript at `a91e938`, before and after:

```
coverage: 67656 of 67927 tracked files read (62119 by name); not read: 105 .ts, 46 .json, 31 .yml, …
coverage: all 67665 eligible files read (100%), 5546 parsed and 62119 by name; 262 of 67927 tracked skipped: 114 with no reader, 106 test data no suite pairs, 42 installed or vendored
```

The nine files more are the Go package `tsc/internal/execute/build`, its seven source files and two tests, which a
segment named `build` had kept out of every source. The outcomes are unchanged: 282 gaps, 16 indeterminate, 17
converged. Whether a file with no reader should count against the eligible files is [Q-82](../../QUESTIONS.md).
