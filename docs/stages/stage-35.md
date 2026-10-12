# Stage 35: Test inventory for pytest, JUnit, Go and Rust

**Exit:** test files in Python, Java, Go and Rust are inventoried as TypeScript's are: one item per file with the
number of tests its runner would collect, and `cites` edges from what the runner reports or the author attaches to
each test ([12](../spec/12-polyglot-code.md), section 4).

**Status:** exit reached on fixtures (`packages/adapter-items/test/tests-polyglot.test.ts`). No profile in this
repository yet has a test source in these languages, so no subject has been read.

## Built

- `adapter-items`: `tests-other.ts`, read by the test-file adapter for `.py`, `.java`, `.go` and `.rs` files. Every
  other file is read as before, and the TypeScript tests pass unchanged ([A-128](../../ASSUMPTIONS.md)).
    - A lexer per language that blanks comments and string contents and keeps both by offset: Python's `#` comments and
      triple-quoted strings, Java's text blocks and character literals, Go's backticked raw strings, Rust's nested
      block comments, raw strings (`r#"..."#`) and character literals told from lifetimes. No parser is added.
    - **Python** (pytest): a function whose name starts `test`, at module level or in a class whose name starts `Test`
      or that names `TestCase` among its bases. A function nested in a function is not one, nor one decorated
      `@pytest.fixture` or `@fixture`, nor any in a class that sets `__test__ = False`, nor in a `Test*` class that
      defines `__init__` (a `TestCase` subclass is collected regardless). Cites: the name, the first
      line with words of the docstring, the string arguments of a `@pytest.mark.<marker>(...)`, and of a `parametrize`
      only `ids=[...]` and `pytest.param(..., id=...)`; the same of a test class that holds a test.
    - **Java** (JUnit 4 and 5): a method annotated `@Test`, `@ParameterizedTest`, `@RepeatedTest` or `@TestFactory`,
      simple or qualified. Cites: the method name, and `@DisplayName`, `@Tag` and `@Tags` strings on the method or an
      enclosing class.
    - **Go** (`_test.go` files only): `TestXxx(t *testing.T)`, `FuzzXxx(f *testing.F)` and an `ExampleXxx()` with an
      `// Output:` comment, each with no result. Cites: the name, and the literal first argument of each `t.Run` on a `*testing.T` of that
      function, nested subtests included.
    - **Rust**: a function with `#[test]`, `#[rstest]` or an attribute whose path ends `::test`. Cites: the name, and
      each `///` or `//!` line immediately above the item or among its attributes, read from the comments the lexer
      kept before blanking them.
    - In a name, an underscore is read as a hyphen (`test_REQ_12_rejects` cites `REQ-12`) only when the identifier
      pattern cannot hold an underscore, and a name is also read without its runner's prefix (`test`, `Test`, `Fuzz`,
      `Example`), so `TestREQ_12` cites `REQ-12`. Whether the pattern can hold an underscore is decided cautiously
      from its text: an underscore, `\w`, a negated class, a dot, an escape by code (`\x5f`, `_`, `\137`, `\cX`)
      or a back reference each turn the mapping off.
    - `skipped` counts `@pytest.mark.skip` and `@unittest.skip`, `@Disabled` and `@Ignore` (on the method or class),
      and Rust's `#[ignore]`.
- Results join as before: a runner's file is matched to a test file item by path, whatever its language. A result
  of a Python, Java, Go or Rust file with no citations of its own has its name read as the inventory reads a test's
  name, so `test_REQ_12` cites `REQ-12` there too; a TypeScript result's name is read as written.

## What the tests revealed

- A Go name like `TestREQ_12` would never cite: after the hyphen mapping it reads `TestREQ-12`, and no word boundary
  stands between `Test` and `REQ`. Reading the name without the runner's prefix as well fixed it, and the same holds
  for `testREQ_24` in JUnit 3 style names.
- Doc comments in Rust are comments, and the lexer blanks them like any other. The lexer now keeps every comment's
  text by offset, which Go's `// Output:` check needed too.
- A Rust test's attributes can hold brackets (`#[case(vec![1, 2])]`) and doc comments between them; walking back from
  `fn` over balanced brackets in blanked code reads both.

## What review revealed

- **Joined results lost their citations.** The inventory read `test_REQ_12` as `REQ-12`, but the join read the
  runner's name as written, so the same test cited `REQ-12` statically and nothing at run time. The join now reads a
  polyglot result's name the same way.
- **pytest collects less than the name suggests.** A fixture named `test_client` is not a test; a class that sets
  `__test__ = False` is not collected; a `Test*` class that defines `__init__` is skipped by pytest with a warning
  (a `unittest.TestCase` subclass is collected regardless). Each was counted, and none is now. A function marked
  with `func.__test__ = False` after its definition is out of scope: it is still counted.
- **A Go function with a result is not a test.** `func TestCheck(t *testing.T) int` was counted; `go test` rejects
  it as a malformed test. A result clause between the parameters and the body now rules it out.
- **The underscore check trusted escapes.** `REQ\x5f[0-9]+` names an underscore by its code, and was taken to hold
  none, so `test_REQ_12` was hyphenated and cited nothing. Any escape by code, and any back reference, now turns the
  mapping off, and the name is read as written.

## What proved wrong or costly in the documents

- The brief said "`def test_*`". pytest's default is the prefix `test`, with no underscore, so `testlogin` is collected
  too; the reader follows pytest.
- A parametrised test, an rstest with cases, a JUnit `@ParameterizedTest` or `@RepeatedTest`, and Go subtests each
  count once: the source declares each once, as `it.each` counts once in TypeScript. Runner results, when joined,
  give the run-time count.
- Benchmarks (`BenchmarkXxx`) are not counted: `go test` does not run them without `-bench`. An example without an
  output comment is compiled and never run, so it is not counted either.

## What remains

- Configured collection (pytest's `python_functions`, `python_classes`, a `testing` import under another name, a
  JUnit custom composed annotation, `#[test_case]`) is not read.
- An identifier inside a camel-case name (`shouldRejectREQ_12`) does not cite: it must start the name, follow the
  runner's prefix, or follow an underscore.

## Effort

About 450 lines of source and 300 lines of tests. Effort was not timed.
