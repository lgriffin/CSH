# F211

Go golden siblings ([21](../../docs/spec/21-test-suites-as-evidence.md), section 2; stage 70).

`format/testdata` keeps accepted outputs beside their cases, as `gofmt` and Go analyzers do.

- `simple.golden` accepts `simple.input`, the one sibling with its stem.
- `rules.go.golden` accepts `rules.go`, the sibling with its whole name.
- `TestFormat.golden` has no sibling: it is named after a test, which stage 71 reads. Until then it is unpaired.
- `twice.golden` has two siblings with its stem, `twice.go` and `twice.input`, so it is unpaired too.
- `notes.txt` and `twice.go` are not cases: a golden sibling is found from its output, so a file with no output is
  never reported.

The two unpaired outputs are one `unpaired-outputs` entry for their directory. Both cases with outputs converge.

The expected result was written from the specification before the code.
