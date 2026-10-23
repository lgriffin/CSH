# Stage 72: What prose names, tests exercise

**Exit:** fixtures F223 to F225, written from [21](../spec/21-test-suites-as-evidence.md), section 4, and committed
before the code. Each symbol a document names, which resolves to the code, is set against what the code of the tests
of its language mentions. Every subject in CI still meets its expected results and its `analysis-expected.json`,
changed only where this page says.

**Status:** exit reached. `BUILT_THROUGH_STAGE` stays 75.

## Built

- `adapter-items`: `mentionsOf(path, text)`, every identifier a test file's code holds, with comments and strings
  blanked by the lexers of stage 57, in TypeScript and JavaScript, Python, Java, Go and Rust.
- `run`: `testMentions(root, runs)` reads each file of the run's `TestFiles` sources and hands the check a port of
  identifiers by language, as history is handed over, so no adapter reads another source's files (A-264).
- `check`: `trace` collects each document's `mentions-symbol` edges that resolve, with the module that declares each
  symbol, and gives `exercised` (converged), `unexercised` (a gap) or `exercise-undecided` (indeterminate). A symbol is
  exercised only by a test of its own language. An `unverified` requirement names up to three test files whose code
  mentions every term it writes (A-265).

## What the run revealed

The first run, before a symbol's language was required, set the Java `InMemoryTaskRepository` of taskboard against a
Python test of the same name, and the TypeScript `DomainError` against the Python architecture test. A mention is now
counted only from a test of the symbol's language; the spec and A-264 say so.

On the CI subjects, checked by hand:

| Subject | New | Checked |
|---|---|---|
| taskboard (`analysis-expected.json` of taskboard-typescript) | 2 `unexercised`, 2 `exercised` | `ApiExceptionHandler` appears in `ArchitectureTest.java` only in a string; no TypeScript test names `DomainError` or `ErrorCode`. Counts now 3 gaps, 1 indeterminate, 2 converged |
| ESI.ts (its profile, `csh/expected.json`) | 6 `exercised` | 43 converged becomes 49 |
| ESI.ts read cold | 11 `exercised`, 3 `unexercised` | `OLDEST_TYPESCRIPT` and `DOC_SOURCES` are named only by scripts, and `parseJsonBody` by no test |

The rung of nothing changes: a mention is not a citation.
