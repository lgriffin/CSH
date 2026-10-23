# F210

A reference tree ([21](../../docs/spec/21-test-suites-as-evidence.md), section 2; stage 70).

`testdata/baselines/reference` holds the accepted outputs of three directories, and `testdata/tests/cases` the cases of
two of them, as the TypeScript compiler keeps them.

- `compiler` has five cases. `arrays.ts` accepts `arrays.types`, `arrays.symbols` and the variant
  `arrays(strict=false).js`. `arrays.b.ts` has the longer stem, so it takes `arrays.b.js` and `arrays.b.types` from
  `arrays.ts`. `skipped.ts` has no accepted output: `unaccepted-case`. `twin.ts` and `twin.js` share a stem, so which
  wrote `twin.types` is not decided: `shared-stem`, and neither is a gap. `removed.types` names no case:
  `orphan-output`. Two of its five cases have accepted outputs.
- `conformance` nests its one case three directories deep and keeps its baseline flat. They pair.
- `fourslash` has no namesake case directory, so its baseline is `unpaired-outputs`, and its suite is not converged.

The expected result was written from the specification before the code.
