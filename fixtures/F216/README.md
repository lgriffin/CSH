# F216

The proposal of an Outputs source ([21](../../docs/spec/21-test-suites-as-evidence.md), sections 1 and 2; stage 70).

The subject is a Go checker with a reference tree under `testdata`, and a TypeScript view with a Jest snapshot.

- `Outputs` reads the reference tree's case and its two accepted outputs, the snapshot, and the test file the
  snapshot names. It belongs to the tests practice, beside `Tests`.
- The case `a.ts` is not Code, and the accepted output `a.baseline.md` is not a document.
- `testdata/helper.go` and `testdata/fixtures/lib.d.ts` are test data no suite pairs, so no source reads them.
- Every file of the reference tree, and the snapshot's test file, is read by name. The snapshot is read with its
  content, which stage 71 reads.

The expected result was written from the specification before the code.
