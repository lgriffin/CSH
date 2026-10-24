# F211

Go golden siblings ([21](../../docs/spec/21-test-suites-as-evidence.md), section 2; stage 70).

`format/testdata` keeps accepted outputs beside their cases, as `gofmt` and Go analyzers do.

- `simple.golden` accepts `simple.input`, the one sibling with its stem.
- `rules.go.golden` accepts `rules.go`, the sibling with its whole name.
- `TestFormat.golden` has no sibling: it is named after the test function `TestFormat` of `format_test.go`, which stage
  74 reads (A-269). Stage 70 left it unpaired.
- `twice.golden` has two siblings with its stem, `twice.go` and `twice.input`, so it is unpaired, and never taken for a
  golden file named after a test.
- `notes.txt` and `twice.go` are not cases: a golden sibling is found from its output, so a file with no output is
  never reported.

The unpaired output is one `unpaired-outputs` entry for its directory. The three cases with outputs converge.

The expected result was written from the specification before the code; stage 74 updated the entries for
`TestFormat.golden`, as its section 3 row for Go says.
