# F222

Go golden files named after a test function ([21](../../docs/spec/21-test-suites-as-evidence.md), section 3; stage 74,
A-269).

- `internal/render/testdata/TestPage.golden` names `TestPage`, and `header.golden` names `TestHeader`, both declared by
  `render_test.go`, the package's test file. `TestFooter.golden` names a function the package's tests do not declare:
  `obsolete-snapshot`.
- The fourslash baselines `completionsBasic1` and `completionsBasic2` are named after `TestCompletionsBasic1` and
  `TestCompletionsBasic2`, which `completions_test.go` declares, a file of another name, as lgriffin/TypeScript's are.
  `completionsGone` names no test function, and stays unpaired.

The expected result was written from the specification before the code.
