# Stage 73: Calibration on lgriffin/TypeScript, ESI.ts and the CI subjects

**Exit:** the cold reads of every subject in CI keep their expected results and their `analysis-expected.json`, and
the cold read of lgriffin/TypeScript at `a91e938` says what [21](../spec/21-test-suites-as-evidence.md), section 5,
says it should. Stage 73 has no fixtures of its own; what it changed is held by a unit test.

**Status:** exit reached. `BUILT_THROUGH_STAGE` stays 75.

## Built

- `adapter-items`: `testFunctionsOf(path)` gives the test functions an output may be named after, most specific
  first: `x.1.callHierarchy.txt` is `TestX1`, then `TestX`; `x=param.baseline.jsonc` is `TestX=param`, then `TestX`.
  An output no test file's stem names is paired with the first of them that any Go test file of the checkout
  declares: one file pairs it, two pair nothing (A-269, Q-83).

## What the calibration found

| Subject | Result | Checked |
|---|---|---|
| lgriffin/TypeScript read cold, at `a91e938` | 284 gaps, 14 indeterminate, 20 converged, 1 refuted; coverage "all 67665 eligible files read (100%), 5546 parsed and 62119 by name" | as below |
| ESI.ts read cold, at `2a2da8a` | 74 gaps, 8 indeterminate, 15 converged; 4 masked, 12 refuted | unchanged from stage 74 |
| ESI.ts through its profile | 12 findings, 110 gaps; every expectation met | unchanged |
| The seven other CI subjects | every expected result met, run and cold | |

On lgriffin/TypeScript, each line of section 5:

- **Every suite file read by name, none as code or a document.** 62,119 files are read by name; the 106 test data
  files no suite pairs are skipped and said to be (stage 75).
- **The compiler, conformance and transpile suites converge.** 6,845 of 7,028 compiler cases, 5,845 of 5,948
  conformance cases and 25 of 25 transpile cases have accepted outputs.
- **The fourslash baselines are named after their tests.** 1,559 cases, 1,720 files and 174 entries named after a
  test function, up from 1,551, 1,709 and 163 at stage 74. The `api` and `astnav` baselines converge too.
- **Each case with no output is `unaccepted-case`.** 282 of them, each one the runner skips, by its skip list in
  `compiler_runner.go` or by an option it does not support, as checked by hand at stage 70.
- **The two `.js` cases that share a stem are `shared-stem`.** `jsxNestedIndentation` and `parserReturnStatement4`:
  the runner compiles only `\.tsx?$`, so the `.js` file never writes the baseline.

The numbered and parameterised fourslash baselines were the one thing the calibration changed. Baselines such as
`callHierarchyFunctionAmbiguity.1.callHierarchy.txt` are written by `TestCallHierarchyFunctionAmbiguity1`, and
`codeLensReferencesShowOnAllFunctions=false` by `TestCodeLensReferencesShowOnAllFunctions` with that parameter:
fourslash's unpaired baselines fall from 54 to 43. Of the 43, 41 are under `fourslash/state` and are written by the
subtests of table tests in `statedeclarationmaps_test.go`, and 2 by `contentMapper`; no file name says which test
writes them, so they stay indeterminate, as they should.

The other unpaired baselines, 877 files in eight directories (`config`, `tsbuild`, `tsc`, `tscWatch`, `tsoptions`,
the fixture copy of `config`, `lsp` and `project`), are written by scenarios whose names are strings in Go tables, not
file or function names. They stay `unpaired-outputs`, which is indeterminate: CSH says it cannot tell, and does not
guess.

The one refuted entry is the dangling reference stage 63 found in `tsc/internal/format/README.md`, already reported
to the fork. Its `unexercised` entry names `FormatSpan`, `processNode` and `processPair`, which no Go test mentions.
