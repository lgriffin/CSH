# F125

The test-file inventory of a source holding a pytest file, a JUnit 5 class, a Go `_test.go` file beside a plain `.go`
file, and a Rust integration test, read by their runners' default conventions with nothing run. pytest collects three
tests: a module-level `test*` function, a parametrised one (counted once), and a method of a `Test*` class; not the
fixture, the helper, or the class that sets `__test__ = False`. JUnit counts the methods annotated `@Test` and
`@ParameterizedTest`. Go counts `TestXxx`, `TestXxx` with its subtests once, `FuzzXxx` and the `ExampleXxx` with an
output comment, but not the example without one, nor `TestXxx` in a file that is not `_test.go`. Rust counts the
`#[test]`, `#[tokio::test]` and `#[rstest]` functions, the case list once. What cites is what the runner reports or
the author attaches to a test: its name, with `_` read as `-` since the pattern `REQ-[0-9]+` holds no underscore and
the runner's prefix dropped (`test_REQ_1_...`, `..._REQ_4`, `FuzzParse_REQ_5`); a docstring's first line, not a later
one (REQ-8); the doc comment lines above a test (REQ-1 in Go and Rust); `@DisplayName` and `@Tag`; a parametrize id;
and a literal `t.Run` name. A helper's or an uncollected test's name cites nothing (REQ-6, REQ-7, REQ-9). Polyglot
code ([12](../../docs/spec/12-polyglot-code.md)), section 4; A-98 and A-128; stage 35.

The expected result was written from the documents before the fixture was first run.
