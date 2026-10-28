# Stage 77: The A3 of an analysis

**Exit:** fixtures F227 and F228, written from [22](../spec/22-analysis-a3-and-1.0.md), section 1, and committed
before the code. Every subject in CI still meets its expected results.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 77.

Leigh asked on 28 October 2026 for "the A3 report that will emerge to compliment the output".

## Built

- `a3`: `analysisSheet(analysis)` builds `csh-analysis-a3/v1` from the analysis alone: background, current
  condition, a Pareto of causes with the vital few (A-273), the mechanism of each vital cause as a hypothesis, a
  proposed goal, and countermeasures grouped by kind and place (A-274), danger first. `renderSheetMarkdown`,
  `renderSheetHtml` (the component A3's stylesheet, printed on A3 landscape), `renderStartHere` and `sheetFiles`.
- `cli`: `csh analyse` writes `csh-a3.json`, `csh-a3.md` and `csh-a3.html` beside the analysis and ends its output
  with the first three countermeasures. The help says so, and the CLI guide quotes it.
- `testkit`: an analyse fixture may expect `a3`: the vital causes, the first countermeasures, the goal and lines of
  the Markdown; `files` may name the A3's files.
- `adapter-items`, `run`: requirements written as list items (A-276).

## What the run revealed

- **A false refutation on a TypeScript repository.** F227's requirements are a bulleted list, `- **LED-1** The
  ledger shall ...`. CSH read only identifier headings and table rows, so it read no requirement, and the test that
  cites `LED-1` was reported as a reference to nothing, refuted. List items that state shall or must are now
  requirements (A-276, F228).
- **The blind expectation of F227 missed one entry.** With a test file and no results file, the analysis is right to
  report `no-results`, so all three causes are vital. The expectation was corrected; the fixture's README says so.
