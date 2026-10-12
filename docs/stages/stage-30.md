# Stage 30: Results from other runners

**Exit:** JUnit XML, as pytest, Maven Surefire, Gradle and cargo-nextest write it, and `go test -json` are read as
runner results, reduced by `csh results import` to `csh-results/v1`, and joined by the tests adapter as Jest's and
Vitest's reports are ([12](../spec/12-polyglot-code.md), section 4).

**Status:** exit reached for reading and reducing. `parseTestResults` recognises both formats and every consumer
(`reduceTestResults`, `csh results import`, the tests adapter) goes through it unchanged. Results join a test file when
the report names one: pytest's do, by its `file` attribute or by the module its classname names. Surefire, Gradle,
cargo-nextest and `go test -json` name a class, a crate or a package, not a file: their results are reduced under that
name and counted by the tests adapter as `results-unmatched`, never dropped and never guessed ([A-129](../../ASSUMPTIONS.md)).

## Built

- `witness`: `runners.ts`, read by `parseTestResults` before the formats it read already.
  - **JUnit XML**, recognised by a root of `testsuites` or `testsuite` after any declaration, comments and doctype, and
    read with the stage 29 XML reader. Each `testcase`, through any nesting of suites, is one result. Its file is its
    `file` attribute or its suite's; else, when a suite is named `pytest` or the classname's last segment starts with
    `test_`, the classname up to its last segment named like a test module (`test_*`, `*_test`) as a `.py` path; else
    the classname as written. Its name is the classname and the name joined by a space, so an identifier in either is
    cited. `failure` is failed, `error` errored, `skipped` skipped (pytest's xfail too), anything else passed; a
    failure wins over an error. `at` is the test case's line. Malformed XML and a test case with no name are problems
    with their line.
  - **`go test -json`**, recognised by a first non-empty line that is an object with string `Action` and `Package`.
    Each `pass`, `fail` or `skip` of a test is a result under its package's import path, with its full name, subtests
    included (`TestAdd/CART-1`). A package that failed with no test failing in it (a build failure, an exit from
    `TestMain`) is one errored result with an empty name. Output and other events are read past, as are the
    build events Go 1.24 writes with an `ImportPath` and no `Package`. A line that is not JSON, or not an object with an
    `Action`, is a problem with its line.
- Jest and Vitest reports, `csh-results/v1` files and `csh-execution/v1` lines are read as before; the existing tests
  pass unchanged.

## What the tests revealed

- **A runner that joins an identifier to a word hides it.** Go writes a subtest's spaces as underscores and pytest's
  names are Python identifiers, so `TestAdd/CART-1_empty_cart` and `test_login_REQ_1` cite nothing under the default
  pattern, whose `\b` sees no boundary between `1` and `_`. `TestAdd/CART-1` and a parametrised `test_refresh[REQ-2]`
  do cite. The practice's `citePattern` can be widened; the reader does not rewrite names.
- **Go reports a parent test beside its subtests.** `TestAdd` fails when `TestAdd/full` does, and both are results,
  so a failing subtest counts twice in its package. A Jest report lists leaves only. Dropping parents would hide a
  parent's own assertions, so both are kept.
- **Only pytest names a file.** Surefire and Gradle name a Java class, cargo-nextest a crate or test binary, and Go a
  package import path. None of these is a test file's path, and a file cannot be told from them without knowing the
  language's layout (`src/test/java`, Kotlin or Java, which file of a package). They are reduced and counted, so a
  failure is visible, but its citations reach no item until something joins a class or a package to its files.
- **`--base` is a directory.** `csh results import` resolves `--base` to an absolute path, which strips a runner's
  absolute file paths. A Go module path given as a base is cut by `reduceTestResults` itself, but not through the
  command, which leaves import paths as they are; they are not absolute, so the import is not refused.

## What proved wrong or costly in the documents

- The plan read JUnit XML "into `csh-results/v1`" as if the format named files. It names classes; the join to files
  belongs with the test inventory of each language (stage 35), which knows where a class or package lives.
- JUnit has no single schema. Gradle writes a JUnit 5 method as `addsItem()`, nextest writes Rust paths with `::`,
  Surefire records a test that passed on a rerun with `flakyFailure` children, which the reader reads as passed. The reader keeps to what every
  writer shares: `testsuite`, `testcase`, `classname`, `name`, `file`, and the three child elements.

## Effort

About 140 lines of source and 260 lines of tests. Effort was not timed.
