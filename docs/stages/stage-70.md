# Stage 70: Accepted outputs paired by path

**Exit:** fixtures F210 to F216, written from [21](../spec/21-test-suites-as-evidence.md) before the code. Accepted outputs
are paired with their cases by path in every language, test data leaves Code and Documents, and a source can read files
by name. Every subject in CI still meets its expected results and its `analysis-expected.json`.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 70.

## Built

- `component`: a declared source may name `names`, globs of files read by name (A-261).
- `run`:
  - `sources`: a file read by name is handed to its adapter as its path, with no bytes and the digest of none. A cached
    output is keyed by its path.
  - `coverage`: `byName` counts the files read by name, and every coverage line says how many.
  - `propose`: an `Outputs` source for every suite, owned by the tests practice, its trees and every file but a
    snapshot read by name (A-260). Files under `testdata`, and suite files that are not tests, leave Code, Documents and
    Tests, and the cases of UI outputs leave Tests (A-262).
- `adapter-items`: `outputs` pairs cases and accepted outputs by six conventions: reference trees, mirrored
  directories, golden siblings, Rust UI outputs, snapshot directories and approved files (A-263).
- `check`: `outputs` makes `accepted-outputs` (converged), `unaccepted-case` and `orphan-output` (gaps), and
  `shared-stem` and `unpaired-outputs` (indeterminate).
- `testkit`: `BUILT_THROUGH_STAGE` is 70; an `init` expectation may name `byName`.
- [Q-80](../../QUESTIONS.md) and [Q-81](../../QUESTIONS.md) record the choices left open.

## What the run revealed

The cold read of lgriffin/TypeScript at `a91e938`, before and after the stage:

| | Before | After |
|---|---|---|
| Files read | 31,872 of 67,927 | 67,656 of 67,927, 62,119 of them by name |
| Code | 27,170 files, 26,291 of them cases and emitted baselines | 879 files |
| Documents | 65, 42 of them fourslash baselines in Markdown | 23 |
| `accepted-outputs` | not read | 16: compiler (6,845 of 7,028 cases), conformance (5,845 of 5,948), transpile (25 of 25), and 13 customlint golden directories |
| `unaccepted-case` | not read | 282. The runner skips 268 of them: 42 by name in `compiler_runner.go`, and 226 by an option it no longer supports (module `system`, `umd` or `amd`, module resolution `node10` or `classic`, `baseUrl`, target `es5`, or an interop flag set false), in a directive or in a `tsconfig.json` the case holds. The other 14 ask for no emit and no type baselines, so the runner writes nothing for them while they compile clean: those are false, and Q-80 records the choice |
| `shared-stem` | not read | 2: `jsxNestedIndentation.js` and `parserReturnStatement4.js` sit beside a `.ts` or `.tsx` case of their stem, and the runner, which reads only `.ts` and `.tsx`, never compiles them |
| `unpaired-outputs` | not read | 12: fourslash, tsc, tsbuild and the other suites a Go test writes by name, which stage 71 pairs |
| `orphan-output` | not read | 0 |

The two refuted findings of the cold run are unchanged; stage 63 answers them. The read takes 50 seconds rather than 33,
for twice the files. ESI.ts, read cold at its pinned commit, has two Vitest snapshot directories, both paired.

No subject's expected results change.
